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
  /** Whether this market is saved/bookmarked */
  isSaved?: boolean;
  /** Toggle save/bookmark */
  onToggleSave?: (instrument: TalarionInstrument) => void;
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
  isSaved,
  onToggleSave,
}: TalarionMarketCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const hasPriceLoaded = instrument.price != null && instrument.price > 0.01 && instrument.price < 0.99;
  const yesPrice = hasPriceLoaded ? instrument.price! : 0.5;
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
      {/* Rainbow gradient border wrapper */}
      <div
        className="rounded-2xl p-[1px] transition-opacity duration-300"
        style={{
          background: isHovered
            ? 'linear-gradient(135deg, rgba(255,59,48,0.5), rgba(255,214,10,0.5), rgba(52,199,89,0.5), rgba(0,199,190,0.5), rgba(88,86,214,0.5), rgba(191,90,242,0.5))'
            : 'linear-gradient(135deg, rgba(255,59,48,0.2), rgba(255,214,10,0.2), rgba(52,199,89,0.2), rgba(0,199,190,0.2), rgba(88,86,214,0.2), rgba(191,90,242,0.2))',
        }}
      >
        <div
          role="button"
          tabIndex={0}
          className="group relative rounded-[15px] overflow-hidden flex flex-col cursor-pointer outline-none focus-visible:ring-1"
          style={{
            backgroundColor: 'rgba(10, 12, 16, 0.92)',
            transition: 'background-color 280ms ease',
            ...(isHovered ? { backgroundColor: 'rgba(14, 16, 22, 0.95)' } : {}),
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
          <div className="p-5 flex flex-col gap-3.5">
            {/* Top row: AI badge + resolution time */}
            <div className="flex items-center justify-between">
              <span
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,59,48,0.08), rgba(52,199,89,0.08), rgba(88,86,214,0.08))',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <defs>
                    <linearGradient id={`sparkle-${instrument.instrument_id.slice(0, 8)}`} x1="0" y1="0" x2="16" y2="16" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#FF3B30" />
                      <stop offset="33%" stopColor="#34C759" />
                      <stop offset="66%" stopColor="#00C7BE" />
                      <stop offset="100%" stopColor="#BF5AF2" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5L8 1z"
                    fill={`url(#sparkle-${instrument.instrument_id.slice(0, 8)})`}
                  />
                </svg>
                <span style={{ color: T.textSecondary }}>AI</span>
              </span>

              <div className="flex items-center gap-2">
                <span
                  className="flex items-center gap-1 text-[10px] font-medium"
                  style={{ color: timeInfo.isUrgent ? T.red : T.muted }}
                >
                  <HiOutlineClock className="w-3 h-3" />
                  {timeInfo.text}
                </span>
                {onToggleSave && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleSave(instrument); }}
                    className="p-1 rounded-md transition-colors hover:bg-white/10"
                    title={isSaved ? 'Remove from saved' : 'Save for later'}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill={isSaved ? '#4ADE80' : 'none'} stroke={isSaved ? '#4ADE80' : '#6b7280'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Title */}
            <h3
              className="font-semibold text-[15px] leading-[1.4] line-clamp-2"
              style={{ color: T.text }}
            >
              {instrument.title}
            </h3>

            {/* Rules */}
            <p
              className="text-[11px] leading-[1.5] line-clamp-2"
              style={{ color: T.muted }}
            >
              {instrument.rules}
            </p>

            {/* Trade price buttons */}
            <div className="pt-1">
              {hasPriceLoaded ? (
                <>
                  <div className="flex gap-2 mb-3">
                    <motion.button
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className="flex-1 py-2.5 rounded-xl text-center transition-all duration-150 active:scale-[0.97] outline-none focus-visible:ring-1"
                      style={{ backgroundColor: T.greenSoft, border: `1px solid rgba(74, 222, 128, 0.15)` }}
                      onClick={(e) => { e.stopPropagation(); onTrade?.(instrument.instrument_id, 'yes'); }}
                    >
                      <span
                        className="text-[16px] font-bold"
                        style={{ color: T.green, fontVariantNumeric: 'tabular-nums' }}
                      >
                        {yesCents}<span className="text-[11px]">&cent;</span>
                      </span>
                      <span className="text-[10px] font-medium ml-1.5" style={{ color: T.textSecondary }}>Yes</span>
                    </motion.button>
                    <motion.button
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
                      className="flex-1 py-2.5 rounded-xl text-center transition-all duration-150 active:scale-[0.97] outline-none focus-visible:ring-1"
                      style={{ backgroundColor: T.redSoft, border: `1px solid rgba(248, 113, 113, 0.15)` }}
                      onClick={(e) => { e.stopPropagation(); onTrade?.(instrument.instrument_id, 'no'); }}
                    >
                      <span
                        className="text-[16px] font-bold"
                        style={{ color: T.red, fontVariantNumeric: 'tabular-nums' }}
                      >
                        {noCents}<span className="text-[11px]">&cent;</span>
                      </span>
                      <span className="text-[10px] font-medium ml-1.5" style={{ color: T.textSecondary }}>No</span>
                    </motion.button>
                  </div>
                  {/* Probability bar */}
                  <motion.div
                    className="h-[3px] rounded-full overflow-hidden"
                    style={{ backgroundColor: T.redSoft }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: T.green }}
                      initial={{ width: 0 }}
                      animate={{ width: `${yesCents}%` }}
                      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </motion.div>
                </>
              ) : (
                /* Price loading state */
                <div className="flex gap-2 mb-3">
                  <div
                    className="flex-1 py-3 rounded-xl overflow-hidden"
                    style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}` }}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          className="block w-1 h-1 rounded-full"
                          style={{ backgroundColor: T.green }}
                          animate={{ opacity: [0.2, 0.8, 0.2] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                        />
                      ))}
                      <span className="text-[10px] font-medium ml-1" style={{ color: T.muted }}>Yes</span>
                    </div>
                  </div>
                  <div
                    className="flex-1 py-3 rounded-xl overflow-hidden"
                    style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}` }}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          className="block w-1 h-1 rounded-full"
                          style={{ backgroundColor: T.red }}
                          animate={{ opacity: [0.2, 0.8, 0.2] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                        />
                      ))}
                      <span className="text-[10px] font-medium ml-1" style={{ color: T.muted }}>No</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* No separate hover overlay needed — price pills are the trade buttons */}
        </div>
      </div>
    </motion.div>
  );
})
