import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineSparkles, HiOutlineChevronDown, HiOutlineX } from 'react-icons/hi';
import { useHomepageInsights } from '~/hooks/useHomepageInsights';
import { SentimentBadge } from './SentimentBadge';
import { TopPickCard } from './TopPickCard';
import { NarrativeChip } from './NarrativeChip';
import { InsightSkeleton } from './InsightSkeleton';

export function HomepageInsightPanel() {
  const router = useRouter();
  const { data, isLoading } = useHomepageInsights();
  const [collapsed, setCollapsed] = useState(false);
  const [showPicks, setShowPicks] = useState(false);
  const [showNarratives, setShowNarratives] = useState(false);

  return (
    <div
      className="hidden xl:block"
      style={{
        position: 'fixed',
        right: '1rem',
        top: '5rem',
        width: 320,
        zIndex: 40,
      }}
    >
      <div
        className="rounded-xl overflow-hidden shadow-2xl"
        style={{
          backgroundColor: '#12141a',
          border: '1px solid #1e2028',
        }}
      >
        {/* Header */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors"
        >
          <div className="flex items-center gap-2">
            <HiOutlineSparkles className="w-4 h-4 text-[#4ADE80]" />
            <span className="text-sm font-semibold text-zinc-200">AI Market Pulse</span>
          </div>
          <motion.div animate={{ rotate: collapsed ? 0 : 180 }} transition={{ duration: 0.2 }}>
            <HiOutlineChevronDown className="w-4 h-4 text-zinc-500" />
          </motion.div>
        </button>

        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {isLoading ? (
                <InsightSkeleton />
              ) : data?.insights ? (
                <div className="px-3 pb-3 space-y-3 max-h-[calc(100vh-8rem)] overflow-y-auto">
                  {/* Market Pulse - always expanded */}
                  <div className="p-3 rounded-lg border border-white/[0.06]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-zinc-300">Market Pulse</span>
                      <SentimentBadge sentiment={data.insights.marketPulse.sentiment} />
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      {data.insights.marketPulse.text}
                    </p>
                  </div>

                  {/* AI Top Picks - collapsible */}
                  {data.insights.aiTopPicks.length > 0 && (
                    <div>
                      <button
                        onClick={() => setShowPicks(!showPicks)}
                        className="w-full flex items-center justify-between py-1.5 text-xs font-semibold text-zinc-300"
                      >
                        AI Top Picks ({data.insights.aiTopPicks.length})
                        <motion.div animate={{ rotate: showPicks ? 180 : 0 }} transition={{ duration: 0.2 }}>
                          <HiOutlineChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                        </motion.div>
                      </button>
                      <AnimatePresence>
                        {showPicks && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden space-y-2"
                          >
                            {data.insights.aiTopPicks.map((pick, i) => (
                              <TopPickCard
                                key={i}
                                question={pick.question}
                                text={pick.text}
                                sentiment={pick.sentiment}
                                confidence={pick.confidence}
                                onClick={() => router.push(`/predictions/${pick.marketId}?source=${pick.source}`)}
                              />
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Trending Narratives - collapsible */}
                  {data.insights.trendingNarratives.length > 0 && (
                    <div>
                      <button
                        onClick={() => setShowNarratives(!showNarratives)}
                        className="w-full flex items-center justify-between py-1.5 text-xs font-semibold text-zinc-300"
                      >
                        Trending Narratives ({data.insights.trendingNarratives.length})
                        <motion.div animate={{ rotate: showNarratives ? 180 : 0 }} transition={{ duration: 0.2 }}>
                          <HiOutlineChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                        </motion.div>
                      </button>
                      <AnimatePresence>
                        {showNarratives && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden space-y-2"
                          >
                            {data.insights.trendingNarratives.map((narrative, i) => (
                              <NarrativeChip
                                key={i}
                                theme={narrative.theme}
                                text={narrative.text}
                                marketCount={narrative.relatedMarketCount}
                              />
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 px-3 text-center">
                  <HiOutlineSparkles className="w-6 h-6 text-zinc-600 mb-2" />
                  <p className="text-[11px] text-zinc-500">AI insights are being generated. Check back shortly.</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
