import React, { useRef, useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { T } from './theme';
import { categoryConfig } from './PredictionCard';
import type { PredictionMarket } from './PredictionCard';
import MiniSparkline from './MiniSparkline';
import usePolymarketLivePrice from '~/hooks/usePolymarketLivePrice';
import { generateMockSparkline, formatVolume, formatTimeRemaining } from './utils';

const OUTCOME_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'];

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
}: MarketCardProps) {
  const observeRef = useRef<HTMLDivElement>(null);
  const livePriceEntry = usePolymarketLivePrice(tokenId, observeRef);
  const liveYesPrice = livePriceEntry?.price;

  const ext = market as ExtendedMarket;
  const isMulti = ext.marketType === 'multi' && (ext.outcomeCount || 0) > 2;
  const isActive = market.status === 'active';
  const href = `/predictions/${market.ticker}`;

  const effectiveYesPrice = liveYesPrice ?? market.yesPrice;
  const yesPercent = Math.round(effectiveYesPrice * 100);
  const priceChange = market.yesPriceChange24h;
  const isPositive = priceChange > 0;
  const hasChange = priceChange !== 0;

  const timeInfo = formatTimeRemaining(market.closesAt);
  const categoryInfo = categoryConfig[market.category] || categoryConfig.other;
  const catColor = categoryInfo.color;

  const sparkData = useMemo(() => {
    return market.priceHistory || generateMockSparkline(market.ticker, market.yesPrice, priceChange);
  }, [market.ticker, market.priceHistory, market.yesPrice, priceChange]);

  const sparkColor = isPositive ? T.green : priceChange < 0 ? T.red : T.textSecondary;

  return (
    <motion.div
      ref={observeRef}
      initial={index < 16 ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        delay: index < 16 ? Math.min(index * 0.03, 0.4) : 0,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <Link href={href} className="block h-full group">
        <div
          className="relative flex flex-col h-full overflow-hidden"
          style={{
            backgroundColor: T.bgCard,
            border: `1px solid ${T.border}`,
            borderRadius: T.cardRadius,
            opacity: isActive ? 1 : 0.5,
            transition: `box-shadow ${T.transitionSnappy}, border-color ${T.transitionSnappy}, background-color ${T.transitionSnappy}`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = T.cardShadowHover;
            e.currentTarget.style.borderColor = T.borderHover;
            e.currentTarget.style.backgroundColor = T.bgCardHover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = 'none';
            e.currentTarget.style.borderColor = T.border;
            e.currentTarget.style.backgroundColor = T.bgCard;
          }}
        >
          <div className="flex flex-col flex-1 p-4">
            {/* Row 1: Category pill + volume + favorite */}
            <div className="flex items-center justify-between mb-3">
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                  backgroundColor: `${catColor}12`,
                  color: catColor,
                }}
              >
                {categoryInfo.label}
              </span>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 12, fontWeight: 500, color: T.muted }}>
                  {formatVolume(market.totalVolume || market.volume24h)} Vol
                </span>
                {onToggleFavorite && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onToggleFavorite(market);
                    }}
                    className="p-0.5"
                    style={{
                      color: isFavorite ? '#FBBF24' : T.subtle,
                      transition: `color ${T.transitionSnappy}`,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Row 2: Title (hero element) + thumbnail */}
            <div className="flex items-start gap-3 mb-3">
              {market.imageUrl && (
                <div
                  className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 mt-0.5"
                  style={{ border: `1px solid ${T.border}` }}
                >
                  <img src={market.imageUrl} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <h3
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  lineHeight: 1.4,
                  color: T.text,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical' as any,
                  overflow: 'hidden',
                  letterSpacing: '-0.01em',
                  margin: 0,
                  minHeight: '2.8em',
                }}
              >
                {market.title}
              </h3>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Row 3: Outcomes section */}
            {isMulti && ext.topOutcomes && ext.topOutcomes.length > 0 ? (
              /* Multi-outcome: compact rows */
              <div className="flex flex-col gap-1 mb-3">
                {ext.topOutcomes.slice(0, 3).map((outcome, i) => {
                  const pct = Math.round(outcome.probability * 100);
                  return (
                    <div key={outcome.name} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: OUTCOME_COLORS[i % OUTCOME_COLORS.length] }}
                        />
                        <span
                          className="truncate"
                          style={{ fontSize: 13, fontWeight: 500, color: i === 0 ? T.text : T.textSecondary }}
                        >
                          {outcome.name}
                        </span>
                      </div>
                      <span
                        className="flex-shrink-0 ml-2"
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: i === 0 ? T.text : T.textSecondary,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {pct}%
                      </span>
                    </div>
                  );
                })}
                {(ext.outcomeCount || 0) > 3 && (
                  <span style={{ fontSize: 11, color: T.muted, paddingTop: 2 }}>
                    +{(ext.outcomeCount || 0) - 3} more
                  </span>
                )}
              </div>
            ) : (
              /* Binary: price + sparkline + change */
              <div className="flex items-end justify-between mb-3">
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span
                      style={{
                        fontSize: 26,
                        fontWeight: 700,
                        color: yesPercent >= 50 ? T.greenText : T.redText,
                        fontVariantNumeric: 'tabular-nums',
                        letterSpacing: '-0.03em',
                        lineHeight: 1,
                      }}
                    >
                      {yesPercent}¢
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: T.textSecondary }}>
                      Yes
                    </span>
                  </div>
                  {hasChange && (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: isPositive ? T.green : T.red,
                        fontVariantNumeric: 'tabular-nums',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 2,
                        marginTop: 2,
                      }}
                    >
                      {isPositive ? '↑' : '↓'}{Math.abs(priceChange * 100).toFixed(1)}% today
                    </span>
                  )}
                </div>
                {/* Sparkline */}
                <div style={{ width: 72, height: 28, opacity: 0.8 }}>
                  <MiniSparkline
                    data={sparkData}
                    width={72}
                    height={28}
                    color={sparkColor}
                  />
                </div>
              </div>
            )}

            {/* Row 4: Footer — resolution date + traders */}
            <div
              className="flex items-center justify-between pt-3"
              style={{
                borderTop: `1px solid ${T.border}`,
                fontSize: 12,
                color: T.muted,
              }}
            >
              <span
                className="flex items-center gap-1"
                style={{ color: timeInfo.isUrgent ? T.redText : T.muted }}
              >
                {timeInfo.isUrgent ? '⏱' : '📅'} {timeInfo.text}
              </span>
              {market.traderCount ? (
                <span>{market.traderCount.toLocaleString()} traders</span>
              ) : isMulti && ext.outcomeCount ? (
                <span>{ext.outcomeCount} outcomes</span>
              ) : (
                <span>{formatVolume(market.volume24h)} 24h</span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
});

export default MarketCard;
