"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { formatSmartNumber } from "~/utils/db";
import { FaBolt, FaClock, FaChartLine, FaTelegramPlane } from "react-icons/fa";
import usePaginatedTokensWebSocket from "~/hooks/usePaginatedTokensWebSocket";
import { FaRocket, FaFire, FaCrown, FaGraduationCap } from "react-icons/fa";
import InterstatePopout from "./InterstatePopout";
import { LuChartNoAxesColumn } from "react-icons/lu";
import { TbDropletHalf2Filled } from "react-icons/tb";
import { CiUser, CiGlobe } from "react-icons/ci";
import { fetchTokenMetadata } from "~/utils/functions";

// Updated Token type based on the provided object structure
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
  onSearch?: (query: string, sortBy: SortOption, filters: SearchFilters) => void;
}

export function TokenLogo({ token }: { token: any }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(token.logo || null);

  useEffect(() => {
    if (token.uri && !logoUrl) {
      fetchTokenMetadata(token.uri).then((data) => {
        if (data?.image) {
          setLogoUrl(data.image);
        }
      });
    }
  }, [token.uri, logoUrl]);

  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.style.display = 'none';
    setLogoUrl(null);
  }, []);

  return logoUrl ? (
    <img
      src={logoUrl}
      alt={token.symbol}
      className="h-16 w-16 rounded-lg border border-neutral-700 object-contain"
      onError={handleImageError}
    />
  ) : (
    <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800">
      <span className="text-sm font-bold text-neutral-400">
        {token.symbol?.charAt(0) || "?"}
      </span>
    </div>
  );
}

export default function SearchModal({ open, onClose, onSubmit, onSearch }: SearchModalProps) {
  const [allTokensFilter, setAllTokensFilter] = useState<'volume_24h' | 'new' | 'txs_24h' | 'marketcap'>('volume_24h');
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("time");
  const [filters, setFilters] = useState<SearchFilters>({
    isPumpSearch: false,
    isBonkSearch: false,
    isOg: false,
    onlyBonded: false,
  });
  const [searchResults, setSearchResults] = useState<Token[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Search API function
  const searchTokens = useCallback(async (searchQuery: string) => {
    if (searchQuery.trim().length < 3) {
      setSearchResults([]);
      return;
    }

    setIsSearchLoading(true);
    
    try {
      const baseUrl = process.env.NEXT_PUBLIC_WEBSOCKET_URL?.replace('/ws', '') || '';
      const trimmedQuery = searchQuery.trim();
      
      // Use tokenaddress for queries 10+ characters, name for 3-9 characters
      const searchParam = trimmedQuery.length >= 10 
        ? `tokenaddress=${encodeURIComponent(trimmedQuery)}`
        : `name=${encodeURIComponent(trimmedQuery)}`;
      
      const response = await fetch(`${baseUrl}/search?${searchParam}`);

      console.log(response)
      
      if (response.ok) {
        const token = await response.json();
        // API returns single token object, convert to array for consistency
        setSearchResults(Array.isArray(token.results) ? token.results : [token.results]);
      } else if (response.status === 404) {
        setSearchResults([]);
      } else {
        console.error('Search API error:', response.status);
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearchLoading(false);
    }
  }, []);

  // Debounced search effect
  useEffect(() => {
    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Set new timeout for search
    if (query.trim().length >= 3) {
      searchTimeoutRef.current = setTimeout(() => {
        searchTokens(query);
      }, 350);
    } else {
      setSearchResults([]);
      setIsSearchLoading(false);
    }

    // Cleanup function
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query, searchTokens]);
  
  const { data: allTokens } = usePaginatedTokensWebSocket({
    filter: 'txs_24h',
    limit: 5,
    order: 'desc'
  });

  // Memoize filtered tokens to prevent unnecessary recalculations
  const filteredTokens = useMemo(() => {
    if (!allTokens?.length) return [];
    
    let filtered = [...allTokens];

    // Apply filters
    if (filters.isPumpSearch) {
      filtered = filtered.filter(token => token.amm === 'pump_amm');
    }
    if (filters.onlyBonded) {
      filtered = filtered.filter(token => 
        parseFloat(token.bonding_curve_progress?.replace('%', '') || '0') >= 100
      );
    }

    return filtered;
  }, [allTokens, filters.isPumpSearch, filters.onlyBonded]);

  // Memoize callbacks to prevent child re-renders
  const handleSelectToken = useCallback((token: Token) => {
    onSubmit?.(token.mint);
    onClose();
  }, [onSubmit, onClose]);

  const handleQueryChange = useCallback((newQuery: string) => {
    setQuery(newQuery);
    // Remove the old onSearch call since we're handling it with the API now
  }, []);

  const updateFilter = useCallback((filterName: keyof SearchFilters) => {
    setFilters(prev => ({ ...prev, [filterName]: !prev[filterName] }));
  }, []);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  }, [onClose]);

  // Effects
  useEffect(() => {
    if (open) {
      setQuery("");
      setSearchResults([]);
      setIsSearchLoading(false);
      const timer = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    
    if (open) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [open, onClose]);

  // Memoize display state
  const isSearching = useMemo(() => query.trim().length >= 3, [query]);
  const displayTokens = useMemo(() => {
    if (isSearching) {
      return searchResults;
    }
    return filteredTokens;
  }, [isSearching, searchResults, filteredTokens]);

  if (!open) return null;

  return (
    <InterstatePopout
      open={open}
      onClose={onClose}
      align="center"
      overlayClassName="bg-[#090909]/80 backdrop-blur-[2px]"
      className="relative mx-4 pb-4 w-full max-w-2xl -translate-y-8 rounded-md border border-neutral-700 bg-neutral-950 text-neutral-100 shadow-2xl"
    >
      {/* Filter and Sort Controls */}
      <div className="flex items-center justify-between px-3 pt-3 text-xs font-medium">
        <div className="flex items-center gap-2">
          {sortingOptions.map((option) => {
            const IconComponent = option.icon;
            const isActive = 
              option.name === "Pump" ? filters.isPumpSearch :
              option.name === "Bonk" ? filters.isBonkSearch :
              option.name === "OG Mode" ? filters.isOg :
              filters.onlyBonded;

            const filterKey = 
              option.name === "Pump" ? "isPumpSearch" :
              option.name === "Bonk" ? "isBonkSearch" :
              option.name === "OG Mode" ? "isOg" :
              "onlyBonded";

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
          Esc
        </span>
      </div>

      {/* Token List */}
      <div className="flex-1 overflow-hidden px-4 pt-2 h-[550px]">
        <div className="mb-2">
          <span className="text-sm tracking-wider text-neutral-400">
            {isSearching ? "Search Results" : "History"} ({displayTokens.length})
            {isSearchLoading && (
              <span className="ml-2 text-xs text-blue-400">Searching...</span>
            )}
          </span>
        </div>
        {displayTokens.length === 0 ? (
          <p className="text-sm text-neutral-500">
            {isSearchLoading 
              ? "Searching..." 
              : isSearching 
                ? "No search results found." 
                : "No tokens available."
            }
          </p>
        ) : (
          <ul className="flex flex-col gap-4 h-full overflow-y-auto">
            {displayTokens.map((token) => {
              const mc = formatSmartNumber(token.fully_diluted_value || 0);
              const vol = formatSmartNumber((token.total_buy_volume_1h || 0) + (token.total_sell_volume_1h || 0));
              const liq = formatSmartNumber(token.total_liquidity_usd || 0);
              
              return (
                <TokenListItem 
                  key={token.mint}
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
}

// Separate component with new design - matches the history item design
const TokenListItem = React.memo(({ 
  token, 
  mc, 
  vol, 
  liq, 
  onSelect 
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
      className="flex cursor-pointer items-center justify-between gap-4 rounded text-sm transition-colors hover:bg-neutral-700/50 px-2 py-2"
      onClick={handleClick}
    >
      <div className="flex w-48 items-center gap-4">
        {/* Avatar with border and overlay icon */}
        <div className="relative flex-shrink-0">
          <TokenLogo token={token} />
          {/* Overlay icon */}
          <div className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full border border-teal-400 bg-neutral-900">
            <span className="text-[9px] font-bold text-white">
              R
            </span>
          </div>
        </div>
        {/* Text content */}
        <div className="max-w-[200px] min-w-0">
          <div className="flex items-center gap-2">
            <span className="block truncate font-medium text-white">
              {token.symbol} {token.name}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(token.mint);
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
            <span className="text-xs font-medium text-teal-400">
              3mo
            </span>
            <CiUser className="size-4" />
            <CiGlobe className="size-4" />
            <FaTelegramPlane className="size-4" />
          </div>
        </div>
      </div>

      {/* Financial metrics */}
      <div className="flex h-full items-center gap-6 text-xs whitespace-nowrap">
        <span className="text-neutral-400">
          MC{" "}
          <span className="text-lg font-medium text-white">
            ${mc}
          </span>
        </span>
        <span className="text-neutral-400">
          V{" "}
          <span className="text-lg font-medium text-white">
            ${vol}
          </span>
        </span>
        <span className="text-neutral-400">
          L{" "}
          <span className="text-lg font-medium text-white">
            ${liq}
          </span>
        </span>
      </div>

      {/* Action button */}
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
});