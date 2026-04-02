import React, { useMemo, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { T } from './theme';
import { categoryConfig } from './PredictionCard';
import type { PredictionMarket } from './PredictionCard';
import MiniSparkline from './MiniSparkline';
import { generateMockSparkline, formatVolume, formatTimeRemaining } from './utils';

interface ExtendedMarket extends PredictionMarket {
  marketType?: 'binary' | 'multi';
  outcomeCount?: number;
  topOutcomes?: { name: string; probability: number }[];
}

interface FeaturedHeroProps {
  market?: PredictionMarket;
  markets?: PredictionMarket[];
  rotateInterval?: number;
}

const ROTATE_MS = 6000;

export default function FeaturedHero({ market: singleMarket, markets: marketsProp, rotateInterval = ROTATE_MS }: FeaturedHeroProps) {
  // Pick one top market per unique category for rotation
  const rotationMarkets = useMemo(() => {
    const source = marketsProp || (singleMarket ? [singleMarket] : []);
    if (source.length <= 1) return source;
    const seen = new Set<string>();
    const picked: PredictionMarket[] = [];
    for (const m of source) {
      const cat = m.category || 'other';
      if (!seen.has(cat)) {
        seen.add(cat);
        picked.push(m);
      }
      if (picked.length >= 5) break;
    }
    return picked.length > 0 ? picked : source.slice(0, 1);
  }, [marketsProp, singleMarket]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const startRef = useRef(Date.now());

  // Auto-rotate with ref-based timer (no double-advance bug)
  useEffect(() => {
    if (rotationMarkets.length <= 1 || isPaused) return;
    startRef.current = Date.now();
    setProgress(0);
    const tick = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const p = elapsed / rotateInterval;
      if (p >= 1) {
        setCurrentIndex((prev) => (prev + 1) % rotationMarkets.length);
        startRef.current = Date.now();
        setProgress(0);
      } else {
        setProgress(p);
      }
    }, 50);
    return () => clearInterval(tick);
  }, [rotationMarkets.length, rotateInterval, isPaused]);

  const market = rotationMarkets[currentIndex % rotationMarkets.length];
  if (!market) return null;

  return (
    <FeaturedCard
      market={market}
      progress={rotationMarkets.length > 1 ? progress : -1}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    />
  );
}

/** The actual featured card rendering */
function FeaturedCard({
  market,
  progress,
  onMouseEnter,
  onMouseLeave,
}: {
  market: PredictionMarket;
  progress: number;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const ext = market as ExtendedMarket;
  const isMulti = ext.marketType === 'multi' && (ext.outcomeCount || 0) > 2;
  const yesPercent = Math.round(market.yesPrice * 100);
  const noPercent = Math.round(market.noPrice * 100);
  const priceChange = market.yesPriceChange24h;
  const isPositive = priceChange > 0;
  const timeInfo = formatTimeRemaining(market.closesAt);
  const href = `/predictions/${market.ticker}`;

  const sparkData = useMemo(() => {
    return market.priceHistory || generateMockSparkline(market.ticker, market.yesPrice, priceChange);
  }, [market.ticker, market.priceHistory, market.yesPrice, priceChange]);

  // Top 2 outcomes for multi-outcome markets
  const displayOutcomes = useMemo(() => {
    if (isMulti && ext.topOutcomes && ext.topOutcomes.length > 0) {
      return ext.topOutcomes.slice(0, 2).map((o) => ({
        name: o.name,
        pct: Math.round(o.probability * 100),
        color: '#22c55e',
      }));
    }
    return [
      { name: 'Yes', pct: yesPercent, color: T.green },
      { name: 'No', pct: noPercent, color: T.red },
    ];
  }, [isMulti, ext.topOutcomes, yesPercent, noPercent]);

  return (
    <Link href={href} className="block h-full" aria-label={market.title}>
      {/* Gradient border wrapper */}
      <div
        className="h-full"
        style={{
          padding: 1,
          borderRadius: 12,
          background: 'linear-gradient(135deg, #2a2e35 0%, #3b82f6 40%, #2a2e35 80%)',
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <div
          className="h-full flex flex-col sm:flex-row overflow-hidden relative"
          style={{
            backgroundColor: T.bgCard,
            borderRadius: 11,
            minHeight: 280,
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={market.ticker}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: 'easeInOut' }}
              className="flex flex-col sm:flex-row flex-1"
            >
              {/* Left column — 55% */}
              <div className="flex flex-col flex-1 p-6 sm:pr-0" style={{ flex: '0 0 55%' }}>
                {/* Featured badge */}
                <span
                  className="self-start"
                  style={{
                    padding: '3px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase' as const,
                    backgroundColor: 'rgba(59, 130, 246, 0.12)',
                    border: '1px solid rgba(59, 130, 246, 0.25)',
                    color: '#3b82f6',
                  }}
                >
                  Featured
                </span>

                {/* Title */}
                <h2
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    lineHeight: 1.35,
                    color: '#e8eaed',
                    marginTop: 12,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical' as any,
                    overflow: 'hidden',
                  }}
                >
                  {market.title}
                </h2>

                {/* Outcome rows */}
                <div className="mt-4 flex flex-col">
                  {displayOutcomes.map((o, i) => (
                    <div
                      key={o.name}
                      className="flex items-center justify-between py-2"
                      style={{
                        borderBottom: i < displayOutcomes.length - 1 ? `1px solid ${T.border}` : 'none',
                      }}
                    >
                      <span style={{ fontSize: 13, color: T.textSecondary, fontWeight: 500 }}>
                        {o.name}
                      </span>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: o.color,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {o.pct}¢
                      </span>
                    </div>
                  ))}
                </div>

                {/* Price pills (visual labels, not buttons — card link handles navigation) */}
                <div className="flex gap-2 mt-3">
                  <div
                    className="flex-1 text-center py-2 rounded-lg"
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      backgroundColor: 'rgba(34, 197, 94, 0.08)',
                      color: T.green,
                    }}
                  >
                    Yes {yesPercent}¢
                  </div>
                  <div
                    className="flex-1 text-center py-2 rounded-lg"
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      backgroundColor: 'rgba(239, 68, 68, 0.08)',
                      color: T.red,
                    }}
                  >
                    No {noPercent}¢
                  </div>
                </div>

                {/* Footer stats */}
                <div
                  className="mt-auto pt-4 flex items-center gap-4"
                  style={{ borderTop: `1px solid ${T.border}`, fontSize: 12, color: T.muted }}
                >
                  <span>{formatVolume(market.totalVolume || market.volume24h)} Vol</span>
                  <span style={{ color: timeInfo.isUrgent ? T.redText : T.muted }}>
                    {timeInfo.text}
                  </span>
                  {priceChange !== 0 && (
                    <span style={{ color: isPositive ? T.green : T.red }}>
                      {isPositive ? '+' : ''}{(priceChange * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>

              {/* Right column — 45% */}
              <div className="flex flex-col p-6 sm:pl-4" style={{ flex: '0 0 45%' }}>
                {/* Image */}
                {market.imageUrl && (
                  <div
                    className="w-full overflow-hidden mb-3"
                    style={{
                      aspectRatio: '16/10',
                      borderRadius: 8,
                    }}
                  >
                    <img
                      src={market.imageUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {/* Sparkline chart */}
                <div className="flex-1 min-h-[60px]" style={{ borderRadius: 8 }}>
                  <MiniSparkline
                    data={sparkData}
                    width={300}
                    height={100}
                    color="rgba(59, 130, 246, 0.7)"
                    showGradient
                  />
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Progress bar — bottom */}
          {progress >= 0 && (
            <div
              className="absolute bottom-0 left-0 right-0"
              style={{ height: 2, backgroundColor: T.border }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progress * 100}%`,
                  backgroundColor: '#3b82f6',
                  transition: 'width 50ms linear',
                }}
              />
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
