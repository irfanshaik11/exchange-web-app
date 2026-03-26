import React, { useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { T } from './theme';
import { categoryConfig } from './PredictionCard';
import type { PredictionMarket } from './PredictionCard';
import MiniSparkline from './MiniSparkline';
import { getCategoryImages } from './categoryImages';

interface FeaturedHeroProps {
  market: PredictionMarket;
}

function generateMockSparkline(currentPrice: number, change: number): number[] {
  const points = 20;
  const data: number[] = [];
  const startPrice = currentPrice / (1 + change);
  for (let i = 0; i < points; i++) {
    const progress = i / (points - 1);
    const noise = (Math.random() - 0.5) * 0.015;
    const value = startPrice + (currentPrice - startPrice) * progress + noise;
    data.push(Math.max(0, Math.min(1, value)));
  }
  return data;
}

const formatVolume = (volume: number): string => {
  if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(1)}M`;
  if (volume >= 1_000) return `$${(volume / 1_000).toFixed(0)}K`;
  return `$${volume.toFixed(0)}`;
};

export default function FeaturedHero({ market }: FeaturedHeroProps) {
  const yesPercent = Math.round(market.yesPrice * 100);
  const noPercent = Math.round(market.noPrice * 100);
  const categoryInfo = categoryConfig[market.category] || categoryConfig.other;
  const CategoryIcon = categoryInfo.Icon;
  const isPolymarket = market.source === 'polymarket';
  const href = isPolymarket
    ? `/predictions/${market.ticker}?source=polymarket`
    : `/predictions/${market.ticker}`;

  const sparklineData = useMemo(() => {
    return market.priceHistory || generateMockSparkline(market.yesPrice, market.yesPriceChange24h);
  }, [market.ticker]);

  const images = getCategoryImages(market.category);
  const isActive = market.status === 'active';

  return (
    <Link href={href} className="block">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="featured-hero relative overflow-hidden rounded-2xl cursor-pointer group"
        style={{
          background: T.bg,
          border: `1px solid ${categoryInfo.color}20`,
          minHeight: 300,
        }}
      >
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

          {/* Probability + Sparkline — sparkline centered between the two numbers */}
          <div className="flex items-center justify-center gap-5 md:gap-8 mb-6">
            {/* YES */}
            <div className="flex items-baseline gap-2">
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
                style={{ color: T.green, opacity: 0.6 }}
              >
                Yes
              </span>
            </div>

            {/* Sparkline — centered divider */}
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div className="opacity-70">
                <MiniSparkline
                  data={sparklineData}
                  width={120}
                  height={48}
                  color={market.yesPriceChange24h >= 0 ? T.green : T.red}
                  id={`hero-${market.ticker}`}
                />
              </div>
              {/* Thin divider line under sparkline */}
              <div
                className="w-8 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${T.subtle}, transparent)` }}
              />
            </div>

            {/* NO */}
            <div className="flex items-baseline gap-2">
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
                style={{ color: T.red, opacity: 0.6 }}
              >
                No
              </span>
            </div>
          </div>

          {/* CTA buttons */}
          <div className="flex items-center justify-center gap-3">
            <button
              className="px-6 py-2.5 rounded-full text-[13px] font-bold"
              style={{
                backgroundColor: T.green,
                color: '#000',
                boxShadow: `0 0 24px ${T.green}30`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              Yes — {yesPercent}¢
            </button>
            <button
              className="px-6 py-2.5 rounded-full text-[13px] font-bold"
              style={{
                backgroundColor: T.red,
                color: '#fff',
                boxShadow: `0 0 24px ${T.red}30`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              No — {noPercent}¢
            </button>

            {market.yesPriceChange24h !== 0 && (
              <span
                className="ml-2 text-[11px] font-semibold px-2 py-1 rounded-md"
                style={{
                  backgroundColor: market.yesPriceChange24h > 0 ? T.greenSoft : T.redSoft,
                  color: market.yesPriceChange24h > 0 ? T.green : T.red,
                }}
              >
                {market.yesPriceChange24h > 0 ? '+' : ''}{(market.yesPriceChange24h * 100).toFixed(1)}% 24h
              </span>
            )}
          </div>
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
