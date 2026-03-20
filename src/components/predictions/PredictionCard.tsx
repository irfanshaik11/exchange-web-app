import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineClock,
  HiOutlineLockClosed,
  HiOutlineCheckCircle,
  HiOutlineStar,
  HiStar,
  HiOutlineTrendingUp,
  HiOutlineTrendingDown,
  HiOutlineUsers,
  HiOutlineChartBar,
  HiOutlineScale,
  HiOutlineFilm,
  HiOutlineBeaker,
  HiOutlineCloud,
  HiOutlineBriefcase,
  HiOutlineTag,
  HiOutlineGlobeAlt,
} from 'react-icons/hi';
import { BiFootball, BiBitcoin } from 'react-icons/bi';
import type { IconType } from 'react-icons';
import MiniSparkline from './MiniSparkline';

// Vibrant color palette
const C = {
  bg: "#111214",
  surface: "#12141a",
  surface2: "#1a1d24",
  border: "#1e2028",
  text: "#f0f0f0",
  muted: "#6b7280",
  green: "#4ADE80",
  greenBg: "rgba(74, 222, 128, 0.12)",
  red: "#F87171",
  redBg: "rgba(248, 113, 113, 0.12)",
  yellow: "#FBBF24",
  purple: "#818CF8",
  orange: "#FB923C",
  cyan: "#22D3EE",
  pink: "#F472B6",
  live: "#4ADE80",
  closed: "#6B7280",
};

// Category icons and colors
export const categoryConfig: Record<string, { Icon: IconType; label: string; color: string }> = {
  politics: { Icon: HiOutlineScale, label: "Politics", color: "#818CF8" },
  crypto: { Icon: BiBitcoin, label: "Crypto", color: "#FBBF24" },
  sports: { Icon: BiFootball, label: "Sports", color: "#4ADE80" },
  economics: { Icon: HiOutlineTrendingUp, label: "Economics", color: "#22D3EE" },
  entertainment: { Icon: HiOutlineFilm, label: "Entertainment", color: "#F472B6" },
  science: { Icon: HiOutlineBeaker, label: "Science", color: "#FB923C" },
  weather: { Icon: HiOutlineCloud, label: "Weather", color: "#38BDF8" },
  pop_culture: { Icon: HiOutlineGlobeAlt, label: "Culture", color: "#F472B6" },
  business: { Icon: HiOutlineBriefcase, label: "Business", color: "#22D3EE" },
  other: { Icon: HiOutlineTag, label: "Other", color: "#6B7280" },
};

export interface PredictionMarket {
  ticker: string;
  title: string;
  category: string;
  yesPrice: number;
  noPrice: number;
  yesPriceChange24h: number;
  noPriceChange24h: number;
  volume24h: number;
  totalVolume: number;
  closesAt: string;
  status: 'active' | 'closed' | 'resolved';
  resolution?: 'yes' | 'no';
  imageUrl?: string;
  source?: 'dflow' | 'polymarket';
  // New fields for enhanced UI
  priceHistory?: number[];
  traderCount?: number;
  recentTrades?: number;
}

interface PredictionCardProps {
  market: PredictionMarket;
  index: number;
  showSource?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: (market: PredictionMarket) => void;
  onQuickTrade?: (market: PredictionMarket, side: 'yes' | 'no') => void;
  compact?: boolean;
}

const formatVolume = (volume: number): string => {
  if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(1)}M`;
  if (volume >= 1_000) return `$${(volume / 1_000).toFixed(0)}K`;
  return `$${volume.toFixed(0)}`;
};

const formatTimeRemaining = (closesAt: string): { text: string; isUrgent: boolean; isWarning: boolean } => {
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0) return { text: "Ended", isUrgent: false, isWarning: false };

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const isUrgent = diff <= 86400000;
  const isWarning = diff <= 7 * 86400000 && !isUrgent;

  let text = "";
  if (days > 0) text = `${days}d ${hours}h`;
  else if (hours > 0) text = `${hours}h`;
  else text = "<1h";

  return { text, isUrgent, isWarning };
};

export default function PredictionCard({
  market,
  showSource = false,
  isFavorite = false,
  onToggleFavorite,
  onQuickTrade,
  compact = false,
}: PredictionCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const isResolved = market.status === 'resolved';
  const isClosed = market.status === 'closed';
  const isActive = market.status === 'active';
  const isPolymarket = market.source === 'polymarket';

  const href = isPolymarket
    ? `/predictions/${market.ticker}?source=polymarket`
    : `/predictions/${market.ticker}`;

  const yesPercent = Math.round(market.yesPrice * 100);
  const noPercent = Math.round(market.noPrice * 100);
  const priceChange = market.yesPriceChange24h;
  const isPositive = priceChange > 0;
  const isNegative = priceChange < 0;

  const timeInfo = formatTimeRemaining(market.closesAt);
  const categoryInfo = categoryConfig[market.category] || categoryConfig.other;

  // Generate mock sparkline data if not provided - memoized to prevent regenerating on hover
  const sparklineData = useMemo(() => {
    return market.priceHistory || generateMockSparkline(market.yesPrice, priceChange);
  }, [market.ticker, market.yesPrice, priceChange, market.priceHistory]);

  return (
    <Link href={href} className="h-full block">
      <motion.div
        className="group relative rounded-2xl cursor-pointer overflow-hidden bg-white/[0.05] border border-white/[0.08] backdrop-blur-xl h-full flex flex-col"
        style={{
          opacity: isActive ? 1 : 0.75,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
      >
        {/* Image Header (if available) */}
        {market.imageUrl && (
          <div className="relative h-24 overflow-hidden">
            <Image
              src={market.imageUrl}
              alt={market.title}
              fill
              className="object-cover"
            />
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)`,
              }}
            />
            {/* Category badge on image */}
            <div className="absolute top-2 left-2">
              <span
                className="px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5"
                style={{
                  backgroundColor: categoryInfo.color,
                  color: '#000',
                }}
              >
                <categoryInfo.Icon className="w-3.5 h-3.5" />
                {categoryInfo.label}
              </span>
            </div>
          </div>
        )}

        {/* Card Content */}
        <div className="p-4 flex flex-col flex-1">
          {/* Top Row: Status + Actions */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {/* Status Badge */}
              <StatusBadge status={market.status} resolution={market.resolution} />

              {/* Category (if no image) */}
              {!market.imageUrl && (
                <span
                  className="text-[10px] px-2 py-1 rounded-md font-semibold flex items-center gap-1"
                  style={{
                    backgroundColor: categoryInfo.color,
                    color: '#000',
                  }}
                >
                  <categoryInfo.Icon className="w-3 h-3" />
                  {categoryInfo.label}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {/* Source badge */}
              {showSource && market.source && (
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded font-medium uppercase"
                  style={{
                    backgroundColor: isPolymarket ? `${C.purple}20` : `${C.green}20`,
                    color: isPolymarket ? C.purple : C.green,
                  }}
                >
                  {isPolymarket ? 'PM' : 'dF'}
                </span>
              )}

              {/* Favorite button */}
              {onToggleFavorite && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggleFavorite(market);
                  }}
                  className="p-1 rounded-lg transition-all hover:scale-110"
                  style={{
                    backgroundColor: isFavorite ? `${C.yellow}15` : 'transparent',
                    color: isFavorite ? C.yellow : C.muted,
                  }}
                >
                  {isFavorite ? <HiStar className="w-4 h-4" /> : <HiOutlineStar className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>

          {/* Title */}
          <h3
            className="font-semibold text-sm leading-snug line-clamp-2 mb-auto"
            style={{ color: C.text }}
          >
            {market.title}
          </h3>

          {/* Probability Gauge Bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-[10px] mb-1.5">
              <span style={{ color: C.green }}>Yes {yesPercent}%</span>
              <span style={{ color: C.red }}>No {noPercent}%</span>
            </div>
            <div
              className="h-2 rounded-full overflow-hidden flex"
              style={{ backgroundColor: C.redBg }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: C.green }}
                initial={{ width: 0 }}
                animate={{ width: `${yesPercent}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
          </div>

          {/* Price + Sparkline Row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              {/* Yes Price */}
              <div>
                <div className="text-lg font-bold" style={{ color: C.green }}>
                  {yesPercent}¢
                </div>
                {priceChange !== 0 && (
                  <div
                    className="flex items-center gap-0.5 text-[10px] font-medium"
                    style={{ color: isPositive ? C.green : isNegative ? C.red : C.muted }}
                  >
                    {isPositive ? <HiOutlineTrendingUp className="w-3 h-3" /> : <HiOutlineTrendingDown className="w-3 h-3" />}
                    {isPositive ? '+' : ''}{(priceChange * 100).toFixed(1)}%
                  </div>
                )}
              </div>
            </div>

            {/* Sparkline */}
            <MiniSparkline
              data={sparklineData}
              width={70}
              height={28}
              color={isPositive ? C.green : isNegative ? C.red : C.muted}
            />
          </div>

          {/* Stats Row */}
          <div
            className="flex items-center justify-between pt-3 text-[11px] border-t border-white/[0.06]"
            style={{ color: C.muted }}
          >
            <div className="flex items-center gap-3">
              {/* Volume */}
              <div className="flex items-center gap-1">
                <HiOutlineChartBar className="w-3 h-3" />
                {formatVolume(market.volume24h)}
              </div>

              {/* Trader count (if available) */}
              {market.traderCount && (
                <div className="flex items-center gap-1">
                  <HiOutlineUsers className="w-3 h-3" />
                  {market.traderCount > 1000 ? `${(market.traderCount / 1000).toFixed(1)}K` : market.traderCount}
                </div>
              )}
            </div>

            {/* Time Remaining */}
            <TimeBadge {...timeInfo} />
          </div>

          {/* Quick Trade Buttons (on hover) */}
          <AnimatePresence>
            {isHovered && isActive && onQuickTrade && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-0 left-0 right-0 p-3 flex gap-2"
                style={{
                  background: `linear-gradient(to top, rgba(0,0,0,0.8) 80%, transparent)`,
                }}
              >
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onQuickTrade(market, 'yes');
                  }}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all hover:scale-[1.02]"
                  style={{
                    backgroundColor: C.green,
                    color: '#000',
                  }}
                >
                  Buy Yes {yesPercent}¢
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onQuickTrade(market, 'no');
                  }}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all hover:scale-[1.02]"
                  style={{
                    backgroundColor: C.red,
                    color: '#fff',
                  }}
                >
                  Buy No {noPercent}¢
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </motion.div>
    </Link>
  );
}

// Status Badge Component
function StatusBadge({ status, resolution }: { status: string; resolution?: string }) {
  if (status === 'resolved') {
    const isYes = resolution === 'yes';
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold uppercase"
        style={{
          backgroundColor: isYes ? C.greenBg : C.redBg,
          color: isYes ? C.green : C.red,
        }}
      >
        <HiOutlineCheckCircle className="w-3 h-3" />
        {resolution?.toUpperCase()}
      </span>
    );
  }

  if (status === 'closed') {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold uppercase"
        style={{
          backgroundColor: `${C.closed}15`,
          color: C.closed,
        }}
      >
        <HiOutlineLockClosed className="w-3 h-3" />
        Closed
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold uppercase"
      style={{
        backgroundColor: `${C.live}15`,
        color: C.live,
      }}
    >
      <span className="relative flex h-2 w-2">
        <span
          className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
          style={{ backgroundColor: C.live }}
        />
        <span
          className="relative inline-flex rounded-full h-2 w-2"
          style={{ backgroundColor: C.live }}
        />
      </span>
      Live
    </span>
  );
}

// Time Badge Component
function TimeBadge({ text, isUrgent, isWarning }: { text: string; isUrgent: boolean; isWarning: boolean }) {
  const getStyle = () => {
    if (isUrgent) return { bg: `${C.red}15`, color: C.red, border: `${C.red}30` };
    if (isWarning) return { bg: `${C.yellow}15`, color: C.yellow, border: `${C.yellow}30` };
    return { bg: `${C.muted}10`, color: C.muted, border: 'transparent' };
  };

  const style = getStyle();

  return (
    <span
      className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
      style={{
        backgroundColor: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
      }}
    >
      <HiOutlineClock className="w-3 h-3" />
      {isUrgent && <span className="font-bold">⚡</span>}
      {text}
    </span>
  );
}

// Generate mock sparkline data based on current price and change
function generateMockSparkline(currentPrice: number, change: number): number[] {
  const points = 12;
  const data: number[] = [];
  const startPrice = currentPrice / (1 + change);

  for (let i = 0; i < points; i++) {
    const progress = i / (points - 1);
    const noise = (Math.random() - 0.5) * 0.02;
    const value = startPrice + (currentPrice - startPrice) * progress + noise;
    data.push(Math.max(0, Math.min(1, value)));
  }

  return data;
}

// Skeleton Component
export function PredictionCardSkeleton() {
  return (
    <div
      className="rounded-2xl overflow-hidden bg-white/[0.05] border border-white/[0.08] backdrop-blur-xl"
      style={{
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
      }}
    >
      {/* Image skeleton */}
      <div className="h-24 animate-pulse" style={{ backgroundColor: C.bg }} />

      <div className="p-4">
        {/* Status skeleton */}
        <div className="flex justify-between mb-3">
          <div className="h-5 w-16 rounded animate-pulse" style={{ backgroundColor: C.bg }} />
          <div className="h-5 w-5 rounded animate-pulse" style={{ backgroundColor: C.bg }} />
        </div>

        {/* Title skeleton */}
        <div className="h-4 w-full rounded mb-2 animate-pulse" style={{ backgroundColor: C.bg }} />
        <div className="h-4 w-2/3 rounded mb-3 animate-pulse" style={{ backgroundColor: C.bg }} />

        {/* Gauge skeleton */}
        <div className="h-2 rounded-full mb-3 animate-pulse" style={{ backgroundColor: C.bg }} />

        {/* Price skeleton */}
        <div className="flex justify-between mb-3">
          <div className="h-6 w-12 rounded animate-pulse" style={{ backgroundColor: C.bg }} />
          <div className="h-6 w-16 rounded animate-pulse" style={{ backgroundColor: C.bg }} />
        </div>

        {/* Stats skeleton */}
        <div className="flex justify-between pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
          <div className="h-4 w-16 rounded animate-pulse" style={{ backgroundColor: C.bg }} />
          <div className="h-4 w-12 rounded animate-pulse" style={{ backgroundColor: C.bg }} />
        </div>
      </div>
    </div>
  );
}
