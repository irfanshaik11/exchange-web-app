import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { T } from './theme';
import { categoryConfig } from './PredictionCard';
import type { PredictionMarket } from './PredictionCard';
import MultiLineSparkline from './MultiLineSparkline';
import { getCategoryImages } from './categoryImages';
import { generateMockSparkline, formatVolume } from './utils';

// Distinct colors for multi-outcome chart lines
const OUTCOME_COLORS = ['#4ADE80', '#60A5FA', '#FBBF24', '#F472B6', '#A78BFA'];

// Extended market fields from unified hooks
interface ExtendedMarket extends PredictionMarket {
  marketType?: 'binary' | 'multi';
  subtitle?: string;
  outcomeCount?: number;
  topOutcomes?: { name: string; probability: number }[];
}

interface FeaturedHeroProps {
  market?: PredictionMarket;
  markets?: PredictionMarket[];
  /** Rotation interval in ms (default: 6000) */
  rotateInterval?: number;
}

export default function FeaturedHero({ market: singleMarket, markets: marketsProp, rotateInterval = 12000 }: FeaturedHeroProps) {
  // Build the rotation list: pick one top market per unique category
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
      if (picked.length >= 6) break; // cap at 6 categories
    }
    return picked.length > 0 ? picked : source.slice(0, 1);
  }, [marketsProp, singleMarket]);

  const [activeIndex, setActiveIndex] = useState(0);
  const manualSelectEpoch = useRef(0);
  const touchStartX = useRef<number | null>(null);

  // Navigate and reset auto-rotation timer
  const selectIndex = useCallback((i: number) => {
    setActiveIndex(i);
    manualSelectEpoch.current += 1;
  }, []);

  const goNext = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % rotationMarkets.length);
    manualSelectEpoch.current += 1;
  }, [rotationMarkets.length]);

  const goPrev = useCallback(() => {
    setActiveIndex((prev) => (prev - 1 + rotationMarkets.length) % rotationMarkets.length);
    manualSelectEpoch.current += 1;
  }, [rotationMarkets.length]);

  // Touch swipe handlers
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(diff) < 50) return; // ignore small swipes
    if (diff < 0) goNext();
    else goPrev();
  }, [goNext, goPrev]);

  // Auto-rotate — slower (12s default), restarts on any manual interaction
  useEffect(() => {
    if (rotationMarkets.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % rotationMarkets.length);
    }, rotateInterval);
    return () => clearInterval(timer);
  }, [rotationMarkets.length, rotateInterval, manualSelectEpoch.current]);

  const market = rotationMarkets[activeIndex] || rotationMarkets[0];
  if (!market) return null;

  const yesPercent = Math.round(market.yesPrice * 100);
  const noPercent = Math.round(market.noPrice * 100);
  const categoryInfo = categoryConfig[market.category] || categoryConfig.other;
  const CategoryIcon = categoryInfo.Icon;
  const isPolymarket = market.source === 'polymarket';
  const href = isPolymarket
    ? `/predictions/${market.ticker}?source=polymarket`
    : `/predictions/${market.ticker}`;

  // Multi-outcome detection (must be before chartSeries memo)
  const ext = market as ExtendedMarket;
  const isMulti = ext.marketType === 'multi' && (ext.outcomeCount || 0) > 2;
  const leadingName = ext.subtitle?.replace(/^Leading:\s*/, '').replace(/\s*\(\d+%\)$/, '') || null;

  // Build multi-series sparkline data
  const chartSeries = useMemo(() => {
    if (isMulti && ext.topOutcomes && ext.topOutcomes.length > 1) {
      return ext.topOutcomes.slice(0, 5).map((outcome, i) => ({
        data: generateMockSparkline(`${market.ticker}-${outcome.name}`, outcome.probability, (market.yesPriceChange24h || 0) * (1 - i * 0.3)),
        color: OUTCOME_COLORS[i % OUTCOME_COLORS.length],
        label: outcome.name.length > 10 ? outcome.name.slice(0, 10) + '…' : outcome.name,
      }));
    }
    const yesData = market.priceHistory || generateMockSparkline(market.ticker, market.yesPrice, market.yesPriceChange24h);
    const noData = yesData.map(v => 1 - v);
    return [
      { data: yesData, color: T.green, label: 'Yes' },
      { data: noData, color: T.red, label: 'No' },
    ];
  }, [market.ticker, market.priceHistory, market.yesPrice, market.yesPriceChange24h, isMulti, ext.topOutcomes]);

  const images = getCategoryImages(market.category);
  const isActive = market.status === 'active';

  return (
    <Link href={href} className="block h-full">
      <AnimatePresence mode="wait">
      <motion.div
        key={market.ticker}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="featured-hero relative overflow-hidden rounded-2xl cursor-pointer group h-full"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{
          background: T.bg,
          border: `1px solid ${categoryInfo.color}20`,
          minHeight: 300,
        }}
      >
        {/* Navigation arrows — visible on hover */}
        {rotationMarkets.length > 1 && (
          <>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); goPrev(); }}
              aria-label="Previous market"
              className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              style={{
                backgroundColor: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); goNext(); }}
              aria-label="Next market"
              className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              style={{
                backgroundColor: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </>
        )}
        {/* Animated border shimmer — CSS keyframe driven */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none z-20 featured-hero-shimmer"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${categoryInfo.color}00 30%, ${categoryInfo.color}25 50%, ${categoryInfo.color}00 70%, transparent 100%)`,
            backgroundSize: '200% 100%',
            mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            maskComposite: 'xor',
            WebkitMaskComposite: 'xor',
            padding: '1px',
            borderRadius: 'inherit',
          }}
        />


        {/* Subtle radial glow from bottom center */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 70% 50% at 50% 110%, ${categoryInfo.color}18 0%, transparent 70%)`,
          }}
        />

        {/* Left image — cropped, dramatic */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[320px] pointer-events-none select-none hidden md:block"
          style={{
            maskImage: 'linear-gradient(to right, rgba(0,0,0,0.7) 10%, rgba(0,0,0,0.3) 50%, transparent 85%)',
            WebkitMaskImage: 'linear-gradient(to right, rgba(0,0,0,0.7) 10%, rgba(0,0,0,0.3) 50%, transparent 85%)',
          }}
        >
          <img
            src={images.left}
            alt=""
            className="w-full h-full object-cover"
            style={{
              filter: 'brightness(0.5) saturate(1.1)',
              transform: 'scale(1.1)',
            }}
            loading="eager"
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${categoryInfo.color}15 0%, transparent 60%)`,
              mixBlendMode: 'overlay',
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(to top, ${T.bg} 0%, transparent 30%), linear-gradient(to bottom, ${T.bg} 0%, transparent 30%)`,
            }}
          />
        </div>

        {/* Right image — NOT mirrored, fade on left edge into center */}
        <div
          className="absolute right-0 top-0 bottom-0 w-[320px] pointer-events-none select-none hidden md:block"
          style={{
            maskImage: 'linear-gradient(to left, rgba(0,0,0,0.7) 10%, rgba(0,0,0,0.3) 50%, transparent 85%)',
            WebkitMaskImage: 'linear-gradient(to left, rgba(0,0,0,0.7) 10%, rgba(0,0,0,0.3) 50%, transparent 85%)',
          }}
        >
          <img
            src={images.right}
            alt=""
            className="w-full h-full object-cover"
            style={{
              filter: 'brightness(0.35) saturate(0.8)',
              transform: 'scale(1.1) scaleX(-1)',
            }}
            loading="eager"
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(to top, ${T.bg} 0%, transparent 30%), linear-gradient(to bottom, ${T.bg} 0%, transparent 30%)`,
            }}
          />
        </div>

        {/* Content — fully centered */}
        <div className="relative z-10 flex flex-col items-center justify-center h-full p-6 md:p-8" style={{ minHeight: 300 }}>

          {/* Volume stats — top-right corner */}
          <div className="absolute top-5 right-6 md:top-6 md:right-8 flex items-center gap-3">
            <span className="text-[11px] font-medium" style={{ color: T.muted, textShadow: T.textShadow }}>
              {formatVolume(market.totalVolume)} total vol
            </span>
            <span className="text-[11px] font-medium" style={{ color: T.muted, textShadow: T.textShadow }}>
              {formatVolume(market.volume24h)} 24h
            </span>
          </div>

          {/* Category label + LIVE indicator */}
          <div className="flex items-center gap-2.5 mb-5 mt-2">
            {/* Category icon with glow ring */}
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center relative"
              style={{ backgroundColor: `${categoryInfo.color}20` }}
            >
              {/* Glow ring */}
              <div
                className="absolute inset-[-3px] rounded-[10px] pointer-events-none"
                style={{
                  background: `conic-gradient(from 0deg, ${categoryInfo.color}30, transparent, ${categoryInfo.color}20, transparent, ${categoryInfo.color}30)`,
                  filter: `blur(3px)`,
                  opacity: 0.7,
                }}
              />
              <CategoryIcon className="w-4 h-4 relative z-10" style={{ color: categoryInfo.color }} />
            </div>
            <span
              className="text-[10px] font-bold tracking-[0.15em] uppercase"
              style={{ color: categoryInfo.color, textShadow: T.textShadow }}
            >
              {categoryInfo.label}
            </span>
            {/* LIVE indicator */}
            {isActive && (
              <span className="flex items-center gap-1.5 text-[9px] font-bold tracking-[0.12em] uppercase" style={{ color: T.green }}>
                <span
                  className="w-1.5 h-1.5 rounded-full featured-hero-live-dot"
                  style={{ backgroundColor: T.green, boxShadow: `0 0 6px ${T.green}` }}
                />
                Live
              </span>
            )}
            <span
              className="text-[10px] font-bold tracking-[0.15em] uppercase"
              style={{ color: T.muted }}
            >
              / Featured
            </span>
          </div>

          {/* Title */}
          <div className="max-w-2xl text-center mb-5">
            <h2
              className="text-[22px] md:text-[28px] font-extrabold leading-tight"
              style={{
                color: T.text,
                letterSpacing: '-0.03em',
                textShadow: T.textShadowStrong,
              }}
            >
              {market.title}
            </h2>
          </div>

          {/* Probability + Multi-line Chart */}
          {isMulti && leadingName ? (
            <>
              {/* Multi-outcome: leading outcome + multi-line chart */}
              <div className="flex items-center justify-center gap-6 md:gap-10 mb-4">
                {/* Left: leading outcome */}
                <div className="flex flex-col items-center gap-1.5">
                  <span
                    className="text-[40px] md:text-[52px] font-extrabold leading-none"
                    style={{
                      color: OUTCOME_COLORS[0],
                      letterSpacing: '-0.04em',
                      fontVariantNumeric: 'tabular-nums',
                      textShadow: `0 0 30px ${OUTCOME_COLORS[0]}40`,
                    }}
                  >
                    {yesPercent}%
                  </span>
                  <span
                    className="text-[13px] md:text-[15px] font-semibold"
                    style={{ color: T.text, textShadow: T.textShadow }}
                  >
                    {leadingName}
                  </span>
                </div>

                {/* Center: multi-line chart */}
                <div className="flex-shrink-0">
                  <MultiLineSparkline
                    series={chartSeries}
                    width={320}
                    height={100}
                    showGradient
                    showLabels
                  />
                </div>
              </div>

              {/* Outcome legend pills */}
              <div className="flex items-center justify-center gap-2 flex-wrap mb-2">
                {ext.topOutcomes?.slice(0, 5).map((outcome, i) => (
                  <span
                    key={outcome.name}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium"
                    style={{
                      backgroundColor: `${OUTCOME_COLORS[i % OUTCOME_COLORS.length]}12`,
                      color: OUTCOME_COLORS[i % OUTCOME_COLORS.length],
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: OUTCOME_COLORS[i % OUTCOME_COLORS.length] }}
                    />
                    {outcome.name.length > 16 ? outcome.name.slice(0, 16) + '…' : outcome.name}
                    <span style={{ opacity: 0.7 }}>{Math.round(outcome.probability * 100)}%</span>
                  </span>
                ))}
                {(ext.outcomeCount || 0) > 5 && (
                  <span className="text-[10px] font-medium" style={{ color: T.muted }}>
                    +{(ext.outcomeCount || 0) - 5} more
                  </span>
                )}
              </div>

              {market.yesPriceChange24h !== 0 && (
                <div className="flex justify-center">
                  <span
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-md"
                    style={{
                      backgroundColor: market.yesPriceChange24h > 0 ? T.greenSoft : T.redSoft,
                      color: market.yesPriceChange24h > 0 ? T.green : T.red,
                    }}
                  >
                    {market.yesPriceChange24h > 0 ? '+' : ''}{(market.yesPriceChange24h * 100).toFixed(1)}% 24h
                  </span>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Binary: YES + chart + NO */}
              <div className="flex items-center justify-center gap-5 md:gap-8 mb-4">
                <div className="flex flex-col items-center gap-1">
                  <span
                    className="text-[40px] md:text-[52px] font-extrabold leading-none"
                    style={{
                      color: T.green,
                      letterSpacing: '-0.04em',
                      fontVariantNumeric: 'tabular-nums',
                      textShadow: `0 0 30px ${T.green}40`,
                    }}
                  >
                    {yesPercent}%
                  </span>
                  <span
                    className="text-[11px] font-bold tracking-[0.1em] uppercase"
                    style={{ color: T.green, opacity: 0.7 }}
                  >
                    Yes
                  </span>
                </div>

                {/* Dual-line chart: YES (green) + NO (red) */}
                <div className="flex-shrink-0">
                  <MultiLineSparkline
                    series={chartSeries}
                    width={280}
                    height={90}
                    showGradient
                  />
                </div>

                <div className="flex flex-col items-center gap-1">
                  <span
                    className="text-[40px] md:text-[52px] font-extrabold leading-none"
                    style={{
                      color: T.red,
                      letterSpacing: '-0.04em',
                      fontVariantNumeric: 'tabular-nums',
                      textShadow: `0 0 30px ${T.red}40`,
                    }}
                  >
                    {noPercent}%
                  </span>
                  <span
                    className="text-[11px] font-bold tracking-[0.1em] uppercase"
                    style={{ color: T.red, opacity: 0.7 }}
                  >
                    No
                  </span>
                </div>
              </div>

              {market.yesPriceChange24h !== 0 && (
                <div className="flex justify-center">
                  <span
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-md"
                    style={{
                      backgroundColor: market.yesPriceChange24h > 0 ? T.greenSoft : T.redSoft,
                      color: market.yesPriceChange24h > 0 ? T.green : T.red,
                    }}
                  >
                    {market.yesPriceChange24h > 0 ? '+' : ''}{(market.yesPriceChange24h * 100).toFixed(1)}% 24h
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Bottom gradient glow line */}
        <div
          className="absolute bottom-0 left-0 right-0 h-[2px]"
          style={{
            background: `linear-gradient(90deg, transparent 5%, ${categoryInfo.color}60 30%, ${categoryInfo.color}80 50%, ${categoryInfo.color}60 70%, transparent 95%)`,
            boxShadow: `0 0 12px ${categoryInfo.color}30`,
          }}
        />
      </motion.div>
      </AnimatePresence>

      {/* Rotation dots */}
      {rotationMarkets.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {rotationMarkets.map((m, i) => {
            const cat = categoryConfig[m.category] || categoryConfig.other;
            return (
              <button
                key={m.ticker}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); selectIndex(i); }}
                aria-label={`Show ${cat.label} market`}
                className="transition-all duration-300"
                style={{
                  width: i === activeIndex ? 20 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: i === activeIndex ? cat.color : 'rgba(255,255,255,0.15)',
                }}
              />
            );
          })}
        </div>
      )}

      {/* CSS keyframes for shimmer and live dot */}
      <style jsx>{`
        .featured-hero-shimmer {
          animation: hero-shimmer 4s linear infinite;
        }
        @keyframes hero-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .featured-hero-live-dot {
          animation: live-pulse 2s ease-in-out infinite;
        }
        @keyframes live-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </Link>
  );
}
