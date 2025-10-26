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
  createWalletTrackerWebSocket,
  type WatchWallet,
  type WalletEvent,
  type TradeEvent,
  type WalletTrackerWebSocket,
} from "~/utils/walletTracking";
import { useUser } from "../components/UserContext";

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
  const [latestTrades, setLatestTrades] = useState<TradeEvent[]>([]);
  const [wsConnection, setWsConnection] = useState<WalletTrackerWebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const walletsRef = useRef<Wallet[]>([]);

  // Keep walletsRef in sync with wallets state
  useEffect(() => {
    walletsRef.current = wallets;
  }, [wallets]);

  // Load wallets when user changes or page loads
  useEffect(() => {
    if (user?.id) {
      console.log('🔑 Current User ID:', user.id);
      loadWalletsFromBackend();
    } else {
      setWallets([]);
    }
  }, [user?.id]);

  const loadWalletsFromBackend = async () => {
    try {
      // Fetch wallets from backend
      const tracked = await getTrackedWallets(user?.id);
      setWatchedWallets(tracked);
      
      // Convert backend wallets to frontend format
      const frontendWallets: Wallet[] = tracked.map(w => ({
        address: w.address,
        name: w.walletName || w.address.slice(0, 8),
        createdAt: new Date(w.createdAt).getTime(),
        emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
      }));
      
      setWallets(frontendWallets);
      
      // Fetch balances
      tracked.forEach(async (wallet) => {
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

  // WebSocket connection for real-time wallet updates
  useEffect(() => {
    let connection: WalletTrackerWebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const handleTradeEvent = (event: TradeEvent) => {
      console.log('Trade event received:', event);
      
      // Add to latest trades list (keep last 50)
      setLatestTrades(prev => [event, ...prev].slice(0, 50));
      
      // Show toast notification
      const wallet = walletsRef.current.find(w => w.address === event.wallet);
      const walletName = wallet?.name || event.wallet.slice(0, 4) + '...';
      const side = event.side === 'buy' ? 'bought' : 'sold';
      const token = event.symbol || event.mint.slice(0, 8) + '...';
      setToast(`${walletName} ${side} ${event.amount.toFixed(2)} SOL`);
      setTimeout(() => setToast(""), 3000);
    };

    const handleConnect = () => {
      console.log('WebSocket connected successfully');
      setWsConnected(true);
      
      // Subscribe to all tracked wallets after connection is established
      if (wallets.length > 0 && connection) {
        // Small delay to ensure WebSocket is fully ready
        setTimeout(() => {
          if (connection?.ws.readyState === WebSocket.OPEN) {
            const addresses = wallets.map(w => w.address);
            connection.subscribe(addresses);
            console.log('Subscribed to wallets:', addresses);
          }
        }, 100);
      }
    };

    const handleDisconnect = () => {
      console.log('WebSocket disconnected, will attempt to reconnect...');
      setWsConnected(false);
      
      // Attempt to reconnect after 3 seconds
      reconnectTimeout = setTimeout(() => {
        console.log('Attempting to reconnect WebSocket...');
        initializeWebSocket();
      }, 3000);
    };

    const initializeWebSocket = () => {
      try {
        console.log('Initializing WebSocket connection...');
        connection = createWalletTrackerWebSocket(
          handleTradeEvent,
          handleConnect,
          handleDisconnect
        );
        setWsConnection(connection);
      } catch (error) {
        console.error('Failed to initialize WebSocket:', error);
        setWsConnected(false);
        
        // Retry after 5 seconds
        reconnectTimeout = setTimeout(() => {
          console.log('Retrying WebSocket connection...');
          initializeWebSocket();
        }, 5000);
      }
    };

    // Initialize on mount
    initializeWebSocket();

    return () => {
      console.log('Cleaning up WebSocket connection...');
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (connection) {
        connection.close();
      }
    };
  }, []); // Only run once on mount

  // Subscribe to new wallets when wallet list changes
  useEffect(() => {
    if (wsConnection && wsConnected && wallets.length > 0) {
      // Wait a bit to ensure connection is stable
      const timer = setTimeout(() => {
        if (wsConnection.ws.readyState === WebSocket.OPEN) {
          const addresses = wallets.map(w => w.address);
          wsConnection.subscribe(addresses);
          console.log('Updated wallet subscriptions:', addresses);
        } else {
          console.warn('WebSocket not ready, skipping subscription update');
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [wallets, wsConnection, wsConnected]);

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

  const handleAddWallet = async (address: string, name: string) => {
    try {
      // Add to backend
      await addTrackedWallet(address, name, user?.id);
      
      // Reload from backend
      await loadWalletsFromBackend();
      
      setShowAddWalletModal(false);
      
      // Subscribe to WebSocket
      if (wsConnection && wsConnected) {
        wsConnection.subscribe([address]);
      }
      
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
        
        // Unsubscribe from WebSocket
        if (wsConnection && wsConnected) {
          wsConnection.unsubscribe(wallets.map(w => w.address));
        }
      } else {
        // Remove single wallet
        await removeTrackedWallet(addressToRemove, user?.id);
        
        // Unsubscribe from WebSocket
        if (wsConnection && wsConnected) {
          wsConnection.unsubscribe([addressToRemove]);
        }
      }
      
      // Reload from backend
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

  // Export: copy addresses to clipboard and show toast
  const handleExportAddresses = () => {
    const addresses = wallets.map((w) => w.address).join(", ");
    navigator.clipboard.writeText(addresses);
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
                      className="rounded-full bg-gradient-to-r from-blue-600 to-blue-800 px-4 py-1 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 transition-all duration-300 hover:from-blue-500 hover:to-blue-700"
                      onClick={() => setShowAddWalletModal(true)}
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
                            />
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center border-b border-white/20 py-2">
                    <div className="flex flex-1 gap-4 text-sm text-neutral-400">
                      <span className="w-20">Time</span>
                      <span className="w-24">Wallet</span>
                      <span className="w-12">Side</span>
                      <span className="w-32">Token</span>
                      <span className="w-24">Amount</span>
                      <span className="w-24">Price</span>
                      <span className="w-20">Venue</span>
                    </div>
                  </div>
                  {latestTrades.length === 0 ? (
                    <div className="flex h-64 flex-col items-center justify-center">
                      <span className="mb-2 text-2xl">📊</span>
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
                        <tbody>
                          {latestTrades.map((trade, idx) => {
                            const wallet = wallets.find(w => w.address === trade.wallet);
                            const timeAgo = new Date(trade.at).toLocaleTimeString();
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
                                <td className="w-32 px-2 py-2 font-mono text-blue-300">
                                  {trade.symbol || trade.mint.slice(0, 8) + '...'}
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
            <div
              className="group relative flex h-full min-h-[530px] w-1 cursor-ew-resize items-center justify-center transition-colors hover:bg-blue-500/30"
              onMouseDown={() => setIsResizing(true)}
            >
              <div className="absolute h-16 w-1 rounded-full bg-neutral-700 transition-colors group-hover:bg-blue-500" />
            </div>

            {/* Right Column: Twitter Alerts */}
            <div
              className="flex h-full min-h-[530px] flex-col border border-neutral-800/50 bg-neutral-900/50 px-2 shadow-xl backdrop-blur-sm"
              style={{
                width: `${sidebarWidth}px`,
                minWidth: "300px",
                maxWidth: "800px",
              }}
            >
              <div className="flex gap-4 border-b border-neutral-800/50 py-2">
                {TABS.map((tab, i) => (
                  <button
                    key={tab}
                    className={`cursor-pointer rounded-lg px-2 py-1 text-xs text-nowrap transition-all duration-300 ${
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
                    {/* <button
                      className="rounded-full bg-gradient-to-r from-blue-600 to-blue-800 px-4 py-1 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 transition-all duration-300 hover:from-blue-500 hover:to-blue-700"
                      onClick={() => setShowAddWalletModal(true)}
                    >
                      Add Wallet
                    </button> */}
                  </>
                )}
              </div>
              <div className="mb-4 flex items-center justify-between border-b border-neutral-800/50 pb-4">
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
            </div>
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
                await addTrackedWallet(wallet.address, wallet.name, user?.id);
                successCount++;
                
                // Subscribe to websocket
                if (wsConnection && wsConnected) {
                  wsConnection.subscribe([wallet.address]);
                }
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
        <div className="w-fit animate-fade-in fixed top-8 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-white text-black border border-white/80 px-6 py-3 text-sm shadow-lg">
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
      <div className="fixed bottom-0 left-0 z-40 flex w-full items-center justify-between border-t border-emerald-950/50 bg-neutral-900/80 px-6 py-3 text-xs backdrop-blur-md">
        <div className="flex gap-6">
          <button className="flex items-center gap-2 font-semibold text-emerald-400 transition-colors duration-300 hover:text-emerald-300">
            <span className="text-lg">📊</span> Wallet Tracker
          </button>
          <button className="flex items-center gap-2 font-semibold text-sky-400 transition-colors duration-300 hover:text-sky-300">
            <span className="text-lg">🐦</span> Twitter Tracker
          </button>
          <button className="flex items-center gap-2 font-semibold text-gray-400 transition-colors duration-300 hover:text-gray-300">
            <span className="text-lg">📈</span> PnL Tracker
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
      </div>
      <Footer />
    </>
  );
}
