import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiChevronDown } from 'react-icons/hi';
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
        fill="url(#ai-g-sp)"
        animate={{ scale: [0.9, 1.05, 0.9], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.path
        d="M19 15L19.75 17.25L22 18L19.75 18.75L19 21L18.25 18.75L16 18L18.25 17.25L19 15Z"
        fill="url(#ai-g-sp)"
        animate={{ scale: [0.8, 1.1, 0.8], opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
      />
      <defs>
        <linearGradient id="ai-g-sp" x1="3" y1="2" x2="22" y2="21">
          <stop stopColor="#4ADE80" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function InsightPanel({ source, marketId }: InsightPanelProps) {
  const { data, isLoading, timedOut } = useMarketInsights(source, marketId);
  const [collapsed, setCollapsed] = useState(true); // Start collapsed on all screens
  const constraintsRef = useRef<HTMLDivElement>(null);

  return (
    <>
    {/* Drag boundary — desktop only */}
    <div ref={constraintsRef} className="fixed pointer-events-none hidden lg:block" style={{ zIndex: 39, top: '5.5rem', left: 0, right: 0, bottom: 0 }} />

    {/* Mobile: small circular button, always visible */}
    {collapsed && (
      <div className="lg:hidden fixed z-40" style={{ right: '0.75rem', bottom: '5rem' }}>
        <div className="iridescent-pill">
          <button
            onClick={() => setCollapsed(false)}
            aria-label="Open AI insights"
            className="pill-inner flex items-center justify-center w-12 h-12 hover:bg-white/[0.04] transition-colors"
          >
            <AIIcon size={24} />
          </button>
        </div>
      </div>
    )}

    {/* Mobile: full-screen modal when expanded */}
    {!collapsed && (
      <div className="lg:hidden fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={() => setCollapsed(true)}>
        <div className="flex-1 overflow-y-auto p-4 pt-16" onClick={(e) => e.stopPropagation()}>
          <div className="iridescent-border max-w-md mx-auto">
            <div className="iridescent-inner overflow-hidden">
              {/* Header */}
              <button
                onClick={() => setCollapsed(true)}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <AIIcon size={18} />
                  <span className="text-[13px] font-bold tracking-[0.12em] uppercase text-[#4ADE80]">AI Insights</span>
                </div>
                <span className="text-zinc-500 text-sm">✕</span>
              </button>
              <div className="h-[1px] w-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(74,222,128,0.15) 50%, transparent)' }} />
              {/* Content */}
              <div className="p-3 space-y-1.5">
                {isLoading ? (
                  <InsightSkeleton />
                ) : data?.insights ? (
                  <>
                    {Object.entries(data.insights).map(([key, insight], i) => (
                      <InsightCategory key={key} label={CATEGORY_LABELS[key] || key} insight={insight} />
                    ))}
                    <p className="text-[9px] text-zinc-600 text-center pt-2 pb-1 leading-relaxed">
                      AI-generated insights. Not financial advice.
                    </p>
                  </>
                ) : timedOut ? (
                  <div className="flex flex-col items-center justify-center py-8 px-3 text-center">
                    <p className="text-[12px] text-zinc-400">AI insights are temporarily unavailable.</p>
                    <p className="text-[10px] text-zinc-600 mt-1">Please check back shortly.</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 bg-white/[0.05] border border-white/[0.08]">
                      <AIIcon size={24} />
                    </div>
                    <p className="text-[11px] text-zinc-500">AI insights are being generated for this market</p>
                    <div className="flex items-center gap-1 mt-3">
                      {[0, 1, 2].map(i => (
                        <motion.div key={i} className="w-1 h-1 rounded-full bg-[#4ADE80]" animate={{ opacity: [0.2, 0.8, 0.2] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Desktop: existing floating panel */}
    <motion.div
      drag
      dragMomentum={false}
      dragConstraints={constraintsRef}
      dragElastic={0.05}
      className="hidden lg:block"
      role="region"
      aria-label="AI Insights"
      style={{
        position: 'fixed',
        right: '1rem',
        top: '6rem',
        width: collapsed ? 'auto' : 330,
        zIndex: 40,
        cursor: 'grab',
      }}
      whileDrag={{ cursor: 'grabbing' }}
    >
      {collapsed ? (
        /* Minimized pill */
        <div className="iridescent-pill">
          <button
            onClick={() => setCollapsed(false)}
            aria-label="Open AI insights"
            aria-expanded={false}
            className="pill-inner flex items-center gap-3 px-5 py-3 hover:bg-white/[0.04] transition-colors focus-visible:ring-2 focus-visible:ring-[#4ADE80]/50 focus-visible:outline-none"
          >
            <span className="flex-shrink-0"><AIIcon size={24} /></span>
            <span
              className="text-[12px] font-bold tracking-[0.08em]"
              style={{
                background: 'linear-gradient(135deg, #4ADE80, #22D3EE)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              AI Insights
            </span>
          </button>
        </div>
      ) : (
        /* Expanded panel */
        <div className="iridescent-border w-full">
          <div className="iridescent-inner overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 8rem)' }}>
            {/* Header */}
            <button
              onClick={() => setCollapsed(true)}
              aria-expanded={true}
              aria-label="Toggle AI insights"
              className="flex items-center justify-between px-3 py-3 hover:bg-white/[0.02] transition-colors w-full focus-visible:ring-2 focus-visible:ring-[#4ADE80]/50 focus-visible:outline-none"
            >
              <div className="flex items-center gap-2.5">
                <AIIcon size={16} />
                <div className="flex flex-col">
                  <span
                    className="text-[13px] font-bold tracking-[0.12em] uppercase text-[#4ADE80]"
                  >
                    AI Insights
                  </span>
                </div>
              </div>
              <HiChevronDown className="w-4 h-4 text-zinc-500" />
            </button>

            {/* Glow line */}
            <div
              className="h-[1px] w-full flex-shrink-0"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(74,222,128,0.15) 50%, transparent)' }}
            />

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
              {isLoading ? (
                <InsightSkeleton />
              ) : data?.insights ? (
                <>
                  {Object.entries(data.insights).map(([key, insight], i) => (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.04 }}
                    >
                      <InsightCategory label={CATEGORY_LABELS[key] || key} insight={insight} />
                    </motion.div>
                  ))}
                  <p className="text-[9px] text-zinc-600 text-center pt-2 pb-1 leading-relaxed">
                    AI-generated insights. Not financial advice.
                  </p>
                </>
              ) : timedOut ? (
                <div className="flex flex-col items-center justify-center py-8 px-3 text-center">
                  <p className="text-[12px] text-zinc-400 leading-relaxed">
                    AI insights are temporarily unavailable.
                  </p>
                  <p className="text-[10px] text-zinc-600 mt-1">Please check back shortly.</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
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
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </motion.div>
    </>
  );
}
