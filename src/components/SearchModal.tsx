"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { Token } from "~/utils/db";
import { formatSmartNumber } from "~/utils/db";
import {
  FaTrash,
  FaBolt,
  FaClock,
  FaDollarSign,
  FaChartLine,
  FaWater,
  FaTelegramPlane,
} from "react-icons/fa";
import usePaginatedTokensWebSocket from "~/hooks/usePaginatedTokensWebSocket";
import { FaRocket, FaFire, FaCrown, FaGraduationCap } from "react-icons/fa";
import InterstatePopout from "./InterstatePopout";
import {
  addToHistory,
  clearHistory,
  getHistory,
  type SearchHistoryItem,
} from "../utils/searchHistory";
import { LuChartNoAxesColumn } from "react-icons/lu";
import { TbDropletHalf2Filled } from "react-icons/tb";
import { CiUser, CiGlobe } from "react-icons/ci";
import { env } from "../env";

// Define types locally
export type SortOption = "time" | "market_cap" | "volume_1h" | "liquidity";

export interface SearchFilters {
  isPumpSearch: boolean;
  isBonkSearch: boolean;
  isOg: boolean;
  onlyBonded: boolean;
}

export interface SearchParams {
  query: string;
  sortBy: SortOption;
  filters: SearchFilters;
}

// Original sorting options from the design
const sortingOptions = [
  {
    name: "Pump",
    icon: FaRocket,
    color: "green",
  },
  {
    name: "Bonk",
    icon: FaFire,
    color: "blue",
  },
  {
    name: "OG Mode",
    icon: FaCrown,
    color: "yellow",
  },
  {
    name: "Graduated",
    icon: FaGraduationCap,
    color: "red",
  },
];

// New sort by options for the right side
const sortByOptions = [
  {
    key: "time" as const,
    icon: FaClock,
  },
  {
    key: "market_cap" as const,
    icon: FaChartLine,
  },
  {
    key: "volume_1h" as const,
    icon: LuChartNoAxesColumn,
  },
  {
    key: "liquidity" as const,
    icon: TbDropletHalf2Filled,
  },
];

// Utility function to get button styling based on active state
const getSortingButtonClasses = (isActive: boolean, color: string) => {
  if (isActive) {
    return `border-${color}-500/60 bg-${color}-500/20 text-${color}-300 bg-${color}-500/20`;
  }
  return "border-neutral-700 bg-neutral-800/50 text-neutral-300 hover:bg-neutral-700/40";
};

// Search function
const searchTokens = async (
  params: SearchParams,
  controllerRef: React.MutableRefObject<AbortController | null>,
): Promise<Token[]> => {
  const { query, sortBy, filters } = params;
  const trimmedQuery = query.trim();

  if (trimmedQuery.length < 3) {
    return [];
  }

  try {
    if (controllerRef.current) {
      controllerRef.current.abort();
    }

    const controller = new AbortController();
    controllerRef.current = controller;

    const isAddress =
      trimmedQuery.length >= 32 && /^[a-zA-Z0-9]+$/.test(trimmedQuery);
    const searchParam = isAddress ? "tokenaddress" : "name";

    // Build URL parameters
    const urlParams = new URLSearchParams();
    urlParams.set(searchParam, trimmedQuery);

    if (sortBy !== "time") {
      urlParams.set("sort", sortBy);
    }

    if (filters.isPumpSearch) urlParams.set("pump", "true");
    if (filters.isBonkSearch) urlParams.set("bonk", "true");
    if (filters.isOg) urlParams.set("og", "true");
    if (filters.onlyBonded) urlParams.set("bonded", "true");

    // Use the backend URL from environment variable
    const url = `${env.NEXT_PUBLIC_BACKEND_URL}/api/token-search?${urlParams.toString()}`;

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    let tokens: Token[] = [];
    if (Array.isArray(data?.results)) {
      tokens = data.results;
    } else if (Array.isArray(data?.result)) {
      tokens = data.result;
    } else if (Array.isArray(data)) {
      tokens = data;
    } else if (data?.result) {
      tokens = [data.result];
    } else if (data) {
      tokens = [data];
    }

    // Sort tokens based on sortBy option
    const sorted = [...tokens];
    switch (sortBy) {
      case "market_cap":
        sorted.sort((a, b) => {
          const aValue =
            a.total_fully_diluted_valuation || a.fully_diluted_value || 0;
          const bValue =
            b.total_fully_diluted_valuation || b.fully_diluted_value || 0;
          return bValue - aValue;
        });
        break;
      case "volume_1h":
        sorted.sort((a, b) => {
          const aVolume =
            (a.total_buy_volume_24h || 0) + (a.total_sell_volume_24h || 0);
          const bVolume =
            (b.total_buy_volume_24h || 0) + (b.total_sell_volume_24h || 0);
          return bVolume - aVolume;
        });
        break;
      case "liquidity":
        sorted.sort((a, b) => {
          const aLiq = a.total_liquidity_usd || 0;
          const bLiq = b.total_liquidity_usd || 0;
          return bLiq - aLiq;
        });
        break;
      default:
        break;
    }

    return sorted;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    console.error("Token search error:", error);
    throw error;
  }
};

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit?: (query: string) => void;
  onQueryChange?: (query: string) => void;
}

interface SearchState {
  query: string;
  results: Token[];
  loading: boolean;
  history: SearchHistoryItem[];
  sortBy: SortOption;
  filters: {
    isPumpSearch: boolean;
    isBonkSearch: boolean;
    isOg: boolean;
    onlyBonded: boolean;
  };
}

const initialState: SearchState = {
  query: "",
  results: [],
  loading: false,
  history: [],
  sortBy: "time",
  filters: {
    isPumpSearch: false,
    isBonkSearch: false,
    isOg: false,
    onlyBonded: false,
  },
};

// Define dummy history data
const dummyHistoryData: SearchHistoryItem[] = [
  {
    mint: "0x1234567890123456789012345678901234567890",
    symbol: "PEPE",
    name: "Pepe",
    logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/24478.png",
    total_fully_diluted_valuation: 5000000000,
    total_buy_volume_24h: 25000000,
    total_sell_volume_24h: 23000000,
    total_liquidity_usd: 15000000,
  },
  {
    mint: "0x2345678901234567890123456789012345678901",
    symbol: "DOGE",
    name: "Dogecoin",
    logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/74.png",
    total_fully_diluted_valuation: 12000000000,
    total_buy_volume_24h: 45000000,
    total_sell_volume_24h: 42000000,
    total_liquidity_usd: 35000000,
  },
  {
    mint: "0x3456789012345678901234567890123456789012",
    symbol: "SHIB",
    name: "Shiba Inu",
    logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/5994.png",
    total_fully_diluted_valuation: 8000000000,
    total_buy_volume_24h: 18000000,
    total_sell_volume_24h: 16000000,
    total_liquidity_usd: 12000000,
  },
];

export default function SearchModal({
  open,
  onClose,
  onSubmit,
  onQueryChange,
}: SearchModalProps) {
  const {
    data: allTokens,
    isConnected,
    error: tokenError,
    isReconnecting,
  } = usePaginatedTokensWebSocket({
    filter: 'volume_24h',
    limit: 5,
    order: 'desc'
  });
  const [state, setState] = useState<SearchState>(initialState);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const updateState = (updates: Partial<SearchState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const updateFilters = (filterUpdates: Partial<SearchState["filters"]>) => {
    setState((prev) => ({
      ...prev,
      filters: { ...prev.filters, ...filterUpdates },
    }));
  };

  const handleQueryChange = (newQuery: string) => {
    updateState({ query: newQuery });

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onQueryChange?.(newQuery);
    }, 300);
  };

  const handleSubmit = (mint: string) => {
    const trimmed = mint.trim();
    if (!trimmed) return;
    onSubmit?.(trimmed);
    onClose();
  };

  const handleSelectToken = (token: Token) => {
    const historyItem: SearchHistoryItem = {
      mint: token.mint,
      symbol: token.symbol,
      name: token.name,
      logo: token.logo,
      total_fully_diluted_valuation: token.total_fully_diluted_valuation,
      total_buy_volume_24h: token.total_buy_volume_24h,
      total_sell_volume_24h: token.total_sell_volume_24h,
      total_liquidity_usd: token.total_liquidity_usd,
    };

    addToHistory(historyItem);
    updateState({ history: getHistory() });
    handleSubmit(token.mint);
  };

  const handleClearHistory = () => {
    clearHistory();
    updateState({ history: [] });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // Only close modal if there are no search results and we're not in the middle of searching
      if (
        state.results.length === 0 &&
        !state.loading &&
        state.query.trim().length >= 3
      ) {
        handleSubmit(state.query);
      }
      // If there are results, don't close the modal - let user interact with results
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const handleSortChange = (sortOption: SortOption) => {
    updateState({ sortBy: sortOption });
  };

  // Effects
  useEffect(() => {
    if (open) {

      console.log(allTokens)
      const existingHistory = getHistory();
      // If no history exists, add dummy data
      if (existingHistory.length === 0) {
        console.log(allTokens)
      }
      updateState({
        ...initialState,
        history: getHistory(),
      });
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      updateState(initialState);
    }
  }, [open]);

  // Global ESC key handler
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        onClose();
      }
    };

    if (open) {
      document.addEventListener("keydown", handleGlobalKeyDown);
    }

    return () => {
      document.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || state.query.trim().length < 3) {
      updateState({ results: [], loading: false });
      return;
    }

    const searchParams: SearchParams = {
      query: state.query.trim(),
      sortBy: state.sortBy,
      filters: state.filters,
    };

    updateState({ loading: true });

    searchTokens(searchParams, controllerRef)
      .then((results) => {
        updateState({ results, loading: false });
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          console.error("Search error:", error);
          updateState({ results: [], loading: false });
        }
      });

    return () => {
      if (controllerRef.current) {
        controllerRef.current.abort();
      }
    };
  }, [state.query, state.sortBy, state.filters, open]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (controllerRef.current) controllerRef.current.abort();
    };
  }, []);

  if (!open) return null;

  const showResults = state.query.trim().length >= 3;
  const showHistory = state.query.trim().length === 0;

  return (
    <InterstatePopout
      open={open}
      onClose={onClose}
      align="center"
      overlayClassName="bg-[#090909]/80 backdrop-blur-[2px]"
      className="relative mx-4 min-h-[600px] w-full max-w-2xl -translate-y-8 rounded-md border border-neutral-700 bg-neutral-950 text-neutral-100 shadow-2xl"
    >
      {/* Top Utility Row - Original filtering pills + Sort by */}
      <div className="flex items-center justify-between px-3 pt-3 text-xs font-medium">
        {/* Left side - Original filtering pills */}
        <div className="flex items-center gap-2">
          {sortingOptions.map((option) => {
            const IconComponent = option.icon;
            const isActive =
              option.name === "Pump"
                ? state.filters.isPumpSearch
                : option.name === "Bonk"
                  ? state.filters.isBonkSearch
                  : option.name === "OG Mode"
                    ? state.filters.isOg
                    : state.filters.onlyBonded;

            return (
              <button
                key={option.name}
                className={`flex cursor-pointer items-center gap-1 rounded border px-3 py-1 transition select-none ${getSortingButtonClasses(isActive, option.color)}`}
                onClick={() => {
                  if (option.name === "Pump") {
                    updateFilters({
                      isPumpSearch: !state.filters.isPumpSearch,
                    });
                  } else if (option.name === "Bonk") {
                    updateFilters({
                      isBonkSearch: !state.filters.isBonkSearch,
                    });
                  } else if (option.name === "OG Mode") {
                    updateFilters({ isOg: !state.filters.isOg });
                  } else if (option.name === "Graduated") {
                    updateFilters({ onlyBonded: !state.filters.onlyBonded });
                  }
                }}
              >
                <IconComponent className="h-3 w-3" />
                {option.name}
              </button>
            );
          })}
        </div>

        {/* Right side - Sort by options */}
        <div className="flex items-center gap-2">
          <span className="text-neutral-400">Sort by</span>
          {sortByOptions.map((option) => {
            const IconComponent = option.icon;
            const isActive = state.sortBy === option.key;

            return (
              <button
                key={option.key}
                className={`flex cursor-pointer items-center justify-center rounded border p-1.5 transition select-none ${
                  isActive
                    ? "border-blue-500/60 bg-blue-500/20 text-blue-300"
                    : "border-neutral-700 bg-neutral-800/50 text-neutral-300 hover:bg-neutral-700/40"
                }`}
                onClick={() => handleSortChange(option.key)}
                title={option.key.replace("_", " ").toUpperCase()}
              >
                <IconComponent className="size-3" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Search input */}
      <div className="relative border-b border-neutral-700 p-4">
        <input
          ref={inputRef}
          type="text"
          value={state.query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search by name, ticker, or CA…"
          className="text-regular placeholder:text-textTertiary text-textPrimary flex h-full w-full flex-row items-center justify-center gap-[8px] bg-transparent text-[20px] outline-none placeholder:text-[20px]"
        />
        <span className="absolute top-1/2 right-4 -translate-y-1/2 rounded bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-300">
          Esc
        </span>
      </div>

      {/* Results Section */}
      {showResults && (
        <div className="mb-6 flex-1 overflow-hidden p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm tracking-wider text-neutral-400">
              Results
            </span>
            {state.loading && (
              <span className="text-xs text-neutral-500">Loading…</span>
            )}
          </div>
          {state.results.length === 0 && !state.loading ? (
            <p className="text-sm text-neutral-500">No matches.</p>
          ) : (
            <ul className="scroll max-h-72 divide-y divide-neutral-800 overflow-y-auto pr-1">
              {state.results.map((t) => {
                const mc = formatSmartNumber(
                  t.total_fully_diluted_valuation || t.fully_diluted_value,
                );
                const vol = formatSmartNumber(
                  (t.total_buy_volume_24h || 0) +
                    (t.total_sell_volume_24h || 0),
                );
                const liq = formatSmartNumber(t.total_liquidity_usd || 0);
                return (
                  <li
                    key={t.mint}
                    className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 text-sm hover:bg-neutral-800"
                    onClick={() => handleSelectToken(t)}
                  >
                    {t.logo ? (
                      <img
                        src={t.logo}
                        alt={t.symbol}
                        className="h-8 w-8 rounded-full border border-neutral-700 object-contain"
                        onError={(e) =>
                          (e.currentTarget.style.display = "none")
                        }
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-700 bg-neutral-800">
                        <span className="text-sm font-bold text-neutral-400">
                          {t.symbol?.charAt(0) || "?"}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="block max-w-full truncate font-semibold text-neutral-100">
                        {t.symbol}{" "}
                        <span className="font-normal text-neutral-400">
                          {t.name}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs whitespace-nowrap">
                      <span className="text-neutral-400">
                        MC{" "}
                        <span className="font-bold text-blue-400">${mc}</span>
                      </span>
                      <span className="text-neutral-400">
                        V <span className="font-bold text-white">${vol}</span>
                      </span>
                      <span className="text-neutral-400">
                        L <span className="font-bold text-white">${liq}</span>
                      </span>
                      <FaBolt className="ml-2 text-emerald-400" />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* History Section */}
      {showHistory && (
        <div className="flex-1 overflow-hidden p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm tracking-wider text-neutral-400">
              History
            </span>
            {state.history.length > 0 && (
              <button
                onClick={handleClearHistory}
                title="Clear history"
                className="text-neutral-500 transition-colors hover:text-red-400"
              >
                <FaTrash size={14} />
              </button>
            )}
          </div>
          {state.history.length === 0 ? (
            <p className="text-sm text-neutral-500">No recent searches.</p>
          ) : (
            <ul className="scroll max-h-64 divide-y divide-neutral-800 overflow-y-auto pr-1">
              {state.history.map((h) => {
                const mc = formatSmartNumber(h.total_fully_diluted_valuation);
                const vol = formatSmartNumber(
                  (h.total_buy_volume_24h || 0) +
                    (h.total_sell_volume_24h || 0),
                );
                const liq = formatSmartNumber(h.total_liquidity_usd || 0);
                return (
                  <li
                    key={h.mint}
                    className="flex cursor-pointer items-center justify-between gap-4 rounded px-3 py-3 text-sm transition-colors hover:bg-neutral-800/30"
                    onClick={() => handleSubmit(h.mint)}
                  >
                    <div className="flex w-48 items-center gap-4">
                      {/* Avatar with border and overlay icon */}
                      <div className="relative flex-shrink-0">
                        {h.logo ? (
                          <img
                            src={h.logo}
                            alt={h.symbol}
                            className="h-14 w-14 rounded-lg border border-teal-400/40 object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-teal-400/40 bg-neutral-800">
                            <span className="text-sm font-bold text-neutral-400">
                              {h.symbol?.charAt(0) || "?"}
                            </span>
                          </div>
                        )}
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
                            {h.symbol} {h.name}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(h.mint);
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
                        handleSubmit(h.mint);
                      }}
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white transition-colors hover:bg-blue-600"
                      title="Select token"
                    >
                      <FaBolt className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </InterstatePopout>
  );
}
