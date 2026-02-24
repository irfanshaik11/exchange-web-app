"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { useUser } from "./UserContext";
import { useWalletTracker } from "./WalletTrackerContext";
import { useQuickBuy } from "./QuickBuyContext";
import AddWalletModal from "./AddWalletModal";
import WalletRow from "./WalletRow";
import ImportExportWalletModal from "./ImportExportWalletModal";
import {
  getTrackedWallets,
  getWalletSolBalance,
  addTrackedWallet,
  type WatchWallet,
  type WalletEvent,
  type TradeEvent,
} from "~/utils/walletTracking";
import { FiSettings, FiBell, FiShare2, FiRss } from "react-icons/fi";
import LiveTradesPanel from "./LiveTradesPanel";
import { executeEnhancedTrade } from "~/utils/enhancedTradeHandler";
import { showEnhancedToast } from "~/utils/enhancedToast";
import type { Wallet } from "~/utils/functions";

const TABS = ["Wallet Manager", "Live Trades"];
const MAX_WALLETS = 500;

const BLOCKVISION_API_KEY = process.env.NEXT_PUBLIC_BLOCKVISION_API_KEY;

const ensureMs = (ts: unknown): number | null => {
  if (typeof ts !== "number" || !Number.isFinite(ts) || ts <= 0) return null;
  // Blockvision returns ms, but be defensive in case it ever returns seconds.
  return ts < 1_000_000_000_000 ? ts * 1000 : ts;
};

const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs = 10_000,
) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
};

export default function WalletTrackerContent() {
  const router = useRouter();
  const { user, walletList, walletBalances, selectedWalletIds } = useUser();
  const {
    wsConnected,
    latestTrades,
    watchedWallets: globalWatchedWallets,
    refreshWatchedWallets,
  } = useWalletTracker();
  const { presets, activePreset } = useQuickBuy();

  // Get chain from router query, default to 'sol'
  const currentChain = (router.query.chain as string) || "sol";
  const selectedChain: "sol" | "monad" =
    currentChain === "monad" || currentChain === "sol" ? currentChain : "sol";

  // Load quickBuyAmount from localStorage with fallback
  const getInitialQuickBuyAmount = () => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("quickBuyAmount");
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 0) {
          return parsed;
        }
      }
    }
    return 0.05;
  };

  const [quickBuyAmount, setQuickBuyAmount] = useState(
    getInitialQuickBuyAmount().toString(),
  );
  const [activeTab, setActiveTab] = useState(0);
  const [showAddWalletModal, setShowAddWalletModal] = useState(false);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [watchedWallets, setWatchedWallets] = useState<WatchWallet[]>([]);
  const [walletEvents, setWalletEvents] = useState<
    Record<string, WalletEvent[]>
  >({});
  const [trackedWalletBalances, setTrackedWalletBalances] = useState<
    Record<string, number>
  >({});
  const [lastActiveMap, setLastActiveMap] = useState<
    Record<string, number | null>
  >({});
  const [isTogglingAllNotifications, setIsTogglingAllNotifications] =
    useState(false);

  // Sync local watchedWallets state with global context
  useEffect(() => {
    setWatchedWallets(globalWatchedWallets);
  }, [globalWatchedWallets]);

  // Load wallets from backend
  const loadWalletsFromBackend = async () => {
    if (!user?.id) return;

    try {
      const trackedWallets = await getTrackedWallets(user.bearerToken, user.id);
      const walletList: Wallet[] = trackedWallets.map((w) => ({
        address: w.address,
        name: w.walletName || "Unnamed Wallet",
        emoji: w.emoji || "👻",
        createdAt: w.createdAt
          ? typeof w.createdAt === "number"
            ? w.createdAt
            : new Date(w.createdAt).getTime()
          : Date.now(),
      }));
      setWallets(walletList);

      // Load balances
      const addresses = walletList.map((w) => w.address);
      const balancePromises = addresses.map(async (address) => {
        try {
          const balance = await getWalletSolBalance(address);
          return { address, balance };
        } catch {
          return { address, balance: 0 };
        }
      });
      const balances = await Promise.all(balancePromises);
      balances.forEach(({ address, balance }) => {
        setTrackedWalletBalances((prev) => ({ ...prev, [address]: balance }));
      });
    } catch (error) {
      console.error("Failed to load wallets:", error);
    }
  };

  useEffect(() => {
    loadWalletsFromBackend();
  }, [user?.id]);

  // Load last active timestamps
  useEffect(() => {
    if (watchedWallets.length === 0) {
      setLastActiveMap({});
      return;
    }

    let cancelled = false;

    const fetchLastActive = async () => {
      try {
        // Group wallets by chain
        const monadWallets = watchedWallets
          .filter((w) => w.chain === "monad")
          .map((w) => w.address);
        const solWallets = watchedWallets
          .filter((w) => w.chain !== "monad")
          .map((w) => w.address);

        console.log("[walletTracker:lastActive] fetching timestamps:", {
          monad: monadWallets.length,
          sol: solWallets.length,
        });

        const map: Record<string, number | null> = {};

        // Fetch Monad wallets using Blockvision API
        if (monadWallets.length > 0) {
          if (!BLOCKVISION_API_KEY) {
            console.warn(
              "[walletTracker:lastActive] BLOCKVISION_API_KEY not set, skipping Monad wallets",
            );
            monadWallets.forEach((addr) => (map[addr] = null));
          } else {
            const monadSettled = await Promise.allSettled(
              monadWallets.map(async (address) => {
                const url = `https://api.blockvision.org/v2/monad/account/transactions?address=${encodeURIComponent(
                  address,
                )}&limit=20&ascendingOrder=false`;

                const resp = await fetchWithTimeout(
                  url,
                  {
                    method: "GET",
                    headers: {
                      accept: "application/json",
                      "x-api-key": BLOCKVISION_API_KEY,
                    },
                  },
                  10_000,
                );

                const text = await resp.text();
                let payload: any = null;
                try {
                  payload = JSON.parse(text);
                } catch {
                  payload = null;
                }

                if (!resp.ok) {
                  const msg =
                    (payload && (payload.message || payload.error)) ||
                    `HTTP ${resp.status} ${resp.statusText}`;
                  throw new Error(msg);
                }

                const newestRaw = payload?.result?.data?.[0]?.timestamp;
                const newest = ensureMs(newestRaw);

                console.log("[walletTracker:lastActive] Monad wallet result", {
                  address,
                  newestRaw,
                  newest,
                  newestIso: newest ? new Date(newest).toISOString() : null,
                  txCount: Array.isArray(payload?.result?.data)
                    ? payload.result.data.length
                    : 0,
                });

                return { address, lastActive: newest };
              }),
            );

            // Check if all failed due to CORS, fallback to proxy
            const allFailed = monadSettled.every(
              (r) => r.status === "rejected",
            );
            const likelyCors = monadSettled.every((r) => {
              if (r.status !== "rejected") return false;
              const msg = r.reason?.message || String(r.reason);
              return /failed to fetch/i.test(msg) || /networkerror/i.test(msg);
            });

            if (allFailed && likelyCors) {
              console.warn(
                "[walletTracker:lastActive] direct Blockvision fetch failed (likely CORS). Falling back to proxy",
              );
              try {
                const proxyResp = await fetch(
                  "/api/blockvision/monad/last-active",
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ wallets: monadWallets, limit: 20 }),
                  },
                );
                const proxyPayload = await proxyResp.json().catch(() => null);
                if (
                  proxyResp.ok &&
                  proxyPayload?.ok === true &&
                  Array.isArray(proxyPayload?.data)
                ) {
                  for (const item of proxyPayload.data) {
                    if (!item?.wallet) continue;
                    map[item.wallet] =
                      typeof item.lastActive === "number"
                        ? item.lastActive
                        : null;
                  }
                }
              } catch (proxyError) {
                console.error(
                  "[walletTracker:lastActive] Proxy fallback failed:",
                  proxyError,
                );
              }
            } else {
              monadSettled.forEach((res, idx) => {
                const address = monadWallets[idx];
                if (res.status === "fulfilled") {
                  map[address] = res.value.lastActive;
                } else {
                  map[address] = null;
                  console.warn(
                    "[walletTracker:lastActive] Monad wallet fetch failed",
                    {
                      address,
                      error: res.reason?.message || String(res.reason),
                    },
                  );
                }
              });
            }

            // Set null for any Monad wallets not in map
            monadWallets.forEach((addr) => {
              if (!(addr in map)) map[addr] = null;
            });
          }
        }

        // Fetch Solana wallets using backend API
        if (solWallets.length > 0) {
          try {
            const { getWalletsLastActive } = await import(
              "~/utils/walletTracking"
            );
            const solResults = await getWalletsLastActive(solWallets, "sol");

            for (const result of solResults) {
              map[result.wallet] = result.lastActive;
            }

            // Set null for any Solana wallets not in results
            solWallets.forEach((addr) => {
              if (!(addr in map)) map[addr] = null;
            });
          } catch (error) {
            console.error(
              "[walletTracker:lastActive] Failed to fetch Solana last active:",
              error,
            );
            solWallets.forEach((addr) => (map[addr] = null));
          }
        }

        if (!cancelled) {
          setLastActiveMap(map);
        }
      } catch (error) {
        console.error("Failed to fetch last active timestamps:", error);
        if (!cancelled) {
          // Initialize with null values on error
          const errorMap: Record<string, number | null> = {};
          watchedWallets.forEach((wallet) => {
            errorMap[wallet.address] = null;
          });
          setLastActiveMap(errorMap);
        }
      }
    };

    fetchLastActive();

    return () => {
      cancelled = true;
    };
  }, [watchedWallets]);

  const handleRemoveWallet = async (address: string | "all") => {
    if (!user?.id) return;

    try {
      const { removeTrackedWallet } = await import("~/utils/walletTracking");
      if (address === "all") {
        for (const wallet of watchedWallets) {
          try {
            await removeTrackedWallet(
              wallet.address,
              user.id,
              undefined,
              user.bearerToken,
            );
          } catch (error) {
            console.error(`Failed to remove wallet ${wallet.address}:`, error);
          }
        }
      } else {
        await removeTrackedWallet(
          address,
          user.id,
          undefined,
          user.bearerToken,
        );
      }

      await refreshWatchedWallets();
      await loadWalletsFromBackend();
    } catch (error) {
      console.error("Failed to remove wallet:", error);
    }
  };

  const handleOpenAddWalletModal = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    try {
      setShowAddWalletModal(true);
    } catch (error) {
      console.error("Error opening add wallet modal:", error);
    }
  };

  const handleAddWallet = async (
    address: string,
    name: string,
    emoji?: string,
    chain?: "sol" | "monad",
  ) => {
    try {
      // Add to backend with notifications enabled by default
      await addTrackedWallet(
        address,
        name,
        user?.id,
        emoji,
        true,
        chain || "sol",
        user?.bearerToken,
      );

      // Save notification preference to localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem(
          `wallet_notifications_${address}`,
          JSON.stringify(true),
        );
      }

      // Reload from backend (this will also refresh global watched wallets)
      await loadWalletsFromBackend();
      await refreshWatchedWallets();

      setShowAddWalletModal(false);

      showEnhancedToast("success", "Wallet added!", {
        title: "Success",
      });
    } catch (error: any) {
      const message = error?.message || "Failed to add wallet";
      showEnhancedToast("error", message, {
        title: "Error",
      });
    }
  };

  const handleExportAddresses = () => {
    const walletsData = wallets.map((w) => ({
      name: w.name || "Unnamed Wallet",
      emoji: w.emoji || "👻",
      address: w.address,
    }));
    const jsonString = JSON.stringify(walletsData, null, 2);
    navigator.clipboard.writeText(jsonString);
  };

  const handleToggleAllNotifications = async () => {
    if (!user?.id || isTogglingAllNotifications) return;

    setIsTogglingAllNotifications(true);
    const allEnabled =
      watchedWallets.length > 0 &&
      watchedWallets.every((w) => w.notificationsEnabled);

    try {
      const { toggleWalletNotifications } = await import(
        "~/utils/walletTracking"
      );
      for (const wallet of watchedWallets) {
        await toggleWalletNotifications(
          wallet.address,
          !allEnabled,
          user.id,
          undefined,
          user.bearerToken,
        );
      }
      await refreshWatchedWallets();
    } catch (error) {
      console.error("Failed to toggle notifications:", error);
    } finally {
      setIsTogglingAllNotifications(false);
    }
  };

  const allNotificationsEnabled =
    watchedWallets.length > 0 &&
    watchedWallets.every((w) => w.notificationsEnabled);

  // Filter wallets based on search term
  const filteredWallets = wallets.filter(
    (wallet) =>
      wallet.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wallet.address.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Filter live trades to only show trades from currently watched wallets
  const watchedWalletAddresses = new Set(watchedWallets.map((w) => w.address));
  const filteredLatestTrades = latestTrades.filter((trade) =>
    watchedWalletAddresses.has(trade.wallet),
  );

  // Quick buy handler (metadata is managed inside LiveTradesPanel)
  const handleQuickBuy = async (trade: TradeEvent) => {
    if (!user?.bearerToken || !user?.id) {
      showEnhancedToast("warning", "Please connect your wallet to trade", {
        title: "Authentication Required",
      });
      return;
    }

    const buyAmount = parseFloat(quickBuyAmount);
    if (isNaN(buyAmount) || buyAmount <= 0) {
      showEnhancedToast(
        "warning",
        "Please enter a valid SOL amount (minimum 0.001 SOL)",
        {
          title: "Invalid Amount",
        },
      );
      return;
    }

    const preset = presets[activePreset];
    if (!preset) {
      showEnhancedToast("error", "Quick buy preset not configured", {
        title: "Configuration Error",
      });
      return;
    }

    const settings = preset.quickBuySettings;

    const token = {
      mint: trade.mint,
      pair_address: trade.pair_address || trade.mint,
      symbol: trade.symbol || "UNKNOWN",
      name: trade.name || "Unknown Token",
      image: null,
      launchpad_protocol: null,
      market_cap_usd: trade.market_cap_usd || null,
    } as any;

    await executeEnhancedTrade({
      token,
      amount: buyAmount,
      side: "buy",
      settings,
      user: { bearerToken: user.bearerToken, id: user.id },
      solBalance: 0,
      solPriceUsd: 150,
      walletContext: {
        selectedWalletIds: selectedWalletIds?.sol || [],
        walletList: walletList || [],
        walletBalances: walletBalances || {},
        chain: selectedChain,
      },
      onSuccess: () => {
        console.log("Quick Buy successful");
      },
      onError: (error) => {
        console.error("Quick Buy failed:", error);
      },
    });
  };

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center">
          <p className="mb-4 text-sm text-neutral-400">
            You are not logged in to Interstate
          </p>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full border border-neutral-600 px-6 py-1.5 text-xs font-medium text-neutral-100 transition-colors duration-200 hover:border-neutral-400 hover:bg-neutral-800/60"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const event = new CustomEvent("open-login-modal");
              window.dispatchEvent(event);
            }}
          >
            Log in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#050608] px-2 sm:px-4">
      {/* HEADER BAR */}
      <div className="flex flex-shrink-0 flex-col flex-wrap items-stretch gap-2 border-b border-neutral-800/60 py-2 sm:flex-row sm:items-center sm:gap-4">
        {/* Left: tabs + wallet count */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              type="button"
              className={`cursor-pointer rounded-lg px-1.5 py-1 text-[10px] whitespace-nowrap transition-all duration-300 sm:px-2 sm:text-xs ${
                activeTab === i
                  ? "bg-[#111111] font-medium text-white"
                  : "font-medium text-neutral-400 hover:bg-[#141414] hover:text-white"
              }`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveTab(i);
              }}
            >
              {tab}
              {tab === "Live Trades" && (
                <span className="ml-0.5 animate-pulse text-xs text-pink-400 sm:ml-1 sm:text-sm">
                  •
                </span>
              )}
            </button>
          ))}
          <div className="flex items-center rounded-full bg-[#111111] px-2 py-0.5 text-[10px] text-neutral-300 sm:px-3 sm:py-1 sm:text-[11px]">
            <span className="font-medium text-white">
              {watchedWallets.length}
            </span>
            <span className="ml-0.5 hidden text-neutral-400 sm:ml-1 sm:inline">
              /{MAX_WALLETS} wallet
              {watchedWallets.length === 1 ? "" : "s"}
            </span>
            <span className="ml-0.5 text-neutral-400 sm:ml-1 sm:hidden">
              /{MAX_WALLETS}
            </span>
          </div>
        </div>

        {/* Middle: search bar */}
        <div className="flex min-w-0 flex-1 justify-start">
          <input
            type="text"
            placeholder="Search by address"
            className="w-full max-w-md rounded-full border border-neutral-800 bg-[#050608] px-3 py-1 text-[10px] text-neutral-200 transition-all duration-300 focus:border-[#70E0B0]/60 focus:outline-none sm:px-4 sm:text-xs"
            disabled={activeTab === 1}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Right: actions */}
        <div className="flex flex-wrap items-center gap-1 sm:gap-2">
          {activeTab === 0 && (
            <>
              <button
                type="button"
                className="rounded-full bg-[#111111] px-2 py-1 text-[10px] font-semibold whitespace-nowrap text-white transition-all duration-300 hover:bg-[#181818] sm:px-4 sm:text-xs"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowImportModal(true);
                }}
              >
                Import
              </button>
              <button
                type="button"
                className="rounded-full bg-[#111111] px-2 py-1 text-[10px] font-semibold whitespace-nowrap text-white transition-all duration-300 hover:bg-[#181818] sm:px-4 sm:text-xs"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleExportAddresses();
                }}
              >
                Export
              </button>

              <button
                className="hidden h-7 w-7 items-center justify-center rounded-full bg-[#111111] text-sm text-neutral-400 transition-all duration-300 hover:bg-[#181818] hover:text-white sm:flex sm:h-8 sm:w-8"
                type="button"
              >
                <FiSettings className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
              <button
                className={`flex h-7 w-7 items-center justify-center rounded-full bg-[#111111] transition-all duration-300 hover:bg-[#181818] sm:h-8 sm:w-8 ${isTogglingAllNotifications ? "cursor-wait opacity-50" : "cursor-pointer"}`}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleToggleAllNotifications();
                }}
                disabled={isTogglingAllNotifications}
                title={
                  isTogglingAllNotifications
                    ? "Toggling..."
                    : allNotificationsEnabled
                      ? "Disable all notifications"
                      : "Enable all notifications"
                }
              >
                <FiBell
                  className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${allNotificationsEnabled ? "text-pink-500" : "text-neutral-600"}`}
                />
              </button>
              <button
                className="hidden h-7 w-7 items-center justify-center rounded-full bg-[#111111] text-sm text-neutral-400 transition-all duration-300 hover:bg-[#181818] hover:text-white sm:flex sm:h-8 sm:w-8"
                type="button"
              >
                <FiShare2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
              <button
                className="hidden h-7 w-7 items-center justify-center rounded-full bg-[#111111] text-sm text-neutral-400 transition-all duration-300 hover:bg-[#181818] hover:text-white sm:flex sm:h-8 sm:w-8"
                type="button"
              >
                <FiRss className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>

              <button
                type="button"
                className="rounded-full px-2 py-1 text-[10px] font-semibold whitespace-nowrap transition-all duration-300 sm:px-4 sm:text-xs"
                style={{
                  backgroundColor: "#70E0B0",
                  color: "#000000",
                  border: "none",
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleOpenAddWalletModal(e);
                }}
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

      {/* Content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {activeTab === 0 ? (
          <>
            {wallets.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center">
                <span className="text-neutral-400">No wallets added yet.</span>
              </div>
            ) : (
              <div className="scrollbar-hide flex-1 overflow-auto">
                <table className="w-full min-w-[500px] text-[10px] sm:min-w-[640px] sm:text-xs">
                  <thead className="sticky top-0 z-10 bg-[#050608]">
                    <tr className="border-b border-neutral-800/60">
                      <th className="px-2 py-2">
                        <div className="flex w-full items-center gap-4">
                          <span className="flex w-28 justify-center text-[10px] font-medium text-neutral-400 sm:text-xs">
                            Created
                          </span>
                          <span className="min-w-0 flex-1 text-[10px] font-medium text-neutral-400 sm:text-xs">
                            Name
                          </span>
                          <span className="w-36 text-[10px] font-medium text-neutral-400 sm:text-xs">
                            Balance
                          </span>
                          <span className="hidden w-28 justify-center text-[10px] font-medium text-neutral-400 sm:flex sm:text-xs">
                            Last Active
                          </span>
                          <div className="flex flex-1 items-center justify-end">
                            <button
                              type="button"
                              className="text-[10px] font-semibold whitespace-nowrap text-red-400 transition-colors duration-300 hover:text-red-300 sm:text-xs"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleRemoveWallet("all");
                              }}
                            >
                              Remove All
                            </button>
                          </div>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWallets.map((wallet) => {
                      const watched = watchedWallets.find(
                        (ww) => ww.address === wallet.address,
                      );
                      const events = walletEvents[wallet.address] || [];
                      const balance = trackedWalletBalances[wallet.address];
                      return (
                        <WalletRow
                          key={wallet.address}
                          wallet={wallet}
                          watchedWallet={watched}
                          events={events}
                          balance={balance}
                          lastActive={lastActiveMap[wallet.address]}
                          onRemove={handleRemoveWallet}
                          onClick={(wallet) => {
                            const chain =
                              watched?.chain ??
                              (wallet.address.startsWith("0x")
                                ? "monad"
                                : "sol");
                            const url =
                              chain === "sol"
                                ? `https://solscan.io/account/${wallet.address}`
                                : `https://monadvision.com/address/${wallet.address}`;
                            window.open(url, "_blank");
                          }}
                          onNotificationToggle={async (address, enabled) => {
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
          <LiveTradesPanel
            trades={filteredLatestTrades}
            wallets={wallets}
            wsConnected={wsConnected}
            quickBuyAmount={quickBuyAmount}
            onQuickBuy={handleQuickBuy}
          />
        )}
      </div>

      {/* Modals */}
      <AddWalletModal
        isOpen={showAddWalletModal}
        onClose={() => {
          setShowAddWalletModal(false);
          loadWalletsFromBackend();
          refreshWatchedWallets();
        }}
        onAddWallet={handleAddWallet}
        chain={selectedChain}
      />
      <ImportExportWalletModal
        mode="import"
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={async (imported, onProgress) => {
          await loadWalletsFromBackend();
          await refreshWatchedWallets();
        }}
      />
    </div>
  );
}
