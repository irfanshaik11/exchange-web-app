"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import { formatSmartNumber, formatMarketCap } from "~/utils/db";
import { FaBolt, FaClock, FaChartLine, FaSearch, FaUser, FaRegCopy } from "react-icons/fa";
import { FaRocket, FaFire, FaCrown, FaGraduationCap } from "react-icons/fa";
import InterstatePopout from "./InterstatePopout";
import { LuChartNoAxesColumn } from "react-icons/lu";
import { TbDropletHalf2Filled } from "react-icons/tb";
import { fetchTokenMetadata } from "~/utils/functions";
import { extractMetaImage } from "~/utils/images";
import FastImage from "./FastImage";
import { IoShareSocialOutline } from "react-icons/io5";
import { LuPill } from "react-icons/lu";
import type { Timeframe } from "../pages/index";

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
  { key: "time" as const, icon: FaClock },
  { key: "market_cap" as const, icon: FaChartLine },
  { key: "volume_1h" as const, icon: LuChartNoAxesColumn },
  { key: "liquidity" as const, icon: TbDropletHalf2Filled },
];

const DEFAULT_PROTOCOL_COLOR = "#22c55e";
const DEFAULT_PROTOCOL_ICON = "https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png";

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
  "meteora_v2": "#ff4662",
  pump_amm: "#e9ba14",
  orca: "#0ea5e9",
};

const normalizedProtocolColorMap: Record<string, string> = Object.fromEntries(
  Object.entries(rawProtocolColorMap).map(([key, value]) => [key.toLowerCase().replace(/\s+/g, "").replace(/_/g, ""), value])
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
  if (/^[a-z0-9_-]{40,}$/i.test(s) && !/^https?:\/\//i.test(s)) return `https://arweave.net/${s}`;
  if (s.startsWith("http://")) return s.replace(/^http:\/\//i, "https://");
  if (s.startsWith("https://")) return s;
  return null;
}

function extractProtocolRaw(token: Partial<Token> & Record<string, any>): string | null {
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

function shouldFillProtocolBadge(token: Partial<Token> & Record<string, any>): boolean {
  const raw = extractProtocolRaw(token) || "";
  return ["meteora", "bonk", "bags", "moonit", "moonshot", "moonshoot"].some((needle) => raw.includes(needle));
}

function resolveProtocolColor(token: Partial<Token> & Record<string, any>, chain?: string): string {
  const raw = extractProtocolRaw(token);
  
  // For Monad tokens, use purple border
  if (chain === 'monad' || (token.mint && typeof token.mint === 'string' && token.mint.startsWith('0x'))) {
    return '#c084fc'; // Purple color for Monad tokens
  }
  
  if (!raw) return DEFAULT_PROTOCOL_COLOR;
  if (raw.includes("meteora")) return "#ff4662";
  if (raw.includes("pump")) return DEFAULT_PROTOCOL_COLOR;
  if (raw.includes("launch")) return "#3b82f6";
  const normalized = normalizeKey(raw);
  if (rawProtocolColorMap[raw]) return rawProtocolColorMap[raw];
  if (normalizedProtocolColorMap[normalized]) return normalizedProtocolColorMap[normalized];
  if (raw.includes("raydium")) return "#5c51f7";
  if (raw.includes("moonit") || raw.includes("moonshot") || raw.includes("moonshoot")) return "#eab308";
  if (raw.includes("boop")) return "#134577";
  if (raw.includes("bonk")) return "#ff6b35";
  if (raw.includes("bags")) return DEFAULT_PROTOCOL_COLOR;
  if (raw.includes("orca")) return "#0ea5e9";
  if (raw.includes("jupiter")) return "#8b5cf6";
  return DEFAULT_PROTOCOL_COLOR;
}

function resolveProtocolIcon(token: Partial<Token> & Record<string, any>, chain?: string): string {
  // For Monad tokens, use MonadTable's protocol mapping
  if (chain === 'monad' || (token.mint && typeof token.mint === 'string' && token.mint.startsWith('0x'))) {
    const launchpadProtocol = (token.launchpad_protocol || token.launchpad_name || token.protocol || '').toLowerCase();
    
    // Map nad.fun to GitHub avatar (from MonadTable)
    if (launchpadProtocol.includes('nad.fun') || launchpadProtocol === 'nadfun') {
      return 'https://avatars.githubusercontent.com/u/173274001?s=200&v=4';
    }
    
    // Map flap.sh to LinkedIn logo (from MonadTable)
    if (launchpadProtocol.includes('flap.sh') || launchpadProtocol.includes('flapsh')) {
      return 'https://media.licdn.com/dms/image/v2/D4D0BAQFG5I0EDOrmJQ/company-logo_200_200/company-logo_200_200/0/1714693191952/flap_sh_logo?e=2147483647&v=beta&t=2kcdij2YPOFjLdPYzAhQxKgbGcuyh7Cdyp0AkGR8V6A';
    }
    
    // Map Kuru to Twitter profile image (from MonadTable)
    if (launchpadProtocol.includes('kuru')) {
      return 'https://pbs.twimg.com/profile_images/1950962142917619714/R7Cj_qk7_400x400.jpg';
    }
    
    // Default to nad.fun icon for Monad tokens
    return 'https://avatars.githubusercontent.com/u/173274001?s=200&v=4';
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
  if (raw.includes("moonit") || raw.includes("moonshot") || raw.includes("moonshoot")) {
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

function resolveTwitterInfo(token: Partial<Token> & Record<string, any>): { url: string | null; handle: string | null } {
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

  const fallback = (token.symbol || token.name || "").toLowerCase().replace(/[^a-z0-9_]/gi, "");
  if (fallback) {
    return { handle: fallback, url: `https://twitter.com/${fallback}` };
  }
  return { url: null, handle: null };
}

function resolveSearchVolume1h(token: Partial<Token> & Record<string, any>): number {
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
  chain = 'sol',
}: SearchModalProps) {
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
        return sortedTokens.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      case "market_cap":
        return sortedTokens.sort((a, b) => 
          (b.fully_diluted_value || 0) - (a.fully_diluted_value || 0)
        );
      case "volume_1h":
        return sortedTokens.sort((a, b) => 
          (b.volume_1h || 0) - (a.volume_1h || 0)
        );
      case "liquidity":
        return sortedTokens.sort((a, b) => 
          (b.total_liquidity_usd || 0) - (a.total_liquidity_usd || 0)
        );
      default:
        return sortedTokens;
    }
  };

  // Fetch tokens and cache them
  const fetchTokens = useCallback(async () => {
    const now = Date.now();
    // Cache for 30 seconds
    if (cachedTokens.length > 0 && (now - lastFetchTime) < 30000) {
      return cachedTokens;
    }

    try {
      console.log('📥 Fetching tokens from service...');
      
      const endpoints = [
        '/api/token-service/pulse-new?limit=100',
        '/api/token-service/pulse-final-stretch?limit=100',
        '/api/token-service/pulse-migrated?limit=100'
      ];

      const responses = await Promise.all(
        endpoints.map(endpoint => 
          fetch(`${endpoint}&t=${Date.now()}`).then(res => res.ok ? res.json() : [])
        )
      );

      const allTokens = responses.flat().filter((token: any) => token && token.mint);
      
      console.log('✅ Cached', allTokens.length, 'tokens');
      setCachedTokens(allTokens);
      setLastFetchTime(now);
      
      return allTokens;
    } catch (error) {
      console.error('❌ Fetch error:', error);
      return [];
    }
  }, [cachedTokens, lastFetchTime]);

  // Search when Enter is pressed
  const searchTokens = useCallback(async (searchQuery: string) => {
    if (searchQuery.trim().length < 1) {
      setSearchResults([]);
      setSearchLoading(false);
      setHasSearched(false);
      return;
    }
    
    setSearchLoading(true);
    setHasSearched(true);
    try {
      console.log('🔍 Searching:', { query: searchQuery.trim() });
      
      // Use different endpoint based on chain
      const isMonad = chain === 'monad';
      const endpoint = isMonad 
        ? `/api/token-service/search-monad?q=${encodeURIComponent(searchQuery.trim())}&limit=50`
        : `/api/token-service/search?phrase=${encodeURIComponent(searchQuery.trim())}&limit=50`;
      
      const response = await fetch(endpoint);
      
      if (!response.ok) {
        console.error('❌ Search API error:', response.status);
        setSearchResults([]);
        return;
      }
      
      const searchData = await response.json();
      // Monad uses 'data' field, Solana uses 'tokens' field
      const filteredTokens = isMonad ? (searchData.data || []) : (searchData.tokens || []);
      
      console.log('🔍 Found results:', {
        query: searchQuery,
        chain,
        matchedTokens: filteredTokens.length
      });
      
      // Convert search response to Token format
      const tokens: Token[] = filteredTokens.map((token: any) => {
        // Determine AMM/protocol from the token data
        let amm = "pump_amm"; // default
        if (token.protocol === "raydium" || token.launchpadName === "Raydium") {
          amm = "raydium_cpmm";
        } else if (token.protocol === "meteora" || token.launchpadName === "Meteora") {
          amm = "meteora";
        }
        
        // Parse timestamp - handle both Unix timestamps and date strings
        let createdAt = "";
        if (token.launch_time) {
          // Handle Unix timestamp (seconds) or date string
          if (typeof token.launch_time === 'number') {
            // Convert Unix timestamp to ISO string
            createdAt = new Date(token.launch_time * 1000).toISOString();
          } else {
            createdAt = new Date(token.launch_time).toISOString();
          }
        } else if (token.created_at) {
          // Handle Unix timestamp (seconds) or date string
          if (typeof token.created_at === 'number') {
            // Convert Unix timestamp to ISO string
            // Check if it's in seconds or milliseconds
            const timestamp = token.created_at < 10000000000 
              ? token.created_at * 1000 
              : token.created_at;
            createdAt = new Date(timestamp).toISOString();
          } else {
            createdAt = new Date(token.created_at).toISOString();
          }
        }
        
        // For Monad tokens, use 'address' instead of 'mint'
        const tokenAddress = isMonad ? (token.address || token.mint) : (token.mint || token.address);
        
        return {
          id: 0,
          mint: tokenAddress,
          name: token.name || "",
          symbol: token.symbol || "",
          logo: token.logo || token.image || token.image_url || token.uri,
          fully_diluted_value: token.market_cap_usd || token.marketCapUSD || token.fully_diluted_value || 0,
          total_liquidity_usd: token.liquidity_usd || 0,
          total_buy_volume_1h: token.total_buy_volume_1h || 0,
          total_sell_volume_1h: token.total_sell_volume_1h || 0,
          volume_1h: token.volume_24h || token.volume24h || token.volume_24h_usd || 0,
          created_at: createdAt,
          bonding_curve_progress: token.bonding_pct ? `${token.bonding_pct}%` : "0%",
          amm: amm,
          uri: token.uri || token.logo || token.image || token.image_url,
          pair_address: token.pair_address || tokenAddress,
          // Preserve launchpad_protocol for Monad tokens
          launchpad_protocol: token.launchpad_protocol || token.launchpad_name || token.protocol
        } as Token & { launchpad_protocol?: string };
      });
      
      setSearchResults(tokens);
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [chain]);

  const handleSelectToken = useCallback(
    async (token: Token) => {
      try {
        // First, backfill the token to the database
        console.log('🔄 Backfilling token:', token);
        
        const backfillResponse = await fetch('/api/token-service/backfill-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            mint: token.mint,
            name: token.name,
            symbol: token.symbol,
            uri: token.uri,
            market_cap_usd: token.fully_diluted_value,
            liquidity_usd: token.total_liquidity_usd,
            pair_address: token.pair_address
          })
        });

        if (backfillResponse.ok) {
          console.log('✅ Token backfilled successfully');
        } else {
          console.warn('⚠️ Token backfill failed, but continuing with navigation');
        }

        // Navigate to trade page
        onSubmit?.(token.pair_address);
        onClose();
      } catch (error) {
        console.error('❌ Error backfilling token:', error);
        // Still navigate even if backfill fails
        onSubmit?.(token.pair_address);
        onClose();
      }
    },
    [onSubmit, onClose],
  );

  const handleQueryChange = useCallback((newQuery: string) => {
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
  }, [searchTokens]);

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
      className="mx-auto w-[900px] max-w-[94vw] rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl transition-all duration-200"
      disableClickOutside={false}
    >
      {/* Filter and Sort Controls */}
      <div className="flex items-center justify-end px-3 pt-3 text-xs font-medium">
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

        <div className="flex items-center gap-2">
          <span className="text-neutral-400">Sort by</span>
          {sortByOptions.map((option) => {
            const IconComponent = option.icon;
            const isActive = sortBy === option.key;
            return (
              <button
                key={option.key}
                className={`flex items-center justify-center rounded border p-1.5 transition ${
                  isActive
                    ? "border-blue-500/60 bg-blue-500/20 text-blue-300"
                    : "border-neutral-700 bg-neutral-800/50 text-neutral-300 hover:bg-neutral-700/40"
                }`}
                onClick={() => setSortBy(option.key)}
              >
                <IconComponent className="size-3" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Search Input */}
      <div className="relative border-b border-neutral-700 p-4">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Search by name, ticker, or CA… (type to search)"
          className="w-full bg-transparent text-[20px] outline-none placeholder:text-neutral-500"
        />
        <div className="absolute top-1/2 right-4 -translate-y-1/2 flex items-center gap-1">
          <span className="rounded-md border border-neutral-700/70 bg-neutral-800/80 px-1.5 py-0.5 text-[10px] leading-none text-neutral-200">Tab</span>
          <span className="rounded-md border border-neutral-700/70 bg-neutral-800/80 px-1.5 py-0.5 text-[10px] leading-none text-neutral-200">/</span>
        </div>
      </div>

      {/* Token List */}
      <div className="h-[550px] flex-1 overflow-hidden px-4 pt-3">
        <div className="mb-2">
          <span className="text-base tracking-wider text-neutral-300">
            {isSearching ? "Search Results" : "Search"} ({displayTokens.length})
          </span>
        </div>
        {searchLoading && displayTokens.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500"></div>
            <span className="ml-2 text-sm text-neutral-400">Loading tokens...</span>
          </div>
        ) : displayTokens.length === 0 ? (
          <p className="text-sm text-neutral-500">
            {hasSearched
              ? "No results found. Try a different search term."
              : "Type at least 2 characters to search tokens (e.g., 'pepe', 'sol', 'pump')..."}
          </p>
        ) : (
          <ul className="flex h-full flex-col gap-4 overflow-y-auto">
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
    chain = 'sol',
  }: {
    token: Token;
    mc: string;
    vol: string;
    liq: string;
    onSelect: (token: Token) => void;
    chain?: string;
  }) => {
    const [logoUrl, setLogoUrl] = useState<string | null>(token.uri || token.logo || null);
    const [showXPreview, setShowXPreview] = useState(false);
    const [xPreviewPosition, setXPreviewPosition] = useState({ x: 0, y: 0 });
    const xPreviewTimeoutRef = useRef<number | null>(null);

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
        if (typeof window !== "undefined" && xPreviewTimeoutRef.current != null) {
          window.clearTimeout(xPreviewTimeoutRef.current);
        }
      };
    }, []);

    const handleSelect = useCallback(() => {
      onSelect(token);
    }, [onSelect, token]);

    const protocolColor = useMemo(() => resolveProtocolColor(token, chain), [token, chain]);
    const tokenIcon = useMemo(() => resolveProtocolIcon(token, chain), [token, chain]);
    const fillProtocolBadge = useMemo(() => shouldFillProtocolBadge(token), [token]);
    const normalizedLogo = useMemo(() => normalizeAssetUrl(logoUrl || token.logo || token.uri), [logoUrl, token.logo, token.uri]);
    const fallbackAvatar = useMemo(
      () =>
        `https://ui-avatars.com/api/?name=${encodeURIComponent(token.symbol || token.name || "T")}&background=0f1012&color=E6E7EA&size=36`,
      [token.symbol, token.name]
    );
    const isPumpToken = useMemo(() => (token.mint || "").toLowerCase().endsWith("pump"), [token.mint]);
    const twitterInfo = useMemo(() => resolveTwitterInfo(token), [token]);
    const twitterProfileUrl = twitterInfo.url;
    const twitterHandle = twitterInfo.handle;
    const twitterSearchQuery = useMemo(() => `${token.symbol || ""} ${token.name || ""}`.trim(), [token.symbol, token.name]);
    const twitterSearchUrl = useMemo(
      () =>
        twitterSearchQuery
          ? `https://twitter.com/search?q=${encodeURIComponent(twitterSearchQuery)}`
          : `https://twitter.com/search?q=${encodeURIComponent(token.symbol || token.name || "")}`,
      [twitterSearchQuery, token.symbol, token.name]
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
        setShowXPreview(true);
      },
      [twitterProfileUrl]
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
        event.stopPropagation();
        if (twitterProfileUrl) openLinkInNewTab(twitterProfileUrl);
      },
      [twitterProfileUrl, openLinkInNewTab]
    );

    const handleSearchClick = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        openLinkInNewTab(twitterSearchUrl);
      },
      [openLinkInNewTab, twitterSearchUrl]
    );

    const handlePumpClick = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (!token.mint) return;
        openLinkInNewTab(`https://pump.fun/coin/${token.mint}`);
      },
      [token.mint, openLinkInNewTab]
    );

    const handleCopyAddress = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (!token.pair_address) return;
        navigator.clipboard.writeText(token.pair_address).catch(() => {});
      },
      [token.pair_address]
    );

    const handleShareLink = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (!shareUrl) return;
        navigator.clipboard.writeText(shareUrl).catch(() => {});
      },
      [shareUrl]
    );

    const ageLabel = useMemo(() => getTokenAge(token.created_at), [token.created_at]);

    return (
      <>
      <li
          className="relative flex cursor-pointer items-center justify-between gap-6 rounded px-5 py-4 text-base transition-colors hover:bg-neutral-700/40 min-h-[96px]"
          onClick={handleSelect}
      >
          <div className="flex w-72 items-center gap-5">
            <div
              className="relative flex items-center justify-center rounded-sm"
              style={{
                width: 64,
                height: 64,
                overflow: "visible",
                boxShadow: `0 0 4px ${AX.glowBlue}30`,
              }}
            >
              <div className="relative rounded-sm" style={{ border: "none", padding: 0 }}>
                <div
                  className="relative rounded-sm"
                  style={{
                    border: `1px solid ${protocolColor}`,
                    padding: 1,
                    backgroundColor: "#06070b",
                  }}
                >
                  <div className="relative rounded-sm overflow-hidden" style={{ width: 52, height: 52 }}>
                    <FastImage
                      src={normalizedLogo ?? undefined}
                      fallbackSrc={fallbackAvatar}
                      alt={token.name || token.symbol || ""}
                      width={52}
                      height={52}
                      className="w-full h-full object-cover"
                      symbol={token.symbol}
                      name={token.name}
                      showBubble={false}
                    />
          </div>
                </div>
              </div>
              <div
                className="absolute bottom-0 right-0 bg-white rounded-full flex items-center justify-center transform translate-x-1/5 translate-y-1/4"
                style={{
                  width: 16,
                  height: 16,
                  border: `1px solid ${protocolColor}`,
                  boxShadow: `0 0 3px ${protocolColor}60`,
                }}
              >
                <img
                  src={tokenIcon}
                  alt="Protocol logo"
                  className={`${fillProtocolBadge ? "w-full h-full object-cover" : "w-4/5 h-4/5 object-contain"} rounded-full`}
                  style={{
                    filter: protocolColor === "#eab308" ? "sepia(1) saturate(3) hue-rotate(-10deg) brightness(1.1)" : "none",
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            </div>

            <div className="max-w-[280px] min-w-0">
            <div className="flex items-center gap-2">
                <span className="block truncate text-lg font-semibold text-white">
                  {token.symbol}
                </span>
                <span className="block truncate text-sm text-neutral-400">
                  {token.name}
              </span>
              <button
                  onClick={handleCopyAddress}
                  className="flex-shrink-0 text-neutral-400 transition-colors hover:text-emerald-400"
                title="Copy address"
              >
                  <FaRegCopy size={12} />
                </button>
                <button
                  onClick={handleShareLink}
                  className="flex-shrink-0 text-neutral-400 transition-colors hover:text-emerald-400"
                  title="Copy trade link"
                >
                  <IoShareSocialOutline size={14} />
              </button>
            </div>
              <div className="mt-1 flex items-center gap-2 text-sm">
                <span className="font-medium text-teal-300">{ageLabel}</span>
                {isPumpToken && (
                  <button
                    onClick={handlePumpClick}
                    className="text-neutral-400 transition-colors hover:text-emerald-400"
                    title="View on pump.fun"
                  >
                    <LuPill size={12} />
                  </button>
                )}
                <button
                  onClick={handleSearchClick}
                  className="text-neutral-400 transition-colors hover:text-emerald-400"
                  title="Search on X"
                >
                  <FaSearch size={12} />
                </button>
                <button
                  onClick={handleTwitterProfileClick}
                  onMouseEnter={handleTwitterProfileMouseEnter}
                  onMouseLeave={handleTwitterProfileMouseLeave}
                  className="text-neutral-400 transition-colors hover:text-emerald-400"
                  title="View X profile"
                >
                  <FaUser size={12} />
                </button>
            </div>
          </div>
        </div>

          <div className="flex h-full items-center gap-8 text-sm whitespace-nowrap">
          <span className="text-neutral-400">
              MC <span className="text-xl font-semibold text-white">${mc}</span>
          </span>
          <span className="text-neutral-400">
              V <span className="text-xl font-semibold text-white">${vol}</span>
          </span>
          <span className="text-neutral-400">
              L <span className="text-xl font-semibold text-white">${liq}</span>
          </span>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect(token);
          }}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white transition-colors hover:bg-emerald-600"
          title="Select token"
        >
          <FaBolt className="h-4 w-4" />
        </button>
      </li>

        {showXPreview && twitterProfileUrl && (
          <div
            className="fixed z-[99998] pointer-events-auto"
            style={{
              left: `${xPreviewPosition.x}px`,
              top: `${xPreviewPosition.y}px`,
              transform: "translate(-50%, 0)",
            }}
            onMouseEnter={handleTwitterPreviewMouseEnter}
            onMouseLeave={handleTwitterPreviewMouseLeave}
          >
            <div
              className="rounded-xl overflow-hidden"
              style={{
                width: 260,
                backgroundColor: AX.surface,
                border: `1px solid ${AX.border}`,
                boxShadow: `0 16px 48px rgba(0, 0, 0, 0.45), 0 0 24px ${AX.glowBlue}`,
              }}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#2f3336" }}>
                <div className="flex items-center gap-3">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: "#1d9bf0" }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#ffffff" }}>
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: AX.text }}>
                      @{twitterHandle || "unknown"}
                    </div>
                    <div className="text-xs" style={{ color: AX.muted }}>
                      Live Preview
                    </div>
                  </div>
                </div>
                <button
                  className="text-xs font-medium px-2 py-1 rounded-md transition-colors duration-200"
                  style={{
                    backgroundColor: AX.aiCyan,
                    color: "#000000",
                    border: "none",
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openLinkInNewTab(twitterProfileUrl);
                  }}
                >
                  Open
                </button>
              </div>
              <div className="px-4 py-4 flex gap-3 items-start">
                <div
                  className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0"
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
                    className="w-full h-full object-cover"
                    symbol={token.symbol}
                    name={token.name}
                    showBubble={false}
                  />
                </div>
                <div className="flex-1 flex flex-col gap-1">
                  <div className="text-sm font-semibold" style={{ color: AX.text }}>
                    {token.symbol}
                  </div>
                  <div className="text-xs" style={{ color: AX.muted }}>
                    {token.name}
                  </div>
                  <div className="text-[11px] leading-relaxed" style={{ color: AX.text }}>
                    {twitterBio}
                  </div>
                </div>
              </div>
              <div className="px-4 pb-4 flex items-center gap-2">
                <button
                  className="flex-1 px-3 py-2 rounded-full text-xs font-semibold transition-colors duration-200"
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
                  className="px-3 py-2 rounded-full text-xs font-semibold transition-colors duration-200"
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
      </>
    );
  },
);
