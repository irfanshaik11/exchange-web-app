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
      className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs"
    >
      {/* Live indicator */}
      <div className="flex items-center gap-2">
        <span className="relative flex h-1.5 w-1.5">
          <span
            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
            style={{ backgroundColor: C.green }}
          />
          <span
            className="relative inline-flex rounded-full h-1.5 w-1.5"
            style={{ backgroundColor: C.green }}
          />
        </span>
        <span style={{ color: C.muted }}>
          <span className="font-semibold" style={{ color: C.text }}>{totalMarkets}</span> markets live
        </span>
      </div>

      <span style={{ color: C.muted }}>•</span>

      {/* Volume */}
      <div className="flex items-center gap-1.5">
        <HiOutlineTrendingUp className="w-4 h-4" style={{ color: C.green }} />
        <span style={{ color: C.muted }}>
          <span className="font-semibold" style={{ color: C.green }}>${formatNumber(totalVolume)}</span> 24h volume
        </span>
      </div>

      <span style={{ color: C.muted }}>•</span>

      {/* Traders */}
      <div className="flex items-center gap-1.5">
        <span style={{ color: C.muted }}>
          <span className="font-semibold" style={{ color: C.text }}>{formatNumber(activeTraders)}</span> traders
        </span>
      </div>
    </motion.div>
  );
}
