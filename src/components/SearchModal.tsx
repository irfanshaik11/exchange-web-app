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
  const [logoUrl, setLogoUrl] = useState<string | null>(token.uri || token.logo || null);

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
              pumpTokens: filterTokens(
                phrase: "${searchQuery.trim()}"
                rankings: {attribute: volume1, direction: DESC}
                filters: {
                  liquidity: {gt: 10000}
                  network: 1399811149
                  launchpadProtocol: "Pump"
                }
              ) {
                results {
                  token {
                    name
                    symbol
                    address
                    createdAt
                    info {
                      imageThumbUrl
                      imageSmallUrl
                      imageLargeUrl
                    }
                  }
                  pair {
                    address
                  }
                  marketCap
                  liquidity
                  volume1
                }
              }
              
              raydiumTokens: filterTokens(
                phrase: "${searchQuery.trim()}"
                rankings: {attribute: volume1, direction: DESC}
                filters: {
                  liquidity: {gt: 10000}
                  network: 1399811149
                  launchpadProtocol: "RaydiumLaunchpad"
                }
              ) {
                results {
                  token {
                    name
                    symbol
                    address
                    createdAt
                    info {
                      imageThumbUrl
                      imageSmallUrl
                      imageLargeUrl
                    }
                  }
                  pair {
                    address
                  }
                  marketCap
                  liquidity
                  volume1
                }
              }
              
              meteoraTokens: filterTokens(
                phrase: "${searchQuery.trim()}"
                rankings: {attribute: volume1, direction: DESC}
                filters: {
                  liquidity: {gt: 10000}
                  network: 1399811149
                  launchpadProtocol: "MeteoraDBC"
                }
              ) {
                results {
                  token {
                    name
                    symbol
                    address
                    createdAt
                    info {
                      imageThumbUrl
                      imageSmallUrl
                      imageLargeUrl
                    }
                  }
                  pair {
                    address
                  }
                  marketCap
                  liquidity
                  volume1
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
        
        // Combine results from all protocols
        const allResults = [
          ...(data.data?.pumpTokens?.results || []),
          ...(data.data?.raydiumTokens?.results || []),
          ...(data.data?.meteoraTokens?.results || [])
        ];
        
        // Filter out very old tokens (older than 30 days)
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        console.log('🔍 Search Debug:', {
          totalResults: allResults.length,
          thirtyDaysAgo: new Date(thirtyDaysAgo).toISOString(),
          sampleToken: allResults[0] ? {
            name: allResults[0].token?.name,
            createdAt: allResults[0].token?.createdAt,
            createdDate: allResults[0].token?.createdAt ? new Date(allResults[0].token.createdAt * 1000).toISOString() : 'No createdAt'
          } : 'No results'
        });
        
        const recentResults = allResults.filter((result: any) => {
          // If the token has a createdAt timestamp, check if it's recent
          if (result.token?.createdAt) {
            const createdAt = new Date(result.token.createdAt).getTime();
            return createdAt > thirtyDaysAgo;
          }
          // If no createdAt, include it (better to show than hide)
          return true;
        });
        
        console.log('🔍 Filtered Results:', {
          recentCount: recentResults.length,
          filteredOut: allResults.length - recentResults.length
        });
        
        // Convert GraphQL response to Token format
        const tokens: Token[] = recentResults.map((result: any) => {
          // Get the best available image URL (prioritize small, then thumb, then large)
          const imageUrl = result.token.info?.imageSmallUrl || 
                          result.token.info?.imageThumbUrl || 
                          result.token.info?.imageLargeUrl || 
                          null;
          
          // Determine AMM type based on which protocol the token came from
          // We need to check the original arrays to determine the source
          let amm = "pump_amm"; // default
          if (data.data?.raydiumTokens?.results?.some((r: any) => r.token.address === result.token.address)) {
            amm = "raydium_cpmm";
          } else if (data.data?.meteoraTokens?.results?.some((r: any) => r.token.address === result.token.address)) {
            amm = "pump_amm"; // Meteora uses same logic as pump.fun
          }
          
          return {
            id: 0,
            mint: result.token.address,
            name: result.token.name || "",
            symbol: result.token.symbol || "",
            logo: imageUrl,
            fully_diluted_value: result.marketCap || 0,
            total_liquidity_usd: result.liquidity || 0,
            total_buy_volume_1h: result.volume1 || 0,
            total_sell_volume_1h: 0,
            volume_1h: result.volume1 || 0, // Add this for UI display
            created_at: "",
            bonding_curve_progress: "0%",
            amm: amm,
            uri: imageUrl,
            pair_address: result.pair?.address || result.token.address
          };
        });
        
        console.log('🔍 Final Tokens:', {
          tokenCount: tokens.length,
          sampleToken: tokens[0] ? {
            name: tokens[0].name,
            symbol: tokens[0].symbol,
            volume_1h: tokens[0].volume_1h,
            amm: tokens[0].amm
          } : 'No tokens'
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
