import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { HiOutlineLightningBolt, HiOutlineStar, HiOutlineArrowRight, HiOutlineTrendingUp, HiOutlineClock } from 'react-icons/hi';
import type { PredictionMarket } from './PredictionCard';

// Helper to build prediction market URL with source param
const buildPredictionUrl = (market: PredictionMarket): string => {
  const isPolymarket = market.source === 'polymarket';
  return isPolymarket
    ? `/predictions/${market.ticker}?source=polymarket`
    : `/predictions/${market.ticker}`;
};

const AX = {
  bg: "#0a0b0d",
  surface: "#12141a",
  surface2: "#0e1012",
  border: "#1e2028",
  text: "#f0f0f0",
  muted: "#6b7280",
  // Vibrant saturated colors
  yes: "#4ADE80",
  yesBg: "rgba(74, 222, 128, 0.15)",
  no: "#F87171",
  noBg: "rgba(248, 113, 113, 0.15)",
  accent: "#4ADE80",
  accentGlow: "rgba(74, 222, 128, 0.25)",
  yellow: "#FBBF24",
};

interface FeaturedMarketProps {
  market: PredictionMarket;
}

export default function FeaturedMarket({ market }: FeaturedMarketProps) {
  const yesPercent = Math.round(market.yesPrice * 100);
  const noPercent = Math.round(market.noPrice * 100);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
    >
      <Link href={buildPredictionUrl(market)}>
        <div
          className="relative rounded-2xl p-6 md:p-8 cursor-pointer overflow-hidden group"
          style={{
            background: `linear-gradient(135deg, ${AX.surface} 0%, ${AX.surface2} 100%)`,
            border: `1px solid ${AX.border}`,
          }}
        >
          {/* Animated background gradient */}
          <div
            className="absolute inset-0 opacity-30 group-hover:opacity-50 transition-opacity duration-700"
            style={{
              background: `
                radial-gradient(ellipse at 20% 50%, ${AX.accentGlow} 0%, transparent 50%),
                radial-gradient(ellipse at 80% 50%, rgba(34, 197, 94, 0.15) 0%, transparent 50%)
              `,
            }}
          />

          {/* Lightning bolt decorations */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {/* Top right lightning */}
            <motion.div
              className="absolute top-4 right-4 opacity-20"
              animate={{
                opacity: [0.1, 0.3, 0.1],
                scale: [1, 1.1, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <HiOutlineLightningBolt className="w-8 h-8" style={{ color: AX.accent }} />
            </motion.div>

            {/* Bottom left lightning */}
            <motion.div
              className="absolute bottom-12 left-6 opacity-15"
              animate={{
                opacity: [0.1, 0.25, 0.1],
                rotate: [0, 5, 0],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.5,
              }}
            >
              <HiOutlineLightningBolt className="w-6 h-6" style={{ color: AX.yes }} />
            </motion.div>

            {/* Animated pulse ring */}
            <motion.div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                width: '120%',
                height: '120%',
                border: `1px solid ${AX.accent}10`,
              }}
              animate={{
                scale: [0.8, 1.1, 0.8],
                opacity: [0.2, 0.05, 0.2],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          </div>

          {/* Content */}
          <div className="relative z-10">
            {/* Featured badge */}
            <div className="flex items-center gap-2 mb-4">
              <motion.span
                animate={{ scale: [1, 1.02, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{
                  background: `linear-gradient(135deg, ${AX.yellow}25, ${AX.yellow}10)`,
                  color: AX.yellow,
                  border: `1px solid ${AX.yellow}40`,
                }}
              >
                <HiOutlineStar className="w-3.5 h-3.5" />
                <span>Featured Market</span>
              </motion.span>
            </div>

            {/* Title */}
            <h2
              className="text-xl md:text-2xl font-bold mb-6 leading-tight max-w-2xl"
              style={{ color: AX.text }}
            >
              {market.title}
            </h2>

            {/* Large probability display */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              {/* YES side */}
              <motion.div
                whileHover={{ scale: 1.02 }}
                className="flex-1 rounded-xl p-4 md:p-5 flex items-center justify-between"
                style={{
                  backgroundColor: AX.yesBg,
                  border: `1px solid rgba(34, 197, 94, 0.3)`,
                }}
              >
                <div>
                  <div className="text-sm font-semibold uppercase tracking-wider mb-1" style={{ color: AX.yes }}>
                    Yes
                  </div>
                  <div className="text-xs" style={{ color: AX.muted }}>
                    {yesPercent}% chance
                  </div>
                </div>
                <div className="text-3xl md:text-4xl font-bold" style={{ color: AX.yes }}>
                  {yesPercent}¢
                </div>
              </motion.div>

              {/* NO side */}
              <motion.div
                whileHover={{ scale: 1.02 }}
                className="flex-1 rounded-xl p-4 md:p-5 flex items-center justify-between"
                style={{
                  backgroundColor: AX.noBg,
                  border: `1px solid rgba(239, 68, 68, 0.3)`,
                }}
              >
                <div>
                  <div className="text-sm font-semibold uppercase tracking-wider mb-1" style={{ color: AX.no }}>
                    No
                  </div>
                  <div className="text-xs" style={{ color: AX.muted }}>
                    {noPercent}% chance
                  </div>
                </div>
                <div className="text-3xl md:text-4xl font-bold" style={{ color: AX.no }}>
                  {noPercent}¢
                </div>
              </motion.div>
            </div>

            {/* Stats bar */}
            <div className="flex flex-wrap items-center gap-4 md:gap-6">
              <div className="flex items-center gap-2">
                <HiOutlineTrendingUp className="w-4 h-4" style={{ color: AX.muted }} />
                <span className="text-sm" style={{ color: AX.muted }}>
                  Volume: <span style={{ color: AX.text }}>${(market.totalVolume / 1_000_000).toFixed(1)}M</span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <HiOutlineClock className="w-4 h-4" style={{ color: AX.muted }} />
                <span className="text-sm" style={{ color: AX.muted }}>
                  Closes: <span style={{ color: AX.text }}>{new Date(market.closesAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </span>
              </div>

              <motion.span
                whileHover={{ scale: 1.03, x: 3 }}
                className="ml-auto flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-semibold transition-colors cursor-pointer"
                style={{
                  backgroundColor: AX.accent,
                  color: '#fff',
                }}
              >
                Trade Now
                <HiOutlineArrowRight className="w-4 h-4" />
              </motion.span>
            </div>
          </div>

          {/* Bottom gradient line */}
          <div
            className="absolute bottom-0 left-0 right-0 h-1 opacity-60"
            style={{
              background: `linear-gradient(90deg, ${AX.yes}, ${AX.accent}, ${AX.no})`,
            }}
          />
        </div>
      </Link>
    </motion.div>
  );
}
