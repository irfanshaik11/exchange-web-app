import React, { useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  HiOutlineClock,
  HiOutlineStar,
  HiStar,
  HiOutlineTrendingUp,
  HiOutlineTrendingDown,
  HiOutlineChartBar,
  HiOutlineCheckCircle,
  HiOutlineLockClosed,
} from 'react-icons/hi';
import { T } from './theme';
import { categoryConfig } from './PredictionCard';
import type { PredictionMarket } from './PredictionCard';
import MiniSparkline from './MiniSparkline';
import usePolymarketLivePrice from '~/hooks/usePolymarketLivePrice';
import { generateMockSparkline, formatVolume, formatTimeRemaining } from './utils';

interface MarketRowProps {
  market: PredictionMarket;
  index: number;
  isFavorite?: boolean;
  onToggleFavorite?: (market: PredictionMarket) => void;
  tokenId?: string;
  showSource?: boolean;
}

const MarketRow = React.memo(function MarketRow({
  market,
  index,
  isFavorite = false,
  onToggleFavorite,
  tokenId,
  showSource,
}: MarketRowProps) {
  const observeRef = useRef<HTMLDivElement>(null);
  const livePriceEntry = usePolymarketLivePrice(tokenId, observeRef);
  const liveYesPrice = livePriceEntry?.price;

  // Flash on price change
  const prevPrice = useRef(liveYesPrice);
  const [flash, setFlash] = React.useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (liveYesPrice == null || prevPrice.current == null) {
      prevPrice.current = liveYesPrice;
      return;
    }
    if (liveYesPrice > prevPrice.current) setFlash('up');
    else if (liveYesPrice < prevPrice.current) setFlash('down');
    prevPrice.current = liveYesPrice;
    const t = setTimeout(() => setFlash(null), 600);
    return () => clearTimeout(t);
  }, [liveYesPrice]);

  const isActive = market.status === 'active';
  const isPolymarket = market.source === 'polymarket';
  const href = `/predictions/${market.ticker}`;

  const effectiveYesPrice = liveYesPrice ?? market.yesPrice;
  const effectiveNoPrice = liveYesPrice != null ? 1 - liveYesPrice : market.noPrice;
  const yesPercent = Math.round(effectiveYesPrice * 100);
  const noPercent = Math.round(effectiveNoPrice * 100);
  const priceChange = market.yesPriceChange24h;
  const isPositive = priceChange > 0;
  const isNegative = priceChange < 0;

  const timeInfo = formatTimeRemaining(market.closesAt);
  const categoryInfo = categoryConfig[market.category] || categoryConfig.other;
  const CategoryIcon = categoryInfo.Icon;

  const sparklineData = useMemo(() => {
    return market.priceHistory || generateMockSparkline(market.ticker, market.yesPrice, priceChange);
  }, [market.ticker, market.priceHistory, market.yesPrice, priceChange]);

  return (
    <motion.div
      ref={observeRef}
      initial={index < 12 ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        delay: index < 12 ? Math.min(index * 0.03, 0.3) : 0,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <Link href={href} className="block">
        <div
          className="flex items-center gap-3 px-3 py-2.5 rounded-[10px]"
          style={{
            backgroundColor: T.surface,
            border: `1px solid ${T.border}`,
            opacity: isActive ? 1 : 0.55,
          }}
        >
          {/* Category Icon */}
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${categoryInfo.color}15` }}
          >
            <CategoryIcon className="w-4 h-4" style={{ color: categoryInfo.color }} />
          </div>

          {/* Title + Meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3
                className="text-[13px] font-medium truncate"
                style={{ color: T.text }}
              >
                {market.title}
              </h3>
              {/* Status badges */}
              {market.status === 'resolved' && (
                <span
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase flex-shrink-0"
                  style={{
                    backgroundColor: market.resolution === 'yes' ? T.greenSoft : T.redSoft,
                    color: market.resolution === 'yes' ? T.green : T.red,
                  }}
                >
                  <HiOutlineCheckCircle className="w-2.5 h-2.5" />
                  {market.resolution?.toUpperCase()}
                </span>
              )}
              {market.status === 'closed' && (
                <span
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase flex-shrink-0"
                  style={{ backgroundColor: 'rgba(107,114,128,0.1)', color: T.muted }}
                >
                  <HiOutlineLockClosed className="w-2.5 h-2.5" />
                  Closed
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px]" style={{ color: T.muted }}>
                {categoryInfo.label}
              </span>
              <span className="text-[11px]" style={{ color: T.subtle }}>·</span>
              <span className="text-[11px]" style={{ color: T.muted }}>
                {formatVolume(market.volume24h)} Vol
              </span>
              <span className="text-[11px]" style={{ color: T.subtle }}>·</span>
              <span
                className="text-[11px] flex items-center gap-0.5"
                style={{ color: timeInfo.isUrgent ? T.red : T.muted }}
              >
                <HiOutlineClock className="w-3 h-3" />
                {timeInfo.text}
              </span>
              {/* 24h change */}
              {priceChange !== 0 && (
                <>
                  <span className="text-[11px]" style={{ color: T.subtle }}>·</span>
                  <span
                    className="text-[10px] font-medium flex items-center gap-0.5"
                    style={{ color: isPositive ? T.green : T.red }}
                  >
                    {isPositive ? <HiOutlineTrendingUp className="w-3 h-3" /> : <HiOutlineTrendingDown className="w-3 h-3" />}
                    {isPositive ? '+' : ''}{(priceChange * 100).toFixed(1)}%
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Mini Sparkline */}
          <div className="flex-shrink-0 hidden sm:block">
            <MiniSparkline
              data={sparklineData}
              width={60}
              height={24}
              color={isPositive ? T.green : isNegative ? T.red : T.muted}
              id={market.ticker}
            />
          </div>

          {/* YES/NO Pills */}
          <div className="flex gap-1.5 flex-shrink-0">
            <div
              className="px-3 py-1 rounded-md text-center transition-colors duration-300"
              style={{
                backgroundColor: flash === 'up' ? T.greenSoft : T.surface,
                border: `1px solid ${T.greenBorder}`,
                minWidth: 48,
              }}
            >
              <span
                className="text-[12px] font-semibold"
                style={{ color: T.green, fontVariantNumeric: 'tabular-nums' }}
              >
                {yesPercent}¢
              </span>
              <div className="text-[8px] font-medium" style={{ color: T.green, opacity: 0.6 }}>YES</div>
            </div>
            <div
              className="px-3 py-1 rounded-md text-center transition-colors duration-300"
              style={{
                backgroundColor: flash === 'down' ? T.redSoft : T.surface,
                border: `1px solid ${T.redBorder}`,
                minWidth: 48,
              }}
            >
              <span
                className="text-[12px] font-semibold"
                style={{ color: T.red, fontVariantNumeric: 'tabular-nums' }}
              >
                {noPercent}¢
              </span>
              <div className="text-[8px] font-medium" style={{ color: T.red, opacity: 0.6 }}>NO</div>
            </div>
          </div>

          {/* Favorite */}
          {onToggleFavorite && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleFavorite(market);
              }}
              className="p-1 rounded-md flex-shrink-0"
              style={{ color: isFavorite ? T.yellow : T.muted }}
            >
              {isFavorite ? <HiStar className="w-4 h-4" /> : <HiOutlineStar className="w-4 h-4" />}
            </button>
          )}
        </div>
      </Link>
    </motion.div>
  );
});

export default MarketRow;
