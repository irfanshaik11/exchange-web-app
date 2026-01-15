import React from 'react';
import Link from 'next/link';
import { HiOutlineClock, HiOutlineLockClosed, HiOutlineCheckCircle, HiOutlineStar, HiStar } from 'react-icons/hi';

// Vibrant color palette
const C = {
  bg: "#0a0b0d",
  surface: "#12141a",
  border: "#1e2028",
  text: "#f0f0f0",
  muted: "#6b7280",
  // More saturated greens and reds
  green: "#4ADE80",
  greenBg: "rgba(74, 222, 128, 0.15)",
  red: "#F87171",
  redBg: "rgba(248, 113, 113, 0.15)",
  yellow: "#FBBF24",
  purple: "#818CF8",
  orange: "#FB923C",
  cyan: "#22D3EE",
  pink: "#F472B6",
  // Status colors
  live: "#4ADE80",
  closed: "#6B7280",
};

// Category colors for left accent
const categoryColors: Record<string, string> = {
  politics: "#818CF8",     // Purple/indigo
  crypto: "#FBBF24",       // Yellow/gold
  sports: "#4ADE80",       // Green
  economics: "#22D3EE",    // Cyan
  entertainment: "#F472B6", // Pink
  science: "#FB923C",      // Orange
  weather: "#38BDF8",      // Sky blue
  other: "#6B7280",        // Gray
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
}

interface PredictionCardProps {
  market: PredictionMarket;
  index: number;
  showSource?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: (market: PredictionMarket) => void;
}

const formatVolume = (volume: number): string => {
  if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(1)}M`;
  if (volume >= 1_000) return `$${(volume / 1_000).toFixed(1)}K`;
  return `$${volume.toFixed(0)}`;
};

const formatTimeRemaining = (closesAt: string): string => {
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0) return "Closed";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return "<1h";
};

export default function PredictionCard({ market, showSource = false, isFavorite = false, onToggleFavorite }: PredictionCardProps) {
  const isResolved = market.status === 'resolved';
  const isClosed = market.status === 'closed';
  const isActive = market.status === 'active';
  const isPolymarket = market.source === 'polymarket';

  // Build the URL - for Polymarket, add source query param
  const href = isPolymarket
    ? `/predictions/${market.ticker}?source=polymarket`
    : `/predictions/${market.ticker}`;

  // Determine status color and styling
  const getStatusConfig = () => {
    if (isResolved) {
      return {
        color: market.resolution === 'yes' ? C.green : C.red,
        bgColor: market.resolution === 'yes' ? C.greenBg : C.redBg,
        label: `Resolved ${market.resolution?.toUpperCase()}`,
        icon: <HiOutlineCheckCircle className="w-3 h-3" />,
      };
    }
    if (isClosed) {
      return {
        color: C.closed,
        bgColor: `${C.closed}15`,
        label: 'Closed',
        icon: <HiOutlineLockClosed className="w-3 h-3" />,
      };
    }
    return {
      color: C.live,
      bgColor: `${C.live}15`,
      label: 'Live',
      icon: null, // Will use pulsing dot instead
    };
  };

  const statusConfig = getStatusConfig();

  return (
    <Link href={href}>
      <div
        className="group relative rounded-xl p-4 cursor-pointer transition-all duration-200 hover:translate-y-[-2px]"
        style={{
          backgroundColor: C.surface,
          border: `1px solid ${C.border}`,
          // Dim closed/resolved markets slightly
          opacity: isActive ? 1 : 0.7,
        }}
      >
        {/* Hover glow effect - only for active markets */}
        {isActive && (
          <div
            className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse at center, ${C.green}08, transparent 70%)`,
            }}
          />
        )}

        {/* Status badge - top left, always visible */}
        <div className="flex items-center justify-between mb-3">
          <span
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider"
            style={{
              backgroundColor: statusConfig.bgColor,
              color: statusConfig.color,
            }}
          >
            {isActive ? (
              <>
                {/* Pulsing live dot */}
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
                {statusConfig.label}
              </>
            ) : (
              <>
                {statusConfig.icon}
                {statusConfig.label}
              </>
            )}
          </span>

          <div className="flex items-center gap-2">
            {/* Source badge */}
            {showSource && market.source && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider"
                style={{
                  backgroundColor: isPolymarket ? `${C.purple}20` : `${C.green}20`,
                  color: isPolymarket ? C.purple : C.green,
                  border: `1px solid ${isPolymarket ? C.purple : C.green}40`,
                }}
              >
                {isPolymarket ? 'PM' : 'dFlow'}
              </span>
            )}

            {/* Favorite/Star button */}
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
                {isFavorite ? (
                  <HiStar className="w-4 h-4" />
                ) : (
                  <HiOutlineStar className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Title */}
        <div className="mb-4">
          <h3 className="font-medium text-sm leading-snug line-clamp-2" style={{ color: C.text }}>
            {market.title}
          </h3>
        </div>

        {/* Prices */}
        <div className="flex gap-2 mb-4">
          <div className="flex-1 rounded-lg p-3 text-center" style={{ backgroundColor: C.greenBg }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: C.green }}>Yes</div>
            <div className="text-xl font-bold" style={{ color: C.green }}>
              {Math.round(market.yesPrice * 100)}¢
            </div>
          </div>
          <div className="flex-1 rounded-lg p-3 text-center" style={{ backgroundColor: C.redBg }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: C.red }}>No</div>
            <div className="text-xl font-bold" style={{ color: C.red }}>
              {Math.round(market.noPrice * 100)}¢
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs" style={{ color: C.muted }}>
          <span className="flex items-center gap-1">
            <span className="font-medium">Vol:</span>
            {formatVolume(market.volume24h)}
          </span>
          {isActive ? (
            <TimeRemainingBadge closesAt={market.closesAt} />
          ) : (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded" style={{ backgroundColor: `${C.closed}10` }}>
              <HiOutlineLockClosed className="w-3 h-3" />
              Ended
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// Separate component for time remaining with urgency styling
function TimeRemainingBadge({ closesAt }: { closesAt: string }) {
  const diff = new Date(closesAt).getTime() - Date.now();
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);

  // Determine urgency level
  const isUrgent = diff <= 86400000; // Less than 24 hours
  const isWarning = diff <= 7 * 86400000 && !isUrgent; // Less than 7 days

  const timeText = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h` : '<1h';

  const getBadgeStyle = () => {
    if (isUrgent) {
      return {
        backgroundColor: `${C.red}15`,
        color: C.red,
        borderColor: `${C.red}30`,
      };
    }
    if (isWarning) {
      return {
        backgroundColor: `${C.yellow}15`,
        color: C.yellow,
        borderColor: `${C.yellow}30`,
      };
    }
    return {
      backgroundColor: `${C.muted}10`,
      color: C.muted,
      borderColor: 'transparent',
    };
  };

  const style = getBadgeStyle();

  return (
    <span
      className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium"
      style={{
        backgroundColor: style.backgroundColor,
        color: style.color,
        border: `1px solid ${style.borderColor}`,
      }}
    >
      <HiOutlineClock className="w-3 h-3" />
      {isUrgent && <span className="font-semibold">Ends:</span>}
      {timeText}
    </span>
  );
}

export function PredictionCardSkeleton() {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        backgroundColor: C.surface,
        border: `1px solid ${C.border}`,
      }}
    >
      <div className="h-4 w-3/4 rounded mb-2 animate-pulse" style={{ backgroundColor: C.bg }} />
      <div className="h-4 w-1/2 rounded mb-4 animate-pulse" style={{ backgroundColor: C.bg }} />
      <div className="flex gap-2 mb-4">
        <div className="flex-1 h-16 rounded-lg animate-pulse" style={{ backgroundColor: C.greenBg }} />
        <div className="flex-1 h-16 rounded-lg animate-pulse" style={{ backgroundColor: C.redBg }} />
      </div>
      <div className="flex justify-between">
        <div className="h-3 w-12 rounded animate-pulse" style={{ backgroundColor: C.bg }} />
        <div className="h-3 w-8 rounded animate-pulse" style={{ backgroundColor: C.bg }} />
      </div>
    </div>
  );
}
