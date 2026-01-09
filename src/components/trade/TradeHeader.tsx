// components/trade/TradeHeader.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Token } from "~/utils/db";
import { formatSmartNumber, formatLamportsToSol } from "~/utils/db";
import { useWatchlist } from "../WatchlistContext";
import { SubscriptNumber } from "../InterstateTable";
import FastImage from "../FastImage";
import useMarketDataWebSocket from "~/hooks/useMarketDataWebSocket";
import { useRouter } from "next/router";
import { getProtocolBranding } from "~/utils/protocolBranding";
import type { SolanaTokenInfo, SolanaTokenVolume } from "~/hooks/useSolanaTokenWebSocket";

import { IoShareSocialOutline } from "react-icons/io5";
import {
  FaRegStar,
  FaStar,
  FaSearch,
  FaExpand,
  FaCamera,
  FaRegCopy,
  FaUser,
} from "react-icons/fa";
import { LuPill, LuDroplet, LuSearch } from "react-icons/lu";
import Link from "next/link";
import { CiTrophy } from "react-icons/ci";
import { FaXTwitter } from "react-icons/fa6";
import { FiGlobe } from "react-icons/fi";
import { GoPeople } from "react-icons/go";
import {
  PiTelegramLogo,
  PiCrownSimpleLight,
  PiRobotLight,
} from "react-icons/pi";
import ColorFillBar from "../ColorFillBar";

const MONAD_PROTOCOL_KEYWORDS = ["nad.fun", "nadfun", "flap.sh", "flapsh", "kuru"];
const MONAD_BRAND = {
  color: "#9B59B6",
  icon: "https://i0.wp.com/www.gizmotimes.com/wp-content/uploads/2023/10/Monad-Logo.png?fit=1920%2C1080&ssl=1",
};
// Monad candle colors (matches chart colors)
const MONAD_RED = '#f26682';

/* ---------- AXIOM palette ---------- */
const AX = {
  bg: "#0f1012",
  surface: "#1A1A1A",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#f0f5f5",
  muted: "#9CA3AF",
  green: "#3DDC84",
  blue: "#8EC5FF",
  warning: "#facc15",
  aiBlue: "#3B82F6",
  aiGreen: "#18c48c",
  aiCyan: "#06B6D4",
  glowBlue: "rgba(59, 130, 246, 0.35)",
  glowGreen: "rgba(24, 196, 140, 0.3)",
  glowCyan: "rgba(6, 182, 212, 0.3)",
};

const DEFAULT_PROTOCOL_COLOR = "#22c55e";
const DEFAULT_PROTOCOL_ICON =
  "https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png";

const normalizeKey = (s?: string) =>
  (s || "").toLowerCase().replace(/\s+/g, "").replace(/_/g, "");

const rawProtocolColorMap: Record<string, string> = {
  pump: DEFAULT_PROTOCOL_COLOR,
  "pump.fun": DEFAULT_PROTOCOL_COLOR,
  bonk: "#ff6b35",
  bags: DEFAULT_PROTOCOL_COLOR,
  moonshot: "#eab308",
  moonshoot: "#eab308",
  moonit: "#eab308",
  heaven: "#8b5cf6",
  "daos.fun": "#06b6d4",
  candle: "#f59e0b",
  sugar: "#ec4899",
  believe: "#10b981",
  jupiter: "#8b5cf6",
  boop: "#134577",
  boopfun: "#134577",
  launchlab: "#3b82f6",
  dynamic: "#526fff",
  raydium: "#5c51f7",
  raydiumlaunchpad: "#5c51f7",
  meteora: "#ff4662",
  meteora_v2: "#ff4662",
  pump_amm: "#e9ba14",
  orca: "#0ea5e9",
};

const normalizedProtocolColorMap: Record<string, string> = Object.fromEntries(
  Object.entries(rawProtocolColorMap).map(([key, value]) => [
    normalizeKey(key),
    value,
  ]),
);

const formatMarketCap = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return "-";

  const numericValue =
    typeof value === "string"
      ? parseFloat(value.replace(/,/g, ""))
      : Number(value);

  if (!Number.isFinite(numericValue)) return "-";

  const abs = Math.abs(numericValue);

  const abbreviations = [
    { value: 1e12, suffix: "T" },
    { value: 1e9, suffix: "B" },
    { value: 1e6, suffix: "M" },
    { value: 1e3, suffix: "K" },
  ];

  for (const { value: threshold, suffix } of abbreviations) {
    if (abs >= threshold) {
      const formatted = (numericValue / threshold).toFixed(2);
      return formatted.endsWith(".00")
        ? `${parseInt(formatted)}${suffix}`
        : `${formatted}${suffix}`;
    }
  }

  if (abs >= 1) {
    return numericValue.toFixed(2);
  }

  if (abs === 0) {
    return "0";
  }

  return numericValue.toFixed(2);
};

function extractProtocolRaw(token: Token | null): string | null {
  if (!token) return null;
  const candidates = [
    (token as any).launchpad_protocol,
    (token as any).protocol,
    (token as any).launchpadName,
    (token as any).amm,
  ];
  for (const candidate of candidates) {
    if (candidate == null) continue;
    const value = String(candidate).toLowerCase().trim();
    if (value) return value;
  }
  return null;
}

function resolveProtocolColor(
  token: Token,
  columnType: "new" | "final-stretch" | "migrated",
): string {
  const raw = extractProtocolRaw(token);
  if (!raw) return DEFAULT_PROTOCOL_COLOR;

  if (raw.includes("meteora")) {
    return columnType === "migrated" ? "#eab308" : "#ff4662";
  }

  if (raw.includes("pump")) {
    return columnType === "migrated" ? "#eab308" : DEFAULT_PROTOCOL_COLOR;
  }

  if (raw.includes("launch")) {
    return columnType === "migrated" ? "#eab308" : "#3b82f6";
  }

  const normalized = normalizeKey(raw);

  if (rawProtocolColorMap[raw]) return rawProtocolColorMap[raw];
  if (normalizedProtocolColorMap[normalized])
    return normalizedProtocolColorMap[normalized];

  if (raw.includes("raydium")) return "#5c51f7";
  if (
    raw.includes("moonit") ||
    raw.includes("moonshot") ||
    raw.includes("moonshoot")
  )
    return "#eab308";
  if (raw.includes("boop")) return "#134577";
  if (raw.includes("bonk")) return "#ff6b35";
  if (raw.includes("bags")) return DEFAULT_PROTOCOL_COLOR;
  if (raw.includes("orca")) return "#0ea5e9";
  if (raw.includes("jupiter")) return "#8b5cf6";

  return DEFAULT_PROTOCOL_COLOR;
}

function resolveProtocolIcon(token: Token): string {
  const raw = extractProtocolRaw(token);
  if (!raw) return DEFAULT_PROTOCOL_ICON;

  if (raw.includes("meteora")) {
    return "https://s1.coincarp.com/logo/1/meteora.png?style=72&v=1759911013";
  }

  if (raw.includes("raydium") || raw.includes("launch")) {
    return "https://s2.coinmarketcap.com/static/img/coins/64x64/8526.png";
  }

  if (raw.includes("boop")) {
    return "https://api.phantom.app/image-proxy/?image=https%3A%2F%2Fdhc7eusqrdwa0.cloudfront.net%2Fassets%2FBOOP_logo_icon_dark_bg.png&anim=true";
  }

  if (
    raw.includes("moonit") ||
    raw.includes("moonshot") ||
    raw.includes("moonshoot")
  ) {
    return "https://avatars.githubusercontent.com/u/174132191?s=280&v=4";
  }

  if (raw.includes("bonk")) {
    return "https://s3.coinmarketcap.com/static-gravity/image/a28128d9ff7c49c9ad33ee2f626fda40.png";
  }

  if (raw.includes("bags")) {
    return "https://play-lh.googleusercontent.com/7AxVcu1pumxavcGTb16WBJQU88CDZd0v8q0WzFwfin7zbBvItYMuNQ0Xkqq4srTw4A=w240-h480-rw";
  }

  if (raw.includes("pump")) {
    return DEFAULT_PROTOCOL_ICON;
  }

  return DEFAULT_PROTOCOL_ICON;
}

function shouldFillProtocolBadge(token: Token): boolean {
  const raw = extractProtocolRaw(token) || "";
  return ["meteora", "bonk", "bags", "moonit", "moonshot", "moonshoot"].some(
    (needle) => raw.includes(needle),
  );
}

/* ---------- helpers ---------- */
function getTokenAge(createdAt: string | number) {
  if (!createdAt && createdAt !== 0) return "Unknown";
  let timestamp = createdAt as any;
  if (typeof timestamp === "number" && timestamp < 10000000000)
    timestamp *= 1000;
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return "Unknown";
  const ms = Date.now() - d.getTime();
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(ms / 86400000);
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

function normalizeAssetUrl(raw?: string): string | null {
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

function resolveTwitterInfo(token: Token | null): {
  url: string | null;
  handle: string | null;
} {
  if (!token) return { url: null, handle: null };

  const candidates = [
    (token as any).twitter,
    (token as any).twitter_url,
    (token as any).x,
    (token as any).x_url,
    (token as any).socials?.twitter,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    let value = String(candidate).trim();
    if (!value) continue;

    value = value.replace(/^https?:\/\/(www\.)?(twitter\.com|x\.com)\//i, "");
    value = value.replace(/^@/, "");
    value = value.split(/[/?#]/)[0];

    if (!value) continue;

    const handle = value.toLowerCase();
    return {
      handle,
      url: `https://twitter.com/${handle}`,
    };
  }

  const fallback = (token.symbol || token.name || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/gi, "");
  if (fallback) {
    return {
      handle: fallback,
      url: `https://twitter.com/${fallback}`,
    };
  }

  return { url: null, handle: null };
}

/* ---------- tiny UI atom ---------- */
function StatInline({
  label,
  children,
  accent,
}: {
  label: string;
  children: React.ReactNode;
  accent?: "green" | "blue";
}) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span
        className="text-[10px] tracking-wider uppercase"
        style={{ color: AX.muted }}
      >
        {label}
      </span>
      <span
        className="text-[12px] tabular-nums"
        style={{
          color:
            accent === "green"
              ? AX.green
              : accent === "blue"
                ? AX.blue
                : AX.text,
        }}
      >
        {children}
      </span>
    </div>
  );
}

/* ---------- column type ---------- */
function getColumnType(token: Token): "new" | "final-stretch" | "migrated" {
  const migrated =
    (token as any).is_migrated ||
    (token as any).migrated ||
    (token as any).graduated ||
    (token as any).is_graduated;
  if (migrated) return "migrated";

  const pct =
    (token as any).bonding_pct ??
    ((token as any).bonding_curve_progress != null
      ? (token as any).bonding_curve_progress * 100
      : undefined) ??
    (token as any).graduationPercent ??
    0;

  const marketCap =
    (token as any).fully_diluted_value ?? (token as any).market_cap_usd ?? 0;

  let progress = 0;
  if (typeof pct === "number" && pct >= 0) progress = pct;
  else if (marketCap > 0)
    progress = Math.min((marketCap / 69000000) * 100, 100);

  return progress >= 60 ? "final-stretch" : "new";
}

/* ===================================================================== */
interface TradeHeaderProps {
  token: Token | null;
  livePriceUsd?: number | null;
  liveMarketCapUsd?: number | null;
  /** Real-time token info from unified WebSocket (price, mcap, liquidity, image) */
  wsTokenInfo?: SolanaTokenInfo | null;
  /** Real-time volume data from unified WebSocket (5m, 1h, 6h, 24h volumes) */
  wsVolume?: SolanaTokenVolume | null;
}

const TradeHeader: React.FC<TradeHeaderProps> = ({ token, livePriceUsd, liveMarketCapUsd, wsTokenInfo, wsVolume }) => {
  const coalesceNumber = (...values: any[]): number | null => {
    for (const v of values) {
      const n = typeof v === "string" ? parseFloat(v) : v;
      if (Number.isFinite(n)) return n as number;
    }
    return null;
  };

  if (!token || (!token.name && !token.symbol)) {
    return (
      <div className="flex-shrink-0 px-2">
        <div
          className="flex items-center gap-3 rounded-lg p-3"
          style={{ backgroundColor: AX.surface }}
        >
          <div className="h-10 w-10 animate-pulse rounded-md bg-neutral-800" />
          <div className="flex flex-col gap-1">
            <div className="h-4 w-24 animate-pulse rounded bg-neutral-800" />
            <div className="h-3 w-16 animate-pulse rounded bg-neutral-800" />
          </div>
        </div>
      </div>
    );
  }

  const router = useRouter();
  const { addToWatchlist, removeFromWatchlist, isInWatchlist, updateWatchlistToken } = useWatchlist();
  const watchlistKey = token.pair_address || (token as any).mint || "";
  const isWatched = isInWatchlist(watchlistKey);

  // Determine if this is a Monad token (vs Solana) - used for data source selection
  const isMonadContext = useMemo(() => {
    const protocolSource =
      (token as any).launchpad_protocol ||
      (token as any).protocol ||
      (token as any).launchpadName ||
      (token as any).amm ||
      extractProtocolRaw(token) ||
      undefined;
    const normalizedProtocol = (protocolSource || "").toLowerCase();
    const isMonadProtocol = normalizedProtocol
      ? MONAD_PROTOCOL_KEYWORDS.some((keyword) => normalizedProtocol.includes(keyword))
      : false;
    const tokenChain = ((token as any).blockchain || (token as any).network || (token as any).chain || "") as string;
    const normalizedChain = tokenChain.toLowerCase();
    return normalizedChain === "monad" || router?.pathname?.includes("/trade/monad") || isMonadProtocol;
  }, [token, router?.pathname]);

  // For Solana tokens, we only use data from /v1/trade/view endpoint (token prop)
  const isSolanaToken = !isMonadContext;
  const [showPreview, setShowPreview] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showZoomPopup, setShowZoomPopup] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const twitterInfo = useMemo(() => resolveTwitterInfo(token), [token]);
  const twitterProfileUrl = twitterInfo.url;
  const twitterHandle = twitterInfo.handle;
  const [showXProfilePreview, setShowXProfilePreview] = useState(false);
  const [xPreviewPosition, setXPreviewPosition] = useState({ x: 0, y: 0 });
  const xPreviewTimeoutRef = useRef<number | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  
  // State for fetched age from search endpoint
  const [fetchedCreatedAt, setFetchedCreatedAt] = useState<string | number | null>(null);
  const fetchingAgeRef = useRef(false);
  
  // Check if we have age data (include launch_time which backend often uses instead of created_at)
  const hasAge = (token as any).created_at || (token as any).createdAt || (token as any).CreatedAt || (token as any).launch_time || fetchedCreatedAt;
  
  // Fetch age from search endpoint if missing (for Monad tokens only)
  useEffect(() => {
    // Only fetch if:
    // 1. We don't have age data
    // 2. It's a Monad token (uses component-level isMonadContext)
    // 3. We have a token address to search
    // 4. We're not already fetching
    if (hasAge || fetchingAgeRef.current) return;

    // Only fetch for Monad tokens - Solana uses /v1/trade/view endpoint only
    if (!isMonadContext) return;
    
    const tokenAddress = token.mint || token.pair_address || (token as any).address;
    if (!tokenAddress) return;
    
    fetchingAgeRef.current = true;
    const monadServiceUrl = process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL || 'https://monad-token-service.narrative.trade';
    const searchUrl = `${monadServiceUrl}/v1/search?q=${encodeURIComponent(tokenAddress)}`;
    
    fetch(searchUrl, {
      headers: { 'Accept': 'application/json' }
    })
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
          const searchResult = data.data[0];
          const createdAt = searchResult?.created_at || searchResult?.createdAt;
          if (createdAt) {
            setFetchedCreatedAt(createdAt);
          }
        }
      })
      .catch((err) => {
        console.debug('[TradeHeader] Failed to fetch age from search endpoint:', err);
      })
      .finally(() => {
        fetchingAgeRef.current = false;
      });
  }, [hasAge, token, isMonadContext]);
  
  const tokenAgeLabel = useMemo(() => {
    // AGE: For Solana, only use /v1/trade/view endpoint data (token prop)
    // For Monad, can also use fetchedCreatedAt from search endpoint
    const createdAt = isSolanaToken
      ? // Solana: Only use token data from /v1/trade/view endpoint
        ((token as any).created_at ||
        (token as any).createdAt ||
        (token as any).CreatedAt ||
        (token as any).launch_time)
      : // Monad: Can also use fetched data
        ((token as any).created_at ||
        (token as any).createdAt ||
        (token as any).CreatedAt ||
        (token as any).launch_time ||
        fetchedCreatedAt);

    // Check if we have any age data defined (vs still loading)
    const hasAnyAgeField = isSolanaToken
      ? // Solana: Only check token fields
        ((token as any).created_at !== undefined ||
        (token as any).createdAt !== undefined ||
        (token as any).CreatedAt !== undefined ||
        (token as any).launch_time !== undefined)
      : // Monad: Also check fetched data
        ((token as any).created_at !== undefined ||
        (token as any).createdAt !== undefined ||
        (token as any).CreatedAt !== undefined ||
        (token as any).launch_time !== undefined ||
        fetchedCreatedAt !== null);

    const age = getTokenAge(createdAt);

    // If age is unknown and we have no age fields defined, show loading indicator
    // If age is unknown but we have fields (they're just empty), show "-"
    if (age === "Unknown") {
      return hasAnyAgeField ? "-" : "...";
    }
    return age;
  }, [token, fetchedCreatedAt, isSolanaToken]);
  const [showXPreview, setShowXPreview] = useState<boolean>(false);
  const [buttonPosition, setButtonPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  const {
    isConnected: wsConnected,
    loading: wsLoading,
    error: wsError,
    getMarketData,
  } = useMarketDataWebSocket({
    pairAddress: token.pair_address || "",
    tokenAddress: token.mint || "",
    enabled: true,
  });

  const marketData = getMarketData();
  const chartPriceUsd = coalesceNumber(
    livePriceUsd,
    (token as any)?.chart_live_price_usd
  );
  const chartMarketCapUsd = coalesceNumber(
    liveMarketCapUsd,
    (token as any)?.chart_live_market_cap_usd
  );
  // Priority: wsTokenInfo (unified WebSocket) > chartPriceUsd > marketData > token
  const effectivePrice =
    coalesceNumber(
      wsTokenInfo?.price_usd,  // Unified WebSocket has highest priority
      chartPriceUsd,
      marketData?.price_usd,
      (token as any).usd_price,
      (token as any).price_usd
    ) ?? 0;
  // Priority: wsTokenInfo (unified WebSocket) > chartMarketCapUsd > marketData > token
  const effectiveMarketCap =
    coalesceNumber(
      wsTokenInfo?.market_cap_usd,  // Unified WebSocket has highest priority
      chartMarketCapUsd,
      marketData?.market_cap_usd,
      (token as any).market_cap_usd,
      (token as any).fully_diluted_value,
      token.market_cap_usd
    ) ?? 0;
  const effectivePriceChange1h = coalesceNumber(
    (token as any)?.price_percent_change_1h,
    (token as any)?.price_change_1h,
    (token as any)?.price_change,
    (token as any)?.price_percent_change_24h,
    (token as any)?.price_change_24h
  );

  // Keep watchlist entry hydrated with fresh price/percent/mcap when viewed on trade page
  useEffect(() => {
    if (!watchlistKey || !isWatched) return;

    // Only update when we have meaningful data
    const hasPrice = Number.isFinite(effectivePrice) && effectivePrice > 0;
    const hasMcap = Number.isFinite(effectiveMarketCap) && effectiveMarketCap > 0;
    const hasChange = Number.isFinite(effectivePriceChange1h ?? NaN);
    if (!hasPrice && !hasMcap && !hasChange) return;

    updateWatchlistToken({
      ...token,
      price_usd: hasPrice ? effectivePrice : (token as any).price_usd,
      usd_price: hasPrice ? effectivePrice : (token as any).usd_price,
      market_cap_usd: hasMcap ? effectiveMarketCap : (token as any).market_cap_usd,
      fully_diluted_value: hasMcap ? effectiveMarketCap : (token as any).fully_diluted_value,
      price_percent_change_1h: hasChange ? (effectivePriceChange1h as number) : (token as any).price_percent_change_1h,
      price_change_1h: hasChange ? (effectivePriceChange1h as number) : (token as any).price_change_1h,
    } as any);
  }, [effectiveMarketCap, effectivePrice, effectivePriceChange1h, isWatched, token, updateWatchlistToken, watchlistKey]);
  const mcap = effectiveMarketCap;
  const price = effectivePrice;

  // LIQUIDITY: Priority: wsTokenInfo (unified WebSocket) > token prop > marketData
  // Check if liquidity data actually exists (vs being undefined/null)
  const hasWsLiquidity = wsTokenInfo?.liquidity_usd !== undefined && wsTokenInfo.liquidity_usd > 0;
  const hasTokenLiquidity = (token as any).liquidity_usd !== undefined || (token as any).total_liquidity_usd !== undefined;
  const tokenLiquidity = (token as any).liquidity_usd ?? (token as any).total_liquidity_usd ?? 0;
  // For Solana: Prefer unified WebSocket, fallback to token data
  // For Monad: Can also use marketData WebSocket as additional source
  const wsLiquidityFromMarketData = isSolanaToken ? null : (marketData?.liquidity_usd ?? marketData?.volume_usd);
  // Unified WebSocket liquidity has highest priority
  const liq = hasWsLiquidity ? wsTokenInfo!.liquidity_usd : ((wsLiquidityFromMarketData && wsLiquidityFromMarketData > 0) ? wsLiquidityFromMarketData : tokenLiquidity);
  // Track if we're still loading liquidity data (no source has provided it yet)
  const isLiquidityLoading = isSolanaToken ? (!hasWsLiquidity && !hasTokenLiquidity) : (!hasWsLiquidity && !hasTokenLiquidity && !wsLiquidityFromMarketData);
  const supply = (token as any).total_supply ?? (token as any).supply ?? 0;
  const formattedMarketCap = useMemo(() => formatMarketCap(mcap), [mcap]);
  const isLowLiquidity = Number(liq) < 1000;

  const curvePct = (() => {
    const v =
      (token as any).bonding_pct ??
      ((token as any).bonding_curve_progress != null
        ? (token as any).bonding_curve_progress * 100
        : undefined) ??
      (token as any).graduationPercent ??
      0;
    if (v) return v;
    const mc =
      effectiveMarketCap ||
      (token as any).fully_diluted_value ||
      0;
    return mc ? Math.min((mc / 69000000) * 100, 100) : 0;
  })();

  /* ---------- canonical protocol resolution ---------- */
  const columnType = getColumnType(token);
  // protocolSource is used for getProtocolBranding below
  const protocolSource =
    (token as any).launchpad_protocol ||
    (token as any).protocol ||
    (token as any).launchpadName ||
    (token as any).amm ||
    extractProtocolRaw(token) ||
    undefined;
  // Note: isMonadContext is already defined at component level via useMemo

  let protocolColor: string;
  let tokenIcon: string;
  let fillProtocolBadge: boolean;

  if (isMonadContext) {
    const protocolBranding = getProtocolBranding(protocolSource || undefined);
    protocolColor = MONAD_BRAND.color;
    tokenIcon = protocolBranding.iconUrl || MONAD_BRAND.icon;
    fillProtocolBadge = protocolBranding.isFullCircle;
  } else {
    protocolColor = resolveProtocolColor(token, columnType);
    tokenIcon = resolveProtocolIcon(token);
    fillProtocolBadge = shouldFillProtocolBadge(token);
  }

  // IMAGE: Priority: wsTokenInfo.image_url (from URI metadata) > token prop
  // Unified WebSocket fetches image from URI metadata and provides it directly
  const rawImg =
    wsTokenInfo?.image_url || (token as any).image_url || (token as any).image || (token as any).logo || (token as any).uri;
  const imgSrc = normalizeAssetUrl(rawImg);
  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    token.symbol || token.name || "T",
  )}&background=0f1012&color=E6E7EA&size=36`;

  const twitterSearchQuery = useMemo(
    () => `${token.symbol || ""} ${token.name || ""}`.trim(),
    [token.symbol, token.name],
  );
  const twitterSearchUrl = useMemo(
    () =>
      twitterSearchQuery
        ? `https://twitter.com/search?q=${encodeURIComponent(twitterSearchQuery)}`
        : `https://twitter.com/search?q=${encodeURIComponent(token.symbol || token.name || "")}`,
    [twitterSearchQuery, token.symbol, token.name],
  );
  const twitterBio = useMemo(() => {
    const candidates = [
      (token as any).description,
      (token as any).bio,
      (token as any).twitter_bio,
      (token as any).summary,
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const value = String(candidate).trim();
      if (value) return value;
    }
    const base = token.symbol || token.name || "token";
    return `Official ${base} community. Join the conversation!`;
  }, [token]);

  useEffect(() => {
    return () => {
      if (typeof window === "undefined") return;
      if (xPreviewTimeoutRef.current != null) {
        window.clearTimeout(xPreviewTimeoutRef.current);
      }
      if (toastTimeoutRef.current != null) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const handleWatchlistClick = () => {
    if (isWatched) {
      removeFromWatchlist(watchlistKey);
      showToast("Removed from watchlist");
    } else {
      // Store current effective values so watchlist has price/change/mcap immediately
      addToWatchlist({
        ...(token as any),
        price_usd: effectivePrice,
        usd_price: effectivePrice,
        price_percent_change_1h: effectivePriceChange1h ?? (token as any).price_percent_change_1h,
        price_change_1h: effectivePriceChange1h ?? (token as any).price_change_1h,
        market_cap_usd: effectiveMarketCap,
        fully_diluted_value: effectiveMarketCap,
      } as any);
      showToast("Added to watchlist");
    }
  };

  const showToast = (message: string) => {
    if (typeof window !== "undefined" && toastTimeoutRef.current != null) {
      window.clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
    setToastMessage(message);
    if (typeof window !== "undefined") {
      toastTimeoutRef.current = window.setTimeout(() => {
        setToastMessage(null);
        toastTimeoutRef.current = null;
      }, 1600);
    }
  };

  const handleImageHover = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const popupWidth = 150;
    const popupHeight = 150;

    // Default position to the right of the image
    let x = rect.right + 10;
    let y = rect.top + rect.height / 2 - popupHeight / 2;

    // Check if popup would go off the right edge of the screen
    if (x + popupWidth > window.innerWidth) {
      x = rect.left - popupWidth - 10; // Position to the left instead
    }

    // Check if popup would go off the top or bottom of the screen
    if (y < 10) {
      y = 10; // Keep some margin from top
    } else if (y + popupHeight > window.innerHeight - 10) {
      y = window.innerHeight - popupHeight - 10; // Keep some margin from bottom
    }

    setPopupPosition({ x, y });
    setShowPreview(true);
    setShowZoomPopup(true);
  };

  const handleImageLeave = () => {
    setShowPreview(false);
    setShowZoomPopup(false);
  };

  const isPumpToken = useMemo(
    () => (token.mint || "").slice(-4) === "pump",
    [token.mint],
  );

  const openLinkInNewTab = (url: string) => {
    if (!url) return;
    if (typeof window === "undefined") return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const scheduleHideTwitterPreview = () => {
    if (typeof window === "undefined") {
      setShowXProfilePreview(false);
      return;
    }
    if (xPreviewTimeoutRef.current != null) {
      window.clearTimeout(xPreviewTimeoutRef.current);
    }
    xPreviewTimeoutRef.current = window.setTimeout(() => {
      setShowXProfilePreview(false);
    }, 120);
  };

  const handleTwitterProfileMouseEnter = (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    if (!twitterProfileUrl) return;
    if (typeof window === "undefined") return;
    if (xPreviewTimeoutRef.current != null) {
      window.clearTimeout(xPreviewTimeoutRef.current);
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setXPreviewPosition({
      x: rect.left + rect.width / 2,
      y: rect.bottom + 12,
    });
    setShowXProfilePreview(true);
  };

  const handleTwitterProfileMouseLeave = () => {
    scheduleHideTwitterPreview();
  };

  const handleTwitterPreviewMouseEnter = () => {
    if (typeof window !== "undefined" && xPreviewTimeoutRef.current != null) {
      window.clearTimeout(xPreviewTimeoutRef.current);
    }
    if (twitterProfileUrl) {
      setShowXProfilePreview(true);
    }
  };

  const handleTwitterPreviewMouseLeave = () => {
    scheduleHideTwitterPreview();
  };

  const handleTwitterProfileClick = (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (twitterProfileUrl) {
      openLinkInNewTab(twitterProfileUrl);
    } else if (twitterSearchUrl) {
      openLinkInNewTab(twitterSearchUrl);
    }
  };

  return (
    <div
      className="flex w-full items-center gap-6 px-2 py-2"
      style={{ color: AX.text }}
    >
      {/* WS banner(s) */}
      {wsError && (
        <div className="absolute top-0 right-0 left-0 z-10 border-b border-red-500/30 bg-red-900/20 px-3 py-1">
          <div className="text-center text-[10px] text-red-400">
            Market Data Error: {wsError}
          </div>
        </div>
      )}
      {!wsConnected && !wsLoading && (
        <div className="absolute top-0 right-0 left-0 z-10 border-b border-yellow-500/30 bg-yellow-900/20 px-3 py-1">
          <div className="text-center text-[10px] text-yellow-400">
            Using static market data
          </div>
        </div>
      )}

      {/* LEFT: token avatar + meta */}
      <div className="flex items-center gap-3">
        {/* Avatar with PulseTable-style border + protocol badge */}
        <div
          className="relative flex cursor-pointer items-center justify-center rounded-sm transition-all duration-300 ease-out"
          onMouseEnter={handleImageHover}
          onMouseLeave={handleImageLeave}
          style={{
            width: 44,
            height: 44,
            overflow: "visible",
            boxShadow: showPreview
              ? `0 0 5px ${AX.glowCyan}, 0 0 10px ${AX.glowCyan}`
              : "none",
            transform: showPreview ? "scale(1.02)" : "scale(1)",
          }}
        >
          <div
            className="relative rounded-sm"
            style={{ border: "none", padding: 0 }}
          >
            <div
              className="relative rounded-sm"
              style={{
                border: `1px solid ${protocolColor}`,
                padding: 1,
                backgroundColor: "#06070b",
              }}
            >
              <div
                className="relative overflow-hidden rounded-sm"
                style={{ width: 36, height: 36 }}
              >
                <FastImage
                  src={imgSrc ?? undefined}
                  fallbackSrc={fallbackAvatar}
                  alt={token.name || token.symbol || ""}
                  width={36}
                  height={36}
                  className="h-full w-full object-cover transition-all duration-300"
                  symbol={token.symbol}
                  name={token.name}
                  showBubble={false}
                />
              </div>
            </div>
          </div>

          <div
            className="absolute right-0 bottom-0 z-10 flex translate-x-1/5 translate-y-1/4 transform items-center justify-center rounded-full bg-white"
            style={{
              width: 12,
              height: 12,
              border: `1px solid ${protocolColor}`,
              boxShadow: `0 0 2px ${protocolColor}60`,
            }}
            title="Protocol"
          >
            <img
              src={tokenIcon}
              alt={`${(token as any).launchpad_protocol || (token as any).protocol || (token as any).launchpadName || "Protocol"} logo`}
              className={`${fillProtocolBadge ? "h-full w-full object-cover" : "h-3/4 w-3/4 object-contain"} rounded-full`}
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

          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-all duration-300"
            style={{ opacity: showPreview ? 1 : 0 }}
          >
            <div
              className="flex items-center justify-center rounded-full p-1.5"
              style={{
                backgroundColor: AX.aiCyan,
                boxShadow: `0 0 8px ${AX.glowCyan}`,
              }}
            >
              <FaCamera
                size={16}
                style={{ color: "#000000" }}
                className="drop-shadow-lg"
              />
            </div>
          </div>
        </div>

        {/* Name / symbol / age + quick actions */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px]">{token.symbol}</span>
            <span className="text-[11px]" style={{ color: AX.muted }}>
              {token.name}
            </span>

            {!!token.mint && (
              <button
                className="ml-1 cursor-pointer"
                title="Copy contract"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await navigator.clipboard.writeText(token.mint!);
                    showToast("Address copied to clipboard");
                  } catch {}
                }}
                style={{ color: AX.muted }}
              >
                <FaRegCopy size={12} />
              </button>
            )}

            <button
              className="ml-1 cursor-pointer"
              title="Share page link"
              onClick={async (e) => {
                e.stopPropagation();
                if (typeof window === "undefined") return;
                const shareUrl = window.location.href;
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  showToast("Link copied to clipboard");
                } catch (err) {
                  try {
                    const textArea = document.createElement("textarea");
                    textArea.value = shareUrl;
                    textArea.style.position = "fixed";
                    textArea.style.opacity = "0";
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    document.execCommand("copy");
                    document.body.removeChild(textArea);
                    showToast("Link copied to clipboard");
                  } catch {}
                }
              }}
              style={{ color: AX.muted }}
            >
              <IoShareSocialOutline size={14} />
            </button>
          </div>

          <div className="mt-1 flex items-center gap-1 text-xs lg:gap-2">
            <span>{tokenAgeLabel}</span>
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
                      `profile-tooltip`,
                    ) as HTMLElement;
                    if (tooltip) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      tooltip.style.left = `${rect.left + rect.width / 2}px`;
                      tooltip.style.top = `${rect.top - 10}px`;
                      tooltip.style.opacity = "1";
                    }
                    // Show X profile preview
                    setShowXPreview(true);
                    // Store button position for popup positioning
                    const buttonRect = e.currentTarget.getBoundingClientRect();
                    setButtonPosition({
                      left: buttonRect.left + buttonRect.width / 2,
                      top: buttonRect.top - 20,
                    });
                  }}
                  onMouseLeave={(e) => {
                    const tooltip = document.getElementById(
                      `profile-tooltip`,
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
                  <FaXTwitter size={16} className="text-neutral-400" />
                </button>

                <div
                  key={`search-tooltip`}
                  id={`search-tooltip`}
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
                  key={`profile-tooltip`}
                  id={`profile-tooltip`}
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

                {/* Small X Profile Preview - positioned near token */}
                {showXPreview && buttonPosition && (
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
                      setShowXPreview(false);
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
                          <span className="text-xs text-gray-400">Live</span>
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
                                const target = e.target as HTMLImageElement;
                                target.style.display = "none";
                                const fallback =
                                  target.nextElementSibling as HTMLElement;
                                if (fallback) fallback.style.display = "flex";
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
                              {token.symbol?.slice(0, 2) || "??"}
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
                            @{token.symbol?.toLowerCase() || "unknown"}
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
                              e.currentTarget.style.backgroundColor = "#e7e9ea";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "#f0f5f5";
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
                            e.currentTarget.style.backgroundColor = "#1a8cd8";
                            e.currentTarget.style.borderColor = "#1a8cd8";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "#1d9bf0";
                            e.currentTarget.style.borderColor = "#1d9bf0";
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
                    `search-tooltip`,
                  ) as HTMLElement;
                  if (tooltip) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    tooltip.style.left = `${rect.left + rect.width / 2}px`;
                    tooltip.style.top = `${rect.top - 10}px`;
                    tooltip.style.opacity = "1";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = AX.muted;
                  const tooltip = document.getElementById(
                    `search-tooltip`,
                  ) as HTMLElement;
                  if (tooltip) tooltip.style.opacity = "0";
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault(); // Prevent Link navigation
                  const searchQuery = `${token.symbol} ${token.name}`.trim();
                  const twitterUrl = `https://twitter.com/search?q=${encodeURIComponent(searchQuery)}`;
                  window.open(twitterUrl, "_blank");
                }}
              >
                <LuSearch size={16} />
              </button>

              <div className="ml-1 flex flex-row gap-2 font-light">
                {/* Check if this is a Monad token - hide icons for Monad */}
                {(() => {
                  const protocol = extractProtocolRaw(token);
                  const isMonad = protocol && (
                    protocol.includes('nad.fun') || 
                    protocol.includes('nadfun') || 
                    protocol.includes('flapsh') ||
                    protocol.includes('flap.sh')
                  );
                  
                  if (isMonad) {
                    return null; // Hide all icons for Monad tokens
                  }
                  
                  return (
                    <>
                      <div className="flex items-center gap-1 text-violet-200">
                        <PiCrownSimpleLight size={16} />
                        <span className="text-sm text-white">0</span>
                      </div>

                      <div className="flex items-center gap-1 text-violet-200">
                        <CiTrophy size={16} />
                        <span className="text-sm text-white">0</span>
                      </div>

                      {/* People Icon - Total Holders */}
                      <div className="relative flex items-center gap-1">
                        <div
                          className="flex cursor-help items-center justify-center rounded text-violet-200"
                          title="Holders"
                        >
                          <GoPeople size={16} />
                        </div>
                        <span className="text-sm text-white">
                          {(() => {
                            const holders =
                              token.total_holders || token.unique_wallets_24h || 0;
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
                        <span className="text-sm text-white">0</span>
                      </div>
                    </>
                  );
                })()}
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
      </div>

      {/* CENTER: compact stats */}
      <div className="flex items-center gap-6">
        <div className="text-left">
          <div className="flex items-center gap-1 text-[18px] tabular-nums">
            {formattedMarketCap === "-" ? "-" : `$${formattedMarketCap}`}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <StatInline label="Price">
            ${<SubscriptNumber value={price} />}
          </StatInline>
          <StatInline label="Liquidity">
            <span className="inline-flex items-center gap-1">
              <span style={{ color: isLiquidityLoading ? AX.muted : (isLowLiquidity ? AX.warning : AX.text) }}>
                {isLiquidityLoading ? '...' : `$${formatSmartNumber(liq)}`}
              </span>
              {!isLiquidityLoading && isLowLiquidity && (
                <span className="group relative inline-flex items-center">
                  <LuDroplet size={16} color={AX.warning} />
                  <span
                    className="absolute bottom-full left-1/2 z-50 mb-1.5 w-max -translate-x-1/2 rounded bg-black px-2 py-1 text-[10px] font-medium text-yellow-200 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                    style={{ border: `1px solid rgba(250, 204, 21, 0.4)` }}
                  >
                    Warning: Low liquidity
                  </span>
                </span>
              )}
            </span>
          </StatInline>
          {/* 24H VOL - inline after Liquidity */}
          {(() => {
            // Hide for Monad tokens
            const protocol = extractProtocolRaw(token);
            const isMonad = protocol && (
              protocol.includes('nad.fun') ||
              protocol.includes('nadfun') ||
              protocol.includes('flapsh') ||
              protocol.includes('flap.sh') ||
              protocol.includes('kuru')
            );
            if (isMonad) return null;

            // SOL price for converting volume from SOL to USD
            const SOL_PRICE_USD = 200;
            const vol24h = wsVolume?.volume_24h;
            const buyVolSol = vol24h?.buy_volume_sol ?? 0;
            const sellVolSol = vol24h?.sell_volume_sol ?? 0;
            const totalVol24hUsd = (buyVolSol + sellVolSol) * SOL_PRICE_USD;

            // Only show if we have data
            if (!wsVolume || totalVol24hUsd === 0) return null;

            return (
              <StatInline label="24H Vol">
                ${formatSmartNumber(totalVol24hUsd)}
              </StatInline>
            );
          })()}
          <StatInline label="Supply">{formatSmartNumber(supply)}</StatInline>
          <StatInline label="Gas Fees">
            {formatLamportsToSol((token as any)?.total_fees_lamports)}
          </StatInline>
          <StatInline label="B. Curve">
            <div className="flex flex-row items-center gap-2 text-xs">
              {Number.isFinite(Number(curvePct))
                ? `${Number(curvePct).toFixed(1)}%`
                : "—"}
              <ColorFillBar
                value={curvePct * 100}
                color={isMonadContext ? MONAD_RED : undefined}
              />
            </div>
          </StatInline>
        </div>
      </div>

      {/* RIGHT: actions */}
      {(() => {
        const protocol = extractProtocolRaw(token);
        const isMonad = protocol && (
          protocol.includes('nad.fun') || 
          protocol.includes('nadfun') || 
          protocol.includes('flapsh') ||
          protocol.includes('flap.sh') ||
          protocol.includes('kuru')
        );
        
        return (
          <div className={`flex items-center gap-2 ${isMonad ? 'ml-auto' : ''}`}>
            <button
              onClick={handleWatchlistClick}
              className="cursor-pointer text-[14px]"
              aria-label={isWatched ? "Remove from Watchlist" : "Add to Watchlist"}
              title={isWatched ? "Remove from Watchlist" : "Add to Watchlist"}
            >
              {isWatched ? (
                <FaStar className="text-yellow-400" />
              ) : (
                <FaRegStar style={{ color: AX.muted }} />
              )}
            </button>

            {/* Hide expand button for Monad tokens */}
            {!isMonad && (
              <button
                title="Expand chart"
                className="grid h-6 w-6 place-items-center"
                style={{ color: AX.muted }}
              >
                <FaExpand size={12} />
              </button>
            )}
          </div>
        );
      })()}

      {/* tiny toast */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 z-[99999] -translate-x-1/2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white">
          {toastMessage}
        </div>
      )}

      {showXProfilePreview && twitterProfileUrl && (
        <div
          className="pointer-events-auto fixed z-[99998]"
          style={{
            left: `${xPreviewPosition.x}px`,
            top: `${xPreviewPosition.y}px`,
            transform: "translate(-50%, 0)",
          }}
          onMouseEnter={handleTwitterPreviewMouseEnter}
          onMouseLeave={handleTwitterPreviewMouseLeave}
        >
          <div
            className="overflow-hidden rounded-xl"
            style={{
              width: 260,
              backgroundColor: AX.surface,
              border: `1px solid ${AX.border}`,
            }}
          >
            <div
              className="flex items-center justify-between border-b px-4 py-3"
              style={{ borderColor: "#2f3336" }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full"
                  style={{ backgroundColor: "#1d9bf0" }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    style={{ color: "#ffffff" }}
                  >
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </div>
                <div>
                  <div
                    className="text-sm font-semibold"
                    style={{ color: AX.text }}
                  >
                    @{twitterHandle || "unknown"}
                  </div>
                  <div className="text-xs" style={{ color: AX.muted }}>
                    Live Preview
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3 px-4 py-4">
              <div
                className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-full"
                style={{
                  border: "2px solid #2f3336",
                  backgroundColor: "#101114",
                }}
              >
                <FastImage
                  src={imgSrc ?? undefined}
                  fallbackSrc={fallbackAvatar}
                  alt={`${token.name || token.symbol || ""} avatar`}
                  width={56}
                  height={56}
                  className="h-full w-full object-cover"
                  symbol={token.symbol}
                  name={token.name}
                  showBubble={false}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <div
                  className="text-sm font-semibold"
                  style={{ color: AX.text }}
                >
                  {token.symbol}
                </div>
                <div className="text-xs" style={{ color: AX.muted }}>
                  {token.name}
                </div>
                <div
                  className="text-[11px] leading-relaxed"
                  style={{ color: AX.text }}
                >
                  {twitterBio}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 px-4 pb-4">
              <button
                className="flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors duration-200"
                style={{
                  backgroundColor: "#ffffff",
                  color: "#000000",
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openLinkInNewTab(twitterProfileUrl);
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#e7e9ea";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                }}
              >
                View on X
              </button>
              <button
                className="rounded-full px-3 py-2 text-xs font-semibold transition-colors duration-200"
                style={{
                  backgroundColor: "transparent",
                  color: AX.muted,
                  border: `1px solid ${AX.border}`,
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openLinkInNewTab(twitterSearchUrl);
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = AX.aiCyan;
                  e.currentTarget.style.borderColor = AX.aiCyan;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = AX.muted;
                  e.currentTarget.style.borderColor = AX.border;
                }}
              >
                Search
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zoom popup */}
      {showZoomPopup && (
        <div
          className="pointer-events-none fixed z-[99998] transition-all duration-300 ease-out"
          style={{
            left: `${popupPosition.x}px`,
            top: `${popupPosition.y}px`,
            opacity: showZoomPopup ? 1 : 0,
            transform: showZoomPopup
              ? "scale(1) translateY(0)"
              : "scale(0.9) translateY(-10px)",
          }}
        >
          <div
            className="relative overflow-hidden rounded-lg shadow-2xl"
            style={{
              width: 150,
              height: 150,
              backgroundColor: AX.surface,
              border: `2px solid ${protocolColor}`,
              boxShadow: `0 0 20px ${AX.glowCyan}, 0 0 40px ${AX.glowCyan}40`,
            }}
          >
            <FastImage
              src={imgSrc ?? undefined}
              fallbackSrc={fallbackAvatar}
              alt={`${token.name || token.symbol || ""} - Zoomed`}
              width={150}
              height={150}
              className="h-full w-full object-cover"
              symbol={token.symbol}
              name={token.name}
              showBubble={false}
            />

            {/* Overlay with token info */}
            <div
              className="absolute right-0 bottom-0 left-0 px-2 py-1"
              style={{
                background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
              }}
            >
              <div className="truncate text-xs font-medium text-white">
                {token.symbol}
              </div>
              <div className="truncate text-[10px] text-gray-300">
                {token.name}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TradeHeader;
