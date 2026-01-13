import React from 'react';
import { motion } from 'framer-motion';
import { HiOutlineChartPie, HiOutlineChartBar, HiOutlineUserGroup } from 'react-icons/hi';
import type { IconType } from 'react-icons';

const AX = {
  bg: "#0a0b0d",
  surface: "#12141a",
  surface2: "#0e1012",
  border: "#1e2028",
  text: "#f0f0f0",
  muted: "#6b7280",
  // Vibrant colors
  green: "#4ADE80",
  cyan: "#22D3EE",
  purple: "#818CF8",
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
  const stats: { label: string; value: number | string; icon: IconType; color: string; isString?: boolean }[] = [
    {
      label: "Active Markets",
      value: totalMarkets,
      icon: HiOutlineChartPie,
      color: AX.purple,
    },
    {
      label: "24h Volume",
      value: `$${formatNumber(totalVolume)}`,
      icon: HiOutlineChartBar,
      color: AX.green,
      isString: true,
    },
    {
      label: "Traders",
      value: activeTraders,
      icon: HiOutlineUserGroup,
      color: AX.cyan,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-wrap items-center justify-center gap-4 md:gap-8 py-4 px-6 rounded-xl"
      style={{
        backgroundColor: AX.surface,
        border: `1px solid ${AX.border}`,
      }}
    >
      {stats.map((stat, index) => {
        const IconComponent = stat.icon;
        return (
          <React.Fragment key={stat.label}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
              className="flex items-center gap-3"
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${stat.color}15` }}
              >
                <IconComponent className="w-5 h-5" style={{ color: stat.color }} />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider" style={{ color: AX.muted }}>
                  {stat.label}
                </div>
                <div
                  className="text-lg font-bold"
                  style={{ color: stat.color }}
                >
                  {stat.isString ? stat.value : formatNumber(stat.value as number)}
                </div>
              </div>
            </motion.div>

            {index < stats.length - 1 && (
              <div
                className="hidden md:block w-px h-10"
                style={{ backgroundColor: AX.border }}
              />
            )}
          </React.Fragment>
        );
      })}
    </motion.div>
  );
}
