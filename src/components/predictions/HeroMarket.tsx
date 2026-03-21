import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { HiOutlineArrowRight, HiOutlineTrendingUp, HiOutlineClock } from 'react-icons/hi';
import { T } from './theme';
import { categoryConfig } from './PredictionCard';
import type { PredictionMarket } from './PredictionCard';
import AnimatedValue from './AnimatedValue';

interface HeroMarketProps {
  market: PredictionMarket;
  liveYesPrice?: number;
}

/**
 * Featured market hero section — Apple-style dramatic presentation.
 * Large typography, generous spacing, clean layout. No glow, no noise.
 */
export default function HeroMarket({ market, liveYesPrice }: HeroMarketProps) {
  const effectiveYesPrice = liveYesPrice ?? market.yesPrice;
  const effectiveNoPrice = liveYesPrice != null ? 1 - liveYesPrice : market.noPrice;
  const yesPercent = Math.round(effectiveYesPrice * 100);
  const noPercent = Math.round(effectiveNoPrice * 100);
  const hasLivePrice = liveYesPrice != null;

  const isPolymarket = market.source === 'polymarket';
  const href = isPolymarket
    ? `/predictions/${market.ticker}?source=polymarket`
    : `/predictions/${market.ticker}`;

  const categoryInfo = categoryConfig[market.category] || categoryConfig.other;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link href={href} className="block group">
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{
            backgroundColor: T.surface,
            border: `1px solid ${T.border}`,
            transition: 'border-color 300ms ease',
            minHeight: '280px',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.borderHover; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; }}
        >
          {/* Background image if available */}
          {market.imageUrl && (
            <div className="absolute inset-0 overflow-hidden">
              <Image
                src={market.imageUrl}
                alt=""
                fill
                className="object-cover opacity-10 transition-transform duration-1000 group-hover:scale-[1.02]"
              />
              <div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(135deg, rgba(5,6,8,0.92) 0%, rgba(5,6,8,0.75) 50%, rgba(5,6,8,0.92) 100%)',
                }}
              />
            </div>
          )}

          <div className="relative z-10 p-6 md:p-8 lg:p-10">
            {/* Top row: Category + Live badge */}
            <div className="flex items-center gap-3 mb-5">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                style={{
                  backgroundColor: `${categoryInfo.color}12`,
                  color: categoryInfo.color,
                }}
              >
                <categoryInfo.Icon className="w-3.5 h-3.5" />
                {categoryInfo.label}
              </span>

              {hasLivePrice && (
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider"
                  style={{ backgroundColor: T.greenSoft, color: T.green }}
                >
                  <span className="relative flex h-[5px] w-[5px]">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: T.green }} />
                    <span className="relative inline-flex rounded-full h-[5px] w-[5px]" style={{ backgroundColor: T.green }} />
                  </span>
                  Live
                </span>
              )}
            </div>

            {/* Title */}
            <h2
              className="text-xl md:text-2xl lg:text-3xl font-bold leading-tight max-w-2xl mb-8"
              style={{ color: T.text, letterSpacing: '-0.02em' }}
            >
              {market.title}
            </h2>

            {/* Probability display — dramatic, clean */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              {/* YES */}
              <div
                className="flex-1 rounded-xl p-4 md:p-5 flex items-center justify-between transition-colors duration-200"
                style={{
                  backgroundColor: T.greenSoft,
                  border: `1px solid rgba(74, 222, 128, 0.12)`,
                }}
              >
                <div>
                  <div
                    className="text-[10px] font-semibold uppercase tracking-widest mb-0.5"
                    style={{ color: T.textSecondary }}
                  >
                    Yes
                  </div>
                  <div className="text-xs" style={{ color: T.muted }}>
                    Probability
                  </div>
                </div>
                <div
                  className="text-3xl md:text-4xl font-bold"
                  style={{
                    color: T.green,
                    fontFamily: "'Orbitron', sans-serif",
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '-0.02em',
                  }}
                >
                  <AnimatedValue value={yesPercent} suffix="%" />
                </div>
              </div>

              {/* NO */}
              <div
                className="flex-1 rounded-xl p-4 md:p-5 flex items-center justify-between transition-colors duration-200"
                style={{
                  backgroundColor: T.redSoft,
                  border: `1px solid rgba(248, 113, 113, 0.12)`,
                }}
              >
                <div>
                  <div
                    className="text-[10px] font-semibold uppercase tracking-widest mb-0.5"
                    style={{ color: T.textSecondary }}
                  >
                    No
                  </div>
                  <div className="text-xs" style={{ color: T.muted }}>
                    Probability
                  </div>
                </div>
                <div
                  className="text-3xl md:text-4xl font-bold"
                  style={{
                    color: T.red,
                    fontFamily: "'Orbitron', sans-serif",
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '-0.02em',
                  }}
                >
                  <AnimatedValue value={noPercent} suffix="%" />
                </div>
              </div>
            </div>

            {/* Probability bar — full width, thin */}
            <div className="mb-6">
              <div
                className="h-[3px] rounded-full overflow-hidden"
                style={{ backgroundColor: T.redSoft }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: T.green }}
                  initial={{ width: 0 }}
                  animate={{ width: `${yesPercent}%` }}
                  transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
                />
              </div>
            </div>

            {/* Bottom row: Stats + CTA */}
            <div className="flex flex-wrap items-center gap-4 md:gap-6">
              <div className="flex items-center gap-1.5 text-sm" style={{ color: T.muted }}>
                <HiOutlineTrendingUp className="w-4 h-4" />
                <span>
                  Volume:{' '}
                  <span style={{ color: T.text, fontWeight: 500 }}>
                    ${(market.totalVolume / 1_000_000).toFixed(1)}M
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-sm" style={{ color: T.muted }}>
                <HiOutlineClock className="w-4 h-4" />
                <span>
                  Closes:{' '}
                  <span style={{ color: T.text, fontWeight: 500 }}>
                    {new Date(market.closesAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </span>
              </div>

              <span
                className="ml-auto inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 group-hover:translate-x-0.5"
                style={{
                  backgroundColor: T.accent,
                  color: '#000',
                }}
              >
                Trade Now
                <HiOutlineArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
