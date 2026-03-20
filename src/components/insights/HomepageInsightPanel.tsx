import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineChevronDown } from 'react-icons/hi';
import { useHomepageInsights } from '~/hooks/useHomepageInsights';
import { SentimentBadge } from './SentimentBadge';
import { TopPickCard } from './TopPickCard';
import { NarrativeChip } from './NarrativeChip';
import { InsightSkeleton } from './InsightSkeleton';

function AIIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <motion.path
        d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"
        fill="url(#hp-g1)"
        animate={{ scale: [0.9, 1.05, 0.9], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.path
        d="M19 15L19.75 17.25L22 18L19.75 18.75L19 21L18.25 18.75L16 18L18.25 17.25L19 15Z"
        fill="url(#hp-g1)"
        animate={{ scale: [0.8, 1.1, 0.8], opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
      />
      <defs>
        <linearGradient id="hp-g1" x1="3" y1="2" x2="22" y2="21">
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

export function HomepageInsightPanel() {
  const { data, isLoading } = useHomepageInsights();
  const [collapsed, setCollapsed] = useState(false);
  const [showPicks, setShowPicks] = useState(true);
  const [showNarratives, setShowNarratives] = useState(false);

  return (
    <div
      className="hidden xl:block"
      style={{ position: 'fixed', right: '1rem', top: '5rem', width: 330, zIndex: 40 }}
    >
      {/* Main glass container — matches site's card pattern */}
      <div className="rounded-2xl overflow-hidden bg-white/[0.05] border border-white/[0.08] backdrop-blur-xl shadow-2xl">
        {/* Header */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors border-b border-white/[0.06]"
        >
          <div className="flex items-center gap-2.5">
            <AIIcon size={18} />
            <span
              className="text-[11px] font-bold tracking-[0.12em] uppercase"
              style={{
                background: 'linear-gradient(135deg, #4ADE80 0%, #22D3EE 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              AI Market Pulse
            </span>
          </div>
          <motion.div animate={{ rotate: collapsed ? 0 : 180 }} transition={{ duration: 0.2 }}>
            <HiOutlineChevronDown className="w-4 h-4 text-zinc-500" />
          </motion.div>
        </button>

        {/* Glow line */}
        <div
          className="h-[1px] w-full"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(74,222,128,0.15) 50%, transparent)' }}
        />

        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              {isLoading ? (
                <InsightSkeleton />
              ) : data?.insights ? (
                <div className="p-3 space-y-3 max-h-[calc(100vh-8rem)] overflow-y-auto">
                  {/* Market Pulse */}
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="rounded-2xl p-3 bg-white/[0.03] border border-white/[0.06]"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.1em]">Market Pulse</span>
                      <SentimentBadge sentiment={data.insights.marketPulse.sentiment} />
                    </div>
                    <p className="text-[11px] text-zinc-300/80 leading-[1.65]">
                      {data.insights.marketPulse.text}
                    </p>
                  </motion.div>

                  {/* AI Top Picks */}
                  {data.insights.aiTopPicks.length > 0 && (
                    <div>
                      <button
                        onClick={() => setShowPicks(!showPicks)}
                        className="w-full flex items-center justify-between py-1.5 px-1 group"
                      >
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.1em] group-hover:text-zinc-300 transition-colors">
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
                              <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.15, delay: i * 0.05 }}
                              >
                                <TopPickCard
                                  question={pick.question}
                                  text={pick.text}
                                  sentiment={pick.sentiment}
                                  confidence={pick.confidence}
                                />
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
                        className="w-full flex items-center justify-between py-1.5 px-1 group"
                      >
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.1em] group-hover:text-zinc-300 transition-colors">
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
                              <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.15, delay: i * 0.05 }}
                              >
                                <NarrativeChip
                                  theme={narrative.theme}
                                  text={narrative.text}
                                  marketCount={narrative.relatedMarketCount}
                                />
                              </motion.div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Timestamp */}
                  {data.generatedAt && (
                    <div className="text-center pt-2 pb-1">
                      <span className="text-[10px] font-mono text-zinc-500 tracking-wide">
                        Generated {timeAgo(data.generatedAt)}
                      </span>
                    </div>
                  )}
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
