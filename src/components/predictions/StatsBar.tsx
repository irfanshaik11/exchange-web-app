import React from 'react';
import { motion } from 'framer-motion';
import { HiOutlineTrendingUp } from 'react-icons/hi';

const C = {
  text: "#f0f0f0",
  muted: "#6b7280",
  green: "#4ADE80",
  cyan: "#22D3EE",
  purple: "#818CF8",
  yellow: "#FBBF24",
};

interface StatsBarProps {
  totalMarkets: number;
  totalVolume: number;
  activeTraders?: number;
}

const formatNumber = (num: number): string => {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
};

export default function StatsBar({ totalMarkets, totalVolume, activeTraders = 0 }: StatsBarProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="inline-flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] px-4 py-2 rounded-xl"
      style={{
        backgroundColor: 'rgba(12, 14, 18, 0.75)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Live indicator */}
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span
            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
            style={{ backgroundColor: C.green }}
          />
          <span
            className="relative inline-flex rounded-full h-2 w-2"
            style={{ backgroundColor: C.green }}
          />
        </span>
        <span style={{ color: C.muted }}>
          <span className="font-bold" style={{ color: C.text }}>{totalMarkets}+</span> markets live
        </span>
      </div>

      <span style={{ color: 'rgba(255,255,255,0.15)' }}>•</span>

      {/* Volume */}
      <div className="flex items-center gap-1.5">
        <HiOutlineTrendingUp className="w-4 h-4" style={{ color: C.green }} />
        <span style={{ color: C.muted }}>
          <span className="font-bold" style={{ color: C.green }}>${formatNumber(totalVolume)}</span> 24h volume
        </span>
      </div>

      <span style={{ color: 'rgba(255,255,255,0.15)' }}>•</span>

      {/* Traders */}
      <div className="flex items-center gap-1.5">
        <span style={{ color: C.muted }}>
          <span className="font-bold" style={{ color: C.text }}>{formatNumber(activeTraders)}</span> traders
        </span>
      </div>
    </motion.div>
  );
}
