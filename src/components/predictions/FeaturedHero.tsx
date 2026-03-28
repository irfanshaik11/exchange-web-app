import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { T } from './theme';
import { categoryConfig } from './PredictionCard';
import type { PredictionMarket } from './PredictionCard';
import MultiLineSparkline from './MultiLineSparkline';
import { getCategoryImages } from './categoryImages';
import { generateMockSparkline, formatVolume, formatTimeRemaining } from './utils';
import { usePolymarketPriceHistory } from '~/hooks/usePolymarketMarkets';
import type { UnifiedPredictionMarket } from '~/hooks/useUnifiedPredictionMarkets';

// Distinct colors for multi-outcome chart lines
const OUTCOME_COLORS = ['#4ADE80', '#60A5FA', '#FBBF24', '#F472B6', '#A78BFA', '#FB923C', '#38BDF8', '#E879F9'];

// Extended market fields from unified hooks
interface ExtendedMarket extends PredictionMarket {
  marketType?: 'binary' | 'multi';
  subtitle?: string;
  outcomeCount?: number;
  topOutcomes?: { name: string; probability: number; tokenId?: string }[];
  liquidity?: number;
  openInterest?: number;
}

interface FeaturedHeroProps {
  market?: PredictionMarket;
  markets?: PredictionMarket[];
  /** Rotation interval in ms (default: 6000) */
  rotateInterval?: number;
}

export default function FeaturedHero({ market: singleMarket, markets: marketsProp, rotateInterval = 120000 }: FeaturedHeroProps) {
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
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1); // 1 = right, -1 = left
  const manualSelectEpoch = useRef(0);
  const touchStartX = useRef<number | null>(null);

  // Navigate and reset auto-rotation timer
  const selectIndex = useCallback((i: number) => {
    setSlideDirection(i > activeIndex ? 1 : -1);
    setActiveIndex(i);
    manualSelectEpoch.current += 1;
  }, [activeIndex]);

  const goNext = useCallback(() => {
    setSlideDirection(1);
    setActiveIndex((prev) => (prev + 1) % rotationMarkets.length);
    manualSelectEpoch.current += 1;
  }, [rotationMarkets.length]);

  const goPrev = useCallback(() => {
    setSlideDirection(-1);
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
      setSlideDirection(1);
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
  const unified = market as UnifiedPredictionMarket;
  const isMulti = ext.marketType === 'multi' && (ext.outcomeCount || 0) > 2;
  const leadingName = ext.subtitle?.replace(/^Leading:\s*/, '').replace(/\s*\(\d+%\)$/, '') || null;

  // Fetch real price history for the active hero market (1 API call)
  const yesTokenId = unified.polymarketData?.yesTokenId;
  const { history: realHistory } = usePolymarketPriceHistory(yesTokenId, {
    interval: '1w',
    fidelity: 60,
    enabled: !!yesTokenId,
  });

  // Build multi-series sparkline data — use real data when available
  const chartSeries = useMemo(() => {
    if (isMulti && ext.topOutcomes && ext.topOutcomes.length > 1) {
      return ext.topOutcomes.slice(0, 5).map((outcome, i) => ({
        data: generateMockSparkline(`${market.ticker}-${outcome.name}`, outcome.probability, (market.yesPriceChange24h || 0) * (1 - i * 0.3)),
        color: OUTCOME_COLORS[i % OUTCOME_COLORS.length],
        label: outcome.name.length > 12 ? outcome.name.slice(0, 12) + '…' : outcome.name,
      }));
    }
    // Binary: use real Polymarket history when available, fall back to mock
    const yesData = realHistory.length > 2
      ? realHistory.map(p => p.price)
      : (market.priceHistory || generateMockSparkline(market.ticker, market.yesPrice, market.yesPriceChange24h));
    const noData = yesData.map(v => 1 - v);
    return [
      { data: yesData, color: T.green, label: 'Yes' },
      { data: noData, color: T.red, label: 'No' },
    ];
  }, [market.ticker, market.priceHistory, market.yesPrice, market.yesPriceChange24h, isMulti, ext.topOutcomes, realHistory]);

  const images = getCategoryImages(market.category);
  const isActive = market.status === 'active';

  return (
    <Link href={href} className="block">
      <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={market.ticker}
        initial={{ opacity: 0, x: slideDirection * 80 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: slideDirection * -80 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="featured-hero relative overflow-hidden cursor-pointer group"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{
          backgroundColor: 'transparent',
          height: 400,
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


        {/* Subtle radial glow from center */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 50% 60% at 50% 50%, ${categoryInfo.color}08 0%, transparent 70%)`,
          }}
        />


        {/* Left image */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[300px] pointer-events-none select-none hidden md:block"
          style={{
            maskImage: `
              linear-gradient(to right, transparent 0%, black 12%, black 40%, transparent 92%),
              linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)
            `,
            maskComposite: 'intersect',
            WebkitMaskImage: `
              linear-gradient(to right, transparent 0%, black 12%, black 40%, transparent 92%),
              linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)
            `,
            WebkitMaskComposite: 'source-in',
          }}
        >
          <img
            src={images.left}
            alt=""
            className="w-full h-full object-cover"
            style={{
              filter: 'brightness(0.5) saturate(1)',
              transform: 'scale(1.15)',
            }}
            loading="eager"
          />
        </div>

        {/* Right image */}
        <div
          className="absolute right-0 top-0 bottom-0 w-[300px] pointer-events-none select-none hidden md:block"
          style={{
            maskImage: `
              linear-gradient(to left, transparent 0%, black 12%, black 40%, transparent 92%),
              linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)
            `,
            maskComposite: 'intersect',
            WebkitMaskImage: `
              linear-gradient(to left, transparent 0%, black 12%, black 40%, transparent 92%),
              linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)
            `,
            WebkitMaskComposite: 'source-in',
          }}
        >
          <img
            src={images.right}
            alt=""
            className="w-full h-full object-cover"
            style={{
              filter: 'brightness(0.4) saturate(0.9)',
              transform: 'scale(1.15) scaleX(-1)',
            }}
            loading="eager"
          />
        </div>

        {/* Content — fully centered, fills height */}
        <div className="relative z-10 flex flex-col items-center h-full px-6 pt-6 pb-4 md:px-10 md:pt-8 md:pb-4">

          {/* Category label + LIVE indicator */}
          <div className="flex items-center gap-2.5 mb-2">
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

          {/* Title + image */}
          <div className="flex items-center justify-center gap-3 max-w-3xl text-center">
            {market.imageUrl && (
              <div
                className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0"
                style={{ border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <img src={market.imageUrl} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <h2
              className="text-[26px] md:text-[34px] font-extrabold leading-tight"
              style={{
                color: T.text,
                letterSpacing: '-0.03em',
                textShadow: T.textShadowStrong,
              }}
            >
              {market.title}
            </h2>
          </div>

          {/* Spacer — pushes chart to middle */}
          <div className="flex-1" />

          {/* Probability + Multi-line Chart */}
          {isMulti && leadingName ? (
            <>
              {/* Multi-outcome: leading outcome + multi-line chart */}
              <div className="flex items-center justify-center gap-8 md:gap-14 mb-3">
                {/* Left: leading outcome */}
                <div className="flex flex-col items-center gap-2">
                  <span
                    className="text-[52px] md:text-[68px] font-extrabold leading-none"
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
                    className="text-[15px] md:text-[18px] font-semibold"
                    style={{ color: T.text, textShadow: T.textShadow }}
                  >
                    {leadingName}
                  </span>
                </div>

                {/* Center: multi-line chart */}
                <div className="flex-shrink-0">
                  <MultiLineSparkline
                    series={chartSeries}
                    width={500}
                    height={160}
                    showGradient
                    showLabels
                  />
                </div>
              </div>

              {/* Outcome legend pills */}
              <div className="flex items-center justify-center gap-2.5 flex-wrap mb-2">
                {ext.topOutcomes?.slice(0, 5).map((outcome, i) => (
                  <span
                    key={outcome.name}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
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

            </>
          ) : (
            <>
              {/* Binary: YES + chart + NO */}
              <div className="flex items-center justify-center gap-8 md:gap-14 mb-3">
                <div className="flex flex-col items-center gap-1.5">
                  <span
                    className="text-[52px] md:text-[68px] font-extrabold leading-none"
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
                    width={440}
                    height={150}
                    showGradient
                  />
                </div>

                <div className="flex flex-col items-center gap-1.5">
                  <span
                    className="text-[52px] md:text-[68px] font-extrabold leading-none"
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
                    className="text-[12px] font-bold tracking-[0.1em] uppercase"
                    style={{ color: T.red, opacity: 0.7 }}
                  >
                    No
                  </span>
                </div>
              </div>

            </>
          )}

          {/* Spacer — pushes stats to bottom */}
          <div className="flex-1" />
        </div>

        {/* Bottom stats bar */}
        <div
          className="relative z-10 flex items-center justify-center gap-6 px-6 py-3"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[10px]" style={{ color: T.muted }}>Total Vol</span>
            <span className="text-[11px] font-semibold" style={{ color: T.textSecondary }}>{formatVolume(market.totalVolume)}</span>
          </div>
          <div className="w-px h-3" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
          <div className="flex items-center gap-1.5">
            <span className="text-[10px]" style={{ color: T.muted }}>24h Vol</span>
            <span className="text-[11px] font-semibold" style={{ color: T.textSecondary }}>{formatVolume(market.volume24h)}</span>
          </div>
          <div className="w-px h-3" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
          <div className="flex items-center gap-1.5">
            <span className="text-[10px]" style={{ color: T.muted }}>Ends</span>
            <span className="text-[11px] font-semibold" style={{ color: T.textSecondary }}>{formatTimeRemaining(market.closesAt).text}</span>
          </div>
          {ext.liquidity ? (
            <>
              <div className="w-px h-3" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
              <div className="flex items-center gap-1.5">
                <span className="text-[10px]" style={{ color: T.muted }}>Liquidity</span>
                <span className="text-[11px] font-semibold" style={{ color: T.textSecondary }}>{formatVolume(ext.liquidity)}</span>
              </div>
            </>
          ) : null}
          {market.traderCount ? (
            <>
              <div className="w-px h-3" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
              <div className="flex items-center gap-1.5">
                <span className="text-[10px]" style={{ color: T.muted }}>Traders</span>
                <span className="text-[11px] font-semibold" style={{ color: T.textSecondary }}>{market.traderCount.toLocaleString()}</span>
              </div>
            </>
          ) : null}
          {market.yesPriceChange24h !== 0 && (
            <>
              <div className="w-px h-3" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
              <span
                className="text-[11px] font-semibold"
                style={{ color: market.yesPriceChange24h > 0 ? T.green : T.red }}
              >
                {market.yesPriceChange24h > 0 ? '+' : ''}{(market.yesPriceChange24h * 100).toFixed(1)}% 24h
              </span>
            </>
          )}
        </div>

      </motion.div>
      </AnimatePresence>

      {/* Rotation dots — below AnimatePresence so they persist during transitions */}
      {rotationMarkets.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 py-3 pl-20">
          {rotationMarkets.map((m, i) => {
            const cat = categoryConfig[m.category] || categoryConfig.other;
            return (
              <button
                key={m.ticker}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); selectIndex(i); }}
                aria-label={`Show ${cat.label} market`}
                className="transition-all duration-300 cursor-pointer"
                style={{
                  width: i === activeIndex ? 20 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: i === activeIndex ? cat.color : 'rgba(255,255,255,0.25)',
                }}
              />
            );
          })}
        </div>
      )}

      {/* CSS keyframes for live dot */}
      <style jsx>{`
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
