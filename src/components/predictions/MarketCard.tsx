import React, { useRef, useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { T } from './theme';
import { categoryConfig } from './PredictionCard';
import type { PredictionMarket } from './PredictionCard';
import usePolymarketLivePrice from '~/hooks/usePolymarketLivePrice';
import { usePolymarketPriceHistory } from '~/hooks/usePolymarketMarkets';
import { formatVolume, formatTimeRemaining } from './utils';

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
  const effectiveNoPrice = liveYesPrice != null ? 1 - liveYesPrice : market.noPrice;
  const yesPercent = Math.round(effectiveYesPrice * 100);
  const noPercent = Math.round(effectiveNoPrice * 100);
  const priceChange = market.yesPriceChange24h;
  const isPositive = priceChange > 0;

  const timeInfo = formatTimeRemaining(market.closesAt);
  const categoryInfo = categoryConfig[market.category] || categoryConfig.other;

  // Fetch REAL price history from the same API the detail page uses
  const { history: priceHistoryRaw } = usePolymarketPriceHistory(
    tokenId,
    { interval: '1w', fidelity: 60, refreshInterval: 0, enabled: !!tokenId }
  );

  // Extract price values for sparkline
  const sparkData = useMemo(() => {
    if (priceHistoryRaw && priceHistoryRaw.length > 2) {
      return priceHistoryRaw.map((p: any) => typeof p === 'number' ? p : p.p ?? p.price ?? 0);
    }
    if (market.priceHistory && market.priceHistory.length > 2) {
      return market.priceHistory;
    }
    return null;
  }, [priceHistoryRaw, market.priceHistory]);

  const hasRealData = sparkData !== null && sparkData.length > 2;

  return (
    <motion.div
      ref={observeRef}
      initial={index < 16 ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.25,
        delay: index < 16 ? Math.min(index * 0.03, 0.35) : 0,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <Link href={href} className="block h-full group">
        <div
          className="relative flex flex-col h-full"
          style={{
            backgroundColor: T.bgCard,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            cursor: 'pointer',
            opacity: isActive ? 1 : 0.5,
            transition: `transform 200ms cubic-bezier(0.33, 1, 0.68, 1), box-shadow 200ms cubic-bezier(0.33, 1, 0.68, 1), border-color 150ms ease-out, background-color 150ms ease-out`,
            willChange: 'transform',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = T.borderHover;
            e.currentTarget.style.backgroundColor = T.bgCardHover;
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = T.border;
            e.currentTarget.style.backgroundColor = T.bgCard;
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div className="flex flex-col flex-1 p-4">
            {/* Header: image + title */}
            <div className="flex items-start gap-3 mb-3">
              {market.imageUrl && (
                <img
                  src={market.imageUrl}
                  alt=""
                  className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                  style={{ border: `1px solid ${T.border}` }}
                />
              )}
              <div className="flex-1 min-w-0">
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
                    margin: 0,
                  }}
                >
                  {market.title}
                </h3>
              </div>
            </div>

            {/* Sparkline — only if real price history exists */}
            {hasRealData && (
              <div className="mb-3" style={{ height: 32 }}>
                {(() => {
                  const pts = sparkData!;
                  let min = 1, max = 0;
                  for (const v of pts) { if (v < min) min = v; if (v > max) max = v; }
                  const range = max - min || 0.1;
                  const yMin = Math.max(0, min - range * 0.1);
                  const yMax = Math.min(1, max + range * 0.1);
                  const yRange = yMax - yMin || 0.1;
                  const W = 280, H = 32, pad = 2;
                  const step = W / (pts.length - 1);
                  const points = pts.map((v, i) => `${i * step},${pad + (H - pad * 2) - ((v - yMin) / yRange) * (H - pad * 2)}`);
                  const pathD = `M${points.join(' L')}`;
                  const color = isPositive ? T.green : priceChange < 0 ? T.red : T.textSecondary;
                  return (
                    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                      <defs>
                        <linearGradient id={`card-grad-${market.ticker}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
                          <stop offset="100%" stopColor={color} stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d={`${pathD} L${W},${H - pad} L0,${H - pad} Z`} fill={`url(#card-grad-${market.ticker})`} />
                      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
                    </svg>
                  );
                })()}
              </div>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Outcomes section */}
            {isMulti && ext.topOutcomes && ext.topOutcomes.length > 0 ? (
              /* Multi-outcome: rows with probability bars */
              <div className="flex flex-col gap-2 mb-3">
                {ext.topOutcomes.slice(0, 4).map((outcome, i) => {
                  const pct = Math.round(outcome.probability * 100);
                  return (
                    <div key={outcome.name} className="flex items-center gap-2">
                      <span
                        className="truncate flex-1 min-w-0"
                        style={{ fontSize: 13, color: i === 0 ? T.text : T.textSecondary }}
                      >
                        {outcome.name}
                      </span>
                      {/* Probability bar */}
                      <div
                        className="flex-shrink-0"
                        style={{ width: 48, height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2 }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: '100%',
                            backgroundColor: OUTCOME_COLORS[i % OUTCOME_COLORS.length],
                            borderRadius: 2,
                            transition: 'width 300ms ease',
                          }}
                        />
                      </div>
                      <span
                        className="flex-shrink-0"
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: i === 0 ? T.text : T.textSecondary,
                          fontVariantNumeric: 'tabular-nums',
                          width: 38,
                          textAlign: 'right',
                        }}
                      >
                        {pct}%
                      </span>
                    </div>
                  );
                })}
                {(ext.outcomeCount || 0) > 4 && (
                  <span style={{ fontSize: 12, color: T.muted }}>
                    +{(ext.outcomeCount || 0) - 4} more
                  </span>
                )}
              </div>
            ) : (
              /* Binary: Buy Yes / Buy No buttons like Polymarket */
              <div className="flex gap-2 mb-3">
                <div
                  className="flex-1 flex items-center justify-between px-3 py-2 rounded-lg"
                  style={{
                    backgroundColor: 'rgba(34, 197, 94, 0.08)',
                    border: '1px solid rgba(34, 197, 94, 0.15)',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.greenText }}>
                    Yes
                  </span>
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: T.greenText,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {yesPercent}¢
                  </span>
                </div>
                <div
                  className="flex-1 flex items-center justify-between px-3 py-2 rounded-lg"
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.15)',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.redText }}>
                    No
                  </span>
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: T.redText,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {noPercent}¢
                  </span>
                </div>
              </div>
            )}

            {/* Footer: volume + change + time */}
            <div
              className="flex items-center justify-between pt-3"
              style={{ borderTop: `1px solid ${T.border}`, fontSize: 12, color: T.muted }}
            >
              <div className="flex items-center gap-3">
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatVolume(market.totalVolume || market.volume24h)} Vol</span>
                {priceChange !== 0 && (
                  <span className="flex items-center gap-1" style={{ color: isPositive ? T.green : T.red, fontVariantNumeric: 'tabular-nums' }}>
                    {/* Pulsing dot for active movement */}
                    {Math.abs(priceChange) > 0.02 && (
                      <span
                        className="animate-pulse"
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          backgroundColor: isPositive ? T.green : T.red,
                          display: 'inline-block',
                        }}
                      />
                    )}
                    {isPositive ? '+' : ''}{(priceChange * 100).toFixed(1)}%
                  </span>
                )}
              </div>
              <span className="flex items-center gap-1" style={{ color: timeInfo.isUrgent ? T.redText : T.muted }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {timeInfo.text}
              </span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
});

export default MarketCard;
