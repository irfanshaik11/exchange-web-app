import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineChartBar, HiOutlineExternalLink, HiOutlineClock } from 'react-icons/hi';
import { createPolymarketTradeToast, showPolymarketToast, POLYGON_LOGO_URL } from '~/utils/tradeToast';
import { T } from './theme';
import TalarionMarketCard from './TalarionMarketCard';
import useTalarion from '~/hooks/useTalarion';
import type { TalarionInstrument, TalarionPosition, TalarionBalance, PolymarketMatch } from '~/hooks/useTalarion';
import usePredictionFavorites from '~/hooks/usePredictionFavorites';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TalarionCreateProps {
  onMarketClick?: (instrumentId: string) => void;
  authToken?: string;
  /** When true, renders a compact single-row input bar (~48px) instead of the full hero */
  compact?: boolean;
  /** Called when compact bar is expanded (user starts typing or clicks) */
  onExpand?: () => void;
  /** Start with the panel expanded */
  defaultExpanded?: boolean;
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

/** Skeleton placeholder card for AI markets while generating */
function AICardSkeleton({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.1, ease: EASE_ENTRANCE }}
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: 'rgba(12, 14, 18, 0.75)',
        border: `1px solid ${T.border}`,
      }}
    >
      <div className="p-4 flex flex-col gap-3">
        {/* Top row skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-5 w-10 rounded shimmer-bg" />
          <div className="h-4 w-16 rounded shimmer-bg" />
        </div>
        {/* Title skeleton — two lines */}
        <div className="flex flex-col gap-1.5">
          <div className="h-4 w-full rounded shimmer-bg" />
          <div className="h-4 w-3/4 rounded shimmer-bg" />
        </div>
        {/* Rules skeleton */}
        <div className="h-3 w-5/6 rounded shimmer-bg" />
        {/* Price bar skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-4 w-14 rounded shimmer-bg" />
          <div className="h-4 w-14 rounded shimmer-bg" />
        </div>
        <div className="h-[3px] w-full rounded-full shimmer-bg" />
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function TalarionCreate({ onMarketClick, authToken, compact, onExpand, defaultExpanded }: TalarionCreateProps) {
  // --- State ---
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [settlement, setSettlement] = useState<string>('1m');
  const isCollapsed = false;
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Save/bookmark for Talarion markets
  const { favorites, isFavorite, toggleFavorite, removeFavorite } = usePredictionFavorites();
  const [showSaved, setShowSaved] = useState(false);
  const savedTalarionMarkets = useMemo(
    () => favorites.filter(f => f.source === 'talarion'),
    [favorites],
  );
  const handleToggleSave = useCallback((instrument: TalarionInstrument) => {
    toggleFavorite({
      ticker: instrument.instrument_id,
      title: instrument.title,
      source: 'talarion',
      rules: instrument.rules,
      resolutionTime: instrument.resolution_time,
      price: instrument.price,
    });
  }, [toggleFavorite]);

  const {
    generateMarkets,
    getQuote,
    executeTrade,
    sellPosition,
    fetchPositions,
    fetchBalance,
    reconcileSettlements,
    positions,
    balance,
    isGenerating,
    isTrading,
    isSelling,
    isReconciling,
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
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
      // Check generated markets first, then fall back to saved markets
      let instrument = generatedMarkets.find(m => m.instrument_id === instrumentId);
      if (!instrument) {
        const saved = savedTalarionMarkets.find(f => f.ticker === instrumentId);
        if (saved) {
          instrument = {
            instrument_id: saved.ticker,
            title: saved.title,
            rules: saved.rules || '',
            start_time: new Date().toISOString(),
            resolution_time: saved.resolutionTime || new Date(Date.now() + 30 * 86400000).toISOString(),
            price: saved.price,
          };
        }
      }
      if (!instrument) return;
      setActiveTrade({ instrument, side });
      setTradeAmount('10');
    },
    [generatedMarkets, savedTalarionMarkets],
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
      label: `${side === 'yes' ? 'Buy Yes' : 'Buy No'} — ${instrument.title.slice(0, 35)}`,
      tokenName: instrument.title,
    });

    // Progress feedback — update toast label during slow steps
    const swapTimer = setTimeout(() => tradeToast.updateLabel('Preparing on-chain transaction...'), 3000);
    const chainTimer = setTimeout(() => tradeToast.updateLabel('Confirming on Polygon...'), 8000);

    try {
      const result = await executeTrade(instrument.instrument_id, side === 'yes', dollars);
      clearTimeout(swapTimer);
      clearTimeout(chainTimer);
      const price = Math.round(result.price * 100);
      const explorerHash = result.txHash || result.feeTransactionHash || null;
      tradeToast.complete(
        `${result.side} @ ${price}¢ — $${dollars.toFixed(2)}`,
        explorerHash,
      );
      setActiveTrade(null);
      fetchPositions().catch(() => {});
      fetchBalance().catch(() => {});
    } catch (err: unknown) {
      clearTimeout(swapTimer);
      clearTimeout(chainTimer);
      const msg = err instanceof Error ? err.message : 'Trade failed';
      tradeToast.error(msg);
    }
  }, [activeTrade, tradeAmount, isTrading, executeTrade]);

  const handleCancelTrade = useCallback(() => {
    setActiveTrade(null);
  }, []);

  // --- Sell position state ---
  const [activeSell, setActiveSell] = useState<{ position: TalarionPosition } | null>(null);

  const handleSellClick = useCallback((position: TalarionPosition) => {
    setActiveSell({ position });
  }, []);

  const handleConfirmSell = useCallback(async () => {
    if (!activeSell || isSelling) return;
    const { position } = activeSell;

    const sellToast = createPolymarketTradeToast({
      label: `Sell ${position.side} — ${((position.marketTitle && !position.marketTitle.startsWith('0x')) ? position.marketTitle : 'AI Market').slice(0, 35)}`,
      tokenName: (position.marketTitle && !position.marketTitle.startsWith('0x')) ? position.marketTitle : 'AI Market',
    });

    try {
      const result = await sellPosition(
        position.marketId,
        position.side as 'YES' | 'NO',
      );
      sellToast.complete(
        `Position closed — $${result.proceeds.toFixed(2)} margin returned`,
        result.txHash,
      );
      setActiveSell(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sell failed';
      sellToast.error(msg);
    }
  }, [activeSell, isSelling, sellPosition]);

  const handleCancelSell = useCallback(() => {
    setActiveSell(null);
  }, []);

  // Fetch positions and balance when authToken becomes available
  useEffect(() => {
    if (authToken) {
      fetchPositions();
      fetchBalance();
    }
  // Only re-run when authToken changes (not on every render)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  // Reconcile settlements once after positions load (check for resolved markets)
  const hasReconciled = useRef(false);
  useEffect(() => {
    if (authToken && positions.length > 0 && !hasReconciled.current) {
      hasReconciled.current = true;
      reconcileSettlements().catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, positions.length]);

  const activePositions = useMemo(
    () => positions.filter(p => p.status === 'active' && p.tokenAmount > 0.001),
    [positions],
  );

  // --- Derived ---

  const charCount = query.length;
  const charColor = useMemo(() => {
    if (charCount >= MAX_CHARS) return T.red;
    if (charCount >= MAX_CHARS - 5) return T.yellow;
    return T.muted;
  }, [charCount]);

  const canSubmit = query.trim().length > 0 && !isGenerating;
  const showSuggestions = generatedMarkets.length === 0 && !isGenerating && !isTrading;

  // ── Compact mode: Predictions AI bar ─────────────────────────────
  if (compact) {
    return (
      <div
        className="w-full rounded-xl overflow-hidden relative"
        style={{
          background: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(59,130,246,0.06) 40%, rgba(16,185,129,0.06) 70%, rgba(139,92,246,0.04) 100%)',
          border: '1px solid rgba(139,92,246,0.18)',
        }}
      >
        {/* Subtle animated gradient shimmer */}
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.08) 20%, rgba(59,130,246,0.06) 40%, rgba(16,185,129,0.08) 60%, rgba(139,92,246,0.06) 80%, transparent 100%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer-ai 8s ease-in-out infinite',
          }}
        />

        <div className="relative flex items-center gap-3 px-4 py-2.5">
          {/* Predictions label with sparkle */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <defs>
                <linearGradient id="ai-compact-sparkle" x1="0" y1="0" x2="16" y2="16" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#8B5CF6" />
                  <stop offset="50%" stopColor="#3B82F6" />
                  <stop offset="100%" stopColor="#10B981" />
                </linearGradient>
              </defs>
              <path d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5L8 1z" fill="url(#ai-compact-sparkle)" />
            </svg>
            <span
              className="text-[13px] font-semibold tracking-tight"
              style={{
                background: 'linear-gradient(135deg, #8B5CF6, #3B82F6, #10B981)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Predictions
            </span>
            <span
              className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{
                background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.2))',
                color: '#a78bfa',
              }}
            >
              AI
            </span>
          </div>

          {/* Divider */}
          <div className="w-px h-4 flex-shrink-0" style={{ backgroundColor: 'rgba(139,92,246,0.2)' }} />

          {/* Input */}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => onExpand?.()}
            placeholder="What do you think will happen?"
            maxLength={MAX_CHARS}
            className="flex-1 bg-transparent text-sm outline-none placeholder-neutral-500"
            style={{ color: T.text }}
            autoComplete="off"
            spellCheck={false}
          />

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="p-1.5 rounded-md transition-all duration-150"
            style={{
              background: canSubmit ? 'linear-gradient(135deg, #8B5CF6, #3B82F6)' : 'transparent',
              color: canSubmit ? '#fff' : T.subtle,
              opacity: canSubmit ? 1 : 0.4,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2.5 8h11M9 3.5L13.5 8 9 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="iridescent-border h-full">
    <div
      className="iridescent-inner w-full h-full rounded-2xl flex flex-col relative overflow-hidden"
      style={{
        color: T.text,
      }}
    >
      <div className="overflow-hidden flex-1 flex flex-col">
      <div className="px-6 md:px-8 pb-6 md:pb-7 pt-4 flex flex-col justify-center relative flex-1">

      {/* Subtle radial glow — top center */}
      <div
        className="absolute -top-20 left-1/2 -translate-x-1/2 w-[500px] h-[300px] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 50%, rgba(139,92,246,0.05) 0%, transparent 60%)',
        }}
      />

      {/* Centered inner column for header + input + suggestions */}
      <div className="relative w-full max-w-2xl mx-auto flex flex-col">

      {/* Header */}
      <div className="mb-4 text-center">
        <div className="inline-flex items-center gap-2.5 mb-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
            <defs>
              <linearGradient id="ai-talarion-sparkle" x1="3" y1="2" x2="22" y2="21">
                <stop stopColor="#8B5CF6" />
                <stop offset="0.5" stopColor="#3B82F6" />
                <stop offset="1" stopColor="#10B981" />
              </linearGradient>
            </defs>
            <path
              d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"
              fill="url(#ai-talarion-sparkle)"
              className="animate-pulse"
              style={{ animationDuration: '3s' }}
            />
            <path
              d="M19 15L19.75 17.25L22 18L19.75 18.75L19 21L18.25 18.75L16 18L18.25 17.25L19 15Z"
              fill="url(#ai-talarion-sparkle)"
              className="animate-pulse"
              style={{ animationDuration: '2.5s', animationDelay: '0.5s' }}
            />
          </svg>
          <span
            className="text-[13px] font-bold tracking-[0.12em] uppercase"
            style={{
              background: 'linear-gradient(135deg, #8B5CF6, #3B82F6, #10B981)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Predictions AI
          </span>
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{
              background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.15))',
              color: '#a78bfa',
            }}
          >
            Predict Anything
          </span>
        </div>
        <p
          className="text-[13px] leading-relaxed"
          style={{ color: T.muted }}
        >
          Describe any event. AI turns it into a tradeable market.
        </p>
      </div>

      {/* Input area */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.06, ease: EASE_ENTRANCE }}
        className="mb-5"
      >
        <div
          className="relative flex items-center rounded-xl overflow-hidden transition-all duration-200"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.35)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
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
            className="flex-1 bg-transparent py-3 px-4 text-[14px] placeholder-neutral-500 outline-none"
            style={{
              color: T.text,
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
        <div className="flex items-center justify-between mt-3 gap-4">
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
            className="mb-4"
          >
            <p
              className="text-[11px] font-medium mb-2 flex items-center justify-center gap-1.5"
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
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    color: T.textSecondary,
                    border: '1px solid rgba(255, 255, 255, 0.1)',
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

      {/* Saved markets toggle — always visible when there are saved markets */}
      {savedTalarionMarkets.length > 0 && (
        <div className="flex justify-center mb-4">
          <button
            onClick={() => setShowSaved(!showSaved)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
            style={{
              backgroundColor: showSaved ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.05)',
              color: showSaved ? '#4ADE80' : '#9ca3af',
              border: `1px solid ${showSaved ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill={showSaved ? '#4ADE80' : 'none'} stroke={showSaved ? '#4ADE80' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            Saved Markets ({savedTalarionMarkets.length})
          </button>
        </div>
      )}

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

      </div>{/* End centered inner column */}

      {/* AI Generated Markets — skeleton placeholders + real cards as they stream in */}
      <AnimatePresence>
        {(isGenerating || generatedMarkets.length > 0) && (
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

            {/* Action buttons: Saved + Clear all */}
            {(savedTalarionMarkets.length > 0 || (generatedMarkets.length > 2 && !isGenerating)) && (
              <div className="flex items-center justify-between mb-3">
                {/* Saved toggle */}
                {savedTalarionMarkets.length > 0 ? (
                  <button
                    onClick={() => setShowSaved(!showSaved)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors"
                    style={{
                      backgroundColor: showSaved ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.05)',
                      color: showSaved ? '#4ADE80' : '#9ca3af',
                      border: `1px solid ${showSaved ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.06)'}`,
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill={showSaved ? '#4ADE80' : 'none'} stroke={showSaved ? '#4ADE80' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                    Saved {savedTalarionMarkets.length}
                  </button>
                ) : <div />}
                {/* Clear all */}
                {generatedMarkets.length > 2 && !isGenerating && (
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
                )}
              </div>
            )}

            {/* Cards grid — real cards + skeleton placeholders */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(generatedMarkets || [])
                .filter((inst): inst is TalarionInstrument => Boolean(inst?.instrument_id && inst?.title))
                .map((instrument, i) => (
                <TalarionMarketCard
                  key={instrument.instrument_id}
                  instrument={instrument}
                  index={i}
                  onTrade={handleTrade}
                  isSaved={isFavorite(instrument.instrument_id, 'talarion')}
                  onToggleSave={handleToggleSave}
                  onClick={onMarketClick ? (id) => onMarketClick(id) : undefined}
                />
              ))}
              {/* Skeleton placeholders for remaining cards while generating */}
              {isGenerating && (() => {
                const validCount = (generatedMarkets || []).filter(m => m?.instrument_id && m?.title).length;
                const remaining = Math.max(0, 3 - validCount);
                return Array.from({ length: remaining }, (_, i) =>
                  <AICardSkeleton key={`skel-${i}`} index={validCount + i} />
                );
              })()}
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
              {(matchingPublicMarkets || []).filter(Boolean).map((market, i) => {
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

      {/* Saved Markets */}
      <AnimatePresence>
        {showSaved && savedTalarionMarkets.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3 }}
          >
            <SectionDivider label="Saved Markets" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {savedTalarionMarkets.map((saved) => {
                const yesPrice = saved.price ?? 0.5;
                const noPrice = 1 - yesPrice;
                const yesCents = Math.round(yesPrice * 100);
                const noCents = Math.round(noPrice * 100);
                const timeLeft = saved.resolutionTime
                  ? (() => {
                      const diff = new Date(saved.resolutionTime).getTime() - Date.now();
                      if (diff <= 0) return 'Ended';
                      const days = Math.floor(diff / 86_400_000);
                      const hours = Math.floor((diff % 86_400_000) / 3_600_000);
                      if (days > 30) return `${Math.round(days / 30)}mo`;
                      if (days > 0) return `${days}d ${hours}h`;
                      return `${hours}h`;
                    })()
                  : null;

                return (
                  <div
                    key={saved.ticker}
                    className="rounded-xl p-4 flex flex-col gap-3 transition-colors"
                    style={{
                      backgroundColor: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    {/* Top row: bookmark + time */}
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#4ADE80' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="#4ADE80" stroke="#4ADE80" strokeWidth="2">
                          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                        </svg>
                        Saved
                      </span>
                      <div className="flex items-center gap-2">
                        {timeLeft && (
                          <span className="flex items-center gap-1 text-[10px] font-medium" style={{ color: T.muted }}>
                            <HiOutlineClock className="w-3 h-3" />
                            {timeLeft}
                          </span>
                        )}
                        <button
                          onClick={() => removeFavorite(saved.ticker, 'talarion')}
                          className="p-0.5 rounded hover:bg-white/10 transition-colors"
                          title="Remove"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Title */}
                    <h4 className="font-semibold text-[13px] leading-[1.4] line-clamp-2" style={{ color: T.text }}>
                      {saved.title}
                    </h4>

                    {/* YES / NO trade buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleTrade(saved.ticker, 'yes')}
                        className="flex-1 py-2 rounded-lg text-center text-[12px] font-semibold transition-colors hover:brightness-110 cursor-pointer"
                        style={{ backgroundColor: T.greenSoft, color: T.green }}
                      >
                        {yesCents}&cent; Yes
                      </button>
                      <button
                        onClick={() => handleTrade(saved.ticker, 'no')}
                        className="flex-1 py-2 rounded-lg text-center text-[12px] font-semibold transition-colors hover:brightness-110 cursor-pointer"
                        style={{ backgroundColor: T.redSoft, color: T.red }}
                      >
                        {noCents}&cent; No
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Your Positions — show active Talarion positions with sell buttons */}
      <AnimatePresence>
        {activePositions.length > 0 && (
          <motion.div
            key="positions"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: EASE_ENTRANCE }}
            className="mt-6"
          >
            <SectionDivider label="Your Positions" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
              {activePositions.map((pos) => {
                const entryPriceCents = Math.round(pos.avgEntryPrice * 100);
                const pnlValue = pos.unrealizedPnl ?? 0;
                const pnlColor = pnlValue >= 0 ? T.green : T.red;

                return (
                  <motion.div
                    key={pos.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: EASE_ENTRANCE }}
                    className="rounded-2xl p-4 flex flex-col gap-3"
                    style={{
                      backgroundColor: 'rgba(12, 14, 18, 0.75)',
                      border: `1px solid ${T.border}`,
                    }}
                  >
                    {/* Top: side badge + entry price */}
                    <div className="flex items-center justify-between">
                      <span
                        className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase"
                        style={{
                          backgroundColor: pos.side === 'YES' ? T.greenSoft : T.redSoft,
                          color: pos.side === 'YES' ? T.green : T.red,
                        }}
                      >
                        {pos.side}
                      </span>
                      <span className="text-[10px] font-medium" style={{ color: T.muted }}>
                        Entry {entryPriceCents}&cent;
                      </span>
                    </div>

                    {/* Title */}
                    <h4
                      className="font-semibold text-[13px] leading-[1.4] line-clamp-2"
                      style={{ color: T.text }}
                    >
                      {(pos.marketTitle && !pos.marketTitle.startsWith('Talarion: 0x') && !pos.marketTitle.startsWith('0x'))
                        ? pos.marketTitle
                        : 'AI Prediction Market'}
                    </h4>

                    {/* Stats */}
                    <div className="flex items-center justify-between text-[11px]" style={{ color: T.muted }}>
                      <span>
                        Shares <span style={{ color: T.textSecondary }}>{pos.tokenAmount.toFixed(1)}</span>
                      </span>
                      <span>
                        Cost <span style={{ color: T.textSecondary }}>${pos.costBasis.toFixed(2)}</span>
                      </span>
                      <span style={{ color: pnlColor, fontWeight: 600 }}>
                        {pnlValue >= 0 ? '+' : ''}{pnlValue.toFixed(2)}
                      </span>
                    </div>

                    {/* Sell button */}
                    <button
                      onClick={() => handleSellClick(pos)}
                      disabled={isSelling}
                      className="w-full py-2 rounded-xl text-[12px] font-semibold transition-all duration-150 active:scale-[0.97] outline-none focus-visible:ring-1"
                      style={{
                        backgroundColor: T.redSoft,
                        color: T.red,
                        border: `1px solid rgba(248, 113, 113, 0.15)`,
                        opacity: isSelling ? 0.5 : 1,
                      }}
                    >
                      {isSelling ? 'Exiting...' : 'Exit Position'}
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sell Confirmation Modal */}
      <AnimatePresence>
        {activeSell && (
          <motion.div
            key="sell-panel"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: EASE_ENTRANCE }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={handleCancelSell}
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
                <span className="text-[13px] font-semibold" style={{ color: T.red }}>
                  Sell {activeSell.position.side} Position
                </span>
                <button
                  onClick={handleCancelSell}
                  className="text-sm p-1 rounded-lg transition-colors hover:bg-white/5"
                  style={{ color: T.muted }}
                >
                  &times;
                </button>
              </div>

              {/* Market title */}
              <p className="text-[13px] font-medium mb-4 line-clamp-2" style={{ color: T.text }}>
                {(activeSell.position.marketTitle && !activeSell.position.marketTitle.startsWith('Talarion: 0x'))
                  ? activeSell.position.marketTitle
                  : 'AI Prediction Market'}
              </p>

              {/* Position info */}
              <div
                className="flex flex-col gap-2 px-3 py-2.5 rounded-lg mb-4"
                style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span style={{ color: T.muted }}>Shares</span>
                  <span style={{ color: T.text, fontVariantNumeric: 'tabular-nums' }}>
                    {activeSell.position.tokenAmount.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span style={{ color: T.muted }}>Avg entry</span>
                  <span style={{ color: T.text, fontVariantNumeric: 'tabular-nums' }}>
                    {Math.round(activeSell.position.avgEntryPrice * 100)}&cent;
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span style={{ color: T.muted }}>Cost basis</span>
                  <span style={{ color: T.text, fontVariantNumeric: 'tabular-nums' }}>
                    ${activeSell.position.costBasis.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Info */}
              <p className="text-[11px] mb-4" style={{ color: T.muted }}>
                This will cancel the trade on the Escrow contract and return your ${activeSell.position.costBasis.toFixed(2)} margin to your wallet.
              </p>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handleCancelSell}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-colors"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    color: T.textSecondary,
                    border: `1px solid ${T.border}`,
                  }}
                >
                  Keep Position
                </button>
                <button
                  onClick={handleConfirmSell}
                  disabled={isSelling}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-all active:scale-[0.97]"
                  style={{
                    backgroundColor: T.red,
                    color: '#fff',
                    opacity: isSelling ? 0.6 : 1,
                  }}
                >
                  {isSelling ? 'Exiting...' : 'Exit Position'}
                </button>
              </div>
            </motion.div>
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

              {/* Balance info */}
              {balance && (
                <div className="mb-4 flex items-center justify-between text-[11px]" style={{ color: T.muted }}>
                  <span>
                    Balance: <span style={{ color: T.text, fontVariantNumeric: 'tabular-nums' }}>
                      ${balance.nativeUsdc.toFixed(2)}
                    </span>
                    <span style={{ color: T.subtle }}> USDC</span>
                    {balance.bridgedUsdc > 0.01 && (
                      <span style={{ color: T.subtle }}> + ${balance.bridgedUsdc.toFixed(2)} USDC.e</span>
                    )}
                  </span>
                  {balance.escrowApproved && (
                    <span style={{ color: T.green, fontSize: '10px' }}>Approved</span>
                  )}
                </div>
              )}

              {/* Insufficient balance warning */}
              {balance && balance.totalUsdc < parseFloat(tradeAmount || '0') && parseFloat(tradeAmount || '0') > 0 && (
                <div
                  className="mb-3 px-3 py-2 rounded-lg text-[11px]"
                  style={{ backgroundColor: T.redSoft, color: T.red, border: '1px solid rgba(248,113,113,0.15)' }}
                >
                  Insufficient balance. Need ${parseFloat(tradeAmount).toFixed(2)} but have ${balance.totalUsdc.toFixed(2)} total.
                </div>
              )}

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
                  disabled={isTrading || (balance != null && balance.totalUsdc < parseFloat(tradeAmount || '0'))}
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

      </div>
      </div>

      {/* Placeholder text style for the input */}
      <style jsx>{`
        input::placeholder {
          color: ${T.subtle};
        }

        .shimmer-bg {
          background: linear-gradient(
            110deg,
            rgba(255, 255, 255, 0.02) 30%,
            rgba(255, 255, 255, 0.06) 50%,
            rgba(255, 255, 255, 0.02) 70%
          );
          background-size: 200% 100%;
          animation: shimmer 1.8s ease-in-out infinite;
        }

        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
    </div>
  );
}
