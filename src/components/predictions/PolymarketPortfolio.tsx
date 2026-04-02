// @deprecated - Use UnifiedPortfolio instead. This component's functionality has been
// merged into UnifiedPortfolio.tsx for a cleaner, unified portfolio experience.
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineClock,
  HiOutlineRefresh,
  HiOutlineExternalLink,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineTrash,
  HiOutlineExclamationCircle,
  HiOutlineClipboardList,
  HiOutlineCollection,
  HiOutlineChartBar,
} from 'react-icons/hi';
import {
  getUserPredictionPositions,
  getUserPredictionTrades,
  getPolymarketOpenOrders,
  cancelPolymarketOrder,
  cancelAllPolymarketOrders,
  type PredictionPosition,
  type PredictionTrade,
  type PolymarketOpenOrder,
} from '~/utils/api';

// localStorage key for claimed history (shared with PredictionWinnings)
const CLAIMED_HISTORY_KEY = 'polymarket_claimed_history';

// Helper to get claimed conditionIds from localStorage
function getClaimedConditionIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const stored = localStorage.getItem(CLAIMED_HISTORY_KEY);
    if (!stored) return new Set();
    const history = JSON.parse(stored) as Array<{ conditionId: string }>;
    return new Set(history.map(h => h.conditionId));
  } catch {
    return new Set();
  }
}

// Vibrant color palette
const C = {
  bg: "#111214",
  surface: "#12141a",
  surfaceHover: "#1a1d24",
  border: "#1e2028",
  text: "#f0f0f0",
  muted: "#6b7280",
  green: "#4ADE80",
  greenBg: "rgba(74, 222, 128, 0.15)",
  red: "#F87171",
  redBg: "rgba(248, 113, 113, 0.15)",
  yellow: "#FBBF24",
  yellowBg: "rgba(251, 191, 36, 0.15)",
  purple: "#818CF8",
  purpleBg: "rgba(129, 140, 248, 0.15)",
  blue: "#60A5FA",
  blueBg: "rgba(96, 165, 250, 0.15)",
};

type TabType = 'positions' | 'orders' | 'history';

interface PolymarketPortfolioProps {
  authToken?: string;
  defaultTab?: TabType;
  compact?: boolean;
  onTradeClick?: (marketId: string) => void;
}

export default function PolymarketPortfolio({
  authToken,
  defaultTab = 'positions',
  compact = false,
  onTradeClick,
}: PolymarketPortfolioProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>(defaultTab);
  const [positions, setPositions] = useState<PredictionPosition[]>([]);
  const [openOrders, setOpenOrders] = useState<PolymarketOpenOrder[]>([]);
  const [trades, setTrades] = useState<PredictionTrade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  // Navigate to market trade page
  const handleNavigateToMarket = useCallback((position: PredictionPosition) => {
    // Helper to check if a string is a human-readable slug (not hex ID or pure numbers)
    // Slugs look like: "nhl-sj-van-2026-01-27", "will-trump-win-2024"
    // Hex IDs look like: "0x92cd86aeee..."
    // Token IDs look like: "24805358206707059866..."
    const isReadableSlug = (str: string | undefined): boolean => {
      if (!str) return false;
      // Must contain a hyphen (slugs use hyphens) or letters g-z (not in hex)
      // And NOT start with 0x (hex) or be all digits
      if (str.startsWith('0x')) return false;
      if (/^\d+$/.test(str)) return false;
      // Contains hyphen OR has letters beyond hex (g-z)
      return str.includes('-') || /[g-zG-Z]/.test(str);
    };

    let marketSlug: string | undefined;

    // Check if marketId looks like a readable slug
    if (isReadableSlug(position.marketId)) {
      marketSlug = position.marketId;
    }
    // Check if ticker looks like a readable slug
    else if (isReadableSlug(position.ticker)) {
      marketSlug = position.ticker;
    }
    // Fall back to conditionId for Polymarket (will work but not pretty URL)
    else if (position.conditionId) {
      marketSlug = position.conditionId;
    }
    // Last resort: use marketId
    else {
      marketSlug = position.marketId;
    }

    if (marketSlug) {
      router.push(`/predictions/${encodeURIComponent(marketSlug)}`);
    }

    // Also call the optional callback if provided
    onTradeClick?.(position.marketId);
  }, [router, onTradeClick]);

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!authToken) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch positions, orders, and trades in parallel
      const [positionsRes, ordersRes, tradesRes] = await Promise.all([
        getUserPredictionPositions(authToken, 'polymarket', 'active').catch(() => null),
        getPolymarketOpenOrders(authToken).catch(() => null),
        getUserPredictionTrades(authToken, 'polymarket', 20).catch(() => null),
      ]);

      if (positionsRes?.success && positionsRes.data) {
        // Filter out positions for markets that have been claimed/redeemed
        const claimedConditionIds = getClaimedConditionIds();
        const activePositions = positionsRes.data.filter(
          (p: PredictionPosition) => !p.conditionId || !claimedConditionIds.has(p.conditionId)
        );
        setPositions(activePositions);
      }

      if (ordersRes?.success && ordersRes.data) {
        setOpenOrders(ordersRes.data);
      }

      if (tradesRes?.success && tradesRes.data) {
        setTrades(tradesRes.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load portfolio data');
    } finally {
      setIsLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Cancel single order
  const handleCancelOrder = async (orderId: string) => {
    if (!authToken || cancellingOrderId) return;

    setCancellingOrderId(orderId);
    try {
      const result = await cancelPolymarketOrder(orderId, authToken);
      if (result?.success) {
        // Remove from local state
        setOpenOrders(prev => prev.filter(o => o.id !== orderId));
      }
    } catch (err: any) {
      console.error('Failed to cancel order:', err.message);
    } finally {
      setCancellingOrderId(null);
    }
  };

  // Cancel all orders
  const handleCancelAllOrders = async () => {
    if (!authToken || cancellingOrderId) return;

    setCancellingOrderId('all');
    try {
      const result = await cancelAllPolymarketOrders(authToken);
      if (result?.success) {
        setOpenOrders([]);
      }
    } catch (err: any) {
      console.error('Failed to cancel all orders:', err.message);
    } finally {
      setCancellingOrderId(null);
    }
  };

  // Calculate totals (ensure numeric values)
  const totalPositionValue = positions.reduce((sum, p) => {
    const value = Number(p.currentValue) || Number(p.costBasis) || 0;
    return sum + value;
  }, 0);
  const totalUnrealizedPnl = positions.reduce((sum, p) => {
    return sum + (Number(p.unrealizedPnl) || 0);
  }, 0);
  const totalOpenOrderValue = openOrders.reduce((sum, o) => {
    const size = parseFloat(o.original_size || '0') - parseFloat(o.size_matched || '0');
    const price = parseFloat(o.price || '0');
    return sum + (size * price);
  }, 0);

  // Not logged in state
  if (!authToken) {
    return (
      <div className="py-8 text-center">
        <div
          className="w-14 h-14 rounded-xl mx-auto mb-4 flex items-center justify-center"
          style={{ backgroundColor: C.purpleBg }}
        >
          <HiOutlineClipboardList className="w-7 h-7" style={{ color: C.purple }} />
        </div>
        <h3 className="text-lg font-medium mb-2" style={{ color: C.text }}>
          Sign in to View Portfolio
        </h3>
        <p className="text-sm max-w-md mx-auto" style={{ color: C.muted }}>
          Connect your wallet to see your prediction market positions, open orders, and trade history.
        </p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="py-8 flex flex-col items-center justify-center gap-3">
        <HiOutlineRefresh className="w-6 h-6 animate-spin" style={{ color: C.muted }} />
        <span className="text-sm" style={{ color: C.muted }}>Loading portfolio...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="py-8 text-center">
        <div
          className="w-14 h-14 rounded-xl mx-auto mb-4 flex items-center justify-center"
          style={{ backgroundColor: C.redBg }}
        >
          <HiOutlineExclamationCircle className="w-7 h-7" style={{ color: C.red }} />
        </div>
        <h3 className="text-lg font-medium mb-2" style={{ color: C.text }}>
          Failed to Load Portfolio
        </h3>
        <p className="text-sm mb-4" style={{ color: C.muted }}>{error}</p>
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ backgroundColor: C.surface, color: C.text, border: `1px solid ${C.border}` }}
        >
          <HiOutlineRefresh className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  const hasData = positions.length > 0 || openOrders.length > 0 || trades.length > 0;

  // Empty state
  if (!hasData) {
    return (
      <div className="py-8 text-center">
        <div
          className="w-14 h-14 rounded-xl mx-auto mb-4 flex items-center justify-center"
          style={{ backgroundColor: C.purpleBg }}
        >
          <HiOutlineCollection className="w-7 h-7" style={{ color: C.purple }} />
        </div>
        <h3 className="text-lg font-medium mb-2" style={{ color: C.text }}>
          No Prediction Activity
        </h3>
        <p className="text-sm mb-4 max-w-md mx-auto" style={{ color: C.muted }}>
          You haven't made any prediction market trades yet. Browse markets and place your first order!
        </p>
        <Link
          href="/predictions"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ backgroundColor: C.green, color: '#000' }}
        >
          Browse Markets
          <HiOutlineExternalLink className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div
        className="flex flex-wrap items-center gap-4 sm:gap-6 px-4 py-3 rounded-lg"
        style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
      >
        <div>
          <div className="text-xs uppercase tracking-wider mb-1" style={{ color: C.muted }}>
            Positions Value
          </div>
          <div className="text-lg font-bold" style={{ color: C.text }}>
            ${totalPositionValue.toFixed(2)}
          </div>
        </div>
        {totalUnrealizedPnl !== 0 && (
          <>
            <div className="w-px h-10 hidden sm:block" style={{ backgroundColor: C.border }} />
            <div>
              <div className="text-xs uppercase tracking-wider mb-1" style={{ color: C.muted }}>
                Unrealized P&L
              </div>
              <div
                className="text-lg font-bold"
                style={{ color: totalUnrealizedPnl >= 0 ? C.green : C.red }}
              >
                {totalUnrealizedPnl >= 0 ? '+' : ''}${totalUnrealizedPnl.toFixed(2)}
              </div>
            </div>
          </>
        )}
        {openOrders.length > 0 && (
          <>
            <div className="w-px h-10 hidden sm:block" style={{ backgroundColor: C.border }} />
            <div>
              <div className="text-xs uppercase tracking-wider mb-1" style={{ color: C.muted }}>
                Open Orders
              </div>
              <div className="text-lg font-bold" style={{ color: C.yellow }}>
                {openOrders.length} (${totalOpenOrderValue.toFixed(2)})
              </div>
            </div>
          </>
        )}
        <div className="ml-auto">
          <button
            onClick={fetchData}
            className="p-2 rounded-lg transition-colors hover:bg-opacity-80"
            style={{ backgroundColor: C.border }}
            title="Refresh"
          >
            <HiOutlineRefresh className="w-4 h-4" style={{ color: C.muted }} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b" style={{ borderColor: C.border }}>
        {[
          { key: 'positions' as TabType, label: 'Positions', count: positions.length, icon: HiOutlineCollection },
          { key: 'orders' as TabType, label: 'Open Orders', count: openOrders.length, icon: HiOutlineClipboardList },
          { key: 'history' as TabType, label: 'Trade History', count: trades.length, icon: HiOutlineChartBar },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px"
            style={{
              color: activeTab === tab.key ? C.text : C.muted,
              borderColor: activeTab === tab.key ? C.green : 'transparent',
            }}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.count > 0 && (
              <span
                className="px-1.5 py-0.5 rounded-full text-xs"
                style={{
                  backgroundColor: activeTab === tab.key ? C.greenBg : C.surface,
                  color: activeTab === tab.key ? C.green : C.muted,
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'positions' && (
          <motion.div
            key="positions"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-2"
          >
            {positions.length === 0 ? (
              <div className="py-8 text-center" style={{ color: C.muted }}>
                No open positions
              </div>
            ) : (
              positions.map((position, index) => (
                <PositionRow
                  key={position.id}
                  position={position}
                  index={index}
                  onClick={() => handleNavigateToMarket(position)}
                />
              ))
            )}
          </motion.div>
        )}

        {activeTab === 'orders' && (
          <motion.div
            key="orders"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-2"
          >
            {openOrders.length > 0 && (
              <div className="flex justify-end mb-2">
                <button
                  onClick={handleCancelAllOrders}
                  disabled={cancellingOrderId !== null}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{ backgroundColor: C.redBg, color: C.red }}
                >
                  <HiOutlineTrash className="w-3.5 h-3.5" />
                  Cancel All
                </button>
              </div>
            )}
            {openOrders.length === 0 ? (
              <div className="py-8 text-center" style={{ color: C.muted }}>
                No open orders
              </div>
            ) : (
              openOrders.map((order, index) => (
                <OpenOrderRow
                  key={order.id}
                  order={order}
                  index={index}
                  onCancel={handleCancelOrder}
                  isCancelling={cancellingOrderId === order.id || cancellingOrderId === 'all'}
                />
              ))
            )}
          </motion.div>
        )}

        {activeTab === 'history' && (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-2"
          >
            {trades.length === 0 ? (
              <div className="py-8 text-center" style={{ color: C.muted }}>
                No trade history
              </div>
            ) : (
              trades.map((trade, index) => (
                <TradeRow
                  key={trade.id}
                  trade={trade}
                  index={index}
                  onClick={() => {
                    // Helper to check if a string is a human-readable slug
                    const isReadableSlug = (str: string | undefined): boolean => {
                      if (!str) return false;
                      if (str.startsWith('0x')) return false;
                      if (/^\d+$/.test(str)) return false;
                      return str.includes('-') || /[g-zG-Z]/.test(str);
                    };

                    let marketSlug: string | undefined;
                    if (isReadableSlug(trade.marketId)) {
                      marketSlug = trade.marketId;
                    } else if (isReadableSlug(trade.ticker)) {
                      marketSlug = trade.ticker;
                    } else {
                      marketSlug = trade.marketId;
                    }

                    if (marketSlug) {
                      router.push(`/predictions/${encodeURIComponent(marketSlug)}`);
                    }
                  }}
                />
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Position row component
function PositionRow({
  position,
  index,
  onClick,
}: {
  position: PredictionPosition;
  index: number;
  onClick?: () => void;
}) {
  const isYes = position.side?.toUpperCase() === 'YES';
  const costBasis = Number(position.costBasis) || 0;
  const unrealizedPnl = Number(position.unrealizedPnl) || 0;
  const tokenAmount = Number(position.tokenAmount) || 0;
  const avgEntryPrice = Number(position.avgEntryPrice) || 0;
  const currentValue = Number(position.currentValue) || costBasis;
  const pnlPercent = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="flex items-center justify-between p-4 rounded-lg transition-colors cursor-pointer hover:bg-white/5"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Side indicator */}
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: isYes ? C.greenBg : C.redBg }}
        >
          {isYes ? (
            <HiOutlineCheckCircle className="w-5 h-5" style={{ color: C.green }} />
          ) : (
            <HiOutlineXCircle className="w-5 h-5" style={{ color: C.red }} />
          )}
        </div>

        {/* Market info */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate" style={{ color: C.text }}>
            {position.marketTitle || position.marketId}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className="text-xs font-bold uppercase"
              style={{ color: isYes ? C.green : C.red }}
            >
              {position.side}
            </span>
            <span className="text-xs" style={{ color: C.muted }}>
              {tokenAmount.toFixed(2)} shares @ {(avgEntryPrice * 100).toFixed(0)}¢
            </span>
          </div>
        </div>
      </div>

      {/* Value & P&L */}
      <div className="text-right ml-4">
        <div className="text-sm font-bold" style={{ color: C.text }}>
          ${currentValue.toFixed(2)}
        </div>
        {unrealizedPnl !== 0 && (
          <div
            className="text-xs"
            style={{ color: unrealizedPnl >= 0 ? C.green : C.red }}
          >
            {unrealizedPnl >= 0 ? '+' : ''}${unrealizedPnl.toFixed(2)} ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%)
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Open order row component
function OpenOrderRow({
  order,
  index,
  onCancel,
  isCancelling,
}: {
  order: PolymarketOpenOrder;
  index: number;
  onCancel: (orderId: string) => void;
  isCancelling: boolean;
}) {
  const isBuy = order.side === 'BUY';
  const size = parseFloat(order.original_size || '0') - parseFloat(order.size_matched || '0');
  const price = parseFloat(order.price || '0');
  const value = size * price;
  const isYesOutcome = order.outcome?.toUpperCase() === 'YES';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="flex items-center justify-between p-4 rounded-lg"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Order type indicator */}
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: isBuy ? C.greenBg : C.redBg }}
        >
          <span
            className="text-xs font-bold"
            style={{ color: isBuy ? C.green : C.red }}
          >
            {isBuy ? 'BUY' : 'SELL'}
          </span>
        </div>

        {/* Order info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-bold uppercase px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: isYesOutcome ? C.greenBg : C.redBg,
                color: isYesOutcome ? C.green : C.red,
              }}
            >
              {order.outcome || 'YES'}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: C.yellowBg, color: C.yellow }}>
              {order.type}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs" style={{ color: C.muted }}>
              {size.toFixed(2)} @ {(price * 100).toFixed(0)}¢
            </span>
            <span className="text-xs" style={{ color: C.muted }}>
              = ${value.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Cancel button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCancel(order.id);
        }}
        disabled={isCancelling}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ml-4"
        style={{ backgroundColor: C.border, color: isCancelling ? C.muted : C.red }}
      >
        {isCancelling ? (
          <HiOutlineRefresh className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <HiOutlineTrash className="w-3.5 h-3.5" />
        )}
        {isCancelling ? 'Cancelling...' : 'Cancel'}
      </button>
    </motion.div>
  );
}

// Trade history row component
function TradeRow({
  trade,
  index,
  onClick,
}: {
  trade: PredictionTrade;
  index: number;
  onClick?: () => void;
}) {
  const isBuy = trade.tradeType?.toUpperCase() === 'BUY';
  const isYes = trade.side?.toUpperCase() === 'YES';
  const tokenAmount = Number(trade.tokenAmount) || 0;
  const pricePerToken = Number(trade.pricePerToken) || 0;
  const usdValue = Number(trade.usdValue) || 0;
  const timestamp = trade.createdAt ? new Date(trade.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) : 'Unknown';

  // Get transaction hash for Polygonscan link
  const txHash = (trade as any).transactionHash;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="flex items-center justify-between p-4 rounded-lg cursor-pointer hover:bg-white/5 transition-colors"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Trade type indicator */}
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: isBuy ? C.greenBg : C.redBg }}
        >
          <span
            className="text-xs font-bold"
            style={{ color: isBuy ? C.green : C.red }}
          >
            {isBuy ? 'BUY' : 'SELL'}
          </span>
        </div>

        {/* Trade info */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate" style={{ color: C.text }}>
            {trade.marketTitle || trade.marketId}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className="text-xs font-bold uppercase"
              style={{ color: isYes ? C.green : C.red }}
            >
              {trade.side}
            </span>
            <span className="text-xs" style={{ color: C.muted }}>
              {tokenAmount.toFixed(2)} @ {(pricePerToken * 100).toFixed(0)}¢
            </span>
          </div>
        </div>
      </div>

      {/* Value & Time */}
      <div className="text-right ml-4">
        <div className="text-sm font-bold" style={{ color: C.text }}>
          ${usdValue.toFixed(2)}
        </div>
        <div className="text-xs" style={{ color: C.muted }}>
          {timestamp}
        </div>
      </div>

      {/* Status & Polygonscan Link */}
      <div className="flex items-center gap-2 ml-4">
        <span
          className="text-xs px-2 py-1 rounded-full"
          style={{
            backgroundColor: trade.status === 'confirmed' ? C.greenBg :
                           trade.status === 'pending' ? C.yellowBg : C.redBg,
            color: trade.status === 'confirmed' ? C.green :
                   trade.status === 'pending' ? C.yellow : C.red,
          }}
        >
          {trade.status || 'unknown'}
        </span>
        {txHash && (
          <a
            href={`https://polygonscan.com/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors hover:opacity-80"
            style={{ backgroundColor: C.purpleBg, color: C.purple }}
            title="View on Polygonscan"
          >
            <img
              src="https://polygonscan.com/assets/poly/images/svg/logos/chain-dim.svg?v=26.1.4.2"
              alt="Polygonscan"
              className="w-3.5 h-3.5"
            />
            Tx
          </a>
        )}
      </div>
    </motion.div>
  );
}
