import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { FiExternalLink, FiX } from "react-icons/fi";
import { FaFilter, FaCaretDown } from "react-icons/fa";
import { RiExchangeDollarLine } from "react-icons/ri";
import { MdOutlineBubbleChart, MdRefresh } from "react-icons/md";
import { LuChefHat } from "react-icons/lu";
import { TfiTarget } from "react-icons/tfi";
import { SiSolana } from "react-icons/si";
import { HiOutlineCubeTransparent } from "react-icons/hi2";
import useCodexHolders from "../../hooks/useCodexHolders";
import {
  useSolanaTokenWebSocketContext,
  type SolanaTokenHolder,
  type SolanaTopTrader,
} from "../../contexts/SolanaTokenWebSocketContext";
import useMonadHolders, { type MonadHolder } from "../../hooks/useMonadHolders";
// BANDAID: REST-driven Solana holders. Primary path while the WS approach is
// disabled. The WS + Codex branches stay intact (commented in normalizedHolders)
// so we can flip back by uncommenting and removing the REST branch.
import useHoldersRest, { type RestHolder } from "../../hooks/useHoldersRest";
import { getWalletSolBalance } from "../../utils/walletTracking";
import { useSolPrice } from "../SolPriceContext";
import { formatSmartNumber, type Token } from "~/utils/db";
import WalletHoverCard, { type WalletHoverCardData } from "./WalletHoverCard";
import { CiFilter } from "react-icons/ci";

// Official Solana logo component (imported from Footer pattern)
const SolanaIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 397.7 311.7" fill="currentColor">
    <defs>
      <linearGradient
        id="solanaGradientHolders"
        x1="360.8791"
        y1="351.4553"
        x2="141.213"
        y2="-69.2936"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0" stopColor="#00FFA3" />
        <stop offset="1" stopColor="#DC1FFF" />
      </linearGradient>
      <linearGradient
        id="solanaGradient2Holders"
        x1="264.8291"
        y1="401.6014"
        x2="45.163"
        y2="-19.1475"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0" stopColor="#00FFA3" />
        <stop offset="1" stopColor="#DC1FFF" />
      </linearGradient>
      <linearGradient
        id="solanaGradient3Holders"
        x1="312.5484"
        y1="376.688"
        x2="92.8822"
        y2="-44.061"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0" stopColor="#00FFA3" />
        <stop offset="1" stopColor="#DC1FFF" />
      </linearGradient>
    </defs>
    <path
      d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"
      fill="url(#solanaGradientHolders)"
    />
    <path
      d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"
      fill="url(#solanaGradient2Holders)"
    />
    <path
      d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z"
      fill="url(#solanaGradient3Holders)"
    />
  </svg>
);

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
  solBal: { sort: SortDirection; range: FilterRange };
  lastActive: { sort: SortDirection; range: FilterRange };
  bought: { sort: SortDirection; range: FilterRange };
  avgBuy: { sort: SortDirection; range: FilterRange };
  sold: { sort: SortDirection; range: FilterRange };
  avgSell: { sort: SortDirection; range: FilterRange };
  pnl: { sort: SortDirection; range: FilterRange };
  remaining: { sort: SortDirection; range: FilterRange };
  funding: { sort: SortDirection; range: FilterRange };
  tfAmount: { sort: SortDirection; range: FilterRange };
}

interface HoldersTableProps {
  token: Token | null;
  onBubblemapToggle?: (show: boolean) => void;
  isBubblemapVisible?: boolean;
  containerWidth?: number;
  chain?: "sol" | "monad"; // Chain to determine which endpoint to use
  onTotalCountChange?: (count: number) => void; // Callback to pass total count to parent
}

interface HolderWithBalance {
  address: string;
  lastTransactionAt: number;
  solBalance: number | null;
  isLoadingBalance: boolean;
  amountBoughtUsd30d: string;
  amountSoldUsd30d: string;
  tokenAmountBought30d: string;
  tokenAmountSold30d: string;
  tokenAcquisitionCostUsd: string;
  tokenBalance: string;
  buys30d: number;
  sells30d: number;
  holderType?: "dev" | "sniper" | "bundler" | "holder";
}

function getTimeAgo(timestamp: number): string {
  if (!timestamp) return "N/A";
  const now = Date.now() / 1000; // seconds
  const diffSeconds = now - timestamp;
  const diffMins = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffSeconds / 3600);
  const diffDays = Math.floor(diffSeconds / 86400);

  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  if (diffMins > 0) return `${diffMins}m`;
  return `${Math.floor(diffSeconds)}s`;
}

function shortAddr(addr: string): string {
  if (!addr) return "";
  return addr.slice(0, 4) + "..." + addr.slice(-4);
}

function formatUsd(value: string | number | null | undefined): string {
  if (!value) return "$0";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(num) || num === 0) return "$0";
  const abs = Math.abs(num);
  const sign = num < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}K`;
  if (abs > 0 && abs < 0.01) return `${sign}$${formatSmartNumber(abs)}`;
  return `${sign}$${abs.toFixed(2)}`;
}

function formatNumber(value: string | number | null | undefined): string {
  if (!value) return "0";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(num) || num === 0) return "0";
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  if (Math.abs(num) > 0 && Math.abs(num) < 0.01) return formatSmartNumber(num);
  return num.toFixed(2);
}

function formatPercentage(value: number | null | undefined): string {
  if (!value || !Number.isFinite(value) || value === 0) return "0%";
  if (value < 0.01) return value.toFixed(3) + "%";
  if (value < 1) return value.toFixed(2) + "%";
  return value.toFixed(2) + "%";
}

// Convert funding age to hours (if < 24h) or days format
function formatFundingAge(timeAgo: string): string {
  if (!timeAgo) return "N/A";

  // Parse the time string and convert to hours
  const match = timeAgo.match(/^(\d+)(s|m|h|d|mo|y)$/i);
  if (!match) return timeAgo;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  let totalHours = 0;
  switch (unit) {
    case "s":
      totalHours = value / 3600;
      break;
    case "m":
      totalHours = value / 60;
      break;
    case "h":
      totalHours = value;
      break;
    case "d":
      totalHours = value * 24;
      break;
    case "mo":
      totalHours = value * 30 * 24;
      break;
    case "y":
      totalHours = value * 365 * 24;
      break;
    default:
      return timeAgo;
  }

  // If less than 24 hours, show hours
  if (totalHours < 24) {
    return `${Math.max(1, Math.round(totalHours))}h`;
  }

  // Otherwise show days
  const days = Math.round(totalHours / 24);
  return `${days}d`;
}

function calculateRemaining(
  tokenBalance: string,
  tokenAmountBought: string,
  liveTokenPriceUsd: number,
  decimals?: number,
): { value: number; percentage: number } {
  const balance = parseFloat(tokenBalance) || 0;
  if (balance <= 0) return { value: 0, percentage: 0 };

  // Adjust balance for decimals if needed
  let adjustedBalance = balance;
  if (decimals && balance > 0 && balance > 1e15) {
    adjustedBalance = balance / Math.pow(10, decimals);
  }

  const bought = parseFloat(tokenAmountBought) || 0;
  let adjustedBought = bought;
  if (decimals && bought > 0 && bought > 1e15) {
    adjustedBought = bought / Math.pow(10, decimals);
  }

  // Bar % = remaining_tokens / total_bought_tokens (how much of purchase still held)
  const percentage = adjustedBought > 0 ? (adjustedBalance / adjustedBought) * 100 : 0;

  // Value = remaining_tokens * live token price in USD
  const value = adjustedBalance * liveTokenPriceUsd;

  return { value, percentage };
}

function getFundingSource(
  address: string,
  index: number,
): {
  source: string;
  sourceAddress: string | null;
  timeAgo: string;
  solAmount: number;
} {
  // Generate placeholder funding data
  // sourceAddress is the full address for links, source is the display name
  const sources = [
    {
      source: shortAddr(address),
      sourceAddress: address,
      timeAgo: "21h",
      solAmount: 0.023,
    },
    {
      source: shortAddr(address),
      sourceAddress: address,
      timeAgo: "3mo",
      solAmount: 0.022,
    },
    { source: "Kucoin", sourceAddress: null, timeAgo: "3y", solAmount: 1 }, // Exchange, no direct link
    {
      source: shortAddr(address),
      sourceAddress: address,
      timeAgo: "3d",
      solAmount: 10.22,
    },
  ];

  return sources[index % sources.length];
}

function calculateUnrealizedPnL(
  tokenBalance: string,
  tokenAcquisitionCostUsd: string,
  currentPrice?: number,
  decimals?: number,
): number {
  if (!currentPrice || currentPrice <= 0) return 0;
  const balance = parseFloat(tokenBalance) || 0;
  const cost = parseFloat(tokenAcquisitionCostUsd) || 0;
  if (balance === 0 || cost === 0) return 0;

  // Adjust balance for decimals if needed (assuming tokenBalance might be in raw units)
  // If decimals are provided and balance seems too large, adjust it
  let adjustedBalance = balance;
  if (decimals && balance > 0 && balance > 1e15) {
    adjustedBalance = balance / Math.pow(10, decimals);
  }

  // Unrealized PnL = (current token value) - (acquisition cost)
  // current token value = balance * currentPrice
  const currentValue = adjustedBalance * currentPrice;
  return currentValue - cost;
}

const AX = {
  bg: "#101114",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#E6E7EA",
  muted: "#9CA3AF",
  mint: "#70E0B0",
  mintHover: "#58B890",
  sell: "#FF4D7F",
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
              className="mt-1 rounded px-2 py-1 text-center text-[13px]"
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
              className="mt-1 rounded px-2 py-1 text-center text-[13px]"
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
          <label
            className="mb-1.5 block text-[13px]"
            style={{ color: AX.muted }}
          >
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
          <label
            className="mb-1.5 block text-[13px]"
            style={{ color: AX.muted }}
          >
            Filter by Tag
          </label>
          <div className="flex flex-wrap gap-2">
            {tagOptions.map((opt) => {
              const isSelected = filter.tags.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => handleTagToggle(opt.value)}
                  className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[13px] font-medium transition-colors"
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
      <span className="font-normal">{label}</span>
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
        style={{ color: isFilterActive ? AX.mint : AX.muted }}
      >
        <CiFilter size={14} />
      </button>
    )}
  </div>
);

const HoldersTable: React.FC<HoldersTableProps> = ({
  token,
  onBubblemapToggle,
  isBubblemapVisible = false,
  containerWidth = 1000,
  chain = "sol",
  onTotalCountChange,
}) => {
  // Get SOL price for USD/SOL conversion
  const { solPrice, monPrice } = useSolPrice();
  const chainPrice = chain === "monad" ? monPrice : solPrice;

  // USD/SOL toggle state for Remaining column
  const [showRemainingInSol, setShowRemainingInSol] = useState(false);

  // Filter states
  const initialFilters: ColumnFilters = {
    solBal: { sort: null, range: { min: "", max: "" } },
    lastActive: { sort: null, range: { min: "", max: "" } },
    bought: { sort: null, range: { min: "", max: "" } },
    avgBuy: { sort: null, range: { min: "", max: "" } },
    sold: { sort: null, range: { min: "", max: "" } },
    avgSell: { sort: null, range: { min: "", max: "" } },
    pnl: { sort: null, range: { min: "", max: "" } },
    remaining: { sort: null, range: { min: "", max: "" } },
    funding: { sort: null, range: { min: "", max: "" } },
    tfAmount: { sort: null, range: { min: "", max: "" } },
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

  // Use shared WebSocket context for Solana chain (eliminates duplicate connections)
  // Context is provided by parent [id].tsx with SolanaTokenWebSocketProvider
  const wsContext = useSolanaTokenWebSocketContext();
  const wsHolders = chain === "sol" ? wsContext.holders : [];
  const wsTopTraders = chain === "sol" ? wsContext.topTraders : [];
  const wsLoading = chain === "sol" ? wsContext.loading : false;
  // Throttle live price to only update when it changes by >1%
  // Prevents full holder sort on every WS trade tick (~1/sec)
  const rawLiveTokenPriceUsd = chain === "sol"
    ? (wsContext.tokenInfo?.price_usd || (token as any)?.usd_price || (token as any)?.price_usd || 0)
    : 0;
  const stablePriceRef = useRef(rawLiveTokenPriceUsd);
  if (rawLiveTokenPriceUsd > 0 && Math.abs(rawLiveTokenPriceUsd - stablePriceRef.current) / stablePriceRef.current > 0.01) {
    stablePriceRef.current = rawLiveTokenPriceUsd;
  } else if (stablePriceRef.current === 0 && rawLiveTokenPriceUsd > 0) {
    stablePriceRef.current = rawLiveTokenPriceUsd;
  }
  const liveTokenPriceUsd = stablePriceRef.current;

  // Create a lookup map of wallet addresses to full holder data for hover cards
  const walletDataMap = useMemo(() => {
    const map = new Map<string, WalletHoverCardData>();
    if (chain === "sol") {
      // First, populate with holder data from WebSocket
      if (wsHolders) {
        for (const holder of wsHolders) {
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
  }, [chain, wsHolders, wsTopTraders]);

  // Use Monad hook for holders (Monad chain)
  const {
    holders: monadHolders,
    isLoading: monadLoading,
    error: monadError,
  } = useMonadHolders(token?.mint, {
    enabled: chain === "monad" && !!token?.mint,
  });

  // Fallback to Codex if WebSocket holders are empty (Solana only)
  const {
    holders: codexHolders,
    isLoading: codexLoading,
    error: codexError,
  } = useCodexHolders(chain === "sol" ? token?.mint : undefined);

  // BANDAID: REST-driven holders (primary path for Solana). Mirrors the WS
  // snapshot so the table maps with minimal changes. Falls back to WS / Codex
  // if the REST endpoint is unavailable.
  const {
    holders: restHolders,
    // BANDAID: total_holders from the endpoint is the TRUE on-chain count,
    // NOT the (limit-capped) length of the holders array. Used below to
    // report the right number to onTotalCountChange.
    totalHolders: restTotalHolders,
    isLoading: restLoading,
    error: restError,
  } = useHoldersRest(chain === "sol" ? token?.mint : undefined, { limit: 100 });

  // BANDAID: Prefer REST holders for Solana; WS/Codex remain as safety nets.
  // Restore previous behaviour by deleting the `useRestData` branch in
  // normalizedHolders and removing this useRestData flag.
  const useRestData =
    chain === "sol" && !restLoading && restHolders && restHolders.length > 0;

  // Prefer WebSocket holders, fall back to Codex (Solana only)
  // Only use WebSocket data if it's not loading AND has data
  const wsFinished = !wsLoading;
  const useWebSocketData =
    chain === "sol" && wsFinished && wsHolders && wsHolders.length > 0;
  // Loading state based on chain. NOTE: useHoldersRest only flips its own
  // isLoading on the FIRST fetch per mint (stale-while-revalidate), so
  // background polls do not propagate up. The `!useRestData` guards mean we
  // never show "loading" once REST has data, even if wsLoading/codexLoading
  // are still settling.
  const isLoading =
    chain === "sol"
      ? // BANDAID: REST is primary; treat its loading state as primary too.
        // The `!restError` guards prevent falling through to wsLoading / codexLoading
        // once REST has failed — otherwise the "Loading holders..." UI stays up
        // forever for tokens where REST 504s and WS never publishes holders
        // (observed: 6p6xgHyF7AeE... returns HTTP 504 stream timeout from the
        // GCP load balancer when Helius DAS is slow for that mint).
        restLoading || (!useRestData && !restError && wsLoading) || (!useRestData && !restError && !useWebSocketData && codexLoading)
      : monadLoading;
  const error =
    chain === "sol"
      ? // BANDAID: surface REST error only when no fallback has data.
        useRestData
        ? null
        : useWebSocketData
          ? null
          : restError || codexError
      : monadError;

  const [holdersWithBalances, setHoldersWithBalances] = useState<
    HolderWithBalance[]
  >([]);
  const tableRef = useRef<HTMLDivElement>(null);

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
    if (activeFilterPopout) {
      setFilters((prev) => ({
        ...prev,
        [activeFilterPopout]: {
          ...prev[activeFilterPopout],
          range: { min: "", max: "" },
        },
      }));
    }
  }, [activeFilterPopout]);

  // Close filter popout when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setActiveFilterPopout(null);
    if (activeFilterPopout) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [activeFilterPopout]);

  // Check if a filter has active range
  const hasActiveRange = useCallback((range: FilterRange) => {
    return range.min !== "" || range.max !== "";
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

  // Convert holders to HolderWithBalance format based on chain
  const normalizedHolders = useMemo(() => {
    if (chain === "monad" && monadHolders && monadHolders.length > 0) {
      // Use Monad holders data
      return monadHolders.map((h: MonadHolder) => ({
        address: h.wallet_address,
        lastTransactionAt: h.last_active_at || 0,
        solBalance: h.mon_balance || null, // MON balance instead of SOL
        isLoadingBalance: false, // Monad hook already includes balance
        amountBoughtUsd30d: String(h.total_bought_usd || 0),
        amountSoldUsd30d: String(h.total_sold_usd || 0),
        tokenAmountBought30d: String(h.tokens_bought || 0),
        tokenAmountSold30d: String(h.tokens_sold || 0),
        tokenAcquisitionCostUsd: String(h.total_bought_usd || 0),
        tokenBalance: String(h.tokens_remaining || 0),
        buys30d: h.buy_count || 0,
        sells30d: h.sell_count || 0,
      }));
    } else if (useRestData && restHolders) {
      // BANDAID: REST-driven Solana holders (primary path). Restore the WS branch
      // by deleting this `else if` block and uncommenting the WS branch below.
      return restHolders.map((h: RestHolder) => {
        const lastActivityUnix = h.last_activity_at
          ? Math.floor(new Date(h.last_activity_at).getTime() / 1000)
          : 0;
        // BANDAID PERF FIX: treat the endpoint's sol_balance_lamports as
        // authoritative (incl. 0). The previous mapping flagged 0 as "unknown"
        // and triggered the client-side RPC fallback at line ~1100 — which
        // batches 5-at-a-time with 200ms delays. For big tokens like TRUMP/JUP
        // where most top-100 holders are indexer-stale, that meant ~10s of
        // background RPC calls per token switch. The WS branch (commented below)
        // never did this; it trusted 0 as 0. Matching that behaviour here.
        const solBalance = (h.sol_balance_lamports ?? 0) / 1e9;
        // Map the boolean badges to the holderType discriminant used by the table.
        // Priority matches the WS path: dev > sniper > bundler > generic holder.
        const holderType: "dev" | "sniper" | "bundler" | "holder" = h.is_dev
          ? "dev"
          : h.is_sniper
            ? "sniper"
            : h.is_bundler
              ? "bundler"
              : "holder";
        return {
          address: h.wallet_address,
          lastTransactionAt: lastActivityUnix,
          // BANDAID PERF FIX: solBalance is always defined (lamports/1e9, with
          // 0 meaning "indexer hasn't recorded a balance for this wallet").
          // isLoadingBalance is permanently false on the REST path so the row's
          // SOL Bal cell renders immediately and the RPC fallback never fires.
          // The cost: some indexer-stale wallets display 0 SOL when their real
          // balance is higher. The benefit: 5-10s perceived speed-up on big
          // tokens (TRUMP, JUP, etc.) where 80%+ of holders are indexer-stale.
          solBalance,
          isLoadingBalance: false,
          // Use live SOL price (chainPrice) rather than the endpoint's hard-coded
          // $200 sol_price_usd. Keeps USD columns in sync with the live feed.
          amountBoughtUsd30d: String(h.total_bought_sol * chainPrice),
          amountSoldUsd30d: String(h.total_sold_sol * chainPrice),
          tokenAmountBought30d: String(h.total_bought_tokens),
          tokenAmountSold30d: String(h.total_sold_tokens),
          tokenAcquisitionCostUsd: String(h.total_bought_sol * chainPrice),
          tokenBalance: String(h.token_balance),
          buys30d: h.buy_count,
          sells30d: h.sell_count,
          holderType,
        };
      });
    /* BANDAID: WS Solana holders branch disabled. Restore by:
     *   1. Removing the `useRestData` branch above.
     *   2. Uncommenting this `else if` and the closing brace below.
     *   3. Optionally removing `useHoldersRest` import + call.
     */
    /*
    } else if (useWebSocketData && wsHolders) {
      // Use Solana WebSocket holders data
      return wsHolders.map((h: SolanaTokenHolder) => ({
        address: h.wallet_address,
        lastTransactionAt: h.last_activity_at
          ? Math.floor(new Date(h.last_activity_at).getTime() / 1000)
          : 0,
        // Use sol_balance_lamports from WebSocket if available (convert lamports to SOL)
        solBalance:
          h.sol_balance_lamports != null ? h.sol_balance_lamports / 1e9 : null,
        isLoadingBalance: h.sol_balance_lamports == null, // Only loading if not provided
        // Convert SOL amounts to USD using live SOL price
        amountBoughtUsd30d: String(h.total_bought_sol * chainPrice),
        amountSoldUsd30d: String(h.total_sold_sol * chainPrice),
        tokenAmountBought30d: String(h.total_bought_tokens),
        tokenAmountSold30d: String(h.total_sold_tokens),
        tokenAcquisitionCostUsd: String(h.total_bought_sol * chainPrice),
        tokenBalance: String(h.remaining_tokens),
        buys30d: h.buy_count,
        sells30d: h.sell_count,
        holderType: h.holder_type,
      }));
    */
    } else if (chain === "sol" && codexHolders && codexHolders.length > 0) {
      // Use Codex holders data (Solana fallback)
      return codexHolders.map((h) => ({
        address: h.address,
        lastTransactionAt: h.lastTransactionAt,
        solBalance: null,
        isLoadingBalance: true,
        amountBoughtUsd30d: h.amountBoughtUsd30d,
        amountSoldUsd30d: h.amountSoldUsd30d,
        tokenAmountBought30d: h.tokenAmountBought30d,
        tokenAmountSold30d: h.tokenAmountSold30d,
        tokenAcquisitionCostUsd: h.tokenAcquisitionCostUsd,
        tokenBalance: h.tokenBalance,
        buys30d: h.buys30d,
        sells30d: h.sells30d,
      }));
    }
    return [];
  // BANDAID: useRestData + restHolders added; useWebSocketData + wsHolders
  // kept for the commented WS fallback branch (no-op until uncommented).
  }, [chain, monadHolders, useRestData, restHolders, useWebSocketData, wsHolders, codexHolders, chainPrice]);

  // Notify parent of total count changes.
  // BANDAID: When REST is active, send the TRUE on-chain total (top-level
  // `total_holders`) rather than the limit-capped array length. Otherwise the
  // tab badge briefly flashes "100" on first load (the limit we request) before
  // the parent's separate useHoldersRest hook overwrites it with the real count
  // — that was the observed prod bug.
  useEffect(() => {
    if (!onTotalCountChange) return;
    const count =
      useRestData && typeof restTotalHolders === "number"
        ? restTotalHolders
        : normalizedHolders.length;
    onTotalCountChange(count);
  }, [normalizedHolders.length, onTotalCountChange, useRestData, restTotalHolders]);

  // Fetch SOL balances for holders (only for Solana chain and only if not provided by WebSocket)
  useEffect(() => {
    if (normalizedHolders.length === 0) {
      setHoldersWithBalances([]);
      return;
    }

    // BANDAID: merge new normalized rows with previously-cached state instead
    // of replacing the array outright. This preserves RPC-fetched solBalance
    // values across the 15s REST refetch, so the SOL Bal column doesn't
    // flicker back to "loading" on every poll for indexer-stale wallets.
    setHoldersWithBalances((prev) => {
      const prevByAddr = new Map(prev.map((h) => [h.address, h]));
      return normalizedHolders.map((h) => {
        const cached = prevByAddr.get(h.address);
        // Carry over an RPC-resolved balance when the fresh row is still
        // missing one. Endpoint-provided balances always win when present.
        if (h.solBalance == null && cached && cached.solBalance != null) {
          return { ...h, solBalance: cached.solBalance, isLoadingBalance: false };
        }
        return h;
      });
    });

    // Skip balance fetching for Monad (already included in data)
    if (chain === "monad") {
      return;
    }

    // Filter holders that need balance fetching (those without sol_balance from WebSocket)
    const holdersNeedingBalance = normalizedHolders.filter(
      (h) => h.solBalance === null && h.isLoadingBalance,
    );

    // If all holders already have balance from WebSocket, skip fetching
    if (holdersNeedingBalance.length === 0) {
      return;
    }

    // Fetch balances in batches to avoid overwhelming the API (Solana only)
    const fetchBalances = async () => {
      const batchSize = 5;
      for (let i = 0; i < holdersNeedingBalance.length; i += batchSize) {
        const batch = holdersNeedingBalance.slice(i, i + batchSize);
        const balancePromises = batch.map(async (holder) => {
          try {
            const balance = await getWalletSolBalance(holder.address);
            return { address: holder.address, balance };
          } catch (error) {
            console.error(
              `Failed to fetch balance for ${holder.address}:`,
              error,
            );
            return { address: holder.address, balance: null };
          }
        });

        const results = await Promise.all(balancePromises);

        setHoldersWithBalances((prev) =>
          prev.map((h) => {
            const result = results.find((r) => r.address === h.address);
            if (result) {
              return {
                ...h,
                solBalance: result.balance,
                isLoadingBalance: false,
              };
            }
            return h;
          }),
        );

        // Small delay between batches to avoid rate limiting
        if (i + batchSize < holdersNeedingBalance.length) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
    };

    fetchBalances();
  }, [normalizedHolders, chain]);

  const handleBubblemapClick = useCallback(() => {
    if (onBubblemapToggle) {
      onBubblemapToggle(!isBubblemapVisible);
    }
  }, [onBubblemapToggle, isBubblemapVisible]);

  const handleHideBubblemap = useCallback(() => {
    if (onBubblemapToggle) {
      onBubblemapToggle(false);
    }
  }, [onBubblemapToggle]);

  // Get filter popout title based on column
  const getFilterTitle = (column: keyof ColumnFilters): string => {
    const titles: Record<keyof ColumnFilters, string> = {
      solBal: chain === "monad" ? "MON Balance" : "SOL Bal",
      lastActive: "Last Active",
      bought: "Bought",
      avgBuy: "Avg Buy",
      sold: "Sold",
      avgSell: "Avg Sell",
      pnl: "PNL",
      remaining: "Remaining",
      funding: "Funding",
      tfAmount: "TF Amount",
    };
    return titles[column];
  };

  // Get filter unit based on column
  const getFilterUnit = (column: keyof ColumnFilters): string => {
    const units: Record<keyof ColumnFilters, string> = {
      solBal: chain === "monad" ? "MON" : "SOL",
      lastActive: "hours",
      bought: "USD",
      avgBuy: "USD",
      sold: "USD",
      avgSell: "USD",
      pnl: "USD",
      remaining: showRemainingInSol
        ? chain === "monad"
          ? "MON"
          : "SOL"
        : "USD",
      funding: chain === "monad" ? "MON" : "SOL",
      tfAmount: chain === "monad" ? "MON" : "SOL",
    };
    return units[column];
  };

  // Sorting and filtering logic
  const sortedAndFilteredHolders = useMemo(() => {
    let result = [...holdersWithBalances];

    // Apply range filters
    Object.entries(filters).forEach(([key, filter]) => {
      const range = filter.range;
      if (range.min !== "" || range.max !== "") {
        const minVal = range.min !== "" ? parseFloat(range.min) : -Infinity;
        const maxVal = range.max !== "" ? parseFloat(range.max) : Infinity;

        result = result.filter((holder) => {
          let value: number;
          switch (key) {
            case "solBal":
              value = holder.solBalance ?? 0;
              break;
            case "lastActive":
              value = (Date.now() / 1000 - holder.lastTransactionAt) / 3600; // hours
              break;
            case "bought":
              value = parseFloat(holder.amountBoughtUsd30d) || 0;
              break;
            case "avgBuy":
              const buys = holder.buys30d || 1;
              value = (parseFloat(holder.amountBoughtUsd30d) || 0) / buys;
              break;
            case "sold":
              value = parseFloat(holder.amountSoldUsd30d) || 0;
              break;
            case "avgSell":
              const sells = holder.sells30d || 1;
              value = (parseFloat(holder.amountSoldUsd30d) || 0) / sells;
              break;
            case "pnl": {
              const hBought = parseFloat(holder.amountBoughtUsd30d) || 0;
              const hSold = parseFloat(holder.amountSoldUsd30d) || 0;
              const hRem = calculateRemaining(holder.tokenBalance, holder.tokenAmountBought30d, liveTokenPriceUsd, token?.decimals);
              value = (hSold + hRem.value) - hBought;
              break;
            }
            case "remaining":
              const rem = calculateRemaining(
                holder.tokenBalance,
                holder.tokenAmountBought30d,
                liveTokenPriceUsd,
                token?.decimals,
              );
              value =
                showRemainingInSol && chainPrice > 0
                  ? rem.value / chainPrice
                  : rem.value;
              break;
            default:
              value = 0;
          }
          return value >= minVal && value <= maxVal;
        });
      }
    });

    // Apply wallet filter
    const hasWalletAddressFilter = walletFilter.address.trim() !== "";
    const hasTagFilter = walletFilter.tags.length > 0;

    if (hasWalletAddressFilter || hasTagFilter) {
      result = result.filter((holder) => {
        const holderAddress = (holder.address || "").toLowerCase().trim();

        // Filter by wallet address (case-insensitive contains match)
        if (hasWalletAddressFilter) {
          const searchAddress = walletFilter.address.toLowerCase().trim();
          if (!holderAddress.includes(searchAddress)) return false;
        }

        // Filter by holder type tags
        if (hasTagFilter) {
          const holderType = holder.holderType;
          // Only show holders that have one of the selected tags
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
    const sortColumn = Object.entries(filters).find(([, f]) => f.sort !== null);
    if (sortColumn) {
      const [key, filter] = sortColumn;
      const direction = filter.sort === "asc" ? 1 : -1;

      result.sort((a, b) => {
        let aVal: number, bVal: number;
        switch (key) {
          case "solBal":
            aVal = a.solBalance ?? 0;
            bVal = b.solBalance ?? 0;
            break;
          case "lastActive":
            aVal = a.lastTransactionAt;
            bVal = b.lastTransactionAt;
            break;
          case "bought":
            aVal = parseFloat(a.amountBoughtUsd30d) || 0;
            bVal = parseFloat(b.amountBoughtUsd30d) || 0;
            break;
          case "avgBuy":
            aVal =
              a.buys30d > 0
                ? (parseFloat(a.amountBoughtUsd30d) || 0) / a.buys30d
                : 0;
            bVal =
              b.buys30d > 0
                ? (parseFloat(b.amountBoughtUsd30d) || 0) / b.buys30d
                : 0;
            break;
          case "sold":
            aVal = parseFloat(a.amountSoldUsd30d) || 0;
            bVal = parseFloat(b.amountSoldUsd30d) || 0;
            break;
          case "avgSell":
            aVal =
              a.sells30d > 0
                ? (parseFloat(a.amountSoldUsd30d) || 0) / a.sells30d
                : 0;
            bVal =
              b.sells30d > 0
                ? (parseFloat(b.amountSoldUsd30d) || 0) / b.sells30d
                : 0;
            break;
          case "pnl": {
            const aRemPnl = calculateRemaining(a.tokenBalance, a.tokenAmountBought30d, liveTokenPriceUsd, token?.decimals);
            aVal = ((parseFloat(a.amountSoldUsd30d) || 0) + aRemPnl.value) - (parseFloat(a.amountBoughtUsd30d) || 0);
            const bRemPnl = calculateRemaining(b.tokenBalance, b.tokenAmountBought30d, liveTokenPriceUsd, token?.decimals);
            bVal = ((parseFloat(b.amountSoldUsd30d) || 0) + bRemPnl.value) - (parseFloat(b.amountBoughtUsd30d) || 0);
            break;
          }
          case "remaining":
            const remA = calculateRemaining(
              a.tokenBalance,
              a.tokenAmountBought30d,
              liveTokenPriceUsd,
              token?.decimals,
            );
            const remB = calculateRemaining(
              b.tokenBalance,
              b.tokenAmountBought30d,
              liveTokenPriceUsd,
              token?.decimals,
            );
            aVal = remA.value;
            bVal = remB.value;
            break;
          default:
            aVal = 0;
            bVal = 0;
        }
        return (aVal - bVal) * direction;
      });
    }

    return result;
  }, [
    holdersWithBalances,
    filters,
    token,
    showRemainingInSol,
    chainPrice,
    walletFilter,
    liveTokenPriceUsd,
  ]);

  return (
    <div
      ref={tableRef}
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{ backgroundColor: AX.bg }}
    >
      {/* Bubblemap Toggle Button - Absolutely positioned */}
      <button
        onClick={
          isBubblemapVisible ? handleHideBubblemap : handleBubblemapClick
        }
        className="absolute top-8 right-0 z-20 flex h-6 w-6 cursor-pointer items-center justify-center rounded p-1 transition-opacity hover:opacity-80"
        style={{
          backgroundColor: `${AX.surface2}`,
          border: `1px solid ${AX.border}`,
          color: AX.text,
        }}
        title={isBubblemapVisible ? "Hide bubblemap" : "Show bubblemap"}
      >
        {isBubblemapVisible ? (
          <FiX size={14} />
        ) : (
          <MdOutlineBubbleChart size={14} />
        )}
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto pb-18">
        <table className="!font-geist w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-[#101114] !text-xs">
            <tr className="border-t border-b border-[#27282e]">
              {/* Wallet Column */}
              <th
                className="px-4 py-3 text-left font-medium whitespace-nowrap text-[#757e80]"
              >
                <div className="flex items-center gap-1">
                  <span className="text-[13px] font-normal">Wallet</span>
                </div>
              </th>

              {/* SOL Bal / Last Active */}
              <th
                className="px-2 py-3 text-left font-medium whitespace-nowrap !text-[#757e80]"
              >
                <div className="flex items-center gap-1 !text-[#757e80]">
                  <SortableHeader
                    label={chain === "monad" ? "MON Bal" : "SOL Bal"}
                    sortDirection={filters.solBal.sort}
                    onSort={() => handleSort("solBal")}
                  />
                  <span className='!text-[#757e80]'>/</span>
                  <SortableHeader
                    label="Last Active"
                    sortDirection={filters.lastActive.sort}
                    onSort={() => handleSort("lastActive")}
                  />
                </div>
              </th>

              {/* Bought / Avg MC (using Avg Buy for now) */}
              <th
                className="px-2 py-3 text-left font-medium whitespace-nowrap text-[#757e80]"
              >
                <div className="flex items-center gap-1">
                  <SortableHeader
                    label="Bought"
                    sortDirection={filters.bought.sort}
                    onSort={() => handleSort("bought")}
                  />
                  <span className='text-[#757e80]'>/</span>
                  <SortableHeader
                    label="Avg Buy"
                    sortDirection={filters.avgBuy.sort}
                    onSort={() => handleSort("avgBuy")}
                  />
                </div>
              </th>

              {/* Sold / Avg Sell */}
              <th
                className="px-2 py-3 text-left font-medium whitespace-nowrap text-[#757e80]"
              >
                <div className="flex items-center gap-1">
                  <SortableHeader
                    label="Sold"
                    sortDirection={filters.sold.sort}
                    onSort={() => handleSort("sold")}
                  />
                  <span className='text-[#757e80]'>/</span>
                  <SortableHeader
                    label="Avg Sell"
                    sortDirection={filters.avgSell.sort}
                    onSort={() => handleSort("avgSell")}
                  />
                </div>
              </th>

              {/* PNL (no arrows) */}
              <th
                className="px-2 py-3 text-left font-medium whitespace-nowrap text-[#757e80]"
              >
                <SortableHeader
                  label="PNL"
                  sortDirection={filters.pnl.sort}
                  onSort={() => handleSort("pnl")}
                />
              </th>

              {/* Remaining with USD/SOL toggle */}
              <th
                className="px-2 py-3 text-left font-medium whitespace-nowrap text-[#757e80]"
              >
                <div className="flex items-center gap-1">
                  <SortableHeader
                    label="Remaining"
                    sortDirection={filters.remaining.sort}
                    onSort={() => handleSort("remaining")}
                  />
                  <button
                    onClick={() => setShowRemainingInSol(!showRemainingInSol)}
                    className="ml-0.5 flex items-center gap-0.5 rounded p-0.5 transition-opacity hover:opacity-70 text-[#757e80]"
                    title={
                      showRemainingInSol
                        ? "Show in USD"
                        : `Show in ${chain === "monad" ? "MON" : "SOL"}`
                    }
                  >
                    <span className="text-[10px]">
                      {showRemainingInSol
                        ? chain === "monad"
                          ? "MON"
                          : "SOL"
                        : "USD"}
                    </span>
                    <RiExchangeDollarLine size={12} />
                  </button>
                </div>
              </th>

              {/* Funding / TF Amount */}
              <th
                className="px-2 py-3 text-left font-medium whitespace-nowrap text-[#757e80]"
                style={{ color: AX.muted }}
              >
                <div className="flex items-center gap-1">
                  <SortableHeader
                    label="Funding"
                    sortDirection={filters.funding.sort}
                    onSort={() => handleSort("funding")}
                  />
                  <span className='text-[#757e80]'>/</span>
                  <SortableHeader
                    label="TF Amt"
                    sortDirection={filters.tfAmount.sort}
                    onSort={() => handleSort("tfAmount")}
                  />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className='text-[13px]'>
            {/* BANDAID: stale-while-revalidate — only show the loading row when
                there are genuinely no rows yet. If we have rows, keep them on
                screen during background polls. Prevents the 15s flicker. */}
            {isLoading && sortedAndFilteredHolders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center">
                  <div className="animate-pulse">
                    <div className="text-sm text-neutral-400">
                      Loading holders...
                    </div>
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center">
                  <div className="text-sm text-red-400">{error}</div>
                </td>
              </tr>
            ) : sortedAndFilteredHolders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center">
                  <div className="text-sm text-neutral-400">
                    No holders data available
                  </div>
                </td>
              </tr>
            ) : (
              sortedAndFilteredHolders.map((holder, index) => {
                const boughtUsd = parseFloat(holder.amountBoughtUsd30d) || 0;
                const soldUsd = parseFloat(holder.amountSoldUsd30d) || 0;
                const avgBuyPrice =
                  holder.buys30d > 0 ? boughtUsd / holder.buys30d : 0;
                const avgSellPrice =
                  holder.sells30d > 0 ? soldUsd / holder.sells30d : 0;
                const remaining = calculateRemaining(
                  holder.tokenBalance,
                  holder.tokenAmountBought30d,
                  liveTokenPriceUsd,
                  token?.decimals,
                );
                const totalPnlUsd = (soldUsd + remaining.value) - boughtUsd;
                const totalPnlPct = boughtUsd > 0 ? (totalPnlUsd / boughtUsd) * 100 : 0;
                const totalPnlSol = chainPrice > 0 ? totalPnlUsd / chainPrice : 0;
                const funding = getFundingSource(holder.address, index);

                return (
                  <tr
                    key={holder.address}
                    className="transition-colors hover:brightness-110"
                    style={{
                      backgroundColor: index % 2 === 0 ? "#101114" : "#161719",
                    }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {(() => {
                          const walletKey = (
                            holder.address || ""
                          ).toLowerCase();
                          const walletData = walletDataMap.get(walletKey);

                          // Build hover card data - use existing data or create from holder info
                          const hoverData: WalletHoverCardData = walletData || {
                            walletAddress: holder.address,
                            totalBoughtUsd:
                              parseFloat(holder.amountBoughtUsd30d) || 0,
                            totalSoldUsd:
                              parseFloat(holder.amountSoldUsd30d) || 0,
                            buyCount: holder.buys30d,
                            sellCount: holder.sells30d,
                            remainingTokens:
                              parseFloat(holder.tokenBalance) || 0,
                            solBalance: holder.solBalance ?? undefined,
                            holderType: holder.holderType,
                          };

                          return (
                            <WalletHoverCard data={hoverData} chain={chain} solPrice={chainPrice}>
                              <div className="flex items-center gap-1.5">
                                <a
                                  href={`https://solscan.io/account/${holder.address}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded-full bg-[#757E80] p-1"
                                >
                                  <SiSolana
                                    size={8}
                                    className="flex-shrink-0 text-black"
                                  />
                                </a>
                                <span className="!font-geist cursor-pointer text-[13px] text-gray-300 transition-colors hover:text-emerald-400">
                                  {shortAddr(holder.address)}
                                </span>
                                {/* Holder type icons */}
                                {holder.holderType === "dev" && (
                                  <LuChefHat
                                    size={12}
                                    className="flex-shrink-0 text-yellow-400"
                                  />
                                )}
                                {holder.holderType === "sniper" && (
                                  <TfiTarget
                                    size={12}
                                    className="flex-shrink-0 text-red-400"
                                  />
                                )}
                                {holder.holderType === "bundler" && (
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
                      <div className="flex items-center gap-1.5">
                        <SolanaIcon size={12} />
                        <span
                          className="text-[13px]"
                          style={{ color: AX.text }}
                        >
                          {holder.isLoadingBalance ? (
                            <span style={{ color: AX.muted }}>...</span>
                          ) : holder.solBalance !== null ? (
                            formatSmartNumber(holder.solBalance)
                          ) : (
                            <span style={{ color: AX.muted }}>N/A</span>
                          )}
                        </span>
                        <span className="text-[10px] text-[#757e80]">
                          ({getTimeAgo(holder.lastTransactionAt)})
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-col">
                        <span
                          className="text-[13px]"
                          style={{ color: boughtUsd > 0 ? AX.mint : AX.text }}
                        >
                          {formatUsd(boughtUsd)}
                        </span>
                        <span className="text-xs text-[#757e80]">
                          {formatNumber(holder.tokenAmountBought30d)} /{" "}
                          {holder.buys30d}
                          {avgBuyPrice > 0 && ` (${formatUsd(avgBuyPrice)})`}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-col">
                        <span
                          className="text-[13px]"
                          style={{ color: soldUsd > 0 ? AX.sell : AX.text }}
                        >
                          {formatUsd(soldUsd)}
                        </span>
                        <span className="text-xs text-[#757e80]">
                          {formatNumber(holder.tokenAmountSold30d)} /{" "}
                          {holder.sells30d}
                          {avgSellPrice > 0 && ` (${formatUsd(avgSellPrice)})`}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-col">
                        <span
                          className="text-[13px] font-medium"
                          style={{
                            color: totalPnlUsd >= 0 ? AX.mint : AX.sell,
                          }}
                        >
                          {totalPnlUsd >= 0 ? "+" : ""}
                          {formatUsd(totalPnlUsd)}
                        </span>
                        <span className="text-xs text-[#757e80]">
                          {formatSmartNumber(totalPnlPct)}% · {totalPnlSol >= 0 ? "+" : ""}{formatSmartNumber(totalPnlSol)} SOL
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          {showRemainingInSol ? (
                            <div className="flex items-center gap-0.5">
                              <SolanaIcon size={10} />
                              <span className="text-[13px] text-[#c4cccc]">
                                {chainPrice > 0
                                  ? formatSmartNumber(remaining.value / chainPrice)
                                  : "0"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[13px] text-[#c4cccc]">
                              {formatUsd(remaining.value)}
                            </span>
                          )}
                          <span className="rounded bg-[#26282b] px-1 py-0.5 text-[9px] text-[#c4cccc]">
                            {formatPercentage(remaining.percentage)}
                          </span>
                        </div>
                        <div
                          className="h-0.5 overflow-hidden rounded-full"
                          style={{ backgroundColor: `${AX.border}40` }}
                        >
                          <div
                            className="h-full rounded-full bg-[#c4cccc] transition-all"
                            style={{
                              width: `${Math.min(remaining.percentage, 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-col">
                        {funding.sourceAddress ? (
                          <a
                            href={
                              chain === "monad"
                                ? `https://testnet.monadexplorer.com/address/${funding.sourceAddress}`
                                : `https://solscan.io/account/${funding.sourceAddress}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 transition-colors hover:text-emerald-400 hover:underline"
                            style={{ color: AX.text }}
                          >
                            <span className="!font-geist text-[13px]">
                              {funding.source}
                            </span>
                            <div className="ml-1 rounded-full bg-[#757E80] p-0.5">
                              <SiSolana
                                size={8}
                                className="flex-shrink-0 text-black"
                              />
                            </div>
                          </a>
                        ) : (
                          <span
                            className="!font-geist text-[13px]"
                            style={{ color: AX.text }}
                          >
                            {funding.source}
                          </span>
                        )}
                        <div className="flex items-center gap-1 text-xs text-[#757e80]">
                          <span>{formatFundingAge(funding.timeAgo)}</span>
                          <span>•</span>
                          <SolanaIcon size={10} />
                          <span>{funding.solAmount.toFixed(2)}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
            {/* Bottom padding row for scroll space */}
            <tr>
              <td colSpan={8} className="h-16" />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Filter Popout */}
      {activeFilterPopout && (
        <FilterPopout
          isOpen={true}
          onClose={() => setActiveFilterPopout(null)}
          title={getFilterTitle(activeFilterPopout)}
          unit={getFilterUnit(activeFilterPopout)}
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
    </div>
  );
};

export default HoldersTable;
