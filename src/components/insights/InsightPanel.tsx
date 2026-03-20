import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineSparkles, HiChevronDown } from 'react-icons/hi';
import { useMarketInsights } from '~/hooks/useMarketInsights';
import { InsightCategory } from './InsightCategory';
import { InsightSkeleton } from './InsightSkeleton';

interface InsightPanelProps {
  source: string;
  marketId: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  probabilityAnalysis: 'Probability Analysis',
  smartMoneySignal: 'Smart Money Signal',
  volumeLiquidityAnalysis: 'Volume & Liquidity',
  riskAssessment: 'Risk Assessment',
  priceMomentum: 'Price Momentum',
  timeDecayNote: 'Time Decay',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function InsightPanel({ source, marketId }: InsightPanelProps) {
  const { data, isLoading } = useMarketInsights(source, marketId);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="flex-shrink-0 hidden xl:flex flex-col"
      style={{
        width: collapsed ? 48 : 320,
        borderLeft: '1px solid #2A2B33',
        backgroundColor: '#17191E',
        transition: 'width 0.2s ease',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between px-3 py-3 border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors w-full"
      >
        <div className="flex items-center gap-2">
          <HiOutlineSparkles className="w-4 h-4 text-[#4ADE80] flex-shrink-0" />
          {!collapsed && <span className="text-sm font-semibold text-zinc-200">AI Insights</span>}
        </div>
        {!collapsed && (
          <div className="flex items-center gap-2">
            {data?.generatedAt && (
              <span className="text-[10px] text-zinc-500">
                Updated {timeAgo(data.generatedAt)}
              </span>
            )}
            <motion.div animate={{ rotate: collapsed ? 90 : 0 }} transition={{ duration: 0.2 }}>
              <HiChevronDown className="w-3.5 h-3.5 text-zinc-500" />
            </motion.div>
          </div>
        )}
      </button>

      {/* Content */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoading ? (
            <InsightSkeleton />
          ) : data?.insights ? (
            Object.entries(data.insights).map(([key, insight]) => (
              <InsightCategory
                key={key}
                label={CATEGORY_LABELS[key] || key}
                insight={insight}
              />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <HiOutlineSparkles className="w-8 h-8 text-zinc-600 mb-3" />
              <p className="text-xs text-zinc-500">AI insights are being generated for this market. Check back shortly.</p>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
