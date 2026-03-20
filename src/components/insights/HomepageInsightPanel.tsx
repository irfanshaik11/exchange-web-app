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
      <style>{`
        @keyframes iridescentRotate {
          0% { --iridescent-angle: 0deg; }
          100% { --iridescent-angle: 360deg; }
        }
        @property --iridescent-angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        .iridescent-border-hp {
          position: relative;
          border-radius: 1rem;
          padding: 1.5px;
          background: conic-gradient(
            from var(--iridescent-angle),
            rgba(255,59,48,0.45),
            rgba(255,149,0,0.45),
            rgba(255,214,10,0.45),
            rgba(52,199,89,0.45),
            rgba(0,199,190,0.45),
            rgba(48,176,199,0.45),
            rgba(88,86,214,0.45),
            rgba(191,90,242,0.45),
            rgba(255,55,95,0.45),
            rgba(255,59,48,0.45)
          );
          animation: iridescentRotate 9s linear infinite;
        }
        .iridescent-border-hp::before {
          content: '';
          position: absolute;
          inset: -3px;
          border-radius: 1.15rem;
          background: conic-gradient(
            from var(--iridescent-angle),
            rgba(255,59,48,0.12),
            rgba(255,149,0,0.12),
            rgba(255,214,10,0.12),
            rgba(52,199,89,0.12),
            rgba(0,199,190,0.12),
            rgba(48,176,199,0.12),
            rgba(88,86,214,0.12),
            rgba(191,90,242,0.12),
            rgba(255,55,95,0.12),
            rgba(255,59,48,0.12)
          );
          filter: blur(8px);
          z-index: -1;
          animation: iridescentRotate 9s linear infinite;
        }
      `}</style>
      {/* Iridescent animated border wrapper */}
      <div className="iridescent-border-hp">
      {/* Main glass container */}
      <div
        className="rounded-2xl overflow-hidden backdrop-blur-xl shadow-2xl"
        style={{
          background: 'linear-gradient(160deg, rgba(74,222,128,0.08) 0%, rgba(18,20,26,0.97) 20%, rgba(34,211,238,0.06) 50%, rgba(18,20,26,0.97) 80%, rgba(129,140,248,0.08) 100%)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 80px rgba(74,222,128,0.05), 0 0 40px rgba(34,211,238,0.04)',
        }}
      >
        {/* Header */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors border-b border-white/[0.06]"
        >
          <div className="flex items-center gap-2.5">
            <AIIcon size={18} />
            <div className="flex flex-col">
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
              {data?.generatedAt && (
                <span className="text-[9px] text-zinc-500 mt-0.5">
                  Generated {timeAgo(data.generatedAt)}
                </span>
              )}
            </div>
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
    </div>
  );
}
