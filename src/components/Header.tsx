const isDev = process.env.NODE_ENV !== "production";

import Link from "next/link";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import { createPortal } from "react-dom";
import {
  FaSearch,
  FaStar,
  FaRegStar,
  FaChevronLeft,
  FaChevronRight,
  FaBell,
  FaChevronDown,
  FaSync,
  FaSortAmountDown,
  FaBars,
  FaTimes,
} from "react-icons/fa";
import { HiLightningBolt } from "react-icons/hi";
import { IoShieldCheckmarkOutline } from "react-icons/io5";
import { SiPolygon } from "react-icons/si";
import { BiCopy, BiCheck } from "react-icons/bi";
import { HiOutlineQrcode, HiOutlineSwitchVertical } from "react-icons/hi";
import {
  getPolymarketBalance,
  autoConvertUsdcToUsdce,
  type PolymarketBalance,
  SOL_MINT_ADDRESS,
} from "~/utils/api";
import QRCode from "react-qr-code";
import { useUser } from "./UserContext";
import {
  confirmOptimisticMarker,
  insertOptimisticMarker,
  rollbackOptimisticMarker,
} from "~/utils/pendingTradeMarkers";
import { useCreditsSummary } from "~/hooks/useArena";
import { useSolPrice } from "./SolPriceContext";
import { useWatchlist } from "./WatchlistContext";
import { useQuickBuy } from "./QuickBuyContext";
import { useSearch } from "./ui/SearchContext";
import { formatSmartNumber, formatMarketCap } from "../utils/db";
import type { Token } from "../utils/db";

import {
  executeMonadMultiBuy,
  formatMonadTxSummary,
} from "~/utils/monadWalletAllocation";
import { formatMonadError } from "~/utils/monadError";
import { preloadTradeChart } from "~/utils/preloadTradeChart";
import {
  extractTokenImage,
  resolveTokenImage,
  getResolvedTokenImage,
} from "~/utils/images";
import { broadcastMonadQuickTrade } from "~/utils/monadTradeEvents";
import {
  broadcastTradeCompleted,
  notifyTradePending,
} from "~/utils/tradeEvents";
import {
  executeSolanaMultiBuy,
  buildSolanaWalletAllocations,
} from "~/utils/solanaWalletAllocation";
import {
  validateSolanaBuy,
  showTradeValidationError,
} from "~/utils/preTradeValidation";
import { checkAtaExists } from "~/utils/ataCheck";
import { fetchVerifiedPairAddress } from "~/hooks/useSingleTokenPolling";
import { getPoolTypeFromToken } from "~/utils/poolTypeDetection";
import { mapTradeErrorMessage } from "~/utils/tradeErrorMessages";
import {
  listenForTradeEvents,
  transformToastToError,
} from "~/utils/createSolanaToastHandler";
import { dispatchBalanceRefresh } from "~/utils/balanceEvents";

import Cookies from "js-cookie";
import toast from "react-hot-toast";
import { FaCheckCircle } from "react-icons/fa";
import dynamic from "next/dynamic";
import InterstateButton from "./InterstateButton";
import {
  FiBarChart,
  FiChevronDown,
  FiEdit2,
  FiStar,
  FiUsers,
  FiGrid,
} from "react-icons/fi";
import { GiTrophy } from "react-icons/gi";
import SearchModal from "./SearchModal";
import BlockchainSwitcher from "./BlockchainSwitcher";
import FastImage from "./FastImage";
import UpdatesModal from "./UpdatesModal";
import UsernameEditModal from "./UsernameEditModal";
import NotificationDropdown from "./NotificationDropdown";
import { useReferralStats } from "~/hooks/useArena";
import type { Timeframe } from "../pages/index";
// import MorphingArenaNav from "./MorphingArenaNav"; // Commented out - Arena now in main nav

// Module-level: persists across Header remounts during page navigation
const _stableEnrichedWatchlist: Token[] = [];

/* ---- style palette ---- */
const AX = {
  // Deep void backgrounds with subtle blue undertone
  bg: "#030304",
  bgDeep: "#050608",
  surface: "#08090c",
  surface2: "#0c0e12",
  surfaceHover: "#10131a",
  card: "#141720",
  
  // Borders with subtle glow potential
  border: "rgba(255,255,255,0.06)",
  borderHover: "rgba(255,255,255,0.10)",
  borderStrong: "rgba(255,255,255,0.14)",
  borderGlow: "rgba(24, 196, 140, 0.25)",
  
  // Text hierarchy
  text: "#f4f4f5",
  textSecondary: "#a1a1aa",
  textMuted: "#71717a",
  textDim: "#52525b",
  
  // Accent colors - Emerald/Mint
  mint: "#18c48c",
  mintBright: "#22d99a",
  mintHover: "#14a877",
  mintGlow: "rgba(24, 196, 140, 0.15)",
  mintGlowStrong: "rgba(24, 196, 140, 0.25)",
  
  // Status colors
  success: "#22c55e",
  danger: "#ef4444",
  sell: "#ef4444",
  warning: "#f59e0b",
};

// Platform updates data
const PLATFORM_UPDATES = [
  {
    id: "update-1",
    title: "Enhanced Real-Time Data",
    description:
      "Experience lightning-fast updates with our improved WebSocket infrastructure for live token tracking.",
    badge: "New Feature",
    badgeColor:
      "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    image: "/interstate/logo.png",
  },
  {
    id: "update-2",
    title: "Multi-Chain Support",
    description:
      "Track tokens across Solana, BNB Chain, and more. Switch between chains seamlessly with our updated interface.",
    badge: "Coming Soon",
    badgeColor: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  },
  {
    id: "update-3",
    title: "Advanced Filtering",
    description:
      "Find the perfect opportunities with our new advanced filtering options. Sort by liquidity, volume, and more.",
    badge: "Improved",
    badgeColor: "bg-purple-500/20 text-purple-400 border border-purple-500/30",
    actionText: "Learn more about filtering",
    actionLink: "https://discord.gg/sACYQmCsTJ",
  },
];

// Default-on feature flag (matches repo convention, e.g. NEXT_PUBLIC_ARENA_WSS_ENABLED):
// perps nav is visible unless explicitly disabled via env. Lets us kill the surface
// without a redeploy if a mainnet issue surfaces.
const PERPS_ENABLED = process.env.NEXT_PUBLIC_PERPS_ENABLED !== "false";

const navLinks = [
  { name: "Trenches", href: "/pulse" },
  { name: "Trending", href: "/discover" },
  { name: "Trackers", href: "/trackers" },
  { name: "Predictions", href: "/predictions" },
  { name: "Airdrop", href: "/airdrop-genesis" },
  // ...(PERPS_ENABLED ? [{ name: "Perpetuals", href: "/perpetuals" }] : []),
  { name: "Portfolio", href: "/portfolio" },
  { name: "Agent", href: "/agent" },
  // { name: "Yield", href: "/construction" },
];

interface HeaderProps {
  search?: string;
  setSearch?: (val: string) => void;
  showSearch?: boolean;
  selectedTimeframe?: Timeframe;
  /** Controls whether the header sticks to the top or scrolls away */
  isSticky?: boolean;
}

const DepositModal = dynamic(() => import("./DepositModal"), {
  ssr: false, // NO SSR PLEASE
});

const WithdrawModal = dynamic(() => import("./WithdrawModal"), {
  ssr: false,
});

const PolygonWithdrawModal = dynamic(
  () => import("./predictions/PolygonWithdrawModal"),
  { ssr: false },
);
const PolygonSwapModal = dynamic(
  () => import("./predictions/PolygonSwapModal"),
  { ssr: false },
);

const WatchlistModal = dynamic(() => import("./WatchlistModal"), {
  ssr: false,
});

// Helper function to format very small prices with subscript notation
// For prices < 0.01, displays as $0.0₅77 format (subscript indicates number of zeros)
function formatSmallPrice(price: number): string {
  if (price === 0 || !Number.isFinite(price)) return "0";

  const absPrice = Math.abs(price);

  // For very small prices (< 0.01), use $0.0₅77 format
  if (absPrice > 0 && absPrice < 0.01) {
    // Convert to string to count zeros after decimal
    const priceStr = absPrice.toFixed(20); // Use enough precision
    const decimalIndex = priceStr.indexOf(".");

    if (decimalIndex !== -1) {
      // Find first non-zero digit after decimal
      let zeroCount = 0;
      let significantDigits = "";

      for (let i = decimalIndex + 1; i < priceStr.length; i++) {
        if (priceStr[i] === "0") {
          zeroCount++;
        } else {
          // Found first significant digit, get next 2-3 digits
          significantDigits = priceStr.substring(
            i,
            Math.min(i + 3, priceStr.length),
          );
          break;
        }
      }

      // Convert zero count to subscript
      const subscriptMap: Record<string, string> = {
        "0": "₀",
        "1": "₁",
        "2": "₂",
        "3": "₃",
        "4": "₄",
        "5": "₅",
        "6": "₆",
        "7": "₇",
        "8": "₈",
        "9": "₉",
      };

      const zeroCountStr = zeroCount.toString();
      const subscriptZeros = zeroCountStr
        .split("")
        .map((char) => subscriptMap[char] || char)
        .join("");

      // Format: $0.0₅77 (where subscript is number of zeros)
      return `0.0${subscriptZeros}${significantDigits}`;
    }
  }

  // For other prices, use formatSmartNumber
  return formatSmartNumber(price);
}

// Helper function to normalize price and price change for watchlist tokens
// Handles both Birdeye tokens (from trending) and Monad tokens (from pulse endpoints)
// Uses same coalesceNumber pattern as TradeHeader for consistency
function getWatchlistTokenPriceAndChange(token: Token): {
  price: number;
  priceChange: number;
} {
  const tokenData = token as any;

  // Coalesce function similar to TradeHeader - checks multiple fields and returns first valid number
  const coalesceNumber = (...values: any[]): number | null => {
    for (const v of values) {
      if (v === undefined || v === null) continue;
      const n = typeof v === "string" ? parseFloat(v) : v;
      if (Number.isFinite(n)) return n as number; // Return any finite number (including 0)
    }
    return null;
  };

  // Price mapping - check multiple field names
  // Priority: price_usd (Monad pulse endpoints), then usd_price (Birdeye/common), then others
  // Note: displayToken from trade page sets both usd_price and price_usd to the same value
  let price =
    coalesceNumber(
      tokenData.price_usd, // Monad pulse endpoints (primary)
      tokenData.usd_price, // displayToken format / Birdeye (secondary)
      tokenData.chart_live_price_usd, // from TradeHeader hydration
      tokenData.lastPriceUsd,
      tokenData.price, // Generic fallback
      tokenData.priceUSD, // Alternative format
      tokenData.priceUsd, // Alternative format
      tokenData.current_price, // Some APIs use this
      tokenData.currentPrice, // Alternative
    ) ?? 0;
  // Legacy fallback to avoid regressions (keeps previous behavior if new fields are missing)
  if (price === 0) {
    price =
      Number(
        tokenData?.usd_price ?? tokenData?.price ?? tokenData?.price_usd ?? 0,
      ) || 0;
  }

  // Price change mapping - prioritize percentage fields, handle both Birdeye and Monad formats
  // Birdeye format: price24hChangePercent (already percentage)
  // Monad pulse format: price_percent_change_1h, price_change_1h (may need conversion)
  const normalizePercent = (value: any): number | null => {
    if (value === undefined || value === null) return null;
    const num = typeof value === "string" ? parseFloat(value) : Number(value);
    return Number.isFinite(num) ? num : null;
  };

  // Try 1h change first (most relevant for watchlist ticker), then 24h
  // Use coalesceNumber pattern to get first non-null value
  let priceChange =
    coalesceNumber(
      normalizePercent(tokenData.price_percent_change_1h),
      normalizePercent(tokenData.price_change_1h),
      normalizePercent(tokenData.price_change),
      normalizePercent(tokenData.priceChange1h),
      normalizePercent(tokenData.price_percent_change_24h),
      normalizePercent(tokenData.price_change_24h),
      normalizePercent(tokenData.priceChange24h),
      normalizePercent(tokenData.price24hChangePercent), // Birdeye format (already percentage)
      normalizePercent(tokenData.price_change_1h_percent),
      normalizePercent(tokenData.price_change_24h_percent),
    ) ?? 0;
  if (priceChange === 0) {
    priceChange =
      Number(
        tokenData?.price_percent_change_1h ??
          tokenData?.price_change_1h ??
          tokenData?.price24hChangePercent ??
          0,
      ) || 0;
  }

  return { price, priceChange };
}

export default function Header({
  search = "",
  setSearch,
  showSearch = true,
  selectedTimeframe = "1h",
  isSticky = true,
}: HeaderProps) {
  const [headerBarVisible, setHeaderBarVisible] = useState(true);

  // Check for header bar visibility on mount and when body class changes
  useEffect(() => {
    const checkVisibility = () => {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("header-bar-visible");
        const visible = saved !== "false";
        setHeaderBarVisible(visible);
      }
    };

    checkVisibility();

    // Listen for storage changes (in case changed in another tab/window)
    window.addEventListener("storage", checkVisibility);

    // Also check body class
    const observer = new MutationObserver(checkVisibility);
    if (document.body) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    return () => {
      window.removeEventListener("storage", checkVisibility);
      observer.disconnect();
    };
  }, []);
  const router = useRouter();
  const isDiscover = router.pathname === "/";
  // Track if we should show Polygon prediction balance
  // On /predictions pages: always. On /portfolio: only when the Predictions tab is active.
  const [portfolioPredictionsActive, setPortfolioPredictionsActive] =
    useState(false);
  useEffect(() => {
    const handleSectionChange = (e: Event) => {
      const section = (e as CustomEvent).detail?.section;
      setPortfolioPredictionsActive(section === "predictions");
    };
    window.addEventListener("portfolio-section-change", handleSectionChange);
    // Reset when navigating away from portfolio
    if (router.pathname !== "/portfolio") setPortfolioPredictionsActive(false);
    return () =>
      window.removeEventListener(
        "portfolio-section-change",
        handleSectionChange,
      );
  }, [router.pathname]);

  const isPredictionsPage =
    router.pathname.startsWith("/predictions") ||
    (router.pathname === "/portfolio" && portfolioPredictionsActive);
  const {
    user,
    loading: userLoading,
    solBalance,
    refreshBalance,
    primaryWalletAddresses,
    chainBalances,
    walletList,
    walletBalances,
    selectedWalletIds,
    logout,
  } = useUser();

  // v2.0: Arena credits summary for inline display in the balance pill.
  // Falls back silently if backend endpoint is unavailable.
  const { data: creditsSummary } = useCreditsSummary();

  // Get referral stats for Honors badge display
  // Cache honorsLevel in localStorage to prevent badge flicker on page load
  const { data: referralStats } = useReferralStats();
  const honorsLevel = useMemo(() => {
    const live = referralStats?.honorsLevel;
    if (live) {
      try {
        localStorage.setItem("__honors_lvl", String(live));
      } catch {}
      return live;
    }
    // Use cached value while API is loading to avoid flicker (default 1 → real level)
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("__honors_lvl");
        if (cached) return Number(cached);
      } catch {}
    }
    return 1;
  }, [referralStats?.honorsLevel]);

  // Get chain from URL first, then localStorage, then default to solana
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
  const { solPrice, monPrice } = useSolPrice();
  const chainPrice = currentChain === "monad" ? monPrice : solPrice;
  const { watchlist, isHydrated, removeFromWatchlist, refreshWatchlistToken } =
    useWatchlist();
  const { presets, activePreset } = useQuickBuy();

  // Watchlist ticker paging (max 8 tokens visible)
  const WATCHLIST_TICKER_PAGE_SIZE = 8;
  const [watchlistTickerPage, setWatchlistTickerPage] = useState(0);

  // Stable ref prevents the ticker from flashing empty during transient re-renders
  // Initialized from module-level array for cross-mount persistence
  const stableEnrichedWatchlistRef = useRef<Token[]>(_stableEnrichedWatchlist);

  // Enrich watchlist tokens with cached pulse token data when price is missing
  // Lazy-init from localStorage to avoid flicker on page navigation (no useEffect delay)
  const [cachedPulseTokens, setCachedPulseTokens] = useState<Token[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const cached = localStorage.getItem("cached_pulse_tokens");
      if (cached) {
        const parsed = JSON.parse(cached);
        const now = Date.now();
        if (now < parsed.expiresAt) {
          return parsed.data || [];
        }
      }
    } catch (error) {
      // Ignore errors
    }
    return [];
  });
  const pendingQuickBuyToastRef = useRef<{
    id: string;
    tokenImage: string | null;
    tokenName: string;
    fakeTime: string;
    startTime: number;
    timerInterval?: NodeJS.Timeout;
  } | null>(null);

  const isMonadToken = (token: any) =>
    typeof token?.mint === "string" && token.mint.startsWith("0x");

  // Helper function to enrich a token with cached pulse data
  const enrichTokenWithCachedData = useCallback(
    (token: Token): Token => {
      const tokenAddress = token.pair_address || (token as any).mint || "";
      if (!tokenAddress || cachedPulseTokens.length === 0) return token;

      // Check if price is missing or 0
      const currentPrice =
        (token as any).price_usd ||
        (token as any).usd_price ||
        (token as any).price ||
        0;
      if (currentPrice > 0) return token; // Already has price, no need to enrich

      // Find matching token in cached pulse tokens
      const cachedToken = cachedPulseTokens.find((t) => {
        const cachedAddr = t.pair_address || (t as any).mint || "";
        return (
          cachedAddr === tokenAddress ||
          (cachedAddr &&
            tokenAddress &&
            cachedAddr.toLowerCase() === tokenAddress.toLowerCase())
        );
      });

      if (cachedToken) {
        // Only enrich price/change from cache — never overwrite MC or other live fields
        return {
          ...token,
          price_usd:
            (token as any).price_usd ||
            (cachedToken as any).price_usd ||
            (cachedToken as any).usd_price ||
            0,
          usd_price:
            (token as any).usd_price ||
            (cachedToken as any).usd_price ||
            (cachedToken as any).price_usd ||
            0,
          price_percent_change_1h:
            (token as any).price_percent_change_1h ??
            (cachedToken as any).price_percent_change_1h ??
            (cachedToken as any).price_change_1h ??
            0,
          price_change_1h:
            (token as any).price_change_1h ??
            (cachedToken as any).price_change_1h ??
            (cachedToken as any).price_percent_change_1h ??
            0,
        } as Token;
      }

      return token;
    },
    [cachedPulseTokens],
  );

  // Track which tokens we've already tried to refresh to avoid duplicate API calls
  const refreshedTokensRef = useRef<Set<string>>(new Set());

  // Refresh Monad tokens in watchlist that still lack price/change by hitting token service
  // Only refresh tokens that haven't been refreshed yet and don't have price data
  useEffect(() => {
    // Skip if we've already processed all tokens
    const tokensToRefresh = watchlist.filter((token) => {
      if (!isMonadToken(token)) return false;
      const { price } = getWatchlistTokenPriceAndChange(token);
      if (price && price > 0) return false; // Already has price
      const key = (token as any).mint || token.pair_address || "";
      if (!key) return false;
      if (refreshedTokensRef.current.has(key)) return false; // Already tried to refresh
      return true;
    });

    if (tokensToRefresh.length === 0) return;

    // Refresh tokens one at a time with a small delay to avoid overwhelming the API
    (async () => {
      for (const token of tokensToRefresh) {
        const key = (token as any).mint || token.pair_address || "";
        if (!key) continue;

        // Mark as attempted before making the call
        refreshedTokensRef.current.add(key);

        try {
          await refreshWatchlistToken(key);
          // Small delay between calls to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          // If refresh fails, remove from set so we can retry later
          refreshedTokensRef.current.delete(key);
        }
      }
    })();
  }, [watchlist, refreshWatchlistToken]);

  // Memoize enriched watchlist to avoid recalculating on every render
  // Deduplicate by address AND name — never filter by image status (show fallback icon instead)
  const enrichedWatchlist = useMemo(() => {
    const enriched = watchlist.map(enrichTokenWithCachedData);
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    const filtered = enriched.filter((token) => {
      const tokenId = token.pair_address || (token as any).mint || "";
      if (!tokenId || seenIds.has(tokenId)) return false;

      // Deduplicate by symbol/name — no two tokens with the same display name
      const displayName = (token.symbol || token.name || "")
        .toLowerCase()
        .trim();
      if (!displayName || seenNames.has(displayName)) return false;

      seenIds.add(tokenId);
      seenNames.add(displayName);
      return true;
    });

    // Stability: keep last non-empty list to prevent flashing during page transitions
    if (watchlist.length === 0) {
      stableEnrichedWatchlistRef.current = [];
      _stableEnrichedWatchlist.length = 0;
      return [];
    }
    if (filtered.length > 0) {
      stableEnrichedWatchlistRef.current = filtered;
      _stableEnrichedWatchlist.length = 0;
      _stableEnrichedWatchlist.push(...filtered);
    }
    return stableEnrichedWatchlistRef.current;
  }, [watchlist, enrichTokenWithCachedData]);

  const watchlistTickerTotalPages = Math.max(
    1,
    Math.ceil(enrichedWatchlist.length / WATCHLIST_TICKER_PAGE_SIZE),
  );
  const watchlistTickerCanPrev = watchlistTickerPage > 0;
  const watchlistTickerCanNext =
    watchlistTickerPage < watchlistTickerTotalPages - 1;

  const watchlistTickerVisible = enrichedWatchlist.slice(
    watchlistTickerPage * WATCHLIST_TICKER_PAGE_SIZE,
    watchlistTickerPage * WATCHLIST_TICKER_PAGE_SIZE +
      WATCHLIST_TICKER_PAGE_SIZE,
  );

  // Clamp ticker page when watchlist size changes
  useEffect(() => {
    setWatchlistTickerPage((p) =>
      Math.min(p, Math.max(0, watchlistTickerTotalPages - 1)),
    );
  }, [watchlistTickerTotalPages]);

  // Load quickBuyAmount from localStorage
  const getQuickBuyAmount = (): number => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("quickBuyAmount");
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 0) {
          return parsed;
        }
      }
    }
    return 0.01;
  };
  const [quickBuyAmount, setQuickBuyAmount] = useState(getQuickBuyAmount);

  // Keep quickBuyAmount in sync with localStorage changes
  useEffect(() => {
    const handleStorageChange = () => {
      setQuickBuyAmount(getQuickBuyAmount());
    };
    window.addEventListener("storage", handleStorageChange);
    // Also check periodically for same-window localStorage updates
    const interval = setInterval(handleStorageChange, 1000);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  const [hoveredWatchlistToken, setHoveredWatchlistToken] = useState<
    string | null
  >(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositInitialTab, setDepositInitialTab] = useState<
    "convert" | "deposit" | "buy" | "withdraw"
  >("deposit");
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const { isOpen: searchModalOpen, openSearch, closeSearch } = useSearch();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [showUpdatesModal, setShowUpdatesModal] = useState(false);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownPosition, setProfileDropdownPosition] = useState<{
    top: number;
    right: number;
  } | null>(null);

  const navScrollRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  // Manual balance refresh handler
  const handleManualBalanceRefresh = async (e?: React.MouseEvent) => {
    e?.stopPropagation(); // Prevent dropdown toggle
    if (isRefreshingBalance || polygonBalanceLoading) return;

    setIsRefreshingBalance(true);
    try {
      // If on predictions page, refresh Polygon balance
      if (isPredictionsPage && user?.bearerToken) {
        setPolygonBalanceLoading(true);
        const response = await getPolymarketBalance(user.bearerToken, false);
        if (response.success && response.data) {
          setPolygonBalance(response.data);
        }
        setPolygonBalanceLoading(false);
      } else {
        await refreshBalance({ chain: currentChain, force: true });
      }
    } catch (error) {
      console.error("Failed to refresh balance:", error);
      setPolygonBalanceLoading(false);
    } finally {
      setIsRefreshingBalance(false);
    }
  };

  // State for clipboard token detection
  const [clipboardToken, setClipboardToken] = useState<{
    address: string;
    imageUrl: string | null;
    name: string;
    isPumpToken: boolean;
    tokenData: Token | null;
  } | null>(null);
  const lastCheckedClipboard = useRef<string>("");
  const clipboardRequestIdRef = useRef(0);

  const chainSymbols: Record<string, string> = {
    sol: "SOL",
    monad: "MON",
    eth: "ETH",
    bnb: "BNB",
    base: "BASE",
  };

  const chainLogos: Record<string, string> = {
    sol: "/solana.png",
    monad:
      "https://i0.wp.com/www.gizmotimes.com/wp-content/uploads/2023/10/Monad-Logo.png?fit=1920%2C1080&ssl=1",
    eth: "/solana.png", // Fallback to Solana for now
    bnb: "/solana.png", // Fallback to Solana for now
    base: "/solana.png", // Fallback to Solana for now
  };

  // Use chainBalances from UserContext as the single source of truth
  // Derive chainBalance from chainBalances instead of maintaining separate state
  const chainBalance =
    chainBalances[currentChain] ?? (currentChain === "sol" ? solBalance : 0);

  // Polygon balance state for predictions pages
  const [polygonBalance, setPolygonBalance] =
    useState<PolymarketBalance | null>(null);
  const [polygonBalanceLoading, setPolygonBalanceLoading] = useState(false);
  const [polygonAddressCopied, setPolygonAddressCopied] = useState(false);
  const [polygonConverting, setPolygonConverting] = useState(false);
  const [polygonConvertSuccess, setPolygonConvertSuccess] = useState(false);
  const [showPolygonQR, setShowPolygonQR] = useState(false);
  const [showPolygonWithdraw, setShowPolygonWithdraw] = useState(false);
  const [showPolygonSwap, setShowPolygonSwap] = useState(false);

  // Copy Polygon address handler
  const handleCopyPolygonAddress = useCallback(() => {
    const address = primaryWalletAddresses?.ethereum;
    if (address) {
      navigator.clipboard.writeText(address);
      setPolygonAddressCopied(true);
      toast.success("Address copied successfully", {
        icon: <BiCheck className="h-5 w-5 text-emerald-400" />,
        style: {
          background: "#1a1b1f",
          color: "#f0f5f5",
          border: "1px solid #8247E5",
        },
      });
      setTimeout(() => setPolygonAddressCopied(false), 2000);
    }
  }, [primaryWalletAddresses?.ethereum]);

  // Convert USDC to USDC.e handler
  const handleConvertUsdcToUsdce = useCallback(async () => {
    if (!user?.bearerToken || polygonConverting) return;

    setPolygonConverting(true);
    try {
      const response = await autoConvertUsdcToUsdce(user.bearerToken);
      if (response.success && response.data.converted) {
        setPolygonConvertSuccess(true);
        // Update balance from response
        if (response.data.balances) {
          setPolygonBalance(response.data.balances);
        }
        setTimeout(() => setPolygonConvertSuccess(false), 3000);
      }
    } catch (err) {
      console.error("[Header] Error converting USDC:", err);
    } finally {
      setPolygonConverting(false);
    }
  }, [user?.bearerToken, polygonConverting]);

  // Fetch Polygon balance when on predictions page
  useEffect(() => {
    if (!isPredictionsPage || !user?.bearerToken) {
      setPolygonBalance(null);
      return;
    }

    const fetchPolygonBalance = async () => {
      setPolygonBalanceLoading(true);
      try {
        const response = await getPolymarketBalance(user.bearerToken!, false); // Don't auto-convert from header
        if (response.success && response.data) {
          setPolygonBalance(response.data);
          // Broadcast balance data so predictions page components can use it instantly
          // instead of waiting for their own separate API call
          window.dispatchEvent(
            new CustomEvent("polygon-balance-data", { detail: response.data }),
          );
        }
      } catch (err) {
        console.error("[Header] Error fetching Polygon balance:", err);
      } finally {
        setPolygonBalanceLoading(false);
      }
    };

    fetchPolygonBalance();

    // Refresh every 30 seconds when on predictions page
    const interval = setInterval(fetchPolygonBalance, 30000);

    // Listen for custom event to refresh balance (e.g., after a trade)
    const handleBalanceRefresh = () => {
      isDev && console.log("[Header] Received polygon-balance-refresh event");
      fetchPolygonBalance();
    };
    window.addEventListener("polygon-balance-refresh", handleBalanceRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener(
        "polygon-balance-refresh",
        handleBalanceRefresh,
      );
    };
  }, [isPredictionsPage, user?.bearerToken]);

  const chainAwareHref = useCallback(
    (href: string) => {
      // Perpetuals run on Hyperliquid — chain-agnostic, so a ?chain=sol
      // param there is meaningless and confusing. Don't propagate it.
      if (href.startsWith("/perpetuals")) {
        return { pathname: href };
      }
      return {
        pathname: href,
        query: { chain: currentChain },
      };
    },
    [currentChain],
  );
  const formatBalance = (value: number, digits = 3) => {
    if (value === 0) return "0";
    const fixed = value.toFixed(digits);
    return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  };
  const formatMultiDigitBalance = (value: number) =>
    Math.abs(value) >= 100
      ? value.toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })
      : formatBalance(value);
  const formatCurrency = (value: number) =>
    value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  // Refresh balance when primary wallet changes - no polling here
  // UserContext handles periodic polling (30s), Header just triggers on wallet change
  useEffect(() => {
    const address =
      currentChain === "sol"
        ? primaryWalletAddresses.solana || user?.publicKey || null
        : primaryWalletAddresses.ethereum || null;

    if (!address) {
      return;
    }

    // Only refresh when primary wallet address changes (force refresh to bypass cooldown)
    // This ensures Header updates instantly when primary wallet is changed
    // No polling needed - UserContext handles that at 30s intervals
    refreshBalance({ chain: currentChain, address, force: true });
  }, [
    currentChain,
    primaryWalletAddresses.solana,
    primaryWalletAddresses.ethereum,
    user?.publicKey,
    refreshBalance,
  ]);

  const processClipboardValue = useCallback(async (rawValue: string) => {
    const trimmed = (rawValue || "").trim();
    if (!trimmed) return;

    if (lastCheckedClipboard.current === trimmed) return;

    const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed);
    if (!isSolanaAddress) {
      setClipboardToken(null);
      lastCheckedClipboard.current = trimmed;
      return;
    }

    const myRequestId = ++clipboardRequestIdRef.current;

    try {
      // First try to resolve mint address to pair address
      let pairAddress = trimmed;
      try {
        const hydrateResponse = await fetch("/api/token-service/hydrate-pair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mint: trimmed }),
        });
        if (clipboardRequestIdRef.current !== myRequestId) return;
        if (hydrateResponse.ok) {
          const hydrateData = await hydrateResponse.json();
          if (clipboardRequestIdRef.current !== myRequestId) return;
          if (hydrateData.pair_address) {
            pairAddress = hydrateData.pair_address;
          }
        }
      } catch {
        if (clipboardRequestIdRef.current !== myRequestId) return;
        // If hydration fails, use the original address as pair_address
      }

      // Use Go service search to look up token metadata
      const goUrl = process.env.NEXT_PUBLIC_GO_SERVICE_URL;
      const response = await fetch(
        `${goUrl}/v1/search?phrase=${encodeURIComponent(trimmed)}&limit=1`,
      );
      if (clipboardRequestIdRef.current !== myRequestId) return;
      if (!response.ok) {
        return;
      }

      const searchData = await response.json();
      if (clipboardRequestIdRef.current !== myRequestId) return;
      const results =
        searchData?.tokens ||
        searchData?.results ||
        searchData?.filterTokens?.results ||
        [];
      const token = results[0]?.token || results[0] || null;

      if (!token) {
        return;
      }

      const imageUrl = await resolveTokenImage(token);
      if (clipboardRequestIdRef.current !== myRequestId) return;

      const launchpadProtocol = (
        token.launchpad_protocol ||
        token.launchpadProtocol ||
        token.protocol ||
        ""
      ).toLowerCase();
      const isPumpToken =
        launchpadProtocol.includes("pump.fun") ||
        launchpadProtocol.includes("pumpfun") ||
        launchpadProtocol === "pump";

      const tokenName =
        (typeof token.name === "string" && token.name.trim()) ||
        (typeof token.metadata?.name === "string" &&
          token.metadata.name.trim()) ||
        (typeof token.symbol === "string" && token.symbol.trim()) ||
        (typeof token.metadata?.symbol === "string" &&
          token.metadata.symbol.trim()) ||
        (typeof token.ticker === "string" && token.ticker.trim()) ||
        null;

      const enrichedToken = {
        ...token,
        mint: token.mint || trimmed,
        pair_address: pairAddress || token.pair_address || "",
        name: tokenName || token.name || "Unknown Token",
        symbol: token.symbol || token.ticker || tokenName || "",
        launchpad_protocol:
          token.launchpad_protocol || token.launchpadProtocol || "",
      } as Token;

      lastCheckedClipboard.current = trimmed;
      setClipboardToken({
        address: trimmed,
        imageUrl: imageUrl || null,
        name: tokenName || "Unknown Token",
        isPumpToken,
        tokenData: enrichedToken,
      });
    } catch (error) {
      console.error("Error fetching token data:", error);
      // Don't setClipboardToken(null) — leave previous pill intact on transient errors
      // Don't set lastCheckedClipboard — allow retry on next check
    }
  }, []);

  // Check clipboard for valid token address
  const checkClipboard = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.readText)
      return;
    try {
      const text = await navigator.clipboard.readText();
      await processClipboardValue(text);
    } catch (error) {
      // Clipboard access denied or error - silently fail
    }
  }, [processClipboardValue]);

  const CLIPBOARD_POLL_INTERVAL = 800; // ms

  // Periodically check clipboard
  useEffect(() => {
    const interval = setInterval(() => {
      checkClipboard();
    }, CLIPBOARD_POLL_INTERVAL);

    // Also check on mount
    checkClipboard();

    return () => clearInterval(interval);
  }, [checkClipboard]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleCopy = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData("text/plain");
      if (text) {
        processClipboardValue(text);
      }
    };

    // Paste event: user presses Ctrl+V / Cmd+V — works in production without clipboard permission
    const handlePaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData("text/plain");
      if (text) {
        processClipboardValue(text);
      }
    };

    // On first user click, request clipboard-read permission so auto-polling works afterward
    const handleFirstClick = () => {
      if (navigator.clipboard?.readText) {
        navigator.clipboard
          .readText()
          .then((text) => {
            if (text) processClipboardValue(text);
          })
          .catch(() => {});
      }
      document.removeEventListener("click", handleFirstClick);
    };

    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("click", handleFirstClick, { once: true });
    return () => {
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("click", handleFirstClick);
    };
  }, [processClipboardValue]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined")
      return;

    const handleFocus = () => {
      checkClipboard();
    };

    const handleVisibility = () => {
      if (!document.hidden) {
        checkClipboard();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [checkClipboard]);

  // Handler for Paste CA button - navigate to token
  const handlePasteCA = async () => {
    if (clipboardToken) {
      // Detect if Monad (0x) or Solana address
      const isMonadAddress =
        clipboardToken.address.startsWith("0x") ||
        clipboardToken.address.startsWith("0X");
      const td = clipboardToken.tokenData;

      // Preload chart data (OHLC, WS, image, route) before navigation
      if (td) {
        preloadTradeChart(
          {
            mint: (td as any)?.mint || clipboardToken.address,
            pairAddress: td.pair_address,
            chain: isMonadAddress ? "monad" : "sol",
            name: td.name,
            symbol: td.symbol,
            marketCapUsd: td.market_cap_usd,
            image:
              clipboardToken.imageUrl || extractTokenImage(td as any) || "",
            launchpadProtocol: (td as any)?.launchpad_protocol,
          },
          { router },
        );
      }

      if (isMonadAddress) {
        const queryParams = new URLSearchParams();
        if (td?.name) queryParams.set("_name", td.name);
        if (td?.symbol) queryParams.set("_symbol", td.symbol);
        if (td?.market_cap_usd)
          queryParams.set("_mcap", String(td.market_cap_usd));
        if (clipboardToken.imageUrl)
          queryParams.set("_image", clipboardToken.imageUrl);
        queryParams.set("_mint", clipboardToken.address);
        if ((td as any)?.launchpad_protocol)
          queryParams.set(
            "_launchpad_protocol",
            (td as any).launchpad_protocol,
          );
        if (td?.total_liquidity_usd)
          queryParams.set("_liquidity", String(td.total_liquidity_usd));
        queryParams.set("chain", "monad");
        router.push(
          `/trade/monad/${clipboardToken.address}?${queryParams.toString()}`,
        );
      } else {
        const pathAddress =
          (td as any)?.mint || td?.pair_address || clipboardToken.address;
        router.push(`/trade/${pathAddress}`);
      }
    } else {
      // Fallback: try to read clipboard if no token detected
      try {
        const text = await navigator.clipboard.readText();
        const trimmed = text.trim();
        const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed);

        if (isSolanaAddress) {
          router.push(`/trade/${trimmed}`);
        } else {
          toast.error("Invalid token address in clipboard", {
            duration: 3000,
            style: {
              background: "#1E1F26",
              color: "#E6E7EA",
              border: "1px solid #ff6b6b",
            },
          });
        }
      } catch (error) {
        console.error("Clipboard read error:", error);
        toast.error("Failed to read clipboard. Please grant permission.", {
          duration: 3000,
          style: {
            background: "#1E1F26",
            color: "#E6E7EA",
            border: "1px solid #ff6b6b",
          },
        });
      }
    }
  };

  // Helper function to get Monad launchpad from token
  const getMonadLaunchpad = (
    token: Token,
  ): "nadfun" | "flapsh-simple" | "flapsh-devs" => {
    const protocol = (token as any)?.launchpad_protocol?.toLowerCase() || "";

    if (protocol.includes("nad.fun") || protocol.includes("nadfun")) {
      return "nadfun";
    } else if (protocol.includes("flap.sh") || protocol.includes("flapsh")) {
      if (protocol.includes("dev")) {
        return "flapsh-devs";
      }
      return "flapsh-simple";
    }

    return "nadfun";
  };

  // Handler for watchlist ticker quick buy
  const handleWatchlistQuickBuy = async (token: Token) => {
    isDev &&
      console.log(
        "Clipboard/Watchlist Quick Buy:",
        token.symbol,
        (token as any).mint,
        "amount:",
        quickBuyAmount,
      );
    // Validation checks with user feedback
    if (!user?.bearerToken || !user?.id) {
      toast.error("Please log in to trade", {
        duration: 3000,
        style: {
          background: "#1E1F26",
          color: "#E6E7EA",
          border: "1px solid #ff6b6b",
        },
      });
      return;
    }

    if (!quickBuyAmount || quickBuyAmount <= 0) {
      const currency = currentChain === "monad" ? "MON" : "SOL";
      toast.error(`Set a buy amount first (use the preset buttons)`, {
        duration: 3000,
        style: {
          background: "#1E1F26",
          color: "#E6E7EA",
          border: "1px solid #ff6b6b",
        },
      });
      return;
    }

    // For Monad chain, use Monad-specific quick buy logic (same as MonadTable)
    if (currentChain === "monad") {
      if (!token.mint) {
        toast.error("Invalid token - missing mint address", {
          duration: 3000,
          style: {
            background: "#1E1F26",
            color: "#E6E7EA",
            border: "1px solid #ff6b6b",
          },
        });
        return;
      }

      const preset = presets[activePreset];
      const settings = (preset?.quickBuySettings || {}) as any;
      const launchpad = getMonadLaunchpad(token);
      const tokenAddress = token.mint;
      const slippage = settings?.maxSlippage ? settings.maxSlippage * 100 : 15;
      const gasPrice =
        settings?.gasPrice !== undefined && settings.gasPrice > 0
          ? settings.gasPrice
          : undefined;

      // Get token image and name
      const tokenImage = token ? extractTokenImage(token as any) : null;
      const tokenName = token?.name || token?.symbol || "";

      const toastId = toast.loading("Placing trade...", { duration: Infinity });

      try {
        notifyTradePending({ tokenAddress, tradeType: "buy", chain: "monad" });
        const { results, totalConsidered } = await executeMonadMultiBuy({
          tokenAddress,
          amountMON: quickBuyAmount,
          launchpad,
          slippage,
          gasPrice,
          authToken: user.bearerToken,
          walletList,
          walletBalances,
          selectedWalletIds: selectedWalletIds?.monad || [],
        });

        const txHashes = results
          .map((r) => (r.result as any)?.txHash)
          .filter(Boolean);
        const summary = formatMonadTxSummary(txHashes, totalConsidered);

        if (txHashes.length > 0) {
          setTimeout(() => {
            refreshBalance({ chain: "monad", force: true }).catch((err) => {
              console.warn("Failed to refresh balance:", err);
            });
          }, 1000);
          broadcastMonadQuickTrade(tokenAddress, "buy");
          toast.success(summary.message, { id: toastId, duration: 6000 });
          return { success: true, txHash: txHashes[0] };
        }
        toast.error("Trade failed", { id: toastId, duration: 6000 });
        return { success: false, error: "Trade failed" };
      } catch (error: any) {
        console.error("❌ Header Watchlist Quick Buy failed:", error);
        const errorMessage = formatMonadError(error?.message || error?.error);
        toast.error(errorMessage, { id: toastId, duration: 6000 });
        return { success: false, error: errorMessage };
      }
    }

    // For Solana chain — same path as PulseTable handleQuickBuy
    const preset = presets[activePreset];
    if (!preset) {
      toast.error(
        "Quick buy preset not configured. Update your settings in the footer.",
        {
          duration: 3000,
          style: {
            background: "#1E1F26",
            color: "#E6E7EA",
            border: "1px solid #ff6b6b",
          },
        },
      );
      return;
    }
    const settings = preset.quickBuySettings;
    const poolType = getPoolTypeFromToken(token);

    // Pre-calculate wallet allocations
    const { allocations, total } = buildSolanaWalletAllocations({
      amount: quickBuyAmount,
      walletList: walletList || [],
      walletBalances: walletBalances || {},
      selectedWalletIds: selectedWalletIds?.sol || [],
      priorityFee: settings.priority || 0.0001,
      bribe: settings.bribe || 0,
    });
    const walletsWithBalance = allocations.length;
    const isMultiWallet = walletsWithBalance > 1;

    // Pre-validate before showing toast
    const tokenMint = (token as any).mint || "";
    if (!tokenMint) {
      toast.error("Token mint address not found", {
        duration: 3000,
        style: {
          background: "#1E1F26",
          color: "#E6E7EA",
          border: "1px solid #ff6b6b",
        },
      });
      return;
    }
    const ataExists = await checkAtaExists(tokenMint, user?.publicKey).catch(
      () => null,
    );
    const validation = validateSolanaBuy(
      quickBuyAmount,
      allocations,
      walletBalances || {},
      walletList || [],
      selectedWalletIds?.sol || [],
      settings.priority,
      settings.bribe,
      ataExists,
    );
    if (!validation.valid) {
      showTradeValidationError(
        validation.error,
        getResolvedTokenImage(token),
        token.symbol || token.name || "Token",
      );
      return;
    }

    // Verify pair address
    let poolAddress =
      (token as any).migrated_pool_address || token.pair_address || "";
    if (tokenMint) {
      const verifiedPairAddress = await fetchVerifiedPairAddress(tokenMint);
      if (verifiedPairAddress) {
        poolAddress = verifiedPairAddress;
      }
    }

    // Animated toast with timer (same as PulseTable)
    const timerCap = 0.3 + Math.random() * 0.2;
    const uniqueToastId = `solana-quickbuy-${Date.now()}-${Math.random()}`;
    const startTime = Date.now();
    let timerFinished = false;
    let tradeErrored = false;

    const tokenImage = getResolvedTokenImage(token);
    const tokenName = token.symbol || token.name || "Token";

    toast(
      (t) => (
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

    // Start timer animation — keeps running after cap to enforce checkmark visibility
    const tick = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const displayTime = Math.min(elapsed, timerCap).toFixed(2);
      const timerEl = document.getElementById(`timer-${uniqueToastId}`);
      if (timerEl) {
        timerEl.textContent = `(${displayTime}s)`;
      }
      if (!timerFinished && elapsed >= timerCap) {
        timerFinished = true;
        if (!tradeErrored) {
          const checkEl = document.getElementById(`check-${uniqueToastId}`);
          if (checkEl) checkEl.style.display = "inline";
          const linkEl = document.getElementById(`link-${uniqueToastId}`);
          if (linkEl) {
            if (isMultiWallet) {
              linkEl.textContent = `${walletsWithBalance}/${total}`;
              linkEl.className =
                "text-xs text-blue-400 font-medium flex-shrink-0";
            } else {
              linkEl.innerHTML = `<img src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4" alt="Solana" class="w-4 h-4 rounded-full opacity-70" style="cursor: default;" />`;
              linkEl.className = "flex-shrink-0";
            }
          }
        }
      }
      // After timer cap: keep enforcing checkmark visibility against React re-renders
      if (timerFinished && !tradeErrored) {
        const checkEl = document.getElementById(`check-${uniqueToastId}`);
        if (!checkEl) return; // Toast dismissed — stop loop
        if (checkEl.style.display !== "inline")
          checkEl.style.display = "inline";
      }
      timerHandle = requestAnimationFrame(tick) as any;
    };
    let timerHandle = requestAnimationFrame(tick) as any;

    pendingSolanaQuickBuyToastRef.current = {
      id: uniqueToastId,
      tokenImage,
      tokenName,
      fakeTime: timerCap.toFixed(2),
      tokenAddress: tokenMint,
      startTime,
      timerHandle,
      totalSelectedWallets: walletsWithBalance,
    };

    const cleanupTradeListener = listenForTradeEvents(
      tokenMint,
      uniqueToastId,
      (v) => {
        tradeErrored = v;
      },
      "solana",
    );

    let __markId = "";

    try {
      const baseMint = tokenMint;
      const quoteMint = SOL_MINT_ADDRESS;

      __markId = insertOptimisticMarker({
        mint: baseMint,
        walletAddress:
          walletList?.find((w) => w.isPrimary)?.solanaAddress ??
          walletList?.[0]?.solanaAddress,
        side: "buy",
        amountSol: quickBuyAmount,
        priceUsd: token.usd_price,
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
        amountSOL: quickBuyAmount,
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
        imageUrl: (await resolveTokenImage(token)) || undefined,
        authToken: user.bearerToken,
        walletList: walletList || [],
        walletBalances: walletBalances || {},
        selectedWalletIds: selectedWalletIds?.sol || [],
        onTxHash: ({ txHash }) => {
          if (
            pendingSolanaQuickBuyToastRef.current?.id === uniqueToastId &&
            txHash
          ) {
            const linkEl = document.getElementById(`link-${uniqueToastId}`);
            if (linkEl) {
              const explorerUrl = `https://solscan.io/tx/${txHash}`;
              linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4" alt="Solana" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
              linkEl.className = "";
            }
            // Fire early so Portfolio refetches immediately when Solscan link appears
            broadcastTradeCompleted({
              tokenAddress: baseMint,
              tradeType: "buy",
              chain: "sol",
              txHash,
              tokenName: token.name,
              tokenSymbol: token.symbol,
              imageUrl: tokenImage,
              solAmountSpent: quickBuyAmount,
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
        if (linkEl) {
          const explorerUrl = `https://solscan.io/tx/${firstTxHash}`;
          linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4" alt="Solana" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
          linkEl.className = "";
        }
        if (timerHandle) cancelAnimationFrame(timerHandle);
        setTimeout(() => toast.dismiss(uniqueToastId), 10000);
      }

      isDev && console.log("Header Quick Buy successful");

      if (typeof window !== "undefined" && tokenMint) {
        window.dispatchEvent(
          new CustomEvent("solanaQuickTrade", {
            detail: { tokenAddress: tokenMint },
          }),
        );
      }
      dispatchBalanceRefresh("sol");
    } catch (error: any) {
      rollbackOptimisticMarker(__markId);
      tradeErrored = true;
      cleanupTradeListener();
      if (timerHandle) cancelAnimationFrame(timerHandle);

      console.error("❌ Header Quick Buy failed:", error);
      if (pendingSolanaQuickBuyToastRef.current) {
        transformToastToError(
          pendingSolanaQuickBuyToastRef.current.id,
          mapTradeErrorMessage(error),
          tokenImage,
          tokenName,
        );
        pendingSolanaQuickBuyToastRef.current = null;
      }
    }
  };

  // Clipboard quick buy state and handler
  const [isClipboardBuying, setIsClipboardBuying] = useState(false);
  const [clipboardAmountStr, setClipboardAmountStr] = useState(
    String(quickBuyAmount),
  );
  const clipboardInputFocusedRef = useRef(false);
  const [isEditingClipboardAmount, setIsEditingClipboardAmount] =
    useState(false);
  const pendingSolanaQuickBuyToastRef = useRef<{
    id: string;
    tokenImage: string | null;
    tokenName: string;
    fakeTime: string;
    tokenAddress: string;
    startTime: number;
    timerHandle?: number;
    totalSelectedWallets: number;
  } | null>(null);

  // Sync numeric quickBuyAmount → local display string (only when not focused)
  useEffect(() => {
    if (!clipboardInputFocusedRef.current) {
      setClipboardAmountStr(String(quickBuyAmount));
    }
  }, [quickBuyAmount]);

  const handleClipboardQuickBuy = async () => {
    if (isClipboardBuying || !clipboardToken?.tokenData) return;
    setIsClipboardBuying(true);
    try {
      await handleWatchlistQuickBuy(clipboardToken.tokenData);
    } catch (error) {
      console.error("❌ Clipboard Quick Buy failed:", error);
      toast.error(
        `Quick buy failed: ${(error as any)?.message || "Unknown error"}`,
        {
          duration: 4000,
          style: {
            background: "#1E1F26",
            color: "#E6E7EA",
            border: "1px solid #ff6b6b",
          },
        },
      );
    } finally {
      setIsClipboardBuying(false);
    }
  };

  // Toggle Search modal with Tab and '/' (outside of inputs)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!showSearch) return;
      const isPlain = !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey;

      // Close on Tab when open
      if (e.key === "Tab" && isPlain) {
        // If modal is open, close it immediately on Tab
        if (searchModalOpen) {
          e.preventDefault();
          closeSearch();
          return;
        }
        // Else, only open when focus isn't in an editable element
        const t = (document.activeElement as HTMLElement) || null;
        const isEditable =
          !!t &&
          (t.tagName === "INPUT" ||
            t.tagName === "TEXTAREA" ||
            t.tagName === "SELECT" ||
            (t as any).isContentEditable);
        if (isEditable) return; // allow normal tabbing in forms
        e.preventDefault();
      }

      // Toggle on '/' (slash). Some keyboards send '?' with Shift+'/'; we support both.
      if ((e.key === "/" || e.key === "?") && isPlain) {
        const t = (document.activeElement as HTMLElement) || null;
        const isEditable =
          !!t &&
          (t.tagName === "INPUT" ||
            t.tagName === "TEXTAREA" ||
            t.tagName === "SELECT" ||
            (t as any).isContentEditable);
        if (isEditable) return; // do not steal from inputs
        e.preventDefault();
        if (searchModalOpen) {
          closeSearch();
        } else {
          openSearch();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showSearch, searchModalOpen]);

  // Handles opening the deposit modal
  const handleDepositClick = (
    tab: "convert" | "deposit" | "buy" | "withdraw" = "deposit",
  ) => {
    const token = Cookies.get("token");
    if (token && !user && !userLoading) {
      // Optionally, refresh user here if needed
    }
    setDepositInitialTab(tab);
    setDepositOpen(true);
  };

  // Handles opening the convert tab
  const handleConvertClick = () => {
    handleDepositClick("convert");
  };

  // Handles opening the buy tab
  const handleBuyClick = () => {
    handleDepositClick("buy");
  };

  // Handles opening the withdraw modal (now opens deposit modal with withdraw tab)
  const handleWithdrawClick = () => {
    const token = Cookies.get("token");
    if (token && !user && !userLoading) {
      // Optionally, refresh user here if needed
    }
    handleDepositClick("withdraw");
  };

  // Check if navigation arrows should be shown
  const checkScrollArrows = useCallback(() => {
    const nav = navScrollRef.current;
    if (!nav) return;

    const hasOverflow = nav.scrollWidth > nav.clientWidth;
    const isAtStart = nav.scrollLeft <= 0;
    const isAtEnd = nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 1;

    setShowLeftArrow(hasOverflow && !isAtStart);
    setShowRightArrow(hasOverflow && !isAtEnd);
  }, []);

  // Scroll navigation left
  const scrollLeft = () => {
    if (navScrollRef.current) {
      navScrollRef.current.scrollBy({ left: -200, behavior: "smooth" });
    }
  };

  // Scroll navigation right
  const scrollRight = () => {
    if (navScrollRef.current) {
      navScrollRef.current.scrollBy({ left: 200, behavior: "smooth" });
    }
  };

  // Update arrow visibility on scroll or resize
  useEffect(() => {
    checkScrollArrows();

    const nav = navScrollRef.current;
    if (nav) {
      nav.addEventListener("scroll", checkScrollArrows);
    }

    window.addEventListener("resize", checkScrollArrows);

    return () => {
      if (nav) {
        nav.removeEventListener("scroll", checkScrollArrows);
      }
      window.removeEventListener("resize", checkScrollArrows);
    };
  }, [checkScrollArrows]);

  // Update profile dropdown position when open (for portaled dropdown)
  const updateProfileDropdownPosition = useCallback(() => {
    if (!profileMenuRef.current) return;
    const rect = profileMenuRef.current.getBoundingClientRect();
    setProfileDropdownPosition({
      top: rect.bottom + 8,
      right: window.innerWidth - rect.right,
    });
  }, []);

  useEffect(() => {
    if (!profileMenuOpen) {
      setProfileDropdownPosition(null);
      return;
    }
    updateProfileDropdownPosition();
    window.addEventListener("resize", updateProfileDropdownPosition);
    window.addEventListener("scroll", updateProfileDropdownPosition);
    return () => {
      window.removeEventListener("resize", updateProfileDropdownPosition);
      window.removeEventListener("scroll", updateProfileDropdownPosition);
    };
  }, [profileMenuOpen, updateProfileDropdownPosition]);

  // Close profile menu when clicking outside (trigger or portaled dropdown)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (profileMenuRef.current?.contains(target)) return;
      const portaled = document.querySelector("[data-profile-dropdown]");
      if (portaled?.contains(target)) return;
      setProfileMenuOpen(false);
    };

    if (profileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [profileMenuOpen]);

  // Close notifications panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node)
      ) {
        setNotificationsOpen(false);
      }
    };

    if (notificationsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [notificationsOpen]);

  // Close mobile menu on Escape; lock body scroll when open
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    if (mobileMenuOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      // Only reset overflow if this effect set it (prevents clobbering other modals' scroll locks)
      if (mobileMenuOpen) {
        document.body.style.overflow = "";
      }
    };
  }, [mobileMenuOpen]);

  // Show Feature Updates modal only on first login
  // COMMENTED OUT: Disabled popout that shows "Enhanced Real-Time Data" on login
  // useEffect(() => {
  //   if (typeof window === "undefined" || !user || userLoading) {
  //     return;
  //   }

  //   const storageKey = `feature-updates-first-login-${user.id}`;
  //   const hasSeenModal = localStorage.getItem(storageKey);

  //   if (!hasSeenModal) {
  //     // Delay to ensure page has loaded
  //     setTimeout(() => {
  //       setIsFirstLogin(true);
  //       setShowUpdatesModal(true);
  //     }, 1500);

  //     // Mark as seen
  //     localStorage.setItem(storageKey, "true");
  //   }
  // }, [user, userLoading]);

  return (
    <>
      <header
        className={`${isSticky ? "sticky top-0 z-[9999]" : "relative z-[9999]"} w-full max-w-[100vw] overflow-x-hidden`}
        style={{
          background: `linear-gradient(180deg, ${AX.bg} 0%, ${AX.bgDeep} 100%)`,
          borderBottom: `1px solid ${AX.border}`,
          backdropFilter: "blur(12px)",
        }}
      >
        <div
          className="flex max-w-full flex-nowrap items-center justify-between gap-1 px-2 py-2 md:px-4"
          style={{ backgroundColor: "transparent" }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden sm:gap-2 md:gap-3">
            {/* Hamburger button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="flex h-10 min-h-[44px] w-10 min-w-[44px] flex-shrink-0 items-center justify-center rounded-lg border transition-all duration-200 md:hidden"
              style={{
                borderColor: AX.border,
                color: AX.textSecondary,
                backgroundColor: AX.surface,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = AX.surfaceHover;
                e.currentTarget.style.borderColor = AX.borderHover;
                e.currentTarget.style.color = AX.text;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = AX.surface;
                e.currentTarget.style.borderColor = AX.border;
                e.currentTarget.style.color = AX.textSecondary;
              }}
              aria-label="Open menu"
            >
              <FaBars size={18} />
            </button>

            <Link
              href={chainAwareHref("/pulse")}
              className="group flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center gap-1.5 tracking-tight select-none transition-all duration-200 sm:min-h-0 sm:min-w-0 sm:justify-start"
              style={{ color: AX.text }}
              title="Go to Trenches"
            >
              <img
                src="/interstate/logo.png"
                alt="Interstate logo"
                className="h-5 w-5 flex-shrink-0 object-contain transition-all duration-200 group-hover:drop-shadow-[0_0_8px_rgba(24,196,140,0.4)] sm:h-5 sm:w-auto"
              />
              <h3 
                className="!font-orbitron hidden min-[380px]:block text-sm font-semibold tracking-wider uppercase transition-colors duration-200 group-hover:text-[#18c48c]"
                style={{ 
                  color: AX.text,
                  textShadow: "0 0 20px rgba(24, 196, 140, 0.1)",
                }}
              >
                interstate
              </h3>
            </Link>

            {/* Navigation container with arrows - hidden on small, visible from md (50% web app width) */}
            <div className="relative hidden min-w-0 flex-1 items-center gap-0 overflow-hidden sm:gap-1 md:flex">
              {/* Left arrow - hidden on very small screens to save space (user can swipe nav) */}
              {showLeftArrow && (
                <button
                  onClick={scrollLeft}
                  className="z-10 flex h-9 min-h-[44px] w-9 min-w-[44px] flex-shrink-0 items-center justify-center transition-all duration-300 ease-out sm:h-8 sm:min-h-0 sm:w-8 sm:min-w-0"
                  style={{
                    color: AX.text,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = AX.mint;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = AX.text;
                  }}
                  aria-label="Scroll left"
                >
                  <FaChevronLeft size={14} />
                </button>
              )}

              {/* Navigation tabs - always visible with horizontal scroll */}
              <nav
                ref={navScrollRef}
                className="scrollbar-hide flex flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden [-webkit-overflow-scrolling:touch] sm:gap-2 xl:gap-3"
                style={{
                  position: "relative",
                  zIndex: 1000,
                  WebkitOverflowScrolling: "touch",
                }}
              >
                {navLinks.map((link) => {
                  const isActive =
                    router.pathname === link.href ||
                    (link.name === "Trenches" &&
                      router.pathname.startsWith("/trade/")) ||
                    (link.name === "Airdrop" &&
                      (router.pathname === "/airdrop-genesis" ||
                        router.pathname === "/referrals"));
                  const isAgent = link.name === "Agent";

                  if (isAgent) {
                    return (
                      <Link
                        key={link.name}
                        href={chainAwareHref(link.href)}
                        className={`relative flex min-h-[44px] flex-shrink-0 items-center gap-1.5 px-3 py-2 text-xs font-semibold whitespace-nowrap sm:min-h-0 sm:px-3.5 sm:py-1.5 sm:text-sm`}
                        style={{
                          color: isActive ? "#0A0A0A" : AX.mint,
                          background: isActive
                            ? `linear-gradient(135deg, ${AX.mint}, #58B890)`
                            : "transparent",
                          border: `1px solid ${AX.mint}`,
                          borderRadius: "9999px",
                          position: "relative",
                          zIndex: 1001,
                          pointerEvents: "auto",
                          cursor: "pointer",
                          transition: "all 150ms cubic-bezier(0.16, 1, 0.3, 1)",
                          boxShadow: isActive
                            ? `0 0 16px ${AX.mintGlow}`
                            : `0 0 8px ${AX.mintGlow}`,
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.color = "#0A0A0A";
                            e.currentTarget.style.background = `linear-gradient(135deg, ${AX.mint}, #58B890)`;
                            e.currentTarget.style.boxShadow = `0 0 16px ${AX.mintGlow}`;
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.color = AX.mint;
                            e.currentTarget.style.background = "transparent";
                            e.currentTarget.style.boxShadow = `0 0 8px ${AX.mintGlow}`;
                          }
                        }}
                      >
                        {link.name}
                      </Link>
                    );
                  }

                  return (
                    <Link
                      key={link.name}
                      href={chainAwareHref(link.href)}
                      className={`relative flex min-h-[44px] flex-shrink-0 items-center px-3 py-2 text-xs font-medium whitespace-nowrap sm:min-h-0 sm:px-3.5 sm:py-1.5 sm:text-sm`}
                      style={{
                        color: isActive ? AX.mint : AX.text,
                        backgroundColor: isActive ? AX.mintGlow : "transparent",
                        borderRadius: "6px",
                        position: "relative",
                        zIndex: 1001,
                        pointerEvents: "auto",
                        cursor: "pointer",
                        transition: "all 150ms cubic-bezier(0.16, 1, 0.3, 1)",
                        textShadow: isActive ? `0 0 20px ${AX.mintGlow}` : "none",
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.color = AX.text;
                          e.currentTarget.style.backgroundColor = AX.surfaceHover;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.color = AX.text;
                          e.currentTarget.style.backgroundColor = "transparent";
                        }
                      }}
                    >
                      {link.name}
                    </Link>
                  );
                })}
              </nav>

              {/* Right arrow */}
              {showRightArrow && (
                <button
                  onClick={scrollRight}
                  className="z-10 flex h-9 min-h-[44px] w-9 min-w-[44px] flex-shrink-0 items-center justify-center transition-all duration-300 ease-out sm:h-8 sm:min-h-0 sm:w-8 sm:min-w-0"
                  style={{
                    color: AX.text,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = AX.mint;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = AX.text;
                  }}
                  aria-label="Scroll right"
                >
                  <FaChevronRight size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="flex min-w-0 flex-shrink-0 flex-nowrap items-center gap-1 sm:gap-1.5 md:gap-2 lg:gap-4">
            {/* Morphing Arena Navigation - commented out, Arena now in main nav
            <MorphingArenaNav />
            */}

            {showSearch && (
              <div className="flex flex-shrink-0 items-center gap-1 sm:gap-1.5 md:gap-2">
                {/* Clipboard token split-button: navigate (left) + quick buy (right) */}
                {clipboardToken && (
                  <div className="flex h-8 flex-shrink-0 items-center">
                    {/* Left half — navigate to trade page */}
                    <button
                      onClick={handlePasteCA}
                      className="relative flex h-10 min-h-[44px] w-10 min-w-[44px] cursor-pointer items-center justify-center gap-1 rounded-l-md border border-r-0 px-1.5 transition-all duration-200 ease-out sm:h-8 sm:min-h-0 sm:w-auto sm:min-w-0 sm:gap-1.5 sm:px-2"
                      style={{
                        backgroundColor: "#13151b",
                        borderColor: AX.border,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#1a1c23";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "#13151b";
                      }}
                    >
                      {clipboardToken.imageUrl ? (
                        <img
                          src={clipboardToken.imageUrl}
                          alt="Token"
                          className="h-5 w-5 flex-shrink-0 rounded object-cover sm:h-6 sm:w-6"
                          onError={(e) => {
                            (
                              e.currentTarget as HTMLImageElement
                            ).style.display = "none";
                          }}
                        />
                      ) : (
                        <div
                          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded sm:h-6 sm:w-6"
                          style={{
                            background:
                              "linear-gradient(to bottom right, #1f2937, #000000)",
                          }}
                        >
                          <span className="text-[10px] font-bold text-white select-none">
                            {(clipboardToken.name || "?")[0]?.toUpperCase()}
                          </span>
                        </div>
                      )}
                      <span className="hidden max-w-[60px] truncate text-[11px] font-medium text-white md:inline">
                        {clipboardToken.name}
                      </span>
                      <IoShieldCheckmarkOutline
                        size={12}
                        style={{
                          color: clipboardToken.isPumpToken
                            ? "#31e3ac"
                            : "#eab308",
                        }}
                      />
                    </button>
                    {/* Right half — lightning buy + amount display/edit */}
                    <div
                      className="flex h-8 items-center rounded-r-md border transition-all duration-200 ease-out"
                      style={{
                        backgroundColor: "#13151b",
                        borderColor: AX.border,
                        borderLeft: "1px solid rgba(255,255,255,0.08)",
                        opacity:
                          !clipboardToken.tokenData ||
                          (Number(clipboardAmountStr) || 0) <= 0
                            ? 0.5
                            : 1,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#1a1c23";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "#13151b";
                      }}
                    >
                      {isEditingClipboardAmount ? (
                        <>
                          {/* Lightning icon — still buys in edit mode */}
                          <button
                            onClick={handleClipboardQuickBuy}
                            disabled={
                              !clipboardToken.tokenData || isClipboardBuying
                            }
                            className="flex h-full cursor-pointer items-center pl-1.5 sm:pl-2"
                          >
                            <HiLightningBolt
                              size={12}
                              className={
                                isClipboardBuying ? "animate-pulse" : ""
                              }
                              style={{ color: "#85d99f" }}
                            />
                          </button>
                          {/* Editable input */}
                          <input
                            autoFocus
                            type="text"
                            inputMode="decimal"
                            value={clipboardAmountStr}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "" || /^\d*\.?\d*$/.test(v)) {
                                setClipboardAmountStr(v);
                                const num = parseFloat(v);
                                if (!isNaN(num) && num >= 0) {
                                  setQuickBuyAmount(num);
                                  localStorage.setItem(
                                    "quickBuyAmount",
                                    num.toString(),
                                  );
                                }
                              }
                            }}
                            onFocus={() => {
                              clipboardInputFocusedRef.current = true;
                            }}
                            onBlur={() => {
                              clipboardInputFocusedRef.current = false;
                              const num = parseFloat(clipboardAmountStr);
                              if (!isNaN(num) && num >= 0) {
                                setQuickBuyAmount(num);
                                setClipboardAmountStr(String(num));
                              } else {
                                setClipboardAmountStr(String(quickBuyAmount));
                              }
                              setIsEditingClipboardAmount(false);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const num = parseFloat(clipboardAmountStr);
                                if (!isNaN(num) && num >= 0) {
                                  setQuickBuyAmount(num);
                                  setClipboardAmountStr(String(num));
                                }
                                setIsEditingClipboardAmount(false);
                                handleClipboardQuickBuy();
                              } else if (e.key === "Escape") {
                                setClipboardAmountStr(String(quickBuyAmount));
                                setIsEditingClipboardAmount(false);
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-[60px] bg-transparent text-center text-[10px] font-medium outline-none"
                            style={{ color: "#85d99f" }}
                          />
                          {/* Currency label */}
                          <span
                            className="pr-1.5 text-[10px] font-medium sm:pr-2"
                            style={{ color: "#85d99f", opacity: 0.6 }}
                          >
                            {currentChain === "monad" ? "MON" : "SOL"}
                          </span>
                        </>
                      ) : (
                        <>
                          {/* Big buy button: lightning + amount + SOL — entire area is clickable to buy */}
                          <button
                            onClick={handleClipboardQuickBuy}
                            disabled={
                              !clipboardToken.tokenData || isClipboardBuying
                            }
                            className="flex h-full cursor-pointer items-center gap-0.5 pr-1.5 pl-1.5 sm:pr-2 sm:pl-2"
                          >
                            <HiLightningBolt
                              size={12}
                              className={
                                isClipboardBuying ? "animate-pulse" : ""
                              }
                              style={{ color: "#85d99f" }}
                            />
                            <span
                              className="text-[10px] font-medium"
                              style={{ color: "#85d99f" }}
                            >
                              {quickBuyAmount}
                            </span>
                            <span
                              className="text-[10px] font-medium"
                              style={{ color: "#85d99f", opacity: 0.6 }}
                            >
                              {currentChain === "monad" ? "MON" : "SOL"}
                            </span>
                          </button>
                          {/* Pencil — opens edit mode */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setClipboardAmountStr(String(quickBuyAmount));
                              setIsEditingClipboardAmount(true);
                            }}
                            onMouseEnter={(e) => {
                              // Reset parent highlight, show pencil-only highlight
                              const parent = e.currentTarget.parentElement;
                              if (parent)
                                parent.style.backgroundColor = "#13151b";
                              e.currentTarget.style.backgroundColor =
                                "rgba(133,217,159,0.1)";
                              const icon = e.currentTarget.querySelector(
                                "svg",
                              ) as SVGElement | null;
                              if (icon) {
                                icon.style.opacity = "1";
                                icon.style.transform = "scale(1.15)";
                              }
                            }}
                            onMouseLeave={(e) => {
                              // Restore parent hover since cursor is still inside the container
                              const parent = e.currentTarget.parentElement;
                              if (parent)
                                parent.style.backgroundColor = "#1a1c23";
                              e.currentTarget.style.backgroundColor =
                                "transparent";
                              const icon = e.currentTarget.querySelector(
                                "svg",
                              ) as SVGElement | null;
                              if (icon) {
                                icon.style.opacity = "0.45";
                                icon.style.transform = "scale(1)";
                              }
                            }}
                            className="flex h-full cursor-pointer items-center rounded-r-md border-l pr-1.5 pl-1.5 transition-colors duration-150 sm:pr-2"
                            style={{
                              borderColor: "rgba(255,255,255,0.08)",
                              backgroundColor: "transparent",
                            }}
                          >
                            <FiEdit2
                              size={9}
                              style={{
                                color: "#85d99f",
                                opacity: 0.45,
                                transition: "opacity 0.15s, transform 0.15s",
                              }}
                            />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Search button (desktop) - squarish pill; collapses to icon-only below lg */}
                <button
                  onClick={() => openSearch()}
                  className="hidden h-8 cursor-pointer items-center gap-2 rounded-lg border px-2.5 transition-all duration-200 ease-out md:flex lg:px-3"
                  style={{
                    backgroundColor: AX.surface,
                    borderColor: AX.border,
                    color: AX.textMuted,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = AX.surfaceHover;
                    e.currentTarget.style.borderColor = AX.borderHover;
                    e.currentTarget.style.color = AX.textSecondary;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = AX.surface;
                    e.currentTarget.style.borderColor = AX.border;
                    e.currentTarget.style.color = AX.textMuted;
                  }}
                >
                  <FaSearch size={12} />
                  <span className="hidden text-xs whitespace-nowrap lg:inline" style={{ color: AX.textMuted }}>
                    Search
                  </span>
                  <span 
                    className="ml-1.5 hidden rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-none lg:inline-block"
                    style={{
                      backgroundColor: AX.surface2,
                      color: AX.textMuted,
                      border: `1px solid ${AX.border}`,
                    }}
                  >
                    /
                  </span>
                </button>

                {/* Compact icon-only trigger on mobile/tablet */}
                {/* <button
                  onClick={() => openSearch()}
                  className="flex h-10 min-h-[44px] w-10 min-w-[44px] flex-shrink-0 cursor-pointer items-center justify-center rounded-md border transition-all duration-200 ease-out sm:h-8 sm:min-h-0 sm:w-8 sm:min-w-0 lg:hidden"
                  style={{
                    backgroundColor: "rgba(13, 16, 21, 0.8)",
                    borderColor: AX.border,
                    color: AX.muted,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "rgba(255, 255, 255, 0.06)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "rgba(13, 16, 21, 0.8)";
                  }}
                >
                  <FaSearch size={12} />
                </button> */}

                {/* Blockchain Switcher - Right of search bar; hidden on very small screens to prevent overflow */}
                <div className="hidden min-[420px]:block">
                  <BlockchainSwitcher />
                </div>
              </div>
            )}

            {/* Notifications Button */}
            <div ref={notificationsRef} className="relative flex-shrink-0">
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="flex h-10 min-h-[44px] w-10 min-w-[44px] flex-shrink-0 cursor-pointer items-center justify-center rounded-lg border transition-all duration-200 ease-out sm:h-8 sm:min-h-0 sm:w-8 sm:min-w-0"
                style={{
                  color: AX.textMuted,
                  borderColor: AX.border,
                  backgroundColor: AX.surface,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = AX.surfaceHover;
                  e.currentTarget.style.borderColor = AX.borderHover;
                  e.currentTarget.style.color = AX.textSecondary;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = AX.surface;
                  e.currentTarget.style.borderColor = AX.border;
                  e.currentTarget.style.color = AX.textMuted;
                }}
                title="Notifications"
              >
                <FaBell size={14} />
              </button>

              {/* Notifications Panel */}
              <NotificationDropdown
                open={notificationsOpen}
                onClose={() => setNotificationsOpen(false)}
              />
            </div>
            {/* User profile/login - visible on all screens */}
            {user && !userLoading ? (
              <div
                ref={profileMenuRef}
                className="relative z-[1000000] flex-shrink-0"
              >
                {/* Combined Balance + Username Button */}
                <button
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                  className="group/account flex h-10 min-h-[44px] cursor-pointer flex-row items-center justify-center gap-1.5 rounded-lg border px-2.5 transition-all duration-200 ease-out sm:h-8 sm:min-h-0 sm:gap-2 sm:px-3"
                  style={{
                    borderColor: AX.border,
                    color: AX.text,
                    backgroundColor: AX.surface,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = AX.surfaceHover;
                    e.currentTarget.style.borderColor = AX.borderHover;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "rgba(13, 16, 21, 0.8)";
                  }}
                  title="Click to view account & wallet"
                >
                  {/* v2.0: Show Arena rank badge (driven by lifetime credits),
                      not the Referrals Honors badge. Two separate axes —
                      the header belongs to the Arena. */}
                  <div
                    className="hidden h-6 w-6 bg-contain bg-center bg-no-repeat select-none sm:flex"
                    style={{
                      backgroundImage: creditsSummary
                        ? `url(/ranks/${creditsSummary.rank.toLowerCase()}-${Math.max(1, Math.min(4, creditsSummary.rankLevel))}.png)`
                        : `url(/ranks/degen-1.png)`,
                    }}
                    role="img"
                    aria-label={
                      creditsSummary ? creditsSummary.rankDisplay : "Degen I"
                    }
                  />
                  <div className="flex items-center gap-1.5 text-left">
                    {/* v2.0: Arena credits inline — renders only once data is loaded.
                        Coin.png sits right next to the number as the credits-unit glyph. */}
                    {creditsSummary && (
                      <>
                        <div
                          className="flex items-center gap-1"
                          title={`${creditsSummary.rankDisplay} · ${creditsSummary.lifetimeCredits.toLocaleString()} lifetime credits`}
                        >
                          <span className="text-xs font-semibold text-yellow-300 tabular-nums sm:text-sm">
                            {(() => {
                              // Always floor — never overstate balance.
                              // <1k: raw.  1k–99.99k: one decimal (13.6k).
                              // 100k–999k: integer k (125k).  >=1M: two decimals M (1.53M).
                              const n = creditsSummary.seasonCredits;
                              if (n < 1000) return n.toLocaleString();
                              if (n < 100_000)
                                return `${Math.floor(n / 100) / 10}k`;
                              if (n < 1_000_000)
                                return `${Math.floor(n / 1000)}k`;
                              return `${Math.floor(n / 10_000) / 100}M`;
                            })()}
                          </span>
                          <div
                            className="h-4 w-4 flex-shrink-0 bg-contain bg-center bg-no-repeat select-none"
                            style={{ backgroundImage: "url(/ranks/Coin.png)" }}
                            role="img"
                            aria-label="Credits"
                          />
                        </div>
                        <span className="h-3 w-px bg-[#20232b]" />
                      </>
                    )}
                    <div className="flex items-center gap-1 text-xs font-medium text-white sm:text-sm">
                      {isPredictionsPage ? (
                        <>
                          <SiPolygon size={10} className="text-[#8247E5]" />
                          <span>
                            {polygonBalanceLoading
                              ? "..."
                              : `$${formatBalance(polygonBalance?.usdc ?? 0, 2)}`}
                          </span>
                        </>
                      ) : (
                        <span>
                          {formatBalance(chainBalance)}{" "}
                          {chainSymbols[currentChain] ?? "SOL"}
                        </span>
                      )}
                    </div>
                  </div>
                  <FaSync
                    size={9}
                    className={`cursor-pointer ${isRefreshingBalance ? "animate-spin text-[#18c48c]" : "text-neutral-500 hover:text-neutral-300"}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleManualBalanceRefresh(e);
                    }}
                    title="Refresh balance"
                  />
                  <FiChevronDown className="text-neutral-500" size={12} />
                </button>
                {/* Combined Dropdown - portaled to body so it always appears on top */}
                {profileMenuOpen &&
                  profileDropdownPosition &&
                  typeof document !== "undefined" &&
                  createPortal(
                    <div
                      data-profile-dropdown
                      className="mt-1 max-h-[min(85vh,600px)] w-[280px] max-w-[calc(100vw-1.5rem)] min-w-[260px] overflow-y-auto rounded-lg border border-[#20232b] bg-[#0a0b10] shadow-2xl"
                      style={{
                        position: "fixed",
                        top: profileDropdownPosition.top,
                        right: profileDropdownPosition.right,
                        zIndex: 99999,
                      }}
                    >
                      <div className="p-4">
                        {/* User Info Header */}
                        <div
                          className="mb-3 flex items-center gap-2 border-b pb-3"
                          style={{ borderColor: "#20232b" }}
                        >
                          <div
                            className="flex h-6 w-6 bg-contain bg-center bg-no-repeat select-none"
                            style={{
                              backgroundImage: `url(/ranks/degen-${Math.max(1, Math.min(4, honorsLevel))}.png)`,
                            }}
                            role="img"
                            aria-label={`Honors ${honorsLevel}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-[#f0f5f5]">
                              {user.name}
                            </div>
                            <div className="text-xs text-neutral-400">
                              Account
                            </div>
                          </div>
                        </div>

                        {/* Total Value - Conditional for Predictions */}
                        {isPredictionsPage ? (
                          <>
                            {/* Clean Polygon Balance Display */}
                            <div className="mb-3">
                              <div className="text-2xl font-bold text-white">
                                ${formatCurrency(polygonBalance?.usdc ?? 0)}
                              </div>
                              <div className="mt-1.5 flex flex-col gap-1.5 text-xs text-neutral-400">
                                <span className="flex items-center gap-1.5">
                                  <img
                                    src="https://upload.wikimedia.org/wikipedia/commons/c/ca/USD_Coin_logo_%28cropped%29.png"
                                    alt="USDC.e"
                                    className="h-4 w-4 rounded-full"
                                  />
                                  <span className="font-medium text-white">
                                    $
                                    {formatBalance(
                                      polygonBalance?.usdcBridged ?? 0,
                                      2,
                                    )}
                                  </span>
                                  <span>USDC.e</span>
                                  <span
                                    className="ml-auto cursor-help rounded px-1 py-0.5 text-[10px]"
                                    style={{
                                      backgroundColor: "rgba(255,255,255,0.06)",
                                    }}
                                    title="Used for Polymarket trades"
                                  >
                                    Polymarket
                                  </span>
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <img
                                    src="https://upload.wikimedia.org/wikipedia/commons/c/ca/USD_Coin_logo_%28cropped%29.png"
                                    alt="USDC"
                                    className="h-4 w-4 rounded-full"
                                  />
                                  <span className="font-medium text-white">
                                    $
                                    {formatBalance(
                                      polygonBalance?.usdcNative ?? 0,
                                      2,
                                    )}
                                  </span>
                                  <span>USDC</span>
                                  <span
                                    className="ml-auto cursor-help rounded px-1 py-0.5 text-[10px]"
                                    style={{
                                      backgroundColor: "rgba(255,255,255,0.06)",
                                    }}
                                    title="Used for AI Markets (Talarion) trades"
                                  >
                                    AI Markets
                                  </span>
                                </span>
                              </div>
                            </div>

                            {/* Compact Address Row */}
                            <div className="mb-3 flex items-center justify-between rounded-lg bg-[#1a1b1f] px-3 py-2">
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                <span className="truncate font-mono text-xs text-neutral-400">
                                  {primaryWalletAddresses?.ethereum
                                    ? `${primaryWalletAddresses.ethereum.slice(0, 6)}...${primaryWalletAddresses.ethereum.slice(-4)}`
                                    : "Not connected"}
                                </span>
                              </div>
                              <div className="flex flex-shrink-0 items-center gap-1">
                                <button
                                  onClick={handleCopyPolygonAddress}
                                  className="rounded p-1.5 transition-colors hover:bg-white/10"
                                  title="Copy address"
                                >
                                  {polygonAddressCopied ? (
                                    <BiCheck className="h-4 w-4 text-emerald-400" />
                                  ) : (
                                    <BiCopy className="h-4 w-4 text-neutral-400 hover:text-white" />
                                  )}
                                </button>
                                <a
                                  href={`https://polygonscan.com/address/${primaryWalletAddresses?.ethereum}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded p-1.5 transition-colors hover:bg-white/10"
                                  title="View on Polygonscan"
                                >
                                  <img
                                    src="https://polygonscan.com/assets/poly/images/svg/logos/chain-dim.svg?v=26.1.4.2"
                                    alt="Polygonscan"
                                    className="h-4 w-4"
                                  />
                                </a>
                              </div>
                            </div>

                            {/* Swap button — opens swap modal */}
                            <button
                              onClick={() => {
                                setProfileMenuOpen(false);
                                setShowPolygonSwap(true);
                              }}
                              className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium transition-all hover:brightness-110"
                              style={{
                                backgroundColor: "rgba(130, 71, 229, 0.15)",
                                color: "#A78BFA",
                              }}
                            >
                              <HiOutlineSwitchVertical className="h-3.5 w-3.5" />
                              Convert USDC.e / USDC
                            </button>
                          </>
                        ) : (
                          <>
                            {/* Standard chain balance display */}
                            <div className="mb-3">
                              <div className="mb-1 text-xs text-neutral-400">
                                Total Value
                              </div>
                              <div className="text-2xl font-bold text-white">
                                ${formatCurrency(chainBalance * chainPrice)}
                              </div>
                            </div>

                            {/* Balance Display */}
                            <div className="mb-4 flex items-center justify-between rounded-lg bg-[#25282B] p-2">
                              <div className="flex items-center gap-2">
                                <img
                                  src={
                                    chainLogos[currentChain] ?? chainLogos.monad
                                  }
                                  alt={chainSymbols[currentChain] ?? "MON"}
                                  className={
                                    currentChain === "monad"
                                      ? "h-10 w-8 rounded-md object-contain"
                                      : "h-4 w-4 rounded-md object-contain"
                                  }
                                  style={
                                    currentChain === "monad"
                                      ? { minWidth: "32px", minHeight: "40px" }
                                      : { minWidth: "16px", minHeight: "16px" }
                                  }
                                />
                                <span className="text-sm text-[#f0f5f5]">
                                  ≈ {formatBalance(chainBalance)}{" "}
                                  {chainSymbols[currentChain] ?? "MON"}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <svg
                                  className="h-4 w-4 text-neutral-400"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                                  />
                                </svg>
                                <img
                                  src={
                                    chainLogos[currentChain] ?? chainLogos.monad
                                  }
                                  alt={chainSymbols[currentChain] ?? "MON"}
                                  className={
                                    currentChain === "monad"
                                      ? "h-10 w-8 rounded-md object-contain"
                                      : "h-4 w-4 rounded-md object-contain"
                                  }
                                  style={
                                    currentChain === "monad"
                                      ? { minWidth: "32px", minHeight: "40px" }
                                      : { minWidth: "16px", minHeight: "16px" }
                                  }
                                />
                                <span className="text-sm text-[#f0f5f5]">
                                  {formatMultiDigitBalance(chainBalance)}
                                </span>
                              </div>
                            </div>
                          </>
                        )}

                        {/* Action Buttons - Conditional for Predictions */}
                        {isPredictionsPage ? (
                          <div className="flex gap-2">
                            {/* Deposit Button - Opens QR */}
                            <button
                              onClick={() => setShowPolygonQR(true)}
                              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-all"
                              style={{
                                backgroundColor: "#8247E5",
                                color: "#fff",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  "#7038d4";
                              }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = AX.surface;
                    e.currentTarget.style.borderColor = AX.border;
                  }}
                            >
                              <HiOutlineQrcode className="h-4 w-4" />
                              Deposit
                            </button>
                            {/* Withdraw Button */}
                            <button
                              onClick={() => {
                                setProfileMenuOpen(false);
                                setShowPolygonWithdraw(true);
                              }}
                              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-all"
                              style={{
                                backgroundColor: "#0f1012",
                                color: "#ffffff",
                                border: "1px solid #2A2B33",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  "#1A1B1F";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  "#0f1012";
                              }}
                            >
                              Withdraw
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {/* Deposit/Withdraw Buttons */}
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setProfileMenuOpen(false);
                                  handleDepositClick();
                                }}
                                className="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200"
                                style={{
                                  backgroundColor: AX.mint,
                                  color: "#000000",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor =
                                    AX.mintHover;
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor =
                                    AX.mint;
                                }}
                              >
                                Deposit
                              </button>
                              <button
                                onClick={() => {
                                  setProfileMenuOpen(false);
                                  handleWithdrawClick();
                                }}
                                className="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200"
                                style={{
                                  backgroundColor: "#0f1012",
                                  color: "#ffffff",
                                  border: "1px solid #2A2B33",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor =
                                    "#1A1B1F";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor =
                                    "#0f1012";
                                }}
                              >
                                Withdraw
                              </button>
                            </div>

                            {/* Convert/Buy Buttons */}
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setProfileMenuOpen(false);
                                  handleConvertClick();
                                }}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#2A2B33] bg-[#0C0C0F] px-3 py-2 text-sm font-medium text-[#ffffff] transition-all duration-200"
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor =
                                    "#1A1B1F";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor =
                                    "#0f1012";
                                }}
                              >
                                <svg
                                  className="h-3.5 w-3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                                  />
                                </svg>
                                Convert
                              </button>
                              <button
                                onClick={() => {
                                  setProfileMenuOpen(false);
                                  handleBuyClick();
                                }}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#2A2B33] bg-[#0C0C0F] px-3 py-2 text-sm font-medium text-[#ffffff] transition-all duration-200"
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor =
                                    "#1A1B1F";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor =
                                    "#0f1012";
                                }}
                              >
                                <svg
                                  className="h-3.5 w-3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                                  />
                                </svg>
                                Buy
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Feature Updates Button */}
                        <button
                          onClick={() => {
                            setProfileMenuOpen(false);
                            setIsFirstLogin(false);
                            setShowUpdatesModal(true);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg bg-transparent px-3 py-2 text-sm font-medium transition-all duration-200"
                          style={{
                            color: AX.text,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "rgba(24, 196, 140, 0.1)";
                            e.currentTarget.style.color = AX.mint;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "transparent";
                            e.currentTarget.style.color = AX.text;
                          }}
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13 10V3L4 14h7v7l9-11h-7z"
                            />
                          </svg>
                          Feature Updates
                        </button>

                        {/* Edit Username Button */}
                        <button
                          onClick={() => {
                            setProfileMenuOpen(false);
                            setShowUsernameModal(true);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg bg-transparent px-3 py-2 text-sm font-medium transition-all duration-200"
                          style={{
                            color: AX.text,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "rgba(24, 196, 140, 0.1)";
                            e.currentTarget.style.color = AX.mint;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "transparent";
                            e.currentTarget.style.color = AX.text;
                          }}
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                          Edit Username
                        </button>

                        {/* Logout Button */}
                        <button
                          onClick={() => {
                            setProfileMenuOpen(false);
                            logout();
                          }}
                          className="flex w-full items-center gap-2 rounded-lg bg-transparent px-3 py-2 text-sm font-medium transition-all duration-200"
                          style={{
                            color: "#ef4444",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "rgba(239, 68, 68, 0.1)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "transparent";
                          }}
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                            />
                          </svg>
                          Logout
                        </button>
                      </div>
                    </div>,
                    document.body,
                  )}
              </div>
            ) : (
              !userLoading && (
                <button
                  className="ml-0.5 flex h-10 min-h-[44px] flex-shrink-0 items-center justify-center rounded-md border-none px-3 py-2 text-sm font-medium text-black transition-all duration-300 ease-out sm:ml-1 sm:h-8 sm:min-h-0 sm:py-1.5 md:ml-1.5 md:px-3 lg:ml-2"
                  style={{
                    backgroundColor: AX.mint,
                  }}
                  onClick={() => {
                    const event = new CustomEvent("open-login-modal");
                    window.dispatchEvent(event);
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#58B890";
                    e.currentTarget.style.boxShadow =
                      "0 0 8px rgba(112, 224, 176, 0.3), 0 0 16px rgba(112, 224, 176, 0.15)";
                    e.currentTarget.style.transform = "scale(1.02)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = AX.mint;
                    e.currentTarget.style.boxShadow = "none";
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  Login
                </button>
              )
            )}
          </div>
        </div>
        {headerBarVisible && (
          <div className="flex flex-nowrap items-center gap-1 overflow-hidden bg-[#050608] px-2 py-1 sm:gap-2 sm:px-3 sm:py-0.5">
            <div
              className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-md px-3 py-1"
              style={{ background: "#13151b" }}
            >
              {/* COMMENTED OUT: Active Positions icon — may re-enable later
            <div className="group relative">
              <button
                className="cursor-pointer rounded p-0.5 transition-all duration-300 ease-out"
                style={{ color: AX.muted }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "rgba(49, 227, 172, 0.08)";
                  e.currentTarget.style.color = "#31e3ac";
                  e.currentTarget.style.boxShadow =
                    "0 0 6px rgba(49, 227, 172, 0.25), 0 0 12px rgba(49, 227, 172, 0.12)";
                  e.currentTarget.style.transform = "scale(1.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = AX.muted;
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 3v18h18" />
                  <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
                </svg>
              </button>
              <div
                className="pointer-events-none absolute top-1/2 left-full z-50 ml-2 -translate-y-1/2 transform rounded px-2 py-1 text-sm font-medium whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                style={{
                  backgroundColor: AX.surface,
                  color: AX.text,
                  border: `1px solid ${AX.border}`,
                  boxShadow:
                    "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                }}
              >
                Active Positions
                <div
                  className="absolute top-1/2 right-full h-0 w-0 -translate-y-1/2 transform border-t-4 border-r-4 border-b-4 border-transparent"
                  style={{ borderRightColor: AX.surface }}
                ></div>
              </div>
            </div>
            END COMMENTED OUT: Active Positions icon */}

              {/* Watchlist label button — opens watchlist modal */}
              <button
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1"
                style={{ color: "#c5cdd8" }}
                onClick={() => setWatchlistOpen(true)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "rgba(255, 255, 255, 0.06)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <span className="text-xs font-medium">Watchlist</span>
                <FaSortAmountDown size={10} style={{ color: "#8b94a5" }} />
              </button>

              {/* COMMENTED OUT: Watchlist Star icon — replaced with text label above
            <div className="group relative">
              <button
                className="relative cursor-pointer rounded p-0.5 transition-all duration-300 ease-out"
                style={{ color: AX.muted }}
                onClick={() => setWatchlistOpen(true)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "rgba(24, 196, 140, 0.08)";
                  e.currentTarget.style.color = AX.mint;
                  e.currentTarget.style.boxShadow =
                    "0 0 6px rgba(24, 196, 140, 0.25), 0 0 12px rgba(24, 196, 140, 0.12)";
                  e.currentTarget.style.transform = "scale(1.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = AX.muted;
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>
              <div
                className="pointer-events-none absolute top-1/2 left-full z-50 ml-2 -translate-y-1/2 transform rounded px-2 py-1 text-sm font-medium whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                style={{
                  backgroundColor: AX.surface,
                  color: AX.text,
                  border: `1px solid ${AX.border}`,
                  boxShadow:
                    "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                }}
              >
                Watchlist
                <div
                  className="absolute top-1/2 right-full h-0 w-0 -translate-y-1/2 transform border-t-4 border-r-4 border-b-4 border-transparent"
                  style={{ borderRightColor: AX.surface }}
                ></div>
              </div>
            </div>
            END COMMENTED OUT: Watchlist Star icon */}

              {/* Divider before watchlist tokens - only show after hydration to prevent flicker */}
              {isHydrated && watchlist.length > 0 && (
                <div
                  className="h-4 border-r"
                  style={{ borderColor: "#262a35" }}
                />
              )}

              {/* COMMENTED OUT: "All" dropdown — replaced by "Watchlist" label above
            {isHydrated && watchlist.length > 0 && (
              <div className="flex items-center">
                <span className="text-xs font-medium" style={{ color: '#c5cdd8' }}>
                  All
                </span>
                <FaChevronDown size={8} className="ml-1" style={{ color: '#8b94a5' }} />
              </div>
            )}
            END COMMENTED OUT: "All" dropdown */}

              {/* Watchlist Tokens Ticker - Scrollable Container (uses full available panel width) */}
              {isHydrated && enrichedWatchlist.length > 0 && (
                <div
                  className="scrollbar-hide flex flex-1 items-center gap-3 overflow-x-auto pr-3 pl-1"
                  style={{
                    minWidth: 0, // Allow flex item to shrink below content size for proper scrolling
                    scrollbarWidth: "none", // Firefox
                    msOverflowStyle: "none", // IE/Edge
                  }}
                >
                  {enrichedWatchlist.map((token, index) => {
                    const tokenKey =
                      token.pair_address || (token as any).mint || token.symbol;
                    const tokenAddress =
                      (token as any).mint || token.pair_address || "";
                    const actualMint =
                      (token as any).mint || token.pair_address || "";
                    // Use helper function to get correctly mapped price and price change
                    const { price, priceChange } =
                      getWatchlistTokenPriceAndChange(token);
                    const marketCap =
                      (token as any).market_cap_usd ??
                      (token as any).marketCapUSD ??
                      (token as any).fully_diluted_value ??
                      0;

                    const rawImg = extractTokenImage(token as any);

                    return (
                      <div
                        key={tokenKey}
                        className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 transition-all duration-200 hover:bg-white/[0.07]"
                        onMouseEnter={() => {
                          // Prefetch OHLC + route + metadata + trades on hover
                          const isMonadToken =
                            actualMint.startsWith("0x") ||
                            actualMint.startsWith("0X");
                          // Build tradeUrl matching the onClick navigation exactly
                          const hoverQueryParams = new URLSearchParams();
                          if (token.name)
                            hoverQueryParams.set("_name", token.name);
                          if (token.symbol)
                            hoverQueryParams.set("_symbol", token.symbol);
                          if (price > 0)
                            hoverQueryParams.set("_price", price.toString());
                          if (
                            token.market_cap_usd ||
                            (token as any).fully_diluted_value
                          ) {
                            hoverQueryParams.set(
                              "_mcap",
                              (
                                token.market_cap_usd ||
                                (token as any).fully_diluted_value ||
                                0
                              ).toString(),
                            );
                          }
                          const hoverTradeUrl = isMonadToken
                            ? `/trade/monad/${tokenAddress}`
                            : `/trade/${tokenAddress}`;
                          preloadTradeChart(
                            {
                              mint: actualMint,
                              pairAddress:
                                token.pair_address || (token as any).mint,
                              chain: isMonadToken ? "monad" : "sol",
                              name: token.name,
                              symbol: token.symbol,
                              priceUsd: price,
                              marketCapUsd:
                                token.market_cap_usd ||
                                (token as any).fully_diluted_value,
                              image: rawImg || "",
                              launchpadProtocol: (token as any)
                                .launchpad_protocol,
                            },
                            { router, tradeUrl: hoverTradeUrl },
                          );
                        }}
                        onClick={() => {
                          if (tokenAddress) {
                            // Check if it's a Monad token (starts with 0x)
                            const isMonadToken =
                              actualMint.startsWith("0x") ||
                              actualMint.startsWith("0X");

                            if (isMonadToken) {
                              // Build Monad trade URL with query parameters
                              const queryParams = new URLSearchParams();
                              if (token.name)
                                queryParams.set("_name", token.name);
                              if (token.symbol)
                                queryParams.set("_symbol", token.symbol);
                              if (price > 0)
                                queryParams.set("_price", price.toString());
                              if (
                                token.market_cap_usd ||
                                (token as any).fully_diluted_value
                              ) {
                                queryParams.set(
                                  "_mcap",
                                  (
                                    token.market_cap_usd ||
                                    (token as any).fully_diluted_value ||
                                    0
                                  ).toString(),
                                );
                              }
                              const imageUrl =
                                extractTokenImage(token as any) || "";
                              if (imageUrl) queryParams.set("_image", imageUrl);
                              queryParams.set("_mint", tokenAddress);
                              if ((token as any).launchpad_protocol)
                                queryParams.set(
                                  "_launchpad_protocol",
                                  (token as any).launchpad_protocol,
                                );
                              queryParams.set("chain", "monad");

                              const url = `/trade/monad/${tokenAddress}?${queryParams.toString()}`;
                              router.push(url);
                            } else {
                              // For Solana tokens, include chain=sol query parameter
                              router.push(`/trade/${tokenAddress}`);
                            }
                          }
                        }}
                      >
                        {/* Token Image */}
                        <FastImage
                          src={rawImg ?? undefined}
                          alt={token.symbol || ""}
                          width={16}
                          height={16}
                          className="rounded-full ring-1 ring-white/10"
                          symbol={token.symbol}
                          name={token.name}
                          showBubble={false}
                          stableId={tokenAddress || undefined}
                        />

                        {/* Token Symbol */}
                        <span
                          className="text-xs font-semibold"
                          style={{ color: "#d1d5db" }}
                        >
                          {token.symbol}
                        </span>

                        {/* Market Cap */}
                        <span
                          className="text-xs font-medium"
                          style={{ color: "#a3e635" }}
                        >
                          ${formatMarketCap(marketCap)}
                        </span>

                        {/* COMMENTED OUT: Quick Buy + Unstar buttons — may re-enable later
                  {isHovered && (
                    <>
                      <button
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-all duration-150"
                        style={{
                          backgroundColor: 'rgba(133, 217, 159, 0.15)',
                          color: '#85d99f',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleWatchlistQuickBuy(token);
                        }}
                      >
                        <HiLightningBolt size={10} />
                        <span>{quickBuyAmount} {currentChain === 'monad' ? 'MON' : 'SOL'}</span>
                      </button>

                      <button
                        className="p-0.5 transition-colors duration-150"
                        style={{ color: '#f2c367' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromWatchlist(tokenAddress);
                        }}
                        title="Remove from watchlist"
                      >
                        <FaStar size={12} />
                      </button>
                    </>
                  )}
                  END COMMENTED OUT: Quick Buy + Unstar buttons */}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Mobile menu overlay + slide-out panel */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-[10003] bg-black/60 transition-opacity duration-200 md:hidden"
            aria-hidden
            onClick={() => setMobileMenuOpen(false)}
          />
          <div
            className="fixed inset-y-0 left-0 z-[10004] flex w-[min(280px,85vw)] flex-col border-r bg-[#050608] shadow-2xl md:hidden"
            style={{ borderColor: AX.border }}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <div
              className="items-centers flex flex-shrink-0 justify-between border-b px-4 py-3"
              style={{ borderColor: AX.border }}
            >
              {/* <span className="text-sm font-semibold" style={{ color: AX.text }}>
                Menu
              </span> */}
              <span>
                <Link
                  href={chainAwareHref("/pulse")}
                  className="flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center gap-1 tracking-tight select-none sm:min-h-0 sm:min-w-0 sm:justify-start"
                  style={{ color: AX.text }}
                  title="Go to Trenches"
                >
                  <img
                    src="/interstate/logo.png"
                    alt="Interstate logo"
                    className="h-5 w-5 flex-shrink-0 object-contain sm:h-5 sm:w-auto"
                  />
                  <h3 className="!font-orbitron hidden min-[380px]:block">
                    interstate
                  </h3>
                </Link>
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-white/10"
                style={{ color: AX.text }}
                aria-label="Close menu"
              >
                <FaTimes size={20} />
              </button>
            </div>
            <nav className="flex flex-1 flex-col overflow-y-auto py-2">
              {navLinks.map((link) => {
                const isActive =
                  router.pathname === link.href ||
                  (link.name === "Trenches" &&
                    router.pathname.startsWith("/trade/")) ||
                  (link.name === "Airdrop" &&
                    (router.pathname === "/airdrop-genesis" ||
                      router.pathname === "/referrals"));
                return (
                  <Link
                    key={link.name}
                    href={chainAwareHref(link.href)}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center rounded-none px-4 py-3 text-base font-medium transition-colors"
                    style={{
                      color: isActive ? AX.mint : AX.text,
                      backgroundColor: isActive
                        ? "rgba(24, 196, 140, 0.1)"
                        : "transparent",
                      borderLeft: isActive
                        ? "3px solid #18c48c"
                        : "3px solid transparent",
                    }}
                  >
                    {link.name}
                  </Link>
                );
              })}
            </nav>
            <div
              className="flex flex-shrink-0 flex-col gap-2 border-t p-4"
              style={{ borderColor: AX.border }}
            >
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  openSearch();
                }}
                className="flex items-center gap-2 rounded-lg px-4 py-3 text-left text-sm font-medium transition-colors"
                style={{
                  color: AX.text,
                  backgroundColor: "rgba(255,255,255,0.06)",
                }}
              >
                <FaSearch size={16} />
                Search
              </button>
              <div className="px-1">
                <BlockchainSwitcher />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Polygon QR Code Modal - Rendered at root level for proper positioning */}
      {showPolygonQR && (
        <div
          className="safe-area-inset fixed inset-0 z-[9999999] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowPolygonQR(false)}
        >
          <div
            className="w-full max-w-xs rounded-xl bg-[#1a1b1f] p-4 shadow-2xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SiPolygon className="h-5 w-5" style={{ color: "#8247E5" }} />
                <span className="text-sm font-semibold text-white">
                  Deposit to Polygon
                </span>
              </div>
              <button
                onClick={() => setShowPolygonQR(false)}
                className="text-neutral-400 transition-colors hover:text-white"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="mb-4 rounded-lg bg-white p-4">
              <QRCode
                value={primaryWalletAddresses?.ethereum || ""}
                size={200}
                style={{ width: "100%", height: "auto" }}
              />
            </div>
            <div className="mb-3 text-center">
              <p className="mb-2 text-xs text-neutral-400">
                Your Polygon Address
              </p>
              <p className="font-mono text-xs break-all text-[#f0f5f5]">
                {primaryWalletAddresses?.ethereum}
              </p>
            </div>
            <button
              onClick={() => {
                handleCopyPolygonAddress();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors"
              style={{ backgroundColor: "#8247E5", color: "#fff" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#7038d4";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#8247E5";
              }}
            >
              {polygonAddressCopied ? (
                <>
                  <BiCheck className="h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <BiCopy className="h-4 w-4" />
                  Copy Address
                </>
              )}
            </button>
            <p className="mt-3 text-center text-[10px] text-amber-400">
              ⚠️ Only send USDC/MATIC on Polygon network
            </p>
          </div>
        </div>
      )}

      <DepositModal
        open={depositOpen}
        onClose={() => setDepositOpen(false)}
        initialTab={depositInitialTab}
        selectedChain={currentChain}
      />
      <WithdrawModal
        isOpen={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
      />
      <PolygonWithdrawModal
        open={showPolygonWithdraw}
        onClose={() => setShowPolygonWithdraw(false)}
        balance={polygonBalance}
        onBalanceUpdate={(updated) => setPolygonBalance(updated)}
      />
      <PolygonSwapModal
        open={showPolygonSwap}
        onClose={() => setShowPolygonSwap(false)}
        balance={polygonBalance}
        authToken={user?.bearerToken}
        onBalanceUpdate={(updated) => setPolygonBalance(updated)}
      />
      <WatchlistModal
        open={watchlistOpen}
        onClose={() => setWatchlistOpen(false)}
      />
      {/* Search Modal */}
      <SearchModal
        open={searchModalOpen}
        onClose={() => closeSearch()}
        selectedTimeframe={selectedTimeframe}
        chain={currentChain}
        onSubmit={(q) => {
          const trimmed = q.trim();
          // If it's likely a token address navigate directly to trade page
          if (trimmed.length >= 10) {
            // Check if it's a Monad address (starts with 0x)
            const isMonadAddress =
              trimmed.startsWith("0x") || trimmed.startsWith("0X");
            // For Monad tokens, use the Monad trade page route
            if (isMonadAddress) {
              router.push(`/trade/monad/${trimmed}`);
            } else {
              router.push(`/trade/${trimmed}`);
            }
            setSearch?.("");
            return;
          }

          // Otherwise treat as name search and stay on Discover
          if (setSearch) {
            setSearch(trimmed);
            if (router.pathname.startsWith("/trade/")) {
              router.push({
                pathname: "/",
                query: trimmed ? { search: trimmed } : {},
              });
              return;
            }

            const nextQuery = { ...router.query };
            if (trimmed) {
              nextQuery.search = trimmed;
            } else {
              delete nextQuery.search;
            }
            router.replace(
              { pathname: router.pathname, query: nextQuery },
              undefined,
              { shallow: true },
            );
            return;
          }

          if (
            router.pathname !== "/" &&
            !router.pathname.startsWith("/trade/")
          ) {
            router.push({ pathname: "/", query: { search: trimmed } });
          } else if (router.pathname === "/") {
            router.replace(
              { pathname: "/", query: { search: trimmed } },
              undefined,
              { shallow: true },
            );
          }
        }}
        onQueryChange={(q) => {
          const trimmed = q.trim();

          // Skip routing updates for short queries (<3 chars)
          if (trimmed.length < 3) {
            if (setSearch) {
              setSearch(trimmed);
              if (!router.pathname.startsWith("/trade/")) {
                const { search: _qSearch, ...restQuery } = router.query;
                router.replace(
                  { pathname: router.pathname, query: restQuery },
                  undefined,
                  { shallow: true },
                );
              }
            } else if (
              router.pathname === "/" &&
              Object.keys(router.query).includes("search")
            ) {
              router.replace({ pathname: "/" }, undefined, { shallow: true });
            }
            return;
          }

          // Live updates for longer queries - only redirect to home if not on a trade page
          if (setSearch) {
            setSearch(trimmed);
            if (router.pathname.startsWith("/trade/")) {
              router.push(
                { pathname: "/", query: { search: trimmed } },
                undefined,
                { shallow: true },
              );
            } else {
              const nextQuery = { ...router.query, search: trimmed };
              router.replace(
                { pathname: router.pathname, query: nextQuery },
                undefined,
                { shallow: true },
              );
            }
            return;
          }

          if (
            router.pathname !== "/" &&
            !router.pathname.startsWith("/trade/")
          ) {
            router.push(
              { pathname: "/", query: { search: trimmed } },
              undefined,
              { shallow: true },
            );
          } else if (router.pathname === "/") {
            router.replace(
              { pathname: "/", query: { search: trimmed } },
              undefined,
              { shallow: true },
            );
          }
        }}
      />
      {/* Updates Modal */}
      {showUpdatesModal && (
        <UpdatesModal
          onClose={() => {
            setShowUpdatesModal(false);
            setIsFirstLogin(false);
          }}
          updates={PLATFORM_UPDATES}
          storageKey={isFirstLogin ? "" : "header-updates-viewed"}
        />
      )}

      {/* Username Edit Modal */}
      <UsernameEditModal
        isOpen={showUsernameModal}
        onClose={() => setShowUsernameModal(false)}
        currentUsername={user?.name || null}
        onSuccess={() => {
          // User context will be refreshed by the modal
        }}
      />
    </>
  );
}
const resolveWatchlistPrice = (token: any) =>
  Number(
    (token?.usd_price ?? token?.price_usd ?? token?.priceUsd ?? token?.price) ||
      0,
  );

const resolveWatchlistChange1h = (token: any) =>
  Number(
    token?.price_percent_change_1h ??
      token?.price_change_1h ??
      token?.price_change ??
      token?.price_percent_change_24h ??
      token?.price_change_24h ??
      0,
  );
