import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineClock } from 'react-icons/hi';
import { T } from './theme';
import type { TalarionInstrument } from '~/hooks/useTalarion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TalarionMarketCardProps {
  instrument: TalarionInstrument;
  index: number;
  onTrade?: (instrumentId: string, side: 'yes' | 'no') => void;
  onClick?: (instrumentId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatResolutionTime(resolutionTime: string): { text: string; isUrgent: boolean } {
  const target = new Date(resolutionTime).getTime();
  const diff = target - Date.now();

  if (diff <= 0) return { text: 'Ended', isUrgent: false };

  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const isUrgent = diff <= 86_400_000;

  if (days > 30) {
    const months = Math.round(days / 30);
    return { text: `${months}mo`, isUrgent: false };
  }
  if (days > 0) return { text: `${days}d ${hours}h`, isUrgent };
  if (hours > 0) return { text: `${hours}h`, isUrgent: true };
  return { text: '<1h', isUrgent: true };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TradeButtons({
  instrumentId,
  yesCents,
  noCents,
  onTrade,
}: {
  instrumentId: string;
  yesCents: number;
  noCents: number;
  onTrade: (instrumentId: string, side: 'yes' | 'no') => void;
}) {
  return (
    <div className="flex gap-2">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onTrade(instrumentId, 'yes');
        }}
        className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all duration-150 active:scale-[0.97] focus-visible:ring-1 outline-none"
        style={{ backgroundColor: T.green, color: '#000' }}
      >
        Buy Yes {yesCents}&cent;
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onTrade(instrumentId, 'no');
        }}
        className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all duration-150 active:scale-[0.97] focus-visible:ring-1 outline-none"
        style={{ backgroundColor: T.red, color: '#fff' }}
      >
        Buy No {noCents}&cent;
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default React.memo(function TalarionMarketCard({
  instrument,
  index,
  onTrade,
  onClick,
}: TalarionMarketCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const yesPrice = instrument.price ?? 0.5;
  const noPrice = 1 - yesPrice;
  const yesCents = Math.round(yesPrice * 100);
  const noCents = Math.round(noPrice * 100);

  // Recompute time remaining periodically so it stays fresh
  const [timeInfo, setTimeInfo] = useState(() => formatResolutionTime(instrument.resolution_time));
  useEffect(() => {
    setTimeInfo(formatResolutionTime(instrument.resolution_time));
    // Only tick if market hasn't ended and is within 24h (urgent)
    const diff = new Date(instrument.resolution_time).getTime() - Date.now();
    if (diff <= 0) return;
    const interval = diff <= 86_400_000 ? 60_000 : 300_000; // 1min if urgent, 5min otherwise
    const id = setInterval(() => setTimeInfo(formatResolutionTime(instrument.resolution_time)), interval);
    return () => clearInterval(id);
  }, [instrument.resolution_time]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: Math.min(index * 0.06, 0.36),
        ease: [0.16, 1, 0.3, 1],
      }}
      className="relative"
    >
      <div
        role="button"
        tabIndex={0}
        className="group relative rounded-2xl overflow-hidden flex flex-col cursor-pointer outline-none focus-visible:ring-1"
        style={{
          backgroundColor: 'rgba(12, 14, 18, 0.75)',
          border: `1px solid ${T.border}`,
          transition: 'border-color 280ms ease, background-color 280ms ease',
          ...(isHovered
            ? { borderColor: T.borderHover, backgroundColor: 'rgba(12, 14, 18, 0.85)' }
            : {}),
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => onClick?.(instrument.instrument_id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick?.(instrument.instrument_id);
          }
        }}
      >
        {/* Content */}
        <div className="p-4 flex flex-col gap-3">
          {/* Top row: AI badge + resolution time */}
          <div className="flex items-center justify-between">
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
              style={{
                backgroundColor: T.purpleSoft,
                color: T.purple,
              }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5L8 1z"
                  fill="currentColor"
                />
              </svg>
              AI
            </span>

            <span
              className="flex items-center gap-1 text-[10px] font-medium"
              style={{ color: timeInfo.isUrgent ? T.red : T.muted }}
            >
              <HiOutlineClock className="w-3 h-3" />
              {timeInfo.text}
            </span>
          </div>

          {/* Title */}
          <h3
            className="font-semibold text-[14px] leading-[1.45] line-clamp-2"
            style={{ color: T.text }}
          >
            {instrument.title}
          </h3>

          {/* Rules */}
          <p
            className="text-[12px] leading-[1.5] line-clamp-2"
            style={{ color: T.muted }}
          >
            {instrument.rules}
          </p>

          {/* Probability bar */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span
                className="text-xs font-semibold"
                style={{ color: T.green, fontVariantNumeric: 'tabular-nums' }}
              >
                {yesCents}
                <span style={{ fontSize: '10px' }}>&cent;</span>
                <span
                  className="font-normal ml-1"
                  style={{ color: T.textSecondary, fontSize: '10px' }}
                >
                  Yes
                </span>
              </span>
              <span
                className="text-xs font-semibold"
                style={{ color: T.red, fontVariantNumeric: 'tabular-nums' }}
              >
                {noCents}
                <span style={{ fontSize: '10px' }}>&cent;</span>
                <span
                  className="font-normal ml-1"
                  style={{ color: T.textSecondary, fontSize: '10px' }}
                >
                  No
                </span>
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
                animate={{ width: `${yesCents}%` }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>

          {/* Trade buttons — always visible on mobile */}
          {onTrade && (
            <div className="md:hidden pt-1">
              <TradeButtons
                instrumentId={instrument.instrument_id}
                yesCents={yesCents}
                noCents={noCents}
                onTrade={onTrade}
              />
            </div>
          )}
        </div>

        {/* Desktop hover overlay trade buttons */}
        <AnimatePresence>
          {isHovered && onTrade && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-0 left-0 right-0 p-3 hidden md:block"
              style={{
                background: 'linear-gradient(to top, rgba(5,6,8,0.92) 70%, transparent)',
              }}
            >
              <TradeButtons
                instrumentId={instrument.instrument_id}
                yesCents={yesCents}
                noCents={noCents}
                onTrade={onTrade}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
})
