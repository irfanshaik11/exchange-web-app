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
import { FaSearch, FaTimes } from "react-icons/fa";
import { FaRocket, FaFire, FaCrown, FaGraduationCap } from "react-icons/fa";
import InterstatePopout from "./InterstatePopout";
import { LuChartNoAxesColumn, LuCopy } from "react-icons/lu";
import { fetchTokenMetadata } from "~/utils/functions";
import { extractMetaImage } from "~/utils/images";
import FastImage from "./FastImage";
import { IoShareSocialOutline } from "react-icons/io5";
import { LuPill } from "react-icons/lu";
import type { Timeframe } from "../pages/index";
import { GoClock, GoGlobe } from "react-icons/go";
import { BiBarChartAlt2 } from "react-icons/bi";
import { FiDroplet } from "react-icons/fi";
import { FaChartLine } from "react-icons/fa6";
import BlockchainSwitcher from "./BlockchainSwitcher";
import { BsLightningChargeFill, BsTwitterX } from "react-icons/bs";
import { showEnhancedToast } from "~/utils/enhancedToast";
// TODO: SOCIAL LINKS NOT PRESENT FOR NOW
// import { HiLightningBolt } from "react-icons/hi";
// import { PiTelegramLogo } from "react-icons/pi";
// import { TiDocumentText } from "react-icons/ti";

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
}

export type SortOption = "time" | "market_cap" | "volume_1h" | "liquidity";

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
  { key: "time" as const, icon: GoClock },
  { key: "market_cap" as const, icon: FaChartLine },
  { key: "volume_1h" as const, icon: BiBarChartAlt2 },
  { key: "liquidity" as const, icon: FiDroplet },
];

const DEFAULT_PROTOCOL_COLOR = "#22c55e";
const DEFAULT_PROTOCOL_ICON =
  "https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png";

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

function shouldFillProtocolBadge(
  token: Partial<Token> & Record<string, any>,
): boolean {
  const raw = extractProtocolRaw(token) || "";
  return ["meteora", "bonk", "bags", "moonit", "moonshot", "moonshoot"].some(
    (needle) => raw.includes(needle),
  );
}

function resolveProtocolColor(
  token: Partial<Token> & Record<string, any>,
  chain?: string,
): string {
  const raw = extractProtocolRaw(token);

  // For Monad tokens, use purple border
  if (
    chain === "monad" ||
    (token.mint &&
      typeof token.mint === "string" &&
      token.mint.startsWith("0x"))
  ) {
    return "#c084fc"; // Purple color for Monad tokens
  }

  if (!raw) return DEFAULT_PROTOCOL_COLOR;
  if (raw.includes("meteora")) return "#ff4662";
  if (raw.includes("pump")) return DEFAULT_PROTOCOL_COLOR;
  if (raw.includes("launch")) return "#3b82f6";
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

function resolveProtocolIcon(
  token: Partial<Token> & Record<string, any>,
  chain?: string,
): string {
  // For Monad tokens, use MonadTable's protocol mapping
  if (
    chain === "monad" ||
    (token.mint &&
      typeof token.mint === "string" &&
      token.mint.startsWith("0x"))
  ) {
    const launchpadProtocol = (
      token.launchpad_protocol ||
      token.launchpad_name ||
      token.protocol ||
      ""
    ).toLowerCase();

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
  if (raw.includes("pump")) return DEFAULT_PROTOCOL_ICON;
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

function resolveSearchVolume1h(
  token: Partial<Token> & Record<string, any>,
): number {
  const buy = Number((token as any).total_buy_volume_1h) || 0;
  const sell = Number((token as any).total_sell_volume_1h) || 0;
  if (buy || sell) return buy + sell;
  const direct =
    (token as any).volume_1h ??
    (token as any).volume1h ??
    (token as any).volume60m ??
    (token as any).volume_60m ??
    0;
  if (direct) return Number(direct) || 0;
  const fallback =
    (token as any).total_volume_1h ??
    (token as any).buy_volume_1h ??
    (token as any).volume_24h ??
    0;
  return Number(fallback) || 0;
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
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("time");
  const [filters, setFilters] = useState<SearchFilters>({
    isPumpSearch: false,
    isBonkSearch: false,
    isOg: false,
    onlyBonded: false,
  });
  const [searchResults, setSearchResults] = useState<Token[]>([]);
  const [cachedTokens, setCachedTokens] = useState<any[]>([]);
  const [lastFetchTime, setLastFetchTime] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Helper function to sort tokens on the frontend
  const sortTokens = (tokens: Token[], sortBy: SortOption): Token[] => {
    const sortedTokens = [...tokens];

    switch (sortBy) {
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
      console.log("📥 Fetching tokens from service...");

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

      console.log("✅ Cached", allTokens.length, "tokens");
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

      setSearchLoading(true);
      setHasSearched(true);
      try {
        console.log("🔍 Searching:", { query: searchQuery.trim() });

        // Use different endpoint based on chain
        const isMonad = chain === "monad";
        const endpoint = isMonad
          ? `/api/token-service/search-monad?q=${encodeURIComponent(searchQuery.trim())}&limit=50`
          : `/api/token-service/search?phrase=${encodeURIComponent(searchQuery.trim())}&limit=50`;

        const response = await fetch(endpoint);

        if (!response.ok) {
          console.error("❌ Search API error:", response.status);
          setSearchResults([]);
          return;
        }

        const searchData = await response.json();
        // Monad uses 'data' field, Solana uses 'tokens' field
        const filteredTokens = isMonad
          ? searchData.data || []
          : searchData.tokens || [];

        console.log("🔍 Found results:", {
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
            logo: token.logo || token.image || token.image_url || token.uri,
            fully_diluted_value:
              token.market_cap_usd ||
              token.marketCapUSD ||
              token.fully_diluted_value ||
              0,
            total_liquidity_usd: token.liquidity_usd || 0,
            total_buy_volume_1h: token.total_buy_volume_1h || 0,
            total_sell_volume_1h: token.total_sell_volume_1h || 0,
            volume_1h:
              token.volume_24h || token.volume24h || token.volume_24h_usd || 0,
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
          } as Token & { launchpad_protocol?: string };
        });

        setSearchResults(tokens);
      } catch (error) {
        console.error("Search error:", error);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    },
    [chain],
  );

  const handleSelectToken = useCallback(
    async (token: Token) => {
      const isMonad = chain === "monad";
      // Get the token address - for Monad use mint, for Solana use pair_address or mint
      const address = isMonad
        ? (token.mint || (token as any).address)
        : (token.pair_address || token.mint);
      try {
        // First, backfill the token to the database
        console.log("🔄 Backfilling token:", token);

        const backfillResponse = await fetch(
          "/api/token-service/backfill-token",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              mint: token.mint,
              name: token.name,
              symbol: token.symbol,
              uri: token.uri,
              market_cap_usd: token.fully_diluted_value,
              liquidity_usd: token.total_liquidity_usd,
              pair_address: token.pair_address,
            }),
          },
        );

        if (backfillResponse.ok) {
          console.log("✅ Token backfilled successfully");
        } else {
          console.warn(
            "⚠️ Token backfill failed, but continuing with navigation",
          );
        }

        // Navigate to trade page
        onSubmit?.(token.pair_address);
        onClose();

        if (isMonad && address) {
          // Build Monad trade URL with query parameters
          const queryParams = new URLSearchParams();
          if (token.name) queryParams.set('_name', token.name);
          if (token.symbol) queryParams.set('_symbol', token.symbol);
          if (token.fully_diluted_value) queryParams.set('_mcap', token.fully_diluted_value.toString());
          if (token.uri || token.logo) queryParams.set('_image', token.uri || token.logo || '');
          queryParams.set('_mint', address);
          if ((token as any).launchpad_protocol) queryParams.set('_launchpad_protocol', (token as any).launchpad_protocol);
          queryParams.set('chain', 'monad');

          const url = `/trade/monad/${address}?${queryParams.toString()}`;
          await router.push(url);
        } else if (address) {
          // Navigate to trade page for Solana - use direct router.push
          // IMPORTANT: Always set _name and _symbol (even if empty) to match PulseTable behavior
          // Otherwise TradeActionPanel shows skeleton instead of buy/sell buttons
          const queryParams = new URLSearchParams({
            _name: token.name || token.symbol || "",
            _symbol: token.symbol || "",
            _mcap: token.fully_diluted_value?.toString() || "",
            _image: token.uri || token.logo || "",
            _mint: token.mint || "",
            _launchpad_protocol: (token as any).launchpad_protocol || "",
            chain: chain || 'sol',
          });

          const url = `/trade/${address}?${queryParams.toString()}`;
          await router.push(url);
        }
      } catch (error) {
        console.error("❌ Error backfilling token:", error);
        // Still navigate even if backfill fails
        onSubmit?.(token.pair_address);
        onClose();

        if (isMonad && address) {
          const queryParams = new URLSearchParams();
          if (token.name) queryParams.set('_name', token.name);
          if (token.symbol) queryParams.set('_symbol', token.symbol);
          if (token.fully_diluted_value) queryParams.set('_mcap', token.fully_diluted_value.toString());
          if (token.uri || token.logo) queryParams.set('_image', token.uri || token.logo || '');
          queryParams.set('_mint', address);
          if ((token as any).launchpad_protocol) queryParams.set('_launchpad_protocol', (token as any).launchpad_protocol);
          queryParams.set('chain', 'monad');

          const url = `/trade/monad/${address}?${queryParams.toString()}`;
          await router.push(url);
        } else if (address) {
          // Navigate to trade page for Solana - use direct router.push
          // IMPORTANT: Always set _name and _symbol (even if empty) to match PulseTable behavior
          // Otherwise TradeActionPanel shows skeleton instead of buy/sell buttons
          const queryParams = new URLSearchParams({
            _name: token.name || token.symbol || "",
            _symbol: token.symbol || "",
            _mcap: token.fully_diluted_value?.toString() || "",
            _image: token.uri || token.logo || "",
            _mint: token.mint || "",
            _launchpad_protocol: (token as any).launchpad_protocol || "",
            chain: chain || 'sol',
          });

          const url = `/trade/${address}?${queryParams.toString()}`;
          await router.push(url);
        }
      }
    },
    [onSubmit, onClose],
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

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "Enter") {
        // Search only when Enter is pressed
        e.preventDefault();
        searchTokens(query);
        // Don't call onQueryChange - we want to show results in modal, not redirect
      }
    },
    [onClose, searchTokens, query],
  );

  useEffect(() => {
    if (open) {
      setQuery("");
      setSearchResults([]);
      setHasSearched(false);
      // Pre-fetch tokens when modal opens for instant search
      fetchTokens();
      const timer = setTimeout(() => inputRef.current?.focus(), 0);
      return () => {
        clearTimeout(timer);
        // Clear search timeout on close
        if (searchTimeoutRef.current) {
          clearTimeout(searchTimeoutRef.current);
        }
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // No need to re-run search when sort changes - we sort on the frontend now

  const isSearching = useMemo(() => query.trim().length > 0, [query]);
  const displayTokens = useMemo(() => {
    if (!hasSearched) return [];
    return sortTokens(searchResults, sortBy);
  }, [hasSearched, searchResults, sortBy]);

  return (
    <InterstatePopout
      open={open}
      onClose={onClose}
      align="center"
      className="mx-auto w-full max-w-[94vw] rounded-xl bg-[#141414] shadow-sm transition-all duration-200 sm:w-[600px] md:w-[800px]"
      disableClickOutside={false}
    >
      {/* Close Button - Mobile */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 sm:hidden">
        <div className="flex w-full items-center sm:w-auto">
          <BlockchainSwitcher />
        </div>
        <button
          onClick={onClose}
          className="p-1 text-xl text-neutral-400 transition-colors hover:text-white"
          aria-label="Close"
        >
          <FaTimes />
        </button>
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

          <div className="flex flex-1 items-center gap-1 rounded-lg border border-[#FFFFFF0F] bg-[#0f0f0f] p-0.5 sm:flex-initial sm:gap-1.5 sm:p-1">
            {sortByOptions.map((option) => {
              const IconComponent = option.icon;
              const isActive = sortBy === option.key;

              const tooltipText =
                option.key === "time"
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
                  <div className="pointer-events-none absolute top-[-20px] left-1/2 -translate-x-1/2 -translate-y-full rounded-md border border-[#2a2a2a] bg-[#0f0f0f] px-2 py-1 text-[11px] whitespace-nowrap text-[#d1d1e9] opacity-0 shadow-lg transition-all duration-200 group-hover:translate-y-[-6px] group-hover:opacity-100">
                    {tooltipText}

                    {/* Tooltip arrow */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-[#0f0f0f]" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative px-3 py-2 sm:px-4 sm:py-3">
        <div className="relative flex items-center gap-2 rounded-xl border border-[#FFFFFF0F] bg-[#0f0f0f] px-3 py-2.5 transition-all duration-200 focus-within:border-[#7FFFC940] focus-within:bg-[#1a1a1a] sm:gap-3 sm:px-4 sm:py-3">
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
      <div className="h-[320px] flex-1 overflow-hidden border-t border-[#FFFFFF0F] px-3 pt-2 sm:h-[450px] sm:px-3 sm:pt-3 md:px-4 2xl:h-[550px]">
        {(searchLoading || displayTokens.length > 0) && (
          <div className="mb-2 sm:mb-3">
            <span className="text-sm tracking-wider text-[#9595B5] sm:text-base">
              {searchLoading
                ? "Searching..."
                : `${displayTokens.length} ${displayTokens.length === 1 ? "Token" : "Tokens"}`}
            </span>
          </div>
        )}
        {searchLoading && displayTokens.length === 0 ? (
          <div className="flex flex-col gap-2">
            {[...Array(5)].map((_, index) => (
              <div
                key={index}
                className="relative flex min-h-[120px] animate-pulse flex-col items-start justify-between gap-3 rounded-lg border border-[#FFFFFF0F] bg-[#0f0f0f] px-3 py-3 sm:min-h-[96px] sm:flex-row sm:items-center sm:gap-6 sm:px-5 sm:py-4"
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
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 sm:py-16">
            {hasSearched ? (
              <>
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
                    <span className="font-medium text-[#7FFFC9]">{query}</span>
                    ". Try searching with a different name, symbol, or check the
                    spelling.
                  </p>
                  <div className="px-2 pt-2 text-xs text-neutral-500">
                    <p>
                      💡 Tip: Search by token name, ticker symbol, or contract
                      address
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        ) : (
          <ul className="flex h-full list-none flex-col gap-2 overflow-y-auto pb-2">
            {displayTokens.map((token) => {
              const mc = formatMarketCap(token.fully_diluted_value || 0);
              const vol = formatSmartNumber(resolveSearchVolume1h(token));
              const liq = formatSmartNumber(token.total_liquidity_usd || 0);

              return (
                <TokenListItem
                  key={token.pair_address}
                  token={token}
                  mc={mc}
                  vol={vol}
                  liq={liq}
                  onSelect={handleSelectToken}
                  chain={chain}
                />
              );
            })}
          </ul>
        )}
      </div>
    </InterstatePopout>
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
    vol,
    liq,
    onSelect,
    chain = "sol",
  }: {
    token: Token;
    mc: string;
    vol: string;
    liq: string;
    onSelect: (token: Token) => void;
    chain?: string;
  }) => {
    const [logoUrl, setLogoUrl] = useState<string | null>(
      token.uri || token.logo || null,
    );
    const [showXPreview, setShowXPreview] = useState(false);
    const [xPreviewPosition, setXPreviewPosition] = useState({ x: 0, y: 0 });
    const xPreviewTimeoutRef = useRef<number | null>(null);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
      const checkMobile = () => {
        setIsMobile(window.innerWidth < 640); // sm breakpoint
      };
      checkMobile();
      window.addEventListener("resize", checkMobile);
      return () => window.removeEventListener("resize", checkMobile);
    }, []);

    useEffect(() => {
      setLogoUrl(token.uri || token.logo || null);
    }, [token.uri, token.logo, token.mint]);

    useEffect(() => {
      let cancelled = false;
      if (token.uri && !logoUrl) {
        fetchTokenMetadata(token.uri).then((data) => {
          if (cancelled) return;
          const img = extractMetaImage(data);
          if (img) {
            setLogoUrl(img);
          }
        });
      }
      return () => {
        cancelled = true;
      };
    }, [token.uri, logoUrl]);

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
      () => normalizeAssetUrl(logoUrl || token.logo || token.uri),
      [logoUrl, token.logo, token.uri],
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
    const twitterInfo = useMemo(() => resolveTwitterInfo(token), [token]);
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
      const path = `/trade/${token.pair_address || token.mint}`;
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

    const handleSearchClick = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        openLinkInNewTab(twitterSearchUrl);
      },
      [openLinkInNewTab, twitterSearchUrl],
    );

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
        if (!token.pair_address) return;
        navigator.clipboard
          .writeText(token.pair_address)
          .then(() => {
            showEnhancedToast("success", "Address copied to clipboard", {
              title: "Copied!",
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
      [token.pair_address],
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
          className="group relative block rounded-lg border border-transparent bg-[#0f0f0f] px-3 py-3 text-sm transition-all duration-200 hover:border-[#FFFFFF0F] hover:bg-[#1a1a1a] sm:px-4 sm:py-4 sm:text-base md:px-5"
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
                        border: `2px solid ${protocolColor}`,
                        padding: 2,
                        backgroundColor: "#06070b",
                        boxShadow: `0 0 8px ${protocolColor}20`,
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
                    className="absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-[#0f0f0f] bg-[#0f0f0f] transition-transform duration-200 group-hover:scale-110"
                    style={{
                      borderColor: protocolColor,
                      boxShadow: `0 0 6px ${protocolColor}50`,
                    }}
                  >
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
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span className="block truncate text-base font-bold text-white">
                      {token.symbol}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyAddress}
                      className="relative z-10 flex-shrink-0 p-1 text-[#7FFFC9] transition-all duration-200 hover:text-[#5FE0A0] active:scale-95"
                      style={{ pointerEvents: "auto" }}
                      title="Copy address"
                    >
                      <LuCopy size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={handleShareLink}
                      className="relative z-10 flex-shrink-0 p-1 text-neutral-500 transition-all duration-200 hover:text-emerald-400 active:scale-95"
                      style={{ pointerEvents: "auto" }}
                      title="Copy trade link"
                    >
                      <IoShareSocialOutline size={16} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 truncate text-xs text-neutral-400">
                    <span>{token.name}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelect(token);
                }}
                className="relative z-10 flex flex-shrink-0 cursor-pointer items-center justify-center gap-1 rounded-lg border border-[#7FFFC940] bg-gradient-to-r from-[#243E33] to-[#1a2e26] px-4 py-2 text-xs font-bold text-[#7FFFC9] transition-all duration-300 ease-out hover:border-[#7FFFC960] hover:from-[#2a4d3d] hover:to-[#1f3a2f]"
                style={{ transformOrigin: "center", pointerEvents: "auto" }}
                title="Select token"
              >
                <BsLightningChargeFill className="h-3.5 w-3.5" />
                Buy
              </button>
            </div>
            {/* Second Row: Age, Social Icons */}
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-[#1a1a1a] px-2 py-0.5 text-[10px] font-semibold text-neutral-300">
                {ageLabel}
              </span>
              <div className="relative flex items-center gap-2 text-neutral-500">
                <button
                  type="button"
                  onClick={handleTwitterProfileClick}
                  className="relative z-10 p-1 transition-all duration-200 hover:text-white active:scale-95"
                  style={{ pointerEvents: "auto" }}
                  title="View X profile"
                >
                  <BsTwitterX size={15} />
                </button>
                <button
                  type="button"
                  onClick={handleSearchClick}
                  className="relative z-10 p-0.5 transition-all duration-200 hover:text-white"
                  style={{ pointerEvents: "auto" }}
                  title="Search on X"
                >
                  <FaSearch size={13} className="sm:h-3 sm:w-3" />
                </button>
                {isPumpToken && (
                  <button
                    type="button"
                    onClick={handlePumpClick}
                    className="relative z-10 p-1 transition-all duration-200 hover:text-white active:scale-95"
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
                <span className="font-bold text-white">${mc}</span>
              </div>
              <div>
                <span className="text-[#666666]">V: </span>
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
                  className="relative rounded-lg"
                  style={{ border: "none", padding: 0 }}
                >
                  <div
                    className="relative rounded-lg transition-all duration-200 group-hover:scale-105"
                    style={{
                      border: `2px solid ${protocolColor}`,
                      padding: 2,
                      backgroundColor: "#06070b",
                      boxShadow: `0 0 8px ${protocolColor}20`,
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
                  className="absolute -right-0.5 -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#0f0f0f] bg-[#0f0f0f] transition-transform duration-200 group-hover:scale-110"
                  style={{
                    borderColor: protocolColor,
                    boxShadow: `0 0 6px ${protocolColor}50`,
                  }}
                >
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
                </div>
              </div>

              <div className="max-w-[380px] min-w-0 flex-1">
                <div className="mb-1.5 flex min-w-0 items-center gap-2">
                  <span className="block min-w-0 truncate text-base font-bold text-white">
                    {token.symbol}
                  </span>
                  <span className="block min-w-0 flex-shrink truncate text-sm text-neutral-500">
                    {token.name}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyAddress}
                    className="relative z-10 ml-1 flex-shrink-0 p-0.5 text-[#7FFFC9] transition-all duration-200 hover:scale-110 hover:text-[#5FE0A0] active:scale-95"
                    style={{ pointerEvents: "auto" }}
                    title="Copy address"
                  >
                    <LuCopy size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={handleShareLink}
                    className="relative z-10 flex-shrink-0 p-0.5 text-neutral-500 transition-all duration-200 hover:scale-110 hover:text-emerald-400 active:scale-95"
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
                  <div className="relative flex items-center gap-2.5 text-neutral-500">
                    <button
                      type="button"
                      onClick={handleTwitterProfileClick}
                      onMouseEnter={handleTwitterProfileMouseEnter}
                      onMouseLeave={handleTwitterProfileMouseLeave}
                      className="relative z-10 p-0.5 transition-all duration-200 hover:text-white"
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
                    className="relative z-10 transition-all duration-200 hover:text-white p-0.5"
                    style={{ pointerEvents: "auto" }}
                    title="Telegram"
                  >
                    <PiTelegramLogo size={15} className="sm:w-3.5 sm:h-3.5" />
                  </button>
                  <button
                    className="relative z-10 transition-all duration-200 hover:text-white p-0.5"
                    style={{ pointerEvents: "auto" }}
                    title="Documentation"
                  >
                    <TiDocumentText size={15} className="sm:w-3.5 sm:h-3.5" />
                  </button>
                  <button
                    className="relative z-10 transition-all duration-200 hover:text-white p-0.5"
                    style={{ pointerEvents: "auto" }}
                    title="Website"
                  >
                    <GoGlobe size={15} className="sm:w-3.5 sm:h-3.5" />
                  </button> */}
                    {isPumpToken && (
                      <button
                        type="button"
                        onClick={handlePumpClick}
                        className="relative z-10 p-0.5 transition-all duration-200 hover:text-white"
                        style={{ pointerEvents: "auto" }}
                        title="View on pump.fun"
                      >
                        <LuPill size={15} className="sm:h-3.5 sm:w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSearchClick}
                      className="relative z-10 p-0.5 transition-all duration-200 hover:text-white"
                      style={{ pointerEvents: "auto" }}
                      title="Search on X"
                    >
                      <FaSearch size={13} className="sm:h-3 sm:w-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* MC, V and L */}
            <div className="flex h-full flex-shrink-0 items-center gap-3 text-xs whitespace-nowrap text-[#9595B5] sm:text-sm md:gap-5">
              <span>
                MC: <span className="font-bold text-white">${mc}</span>
              </span>
              <span>
                V: <span className="font-bold text-white">${vol}</span>
              </span>
              <span>
                L: <span className="font-bold text-white">${liq}</span>
              </span>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelect(token);
              }}
              className="relative z-10 flex flex-shrink-0 cursor-pointer items-center justify-center gap-1 rounded-lg border border-[#7FFFC940] bg-gradient-to-r from-[#243E33] to-[#1a2e26] px-2.5 py-2 text-xs font-bold text-[#7FFFC9] transition-all duration-300 ease-out hover:border-[#7FFFC960] hover:from-[#2a4d3d] hover:to-[#1f3a2f] sm:px-3"
              style={{ transformOrigin: "center", pointerEvents: "auto" }}
              title="Select token"
            >
              <BsLightningChargeFill className="h-3 w-3" />
              Buy
            </button>
          </div>
        </li>
      </>
    );
  },
);
