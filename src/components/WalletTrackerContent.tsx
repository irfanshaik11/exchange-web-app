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
import { HiLightningBolt } from "react-icons/hi";
import { SiSolana } from "react-icons/si";
import { executeEnhancedTrade } from "~/utils/enhancedTradeHandler";
import { showEnhancedToast } from "~/utils/enhancedToast";
import { formatMarketCap } from "~/utils/db";
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

// Normalize asset URLs (IPFS, Arweave, etc.)
function normalizeAssetUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.startsWith("data:")) return s;
  if (s.startsWith("ipfs://")) {
    const cid = s.replace("ipfs://", "").replace(/^ipfs\//, "");
    return `https://cloudflare-ipfs.com/ipfs/${cid}`;
  }
  if (/^ipfs[/:]/i.test(s)) {
    const cid = s.replace(/^ipfs[/:]/i, "");
    return `https://cloudflare-ipfs.com/ipfs/${cid}`;
  }
  if (/^[a-z0-9_-]{40,}$/i.test(s) && !/^https?:\/\//i.test(s)) return `https://arweave.net/${s}`;
  if (s.startsWith("http://")) return s.replace(/^http:\/\//i, "https://");
  if (s.startsWith("https://")) return s;
  return null;
}

// Get protocol icon
function getProtocolIcon(protocol: string): string {
  if (!protocol) return 'https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png';
  if (protocol.includes('pump')) return 'https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png';
  if (protocol.includes('meteora')) return 'https://s1.coincarp.com/logo/1/meteora.png?style=72&v=1759911013';
  if (protocol.includes('raydium')) return 'https://s2.coinmarketcap.com/static/img/coins/64x64/8526.png';
  if (protocol.includes('boop')) return 'https://api.phantom.app/image-proxy/?image=https%3A%2F%2Fdhc7eusqrdwa0.cloudfront.net%2Fassets%2FBOOP_logo_icon_dark_bg.png&anim=true';
  if (protocol.includes('moonit') || protocol.includes('moonshot') || protocol.includes('moonshoot')) return 'https://avatars.githubusercontent.com/u/174132191?s=280&v=4';
  if (protocol.includes('bonk')) return 'https://s3.coinmarketcap.com/static-gravity/image/a28128d9ff7c49c9ad33ee2f626fda40.png';
  if (protocol.includes('bags')) return 'https://play-lh.googleusercontent.com/7AxVcu1pumxavcGTb16WBJQU88CDZd0v8q0WzFwfin7zbBvItYMuNQ0Xkqq4srTw4A=w240-h480-rw';
  if (protocol.includes('launch')) return 'https://s2.coinmarketcap.com/static/img/coins/64x64/8526.png';
  return 'https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png';
}

// Get protocol color
function getProtocolColor(protocol: string): string {
  if (!protocol) return '#22c55e';
  if (protocol.includes('pump')) return '#22c55e';
  if (protocol.includes('meteora')) return '#ff4662';
  if (protocol.includes('raydium')) return '#5c51f7';
  if (protocol.includes('moonit') || protocol.includes('moonshot') || protocol.includes('moonshoot')) return '#eab308';
  if (protocol.includes('boop')) return '#134577';
  if (protocol.includes('bonk')) return '#ff6b35';
  if (protocol.includes('bags')) return '#22c55e';
  if (protocol.includes('launch')) return '#3b82f6';
  if (protocol.includes('orca')) return '#0ea5e9';
  if (protocol.includes('jupiter')) return '#8b5cf6';
  return '#22c55e';
}

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
  const currentChain = (router.query.chain as string) || 'sol';
  const selectedChain: 'sol' | 'monad' = (currentChain === 'monad' || currentChain === 'sol') ? currentChain : 'sol';

  // Load quickBuyAmount from localStorage with fallback
  const getInitialQuickBuyAmount = () => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('quickBuyAmount');
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 0) {
          return parsed;
        }
      }
    }
    return 0.05;
  };

  const [quickBuyAmount, setQuickBuyAmount] = useState(getInitialQuickBuyAmount().toString());
  const [activeTab, setActiveTab] = useState(0);
  const [showAddWalletModal, setShowAddWalletModal] = useState(false);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [watchedWallets, setWatchedWallets] = useState<WatchWallet[]>([]);
  const [walletEvents, setWalletEvents] = useState<Record<string, WalletEvent[]>>({});
  const [trackedWalletBalances, setTrackedWalletBalances] = useState<Record<string, number>>({});
  const [lastActiveMap, setLastActiveMap] = useState<Record<string, number | null>>({});
  const [isTogglingAllNotifications, setIsTogglingAllNotifications] = useState(false);
  const [tokenMetadata, setTokenMetadata] = useState<Map<string, any>>(new Map());

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
        createdAt: w.createdAt ? (typeof w.createdAt === 'number' ? w.createdAt : new Date(w.createdAt).getTime()) : Date.now(),
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
        const monadWallets = watchedWallets.filter(w => w.chain === 'monad').map(w => w.address);
        const solWallets = watchedWallets.filter(w => w.chain !== 'monad').map(w => w.address);

        console.log(
          "[walletTracker:lastActive] fetching timestamps:",
          { monad: monadWallets.length, sol: solWallets.length }
        );

        const map: Record<string, number | null> = {};

        // Fetch Monad wallets using Blockvision API
        if (monadWallets.length > 0) {
          if (!BLOCKVISION_API_KEY) {
            console.warn("[walletTracker:lastActive] BLOCKVISION_API_KEY not set, skipping Monad wallets");
            monadWallets.forEach(addr => map[addr] = null);
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
            const allFailed = monadSettled.every((r) => r.status === "rejected");
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
                const proxyResp = await fetch("/api/blockvision/monad/last-active", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ wallets: monadWallets, limit: 20 }),
                });
                const proxyPayload = await proxyResp.json().catch(() => null);
                if (
                  proxyResp.ok &&
                  proxyPayload?.ok === true &&
                  Array.isArray(proxyPayload?.data)
                ) {
                  for (const item of proxyPayload.data) {
                    if (!item?.wallet) continue;
                    map[item.wallet] = typeof item.lastActive === "number" ? item.lastActive : null;
                  }
                }
              } catch (proxyError) {
                console.error("[walletTracker:lastActive] Proxy fallback failed:", proxyError);
              }
            } else {
              monadSettled.forEach((res, idx) => {
                const address = monadWallets[idx];
                if (res.status === "fulfilled") {
                  map[address] = res.value.lastActive;
                } else {
                  map[address] = null;
                  console.warn("[walletTracker:lastActive] Monad wallet fetch failed", {
                    address,
                    error: res.reason?.message || String(res.reason),
                  });
                }
              });
            }

            // Set null for any Monad wallets not in map
            monadWallets.forEach(addr => {
              if (!(addr in map)) map[addr] = null;
            });
          }
        }

        // Fetch Solana wallets using backend API
        if (solWallets.length > 0) {
          try {
            const { getWalletsLastActive } = await import("~/utils/walletTracking");
            const solResults = await getWalletsLastActive(solWallets, 'sol');
            
            for (const result of solResults) {
              map[result.wallet] = result.lastActive;
            }

            // Set null for any Solana wallets not in results
            solWallets.forEach(addr => {
              if (!(addr in map)) map[addr] = null;
            });
          } catch (error) {
            console.error("[walletTracker:lastActive] Failed to fetch Solana last active:", error);
            solWallets.forEach(addr => map[addr] = null);
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
            await removeTrackedWallet(wallet.address, user.id, undefined, user.bearerToken);
          } catch (error) {
            console.error(`Failed to remove wallet ${wallet.address}:`, error);
          }
        }
      } else {
        await removeTrackedWallet(address, user.id, undefined, user.bearerToken);
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

  const handleAddWallet = async (address: string, name: string, emoji?: string, chain?: 'sol' | 'monad') => {
    try {
      // Add to backend with notifications enabled by default
      await addTrackedWallet(address, name, user?.id, emoji, true, chain || 'sol', user?.bearerToken);
      
      // Save notification preference to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(`wallet_notifications_${address}`, JSON.stringify(true));
      }

      // Reload from backend (this will also refresh global watched wallets)
      await loadWalletsFromBackend();
      await refreshWatchedWallets();

      setShowAddWalletModal(false);

      showEnhancedToast('success', 'Wallet added!', {
        title: 'Success',
      });
    } catch (error: any) {
      const message = error?.message || "Failed to add wallet";
      showEnhancedToast('error', message, {
        title: 'Error',
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
    const allEnabled = watchedWallets.length > 0 && watchedWallets.every(w => w.notificationsEnabled);
    
    try {
      const { toggleWalletNotifications } = await import("~/utils/walletTracking");
      for (const wallet of watchedWallets) {
        await toggleWalletNotifications(wallet.address, !allEnabled, user.id, undefined, user.bearerToken);
      }
      await refreshWatchedWallets();
    } catch (error) {
      console.error("Failed to toggle notifications:", error);
    } finally {
      setIsTogglingAllNotifications(false);
    }
  };

  const allNotificationsEnabled = watchedWallets.length > 0 && watchedWallets.every(w => w.notificationsEnabled);

  // Filter wallets based on search term
  const filteredWallets = wallets.filter(
    (wallet) =>
      wallet.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wallet.address.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filter live trades to only show trades from currently watched wallets
  const watchedWalletAddresses = new Set(watchedWallets.map(w => w.address));
  const filteredLatestTrades = latestTrades.filter(trade => watchedWalletAddresses.has(trade.wallet));

  // Fetch token metadata for live trades - same flow as trackers page
  const fetchedMintsRef = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    if (filteredLatestTrades.length === 0) return;
    
    // Only fetch metadata for trades we haven't fetched yet
    const tradesToFetch = filteredLatestTrades.filter(
      trade => !tokenMetadata.has(trade.mint) && !fetchedMintsRef.current.has(trade.mint)
    );
    
    if (tradesToFetch.length === 0) {
      return;
    }
    
    // Mark these mints as being fetched to prevent duplicate requests
    tradesToFetch.forEach(trade => fetchedMintsRef.current.add(trade.mint));

    // Fetch all tokens in parallel using Promise.allSettled for maximum speed
    Promise.allSettled(
      tradesToFetch.map(async (trade) => {
        try {
          // Try to use pair_address if available, otherwise use mint_address
          const params = new URLSearchParams();
          if (trade.pair_address) {
            params.set('pair_address', trade.pair_address);
          } else {
            params.set('mint_address', trade.mint);
          }
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          
          const response = await fetch(`/api/token-service/trade-view?${params.toString()}`, {
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          
          const data = await response.json();
          const token = data?.token;
          
          if (token) {
            const metadata = {
              symbol: token.symbol || trade.symbol || null,
              name: token.name || trade.name || null,
              image: token.uri || token.image || token.logo || null,
              launchpad_protocol: token.launchpad_protocol || token.protocol || null,
              market_cap_usd: token.market_cap_usd || token.marketCapUsd || token.fully_diluted_value || null,
              createdAt: token.created_at || token.createdAt || token.CreatedAt || null,
            };
            
            // Update state immediately for this token (progressive rendering)
            setTokenMetadata((prev) => {
              const updated = new Map(prev);
              updated.set(trade.mint, metadata);
              return updated;
            });
          }
        } catch (error) {
          // Silent fail - will use fallback UI
        }
      })
    );
  }, [filteredLatestTrades]);

  // Quick buy handler
  const handleQuickBuy = async (trade: TradeEvent) => {
    if (!user?.bearerToken || !user?.id) {
      showEnhancedToast('warning', 'Please connect your wallet to trade', {
        title: 'Authentication Required',
      });
      return;
    }

    const buyAmount = parseFloat(quickBuyAmount);
    if (isNaN(buyAmount) || buyAmount <= 0) {
      showEnhancedToast('warning', 'Please enter a valid SOL amount (minimum 0.001 SOL)', {
        title: 'Invalid Amount',
      });
      return;
    }

    const preset = presets[activePreset];
    if (!preset) {
      showEnhancedToast('error', 'Quick buy preset not configured', {
        title: 'Configuration Error',
      });
      return;
    }

    const settings = preset.quickBuySettings;
    const metadata = tokenMetadata.get(trade.mint);
    
    const token = {
      mint: trade.mint,
      pair_address: trade.pair_address || trade.mint,
      symbol: trade.symbol || metadata?.symbol || 'UNKNOWN',
      name: trade.name || metadata?.name || 'Unknown Token',
      image: metadata?.image || null,
      launchpad_protocol: metadata?.launchpad_protocol || null,
      market_cap_usd: metadata?.market_cap_usd || null,
    } as any;

    await executeEnhancedTrade({
      token,
      amount: buyAmount,
      side: 'buy',
      settings,
      user: { bearerToken: user.bearerToken, id: user.id },
      solBalance: 0, // Will be fetched by executeEnhancedTrade
      solPriceUsd: 150,
      walletContext: {
        selectedWalletIds: selectedWalletIds?.sol || [],
        walletList: walletList || [],
        walletBalances: walletBalances || {},
        chain: selectedChain,
      },
      onSuccess: () => {
        console.log('✅ Quick Buy successful');
      },
      onError: (error) => {
        console.error('❌ Quick Buy failed:', error);
      },
    });
  };

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center">
          <p className="mb-4 text-sm text-neutral-400">
            You are not logged in to Narrative
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
      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 sm:gap-4 border-b border-neutral-800/60 py-2 flex-shrink-0">
        {/* Left: tabs + wallet count */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              type="button"
              className={`cursor-pointer rounded-lg px-1.5 sm:px-2 py-1 text-[10px] sm:text-xs transition-all duration-300 whitespace-nowrap ${
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
                <span className="ml-0.5 sm:ml-1 animate-pulse text-xs sm:text-sm text-pink-400">
                  •
                </span>
              )}
            </button>
          ))}
          <div className="flex items-center rounded-full bg-[#111111] px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-[11px] text-neutral-300">
            <span className="font-medium text-white">
              {watchedWallets.length}
            </span>
            <span className="ml-0.5 sm:ml-1 text-neutral-400 hidden sm:inline">
              /{MAX_WALLETS} wallet
              {watchedWallets.length === 1 ? "" : "s"}
            </span>
            <span className="ml-0.5 sm:ml-1 text-neutral-400 sm:hidden">
              /{MAX_WALLETS}
            </span>
          </div>
        </div>

        {/* Middle: search bar */}
        <div className="flex-1 flex justify-start min-w-0">
          <input
            type="text"
            placeholder="Search by address"
            className="w-full max-w-md rounded-full border border-neutral-800 bg-[#050608] px-3 sm:px-4 py-1 text-[10px] sm:text-xs text-neutral-200 transition-all duration-300 focus:border-[#70E0B0]/60 focus:outline-none"
            disabled={activeTab === 1}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
          {activeTab === 0 && (
            <>
              <button
                type="button"
                className="rounded-full bg-[#111111] px-2 sm:px-4 py-1 text-[10px] sm:text-xs font-semibold text-white transition-all duration-300 hover:bg-[#181818] whitespace-nowrap"
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
                className="rounded-full bg-[#111111] px-2 sm:px-4 py-1 text-[10px] sm:text-xs font-semibold text-white transition-all duration-300 hover:bg-[#181818] whitespace-nowrap"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleExportAddresses();
                }}
              >
                Export
              </button>

              <button
                className="hidden sm:flex h-7 sm:h-8 w-7 sm:w-8 items-center justify-center rounded-full bg-[#111111] text-neutral-400 text-sm transition-all duration-300 hover:bg-[#181818] hover:text-white"
                type="button"
              >
                <FiSettings className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
              </button>
              <button
                className={`flex h-7 sm:h-8 w-7 sm:w-8 items-center justify-center rounded-full bg-[#111111] transition-all duration-300 hover:bg-[#181818] ${isTogglingAllNotifications ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleToggleAllNotifications();
                }}
                disabled={isTogglingAllNotifications}
                title={isTogglingAllNotifications ? "Toggling..." : allNotificationsEnabled ? "Disable all notifications" : "Enable all notifications"}
              >
                <FiBell className={`h-3.5 sm:h-4 w-3.5 sm:w-4 ${allNotificationsEnabled ? 'text-pink-500' : 'text-neutral-600'}`} />
              </button>
              <button
                className="hidden sm:flex h-7 sm:h-8 w-7 sm:w-8 items-center justify-center rounded-full bg-[#111111] text-neutral-400 text-sm transition-all duration-300 hover:bg-[#181818] hover:text-white"
                type="button"
              >
                <FiShare2 className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
              </button>
              <button
                className="hidden sm:flex h-7 sm:h-8 w-7 sm:w-8 items-center justify-center rounded-full bg-[#111111] text-neutral-400 text-sm transition-all duration-300 hover:bg-[#181818] hover:text-white"
                type="button"
              >
                <FiRss className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
              </button>

              <button
                type="button"
                className="rounded-full px-2 sm:px-4 py-1 text-[10px] sm:text-xs font-semibold transition-all duration-300 whitespace-nowrap"
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
                  e.currentTarget.style.boxShadow = "0 0 8px rgba(112, 224, 176, 0.3), 0 0 16px rgba(112, 224, 176, 0.15)";
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
      <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
        {activeTab === 0 ? (
          <>
            {wallets.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center">
                <span className="text-neutral-400">
                  No wallets added yet.
                </span>
              </div>
            ) : (
              <div className="flex-1 overflow-auto scrollbar-hide">
                <table className="w-full min-w-[500px] sm:min-w-[640px] text-[10px] sm:text-xs">
                  <thead className="sticky top-0 bg-[#050608] z-10">
                    <tr className="border-b border-neutral-800/60">
                      <th className="py-2 px-2">
                        <div className="flex w-full items-center gap-4">
                          <span className="w-28 flex justify-center text-[10px] sm:text-xs font-medium text-neutral-400">Created</span>
                          <span className="flex-1 min-w-0 text-[10px] sm:text-xs font-medium text-neutral-400">Name</span>
                          <span className="w-36 text-[10px] sm:text-xs font-medium text-neutral-400">Balance</span>
                          <span className="w-28 hidden sm:flex justify-center text-[10px] sm:text-xs font-medium text-neutral-400">Last Active</span>
                          <div className="flex-1 flex items-center justify-end">
                            <button
                              type="button"
                              className="whitespace-nowrap text-[10px] sm:text-xs font-semibold text-red-400 transition-colors duration-300 hover:text-red-300"
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
                        (ww) => ww.address === wallet.address
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
                            // Open wallet transactions page in a new tab
                            const url = `/wallet/${wallet.address}`;
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
          <>
            {filteredLatestTrades.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center">
                <span className="text-neutral-400">
                  {wsConnected 
                    ? "Listening for trades from tracked wallets..."
                    : "No live trades yet. Add wallets to start tracking!"}
                </span>
                <span className="mt-2 text-xs text-neutral-500">
                  {wsConnected
                    ? "✅ Connected and ready"
                    : "🔴 Disconnected - Check console for details"}
                </span>
              </div>
            ) : (
              <div className="flex-1 overflow-auto scrollbar-hide">
                {/* SVG gradient for Solana icon */}
                <svg className="absolute w-0 h-0 pointer-events-none">
                  <defs>
                    <linearGradient id="solana-gradient-tracker" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" style={{ stopColor: '#00FFA3', stopOpacity: 1 }} />
                      <stop offset="100%" style={{ stopColor: '#DC1FFF', stopOpacity: 1 }} />
                    </linearGradient>
                  </defs>
                </svg>
                <table className="mt-2 w-full min-w-[600px] sm:min-w-[720px] text-[10px] sm:text-xs">
                  <thead className="sticky top-0 bg-[#050608] z-10">
                    <tr className="border-b border-neutral-800/60">
                      <th className="w-16 sm:w-20 px-1 sm:px-2 py-1.5 sm:py-2 text-left text-[10px] sm:text-sm text-neutral-400">Time</th>
                      <th className="w-20 sm:w-24 px-1 sm:px-2 py-1.5 sm:py-2 text-left text-[10px] sm:text-sm text-neutral-400">Wallet</th>
                      <th className="w-10 sm:w-12 px-1 sm:px-2 py-1.5 sm:py-2 text-left text-[10px] sm:text-sm text-neutral-400">Side</th>
                      <th className="w-36 sm:w-48 px-1 sm:px-2 py-1.5 sm:py-2 text-left text-[10px] sm:text-sm text-neutral-400">Token</th>
                      <th className="w-20 sm:w-24 px-1 sm:px-2 py-1.5 sm:py-2 text-left text-[10px] sm:text-sm text-neutral-400">Amount</th>
                      <th className="w-16 sm:w-24 px-1 sm:px-2 py-1.5 sm:py-2 text-left text-[10px] sm:text-sm text-neutral-400">MC</th>
                      <th className="w-20 sm:w-28 px-1 sm:px-2 py-1.5 sm:py-2 text-center text-[10px] sm:text-sm text-neutral-400">Quick Buy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLatestTrades.map((trade, idx) => {
                      const wallet = wallets.find((w) => w.address === trade.wallet);
                      const timeAgo = new Date(trade.at * 1000).toLocaleTimeString();
                      const metadata = tokenMetadata.get(trade.mint);
                      const displaySymbol = trade.symbol || metadata?.symbol || trade.name || metadata?.name || trade.mint.slice(0, 8) + "...";
                      const displayName = trade.name || metadata?.name;
                      const rawImg = metadata?.image;
                      const tokenImageUrl = normalizeAssetUrl(rawImg);
                      const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(displaySymbol || "T")}&background=0f1012&color=E6E7EA&size=28`;
                      const launchpadProtocol = metadata?.launchpad_protocol?.toLowerCase() || '';
                      const protocolIcon = getProtocolIcon(launchpadProtocol);
                      const protocolColor = getProtocolColor(launchpadProtocol);
                      const isMeteora = launchpadProtocol.includes('meteora');
                      const isBonk = launchpadProtocol.includes('bonk');
                      const isBags = launchpadProtocol.includes('bags');
                      const isMoonit = launchpadProtocol.includes('moonit') || launchpadProtocol.includes('moonshot') || launchpadProtocol.includes('moonshoot');
                      const isFullCircleImage = isMeteora || isBonk || isBags || isMoonit;
                      
                      return (
                        <tr
                          key={`${trade.tx}-${idx}`}
                          className="group border-b border-neutral-800/50 transition-all duration-300"
                          style={{
                            backgroundColor: trade.side === "buy" 
                              ? "rgba(34, 197, 94, 0.08)" 
                              : "rgba(239, 68, 68, 0.08)",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = trade.side === "buy"
                              ? "rgba(34, 197, 94, 0.15)"
                              : "rgba(239, 68, 68, 0.15)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = trade.side === "buy"
                              ? "rgba(34, 197, 94, 0.08)"
                              : "rgba(239, 68, 68, 0.08)";
                          }}
                        >
                          <td className="w-16 sm:w-20 px-1 sm:px-2 py-1.5 sm:py-2 text-[9px] sm:text-xs text-neutral-400">
                            {timeAgo}
                          </td>
                          <td className="w-20 sm:w-24 px-1 sm:px-2 py-1.5 sm:py-2 font-mono text-[9px] sm:text-xs">
                            <span className="truncate" title={trade.wallet}>
                              {wallet?.emoji || "💼"} {wallet?.name || trade.wallet.slice(0, 4) + "..."}
                            </span>
                          </td>
                          <td className="w-10 sm:w-12 px-1 sm:px-2 py-1.5 sm:py-2">
                            <span
                              className={`rounded px-0.5 sm:px-1 py-0.5 text-[9px] sm:text-[10px] font-semibold ${
                                trade.side === "buy"
                                  ? "bg-green-500/20 text-green-400"
                                  : "bg-red-500/20 text-red-400"
                              }`}
                            >
                              {trade.side.toUpperCase()}
                            </span>
                          </td>
                          <td className="w-36 sm:w-48 px-1 sm:px-2 py-1.5 sm:py-2">
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                let tokenAddress = trade.pair_address;
                                if (!tokenAddress && trade.mint) {
                                  try {
                                    const searchResponse = await fetch(`${process.env.NEXT_PUBLIC_GO_SERVICE_URL}/v1/search?phrase=${encodeURIComponent(trade.mint)}&limit=1`);
                                    if (searchResponse.ok) {
                                      const searchData = await searchResponse.json();
                                      if (searchData.tokens && searchData.tokens.length > 0) {
                                        tokenAddress = searchData.tokens[0].pair_address || searchData.tokens[0].poolId;
                                      }
                                    }
                                  } catch (error) {
                                    console.warn('Failed to resolve pair_address:', error);
                                  }
                                }
                                if (!tokenAddress) tokenAddress = trade.mint;
                                window.location.href = `/trade/${tokenAddress}`;
                              }}
                              className="flex items-center gap-1 sm:gap-2 font-mono text-[9px] sm:text-xs text-emerald-300 hover:text-emerald-200 transition-colors cursor-pointer"
                              title={displayName || undefined}
                            >
                              {/* Token icon with protocol badge */}
                              <div className="relative flex items-center justify-center flex-shrink-0 w-5 h-5 sm:w-7 sm:h-7">
                                <div 
                                  className="relative rounded-sm"
                                  style={{
                                    border: `1px solid ${protocolColor}B3`,
                                    padding: '2px',
                                    backgroundColor: '#06070b'
                                  }}
                                >
                                  <div className="relative rounded-sm overflow-hidden w-4 h-4 sm:w-[22px] sm:h-[22px]">
                                    <img
                                      src={tokenImageUrl || fallbackAvatar}
                                      alt={displayName || displaySymbol}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        e.currentTarget.src = fallbackAvatar;
                                      }}
                                    />
                                  </div>
                                </div>
                                {/* Protocol badge icon */}
                                <div 
                                  className="absolute bottom-0 right-0 bg-white rounded-full flex items-center justify-center transform translate-x-1/4 translate-y-1/4"
                                  style={{ 
                                    width: 10, 
                                    height: 10,
                                    border: `1px solid ${protocolColor}`,
                                    boxShadow: `0 0 2px ${protocolColor}60`
                                  }}
                                >
                                  <img
                                    src={protocolIcon}
                                    alt="Protocol"
                                    className={`${isFullCircleImage ? 'w-full h-full object-cover' : 'w-3/4 h-3/4 object-contain'} rounded-full`}
                                    style={{
                                      filter: protocolColor === '#eab308' ? 'sepia(1) saturate(3) hue-rotate(-10deg) brightness(1.1)' : 'none'
                                    }}
                                  />
                                </div>
                              </div>
                              <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 leading-tight text-left">
                                <span className="font-medium text-xs sm:text-base text-neutral-100 truncate">
                                  {displaySymbol}
                                </span>
                              </div>
                            </button>
                          </td>
                          <td className="w-20 sm:w-24 px-1 sm:px-2 py-1.5 sm:py-2 text-[9px] sm:text-xs text-neutral-200">
                            <div className="flex items-center gap-0.5 sm:gap-1">
                              <SiSolana
                                className="h-2.5 sm:h-3 w-2.5 sm:w-3 inline-block flex-shrink-0"
                                aria-hidden="true"
                                style={{
                                  color: 'unset',
                                  fill: 'url(#solana-gradient-tracker)',
                                  filter: 'none',
                                }}
                              />
                              <span className="text-[9px] sm:text-xs">
                                {(() => {
                                  // Display SOL amount with 4 decimal places
                                  if (trade.sol_spent !== null && trade.sol_spent !== undefined) {
                                    // Check if value is in lamports (very large numbers) and convert to SOL
                                    let solAmount = Math.abs(trade.sol_spent);
                                    if (solAmount > 1000) {
                                      // Likely in lamports, convert to SOL (1 SOL = 1e9 lamports)
                                      solAmount = solAmount / 1e9;
                                    }
                                    return solAmount.toFixed(4);
                                  }
                                  // Fallback to token amount if sol_spent is not available
                                  return `${trade.amount.toFixed(4)} tokens`;
                                })()}
                              </span>
                            </div>
                          </td>
                          <td className="w-16 sm:w-24 px-1 sm:px-2 py-1.5 sm:py-2 text-[9px] sm:text-xs text-neutral-300">
                            {(() => {
                              const marketCap = metadata?.market_cap_usd || trade.market_cap_usd;
                              if (!marketCap || marketCap === 0) return <span className="text-neutral-500">-</span>;
                              return `$${formatMarketCap(marketCap)}`;
                            })()}
                          </td>
                          <td className="w-20 sm:w-28 px-1 sm:px-2 py-1.5 sm:py-2">
                            <div className="flex items-center justify-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleQuickBuy(trade);
                                }}
                                className="flex cursor-pointer items-center justify-center gap-1 sm:gap-1.5 rounded-full px-2 sm:px-3 py-1 sm:py-1.5 text-[9px] sm:text-sm font-bold transition-all duration-200 ease-out z-50 shadow-sm whitespace-nowrap"
                                style={{ 
                                  backgroundColor: '#18c48c',
                                  color: '#000000',
                                  border: '1px solid rgba(0,0,0,0.15)'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = '#12a877';
                                  e.currentTarget.style.transform = 'translateY(-1px)';
                                  e.currentTarget.style.boxShadow = '0 4px 14px rgba(112, 224, 176, 0.25)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = '#18c48c';
                                  e.currentTarget.style.transform = 'translateY(0)';
                                  e.currentTarget.style.boxShadow = 'none';
                                }}
                              >
                                <HiLightningBolt className="text-black w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" />
                                <span className="text-[9px] sm:text-xs">{quickBuyAmount} SOL</span>
                              </button>
                            </div>
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
