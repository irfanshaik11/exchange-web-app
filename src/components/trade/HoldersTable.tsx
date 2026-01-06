import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FiExternalLink, FiX } from 'react-icons/fi';
import { FaFilter, FaCaretDown } from 'react-icons/fa';
import { RiExchangeDollarLine } from 'react-icons/ri';
import { MdOutlineBubbleChart, MdRefresh } from 'react-icons/md';
import useCodexHolders from '../../hooks/useCodexHolders';
import useSolanaTokenWebSocket, { type SolanaTokenHolder } from '../../hooks/useSolanaTokenWebSocket';
import useMonadHolders, { type MonadHolder } from '../../hooks/useMonadHolders';
import { getWalletSolBalance } from '../../utils/walletTracking';
import { useSolPrice } from '../SolPriceContext';
import type { Token } from '~/utils/db';

// Official Solana logo component (imported from Footer pattern)
const SolanaIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 397.7 311.7" fill="currentColor">
    <defs>
      <linearGradient id="solanaGradientHolders" x1="360.8791" y1="351.4553" x2="141.213" y2="-69.2936" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#00FFA3" />
        <stop offset="1" stopColor="#DC1FFF" />
      </linearGradient>
      <linearGradient id="solanaGradient2Holders" x1="264.8291" y1="401.6014" x2="45.163" y2="-19.1475" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#00FFA3" />
        <stop offset="1" stopColor="#DC1FFF" />
      </linearGradient>
      <linearGradient id="solanaGradient3Holders" x1="312.5484" y1="376.688" x2="92.8822" y2="-44.061" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#00FFA3" />
        <stop offset="1" stopColor="#DC1FFF" />
      </linearGradient>
    </defs>
    <path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z" fill="url(#solanaGradientHolders)" />
    <path d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z" fill="url(#solanaGradient2Holders)" />
    <path d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z" fill="url(#solanaGradient3Holders)" />
  </svg>
);

// Sort direction type
type SortDirection = 'asc' | 'desc' | null;

// Filter range type
interface FilterRange {
  min: string;
  max: string;
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
  chain?: 'sol' | 'monad'; // Chain to determine which endpoint to use
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
}

function getTimeAgo(timestamp: number): string {
  if (!timestamp) return 'N/A';
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
  if (!addr) return '';
  return addr.slice(0, 8) + '...' + addr.slice(-4);
}

function formatUsd(value: string | number | null | undefined): string {
  if (!value) return '$0';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(num) || num === 0) return '$0';
  if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
  return `$${num.toFixed(2)}`;
}

function formatNumber(value: string | number | null | undefined): string {
  if (!value) return '0';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(num) || num === 0) return '0';
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toFixed(2);
}

function formatPercentage(value: number | null | undefined): string {
  if (!value || !Number.isFinite(value) || value === 0) return '0%';
  if (value < 0.01) return value.toFixed(3) + '%';
  if (value < 1) return value.toFixed(2) + '%';
  return value.toFixed(2) + '%';
}

// Convert funding age to hours (if < 24h) or days format
function formatFundingAge(timeAgo: string): string {
  if (!timeAgo) return 'N/A';

  // Parse the time string and convert to hours
  const match = timeAgo.match(/^(\d+)(s|m|h|d|mo|y)$/i);
  if (!match) return timeAgo;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  let totalHours = 0;
  switch (unit) {
    case 's': totalHours = value / 3600; break;
    case 'm': totalHours = value / 60; break;
    case 'h': totalHours = value; break;
    case 'd': totalHours = value * 24; break;
    case 'mo': totalHours = value * 30 * 24; break;
    case 'y': totalHours = value * 365 * 24; break;
    default: return timeAgo;
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
  currentPrice?: number,
  marketCapUsd?: number,
  decimals?: number
): { value: number; percentage: number } {
  if (!currentPrice || currentPrice <= 0 || !marketCapUsd || marketCapUsd <= 0) {
    return { value: 0, percentage: 0 };
  }
  
  const balance = parseFloat(tokenBalance) || 0;
  if (balance === 0) return { value: 0, percentage: 0 };
  
  // Adjust balance for decimals if needed
  let adjustedBalance = balance;
  if (decimals && balance > 0 && balance > 1e15) {
    adjustedBalance = balance / Math.pow(10, decimals);
  }
  
  // Calculate current USD value of remaining tokens
  const currentValue = adjustedBalance * currentPrice;
  
  // Calculate percentage of market cap
  const percentage = (currentValue / marketCapUsd) * 100;
  
  return { value: currentValue, percentage };
}

function getFundingSource(address: string, index: number): { source: string; sourceAddress: string | null; timeAgo: string; solAmount: number } {
  // Generate placeholder funding data
  // sourceAddress is the full address for links, source is the display name
  const sources = [
    { source: shortAddr(address), sourceAddress: address, timeAgo: '21h', solAmount: 0.023 },
    { source: shortAddr(address), sourceAddress: address, timeAgo: '3mo', solAmount: 0.022 },
    { source: 'Kucoin', sourceAddress: null, timeAgo: '3y', solAmount: 1 }, // Exchange, no direct link
    { source: shortAddr(address), sourceAddress: address, timeAgo: '3d', solAmount: 10.22 },
  ];

  return sources[index % sources.length];
}

function calculateUnrealizedPnL(
  tokenBalance: string,
  tokenAcquisitionCostUsd: string,
  currentPrice?: number,
  decimals?: number
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
        minWidth: '280px',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium" style={{ color: AX.text }}>{title}</span>
          <button onClick={onClose} className="p-1 rounded hover:bg-opacity-20" style={{ color: AX.muted }}>
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
                if (val === '' || /^-?\d*\.?\d*$/.test(val)) {
                  onRangeChange({ ...range, min: val });
                }
              }}
              className="w-full px-3 py-2 text-sm rounded border"
              style={{
                backgroundColor: AX.surface2,
                borderColor: AX.border,
                color: AX.text,
                outline: 'none',
              }}
            />
            <div
              className="text-center text-xs mt-1 px-2 py-1 rounded"
              style={{ backgroundColor: AX.surface2, color: AX.muted }}
            >
              {unit}
            </div>
          </div>
          <span className="text-sm" style={{ color: AX.muted }}>to</span>
          <div className="flex-1">
            <input
              type="text"
              inputMode="decimal"
              placeholder="Max"
              value={range.max}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^-?\d*\.?\d*$/.test(val)) {
                  onRangeChange({ ...range, max: val });
                }
              }}
              className="w-full px-3 py-2 text-sm rounded border"
              style={{
                backgroundColor: AX.surface2,
                borderColor: AX.border,
                color: AX.text,
                outline: 'none',
              }}
            />
            <div
              className="text-center text-xs mt-1 px-2 py-1 rounded"
              style={{ backgroundColor: AX.surface2, color: AX.muted }}
            >
              {unit}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={onReset}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded hover:opacity-80 transition-opacity"
            style={{ color: AX.muted }}
          >
            <MdRefresh size={14} />
            Reset
          </button>
          <button
            onClick={onApply}
            className="px-4 py-1.5 text-sm rounded font-medium transition-colors"
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
      className="flex items-center gap-0.5 hover:opacity-80 transition-opacity cursor-pointer"
      style={{ color: sortDirection ? AX.mint : AX.muted }}
    >
      <span className="text-[11px]">{label}</span>
      <FaCaretDown
        size={8}
        style={{
          transform: sortDirection === 'asc' ? 'rotate(180deg)' : 'rotate(0deg)',
          opacity: sortDirection ? 1 : 0.5,
        }}
      />
    </button>
    {hasFilter && (
      <button
        onClick={onFilterClick}
        className="p-0.5 rounded hover:bg-opacity-20 transition-colors"
        style={{ color: isFilterActive ? AX.mint : AX.muted }}
      >
        <FaFilter size={8} />
      </button>
    )}
  </div>
);

const HoldersTable: React.FC<HoldersTableProps> = ({
  token,
  onBubblemapToggle,
  isBubblemapVisible = false,
  containerWidth = 1000,
  chain = 'sol',
}) => {
  // Get SOL price for USD/SOL conversion
  const { solPrice, monPrice } = useSolPrice();
  const chainPrice = chain === 'monad' ? monPrice : solPrice;

  // USD/SOL toggle state for Remaining column
  const [showRemainingInSol, setShowRemainingInSol] = useState(false);

  // Filter states
  const initialFilters: ColumnFilters = {
    solBal: { sort: null, range: { min: '', max: '' } },
    lastActive: { sort: null, range: { min: '', max: '' } },
    bought: { sort: null, range: { min: '', max: '' } },
    avgBuy: { sort: null, range: { min: '', max: '' } },
    sold: { sort: null, range: { min: '', max: '' } },
    avgSell: { sort: null, range: { min: '', max: '' } },
    pnl: { sort: null, range: { min: '', max: '' } },
    remaining: { sort: null, range: { min: '', max: '' } },
    funding: { sort: null, range: { min: '', max: '' } },
    tfAmount: { sort: null, range: { min: '', max: '' } },
  };
  const [filters, setFilters] = useState<ColumnFilters>(initialFilters);
  const [activeFilterPopout, setActiveFilterPopout] = useState<keyof ColumnFilters | null>(null);
  const [filterPopoutPosition, setFilterPopoutPosition] = useState({ top: 0, left: 0 });
  const [tempFilterRange, setTempFilterRange] = useState<FilterRange>({ min: '', max: '' });

  // Use Solana WebSocket for holders (Solana chain)
  const { holders: wsHolders, loading: wsLoading } = useSolanaTokenWebSocket({
    mintAddress: token?.mint,
    enabled: chain === 'sol' && !!token?.mint,
  });

  // Use Monad hook for holders (Monad chain)
  const { holders: monadHolders, isLoading: monadLoading, error: monadError } = useMonadHolders(
    token?.mint,
    { enabled: chain === 'monad' && !!token?.mint }
  );

  // Fallback to Codex if WebSocket holders are empty (Solana only)
  const { holders: codexHolders, isLoading: codexLoading, error: codexError } = useCodexHolders(
    chain === 'sol' ? token?.mint : undefined
  );

  // Prefer WebSocket holders, fall back to Codex (Solana only)
  // Only use WebSocket data if it's not loading AND has data
  const wsFinished = !wsLoading;
  const useWebSocketData = chain === 'sol' && wsFinished && wsHolders && wsHolders.length > 0;
  // Loading state based on chain
  const isLoading = chain === 'sol'
    ? (wsLoading || (!useWebSocketData && codexLoading))
    : monadLoading;
  const error = chain === 'sol'
    ? (useWebSocketData ? null : codexError)
    : monadError;

  const [holdersWithBalances, setHoldersWithBalances] = useState<HolderWithBalance[]>([]);
  const tableRef = useRef<HTMLDivElement>(null);

  // Handle sort toggle
  const handleSort = useCallback((column: keyof ColumnFilters) => {
    setFilters(prev => {
      const currentSort = prev[column].sort;
      const newSort: SortDirection = currentSort === null ? 'desc' : currentSort === 'desc' ? 'asc' : null;
      // Reset other sorts
      const newFilters = { ...initialFilters };
      Object.keys(newFilters).forEach(key => {
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
  const handleFilterClick = useCallback((column: keyof ColumnFilters, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setFilterPopoutPosition({ top: rect.bottom + 8, left: Math.max(8, rect.left - 100) });
    setTempFilterRange(filters[column].range);
    setActiveFilterPopout(activeFilterPopout === column ? null : column);
  }, [activeFilterPopout, filters]);

  // Handle filter apply
  const handleFilterApply = useCallback(() => {
    if (activeFilterPopout) {
      setFilters(prev => ({
        ...prev,
        [activeFilterPopout]: { ...prev[activeFilterPopout], range: tempFilterRange },
      }));
      setActiveFilterPopout(null);
    }
  }, [activeFilterPopout, tempFilterRange]);

  // Handle filter reset
  const handleFilterReset = useCallback(() => {
    setTempFilterRange({ min: '', max: '' });
    if (activeFilterPopout) {
      setFilters(prev => ({
        ...prev,
        [activeFilterPopout]: { ...prev[activeFilterPopout], range: { min: '', max: '' } },
      }));
    }
  }, [activeFilterPopout]);

  // Close filter popout when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setActiveFilterPopout(null);
    if (activeFilterPopout) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [activeFilterPopout]);

  // Check if a filter has active range
  const hasActiveRange = useCallback((range: FilterRange) => {
    return range.min !== '' || range.max !== '';
  }, []);

  // Convert holders to HolderWithBalance format based on chain
  const normalizedHolders = useMemo(() => {
    if (chain === 'monad' && monadHolders && monadHolders.length > 0) {
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
    } else if (useWebSocketData && wsHolders) {
      // Use Solana WebSocket holders data
      return wsHolders.map((h: SolanaTokenHolder) => ({
        address: h.wallet_address,
        lastTransactionAt: h.last_activity_at ? Math.floor(new Date(h.last_activity_at).getTime() / 1000) : 0,
        solBalance: null,
        isLoadingBalance: true,
        // Convert SOL amounts to USD (approximate, using SOL price ~$200)
        amountBoughtUsd30d: String(h.total_bought_sol * 200),
        amountSoldUsd30d: String(h.total_sold_sol * 200),
        tokenAmountBought30d: String(h.total_bought_tokens),
        tokenAmountSold30d: String(h.total_sold_tokens),
        tokenAcquisitionCostUsd: String(h.total_bought_sol * 200),
        tokenBalance: String(h.remaining_tokens),
        buys30d: h.buy_count,
        sells30d: h.sell_count,
      }));
    } else if (chain === 'sol' && codexHolders && codexHolders.length > 0) {
      // Use Codex holders data (Solana fallback)
      return codexHolders.map(h => ({
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
  }, [chain, monadHolders, useWebSocketData, wsHolders, codexHolders]);

  // Fetch SOL balances for holders (only for Solana chain)
  useEffect(() => {
    if (normalizedHolders.length === 0) {
      setHoldersWithBalances([]);
      return;
    }

    // Initialize with holders data
    setHoldersWithBalances(normalizedHolders);

    // Skip balance fetching for Monad (already included in data)
    if (chain === 'monad') {
      return;
    }

    // Fetch balances in batches to avoid overwhelming the API (Solana only)
    const fetchBalances = async () => {
      const batchSize = 5;
      for (let i = 0; i < normalizedHolders.length; i += batchSize) {
        const batch = normalizedHolders.slice(i, i + batchSize);
        const balancePromises = batch.map(async (holder) => {
          try {
            const balance = await getWalletSolBalance(holder.address);
            return { address: holder.address, balance };
          } catch (error) {
            console.error(`Failed to fetch balance for ${holder.address}:`, error);
            return { address: holder.address, balance: null };
          }
        });

        const results = await Promise.all(balancePromises);

        setHoldersWithBalances(prev =>
          prev.map(h => {
            const result = results.find(r => r.address === h.address);
            if (result) {
              return {
                ...h,
                solBalance: result.balance,
                isLoadingBalance: false,
              };
            }
            return h;
          })
        );

        // Small delay between batches to avoid rate limiting
        if (i + batchSize < normalizedHolders.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
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
      solBal: chain === 'monad' ? 'MON Balance' : 'SOL Bal',
      lastActive: 'Last Active',
      bought: 'Bought',
      avgBuy: 'Avg Buy',
      sold: 'Sold',
      avgSell: 'Avg Sell',
      pnl: 'PNL',
      remaining: 'Remaining',
      funding: 'Funding',
      tfAmount: 'TF Amount',
    };
    return titles[column];
  };

  // Get filter unit based on column
  const getFilterUnit = (column: keyof ColumnFilters): string => {
    const units: Record<keyof ColumnFilters, string> = {
      solBal: chain === 'monad' ? 'MON' : 'SOL',
      lastActive: 'hours',
      bought: 'USD',
      avgBuy: 'USD',
      sold: 'USD',
      avgSell: 'USD',
      pnl: 'USD',
      remaining: showRemainingInSol ? (chain === 'monad' ? 'MON' : 'SOL') : 'USD',
      funding: chain === 'monad' ? 'MON' : 'SOL',
      tfAmount: chain === 'monad' ? 'MON' : 'SOL',
    };
    return units[column];
  };

  // Sorting and filtering logic
  const sortedAndFilteredHolders = useMemo(() => {
    let result = [...holdersWithBalances];

    // Apply range filters
    Object.entries(filters).forEach(([key, filter]) => {
      const range = filter.range;
      if (range.min !== '' || range.max !== '') {
        const minVal = range.min !== '' ? parseFloat(range.min) : -Infinity;
        const maxVal = range.max !== '' ? parseFloat(range.max) : Infinity;

        result = result.filter(holder => {
          let value: number;
          switch (key) {
            case 'solBal':
              value = holder.solBalance ?? 0;
              break;
            case 'lastActive':
              value = (Date.now() / 1000 - holder.lastTransactionAt) / 3600; // hours
              break;
            case 'bought':
              value = parseFloat(holder.amountBoughtUsd30d) || 0;
              break;
            case 'avgBuy':
              const buys = holder.buys30d || 1;
              value = (parseFloat(holder.amountBoughtUsd30d) || 0) / buys;
              break;
            case 'sold':
              value = parseFloat(holder.amountSoldUsd30d) || 0;
              break;
            case 'avgSell':
              const sells = holder.sells30d || 1;
              value = (parseFloat(holder.amountSoldUsd30d) || 0) / sells;
              break;
            case 'pnl':
              value = calculateUnrealizedPnL(holder.tokenBalance, holder.tokenAcquisitionCostUsd, token?.usd_price, token?.decimals);
              break;
            case 'remaining':
              const rem = calculateRemaining(holder.tokenBalance, token?.usd_price, token?.market_cap_usd, token?.decimals);
              value = showRemainingInSol && chainPrice > 0 ? rem.value / chainPrice : rem.value;
              break;
            default:
              value = 0;
          }
          return value >= minVal && value <= maxVal;
        });
      }
    });

    // Apply sorting
    const sortColumn = Object.entries(filters).find(([, f]) => f.sort !== null);
    if (sortColumn) {
      const [key, filter] = sortColumn;
      const direction = filter.sort === 'asc' ? 1 : -1;

      result.sort((a, b) => {
        let aVal: number, bVal: number;
        switch (key) {
          case 'solBal':
            aVal = a.solBalance ?? 0;
            bVal = b.solBalance ?? 0;
            break;
          case 'lastActive':
            aVal = a.lastTransactionAt;
            bVal = b.lastTransactionAt;
            break;
          case 'bought':
            aVal = parseFloat(a.amountBoughtUsd30d) || 0;
            bVal = parseFloat(b.amountBoughtUsd30d) || 0;
            break;
          case 'avgBuy':
            aVal = a.buys30d > 0 ? (parseFloat(a.amountBoughtUsd30d) || 0) / a.buys30d : 0;
            bVal = b.buys30d > 0 ? (parseFloat(b.amountBoughtUsd30d) || 0) / b.buys30d : 0;
            break;
          case 'sold':
            aVal = parseFloat(a.amountSoldUsd30d) || 0;
            bVal = parseFloat(b.amountSoldUsd30d) || 0;
            break;
          case 'avgSell':
            aVal = a.sells30d > 0 ? (parseFloat(a.amountSoldUsd30d) || 0) / a.sells30d : 0;
            bVal = b.sells30d > 0 ? (parseFloat(b.amountSoldUsd30d) || 0) / b.sells30d : 0;
            break;
          case 'pnl':
            aVal = calculateUnrealizedPnL(a.tokenBalance, a.tokenAcquisitionCostUsd, token?.usd_price, token?.decimals);
            bVal = calculateUnrealizedPnL(b.tokenBalance, b.tokenAcquisitionCostUsd, token?.usd_price, token?.decimals);
            break;
          case 'remaining':
            const remA = calculateRemaining(a.tokenBalance, token?.usd_price, token?.market_cap_usd, token?.decimals);
            const remB = calculateRemaining(b.tokenBalance, token?.usd_price, token?.market_cap_usd, token?.decimals);
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
  }, [holdersWithBalances, filters, token, showRemainingInSol, chainPrice]);

  return (
    <div
      ref={tableRef}
      className="flex-1 min-h-0 flex flex-col overflow-hidden"
      style={{ backgroundColor: AX.bg }}
    >
      <div className="flex-1 overflow-y-auto min-h-0 pb-18">
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <thead className="sticky top-0 z-10" style={{ backgroundColor: '#101114' }}>
            <tr style={{ borderBottom: '1px solid #27282e' }}>
              {/* Wallet Column */}
              <th className="px-2 py-1.5 text-left text-[11px] font-medium whitespace-nowrap" style={{ color: AX.muted }}>
                <span>Wallet</span>
              </th>

              {/* SOL Bal / Last Active */}
              <th className="px-2 py-1.5 text-left text-[11px] font-medium whitespace-nowrap" style={{ color: AX.muted }}>
                <div className="flex items-center gap-1">
                  <SortableHeader
                    label={chain === 'monad' ? 'MON Bal' : 'SOL Bal'}
                    sortDirection={filters.solBal.sort}
                    onSort={() => handleSort('solBal')}
                    hasFilter
                    onFilterClick={(e) => handleFilterClick('solBal', e)}
                    isFilterActive={hasActiveRange(filters.solBal.range)}
                  />
                  <span style={{ color: AX.muted }}>/</span>
                  <SortableHeader
                    label="Last Active"
                    sortDirection={filters.lastActive.sort}
                    onSort={() => handleSort('lastActive')}
                    hasFilter
                    onFilterClick={(e) => handleFilterClick('lastActive', e)}
                    isFilterActive={hasActiveRange(filters.lastActive.range)}
                  />
                </div>
              </th>

              {/* Bought / Avg MC (using Avg Buy for now) */}
              <th className="px-2 py-1.5 text-left text-[11px] font-medium whitespace-nowrap" style={{ color: AX.muted }}>
                <div className="flex items-center gap-1">
                  <SortableHeader
                    label="Bought"
                    sortDirection={filters.bought.sort}
                    onSort={() => handleSort('bought')}
                    hasFilter
                    onFilterClick={(e) => handleFilterClick('bought', e)}
                    isFilterActive={hasActiveRange(filters.bought.range)}
                  />
                  <span style={{ color: AX.muted }}>/</span>
                  <SortableHeader
                    label="Avg Buy"
                    sortDirection={filters.avgBuy.sort}
                    onSort={() => handleSort('avgBuy')}
                    hasFilter
                    onFilterClick={(e) => handleFilterClick('avgBuy', e)}
                    isFilterActive={hasActiveRange(filters.avgBuy.range)}
                  />
                </div>
              </th>

              {/* Sold / Avg Sell */}
              <th className="px-2 py-1.5 text-left text-[11px] font-medium whitespace-nowrap" style={{ color: AX.muted }}>
                <div className="flex items-center gap-1">
                  <SortableHeader
                    label="Sold"
                    sortDirection={filters.sold.sort}
                    onSort={() => handleSort('sold')}
                    hasFilter
                    onFilterClick={(e) => handleFilterClick('sold', e)}
                    isFilterActive={hasActiveRange(filters.sold.range)}
                  />
                  <span style={{ color: AX.muted }}>/</span>
                  <SortableHeader
                    label="Avg Sell"
                    sortDirection={filters.avgSell.sort}
                    onSort={() => handleSort('avgSell')}
                    hasFilter
                    onFilterClick={(e) => handleFilterClick('avgSell', e)}
                    isFilterActive={hasActiveRange(filters.avgSell.range)}
                  />
                </div>
              </th>

              {/* PNL (no arrows) */}
              <th className="px-2 py-1.5 text-left text-[11px] font-medium whitespace-nowrap" style={{ color: AX.muted }}>
                <SortableHeader
                  label="PNL"
                  sortDirection={filters.pnl.sort}
                  onSort={() => handleSort('pnl')}
                  hasFilter
                  onFilterClick={(e) => handleFilterClick('pnl', e)}
                  isFilterActive={hasActiveRange(filters.pnl.range)}
                />
              </th>

              {/* Remaining with USD/SOL toggle */}
              <th className="px-2 py-1.5 text-left text-[11px] font-medium whitespace-nowrap" style={{ color: AX.muted }}>
                <div className="flex items-center gap-1">
                  <SortableHeader
                    label="Remaining"
                    sortDirection={filters.remaining.sort}
                    onSort={() => handleSort('remaining')}
                    hasFilter
                    onFilterClick={(e) => handleFilterClick('remaining', e)}
                    isFilterActive={hasActiveRange(filters.remaining.range)}
                  />
                  <button
                    onClick={() => setShowRemainingInSol(!showRemainingInSol)}
                    className="flex items-center gap-0.5 p-0.5 rounded hover:opacity-70 transition-opacity ml-0.5"
                    style={{ color: AX.muted }}
                    title={showRemainingInSol ? 'Show in USD' : `Show in ${chain === 'monad' ? 'MON' : 'SOL'}`}
                  >
                    <span className="text-[10px]">
                      {showRemainingInSol ? (chain === 'monad' ? 'MON' : 'SOL') : 'USD'}
                    </span>
                    <RiExchangeDollarLine size={12} />
                  </button>
                </div>
              </th>

              {/* Funding / TF Amount */}
              <th className="px-2 py-1.5 text-left text-[11px] font-medium whitespace-nowrap" style={{ color: AX.muted }}>
                <div className="flex items-center gap-1">
                  <SortableHeader
                    label="Funding"
                    sortDirection={filters.funding.sort}
                    onSort={() => handleSort('funding')}
                    hasFilter
                    onFilterClick={(e) => handleFilterClick('funding', e)}
                    isFilterActive={hasActiveRange(filters.funding.range)}
                  />
                  <span style={{ color: AX.muted }}>/</span>
                  <SortableHeader
                    label="TF Amt"
                    sortDirection={filters.tfAmount.sort}
                    onSort={() => handleSort('tfAmount')}
                    hasFilter
                    onFilterClick={(e) => handleFilterClick('tfAmount', e)}
                    isFilterActive={hasActiveRange(filters.tfAmount.range)}
                  />
                </div>
              </th>

              {/* Bubblemap Toggle */}
              <th className="px-1 py-1.5 text-right" style={{ color: AX.muted }}>
                {isBubblemapVisible ? (
                  <button
                    onClick={handleHideBubblemap}
                    className="p-0.5 rounded hover:bg-opacity-20 transition-colors"
                    style={{ color: AX.muted }}
                    title="Hide bubblemap"
                  >
                    <FiX size={14} />
                  </button>
                ) : (
                  <button
                    onClick={handleBubblemapClick}
                    className="p-0.5 rounded hover:bg-opacity-20 transition-colors"
                    style={{ color: AX.muted }}
                    title="Show bubblemap"
                  >
                    <MdOutlineBubbleChart size={14} />
                  </button>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center">
                  <div className="animate-pulse">
                    <div className="text-neutral-400 text-sm">Loading holders...</div>
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center">
                  <div className="text-red-400 text-sm">{error}</div>
                </td>
              </tr>
            ) : sortedAndFilteredHolders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center">
                  <div className="text-neutral-400 text-sm">No holders data available</div>
                </td>
              </tr>
            ) : (
              sortedAndFilteredHolders.map((holder, index) => {
                const boughtUsd = parseFloat(holder.amountBoughtUsd30d) || 0;
                const soldUsd = parseFloat(holder.amountSoldUsd30d) || 0;
                const avgBuyPrice = holder.buys30d > 0 ? boughtUsd / holder.buys30d : 0;
                const avgSellPrice = holder.sells30d > 0 ? soldUsd / holder.sells30d : 0;
                const unrealizedPnL = calculateUnrealizedPnL(
                  holder.tokenBalance,
                  holder.tokenAcquisitionCostUsd,
                  token?.usd_price,
                  token?.decimals
                );
                const remaining = calculateRemaining(
                  holder.tokenBalance,
                  token?.usd_price,
                  token?.market_cap_usd,
                  token?.decimals
                );
                const funding = getFundingSource(holder.address, index);

                return (
                  <tr
                    key={holder.address}
                    className="transition-colors hover:brightness-110"
                    style={{
                      backgroundColor: index % 2 === 0 ? '#101114' : '#161719',
                    }}
                  >
                    <td className="px-2 py-1.5">
                      <a
                        href={chain === 'monad'
                          ? `https://testnet.monadexplorer.com/address/${holder.address}`
                          : `https://solscan.io/account/${holder.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 transition-colors hover:text-emerald-400 hover:underline"
                        style={{ color: AX.text }}
                      >
                        <span className="text-[11px] font-mono">{shortAddr(holder.address)}</span>
                        <FiExternalLink size={10} style={{ color: AX.muted }} />
                      </a>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <SolanaIcon size={12} />
                        <span className="text-[11px]" style={{ color: AX.text }}>
                          {holder.isLoadingBalance ? (
                            <span style={{ color: AX.muted }}>...</span>
                          ) : holder.solBalance !== null ? (
                            holder.solBalance.toFixed(3)
                          ) : (
                            <span style={{ color: AX.muted }}>N/A</span>
                          )}
                        </span>
                        <span className="text-[10px]" style={{ color: AX.muted }}>
                          ({getTimeAgo(holder.lastTransactionAt)})
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex flex-col">
                        <span className="text-[11px]" style={{ color: boughtUsd > 0 ? AX.mint : AX.text }}>
                          {formatUsd(boughtUsd)}
                        </span>
                        <span className="text-[10px]" style={{ color: AX.muted }}>
                          {formatNumber(holder.tokenAmountBought30d)} / {holder.buys30d}
                          {avgBuyPrice > 0 && ` (${formatUsd(avgBuyPrice)})`}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex flex-col">
                        <span className="text-[11px]" style={{ color: soldUsd > 0 ? AX.sell : AX.text }}>
                          {formatUsd(soldUsd)}
                        </span>
                        <span className="text-[10px]" style={{ color: AX.muted }}>
                          {formatNumber(holder.tokenAmountSold30d)} / {holder.sells30d}
                          {avgSellPrice > 0 && ` (${formatUsd(avgSellPrice)})`}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <span
                        className="text-[11px] font-medium"
                        style={{ color: unrealizedPnL >= 0 ? AX.mint : AX.sell }}
                      >
                        {unrealizedPnL >= 0 ? '+' : ''}{formatUsd(unrealizedPnL)}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          {showRemainingInSol ? (
                            <div className="flex items-center gap-0.5">
                              <SolanaIcon size={10} />
                              <span className="text-[11px]" style={{ color: AX.mint }}>
                                {chainPrice > 0 ? (remaining.value / chainPrice).toFixed(4) : '0'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[11px]" style={{ color: AX.mint }}>
                              {formatUsd(remaining.value)}
                            </span>
                          )}
                          <span
                            className="text-[9px] px-1 py-0.5 rounded"
                            style={{
                              backgroundColor: `${AX.surface2}80`,
                              color: AX.muted
                            }}
                          >
                            {formatPercentage(remaining.percentage)}
                          </span>
                        </div>
                        <div
                          className="h-0.5 rounded-full overflow-hidden"
                          style={{ backgroundColor: `${AX.border}40` }}
                        >
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(remaining.percentage, 100)}%`,
                              backgroundColor: '#3B82F6'
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex flex-col">
                        {funding.sourceAddress ? (
                          <a
                            href={chain === 'monad'
                              ? `https://testnet.monadexplorer.com/address/${funding.sourceAddress}`
                              : `https://solscan.io/account/${funding.sourceAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 transition-colors hover:text-emerald-400 hover:underline"
                            style={{ color: AX.text }}
                          >
                            <span className="text-[11px] font-mono">{funding.source}</span>
                            <FiExternalLink size={10} style={{ color: AX.muted }} />
                          </a>
                        ) : (
                          <span className="text-[11px] font-mono" style={{ color: AX.text }}>
                            {funding.source}
                          </span>
                        )}
                        <div className="flex items-center gap-1 text-[10px]" style={{ color: AX.muted }}>
                          <span>{formatFundingAge(funding.timeAgo)}</span>
                          <span>•</span>
                          <SolanaIcon size={10} />
                          <span>{funding.solAmount.toFixed(2)}</span>
                        </div>
                      </div>
                    </td>
                    {/* Empty cell for bubblemap column */}
                    <td className="px-1 py-1.5" />
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
    </div>
  );
};

export default HoldersTable;

