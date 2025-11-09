import React, { useState, useEffect, useRef } from "react";
import Head from "next/head";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { getActivePositionsByUser } from "~/utils/functions";
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
import {
  addTrackedTwitterAccount,
  removeTrackedTwitterAccount,
  getTrackedTwitterAccounts,
  getTwitterFeed,
  getUserTweets,
  type TwitterAccount,
  type Tweet,
} from "~/utils/twitterTracking";
import { useUser } from "../components/UserContext";
import { useWalletTracker } from "../components/WalletTrackerContext";
import { batchFetchTokenMetadata } from "~/utils/tokenMetadata";
import AddTwitterHandleModal from "../components/AddTwitterHandleModal";
import TwitterAccountRow from "../components/TwitterAccountRow";

const TABS = ["Wallet Manager", "Live Trades"];
const TWITTER_TABS = ["Tracked Accounts", "X Feed"];
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

const MAX_WALLETS = 100;
const WALLET_LIMIT_MESSAGE = `You can add up to ${MAX_WALLETS} wallets.`;

export default function TrackersPage() {
  const { user } = useUser();
  const {
    wsConnected,
    latestTrades,
    watchedWallets: globalWatchedWallets,
    refreshWatchedWallets,
  } = useWalletTracker();
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
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMainTab, setMobileMainTab] = useState<"wallets" | "twitter">(
    "wallets",
  );
  const [watchedWallets, setWatchedWallets] = useState<WatchWallet[]>([]);
  const [walletEvents, setWalletEvents] = useState<
    Record<string, WalletEvent[]>
  >({});
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>(
    {},
  );
  const walletsRef = useRef<Wallet[]>([]);
  const [tokenMetadata, setTokenMetadata] = useState<
    Map<string, { symbol: string | null; name: string | null }>
  >(new Map());

  const normalizeAddress = (address: string | null | undefined) =>
    (address ?? "").trim().toLowerCase();
  const shortenAddress = (address: string) => {
    const trimmed = address.trim();
    if (trimmed.length <= 10) return trimmed;
    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
  };

  const showToastMessage = (message: string, duration = 3000) => {
    setToast(message);
    setTimeout(() => setToast(""), duration);
  };

  const showWalletLimitToast = () => {
    showToastMessage(WALLET_LIMIT_MESSAGE);
  };

  // Twitter state
  const [showAddTwitterModal, setShowAddTwitterModal] = useState(false);
  const [twitterAccounts, setTwitterAccounts] = useState<TwitterAccount[]>([]);
  const [twitterFeed, setTwitterFeed] = useState<Tweet[]>([]);
  const [twitterTab, setTwitterTab] = useState(0);
  const [loadingTwitterFeed, setLoadingTwitterFeed] = useState(false);
  const [selectedTwitterUser, setSelectedTwitterUser] = useState<string | null>(
    null,
  );
  const isAtWalletLimit = watchedWallets.length >= MAX_WALLETS;
  const showWalletSection = !isMobile || mobileMainTab === "wallets";
  const showTwitterSection = !isMobile || mobileMainTab === "twitter";

  // Keep walletsRef in sync with wallets state
  useEffect(() => {
    walletsRef.current = wallets;
  }, [wallets]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      const currentlyMobile = window.innerWidth < 1024;
      setIsMobile(currentlyMobile);
      if (!currentlyMobile) {
        setMobileMainTab("wallets");
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Load wallets when user changes or page loads
  useEffect(() => {
    loadWalletsFromBackend();
  }, [user?.id]);

  // Load Twitter accounts on mount
  useEffect(() => {
    loadTwitterAccounts();
  }, [user?.id]);

  // Load Twitter feed when accounts change or tab changes
  useEffect(() => {
    if (twitterTab === 1 && twitterAccounts.length > 0) {
      loadTwitterFeed();
    }
  }, [twitterTab, twitterAccounts]);

  // Add mock live trades data (currently commented out)
  // useEffect(() => {
  //   const mockTrades: TradeEvent[] = [/* mock data removed */];
  //   setLatestTrades(mockTrades);
  // }, []);

  const loadWalletsFromBackend = async () => {
    try {
      if (!user?.id) {
        setWatchedWallets([]);
        setWallets([]);
        setWalletBalances({});
        return;
      }

      // Fetch wallets from backend
      const tracked = await getTrackedWallets(user?.id);

      // Also refresh global watched wallets
      await refreshWatchedWallets();

      const allWallets = tracked;
      setWatchedWallets(allWallets);

      // Convert backend wallets to frontend format
      const frontendWallets: Wallet[] = allWallets.map((w) => ({
        address: w.address,
        name: w.walletName || w.address.slice(0, 8),
        createdAt: new Date(w.createdAt).getTime(),
        emoji: w.emoji || EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
      }));

      setWallets(frontendWallets);

      // Fetch real balances for tracked wallets
      allWallets.forEach(async (wallet) => {
        const balance = await getWalletSolBalance(wallet.address);
        if (balance !== null) {
          setWalletBalances((prev) => ({ ...prev, [wallet.address]: balance }));
        }
      });
    } catch (error) {
      console.error("Failed to load wallets:", error);
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
      .filter((trade) => trade.mint && !trade.symbol)
      .map((trade) => trade.mint)
      .filter((mint, idx, arr) => arr.indexOf(mint) === idx); // unique

    if (mintsToFetch.length === 0) {
      console.log("[Live Trades] No mints to fetch, all trades have symbols");
      return;
    }

    console.log("[Live Trades] Fetching metadata for tokens:", mintsToFetch);

    batchFetchTokenMetadata(mintsToFetch)
      .then((metadata) => {
        console.log(
          "[Live Trades] Successfully fetched metadata:",
          Object.fromEntries(metadata),
        );
        setTokenMetadata((prev) => {
          const updated = new Map(prev);
          metadata.forEach((value, key) => {
            updated.set(key, value);
          });
          return updated;
        });
      })
      .catch((err) => {
        console.error("[Live Trades] Error fetching token metadata:", err);
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

  const handleAddWallet = async (
    address: string,
    name: string,
    emoji?: string,
  ) => {
    if (isAtWalletLimit) {
      showWalletLimitToast();
      return;
    }

    try {
      // Add to backend
      await addTrackedWallet(address, name, user?.id, emoji);

      // Reload from backend (this will also refresh global watched wallets)
      await loadWalletsFromBackend();

      setShowAddWalletModal(false);

      showToastMessage("Wallet added!");
    } catch (error: any) {
      const message = error?.message || "Failed to add wallet";
      showToastMessage(message);
    }
  };

  const handleOpenAddWalletModal = () => {
    if (isAtWalletLimit) {
      showWalletLimitToast();
      return;
    }
    setShowAddWalletModal(true);
  };

  const handleRemoveWallet = async (addressToRemove: string) => {
    try {
      if (addressToRemove === "all") {
        // Remove all wallets
        await Promise.all(
          wallets.map((w) => removeTrackedWallet(w.address, user?.id)),
        );
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

  // Twitter functions
  const loadTwitterAccounts = async () => {
    const accounts = await getTrackedTwitterAccounts(user?.id);
    setTwitterAccounts(accounts);
  };

  const handleAddTwitterAccount = async (username: string) => {
    try {
      await addTrackedTwitterAccount(username, user?.id);
      await loadTwitterAccounts();
      setToast(`Added @${username}`);
      setTimeout(() => setToast(""), 3000);
    } catch (error: any) {
      setToast(error.message || "Failed to add Twitter account");
      setTimeout(() => setToast(""), 3000);
      throw error;
    }
  };

  const handleRemoveTwitterAccount = async (username: string) => {
    try {
      await removeTrackedTwitterAccount(username, user?.id);
      await loadTwitterAccounts();
      setToast(`Removed @${username}`);
      setTimeout(() => setToast(""), 3000);
    } catch (error: any) {
      setToast(error.message || "Failed to remove Twitter account");
      setTimeout(() => setToast(""), 3000);
    }
  };

  const loadTwitterFeed = async () => {
    setLoadingTwitterFeed(true);
    try {
      let tweets: Tweet[] = [];

      if (selectedTwitterUser) {
        // Load tweets from specific user
        tweets = await getUserTweets(selectedTwitterUser, 20);
      } else {
        // Load tweets from all tracked accounts
        const usernames = twitterAccounts.map((acc) => acc.username);
        tweets = await getTwitterFeed(usernames, 20);
      }

      setTwitterFeed(tweets);
    } catch (error) {
      console.error("Error loading Twitter feed:", error);
      setToast("Failed to load Twitter feed");
      setTimeout(() => setToast(""), 3000);
    } finally {
      setLoadingTwitterFeed(false);
    }
  };

  const handleViewTwitterProfile = (username: string) => {
    setSelectedTwitterUser(username === selectedTwitterUser ? null : username);
    setTwitterTab(1); // Switch to X Feed tab
  };

  // Reload Twitter feed when selected user changes
  useEffect(() => {
    if (twitterTab === 1) {
      loadTwitterFeed();
    }
  }, [selectedTwitterUser]);

  // Export: copy wallet data (name, emoji, and address) to clipboard as JSON
  const handleExportAddresses = () => {
    const walletsData = wallets.map((w) => ({
      name: w.name || "Unnamed Wallet",
      emoji: w.emoji || "👻",
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
          const transformedWallets = imported.map((wallet: any) => {
            if (wallet?.trackedWalletAddress) {
              return {
                address: wallet.trackedWalletAddress,
                name: wallet.name || "Imported Wallet",
              };
            }
            return {
              address: wallet?.address,
              name: wallet?.name || "Imported Wallet",
            };
          });

          const existingAddresses = new Set(
            watchedWallets
              .map((wallet) => normalizeAddress(wallet.address))
              .filter(Boolean),
          );
          const batchAddresses = new Set<string>();
          const duplicateExisting: string[] = [];
          const duplicateWithinImport: string[] = [];
          const invalidWallets: string[] = [];
          const walletsToAdd: { address: string; name: string }[] = [];

          transformedWallets.forEach(
            (wallet: { address: string; name: string }) => {
              const normalized = normalizeAddress(wallet.address);
              if (!normalized) {
                invalidWallets.push(wallet.address);
                return;
              }
              if (existingAddresses.has(normalized)) {
                duplicateExisting.push(wallet.address);
                return;
              }
              if (batchAddresses.has(normalized)) {
                duplicateWithinImport.push(wallet.address);
                return;
              }
              batchAddresses.add(normalized);
              walletsToAdd.push(wallet);
            },
          );

          const availableSlots = MAX_WALLETS - watchedWallets.length;
          if (walletsToAdd.length > availableSlots) {
            alert(
              availableSlots > 0
                ? `You can only add ${availableSlots} more wallet${availableSlots === 1 ? "" : "s"}. Remove some before importing.`
                : `You have reached the limit of ${MAX_WALLETS} wallets. Remove some before importing.`,
            );
            return;
          }

          let successCount = 0;
          let errorCount = 0;

          for (const wallet of walletsToAdd) {
            try {
              await addTrackedWallet(wallet.address, wallet.name, user?.id);
              successCount++;
            } catch (error: any) {
              if (error.message?.includes("already exists")) {
                duplicateExisting.push(wallet.address);
              } else {
                console.error(`Failed to import ${wallet.address}:`, error);
                errorCount++;
              }
            }
          }

          await loadWalletsFromBackend();

          const messageParts: string[] = [];
          if (successCount > 0) {
            messageParts.push(
              `Imported ${successCount} wallet${successCount === 1 ? "" : "s"}`,
            );
          }
          if (duplicateExisting.length > 0) {
            messageParts.push(
              `${duplicateExisting.length} already tracked (${duplicateExisting
                .slice(0, 3)
                .map(shortenAddress)
                .join(", ")}${
                duplicateExisting.length > 3
                  ? ` +${duplicateExisting.length - 3}`
                  : ""
              })`,
            );
          }
          if (duplicateWithinImport.length > 0) {
            messageParts.push(
              `${duplicateWithinImport.length} duplicate${duplicateWithinImport.length === 1 ? "" : "s"} in import (${duplicateWithinImport
                .slice(0, 3)
                .map(shortenAddress)
                .join(", ")}${
                duplicateWithinImport.length > 3
                  ? ` +${duplicateWithinImport.length - 3}`
                  : ""
              })`,
            );
          }
          if (invalidWallets.length > 0) {
            messageParts.push(
              `${invalidWallets.length} invalid address${invalidWallets.length === 1 ? "" : "es"}`,
            );
          }
          if (errorCount > 0) {
            messageParts.push(`${errorCount} failed`);
          }

          alert(
            messageParts.length > 0
              ? messageParts.join(". ")
              : "No new wallets were imported.",
          );
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
        <div className="flex min-h-screen flex-col bg-[#050608] text-neutral-100">
          <Header />
          <div className="w-full flex-grow">
            {/* Main Content Area: Two Columns */}
            <div className="flex h-full flex-col gap-4 px-4 lg:flex-row">
              {isMobile && (
                <div className="mt-4 flex w-full rounded-full bg-[#111111] p-1 text-xs font-medium text-neutral-400">
                  <button
                    className={`flex-1 rounded-full px-3 py-2 transition-colors duration-200 ${
                      mobileMainTab === "wallets"
                        ? "bg-[#70E0B0] text-neutral-900 font-semibold"
                        : "text-neutral-300 hover:text-white"
                    }`}
                    onClick={() => setMobileMainTab("wallets")}
                  >
                    Wallet Tracker
                  </button>
                  <button
                    className={`flex-1 rounded-full px-3 py-2 transition-colors duration-200 ${
                      mobileMainTab === "twitter"
                        ? "bg-[#70E0B0] text-neutral-900 font-semibold"
                        : "text-neutral-300 hover:text-white"
                    }`}
                    onClick={() => setMobileMainTab("twitter")}
                  >
                    X Tracker
                  </button>
                </div>
              )}
              {showWalletSection && (
                <div
                  className="mt-4 flex h-full min-h-[530px] w-full flex-1 flex-col overflow-hidden border border-neutral-900/80 bg-[#050608] px-4"
                  style={{
                    maxHeight: "calc(100vh - 160px)",
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800/60 py-2">
                    <div className="flex items-center gap-2">
                      {TABS.map((tab, i) => (
                        <button
                          key={tab}
                          className={`cursor-pointer rounded-lg px-2 py-1 text-xs transition-all duration-300 ${
                            activeTab === i
                              ? "bg-[#111111] font-medium text-white"
                              : "font-medium text-neutral-400 hover:bg-[#141414] hover:text-white"
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
                      <div className="flex items-center rounded-full bg-[#111111] px-3 py-1 text-[11px] text-neutral-300">
                        <span className="font-medium text-white">
                          {watchedWallets.length}
                        </span>
                        <span className="ml-1 text-neutral-400">
                          /{MAX_WALLETS} wallet
                          {watchedWallets.length === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1" />
                    <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap">
                      <input
                        type="text"
                        placeholder="Search by name or addr..."
                        className="flex-1 min-w-[200px] rounded-full border border-neutral-800 bg-[#050608] px-4 py-0 text-xs text-neutral-200 transition-all duration-300 focus:border-[#70E0B0]/60 focus:outline-none sm:w-60"
                        disabled={activeTab === 1}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                      {activeTab === 0 && (
                        <>
                          <button
                            className="rounded-full bg-[#111111] px-4 py-1 text-xs font-semibold text-white transition-all duration-300 hover:bg-[#181818]"
                            onClick={() => setShowImportModal(true)}
                          >
                            Import
                          </button>
                          <button
                            className="rounded-full bg-[#111111] px-4 py-1 text-xs font-semibold text-white transition-all duration-300 hover:bg-[#181818]"
                            onClick={handleExportAddresses}
                          >
                            Export
                          </button>
                          <button
                            className="rounded-full px-4 py-1 text-xs font-semibold transition-all duration-300"
                            style={{
                              backgroundColor: "#70E0B0",
                              color: "#000000",
                              border: "none",
                            }}
                            onClick={handleOpenAddWalletModal}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "#58B890";
                              e.currentTarget.style.boxShadow =
                                "0 0 8px rgba(112, 224, 176, 0.3), 0 0 16px rgba(112, 224, 176, 0.15)";
                              e.currentTarget.style.transform = "scale(1.02)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "#70E0B0";
                              e.currentTarget.style.boxShadow = "none";
                              e.currentTarget.style.transform = "scale(1)";
                            }}
                          >
                            Add Wallet
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto min-h-0">
                    {activeTab === 0 ? (
                      <>
                        <div className="flex items-center border-b border-neutral-800/60 p-2">
                          <div className="flex w-full items-center gap-4 text-xs font-medium text-neutral-400">
                            <span className="w-28">Created</span>
                            <span className="min-w-0 flex-1">Name</span>
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
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[640px] text-xs">
                              <tbody>
                                {filteredWallets.map((wallet) => {
                                  const watched = watchedWallets.find(
                                    (ww) => ww.address === wallet.address,
                                  );
                                  const events =
                                    walletEvents[wallet.address] || [];
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
                                      onNotificationToggle={async (
                                        address,
                                        enabled,
                                      ) => {
                                        // Refresh the global watched wallets to sync the state
                                        await refreshWatchedWallets();
                                      }}
                                    />
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
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
                              {wsConnected ? "🟢 Connected" : "🔴 Disconnected"}
                            </span>
                          </div>
                        ) : (
                          <div className="overflow-x-auto overflow-y-auto">
                            <table className="mt-2 w-full min-w-[720px] text-xs">
                              <thead>
                                <tr className="border-b border-neutral-800/60">
                                  <th className="w-20 px-2 py-2 text-left text-sm text-neutral-400">
                                    Time
                                  </th>
                                  <th className="w-24 px-2 py-2 text-left text-sm text-neutral-400">
                                    Wallet
                                  </th>
                                  <th className="w-12 px-2 py-2 text-left text-sm text-neutral-400">
                                    Side
                                  </th>
                                  <th className="w-32 px-2 py-2 text-left text-sm text-neutral-400">
                                    Token
                                  </th>
                                  <th className="w-24 px-2 py-2 text-left text-sm text-neutral-400">
                                    Amount
                                  </th>
                                  <th className="w-24 px-2 py-2 text-left text-sm text-neutral-400">
                                    Price
                                  </th>
                                  <th className="w-20 px-2 py-2 text-left text-sm text-neutral-400">
                                    Venue
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {latestTrades.map((trade, idx) => {
                                  const wallet = wallets.find(
                                    (w) => w.address === trade.wallet,
                                  );
                                  const timeAgo = new Date(
                                    trade.at,
                                  ).toLocaleTimeString();

                                  // Use fetched metadata as fallback
                                  const metadata = tokenMetadata.get(trade.mint);
                                  const displaySymbol =
                                    trade.symbol ||
                                    metadata?.symbol ||
                                    trade.mint.slice(0, 8) + "...";
                                  const displayName =
                                    trade.name || metadata?.name;

                                  // Debug log for first trade
                                  if (idx === 0) {
                                    console.log("[Live Trades Display]", {
                                      mint: trade.mint,
                                      tradeSymbol: trade.symbol,
                                      tradeName: trade.name,
                                      metadata: metadata,
                                      displaySymbol: displaySymbol,
                                      displayName: displayName,
                                      totalMetadata: tokenMetadata.size,
                                    });
                                  }

                                  return (
                                    <tr
                                      key={`${trade.tx}-${idx}`}
                                      className="border-b border-neutral-800/50 transition-colors duration-300 hover:bg-neutral-900/40"
                                    >
                                      <td className="w-20 px-2 py-2 text-neutral-400">
                                        {timeAgo}
                                      </td>
                                      <td className="w-24 px-2 py-2 font-mono">
                                        <span
                                          className="truncate"
                                          title={trade.wallet}
                                        >
                                          {wallet?.emoji || "💼"}{" "}
                                          {wallet?.name ||
                                            trade.wallet.slice(0, 4) + "..."}
                                        </span>
                                      </td>
                                      <td className="w-12 px-2 py-2">
                                        <span
                                          className={`rounded px-1 py-0.5 text-[10px] font-semibold ${
                                            trade.side === "buy"
                                              ? "bg-green-500/20 text-green-400"
                                              : "bg-red-500/20 text-red-400"
                                          }`}
                                        >
                                          {trade.side.toUpperCase()}
                                        </span>
                                      </td>
                                      <td
                                        className="w-32 px-2 py-2 font-mono text-emerald-300"
                                        title={displayName || undefined}
                                      >
                                        {displaySymbol}
                                      </td>
                                      <td className="w-24 px-2 py-2 text-neutral-200">
                                        {trade.amount.toFixed(2)}
                                      </td>
                                      <td className="w-24 px-2 py-2 text-neutral-300">
                                        {trade.price_usd
                                          ? `$${trade.price_usd.toFixed(6)}`
                                          : "-"}
                                      </td>
                                      <td className="w-20 px-2 py-2 text-neutral-400">
                                        {trade.venue || "Unknown"}
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
                </div>
              )}
              {!isMobile && (
                <div
                  className="group relative hidden h-full min-h-[530px] w-1 cursor-ew-resize items-center justify-center transition-colors hover:bg-emerald-400/10 lg:flex"
                  onMouseDown={() => setIsResizing(true)}
                >
                  <div className="absolute h-16 w-1 rounded-full bg-neutral-700 transition-colors group-hover:bg-emerald-400" />
                </div>
              )}
              {showTwitterSection && (
                <div
                  className="mt-4 flex h-full min-h-[530px] w-full flex-col overflow-hidden border border-neutral-900/80 bg-[#050608] px-2"
                  style={
                    isMobile
                      ? {
                          maxHeight: "calc(100vh - 160px)",
                        }
                      : {
                          width: `${sidebarWidth}px`,
                          minWidth: "300px",
                          maxWidth: "800px",
                          maxHeight: "calc(100vh - 160px)",
                        }
                  }
                >
                  {/* Twitter Tabs Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800/60 pt-4 pb-2">
                    <div className="flex gap-2">
                      {TWITTER_TABS.map((tab, i) => (
                        <button
                          key={tab}
                          className={`cursor-pointer rounded-lg px-3 py-1 text-xs transition-all duration-300 ${
                            twitterTab === i
                              ? "bg-[#70E0B0] font-medium text-neutral-900"
                              : "font-medium text-neutral-400 hover:bg-[#141414] hover:text-white"
                          }`}
                          onClick={() => setTwitterTab(i)}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>
                    {twitterTab === 0 && (
                      <button
                        className="cursor-pointer rounded-lg px-3 py-1 text-xs font-semibold text-neutral-900 transition-all duration-300"
                        style={{
                          backgroundColor: "#70E0B0",
                          border: "none",
                        }}
                        onClick={() => setShowAddTwitterModal(true)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "#58B890";
                          e.currentTarget.style.boxShadow =
                            "0 0 8px rgba(112, 224, 176, 0.3), 0 0 16px rgba(112, 224, 176, 0.15)";
                          e.currentTarget.style.transform = "scale(1.02)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "#70E0B0";
                          e.currentTarget.style.boxShadow = "none";
                          e.currentTarget.style.transform = "scale(1)";
                        }}
                      >
                        Add Handle
                      </button>
                    )}
                  </div>

                  {/* Twitter Content */}
                  <div className="flex-1 overflow-y-auto min-h-0">
                    {twitterTab === 0 ? (
                      // Tracked Accounts Tab
                      <>
                        {twitterAccounts.length === 0 ? (
                          <div className="flex h-full flex-col items-center justify-center py-8 text-center">
                            <span className="mb-4 text-neutral-400">
                              No Twitter accounts tracked yet
                            </span>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[520px] text-xs">
                              <thead>
                                <tr className="border-b border-neutral-800/60">
                                  <th className="px-2 py-2 text-left text-sm text-neutral-400">
                                    Account
                                  </th>
                                  <th className="px-2 py-2 text-left text-sm text-neutral-400">
                                    Followers
                                  </th>
                                  <th className="px-2 py-2 text-left text-sm text-neutral-400">
                                    Added
                                  </th>
                                  <th className="px-2 py-2 text-right text-sm text-neutral-400">
                                    Actions
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {twitterAccounts.map((account) => (
                                  <TwitterAccountRow
                                    key={account.id}
                                    account={account}
                                    onRemove={handleRemoveTwitterAccount}
                                    onViewProfile={handleViewTwitterProfile}
                                  />
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    ) : (
                      // X Feed Tab
                      <>
                        {twitterAccounts.length === 0 ? (
                          <div className="flex h-full flex-col items-center justify-center py-8 text-center">
                            <span className="mb-4 text-neutral-400">
                              Add Twitter accounts to see their feed
                            </span>
                          </div>
                        ) : loadingTwitterFeed ? (
                          <div className="flex h-full flex-col items-center justify-center py-8">
                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-400 border-t-transparent" />
                            <span className="mt-4 text-neutral-400">
                              Loading feed...
                            </span>
                          </div>
                        ) : twitterFeed.length === 0 ? (
                          <div className="flex h-full flex-col items-center justify-center py-8 text-center">
                            <span className="text-neutral-400">
                              No tweets found
                            </span>
                          </div>
                        ) : (
                          <div className="space-y-3 p-2">
                            {selectedTwitterUser && (
                              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-500/10 px-3 py-2">
                                <span className="text-xs text-emerald-400">
                                  Showing tweets from @{selectedTwitterUser}
                                </span>
                                <button
                                  onClick={() => setSelectedTwitterUser(null)}
                                  className="text-xs text-neutral-400 hover:text-white"
                                >
                                  Show All
                                </button>
                              </div>
                            )}
                            {twitterFeed.map((tweet) => (
                              <div
                                key={tweet.id}
                                className="rounded-lg border border-neutral-800 bg-[#101010] p-3 transition-all duration-300 hover:border-emerald-400/40 hover:bg-[#141414]"
                              >
                                {/* Tweet Header */}
                                <div className="mb-2 flex items-start gap-2">
                                  {tweet.authorProfileImage ? (
                                    <img
                                      src={tweet.authorProfileImage}
                                      alt={tweet.authorName}
                                      className="h-8 w-8 rounded-full"
                                    />
                                  ) : (
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
                                      {tweet.authorName.charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="truncate text-sm font-semibold text-white">
                                        {tweet.authorName}
                                      </span>
                                      <span className="truncate text-xs text-neutral-400">
                                        @{tweet.authorUsername}
                                      </span>
                                    </div>
                                    <span className="text-xs text-neutral-500">
                                      {new Date(
                                        tweet.createdAt,
                                      ).toLocaleString()}
                                    </span>
                                  </div>
                                </div>

                                {/* Tweet Text */}
                                <p className="mb-2 whitespace-pre-wrap break-words text-sm text-neutral-200">
                                  {tweet.text}
                                </p>

                                {/* Tweet Images */}
                                {tweet.images && tweet.images.length > 0 && (
                                  <div
                                    className="mb-2 grid gap-2"
                                    style={{
                                      gridTemplateColumns:
                                        tweet.images.length === 1
                                          ? "1fr"
                                          : tweet.images.length === 2
                                          ? "1fr 1fr"
                                          : tweet.images.length === 3
                                          ? "1fr 1fr"
                                          : "repeat(2, 1fr)",
                                    }}
                                  >
                                    {tweet.images.map((imageUrl, idx) => (
                                      <img
                                        key={idx}
                                        src={imageUrl}
                                        alt={`Tweet image ${idx + 1}`}
                                        className="h-auto max-h-96 w-full cursor-pointer rounded-lg border border-neutral-700/50 object-cover transition-opacity hover:opacity-90"
                                        onClick={() =>
                                          window.open(imageUrl, "_blank")
                                        }
                                        onError={(e) => {
                                          (
                                            e.target as HTMLImageElement
                                          ).style.display = "none";
                                        }}
                                      />
                                    ))}
                                  </div>
                                )}

                                {/* Tweet Stats */}
                                <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-400">
                                  <span>💬 {tweet.replyCount || 0}</span>
                                  <span>🔁 {tweet.retweetCount || 0}</span>
                                  <span>❤️ {tweet.likeCount || 0}</span>
                                  {tweet.url && (
                                    <a
                                      href={tweet.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="ml-auto text-emerald-400 hover:text-emerald-300"
                                    >
                                      View on X →
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
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
          onImport={async (imported, onProgress) => {
            try {
              // Transform imported wallets to support different formats
              const transformedWallets = imported.map((wallet: any) => {
                // Handle Axiom.trade format
                if (wallet.trackedWalletAddress) {
                  return {
                    address: wallet.trackedWalletAddress,
                    name: wallet.name || "Imported Wallet",
                    emoji:
                      wallet.emoji ||
                      EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
                    createdAt: Date.now(),
                  };
                }
                // Handle standard format - ensure all required fields exist
                return {
                  address: wallet.address,
                  name: wallet.name || "Imported Wallet",
                  emoji:
                    wallet.emoji ||
                    EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
                  createdAt: wallet.createdAt || Date.now(),
                };
              });

              const existingAddresses = new Set(
                watchedWallets
                  .map((wallet) => normalizeAddress(wallet.address))
                  .filter(Boolean),
              );
              const batchAddresses = new Set<string>();
              const duplicateExisting: string[] = [];
              const duplicateWithinImport: string[] = [];
              const invalidWallets: string[] = [];
              const walletsToAdd = transformedWallets.filter((wallet) => {
                const normalized = normalizeAddress(wallet.address);
                if (!normalized) {
                  invalidWallets.push(wallet.address);
                  return false;
                }
                if (existingAddresses.has(normalized)) {
                  duplicateExisting.push(wallet.address);
                  return false;
                }
                if (batchAddresses.has(normalized)) {
                  duplicateWithinImport.push(wallet.address);
                  return false;
                }
                batchAddresses.add(normalized);
                return true;
              });

              const availableSlots = MAX_WALLETS - watchedWallets.length;
              if (walletsToAdd.length > availableSlots) {
                const message =
                  availableSlots > 0
                    ? `You can only add ${availableSlots} more wallet${availableSlots === 1 ? "" : "s"}. Remove some before importing.`
                    : `You have reached the limit of ${MAX_WALLETS} wallets. Remove some before importing.`;
                throw new Error(message);
              }

              // Add each wallet to backend
              let successCount = 0;
              let errorCount = 0;
              const total = walletsToAdd.length;
              let processed = 0;
              if (total === 0) {
                onProgress?.(0, 0);
              } else {
                onProgress?.(0, total);
              }

              for (const wallet of walletsToAdd) {
                try {
                  await addTrackedWallet(
                    wallet.address,
                    wallet.name,
                    user?.id,
                    wallet.emoji,
                  );
                  successCount++;
                } catch (error: any) {
                  if (error.message?.includes("already exists")) {
                    duplicateExisting.push(wallet.address);
                  } else {
                    errorCount++;
                  }
                }
                processed += 1;
                if (total > 0) {
                  onProgress?.(processed, total);
                }
              }

              // Reload from backend
              await loadWalletsFromBackend();

              const messageParts: string[] = [];
              if (successCount > 0) {
                messageParts.push(
                  `Imported ${successCount} wallet${successCount === 1 ? "" : "s"}`,
                );
              }
              if (duplicateExisting.length > 0) {
                messageParts.push(
                  `${duplicateExisting.length} already tracked (${duplicateExisting
                    .slice(0, 3)
                    .map(shortenAddress)
                    .join(", ")}${
                    duplicateExisting.length > 3
                      ? ` +${duplicateExisting.length - 3}`
                      : ""
                  })`,
                );
              }
              if (duplicateWithinImport.length > 0) {
                messageParts.push(
                  `${duplicateWithinImport.length} duplicate${duplicateWithinImport.length === 1 ? "" : "s"} in import (${duplicateWithinImport
                    .slice(0, 3)
                    .map(shortenAddress)
                    .join(", ")}${
                    duplicateWithinImport.length > 3
                      ? ` +${duplicateWithinImport.length - 3}`
                      : ""
                  })`,
                );
              }
              if (invalidWallets.length > 0) {
                messageParts.push(
                  `${invalidWallets.length} invalid address${invalidWallets.length === 1 ? "" : "es"}`,
                );
              }
              if (errorCount > 0) {
                messageParts.push(`${errorCount} failed`);
              }

              const toastMessage =
                messageParts.length > 0
                  ? messageParts.join(". ")
                  : "No new wallets were imported.";

              setToast(toastMessage);
              setTimeout(() => setToast(""), 3000);
            } catch (error) {
              console.error("Import error:", error);
              setToast((error as Error)?.message || "Failed to import wallets");
              setTimeout(() => setToast(""), 3000);
              throw error; // Re-throw so modal can handle it
            }
          }}
          wallets={wallets}
        />
        {toast && (
          <div className="animate-fade-in fixed top-8 left-1/2 z-50 w-fit -translate-x-1/2 rounded-lg border border-emerald-400/50 bg-gradient-to-r from-emerald-500 to-green-500 px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-emerald-400/30">
            {toast}
          </div>
        )}
        {scannedWallet && (
          <WalletScanPanel
            wallet={scannedWallet}
            onClose={() => setScannedWallet(null)}
          />
        )}
        <AddTwitterHandleModal
          isOpen={showAddTwitterModal}
          onClose={() => setShowAddTwitterModal(false)}
          onAddTwitterHandle={handleAddTwitterAccount}
        />

        <Footer />
      </div>
    </>
  );
}
