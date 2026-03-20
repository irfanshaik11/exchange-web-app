import React, { useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  HiOutlineClock,
  HiOutlineTrendingUp,
  HiOutlineSparkles,
  HiOutlineFire,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
} from 'react-icons/hi';
import type { PredictionMarket } from './PredictionCard';
import { categoryConfig } from './PredictionCard';

const C = {
  bg: "#111214",
  surface: "#12141a",
  surface2: "#1a1d24",
  border: "#1e2028",
  text: "#f0f0f0",
  muted: "#6b7280",
  green: "#4ADE80",
  red: "#F87171",
  yellow: "#FBBF24",
  purple: "#818CF8",
  orange: "#FB923C",
  cyan: "#22D3EE",
};

interface CuratedSectionsProps {
  markets: PredictionMarket[];
  onToggleFavorite?: (market: PredictionMarket) => void;
  isFavorite?: (ticker: string, source: 'dflow' | 'polymarket') => boolean;
}

export default function CuratedSections({ markets, onToggleFavorite, isFavorite }: CuratedSectionsProps) {
  // Filter and sort markets for each section
  const sections = useMemo(() => {
    const activeMarkets = markets.filter((m) => m.status === 'active');
    const now = Date.now();

    // Ending Soon: Markets closing within 48 hours
    const endingSoon = activeMarkets
      .filter((m) => {
        const diff = new Date(m.closesAt).getTime() - now;
        return diff > 0 && diff <= 48 * 60 * 60 * 1000;
      })
      .sort((a, b) => new Date(a.closesAt).getTime() - new Date(b.closesAt).getTime())
      .slice(0, 8);

    // Big Movers: Largest absolute price changes
    const bigMovers = [...activeMarkets]
      .filter((m) => Math.abs(m.yesPriceChange24h) > 0.01)
      .sort((a, b) => Math.abs(b.yesPriceChange24h) - Math.abs(a.yesPriceChange24h))
      .slice(0, 8);

    // Most Traded: Highest 24h volume
    const mostTraded = [...activeMarkets]
      .sort((a, b) => b.volume24h - a.volume24h)
      .slice(0, 8);

    // New Markets: Most recent by closesAt date (furthest out = newest)
    const newMarkets = [...activeMarkets]
      .sort((a, b) => new Date(b.closesAt).getTime() - new Date(a.closesAt).getTime())
      .slice(0, 8);

    return {
      endingSoon,
      bigMovers,
      mostTraded,
      newMarkets,
    };
  }, [markets]);

  return (
    <div className="space-y-8">
      {/* Ending Soon */}
      {sections.endingSoon.length > 0 && (
        <CuratedSection
          title="Ending Soon"
          subtitle="Last chance to trade"
          icon={<HiOutlineClock className="w-5 h-5" />}
          iconColor={C.red}
          markets={sections.endingSoon}
          onToggleFavorite={onToggleFavorite}
          isFavorite={isFavorite}
          badgeType="time"
        />
      )}

      {/* Big Movers */}
      {sections.bigMovers.length > 0 && (
        <CuratedSection
          title="Big Movers"
          subtitle="Largest price swings today"
          icon={<HiOutlineTrendingUp className="w-5 h-5" />}
          iconColor={C.green}
          markets={sections.bigMovers}
          onToggleFavorite={onToggleFavorite}
          isFavorite={isFavorite}
          badgeType="change"
        />
      )}

      {/* Most Traded */}
      {sections.mostTraded.length > 0 && (
        <CuratedSection
          title="Most Traded"
          subtitle="Highest volume today"
          icon={<HiOutlineFire className="w-5 h-5" />}
          iconColor={C.orange}
          markets={sections.mostTraded}
          onToggleFavorite={onToggleFavorite}
          isFavorite={isFavorite}
          badgeType="volume"
        />
      )}

      {/* New Markets */}
      {sections.newMarkets.length > 0 && (
        <CuratedSection
          title="New Markets"
          subtitle="Recently added"
          icon={<HiOutlineSparkles className="w-5 h-5" />}
          iconColor={C.purple}
          markets={sections.newMarkets}
          onToggleFavorite={onToggleFavorite}
          isFavorite={isFavorite}
          badgeType="category"
        />
      )}
    </div>
  );
}

// Individual Section Component
interface CuratedSectionProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconColor: string;
  markets: PredictionMarket[];
  onToggleFavorite?: (market: PredictionMarket) => void;
  isFavorite?: (ticker: string, source: 'dflow' | 'polymarket') => boolean;
  badgeType: 'time' | 'change' | 'volume' | 'category';
}

function CuratedSection({
  title,
  subtitle,
  icon,
  iconColor,
  markets,
  onToggleFavorite,
  isFavorite,
  badgeType,
}: CuratedSectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const scrollAmount = 280;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  return (
    <div>
      {/* Section Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="p-2 rounded-xl"
            style={{ backgroundColor: `${iconColor}15`, color: iconColor }}
          >
            {icon}
          </div>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: C.text }}>
              {title}
            </h2>
            <p className="text-xs" style={{ color: C.muted }}>
              {subtitle}
            </p>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => scroll('left')}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: C.muted }}
          >
            <HiOutlineChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: C.muted }}
          >
            <HiOutlineChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Horizontal Scroll with edge fade */}
      <div className="relative">
        {/* Left fade */}
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 z-10" style={{ background: 'linear-gradient(to right, rgba(5,6,8,0.8), transparent)' }} />
        {/* Right fade */}
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-16 z-10" style={{ background: 'linear-gradient(to left, rgba(5,6,8,0.9), transparent)' }} />
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto p-2 scrollbar-hide"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {markets.map((market) => (
          <CompactMarketCard
            key={`${market.source || 'dflow'}-${market.ticker}`}
            market={market}
            badgeType={badgeType}
            isFavorite={isFavorite?.(market.ticker, market.source || 'dflow')}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
        {/* Spacer so last card isn't clipped by fade */}
        <div className="flex-shrink-0 w-4" />
      </div>
      </div>
    </div>
  );
}

// Compact Card for Curated Sections
interface CompactMarketCardProps {
  market: PredictionMarket;
  badgeType: 'time' | 'change' | 'volume' | 'category';
  isFavorite?: boolean;
  onToggleFavorite?: (market: PredictionMarket) => void;
}

function CompactMarketCard({ market, badgeType, isFavorite, onToggleFavorite }: CompactMarketCardProps) {
  const isPolymarket = market.source === 'polymarket';
  const href = isPolymarket
    ? `/predictions/${market.ticker}?source=polymarket`
    : `/predictions/${market.ticker}`;

  const yesPercent = Math.round(market.yesPrice * 100);
  const priceChange = market.yesPriceChange24h;
  const isPositive = priceChange > 0;
  const categoryInfo = categoryConfig[market.category] || categoryConfig.other;

  const noPercent = Math.round(market.noPrice * 100);

  // Badge content based on type
  const getBadge = () => {
    switch (badgeType) {
      case 'time': {
        const diff = new Date(market.closesAt).getTime() - Date.now();
        const days = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);

        let text = '';
        if (days > 0) {
          text = `${days}d ${hours}h left`;
        } else if (hours > 0) {
          text = `${hours}h ${minutes}m left`;
        } else if (minutes > 0) {
          text = `${minutes}m left`;
        } else {
          text = 'Ending now';
        }
        return { text, color: C.red };
      }
      case 'change': {
        const changePercent = (priceChange * 100).toFixed(1);
        return {
          text: `${isPositive ? '+' : ''}${changePercent}%`,
          color: isPositive ? C.green : C.red,
        };
      }
      case 'volume': {
        const vol = market.volume24h;
        const volText = vol >= 1_000_000 ? `$${(vol / 1_000_000).toFixed(1)}M` : `$${(vol / 1_000).toFixed(0)}K`;
        return { text: volText, color: C.orange };
      }
      case 'category':
        return { text: categoryInfo.label, color: categoryInfo.color, Icon: categoryInfo.Icon };
    }
  };

  const badge = getBadge();
  const CategoryIcon = categoryInfo.Icon;

  return (
    <Link href={href}>
      <motion.div
        className="flex-shrink-0 w-[260px] h-[170px] rounded-2xl p-4 cursor-pointer group relative overflow-hidden backdrop-blur-xl"
        style={{
          scrollSnapAlign: 'start',
          backgroundColor: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
        }}
        whileHover={{
          scale: 1.02,
          transition: { duration: 0.15 },
        }}
      >
        {/* Glossy highlight overlay */}
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 40%, transparent 60%, rgba(255,255,255,0.02) 100%)',
          }}
        />

        {/* Content wrapper with flex to push prices to bottom */}
        <div className="relative z-10 flex flex-col h-full">
          {/* Top row */}
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-[10px] px-2 py-1 rounded-lg font-semibold flex items-center gap-1"
              style={{ backgroundColor: badge.color, color: '#000' }}
            >
              {badgeType === 'category' && <CategoryIcon className="w-3 h-3" />}
              {badge.text}
            </span>
            {onToggleFavorite && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleFavorite(market);
                }}
                className="p-1 rounded transition-all hover:scale-110 opacity-0 group-hover:opacity-100"
                style={{ color: isFavorite ? C.yellow : C.muted }}
              >
                {isFavorite ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                )}
              </button>
            )}
          </div>

          {/* Title - fixed height area */}
          <h3
            className="font-medium text-sm leading-snug line-clamp-2 mb-auto"
            style={{ color: C.text }}
          >
            {market.title}
          </h3>

          {/* Price bar */}
          <div className="mb-2 mt-3">
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: `${C.red}20` }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${yesPercent}%`,
                  backgroundColor: C.green,
                }}
              />
            </div>
          </div>

          {/* Bottom row - Yes/No prices */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <span className="text-base font-bold" style={{ color: C.green }}>
                {yesPercent}¢
              </span>
              <span className="text-[10px]" style={{ color: C.muted }}>
                Yes
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-base font-bold" style={{ color: C.red }}>
                {noPercent}¢
              </span>
              <span className="text-[10px]" style={{ color: C.muted }}>
                No
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
