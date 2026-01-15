import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineStar,
  HiStar,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineClock,
  HiOutlineTrendingUp,
  HiOutlineTrendingDown,
  HiOutlineX,
} from 'react-icons/hi';
import type { PredictionMarket } from './PredictionCard';

const C = {
  bg: "#0a0b0d",
  surface: "#12141a",
  surface2: "#1a1d24",
  border: "#1e2028",
  text: "#f0f0f0",
  muted: "#6b7280",
  green: "#4ADE80",
  red: "#F87171",
  yellow: "#FBBF24",
  purple: "#818CF8",
  cyan: "#22D3EE",
};

interface FavoritesCarouselProps {
  favorites: { ticker: string; title: string; source: 'dflow' | 'polymarket' }[];
  markets: PredictionMarket[];
  onRemoveFavorite: (ticker: string, source: 'dflow' | 'polymarket') => void;
}

const formatVolume = (volume: number): string => {
  if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(1)}M`;
  if (volume >= 1_000) return `$${(volume / 1_000).toFixed(0)}K`;
  return `$${volume.toFixed(0)}`;
};

const formatTimeRemaining = (closesAt: string): string => {
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0) return "Ended";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  return "<1h";
};

export default function FavoritesCarousel({ favorites, markets, onRemoveFavorite }: FavoritesCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Get full market data for favorites
  const favoriteMarkets = favorites
    .map((fav) => markets.find((m) => m.ticker === fav.ticker && (m.source || 'dflow') === fav.source))
    .filter(Boolean) as PredictionMarket[];

  if (favoriteMarkets.length === 0) {
    return null;
  }

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const scrollAmount = 320; // Card width + gap
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HiStar className="w-5 h-5" style={{ color: C.yellow }} />
          <h2 className="text-lg font-semibold" style={{ color: C.text }}>
            Your Watchlist
          </h2>
          <span
            className="px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ backgroundColor: `${C.yellow}15`, color: C.yellow }}
          >
            {favoriteMarkets.length}
          </span>
        </div>

        {/* Navigation arrows */}
        {favoriteMarkets.length > 2 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => scroll('left')}
              disabled={!canScrollLeft}
              className="p-1.5 rounded-lg transition-all disabled:opacity-30"
              style={{
                backgroundColor: C.surface2,
                border: `1px solid ${C.border}`,
                color: C.text,
              }}
            >
              <HiOutlineChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scroll('right')}
              disabled={!canScrollRight}
              className="p-1.5 rounded-lg transition-all disabled:opacity-30"
              style={{
                backgroundColor: C.surface2,
                border: `1px solid ${C.border}`,
                color: C.text,
              }}
            >
              <HiOutlineChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Scrollable carousel */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {favoriteMarkets.map((market) => (
          <FavoriteCard
            key={`${market.source || 'dflow'}-${market.ticker}`}
            market={market}
            onRemove={() => onRemoveFavorite(market.ticker, market.source || 'dflow')}
          />
        ))}
      </div>
    </motion.div>
  );
}

interface FavoriteCardProps {
  market: PredictionMarket;
  onRemove: () => void;
}

function FavoriteCard({ market, onRemove }: FavoriteCardProps) {
  const isPolymarket = market.source === 'polymarket';
  const href = isPolymarket
    ? `/predictions/${market.ticker}?source=polymarket`
    : `/predictions/${market.ticker}`;

  const priceChange = market.yesPriceChange24h;
  const isPositive = priceChange > 0;
  const isNegative = priceChange < 0;

  const timeRemaining = formatTimeRemaining(market.closesAt);
  const isEndingSoon = timeRemaining.includes('h') && !timeRemaining.includes('d');

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="relative flex-shrink-0 w-[300px] rounded-xl p-4 group"
      style={{
        backgroundColor: C.surface,
        border: `1px solid ${C.border}`,
        scrollSnapAlign: 'start',
      }}
    >
      {/* Remove button */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove();
        }}
        className="absolute top-2 right-2 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-10"
        style={{
          backgroundColor: `${C.red}15`,
          color: C.red,
        }}
      >
        <HiOutlineX className="w-4 h-4" />
      </button>

      <Link href={href}>
        <div className="cursor-pointer">
          {/* Title */}
          <h3
            className="font-medium text-sm leading-snug line-clamp-2 mb-3 pr-6"
            style={{ color: C.text }}
          >
            {market.title}
          </h3>

          {/* Main stats row */}
          <div className="flex items-center justify-between mb-3">
            {/* Yes price with large display */}
            <div>
              <div className="text-xs mb-0.5" style={{ color: C.muted }}>
                Yes Price
              </div>
              <div className="flex items-baseline gap-2">
                <span
                  className="text-2xl font-bold"
                  style={{ color: C.green }}
                >
                  {Math.round(market.yesPrice * 100)}¢
                </span>
                {priceChange !== 0 && (
                  <span
                    className="flex items-center gap-0.5 text-xs font-medium"
                    style={{ color: isPositive ? C.green : isNegative ? C.red : C.muted }}
                  >
                    {isPositive ? (
                      <HiOutlineTrendingUp className="w-3 h-3" />
                    ) : (
                      <HiOutlineTrendingDown className="w-3 h-3" />
                    )}
                    {isPositive ? '+' : ''}{(priceChange * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>

            {/* No price */}
            <div className="text-right">
              <div className="text-xs mb-0.5" style={{ color: C.muted }}>
                No Price
              </div>
              <span
                className="text-xl font-bold"
                style={{ color: C.red }}
              >
                {Math.round(market.noPrice * 100)}¢
              </span>
            </div>
          </div>

          {/* Bottom stats */}
          <div
            className="flex items-center justify-between pt-3 text-xs"
            style={{ borderTop: `1px solid ${C.border}` }}
          >
            <div className="flex items-center gap-3">
              {/* Volume */}
              <div>
                <span style={{ color: C.muted }}>Vol: </span>
                <span style={{ color: C.text }}>{formatVolume(market.volume24h)}</span>
              </div>
              {/* Total Volume */}
              <div>
                <span style={{ color: C.muted }}>Total: </span>
                <span style={{ color: C.text }}>{formatVolume(market.totalVolume)}</span>
              </div>
            </div>

            {/* Time remaining */}
            <div
              className="flex items-center gap-1 px-2 py-1 rounded"
              style={{
                backgroundColor: isEndingSoon ? `${C.red}15` : `${C.muted}10`,
                color: isEndingSoon ? C.red : C.muted,
              }}
            >
              <HiOutlineClock className="w-3 h-3" />
              {timeRemaining}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
