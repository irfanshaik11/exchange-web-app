/**
 * StatCard - Gamified stat display card with animated counter
 *
 * Features:
 * - YouTube-style animated number
 * - Trend indicator (up/down arrow)
 * - Glow effect based on performance
 * - Live pulse indicator for real-time data
 */

import React from 'react';
import AnimatedCounter from './AnimatedCounter';

interface StatCardProps {
  title: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  trend?: number; // Percentage change
  trendLabel?: string;
  icon?: React.ReactNode;
  isLive?: boolean;
  highlightColor?: string;
  formatLargeNumbers?: boolean;
  className?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  trend,
  trendLabel = 'vs last period',
  icon,
  isLive = false,
  highlightColor = '#22c55e',
  formatLargeNumbers = true,
  className = '',
}) => {
  const isPositiveTrend = trend !== undefined && trend > 0;
  const isNegativeTrend = trend !== undefined && trend < 0;

  return (
    <div
      className={`
        relative overflow-hidden rounded-2xl
        bg-gradient-to-br from-neutral-900/90 via-neutral-900/70 to-neutral-950/90
        border border-neutral-800/50 backdrop-blur-sm
        p-4 sm:p-5 md:p-6
        transition-all duration-300
        hover:border-neutral-700/70 hover:shadow-lg hover:shadow-black/20
        group
        ${className}
      `}
    >
      {/* Background glow effect */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500"
        style={{
          background: `radial-gradient(circle at 50% 0%, ${highlightColor}, transparent 70%)`,
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="flex items-center gap-2 sm:gap-3">
          {icon && (
            <div
              className="p-2 rounded-xl bg-neutral-800/50"
              style={{ color: highlightColor }}
            >
              {icon}
            </div>
          )}
          <h3 className="text-xs sm:text-sm font-medium text-neutral-400 uppercase tracking-wider">
            {title}
          </h3>
        </div>

        {/* Live indicator */}
        {isLive && (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ backgroundColor: highlightColor }}
              />
              <span
                className="relative inline-flex rounded-full h-2 w-2"
                style={{ backgroundColor: highlightColor }}
              />
            </span>
            <span className="text-xs text-neutral-500 hidden sm:inline">LIVE</span>
          </div>
        )}
      </div>

      {/* Value */}
      <div className="mb-2 sm:mb-3">
        <AnimatedCounter
          value={value}
          prefix={prefix}
          suffix={suffix}
          decimals={decimals}
          highlightColor={highlightColor}
          formatLargeNumbers={formatLargeNumbers}
          size="lg"
          className="text-white"
        />
      </div>

      {/* Trend indicator */}
      {trend !== undefined && (
        <div className="flex items-center gap-2">
          <div
            className={`
              flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium
              ${isPositiveTrend ? 'bg-emerald-500/20 text-emerald-400' : ''}
              ${isNegativeTrend ? 'bg-red-500/20 text-red-400' : ''}
              ${!isPositiveTrend && !isNegativeTrend ? 'bg-neutral-700/50 text-neutral-400' : ''}
            `}
          >
            {isPositiveTrend && (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            )}
            {isNegativeTrend && (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            )}
            {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
          </div>
          <span className="text-xs text-neutral-500 hidden sm:inline">{trendLabel}</span>
        </div>
      )}

      {/* Decorative corner accent */}
      <div
        className="absolute top-0 right-0 w-20 h-20 opacity-5"
        style={{
          background: `radial-gradient(circle at 100% 0%, ${highlightColor}, transparent 70%)`,
        }}
      />
    </div>
  );
};

export default StatCard;
