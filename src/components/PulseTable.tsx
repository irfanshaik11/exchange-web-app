import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
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
import { FaDice, FaXTwitter } from "react-icons/fa6";
import {
  BsPersonGear,
  BsCoin,
  BsMoon,
  BsCloud,
  BsCup,
  BsArrowUp,
  BsSliders2,
} from "react-icons/bs";
import { LuChefHat, LuCrown } from "react-icons/lu";
import { RiGhostLine, RiFlaskLine, RiRobot2Line } from "react-icons/ri";
import { BiCandles, BiRefresh } from "react-icons/bi";
import {
  HiChartBar,
  HiUserGroup,
  HiLightningBolt,
  HiSparkles,
} from "react-icons/hi";
import { GoPeople, GoStack } from "react-icons/go";
import { IoPersonOutline } from "react-icons/io5";
import { MdTrendingUp, MdEmojiEvents, MdDynamicFeed } from "react-icons/md";
import { SiSolana } from "react-icons/si";
// Removed @web3icons/react to fix React version conflict
import Image from "next/image";
import InterstatePopout from "./InterstatePopout";
import VerticalInput from "./VerticalInput";
import { usePulseWebSocket } from "~/hooks/usePulseWebSocket";
import { flushSync } from "react-dom";

import { useRouter } from "next/router";
import { fetchTokenMetadata } from "~/utils/functions";
import { LuPill, LuSearch } from "react-icons/lu";
import Link from "next/link";
import { CiSearch, CiTrophy } from "react-icons/ci";
import FastImage from "./FastImage";
import SniperHoldingsDisplay from "./SniperHoldingsDisplay";
// import SolanaTokenAnalytics from "./SolanaTokenAnalytics";
import { useUser } from "~/components/UserContext";
import { useQuickBuy } from "~/components/QuickBuyContext";
import { extractTokenImage } from "~/utils/images";
import { useSolPrice } from "~/components/SolPriceContext";
import { preloadTokenImages } from "~/utils/imagePreloader";
import {
  tradeBuy,
  createLimitOrder,
  SOL_MINT_ADDRESS,
  ApiError,
} from "~/utils/api";
import { getPoolTypeFromToken } from "~/utils/poolTypeDetection";
import { TokenAge } from "./TokenAge";
import { prefetchTradeData } from "~/utils/tokenCache";
import {
  showCenteredErrorToast,
  showCenteredSuccessToast,
  showTransactionPendingToast,
  startTransactionToastTimeout,
  updateTransactionToast,
} from "~/utils/toast";
import { executeEnhancedTrade } from "~/utils/enhancedTradeHandler";
import { showEnhancedToast, updateEnhancedToast } from "~/utils/enhancedToast";
import { FiGlobe } from "react-icons/fi";
import BottomCardInfoHolder from "./BottomCardInfoHolder";

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
};

interface PulseTableProps {
  title: string;
  tokens: Token[];
  isFirstOrLast?: "first" | "last" | "only";
  loading?: boolean;
  skeletonRowCount?: number;
  showBubbleMetrics?: boolean; // Feature flag for bubble metrics (Buyers, Sellers, Wallets, 24h TX, Vol 24h)
  chain?: string; // Optional chain prop for navigation URLs
}

// Add a simple in-memory cache for token metadata
const tokenMetadataCache: Record<string, any> = {};

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
    const mc = token.fully_diluted_value || token.market_cap_usd || 0;

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

// Smooth number transition component
interface SmoothNumberProps {
  value: number;
  duration?: number;
  className?: string;
  formatter?: (value: number) => string;
}
const SmoothNumber: React.FC<SmoothNumberProps> = ({
  value,
  duration = 500,
  className = "",
  formatter = (val) => val.toString(),
}) => {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationRef = useRef<number | undefined>(undefined);
  const startTimeRef = useRef<number | undefined>(undefined);
  const startValueRef = useRef<number>(value);

  useEffect(() => {
    if (value === displayValue) return;

    const startValue = displayValue;
    const endValue = value;
    const startTime = performance.now();

    startTimeRef.current = startTime;
    startValueRef.current = startValue;
    setIsAnimating(true);

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function for smooth animation
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      const currentValue = startValue + (endValue - startValue) * easeOutCubic;

      setDisplayValue(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endValue);
        setIsAnimating(false);
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
    <span
      className={`${isAnimating ? "transition-all duration-75" : ""} ${className}`}
    >
      {formatter(displayValue)}
    </span>
  );
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

  // Real data from token
  const rawMetrics = {
    users: token.total_holders || token.unique_wallets_24h || 0,
    trades: token.unique_wallets_5m || token.unique_wallets_1h || 0,
    achievements: 0,
    rank: "0/1",
  };

  // Format the metrics for display
  const metrics = {
    users: formatNumber(rawMetrics.users),
    trades: formatNumber(rawMetrics.trades),
    achievements: rawMetrics.achievements,
    rank: rank && totalTokens ? `${rank}/${totalTokens}` : "0/1",
  };

  return (
    <div className="relative z-10 flex items-center gap-1">
      {/* Users Icon - Multiple People */}
      <div className="flex items-center gap-1">
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
          {metrics.users}
        </span>
      </div>

      {/* Candles Icon - Trading/Volume */}
      {/* <div className="flex items-center gap-1">
        <BiCandles size={12} style={{ color: AX.muted }} />
        <span className="text-xs" style={{ color: AX.text }}>{metrics.trades}</span>
      </div> */}

      {/* Trophy Icon - Achievements */}
      {/* <div className="flex items-center gap-1">
        <MdEmojiEvents size={12} style={{ color: AX.muted }} />
        <span className="text-xs" style={{ color: AX.text }}>{metrics.achievements}</span>
      </div> */}

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
    if (tokenMetadataCache[uri]) {
      setMeta(tokenMetadataCache[uri]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setShowInitial(false);
    const timer = setTimeout(() => setShowInitial(true), 150);
    fetchTokenMetadata(uri).then((data) => {
      if (!cancelled) {
        if (data) tokenMetadataCache[uri] = data;
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
function TokenImage({
  token,
  priority = false,
  isNewPairs = false,
  columnType = "new",
}: {
  token: Token;
  priority?: boolean;
  isNewPairs?: boolean;
  columnType?: "new" | "final-stretch" | "migrated";
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [previewPosition, setPreviewPosition] = useState({ top: 0, left: 0 });
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Extract image URL from token data, checking multiple possible field names
  // Priority: image, uri, logo, imageUrl, logoUrl, image_url, logo_url, icon, thumbnail
  const imageUrl = extractTokenImage(token as any) || null;

  // Debug logging to help diagnose image loading issues
  useEffect(() => {
    if (imageUrl) {
      console.log(
        `[TokenImage] ${token.symbol || "Unknown"}: imageUrl extracted:`,
        imageUrl,
      );
    } else {
      console.warn(
        `[TokenImage] ${token.symbol || "Unknown"}: No image URL found. Token data:`,
        {
          image: (token as any).image,
          uri: (token as any).uri,
          logo: token.logo,
          imageUrl: (token as any).imageUrl,
          logoUrl: (token as any).logoUrl,
        },
      );
    }
  }, [imageUrl, token.symbol, token]);

  // Calculate migration progress for border color (only for New Pairs, NOT for migrated)
  const getMigrationProgress = (token: Token): number => {
    // Don't apply bonding progress to migrated column
    if (!isNewPairs || columnType === "migrated") return 0;

    // Priority order: bonding_pct, bonding_curve_progress, graduationPercent, market cap / 70k
    const bondingPct = (token as any).bonding_pct;
    const bondingProgress = token.bonding_curve_progress;
    const graduationPercent = (token as any).graduationPercent;
    const marketCap =
      (token as any).fully_diluted_value ?? (token as any).market_cap_usd ?? 0;

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

    if (launchpadProtocol.includes("bonk")) {
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

    if (launchpadProtocol.includes("bonk")) {
      return "https://s3.coinmarketcap.com/static-gravity/image/a28128d9ff7c49c9ad33ee2f626fda40.png";
    }

    if (launchpadProtocol.includes("bags")) {
      return "https://play-lh.googleusercontent.com/7AxVcu1pumxavcGTb16WBJQU88CDZd0v8q0WzFwfin7zbBvItYMuNQ0Xkqq4srTw4A=w240-h480-rw";
    }

    if (launchpadProtocol.includes("launch")) {
      // LaunchLab uses Raydium icon
      return "https://s2.coinmarketcap.com/static/img/coins/64x64/8526.png";
    }

    // Default to pump.fun icon for unknown protocols
    return "https://pump.fun/pump-logomark.svg";
  };

  const tokenIcon = getTokenIcon(token);
  const protocolColor = getProtocolColor(token);
  const migrationProgress = getMigrationProgress(token);

  // Check if token should have full circle image (no white space)
  const launchpadProtocol =
    (token as any).launchpad_protocol?.toLowerCase() || "";
  const isMeteora = launchpadProtocol.includes("meteora");
  const isBonk = launchpadProtocol.includes("bonk");
  const isBags = launchpadProtocol.includes("bags");
  const isMoonit =
    launchpadProtocol.includes("moonit") ||
    launchpadProtocol.includes("moonshot") ||
    launchpadProtocol.includes("moonshoot");
  const isFullCircleImage = isMeteora || isBonk || isBags || isMoonit;

  // Debug logging for protocol detection
  if (
    typeof window !== "undefined" &&
    (window as any).__DEBUG_PROTOCOL_ICONS__
  ) {
    console.log(`[TokenImage] ${token.symbol}:`, {
      launchpad_protocol: (token as any).launchpad_protocol,
      protocol: (token as any).protocol,
      launchpadName: (token as any).launchpadName,
      amm: (token as any).amm,
      selectedIcon: tokenIcon,
      protocolColor: protocolColor,
    });
  }

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
  const scaledProgress = isNewPairs
    ? Math.min(finalProgress / 0.6, 0.95)
    : finalProgress;

  // Debug logging for New Pairs
  if (isNewPairs) {
    console.log(`[TokenImage] ${token.symbol} progress:`, {
      bonding_pct: (token as any).bonding_pct,
      bonding_curve_progress: token.bonding_curve_progress,
      graduationPercent: (token as any).graduationPercent,
      calculatedProgress: migrationProgress,
      finalProgress: finalProgress,
      scaledProgress: scaledProgress,
      protocolColor: protocolColor,
      protocol: (token as any).launchpad_protocol,
    });
  }

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    console.log("Mouse enter - showing preview for:", token.symbol);
    setShowPreview(true);
    const target = e.currentTarget as HTMLDivElement;
    // Minimal hover effect - no glow
    target.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.2)";
    target.style.transform = "scale(1.08)";

    // Calculate preview window position
    if (imageContainerRef.current) {
      const rect = imageContainerRef.current.getBoundingClientRect();
      setPreviewPosition({
        top: rect.top,
        left: rect.right + 20,
      });
    }
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    console.log("Mouse leave - hiding preview for:", token.symbol);
    setShowPreview(false);
    const target = e.currentTarget as HTMLDivElement;
    // Don't change border color since we're using SVG border now
    target.style.boxShadow = "none";
    target.style.transform = "scale(1)";
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
        style={{
          width: "81px",
          height: "81px",
          minWidth: "81px",
          minHeight: "81px",
          maxWidth: "81px",
          maxHeight: "81px",
          overflow: "visible",
        }}
      >
        {/* Outer border container */}
        <div
          className="relative rounded-sm transition-all duration-300 ease-out"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={{
            border: "none",
            padding: "0",
            width: "79px",
            height: "79px",
            minWidth: "79px",
            minHeight: "79px",
            maxWidth: "79px",
            maxHeight: "79px",
          }}
        >
          {/* Single colored border container (moved inward) */}
          <div
            className="relative rounded-sm"
            style={{
              border: `0.5px solid ${(() => {
                const isNewColumn = columnType === "new";
                if (
                  isNewColumn &&
                  typeof protocolColor === "string" &&
                  protocolColor.startsWith("#") &&
                  (protocolColor.length === 7 || protocolColor.length === 4)
                ) {
                  // Slightly more transparent (~70%) for New Pairs color border
                  return protocolColor.length === 7
                    ? `${protocolColor}B3`
                    : `${protocolColor}B`;
                }
                return protocolColor;
              })()}`,
              padding: "2px",
              backgroundColor: "#06070b",
              width: "79px",
              height: "79px",
              minWidth: "79px",
              minHeight: "79px",
              maxWidth: "79px",
              maxHeight: "79px",
            }}
          >
            {/* Image container */}
            <div
              className="relative overflow-hidden rounded-sm"
              style={{
                width: "75px",
                height: "75px",
                minWidth: "75px",
                minHeight: "75px",
                maxWidth: "75px",
                maxHeight: "75px",
              }}
            >
              <FastImage
                src={imageUrl}
                alt={token.name || token.symbol || ""}
                symbol={token.symbol}
                name={token.name}
                width={75}
                height={75}
                className="h-full w-full object-cover transition-all duration-300"
                priority={priority}
                showBubble={false}
              />
            </div>
          </div>
        </div>
        {/* Thin loading border - solid green, clockwise from bottom-right (only for New Pairs) */}
        {isNewPairs && (
          <div className="pointer-events-none absolute inset-0">
            <svg className="h-full w-full" viewBox="0 0 81 81">
              {/* Background border - outer grey border */}

              {/* Inner grey border */}
              <rect
                x="2"
                y="2"
                width="77"
                height="77"
                fill="none"
                stroke="none"
                strokeWidth="0"
                rx="4"
              />

              {/* Progress border - clockwise rounded path starting from bottom-right */}
              <path
                d="M 79 79 L 8 79 Q 2 79 2 73 L 2 8 Q 2 2 8 2 L 73 2 Q 79 2 79 8 L 79 73 Q 79 79 73 79"
                fill="none"
                stroke={protocolColor}
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={`${4 * 77}`} // Total perimeter
                strokeDashoffset={`${4 * 77 * (1 - scaledProgress)}`}
                className="transition-all duration-700 ease-out"
              />
            </svg>
          </div>
        )}

        {/* Dynamic protocol icon bubble - aligned to the outer border's bottom-right corner */}
        <div
          className="pointer-events-none absolute right-0 bottom-0 z-10 flex translate-x-1/5 translate-y-1/4 transform items-center justify-center rounded-full"
          style={{
            width: 16,
            height: 16,
            backgroundColor: "#000000",
            border: `1px solid ${protocolColor}`,
            boxShadow: `0 0 4px ${protocolColor}60`,
          }}
        >
          <img
            src={tokenIcon}
            alt={`${(token as any).launchpad_protocol || (token as any).protocol || (token as any).launchpadName || "Protocol"} logo`}
            className={`${isFullCircleImage ? "h-full w-full object-cover" : "h-3/4 w-3/4 object-contain"} rounded-full`}
            style={{
              filter:
                protocolColor === "#eab308"
                  ? "sepia(1) saturate(3) hue-rotate(-10deg) brightness(1.1)"
                  : "none",
            }}
          />
        </div>
        {/* Camera icon overlay - minimal grey - only shows on image hover */}
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-all duration-300"
          style={{ opacity: showPreview ? 1 : 0 }}
        >
          <div
            className="flex items-center justify-center rounded-full p-2"
            style={{
              backgroundColor: "rgba(107, 114, 128, 0.3)",
              boxShadow: "none",
            }}
          >
            <FaCamera size={16} style={{ color: "#9ca3af" }} />
          </div>
        </div>

        {/* Minimal border - only shows on image hover */}
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-all duration-300"
          style={{ opacity: showPreview ? 1 : 0 }}
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
      {showPreview && (
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
                  opacity: showPreview ? 1 : 0,
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
      )}

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
  chain: chainProp,
}: PulseTableProps) {
  // DEBUG: Log EVERY render (not just when tokens change)
  console.log(
    `[PulseTable ${title}] 🔥 RENDER START - tokens count: ${tokens?.length || 0}, first token:`,
    tokens?.[0]?.name || "none",
  );

  // DEBUG: Log when component receives new props
  useEffect(() => {
    console.log(
      `[PulseTable ${title}] 🎯 Received tokens prop, count: ${tokens?.length || 0}`,
    );
  }, [tokens, title]);

  // Preload images for visible tokens (first 20 for instant loading)
  // This runs in background and doesn't block rendering or new token updates
  useEffect(() => {
    if (tokens && tokens.length > 0) {
      // Fire-and-forget: preload in background without blocking
      // This doesn't interfere with WebSocket updates or new tokens coming in
      preloadTokenImages(tokens, {
        limit: 20,
        priority: 'high',
        maxConcurrent: 10,
      }).catch(() => {
        // Silently fail - don't log to avoid console spam
      });
    }
  }, [tokens]);

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
  const [buttonPosition, setButtonPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [waveTokens, setWaveTokens] = useState<Set<number>>(new Set()); // Wave animation for migrating tokens
  const { solPrice } = useSolPrice(); // Use shared SOL price from Footer context

  // State for filtered tokens from API
  const [filteredTokens, setFilteredTokens] = useState<Token[]>([]);
  const [isFetchingFiltered, setIsFetchingFiltered] = useState(false);
  const isNewPairs = title.toLowerCase().includes("new");
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
        return filterNonZeroLiquidity(parsed.data as Token[]);
      }
    } catch (error) {
      console.warn("[PulseTable] Failed to restore ws cache:", error);
    }
    return [];
  });

  const [filters, setFilters] = useState({
    // Protocols
    protocols: ["All"] as string[],
    // Quote Tokens
    quoteTokens: [] as string[],
    // Keywords
    searchKeywords: "",
    excludeKeywords: "",
    // Audit
    dexPaid: false,
    caEndsInPump: false,
    minAge: "",
    maxAge: "",
    ageUnit: "m",
    top10HoldersPercent: "",
    // New Audit Fields
    devHoldingPercentMin: "",
    devHoldingPercentMax: "",
    snipersPercentMin: "",
    snipersPercentMax: "",
    insidersPercentMin: "",
    insidersPercentMax: "",
    bundlePercentMin: "",
    bundlePercentMax: "",
    holdersMin: "",
    holdersMax: "",
    proTradersMin: "",
    proTradersMax: "",
    devMigrationsMin: "",
    devMigrationsMax: "",
    devPairsCreatedMin: "",
    devPairsCreatedMax: "",
    // Metrics
    minMarketCap: "",
    maxMarketCap: "",
    minVolume: "",
    maxVolume: "",
    minLiquidity: "",
    maxLiquidity: "",
    bCurvePercentMin: "",
    bCurvePercentMax: "",
    globalFeesPaidMin: "",
    globalFeesPaidMax: "",
    txnsMin: "",
    txnsMax: "",
    numBuysMin: "",
    numBuysMax: "",
    numSellsMin: "",
    numSellsMax: "",
    // Socials
    twitterFollowers: "",
    telegramMembers: "",
    discordMembers: "",
    twitterReusesMin: "",
    twitterReusesMax: "",
    tweetAgeMin: "",
    tweetAgeMax: "",
    tweetAgeUnit: "m",
    hasTwitter: false,
    hasWebsite: false,
    hasTelegram: false,
    atLeastOneSocial: false,
    onlyPumpLive: false,
    // Sort - default to timestamp for New Pairs and Migrated, marketCap for others
    sortBy:
      isNewPairs || title.toLowerCase().includes("migrated")
        ? "timestamp"
        : "marketCap",
    sortOrder: "desc",
  });

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
        setWsTokens(filterNonZeroLiquidity(parsed.data as Token[]));
      }
    } catch (error) {
      console.warn(
        "[PulseTable] Failed to rehydrate ws cache on key change:",
        error,
      );
    }
  }, [wsCacheStorageKey]);

  // Pending filters for Apply button functionality
  const [pendingFilters, setPendingFilters] = useState(filters);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const prevHasSpecificProtocolsRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasSpecificProtocols =
      filters.protocols.length > 0 && !filters.protocols.includes("All");
    if (hasSpecificProtocols) return;
    try {
      const payload = {
        data: wsTokens,
        timestamp: Date.now(),
      };
      window.localStorage.setItem(wsCacheStorageKey, JSON.stringify(payload));
    } catch (error) {
      console.warn("[PulseTable] Failed to persist ws cache:", error);
    }
  }, [wsTokens, wsCacheStorageKey, filters.protocols]);

  // Functions to handle filter changes
  const handleApplyFilters = () => {
    setFilters(pendingFilters);
    setHasPendingChanges(false);
    setShowFilters(false);
  };

  // Map frontend protocol names to backend protocol names
  const mapProtocolToBackend = useCallback((protocol: string): string[] => {
    switch (protocol) {
      case "Pump":
        return ["pump.fun"];
      case "Pump AMM":
        return ["pump.fun"];
      case "Raydium":
        return ["raydium", "raydiumlaunchpad"];
      case "Meteora AMM":
        return ["meteora"];
      case "Meteora AMM V2":
        return ["meteora"];
      case "Bonk":
        return ["bonk"];
      case "Bags":
        return ["bags"];
      case "Moonit":
        return ["moonit"];
      case "Boop":
        return ["boopfun"];
      case "LaunchLab":
        return ["launchlab"];
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
          const next = Array.isArray(data) ? data : [];
          setFilteredTokens(filterNonZeroLiquidity(next as Token[]));
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
    [title],
  );

  // Determine channel from title
  const channel = useMemo(() => {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes("new")) return "new";
    if (lowerTitle.includes("final")) return "final_stretch";
    if (lowerTitle.includes("migrated")) return "migrated";
    return undefined;
  }, [title]);
  // WebSocket for real-time updates with server-side filtering
  const {
    newTokens: wsNewTokens,
    finalStretchTokens: wsFinalStretchTokens,
    migratedTokens: wsMigratedTokens,
    connected: wsConnected,
    error: wsError,
  } = usePulseWebSocket({
    enabled: true,
    channel,
    protocols:
      filters.protocols.length > 0
        ? filters.protocols.flatMap(mapProtocolToBackend)
        : undefined,
    onNewToken: useCallback(
      (token: any) => {
        if (channel === "new") {
          // FAST PATH: New pairs bypass zero liquidity check for maximum speed
          // Zero liquidity tokens will be filtered during merge, but new pairs get instant priority
          // Use flushSync to force immediate update, bypassing React 18's automatic batching
          // Optimized with Map-based deduplication (O(1) instead of O(n))
          // Skip filtering existing tokens - just prepend new token instantly
          flushSync(() => {
            setWsTokens((prev) => {
              // Fast path: Just prepend new token, remove if duplicate
              // Don't filter existing tokens here - let them through for speed
              const filtered = prev.filter((t) => t.mint !== token.mint);
              return [token as Token, ...filtered].slice(0, 50);
            });
          });
        }
      },
      [channel],
    ),
    onFinalStretchToken: useCallback(
      (token: any) => {
        if (channel === "final_stretch" && !hasZeroLiquidity(token)) {
          // Use flushSync to force immediate update, bypassing React 18's automatic batching
          // Optimized with Map-based deduplication (O(1) instead of O(n))
          flushSync(() => {
            setWsTokens((prev) => {
              const map = new Map<string, Token>();
              map.set(token.mint, token as Token);
              for (const t of prev) {
                if (
                  t.mint !== token.mint &&
                  !hasZeroLiquidity(t) &&
                  map.size < 50
                ) {
                  map.set(t.mint, t);
                }
              }
              return Array.from(map.values());
            });
          });
        }
      },
      [channel],
    ),
    onMigratedToken: useCallback(
      (token: any) => {
        if (channel === "migrated" && !hasZeroLiquidity(token)) {
          // Use flushSync to force immediate update, bypassing React 18's automatic batching
          // Optimized with Map-based deduplication (O(1) instead of O(n))
          flushSync(() => {
            setWsTokens((prev) => {
              const map = new Map<string, Token>();
              map.set(token.mint, token as Token);
              for (const t of prev) {
                if (
                  t.mint !== token.mint &&
                  !hasZeroLiquidity(t) &&
                  map.size < 50
                ) {
                  map.set(t.mint, t);
                }
              }
              return Array.from(map.values());
            });
          });
        }
      },
      [channel],
    ),
    onPriceUpdate: useCallback((updates: any[]) => {
      // Merge price updates into filteredTokens (base HTTP data)
      setFilteredTokens((prev) => {
        if (!prev || prev.length === 0) return prev;

        const updatesMap = new Map(updates.map((u) => [u.mint, u]));
        const updatedTokens = prev.map((token) => {
          const update = updatesMap.get(token.mint);
          if (!update) return token;

          // Merge update into existing token (preserve all fields, update only changed ones)
          return {
            ...token,
            ...(update.price_usd !== undefined && {
              price_usd: update.price_usd,
            }),
            ...(update.market_cap_usd !== undefined && {
              market_cap_usd: update.market_cap_usd,
            }),
            ...(update.volume_24h !== undefined && {
              volume_24h: update.volume_24h,
            }),
            ...(update.bonding_curve_progress !== undefined && {
              bonding_curve_progress: update.bonding_curve_progress,
            }),
            ...(update.price_change_24h !== undefined && {
              price_change_24h: update.price_change_24h,
            }),
            // Transaction metrics (5m)
            ...(update.total_buy_volume_5m !== undefined && {
              total_buy_volume_5m: update.total_buy_volume_5m,
            }),
            ...(update.total_sell_volume_5m !== undefined && {
              total_sell_volume_5m: update.total_sell_volume_5m,
            }),
            ...(update.total_buys_5m !== undefined && {
              total_buys_5m: update.total_buys_5m,
            }),
            ...(update.total_sells_5m !== undefined && {
              total_sells_5m: update.total_sells_5m,
            }),
            // Transaction metrics (1h)
            ...(update.total_buy_volume_1h !== undefined && {
              total_buy_volume_1h: update.total_buy_volume_1h,
            }),
            ...(update.total_sell_volume_1h !== undefined && {
              total_sell_volume_1h: update.total_sell_volume_1h,
            }),
            ...(update.total_buys_1h !== undefined && {
              total_buys_1h: update.total_buys_1h,
            }),
            ...(update.total_sells_1h !== undefined && {
              total_sells_1h: update.total_sells_1h,
            }),
            // Transaction metrics (6h)
            ...(update.total_buy_volume_6h !== undefined && {
              total_buy_volume_6h: update.total_buy_volume_6h,
            }),
            ...(update.total_sell_volume_6h !== undefined && {
              total_sell_volume_6h: update.total_sell_volume_6h,
            }),
            ...(update.total_buys_6h !== undefined && {
              total_buys_6h: update.total_buys_6h,
            }),
            ...(update.total_sells_6h !== undefined && {
              total_sells_6h: update.total_sells_6h,
            }),
            // Transaction metrics (24h)
            ...(update.total_buy_volume_24h !== undefined && {
              total_buy_volume_24h: update.total_buy_volume_24h,
            }),
            ...(update.total_sell_volume_24h !== undefined && {
              total_sell_volume_24h: update.total_sell_volume_24h,
            }),
            ...(update.total_buys_24h !== undefined && {
              total_buys_24h: update.total_buys_24h,
            }),
            ...(update.total_sells_24h !== undefined && {
              total_sells_24h: update.total_sells_24h,
            }),
            updated_at: update.updated_at || token.updated_at,
          };
        });
        return filterNonZeroLiquidity(updatedTokens as Token[]);
      });

      // Also merge into wsTokens (WebSocket new tokens)
      setWsTokens((prev) => {
        if (!prev || prev.length === 0) return prev;

        const updatesMap = new Map(updates.map((u) => [u.mint, u]));
        const updatedTokens = prev.map((token) => {
          const update = updatesMap.get(token.mint);
          if (!update) return token;

          return {
            ...token,
            ...(update.price_usd !== undefined && {
              price_usd: update.price_usd,
            }),
            ...(update.market_cap_usd !== undefined && {
              market_cap_usd: update.market_cap_usd,
            }),
            ...(update.volume_24h !== undefined && {
              volume_24h: update.volume_24h,
            }),
            ...(update.bonding_curve_progress !== undefined && {
              bonding_curve_progress: update.bonding_curve_progress,
            }),
            ...(update.price_change_24h !== undefined && {
              price_change_24h: update.price_change_24h,
            }),
            ...(update.total_buy_volume_5m !== undefined && {
              total_buy_volume_5m: update.total_buy_volume_5m,
            }),
            ...(update.total_sell_volume_5m !== undefined && {
              total_sell_volume_5m: update.total_sell_volume_5m,
            }),
            ...(update.total_buys_5m !== undefined && {
              total_buys_5m: update.total_buys_5m,
            }),
            ...(update.total_sells_5m !== undefined && {
              total_sells_5m: update.total_sells_5m,
            }),
            ...(update.total_buy_volume_1h !== undefined && {
              total_buy_volume_1h: update.total_buy_volume_1h,
            }),
            ...(update.total_sell_volume_1h !== undefined && {
              total_sell_volume_1h: update.total_sell_volume_1h,
            }),
            ...(update.total_buys_1h !== undefined && {
              total_buys_1h: update.total_buys_1h,
            }),
            ...(update.total_sells_1h !== undefined && {
              total_sells_1h: update.total_sells_1h,
            }),
            ...(update.total_buy_volume_6h !== undefined && {
              total_buy_volume_6h: update.total_buy_volume_6h,
            }),
            ...(update.total_sell_volume_6h !== undefined && {
              total_sell_volume_6h: update.total_sell_volume_6h,
            }),
            ...(update.total_buys_6h !== undefined && {
              total_buys_6h: update.total_buys_6h,
            }),
            ...(update.total_sells_6h !== undefined && {
              total_sells_6h: update.total_sells_6h,
            }),
            ...(update.total_buy_volume_24h !== undefined && {
              total_buy_volume_24h: update.total_buy_volume_24h,
            }),
            ...(update.total_sell_volume_24h !== undefined && {
              total_sell_volume_24h: update.total_sell_volume_24h,
            }),
            ...(update.total_buys_24h !== undefined && {
              total_buys_24h: update.total_buys_24h,
            }),
            ...(update.total_sells_24h !== undefined && {
              total_sells_24h: update.total_sells_24h,
            }),
            updated_at: update.updated_at || token.updated_at,
          };
        });
        return filterNonZeroLiquidity(updatedTokens as Token[]);
      });
    }, []),
  });

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
    const defaultFilters = {
      protocols: [] as string[],
      quoteTokens: [] as string[],
      searchKeywords: "",
      excludeKeywords: "",
      dexPaid: false,
      caEndsInPump: false,
      minAge: "",
      maxAge: "",
      ageUnit: "m",
      top10HoldersPercent: "",
      devHoldingPercentMin: "",
      devHoldingPercentMax: "",
      snipersPercentMin: "",
      snipersPercentMax: "",
      insidersPercentMin: "",
      insidersPercentMax: "",
      bundlePercentMin: "",
      bundlePercentMax: "",
      holdersMin: "",
      holdersMax: "",
      proTradersMin: "",
      proTradersMax: "",
      devMigrationsMin: "",
      devMigrationsMax: "",
      devPairsCreatedMin: "",
      devPairsCreatedMax: "",
      minMarketCap: "",
      maxMarketCap: "",
      minVolume: "",
      maxVolume: "",
      minLiquidity: "",
      maxLiquidity: "",
      bCurvePercentMin: "",
      bCurvePercentMax: "",
      globalFeesPaidMin: "",
      globalFeesPaidMax: "",
      txnsMin: "",
      txnsMax: "",
      numBuysMin: "",
      numBuysMax: "",
      numSellsMin: "",
      numSellsMax: "",
      twitterFollowers: "",
      telegramMembers: "",
      discordMembers: "",
      twitterReusesMin: "",
      twitterReusesMax: "",
      tweetAgeMin: "",
      tweetAgeMax: "",
      tweetAgeUnit: "m",
      hasTwitter: false,
      hasWebsite: false,
      hasTelegram: false,
      atLeastOneSocial: false,
      onlyPumpLive: false,
      sortBy:
        isNewPairs || title.toLowerCase().includes("migrated")
          ? "timestamp"
          : "marketCap",
      sortOrder: "desc",
    };
    setPendingFilters(defaultFilters);
    setFilters(defaultFilters);
    setHasPendingChanges(false);
  };

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
  const { user, solBalance } = useUser();
  const { presets, activePreset, setActivePreset } = useQuickBuy();

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
  // QUICK BUY handler – with detailed logging
  const handleQuickBuy = async (token: Token) => {
    console.log("🎯 Enhanced Quick Buy called for token:", token.symbol);

    if (!user?.bearerToken || !user?.id) {
      console.log("❌ User not logged in");
      showEnhancedToast("warning", "Please connect your wallet to trade", {
        title: "Authentication Required",
      });
      return;
    }

    const buyAmount = parseFloat(thunderAmount);
    if (isNaN(buyAmount) || buyAmount <= 0) {
      console.log("❌ Invalid buy amount:", thunderAmount);
      showEnhancedToast(
        "warning",
        "Please enter a valid SOL amount (minimum 0.001 SOL)",
        {
          title: "Invalid Amount",
        },
      );
      return;
    }

    const presetIndex = getPresetIndex(); // Use local preset selection based on selectedPill
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
        console.log("✅ Enhanced Quick Buy successful:", { txHash, stats });
      },
      onError: (error) => {
        console.error("❌ Enhanced Quick Buy failed:", error);
      },
      onWarning: (warnings) => {
        console.warn("⚠️ Pre-transaction warnings:", warnings);
      },
    });

    return result;
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
      if (!target.closest(".filter-dropdown")) {
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
    console.log(
      `[PulseTable ${title}] 🔧 filteredAndSortedTokens recomputing, tokens count: ${tokens?.length || 0}, filteredTokens: ${filteredTokens.length}, wsTokens: ${wsTokens.length}`,
    );

    // Data source priority:
    // 1. WebSocket real-time tokens (for instant updates)
    // 2. HTTP API filtered tokens (when protocol filters active)
    // 3. Original tokens prop (fallback)
    let filtered: Token[];
    const hasSpecificProtocols =
      filters.protocols.length > 0 && !filters.protocols.includes("All");

    // Merge WebSocket tokens with HTTP API tokens (deduplicate by mint)
    const mergedMap = new Map<string, Token>();

    // Use filteredTokens if available (either from specific filters or fresh "All" fetch)
    // Otherwise fall back to tokens prop
    const baseTokens = filteredTokens.length > 0 ? filteredTokens : tokens;

    // First add HTTP API tokens (either filtered or from props)
    baseTokens.forEach((token) => mergedMap.set(token.mint, token));

    // Then add/overwrite with WebSocket tokens (they're more recent and real-time)
    // For new pairs, prioritize speed - filter after merge, not during
    wsTokens.forEach((token) => mergedMap.set(token.mint, token));

    // Filter zero liquidity tokens - but do it fast for new pairs
    const isNewPairs = title.toLowerCase().includes("new");
    if (isNewPairs) {
      // Fast path for new pairs: filter in-place to avoid extra array creation
      const allTokens = Array.from(mergedMap.values()) as Token[];
      filtered = allTokens.filter((token) => !hasZeroLiquidity(token));
    } else {
      filtered = filterNonZeroLiquidity(
        Array.from(mergedMap.values()) as Token[],
      );
    }

    if (hasSpecificProtocols) {
      console.log(
        `[PulseTable ${title}] 🔀 Merged filtered tokens: ${filteredTokens.length} HTTP + ${wsTokens.length} WS = ${filtered.length} total`,
      );
    } else {
      console.log(
        `[PulseTable ${title}] 🔀 Merged tokens (showing All): ${baseTokens.length} HTTP + ${wsTokens.length} WS = ${filtered.length} total`,
      );
    }

    // Filter out tokens without migrated_pool_address in the Migrated column
    // Skip this filter when protocol filtering is applied (API already returns valid migrated tokens)
    if (
      title.toLowerCase().includes("migrated") &&
      filters.protocols.length === 0
    ) {
      filtered = filtered.filter((token) => {
        const hasMigratedPoolAddress = !!(token as any).migrated_pool_address;
        return hasMigratedPoolAddress;
      });
    }

    // Protocol filtering is now handled by the API, so we skip client-side filtering
    // when protocols are selected (filteredTokens already contains the filtered results)

    // Apply keyword filters
    if (filters.searchKeywords.trim()) {
      const searchTerms = filters.searchKeywords
        .toLowerCase()
        .split(",")
        .map((term) => term.trim())
        .filter((term) => term);
      if (searchTerms.length > 0) {
        const beforeCount = filtered.length;
        filtered = filtered.filter((token) => {
          const tokenText =
            `${token.name || ""} ${token.symbol || ""}`.toLowerCase();
          return searchTerms.some((term) => tokenText.includes(term));
        });
        console.log(
          `[Keyword Filter] Filtered ${beforeCount} tokens to ${filtered.length} tokens for search keywords:`,
          searchTerms,
        );
      }
    }

    if (filters.excludeKeywords.trim()) {
      const excludeTerms = filters.excludeKeywords
        .toLowerCase()
        .split(",")
        .map((term) => term.trim())
        .filter((term) => term);
      if (excludeTerms.length > 0) {
        const beforeCount = filtered.length;
        filtered = filtered.filter((token) => {
          const tokenText =
            `${token.name || ""} ${token.symbol || ""}`.toLowerCase();
          return !excludeTerms.some((term) => tokenText.includes(term));
        });
        console.log(
          `[Exclude Filter] Filtered ${beforeCount} tokens to ${filtered.length} tokens for exclude keywords:`,
          excludeTerms,
        );
      }
    }

    // Apply quote token filters
    if (filters.quoteTokens.length > 0) {
      const beforeCount = filtered.length;
      filtered = filtered.filter((token) => {
        // For now, we'll filter based on pair address patterns or other heuristics
        // Since we don't have explicit quote token data, we'll use pair address patterns
        const pairAddress = token.pair_address;
        if (!pairAddress) return false;

        return filters.quoteTokens.some((quoteToken) => {
          // This is a simplified approach - in reality you'd need to check the actual pair
          // For now, we'll just return true if any quote token is selected
          // You might want to implement more sophisticated logic based on your data
          return true;
        });
      });
      console.log(
        `[Quote Token Filter] Filtered ${beforeCount} tokens to ${filtered.length} tokens for quote tokens:`,
        filters.quoteTokens,
      );
    }

    // Apply dexPaid filter
    if (filters.dexPaid) {
      const beforeCount = filtered.length;
      filtered = filtered.filter((token) => {
        // Check if token has paid dex fees (this would need to be implemented based on your data structure)
        // For now, we'll assume all tokens have paid if this filter is enabled
        return true; // Placeholder - implement based on actual dexPaid field
      });
      console.log(
        `[DexPaid Filter] Filtered ${beforeCount} tokens to ${filtered.length} tokens for dexPaid:`,
        filters.dexPaid,
      );
    }

    // Apply caEndsInPump filter
    if (filters.caEndsInPump) {
      const beforeCount = filtered.length;
      filtered = filtered.filter((token) => {
        // Check if contract address ends in "pump"
        return token.mint && token.mint.toLowerCase().endsWith("pump");
      });
      console.log(
        `[CA Ends in Pump Filter] Filtered ${beforeCount} tokens to ${filtered.length} tokens for caEndsInPump:`,
        filters.caEndsInPump,
      );
    }

    // Apply age filters
    if (filters.minAge || filters.maxAge) {
      const beforeCount = filtered.length;
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
      console.log(
        `[Age Filter] Filtered ${beforeCount} tokens to ${filtered.length} tokens for age range:`,
        filters.minAge,
        "-",
        filters.maxAge,
        filters.ageUnit,
      );
    }

    // Apply top 10 holders percent filter
    if (filters.top10HoldersPercent) {
      const beforeCount = filtered.length;
      const threshold = parseFloat(filters.top10HoldersPercent);
      filtered = filtered.filter((token) => {
        // This would need to be implemented based on actual holder data
        // For now, we'll skip this filter as we don't have holder data
        return true;
      });
      console.log(
        `[Top 10 Holders Filter] Filtered ${beforeCount} tokens to ${filtered.length} tokens for top10HoldersPercent:`,
        threshold,
      );
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
        const volume = (token as any).volume_24h ?? 0;
        return volume >= minVol;
      });
    }

    if (filters.maxVolume) {
      const maxVol = parseFloat(filters.maxVolume);
      filtered = filtered.filter((token) => {
        const volume = (token as any).volume_24h ?? 0;
        return volume <= maxVol;
      });
    }

    // Apply liquidity filters
    if (filters.minLiquidity) {
      const minLiq = parseFloat(filters.minLiquidity);
      filtered = filtered.filter((token) => {
        const liquidity = (token as any).total_liquidity_usd ?? 0;
        return liquidity >= minLiq;
      });
    }

    if (filters.maxLiquidity) {
      const maxLiq = parseFloat(filters.maxLiquidity);
      filtered = filtered.filter((token) => {
        const liquidity = (token as any).total_liquidity_usd ?? 0;
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

    // Apply unique wallets filters
    if (filters.holdersMin) {
      const minHolders = parseFloat(filters.holdersMin);
      filtered = filtered.filter((token) => {
        const holders = (token as any).unique_wallets_24h ?? 0;
        return holders >= minHolders;
      });
    }

    if (filters.holdersMax) {
      const maxHolders = parseFloat(filters.holdersMax);
      filtered = filtered.filter((token) => {
        const holders = (token as any).unique_wallets_24h ?? 0;
        return holders <= maxHolders;
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

        // Debug logging for first 3 tokens to verify token age (not migration time) is being used
        if (typeof window !== "undefined" && filtered.length > 0) {
          const aIdx = filtered.indexOf(a);
          const bIdx = filtered.indexOf(b);
          if (aIdx < 3 || bIdx < 3) {
            console.log(
              `[PulseTable ${title}] Migrated sorting by token age:`,
              {
                tokenA: {
                  name: a.name,
                  symbol: a.symbol,
                  ts: aTimestamp,
                  created_at: (a as any).created_at,
                  launch_time: (a as any).launch_time,
                  migrated_time: (a as any).migrated_time,
                },
                tokenB: {
                  name: b.name,
                  symbol: b.symbol,
                  ts: bTimestamp,
                  created_at: (b as any).created_at,
                  launch_time: (b as any).launch_time,
                  migrated_time: (b as any).migrated_time,
                },
                diff: bTimestamp - aTimestamp,
                result:
                  bTimestamp > aTimestamp
                    ? "B first (younger)"
                    : "A first (younger)",
              },
            );
          }
        }

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
          aValue =
            (a as any).fully_diluted_value ?? (a as any).market_cap_usd ?? 0;
          bValue =
            (b as any).fully_diluted_value ?? (b as any).market_cap_usd ?? 0;
          break;
        case "volume":
          aValue = (a as any).volume_24h ?? 0;
          bValue = (b as any).volume_24h ?? 0;
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

          // Debug logging for timestamp sorting
          if (
            typeof window !== "undefined" &&
            title.toLowerCase().includes("migrated") &&
            filtered.length > 0
          ) {
            // Log first 3 tokens to verify migrated_time is being used
            if (filtered.indexOf(a) < 3 || filtered.indexOf(b) < 3) {
              console.log(`[PulseTable] ${title} timestamp sorting:`, {
                tokenA: {
                  name: a.name,
                  symbol: a.symbol,
                  ts: aValue,
                  migrated_time: (a as any).migrated_time,
                  launch_time: (a as any).launch_time,
                },
                tokenB: {
                  name: b.name,
                  symbol: b.symbol,
                  ts: bValue,
                  migrated_time: (b as any).migrated_time,
                  launch_time: (b as any).launch_time,
                },
                diff: bValue - aValue,
                result: bValue > aValue ? "B first (newer)" : "A first (newer)",
              });
            }
          }
          break;
        }
        default:
          aValue =
            (a as any).fully_diluted_value ?? (a as any).market_cap_usd ?? 0;
          bValue =
            (b as any).fully_diluted_value ?? (b as any).market_cap_usd ?? 0;
      }

      if (filters.sortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  }, [
    tokens,
    filteredTokens,
    wsTokens,
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
    filters.hasWebsite,
    filters.hasTwitter,
    filters.hasTelegram,
    filters.atLeastOneSocial,
    filters.onlyPumpLive,
    filters.sortBy,
    filters.sortOrder,
  ]);

  // Memoize token rendering to prevent unnecessary re-renders
  const memoizedTokens = useMemo(() => {
    console.log(
      `[PulseTable ${title}] 🎬 memoizedTokens recomputed, count: ${filteredAndSortedTokens?.length || 0}, first 3:`,
      filteredAndSortedTokens
        ?.slice(0, 3)
        .map((t) => ({ name: t.name, symbol: t.symbol, mint: t.mint })),
    );
    return filteredAndSortedTokens;
  }, [filteredAndSortedTokens, title]);

  // Add wave animation for all Meteora tokens with bonding_pct > 98.6% in Final Stretch only
  useEffect(() => {
    const isFinalStretch =
      title.toLowerCase().includes("final") ||
      title.toLowerCase().includes("stretch");
    const newWaveTokens = new Set<number>();

    if (isFinalStretch) {
      // Add ALL Meteora tokens with high bonding (they're now sorted to the top)
      memoizedTokens.forEach((token, idx) => {
        const launchpadProtocol =
          (token as any).launchpad_protocol?.toLowerCase() || "";
        const isMeteora = launchpadProtocol.includes("meteora");
        const bondingPct = (token as any).bonding_pct ?? 0;

        if (isMeteora && bondingPct > 98.6) {
          newWaveTokens.add(idx);
          console.log(
            `[Wave Animation] Adding Meteora token ${token.symbol} (bonding: ${bondingPct}%)`,
          );
        }
      });
    }

    console.log(
      `[Wave Animation] Setting wave tokens for Final Stretch:`,
      Array.from(newWaveTokens),
    );
    setWaveTokens(newWaveTokens);
  }, [memoizedTokens, title]);

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

    const poolAddress =
      (token as any).migrated_pool_address ||
      token.pair_address ||
      (token as any).pool_address ||
      "";

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
          pairAddress:
            token.pair_address || (token as any).migrated_pool_address || "",
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

      if (response?.order?.id) {
        console.log("📡 Sniper order created:", response.order.id);
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
      let v: any =
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
        token?.launch_time ??
        token?.launchTime ??
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
      className={`num mx-1 flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl shadow-lg overflow-x-hidden`}
      style={{
        backgroundColor: "#111214",
      }}
    >
      <div
        className="group relative mb-2 flex items-center justify-between border-b p-2 text-lg font-bold"
        style={{
          backgroundColor: "transparent",
          borderColor: AX.border,
          color: AX.text,
        }}
        onMouseEnter={() => setIsHeaderHovered(true)}
        onMouseLeave={() => setIsHeaderHovered(false)}
      >
        {/* Left side container for title */}
        <div className="flex items-center gap-2 font-normal">
          <span className="ml-4 text-sm lg:text-lg">
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
        <div className="flex items-center gap-2">
          {/* Keyword Search Box */}
          <div
            className="hidden items-center gap-1 overflow-hidden rounded-md border px-1.5 sm:flex"
            style={{
              borderColor: AX.border,
              backgroundColor: "#272a2e",
              paddingTop: "4px",
              paddingBottom: "4px",
              minWidth: "120px",
              width: "120px",
              height: "24px",
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
              className="min-w-0 flex-1 border-none bg-transparent text-left text-xs font-medium placeholder-gray-500 outline-none"
              style={{ color: AX.text, width: "100%", maxWidth: "100%" }}
            />
          </div>

          {/* Thunder Icon and Amount Entry - Separate Thin Box */}
          <div
            className="hidden items-center justify-center gap-1 rounded-md border px-1.5 sm:flex"
            style={{
              borderColor: AX.border,
              backgroundColor: "#272a2e",
              paddingTop: "4px",
              paddingBottom: "4px",
              minWidth: "70px",
              width: "70px",
              height: "24px",
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
            className="relative hidden items-center justify-center gap-1 rounded-md border px-1.5 sm:flex"
            style={{
              borderColor: AX.border,
              backgroundColor: "#272a2e",
              paddingTop: "4px",
              paddingBottom: "4px",
              minWidth: "80px",
              width: "80px",
              height: "24px",
            }}
          >
            {["P1", "P2", "P3"].map((pill, i) => (
              <div
                key={pill}
                className="relative flex items-center justify-center"
              >
                <button
                  className={`flex cursor-pointer items-center justify-center rounded px-1 py-[2px] text-xs font-medium transition-all duration-200 ${
                    selectedPill === pill
                      ? "bg-[rgba(24,196,140,0.15)]"
                      : "bg-[rgba(22,23,28,0.6)]"
                  }`}
                  onClick={() => {
                    // Update local preset selection for this column only
                    setSelectedPill(pill);
                    console.log(`Selected ${pill} in ${title} column`);
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

                {i < 2 ? (
                  <div className="h-6 border-r-2 border-neutral-800"></div>
                ) : (
                  ""
                )}
              </div>
            ))}
          </div>

          {/* Filter Controls */}
          <div className="filter-dropdown relative">
            <button
              className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-all duration-300 ease-out"
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
              {filters.protocols.filter((p: string) => p !== "All").length >
                0 && (
                <span
                  className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-xs font-bold"
                  style={{ color: "#f0f5f5", fontSize: "10px", backgroundColor: "#31e3ac" }}
                >
                  {filters.protocols.filter((p: string) => p !== "All").length}
                </span>
              )}
            </button>

            {/* Comprehensive Filter Modal */}
            {showFilters && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-40"
                  style={{
                    backgroundColor: "rgba(0, 0, 0, 0.3)",
                  }}
                  onClick={() => setShowFilters(false)}
                />
                {/* Modal */}
                <div
                  className="filter-modal fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[95vw] max-w-[600px] -translate-x-1/2 -translate-y-1/2 transform overflow-y-auto rounded-lg border shadow-xl"
                  style={{
                    backgroundColor: AX.surface,
                    borderColor: AX.border,
                    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
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
                      <span className="text-sm">✕</span>
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
                    className="flex items-center justify-end border-b"
                    style={{ borderColor: AX.border }}
                  >
                    <button
                      className="mr-2 cursor-pointer rounded p-2 transition-colors hover:bg-gray-700"
                      onClick={() => {
                        // Reset all filters
                        setFilters({
                          protocols: [],
                          quoteTokens: [],
                          searchKeywords: "",
                          excludeKeywords: "",
                          dexPaid: false,
                          caEndsInPump: false,
                          minAge: "",
                          maxAge: "",
                          ageUnit: "m",
                          top10HoldersPercent: "",
                          devHoldingPercentMin: "",
                          devHoldingPercentMax: "",
                          snipersPercentMin: "",
                          snipersPercentMax: "",
                          insidersPercentMin: "",
                          insidersPercentMax: "",
                          bundlePercentMin: "",
                          bundlePercentMax: "",
                          holdersMin: "",
                          holdersMax: "",
                          proTradersMin: "",
                          proTradersMax: "",
                          devMigrationsMin: "",
                          devMigrationsMax: "",
                          devPairsCreatedMin: "",
                          devPairsCreatedMax: "",
                          minMarketCap: "",
                          maxMarketCap: "",
                          minVolume: "",
                          maxVolume: "",
                          minLiquidity: "",
                          maxLiquidity: "",
                          bCurvePercentMin: "",
                          bCurvePercentMax: "",
                          globalFeesPaidMin: "",
                          globalFeesPaidMax: "",
                          txnsMin: "",
                          txnsMax: "",
                          numBuysMin: "",
                          numBuysMax: "",
                          numSellsMin: "",
                          numSellsMax: "",
                          twitterFollowers: "",
                          telegramMembers: "",
                          discordMembers: "",
                          twitterReusesMin: "",
                          twitterReusesMax: "",
                          tweetAgeMin: "",
                          tweetAgeMax: "",
                          tweetAgeUnit: "m",
                          hasTwitter: false,
                          hasWebsite: false,
                          hasTelegram: false,
                          atLeastOneSocial: false,
                          onlyPumpLive: false,
                          sortBy: isNewPairs ? "timestamp" : "marketCap",
                          sortOrder: "desc",
                        });
                      }}
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

                        {/* Pro Traders */}
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
                              className="minimal-input flex-1 rounded px-2 py-1.5 text-sm"
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
                              className="minimal-input flex-1 rounded px-2 py-1.5 text-sm"
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
                                  );
                                  setFilters(importedFilters);
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
              </>
            )}
          </div>
        </div>
      </div>
      <div className="custom-scrollbar flex-1 overflow-y-scroll">
        {loading && tokens.length === 0 ? (
          Array.from({ length: skeletonRowCount }).map((_, idx) => (
            <div
              key={idx}
              className="flex animate-pulse flex-row items-start border-b p-2 last:border-b-0"
              style={{ borderColor: AX.border }}
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
          ))
        ) : tokens.length === 0 ? (
          <div className="py-8 text-center" style={{ color: AX.muted }}>
            No tokens found.
          </div>
        ) : (
          memoizedTokens
            .filter((token) => {
              // Show tokens that have either pair_address or mint (all tokens have mint)
              const pairAddress = (token as any)?.pair_address;
              const mint = (token as any)?.mint;
              return (
                (pairAddress && pairAddress.trim() !== "") ||
                (mint && mint.trim() !== "")
              );
            })
            .map((token, idx) => {
              // Use pair_address if available, otherwise fallback to mint
              const pairAddress =
                (token as any)?.pair_address || (token as any)?.mint;

              // Build query params for optimistic UI + cache lookup
              // Include chain parameter to preserve chain selection
              // Prefer chainProp from parent, fallback to router.query
              const currentChain = chainProp || (router.query.chain as string) || 'monad';
              const queryParams = new URLSearchParams({
                _name: (token as any)?.name || (token as any)?.symbol || "",
                _symbol: (token as any)?.symbol || "",
                _price: String(
                  (token as any)?.price_usd || (token as any)?.priceUsd || "",
                ),
                _mcap: String(
                  (token as any)?.market_cap_usd ||
                    (token as any)?.marketCapUSD ||
                    "",
                ),
                _image: extractTokenImage(token as any) || "",
                _mint: (token as any)?.mint || "", // CRITICAL: Required for cache lookup
                chain: currentChain, // Preserve chain selection
              }).toString();

              return (
                <Link
                  href={`/trade/${pairAddress}?${queryParams}`}
                  key={pairAddress}
                  className="group relative flex w-full cursor-pointer flex-row items-start gap-2 border-b px-6 py-2 transition-all duration-300 ease-out"
                  style={{
                    borderColor: AX.border,
                    backgroundColor: "transparent",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "rgba(107, 114, 128, 0.1)";

                    // Prefetch trade page for instant navigation
                    router.prefetch(`/trade/${pairAddress}?${queryParams}`);

                    // Cache token metadata for instant display
                    try {
                      const tokenMetadata = {
                        name: (token as any)?.name || "",
                        symbol: (token as any)?.symbol || "",
                        price_usd:
                          (token as any)?.price_usd ||
                          (token as any)?.priceUsd ||
                          0,
                        market_cap_usd:
                          (token as any)?.market_cap_usd ||
                          (token as any)?.marketCapUSD ||
                          0,
                        image: extractTokenImage(token as any) || "",
                        mint: (token as any)?.mint || "",
                        pair_address: pairAddress,
                        timestamp: Date.now(),
                      };
                      localStorage.setItem(
                        `token_metadata_${pairAddress}`,
                        JSON.stringify(tokenMetadata),
                      );
                      console.log(
                        `[PulseTable] Cached token metadata for ${pairAddress}`,
                      );
                    } catch (error) {
                      console.warn(
                        "[PulseTable] Failed to cache token metadata:",
                        error,
                      );
                    }

                    // Show and position the popup
                    const popup = e.currentTarget.querySelector(
                      ".status-popup",
                    ) as HTMLElement;
                    if (popup) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      popup.style.display = "block";
                      popup.style.left = `${rect.left + rect.width / 2}px`;
                      popup.style.top = `${rect.top - 30}px`;
                      popup.style.transform = "translateX(-50%)";
                    }
                    // Prefetch trade data on hover for instant navigation
                    // COMMENTED OUT: Testing without prefetch
                    // if (pairAddress) {
                    //   prefetchTradeData(pairAddress, pairAddress);
                    // }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                    // Hide the popup
                    const popup = e.currentTarget.querySelector(
                      ".status-popup",
                    ) as HTMLElement;
                    if (popup) {
                      popup.style.display = "none";
                    }
                  }}
                >
                  <div className="flex w-full flex-col gap-2">
                    <div className="flex w-full flex-row gap-2">
                      {/* Subtle wave animation for top 3 final stretch tokens */}
                      {waveTokens.has(idx) && (
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

                      {/* Status popout on hover */}
                      {(() => {
                        // Determine token status based on title and token data
                        const isNewPairs = title.toLowerCase().includes("new");
                        const isFinalStretch =
                          title.toLowerCase().includes("final") ||
                          title.toLowerCase().includes("stretch");
                        const isMigrated = title
                          .toLowerCase()
                          .includes("migrated");

                        // Get launchpad protocol
                        const launchpadProtocol =
                          (token as any).launchpad_protocol?.toLowerCase() ||
                          "";

                        return (
                          <span
                            className={`status-popup fixed hidden border px-2 py-1 text-xs shadow-none`}
                            style={{
                              pointerEvents: "none",
                              backgroundColor: AX.surface,
                              borderColor: AX.border,
                              color: AX.text,
                              zIndex: 99999,
                              left: "50%",
                              top: "100px",
                              transform: "translateX(-50%)",
                              borderRadius: "6px",
                              fontSize: "11px",
                              fontWeight: "500",
                            }}
                          >
                            {(() => {
                              if (isNewPairs) {
                                // Show bonding curve progress for tokens in new pairs
                                // bonding_pct is already in 0-100 range from backend (percentages)
                                const bondingProgress =
                                  typeof token.bonding_pct === "number"
                                    ? Math.round(token.bonding_pct)
                                    : Math.round(
                                        parseFloat(token.bonding_pct || "0"),
                                      );

                                return (
                                  <span style={{ color: AX.aiGreen }}>
                                    Bonding Curve: {bondingProgress}%
                                  </span>
                                );
                              } else if (isFinalStretch) {
                                // Show "Migrating" for final stretch tokens
                                return (
                                  <span style={{ color: AX.aiCyan }}>
                                    Migrating
                                  </span>
                                );
                              } else if (isMigrated) {
                                // Show protocol-specific text for migrated tokens
                                if (launchpadProtocol.includes("meteora")) {
                                  return (
                                    <span style={{ color: AX.aiBlue }}>
                                      Virtual Curve
                                    </span>
                                  );
                                } else if (launchpadProtocol.includes("pump")) {
                                  return (
                                    <span style={{ color: AX.aiBlue }}>
                                      PumpV1
                                    </span>
                                  );
                                } else if (
                                  launchpadProtocol.includes("bonk") ||
                                  launchpadProtocol.includes("raydium") ||
                                  launchpadProtocol.includes("launchlab")
                                ) {
                                  return (
                                    <span style={{ color: AX.aiBlue }}>
                                      LaunchLab
                                    </span>
                                  );
                                } else {
                                  // Fallback to "Migrated" for unknown protocols
                                  return (
                                    <span style={{ color: AX.aiBlue }}>
                                      Migrated
                                    </span>
                                  );
                                }
                              } else {
                                // Fallback to bonding curve progress
                                const bondingProgress =
                                  typeof token.bonding_curve_progress ===
                                  "number"
                                    ? Math.round(token.bonding_curve_progress)
                                    : Math.round(
                                        parseFloat(
                                          token.bonding_curve_progress || "0",
                                        ),
                                      );
                                return (
                                  <span style={{ color: AX.aiGreen }}>
                                    Bonding: {bondingProgress}%
                                  </span>
                                );
                              }
                            })()}
                          </span>
                        );
                      })()}
                      {/* Profile Picture & Address */}
                      <div
                        className="relative flex flex-shrink-0 flex-col items-center pt-1"
                        style={{
                          width: "81px",
                          minWidth: "81px",
                          maxWidth: "81px",
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
                        />
                        {/* Token Metrics */}
                        {/* <div className="absolute bottom-16 -right-49">
                    <TokenMetrics 
                      token={token} 
                      rank={idx + 1} 
                      totalTokens={memoizedTokens.length} 
                    />
                  </div> */}
                        {/* <span
                      className="mt-2 mb-1 max-w-[60px] truncate font-mono text-[9px] lg:max-w-[70px] lg:text-[10px]"
                      style={{ color: AX.muted }}
                    >
                      {shortAddr(token)}
                    </span> */}
                      </div>
                      {/* Main Info Section */}
                      <div className="flex w-full min-w-0 flex-col gap-1">
                        {/* Top Row */}
                        <div className="flex flex-row justify-between gap-2">
                          {/* Left: Token Info & Socials */}
                          <div className="flex min-w-0 flex-col">
                            <div className="flex min-w-0 items-center gap-2">
                              <span
                                className="flex-shrink-0 text-sm font-semibold lg:text-base"
                                style={{ color: AX.text }}
                              >
                                {token.symbol}
                              </span>
                              <span
                                className="truncate text-xs lg:text-sm"
                                style={{ color: AX.muted }}
                              >
                                {token.name}
                              </span>
                              <div className="relative ml-1">
                                <button
                                  className="transition-colors duration-200"
                                  style={{ color: AX.muted }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.color = AX.aiBlue;
                                    e.currentTarget.style.boxShadow = `0 0 6px ${AX.glowBlue}`;
                                    const tooltip = document.getElementById(
                                      `copy-tooltip-${idx}`,
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
                                      `copy-tooltip-${idx}`,
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
                            <div className="mt-1 flex items-center gap-1 text-xs lg:gap-2">
                              <span>{getAgeLabel(token)}</span>
                              {/* Socials */}
                              <div className="relative flex items-center gap-1 text-neutral-400 lg:gap-1">
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

                                {/* X Profile Preview Button */}
                                <div className="relative">
                                  <button
                                    className="flex items-center justify-center rounded transition-colors duration-200"
                                    onMouseEnter={(e) => {
                                      const tooltip = document.getElementById(
                                        `profile-tooltip-${idx}`,
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
                                        `profile-tooltip-${idx}`,
                                      ) as HTMLElement;
                                      if (tooltip) tooltip.style.opacity = "0";
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
                                      size={16}
                                      className="text-neutral-400"
                                    />
                                  </button>

                                  {/* Small X Profile Preview - positioned near token */}
                                  {showXPreview === idx && buttonPosition && (
                                    <div
                                      className="fixed"
                                      style={{
                                        left: `${buttonPosition.left}px`,
                                        top: `${buttonPosition.top - 300}px`,
                                        transform: "translate(-50%, 0)",
                                        width: "280px",
                                        zIndex: 999999,
                                      }}
                                      onMouseEnter={() => {
                                        // Keep popup open when hovering over it
                                      }}
                                      onMouseLeave={() => {
                                        // Hide popup when leaving the popup area
                                        setShowXPreview(null);
                                      }}
                                    >
                                      <div
                                        className="overflow-hidden rounded-xl"
                                        style={{
                                          backgroundColor: AX.surface,
                                          border: `1px solid ${AX.border}`,
                                          boxShadow: `0 12px 48px rgba(0, 0, 0, 0.5), 0 0 24px ${AX.glowBlue}`,
                                          backdropFilter: "blur(10px)",
                                        }}
                                      >
                                        {/* X Icon Header */}
                                        <div
                                          className="flex items-center justify-between border-b px-4 py-3"
                                          style={{ borderColor: "#2f3336" }}
                                        >
                                          <div className="flex items-center gap-3">
                                            <div
                                              className="flex h-7 w-7 items-center justify-center rounded-full"
                                              style={{
                                                backgroundColor: "#1d9bf0",
                                              }}
                                            >
                                              <svg
                                                width="16"
                                                height="16"
                                                viewBox="0 0 24 24"
                                                fill="currentColor"
                                                style={{ color: "#f0f5f5" }}
                                              >
                                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                              </svg>
                                            </div>
                                            <div>
                                              <div
                                                className="text-sm font-bold"
                                                style={{ color: "#f0f5f5" }}
                                              >
                                                X Profile
                                              </div>
                                              <div className="text-xs text-gray-400">
                                                Live Preview
                                              </div>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <div
                                              className="h-2 w-2 rounded-full"
                                              style={{
                                                backgroundColor: "#31e3ac",
                                              }}
                                            ></div>
                                            <span className="text-xs text-gray-400">
                                              Live
                                            </span>
                                          </div>
                                        </div>

                                        {/* Official X Profile Layout */}
                                        <div className="px-4 py-4">
                                          {/* Profile Picture */}
                                          <div className="mb-4 flex justify-center">
                                            <div
                                              className="h-20 w-20 overflow-hidden rounded-full"
                                              style={{
                                                backgroundColor: "#1a1a1a",
                                                border: `3px solid #2f3336`,
                                              }}
                                            >
                                              <img
                                                src={`https://ui-avatars.com/api/?name=${token.symbol || "Token"}&size=80&background=1a1a1a&color=ffffff&bold=true`}
                                                alt={`${token.symbol} profile`}
                                                className="h-full w-full object-cover"
                                                onError={(e) => {
                                                  const target =
                                                    e.target as HTMLImageElement;
                                                  target.style.display = "none";
                                                  const fallback =
                                                    target.nextElementSibling as HTMLElement;
                                                  if (fallback)
                                                    fallback.style.display =
                                                      "flex";
                                                }}
                                              />
                                              <div
                                                className="flex h-full w-full items-center justify-center text-xl font-bold"
                                                style={{
                                                  backgroundColor: "#1a1a1a",
                                                  color: "#f0f5f5",
                                                  display: "none",
                                                }}
                                              >
                                                {token.symbol?.slice(0, 2) ||
                                                  "??"}
                                              </div>
                                            </div>
                                          </div>

                                          {/* Profile Info */}
                                          <div className="mb-4 text-center">
                                            <div className="mb-1 flex items-center justify-center gap-2">
                                              <h3
                                                className="text-xl font-bold"
                                                style={{ color: "#f0f5f5" }}
                                              >
                                                {token.symbol || "Unknown"}
                                              </h3>
                                              {/* Verified Badge */}
                                              <div
                                                className="flex h-6 w-6 items-center justify-center rounded-full"
                                                style={{
                                                  backgroundColor: "#1d9bf0",
                                                }}
                                              >
                                                <svg
                                                  width="14"
                                                  height="14"
                                                  viewBox="0 0 24 24"
                                                  fill="none"
                                                  stroke="#f0f5f5"
                                                  strokeWidth="2"
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                >
                                                  <path d="M9 12l2 2 4-4" />
                                                  <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" />
                                                </svg>
                                              </div>
                                            </div>
                                            <p className="mb-3 text-sm text-gray-400">
                                              @
                                              {token.symbol?.toLowerCase() ||
                                                "unknown"}
                                            </p>
                                            <p
                                              className="px-2 text-sm leading-relaxed"
                                              style={{ color: "#f0f5f5" }}
                                            >
                                              {token.description ||
                                                `Official ${token.symbol || "token"} community. Join the conversation!`}
                                            </p>
                                          </div>

                                          {/* Follow Button */}
                                          <div className="mb-4 flex justify-center">
                                            <button
                                              className="rounded-full px-6 py-2 text-sm font-semibold transition-all duration-200"
                                              style={{
                                                backgroundColor: "#f0f5f5",
                                                color: "#000000",
                                              }}
                                              onMouseEnter={(e) => {
                                                e.currentTarget.style.backgroundColor =
                                                  "#e7e9ea";
                                              }}
                                              onMouseLeave={(e) => {
                                                e.currentTarget.style.backgroundColor =
                                                  "#f0f5f5";
                                              }}
                                            >
                                              Follow
                                            </button>
                                          </div>
                                        </div>

                                        {/* Join Date Section */}
                                        <div className="px-4 pb-3">
                                          <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
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
                                              <rect
                                                x="3"
                                                y="4"
                                                width="18"
                                                height="18"
                                                rx="2"
                                                ry="2"
                                              />
                                              <line
                                                x1="16"
                                                y1="2"
                                                x2="16"
                                                y2="6"
                                              />
                                              <line
                                                x1="8"
                                                y1="2"
                                                x2="8"
                                                y2="6"
                                              />
                                              <line
                                                x1="3"
                                                y1="10"
                                                x2="21"
                                                y2="10"
                                              />
                                            </svg>
                                            <span>
                                              Joined{" "}
                                              {new Date().toLocaleDateString(
                                                "en-US",
                                                {
                                                  month: "short",
                                                  year: "numeric",
                                                },
                                              )}
                                            </span>
                                          </div>
                                        </div>
                                        {/* Action Button */}
                                        <div className="px-4 pb-4">
                                          <button
                                            className="w-full rounded-full px-4 py-3 text-sm font-semibold transition-all duration-200"
                                            style={{
                                              backgroundColor: "#1d9bf0",
                                              color: "#ffffff",
                                              border: "1px solid #1d9bf0",
                                            }}
                                            onMouseEnter={(e) => {
                                              e.currentTarget.style.backgroundColor =
                                                "#1a8cd8";
                                              e.currentTarget.style.borderColor =
                                                "#1a8cd8";
                                            }}
                                            onMouseLeave={(e) => {
                                              e.currentTarget.style.backgroundColor =
                                                "#1d9bf0";
                                              e.currentTarget.style.borderColor =
                                                "#1d9bf0";
                                            }}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const profileUrl = `https://twitter.com/${token.symbol?.toLowerCase() || "search"}`;
                                              window.open(profileUrl, "_blank");
                                            }}
                                          >
                                            See profile on X
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {token.links && (
                                  <button>
                                    <PiTelegramLogo size={16} />
                                  </button>
                                )}

                                {token.links && (
                                  <button>
                                    <FiGlobe size={16} />
                                  </button>
                                )}

                                {/* Search on Twitter Button - show for all tokens */}
                                <button
                                  className="cursor-pointer transition-colors duration-200"
                                  style={{ color: AX.muted }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.color = AX.aiCyan;
                                    const tooltip = document.getElementById(
                                      `search-tooltip-${idx}`,
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
                                    const tooltip = document.getElementById(
                                      `search-tooltip-${idx}`,
                                    ) as HTMLElement;
                                    if (tooltip) tooltip.style.opacity = "0";
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault(); // Prevent Link navigation
                                    const searchQuery =
                                      `${token.symbol} ${token.name}`.trim();
                                    const twitterUrl = `https://twitter.com/search?q=${encodeURIComponent(searchQuery)}`;
                                    window.open(twitterUrl, "_blank");
                                  }}
                                >
                                  <LuSearch size={16} />
                                </button>

                                <div className="ml-1 flex flex-row gap-2 font-light">
                                  <div className="flex items-center gap-1">
                                    <PiCrownSimpleLight size={16} style={{ color: "#dcc13c" }} />
                                    <span className="text-sm text-white">
                                      0
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1 text-violet-200">
                                    <CiTrophy size={16} />
                                    <span className="text-sm text-white">
                                      0
                                    </span>
                                  </div>

                                  {/* People Icon - Total Holders */}
                                  <div className="relative flex items-center gap-1">
                                    <div
                                      className="flex cursor-help items-center justify-center rounded"
                                      title="Holders"
                                    >
                                      <GoPeople size={16} style={{ color: "#57ace9" }} />
                                    </div>
                                    <span className="text-sm text-white">
                                      {(() => {
                                        const holders =
                                          token.total_holders ||
                                          token.unique_wallets_24h ||
                                          0;
                                        if (holders >= 1e9)
                                          return `${(holders / 1e9).toFixed(1)}B`;
                                        if (holders >= 1e6)
                                          return `${(holders / 1e6).toFixed(1)}M`;
                                        if (holders >= 1e3)
                                          return `${(holders / 1e3).toFixed(1)}K`;
                                        return holders.toString();
                                      })()}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 text-violet-200">
                                    <PiRobotLight size={16} />
                                    <span className="text-sm text-white">
                                      0
                                    </span>
                                  </div>
                                </div>

                                {/* Pump.fun Tooltip */}
                                {token.mint?.slice(-4) === "pump" && (
                                  <div
                                    className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 transform rounded px-2 py-1 text-xs font-medium whitespace-nowrap opacity-0 transition-opacity duration-200"
                                    style={{
                                      zIndex: 99999,
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
                          </div>
                          {/* Right: MC, V, F, TX */}
                          <div className="items-right justify-right flex flex-col items-end gap-1 text-right">
                            <div
                              className={
                                "justify-right flex flex-row items-center gap-2 text-sm text-neutral-400 lg:text-sm"
                              }
                            >
                              <div className="flex flex-row items-center gap-1" style={{ color: AX.muted }}>
                                MC:{" "}
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
                                  const mcVal =
                                    (token as any).fully_diluted_value ??
                                    (token as any).market_cap_usd ??
                                    0;
                                  if (hasGreenWave) {
                                    return (
                                      <span className="number-font text-sm font-medium text-white lg:text-base">
                                        <SmoothNumber
                                          value={mcVal}
                                          formatter={(val) =>
                                            `${formatMarketCap(val)}`
                                          }
                                          duration={300}
                                          className="text-sm"
                                        />
                                      </span>
                                    );
                                  }
                                  return (
                                    <SmartColor
                                      token={token}
                                      metricType="marketCap"
                                      className="number-font flex flex-row items-center text-sm font-medium text-white lg:text-base"
                                    >
                                      <SmoothNumber
                                        value={mcVal}
                                        formatter={(val) =>
                                          `${formatMarketCap(val)}`
                                        }
                                        duration={300}
                                        className="text-sm"
                                      />
                                    </SmartColor>
                                  );
                                  /*  if (hasGreenWave) {
                               return (
                                 <span className="text-sm lg:text-base font-medium number-font text-white">
                                   <SmoothNumber value={mcVal} formatter={(val) => `$${formatMarketCap(val)}`} duration={300} />
                                 </span>
                               );
                             }
                             return (
                               <SmartColor token={token} metricType="marketCap" className="text-sm lg:text-base font-medium number-font text-white">
                                 <SmoothNumber value={mcVal} formatter={(val) => `$${formatMarketCap(val)}`} duration={300} />
                               </SmartColor>
                             ); */
                                })()}
                              </div>
                              <div style={{ color: AX.muted }} className="flex flex-row gap-1">
                                <span className="text-sm">V:</span>{" "}
                                <span
                                  className="number-font text-sm font-medium"
                                  style={{
                                    color: "#ffffff",
                                  }}
                                >
                                  <SmoothNumber
                                    value={(token as any).volume_24h || 0}
                                    formatter={(val) => {
                                      const rounded = Math.round(val);
                                      if (rounded >= 1e12)
                                        return `$${Math.round(rounded / 1e12)}T`;
                                      if (rounded >= 1e9)
                                        return `$${Math.round(rounded / 1e9)}B`;
                                      if (rounded >= 1e6)
                                        return `$${Math.round(rounded / 1e6)}M`;
                                      if (rounded >= 1e3)
                                        return `$${Math.round(rounded / 1e3)}K`;
                                      return `$${rounded}`;
                                    }}
                                    duration={300}
                                  />
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <div
                                  className="flex flex-row items-center gap-1"
                                  style={{ color: AX.muted }}
                                >
                                  <span className="text-sm">TX</span>{" "}
                                  <span
                                    className="number-font text-sm font-medium"
                                    style={{
                                      color: "#ffffff",
                                    }}
                                  >
                                    <SmoothNumber
                                      value={(() => {
                                        const buys = token.total_buys_24h ?? 0;
                                        const sells =
                                          token.total_sells_24h ?? 0;
                                        const total = buys + sells;
                                        // Debug logging
                                        if (
                                          token.symbol === "HEAVEN" ||
                                          total < 20
                                        ) {
                                          console.log(
                                            `[PulseTable TX] ${token.symbol}:`,
                                            {
                                              total_buys_24h:
                                                token.total_buys_24h,
                                              total_sells_24h:
                                                token.total_sells_24h,
                                              calculated: total,
                                              mint: token.mint,
                                            },
                                          );
                                        }
                                        return total;
                                      })()}
                                      duration={0}
                                    />
                                  </span>
                                  <div className="ml-1 flex h-0.5 w-8 overflow-hidden rounded-full bg-gray-700">
                                    <div
                                      className="h-full"
                                      style={{
                                        backgroundColor: "#31e3ac", // Green for buys
                                        width: `${(() => {
                                          const buys = token.total_buys_24h ?? 0;
                                          const sells = token.total_sells_24h ?? 0;
                                          const total = Math.max(1, buys + sells);
                                          const percent = (buys / total) * 100;
                                          return Math.min(100, Math.max(0, percent));
                                        })()}%`,
                                      }}
                                    ></div>
                                    <div
                                      className="h-full"
                                      style={{
                                        backgroundColor: "#d11f3a", // Red for sells
                                        width: `${(() => {
                                          const buys = token.total_buys_24h ?? 0;
                                          const sells = token.total_sells_24h ?? 0;
                                          const total = Math.max(1, buys + sells);
                                          const percent = (sells / total) * 100;
                                          return Math.min(100, Math.max(0, percent));
                                        })()}%`,
                                      }}
                                    ></div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <button
                              className="mt-2 border z-50 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm font-bold opacity-0 shadow-sm transition-all duration-200 ease-out group-hover:opacity-100"
                              style={{
                                backgroundColor: title.toLowerCase().includes("final") || title.toLowerCase().includes("stretch") ? "transparent" : "rgba(49, 227, 172, 0.1)",
                                borderColor: "#31e3ac",
                                color: "#31e3ac",
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
                              {(() => {
                                const isMigratedColumn = title
                                  .toLowerCase()
                                  .includes("migrated");

                                // For migrated column, always show regular thunder (no snipe icon)
                                if (isMigratedColumn) {
                                  return (
                                    <>
                                      <HiLightningBolt
                                        size={14}
                                        style={{ color: "#31e3ac" }}
                                      />{" "}
                                      <span className="number-font">
                                        {thunderAmount || "0"}
                                      </span>
                                      <span className="number-font"> SOL</span>
                                    </>
                                  );
                                }

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
                                  // Snipe icon (crosshair) rendered in green
                                  const isFinal =
                                    title.toLowerCase().includes("final") ||
                                    title.toLowerCase().includes("stretch");
                                  return (
                                    <>
                                      <svg
                                        width="18"
                                        height="18"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        style={{ color: AX.aiGreen }}
                                      >
                                        <circle cx="12" cy="12" r="7" />
                                        <line x1="12" y1="3" x2="12" y2="7" />
                                        <line x1="12" y1="17" x2="12" y2="21" />
                                        <line x1="3" y1="12" x2="7" y2="12" />
                                        <line x1="17" y1="12" x2="21" y2="12" />
                                        <circle cx="12" cy="12" r="2.2" />
                                      </svg>
                                      <span
                                        className="number-font"
                                        style={{
                                          color: isFinal
                                            ? AX.aiGreen
                                            : undefined,
                                        }}
                                      >
                                        {thunderAmount || "0"} SOL
                                      </span>
                                    </>
                                  );
                                } else {
                                  // Regular thunder for other tokens
                                  return (
                                    <>
                                      <HiLightningBolt
                                        size={14}
                                        style={{ color: "#31e3ac" }}
                                      />
                                      <span
                                        className="number-font"
                                        style={{
                                          color:
                                            title
                                              .toLowerCase()
                                              .includes("final") ||
                                            title
                                              .toLowerCase()
                                              .includes("stretch")
                                              ? AX.aiGreen
                                              : undefined,
                                        }}
                                      >
                                        {thunderAmount || "0"} SOL
                                      </span>
                                    </>
                                  );
                                }
                              })()}
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
                            <div className="absolute right-2 bottom-2 z-0 flex items-center gap-0.5">
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
                    <div className="flex flex-row items-center gap-1 overflow-x-scroll max-w-full">
                      <BottomCardInfoHolder
                        PassedIcon={FaRegUser}
                        value={0.2}
                        iconColor="#57ace9"
                      />
                      <BottomCardInfoHolder
                        PassedIcon={LuChefHat}
                        value={0.2}
                        iconColor="#4d96cc"
                      />
                      <BottomCardInfoHolder
                        PassedIcon={GiSeatedMouse}
                        value={(() => {
                          const val = (token as any).insider_held_percentage;
                          const num =
                            typeof val === "string"
                              ? parseFloat(val)
                              : (val ?? 0);
                          return isNaN(num) ? 0 : num;
                        })().toFixed(2)}
                        tooltip="Insider Holdings"
                        count={(token as any).insider_count ?? undefined}
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
                      <BottomCardInfoHolder
                        PassedIcon={PiFishSimpleLight}
                        value={0.2}
                      />
                      <BottomCardInfoHolder
                        PassedIcon={PiLeafLight}
                        value={0.2}
                      />
                      <BottomCardInfoHolder
                        PassedIcon={PiTarget}
                        value={(() => {
                          const val = (token as any).sniper_held_percentage;
                          const num =
                            typeof val === "string"
                              ? parseFloat(val)
                              : (val ?? 0);
                          return isNaN(num) ? 0 : num;
                        })().toFixed(2)}
                        green={false}
                        tooltip="Sniper Holdings"
                        count={(token as any).sniper_count ?? undefined}
                      />
                    </div>
                  </div>
                </Link>
              );
            })
        )}
      </div>
      {/* Fixed positioned tooltips */}
      {memoizedTokens.map((token, idx) => (
        <>
          <div
            key={`copy-tooltip-${idx}`}
            id={`copy-tooltip-${idx}`}
            className="pointer-events-none fixed rounded px-2 py-1 text-xs font-medium whitespace-nowrap opacity-0 transition-opacity duration-200"
            style={{
              zIndex: 99999,
              backgroundColor: AX.surface,
              color: AX.text,
              border: `1px solid ${AX.border}`,
              boxShadow: `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 0 8px ${AX.glowBlue}`,
              transform: "translate(-50%, -100%)",
            }}
          >
            Copy Contract
            {/* Tooltip arrow */}
            <div
              className="absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 transform border-t-4 border-r-4 border-l-4 border-transparent"
              style={{ borderTopColor: AX.surface }}
            ></div>
          </div>

          <div
            key={`search-tooltip-${idx}`}
            id={`search-tooltip-${idx}`}
            className="pointer-events-none fixed rounded px-2 py-1 text-xs font-medium whitespace-nowrap opacity-0 transition-opacity duration-200"
            style={{
              zIndex: 99999,
              backgroundColor: AX.surface,
              color: AX.text,
              border: `1px solid ${AX.border}`,
              boxShadow: `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 0 8px ${AX.glowCyan}`,
              transform: "translate(-50%, -100%)",
            }}
          >
            Search on Twitter
            {/* Tooltip arrow */}
            <div
              className="absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 transform border-t-4 border-r-4 border-l-4 border-transparent"
              style={{ borderTopColor: AX.surface }}
            ></div>
          </div>

          <div
            key={`profile-tooltip-${idx}`}
            id={`profile-tooltip-${idx}`}
            className="pointer-events-none fixed rounded px-2 py-1 text-xs font-medium whitespace-nowrap opacity-0 transition-opacity duration-200"
            style={{
              zIndex: 99999,
              backgroundColor: AX.surface,
              color: AX.text,
              border: `1px solid ${AX.border}`,
              boxShadow: `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 0 8px ${AX.glowBlue}`,
              transform: "translate(-50%, -100%)",
            }}
          >
            View X Profile
            {/* Tooltip arrow */}
            <div
              className="absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 transform border-t-4 border-r-4 border-l-4 border-transparent"
              style={{ borderTopColor: AX.surface }}
            ></div>
          </div>
        </>
      ))}
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
                e.currentTarget.style.boxShadow = "0 0 0 2px rgba(49, 227, 172, 0.5)";
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
