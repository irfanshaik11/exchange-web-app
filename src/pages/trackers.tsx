import React, { useState, useEffect, useRef } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { getActivePositionsByUser } from "~/utils/functions";
import type { PositionRow, Wallet } from "~/utils/functions";
import { formatMarketCap } from "~/utils/db";
import AddWalletModal from "../components/AddWalletModal";
import WalletRow from "../components/WalletRow";
import ImportExportWalletModal from "../components/ImportExportWalletModal";
import WalletScanPanel from "../components/WalletScanPanel";
import {
  addTrackedWallet,
  addTrackedWalletsBulk,
  removeTrackedWallet,
  getTrackedWallets,
  getWalletHistory,
  getWalletBalance,
  getWalletsLastActive,
  toggleWalletNotifications,
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
import AddTwitterHandleModal from "../components/AddTwitterHandleModal";
import TwitterAccountRow from "../components/TwitterAccountRow";
import { FiSettings, FiBell, FiShare2, FiRss } from "react-icons/fi";
import { SiSolana } from "react-icons/si";
import { RiExchangeDollarLine } from "react-icons/ri";
import { useQuickBuy } from "~/components/QuickBuyContext";
import { executeEnhancedTrade } from "~/utils/enhancedTradeHandler";
import { showEnhancedToast } from "~/utils/enhancedToast";
import type { Token } from "~/utils/db";
import { FaRunning, FaGasPump, FaCoins, FaBan } from "react-icons/fa";
import { HiLightningBolt } from "react-icons/hi";
import { useFilter } from "../components/FilterContext";
import FilterPopout from "../components/FilterPopout";

const TABS = ["Wallet Manager", "Live Trades"];
const TWITTER_TABS = ["Tracked Accounts", "X Feed"];
const LIVE_TRADES_CACHE_PREFIX = "walletTracker:liveTrades";
const getLiveTradesCacheKey = (userId?: string) =>
  userId
    ? `${LIVE_TRADES_CACHE_PREFIX}:user:${userId}`
    : `${LIVE_TRADES_CACHE_PREFIX}:global`;

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
  if (/^[a-z0-9_-]{40,}$/i.test(s) && !/^https?:\/\//i.test(s))
    return `https://arweave.net/${s}`;
  if (s.startsWith("http://")) return s.replace(/^http:\/\//i, "https://");
  if (s.startsWith("https://")) return s;
  return null;
}

// Calculate token age in human-readable format (e.g., "19m", "2h", "5d")
function getTokenAge(createdAt: string | number | null | undefined): string {
  if (!createdAt && createdAt !== 0) return "";
  let timestamp = createdAt as any;
  if (typeof timestamp === "number" && timestamp < 10000000000)
    timestamp *= 1000;
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return "";
  const ms = Date.now() - d.getTime();
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(ms / 86400000);
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

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

const MAX_WALLETS = 500;
const WALLET_LIMIT_MESSAGE = `You can add up to ${MAX_WALLETS} wallets.`;

const getRandomEmoji = () => EMOJIS[Math.floor(Math.random() * EMOJIS.length)];

export default function TrackersPage() {
  const router = useRouter();
  const { user, solBalance } = useUser();
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
  const [isTogglingAllNotifications, setIsTogglingAllNotifications] =
    useState(false);
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
  const [lastActiveMap, setLastActiveMap] = useState<
    Record<string, number | null | undefined>
  >({});
  // Get chain from router query (same as Header component)
  const currentChain = (router.query.chain as string) || "monad";
  const selectedChain = (currentChain === 'monad' || currentChain === 'sol') ? currentChain : 'monad';
  const walletsRef = useRef<Wallet[]>([]);
  const [tokenMetadata, setTokenMetadata] = useState<
    Map<
      string,
      {
        symbol: string | null;
        name: string | null;
        image: string | null;
        launchpad_protocol?: string | null;
        market_cap_usd?: number | null;
        createdAt?: string | null;
      }
    >
  >(new Map());
  const [cachedLiveTrades, setCachedLiveTrades] = useState<TradeEvent[]>([]);
  const fetchedMintsRef = useRef<Set<string>>(new Set());
  const [showUSD, setShowUSD] = useState(false); // Toggle between USD and SOL display

  // Quick Buy functionality
  const { presets, activePreset, setActivePreset } = useQuickBuy();

  // Filter functionality
  const [isFilterPopoutOpen, setIsFilterPopoutOpen] = useState(false);
  const { filter } = useFilter();
  const [localFilters, setLocalFilters] = useState(filter);

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
    return 0.0001;
  };

  const [quickBuyAmount, setQuickBuyAmount] = useState(
    getInitialQuickBuyAmount().toString(),
  );
  const [selectedPill, setSelectedPill] = useState("P1"); // Local preset selection for trackers page
  const [showPillTooltip, setShowPillTooltip] = useState<string | null>(null);

  const ensureNotificationsEnabled = async (
    walletsToEnable: { address: string }[],
  ) => {
    if (!walletsToEnable.length) return;
    try {
      const results = await Promise.allSettled(
        walletsToEnable.map((wallet) => {
          const walletData = watchedWallets.find(w => w.address === wallet.address);
          const walletChain = walletData?.chain || selectedChain;
          return toggleWalletNotifications(wallet.address, true, user?.id, walletChain, user?.bearerToken);
        }),
      );
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length > 0) {
        console.warn(
          `[Trackers] Failed to enable notifications for ${failures.length} wallet(s)`,
          failures,
        );
      }
    } catch (error) {
      console.warn(
        "[Trackers] Failed to enable notifications after bulk add:",
        error,
      );
    }
  };

  const normalizeAddress = (address: string | null | undefined) =>
    (address ?? "").trim().toLowerCase();
  const shortenAddress = (address: string) => {
    const trimmed = address.trim();
    if (trimmed.length <= 10) return trimmed;
    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
  };

  const composeImportSummary = ({
    successCount,
    duplicateExisting,
    duplicateWithinImport,
    invalidWallets,
    skippedByLimit,
    failedCount,
  }: {
    successCount: number;
    duplicateExisting: string[];
    duplicateWithinImport: string[];
    invalidWallets: string[];
    skippedByLimit?: string[];
    failedCount?: number;
  }) => {
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
    if (skippedByLimit && skippedByLimit.length > 0) {
      messageParts.push(
        `Skipped ${skippedByLimit.length} due to wallet limit (${skippedByLimit
          .slice(0, 3)
          .map(shortenAddress)
          .join(", ")}${
          skippedByLimit.length > 3 ? ` +${skippedByLimit.length - 3}` : ""
        })`,
      );
    }
    if (failedCount && failedCount > 0) {
      messageParts.push(`${failedCount} failed`);
    }

    return messageParts.length > 0
      ? messageParts.join(". ")
      : "No new wallets were imported.";
  };

  const showToastMessage = (message: string, duration = 3000) => {
    setToast(message);
    setTimeout(() => setToast(""), duration);
  };

  const showWalletLimitToast = () => {
    showToastMessage(WALLET_LIMIT_MESSAGE);
  };

  const formatTokenAge = (input: unknown): string | null => {
    if (input === null || input === undefined) return null;

    let timestampMs: number | null = null;

    if (typeof input === "number") {
      timestampMs = input < 1_000_000_000_000 ? input * 1000 : input;
    } else if (typeof input === "string") {
      const numeric = Number(input);
      if (!Number.isNaN(numeric) && numeric > 0) {
        timestampMs = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
      } else {
        const parsed = Date.parse(input);
        if (!Number.isNaN(parsed)) {
          timestampMs = parsed;
        }
      }
    } else if (input instanceof Date && !Number.isNaN(input.getTime())) {
      timestampMs = input.getTime();
    }

    if (timestampMs === null || Number.isNaN(timestampMs)) {
      return null;
    }

    const diff = Date.now() - timestampMs;
    if (!Number.isFinite(diff) || diff < 0) {
      return "Just now";
    }

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;
    const month = 30 * day;
    const year = 365 * day;

    if (diff < minute) return "Just now";
    if (diff < hour) {
      const mins = Math.floor(diff / minute);
      return `${mins} min${mins === 1 ? "" : "s"} ago`;
    }
    if (diff < day) {
      const hours = Math.floor(diff / hour);
      return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    }
    if (diff < week) {
      const days = Math.floor(diff / day);
      return `${days} day${days === 1 ? "" : "s"} ago`;
    }
    if (diff < month) {
      const weeks = Math.floor(diff / week);
      return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
    }
    if (diff < year) {
      const months = Math.floor(diff / month);
      return `${months} month${months === 1 ? "" : "s"} ago`;
    }
    const years = Math.floor(diff / year);
    return `${years} year${years === 1 ? "" : "s"} ago`;
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
  // Hide wallet section when chain is Monad
  const showWalletSection = !isMobile || mobileMainTab === "wallets";
  const showTwitterSection = !isMobile || mobileMainTab === "twitter";

  // Calculate if all notifications are enabled
  const allNotificationsEnabled =
    watchedWallets.length > 0 &&
    watchedWallets.every((w) => w.notificationsEnabled);

  // Debug logging
  useEffect(() => {
    console.log("🔍 Notification Status:", {
      totalWallets: watchedWallets.length,
      allNotificationsEnabled,
      walletStates: watchedWallets.map((w) => ({
        address: w.address.slice(0, 8),
        enabled: w.notificationsEnabled,
      })),
    });
  }, [watchedWallets, allNotificationsEnabled]);

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

  // Hydrate wallets from localStorage cache on mount
  useEffect(() => {
    if (typeof window === "undefined" || !user?.id) return;

    const cacheKey = `walletTracker:wallets:${user.id}`;
    const cached = localStorage.getItem(cacheKey);

    if (cached) {
      try {
        const parsedCache = JSON.parse(cached);
        if (parsedCache.wallets && parsedCache.watchedWallets) {
          setWallets(parsedCache.wallets);
          setWatchedWallets(parsedCache.watchedWallets);
          if (parsedCache.balances) {
            setWalletBalances(parsedCache.balances);
          }
        }
      } catch (error) {
        console.error("Failed to hydrate wallets from cache:", error);
      }
    }
  }, [user?.id]);

  // Load wallets when user changes, page loads, or chain changes (fetches fresh data in background)
  useEffect(() => {
    loadWalletsFromBackend();
  }, [user?.id, router.query.chain]);

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

  // Hydrate cached live trades so the Live Trades tab renders instantly on reload
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const userKey = user?.id ? getLiveTradesCacheKey(user.id) : null;
      const raw =
        (userKey ? window.localStorage.getItem(userKey) : null) ??
        window.localStorage.getItem(getLiveTradesCacheKey());

      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setCachedLiveTrades(parsed as TradeEvent[]);
      }
    } catch (error) {
      console.error("Failed to hydrate live trades cache:", error);
    }
  }, [user?.id]);

  useEffect(() => {
    if (latestTrades.length > 0) {
      setCachedLiveTrades(latestTrades);
    }
  }, [latestTrades]);

  const loadWalletsFromBackend = async () => {
    try {
      if (!user?.id) {
        setWatchedWallets([]);
        setWallets([]);
        setWalletBalances({});
        // Clear cache
        if (typeof window !== "undefined") {
          Object.keys(localStorage).forEach((key) => {
            if (key.startsWith("walletTracker:wallets:")) {
              localStorage.removeItem(key);
            }
          });
        }
        return;
      }

      // Fetch wallets from backend for the selected chain
      const tracked = await getTrackedWallets(user?.bearerToken, user?.id, selectedChain);

      // Also refresh global watched wallets
      await refreshWatchedWallets();

      const allWallets = tracked;

      // Always update state with backend response (even if empty)
      // This ensures removed wallets disappear from the UI
      setWatchedWallets(allWallets);

      // Convert backend wallets to frontend format
      const frontendWallets: Wallet[] = allWallets.map((w) => ({
        address: w.address,
        name: w.walletName || w.address.slice(0, 8),
        createdAt: new Date(w.createdAt).getTime(),
        emoji: w.emoji || getRandomEmoji(),
      }));

      setWallets(frontendWallets);

      // Clear balances for wallets that are no longer tracked
      setWalletBalances((prev) => {
        const validAddresses = new Set(allWallets.map((w) => w.address));
        const filtered: Record<string, number> = {};
        Object.keys(prev).forEach((address) => {
          if (validAddresses.has(address)) {
            filtered[address] = prev[address];
          }
        });
        return filtered;
      });

      // Cache wallets to localStorage
      if (typeof window !== "undefined") {
        const cacheKey = `walletTracker:wallets:${user.id}`;
        const cacheData = {
          wallets: frontendWallets,
          watchedWallets: allWallets,
          balances: {},
          timestamp: Date.now(),
        };
        try {
          localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        } catch (error) {
          console.error("Failed to cache wallets:", error);
        }
      }

      // Fetch real balances for tracked wallets (both Solana and Monad)
      console.log(`[Trackers] Fetching balances for ${allWallets.length} wallets:`, allWallets.map(w => ({ address: w.address.slice(0, 8) + '...', chain: w.chain })));
      allWallets.forEach(async (wallet) => {
        // Use wallet.chain from backend, fallback to selectedChain if not available
        const walletChain = (wallet.chain === 'monad' || wallet.chain === 'sol') ? wallet.chain : selectedChain;
        console.log(`[Trackers] Fetching balance for wallet ${wallet.address.slice(0, 8)}... (chain from wallet: ${wallet.chain}, using: ${walletChain})`);
        try {
          const balance = await getWalletBalance(wallet.address, walletChain);
          console.log(`[Trackers] Got balance for ${wallet.address.slice(0, 8)}...: ${balance} (chain: ${walletChain})`);
          if (balance !== null && !isNaN(balance)) {
            setWalletBalances((prev) => {
              const updated = { ...prev, [wallet.address]: balance };

              // Update balance in cache
              if (typeof window !== "undefined") {
                const cacheKey = `walletTracker:wallets:${user.id}`;
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                  try {
                    const cacheData = JSON.parse(cached);
                    cacheData.balances = updated;
                    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
                  } catch (error) {
                    // Silent fail
                  }
                }
              }

              return updated;
            });
          } else {
            console.warn(`[Trackers] Balance is null or NaN for wallet ${wallet.address.slice(0, 8)}... (chain: ${walletChain})`);
          }
        } catch (error) {
          console.error(`[Trackers] Error fetching balance for wallet ${wallet.address.slice(0, 8)}... (chain: ${walletChain}):`, error);
        }
      });
    } catch (error) {
      console.error("Failed to load wallets:", error);
      // Don't clear state on error - keep showing cached data
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
  useEffect(() => {
    if (watchedWallets.length === 0) {
      setLastActiveMap({});
      return;
    }

    let cancelled = false;

    const fetchLastActive = async () => {
      try {
        // Group wallets by chain
        const walletsByChain: Record<'sol' | 'monad', string[]> = {
          sol: [],
          monad: [],
        };

        watchedWallets.forEach((wallet) => {
          const address = wallet.address;
          if (typeof address === "string" && address.length > 0) {
            const chain = (wallet.chain === 'monad' || wallet.chain === 'sol') ? wallet.chain : 'sol';
            walletsByChain[chain].push(address);
          }
        });

        // Initialize map - will be populated as API calls complete
        const map: Record<string, number | null> = {};

        // Fetch last active for each chain in parallel
        const fetchPromises: Promise<void>[] = [];

        if (walletsByChain.sol.length > 0) {
          fetchPromises.push(
            getWalletsLastActive(walletsByChain.sol, 'sol')
              .then((results) => {
                if (cancelled) return;
                results.forEach((item) => {
                  map[item.wallet] =
                    typeof item.lastActive === "number" ? item.lastActive : null;
                });
              })
              .catch((error) => {
                if (!cancelled) {
                  console.error("Failed to fetch last active for Solana wallets:", error);
                }
              })
          );
        }

        if (walletsByChain.monad.length > 0) {
          fetchPromises.push(
            getWalletsLastActive(walletsByChain.monad, 'monad')
              .then((results) => {
                if (cancelled) return;
                results.forEach((item) => {
                  map[item.wallet] =
                    typeof item.lastActive === "number" ? item.lastActive : null;
                });
              })
              .catch((error) => {
                if (!cancelled) {
                  console.error("Failed to fetch last active for Monad wallets:", error);
                }
              })
          );
        }

        // Wait for all requests to complete
        await Promise.all(fetchPromises);

        if (cancelled) return;

        // Ensure we have entries for every requested address
        watchedWallets.forEach((wallet) => {
          if (typeof wallet.address === "string" && wallet.address.length > 0) {
            if (!(wallet.address in map)) {
              map[wallet.address] = null;
            }
          }
        });

        setLastActiveMap(map);
      } catch (error) {
        console.error("Failed to fetch last active timestamps:", error);
        if (!cancelled) {
          // Initialize with null values on error to avoid "Loading..." state
          const errorMap: Record<string, number | null> = {};
          watchedWallets.forEach((wallet) => {
            if (typeof wallet.address === "string" && wallet.address.length > 0) {
              errorMap[wallet.address] = null;
            }
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

  // Fetch token metadata for live trades using API routes (like trade page does)
  // This provides the most complete data: image, protocol, market cap
  useEffect(() => {
    if (latestTrades.length === 0) return;

    // Extract unique trades that we haven't fetched yet
    const tradesToFetch = latestTrades.filter(
      (trade) => !fetchedMintsRef.current.has(trade.mint),
    );

    if (tradesToFetch.length === 0) {
      return;
    }

    // Mark these mints as being fetched to prevent duplicate requests
    tradesToFetch.forEach((trade) => fetchedMintsRef.current.add(trade.mint));

    // Fetch all tokens in parallel using Promise.allSettled for maximum speed
    Promise.allSettled(
      tradesToFetch.map(async (trade) => {
        try {
          // Try to use pair_address if available, otherwise use mint_address
          const params = new URLSearchParams();
          if (trade.pair_address) {
            params.set("pair_address", trade.pair_address);
          } else {
            params.set("mint_address", trade.mint);
          }

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);

          const response = await fetch(
            `/api/token-service/trade-view?${params.toString()}`,
            {
              signal: controller.signal,
            },
          );
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
              launchpad_protocol:
                token.launchpad_protocol || token.protocol || null,
              market_cap_usd:
                token.market_cap_usd ||
                token.marketCapUsd ||
                token.fully_diluted_value ||
                null,
              createdAt:
                token.created_at || token.createdAt || token.CreatedAt || null,
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
      }),
    );
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
    chain?: 'sol' | 'monad',
  ) => {
    if (isAtWalletLimit) {
      showWalletLimitToast();
      return;
    }

    try {
      const walletChain = chain || 'monad';
      // Add to backend with notifications enabled by default
      await addTrackedWallet(address, name, user?.id, emoji, true, walletChain, user?.bearerToken);

      // Save notification preference to localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem(
          `wallet_notifications_${address}`,
          JSON.stringify(true),
        );
      }

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
        // Remove all wallets for the selected chain
        await Promise.all(
          wallets.map((w) => removeTrackedWallet(w.address, user?.id, selectedChain, user?.bearerToken)),
        );

        // Clear all state
        setWatchedWallets([]);
        setWallets([]);
        setWalletBalances({});

        // Clear wallet cache
        if (typeof window !== "undefined" && user?.id) {
          const cacheKey = `walletTracker:wallets:${user.id}`;
          localStorage.removeItem(cacheKey);
        }

        // Clear live trades cache
        if (typeof window !== "undefined") {
          const userKey = user?.id ? getLiveTradesCacheKey(user.id) : null;
          const globalKey = getLiveTradesCacheKey();
          if (userKey) localStorage.removeItem(userKey);
          localStorage.removeItem(globalKey);
        }

        // Clear cached live trades state
        setCachedLiveTrades([]);

        // Refresh global watched wallets
        await refreshWatchedWallets();
      } else {
        // Remove single wallet - need to find the chain from watchedWallets
        const wallet = watchedWallets.find(w => w.address === addressToRemove);
        const walletChain = wallet?.chain || selectedChain;
        await removeTrackedWallet(addressToRemove, user?.id, walletChain, user?.bearerToken);

        // Filter out trades from deleted wallet
        setCachedLiveTrades((prev) =>
          prev.filter((trade) => trade.wallet !== addressToRemove),
        );

        // Clear trades from localStorage for this wallet
        if (typeof window !== "undefined") {
          const userKey = user?.id ? getLiveTradesCacheKey(user.id) : null;
          const globalKey = getLiveTradesCacheKey();

          // Get current cached trades and filter
          const cacheKey = userKey || globalKey;
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              if (Array.isArray(parsed)) {
                const filtered = parsed.filter(
                  (trade: TradeEvent) => trade.wallet !== addressToRemove,
                );
                localStorage.setItem(cacheKey, JSON.stringify(filtered));
              }
            } catch (e) {
              // If parsing fails, just remove the cache
              localStorage.removeItem(cacheKey);
            }
          }
        }

        // Reload from backend (this will also refresh global watched wallets)
        await loadWalletsFromBackend();
      }

      setToast("Wallet removed");
      setTimeout(() => setToast(""), 3000);
    } catch (error: any) {
      setToast(error.message || "Failed to remove wallet");
      setTimeout(() => setToast(""), 3000);
    }
  };

  // Toggle all wallet notifications
  const handleToggleAllNotifications = async () => {
    if (watchedWallets.length === 0) {
      console.log("No wallets to toggle");
      return;
    }

    if (isTogglingAllNotifications) {
      console.log("⏳ Already toggling, please wait...");
      return;
    }

    setIsTogglingAllNotifications(true);

    try {
      // Determine new state: if all are enabled, disable all. Otherwise, enable all.
      const newState = !allNotificationsEnabled;
      console.log(
        `🔔 Toggle all notifications: ${allNotificationsEnabled} → ${newState}`,
      );
      console.log(`📊 Toggling ${watchedWallets.length} wallets`);

      // Toggle each wallet's notifications
      const togglePromises = watchedWallets.map((wallet) => {
        console.log(
          `  - ${wallet.address.slice(0, 8)}... from ${wallet.notificationsEnabled} to ${newState}`,
        );
        return toggleWalletNotifications(
          wallet.address,
          newState,
          wallet.ownerId || undefined,
          wallet.chain || selectedChain,
          user?.bearerToken,
        );
      });

      const results = await Promise.all(togglePromises);
      console.log("✅ All API calls completed:", results);

      // Update localStorage for each wallet
      watchedWallets.forEach((wallet) => {
        const storageKey = `wallet_notifications_${wallet.address}`;
        localStorage.setItem(storageKey, JSON.stringify(newState));
        console.log(
          `💾 Saved to localStorage: ${wallet.address.slice(0, 8)}... = ${newState}`,
        );
      });

      // Reload from backend to refresh state
      console.log("🔄 Reloading wallets from backend...");
      await loadWalletsFromBackend();
      await refreshWatchedWallets();
      console.log("✅ State refreshed - Ready for next toggle");
    } catch (error) {
      console.error("❌ Failed to toggle all notifications:", error);
    } finally {
      setIsTogglingAllNotifications(false);
    }
  };

  // QUICK BUY handler – using enhanced trade flow (same as discover page)
  const handleQuickBuy = async (trade: TradeEvent) => {
    console.log("🎯 Quick Buy called for token:", trade.symbol || trade.mint);

    if (!user?.bearerToken || !user?.id) {
      console.log("❌ User not logged in");
      showEnhancedToast("warning", "Please connect your wallet to trade", {
        title: "Authentication Required",
      });
      return;
    }

    const buyAmount = parseFloat(quickBuyAmount);
    if (isNaN(buyAmount) || buyAmount <= 0) {
      console.log("❌ Invalid buy amount:", quickBuyAmount);
      showEnhancedToast(
        "warning",
        "Please enter a valid SOL amount (minimum 0.001 SOL)",
        {
          title: "Invalid Amount",
        },
      );
      return;
    }

    const presetIndex = parseInt(selectedPill.replace("P", "")) - 1;
    const preset = presets[presetIndex];
    if (!preset) {
      console.log("❌ Quick buy preset missing for index", presetIndex);
      showEnhancedToast("error", "Quick buy preset not configured", {
        title: "Configuration Error",
        suggestions: ["Update your presets in settings"],
      });
      return;
    }

    const settings = preset.quickBuySettings;

    // Get token metadata from the tokenMetadata map
    const metadata = tokenMetadata.get(trade.mint);

    // Construct a Token object from the TradeEvent
    const token = {
      mint: trade.mint,
      pair_address: trade.pair_address || trade.mint,
      symbol: trade.symbol || metadata?.symbol || "UNKNOWN",
      name: trade.name || metadata?.name || "Unknown Token",
      image: metadata?.image || null,
      launchpad_protocol: metadata?.launchpad_protocol || null,
      market_cap_usd: metadata?.market_cap_usd || null,
      // Add other required Token fields with sensible defaults
    } as unknown as Token;

    // Execute enhanced trade with all features
    const result = await executeEnhancedTrade({
      token,
      amount: buyAmount,
      side: "buy",
      settings,
      user: { bearerToken: user.bearerToken, id: user.id },
      solBalance: Number(solBalance || 0),
      solPriceUsd: 150, // TODO: Get real SOL price
      onSuccess: (txHash, stats) => {
        console.log("✅ Quick Buy successful:", { txHash, stats });
      },
      onError: (error) => {
        console.error("❌ Quick Buy failed:", error);
      },
      onWarning: (warnings) => {
        console.warn("⚠️ Pre-transaction warnings:", warnings);
      },
    });

    return result;
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
  // Filter live trades to only show trades from currently watched wallets
  const watchedWalletAddresses = new Set(watchedWallets.map((w) => w.address));
  const filteredLatestTrades = latestTrades.filter((trade) =>
    watchedWalletAddresses.has(trade.wallet),
  );
  const filteredCachedTrades = cachedLiveTrades.filter((trade) =>
    watchedWalletAddresses.has(trade.wallet),
  );

  const liveTradesToRender =
    filteredLatestTrades.length > 0
      ? filteredLatestTrades
      : filteredCachedTrades;

  // Twitter functions
  const loadTwitterAccounts = async () => {
    try {
      const accounts = await getTrackedTwitterAccounts(user?.bearerToken || '');
      setTwitterAccounts(accounts);
    } catch (error) {
      console.error("Failed to load tracked Twitter accounts:", error);
      setTwitterAccounts([]);
    }
  };

  const handleAddTwitterAccount = async (username: string) => {
    try {
      await addTrackedTwitterAccount(username, user?.bearerToken || '');
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
      await removeTrackedTwitterAccount(username, user?.bearerToken || '');
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
                emoji: wallet.emoji || getRandomEmoji(),
              };
            }
            return {
              address: wallet?.address,
              name: wallet?.name || "Imported Wallet",
              emoji: wallet?.emoji || getRandomEmoji(),
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
          const walletsToAdd: {
            address: string;
            name: string;
            emoji?: string;
          }[] = [];

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
            showToastMessage(
              availableSlots > 0
                ? `You can only add ${availableSlots} more wallet${availableSlots === 1 ? "" : "s"}. Remove some before importing.`
                : `You have reached the limit of ${MAX_WALLETS} wallets. Remove some before importing.`,
            );
            return;
          }

          const bulkPayload = walletsToAdd.map((wallet) => ({
            wallet: wallet.address,
            walletName: wallet.name,
            emoji: wallet.emoji || getRandomEmoji(),
          }));

          await addTrackedWalletsBulk(bulkPayload, user?.id, selectedChain, user?.bearerToken);
          await ensureNotificationsEnabled(walletsToAdd);

          let successCount = walletsToAdd.length;
          let errorCount = 0;

          if (typeof window !== "undefined") {
            walletsToAdd.forEach((wallet) => {
              localStorage.setItem(
                `wallet_notifications_${wallet.address}`,
                JSON.stringify(true),
              );
            });
          }

          await loadWalletsFromBackend();

          showToastMessage(
            composeImportSummary({
              successCount,
              duplicateExisting,
              duplicateWithinImport,
              invalidWallets,
              skippedByLimit: [],
              failedCount: errorCount,
            }),
          );
        } else {
          showToastMessage("Invalid wallet file format.");
        }
      } catch {
        showToastMessage("Failed to import wallets.");
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be imported again if needed
    e.target.value = "";
  };

  return (
    <>
      <Head>
        <title>Trackers | Narrative Memeboard</title>
      </Head>
      <div className="mb-20">
        <div className="flex min-h-screen flex-col bg-[#050608] text-neutral-100">
          <Header isSticky={false} />
          <div className="my-4 flex flex-col gap-4 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:px-8">
            {/* Tabs Section - Scrollable on mobile */}
            <div className="scrollbar-hide -mx-4 flex items-center gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:gap-4 sm:px-6 lg:mx-0 lg:gap-6 lg:px-0 lg:pb-0">
              <button
                className={`hover:text-[#f0f5f5]"} text-sm font-light whitespace-nowrap text-[#f0f5f5] transition-colors sm:text-base lg:text-lg`}
              >
                Trackers
              </button>
            </div>
          </div>
          <div className="w-full flex-grow">
            {/* Main Content Area: Two Columns */}
            <div className="flex flex-col gap-4 px-2 sm:px-4 lg:flex-row">
              {isMobile && (
                <div className="flex w-full rounded-full bg-[#111111] p-0.5 text-[10px] font-medium text-neutral-400 sm:p-1 sm:text-xs">
                  <button
                    className={`flex-1 rounded-full px-2 py-1.5 transition-colors duration-200 sm:px-3 sm:py-2 ${
                      mobileMainTab === "wallets"
                        ? "bg-[#70E0B0] font-semibold text-neutral-900"
                        : "text-neutral-300 hover:text-white"
                    }`}
                    onClick={() => setMobileMainTab("wallets")}
                  >
                    Wallet Tracker
                  </button>
                  <button
                    className={`flex-1 rounded-full px-2 py-1.5 transition-colors duration-200 sm:px-3 sm:py-2 ${
                      mobileMainTab === "twitter"
                        ? "bg-[#70E0B0] font-semibold text-neutral-900"
                        : "text-neutral-300 hover:text-white"
                    }`}
                    onClick={() => setMobileMainTab("twitter")}
                  >
                    X Tracker
                  </button>
                </div>
              )}

              {/* LEFT: WALLET SECTION */}
              {showWalletSection && (
                <div
                  className="flex h-full min-h-[400px] min-w-0 flex-1 flex-col overflow-hidden border border-neutral-900/80 bg-[#050608] px-2 sm:min-h-[530px] sm:px-4"
                  style={{
                    maxHeight: "calc(100vh - 140px)",
                  }}
                >
                  {/* If user is not logged in, show GMGN-style empty state */}
                  {!user ? (
                    <div className="flex flex-1 items-center justify-center">
                      <div className="text-center">
                        <p className="mb-4 text-sm text-neutral-400">
                          You are not logged in to Narrative
                        </p>
                        <button
                          className="inline-flex items-center justify-center rounded-full border border-neutral-600 px-6 py-1.5 text-xs font-medium text-neutral-100 transition-colors duration-200 hover:border-neutral-400 hover:bg-neutral-800/60"
                          onClick={() => {
                            const event = new CustomEvent("open-login-modal");
                            window.dispatchEvent(event);
                          }}
                        >
                          Log in
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* HEADER BAR – three zones like reference screenshot */}
                      <div className="flex flex-col flex-wrap items-stretch gap-2 border-b border-neutral-800/60 py-2 sm:flex-row sm:items-center sm:gap-4">
                        {/* Left: tabs + wallet count */}
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          {TABS.map((tab, i) => (
                            <button
                              key={tab}
                              className={`cursor-pointer rounded-lg px-1.5 py-1 text-[10px] whitespace-nowrap transition-all duration-300 sm:px-2 sm:text-xs ${
                                activeTab === i
                                  ? "bg-[#111111] font-medium text-white"
                                  : "font-medium text-neutral-400 hover:bg-[#141414] hover:text-white"
                              }`}
                              onClick={() => setActiveTab(i)}
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

                        {/* Middle: search bar (center, max width) */}
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

                        {/* Right: actions (Import / Export / icons / Add Wallet) */}
                        <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                          {activeTab === 0 && (
                            <>
                              <button
                                className="rounded-full bg-[#111111] px-2 py-1 text-[10px] font-semibold whitespace-nowrap text-white transition-all duration-300 hover:bg-[#181818] sm:px-4 sm:text-xs"
                                onClick={() => setShowImportModal(true)}
                              >
                                Import
                              </button>
                              <button
                                className="rounded-full bg-[#111111] px-2 py-1 text-[10px] font-semibold whitespace-nowrap text-white transition-all duration-300 hover:bg-[#181818] sm:px-4 sm:text-xs"
                                onClick={handleExportAddresses}
                              >
                                Export
                              </button>

                              {/* Icon buttons - hide some on mobile */}
                              <button
                                className="hidden h-7 w-7 items-center justify-center rounded-full bg-[#111111] text-sm text-neutral-400 transition-all duration-300 hover:bg-[#181818] hover:text-white sm:flex sm:h-8 sm:w-8"
                                type="button"
                              >
                                <FiSettings className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                              </button>
                              <button
                                className={`flex h-7 w-7 items-center justify-center rounded-full bg-[#111111] transition-all duration-300 hover:bg-[#181818] sm:h-8 sm:w-8 ${isTogglingAllNotifications ? "cursor-wait opacity-50" : "cursor-pointer"}`}
                                type="button"
                                onClick={handleToggleAllNotifications}
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
                                className="rounded-full px-2 py-1 text-[10px] font-semibold whitespace-nowrap transition-all duration-300 sm:px-4 sm:text-xs"
                                style={{
                                  backgroundColor: "#70E0B0",
                                  color: "#000000",
                                  border: "none",
                                }}
                                onClick={handleOpenAddWalletModal}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor =
                                    "#58B890";
                                  e.currentTarget.style.boxShadow =
                                    "0 0 8px rgba(112, 224, 176, 0.3), 0 0 16px rgba(112, 224, 176, 0.15)";
                                  e.currentTarget.style.transform =
                                    "scale(1.02)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor =
                                    "#70E0B0";
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

                      <div className="min-h-0 flex-1 overflow-y-auto">
                        {activeTab === 0 ? (
                          <>
                            <div className="flex items-center border-b border-neutral-800/60 p-1.5 sm:p-2">
                              <div className="flex w-full items-center gap-2 text-[10px] font-medium text-neutral-400 sm:gap-4 sm:text-xs">
                                <span className="flex w-16 justify-center sm:w-28">
                                  Created
                                </span>
                                <span className="min-w-0 flex-1">Name</span>
                                <span className="w-20 sm:w-36">Balance</span>
                                <span className="hidden w-16 justify-center sm:flex sm:w-28">
                                  Last Active
                                </span>
                                <div className="flex flex-1 items-center justify-end">
                                  <button
                                    className="text-[10px] font-semibold whitespace-nowrap text-red-400 transition-colors duration-300 hover:text-red-300 sm:text-xs"
                                    onClick={() => handleRemoveWallet("all")}
                                  >
                                    Remove All
                                  </button>
                                </div>
                              </div>
                            </div>
                            {wallets.length === 0 ? (
                              <div className="flex h-64 flex-col items-center justify-center">
                                <span className="text-neutral-400">
                                  No wallets added yet.
                                </span>
                              </div>
                            ) : (
                              <div className="scrollbar-hide overflow-x-auto">
                                <table className="w-full min-w-[500px] text-[10px] sm:min-w-[640px] sm:text-xs">
                                  <tbody>
                                    {filteredWallets.map((wallet) => {
                                      const watched = watchedWallets.find(
                                        (ww) => ww.address === wallet.address,
                                      );
                                      const events =
                                        walletEvents[wallet.address] || [];
                                      const balance =
                                        walletBalances[wallet.address];
                                      return (
                                        <WalletRow
                                          key={wallet.address}
                                          wallet={wallet}
                                          watchedWallet={watched}
                                          events={events}
                                          balance={balance}
                                          lastActive={
                                            lastActiveMap[wallet.address]
                                          }
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
                            {liveTradesToRender.length === 0 ? (
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
                              <div className="overflow-x-auto overflow-y-auto">
                                {/* Quick Buy Controls - Aligned to right above Action column */}
                                <div className="mt-2 mb-2 flex flex-wrap items-center justify-end gap-1.5 sm:mt-4 sm:mb-4 sm:gap-2">
                                  {/* Filter button */}
                                  <div className="relative">
                                    <button
                                      className="relative flex cursor-pointer items-center justify-center gap-1 rounded-full border border-[#2A2B33] bg-[#17191E] px-2 py-1 text-[#9CA3AF] transition-all duration-300 ease-out hover:text-[#E6E7EA] sm:gap-2 sm:px-3.5 sm:py-1.5"
                                      onClick={() =>
                                        setIsFilterPopoutOpen(true)
                                      }
                                    >
                                      {/* filter glyph */}
                                      <svg
                                        width="11"
                                        height="11"
                                        className="sm:h-[13px] sm:w-[13px]"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <line x1="4" y1="6" x2="20" y2="6" />
                                        <circle cx="8" cy="6" r="2" />
                                        <line x1="4" y1="12" x2="20" y2="12" />
                                        <circle cx="16" cy="12" r="2" />
                                        <line x1="4" y1="18" x2="20" y2="18" />
                                        <circle cx="8" cy="18" r="2" />
                                      </svg>
                                      <span className="hidden text-[10px] font-medium sm:inline sm:text-sm">
                                        Filter
                                      </span>
                                      <svg
                                        className="hidden h-3 w-3 sm:block sm:h-3.5 sm:w-3.5"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          d="M19 9l-7 7-7-7"
                                        />
                                      </svg>
                                    </button>
                                  </div>

                                  <div
                                    className="flex items-center justify-center gap-1 rounded-full border bg-[#17191E] px-2 py-1 sm:gap-2 sm:px-3 sm:py-1.5"
                                    style={{ borderColor: "#2A2B33" }}
                                  >
                                    {/* Amount - Editable */}
                                    <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                                      <HiLightningBolt
                                        size={10}
                                        className="sm:h-3 sm:w-3"
                                        style={{ color: "#22C55E" }}
                                      />
                                      <input
                                        type="text"
                                        value={quickBuyAmount}
                                        inputMode="decimal"
                                        onChange={(e) => {
                                          const value = e.target.value;
                                          // Allow only digits and at most one decimal point
                                          if (
                                            value === "" ||
                                            /^\d*\.?\d*$/.test(value)
                                          ) {
                                            setQuickBuyAmount(value);
                                            const numValue = Number(value) || 0;
                                            if (typeof window !== "undefined") {
                                              localStorage.setItem(
                                                "quickBuyAmount",
                                                numValue.toString(),
                                              );
                                            }
                                          }
                                        }}
                                        onKeyDown={(e) => {
                                          // Block non-numeric keys except control/navigation keys and '.'
                                          const allowedKeys = [
                                            "Backspace",
                                            "Delete",
                                            "ArrowLeft",
                                            "ArrowRight",
                                            "Tab",
                                            "Home",
                                            "End",
                                          ];
                                          if (allowedKeys.includes(e.key))
                                            return;
                                          if (e.key === ".") return;
                                          if (!/^[0-9]$/.test(e.key)) {
                                            e.preventDefault();
                                          }
                                        }}
                                        className="w-8 border-none bg-transparent text-center text-[10px] font-medium outline-none sm:w-10 sm:text-xs"
                                        style={{ color: "#E6E7EA" }}
                                      />
                                    </div>

                                    {/* Solana Symbol */}
                                    <div className="flex items-center justify-center">
                                      <svg
                                        width="10"
                                        height="10"
                                        className="sm:h-3 sm:w-3"
                                        viewBox="0 0 397.7 311.7"
                                        fill="none"
                                      >
                                        <path
                                          d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 237.9z"
                                          fill="url(#paint0_linear_solana_tracker)"
                                        />
                                        <path
                                          d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1L333.1 73.8c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z"
                                          fill="url(#paint1_linear_solana_tracker)"
                                        />
                                        <path
                                          d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z"
                                          fill="url(#paint2_linear_solana_tracker)"
                                        />
                                        <defs>
                                          <linearGradient
                                            id="paint0_linear_solana_tracker"
                                            x1="360.8"
                                            y1="351.5"
                                            x2="141.44"
                                            y2="132.14"
                                            gradientUnits="userSpaceOnUse"
                                          >
                                            <stop
                                              offset="0"
                                              stopColor="#00FFA3"
                                            />
                                            <stop
                                              offset="1"
                                              stopColor="#DC1FFF"
                                            />
                                          </linearGradient>
                                          <linearGradient
                                            id="paint1_linear_solana_tracker"
                                            x1="264.8"
                                            y1="116.2"
                                            x2="45.44"
                                            y2="-103.16"
                                            gradientUnits="userSpaceOnUse"
                                          >
                                            <stop
                                              offset="0"
                                              stopColor="#00FFA3"
                                            />
                                            <stop
                                              offset="1"
                                              stopColor="#DC1FFF"
                                            />
                                          </linearGradient>
                                          <linearGradient
                                            id="paint2_linear_solana_tracker"
                                            x1="312.5"
                                            y1="233.9"
                                            x2="93.14"
                                            y2="14.54"
                                            gradientUnits="userSpaceOnUse"
                                          >
                                            <stop
                                              offset="0"
                                              stopColor="#00FFA3"
                                            />
                                            <stop
                                              offset="1"
                                              stopColor="#DC1FFF"
                                            />
                                          </linearGradient>
                                        </defs>
                                      </svg>
                                    </div>

                                    {/* Separator */}
                                    <div className="h-3 w-px bg-gray-600 sm:h-4"></div>

                                    {/* P1 P2 P3 Pill - Simple Toggle */}
                                    <div className="relative flex items-center justify-center gap-0.5 sm:gap-1">
                                      {["P1", "P2", "P3"].map((pill) => {
                                        const presetIndex =
                                          parseInt(pill.replace("P", "")) - 1;
                                        const preset = presets[presetIndex];
                                        const settings =
                                          preset?.quickBuySettings;

                                        return (
                                          <div
                                            key={pill}
                                            className="relative flex items-center justify-center"
                                          >
                                            <button
                                              className={`flex cursor-pointer items-center justify-center px-1 py-0.5 text-[10px] font-medium transition-all duration-200 sm:px-1.5 sm:text-xs ${
                                                selectedPill === pill
                                                  ? "text-green-400"
                                                  : "text-gray-400 hover:text-white"
                                              }`}
                                              onClick={() => {
                                                setSelectedPill(pill);
                                                setActivePreset(presetIndex); // Also update global preset for consistency
                                                console.log(
                                                  `Selected ${pill} in trackers page`,
                                                );
                                              }}
                                              onMouseEnter={() =>
                                                setShowPillTooltip(pill)
                                              }
                                              onMouseLeave={() =>
                                                setShowPillTooltip(null)
                                              }
                                            >
                                              {pill}
                                            </button>

                                            {/* Tooltip for each pill */}
                                            {showPillTooltip === pill &&
                                              settings && (
                                                <div
                                                  className="absolute top-full left-0 z-50 mt-1 w-28 rounded-lg border shadow-xl"
                                                  style={{
                                                    backgroundColor:
                                                      "rgba(15, 16, 18, 0.95)",
                                                    borderColor: "#2A2B33",
                                                  }}
                                                >
                                                  <div className="space-y-1.5 p-2">
                                                    {/* Slippage - Running person icon */}
                                                    <div className="flex items-center gap-1.5">
                                                      <FaRunning
                                                        size={10}
                                                        className="opacity-80"
                                                        style={{
                                                          strokeWidth: "1",
                                                        }}
                                                      />
                                                      <span className="text-xs font-light text-gray-300">
                                                        {(
                                                          settings.maxSlippage *
                                                          100
                                                        ).toFixed(0)}
                                                        %
                                                      </span>
                                                    </div>

                                                    {/* Priority Fee - Gas pump icon with yellow styling */}
                                                    <div className="flex items-center gap-1.5">
                                                      <FaGasPump
                                                        size={10}
                                                        className="opacity-90"
                                                        style={{
                                                          color: "#FCD34D",
                                                          strokeWidth: "1",
                                                        }}
                                                      />
                                                      <span className="text-xs font-light text-yellow-400">
                                                        {settings.priority}
                                                      </span>
                                                      <span className="text-xs font-light text-red-500">
                                                        ⚠
                                                      </span>
                                                    </div>

                                                    {/* Bribe - Coins icon with yellow styling */}
                                                    <div className="flex items-center gap-1.5">
                                                      <FaCoins
                                                        size={10}
                                                        className="opacity-90"
                                                        style={{
                                                          color: "#FCD34D",
                                                          strokeWidth: "1",
                                                        }}
                                                      />
                                                      <span className="text-xs font-light text-yellow-400">
                                                        {settings.bribe}
                                                      </span>
                                                      <span className="text-xs font-light text-red-500">
                                                        ⚠
                                                      </span>
                                                    </div>

                                                    {/* MEV Protection - Ban icon */}
                                                    <div className="flex items-center gap-1.5">
                                                      <FaBan
                                                        size={10}
                                                        className="opacity-90"
                                                        style={{
                                                          strokeWidth: "1",
                                                        }}
                                                      />
                                                      <span className="text-xs font-light text-gray-300">
                                                        {settings.mevMode ===
                                                        "off"
                                                          ? "Off"
                                                          : settings.mevMode ===
                                                              "reduced"
                                                            ? "Reduced"
                                                            : "Secure"}
                                                      </span>
                                                    </div>
                                                  </div>
                                                </div>
                                              )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>

                                {/* SVG gradient for Solana icon */}
                                <svg className="pointer-events-none absolute h-0 w-0">
                                  <defs>
                                    <linearGradient
                                      id="solana-gradient-tracker"
                                      x1="0%"
                                      y1="0%"
                                      x2="100%"
                                      y2="100%"
                                    >
                                      <stop
                                        offset="0%"
                                        style={{
                                          stopColor: "#00FFA3",
                                          stopOpacity: 1,
                                        }}
                                      />
                                      <stop
                                        offset="100%"
                                        style={{
                                          stopColor: "#DC1FFF",
                                          stopOpacity: 1,
                                        }}
                                      />
                                    </linearGradient>
                                  </defs>
                                </svg>
                                <table className="mt-2 w-full min-w-[600px] text-[10px] sm:min-w-[720px] sm:text-xs">
                                  <thead>
                                    <tr className="border-b border-neutral-800/60">
                                      <th className="w-16 px-1 py-1.5 text-left text-[10px] text-neutral-400 sm:w-20 sm:px-2 sm:py-2 sm:text-sm">
                                        Time
                                      </th>
                                      <th className="w-20 px-1 py-1.5 text-left text-[10px] text-neutral-400 sm:w-24 sm:px-2 sm:py-2 sm:text-sm">
                                        Wallet
                                      </th>
                                      <th className="w-10 px-1 py-1.5 text-left text-[10px] text-neutral-400 sm:w-12 sm:px-2 sm:py-2 sm:text-sm">
                                        Side
                                      </th>
                                      <th className="w-36 px-1 py-1.5 text-left text-[10px] text-neutral-400 sm:w-48 sm:px-2 sm:py-2 sm:text-sm">
                                        Token
                                      </th>
                                      <th className="w-20 px-1 py-1.5 text-left text-[10px] text-neutral-400 sm:w-24 sm:px-2 sm:py-2 sm:text-sm">
                                        <div className="flex items-center gap-0.5 sm:gap-1">
                                          <span>Amount</span>
                                          <button
                                            onClick={() => setShowUSD(!showUSD)}
                                            className={`transition-colors ${showUSD ? "text-green-400" : "text-neutral-400 hover:text-neutral-300"}`}
                                            title={
                                              showUSD
                                                ? "Switch to SOL"
                                                : "Switch to USD"
                                            }
                                          >
                                            <RiExchangeDollarLine className="h-3 w-3 sm:h-4 sm:w-4" />
                                          </button>
                                        </div>
                                      </th>
                                      <th className="w-16 px-1 py-1.5 text-left text-[10px] text-neutral-400 sm:w-24 sm:px-2 sm:py-2 sm:text-sm">
                                        MC
                                      </th>
                                      <th className="w-20 px-1 py-1.5 text-center text-[10px] text-neutral-400 sm:w-28 sm:px-2 sm:py-2 sm:text-sm">
                                        Quick Buy
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {liveTradesToRender.map((trade, idx) => {
                                      const wallet = wallets.find(
                                        (w) => w.address === trade.wallet,
                                      );
                                      const timeAgo = new Date(
                                        trade.at,
                                      ).toLocaleTimeString();

                                      // Prioritize websocket data (symbol/name) over metadata
                                      const metadata = tokenMetadata.get(
                                        trade.mint,
                                      );

                                      // Priority: websocket symbol > metadata symbol > websocket name > metadata name > fallback
                                      const displaySymbol =
                                        trade.symbol ||
                                        metadata?.symbol ||
                                        trade.name ||
                                        metadata?.name ||
                                        trade.mint.slice(0, 8) + "...";
                                      const displayName =
                                        trade.name || metadata?.name;

                                      // Debug: Log what we're displaying
                                      if (
                                        displaySymbol ===
                                        trade.mint.slice(0, 8) + "..."
                                      ) {
                                        console.log(
                                          "[Live Trades] Showing fallback address for",
                                          trade.mint.slice(0, 8),
                                          {
                                            trade_symbol: trade.symbol,
                                            trade_name: trade.name,
                                            metadata_symbol: metadata?.symbol,
                                            metadata_name: metadata?.name,
                                            has_metadata: !!metadata,
                                          },
                                        );
                                      }

                                      // Get token image URL - prioritize metadata image and normalize it
                                      const rawImg = metadata?.image;
                                      const tokenImageUrl =
                                        normalizeAssetUrl(rawImg);
                                      const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                                        displaySymbol || "T",
                                      )}&background=0f1012&color=E6E7EA&size=28`;
                                      const launchpadProtocol =
                                        metadata?.launchpad_protocol?.toLowerCase() ||
                                        "";

                                      // Get protocol icon (exact logic from PulseTable)
                                      const getProtocolIcon = (
                                        protocol: string,
                                      ): string => {
                                        if (!protocol)
                                          return "https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png";
                                        if (protocol.includes("pump"))
                                          return "https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png";
                                        if (protocol.includes("meteora"))
                                          return "https://s1.coincarp.com/logo/1/meteora.png?style=72&v=1759911013";
                                        if (protocol.includes("raydium"))
                                          return "https://s2.coinmarketcap.com/static/img/coins/64x64/8526.png";
                                        if (protocol.includes("boop"))
                                          return "https://api.phantom.app/image-proxy/?image=https%3A%2F%2Fdhc7eusqrdwa0.cloudfront.net%2Fassets%2FBOOP_logo_icon_dark_bg.png&anim=true";
                                        if (
                                          protocol.includes("moonit") ||
                                          protocol.includes("moonshot") ||
                                          protocol.includes("moonshoot")
                                        )
                                          return "https://avatars.githubusercontent.com/u/174132191?s=280&v=4";
                                        if (protocol.includes("bonk"))
                                          return "https://s3.coinmarketcap.com/static-gravity/image/a28128d9ff7c49c9ad33ee2f626fda40.png";
                                        if (protocol.includes("bags"))
                                          return "https://play-lh.googleusercontent.com/7AxVcu1pumxavcGTb16WBJQU88CDZd0v8q0WzFwfin7zbBvItYMuNQ0Xkqq4srTw4A=w240-h480-rw";
                                        if (protocol.includes("launch"))
                                          return "https://s2.coinmarketcap.com/static/img/coins/64x64/8526.png";
                                        return "https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png";
                                      };

                                      // Get protocol color (exact logic from PulseTable)
                                      const getProtocolColor = (
                                        protocol: string,
                                      ): string => {
                                        if (!protocol) return "#22c55e";
                                        if (protocol.includes("pump"))
                                          return "#22c55e";
                                        if (protocol.includes("meteora"))
                                          return "#ff4662";
                                        if (protocol.includes("raydium"))
                                          return "#5c51f7";
                                        if (
                                          protocol.includes("moonit") ||
                                          protocol.includes("moonshot") ||
                                          protocol.includes("moonshoot")
                                        )
                                          return "#eab308";
                                        if (protocol.includes("boop"))
                                          return "#134577";
                                        if (protocol.includes("bonk"))
                                          return "#ff6b35";
                                        if (protocol.includes("bags"))
                                          return "#22c55e";
                                        if (protocol.includes("launch"))
                                          return "#3b82f6";
                                        if (protocol.includes("orca"))
                                          return "#0ea5e9";
                                        if (protocol.includes("jupiter"))
                                          return "#8b5cf6";
                                        return "#22c55e";
                                      };

                                      const protocolIcon =
                                        getProtocolIcon(launchpadProtocol);
                                      const protocolColor =
                                        getProtocolColor(launchpadProtocol);

                                      // Check if token should have full circle image (no white space)
                                      const isMeteora =
                                        launchpadProtocol.includes("meteora");
                                      const isBonk =
                                        launchpadProtocol.includes("bonk");
                                      const isBags =
                                        launchpadProtocol.includes("bags");
                                      const isMoonit =
                                        launchpadProtocol.includes("moonit") ||
                                        launchpadProtocol.includes(
                                          "moonshot",
                                        ) ||
                                        launchpadProtocol.includes("moonshoot");
                                      const isFullCircleImage =
                                        isMeteora ||
                                        isBonk ||
                                        isBags ||
                                        isMoonit;

                                      const tokenAgeLabel = formatTokenAge(
                                        (trade as any).created_at ??
                                          (trade as any).createdAt ??
                                          null,
                                      );

                                      return (
                                        <tr
                                          key={`${trade.tx}-${idx}`}
                                          className="group relative border-b border-neutral-800/50 transition-all duration-300"
                                          style={{
                                            backgroundColor:
                                              trade.side === "buy"
                                                ? "rgba(34, 197, 94, 0.08)"
                                                : "rgba(239, 68, 68, 0.08)",
                                          }}
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor =
                                              trade.side === "buy"
                                                ? "rgba(34, 197, 94, 0.15)"
                                                : "rgba(239, 68, 68, 0.15)";
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor =
                                              trade.side === "buy"
                                                ? "rgba(34, 197, 94, 0.08)"
                                                : "rgba(239, 68, 68, 0.08)";
                                          }}
                                        >
                                          <td className="w-16 px-1 py-1.5 text-[9px] text-neutral-400 sm:w-20 sm:px-2 sm:py-2 sm:text-xs">
                                            {timeAgo}
                                          </td>
                                          <td className="w-20 px-1 py-1.5 font-mono text-[9px] sm:w-24 sm:px-2 sm:py-2 sm:text-xs">
                                            <span
                                              className="truncate"
                                              title={trade.wallet}
                                            >
                                              {wallet?.emoji || "💼"}{" "}
                                              {wallet?.name ||
                                                trade.wallet.slice(0, 4) +
                                                  "..."}
                                            </span>
                                          </td>
                                          <td className="w-10 px-1 py-1.5 sm:w-12 sm:px-2 sm:py-2">
                                            <span
                                              className={`rounded px-0.5 py-0.5 text-[9px] font-semibold sm:px-1 sm:text-[10px] ${
                                                trade.side === "buy"
                                                  ? "bg-green-500/20 text-green-400"
                                                  : "bg-red-500/20 text-red-400"
                                              }`}
                                            >
                                              {trade.side.toUpperCase()}
                                            </span>
                                          </td>
                                          <td className="w-36 px-1 py-1.5 sm:w-48 sm:px-2 sm:py-2">
                                            <button
                                              onClick={async () => {
                                                // Use liquidity pool / trading pair address (pair_address) for navigation
                                                // This should be pre-resolved by WalletTrackerContext, but we have a fallback
                                                let tokenAddress =
                                                  trade.pair_address;

                                                // Fallback: if pair_address is not available, resolve it now
                                                if (
                                                  !tokenAddress &&
                                                  trade.mint
                                                ) {
                                                  console.log(
                                                    "[Trackers] pair_address not found, resolving from mint:",
                                                    trade.mint,
                                                  );

                                                  try {
                                                    // First try to get it from token search (most reliable)
                                                    const searchResponse =
                                                      await fetch(
                                                        `/api/token-service/search?phrase=${encodeURIComponent(trade.mint)}&limit=1`,
                                                      );

                                                    if (searchResponse.ok) {
                                                      const searchData =
                                                        await searchResponse.json();
                                                      if (
                                                        searchData.tokens &&
                                                        searchData.tokens
                                                          .length > 0
                                                      ) {
                                                        const token =
                                                          searchData.tokens[0];
                                                        tokenAddress =
                                                          token.pair_address ||
                                                          token.poolId;
                                                        console.log(
                                                          "[Trackers] Resolved pair_address from search:",
                                                          tokenAddress,
                                                        );
                                                      }
                                                    }

                                                    // Fallback to hydrate-pair if search didn't work
                                                    if (!tokenAddress) {
                                                      const hydrateResponse =
                                                        await fetch(
                                                          "/api/token-service/hydrate-pair",
                                                          {
                                                            method: "POST",
                                                            headers: {
                                                              "Content-Type":
                                                                "application/json",
                                                            },
                                                            body: JSON.stringify(
                                                              {
                                                                mint: trade.mint,
                                                              },
                                                            ),
                                                          },
                                                        );

                                                      if (hydrateResponse.ok) {
                                                        const hydrateData =
                                                          await hydrateResponse.json();
                                                        tokenAddress =
                                                          hydrateData.pair_address ||
                                                          hydrateData.poolId;
                                                        console.log(
                                                          "[Trackers] Resolved pair_address from hydrate:",
                                                          tokenAddress,
                                                        );
                                                      }
                                                    }
                                                  } catch (error) {
                                                    console.warn(
                                                      "[Trackers] Failed to resolve pair_address:",
                                                      error,
                                                    );
                                                  }
                                                }

                                                // Final fallback to mint if resolution failed
                                                if (!tokenAddress) {
                                                  tokenAddress = trade.mint;
                                                  console.warn(
                                                    "[Trackers] Using mint as fallback:",
                                                    tokenAddress,
                                                  );
                                                }

                                                console.log(
                                                  "[Trackers] Navigating with address:",
                                                  tokenAddress,
                                                  "for token:",
                                                  displaySymbol,
                                                );
                                                window.location.href = `/trade/${tokenAddress}`;
                                              }}
                                              className="flex cursor-pointer items-center gap-1 font-mono text-[9px] text-emerald-300 transition-colors hover:text-emerald-200 sm:gap-2 sm:text-xs"
                                              title={displayName || undefined}
                                            >
                                              {/* Token icon with protocol badge (smaller version of PulseTable) */}
                                              <div className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center sm:h-7 sm:w-7">
                                                {/* Main token image with border */}
                                                <div
                                                  className="relative rounded-sm"
                                                  style={{
                                                    border: `1px solid ${protocolColor}B3`,
                                                    padding: "2px",
                                                    backgroundColor: "#06070b",
                                                  }}
                                                >
                                                  <div className="relative h-4 w-4 overflow-hidden rounded-sm sm:h-[22px] sm:w-[22px]">
                                                    <img
                                                      src={
                                                        tokenImageUrl ||
                                                        fallbackAvatar
                                                      }
                                                      alt={
                                                        displayName ||
                                                        displaySymbol
                                                      }
                                                      className="h-full w-full object-cover"
                                                      onError={(e) => {
                                                        e.currentTarget.src =
                                                          fallbackAvatar;
                                                      }}
                                                    />
                                                  </div>
                                                </div>

                                                {/* Protocol badge icon (bottom-right corner) */}
                                                <div
                                                  className="absolute right-0 bottom-0 flex translate-x-1/4 translate-y-1/4 transform items-center justify-center rounded-full bg-white"
                                                  style={{
                                                    width: 10,
                                                    height: 10,
                                                    border: `1px solid ${protocolColor}`,
                                                    boxShadow: `0 0 2px ${protocolColor}60`,
                                                  }}
                                                >
                                                  <img
                                                    src={protocolIcon}
                                                    alt="Protocol"
                                                    className={`${isFullCircleImage ? "h-full w-full object-cover" : "h-3/4 w-3/4 object-contain"} rounded-full`}
                                                    style={{
                                                      filter:
                                                        protocolColor ===
                                                        "#eab308"
                                                          ? "sepia(1) saturate(3) hue-rotate(-10deg) brightness(1.1)"
                                                          : "none",
                                                    }}
                                                  />
                                                </div>
                                              </div>
                                              <div className="flex min-w-0 items-center gap-1 text-left leading-tight sm:gap-1.5">
                                                <span className="truncate text-xs font-medium text-neutral-100 sm:text-base">
                                                  {displaySymbol}
                                                </span>
                                                {(() => {
                                                  const age = getTokenAge(
                                                    metadata?.createdAt,
                                                  );
                                                  if (age) {
                                                    return (
                                                      <>
                                                        <span className="text-neutral-500">
                                                          •
                                                        </span>
                                                        <span className="text-sm font-medium whitespace-nowrap text-green-400">
                                                          {age}
                                                        </span>
                                                      </>
                                                    );
                                                  }
                                                  return null;
                                                })()}
                                              </div>
                                            </button>
                                          </td>
                                          <td className="w-20 px-1 py-1.5 text-[9px] text-neutral-200 sm:w-24 sm:px-2 sm:py-2 sm:text-xs">
                                            <div className="flex items-center gap-0.5 sm:gap-1">
                                              {showUSD ? (
                                                <span className="text-[9px] font-semibold text-green-400 sm:text-xs">
                                                  $
                                                </span>
                                              ) : (
                                                <SiSolana
                                                  className="inline-block h-2.5 w-2.5 flex-shrink-0 sm:h-3 sm:w-3"
                                                  aria-hidden="true"
                                                  style={{
                                                    color: "unset",
                                                    fill: "url(#solana-gradient-tracker)",
                                                    filter: "none",
                                                  }}
                                                />
                                              )}
                                              <span className="text-[9px] sm:text-xs">
                                                {(() => {
                                                  if (showUSD) {
                                                    // Display USD price from websocket
                                                    if (
                                                      trade.price_usd !==
                                                        null &&
                                                      trade.price_usd !==
                                                        undefined
                                                    ) {
                                                      // Format USD with commas and 2 decimal places
                                                      return new Intl.NumberFormat(
                                                        "en-US",
                                                        {
                                                          minimumFractionDigits: 2,
                                                          maximumFractionDigits: 2,
                                                        },
                                                      ).format(trade.price_usd);
                                                    }
                                                    return "-";
                                                  } else {
                                                    // Display SOL amount with 4 decimal places
                                                    if (
                                                      trade.sol_spent !==
                                                        null &&
                                                      trade.sol_spent !==
                                                        undefined
                                                    ) {
                                                      // Check if value is in lamports (very large numbers) and convert to SOL
                                                      let solAmount = Math.abs(
                                                        trade.sol_spent,
                                                      );
                                                      if (solAmount > 1000) {
                                                        // Likely in lamports, convert to SOL (1 SOL = 1e9 lamports)
                                                        solAmount =
                                                          solAmount / 1e9;
                                                      }
                                                      return solAmount.toFixed(
                                                        4,
                                                      );
                                                    }
                                                    // Fallback to token amount if sol_spent is not available
                                                    return `${trade.amount.toFixed(4)} tokens`;
                                                  }
                                                })()}
                                              </span>
                                            </div>
                                          </td>
                                          <td className="w-16 px-1 py-1.5 text-[9px] text-neutral-300 sm:w-24 sm:px-2 sm:py-2 sm:text-xs">
                                            {(() => {
                                              const marketCap =
                                                metadata?.market_cap_usd;
                                              if (!marketCap || marketCap === 0)
                                                return (
                                                  <span className="text-neutral-500">
                                                    -
                                                  </span>
                                                );
                                              return `$${formatMarketCap(marketCap)}`;
                                            })()}
                                          </td>
                                          <td className="w-20 px-1 py-1.5 sm:w-28 sm:px-2 sm:py-2">
                                            <div className="flex items-center justify-center">
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleQuickBuy(trade);
                                                }}
                                                className="z-50 flex cursor-pointer items-center justify-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold whitespace-nowrap opacity-0 shadow-sm transition-all duration-200 ease-out group-hover:opacity-100 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm"
                                                style={{
                                                  backgroundColor: "#18c48c",
                                                  color: "#000000",
                                                  border:
                                                    "1px solid rgba(0,0,0,0.15)",
                                                }}
                                                onMouseEnter={(e) => {
                                                  e.currentTarget.style.backgroundColor =
                                                    "#12a877";
                                                  e.currentTarget.style.transform =
                                                    "translateY(-1px)";
                                                  e.currentTarget.style.boxShadow =
                                                    "0 4px 14px rgba(112, 224, 176, 0.25)";
                                                }}
                                                onMouseLeave={(e) => {
                                                  e.currentTarget.style.backgroundColor =
                                                    "#18c48c";
                                                  e.currentTarget.style.transform =
                                                    "translateY(0)";
                                                  e.currentTarget.style.boxShadow =
                                                    "none";
                                                }}
                                              >
                                                <HiLightningBolt className="h-2.5 w-2.5 text-black sm:h-3.5 sm:w-3.5" />
                                                <span className="text-[9px] sm:text-xs">
                                                  {quickBuyAmount} SOL
                                                </span>
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
                    </>
                  )}
                </div>
              )}

              {/* RESIZE HANDLE (desktop only) - Hide when wallet section is hidden (Monad chain) */}
              {!isMobile && (
                <div
                  className="group relative hidden h-full min-h-[530px] w-1 cursor-ew-resize items-center justify-center transition-colors hover:bg-emerald-400/10 lg:flex"
                  onMouseDown={() => setIsResizing(true)}
                >
                  <div className="absolute h-16 w-1 rounded-full bg-neutral-700 transition-colors group-hover:bg-emerald-400" />
                </div>
              )}

              {/* RIGHT: TWITTER SECTION */}
              {showTwitterSection && (
                <div
                  className="flex h-full min-h-[400px] flex-shrink-0 flex-col overflow-hidden border border-neutral-900/80 bg-[#050608] px-2 sm:min-h-[530px] sm:px-2.5"
                  style={
                    isMobile
                      ? {
                          maxHeight: "calc(100vh - 140px)",
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
                  <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-neutral-800/60 pt-2 pb-1.5 sm:gap-2 sm:pt-4 sm:pb-2">
                    <div className="flex gap-1 sm:gap-2">
                      {TWITTER_TABS.map((tab, i) => (
                        <button
                          key={tab}
                          className={`cursor-pointer rounded-lg px-2 py-0.5 text-[10px] whitespace-nowrap transition-all duration-300 sm:px-3 sm:py-1 sm:text-xs ${
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
                        className="cursor-pointer rounded-lg px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-neutral-900 transition-all duration-300 sm:px-3 sm:py-1 sm:text-xs"
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
                  <div className="min-h-0 flex-1 overflow-y-auto">
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
                          <div className="scrollbar-hide overflow-x-auto">
                            <table className="w-full min-w-[400px] text-[10px] sm:min-w-[520px] sm:text-xs">
                              <thead>
                                <tr className="border-b border-neutral-800/60">
                                  <th className="px-1 py-1.5 text-left text-[10px] text-neutral-400 sm:px-2 sm:py-2 sm:text-sm">
                                    Account
                                  </th>
                                  <th className="px-1 py-1.5 text-left text-[10px] text-neutral-400 sm:px-2 sm:py-2 sm:text-sm">
                                    Followers
                                  </th>
                                  <th className="px-1 py-1.5 text-left text-[10px] text-neutral-400 sm:px-2 sm:py-2 sm:text-sm">
                                    Added
                                  </th>
                                  <th className="px-1 py-1.5 text-right text-[10px] text-neutral-400 sm:px-2 sm:py-2 sm:text-sm">
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
                                <p className="mb-2 text-sm break-words whitespace-pre-wrap text-neutral-200">
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
          chain={selectedChain}
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
                    emoji: wallet.emoji || getRandomEmoji(),
                    createdAt: Date.now(),
                  };
                }
                // Handle standard format - ensure all required fields exist
                return {
                  address: wallet.address,
                  name: wallet.name || "Imported Wallet",
                  emoji: wallet.emoji || getRandomEmoji(),
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

              const total = walletsToAdd.length;
              let successCount = 0;
              let errorCount = 0;

              if (total === 0) {
                onProgress?.(0, 0);
                showToastMessage(
                  composeImportSummary({
                    successCount: 0,
                    duplicateExisting,
                    duplicateWithinImport,
                    invalidWallets,
                    skippedByLimit: [],
                    failedCount: 0,
                  }),
                );
                return;
              }

              onProgress?.(0, total);

              let processed = 0;
              const bulkPayload = walletsToAdd.map((wallet) => ({
                wallet: wallet.address,
                walletName: wallet.name,
                emoji: wallet.emoji || getRandomEmoji(),
              }));

              await addTrackedWalletsBulk(bulkPayload, user?.id, selectedChain, user?.bearerToken);
              await ensureNotificationsEnabled(walletsToAdd);
              successCount = walletsToAdd.length;
              processed = walletsToAdd.length;
              onProgress?.(processed, total);

              if (typeof window !== "undefined") {
                walletsToAdd.forEach((wallet) => {
                  localStorage.setItem(
                    `wallet_notifications_${wallet.address}`,
                    JSON.stringify(true),
                  );
                });
              }

              await loadWalletsFromBackend();

              showToastMessage(
                composeImportSummary({
                  successCount,
                  duplicateExisting,
                  duplicateWithinImport,
                  invalidWallets,
                  skippedByLimit: [],
                  failedCount: errorCount,
                }),
              );
            } catch (error) {
              console.error("Import error:", error);
              showToastMessage(
                (error as Error)?.message || "Failed to import wallets",
              );
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

        {/* Filter Popout */}
        {isFilterPopoutOpen && (
          <FilterPopout
            open={isFilterPopoutOpen}
            onClose={() => setIsFilterPopoutOpen(false)}
            onApplyFilters={(filters) => setLocalFilters(filters)}
            currentFilters={localFilters}
          />
        )}

        <Footer />
      </div>
    </>
  );
}
