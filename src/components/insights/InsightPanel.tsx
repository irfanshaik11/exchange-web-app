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
  const { data, isLoading } = useMarketInsights(source, marketId);
  const [collapsed, setCollapsed] = useState(false);
  const constraintsRef = useRef<HTMLDivElement>(null);

  return (
    <>
      {/* Drag boundary */}
      <div ref={constraintsRef} className="fixed inset-0 pointer-events-none hidden xl:block" style={{ zIndex: 39 }} />
      <style>{`
        @property --iri-angle-sp {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes iriRotateSP {
          0% { --iri-angle-sp: 0deg; }
          100% { --iri-angle-sp: 360deg; }
        }
        .iri-border-sp {
          position: relative;
          border-radius: 16px;
          padding: 1.5px;
          background: conic-gradient(
            from var(--iri-angle-sp),
            rgba(255,59,48,0.5), rgba(255,149,0,0.5), rgba(255,214,10,0.5),
            rgba(52,199,89,0.5), rgba(0,199,190,0.5), rgba(48,176,199,0.5),
            rgba(88,86,214,0.5), rgba(191,90,242,0.5), rgba(255,55,95,0.5),
            rgba(255,59,48,0.5)
          );
          animation: iriRotateSP 9s linear infinite;
        }
        .iri-border-sp > .iri-inner-sp {
          border-radius: 14.5px;
          background: rgba(14, 16, 20, 0.85);
          backdrop-filter: blur(24px);
        }
        .iri-border-sp::before {
          content: '';
          position: absolute;
          inset: -4px;
          border-radius: 20px;
          background: conic-gradient(
            from var(--iri-angle-sp),
            rgba(255,59,48,0.12), rgba(255,149,0,0.12), rgba(255,214,10,0.12),
            rgba(52,199,89,0.12), rgba(0,199,190,0.12), rgba(48,176,199,0.12),
            rgba(88,86,214,0.12), rgba(191,90,242,0.12), rgba(255,55,95,0.12),
            rgba(255,59,48,0.12)
          );
          filter: blur(10px);
          z-index: -1;
          animation: iriRotateSP 9s linear infinite;
        }
        .iri-pill-sp {
          position: relative;
          border-radius: 24px;
          padding: 1.5px;
          background: conic-gradient(
            from var(--iri-angle-sp),
            rgba(255,59,48,0.5), rgba(255,149,0,0.5), rgba(255,214,10,0.5),
            rgba(52,199,89,0.5), rgba(0,199,190,0.5), rgba(48,176,199,0.5),
            rgba(88,86,214,0.5), rgba(191,90,242,0.5), rgba(255,55,95,0.5),
            rgba(255,59,48,0.5)
          );
          animation: iriRotateSP 9s linear infinite;
        }
        .iri-pill-sp > .pill-inner-sp {
          border-radius: 22.5px;
          background: rgba(14, 16, 20, 0.88);
          backdrop-filter: blur(24px);
        }
        .iri-pill-sp::before {
          content: '';
          position: absolute;
          inset: -3px;
          border-radius: 27px;
          background: conic-gradient(
            from var(--iri-angle-sp),
            rgba(255,59,48,0.12), rgba(255,149,0,0.12), rgba(255,214,10,0.12),
            rgba(52,199,89,0.12), rgba(0,199,190,0.12), rgba(48,176,199,0.12),
            rgba(88,86,214,0.12), rgba(191,90,242,0.12), rgba(255,55,95,0.12),
            rgba(255,59,48,0.12)
          );
          filter: blur(8px);
          z-index: -1;
          animation: iriRotateSP 9s linear infinite;
        }
      `}</style>

      <motion.div
        drag
        dragMomentum={false}
        dragConstraints={constraintsRef}
        dragElastic={0.05}
        className="hidden xl:block"
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
          <div className="iri-pill-sp">
            <button
              onClick={() => setCollapsed(false)}
              className="pill-inner-sp flex items-center gap-2 px-3.5 py-2.5 hover:bg-white/[0.03] transition-colors"
            >
              <AIIcon size={18} />
              <span
                className="text-[10px] font-bold tracking-[0.1em] uppercase"
                style={{
                  background: 'linear-gradient(135deg, #4ADE80, #22D3EE)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                AI
              </span>
            </button>
          </div>
        ) : (
          /* Expanded panel */
          <div className="iri-border-sp w-full">
            <div className="iri-inner-sp overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 8rem)' }}>
              {/* Header */}
              <button
                onClick={() => setCollapsed(true)}
                className="flex items-center justify-between px-3 py-3 border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors w-full"
              >
                <div className="flex items-center gap-2.5">
                  <AIIcon size={16} />
                  <div className="flex flex-col">
                    <span
                      className="text-[11px] font-bold tracking-[0.12em] uppercase"
                      style={{
                        background: 'linear-gradient(135deg, #4ADE80, #22D3EE)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                      }}
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
