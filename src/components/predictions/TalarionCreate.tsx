import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineChartBar, HiOutlineExternalLink } from 'react-icons/hi';
import { createPolymarketTradeToast, showPolymarketToast, POLYGON_LOGO_URL } from '~/utils/tradeToast';
import { T } from './theme';
import TalarionMarketCard from './TalarionMarketCard';
import useTalarion from '~/hooks/useTalarion';
import type { TalarionInstrument, PolymarketMatch } from '~/hooks/useTalarion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TalarionCreateProps {
  onMarketClick?: (instrumentId: string) => void;
  authToken?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CHARS = 50;

const SETTLEMENT_OPTIONS = [
  { label: '1d', value: '1d', ms: 86_400_000 },
  { label: '1w', value: '1w', ms: 604_800_000 },
  { label: '2w', value: '2w', ms: 1_209_600_000 },
  { label: '1m', value: '1m', ms: 2_592_000_000 },
] as const;

const SUGGESTIONS = [
  'Bitcoin above $100k',
  'Fed cuts rates',
  'Ethereum flips SOL MC',
  'Trump wins election',
  'ETH ETF approved',
  'SOL breaks ATH',
] as const;

// Easing used across all entrance animations
const EASE_ENTRANCE: [number, number, number, number] = [0.16, 1, 0.3, 1];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Animated loading indicator: three sequentially pulsing dots */
function GeneratingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3, ease: EASE_ENTRANCE }}
      className="flex flex-col items-center gap-3 py-10"
    >
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: T.purple }}
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.2,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
      <span
        className="text-[13px] font-medium"
        style={{ color: T.textSecondary }}
      >
        Generating markets...
      </span>
    </motion.div>
  );
}

/** Section divider with centered text */
function SectionDivider({ label }: { label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: EASE_ENTRANCE }}
      className="flex items-center gap-3 py-2"
    >
      <div className="flex-1 h-px" style={{ backgroundColor: T.border }} />
      <span
        className="text-[10px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: T.subtle }}
      >
        {label}
      </span>
      <div className="flex-1 h-px" style={{ backgroundColor: T.border }} />
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function TalarionCreate({ onMarketClick, authToken }: TalarionCreateProps) {
  // --- State ---
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [settlement, setSettlement] = useState<string>('1m');
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const {
    generateMarkets,
    getQuote,
    executeTrade,
    isGenerating,
    isTrading,
    generatedMarkets,
    matchingPublicMarkets,
    error,
    clearMarkets,
  } = useTalarion(authToken);

  // Auto-focus the input on mount
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(timer);
  }, []);

  // Scroll to results when new markets appear
  const prevCountRef = useRef(generatedMarkets.length);
  useEffect(() => {
    if (generatedMarkets.length > prevCountRef.current && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    prevCountRef.current = generatedMarkets.length;
  }, [generatedMarkets.length]);

  // --- Handlers ---

  const computeResolutionTime = useCallback(
    (settlementKey: string): string => {
      const option = SETTLEMENT_OPTIONS.find((o) => o.value === settlementKey);
      const ms = option?.ms ?? 2_592_000_000; // default 1 month
      return new Date(Date.now() + ms).toISOString();
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || isGenerating) return;

    const resolutionTime = computeResolutionTime(settlement);
    await generateMarkets(trimmed, resolutionTime);
    setQuery('');
  }, [query, isGenerating, settlement, computeResolutionTime, generateMarkets]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      setQuery(suggestion);
      // Small delay so the user sees the chip fill the input before submitting
      setTimeout(() => {
        inputRef.current?.focus();
      }, 60);
    },
    [],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // Sanitize: strip HTML tags
      const raw = e.target.value.replace(/<[^>]*>/g, '');
      if (raw.length <= MAX_CHARS) {
        setQuery(raw);
      }
    },
    [],
  );

  // Active trade state for inline trade panel
  const [activeTrade, setActiveTrade] = useState<{ instrument: TalarionInstrument; side: 'yes' | 'no' } | null>(null);
  const [tradeAmount, setTradeAmount] = useState('10');

  const handleTrade = useCallback(
    (instrumentId: string, side: 'yes' | 'no') => {
      const instrument = generatedMarkets.find(m => m.instrument_id === instrumentId);
      if (!instrument) return;
      setActiveTrade({ instrument, side });
      setTradeAmount('10');
    },
    [generatedMarkets],
  );

  const handleConfirmTrade = useCallback(async () => {
    if (!activeTrade || isTrading) return;
    const { instrument, side } = activeTrade;
    const dollars = parseFloat(tradeAmount);
    if (!dollars || dollars <= 0) {
      showPolymarketToast('Enter a valid amount', 'error');
      return;
    }

    const tradeToast = createPolymarketTradeToast({
      label: `${side === 'yes' ? 'Buy Yes' : 'Buy No'} — ${instrument.title.slice(0, 35)}…`,
      tokenName: instrument.title,
    });

    try {
      // Full pipeline: quote → submit → sign (Turnkey server-side) → relay
      const result = await executeTrade(instrument.instrument_id, side === 'yes', dollars);
      const price = Math.round(result.price * 100);
      tradeToast.complete(
        `${result.side} @ ${price}¢ — $${dollars.toFixed(2)}`,
        result.txHash,
      );
      setActiveTrade(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Trade failed';
      tradeToast.error(msg);
    }
  }, [activeTrade, tradeAmount, isTrading, executeTrade]);

  const handleCancelTrade = useCallback(() => {
    setActiveTrade(null);
  }, []);

  // --- Derived ---

  const charCount = query.length;
  const charColor = useMemo(() => {
    if (charCount >= MAX_CHARS) return T.red;
    if (charCount >= MAX_CHARS - 5) return T.yellow;
    return T.muted;
  }, [charCount]);

  const canSubmit = query.trim().length > 0 && !isGenerating;
  const showSuggestions = generatedMarkets.length === 0 && !isGenerating;

  return (
    <div
      className="w-full rounded-2xl backdrop-blur-xl px-6 md:px-10 py-10 md:py-14 min-h-[60vh] flex flex-col"
      style={{
        color: T.text,
        backgroundColor: 'rgba(8, 10, 14, 0.88)',
        border: `1px solid ${T.border}`,
      }}
    >
      {/* Centered inner column for header + input + suggestions */}
      <div className="w-full max-w-2xl mx-auto flex-1 flex flex-col">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE_ENTRANCE }}
        className="mb-10 text-center"
      >
        <h1
          className="text-[32px] md:text-[40px] font-bold leading-[1.1] tracking-[-0.03em]"
          style={{ color: T.text }}
        >
          Trade What You Know
        </h1>
        <p
          className="mt-3 text-[14px] md:text-[15px] leading-relaxed"
          style={{ color: T.muted }}
        >
          Describe any event. AI turns it into a tradeable market.
        </p>
      </motion.div>

      {/* Input area */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.06, ease: EASE_ENTRANCE }}
        className="mb-8"
      >
        <div
          className="relative flex items-center rounded-xl overflow-hidden transition-all duration-200"
          style={{
            backgroundColor: 'rgba(12, 14, 18, 0.85)',
            border: `1px solid ${T.borderHover}`,
          }}
          // Elevate border on focus-within
          onFocus={(e) => {
            (e.currentTarget as HTMLDivElement).style.borderColor = T.borderHover;
          }}
          onBlur={(e) => {
            // Only remove if focus left the container entirely
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              (e.currentTarget as HTMLDivElement).style.borderColor = T.border;
            }
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="What do you think will happen?"
            maxLength={MAX_CHARS}
            aria-label="Market prediction query"
            className="flex-1 bg-transparent py-4 px-5 text-[15px] placeholder-current outline-none"
            style={{
              color: T.text,
              // Use ::placeholder pseudo-element color via inline workaround
            }}
            autoComplete="off"
            spellCheck={false}
          />

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            aria-label="Generate markets"
            className="mr-2 p-2 rounded-lg transition-all duration-150 outline-none focus-visible:ring-1"
            style={{
              backgroundColor: canSubmit ? T.purple : 'transparent',
              color: canSubmit ? '#fff' : T.subtle,
              opacity: canSubmit ? 1 : 0.4,
              cursor: canSubmit ? 'pointer' : 'default',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2.5 8h11M9 3.5L13.5 8 9 12.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* Meta row: char count + settlement pills */}
        <div className="flex items-center justify-between mt-4 gap-4">
          {/* Character counter */}
          <span
            className="text-[11px] font-medium tabular-nums"
            style={{ color: charColor, fontVariantNumeric: 'tabular-nums' }}
          >
            {charCount}/{MAX_CHARS}
          </span>

          {/* Settlement time pills */}
          <div className="flex items-center gap-1.5">
            <span
              className="text-[11px] font-medium mr-1"
              style={{ color: T.muted }}
            >
              Settles in
            </span>
            {SETTLEMENT_OPTIONS.map((opt) => {
              const isActive = settlement === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setSettlement(opt.value)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all duration-150 outline-none focus-visible:ring-1"
                  style={{
                    backgroundColor: isActive ? T.purpleSoft : 'transparent',
                    color: isActive ? T.purple : T.muted,
                    border: `1px solid ${isActive ? 'rgba(129, 140, 248, 0.2)' : T.border}`,
                  }}
                  aria-pressed={isActive}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* Suggestions */}
      <AnimatePresence mode="wait">
        {showSuggestions && (
          <motion.div
            key="suggestions"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3, ease: EASE_ENTRANCE }}
            className="mb-8"
          >
            <p
              className="text-[12px] font-medium mb-3 flex items-center justify-center gap-1.5"
              style={{ color: T.muted }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M2 8h12M8 2v12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              Try asking
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSuggestionClick(s)}
                  className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-all duration-150 outline-none focus-visible:ring-1 active:scale-[0.97]"
                  style={{
                    backgroundColor: 'rgba(12, 14, 18, 0.75)',
                    color: T.textSecondary,
                    border: `1px solid ${T.borderHover}`,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = T.borderHover;
                    (e.currentTarget as HTMLButtonElement).style.color = T.text;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = T.border;
                    (e.currentTarget as HTMLButtonElement).style.color = T.textSecondary;
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error state */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="mb-6 px-4 py-3 rounded-xl text-[13px]"
            style={{
              backgroundColor: T.redSoft,
              color: T.red,
              border: `1px solid rgba(248, 113, 113, 0.15)`,
            }}
            role="alert"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading state */}
      <AnimatePresence mode="wait">
        {isGenerating && <GeneratingIndicator key="generating" />}
      </AnimatePresence>

      </div>{/* End centered inner column */}

      {/* Generated markets — full width */}
      <AnimatePresence>
        {generatedMarkets.length > 0 && (
          <motion.div
            key="results"
            ref={resultsRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: EASE_ENTRANCE }}
          >
            <div className="flex items-center justify-between mb-2">
              <SectionDivider label="AI Generated Markets" />
            </div>

            {/* Clear button */}
            {generatedMarkets.length > 2 && (
              <div className="flex justify-end mb-3">
                <button
                  onClick={clearMarkets}
                  className="text-[11px] font-medium transition-colors duration-150 outline-none focus-visible:underline"
                  style={{ color: T.muted }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = T.textSecondary;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = T.muted;
                  }}
                >
                  Clear all
                </button>
              </div>
            )}

            {/* Cards grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {generatedMarkets.map((instrument, i) => (
                <TalarionMarketCard
                  key={instrument.instrument_id}
                  instrument={instrument}
                  index={i}
                  onTrade={handleTrade}
                  onClick={(id) => {
                    if (onMarketClick) {
                      onMarketClick(id);
                    } else {
                      // Default: open trade panel on YES side
                      handleTrade(id, 'yes');
                    }
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Public Markets from Polymarket */}
      <AnimatePresence>
        {matchingPublicMarkets.length > 0 && (
          <motion.div
            key="public-markets"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.15, ease: EASE_ENTRANCE }}
            className="mt-6"
          >
            <SectionDivider label="Public Markets" />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
              {matchingPublicMarkets.map((market, i) => {
                const yesCents = Math.round(market.yesPrice * 100);
                const noCents = Math.round(market.noPrice * 100);
                const vol = parseFloat(market.volume);
                const liq = parseFloat(market.liquidity);
                const formatNum = (n: number) => {
                  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
                  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
                  return `$${n.toFixed(0)}`;
                };

                return (
                  <motion.div
                    key={market.ticker}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: Math.min(i * 0.05, 0.3), ease: EASE_ENTRANCE }}
                    className="group rounded-2xl p-4 cursor-pointer transition-all duration-200"
                    style={{
                      backgroundColor: 'rgba(12, 14, 18, 0.75)',
                      border: `1px solid ${T.border}`,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = T.borderHover;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = T.border;
                    }}
                    onClick={() => router.push(`/predictions/${market.ticker}?source=polymarket`)}
                  >
                    {/* Title */}
                    <h4
                      className="font-semibold text-[13px] leading-[1.4] line-clamp-2 mb-3"
                      style={{ color: T.text }}
                    >
                      {market.title}
                    </h4>

                    {/* Stats row */}
                    <div className="flex items-center gap-4 mb-3 text-[11px]" style={{ color: T.muted }}>
                      <span>Vol <span style={{ color: T.textSecondary }}>{formatNum(vol)}</span></span>
                      <span>Liq <span style={{ color: T.textSecondary }}>{formatNum(liq)}</span></span>
                      <span>Outcomes <span style={{ color: T.textSecondary }}>{market.outcomes}</span></span>
                    </div>

                    {/* Yes/No prices */}
                    <div className="flex gap-2">
                      <div
                        className="flex-1 py-1.5 rounded-lg text-center text-[12px] font-semibold"
                        style={{ backgroundColor: T.greenSoft, color: T.green }}
                      >
                        Yes {yesCents}&cent;
                      </div>
                      <div
                        className="flex-1 py-1.5 rounded-lg text-center text-[12px] font-semibold"
                        style={{ backgroundColor: T.redSoft, color: T.red }}
                      >
                        No {noCents}&cent;
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inline Trade Panel */}
      <AnimatePresence>
        {activeTrade && (
          <motion.div
            key="trade-panel"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: EASE_ENTRANCE }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={handleCancelTrade}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-sm rounded-2xl p-5"
              style={{
                backgroundColor: 'rgba(12, 14, 18, 0.95)',
                border: `1px solid ${T.borderHover}`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <span
                  className="text-[13px] font-semibold"
                  style={{ color: activeTrade.side === 'yes' ? T.green : T.red }}
                >
                  Buy {activeTrade.side.toUpperCase()}
                </span>
                <button
                  onClick={handleCancelTrade}
                  className="text-sm p-1 rounded-lg transition-colors hover:bg-white/5"
                  style={{ color: T.muted }}
                >
                  &times;
                </button>
              </div>

              {/* Market title */}
              <p className="text-[13px] font-medium mb-4 line-clamp-2" style={{ color: T.text }}>
                {activeTrade.instrument.title}
              </p>

              {/* Price info */}
              <div
                className="flex items-center justify-between px-3 py-2 rounded-lg mb-4"
                style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
              >
                <span className="text-[11px]" style={{ color: T.muted }}>Price</span>
                <span
                  className="text-[14px] font-semibold"
                  style={{
                    color: activeTrade.side === 'yes' ? T.green : T.red,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {Math.round((activeTrade.side === 'yes'
                    ? (activeTrade.instrument.price ?? 0.5)
                    : 1 - (activeTrade.instrument.price ?? 0.5)) * 100)}&cent;
                </span>
              </div>

              {/* Amount input */}
              <div className="mb-4">
                <label className="text-[11px] font-medium mb-1.5 block" style={{ color: T.muted }}>
                  Amount (USDC)
                </label>
                <input
                  type="number"
                  value={tradeAmount}
                  onChange={(e) => setTradeAmount(e.target.value)}
                  min="1"
                  step="1"
                  className="w-full px-3 py-2.5 rounded-lg text-[14px] outline-none focus:ring-1"
                  style={{
                    backgroundColor: 'rgba(12, 14, 18, 0.85)',
                    border: `1px solid ${T.border}`,
                    color: T.text,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                  autoFocus
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handleCancelTrade}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-colors"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    color: T.textSecondary,
                    border: `1px solid ${T.border}`,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmTrade}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-all active:scale-[0.97]"
                  style={{
                    backgroundColor: activeTrade.side === 'yes' ? T.green : T.red,
                    color: activeTrade.side === 'yes' ? '#000' : '#fff',
                  }}
                >
                  Confirm {activeTrade.side === 'yes' ? 'Yes' : 'No'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Placeholder text style for the input */}
      <style jsx>{`
        input::placeholder {
          color: ${T.subtle};
        }

        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
}
