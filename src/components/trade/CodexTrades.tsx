import { RiExchangeDollarLine } from "react-icons/ri";
import { SiSolana } from "react-icons/si";
import { FaArrowRightArrowLeft } from "react-icons/fa6";
import { FaCaretDown } from "react-icons/fa";
import { CiFilter } from "react-icons/ci";
import { FiX } from "react-icons/fi";
import { MdRefresh } from "react-icons/md";
import { IoOpenOutline } from "react-icons/io5";
import { LuChefHat } from "react-icons/lu";
import { TfiTarget } from "react-icons/tfi";
import { HiOutlineCubeTransparent } from "react-icons/hi2";
import React, { useState, useCallback, useMemo } from "react";
import { formatSmartNumber, formatMarketCap, formatSmallPrice } from "~/utils/db";
import { useSolanaTokenWebSocketContext, type SolanaTokenHolder } from "../../contexts/SolanaTokenWebSocketContext";
import { useSolPrice } from "../SolPriceContext";
import { useMonadTradesWebSocket } from "../../hooks/useMonadTradesWebSocket";
import type { Token } from "~/utils/db";
import WalletHoverCard, { type WalletHoverCardData } from "./WalletHoverCard";
import { VirtualizedTokenList } from "../VirtualizedTokenList";
import { TokenAge } from "../TokenAge";

// Sort direction type
type SortDirection = "asc" | "desc" | null;

// Filter range type
interface FilterRange {
  min: string;
  max: string;
}

// Type filter selection
type TypeFilter = "all" | "buy" | "sell";

// Holder type tags available for filtering
type HolderTypeTag = "dev" | "sniper" | "bundler";

// Wallet filter state
interface WalletFilter {
  address: string;
  tags: HolderTypeTag[];
  txsRange: FilterRange;
}

// Column filter state for trades
interface TradeFilters {
  type: { filter: TypeFilter };
  price: { sort: SortDirection; range: FilterRange };
  amount: { sort: SortDirection; range: FilterRange };
  total: { sort: SortDirection; range: FilterRange };
  wallet: WalletFilter;
}

const AX = {
  bg: "#111214",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#E6E7EA",
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
            className="hover:bg-opacity-20 rounded p-1 text-[#757e80]"
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
              style={{ backgroundColor: AX.surface2, color: "#757e80" }}
            >
              {unit}
            </div>
          </div>
          <span className="text-sm" style={{ color: "#757e80" }}>
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
              style={{ backgroundColor: AX.surface2, color: "#757e80" }}
            >
              {unit}
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={onReset}
            className="flex items-center gap-1 rounded px-3 py-1.5 text-sm text-[#757e80] transition-opacity hover:opacity-80"
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

// Type Filter Popout Component
interface TypeFilterPopoutProps {
  isOpen: boolean;
  onClose: () => void;
  value: TypeFilter;
  onChange: (value: TypeFilter) => void;
  position: { top: number; left: number };
}

const TypeFilterPopout: React.FC<TypeFilterPopoutProps> = ({
  isOpen,
  onClose,
  value,
  onChange,
  position,
}) => {
  if (!isOpen) return null;

  const options: { value: TypeFilter; label: string; color: string }[] = [
    { value: "all", label: "All", color: "#757e80" },
    { value: "buy", label: "Buy", color: "#34d399" },
    { value: "sell", label: "Sell", color: "#f87171" },
  ];

  return (
    <div
      className="fixed z-50 rounded-lg border shadow-xl"
      style={{
        backgroundColor: AX.surface,
        borderColor: AX.border,
        top: position.top,
        left: position.left,
        minWidth: "140px",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-3">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: AX.text }}>
            Type
          </span>
          <button
            onClick={onClose}
            className="hover:bg-opacity-20 rounded p-1 text-[#757e80]"
          >
            <FiX size={14} />
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                onClose();
              }}
              className="flex items-center gap-2 rounded px-3 py-2 text-sm font-medium transition-colors hover:opacity-80"
              style={{
                backgroundColor:
                  value === opt.value ? AX.surface2 : "transparent",
                color: opt.color,
                border:
                  value === opt.value
                    ? `1px solid ${AX.border}`
                    : "1px solid transparent",
              }}
            >
              {value === opt.value && <span className="text-xs">✓</span>}
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

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
            Filter Trader
          </span>
          <button
            onClick={onClose}
            className="hover:bg-opacity-20 rounded p-1 text-[#757e80]"
          >
            <FiX size={14} />
          </button>
        </div>

        {/* Wallet Address Filter */}
        <div className="mb-4">
          <label className="mb-1.5 block text-xs text-[#757e80]">
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
          <label className="mb-1.5 block text-xs text-[#757e80]">
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
                    color: isSelected ? opt.color : "#757e80",
                  }}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* TXs Range Filter */}
        <div className="mb-4">
          <label className="mb-1.5 block text-xs text-[#757e80]">
            Filter TXs
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <input
                type="text"
                inputMode="numeric"
                placeholder="Min"
                value={filter.txsRange.min}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "" || /^\d*$/.test(val)) {
                    onFilterChange({
                      ...filter,
                      txsRange: { ...filter.txsRange, min: val },
                    });
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
            </div>
            <span className="text-sm text-[#757e80]">to</span>
            <div className="flex-1">
              <input
                type="text"
                inputMode="numeric"
                placeholder="Max"
                value={filter.txsRange.max}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "" || /^\d*$/.test(val)) {
                    onFilterChange({
                      ...filter,
                      txsRange: { ...filter.txsRange, max: val },
                    });
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
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={onReset}
            className="flex items-center gap-1 rounded px-3 py-1.5 text-sm text-[#757e80] transition-opacity hover:opacity-80"
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
      style={{ color: sortDirection ? AX.mint : "#757e80" }}
    >
      <span className="text-[13px]">{label}</span>
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
        style={{ color: isFilterActive ? AX.mint : "#757e80" }}
      >
        <CiFilter size={14} />
      </button>
    )}
  </div>
);

interface CodexTradesProps {
  token: Token | null;
  initialTrades?: any[];
  onTradesUpdate?: (trades: any[]) => void; // Callback to update parent cache when trades change
  pairAddress?: string; // Fallback pair address when token doesn't have it
  chain?: "sol" | "monad"; // Chain to determine which WebSocket to use
}

function getTimeFromTimestampSec(ts: number) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function shortAddr(addr: string) {
  if (!addr) return "";
  return addr.slice(0, 3) + "..." + addr.slice(-3);
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function percentile(arr: number[], p: number) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const idx = (a.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return a[lo];
  const w = idx - lo;
  return a[lo] * (1 - w) + a[hi] * w;
}


/** Normalize trade shapes into a single structure */
function normalizeTrade(
  trade: any,
  tokenDecimalsFallback = 9,
  chainPrice = 0,
): {
  isBuy: boolean;
  color: "text-emerald-400" | "text-red-400" | "text-neutral-400";
  totalUSD: number;
  pricePerToken: number;
  tokenAmount: number;
  solAmount: number;
  maker: string;
  timestampSec: number;
  keyPart: string;
} {
  let isBuy = false;
  let color: "text-emerald-400" | "text-red-400" | "text-neutral-400" =
    "text-neutral-400";
  let totalUSD = 0;
  let pricePerToken = 0;
  let tokenAmount = 0;
  let solAmount = 0;
  let maker = trade.maker || trade.trader || "";
  let timestampSec = Date.now() / 1000;
  let keyPart = "";

  const hasWsShape =
    trade.side && trade.amount && trade.price && trade.pair_address;
  const hasBackend =
    trade.event_type &&
    (trade.amount !== undefined || trade.price_in_usd !== undefined);
  const hasCodex = trade.eventDisplayType && trade.data;
  // New format from /v1/ws/trades/{mint} endpoint
  const hasIndexerFormat =
    trade.type &&
    (trade.sol_amount !== undefined || trade.token_amount !== undefined);
  // Monad trade format from useMonadTradesWebSocket
  const hasMonadFormat =
    trade.is_buy !== undefined &&
    (trade.mon_amount !== undefined || trade.token_amount !== undefined);

  if (typeof trade.timestamp === "number") {
    timestampSec =
      trade.timestamp < 1e10 ? trade.timestamp : trade.timestamp / 1000;
  } else if (typeof trade.timestamp === "string") {
    timestampSec = new Date(trade.timestamp).getTime() / 1000;
  }

  if (hasWsShape) {
    isBuy = trade.side === "buy";
    color = isBuy ? "text-emerald-400" : "text-red-400";
    tokenAmount = parseFloat(trade.amount) || 0;
    const maybeTotal =
      trade.totalUSD !== undefined ? parseFloat(trade.totalUSD) : NaN;
    const maybePrice = parseFloat(trade.price);
    if (isFinite(maybeTotal)) {
      totalUSD = maybeTotal;
      pricePerToken =
        tokenAmount > 0 ? totalUSD / tokenAmount : maybePrice || 0;
    } else {
      pricePerToken = maybePrice || 0;
      totalUSD = tokenAmount * pricePerToken;
    }
    keyPart = (trade.pair_address || "") + (trade.timestamp || "");
    maker = trade.maker || trade.taker || trade.pair_address || "";
  } else if (hasBackend) {
    isBuy = trade.event_type === "BUY";
    color = isBuy ? "text-emerald-400" : "text-red-400";
    tokenAmount = Number(trade.amount || 0);
    totalUSD = Number(trade.total_usd || 0);
    pricePerToken = Number(trade.price_in_usd || 0);
    if (!pricePerToken && tokenAmount > 0 && totalUSD > 0)
      pricePerToken = totalUSD / tokenAmount;
    keyPart =
      (trade.transaction_hash || trade.id || "") + (trade.timestamp || "");
    maker = trade.maker || trade.trader || "";
  } else if (hasCodex) {
    isBuy = trade.eventDisplayType === "Buy";
    color = isBuy ? "text-emerald-400" : "text-red-400";

    const d = trade.data || {};
    tokenAmount =
      parseFloat(String(d.amountNonLiquidityToken ?? d.amount0 ?? 0)) || 0;
    totalUSD = parseFloat(String(d.priceUsdTotal ?? 0)) || 0;
    pricePerToken = parseFloat(String(d.priceUsd ?? 0)) || 0;
    solAmount = parseFloat(String(d.priceBaseTokenTotal ?? 0)) || 0;
    if (!pricePerToken && tokenAmount > 0 && totalUSD > 0)
      pricePerToken = totalUSD / tokenAmount;

    keyPart =
      (trade.transactionHash || trade.txHash || "") + (trade.timestamp || "");
    maker = trade.maker || trade.trader || "";
  } else if (hasIndexerFormat) {
    // New format from Solana indexer WebSocket (v1/ws/token/{mint})
    isBuy = trade.type?.toLowerCase() === "buy";
    color = isBuy ? "text-emerald-400" : "text-red-400";
    tokenAmount = Number(trade.token_amount || 0);
    solAmount = Number(trade.sol_amount || 0);
    // Handle both price_usd (new format) and total_usd/price (old format)
    pricePerToken = Number(trade.price_usd || trade.price || 0);
    totalUSD = Number(trade.total_usd || 0);
    // Always prefer live chain price over pre-computed total_usd
    if (solAmount > 0 && chainPrice > 0) {
      totalUSD = solAmount * chainPrice;
    }
    if (!pricePerToken && tokenAmount > 0 && totalUSD > 0)
      pricePerToken = totalUSD / tokenAmount;
    // Handle both signature (new format) and transaction_hash (old format)
    keyPart =
      (trade.signature || trade.transaction_hash || trade.id || "") +
      (trade.timestamp || "");
    // Handle both wallet_address (new format) and trader (old format)
    maker = trade.wallet_address || trade.trader || "";
  } else if (hasMonadFormat) {
    // Monad trade format from useMonadTradesWebSocket
    isBuy = trade.is_buy === true;
    color = isBuy ? "text-emerald-400" : "text-red-400";
    tokenAmount = Number(trade.token_amount || 0);
    // Monad uses MON instead of SOL
    solAmount = Number(trade.mon_amount || 0);
    pricePerToken = Number(trade.price_mon || 0);
    // Convert MON amount to USD using live chain price
    totalUSD = Number(trade.total_usd || 0);
    // Always prefer live chain price over pre-computed total_usd
    if (solAmount > 0 && chainPrice > 0) {
      totalUSD = solAmount * chainPrice;
    }
    // Always compute USD price (price_mon is in native MON, not USD)
    if (tokenAmount > 0 && totalUSD > 0)
      pricePerToken = totalUSD / tokenAmount;
    keyPart = (trade.tx_hash || trade.id || "") + (trade.block_timestamp || "");
    maker = trade.trader_address || "";
    // Use block_timestamp for Monad trades
    if (trade.block_timestamp) {
      timestampSec = Number(trade.block_timestamp);
    }
  } else {
    isBuy = !!(trade.side === "buy" || trade.type === "BUY");
    color = isBuy ? "text-emerald-400" : "text-red-400";
    tokenAmount = Number(trade.amount || trade.size || 0);
    totalUSD = Number(trade.total_usd || trade.total || 0);
    pricePerToken = Number(trade.price_in_usd || trade.price || 0);
    if (!pricePerToken && tokenAmount > 0 && totalUSD > 0)
      pricePerToken = totalUSD / tokenAmount;
    keyPart = (trade.id || trade.hash || "") + (trade.timestamp || "");
    maker = trade.maker || trade.trader || "";
  }

  if (solAmount === 0) {
    if (trade.originalEvent?.data?.priceBaseTokenTotal) {
      solAmount =
        parseFloat(String(trade.originalEvent.data.priceBaseTokenTotal)) || 0;
    } else if (hasWsShape && trade.price) {
      const price = parseFloat(trade.price);
      if (price > 10 && price < 300) {
        solAmount = totalUSD > 0 ? totalUSD / price : 0;
      }
    } else if (hasBackend && trade.base_token_amount) {
      solAmount = parseFloat(String(trade.base_token_amount)) || 0;
    }
  }

  return {
    isBuy,
    color,
    totalUSD,
    pricePerToken,
    tokenAmount,
    solAmount,
    maker,
    timestampSec,
    keyPart,
  };
}

/** Subtle gradient used only for the inline bar, NOT the cell background */
function heatBarGradient(isBuy: boolean, intensity01: number) {
  const t = clamp01(intensity01);
  const a = 0.1 + 0.22 * t;
  const rgb = isBuy ? "16,185,129" : "244,63,94";
  return `linear-gradient(90deg, rgba(${rgb}, ${a}) 0%, rgba(${rgb}, ${
    a * 0.6
  }) 60%, rgba(${rgb}, 0) 100%)`;
}

/** MC header icon using react-icons */
const McHeaderIcon: React.FC = () => (
  <FaArrowRightArrowLeft
    className="h-3 w-3 text-[#757e80]"
    aria-hidden="true"
  />
);

/** Solana icon using react-icons with gradient fill */
const SolIcon: React.FC = () => (
  <>
    <SiSolana
      className="-mt-0.5 inline-block h-3 w-3"
      aria-hidden="true"
      style={{
        color: "unset",
        fill: "url(#solana-gradient-positions)",
        filter: "none",
      }}
    />
    <svg className="pointer-events-none absolute h-0 w-0">
      <defs>
        <linearGradient
          id="solana-gradient-positions"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="0%"
        >
          <stop offset="0%" stopColor="#9945FF" />
          <stop offset="100%" stopColor="#14F195" />
        </linearGradient>
      </defs>
    </svg>
  </>
);

const CodexTrades: React.FC<CodexTradesProps> = ({
  token,
  initialTrades = [],
  onTradesUpdate,
  pairAddress,
  chain = "sol",
}) => {
  const { solPrice, monPrice } = useSolPrice();
  const chainPrice = chain === "monad" ? monPrice : solPrice;

  const [showAge, setShowAge] = React.useState(true); // true = Age, false = Time
  const [totalMode, setTotalMode] = React.useState<"usd" | "sol">("usd");
  const [mcMode, setMcMode] = React.useState<"mc" | "price">("price"); // MC vs Price toggle
  const [fetchedMarketCap, setFetchedMarketCap] = React.useState<number | null>(
    null,
  );

  // Filter states
  const initialFilters: TradeFilters = {
    type: { filter: "all" },
    price: { sort: null, range: { min: "", max: "" } },
    amount: { sort: null, range: { min: "", max: "" } },
    total: { sort: null, range: { min: "", max: "" } },
    wallet: { address: "", tags: [], txsRange: { min: "", max: "" } },
  };
  const [filters, setFilters] = useState<TradeFilters>(initialFilters);
  const [activeFilterPopout, setActiveFilterPopout] = useState<
    "price" | "amount" | "total" | null
  >(null);
  const [typeFilterPopoutOpen, setTypeFilterPopoutOpen] = useState(false);
  const [walletFilterPopoutOpen, setWalletFilterPopoutOpen] = useState(false);
  const [filterPopoutPosition, setFilterPopoutPosition] = useState({
    top: 0,
    left: 0,
  });
  const [tempFilterRange, setTempFilterRange] = useState<FilterRange>({
    min: "",
    max: "",
  });
  const [tempWalletFilter, setTempWalletFilter] = useState<WalletFilter>({
    address: "",
    tags: [],
    txsRange: { min: "", max: "" },
  });

  // Handle sort toggle (only for columns with sort capability)
  type SortableColumn = "price" | "amount" | "total";
  const handleSort = useCallback((column: SortableColumn) => {
    setFilters((prev) => {
      const currentSort = prev[column].sort;
      const newSort: SortDirection =
        currentSort === null ? "desc" : currentSort === "desc" ? "asc" : null;
      // Reset all sorts except current column
      return {
        ...prev,
        price: { ...prev.price, sort: column === "price" ? newSort : null },
        amount: { ...prev.amount, sort: column === "amount" ? newSort : null },
        total: { ...prev.total, sort: column === "total" ? newSort : null },
      };
    });
  }, []);

  // Handle range filter popout open
  const handleFilterClick = useCallback(
    (column: SortableColumn, e: React.MouseEvent) => {
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

  // Handle type filter popout open
  const handleTypeFilterClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setFilterPopoutPosition({
      top: rect.bottom + 8,
      left: Math.max(8, rect.left - 20),
    });
    setTypeFilterPopoutOpen((prev) => !prev);
  }, []);

  // Handle type filter change
  const handleTypeFilterChange = useCallback((value: TypeFilter) => {
    setFilters((prev) => ({
      ...prev,
      type: { filter: value },
    }));
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
      setTempWalletFilter(filters.wallet);
      setWalletFilterPopoutOpen((prev) => !prev);
    },
    [filters.wallet],
  );

  // Handle wallet filter apply
  const handleWalletFilterApply = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      wallet: tempWalletFilter,
    }));
    setWalletFilterPopoutOpen(false);
  }, [tempWalletFilter]);

  // Handle wallet filter reset
  const handleWalletFilterReset = useCallback(() => {
    setTempWalletFilter({
      address: "",
      tags: [],
      txsRange: { min: "", max: "" },
    });
  }, []);

  // Check if wallet filter is active
  const isWalletFilterActive =
    filters.wallet.address !== "" ||
    filters.wallet.tags.length > 0 ||
    filters.wallet.txsRange.min !== "" ||
    filters.wallet.txsRange.max !== "";

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

  // Get filter title and unit for range filter popout
  type RangeFilterColumn = "price" | "amount" | "total";
  const getFilterConfig = (
    column: RangeFilterColumn,
  ): { title: string; unit: string } => {
    const configs: Record<RangeFilterColumn, { title: string; unit: string }> =
      {
        price: { title: "Price", unit: "USD" },
        amount: { title: "Token Amount", unit: "Tokens" },
        total: { title: "Total Value", unit: "USD" },
      };
    return configs[column];
  };

  const stableToken = React.useMemo(() => {
    if (!token) return null;
    return {
      pair_address: token.pair_address || "",
      decimals: token.decimals || 9,
      name: token.name || "",
      symbol: token.symbol || "",
      mint: token.mint || "",
      ...token,
    };
  }, [token]); // Depend on entire token object to catch all field changes including supply/price

  // Fetch market cap immediately if not available in token
  React.useEffect(() => {
    if (!stableToken?.mint) return;

    // Check if token already has market cap
    const anyToken = stableToken as any;
    const existingMc =
      anyToken?.market_cap_usd ??
      anyToken?.fully_diluted_value ??
      anyToken?.marketCapUsd ??
      anyToken?.fullyDilutedValue;

    if (existingMc && Number(existingMc) > 0) {
      setFetchedMarketCap(null); // Clear fetched value since we have it from token
      return;
    }

    // Fetch market cap via API immediately
    const fetchMarketCap = async () => {
      try {
        const response = await fetch("/api/codex/market-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mints: [stableToken.mint] }),
        });

        if (response.ok) {
          const data = await response.json();
          // API returns Record<mint, MarketData>
          const marketData = data[stableToken.mint];
          if (marketData?.market_cap_usd && marketData.market_cap_usd > 0) {
            setFetchedMarketCap(marketData.market_cap_usd);
          }
        }
      } catch (error) {
        // Silently fail - we'll fall back to calculated market cap
        console.error("[CodexTrades] Failed to fetch market cap:", error);
      }
    };

    fetchMarketCap();
  }, [stableToken?.mint]);

  // Client-side localStorage cache for trades (persists across page reloads)
  const CACHE_KEY_PREFIX = "codex_trades_cache_";
  const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes cache expiry

  const getCacheKey = (pairAddress: string) => {
    return `${CACHE_KEY_PREFIX}${pairAddress}`;
  };

  // Load cached trades from localStorage on mount and when pair address changes
  const [cachedTradesFromStorage, setCachedTradesFromStorage] = React.useState<
    any[]
  >(() => {
    if (!stableToken?.pair_address || typeof window === "undefined") return [];

    try {
      const cacheKey = getCacheKey(stableToken.pair_address);
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Check if cache is still valid (not expired)
        const now = Date.now();
        if (parsed.timestamp && now - parsed.timestamp < CACHE_EXPIRY_MS) {
          return parsed.trades || [];
        } else {
          // Cache expired, remove it
          localStorage.removeItem(cacheKey);
        }
      }
    } catch (error) {
      console.error("[CodexTrades] Error loading cache:", error);
    }
    return [];
  });

  // Reload cache when pair address changes (user navigates to different token)
  React.useEffect(() => {
    if (!stableToken?.pair_address || typeof window === "undefined") {
      setCachedTradesFromStorage([]);
      return;
    }

    try {
      const cacheKey = getCacheKey(stableToken.pair_address);
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const now = Date.now();
        if (parsed.timestamp && now - parsed.timestamp < CACHE_EXPIRY_MS) {
          setCachedTradesFromStorage(parsed.trades || []);
        } else {
          localStorage.removeItem(cacheKey);
          setCachedTradesFromStorage([]);
        }
      } else {
        setCachedTradesFromStorage([]);
      }
    } catch (error) {
      console.error("[CodexTrades] Error reloading cache:", error);
      setCachedTradesFromStorage([]);
    }
  }, [stableToken?.pair_address]);

  // Save trades to localStorage cache
  const saveToCache = React.useCallback(
    (trades: any[], pairAddress: string) => {
      if (!pairAddress || typeof window === "undefined" || trades.length === 0)
        return;

      try {
        const cacheKey = getCacheKey(pairAddress);
        const cacheData = {
          trades,
          timestamp: Date.now(),
          pairAddress,
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
      } catch (error) {
        console.error("[CodexTrades] Error saving to cache:", error);
        // If storage is full, try to clear old entries
        try {
          const keys = Object.keys(localStorage);
          const oldCacheKeys = keys.filter((k) =>
            k.startsWith(CACHE_KEY_PREFIX),
          );
          // Remove oldest cache entries if storage is full
          if (oldCacheKeys.length > 10) {
            const sorted = oldCacheKeys
              .map((key) => {
                try {
                  const item = localStorage.getItem(key);
                  return {
                    key,
                    timestamp: item ? JSON.parse(item).timestamp || 0 : 0,
                  };
                } catch {
                  return { key, timestamp: 0 };
                }
              })
              .sort((a, b) => a.timestamp - b.timestamp);

            // Remove oldest 3 entries
            sorted
              .slice(0, 3)
              .forEach(({ key }) => localStorage.removeItem(key));
          }
        } catch (clearError) {
          console.error("[CodexTrades] Error clearing old cache:", clearError);
        }
      }
    },
    [],
  );

  // Use cached trades from storage if available, otherwise use initialTrades prop
  const stableInitialTrades = React.useMemo(() => {
    // Prioritize cached trades from localStorage (persists across reloads)
    if (cachedTradesFromStorage.length > 0) {
      return cachedTradesFromStorage;
    }
    // Fallback to initialTrades prop (from API/URL)
    return initialTrades;
  }, [cachedTradesFromStorage, initialTrades]);

  // Use mint if available, fallback to pair_address, then fallback to pairAddress prop
  const mintForWebSocket =
    stableToken?.mint || stableToken?.pair_address || pairAddress;

  // Debug logging
  console.log("[CodexTrades] Debug:", {
    tokenMint: stableToken?.mint,
    tokenPairAddress: stableToken?.pair_address,
    propPairAddress: pairAddress,
    mintForWebSocket,
    enabled: !!mintForWebSocket,
    chain,
  });

  // Use shared WebSocket context for Solana chain (eliminates duplicate connections)
  // Context is provided by parent [id].tsx with SolanaTokenWebSocketProvider
  const wsContext = useSolanaTokenWebSocketContext();
  const solanaWsLoading = chain === "sol" ? wsContext.loading : false;
  const solanaTrades = chain === "sol" ? wsContext.trades : [];
  const solanaHolders = chain === "sol" ? wsContext.holders : [];
  const solanaTopTraders = chain === "sol" ? wsContext.topTraders : [];

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
      if (solanaTopTraders) {
        for (const trader of solanaTopTraders) {
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
  }, [chain, solanaHolders, solanaTopTraders]);

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

  // Use Monad WebSocket for Monad chain
  const { loading: monadWsLoading, trades: monadTrades } =
    useMonadTradesWebSocket({
      tokenAddress: mintForWebSocket,
      enabled: chain === "monad" && !!mintForWebSocket,
    });

  // Select the appropriate trades based on chain
  const wsLoading = chain === "sol" ? solanaWsLoading : monadWsLoading;
  const wsTrades = chain === "sol" ? solanaTrades : monadTrades;

  // Preserve trades - once we have trades from WebSocket, always use them
  // This ensures trades don't disappear or change unless new ones arrive
  const displayTrades = React.useMemo(() => {
    // If we have WebSocket trades, always use them (they're the source of truth)
    if (wsTrades.length > 0) {
      return wsTrades;
    }
    // Fallback to initial trades only if WebSocket hasn't provided any yet
    return stableInitialTrades;
  }, [wsTrades, stableInitialTrades]);

  // Only show loading if we don't have any trades at all (not even cached ones)
  // If we have cached trades, show them immediately even if WebSocket is still connecting
  const isLoading =
    wsLoading && displayTrades.length === 0 && stableInitialTrades.length === 0;

  // Update parent cache when trades change (for persistence across tab switches)
  React.useEffect(() => {
    if (onTradesUpdate && displayTrades.length > 0) {
      onTradesUpdate(displayTrades);
    }
  }, [displayTrades, onTradesUpdate]);

  // Save trades to localStorage cache when they update
  React.useEffect(() => {
    if (stableToken?.pair_address && displayTrades.length > 0) {
      saveToCache(displayTrades, stableToken.pair_address);
    }
  }, [displayTrades, stableToken?.pair_address, saveToCache]);

  // Helper to extract complete trader address from raw trade data
  const getCompleteTraderAddress = React.useCallback((trade: any): string => {
    const address =
      trade.maker ||
      trade.trader ||
      trade.taker ||
      trade.data?.maker ||
      trade.data?.trader ||
      trade.data?.taker ||
      trade.originalEvent?.data?.maker ||
      trade.originalEvent?.data?.trader ||
      trade.originalEvent?.maker ||
      trade.originalEvent?.trader ||
      "";
    return (address || "").toString().trim();
  }, []);

  const normalized = React.useMemo(() => {
    let result = (displayTrades || []).map((t, i) => {
      const n = normalizeTrade(t, stableToken?.decimals ?? 9, chainPrice);
      // Store the complete address from raw trade
      const completeAddress = getCompleteTraderAddress(t);
      const finalAddress = completeAddress || n.maker || "";
      return { ...n, raw: t, idx: i, completeTraderAddress: finalAddress };
    });

    // Apply type filter
    if (filters.type.filter !== "all") {
      result = result.filter((trade) => {
        if (filters.type.filter === "buy") return trade.isBuy;
        if (filters.type.filter === "sell") return !trade.isBuy;
        return true;
      });
    }

    // Apply range filters
    result = result.filter((trade) => {
      const price = trade.pricePerToken;
      const amount = trade.tokenAmount;
      const total = trade.totalUSD;

      if (
        filters.price.range.min &&
        price < parseFloat(filters.price.range.min)
      )
        return false;
      if (
        filters.price.range.max &&
        price > parseFloat(filters.price.range.max)
      )
        return false;
      if (
        filters.amount.range.min &&
        amount < parseFloat(filters.amount.range.min)
      )
        return false;
      if (
        filters.amount.range.max &&
        amount > parseFloat(filters.amount.range.max)
      )
        return false;
      if (
        filters.total.range.min &&
        total < parseFloat(filters.total.range.min)
      )
        return false;
      if (
        filters.total.range.max &&
        total > parseFloat(filters.total.range.max)
      )
        return false;

      return true;
    });

    // Calculate trade counts per trader for TXs filter
    const tradeCounts: Record<string, number> = {};
    result.forEach((trade) => {
      const key = (trade.completeTraderAddress || trade.maker || "")
        .toLowerCase()
        .trim();
      if (key) {
        tradeCounts[key] = (tradeCounts[key] || 0) + 1;
      }
    });

    // Apply wallet filter
    const walletFilter = filters.wallet;
    const hasWalletAddressFilter = walletFilter.address.trim() !== "";
    const hasTagFilter = walletFilter.tags.length > 0;
    const hasTxsMinFilter = walletFilter.txsRange.min !== "";
    const hasTxsMaxFilter = walletFilter.txsRange.max !== "";

    if (
      hasWalletAddressFilter ||
      hasTagFilter ||
      hasTxsMinFilter ||
      hasTxsMaxFilter
    ) {
      result = result.filter((trade) => {
        const traderAddress = (trade.completeTraderAddress || trade.maker || "")
          .toLowerCase()
          .trim();

        // Filter by wallet address (case-insensitive contains match)
        if (hasWalletAddressFilter) {
          const searchAddress = walletFilter.address.toLowerCase().trim();
          if (!traderAddress.includes(searchAddress)) return false;
        }

        // Filter by holder type tags
        if (hasTagFilter) {
          const walletKey = traderAddress;
          const holderType = holderTypeMap.get(walletKey);
          // Only show trades from wallets that have one of the selected tags
          if (
            !holderType ||
            !walletFilter.tags.includes(holderType as HolderTypeTag)
          )
            return false;
        }

        // Filter by TXs count
        const tradeCount = tradeCounts[traderAddress] || 0;
        if (
          hasTxsMinFilter &&
          tradeCount < parseInt(walletFilter.txsRange.min, 10)
        )
          return false;
        if (
          hasTxsMaxFilter &&
          tradeCount > parseInt(walletFilter.txsRange.max, 10)
        )
          return false;

        return true;
      });
    }

    // Apply sorting (only for sortable columns: price, amount, total)
    const sortableColumns: ("price" | "amount" | "total")[] = [
      "price",
      "amount",
      "total",
    ];
    const sortColumn = sortableColumns.find(
      (col) => filters[col].sort !== null,
    );
    if (sortColumn) {
      const sortDir = filters[sortColumn].sort;
      result = [...result].sort((a, b) => {
        let aVal = 0,
          bVal = 0;
        switch (sortColumn) {
          case "price":
            aVal = a.pricePerToken;
            bVal = b.pricePerToken;
            break;
          case "amount":
            aVal = a.tokenAmount;
            bVal = b.tokenAmount;
            break;
          case "total":
            aVal = a.totalUSD;
            bVal = b.totalUSD;
            break;
        }
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      });
    }

    return result;
  }, [
    displayTrades,
    stableToken?.decimals,
    chainPrice,
    getCompleteTraderAddress,
    filters,
    holderTypeMap,
  ]);

  // Calculate trade count per trader from all trades
  const traderTradeCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    (displayTrades || []).forEach((t) => {
      const completeAddress = getCompleteTraderAddress(t);
      if (completeAddress) {
        const key = completeAddress
          .replace(/\./g, "")
          .replace(/\s/g, "")
          .toLowerCase()
          .trim();
        counts[key] = (counts[key] || 0) + 1;
      }
    });
    return counts;
  }, [displayTrades, getCompleteTraderAddress]);

  const p95 = React.useMemo(() => {
    const arr = normalized
      .map((n) => n.totalUSD)
      .filter((x) => Number.isFinite(x) && x >= 0);
    return percentile(arr, 0.95) || 0;
  }, [normalized]);

  const p95Sol = React.useMemo(() => {
    const arr = normalized
      .map((n) => n.solAmount)
      .filter((x) => Number.isFinite(x) && x > 0);
    return percentile(arr, 0.95) || 0;
  }, [normalized]);

  const scaleAmt = React.useCallback(
    (v: number) => {
      if (!isFinite(v) || v <= 0) return 0;
      const ref =
        p95 > 0 ? p95 : normalized.reduce((mx, n) => (n.totalUSD > mx ? n.totalUSD : mx), 1);
      return clamp01(v / ref);
    },
    [p95, normalized],
  );

  const scaleAmtSol = React.useCallback(
    (v: number) => {
      if (!isFinite(v) || v <= 0) return 0;
      const ref =
        p95Sol > 0
          ? p95Sol
          : normalized.reduce((mx, n) => (n.solAmount > 0 && n.solAmount > mx ? n.solAmount : mx), 1);
      return clamp01(v / ref);
    },
    [p95Sol, normalized],
  );

  // derive token supply (supports several possible field names)
  const supply = React.useMemo(() => {
    const anyToken = stableToken as any;
    if (!anyToken) return 0;

    const raw =
      anyToken?.supply ??
      anyToken?.total_supply_formatted ??
      anyToken?.total_supply ??
      anyToken?.totalSupply ??
      anyToken?.circulating_supply ??
      0;

    let num = Number(raw);
    if (!Number.isFinite(num) || num <= 0) return 0;

    // If it's a gigantic integer, assume it's raw base units and scale by decimals
    if (num > 1e15 && stableToken?.decimals != null) {
      const scaled = num / Math.pow(10, stableToken.decimals);
      return Number.isFinite(scaled) ? scaled : 0;
    }

    return num;
  }, [stableToken]);

  // fallback token price (used when a trade doesn't have a valid pricePerToken)
  const fallbackPriceUsd = React.useMemo(() => {
    const anyToken = stableToken as any;
    if (!anyToken) return 0;

    const raw =
      anyToken?.usd_price ??
      anyToken?.price_usd ??
      anyToken?.priceUsd ??
      anyToken?.last_price_usd ??
      0;

    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : 0;
  }, [stableToken]);

  // Derive supply from MC + price when explicit supply is unavailable
  const effectiveSupply = React.useMemo(() => {
    if (supply > 0) return supply;
    const anyToken = stableToken as any;
    const refMc = Number(
      anyToken?.market_cap_usd ?? anyToken?.fully_diluted_value ??
      anyToken?.marketCapUsd ?? anyToken?.fullyDilutedValue ?? 0
    );
    const refPrice = fallbackPriceUsd;
    if (refMc > 0 && refPrice > 0) return refMc / refPrice;
    if (fetchedMarketCap && fetchedMarketCap > 0 && refPrice > 0) return fetchedMarketCap / refPrice;
    return 0;
  }, [supply, stableToken, fallbackPriceUsd, fetchedMarketCap]);

  // Virtualized row renderer for trades
  const renderTradeRow = useCallback(
    (n: (typeof normalized)[number], index: number, style: React.CSSProperties) => {
      const timeStr = getTimeFromTimestampSec(n.timestampSec);
      const tokenAmountStr = formatSmartNumber(n.tokenAmount);
      const solAmountStr =
        Number.isFinite(n.solAmount) && n.solAmount > 0
          ? formatSmartNumber(n.solAmount)
          : "-";
      const amtStr = Number.isFinite(n.totalUSD)
        ? `$${n.totalUSD.toFixed(2)}`
        : "$0.00";

      const unitPriceUsd =
        Number.isFinite(n.pricePerToken) && n.pricePerToken > 0
          ? n.pricePerToken
          : fallbackPriceUsd;

      const tradePrice = n.pricePerToken > 0 ? n.pricePerToken : unitPriceUsd;
      const tradeMc =
        effectiveSupply > 0 && tradePrice > 0 ? tradePrice * effectiveSupply : null;

      const anyToken = stableToken as any;
      const tokenMarketCap =
        anyToken?.market_cap_usd ??
        anyToken?.fully_diluted_value ??
        anyToken?.marketCapUsd ??
        anyToken?.fullyDilutedValue;

      const mc =
        tradeMc !== null
          ? tradeMc
          : tokenMarketCap && Number(tokenMarketCap) > 0
            ? Number(tokenMarketCap)
            : fetchedMarketCap && fetchedMarketCap > 0
              ? fetchedMarketCap
              : null;

      const mcStr = mc !== null ? `$${formatMarketCap(mc)}` : "-";
      const priceStr = unitPriceUsd > 0 ? `$${formatSmallPrice(unitPriceUsd)}` : "-";

      const intensityUsd = scaleAmt(n.totalUSD);
      const gradientUsd = heatBarGradient(n.isBuy, intensityUsd);

      const intensitySol = n.solAmount > 0 ? scaleAmtSol(n.solAmount) : 0;
      const gradientSol = heatBarGradient(n.isBuy, intensitySol);

      const typeLabel = n.isBuy ? "Buy" : "Sell";
      const showingUsd = totalMode === "usd";

      const totalValueStr = showingUsd ? amtStr : solAmountStr;
      const intensity = showingUsd ? intensityUsd : intensitySol;
      const gradient = showingUsd ? gradientUsd : gradientSol;

      const hasSol = Number.isFinite(n.solAmount) && n.solAmount > 0;

      return (
        <div
          key={n.keyPart || n.idx}
          style={{
            ...style,
            backgroundColor: index % 2 === 0 ? "#111214" : "#161719",
          }}
          className="!font-geist flex items-center transition-colors hover:brightness-110 !text-[13px]"
        >
          {/* Age / Time */}
          <div className="w-[12%] px-4 text-[13px] text-[#757e80] truncate">
            {showAge ? <TokenAge createdAt={n.timestampSec} /> : timeStr}
          </div>

          {/* Type */}
          <div
            className={`w-[10%] px-2 text-[13px] font-medium ${
              n.isBuy ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {typeLabel}
          </div>

          {/* MC / Price */}
          <div className="w-[13%] px-2 text-[13px] text-[#c4cccc] truncate">
            {mcMode === "mc" ? mcStr : priceStr}
          </div>

          {/* Amount */}
          <div className="w-[15%] px-2 text-[13px] text-[#c4cccc] truncate">
            {tokenAmountStr}
          </div>

          {/* merged Total column */}
          <div
            className="w-[15%] px-2 text-[13px] font-medium self-stretch flex items-center"
            style={showingUsd || hasSol ? {
              backgroundImage: gradient,
              backgroundSize: `${Math.max(6, intensity * 100)}% 100%`,
              backgroundPosition: "left",
              backgroundRepeat: "no-repeat",
              mixBlendMode: "screen" as const,
              transition: "background-size 160ms ease",
            } : undefined}
          >
            {showingUsd || hasSol ? (
              <div
                className={`flex items-center gap-1 ${
                  n.isBuy ? "text-emerald-300" : "text-red-300"
                }`}
              >
                {!showingUsd && (
                  <span className={hasSol ? "" : "opacity-40"}>
                    <SolIcon />
                  </span>
                )}
                <span>{totalValueStr}</span>
              </div>
            ) : (
              <div className="text-neutral-400">
                {totalValueStr}
              </div>
            )}
          </div>

          {/* Trader */}
          <div className="w-[35%] px-2 text-right align-middle text-[13px] text-[#c4cccc]">
            <div className="flex min-w-0 flex-nowrap items-center justify-end gap-2">
              {(() => {
                const walletKey = (n.maker || "").toLowerCase();
                const walletData = walletDataMap.get(walletKey);
                const holderType = holderTypeMap.get(walletKey);

                const hoverData: WalletHoverCardData = walletData || {
                  walletAddress: n.maker || "",
                  holderType: holderType,
                };

                return (
                  <WalletHoverCard data={hoverData} chain={chain}>
                    <div className="flex items-center gap-1.5">
                      <span className="cursor-pointer truncate text-[13px] whitespace-nowrap text-gray-300 transition-colors hover:text-emerald-400">
                        {shortAddr(n.maker || "")}
                      </span>
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
              <div className="flex flex-shrink-0 flex-nowrap items-center gap-1">
                {(() => {
                  const traderKey = (
                    n.completeTraderAddress ||
                    n.maker ||
                    ""
                  )
                    .toString()
                    .replace(/\./g, "")
                    .replace(/\s/g, "")
                    .toLowerCase()
                    .trim();
                  const count = traderTradeCounts[traderKey] || 0;
                  if (count > 0) {
                    return (
                      <span
                        className="inline-flex min-w-[16px] items-center justify-center rounded px-1 text-[10px] font-medium whitespace-nowrap"
                        style={{
                          backgroundColor: "#27282e",
                          color: "#d1d5db",
                        }}
                      >
                        {count}
                      </span>
                    );
                  }
                  return null;
                })()}
                <a
                  href={
                    chain === "monad"
                      ? `https://testnet.monadexplorer.com/address/${n.maker || ""}`
                      : `https://solscan.io/account/${n.maker || ""}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex flex-shrink-0 items-center justify-center transition-opacity hover:opacity-70"
                  style={{ color: "#6b7280" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="rounded-full bg-[#757E80] p-1">
                    <SiSolana
                      size={8}
                      className="flex-shrink-0 text-black"
                    />
                  </div>
                </a>
              </div>
            </div>
          </div>
        </div>
      );
    },
    [
      showAge, mcMode, totalMode, chain, fallbackPriceUsd, effectiveSupply,
      stableToken, fetchedMarketCap, scaleAmt, scaleAmtSol,
      walletDataMap, holderTypeMap, traderTradeCounts, normalized,
    ],
  );

  const p95Display = totalMode === "usd" ? p95 : p95Sol;

  // Show skeleton only if we have NO token data at all
  // If we have mint address, we have enough to display (name/symbol can be empty for new tokens)
  const tokenMint = stableToken?.mint || (stableToken as any)?.pair_address;
  if (!stableToken || (!stableToken.name && !stableToken.symbol && !tokenMint)) {
    return (
      <div className="min-h-0 flex-1 bg-black p-4">
        <div className="animate-pulse">
          <div className="mb-4 h-6 w-32 rounded bg-neutral-900" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 rounded bg-neutral-900" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-[#111214]">
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

      {/* Type Filter Popout */}
      <TypeFilterPopout
        isOpen={typeFilterPopoutOpen}
        onClose={() => setTypeFilterPopoutOpen(false)}
        value={filters.type.filter}
        onChange={handleTypeFilterChange}
        position={filterPopoutPosition}
      />

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

      <div className="min-h-0 flex-1 flex flex-col bg-[#111214]">
        {/* Column header — sits above virtual list, not inside it */}
        <div className="!font-geist flex items-center border-t border-b border-[#27282e] bg-[#111214] !text-xs" style={{ flexShrink: 0 }}>
          {/* Age / Time */}
          <div
            className="w-[12%] px-4 py-3 text-left whitespace-nowrap"
            style={{ color: "#9ca3af" }}
          >
            <button
              type="button"
              onClick={() => setShowAge((prev) => !prev)}
              className="inline-flex items-center gap-0.5 text-[13px] text-[#757e80] transition-opacity hover:opacity-70"
            >
              <span className="font-medium">
                {showAge ? "Age" : "Time"}
              </span>
              <span
                className="text-[10px] font-medium"
                style={{ color: "#6b7280" }}
              >
                / {showAge ? "Time" : "Age"}
              </span>
            </button>
          </div>

          {/* Type */}
          <div className="w-[10%] px-2 py-3 text-left whitespace-nowrap text-[#757e80]">
            <div className="flex items-center gap-1">
              <span className="text-[13px] font-medium">Type</span>
              <button
                onClick={handleTypeFilterClick}
                className="hover:bg-opacity-20 rounded p-0.5 transition-colors"
                style={{
                  color:
                    filters.type.filter !== "all" ? AX.mint : "#757e80",
                }}
              >
                <CiFilter size={14} />
              </button>
              {filters.type.filter !== "all" && (
                <span
                  className="rounded px-1 text-[9px]"
                  style={{
                    backgroundColor:
                      filters.type.filter === "buy"
                        ? "#34d39920"
                        : "#f8717120",
                    color:
                      filters.type.filter === "buy" ? "#34d399" : "#f87171",
                  }}
                >
                  {filters.type.filter === "buy" ? "Buy" : "Sell"}
                </span>
              )}
            </div>
          </div>

          {/* MC / Price column with filter */}
          <div className="w-[13%] px-2 py-3 text-left whitespace-nowrap text-[#757e80]">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  setMcMode((prev) => (prev === "mc" ? "price" : "mc"))
                }
                className="inline-flex items-center gap-0.5 text-[13px] text-[#757e80] transition-opacity hover:opacity-70"
              >
                <span className="font-medium">
                  {mcMode === "mc" ? "MC" : "Price"}
                </span>
                <McHeaderIcon />
              </button>
              <SortableHeader
                label=""
                sortDirection={filters.price.sort}
                onSort={() => handleSort("price")}
                hasFilter
                onFilterClick={(e) => handleFilterClick("price", e)}
                isFilterActive={
                  !!filters.price.range.min || !!filters.price.range.max
                }
              />
            </div>
          </div>

          {/* Amount with filter */}
          <div className="w-[15%] px-2 py-3 text-left font-medium whitespace-nowrap">
            <SortableHeader
              label="Amount"
              sortDirection={filters.amount.sort}
              onSort={() => handleSort("amount")}
              hasFilter
              onFilterClick={(e) => handleFilterClick("amount", e)}
              isFilterActive={
                !!filters.amount.range.min || !!filters.amount.range.max
              }
            />
          </div>

          {/* Total USD / SOL/MON toggle column with filter */}
          <div className="w-[15%] px-2 py-3 text-left whitespace-nowrap text-[#757e80]">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  setTotalMode((prev) => (prev === "usd" ? "sol" : "usd"))
                }
                className="inline-flex items-center gap-0.5 text-[13px] transition-opacity hover:opacity-70"
              >
                <span className="font-medium">
                  {totalMode === "usd"
                    ? "Total"
                    : chain === "monad"
                      ? "MON"
                      : "SOL"}
                </span>
                <RiExchangeDollarLine
                  className={
                    totalMode === "usd"
                      ? "h-3 w-3 text-emerald-300"
                      : "h-3 w-3 text-neutral-400"
                  }
                />
              </button>
              <SortableHeader
                label=""
                sortDirection={filters.total.sort}
                onSort={() => handleSort("total")}
                hasFilter
                onFilterClick={(e) => handleFilterClick("total", e)}
                isFilterActive={
                  !!filters.total.range.min || !!filters.total.range.max
                }
              />
            </div>
          </div>

          {/* Trader */}
          <div className="w-[35%] px-2 py-3 text-right whitespace-nowrap text-[#757e80]">
            <div className="flex items-center justify-end gap-1">
              <span className="text-[13px] font-normal text-[#757e80]">
                Trader
              </span>
              <button
                onClick={handleWalletFilterClick}
                className="hover:bg-opacity-20 rounded p-0.5 transition-colors"
                style={{
                  color: isWalletFilterActive ? AX.mint : "#757e80",
                }}
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
                  {filters.wallet.tags.length > 0
                    ? filters.wallet.tags.length
                    : ""}
                  {filters.wallet.address ? "🔍" : ""}
                  {filters.wallet.txsRange.min ||
                  filters.wallet.txsRange.max
                    ? "📊"
                    : ""}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Virtualized trade rows (or loading/empty states) */}
        {isLoading ? (
          <div className="bg-[#111214] py-6 text-center text-neutral-500">
            Loading trades...
          </div>
        ) : !normalized.length ? (
          <div className="bg-[#111214] py-6 text-center text-neutral-500">
            No trades available.
          </div>
        ) : (
          <VirtualizedTokenList
            items={normalized}
            itemSize={44}
            renderRow={renderTradeRow}
            overscanCount={10}
            className="bg-[#111214]"
          />
        )}

        {/* p95 heat footer */}
        {!!p95Display && (
          <div
            className="flex items-center gap-2 bg-[#111214] px-2 py-1.5 text-[10px]"
            style={{ color: "#6b7280", flexShrink: 0 }}
          >
            <span className="inline-block">
              Total heat = relative to ~95th percentile
            </span>
            <span className="ml-auto">
              {totalMode === "usd"
                ? `p95: $${p95Display.toFixed(2)}`
                : `p95: ${p95Display.toFixed(4)} ${chain === "monad" ? "MON" : "SOL"}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CodexTrades;
