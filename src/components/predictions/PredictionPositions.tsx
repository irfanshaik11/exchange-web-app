import React, { useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineClock,
  HiOutlineRefresh,
  HiOutlineExternalLink,
} from 'react-icons/hi';
import useDFlowMarkets, { formatVolume } from '~/hooks/useDFlowMarkets';
import type { ExtendedPredictionMarket } from '~/hooks/useDFlowMarkets';

// Vibrant color palette
const C = {
  bg: "#0a0b0d",
  surface: "#12141a",
  border: "#1e2028",
  text: "#f0f0f0",
  muted: "#6b7280",
  green: "#4ADE80",
  greenBg: "rgba(74, 222, 128, 0.15)",
  red: "#F87171",
  redBg: "rgba(248, 113, 113, 0.15)",
  yellow: "#FBBF24",
  purple: "#818CF8",
};

interface PredictionPosition {
  market: ExtendedPredictionMarket;
  side: 'yes' | 'no';
  shares: number;
  avgPrice: number;
  currentPrice: number;
  value: number;
  pnl: number;
  pnlPercent: number;
}

interface PredictionPositionsProps {
  userPublicKey?: string;
  // In a real implementation, these would come from the user's token accounts
  // For now, we'll show a placeholder/demo view
  positions?: PredictionPosition[];
  showEmptyState?: boolean;
}

/**
 * @deprecated Use UnifiedPortfolio instead, which fetches real data and has full gamified stats.
 * This component uses mock/demo data for display purposes only.
 * Keep for fallback when user is not authenticated.
 */
export default function PredictionPositions({
  userPublicKey,
  positions = [],
  showEmptyState = true
}: PredictionPositionsProps) {
  const { markets, isLoading } = useDFlowMarkets({ limit: 50 });

  // Demo positions using top markets (in production, filter by user's token holdings)
  const demoPositions: PredictionPosition[] = useMemo(() => {
    if (positions.length > 0) return positions;

    // Show first 3 markets as demo positions
    return markets.slice(0, 3).map((market, i) => {
      const side = i % 2 === 0 ? 'yes' : 'no';
      const currentPrice = side === 'yes' ? market.yesPrice : market.noPrice;
      const avgPrice = currentPrice * (0.9 + Math.random() * 0.2); // Simulate entry price
      const shares = Math.floor(50 + Math.random() * 200);
      const value = shares * currentPrice;
      const cost = shares * avgPrice;
      const pnl = value - cost;
      const pnlPercent = cost > 0 ? (pnl / cost) * 100 : 0;

      return {
        market,
        side: side as 'yes' | 'no',
        shares,
        avgPrice,
        currentPrice,
        value,
        pnl,
        pnlPercent,
      };
    });
  }, [markets, positions]);

  const totalValue = demoPositions.reduce((sum, p) => sum + p.value, 0);
  const totalPnl = demoPositions.reduce((sum, p) => sum + p.pnl, 0);

  if (isLoading) {
    return (
      <div className="py-12 flex items-center justify-center">
        <HiOutlineRefresh className="w-6 h-6 animate-spin" style={{ color: C.muted }} />
      </div>
    );
  }

  if (!userPublicKey && showEmptyState) {
    return (
      <div className="py-12 text-center">
        <div
          className="w-16 h-16 rounded-xl mx-auto mb-4 flex items-center justify-center"
          style={{ backgroundColor: `${C.purple}15` }}
        >
          <HiOutlineClock className="w-8 h-8" style={{ color: C.purple }} />
        </div>
        <h3 className="text-lg font-medium mb-2" style={{ color: C.text }}>
          No Prediction Positions
        </h3>
        <p className="text-sm mb-4 max-w-md mx-auto" style={{ color: C.muted }}>
          Your prediction market positions will appear here. Buy YES or NO shares on prediction markets to get started.
        </p>
        <Link
          href="/predictions"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            backgroundColor: C.green,
            color: '#000',
          }}
        >
          Browse Markets
          <HiOutlineExternalLink className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  if (demoPositions.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm" style={{ color: C.muted }}>
          No prediction positions found
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="flex items-center gap-6 px-4 py-3 rounded-lg" style={{ backgroundColor: C.surface }}>
        <div>
          <div className="text-xs uppercase tracking-wider mb-1" style={{ color: C.muted }}>
            Total Value
          </div>
          <div className="text-lg font-bold" style={{ color: C.text }}>
            ${totalValue.toFixed(2)}
          </div>
        </div>
        <div className="w-px h-10" style={{ backgroundColor: C.border }} />
        <div>
          <div className="text-xs uppercase tracking-wider mb-1" style={{ color: C.muted }}>
            Unrealized P&L
          </div>
          <div
            className="text-lg font-bold"
            style={{ color: totalPnl >= 0 ? C.green : C.red }}
          >
            {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)} ({totalPnl >= 0 ? '+' : ''}{((totalPnl / (totalValue - totalPnl)) * 100 || 0).toFixed(1)}%)
          </div>
        </div>
        <div className="w-px h-10" style={{ backgroundColor: C.border }} />
        <div>
          <div className="text-xs uppercase tracking-wider mb-1" style={{ color: C.muted }}>
            Positions
          </div>
          <div className="text-lg font-bold" style={{ color: C.text }}>
            {demoPositions.length}
          </div>
        </div>
      </div>

      {/* Position List */}
      <div className="space-y-2">
        {demoPositions.map((position, index) => (
          <motion.div
            key={`${position.market.ticker}-${position.side}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <Link href={`/predictions/${position.market.ticker}`}>
              <div
                className="flex items-center justify-between p-4 rounded-lg hover:bg-opacity-80 transition-colors cursor-pointer"
                style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {/* Side indicator */}
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: position.side === 'yes' ? C.greenBg : C.redBg,
                    }}
                  >
                    {position.side === 'yes' ? (
                      <HiOutlineCheckCircle className="w-5 h-5" style={{ color: C.green }} />
                    ) : (
                      <HiOutlineXCircle className="w-5 h-5" style={{ color: C.red }} />
                    )}
                  </div>

                  {/* Market info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: C.text }}>
                      {position.market.title}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className="text-xs font-medium uppercase"
                        style={{ color: position.side === 'yes' ? C.green : C.red }}
                      >
                        {position.side}
                      </span>
                      <span className="text-xs" style={{ color: C.muted }}>
                        {position.shares.toFixed(2)} shares @ {Math.round(position.avgPrice * 100)}¢
                      </span>
                    </div>
                  </div>
                </div>

                {/* Price & Value */}
                <div className="text-right ml-4">
                  <div className="text-sm font-bold" style={{ color: C.text }}>
                    ${position.value.toFixed(2)}
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: position.pnl >= 0 ? C.green : C.red }}
                  >
                    {position.pnl >= 0 ? '+' : ''}{position.pnl.toFixed(2)} ({position.pnl >= 0 ? '+' : ''}{position.pnlPercent.toFixed(1)}%)
                  </div>
                </div>

                {/* Current price */}
                <div className="text-right ml-4 hidden sm:block">
                  <div className="text-xs" style={{ color: C.muted }}>Now</div>
                  <div
                    className="text-sm font-bold"
                    style={{ color: position.side === 'yes' ? C.green : C.red }}
                  >
                    {Math.round(position.currentPrice * 100)}¢
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* View All Link */}
      <div className="text-center pt-2">
        <Link
          href="/predictions"
          className="inline-flex items-center gap-1 text-sm hover:opacity-80 transition-opacity"
          style={{ color: C.green }}
        >
          View All Markets
          <HiOutlineExternalLink className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
