import React, { useState, useEffect, useRef } from "react";
import Head from "next/head";
import Header from "../components/Header";
import Footer from "../components/Footer";
import {
  getActivePositionsByUser,
} from "~/utils/functions";
import type { PositionRow, Wallet } from "~/utils/functions";
import AddWalletModal from "../components/AddWalletModal";
import WalletRow from "../components/WalletRow";
import ImportExportWalletModal from "../components/ImportExportWalletModal";
import WalletScanPanel from "../components/WalletScanPanel";
import {
  addTrackedWallet,
  removeTrackedWallet,
  getTrackedWallets,
  getWalletHistory,
  getWalletSolBalance,
  type WatchWallet,
  type WalletEvent,
  type TradeEvent,
} from "~/utils/walletTracking";
import { useUser } from "../components/UserContext";
import { useWalletTracker } from "../components/WalletTrackerContext";
import { batchFetchTokenMetadata } from "~/utils/tokenMetadata";

const TABS = ["Wallet Manager", "Live Trades"];
const EMOJIS = [
  "💰",
  "🚀",
  "🦄",
  "🐉",
  "🦊",
  "🐸",
  "🐼",
  "🐧",
  "🦁",
  "🐵",
  "🐻",
  "🐨",
  "🐯",
  "🦕",
  "🦖",
  "🐙",
  "🐳",
  "🐬",
  "🦋",
  "🌟",
  "🔥",
  "🌈",
  "🍀",
  "🍕",
  "🍔",
  "🍣",
  "🍩",
  "🍦",
  "🎲",
  "🎯",
  "🎮",
  "🎸",
  "🎹",
  "🏆",
  "🥇",
  "🥈",
  "🥉",
  "⚡",
  "💎",
  "🧊",
  "🪐",
  "🌌",
  "🌠",
  "🛸",
  "🛰️",
  "🚁",
  "🚢",
  "✈️",
  "🚗",
  "🏎️",
  "🚓",
  "🚑",
  "🚒",
  "🚜",
  "🚲",
  "🛴",
  "🛵",
  "🏍️",
  "🦽",
  "🦼",
  "🛹",
  "🛶",
  "⛵",
  "🚤",
  "🛥️",
  "🚀",
];

export default function TrackersPage() {
  const { user } = useUser();
  const { wsConnected, latestTrades, watchedWallets: globalWatchedWallets, refreshWatchedWallets } = useWalletTracker();
  const [activeTab, setActiveTab] = useState(0);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddWalletModal, setShowAddWalletModal] = useState(false);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [toast, setToast] = useState("");
  const [scannedWallet, setScannedWallet] = useState<Wallet | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(384); // 384px = w-96
  const [isResizing, setIsResizing] = useState(false);
  const [watchedWallets, setWatchedWallets] = useState<WatchWallet[]>([]);
  const [walletEvents, setWalletEvents] = useState<Record<string, WalletEvent[]>>({});
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>({});
  const walletsRef = useRef<Wallet[]>([]);
  const [tokenMetadata, setTokenMetadata] = useState<Map<string, { symbol: string | null; name: string | null }>>(new Map());

  // Keep walletsRef in sync with wallets state
  useEffect(() => {
    walletsRef.current = wallets;
  }, [wallets]);

  // Load wallets when user changes or page loads
  useEffect(() => {
    loadWalletsFromBackend();
  }, [user?.id]);

  // Add mock live trades data (currently commented out)
  // useEffect(() => {
  //   const mockTrades: TradeEvent[] = [/* mock data removed */];
  //   setLatestTrades(mockTrades);
  // }, []);

  const loadWalletsFromBackend = async () => {
    try {
      // Fetch wallets from backend
      const tracked = await getTrackedWallets(user?.id);
      
      // Also refresh global watched wallets
      await refreshWatchedWallets();
      
      // Add mock wallets for testing if no wallets exist
      // const mockWallets = tracked.length === 0 ? [
      //     {
      //       id: 'mock-1',
      //       ownerId: null,
      //       address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      //       walletName: 'Whale Wallet',
      //       createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      //     },
      //     {
      //       id: 'mock-2',
      //       ownerId: null,
      //       address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
      //       walletName: 'Day Trader',
      //       createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      //     },
      //     {
      //       id: 'mock-3',
      //       ownerId: null,
      //       address: 'EhN4wHn2rQq2u1RGGWQCm8P7QCvL3sWpDpQx8vH9vJhZ',
      //       walletName: 'Crypto Arbitrageur',
      //       createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      //     },
      // ] : [];
      
      const allWallets = tracked;
      setWatchedWallets(allWallets);
      
      // Convert backend wallets to frontend format
      const frontendWallets: Wallet[] = allWallets.map(w => ({
        address: w.address,
        name: w.walletName || w.address.slice(0, 8),
        createdAt: new Date(w.createdAt).getTime(),
        emoji: w.emoji || EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
      }));
      
      setWallets(frontendWallets);
      
      // Set mock balances for testing
      // const mockBalances: Record<string, number> = {};
      // frontendWallets.forEach(wallet => {
      //   mockBalances[wallet.address] = Math.random() * 100; // Random balance between 0-100 SOL
      // });
      // setWalletBalances(mockBalances);
      
      // Fetch real balances for tracked wallets
      allWallets.forEach(async (wallet) => {
        const balance = await getWalletSolBalance(wallet.address);
        if (balance !== null) {
          setWalletBalances(prev => ({ ...prev, [wallet.address]: balance }));
        }
      });
    } catch (error) {
      console.error('Failed to load wallets:', error);
    }
  };

  const loadTrackedWallets = loadWalletsFromBackend;

  useEffect(() => {
    if (activeTab === 1) {
      setLoading(true);
      // Use a hardcoded userId for now
      getActivePositionsByUser("demo-user")
        .then(setPositions)
        .finally(() => setLoading(false));
    }
  }, [activeTab]);

  // Sync local watchedWallets state with global context
  useEffect(() => {
    setWatchedWallets(globalWatchedWallets);
  }, [globalWatchedWallets]);

  // Fetch token metadata for live trades
  useEffect(() => {
    if (latestTrades.length === 0) return;
    
    // Extract unique mints that don't have symbol
    const mintsToFetch = latestTrades
      .filter(trade => trade.mint && !trade.symbol)
      .map(trade => trade.mint)
      .filter((mint, idx, arr) => arr.indexOf(mint) === idx); // unique
    
    if (mintsToFetch.length === 0) {
      console.log('[Live Trades] No mints to fetch, all trades have symbols');
      return;
    }
    
    console.log('[Live Trades] Fetching metadata for tokens:', mintsToFetch);
    
    batchFetchTokenMetadata(mintsToFetch)
      .then(metadata => {
        console.log('[Live Trades] Successfully fetched metadata:', Object.fromEntries(metadata));
        setTokenMetadata(prev => {
          const updated = new Map(prev);
          metadata.forEach((value, key) => {
            updated.set(key, value);
          });
          return updated;
        });
      })
      .catch(err => {
        console.error('[Live Trades] Error fetching token metadata:', err);
      });
  }, [latestTrades]);


  // Handle sidebar resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      // Min width 300px, max width 800px
      setSidebarWidth(Math.max(300, Math.min(800, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  const handleAddWallet = async (address: string, name: string, emoji?: string) => {
    try {
      // Add to backend
      await addTrackedWallet(address, name, user?.id, emoji);
      
      // Reload from backend (this will also refresh global watched wallets)
      await loadWalletsFromBackend();
      
      setShowAddWalletModal(false);
      
      setToast("Wallet added!");
      setTimeout(() => setToast(""), 3000);
    } catch (error: any) {
      setToast(error.message || "Failed to add wallet");
      setTimeout(() => setToast(""), 3000);
    }
  };

  const handleRemoveWallet = async (addressToRemove: string) => {
    try {
      if (addressToRemove === "all") {
        // Remove all wallets
        await Promise.all(wallets.map(w => removeTrackedWallet(w.address, user?.id)));
      } else {
        // Remove single wallet
        await removeTrackedWallet(addressToRemove, user?.id);
      }
      
      // Reload from backend (this will also refresh global watched wallets)
      await loadWalletsFromBackend();
      
      setToast("Wallet removed");
      setTimeout(() => setToast(""), 3000);
    } catch (error: any) {
      setToast(error.message || "Failed to remove wallet");
      setTimeout(() => setToast(""), 3000);
    }
  };

  // Helper to format date
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  };

  // Filter wallets based on search term
  const filteredWallets = wallets.filter(
    (wallet) =>
      wallet.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wallet.address.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Export: copy wallet data (name, emoji, and address) to clipboard as JSON
  const handleExportAddresses = () => {
    const walletsData = wallets.map((w) => ({
      name: w.name || 'Unnamed Wallet',
      emoji: w.emoji || '👻',
      address: w.address,
    }));
    const jsonString = JSON.stringify(walletsData, null, 2);
    navigator.clipboard.writeText(jsonString);
    setToast("Wallets copied to clipboard");
    setTimeout(() => setToast(""), 2000);
  };

  // Import wallets from JSON file
  const handleImportWallets = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (Array.isArray(imported)) {
          // Add to backend
          for (const wallet of imported) {
            try {
              await addTrackedWallet(wallet.address, wallet.name, user?.id);
            } catch (error: any) {
              if (!error.message?.includes('already exists')) {
                console.error(`Failed to import ${wallet.address}:`, error);
              }
            }
          }
          // Reload from backend
          await loadWalletsFromBackend();
          alert("Wallets imported successfully!");
        } else {
          alert("Invalid wallet file format.");
        }
      } catch {
        alert("Failed to import wallets.");
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be imported again if needed
    e.target.value = "";
  };

  return (
    <>
      <Head>
        <title>Trackers | Interstate Memeboard</title>
      </Head>
			<div className="mb-20">
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-neutral-100">
        <Header />
        <div className="w-full flex-grow">
          {/* Main Content Area: Two Columns */}
          <div className="flex h-full flex-row">
            {/* Left Column: Wallet Manager / Live Trades Table */}
            <div className="h-full min-h-[530px] flex-1 border border-neutral-800/50 bg-neutral-900/50 px-4 shadow-xl backdrop-blur-sm">
              <div className="flex gap-4 border-b border-neutral-800/50 py-2">
                {TABS.map((tab, i) => (
                  <button
                    key={tab}
                    className={`cursor-pointer rounded-lg px-2 py-1 text-xs transition-all duration-300 ${
                      activeTab === i
                        ? "bg-[#21222B] font-medium text-white"
                        : "font-medium text-neutral-400 hover:bg-neutral-800/50 hover:text-white"
                    }`}
                    onClick={() => setActiveTab(i)}
                  >
                    {tab}
                    {tab === "Live Trades" && (
                      <span className="ml-1 animate-pulse text-sm text-pink-400">
                        •
                      </span>
                    )}
                  </button>
                ))}
                <div className="flex-1" />
                {/* Search and actions */}
                <input
                  type="text"
                  placeholder="Search by name or addr..."
                  className="mr-4 w-60 rounded-full border border-neutral-800 bg-neutral-900/50 px-4 py-0 text-xs text-neutral-200 backdrop-blur-sm transition-all duration-300 focus:border-transparent focus:ring-2 focus:ring-blue-500/50 focus:outline-none"
                  disabled={activeTab === 1}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {activeTab === 0 && (
                  <>
                    <button
                      className="mr-2 rounded-full bg-neutral-800/50 px-4 py-1 text-xs font-semibold text-white backdrop-blur-sm transition-all duration-300 hover:bg-neutral-700"
                      onClick={() => setShowImportModal(true)}
                    >
                      Import
                    </button>
                    <button
                      className="mr-2 rounded-full bg-neutral-800/50 px-4 py-1 text-xs font-semibold text-white backdrop-blur-sm transition-all duration-300 hover:bg-neutral-700"
                      onClick={handleExportAddresses}
                    >
                      Export
                    </button>
                    <button
                      className="rounded-full px-4 py-1 text-xs font-semibold transition-all duration-300"
                      style={{
                        backgroundColor: '#70E0B0',
                        color: '#000000',
                        border: 'none'
                      }}
                      onClick={() => setShowAddWalletModal(true)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#58B890';
                        e.currentTarget.style.boxShadow = '0 0 8px rgba(112, 224, 176, 0.3), 0 0 16px rgba(112, 224, 176, 0.15)';
                        e.currentTarget.style.transform = 'scale(1.02)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#70E0B0';
                        e.currentTarget.style.boxShadow = 'none';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                    >
                      Add Wallet
                    </button>
                  </>
                )}
              </div>
              {activeTab === 0 ? (
                <>
                  <div className="flex items-center border-b border-white/20 p-2">
                    <div className="flex w-full items-center gap-4 text-xs font-medium text-neutral-400">
                      <span className="w-28">Created</span>
                      <span className="flex-1 min-w-0">Name</span>
                      <span className="w-36">Balance</span>
                      <span className="w-40">Actions</span>
                      <span className="w-24 text-right">
                        <button
                          className="whitespace-nowrap text-xs font-semibold text-red-400 transition-colors duration-300 hover:text-red-300"
                          onClick={() => handleRemoveWallet("all")}
                        >
                          Remove All
                        </button>
                      </span>
                    </div>
                  </div>
                  {wallets.length === 0 ? (
                    <div className="flex h-64 flex-col items-center justify-center">
                      <span className="text-neutral-400">
                        No wallets added yet.
                      </span>
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <tbody>
                        {filteredWallets.map((wallet) => {
                          const watched = watchedWallets.find(ww => ww.address === wallet.address);
                          const events = walletEvents[wallet.address] || [];
                          const balance = walletBalances[wallet.address];
                          return (
                            <WalletRow
                              key={wallet.address}
                              wallet={wallet}
                              watchedWallet={watched}
                              events={events}
                              balance={balance}
                              onRemove={handleRemoveWallet}
                              onClick={setScannedWallet}
                              onNotificationToggle={async (address, enabled) => {
                                // Refresh the global watched wallets to sync the state
                                await refreshWatchedWallets();
                              }}
                            />
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </>
              ) : (
                <>
                  {latestTrades.length === 0 ? (
                    <div className="flex h-64 flex-col items-center justify-center">
                      <span className="text-neutral-400">
                        No live trades yet. Add wallets to start tracking!
                      </span>
                      <span className="mt-2 text-xs text-neutral-500">
                        {wsConnected ? '🟢 Connected' : '🔴 Disconnected'}
                      </span>
                    </div>
                  ) : (
                    <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
                      <table className="mt-2 w-full text-xs">
                        <thead>
                          <tr className="border-b border-white/20">
                            <th className="w-20 px-2 py-2 text-left text-sm text-neutral-400">Time</th>
                            <th className="w-24 px-2 py-2 text-left text-sm text-neutral-400">Wallet</th>
                            <th className="w-12 px-2 py-2 text-left text-sm text-neutral-400">Side</th>
                            <th className="w-32 px-2 py-2 text-left text-sm text-neutral-400">Token</th>
                            <th className="w-24 px-2 py-2 text-left text-sm text-neutral-400">Amount</th>
                            <th className="w-24 px-2 py-2 text-left text-sm text-neutral-400">Price</th>
                            <th className="w-20 px-2 py-2 text-left text-sm text-neutral-400">Venue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {latestTrades.map((trade, idx) => {
                            const wallet = wallets.find(w => w.address === trade.wallet);
                            const timeAgo = new Date(trade.at).toLocaleTimeString();
                            
                            // Use fetched metadata as fallback
                            const metadata = tokenMetadata.get(trade.mint);
                            const displaySymbol = trade.symbol || metadata?.symbol || trade.mint.slice(0, 8) + '...';
                            const displayName = trade.name || metadata?.name;
                            
                            // Debug log for first trade
                            if (idx === 0) {
                              console.log('[Live Trades Display]', {
                                mint: trade.mint,
                                tradeSymbol: trade.symbol,
                                tradeName: trade.name,
                                metadata: metadata,
                                displaySymbol: displaySymbol,
                                displayName: displayName,
                                totalMetadata: tokenMetadata.size
                              });
                            }
                            
                            return (
                              <tr
                                key={`${trade.tx}-${idx}`}
                                className="border-b border-neutral-800/50 transition-colors duration-300 hover:bg-neutral-800/30"
                              >
                                <td className="w-20 px-2 py-2 text-neutral-400">
                                  {timeAgo}
                                </td>
                                <td className="w-24 px-2 py-2 font-mono">
                                  <span className="truncate" title={trade.wallet}>
                                    {wallet?.emoji || '💼'} {wallet?.name || trade.wallet.slice(0, 4) + '...'}
                                  </span>
                                </td>
                                <td className="w-12 px-2 py-2">
                                  <span className={`rounded px-1 py-0.5 text-[10px] font-semibold ${
                                    trade.side === 'buy' 
                                      ? 'bg-green-500/20 text-green-400' 
                                      : 'bg-red-500/20 text-red-400'
                                  }`}>
                                    {trade.side.toUpperCase()}
                                  </span>
                                </td>
                                <td className="w-32 px-2 py-2 font-mono text-blue-300" title={displayName || undefined}>
                                  {displaySymbol}
                                </td>
                                <td className="w-24 px-2 py-2 text-neutral-200">
                                  {trade.amount.toFixed(2)}
                                </td>
                                <td className="w-24 px-2 py-2 text-neutral-300">
                                  {trade.price_usd ? `$${trade.price_usd.toFixed(6)}` : '-'}
                                </td>
                                <td className="w-20 px-2 py-2 text-neutral-400">
                                  {trade.venue || 'Unknown'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Resizer Handle */}
            {/* <div
              className="group relative flex h-full min-h-[530px] w-1 cursor-ew-resize items-center justify-center transition-colors hover:bg-blue-500/30"
              onMouseDown={() => setIsResizing(true)}
            >
              <div className="absolute h-16 w-1 rounded-full bg-neutral-700 transition-colors group-hover:bg-blue-500" />
            </div> */}

            {/* Right Column: Twitter Alerts */}
            {/* <div
              className="flex h-full min-h-[530px] flex-col border border-neutral-800/50 bg-neutral-900/50 px-2 shadow-xl backdrop-blur-sm"
              style={{
                width: `${sidebarWidth}px`,
                minWidth: "300px",
                maxWidth: "800px",
              }}
            >
              <div className="mb-4 flex items-center justify-between border-b border-neutral-800/50 pb-4 pt-4">
                <h3 className="text-lg font-semibold text-white">
                  Twitter Alerts
                </h3>
              </div>
              <div className="flex h-full flex-col items-center justify-center py-8 text-center">
                <span className="mb-4 text-neutral-400">
                  Start tracking accounts to see Twitter alerts!
                </span>
                <button className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-800 px-6 py-3 font-semibold text-white shadow-lg shadow-blue-500/20 transition-all duration-300 hover:from-blue-500 hover:to-blue-700">
                  Add Twitter Handles
                </button>
              </div>
            </div> */}
          </div>
        </div>
      </div>
      <AddWalletModal
        isOpen={showAddWalletModal}
        onClose={() => setShowAddWalletModal(false)}
        onAddWallet={handleAddWallet}
      />
      <ImportExportWalletModal
        mode={"import"}
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={async (imported) => {
          try {
            // Transform imported wallets to support different formats
            const transformedWallets = imported.map((wallet: any) => {
              // Handle Axiom.trade format
              if (wallet.trackedWalletAddress) {
                return {
                  address: wallet.trackedWalletAddress,
                  name: wallet.name || 'Imported Wallet',
                  emoji: wallet.emoji || EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
                  createdAt: Date.now(),
                };
              }
              // Handle standard format - ensure all required fields exist
              return {
                address: wallet.address,
                name: wallet.name || 'Imported Wallet',
                emoji: wallet.emoji || EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
                createdAt: wallet.createdAt || Date.now(),
              };
            });
            
            // Add each wallet to backend
            let successCount = 0;
            let errorCount = 0;
            
            for (const wallet of transformedWallets) {
              try {
                await addTrackedWallet(wallet.address, wallet.name, user?.id, wallet.emoji);
                successCount++;
              } catch (error: any) {
                if (error.message?.includes('already exists')) {
                  successCount++;
                } else {
                  errorCount++;
                }
              }
            }
            
            // Reload from backend
            await loadWalletsFromBackend();
            
            setToast(`Imported ${successCount} wallet(s)${errorCount > 0 ? ` (${errorCount} failed)` : ''}`);
            setTimeout(() => setToast(""), 3000);
          } catch (error) {
            console.error('Import error:', error);
            setToast('Failed to import wallets');
            setTimeout(() => setToast(""), 3000);
          }
        }}
        wallets={wallets}
      />
      {toast && (
        <div className="w-fit animate-fade-in fixed top-8 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white border border-blue-400/50 px-6 py-3 text-sm font-semibold shadow-xl shadow-blue-500/30">
          {toast}
        </div>
      )}
      {scannedWallet && (
        <WalletScanPanel
          wallet={scannedWallet}
          onClose={() => setScannedWallet(null)}
        />
      )}

      {/* Bottom Navigation/Footer */}
      {/* <div className="fixed bottom-0 left-0 z-40 flex w-full items-center justify-between border-t border-emerald-950/50 bg-neutral-900/80 px-6 py-3 text-xs backdrop-blur-md">
        <div className="flex gap-6">
          <button className="flex items-center gap-2 font-semibold text-emerald-400 transition-colors duration-300 hover:text-emerald-300">
            <span className="text-lg">📊</span> Wallet Tracker
          </button>
        </div>
        <div className="flex items-center gap-6 text-neutral-400">
          <span className="flex items-center gap-2">
            <span className="text-emerald-400">💰</span> $106.8K
          </span>
          <span className="flex items-center gap-2">
            <span className="text-blue-400">💎</span> $2581
          </span>
          <span className="flex items-center gap-2">
            <span className="text-green-400">💸</span> $152.42
          </span>
          <span className="flex items-center gap-2">
            <span className={wsConnected ? "text-green-400" : "text-red-400"}>🔗</span> 
            {wsConnected ? "Tracker Connected" : "Tracker Disconnected"}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-neutral-400">🌐</span> US-W
          </span>
          <span className="cursor-pointer text-neutral-400 transition-colors duration-300 hover:text-white">
            Docs
          </span>
        </div>
      </div> */}
      <Footer />
			</div>
    </>
  );
}
