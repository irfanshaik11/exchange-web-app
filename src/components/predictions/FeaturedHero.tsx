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

export default function FeaturedHero({ market: singleMarket, markets: marketsProp, rotateInterval = ROTATE_MS }: FeaturedHeroProps) {
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
      return ext.topOutcomes.slice(0, 3).map((o, i) => ({
        name: o.name,
        pct: Math.round(o.probability * 100),
        color: i === 0 ? T.green : i === 1 ? T.blue : T.yellow,
      }));
    }
    return null;
  }, [isMulti, ext.topOutcomes]);

  return (
    <Link href={href} className="block h-full" aria-label={market.title}>
      <div
        className="relative h-full overflow-hidden"
        style={{ borderRadius: 16, minHeight: 300 }}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {/* Cinematic gradient background */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, #0a0c14 0%, #111827 40%, #0f172a 100%)`,
          }}
        />

        {/* Ambient glow blob — accent color, slow pulse */}
        <div
          className="absolute pointer-events-none"
          style={{
            top: -60,
            right: -40,
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${catInfo.color}12 0%, transparent 70%)`,
            filter: 'blur(40px)',
          }}
        />
        <div
          className="absolute pointer-events-none"
          style={{
            bottom: -80,
            left: -20,
            width: 250,
            height: 250,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${T.accent}08 0%, transparent 70%)`,
            filter: 'blur(50px)',
          }}
        />

        {/* Glassmorphism border */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        />

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={market.ticker}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
            className="relative flex flex-col sm:flex-row h-full"
            style={{ minHeight: 300 }}
          >
            {/* Left column */}
            <div className="flex flex-col flex-1 p-6 sm:pr-2 justify-between" style={{ minWidth: 0 }}>
              {/* Top: badge + category */}
              <div className="flex items-center gap-2 mb-4">
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase' as const,
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    border: '1px solid rgba(59, 130, 246, 0.25)',
                    color: '#60a5fa',
                  }}
                >
                  Featured
                </span>
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    backgroundColor: `${catInfo.color}15`,
                    color: catInfo.color,
                  }}
                >
                  {catInfo.label}
                </span>
              </div>

              {/* Title */}
              <h2
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  lineHeight: 1.3,
                  color: '#f0f2f5',
                  marginBottom: 16,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical' as any,
                  overflow: 'hidden',
                  letterSpacing: '-0.01em',
                }}
              >
                {market.title}
              </h2>

              {/* Outcomes or Yes/No */}
              {displayOutcomes ? (
                <div className="flex flex-col gap-2 mb-4">
                  {displayOutcomes.map((o) => (
                    <div key={o.name} className="flex items-center gap-3">
                      <div
                        style={{
                          flex: 1,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: 'rgba(255,255,255,0.06)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${o.pct}%`,
                            height: '100%',
                            borderRadius: 3,
                            backgroundColor: o.color,
                            opacity: 0.7,
                            transition: 'width 400ms ease',
                          }}
                        />
                      </div>
                      <span className="flex-shrink-0 truncate" style={{ fontSize: 13, color: T.textSecondary, maxWidth: 120 }}>
                        {o.name}
                      </span>
                      <span
                        className="flex-shrink-0"
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: '#fff',
                          fontVariantNumeric: 'tabular-nums',
                          minWidth: 36,
                          textAlign: 'right',
                        }}
                      >
                        {o.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex gap-3 mb-4">
                  {/* Yes pill */}
                  <div
                    className="flex-1 flex items-center justify-between px-4 py-3 rounded-xl"
                    style={{
                      backgroundColor: 'rgba(34, 197, 94, 0.08)',
                      border: '1px solid rgba(34, 197, 94, 0.18)',
                      backdropFilter: 'blur(8px)',
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 600, color: T.greenText }}>Yes</span>
                    <span
                      style={{
                        fontSize: 22,
                        fontWeight: 800,
                        color: T.greenText,
                        fontVariantNumeric: 'tabular-nums',
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {yesPercent}¢
                    </span>
                  </div>
                  {/* No pill */}
                  <div
                    className="flex-1 flex items-center justify-between px-4 py-3 rounded-xl"
                    style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.18)',
                      backdropFilter: 'blur(8px)',
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 600, color: T.redText }}>No</span>
                    <span
                      style={{
                        fontSize: 22,
                        fontWeight: 800,
                        color: T.redText,
                        fontVariantNumeric: 'tabular-nums',
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {noPercent}¢
                    </span>
                  </div>
                </div>
              )}

              {/* Footer stats */}
              <div className="flex items-center gap-4" style={{ fontSize: 12, color: T.muted }}>
                <span className="flex items-center gap-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>
                  {formatVolume(market.totalVolume || market.volume24h)} Vol
                </span>
                <span className="flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  {timeInfo.text}
                </span>
                {priceChange !== 0 && (
                  <span style={{ color: isPositive ? T.green : T.red, fontVariantNumeric: 'tabular-nums' }}>
                    {isPositive ? '+' : ''}{(priceChange * 100).toFixed(1)}%
                  </span>
                )}
                {market.traderCount && (
                  <span>{market.traderCount.toLocaleString()} traders</span>
                )}
              </div>
            </div>

            {/* Right column — image + chart */}
            <div className="hidden sm:flex flex-col p-6 sm:pl-2" style={{ flex: '0 0 40%' }}>
              {/* Market image */}
              {market.imageUrl && (
                <div
                  className="w-full overflow-hidden mb-3"
                  style={{
                    aspectRatio: '16/10',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <img src={market.imageUrl} alt="" className="w-full h-full object-cover" />
                </div>
              )}

              {/* Chart */}
              <div
                className="flex-1 min-h-[80px] rounded-xl overflow-hidden"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.04)',
                  padding: '8px',
                }}
              >
                <MiniSparkline
                  data={sparkData}
                  width={320}
                  height={120}
                  color="rgba(59, 130, 246, 0.6)"
                  showGradient
                />
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Progress bar */}
        {rotationMarkets.length > 1 && (
          <div
            className="absolute bottom-0 left-0 right-0"
            style={{ height: 2, backgroundColor: 'rgba(255,255,255,0.04)' }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress * 100}%`,
                backgroundColor: T.accent,
                opacity: 0.6,
                transition: 'width 50ms linear',
              }}
            />
          </div>
        )}

        {/* Rotation dots */}
        {rotationMarkets.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {rotationMarkets.map((_, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCurrentIndex(i);
                  startRef.current = Date.now();
                  setProgress(0);
                }}
                className="rounded-full"
                style={{
                  width: i === currentIndex ? 16 : 6,
                  height: 6,
                  backgroundColor: i === currentIndex ? T.accent : 'rgba(255,255,255,0.15)',
                  borderRadius: 3,
                  transition: 'all 300ms cubic-bezier(0.16, 1, 0.3, 1)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
