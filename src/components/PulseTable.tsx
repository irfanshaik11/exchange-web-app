import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { defaultPulseFilters, type PulseFilters } from "~/contexts/PulseFiltersContext";
import type { Token } from "~/utils/db";
import { formatSmartNumber, formatMarketCap } from "~/utils/db";
import {
  FaUser,
  FaGlobe,
  FaSearch,
  FaCrown,
  FaRegCopy,
  FaBolt,
  FaCamera,
  FaUsers,
  FaTrophy,
  FaRunning,
  FaGasPump,
  FaCoins,
  FaBan,
  FaRedo,
  FaDollarSign,
  FaRocket,
  FaChartBar,
  FaGem,
  FaPause,
  FaPlay,
  FaTelegram,
  FaRegUser,
  FaFire,
	FaTimes,
} from "react-icons/fa";
import { GiSeatedMouse } from "react-icons/gi";
import {
  PiCrownSimpleLight,
  PiFishSimpleLight,
  PiLeafLight,
  PiRobotLight,
  PiRobotThin,
  PiTarget,
  PiTelegramLogo,
} from "react-icons/pi";
import { FaDice, FaXTwitter, FaRegEyeSlash } from "react-icons/fa6";
import {
  BsPersonGear,
  BsCoin,
  BsMoon,
  BsCloud,
  BsCup,
  BsArrowUp,
  BsSliders2,
} from "react-icons/bs";
import { LuAtSign, LuChefHat, LuCrown } from "react-icons/lu";
import { RiGhostLine, RiFlaskLine, RiRobot2Line } from "react-icons/ri";
import { BiCandles, BiRefresh } from "react-icons/bi";
import {
  HiChartBar,
  HiUserGroup,
  HiLightningBolt,
  HiSparkles,
  HiOutlineFire,
} from "react-icons/hi";
import { HiOutlineRocketLaunch } from "react-icons/hi2";
import { GoPeople, GoStack } from "react-icons/go";
import { IoPersonOutline } from "react-icons/io5";
import { MdTrendingUp, MdEmojiEvents, MdDynamicFeed } from "react-icons/md";
import { SiSolana } from "react-icons/si";
// Removed @web3icons/react to fix React version conflict
import Image from "next/image";
import InterstatePopout from "./InterstatePopout";
import VerticalInput from "./VerticalInput";
import { usePulseFromQueryCache } from "~/hooks/usePulseFromQueryCache";
// flushSync removed in Phase 1/4 - was causing unnecessary rerenders

import { useRouter } from "next/router";
import { fetchTokenMetadata } from "~/utils/functions";
import { LuPill, LuSearch } from "react-icons/lu";
import Link from "next/link";
import { CiCamera, CiSearch, CiTrophy } from "react-icons/ci";
import FastImage from "./FastImage";
import SniperHoldingsDisplay from "./SniperHoldingsDisplay";
// import SolanaTokenAnalytics from "./SolanaTokenAnalytics";
import { useUser } from "~/components/UserContext";
import { useQuickBuy } from "~/components/QuickBuyContext";
import {
  extractTokenImage,
  getResolvedTokenImage,
  getCachedResolvedImage,
  resolveMetadataImage,
  resolveTokenImage,
} from "~/utils/images";
import { useSolPrice } from "~/components/SolPriceContext";
import { preloadTokenImages, preloadMetadataImages } from "~/utils/imagePreloader";
import {
  tradeBuy,
  createLimitOrder,
  SOL_MINT_ADDRESS,
  ApiError,
} from "~/utils/api";
import { getPoolTypeFromToken } from "~/utils/poolTypeDetection";
import { mapTradeErrorMessage } from "~/utils/tradeErrorMessages";
import { dispatchBalanceRefresh } from "~/utils/balanceEvents";
import { broadcastTradeCompleted, notifyTradePending } from "~/utils/tradeEvents";
import { listenForTradeEvents, transformToastToError } from "~/utils/createSolanaToastHandler";
import { TokenAge } from "./TokenAge";

import { preloadTradeChart } from "~/utils/preloadTradeChart";
import { VirtualizedTokenList } from "./VirtualizedTokenList";
import {
  showCenteredErrorToast,
  showCenteredSuccessToast,
  showTransactionPendingToast,
  startTransactionToastTimeout,
  updateTransactionToast,
} from "~/utils/toast";
import { executeEnhancedTrade } from "~/utils/enhancedTradeHandler";
import { showEnhancedToast, updateEnhancedToast } from "~/utils/enhancedToast";
import {
  executeSolanaMultiBuy,
  buildSolanaWalletAllocations,
} from "~/utils/solanaWalletAllocation";
import { validateSolanaBuy, showTradeValidationError } from "~/utils/preTradeValidation";
import { checkAtaExists } from "~/utils/ataCheck";
import { useTxHashCallback } from "~/contexts/SolanaPositionWebSocketContext";
import { fetchVerifiedPairAddress } from "~/hooks/useSingleTokenPolling";
import toast from "react-hot-toast";
import { FiGlobe } from "react-icons/fi";
import BottomCardInfoHolder from "./BottomCardInfoHolder";
import InterstateTooltip from "./InterstateTooltip";
import { useBlacklist } from "~/hooks/useBlacklist";
import { usePrefetchOrder } from "~/hooks/usePrefetchOrder";

/* ---- Enhanced Monad Green Palette (matching MonadTable) ---- */
const AX = {
  bg: "#0b0c0e",
  surface: "#16171C",
  surface2: "#121317",
  border: "#24252C",
  text: "#f0f5f5",
  muted: "#9CA3AF",
  mint: "#31e3ac", // Green - Monad brand color (matching MonadTable)
  mintHover: "#28c896", // Darker green for hover (matching MonadTable)
  sell: "#ed3a7a",
  aiBlue: "#526fff", // Blue variant (matching MonadTable)
  aiBlueHover: "#3f56d9", // Darker blue variant (matching MonadTable)
  aiGreen: "#31e3ac", // Green for primary actions (matching MonadTable)
  aiGreenHover: "#28c896", // Darker green for hover (matching MonadTable)
  aiCyan: "#06B6D4", // Cyan variant (matching MonadTable)
  aiCyanHover: "#0891B2", // Cyan hover (matching MonadTable)
  glowBlue: "rgba(82, 111, 255, 0.3)", // Blue glow (matching MonadTable)
  glowGreen: "rgba(49, 227, 172, 0.3)", // Green glow (matching MonadTable)
  glowCyan: "rgba(6, 182, 212, 0.3)", // Cyan glow (matching MonadTable)
  // Risk-based semantic colors
  riskHigh: "#ef4444",        // Red - risky metrics
  riskHighBg: "#2a1419",      // Dark red background
  riskMedium: "#f59e0b",      // Orange/Yellow - caution metrics
  riskMediumBg: "#2a2314",    // Dark orange background
  riskLow: "#31e3ac",         // Green - safe metrics (same as mint)
  riskLowBg: "#0f2419",       // Dark green background
  // Badge backgrounds
  badgeBg: "#1a1c23",         // Neutral badge background
  twitterBlue: "#1DA1F2",     // Twitter brand color
};

interface PulseTableProps {
  title: string;
  tokens: Token[];
  isFirstOrLast?: "first" | "last" | "only";
  loading?: boolean;
  skeletonRowCount?: number;
  showBubbleMetrics?: boolean; // Feature flag for bubble metrics (Buyers, Sellers, Wallets, 24h TX, Vol 24h)
  currentChain?: string; // Chain from parent to avoid router.query timing issues
}

// PHASE 4 (M1): LRU Cache to prevent unbounded memory growth
// Sized for 3 columns × 100 tokens + buffer = 1000 entries max
const TOKEN_CACHE_MAX_SIZE = 1000;
const TWITTER_CACHE_MAX_SIZE = 500;

class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove oldest (first) entry - O(1) with Map's insertion order
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

const tokenMetadataCache = new LRUCache<string, any>(TOKEN_CACHE_MAX_SIZE);

// Module-level cache: mint → twitter handle (populated by TokenImage from metadata)
// Used by the blacklist filter to match handles found only in token metadata URIs
// Capped via LRU to prevent unbounded memory growth
const twitterHandleCache = new LRUCache<string, string>(TWITTER_CACHE_MAX_SIZE);

// Module-level: remembers which tables have had data, survives Pages Router remounts
const _hadDataByTitle = new Map<string, boolean>();

// PHASE 4 (C2): Helper functions extracted from IIFEs to avoid recreation per render
// Safe number parser - handles strings, NaN, Infinity
const safeNum = (val: any): number => {
  if (val === null || val === undefined) return 0;
  const num = typeof val === 'string' ? parseFloat(val) : Number(val);
  return isFinite(num) ? num : 0;
};

// Get best available buy/sell data from token (prefers 5m, falls back through timeframes)
const getBuySellData = (token: Token): { buys: number; sells: number } => {
  // Try 5m first (most relevant for new tokens)
  const buys5m = safeNum(token.total_buys_5m);
  const sells5m = safeNum(token.total_sells_5m);
  if (buys5m + sells5m > 0) return { buys: buys5m, sells: sells5m };

  // Fallback to 1h
  const buys1h = safeNum(token.total_buys_1h);
  const sells1h = safeNum(token.total_sells_1h);
  if (buys1h + sells1h > 0) return { buys: buys1h, sells: sells1h };

  // Fallback to 6h
  const buys6h = safeNum(token.total_buys_6h);
  const sells6h = safeNum(token.total_sells_6h);
  if (buys6h + sells6h > 0) return { buys: buys6h, sells: sells6h };

  // Finally try 24h
  return { buys: safeNum(token.total_buys_24h), sells: safeNum(token.total_sells_24h) };
};

// Format holder count (e.g., 1500 -> "1.5K")
const formatHolderCount = (holders: number): string => {
  if (holders >= 1e9) return `${(holders / 1e9).toFixed(1)}B`;
  if (holders >= 1e6) return `${(holders / 1e6).toFixed(1)}M`;
  if (holders >= 1e3) return `${(holders / 1e3).toFixed(1)}K`;
  return holders.toString();
};

// Format volume value (e.g., 1500000 -> "$1.5M")
const formatVolumeDisplay = (val: number): string => {
  const rounded = Math.round(val);
  if (rounded >= 1e12) return `$${Math.round(rounded / 1e12)}T`;
  if (rounded >= 1e9) return `$${Math.round(rounded / 1e9)}B`;
  if (rounded >= 1e6) return `$${Math.round(rounded / 1e6)}M`;
  if (rounded >= 1e3) return `$${Math.round(rounded / 1e3)}K`;
  return `$${rounded}`;
};

const WS_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

const LIQUIDITY_FIELD_CANDIDATES = [
  "liquidity_usd",
  "LiquidityUSD",
  "liquidityUSD",
  "total_liquidity_usd",
  "totalLiquidityUsd",
  "totalLiquidityUSD",
  "total_liquidityUSD",
  "total_liquidity",
  "liquidity",
] as const;

const parseLiquidityValue = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
};

const hasZeroLiquidity = (token: any): boolean => {
  if (!token || typeof token !== "object") {
    return false;
  }

  for (const field of LIQUIDITY_FIELD_CANDIDATES) {
    const numeric = parseLiquidityValue(
      (token as Record<string, unknown>)[field],
    );
    if (numeric === null) {
      continue;
    }
    if (numeric === 0) {
      return true;
    }
    if (numeric > 0) {
      return false;
    }
  }

  return false;
};

const filterNonZeroLiquidity = <T extends Record<string, unknown>>(
  tokens: T[],
): T[] => tokens.filter((token) => !hasZeroLiquidity(token));

const BASE_TIMESTAMP_FIELDS: readonly string[] = [
  "launch_time",
  "launchTime",
  "created_at",
  "createdAt",
  "firstSeen",
  "first_seen",
  "pair_created_at",
  "pairCreatedAt",
  "timestamp",
  "ts",
];

const NEW_PAIRS_TIMESTAMP_FIELDS: readonly string[] = [
  "created_at",
  "createdAt",
  "launch_time",
  "launchTime",
  "firstSeen",
  "first_seen",
  "pair_created_at",
  "pairCreatedAt",
  "timestamp",
  "ts",
];

const MIGRATED_TIMESTAMP_FIELDS: readonly string[] = [
  // For migrated column, sort by token's original age (launch/creation time)
  // NOT by when it migrated (migrated_time)
  "created_at",
  "createdAt",
  "launch_time",
  "launchTime",
  "firstSeen",
  "first_seen",
  "pair_created_at",
  "pairCreatedAt",
  "timestamp",
  "ts",
];

const normalizeEpochNumber = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value > 1e12) return value;
  if (value > 1e9) return value * 1000;
  return 0;
};

const normalizeTimestampValue = (value: unknown): number => {
  if (!value) return 0;

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number") {
    return normalizeEpochNumber(value);
  }

  if (typeof value === "string") {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      const normalized = normalizeEpochNumber(numeric);
      if (normalized) return normalized;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    if ("Time" in record) {
      const nested = normalizeTimestampValue(record["Time"]);
      if (nested) return nested;
    }
    if ("time" in record) {
      const nested = normalizeTimestampValue(record["time"]);
      if (nested) return nested;
    }

    const secondsKeys: readonly string[] = [
      "seconds",
      "Seconds",
      "unix",
      "Unix",
    ];
    for (const key of secondsKeys) {
      if (record[key] !== undefined) {
        const seconds = Number(record[key]);
        if (!Number.isNaN(seconds) && seconds > 0) {
          const normalized = seconds > 1e12 ? seconds : seconds * 1000;
          if (normalized) return normalized;
        }
      }
    }

    const millisKeys: readonly string[] = [
      "millis",
      "milliseconds",
      "unixMillis",
      "UnixMillis",
      "ms",
    ];
    for (const key of millisKeys) {
      if (record[key] !== undefined) {
        const millis = Number(record[key]);
        if (!Number.isNaN(millis) && millis > 0) {
          return millis;
        }
      }
    }
  }

  return 0;
};

const getTokenTimestamp = (token: any, fields: readonly string[]): number => {
  if (!token) return 0;

  for (const field of fields) {
    const candidate = (token as any)?.[field];
    const timestamp = normalizeTimestampValue(candidate);
    if (timestamp) return timestamp;
  }

  return 0;
};

/**
 * Safely extract market cap from token, skipping 0/negative/invalid values.
 * Handles both number and string values from API.
 * Priority: fully_diluted_value > market_cap_usd > 0
 */
const getTokenMarketCap = (token: any): number => {
  if (!token) return 0;

  // Helper to safely parse value (handles strings, numbers, null, undefined)
  const parseValue = (val: any): number => {
    if (val === null || val === undefined) return 0;
    const num = typeof val === 'string' ? parseFloat(val) : Number(val);
    return isFinite(num) && num > 0 ? num : 0;
  };

  const fdv = parseValue(token.fully_diluted_value);
  if (fdv > 0) return fdv;

  const mc = parseValue(token.market_cap_usd);
  if (mc > 0) return mc;

  return 0;
};

// Smart color system based on token properties
interface SmartColorProps {
  children: React.ReactNode;
  className?: string;
  token: any;
  metricType: "marketCap" | "volume" | "transactions";
}

const SmartColor: React.FC<SmartColorProps> = ({
  children,
  className = "",
  token,
  metricType,
}) => {
  const getTokenColor = (token: any, metricType: string) => {
    const symbol = token.symbol?.toLowerCase() || "";
    const name = token.name?.toLowerCase() || "";
    const mint = token.mint || "";
    const mc = getTokenMarketCap(token);

    // Restrict MarketCap metric to approved palette only
    if (metricType === "marketCap") {
      // User-defined tiers (in thousands):
      // 0–20k: blue, 20k–30k: green, 30k–100k: yellow, 100k+: green
      if (mc >= 100_000) return "#31e3ac"; // Green: 100k+
      if (mc >= 30_000) return "#ddc13d"; // Yellow: 30k–100k
      if (mc >= 20_000) return "#31e3ac"; // Green: 20k–30k (matching MonadTable)
      return "#52c6ff"; // Blue: <20k
    }

    // AI/Tech tokens - Custom Blue
    if (
      symbol.includes("ai") ||
      symbol.includes("tech") ||
      symbol.includes("bot") ||
      name.includes("artificial") ||
      name.includes("intelligence") ||
      name.includes("robot")
    ) {
      return "#52c5ff"; // Custom Blue
    }

    // Meme tokens - Custom Yellow
    if (
      symbol.includes("meme") ||
      symbol.includes("doge") ||
      symbol.includes("pepe") ||
      symbol.includes("shiba") ||
      symbol.includes("floki") ||
      symbol.includes("bonk") ||
      name.includes("meme") ||
      name.includes("dog") ||
      name.includes("cat")
    ) {
      return "#ddc13d"; // Custom Yellow
    }

    // DeFi tokens - Green
    if (
      symbol.includes("defi") ||
      symbol.includes("swap") ||
      symbol.includes("dex") ||
      symbol.includes("farm") ||
      symbol.includes("yield") ||
      symbol.includes("liquidity") ||
      name.includes("finance") ||
      name.includes("exchange") ||
      name.includes("protocol")
    ) {
      return "#31e3ac"; // Green
    }

    // High volume tokens - map to allowed palette (use blue)
    const volume = token.volume_24h || 0;
    if (volume > 1000000) {
      // > $1M volume
      return "#52c6ff"; // Blue
    }

    // For non-marketCap metrics, prefer green for notable tokens using approved green
    const marketCap = token.fully_diluted_value || token.market_cap_usd || 0;
    if (marketCap > 10000000) {
      // > $10M market cap
      return "#31e3ac"; // Green (matching MonadTable)
    }

    // New/trending tokens - map to approved palette (use yellow)
    if (mint.slice(-4) === "pump" || symbol.length <= 3) {
      return "#ddc13d"; // Yellow
    }

    // Default based on symbol hash for consistency
    const hash = symbol.split("").reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0);

    const defaultColors = ["#52c6ff", "#31e3ac", "#ddc13d", "#06B6D4"];
    return defaultColors[Math.abs(hash) % defaultColors.length];
  };

  const color = getTokenColor(token, metricType);

  return (
    <span
      className={className}
      style={{
        color: color,
      }}
    >
      {children}
    </span>
  );
};

// Smooth number transition component - fast updates with smooth interpolation
interface SmoothNumberProps {
  value: number;
  duration?: number;
  className?: string;
  formatter?: (value: number) => string;
}
const SmoothNumber: React.FC<SmoothNumberProps> = ({
  value,
  duration = 300, // Faster default for snappy updates
  className = "",
  formatter = (val) => val.toString(),
}) => {
  // Initialize with value only if it's valid (positive), otherwise 0
  const initialValue = value > 0 ? value : 0;
  const [displayValue, setDisplayValue] = useState(initialValue);
  const animationRef = useRef<number | undefined>(undefined);
  const prevValueRef = useRef<number>(initialValue);
  const lastValidValueRef = useRef<number>(initialValue);

  useEffect(() => {
    // GUARD: Ignore invalid values (0, negative, NaN)
    // Keep showing the last valid value instead
    if (value <= 0 || !Number.isFinite(value)) {
      return;
    }

    // Skip animation if value hasn't changed meaningfully
    if (Math.abs(value - prevValueRef.current) < 0.0001) return;

    // Store this as the last valid value
    lastValidValueRef.current = value;

    // COMPONENT REUSE DETECTION: If value changed by more than 50%,
    // this is likely a different token (component reuse), not a price update.
    // Reset immediately without animation to avoid weird transitions.
    const prevValid =
      prevValueRef.current > 0 ? prevValueRef.current : displayValue;
    const changeRatio =
      prevValid > 0 ? Math.abs(value - prevValid) / prevValid : 1;

    if (changeRatio > 0.5) {
      // Large change = different token, reset immediately
      setDisplayValue(value);
      prevValueRef.current = value;
      return;
    }

    const startValue = displayValue > 0 ? displayValue : value;
    const endValue = value;
    const startTime = performance.now();

    // Cancel any running animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Smooth easing - easeOutQuart for natural deceleration
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const currentValue = startValue + (endValue - startValue) * easeOutQuart;

      setDisplayValue(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endValue);
        prevValueRef.current = endValue;
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value, duration]);

  return (
    <span className={className}>
      {formatter(displayValue)}
    </span>
  );
};

// Simple number display - just shows the formatted value (no animation to avoid glitches)
interface SimpleNumberProps {
  value: number;
  formatter?: (value: number) => string;
  className?: string;
}

const SimpleNumber: React.FC<SimpleNumberProps> = ({
  value,
  formatter = (val) => val.toString(),
  className = "",
}) => {
  // Only update display if value is valid and non-zero
  const lastValidRef = useRef<string>(formatter(value));

  if (value > 0 && Number.isFinite(value)) {
    lastValidRef.current = formatter(value);
  }

  return <span className={className}>{lastValidRef.current}</span>;
};

// Hook for smooth progress bar animation using requestAnimationFrame
function useSmoothProgress(
  targetValue: number,
  duration: number = 400,
): number {
  // Clamp to valid range [0, 1] for progress values
  const validTarget = Math.max(
    0,
    Math.min(1, Number.isFinite(targetValue) ? targetValue : 0),
  );
  const [smoothValue, setSmoothValue] = useState(validTarget);
  const animationRef = useRef<number | undefined>(undefined);
  const prevTargetRef = useRef<number>(validTarget);

  useEffect(() => {
    // GUARD: Ignore invalid values
    if (!Number.isFinite(targetValue) || targetValue < 0) return;

    const clampedTarget = Math.min(targetValue, 1);

    // Skip if change is too small (< 0.1%)
    if (Math.abs(clampedTarget - prevTargetRef.current) < 0.001) return;

    const startValue = smoothValue;
    const endValue = clampedTarget;
    const startTime = performance.now();

    // Cancel any running animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Smooth easing - easeOutQuart for natural feeling
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const currentValue = startValue + (endValue - startValue) * easeOutQuart;

      setSmoothValue(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setSmoothValue(endValue);
        prevTargetRef.current = endValue;
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [targetValue, duration]);

  return smoothValue;
}

/**
 * Calculate the best available volume in USD from websocket data.
 * Checks time periods in priority order: 24h > 6h > 1h > 5m
 * Adds buy + sell volumes and multiplies by SOL price.
 */
const calculateVolumeUsd = (token: any, solPrice: number): number => {
  // Parse volume string to number, handling undefined/null
  const parseVol = (val: string | number | undefined): number => {
    if (val === undefined || val === null) return 0;
    if (typeof val === "number") return val;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Check each time period from highest to lowest
  // Use the first period that has non-zero data
  const vol24h =
    parseVol(token.total_buy_volume_24h) +
    parseVol(token.total_sell_volume_24h);
  if (vol24h > 0) return vol24h * solPrice;

  const vol6h =
    parseVol(token.total_buy_volume_6h) + parseVol(token.total_sell_volume_6h);
  if (vol6h > 0) return vol6h * solPrice;

  const vol1h =
    parseVol(token.total_buy_volume_1h) + parseVol(token.total_sell_volume_1h);
  if (vol1h > 0) return vol1h * solPrice;

  const vol5m =
    parseVol(token.total_buy_volume_5m) + parseVol(token.total_sell_volume_5m);
  if (vol5m > 0) return vol5m * solPrice;

  // Fallback to existing volume_24h field if available
  return token.volume_24h || 0;
};

// Token Metrics Component - displays users, trades, achievements, and rank
function TokenMetrics({
  token,
  rank,
  totalTokens,
}: {
  token: Token;
  rank?: number;
  totalTokens?: number;
}) {
  // Helper function to format numbers with K, M, B suffixes
  const formatNumber = (num: number): string => {
    if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
    return num.toString();
  };

  // Real data from token - prioritize holder_count and kol_count from WebSocket
  const rawMetrics = {
    holders:
      token.holder_count ??
      token.total_holders ??
      token.unique_wallets_24h ??
      0,
    kols: token.kol_count ?? 0,
    trades: token.unique_wallets_5m || token.unique_wallets_1h || 0,
    rank: "0/1",
  };

  // Format the metrics for display
  const metrics = {
    holders: formatNumber(rawMetrics.holders),
    kols: formatNumber(rawMetrics.kols),
    trades: formatNumber(rawMetrics.trades),
    rank: rank && totalTokens ? `${rank}/${totalTokens}` : "0/1",
  };

  return (
    <div className="relative z-10 flex items-center gap-2">
      {/* Trophy Icon - KOL Count */}
      <div className="group/kol relative flex cursor-help items-center gap-1">
        <div
          className="flex items-center justify-center rounded"
          style={{
            backgroundColor: "#111214",
            padding: "2px",
            width: "18px",
            height: "18px",
          }}
        >
          <FaTrophy size={10} style={{ color: AX.muted }} />
        </div>
        <span className="text-xs" style={{ color: AX.text }}>
          {metrics.kols}
        </span>
        {/* Tooltip - appears below */}
        <div className="pointer-events-none absolute top-full left-0 z-[9999] mt-2 rounded-lg border border-[#2a2b33] bg-[#1a1b1f] px-3 py-2 whitespace-nowrap opacity-0 shadow-xl transition-opacity duration-100 group-hover/kol:opacity-100">
          <span className="text-sm font-medium text-white">KOL Count</span>
          <p className="mt-0.5 text-xs text-gray-400">
            Key Opinion Leaders holding this token
          </p>
          <div className="absolute bottom-full left-4 h-0 w-0 border-r-[6px] border-b-[6px] border-l-[6px] border-r-transparent border-b-[#2a2b33] border-l-transparent"></div>
        </div>
      </div>

      {/* Users Icon - Holder Count */}
      <div className="group/holder relative flex cursor-help items-center gap-1">
        <div
          className="flex items-center justify-center rounded"
          style={{
            backgroundColor: "#111214",
            padding: "2px",
            width: "18px",
            height: "18px",
          }}
        >
          <GoPeople size={12} style={{ color: "#57ace9", strokeWidth: "3" }} />
        </div>
        <span className="text-xs" style={{ color: AX.text }}>
          {metrics.holders}
        </span>
        {/* Tooltip - appears below */}
        <div className="pointer-events-none absolute top-full left-0 z-[9999] mt-2 rounded-lg border border-[#2a2b33] bg-[#1a1b1f] px-3 py-2 whitespace-nowrap opacity-0 shadow-xl transition-opacity duration-100 group-hover/holder:opacity-100">
          <span className="text-sm font-medium text-white">Holder Count</span>
          <p className="mt-0.5 text-xs text-gray-400">
            Total wallets holding this token
          </p>
          <div className="absolute bottom-full left-4 h-0 w-0 border-r-[6px] border-b-[6px] border-l-[6px] border-r-transparent border-b-[#2a2b33] border-l-transparent"></div>
        </div>
      </div>

      {/* Crown Icon - Ranking */}
      {/* <div 
        className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => {
          // Open Solscan with the token's mint address
          const solscanUrl = `https://solscan.io/token/${token.mint}`;
          window.open(solscanUrl, '_blank');
        }}
        title="View on Solscan"
      >
        <FaCrown size={12} style={{ color: AX.muted }} />
        <span className="text-xs" style={{ color: AX.text }}>{metrics.rank}</span>
      </div> */}
    </div>
  );
}

function useTokenMetadata(uri?: string) {
  const [meta, setMeta] = useState<any | null>(null);
  const [loading, setLoading] = useState(!!uri);
  const [showInitial, setShowInitial] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!uri) {
      setMeta(null);
      setLoading(false);
      return;
    }
    const cachedMeta = tokenMetadataCache.get(uri);
    if (cachedMeta) {
      setMeta(cachedMeta);
      setLoading(false);
      return;
    }
    setLoading(true);
    setShowInitial(false);
    const timer = setTimeout(() => setShowInitial(true), 150);
    fetchTokenMetadata(uri).then((data) => {
      if (!cancelled) {
        if (data) tokenMetadataCache.set(uri, data);
        setMeta(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [uri]);
  return { meta, loading, showInitial };
}

// Helper to extract social links from token metadata
interface SocialLinks {
  twitter?: string;
  website?: string;
  telegram?: string;
}

function extractSocialLinks(token: Token, meta: any): SocialLinks {
  const links: SocialLinks = {};

  // Try to get links from metadata first
  if (meta) {
    if (meta.twitter) links.twitter = meta.twitter;
    if (meta.website) links.website = meta.website;
    if (meta.telegram) links.telegram = meta.telegram;
  }

  // Also try to parse token.links if it's a JSON string
  if (token.links) {
    try {
      const parsedLinks =
        typeof token.links === "string" ? JSON.parse(token.links) : token.links;
      if (parsedLinks.twitter && !links.twitter)
        links.twitter = parsedLinks.twitter;
      if (parsedLinks.website && !links.website)
        links.website = parsedLinks.website;
      if (parsedLinks.telegram && !links.telegram)
        links.telegram = parsedLinks.telegram;
    } catch {
      // Ignore parsing errors
    }
  }

  return links;
}

// Helper to extract Twitter handle from URL
function extractTwitterHandle(url: string): string | null {
  if (!url) return null;
  // Handle various Twitter/X URL formats
  const patterns = [
    /(?:twitter\.com|x\.com)\/(@?\w+)/i,
    /(?:twitter\.com|x\.com)\/intent\/user\?screen_name=(\w+)/i,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1].replace("@", "");
    }
  }
  return null;
}

// Twitter Handle Display Component - shows @handle in Twitter blue (compact inline)
function TwitterHandleDisplay({ token }: { token: Token }) {
  const { meta } = useTokenMetadata(token.uri);
  const socialLinks = extractSocialLinks(token, meta);

  if (!socialLinks.twitter) return null;

  const handle = extractTwitterHandle(socialLinks.twitter);
  if (!handle) return null;

  return (
    <span
      role="link"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        window.open(socialLinks.twitter, "_blank");
      }}
      className="text-[10px] font-medium hover:underline whitespace-nowrap cursor-pointer"
      style={{ color: "#1DA1F2" }}
    >
      @{handle}
    </span>
  );
}

// PHASE 3: Memoized StatusPopup component - eliminates IIFE overhead (Fix #4)
interface StatusPopupProps {
  token: Token;
  title: string;
}

const StatusPopupContent = React.memo(function StatusPopupContent({
  token,
  title,
}: StatusPopupProps) {
  // Pre-compute status type once
  const titleLower = title.toLowerCase();
  const isNewPairs = titleLower.includes("new");
  const isFinalStretch = titleLower.includes("final") || titleLower.includes("stretch");
  const isMigrated = titleLower.includes("migrated");
  const launchpadProtocol = ((token as any).launchpad_protocol || "").toLowerCase();

  // Compute bonding progress once
  const bondingProgress = useMemo(() => {
    if (isNewPairs) {
      return typeof token.bonding_pct === "number"
        ? token.bonding_pct
        : parseFloat(token.bonding_pct || "0");
    }
    return typeof token.bonding_curve_progress === "number"
      ? token.bonding_curve_progress
      : parseFloat(token.bonding_curve_progress || "0");
  }, [isNewPairs, token.bonding_pct, token.bonding_curve_progress]);

  // Render status content based on type
  if (isNewPairs) {
    return (
      <span style={{ color: AX.aiGreen }}>
        Bonding Curve: {Math.round(bondingProgress)}%
      </span>
    );
  }

  if (isFinalStretch) {
    return <span style={{ color: AX.aiCyan }}>Migrating</span>;
  }

  if (isMigrated) {
    if (launchpadProtocol.includes("meteora")) {
      return <span style={{ color: AX.aiBlue }}>Virtual Curve</span>;
    }
    if (launchpadProtocol.includes("pump")) {
      return <span style={{ color: AX.aiBlue }}>PumpV1</span>;
    }
    if (
      launchpadProtocol.includes("bonk") ||
      launchpadProtocol.includes("raydium") ||
      launchpadProtocol.includes("launchlab")
    ) {
      return <span style={{ color: AX.aiBlue }}>LaunchLab</span>;
    }
    return <span style={{ color: AX.aiBlue }}>Migrated</span>;
  }

  // Fallback
  return (
    <span style={{ color: AX.aiGreen }}>
      Bonding: {Math.round(bondingProgress)}%
    </span>
  );
});

// Social Icons Component with URI metadata parsing and search dropdown
function SocialIconsWithMetadata({
  token,
  idx,
  showSearchDropdown,
  setShowSearchDropdown,
}: {
  token: Token;
  idx: number;
  showSearchDropdown: number | null;
  setShowSearchDropdown: (idx: number | null) => void;
}) {
  const { meta } = useTokenMetadata(token.uri);
  const socialLinks = extractSocialLinks(token, meta);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const xButtonRef = useRef<HTMLButtonElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const searchMenuRef = useRef<HTMLDivElement>(null);
  const [showXPreview, setShowXPreview] = useState(false);
  const [previewPosition, setPreviewPosition] = useState({
    left: 0,
    top: 0,
    openBelow: false,
  });
  const [showSearchMenu, setShowSearchMenu] = useState(false);
  const [searchMenuPosition, setSearchMenuPosition] = useState({
    left: 0,
    top: 0,
    openAbove: false,
  });
  const isOverSearchMenu = useRef(false);
  const isOverSearchButton = useRef(false);
  const isOverXPreview = useRef(false);
  const isOverXButton = useRef(false);
  const websiteTipRef = useRef<HTMLDivElement>(null);

  const hasTwitter = !!socialLinks.twitter;
  const hasWebsite = !!socialLinks.website;
  const hasTelegram = !!socialLinks.telegram;
  const twitterHandle = hasTwitter
    ? extractTwitterHandle(socialLinks.twitter!)
    : null;

  return (
    <div className="flex items-center gap-1">
      {/* X/Twitter Icon - only show if twitter URL exists */}
      {hasTwitter && (
        <div className="relative flex items-center">
          <button
            ref={xButtonRef}
            className="flex items-center justify-center rounded p-1 transition-colors duration-200 hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              window.open(socialLinks.twitter, "_blank");
            }}
            onMouseEnter={() => {
              isOverXButton.current = true;
              if (xButtonRef.current) {
                const rect = xButtonRef.current.getBoundingClientRect();
                setPreviewPosition({
                  left: rect.right + 8,
                  top: rect.top - 50,
                  openBelow: false,
                });
              }
              setShowXPreview(true);
            }}
            onMouseLeave={() => {
              isOverXButton.current = false;
              setTimeout(() => {
                if (!isOverXPreview.current && !isOverXButton.current) {
                  setShowXPreview(false);
                }
              }, 200);
            }}
          >
            <FaXTwitter
              size={12}
              className="text-neutral-400 hover:text-white"
            />
          </button>

          {/* X Profile Preview Popup - PHASE 3: JS-based fixed positioning */}
          {showXPreview && createPortal(
          <div
            className="fixed w-[280px] rounded-xl z-[9999] overflow-hidden"
            style={{
              left: `${previewPosition.left}px`,
              top: `${previewPosition.top}px`,
              backgroundColor: AX.surface,
              border: `1px solid ${AX.border}`,
            }}
            onMouseEnter={() => { isOverXPreview.current = true; }}
            onMouseLeave={() => {
              isOverXPreview.current = false;
              setTimeout(() => {
                if (!isOverXPreview.current && !isOverXButton.current) {
                  setShowXPreview(false);
                }
              }, 200);
            }}
          >
                {/* Header with X logo */}
                <div className="flex items-center justify-between border-b border-[#2f3336] px-4 py-3">
                  <div className="flex items-center gap-2">
                    {/* Profile Picture */}
                    <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-full bg-[#1a1a1a]">
                      <img
                        src={
                          token.logo ||
                          `https://ui-avatars.com/api/?name=${token.symbol}&background=1a1a1a&color=fff`
                        }
                        alt={token.symbol}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            `https://ui-avatars.com/api/?name=${token.symbol}&background=1a1a1a&color=fff`;
                        }}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-bold text-white">
                          {token.name || token.symbol}
                        </span>
                        <svg
                          className="h-4 w-4 text-[#1d9bf0]"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z" />
                        </svg>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <span>
                          @{twitterHandle || token.symbol?.toLowerCase()}
                        </span>
                        <span>·</span>
                        <span>+</span>
                      </div>
                    </div>
                  </div>
                  <FaXTwitter size={20} className="text-white" />
                </div>

                {/* Bio/Description */}
                <div className="px-4 py-3">
                  <p className="text-sm leading-relaxed text-white">
                    {meta?.description ||
                      token.description ||
                      `Official ${token.symbol} token`}
                  </p>
                  {hasWebsite && (
                    <a
                      href={socialLinks.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block truncate text-sm text-[#1d9bf0] hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {socialLinks.website}
                    </a>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 px-4 pb-3 text-sm">
                  <div className="flex items-center gap-1 text-gray-500">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <rect
                        x="3"
                        y="4"
                        width="18"
                        height="18"
                        rx="2"
                        ry="2"
                        strokeWidth="2"
                      />
                      <line x1="16" y1="2" x2="16" y2="6" strokeWidth="2" />
                      <line x1="8" y1="2" x2="8" y2="6" strokeWidth="2" />
                      <line x1="3" y1="10" x2="21" y2="10" strokeWidth="2" />
                    </svg>
                    <span>
                      Joined{" "}
                      {new Date(
                        token.created_at || Date.now(),
                      ).toLocaleDateString("en-US", {
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>

                {/* Following/Followers - hidden until Twitter API integration
                <div className="flex items-center gap-4 px-4 pb-3 text-sm">
                  <span>
                    <strong className="text-white">--</strong>{" "}
                    <span className="text-gray-500">Following</span>
                  </span>
                  <span>
                    <strong className="text-white">--</strong>{" "}
                    <span className="text-gray-500">Followers</span>
                  </span>
                </div>
                */}

                {/* CTA Button */}
                <div className="px-4 pb-4">
                  <button
                    className="w-full rounded-full border border-[#536471] py-2.5 text-sm font-semibold text-[#1d9bf0] transition-colors hover:bg-[#1d9bf0]/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(socialLinks.twitter, "_blank");
                    }}
                  >
                    See Profile on X
                  </button>
                </div>
          </div>
          , document.body)}
        </div>
      )}

      {/* Telegram Icon - only show if telegram URL exists */}
      {hasTelegram && (
        <button
          className="flex items-center justify-center rounded p-1 transition-colors duration-200 hover:bg-white/10"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            window.open(socialLinks.telegram, "_blank");
          }}
          title="Join Telegram"
        >
          <FaTelegram
            size={12}
            className="text-neutral-400 hover:text-[#0088cc]"
          />
        </button>
      )}

      {/* Globe Icon - only show if website URL exists */}
      {hasWebsite && (
        <div className="relative">
          <button
            className="flex items-center justify-center rounded p-1 transition-colors duration-200 hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              window.open(socialLinks.website, "_blank");
            }}
            onMouseEnter={(e) => {
              const tip = websiteTipRef.current;
              if (tip) {
                const rect = e.currentTarget.getBoundingClientRect();
                tip.style.left = `${rect.left + rect.width / 2}px`;
                tip.style.top = `${rect.bottom + 8}px`;
                tip.style.opacity = "1";
              }
            }}
            onMouseLeave={() => {
              const tip = websiteTipRef.current;
              if (tip) tip.style.opacity = "0";
            }}
          >
            <FiGlobe size={12} className="text-neutral-400 hover:text-white" />
          </button>
          {/* Website URL Tooltip - portaled to body for correct positioning */}
          {createPortal(
            <div
              ref={websiteTipRef}
              className="pointer-events-none fixed z-[9999] -translate-x-1/2 rounded-lg px-3 py-2 whitespace-nowrap"
              style={{
                backgroundColor: AX.surface,
                border: `1px solid ${AX.border}`,
                opacity: 0,
                transition: "opacity 150ms",
              }}
            >
              <span className="text-xs" style={{ color: AX.muted }}>Website</span>
              <p className="max-w-[200px] truncate text-sm font-medium" style={{ color: AX.text }}>
                {socialLinks.website}
              </p>
            </div>,
            document.body
          )}
        </div>
      )}

      {/* Search Icon with Dropdown - PHASE 3: JS-based fixed positioning */}
      <div className="relative flex items-center">
        <button
          ref={searchButtonRef}
          className="flex items-center justify-center rounded p-1 transition-colors duration-200 hover:bg-white/10"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onMouseEnter={() => {
            isOverSearchButton.current = true;
            if (searchButtonRef.current) {
              const rect = searchButtonRef.current.getBoundingClientRect();
              setSearchMenuPosition({
                left: rect.right + 8,
                top: rect.top,
                openAbove: false,
              });
            }
            setShowSearchMenu(true);
          }}
          onMouseLeave={() => {
            isOverSearchButton.current = false;
            setTimeout(() => {
              if (!isOverSearchMenu.current && !isOverSearchButton.current) {
                setShowSearchMenu(false);
              }
            }, 200);
          }}
        >
          <FaSearch
            size={10}
            className="text-neutral-400 hover:text-[#36d8ff]"
          />
        </button>

        {/* Search Dropdown Menu - PHASE 3: JS-based fixed positioning */}
        {showSearchMenu && createPortal(
        <div
          ref={searchMenuRef}
          className="fixed min-w-[220px] rounded-lg py-1 z-[9999] overflow-hidden"
          style={{
            left: `${searchMenuPosition.left}px`,
            top: `${searchMenuPosition.top}px`,
            backgroundColor: AX.surface,
            border: `1px solid ${AX.border}`,
          }}
          onMouseEnter={() => { isOverSearchMenu.current = true; }}
          onMouseLeave={() => {
            isOverSearchMenu.current = false;
            setTimeout(() => {
              if (!isOverSearchMenu.current && !isOverSearchButton.current) {
                setShowSearchMenu(false);
              }
            }, 200);
          }}
        >
          {/* X Search for Address */}
          <button
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              const url = `https://twitter.com/search?q=${encodeURIComponent(token.mint)}`;
              window.open(url, "_blank");
            }}
          >
            <FaXTwitter size={14} className="text-neutral-400" />
            X Search for Address
          </button>

          {/* X Search for Name */}
          <button
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              const searchQuery = `${token.symbol} ${token.name}`.trim();
              const url = `https://twitter.com/search?q=${encodeURIComponent(searchQuery)}`;
              window.open(url, "_blank");
            }}
          >
            <FaXTwitter size={14} className="text-neutral-400" />
            X Search for Name
          </button>

          {/* Divider - PHASE 3: Unified AX styling */}
          <div className="my-1" style={{ borderTop: `1px solid ${AX.border}` }} />

          {/* Google Search for Name */}
          <button
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              const searchQuery = `${token.symbol} ${token.name} crypto`.trim();
              const url = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
              window.open(url, "_blank");
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              className="text-neutral-400"
            >
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Google Search for Name
          </button>

          {/* DexScreener Search */}
          <button
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              const url = `https://dexscreener.com/solana/${token.mint}`;
              window.open(url, "_blank");
            }}
          >
            <LuSearch size={14} className="text-[#36d8ff]" />
            DexScreener
          </button>
        </div>
        , document.body)}
      </div>
    </div>
  );
}

function TokenImage({
  token,
  priority = false,
  isNewPairs = false,
  columnType = "new",
  onBlacklistCA,
  onBlacklistTwitter,
  onBlacklistDev,
}: {
  token: Token;
  priority?: boolean;
  isNewPairs?: boolean;
  columnType?: "new" | "final-stretch" | "migrated";
  onBlacklistCA?: (mint: string) => void;
  onBlacklistTwitter?: (handle: string) => void;
  onBlacklistDev?: (wallet: string) => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewPosition, setPreviewPosition] = useState({ top: 0, left: 0 });
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const hideTokenTipRef = useRef<HTMLDivElement>(null);
  const blacklistTwitterTipRef = useRef<HTMLDivElement>(null);
  const blacklistDevTipRef = useRef<HTMLDivElement>(null);
  const ammBubbleTipRef = useRef<HTMLDivElement>(null);

  // Extract image URL from token data, checking multiple possible field names
  // Priority: image_url, image, logo, uri (updated for API compatibility)
  const rawImageUrl = extractTokenImage(token as any) || null;
  // uri is a metadata URI by definition — only use when no direct image available
  const tokenUri = (token as any)?.uri || null;
  const metadataCandidate = !rawImageUrl ? tokenUri : null;

  // Sync-initialize from metadata cache to eliminate skeleton flash on re-mount
  const [resolvedImageUrl, setResolvedImageUrl] = useState<string | null>(() => {
    if (metadataCandidate) {
      // force=true: uri IS metadata by definition, skip isMetadataUrl check
      const cached = getCachedResolvedImage(metadataCandidate, true);
      if (cached) return cached;
      return null; // will resolve async in effect
    }
    return rawImageUrl; // non-metadata URL, use immediately
  });

  // If the image URL is a JSON metadata URL, resolve it asynchronously
  useEffect(() => {
    let cancelled = false;

    if (metadataCandidate) {
      // force=true: resolve any URI regardless of host whitelist
      resolveMetadataImage(metadataCandidate, true).then((resolved) => {
        if (!cancelled) {
          setResolvedImageUrl(resolved || null);
        }
      });
    } else {
      setResolvedImageUrl(rawImageUrl);
    }

    return () => {
      cancelled = true;
    };
  }, [rawImageUrl, metadataCandidate]);

  // Use resolved URL or fall back to raw URL
  const imageUrl = resolvedImageUrl;

  // Blacklist: extract twitter handle and dev wallet for action buttons
  const { meta: blMeta } = useTokenMetadata(token.uri);
  const blSocialLinks = extractSocialLinks(token, blMeta);
  const blTwitterHandle = blSocialLinks.twitter ? extractTwitterHandle(blSocialLinks.twitter) : null;
  if (blTwitterHandle && token.mint) {
    twitterHandleCache.set(token.mint.toLowerCase(), blTwitterHandle.toLowerCase());
  }
  const blDevWallet = token.dev_wallet || token.creator_wallet || null;

  // Calculate migration progress for border color (only for New Pairs, NOT for migrated)
  const getMigrationProgress = (token: Token): number => {
    // Don't apply bonding progress to migrated column
    if (!isNewPairs || columnType === "migrated") return 0;

    // Priority order: bonding_pct, bonding_curve_progress, graduationPercent, market cap / 70k
    const bondingPct = (token as any).bonding_pct;
    const bondingProgress = token.bonding_curve_progress;
    const graduationPercent = (token as any).graduationPercent;
    const marketCap = getTokenMarketCap(token);

    if (typeof bondingPct === "number" && bondingPct >= 0) {
      return Math.min(Math.max(bondingPct / 100, 0), 1); // Convert percentage to 0-1 range
    }

    if (typeof bondingProgress === "number" && bondingProgress >= 0) {
      return Math.min(Math.max(bondingProgress, 0), 1);
    }

    if (typeof graduationPercent === "number" && graduationPercent >= 0) {
      return Math.min(Math.max(graduationPercent / 100, 0), 1); // Convert percentage to 0-1 range
    }

    // Fallback: market cap divided by 70k (capped at 1.0)
    if (marketCap > 0) {
      return Math.min(marketCap / 70000, 1.0);
    }

    return 0; // Default to 0% progress for new tokens
  };

  // Get border color based on migration progress (loading bar style)
  const getProgressBorderColor = (progress: number): string => {
    if (!isNewPairs) return "#31e3ac"; // Default green for non-New Pairs

    // Loading bar style: green = good progress, red = bad/slow progress
    if (progress >= 0.7) {
      // Good progress - bright green
      return "#31e3ac"; // green-500
    } else if (progress >= 0.4) {
      // Medium progress - yellow
      return "#eab308"; // yellow-500
    } else if (progress >= 0.1) {
      // Slow progress - orange
      return "#f97316"; // orange-500
    } else {
      // Very slow/bad progress - red
      return "#d11f3a"; // red-500
    }
  };

  // Protocol color mapping - matches the filter section colors (subtle versions)
  const protocolColorMap: Record<string, string> = {
    pump: "#31e3ac", // Green for pump.fun
    "pump.fun": "#31e3ac", // Green for pump.fun
    bonk: "#ff6b35", // Orange for bonk
    bags: "#31e3ac", // Green for bags
    moonshot: "#eab308", // Yellow for moonshot
    moonshoot: "#eab308", // Yellow for moonshoot
    moonit: "#eab308", // Yellow for moonit
    heaven: "#31e3ac", // Green (matching MonadTable)
    "daos.fun": "#06b6d4",
    candle: "#f59e0b",
    sugar: "#ec4899",
    believe: "#31e3ac",
    jupiter: "#31e3ac", // Green (matching MonadTable)
    boop: "#134577", // Dark blue for boopfun
    boopfun: "#134577", // Dark blue for boopfun
    launchlab: "#3b82f6", // Blue for launchlab (default)
    dynamic: "#526fff",
    raydium: "#31e3ac", // Green for raydium (matching MonadTable)
    raydiumlaunchpad: "#31e3ac", // Green for raydiumlaunchpad (matching MonadTable)
    meteora: "#d11f3a", // Pink-red for meteora
    meteora_v2: "#d11f3a", // Pink-red for meteora
    pump_amm: "#e9ba14", // Gold for meteora amm
    orca: "#0ea5e9",
  };

  // Get protocol color based on launchpad_protocol field
  const getProtocolColor = (token: Token): string => {
    const launchpadProtocol = (token as any).launchpad_protocol?.toLowerCase();
    const mintAddress = token.mint?.toLowerCase() || "";

    // Check if mint address contains "bags" - override any protocol
    if (mintAddress.includes("bags")) {
      return "#31e3ac"; // Green for bags
    }

    if (!launchpadProtocol) {
      return "#31e3ac"; // Default green
    }

    // Special handling for Meteora - use column type since Meteora doesn't have bonding scores
    if (launchpadProtocol.includes("meteora")) {
      // Meteora tokens: red in new pairs and final stretch, yellow in migrated
      if (columnType === "migrated") {
        return "#eab308"; // Yellow for migrated
      } else {
        return "#d11f3a"; // Red for new pairs and final stretch
      }
    }

    // Pumpswap / Pump AMM - always yellow
    if (launchpadProtocol.includes("pumpswap") || launchpadProtocol === "pump_amm" || launchpadProtocol === "pumpamm") {
      return "#eab308";
    }

    // Special handling for Pump - use column type to determine color
    if (launchpadProtocol.includes("pump")) {
      // Pump tokens: green in new pairs and final stretch, yellow in migrated
      if (columnType === "migrated") {
        return "#eab308"; // Yellow for migrated
      } else {
        return "#31e3ac"; // Green for new pairs and final stretch
      }
    }

    // Special handling for LaunchLab - blue in new pairs and final stretch, yellow in migrated
    if (launchpadProtocol.includes("launch")) {
      if (columnType === "migrated") {
        return "#eab308"; // Yellow for migrated
      } else {
        return "#3b82f6"; // Blue for new pairs and final stretch
      }
    }

    // Direct match first
    if (protocolColorMap[launchpadProtocol]) {
      return protocolColorMap[launchpadProtocol];
    }

    if (launchpadProtocol.includes("raydium")) {
      return "#31e3ac"; // Green for raydium (matching MonadTable)
    }

    if (
      launchpadProtocol.includes("moonit") ||
      launchpadProtocol.includes("moonshot") ||
      launchpadProtocol.includes("moonshoot")
    ) {
      return "#eab308"; // Yellow for moonit/moonshot/moonshoot
    }

    if (launchpadProtocol.includes("boop")) {
      return "#134577"; // Dark blue for boopfun
    }

    // Bonk detection: protocol includes "bonk" or "launchlab", OR mint ends in "bonk"
    if (launchpadProtocol.includes("bonk") || launchpadProtocol.includes("launchlab") || mintAddress.endsWith("bonk")) {
      return protocolColorMap["bonk"];
    }

    if (launchpadProtocol.includes("bags")) {
      return "#31e3ac"; // Green for bags
    }

    if (launchpadProtocol.includes("orca")) {
      return protocolColorMap["orca"];
    }

    if (launchpadProtocol.includes("jupiter")) {
      return protocolColorMap["jupiter"];
    }

    // Default to green if no match found
    return "#31e3ac";
  };
  // Get icon based on token data - dynamically maps launchpad_protocol to icon
  const getTokenIcon = (token: Token): string => {
    const launchpadProtocol = (token as any).launchpad_protocol?.toLowerCase();
    const mintAddress = token.mint?.toLowerCase() || "";

    // Check if mint address contains "bags" - override any protocol
    if (mintAddress.includes("bags")) {
      return "https://bags.fm/assets/images/bags-icon.png";
    }

    if (!launchpadProtocol) {
      // Default to pump.fun icon if no protocol info
      return "https://pump.fun/pump-logomark.svg";
    }

    // Map launchpad_protocol to external logo URLs
    if (launchpadProtocol.includes("pump")) {
      return "https://pump.fun/pump-logomark.svg";
    }

    if (launchpadProtocol.includes("meteora")) {
      return "https://s1.coincarp.com/logo/1/meteora.png?style=72&v=1759911013";
    }

    if (launchpadProtocol.includes("raydium")) {
      return "https://s2.coinmarketcap.com/static/img/coins/64x64/8526.png";
    }

    if (launchpadProtocol.includes("boop")) {
      return "https://api.phantom.app/image-proxy/?image=https%3A%2F%2Fdhc7eusqrdwa0.cloudfront.net%2Fassets%2FBOOP_logo_icon_dark_bg.png&anim=true";
    }

    if (
      launchpadProtocol.includes("moonit") ||
      launchpadProtocol.includes("moonshot") ||
      launchpadProtocol.includes("moonshoot")
    ) {
      return "https://avatars.githubusercontent.com/u/174132191?s=280&v=4";
    }

    // Bonk/LaunchLab detection: protocol includes "bonk" or "launchlab", OR mint ends in "bonk"
    if (launchpadProtocol.includes("bonk") || launchpadProtocol.includes("launchlab") || mintAddress.endsWith("bonk")) {
      return "https://s3.coinmarketcap.com/static-gravity/image/a28128d9ff7c49c9ad33ee2f626fda40.png";
    }

    if (launchpadProtocol.includes("bags")) {
      return "https://play-lh.googleusercontent.com/7AxVcu1pumxavcGTb16WBJQU88CDZd0v8q0WzFwfin7zbBvItYMuNQ0Xkqq4srTw4A=w240-h480-rw";
    }

    // Default to pump.fun icon for unknown protocols
    return "https://pump.fun/pump-logomark.svg";
  };

  // AMM/protocol display name for bubble tooltip (matches getTokenFilterCategory logic)
  const getAmmDisplayName = (t: Token): string => {
    const protocol = ((t as any).launchpad_protocol || "").toLowerCase();
    const mint = (t.mint || "").toLowerCase();
    if (mint.includes("bags")) return "Bags";
    if (!protocol) return "Pump";
    if (protocol.includes("pump")) return protocol.includes("pump_amm") || protocol.includes("pumpamm") || protocol.includes("pumpswap") ? "Pump AMM" : "Pump";
    if (protocol.includes("meteora")) return "Meteora AMM";
    if (protocol.includes("raydium")) return "Raydium";
    if (protocol.includes("boop")) return "Boop";
    if (protocol.includes("moonit") || protocol.includes("moonshot") || protocol.includes("moonshoot")) return "Moonit";
    if (protocol.includes("bonk") || protocol.includes("launchlab") || mint.endsWith("bonk")) return protocol.includes("launchlab") ? "LaunchLab" : "Bonk";
    if (protocol.includes("bags")) return "Bags";
    return "Pump";
  };

  const tokenIcon = getTokenIcon(token);
  const protocolColor = getProtocolColor(token);
  const migrationProgress = getMigrationProgress(token);

  // Check if token should have full circle image (no white space)
  const launchpadProtocol =
    (token as any).launchpad_protocol?.toLowerCase() || "";
  const mintAddressLower = token.mint?.toLowerCase() || "";
  const isMeteora = launchpadProtocol.includes("meteora");
  // Check both launchpad_protocol AND mint address suffix for bonk (mint ends in "bonk")
  const isBonk = launchpadProtocol.includes("bonk") || launchpadProtocol.includes("launchlab") || mintAddressLower.endsWith("bonk");
  // Check both launchpad_protocol AND mint address for bags
  const isBags =
    launchpadProtocol.includes("bags") || mintAddressLower.includes("bags");
  const isMoonit =
    launchpadProtocol.includes("moonit") ||
    launchpadProtocol.includes("moonshot") ||
    launchpadProtocol.includes("moonshoot");
  // If mint contains "bags", it overrides Meteora - don't show as Meteora
  const isFullCircleImage =
    (isMeteora && !mintAddressLower.includes("bags")) ||
    isBonk ||
    isBags ||
    isMoonit;

  // Use real migration progress for each token, with fallback to unique test progress
  const getUniqueTestProgress = (token: Token): number => {
    if (!token.symbol) return 0;
    // Create a simple hash from the symbol to get consistent progress per token
    let hash = 0;
    for (let i = 0; i < token.symbol.length; i++) {
      const char = token.symbol.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Convert hash to 0-60% range (New Pairs range)
    return (Math.abs(hash) % 60) / 100;
  };

  // Use real progress if available, otherwise use unique test progress
  // For New Pairs, progress should be 0-60% range, so we scale it to 0-1 for the border
  const finalProgress =
    migrationProgress > 0
      ? migrationProgress
      : isNewPairs
        ? getUniqueTestProgress(token)
        : 0;

  // Scale New Pairs progress to fill more of the border (since they max out at ~60%)
  // Cap at 95% to never show full completion
  const rawScaledProgress = isNewPairs
    ? Math.min(finalProgress / 0.6, 0.95)
    : finalProgress;

  // Smooth animation for progress bar - uses requestAnimationFrame for buttery transitions
  const scaledProgress = useSmoothProgress(rawScaledProgress, 400);

  const handleMouseEnter = () => {
    setShowPreview(true);
  };

  const handleMouseLeave = () => {
    setShowPreview(false);
    setShowImagePreview(false);
    const inner = imageContainerRef.current?.firstElementChild as HTMLDivElement | null;
    if (inner) {
      inner.style.boxShadow = "none";
      inner.style.transform = "scale(1)";
    }
  };

  const handleImageEnter = () => {
    setShowImagePreview(true);
    const inner = imageContainerRef.current?.firstElementChild as HTMLDivElement | null;
    if (inner) {
      inner.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.2)";
      inner.style.transform = "scale(1.08)";
    }
    if (imageContainerRef.current) {
      const rect = imageContainerRef.current.getBoundingClientRect();
      setPreviewPosition({
        top: rect.top + 60,
        left: rect.right + 20,
      });
    }
  };

  const handleImageLeave = () => {
    setShowImagePreview(false);
    const inner = imageContainerRef.current?.firstElementChild as HTMLDivElement | null;
    if (inner) {
      inner.style.boxShadow = "none";
      inner.style.transform = "scale(1)";
    }
  };

  // Check if this is a high bonding Meteora token (only for Final Stretch, NOT for migrated)
  const isFinalStretch = columnType === "final-stretch";
  const bondingPct = (token as any).bonding_pct ?? 0;
  const isMigratedColumn = columnType === "migrated";
  const isHighBondingMeteora =
    isFinalStretch && !isMigratedColumn && isMeteora && bondingPct > 98.6;
  return (
    <>
      <div
        ref={imageContainerRef}
        className="relative flex items-center justify-center"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          width: "68px",
          height: "68px",
          minWidth: "68px",
          minHeight: "68px",
          maxWidth: "68px",
          maxHeight: "68px",
          overflow: "visible",
        }}
      >
        {/* Outer border container */}
        <div
          className="relative rounded-lg transition-all duration-75 ease-out"
          style={{
            border: "none",
            padding: "0",
            width: "66px",
            height: "66px",
            minWidth: "66px",
            minHeight: "66px",
            maxWidth: "66px",
            maxHeight: "66px",
          }}
        >
          {/* Single colored border container (moved inward) */}
          <div
            className="relative rounded-lg"
            style={{
              border: `1px solid ${(() => {
                const isNewColumn = columnType === "new";
                if (
                  isNewColumn &&
                  typeof protocolColor === "string" &&
                  protocolColor.startsWith("#") &&
                  (protocolColor.length === 7 || protocolColor.length === 4)
                ) {
                  // More transparent (~25%) for New Pairs so loading border stands out
                  return protocolColor.length === 7
                    ? `${protocolColor}40`
                    : `${protocolColor}4`;
                }
                return protocolColor;
              })()}`,
              padding: "2px",
              backgroundColor: "#0a0b0d",
              width: "66px",
              height: "66px",
              minWidth: "66px",
              minHeight: "66px",
              maxWidth: "66px",
              maxHeight: "66px",
            }}
          >
            {/* Image container */}
            <div
              className="relative overflow-hidden rounded-md"
              onMouseEnter={handleImageEnter}
              onMouseLeave={handleImageLeave}
              style={{
                width: "60px",
                height: "60px",
                minWidth: "60px",
                minHeight: "60px",
                maxWidth: "60px",
                maxHeight: "60px",
              }}
            >
              <FastImage
                src={imageUrl}
                alt={token.name || token.symbol || ""}
                symbol={token.symbol}
                name={token.name}
                width={60}
                height={60}
                className="h-full w-full object-cover"
                priority={priority}
                showBubble={false}
              />
              {/* Dark dim overlay on hover */}
              <div
                className="pointer-events-none absolute inset-0 rounded-md bg-black/60"
                style={{ opacity: showImagePreview ? 1 : 0, transition: "opacity 150ms" }}
              />
              {/* Camera icon overlay on hover */}
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
                style={{ opacity: showImagePreview ? 1 : 0, transition: "opacity 150ms" }}
              >
                <CiCamera size={20} style={{ color: "rgba(255,255,255,0.8)" }} />
              </div>
            </div>
          </div>
        </div>
        {/* Thin loading border - solid green, clockwise from bottom-right (only for New Pairs) */}
        {isNewPairs && (
          <div className="pointer-events-none absolute inset-0">
            <svg className="h-full w-full" viewBox="0 0 68 68">
              {/* Background border - outer grey border */}

              {/* Inner grey border */}
              <rect
                x="2"
                y="2"
                width="64"
                height="64"
                fill="none"
                stroke="none"
                strokeWidth="0"
                rx="8"
              />

              {/* Progress border - clockwise rounded path starting from bottom-right */}
              {/* Animation handled by useSmoothProgress hook with requestAnimationFrame */}
              <path
                d="M 66 66 L 8 66 Q 2 66 2 60 L 2 8 Q 2 2 8 2 L 60 2 Q 66 2 66 8 L 66 60 Q 66 66 60 66"
                fill="none"
                stroke={protocolColor}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={`${4 * 64}`} // Total perimeter
                strokeDashoffset={`${4 * 64 * (1 - scaledProgress)}`}
              />
            </svg>
          </div>
        )}

        {/* Dynamic protocol icon bubble - aligned to the outer border's bottom-right corner */}
        <div
          className="pointer-events-auto absolute right-0 bottom-0 z-10 flex translate-x-1/5 translate-y-1/4 transform items-center justify-center rounded-full"
          style={{
            width: 16,
            height: 16,
            backgroundColor: "#000000",
            border: `1px solid ${protocolColor}`,
            boxShadow: `0 0 4px ${protocolColor}60`,
          }}
          onMouseEnter={(e) => { const tip = ammBubbleTipRef.current; if (tip) { const r = e.currentTarget.getBoundingClientRect(); tip.style.left = `${r.left + r.width / 2}px`; tip.style.top = `${r.top - 6}px`; tip.style.transform = "translate(-50%, -100%)"; tip.style.opacity = "1"; } }}
          onMouseLeave={() => { const tip = ammBubbleTipRef.current; if (tip) tip.style.opacity = "0"; }}
        >
          <img
            src={tokenIcon}
            alt={`${(token as any).launchpad_protocol || (token as any).protocol || (token as any).launchpadName || "Protocol"} logo`}
            className={`pointer-events-none ${isFullCircleImage ? "h-full w-full object-cover" : "h-3/4 w-3/4 object-contain"} rounded-full`}
            style={{
              filter:
                protocolColor === "#eab308"
                  ? "sepia(1) saturate(3) hue-rotate(-10deg) brightness(1.1)"
                  : "none",
            }}
          />
        </div>
        {createPortal(
          <div
            ref={ammBubbleTipRef}
            className="pointer-events-none fixed z-[9999] rounded px-2 py-1 text-[10px] font-medium whitespace-nowrap"
            style={{ backgroundColor: "rgba(31, 41, 55, 0.95)", color: "#e5e7eb", border: "1px solid rgba(107, 114, 128, 0.3)", opacity: 0, transition: "opacity 150ms" }}
          >
            {getAmmDisplayName(token)}
          </div>,
          document.body
        )}
        {/* Blacklist action buttons — top-left, outside image */}
        <div
          className="pointer-events-none absolute z-20 flex flex-col gap-[3px]"
          style={{
            top: -4,
            left: -4,
            opacity: showPreview ? 1 : 0,
          }}
        >
          {/* Hide Token (by CA) */}
          <button
            className="flex h-6 w-6 items-center justify-center rounded-sm transition-colors hover:bg-white/30"
            style={{ backgroundColor: "rgba(31, 41, 55, 0.9)", pointerEvents: "auto", cursor: "pointer" }}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onBlacklistCA?.(token.mint); }}
            onMouseEnter={(e) => { const tip = hideTokenTipRef.current; if (tip) { const r = e.currentTarget.getBoundingClientRect(); tip.style.left = `${r.right + 6}px`; tip.style.top = `${r.top + r.height / 2}px`; tip.style.transform = "translateY(-50%)"; tip.style.opacity = "1"; } }}
            onMouseLeave={() => { const tip = hideTokenTipRef.current; if (tip) tip.style.opacity = "0"; }}
          >
            <FaRegEyeSlash size={13} style={{ color: "#e5e7eb" }} />
          </button>
          {createPortal(
            <div
              ref={hideTokenTipRef}
              className="pointer-events-none fixed z-[9999] rounded px-2 py-1 text-[10px] font-medium whitespace-nowrap"
              style={{ backgroundColor: "rgba(31, 41, 55, 0.95)", color: "#e5e7eb", border: "1px solid rgba(107, 114, 128, 0.3)", opacity: 0, transition: "opacity 150ms" }}
            >
              Hide Token
            </div>,
            document.body
          )}
          {/* Blacklist Twitter Handle */}
          {blTwitterHandle && (
            <>
              <button
                className="flex h-6 w-6 items-center justify-center rounded-sm transition-colors hover:bg-white/30"
                style={{ backgroundColor: "rgba(31, 41, 55, 0.9)", pointerEvents: "auto", cursor: "pointer" }}
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); onBlacklistTwitter?.(blTwitterHandle); }}
                onMouseEnter={(e) => { const tip = blacklistTwitterTipRef.current; if (tip) { const r = e.currentTarget.getBoundingClientRect(); tip.style.left = `${r.right + 6}px`; tip.style.top = `${r.top + r.height / 2}px`; tip.style.transform = "translateY(-50%)"; tip.style.opacity = "1"; } }}
                onMouseLeave={() => { const tip = blacklistTwitterTipRef.current; if (tip) tip.style.opacity = "0"; }}
              >
                <LuAtSign size={13} style={{ color: "#e5e7eb" }} />
              </button>
              {createPortal(
                <div
                  ref={blacklistTwitterTipRef}
                  className="pointer-events-none fixed z-[9999] rounded px-2 py-1 text-[10px] font-medium whitespace-nowrap"
                  style={{ backgroundColor: "rgba(31, 41, 55, 0.95)", color: "#e5e7eb", border: "1px solid rgba(107, 114, 128, 0.3)", opacity: 0, transition: "opacity 150ms" }}
                >
                  Blacklist @{blTwitterHandle}
                </div>,
                document.body
              )}
            </>
          )}
          {/* Blacklist Dev Wallet */}
          {blDevWallet && (
            <>
              <button
                className="flex h-6 w-6 items-center justify-center rounded-sm transition-colors hover:bg-white/30"
                style={{ backgroundColor: "rgba(31, 41, 55, 0.9)", pointerEvents: "auto", cursor: "pointer" }}
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); onBlacklistDev?.(blDevWallet); }}
                onMouseEnter={(e) => { const tip = blacklistDevTipRef.current; if (tip) { const r = e.currentTarget.getBoundingClientRect(); tip.style.left = `${r.right + 6}px`; tip.style.top = `${r.top + r.height / 2}px`; tip.style.transform = "translateY(-50%)"; tip.style.opacity = "1"; } }}
                onMouseLeave={() => { const tip = blacklistDevTipRef.current; if (tip) tip.style.opacity = "0"; }}
              >
                <LuChefHat size={13} style={{ color: "#e5e7eb" }} />
              </button>
              {createPortal(
                <div
                  ref={blacklistDevTipRef}
                  className="pointer-events-none fixed z-[9999] rounded px-2 py-1 text-[10px] font-medium whitespace-nowrap"
                  style={{ backgroundColor: "rgba(31, 41, 55, 0.95)", color: "#e5e7eb", border: "1px solid rgba(107, 114, 128, 0.3)", opacity: 0, transition: "opacity 150ms" }}
                >
                  Blacklist Dev
                </div>,
                document.body
              )}
            </>
          )}
        </div>

        {/* Minimal border - only shows on image hover */}
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-all duration-75"
          style={{ opacity: showImagePreview ? 1 : 0 }}
        >
          <div
            className="absolute inset-0 rounded-lg"
            style={{
              border: "1px solid rgba(107, 114, 128, 0.3)",
              boxShadow: "none",
            }}
          ></div>
        </div>
      </div>
      {/* Image Preview Window */}
      {showImagePreview && createPortal(
        <div
          className="pointer-events-none fixed z-[9999]"
          style={{
            top: `${previewPosition.top}px`,
            left: `${previewPosition.left}px`,
          }}
        >
          <div className="relative">
            {/* Main preview container */}
            <div
              className="relative overflow-hidden rounded-xl border"
              style={{
                width: "225px",
                height: "225px",
                backgroundColor: AX.surface,
                borderColor: "rgba(107, 114, 128, 0.3)",
                borderWidth: "1px",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
              }}
            >
              <FastImage
                src={imageUrl}
                alt={token.name || token.symbol || ""}
                symbol={token.symbol}
                name={token.name}
                width={225}
                height={225}
                className="h-full w-full object-cover"
                priority={priority}
              />
            </div>
            {/* Migration progress tooltip - only for New Pairs */}
            {isNewPairs && (
              <div
                className="absolute -top-10 left-1/2 z-50 -translate-x-1/2 transform rounded px-2 py-1 text-xs font-medium whitespace-nowrap"
                style={{
                  backgroundColor: "rgba(0, 0, 0, 0.8)",
                  color: "#31e3ac",
                  border: "1px solid #31e3ac20",
                  backdropFilter: "blur(4px)",
                  opacity: showImagePreview ? 1 : 0,
                  transition: "opacity 0.2s ease-out",
                }}
              >
                Progress: {Math.round(scaledProgress * 100)}%
              </div>
            )}

            {/* Token info overlay */}
            <div
              className="absolute -bottom-8 left-1/2 -translate-x-1/2 transform rounded px-2 py-1 text-xs font-medium whitespace-nowrap"
              style={{
                backgroundColor: AX.surface,
                color: AX.text,
                border: `1px solid ${AX.border}`,
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
              }}
            >
              {token.symbol} - {token.name}
            </div>
          </div>
        </div>
      , document.body)}

      {/* Global CSS to remove number input arrows */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
          input[type="number"]::-webkit-outer-spin-button,
          input[type="number"]::-webkit-inner-spin-button {
            -webkit-appearance: none !important;
            margin: 0 !important;
            display: none !important;
            opacity: 0 !important;
            pointer-events: none !important;
            width: 0 !important;
            height: 0 !important;
            position: absolute !important;
            left: -9999px !important;
          }
          
          input[type="number"] {
            -moz-appearance: textfield !important;
            -webkit-appearance: none !important;
          }
          
          input[type="number"]:focus {
            outline: none !important;
            box-shadow: none !important;
          }
        `,
        }}
      />
      {/* CSS for animations */}
      <style jsx>{`
        .number-font {
          font-family:
            Inter,
            -apple-system,
            BlinkMacSystemFont,
            "SF Pro Text",
            system-ui,
            sans-serif;
          font-weight: 600;
          letter-spacing: 0.02em;
        }

        @keyframes shine {
          0% {
            transform: translateX(-100%) translateY(-100%) rotate(45deg);
          }
          50% {
            transform: translateX(100%) translateY(100%) rotate(45deg);
          }
          100% {
            transform: translateX(-100%) translateY(-100%) rotate(45deg);
          }
        }

        /* Wave animations for migrating tokens - Green theme */
        @keyframes smoothWaveFlow {
          0% {
            transform: translateX(-120%);
            opacity: 0;
          }
          5% {
            opacity: 0.3;
          }
          15% {
            opacity: 0.8;
          }
          85% {
            opacity: 0.8;
          }
          95% {
            opacity: 0.3;
          }
          100% {
            transform: translateX(120%);
            opacity: 0;
          }
        }

        @keyframes subtleWaveFlow {
          0% {
            transform: translateX(-100%);
            opacity: 0;
          }
          10% {
            opacity: 0.2;
          }
          20% {
            opacity: 0.3;
          }
          80% {
            opacity: 0.3;
          }
          90% {
            opacity: 0.15;
          }
          100% {
            transform: translateX(100%);
            opacity: 0;
          }
        }

        @keyframes aiGlowPulse {
          0% {
            box-shadow:
              0 0 0px rgba(30, 58, 138, 0),
              0 0 0px rgba(30, 58, 138, 0),
              inset 0 0 0px rgba(30, 58, 138, 0);
            background: rgba(30, 58, 138, 0);
          }
          25% {
            box-shadow:
              0 0 15px rgba(30, 58, 138, 0.4),
              0 0 30px rgba(30, 58, 138, 0.2),
              inset 0 0 15px rgba(30, 58, 138, 0.1);
            background: rgba(30, 58, 138, 0.05);
          }
          50% {
            box-shadow:
              0 0 25px rgba(30, 58, 138, 0.6),
              0 0 50px rgba(30, 58, 138, 0.3),
              inset 0 0 25px rgba(30, 58, 138, 0.15);
            background: rgba(30, 58, 138, 0.08);
          }
          75% {
            box-shadow:
              0 0 15px rgba(30, 58, 138, 0.4),
              0 0 30px rgba(30, 58, 138, 0.2),
              inset 0 0 15px rgba(30, 58, 138, 0.1);
            background: rgba(30, 58, 138, 0.05);
          }
          100% {
            box-shadow:
              0 0 0px rgba(30, 58, 138, 0),
              0 0 0px rgba(30, 58, 138, 0),
              inset 0 0 0px rgba(30, 58, 138, 0);
            background: rgba(30, 58, 138, 0);
          }
        }

        @keyframes greenGlowPulse {
          0% {
            box-shadow:
              0 0 0px rgba(49, 227, 172, 0),
              0 0 0px rgba(49, 227, 172, 0),
              inset 0 0 0px rgba(49, 227, 172, 0);
            background: rgba(49, 227, 172, 0);
          }
          25% {
            box-shadow:
              0 0 15px rgba(49, 227, 172, 0.4),
              0 0 30px rgba(49, 227, 172, 0.2),
              inset 0 0 15px rgba(49, 227, 172, 0.1);
            background: rgba(49, 227, 172, 0.05);
          }
          50% {
            box-shadow:
              0 0 25px rgba(49, 227, 172, 0.6),
              0 0 50px rgba(49, 227, 172, 0.3),
              inset 0 0 25px rgba(49, 227, 172, 0.15);
            background: rgba(49, 227, 172, 0.08);
          }
          75% {
            box-shadow:
              0 0 15px rgba(49, 227, 172, 0.4),
              0 0 30px rgba(49, 227, 172, 0.2),
              inset 0 0 15px rgba(49, 227, 172, 0.1);
            background: rgba(49, 227, 172, 0.05);
          }
          100% {
            box-shadow:
              0 0 0px rgba(49, 227, 172, 0),
              0 0 0px rgba(49, 227, 172, 0),
              inset 0 0 0px rgba(49, 227, 172, 0);
            background: rgba(49, 227, 172, 0);
          }
        }

        /* Minimalistic input styling - remove number arrows */
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }

        input[type="number"] {
          -moz-appearance: textfield;
        }

        /* Additional browser support for removing number input arrows */
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }

        /* Ensure all number inputs in the filter modal have no arrows */
        .minimal-input[type="number"]::-webkit-outer-spin-button,
        .minimal-input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }

        .minimal-input[type="number"] {
          -moz-appearance: textfield;
        }

        /* Minimalistic input styling */
        .minimal-input {
          border: 1px solid transparent;
          transition: all 0.2s ease;
        }

        .minimal-input:focus {
          outline: none !important;
          border-color: #2a2b33 !important;
          box-shadow: none !important;
        }
        /* Specific targeting for filter modal number inputs */
        .filter-modal input[type="number"]::-webkit-outer-spin-button,
        .filter-modal input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }

        .filter-modal input[type="number"] {
          -moz-appearance: textfield;
        }

        /* Comprehensive number input arrow removal for all browsers */
        .filter-modal input[type="number"]::-webkit-outer-spin-button,
        .filter-modal input[type="number"]::-webkit-inner-spin-button,
        .filter-modal .minimal-input[type="number"]::-webkit-outer-spin-button,
        .filter-modal .minimal-input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none !important;
          margin: 0 !important;
          display: none !important;
        }

        .filter-modal input[type="number"],
        .filter-modal .minimal-input[type="number"] {
          -moz-appearance: textfield !important;
        }

        /* Remove all focus highlights and blue borders */
        .filter-modal input[type="number"]:focus,
        .filter-modal .minimal-input[type="number"]:focus {
          outline: none !important;
          box-shadow: none !important;
          border-color: #2a2b33 !important;
        }

        /* Ensure no browser default styling interferes */
        .filter-modal input[type="number"]::-webkit-outer-spin-button,
        .filter-modal input[type="number"]::-webkit-inner-spin-button {
          opacity: 0 !important;
          pointer-events: none !important;
          -webkit-appearance: none !important;
          margin: 0 !important;
          width: 0 !important;
          height: 0 !important;
          position: absolute !important;
          left: -9999px !important;
        }

        /* Additional aggressive spinner removal */
        .filter-modal input[type="number"] {
          -webkit-appearance: none !important;
          -moz-appearance: textfield !important;
        }

        /* Hide any remaining spinner elements */
        .filter-modal input[type="number"]::-webkit-clear-button,
        .filter-modal input[type="number"]::-webkit-search-cancel-button {
          display: none !important;
        }
        /* Global rules for ALL number inputs in the entire modal */
        .filter-modal * input[type="number"]::-webkit-outer-spin-button,
        .filter-modal * input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none !important;
          margin: 0 !important;
          display: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
          width: 0 !important;
          height: 0 !important;
          position: absolute !important;
          left: -9999px !important;
        }

        .filter-modal * input[type="number"] {
          -moz-appearance: textfield !important;
          -webkit-appearance: none !important;
        }

        /* Remove focus highlights for ALL number inputs */
        .filter-modal * input[type="number"]:focus {
          outline: none !important;
          box-shadow: none !important;
          border-color: #2a2b33 !important;
        }

        /* Additional targeting for nested elements */
        div input[type="number"]::-webkit-outer-spin-button,
        div input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none !important;
          margin: 0 !important;
          display: none !important;
        }

        div input[type="number"] {
          -moz-appearance: textfield !important;
        }

        /* Universal number input spinner removal - targets ALL number inputs */
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none !important;
          margin: 0 !important;
          display: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
          width: 0 !important;
          height: 0 !important;
          position: absolute !important;
          left: -9999px !important;
        }

        /* Universal focus highlight removal */
        input[type="number"]:focus {
          outline: none !important;
          box-shadow: none !important;
          border-color: #2a2b33 !important;
        }

        /* Ensure minimal-input class also removes spinners */
        .minimal-input[type="number"]::-webkit-outer-spin-button,
        .minimal-input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none !important;
          margin: 0 !important;
          display: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
          width: 0 !important;
          height: 0 !important;
        }
      `}</style>
    </>
  );
}
function PulseTable({
  title,
  tokens,
  isFirstOrLast,
  loading = false,
  skeletonRowCount = 10,
  showBubbleMetrics = false,
  currentChain: chainProp,
}: PulseTableProps) {
  // Track whether we ever had data — prevents "No tokens found" flash on tab return
  // Uses module-level map so state persists across Next.js Pages Router remounts
  const hadDataRef = useRef(_hadDataByTitle.get(title) ?? false);
  if (tokens && tokens.length > 0) {
    hadDataRef.current = true;
    _hadDataByTitle.set(title, true);
  }

  // Preload images for visible tokens (first 20 for instant loading)
  // This runs in background and doesn't block rendering or new token updates
  useEffect(() => {
    if (tokens && tokens.length > 0) {
      // Fire-and-forget: preload in background without blocking
      // This doesn't interfere with WebSocket updates or new tokens coming in
      preloadTokenImages(tokens, {
        limit: 20,
        priority: "high",
        maxConcurrent: 10,
      }).catch(() => {});
      // Also resolve and preload metadata images (irys.xyz, arweave, IPFS, etc.)
      preloadMetadataImages(tokens, {
        limit: 20,
        maxConcurrent: 5,
      }).catch(() => {});
    }
  }, [tokens]);

  // Blacklist hook + modal state
  const {
    blacklist,
    addItem: addBlacklistItem,
    removeItem: removeBlacklistItem,
    clearCategory: clearBlacklistCategory,
    exportBlacklist,
    importBlacklist,
    totalCount: blacklistTotalCount,
    categoryCounts: blacklistCategoryCounts,
    caSet: blacklistCASet,
    devSet: blacklistDevSet,
    twitterSet: blacklistTwitterSet,
  } = useBlacklist();

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showSnipeModal, setShowSnipeModal] = useState(false);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [slippage, setSlippage] = useState(0);
  const [priority, setPriority] = useState(0);
  const [bribe, setBribe] = useState(0);
  const [sniperSubmitting, setSniperSubmitting] = useState(false);
  const [activeFilterTab, setActiveFilterTab] = useState("New Pairs");
  const [isHeaderHovered, setIsHeaderHovered] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [activeCategoryTab, setActiveCategoryTab] = useState("Audit");
  const [selectedPill, setSelectedPill] = useState("P1"); // Each column has its own preset selection
  // Load thunderAmount from localStorage with fallback - separate storage for each column
  const getInitialThunderAmount = () => {
    if (typeof window !== "undefined") {
      // Determine localStorage key based on column type
      let storageKey = "pulseTableThunderAmount";
      if (title.toLowerCase().includes("final stretch")) {
        storageKey = "pulseTableThunderAmountFinalStretch";
      } else if (title.toLowerCase().includes("migrated")) {
        storageKey = "pulseTableThunderAmountMigrated";
      } else {
        storageKey = "pulseTableThunderAmountNewPairs";
      }

      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 0) {
          return parsed.toString();
        }
      }
    }
    return "0.1"; // Set a reasonable default instead of 0.0
  };

  const [thunderAmount, setThunderAmount] = useState(getInitialThunderAmount);
  const [showPillTooltip, setShowPillTooltip] = useState<string | null>(null);
  const [showXPreview, setShowXPreview] = useState<number | null>(null);
  const [showSearchDropdown, setShowSearchDropdown] = useState<number | null>(
    null,
  );
  const [buttonPosition, setButtonPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [waveTokens, setWaveTokens] = useState<Set<number>>(new Set()); // Wave animation for migrating tokens
  const { solPrice } = useSolPrice(); // Use shared SOL price from Footer context

  // State for filtered tokens from API
  const [filteredTokens, setFilteredTokens] = useState<Token[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const lowerTitle = title.toLowerCase();
      const cacheKey = `pulse_protocol_cache_${lowerTitle.replace(/\s+/g, '_')}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (!cached) return [];
      const parsed = JSON.parse(cached);
      // Verify cache matches current protocol filters
      const filterKey = lowerTitle.includes('final') ? 'pulse_filters_final_stretch'
        : lowerTitle.includes('migrated') ? 'pulse_filters_migrated'
        : lowerTitle.includes('new') ? 'pulse_filters_new_pairs'
        : `pulse_filters_${lowerTitle.replace(/\s+/g, '_')}`;
      const filterRaw = localStorage.getItem(filterKey);
      const currentProtos: string[] = filterRaw ? (JSON.parse(filterRaw).protocols || []) : [];
      const hasSpecific = currentProtos.length > 0 && !currentProtos.includes('All');
      if (hasSpecific && parsed.protocols &&
          JSON.stringify([...parsed.protocols].sort()) === JSON.stringify([...currentProtos].sort()) &&
          parsed.data?.length > 0) {
        return parsed.data; // Already normalized when cached
      }
    } catch {}
    return [];
  });
  const [isFetchingFiltered, setIsFetchingFiltered] = useState(false);
  const isNewPairs = title.toLowerCase().includes("new");
  const isMigrated = title.toLowerCase().includes("migrated");

  // Helper to normalize HTTP token data for consistent filtering
  // Ensures all filter-relevant fields have default values with both field name variants
  const normalizeHttpToken = useCallback((rawToken: any): Token => {
    const holderValue = rawToken.holder_count ?? rawToken.holders ?? rawToken.unique_wallets_24h ?? 0;
    const devPercentValue = rawToken.dev_percent ?? rawToken.dev_held_percentage ?? 0;
    const sniperPercentValue = rawToken.sniper_percent ?? rawToken.sniper_held_percentage ?? 0;
    const insiderPercentValue = rawToken.insider_percent ?? rawToken.insider_held_percentage ?? 0;
    const bundlePercentValue = rawToken.bundle_percent ?? rawToken.bundled_percentage ?? rawToken.bundler_held_percentage ?? 0;

    return {
      ...rawToken,
      // Holder count variants
      holder_count: holderValue,
      holders: holderValue,
      unique_wallets_24h: rawToken.unique_wallets_24h ?? holderValue,
      // KOL count
      kol_count: rawToken.kol_count ?? 0,
      // Transaction counts
      total_buys_24h: rawToken.total_buys_24h ?? 0,
      total_sells_24h: rawToken.total_sells_24h ?? 0,
      total_buys_5m: rawToken.total_buys_5m ?? 0,
      total_sells_5m: rawToken.total_sells_5m ?? 0,
      total_buys_1h: rawToken.total_buys_1h ?? 0,
      total_sells_1h: rawToken.total_sells_1h ?? 0,
      total_buys_6h: rawToken.total_buys_6h ?? 0,
      total_sells_6h: rawToken.total_sells_6h ?? 0,
      // Dev percent variants
      dev_percent: devPercentValue,
      dev_held_percentage: devPercentValue,
      // Sniper percent variants
      sniper_percent: sniperPercentValue,
      sniper_held_percentage: sniperPercentValue,
      // Insider percent variants
      insider_percent: insiderPercentValue,
      insider_held_percentage: insiderPercentValue,
      // Bundle percent variants
      bundle_percent: bundlePercentValue,
      bundled_percentage: bundlePercentValue,
      bundler_held_percentage: bundlePercentValue,
      bundle_wallet_count: rawToken.bundle_wallet_count ?? 0,
      bundler_count: rawToken.bundle_wallet_count ?? rawToken.bundler_count ?? 0,
      // Top holders
      top10_holders_pct: rawToken.top10_holders_pct ?? rawToken.top_10_holders_percent ?? 0,
      // Dev activity
      dev_tokens_created: rawToken.dev_tokens_created ?? 0,
      dev_tokens_migrated: rawToken.dev_tokens_migrated ?? 0,
      // Market metrics
      market_cap_usd: rawToken.market_cap_usd ?? rawToken.fully_diluted_value ?? rawToken.fdv ?? 0,
      liquidity_usd: rawToken.liquidity_usd ?? rawToken.total_liquidity_usd ?? 0,
      volume_24h: rawToken.volume_24h ?? 0,
      // Total fees in lamports
      total_fees_lamports: rawToken.total_fees_lamports ?? 0,
    } as Token;
  }, []);

  // Local copy of tokens prop that can receive price updates
  // This solves the issue where price_update events couldn't modify the tokens prop
  const [baseTokens, setBaseTokens] = useState<Token[]>(() =>
    tokens.map(normalizeHttpToken)
  );

  // Sync baseTokens with tokens prop when it changes (initial load or parent refresh)
  // SMART MERGE: Preserve good market cap values from WebSocket updates
  useEffect(() => {
    if (tokens && tokens.length > 0) {
      setBaseTokens((prev) => {
        // Normalize all incoming tokens for consistent filtering
        const normalizedTokens = tokens.map(normalizeHttpToken);

        if (prev.length === 0) return normalizedTokens; // First load - just use parent data

        // Create a map of existing tokens with their market caps
        const existingMap = new Map<string, Token>();
        prev.forEach((t) => existingMap.set(t.mint, t));

        // Merge: use parent data but preserve good market cap from existing
        return normalizedTokens.map((newToken) => {
          const existing = existingMap.get(newToken.mint);
          if (!existing) return newToken;

          // If existing has a good market cap but new doesn't, preserve it
          const existingMc = getTokenMarketCap(existing);
          const newMc = getTokenMarketCap(newToken);

          if (existingMc > 0 && newMc === 0) {
            // Preserve the good market cap from WebSocket updates
            return {
              ...newToken,
              market_cap_usd: existing.market_cap_usd,
              fully_diluted_value: (existing as any).fully_diluted_value,
            };
          }
          return newToken;
        });
      });
    }
  }, [tokens, normalizeHttpToken]);
  // State for WebSocket real-time updates
  const wsCacheStorageKey = useMemo(() => {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes("final")) return "pulse_ws_cache_final_stretch";
    if (lowerTitle.includes("migrated")) return "pulse_ws_cache_migrated";
    if (lowerTitle.includes("new")) return "pulse_ws_cache_new";
    return `pulse_ws_cache_${lowerTitle}`;
  }, [title]);

  const [wsTokens, setWsTokens] = useState<Token[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const cached = window.localStorage.getItem(wsCacheStorageKey);
      if (!cached) return [];
      const parsed = JSON.parse(cached);
      if (
        parsed &&
        Array.isArray(parsed.data) &&
        typeof parsed.timestamp === "number" &&
        Date.now() - parsed.timestamp <= WS_CACHE_TTL_MS
      ) {
        // Skip liquidity filtering for New Pairs and Migrated - show all tokens instantly
        if (isNewPairs || isMigrated) {
          return parsed.data as Token[];
        }
        return filterNonZeroLiquidity(parsed.data as Token[]);
      }
    } catch (error) {
      console.warn("[PulseTable] Failed to restore ws cache:", error);
    }
    return [];
  });

  // Storage key for persisting filters per column
  const filterStorageKey = useMemo(() => {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes("final")) return "pulse_filters_final_stretch";
    if (lowerTitle.includes("migrated")) return "pulse_filters_migrated";
    if (lowerTitle.includes("new")) return "pulse_filters_new_pairs";
    return `pulse_filters_${lowerTitle.replace(/\s+/g, "_")}`;
  }, [title]);

  // Default filters for this column type
  const getDefaultFilters = useCallback((): PulseFilters => ({
    ...defaultPulseFilters,
    sortBy:
      isNewPairs || title.toLowerCase().includes("migrated")
        ? "timestamp"
        : "marketCap",
    sortOrder: "desc",
  }), [isNewPairs, title]);

  // Local filters state - each column has independent filters
  // Initialize from localStorage if available
  const [filters, setFilters] = useState<PulseFilters>(() => {
    if (typeof window === "undefined") return getDefaultFilters();
    try {
      const stored = window.localStorage.getItem(filterStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge with defaults to handle any new filter fields added later
        return { ...getDefaultFilters(), ...parsed };
      }
    } catch (error) {
      console.warn("[PulseTable] Failed to load persisted filters:", error);
    }
    return getDefaultFilters();
  });

  // Persist filters to localStorage whenever they change
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(filterStorageKey, JSON.stringify(filters));
    } catch (error) {
      // Silent fail - not critical
    }
  }, [filters, filterStorageKey, title]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const cached = window.localStorage.getItem(wsCacheStorageKey);
      if (!cached) return;
      const parsed = JSON.parse(cached);
      if (
        parsed &&
        Array.isArray(parsed.data) &&
        typeof parsed.timestamp === "number" &&
        Date.now() - parsed.timestamp <= WS_CACHE_TTL_MS
      ) {
        // Skip liquidity filtering for New Pairs and Migrated - show all tokens instantly
        if (isNewPairs || isMigrated) {
          setWsTokens(parsed.data as Token[]);
        } else {
          setWsTokens(filterNonZeroLiquidity(parsed.data as Token[]));
        }
      }
    } catch (error) {
      console.warn(
        "[PulseTable] Failed to rehydrate ws cache on key change:",
        error,
      );
    }
  }, [wsCacheStorageKey, isNewPairs, isMigrated]);

  // Pending filters for Apply button functionality
  const [pendingFilters, setPendingFilters] = useState(filters);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const prevHasSpecificProtocolsRef = useRef(false);
  const isInitialMountRef = useRef(true);

  // Determine channel from title (moved up for use in localStorage caching)
  const channel = useMemo(() => {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes("new")) return "new";
    if (lowerTitle.includes("final")) return "final_stretch";
    if (lowerTitle.includes("migrated")) return "migrated";
    return undefined;
  }, [title]);

  // Sync pendingFilters with filters on initial mount (for persisted filters)
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      // On initial mount, ensure pendingFilters matches persisted filters
      setPendingFilters(filters);
    }
  }, [filters, title]);

  // NOTE: localStorage caching moved down to after usePulseFromQueryCache for variable ordering
  const lastCacheWriteRef = useRef(0);

  // Functions to handle filter changes
  const handleApplyFilters = () => {
    setFilters(pendingFilters);
    setHasPendingChanges(false);
    setShowFilters(false);
  };

  // Map frontend protocol names to backend protocol names
  // These must match the exact launchpad_protocol values from the backend
  const mapProtocolToBackend = useCallback((protocol: string): string[] => {
    switch (protocol) {
      case "Pump":
        return ["pump.fun", "pump", "pumpfun"];
      case "Pump AMM":
        return ["pump_amm", "pumpamm", "pumpswap", "pump_swap"];
      case "Raydium":
        return ["raydium", "raydiumlaunchpad"];
      case "Meteora AMM":
        return ["meteora"];
      case "Meteora AMM V2":
        return ["meteora"]; // V2 also uses "meteora" as the backend value
      case "Bonk":
        return ["bonk", "bonk.fun", "bonkfun", "launchlab", "raydiumlaunchpad"];
      case "Bags":
        return ["bags"];
      case "Moonit":
        return ["moonit", "moonshot", "moonshoot"];
      case "Boop":
        return ["boop", "boopfun"];
      case "LaunchLab":
        return ["launchlab", "bonk", "bonk.fun", "bonkfun", "raydiumlaunchpad"];
      case "All":
        return ["all"];
      default:
        return [protocol.toLowerCase()];
    }
  }, []);

  // Fetch filtered tokens from API when protocols are selected
  const fetchFilteredTokens = useCallback(
    async (protocols: string[]) => {
      if (protocols.length === 0) {
        setFilteredTokens([]);
        // Clear protocol cache
        try {
          const cacheKey = `pulse_protocol_cache_${title.toLowerCase().replace(/\s+/g, '_')}`;
          sessionStorage.removeItem(cacheKey);
        } catch {}
        return;
      }

      setIsFetchingFiltered(true);
      try {
        const backendProtocols = protocols.flatMap(mapProtocolToBackend);
        const protocolsParam = backendProtocols.join(",");

        // Determine the endpoint based on column type
        let endpoint = "/api/token-service/pulse-new";
        let limit = 50;
        if (title.toLowerCase().includes("final stretch")) {
          endpoint = "/api/token-service/pulse-final-stretch";
          limit = 50;
        } else if (title.toLowerCase().includes("migrated")) {
          endpoint = "/api/token-service/pulse-migrated";
          limit = 70;
        }

        const response = await fetch(
          `${endpoint}?limit=${limit}&protocols=${encodeURIComponent(protocolsParam)}&t=${Date.now()}`,
        );
        if (response.ok) {
          const data = await response.json();
          const rawTokens = Array.isArray(data) ? data : [];
          // Normalize HTTP tokens for consistent filtering (same as WebSocket tokens)
          const normalizedTokens = rawTokens.map(normalizeHttpToken);
          // Skip liquidity filtering for New Pairs and Migrated
          const tokensToSet = (isNewPairs || isMigrated) ? normalizedTokens : filterNonZeroLiquidity(normalizedTokens);
          setFilteredTokens(tokensToSet);
          // Cache protocol-filtered results for instant restoration on navigation back
          try {
            const cacheKey = `pulse_protocol_cache_${title.toLowerCase().replace(/\s+/g, '_')}`;
            sessionStorage.setItem(cacheKey, JSON.stringify({
              data: tokensToSet.slice(0, 50),
              protocols: protocols,
            }));
          } catch {}
        } else {
          console.error("Failed to fetch filtered tokens:", response.status);
          setFilteredTokens([]);
        }
      } catch (error) {
        console.error("Error fetching filtered tokens:", error);
        setFilteredTokens([]);
      } finally {
        setIsFetchingFiltered(false);
      }
    },
    [title, normalizeHttpToken],
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // WORKER-BASED WEBSOCKET: Stays alive during navigation + all fixes applied
  // - New object references for React change detection
  // - No requestAnimationFrame batching
  // - IndexedDB persistence + Cross-tab sync
  // ═══════════════════════════════════════════════════════════════════════════
  const {
    newTokens: directNewTokens,
    finalStretchTokens: directFinalStretchTokens,
    migratedTokens: directMigratedTokens,
    connected: directConnected,
  } = usePulseFromQueryCache({ channel });

  // ═══════════════════════════════════════════════════════════════════════════
  // REMOVED: wsTokens sync effect - was causing progressive latency!
  // The effect was calling setWsTokens() on every WebSocket message, creating
  // duplicate state updates. Now we use directNewTokens/directFinalStretchTokens/
  // directMigratedTokens directly in the memoized tokens computation.
  // wsTokens is only used as initial cache fallback from localStorage.
  // ═══════════════════════════════════════════════════════════════════════════

  // THROTTLED localStorage writes - prevent blocking main thread on rapid updates
  // Only write every 5 seconds max to avoid performance degradation
  // Uses direct bridge tokens (not wsTokens state) for freshest data
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasSpecificProtocols =
      filters.protocols.length > 0 && !filters.protocols.includes("All");
    if (hasSpecificProtocols) return;

    // Select the right direct tokens based on channel
    const directTokensForChannel = (
      channel === 'new' ? directNewTokens :
      channel === 'final_stretch' ? directFinalStretchTokens :
      channel === 'migrated' ? directMigratedTokens :
      []
    );

    // Only cache if we have data
    if (directTokensForChannel.length === 0) return;

    // Throttle writes to prevent main thread blocking
    const now = Date.now();
    if (now - lastCacheWriteRef.current < 5000) return;
    lastCacheWriteRef.current = now;

    // Use requestIdleCallback for non-blocking write (falls back to setTimeout)
    const writeCache = () => {
      try {
        const payload = {
          data: directTokensForChannel.slice(0, 50), // Only cache first 50 tokens
          timestamp: Date.now(),
        };
        window.localStorage.setItem(wsCacheStorageKey, JSON.stringify(payload));
      } catch (error) {
        // Silent fail - not critical
      }
    };

    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(writeCache, { timeout: 2000 });
    } else {
      setTimeout(writeCache, 100);
    }
  }, [channel, directNewTokens, directFinalStretchTokens, directMigratedTokens, wsCacheStorageKey, filters.protocols]);

  // Fetch filtered tokens when protocols change
  useEffect(() => {
    // Treat ['All'] the same as no filter - don't fetch filtered data
    const hasSpecificProtocols =
      filters.protocols.length > 0 && !filters.protocols.includes("All");

    if (hasSpecificProtocols) {
      fetchFilteredTokens(filters.protocols);
      setWsTokens([]); // Clear stale WebSocket tokens when filter changes
    } else {
      // When switching back to 'All', clear filtered tokens and rely on parent data + WebSocket
      // Only reset wsTokens if we previously had a specific protocol filter applied
      setFilteredTokens([]);
      if (prevHasSpecificProtocolsRef.current) {
        setWsTokens([]);
      }
    }

    prevHasSpecificProtocolsRef.current = hasSpecificProtocols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.protocols, title]);

  // Save thunderAmount to localStorage whenever it changes - separate storage for each column
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Determine localStorage key based on column type
      let storageKey = "pulseTableThunderAmount";
      if (title.toLowerCase().includes("final stretch")) {
        storageKey = "pulseTableThunderAmountFinalStretch";
      } else if (title.toLowerCase().includes("migrated")) {
        storageKey = "pulseTableThunderAmountMigrated";
      } else {
        storageKey = "pulseTableThunderAmountNewPairs";
      }

      localStorage.setItem(storageKey, thunderAmount);
    }
  }, [thunderAmount, title]);

  const handleResetFilters = () => {
    const resetFilters = getDefaultFilters();
    setPendingFilters(resetFilters);
    setFilters(resetFilters);
    setHasPendingChanges(false);
    // Clear persisted filters from localStorage
    try {
      window.localStorage.removeItem(filterStorageKey);
    } catch (error) {
      // Silent fail
    }
    // Also clear protocol cache
    try {
      const cacheKey = `pulse_protocol_cache_${title.toLowerCase().replace(/\s+/g, '_')}`;
      sessionStorage.removeItem(cacheKey);
    } catch {}
  };

  // Update pending filters - user must click "Apply All" to apply them
  const handlePendingFilterChange = (updater: (prev: any) => any) => {
    setPendingFilters(updater);
    setHasPendingChanges(true);
  };

  // Update pending changes when filters change
  useEffect(() => {
    setHasPendingChanges(
      JSON.stringify(filters) !== JSON.stringify(pendingFilters),
    );
  }, [filters, pendingFilters]);

  const router = useRouter();

  // Quick buy functionality
  const { user, solBalance, walletList, walletBalances, selectedWalletIds } =
    useUser();
  const { presets, activePreset, setActivePreset } = useQuickBuy();

  // Pending toast ref for Solana quick buys (for WebSocket instant tx updates)
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

  const { prefetchImmediate: prefetchBuyOrder } = usePrefetchOrder();

  // Callback for instant txHash update via WebSocket (fires before HTTP response)
  const handleSolanaQuickBuyWsTxHash = useCallback(
    (data: {
      txHash: string;
      tokenAddress: string;
      tradeType: "buy" | "sell";
      explorerUrl: string;
    }) => {
      const pending = pendingSolanaQuickBuyToastRef.current;
      if (
        !pending ||
        pending.tokenAddress.toLowerCase() !== data.tokenAddress.toLowerCase()
      )
        return;

      // For multi-wallet trades: Don't update the toast (count was already shown at timer cap)
      // For single wallet: Update the link element with clickable Solana logo
      if (pending.totalSelectedWallets === 1) {
        const linkEl = document.getElementById(`link-${pending.id}`);
        if (linkEl) {
          linkEl.innerHTML = `<a href="${data.explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4" alt="Solana" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
        }
      }

      // Set duration for auto-dismiss after 10s
      setTimeout(() => {
        if (pendingSolanaQuickBuyToastRef.current?.id === pending.id) {
          toast.dismiss(pending.id);
          pendingSolanaQuickBuyToastRef.current = null;
        }
      }, 10000);
    },
    [],
  );

  // Use shared WebSocket context for instant txHash notifications
  // This eliminates duplicate connections - single connection shared via context
  const { connected: solanaWsConnected } = useTxHashCallback(
    'pulse-table',
    handleSolanaQuickBuyWsTxHash
  );

  useEffect(() => {
    if (!showSnipeModal) return;
    const presetIndex = getPresetIndex();
    const preset = presets[presetIndex];
    const quickSettings = (preset?.quickBuySettings ?? {}) as any;
    setSlippage(quickSettings.maxSlippage ?? 0);
    setPriority(quickSettings.priority ?? 0);
    setBribe(quickSettings.bribe ?? 0);
    setSniperSubmitting(false);
  }, [showSnipeModal, presets, selectedPill]);

  // Get the preset index from the selected pill for this column
  const getPresetIndex = () => {
    return parseInt(selectedPill.replace("P", "")) - 1;
  };
  // QUICK BUY handler – with Monad-style toast
  const handleQuickBuy = async (token: Token) => {
    if (!user?.bearerToken || !user?.id) {
      showEnhancedToast("warning", "Please connect your wallet to trade", {
        title: "Authentication Required",
      });
      return;
    }

    const buyAmount = parseFloat(thunderAmount);
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

    const presetIndex = getPresetIndex();
    const preset = presets[presetIndex];
    if (!preset) {
      showEnhancedToast("error", "Quick buy preset not configured", {
        title: "Configuration Error",
        suggestions: ["Update your presets in settings"],
      });
      return;
    }

    const settings = preset.quickBuySettings;
    const poolType = getPoolTypeFromToken(token);

    // Pre-calculate which wallets will actually be used (have sufficient balance)
    const { allocations, total } = buildSolanaWalletAllocations({
      amount: buyAmount,
      walletList,
      walletBalances,
      selectedWalletIds: selectedWalletIds?.sol || [],
      priorityFee: settings.priority || 0.0001,
      bribe: settings.bribe || 0,
    });
    const walletsWithBalance = allocations.length;
    const isMultiWallet = walletsWithBalance > 1;

    // Pre-validate before showing toast
    const ataExists = await checkAtaExists(token.mint, user?.publicKey).catch(() => null);
    const validation = validateSolanaBuy(buyAmount, allocations, walletBalances, walletList, selectedWalletIds?.sol || [], settings.priority, settings.bribe, ataExists);
    if (!validation.valid) {
      showTradeValidationError(validation.error, getResolvedTokenImage(token), token.symbol || token.name || 'Token');
      return;
    }

    // CRITICAL: Verify the pair address before toast to avoid checkmark-before-error UX
    let poolAddress = token.migrated_pool_address || token.pair_address || "";
    if (token.mint) {
      const verifiedPairAddress = await fetchVerifiedPairAddress(token.mint);
      if (verifiedPairAddress) {
        poolAddress = verifiedPairAddress;
      }
    }

    // Generate random timer cap (0.40-0.60s)
    const timerCap = 0.3 + Math.random() * 0.2;
    const uniqueToastId = `solana-quickbuy-${Date.now()}-${Math.random()}`;
    const startTime = Date.now();
    let timerFinished = false;
    let tradeErrored = false;

    // Extract token image - use resolved version to get cached metadata images
    const tokenImage = getResolvedTokenImage(token);
    const tokenName = token.symbol || token.name || "Token";

    // Show animated toast with timer
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
              {/* Default Solana avatar (becomes clickable once tx hash arrives) */}
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

    // Start timer animation - update every 50ms, show checkmark when cap is reached
    const tick = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const displayTime = Math.min(elapsed, timerCap).toFixed(2);
      const timerEl = document.getElementById(`timer-${uniqueToastId}`);
      if (timerEl) {
        timerEl.textContent = `(${displayTime}s)`;
      }

      // When timer reaches cap, show checkmark and wallet count (or placeholder for logo)
      if (!timerFinished && elapsed >= timerCap) {
        timerFinished = true;
        if (!tradeErrored) {
          const checkEl = document.getElementById(`check-${uniqueToastId}`);
          if (checkEl) {
            checkEl.style.display = "block";
          }
          const linkEl = document.getElementById(`link-${uniqueToastId}`);
          if (linkEl) {
            if (isMultiWallet) {
              // Show wallet count immediately for multi-wallet
              linkEl.textContent = `${walletsWithBalance}/${total}`;
              linkEl.className =
                "text-xs text-blue-400 font-medium flex-shrink-0";
            } else {
              // Single wallet: show Solana icon immediately (clickable once tx hash arrives)
              linkEl.innerHTML = `<img src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4" alt="Solana" class="w-4 h-4 rounded-full opacity-70" style="cursor: default;" />`;
              linkEl.className = "flex-shrink-0";
            }
            // For single wallet, leave empty - will be filled by WebSocket with logo
          }
        }
        // Stop timer after reaching cap to avoid jitter
        timerHandle = null as any;
        return;
      }
      timerHandle = requestAnimationFrame(tick) as any;
    };
    let timerHandle = requestAnimationFrame(tick) as any;

    // Store pending toast info for WebSocket instant update
    pendingSolanaQuickBuyToastRef.current = {
      id: uniqueToastId,
      tokenImage,
      tokenName,
      fakeTime: timerCap.toFixed(2),
      tokenAddress: token.mint || "",
      startTime,
      timerHandle,
      totalSelectedWallets: walletsWithBalance,
    };

    const cleanupTradeListener = listenForTradeEvents(token.mint || '', uniqueToastId, (v) => { tradeErrored = v; }, 'solana');

    try {
      const baseMint = token.mint || "";
      const quoteMint = SOL_MINT_ADDRESS;

      notifyTradePending({ tokenAddress: baseMint, tradeType: 'buy', chain: 'sol' });
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
        imageUrl: await resolveTokenImage(token) || undefined,
        authToken: user.bearerToken,
        walletList,
        walletBalances,
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
            broadcastTradeCompleted({ tokenAddress: baseMint, tradeType: 'buy', chain: 'sol', txHash, tokenName: token.name, tokenSymbol: token.symbol, imageUrl: tokenImage, solAmountSpent: buyAmount });
          }
        },
      });

      // If single wallet and we have a tx hash, show clickable Solana icon immediately
      const firstTxHash =
        multiResult?.results?.find(
          (r: any) => (r.result as any)?.hash || (r.result as any)?.txid,
        )?.result?.hash ||
        multiResult?.results?.find(
          (r: any) => (r.result as any)?.hash || (r.result as any)?.txid,
        )?.result?.txid;

      if (firstTxHash && !isMultiWallet) {
        const linkEl = document.getElementById(`link-${uniqueToastId}`);
        if (linkEl) {
          const explorerUrl = `https://solscan.io/tx/${firstTxHash}`;
          linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4" alt="Solana" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
          linkEl.className = "";
        }
        if (timerHandle) {
          cancelAnimationFrame(timerHandle);
        }
        setTimeout(() => toast.dismiss(uniqueToastId), 10000);
      }

      // Dispatch event to refresh chart price lines
      if (typeof window !== "undefined" && token.mint) {
        window.dispatchEvent(
          new CustomEvent("solanaQuickTrade", {
            detail: { tokenAddress: token.mint },
          }),
        );
      }
      dispatchBalanceRefresh('sol');
      broadcastTradeCompleted({ tokenAddress: token.mint, tradeType: 'buy', chain: 'sol', tokenName: token.name, tokenSymbol: token.symbol, imageUrl: tokenImage, solAmountSpent: buyAmount });

      return { success: true };
    } catch (error: any) {
      tradeErrored = true;
      cleanupTradeListener();
      // Stop timer on error
      if (timerHandle) {
        cancelAnimationFrame(timerHandle);
      }

      // Transform pending toast to error in-place
      console.error("❌ Quick Buy failed:", error);
      if (pendingSolanaQuickBuyToastRef.current) {
        transformToastToError(pendingSolanaQuickBuyToastRef.current.id, mapTradeErrorMessage(error), tokenImage, tokenName);
        pendingSolanaQuickBuyToastRef.current = null;
      }

      return { success: false, error };
    }
  };

  // Protocol and quote token data with official icons from web3icons
  const protocols = [
    {
      name: "All",
      icon: <span className="text-sm">🌐</span>,
      color: "#9333ea",
    },
    {
      name: "Pump",
      icon: (
        <Image
          src="/pump.svg"
          alt="Pump"
          width={16}
          height={16}
          className="rounded-full"
        />
      ),
      color: "#31e3ac", // Green (matching MonadTable)
    },
    {
      name: "Bonk",
      icon: (
        <div
          className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-xs font-bold"
          style={{ color: "#f0f5f5" }}
        >
          B
        </div>
      ),
      color: "#ff6b35",
    },
    {
      name: "Bags",
      icon: (
        <Image
          src="https://bags.fm/assets/images/bags-icon.png"
          alt="Bags"
          width={16}
          height={16}
          className="rounded-full"
        />
      ),
      color: "#31e3ac", // Green (matching MonadTable)
    },
    // { name: 'Moonshot', icon: <Image src="https://play-lh.googleusercontent.com/bmv_OqsfmlR2Tfd7-4I2HS1twZdiJmmyX0warik6UxhUdSfegPMegeIRxxj9LGUBAQM" alt="Moonshot" width={16} height={16} className="rounded-full" />, color: '#a855f7' },
    // { name: 'Heaven', icon: <Image src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAOEAAADhCAMAAAAJbSJIAAAAclBMVEX///8AAAD09PShoaGrq6v4+Pjw8PBhYWHt7e3g4OD6+vpISEhERETR0dFbW1svLy9ubm7n5+cbGxt5eXkoKCjIyMiDg4OQkJBnZ2cICAg1NTXAwMC0tLQ9PT3Y2NiLi4ubm5tTU1MgICC5ubl+fn4TExO3R7UzAAAF+ElEQVR4nO2di5qqIBCA6eJul1Nm96wtq+39X/Gk2WaGAgIOMx//C8T/GbdhGFiHOgy6Adbxhvjxhvjxhvjxhvjxhvjxhvjxhvjxhvjxhvjxhvjxhvjxhua5xdPNdXX8Yi+6x9V1Mw13Vn6vXcOfWX9SVHtncOxtY+O/2aLh7BCNKu2ejKLet9mfbcvwdyWUe1nuTUq2Yjjdy+s96B7+mfpx+4bzTaTql3Gcmfl924bhIWjkl/K1NtECu4bLa2O9jGCj3wabhuFBzy9lsNBthUXDRDw3yDCc6jXDmuH3wIhfylWrIZYMbwrTn5hgq9EUO4aL5gMoH43PaMVQeYIXE42bNsaC4Y+5Hljk1LA55g3XVvzuHJq1x7hh35bgfR03d8FwYk/wPv2H4IbLoU3B+77qB9gwtjPGFFFf4Jg0DE3PghxGyooGDcOufcE7ZzDDuIUvmKLaF40ZXuz3wZyvJYyh5VG0yBDE0OheQsQKwNDiSoZHr3XDRbuCjClsGI0Yhm0LsuDSrmGzgKgWk1YNDYTU1JGOMxow/IYQZEx2VjRg2NpU/86xNUOQ/2iKZMxf2/AflCDrym35tQ2PYIas34ph63N9Eamghq4h0DDzQGp9qml4ghRkTOagWNOwnW19JXvrhhtYQamPqGcI2gtTJOLgWoagA2lGIJ4TtQwB58In4vMaHcMxtB6TidnoGLYcuuAjHGt0DMHHmRTh0k3DEGhfWCKwaGjhLLsJoqCUhqGZdBltRH/T5oZnaLWcyJqhEyNpiiBLo7lhiwcV9QiiGY0N5450Q+EusbHhFlrsD8GyppHhLQwvPWixF/WRUzXD+XTdnwyjQRC0dOArRX3eu4LhQuY2AQT1Z22ShnHizND5SX0sQ8ZweXJYj4mGGrHh+OpSn+OiZTi2mqhmCA1DFH6M1WbY1BlewI6VFKmdLmoM1873vye14ahKw7kDgTRZkiaGCzcndz61U36FIZYe+EDd8IboH5qibPgP+ERJGVXDKXSDlVE0nEG3Vx01Q4SCaobuBCcUUDF0JQiqhoLhEtM8/0LB0InTJHXkDVtN1jaItGEC3dKmyBrC5eDpImuItBMyaUNnzpLUkTPEORM+kDN0OyRaj5ThL3QrtZjUVHp5GqKJOlUQ/QoMwZMM9RlUfMfcENuunsuEmxXNqHzCDN6R/sMQ4OKSHTgHbZkhym0vn+HHpbbMEMf5ixxBOb0mNZxDt8os50/DBLpNhhl/GJIZZ56MS4YxdIOME8TvhsD3XmwQvRtSGkmfrIqGu+qSqYjZFAzxHcRIMX4ZWqtcBcvwZehIQrpxNn+GyM575cmvRDGaA01Kvs9gS+iG2ONxYYjhjXQLeUyKjNDe8IPsIzKik0VGVhOUOZSRbp7MEPFxhZgNecOIvGE61hA3TMgbDskbjuIOS6AbYZcZ7RmfpWUlmBs3sq1xJL3yTvnaUd49ZYRshzeNRoox4SjGgxndSFTOiSHPMxHSZ6iToSS4G3bIBtsyUkOsebNypIa0122pIe05PzVEnZYo5JQaUsmI4jJ7BNwIM84MKY+mS2pZX2UGeeYe3bFmkhvSnRJ7zwxaspvE7dOQYNZQRvfyl8lOdPk9eeXqY7wcK8G6cKOEZjBjVzAkGVXcd4o3uygeBp/fDAlO+8POuyG9TNpFyZDcymbYKRt2NN+Ydo3tpyGtrpg/J/RuOCdxwytnyTPs/OAsqsDjWR6rXPmDTAT878mrj+otRM6Eg2WlIZGveO5UG+IrE8WhcCuYVwkrRn8Rqliijl+vDfk1mrcy7RUV6VBvNN4LEFRVFfzGG5sqvRtYWRlyh/V8v3wtv6a65xZjdCqKyxq1NWjx9UbO60j1VXZDXPupiFeMVlQpOUbkyH+aVFztet7HUfekv+O3X6om+2Li+qZqkFT4SVedD39X7n7J0b6mAI/CywG3c8/FxVx02Na/vab4vsVtlvRXUdcJviaHpP7hhyaGCPGG+PGG+PGG+PGG+PGG+PGG+PGG+PGG+PGG+PGG+PGG+PGG+PGG+KFv+B+FpHgcqQsIhwAAAABJRU5ErkJggg==" alt="Heaven" width={16} height={16} className="rounded-full" />, color: '#8b5cf6' },
    // { name: 'Daos.fun', icon: <TokenDAO variant="branded" size={16} className="rounded-full" />, color: '#06b6d4' },
    // { name: 'Candle', icon: <Image src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAOEAAADgCAMAAADCMfHtAAAAmVBMVEUALqz///8AAKUAGKgABqb29/u9wuIAK6sAI6oAIKkAKasALKwAJqoAGagAG6gAFacAEKfDx+TZ3O709fp9iMnm6PSFj8xzf8akq9ji5PLP0unv8PiIks2YoNOOl89ZaL1GWbi1u9+qsdoySbNfbr9qd8NSY7vIzOd1gcZVZbwtRbJjccAVNq6VntJAVLcgPbAmQLAbOa45T7XL9ma0AAAMW0lEQVR4nO2dZ3fquBaGLdmA5SpMh0AoKSSH5Nzk//+464Ytd4P3Rp575/02a86K/CBpNzWF/K9Lkf0B6PqXEEyTmbd+HwYav7+vvdXmUQ2jE67Gy/nLL6Ma566rBnJ9ca5R9fN5uh16A+QPQCTcjL/+XChXHd0yTKUo07B0pnKqfzwdVnifgUToLf/omsusUQlZgdRiNudvX2ucT0EgnB1fOHessm6rxXTpfuvBfw40obf70W6lS2Qwzs5j4C8CJfTmOmdtBmZNX+ouX7xDfhQc4ebrwtmdnZeHdOZwwxWKcPxGO/ZeBpJpn0egLwMhHGwN1wLDi2TYfD6D+DgAws2UOhCjMy+T0ReAwdqZcPZKdQy+UBbdd/aSHQkDPiy8UIb23ZGxE+HkjMwXMe47xXRdCHcP4Atk0deJDMKDjmJfSqXTr4cTzr75w/h8mY5yb6BzJ+GOGg/kCzTSXu7LJO8i9C7Og/kC6fzwKML5wzksnf7ujG2wlXf2V0YCTLvT23uplwKakDI5n0jE34zCXyBWJ/b4zHbyNcKY/x8XUy6BCP8CB1hF5l0jkW4Zw+0snXSH3DIfxwZZMl0i/tS+atCQefTDaXIENtnRu3JdyY0GWKbjJp2zi1JeHK7oONEWXSAyShx+HqaGCiSzhCry9GNCu6hSJc9xOwJWILwp72YKA2A7WZ0NN6C+gjNlfGGwlnD61W3KzmILWJcKL3zU3kRJvKqU2EPz0H9P1iQzW1gfBbfrbUpBGrL6bWEy7kFSzay/rP/YRL2Ql9O7HnewnXVPa3t5RbVxGvIdy4vfYTouoSjRrCU7/ypTqZvDojriac4loZ2HzTOt1OOMadhEz5A4poV1anqggHqJNwRKfkCDtGKmObKsI95iR0Lh4hc9i6j6nfRnhE9ISm34G+XoHDJf31FsINYsaks2g8vUCPEq181aacEHGMutcVMnBCk7UnPKCNUTNdkAcnVFjpulQpIdoWBIOnwccr/DihZWXiMsIzVnU7U4yfwidmRlmWUUK4wvL17FtsZofwO7olZZsSwm+ktF59yTSzRIgKTbUN4RjJzLiLXDsqQiOsGLwVCS84BXw+zbWzQvklaSHJKBAecVYJ3TwgISjTvRjZFAjv3WdfL3uRb4eQT5T5TvMbGfKESxujWfZRBCRnlDqe9aeBEGW/r/VZAkgOKD9moRNzhEcMA2c6YkUz8RkzDaGt4kzMESoYhlRMTjdmOopKz3sBNJc1p1nCIYYhtXdpAyvHfkr+A2ci5n1ilvCEYN4MYRJ62oilvGMcx2TyakIPY2YIKyfBYjJL+xDHIyqKk1k3zRBCFxYCsdTVh4vJuuAZYcttiUaXKsIBwm9qusmfX4WlEUNIMJCGqcLFErhIiBHts2QzwUSP7LQmtIhUssx4fZEQYTVUmPXXRQIuJOIIWXAoOiglxLAzejILk6VIJiwUYSXboq0RCDF+0KTDhglLxg4gZdvGqZQQof6U0AzU9I9zIcTBSreF4DQlfEdoLHF+oh+yxP2vSPl2auAEQoxBej084GXmm1j0Qwn1M1W3lBDklHJOWhwEZ2voxq/QiVjh96xAuEYYpFd37+VMpiuYOqSqSWpNE0KM8uXVpC1yE8AUExyUhE0x9gXC/2CkFbFNKaxkicXpA04nJk7/SrjB8L1WlM+XhJ9MqA7jbCxThzlClKJJ3Idlq71CdfGAYk6TaOpKiJJvx/NwX9ZJPM0TMax4GmxcCRWUOwOiuLs8WNKS+BRhnU1JyzUK4jS8+sOKv51sYcYw4+lEjAmHOKGFOq4hTGpwWxTCa0EqJnzCWRSNpnsV4Shu/Aul8WsxIW6k1Bh0V7R5oDIwi7MMpHINzRBibVcPQ+/nKgL7iNl4nJtGhDOszRfhUKmcZ1HwCLz9K5F9EAhR1mNDBWUvoVZhMtH5qQc0d6gkyamCaM0ChdYkKaWbzm4neMfQZT1jbZa3PgTCfPAPKPbq+6LrJAi8xzqJUsNkf452MtU0BMJfxFMVfJtmwNqEkEFS0gvq/VPELYJUIEQ9+UO3ZODE1eCB4B599MEeZ5U0bmCVEE5w1iqTlha+sQ5HiUjonv38HnUreVQlCgk95HMV7LLeKAGiQKg/rf8iHwZwjgkh1gpJohHfvwfFX7EPDRX7SFW0VKlg+lxBhp3rwwcoWshT8EJfH0vPne0rITSt/D8CU+QQQ0KkJSD2PV+cqCvcp5gjNJhKlZfp9IQzhqISQ0iIk2RHdajBeP5Dbb3gLQzm0tN8uEFM3kwzIfxAIUyLspvD+Ye6jm6FJT6qOyr36cbpIh+SMecJIU52GMf2sQbr4/TlO4B6my/HuXOfOPsUo6AmJMTYZJInrBVS9hZOipDwL0phXW1/F9AGJ6gKwuCIEGcRrweEm4QQJXqST8hnV0JTNiFS6P//RIhS0r+FcIBNKN3SYBEmlka6t0AiTG0pzq75HhAmHh9nZ5J8wjRqe0OJvPtEiLM0Ip0wWhcKCXG2lEsnjHZ8hIS4i7DyCPcJIcbm4B4QWq8JIc4at3TCaPEpJMTY09YDwqiMEhLiJC/SCaMPiFZmUIq00gmjZe6IECUwlU4YFjFiQvj7DRT5hPHu1ogQpSIrmzDeYhoRouxMlE0Y706MCFFqzrIJo+XD644hDGMqm9Bdi4QYe6BlE8b7oGNCjOxCMuHoh4iEGKvAkgmvRzljQozFH8mEsaFJdkEjbIuQTMhXWcLKHZL3Sy6haZMsIUISLJcwOSl7JUSYiHIJr9MwPRUEf+WHXELtengtIYT3iFIJr95QIIS/EuOGt5ngCdOrG9ITluChqVTC9LBxSgjuL2QSmk7yt1NC8BzRbf+eHzhheg+AeFodepi67R8QBScUTsQLhNDrMxL7ULyQViCE3kcrcR6Kl+CIN3/YsE5fIqEm7JsTCYHvLpZHKF6LkSEEvmlElUZoi5d8Zm5Rgl3Plxa1Za/CyhDCRm7SCPXMLZTZ28xAr4WURpi9VzBLuIXMg2URWtlrKHO3CkIegJJFqGVjqRwh5BKNJMLM3TBFwgmgw5BEyHPBYv7+UkCvL4fQyN+VmicE7EQ5hDwfZxTuEYbrRCmE+VlYQjgAM6dSCLVCUlq8z3sLlevL2OeduSmtipAYQBszZBAW7rouJRwClb8lnLdgxXvRS19/AEoxHk+YrMY0Ec5gPMYNJ7uACHlZi6VvlDyBBOAPJzS+y/52+Us6JoSxcZpfQb0K5nReiZmpJAR5F5C1epA4FMh+Hrv8jcCKF60WAJFNMbyoFMRh8kJAWk8IMk5LJ36ZNhBxVPkYrSbMX1d5l7R2b4N7JoB7cqvmRBUheYII3mxjPvQ2k4rHXgeTyWY13v5qAOPF2pe3UUNIfiGWMUxd5VzTaKk0X9xlEPGFqQ6qOKoJJ/1+rjqrmpedqwnJ+z/lKVl/Eu6qMWoIyQ77Uhco6cWcqR0h+UC7AgxURi1E7f8kf/v+7nggU6vwhG0IN8BLiihqeD++njB6dKPfog0BfgMh9rPA3cVrzGgrQnLsN6Ja8tzZjYRki3uZWzc5L43f30xIdsi3uXVQ6XtutxP2F5HVefpbCMmunwPVaQPYjpDs+mhu7OdW396OkCz7h+hWvMN9JyE59M31ayXl7U6EZA2RiYPJpK0Lea0JycpCvWz0Jo1o+xWD9oRkcOpLMmU5ZQ9wdyck5LUfjtH5rChtdSf0TWoPJqPW0ojeRUg8He9e7HYymrKljoSEvMkdqeyyav7GboT+SJVX2jBpY7IEQEhmn5iXcNdJt9tvyu1CSMiXlG40tZfKwjY0IVmdkK/iLhFjd3Tg3YT+bOSPNaoGbRuHQhGSyZ8HDlWT/94QxQAR+r7xxB/j/03HOtz/mR0I/ZRKUfGno8l4+w0B0ISEHBlyVdxk9OkeCwpG6JscXcUbqz7f/JYoG4XQ70fFxbE5I9vddes/IEJChr8a/FFwi19ujLHLBULo29WzZkN25IjR5/bHF2sFROjreKIMZkaaOle2m+YW2wmO0I/ldgrvDOnjOdP252ubBUnoy9tdNOf+ipXBuA6KR8AJfc2Wb/SeTTLBgxffX3cHZ5WCJwy0/tpT7rR+XWWkOy79fRp3dw0lwiEM5B3Pn5SrTK95l9o0dKZy+vO6BB6agvAIQ62G2/PeoBp3bYcxpsdizLFdzin7Xnwd4AdmRsiEsTbe++G43c2n5/PrYjGd77bLw7tXu0kETI8hlKl/Cf/5+i9HpcHNRMx9XgAAAABJRU5ErkJggg==" alt="Candle" width={16} height={16} className="rounded-full" />, color: '#f59e0b' },
    // { name: 'Sugar', icon: <Image src="https://cdn.vectorstock.com/i/1000v/28/93/sugar-donut-icon-vector-9992893.jpg" alt="Sugar" width={16} height={16} className="rounded-full" />, color: '#ec4899' },
    // { name: 'Believe', icon: <Image src="https://cryptoast.fr/wp-content/uploads/2025/05/believe-launchcoin-logo.png" alt="Believe" width={16} height={16} className="rounded-full" />, color: '#10b981' },
    // { name: 'Jupiter Studio', icon: <TokenJUP variant="branded" size={16} className="rounded-full" />, color: '#8b5cf6' },
    {
      name: "Moonit",
      icon: (
        <Image
          src="/moonit.svg"
          alt="Moonit"
          width={16}
          height={16}
          className="rounded-full"
        />
      ),
      color: "#fbbf24",
    },
    {
      name: "Boop",
      icon: (
        <Image
          src="https://s2.coinmarketcap.com/static/img/coins/64x64/36393.png"
          alt="Boop"
          width={16}
          height={16}
          className="rounded-full"
        />
      ),
      color: "#3b82f6",
    },
    {
      name: "LaunchLab",
      icon: (
        <Image
          src="https://s2.coinmarketcap.com/static/img/coins/64x64/8526.png"
          alt="LaunchLab"
          width={16}
          height={16}
          className="rounded-full"
          style={{ filter: "hue-rotate(180deg) saturate(2) brightness(1.1)" }}
        />
      ),
      color: "#3b82f6",
    },
    // { name: 'Dynamic BC', icon: <Image src="https://cdn.prod.website-files.com/626692727bba3f384e008e8a/67a5dca8b3ee5d0703f70040_icon-primary.webp" alt="Dynamic BC" width={16} height={16} className="rounded-full" />, color: '#f97316' },
    {
      name: "Raydium",
      icon: (
        <div
          className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-500 text-xs font-bold"
          style={{ color: "#f0f5f5" }}
        >
          R
        </div>
      ),
      color: "#6b7280",
    },
    {
      name: "Meteora AMM",
      icon: (
        <Image
          src="/meteora.svg"
          alt="Meteora"
          width={16}
          height={16}
          className="rounded-full"
        />
      ),
      color: "#92400e",
    },
    {
      name: "Meteora AMM V2",
      icon: (
        <Image
          src="/meteora.svg"
          alt="Meteora V2"
          width={16}
          height={16}
          className="rounded-full"
        />
      ),
      color: "#a16207",
    },
    // { name: 'Pump AMM', icon: <Image src="/pump.svg" alt="Pump AMM" width={16} height={16} className="rounded-full" />, color: '#64748b' },
    // { name: 'Orca', icon: <Image src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT9zFRQAbDsrkXwAJkZYVE-AIO3OyfVxYYm9w&s" alt="Orca" width={16} height={16} className="rounded-full" />, color: '#0ea5e9' }
  ];

  const quoteTokens = [
    {
      name: "SOL",
      icon: (
        <div
          className="flex h-4 w-4 items-center justify-center rounded-full text-xs font-bold"
          style={{ backgroundColor: "#31e3ac", color: "#f0f5f5" }}
        >
          S
        </div>
      ),
      color: "#31e3ac", // Green (matching MonadTable)
    },
    {
      name: "USDC",
      icon: (
        <div
          className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-xs font-bold"
          style={{ color: "#f0f5f5" }}
        >
          U
        </div>
      ),
      color: "#06b6d4",
    },
    {
      name: "USD1",
      icon: (
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-yellow-500 text-xs font-bold text-black">
          1
        </span>
      ),
      color: "#fbbf24",
    },
  ];

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const isInsideFilterButton = target.closest(".filter-dropdown");
      const isInsideModal = target.closest(".filter-modal");
      if (!isInsideFilterButton && !isInsideModal) {
        setShowFilters(false);
      }
    };

    if (showFilters) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showFilters]);

  // Wave effect for real-time data updates - trigger on actual data changes
  // Added by hujoe - can use in the future
  /*
  useEffect(() => {
    if (tokens.length === 0) return;
    
    // Trigger wave on tokens data change (real updates)
    const newWaveTokens = new Set<number>();
    
    // Select 1-2 random tokens to show wave effect when data updates
    const waveCount = Math.floor(Math.random() * 2) + 1; // 1-2 tokens
    for (let i = 0; i < waveCount; i++) {
      const randomIdx = Math.floor(Math.random() * tokens.length);
      newWaveTokens.add(randomIdx);
    }
    
    setWaveTokens(newWaveTokens);
    
    // Clear wave after animation duration
    setTimeout(() => {
      setWaveTokens(new Set());
    }, 2000);
  }, [tokens]); // Trigger on actual token data changes
  */

  // Function to show copy toast
  const showCopyToast = () => {
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 2000);
  };
  // Removed duplicate mapProtocolToBackend and getTokenProtocol functions
  // Protocol filtering is now 100% server-side via HTTP API and WebSocket
  // Filter and sort tokens
  const filteredAndSortedTokens = useMemo(() => {
    const isNewPairs = title.toLowerCase().includes("new");


    // ═══════════════════════════════════════════════════════════════════════════
    // ULTRA-FAST PATH FOR NEW PAIRS: Skip ALL filtering when no custom filters set
    // This ensures WebSocket tokens render instantly without any processing delay
    // ═══════════════════════════════════════════════════════════════════════════
    const hasNoCustomFilters =
      (filters.protocols.length === 0 || filters.protocols.includes("All")) &&
      filters.quoteTokens.length === 0 &&
      !filters.searchKeywords.trim() &&
      !filters.excludeKeywords.trim() &&
      !filters.dexPaid &&
      !filters.caEndsInPump &&
      !filters.minAge &&
      !filters.maxAge &&
      !filters.top10HoldersPercent &&
      !filters.minMarketCap &&
      !filters.maxMarketCap &&
      !filters.minVolume &&
      !filters.maxVolume &&
      !filters.minLiquidity &&
      !filters.maxLiquidity &&
      !filters.bCurvePercentMin &&
      !filters.bCurvePercentMax &&
      !filters.txnsMin &&
      !filters.txnsMax &&
      !filters.numBuysMin &&
      !filters.numBuysMax &&
      !filters.numSellsMin &&
      !filters.numSellsMax &&
      !filters.holdersMin &&
      !filters.holdersMax &&
      !filters.kolCountMin &&
      !filters.kolCountMax &&
      !filters.devHoldingPercentMin &&
      !filters.devHoldingPercentMax &&
      !filters.snipersPercentMin &&
      !filters.snipersPercentMax &&
      !filters.insidersPercentMin &&
      !filters.insidersPercentMax &&
      !filters.devMigrationsMin &&
      !filters.devMigrationsMax &&
      !filters.devPairsCreatedMin &&
      !filters.devPairsCreatedMax &&
      !filters.bundlePercentMin &&
      !filters.bundlePercentMax &&
      !filters.globalFeesPaidMin &&
      !filters.globalFeesPaidMax &&
      !filters.twitterReusesMin &&
      !filters.twitterReusesMax &&
      !filters.tweetAgeMin &&
      !filters.tweetAgeMax &&
      !filters.hasWebsite &&
      !filters.hasTwitter &&
      !filters.hasTelegram &&
      !filters.atLeastOneSocial &&
      !filters.onlyPumpLive;

    // ═══════════════════════════════════════════════════════════════════════════
    // 🚀 FAST PATH FOR ALL COLUMNS - HTTP FIRST, WebSocket ON TOP
    // Priority: HTTP shows immediately → WebSocket merges on top → IndexedDB caches both
    // ═══════════════════════════════════════════════════════════════════════════
    if (hasNoCustomFilters) {
      const isFinalStretch = title.toLowerCase().includes("final") || title.toLowerCase().includes("stretch");
      const isMigrated = title.toLowerCase().includes("migrated");

      // 1. Start with HTTP data as the BASE (shows immediately on page load)
      const httpSource = filteredTokens.length > 0 ? filteredTokens : baseTokens;

      // 2. Get WebSocket tokens for this column
      let wsSource: typeof directNewTokens = [];
      if (isNewPairs) {
        wsSource = directNewTokens.length > 0 ? directNewTokens : [];
      } else if (isFinalStretch) {
        wsSource = directFinalStretchTokens.length > 0 ? directFinalStretchTokens : [];
      } else if (isMigrated) {
        wsSource = directMigratedTokens.length > 0 ? directMigratedTokens : [];
      }

      // 3. Also check IndexedDB cache (wsTokens) as additional source
      const cacheSource = wsTokens.length > 0 ? wsTokens : [];

      // 4. MERGE: WebSocket on top → IndexedDB cache → HTTP base
      // WebSocket tokens are newest, they go first
      // Then fill in with cache/HTTP tokens that aren't duplicates
      const seenMints = new Set<string>();
      const merged: Token[] = [];

      // Add WebSocket tokens first (newest, real-time)
      for (const t of wsSource as unknown as Token[]) {
        if (t.mint && !seenMints.has(t.mint)) {
          seenMints.add(t.mint);
          merged.push(t);
        }
      }

      // Add IndexedDB cache tokens (persisted from previous session)
      for (const t of cacheSource) {
        if (t.mint && !seenMints.has(t.mint)) {
          seenMints.add(t.mint);
          merged.push(t);
        }
      }

      // Add HTTP tokens (base data from API)
      for (const t of httpSource) {
        if (t.mint && !seenMints.has(t.mint)) {
          seenMints.add(t.mint);
          merged.push(t);
        }
      }

      // Blacklist filter (O(1) Set lookups) — fast path
      if (blacklistCASet.size > 0 || blacklistDevSet.size > 0 || blacklistTwitterSet.size > 0) {
        const beforeLen = merged.length;
        const filtered = merged.filter(token => {
          if (blacklistCASet.has(token.mint?.toLowerCase())) return false;
          const dw = token.dev_wallet || token.creator_wallet;
          if (dw && blacklistDevSet.has(dw.toLowerCase())) return false;
          let tw = (token as any).twitter || (token as any).twitter_url || (token as any).x || '';
          if (!tw && token.links) {
            try { const p = typeof token.links === 'string' ? JSON.parse(token.links) : token.links; tw = (p as any)?.twitter || ''; } catch {}
          }
          if (tw && blacklistTwitterSet.size > 0) {
            const h = extractTwitterHandle(tw);
            if (h && blacklistTwitterSet.has(h.toLowerCase())) return false;
          }
          // Fallback: check metadata-derived handle cache (populated by TokenImage)
          if (blacklistTwitterSet.size > 0) {
            const cachedHandle = twitterHandleCache.get(token.mint?.toLowerCase());
            if (cachedHandle && blacklistTwitterSet.has(cachedHandle)) return false;
          }
          return true;
        });
        if (filtered.length !== beforeLen) {
          // Apply filters and limits with blacklisted tokens removed
          if (isNewPairs || isMigrated) {
            if (isMigrated) {
              filtered.sort((a, b) => {
                const aTs = getTokenTimestamp(a, MIGRATED_TIMESTAMP_FIELDS);
                const bTs = getTokenTimestamp(b, MIGRATED_TIMESTAMP_FIELDS);
                return bTs - aTs; // youngest first
              });
            }
            return filtered.slice(0, 100);
          } else {
            return filterNonZeroLiquidity(filtered).slice(0, 100);
          }
        }
      }

      // Apply filters and limits
      if (isNewPairs || isMigrated) {
        if (isMigrated) {
          merged.sort((a, b) => {
            const aTs = getTokenTimestamp(a, MIGRATED_TIMESTAMP_FIELDS);
            const bTs = getTokenTimestamp(b, MIGRATED_TIMESTAMP_FIELDS);
            return bTs - aTs; // youngest first
          });
        }
        return merged.slice(0, 100);
      } else {
        return filterNonZeroLiquidity(merged).slice(0, 100);
      }
    }
    // ═══════════════════════════════════════════════════════════════════════════

    // Data source priority:
    // 1. WebSocket real-time tokens (for instant updates)
    // 2. HTTP API filtered tokens (when protocol filters active)
    // 3. Original tokens prop (fallback)
    let filtered: Token[];
    const hasSpecificProtocols =
      filters.protocols.length > 0 && !filters.protocols.includes("All");

    // Merge WebSocket tokens with HTTP API tokens (deduplicate by mint)
    const mergedMap = new Map<string, Token>();

    // Helper function to determine which filter category a token belongs to
    // Uses EXACT same logic as getTokenIcon for consistency with icon display
    const getTokenFilterCategory = (token: Token): string => {
      const protocol = ((token as any).launchpad_protocol || "").toLowerCase();
      const mint = (token.mint || "").toLowerCase();

      // Priority 1: Bags mint override (same as icon logic line 1414-1416)
      if (mint.includes("bags")) return "Bags";

      // Priority 2: Check protocol field
      if (!protocol) return "Pump"; // Default like icon logic

      // Check in same order as getTokenIcon
      if (protocol.includes("pump")) return protocol.includes("pump_amm") || protocol.includes("pumpamm") || protocol.includes("pumpswap") ? "Pump AMM" : "Pump";
      if (protocol.includes("meteora")) return "Meteora AMM"; // V1 and V2 both show same icon
      if (protocol.includes("raydium")) return "Raydium";
      if (protocol.includes("boop")) return "Boop";
      if (protocol.includes("moonit") || protocol.includes("moonshot") || protocol.includes("moonshoot")) return "Moonit";
      // Bonk detection: protocol includes "bonk" or "launchlab", OR mint ends in "bonk"
      if (protocol.includes("bonk") || protocol.includes("launchlab") || mint.endsWith("bonk")) return "Bonk";
      if (protocol.includes("bags")) return "Bags";

      return "Pump"; // Default fallback
    };

    // Helper to check if token matches selected filters
    const tokenMatchesFilters = (token: Token): boolean => {
      const tokenCategory = getTokenFilterCategory(token);
      return filters.protocols.some(selectedFilter => {
        if (selectedFilter === tokenCategory) return true;
        // Meteora AMM V2 filter should also match Meteora AMM tokens
        if (selectedFilter === "Meteora AMM V2" && tokenCategory === "Meteora AMM") return true;
        // LaunchLab and Bonk are the same ecosystem — selecting either should show both
        if (selectedFilter === "LaunchLab" && tokenCategory === "Bonk") return true;
        if (selectedFilter === "Bonk" && tokenCategory === "LaunchLab") return true;
        return false;
      });
    };

    // Use filteredTokens if available (either from specific filters or fresh "All" fetch)
    // Otherwise fall back to baseTokens (local state with price updates)
    const tokensSource =
      filteredTokens.length > 0 ? filteredTokens : baseTokens;

    // First add HTTP API tokens (either filtered or from local state)
    // Apply client-side filter validation to ensure consistency with icon display
    if (hasSpecificProtocols) {
      tokensSource.forEach((token) => {
        if (tokenMatchesFilters(token)) {
          mergedMap.set(token.mint, token);
        }
      });
    } else {
      tokensSource.forEach((token) => mergedMap.set(token.mint, token));
    }

    // Then add/overwrite with WebSocket tokens (they're more recent and real-time)
    // IMPORTANT: Use direct bridge tokens instead of wsTokens state for instant updates
    // This eliminates the state copy that was causing progressive latency
    const directTokensForChannel = (
      channel === 'new' ? directNewTokens :
      channel === 'final_stretch' ? directFinalStretchTokens :
      channel === 'migrated' ? directMigratedTokens :
      []
    ) as unknown as Token[];

    // Use direct tokens if available, fall back to wsTokens cache (initial load only)
    const wsSource = directTokensForChannel.length > 0 ? directTokensForChannel : wsTokens;

    if (hasSpecificProtocols) {
      wsSource.forEach((token) => {
        if (tokenMatchesFilters(token)) {
          mergedMap.set(token.mint, token);
        }
      });
    } else {
      // No specific protocols selected - include all WebSocket tokens
      wsSource.forEach((token) => mergedMap.set(token.mint, token));
    }

    // Filter zero liquidity tokens - DISABLED for new pairs and migrated to maximize speed
    // Migrated tokens may arrive with liquidity_usd=0 before backend populates it
    if (isNewPairs || title.toLowerCase().includes("migrated")) {
      // SPEED FIX: Zero liquidity filtering disabled for new pairs
      // This was causing lag - every WebSocket update triggered O(n) filtering
      // filtered = allTokens.filter((token) => !hasZeroLiquidity(token));
      filtered = Array.from(mergedMap.values()) as Token[];
    } else {
      filtered = filterNonZeroLiquidity(
        Array.from(mergedMap.values()) as Token[],
      );
    }

    // Blacklist filter (O(1) Set lookups) — full filter path
    if (blacklistCASet.size > 0 || blacklistDevSet.size > 0 || blacklistTwitterSet.size > 0) {
      filtered = filtered.filter(token => {
        if (blacklistCASet.has(token.mint?.toLowerCase())) return false;
        const dw = token.dev_wallet || token.creator_wallet;
        if (dw && blacklistDevSet.has(dw.toLowerCase())) return false;
        let tw = (token as any).twitter || (token as any).twitter_url || (token as any).x || '';
        if (!tw && token.links) {
          try { const p = typeof token.links === 'string' ? JSON.parse(token.links) : token.links; tw = (p as any)?.twitter || ''; } catch {}
        }
        if (tw && blacklistTwitterSet.size > 0) {
          const h = extractTwitterHandle(tw);
          if (h && blacklistTwitterSet.has(h.toLowerCase())) return false;
        }
        return true;
      });
    }

    // NOTE: migrated_pool_address filter REMOVED
    // WebSocket tokens from the 'migrated' channel are already migrated by definition.
    // The backend only sends tokens to that channel after migration occurs.
    // Previously this filter was blocking WebSocket tokens that didn't have the field.

    // Protocol filtering is now handled by the API, so we skip client-side filtering
    // when protocols are selected (filteredTokens already contains the filtered results)

    // Special handling for "Bags" filter: also include tokens where mint contains "bags"
    // This catches tokens that have "bags" in mint but different launchpad_protocol (e.g., "meteora")
    if (filters.protocols.includes("Bags") && tokens.length > 0) {
      const existingMints = new Set(filtered.map((t) => t.mint));
      const bagsFromMint = tokens.filter((token) => {
        const mintLower = token.mint?.toLowerCase() || "";
        return mintLower.includes("bags") && !existingMints.has(token.mint);
      });
      if (bagsFromMint.length > 0) {
        filtered = [...filtered, ...bagsFromMint];
      }
    }

    // Apply keyword filters
    if (filters.searchKeywords.trim()) {
      const searchTerms = filters.searchKeywords
        .toLowerCase()
        .split(",")
        .map((term) => term.trim())
        .filter((term) => term);
      if (searchTerms.length > 0) {
        filtered = filtered.filter((token) => {
          const tokenText =
            `${token.name || ""} ${token.symbol || ""}`.toLowerCase();
          return searchTerms.some((term) => tokenText.includes(term));
        });
      }
    }

    if (filters.excludeKeywords.trim()) {
      const excludeTerms = filters.excludeKeywords
        .toLowerCase()
        .split(",")
        .map((term) => term.trim())
        .filter((term) => term);
      if (excludeTerms.length > 0) {
        filtered = filtered.filter((token) => {
          const tokenText =
            `${token.name || ""} ${token.symbol || ""}`.toLowerCase();
          return !excludeTerms.some((term) => tokenText.includes(term));
        });
      }
    }

    // Apply quote token filters
    // Protocol to quote token mappings:
    // - Bonk → USD1
    // - Raydium → USD1
    // - Meteora → USDC
    // - Pump, Bags, Moonit, Boop, LaunchLab → SOL
    // - Everything else → SOL (default)
    if (filters.quoteTokens.length > 0) {
      filtered = filtered.filter((token) => {
        const protocol = ((token as any).launchpad_protocol || "").toLowerCase();
        const mint = (token.mint || "").toLowerCase();

        // Determine the quote token for this token based on protocol
        let tokenQuote = "SOL"; // Default for unknown protocols

        // USD1 protocols: Bonk (including launchlab and mint ending in "bonk"), Raydium
        if (protocol.includes("bonk") || protocol.includes("launchlab") || protocol.includes("raydium") || mint.endsWith("bonk")) {
          tokenQuote = "USD1";
        }
        // USDC protocols: Meteora
        else if (protocol.includes("meteora")) {
          tokenQuote = "USDC";
        }
        // SOL protocols: Pump, Bags, Moonit, Boop
        else if (
          protocol.includes("pump") ||
          protocol.includes("bags") ||
          protocol.includes("moonit") || protocol.includes("moonshot") || protocol.includes("moonshoot") ||
          protocol.includes("boop")
        ) {
          tokenQuote = "SOL";
        }
        // Everything else defaults to SOL

        // Check if the token's quote matches any selected quote token filter
        return filters.quoteTokens.includes(tokenQuote);
      });
    }

    // Apply dexPaid filter
    if (filters.dexPaid) {
      filtered = filtered.filter((token) => {
        // Check if token has paid dex fees (this would need to be implemented based on your data structure)
        // For now, we'll assume all tokens have paid if this filter is enabled
        return true; // Placeholder - implement based on actual dexPaid field
      });
    }

    // Apply caEndsInPump filter
    if (filters.caEndsInPump) {
      filtered = filtered.filter((token) => {
        // Check if contract address ends in "pump"
        return token.mint && token.mint.toLowerCase().endsWith("pump");
      });
    }

    // Apply age filters
    if (filters.minAge || filters.maxAge) {
      filtered = filtered.filter((token) => {
        const launchTime =
          (token as any).launch_time || (token as any).created_at;
        if (!launchTime) return false;

        const launchDate = new Date(launchTime);
        const now = new Date();
        const ageInMinutes =
          (now.getTime() - launchDate.getTime()) / (1000 * 60);

        let ageInTargetUnit = ageInMinutes;
        if (filters.ageUnit === "h") {
          ageInTargetUnit = ageInMinutes / 60;
        } else if (filters.ageUnit === "d") {
          ageInTargetUnit = ageInMinutes / (60 * 24);
        }

        const minAge = filters.minAge ? parseFloat(filters.minAge) : 0;
        const maxAge = filters.maxAge ? parseFloat(filters.maxAge) : Infinity;

        return ageInTargetUnit >= minAge && ageInTargetUnit <= maxAge;
      });
    }

    // Apply top 10 holders percent filter
    if (filters.top10HoldersPercent) {
      const threshold = parseFloat(filters.top10HoldersPercent);
      filtered = filtered.filter((token) => {
        // Use top10_holders_pct from WebSocket price_update data
        const top10Pct = (token as any).top10_holders_pct ?? 0;
        // Filter tokens where top 10 holders own LESS than the threshold (lower = better distribution)
        return top10Pct <= threshold;
      });
    }

    // Apply filters
    if (filters.minMarketCap) {
      const minMC = parseFloat(filters.minMarketCap);
      filtered = filtered.filter((token) => {
        const marketCap =
          (token as any).fully_diluted_value ??
          (token as any).market_cap_usd ??
          0;
        return marketCap >= minMC;
      });
    }

    if (filters.maxMarketCap) {
      const maxMC = parseFloat(filters.maxMarketCap);
      filtered = filtered.filter((token) => {
        const marketCap =
          (token as any).fully_diluted_value ??
          (token as any).market_cap_usd ??
          0;
        return marketCap <= maxMC;
      });
    }

    if (filters.minVolume) {
      const minVol = parseFloat(filters.minVolume);
      filtered = filtered.filter((token) => {
        const volume = calculateVolumeUsd(token, solPrice);
        return volume >= minVol;
      });
    }

    if (filters.maxVolume) {
      const maxVol = parseFloat(filters.maxVolume);
      filtered = filtered.filter((token) => {
        const volume = calculateVolumeUsd(token, solPrice);
        return volume <= maxVol;
      });
    }

    // Apply liquidity filters
    if (filters.minLiquidity) {
      const minLiq = parseFloat(filters.minLiquidity);
      filtered = filtered.filter((token) => {
        const liquidity = (token as any).total_liquidity_usd ?? (token as any).liquidity_usd ?? 0;
        return liquidity >= minLiq;
      });
    }

    if (filters.maxLiquidity) {
      const maxLiq = parseFloat(filters.maxLiquidity);
      filtered = filtered.filter((token) => {
        const liquidity = (token as any).total_liquidity_usd ?? (token as any).liquidity_usd ?? 0;
        return liquidity <= maxLiq;
      });
    }
    // Apply bonding curve percent filters
    if (filters.bCurvePercentMin) {
      const minBC = parseFloat(filters.bCurvePercentMin);
      filtered = filtered.filter((token) => {
        const bondingCurve = (token as any).bonding_pct ?? 0;
        return bondingCurve >= minBC;
      });
    }

    if (filters.bCurvePercentMax) {
      const maxBC = parseFloat(filters.bCurvePercentMax);
      filtered = filtered.filter((token) => {
        const bondingCurve = (token as any).bonding_pct ?? 0;
        return bondingCurve <= maxBC;
      });
    }

    // Apply transaction count filters
    if (filters.txnsMin) {
      const minTxns = parseFloat(filters.txnsMin);
      filtered = filtered.filter((token) => {
        const txns =
          ((token as any).total_buys_24h ?? 0) +
          ((token as any).total_sells_24h ?? 0);
        return txns >= minTxns;
      });
    }

    if (filters.txnsMax) {
      const maxTxns = parseFloat(filters.txnsMax);
      filtered = filtered.filter((token) => {
        const txns =
          ((token as any).total_buys_24h ?? 0) +
          ((token as any).total_sells_24h ?? 0);
        return txns <= maxTxns;
      });
    }

    // Apply buy count filters
    if (filters.numBuysMin) {
      const minBuys = parseFloat(filters.numBuysMin);
      filtered = filtered.filter((token) => {
        const buys = (token as any).total_buys_24h ?? 0;
        return buys >= minBuys;
      });
    }

    if (filters.numBuysMax) {
      const maxBuys = parseFloat(filters.numBuysMax);
      filtered = filtered.filter((token) => {
        const buys = (token as any).total_buys_24h ?? 0;
        return buys <= maxBuys;
      });
    }

    // Apply sell count filters
    if (filters.numSellsMin) {
      const minSells = parseFloat(filters.numSellsMin);
      filtered = filtered.filter((token) => {
        const sells = (token as any).total_sells_24h ?? 0;
        return sells >= minSells;
      });
    }

    if (filters.numSellsMax) {
      const maxSells = parseFloat(filters.numSellsMax);
      filtered = filtered.filter((token) => {
        const sells = (token as any).total_sells_24h ?? 0;
        return sells <= maxSells;
      });
    }

    // Apply holders filters
    // Check multiple possible field names: holder_count (preferred), unique_wallets_24h (fallback)
    if (filters.holdersMin) {
      const minHolders = parseFloat(filters.holdersMin);
      filtered = filtered.filter((token) => {
        const holders = (token as any).holder_count ?? (token as any).holders ?? (token as any).unique_wallets_24h ?? 0;
        return holders >= minHolders;
      });
    }

    if (filters.holdersMax) {
      const maxHolders = parseFloat(filters.holdersMax);
      filtered = filtered.filter((token) => {
        const holders = (token as any).holder_count ?? (token as any).holders ?? (token as any).unique_wallets_24h ?? 0;
        return holders <= maxHolders;
      });
    }

    // Apply KOL count filters
    if (filters.kolCountMin) {
      const minKol = parseFloat(filters.kolCountMin);
      filtered = filtered.filter((token) => {
        const kolCount = (token as any).kol_count ?? 0;
        return kolCount >= minKol;
      });
    }

    if (filters.kolCountMax) {
      const maxKol = parseFloat(filters.kolCountMax);
      filtered = filtered.filter((token) => {
        const kolCount = (token as any).kol_count ?? 0;
        return kolCount <= maxKol;
      });
    }

    // Apply dev holding percent filters (values are decimals 0-1, filter input is percentage 0-100)
    if (filters.devHoldingPercentMin) {
      const minPercent = parseFloat(filters.devHoldingPercentMin) / 100;
      filtered = filtered.filter((token) => {
        const devPercent = (token as any).dev_percent ?? (token as any).dev_held_percentage ?? 0;
        return devPercent >= minPercent;
      });
    }

    if (filters.devHoldingPercentMax) {
      const maxPercent = parseFloat(filters.devHoldingPercentMax) / 100;
      filtered = filtered.filter((token) => {
        const devPercent = (token as any).dev_percent ?? (token as any).dev_held_percentage ?? 0;
        return devPercent <= maxPercent;
      });
    }

    // Apply sniper percent filters (values are decimals 0-1, filter input is percentage 0-100)
    if (filters.snipersPercentMin) {
      const minPercent = parseFloat(filters.snipersPercentMin) / 100;
      filtered = filtered.filter((token) => {
        const sniperPercent = (token as any).sniper_percent ?? (token as any).sniper_held_percentage ?? 0;
        return sniperPercent >= minPercent;
      });
    }

    if (filters.snipersPercentMax) {
      const maxPercent = parseFloat(filters.snipersPercentMax) / 100;
      filtered = filtered.filter((token) => {
        const sniperPercent = (token as any).sniper_percent ?? (token as any).sniper_held_percentage ?? 0;
        return sniperPercent <= maxPercent;
      });
    }

    // Apply insider percent filters (values are decimals 0-1, filter input is percentage 0-100)
    if (filters.insidersPercentMin) {
      const minPercent = parseFloat(filters.insidersPercentMin) / 100;
      filtered = filtered.filter((token) => {
        const insiderPercent = (token as any).insider_percent ?? (token as any).insider_held_percentage ?? 0;
        return insiderPercent >= minPercent;
      });
    }

    if (filters.insidersPercentMax) {
      const maxPercent = parseFloat(filters.insidersPercentMax) / 100;
      filtered = filtered.filter((token) => {
        const insiderPercent = (token as any).insider_percent ?? (token as any).insider_held_percentage ?? 0;
        return insiderPercent <= maxPercent;
      });
    }

    // Apply dev migrations filters (number of tokens migrated by dev)
    if (filters.devMigrationsMin) {
      const minMigrations = parseFloat(filters.devMigrationsMin);
      filtered = filtered.filter((token) => {
        const devMigrated = (token as any).dev_tokens_migrated ?? 0;
        return devMigrated >= minMigrations;
      });
    }

    if (filters.devMigrationsMax) {
      const maxMigrations = parseFloat(filters.devMigrationsMax);
      filtered = filtered.filter((token) => {
        const devMigrated = (token as any).dev_tokens_migrated ?? 0;
        return devMigrated <= maxMigrations;
      });
    }

    // Apply dev pairs created filters (number of tokens created by dev)
    if (filters.devPairsCreatedMin) {
      const minCreated = parseFloat(filters.devPairsCreatedMin);
      filtered = filtered.filter((token) => {
        const devCreated = (token as any).dev_tokens_created ?? 0;
        return devCreated >= minCreated;
      });
    }

    if (filters.devPairsCreatedMax) {
      const maxCreated = parseFloat(filters.devPairsCreatedMax);
      filtered = filtered.filter((token) => {
        const devCreated = (token as any).dev_tokens_created ?? 0;
        return devCreated <= maxCreated;
      });
    }

    // Apply bundle percent filter
    if (filters.bundlePercentMin) {
      const minPercent = parseFloat(filters.bundlePercentMin);
      filtered = filtered.filter((token) => {
        const bundlePercent = (token as any).bundle_percent ?? (token as any).bundled_percentage ?? (token as any).bundler_held_percentage ?? 0;
        // Convert to percentage if stored as decimal
        const percentValue = bundlePercent > 1 ? bundlePercent : bundlePercent * 100;
        return percentValue >= minPercent;
      });
    }

    if (filters.bundlePercentMax) {
      const maxPercent = parseFloat(filters.bundlePercentMax);
      filtered = filtered.filter((token) => {
        const bundlePercent = (token as any).bundle_percent ?? (token as any).bundled_percentage ?? (token as any).bundler_held_percentage ?? 0;
        // Convert to percentage if stored as decimal
        const percentValue = bundlePercent > 1 ? bundlePercent : bundlePercent * 100;
        return percentValue <= maxPercent;
      });
    }

    // Apply global fees paid filter (in SOL)
    if (filters.globalFeesPaidMin) {
      const minFees = parseFloat(filters.globalFeesPaidMin);
      filtered = filtered.filter((token) => {
        let feesPaid = (token as any).global_fees_paid ?? (token as any).globalFeesPaid ?? 0;
        if (feesPaid === 0) {
          const lamports = (token as any).total_fees_lamports ?? 0;
          if (lamports > 0) feesPaid = lamports / 1_000_000_000;
        }
        return feesPaid >= minFees;
      });
    }

    if (filters.globalFeesPaidMax) {
      const maxFees = parseFloat(filters.globalFeesPaidMax);
      filtered = filtered.filter((token) => {
        let feesPaid = (token as any).global_fees_paid ?? (token as any).globalFeesPaid ?? 0;
        if (feesPaid === 0) {
          const lamports = (token as any).total_fees_lamports ?? 0;
          if (lamports > 0) feesPaid = lamports / 1_000_000_000;
        }
        return feesPaid <= maxFees;
      });
    }

    // Apply Twitter reuses filter
    if (filters.twitterReusesMin) {
      const minReuses = parseFloat(filters.twitterReusesMin);
      filtered = filtered.filter((token) => {
        const reuses = (token as any).twitter_reuses ?? (token as any).twitterReuses ?? (token as any).twitter_reuse_count ?? 0;
        return reuses >= minReuses;
      });
    }

    if (filters.twitterReusesMax) {
      const maxReuses = parseFloat(filters.twitterReusesMax);
      filtered = filtered.filter((token) => {
        const reuses = (token as any).twitter_reuses ?? (token as any).twitterReuses ?? (token as any).twitter_reuse_count ?? 0;
        return reuses <= maxReuses;
      });
    }

    // Apply tweet age filter
    if (filters.tweetAgeMin || filters.tweetAgeMax) {
      filtered = filtered.filter((token) => {
        const tweetTimestamp = (token as any).tweet_created_at ?? (token as any).tweetCreatedAt ?? (token as any).twitter_created_at;
        if (!tweetTimestamp) return true; // If no tweet timestamp, don't filter out

        const tweetDate = new Date(tweetTimestamp).getTime();
        const now = Date.now();
        const tweetAgeMs = now - tweetDate;

        // Convert to the selected unit
        let tweetAgeInUnit: number;
        switch (filters.tweetAgeUnit) {
          case "h":
            tweetAgeInUnit = tweetAgeMs / (1000 * 60 * 60); // hours
            break;
          case "d":
            tweetAgeInUnit = tweetAgeMs / (1000 * 60 * 60 * 24); // days
            break;
          default:
            tweetAgeInUnit = tweetAgeMs / (1000 * 60); // minutes
        }

        const minAge = filters.tweetAgeMin ? parseFloat(filters.tweetAgeMin) : 0;
        const maxAge = filters.tweetAgeMax ? parseFloat(filters.tweetAgeMax) : Infinity;

        return tweetAgeInUnit >= minAge && tweetAgeInUnit <= maxAge;
      });
    }

    // Apply social media filters
    if (filters.hasWebsite) {
      filtered = filtered.filter((token) => {
        const website =
          (token as any).website ?? (token as any).website_url ?? "";
        return website && website.trim().length > 0;
      });
    }

    if (filters.hasTwitter) {
      filtered = filtered.filter((token) => {
        const twitter =
          (token as any).twitter ??
          (token as any).twitter_url ??
          (token as any).x ??
          (token as any).x_url ??
          "";
        return twitter && twitter.trim().length > 0;
      });
    }

    if (filters.hasTelegram) {
      filtered = filtered.filter((token) => {
        const telegram =
          (token as any).telegram ?? (token as any).telegram_url ?? "";
        return telegram && telegram.trim().length > 0;
      });
    }

    if (filters.atLeastOneSocial) {
      filtered = filtered.filter((token) => {
        const website =
          (token as any).website ?? (token as any).website_url ?? "";
        const twitter =
          (token as any).twitter ??
          (token as any).twitter_url ??
          (token as any).x ??
          (token as any).x_url ??
          "";
        const telegram =
          (token as any).telegram ?? (token as any).telegram_url ?? "";
        return (
          (website && website.trim().length > 0) ||
          (twitter && twitter.trim().length > 0) ||
          (telegram && telegram.trim().length > 0)
        );
      });
    }

    if (filters.onlyPumpLive) {
      filtered = filtered.filter((token) => {
        const protocol = (token as any).launchpad_protocol?.toLowerCase() || "";
        const isLive = (token as any).is_live ?? (token as any).isLive ?? true;
        return protocol.includes("pump") && isLive;
      });
    }

    // Sort tokens
    filtered.sort((a, b) => {
      // Special sorting for New Pairs: always sort by newest first (fastest path - no filtering delays)
      const isNewPairs =
        title.toLowerCase().includes("new") &&
        !title.toLowerCase().includes("migrated");
      if (isNewPairs) {
        const aTimestamp = getTokenTimestamp(a, NEW_PAIRS_TIMESTAMP_FIELDS);
        const bTimestamp = getTokenTimestamp(b, NEW_PAIRS_TIMESTAMP_FIELDS);
        return bTimestamp - aTimestamp;
      }

      // Special sorting for Migrated: sort by token's original age (youngest tokens first)
      // Use created_at/launch_time, NOT migrated_time
      const isMigrated = title.toLowerCase().includes("migrated");
      if (isMigrated) {
        const aTimestamp = getTokenTimestamp(a, MIGRATED_TIMESTAMP_FIELDS);
        const bTimestamp = getTokenTimestamp(b, MIGRATED_TIMESTAMP_FIELDS);

        return bTimestamp - aTimestamp;
      }

      // Special sorting for Final Stretch: prioritize high bonding Meteora tokens by newest + highest bonding
      if (
        title.toLowerCase().includes("final") ||
        title.toLowerCase().includes("stretch")
      ) {
        const aLaunchpadProtocol =
          (a as any).launchpad_protocol?.toLowerCase() || "";
        const bLaunchpadProtocol =
          (b as any).launchpad_protocol?.toLowerCase() || "";
        const aIsMeteora = aLaunchpadProtocol.includes("meteora");
        const bIsMeteora = bLaunchpadProtocol.includes("meteora");
        const aBondingPct = (a as any).bonding_pct ?? 0;
        const bBondingPct = (b as any).bonding_pct ?? 0;
        const aIsHighBondingMeteora = aIsMeteora && aBondingPct > 98.6;
        const bIsHighBondingMeteora = bIsMeteora && bBondingPct > 98.6;

        // High bonding Meteora tokens go to top
        if (aIsHighBondingMeteora && !bIsHighBondingMeteora) return -1;
        if (!aIsHighBondingMeteora && bIsHighBondingMeteora) return 1;

        // If both are high bonding Meteora, sort by timestamp (newest first), then bonding percentage
        if (aIsHighBondingMeteora && bIsHighBondingMeteora) {
          const aTimestamp = getTokenTimestamp(a, BASE_TIMESTAMP_FIELDS);
          const bTimestamp = getTokenTimestamp(b, BASE_TIMESTAMP_FIELDS);

          const timestampDiff = bTimestamp - aTimestamp;
          if (Math.abs(timestampDiff) > 60000) {
            // If timestamps differ by more than 1 minute
            return timestampDiff;
          }

          // If timestamps are similar, sort by bonding percentage (highest first)
          return bBondingPct - aBondingPct;
        }
      }
      let aValue, bValue;

      // Sorting applied (debug logs removed for performance)

      switch (filters.sortBy) {
        case "marketCap":
          aValue = getTokenMarketCap(a);
          bValue = getTokenMarketCap(b);
          break;
        case "volume":
          aValue = calculateVolumeUsd(a, solPrice);
          bValue = calculateVolumeUsd(b, solPrice);
          break;
        case "symbol":
          aValue = a.symbol?.toLowerCase() ?? "";
          bValue = b.symbol?.toLowerCase() ?? "";
          break;
        case "timestamp":
        case "time": {
          const timestampFields = isMigrated
            ? MIGRATED_TIMESTAMP_FIELDS
            : isNewPairs
              ? NEW_PAIRS_TIMESTAMP_FIELDS
              : BASE_TIMESTAMP_FIELDS;
          aValue = getTokenTimestamp(a, timestampFields);
          bValue = getTokenTimestamp(b, timestampFields);
          break;
        }
        default:
          aValue = getTokenMarketCap(a);
          bValue = getTokenMarketCap(b);
      }

      if (filters.sortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    // DEBUG: Check if specific Meteora token bypasses filter (temporary)
    if (hasSpecificProtocols && title.toLowerCase().includes("final")) {
      const DEBUG_MINT = "G6VuahbXzNDc9xeQL8VpRF5AbuRJQF4WSxhmHwWsaEDg";
      const badToken = filtered.find(t => t.mint === DEBUG_MINT);
      if (badToken) {
        console.error(`[FILTER BUG] Token ${badToken.symbol} (${DEBUG_MINT}) in Final Stretch despite filter: ${filters.protocols.join(",")}. Protocol: ${(badToken as any).launchpad_protocol || "NONE"}`);
      }
    }

    return filtered;
  }, [
    tokens,
    baseTokens,
    filteredTokens,
    wsTokens,
    directNewTokens, // Direct bridge - WebSocket in main thread
    directFinalStretchTokens,
    directMigratedTokens,
    title,
    filters.protocols,
    filters.quoteTokens,
    filters.searchKeywords,
    filters.excludeKeywords,
    filters.dexPaid,
    filters.caEndsInPump,
    filters.minAge,
    filters.maxAge,
    filters.ageUnit,
    filters.top10HoldersPercent,
    filters.minMarketCap,
    filters.maxMarketCap,
    filters.minVolume,
    filters.maxVolume,
    filters.minLiquidity,
    filters.maxLiquidity,
    filters.bCurvePercentMin,
    filters.bCurvePercentMax,
    filters.txnsMin,
    filters.txnsMax,
    filters.numBuysMin,
    filters.numBuysMax,
    filters.numSellsMin,
    filters.numSellsMax,
    filters.holdersMin,
    filters.holdersMax,
    filters.kolCountMin,
    filters.kolCountMax,
    filters.devHoldingPercentMin,
    filters.devHoldingPercentMax,
    filters.snipersPercentMin,
    filters.snipersPercentMax,
    filters.insidersPercentMin,
    filters.insidersPercentMax,
    filters.devMigrationsMin,
    filters.devMigrationsMax,
    filters.devPairsCreatedMin,
    filters.devPairsCreatedMax,
    filters.bundlePercentMin,
    filters.bundlePercentMax,
    filters.globalFeesPaidMin,
    filters.globalFeesPaidMax,
    filters.twitterReusesMin,
    filters.twitterReusesMax,
    filters.tweetAgeMin,
    filters.tweetAgeMax,
    filters.tweetAgeUnit,
    filters.hasWebsite,
    filters.hasTwitter,
    filters.hasTelegram,
    filters.atLeastOneSocial,
    filters.onlyPumpLive,
    filters.sortBy,
    filters.sortOrder,
    channel, // Used to select direct token source (new/final_stretch/migrated)
    solPrice, // Needed for volume filter/sort via calculateVolumeUsd()
    blacklistCASet, // Blacklist: contract addresses
    blacklistDevSet, // Blacklist: dev wallets
    blacklistTwitterSet, // Blacklist: twitter handles
  ]);

  // REMOVED redundant useMemo - filteredAndSortedTokens is already memoized
  // Using it directly saves one layer of memoization overhead
  const memoizedTokens = filteredAndSortedTokens;

  // Pre-filter tokens for virtualized rendering (moved out of render for perf)
  const filteredTokensForDisplay = useMemo(
    () =>
      memoizedTokens.filter((token) => {
        const pairAddress = (token as any)?.pair_address;
        const mint = (token as any)?.mint;
        return (
          (pairAddress && pairAddress.trim() !== "") ||
          (mint && mint.trim() !== "")
        );
      }),
    [memoizedTokens],
  );

  const PULSE_ROW_HEIGHT = 104; // 100px content + 4px gap

  // Add wave animation for Meteora tokens with bonding_pct > 98.6% in Final Stretch ONLY
  // PERFORMANCE: Skip this effect entirely for New Pairs and Migrated columns
  const waveTokensRef = useRef<Set<number>>(new Set());
  const isFinalStretch = useMemo(() =>
    title.toLowerCase().includes("final") || title.toLowerCase().includes("stretch"),
    [title]
  );

  useEffect(() => {
    // FAST PATH: Skip for non-Final Stretch columns
    if (!isFinalStretch) {
      if (waveTokensRef.current.size > 0) {
        waveTokensRef.current = new Set();
        setWaveTokens(new Set());
      }
      return;
    }

    // Only compute wave tokens for Final Stretch column
    const newWaveTokens = new Set<number>();
    const tokens = memoizedTokens;
    const len = Math.min(tokens.length, 50); // Only check first 50 for performance

    for (let idx = 0; idx < len; idx++) {
      const token = tokens[idx];
      const launchpadProtocol = (token as any).launchpad_protocol?.toLowerCase() || "";
      const isMeteora = launchpadProtocol.includes("meteora");
      const bondingPct = (token as any).bonding_pct ?? 0;

      if (isMeteora && bondingPct > 98.6) {
        newWaveTokens.add(idx);
      }
    }

    // Only update state if the wave tokens actually changed
    const prevWave = waveTokensRef.current;
    if (prevWave.size !== newWaveTokens.size) {
      waveTokensRef.current = newWaveTokens;
      setWaveTokens(newWaveTokens);
      return;
    }

    // Check if contents are the same (avoid array spread)
    let isSame = true;
    for (const idx of prevWave) {
      if (!newWaveTokens.has(idx)) {
        isSame = false;
        break;
      }
    }

    if (!isSame) {
      waveTokensRef.current = newWaveTokens;
      setWaveTokens(newWaveTokens);
    }
  }, [memoizedTokens, isFinalStretch]);

  const shortAddr = (token: any): string => {
    try {
      const a = token?.pair_address || token?.mint || token?.address || "";
      if (typeof a !== "string" || a.length < 8) return a || "-";

      // Check if address ends with "pump" and show it
      if (a.toLowerCase().endsWith("pump")) {
        return `${a.slice(0, 4)}...pump`;
      }

      return `${a.slice(0, 4)}...${a.slice(-4)}`;
    } catch {
      return "-";
    }
  };

  const handleArmSniper = async () => {
    const token = selectedToken;
    if (!token) return;

    if (!user?.bearerToken || !user?.id) {
      showEnhancedToast(
        "warning",
        "Please connect your wallet to arm a sniper",
        {
          title: "Wallet Required",
          description: "Sign in with your wallet to create sniper orders.",
        },
      );
      return;
    }

    const amountValue = parseFloat(thunderAmount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      showEnhancedToast("error", "Enter a valid SOL amount", {
        title: "Invalid Amount",
        description: "Provide a positive SOL amount before arming the sniper.",
      });
      return;
    }

    let poolAddress =
      (token as any).migrated_pool_address ||
      token.pair_address ||
      (token as any).pool_address ||
      "";

    // CRITICAL: Verify the pair address from the token service before creating sniper
    if (token.mint) {
      const verifiedPairAddress = await fetchVerifiedPairAddress(token.mint);
      if (verifiedPairAddress) {
        poolAddress = verifiedPairAddress;
      }
    }

    if (!poolAddress) {
      showEnhancedToast("error", "Pool information unavailable", {
        title: "Cannot Arm Sniper",
        description: "We could not determine the pool address for this token.",
      });
      return;
    }

    const sanitizeNumber = (value: unknown, fallback: number): number => {
      const numeric =
        typeof value === "string" ? Number(value) : (value as number);
      return Number.isFinite(numeric) ? numeric : fallback;
    };

    const presetIndex = getPresetIndex();
    const presetSettings = (presets[presetIndex]?.quickBuySettings ??
      {}) as any;
    const slippageValue = sanitizeNumber(
      presetSettings.maxSlippage,
      slippage || 0.2,
    );
    const priorityFeeValue = sanitizeNumber(
      presetSettings.priority,
      priority || 0.0001,
    );
    const bribeValue = sanitizeNumber(presetSettings.bribe, bribe || 0);
    const maxFeeValue = sanitizeNumber(presetSettings.maxFee, 0);
    const mevModeValue =
      typeof presetSettings.mevMode === "string"
        ? presetSettings.mevMode
        : "off";
    const autoFeeValue = Boolean(presetSettings.autoFee);
    const rpcValue =
      typeof presetSettings.rpc === "string" &&
      presetSettings.rpc.trim().length > 0
        ? presetSettings.rpc.trim()
        : undefined;

    const latestMarketCap = Number(
      (token as any).market_cap_usd ??
        (token as any).marketcap_usd ??
        (token as any).fdv_usd ??
        (token as any).fdv ??
        0,
    );

    const targetBonding = 100;
    const initiatingToastId = showEnhancedToast("loading", "Arming sniper…", {
      title: "Arming Sniper",
      description: `${amountValue.toLocaleString(undefined, {
        maximumFractionDigits: 6,
      })} SOL • Bonding Target ${targetBonding.toFixed(2)}%`,
    });

    setSniperSubmitting(true);

    try {
      const response = await createLimitOrder(
        {
          tokenAddress: token.mint || "",
          amount: amountValue,
          type: "Buy",
          direction: "Above",
          triggerType: "bonding",
          bondingTarget: targetBonding,
          targetMC: latestMarketCap,
          currentMarketCap: latestMarketCap,
          tokenName: token.name,
          tokenSymbol: token.symbol,
          tokenDecimals: token.decimals,
          poolAddress,
          pairAddress: poolAddress, // Use the verified pool address
          poolType: getPoolTypeFromToken(token),
          slippage: slippageValue,
          priorityFee: priorityFeeValue,
          bribe: bribeValue,
          mevProtection: presetSettings.mevProtection ?? false,
          mevMode: mevModeValue,
          autoFee: autoFeeValue,
          maxFee: maxFeeValue,
          rpc: rpcValue,
        },
        user.bearerToken,
      );

      updateEnhancedToast(
        initiatingToastId,
        "success",
        `${token.symbol} sniper armed`,
        {
          title: "Sniper Armed",
          description: `${amountValue.toLocaleString(undefined, {
            maximumFractionDigits: 6,
          })} SOL • Bonding Target 100%`,
        },
      );

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("limit-order-update", {
            detail: {
              status: "Pending",
              triggerType: "bonding",
              bondingTarget: targetBonding,
            },
          }),
        );
      }

      setShowSnipeModal(false);
    } catch (error: any) {
      const message =
        error?.message?.length > 80
          ? `${error.message.substring(0, 77)}…`
          : error?.message || "Failed to arm sniper";
      updateEnhancedToast(initiatingToastId, "error", "Unable to arm sniper", {
        title: "Sniper Failed",
        description: message,
      });
    } finally {
      setSniperSubmitting(false);
    }
  };
  const getAgeLabel = (token: any): string => {
    try {
      // Accept multiple possible fields and formats
      // PRIORITY: launch_time first (backend primary field for new tokens)
      let v: any =
        token?.launch_time ??
        token?.launchTime ??
        token?.created_at ??
        token?.createdAt ??
        token?.listedAt ??
        token?.mintedAt ??
        token?.pair_created_at ??
        token?.pairCreatedAt ??
        token?.pool_created_at ??
        token?.poolCreatedAt ??
        token?.exchange_created_at ??
        token?.exchangeCreatedAt ??
        token?.firstSeen ??
        token?.first_seen ??
        token?.timestamp ??
        token?.ts ??
        token?.block_time ??
        token?.blockTime ??
        null;
      if (v === null || v === undefined) return "-";
      if (typeof v === "object") {
        if ("Time" in v && typeof (v as any).Time === "string")
          v = (v as any).Time;
        else if ("time" in v && typeof (v as any).time === "string")
          v = (v as any).time;
        else if ("seconds" in v && typeof (v as any).seconds === "number")
          v = Number((v as any).seconds) * 1000;
        else if ("millis" in v && typeof (v as any).millis === "number")
          v = Number((v as any).millis);
      }
      let ts: number | null = null;
      if (typeof v === "number") {
        // Heuristic: treat 13-digit as ms, 10-digit as seconds
        if (v > 1e12) ts = v;
        else if (v > 1e9) ts = v * 1000;
        else ts = null;
      } else if (typeof v === "string") {
        const num = Number(v);
        if (!Number.isNaN(num) && num > 0) {
          if (num > 1e12) ts = num;
          else if (num > 1e9) ts = num * 1000;
        }
        if (ts === null) {
          const d = Date.parse(v);
          if (!Number.isNaN(d)) ts = d;
        }
      } else if (v instanceof Date) {
        ts = v.getTime();
      }
      if (ts === null) return "-";
      const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
      if (diffSec < 60) return `${diffSec}s`;
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
      return `${Math.floor(diffSec / 86400)}d`;
    } catch {
      return "-";
    }
  };
  return (
    <div
      className={`num flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:min-w-[300px] gap-2`}
    >
      <div
        className="group relative flex items-center justify-between rounded-lg px-2.5 py-1 text-sm font-medium"
        style={{
          backgroundColor: "#13151b",
          color: AX.text,
        }}
        onMouseEnter={() => setIsHeaderHovered(true)}
        onMouseLeave={() => setIsHeaderHovered(false)}
      >
        {/* Left side container for title */}
        <div className="flex flex-shrink-0 items-center gap-1 font-normal">
          {/* Column icon - outline style */}
          {title.includes("New Pairs") && (
            <PiLeafLight size={14} style={{ color: AX.text }} />
          )}
          {title.includes("Final Stretch") && (
            <HiOutlineFire size={14} style={{ color: "#fcaf25" }} />
          )}
          {title.includes("Migrated") && (
            <HiOutlineRocketLaunch size={14} style={{ color: "#52c75f" }} />
          )}
          <span
            className="text-xs lg:text-sm"
            style={{
              fontWeight: "500",
              letterSpacing: "0.3px",
            }}
          >
            {title.includes("New Pairs")
              ? "New"
              : title.includes("Final Stretch")
                ? "Soon"
                : title.includes("Migrated")
                  ? "Migrated"
                  : title}
          </span>
        </div>

        {/* Right side container for pill and filter */}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          {/* Keyword Search Box */}
          <div
            className="hidden min-w-0 flex-shrink items-center gap-1.5 overflow-hidden rounded-md border px-2 sm:flex"
            style={{
              borderColor: AX.border,
              backgroundColor: "#272a2e",
              paddingTop: "4px",
              paddingBottom: "4px",
              minWidth: "90px",
              maxWidth: "110px",
              height: "26px",
            }}
          >
            <LuSearch size={12} style={{ color: AX.muted, flexShrink: 0 }} />
            <input
              type="text"
              value={filters.searchKeywords}
              onChange={(e) => {
                setFilters((prev) => ({
                  ...prev,
                  searchKeywords: e.target.value,
                }));
              }}
              placeholder="keyword1, keyword2"
              className="w-full max-w-full min-w-0 flex-1 border-none bg-transparent text-left text-xs font-medium placeholder-gray-500 outline-none"
              style={{ color: AX.text }}
            />
          </div>

          {/* Thunder Icon and Amount Entry - Separate Thin Box */}
          <div
            className="hidden flex-shrink-0 items-center justify-center gap-1 rounded-md border px-2 sm:flex"
            style={{
              borderColor: AX.border,
              backgroundColor: "#272a2e",
              paddingTop: "4px",
              paddingBottom: "4px",
              width: "65px",
              height: "26px",
            }}
          >
            <HiLightningBolt size={12} style={{ color: AX.aiGreen }} />
            <input
              type="text"
              value={thunderAmount}
              inputMode="decimal"
              onChange={(e) => {
                const value = e.target.value;
                // Allow only digits and at most one decimal point
                if (value === "" || /^\d*\.?\d*$/.test(value)) {
                  setThunderAmount(value);
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
                if (allowedKeys.includes(e.key)) return;
                if (e.key === ".") return;
                if (!/^[0-9]$/.test(e.key)) {
                  e.preventDefault();
                }
              }}
              className="w-10 border-none bg-transparent text-center text-xs font-medium outline-none"
              style={{ color: AX.text }}
            />
          </div>

          {/* P1 P2 P3 Boxes - Separate Thin Box With Background Color */}
          <div
            className="w-[84px] h-[26px] relative hidden sm:flex flex-shrink-0 items-center justify-center gap-1 rounded-md border px-2 py-1 bg-[#1a1c20]"
            style={{
              borderColor: AX.border,
            }}
          >
            {["P1", "P2", "P3"].map((pill, i) => (
              <div
                key={pill}
                className="relative flex items-center justify-center"
              >
                <button
                  className={`flex cursor-pointer items-center justify-center rounded px-1 py-[2px] text-xs font-medium ${
                    selectedPill === pill
                      ? "bg-[rgba(49,227,172,0.15)]"
                      : "bg-[rgba(22,23,28,0.6)] hover:bg-[rgba(40,43,50,0.6)]"
                  }`}
                  style={{
                    color: selectedPill === pill ? "#31e3ac" : AX.muted,
                    transition: "background-color 100ms ease-out, color 100ms ease-out",
                  }}
                  onClick={() => {
                    // Update local preset selection for this column only
                    setSelectedPill(pill);
                  }}
                  onMouseEnter={(e) => {
                    if (selectedPill !== pill) {
                      e.currentTarget.style.color = "#f0f5f5";
                    }
                    setShowPillTooltip(pill);
                  }}
                  onMouseLeave={(e) => {
                    if (selectedPill !== pill) {
                      e.currentTarget.style.color = "";
                    }
                    setShowPillTooltip(null);
                  }}
                >
                  {pill}
                </button>

                {/* Tooltip for each pill */}
                {showPillTooltip === pill &&
                  (() => {
                    // Get preset index from pill (P1 = 0, P2 = 1, P3 = 2)
                    const presetIndex = parseInt(pill.replace("P", "")) - 1;
                    const preset = presets[presetIndex];
                    const settings = preset?.quickBuySettings;

                    if (!settings) return null;

                    return (
                      <div
                        className="absolute top-full left-0 z-50 mt-1 w-28 rounded-lg border shadow-xl"
                        style={{
                          backgroundColor: "rgba(15, 16, 18, 0.95)",
                          borderColor: AX.border,
                        }}
                      >
                        <div className="space-y-1.5 p-2">
                          {/* Slippage - Running person icon */}
                          <div className="flex items-center gap-1.5">
                            <FaRunning
                              size={10}
                              className="opacity-80"
                              style={{ strokeWidth: "2" }}
                            />
                            <span className="text-xs font-light text-gray-300">
                              {(settings.maxSlippage * 100).toFixed(0)}%
                            </span>
                          </div>

                          {/* Priority Fee - Gas pump icon with yellow styling */}
                          <div className="flex items-center gap-1.5">
                            <FaGasPump
                              size={10}
                              className="opacity-90"
                              style={{ color: "#FCD34D", strokeWidth: "2" }}
                            />
                            <span className="text-xs font-light text-yellow-400">
                              {settings.priority}
                            </span>
                            <span
                              className="text-xs font-light"
                              style={{ color: "#d11f3a" }}
                            >
                              ⚠
                            </span>
                          </div>

                          {/* Bribe - Coins icon with yellow styling */}
                          <div className="flex items-center gap-1.5">
                            <FaCoins
                              size={10}
                              className="opacity-90"
                              style={{ color: "#FCD34D", strokeWidth: "2" }}
                            />
                            <span className="text-xs font-light text-yellow-400">
                              {settings.bribe}
                            </span>
                            <span
                              className="text-xs font-light"
                              style={{ color: "#d11f3a" }}
                            >
                              ⚠
                            </span>
                          </div>

                          {/* MEV Protection - Ban icon */}
                          <div className="flex items-center gap-1.5">
                            <FaBan
                              size={10}
                              className="opacity-90"
                              style={{ strokeWidth: "2" }}
                            />
                            <span className="text-xs font-light text-gray-300">
                              {settings.mevMode === "off"
                                ? "Off"
                                : settings.mevMode === "reduced"
                                  ? "Reduced"
                                  : "Secure"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
              </div>
            ))}
          </div>


          {/* Filter Controls */}
          <div className="filter-dropdown relative flex-shrink-0  z-[9999]">
            <button
              className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-all duration-300 ease-out z-[9999]"
              style={{
                backgroundColor: "transparent",
                color: showFilters ? AX.aiBlue : AX.muted,
              }}
              onMouseEnter={(e) => {
                if (!showFilters) {
                  e.currentTarget.style.color = "#E6E7EA";
                }
              }}
              onMouseLeave={(e) => {
                if (!showFilters) {
                  e.currentTarget.style.color = AX.muted;
                }
              }}
              onClick={() => setShowFilters(!showFilters)}
            >
              <BsSliders2 size={14} />

              {/* Protocol Filter Count Indicator (exclude 'All') */}
              {/* {filters.protocols.filter((p: string) => p !== "All").length >
                0 && (
                <span
                  className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-xs font-bold"
                  style={{ color: "#f0f5f5", fontSize: "10px", backgroundColor: "#31e3ac" }}
                >
                  {filters.protocols.filter((p: string) => p !== "All").length}
                </span>
              )} */}
              {filters.protocols.length > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full font-bold"
                  style={{
                    backgroundColor: "#31e3ac",
                    color: "#000000",
                    fontSize: "8px",
                  }}
                >
                  {filters.protocols.length}
                </span>
              )}
            </button>

            {/* Comprehensive Filter Modal - portaled to body to escape stacking contexts */}
            {showFilters &&
              typeof document !== "undefined" &&
              createPortal(
                <>
                  {/* Backdrop */}
                  <div
                    className="fixed inset-0"
                    style={{
                      backgroundColor: "rgba(0, 0, 0, 0.3)",
                      zIndex: 10000000,
                    }}
                    onClick={() => setShowFilters(false)}
                  />
                  {/* Modal */}
                  <div
                    className="filter-modal fixed top-1/2 left-1/2 max-h-[90vh] w-[95vw] max-w-[600px] -translate-x-1/2 -translate-y-1/2 transform overflow-y-auto rounded-lg border shadow-xl"
                    style={{
                      backgroundColor: AX.surface,
                      borderColor: AX.border,
                      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
                      zIndex: 10000001,
                    }}
                  >
                  {/* Header */}
                  <div
                    className="flex items-center justify-between border-b p-4"
                    style={{ borderColor: AX.border }}
                  >
                    <h3
                      className="text-lg"
                      style={{
                        color: AX.text,
                        fontWeight: "300",
                        letterSpacing: "0.5px",
                      }}
                    >
                      Filters
                    </h3>
                    <button
                      onClick={() => setShowFilters(false)}
                      className="cursor-pointer rounded p-1 transition-colors hover:bg-gray-700"
                    >
                      <FaTimes size={16} className="font-normal" />
                    </button>
                  </div>

                  {/* Filter Tabs */}
                  {/* <div className="flex border-b items-center justify-between" style={{ borderColor: AX.border }}>
                <div className="flex">
                {['New Pairs', 'Final Stretch', 'Migrated'].map((tab) => (
                  <button
                    key={tab}
                      className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                        activeFilterTab === tab ? 'border-b-2' : ''
                      }`}
                    style={{
                      color: activeFilterTab === tab ? AX.aiBlue : AX.muted,
                      borderBottomColor: activeFilterTab === tab ? AX.aiBlue : 'transparent'
                    }}
                    onClick={() => setActiveFilterTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
                </div> */}
                  <div
                    className="flex items-center justify-end border-b p-1"
                    style={{ borderColor: AX.border }}
                  >
                    <button
                      className="mr-2 cursor-pointer rounded p-1 transition-colors hover:bg-gray-700"
                      onClick={handleResetFilters}
                    >
                      <BiRefresh
                        className="h-4 w-4"
                        style={{ color: AX.text }}
                      />
                    </button>
                  </div>
                  <div
                    className="max-h-[500px] overflow-y-auto p-4"
                    style={{ backgroundColor: AX.surface }}
                  >
                    {/* Protocols */}
                    <div className="mb-4">
                      <div className="mb-2 flex items-center justify-between">
                        <h4
                          className="text-sm font-medium"
                          style={{ color: AX.text }}
                        >
                          Protocols
                        </h4>
                        <button
                          className="cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-all duration-300 ease-out"
                          style={{
                            backgroundColor: AX.aiBlue,
                            color: "#000000",
                            borderRadius: "20px",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "#2563eb";
                            e.currentTarget.style.boxShadow = `0 0 8px ${AX.glowBlue}`;
                            e.currentTarget.style.transform = "scale(1.05)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = AX.aiBlue;
                            e.currentTarget.style.boxShadow = "none";
                            e.currentTarget.style.transform = "scale(1)";
                          }}
                          onClick={() => {
                            // Simply revert to ['All'] - same as default state, no API call needed
                            handlePendingFilterChange((prev) => {
                              return {
                                ...prev,
                                protocols: ["All"],
                              };
                            });
                          }}
                        >
                          Select All
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {protocols.map((protocol) => (
                          <button
                            key={protocol.name}
                            className="flex cursor-pointer items-center gap-1 px-2 py-1.5 text-sm font-medium whitespace-nowrap transition-all duration-300 ease-out"
                            style={{
                              backgroundColor:
                                pendingFilters.protocols.includes(protocol.name)
                                  ? protocol.color
                                  : "transparent",
                              borderColor: pendingFilters.protocols.includes(
                                protocol.name,
                              )
                                ? protocol.color
                                : "transparent",
                              border: pendingFilters.protocols.includes(
                                protocol.name,
                              )
                                ? "2px solid"
                                : "none",
                              color: pendingFilters.protocols.includes(
                                protocol.name,
                              )
                                ? "#000000"
                                : AX.text,
                              borderRadius: "20px",
                              boxShadow: pendingFilters.protocols.includes(
                                protocol.name,
                              )
                                ? `0 0 12px ${protocol.color}40, 0 0 24px ${protocol.color}20`
                                : "none",
                              transform: pendingFilters.protocols.includes(
                                protocol.name,
                              )
                                ? "scale(1.02)"
                                : "scale(1)",
                            }}
                            onMouseEnter={(e) => {
                              if (
                                !pendingFilters.protocols.includes(
                                  protocol.name,
                                )
                              ) {
                                e.currentTarget.style.backgroundColor =
                                  protocol.color + "10";
                                e.currentTarget.style.borderColor =
                                  protocol.color;
                                e.currentTarget.style.border = "1px solid";
                                e.currentTarget.style.color = protocol.color;
                                e.currentTarget.style.boxShadow = `0 0 8px ${protocol.color}30`;
                                e.currentTarget.style.transform = "scale(1.05)";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (
                                !pendingFilters.protocols.includes(
                                  protocol.name,
                                )
                              ) {
                                e.currentTarget.style.backgroundColor =
                                  "transparent";
                                e.currentTarget.style.borderColor =
                                  "transparent";
                                e.currentTarget.style.border = "none";
                                e.currentTarget.style.color = AX.text;
                                e.currentTarget.style.boxShadow = "none";
                                e.currentTarget.style.transform = "scale(1)";
                              }
                            }}
                            onClick={() => {
                              handlePendingFilterChange((prev) => {
                                const currentProtocols = prev.protocols;
                                const clickedProtocol = protocol.name;

                                // If clicking "All", clear all other protocols
                                if (clickedProtocol === "All") {
                                  return { ...prev, protocols: ["All"] };
                                }

                                // If clicking a specific protocol
                                if (
                                  currentProtocols.includes(clickedProtocol)
                                ) {
                                  // Deselecting a protocol
                                  const remaining = currentProtocols.filter(
                                    (p) => p !== clickedProtocol && p !== "All",
                                  );
                                  // If no protocols left, revert to 'All'
                                  return {
                                    ...prev,
                                    protocols:
                                      remaining.length === 0
                                        ? ["All"]
                                        : remaining,
                                  };
                                } else {
                                  // Selecting a new protocol - remove 'All' and add the new one
                                  const withoutAll = currentProtocols.filter(
                                    (p) => p !== "All",
                                  );
                                  return {
                                    ...prev,
                                    protocols: [...withoutAll, clickedProtocol],
                                  };
                                }
                              });
                            }}
                          >
                            <span
                              className="text-sm"
                              style={{ color: "inherit" }}
                            >
                              {protocol.icon}
                            </span>
                            <span
                              className="truncate font-semibold"
                              style={{ color: "inherit" }}
                            >
                              {protocol.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Quote Tokens */}
                    <div className="mb-4">
                      <h4
                        className="mb-2 text-sm font-medium"
                        style={{ color: AX.text }}
                      >
                        Quote Tokens
                      </h4>
                      <div className="flex gap-3">
                        {quoteTokens.map((token) => (
                          <button
                            key={token.name}
                            className="flex cursor-pointer items-center gap-2 px-4 py-2 text-sm font-medium transition-all duration-300 ease-out"
                            style={{
                              backgroundColor:
                                pendingFilters.quoteTokens.includes(token.name)
                                  ? token.color
                                  : "transparent",
                              borderColor: pendingFilters.quoteTokens.includes(
                                token.name,
                              )
                                ? token.color
                                : "transparent",
                              border: pendingFilters.quoteTokens.includes(
                                token.name,
                              )
                                ? "2px solid"
                                : "none",
                              color: pendingFilters.quoteTokens.includes(
                                token.name,
                              )
                                ? "#000000"
                                : AX.text,
                              borderRadius: "20px",
                              boxShadow: pendingFilters.quoteTokens.includes(
                                token.name,
                              )
                                ? `0 0 12px ${token.color}40, 0 0 24px ${token.color}20`
                                : "none",
                              transform: pendingFilters.quoteTokens.includes(
                                token.name,
                              )
                                ? "scale(1.02)"
                                : "scale(1)",
                            }}
                            onMouseEnter={(e) => {
                              if (
                                !pendingFilters.quoteTokens.includes(token.name)
                              ) {
                                e.currentTarget.style.backgroundColor =
                                  token.color + "10";
                                e.currentTarget.style.borderColor = token.color;
                                e.currentTarget.style.border = "1px solid";
                                e.currentTarget.style.color = token.color;
                                e.currentTarget.style.boxShadow = `0 0 8px ${token.color}30`;
                                e.currentTarget.style.transform = "scale(1.05)";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (
                                !pendingFilters.quoteTokens.includes(token.name)
                              ) {
                                e.currentTarget.style.backgroundColor =
                                  "transparent";
                                e.currentTarget.style.borderColor =
                                  "transparent";
                                e.currentTarget.style.border = "none";
                                e.currentTarget.style.color = AX.text;
                                e.currentTarget.style.boxShadow = "none";
                                e.currentTarget.style.transform = "scale(1)";
                              }
                            }}
                            onClick={() => {
                              handlePendingFilterChange((prev) => ({
                                ...prev,
                                quoteTokens: prev.quoteTokens.includes(
                                  token.name,
                                )
                                  ? prev.quoteTokens.filter(
                                      (t) => t !== token.name,
                                    )
                                  : [...prev.quoteTokens, token.name],
                              }));
                            }}
                          >
                            <span
                              className="text-base"
                              style={{ color: "inherit" }}
                            >
                              {token.icon}
                            </span>
                            <span className="font-bold">{token.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Keywords */}
                    <div className="mb-6">
                      <h4
                        className="mb-2 text-sm font-medium"
                        style={{ color: AX.text }}
                      >
                        Search Keywords
                      </h4>
                      <input
                        type="text"
                        placeholder="keyword1, keyword2..."
                        value={pendingFilters.searchKeywords}
                        onChange={(e) =>
                          handlePendingFilterChange((prev) => ({
                            ...prev,
                            searchKeywords: e.target.value,
                          }))
                        }
                        className="w-full rounded border px-3 py-2 text-sm"
                        style={{
                          backgroundColor: AX.surface,
                          borderColor: AX.border,
                          color: AX.text,
                          WebkitAppearance: "none",
                          MozAppearance: "textfield",
                          outline: "none",
                          boxShadow: "none",
                        }}
                        onFocus={(e) => {
                          e.target.style.outline = "none";
                          e.target.style.boxShadow = "none";
                          e.target.style.borderColor = AX.border;
                        }}
                      />
                      <h4
                        className="mt-3 mb-2 text-sm font-medium"
                        style={{ color: AX.text }}
                      >
                        Exclude Keywords
                      </h4>
                      <input
                        type="text"
                        placeholder="keyword1, keyword2..."
                        value={pendingFilters.excludeKeywords}
                        onChange={(e) =>
                          handlePendingFilterChange((prev) => ({
                            ...prev,
                            excludeKeywords: e.target.value,
                          }))
                        }
                        className="w-full rounded border px-3 py-2 text-sm"
                        style={{
                          backgroundColor: AX.surface,
                          borderColor: AX.border,
                          color: AX.text,
                          WebkitAppearance: "none",
                          MozAppearance: "textfield",
                          outline: "none",
                          boxShadow: "none",
                        }}
                        onFocus={(e) => {
                          e.target.style.outline = "none";
                          e.target.style.boxShadow = "none";
                          e.target.style.borderColor = AX.border;
                        }}
                      />
                    </div>

                    {/* Category Tabs */}
                    <div
                      className="mb-4 flex border-b"
                      style={{ borderColor: AX.border }}
                    >
                      {/* Socials tab commented out - filters work but rarely used */}
                      {["Audit", "$ Metrics"].map((tab) => (
                        <button
                          key={tab}
                          className={`cursor-pointer px-3 py-2 text-sm font-medium transition-colors ${
                            activeCategoryTab === tab ? "border-b-2" : ""
                          }`}
                          style={{
                            color:
                              activeCategoryTab === tab ? AX.aiBlue : AX.muted,
                            borderBottomColor:
                              activeCategoryTab === tab
                                ? AX.aiBlue
                                : "transparent",
                          }}
                          onClick={() => setActiveCategoryTab(tab)}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>
                    {/* Category Content */}
                    {activeCategoryTab === "Audit" && (
                      <div className="space-y-3">
                        {/* Existing checkboxes */}
                        {/* Dex Paid - COMMENTED OUT: Filter not implemented (always returns true) */}
                        {/* <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="dexPaid"
                        checked={pendingFilters.dexPaid}
                        onChange={(e) => handlePendingFilterChange(prev => ({ ...prev, dexPaid: e.target.checked }))}
                        className="rounded cursor-pointer"
                      />
                      <label htmlFor="dexPaid" className="text-sm" style={{ color: AX.text }}>Dex Paid</label>
                    </div> */}
                        {/* CA ends in 'pump' - COMMENTED OUT: Rarely useful filter */}
                        {/* <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="caEndsInPump"
                        checked={pendingFilters.caEndsInPump}
                        onChange={(e) => handlePendingFilterChange(prev => ({ ...prev, caEndsInPump: e.target.checked }))}
                        className="rounded cursor-pointer"
                      />
                      <label htmlFor="caEndsInPump" className="text-sm" style={{ color: AX.text }}>CA ends in 'pump'</label>
                    </div> */}

                        {/* Dev Holding % - COMMENTED OUT: Filter not implemented in filter logic */}
                        {/* <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Dev Holding %</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          placeholder="Min"
                          value={pendingFilters.devHoldingPercentMin}
                          onChange={(e) => handlePendingFilterChange(prev => ({ ...prev, devHoldingPercentMin: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={pendingFilters.devHoldingPercentMax}
                          onChange={(e) => handlePendingFilterChange(prev => ({ ...prev, devHoldingPercentMax: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                      </div>
                    </div> */}

                        {/* Snipers % */}
                        {/* <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Snipers %</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          placeholder="Min"
                          value={pendingFilters.snipersPercentMin}
                          onChange={(e) => handlePendingFilterChange(prev => ({ ...prev, snipersPercentMin: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={pendingFilters.snipersPercentMax}
                          onChange={(e) => handlePendingFilterChange(prev => ({ ...prev, snipersPercentMax: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                      </div>
                    </div> */}
                        {/* Insiders % */}
                        {/* <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Insiders %</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          placeholder="Min"
                          value={pendingFilters.insidersPercentMin}
                          onChange={(e) => handlePendingFilterChange(prev => ({ ...prev, insidersPercentMin: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={pendingFilters.insidersPercentMax}
                          onChange={(e) => handlePendingFilterChange(prev => ({ ...prev, insidersPercentMax: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.currentTarget.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                      </div>
                    </div> */}

                        {/* Bundle % */}
                        {/* <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Bundle %</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          placeholder="Min"
                          value={pendingFilters.bundlePercentMin}
                          onChange={(e) => handlePendingFilterChange(prev => ({ ...prev, bundlePercentMin: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={pendingFilters.bundlePercentMax}
                          onChange={(e) => handlePendingFilterChange(prev => ({ ...prev, bundlePercentMax: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                      </div>
                    </div> */}
                        {/* Holders */}
                        <div>
                          <label
                            className="mb-2 block text-sm font-medium"
                            style={{ color: AX.text }}
                          >
                            Holders
                          </label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              placeholder="Min"
                              value={pendingFilters.holdersMin}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  holdersMin: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                            <input
                              type="number"
                              placeholder="Max"
                              value={pendingFilters.holdersMax}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  holdersMax: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                          </div>
                        </div>

                        {/* Pro Traders - Commented out for now
                        <div>
                          <label
                            className="mb-2 block text-sm font-medium"
                            style={{ color: AX.text }}
                          >
                            Pro Traders
                          </label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              placeholder="Min"
                              value={pendingFilters.proTradersMin}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  proTradersMin: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                            <input
                              type="number"
                              placeholder="Max"
                              value={pendingFilters.proTradersMax}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  proTradersMax: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                          </div>
                        </div>
                        */}
                        {/* Dev Migrations */}
                        <div>
                          <label
                            className="mb-2 block text-sm font-medium"
                            style={{ color: AX.text }}
                          >
                            Dev Migrations
                          </label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              placeholder="Min"
                              value={pendingFilters.devMigrationsMin}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  devMigrationsMin: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                            <input
                              type="number"
                              placeholder="Max"
                              value={pendingFilters.devMigrationsMax}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  devMigrationsMax: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                          </div>
                        </div>
                        {/* Dev Pairs Created */}
                        <div>
                          <label
                            className="mb-2 block text-sm font-medium"
                            style={{ color: AX.text }}
                          >
                            Dev Pairs Created
                          </label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              placeholder="Min"
                              value={pendingFilters.devPairsCreatedMin}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  devPairsCreatedMin: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                            <input
                              type="number"
                              placeholder="Max"
                              value={pendingFilters.devPairsCreatedMax}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  devPairsCreatedMax: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                          </div>
                        </div>
                        {/* KOL Count */}
                        <div>
                          <label
                            className="mb-2 block text-sm font-medium"
                            style={{ color: AX.text }}
                          >
                            KOL Count
                          </label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              placeholder="Min"
                              value={pendingFilters.kolCountMin}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  kolCountMin: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                            <input
                              type="number"
                              placeholder="Max"
                              value={pendingFilters.kolCountMax}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  kolCountMax: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                          </div>
                        </div>
                        {/* Age (existing) */}
                        <div>
                          <label
                            className="mb-2 block text-sm font-medium"
                            style={{ color: AX.text }}
                          >
                            Age
                          </label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              placeholder="Min"
                              value={pendingFilters.minAge}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  minAge: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                            <select
                              value={pendingFilters.ageUnit}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  ageUnit: e.target.value,
                                }))
                              }
                              className="rounded border px-2 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                              }}
                            >
                              <option value="m">m</option>
                              <option value="h">h</option>
                              <option value="d">d</option>
                            </select>
                            <input
                              type="number"
                              placeholder="Max"
                              value={pendingFilters.maxAge}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  maxAge: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                            <select
                              value={pendingFilters.ageUnit}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  ageUnit: e.target.value,
                                }))
                              }
                              className="rounded border px-2 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                              }}
                            >
                              <option value="m">m</option>
                              <option value="h">h</option>
                              <option value="d">d</option>
                            </select>
                          </div>
                        </div>
                        {/* Top 10 Holders % - COMMENTED OUT: Filter not implemented (always returns true) */}
                        {/* <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Top 10 Holders %</label>
                      <input
                        type="number"
                        placeholder="Enter percentage"
                        value={pendingFilters.top10HoldersPercent}
                        onChange={(e) => handlePendingFilterChange(prev => ({ ...prev, top10HoldersPercent: e.target.value }))}
                          className="w-full px-3 py-2 rounded text-sm border"
                        style={{
                            backgroundColor: AX.surface,
                          borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                        }}
                      />
                    </div> */}
                      </div>
                    )}
                    {activeCategoryTab === "$ Metrics" && (
                      <div className="space-y-3">
                        {/* Liquidity */}
                        <div>
                          <label
                            className="mb-2 block text-sm font-medium"
                            style={{ color: AX.text }}
                          >
                            Liquidity ($)
                          </label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              placeholder="Min"
                              value={pendingFilters.minLiquidity}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  minLiquidity: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                            <input
                              type="number"
                              placeholder="Max"
                              value={pendingFilters.maxLiquidity}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  maxLiquidity: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                          </div>
                        </div>

                        {/* Volume */}
                        <div>
                          <label
                            className="mb-2 block text-sm font-medium"
                            style={{ color: AX.text }}
                          >
                            Volume ($)
                          </label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              placeholder="Min"
                              value={pendingFilters.minVolume}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  minVolume: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                            <input
                              type="number"
                              placeholder="Max"
                              value={pendingFilters.maxVolume}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  maxVolume: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                          </div>
                        </div>

                        {/* Market Cap */}
                        <div>
                          <label
                            className="mb-2 block text-sm font-medium"
                            style={{ color: AX.text }}
                          >
                            Market Cap ($)
                          </label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              placeholder="Min"
                              value={pendingFilters.minMarketCap}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  minMarketCap: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                            <input
                              type="number"
                              placeholder="Max"
                              value={pendingFilters.maxMarketCap}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  maxMarketCap: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                          </div>
                        </div>

                        {/* B. curve %} */}
                        <div>
                          <label
                            className="mb-2 block text-sm font-medium"
                            style={{ color: AX.text }}
                          >
                            B. curve %
                          </label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              placeholder="Min"
                              value={pendingFilters.bCurvePercentMin}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  bCurvePercentMin: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                            <input
                              type="number"
                              placeholder="Max"
                              value={pendingFilters.bCurvePercentMax}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  bCurvePercentMax: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                          </div>
                        </div>
                        {/* Global Fees Paid (SOL) */}
                        <div>
                          <label
                            className="mb-2 block text-sm font-medium"
                            style={{ color: AX.text }}
                          >
                            Global Fees Paid (SOL)
                          </label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              placeholder="Min"
                              value={pendingFilters.globalFeesPaidMin}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  globalFeesPaidMin: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                            <input
                              type="number"
                              placeholder="Max"
                              value={pendingFilters.globalFeesPaidMax}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  globalFeesPaidMax: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                          </div>
                        </div>

                        {/* Txns */}
                        <div>
                          <label
                            className="mb-2 block text-sm font-medium"
                            style={{ color: AX.text }}
                          >
                            Txns
                          </label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              placeholder="Min"
                              value={pendingFilters.txnsMin}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  txnsMin: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                            <input
                              type="number"
                              placeholder="Max"
                              value={pendingFilters.txnsMax}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  txnsMax: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                          </div>
                        </div>

                        {/* Num Buys */}
                        <div>
                          <label
                            className="mb-2 block text-sm font-medium"
                            style={{ color: AX.text }}
                          >
                            Num Buys
                          </label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              placeholder="Min"
                              value={pendingFilters.numBuysMin}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  numBuysMin: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                            <input
                              type="number"
                              placeholder="Max"
                              value={pendingFilters.numBuysMax}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  numBuysMax: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                          </div>
                        </div>

                        {/* Num Sells */}
                        <div>
                          <label
                            className="mb-2 block text-sm font-medium"
                            style={{ color: AX.text }}
                          >
                            Num Sells
                          </label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              placeholder="Min"
                              value={pendingFilters.numSellsMin}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  numSellsMin: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                            <input
                              type="number"
                              placeholder="Max"
                              value={pendingFilters.numSellsMax}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  numSellsMax: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    {/* SOCIALS TAB - COMMENTED OUT: Filters work but rarely used */}
                    {false && activeCategoryTab === "Socials" && (
                      <div className="space-y-3">
                        {/* Twitter Reuses */}
                        <div>
                          <label
                            className="mb-2 block text-sm font-medium"
                            style={{ color: AX.text }}
                          >
                            Twitter Reuses
                          </label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              placeholder="Min"
                              value={pendingFilters.twitterReusesMin}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  twitterReusesMin: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                            <input
                              type="number"
                              placeholder="Max"
                              value={pendingFilters.twitterReusesMax}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  twitterReusesMax: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                          </div>
                        </div>

                        {/* Tweet Age */}
                        <div>
                          <label
                            className="mb-2 block text-sm font-medium"
                            style={{ color: AX.text }}
                          >
                            Tweet Age
                          </label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              placeholder="Min"
                              value={pendingFilters.tweetAgeMin}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  tweetAgeMin: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                            <select
                              value={pendingFilters.tweetAgeUnit}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  tweetAgeUnit: e.target.value,
                                }))
                              }
                              className="rounded border px-2 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            >
                              <option value="m">m</option>
                              <option value="h">h</option>
                              <option value="d">d</option>
                            </select>
                            <input
                              type="number"
                              placeholder="Max"
                              value={pendingFilters.tweetAgeMax}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  tweetAgeMax: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border px-3 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            />
                            <select
                              value={pendingFilters.tweetAgeUnit}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  tweetAgeUnit: e.target.value,
                                }))
                              }
                              className="rounded border px-2 py-2 text-sm"
                              style={{
                                backgroundColor: AX.surface,
                                borderColor: AX.border,
                                color: AX.text,
                                outline: "none",
                                boxShadow: "none",
                              }}
                              onFocus={(e) => {
                                e.target.style.outline = "none";
                                e.target.style.boxShadow = "none";
                                e.target.style.borderColor = AX.border;
                              }}
                            >
                              <option value="m">m</option>
                              <option value="h">h</option>
                              <option value="d">d</option>
                            </select>
                          </div>
                        </div>

                        {/* Checkboxes */}
                        <div className="space-y-2">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={filters.hasTwitter}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  hasTwitter: e.target.checked,
                                }))
                              }
                              className="cursor-pointer rounded"
                              style={{
                                accentColor: AX.aiBlue,
                              }}
                            />
                            <span
                              className="text-sm"
                              style={{ color: AX.text }}
                            >
                              Twitter
                            </span>
                          </label>

                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={filters.hasWebsite}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  hasWebsite: e.target.checked,
                                }))
                              }
                              className="cursor-pointer rounded"
                              style={{
                                accentColor: AX.aiBlue,
                              }}
                            />
                            <span
                              className="text-sm"
                              style={{ color: AX.text }}
                            >
                              Website
                            </span>
                          </label>

                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={filters.hasTelegram}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  hasTelegram: e.target.checked,
                                }))
                              }
                              className="cursor-pointer rounded"
                              style={{
                                accentColor: AX.aiBlue,
                              }}
                            />
                            <span
                              className="text-sm"
                              style={{ color: AX.text }}
                            >
                              Telegram
                            </span>
                          </label>

                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={filters.atLeastOneSocial}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  atLeastOneSocial: e.target.checked,
                                }))
                              }
                              className="cursor-pointer rounded"
                              style={{
                                accentColor: AX.aiBlue,
                              }}
                            />
                            <span
                              className="text-sm"
                              style={{ color: AX.text }}
                            >
                              At Least One Social
                            </span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={filters.onlyPumpLive}
                              onChange={(e) =>
                                handlePendingFilterChange((prev) => ({
                                  ...prev,
                                  onlyPumpLive: e.target.checked,
                                }))
                              }
                              className="cursor-pointer rounded"
                              style={{
                                accentColor: AX.aiBlue,
                              }}
                            />
                            <span
                              className="text-sm"
                              style={{ color: AX.text }}
                            >
                              Only Pump Live
                            </span>
                          </label>
                        </div>
                      </div>
                    )}
                    {/* END OF SOCIALS TAB COMMENT */}
                  </div>
                  {/* Footer */}
                  <div
                    className="flex items-center justify-between border-t p-4"
                    style={{ borderColor: AX.border }}
                  >
                    <div className="flex gap-2">
                      <button
                        className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                        style={{ backgroundColor: AX.border, color: AX.text }}
                        onClick={() => {
                          // Import functionality
                          const input = document.createElement("input");
                          input.type = "file";
                          input.accept = ".json";
                          input.onchange = (e) => {
                            const file = (e.target as HTMLInputElement)
                              .files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (event) => {
                                try {
                                  const importedFilters = JSON.parse(
                                    event.target?.result as string,
                                  ) as PulseFilters;
                                  // Merge with defaults to ensure all fields exist
                                  const mergedFilters = { ...getDefaultFilters(), ...importedFilters };
                                  setFilters(mergedFilters);
                                  setPendingFilters(mergedFilters);
                                  setHasPendingChanges(false);
                                } catch (error) {
                                  console.error(
                                    "Error importing filters:",
                                    error,
                                  );
                                }
                              };
                              reader.readAsText(file);
                            }
                          };
                          input.click();
                        }}
                      >
                        Import
                      </button>
                      <button
                        className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                        style={{ backgroundColor: AX.border, color: AX.text }}
                        onClick={() => {
                          // Export functionality
                          const dataStr = JSON.stringify(filters, null, 2);
                          const dataBlob = new Blob([dataStr], {
                            type: "application/json",
                          });
                          const url = URL.createObjectURL(dataBlob);
                          const link = document.createElement("a");
                          link.href = url;
                          link.download = "pulse-filters.json";
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                          URL.revokeObjectURL(url);
                        }}
                      >
                        Export
                      </button>
                    </div>
                    <button
                      onClick={handleResetFilters}
                      className="mr-2 cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition-all duration-300 ease-out"
                      style={{
                        backgroundColor: AX.surface,
                        color: AX.muted,
                        border: `1px solid ${AX.border}`,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = AX.border;
                        e.currentTarget.style.color = AX.text;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = AX.surface;
                        e.currentTarget.style.color = AX.muted;
                      }}
                    >
                      Reset
                    </button>
                    <button
                      className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition-all duration-300 ease-out"
                      style={{
                        backgroundColor: hasPendingChanges
                          ? AX.aiBlue
                          : AX.surface,
                        color: hasPendingChanges ? "#000000" : AX.muted,
                        opacity: hasPendingChanges ? 1 : 0.5,
                      }}
                      disabled={!hasPendingChanges}
                      onMouseEnter={(e) => {
                        if (hasPendingChanges) {
                          e.currentTarget.style.backgroundColor = "#2563eb";
                          e.currentTarget.style.boxShadow = `0 0 8px ${AX.glowBlue}`;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (hasPendingChanges) {
                          e.currentTarget.style.backgroundColor = AX.aiBlue;
                          e.currentTarget.style.boxShadow = "none";
                        }
                      }}
                      onClick={handleApplyFilters}
                    >
                      Apply All
                    </button>
                  </div>
                </div>
              </>,
							document.body
            )}
          </div>
        </div>
      </div>
      {tokens.length === 0 && (loading || hadDataRef.current) ? (
        <div className="custom-scrollbar flex flex-1 flex-col gap-2 overflow-x-hidden overflow-y-scroll">
          {Array.from({ length: skeletonRowCount }).map((_, idx) => (
            <div
              key={idx}
              className="flex shrink-0 animate-pulse flex-row items-start rounded-lg p-2"
              style={{ backgroundColor: "#13151b", border: "1px solid #1e2028" }}
            >
              {/* Profile Picture & Address skeleton */}
              <div className="mr-2 flex w-20 flex-col items-center">
                <div
                  className="relative h-20 w-20 rounded-sm"
                  style={{ backgroundColor: AX.surface }}
                />
                <div
                  className="mt-1 h-3 w-16 rounded"
                  style={{ backgroundColor: AX.surface }}
                />
              </div>
              {/* Main Info Section skeleton */}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-row justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <div
                        className="h-4 w-20 rounded"
                        style={{ backgroundColor: AX.surface }}
                      />
                      <div
                        className="h-3 w-16 rounded"
                        style={{ backgroundColor: AX.surface }}
                      />
                      <div
                        className="h-3 w-6 rounded"
                        style={{ backgroundColor: AX.surface }}
                      />
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div
                        className="h-3 w-8 rounded"
                        style={{ backgroundColor: AX.surface }}
                      />
                      <div
                        className="h-3 w-6 rounded"
                        style={{ backgroundColor: AX.surface }}
                      />
                      <div
                        className="h-3 w-6 rounded"
                        style={{ backgroundColor: AX.surface }}
                      />
                      <div
                        className="h-3 w-6 rounded"
                        style={{ backgroundColor: AX.surface }}
                      />
                    </div>
                  </div>
                  <div className="flex min-w-[140px] flex-col items-end gap-1">
                    <div className="flex gap-2 text-xs">
                      <div
                        className="h-3 w-12 rounded"
                        style={{ backgroundColor: AX.surface }}
                      />
                      <div
                        className="h-3 w-12 rounded"
                        style={{ backgroundColor: AX.surface }}
                      />
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <div
                        className="h-3 w-8 rounded"
                        style={{ backgroundColor: AX.surface }}
                      />
                      <div
                        className="h-3 w-8 rounded"
                        style={{ backgroundColor: AX.surface }}
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-1 flex flex-row items-center justify-between gap-2">
                  <div className="flex gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-4 w-10 rounded-full"
                        style={{ backgroundColor: AX.surface }}
                      />
                    ))}
                  </div>
                  <div
                    className="h-6 w-16 rounded-full"
                    style={{ backgroundColor: AX.surface }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (filteredTokensForDisplay.length === 0 && isFetchingFiltered) ? (
        <div className="custom-scrollbar flex flex-1 flex-col gap-2 overflow-x-hidden overflow-y-scroll">
          {Array.from({ length: skeletonRowCount }).map((_, idx) => (
            <div
              key={idx}
              className="flex shrink-0 animate-pulse flex-row items-start rounded-lg p-2"
              style={{ backgroundColor: "#13151b", border: "1px solid #1e2028" }}
            >
              <div className="mr-2 flex w-20 flex-col items-center">
                <div
                  className="relative h-20 w-20 rounded-sm"
                  style={{ backgroundColor: AX.surface }}
                />
                <div
                  className="mt-1 h-3 w-16 rounded"
                  style={{ backgroundColor: AX.surface }}
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-row justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <div
                        className="h-4 w-20 rounded"
                        style={{ backgroundColor: AX.surface }}
                      />
                      <div
                        className="h-3 w-16 rounded"
                        style={{ backgroundColor: AX.surface }}
                      />
                      <div
                        className="h-3 w-6 rounded"
                        style={{ backgroundColor: AX.surface }}
                      />
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div
                        className="h-3 w-8 rounded"
                        style={{ backgroundColor: AX.surface }}
                      />
                      <div
                        className="h-3 w-6 rounded"
                        style={{ backgroundColor: AX.surface }}
                      />
                      <div
                        className="h-3 w-6 rounded"
                        style={{ backgroundColor: AX.surface }}
                      />
                      <div
                        className="h-3 w-6 rounded"
                        style={{ backgroundColor: AX.surface }}
                      />
                    </div>
                  </div>
                  <div className="flex min-w-[140px] flex-col items-end gap-1">
                    <div className="flex gap-2 text-xs">
                      <div
                        className="h-3 w-12 rounded"
                        style={{ backgroundColor: AX.surface }}
                      />
                      <div
                        className="h-3 w-12 rounded"
                        style={{ backgroundColor: AX.surface }}
                      />
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <div
                        className="h-3 w-8 rounded"
                        style={{ backgroundColor: AX.surface }}
                      />
                      <div
                        className="h-3 w-8 rounded"
                        style={{ backgroundColor: AX.surface }}
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-1 flex flex-row items-center justify-between gap-2">
                  <div className="flex gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-4 w-10 rounded-full"
                        style={{ backgroundColor: AX.surface }}
                      />
                    ))}
                  </div>
                  <div
                    className="h-6 w-16 rounded-full"
                    style={{ backgroundColor: AX.surface }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : tokens.length === 0 && !hadDataRef.current ? (
        <div className="custom-scrollbar flex flex-1 flex-col gap-2 overflow-x-hidden overflow-y-scroll">
          <div className="py-8 text-center" style={{ color: AX.muted }}>
            No tokens found.
          </div>
        </div>
      ) : (
        <VirtualizedTokenList
          items={filteredTokensForDisplay}
          itemSize={PULSE_ROW_HEIGHT}
          renderRow={(token: any, idx: number, style: React.CSSProperties) => {
              // Use mint directly in URL path for cleaner architecture
              // This allows WebSocket to connect immediately without pair_address resolution
              const tokenMint = (token as any)?.mint;
              const pairAddress = (token as any)?.pair_address || tokenMint;

              // Skip tokens without mint (can't navigate properly)
              if (!tokenMint) return null;

              // Build query params for optimistic UI + cache lookup
              // Include chain parameter to preserve chain selection
              // Use prop from parent (more reliable) or fallback to router.query
              const currentChain =
                chainProp || (router.query.chain as string) || "sol";
              // Build query params for optimistic UI
              // Note: mint is in URL path AND query for backward compat + robustness
              // Query params removed — trade page resolves metadata via WS + search

              return (
                <div key={tokenMint} style={style}>
                <div style={{ paddingBottom: '4px' }}>
                <Link
                  href={`/trade/${tokenMint}`}
                  className="token-row group relative flex w-full max-w-full shrink-0 cursor-pointer flex-row items-start gap-2 overflow-visible rounded-lg px-2 py-1.5 text-sm"
                  style={{
                    color: AX.text,
                    backgroundColor: "#13151b",
                    border: "1px solid #1e2028",
                  }}
                  onMouseEnter={(e) => {
                    // PHASE 3: Use CSS class instead of inline style (GPU-accelerated)
                    e.currentTarget.classList.add('row-hovered');

                    // Show the status popup via CSS class
                    const popup = e.currentTarget.querySelector(
                      ".status-popup",
                    ) as HTMLElement;
                    if (popup) {
                      popup.classList.add('popup-visible');
                    }

                    // Full preload pipeline: WS + route + metadata + OHLC + trades
                    preloadTradeChart(
                      {
                        mint: tokenMint,
                        pairAddress,
                        name: (token as any)?.name,
                        symbol: (token as any)?.symbol,
                        priceUsd: (token as any)?.price_usd || (token as any)?.priceUsd,
                        marketCapUsd: (token as any)?.market_cap_usd || (token as any)?.marketCapUSD,
                        image: extractTokenImage(token as any) || "",
                        launchpadProtocol: (token as any)?.launchpad_protocol,
                      },
                      { router, tradeUrl: `/trade/${tokenMint}` }
                    );

                    // Prefetch buy order so quick-buy click gets a cached order (<1ms vs ~700ms)
                    if (tokenMint && thunderAmount) {
                      prefetchBuyOrder({ baseMint: tokenMint, amount: parseFloat(thunderAmount) || 0.1, side: 'buy' });
                    }
                  }}
                  onMouseLeave={(e) => {
                    // PHASE 3: Use CSS class instead of inline style
                    e.currentTarget.classList.remove('row-hovered');
                    // Hide the status popup via CSS class
                    const popup = e.currentTarget.querySelector(
                      ".status-popup",
                    ) as HTMLElement;
                    if (popup) {
                      popup.classList.remove('popup-visible');
                    }
                  }}
                >
                  <div className="flex w-full max-w-full min-w-0 flex-col gap-2">
                    <div className="flex w-full max-w-full flex-row gap-2">
                      {/* Subtle wave animation for top 3 final stretch tokens */}
                      {/* PHASE 3: Only animate if few tokens need it (performance optimization) */}
                      {waveTokens.has(idx) && waveTokens.size <= 5 && memoizedTokens.length <= 50 && (
                        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-lg">
                          <div
                            className="absolute top-0 left-0 h-full w-full"
                            style={{
                              background:
                                "linear-gradient(90deg, transparent, rgba(49, 227, 172, 0.2), rgba(49, 227, 172, 0.4), rgba(49, 227, 172, 0.2), transparent)",
                              animation:
                                "subtleWaveFlow 3s ease-in-out infinite",
                              filter: "blur(0.5px)",
                            }}
                          ></div>
                        </div>
                      )}

                      {/* Status popout on hover - PHASE 3: Uses memoized component */}
                      <span
                        className="status-popup absolute -top-8 left-1/2 -translate-x-1/2 border px-2 py-1 text-xs"
                        style={{
                          pointerEvents: "none",
                          backgroundColor: AX.surface,
                          borderColor: AX.border,
                          color: AX.text,
                          zIndex: 9999,
                          borderRadius: "6px",
                          fontSize: "11px",
                          fontWeight: "500",
                        }}
                      >
                        <StatusPopupContent token={token} title={title} />
                      </span>
                      {/* Profile Picture & Address */}
                      <div
                        className="relative flex flex-shrink-0 flex-col items-center"
                        style={{
                          width: "70px",
                          minWidth: "70px",
                          maxWidth: "70px",
                        }}
                      >
                        <TokenImage
                          token={token}
                          priority={title === "New Pairs"}
                          isNewPairs={title === "New Pairs"}
                          columnType={
                            title.toLowerCase().includes("migrated")
                              ? "migrated"
                              : title.toLowerCase().includes("final") ||
                                  title.toLowerCase().includes("stretch")
                                ? "final-stretch"
                                : "new"
                          }
                          onBlacklistCA={(mint) => { addBlacklistItem('ca', mint); showEnhancedToast('info', `Hidden ${token.symbol}`); }}
                          onBlacklistTwitter={(handle) => { addBlacklistItem('twitterHandle', handle); showEnhancedToast('info', `Blacklisted @${handle}`); }}
                          onBlacklistDev={(wallet) => { addBlacklistItem('dev', wallet); showEnhancedToast('info', `Blacklisted dev`); }}
                        />
                        {/* Token Metrics */}
                        {/* <div className="absolute bottom-16 -right-49">
                    <TokenMetrics 
                      token={token} 
                      rank={idx + 1} 
                      totalTokens={memoizedTokens.length} 
                    />
                  </div> */}
                        <span
                          className="mt-2 mb-1 max-w-[60px] truncate font-mono text-[9px] lg:max-w-[70px] lg:text-[10px]"
                          style={{ color: AX.muted }}
                        >
                          {shortAddr(token)}
                        </span>
                      </div>
                      {/* Main Info Section */}
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        {/* Top Row */}
                        <div className="flex flex-row justify-between gap-2">
                          {/* Left: Token Info & Socials */}
                          <div className="flex min-w-0 flex-col">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span
                                className="flex-shrink-0 text-sm font-semibold"
                                style={{ color: AX.text }}
                              >
                                {token.symbol}
                              </span>
                              <span
                                className="truncate text-xs"
                                style={{ color: AX.muted }}
                              >
                                {token.name}
                              </span>
                              <div className="relative">
                                <button
                                  className="transition-colors duration-200"
                                  style={{ color: AX.muted }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.color = AX.aiBlue;
                                    e.currentTarget.style.boxShadow = `0 0 6px ${AX.glowBlue}`;
                                    const tooltip = document.getElementById(
                                      `shared-copy-tooltip`,
                                    ) as HTMLElement;
                                    if (tooltip) {
                                      const rect =
                                        e.currentTarget.getBoundingClientRect();
                                      tooltip.style.left = `${rect.left + rect.width / 2}px`;
                                      tooltip.style.top = `${rect.top - 10}px`;
                                      tooltip.style.opacity = "1";
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.color = AX.muted;
                                    e.currentTarget.style.boxShadow = "none";
                                    const tooltip = document.getElementById(
                                      `shared-copy-tooltip`,
                                    ) as HTMLElement;
                                    if (tooltip) tooltip.style.opacity = "0";
                                  }}
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    try {
                                      await navigator.clipboard.writeText(
                                        token.mint,
                                      );
                                      showCenteredSuccessToast(
                                        "Copied to clipboard",
                                      );
                                      // Show success feedback
                                      const button =
                                        e.currentTarget as HTMLButtonElement;
                                      if (button && button.style) {
                                        const originalColor =
                                          button.style.color || AX.muted;
                                        button.style.color = AX.aiGreen;
                                        setTimeout(() => {
                                          if (button && button.style) {
                                            button.style.color = originalColor;
                                          }
                                        }, 1000);
                                      }
                                    } catch (err) {
                                      console.error(
                                        "Failed to copy to clipboard:",
                                        err,
                                      );
                                      // Fallback for older browsers
                                      const textArea =
                                        document.createElement("textarea");
                                      textArea.value = token.mint;
                                      document.body.appendChild(textArea);
                                      textArea.select();
                                      try {
                                        document.execCommand("copy");
                                        showCenteredSuccessToast(
                                          "Copied to clipboard",
                                        );
                                        const button =
                                          e.currentTarget as HTMLButtonElement;
                                        if (button && button.style) {
                                          const originalColor =
                                            button.style.color || AX.muted;
                                          button.style.color = AX.aiGreen;
                                          setTimeout(() => {
                                            if (button && button.style) {
                                              button.style.color =
                                                originalColor;
                                            }
                                          }, 1000);
                                        }
                                      } catch (fallbackErr) {
                                        console.error(
                                          "Fallback copy failed:",
                                          fallbackErr,
                                        );
                                      }
                                      document.body.removeChild(textArea);
                                    }
                                  }}
                                >
                                  <FaRegCopy
                                    size={10}
                                    className="lg:h-3 lg:w-3"
                                  />
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 text-xs lg:gap-1.5">
                              <span
                                className="flex items-center gap-1 text-[10px] lg:gap-1"
                                style={{ color: "#31e3ac" }}
                              >
                                <TokenAge
                                  createdAt={
                                    (token as any).launch_time ||
                                    (token as any).created_at
                                  }
                                />
                              </span>
                              {/* Socials */}
                              <div className="relative flex items-center gap-1 text-neutral-400 lg:gap-1.5">
                                {/* Pump.fun Link - only show for pump tokens */}
                                {/* {token.mint.slice(-4) === "pump" && (
                              <Link
                                target="_blank"
                                href={`https://pump.fun/coin/${token.mint}`}
                                className="transition-colors duration-200"
                                style={{ color: "#ec397a" }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color = "#ec397a";
                                  const tooltip = e.currentTarget
                                    .nextElementSibling as HTMLElement;
                                  if (tooltip) tooltip.style.opacity = "1";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = "#ec397a";
                                  const tooltip = e.currentTarget
                                    .nextElementSibling as HTMLElement;
                                  if (tooltip) tooltip.style.opacity = "0";
                                }}
                              >
                                <LuPill
                                  size={10}
                                  className="lg:h-3 lg:w-3"
                                  style={{ strokeWidth: "3" }}
                                />
                              </Link>
                            )} */}

                                {/* Social Icons with URI Metadata */}
                                <SocialIconsWithMetadata
                                  token={token}
                                  idx={idx}
                                  showSearchDropdown={showSearchDropdown}
                                  setShowSearchDropdown={setShowSearchDropdown}
                                />

                                {/* OLD X Profile Preview Button - kept for reference */}
                                {false && (
                                  <div className="relative">
                                    <button
                                      className="flex items-center justify-center rounded transition-colors duration-200"
                                      onMouseEnter={(e) => {
                                        const tooltip = document.getElementById(
                                          `shared-profile-tooltip`,
                                        ) as HTMLElement;
                                        if (tooltip) {
                                          const rect =
                                            e.currentTarget.getBoundingClientRect();
                                          tooltip.style.left = `${rect.left + rect.width / 2}px`;
                                          tooltip.style.top = `${rect.top - 10}px`;
                                          tooltip.style.opacity = "1";
                                        }
                                        // Show X profile preview
                                        setShowXPreview(idx);
                                        // Store button position for popup positioning
                                        const buttonRect =
                                          e.currentTarget.getBoundingClientRect();
                                        setButtonPosition({
                                          left:
                                            buttonRect.left +
                                            buttonRect.width / 2,
                                          top: buttonRect.top - 20,
                                        });
                                      }}
                                      onMouseLeave={(e) => {
                                        const tooltip = document.getElementById(
                                          `shared-profile-tooltip`,
                                        ) as HTMLElement;
                                        if (tooltip)
                                          tooltip.style.opacity = "0";
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault(); // Prevent Link navigation
                                        // Open X profile in new tab
                                        const profileUrl = `https://twitter.com/${token.symbol?.toLowerCase() || "search"}`;
                                        window.open(profileUrl, "_blank");
                                      }}
                                    >
                                      <FaXTwitter
                                        size={12}
                                        className="text-neutral-400"
                                      />
                                    </button>

                                    {/* Small X Profile Preview - positioned near token */}
                                    {/* {showXPreview === idx && buttonPosition && (
                                      <TokenXProfile
                                        token={token}
                                        setShowXPreview={setShowXPreview}
                                      />
                                    )} */}
                                  </div>
                                )}

                                <div className="ml-1 flex flex-row gap-1.5 font-light">
                                  {/* Crown Icon - Dev Migration Stats */}
                                  <div
                                    className="relative flex items-center gap-0.5 cursor-pointer"
                                    onMouseEnter={(e) => {
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      const tip = document.getElementById(`dev-tip-${token.mint}`);
                                      if (tip) {
                                        tip.style.left = `${rect.left}px`;
                                        tip.style.top = `${rect.bottom + 6}px`;
                                        tip.style.opacity = "1";
                                      }
                                    }}
                                    onMouseLeave={() => {
                                      const tip = document.getElementById(`dev-tip-${token.mint}`);
                                      if (tip) tip.style.opacity = "0";
                                    }}
                                  >
                                    <PiCrownSimpleLight
                                      size={12}
                                      style={{ color: "#dcc13c" }}
                                    />
                                    <span className="text-[10px] text-white">
                                      {token.dev_tokens_migrated ?? 0}/{token.dev_tokens_created ?? 0}
                                    </span>
                                    {/* Dev Migration Tooltip */}
                                    {createPortal(
                                      <div
                                        id={`dev-tip-${token.mint}`}
                                        data-tooltip="dev"
                                        className="pointer-events-none fixed z-[9999] min-w-[180px] rounded-lg opacity-0 transition-opacity duration-200 overflow-hidden"
                                        style={{
                                          backgroundColor: AX.surface,
                                          border: `1px solid ${AX.border}`,
                                        }}
                                      >
                                        <div className="px-3 py-2 space-y-1.5">
                                          <div className="flex justify-between items-center">
                                            <span className="text-sm" style={{ color: AX.muted }}>Dev Migrated</span>
                                            <span className="text-sm font-medium" style={{ color: AX.text }}>{token.dev_tokens_migrated ?? 0}</span>
                                          </div>
                                          <div className="flex justify-between items-center">
                                            <span className="text-sm" style={{ color: AX.muted }}>Dev Launched</span>
                                            <span className="text-sm font-medium" style={{ color: AX.text }}>{token.dev_tokens_created ?? 0}</span>
                                          </div>
                                          <div className="flex justify-between items-center">
                                            <span className="text-sm" style={{ color: AX.muted }}>Migrated</span>
                                            <span className="text-sm font-medium" style={{ color: AX.text }}>
                                              {token.dev_tokens_created && token.dev_tokens_created > 0
                                                ? `${Math.round((token.dev_tokens_migrated ?? 0) / token.dev_tokens_created * 100)}%`
                                                : '0%'}
                                            </span>
                                          </div>
                                        </div>
                                      </div>,
                                      document.body
                                    )}
                                  </div>

                                  {/* KOL Count - Trophy Icon */}
                                  <div
                                    className="relative flex items-center gap-0.5 text-violet-200"
                                    onMouseEnter={(e) => {
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      const tip = document.getElementById(`kol-tip-${token.mint}`);
                                      if (tip) {
                                        tip.style.left = `${rect.left}px`;
                                        tip.style.top = `${rect.bottom + 6}px`;
                                        tip.style.opacity = "1";
                                      }
                                    }}
                                    onMouseLeave={() => {
                                      const tip = document.getElementById(`kol-tip-${token.mint}`);
                                      if (tip) tip.style.opacity = "0";
                                    }}
                                  >
                                    <CiTrophy size={12} />
                                    <span className="text-[10px] text-white">
                                      {token.kol_count ?? 0}
                                    </span>
                                    {/* KOL Count Tooltip */}
                                    {createPortal(
                                      <div
                                        id={`kol-tip-${token.mint}`}
                                        data-tooltip="kol"
                                        className="pointer-events-none fixed z-[9999] rounded-lg px-3 py-2 whitespace-nowrap opacity-0 transition-opacity duration-200"
                                        style={{
                                          backgroundColor: AX.surface,
                                          border: `1px solid ${AX.border}`,
                                        }}
                                      >
                                        <span className="text-sm font-medium" style={{ color: AX.text }}>KOL Count</span>
                                        <p className="mt-0.5 text-xs" style={{ color: AX.muted }}>Key Opinion Leaders holding this token</p>
                                      </div>,
                                      document.body
                                    )}
                                  </div>

                                  {/* People Icon - Total Holders */}
                                  <div
                                    className="relative flex items-center gap-0.5"
                                    onMouseEnter={(e) => {
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      const tip = document.getElementById(`holder-tip-${token.mint}`);
                                      if (tip) {
                                        tip.style.left = `${rect.left}px`;
                                        tip.style.top = `${rect.bottom + 6}px`;
                                        tip.style.opacity = "1";
                                      }
                                    }}
                                    onMouseLeave={() => {
                                      const tip = document.getElementById(`holder-tip-${token.mint}`);
                                      if (tip) tip.style.opacity = "0";
                                    }}
                                  >
                                    <GoPeople
                                      size={12}
                                      style={{ color: "#36d8ff" }}
                                    />
                                    <span className="text-[10px] text-white">
                                      {formatHolderCount(
                                        token.holder_count ??
                                        token.total_holders ??
                                        token.unique_wallets_24h ??
                                        0
                                      )}
                                    </span>
                                    {/* Holder Count Tooltip */}
                                    {createPortal(
                                      <div
                                        id={`holder-tip-${token.mint}`}
                                        data-tooltip="holder"
                                        className="pointer-events-none fixed z-[9999] rounded-lg px-3 py-2 whitespace-nowrap opacity-0 transition-opacity duration-200"
                                        style={{
                                          backgroundColor: AX.surface,
                                          border: `1px solid ${AX.border}`,
                                        }}
                                      >
                                        <span className="text-sm font-medium" style={{ color: AX.text }}>Holder Count</span>
                                        <p className="mt-0.5 text-xs" style={{ color: AX.muted }}>Total wallets holding this token</p>
                                      </div>,
                                      document.body
                                    )}
                                  </div>
                                  {/* Robot icon - commented out for now
                                  <div className="flex items-center gap-1 text-violet-200">
                                    <PiRobotLight size={16} />
                                    <span className="text-sm text-white">
                                      0
                                    </span>
                                  </div>
                                  */}
                                </div>

                                {/* Pump.fun Tooltip */}

                                {token.mint?.slice(-4) === "pump" && (
                                  <div
                                    className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 transform rounded px-2 py-1 text-xs font-medium whitespace-nowrap opacity-0 transition-opacity duration-200"
                                    style={{
                                      zIndex: 9999,
                                      backgroundColor: AX.surface,
                                      color: AX.text,
                                      border: `1px solid ${AX.border}`,
                                      boxShadow: `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 0 8px ${AX.glowCyan}`,
                                    }}
                                  >
                                    View on Pump.fun
                                    {/* Tooltip arrow */}
                                    <div
                                      className="absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 transform border-t-4 border-r-4 border-l-4 border-transparent"
                                      style={{ borderTopColor: AX.surface }}
                                    ></div>
                                  </div>
                                )}
                              </div>
                            </div>
                            {/* Twitter Handle - below icons */}
                            <TwitterHandleDisplay token={token} />
                          </div>
                          {/* Right: MC, V, F, TX */}
                          <div className="items-right justify-right flex min-w-[100px] flex-col items-end gap-0.5 text-right lg:min-w-[130px]">
                            <div
                              className={"justify-right flex flex-col text-xs"}
                            >
                              <div
                                className="flex items-end gap-1"
                                style={{ color: AX.muted }}
                              >
                                <span className="mb-[2px] text-xs">MC </span>
                                {/* PHASE 4 (C1): Replaced SmoothNumber with static span - eliminates RAF animations */}
                                {(() => {
                                  const isFinalStretchColumn =
                                    title.toLowerCase().includes("final") ||
                                    title.toLowerCase().includes("stretch");
                                  const lp = (
                                    (token as any).launchpad_protocol || ""
                                  ).toLowerCase();
                                  const bonding =
                                    (token as any).bonding_pct ?? 0;
                                  const hasGreenWave =
                                    isFinalStretchColumn &&
                                    lp.includes("meteora") &&
                                    bonding > 98.6;
                                  const mcVal = getTokenMarketCap(token);
                                  if (hasGreenWave) {
                                    return (
                                      <span
                                        className="number-font text-sm font-medium"
                                        style={{ color: "#31e3ac" }}
                                      >
                                        {formatMarketCap(mcVal)}
                                      </span>
                                    );
                                  }
                                  return (
                                    <SmartColor
                                      token={token}
                                      metricType="marketCap"
                                      className="number-font text-sm font-medium"
                                    >
                                      ${formatMarketCap(mcVal)}
                                    </SmartColor>
                                  );
                                })()}
                              </div>
                              <div
                                style={{ color: AX.muted }}
                                className="flex items-end gap-1"
                              >
                                <span className="mb-[1px] ml-auto text-xs">
                                  V
                                </span>{" "}
                                {/* PHASE 4 (C1): Replaced SmoothNumber with static span */}
                                <span
                                  className="number-font text-xs font-medium"
                                  style={{
                                    color: "#ffffff",
                                  }}
                                >
                                  {formatVolumeDisplay(calculateVolumeUsd(token, solPrice))}
                                </span>
                              </div>
                            </div>
                              <div className="flex items-center justify-end gap-2 text-xs">
                                {/* Total Fees in SOL */}
                                <InterstateTooltip label="Global Fees Paid">
                                  <div
                                    className="flex cursor-default flex-row items-center gap-1"
                                    style={{ color: AX.muted }}
                                  >
                                    <span className="text-xs">F</span>
                                    <img
                                      src="/solana.png"
                                      alt="SOL"
                                      className="h-3 w-3"
                                    />
                                    {(() => {
                                      // Convert lamports to SOL (1 SOL = 1,000,000,000 lamports)
                                      const lamports = (token as any).total_fees_lamports ?? 0;
                                      const sol = isFinite(lamports) ? lamports / 1_000_000_000 : 0;

                                      if (sol === 0) {
                                        return (
                                          <span className="number-font text-xs font-medium" style={{ color: "#ffffff" }}>
                                            0
                                          </span>
                                        );
                                      }

                                      if (sol >= 0.001) {
                                        // Normal display - use SimpleNumber for calendar-style digit animation
                                        return (
                                          <span className="number-font text-xs font-medium" style={{ color: "#ffffff" }}>
                                            <SimpleNumber
                                              value={sol}
                                              formatter={(val) => val.toFixed(3).replace(/\.?0+$/, "")}
                                            />
                                          </span>
                                        );
                                      }

                                      // For very small values, use subscript notation
                                      // e.g., 0.00003 → 0.0₄3 (1 digit after subscript)
                                      const str = sol.toFixed(10);
                                      const match = str.match(/^0\.(0+)(\d+)/);
                                      if (match) {
                                        const zeroCount = match[1].length;
                                        const significantDigit = match[2].slice(0, 1); // Only 1 digit after subscript
                                        return (
                                          <span
                                            className="number-font text-xs font-medium"
                                            style={{ color: "#ffffff" }}
                                          >
                                            0.0<sub style={{ fontSize: "0.6em", verticalAlign: "sub" }}>{zeroCount}</sub>
                                            <SimpleNumber
                                              value={parseInt(significantDigit, 10)}
                                              formatter={(val) => val.toString()}
                                            />
                                          </span>
                                        );
                                      }
                                      return (
                                        <span className="number-font text-xs font-medium" style={{ color: "#ffffff" }}>
                                          <SimpleNumber
                                            value={sol}
                                            formatter={(val) => val.toFixed(3).replace(/\.?0+$/, "")}
                                          />
                                        </span>
                                      );
                                    })()}
                                  </div>
                                </InterstateTooltip>
                                <div
                                  className="flex flex-row items-center gap-1"
                                  style={{ color: AX.muted }}
                                >
                                  {/* PHASE 4 (C2): Replaced IIFEs with module-level helpers */}
                                  {(() => {
                                    const { buys, sells } = getBuySellData(token);
                                    const total = buys + sells;
                                    const displayTotal = Math.max(1, total);
                                    const buyPercent = Math.min(100, Math.max(0, (buys / displayTotal) * 100));
                                    const sellPercent = Math.min(100, Math.max(0, (sells / displayTotal) * 100));
                                    return (
                                      <>
                                        <span className="text-xs">TX</span>{" "}
                                        <span
                                          className="number-font text-xs font-medium"
                                          style={{ color: "#ffffff" }}
                                        >
                                          {Math.round(total)}
                                        </span>
                                        <div className="ml-1 flex h-0.5 w-8 overflow-hidden rounded-full bg-gray-700">
                                          <div
                                            className="h-full"
                                            style={{
                                              backgroundColor: "#31e3ac",
                                              width: `${buyPercent}%`,
                                            }}
                                          ></div>
                                          <div
                                            className="h-full"
                                            style={{
                                              backgroundColor: "#d11f3a",
                                              width: `${sellPercent}%`,
                                            }}
                                          ></div>
                                        </div>
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>

                            {/* Buy button */}
                            <button
                              className="quick-buy-btn z-10 flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold opacity-0 transition-all duration-150 ease-out group-hover:opacity-100"
                              style={{
                                backgroundColor: "#1a1b1f",
                                color: "#86efac",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = "#86efac";
                                e.currentTarget.style.color = "#000000";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "#1a1b1f";
                                e.currentTarget.style.color = "#86efac";
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault(); // Prevent Link navigation
                                // For migrated column, don't check bonding/snipe logic - just quick buy
                                const isMigratedColumn = title
                                  .toLowerCase()
                                  .includes("migrated");

                                if (isMigratedColumn) {
                                  handleQuickBuy(token);
                                } else {
                                  // For other columns, check for high bonding Meteora tokens
                                  const launchpadProtocol =
                                    (
                                      token as any
                                    ).launchpad_protocol?.toLowerCase() || "";
                                  const isMeteora =
                                    launchpadProtocol.includes("meteora");
                                  const bondingPct =
                                    (token as any).bonding_pct ?? 0;
                                  const isHighBondingMeteora =
                                    isMeteora && bondingPct > 98.6;

                                  if (isHighBondingMeteora) {
                                    setSelectedToken(token);
                                    setShowSnipeModal(true);
                                  } else {
                                    handleQuickBuy(token);
                                  }
                                }
                              }}
                            >
                              <HiLightningBolt className="buy-icon" size={14} style={{ color: "inherit" }} />
                              <span className="number-font">{thunderAmount || "0"}</span>
                              <span>Buy</span>
                            </button>
                          </div>
                        </div>
                      </div>
                      {/* Bottom Row */}

                      <div className="absolute bottom-2 left-24 flex hidden flex-row items-center gap-1">
                        {/* Buyers percentage - Green */}
                        <span
                          className="number-font flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-all duration-200"
                          style={{
                            color: AX.aiGreen,
                            fontSize: "11px",
                            fontWeight: "600",
                            borderColor: "rgba(107, 114, 128, 0.1)",
                            backgroundColor: "transparent",
                          }}
                        >
                          <BsPersonGear size={13} />{" "}
                          <span className="number-font">
                            {Math.round(
                              ((token.total_buyers_5m ?? 0) /
                                Math.max(
                                  1,
                                  (token.total_buyers_5m ?? 0) +
                                    (token.total_sellers_5m ?? 0),
                                )) *
                                100,
                            )}
                            %
                          </span>
                        </span>

                        {/* DS indicator - Blue with time */}
                        <span
                          className="flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-all duration-200"
                          style={{
                            color: "#3B82F6",
                            fontSize: "11px",
                            fontWeight: "500",
                            borderColor: "rgba(107, 114, 128, 0.1)",
                            backgroundColor: "transparent",
                          }}
                        >
                          <LuChefHat size={13} /> DS{" "}
                          <span style={{ color: "#f0f5f5" }}>
                            <TokenAge
                              createdAt={
                                (token as any).created_at ||
                                (token as any).launch_time
                              }
                            />
                          </span>
                        </span>

                        {/* Snipe percentage - Red */}
                        {/* <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-all duration-200"
                        style={{ 
                          color: '#d11f3a',
                          fontSize: '11px',
                          fontWeight: '500',
                          borderColor: 'rgba(107, 114, 128, 0.1)',
                          backgroundColor: 'transparent'
                        }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                      <line x1="12" y1="4" x2="12" y2="8" stroke="currentColor" strokeWidth="1.5"/>
                      <line x1="12" y1="16" x2="12" y2="20" stroke="currentColor" strokeWidth="1.5"/>
                      <line x1="4" y1="12" x2="8" y2="12" stroke="currentColor" strokeWidth="1.5"/>
                      <line x1="16" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.5"/>
                      <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                    </svg>
                    {(() => {
                      const address = pairAddress || mintAddress;
                      const isEthereumAddress = address && address.startsWith('0x') && address.length === 42;
                      
                      if (isEthereumAddress) {
                        return (
                          <SniperHoldingsDisplay 
                            pairAddress={address}
                            chainId="eth"
                            blocksAfterCreation={1000}
                          />
                        );
                      } else {
                        // For Solana addresses, show token analytics
                        return (
                          // <SolanaTokenAnalytics 
                          //   mintAddress={mintAddress}
                          //   metricType="sniper"
                          // />
                          <span className="text-xs text-gray-500">-</span>
                        );
                      }
                    })()}
                  </span> */}

                        {/* Ghost percentage (Insider Holdings) - Green */}
                        {/* <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-all duration-200"
                        style={{ 
                          color: AX.aiGreen,
                          fontSize: '11px',
                          fontWeight: '500',
                          borderColor: 'rgba(107, 114, 128, 0.1)',
                          backgroundColor: 'transparent'
                        }}>
                    <RiGhostLine size={13} />
                    <span className="text-xs text-gray-500">-</span>
                  </span> */}

                        {/* Three Dice percentage (Dev Holdings/Bundle) - Green */}
                        {/* <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-all duration-200"
                        style={{ 
                          color: AX.aiGreen,
                          fontSize: '11px',
                          fontWeight: '500',
                          borderColor: 'rgba(107, 114, 128, 0.1)',
                          backgroundColor: 'transparent'
                        }}>
                    <FaDice size={13} />
                    <span className="text-xs text-gray-500">-</span>
                  </span> */}
                      </div>

                      {/* Red Meteora -> Arrows -> Yellow Meteora for High Bonding Tokens - Bottom-right of full row */}
                      {(() => {
                        const launchpadProtocol =
                          (token as any).launchpad_protocol?.toLowerCase() ||
                          "";
                        const isMeteora = launchpadProtocol.includes("meteora");
                        const bondingPct = (token as any).bonding_pct ?? 0;
                        const isFinalStretch =
                          title.toLowerCase().includes("final") ||
                          title.toLowerCase().includes("stretch");
                        const isMigratedColumn = title
                          .toLowerCase()
                          .includes("migrated");
                        const isHighBondingMeteora =
                          isFinalStretch &&
                          !isMigratedColumn &&
                          isMeteora &&
                          bondingPct > 98.6;

                        if (isHighBondingMeteora) {
                          return (
                            <div className="absolute right-2 bottom-4 z-0 flex items-center gap-0.5">
                              {/* Red Meteora Logo (left) */}
                              <div
                                className="relative flex h-4 w-4 items-center justify-center overflow-hidden rounded-full"
                                style={{
                                  border: "0.5px solid #d11f3a",
                                  backgroundColor: "transparent",
                                }}
                              >
                                <img
                                  src="https://s1.coincarp.com/logo/1/meteora.png?style=72&v=1759911013"
                                  alt="Meteora"
                                  className="h-full w-full object-cover"
                                />
                              </div>

                              {/* 3 Green Chevron Arrows */}
                              {[0, 1, 2].map((i) => (
                                <svg
                                  key={i}
                                  width="3"
                                  height="4"
                                  viewBox="0 0 3 4"
                                  fill="none"
                                  className="animate-pulse"
                                  style={{
                                    animationDelay: `${i * 0.2}s`,
                                    animationDuration: "1s",
                                  }}
                                >
                                  <path
                                    d="M0.5 0.5L2.5 2L0.5 3.5"
                                    stroke="#31e3ac"
                                    strokeWidth="1"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              ))}

                              {/* Yellow Meteora Logo (right) */}
                              <div
                                className="relative flex h-4 w-4 items-center justify-center overflow-hidden rounded-full"
                                style={{
                                  border: "0.5px solid #fbbf24",
                                  backgroundColor: "transparent",
                                }}
                              >
                                <img
                                  src="https://s1.coincarp.com/logo/1/meteora.png?style=72&v=1759911013"
                                  alt="Meteora"
                                  className="h-full w-full object-cover"
                                  style={{
                                    filter:
                                      "sepia(1) saturate(5) hue-rotate(5deg) brightness(1.1)",
                                  }}
                                />
                              </div>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    <div className="badges-scroll absolute bottom-1 left-[76px] flex max-w-[calc(100%-6rem)] flex-row items-center gap-1 overflow-x-auto overflow-y-hidden">
                      <BottomCardInfoHolder
                        PassedIcon={BsPersonGear}
                        token={token}
                        wsField="top10_holders_pct"
                        httpField="top10_holders_pct"
                        iconColor={AX.aiGreen}
                        tooltip="Top 10 Holders %"
                      />
                      <BottomCardInfoHolder
                        PassedIcon={LuChefHat}
                        token={token}
                        wsField="dev_percent"
                        httpField="dev_held_percentage"
                        iconColor="#566cdc"
                        tooltip="Dev Holding"
                      />
                      <BottomCardInfoHolder
                        PassedIcon={RiGhostLine}
                        token={token}
                        wsField="insider_percent"
                        httpField="insider_held_percentage"
                        tooltip="Insider Holding"
                        count={(token as any).insider_count ?? undefined}
                      />
                      <BottomCardInfoHolder
                        PassedIcon={SnipperIcon}
                        token={token}
                        wsField="sniper_percent"
                        httpField="sniper_held_percentage"
                        green={false}
                        tooltip="Sniper Holding"
                        count={(token as any).sniper_count ?? undefined}
                      />
                      <BottomCardInfoHolder
                        PassedIcon={GoStack}
                        value={(() => {
                          const val = (token as any).bundler_held_percentage;
                          const num =
                            typeof val === "string"
                              ? parseFloat(val)
                              : (val ?? 0);
                          return isNaN(num) ? 0 : num;
                        })().toFixed(2)}
                        tooltip="Bundler Holdings"
                        count={(token as any).bundler_count ?? undefined}
                      />
                      {/* Fish icon - commented out
                      <BottomCardInfoHolder
                        PassedIcon={PiFishSimpleLight}
                        value={0.2}
                        tooltip="Phishing Hold"
                      />
                      */}
                      {/* Leaf icon - commented out
                      <BottomCardInfoHolder
                        PassedIcon={PiLeafLight}
                        value={0.2}
                        tooltip="Fresh Hold"
                      />
                      */}
                    </div>
                  </div>
                </Link>
                </div>
                </div>
              );
            }}
        />
      )}
      {/* Shared singleton tooltips (only 3 divs instead of N*3) */}
      <div
        id="shared-copy-tooltip"
        className="pointer-events-none fixed rounded px-2 py-1 text-xs font-medium whitespace-nowrap opacity-0 transition-opacity duration-200"
        style={{
          zIndex: 9999,
          backgroundColor: AX.surface,
          color: AX.text,
          border: `1px solid ${AX.border}`,
          boxShadow: `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 0 8px ${AX.glowBlue}`,
          transform: "translate(-50%, -100%)",
        }}
      >
        Copy Contract
        <div
          className="absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 transform border-t-4 border-r-4 border-l-4 border-transparent"
          style={{ borderTopColor: AX.surface }}
        ></div>
      </div>
      <div
        id="shared-search-tooltip"
        className="pointer-events-none fixed rounded px-2 py-1 text-xs font-medium whitespace-nowrap opacity-0 transition-opacity duration-200"
        style={{
          zIndex: 9999,
          backgroundColor: AX.surface,
          color: AX.text,
          border: `1px solid ${AX.border}`,
          boxShadow: `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 0 8px ${AX.glowCyan}`,
          transform: "translate(-50%, -100%)",
        }}
      >
        Search on Twitter
        <div
          className="absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 transform border-t-4 border-r-4 border-l-4 border-transparent"
          style={{ borderTopColor: AX.surface }}
        ></div>
      </div>
      <div
        id="shared-profile-tooltip"
        className="pointer-events-none fixed rounded px-2 py-1 text-xs font-medium whitespace-nowrap opacity-0 transition-opacity duration-200"
        style={{
          zIndex: 9999,
          backgroundColor: AX.surface,
          color: AX.text,
          border: `1px solid ${AX.border}`,
          boxShadow: `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 0 8px ${AX.glowBlue}`,
          transform: "translate(-50%, -100%)",
        }}
      >
        View X Profile
        <div
          className="absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 transform border-t-4 border-r-4 border-l-4 border-transparent"
          style={{ borderTopColor: AX.surface }}
        ></div>
      </div>
      {/* Snipe on Migration Modal */}
      {showSnipeModal && selectedToken && (
        <InterstatePopout
          open={showSnipeModal}
          onClose={() => setShowSnipeModal(false)}
          align="center"
          className="relative mx-auto flex w-full max-w-md flex-col gap-2 rounded-lg border border-neutral-600 bg-neutral-900 text-neutral-100 shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-600 px-4 py-2 text-lg text-neutral-300">
            Snipe on Migration
            <button
              onClick={() => setShowSnipeModal(false)}
              className="text-2xl text-neutral-400"
              style={{ color: "#9CA3AF" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#f0f5f5";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#9CA3AF";
              }}
            >
              ×
            </button>
          </div>

          {/* SNIPE AMOUNT Section - Matching TradeActionPanel */}
          <div className="mx-3 mb-4">
            <div className="relative rounded-lg border border-neutral-700/90 bg-neutral-800">
              <div className="flex items-center justify-between gap-3 px-3 py-1.5">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-semibold tracking-wide text-[#9CA3AF] uppercase">
                    Amount
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    className="h-8 w-20 border-none bg-transparent pl-2 text-left text-[12px] font-normal text-[#E6E7EA] tabular-nums placeholder:text-[#9CA3AF] focus:outline-none"
                    style={{
                      fontFamily:
                        'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                    }}
                    placeholder="0.00"
                    value={thunderAmount}
                    onChange={(e) => setThunderAmount(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <SiSolana className="text-[#9CA3AF]" size={16} />
                  <span className="text-[10px] font-semibold tracking-wide text-[#9CA3AF] uppercase">
                    SOL
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              {["0.01", "0.1", "1", "10"].map((amount) => (
                <button
                  key={amount}
                  onClick={() => setThunderAmount(amount)}
                  className="rounded border border-neutral-700 bg-neutral-800 px-3 py-1 text-sm transition-colors hover:bg-neutral-700"
                  style={{ color: "#f0f5f5" }}
                >
                  {amount}
                </button>
              ))}
              <button
                className="rounded border border-neutral-700 bg-neutral-800 px-3 py-1 text-sm transition-colors hover:bg-neutral-700"
                style={{ color: "#f0f5f5" }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 20h9"></path>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
              </button>
            </div>
          </div>
          <p className="mx-3 mb-2 text-[11px] text-neutral-400">
            Sniper executes automatically when bonding reaches 100%.
          </p>

          {/* Buy Button - Matching preset popup */}
          <div className="mx-4 mb-4">
            <button
              onClick={() => {
                void handleArmSniper();
              }}
              disabled={sniperSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                backgroundColor: "#31e3ac",
                color: "#000000",
              }}
              onMouseEnter={(e) => {
                if (!sniperSubmitting) {
                  e.currentTarget.style.backgroundColor = "#28c896";
                }
              }}
              onMouseLeave={(e) => {
                if (!sniperSubmitting) {
                  e.currentTarget.style.backgroundColor = "#31e3ac";
                }
              }}
            >
              {sniperSubmitting
                ? "Arming…"
                : `Arm Sniper ${selectedToken.symbol} ${thunderAmount || "0"} SOL @ 100%`}
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
          </div>

          {/* Settings Inputs - Matching preset popup */}
          <div className="mb-4 grid grid-cols-3 gap-2 px-4">
            <VerticalInput
              label="SLIPPAGE"
              value={slippage}
              setValue={setSlippage}
              icon={<FaRunning />}
            />
            <VerticalInput
              label="PRIORITY"
              value={priority}
              setValue={setPriority}
              icon={<FaGasPump />}
            />
            <VerticalInput
              label="BRIBE"
              value={bribe}
              setValue={setBribe}
              icon={<FaCoins />}
            />
          </div>

          {/* MEV Mode - Matching preset popup */}
          <div className="mx-4 mb-4 flex gap-2 rounded-lg border border-neutral-700/90 px-1 py-1">
            <button
              className="flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                backgroundColor: "rgba(49, 227, 172, 0.2)",
                color: "#31e3ac",
              }}
            >
              Off
            </button>
            <button className="flex-1 rounded-md bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-neutral-200">
              Reduced
            </button>
            <button className="flex-1 rounded-md bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-neutral-200">
              Secure
            </button>
          </div>

          {/* RPC - Matching preset popup */}
          <div className="mx-4 mb-4">
            <label className="mb-2 block text-xs text-neutral-400">RPC</label>
            <input
              type="text"
              value="https://api.mainnet-beta.solana.com"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs focus:outline-none"
              style={{
                color: "#f0f5f5",
              }}
              onFocus={(e) => {
                e.currentTarget.style.boxShadow =
                  "0 0 0 2px rgba(49, 227, 172, 0.5)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.boxShadow = "none";
              }}
              readOnly
            />
          </div>
        </InterstatePopout>
      )}

    </div>
  );
}

export default PulseTable;

const SnipperIcon = ({ ...props }) => {
  return (
    <svg
      {...props}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <circle
        cx="12"
        cy="12"
        r="8"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <line
        x1="12"
        y1="4"
        x2="12"
        y2="8"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <line
        x1="12"
        y1="16"
        x2="12"
        y2="20"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <line
        x1="4"
        y1="12"
        x2="8"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <line
        x1="16"
        y1="12"
        x2="20"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle
        cx="12"
        cy="12"
        r="2"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  );
};
