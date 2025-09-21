"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import Image from 'next/image';
import { formatSmartNumber } from "~/utils/db";
import { FaBolt, FaClock, FaChartLine, FaTelegramPlane } from "react-icons/fa";
import usePaginatedTokensWebSocket from "~/hooks/usePaginatedTokensWebSocket";
import { FaRocket, FaFire, FaCrown, FaGraduationCap } from "react-icons/fa";
import InterstatePopout from "./InterstatePopout";
import { LuChartNoAxesColumn } from "react-icons/lu";
import { TbDropletHalf2Filled } from "react-icons/tb";
import { CiUser, CiGlobe } from "react-icons/ci";
import { fetchTokenMetadata } from "~/utils/functions";
import { withImageFallback, normalizeImageUrl, extractMetaImage } from "~/utils/images";
import AvatarImage from '~/components/AvatarImage';
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
}

export function TokenLogo({ token }: { token: any }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(token.logo || null);

  useEffect(() => {
    if (token.uri && !logoUrl) {
      fetchTokenMetadata(token.uri).then((data) => {
        const img = extractMetaImage(data);
        if (img) {
          setLogoUrl(img);
        }
      });
    }
  }, [token.uri, logoUrl]);

  const handleImageError = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      e.currentTarget.style.display = "none";
      setLogoUrl(null);
    },
    [],
  );

  return (
    <AvatarImage
      src={logoUrl || undefined}
      name={token.name}
      symbol={token.symbol}
      width={64}
      height={64}
      className="h-16 w-16 rounded-lg border border-neutral-700 object-contain"
    />
  );
}

// The new inner component that contains the actual modal content and logic
const SearchModalContent = React.memo(function SearchModalContent({
  open,
  onClose,
  onSubmit,
  onQueryChange,
  selectedTimeframe,
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

  const searchTokens = useCallback(async (searchQuery: string) => {
    if (searchQuery.trim().length < 1) {
      setSearchResults([]);
      return;
    }
    
    setSearchLoading(true);
    try {
      // Use GraphQL query directly to Codex API
      const apiKey = process.env.NEXT_PUBLIC_CODEX_API_KEY;
      
      const response = await fetch('https://graph.codex.io/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': apiKey || '',
        },
        body: JSON.stringify({
          query: `
            query {
              filterTokens(
                phrase: "${searchQuery.trim()}"
                filters: {
                  network: [1399811149]
                  liquidity: { gt: 10000 }
                }
                rankings: {
                  attribute: trendingScore24
                  direction: DESC
                }
                limit: 20
              ) {
                results {
                  token {
                    name
                    symbol
                    address
                    info {
                      imageThumbUrl
                      imageSmallUrl
                      imageLargeUrl
                    }
                  }
                  marketCap
                  liquidity
                }
              }
            }
          `
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.errors) {
          console.error("GraphQL errors:", data.errors);
          setSearchResults([]);
          return;
        }
        
        // Convert GraphQL response to Token format
        const tokens: Token[] = (data.data?.filterTokens?.results || []).map((result: any) => {
          // Get the best available image URL (prioritize small, then thumb, then large)
          const imageUrl = result.token.info?.imageSmallUrl || 
                          result.token.info?.imageThumbUrl || 
                          result.token.info?.imageLargeUrl || 
                          null;
          
          return {
            id: 0,
            mint: result.token.address,
            name: result.token.name || "",
            symbol: result.token.symbol || "",
            logo: imageUrl,
            fully_diluted_value: result.marketCap || 0,
            total_liquidity_usd: result.liquidity || 0,
            total_buy_volume_1h: 0,
            total_sell_volume_1h: 0,
            created_at: "",
            bonding_curve_progress: "0%",
            amm: "pump_amm",
            uri: imageUrl,
            pair_address: result.token.address
          };
        });
        
        setSearchResults(tokens);
      } else {
        console.error("GraphQL API error:", response.status);
        setSearchResults([]);
      }
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSelectToken = useCallback(
    (token: Token) => {
      onSubmit?.(token.pair_address);
      onClose();
    },
    [onSubmit, onClose],
  );

  const handleQueryChange = useCallback((newQuery: string) => {
    setQuery(newQuery);
    // Don't call onQueryChange automatically - only search on Enter
    // onQueryChange?.(newQuery);
  }, []);

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
      const timer = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const isSearching = useMemo(() => query.trim().length > 0, [query]);
  const displayTokens = useMemo(() => {
    return isSearching ? searchResults : [];
  }, [isSearching, searchResults]);

  return (
    <InterstatePopout
      open={open}
      onClose={onClose}
      align="center"
      overlayClassName="bg-[#090909]/80 backdrop-blur-[2px]"
      className="relative mx-4 w-full max-w-2xl -translate-y-8 rounded-md border border-neutral-700 bg-neutral-950 pb-4 text-neutral-100 shadow-2xl"
    >
      {/* Filter and Sort Controls */}
      <div className="flex items-center justify-between px-3 pt-3 text-xs font-medium">
        <div className="flex items-center gap-2">
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
        </div>

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
          placeholder="Search by name, ticker, or CA…"
          className="w-full bg-transparent text-[20px] outline-none placeholder:text-neutral-500"
        />
        <span className="absolute top-1/2 right-4 -translate-y-1/2 rounded bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-300">
          Enter to search
        </span>
      </div>

      {/* Token List */}
      <div className="h-[550px] flex-1 overflow-hidden px-4 pt-2">
        <div className="mb-2">
          <span className="text-sm tracking-wider text-neutral-400">
            {isSearching ? "Search Results" : "Search"} ({displayTokens.length})
          </span>
        </div>
        {searchLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500"></div>
            <span className="ml-2 text-sm text-neutral-400">Searching...</span>
          </div>
        ) : displayTokens.length === 0 ? (
          <p className="text-sm text-neutral-500">
            {isSearching
              ? "No search results found."
              : "Type a token name and press Enter to search."}
          </p>
        ) : (
          <ul className="flex h-full flex-col gap-4 overflow-y-auto">
            {displayTokens.map((token) => {
              const mc = formatSmartNumber(token.fully_diluted_value || 0);
              const vol = formatSmartNumber((token as any).volume_1h || 0);
              const liq = formatSmartNumber(token.total_liquidity_usd || 0);

              return (
                <TokenListItem
                  key={token.pair_address}
                  token={token}
                  mc={mc}
                  vol={vol}
                  liq={liq}
                  onSelect={handleSelectToken}
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

// Separate component with new design
const TokenListItem = React.memo(
  ({
    token,
    mc,
    vol,
    liq,
    onSelect,
  }: {
    token: Token;
    mc: string;
    vol: string;
    liq: string;
    onSelect: (token: Token) => void;
  }) => {
    const handleClick = useCallback(() => {
      onSelect(token);
    }, [onSelect, token]);

    return (
      <li
        className="flex cursor-pointer items-center justify-between gap-4 rounded px-2 py-2 text-sm transition-colors hover:bg-neutral-700/50"
        onClick={handleClick}
      >
        <div className="flex w-48 items-center gap-4">
          <div className="relative flex-shrink-0">
            <TokenLogo token={token} />
            <div className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full border border-teal-400 bg-neutral-900">
              <span className="text-[9px] font-bold text-white">R</span>
            </div>
          </div>
          <div className="max-w-[200px] min-w-0">
            <div className="flex items-center gap-2">
              <span className="block truncate font-medium text-white">
                {token.symbol} {token.name}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(token.pair_address);
                }}
                className="flex-shrink-0 text-neutral-400 transition-colors hover:text-neutral-300"
                title="Copy address"
              >
                <svg
                  className="h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                  <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                </svg>
              </button>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs font-medium text-teal-400">3mo</span>
              <CiUser className="size-4" />
              <CiGlobe className="size-4" />
              <FaTelegramPlane className="size-4" />
            </div>
          </div>
        </div>

        <div className="flex h-full items-center gap-6 text-xs whitespace-nowrap">
          <span className="text-neutral-400">
            MC <span className="text-lg font-medium text-white">${mc}</span>
          </span>
          <span className="text-neutral-400">
            V <span className="text-lg font-medium text-white">${vol}</span>
          </span>
          <span className="text-neutral-400">
            L <span className="text-lg font-medium text-white">${liq}</span>
          </span>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect(token);
          }}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white transition-colors hover:bg-blue-600"
          title="Select token"
        >
          <FaBolt className="h-4 w-4" />
        </button>
      </li>
    );
  },
);
