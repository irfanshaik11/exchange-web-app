import React, { useMemo, useState, useCallback } from "react";
import { FiX } from "react-icons/fi";
import { FaFilter, FaCaretDown } from "react-icons/fa";
import { MdRefresh } from "react-icons/md";
import { LuChefHat } from "react-icons/lu";
import { TfiTarget } from "react-icons/tfi";
import { HiOutlineCubeTransparent } from "react-icons/hi2";
import { formatSmartNumber } from "~/utils/db";
import { useSolanaTokenWebSocketContext, type SolanaTopTrader } from "../../contexts/SolanaTokenWebSocketContext";
import useMonadTopTraders, {
  type MonadTopTrader,
} from "../../hooks/useMonadTopTraders";
import type { Token } from "~/utils/db";
import WalletHoverCard, { type WalletHoverCardData } from "./WalletHoverCard";
import { CiFilter } from "react-icons/ci";
import { SiSolana } from "react-icons/si";
import { safeLocalStorageSet } from "~/utils/cacheManager";
import { useSolPrice } from "../SolPriceContext";

interface CodexTopTradersProps {
  token: Token | null;
  pairAddress?: string; // Fallback pair address when token doesn't have mint
  chain?: "sol" | "monad"; // Chain to determine which endpoint to use
}

// Sort direction type
type SortDirection = "asc" | "desc" | null;

// Filter range type
interface FilterRange {
  min: string;
  max: string;
}

// Holder type tags available for filtering
type HolderTypeTag = "dev" | "sniper" | "bundler";

// Wallet filter state
interface WalletFilter {
  address: string;
  tags: HolderTypeTag[];
}

// Column filter state
interface ColumnFilters {
  bought: { sort: SortDirection; range: FilterRange };
  avgBuy: { sort: SortDirection; range: FilterRange };
  sold: { sort: SortDirection; range: FilterRange };
  avgSell: { sort: SortDirection; range: FilterRange };
  pnl: { sort: SortDirection; range: FilterRange };
  pnlPct: { sort: SortDirection; range: FilterRange };
  remaining: { sort: SortDirection; range: FilterRange };
  remainingPct: { sort: SortDirection; range: FilterRange };
  lastActive: { sort: SortDirection; range: FilterRange };
}

const AX = {
  bg: "#101114",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#E6E7EA",
  muted: "#9CA3AF",
  mint: "#70E0B0",
};

// Filter Popout Component
interface FilterPopoutProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  unit: string;
  range: FilterRange;
  onRangeChange: (range: FilterRange) => void;
  onReset: () => void;
  onApply: () => void;
  position: { top: number; left: number };
}

const FilterPopout: React.FC<FilterPopoutProps> = ({
  isOpen,
  onClose,
  title,
  unit,
  range,
  onRangeChange,
  onReset,
  onApply,
  position,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed z-50 rounded-lg border shadow-xl"
      style={{
        backgroundColor: AX.surface,
        borderColor: AX.border,
        top: position.top,
        left: position.left,
        minWidth: "280px",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: AX.text }}>
            {title}
          </span>
          <button
            onClick={onClose}
            className="hover:bg-opacity-20 rounded p-1"
            style={{ color: AX.muted }}
          >
            <FiX size={14} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <input
              type="text"
              inputMode="decimal"
              placeholder="Min"
              value={range.min}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "" || /^-?\d*\.?\d*$/.test(val)) {
                  onRangeChange({ ...range, min: val });
                }
              }}
              className="w-full rounded border px-3 py-2 text-sm"
              style={{
                backgroundColor: AX.surface2,
                borderColor: AX.border,
                color: AX.text,
                outline: "none",
              }}
            />
            <div
              className="mt-1 rounded px-2 py-1 text-center text-xs"
              style={{ backgroundColor: AX.surface2, color: AX.muted }}
            >
              {unit}
            </div>
          </div>
          <span className="text-sm" style={{ color: AX.muted }}>
            to
          </span>
          <div className="flex-1">
            <input
              type="text"
              inputMode="decimal"
              placeholder="Max"
              value={range.max}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "" || /^-?\d*\.?\d*$/.test(val)) {
                  onRangeChange({ ...range, max: val });
                }
              }}
              className="w-full rounded border px-3 py-2 text-sm"
              style={{
                backgroundColor: AX.surface2,
                borderColor: AX.border,
                color: AX.text,
                outline: "none",
              }}
            />
            <div
              className="mt-1 rounded px-2 py-1 text-center text-xs"
              style={{ backgroundColor: AX.surface2, color: AX.muted }}
            >
              {unit}
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={onReset}
            className="flex items-center gap-1 rounded px-3 py-1.5 text-sm transition-opacity hover:opacity-80"
            style={{ color: AX.muted }}
          >
            <MdRefresh size={14} />
            Reset
          </button>
          <button
            onClick={onApply}
            className="rounded px-4 py-1.5 text-sm font-medium transition-colors"
            style={{ backgroundColor: AX.text, color: AX.bg }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

// Sortable Header Component
interface SortableHeaderProps {
  label: string;
  sortDirection: SortDirection;
  onSort: () => void;
  hasFilter?: boolean;
  onFilterClick?: (e: React.MouseEvent) => void;
  isFilterActive?: boolean;
}

const SortableHeader: React.FC<SortableHeaderProps> = ({
  label,
  sortDirection,
  onSort,
  hasFilter = false,
  onFilterClick,
  isFilterActive = false,
}) => (
  <div className="flex items-center gap-0.5">
    <button
      onClick={onSort}
      className="flex cursor-pointer items-center gap-0.5 transition-opacity hover:opacity-80"
      style={{ color: sortDirection ? AX.mint : '#757e80' }}
    >
      <span className="text-[12px] font-normal">{label}</span>
      <FaCaretDown
        size={8}
        style={{
          transform:
            sortDirection === "asc" ? "rotate(180deg)" : "rotate(0deg)",
          opacity: sortDirection ? 1 : 0.5,
        }}
      />
    </button>
    {hasFilter && (
      <button
        onClick={onFilterClick}
        className="hover:bg-opacity-20 rounded p-0.5 transition-colors"
        style={{ color: isFilterActive ? AX.mint : '#757e80' }}
      >
        <CiFilter size={14} />
      </button>
    )}
  </div>
);

// Wallet Filter Popout Component
interface WalletFilterPopoutProps {
  isOpen: boolean;
  onClose: () => void;
  filter: WalletFilter;
  onFilterChange: (filter: WalletFilter) => void;
  onReset: () => void;
  onApply: () => void;
  position: { top: number; left: number };
}

const WalletFilterPopout: React.FC<WalletFilterPopoutProps> = ({
  isOpen,
  onClose,
  filter,
  onFilterChange,
  onReset,
  onApply,
  position,
}) => {
  if (!isOpen) return null;

  const tagOptions: {
    value: HolderTypeTag;
    label: string;
    color: string;
    icon: React.ReactNode;
  }[] = [
    {
      value: "dev",
      label: "DEV",
      color: "#facc15",
      icon: <LuChefHat size={12} className="text-yellow-400" />,
    },
    {
      value: "sniper",
      label: "Sniper",
      color: "#f87171",
      icon: <TfiTarget size={12} className="text-red-400" />,
    },
    {
      value: "bundler",
      label: "Bundler",
      color: "#fb923c",
      icon: <HiOutlineCubeTransparent size={12} className="text-orange-400" />,
    },
  ];

  const handleTagToggle = (tag: HolderTypeTag) => {
    const newTags = filter.tags.includes(tag)
      ? filter.tags.filter((t) => t !== tag)
      : [...filter.tags, tag];
    onFilterChange({ ...filter, tags: newTags });
  };

  return (
    <div
      className="fixed z-50 rounded-lg border shadow-xl"
      style={{
        backgroundColor: AX.surface,
        borderColor: AX.border,
        top: position.top,
        left: position.left,
        minWidth: "280px",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-4">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: AX.text }}>
            Filter Wallet
          </span>
          <button
            onClick={onClose}
            className="hover:bg-opacity-20 rounded p-1"
            style={{ color: AX.muted }}
          >
            <FiX size={14} />
          </button>
        </div>

        {/* Wallet Address Filter */}
        <div className="mb-4">
          <label className="mb-1.5 block text-xs" style={{ color: AX.muted }}>
            Wallet Address
          </label>
          <input
            type="text"
            placeholder="Enter wallet address..."
            value={filter.address}
            onChange={(e) =>
              onFilterChange({ ...filter, address: e.target.value })
            }
            className="w-full rounded border px-3 py-2 text-sm"
            style={{
              backgroundColor: AX.surface2,
              borderColor: AX.border,
              color: AX.text,
              outline: "none",
            }}
          />
        </div>

        {/* Tag Filters */}
        <div className="mb-4">
          <label className="mb-1.5 block text-xs" style={{ color: AX.muted }}>
            Filter by Tag
          </label>
          <div className="flex flex-wrap gap-2">
            {tagOptions.map((opt) => {
              const isSelected = filter.tags.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => handleTagToggle(opt.value)}
                  className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: isSelected
                      ? `${opt.color}20`
                      : AX.surface2,
                    border: `1px solid ${isSelected ? opt.color : AX.border}`,
                    color: isSelected ? opt.color : AX.muted,
                  }}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={onReset}
            className="flex items-center gap-1 rounded px-3 py-1.5 text-sm transition-opacity hover:opacity-80"
            style={{ color: AX.muted }}
          >
            <MdRefresh size={14} />
            Reset
          </button>
          <button
            onClick={onApply}
            className="rounded px-4 py-1.5 text-sm font-medium transition-colors"
            style={{ backgroundColor: AX.text, color: AX.bg }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

function getAge(timestamp: number) {
  const now = Date.now() / 1000;
  const diffSeconds = Math.floor(now - timestamp);
  const diffMins = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffSeconds / 3600);
  const diffDays = Math.floor(diffSeconds / 86400);

  if (diffSeconds < 0) return "0s";
  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  if (diffMins > 0) return `${diffMins}m`;
  return `${diffSeconds}s`;
}

function shortAddr(addr: string) {
  if (!addr) return "";
  return addr.slice(0, 4) + "..." + addr.slice(-4);
}

function formatVolume(volumeUsd: string) {
  const volume = parseFloat(volumeUsd);
  if (volume >= 1000000) {
    return `${(volume / 1000000).toFixed(1)}M`;
  } else if (volume >= 1000) {
    return `${(volume / 1000).toFixed(1)}K`;
  }
  return volume.toFixed(0);
}

function formatPrice(amountUsd: string, tokenAmount: string) {
  const usd = parseFloat(amountUsd);
  const tokens = parseFloat(tokenAmount);
  if (tokens === 0) return "$0";

  const price = usd / tokens;
  if (price >= 1000) {
    return `$${(price / 1000).toFixed(1)}K`;
  }
  if (price > 0 && price < 0.01) {
    return `$${formatSmartNumber(price)}`;
  }
  return `$${price.toFixed(2)}`;
}

const CodexTopTraders: React.FC<CodexTopTradersProps> = ({
  token,
  pairAddress,
  chain = "sol",
}) => {
  // Client-side localStorage cache for top traders (persists across page reloads)
  const CACHE_KEY_PREFIX = "codex_top_traders_cache_";
  const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes cache expiry

  const getCacheKey = (mint: string) => {
    return `${CACHE_KEY_PREFIX}${mint}`;
  };

  // Filter states
  const initialFilters: ColumnFilters = {
    bought: { sort: null, range: { min: "", max: "" } },
    avgBuy: { sort: null, range: { min: "", max: "" } },
    sold: { sort: null, range: { min: "", max: "" } },
    avgSell: { sort: null, range: { min: "", max: "" } },
    pnl: { sort: null, range: { min: "", max: "" } },
    pnlPct: { sort: null, range: { min: "", max: "" } },
    remaining: { sort: null, range: { min: "", max: "" } },
    remainingPct: { sort: null, range: { min: "", max: "" } },
    lastActive: { sort: null, range: { min: "", max: "" } },
  };
  const [filters, setFilters] = useState<ColumnFilters>(initialFilters);
  const [activeFilterPopout, setActiveFilterPopout] = useState<
    keyof ColumnFilters | null
  >(null);
  const [filterPopoutPosition, setFilterPopoutPosition] = useState({
    top: 0,
    left: 0,
  });
  const [tempFilterRange, setTempFilterRange] = useState<FilterRange>({
    min: "",
    max: "",
  });

  // Wallet filter state
  const [walletFilter, setWalletFilter] = useState<WalletFilter>({
    address: "",
    tags: [],
  });
  const [walletFilterPopoutOpen, setWalletFilterPopoutOpen] = useState(false);
  const [tempWalletFilter, setTempWalletFilter] = useState<WalletFilter>({
    address: "",
    tags: [],
  });

  // Handle sort toggle
  const handleSort = useCallback((column: keyof ColumnFilters) => {
    setFilters((prev) => {
      const currentSort = prev[column].sort;
      const newSort: SortDirection =
        currentSort === null ? "desc" : currentSort === "desc" ? "asc" : null;
      // Reset other sorts
      const newFilters = { ...initialFilters };
      Object.keys(newFilters).forEach((key) => {
        newFilters[key as keyof ColumnFilters] = {
          ...prev[key as keyof ColumnFilters],
          sort: null,
        };
      });
      newFilters[column] = { ...prev[column], sort: newSort };
      return newFilters;
    });
  }, []);

  // Handle filter popout open
  const handleFilterClick = useCallback(
    (column: keyof ColumnFilters, e: React.MouseEvent) => {
      e.stopPropagation();
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setFilterPopoutPosition({
        top: rect.bottom + 8,
        left: Math.max(8, rect.left - 100),
      });
      setTempFilterRange(filters[column].range);
      setActiveFilterPopout(activeFilterPopout === column ? null : column);
    },
    [activeFilterPopout, filters],
  );

  // Handle filter apply
  const handleFilterApply = useCallback(() => {
    if (activeFilterPopout) {
      setFilters((prev) => ({
        ...prev,
        [activeFilterPopout]: {
          ...prev[activeFilterPopout],
          range: tempFilterRange,
        },
      }));
      setActiveFilterPopout(null);
    }
  }, [activeFilterPopout, tempFilterRange]);

  // Handle filter reset
  const handleFilterReset = useCallback(() => {
    setTempFilterRange({ min: "", max: "" });
  }, []);

  // Handle wallet filter popout open
  const handleWalletFilterClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setFilterPopoutPosition({
        top: rect.bottom + 8,
        left: Math.max(8, rect.left - 100),
      });
      setTempWalletFilter(walletFilter);
      setWalletFilterPopoutOpen((prev) => !prev);
    },
    [walletFilter],
  );

  // Handle wallet filter apply
  const handleWalletFilterApply = useCallback(() => {
    setWalletFilter(tempWalletFilter);
    setWalletFilterPopoutOpen(false);
  }, [tempWalletFilter]);

  // Handle wallet filter reset
  const handleWalletFilterReset = useCallback(() => {
    setTempWalletFilter({ address: "", tags: [] });
  }, []);

  // Check if wallet filter is active
  const isWalletFilterActive =
    walletFilter.address !== "" || walletFilter.tags.length > 0;

  // Load cached traders from localStorage on mount
  const [cachedTradersFromStorage, setCachedTradersFromStorage] =
    React.useState<any[]>(() => {
      if (!token?.mint || typeof window === "undefined") return [];

      try {
        const cacheKey = getCacheKey(token.mint);
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          const now = Date.now();
          if (parsed.timestamp && now - parsed.timestamp < CACHE_EXPIRY_MS) {
            return parsed.traders || [];
          } else {
            localStorage.removeItem(cacheKey);
          }
        }
      } catch (error) {
        console.error("[CodexTopTraders] Error loading cache:", error);
      }
      return [];
    });

  // Reload cache when mint changes
  React.useEffect(() => {
    if (!token?.mint || typeof window === "undefined") {
      setCachedTradersFromStorage([]);
      return;
    }

    try {
      const cacheKey = getCacheKey(token.mint);
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const now = Date.now();
        if (parsed.timestamp && now - parsed.timestamp < CACHE_EXPIRY_MS) {
          setCachedTradersFromStorage(parsed.traders || []);
        } else {
          localStorage.removeItem(cacheKey);
          setCachedTradersFromStorage([]);
        }
      } else {
        setCachedTradersFromStorage([]);
      }
    } catch (error) {
      console.error("[CodexTopTraders] Error reloading cache:", error);
      setCachedTradersFromStorage([]);
    }
  }, [token?.mint]);

  // Save traders to localStorage cache (capped at 50 entries)
  const saveToCache = React.useCallback((traders: any[], mint: string) => {
    if (!mint || typeof window === "undefined" || traders.length === 0) return;

    const cacheKey = getCacheKey(mint);
    const cacheData = {
      traders: traders.slice(0, 50),
      timestamp: Date.now(),
      mint,
    };
    safeLocalStorageSet(cacheKey, JSON.stringify(cacheData));
  }, []);

  // Use mint if available, fallback to pair_address, then fallback to pairAddress prop
  const mintForWebSocket = token?.mint || token?.pair_address || pairAddress;

  // Only show skeleton if we have absolutely no address to work with
  const shouldShowSkeleton = !mintForWebSocket;

  // Debug logging
  console.log("[CodexTopTraders] Debug:", {
    hasToken: !!token,
    tokenMint: token?.mint,
    tokenPairAddress: token?.pair_address,
    propPairAddress: pairAddress,
    mintForWebSocket,
    shouldShowSkeleton,
    chain,
  });

  // Use shared WebSocket context for Solana chain (eliminates duplicate connections)
  // Context is provided by parent [id].tsx with SolanaTokenWebSocketProvider
  const wsContext = useSolanaTokenWebSocketContext();
  const wsTopTraders = chain === "sol" ? wsContext.topTraders : [];
  const solanaHolders = chain === "sol" ? wsContext.holders : [];
  const wsLoading = chain === "sol" ? wsContext.loading : false;
  const wsError = chain === "sol" ? wsContext.error : null;

  const { solPrice, monPrice } = useSolPrice();
  const chainPrice = chain === "monad" ? monPrice : solPrice;
  const liveTokenPriceUsd = chain === "sol"
    ? (wsContext.tokenInfo?.price_usd || (token as any)?.usd_price || (token as any)?.price_usd || 0)
    : 0;

  // Create a lookup map of wallet addresses to holder data for hover cards
  const walletDataMap = useMemo(() => {
    const map = new Map<string, WalletHoverCardData>();
    if (chain === "sol") {
      // First, populate with holder data
      if (solanaHolders) {
        for (const holder of solanaHolders) {
          if (holder.wallet_address) {
            const key = holder.wallet_address.toLowerCase();
            map.set(key, {
              walletAddress: holder.wallet_address,
              totalBoughtSol: holder.total_bought_sol,
              buyCount: holder.buy_count,
              avgBuyPrice: holder.avg_buy_price,
              totalSoldSol: holder.total_sold_sol,
              sellCount: holder.sell_count,
              avgSellPrice: holder.avg_sell_price,
              remainingTokens: holder.remaining_tokens,
              solBalance: holder.sol_balance_lamports
                ? holder.sol_balance_lamports / 1e9
                : undefined,
              firstBuyAt: holder.first_buy_at,
              lastActivityAt: holder.last_activity_at,
              holderType: holder.holder_type,
            });
          }
        }
      }
      // Merge with top traders data (for PnL info)
      if (wsTopTraders) {
        for (const trader of wsTopTraders) {
          if (trader.wallet_address) {
            const key = trader.wallet_address.toLowerCase();
            const existing = map.get(key);
            if (existing) {
              existing.realizedPnl = trader.realized_pnl;
              existing.remainingPercent = trader.remaining_percent;
            } else {
              map.set(key, {
                walletAddress: trader.wallet_address,
                totalBoughtSol: trader.total_bought_sol,
                buyCount: trader.buy_count,
                avgBuyPrice: trader.avg_buy_price,
                totalSoldSol: trader.total_sold_sol,
                sellCount: trader.sell_count,
                avgSellPrice: trader.avg_sell_price,
                realizedPnl: trader.realized_pnl,
                remainingTokens: trader.remaining_tokens,
                remainingPercent: trader.remaining_percent,
                lastActivityAt: trader.last_activity_at,
              });
            }
          }
        }
      }
    }
    return map;
  }, [chain, solanaHolders, wsTopTraders]);

  // Simple holder type lookup for icons (backwards compatible)
  const holderTypeMap = useMemo(() => {
    const map = new Map<string, "dev" | "sniper" | "bundler" | "holder">();
    walletDataMap.forEach((data, key) => {
      if (data.holderType) {
        map.set(key, data.holderType);
      }
    });
    return map;
  }, [walletDataMap]);

  // Use Monad hook for top traders (Monad chain)
  const {
    traders: monadTopTraders,
    isLoading: monadLoading,
    error: monadError,
  } = useMonadTopTraders(mintForWebSocket, {
    enabled: chain === "monad" && !!mintForWebSocket,
  });

  // Normalize Solana WebSocket top traders to common format
  const normalizedSolanaTraders = useMemo(() => {
    if (!wsTopTraders || wsTopTraders.length === 0) return [];

    return wsTopTraders.map((t: SolanaTopTrader) => ({
      walletAddress: t.wallet_address,
      amountBoughtUsd: String(t.total_bought_sol * chainPrice),
      amountSoldUsd: String(t.total_sold_sol * chainPrice),
      volumeUsd: String((t.total_bought_sol + t.total_sold_sol) * chainPrice),
      realizedProfitUsd: String(t.realized_pnl * chainPrice),
      realizedProfitPercentage:
        t.realized_pnl > 0 && t.total_bought_sol > 0
          ? t.realized_pnl / t.total_bought_sol
          : 0,
      tokenBalance: String(t.remaining_tokens),
      lastTransactionAt: t.last_activity_at
        ? Math.floor(new Date(t.last_activity_at).getTime() / 1000)
        : 0,
      tokenAmountBought: String(t.total_bought_tokens),
      tokenAmountSold: String(t.total_sold_tokens),
      buys: t.buy_count,
      sells: t.sell_count,
      remainingPercent: t.total_bought_tokens > 0 ? (Math.max(0, t.remaining_tokens) / t.total_bought_tokens) * 100 : 0,
      remainingValueUsd: Math.max(0, t.remaining_tokens) * liveTokenPriceUsd,
    }));
  }, [wsTopTraders, chainPrice, liveTokenPriceUsd]);

  // Normalize Monad top traders to common format
  const normalizedMonadTraders = useMemo(() => {
    if (!monadTopTraders || monadTopTraders.length === 0) return [];

    return monadTopTraders.map((t: MonadTopTrader) => ({
      walletAddress: t.wallet_address,
      amountBoughtUsd: String(t.total_bought_usd || 0),
      amountSoldUsd: String(t.total_sold_usd || 0),
      volumeUsd: String((t.total_bought_usd || 0) + (t.total_sold_usd || 0)),
      realizedProfitUsd: String(t.realized_pnl_usd || 0),
      realizedProfitPercentage: t.realized_pnl_percent || 0,
      tokenBalance: String(t.tokens_remaining || 0),
      lastTransactionAt: t.last_trade_at || 0,
      tokenAmountBought: String(t.tokens_bought || 0),
      tokenAmountSold: String(t.tokens_sold || 0),
      buys: t.buy_count || 0,
      sells: t.sell_count || 0,
      remainingPercent:
        t.tokens_remaining > 0 && t.tokens_bought > 0
          ? (t.tokens_remaining / t.tokens_bought) * 100
          : 0,
      remainingValueUsd: 0, // Monad doesn't have live token price from WS yet
    }));
  }, [monadTopTraders]);

  // Select the appropriate data based on chain
  const traders =
    chain === "sol" ? normalizedSolanaTraders : normalizedMonadTraders;
  const isLoading = chain === "sol" ? wsLoading : monadLoading;
  const error = chain === "sol" ? wsError : monadError;

  // Use cached traders if available, otherwise use fetched traders
  // Apply filtering and sorting
  const displayTraders = React.useMemo(() => {
    let result = traders.length > 0 ? traders : cachedTradersFromStorage;

    // Apply range filters
    result = result.filter((trader) => {
      const boughtUsd = parseFloat(trader.amountBoughtUsd);
      const soldUsd = parseFloat(trader.amountSoldUsd);
      const tokensBought = parseFloat(trader.tokenAmountBought);
      const tokensSold = parseFloat(trader.tokenAmountSold);
      const avgBuy = tokensBought > 0 ? boughtUsd / tokensBought : 0;
      const avgSell = tokensSold > 0 ? soldUsd / tokensSold : 0;
      const remaining = trader.remainingValueUsd ?? 0;
      const pnl = (soldUsd + remaining) - boughtUsd;
      const pnlPct = boughtUsd > 0 ? (pnl / boughtUsd) * 100 : 0;
      const remainingPct = trader.remainingPercent || 0;
      // Calculate hours since last activity
      const lastActiveHours =
        trader.lastTransactionAt > 0
          ? (Date.now() / 1000 - trader.lastTransactionAt) / 3600
          : Infinity;

      // Check each filter
      if (
        filters.bought.range.min &&
        boughtUsd < parseFloat(filters.bought.range.min)
      )
        return false;
      if (
        filters.bought.range.max &&
        boughtUsd > parseFloat(filters.bought.range.max)
      )
        return false;
      if (
        filters.avgBuy.range.min &&
        avgBuy < parseFloat(filters.avgBuy.range.min)
      )
        return false;
      if (
        filters.avgBuy.range.max &&
        avgBuy > parseFloat(filters.avgBuy.range.max)
      )
        return false;
      if (
        filters.sold.range.min &&
        soldUsd < parseFloat(filters.sold.range.min)
      )
        return false;
      if (
        filters.sold.range.max &&
        soldUsd > parseFloat(filters.sold.range.max)
      )
        return false;
      if (
        filters.avgSell.range.min &&
        avgSell < parseFloat(filters.avgSell.range.min)
      )
        return false;
      if (
        filters.avgSell.range.max &&
        avgSell > parseFloat(filters.avgSell.range.max)
      )
        return false;
      if (filters.pnl.range.min && pnl < parseFloat(filters.pnl.range.min))
        return false;
      if (filters.pnl.range.max && pnl > parseFloat(filters.pnl.range.max))
        return false;
      if (
        filters.pnlPct.range.min &&
        pnlPct < parseFloat(filters.pnlPct.range.min)
      )
        return false;
      if (
        filters.pnlPct.range.max &&
        pnlPct > parseFloat(filters.pnlPct.range.max)
      )
        return false;
      if (
        filters.remaining.range.min &&
        remaining < parseFloat(filters.remaining.range.min)
      )
        return false;
      if (
        filters.remaining.range.max &&
        remaining > parseFloat(filters.remaining.range.max)
      )
        return false;
      if (
        filters.remainingPct.range.min &&
        remainingPct < parseFloat(filters.remainingPct.range.min)
      )
        return false;
      if (
        filters.remainingPct.range.max &&
        remainingPct > parseFloat(filters.remainingPct.range.max)
      )
        return false;
      if (
        filters.lastActive.range.min &&
        lastActiveHours < parseFloat(filters.lastActive.range.min)
      )
        return false;
      if (
        filters.lastActive.range.max &&
        lastActiveHours > parseFloat(filters.lastActive.range.max)
      )
        return false;

      return true;
    });

    // Apply wallet filter
    const hasWalletAddressFilter = walletFilter.address.trim() !== "";
    const hasTagFilter = walletFilter.tags.length > 0;

    if (hasWalletAddressFilter || hasTagFilter) {
      result = result.filter((trader) => {
        const traderAddress = (trader.walletAddress || "").toLowerCase().trim();

        // Filter by wallet address (case-insensitive contains match)
        if (hasWalletAddressFilter) {
          const searchAddress = walletFilter.address.toLowerCase().trim();
          if (!traderAddress.includes(searchAddress)) return false;
        }

        // Filter by holder type tags
        if (hasTagFilter) {
          const holderType = holderTypeMap.get(traderAddress);
          // Only show traders that have one of the selected tags
          if (
            !holderType ||
            !walletFilter.tags.includes(holderType as HolderTypeTag)
          )
            return false;
        }

        return true;
      });
    }

    // Apply sorting
    const sortColumn = Object.keys(filters).find(
      (key) => filters[key as keyof ColumnFilters].sort !== null,
    ) as keyof ColumnFilters | undefined;
    if (sortColumn) {
      const sortDir = filters[sortColumn].sort;
      result = [...result].sort((a, b) => {
        let aVal = 0,
          bVal = 0;
        const aTokensBought = parseFloat(a.tokenAmountBought);
        const bTokensBought = parseFloat(b.tokenAmountBought);
        const aTokensSold = parseFloat(a.tokenAmountSold);
        const bTokensSold = parseFloat(b.tokenAmountSold);

        switch (sortColumn) {
          case "bought":
            aVal = parseFloat(a.amountBoughtUsd);
            bVal = parseFloat(b.amountBoughtUsd);
            break;
          case "avgBuy":
            aVal =
              aTokensBought > 0
                ? parseFloat(a.amountBoughtUsd) / aTokensBought
                : 0;
            bVal =
              bTokensBought > 0
                ? parseFloat(b.amountBoughtUsd) / bTokensBought
                : 0;
            break;
          case "sold":
            aVal = parseFloat(a.amountSoldUsd);
            bVal = parseFloat(b.amountSoldUsd);
            break;
          case "avgSell":
            aVal =
              aTokensSold > 0 ? parseFloat(a.amountSoldUsd) / aTokensSold : 0;
            bVal =
              bTokensSold > 0 ? parseFloat(b.amountSoldUsd) / bTokensSold : 0;
            break;
          case "pnl": {
            const aSold = parseFloat(a.amountSoldUsd);
            const bSold = parseFloat(b.amountSoldUsd);
            aVal = (aSold + (a.remainingValueUsd ?? 0)) - parseFloat(a.amountBoughtUsd);
            bVal = (bSold + (b.remainingValueUsd ?? 0)) - parseFloat(b.amountBoughtUsd);
            break;
          }
          case "pnlPct": {
            const aBoughtP = parseFloat(a.amountBoughtUsd);
            const bBoughtP = parseFloat(b.amountBoughtUsd);
            const aPnl = (parseFloat(a.amountSoldUsd) + (a.remainingValueUsd ?? 0)) - aBoughtP;
            const bPnl = (parseFloat(b.amountSoldUsd) + (b.remainingValueUsd ?? 0)) - bBoughtP;
            aVal = aBoughtP > 0 ? (aPnl / aBoughtP) * 100 : 0;
            bVal = bBoughtP > 0 ? (bPnl / bBoughtP) * 100 : 0;
            break;
          }
          case "remaining":
            aVal = a.remainingValueUsd ?? 0;
            bVal = b.remainingValueUsd ?? 0;
            break;
          case "remainingPct":
            aVal = a.remainingPercent || 0;
            bVal = b.remainingPercent || 0;
            break;
          case "lastActive":
            aVal = a.lastTransactionAt || 0;
            bVal = b.lastTransactionAt || 0;
            break;
        }
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      });
    }

    return result;
  }, [traders, cachedTradersFromStorage, filters, walletFilter, holderTypeMap]);

  // Save to cache when traders update
  React.useEffect(() => {
    if (token?.mint && traders.length > 0) {
      saveToCache(traders, token.mint);
    }
  }, [traders, token?.mint, saveToCache]);

  // Only show loading if we don't have any traders at all (not even cached ones)
  const showLoading =
    isLoading &&
    displayTraders.length === 0 &&
    cachedTradersFromStorage.length === 0;

  // Get explorer URL based on chain
  const getExplorerUrl = (address: string) => {
    return chain === "monad"
      ? `https://testnet.monadexplorer.com/address/${address}`
      : `https://solscan.io/account/${address}`;
  };

  // Only show skeleton if we have absolutely no token data (not even optimistic)
  if (shouldShowSkeleton) {
    return (
      <div className="min-h-0 flex-1 p-4">
        <div className="animate-pulse">
          <div className="mb-4 h-6 w-32 rounded bg-neutral-700" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 rounded bg-neutral-700" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Get filter title and unit for popout
  const getFilterConfig = (
    column: keyof ColumnFilters,
  ): { title: string; unit: string } => {
    const configs: Record<
      keyof ColumnFilters,
      { title: string; unit: string }
    > = {
      bought: { title: "Bought Amount", unit: "USD" },
      avgBuy: { title: "Average Buy Price", unit: "USD" },
      sold: { title: "Sold Amount", unit: "USD" },
      avgSell: { title: "Average Sell Price", unit: "USD" },
      pnl: { title: "PnL Amount", unit: "USD" },
      pnlPct: { title: "PnL Percentage", unit: "%" },
      remaining: { title: "Remaining Value", unit: "USD" },
      remainingPct: { title: "Remaining Percentage", unit: "%" },
      lastActive: { title: "Last Active", unit: "Hours" },
    };
    return configs[column];
  };

  return (
    <div
      className="flex h-full w-full flex-col"
      style={{ backgroundColor: "#101114" }}
    >
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-900/20 p-2">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Filter Popout */}
      {activeFilterPopout && (
        <FilterPopout
          isOpen={true}
          onClose={() => setActiveFilterPopout(null)}
          title={getFilterConfig(activeFilterPopout).title}
          unit={getFilterConfig(activeFilterPopout).unit}
          range={tempFilterRange}
          onRangeChange={setTempFilterRange}
          onReset={handleFilterReset}
          onApply={handleFilterApply}
          position={filterPopoutPosition}
        />
      )}

      {/* Wallet Filter Popout */}
      <WalletFilterPopout
        isOpen={walletFilterPopoutOpen}
        onClose={() => setWalletFilterPopoutOpen(false)}
        filter={tempWalletFilter}
        onFilterChange={setTempWalletFilter}
        onReset={handleWalletFilterReset}
        onApply={handleWalletFilterApply}
        position={filterPopoutPosition}
      />

      <div className="min-h-0 flex-1 overflow-y-auto pb-18">
        <table className="!font-geist w-full">
          <thead
            className="sticky top-0 z-10 !text-xs"
            style={{ backgroundColor: "#101114" }}
          >
            <tr className="border-t border-b border-[#27282e]">
              <th
                className="px-4 py-3 text-left text-xs font-medium whitespace-nowrap text-[#757e80]"
              >
                <div className="flex items-center gap-1">
                  <span className="text-xs">Wallet</span>
                  <button
                    onClick={handleWalletFilterClick}
                    className="hover:bg-opacity-20 rounded p-0.5 transition-colors"
                    style={{ color: isWalletFilterActive ? AX.mint : AX.muted }}
                  >
                    <CiFilter size={14} />
                  </button>
                  {isWalletFilterActive && (
                    <span
                      className="rounded px-1 text-[9px]"
                      style={{
                        backgroundColor: `${AX.mint}20`,
                        color: AX.mint,
                      }}
                    >
                      {walletFilter.tags.length > 0
                        ? walletFilter.tags.length
                        : ""}
                      {walletFilter.address ? "🔍" : ""}
                    </span>
                  )}
                </div>
              </th>
              <th className="px-2 py-3 text-left whitespace-nowrap text-[#757e80]">
                <div className="flex items-center gap-1">
                  <SortableHeader
                    label="Bought"
                    sortDirection={filters.bought.sort}
                    onSort={() => handleSort("bought")}
                    hasFilter
                    onFilterClick={(e) => handleFilterClick("bought", e)}
                    isFilterActive={
                      !!filters.bought.range.min || !!filters.bought.range.max
                    }
                  />
                  <span className="text-xs text-[#757e80]">
                    /
                  </span>
                  <SortableHeader
                    label="Avg Buy"
                    sortDirection={filters.avgBuy.sort}
                    onSort={() => handleSort("avgBuy")}
                    hasFilter
                    onFilterClick={(e) => handleFilterClick("avgBuy", e)}
                    isFilterActive={
                      !!filters.avgBuy.range.min || !!filters.avgBuy.range.max
                    }
                  />
                </div>
              </th>
              <th className="px-2 py-3 text-left whitespace-nowrap text-[#757e80]">
                <div className="flex items-center gap-1">
                  <SortableHeader
                    label="Sold"
                    sortDirection={filters.sold.sort}
                    onSort={() => handleSort("sold")}
                    hasFilter
                    onFilterClick={(e) => handleFilterClick("sold", e)}
                    isFilterActive={
                      !!filters.sold.range.min || !!filters.sold.range.max
                    }
                  />
                  <span className="text-xs text-[#757e80]">
                    /
                  </span>
                  <SortableHeader
                    label="Avg Sell"
                    sortDirection={filters.avgSell.sort}
                    onSort={() => handleSort("avgSell")}
                    hasFilter
                    onFilterClick={(e) => handleFilterClick("avgSell", e)}
                    isFilterActive={
                      !!filters.avgSell.range.min || !!filters.avgSell.range.max
                    }
                  />
                </div>
              </th>
              <th className="px-2 py-3 text-left whitespace-nowrap text-[#757e80]">
                <div className="flex items-center gap-1">
                  <SortableHeader
                    label="PnL"
                    sortDirection={filters.pnl.sort}
                    onSort={() => handleSort("pnl")}
                    hasFilter
                    onFilterClick={(e) => handleFilterClick("pnl", e)}
                    isFilterActive={
                      !!filters.pnl.range.min || !!filters.pnl.range.max
                    }
                  />
                  <span className="text-xs text-[#757e80]">
                    /
                  </span>
                  <SortableHeader
                    label="%"
                    sortDirection={filters.pnlPct.sort}
                    onSort={() => handleSort("pnlPct")}
                    hasFilter
                    onFilterClick={(e) => handleFilterClick("pnlPct", e)}
                    isFilterActive={
                      !!filters.pnlPct.range.min || !!filters.pnlPct.range.max
                    }
                  />
                </div>
              </th>
              <th className="px-2 py-3 text-left whitespace-nowrap text-[#757e80]">
                <div className="flex items-center gap-1">
                  <SortableHeader
                    label="Remaining"
                    sortDirection={filters.remaining.sort}
                    onSort={() => handleSort("remaining")}
                    hasFilter
                    onFilterClick={(e) => handleFilterClick("remaining", e)}
                    isFilterActive={
                      !!filters.remaining.range.min ||
                      !!filters.remaining.range.max
                    }
                  />
                  <span className="text-xs text-[#757e80]">
                    /
                  </span>
                  <SortableHeader
                    label="%"
                    sortDirection={filters.remainingPct.sort}
                    onSort={() => handleSort("remainingPct")}
                    hasFilter
                    onFilterClick={(e) => handleFilterClick("remainingPct", e)}
                    isFilterActive={
                      !!filters.remainingPct.range.min ||
                      !!filters.remainingPct.range.max
                    }
                  />
                </div>
              </th>
              <th className="px-2 py-3 text-left whitespace-nowrap">
                <SortableHeader
                  label="Last Active"
                  sortDirection={filters.lastActive.sort}
                  onSort={() => handleSort("lastActive")}
                  hasFilter
                  onFilterClick={(e) => handleFilterClick("lastActive", e)}
                  isFilterActive={
                    !!filters.lastActive.range.min ||
                    !!filters.lastActive.range.max
                  }
                />
              </th>
            </tr>
          </thead>
          <tbody className='!text-[13px]'>
            {showLoading ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-neutral-500">
                  Loading top traders...
                </td>
              </tr>
            ) : !displayTraders || displayTraders.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-neutral-500">
                  No top traders found.
                </td>
              </tr>
            ) : (
              displayTraders.map((trader, idx) => {
                const boughtUsd = parseFloat(trader.amountBoughtUsd);
                const soldUsd = parseFloat(trader.amountSoldUsd);
                const remainingValueUsd = trader.remainingValueUsd || 0;
                const totalPnlUsd = (soldUsd + remainingValueUsd) - boughtUsd;
                const totalPnlPct = boughtUsd > 0 ? (totalPnlUsd / boughtUsd) * 100 : 0;
                const totalPnlSol = chainPrice > 0 ? totalPnlUsd / chainPrice : 0;
                const lastActive = getAge(trader.lastTransactionAt);
                const wallet = shortAddr(trader.walletAddress);

                // Calculate average buy/sell prices
                const avgBuyPrice = formatPrice(
                  trader.amountBoughtUsd,
                  trader.tokenAmountBought,
                );
                const avgSellPrice = formatPrice(
                  trader.amountSoldUsd,
                  trader.tokenAmountSold,
                );

                return (
                  <tr
                    key={trader.walletAddress}
                    className="transition-colors hover:brightness-110"
                    style={{
                      backgroundColor: idx % 2 === 0 ? "#101114" : "#161719",
                    }}
                  >
                    <td className="px-4 py-3 font-normal">
                      <div className="flex items-center gap-1.5">
                        <a
                          href={`https://solscan.io/account/${trader.walletAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full bg-[#757E80] p-1"
                        >
                          <SiSolana
                            size={8}
                            className="flex-shrink-0 text-black"
                          />
                        </a>

                        {(() => {
                          const walletKey = (
                            trader.walletAddress || ""
                          ).toLowerCase();
                          const walletData = walletDataMap.get(walletKey);
                          const holderType = holderTypeMap.get(walletKey);

                          // Build hover card data - use existing data or create from trader info
                          const hoverData: WalletHoverCardData = walletData || {
                            walletAddress: trader.walletAddress,
                            totalBoughtUsd: parseFloat(trader.amountBoughtUsd),
                            buyCount: trader.buys,
                            totalSoldUsd: parseFloat(trader.amountSoldUsd),
                            sellCount: trader.sells,
                            realizedPnlUsd: parseFloat(
                              trader.realizedProfitUsd,
                            ),
                            remainingTokens: parseFloat(trader.tokenBalance),
                            remainingPercent: trader.remainingPercent,
                            holderType: holderType,
                          };

                          return (
                            <WalletHoverCard data={hoverData} chain={chain} solPrice={chainPrice}>
                              <div className="flex items-center gap-1.5">
                                <span className="font-normal cursor-pointer text-[#86d99f] transition-colors hover:text-[#86d99f]">
                                  {wallet}
                                </span>
                                {/* Holder type icons */}
                                {holderType === "dev" && (
                                  <LuChefHat
                                    size={12}
                                    className="flex-shrink-0 text-yellow-400"
                                  />
                                )}
                                {holderType === "sniper" && (
                                  <TfiTarget
                                    size={12}
                                    className="flex-shrink-0 text-red-400"
                                  />
                                )}
                                {holderType === "bundler" && (
                                  <HiOutlineCubeTransparent
                                    size={12}
                                    className="flex-shrink-0 text-orange-400"
                                  />
                                )}
                              </div>
                            </WalletHoverCard>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-col">
                        <span className="text-[13px] font-normal text-[#86d99f]">
                          ${formatSmartNumber(boughtUsd)}
                        </span>
                        <span className="text-xs text-[#757e80] font-normal">
                          ({avgBuyPrice}) {trader.buys}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-col">
                        <span className="text-[13px] font-normal text-red-400">
                          ${formatSmartNumber(soldUsd)}
                        </span>
                        <span className="text-xs text-[#757e80] font-normal">
                          ({avgSellPrice}) {trader.sells}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-col">
                        <span
                          className={`text-[13px] font-normal ${totalPnlUsd >= 0 ? "text-[#86d99f]" : "text-red-400"}`}
                        >
                          {totalPnlUsd >= 0 ? "+$" : "-$"}
                          {formatSmartNumber(Math.abs(totalPnlUsd))}
                        </span>
                        <span className="text-xs text-[#757e80] font-normal">
                          {formatSmartNumber(totalPnlPct)}% · {totalPnlSol >= 0 ? "+" : ""}{formatSmartNumber(totalPnlSol)} SOL
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] text-[#c4cccc] font-normal">
                            ${formatSmartNumber(trader.remainingValueUsd || 0)}
                          </span>
                          <span className="rounded bg-[#26282b] px-1 py-0.5 text-[9px] text-[#c4cccc]">
                            {formatSmartNumber(trader.remainingPercent || 0)}%
                          </span>
                        </div>
                        <div className="h-0.5 overflow-hidden rounded-full" style={{ backgroundColor: '#2A2B3340' }}>
                          <div className="h-full rounded-full bg-[#c4cccc] transition-all"
                            style={{ width: `${Math.min(trader.remainingPercent || 0, 100)}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <span className="text-[13px] text-[#757e80] font-normal">
                        {lastActive}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CodexTopTraders;
