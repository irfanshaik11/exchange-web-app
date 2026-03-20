import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { HiChevronLeft } from 'react-icons/hi';
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

function AIIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <motion.path
        d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"
        fill="url(#ai-g1)"
        animate={{ scale: [0.9, 1.05, 0.9], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.path
        d="M19 15L19.75 17.25L22 18L19.75 18.75L19 21L18.25 18.75L16 18L18.25 17.25L19 15Z"
        fill="url(#ai-g1)"
        animate={{ scale: [0.8, 1.1, 0.8], opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
      />
      <defs>
        <linearGradient id="ai-g1" x1="3" y1="2" x2="22" y2="21">
          <stop stopColor="#4ADE80" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function InsightPanel({ source, marketId }: InsightPanelProps) {
  const { data, isLoading } = useMarketInsights(source, marketId);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      <style>{`
        @keyframes iridescentRotateSidebar {
          0% { --iridescent-angle-sb: 0deg; }
          100% { --iridescent-angle-sb: 360deg; }
        }
        @property --iridescent-angle-sb {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        .iridescent-sidebar {
          position: relative;
        }
        .iridescent-sidebar::before {
          content: '';
          position: absolute;
          inset: 0;
          left: -1.5px;
          width: 3px;
          background: linear-gradient(
            180deg,
            rgba(255,59,48,0.5),
            rgba(255,149,0,0.5),
            rgba(255,214,10,0.5),
            rgba(52,199,89,0.5),
            rgba(0,199,190,0.5),
            rgba(48,176,199,0.5),
            rgba(88,86,214,0.5),
            rgba(191,90,242,0.5),
            rgba(255,55,95,0.5),
            rgba(255,59,48,0.5)
          );
          background-size: 100% 200%;
          animation: iridescentSlideSidebar 9s linear infinite;
          z-index: 1;
        }
        .iridescent-sidebar::after {
          content: '';
          position: absolute;
          inset: 0;
          left: -6px;
          width: 12px;
          background: linear-gradient(
            180deg,
            rgba(255,59,48,0.1),
            rgba(255,149,0,0.1),
            rgba(255,214,10,0.1),
            rgba(52,199,89,0.1),
            rgba(0,199,190,0.1),
            rgba(48,176,199,0.1),
            rgba(88,86,214,0.1),
            rgba(191,90,242,0.1),
            rgba(255,55,95,0.1),
            rgba(255,59,48,0.1)
          );
          background-size: 100% 200%;
          animation: iridescentSlideSidebar 9s linear infinite;
          filter: blur(6px);
          z-index: 0;
        }
        @keyframes iridescentSlideSidebar {
          0% { background-position: 0% 0%; }
          100% { background-position: 0% 200%; }
        }
      `}</style>
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="flex-shrink-0 hidden xl:flex flex-col backdrop-blur-xl iridescent-sidebar"
      style={{
        width: collapsed ? 44 : 320,
        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        background: 'linear-gradient(180deg, rgba(74,222,128,0.07) 0%, rgba(18,20,26,0.97) 25%, rgba(34,211,238,0.05) 50%, rgba(18,20,26,0.97) 75%, rgba(129,140,248,0.07) 100%)',
        borderLeft: '1px solid rgba(255,255,255,0.06)',
        boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.06), -4px 0 30px rgba(74,222,128,0.04)',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2.5 px-3 py-3.5 border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors w-full"
      >
        <AIIcon size={collapsed ? 20 : 16} />
        {!collapsed && (
          <>
            <div className="flex-1 text-left">
              <span
                className="text-[11px] font-bold tracking-[0.12em] uppercase"
                style={{
                  background: 'linear-gradient(135deg, #4ADE80 0%, #22D3EE 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                AI Insights
              </span>
            </div>
            <div className="flex items-center gap-2">
              {data?.generatedAt && (
                <span className="text-[9px] text-zinc-600 font-mono">{timeAgo(data.generatedAt)}</span>
              )}
              <motion.div animate={{ rotate: collapsed ? 0 : 180 }} transition={{ duration: 0.2 }}>
                <HiChevronLeft className="w-3.5 h-3.5 text-zinc-600" />
              </motion.div>
            </div>
          </>
        )}
      </button>

      {/* Content */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto">
          <div
            className="h-[1px] w-full"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(74,222,128,0.15) 50%, transparent)' }}
          />
          <div className="p-2.5 space-y-1.5">
            {isLoading ? (
              <InsightSkeleton />
            ) : data?.insights ? (
              Object.entries(data.insights).map(([key, insight], i) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.04 }}
                >
                  <InsightCategory label={CATEGORY_LABELS[key] || key} insight={insight} />
                </motion.div>
              ))
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-10 text-center"
              >
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 bg-white/[0.05] border border-white/[0.08]">
                  <AIIcon size={24} />
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed max-w-[200px]">
                  AI insights are being generated for this market
                </p>
                <div className="flex items-center gap-1 mt-3">
                  {[0, 1, 2].map(i => (
                    <motion.div
                      key={i}
                      className="w-1 h-1 rounded-full bg-[#4ADE80]"
                      animate={{ opacity: [0.2, 0.8, 0.2] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        </div>
      )}
    </motion.div>
    </>
  );
}
