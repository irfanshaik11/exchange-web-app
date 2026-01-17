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

const TABS = ["Wallet Manager"];
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

export default function TrackersPage() {
  const router = useRouter();
  const { user, solBalance, walletList, walletBalances, selectedWalletIds } =
    useUser();
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
  const [trackedWalletBalances, setTrackedWalletBalances] = useState<
    Record<string, number>
  >({});
  const [lastActiveMap, setLastActiveMap] = useState<
    Record<string, number | null | undefined>
  >({});
  // Get chain from router query first, then localStorage, then default to solana
  const currentChain = (() => {
    if (router.query.chain) {
      return router.query.chain as string;
    }
    if (typeof window !== "undefined") {
      const savedChain = localStorage.getItem("selected-chain");
      if (savedChain === "sol" || savedChain === "monad") {
        return savedChain;
      }
    }
    return "sol";
  })();
  const selectedChain =
    currentChain === "monad" || currentChain === "sol" ? currentChain : "sol";
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
          const walletData = watchedWallets.find(
            (w) => w.address === wallet.address,
          );
          const walletChain = walletData?.chain || selectedChain;
          return toggleWalletNotifications(
            wallet.address,
            true,
            user?.id,
            walletChain,
            user?.bearerToken,
          );
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
    showEnhancedToast("warning", WALLET_LIMIT_MESSAGE, {
      duration: 4000,
    });
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
            setTrackedWalletBalances(parsedCache.balances);
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
        setTrackedWalletBalances({});
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
      const tracked = await getTrackedWallets(
        user?.bearerToken,
        user?.id,
        selectedChain,
      );

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
      setTrackedWalletBalances((prev) => {
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
      console.log(
        `[Trackers] Fetching balances for ${allWallets.length} wallets:`,
        allWallets.map((w) => ({
          address: w.address.slice(0, 8) + "...",
          chain: w.chain,
        })),
      );
      allWallets.forEach(async (wallet) => {
        // Use wallet.chain from backend, fallback to selectedChain if not available
        const walletChain =
          wallet.chain === "monad" || wallet.chain === "sol"
            ? wallet.chain
            : selectedChain;
        console.log(
          `[Trackers] Fetching balance for wallet ${wallet.address.slice(0, 8)}... (chain from wallet: ${wallet.chain}, using: ${walletChain})`,
        );
        try {
          const balance = await getWalletBalance(wallet.address, walletChain);
          console.log(
            `[Trackers] Got balance for ${wallet.address.slice(0, 8)}...: ${balance} (chain: ${walletChain})`,
          );
          if (balance !== null && !isNaN(balance)) {
            setTrackedWalletBalances((prev) => {
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
            console.warn(
              `[Trackers] Balance is null or NaN for wallet ${wallet.address.slice(0, 8)}... (chain: ${walletChain})`,
            );
          }
        } catch (error) {
          console.error(
            `[Trackers] Error fetching balance for wallet ${wallet.address.slice(0, 8)}... (chain: ${walletChain}):`,
            error,
          );
        }
      });
    } catch (error) {
      console.error("Failed to load wallets:", error);
      // Don't clear state on error - keep showing cached data
    }
  };

  const loadTrackedWallets = loadWalletsFromBackend;

  useEffect(() => {}, [activeTab]);

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
        const monadWallets = watchedWallets
          .filter((w) => w.chain === "monad")
          .map((w) => w.address);
        const solWallets = watchedWallets
          .filter((w) => w.chain !== "monad")
          .map((w) => w.address);

        console.log("[trackers:lastActive] fetching timestamps:", {
          monad: monadWallets.length,
          sol: solWallets.length,
        });

        const map: Record<string, number | null> = {};

        // Fetch Monad wallets using Blockvision API
        if (monadWallets.length > 0) {
          if (!BLOCKVISION_API_KEY) {
            console.warn(
              "[trackers:lastActive] BLOCKVISION_API_KEY not set, skipping Monad wallets",
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

                console.log("[trackers:lastActive] Monad wallet result", {
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
                "[trackers:lastActive] direct Blockvision fetch failed (likely CORS). Falling back to proxy",
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
                  "[trackers:lastActive] Proxy fallback failed:",
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
                    "[trackers:lastActive] Monad wallet fetch failed",
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
              "[trackers:lastActive] Failed to fetch Solana last active:",
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
    chain?: "sol" | "monad",
  ) => {
    if (isAtWalletLimit) {
      showWalletLimitToast();
      return;
    }

    try {
      const walletChain = chain || "monad";
      // Add to backend with notifications enabled by default
      await addTrackedWallet(
        address,
        name,
        user?.id,
        emoji,
        true,
        walletChain,
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

      setShowAddWalletModal(false);

      showEnhancedToast("success", "Wallet added!", {
        duration: 3000,
      });
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
          wallets.map((w) =>
            removeTrackedWallet(
              w.address,
              user?.id,
              selectedChain,
              user?.bearerToken,
            ),
          ),
        );

        // Clear all state
        setWatchedWallets([]);
        setWallets([]);
        setTrackedWalletBalances({});

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
        const wallet = watchedWallets.find(
          (w) => w.address === addressToRemove,
        );
        const walletChain = wallet?.chain || selectedChain;
        await removeTrackedWallet(
          addressToRemove,
          user?.id,
          walletChain,
          user?.bearerToken,
        );

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
      walletContext: {
        selectedWalletIds: selectedWalletIds?.sol || [],
        walletList: walletList || [],
        walletBalances: walletBalances || {},
        chain: selectedChain === "monad" ? "monad" : "sol",
      },
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
      const accounts = await getTrackedTwitterAccounts(user?.bearerToken || "");
      setTwitterAccounts(accounts);
    } catch (error) {
      console.error("Failed to load tracked Twitter accounts:", error);
      setTwitterAccounts([]);
    }
  };

  const handleAddTwitterAccount = async (username: string) => {
    try {
      await addTrackedTwitterAccount(username, user?.bearerToken || "");
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
      await removeTrackedTwitterAccount(username, user?.bearerToken || "");
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

          await addTrackedWalletsBulk(
            bulkPayload,
            user?.id,
            selectedChain,
            user?.bearerToken,
          );
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

          showEnhancedToast(
            "warning",
            composeImportSummary({
              successCount,
              duplicateExisting,
              duplicateWithinImport,
              invalidWallets,
              skippedByLimit: [],
              failedCount: errorCount,
            }),
            {
              duration: 5000,
            },
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
        <title>Trackers | Interstate Memeboard</title>
      </Head>
      <div className="mb-20">
        <div className="flex min-h-screen flex-col bg-[#050608] text-neutral-100">
          <Header isSticky={false} />
          <div className="mt-4 mb-2 flex flex-col gap-4 px-4 sm:my-6 sm:mb-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:px-8">
            {/* Tabs Section - Scrollable on mobile */}
            <div className="scrollbar-hide -mx-4 flex items-center gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:gap-4 sm:px-6 lg:mx-0 lg:gap-6 lg:px-0 lg:pb-0">
              <h1 className="text-lg lg:text-xl !font-bold text-white font-geist">
                Trackers
              </h1>
            </div>
          </div>
          <div className="mb-4 flex min-h-0 w-full flex-1 flex-col px-2 sm:mb-8 sm:px-6">
            {/* Main Content Area: Two Columns */}
            <div className="flex min-h-0 flex-1 flex-col gap-3 sm:gap-4 lg:flex-row">
              {isMobile && (
                <div className="flex w-full rounded-xl border border-neutral-800/50 bg-[#0F0F0F] p-1 text-[10px] font-medium text-neutral-400 shadow-lg sm:p-1.5 sm:text-xs">
                  <button
                    className={`flex-1 rounded-lg px-3 py-2 transition-all duration-300 sm:px-4 sm:py-2.5 ${
                      mobileMainTab === "wallets"
                        ? "bg-[#7FFFC9] font-semibold text-neutral-900 shadow-[0_0_12px_rgba(127,255,201,0.3)]"
                        : "text-neutral-300 hover:bg-neutral-800/30 hover:text-neutral-200"
                    }`}
                    onClick={() => setMobileMainTab("wallets")}
                  >
                    Wallet Tracker
                  </button>
                  <button
                    className={`flex-1 rounded-lg px-3 py-2 transition-all duration-300 sm:px-4 sm:py-2.5 ${
                      mobileMainTab === "twitter"
                        ? "bg-[#7FFFC9] font-semibold text-neutral-900 shadow-[0_0_12px_rgba(127,255,201,0.3)]"
                        : "text-neutral-300 hover:bg-neutral-800/30 hover:text-neutral-200"
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
                  className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-neutral-800/60 bg-[#0A0A0A] px-3 pb-4 shadow-2xl backdrop-blur-sm sm:px-5"
                  style={{
                    boxShadow:
                      "0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(127, 255, 201, 0.05)",
                    maxHeight: isMobile
                      ? "calc(100vh - 200px)"
                      : "calc(100vh - 240px)",
                  }}
                >
                  {/* If user is not logged in, show GMGN-style empty state */}
                  {!user ? (
                    <div className="flex flex-1 items-center justify-center">
                      <div className="text-center">
                        <p className="mb-4 text-sm text-neutral-400">
                          You are not logged in to Interstate
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
                      <div className="flex justify-between gap-3 border-b border-neutral-800/40 py-3 sm:items-center sm:gap-4 sm:py-4">
                        {/* Left: tabs + wallet count */}
                        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                          {TABS.map((tab, i) => (
                            <button
                              key={tab}
                              className={`cursor-pointer border-b-2 px-3 py-2 text-[10px] whitespace-nowrap transition-all duration-300 sm:px-4 sm:py-2.5 sm:text-xs ${
                                activeTab === i
                                  ? "border-[#7FFFC9] font-semibold text-neutral-100"
                                  : "border-transparent font-medium text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
                              }`}
                              onClick={() => setActiveTab(i)}
                            >
                              {tab}
                            </button>
                          ))}
                          <div className="flex items-center rounded-lg border border-neutral-800/50 bg-neutral-900/60 px-3 py-1 text-[10px] text-neutral-300 sm:px-3.5 sm:py-1.5 sm:text-[11px]">
                            <span className="font-semibold text-[#7FFFC9]">
                              {watchedWallets.length}
                            </span>
                            <span className="ml-1 hidden text-neutral-500 sm:ml-1.5 sm:inline">
                              /{MAX_WALLETS} wallet
                              {watchedWallets.length === 1 ? "" : "s"}
                            </span>
                            <span className="ml-1 text-neutral-500 sm:ml-1.5 sm:hidden">
                              /{MAX_WALLETS}
                            </span>
                          </div>
                        </div>

                        {/* Middle: search bar (center, max width) */}
                        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-2.5">
                          {activeTab === 0 && (
                            <button
                              className="rounded-lg px-3 py-1.5 text-[9px] font-semibold whitespace-nowrap shadow-lg transition-all duration-300 sm:px-5 sm:py-2.5 sm:text-xs"
                              style={{
                                backgroundColor: "#7FFFC9",
                                color: "#000000",
                                border: "none",
                              }}
                              onClick={handleOpenAddWalletModal}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  "#6EE8B8";
                                e.currentTarget.style.boxShadow =
                                  "0 0 16px rgba(127, 255, 201, 0.4), 0 4px 12px rgba(127, 255, 201, 0.2)";
                                e.currentTarget.style.transform =
                                  "translateY(-1px)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  "#7FFFC9";
                                e.currentTarget.style.boxShadow =
                                  "0 4px 12px rgba(0, 0, 0, 0.3)";
                                e.currentTarget.style.transform =
                                  "translateY(0)";
                              }}
                            >
                              Add Wallet
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Search bar and action toolbar - below header, only for Wallet Manager tab */}
                      {activeTab === 0 && (
                        <div className="border-b border-neutral-800/40 px-1 py-3 sm:px-2 sm:py-4">
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            {/* Search input */}
                            <div className="min-w-[200px] flex-1">
                              <input
                                type="text"
                                placeholder="Search by address"
                                className="w-full rounded-lg border border-neutral-800/60 bg-neutral-900/40 px-4 py-2 text-[10px] text-neutral-200 transition-all duration-300 placeholder:text-neutral-500 focus:border-[#7FFFC9]/60 focus:bg-neutral-900/60 focus:ring-2 focus:ring-[#7FFFC9]/20 focus:outline-none sm:px-5 sm:py-2.5 sm:text-xs"
                                disabled={false}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                              />
                            </div>

                            {/* Right: actions (Import / Export / icons / Add Wallet) */}
                            <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                              {activeTab === 0 && (
                                <>
                                  <button
                                    className="rounded-lg border border-neutral-800/50 bg-neutral-900/60 px-2.5 py-1.5 text-[9px] font-semibold whitespace-nowrap text-neutral-200 transition-all duration-300 hover:border-neutral-700/70 hover:bg-neutral-800/80 hover:text-white sm:px-3 sm:py-1.5 sm:text-[10px]"
                                    onClick={() => setShowImportModal(true)}
                                  >
                                    Import
                                  </button>
                                  <button
                                    className="rounded-lg border border-neutral-800/50 bg-neutral-900/60 px-2.5 py-1.5 text-[9px] font-semibold whitespace-nowrap text-neutral-200 transition-all duration-300 hover:border-neutral-700/70 hover:bg-neutral-800/80 hover:text-white sm:px-3 sm:py-1.5 sm:text-[10px]"
                                    onClick={handleExportAddresses}
                                  >
                                    Export
                                  </button>

                                  {/* Icon buttons - hide some on mobile */}
                                  <button
                                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-800/50 bg-neutral-900/60 text-sm text-neutral-400 transition-all duration-300 hover:border-neutral-700/70 hover:bg-neutral-800/80 hover:text-white sm:h-9 sm:w-9"
                                    type="button"
                                  >
                                    <FiSettings className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                  </button>
                                  <button
                                    className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all duration-300 sm:h-9 sm:w-9 ${
                                      isTogglingAllNotifications
                                        ? "cursor-not-allowed border-neutral-800/50 bg-neutral-900/60 opacity-50"
                                        : allNotificationsEnabled
                                          ? "cursor-pointer border-pink-500/50 bg-pink-500/20 hover:bg-pink-500/30"
                                          : "cursor-pointer border-neutral-800/50 bg-neutral-900/60 hover:border-neutral-700/70 hover:bg-neutral-800/80"
                                    }`}
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
                                      className={`h-4 w-4 ${
                                        allNotificationsEnabled
                                          ? "fill-pink-400 text-pink-400"
                                          : "text-neutral-500"
                                      }`}
                                    />
                                  </button>
                                  <button
                                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-800/50 bg-neutral-900/60 text-sm text-neutral-400 transition-all duration-300 hover:border-neutral-700/70 hover:bg-neutral-800/80 hover:text-white sm:h-9 sm:w-9"
                                    type="button"
                                  >
                                    <FiShare2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                  </button>
                                  <button
                                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-800/50 bg-neutral-900/60 text-sm text-neutral-400 transition-all duration-300 hover:border-neutral-700/70 hover:bg-neutral-800/80 hover:text-white sm:h-9 sm:w-9"
                                    type="button"
                                  >
                                    <FiRss className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

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
                                        trackedWalletBalances[wallet.address];
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
                                          onClick={(wallet) => {
                                            // Open wallet transactions page in a new tab
                                            const url = `/wallet/${wallet.address}`;
                                            window.open(url, "_blank");
                                          }}
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
                        ) : null}
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
                  className="flex min-h-0 flex-shrink-0 flex-col overflow-hidden rounded-xl border border-neutral-800/60 bg-[#0A0A0A] px-3 shadow-2xl backdrop-blur-sm sm:px-4"
                  style={
                    isMobile
                      ? {
                          boxShadow:
                            "0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(127, 255, 201, 0.05)",
                          maxHeight: "calc(100vh - 200px)",
                        }
                      : {
                          width: `${sidebarWidth}px`,
                          minWidth: "372px",
                          maxWidth: "800px",
                          maxHeight: "calc(100vh - 240px)",
                          boxShadow:
                            "0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(127, 255, 201, 0.05)",
                        }
                  }
                >
                  {/* Twitter Tabs Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800/40 pt-3 pb-2 sm:gap-3 sm:pt-4 sm:pb-3">
                    <div className="flex gap-2 sm:gap-2.5">
                      {TWITTER_TABS.map((tab, i) => (
                        <button
                          key={tab}
                          className={`cursor-pointer border-b-2 px-3 py-2 text-[10px] whitespace-nowrap transition-all duration-300 sm:px-4 sm:py-2.5 sm:text-xs ${
                            twitterTab === i
                              ? "border-neutral-600 bg-neutral-900/30 font-semibold text-neutral-100"
                              : "border-transparent font-medium text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
                          }`}
                          onClick={() => setTwitterTab(i)}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>
                    {twitterTab === 0 && (
                      <button
                        className="cursor-pointer rounded-lg px-3 py-1.5 text-[9px] font-semibold whitespace-nowrap text-black shadow-lg transition-all duration-300 sm:px-5 sm:py-2.5 sm:text-xs"
                        style={{
                          backgroundColor: "#7FFFC9",
                          border: "none",
                        }}
                        onClick={() => setShowAddTwitterModal(true)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "#6EE8B8";
                          e.currentTarget.style.boxShadow =
                            "0 0 16px rgba(127, 255, 201, 0.4), 0 4px 12px rgba(127, 255, 201, 0.2)";
                          e.currentTarget.style.transform = "translateY(-1px)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "#7FFFC9";
                          e.currentTarget.style.boxShadow =
                            "0 4px 12px rgba(0, 0, 0, 0.3)";
                          e.currentTarget.style.transform = "translateY(0)";
                        }}
                      >
                        Add Handle
                      </button>
                    )}
                  </div>

                  {/* Twitter Content */}
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
                          <div className="scrollbar-hide flex-1 overflow-auto">
                            <table className="w-full min-w-[500px] text-[10px] sm:min-w-[640px] sm:text-xs">
                              <tbody>
                                {twitterAccounts.map((account) => (
                                  <TwitterAccountRow
                                    key={account.username}
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
                        {loadingTwitterFeed ? (
                          <div className="flex h-full flex-col items-center justify-center py-8 text-center">
                            <span className="mb-4 text-neutral-400">
                              Loading feed...
                            </span>
                          </div>
                        ) : twitterFeed.length === 0 ? (
                          <div className="flex h-full flex-col items-center justify-center py-8 text-center">
                            <span className="mb-4 text-neutral-400">
                              No tweets found
                            </span>
                          </div>
                        ) : (
                          <div className="space-y-2 p-2">
                            {twitterFeed.map((tweet) => (
                              <div
                                key={tweet.id}
                                className="rounded-lg border border-neutral-800/50 bg-neutral-900/30 p-3"
                              >
                                <div className="mb-2 flex items-center gap-2">
                                  {tweet.authorProfileImage ? (
                                    <img
                                      src={tweet.authorProfileImage}
                                      alt={tweet.authorName}
                                      className="h-8 w-8 rounded-full"
                                    />
                                  ) : (
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-700 text-xs text-neutral-300">
                                      {tweet.authorName.charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-medium text-neutral-200">
                                        {tweet.authorName}
                                      </span>
                                      <span className="text-xs text-neutral-400">
                                        @{tweet.authorUsername}
                                      </span>
                                      <span className="text-xs text-neutral-500">
                                        {new Date(
                                          tweet.createdAt,
                                        ).toLocaleString()}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <p className="mb-2 text-sm text-neutral-300">
                                  {tweet.text}
                                </p>
                                {tweet.images && tweet.images.length > 0 && (
                                  <div className="mb-2 flex gap-2">
                                    {tweet.images.map((img, idx) => (
                                      <img
                                        key={idx}
                                        src={img}
                                        alt={`Tweet image ${idx + 1}`}
                                        className="max-h-48 rounded-lg"
                                      />
                                    ))}
                                  </div>
                                )}

                                {/* Tweet Stats */}
                                <div className="flex items-center gap-4 text-xs text-neutral-500">
                                  <span>❤️ {tweet.likeCount || 0}</span>
                                  <span>🔄 {tweet.retweetCount || 0}</span>
                                  <span>💬 {tweet.replyCount || 0}</span>
                                  {tweet.url && (
                                    <a
                                      href={tweet.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[#70E0B0] hover:underline"
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
      </div>

      {/* Modals */}
      {/* {toast && (
        <div className="fixed right-4 bottom-4 z-50 rounded-lg bg-neutral-800 px-4 py-2 text-white">
          {toast}
        </div>
      )} */}
      {scannedWallet && (
        <WalletScanPanel
          wallet={scannedWallet}
          onClose={() => setScannedWallet(null)}
        />
      )}
      <AddWalletModal
        isOpen={showAddWalletModal}
        onClose={() => setShowAddWalletModal(false)}
        onAddWallet={handleAddWallet}
        chain={selectedChain}
      />
      <ImportExportWalletModal
        mode="import"
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={async (
          wallets: any[],
          onProgress?: (current: number, total: number) => void,
        ) => {
          try {
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

            wallets.forEach((wallet: any, index: number) => {
              if (onProgress) {
                onProgress(index + 1, wallets.length);
              }

              const transformedWallet = wallet?.trackedWalletAddress
                ? {
                    address: wallet.trackedWalletAddress,
                    name: wallet.name || "Imported Wallet",
                    emoji: wallet.emoji || getRandomEmoji(),
                  }
                : {
                    address: wallet?.address,
                    name: wallet?.name || "Imported Wallet",
                    emoji: wallet?.emoji || getRandomEmoji(),
                  };

              const normalized = normalizeAddress(transformedWallet.address);
              if (!normalized) {
                invalidWallets.push(transformedWallet.address);
                return;
              }
              if (existingAddresses.has(normalized)) {
                duplicateExisting.push(transformedWallet.address);
                return;
              }
              if (batchAddresses.has(normalized)) {
                duplicateWithinImport.push(transformedWallet.address);
                return;
              }
              batchAddresses.add(normalized);
              walletsToAdd.push(transformedWallet);
            });

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

            await addTrackedWalletsBulk(
              bulkPayload,
              user?.id,
              selectedChain,
              user?.bearerToken,
            );
            await ensureNotificationsEnabled(walletsToAdd);
            await loadWalletsFromBackend();
            setShowImportModal(false);

            const messages: string[] = [];
            if (walletsToAdd.length > 0) {
              messages.push(
                `Imported ${walletsToAdd.length} wallet${walletsToAdd.length === 1 ? "" : "s"}`,
              );
            }
            if (duplicateExisting.length > 0) {
              messages.push(
                `${duplicateExisting.length} duplicate${duplicateExisting.length === 1 ? "" : "s"} (already tracked)`,
              );
            }
            if (duplicateWithinImport.length > 0) {
              messages.push(
                `${duplicateWithinImport.length} duplicate${duplicateWithinImport.length === 1 ? "" : "s"} (within import)`,
              );
            }
            if (invalidWallets.length > 0) {
              messages.push(
                `${invalidWallets.length} invalid address${invalidWallets.length === 1 ? "" : "es"}`,
              );
            }
            const successCount = walletsToAdd.length;
            const summary = composeImportSummary({
              successCount,
              duplicateExisting,
              duplicateWithinImport,
              invalidWallets,
              skippedByLimit: [],
              failedCount: 0,
            });

            if (successCount > 0) {
              showEnhancedToast("success", summary, {
                duration: 5000,
              });
            } else {
              showEnhancedToast("warning", summary, {
                duration: 5000,
              });
            }
          } catch (error: any) {
            showToastMessage(error?.message || "Failed to import wallets");
          }
        }}
        wallets={wallets}
      />
      <AddTwitterHandleModal
        isOpen={showAddTwitterModal}
        onClose={() => setShowAddTwitterModal(false)}
        onAddTwitterHandle={handleAddTwitterAccount}
      />
      <FilterPopout
        open={isFilterPopoutOpen}
        onClose={() => setIsFilterPopoutOpen(false)}
        onApplyFilters={(filters) => {
          setLocalFilters(filters);
          setIsFilterPopoutOpen(false);
        }}
        currentFilters={localFilters}
      />

      <Footer />
    </>
  );
}
