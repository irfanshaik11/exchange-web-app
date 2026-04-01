import React, { useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineClock,
  HiOutlineCheckCircle,
  HiOutlineLockClosed,
  HiOutlineStar,
  HiStar,
  HiOutlineTrendingUp,
  HiOutlineTrendingDown,
  HiOutlineChartBar,
} from 'react-icons/hi';
import { T } from './theme';
import { categoryConfig } from './PredictionCard';
import type { PredictionMarket } from './PredictionCard';
import MiniSparkline from './MiniSparkline';
import AnimatedValue from './AnimatedValue';
import useTiltEffect from '~/hooks/useTiltEffect';
import usePolymarketLivePrice from '~/hooks/usePolymarketLivePrice';

// Generate sparkline data from price + change when real history isn't available
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

interface PredictionCardV2Props {
  market: PredictionMarket;
  index: number;
  showSource?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: (market: PredictionMarket) => void;
  onQuickTrade?: (market: PredictionMarket, side: 'yes' | 'no') => void;
  /** @deprecated Use tokenId prop instead — card subscribes internally */
  liveYesPrice?: number;
  /** YES token CLOB ID — card subscribes to live prices via useSyncExternalStore */
  tokenId?: string;
  /** Skip Framer Motion mount animation for off-screen cards */
  disableAnimation?: boolean;
}

const formatVolume = (volume: number): string => {
  if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(1)}M`;
  if (volume >= 1_000) return `$${(volume / 1_000).toFixed(0)}K`;
  return `$${volume.toFixed(0)}`;
};

const formatTimeRemaining = (closesAt: string): { text: string; isUrgent: boolean } => {
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0) return { text: 'Ended', isUrgent: false };

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const isUrgent = diff <= 86400000;

  let text = '';
  if (days > 0) text = `${days}d ${hours}h`;
  else if (hours > 0) text = `${hours}h`;
  else text = '<1h';

  return { text, isUrgent };
};

const PredictionCardV2 = React.memo(function PredictionCardV2({
  market,
  index,
  isFavorite = false,
  onToggleFavorite,
  onQuickTrade,
  liveYesPrice: liveYesPriceProp,
  tokenId,
  disableAnimation,
}: PredictionCardV2Props) {
  const tiltRef = useTiltEffect<HTMLDivElement>({ max: 2, perspective: 1200, scale: 1.01, disabled: !!disableAnimation });
  const observeRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = React.useState(false);

  // Per-card live price via useSyncExternalStore (only subscribes when visible)
  const livePriceEntry = usePolymarketLivePrice(tokenId, observeRef);
  const liveYesPrice = livePriceEntry?.price ?? liveYesPriceProp;

  // Flash effect on price change
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
  const hasLivePrice = liveYesPrice != null;
  const priceChange = market.yesPriceChange24h;
  const isPositive = priceChange > 0;
  const isNegative = priceChange < 0;

  const timeInfo = formatTimeRemaining(market.closesAt);
  const categoryInfo = categoryConfig[market.category] || categoryConfig.other;

  // Sparkline data — use real price history if available, otherwise generate from price + change
  const sparklineData = useMemo(() => {
    return market.priceHistory || generateMockSparkline(market.yesPrice, priceChange);
  }, [market.ticker, market.priceHistory]);

  const cardContent = (
      <Link href={href} className="block h-full">
        <div
          ref={tiltRef}
          className="group relative rounded-2xl h-full flex flex-col overflow-hidden backdrop-blur-xl"
          style={{
            backgroundColor: 'rgba(12, 14, 18, 0.75)',
            border: `1px solid ${T.border}`,
            opacity: isActive ? 1 : 0.6,
            transition: 'border-color 300ms ease, background-color 300ms ease',
          }}
          onMouseEnter={() => {
            setIsHovered(true);
            if (tiltRef.current) {
              tiltRef.current.style.borderColor = T.borderHover;
              tiltRef.current.style.backgroundColor = 'rgba(12, 14, 18, 0.82)';
            }
          }}
          onMouseLeave={() => {
            setIsHovered(false);
            if (tiltRef.current) {
              tiltRef.current.style.borderColor = T.border;
              tiltRef.current.style.backgroundColor = 'rgba(12, 14, 18, 0.75)';
            }
          }}
        >
          {/* Image */}
          {market.imageUrl && (
            <div className="relative h-32 overflow-hidden">
              <Image
                src={market.imageUrl}
                alt=""
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
              />
              <div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(to top, rgba(5,6,8,0.85) 0%, rgba(5,6,8,0.2) 50%, transparent 100%)',
                }}
              />
              {/* Category on image */}
              <div className="absolute top-3 left-3">
                <CategoryBadge category={market.category} />
              </div>
            </div>
          )}

          {/* Content */}
          <div className="p-4 pt-3 flex flex-col flex-1 gap-3">
            {/* Top row: Status + Category + Favorite */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusIndicator status={market.status} resolution={market.resolution} />
                {!market.imageUrl && <CategoryBadge category={market.category} />}
              </div>

              {onToggleFavorite && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggleFavorite(market);
                  }}
                  className="p-1 rounded-lg transition-colors"
                  style={{
                    color: isFavorite ? T.yellow : T.muted,
                  }}
                >
                  {isFavorite ? <HiStar className="w-4 h-4" /> : <HiOutlineStar className="w-4 h-4" />}
                </button>
              )}
            </div>

            {/* Title */}
            <h3
              className="font-semibold text-[13px] leading-[1.4] line-clamp-2"
              style={{ color: T.text }}
            >
              {market.title}
            </h3>

            {/* Spacer to push content down */}
            <div className="flex-1" />

            {/* Probability bar — clean, thin, professional */}
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <span
                  className="text-xs font-semibold"
                  style={{
                    color: T.green,
                    transition: 'opacity 0.3s',
                  }}
                >
                  <AnimatedValue value={yesPercent} suffix="%" decimals={0} instant={!!disableAnimation} />
                  <span className="font-normal ml-1" style={{ color: T.textSecondary, fontSize: '10px' }}>Yes</span>
                </span>
                <span
                  className="text-xs font-semibold"
                  style={{
                    color: T.red,
                  }}
                >
                  <AnimatedValue value={noPercent} suffix="%" decimals={0} instant={!!disableAnimation} />
                  <span className="font-normal ml-1" style={{ color: T.textSecondary, fontSize: '10px' }}>No</span>
                </span>
              </div>
              <div
                className="h-[3px] rounded-full overflow-hidden"
                style={{ backgroundColor: T.redSoft }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: T.green }}
                  initial={{ width: 0 }}
                  animate={{ width: `${yesPercent}%` }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            </div>

            {/* Price + Sparkline row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Price with flash effect */}
                <div
                  className="relative px-2 py-0.5 rounded-md transition-colors duration-300"
                  style={{
                    backgroundColor: flash === 'up' ? T.greenSoft : flash === 'down' ? T.redSoft : 'transparent',
                  }}
                >
                  <span
                    className="text-lg font-bold"
                    style={{
                      color: T.green,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {yesPercent}¢
                  </span>
                </div>

                {/* Live dot */}
                {hasLivePrice && (
                  <span className="relative flex h-1.5 w-1.5">
                    <span
                      className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50"
                      style={{ backgroundColor: T.green }}
                    />
                    <span
                      className="relative inline-flex rounded-full h-1.5 w-1.5"
                      style={{ backgroundColor: T.green }}
                    />
                  </span>
                )}

                {/* 24h change */}
                {priceChange !== 0 && (
                  <span
                    className="text-[10px] font-medium flex items-center gap-0.5"
                    style={{ color: isPositive ? T.green : T.red }}
                  >
                    {isPositive ? <HiOutlineTrendingUp className="w-3 h-3" /> : <HiOutlineTrendingDown className="w-3 h-3" />}
                    {isPositive ? '+' : ''}{(priceChange * 100).toFixed(1)}%
                  </span>
                )}
              </div>

              {/* Sparkline chart */}
              <MiniSparkline
                data={sparklineData}
                width={70}
                height={28}
                color={isPositive ? T.green : isNegative ? T.red : T.muted}
                id={market.ticker}
              />
            </div>

            {/* Stats footer */}
            <div
              className="flex items-center justify-between text-[11px] pt-2.5"
              style={{
                color: T.muted,
                borderTop: `1px solid ${T.border}`,
              }}
            >
              <div className="flex items-center gap-1">
                <HiOutlineChartBar className="w-3 h-3" />
                <span>{formatVolume(market.volume24h)}</span>
              </div>

              <TimeDisplay text={timeInfo.text} isUrgent={timeInfo.isUrgent} />
            </div>

            {/* Quick Trade overlay */}
            <AnimatePresence>
              {isHovered && isActive && onQuickTrade && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-0 left-0 right-0 p-3 flex gap-2"
                  style={{
                    background: 'linear-gradient(to top, rgba(5,6,8,0.9) 70%, transparent)',
                  }}
                >
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onQuickTrade(market, 'yes'); }}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold transition-transform active:scale-[0.97]"
                    style={{ backgroundColor: T.green, color: '#000' }}
                  >
                    Buy Yes {yesPercent}¢
                  </button>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onQuickTrade(market, 'no'); }}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold transition-transform active:scale-[0.97]"
                    style={{ backgroundColor: T.red, color: '#fff' }}
                  >
                    Buy No {noPercent}¢
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </Link>
  );

  if (disableAnimation) {
    return <div ref={observeRef}>{cardContent}</div>;
  }

  return (
    <motion.div
      ref={observeRef}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: Math.min(index * 0.04, 0.32),
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {cardContent}
    </motion.div>
  );
});

export default PredictionCardV2;

// --- Sub-components ---

function StatusIndicator({ status, resolution }: { status: string; resolution?: string }) {
  if (status === 'resolved') {
    const isYes = resolution === 'yes';
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
        style={{
          backgroundColor: isYes ? T.greenSoft : T.redSoft,
          color: isYes ? T.green : T.red,
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
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
        style={{
          backgroundColor: 'rgba(107,114,128,0.10)',
          color: T.muted,
        }}
      >
        <HiOutlineLockClosed className="w-3 h-3" />
        Closed
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
      style={{
        backgroundColor: T.greenSoft,
        color: T.green,
      }}
    >
      <span className="relative flex h-[5px] w-[5px]">
        <span
          className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
          style={{ backgroundColor: T.green }}
        />
        <span
          className="relative inline-flex rounded-full h-[5px] w-[5px]"
          style={{ backgroundColor: T.green }}
        />
      </span>
      Live
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const config = categoryConfig[category] || categoryConfig.other;
  const CategoryIcon = config.Icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold"
      style={{
        backgroundColor: config.color,
        color: '#000',
      }}
    >
      <CategoryIcon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
}

function TimeDisplay({ text, isUrgent }: { text: string; isUrgent: boolean }) {
  return (
    <span
      className="flex items-center gap-1 text-[10px] font-medium"
      style={{
        color: isUrgent ? T.red : T.muted,
      }}
    >
      <HiOutlineClock className="w-3 h-3" />
      {text}
    </span>
  );
}
