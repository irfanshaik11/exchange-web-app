import React, { useState, useEffect, useRef, useMemo } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Header from "../components/Header";
import Footer from "../components/Footer";
import {
  DockedPanelMarginWrapper,
  useDockedPanel,
} from "../contexts/DockedPanelContext";
import type { Wallet } from "~/utils/functions";
import { formatMarketCap } from "~/utils/db";
import AddWalletModal from "../components/AddWalletModal";
import WalletRow from "../components/WalletRow";
import ImportExportWalletModal from "../components/ImportExportWalletModal";
import WalletScanPanel from "../components/WalletScanPanel";
import {
  addTrackedWallet,
  addTrackedWalletsBulk,
  removeTrackedWallet,
  removeTrackedWalletsBulk,
  getTrackedWallets,
  getWalletHistory,
  toggleWalletNotifications,
  toggleAllWalletNotifications,
  WalletTrackerAuthError,
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
  getApprovedTwitterHandles,
  type TwitterAccount,
  type Tweet,
} from "~/utils/twitterTracking";
import {
  getTrackedTelegramChannels,
  addTrackedTelegramChannel,
  removeTrackedTelegramChannel,
  getApprovedTelegramChannels,
  getTelegramChannelInfo,
  getTelegramChannelFeed,
  type TelegramChannelDb,
  type TelegramChannelMessage,
} from "~/utils/telegramTracking";
import { useUser } from "../components/UserContext";
import { useWalletTracker } from "../components/WalletTrackerContext";
import AddTwitterHandleModal from "../components/AddTwitterHandleModal";
import TwitterAccountRow from "../components/TwitterAccountRow";
import AddTelegramChannelModal from "../components/AddTelegramChannelModal";
import TelegramChannelRow from "../components/TelegramChannelRow";
import { TelegramMessageBody } from "../components/TelegramMessageBody";
import {
  FiSettings,
  FiBell,
  FiShare2,
  FiRss,
  FiLock,
  FiEye,
  FiAtSign,
  FiMessageCircle,
  FiPlus,
  FiCopy,
  FiBarChart2,
  FiExternalLink,
  FiHeart,
  FiRepeat,
} from "react-icons/fi";
import { FaXTwitter } from "react-icons/fa6";
import { SiSolana } from "react-icons/si";
import { useQuickBuy } from "~/components/QuickBuyContext";
import { executeEnhancedTrade } from "~/utils/enhancedTradeHandler";
import { showEnhancedToast } from "~/utils/enhancedToast";
import {
  validateSolanaBuy,
  showTradeValidationError,
} from "~/utils/preTradeValidation";
import { checkAtaExists } from "~/utils/ataCheck";
import {
  buildSolanaWalletAllocations,
  executeSolanaMultiBuy,
} from "~/utils/solanaWalletAllocation";
import { getResolvedTokenImage, resolveTokenImage } from "~/utils/images";
import hotToast from "react-hot-toast";
import { getPoolTypeFromToken } from "~/utils/poolTypeDetection";
import { mapTradeErrorMessage } from "~/utils/tradeErrorMessages";
import { SOL_MINT_ADDRESS } from "~/utils/api";
import {
  listenForTradeEvents,
  transformToastToError,
} from "~/utils/createSolanaToastHandler";
import {
  confirmOptimisticMarker,
  insertOptimisticMarker,
  rollbackOptimisticMarker,
} from "~/utils/pendingTradeMarkers";
import {
  broadcastTradeCompleted,
  notifyTradePending,
} from "~/utils/tradeEvents";
import type { Token } from "~/utils/db";
import { FaRunning, FaGasPump, FaCoins, FaBan } from "react-icons/fa";
import { HiLightningBolt } from "react-icons/hi";
import { useFilter } from "../components/FilterContext";
import FilterPopout from "../components/FilterPopout";
import LiveTradesPanel from "../components/LiveTradesPanel";
import MonitorPanel from "../components/MonitorPanel";
import KolScanTrackerContent from "../components/KolScanTrackerContent";
import kolWalletTrackerData from "../data/kol-wallet-tracker.json";
import { useSolPrice } from "../components/SolPriceContext";
import { fetchVerifiedPairAddress } from "~/hooks/useSingleTokenPolling";
import { prefetchWalletScan } from "../hooks/useWalletScan";
import {
  getWalletPortfolioSummary,
  type WalletPortfolioSummary,
} from "~/utils/api";

const isDev = process.env.NODE_ENV !== "production";

type KolTrackerEntry = {
  wallet: string;
  name: string;
  handle: string;
};

const KOL_TRACKER_ENTRIES = kolWalletTrackerData as KolTrackerEntry[];

const LS_KOL_STARRED = "trackers:kolStarredWallets";
const LS_KOL_MUTED = "trackers:kolMutedWallets";

function truncateKolAddress(addr: string, head = 4, tail = 4): string {
  const a = addr.trim();
  if (a.length <= head + tail + 3) return a;
  return `${a.slice(0, head)}...${a.slice(-tail)}`;
}

function kolEntryToWallet(entry: KolTrackerEntry): Wallet {
  return {
    address: entry.wallet,
    name: entry.name,
    createdAt: Date.now(),
    emoji: "🎯",
  };
}

/** Stable hue from handle for initials avatar fallback */
function hslAvatarBg(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h + seed.charCodeAt(i)! * (i + 1)) % 360;
  }
  return `hsl(${h}, 42%, 32%)`;
}

function KolAvatar({ name, handle }: { name: string; handle: string }) {
  const [failed, setFailed] = useState(false);
  const raw = (name.trim().charAt(0) ||
    handle.trim().charAt(0) ||
    "?") as string;
  const initial = raw.toUpperCase();

  if (failed) {
    return (
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white sm:h-10 sm:w-10 sm:text-sm"
        style={{ backgroundColor: hslAvatarBg(handle || name) }}
      >
        {initial}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/kol-avatars/${handle}.jpg`}
      alt=""
      className="h-9 w-9 shrink-0 rounded-full object-cover sm:h-10 sm:w-10"
      onError={() => setFailed(true)}
    />
  );
}

type DefaultWalletEntry = {
  chain: string;
  address: string;
  symbol?: string;
  name: string;
  isAlertEnabled?: boolean;
};

const TABS = ["Wallet Manager", "Live Trades", "Monitor", "KOLs"];
// Per-tab signature colors for the glowing pill tabs (matches the design comp).
const TAB_COLORS = ["#18c48c", "#F0616D", "#f5b14c", "#5B8CFF"];
const TWITTER_TABS = ["Tracked Accounts", "X Feed", "Add X Accounts"];
const TELEGRAM_TABS = ["Channels", "Messages", "Add Channels"];
/** Default Telegram channels to track for all users when they have none. */
const DEFAULT_TELEGRAM_CHANNELS = [
  "edenscalls",
  "gm_degencalls",
  "zen_call",
  "seekrtrending",
  "rugpullsurvivorscall",
  "drakeetl",
  "memesdontlies",
  "timefliescalls",
  "savannahcalls",
  "gogetagambles",
  "cryptotalkwithfrog",
  "kolsignal",
  "mini_degencalls",
  "dumpscallsinsane",
  "printingshitcoin",
  "managingwaste",
  "zorincalls",
  "redbullcallz",
  "robcall",
  "cncryptocurrencyinsights",
];
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
  const {
    user,
    solBalance,
    walletList,
    walletBalances,
    selectedWalletIds,
    refreshBalance,
  } = useUser();
  const {
    wsConnected,
    latestTrades,
    watchedWallets: globalWatchedWallets,
    refreshWatchedWallets,
    isLoadingHistory,
    walletBalances: contextWalletBalances,
    lastActiveMap,
  } = useWalletTracker();
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showAddWalletModal, setShowAddWalletModal] = useState(false);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [kolSearchTerm, setKolSearchTerm] = useState("");
  const [kolStarredSet, setKolStarredSet] = useState(() => new Set<string>());
  const [kolMutedSet, setKolMutedSet] = useState(() => new Set<string>());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [toast, setToast] = useState("");
  const [showExportSuccessTooltip, setShowExportSuccessTooltip] =
    useState(false);
  const [isAddingDefaultWallets, setIsAddingDefaultWallets] = useState(false);
  const [scannedWallet, setScannedWallet] = useState<Wallet | null>(null);
  const [isTogglingAllNotifications, setIsTogglingAllNotifications] =
    useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(384); // 384px = w-96
  const [isResizing, setIsResizing] = useState(false);
  const dockCtx = useDockedPanel();
  const [viewportNarrow, setViewportNarrow] = useState(false);
  const isMobile = viewportNarrow || (dockCtx?.isContentNarrow ?? false);
  const [mobileMainTab, setMobileMainTab] = useState<"wallets" | "social">(
    "wallets",
  );
  const [socialPanelTab, setSocialPanelTab] = useState<
    "twitter" | "telegram" | "kolscan"
  >("twitter");
  const [watchedWallets, setWatchedWallets] = useState<WatchWallet[]>([]);
  const [walletEvents, setWalletEvents] = useState<
    Record<string, WalletEvent[]>
  >({});
  const [trackedWalletBalances, setTrackedWalletBalances] = useState<
    Record<string, number>
  >(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem("trackers:walletBalances");
      if (!raw) return {};
      const { data, ts } = JSON.parse(raw);
      return Date.now() - ts < 3 * 60 * 1000 ? data : {};
    } catch {
      return {};
    }
  });
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

  // Portfolio summaries for total value / unrealized PnL
  const { solPrice: currentSolPrice } = useSolPrice();
  const [portfolioSummaries, setPortfolioSummaries] = useState<
    Record<string, WalletPortfolioSummary>
  >({});

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
  // Bumps every time View is clicked. The per-user fetch effect depends on
  // this so clicking View on the same handle a second time re-fetches —
  // important when the first cold-start returned empty (e.g., API blip) and
  // the user wants to retry without using the "Show All" round-trip.
  const [viewRequestCount, setViewRequestCount] = useState(0);
  // Counter of in-flight per-user cold-start fetches. The merged-feed loader
  // (loadTwitterFeed) toggles the same `loadingTwitterFeed` flag, so without
  // this we get a loader race on View: the merged fetch finishes in ~50ms
  // and clears loading=false while the per-user cold-start is still polling
  // upstream for 10-18s. Result: spinner flashes, then "No tweets yet" shows
  // until the cold-start eventually resolves. Tracking the per-user count
  // here lets loadTwitterFeed's finally skip the clear when a cold-start is
  // still running.
  const perUserFetchInFlight = useRef(0);
  // Tombstones — usernames the user just removed. See the matching render-
  // time filters (`visibleTwitterAccounts`, `visibleTwitterFeed` below).
  const [removedTwitterUsernames, setRemovedTwitterUsernames] = useState<
    Set<string>
  >(new Set());
  const [approvedHandles, setApprovedHandles] = useState<string[]>([]);
  const [approvedHandlesSearch, setApprovedHandlesSearch] = useState("");
  const [loadingApprovedHandles, setLoadingApprovedHandles] = useState(false);
  const [addingHandle, setAddingHandle] = useState<string | null>(null);
  const isAtWalletLimit = wallets.length >= MAX_WALLETS;
  // Telegram state
  const [showAddTelegramModal, setShowAddTelegramModal] = useState(false);
  const [telegramChannels, setTelegramChannels] = useState<TelegramChannelDb[]>(
    [],
  );
  const [approvedTelegramChannels, setApprovedTelegramChannels] = useState<
    string[]
  >([]);
  const [loadingTelegramChannels, setLoadingTelegramChannels] = useState(false);
  const [telegramChannelTitles, setTelegramChannelTitles] = useState<
    Record<string, string>
  >({});
  const [telegramTab, setTelegramTab] = useState<0 | 1 | 2>(1); // 0 = Channels, 1 = Messages, 2 = Add Channels
  const [telegramFeed, setTelegramFeed] = useState<TelegramChannelMessage[]>(
    [],
  );
  const [loadingTelegramFeed, setLoadingTelegramFeed] = useState(false);
  const [telegramFeedHint, setTelegramFeedHint] = useState<string | null>(null);
  const [approvedChannelsSearch, setApprovedChannelsSearch] = useState("");
  const [addingTelegramChannel, setAddingTelegramChannel] = useState<
    string | null
  >(null);
  const [restoringTelegramDefaults, setRestoringTelegramDefaults] =
    useState(false);

  // Hide wallet section when chain is Monad
  const showWalletSection = !isMobile || mobileMainTab === "wallets";
  const showSocialSection = !isMobile || mobileMainTab === "social";

  // Calculate if all notifications are enabled
  const allNotificationsEnabled =
    watchedWallets.length > 0 &&
    watchedWallets.every((w) => w.notificationsEnabled);

  // Keep walletsRef in sync with wallets state
  useEffect(() => {
    walletsRef.current = wallets;
  }, [wallets]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      setViewportNarrow(window.innerWidth < 1024);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isMobile) setMobileMainTab("wallets");
  }, [isMobile]);

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

  // Fetch portfolio summaries for all tracked wallets (total value + unrealized PnL)
  useEffect(() => {
    if (!user || wallets.length === 0) {
      setPortfolioSummaries({});
      return;
    }
    const ac = new AbortController();
    const BATCH = 10;
    (async () => {
      const results: Record<string, WalletPortfolioSummary> = {};
      for (let i = 0; i < wallets.length; i += BATCH) {
        if (ac.signal.aborted) return;
        const batch = wallets.slice(i, i + BATCH);
        const settled = await Promise.allSettled(
          batch.map((w) =>
            getWalletPortfolioSummary(w.address, ac.signal),
          ),
        );
        for (let j = 0; j < settled.length; j++) {
          const r = settled[j]!;
          if (r.status === "fulfilled") {
            results[batch[j]!.address] = r.value;
          }
        }
      }
      if (!ac.signal.aborted) setPortfolioSummaries({ ...results });
    })();
    return () => ac.abort();
  }, [user, wallets]);

  // Aggregate portfolio metrics across all tracked wallets
  const aggregatePortfolio = useMemo(() => {
    const addresses = Object.keys(portfolioSummaries);
    if (addresses.length === 0) return { totalValue: 0, unrealizedPnl: 0 };

    let totalSolBalance = 0;
    let totalUnrealizedPnl = 0;

    for (const addr of addresses) {
      const summary = portfolioSummaries[addr]!;
      totalUnrealizedPnl += summary.total_unrealized_pnl_usd;

      // SOL balance from context (already in SOL units)
      const solBal = contextWalletBalances[addr] ?? 0;
      totalSolBalance += solBal;
    }

    // Total value = SOL balance in USD + unrealized value (approximated from bought - sold + unrealized)
    const solBalanceUsd = totalSolBalance * currentSolPrice;

    // Sum up the "remaining value" — total bought minus total sold gives a rough invested amount still in positions
    // The actual remaining value is the unrealized PnL + cost basis of open positions
    let totalRemainingPositionValue = 0;
    for (const addr of addresses) {
      const summary = portfolioSummaries[addr]!;
      const boughtSolUsd = summary.total_bought_sol * currentSolPrice;
      const soldSolUsd = summary.total_sold_sol * currentSolPrice;
      // cost basis of remaining positions ≈ bought - sold
      const costBasis = Math.max(0, boughtSolUsd - soldSolUsd);
      // remaining market value = cost basis + unrealized PnL
      totalRemainingPositionValue += costBasis + summary.total_unrealized_pnl_usd;
    }

    return {
      totalValue: solBalanceUsd + totalRemainingPositionValue,
      unrealizedPnl: totalUnrealizedPnl,
    };
  }, [portfolioSummaries, contextWalletBalances, currentSolPrice]);

  // Load Twitter accounts on mount
  useEffect(() => {
    loadTwitterAccounts();
  }, [user?.id]);

  // Auto-retry while any tracked row is still un-enriched. TwitterAPI.io
  // occasionally 429s; the backend then returns the bare DB row for that
  // handle and kicks off a background re-prime. We poll every 4s for at
  // most ~28s so the user doesn't have to manually refresh.
  //
  // The attempt counter lives in a ref because every loadTwitterAccounts
  // call sets a fresh `twitterAccounts` array reference, which would otherwise
  // re-run this effect and reset a local counter on every tick — making the
  // "cap" fictional. The signature ref restarts the counter only when the
  // *set* of incomplete handles actually changes (e.g., user added a new
  // one), so a stuck handle is dropped after the cap instead of polling forever.
  const twitterRetryAttemptsRef = useRef(0);
  const twitterIncompleteSignatureRef = useRef<string>("");

  useEffect(() => {
    if (!user?.id || twitterAccounts.length === 0) return;

    const incompleteSignature = twitterAccounts
      .filter(
        (a) => !Boolean(a.profileImageUrl) || typeof a.followers !== "number",
      )
      .map((a) => a.username.toLowerCase())
      .sort()
      .join(",");

    if (!incompleteSignature) {
      twitterRetryAttemptsRef.current = 0;
      twitterIncompleteSignatureRef.current = "";
      return;
    }

    if (incompleteSignature !== twitterIncompleteSignatureRef.current) {
      twitterRetryAttemptsRef.current = 0;
      twitterIncompleteSignatureRef.current = incompleteSignature;
    }

    // 6 × 10s = 60s budget. The per-handle prime takes ~6.5s through the
    // 5.5s global pacer; with 5 newly-added handles queued, the last one
    // doesn't complete until ~30s. 60s gives the auto-retry time to catch
    // every handle's enrichment without burning credits on stuck rows.
    if (twitterRetryAttemptsRef.current >= 6) return;

    const id = setInterval(() => {
      twitterRetryAttemptsRef.current++;
      loadTwitterAccounts({ fresh: true });
      if (twitterRetryAttemptsRef.current >= 6) clearInterval(id);
    }, 10_000);
    return () => clearInterval(id);
  }, [user?.id, twitterAccounts]);

  // Load Telegram channels on mount
  useEffect(() => {
    if (user?.bearerToken) loadTelegramChannels();
    else setTelegramChannels([]);
  }, [user?.bearerToken]);

  // Load approved Telegram channels once
  useEffect(() => {
    getApprovedTelegramChannels().then(setApprovedTelegramChannels);
  }, []);

  // Load Telegram messages feed when Messages tab is selected and user has channels
  useEffect(() => {
    if (telegramTab === 1 && user?.bearerToken && telegramChannels.length > 0) {
      loadTelegramFeed();
    }
  }, [telegramTab, user?.bearerToken, telegramChannels.length]);

  // Load Twitter feed when tab or accounts change. NOTE: `selectedTwitterUser`
  // is intentionally excluded from the deps — the "show only @x" filter is
  // applied client-side via the `visibleTwitterFeed` memo below. Refetching
  // per-user on View used to overwrite the merged feed with an empty array
  // whenever that user's per-user cache hadn't been hydrated yet, which is
  // why clicking View showed "No tweets". Client-side filter can't drop data.
  useEffect(() => {
    if (twitterTab !== 1) return;
    if (twitterAccounts.length === 0) {
      setTwitterFeed([]);
      return;
    }
    loadTwitterFeed();
  }, [twitterTab, twitterAccounts]);

  // When a specific user is selected (via View), fetch their tweets and MERGE
  // them into twitterFeed (never replace). If the first fetch returns empty
  // (cold-start failed or backend prime hasn't completed), retry every 8s up
  // to 5 times. `loadingTwitterFeed` stays true across retries so the UI
  // keeps showing the loader instead of flashing "No tweets" between attempts.
  useEffect(() => {
    if (!selectedTwitterUser) return;
    if (twitterTab !== 1) return;
    let cancelled = false;
    let attempts = 0;
    // 2 retries × 4s = ~8s ceiling. Enough to catch a slow backend prime
    // landing tweets a few seconds after the first request, but short
    // enough that a permanently-unavailable upstream doesn't keep the user
    // staring at a spinner. They can click View again to try harder.
    const MAX_ATTEMPTS = 2;
    const RETRY_MS = 4_000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    perUserFetchInFlight.current += 1;
    setLoadingTwitterFeed(true);
    // `counted` guards the per-user counter against double-decrement when
    // both `finish()` and the effect's cleanup run for the same fetch.
    let counted = true;
    const decrement = () => {
      if (!counted) return;
      counted = false;
      perUserFetchInFlight.current = Math.max(
        0,
        perUserFetchInFlight.current - 1,
      );
    };
    const finish = () => {
      decrement();
      setLoadingTwitterFeed(false);
    };

    const tryOnce = async () => {
      if (cancelled) return;
      attempts++;
      try {
        const tweets = await getUserTweets(selectedTwitterUser, 20);
        if (cancelled) return;
        if (tweets.length > 0) {
          setTwitterFeed((prev) => {
            const seen = new Set(prev.map((t) => t.id));
            const fresh = tweets.filter((t) => !seen.has(t.id));
            if (fresh.length === 0) return prev;
            const merged = [...fresh, ...prev];
            merged.sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            );
            return merged.slice(0, 100);
          });
          finish();
          return;
        }
        if (attempts < MAX_ATTEMPTS) {
          retryTimer = setTimeout(tryOnce, RETRY_MS);
        } else {
          finish();
        }
      } catch (err) {
        console.error("Failed to fetch tweets for selected user:", err);
        if (!cancelled && attempts < MAX_ATTEMPTS) {
          retryTimer = setTimeout(tryOnce, RETRY_MS);
        } else if (!cancelled) {
          finish();
        }
      }
    };
    tryOnce();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      // We may unmount or re-fire before tryOnce settled — decrement so the
      // merged-feed loader doesn't get stuck thinking we're still loading.
      decrement();
    };
    // `viewRequestCount` is the retry trigger — bumping it from
    // handleViewTwitterProfile re-runs this effect for the same selectedUser.
  }, [selectedTwitterUser, twitterTab, viewRequestCount]);

  // Render-time filter for the X Feed. Decouples the "Show only @x" toggle
  // from data loading so toggling can never wipe tweets we already have.
  // Also drops tweets from tombstoned (just-removed) authors so the X Feed
  // doesn't keep showing a removed handle's tweets.
  const visibleTwitterFeed = useMemo(() => {
    const tombstoned = removedTwitterUsernames;
    const userTarget = selectedTwitterUser
      ? selectedTwitterUser.toLowerCase()
      : null;
    return twitterFeed.filter((t) => {
      const author = (t.authorUsername || "").toLowerCase();
      if (tombstoned.has(author)) return false;
      if (userTarget && author !== userTarget) return false;
      return true;
    });
  }, [twitterFeed, selectedTwitterUser, removedTwitterUsernames]);

  // Load approved handles for Recommended Wallets tab
  useEffect(() => {
    if (approvedHandles.length > 0) return;
    setLoadingApprovedHandles(true);
    getApprovedTwitterHandles()
      .then(setApprovedHandles)
      .finally(() => setLoadingApprovedHandles(false));
  }, []);

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
          timestamp: Date.now(),
        };
        try {
          localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        } catch (error) {
          console.error("Failed to cache wallets:", error);
        }
      }

      // Balances are fetched via WalletTrackerContext batch system (fetchBatchBalances)
      // and synced into trackedWalletBalances via the useEffect at line ~785.
      // No per-wallet balance calls here — that would fire 150+ individual RPCs and cause 429s.
    } catch (error) {
      if (error instanceof WalletTrackerAuthError) {
        // Auth surface owned by WalletTrackerContext (toast + state).
        // Keep cached data on screen; no extra noise here.
        return;
      }
      console.error("Failed to load wallets:", error);
      // Don't clear state on error - keep showing cached data
    }
  };

  const loadTrackedWallets = loadWalletsFromBackend;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const starRaw = localStorage.getItem(LS_KOL_STARRED);
      const muteRaw = localStorage.getItem(LS_KOL_MUTED);
      if (starRaw) {
        const arr = JSON.parse(starRaw) as unknown;
        if (Array.isArray(arr))
          setKolStarredSet(new Set(arr.filter((x) => typeof x === "string")));
      }
      if (muteRaw) {
        const arr = JSON.parse(muteRaw) as unknown;
        if (Array.isArray(arr))
          setKolMutedSet(new Set(arr.filter((x) => typeof x === "string")));
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Sync local watchedWallets state with global context
  useEffect(() => {
    setWatchedWallets(globalWatchedWallets);
  }, [globalWatchedWallets]);

  // Sync context batch balances into local trackedWalletBalances
  useEffect(() => {
    if (Object.keys(contextWalletBalances).length > 0) {
      setTrackedWalletBalances((prev) => ({
        ...prev,
        ...contextWalletBalances,
      }));
    }
  }, [contextWalletBalances]);
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
          const goUrl = process.env.NEXT_PUBLIC_GO_SERVICE_URL;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);

          const response = await fetch(`${goUrl}/v1/token/${trade.mint}`, {
            signal: controller.signal,
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

  const handleAddDefault150Wallets = async () => {
    if (isAtWalletLimit) {
      showWalletLimitToast();
      return;
    }
    if (!user?.id) {
      showToastMessage("Please log in to add wallets.");
      return;
    }
    setIsAddingDefaultWallets(true);
    try {
      const res = await fetch("/default_wallets_to_track.json");
      if (!res.ok) throw new Error("Failed to load default wallets list.");
      const raw = (await res.json()) as DefaultWalletEntry[];
      const chainMatch = selectedChain === "monad" ? "monad" : "solana";
      const defaultList = (raw || []).filter(
        (w) => (w.chain || "solana").toLowerCase() === chainMatch,
      );
      const existingNormalized = new Set(
        wallets.map((w) => normalizeAddress(w.address)).filter(Boolean),
      );
      const toAdd = defaultList.filter((w) => {
        const norm = normalizeAddress(w.address);
        return norm && !existingNormalized.has(norm);
      });
      const availableSlots = MAX_WALLETS - wallets.length;
      const capped = toAdd.slice(0, Math.min(availableSlots, 150));
      if (capped.length === 0) {
        showToastMessage(
          existingNormalized.size > 0 && toAdd.length === 0
            ? "All 150 default wallets are already added for this chain."
            : selectedChain === "monad"
              ? "No default wallets for Monad. Use Solana to add the default 150."
              : "No slots left or no default wallets to add.",
        );
        return;
      }
      const bulkPayload = capped.map((w) => ({
        wallet: w.address,
        walletName: w.name || w.address.slice(0, 8),
        emoji: w.symbol || getRandomEmoji(),
      }));
      await addTrackedWalletsBulk(
        bulkPayload,
        user.id,
        selectedChain,
        user?.bearerToken,
      );
      if (typeof window !== "undefined") {
        capped.forEach((w) => {
          localStorage.setItem(
            `wallet_notifications_${w.address}`,
            JSON.stringify(true),
          );
        });
      }
      await loadWalletsFromBackend();
      showEnhancedToast(
        "success",
        `Added ${capped.length} default wallet${capped.length === 1 ? "" : "s"}.`,
        { duration: 4000 },
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to add default wallets.";
      showToastMessage(msg);
    } finally {
      setIsAddingDefaultWallets(false);
    }
  };

  const handleRemoveWallet = async (addressToRemove: string) => {
    try {
      if (addressToRemove === "all") {
        // Single round-trip via the bulk endpoint. The old `Promise.all(map())`
        // fired N parallel DELETEs (150 for the default-import case) and
        // backed up the API's connection pool — felt slow even though each
        // individual call was fast.
        await removeTrackedWalletsBulk(
          { chain: selectedChain, all: true },
          user?.bearerToken,
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
      isDev && console.log("No wallets to toggle");
      return;
    }

    if (isTogglingAllNotifications) {
      isDev && console.log("⏳ Already toggling, please wait...");
      return;
    }

    if (!user?.bearerToken) {
      console.error("Cannot toggle notifications without auth token");
      return;
    }

    const newState = !allNotificationsEnabled;
    const previousWallets = watchedWallets;

    setIsTogglingAllNotifications(true);

    // Optimistic update: flip local state immediately so the button feels
    // instant. We roll back if the bulk call fails.
    setWatchedWallets((prev) =>
      prev.map((w) => ({ ...w, notificationsEnabled: newState })),
    );
    previousWallets.forEach((wallet) => {
      localStorage.setItem(
        `wallet_notifications_${wallet.address}`,
        JSON.stringify(newState),
      );
    });

    try {
      await toggleAllWalletNotifications(
        newState,
        user.bearerToken,
        selectedChain,
      );
      // Sync from backend in the background — don't block the button on it.
      // loadWalletsFromBackend already calls refreshWatchedWallets internally,
      // so no second refresh is needed.
      loadWalletsFromBackend().catch((err) =>
        console.error("Background wallet refresh failed:", err),
      );
    } catch (error) {
      console.error("❌ Failed to toggle all notifications:", error);
      // Rollback optimistic update
      setWatchedWallets(previousWallets);
      previousWallets.forEach((wallet) => {
        localStorage.setItem(
          `wallet_notifications_${wallet.address}`,
          JSON.stringify(wallet.notificationsEnabled),
        );
      });
    } finally {
      setIsTogglingAllNotifications(false);
    }
  };

  // QUICK BUY handler – using enhanced trade flow (same as discover page)
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

    const presetIndex = parseInt(selectedPill.replace("P", "")) - 1;
    const preset = presets[presetIndex];
    if (!preset) {
      showEnhancedToast("error", "Quick buy preset not configured", {
        title: "Configuration Error",
        suggestions: ["Update your presets in settings"],
      });
      return;
    }

    const settings = preset.quickBuySettings;

    // Pre-validate balance before showing animated toast
    const { allocations, total } = buildSolanaWalletAllocations({
      amount: buyAmount,
      walletList: walletList || [],
      walletBalances: walletBalances || {},
      selectedWalletIds: selectedWalletIds?.sol || [],
      priorityFee: settings.priority || 0.0001,
      bribe: settings.bribe || 0,
    });
    const walletsWithBalance = allocations.length;
    const isMultiWallet = walletsWithBalance > 1;
    const ataExists = await checkAtaExists(trade.mint, user?.publicKey).catch(
      () => null,
    );
    const buyValidation = validateSolanaBuy(
      buyAmount,
      allocations,
      walletBalances || {},
      walletList || [],
      selectedWalletIds?.sol || [],
      settings.priority,
      settings.bribe,
      ataExists,
    );
    if (!buyValidation.valid) {
      const token = tokenMetadata.get(trade.mint);
      showTradeValidationError(
        buyValidation.error,
        getResolvedTokenImage(token as any),
        trade.symbol || token?.symbol || "Token",
      );
      return;
    }

    // Get token metadata from the tokenMetadata map
    const metadata = tokenMetadata.get(trade.mint);

    // Resolve the VERIFIED pair/pool address before trading — the same step the
    // canonical surfaces (SearchModal, PulseTable, Watchlist, Discover) run.
    // A TradeEvent's pair_address can be stale or absent (then it fell back to
    // the mint), which misroutes the swap — especially for migrated tokens.
    // fetchVerifiedPairAddress returns the live pool so the trade hits the right
    // market. Falls back to the local value on lookup failure.
    let poolAddress =
      (metadata as any)?.migrated_pool_address ||
      trade.pair_address ||
      trade.mint;
    try {
      const verified = await fetchVerifiedPairAddress(trade.mint);
      if (verified) poolAddress = verified;
    } catch {
      /* keep local poolAddress */
    }

    // Token price for pre-trade validation (executeEnhancedTrade →
    // preTransactionValidation reads usd_price/price_usd to size expected output
    // for pump.fun tokens). The live-feed TradeEvent often has price_usd=null
    // and the cached metadata only keeps market_cap — so without a price the
    // trade was rejected with "Token Price Unknown". Fetch it fresh from
    // /v1/token (marketData.price_usd) when missing, like the other surfaces have.
    let tokenPriceUsd: number | null =
      trade.price_usd ??
      (metadata as any)?.price_usd ??
      (metadata as any)?.usd_price ??
      null;
    if (!tokenPriceUsd || tokenPriceUsd <= 0) {
      try {
        const goUrl = process.env.NEXT_PUBLIC_GO_SERVICE_URL;
        const r = await fetch(`${goUrl}/v1/token/${trade.mint}`, {
          signal: AbortSignal.timeout(3000),
        });
        if (r.ok) {
          const d = await r.json();
          tokenPriceUsd =
            d?.marketData?.price_usd ??
            d?.token?.price_usd ??
            d?.token?.usd_price ??
            null;
        }
      } catch {
        /* leave null — validation will surface the price-unknown message */
      }
    }

    // Construct a Token object from the TradeEvent
    const token = {
      mint: trade.mint,
      pair_address: poolAddress,
      migrated_pool_address: (metadata as any)?.migrated_pool_address || null,
      symbol: trade.symbol || metadata?.symbol || "UNKNOWN",
      name: trade.name || metadata?.name || "Unknown Token",
      image: metadata?.image || null,
      launchpad_protocol: metadata?.launchpad_protocol || null,
      market_cap_usd: metadata?.market_cap_usd || null,
      usd_price: tokenPriceUsd,
      price_usd: tokenPriceUsd,
      // Add other required Token fields with sensible defaults
    } as unknown as Token;

    // Execute via executeSolanaMultiBuy with the animated timer toast +
    // optimistic markers — the EXACT procedure the Discover/Pulse/Search/
    // Watchlist surfaces use (was executeEnhancedTrade, which produced the
    // outdated "Using wallet 1 of 1" toast and a different code path).
    const poolType = getPoolTypeFromToken(token);

    const timerCap = 0.3 + Math.random() * 0.2;
    const uniqueToastId = `livetrades-quickbuy-${Date.now()}-${Math.random()}`;
    const startTime = Date.now();
    let timerFinished = false;
    let tradeErrored = false;

    const tokenImage = getResolvedTokenImage(token as any);
    const tokenName = token.symbol || token.name || "Token";

    // Build the Solscan link via DOM APIs (never innerHTML) so the tx signature
    // can't be parsed as HTML — XSS-safe even though txHash is a trusted base58
    // signature. Replaces the canonical surfaces' innerHTML pattern.
    const setSolscanLink = (linkEl: HTMLElement, txHash: string) => {
      const a = document.createElement("a");
      a.href = `https://solscan.io/tx/${encodeURIComponent(txHash)}`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "hover:opacity-80 transition-opacity";
      const img = document.createElement("img");
      img.src = "https://avatars.githubusercontent.com/u/92743431?s=200&v=4";
      img.alt = "Solana";
      img.className = "w-4 h-4 rounded-full";
      img.style.cursor = "pointer";
      a.appendChild(img);
      linkEl.replaceChildren(a);
      linkEl.className = "";
    };

    hotToast(
      () => (
        <div className="flex items-center gap-3">
          {tokenImage && (
            <img
              src={tokenImage}
              alt={tokenName}
              className="h-6 w-6 flex-shrink-0 rounded-full"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-sm text-neutral-200">
              Buying {tokenName}
            </span>
            <span
              id={`timer-${uniqueToastId}`}
              className="flex-shrink-0 text-xs text-neutral-400"
            >
              (0.00s)
            </span>
            <span
              id={`check-${uniqueToastId}`}
              className="flex-shrink-0 text-green-400"
              style={{
                display: timerFinished && !tradeErrored ? "inline" : "none",
              }}
            >
              ✓
            </span>
            <span
              id={`link-${uniqueToastId}`}
              className="flex-shrink-0"
              style={{ display: "inline-flex" }}
            >
              <img
                src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4"
                alt="Solana"
                className="h-4 w-4 rounded-full opacity-70"
                style={{ cursor: "default" }}
              />
            </span>
          </div>
        </div>
      ),
      {
        id: uniqueToastId,
        duration: Infinity,
        style: {
          background: "#1a1a1a",
          border: "1px solid #333",
          borderRadius: "8px",
          padding: "12px",
        },
      },
    );

    let timerHandle: number | null = null;
    const tick = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const displayTime = Math.min(elapsed, timerCap).toFixed(2);
      const timerEl = document.getElementById(`timer-${uniqueToastId}`);
      if (timerEl) timerEl.textContent = `(${displayTime}s)`;
      if (!timerFinished && elapsed >= timerCap) {
        timerFinished = true;
        if (!tradeErrored) {
          const checkEl = document.getElementById(`check-${uniqueToastId}`);
          if (checkEl) checkEl.style.display = "block";
          const linkEl = document.getElementById(`link-${uniqueToastId}`);
          if (linkEl && isMultiWallet) {
            linkEl.textContent = `${walletsWithBalance}/${total}`;
            linkEl.className = "text-xs text-blue-400 font-medium flex-shrink-0";
          }
        }
        timerHandle = null;
        return;
      }
      timerHandle = requestAnimationFrame(tick);
    };
    timerHandle = requestAnimationFrame(tick);

    const cleanupSolanaTradeListener = listenForTradeEvents(
      trade.mint || "",
      uniqueToastId,
      (v) => {
        tradeErrored = v;
      },
      "solana",
    );

    let __markId = "";
    try {
      const baseMint = trade.mint || "";
      const quoteMint = SOL_MINT_ADDRESS;

      __markId = insertOptimisticMarker({
        mint: baseMint,
        walletAddress:
          walletList?.find((w) => w.isPrimary)?.solanaAddress ??
          walletList?.[0]?.solanaAddress,
        side: "buy",
        amountSol: buyAmount,
        priceUsd: tokenPriceUsd ?? undefined,
      }).id;

      notifyTradePending({
        tokenAddress: baseMint,
        tradeType: "buy",
        chain: "sol",
      });

      const multiResult = await executeSolanaMultiBuy({
        poolAddress,
        baseMint,
        quoteMint,
        amountSOL: buyAmount,
        poolType,
        originalPairAddress: token.pair_address,
        slippage: settings.maxSlippage,
        priorityFee: settings.priority,
        bribe: settings.bribe,
        mevMode: settings.mevMode,
        autoFee: settings.autoFee,
        maxFee: settings.maxFee,
        rpc: settings.rpc,
        tokenName: token.name,
        tokenSymbol: token.symbol,
        imageUrl: (await resolveTokenImage(token as any)) || undefined,
        authToken: user.bearerToken,
        walletList: walletList || [],
        walletBalances: walletBalances || {},
        selectedWalletIds: selectedWalletIds?.sol || [],
        onTxHash: ({ txHash }) => {
          if (txHash) {
            const linkEl = document.getElementById(`link-${uniqueToastId}`);
            if (linkEl) setSolscanLink(linkEl, txHash);
            broadcastTradeCompleted({
              tokenAddress: baseMint,
              tradeType: "buy",
              chain: "sol",
              txHash,
              tokenName: token.name,
              tokenSymbol: token.symbol,
              imageUrl: tokenImage,
              solAmountSpent: buyAmount,
            });
          }
        },
      });

      const firstTxHash =
        multiResult?.results?.find(
          (r: any) => (r.result as any)?.hash || (r.result as any)?.txid,
        )?.result?.hash ||
        multiResult?.results?.find(
          (r: any) => (r.result as any)?.hash || (r.result as any)?.txid,
        )?.result?.txid;

      confirmOptimisticMarker(__markId, firstTxHash);

      if (firstTxHash && !isMultiWallet) {
        const linkEl = document.getElementById(`link-${uniqueToastId}`);
        if (linkEl) setSolscanLink(linkEl, firstTxHash);
        if (timerHandle) cancelAnimationFrame(timerHandle);
        setTimeout(() => hotToast.dismiss(uniqueToastId), 10000);
      }

      broadcastTradeCompleted({
        tokenAddress: baseMint,
        tradeType: "buy",
        chain: "sol",
        tokenName: token.name,
        tokenSymbol: token.symbol,
        imageUrl: tokenImage,
        solAmountSpent: buyAmount,
      });

      setTimeout(() => {
        refreshBalance({ chain: "sol", force: true }).catch(() => {});
      }, 1000);

      return { success: true };
    } catch (error: any) {
      rollbackOptimisticMarker(__markId);
      tradeErrored = true;
      cleanupSolanaTradeListener();
      if (timerHandle) cancelAnimationFrame(timerHandle);
      console.error("❌ Live Trades Quick Buy failed:", error);
      transformToastToError(
        uniqueToastId,
        mapTradeErrorMessage(error),
        tokenImage,
        tokenName,
      );
      return { success: false, error };
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

  const kolWalletOrder = useMemo(() => {
    const m = new Map<string, number>();
    KOL_TRACKER_ENTRIES.forEach((e, i) => {
      m.set(e.wallet, i);
    });
    return m;
  }, []);

  const filteredKolEntries = useMemo(() => {
    const q = kolSearchTerm.trim().toLowerCase();
    let list = KOL_TRACKER_ENTRIES.filter((e) => {
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.handle.toLowerCase().includes(q) ||
        e.wallet.toLowerCase().includes(q)
      );
    });
    list = [...list].sort((a, b) => {
      const sa = kolStarredSet.has(a.wallet) ? 0 : 1;
      const sb = kolStarredSet.has(b.wallet) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return (
        (kolWalletOrder.get(a.wallet) ?? 0) -
        (kolWalletOrder.get(b.wallet) ?? 0)
      );
    });
    return list;
  }, [kolSearchTerm, kolStarredSet, kolWalletOrder]);

  const persistKolStarred = (next: Set<string>) => {
    setKolStarredSet(next);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(LS_KOL_STARRED, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
    }
  };

  const persistKolMuted = (next: Set<string>) => {
    setKolMutedSet(next);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(LS_KOL_MUTED, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
    }
  };

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

  // Twitter functions. `fresh` bypasses the browser HTTP cache. Tombstones
  // (declared above as `removedTwitterUsernames`) are applied via the
  // `visibleTwitterAccounts` / `visibleTwitterFeed` memos at render time, so
  // a deleted handle cannot appear on screen even if `twitterAccounts`
  // contains it.
  const loadTwitterAccounts = async (opts: { fresh?: boolean } = {}) => {
    try {
      const accounts = await getTrackedTwitterAccounts(
        user?.bearerToken || "",
        opts,
      );
      // Retire any tombstone the server confirms gone. The render-time
      // filter below filters out the tombstoned ones regardless, but
      // retiring them keeps the set from growing unboundedly.
      const incomingSet = new Set(
        accounts.map((a) => a.username.toLowerCase()),
      );
      setRemovedTwitterUsernames((prev) => {
        if (prev.size === 0) return prev;
        let changed = false;
        const next = new Set(prev);
        for (const t of prev) {
          if (!incomingSet.has(t)) {
            next.delete(t);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      setTwitterAccounts(accounts);
    } catch (error) {
      console.error("Failed to load tracked Twitter accounts:", error);
      setTwitterAccounts([]);
    }
  };

  // Render-time view of tracked accounts. Tombstoned usernames are filtered
  // out client-side so a deleted row CANNOT reappear regardless of what's
  // in `twitterAccounts`.
  const visibleTwitterAccounts = useMemo(() => {
    if (removedTwitterUsernames.size === 0) return twitterAccounts;
    return twitterAccounts.filter(
      (a) => !removedTwitterUsernames.has(a.username.toLowerCase()),
    );
  }, [twitterAccounts, removedTwitterUsernames]);

  const handleAddTwitterAccount = async (username: string) => {
    try {
      await addTrackedTwitterAccount(username, user?.bearerToken || "");
      // Re-adding clears any prior tombstone so the new row isn't shadowed.
      const target = username.toLowerCase();
      setRemovedTwitterUsernames((prev) => {
        if (!prev.has(target)) return prev;
        const next = new Set(prev);
        next.delete(target);
        return next;
      });
      await loadTwitterAccounts({ fresh: true });
      showEnhancedToast("success", `@${username} added to tracked accounts`, {
        duration: 3000,
      });
    } catch (error: any) {
      showEnhancedToast(
        "error",
        error.message || "Failed to add Twitter account",
        {
          duration: 4000,
        },
      );
      throw error;
    }
  };

  const handleRemoveTwitterAccount = async (username: string) => {
    try {
      await removeTrackedTwitterAccount(username, user?.bearerToken || "");
      const target = username.toLowerCase();
      // Tombstone via STATE. The render filter (visibleTwitterAccounts memo)
      // applies this to the rendered list, so a removed row CANNOT appear on
      // screen even if `twitterAccounts` itself still contains it. This is
      // the bulletproof layer — independent of optimistic-update timing,
      // refetch ordering, browser cache, and React batching.
      setRemovedTwitterUsernames((prev) => {
        if (prev.has(target)) return prev;
        const next = new Set(prev);
        next.add(target);
        return next;
      });
      // Optimistic update on twitterAccounts too — instantly tidy.
      setTwitterAccounts((prev) =>
        prev.filter((a) => a.username.toLowerCase() !== target),
      );
      setTwitterFeed((prev) =>
        prev.filter((t) => (t.authorUsername || "").toLowerCase() !== target),
      );
      if (selectedTwitterUser && selectedTwitterUser.toLowerCase() === target) {
        setSelectedTwitterUser(null);
      }
      // Background reconcile. If this returns a stale list, the render
      // filter still hides the tombstoned row. The loadTwitterAccounts
      // implementation retires the tombstone once the server confirms.
      await loadTwitterAccounts({ fresh: true });
      showEnhancedToast(
        "success",
        `@${username} removed from tracked accounts`,
        {
          duration: 3000,
        },
      );
    } catch (error: any) {
      showEnhancedToast(
        "error",
        error.message || "Failed to remove Twitter account",
        {
          duration: 4000,
        },
      );
    }
  };

  // Telegram handlers
  const loadTelegramChannels = async () => {
    if (!user?.bearerToken) return;
    setLoadingTelegramChannels(true);
    try {
      let list = await getTrackedTelegramChannels(user.bearerToken);
      setTelegramChannels(list);
      // When user has no channels, add default channels for all users
      if (list.length === 0) {
        for (const username of DEFAULT_TELEGRAM_CHANNELS) {
          try {
            await addTrackedTelegramChannel(username, user.bearerToken);
          } catch {
            // Skip if channel not approved or add fails
          }
        }
        list = await getTrackedTelegramChannels(user.bearerToken);
        setTelegramChannels(list);
      }
      const titles: Record<string, string> = {};
      await Promise.all(
        list.map(async (ch) => {
          const info = await getTelegramChannelInfo(ch.username);
          if (info?.title) titles[ch.username] = info.title;
        }),
      );
      setTelegramChannelTitles((prev) => ({ ...prev, ...titles }));
    } catch (error) {
      console.error("Failed to load Telegram channels:", error);
      setTelegramChannels([]);
    } finally {
      setLoadingTelegramChannels(false);
    }
  };

  const handleAddTelegramChannel = async (username: string) => {
    try {
      await addTrackedTelegramChannel(username, user?.bearerToken || "");
      await loadTelegramChannels();
      showEnhancedToast("success", `@${username} added to tracked channels`, {
        duration: 3000,
      });
    } catch (error: any) {
      showEnhancedToast(
        "error",
        error.message || "Failed to add Telegram channel",
        {
          duration: 4000,
        },
      );
      throw error;
    }
  };

  const handleRemoveTelegramChannel = async (username: string) => {
    try {
      await removeTrackedTelegramChannel(username, user?.bearerToken || "");
      await loadTelegramChannels();
      setTelegramChannelTitles((prev) => {
        const next = { ...prev };
        delete next[username];
        return next;
      });
      showEnhancedToast(
        "success",
        `@${username} removed from tracked channels`,
        {
          duration: 3000,
        },
      );
    } catch (error: any) {
      showEnhancedToast(
        "error",
        error.message || "Failed to remove Telegram channel",
        {
          duration: 4000,
        },
      );
    }
  };

  const handleRestoreTelegramDefaults = async () => {
    if (!user?.bearerToken) return;
    setRestoringTelegramDefaults(true);
    try {
      const existing = new Set(
        telegramChannels.map((ch) => ch.username.toLowerCase()),
      );
      const toAdd = DEFAULT_TELEGRAM_CHANNELS.filter(
        (username) => !existing.has(username.toLowerCase()),
      );
      for (const username of toAdd) {
        try {
          await addTrackedTelegramChannel(username, user.bearerToken);
        } catch {
          // Skip if not approved or add fails
        }
      }
      await loadTelegramChannels();
      if (toAdd.length > 0) {
        showEnhancedToast(
          "success",
          `Added ${toAdd.length} default channel${toAdd.length === 1 ? "" : "s"}.`,
          { duration: 3000 },
        );
      } else {
        showEnhancedToast("success", "All default channels already present.", {
          duration: 3000,
        });
      }
    } catch (error: unknown) {
      showEnhancedToast(
        "error",
        error instanceof Error ? error.message : "Failed to restore defaults",
        { duration: 4000 },
      );
    } finally {
      setRestoringTelegramDefaults(false);
    }
  };

  const loadTelegramFeed = async (force: boolean = false) => {
    if (!user?.bearerToken) return;
    setLoadingTelegramFeed(true);
    setTelegramFeedHint(null);
    try {
      const feedLimit = wallets.length > 6 ? 5 : 10;
      const { messages, hint } = await getTelegramChannelFeed(
        user.bearerToken,
        feedLimit,
        force,
      );
      setTelegramFeed(messages);
      setTelegramFeedHint(hint ?? null);
    } catch (error) {
      console.error("Failed to load Telegram feed:", error);
      setTelegramFeed([]);
      setTelegramFeedHint(null);
    } finally {
      setLoadingTelegramFeed(false);
    }
  };

  const loadTwitterFeed = async () => {
    // No accounts → no feed. Keeps stale tweets from showing after the user
    // removes the last tracked handle.
    if (twitterAccounts.length === 0) {
      setTwitterFeed([]);
      if (perUserFetchInFlight.current === 0) setLoadingTwitterFeed(false);
      return;
    }
    // Don't toggle the spinner if a per-user cold-start is still polling
    // upstream — otherwise this fast (~50ms) cached-only fetch would clear
    // it well before the cold-start has a chance to land tweets, and the UI
    // would flash to "No tweets yet" for 10+ seconds.
    if (perUserFetchInFlight.current === 0) setLoadingTwitterFeed(true);
    try {
      // Always load the merged feed; the per-user "View" filter is applied
      // client-side via `visibleTwitterFeed`. MERGE into existing twitterFeed
      // instead of replacing — this effect re-fires whenever twitterAccounts
      // changes (incl. the auto-retry every 10s), and a naive replace would
      // wipe out tweets the per-user fetch had just merged in for the
      // currently-selected handle.
      const usernames = twitterAccounts.map((acc) => acc.username);
      const tweets = await getTwitterFeed(
        usernames,
        user?.bearerToken ?? "",
        20,
      );
      const trackedSet = new Set(usernames.map((u) => u.toLowerCase()));
      setTwitterFeed((prev) => {
        const seen = new Set<string>();
        const merged: Tweet[] = [];
        for (const t of tweets) {
          if (!trackedSet.has((t.authorUsername || "").toLowerCase())) continue;
          if (seen.has(t.id)) continue;
          seen.add(t.id);
          merged.push(t);
        }
        for (const t of prev) {
          if (!trackedSet.has((t.authorUsername || "").toLowerCase())) continue;
          if (seen.has(t.id)) continue;
          seen.add(t.id);
          merged.push(t);
        }
        merged.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        return merged.slice(0, 100);
      });
    } catch (error) {
      console.error("Error loading Twitter feed:", error);
      setToast("Failed to load Twitter feed");
      setTimeout(() => setToast(""), 3000);
      // Don't wipe twitterFeed on transient errors.
    } finally {
      // Same guard as on entry: leave the spinner up if a per-user cold-start
      // is still mid-flight.
      if (perUserFetchInFlight.current === 0) setLoadingTwitterFeed(false);
    }
  };

  const handleViewTwitterProfile = (username: string) => {
    // ALWAYS set, never toggle. The previous toggle-on-same-user behavior
    // silently flipped the filter off when the user double-clicked View —
    // which is exactly what's happening when "View on @pumpfun" suddenly
    // showed @sama / @elonmusk. Use the dedicated "Show All" button to clear.
    setSelectedTwitterUser(username.toLowerCase());
    setTwitterTab(1);
    // Bump so the per-user fetch effect re-runs on every click, enabling
    // retry-via-re-click when the first attempt returned empty.
    setViewRequestCount((c) => c + 1);
  };

  // Export: copy wallet data (name, emoji, and address) to clipboard as JSON
  const handleExportAddresses = () => {
    const walletsData = wallets.map((w) => ({
      name: w.name || "Unnamed Wallet",
      emoji: w.emoji || "👻",
      address: w.address,
    }));
    const jsonString = JSON.stringify(walletsData, null, 2);
    navigator.clipboard.writeText(jsonString);
    setShowExportSuccessTooltip(true);
    setTimeout(() => setShowExportSuccessTooltip(false), 2000);
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

          const availableSlots = MAX_WALLETS - wallets.length;
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
      <div>
        <div className="flex min-h-screen flex-col bg-[#030304] text-zinc-100">
          {/* Header stays outside the rounded container */}
          <div className="relative z-[10000]">
            <Header isSticky={false} />
          </div>

          {/* Outer padding wrapper - collapses when a popup is docked */}
          <DockedPanelMarginWrapper>
            <div className="p-1 sm:p-1.5">
              {/* Rounded container with JTX-style design */}
              <div className="relative min-h-[calc(100vh-80px)] overflow-hidden rounded-lg border border-white/[0.06] bg-[#030304]">
                {/* Faint brand-green tech-grid — futuristic depth, single static
                    paint, masked to fade toward the bottom. No blur/shadow/anim. */}
                <div
                  className="pointer-events-none absolute inset-0 rounded-lg"
                  style={{
                    backgroundImage:
                      "linear-gradient(rgba(24,196,140,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(24,196,140,0.035) 1px,transparent 1px)",
                    backgroundSize: "34px 34px",
                    maskImage:
                      "radial-gradient(ellipse 80% 50% at 50% 0%, #000 0%, transparent 70%)",
                    WebkitMaskImage:
                      "radial-gradient(ellipse 80% 50% at 50% 0%, #000 0%, transparent 70%)",
                  }}
                />
                {/* Top-center atmospheric glow + light-beam (static gradients,
                    GPU-composited — no particles/animation, ~0 CPU). */}
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-44"
                  style={{
                    background:
                      "radial-gradient(ellipse 55% 100% at 50% 0%, rgba(24,196,140,0.10), transparent 72%)",
                  }}
                />
                <div
                  className="pointer-events-none absolute top-0 left-1/2 h-px w-[70%] -translate-x-1/2"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgba(127,255,201,0.55) 50%, transparent)",
                  }}
                />

                <div className="relative z-10 mt-5 mb-3 flex flex-col gap-4 px-5 sm:my-7 sm:mb-5 sm:px-7 lg:flex-row lg:items-center lg:justify-between lg:gap-8 lg:px-10">
                  {/* Header Section - JTX premium style */}
                  <div className="scrollbar-hide -mx-5 flex items-center gap-4 overflow-x-auto px-5 pb-2 sm:-mx-7 sm:gap-5 sm:px-7 lg:mx-0 lg:gap-6 lg:px-0 lg:pb-0">
                    <h1
                      className="bg-clip-text text-xl font-black uppercase tracking-wider text-transparent sm:text-2xl"
                      style={{ backgroundImage: "linear-gradient(90deg,#7FFFC9,#18c48c)" }}
                    >
                      Trackers
                    </h1>
                    {/* Connection status — flat, static dot (no ping/blur) */}
                    <div className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-[#08090C] px-2.5 py-1">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: wsConnected ? "#18C48C" : "#F0616D" }}
                      />
                      <span className="text-[11px] font-medium uppercase tracking-wide text-[#71717a]">
                        {wsConnected ? "Live" : "Offline"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="relative z-10 mb-4 flex min-h-0 w-full flex-1 flex-col px-2 sm:mb-8 sm:px-6">
                  {/* Main Content Area: single column when narrow (mobile or docked panels), two columns when wide */}
                  <div
                    className={`flex min-h-0 flex-1 flex-col gap-2 ${!isMobile ? "flex-row" : ""}`}
                  >
                    {isMobile && (
                      <div className="flex w-full rounded-lg border border-white/[0.06] bg-[#0c0e12] p-1 text-[10px] font-medium text-[#52525b] sm:p-1.5 sm:text-xs">
                        <button
                          className={`relative flex-1 rounded-md px-3 py-2 sm:px-4 sm:py-2.5 ${
                            mobileMainTab === "wallets"
                              ? "bg-[#18c48c]/15 font-semibold text-[#18c48c]"
                              : "text-[#71717a] hover:bg-white/[0.04] hover:text-[#a1a1aa]"
                          }`}
                          onClick={() => setMobileMainTab("wallets")}
                        >
                          Wallet Tracker
                          {mobileMainTab === "wallets" && (
                            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#18c48c]" />
                          )}
                        </button>
                        <button
                          className={`relative flex-1 rounded-md px-3 py-2 sm:px-4 sm:py-2.5 ${
                            mobileMainTab === "social"
                              ? "bg-[#18c48c]/15 font-semibold text-[#18c48c]"
                              : "text-[#71717a] hover:bg-white/[0.04] hover:text-[#a1a1aa]"
                          }`}
                          onClick={() => setMobileMainTab("social")}
                        >
                          Social
                          {mobileMainTab === "social" && (
                            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#18c48c]" />
                          )}
                        </button>
                      </div>
                    )}

                    {/* LEFT: WALLET SECTION - JTX premium card style */}
                    {showWalletSection && (
                      <div
                        className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/[0.06] bg-[#0c0e12] px-4 pb-4 sm:px-5"
                        style={{
                          boxShadow:
                            "0 8px 32px rgba(0, 0, 0, 0.4), 0 0 1px rgba(255, 255, 255, 0.1)",
                          maxHeight: isMobile
                            ? "calc(100vh - 200px)"
                            : "calc(100vh - 240px)",
                        }}
                      >
                        {/* Card corner brackets */}
                        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
                          <div className="absolute top-1.5 left-1.5 h-3 w-3 border-t border-l border-white/[0.1]" />
                          <div className="absolute top-1.5 right-1.5 h-3 w-3 border-t border-r border-white/[0.1]" />
                          <div className="absolute bottom-1.5 left-1.5 h-3 w-3 border-b border-l border-white/[0.1]" />
                          <div className="absolute right-1.5 bottom-1.5 h-3 w-3 border-r border-b border-white/[0.1]" />
                        </div>
                        {/* If user is not logged in, show JTX-style empty state */}
                        {!user ? (
                          <div className="flex flex-1 items-center justify-center">
                            <div className="relative flex flex-col items-center rounded-lg border border-white/[0.06] bg-[#08090c] p-8 text-center">
                              {/* Mini corner brackets */}
                              <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
                                <div className="absolute top-1.5 left-1.5 h-2.5 w-2.5 border-t border-l border-white/[0.1]" />
                                <div className="absolute top-1.5 right-1.5 h-2.5 w-2.5 border-t border-r border-white/[0.1]" />
                                <div className="absolute bottom-1.5 left-1.5 h-2.5 w-2.5 border-b border-l border-white/[0.1]" />
                                <div className="absolute right-1.5 bottom-1.5 h-2.5 w-2.5 border-r border-b border-white/[0.1]" />
                              </div>
                              <FiLock className="mb-4 h-10 w-10 text-[#52525b]" />
                              <p className="text-sm font-semibold tracking-tight text-[#f4f4f5]">
                                Log in to start tracking
                              </p>
                              <p className="mt-1.5 text-xs text-[#71717a]">
                                Monitor wallets and catch trades in real-time
                              </p>
                              <button
                                className="mt-5 inline-flex cursor-pointer items-center justify-center rounded-lg bg-[#18c48c] px-6 py-2.5 text-xs font-semibold text-[#030304] hover:brightness-110"
                                onClick={() => {
                                  const event = new CustomEvent(
                                    "open-login-modal",
                                  );
                                  window.dispatchEvent(event);
                                }}
                              >
                                Log in
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* HEADER BAR – JTX premium style */}
                            <div className="flex justify-between gap-3 border-b border-white/[0.06] py-3.5 sm:items-center sm:gap-4 sm:py-4">
                              {/* Left: tabs + wallet count */}
                              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                {TABS.map((tab, i) => {
                                  // Per-tab signature color (comp): WM green, Live
                                  // Trades rose, Monitor amber, KOLs blue. Active =
                                  // filled + glow; inactive = faint colored outline.
                                  const c = TAB_COLORS[i] ?? "#18c48c";
                                  const active = activeTab === i;
                                  return (
                                    <button
                                      key={tab}
                                      onClick={() => setActiveTab(i)}
                                      className="cursor-pointer rounded-md border px-3 py-1.5 text-[10px] font-semibold whitespace-nowrap sm:px-4 sm:py-2 sm:text-xs"
                                      style={{
                                        borderColor: active ? c : `${c}30`,
                                        background: active ? `${c}1f` : "transparent",
                                        color: active ? c : `${c}b0`,
                                      }}
                                    >
                                      {tab}
                                    </button>
                                  );
                                })}
                                <div className="ml-2 flex items-center rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] sm:px-3 sm:py-1.5 sm:text-[11px]">
                                  {activeTab === 3 ? (
                                    <>
                                      <span className="text-neutral-500">
                                        {KOL_TRACKER_ENTRIES.length} KOL
                                        {KOL_TRACKER_ENTRIES.length === 1
                                          ? ""
                                          : "s"}
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="font-bold text-[#18c48c] tabular-nums">
                                        {wallets.length}
                                      </span>
                                      <span className="ml-1 hidden text-[#52525b] sm:ml-1.5 sm:inline">
                                        / {MAX_WALLETS} wallet
                                        {wallets.length === 1 ? "" : "s"}
                                      </span>
                                      <span className="ml-1 text-[#52525b] sm:ml-1.5 sm:hidden">
                                        / {MAX_WALLETS}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Right: action buttons - JTX style */}
                              <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-2.5">
                                {/* Quick-buy amount editor — sets the SOL used by
                                    every Quick Buy button in Live Trades / Monitor. */}
                                {(activeTab === 1 || activeTab === 2) && (
                                  <div className="flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 sm:gap-1.5 sm:px-2.5 sm:py-1.5">
                                    <HiLightningBolt className="h-3 w-3 text-[#18c48c] sm:h-3.5 sm:w-3.5" />
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      aria-label="Quick buy amount (SOL)"
                                      value={quickBuyAmount}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        if (v === "" || /^\d*\.?\d*$/.test(v)) {
                                          setQuickBuyAmount(v);
                                          try {
                                            if (v !== "" && !isNaN(parseFloat(v)))
                                              localStorage.setItem("quickBuyAmount", v);
                                          } catch {
                                            /* ignore */
                                          }
                                        }
                                      }}
                                      onBlur={() => {
                                        if (
                                          quickBuyAmount === "" ||
                                          isNaN(parseFloat(quickBuyAmount))
                                        ) {
                                          setQuickBuyAmount("0.0001");
                                          try {
                                            localStorage.setItem("quickBuyAmount", "0.0001");
                                          } catch {
                                            /* ignore */
                                          }
                                        }
                                      }}
                                      className="w-12 bg-transparent text-[10px] font-semibold text-white outline-none sm:w-16 sm:text-xs"
                                    />
                                    <span className="text-[10px] font-medium text-[#52525b] sm:text-xs">
                                      SOL
                                    </span>
                                  </div>
                                )}
                                {activeTab === 0 && user && (
                                  <>
                                    {selectedChain === "sol" && (
                                      <button
                                        className="cursor-pointer rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[9px] font-medium whitespace-nowrap text-[#a1a1aa] hover:border-white/[0.1] hover:bg-white/[0.06] hover:text-[#f4f4f5] disabled:cursor-not-allowed disabled:opacity-40 sm:px-4 sm:py-2 sm:text-xs"
                                        onClick={handleAddDefault150Wallets}
                                        disabled={
                                          isAtWalletLimit ||
                                          isAddingDefaultWallets
                                        }
                                        title="Add 150 default wallets for Solana"
                                      >
                                        {isAddingDefaultWallets
                                          ? "Adding..."
                                          : "Import top 150 wallets"}
                                      </button>
                                    )}
                                    <button
                                      className="cursor-pointer rounded-md bg-[#18c48c] px-4 py-1.5 text-[9px] font-semibold whitespace-nowrap text-[#030304] hover:brightness-110 sm:px-5 sm:py-2 sm:text-xs"
                                      onClick={handleOpenAddWalletModal}
                                    >
                                      Add Wallet
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>

                            {!user && activeTab !== 3 ? (
                              <div className="flex min-h-[260px] flex-1 flex-col items-center justify-center px-4 py-12 text-center">
                                <FiLock className="mb-3 h-10 w-10 text-neutral-700" />
                                <p className="text-sm font-medium text-neutral-300">
                                  Log in to start tracking
                                </p>
                                <p className="mt-1 text-xs text-neutral-500">
                                  Monitor wallets and catch trades in real-time
                                </p>
                                <button
                                  className="mt-4 inline-flex cursor-pointer items-center justify-center rounded-lg bg-[#7FFFC9] px-6 py-2 text-xs font-semibold text-neutral-900 hover:brightness-90"
                                  type="button"
                                  onClick={() => {
                                    window.dispatchEvent(
                                      new CustomEvent("open-login-modal"),
                                    );
                                  }}
                                >
                                  Log in
                                </button>
                              </div>
                            ) : (
                              <>
                                {/* Search bar — wallet manager */}
                                {activeTab === 0 && user && (
                                  <div className="border-b border-white/[0.04] px-1 py-3 sm:px-2 sm:py-4">
                                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                      {/* Search input - JTX style */}
                                      <div className="min-w-[200px] flex-1">
                                        <input
                                          type="text"
                                          placeholder="Search by address"
                                          className="w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-[10px] text-[#f4f4f5] placeholder:text-[#52525b] focus:border-[#18c48c]/40 focus:bg-[#0c0e12] focus:outline-none sm:px-5 sm:py-2.5 sm:text-xs"
                                          disabled={false}
                                          value={searchTerm}
                                          onChange={(e) =>
                                            setSearchTerm(e.target.value)
                                          }
                                        />
                                      </div>

                                      {/* Right: actions - JTX minimal style */}
                                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                        {activeTab === 0 && (
                                          <>
                                            <button
                                              className="cursor-pointer rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-2 text-[9px] font-medium whitespace-nowrap text-[#a1a1aa] hover:border-white/[0.1] hover:bg-white/[0.08] hover:text-[#f4f4f5] sm:px-3 sm:py-2 sm:text-[10px]"
                                              onClick={() =>
                                                setShowImportModal(true)
                                              }
                                            >
                                              Import
                                            </button>
                                            <div className="relative">
                                              {showExportSuccessTooltip && (
                                                <div className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-md border border-white/[0.08] bg-[#0c0e12]/95 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-[#18c48c] shadow-[0_4px_16px_rgba(0,0,0,0.5)]">
                                                  Export Successful
                                                </div>
                                              )}
                                              <button
                                                className="cursor-pointer rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-2 text-[9px] font-medium whitespace-nowrap text-[#a1a1aa] hover:border-white/[0.1] hover:bg-white/[0.08] hover:text-[#f4f4f5] sm:px-3 sm:py-2 sm:text-[10px]"
                                                onClick={handleExportAddresses}
                                              >
                                                Export
                                              </button>
                                            </div>

                                            {/* Icon buttons - hide some on mobile */}
                                            {/* <button
                                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-sm text-neutral-400 hover:border-white/[0.1] hover:bg-[#0c0e12] hover:text-white sm:h-9 sm:w-9"
                                        type="button"
                                      >
                                        <FiSettings className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                      </button> */}
                                            <button
                                              className={`flex h-8 w-8 items-center justify-center rounded-md border sm:h-9 sm:w-9 ${
                                                isTogglingAllNotifications
                                                  ? "cursor-not-allowed border-white/[0.06] bg-white/[0.04] opacity-40"
                                                  : allNotificationsEnabled
                                                    ? "cursor-pointer border-[#ef4444]/40 bg-[#ef4444]/15 text-[#ef4444] shadow-[0_0_8px_rgba(239,68,68,0.2)] hover:bg-[#ef4444]/25"
                                                    : "cursor-pointer border-white/[0.06] bg-white/[0.04] text-[#71717a] hover:border-white/[0.1] hover:bg-white/[0.08] hover:text-[#a1a1aa]"
                                              }`}
                                              type="button"
                                              onClick={
                                                handleToggleAllNotifications
                                              }
                                              disabled={
                                                isTogglingAllNotifications
                                              }
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
                                            {/* <button
                                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-sm text-neutral-400 hover:border-white/[0.1] hover:bg-[#0c0e12] hover:text-white sm:h-9 sm:w-9"
                                        type="button"
                                      >
                                        <FiShare2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                      </button> */}
                                            {/* <button
                                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-sm text-neutral-400 hover:border-white/[0.1] hover:bg-[#0c0e12] hover:text-white sm:h-9 sm:w-9"
                                        type="button"
                                      >
                                        <FiRss className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                      </button> */}
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Search — KOL directory */}
                                {activeTab === 3 && (
                                  <div className="border-b border-white/[0.04] px-1 py-3 sm:px-2 sm:py-4">
                                    <input
                                      type="text"
                                      placeholder="Search by name, @handle, or wallet"
                                      className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-[10px] text-neutral-200 placeholder:text-neutral-600 focus:border-[#7FFFC9]/60 focus:bg-[#0c0e12] focus:ring-2 focus:ring-[#7FFFC9]/20 focus:outline-none sm:px-5 sm:py-2.5 sm:text-xs"
                                      value={kolSearchTerm}
                                      onChange={(e) =>
                                        setKolSearchTerm(e.target.value)
                                      }
                                    />
                                  </div>
                                )}


                                <div className="-mx-3 min-h-0 flex-1 overflow-y-auto px-3 sm:-mx-5 sm:px-5">
                                  {activeTab === 0 && user ? (
                                    <>
                                      <div className="flex items-center border-b border-white/[0.04] p-1.5 sm:p-2">
                                        <div className="flex w-full items-center gap-2 text-[10px] font-medium text-neutral-500 sm:gap-4 sm:text-xs">
                                          <span className="flex w-16 justify-center sm:w-28">
                                            Created
                                          </span>
                                          <span className="min-w-0 flex-1">
                                            Name
                                          </span>
                                          <span className="w-20 sm:w-36">
                                            Balance
                                          </span>
                                          <span className="hidden w-16 justify-center sm:flex sm:w-28">
                                            Last Active
                                          </span>
                                          <div className="flex flex-1 items-center justify-end">
                                            <button
                                              className="text-[10px] font-semibold whitespace-nowrap text-red-400 hover:text-red-300 sm:text-xs"
                                              onClick={() =>
                                                handleRemoveWallet("all")
                                              }
                                            >
                                              Remove All
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                      {wallets.length === 0 ? (
                                        <div className="flex h-64 flex-col items-center justify-center">
                                          <FiEye className="mb-3 h-10 w-10 text-neutral-700" />
                                          <span className="text-sm font-medium text-neutral-300">
                                            No wallets tracked yet
                                          </span>
                                          <span className="mt-1 text-xs text-neutral-500">
                                            Add a wallet address to monitor its
                                            trades
                                          </span>
                                        </div>
                                      ) : (
                                        <div className="scrollbar-hide overflow-x-auto">
                                          <table className="w-full min-w-[500px] text-[10px] sm:min-w-[640px] sm:text-xs">
                                            <tbody>
                                              {filteredWallets.map((wallet) => {
                                                const watched =
                                                  watchedWallets.find(
                                                    (ww) =>
                                                      ww.address ===
                                                      wallet.address,
                                                  );
                                                const events =
                                                  walletEvents[
                                                    wallet.address
                                                  ] || [];
                                                const balance =
                                                  trackedWalletBalances[
                                                    wallet.address
                                                  ];
                                                return (
                                                  <WalletRow
                                                    key={wallet.address}
                                                    wallet={wallet}
                                                    watchedWallet={watched}
                                                    events={events}
                                                    balance={balance}
                                                    lastActive={
                                                      lastActiveMap[
                                                        wallet.address
                                                      ]
                                                    }
                                                    onRemove={
                                                      handleRemoveWallet
                                                    }
                                                    onClick={(wallet) => {
                                                      // Kick off all scan
                                                      // fetches (summary +
                                                      // positions + trades) in
                                                      // parallel BEFORE the
                                                      // panel mounts, so the
                                                      // slow positions request
                                                      // starts ~100-300ms
                                                      // earlier. useWalletScan
                                                      // dedupes against this.
                                                      void prefetchWalletScan(
                                                        wallet.address,
                                                      );
                                                      setScannedWallet(wallet);
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
                                  ) : activeTab === 1 ? (
                                    <LiveTradesPanel
                                      trades={liveTradesToRender}
                                      wallets={wallets}
                                      wsConnected={wsConnected}
                                      quickBuyAmount={quickBuyAmount}
                                      onQuickBuy={handleQuickBuy}
                                      isLoading={isLoadingHistory}
                                    />
                                  ) : activeTab === 2 ? (
                                    <MonitorPanel
                                      trades={liveTradesToRender}
                                      wallets={wallets}
                                      wsConnected={wsConnected}
                                      quickBuyAmount={quickBuyAmount}
                                      onQuickBuy={handleQuickBuy}
                                      isLoading={isLoadingHistory}
                                    />
                                  ) : activeTab === 3 ? (
                                    <div className="flex flex-col pb-2">
                                      {filteredKolEntries.length === 0 ? (
                                        <div className="flex h-48 flex-col items-center justify-center text-center">
                                          <FiEye className="mb-3 h-9 w-9 text-neutral-700" />
                                          <span className="text-sm text-neutral-400">
                                            No matching KOLs
                                          </span>
                                        </div>
                                      ) : (
                                        <ul className="flex flex-col">
                                          {filteredKolEntries.map((kol) => {
                                            const muted = kolMutedSet.has(
                                              kol.wallet,
                                            );
                                            const starred = kolStarredSet.has(
                                              kol.wallet,
                                            );
                                            const iconBtn =
                                              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-white/[0.06] hover:text-neutral-300 sm:h-8 sm:w-8";
                                            return (
                                              <li
                                                key={kol.wallet}
                                                role="presentation"
                                                className={`flex cursor-pointer items-center gap-2 border-b border-white/[0.06] px-2 py-2.5 hover:bg-white/[0.03] sm:gap-3 sm:py-3 ${
                                                  muted ? "opacity-40" : ""
                                                }`}
                                                onClick={(e) => {
                                                  const t =
                                                    e.target as HTMLElement;
                                                  if (
                                                    t.closest("button") ||
                                                    t.closest("a")
                                                  )
                                                    return;
                                                  setScannedWallet(
                                                    kolEntryToWallet(kol),
                                                  );
                                                }}
                                              >
                                                <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
                                                  <KolAvatar
                                                    name={kol.name}
                                                    handle={kol.handle}
                                                  />
                                                  <div className="min-w-0 flex-1">
                                                    <div className="truncate text-xs font-semibold text-white sm:text-sm">
                                                      {kol.name}
                                                    </div>
                                                    <div className="truncate text-[10px] text-neutral-500 sm:text-xs">
                                                      @{kol.handle}
                                                    </div>
                                                  </div>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                                                  <span className="hidden font-mono text-[10px] text-neutral-200 tabular-nums sm:inline sm:text-xs">
                                                    {truncateKolAddress(
                                                      kol.wallet,
                                                    )}
                                                  </span>
                                                  <span className="font-mono text-[10px] text-neutral-200 tabular-nums sm:hidden">
                                                    {truncateKolAddress(
                                                      kol.wallet,
                                                      3,
                                                      3,
                                                    )}
                                                  </span>
                                                  <button
                                                    type="button"
                                                    className={iconBtn}
                                                    title="Copy address"
                                                    onClick={async (e) => {
                                                      e.stopPropagation();
                                                      try {
                                                        await navigator.clipboard?.writeText(
                                                          kol.wallet,
                                                        );
                                                        showEnhancedToast(
                                                          "success",
                                                          "Address copied",
                                                          { duration: 2000 },
                                                        );
                                                      } catch {
                                                        showToastMessage(
                                                          "Could not copy address",
                                                        );
                                                      }
                                                    }}
                                                  >
                                                    <FiCopy className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                                  </button>
                                                  <div className="ml-0.5 flex items-center gap-0.5 sm:ml-0 sm:gap-1">
                                                    <button
                                                      type="button"
                                                      className={iconBtn}
                                                      title="Scan wallet"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        setScannedWallet(
                                                          kolEntryToWallet(kol),
                                                        );
                                                      }}
                                                    >
                                                      <FiBarChart2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                                    </button>
                                                    <a
                                                      href={`https://x.com/${kol.handle}`}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                      className={iconBtn}
                                                      title={`@${kol.handle} on X`}
                                                      onClick={(e) =>
                                                        e.stopPropagation()
                                                      }
                                                    >
                                                      <FaXTwitter className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                                    </a>
                                                  </div>
                                                </div>
                                              </li>
                                            );
                                          })}
                                        </ul>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* RESIZE HANDLE — JTX style */}
                    {showSocialSection && !isMobile && (
                      <div
                        className="group relative hidden h-full min-h-[530px] w-1.5 cursor-ew-resize items-center justify-center hover:bg-[#18c48c]/5 lg:flex"
                        onMouseDown={() => setIsResizing(true)}
                      >
                        <div className="absolute h-20 w-0.5 rounded-full bg-[#52525b] group-hover:bg-[#18c48c] group-hover:shadow-[0_0_6px_rgba(24,196,140,0.4)]" />
                      </div>
                    )}

                    {/* RIGHT: SOCIAL TRACKERS (X + TG) - JTX premium card */}
                    {showSocialSection && (
                      <div
                        className="relative flex min-h-0 flex-shrink-0 flex-col overflow-hidden rounded-lg border border-white/[0.06] bg-[#0c0e12] px-4 sm:px-5"
                        aria-label="Social Tracker"
                        style={
                          isMobile
                            ? {
                                boxShadow:
                                  "0 8px 32px rgba(0, 0, 0, 0.4), 0 0 1px rgba(255, 255, 255, 0.1)",
                                maxHeight: "calc(100vh - 200px)",
                              }
                            : {
                                width: `${sidebarWidth}px`,
                                minWidth: "480px",
                                maxWidth: "600px",
                                maxHeight: "calc(100vh - 240px)",
                                boxShadow:
                                  "0 8px 32px rgba(0, 0, 0, 0.4), 0 0 1px rgba(255, 255, 255, 0.1)",
                              }
                        }
                      >
                        {/* Card corner brackets */}
                        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
                          <div className="absolute top-1.5 left-1.5 h-3 w-3 border-t border-l border-white/[0.1]" />
                          <div className="absolute top-1.5 right-1.5 h-3 w-3 border-t border-r border-white/[0.1]" />
                          <div className="absolute bottom-1.5 left-1.5 h-3 w-3 border-b border-l border-white/[0.1]" />
                          <div className="absolute right-1.5 bottom-1.5 h-3 w-3 border-r border-b border-white/[0.1]" />
                        </div>
                        {/* Top-level tabs: X Tracker / TG Tracker */}
                        <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] pt-3.5 pb-2.5 sm:pt-4 sm:pb-3">
                          <div className="flex items-center gap-4 sm:gap-5">
                            <button
                              type="button"
                              onClick={() => setSocialPanelTab("twitter")}
                              className={`cursor-pointer text-sm font-semibold tracking-tight sm:text-base ${
                                socialPanelTab === "twitter"
                                  ? "text-[#f4f4f5]"
                                  : "text-[#52525b] hover:text-[#a1a1aa]"
                              }`}
                            >
                              X Tracker
                            </button>
                            <button
                              type="button"
                              onClick={() => setSocialPanelTab("telegram")}
                              className={`cursor-pointer text-sm font-semibold tracking-tight sm:text-base ${
                                socialPanelTab === "telegram"
                                  ? "text-[#f4f4f5]"
                                  : "text-[#52525b] hover:text-[#a1a1aa]"
                              }`}
                            >
                              Telegram Tracker
                            </button>
                            <button
                              type="button"
                              onClick={() => setSocialPanelTab("kolscan")}
                              className={`cursor-pointer text-sm font-semibold tracking-tight sm:text-base ${
                                socialPanelTab === "kolscan"
                                  ? "text-[#f4f4f5]"
                                  : "text-[#52525b] hover:text-[#a1a1aa]"
                              }`}
                            >
                              KOLScan
                            </button>
                          </div>
                        </div>
                        {socialPanelTab === "kolscan" && (
                          <KolScanTrackerContent />
                        )}
                        {socialPanelTab === "telegram" && (
                          <>
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pt-2.5 pb-2.5 sm:gap-3 sm:pt-3 sm:pb-3">
                              <div className="flex gap-1 sm:gap-1.5">
                                {TELEGRAM_TABS.map((label, i) => (
                                  <button
                                    key={label}
                                    className={`group relative cursor-pointer rounded-md px-2.5 py-1.5 text-[10px] whitespace-nowrap sm:px-3 sm:py-2 sm:text-xs ${
                                      telegramTab === i
                                        ? "bg-[#18c48c]/10 font-semibold text-[#18c48c]"
                                        : "font-medium text-[#71717a] hover:bg-white/[0.04] hover:text-[#a1a1aa]"
                                    }`}
                                    onClick={() =>
                                      setTelegramTab(i as 0 | 1 | 2)
                                    }
                                  >
                                    <span className="relative z-10">
                                      {label}
                                    </span>
                                    {telegramTab === i && (
                                      <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#18c48c]" />
                                    )}
                                  </button>
                                ))}
                              </div>
                              {user && (
                                <button
                                  type="button"
                                  onClick={handleRestoreTelegramDefaults}
                                  disabled={restoringTelegramDefaults}
                                  className="cursor-pointer rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-medium text-[#a1a1aa] hover:border-white/[0.1] hover:bg-white/[0.08] hover:text-[#f4f4f5] disabled:opacity-40 sm:px-3 sm:py-2 sm:text-xs"
                                >
                                  {restoringTelegramDefaults
                                    ? "Adding…"
                                    : "Restore to default"}
                                </button>
                              )}
                            </div>
                            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                              {!user ? (
                                <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
                                  <FiLock className="mb-4 h-10 w-10 text-[#52525b]" />
                                  <span className="text-sm font-semibold tracking-tight text-[#f4f4f5]">
                                    Log in to track channels
                                  </span>
                                  <span className="mt-1.5 text-xs text-[#71717a]">
                                    Add Telegram channels to your watchlist
                                  </span>
                                </div>
                              ) : telegramTab === 0 ? (
                                loadingTelegramChannels ? (
                                  <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
                                    <div className="mb-3 flex gap-1.5">
                                      <div className="h-2 w-2 animate-pulse rounded-full bg-[#18c48c]/60" />
                                      <div className="h-2 w-2 animate-pulse rounded-full bg-[#18c48c]/60 [animation-delay:150ms]" />
                                      <div className="h-2 w-2 animate-pulse rounded-full bg-[#18c48c]/60 [animation-delay:300ms]" />
                                    </div>
                                    <span className="text-xs text-[#71717a]">
                                      Loading channels...
                                    </span>
                                  </div>
                                ) : telegramChannels.length === 0 ? (
                                  <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
                                    <FiMessageCircle className="mb-4 h-10 w-10 text-[#52525b]" />
                                    <span className="text-sm font-semibold tracking-tight text-[#f4f4f5]">
                                      No channels tracked
                                    </span>
                                    <span className="mt-1.5 text-xs text-[#71717a]">
                                      Add Telegram channels to catch alpha
                                    </span>
                                  </div>
                                ) : (
                                  <div className="scrollbar-hide flex-1 overflow-auto">
                                    <table className="w-full min-w-[280px] text-[10px] sm:min-w-[320px] sm:text-xs">
                                      <thead>
                                        <tr className="border-b border-white/[0.06]">
                                          <th className="px-2 py-2.5 text-left text-[10px] font-medium tracking-wider text-[#52525b] uppercase sm:text-xs">
                                            Channel
                                          </th>
                                          <th className="px-2 py-2.5 text-left text-[10px] font-medium tracking-wider text-[#52525b] uppercase sm:text-xs">
                                            Added
                                          </th>
                                          <th className="px-2 py-2.5 text-right text-[10px] font-medium tracking-wider text-[#52525b] uppercase sm:text-xs">
                                            Actions
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {telegramChannels.map((ch) => (
                                          <TelegramChannelRow
                                            key={ch.id}
                                            channel={ch}
                                            title={
                                              telegramChannelTitles[ch.username]
                                            }
                                            onRemove={
                                              handleRemoveTelegramChannel
                                            }
                                          />
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )
                              ) : telegramTab === 1 ? (
                                loadingTelegramFeed ? (
                                  <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
                                    <div className="mb-3 flex gap-1.5">
                                      <div className="h-2 w-2 animate-pulse rounded-full bg-[#18c48c]/60" />
                                      <div className="h-2 w-2 animate-pulse rounded-full bg-[#18c48c]/60 [animation-delay:150ms]" />
                                      <div className="h-2 w-2 animate-pulse rounded-full bg-[#18c48c]/60 [animation-delay:300ms]" />
                                    </div>
                                    <span className="text-xs text-[#71717a]">
                                      Loading messages...
                                    </span>
                                  </div>
                                ) : telegramFeed.length === 0 ? (
                                  <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
                                    <FiMessageCircle className="mb-4 h-10 w-10 text-[#52525b]" />
                                    <span className="text-sm font-semibold tracking-tight text-[#f4f4f5]">
                                      No messages yet
                                    </span>
                                    <span className="mt-1.5 text-xs text-[#71717a]">
                                      {telegramFeedHint ||
                                        "Add channels and ensure Telegram client is configured on the server."}
                                    </span>
                                    <button
                                      type="button"
                                      className="mt-5 rounded-md border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-medium text-[#a1a1aa] hover:border-white/[0.1] hover:bg-white/[0.08] hover:text-[#f4f4f5]"
                                      onClick={() => loadTelegramFeed(true)}
                                    >
                                      Retry
                                    </button>
                                  </div>
                                ) : (
                                  <div className="scrollbar-hide flex-1 space-y-2 overflow-auto p-2">
                                    {telegramFeed.map((msg) => (
                                      <a
                                        key={`${msg.channelUsername}-${msg.id}`}
                                        href={`https://t.me/${msg.channelUsername}/${msg.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="relative block rounded-lg border border-white/[0.06] bg-[#08090c] p-3.5 text-left hover:border-white/[0.1] hover:bg-[#080a0d]/80"
                                      >
                                        {/* Mini corner brackets on message cards */}
                                        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
                                          <div className="absolute top-1 left-1 h-2 w-2 border-t border-l border-white/[0.08]" />
                                          <div className="absolute top-1 right-1 h-2 w-2 border-t border-r border-white/[0.08]" />
                                        </div>
                                        <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
                                          <span className="text-xs font-semibold text-[#18c48c] sm:text-sm">
                                            @{msg.channelUsername}
                                          </span>
                                          <span className="shrink-0 text-[10px] text-[#52525b] tabular-nums">
                                            {msg.date
                                              ? new Date(
                                                  msg.date * 1000,
                                                ).toLocaleString(undefined, {
                                                  month: "short",
                                                  day: "numeric",
                                                  hour: "2-digit",
                                                  minute: "2-digit",
                                                })
                                              : ""}
                                          </span>
                                        </div>
                                        <div className="text-xs leading-relaxed text-[#a1a1aa] sm:text-sm">
                                          <TelegramMessageBody
                                            text={msg.text}
                                            entities={msg.entities}
                                          />
                                        </div>
                                      </a>
                                    ))}
                                  </div>
                                )
                              ) : (
                                <>
                                  <div className="my-2.5 flex items-center gap-2 border-b border-white/[0.06] pb-2.5">
                                    <input
                                      type="text"
                                      placeholder="@ Search channel"
                                      value={approvedChannelsSearch}
                                      onChange={(e) =>
                                        setApprovedChannelsSearch(
                                          e.target.value,
                                        )
                                      }
                                      className="max-w-[200px] flex-1 rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[10px] text-[#f4f4f5] placeholder:text-[#52525b] focus:border-[#18c48c]/40 focus:outline-none sm:text-xs"
                                    />
                                  </div>
                                  <div className="scrollbar-hide flex-1 overflow-y-auto">
                                    {approvedTelegramChannels.length === 0 ? (
                                      <div className="flex flex-col items-center justify-center py-8 text-center">
                                        <span className="text-xs text-neutral-500">
                                          No approved channels to show
                                        </span>
                                      </div>
                                    ) : (
                                      (approvedChannelsSearch.trim()
                                        ? approvedTelegramChannels.filter(
                                            (ch) =>
                                              ch
                                                .toLowerCase()
                                                .includes(
                                                  approvedChannelsSearch
                                                    .trim()
                                                    .toLowerCase(),
                                                ),
                                          )
                                        : approvedTelegramChannels
                                      ).map((channel, idx) => {
                                        const username = channel
                                          .replace(/^@/, "")
                                          .toLowerCase();
                                        const isTracked = telegramChannels.some(
                                          (c) =>
                                            c.username.toLowerCase() ===
                                            username,
                                        );
                                        const isAdding =
                                          addingTelegramChannel === username;
                                        return (
                                          <div
                                            key={channel}
                                            className="flex items-center justify-between gap-2 border-b border-white/[0.06] py-2 text-[10px] sm:text-xs"
                                          >
                                            <div className="flex min-w-0 items-center">
                                              <span className="w-8 shrink-0 text-[#52525b] tabular-nums">
                                                {idx + 1}
                                              </span>
                                              <a
                                                href={`https://t.me/${username}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="min-w-0 truncate text-[#a1a1aa] hover:text-[#f4f4f5] hover:underline"
                                              >
                                                @{username}
                                              </a>
                                            </div>
                                            <button
                                              type="button"
                                              onClick={async () => {
                                                if (isTracked || isAdding)
                                                  return;
                                                setAddingTelegramChannel(
                                                  username,
                                                );
                                                try {
                                                  await handleAddTelegramChannel(
                                                    username,
                                                  );
                                                } finally {
                                                  setAddingTelegramChannel(
                                                    null,
                                                  );
                                                }
                                              }}
                                              disabled={isTracked || isAdding}
                                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] text-[#71717a] hover:border-[#18c48c]/40 hover:bg-[#18c48c]/10 hover:text-[#18c48c] disabled:opacity-40 disabled:hover:border-white/[0.06] disabled:hover:bg-[#08090c] disabled:hover:text-[#71717a]"
                                              title={
                                                isTracked
                                                  ? "Already tracked"
                                                  : "Add to tracked channels"
                                              }
                                              aria-label={`Add @${username}`}
                                            >
                                              {isAdding ? (
                                                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                              ) : (
                                                <FiPlus className="h-3.5 w-3.5" />
                                              )}
                                            </button>
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </>
                        )}
                        {socialPanelTab === "twitter" && (
                          <>
                            {/* Twitter Tabs Header */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pt-2.5 pb-2.5 sm:gap-3 sm:pt-3 sm:pb-3">
                              <div className="flex gap-1 sm:gap-1.5">
                                {TWITTER_TABS.map((tab, i) => (
                                  <button
                                    key={tab}
                                    className={`group relative cursor-pointer rounded-md px-2.5 py-1.5 text-[10px] whitespace-nowrap sm:px-3 sm:py-2 sm:text-xs ${
                                      twitterTab === i
                                        ? "bg-[#18c48c]/10 font-semibold text-[#18c48c]"
                                        : "font-medium text-[#71717a] hover:bg-white/[0.04] hover:text-[#a1a1aa]"
                                    }`}
                                    onClick={() => setTwitterTab(i)}
                                  >
                                    <span className="relative z-10">{tab}</span>
                                    {twitterTab === i && (
                                      <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#18c48c]" />
                                    )}
                                  </button>
                                ))}
                              </div>
                              {twitterTab === 0 && (
                                <button
                                  type="button"
                                  className="cursor-pointer rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-medium text-[#a1a1aa] hover:border-white/[0.1] hover:bg-white/[0.08] hover:text-[#f4f4f5] sm:px-3 sm:py-2 sm:text-xs"
                                  onClick={() => setShowAddTwitterModal(true)}
                                >
                                  Add Handle
                                </button>
                              )}
                            </div>

                            {/* Twitter Content */}
                            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                              {!user ? (
                                <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
                                  <FiLock className="mb-4 h-10 w-10 text-[#52525b]" />
                                  <span className="text-sm font-semibold tracking-tight text-[#f4f4f5]">
                                    Log in to track accounts
                                  </span>
                                  <span className="mt-1.5 text-xs text-[#71717a]">
                                    Add X accounts to your watchlist
                                  </span>
                                </div>
                              ) : twitterTab === 0 ? (
                                // Tracked Accounts Tab
                                visibleTwitterAccounts.length === 0 ? (
                                  <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
                                    <FiAtSign className="mb-4 h-10 w-10 text-[#52525b]" />
                                    <span className="text-sm font-semibold tracking-tight text-[#f4f4f5]">
                                      No accounts tracked
                                    </span>
                                    <span className="mt-1.5 text-xs text-[#71717a]">
                                      Track crypto X accounts to catch alpha
                                    </span>
                                  </div>
                                ) : (
                                  <div className="scrollbar-hide flex-1 overflow-auto">
                                    <table className="w-full min-w-[280px] text-[10px] sm:min-w-[320px] sm:text-xs">
                                      <tbody>
                                        {visibleTwitterAccounts.map(
                                          (account) => (
                                            <TwitterAccountRow
                                              key={account.username}
                                              account={account}
                                              onRemove={
                                                handleRemoveTwitterAccount
                                              }
                                              onViewProfile={
                                                handleViewTwitterProfile
                                              }
                                            />
                                          ),
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                )
                              ) : twitterTab === 1 ? (
                                // X Feed Tab
                                loadingTwitterFeed ? (
                                  <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
                                    <div className="mb-3 flex gap-1.5">
                                      <div className="h-2 w-2 animate-pulse rounded-full bg-[#18c48c]/60" />
                                      <div className="h-2 w-2 animate-pulse rounded-full bg-[#18c48c]/60 [animation-delay:150ms]" />
                                      <div className="h-2 w-2 animate-pulse rounded-full bg-[#18c48c]/60 [animation-delay:300ms]" />
                                    </div>
                                    <span className="text-xs text-[#71717a]">
                                      Loading feed...
                                    </span>
                                  </div>
                                ) : visibleTwitterFeed.length === 0 ? (
                                  <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
                                    <FiMessageCircle className="mb-4 h-10 w-10 text-[#52525b]" />
                                    <span className="text-sm font-semibold tracking-tight text-[#f4f4f5]">
                                      {selectedTwitterUser
                                        ? `No tweets from @${selectedTwitterUser} yet`
                                        : "No tweets yet"}
                                    </span>
                                    <span className="mt-1.5 text-xs text-[#71717a]">
                                      {selectedTwitterUser
                                        ? "They'll appear here when this account posts."
                                        : "Add accounts or check back later"}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="scrollbar-hide flex-1 space-y-2 overflow-auto p-2">
                                    {visibleTwitterFeed.map((tweet) => (
                                      <a
                                        key={tweet.id}
                                        href={
                                          tweet.url ||
                                          `https://x.com/${tweet.authorUsername}/status/${tweet.id}`
                                        }
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="relative block rounded-lg border border-white/[0.06] bg-[#08090c] p-3.5 text-left hover:border-white/[0.1] hover:bg-[#080a0d]/80"
                                      >
                                        {/* Mini corner brackets on tweet cards */}
                                        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
                                          <div className="absolute top-1 left-1 h-2 w-2 border-t border-l border-white/[0.08]" />
                                          <div className="absolute top-1 right-1 h-2 w-2 border-t border-r border-white/[0.08]" />
                                        </div>
                                        <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
                                          <div className="flex min-w-0 items-center gap-2">
                                            {tweet.authorProfileImage ? (
                                              <img
                                                src={tweet.authorProfileImage}
                                                alt={tweet.authorName}
                                                className="h-6 w-6 shrink-0 rounded-full ring-1 ring-white/10"
                                              />
                                            ) : (
                                              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#1a1d22] to-[#0c0e12] text-[10px] text-[#a1a1aa]">
                                                {tweet.authorName
                                                  .charAt(0)
                                                  .toUpperCase()}
                                              </div>
                                            )}
                                            <span className="truncate text-xs font-semibold text-[#18c48c] sm:text-sm">
                                              @{tweet.authorUsername}
                                            </span>
                                          </div>
                                          <span className="shrink-0 text-[10px] text-[#52525b] tabular-nums">
                                            {new Date(
                                              tweet.createdAt,
                                            ).toLocaleString(undefined, {
                                              month: "short",
                                              day: "numeric",
                                              hour: "2-digit",
                                              minute: "2-digit",
                                            })}
                                          </span>
                                        </div>
                                        <div className="text-xs leading-relaxed break-words whitespace-pre-wrap text-[#a1a1aa] sm:text-sm">
                                          {tweet.text}
                                        </div>
                                        {tweet.images &&
                                          tweet.images.length > 0 && (
                                            <div className="mt-2.5 flex flex-wrap gap-2">
                                              {tweet.images.map((img, idx) => (
                                                <img
                                                  key={idx}
                                                  src={img}
                                                  alt={`Tweet image ${idx + 1}`}
                                                  className="max-h-48 rounded-lg ring-1 ring-white/[0.06]"
                                                />
                                              ))}
                                            </div>
                                          )}
                                        <div className="mt-2.5 flex items-center gap-4 text-[10px] text-[#52525b] sm:text-xs">
                                          <span className="inline-flex items-center gap-1">
																						<FiHeart className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
																						{tweet.likeCount || 0}
                                          </span>
                                          <span className="inline-flex items-center gap-1">
                                            <FiRepeat className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                            {tweet.retweetCount || 0}
                                          </span>
                                          <span className="inline-flex items-center gap-1">
                                            <FiMessageCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                            {tweet.replyCount || 0}
                                          </span>
                                        </div>
                                      </a>
                                    ))}
                                  </div>
                                )
                              ) : (
                                <>
                                  <div className="my-2.5 flex items-center gap-2 border-b border-white/[0.06] pb-2.5">
                                    <input
                                      type="text"
                                      placeholder="Search handle"
                                      value={approvedHandlesSearch}
                                      onChange={(e) =>
                                        setApprovedHandlesSearch(e.target.value)
                                      }
                                      className="w-full flex-1 rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[10px] text-[#f4f4f5] placeholder:text-[#52525b] focus:border-[#18c48c]/40 focus:outline-none sm:text-xs"
                                    />
                                  </div>
                                  <div className="scrollbar-hide flex-1 overflow-y-auto">
                                    {loadingApprovedHandles ? (
                                      <div className="flex flex-col items-center justify-center py-8 text-center">
                                        <span className="text-xs text-[#71717a]">
                                          Loading list...
                                        </span>
                                      </div>
                                    ) : approvedHandles.length === 0 ? (
                                      <div className="flex flex-col items-center justify-center py-8 text-center">
                                        <span className="text-xs text-[#71717a]">
                                          No approved handles to show
                                        </span>
                                      </div>
                                    ) : (
                                      (approvedHandlesSearch.trim()
                                        ? approvedHandles.filter((h) =>
                                            h
                                              .toLowerCase()
                                              .includes(
                                                approvedHandlesSearch
                                                  .trim()
                                                  .toLowerCase(),
                                              ),
                                          )
                                        : approvedHandles
                                      ).map((handle, idx) => {
                                        const isTracked = twitterAccounts.some(
                                          (a) =>
                                            a.username.toLowerCase() ===
                                            handle.toLowerCase(),
                                        );
                                        const isAdding =
                                          addingHandle === handle;
                                        return (
                                          <div
                                            key={handle}
                                            className="flex items-center justify-between gap-2 border-b border-white/[0.06] py-2 text-[10px] sm:text-xs"
                                          >
                                            <div className="flex min-w-0 items-center">
                                              <span className="w-8 shrink-0 text-[#52525b] tabular-nums">
                                                {idx + 1}
                                              </span>
                                              <a
                                                href={`https://x.com/${handle}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="min-w-0 truncate text-[#a1a1aa] hover:text-[#f4f4f5] hover:underline"
                                              >
                                                @{handle}
                                              </a>
                                            </div>
                                            <button
                                              type="button"
                                              onClick={async () => {
                                                if (isTracked || isAdding)
                                                  return;
                                                setAddingHandle(handle);
                                                try {
                                                  await handleAddTwitterAccount(
                                                    handle,
                                                  );
                                                } finally {
                                                  setAddingHandle(null);
                                                }
                                              }}
                                              disabled={isTracked || isAdding}
                                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] text-[#71717a] hover:border-[#18c48c]/40 hover:bg-[#18c48c]/10 hover:text-[#18c48c] disabled:opacity-40 disabled:hover:border-white/[0.06] disabled:hover:bg-[#08090c] disabled:hover:text-[#71717a]"
                                              title={
                                                isTracked
                                                  ? "Already tracked"
                                                  : "Add to tracked accounts"
                                              }
                                              aria-label={`Add @${handle}`}
                                            >
                                              {isAdding ? (
                                                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                              ) : (
                                                <FiPlus className="h-3.5 w-3.5" />
                                              )}
                                            </button>
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {/* end rounded container */}
            </div>
          </DockedPanelMarginWrapper>
          {/* end outer padding wrapper */}
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

            const availableSlots = MAX_WALLETS - wallets.length;
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
      <AddTelegramChannelModal
        isOpen={showAddTelegramModal}
        onClose={() => setShowAddTelegramModal(false)}
        onAddChannel={handleAddTelegramChannel}
        approvedChannels={approvedTelegramChannels}
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
