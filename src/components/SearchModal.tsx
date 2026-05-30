"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import { useRouter } from "next/router";
import { formatSmartNumber, formatMarketCap } from "~/utils/db";
import { FaSearch, FaTimes, FaFilter } from "react-icons/fa";
import { FaRocket, FaFire, FaCrown, FaGraduationCap } from "react-icons/fa";
import InterstatePopout from "./InterstatePopout";
import DiscoverFilterModal from "./DiscoverFilterModal";
import {
  defaultPulseFilters,
  type PulseFilters,
} from "~/contexts/PulseFiltersContext";
import { hasActiveFilters as checkPulseActiveFilters } from "~/utils/discoverFilterUtils";
import { LuChartNoAxesColumn, LuCopy } from "react-icons/lu";
import { fetchTokenMetadata } from "~/utils/functions";
import { fetchBatchSupplies, recomputeMarketCap } from "~/lib/tokenSupply";
import { extractMetaImage } from "~/utils/images";
import { preloadTradeChart } from "~/utils/preloadTradeChart";
import FastImage from "./FastImage";
import { TokenCountdown24h } from "./TokenCountdown24h";
import { IoShareSocialOutline } from "react-icons/io5";
import { LuPill, LuSearch } from "react-icons/lu";
import type { Timeframe } from "../pages/index";
import { GoClock, GoGlobe } from "react-icons/go";
import { BiBarChartAlt2 } from "react-icons/bi";
import { FiDroplet, FiZap } from "react-icons/fi";
import { FaChartLine, FaXTwitter } from "react-icons/fa6";
import BlockchainSwitcher from "./BlockchainSwitcher";
import { BsLightningChargeFill, BsTwitterX } from "react-icons/bs";
import { showEnhancedToast } from "~/utils/enhancedToast";
import {
  getHistory,
  addToHistory,
  clearHistory,
  removeFromHistory,
  type SearchHistoryItem,
} from "~/utils/searchHistory";
import { useUser } from "./UserContext";
import {
  insertOptimisticMarker,
  confirmOptimisticMarker,
  verifyTxAndRollbackMarker,
} from "~/utils/pendingTradeMarkers";
import { useSolPrice } from "./SolPriceContext";
import { HiLightningBolt } from "react-icons/hi";
import toast from "react-hot-toast";
import { useQuickBuy } from "./QuickBuyContext";
import { SOL_MINT_ADDRESS } from "~/utils/api";
import {
  executeSolanaMultiBuy,
  buildSolanaWalletAllocations,
} from "~/utils/solanaWalletAllocation";
import {
  broadcastTradeCompleted,
  notifyTradePending,
} from "~/utils/tradeEvents";
import { getPoolTypeFromToken } from "~/utils/poolTypeDetection";
import {
  validateSolanaBuy,
  showTradeValidationError,
} from "~/utils/preTradeValidation";
import { checkAtaExists } from "~/utils/ataCheck";
import { getResolvedTokenImage, resolveTokenImage } from "~/utils/images";
import { fetchVerifiedPairAddress } from "~/hooks/useSingleTokenPolling";
import {
  listenForTradeEvents,
  transformToastToError,
} from "~/utils/createSolanaToastHandler";
import { mapTradeErrorMessage } from "~/utils/tradeErrorMessages";
import { dispatchBalanceRefresh } from "~/utils/balanceEvents";
// TODO: SOCIAL LINKS NOT PRESENT FOR NOW
// import { PiTelegramLogo } from "react-icons/pi";
// import { TiDocumentText } from "react-icons/ti";

const isDev = process.env.NODE_ENV !== "production";

// Cache of mint → resolved direct image URL, populated by TokenListItem components.
// Persists for the lifetime of this module (across modal open/close).
const resolvedImageByMint = new Map<string, string>();

// Token type
export interface Token {
  id: number;
  mint: string;
  name: string;
  symbol: string;
  logo: string | null;
  fully_diluted_value: number;
  total_liquidity_usd: number;
  total_buy_volume_1h: number;
  total_sell_volume_1h: number;
  volume_1h?: number; // Added for search results
  created_at: string;
  bonding_curve_progress: string;
  amm: string;
  uri: string;
  pair_address: string; // Added for consistency
  // Mayhem Mode flag — drives red borders, Mayhem.webp protocol icon,
  // and the 24h fire countdown badge in the search results.
  is_mayhem_mode?: boolean;
  launch_time?: string;
}

export type SortOption =
  | "smart"
  | "time"
  | "market_cap"
  | "volume_1h"
  | "liquidity";

export interface SearchFilters {
  isPumpSearch: boolean;
  isBonkSearch: boolean;
  isOg: boolean;
  onlyBonded: boolean;
}

const sortingOptions = [
  { name: "Pump", icon: FaRocket, color: "green" },
  { name: "Bonk", icon: FaFire, color: "blue" },
  { name: "OG Mode", icon: FaCrown, color: "yellow" },
  { name: "Graduated", icon: FaGraduationCap, color: "red" },
];

const sortByOptions = [
  { key: "smart" as const, icon: FiZap },
  { key: "time" as const, icon: GoClock },
  { key: "market_cap" as const, icon: FaChartLine },
  { key: "volume_1h" as const, icon: BiBarChartAlt2 },
  { key: "liquidity" as const, icon: FiDroplet },
];

// Use the same green as PulseTable for consistency
const DEFAULT_PROTOCOL_COLOR = "#31e3ac";
// Use the same pump.fun icon as PulseTable for consistency
const DEFAULT_PROTOCOL_ICON = "https://pump.fun/pump-logomark.svg";

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
    key.toLowerCase().replace(/\s+/g, "").replace(/_/g, ""),
    value,
  ]),
);

const AX = {
  surface: "#1A1A1A",
  border: "#2A2B33",
  text: "#E6E7EA",
  muted: "#9CA3AF",
  aiCyan: "#06B6D4",
  glowBlue: "rgba(59, 130, 246, 0.35)",
};

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/\s+/g, "").replace(/_/g, "");
}

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

/**
 * Get market cap color based on value tiers (matching PulseTable)
 * Tiers: 0-20k: blue, 20k-30k: green, 30k-100k: yellow, 100k+: green
 */
function getMarketCapColor(mc: number): string {
  if (mc >= 100_000) return "#31e3ac"; // Green: 100k+
  if (mc >= 30_000) return "#ddc13d"; // Yellow: 30k-100k
  if (mc >= 20_000) return "#31e3ac"; // Green: 20k-30k
  return "#52c6ff"; // Blue: <20k
}

/**
 * Simple text component
 */
function HighlightedText({
  text,
  className = "",
}: {
  text: string;
  query?: string;
  className?: string;
}) {
  return <span className={className}>{text}</span>;
}

/**
 * Truncate text in the center with ellipsis (e.g., "Very Long Token Name" → "Very Lo...n Name")
 */
function centerTruncate(text: string, maxLength: number = 20): string {
  if (!text || text.length <= maxLength) return text;
  const halfLength = Math.floor((maxLength - 3) / 2);
  return `${text.slice(0, halfLength)}...${text.slice(-halfLength)}`;
}

/**
 * Check if a token is "new" (created within last 24 hours)
 */
function isNewToken(createdAt: string | number | undefined): boolean {
  if (!createdAt) return false;
  const created =
    typeof createdAt === "number"
      ? createdAt < 10000000000
        ? createdAt * 1000
        : createdAt
      : new Date(createdAt).getTime();
  const now = Date.now();
  const hoursDiff = (now - created) / (1000 * 60 * 60);
  return hoursDiff <= 24;
}

/**
 * Check if token is "trending" based on volume/liquidity ratio
 */
function isTrendingToken(token: any): boolean {
  const volume = token.volume_1h || token.total_buy_volume_1h || 0;
  const liquidity = token.total_liquidity_usd || 1;
  return volume / liquidity > 0.1; // Volume > 10% of liquidity = trending
}

function extractProtocolRaw(
  token: Partial<Token> & Record<string, any>,
): string | null {
  const candidates = [
    token.launchpad_protocol,
    token.protocol,
    token.launchpadName,
    token.amm,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const value = String(candidate).toLowerCase().trim();
    if (value) return value;
  }
  return null;
}

// Matches PulseTable's isFullCircleImage logic for consistency
function shouldFillProtocolBadge(
  token: Partial<Token> & Record<string, any>,
): boolean {
  const launchpadProtocol = (
    token.launchpad_protocol ||
    token.launchpad_name ||
    token.protocol ||
    ""
  ).toLowerCase();
  const mintAddress = (token.mint || "").toLowerCase();

  const isMeteora = launchpadProtocol.includes("meteora");
  const isBonk =
    launchpadProtocol.includes("bonk") ||
    launchpadProtocol.includes("launchlab") ||
    mintAddress.endsWith("bonk");
  const isBags =
    launchpadProtocol.includes("bags") || mintAddress.includes("bags");
  const isMoonit =
    launchpadProtocol.includes("moonit") ||
    launchpadProtocol.includes("moonshot") ||
    launchpadProtocol.includes("moonshoot");

  // Meteora only fills if mint doesn't contain "bags" (bags override)
  return (
    (isMeteora && !mintAddress.includes("bags")) || isBonk || isBags || isMoonit
  );
}

// Matches PulseTable's getProtocolColor function for consistency
function resolveProtocolColor(
  token: Partial<Token> & Record<string, any>,
  chain?: string,
): string {
  const launchpadProtocol = (
    token.launchpad_protocol ||
    token.launchpad_name ||
    token.protocol ||
    token.amm ||
    ""
  ).toLowerCase();
  const mintAddress = (token.mint || "").toLowerCase();

  // For Monad tokens, use purple border
  if (
    chain === "monad" ||
    (token.mint &&
      typeof token.mint === "string" &&
      token.mint.startsWith("0x"))
  ) {
    return "#c084fc"; // Purple color for Monad tokens
  }

  // Check if mint address contains "bags" - override any protocol (matches PulseTable)
  if (mintAddress.includes("bags")) {
    return DEFAULT_PROTOCOL_COLOR; // Green for bags
  }

  if (!launchpadProtocol) {
    return DEFAULT_PROTOCOL_COLOR; // Default green
  }

  // Meteora - red color (matches PulseTable for new pairs/final stretch)
  if (launchpadProtocol.includes("meteora")) {
    return "#d11f3a"; // Red for Meteora
  }

  // Pumpswap / Pump AMM - yellow (distinct from regular pump green)
  if (
    launchpadProtocol.includes("pumpswap") ||
    launchpadProtocol === "pump_amm" ||
    launchpadProtocol === "pumpamm"
  ) {
    return "#eab308";
  }

  // Pump - green color
  if (launchpadProtocol.includes("pump")) {
    return DEFAULT_PROTOCOL_COLOR;
  }

  // LaunchLab - blue color
  if (launchpadProtocol.includes("launch")) {
    return "#3b82f6";
  }

  // Raydium - blue-purple (matching WatchlistModal, TradeHeader, LiveTradesPanel)
  if (launchpadProtocol.includes("raydium")) {
    return "#5c51f7";
  }

  // Moonit/Moonshot - yellow
  if (
    launchpadProtocol.includes("moonit") ||
    launchpadProtocol.includes("moonshot") ||
    launchpadProtocol.includes("moonshoot")
  ) {
    return "#eab308";
  }

  // Boop - dark blue
  if (launchpadProtocol.includes("boop")) {
    return "#134577";
  }

  // Bonk/LaunchLab - orange
  if (
    launchpadProtocol.includes("bonk") ||
    launchpadProtocol.includes("launchlab") ||
    mintAddress.endsWith("bonk")
  ) {
    return "#ff6b35";
  }

  // Bags - green
  if (launchpadProtocol.includes("bags")) {
    return DEFAULT_PROTOCOL_COLOR;
  }

  // Orca - light blue
  if (launchpadProtocol.includes("orca")) {
    return "#0ea5e9";
  }

  // Jupiter - purple
  if (launchpadProtocol.includes("jupiter")) {
    return "#8b5cf6";
  }

  return DEFAULT_PROTOCOL_COLOR;
}

// Matches PulseTable's getTokenIcon function exactly for consistency
function resolveProtocolIcon(
  token: Partial<Token> & Record<string, any>,
  chain?: string,
): string {
  const launchpadProtocol = (
    token.launchpad_protocol ||
    token.launchpad_name ||
    token.protocol ||
    token.amm ||
    ""
  ).toLowerCase();
  const mintAddress = (token.mint || "").toLowerCase();

  // For Monad tokens, use MonadTable's protocol mapping
  if (
    chain === "monad" ||
    (token.mint &&
      typeof token.mint === "string" &&
      token.mint.startsWith("0x"))
  ) {
    // Map nad.fun to GitHub avatar (from MonadTable)
    if (
      launchpadProtocol.includes("nad.fun") ||
      launchpadProtocol === "nadfun"
    ) {
      return "https://avatars.githubusercontent.com/u/173274001?s=200&v=4";
    }

    // Map flap.sh to LinkedIn logo (from MonadTable)
    if (
      launchpadProtocol.includes("flap.sh") ||
      launchpadProtocol.includes("flapsh")
    ) {
      return "https://media.licdn.com/dms/image/v2/D4D0BAQFG5I0EDOrmJQ/company-logo_200_200/company-logo_200_200/0/1714693191952/flap_sh_logo?e=2147483647&v=beta&t=2kcdij2YPOFjLdPYzAhQxKgbGcuyh7Cdyp0AkGR8V6A";
    }

    // Map Kuru to Twitter profile image (from MonadTable)
    if (launchpadProtocol.includes("kuru")) {
      return "https://pbs.twimg.com/profile_images/1950962142917619714/R7Cj_qk7_400x400.jpg";
    }

    // Default to nad.fun icon for Monad tokens
    return "https://avatars.githubusercontent.com/u/173274001?s=200&v=4";
  }

  // Check if mint address contains "bags" - override any protocol (matches PulseTable)
  if (mintAddress.includes("bags")) {
    return "https://bags.fm/assets/images/bags-icon.png";
  }

  // Default to pump.fun icon if no protocol info
  if (!launchpadProtocol) {
    return DEFAULT_PROTOCOL_ICON;
  }

  // Map launchpad_protocol to external logo URLs (same order as PulseTable)
  if (launchpadProtocol.includes("pump")) {
    return DEFAULT_PROTOCOL_ICON;
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
  if (
    launchpadProtocol.includes("bonk") ||
    launchpadProtocol.includes("launchlab") ||
    mintAddress.endsWith("bonk")
  ) {
    return "https://s3.coinmarketcap.com/static-gravity/image/a28128d9ff7c49c9ad33ee2f626fda40.png";
  }

  if (launchpadProtocol.includes("bags")) {
    return "https://play-lh.googleusercontent.com/7AxVcu1pumxavcGTb16WBJQU88CDZd0v8q0WzFwfin7zbBvItYMuNQ0Xkqq4srTw4A=w240-h480-rw";
  }

  // Default to pump.fun icon for unknown protocols
  return DEFAULT_PROTOCOL_ICON;
}

function resolveTwitterInfo(token: Partial<Token> & Record<string, any>): {
  url: string | null;
  handle: string | null;
} {
  const candidates = [
    token.twitter,
    token.twitter_url,
    token.x,
    token.x_url,
    token.socials?.twitter,
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
    return { handle, url: `https://twitter.com/${handle}` };
  }

  const fallback = (token.symbol || token.name || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/gi, "");
  if (fallback) {
    return { handle: fallback, url: `https://twitter.com/${fallback}` };
  }
  return { url: null, handle: null };
}

function resolveSearchVolume(token: Partial<Token> & Record<string, any>): {
  volume: number;
  is24h: boolean;
} {
  // Check for 1h volume first
  const buy1h = Number((token as any).total_buy_volume_1h) || 0;
  const sell1h = Number((token as any).total_sell_volume_1h) || 0;
  if (buy1h || sell1h) return { volume: buy1h + sell1h, is24h: false };

  const direct1h =
    (token as any).volume_1h ??
    (token as any).volume1h ??
    (token as any).volume60m ??
    (token as any).volume_60m ??
    (token as any).total_volume_1h ??
    (token as any).buy_volume_1h ??
    0;
  if (direct1h) return { volume: Number(direct1h) || 0, is24h: false };

  // Fall back to 24h volume (from search API)
  const volume24h =
    (token as any).volume_24h ??
    (token as any).volume24h ??
    (token as any).volume_usd ??
    (token as any).volume_24h_usd ??
    0;
  if (volume24h) return { volume: Number(volume24h) || 0, is24h: true };

  return { volume: 0, is24h: false };
}

// Simple in-memory cache for token metadata (like PulseTable)
const tokenMetadataCache: Record<string, any> = {};

// Hook to fetch metadata from URI (like PulseTable)
function useTokenMetadata(uri?: string) {
  const [meta, setMeta] = useState<any | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!uri) {
      setMeta(null);
      return;
    }
    if (tokenMetadataCache[uri]) {
      setMeta(tokenMetadataCache[uri]);
      return;
    }
    fetchTokenMetadata(uri).then((data) => {
      if (!cancelled) {
        if (data) tokenMetadataCache[uri] = data;
        setMeta(data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [uri]);
  return meta;
}

// Helper to extract social links from token metadata (like PulseTable)
interface SocialLinks {
  twitter?: string;
  website?: string;
  telegram?: string;
}

function extractSocialLinks(
  token: Partial<Token> & Record<string, any>,
  meta: any,
): SocialLinks {
  const links: SocialLinks = {};

  // Try to get links from metadata first
  if (meta) {
    if (meta.twitter) links.twitter = meta.twitter;
    if (meta.website) links.website = meta.website;
    if (meta.telegram) links.telegram = meta.telegram;
  }

  // Also try to parse token.links if it's a JSON string
  if (typeof (token as any).links === "string") {
    try {
      const parsed = JSON.parse((token as any).links);
      if (parsed.twitter && !links.twitter) links.twitter = parsed.twitter;
      if (parsed.website && !links.website) links.website = parsed.website;
      if (parsed.telegram && !links.telegram) links.telegram = parsed.telegram;
    } catch {
      // Ignore parse errors
    }
  }

  // Check direct fields on token as last resort
  if (!links.twitter && (token as any).twitter)
    links.twitter = (token as any).twitter;
  if (!links.website && (token as any).website)
    links.website = (token as any).website;
  if (!links.telegram && (token as any).telegram)
    links.telegram = (token as any).telegram;

  return links;
}

const getSortingButtonClasses = (isActive: boolean, color: string) => {
  if (isActive) {
    return `border-${color}-500/60 bg-${color}-500/20 text-${color}-300`;
  }
  return "border-neutral-700 bg-neutral-800/50 text-neutral-300 hover:bg-neutral-700/40";
};

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit?: (query: string) => void;
  onQueryChange?: (query: string) => void;
  selectedTimeframe?: Timeframe;
  chain?: string;
}

// The new inner component that contains the actual modal content and logic
const SearchModalContent = React.memo(function SearchModalContent({
  open,
  onClose,
  onSubmit,
  onQueryChange,
  selectedTimeframe,
  chain = "sol",
}: SearchModalProps) {
  const router = useRouter();
  const { user, solBalance, walletList, walletBalances, selectedWalletIds } =
    useUser();
  const { solPrice } = useSolPrice();
  const { presets, activePreset, setActivePreset } = useQuickBuy();
  const [quickBuyAmount, setQuickBuyAmount] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("quickBuyAmount");
      if (saved) {
        const p = parseFloat(saved);
        if (!isNaN(p) && p >= 0) return p.toString();
      }
    }
    return "0.05";
  });
  const [selectedPill, setSelectedPill] = useState("P1");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("smart");
  const [filters, setFilters] = useState<SearchFilters>({
    isPumpSearch: false,
    isBonkSearch: false,
    isOg: false,
    onlyBonded: false,
  });
  const [searchResults, setSearchResults] = useState<Token[]>([]);
  const [cachedTokens, setCachedTokens] = useState<any[]>([]);

  // ─── PulseTable-style filters (reusing the DiscoverFilterModal) ───
  // Two-tier state: `pulseFilters` is what's applied; `pendingPulseFilters`
  // is the working copy shown in the modal until the user clicks Apply All.
  const [pulseFilterModalOpen, setPulseFilterModalOpen] = useState(false);
  const [pulseFilters, setPulseFilters] =
    useState<PulseFilters>(defaultPulseFilters);
  const [pendingPulseFilters, setPendingPulseFilters] =
    useState<PulseFilters>(defaultPulseFilters);
  const pulseHasPendingChanges = useMemo(
    () => JSON.stringify(pulseFilters) !== JSON.stringify(pendingPulseFilters),
    [pulseFilters, pendingPulseFilters],
  );
  const handlePulseFilterChange = useCallback(
    (updater: (prev: PulseFilters) => PulseFilters) => {
      setPendingPulseFilters((prev) => updater(prev));
    },
    [],
  );
  const handlePulseApply = useCallback(() => {
    setPulseFilters(pendingPulseFilters);
    setPulseFilterModalOpen(false);
  }, [pendingPulseFilters]);
  const handlePulseReset = useCallback(() => {
    setPendingPulseFilters(defaultPulseFilters);
    setPulseFilters(defaultPulseFilters);
  }, []);
  const openPulseFilters = useCallback(() => {
    // Sync pending with applied so the modal opens with current applied values
    setPendingPulseFilters(pulseFilters);
    setPulseFilterModalOpen(true);
  }, [pulseFilters]);

  const [lastFetchTime, setLastFetchTime] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [recentSearches, setRecentSearches] = useState<SearchHistoryItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1); // Keyboard navigation

  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const searchRequestIdRef = useRef(0);

  // Map timeframes to valid filters
  const getFilterForTimeframe = (timeframe: string) => {
    switch (timeframe) {
      case "1m":
      case "5m":
        return "txs_5m";
      case "30m":
      case "1h":
        return "txs_1h";
      default:
        return "txs_5m";
    }
  };

  // Search state
  const [searchLoading, setSearchLoading] = useState(false);

  // No need for filteredTokens since we're searching via API
  const filteredTokens: Token[] = [];

  // calculateSmartScore was a client-side weighted scorer that re-ranked
  // backend results by recency + mcap + liquidity + volume. It is now
  // dead: token-service returns canonical → active → long_tail tier order
  // with signal-weighted scoring inside each tier; the frontend should
  // never override that ordering. The function was removed in the search
  // relevance fix on 2026-05-18. See sortTokens below — the "smart" case
  // now returns the backend order unchanged.

  // Helper function to sort tokens on the frontend
  const sortTokens = (
    tokens: Token[],
    sortBy: SortOption,
    searchQuery: string = "",
  ): Token[] => {
    const sortedTokens = [...tokens];

    switch (sortBy) {
      case "smart":
        // Trust the backend tier order: token-service returns canonical →
        // active → long-tail with signal-weighted scoring within each tier
        // (typesense.go:scoreSearchResult). Re-sorting client-side via
        // calculateSmartScore discarded that ordering — a 49-day-old spam
        // clone with $71K mcap would rank above the canonical Goblin at
        // $11.7M mcap because the client formula over-weights recency and
        // ignores tier. The other sort cases (time/market_cap/volume_1h/
        // liquidity) remain client-side because they are explicit user
        // choices.
        return tokens;
      case "time":
        return sortedTokens.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
      case "market_cap":
        return sortedTokens.sort(
          (a, b) => (b.fully_diluted_value || 0) - (a.fully_diluted_value || 0),
        );
      case "volume_1h":
        return sortedTokens.sort(
          (a, b) => (b.volume_1h || 0) - (a.volume_1h || 0),
        );
      case "liquidity":
        return sortedTokens.sort(
          (a, b) => (b.total_liquidity_usd || 0) - (a.total_liquidity_usd || 0),
        );
      default:
        return sortedTokens;
    }
  };

  // Fetch tokens and cache them
  const fetchTokens = useCallback(async () => {
    const now = Date.now();
    // Cache for 30 seconds
    if (cachedTokens.length > 0 && now - lastFetchTime < 30000) {
      return cachedTokens;
    }

    try {
      isDev && console.log("Fetching tokens from service...");

      const endpoints = [
        "/api/token-service/pulse-new?limit=100",
        "/api/token-service/pulse-final-stretch?limit=100",
        "/api/token-service/pulse-migrated?limit=100",
      ];

      const responses = await Promise.all(
        endpoints.map((endpoint) =>
          fetch(`${endpoint}&t=${Date.now()}`).then((res) =>
            res.ok ? res.json() : [],
          ),
        ),
      );

      const allTokens = responses
        .flat()
        .filter((token: any) => token && token.mint);

      isDev && console.log("Cached", allTokens.length, "tokens");
      setCachedTokens(allTokens);
      setLastFetchTime(now);

      return allTokens;
    } catch (error) {
      console.error("❌ Fetch error:", error);
      return [];
    }
  }, [cachedTokens, lastFetchTime]);

  // Search when Enter is pressed
  const searchTokens = useCallback(
    async (searchQuery: string) => {
      if (searchQuery.trim().length < 1) {
        setSearchResults([]);
        setSearchLoading(false);
        setHasSearched(false);
        return;
      }

      // Cancel any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller and increment request ID
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const currentRequestId = ++searchRequestIdRef.current;

      setSearchLoading(true);
      setHasSearched(true);
      try {
        isDev &&
          console.log("Searching:", {
            query: searchQuery.trim(),
            requestId: currentRequestId,
          });

        // Use different endpoint based on chain
        const isMonad = chain === "monad";
        const endpoint = isMonad
          ? `/api/token-service/search-monad?q=${encodeURIComponent(searchQuery.trim())}&limit=100`
          : `/api/token-service/search?phrase=${encodeURIComponent(searchQuery.trim())}&limit=100`;

        const response = await fetch(endpoint, { signal: controller.signal });

        if (!response.ok) {
          console.error("❌ Search API error:", response.status);
          // Only set empty results if this is still the latest request.
          // Reset hasSearched so the UI does NOT show "No tokens found" for a
          // transient upstream failure — the user can simply retry.
          if (currentRequestId === searchRequestIdRef.current) {
            setSearchResults([]);
            setSearchLoading(false);
            setHasSearched(false);
          }
          return;
        }

        const searchData = await response.json();
        // Monad uses 'data' field, Solana uses 'tokens' field
        const filteredTokens = isMonad
          ? searchData.data || []
          : searchData.tokens || [];

        isDev &&
          console.log("Found results:", {
            query: searchQuery,
            chain,
            matchedTokens: filteredTokens.length,
          });

        // Convert search response to Token format
        const tokens: Token[] = filteredTokens.map((token: any) => {
          // Determine AMM/protocol from the token data
          let amm = "pump_amm"; // default
          if (
            token.protocol === "raydium" ||
            token.launchpadName === "Raydium"
          ) {
            amm = "raydium_cpmm";
          } else if (
            token.protocol === "meteora" ||
            token.launchpadName === "Meteora"
          ) {
            amm = "meteora";
          }

          // Parse timestamp - handle both Unix timestamps and date strings
          let createdAt = "";
          if (token.launch_time) {
            // Handle Unix timestamp (seconds) or date string
            if (typeof token.launch_time === "number") {
              // Convert Unix timestamp to ISO string
              createdAt = new Date(token.launch_time * 1000).toISOString();
            } else {
              createdAt = new Date(token.launch_time).toISOString();
            }
          } else if (token.created_at) {
            // Handle Unix timestamp (seconds) or date string
            if (typeof token.created_at === "number") {
              // Convert Unix timestamp to ISO string
              // Check if it's in seconds or milliseconds
              const timestamp =
                token.created_at < 10000000000
                  ? token.created_at * 1000
                  : token.created_at;
              createdAt = new Date(timestamp).toISOString();
            } else {
              createdAt = new Date(token.created_at).toISOString();
            }
          }

          // For Monad tokens, use 'address' instead of 'mint'
          const tokenAddress = isMonad
            ? token.address || token.mint
            : token.mint || token.address;

          return {
            id: 0,
            mint: tokenAddress,
            name: token.name || "",
            symbol: token.symbol || "",
            logo: token.uri || token.logo || token.image || token.image_url,
            fully_diluted_value:
              token.market_cap_usd ||
              token.marketCapUSD ||
              token.fully_diluted_value ||
              0,
            total_liquidity_usd: token.liquidity_usd || 0,
            total_buy_volume_1h: token.total_buy_volume_1h || 0,
            total_sell_volume_1h: token.total_sell_volume_1h || 0,
            volume_1h:
              token.volume_1h ||
              token.volume_1h_usd ||
              token.volume_usd ||
              token.volume_24h ||
              token.volume24h ||
              token.volume_24h_usd ||
              0,
            created_at: createdAt,
            bonding_curve_progress: token.bonding_pct
              ? `${token.bonding_pct}%`
              : "0%",
            amm: amm,
            uri: token.uri || token.logo || token.image || token.image_url,
            pair_address: token.pair_address || tokenAddress,
            // Preserve launchpad_protocol for Monad tokens
            launchpad_protocol:
              token.launchpad_protocol ||
              token.launchpad_name ||
              token.protocol,
            // Mayhem Mode — propagate from the raw API response so the row's
            // red border + protocol icon swap + countdown badge can render.
            is_mayhem_mode: !!token.is_mayhem_mode,
            launch_time: token.launch_time || token.created_at,
            // Carry usd_price through the mapped Token so the post-search
            // supply correction (fetchBatchSupplies → recomputeMarketCap)
            // can compute mcap = price × supply. Without this the field
            // is undefined at runtime and the correction silently no-ops.
            usd_price: token.usd_price ?? token.price_usd ?? 0,
          } as Token & {
            launchpad_protocol?: string;
            is_mayhem_mode?: boolean;
            launch_time?: string;
            usd_price?: number;
          };
        });

        // Only set results if this is still the latest request
        if (currentRequestId === searchRequestIdRef.current) {
          setSearchResults(tokens);

          // Fire-and-forget mcap correction. The indexer hardcodes a 1B
          // total supply when computing market_cap_usd, which silently
          // breaks for migrated/custom-supply tokens (e.g. CHONKERS at
          // mint 9Ys2hvQ7… shows $766K via search but real mcap is
          // ~$151 because circulating is 197K, not 1B). The trade page
          // already corrects via /v1/supply/{mint}; we use the batch
          // sibling so a 100-row search costs one extra request.
          //
          // Why fire-and-forget rather than await: search renders are
          // user-perceived latency. Showing the indexer's wrong mcap
          // for ~300ms then snapping to the correct value is strictly
          // better UX than blocking the whole modal. Race safety is
          // identical to the search itself — we re-check
          // currentRequestId before applying, so a stale supply
          // response from a previous keystroke can't overwrite the
          // current results. Until the indexer fix lands and stores
          // real supply, this is the minimum-coupling fix path.
          const mints = tokens
            .map((t) => t.mint)
            .filter((m): m is string => typeof m === "string" && m.length > 0);
          if (mints.length > 0) {
            fetchBatchSupplies(mints, controller.signal)
              .then((supplies) => {
                if (currentRequestId !== searchRequestIdRef.current) {
                  return; // a newer search took over while we waited
                }
                if (supplies.size === 0) return; // RPC fully failed; keep fallback
                setSearchResults((prev) =>
                  prev.map((t) => {
                    const supply = t.mint ? supplies.get(t.mint) : undefined;
                    if (supply === undefined) return t;
                    const priceUsd = (t as { usd_price?: number }).usd_price;
                    const corrected = recomputeMarketCap(
                      priceUsd,
                      supply,
                      t.fully_diluted_value ?? 0,
                    );
                    if (corrected === t.fully_diluted_value) return t;
                    return { ...t, fully_diluted_value: corrected };
                  }),
                );
              })
              .catch((err: unknown) => {
                // AbortError is expected when the user keeps typing.
                if (err instanceof DOMException && err.name === "AbortError")
                  return;
                isDev && console.error("Batch supply fetch failed:", err);
              });
          }
        } else {
          isDev &&
            console.log("Ignoring stale search results:", {
              requestId: currentRequestId,
              latestId: searchRequestIdRef.current,
            });
        }
      } catch (error: any) {
        // Ignore abort errors (expected when user types quickly)
        if (error?.name === "AbortError") {
          isDev &&
            console.log("Search aborted:", { requestId: currentRequestId });
          return;
        }
        console.error("Search error:", error);
        // Only set empty results if this is still the latest request.
        // Mirror the !response.ok branch: reset hasSearched so a network
        // failure renders as "ready to search" rather than "no tokens found".
        if (currentRequestId === searchRequestIdRef.current) {
          setSearchResults([]);
          setHasSearched(false);
        }
      } finally {
        // Only stop loading if this is still the latest request
        if (currentRequestId === searchRequestIdRef.current) {
          setSearchLoading(false);
        }
      }
    },
    [chain],
  );

  const handleQuickBuy = useCallback(
    async (token: Token) => {
      // Guard: Solana only
      if (chain !== "sol") {
        showEnhancedToast(
          "warning",
          "Quick buy is only available for Solana tokens",
          {
            title: "Solana Only",
          },
        );
        return;
      }

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
        });
        return;
      }

      const settings = preset.quickBuySettings;
      const poolType = getPoolTypeFromToken(token as any);

      // Pre-calculate wallet allocations
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

      // Pre-validate before showing toast
      const ataExists = await checkAtaExists(
        token.mint,
        (user as any)?.publicKey,
      ).catch(() => null);
      const validation = validateSolanaBuy(
        buyAmount,
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
          getResolvedTokenImage(token as any),
          token.symbol || token.name || "Token",
        );
        return;
      }

      // Verify the pair address (CRITICAL - prevents stale pool routing)
      let poolAddress =
        (token as any).migrated_pool_address || token.pair_address || "";
      const tokenMint = token.mint || "";
      if (tokenMint) {
        isDev &&
          console.log(
            `[SearchModal] Verifying pair address for quick buy: ${tokenMint}`,
          );
        const verifiedPairAddress = await fetchVerifiedPairAddress(tokenMint);
        if (verifiedPairAddress) {
          if (verifiedPairAddress !== poolAddress) {
            isDev &&
              console.log(
                `[SearchModal] Pair address mismatch! Local: ${poolAddress}, Verified: ${verifiedPairAddress}`,
              );
          }
          poolAddress = verifiedPairAddress;
        }
      }

      // Generate random timer cap (0.40-0.60s)
      const timerCap = 0.3 + Math.random() * 0.2;
      const uniqueToastId = `search-quickbuy-${Date.now()}-${Math.random()}`;
      const startTime = Date.now();
      let timerFinished = false;
      let tradeErrored = false;

      // Extract token image
      const tokenImage = getResolvedTokenImage(token as any) || null;
      const tokenName = token.symbol || token.name || "Token";

      // Show animated toast with timer (matches PulseTable/WatchlistModal)
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

      // Start timer animation
      let timerHandle: number | null = null;
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
            if (checkEl) {
              checkEl.style.display = "block";
            }
            const linkEl = document.getElementById(`link-${uniqueToastId}`);
            if (linkEl) {
              if (isMultiWallet) {
                linkEl.textContent = `${walletsWithBalance}/${total}`;
                linkEl.className =
                  "text-xs text-blue-400 font-medium flex-shrink-0";
              }
            }
          }
          timerHandle = null;
          return;
        }
        timerHandle = requestAnimationFrame(tick);
      };
      timerHandle = requestAnimationFrame(tick);

      const cleanupTradeListener = listenForTradeEvents(
        tokenMint,
        uniqueToastId,
        (v) => {
          tradeErrored = v;
        },
        "solana",
      );

      try {
        const baseMint = tokenMint;
        const quoteMint = SOL_MINT_ADDRESS;

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
                solAmountSpent: buyAmount,
              });
            }
          },
        });

        // Get first tx hash for single wallet case
        const firstTxHash =
          multiResult?.results?.find(
            (r: any) => (r.result as any)?.hash || (r.result as any)?.txid,
          )?.result?.hash ||
          multiResult?.results?.find(
            (r: any) => (r.result as any)?.hash || (r.result as any)?.txid,
          )?.result?.txid;

        // Post-signature chart marker: only insert after we have a real txHash.
        if (firstTxHash) {
          const { id: __markId, inserted } = insertOptimisticMarker({
            mint: baseMint,
            walletAddress:
              walletList?.find((w) => w.isPrimary)?.solanaAddress ??
              walletList?.[0]?.solanaAddress,
            side: "buy",
            amountSol: buyAmount,
            priceUsd: (token as any).usd_price,
          });
          if (inserted) {
            confirmOptimisticMarker(__markId, firstTxHash);
            verifyTxAndRollbackMarker(__markId, firstTxHash);
          }
        }

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

        isDev && console.log("SearchModal Quick Buy successful");

        // Dispatch event to refresh chart price lines
        if (typeof window !== "undefined" && tokenMint) {
          window.dispatchEvent(
            new CustomEvent("solanaQuickTrade", {
              detail: { tokenAddress: tokenMint },
            }),
          );
        }
        dispatchBalanceRefresh("sol");
      } catch (error: any) {
        tradeErrored = true;
        cleanupTradeListener();
        if (timerHandle) {
          cancelAnimationFrame(timerHandle);
        }
        console.error("❌ SearchModal Quick Buy failed:", error);
        transformToastToError(
          uniqueToastId,
          mapTradeErrorMessage(error),
          tokenImage,
          tokenName,
        );
      }
    },
    [
      chain,
      user,
      quickBuyAmount,
      selectedPill,
      presets,
      walletList,
      walletBalances,
      selectedWalletIds,
    ],
  );

  const handleSelectToken = useCallback(
    async (token: Token) => {
      const isMonad = chain === "monad";
      // Get the token address - for Monad use mint, for Solana prefer mint over pair_address
      // IMPORTANT: Use the same address for both URL path and _mint param for consistency
      const address = isMonad
        ? token.mint || (token as any).address
        : token.mint || token.pair_address;

      // Debug: log navigation details
      isDev &&
        console.log("handleSelectToken:", {
          symbol: token.symbol,
          name: token.name,
          address,
          pair_address: token.pair_address,
          mint: token.mint,
          chain,
        });

      // Preload immediately — covers all paths (recent searches, trending, keyboard selection)
      // Has built-in dedup via lastPreloadedMint
      // Build tradeUrl matching the router.push below
      let selectTradeUrl: string;
      if (isMonad && address) {
        const qp = new URLSearchParams();
        selectTradeUrl = `/trade/monad/${address}`;
      } else {
        selectTradeUrl = `/trade/${address}`;
      }
      preloadTradeChart(
        {
          mint: token.mint || address,
          pairAddress: token.pair_address,
          chain: isMonad ? "monad" : "sol",
          name: token.name,
          symbol: token.symbol,
          priceUsd: (token as any).price_usd,
          marketCapUsd: token.fully_diluted_value,
          image: token.uri || token.logo || "",
          launchpadProtocol: (token as any).launchpad_protocol,
        },
        { router, tradeUrl: selectTradeUrl },
      );

      // Save to search history
      const historyItem: SearchHistoryItem = {
        mint: token.mint,
        symbol: token.symbol,
        name: token.name,
        logo: token.logo,
        total_fully_diluted_valuation: token.fully_diluted_value || 0,
        total_buy_volume_24h: token.total_buy_volume_1h || 0,
        total_sell_volume_24h: token.total_sell_volume_1h || 0,
        total_liquidity_usd: token.total_liquidity_usd || 0,
        pair_address: token.pair_address,
        fully_diluted_value: token.fully_diluted_value,
        uri: token.uri || token.logo || undefined,
        launchpad_protocol: (token as any).launchpad_protocol,
        chain: chain,
        resolvedImageUrl: resolvedImageByMint.get(token.mint) || undefined,
        // Persist Mayhem fields so the recent-searches list keeps showing the
        // red treatment + countdown for tokens still inside the 24h window.
        is_mayhem_mode: !!(token as any).is_mayhem_mode,
        launch_time: (token as any).launch_time,
        created_at: token.created_at,
      };
      addToHistory(historyItem, user?.id);
      isDev &&
        console.log("Saved to search history:", {
          userId: user?.id,
          token: historyItem.symbol,
        });
      // Update local state so it appears immediately if modal reopens
      setRecentSearches((prev) => {
        const filtered = prev.filter((t) => t.mint !== token.mint);
        return [historyItem, ...filtered].slice(0, 10);
      });

      try {
        // First, backfill the token to the database
        isDev && console.log("Backfilling token:", token);

        // Fire-and-forget backfill — don't block navigation
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
        }).catch(() => {});

        // Navigate to trade page (SearchModal handles its own router.push with full query params below)
        onClose();

        if (isMonad && address) {
          const queryParams = new URLSearchParams();
          if (token.name) queryParams.set("_name", token.name);
          if (token.symbol) queryParams.set("_symbol", token.symbol);
          if (token.fully_diluted_value)
            queryParams.set("_mcap", token.fully_diluted_value.toString());
          if (token.uri || token.logo)
            queryParams.set("_image", token.uri || token.logo || "");
          queryParams.set("_mint", address);
          if ((token as any).launchpad_protocol)
            queryParams.set(
              "_launchpad_protocol",
              (token as any).launchpad_protocol,
            );
          if (token.created_at)
            queryParams.set("_created_at", token.created_at);
          if ((token as any).price_usd)
            queryParams.set("_price", String((token as any).price_usd));
          if (token.total_liquidity_usd)
            queryParams.set("_liquidity", String(token.total_liquidity_usd));
          queryParams.set("chain", "monad");

          const url = `/trade/monad/${address}?${queryParams.toString()}`;
          await router.push(url);
        } else if (address) {
          // Build query params the same way Monad does above. Without
          // these, optimisticToken on the trade page has no
          // launchpad_protocol hint, so useTokenSupply can't fire the
          // 1B fast-fallback at the right time and the chart briefly
          // renders with multiplier=1B (wrong pricescale extent that
          // doesn't auto-shrink even after real supply lands). The
          // PulseTable navigation path passes these; SearchModal Solana
          // was the only entry point missing them.
          const queryParams = new URLSearchParams();
          if (token.name) queryParams.set("_name", token.name);
          if (token.symbol) queryParams.set("_symbol", token.symbol);
          if (token.fully_diluted_value)
            queryParams.set("_mcap", token.fully_diluted_value.toString());
          if (token.uri || token.logo)
            queryParams.set("_image", token.uri || token.logo || "");
          queryParams.set("_mint", address);
          if ((token as any).launchpad_protocol)
            queryParams.set(
              "_launchpad_protocol",
              (token as any).launchpad_protocol,
            );
          if (token.created_at)
            queryParams.set("_created_at", token.created_at);
          if ((token as any).price_usd)
            queryParams.set("_price", String((token as any).price_usd));
          if (token.total_liquidity_usd)
            queryParams.set("_liquidity", String(token.total_liquidity_usd));
          const url = `/trade/${address}?${queryParams.toString()}`;
          isDev && console.log("Navigating to:", url);
          // router.push preserves in-memory caches (OHLC, WS prefetch).
          // [id].tsx useEffect([id]) resets state when address changes.
          router.push(url);
        }
      } catch (error) {
        console.error("❌ Error backfilling token:", error);
        onClose();

        if (isMonad && address) {
          const queryParams = new URLSearchParams();
          if (token.name) queryParams.set("_name", token.name);
          if (token.symbol) queryParams.set("_symbol", token.symbol);
          if (token.fully_diluted_value)
            queryParams.set("_mcap", token.fully_diluted_value.toString());
          if (token.uri || token.logo)
            queryParams.set("_image", token.uri || token.logo || "");
          queryParams.set("_mint", address);
          if ((token as any).launchpad_protocol)
            queryParams.set(
              "_launchpad_protocol",
              (token as any).launchpad_protocol,
            );
          if (token.created_at)
            queryParams.set("_created_at", token.created_at);
          if ((token as any).price_usd)
            queryParams.set("_price", String((token as any).price_usd));
          if (token.total_liquidity_usd)
            queryParams.set("_liquidity", String(token.total_liquidity_usd));
          queryParams.set("chain", "monad");

          const url = `/trade/monad/${address}?${queryParams.toString()}`;
          await router.push(url);
        } else if (address) {
          // Same query-param build as the success path above; without
          // these, optimisticToken on the trade page is missing
          // launchpad_protocol and the chart's pricescale locks at the
          // 1B-fallback extent during the supply-resolution race.
          const queryParams = new URLSearchParams();
          if (token.name) queryParams.set("_name", token.name);
          if (token.symbol) queryParams.set("_symbol", token.symbol);
          if (token.fully_diluted_value)
            queryParams.set("_mcap", token.fully_diluted_value.toString());
          if (token.uri || token.logo)
            queryParams.set("_image", token.uri || token.logo || "");
          queryParams.set("_mint", address);
          if ((token as any).launchpad_protocol)
            queryParams.set(
              "_launchpad_protocol",
              (token as any).launchpad_protocol,
            );
          if (token.created_at)
            queryParams.set("_created_at", token.created_at);
          if ((token as any).price_usd)
            queryParams.set("_price", String((token as any).price_usd));
          if (token.total_liquidity_usd)
            queryParams.set("_liquidity", String(token.total_liquidity_usd));
          const url = `/trade/${address}?${queryParams.toString()}`;
          isDev && console.log("Navigating to:", url);
          router.push(url);
        }
      }
    },
    [onClose, chain, user?.id, router],
  );

  const handleQueryChange = useCallback(
    (newQuery: string) => {
      setQuery(newQuery);

      // Clear existing timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      // Search automatically if query is at least 2 characters (debounced 300ms)
      if (newQuery.trim().length >= 2) {
        searchTimeoutRef.current = setTimeout(() => {
          searchTokens(newQuery);
        }, 300);
      } else {
        // Clear results if query is too short
        setSearchResults([]);
        setHasSearched(false);
        setSearchLoading(false);
      }
    },
    [searchTokens],
  );

  const updateFilter = useCallback((filterName: keyof SearchFilters) => {
    setFilters((prev) => ({ ...prev, [filterName]: !prev[filterName] }));
  }, []);

  // Move displayTokens before handleInputKeyDown so it can be used in the callback
  const isSearching = useMemo(() => query.trim().length > 0, [query]);
  const displayTokens = useMemo(() => {
    if (!hasSearched) return [];
    return sortTokens(searchResults, sortBy, query);
  }, [hasSearched, searchResults, sortBy, query]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const maxIndex = displayTokens.length - 1;
        setSelectedIndex((prev) => (prev < maxIndex ? prev + 1 : prev));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        // If a token is selected via keyboard, navigate to it
        if (selectedIndex >= 0 && displayTokens[selectedIndex]) {
          handleSelectToken(displayTokens[selectedIndex]);
        } else {
          // Otherwise, trigger search
          searchTokens(query);
        }
      }
    },
    [
      onClose,
      searchTokens,
      query,
      displayTokens,
      selectedIndex,
      handleSelectToken,
    ],
  );

  // Reset selected index when search results change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [searchResults]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSearchResults([]);
      setHasSearched(false);
      // Load search history for the current user
      const history = getHistory(user?.id);
      isDev &&
        console.log("Loaded search history:", {
          userId: user?.id,
          historyCount: history.length,
        });
      setRecentSearches(history);
      // Pre-fetch tokens when modal opens for instant search
      fetchTokens();
      const timer = setTimeout(() => inputRef.current?.focus(), 0);
      return () => {
        clearTimeout(timer);
        // Clear search timeout on close
        if (searchTimeoutRef.current) {
          clearTimeout(searchTimeoutRef.current);
        }
        // Abort any in-flight search so it doesn't keep an upstream socket
        // busy or call setState on the now-unmounted component.
        abortControllerRef.current?.abort();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  // Debug: log render state (removed - fires on every render)

  return (
    <>
      {/* CSS Keyframes for staggered animation */}
      <style jsx global>{`
        @keyframes fadeSlideIn {
          0% {
            opacity: 0;
            transform: translateY(8px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      <InterstatePopout
        open={open}
        onClose={onClose}
        align="center"
        zIndex={99999}
        className="relative mx-auto flex h-[85vh] w-full max-w-[94vw] flex-col overflow-hidden rounded-xl border border-white bg-[#18181A] shadow-sm transition-all duration-200 sm:w-[600px] md:w-[800px]"
        disableClickOutside={pulseFilterModalOpen}
      >
        {/* Close Button - Mobile */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2 sm:hidden">
          <div className="flex w-full items-center sm:w-auto">
            <BlockchainSwitcher />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openPulseFilters}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-[#FFFFFF14] bg-[#18181A] text-neutral-400 transition-colors hover:border-[#FFFFFF24] hover:text-white"
              aria-label="Filters"
              title="Filters"
            >
              <FaFilter size={12} />
            </button>
            <button
              onClick={onClose}
              className="p-1 text-xl text-neutral-400 transition-colors hover:text-white"
              aria-label="Close"
            >
              <FaTimes />
            </button>
          </div>
        </div>

        {/* Filter and Sort Controls */}
        {/* <div className="flex items-center gap-2">
          {sortingOptions.map((option) => {
            const IconComponent = option.icon;
            const isActive =
              option.name === "Pump"
                ? filters.isPumpSearch
                : option.name === "Bonk"
                  ? filters.isBonkSearch
                  : option.name === "OG Mode"
                    ? filters.isOg
                    : filters.onlyBonded;

            const filterKey =
              option.name === "Pump"
                ? "isPumpSearch"
                : option.name === "Bonk"
                  ? "isBonkSearch"
                  : option.name === "OG Mode"
                    ? "isOg"
                    : "onlyBonded";

            return (
              <button
                key={option.name}
                className={`flex items-center gap-1 rounded border px-3 py-1 transition ${getSortingButtonClasses(isActive, option.color)}`}
                onClick={() => updateFilter(filterKey as keyof SearchFilters)}
              >
                <IconComponent className="h-3 w-3" />
                {option.name}
              </button>
            );
          })}
        </div> */}
        <div className="flex flex-col items-start justify-between gap-2 px-3 pt-2 pb-2 sm:items-center sm:gap-3 sm:px-4 sm:pt-4 md:flex-row">
          <div className="hidden w-full items-center sm:w-auto md:flex">
            <BlockchainSwitcher />
          </div>

          <div className="flex w-full items-center gap-2 sm:w-auto sm:gap-3">
            <span className="text-xs font-medium whitespace-nowrap text-[#9595B5] sm:text-sm">
              Sort by:
            </span>

            <div className="flex flex-1 items-center gap-1 rounded-lg border border-[#FFFFFF0F] bg-[#18181A] p-0.5 sm:flex-initial sm:gap-1.5 sm:p-1">
              {sortByOptions.map((option) => {
                const IconComponent = option.icon;
                const isActive = sortBy === option.key;

                const tooltipText =
                  option.key === "smart"
                    ? "Smart sort (relevance + time + volume)"
                    : option.key === "time"
                      ? "Sort results by time"
                      : option.key === "market_cap"
                        ? "Sort results by Market Cap"
                        : option.key === "volume_1h"
                          ? "Sort results by 1h Volume"
                          : "Sort results by Liquidity";

                return (
                  <div
                    key={option.key}
                    className="group relative flex-1 sm:flex-initial"
                  >
                    <button
                      onClick={() => setSortBy(option.key)}
                      className={`flex w-full cursor-pointer items-center justify-center rounded-md px-2 py-1.5 transition-all duration-200 sm:px-3 sm:py-1.5 ${
                        isActive
                          ? "bg-[#1a1a1a] text-white shadow-sm"
                          : "text-[#666666] hover:bg-[#141414] hover:text-[#9595B5]"
                      }`}
                    >
                      <IconComponent className="size-3.5 sm:size-4" />
                    </button>

                    {/* Tooltip */}
                    <div className="pointer-events-none absolute top-[-20px] left-1/2 -translate-x-1/2 -translate-y-full rounded-md border border-[#2a2a2a] bg-[#18181A] px-2 py-1 text-[11px] whitespace-nowrap text-[#d1d1e9] opacity-0 shadow-lg transition-all duration-200 group-hover:translate-y-[-6px] group-hover:opacity-100">
                      {tooltipText}

                      {/* Tooltip arrow */}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-[#18181A]" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Filter icon - sits inline with the Sort by pill so they align vertically */}
            <button
              type="button"
              onClick={openPulseFilters}
              className="hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-[#FFFFFF14] bg-[#18181A] text-neutral-400 transition-colors hover:border-[#FFFFFF24] hover:text-white sm:flex"
              aria-label="Filters"
              title="Filters"
            >
              <FaFilter size={12} />
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative px-3 py-2 sm:px-4 sm:py-3">
          <div className="relative flex items-center gap-2 rounded-xl border border-[#FFFFFF0F] bg-[#18181A] px-3 py-2.5 transition-all duration-200 focus-within:border-[#7FFFC940] focus-within:bg-[#18181A] sm:gap-3 sm:px-4 sm:py-3">
            <FaSearch className="flex-shrink-0 text-base text-[#666666] sm:text-lg" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Search tokens..."
              className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#666666] sm:text-base"
            />
            {query && (
              <button
                onClick={() => {
                  setQuery("");
                  setSearchResults([]);
                  setHasSearched(false);
                  inputRef.current?.focus();
                }}
                className="flex-shrink-0 p-1 text-[#666666] transition-colors duration-200 hover:text-white"
                title="Clear search"
              >
                <svg
                  className="h-4 w-4 sm:h-5 sm:w-5"
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
            )}
            <div className="hidden flex-shrink-0 items-center gap-1.5 sm:flex">
              <span className="rounded bg-[#272727] px-2 py-1 text-xs leading-none font-medium text-[#656565]">
                /
              </span>
              <span className="rounded bg-[#272727] px-2 py-1 text-xs leading-none font-medium text-[#656565]">
                TAB
              </span>
            </div>
          </div>
        </div>

        {/* Token List */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-2 sm:px-3 sm:pt-3 md:px-4">
          {searchLoading && (
            <div className="mb-2 sm:mb-3">
              <span className="text-sm tracking-wider text-[#9595B5] sm:text-base">
                Searching...
              </span>
            </div>
          )}
          {searchLoading && displayTokens.length === 0 ? (
            <div className="flex flex-col gap-2">
              {[...Array(5)].map((_, index) => (
                <div
                  key={index}
                  className="relative flex min-h-[120px] animate-pulse flex-col items-start justify-between gap-3 rounded-lg border border-[#FFFFFF0F] bg-[#18181A] px-3 py-3 sm:min-h-[96px] sm:flex-row sm:items-center sm:gap-6 sm:px-5 sm:py-4"
                >
                  <div className="flex w-full max-w-full items-center gap-3 sm:max-w-72 sm:gap-4">
                    {/* Logo skeleton */}
                    <div className="relative flex flex-shrink-0 items-center justify-center">
                      <div className="h-12 w-12 rounded-lg border-2 border-[#2a2a2a] bg-[#1a1a1a] sm:h-16 sm:w-16"></div>
                      <div className="absolute -right-0.5 -bottom-0.5 h-4 w-4 rounded-full border-2 border-[#2a2a2a] bg-[#1a1a1a] sm:h-5 sm:w-5"></div>
                    </div>
                    {/* Text skeleton */}
                    <div className="max-w-[380px] min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-16 rounded bg-[#1a1a1a] sm:h-5 sm:w-20"></div>
                        <div className="h-3 w-24 rounded bg-[#1a1a1a] sm:h-4 sm:w-32"></div>
                        <div className="ml-1 h-3 w-3 rounded bg-[#1a1a1a]"></div>
                        <div className="h-3 w-3 rounded bg-[#1a1a1a]"></div>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="h-4 w-10 rounded-md bg-[#1a1a1a] sm:h-5 sm:w-12"></div>
                        <div className="flex items-center gap-2 sm:gap-2.5">
                          {[...Array(5)].map((_, i) => (
                            <div
                              key={i}
                              className="h-3 w-3 rounded bg-[#1a1a1a] sm:h-3.5 sm:w-3.5"
                            ></div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Stats skeleton */}
                  <div className="flex h-full w-full items-center justify-between gap-3 whitespace-nowrap sm:w-auto sm:justify-start sm:gap-5">
                    <div className="h-4 w-12 rounded bg-[#1a1a1a] sm:h-5 sm:w-16"></div>
                    <div className="h-4 w-12 rounded bg-[#1a1a1a] sm:h-5 sm:w-16"></div>
                    <div className="h-4 w-12 rounded bg-[#1a1a1a] sm:h-5 sm:w-16"></div>
                  </div>
                  {/* Button skeleton */}
                  <div className="h-8 w-full rounded-lg bg-[#1a1a1a] sm:w-16"></div>
                </div>
              ))}
            </div>
          ) : displayTokens.length === 0 ? (
            <div className="flex flex-col gap-4">
              {/* Recent Searches Section - Show when not searching and has history */}
              {!hasSearched && recentSearches.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-sm font-medium text-[#9595B5]">
                      Recent Searches
                    </span>
                    <button
                      onClick={() => {
                        clearHistory(user?.id);
                        setRecentSearches([]);
                      }}
                      className="text-xs text-neutral-500 transition-colors hover:text-[#7FFFC9]"
                    >
                      Clear All
                    </button>
                  </div>
                  <ul className="flex flex-col overflow-y-auto">
                    {recentSearches.map((item) => {
                      const mcRaw =
                        item.fully_diluted_value ||
                        item.total_fully_diluted_valuation ||
                        0;
                      const mc = formatMarketCap(mcRaw);
                      const mcColor = getMarketCapColor(mcRaw);
                      const liq = formatSmartNumber(
                        item.total_liquidity_usd || 0,
                      );
                      const normalizedLogo = normalizeAssetUrl(
                        item.resolvedImageUrl || item.logo || item.uri || null,
                      );
                      const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.symbol || item.name || "T")}&background=0f1012&color=E6E7EA&size=56`;

                      // Get protocol color and icon for the history item
                      const historyToken = {
                        mint: item.mint,
                        launchpad_protocol: item.launchpad_protocol,
                      } as any;
                      const itemProtocolColor = resolveProtocolColor(
                        historyToken,
                        item.chain,
                      );
                      const itemProtocolIcon = resolveProtocolIcon(
                        historyToken,
                        item.chain,
                      );
                      const itemFillProtocolBadge =
                        shouldFillProtocolBadge(historyToken);

                      return (
                        <li
                          key={item.mint}
                          onMouseEnter={() => {
                            if (!item.mint) return;
                            // Build tradeUrl matching handleSelectToken navigation
                            const isMonadItem = item.chain === "monad";
                            const itemAddr = isMonadItem
                              ? item.mint
                              : item.mint || item.pair_address;
                            let historyTradeUrl: string;
                            if (isMonadItem) {
                              historyTradeUrl = `/trade/monad/${itemAddr}`;
                            } else {
                              historyTradeUrl = `/trade/${itemAddr}`;
                            }
                            preloadTradeChart(
                              {
                                mint: item.mint,
                                pairAddress: item.pair_address,
                                chain: isMonadItem ? "monad" : "sol",
                                name: item.name || "",
                                symbol: item.symbol || "",
                                marketCapUsd:
                                  item.fully_diluted_value ||
                                  item.total_fully_diluted_valuation,
                                image: item.uri || item.logo || "",
                                launchpadProtocol: item.launchpad_protocol,
                              },
                              { router, tradeUrl: historyTradeUrl },
                            );
                          }}
                          onClick={() => {
                            // Convert history item to Token format for handleSelectToken
                            const token: Token = {
                              id: 0,
                              mint: item.mint,
                              name: item.name || "",
                              symbol: item.symbol || "",
                              logo: item.logo || null,
                              fully_diluted_value:
                                item.fully_diluted_value ||
                                item.total_fully_diluted_valuation ||
                                0,
                              total_liquidity_usd:
                                item.total_liquidity_usd || 0,
                              total_buy_volume_1h:
                                item.total_buy_volume_24h || 0,
                              total_sell_volume_1h:
                                item.total_sell_volume_24h || 0,
                              created_at: "",
                              bonding_curve_progress: "0%",
                              amm: "",
                              uri: item.uri || item.logo || "",
                              pair_address: item.pair_address || item.mint,
                              launchpad_protocol: item.launchpad_protocol,
                            } as Token & { launchpad_protocol?: string };
                            handleSelectToken(token);
                          }}
                          className="group relative flex cursor-pointer items-center gap-3 rounded-lg border border-transparent bg-[#18181A] px-3 py-2.5 transition-all duration-200 hover:z-30 hover:border-[#FFFFFF0F] hover:bg-[#1a1a1a] sm:px-4 sm:py-3"
                        >
                          {/* Token Logo with Protocol Border */}
                          <div
                            className="relative flex flex-shrink-0 items-center justify-center"
                            style={{ overflow: "visible" }}
                          >
                            <div
                              className="relative rounded-lg transition-all duration-200 group-hover:scale-105"
                              style={{
                                border: `2px solid ${(item as any).is_mayhem_mode ? "#c83c51" : itemProtocolColor}`,
                                padding: 2,
                                backgroundColor: "#06070b",
                                boxShadow: `0 0 8px ${(item as any).is_mayhem_mode ? "#c83c5120" : `${itemProtocolColor}20`}`,
                              }}
                            >
                              <div className="relative h-12 w-12 overflow-hidden rounded-md sm:h-14 sm:w-14">
                                <FastImage
                                  src={normalizedLogo ?? undefined}
                                  fallbackSrc={fallbackAvatar}
                                  alt={item.name || item.symbol || ""}
                                  width={56}
                                  height={56}
                                  className="h-full w-full object-cover"
                                  symbol={item.symbol}
                                  name={item.name}
                                  showBubble={false}
                                />
                              </div>
                            </div>
                            {/* Protocol Pill */}
                            <div
                              className="pointer-events-none absolute right-0 bottom-0 z-10 flex translate-x-1/4 translate-y-1/4 transform items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-110"
                              style={{
                                width: 20,
                                height: 20,
                                backgroundColor: "#000000",
                                border: `1px solid ${(item as any).is_mayhem_mode ? "#c83c51" : itemProtocolColor}`,
                                boxShadow: `0 0 4px ${(item as any).is_mayhem_mode ? "#c83c5160" : `${itemProtocolColor}60`}`,
                              }}
                            >
                              {(item as any).is_mayhem_mode ? (
                                <img
                                  src="/Mayhem.webp"
                                  alt="Mayhem Mode"
                                  className="h-3/4 w-3/4 rounded-full object-contain"
                                />
                              ) : (
                                <img
                                  src={itemProtocolIcon}
                                  alt="Protocol logo"
                                  className={`${itemFillProtocolBadge ? "h-full w-full object-cover" : "h-3/4 w-3/4 object-contain"} rounded-full`}
                                  style={{
                                    filter:
                                      itemProtocolColor === "#eab308"
                                        ? "sepia(1) saturate(3) hue-rotate(-10deg) brightness(1.1)"
                                        : "none",
                                  }}
                                  onError={(e) => {
                                    (
                                      e.target as HTMLImageElement
                                    ).style.display = "none";
                                  }}
                                />
                              )}
                            </div>
                          </div>
                          {/* Token Info */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="flex-shrink-0 text-sm font-bold text-white sm:text-base">
                                {item.symbol}
                              </span>
                              <span className="min-w-0 truncate text-xs text-neutral-500">
                                {item.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-[#9595B5]">
                              <span>
                                MC:{" "}
                                <span
                                  className="font-medium"
                                  style={{ color: mcColor }}
                                >
                                  ${mc}
                                </span>
                              </span>
                              <span>
                                L:{" "}
                                <span className="font-medium text-white">
                                  ${liq}
                                </span>
                              </span>
                              {(item as any).is_mayhem_mode && (
                                <TokenCountdown24h
                                  startedAt={
                                    (item as any).launch_time ||
                                    (item as any).created_at
                                  }
                                />
                              )}
                            </div>
                          </div>
                          {/* Quick Action */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const token: Token = {
                                id: 0,
                                mint: item.mint,
                                name: item.name || "",
                                symbol: item.symbol || "",
                                logo: item.logo || null,
                                fully_diluted_value:
                                  item.fully_diluted_value ||
                                  item.total_fully_diluted_valuation ||
                                  0,
                                total_liquidity_usd:
                                  item.total_liquidity_usd || 0,
                                total_buy_volume_1h:
                                  item.total_buy_volume_24h || 0,
                                total_sell_volume_1h:
                                  item.total_sell_volume_24h || 0,
                                created_at: "",
                                bonding_curve_progress: "0%",
                                amm: "",
                                uri: item.uri || item.logo || "",
                                pair_address: item.pair_address || item.mint,
                                launchpad_protocol: item.launchpad_protocol,
                              } as Token & { launchpad_protocol?: string };
                              handleSelectToken(token);
                            }}
                            className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-[#7FFFC940] bg-gradient-to-r from-[#243E33] to-[#1a2e26] px-2.5 py-1.5 text-xs font-bold text-[#7FFFC9] transition-all hover:border-[#7FFFC960] hover:from-[#2a4d3d] hover:to-[#1f3a2f] sm:px-3 sm:py-2"
                          >
                            <BsLightningChargeFill className="h-3 w-3" />
                            Trade
                          </button>
                          {/* Remove from history */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFromHistory(item.mint, user?.id);
                              setRecentSearches((prev) =>
                                prev.filter((t) => t.mint !== item.mint),
                              );
                            }}
                            className="flex flex-shrink-0 items-center justify-center rounded-lg p-1.5 text-neutral-500 transition-all hover:bg-[#2a2a2a] hover:text-white sm:p-2"
                            title="Remove from history"
                          >
                            <FaTimes className="h-3 w-3" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Empty State or No Results */}
              {hasSearched ? (
                <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 sm:py-16">
                  <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#2a2a2a] bg-[#1a1a1a] sm:h-16 sm:w-16">
                    <svg
                      className="h-6 w-6 text-[#666666] sm:h-8 sm:w-8"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div className="space-y-2 text-center">
                    <h3 className="text-base font-semibold text-white sm:text-lg">
                      No tokens found
                    </h3>
                    <p className="max-w-md px-2 text-xs text-neutral-400 sm:text-sm">
                      We couldn't find any tokens matching "
                      <span className="font-medium text-[#7FFFC9]">
                        {query}
                      </span>
                      ". Try searching with a different name, symbol, or check
                      the spelling.
                    </p>
                    <div className="px-2 pt-2 text-xs text-neutral-500">
                      <p>
                        💡 Tip: Search by token name, ticker symbol, or contract
                        address
                      </p>
                    </div>
                  </div>
                </div>
              ) : !recentSearches.length ? (
                <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 sm:py-16">
                  <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#2a2a2a] bg-[#1a1a1a] sm:h-16 sm:w-16">
                    <FaSearch className="h-6 w-6 text-[#7FFFC9] sm:h-8 sm:w-8" />
                  </div>
                  <div className="space-y-2 text-center">
                    <h3 className="text-base font-semibold text-white sm:text-lg">
                      Start searching
                    </h3>
                    <p className="max-w-md px-2 text-xs text-neutral-400 sm:text-sm">
                      Type at least 2 characters to search for tokens by name,
                      symbol, or contract address.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2 px-2 pt-2 text-xs">
                      <span className="rounded-md bg-[#1a1a1a] px-2 py-1 text-neutral-400">
                        pepe
                      </span>
                      <span className="rounded-md bg-[#1a1a1a] px-2 py-1 text-neutral-400">
                        sol
                      </span>
                      <span className="rounded-md bg-[#1a1a1a] px-2 py-1 text-neutral-400">
                        pump
                      </span>
                      <span className="text-neutral-500">
                        or contract address
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              {/* Column headers (desktop only — mobile rows render with inline labels) */}
              <div
                className="hidden w-full items-center justify-between gap-4 px-3 py-2 text-[11px] font-medium tracking-wide text-[#666666] uppercase sm:flex sm:px-4 md:gap-6 md:px-5"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="w-full max-w-72 min-w-0 flex-1">Token</div>
                <div className="flex flex-shrink-0 items-center gap-3 sm:text-[11px] md:gap-5">
                  <span className="w-20 text-center">MCap</span>
                  <span className="w-20 text-center">Vol 24hr</span>
                  <span className="w-20 text-center">Liq</span>
                </div>
                <span
                  className="flex-shrink-0 text-center"
                  style={{ width: "76px" }}
                >
                  Quick Buy
                </span>
              </div>
              <ul className="flex h-full list-none flex-col gap-2 overflow-y-auto pb-2">
                {displayTokens.map((token, index) => {
                  const mcRaw = token.fully_diluted_value || 0;
                  const mc = formatMarketCap(mcRaw);
                  const { volume, is24h } = resolveSearchVolume(token);
                  const vol = formatSmartNumber(volume * solPrice);
                  const liq = formatSmartNumber(token.total_liquidity_usd || 0);

                  return (
                    <TokenListItem
                      key={`${token.pair_address || ""}-${token.mint || ""}-${token.symbol || ""}`}
                      token={token}
                      mc={mc}
                      mcRaw={mcRaw}
                      vol={vol}
                      volIs24h={is24h}
                      liq={liq}
                      onSelect={handleSelectToken}
                      onQuickBuy={handleQuickBuy}
                      quickBuyAmount={quickBuyAmount}
                      chain={chain}
                      searchQuery={query}
                      index={index}
                      isSelected={index === selectedIndex}
                    />
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </InterstatePopout>

      {/* Reuse the same filters UI as the pulse / discover pages */}
      <DiscoverFilterModal
        isOpen={pulseFilterModalOpen}
        onClose={() => setPulseFilterModalOpen(false)}
        pendingFilters={pendingPulseFilters}
        hasPendingChanges={pulseHasPendingChanges}
        onPendingFilterChange={handlePulseFilterChange}
        onApply={handlePulseApply}
        onReset={handlePulseReset}
      />
    </>
  );
});

// Main component that controls rendering of the modal content
export default function SearchModal(props: SearchModalProps) {
  // Render the content only when the modal is open
  if (!props.open) {
    return null;
  }

  return <SearchModalContent {...props} />;
}

// Helper function to format age
function getTokenAge(createdAt: string) {
  if (!createdAt) return "?";
  const createdDate = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - createdDate.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays > 0) {
    return `${diffDays}d`;
  } else if (diffHours > 0) {
    return `${diffHours}h`;
  } else {
    return `${diffMins}m`;
  }
}

// Separate component with new design
const TokenListItem = React.memo(
  ({
    token,
    mc,
    mcRaw,
    vol,
    volIs24h = false,
    liq,
    onSelect,
    onQuickBuy,
    quickBuyAmount,
    chain = "sol",
    searchQuery = "",
    index = 0,
    isSelected = false,
  }: {
    token: Token;
    mc: string;
    mcRaw: number;
    vol: string;
    volIs24h?: boolean;
    liq: string;
    onSelect: (token: Token) => void;
    onQuickBuy?: (token: Token) => void;
    quickBuyAmount?: string;
    chain?: string;
    searchQuery?: string;
    index?: number;
    isSelected?: boolean;
  }) => {
    const searchRouter = useRouter();
    const mcColor = getMarketCapColor(mcRaw);
    const tokenIsNew = isNewToken(token.created_at);
    // TEMP DIAGNOSTIC — verify the Mayhem flag is reaching this row.
    // Remove once confirmed working in the search modal.
    if ((token as any).is_mayhem_mode) {
      // eslint-disable-next-line no-console
      console.log("[SearchModal Mayhem token]", {
        symbol: token.symbol,
        mint: token.mint?.slice(0, 8),
        is_mayhem_mode: (token as any).is_mayhem_mode,
        launch_time: (token as any).launch_time,
        created_at: token.created_at,
        launchpad_protocol: (token as any).launchpad_protocol,
      });
    }
    const tokenIsTrending = isTrendingToken(token);
    const [logoUrl, setLogoUrl] = useState<string | null>(
      // Prioritize uri (metadata JSON with image) over logo (often empty)
      token.uri || token.logo || null,
    );
    const [showXPreview, setShowXPreview] = useState(false);
    const [xPreviewPosition, setXPreviewPosition] = useState({ x: 0, y: 0 });
    const xPreviewTimeoutRef = useRef<number | null>(null);
    const [isMobile, setIsMobile] = useState(false);

    // Search menu state (like PulseTable)
    const [showSearchMenu, setShowSearchMenu] = useState(false);
    const [searchMenuPosition, setSearchMenuPosition] = useState({
      left: 0,
      top: 0,
      openAbove: false,
    });
    const searchButtonRef = useRef<HTMLButtonElement>(null);
    const searchMenuRef = useRef<HTMLDivElement>(null);
    const isOverSearchMenu = useRef(false);
    const isOverSearchButton = useRef(false);

    // Ref to persist resolved image URL and prevent flickering (like TradeHeader)
    const resolvedImageRef = useRef<string | null>(null);
    // Track the mint we resolved for to know when to re-resolve
    const resolvedForMintRef = useRef<string | null>(null);

    // Fetch metadata from URI for social links (like PulseTable)
    const meta = useTokenMetadata(token.uri);
    const socialLinks = useMemo(
      () => extractSocialLinks(token, meta),
      [token, meta],
    );

    useEffect(() => {
      const checkMobile = () => {
        setIsMobile(window.innerWidth < 640); // sm breakpoint
      };
      checkMobile();
      window.addEventListener("resize", checkMobile);
      return () => window.removeEventListener("resize", checkMobile);
    }, []);

    // Only reset logoUrl when the token actually changes (different mint)
    // Don't reset if we already have a resolved image for this mint
    useEffect(() => {
      if (resolvedForMintRef.current !== token.mint) {
        // New token - reset and start fresh
        // Prioritize uri (metadata JSON with image) over logo (often empty)
        const initialUrl = token.uri || token.logo || null;
        setLogoUrl(initialUrl);
        resolvedImageRef.current = null;
        resolvedForMintRef.current = token.mint;
      }
    }, [token.mint, token.uri, token.logo]);

    useEffect(() => {
      let cancelled = false;
      const rawUri = token.uri || token.logo;

      // Skip if we already resolved for this token
      if (
        resolvedImageRef.current &&
        resolvedForMintRef.current === token.mint
      ) {
        return;
      }

      if (rawUri && !resolvedImageRef.current) {
        fetchTokenMetadata(rawUri).then((data) => {
          if (cancelled) return;
          const img = extractMetaImage(data);
          if (img) {
            resolvedImageRef.current = img;
            resolvedImageByMint.set(token.mint, img);
            setLogoUrl(img);
          } else if (rawUri) {
            // If metadata fetch didn't return an image, use the raw URI
            resolvedImageRef.current = rawUri;
          }
        });
      }
      return () => {
        cancelled = true;
      };
    }, [token.mint, token.uri, token.logo]);

    useEffect(() => {
      return () => {
        if (
          typeof window !== "undefined" &&
          xPreviewTimeoutRef.current != null
        ) {
          window.clearTimeout(xPreviewTimeoutRef.current);
        }
      };
    }, []);

    const handleSelect = useCallback(() => {
      onSelect(token);
    }, [onSelect, token]);

    const protocolColor = useMemo(
      () => resolveProtocolColor(token, chain),
      [token, chain],
    );
    const tokenIcon = useMemo(
      () => resolveProtocolIcon(token, chain),
      [token, chain],
    );
    const fillProtocolBadge = useMemo(
      () => shouldFillProtocolBadge(token),
      [token],
    );
    const normalizedLogo = useMemo(
      () => normalizeAssetUrl(logoUrl || token.uri || token.logo),
      [logoUrl, token.uri, token.logo],
    );
    const fallbackAvatar = useMemo(
      () =>
        `https://ui-avatars.com/api/?name=${encodeURIComponent(token.symbol || token.name || "T")}&background=0f1012&color=E6E7EA&size=36`,
      [token.symbol, token.name],
    );
    const isPumpToken = useMemo(
      () => (token.mint || "").toLowerCase().endsWith("pump"),
      [token.mint],
    );
    // Twitter info - prioritize social links from metadata, then fall back to token fields
    const twitterInfo = useMemo(() => {
      // First check socialLinks from URI metadata
      if (socialLinks.twitter) {
        const twitterValue = socialLinks.twitter;
        // Extract handle from URL if needed
        const handleMatch = twitterValue.match(
          /(?:twitter\.com|x\.com)\/(@?\w+)/i,
        );
        if (handleMatch) {
          const handle = handleMatch[1]?.replace(/^@/, "");
          return { url: `https://twitter.com/${handle}`, handle };
        }
        // If it looks like a handle (starts with @ or is just a word)
        if (twitterValue.startsWith("@") || /^\w+$/.test(twitterValue)) {
          const handle = twitterValue.replace(/^@/, "");
          return { url: `https://twitter.com/${handle}`, handle };
        }
        // Otherwise use as-is
        return { url: twitterValue, handle: null };
      }
      // Fall back to resolveTwitterInfo for direct token fields
      return resolveTwitterInfo(token);
    }, [token, socialLinks.twitter]);
    const twitterProfileUrl = twitterInfo.url;
    const twitterHandle = twitterInfo.handle;
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
    const shareUrl = useMemo(() => {
      const path = `/trade/${token.mint || token.pair_address}`;
      if (typeof window === "undefined") return path;
      return `${window.location.origin}${path}`;
    }, [token.pair_address, token.mint]);
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

    const openLinkInNewTab = useCallback((url: string | null | undefined) => {
      if (!url) return;
      if (typeof window === "undefined") return;
      window.open(url, "_blank", "noopener,noreferrer");
    }, []);

    const scheduleHideTwitterPreview = useCallback(() => {
      if (typeof window === "undefined") {
        setShowXPreview(false);
        return;
      }
      if (xPreviewTimeoutRef.current != null) {
        window.clearTimeout(xPreviewTimeoutRef.current);
      }
      xPreviewTimeoutRef.current = window.setTimeout(() => {
        setShowXPreview(false);
        xPreviewTimeoutRef.current = null;
      }, 120);
    }, []);

    const handleTwitterProfileMouseEnter = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        // Don't show preview on mobile
        if (isMobile) return;
        if (!twitterProfileUrl) return;
        if (typeof window === "undefined") return;
        if (xPreviewTimeoutRef.current != null) {
          window.clearTimeout(xPreviewTimeoutRef.current);
        }

        const buttonRect = event.currentTarget.getBoundingClientRect();
        const popupWidth = 260;
        const popupHeight = 250; // Approximate height with padding

        // Since popup uses position: fixed, calculate position relative to viewport
        let x = buttonRect.left + buttonRect.width / 2;
        let y = buttonRect.bottom + 12;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Adjust if popup would go off-screen to the right
        if (x + popupWidth / 2 > viewportWidth - 16) {
          x = viewportWidth - popupWidth / 2 - 16;
        }
        // Adjust if popup would go off-screen to the left
        if (x - popupWidth / 2 < 16) {
          x = popupWidth / 2 + 16;
        }
        // Adjust if popup would go off-screen at the bottom - show above button instead
        if (y + popupHeight > viewportHeight - 16) {
          y = buttonRect.top - popupHeight - 12;
        }
        // Adjust if popup would go off-screen at the top
        if (y < 16) {
          y = buttonRect.bottom + 12; // Show below anyway if no space
        }

        setXPreviewPosition({ x, y });
        setShowXPreview(true);
      },
      [twitterProfileUrl, isMobile],
    );

    const handleTwitterProfileMouseLeave = useCallback(() => {
      scheduleHideTwitterPreview();
    }, [scheduleHideTwitterPreview]);

    const handleTwitterPreviewMouseEnter = useCallback(() => {
      if (typeof window !== "undefined" && xPreviewTimeoutRef.current != null) {
        window.clearTimeout(xPreviewTimeoutRef.current);
      }
      if (twitterProfileUrl) {
        setShowXPreview(true);
      }
    }, [twitterProfileUrl]);

    const handleTwitterPreviewMouseLeave = useCallback(() => {
      scheduleHideTwitterPreview();
    }, [scheduleHideTwitterPreview]);

    const handleTwitterProfileClick = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (twitterProfileUrl) openLinkInNewTab(twitterProfileUrl);
      },
      [twitterProfileUrl, openLinkInNewTab],
    );

    // Search menu hover handlers
    const handleSearchMouseEnter = useCallback(() => {
      isOverSearchButton.current = true;
      setShowSearchMenu(true);
    }, []);

    const handleSearchMouseLeave = useCallback(() => {
      isOverSearchButton.current = false;
      // Delay to allow moving to the dropdown
      setTimeout(() => {
        if (!isOverSearchMenu.current && !isOverSearchButton.current) {
          setShowSearchMenu(false);
        }
      }, 200);
    }, []);

    const handleSearchMenuMouseEnter = useCallback(() => {
      isOverSearchMenu.current = true;
    }, []);

    const handleSearchMenuMouseLeave = useCallback(() => {
      isOverSearchMenu.current = false;
      // Delay to allow moving back to button if needed
      setTimeout(() => {
        if (!isOverSearchMenu.current && !isOverSearchButton.current) {
          setShowSearchMenu(false);
        }
      }, 200);
    }, []);

    const handlePumpClick = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (!token.mint) return;
        openLinkInNewTab(`https://pump.fun/coin/${token.mint}`);
      },
      [token.mint, openLinkInNewTab],
    );

    const handleCopyAddress = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        // Copy the mint address (token contract), not the pair_address (trading pair/pool)
        const addressToCopy = token.mint || token.pair_address;
        if (!addressToCopy) return;
        const shortAddr = `${addressToCopy.slice(0, 6)}...${addressToCopy.slice(-4)}`;
        navigator.clipboard
          .writeText(addressToCopy)
          .then(() => {
            showEnhancedToast("success", shortAddr, {
              title: "Address Copied",
              duration: 2000,
            });
          })
          .catch(() => {
            showEnhancedToast("error", "Failed to copy address", {
              title: "Error",
              duration: 3000,
            });
          });
      },
      [token.mint, token.pair_address],
    );

    const handleShareLink = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (!shareUrl) return;
        navigator.clipboard
          .writeText(shareUrl)
          .then(() => {
            showEnhancedToast("success", "Trade link copied to clipboard", {
              title: "Copied!",
              duration: 2000,
            });
          })
          .catch(() => {
            showEnhancedToast("error", "Failed to copy link", {
              title: "Error",
              duration: 3000,
            });
          });
      },
      [shareUrl],
    );

    const ageLabel = useMemo(
      () => getTokenAge(token.created_at),
      [token.created_at],
    );

    return (
      <>
        <li
          className={`group relative block rounded-lg border bg-[#18181A] px-3 py-3 text-sm transition-all duration-200 hover:z-30 sm:px-4 sm:py-4 sm:text-base md:px-5 ${
            isSelected
              ? "border-[#7FFFC940] bg-[#7FFFC908]"
              : "border-transparent hover:border-[#FFFFFF0F] hover:bg-[#1a1a1a]"
          }`}
          style={{
            animation: `fadeSlideIn 0.3s ease-out ${index * 0.05}s both`,
          }}
          onMouseEnter={() => {
            if (!token.mint) return;
            // Build tradeUrl matching handleSelectToken navigation
            const isMonadResult = chain === "monad";
            const resultAddr = isMonadResult
              ? token.mint
              : token.mint || token.pair_address;
            let resultTradeUrl: string;
            if (isMonadResult) {
              resultTradeUrl = `/trade/monad/${resultAddr}`;
            } else {
              resultTradeUrl = `/trade/${resultAddr}`;
            }
            preloadTradeChart(
              {
                mint: token.mint,
                pairAddress: token.pair_address,
                chain: isMonadResult ? "monad" : "sol",
                name: token.name,
                symbol: token.symbol,
                marketCapUsd: token.fully_diluted_value,
                image: token.uri || token.logo || "",
                createdAt: token.created_at,
                launchpadProtocol: (token as any).launchpad_protocol,
              },
              { router: searchRouter, tradeUrl: resultTradeUrl },
            );
          }}
          onClick={(e) => {
            // Only trigger if click is not on a button or button child
            const target = e.target as HTMLElement;
            if (target.closest("button") || target.tagName === "BUTTON") {
              return;
            }
            handleSelect();
          }}
        >
          {/* Mobile Layout */}
          <div className="flex cursor-pointer flex-col gap-3 sm:hidden">
            {/* Top Row: Logo, Name, Buy Button */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div
                  className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center"
                  style={{
                    overflow: "visible",
                  }}
                >
                  <div
                    className="relative rounded-lg"
                    style={{ border: "none", padding: 0 }}
                  >
                    <div
                      className="relative rounded-lg transition-all duration-200 group-hover:scale-105"
                      style={{
                        border: `2px solid ${(token as any).is_mayhem_mode ? "#c83c51" : protocolColor}`,
                        padding: 2,
                        backgroundColor: "#06070b",
                        boxShadow: `0 0 8px ${(token as any).is_mayhem_mode ? "#c83c5120" : `${protocolColor}20`}`,
                      }}
                    >
                      <div className="relative h-11 w-11 overflow-hidden rounded-md">
                        <FastImage
                          src={normalizedLogo ?? undefined}
                          fallbackSrc={fallbackAvatar}
                          alt={token.name || token.symbol || ""}
                          width={44}
                          height={44}
                          className="h-full w-full object-cover"
                          symbol={token.symbol}
                          name={token.name}
                          showBubble={false}
                        />
                      </div>
                    </div>
                  </div>
                  <div
                    className="absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-[#18181A] bg-[#18181A] transition-transform duration-200 group-hover:scale-110"
                    style={{
                      borderColor: (token as any).is_mayhem_mode
                        ? "#c83c51"
                        : protocolColor,
                      boxShadow: `0 0 6px ${(token as any).is_mayhem_mode ? "#c83c5150" : `${protocolColor}50`}`,
                    }}
                  >
                    {(token as any).is_mayhem_mode ? (
                      <img
                        src="/Mayhem.webp"
                        alt="Mayhem Mode"
                        className="h-3/4 w-3/4 rounded-full object-contain"
                      />
                    ) : (
                      <img
                        src={tokenIcon}
                        alt="Protocol logo"
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
                    )}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-1.5">
                    <span className="flex-shrink-0 text-base font-bold text-white">
                      {token.symbol}
                    </span>
                    <span className="truncate text-xs text-neutral-500">
                      {token.name}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyAddress}
                      className="relative z-20 flex-shrink-0 p-1 text-[#7FFFC9] transition-all duration-200 hover:text-[#5FE0A0] active:scale-95"
                      style={{ pointerEvents: "auto" }}
                    >
                      <LuCopy size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={handleShareLink}
                      className="relative z-20 flex-shrink-0 p-1 text-neutral-500 transition-all duration-200 hover:text-emerald-400 active:scale-95"
                      style={{ pointerEvents: "auto" }}
                    >
                      <IoShareSocialOutline size={16} />
                    </button>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onQuickBuy ? onQuickBuy(token) : onSelect(token);
                }}
                className="relative z-20 flex flex-shrink-0 cursor-pointer items-center justify-center gap-1 rounded-lg border border-[#7FFFC940] bg-gradient-to-r from-[#243E33] to-[#1a2e26] px-4 py-2 text-xs font-bold text-[#7FFFC9] transition-all duration-300 ease-out hover:border-[#7FFFC960] hover:from-[#2a4d3d] hover:to-[#1f3a2f]"
                style={{ transformOrigin: "center", pointerEvents: "auto" }}
                title={onQuickBuy ? "Quick buy token" : "Select token"}
              >
                <BsLightningChargeFill className="h-3.5 w-3.5" />
                {quickBuyAmount && parseFloat(quickBuyAmount) > 0
                  ? `Buy ${quickBuyAmount}`
                  : "Buy"}
              </button>
            </div>
            {/* Second Row: Age, Social Icons */}
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-[#1a1a1a] px-2 py-0.5 text-[10px] font-semibold text-neutral-300">
                {ageLabel}
              </span>
              {(token as any).is_mayhem_mode && (
                <TokenCountdown24h
                  startedAt={
                    (token as any).launch_time || (token as any).created_at
                  }
                />
              )}
              <div className="relative flex items-center gap-2 text-neutral-500">
                <button
                  type="button"
                  onClick={handleTwitterProfileClick}
                  className="relative z-20 p-1 transition-all duration-200 hover:text-white active:scale-95"
                  style={{ pointerEvents: "auto" }}
                  title="View X profile"
                >
                  <BsTwitterX size={15} />
                </button>
                <div className="relative">
                  <button
                    ref={searchButtonRef}
                    type="button"
                    className="relative z-20 rounded p-0.5 transition-all duration-200 hover:bg-white/10 hover:text-white"
                    style={{ pointerEvents: "auto" }}
                    title="Search options"
                    onMouseEnter={handleSearchMouseEnter}
                    onMouseLeave={handleSearchMouseLeave}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                    }}
                  >
                    <FaSearch size={13} className="sm:h-3 sm:w-3" />
                  </button>
                  {/* Search Dropdown - Mobile */}
                  {showSearchMenu && (
                    <div
                      ref={searchMenuRef}
                      className="absolute top-full left-0 z-[999999] mt-2 min-w-[220px] rounded-lg border border-[#2a2b33] bg-[#16171C] py-1"
                      style={{ boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6)" }}
                      onMouseEnter={handleSearchMenuMouseEnter}
                      onMouseLeave={handleSearchMenuMouseLeave}
                    >
                      <button
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(
                            `https://twitter.com/search?q=${encodeURIComponent(token.mint)}`,
                            "_blank",
                          );
                          setShowSearchMenu(false);
                        }}
                      >
                        <FaXTwitter size={14} className="text-neutral-400" />X
                        Search for Address
                      </button>
                      <button
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(
                            `https://twitter.com/search?q=${encodeURIComponent(`${token.symbol} ${token.name}`.trim())}`,
                            "_blank",
                          );
                          setShowSearchMenu(false);
                        }}
                      >
                        <FaXTwitter size={14} className="text-neutral-400" />X
                        Search for Name
                      </button>
                      <div className="my-1 border-t border-[#2a2b33]" />
                      <button
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(
                            `https://www.google.com/search?q=${encodeURIComponent(`${token.symbol} ${token.name} crypto`.trim())}`,
                            "_blank",
                          );
                          setShowSearchMenu(false);
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
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
                      <button
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(
                            `https://dexscreener.com/solana/${token.mint}`,
                            "_blank",
                          );
                          setShowSearchMenu(false);
                        }}
                      >
                        <LuSearch size={14} className="text-[#36d8ff]" />
                        DexScreener
                      </button>
                    </div>
                  )}
                </div>
                {isPumpToken && (
                  <button
                    type="button"
                    onClick={handlePumpClick}
                    className="relative z-20 p-1 transition-all duration-200 hover:text-white active:scale-95"
                    style={{ pointerEvents: "auto" }}
                    title="View on pump.fun"
                  >
                    <LuPill size={15} />
                  </button>
                )}
              </div>
            </div>
            {/* Third Row: Stats */}
            <div className="flex items-center gap-4 pt-2 text-xs text-[#9595B5]">
              <div>
                <span className="text-[#666666]">MC: </span>
                <span className="font-bold" style={{ color: mcColor }}>
                  ${mc}
                </span>
              </div>
              <div>
                <span className="text-[#666666]">
                  {volIs24h ? "V(24h): " : "V: "}
                </span>
                <span className="font-bold text-white">${vol}</span>
              </div>
              <div>
                <span className="text-[#666666]">L: </span>
                <span className="font-bold text-white">${liq}</span>
              </div>
            </div>
          </div>

          {/* Desktop Layout */}
          <div className="hidden w-full min-w-0 items-center justify-between gap-4 sm:flex md:gap-6">
            <div className="flex w-full max-w-72 min-w-0 flex-1 items-center gap-4">
              <div
                className="relative flex h-16 w-16 flex-shrink-0 items-center justify-center"
                style={{
                  overflow: "visible",
                }}
              >
                <div
                  className="relative rounded-lg transition-all duration-200"
                  style={{ border: "none", padding: 0 }}
                >
                  <div
                    className="relative rounded-lg transition-all duration-200"
                    style={{
                      border: `2px solid ${(token as any).is_mayhem_mode ? "#c83c51" : protocolColor}`,
                      padding: 2,
                      backgroundColor: "#06070b",
                      boxShadow: `0 0 8px ${(token as any).is_mayhem_mode ? "#c83c5120" : `${protocolColor}20`}`,
                    }}
                  >
                    <div className="relative h-14 w-14 overflow-hidden rounded-md">
                      <FastImage
                        src={normalizedLogo ?? undefined}
                        fallbackSrc={fallbackAvatar}
                        alt={token.name || token.symbol || ""}
                        width={56}
                        height={56}
                        className="h-full w-full object-cover"
                        symbol={token.symbol}
                        name={token.name}
                        showBubble={false}
                      />
                    </div>
                  </div>
                </div>
                <div
                  className="pointer-events-none absolute -right-0.5 -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#18181A] bg-[#18181A] transition-transform duration-200 group-hover:scale-110"
                  style={{
                    borderColor: (token as any).is_mayhem_mode
                      ? "#c83c51"
                      : protocolColor,
                    boxShadow: `0 0 6px ${(token as any).is_mayhem_mode ? "#c83c5150" : `${protocolColor}50`}`,
                  }}
                >
                  {(token as any).is_mayhem_mode ? (
                    <img
                      src="/Mayhem.webp"
                      alt="Mayhem Mode"
                      className="h-3/4 w-3/4 rounded-full object-contain"
                    />
                  ) : (
                    <img
                      src={tokenIcon}
                      alt="Protocol logo"
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
                  )}
                </div>
              </div>

              <div className="max-w-[380px] min-w-0 flex-1">
                <div className="mb-1.5 flex min-w-0 items-center gap-2">
                  <span className="flex-shrink-0 text-base font-bold text-white">
                    {token.symbol}
                  </span>
                  <span className="min-w-0 truncate text-xs text-neutral-500">
                    {token.name}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyAddress}
                    className="relative z-20 ml-1 flex-shrink-0 p-0.5 text-[#7FFFC9] transition-all duration-200 hover:scale-110 hover:text-[#5FE0A0] active:scale-95"
                    style={{ pointerEvents: "auto" }}
                  >
                    <LuCopy size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={handleShareLink}
                    className="relative z-20 flex-shrink-0 p-0.5 text-neutral-500 transition-all duration-200 hover:scale-110 hover:text-emerald-400 active:scale-95"
                    style={{ pointerEvents: "auto" }}
                    title="Copy trade link"
                  >
                    <IoShareSocialOutline size={15} />
                  </button>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="rounded-md bg-[#1a1a1a] px-2 py-0.5 text-xs font-semibold text-neutral-300">
                    {ageLabel}
                  </span>
                  {(token as any).is_mayhem_mode && (
                    <TokenCountdown24h
                      startedAt={
                        (token as any).launch_time || (token as any).created_at
                      }
                    />
                  )}
                  <div className="relative flex items-center gap-2.5 text-neutral-500">
                    <button
                      type="button"
                      onClick={handleTwitterProfileClick}
                      onMouseEnter={handleTwitterProfileMouseEnter}
                      onMouseLeave={handleTwitterProfileMouseLeave}
                      className="relative z-20 p-0.5 transition-all duration-200 hover:text-white"
                      style={{ pointerEvents: "auto" }}
                      title="View X profile"
                    >
                      <BsTwitterX size={14} />
                    </button>

                    {/* Twitter Preview Popup - Desktop only */}
                    {showXPreview && twitterProfileUrl && !isMobile && (
                      <div
                        className="pointer-events-auto absolute z-[99999]"
                        style={{
                          left: "50%",
                          top: "100%",
                          transform: "translate(-50%, 8px)",
                          willChange: "transform",
                          pointerEvents: "auto",
                          minWidth: "240px",
                          maxWidth: "calc(100vw - 32px)",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        onMouseEnter={handleTwitterPreviewMouseEnter}
                        onMouseLeave={handleTwitterPreviewMouseLeave}
                      >
                        <div
                          className="w-[240px] overflow-hidden rounded-xl sm:w-[260px]"
                          style={{
                            backgroundColor: AX.surface,
                            border: `1px solid ${AX.border}`,
                            boxShadow:
                              "0 20px 60px rgba(0, 0, 0, 0.6), 0 8px 24px rgba(0, 0, 0, 0.4)",
                            pointerEvents: "auto",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
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
                                <div
                                  className="text-xs"
                                  style={{ color: AX.muted }}
                                >
                                  Live Preview
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="relative z-20 cursor-pointer rounded-md px-2 py-1 text-xs font-medium transition-colors duration-200"
                              style={{
                                backgroundColor: AX.aiCyan,
                                color: "#000000",
                                border: "none",
                                pointerEvents: "auto",
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (twitterProfileUrl) {
                                  window.open(
                                    twitterProfileUrl,
                                    "_blank",
                                    "noopener,noreferrer",
                                  );
                                }
                              }}
                            >
                              Open
                            </button>
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
                                src={normalizedLogo ?? undefined}
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
                              <div
                                className="text-xs"
                                style={{ color: AX.muted }}
                              >
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
                              type="button"
                              className="relative z-20 flex-1 cursor-pointer rounded-full px-3 py-2 text-xs font-semibold transition-colors duration-200"
                              style={{
                                backgroundColor: "#ffffff",
                                color: "#000000",
                                pointerEvents: "auto",
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (twitterProfileUrl) {
                                  window.open(
                                    twitterProfileUrl,
                                    "_blank",
                                    "noopener,noreferrer",
                                  );
                                }
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  "#e7e9ea";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  "#ffffff";
                              }}
                            >
                              View on X
                            </button>
                            <button
                              type="button"
                              className="relative z-20 cursor-pointer rounded-full px-3 py-2 text-xs font-semibold transition-colors duration-200"
                              style={{
                                backgroundColor: "transparent",
                                color: AX.muted,
                                border: `1px solid ${AX.border}`,
                                pointerEvents: "auto",
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (twitterSearchUrl) {
                                  window.open(
                                    twitterSearchUrl,
                                    "_blank",
                                    "noopener,noreferrer",
                                  );
                                }
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
                    {/* </div> */}
                    {/* <button
                    className="relative z-20 transition-all duration-200 hover:text-white p-0.5"
                    style={{ pointerEvents: "auto" }}
                    title="Telegram"
                  >
                    <PiTelegramLogo size={15} className="sm:w-3.5 sm:h-3.5" />
                  </button>
                  <button
                    className="relative z-20 transition-all duration-200 hover:text-white p-0.5"
                    style={{ pointerEvents: "auto" }}
                    title="Documentation"
                  >
                    <TiDocumentText size={15} className="sm:w-3.5 sm:h-3.5" />
                  </button>
                  <button
                    className="relative z-20 transition-all duration-200 hover:text-white p-0.5"
                    style={{ pointerEvents: "auto" }}
                    title="Website"
                  >
                    <GoGlobe size={15} className="sm:w-3.5 sm:h-3.5" />
                  </button> */}
                    {isPumpToken && (
                      <button
                        type="button"
                        onClick={handlePumpClick}
                        className="relative z-20 p-0.5 transition-all duration-200 hover:text-white"
                        style={{ pointerEvents: "auto" }}
                        title="View on pump.fun"
                      >
                        <LuPill size={15} className="sm:h-3.5 sm:w-3.5" />
                      </button>
                    )}
                    <div className="relative">
                      <button
                        type="button"
                        className="relative z-20 rounded p-0.5 transition-all duration-200 hover:bg-white/10 hover:text-white"
                        style={{ pointerEvents: "auto" }}
                        title="Search options"
                        onMouseEnter={handleSearchMouseEnter}
                        onMouseLeave={handleSearchMouseLeave}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                        }}
                      >
                        <FaSearch size={13} className="sm:h-3 sm:w-3" />
                      </button>
                      {/* Search Dropdown - Desktop */}
                      {showSearchMenu && (
                        <div
                          ref={searchMenuRef}
                          className="absolute top-full left-0 z-[999999] mt-2 min-w-[220px] rounded-lg border border-[#2a2b33] bg-[#16171C] py-1"
                          style={{ boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6)" }}
                          onMouseEnter={handleSearchMenuMouseEnter}
                          onMouseLeave={handleSearchMenuMouseLeave}
                        >
                          <button
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(
                                `https://twitter.com/search?q=${encodeURIComponent(token.mint)}`,
                                "_blank",
                              );
                              setShowSearchMenu(false);
                            }}
                          >
                            <FaXTwitter
                              size={14}
                              className="text-neutral-400"
                            />
                            X Search for Address
                          </button>
                          <button
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(
                                `https://twitter.com/search?q=${encodeURIComponent(`${token.symbol} ${token.name}`.trim())}`,
                                "_blank",
                              );
                              setShowSearchMenu(false);
                            }}
                          >
                            <FaXTwitter
                              size={14}
                              className="text-neutral-400"
                            />
                            X Search for Name
                          </button>
                          <div className="my-1 border-t border-[#2a2b33]" />
                          <button
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(
                                `https://www.google.com/search?q=${encodeURIComponent(`${token.symbol} ${token.name} crypto`.trim())}`,
                                "_blank",
                              );
                              setShowSearchMenu(false);
                            }}
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
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
                          <button
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(
                                `https://dexscreener.com/solana/${token.mint}`,
                                "_blank",
                              );
                              setShowSearchMenu(false);
                            }}
                          >
                            <LuSearch size={14} className="text-[#36d8ff]" />
                            DexScreener
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* MCap / Vol / Liq values - labels live in the column header above */}
            <div className="flex h-full flex-shrink-0 items-center gap-3 text-xs whitespace-nowrap text-[#9595B5] sm:text-sm md:gap-5">
              <span
                className="w-20 text-center font-bold"
                style={{ color: mcColor }}
              >
                ${mc}
              </span>
              <span className="w-20 text-center font-bold text-white">
                ${vol}
              </span>
              <span className="w-20 text-center font-bold text-white">
                ${liq}
              </span>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onQuickBuy ? onQuickBuy(token) : onSelect(token);
              }}
              className="relative z-20 flex flex-shrink-0 cursor-pointer items-center justify-center gap-1 rounded-lg border border-[#7FFFC940] bg-gradient-to-r from-[#243E33] to-[#1a2e26] px-2.5 py-2 text-xs font-bold text-[#7FFFC9] transition-all duration-300 ease-out hover:border-[#7FFFC960] hover:from-[#2a4d3d] hover:to-[#1f3a2f] sm:px-3"
              style={{ transformOrigin: "center", pointerEvents: "auto" }}
              title={onQuickBuy ? "Quick buy token" : "Select token"}
            >
              <BsLightningChargeFill className="h-3 w-3" />
              {quickBuyAmount && parseFloat(quickBuyAmount) > 0
                ? `Buy ${quickBuyAmount}`
                : "Buy"}
            </button>
          </div>
        </li>
      </>
    );
  },
);
