import React, { useRef, useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  HiOutlineClock,
  HiOutlineStar,
  HiStar,
  HiOutlineChartBar,
} from 'react-icons/hi';
import { T } from './theme';
import { categoryConfig } from './PredictionCard';
import type { PredictionMarket } from './PredictionCard';
import MultiLineSparkline from './MultiLineSparkline';
import usePolymarketLivePrice from '~/hooks/usePolymarketLivePrice';
import { generateMockSparkline, formatVolume, formatTimeRemaining } from './utils';

const OUTCOME_COLORS = ['#4ADE80', '#60A5FA', '#FBBF24', '#F472B6', '#A78BFA'];

// Extended market fields that come from unified hook
interface ExtendedMarket extends PredictionMarket {
  marketType?: 'binary' | 'multi';
  subtitle?: string;
  outcomeCount?: number;
  topOutcomes?: { name: string; probability: number }[];
}

interface MarketCardProps {
  market: PredictionMarket;
  index: number;
  isFavorite?: boolean;
  onToggleFavorite?: (market: PredictionMarket) => void;
  tokenId?: string;
  showSource?: boolean;
}

const MarketCard = React.memo(function MarketCard({
  market,
  index,
  isFavorite = false,
  onToggleFavorite,
  tokenId,
  showSource,
}: MarketCardProps) {
  const observeRef = useRef<HTMLDivElement>(null);
  const livePriceEntry = usePolymarketLivePrice(tokenId, observeRef);
  const liveYesPrice = livePriceEntry?.price;

  const ext = market as ExtendedMarket;
  const isMulti = ext.marketType === 'multi' && (ext.outcomeCount || 0) > 2;
  const isActive = market.status === 'active';
  const isPolymarket = market.source === 'polymarket';
  const href = isPolymarket
    ? `/predictions/${market.ticker}?source=polymarket`
    : `/predictions/${market.ticker}`;

  const effectiveYesPrice = liveYesPrice ?? market.yesPrice;
  const effectiveNoPrice = liveYesPrice != null ? 1 - liveYesPrice : market.noPrice;
  const yesPercent = Math.round(effectiveYesPrice * 100);
  const noPercent = Math.round(effectiveNoPrice * 100);
  const priceChange = market.yesPriceChange24h;
  const isPositive = priceChange > 0;

  // Parse leading outcome from subtitle (e.g. "Leading: Gavin Newsom (27%)")
  const leadingName = ext.subtitle?.replace(/^Leading:\s*/, '').replace(/\s*\(\d+%\)$/, '') || null;

  const timeInfo = formatTimeRemaining(market.closesAt);
  const categoryInfo = categoryConfig[market.category] || categoryConfig.other;
  const CategoryIcon = categoryInfo.Icon;
  const catColor = categoryInfo.color;

  const chartSeries = useMemo(() => {
    if (isMulti && ext.topOutcomes && ext.topOutcomes.length > 1) {
      return ext.topOutcomes.slice(0, 3).map((outcome, i) => ({
        data: generateMockSparkline(`${market.ticker}-${outcome.name}`, outcome.probability, (priceChange || 0) * (1 - i * 0.3)),
        color: OUTCOME_COLORS[i % OUTCOME_COLORS.length],
      }));
    }
    const yesData = market.priceHistory || generateMockSparkline(market.ticker, market.yesPrice, priceChange);
    const noData = yesData.map(v => 1 - v);
    return [
      { data: yesData, color: T.green },
      { data: noData, color: T.red },
    ];
  }, [market.ticker, market.priceHistory, market.yesPrice, priceChange, isMulti, ext.topOutcomes]);

  return (
    <motion.div
      ref={observeRef}
      initial={index < 16 ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.35,
        delay: index < 16 ? Math.min(index * 0.04, 0.5) : 0,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <Link href={href} className="block h-full group">
        <div
          className="relative flex flex-col h-full overflow-hidden"
          style={{
            backgroundColor: 'rgba(14, 16, 22, 0.75)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: `1px solid rgba(255, 255, 255, 0.06)`,
            borderRadius: T.cardRadius,
            opacity: isActive ? 1 : 0.55,
            boxShadow: T.cardShadow,
            transition: `box-shadow ${T.transitionSmooth}, border-color ${T.transitionSmooth}`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = T.cardShadowHover;
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.10)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = T.cardShadow;
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
          }}
        >

          <div className="flex flex-col flex-1 p-4 pt-3.5 relative z-[1]">
            {/* Header: Category icon + label + time + star */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div
                  className="w-5 h-5 rounded flex items-center justify-center"
                  style={{ backgroundColor: `${catColor}15` }}
                >
                  <CategoryIcon className="w-3 h-3" style={{ color: catColor }} />
                </div>
                <span
                  className="font-bold uppercase"
                  style={{
                    color: catColor,
                    fontSize: 9,
                    letterSpacing: '0.1em',
                  }}
                >
                  {categoryInfo.label}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] font-medium flex items-center gap-1"
                  style={{ color: timeInfo.isUrgent ? T.red : T.muted }}
                >
                  <HiOutlineClock className="w-3 h-3" />
                  {timeInfo.text}
                </span>
                {onToggleFavorite && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onToggleFavorite(market);
                    }}
                    className="p-0.5"
                    aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    style={{ color: isFavorite ? T.yellow : T.subtle }}
                  >
                    {isFavorite ? (
                      <HiStar className="w-3.5 h-3.5" />
                    ) : (
                      <HiOutlineStar className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Title with optional image */}
            <div className="flex items-start gap-2.5 mb-4">
              {market.imageUrl && (
                <div
                  className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 mt-0.5"
                  style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <img
                    src={market.imageUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <h3
                className="text-[15px] font-semibold leading-snug"
                style={{
                  color: T.text,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  letterSpacing: '-0.01em',
                  minHeight: '2.6em',
                }}
              >
                {market.title}
              </h3>
            </div>

            {/* Multi-line chart */}
            <div className="mb-3 -mx-1 opacity-60">
              <MultiLineSparkline
                series={chartSeries}
                width={280}
                height={36}
                showGradient
              />
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Outcome rows */}
            <div className="flex flex-col gap-2 mb-4">
              {isMulti && ext.topOutcomes && ext.topOutcomes.length > 0 ? (
                <div
                  className="flex flex-col gap-1.5 overflow-y-auto pr-1"
                  style={{ maxHeight: '140px' }}
                >
                  {ext.topOutcomes.map((outcome, i) => {
                    const pct = Math.round(outcome.probability * 100);
                    const isFirst = i === 0;
                    return (
                      <div
                        key={outcome.name}
                        className="flex items-center justify-between px-3 py-2 rounded-lg"
                        style={{
                          backgroundColor: isFirst ? `${catColor}08` : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${isFirst ? `${catColor}18` : 'rgba(255,255,255,0.04)'}`,
                        }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{
                              backgroundColor: isFirst ? catColor : T.muted,
                              opacity: isFirst ? 1 : 0.5,
                            }}
                          />
                          <span
                            className="text-[12px] font-medium truncate"
                            style={{ color: isFirst ? T.text : T.muted }}
                          >
                            {outcome.name}
                          </span>
                        </div>
                        <span
                          className="text-[14px] font-bold flex-shrink-0 ml-2"
                          style={{
                            color: isFirst ? T.text : T.muted,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {pct}%
                        </span>
                      </div>
                    );
                  })}
                  {(ext.outcomeCount || 0) > 5 && (
                    <div className="px-3 py-1">
                      <span className="text-[11px]" style={{ color: T.muted }}>
                        + {(ext.outcomeCount || 0) - 5} more outcomes
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Binary: YES row */}
                  <div
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg"
                    style={{
                      backgroundColor: 'rgba(74, 222, 128, 0.05)',
                      border: '1px solid rgba(74, 222, 128, 0.12)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[11px] font-semibold uppercase"
                        style={{ color: T.green }}
                      >
                        Yes
                      </span>
                      {priceChange !== 0 && (
                        <span
                          className="text-[9px] font-medium px-1 py-px rounded"
                          style={{
                            color: isPositive ? T.green : T.red,
                            backgroundColor: isPositive
                              ? 'rgba(74, 222, 128, 0.08)'
                              : 'rgba(248, 113, 113, 0.08)',
                          }}
                        >
                          {isPositive ? '↑' : '↓'}
                          {Math.abs(priceChange * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <span
                      className="text-[18px] font-bold"
                      style={{
                        color: T.green,
                        fontVariantNumeric: 'tabular-nums',
                        letterSpacing: '-0.03em',
                      }}
                    >
                      {yesPercent}%
                    </span>
                  </div>

                  {/* Binary: NO row */}
                  <div
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg"
                    style={{
                      backgroundColor: 'rgba(248, 113, 113, 0.05)',
                      border: '1px solid rgba(248, 113, 113, 0.12)',
                    }}
                  >
                    <span
                      className="text-[11px] font-semibold uppercase"
                      style={{ color: T.red }}
                    >
                      No
                    </span>
                    <span
                      className="text-[18px] font-bold"
                      style={{
                        color: T.red,
                        fontVariantNumeric: 'tabular-nums',
                        letterSpacing: '-0.03em',
                      }}
                    >
                      {noPercent}%
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Footer: Volume */}
            <div
              className="flex items-center justify-between text-[10px]"
              style={{ color: T.muted }}
            >
              <div className="flex items-center gap-1.5">
                <HiOutlineChartBar className="w-3 h-3" />
                <span className="font-medium">
                  {formatVolume(market.volume24h)} vol
                </span>
              </div>
              {isMulti && ext.outcomeCount ? (
                <span className="font-medium" style={{ color: catColor }}>
                  {ext.outcomeCount} markets
                </span>
              ) : market.traderCount ? (
                <span className="font-medium">
                  {market.traderCount.toLocaleString()} traders
                </span>
              ) : null}
            </div>
          </div>

          {/* Bottom progress bar */}
          <div className="flex h-[3px]">
            {isMulti ? (
              <>
                <div style={{ width: `${yesPercent}%`, backgroundColor: catColor }} />
                <div style={{ width: `${noPercent}%`, backgroundColor: 'rgba(255,255,255,0.06)' }} />
              </>
            ) : (
              <>
                <div style={{ width: `${yesPercent}%`, backgroundColor: T.green }} />
                <div style={{ width: `${noPercent}%`, backgroundColor: T.red }} />
              </>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
});

export default MarketCard;
