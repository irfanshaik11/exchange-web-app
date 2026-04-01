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
  const href = `/predictions/${market.ticker}`;

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

          <div className="relative z-10 p-4 md:p-5">
            {/* Top row: Category + Live badge + Title */}
            <div className="flex items-start gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold"
                    style={{
                      backgroundColor: `${categoryInfo.color}12`,
                      color: categoryInfo.color,
                    }}
                  >
                    <categoryInfo.Icon className="w-3 h-3" />
                    {categoryInfo.label}
                  </span>
                  {hasLivePrice && (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wider"
                      style={{ backgroundColor: T.greenSoft, color: T.green }}
                    >
                      <span className="relative flex h-[4px] w-[4px]">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: T.green }} />
                        <span className="relative inline-flex rounded-full h-[4px] w-[4px]" style={{ backgroundColor: T.green }} />
                      </span>
                      Live
                    </span>
                  )}
                </div>
                <h2
                  className="text-lg md:text-xl font-bold leading-snug"
                  style={{ color: T.text, letterSpacing: '-0.02em' }}
                >
                  {market.title}
                </h2>
              </div>

              {/* Trade Now button — top right */}
              <span
                className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 group-hover:translate-x-0.5"
                style={{ backgroundColor: T.accent, color: '#000' }}
              >
                Trade
                <HiOutlineArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>

            {/* Inline probability + bar + stats */}
            <div className="flex items-center gap-4">
              {/* YES/NO values */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold" style={{ color: T.green }}>
                  Yes <AnimatedValue value={yesPercent} suffix="%" />
                </span>
                <span className="text-sm font-bold" style={{ color: T.red }}>
                  No <AnimatedValue value={noPercent} suffix="%" />
                </span>
              </div>

              {/* Probability bar — inline, thin */}
              <div className="flex-1 min-w-[80px]">
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

              {/* Stats */}
              <div className="hidden sm:flex items-center gap-3 text-xs" style={{ color: T.muted }}>
                <span className="flex items-center gap-1">
                  <HiOutlineTrendingUp className="w-3.5 h-3.5" />
                  ${(market.totalVolume / 1_000_000).toFixed(1)}M
                </span>
                <span className="flex items-center gap-1">
                  <HiOutlineClock className="w-3.5 h-3.5" />
                  {new Date(market.closesAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
