import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineChevronDown } from 'react-icons/hi';
import { useHomepageInsights } from '~/hooks/useHomepageInsights';
import { SentimentBadge } from './SentimentBadge';
import { TopPickCard } from './TopPickCard';
import { NarrativeChip } from './NarrativeChip';
import { InsightSkeleton } from './InsightSkeleton';

let aiIconCounter = 0;
function AIIcon({ size = 16 }: { size?: number }) {
  const id = `ai-grad-hp-${++aiIconCounter}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
      <motion.path
        d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"
        fill={`url(#${id})`}
        animate={{ scale: [0.9, 1.05, 0.9], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.path
        d="M19 15L19.75 17.25L22 18L19.75 18.75L19 21L18.25 18.75L16 18L18.25 17.25L19 15Z"
        fill={`url(#${id})`}
        animate={{ scale: [0.8, 1.1, 0.8], opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
      />
      <defs>
        <linearGradient id={id} x1="3" y1="2" x2="22" y2="21">
          <stop stopColor="#4ADE80" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function HomepageInsightPanel({ docked = false }: { docked?: boolean }) {
  const { data, isLoading, timedOut } = useHomepageInsights();
  const [collapsed, setCollapsed] = useState(false);
  const [showPicks, setShowPicks] = useState(true);
  const [showNarratives, setShowNarratives] = useState(true);
  const constraintsRef = useRef<HTMLDivElement>(null);

  const handleExpand = () => {
    setCollapsed(false);
    if (panelRef.current) {
      panelRef.current.style.transform = 'none';
    }
  };
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Shared desktop panel content (used by docked + floating expanded) ──
  const expandedPanel = (
    <div>
      <div className="iridescent-border">
        <div className="iridescent-inner overflow-hidden shadow-2xl">
          {/* Header */}
          <button
            onClick={() => setCollapsed(c => !c)}
            aria-expanded={!collapsed}
            aria-label="Toggle AI insights"
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors focus-visible:ring-2 focus-visible:ring-[#4ADE80]/50 focus-visible:outline-none"
          >
            <div className="flex items-center gap-2.5">
              <AIIcon size={18} />
              <span className="text-[13px] font-bold tracking-[0.12em] uppercase text-[#4ADE80]">
                AI Market Pulse
              </span>
            </div>
            <motion.div animate={{ rotate: collapsed ? 0 : 180 }} transition={{ duration: 0.2 }}>
              <HiOutlineChevronDown className="w-4 h-4 text-zinc-500" />
            </motion.div>
          </button>

          {!collapsed && <>
          {/* Glow line */}
          <div
            className="h-[1px] w-full"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(74,222,128,0.15) 50%, transparent)' }}
          />

          {isLoading ? (
            <InsightSkeleton />
          ) : data?.insights ? (
            <div className="p-3 space-y-3 max-h-[480px] overflow-y-auto scrollbar-hide">
              {/* Market Pulse */}
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="rounded-xl p-3 bg-white/[0.03] border border-white/[0.06]"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.1em]">Market Pulse</span>
                  <SentimentBadge sentiment={data.insights.marketPulse.sentiment} />
                </div>
                <p className="text-[12px] text-zinc-300/80 leading-[1.65]">
                  {data.insights.marketPulse.text}
                </p>
              </motion.div>

              {/* AI Top Picks */}
              {data.insights.aiTopPicks.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowPicks(!showPicks)}
                    aria-expanded={showPicks}
                    className="w-full flex items-center justify-between py-1.5 px-1 group"
                  >
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.1em] group-hover:text-zinc-300 transition-colors">
                      Top Picks
                      <span className="ml-1.5 text-[9px] font-mono text-zinc-600">{data.insights.aiTopPicks.length}</span>
                    </span>
                    <motion.div animate={{ rotate: showPicks ? 180 : 0 }} transition={{ duration: 0.2 }}>
                      <HiOutlineChevronDown className="w-3 h-3 text-zinc-600" />
                    </motion.div>
                  </button>
                  <AnimatePresence>
                    {showPicks && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden space-y-1.5"
                      >
                        {data.insights.aiTopPicks.map((pick, i) => (
                          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15, delay: i * 0.05 }}>
                            <TopPickCard question={pick.question} text={pick.text} sentiment={pick.sentiment} confidence={pick.confidence} />
                          </motion.div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Trending Narratives */}
              {data.insights.trendingNarratives.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowNarratives(!showNarratives)}
                    aria-expanded={showNarratives}
                    className="w-full flex items-center justify-between py-1.5 px-1 group"
                  >
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.1em] group-hover:text-zinc-300 transition-colors">
                      Narratives
                      <span className="ml-1.5 text-[9px] font-mono text-zinc-600">{data.insights.trendingNarratives.length}</span>
                    </span>
                    <motion.div animate={{ rotate: showNarratives ? 180 : 0 }} transition={{ duration: 0.2 }}>
                      <HiOutlineChevronDown className="w-3 h-3 text-zinc-600" />
                    </motion.div>
                  </button>
                  <AnimatePresence>
                    {showNarratives && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden space-y-1.5"
                      >
                        {data.insights.trendingNarratives.map((narrative, i) => (
                          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15, delay: i * 0.05 }}>
                            <NarrativeChip theme={narrative.theme} text={narrative.text} marketCount={narrative.relatedMarketCount} />
                          </motion.div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Disclaimer */}
              <p className="text-[9px] text-zinc-600 text-center pt-2 pb-1 leading-relaxed">
                AI-generated insights. Not financial advice.
              </p>
            </div>
          ) : timedOut ? (
            <div className="flex flex-col items-center justify-center py-8 px-3 text-center">
              <p className="text-[12px] text-zinc-400 leading-relaxed">AI insights are temporarily unavailable.</p>
              <p className="text-[10px] text-zinc-600 mt-1">Please check back shortly.</p>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-8 px-3 text-center"
            >
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3 bg-white/[0.05] border border-white/[0.08]">
                <AIIcon size={20} />
              </div>
              <p className="text-[11px] text-zinc-500 leading-relaxed">AI insights are being generated</p>
              <div className="flex items-center gap-1 mt-2.5">
                {[0, 1, 2].map(i => (
                  <motion.div key={i} className="w-1 h-1 rounded-full bg-[#4ADE80]" animate={{ opacity: [0.2, 0.8, 0.2] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} />
                ))}
              </div>
            </motion.div>
          )}
          </>}
        </div>
      </div>
    </div>
  );

  // ── Docked mode: inline in sidebar, always visible ──
  if (docked) {
    return (
      <div className="w-full" role="region" aria-label="AI Insights">
        {expandedPanel}
      </div>
    );
  }

  // ── Floating mode: mobile responsive + desktop draggable ──
  return (
    <>
    {/* Mobile: small circular button */}
    {collapsed && (
      <div className="md:hidden fixed z-40" style={{ right: '0.75rem', bottom: '5rem' }}>
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
      <div className="md:hidden fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={() => setCollapsed(true)}>
        <div className="flex-1 overflow-y-auto p-4 pt-16" onClick={(e) => e.stopPropagation()}>
          <div className="iridescent-border max-w-md mx-auto">
            <div className="iridescent-inner overflow-hidden">
              <button onClick={() => setCollapsed(true)} className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-2.5">
                  <AIIcon size={18} />
                  <span className="text-[13px] font-bold tracking-[0.12em] uppercase text-[#4ADE80]">AI Market Pulse</span>
                </div>
                <span className="text-zinc-500 text-sm">✕</span>
              </button>
              <div className="h-[1px] w-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(74,222,128,0.15) 50%, transparent)' }} />
              <div className="p-3 space-y-3 max-h-[70vh] overflow-y-auto">
                {isLoading ? (
                  <InsightSkeleton />
                ) : data?.insights ? (
                  <>
                    <div className="rounded-xl p-3 bg-white/[0.03] border border-white/[0.06]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.1em]">Market Pulse</span>
                        <SentimentBadge sentiment={data.insights.marketPulse.sentiment} />
                      </div>
                      <p className="text-[12px] text-zinc-300/80 leading-[1.65]">{data.insights.marketPulse.text}</p>
                    </div>
                    {data.insights.aiTopPicks.length > 0 && (
                      <div>
                        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.1em] px-1">Top Picks</span>
                        <div className="space-y-1.5 mt-1.5">
                          {data.insights.aiTopPicks.map((pick, i) => (
                            <TopPickCard key={i} question={pick.question} text={pick.text} sentiment={pick.sentiment} confidence={pick.confidence} />
                          ))}
                        </div>
                      </div>
                    )}
                    {data.insights.trendingNarratives.length > 0 && (
                      <div>
                        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.1em] px-1">Narratives</span>
                        <div className="space-y-1.5 mt-1.5">
                          {data.insights.trendingNarratives.map((n, i) => (
                            <NarrativeChip key={i} theme={n.theme} text={n.text} marketCount={n.relatedMarketCount} />
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-[9px] text-zinc-600 text-center pt-2 pb-1">AI-generated insights. Not financial advice.</p>
                  </>
                ) : timedOut ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <p className="text-[12px] text-zinc-400">AI insights are temporarily unavailable.</p>
                    <p className="text-[10px] text-zinc-600 mt-1">Please check back shortly.</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3 bg-white/[0.05] border border-white/[0.08]">
                      <AIIcon size={20} />
                    </div>
                    <p className="text-[11px] text-zinc-500">AI insights are being generated</p>
                    <div className="flex items-center gap-1 mt-2.5">
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

    {/* Desktop: draggable floating panel (md to xl; xl+ uses docked sidebar) */}
    <div ref={constraintsRef} className="fixed pointer-events-none hidden md:block" style={{ zIndex: 39, top: '5.5rem', left: 0, right: 0, bottom: 0 }} />
    <motion.div
      ref={panelRef}
      drag
      dragMomentum={false}
      dragConstraints={constraintsRef}
      dragElastic={0.1}
      className="hidden md:block xl:hidden"
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
        <div className="iridescent-pill">
          <button
            onClick={handleExpand}
            aria-label="Open AI insights"
            className="pill-inner flex items-center gap-3 px-5 py-3 hover:bg-white/[0.04] transition-colors"
          >
            <AIIcon size={24} />
            <span className="text-[12px] font-bold tracking-[0.08em]" style={{ background: 'linear-gradient(135deg, #4ADE80, #22D3EE)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              AI Insights
            </span>
          </button>
        </div>
      ) : (
        expandedPanel
      )}
    </motion.div>
    </>
  );
}
