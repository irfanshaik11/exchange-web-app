import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  FaSearch,
  FaStar,
  FaWallet,
  FaChevronLeft,
  FaChevronRight,
  FaBell,
  FaChevronDown,
  FaSync,
} from "react-icons/fa";
import { HiLightningBolt } from "react-icons/hi";
import { IoShieldCheckmarkOutline } from "react-icons/io5";
import { useUser } from "./UserContext";
import { useSolPrice } from "./SolPriceContext";
import { useWatchlist } from "./WatchlistContext";
import { useQuickBuy } from "./QuickBuyContext";
import { useSearch } from "./ui/SearchContext";
import { formatSmartNumber } from "../utils/db";
import type { Token } from "../utils/db";
import { executeEnhancedTrade } from "~/utils/enhancedTradeHandler";
import { executeMonadMultiBuy, formatMonadTxSummary } from "~/utils/monadWalletAllocation";
import { formatMonadError } from "~/utils/monadError";
import { extractTokenImage } from "~/utils/images";
import { broadcastMonadQuickTrade } from "~/utils/monadTradeEvents";
import Cookies from "js-cookie";
import toast from "react-hot-toast";
import { FaCheckCircle } from "react-icons/fa";
import dynamic from "next/dynamic";
import InterstateButton from "./InterstateButton";
import { FiBarChart, FiChevronDown, FiStar } from "react-icons/fi";
import SearchModal from "./SearchModal";
import BlockchainSwitcher from "./BlockchainSwitcher";
import UpdatesModal from "./UpdatesModal";
import NotificationDropdown from "./NotificationDropdown";
import type { Timeframe } from "../pages/index";
import { CiBellOn, CiStar } from "react-icons/ci";

/* ---- style palette ---- */
const AX = {
  bg: "#111214",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#c7c9d1",
  muted: "#c7c9d1",
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
  { name: "Predictions", href: "/predictions" },
  // { name: "Perpetuals", href: "/construction" },
  // { name: "Yield", href: "/construction" },
  { name: "Referral", href: "/rewards" },
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
  const { watchlist, removeFromWatchlist, refreshWatchlistToken } = useWatchlist();
  const { presets, activePreset } = useQuickBuy();

  // Watchlist ticker paging (max 8 tokens visible)
  const WATCHLIST_TICKER_PAGE_SIZE = 8;
  const [watchlistTickerPage, setWatchlistTickerPage] = useState(0);
  
  // Enrich watchlist tokens with cached pulse token data when price is missing
  const [cachedPulseTokens, setCachedPulseTokens] = useState<Token[]>([]);
  const pendingQuickBuyToastRef = useRef<{ id: string; tokenImage: string | null; tokenName: string; fakeTime: string; startTime: number; timerInterval?: NodeJS.Timeout } | null>(null);

  const isMonadToken = (token: any) =>
    typeof token?.mint === "string" && token.mint.startsWith("0x");
  
  useEffect(() => {
    // Load cached pulse tokens to enrich watchlist tokens
    try {
      const cached = localStorage.getItem('cached_pulse_tokens');
      if (cached) {
        const parsed = JSON.parse(cached);
        const now = Date.now();
        if (now < parsed.expiresAt) {
          setCachedPulseTokens(parsed.data || []);
        }
      }
    } catch (error) {
      // Ignore errors
    }
  }, []);

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
  const enrichedWatchlist = useMemo(() => {
    return watchlist.map(enrichTokenWithCachedData);
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
    return 0;
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
  
  const [hoveredWatchlistToken, setHoveredWatchlistToken] = useState<string | null>(null);
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
    if (isRefreshingBalance) return;

    setIsRefreshingBalance(true);
    try {
      await refreshBalance({ chain: currentChain, force: true });
    } catch (error) {
      console.error('Failed to refresh balance:', error);
    } finally {
      setIsRefreshingBalance(false);
    }
  };

  // State for clipboard token detection
  const [clipboardToken, setClipboardToken] = useState<{
    address: string;
    imageUrl: string;
    name: string;
    isPumpToken: boolean;
  } | null>(null);
  const lastCheckedClipboard = useRef<string>("");

  const chainSymbols: Record<string, string> = {
    sol: "SOL",
    monad: "MON",
    eth: "ETH",
    bnb: "BNB",
    base: "BASE",
  };
  
  const chainLogos: Record<string, string> = {
    sol: "https://cryptologos.cc/logos/solana-sol-logo.svg?v=040",
    monad: "https://i0.wp.com/www.gizmotimes.com/wp-content/uploads/2023/10/Monad-Logo.png?fit=1920%2C1080&ssl=1",
    eth: "https://cryptologos.cc/logos/solana-sol-logo.svg?v=040", // Fallback to Solana for now
    bnb: "https://cryptologos.cc/logos/solana-sol-logo.svg?v=040", // Fallback to Solana for now
    base: "https://cryptologos.cc/logos/solana-sol-logo.svg?v=040", // Fallback to Solana for now
  };
  
  // Use chainBalances from UserContext as the single source of truth
  // Derive chainBalance from chainBalances instead of maintaining separate state
  const chainBalance = chainBalances[currentChain] ?? (currentChain === "sol" ? solBalance : 0);

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

      if (clipboardToken?.address === trimmed) return;
      if (lastCheckedClipboard.current === trimmed) return;

      const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed);
      if (!isSolanaAddress) {
        setClipboardToken(null);
        lastCheckedClipboard.current = trimmed;
        return;
      }

      lastCheckedClipboard.current = trimmed;

      try {
        // First try to resolve mint address to pair address
        let pairAddress = trimmed;
        try {
          const hydrateResponse = await fetch('/api/token-service/hydrate-pair', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mint: trimmed }),
          });
          if (hydrateResponse.ok) {
            const hydrateData = await hydrateResponse.json();
            if (hydrateData.pair_address) {
              pairAddress = hydrateData.pair_address;
            }
          }
        } catch {
          // If hydration fails, use the original address as pair_address
        }

        const response = await fetch(
          `/api/token-service/trade-view?pair_address=${pairAddress}`,
        );
        if (!response.ok) {
          setClipboardToken(null);
          return;
        }

        const data = await response.json();
        const token = data?.token;

        if (!token) {
          setClipboardToken(null);
          return;
        }

        const imageUrl =
          token.imageUrl || token.image || token.thumbnail || token.uri || null;
        if (!imageUrl) {
          setClipboardToken(null);
          return;
        }

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

        setClipboardToken({
          address: trimmed,
          imageUrl,
          name: tokenName || "Unknown Token",
          isPumpToken,
        });
      } catch (error) {
        console.error("Error fetching token data:", error);
        setClipboardToken(null);
        // Don't reset lastCheckedClipboard - prevents infinite retry loop
      }
    },
    [clipboardToken?.address],
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

    document.addEventListener("copy", handleCopy);
    return () => document.removeEventListener("copy", handleCopy);
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

    const handlePointer = () => {
      checkClipboard();
    };

    const handleKey = () => {
      checkClipboard();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [checkClipboard]);

  // Handler for Paste CA button - navigate to token
  const handlePasteCA = async () => {
    if (clipboardToken) {
      // Detect if Monad (0x) or Solana address
      const isMonadAddress = clipboardToken.address.startsWith('0x') || clipboardToken.address.startsWith('0X');
      if (isMonadAddress) {
        router.push(`/trade/monad/${clipboardToken.address}?chain=monad`);
      } else {
        router.push(`/trade/${clipboardToken.address}?chain=sol`);
      }
      toast.success("Navigating to token...", {
        duration: 2000,
        style: {
          background: "#1E1F26",
          color: "#E6E7EA",
          border: "1px solid #70E0B0",
        },
      });
    } else {
      // Fallback: try to read clipboard if no token detected
      try {
        const text = await navigator.clipboard.readText();
        const trimmed = text.trim();
        const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed);

        if (isSolanaAddress) {
          router.push(`/trade/${trimmed}?chain=sol`);
          toast.success("Navigating to token...", {
            duration: 2000,
            style: {
              background: "#1E1F26",
              color: "#E6E7EA",
              border: "1px solid #70E0B0",
            },
          });
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
    
    // For Solana chain, use enhanced trade handler
    const tokenMint = (token as any).mint || '';
    if (!tokenMint) {
      toast.error("Token mint address not found", {
        duration: 3000,
        style: { background: "#1E1F26", color: "#E6E7EA", border: "1px solid #ff6b6b" },
      });
      return;
    }
    
    const settings = presets[activePreset].quickBuySettings;
    
    await executeEnhancedTrade({
      token,
      amount: quickBuyAmount,
      side: 'buy',
      settings,
      user: { bearerToken: user.bearerToken, id: user.id },
      solBalance: 0, // Will be fetched by executeEnhancedTrade
      solPriceUsd: 150,
      walletContext: {
        selectedWalletIds: currentChain === "monad" ? selectedWalletIds?.monad || [] : selectedWalletIds?.sol || [],
        walletList: walletList || [],
        walletBalances: walletBalances || {},
        chain: currentChain === "monad" ? "monad" : "sol",
      },
      refreshBalance,
      onSuccess: (txHash, stats) => {
        console.log('✅ Header Watchlist Quick Buy successful:', { txHash, stats });
      },
      onError: (error) => {
        console.error('❌ Header Watchlist Quick Buy failed:', error);
      },
    });
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
        className={`${isSticky ? "sticky top-0 z-20" : "relative z-10"} w-full border-b backdrop-blur bg-[#0C0C0F]`}
        style={{ borderColor: AX.border }}
      >
        <div
          className="flex max-w-full items-center justify-between border-b px-2 pt-4 pb-2.5 md:px-4"
          style={{ backgroundColor: "#0C0C0F", borderColor: AX.border }}
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
                      router.pathname.startsWith("/trade/"));
                  return (
                    <Link
                      key={link.name}
                      href={chainAwareHref(link.href)}
                      className={`flex-shrink-0 rounded px-2 py-1.5 text-sm font-medium whitespace-nowrap transition-all duration-300 ease-out sm:px-3 xl:px-4`}
                      style={{
                        color: isActive ? AX.mint : AX.text,
                        backgroundColor: isActive
                          ? "rgba(24, 196, 140, 0.1)"
                          : "transparent",
                        borderColor: "transparent",
                        position: "relative",
                        zIndex: 1001,
                        pointerEvents: "auto",
                        cursor: "pointer",
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.color = AX.mint;
                          e.currentTarget.style.backgroundColor =
                            "rgba(112, 224, 176, 0.1)";
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
            {showSearch && (
              <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2">
                {/* Smaller search button (desktop) */}
                <button
                  onClick={() => openSearch()}
                  className="hidden h-10 items-center gap-1.5 rounded-3xl border px-4 transition-all duration-300 ease-out xl:flex"
                  style={{
                    borderColor: AX.border,
                    color: AX.muted,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = AX.border;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = AX.border;
                  }}
                >
                  <FaSearch size={12} />
                  <span className="text-xs whitespace-nowrap text-neutral-400">
                    Search for any token or w..
                  </span>
                  <span className="ml-auto rounded border border-neutral-700/70 bg-neutral-800/80 px-1 py-0.5 text-[10px] leading-none text-neutral-200">
                    /
                  </span>
                </button>

                {/* Medium search button (for tablets) - shows icon + text without Tab keycap */}
                <button
                  onClick={() => openSearch()}
                  className="hidden h-8 min-w-[180px] items-center gap-1.5 rounded-md border px-2.5 transition-all duration-300 ease-out lg:flex xl:hidden"
                  style={{
                    backgroundColor: AX.surface,
                    borderColor: AX.border,
                    color: AX.muted,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "rgba(24, 196, 140, 0.08)";
                    e.currentTarget.style.borderColor = "#18c48c";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = AX.surface;
                    e.currentTarget.style.borderColor = AX.border;
                  }}
                >
                  <FaSearch size={12} />
                  <span className="text-[11px] whitespace-nowrap text-neutral-400">
                    Search
                  </span>
                </button>

                {/* Compact icon-only trigger on small screens */}
                <button
                  onClick={() => openSearch()}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border transition-all duration-300 ease-out lg:hidden"
                  style={{
                    backgroundColor: AX.surface,
                    borderColor: AX.border,
                    color: AX.muted,
                  }}
                >
                  <FaSearch size={14} />
                </button>

                {/* Clipboard token button - large desktop */}
                {clipboardToken && clipboardToken.imageUrl && (
                  <button
                    onClick={handlePasteCA}
                    className="relative hidden h-8 items-center gap-2 rounded-md border pr-2.5 pl-2 transition-all duration-300 ease-out xl:flex"
                    style={{
                      backgroundColor: AX.surface,
                      borderColor: AX.border,
                      color: AX.muted,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        "rgba(24, 196, 140, 0.08)";
                      e.currentTarget.style.borderColor = "#18c48c";
                      e.currentTarget.style.boxShadow =
                        "0 0 8px rgba(24, 196, 140, 0.3), 0 0 16px rgba(24, 196, 140, 0.15)";
                      e.currentTarget.style.transform = "scale(1.01)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = AX.surface;
                      e.currentTarget.style.borderColor = AX.border;
                      e.currentTarget.style.boxShadow = "none";
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <img
                        src={clipboardToken.imageUrl}
                        alt="Token"
                        className="h-7 w-7 flex-shrink-0 rounded-md object-cover"
                        onError={() => setClipboardToken(null)}
                      />
                      <span className="max-w-[90px] truncate text-sm font-medium text-[#f0f5f5]">
                        {clipboardToken.name}
                      </span>
                    </div>
                    <div className="group/shield relative ml-1">
                      <IoShieldCheckmarkOutline
                        size={14}
                        style={{
                          color: clipboardToken.isPumpToken
                            ? "#31e3ac"
                            : "#eab308",
                        }}
                      />
                      {/* Tooltip */}
                      <div
                        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 transform rounded px-2 py-1 text-xs font-medium whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover/shield:opacity-100"
                        style={{
                          backgroundColor: AX.surface,
                          color: AX.text,
                          border: `1px solid ${AX.border}`,
                          boxShadow:
                            "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                        }}
                      >
                        audit
                        {/* Tooltip arrow */}
                        <div
                          className="absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 transform border-t-4 border-r-4 border-l-4 border-transparent"
                          style={{ borderTopColor: AX.surface }}
                        ></div>
                      </div>
                    </div>
                  </button>
                )}

                {/* Clipboard token button - medium/tablet - compact version */}
                {clipboardToken && clipboardToken.imageUrl && (
                  <button
                    onClick={handlePasteCA}
                    className="relative hidden h-8 items-center gap-1.5 rounded-md border pr-2 pl-1.5 transition-all duration-300 ease-out lg:flex xl:hidden"
                    style={{
                      backgroundColor: AX.surface,
                      borderColor: AX.border,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        "rgba(24, 196, 140, 0.08)";
                      e.currentTarget.style.borderColor = "#18c48c";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = AX.surface;
                      e.currentTarget.style.borderColor = AX.border;
                    }}
                  >
                    <img
                      src={clipboardToken.imageUrl}
                      alt="Token"
                      className="h-6 w-6 flex-shrink-0 rounded-md object-cover"
                      onError={() => setClipboardToken(null)}
                    />
                    <span className="max-w-[60px] truncate text-[11px] font-medium text-white">
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
                )}

                {/* Clipboard token button - mobile */}
                {clipboardToken && clipboardToken.imageUrl && (
                  <button
                    onClick={handlePasteCA}
                    className="relative flex h-8 flex-shrink-0 items-center gap-1.5 rounded-md border pr-2 pl-1.5 transition-all duration-300 ease-out lg:hidden"
                    style={{
                      backgroundColor: AX.surface,
                      borderColor: AX.border,
                    }}
                  >
                    <img
                      src={clipboardToken.imageUrl}
                      alt="Token"
                      className="h-6 w-6 flex-shrink-0 rounded-md object-cover"
                      onError={() => setClipboardToken(null)}
                    />
                    <span className="max-w-[50px] truncate text-[11px] font-medium text-white">
                      {clipboardToken.name}
                    </span>
                    <IoShieldCheckmarkOutline
                      size={11}
                      style={{
                        color: clipboardToken.isPumpToken
                          ? "#31e3ac"
                          : "#eab308",
                      }}
                    />
                  </button>
                )}

                {/* Blockchain Switcher - Right of search bar */}
                <BlockchainSwitcher />
              </div>
            )}

            <button
              onClick={() => setWatchlistOpen(true)}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md transition-all duration-300 ease-out"
              style={{
                color: AX.muted,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = AX.mint;
                e.currentTarget.style.boxShadow = "none";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = AX.muted;
                e.currentTarget.style.boxShadow = "none";
              }}
              title="Watchlist"
            >
              <CiStar size={24} />
            </button>

            {/* Notifications Button */}
            <div ref={notificationsRef} className="relative">
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md transition-all duration-300 ease-out"
                style={{
                  color: AX.muted,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = AX.mint;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = AX.muted;
                }}
                title="Notifications"
              >
                <CiBellOn size={24} />
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
                  className="group/account flex h-10 cursor-pointer flex-row items-center justify-center rounded-3xl border px-1 transition-all duration-300 ease-out lg:gap-2"
                  style={{
                    borderColor: AX.border,
                    color: AX.text,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = AX.mint;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = AX.border;
                  }}
                  title="Click to view account & wallet"
                >
                  <div className="hidden h-8 w-8 items-center justify-center rounded-[125px] bg-emerald-400 text-xs font-bold text-black select-none sm:flex">
                    {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                  </div>
                  <div className="items-left flex flex-col gap-0 text-left">
                    <div className="flex items-center gap-1 text-sm text-white">
                      <span>
                        {formatBalance(chainBalance)}{" "}
                        {chainSymbols[currentChain] ?? "SOL"}
                      </span>
                      <button
                        onClick={handleManualBalanceRefresh}
                        className="p-0.5 rounded-full hover:bg-white/10 transition-colors"
                        title="Refresh balance"
                      >
                        <FaSync
                          size={10}
                          className={`text-neutral-500 hover:text-white ${isRefreshingBalance ? 'animate-spin' : ''}`}
                        />
                      </button>
                    </div>
                    <div className="text-xs text-neutral-500">
                      {user.name
                        ? user.name
                        : user.publicKey
                            .slice(0, 4)
                            .concat(user.name.slice(-4))}
                    </div>
                  </div>
                  <FiChevronDown
                    className="text-neutral-500 hover:text-neutral-200"
                    size={16}
                  />
                </button>
                {/* Combined Dropdown */}
                {profileMenuOpen && (
                  <div
                    className="absolute top-10 right-0 z-[1000001] rounded-xl border border-[#20232b] bg-[#0a0b10] shadow-2xl"
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
                          className="flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold text-[#f0f5f5] select-none"
                          style={{ backgroundColor: AX.mint }}
                        >
                          {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-[#f0f5f5]">
                            {user.name}
                          </div>
                          <div className="text-xs text-neutral-400">
                            Account
                          </div>
                        </div>
                      </div>

                      {/* Total Value */}
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

                      {/* Action Buttons */}
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
          <div className="flex items-center gap-2 bg-[#0C0C0F] px-3 py-0.5">
            {/* extra toolbar section */}
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
              {/* Custom tooltip for Active Positions */}
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
                {/* Tooltip arrow pointing left */}
                <div
                  className="absolute top-1/2 right-full h-0 w-0 -translate-y-1/2 transform border-t-4 border-r-4 border-b-4 border-transparent"
                  style={{ borderRightColor: AX.surface }}
                ></div>
              </div>
            </div>

            {/* Watchlist Icon */}
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
              {/* Custom tooltip for Watchlist */}
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
                {/* Tooltip arrow pointing left */}
                <div
                  className="absolute top-1/2 right-full h-0 w-0 -translate-y-1/2 transform border-t-4 border-r-4 border-b-4 border-transparent"
                  style={{ borderRightColor: AX.surface }}
                ></div>
              </div>
            </div>

            {/* Divider before watchlist tokens */}
            {watchlist.length > 0 && (
              <div className="h-4 border-r" style={{ borderColor: AX.border }} />
            )}

            {/* "All" dropdown for watchlist filter */}
            {watchlist.length > 0 && (
              <div className="flex items-center">
                <span className="text-xs font-medium" style={{ color: AX.text }}>
                  All
                </span>
                <FaChevronDown size={8} className="ml-1" style={{ color: AX.muted }} />
              </div>
            )}

            {/* Watchlist Tokens Ticker */}
            {watchlistTickerTotalPages > 1 && (
              <button
                className="flex items-center justify-center transition-all duration-200"
                style={{
                  color: watchlistTickerCanPrev ? AX.muted : "rgba(199, 201, 209, 0.35)",
                  opacity: watchlistTickerCanPrev ? 1 : 0.6,
                  cursor: watchlistTickerCanPrev ? "pointer" : "not-allowed",
                }}
                disabled={!watchlistTickerCanPrev}
                onClick={(e) => {
                  e.stopPropagation();
                  if (watchlistTickerCanPrev) {
                    setWatchlistTickerPage((p) => Math.max(0, p - 1));
                  }
                }}
                title="Previous"
              >
                <FaChevronLeft size={12} />
              </button>
            )}

            {watchlistTickerVisible.map((token) => {
              const tokenKey = token.pair_address || (token as any).mint || token.symbol;
              const tokenAddress = token.pair_address || (token as any).mint || '';
              // Use helper function to get correctly mapped price and price change
              const { price, priceChange } = getWatchlistTokenPriceAndChange(token);
              
              // Debug logging for specific token address (only log once per session)
              const isTestToken = tokenAddress.toLowerCase() === '0x0cc9b2e2acd7bacff79eb7db48f5662b622e7777' || 
                                  (token as any).mint?.toLowerCase() === '0x0cc9b2e2acd7bacff79eb7db48f5662b622e7777';
              
              if (isTestToken && typeof window !== 'undefined') {
                const logKey = `__watchlistTestLogged_${tokenAddress.toLowerCase()}`;
                if (!(window as any)[logKey]) {
                  // Get all price change related fields from token (check all possible field names)
                  const allPriceChangeFields: Record<string, any> = {};
                  const changeFieldNames = [
                    'price_percent_change_1h', 'price_change_1h', 'price_change',
                    'priceChange1h', 'price_percent_change_24h', 'price_change_24h',
                    'priceChange24h', 'price24hChangePercent', 'price_change_1h_percent',
                    'price_change_24h_percent', 'price_change_percent', 'pricePercentChange',
                    'change_1h', 'change_24h', 'percent_change_1h', 'percent_change_24h',
                    'percentChange1h', 'percentChange24h'
                  ];
                  
                  // Check all keys in token object for anything that might be a price change field
                  Object.keys(token).forEach(key => {
                    const lowerKey = key.toLowerCase();
                    if (lowerKey.includes('change') || lowerKey.includes('percent') || 
                        lowerKey.includes('price') && (lowerKey.includes('1h') || lowerKey.includes('24h'))) {
                      allPriceChangeFields[key] = (token as any)[key];
                    }
                  });
                  
                  // Also check the specific field names
                  changeFieldNames.forEach(field => {
                    const value = (token as any)[field];
                    if (value !== undefined && value !== null) {
                      allPriceChangeFields[field] = value;
                    }
                  });
                  
                  console.log(`[Watchlist Ticker Test] Token: ${token.symbol || tokenKey}`, {
                    tokenAddress,
                    mint: (token as any).mint,
                    pair_address: token.pair_address,
                    // Price fields
                    price_usd: (token as any).price_usd,
                    usd_price: (token as any).usd_price,
                    chart_live_price_usd: (token as any).chart_live_price_usd,
                    lastPriceUsd: (token as any).lastPriceUsd,
                    price: (token as any).price,
                    priceUSD: (token as any).priceUSD,
                    priceUsd: (token as any).priceUsd,
                    current_price: (token as any).current_price,
                    currentPrice: (token as any).currentPrice,
                    // All price change fields found (including any field with "change" or "percent" in name)
                    priceChangeFields: allPriceChangeFields,
                    // Final mapped values
                    mappedPrice: price,
                    mappedPriceChange: priceChange,
                    formattedPrice: formatSmallPrice(price),
                    formattedPriceChange: `${priceChange >= 0 ? '+' : ''}${formatSmartNumber(Math.abs(priceChange))}%`,
                    // All keys for reference
                    allKeys: Object.keys(token),
                  });
                  (window as any)[logKey] = true;
                }
              }
              
              // Debug logging to see what fields are available for tokens with 0 price
              if (price === 0 && !isTestToken) {
                console.log(`[Watchlist Debug] ${token.symbol || tokenKey} - Price is 0, checking fields:`, {
                  symbol: token.symbol,
                  name: token.name,
                  pair_address: token.pair_address,
                  mint: (token as any).mint,
                  price_usd: (token as any).price_usd,
                  usd_price: (token as any).usd_price,
                  price: (token as any).price,
                  priceUSD: (token as any).priceUSD,
                  priceUsd: (token as any).priceUsd,
                  price_percent_change_1h: (token as any).price_percent_change_1h,
                  price_change_1h: (token as any).price_change_1h,
                  price24hChangePercent: (token as any).price24hChangePercent,
                  allKeys: Object.keys(token).slice(0, 20), // First 20 keys
                });
              }
              
              const isHovered = hoveredWatchlistToken === tokenKey;
              const rawImg = (token as any).image_url || (token as any).image || (token as any).logo || (token as any).uri;
              
              return (
                <div
                  key={tokenKey}
                  className="flex items-center gap-1.5 cursor-pointer transition-all duration-200"
                  onMouseEnter={() => setHoveredWatchlistToken(tokenKey)}
                  onMouseLeave={() => setHoveredWatchlistToken(null)}
                  onClick={() => {
                    if (tokenAddress) {
                      // Check if it's a Monad token (starts with 0x)
                      const isMonadToken = tokenAddress.startsWith('0x') || tokenAddress.startsWith('0X');

                      if (isMonadToken) {
                        // Build Monad trade URL with query parameters
                        const queryParams = new URLSearchParams();
                        if (token.name) queryParams.set('_name', token.name);
                        if (token.symbol) queryParams.set('_symbol', token.symbol);
                        if (price > 0) queryParams.set('_price', price.toString());
                        if (token.market_cap_usd || (token as any).fully_diluted_value) {
                          queryParams.set('_mcap', ((token.market_cap_usd || (token as any).fully_diluted_value || 0)).toString());
                        }
                        const imageUrl = (token as any).image_url || (token as any).image || (token as any).logo || (token as any).uri || '';
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
                        const imageUrl = (token as any).image_url || (token as any).image || (token as any).logo || (token as any).uri || '';
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
                  {rawImg && (
                    <img
                      src={rawImg}
                      alt={token.symbol || ''}
                      className="w-4 h-4 rounded-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                  
                  {/* Token Symbol */}
                  <span className="text-xs font-medium" style={{ color: AX.text }}>
                    {token.symbol}
                  </span>
                  
                  {/* Price */}
                  <span className="text-xs" style={{ color: AX.muted }}>
                    ${price > 0 ? formatSmallPrice(price) : '0'}
                  </span>
                  
                  {/* Price Change */}
                  {priceChange !== 0 && (
                    <span 
                      className="text-xs font-medium"
                      style={{ color: priceChange >= 0 ? '#85d99f' : '#f26681' }}
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
                    const volumeColor = priceChange >= 0 ? '#85d99f' : '#f26681';
                    
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
                  
                  {/* Quick Buy Button - shown on hover */}
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
                      
                      {/* Star icon to remove from watchlist */}
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
                </div>
              );
            })}

            {watchlistTickerTotalPages > 1 && (
              <button
                className="flex items-center justify-center transition-all duration-200"
                style={{
                  color: watchlistTickerCanNext ? AX.muted : "rgba(199, 201, 209, 0.35)",
                  opacity: watchlistTickerCanNext ? 1 : 0.6,
                  cursor: watchlistTickerCanNext ? "pointer" : "not-allowed",
                }}
                disabled={!watchlistTickerCanNext}
                onClick={(e) => {
                  e.stopPropagation();
                  if (watchlistTickerCanNext) {
                    setWatchlistTickerPage((p) =>
                      Math.min(watchlistTickerTotalPages - 1, p + 1),
                    );
                  }
                }}
                title="Next"
              >
                <FaChevronRight size={12} />
              </button>
            )}

            <div className="h-4 border-r" style={{ borderColor: AX.border }}>
              {" "}
            </div>
          </div>
        )}
      </header>
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
