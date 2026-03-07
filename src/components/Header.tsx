import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  FaSearch,
  FaStar,
  FaChevronLeft,
  FaChevronRight,
  FaBell,
  FaChevronDown,
  FaSync,
  FaSortAmountDown,
} from "react-icons/fa";
import { HiLightningBolt } from "react-icons/hi";
import { IoShieldCheckmarkOutline } from "react-icons/io5";
import { SiPolygon } from "react-icons/si";
import { BiCopy, BiCheck } from "react-icons/bi";
import { HiOutlineQrcode } from "react-icons/hi";
import { getPolymarketBalance, autoConvertUsdcToUsdce, type PolymarketBalance, SOL_MINT_ADDRESS } from "~/utils/api";
import QRCode from "react-qr-code";
import { useUser } from "./UserContext";
import { useSolPrice } from "./SolPriceContext";
import { useWatchlist } from "./WatchlistContext";
import { useQuickBuy } from "./QuickBuyContext";
import { useSearch } from "./ui/SearchContext";
import { formatSmartNumber, formatMarketCap } from "../utils/db";
import type { Token } from "../utils/db";

import { executeMonadMultiBuy, formatMonadTxSummary } from "~/utils/monadWalletAllocation";
import { formatMonadError } from "~/utils/monadError";
import { preloadTradeChart } from "~/utils/preloadTradeChart";
import { extractTokenImage, resolveTokenImage, getResolvedTokenImage } from "~/utils/images";
import { broadcastMonadQuickTrade } from "~/utils/monadTradeEvents";
import { broadcastTradeCompleted, notifyTradePending } from "~/utils/tradeEvents";
import { executeSolanaMultiBuy, buildSolanaWalletAllocations } from "~/utils/solanaWalletAllocation";
import { validateSolanaBuy, showTradeValidationError } from "~/utils/preTradeValidation";
import { checkAtaExists } from "~/utils/ataCheck";
import { fetchVerifiedPairAddress } from "~/hooks/useSingleTokenPolling";
import { getPoolTypeFromToken } from "~/utils/poolTypeDetection";
import { mapTradeErrorMessage } from "~/utils/tradeErrorMessages";
import { listenForTradeEvents, transformToastToError } from "~/utils/createSolanaToastHandler";
import { dispatchBalanceRefresh } from "~/utils/balanceEvents";

import Cookies from "js-cookie";
import toast from "react-hot-toast";
import { FaCheckCircle } from "react-icons/fa";
import dynamic from "next/dynamic";
import InterstateButton from "./InterstateButton";
import { FiBarChart, FiChevronDown, FiEdit2, FiStar, FiUsers, FiGrid } from "react-icons/fi";
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
  bg: "#0a0b0d",
  surface: "#0d1015",
  surface2: "#12141a",
  border: "rgba(255,255,255,0.06)",
  text: "#9ca3af",
  muted: "#6b7280",
  mint: "#18c48c",
  mintHover: "#12a877",
  sell: "#FF4D7F",
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

const navLinks = [
  { name: "Trenches", href: "/pulse" },
  { name: "Portfolio", href: "/portfolio" },
  { name: "Trending", href: "/discover" },
  { name: "Trackers", href: "/trackers" },
  { name: "Rewards", href: "/outpost" },
  // { name: "Predictions", href: "/predictions" },
  // { name: "Perpetuals", href: "/construction" },
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

const WatchlistModal = dynamic(() => import("./WatchlistModal"), {
  ssr: false,
});

// Helper function to format very small prices with subscript notation
// For prices < 0.01, displays as $0.0₅77 format (subscript indicates number of zeros)
function formatSmallPrice(price: number): string {
  if (price === 0 || !Number.isFinite(price)) return '0';
  
  const absPrice = Math.abs(price);
  
  // For very small prices (< 0.01), use $0.0₅77 format
  if (absPrice > 0 && absPrice < 0.01) {
    // Convert to string to count zeros after decimal
    const priceStr = absPrice.toFixed(20); // Use enough precision
    const decimalIndex = priceStr.indexOf('.');
    
    if (decimalIndex !== -1) {
      // Find first non-zero digit after decimal
      let zeroCount = 0;
      let significantDigits = '';
      
      for (let i = decimalIndex + 1; i < priceStr.length; i++) {
        if (priceStr[i] === '0') {
          zeroCount++;
        } else {
          // Found first significant digit, get next 2-3 digits
          significantDigits = priceStr.substring(i, Math.min(i + 3, priceStr.length));
          break;
        }
      }
      
      // Convert zero count to subscript
      const subscriptMap: Record<string, string> = {
        '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
        '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉'
      };
      
      const zeroCountStr = zeroCount.toString();
      const subscriptZeros = zeroCountStr.split('').map(char => subscriptMap[char] || char).join('');
      
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
function getWatchlistTokenPriceAndChange(token: Token): { price: number; priceChange: number } {
  const tokenData = token as any;
  
  // Coalesce function similar to TradeHeader - checks multiple fields and returns first valid number
  const coalesceNumber = (...values: any[]): number | null => {
    for (const v of values) {
      if (v === undefined || v === null) continue;
      const n = typeof v === 'string' ? parseFloat(v) : v;
      if (Number.isFinite(n)) return n as number; // Return any finite number (including 0)
    }
    return null;
  };
  
  // Price mapping - check multiple field names
  // Priority: price_usd (Monad pulse endpoints), then usd_price (Birdeye/common), then others
  // Note: displayToken from trade page sets both usd_price and price_usd to the same value
  let price = coalesceNumber(
    tokenData.price_usd,      // Monad pulse endpoints (primary)
    tokenData.usd_price,      // displayToken format / Birdeye (secondary)
    tokenData.chart_live_price_usd, // from TradeHeader hydration
    tokenData.lastPriceUsd,
    tokenData.price,           // Generic fallback
    tokenData.priceUSD,        // Alternative format
    tokenData.priceUsd,        // Alternative format
    tokenData.current_price,   // Some APIs use this
    tokenData.currentPrice,     // Alternative
  ) ?? 0;
  // Legacy fallback to avoid regressions (keeps previous behavior if new fields are missing)
  if (price === 0) {
    price =
      Number(tokenData?.usd_price ?? tokenData?.price ?? tokenData?.price_usd ?? 0) ||
      0;
  }
  
  // Price change mapping - prioritize percentage fields, handle both Birdeye and Monad formats
  // Birdeye format: price24hChangePercent (already percentage)
  // Monad pulse format: price_percent_change_1h, price_change_1h (may need conversion)
  const normalizePercent = (value: any): number | null => {
    if (value === undefined || value === null) return null;
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return Number.isFinite(num) ? num : null;
  };
  
  // Try 1h change first (most relevant for watchlist ticker), then 24h
  // Use coalesceNumber pattern to get first non-null value
  let priceChange = coalesceNumber(
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
        0
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
  const isPredictionsPage = router.pathname.startsWith('/predictions');
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

  // Get referral stats for Honors badge display
  // Cache honorsLevel in localStorage to prevent badge flicker on page load
  const { data: referralStats } = useReferralStats();
  const honorsLevel = useMemo(() => {
    const live = referralStats?.honorsLevel;
    if (live) {
      try { localStorage.setItem('__honors_lvl', String(live)); } catch {}
      return live;
    }
    // Use cached value while API is loading to avoid flicker (default 1 → real level)
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('__honors_lvl');
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
    if (typeof window !== 'undefined') {
      const savedChain = localStorage.getItem('selected-chain');
      if (savedChain === 'sol' || savedChain === 'monad') {
        return savedChain;
      }
    }
    return 'sol';
  })();
  const { solPrice, monPrice } = useSolPrice();
  const chainPrice = currentChain === 'monad' ? monPrice : solPrice;
  const { watchlist, isHydrated, removeFromWatchlist, refreshWatchlistToken } = useWatchlist();
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
    if (typeof window === 'undefined') return [];
    try {
      const cached = localStorage.getItem('cached_pulse_tokens');
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
  const pendingQuickBuyToastRef = useRef<{ id: string; tokenImage: string | null; tokenName: string; fakeTime: string; startTime: number; timerInterval?: NodeJS.Timeout } | null>(null);

  const isMonadToken = (token: any) =>
    typeof token?.mint === "string" && token.mint.startsWith("0x");

  // Helper function to enrich a token with cached pulse data
  const enrichTokenWithCachedData = useCallback((token: Token): Token => {
    const tokenAddress = token.pair_address || (token as any).mint || '';
    if (!tokenAddress || cachedPulseTokens.length === 0) return token;
    
    // Check if price is missing or 0
    const currentPrice = (token as any).price_usd || (token as any).usd_price || (token as any).price || 0;
    if (currentPrice > 0) return token; // Already has price, no need to enrich
    
    // Find matching token in cached pulse tokens
    const cachedToken = cachedPulseTokens.find(t => {
      const cachedAddr = t.pair_address || (t as any).mint || '';
      return cachedAddr === tokenAddress || 
             (cachedAddr && tokenAddress && cachedAddr.toLowerCase() === tokenAddress.toLowerCase());
    });
    
    if (cachedToken) {
      const enrichedPrice = (cachedToken as any).price_usd || (cachedToken as any).usd_price || 0;
      if (enrichedPrice > 0) {
        console.log(`[Watchlist Enrich] Enriched ${token.symbol || tokenAddress} with cached pulse data:`, {
          originalPrice: currentPrice,
          enrichedPrice: enrichedPrice,
          source: 'cached_pulse_tokens'
        });
      }
      
      // Merge cached token data into watchlist token, prioritizing watchlist token's existing fields
      return {
        ...token,
        ...cachedToken,
        // Keep watchlist token's original fields but use cached price if missing
        price_usd: (token as any).price_usd || (cachedToken as any).price_usd || (cachedToken as any).usd_price || 0,
        usd_price: (token as any).usd_price || (cachedToken as any).usd_price || (cachedToken as any).price_usd || 0,
        price_percent_change_1h: (token as any).price_percent_change_1h ?? (cachedToken as any).price_percent_change_1h ?? (cachedToken as any).price_change_1h ?? 0,
        price_change_1h: (token as any).price_change_1h ?? (cachedToken as any).price_change_1h ?? (cachedToken as any).price_percent_change_1h ?? 0,
      } as Token;
    }
    
    return token;
  }, [cachedPulseTokens]);

  // Track which tokens we've already tried to refresh to avoid duplicate API calls
  const refreshedTokensRef = useRef<Set<string>>(new Set());
  
  // Refresh Monad tokens in watchlist that still lack price/change by hitting token service
  // Only refresh tokens that haven't been refreshed yet and don't have price data
  useEffect(() => {
    // Skip if we've already processed all tokens
    const tokensToRefresh = watchlist.filter(token => {
      if (!isMonadToken(token)) return false;
      const { price } = getWatchlistTokenPriceAndChange(token);
      if (price && price > 0) return false; // Already has price
      const key = (token as any).mint || token.pair_address || '';
      if (!key) return false;
      if (refreshedTokensRef.current.has(key)) return false; // Already tried to refresh
      return true;
    });
    
    if (tokensToRefresh.length === 0) return;
    
    // Refresh tokens one at a time with a small delay to avoid overwhelming the API
    (async () => {
      for (const token of tokensToRefresh) {
        const key = (token as any).mint || token.pair_address || '';
        if (!key) continue;
        
        // Mark as attempted before making the call
        refreshedTokensRef.current.add(key);
        
        try {
          await refreshWatchlistToken(key);
          // Small delay between calls to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
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
      const tokenId = token.pair_address || (token as any).mint || '';
      if (!tokenId || seenIds.has(tokenId)) return false;

      // Deduplicate by symbol/name — no two tokens with the same display name
      const displayName = (token.symbol || token.name || '').toLowerCase().trim();
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
    watchlistTickerPage * WATCHLIST_TICKER_PAGE_SIZE + WATCHLIST_TICKER_PAGE_SIZE,
  );

  // Clamp ticker page when watchlist size changes
  useEffect(() => {
    setWatchlistTickerPage((p) =>
      Math.min(p, Math.max(0, watchlistTickerTotalPages - 1)),
    );
  }, [watchlistTickerTotalPages]);
  
  // Load quickBuyAmount from localStorage
  const getQuickBuyAmount = (): number => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('quickBuyAmount');
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
    window.addEventListener('storage', handleStorageChange);
    // Also check periodically for same-window localStorage updates
    const interval = setInterval(handleStorageChange, 1000);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);
  
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
      console.error('Failed to refresh balance:', error);
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
    monad: "https://i0.wp.com/www.gizmotimes.com/wp-content/uploads/2023/10/Monad-Logo.png?fit=1920%2C1080&ssl=1",
    eth: "/solana.png", // Fallback to Solana for now
    bnb: "/solana.png", // Fallback to Solana for now
    base: "/solana.png", // Fallback to Solana for now
  };
  
  // Use chainBalances from UserContext as the single source of truth
  // Derive chainBalance from chainBalances instead of maintaining separate state
  const chainBalance = chainBalances[currentChain] ?? (currentChain === "sol" ? solBalance : 0);

  // Polygon balance state for predictions pages
  const [polygonBalance, setPolygonBalance] = useState<PolymarketBalance | null>(null);
  const [polygonBalanceLoading, setPolygonBalanceLoading] = useState(false);
  const [polygonAddressCopied, setPolygonAddressCopied] = useState(false);
  const [polygonConverting, setPolygonConverting] = useState(false);
  const [polygonConvertSuccess, setPolygonConvertSuccess] = useState(false);
  const [showPolygonQR, setShowPolygonQR] = useState(false);

  // Copy Polygon address handler
  const handleCopyPolygonAddress = useCallback(() => {
    const address = primaryWalletAddresses?.ethereum;
    if (address) {
      navigator.clipboard.writeText(address);
      setPolygonAddressCopied(true);
      toast.success('Address copied successfully', {
        icon: <BiCheck className="w-5 h-5 text-emerald-400" />,
        style: {
          background: '#1a1b1f',
          color: '#f0f5f5',
          border: '1px solid #8247E5',
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
      console.error('[Header] Error converting USDC:', err);
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
        }
      } catch (err) {
        console.error('[Header] Error fetching Polygon balance:', err);
      } finally {
        setPolygonBalanceLoading(false);
      }
    };

    fetchPolygonBalance();

    // Refresh every 30 seconds when on predictions page
    const interval = setInterval(fetchPolygonBalance, 30000);

    // Listen for custom event to refresh balance (e.g., after a trade)
    const handleBalanceRefresh = () => {
      console.log('[Header] Received polygon-balance-refresh event');
      fetchPolygonBalance();
    };
    window.addEventListener('polygon-balance-refresh', handleBalanceRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener('polygon-balance-refresh', handleBalanceRefresh);
    };
  }, [isPredictionsPage, user?.bearerToken]);

  const chainAwareHref = useCallback(
    (href: string) => ({
      pathname: href,
      query: { chain: currentChain },
    }),
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

  const processClipboardValue = useCallback(
    async (rawValue: string) => {
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
          const hydrateResponse = await fetch('/api/token-service/hydrate-pair', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        const results = searchData?.tokens || searchData?.results || searchData?.filterTokens?.results || [];
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
          pair_address: pairAddress || token.pair_address || '',
          name: tokenName || token.name || 'Unknown Token',
          symbol: token.symbol || token.ticker || tokenName || '',
          launchpad_protocol: token.launchpad_protocol || token.launchpadProtocol || '',
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
    },
    [],
  );

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
        navigator.clipboard.readText().then(text => {
          if (text) processClipboardValue(text);
        }).catch(() => {});
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
      const isMonadAddress = clipboardToken.address.startsWith('0x') || clipboardToken.address.startsWith('0X');
      const td = clipboardToken.tokenData;

      // Preload chart data (OHLC, WS, image, route) before navigation
      if (td) {
        preloadTradeChart({
          mint: (td as any)?.mint || clipboardToken.address,
          pairAddress: td.pair_address,
          chain: isMonadAddress ? 'monad' : 'sol',
          name: td.name,
          symbol: td.symbol,
          marketCapUsd: td.market_cap_usd,
          image: clipboardToken.imageUrl || extractTokenImage(td as any) || '',
          launchpadProtocol: (td as any)?.launchpad_protocol,
        }, { router });
      }

      if (isMonadAddress) {
        // Build full query params for Monad (same pattern as Solana path)
        const queryParams = new URLSearchParams({
          _name: td?.name || td?.symbol || clipboardToken.name || '',
          _symbol: td?.symbol || '',
          _mcap: String(td?.market_cap_usd || ''),
          _image: clipboardToken.imageUrl || extractTokenImage(td as any) || '',
          _mint: (td as any)?.mint || clipboardToken.address,
          _launchpad_protocol: (td as any)?.launchpad_protocol || '',
          _created_at: (td as any)?.created_at || '',
          chain: 'monad',
          mode: 'buy',
          tab: 'market',
          timeRange: '5m',
          sliderPct: '0',
        }).toString();
        router.push(`/trade/monad/${clipboardToken.address}?${queryParams}`);
      } else {
        // Build full query params matching PulseTable navigation pattern
        const pathAddress = (td as any)?.mint || td?.pair_address || clipboardToken.address;
        const queryParams = new URLSearchParams({
          _name: td?.name || td?.symbol || clipboardToken.name || '',
          _symbol: td?.symbol || '',
          _mcap: String(td?.market_cap_usd || ''),
          _image: clipboardToken.imageUrl || extractTokenImage(td as any) || '',
          _mint: (td as any)?.mint || clipboardToken.address,
          _launchpad_protocol: (td as any)?.launchpad_protocol || '',
          _created_at: (td as any)?.created_at || '',
          chain: 'sol',
          mode: 'buy',
          tab: 'market',
          timeRange: '5m',
          sliderPct: '0',
        }).toString();
        router.push(`/trade/${pathAddress}?${queryParams}`);
      }
    } else {
      // Fallback: try to read clipboard if no token detected
      try {
        const text = await navigator.clipboard.readText();
        const trimmed = text.trim();
        const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed);

        if (isSolanaAddress) {
          router.push(`/trade/${trimmed}?chain=sol`);
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
  const getMonadLaunchpad = (token: Token): 'nadfun' | 'flapsh-simple' | 'flapsh-devs' => {
    const protocol = (token as any)?.launchpad_protocol?.toLowerCase() || '';
    
    if (protocol.includes('nad.fun') || protocol.includes('nadfun')) {
      return 'nadfun';
    } else if (protocol.includes('flap.sh') || protocol.includes('flapsh')) {
      if (protocol.includes('dev')) {
        return 'flapsh-devs';
      }
      return 'flapsh-simple';
    }
    
    return 'nadfun';
  };

  // Handler for watchlist ticker quick buy
  const handleWatchlistQuickBuy = async (token: Token) => {
    console.log("🎯 Clipboard/Watchlist Quick Buy:", token.symbol, (token as any).mint, "amount:", quickBuyAmount);
    // Validation checks with user feedback
    if (!user?.bearerToken || !user?.id) {
      toast.error("Please log in to trade", {
        duration: 3000,
        style: { background: "#1E1F26", color: "#E6E7EA", border: "1px solid #ff6b6b" },
      });
      return;
    }
    
    if (!quickBuyAmount || quickBuyAmount <= 0) {
      const currency = currentChain === 'monad' ? 'MON' : 'SOL';
      toast.error(`Set a buy amount first (use the preset buttons)`, {
        duration: 3000,
        style: { background: "#1E1F26", color: "#E6E7EA", border: "1px solid #ff6b6b" },
      });
      return;
    }
    
    // For Monad chain, use Monad-specific quick buy logic (same as MonadTable)
    if (currentChain === 'monad') {
      if (!token.mint) {
        toast.error("Invalid token - missing mint address", {
          duration: 3000,
          style: { background: "#1E1F26", color: "#E6E7EA", border: "1px solid #ff6b6b" },
        });
        return;
      }

      const preset = presets[activePreset];
      const settings = (preset?.quickBuySettings || {}) as any;
      const launchpad = getMonadLaunchpad(token);
      const tokenAddress = token.mint;
      const slippage = settings?.maxSlippage ? settings.maxSlippage * 100 : 15;
      const gasPrice = settings?.gasPrice !== undefined && settings.gasPrice > 0 ? settings.gasPrice : undefined;

      // Get token image and name
      const tokenImage = token ? extractTokenImage(token as any) : null;
      const tokenName = token?.name || token?.symbol || '';
      
      const toastId = toast.loading('Placing trade...', { duration: Infinity });
      
      try {
        notifyTradePending({ tokenAddress, tradeType: 'buy', chain: 'monad' });
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
              console.warn('Failed to refresh balance:', err);
            });
          }, 1000);
          broadcastMonadQuickTrade(tokenAddress, 'buy');
          toast.success(summary.message, { id: toastId, duration: 6000 });
          return { success: true, txHash: txHashes[0] };
        }
        toast.error('Trade failed', { id: toastId, duration: 6000 });
        return { success: false, error: 'Trade failed' };
      } catch (error: any) {
        console.error('❌ Header Watchlist Quick Buy failed:', error);
        const errorMessage = formatMonadError(error?.message || error?.error);
        toast.error(errorMessage, { id: toastId, duration: 6000 });
        return { success: false, error: errorMessage };
      }
    }
    
    // For Solana chain — same path as PulseTable handleQuickBuy
    const preset = presets[activePreset];
    if (!preset) {
      toast.error("Quick buy preset not configured. Update your settings in the footer.", {
        duration: 3000,
        style: { background: "#1E1F26", color: "#E6E7EA", border: "1px solid #ff6b6b" },
      });
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
    const tokenMint = (token as any).mint || '';
    if (!tokenMint) {
      toast.error("Token mint address not found", {
        duration: 3000,
        style: { background: "#1E1F26", color: "#E6E7EA", border: "1px solid #ff6b6b" },
      });
      return;
    }
    const ataExists = await checkAtaExists(tokenMint, user?.publicKey).catch(() => null);
    const validation = validateSolanaBuy(quickBuyAmount, allocations, walletBalances || {}, walletList || [], selectedWalletIds?.sol || [], settings.priority, settings.bribe, ataExists);
    if (!validation.valid) {
      showTradeValidationError(validation.error, getResolvedTokenImage(token), token.symbol || token.name || 'Token');
      return;
    }

    // Verify pair address
    let poolAddress = (token as any).migrated_pool_address || token.pair_address || "";
    if (tokenMint) {
      const verifiedPairAddress = await fetchVerifiedPairAddress(tokenMint);
      if (verifiedPairAddress) {
        poolAddress = verifiedPairAddress;
      }
    }

    // Animated toast with timer (same as PulseTable)
    const timerCap = 0.4 + Math.random() * 0.2;
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
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
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
              style={{ display: timerFinished && !tradeErrored ? "inline" : "none" }}
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
              linkEl.className = "text-xs text-blue-400 font-medium flex-shrink-0";
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
        if (checkEl.style.display !== "inline") checkEl.style.display = "inline";
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

    const cleanupTradeListener = listenForTradeEvents(tokenMint, uniqueToastId, (v) => { tradeErrored = v; }, 'solana');

    try {
      const baseMint = tokenMint;
      const quoteMint = SOL_MINT_ADDRESS;

      notifyTradePending({ tokenAddress: baseMint, tradeType: 'buy', chain: 'sol' });
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
        imageUrl: await resolveTokenImage(token) || undefined,
        authToken: user.bearerToken,
        walletList: walletList || [],
        walletBalances: walletBalances || {},
        selectedWalletIds: selectedWalletIds?.sol || [],
        onTxHash: ({ txHash }) => {
          if (pendingSolanaQuickBuyToastRef.current?.id === uniqueToastId && txHash) {
            const linkEl = document.getElementById(`link-${uniqueToastId}`);
            if (linkEl) {
              const explorerUrl = `https://solscan.io/tx/${txHash}`;
              linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4" alt="Solana" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
              linkEl.className = "";
            }
            // Fire early so Portfolio refetches immediately when Solscan link appears
            broadcastTradeCompleted({ tokenAddress: baseMint, tradeType: 'buy', chain: 'sol', txHash, tokenName: token.name, tokenSymbol: token.symbol, imageUrl: tokenImage, solAmountSpent: quickBuyAmount });
          }
        },
      });

      const firstTxHash =
        multiResult?.results?.find((r: any) => (r.result as any)?.hash || (r.result as any)?.txid)?.result?.hash ||
        multiResult?.results?.find((r: any) => (r.result as any)?.hash || (r.result as any)?.txid)?.result?.txid;

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

      console.log("✅ Header Quick Buy successful");

      if (typeof window !== "undefined" && tokenMint) {
        window.dispatchEvent(
          new CustomEvent("solanaQuickTrade", {
            detail: { tokenAddress: tokenMint },
          }),
        );
      }
      dispatchBalanceRefresh('sol');
    } catch (error: any) {
      tradeErrored = true;
      cleanupTradeListener();
      if (timerHandle) cancelAnimationFrame(timerHandle);

      console.error("❌ Header Quick Buy failed:", error);
      if (pendingSolanaQuickBuyToastRef.current) {
        transformToastToError(pendingSolanaQuickBuyToastRef.current.id, mapTradeErrorMessage(error), tokenImage, tokenName);
        pendingSolanaQuickBuyToastRef.current = null;
      }
    }
  };

  // Clipboard quick buy state and handler
  const [isClipboardBuying, setIsClipboardBuying] = useState(false);
  const [clipboardAmountStr, setClipboardAmountStr] = useState(String(quickBuyAmount));
  const clipboardInputFocusedRef = useRef(false);
  const [isEditingClipboardAmount, setIsEditingClipboardAmount] = useState(false);
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
      toast.error(`Quick buy failed: ${(error as any)?.message || 'Unknown error'}`, {
        duration: 4000,
        style: { background: "#1E1F26", color: "#E6E7EA", border: "1px solid #ff6b6b" },
      });
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

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      ) {
        setProfileMenuOpen(false);
      }
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
        className={`${isSticky ? "sticky top-0 z-20" : "relative z-10"} w-full backdrop-blur-sm bg-[#0a0b0d]`}
      >
        <div
          className="flex max-w-full items-center justify-between px-3 py-2 md:px-4"
          style={{ backgroundColor: "#0a0b0d" }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden md:gap-3">
            <Link
              href={chainAwareHref("/pulse")}
              className="flex flex-shrink-0 items-center gap-1 tracking-tight select-none"
              style={{ color: AX.text }}
              title="Go to Trenches"
            >
              <img
                src="/interstate/logo.png"
                alt="Interstate logo"
                className="w-5 h-auto"
              />
              <h3 className="!font-orbitron">interstate</h3>
            </Link>

            {/* Navigation container with arrows */}
            <div className="relative flex flex-1 items-center gap-1 overflow-hidden">
              {/* Left arrow */}
              {showLeftArrow && (
                <button
                  onClick={scrollLeft}
                  className="z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center transition-all duration-300 ease-out"
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
                className="scrollbar-hide flex flex-1 items-center gap-1 overflow-x-auto sm:gap-2 xl:gap-3"
                style={{ position: "relative", zIndex: 1000 }}
              >
                {navLinks.map((link) => {
                  const isActive =
                    router.pathname === link.href ||
                    (link.name === "Trenches" &&
                      router.pathname.startsWith("/trade/")) ||
                    (link.name === "Rewards" &&
                      (router.pathname === "/outpost" || router.pathname === "/referrals"));
                  return (
                    <Link
                      key={link.name}
                      href={chainAwareHref(link.href)}
                      className={`flex-shrink-0 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap sm:px-3 sm:text-sm`}
                      style={{
                        color: isActive ? "#18c48c" : "#9ca3af",
                        backgroundColor: isActive
                          ? "rgba(24, 196, 140, 0.1)"
                          : "transparent",
                        position: "relative",
                        zIndex: 1001,
                        pointerEvents: "auto",
                        cursor: "pointer",
                        transition: "all 150ms ease-out",
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.color = "#18c48c";
                          e.currentTarget.style.backgroundColor = "rgba(24, 196, 140, 0.08)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.color = "#9ca3af";
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
                  className="z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center transition-all duration-300 ease-out"
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
          <div className="flex min-w-0 flex-shrink-0 items-center gap-1.5 sm:gap-2 md:gap-3 lg:gap-4">
            {/* Morphing Arena Navigation - commented out, Arena now in main nav
            <MorphingArenaNav />
            */}

            {showSearch && (
              <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2">
                {/* Clipboard token split-button: navigate (left) + quick buy (right) */}
                {clipboardToken && (
                  <div className="flex h-8 flex-shrink-0 items-center">
                    {/* Left half — navigate to trade page */}
                    <button
                      onClick={handlePasteCA}
                      className="relative flex h-8 cursor-pointer items-center gap-1 rounded-l-md border border-r-0 px-1.5 transition-all duration-200 ease-out sm:gap-1.5 sm:px-2"
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
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div
                          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded sm:h-6 sm:w-6"
                          style={{ background: 'linear-gradient(to bottom right, #1f2937, #000000)' }}
                        >
                          <span className="text-[10px] font-bold text-white select-none">
                            {(clipboardToken.name || '?')[0]?.toUpperCase()}
                          </span>
                        </div>
                      )}
                      <span className="hidden max-w-[60px] truncate text-[11px] font-medium text-white sm:inline">
                        {clipboardToken.name}
                      </span>
                      <IoShieldCheckmarkOutline
                        size={12}
                        style={{
                          color: clipboardToken.isPumpToken ? "#31e3ac" : "#eab308",
                        }}
                      />
                    </button>
                    {/* Right half — lightning buy + amount display/edit */}
                    <div
                      className="flex h-8 items-center rounded-r-md border transition-all duration-200 ease-out"
                      style={{
                        backgroundColor: '#13151b',
                        borderColor: AX.border,
                        borderLeft: '1px solid rgba(255,255,255,0.08)',
                        opacity: (!clipboardToken.tokenData || (Number(clipboardAmountStr) || 0) <= 0) ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#1a1c23';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#13151b';
                      }}
                    >
                      {isEditingClipboardAmount ? (
                        <>
                          {/* Lightning icon — still buys in edit mode */}
                          <button
                            onClick={handleClipboardQuickBuy}
                            disabled={!clipboardToken.tokenData || isClipboardBuying}
                            className="flex h-full cursor-pointer items-center pl-1.5 sm:pl-2"
                          >
                            <HiLightningBolt
                              size={12}
                              className={isClipboardBuying ? 'animate-pulse' : ''}
                              style={{ color: '#85d99f' }}
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
                              if (v === '' || /^\d*\.?\d*$/.test(v)) {
                                setClipboardAmountStr(v);
                                const num = parseFloat(v);
                                if (!isNaN(num) && num >= 0) {
                                  setQuickBuyAmount(num);
                                  localStorage.setItem('quickBuyAmount', num.toString());
                                }
                              }
                            }}
                            onFocus={() => { clipboardInputFocusedRef.current = true; }}
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
                              if (e.key === 'Enter') {
                                const num = parseFloat(clipboardAmountStr);
                                if (!isNaN(num) && num >= 0) {
                                  setQuickBuyAmount(num);
                                  setClipboardAmountStr(String(num));
                                }
                                setIsEditingClipboardAmount(false);
                                handleClipboardQuickBuy();
                              } else if (e.key === 'Escape') {
                                setClipboardAmountStr(String(quickBuyAmount));
                                setIsEditingClipboardAmount(false);
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-[32px] bg-transparent text-center text-[10px] font-medium outline-none"
                            style={{ color: '#85d99f' }}
                          />
                          {/* Currency label */}
                          <span
                            className="pr-1.5 text-[10px] font-medium sm:pr-2"
                            style={{ color: '#85d99f', opacity: 0.6 }}
                          >
                            {currentChain === 'monad' ? 'MON' : 'SOL'}
                          </span>
                        </>
                      ) : (
                        <>
                          {/* Big buy button: lightning + amount + SOL — entire area is clickable to buy */}
                          <button
                            onClick={handleClipboardQuickBuy}
                            disabled={!clipboardToken.tokenData || isClipboardBuying}
                            className="flex h-full cursor-pointer items-center gap-0.5 pl-1.5 pr-1.5 sm:pl-2 sm:pr-2"
                          >
                            <HiLightningBolt
                              size={12}
                              className={isClipboardBuying ? 'animate-pulse' : ''}
                              style={{ color: '#85d99f' }}
                            />
                            <span className="text-[10px] font-medium" style={{ color: '#85d99f' }}>
                              {quickBuyAmount}
                            </span>
                            <span className="text-[10px] font-medium" style={{ color: '#85d99f', opacity: 0.6 }}>
                              {currentChain === 'monad' ? 'MON' : 'SOL'}
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
                              if (parent) parent.style.backgroundColor = '#13151b';
                              e.currentTarget.style.backgroundColor = 'rgba(133,217,159,0.1)';
                              const icon = e.currentTarget.querySelector('svg') as SVGElement | null;
                              if (icon) { icon.style.opacity = '1'; icon.style.transform = 'scale(1.15)'; }
                            }}
                            onMouseLeave={(e) => {
                              // Restore parent hover since cursor is still inside the container
                              const parent = e.currentTarget.parentElement;
                              if (parent) parent.style.backgroundColor = '#1a1c23';
                              e.currentTarget.style.backgroundColor = 'transparent';
                              const icon = e.currentTarget.querySelector('svg') as SVGElement | null;
                              if (icon) { icon.style.opacity = '0.45'; icon.style.transform = 'scale(1)'; }
                            }}
                            className="flex h-full cursor-pointer items-center rounded-r-md border-l pl-1.5 pr-1.5 transition-colors duration-150 sm:pr-2"
                            style={{ borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'transparent' }}
                          >
                            <FiEdit2 size={9} style={{ color: '#85d99f', opacity: 0.45, transition: 'opacity 0.15s, transform 0.15s' }} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Search button (desktop) - squarish pill */}
                <button
                  onClick={() => openSearch()}
                  className="hidden h-8 cursor-pointer items-center gap-2 rounded-md border px-3 transition-all duration-200 ease-out lg:flex"
                  style={{
                    backgroundColor: "rgba(13, 16, 21, 0.8)",
                    borderColor: AX.border,
                    color: AX.muted,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.06)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(13, 16, 21, 0.8)";
                  }}
                >
                  <FaSearch size={11} />
                  <span className="text-xs whitespace-nowrap text-neutral-500">
                    Search
                  </span>
                  <span className="ml-2 rounded border border-neutral-700/60 bg-neutral-800/60 px-1.5 py-0.5 text-[10px] leading-none text-neutral-400">
                    /
                  </span>
                </button>

                {/* Compact icon-only trigger on mobile/tablet */}
                <button
                  onClick={() => openSearch()}
                  className="flex h-8 w-8 cursor-pointer flex-shrink-0 items-center justify-center rounded-md border transition-all duration-200 ease-out lg:hidden"
                  style={{
                    backgroundColor: "rgba(13, 16, 21, 0.8)",
                    borderColor: AX.border,
                    color: AX.muted,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.06)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(13, 16, 21, 0.8)";
                  }}
                >
                  <FaSearch size={12} />
                </button>

                {/* Blockchain Switcher - Right of search bar */}
                <BlockchainSwitcher />
              </div>
            )}

            {/* Notifications Button */}
            <div ref={notificationsRef} className="relative">
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="flex h-8 w-8 cursor-pointer flex-shrink-0 items-center justify-center rounded-md border transition-all duration-200 ease-out"
                style={{
                  color: AX.muted,
                  borderColor: AX.border,
                  backgroundColor: "rgba(13, 16, 21, 0.8)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.06)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(13, 16, 21, 0.8)";
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
              <div ref={profileMenuRef} className="relative z-[1000000]">
                {/* Combined Balance + Username Button */}
                <button
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                  className="group/account flex h-8 cursor-pointer flex-row items-center justify-center gap-1.5 rounded-md border px-2 transition-all duration-200 ease-out sm:gap-2 sm:px-2.5"
                  style={{
                    borderColor: AX.border,
                    color: AX.text,
                    backgroundColor: "rgba(13, 16, 21, 0.8)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.06)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(13, 16, 21, 0.8)";
                  }}
                  title="Click to view account & wallet"
                >
                  <div
                    className="hidden h-6 w-6 select-none sm:flex bg-contain bg-center bg-no-repeat"
                    style={{ backgroundImage: `url(/ranks/degen-${Math.max(1, Math.min(4, honorsLevel))}.png)` }}
                    role="img"
                    aria-label={`Honors ${honorsLevel}`}
                  />
                  <div className="flex items-center gap-1.5 text-left">
                    <div className="flex items-center gap-1 text-xs font-medium text-white sm:text-sm">
                      {isPredictionsPage ? (
                        <>
                          <SiPolygon size={10} className="text-[#8247E5]" />
                          <span>
                            {polygonBalanceLoading ? '...' :
                              `$${formatBalance(polygonBalance?.usdc ?? 0, 2)}`}
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
                    className={`cursor-pointer ${isRefreshingBalance ? 'animate-spin text-[#18c48c]' : 'text-neutral-500 hover:text-neutral-300'}`}
                    onClick={(e) => { e.stopPropagation(); handleManualBalanceRefresh(e); }}
                    title="Refresh balance"
                  />
                  <FiChevronDown
                    className="text-neutral-500"
                    size={12}
                  />
                </button>
                {/* Combined Dropdown */}
                {profileMenuOpen && (
                  <div
                    className="absolute top-9 right-0 z-[1000001] rounded-lg border border-[#20232b] bg-[#0a0b10] shadow-2xl"
                    style={{
                      width: "280px",
                      minWidth: "280px",
                      maxWidth: "280px",
                    }}
                  >
                    <div className="p-4">
                      {/* User Info Header */}
                      <div
                        className="mb-3 flex items-center gap-2 border-b pb-3"
                        style={{ borderColor: "#20232b" }}
                      >
                        <div
                          className="flex h-6 w-6 select-none bg-contain bg-center bg-no-repeat"
                          style={{ backgroundImage: `url(/ranks/degen-${Math.max(1, Math.min(4, honorsLevel))}.png)` }}
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
                            <div className="flex items-center gap-3 mt-1 text-xs text-neutral-400">
                              <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                                ${formatBalance(polygonBalance?.usdcBridged ?? 0, 2)} USDC.e
                              </span>
                              <span className="flex items-center gap-1">
                                <SiPolygon className="w-3 h-3" style={{ color: '#8247E5' }} />
                                {formatBalance(polygonBalance?.matic ?? 0, 2)} MATIC
                              </span>
                            </div>
                          </div>

                          {/* Compact Address Row */}
                          <div className="flex items-center justify-between rounded-lg bg-[#1a1b1f] px-3 py-2 mb-3">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="text-xs font-mono text-neutral-400 truncate">
                                {primaryWalletAddresses?.ethereum ?
                                  `${primaryWalletAddresses.ethereum.slice(0, 6)}...${primaryWalletAddresses.ethereum.slice(-4)}` :
                                  'Not connected'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={handleCopyPolygonAddress}
                                className="p-1.5 rounded hover:bg-white/10 transition-colors"
                                title="Copy address"
                              >
                                {polygonAddressCopied ?
                                  <BiCheck className="w-4 h-4 text-emerald-400" /> :
                                  <BiCopy className="w-4 h-4 text-neutral-400 hover:text-white" />}
                              </button>
                              <a
                                href={`https://polygonscan.com/address/${primaryWalletAddresses?.ethereum}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded hover:bg-white/10 transition-colors"
                                title="View on Polygonscan"
                              >
                                <img
                                  src="https://polygonscan.com/assets/poly/images/svg/logos/chain-dim.svg?v=26.1.4.2"
                                  alt="Polygonscan"
                                  className="w-4 h-4"
                                />
                              </a>
                            </div>
                          </div>

                          {/* Convert button if needed */}
                          {(polygonBalance?.usdcNative ?? 0) >= 0.1 && (
                            <button
                              onClick={handleConvertUsdcToUsdce}
                              disabled={polygonConverting}
                              className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 mb-3 text-xs font-medium transition-all"
                              style={{
                                backgroundColor: polygonConvertSuccess ? 'rgba(74, 222, 128, 0.15)' : 'rgba(251, 191, 36, 0.15)',
                                color: polygonConvertSuccess ? '#4ADE80' : '#FBBF24',
                                opacity: polygonConverting ? 0.7 : 1,
                              }}
                            >
                              {polygonConverting ? (
                                <><FaSync className="w-3 h-3 animate-spin" />Converting...</>
                              ) : polygonConvertSuccess ? (
                                <><BiCheck className="w-4 h-4" />Converted!</>
                              ) : (
                                <>Convert ${formatBalance(polygonBalance?.usdcNative ?? 0, 2)} USDC → USDC.e</>
                              )}
                            </button>
                          )}
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
                                src={chainLogos[currentChain] ?? chainLogos.monad}
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
                                src={chainLogos[currentChain] ?? chainLogos.monad}
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
                        <div>
                          {/* Deposit Button - Opens QR - Full Width */}
                          <button
                            onClick={() => setShowPolygonQR(true)}
                            className="w-full flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-all"
                            style={{ backgroundColor: '#8247E5', color: '#fff' }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#7038d4'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#8247E5'; }}
                          >
                            <HiOutlineQrcode className="w-4 h-4" />
                            Deposit
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
                                e.currentTarget.style.backgroundColor = AX.mint;
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
                                e.currentTarget.style.backgroundColor = "#1A1B1F";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "#0f1012";
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
                                e.currentTarget.style.backgroundColor = "#1A1B1F";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "#0f1012";
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
                                e.currentTarget.style.backgroundColor = "#1A1B1F";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "#0f1012";
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
                  </div>
                )}
              </div>
            ) : (
              !userLoading && (
                <button
                  className="ml-0.5 flex-shrink-0 rounded-md border-none px-2.5 py-1.5 text-sm font-medium text-black transition-all duration-300 ease-out sm:ml-1 md:ml-1.5 md:px-3 lg:ml-2"
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
          <div className="flex items-center gap-2 px-1 py-0.5 overflow-hidden" style={{ background: '#0a0b0e' }}>
          <div className="flex items-center gap-2 flex-1 min-w-0 rounded-md px-3 py-1 overflow-hidden" style={{ background: '#13151b' }}>
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
              className="flex items-center gap-1.5 cursor-pointer rounded-md px-2.5 py-1 shrink-0"
              style={{ color: '#c5cdd8' }}
              onClick={() => setWatchlistOpen(true)}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <span className="text-xs font-medium">Watchlist</span>
              <FaSortAmountDown size={10} style={{ color: '#8b94a5' }} />
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
              <div className="h-4 border-r" style={{ borderColor: '#262a35' }} />
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
              className="flex-1 flex items-center gap-3 overflow-x-auto scrollbar-hide pl-1 pr-3"
              style={{
                minWidth: 0, // Allow flex item to shrink below content size for proper scrolling
                scrollbarWidth: 'none', // Firefox
                msOverflowStyle: 'none', // IE/Edge
              }}
            >
            {enrichedWatchlist.map((token, index) => {
              const tokenKey = token.pair_address || (token as any).mint || token.symbol;
              const tokenAddress = (token as any).mint || token.pair_address || '';
              const actualMint = (token as any).mint || token.pair_address || '';
              // Use helper function to get correctly mapped price and price change
              const { price, priceChange } = getWatchlistTokenPriceAndChange(token);
              const marketCap =
                (token as any).market_cap_usd ??
                (token as any).marketCapUSD ??
                (token as any).fully_diluted_value ??
                0;

              const rawImg = extractTokenImage(token as any);
              
              return (
                <div
                  key={tokenKey}
                  className="flex items-center gap-1.5 cursor-pointer transition-all duration-200 shrink-0 px-2.5 py-1 rounded-lg hover:bg-white/[0.07]"
                  onMouseEnter={() => {
                    // Prefetch OHLC + route + metadata + trades on hover
                    const isMonadToken = actualMint.startsWith('0x') || actualMint.startsWith('0X');
                    // Build tradeUrl matching the onClick navigation exactly
                    const hoverQueryParams = new URLSearchParams();
                    if (token.name) hoverQueryParams.set('_name', token.name);
                    if (token.symbol) hoverQueryParams.set('_symbol', token.symbol);
                    if (price > 0) hoverQueryParams.set('_price', price.toString());
                    if (token.market_cap_usd || (token as any).fully_diluted_value) {
                      hoverQueryParams.set('_mcap', ((token.market_cap_usd || (token as any).fully_diluted_value || 0)).toString());
                    }
                    const hoverImageUrl = extractTokenImage(token as any) || '';
                    if (hoverImageUrl) hoverQueryParams.set('_image', hoverImageUrl);
                    hoverQueryParams.set('_mint', tokenAddress);
                    if ((token as any).launchpad_protocol) hoverQueryParams.set('_launchpad_protocol', (token as any).launchpad_protocol);
                    hoverQueryParams.set('chain', isMonadToken ? 'monad' : 'sol');
                    const hoverTradeUrl = isMonadToken
                      ? `/trade/monad/${tokenAddress}?${hoverQueryParams.toString()}`
                      : `/trade/${tokenAddress}?${hoverQueryParams.toString()}`;
                    preloadTradeChart(
                      {
                        mint: actualMint,
                        pairAddress: token.pair_address || (token as any).mint,
                        chain: isMonadToken ? 'monad' : 'sol',
                        name: token.name,
                        symbol: token.symbol,
                        priceUsd: price,
                        marketCapUsd: token.market_cap_usd || (token as any).fully_diluted_value,
                        image: rawImg || '',
                        launchpadProtocol: (token as any).launchpad_protocol,
                      },
                      { router, tradeUrl: hoverTradeUrl }
                    );
                  }}
                  onClick={() => {
                    if (tokenAddress) {
                      // Check if it's a Monad token (starts with 0x)
                      const isMonadToken = actualMint.startsWith('0x') || actualMint.startsWith('0X');

                      if (isMonadToken) {
                        // Build Monad trade URL with query parameters
                        const queryParams = new URLSearchParams();
                        if (token.name) queryParams.set('_name', token.name);
                        if (token.symbol) queryParams.set('_symbol', token.symbol);
                        if (price > 0) queryParams.set('_price', price.toString());
                        if (token.market_cap_usd || (token as any).fully_diluted_value) {
                          queryParams.set('_mcap', ((token.market_cap_usd || (token as any).fully_diluted_value || 0)).toString());
                        }
                        const imageUrl = extractTokenImage(token as any) || '';
                        if (imageUrl) queryParams.set('_image', imageUrl);
                        queryParams.set('_mint', tokenAddress);
                        if ((token as any).launchpad_protocol) queryParams.set('_launchpad_protocol', (token as any).launchpad_protocol);
                        queryParams.set('chain', 'monad');

                        const url = `/trade/monad/${tokenAddress}?${queryParams.toString()}`;
                        router.push(url);
                      } else {
                        // For Solana tokens, include chain=sol query parameter
                        const queryParams = new URLSearchParams();
                        if (token.name) queryParams.set('_name', token.name);
                        if (token.symbol) queryParams.set('_symbol', token.symbol);
                        if (price > 0) queryParams.set('_price', price.toString());
                        if (token.market_cap_usd || (token as any).fully_diluted_value) {
                          queryParams.set('_mcap', ((token.market_cap_usd || (token as any).fully_diluted_value || 0)).toString());
                        }
                        const imageUrl = extractTokenImage(token as any) || '';
                        if (imageUrl) queryParams.set('_image', imageUrl);
                        queryParams.set('_mint', tokenAddress);
                        if ((token as any).launchpad_protocol) queryParams.set('_launchpad_protocol', (token as any).launchpad_protocol);
                        queryParams.set('chain', 'sol');

                        router.push(`/trade/${tokenAddress}?${queryParams.toString()}`);
                      }
                    }
                  }}
                >
                  {/* Token Image */}
                  <FastImage
                    src={rawImg ?? undefined}
                    alt={token.symbol || ''}
                    width={16}
                    height={16}
                    className="rounded-full ring-1 ring-white/10"
                    symbol={token.symbol}
                    name={token.name}
                    showBubble={false}
                  />
                  
                  {/* Token Symbol */}
                  <span className="text-xs font-semibold" style={{ color: '#d1d5db' }}>
                    {token.symbol}
                  </span>

                  {/* Market Cap */}
                  <span className="text-xs font-medium" style={{ color: '#a3e635' }}>
                    ${formatMarketCap(marketCap)}
                  </span>
                  
                  {/* Price Change */}
                  {priceChange !== 0 && (
                    <span 
                      className="text-xs font-medium"
                      style={{ color: priceChange >= 0 ? '#8ee8a8' : '#f47a96' }}
                    >
                      {priceChange >= 0 ? '+' : ''}{formatSmartNumber(Math.abs(priceChange))}%
                    </span>
                  )}

                  {/* Volume (1h) - show as percentage of market cap */}
                  {(() => {
                    // Use same volume resolution logic as watchlist modal
                    const usdVolumeFields = [
                      (token as any).volume_1h_usd,
                      (token as any).volume1hUsd,
                      (token as any).volume1h_usd,
                      (token as any).volume_24h_usd, // fallback when 1h is missing
                    ];
                    let volume1h = 0;
                    for (const v of usdVolumeFields) {
                      const num = Number(v);
                      if (Number.isFinite(num) && num > 0) {
                        volume1h = num;
                        break;
                      }
                    }
                    // Fallback to buy+sell volume if USD volume not available
                    if (volume1h === 0) {
                      const buy = Number((token as any).total_buy_volume_1h) || Number((token as any).total_buy_volume_mon) || 0;
                      const sell = Number((token as any).total_sell_volume_1h) || Number((token as any).total_sell_volume_mon) || 0;
                      if (buy || sell) volume1h = buy + sell;
                    }

                    // Get market cap
                    const marketCap =
                      (token as any).market_cap_usd ??
                      (token as any).marketCapUSD ??
                      (token as any).fully_diluted_value ??
                      0;

                    // Calculate volume as percentage of market cap
                    // let volumePercent = 0;
                    // if (volume1h > 0 && marketCap > 0) {
                    //   volumePercent = (volume1h / marketCap) * 100;
                    // }

                    // Show USD volume amount
                    // Color based on price change direction: green for up, red for down
                    const volumeColor = priceChange >= 0 ? '#8ee8a8' : '#f47a96';
                    
                    // if (volumePercent > 0) {
                    //   return (
                    //     <span className="text-xs font-medium" style={{ color: volumeColor }}>
                    //       {formatSmartNumber(volumePercent)}%
                    //     </span>
                    //   );
                    // } else 
                    if (volume1h > 0) {
                      return (
                        <span className="text-xs font-medium" style={{ color: volumeColor }}>
                          ${formatSmartNumber(volume1h)}
                        </span>
                      );
                    }
                    return null;
                  })()}
                  
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

      {/* Polygon QR Code Modal - Rendered at root level for proper positioning */}
      {showPolygonQR && (
        <div
          className="fixed inset-0 z-[9999999] flex items-center justify-center bg-black/70"
          onClick={() => setShowPolygonQR(false)}
        >
          <div
            className="bg-[#1a1b1f] rounded-xl p-6 max-w-xs w-full mx-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <SiPolygon className="w-5 h-5" style={{ color: '#8247E5' }} />
                <span className="text-sm font-semibold text-white">Deposit to Polygon</span>
              </div>
              <button
                onClick={() => setShowPolygonQR(false)}
                className="text-neutral-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="bg-white p-4 rounded-lg mb-4">
              <QRCode
                value={primaryWalletAddresses?.ethereum || ''}
                size={200}
                style={{ width: '100%', height: 'auto' }}
              />
            </div>
            <div className="text-center mb-3">
              <p className="text-xs text-neutral-400 mb-2">Your Polygon Address</p>
              <p className="text-xs font-mono text-[#f0f5f5] break-all">{primaryWalletAddresses?.ethereum}</p>
            </div>
            <button
              onClick={() => { handleCopyPolygonAddress(); }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={{ backgroundColor: '#8247E5', color: '#fff' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#7038d4'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#8247E5'; }}
            >
              {polygonAddressCopied ? <><BiCheck className="w-4 h-4" />Copied!</> : <><BiCopy className="w-4 h-4" />Copy Address</>}
            </button>
            <p className="text-[10px] text-amber-400 text-center mt-3">⚠️ Only send USDC/MATIC on Polygon network</p>
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
              router.push(`/trade/monad/${trimmed}?chain=monad`);
            } else {
              // For Solana tokens, always include chain=sol
              router.push(`/trade/${trimmed}?chain=sol`);
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
      (token?.usd_price ??
        token?.price_usd ??
        token?.priceUsd ??
        token?.price) || 0
    );

  const resolveWatchlistChange1h = (token: any) =>
    Number(
      token?.price_percent_change_1h ??
        token?.price_change_1h ??
        token?.price_change ??
        token?.price_percent_change_24h ??
        token?.price_change_24h ??
        0
    );
