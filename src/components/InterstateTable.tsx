import React, {
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import {
  FaQuestionCircle,
  FaRegStar,
  FaStar,
  FaUsers,
  FaTelegram,
} from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import { User, Globe, Search, Copy } from "lucide-react";
import { HiLightningBolt } from "react-icons/hi";
import { BsPersonGear } from "react-icons/bs";
import { RiGhostLine } from "react-icons/ri";
import { GoStack } from "react-icons/go";
import { FiGlobe } from "react-icons/fi";
import { LuPill } from "react-icons/lu";
import InterstateButton from "./InterstateButton";
import Image from "next/image";
import InterstateTooltip from "./InterstateTooltip";
import CustomCheckbox from "./CustomCheckbox";
import { useRouter } from "next/router";
import { useWatchlist } from "./WatchlistContext";
import { showEnhancedToast } from "~/utils/enhancedToast";
import { SolanaIcon } from "./Footer";
import type { Token as BaseToken } from "~/utils/db";
import {
  formatSmartNumber,
  formatMarketCap,
  formatLamportsToSol,
} from "~/utils/db";
import SkeletonRow from "./InterstateTable/SkeletonRow";
import { fetchTokenMetadata } from "~/utils/functions";

import { preloadTradeChart } from "~/utils/preloadTradeChart";
import {
  withImageFallback,
  extractMetaImage,
  isMetadataUrl,
} from "~/utils/images";
import { computeHashImageUrl } from "~/utils/imageHash";
import AvatarImage from "~/components/AvatarImage";
import { useFilter } from "./FilterContext";
import { getAmm } from "~/utils/amms";
import { copyToClipboard } from "~/utils/clipboard";

const isDev = process.env.NODE_ENV !== "production";

/* ---- JTX-style Dark Palette ---- */
const AX = {
  // Deep void backgrounds
  bg: "#030304",
  bgDeep: "#050608",
  surface: "#08090c",
  surface2: "#0c0e12",
  surfaceHover: "#10131a",
  card: "#141720",

  // Borders
  border: "rgba(255,255,255,0.06)",
  borderHover: "rgba(255,255,255,0.10)",
  borderStrong: "rgba(255,255,255,0.14)",

  // Text hierarchy
  text: "#f4f4f5",
  textSecondary: "#a1a1aa",
  muted: "#71717a",
  textDim: "#52525b",

  // Accent colors - Emerald/Mint
  mint: "#18c48c",
  mintBright: "#22d99a",
  mintHover: "#14a877",
  mintGlow: "rgba(24, 196, 140, 0.15)",
  mintGlowStrong: "rgba(24, 196, 140, 0.25)",

  // Status colors
  success: "#22c55e",
  sell: "#ef4444",
  danger: "#ef4444",
  warning: "#f59e0b",

  // Legacy compatibility
  aiBlue: "#18c48c",
  aiBlueHover: "#14a877",
  aiGreen: "#22c55e",
  aiGreenHover: "#16a34a",
  aiCyan: "#06b6d4",
  aiCyanHover: "#0891b2",
  glowBlue: "rgba(24, 196, 140, 0.2)",
  glowGreen: "rgba(34, 197, 94, 0.2)",
  glowCyan: "rgba(6, 182, 212, 0.2)",
};

// Types
type Token = BaseToken & { dexPaid?: boolean; amm?: string };

export interface InterstateTableRow {
  token: Token;
  i: number;
}

interface InterstateTableProps {
  rows: InterstateTableRow[];
  onQuickBuy?: (token: Token) => void;
  sortKey?: string;
  sortDirection?: "asc" | "desc";
  setSort?: (key: string) => void;
  selectedTimeframe: "5m" | "1h" | "6h" | "24h";
  quickBuyAmount?: number | string;
  skeletonRowCount?: number;
  isDiscoverPage?: boolean;
  chain?: string; // 'sol' | 'monad' - chain identifier
  tableType?: "trending" | "newPairs" | "xStocks" | "dexscreener"; // Section type for different column displays
  solPrice?: number; // SOL/USD price for converting pulse volume (SOL) to USD
}

interface HeaderConfig {
  key: string | null;
  label: string;
  align: "left" | "right" | "center";
  width: string;
}

// Constants
const TABLE_HEADERS: HeaderConfig[] = [
  { key: "name", label: "Pair Info", align: "left", width: "w-64" },
  { key: null, label: "24h", align: "center", width: "w-32" }, // Mini sparkline
  {
    key: "fully_diluted_value",
    label: "Market Cap",
    align: "right",
    width: "w-32",
  },
  {
    key: "total_liquidity_usd",
    label: "Liquidity",
    align: "right",
    width: "w-28",
  },
  { key: "volume", label: "Volume", align: "right", width: "w-28" },
  // TXNS centered because the buys/sells data is much wider than the label
  // (Irfan's prod change in #793). Trending uses TRENDING_TABLE_HEADERS below.
  { key: "txns", label: "TXNS", align: "center", width: "w-24" },
  // { key: 'total_fees_lamports', label: 'Gas Fees', align: 'right', width: 'w-28' },
  { key: null, label: "Token Info", align: "center", width: "w-40" },
  { key: null, label: "Quick Buy", align: "center", width: "w-32" },
];

// Trending-only headers. Wider Token + Holders columns so long symbols don't
// truncate (CZGOBLINS) and 5 holder-metric chips fit on one row. TXNS gets
// breathing room so its buy/sell numbers stop visually colliding with Volume.
const TRENDING_TABLE_HEADERS: HeaderConfig[] = [
  { key: "name", label: "Token", align: "left", width: "w-72" },
  { key: null, label: "24h", align: "center", width: "w-28" },
  {
    key: "fully_diluted_value",
    label: "Market Cap",
    align: "right",
    width: "w-28",
  },
  {
    key: "total_liquidity_usd",
    label: "Liquidity",
    align: "right",
    width: "w-28",
  },
  { key: "volume", label: "Volume", align: "right", width: "w-28" },
  // TXNS data is "buys / sells" — much wider than the 4-letter label, so
  // right-aligning the header parks it in the corner while the data extends
  // visually leftward. Centering the header puts it over the data's visual
  // middle so they read as belonging together.
  { key: "txns", label: "TXNS", align: "center", width: "w-32" },
  { key: null, label: "Holders", align: "center", width: "w-64" },
  { key: null, label: "Buy", align: "center", width: "w-28" },
];

// Sniper Icon component
const SnipperIcon = ({
  size = 16,
  ...props
}: {
  size?: number;
  [key: string]: any;
}) => (
  <svg
    {...props}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <circle cx="12" cy="12" r="2" />
    <circle
      cx="12"
      cy="12"
      r="5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <circle
      cx="12"
      cy="12"
      r="9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <line
      x1="12"
      y1="2"
      x2="12"
      y2="5"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <line
      x1="12"
      y1="19"
      x2="12"
      y2="22"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <line
      x1="2"
      y1="12"
      x2="5"
      y2="12"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <line
      x1="19"
      y1="12"
      x2="22"
      y2="12"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  </svg>
);

const TIME_LABELS = ["2h", "1d", "3d", "1h", "6h"];

// Utility Functions
const getTokenStat = (
  token: Token,
  stat: string,
  timeframe: string,
): number => {
  const key = `${stat}_${timeframe}`;
  let val = (token as any)[key];

  // Fallbacks for alternate backend naming (price_change_* instead of price_percent_change_*)
  if ((val === undefined || val === null) && stat === "price_percent_change") {
    const altKey = `price_change_${timeframe}`;
    val = (token as any)[altKey];
  }

  const num = typeof val === "number" ? val : parseFloat(val) || 0;

  // if (num === 0) {
  //   console.log('getTokenStat returning 0:', {
  //     stat,
  //     timeframe,
  //     key,
  //     rawValue: val,
  //     rawValueType: typeof val,
  //     tokenName: token.name
  //   });
  // }

  return num;
};

// Fallback helpers to accommodate different backend shapes
const getNumber = (obj: any, key: string): number => {
  const v = obj?.[key];
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }
  return 0;
};

const getVolume = (
  token: Token,
  timeframe: string,
  solPrice: number = 0,
): number => {
  // Backend ships SOL in `volume_{tf}` for the timeframe that ranks the
  // trending list a token belongs to — same source as /v1/ws/token/{mint}
  // (Trade page volume + OHLC chart). Multiply by live Pyth SOL/USD to
  // render USD identical to the Trade page header. Trending only supports
  // 5m / 1h / 6h timeframes.
  if (!Number.isFinite(solPrice) || solPrice <= 0) return 0;
  const sol = getNumber(token as any, `volume_${timeframe}`);
  return sol * solPrice;
};

// PulseTable-style volume for new pairs: try all timeframes (24h→6h→1h→5m),
// sum buy+sell volumes, multiply by solPrice to convert SOL→USD
const getNewPairVolume = (token: Token, solPrice: number): number => {
  for (const tf of ["24h", "6h", "1h", "5m"]) {
    const bv = getNumber(token as any, `total_buy_volume_${tf}`);
    const sv = getNumber(token as any, `total_sell_volume_${tf}`);
    const sum = bv + sv;
    if (sum > 0) return sum * solPrice;
  }
  // Fallback: try pre-computed volume fields
  for (const tf of ["24h", "6h", "1h", "5m"]) {
    const vol = getNumber(token as any, `volume_${tf}`);
    if (vol > 0) return vol;
  }
  return 0;
};

const getTxns = (
  token: Token,
  timeframe: string,
): { total: number; buys: number; sells: number } => {
  // Try every known field-name variant the backend has used for this timeframe.
  // Field names have shifted over time (total_buys_*, buys_*, buyCount*, total_buyers_*),
  // so we read from each so the Txns column populates regardless of source.
  const codexBuyKey =
    timeframe === "1h"
      ? "buyCount1"
      : timeframe === "6h"
        ? "buyCount6"
        : timeframe === "24h"
          ? "buyCount24"
          : timeframe === "5m"
            ? "buyCount5m"
            : "";
  const codexSellKey =
    timeframe === "1h"
      ? "sellCount1"
      : timeframe === "6h"
        ? "sellCount6"
        : timeframe === "24h"
          ? "sellCount24"
          : timeframe === "5m"
            ? "sellCount5m"
            : "";
  let buys =
    getNumber(token as any, `total_buys_${timeframe}`) ||
    getNumber(token as any, `buys_${timeframe}`) ||
    (codexBuyKey ? getNumber(token as any, codexBuyKey) : 0) ||
    getNumber(token as any, `total_buyers_${timeframe}`);
  let sells =
    getNumber(token as any, `total_sells_${timeframe}`) ||
    getNumber(token as any, `sells_${timeframe}`) ||
    (codexSellKey ? getNumber(token as any, codexSellKey) : 0) ||
    getNumber(token as any, `total_sellers_${timeframe}`);

  if (buys > 0 || sells > 0) {
    return { total: buys + sells, buys, sells };
  }

  // Fallback 1: try txnCount for the specific timeframe (split proportionally)
  const txnCount = getNumber(token as any, `txnCount${timeframe}`);
  if (txnCount > 0) {
    // Estimate: 60% buys, 40% sells (common pattern)
    const estimatedBuys = Math.round(txnCount * 0.6);
    const estimatedSells = Math.round(txnCount * 0.4);
    return { total: txnCount, buys: estimatedBuys, sells: estimatedSells };
  }

  // Fallback 2: try 24h data if specific timeframe doesn't have data
  if (timeframe !== "24h") {
    const buys24h = getNumber(token as any, "total_buys_24h");
    const sells24h = getNumber(token as any, "total_sells_24h");
    if (buys24h > 0 || sells24h > 0) {
      return { total: buys24h + sells24h, buys: buys24h, sells: sells24h };
    }

    // Also try txnCount24h as fallback
    const txnCount24h =
      getNumber(token as any, "txnCount24h") ||
      getNumber(token as any, "txnCount24");
    if (txnCount24h > 0) {
      const estimatedBuys = Math.round(txnCount24h * 0.6);
      const estimatedSells = Math.round(txnCount24h * 0.4);
      return { total: txnCount24h, buys: estimatedBuys, sells: estimatedSells };
    }
  }

  // Fallback 3: try other timeframes in order of preference (24h, 12h, 6h, 1h, 5m)
  const fallbackTimeframes = ["24h", "12h", "6h", "1h", "5m"].filter(
    (tf) => tf !== timeframe,
  );
  for (const tf of fallbackTimeframes) {
    const fallbackBuys = getNumber(token as any, `total_buys_${tf}`);
    const fallbackSells = getNumber(token as any, `total_sells_${tf}`);
    if (fallbackBuys > 0 || fallbackSells > 0) {
      return {
        total: fallbackBuys + fallbackSells,
        buys: fallbackBuys,
        sells: fallbackSells,
      };
    }

    // Also try txnCount for this timeframe
    const fallbackTxnCount = getNumber(token as any, `txnCount${tf}`);
    if (fallbackTxnCount > 0) {
      const estimatedBuys = Math.round(fallbackTxnCount * 0.6);
      const estimatedSells = Math.round(fallbackTxnCount * 0.4);
      return {
        total: fallbackTxnCount,
        buys: estimatedBuys,
        sells: estimatedSells,
      };
    }
  }

  // If no data available, return zeros; UI will render "-" appropriately
  return { total: 0, buys: 0, sells: 0 };
};

const formatPercentChange = (val: number): string => {
  if (val === 0) return "0.00";
  return (val > 0 ? "+" : "") + formatSmartNumber(Math.abs(val));
};

const getSortableValue = (
  token: Token,
  key: string,
  selectedTimeframe?: string,
  solPrice: number = 0,
): number => {
  // Handle volume calculation for sorting
  if (key === "volume" && selectedTimeframe) {
    return getVolume(token, selectedTimeframe, solPrice);
  }

  // Handle TXNS calculation for sorting
  if (key === "txns" && selectedTimeframe) {
    const buys = getTokenStat(token, "total_buys", selectedTimeframe);
    const sells = getTokenStat(token, "total_sells", selectedTimeframe);
    return buys + sells;
  }

  // Handle Price % sorting based on the currently-selected timeframe
  if (key === "price_percent_change" && selectedTimeframe) {
    return getTokenStat(token, "price_percent_change", selectedTimeframe);
  }

  // Handle timestamp sorting for New Pairs (newest first)
  if (key === "timestamp") {
    const v =
      (token as any).created_at ??
      (token as any).launch_time ??
      (token as any).firstSeen ??
      (token as any).pair_created_at ??
      (token as any).timestamp ??
      (token as any).ts;
    if (!v) return 0;
    const n =
      typeof v === "number"
        ? v
        : typeof v === "string"
          ? Number(v) || Date.parse(v) || 0
          : 0;
    // Normalize: if seconds (< 1e12), convert to ms
    return n > 1e12 ? n : n > 1e9 ? n * 1000 : 0;
  }

  // Handle Market Cap sorting - use fully_diluted_value if available, otherwise fallback to usd_price
  if (key === "fully_diluted_value") {
    let val = (token as any).fully_diluted_value;
    if (val === undefined || val === null) {
      val = token.usd_price; // fallback to price if market cap not available
    }
    if (typeof val === "string") {
      val = val.replace(/[$,\s]/g, "");
    }
    const num = parseFloat(val);
    return isNaN(num) ? -Infinity : num;
  }

  let val = (token as any)[key];
  if (typeof val === "string") {
    val = val.replace(/[$,\s]/g, "");
  }
  const num = parseFloat(val);
  return isNaN(num) ? -Infinity : num;
};

// Token Metadata Hook
const tokenMetadataCache: Record<string, any> = {};

function useTokenMetadata(uri?: string) {
  const [meta, setMeta] = useState<any | null>(() =>
    uri ? tokenMetadataCache[uri] || null : null,
  );
  const [loading, setLoading] = useState(() =>
    uri ? !tokenMetadataCache[uri] : false,
  );
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
    fetchTokenMetadata(uri)
      .then((data) => {
        if (!cancelled) {
          if (data) tokenMetadataCache[uri] = data;
          setMeta(data);
          setLoading(false);
        }
      })
      .catch((error) => {
        // Silently handle errors to prevent runtime crashes
        console.warn("Failed to fetch token metadata:", error.message);
        if (!cancelled) {
          setLoading(false);
          setMeta(null);
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [uri]);

  return { meta, loading, showInitial };
}

// Helper to extract Twitter handle from URL
function extractTwitterHandle(url: string): string | null {
  if (!url) return null;
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

// Helper to extract social links from token metadata
interface SocialLinks {
  twitter?: string;
  website?: string;
  telegram?: string;
}

function extractSocialLinks(token: Token, meta: any): SocialLinks {
  const links: SocialLinks = {};

  // Try to get links from metadata extensions first (most common format)
  if (meta?.extensions) {
    if (meta.extensions.twitter) links.twitter = meta.extensions.twitter;
    if (meta.extensions.website || meta.extensions.homepage) {
      links.website = meta.extensions.website || meta.extensions.homepage;
    }
    if (meta.extensions.telegram) links.telegram = meta.extensions.telegram;
  }

  // Also try top-level metadata fields
  if (meta) {
    if (meta.twitter && !links.twitter) links.twitter = meta.twitter;
    if (meta.website && !links.website) links.website = meta.website;
    if (meta.telegram && !links.telegram) links.telegram = meta.telegram;
    if (meta.external_url && !links.website) links.website = meta.external_url;
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

  // Filter out empty strings
  if (links.twitter === "" || links.twitter === null) delete links.twitter;
  if (links.website === "" || links.website === null) delete links.website;
  if (links.telegram === "" || links.telegram === null) delete links.telegram;

  return links;
}

// Table Header Component
const TableHeader: React.FC<{
  sortKey?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (key: string) => void;
  isDiscoverPage?: boolean;
  tableType?: "trending" | "newPairs" | "xStocks" | "dexscreener";
  selectedTimeframe?: string;
}> = ({
  sortKey,
  sortDirection,
  onSort,
  isDiscoverPage = false,
  tableType = "trending",
  selectedTimeframe = "24h",
}) => {
  const isTrending = tableType === "trending";
  const headers = isTrending ? TRENDING_TABLE_HEADERS : TABLE_HEADERS;

  return (
    <thead>
      <tr
        style={{
          backgroundColor: "transparent",
          borderBottom: `1px solid ${AX.border}`,
        }}
      >
        {headers.map((header, idx) => {
          let label = header.label;
          // For trending and dexscreener, the sparkline column tracks the
          // user-selected timeframe — surface that in the header so the chart
          // and label stay in sync (5M / 1H / 6H / 24H).
          if (
            (isTrending || tableType === "dexscreener") &&
            header.label === "24h"
          ) {
            label = (selectedTimeframe || "24h").toUpperCase();
          }
          // Hide 24h sparkline column for newPairs only. DexScreener shows
          // the chart (axiom-style) — sparkline tracks selectedTimeframe via
          // the same MiniSparkline as Trending uses.
          if (header.label === "24h" && tableType === "newPairs") {
            return null;
          }
          // Hide Token Info / Holders column for newPairs and dexscreener
          if (
            (header.label === "Token Info" || header.label === "Holders") &&
            (tableType === "newPairs" || tableType === "dexscreener")
          ) {
            return null;
          }
          // Hide Volume column for newPairs (WS volume data not yet wired to display)
          if (header.label === "Volume" && tableType === "newPairs") {
            return null;
          }
          // TXNS column is now shown on every table type. DexScreener tokens
          // carry total_buys_<tf> / total_sells_<tf> from the upstream payload.
          const hideOnNarrow =
            header.label === "Token Info" || header.label === "Holders";

          // Trending headers: bigger, more legible, label nudged off the column
          // edge so it sits over the data centroid (avatar + symbol/name) instead
          // of floating above the avatar alone.
          const trendingPaddingLeft =
            header.label === "Token" ? "pl-[60px]" : "";
          const trendingClasses = isTrending
            ? `text-[12px] font-semibold tracking-[0.06em] ${trendingPaddingLeft}`
            : `${isDiscoverPage ? "text-[10px]" : "text-xs"} font-medium tracking-wide`;
          const trendingColor = isTrending ? "#a8acc4" : "#787a8d";
          const trendingFontWeight = isTrending ? "600" : "300";

          return (
            <th
              key={idx}
              className={`${header.width} ${isTrending ? "whitespace-nowrap" : ""} px-4 py-3 text-${header.align} ${trendingClasses} uppercase ${
                header.key
                  ? "cursor-pointer transition-opacity hover:opacity-80"
                  : ""
              } ${hideOnNarrow ? "hidden xl:table-cell" : ""}`}
              style={{ color: trendingColor, fontWeight: trendingFontWeight }}
              onClick={
                header.key && onSort ? () => onSort(header.key!) : undefined
              }
            >
              {label}
              {header.key && sortKey === header.key && (
                <span className="ml-1">
                  {sortDirection === "asc" ? "▲" : "▼"}
                </span>
              )}
            </th>
          );
        })}
      </tr>
    </thead>
  );
};

// Monad Icon Component - uses Monad favicon
const MonadIcon = ({ size = 16 }: { size?: number }) => (
  <img
    src="https://monad.xyz/favicon.ico"
    alt="Monad"
    width={size}
    height={size}
    style={{ width: size, height: size, objectFit: "contain" }}
    className="rounded-full"
  />
);

// Module-level cache: mint → resolved proxy image URL (survives unmount/remount)
const resolvedImageCache: Record<string, string> = {};
// Per-mint cache of the URL whose image has been successfully loaded by the
// browser. Once an image has loaded for a mint, we render that exact URL for
// the rest of the page session with no re-preload and no re-fade, even if
// imgSrc later recomputes to a different value (metadata change, imgError
// flicker, etc.). Loaded images stay visually constant. Module-level so the
// cache survives unmount/remount of any specific TableRow.
const loadedAvatarCache = new Map<string, string>();

// Token Avatar Component
const TokenAvatar: React.FC<{
  token: Token;
  meta: any;
  loading: boolean;
  showInitial: boolean;
  chain?: string; // 'sol' | 'monad' - chain identifier
}> = ({ token, meta, loading, showInitial, chain = "sol" }) => {
  const initial = token.name?.charAt(0)?.toUpperCase() || "?";
  const [imgError, setImgError] = useState(false);
  // visibleSrc holds the URL we know is fully loaded and safe to render.
  // We never put a fetching URL into the live <img> — that's what causes the
  // blank-flash flicker (browser blanks the element on src change). Preloading
  // via `new Image()` first means the swap is from one fully-loaded image to
  // another, with the placeholder visible underneath the whole time.
  // mintKey for the persistent loaded-image cache lookup.
  const cachedAvatarMint = (token.mint ||
    (token as any).mint_address ||
    "") as string;
  // If this mint's image already loaded earlier, hydrate visibleSrc synchronously
  // so the FIRST render shows the cached URL with no preload and no fade.
  const [visibleSrc, setVisibleSrc] = useState<string>(() =>
    cachedAvatarMint ? loadedAvatarCache.get(cachedAvatarMint) || "" : "",
  );
  // Capture at mount time: was this mint's image already in the cache BEFORE we
  // mounted? If yes, render without the fade for the entire lifetime of this
  // mount (instant). If no, render with fade until unmount  the fade plays
  // exactly once when the <img> first appears, and never re-plays on subsequent
  // re-renders of the same mount because className stays stable.
  const skipFadeRef = useRef<boolean>(
    cachedAvatarMint ? loadedAvatarCache.has(cachedAvatarMint) : false,
  );

  // Get protocol color - matches PulseTable/SearchModal for consistency
  const getProtocolColor = (token: Token): string => {
    const launchpadProtocol =
      (token as any).launchpad_protocol?.toLowerCase() || "";
    const mintAddress = (
      token.mint ||
      (token as any).mint_address ||
      ""
    ).toLowerCase();

    // Monad chain → purple
    if (chain === "monad") return "#c084fc";
    // bags mint override → green
    if (mintAddress.includes("bags")) return "#31e3ac";
    if (!launchpadProtocol) return "#31e3ac";

    if (launchpadProtocol.includes("meteora")) return "#d11f3a";
    if (
      launchpadProtocol.includes("pumpswap") ||
      launchpadProtocol === "pump_amm" ||
      launchpadProtocol === "pumpamm"
    )
      return "#eab308";
    if (launchpadProtocol.includes("pump")) return "#31e3ac";
    if (launchpadProtocol.includes("launch")) return "#3b82f6";
    if (launchpadProtocol.includes("raydium")) return "#31e3ac";
    if (
      launchpadProtocol.includes("moonit") ||
      launchpadProtocol.includes("moonshot") ||
      launchpadProtocol.includes("moonshoot")
    )
      return "#eab308";
    if (launchpadProtocol.includes("boop")) return "#134577";
    if (launchpadProtocol.includes("bonk") || mintAddress.endsWith("bonk"))
      return "#ff6b35";
    if (launchpadProtocol.includes("bags")) return "#31e3ac";

    return "#31e3ac";
  };

  // Get protocol icon - matches PulseTable/SearchModal for consistency
  const getTokenIcon = (token: Token): string => {
    const launchpadProtocol =
      (token as any).launchpad_protocol?.toLowerCase() || "";
    const mintAddress = (
      token.mint ||
      (token as any).mint_address ||
      ""
    ).toLowerCase();

    // Monad chain → protocol-specific Monad icons
    if (chain === "monad") {
      if (
        launchpadProtocol.includes("nad.fun") ||
        launchpadProtocol === "nadfun"
      )
        return "https://avatars.githubusercontent.com/u/173274001?s=200&v=4";
      if (
        launchpadProtocol.includes("flap.sh") ||
        launchpadProtocol.includes("flapsh")
      )
        return "https://media.licdn.com/dms/image/v2/D4D0BAQFG5I0EDOrmJQ/company-logo_200_200/company-logo_200_200/0/1714693191952/flap_sh_logo?e=2147483647&v=beta&t=2kcdij2YPOFjLdPYzAhQxKgbGcuyh7Cdyp0AkGR8V6A";
      if (launchpadProtocol.includes("kuru"))
        return "https://pbs.twimg.com/profile_images/1950962142917619714/R7Cj_qk7_400x400.jpg";
      return "https://avatars.githubusercontent.com/u/173274001?s=200&v=4";
    }

    // bags mint override
    if (mintAddress.includes("bags"))
      return "https://bags.fm/assets/images/bags-icon.png";
    if (!launchpadProtocol) return "https://pump.fun/pump-logomark.svg";

    if (launchpadProtocol.includes("pump"))
      return "https://pump.fun/pump-logomark.svg";
    if (launchpadProtocol.includes("meteora"))
      return "https://s1.coincarp.com/logo/1/meteora.png?style=72&v=1759911013";
    if (launchpadProtocol.includes("raydium"))
      return "https://s2.coinmarketcap.com/static/img/coins/64x64/8526.png";
    if (launchpadProtocol.includes("boop"))
      return "https://api.phantom.app/image-proxy/?image=https%3A%2F%2Fdhc7eusqrdwa0.cloudfront.net%2Fassets%2FBOOP_logo_icon_dark_bg.png&anim=true";
    if (
      launchpadProtocol.includes("moonit") ||
      launchpadProtocol.includes("moonshot") ||
      launchpadProtocol.includes("moonshoot")
    )
      return "https://avatars.githubusercontent.com/u/174132191?s=280&v=4";
    if (
      launchpadProtocol.includes("bonk") ||
      launchpadProtocol.includes("launchlab") ||
      mintAddress.endsWith("bonk")
    )
      return "https://s3.coinmarketcap.com/static-gravity/image/a28128d9ff7c49c9ad33ee2f626fda40.png";
    if (launchpadProtocol.includes("bags"))
      return "https://play-lh.googleusercontent.com/7AxVcu1pumxavcGTb16WBJQU88CDZd0v8q0WzFwfin7zbBvItYMuNQ0Xkqq4srTw4A=w240-h480-rw";

    return "https://pump.fun/pump-logomark.svg";
  };

  // API returns image_url, fallback to image, logo, then uri (only if uri is not a metadata JSON URL)
  const rawUri = (token as any).uri;
  const safeUri = rawUri && !isMetadataUrl(rawUri) ? rawUri : null;
  const imageUrl =
    (token as any).image_url || (token as any).image || token.logo || safeUri;

  // Resolve final proxy URL, using per-mint cache to avoid re-computation
  const mintKey = token.mint || (token as any).mint_address || "";
  const imgSrc = useMemo(() => {
    // 1. Metadata image takes top priority (already resolved by useTokenMetadata)
    const metaImg = extractMetaImage(meta);
    if (metaImg) {
      const proxyUrl = computeHashImageUrl(metaImg) || "";
      if (mintKey) resolvedImageCache[mintKey] = proxyUrl;
      return proxyUrl;
    }
    // 2. Check resolved cache (populated by previous renders)
    if (mintKey && resolvedImageCache[mintKey])
      return resolvedImageCache[mintKey];
    // 3. Use metadata URI via proxy auto-resolve (proxy fetches JSON → extracts image → serves it)
    //    Don't cache this — let extractMetaImage supersede it once useTokenMetadata resolves
    if (rawUri && isMetadataUrl(rawUri)) {
      return computeHashImageUrl(rawUri) || "";
    }
    // 4. Direct image URL or ui-avatars fallback
    const raw = imageUrl || token.logo || "";
    if (!raw) return "";
    const proxyUrl = computeHashImageUrl(raw) || "";
    if (mintKey) resolvedImageCache[mintKey] = proxyUrl;
    return proxyUrl;
  }, [meta, imageUrl, token.logo, mintKey, rawUri]);

  // Preload the new image off-screen with `new Image()`. Only when its bytes
  // are fully decoded by the browser do we promote `imgSrc` into `visibleSrc`,
  // which is what the rendered <img> actually points at. Old image stays
  // visible until new one is ready, so swaps are clean — no blank gap.
  useEffect(() => {
    setImgError(false);
    if (!imgSrc) {
      setVisibleSrc("");
      return;
    }
    // Cache hit: render the previously-loaded URL with no preload, no fade.
    if (cachedAvatarMint && loadedAvatarCache.has(cachedAvatarMint)) {
      const cached = loadedAvatarCache.get(cachedAvatarMint)!;
      if (cached !== visibleSrc) setVisibleSrc(cached);
      return;
    }
    let cancelled = false;
    // Use window.Image to bypass the next/image default import shadowing the global.
    const preloader = new window.Image();
    preloader.onload = () => {
      if (cancelled) return;
      setVisibleSrc(imgSrc);
      if (cachedAvatarMint) loadedAvatarCache.set(cachedAvatarMint, imgSrc);
    };
    preloader.onerror = () => {
      if (!cancelled) setImgError(true);
    };
    preloader.src = imgSrc;
    return () => {
      cancelled = true;
    };
  }, [imgSrc, cachedAvatarMint]);

  // Compute protocol badge values
  const protocolColor = getProtocolColor(token);
  const tokenIcon = getTokenIcon(token);
  const _proto = (token as any).launchpad_protocol?.toLowerCase() || "";
  const _mint = (token.mint || (token as any).mint_address || "").toLowerCase();
  const fillBadge =
    (_proto.includes("meteora") && !_mint.includes("bags")) ||
    _proto.includes("bonk") ||
    _proto.includes("launchlab") ||
    _mint.endsWith("bonk") ||
    _proto.includes("bags") ||
    _mint.includes("bags") ||
    _proto.includes("moonit") ||
    _proto.includes("moonshot") ||
    _proto.includes("moonshoot");

  // Migration progress ring (matches PulseTable behavior). 0..1 fraction of bonding-curve fill.
  // Hidden once the token has graduated (>= 100%) since trending is mostly post-migration.
  const migrationProgress = (() => {
    const bondingPct = (token as any).bonding_pct;
    const bondingCurveProgress = (token as any).bonding_curve_progress;
    const graduationPercent = (token as any).graduationPercent;
    let pct = 0;
    if (typeof bondingPct === "number" && bondingPct >= 0)
      pct = bondingPct / 100;
    else if (
      typeof bondingCurveProgress === "number" &&
      bondingCurveProgress >= 0
    )
      pct = bondingCurveProgress;
    else if (typeof graduationPercent === "number" && graduationPercent >= 0)
      pct = graduationPercent / 100;
    if (pct >= 1 || pct <= 0) return 0;
    return Math.min(pct, 1);
  })();

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: "68px", height: "68px", overflow: "visible" }}
    >
      {/* Outer protocol-colored border ring (matches PulseTable styling) */}
      <div
        className="relative rounded-lg"
        style={{
          border: `1px solid ${protocolColor}`,
          padding: "2px",
          backgroundColor: "#0a0b0d",
          width: "66px",
          height: "66px",
        }}
      >
        {/* Image container - rounded square (matches PulseTable styling) */}
        <div
          className="relative overflow-hidden rounded-md"
          style={{ width: "60px", height: "60px" }}
        >
          {/* Stable placeholder: protocol-color tint + initial letter. Always rendered
              beneath the image so the row appears instantly with no spinner-then-letter
              cascade. Stays visible while the real image preloads, gets covered when
              the image fades in on top, and remains visible if the image fails. */}
          <div
            className="absolute inset-0 flex items-center justify-center rounded-md"
            style={{
              backgroundColor:
                AX.surface2 /* neutral grey, blends with page bg */,
            }}
          >
            <span className="text-sm font-bold" style={{ color: AX.text }}>
              {initial}
            </span>
          </div>
          {/* Real image, only mounted once fully preloaded. Fades in over the
              placeholder via the .token-avatar-fade-in CSS keyframe (globals.css). */}
          {visibleSrc && !imgError && (
            <img
              src={visibleSrc}
              alt={token.name || token.symbol || ""}
              width={60}
              height={60}
              // Browser-driven fade-in via keyframe (see globals.css token-avatar-fade-in).
              // Runs once on mount because the <img> is only mounted after visibleSrc
              // flips from '' to a fully-preloaded URL.
              // Apply fade-in only on the FIRST load of this mint's image (cache
              // miss at mount). Captured in a ref so className stays stable for the
              // whole mount  the keyframe plays exactly once when the <img> first
              // appears, and subsequent re-renders don't re-trigger it. Cache hits
              // render with no class at all, instant, image stays constant.
              className={`absolute inset-0 h-full w-full rounded-md object-cover ${
                skipFadeRef.current ? "" : "token-avatar-fade-in"
              }`}
              onError={() => setImgError(true)}
            />
          )}
        </div>
      </div>

      {/* Migration progress ring - clockwise from bottom-right around the 66x66 inner ring (matches PulseTable) */}
      {migrationProgress > 0 && (
        <div className="pointer-events-none absolute inset-0">
          <svg className="h-full w-full" viewBox="0 0 68 68">
            <path
              d="M 66 66 L 8 66 Q 2 66 2 60 L 2 8 Q 2 2 8 2 L 60 2 Q 66 2 66 8 L 66 60 Q 66 66 60 66"
              fill="none"
              stroke={protocolColor}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={`${4 * 64}`}
              strokeDashoffset={`${4 * 64 * (1 - migrationProgress)}`}
            />
          </svg>
        </div>
      )}

      {/* Protocol logo badge - bottom right */}
      <div
        className="pointer-events-none absolute right-0 bottom-0 z-10 flex translate-x-1/5 translate-y-1/4 transform items-center justify-center rounded-full"
        style={{
          width: 16,
          height: 16,
          backgroundColor: "#080808",
          border: `1px solid ${protocolColor}`,
          boxShadow: `0 0 4px ${protocolColor}60`,
        }}
      >
        <img
          src={tokenIcon}
          alt="Protocol"
          className={`${fillBadge ? "h-full w-full object-cover" : "h-3/4 w-3/4 object-contain"} rounded-full`}
          style={{
            filter:
              protocolColor === "#eab308"
                ? "sepia(1) saturate(3) hue-rotate(-10deg) brightness(1.1)"
                : "none",
          }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
    </div>
  );
};

// Token Info Component
const TokenInfo: React.FC<{
  token: Token;
  i: number;
  sortedRows: InterstateTableRow[];
  isDiscoverPage?: boolean;
  chain?: string; // 'sol' | 'monad' - chain identifier
  tableType?: "trending" | "newPairs" | "xStocks" | "dexscreener";
}> = ({
  token,
  i,
  sortedRows,
  isDiscoverPage = false,
  chain = "sol",
  tableType = "trending",
}) => {
  // DexScreener uses the same stacked layout as Trending (symbol on top,
  // name on its own line, action icons inline) — visually closer to axiom.
  const isTrending = tableType === "trending" || tableType === "dexscreener";
  const { meta, loading, showInitial } = useTokenMetadata(token.uri);
  const timeLabel = TIME_LABELS[i % TIME_LABELS.length];
  const [showXPreview, setShowXPreview] = useState(false);
  const [buttonPosition, setButtonPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [showSearchMenu, setShowSearchMenu] = useState(false);
  const searchButtonRef = useRef<HTMLButtonElement>(null);

  // Refs for X preview hover state management
  const xButtonRef = useRef<HTMLButtonElement>(null);
  const isOverXPreview = useRef(false);
  const isOverXButton = useRef(false);

  // Close search menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        showSearchMenu &&
        searchButtonRef.current &&
        !searchButtonRef.current.contains(e.target as Node)
      ) {
        setShowSearchMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSearchMenu]);

  // Extract social links from metadata
  const socialLinks = useMemo(
    () => extractSocialLinks(token, meta),
    [token, meta],
  );
  const hasTwitter = !!socialLinks.twitter;
  const hasWebsite = !!socialLinks.website;
  const hasTelegram = !!socialLinks.telegram;
  const twitterHandle = hasTwitter
    ? extractTwitterHandle(socialLinks.twitter!)
    : null;

  // Get token image from metadata or token
  const tokenImage = useMemo(() => {
    if (meta?.image) return meta.image;
    if ((token as any).image_url) return (token as any).image_url;
    if ((token as any).image) return (token as any).image;
    if (token.logo) return token.logo;
    return null;
  }, [meta, token]);

  // Watchlist functionality
  const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlist();
  const tokenAddress = token.pair_address || token.mint || "";
  const isWatched = isInWatchlist(tokenAddress);

  const handleWatchlistClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isWatched) {
        removeFromWatchlist(tokenAddress);
        showEnhancedToast("info", "Removed from watchlist");
      } else {
        addToWatchlist(token);
        showEnhancedToast("success", "Added to watchlist");
      }
    },
    [isWatched, tokenAddress, token, addToWatchlist, removeFromWatchlist],
  );

  // Calculate actual token age for discover page
  const getTokenAge = useCallback(() => {
    if (!isDiscoverPage) return timeLabel;

    try {
      const createdAt = (token as any).created_at || (token as any).launch_time;
      if (!createdAt) return "";

      let timestamp: number | null = null;
      if (typeof createdAt === "string") {
        const parsed = Date.parse(createdAt);
        if (!isNaN(parsed)) timestamp = parsed;
      } else if (typeof createdAt === "number") {
        // Heuristic: treat 13-digit as ms, 10-digit as seconds
        if (createdAt > 1e12) timestamp = createdAt;
        else if (createdAt > 1e9) timestamp = createdAt * 1000;
      }

      if (!timestamp) return "";

      const ageMs = Date.now() - timestamp;
      const ageHours = ageMs / (1000 * 60 * 60);

      if (ageHours < 1) {
        const ageMins = Math.floor(ageMs / (1000 * 60));
        if (ageMins < 1) {
          const ageSecs = Math.floor(ageMs / 1000);
          return `${ageSecs}s`;
        }
        return `${ageMins}m`;
      } else if (ageHours < 24) {
        return `${Math.floor(ageHours)}h`;
      } else {
        return `${Math.floor(ageHours / 24)}d`;
      }
    } catch {
      return "";
    }
  }, [token, isDiscoverPage, timeLabel]);

  const tokenAge = getTokenAge();

  // Calculate age color for discover page
  const getAgeColor = useCallback(() => {
    if (!isDiscoverPage) return "#85d99f";

    try {
      const createdAt = (token as any).created_at || (token as any).launch_time;
      if (!createdAt) return "#85d99f";

      let timestamp: number | null = null;
      if (typeof createdAt === "string") {
        const parsed = Date.parse(createdAt);
        if (!isNaN(parsed)) timestamp = parsed;
      } else if (typeof createdAt === "number") {
        if (createdAt > 1e12) timestamp = createdAt;
        else if (createdAt > 1e9) timestamp = createdAt * 1000;
      }

      if (!timestamp) return "#85d99f";

      const ageMs = Date.now() - timestamp;
      const ageHours = ageMs / (1000 * 60 * 60);

      return ageHours < 1 ? "#f2c367" : "#f26681";
    } catch {
      return "#85d99f";
    }
  }, [token, isDiscoverPage]);

  const ageColor = getAgeColor();

  // const similarTokens = useMemo(() =>
  //   sortedRows
  //     .filter(row => row.token.pair_address !== token.pair_address)
  //     .sort((a, b) => {
  //       const diffA = Math.abs(a.token.fully_diluted_value - token.fully_diluted_value);
  //       const diffB = Math.abs(b.token.fully_diluted_value - token.fully_diluted_value);
  //       return diffA - diffB;
  //     })
  //     .slice(0, 2),
  //   [token, sortedRows]
  // );

  const tooltipContent = (
    <div style={{ width: 180 }}>
      <div
        className="overflow-hidden rounded-lg"
        style={{ width: 180, height: 180 }}
      >
        {tokenImage ? (
          <img
            src={computeHashImageUrl(tokenImage) || ""}
            alt={token.name || token.symbol || ""}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ backgroundColor: AX.surface2 }}
          >
            <span className="text-5xl font-bold" style={{ color: AX.text }}>
              {token.name?.charAt(0)?.toUpperCase() || "?"}
            </span>
          </div>
        )}
      </div>
      <div
        className="mt-1.5 truncate text-center text-sm font-semibold"
        style={{ color: AX.text }}
      >
        {token.name}
      </div>
    </div>
  );

  return (
    <div className="flex items-center gap-2">
      <InterstateTooltip
        width={undefined}
        height={undefined}
        xOffset="ml-0"
        label={tooltipContent}
        className="bg-neutral-900/100"
        noPadding
      >
        <TokenAvatar
          token={token}
          meta={meta}
          loading={loading}
          showInitial={showInitial}
          chain={chain}
        />
      </InterstateTooltip>

      <div
        className={`flex min-w-0 flex-1 flex-col ${isTrending ? "gap-0.5" : ""}`}
      >
        {/* Line 1: Symbol (and on non-trending, name + actions inline) */}
        <div className={`flex items-center gap-2 ${isTrending ? "" : "mb-1"}`}>
          <span
            className={`truncate font-bold ${isTrending ? "flex-shrink-0 text-[15px]" : "min-w-[6ch] text-base"}`}
            style={{
              color: AX.text,
              ...(isTrending ? { maxWidth: "14ch" } : {}),
            }}
            title={isTrending ? token.symbol : undefined}
          >
            {token.symbol}
          </span>
          {!isTrending && (
            <span
              className="min-w-0 truncate text-sm font-medium"
              style={{ color: AX.muted }}
            >
              {token.name}
            </span>
          )}
          {/* Always-on actions next to the token symbol (trending only) */}
          {isTrending && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleWatchlistClick}
                className="flex cursor-pointer items-center justify-center transition-colors duration-200 hover:opacity-80"
                style={{ color: isWatched ? "#f2c367" : AX.muted }}
                title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = isWatched
                    ? "#f2c367"
                    : "#73c5ff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = isWatched
                    ? "#f2c367"
                    : AX.muted;
                }}
              >
                {isWatched ? (
                  <FaStar className="h-3.5 w-3.5" />
                ) : (
                  <FaRegStar className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                className="cursor-pointer transition-colors duration-200 hover:opacity-80"
                style={{ color: AX.muted }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = AX.aiCyan;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = AX.muted;
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  const contractAddress = token.mint || token.pair_address;
                  copyToClipboard(
                    contractAddress,
                    "Contract address copied to clipboard!",
                  );
                }}
                title="Copy contract address"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {/* Age (trending only — sits after the action icons on line 1) */}
          {isTrending && tokenAge && (
            <span
              className={`text-xs ${isDiscoverPage ? "number-font" : ""}`}
              style={{
                color: ageColor,
                fontWeight: 700,
                ...(isDiscoverPage
                  ? {}
                  : {
                      fontFamily:
                        'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                    }),
              }}
            >
              {tokenAge}
            </span>
          )}
          {/* Original copy + watchlist for non-trending modes */}
          {!isTrending && (
            <>
              <button
                className="cursor-pointer transition-colors duration-200 hover:opacity-80"
                style={{ color: AX.muted }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = AX.aiCyan;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = AX.muted;
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  const contractAddress = token.mint || token.pair_address;
                  copyToClipboard(
                    contractAddress,
                    "Contract address copied to clipboard!",
                  );
                }}
                title="Copy contract address"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={handleWatchlistClick}
                className="flex cursor-pointer items-center justify-center transition-colors duration-200 hover:opacity-80"
                style={{ color: isWatched ? "#f2c367" : AX.muted }}
                title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = isWatched
                    ? "#f2c367"
                    : "#73c5ff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = isWatched
                    ? "#f2c367"
                    : AX.muted;
                }}
              >
                {isWatched ? (
                  <FaStar className="h-3.5 w-3.5" />
                ) : (
                  <FaRegStar className="h-3.5 w-3.5" />
                )}
              </button>
            </>
          )}
        </div>

        {/* Line 2 (trending only): name on its own line so it can truncate without squeezing the symbol. */}
        {isTrending && (
          <span
            className="min-w-0 truncate text-xs font-medium"
            style={{ color: AX.muted }}
            title={token.name}
          >
            {token.name}
          </span>
        )}

        {/* Line 3 (trending) / Line 2 (others): age + dense social cluster.
            For trending the age is moved up to line 1, and this row holds
            the X/TG/Web/Pump/Search/Copy icons — kept always visible (user
            preference: power traders want one-click access to those links). */}
        <div className="flex items-center gap-2">
          {!isTrending && tokenAge && (
            <span
              className={`text-sm ${isDiscoverPage ? "number-font" : "text-emerald-400"}`}
              style={{
                color: isDiscoverPage ? ageColor : undefined,
                fontWeight: isDiscoverPage ? 700 : 400,
                ...(isDiscoverPage
                  ? {}
                  : {
                      fontFamily:
                        'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                    }),
              }}
            >
              {tokenAge}
            </span>
          )}
          <div className="flex items-center gap-1 text-sky-400">
            {/* X/Twitter Icon - only show if twitter URL exists in metadata */}
            {hasTwitter && (
              <button
                ref={xButtonRef}
                className="flex cursor-pointer items-center justify-center rounded p-0.5 transition-colors duration-200 hover:bg-white/10"
                style={{ color: AX.muted }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#fff";
                  isOverXButton.current = true;
                  // Position the preview popup
                  if (xButtonRef.current) {
                    const rect = xButtonRef.current.getBoundingClientRect();
                    setButtonPosition({
                      left: rect.left + rect.width / 2,
                      top: rect.bottom + 10,
                    });
                  }
                  setShowXPreview(true);
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = AX.muted;
                  isOverXButton.current = false;
                  // Delay to allow moving to popup
                  setTimeout(() => {
                    if (!isOverXPreview.current && !isOverXButton.current) {
                      setShowXPreview(false);
                    }
                  }, 200);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(socialLinks.twitter, "_blank");
                }}
                title="Twitter/X"
              >
                <FaXTwitter size={11} />
              </button>
            )}

            {/* Telegram Icon - only show if telegram URL exists in metadata */}
            {hasTelegram && (
              <button
                className="flex cursor-pointer items-center justify-center rounded p-0.5 transition-colors duration-200 hover:bg-white/10"
                style={{ color: AX.muted }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#0088cc";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = AX.muted;
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(socialLinks.telegram, "_blank");
                }}
                title="Telegram"
              >
                <FaTelegram size={11} />
              </button>
            )}

            {/* Website Icon - only show if website URL exists in metadata */}
            {hasWebsite && (
              <button
                className="flex cursor-pointer items-center justify-center rounded p-0.5 transition-colors duration-200 hover:bg-white/10"
                style={{ color: AX.muted }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#fff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = AX.muted;
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(socialLinks.website, "_blank");
                }}
                title="Website"
              >
                <FiGlobe size={11} />
              </button>
            )}

            {/* Pump.fun pill - only for pump.fun launchpad tokens or Mayhem-mode tokens */}
            {(() => {
              const proto =
                (token as any).launchpad_protocol?.toLowerCase() || "";
              const mintAddr = (
                token.mint ||
                (token as any).mint_address ||
                ""
              ).toLowerCase();
              const isPumpToken =
                proto.includes("pump") || mintAddr.endsWith("pump");
              const isMayhem = !!(token as any).is_mayhem_mode;
              if (!isPumpToken && !isMayhem) return null;
              return (
                <button
                  className="flex cursor-pointer items-center justify-center rounded p-0.5 transition-colors duration-200 hover:bg-white/10"
                  style={{ color: AX.muted }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#85d99f";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = AX.muted;
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const addr =
                      token.mint || (token as any).mint_address || "";
                    if (addr)
                      window.open(`https://pump.fun/coin/${addr}`, "_blank");
                  }}
                  title="View on pump.fun"
                >
                  <LuPill size={11} />
                </button>
              );
            })()}

            {/* Search icon with dropdown menu */}
            <div
              className="relative"
              onMouseEnter={() => setShowSearchMenu(true)}
              onMouseLeave={() => setShowSearchMenu(false)}
            >
              <button
                ref={searchButtonRef}
                className="flex cursor-pointer items-center justify-center rounded p-0.5 transition-colors duration-200 hover:bg-white/10"
                style={{
                  color: showSearchMenu
                    ? isDiscoverPage
                      ? "#85d99f"
                      : AX.aiCyan
                    : AX.muted,
                }}
                title="Search options"
              >
                <Search className="h-3 w-3" />
              </button>

              {/* Search dropdown menu */}
              {showSearchMenu && (
                <div
                  className="absolute top-0 left-full z-[99999] ml-1 min-w-[180px] overflow-hidden rounded-lg"
                  style={{
                    backgroundColor: "#1a1b1f",
                    border: `1px solid ${AX.border}`,
                    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-white transition-colors hover:bg-white/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(
                        `https://twitter.com/search?q=${encodeURIComponent(token.mint || token.pair_address || "")}`,
                        "_blank",
                      );
                      setShowSearchMenu(false);
                    }}
                  >
                    <FaXTwitter size={12} className="text-neutral-400" />X
                    Search Address
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-white transition-colors hover:bg-white/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(
                        `https://twitter.com/search?q=${encodeURIComponent(`${token.symbol} ${token.name}`.trim())}`,
                        "_blank",
                      );
                      setShowSearchMenu(false);
                    }}
                  >
                    <FaXTwitter size={12} className="text-neutral-400" />X
                    Search Name
                  </button>
                  <div
                    className="my-0.5 border-t"
                    style={{ borderColor: AX.border }}
                  />
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-white transition-colors hover:bg-white/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(
                        `https://www.google.com/search?q=${encodeURIComponent(`${token.symbol} ${token.name} crypto`.trim())}`,
                        "_blank",
                      );
                      setShowSearchMenu(false);
                    }}
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24">
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
                    Google Search
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-white transition-colors hover:bg-white/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      const address = token.mint || token.pair_address || "";
                      const chainPath = chain === "monad" ? "monad" : "solana";
                      window.open(
                        `https://dexscreener.com/${chainPath}/${address}`,
                        "_blank",
                      );
                      setShowSearchMenu(false);
                    }}
                  >
                    <Search className="h-3 w-3 text-[#36d8ff]" />
                    DexScreener
                  </button>
                </div>
              )}
            </div>

            {/* Copy icon */}
            <button
              className="cursor-pointer transition-colors duration-200 hover:text-sky-300"
              style={{ color: AX.muted }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = AX.aiCyan;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = AX.muted;
              }}
              onClick={(e) => {
                e.stopPropagation();
                copyToClipboard(
                  token.pair_address,
                  "Token address copied to clipboard!",
                );
              }}
              title="Copy token address"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
          {i === 1 && (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="text-red-600"
            >
              <path d="M23.498 6.186c-.197-.74-.777-1.32-1.517-1.517C20.34 4.333 12 4.333 12 4.333s-8.34 0-9.981.336c-.74.197-1.32.777-1.517 1.517C.166 7.827.166 12 .166 12s0 4.173.336 5.814c.197.74.777 1.32 1.517 1.517C3.66 19.667 12 19.667 12 19.667s8.34 0 9.981-.336c.74-.197 1.32-.777 1.517-1.517.336-1.641.336-5.814.336-5.814s0-4.173-.336-5.814zM9.797 15.568V8.432l6.568 3.568-6.568 3.568z" />
            </svg>
          )}
        </div>
      </div>

      {showXPreview &&
        buttonPosition &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed"
            style={(() => {
              const POPUP_W = 280;
              const POPUP_H_EST = 220;
              const vw =
                typeof window !== "undefined" ? window.innerWidth : 1920;
              const vh =
                typeof window !== "undefined" ? window.innerHeight : 1080;
              let left = buttonPosition.left + 20;
              let top = buttonPosition.top;
              if (left + POPUP_W + 8 > vw) {
                left = Math.max(8, buttonPosition.left - POPUP_W - 20);
              }
              if (top + POPUP_H_EST + 8 > vh) {
                top = Math.max(8, vh - POPUP_H_EST - 8);
              }
              return {
                left: `${left}px`,
                top: `${top}px`,
                width: `${POPUP_W}px`,
                zIndex: 999999,
              };
            })()}
            onMouseEnter={() => {
              isOverXPreview.current = true;
            }}
            onMouseLeave={() => {
              isOverXPreview.current = false;
              setTimeout(() => {
                if (!isOverXPreview.current && !isOverXButton.current) {
                  setShowXPreview(false);
                }
              }, 200);
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
                className="flex items-center border-b px-4 py-3"
                style={{ borderColor: "#2f3336" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full"
                    style={{ backgroundColor: "#1d9bf0" }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      style={{ color: "#ffffff" }}
                    >
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </div>
                  <div className="text-sm font-bold text-white">X Profile</div>
                </div>
              </div>

              {/* X Profile Content */}
              <div className="px-4 py-3">
                {/* Profile Header */}
                <div className="mb-3 flex items-center gap-3">
                  <div
                    className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-full"
                    style={{ backgroundColor: "#1a1a1a" }}
                  >
                    <img
                      src={
                        tokenImage
                          ? computeHashImageUrl(tokenImage) || ""
                          : `https://ui-avatars.com/api/?name=${token.symbol || "Token"}&size=48&background=1a1a1a&color=ffffff&bold=true`
                      }
                      alt={`${token.symbol} profile`}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          `https://ui-avatars.com/api/?name=${token.symbol || "Token"}&size=48&background=1a1a1a&color=ffffff&bold=true`;
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
                    <span className="text-xs text-gray-500">
                      @{twitterHandle || token.symbol?.toLowerCase()}
                    </span>
                  </div>
                </div>

                {/* Bio/Description */}
                <p className="mb-2 text-sm leading-relaxed text-white">
                  {meta?.description ||
                    token.description ||
                    `Official ${token.symbol} token`}
                </p>
                {hasWebsite && (
                  <a
                    href={socialLinks.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mb-3 block truncate text-sm text-[#1d9bf0] hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {socialLinks.website}
                  </a>
                )}
              </div>

              {/* CTA Button */}
              <div className="px-4 pb-4">
                <button
                  className="w-full rounded-full border border-[#536471] py-2 text-sm font-semibold text-[#1d9bf0] transition-colors hover:bg-[#1d9bf0]/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(socialLinks.twitter, "_blank");
                  }}
                >
                  See Profile on X
                </button>
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
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span>
                    Joined{" "}
                    {new Date().toLocaleDateString("en-US", {
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

interface SubscriptNumberProps {
  value: number | string | null | undefined;
  className?: string;
}

export const SubscriptNumber: React.FC<SubscriptNumberProps> = ({
  value,
  className,
}) => {
  const MAX_ZEROES = 2;

  const toNumber = (val: number | string | null | undefined): number | null => {
    if (val === null || val === undefined) return null;
    if (typeof val === "number") return val;
    if (typeof val === "string") {
      const cleaned = val.replace(/[$,\s]/g, "");
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  };

  const formatNumber = (num: number) => {
    const numStr = num.toFixed(20);
    const [integerPart, decimalPart = ""] = numStr.split(".");
    const leadingZeros = decimalPart.match(/^0*/)?.[0] || "";
    const originalZeroCount = leadingZeros.length;
    const zeroCount = originalZeroCount; // Show actual zero count in subscript
    const sigDigitsStart = leadingZeros.length;

    const firstDigit = decimalPart[sigDigitsStart] || "0";
    const secondDigit = decimalPart[sigDigitsStart + 1] || "0";
    const roundingDigit = decimalPart[sigDigitsStart + 2] || "0";

    const roundedSecondDigit =
      parseInt(roundingDigit) >= 5
        ? (parseInt(secondDigit) + 1).toString()
        : secondDigit;

    let finalDigits;
    if (roundedSecondDigit === "10") {
      finalDigits = (parseInt(firstDigit) + 1).toString() + "0";
    } else {
      finalDigits = firstDigit + roundedSecondDigit;
    }

    // Formatting logic with new rules:
    if (originalZeroCount > MAX_ZEROES) {
      return (
        <span className={className}>
          0.0<sub>{zeroCount}</sub>
          {finalDigits}
        </span>
      );
    } else if (originalZeroCount > 0) {
      // 1-MAX_ZEROES zeros: show all zeros without subscript
      const zeros = "0".repeat(originalZeroCount);
      return (
        <span className={className}>
          0.{zeros}
          {finalDigits}
        </span>
      );
    } else {
      // No leading zeros
      return (
        <span className={className}>
          {integerPart}.{decimalPart.substring(0, 2)}
        </span>
      );
    }
  };

  const num = toNumber(value);
  if (num === null || !isFinite(num)) {
    return <span className={className}>-</span>;
  }
  if (num === 0) {
    return <span className={className}>0.00</span>;
  }

  return formatNumber(num);
};

// Market Cap Cell Component
const MarketCapCell: React.FC<{
  token: Token;
  selectedTimeframe: string;
  animationState: Record<string, "up" | "down" | null>;
  isDiscoverPage?: boolean;
}> = ({ token, selectedTimeframe, animationState, isDiscoverPage = false }) => {
  const percentChange = getTokenStat(
    token,
    "price_percent_change",
    selectedTimeframe,
  );
  const percentFieldKey = `${token.pair_address}-price_percent_change_${selectedTimeframe}`;
  const isPositive = percentChange >= 0;

  // Calculate market cap color for discover page
  const marketCap = token.fully_diluted_value || 0;
  let marketCapColor = AX.text;
  if (isDiscoverPage) {
    if (marketCap > 100000) {
      marketCapColor = "#f2c367";
    } else if (marketCap > 40000) {
      marketCapColor = "#73c5ff";
    } else {
      marketCapColor = "#85d99f";
    }
  }

  // Debug logging for MarketCapCell
  // console.log('MarketCapCell Debug:', {
  //   tokenName: token.name,
  //   fullyDilutedValue: token.fully_diluted_value,
  //   fullyDilutedValueType: typeof token.fully_diluted_value,
  //   usdPrice: token.usd_price,
  //   usdPriceType: typeof token.usd_price,
  //   token: token
  // });

  return (
    <div className="text-right">
      <div
        className={`text-base font-semibold ${isDiscoverPage ? "number-font" : ""}`}
        style={{
          color: isDiscoverPage ? marketCapColor : AX.text,
          ...(isDiscoverPage
            ? {}
            : {
                fontFamily:
                  'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                fontWeight: "400",
              }),
        }}
      >
        {(() => {
          // console.log('MarketCapCell formatSmartNumber call with:', token.fully_diluted_value);
          return `$${formatMarketCap(token.fully_diluted_value)}`;
        })()}
      </div>
      {/* Commented out percentage display per user request */}
      {/* <div
        className={`text-xs font-semibold ${
          isPositive ? "text-emerald-400" : "text-red-400"
        } ${
          animationState[percentFieldKey] === 'up' ? 'price-animate-up' : 
          animationState[percentFieldKey] === 'down' ? 'price-animate-down' : ''
        }`}
      >
        {formatPercentChange(percentChange)}%
      </div> */}
    </div>
  );
};

// TXNS Cell Component
const TxnsCell: React.FC<{
  token: Token;
  selectedTimeframe: string;
  isDiscoverPage?: boolean;
  variant?: "default" | "compact";
}> = ({
  token,
  selectedTimeframe,
  isDiscoverPage = false,
  variant = "default",
}) => {
  const monospaceFont =
    'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace';

  // Always show transaction counts (no more rank display)
  const { total, buys, sells } = getTxns(token, selectedTimeframe);

  // For discover page (xStocks), show "0" instead of "-" when value is 0
  const formatTxnValue = (value: number) => {
    if (value === 0) {
      return isDiscoverPage ? "0" : "-";
    }
    return formatSmartNumber(value);
  };

  // Compact variant - vertical buy/sell ratio bar + "buys / sells" numbers (used on trending)
  if (variant === "compact") {
    const buyColor = isDiscoverPage ? "#85d99f" : "#34d399";
    const sellColor = isDiscoverPage ? "#f26681" : "#f87171";
    const ratio = total > 0 ? Math.max(0, Math.min(1, buys / total)) : 0.5;
    const buyPct = total > 0 ? `${ratio * 100}%` : "50%";
    const sellPct = total > 0 ? `${(1 - ratio) * 100}%` : "50%";

    return (
      // Center buys/sells block in the cell so it visually pairs with the
      // centered TXNS header (Irfan's prod change in #793).
      <div className="flex h-full items-center justify-center gap-2">
        <div
          className="flex h-6 w-1 flex-col overflow-hidden rounded-sm"
          aria-hidden="true"
        >
          <div style={{ backgroundColor: buyColor, height: buyPct }} />
          <div style={{ backgroundColor: sellColor, height: sellPct }} />
        </div>
        <div className="flex items-center text-sm font-medium">
          <span
            className={isDiscoverPage ? "number-font" : ""}
            style={{
              color: buyColor,
              ...(isDiscoverPage
                ? {}
                : { fontFamily: monospaceFont, fontWeight: "400" }),
            }}
          >
            {formatTxnValue(buys)}
          </span>
          <span className="mx-1" style={{ color: AX.muted }}>
            /
          </span>
          <span
            className={isDiscoverPage ? "number-font" : ""}
            style={{
              color: sellColor,
              ...(isDiscoverPage
                ? {}
                : { fontFamily: monospaceFont, fontWeight: "400" }),
            }}
          >
            {formatTxnValue(sells)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-center">
      <div className="flex items-center justify-end">
        <span
          className={`text-base font-medium ${isDiscoverPage ? "number-font" : ""}`}
          style={{
            color: AX.text,
            ...(isDiscoverPage
              ? {}
              : { fontFamily: monospaceFont, fontWeight: "400" }),
          }}
        >
          {formatTxnValue(total)}
        </span>
      </div>
      <div className="flex items-center justify-end text-sm font-medium">
        <span
          className={isDiscoverPage ? "number-font" : ""}
          style={{
            color: isDiscoverPage ? "#85d99f" : "#34d399",
            ...(isDiscoverPage
              ? {}
              : { fontFamily: monospaceFont, fontWeight: "400" }),
          }}
        >
          {formatTxnValue(buys)}
        </span>
        <span className="mx-1" style={{ color: AX.muted }}>
          /
        </span>
        <span
          className={isDiscoverPage ? "number-font" : ""}
          style={{
            color: isDiscoverPage ? "#f26681" : "#f87171",
            ...(isDiscoverPage
              ? {}
              : { fontFamily: monospaceFont, fontWeight: "400" }),
          }}
        >
          {formatTxnValue(sells)}
        </span>
      </div>
    </div>
  );
};

// Mini Sparkline Chart Component - shows price movement for the selected
// timeframe (5m / 1h / 6h / 24h), matching every other column on Trending.
//
// Previously this hard-coded `?interval=1h&timeframe=24h`, but the API handler
// silently fell through to 5m candles (INTERVAL_MAP didn't know `24h`) and the
// fetch never passed from/to, so the curve was effectively the last few hours
// of 5m candles regardless of what the column header said. Now driven by the
// user-selected timeframe with a real time-bounded window.
// 5m uses 1s candles to give the sparkline real density (~300 points).
// At 1m candles the 5-min window only has ~5 points and the polyline
// renders as 1–2 line segments — looks like a flat diagonal even on
// tokens that actually moved during the window.
const TIMEFRAME_CONFIG: Record<
  string,
  { windowSec: number; interval: string; label: string }
> = {
  "5m": { windowSec: 5 * 60, interval: "1s", label: "5M" }, // ~300 candles
  "1h": { windowSec: 60 * 60, interval: "1m", label: "1H" }, // ~60 candles
  "6h": { windowSec: 6 * 60 * 60, interval: "5m", label: "6H" }, // ~72 candles
  "24h": { windowSec: 24 * 60 * 60, interval: "30m", label: "24H" }, // ~48 candles
};

// Cache keyed by mint+timeframe so switching timeframes doesn't reuse stale
// data, and going back doesn't re-hit the API for ~5 min.
const sparklineCache = new Map<
  string,
  { data: number[]; priceChange: number; ts: number }
>();
const SPARKLINE_CACHE_TTL_MS = 5 * 60 * 1000;

// When OHLCV data is missing for a token (common for newly-trending pump.fun
// mints not yet indexed by token-service), synthesize a 5-point trajectory
// from the per-timeframe percent-change fields the upstream payload already
// carries. Points oldest → newest: 24h, 6h, 1h, 5m, now. Returns null when
// the token doesn't have these fields populated or every change is zero.
function synthesizeSparklineFromPriceChanges(token: Token): number[] | null {
  const c5m = Number(token.price_percent_change_5m);
  const c1h = Number(token.price_percent_change_1h);
  const c6h = Number(token.price_percent_change_6h);
  const c24h = Number(token.price_percent_change_24h);
  if (![c5m, c1h, c6h, c24h].every(Number.isFinite)) return null;
  if (!c5m && !c1h && !c6h && !c24h) return null;
  // Derive each historic price from now's price by reversing the % change.
  // priceNow / (1 + chg/100) = priceThen. Normalise priceNow = 1.
  const ratio = (chg: number) => 1 / (1 + chg / 100);
  return [ratio(c24h), ratio(c6h), ratio(c1h), ratio(c5m), 1];
}

const MiniSparkline: React.FC<{
  token: Token;
  width?: number;
  height?: number;
  selectedTimeframe?: string;
}> = ({ token, width = 80, height = 32, selectedTimeframe = "24h" }) => {
  const [priceData, setPriceData] = useState<number[]>([]);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const mintAddress =
    token.mint || (token as any).contractAddress || (token as any).address;

  const tfConfig =
    TIMEFRAME_CONFIG[selectedTimeframe] || TIMEFRAME_CONFIG["24h"];
  const cacheKey = `${mintAddress}|${selectedTimeframe}`;

  // Use existing price change from token data as a placeholder direction hint
  const existingPriceChange =
    (token as any)[`price_percent_change_${selectedTimeframe}`] ||
    (token as any).price_percent_change_24h ||
    (token as any).priceChange24h ||
    0;

  // Fetch chart data immediately on mount and whenever timeframe changes.
  // Effect cleanup signals cancellation: a stale fetch resolving after the
  // user clicked a different timeframe pill must NOT overwrite the new
  // pill's priceData. Without this guard, a slow Geckoterminal response
  // for "5m" can land seconds later and replace the user's now-displayed
  // "1h" curve, giving them mismatched sparkline shape + color.
  useEffect(() => {
    if (!mintAddress) return;

    const controller = new AbortController();
    const { signal } = controller;
    const isCancelled = () => signal.aborted;
    const sleep = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, ms);
        const onAbort = () => {
          clearTimeout(t);
          reject(new DOMException("aborted", "AbortError"));
        };
        if (signal.aborted) return onAbort();
        signal.addEventListener("abort", onAbort, { once: true });
      });

    // Cache check (TTL'd so the curve refreshes a few minutes after the user
    // first opens the tab and we don't show stale lines forever).
    const cached = sparklineCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < SPARKLINE_CACHE_TTL_MS) {
      setPriceData(cached.data);
      setPriceChange(cached.priceChange);
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);

    const fetchSparkline = async () => {
      const extractCloses = (result: any): number[] => {
        if (!result?.success || !Array.isArray(result?.data?.items)) return [];
        return result.data.items
          .map((item: any) => Number(item.c))
          .filter((n: number) => Number.isFinite(n) && n > 0);
      };

      let closes: number[] = [];
      try {
        // Phase 1 — primary: token-service OHLCV (rich for tokens our
        // indexer covers; empty for newly-trending pump.fun mints).
        // Send `interval` only (no `timeframe`) — the API handler would
        // otherwise prefer `timeframe` and fall through to 5m for any value
        // not in its INTERVAL_MAP.
        const now = Math.floor(Date.now() / 1000);
        const fromSec = now - tfConfig.windowSec;
        const primary = await fetch(
          `/api/token-service/ohlc?mint=${mintAddress}&interval=${tfConfig.interval}&from=${fromSec}&to=${now}`,
          { signal },
        );
        if (primary.ok) closes = extractCloses(await primary.json());
      } catch {
        if (isCancelled()) return;
        /* otherwise fall through to fallback */
      }

      if (isCancelled()) return;

      // Phase 2 — DEX-side fallback: Geckoterminal returns real OHLCV per
      // pool keyed on pair_address. Used when our indexer hasn't ingested
      // the token yet (most DexScreener-trending pump.fun mints). The proxy
      // dedupes concurrent requests + retries 429s server-side; FE jitter
      // additionally spreads the initial render burst across ~800ms so we
      // stay under Geckoterminal's 30/min/IP limit on a cold tab.
      const pairAddress = token.pair_address;
      const fetchFallback = async () => {
        const r = await fetch(
          `/api/dex-ohlc-fallback?pair_address=${encodeURIComponent(pairAddress)}&timeframe=${encodeURIComponent(selectedTimeframe)}`,
          { signal },
        );
        return r.ok ? extractCloses(await r.json()) : [];
      };

      if (closes.length < 5 && pairAddress) {
        try {
          await sleep(Math.random() * 800);
          if (isCancelled()) return;
          closes = await fetchFallback();
          // Server-side retry already handles the 429 case; a single FE
          // attempt is enough. The architect review flagged the second FE
          // retry as wasted (proxy caches negative results, retry would
          // hit the cached failure anyway).
        } catch (err) {
          if (isCancelled()) return;
          /* otherwise fall through to synth curve */
        }
      }

      if (isCancelled()) return;

      try {
        if (closes.length > 0) {
          const firstPrice = closes[0] || 0;
          const lastPrice = closes[closes.length - 1] || 0;
          const change =
            firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
          sparklineCache.set(cacheKey, {
            data: closes,
            priceChange: change,
            ts: Date.now(),
          });
          setPriceData(closes);
          setPriceChange(change);
        } else {
          // Cache the empty result with a short TTL so subsequent re-renders
          // don't re-fire the whole fetch chain. Re-render churn from WS
          // updates would otherwise hammer the proxy + Geckoterminal.
          sparklineCache.set(cacheKey, {
            data: [],
            priceChange: existingPriceChange,
            ts: Date.now() - SPARKLINE_CACHE_TTL_MS + 60_000, // ~60s effective TTL
          });
          setPriceData([]);
        }
      } catch (err) {
        if (!isCancelled()) {
          console.debug(
            "[Sparkline] Failed to fetch for",
            mintAddress,
            selectedTimeframe,
          );
        }
      } finally {
        if (!isCancelled()) setLoading(false);
      }
    };

    fetchSparkline();

    return () => controller.abort();
  }, [
    cacheKey,
    mintAddress,
    selectedTimeframe,
    tfConfig.interval,
    tfConfig.windowSec,
    token.pair_address,
    existingPriceChange,
  ]);

  // Generate a simple placeholder line based on existing price change data
  const generatePlaceholderLine = () => {
    const isUp = existingPriceChange >= 0;
    const color = isUp ? "#85d99f" : "#f26681";
    // Create a simple diagonal line
    const y1 = isUp ? height - 4 : 4;
    const y2 = isUp ? 4 : height - 4;
    return (
      <svg width={width} height={height}>
        <line
          x1={4}
          y1={y1}
          x2={width - 4}
          y2={y2}
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  };

  // Show placeholder while loading
  if (loading) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ width, height }}
      >
        {existingPriceChange !== 0 ? (
          generatePlaceholderLine()
        ) : (
          <div
            className="h-1 w-full rounded"
            style={{ backgroundColor: AX.border }}
          >
            <div
              className="h-full animate-pulse rounded"
              style={{ backgroundColor: AX.muted, width: "60%" }}
            />
          </div>
        )}
      </div>
    );
  }

  // Prefer real OHLCV; otherwise synthesize a 5-point curve from the
  // per-TF percent changes already on the token. Only fall back to the
  // direction-indicator curve when neither source has data.
  const synthetic =
    priceData.length < 5 ? synthesizeSparklineFromPriceChanges(token) : null;
  const effectiveData: number[] =
    priceData.length >= 5 ? priceData : (synthetic ?? []);
  const effectiveChange =
    priceData.length >= 5 ? priceChange : existingPriceChange;

  if (effectiveData.length < 5) {
    const isUp = effectiveChange >= 0;
    const color = isUp ? "#85d99f" : "#f26681";

    return (
      <div
        className="flex items-center justify-center"
        style={{ width, height }}
      >
        <svg width={width} height={height}>
          {/* Simple curved line showing direction */}
          <path
            d={
              isUp
                ? `M 4 ${height - 6} Q ${width / 2} ${height / 2} ${width - 4} 6`
                : `M 4 6 Q ${width / 2} ${height / 2} ${width - 4} ${height - 6}`
            }
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  // Preserve raw candle closes when the dataset is small enough to render
  // every point — Axiom-style spiky detail is the whole point of a sparkline
  // for a trader. Only downsample (and never smooth) when count would be
  // visually noisy at sparkline resolution.
  const processData = (data: number[]): number[] => {
    if (data.length <= 80) return data;
    // Light downsample: chunk-average to ~80 points, no gaussian smoothing.
    const targetPoints = 80;
    const chunkSize = Math.max(1, Math.floor(data.length / targetPoints));
    const downsampled: number[] = [];
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, Math.min(i + chunkSize, data.length));
      const avg = chunk.reduce((a, b) => a + b, 0) / chunk.length;
      downsampled.push(avg);
    }
    return downsampled;
  };

  const smoothedData = processData(effectiveData);

  // Calculate bounds
  const minPrice = Math.min(...smoothedData);
  const maxPrice = Math.max(...smoothedData);
  const priceRange = maxPrice - minPrice || 1;

  const padding = 2;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  // Convert to coordinates
  const coords = smoothedData.map((price, i) => ({
    x: padding + (i / (smoothedData.length - 1)) * chartWidth,
    y: padding + chartHeight - ((price - minPrice) / priceRange) * chartHeight,
  }));

  // Real OHLCV: sharp polyline preserves spike shape — Axiom-style. Bezier
  // smoothing rounds off real price moves traders need to see.
  const createPolyline = (pts: { x: number; y: number }[]): string => {
    if (pts.length < 2) return "";
    let path = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      path += ` L ${pts[i].x},${pts[i].y}`;
    }
    return path;
  };

  // Synthesized data (only 5 anchor points from per-TF percent changes):
  // Catmull-Rom-to-cubic-bezier interpolation makes the curve read as an
  // organic chart instead of a polygon. We don't fabricate intermediate
  // values — the curve still passes through every anchor — but the smooth
  // tangents fill in plausible micro-shape between the macro datapoints.
  const createSmoothPath = (pts: { x: number; y: number }[]): string => {
    if (pts.length < 2) return "";
    if (pts.length === 2)
      return `M ${pts[0].x},${pts[0].y} L ${pts[1].x},${pts[1].y}`;
    let path = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return path;
  };

  const isSynthetic = priceData.length < 5 && synthetic !== null;
  const linePath = isSynthetic
    ? createSmoothPath(coords)
    : createPolyline(coords);

  // Create closed path for gradient fill
  const fillPath =
    linePath +
    ` L ${coords[coords.length - 1].x},${padding + chartHeight}` +
    ` L ${coords[0].x},${padding + chartHeight} Z`;

  const isPositive = effectiveChange >= 0;
  const strokeColor = isPositive ? "#85d99f" : "#f26681";
  const gradientId = `sparkline-gradient-${mintAddress?.slice(0, 8)}-${selectedTimeframe}`;

  return (
    <div className="flex items-center justify-center">
      <svg width={width} height={height} className="overflow-visible">
        <defs>
          {/* Gradient fill matches Axiom: stronger near the line, fades to
              transparent at the bottom for visual weight without a hard edge. */}
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.35" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={fillPath} fill={`url(#${gradientId})`} />
        <path
          d={linePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

// Audit Log Cell Component
const AuditLogCell: React.FC<{
  token: Token;
  selectedTimeframe: string;
  isDiscoverPage?: boolean;
}> = ({ token, selectedTimeframe, isDiscoverPage = false }) => {
  const percentChange = getTokenStat(
    token,
    "price_percent_change",
    selectedTimeframe,
  );

  const buyCount = (token as any)[`total_buys_${selectedTimeframe}`] || 0;
  const sellCount = (token as any)[`total_sells_${selectedTimeframe}`] || 0;

  const monospaceFont =
    'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1">
        <span
          className={`h-2 w-2 rounded-full ${isDiscoverPage ? "" : percentChange >= 0 ? "bg-emerald-400" : "bg-red-400"}`}
          style={
            isDiscoverPage
              ? { backgroundColor: percentChange >= 0 ? "#85d99f" : "#f26681" }
              : {}
          }
        ></span>
        <span
          className={`text-xs font-medium ${isDiscoverPage ? "number-font" : ""}`}
          style={{
            color: AX.text,
            ...(isDiscoverPage
              ? {}
              : {
                  fontFamily: monospaceFont,
                  fontWeight: "400",
                }),
          }}
        >
          {Math.abs(percentChange).toFixed(2)}%
        </span>
      </div>
      <div className="flex gap-2 text-xs" style={{ color: AX.muted }}>
        <span
          className={isDiscoverPage ? "number-font" : ""}
          style={
            isDiscoverPage
              ? {}
              : { fontFamily: monospaceFont, fontWeight: "400" }
          }
        >
          B: {formatSmartNumber(buyCount)}
        </span>
        <span
          className={isDiscoverPage ? "number-font" : ""}
          style={
            isDiscoverPage
              ? {}
              : { fontFamily: monospaceFont, fontWeight: "400" }
          }
        >
          S: {formatSmartNumber(sellCount)}
        </span>
      </div>
    </div>
  );
};

// Compact Token Metric Display Component
const TokenMetric: React.FC<{
  icon: React.ReactNode;
  value: string;
  color: string;
  tooltip: string;
}> = ({ icon, value, color, tooltip }) => (
  <div className="flex cursor-help items-center gap-1" title={tooltip}>
    <span style={{ color }}>{icon}</span>
    <span className="number-font text-xs font-medium" style={{ color }}>
      {value}
    </span>
  </div>
);

// Format percentage value for display
const formatPercent = (val: number | undefined): string => {
  if (val === undefined || val === null) return "0";
  // If value is <= 1, it's a decimal that needs to be converted to percentage
  const percent = val <= 1 ? val * 100 : val;
  if (percent >= 100) return `${Math.round(percent)}`;
  if (percent >= 10) return `${percent.toFixed(1)}`;
  return `${percent.toFixed(2)}`;
};

// Token Info Cell Component - displays holder metrics from trending WebSocket
const TokenInfoCell: React.FC<{
  token: Token;
  isDiscoverPage?: boolean;
  tableType?: "trending" | "newPairs" | "xStocks" | "dexscreener";
}> = ({ token, isDiscoverPage = false, tableType = "trending" }) => {
  const holderCount = (token as any).holder_count;
  const top10Percent = (token as any).top10_holders_percent;
  const insiderPercent = (token as any).insider_percent;
  const sniperPercent = (token as any).sniper_percent;
  const bundlePercent = (token as any).bundle_percent;

  // For newPairs, just show holder count
  if (tableType === "newPairs") {
    return (
      <div className="flex items-center justify-center">
        <span
          className="number-font text-sm font-medium"
          style={{ color: "#31e3ac" }}
        >
          {holderCount !== undefined && holderCount > 0
            ? formatSmartNumber(holderCount)
            : "—"}
        </span>
      </div>
    );
  }

  // Check if this token has trending data (from useTrendingWebSocket)
  const hasTrendingData =
    holderCount !== undefined ||
    bundlePercent !== undefined ||
    insiderPercent !== undefined ||
    sniperPercent !== undefined ||
    top10Percent !== undefined;

  // If no trending data, show placeholder
  if (!hasTrendingData) {
    return (
      <div className="flex items-center justify-center">
        <span className="text-xs" style={{ color: AX.muted }}>
          —
        </span>
      </div>
    );
  }

  // Colors
  const greenColor = "#31e3ac";
  const yellowColor = "#f2c367";
  const redColor = "#f26681";

  // Trending: all five metrics on a single horizontal row (column was widened
  // to w-52 to accommodate). Other tabs keep the original 2-row stack.
  const isTrending = tableType === "trending";

  if (isTrending) {
    // Tighter chip-row gap (gap-1.5) so 4–5 metric chips fit on a single row in
    // the widened w-60 column. flex-wrap is the safety net for extreme cases.
    return (
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {holderCount !== undefined && holderCount > 0 && (
          <TokenMetric
            icon={<FaUsers size={11} />}
            value={formatSmartNumber(holderCount)}
            color={greenColor}
            tooltip={`Holders: ${holderCount.toLocaleString()}`}
          />
        )}
        {top10Percent !== undefined && top10Percent > 0 && (
          <TokenMetric
            icon={<BsPersonGear size={11} />}
            value={`${formatPercent(top10Percent)}%`}
            color={greenColor}
            tooltip={`Top 10 Holders: ${formatPercent(top10Percent)}%`}
          />
        )}
        {insiderPercent !== undefined && insiderPercent > 0 && (
          <TokenMetric
            icon={<RiGhostLine size={11} />}
            value={`${formatPercent(insiderPercent)}%`}
            color={yellowColor}
            tooltip={`Insider Holding: ${formatPercent(insiderPercent)}%`}
          />
        )}
        {sniperPercent !== undefined && sniperPercent > 0 && (
          <TokenMetric
            icon={<SnipperIcon size={11} />}
            value={`${formatPercent(sniperPercent)}%`}
            color={redColor}
            tooltip={`Sniper Holding: ${formatPercent(sniperPercent)}%`}
          />
        )}
        {bundlePercent !== undefined && bundlePercent > 0 && (
          <TokenMetric
            icon={<GoStack size={11} />}
            value={`${formatPercent(bundlePercent)}%`}
            color={yellowColor}
            tooltip={`Bundler Holdings: ${formatPercent(bundlePercent)}%`}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {/* Row 1: Holders + Top 10 */}
      <div className="flex items-center justify-center gap-3">
        {holderCount !== undefined && holderCount > 0 && (
          <TokenMetric
            icon={<FaUsers size={11} />}
            value={formatSmartNumber(holderCount)}
            color={greenColor}
            tooltip={`Holders: ${holderCount.toLocaleString()}`}
          />
        )}
        {top10Percent !== undefined && top10Percent > 0 && (
          <TokenMetric
            icon={<BsPersonGear size={11} />}
            value={`${formatPercent(top10Percent)}%`}
            color={greenColor}
            tooltip={`Top 10 Holders: ${formatPercent(top10Percent)}%`}
          />
        )}
      </div>
      {/* Row 2: Insider + Sniper + Bundle */}
      <div className="flex items-center justify-center gap-3">
        {insiderPercent !== undefined && insiderPercent > 0 && (
          <TokenMetric
            icon={<RiGhostLine size={11} />}
            value={`${formatPercent(insiderPercent)}%`}
            color={yellowColor}
            tooltip={`Insider Holding: ${formatPercent(insiderPercent)}%`}
          />
        )}
        {sniperPercent !== undefined && sniperPercent > 0 && (
          <TokenMetric
            icon={<SnipperIcon size={11} />}
            value={`${formatPercent(sniperPercent)}%`}
            color={redColor}
            tooltip={`Sniper Holding: ${formatPercent(sniperPercent)}%`}
          />
        )}
        {bundlePercent !== undefined && bundlePercent > 0 && (
          <TokenMetric
            icon={<GoStack size={11} />}
            value={`${formatPercent(bundlePercent)}%`}
            color={yellowColor}
            tooltip={`Bundler Holdings: ${formatPercent(bundlePercent)}%`}
          />
        )}
      </div>
    </div>
  );
};

// Table Row Component
const TableRow: React.FC<{
  token: Token;
  i: number;
  selectedTimeframe: string;
  onQuickBuy?: (token: Token) => void;
  quickBuyAmount: number | string;
  animationState: Record<string, "up" | "down" | null>;
  sortedRows: InterstateTableRow[];
  onClick: () => void;
  onHover?: () => void;
  isDiscoverPage?: boolean;
  chain?: string; // 'sol' | 'monad' - chain identifier
  tableType?: "trending" | "newPairs" | "xStocks" | "dexscreener";
  solPrice?: number;
}> = React.memo(
  ({
    token,
    i,
    selectedTimeframe,
    onQuickBuy,
    quickBuyAmount,
    animationState,
    sortedRows,
    onClick,
    onHover,
    isDiscoverPage = false,
    chain = "sol",
    tableType = "trending",
    solPrice = 0,
  }) => {
    const handleQuickBuy = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onQuickBuy) {
          onQuickBuy(token);
        } else {
          onClick();
        }
      },
      [onQuickBuy, token, onClick],
    );

    // For newPairs, use PulseTable-style volume: try all timeframes, sum buy+sell, convert SOL→USD
    // For other tables (trending/top/gainers), getVolume prefers SOL × Pyth
    // when the backend ships SOL fields, otherwise falls back to USD path.
    const volume =
      tableType === "newPairs" && solPrice > 0
        ? getNewPairVolume(token, solPrice)
        : getVolume(token, selectedTimeframe, solPrice);

    // Debug volume calculation
    // console.log('Volume calculation debug:', {
    //   tokenName: token.name,
    //   selectedTimeframe,
    //   totalVolume: volume,
    //   preferredBuySell: {
    //     buy: (token as any)[`total_buy_volume_${selectedTimeframe}`],
    //     sell: (token as any)[`total_sell_volume_${selectedTimeframe}`],
    //   },
    //   fallbackAggregated: (token as any)[`volume_${selectedTimeframe}`],
    // });

    // Calculate alternating row background color for discover page
    const rowBgColor = isDiscoverPage
      ? i % 2 === 0
        ? "transparent"
        : "rgba(255, 255, 255, 0.02)"
      : "transparent";

    // Trending tab gets a redesigned row layout: wider Token + Holders columns,
    // wider TXNS so its buy/sell numbers stop touching the Volume cell, and
    // `group` so child cells can hover-reveal the dense socials/copy/search row.
    const isTrending = tableType === "trending";

    return (
      <tr
        className={`group h-16 cursor-pointer border-b`}
        style={{
          borderColor: isDiscoverPage ? "rgba(255, 255, 255, 0.03)" : AX.border,
          backgroundColor: rowBgColor,
          transition: "none", // Disable all transitions for instant rendering
        }}
        onMouseEnter={(e) => {
          if (isDiscoverPage) {
            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
          } else {
            e.currentTarget.style.backgroundColor = AX.surface2;
          }
          onHover?.();
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = rowBgColor;
        }}
        onClick={onClick}
      >
        <td
          className={`${isTrending ? "w-72" : "w-64"} px-4 py-2.5 align-middle`}
        >
          <TokenInfo
            token={token}
            i={i}
            sortedRows={sortedRows}
            isDiscoverPage={isDiscoverPage}
            chain={chain}
            tableType={tableType}
          />
        </td>

        {/* Sparkline column — trending and dexscreener follow the user-selected
            timeframe (5m/1h/6h/24h); other tabs keep legacy 24h behaviour. */}
        {tableType !== "newPairs" && (
          <td
            className={`${isTrending ? "w-28" : "w-32"} px-2 py-2.5 align-middle`}
          >
            <div className="flex justify-center">
              <MiniSparkline
                token={token}
                width={isTrending ? 100 : 120}
                height={32}
                selectedTimeframe={
                  isTrending || tableType === "dexscreener"
                    ? selectedTimeframe
                    : "24h"
                }
              />
            </div>
          </td>
        )}

        <td
          className={`${isTrending ? "w-28" : "w-32"} px-4 py-2.5 text-right align-middle`}
        >
          <MarketCapCell
            token={token}
            selectedTimeframe={selectedTimeframe}
            animationState={animationState}
            isDiscoverPage={isDiscoverPage}
          />
        </td>

        <td className="w-28 px-4 py-2.5 text-right align-middle">
          {/* {(() => {
          console.log('Liquidity Debug:', {
            tokenName: token.name,
            totalLiquidityUsd: token.total_liquidity_usd,
            totalLiquidityUsdType: typeof token.total_liquidity_usd
          });
          return null;
        })()} */}
          {(() => {
            // Color-graduated liquidity. Three bands so traders eye-scan risk:
            //   < $5K   = red    (high risk, dust pool)
            //   < $50K  = amber  (caution; matches market-cap warm amber #f2c367)
            //   >= $50K = default (normal)
            const liquidity = token.total_liquidity_usd || 0;
            let liquidityColor = AX.text;
            if (isDiscoverPage) {
              if (liquidity < 5000) liquidityColor = "#f26681";
              else if (liquidity < 50000) liquidityColor = "#f2c367";
            }

            return (
              <div
                className={`text-base font-medium ${isDiscoverPage ? "number-font" : ""}`}
                style={{
                  color: isDiscoverPage ? liquidityColor : AX.text,
                  ...(isDiscoverPage
                    ? {}
                    : {
                        fontFamily:
                          'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                        fontWeight: "400",
                      }),
                }}
              >
                ${formatSmartNumber(token.total_liquidity_usd)}
              </div>
            );
          })()}
        </td>

        {/* Volume column - hidden for newPairs */}
        {tableType !== "newPairs" && (
          <td className="w-28 px-4 py-2.5 text-right align-middle">
            <div
              className={`text-base font-medium ${isDiscoverPage ? "number-font" : ""}`}
              style={{
                color: AX.text,
                ...(isDiscoverPage
                  ? {}
                  : {
                      fontFamily:
                        'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                      fontWeight: "400",
                    }),
              }}
            >
              {/* Show "0" on discover page, "-" on other pages when volume is 0 */}
              {volume === 0
                ? isDiscoverPage
                  ? "$0"
                  : "-"
                : `$${formatSmartNumber(volume)}`}
            </div>
          </td>
        )}

        {/* TXNS data is centered (matches the centered header) for the
            compact buys/sells variant. New Pairs uses the default variant
            which is right-aligned single-number transaction count.
            DexScreener uses the same compact variant as Trending. */}
        <td
          className={`${isTrending ? "w-32" : "w-24"} px-4 py-2.5 align-middle ${tableType === "newPairs" ? "text-right" : "text-center"}`}
        >
          <TxnsCell
            token={token}
            selectedTimeframe={selectedTimeframe}
            isDiscoverPage={isDiscoverPage}
            variant={tableType === "newPairs" ? "default" : "compact"}
          />
        </td>

        {/* Gas Fees column - commented out per user request
      <td className="w-28 px-4 py-2.5 align-middle text-right">
        <div className={`text-base font-medium ${isDiscoverPage ? 'number-font' : ''}`} style={{
          color: AX.text,
          ...(isDiscoverPage ? {} : {
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
            fontWeight: '400'
          })
        }}>
          {formatLamportsToSol((token as any).total_fees_lamports)}
        </div>
      </td>
      */}

        {/* Token Info column - displays holder metrics from trending WebSocket (hidden for newPairs and dexscreener; hidden below xl so Action stays visible) */}
        {tableType !== "dexscreener" && tableType !== "newPairs" && (
          <td
            className={`${isTrending ? "w-64" : "w-40"} hidden px-2 py-2.5 align-middle xl:table-cell`}
          >
            <TokenInfoCell
              token={token}
              isDiscoverPage={isDiscoverPage}
              tableType={tableType}
            />
          </td>
        )}

        <td
          className={`${isTrending ? "w-28" : "w-32"} px-4 py-2.5 text-center align-middle`}
        >
          {isDiscoverPage ? (
            <button
              onClick={handleQuickBuy}
              className="mx-auto flex cursor-pointer items-center justify-center gap-1.5 text-sm font-medium transition-all duration-200"
              style={{
                backgroundColor: "#272a2e",
                color: "#85d99f",
                padding: "8px 12px",
                borderRadius: "4px",
                minHeight: "32px",
                width: "auto",
                maxWidth: "120px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#2f3238";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#272a2e";
              }}
            >
              <HiLightningBolt size={14} style={{ color: "#85d99f" }} />
              <span style={{ color: "#85d99f" }}>
                {quickBuyAmount} {chain === "monad" ? "MON" : "SOL"}
              </span>
            </button>
          ) : (
            <InterstateButton
              variant="primary"
              size="sm"
              className="w-full !px-3 !py-2 text-sm font-medium"
              onClick={handleQuickBuy}
            >
              Buy {quickBuyAmount} {chain === "monad" ? "MON" : "SOL"}
            </InterstateButton>
          )}
        </td>
      </tr>
    );
  },
);

TableRow.displayName = "TableRow";

// Main Table Component
export default function InterstateTable({
  rows,
  onQuickBuy,
  sortKey,
  sortDirection,
  setSort,
  selectedTimeframe,
  quickBuyAmount = 0.44,
  skeletonRowCount = 6,
  isDiscoverPage: isDiscoverPageProp,
  chain = "sol",
  tableType = "trending",
  solPrice = 0,
}: InterstateTableProps) {
  const router = useRouter();
  const { filter } = useFilter();
  const [animationState, setAnimationState] = useState<
    Record<string, "up" | "down" | null>
  >({});
  const prevValuesRef = useRef<Record<string, number>>({});

  // Memoized filtered and sorted rows
  const sortedRows = useMemo(() => {
    //console.log('', {});

    const filteredRows = rows.filter(
      ({ token }) => !token.amm || filter.amms.includes(token.amm),
    );

    // console.log('🔧 Filtered rows:', {
    //   before: rows.length,
    //   after: filteredRows.length,
    //   filteredOut: rows.length - filteredRows.length
    // });

    if (!sortKey) return filteredRows;

    return [...filteredRows].sort((a, b) => {
      const aVal = getSortableValue(
        a.token,
        sortKey,
        selectedTimeframe,
        solPrice,
      );
      const bVal = getSortableValue(
        b.token,
        sortKey,
        selectedTimeframe,
        solPrice,
      );
      const diff = aVal - bVal;
      if (diff === 0) {
        // Stable tiebreaker to reduce jitter between polls
        const aAddress = a.token.pair_address || a.token.mint || "";
        const bAddress = b.token.pair_address || b.token.mint || "";
        return aAddress.localeCompare(bAddress);
      }
      return sortDirection === "asc" ? diff : -diff;
    });
    // solPrice intentionally NOT in deps: it's a positive scalar applied to
    // every volume cell equally, so it can never change relative ordering
    // — only magnitudes. Including it would re-sort the entire table on
    // every Pyth tick (multiple times per second) for no observable change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, sortDirection, filter.amms, selectedTimeframe]);

  // Price animation effect
  useEffect(() => {
    const newAnimationState: Record<string, "up" | "down" | null> = {};
    const newPrevValues = { ...prevValuesRef.current };

    rows.forEach(({ token }) => {
      const priceKey = `${token.pair_address}-usd_price`;
      const price = token.usd_price;

      if (priceKey in prevValuesRef.current) {
        if (price > prevValuesRef.current[priceKey]) {
          newAnimationState[priceKey] = "up";
        } else if (price < prevValuesRef.current[priceKey]) {
          newAnimationState[priceKey] = "down";
        }
      }
      newPrevValues[priceKey] = price;

      const percentFieldKey = `${token.pair_address}-price_percent_change_${selectedTimeframe}`;
      const percentValue =
        (token as any)[`price_percent_change_${selectedTimeframe}`] ?? 0;

      if (percentFieldKey in prevValuesRef.current) {
        if (percentValue > prevValuesRef.current[percentFieldKey]) {
          newAnimationState[percentFieldKey] = "up";
        } else if (percentValue < prevValuesRef.current[percentFieldKey]) {
          newAnimationState[percentFieldKey] = "down";
        }
      }
      newPrevValues[percentFieldKey] = percentValue;
    });

    setAnimationState(newAnimationState);
    prevValuesRef.current = newPrevValues;

    if (Object.keys(newAnimationState).length > 0) {
      const timeout = setTimeout(() => setAnimationState({}), 300);
      return () => clearTimeout(timeout);
    }
  }, [rows, selectedTimeframe]);

  const isDiscoverPage =
    isDiscoverPageProp !== undefined
      ? isDiscoverPageProp
      : router.pathname === "/discover";

  return (
    <div
      className={isDiscoverPage ? "mx-4 overflow-hidden rounded-xl" : ""}
      style={
        isDiscoverPage
          ? {
              border: "1px solid rgba(255, 255, 255, 0.06)",
              backgroundColor: "rgba(255, 255, 255, 0.03)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
            }
          : {}
      }
    >
      <div
        className="w-full overflow-x-auto shadow-lg"
        style={{
          backgroundColor: isDiscoverPage
            ? "transparent"
            : "rgba(30, 31, 38, 0.3)",
          ...(!isDiscoverPage
            ? {
                border: `1px solid ${AX.border}`,
                borderRadius: "0.5rem",
              }
            : {}),
        }}
      >
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
          .price-animate-up {
            background: ${isDiscoverPage
              ? "rgba(133, 217, 159, 0.2)"
              : "rgba(52, 211, 153, 0.2)"};
            animation: pulse-green 0.6s ease-out;
          }
          .price-animate-down {
            background: ${isDiscoverPage
              ? "rgba(242, 102, 129, 0.2)"
              : "rgba(248, 113, 113, 0.2)"};
            animation: pulse-red 0.6s ease-out;
          }
          @keyframes pulse-green {
            0% {
              background: ${isDiscoverPage
                ? "rgba(133, 217, 159, 0.4)"
                : "rgba(52, 211, 153, 0.4)"};
            }
            100% {
              background: transparent;
            }
          }
          @keyframes pulse-red {
            0% {
              background: ${isDiscoverPage
                ? "rgba(242, 102, 129, 0.4)"
                : "rgba(248, 113, 113, 0.4)"};
            }
            100% {
              background: transparent;
            }
          }
          .table-wrapper {
            table-layout: fixed;
            width: 100%;
          }
          .table-wrapper tbody tr {
            transition: none !important;
            animation: none !important;
          }
          .table-wrapper tbody tr td {
            transition: none !important;
            animation: none !important;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .table-wrapper thead th {
            white-space: nowrap;
          }
        `}</style>

        <table
          className="table-wrapper min-w-full"
          style={{
            borderCollapse: "collapse",
            borderSpacing: 0,
            tableLayout: "fixed",
            width: "100%",
          }}
        >
          <TableHeader
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={setSort}
            isDiscoverPage={isDiscoverPage}
            tableType={tableType}
            selectedTimeframe={selectedTimeframe}
          />

          <tbody>
            {sortedRows.length === 0
              ? Array.from({ length: skeletonRowCount }).map((_, idx) => (
                  <SkeletonRow key={idx} />
                ))
              : sortedRows.map(({ token, i }) => {
                  const handleTokenClick = () => {
                    // Navigate immediately — don't block on backfill
                    const address = token.mint || token.pair_address;
                    if (!address) return;

                    // Check if this is a Monad token
                    const isMonad = chain === "monad";

                    if (isMonad) {
                      const queryParams = new URLSearchParams();
                      if (token.name) queryParams.set("_name", token.name);
                      if (token.symbol)
                        queryParams.set("_symbol", token.symbol);
                      if (token.fully_diluted_value)
                        queryParams.set(
                          "_mcap",
                          token.fully_diluted_value.toString(),
                        );
                      if (token.uri || token.logo)
                        queryParams.set(
                          "_image",
                          token.uri || token.logo || "",
                        );
                      queryParams.set("_mint", token.mint || address);
                      if (token.launchpad_protocol)
                        queryParams.set(
                          "_launchpad_protocol",
                          token.launchpad_protocol,
                        );
                      if (token.created_at)
                        queryParams.set("_created_at", token.created_at);
                      if (token.total_liquidity_usd)
                        queryParams.set(
                          "_liquidity",
                          String(token.total_liquidity_usd),
                        );
                      queryParams.set("chain", "monad");
                      router.push(
                        `/trade/monad/${address}?${queryParams.toString()}`,
                      );
                    } else {
                      router.push(`/trade/${address}`);
                    }

                    // Fire-and-forget: backfill token in background
                    fetch("/api/token-service/backfill-token", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        mint: token.mint,
                        name: token.name,
                        symbol: token.symbol,
                        uri: token.uri,
                        market_cap_usd: token.fully_diluted_value,
                        liquidity_usd: token.total_liquidity_usd,
                        pair_address: token.pair_address,
                      }),
                    })
                      .then((res) => {
                        if (res.ok && isDev)
                          console.log("Token backfilled successfully");
                      })
                      .catch((err) =>
                        console.error("❌ Error backfilling token:", err),
                      );
                  };

                  let hoverFired = false;
                  const handleTokenHover = () => {
                    if (hoverFired) return;
                    hoverFired = true;
                    const address = token.mint || token.pair_address;
                    if (!address) return;
                    // Build tradeUrl matching handleTokenClick navigation exactly
                    const isMonad = chain === "monad";
                    const hoverTradeUrl = isMonad
                      ? `/trade/monad/${address}`
                      : `/trade/${address}`;
                    preloadTradeChart(
                      {
                        mint: token.mint,
                        pairAddress: token.pair_address,
                        chain: isMonad ? "monad" : "sol",
                        name: token.name,
                        symbol: token.symbol,
                        marketCapUsd: token.fully_diluted_value,
                        image: token.uri || token.logo || "",
                        launchpadProtocol: token.launchpad_protocol,
                        createdAt: token.created_at,
                      },
                      { router, tradeUrl: hoverTradeUrl },
                    );
                  };

                  return (
                    <TableRow
                      // CRITICAL: key MUST be `mint` first. Many distinct pump.fun mints
                      // share the same `pair_address` (bonding-curve / program address from
                      // the backend). Using pair_address as the key collapses N rows onto
                      // one key, React fails to reconcile, old <tr> nodes accumulate in the
                      // tbody unboundedly, and the page freezes after ~5 min. Mint is
                      // guaranteed unique (normalizeToken returns null without one).
                      key={token.mint || token.pair_address}
                      token={token}
                      i={i}
                      selectedTimeframe={selectedTimeframe}
                      onQuickBuy={onQuickBuy}
                      quickBuyAmount={quickBuyAmount}
                      animationState={animationState}
                      sortedRows={sortedRows}
                      onClick={handleTokenClick}
                      onHover={handleTokenHover}
                      isDiscoverPage={isDiscoverPage}
                      chain={chain}
                      tableType={tableType}
                      solPrice={solPrice}
                    />
                  );
                })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
