import React from 'react';
import Link from 'next/link';
import { HiOutlineClock } from 'react-icons/hi';

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
}

interface PredictionCardProps {
  market: PredictionMarket;
  index: number;
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

export default function PredictionCard({ market }: PredictionCardProps) {
  const isResolved = market.status === 'resolved';
  const isClosed = market.status === 'closed';

  return (
    <Link href={`/predictions/${market.ticker}`}>
      <div
        className="group relative rounded-xl p-4 cursor-pointer transition-all duration-200 hover:translate-y-[-2px]"
        style={{
          backgroundColor: C.surface,
          border: `1px solid ${C.border}`,
        }}
      >
        {/* Hover glow effect */}
        <div
          className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at center, ${C.green}08, transparent 70%)`,
          }}
        />
        {/* Header: Title + Status */}
        <div className="mb-4">
          {(isResolved || isClosed) && (
            <span
              className="inline-block px-2 py-0.5 rounded text-[10px] font-medium uppercase mb-2"
              style={{
                backgroundColor: isResolved ? (market.resolution === 'yes' ? C.greenBg : C.redBg) : C.bg,
                color: isResolved ? (market.resolution === 'yes' ? C.green : C.red) : C.muted,
              }}
            >
              {isResolved ? `Resolved ${market.resolution?.toUpperCase()}` : 'Closed'}
            </span>
          )}
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
          <span>{formatVolume(market.volume24h)}</span>
          <span className="flex items-center gap-1">
            <HiOutlineClock className="w-3.5 h-3.5" />
            {formatTimeRemaining(market.closesAt)}
          </span>
        </div>
      </div>
    </Link>
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
