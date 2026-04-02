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

const ROTATE_MS = 8000;
const OUTCOME_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'];

export default function FeaturedHero({ market: singleMarket, markets: marketsProp, rotateInterval = ROTATE_MS }: FeaturedHeroProps) {
  const rotationMarkets = useMemo(() => {
    const source = marketsProp || (singleMarket ? [singleMarket] : []);
    if (source.length <= 1) return source;
    const seen = new Set<string>();
    const picked: PredictionMarket[] = [];
    for (const m of source) {
      const cat = m.category || 'other';
      if (!seen.has(cat)) { seen.add(cat); picked.push(m); }
      if (picked.length >= 5) break;
    }
    return picked.length > 0 ? picked : source.slice(0, 1);
  }, [marketsProp, singleMarket]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const startRef = useRef(Date.now());

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

  const ext = market as ExtendedMarket;
  const isMulti = ext.marketType === 'multi' && (ext.outcomeCount || 0) > 2;
  const yesPercent = Math.round(market.yesPrice * 100);
  const noPercent = Math.round(market.noPrice * 100);
  const priceChange = market.yesPriceChange24h;
  const isPositive = priceChange > 0;
  const timeInfo = formatTimeRemaining(market.closesAt);
  const catInfo = categoryConfig[market.category] || categoryConfig.other;
  const href = `/predictions/${market.ticker}`;

  const sparkData = useMemo(() => {
    return market.priceHistory || generateMockSparkline(market.ticker, market.yesPrice, priceChange);
  }, [market.ticker, market.priceHistory, market.yesPrice, priceChange]);

  const displayOutcomes = useMemo(() => {
    if (isMulti && ext.topOutcomes && ext.topOutcomes.length > 0) {
      return ext.topOutcomes.slice(0, 4);
    }
    return null;
  }, [isMulti, ext.topOutcomes]);

  return (
    <Link href={href} className="block h-full" aria-label={market.title}>
      <div
        className="relative h-full overflow-hidden"
        style={{ borderRadius: 16, minHeight: 240 }}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {/* Cinematic bg */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #0c1018 0%, #111827 50%, #0f1520 100%)' }} />

        {/* Ambient accent glow — top right */}
        <div className="absolute pointer-events-none" style={{ top: -80, right: -60, width: 280, height: 280, borderRadius: '50%', background: `radial-gradient(circle, ${catInfo.color}10 0%, transparent 70%)`, filter: 'blur(50px)' }} />

        {/* Glass border */}
        <div className="absolute inset-0 pointer-events-none" style={{ borderRadius: 16, border: '1px solid rgba(255,255,255,0.07)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }} />

        <AnimatePresence mode="wait">
          <motion.div
            key={market.ticker}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            className="relative h-full p-5 sm:p-6 flex flex-col"
          >
            {/* Row 1: Badges + metrics */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, backgroundColor: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.20)', color: '#60a5fa' }}>
                  Featured
                </span>
                <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, backgroundColor: `${catInfo.color}12`, color: catInfo.color }}>
                  {catInfo.label}
                </span>
              </div>
              {/* Key metrics — right side */}
              <div className="flex items-center gap-4" style={{ fontSize: 11, color: T.muted, fontVariantNumeric: 'tabular-nums' }}>
                <span>{formatVolume(market.totalVolume || market.volume24h)} Vol</span>
                <span>{timeInfo.text}</span>
                {priceChange !== 0 && (
                  <span style={{ color: isPositive ? T.green : T.red }}>
                    {isPositive ? '+' : ''}{(priceChange * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>

            {/* Row 2: Title + Small image */}
            <div className="flex items-start gap-3 mb-4">
              {market.imageUrl && (
                <img
                  src={market.imageUrl}
                  alt=""
                  className="flex-shrink-0 rounded-lg object-cover"
                  style={{ width: 36, height: 36, border: '1px solid rgba(255,255,255,0.06)' }}
                />
              )}
              <h2 style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3, color: '#f0f2f5', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden', letterSpacing: '-0.01em' }}>
                {market.title}
              </h2>
            </div>

            {/* Row 3: Main content — chart left, outcomes right */}
            <div className="flex flex-col sm:flex-row gap-4 flex-1 min-h-0">
              {/* Chart — takes available space */}
              <div className="flex-1 min-w-0 rounded-xl overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', padding: 8 }}>
                <MiniSparkline data={sparkData} width={400} height={100} color="rgba(59,130,246,0.5)" showGradient />
              </div>

              {/* Outcomes column — fixed width */}
              <div className="flex flex-col gap-2 sm:w-[220px] flex-shrink-0">
                {displayOutcomes ? (
                  /* Multi-outcome rows */
                  displayOutcomes.map((outcome, i) => {
                    const pct = Math.round(outcome.probability * 100);
                    const color = OUTCOME_COLORS[i % OUTCOME_COLORS.length];
                    return (
                      <div
                        key={outcome.name}
                        className="flex items-center justify-between px-3 py-2 rounded-lg"
                        style={{ backgroundColor: `${color}08`, border: `1px solid ${color}15` }}
                      >
                        <span className="truncate mr-2" style={{ fontSize: 12, color: T.textSecondary }}>{outcome.name}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: i === 0 ? '#fff' : T.textSecondary, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
                      </div>
                    );
                  })
                ) : (
                  /* Binary Yes/No */
                  <>
                    <div
                      className="flex items-center justify-between px-4 py-3 rounded-xl"
                      style={{ backgroundColor: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.greenText }}>Yes</span>
                      <span style={{ fontSize: 20, fontWeight: 800, color: T.greenText, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{yesPercent}¢</span>
                    </div>
                    <div
                      className="flex items-center justify-between px-4 py-3 rounded-xl"
                      style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.redText }}>No</span>
                      <span style={{ fontSize: 20, fontWeight: 800, color: T.redText, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{noPercent}¢</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Progress bar */}
        {rotationMarkets.length > 1 && (
          <div className="absolute bottom-0 left-0 right-0" style={{ height: 2, backgroundColor: 'rgba(255,255,255,0.03)' }}>
            <div style={{ height: '100%', width: `${progress * 100}%`, backgroundColor: T.accent, opacity: 0.5, transition: 'width 50ms linear' }} />
          </div>
        )}

        {/* Dots */}
        {rotationMarkets.length > 1 && (
          <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1.5">
            {rotationMarkets.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCurrentIndex(i); startRef.current = Date.now(); setProgress(0); }}
                style={{ width: i === currentIndex ? 14 : 5, height: 5, borderRadius: 3, backgroundColor: i === currentIndex ? T.accent : 'rgba(255,255,255,0.12)', transition: 'all 250ms cubic-bezier(0.16,1,0.3,1)', border: 'none', cursor: 'pointer', padding: 0 }}
              />
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
