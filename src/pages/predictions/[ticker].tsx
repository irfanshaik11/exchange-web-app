import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  HiOutlineArrowLeft,
  HiOutlineClock,
  HiOutlineRefresh,
  HiOutlineExternalLink,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineLightningBolt,
  HiOutlineExclamation,
  HiOutlineFilter,
  HiOutlineChevronDown,
  HiOutlineX,
  HiOutlineSortAscending,
  HiOutlineSortDescending,
  HiOutlineClipboardList,
} from 'react-icons/hi';
import { BiWallet, BiCopy } from 'react-icons/bi';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { useDFlowMarket, useDFlowTrades, useDFlowOrderBook, useDFlowPriceHistory, useDFlowRealtimePrices, formatVolume, formatOpenInterest, getDFlowQuote, getDFlowSwap } from '~/hooks/useDFlowMarkets';
import { usePolymarketMarket, usePolymarketPriceHistory, usePolymarketMultiPriceHistory, usePolymarketComments, usePolymarketHolders, usePolymarketActivity, formatPolymarketVolume } from '~/hooks/usePolymarketMarkets';
import usePolymarketOrderBookWS from '~/hooks/usePolymarketOrderBook';
import type { ChartSeries } from '~/components/predictions/PolymarketChart';
import type { ChartSeriesData } from '~/components/predictions/TradingViewPredictionChart';
import type { PolymarketComment, PolymarketHolder, PolymarketActivity, PolymarketEvent, PolymarketMarket } from '~/hooks/usePolymarketMarkets';
import type { ExtendedPredictionMarket } from '~/hooks/useDFlowMarkets';
import { useUser } from '~/components/UserContext';
import { useTurnkeySigner } from '~/components/TurnkeySignerContext';
import PinGate from '~/components/predictions/PinGate';
import { InsightPanel } from '~/components/insights/InsightPanel';
import { showEnhancedToast, updateEnhancedToast } from '~/utils/enhancedToast';
import { createPolymarketTradeToast, showPolymarketToast } from '~/utils/tradeToast';
import { SourceBadge, PolygonWalletCard } from '~/components/predictions';
import {
  getPolymarketQuote,
  getPolymarketBalance,
  executePolymarketOrder,
  checkPolymarketGeoblock,
  approvePolymarketSpending,
  getPolymarketAllowance,
  getUserPredictionPositions,
  getPolymarketTokenBalance,
  getPolymarketOpenOrders,
  cancelPolymarketOrder,
  warmPolymarketCaches,
  type PolymarketQuote,
  type PolymarketBalance,
  type PolymarketGeoblock,
} from '~/utils/api';

// Lazy load heavy components
const PredictionPositions = dynamic(() => import('~/components/predictions/PredictionPositions'), { ssr: false });
const UnifiedPortfolio = dynamic(() => import('~/components/predictions/UnifiedPortfolio'), { ssr: false });
const TradingViewPredictionChart = dynamic(() => import('~/components/predictions/TradingViewPredictionChart'), { ssr: false });
const PolymarketChart = dynamic(() => import('~/components/predictions/PolymarketChart'), { ssr: false });
const PolymarketOrderBook = dynamic(() => import('~/components/predictions/PolymarketOrderBook'), { ssr: false });

// USDC mint on Solana
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/* ---------- AXIOM palette (matching token trade page) ---------- */
/* Palette aligned with homepage redesign (Polymarket-inspired) */
const AX = {
  bg: "#131517",
  surface: "#1c1f24",
  surface2: "#181b20",
  border: "#2a2e35",
  text: "#ffffff",
  muted: "#7a8090",
  mint: "#3b82f6",
  mintHover: "#2563eb",
  sell: "#EF4444",
  // Semantic trading colors — teal/red
  green: "#10b981",
  greenBg: "rgba(16, 185, 129, 0.10)",
  greenBorder: "rgba(16, 185, 129, 0.25)",
  red: "#EF4444",
  redBg: "rgba(239, 68, 68, 0.10)",
  redBorder: "rgba(239, 68, 68, 0.25)",
  yellow: "#FBBF24",
  purple: "#818CF8",
  cyan: "#22D3EE",
};

// Prediction-specific tabs
const DFLOW_TABS = ['Trades', 'Positions'];
const POLYMARKET_TABS = ['Outcomes', 'Holders', 'Activity', 'Orders', 'Positions', 'Comments'];

// Helpers
const copyToClipboard = (text: string) => navigator.clipboard.writeText(text);

// Generate consistent avatar color based on string (name/address)
const AVATAR_COLORS = [
  '#F87171', '#FB923C', '#FBBF24', '#A3E635', '#4ADE80',
  '#2DD4BF', '#22D3EE', '#60A5FA', '#818CF8', '#A78BFA',
  '#E879F9', '#FB7185', '#F472B6', '#C084FC',
];
const getAvatarColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

// Text Search Filter - for name/text columns only
const SearchFilter: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-0.5 rounded hover:bg-white/10 transition-colors"
        title="Search"
      >
        <HiOutlineFilter className="w-3 h-3" style={{ color: value ? AX.mint : AX.muted }} />
      </button>
      {isOpen && (
        <div
          className="absolute top-full left-0 mt-1 z-50 rounded-lg shadow-lg p-2"
          style={{ backgroundColor: AX.surface, border: `1px solid ${AX.border}` }}
        >
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || 'Search...'}
            className="w-28 px-2 py-1.5 text-xs rounded"
            style={{ backgroundColor: AX.bg, color: AX.text, border: `1px solid ${AX.border}` }}
            autoFocus
          />
          {value && (
            <button
              onClick={() => { onChange(''); setIsOpen(false); }}
              className="w-full mt-1 px-2 py-1 text-[10px] rounded hover:bg-white/10 flex items-center justify-center gap-1"
              style={{ color: AX.muted }}
            >
              <HiOutlineX className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// Sort Toggle - for numeric columns only (no filter, just sort)
const SortToggle: React.FC<{
  direction: 'asc' | 'desc';
  onToggle: () => void;
}> = ({ direction, onToggle }) => (
  <button
    onClick={onToggle}
    className="p-0.5 rounded hover:bg-white/10 transition-colors"
    title={direction === 'desc' ? 'Sort low → high' : 'Sort high → low'}
  >
    {direction === 'asc' ? (
      <HiOutlineSortAscending className="w-3 h-3" style={{ color: AX.mint }} />
    ) : (
      <HiOutlineSortDescending className="w-3 h-3" style={{ color: AX.mint }} />
    )}
  </button>
);

// Select Filter - for categorical columns (type, side)
const SelectFilter: React.FC<{
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}> = ({ options, value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasFilter = value !== '' && value !== 'all';

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-0.5 rounded hover:bg-white/10 transition-colors"
        title="Filter"
      >
        <HiOutlineChevronDown className="w-3 h-3" style={{ color: hasFilter ? AX.mint : AX.muted }} />
      </button>
      {isOpen && (
        <div
          className="absolute top-full right-0 mt-1 z-50 min-w-[70px] rounded-lg shadow-lg py-1"
          style={{ backgroundColor: AX.surface, border: `1px solid ${AX.border}` }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setIsOpen(false); }}
              className="w-full px-3 py-1.5 text-left text-xs hover:bg-white/10 transition-colors"
              style={{ color: value === opt.value ? AX.mint : AX.text }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const formatTimeRemaining = (closesAt: string): string => {
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0) return "Closed";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const formatUSDC = (amount: number): string => {
  return `${amount.toFixed(2)} USDC`;
};

// Market Image with fallback
const MarketImage: React.FC<{ src?: string; alt: string; size?: 'sm' | 'md' | 'lg' }> = ({ src, alt, size = 'md' }) => {
  const [hasError, setHasError] = useState(false);
  const sizeClasses = { sm: 'w-8 h-8', md: 'w-10 h-10', lg: 'w-14 h-14' };

  if (!src || hasError) {
    return (
      <div className={`${sizeClasses[size]} rounded-lg flex items-center justify-center`} style={{ backgroundColor: AX.surface }}>
        <span className="text-sm font-bold" style={{ color: AX.mint }}>{alt.charAt(0)}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`${sizeClasses[size]} rounded-lg object-cover`}
      onError={() => setHasError(true)}
    />
  );
};

// Prediction Header Component — redesigned cockpit style with glassmorphism
const PredictionHeader: React.FC<{
  market: ExtendedPredictionMarket;
  yesPrice: number;
  noPrice: number;
  source?: 'dflow' | 'polymarket';
  isMultiOutcome?: boolean;
  endDate?: string;
  onAiOpen?: () => void;
}> = ({ market, yesPrice, noPrice, source, isMultiOutcome, endDate, onAiOpen }) => {
  const isActive = market.status === 'active';
  const isResolved = market.status === 'resolved';

  const formattedEndDate = endDate
    ? new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div
      className="px-5 py-4"
      style={{
        background: 'linear-gradient(180deg, rgba(28, 31, 36, 0.95) 0%, rgba(19, 21, 23, 0.85) 100%)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${AX.border}`,
      }}
    >
      {/* Top row: back + category + source */}
      <div className="flex items-center gap-3 mb-3">
        <Link
          href="/predictions"
          className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-white/[0.06]"
          style={{ color: AX.muted }}
        >
          <HiOutlineArrowLeft className="w-4 h-4" />
        </Link>
        {source && (
          <span
            className="text-[10px] px-2 py-1 rounded-md font-semibold uppercase tracking-wider"
            style={{
              backgroundColor: source === 'polymarket' ? `${AX.purple}15` : `${AX.green}15`,
              color: source === 'polymarket' ? AX.purple : AX.green,
              border: `1px solid ${source === 'polymarket' ? AX.purple : AX.green}25`,
            }}
          >
            {source === 'polymarket' ? 'Polymarket' : 'dFlow'}
          </span>
        )}
        {isResolved && (
          <span
            className="text-[10px] px-2 py-1 rounded-md font-bold uppercase tracking-wider"
            style={{
              backgroundColor: market.result === 'yes' ? AX.greenBg : AX.redBg,
              color: market.result === 'yes' ? AX.green : AX.red,
            }}
          >
            Resolved {market.result?.toUpperCase()}
          </span>
        )}
      </div>

      {/* Title row */}
      <div className="flex items-start gap-3">
        <MarketImage src={market.imageUrl} alt={market.title} size="lg" />
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold leading-snug mb-1" style={{ color: AX.text }}>
            {market.title}
          </h1>
          <div className="flex items-center gap-3 flex-wrap">
            {!isResolved && formattedEndDate && (
              <span className="flex items-center gap-1 text-xs" style={{ color: AX.muted }}>
                <HiOutlineClock className="w-3.5 h-3.5" />
                Closes {formattedEndDate}
              </span>
            )}
            {!isResolved && !formattedEndDate && market.closesAt && (
              <span className="flex items-center gap-1 text-xs" style={{ color: AX.muted }}>
                <HiOutlineClock className="w-3.5 h-3.5" />
                {formatTimeRemaining(market.closesAt)}
              </span>
            )}
            {market.subtitle && (
              <span className="text-xs truncate max-w-[280px]" style={{ color: AX.muted }}>
                {market.subtitle}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Prediction Tabs Component — clean horizontal tabs with subtle indicator
const VISIBLE_TABS = ['Outcomes', 'Activity', 'Holders', 'Comments'];
const MORE_TABS = ['Orders', 'Positions'];

const PredictionTabs: React.FC<{
  tabs: string[];
  selectedTab: string;
  setSelectedTab: (tab: string) => void;
}> = ({ tabs, selectedTab, setSelectedTab }) => {
  const [moreOpen, setMoreOpen] = React.useState(false);
  const moreRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const visibleTabs = tabs.filter(t => VISIBLE_TABS.includes(t) || !MORE_TABS.includes(t));
  const hiddenTabs = tabs.filter(t => MORE_TABS.includes(t));
  const isHiddenSelected = hiddenTabs.includes(selectedTab);

  return (
    <div
      className="flex items-center gap-1 py-1"
      style={{ borderBottom: `1px solid ${AX.border}` }}
    >
      {visibleTabs.map(tab => (
        <button
          key={tab}
          className="relative px-3 py-2 text-[13px] font-medium transition-colors rounded-md"
          style={{
            color: selectedTab === tab ? AX.text : AX.muted,
            backgroundColor: selectedTab === tab ? 'rgba(255,255,255,0.05)' : 'transparent',
          }}
          onClick={() => setSelectedTab(tab)}
          onMouseEnter={(e) => { if (selectedTab !== tab) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'; }}
          onMouseLeave={(e) => { if (selectedTab !== tab) e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          {tab}
          {selectedTab === tab && (
            <div
              className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full"
              style={{ backgroundColor: AX.mint }}
            />
          )}
        </button>
      ))}
      {hiddenTabs.length > 0 && (
        <div className="relative" ref={moreRef}>
          <button
            onClick={() => setMoreOpen(o => !o)}
            className="relative px-3 py-2 text-[13px] font-medium transition-colors rounded-md flex items-center gap-1"
            style={{
              color: isHiddenSelected ? AX.text : AX.muted,
              backgroundColor: isHiddenSelected ? 'rgba(255,255,255,0.05)' : 'transparent',
            }}
          >
            {isHiddenSelected ? selectedTab : 'More'}
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform duration-200 ${moreOpen ? 'rotate-180' : ''}`}>
              <path d="M4 6L1 2.5H7L4 6Z" />
            </svg>
            {isHiddenSelected && (
              <div
                className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full"
                style={{ backgroundColor: AX.mint }}
              />
            )}
          </button>
          {moreOpen && (
            <div
              className="absolute top-full left-0 mt-1 z-50 min-w-[120px] rounded-xl shadow-2xl py-1.5"
              style={{
                backgroundColor: AX.surface,
                border: `1px solid ${AX.border}`,
                backdropFilter: 'blur(12px)',
              }}
            >
              {hiddenTabs.map(tab => (
                <button
                  key={tab}
                  className="w-full text-left px-4 py-2 text-[13px] font-medium transition-colors hover:bg-white/5"
                  style={{ color: selectedTab === tab ? AX.text : AX.muted }}
                  onClick={() => { setSelectedTab(tab); setMoreOpen(false); }}
                >
                  {tab}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Comments Component for Polymarket - with inline filters
const CommentsSection: React.FC<{ comments: PolymarketComment[]; isLoading: boolean; eventSlug?: string }> = React.memo(({ comments, isLoading, eventSlug }) => {
  const [authorFilter, setAuthorFilter] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Hooks MUST be called before any early returns (Rules of Hooks)
  const filteredComments = useMemo(() => (comments || [])
    .filter(comment => {
      if (!authorFilter) return true;
      const author = (comment.profile?.name || comment.profile?.pseudonym || comment.userAddress || '').toLowerCase();
      return author.includes(authorFilter.toLowerCase());
    })
    .sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return sortDir === 'desc' ? timeB - timeA : timeA - timeB;
    }), [comments, authorFilter, sortDir]);

  const hasActiveFilters = authorFilter !== '';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <HiOutlineRefresh className="w-5 h-5 animate-spin" style={{ color: AX.muted }} />
      </div>
    );
  }

  if (!comments || comments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <p className="text-sm mb-3" style={{ color: AX.muted }}>Comments not available via API</p>
        {eventSlug && (
          <a
            href={`https://polymarket.com/event/${eventSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors hover:opacity-80"
            style={{ backgroundColor: AX.purple, color: '#fff' }}
          >
            <HiOutlineExternalLink className="w-4 h-4" />
            View comments on Polymarket
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with filters */}
      <div className="flex-shrink-0 flex items-center gap-4 px-3 py-2 text-[10px] border-b" style={{ borderColor: AX.border, color: AX.muted }}>
        <div className="flex-1">
          <span className="inline-flex items-center gap-1">
            Author
            <SearchFilter value={authorFilter} onChange={setAuthorFilter} placeholder="Search..." />
          </span>
        </div>
        <div className="w-16 text-right">
          <span className="inline-flex items-center gap-1">
            Date
            <SortToggle direction={sortDir} onToggle={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')} />
          </span>
        </div>
      </div>

      {/* Results count if filters active */}
      {hasActiveFilters && (
        <div className="flex-shrink-0 px-3 py-1.5 text-[10px] flex items-center justify-between" style={{ backgroundColor: AX.bg }}>
          <span style={{ color: AX.muted }}>{filteredComments.length} results</span>
          <button
            onClick={() => setAuthorFilter('')}
            className="flex items-center gap-1 hover:underline"
            style={{ color: AX.mint }}
          >
            <HiOutlineX className="w-3 h-3" /> Clear
          </button>
        </div>
      )}

      {/* Scrollable comments */}
      <div className="flex-1 overflow-y-auto p-3 pb-20 space-y-2">
        {filteredComments.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm" style={{ color: AX.muted }}>No matching comments</p>
          </div>
        ) : (
          filteredComments.map((comment) => (
            <div
              key={comment.id}
              className="p-3 rounded-lg"
              style={{ backgroundColor: AX.surface }}
            >
              <div className="flex items-center gap-2 mb-2">
                {comment.profile?.profileImage ? (
                  <img src={comment.profile.profileImage} alt="" className="w-6 h-6 rounded-full" />
                ) : (
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: getAvatarColor(comment.userAddress || 'A'), color: '#fff' }}
                  >
                    {(comment.profile?.name || comment.profile?.pseudonym || 'A').charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-xs font-medium" style={{ color: AX.text }}>
                  {comment.profile?.name || comment.profile?.pseudonym || comment.userAddress?.slice(0, 8) || 'Anonymous'}
                </span>
                <span className="text-[10px]" style={{ color: AX.muted }}>
                  {new Date(comment.createdAt).toLocaleDateString()}
                </span>
                {comment.reactionCount > 0 && (
                  <span className="text-[10px] ml-auto" style={{ color: AX.muted }}>
                    👍 {comment.reactionCount}
                  </span>
                )}
              </div>
              <p className="text-xs whitespace-pre-wrap leading-relaxed" style={{ color: AX.text }}>{comment.body}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
});

// Holders Component for Polymarket - with YES/NO tabs and column filters
const HoldersSection: React.FC<{ holders: PolymarketHolder[]; isLoading: boolean }> = React.memo(({ holders, isLoading }) => {
  const [selectedOutcome, setSelectedOutcome] = useState<'yes' | 'no'>('yes');
  const [nameFilter, setNameFilter] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const formatAmount = (amount: number): string => {
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
    return amount.toFixed(0);
  };

  // Hooks MUST be called before any early returns (Rules of Hooks)
  const { yesHolders, noHolders } = useMemo(() => ({
    yesHolders: (holders || []).filter(h => h.outcome === 'yes'),
    noHolders: (holders || []).filter(h => h.outcome === 'no'),
  }), [holders]);

  const displayHolders = useMemo(() => {
    const list = selectedOutcome === 'yes' ? yesHolders : noHolders;
    let filtered = list;
    if (nameFilter) {
      const q = nameFilter.toLowerCase();
      filtered = list.filter(h =>
        (h.name || h.pseudonym || h.proxyWallet || '').toLowerCase().includes(q)
      );
    }
    return filtered.sort((a, b) => sortDir === 'desc' ? b.amount - a.amount : a.amount - b.amount);
  }, [yesHolders, noHolders, selectedOutcome, nameFilter, sortDir]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <HiOutlineRefresh className="w-5 h-5 animate-spin" style={{ color: AX.muted }} />
      </div>
    );
  }

  if (!holders || holders.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm" style={{ color: AX.muted }}>No holder data available</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* YES/NO Toggle - compact */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: AX.border }}>
        {(['yes', 'no'] as const).map((side) => (
          <button
            key={side}
            onClick={() => setSelectedOutcome(side)}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all"
            style={{
              backgroundColor: selectedOutcome === side ? (side === 'yes' ? AX.greenBg : AX.redBg) : 'transparent',
              color: selectedOutcome === side ? (side === 'yes' ? AX.green : AX.red) : AX.muted,
            }}
          >
            {side === 'yes' ? <HiOutlineCheckCircle className="w-3 h-3" /> : <HiOutlineXCircle className="w-3 h-3" />}
            {side.toUpperCase()} ({(side === 'yes' ? yesHolders : noHolders).length})
          </button>
        ))}
        {nameFilter && (
          <span className="text-[10px] ml-auto" style={{ color: AX.muted }}>
            {displayHolders.length} results
          </span>
        )}
      </div>

      {/* Scrollable table */}
      <div className="flex-1 overflow-y-auto pb-20">
        {displayHolders.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm" style={{ color: AX.muted }}>
              {nameFilter ? 'No matches found' : `No ${selectedOutcome.toUpperCase()} holders`}
            </p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0" style={{ backgroundColor: AX.bg }}>
              <tr style={{ borderBottom: `1px solid ${AX.border}` }}>
                <th className="text-left py-2 px-3 font-medium w-8" style={{ color: AX.muted }}>#</th>
                <th className="text-left py-2 px-3 font-medium" style={{ color: AX.muted }}>
                  <span className="inline-flex items-center gap-1">
                    Holder
                    <SearchFilter value={nameFilter} onChange={setNameFilter} placeholder="Search..." />
                  </span>
                </th>
                <th className="text-right py-2 px-3 font-medium" style={{ color: AX.muted }}>
                  <span className="inline-flex items-center gap-1">
                    Shares
                    <SortToggle direction={sortDir} onToggle={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')} />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {displayHolders.map((holder, idx) => (
                <tr key={`${holder.proxyWallet}-${idx}`} style={{ borderBottom: `1px solid ${AX.border}` }}>
                  <td className="py-2 px-3" style={{ color: AX.muted }}>{idx + 1}</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      {holder.profileImage ? (
                        <img src={holder.profileImage} alt="" className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
                          style={{
                            backgroundColor: getAvatarColor(holder.proxyWallet || holder.name || 'A'),
                            color: '#fff',
                          }}
                        >
                          {(holder.name || holder.pseudonym || 'A').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span style={{ color: AX.text }}>
                        {holder.name || holder.pseudonym || `${holder.proxyWallet.slice(0, 6)}...`}
                      </span>
                      {holder.proxyWallet && (
                        <a
                          href={`https://polygonscan.com/address/${holder.proxyWallet}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                          title="View on Polygonscan"
                        >
                          <img
                            src="https://polygonscan.com/assets/poly/images/svg/logos/chain-dim.svg?v=26.1.4.2"
                            alt="Polygonscan"
                            className="w-3.5 h-3.5"
                          />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-right" style={{ color: selectedOutcome === 'yes' ? AX.green : AX.red }}>
                    {formatAmount(holder.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
});

// Activity Component for Polymarket - table layout matching HoldersSection
const ActivitySection: React.FC<{ activities: PolymarketActivity[]; isLoading: boolean }> = React.memo(({ activities, isLoading }) => {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [nameFilter, setNameFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc'); // newest first

  // Hooks MUST be called before any early returns (Rules of Hooks)
  const filteredActivities = useMemo(() => {
    const parseTs = (ts: string | number) => { let v = Number(ts); if (v > 0 && v < 1e12) v *= 1000; return v || 0; };
    return activities
      .filter(activity => {
        if (typeFilter !== 'all') {
          const side = activity.side?.toLowerCase() || '';
          const type = activity.type?.toLowerCase() || '';
          if (typeFilter === 'buy' && !(side === 'buy' || type === 'buy')) return false;
          if (typeFilter === 'sell' && !(side === 'sell' || type === 'sell')) return false;
        }
        if (nameFilter) {
          const name = (activity.name || activity.pseudonym || activity.proxyWallet || '').toLowerCase();
          if (!name.includes(nameFilter.toLowerCase())) return false;
        }
        if (outcomeFilter !== 'all') {
          if (activity.outcome?.toLowerCase() !== outcomeFilter) return false;
        }
        return true;
      })
      .sort((a, b) => sortDir === 'desc' ? parseTs(b.timestamp) - parseTs(a.timestamp) : parseTs(a.timestamp) - parseTs(b.timestamp));
  }, [activities, typeFilter, nameFilter, outcomeFilter, sortDir]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <HiOutlineRefresh className="w-5 h-5 animate-spin" style={{ color: AX.muted }} />
      </div>
    );
  }

  if (!activities || activities.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm" style={{ color: AX.muted }}>No recent activity</p>
      </div>
    );
  }

  const formatAmount = (amount: number | undefined): string => {
    if (!amount) return '-';
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
    if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`;
    return `$${amount.toFixed(2)}`;
  };

  const formatTime = (timestamp: string | number): string => {
    let ms = typeof timestamp === 'number' ? timestamp : Number(timestamp);
    if (ms > 0 && ms < 1e12) ms *= 1000;
    const date = new Date(ms);
    if (isNaN(date.getTime()) || date.getFullYear() < 2000) return '';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const hasActiveFilters = typeFilter !== 'all' || nameFilter || outcomeFilter !== 'all';

  return (
    <div className="h-full flex flex-col">
      {/* Filter bar - matching holders YES/NO toggle style */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: AX.border }}>
        {(['all', 'buy', 'sell'] as const).map((side) => (
          <button
            key={side}
            onClick={() => setTypeFilter(side)}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all"
            style={{
              backgroundColor: typeFilter === side
                ? (side === 'buy' ? AX.greenBg : side === 'sell' ? AX.redBg : `${AX.muted}20`)
                : 'transparent',
              color: typeFilter === side
                ? (side === 'buy' ? AX.green : side === 'sell' ? AX.red : AX.text)
                : AX.muted,
            }}
          >
            {side === 'all' ? 'ALL' : side.toUpperCase()} ({side === 'all' ? activities.length : activities.filter(a => (a.side?.toLowerCase() || a.type?.toLowerCase()) === side).length})
          </button>
        ))}
        {hasActiveFilters && (
          <button
            onClick={() => { setTypeFilter('all'); setNameFilter(''); setOutcomeFilter('all'); }}
            className="ml-auto flex items-center gap-1 text-[10px] hover:underline"
            style={{ color: AX.mint }}
          >
            <HiOutlineX className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Scrollable table */}
      <div className="flex-1 overflow-y-auto pb-20">
        {filteredActivities.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm" style={{ color: AX.muted }}>
              {hasActiveFilters ? 'No matching activities' : 'No recent activity'}
            </p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0" style={{ backgroundColor: AX.bg }}>
              <tr style={{ borderBottom: `1px solid ${AX.border}` }}>
                <th className="text-left py-2 px-3 font-medium w-8" style={{ color: AX.muted }}>#</th>
                <th className="text-left py-2 px-3 font-medium" style={{ color: AX.muted }}>
                  <span className="inline-flex items-center gap-1">
                    Trader
                    <SearchFilter value={nameFilter} onChange={setNameFilter} placeholder="Search..." />
                  </span>
                </th>
                <th className="text-center py-2 px-3 font-medium" style={{ color: AX.muted }}>
                  <span className="inline-flex items-center gap-0.5">
                    Side
                    <SelectFilter
                      options={[
                        { value: 'all', label: 'All' },
                        { value: 'yes', label: 'YES' },
                        { value: 'no', label: 'NO' },
                      ]}
                      value={outcomeFilter}
                      onChange={setOutcomeFilter}
                    />
                  </span>
                </th>
                <th className="text-right py-2 px-3 font-medium" style={{ color: AX.muted }}>Amount</th>
                <th className="text-right py-2 px-3 font-medium" style={{ color: AX.muted }}>
                  <span className="inline-flex items-center gap-1">
                    Time
                    <SortToggle direction={sortDir} onToggle={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')} />
                  </span>
                </th>
                <th className="w-6"></th>
              </tr>
            </thead>
            <tbody>
              {filteredActivities.map((activity, idx) => {
                const side = activity.side?.toLowerCase() || activity.type?.toLowerCase() || '';
                const isBuy = side === 'buy';
                return (
                  <tr key={activity.id || idx} style={{ borderBottom: `1px solid ${AX.border}` }}>
                    <td className="py-2 px-3" style={{ color: AX.muted }}>{idx + 1}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        {activity.profileImage ? (
                          <img src={activity.profileImage} alt="" className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
                            style={{
                              backgroundColor: getAvatarColor(activity.proxyWallet || activity.name || 'A'),
                              color: '#fff',
                            }}
                          >
                            {(activity.name || activity.pseudonym || 'A').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="block truncate" style={{ color: AX.text }}>
                            {activity.name || activity.pseudonym || activity.proxyWallet?.slice(0, 8) || 'Anon'}
                          </span>
                          <span className="text-[10px]" style={{ color: AX.muted }}>
                            {activity.size?.toLocaleString() || '-'} @ {activity.price ? `${(activity.price * 100).toFixed(1)}¢` : '-'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{
                          backgroundColor: isBuy ? AX.greenBg : AX.redBg,
                          color: isBuy ? AX.green : AX.red,
                        }}
                      >
                        {isBuy ? 'BUY' : 'SELL'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right" style={{ color: AX.text }}>
                      {formatAmount(activity.amount)}
                    </td>
                    <td className="py-2 px-3 text-right" style={{ color: AX.muted }}>
                      {formatTime(activity.timestamp)}
                    </td>
                    <td className="py-1 px-1">
                      {(activity.transactionHash || activity.proxyWallet) && (
                        <a
                          href={`https://polygonscan.com/${activity.transactionHash ? `tx/${activity.transactionHash}` : `address/${activity.proxyWallet}`}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="opacity-50 hover:opacity-100 transition-opacity"
                          title={activity.transactionHash ? 'View tx on Polygonscan' : 'View on Polygonscan'}
                        >
                          <img
                            src="https://polygonscan.com/assets/poly/images/svg/logos/chain-dim.svg?v=26.1.4.2"
                            alt="Polygonscan"
                            className="w-3.5 h-3.5"
                          />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
});

// Outcomes Component for Polymarket multi-outcome markets - with inline column filters
const OutcomesSection: React.FC<{
  event: PolymarketEvent | null;
  isLoading: boolean;
  onSelectOutcome?: (marketId: string, side: 'yes' | 'no') => void;
  selectedOutcomeId?: string | null;
}> = React.memo(({ event, isLoading, onSelectOutcome, selectedOutcomeId }) => {
  const [nameFilter, setNameFilter] = useState('');
  const [chanceSort, setChanceSort] = useState<'asc' | 'desc'>('desc');
  const [volSort, setVolSort] = useState<'asc' | 'desc' | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  // Hooks MUST be called before any early returns (Rules of Hooks)
  // Pre-parse JSON once per market (avoids 4x JSON.parse per market per render)
  type ParsedMarket = PolymarketMarket & { _prices: number[]; _pricesValid: boolean };
  const parsedMarkets: ParsedMarket[] = useMemo(() => {
    if (!event?.markets) return [];
    return event.markets.map(m => {
      let prices = [0.5, 0.5];
      try { prices = JSON.parse(m.outcomePrices).map(Number); } catch {}
      const sum = (prices[0] || 0) + (prices[1] || 0);
      const valid = sum > 0.9 && sum < 1.1 && prices[0] > 0 && prices[1] > 0;
      return { ...m, _prices: prices, _pricesValid: valid };
    });
  }, [event]);

  // Predicate functions use pre-parsed data (no JSON.parse)
  const isMarketFullyResolved = (market: ParsedMarket): boolean => {
    if (market.closed && !market.active) return true;
    if (market.resolved && market.acceptingOrders === false && market.closed) return true;
    if (!market._pricesValid && !market.active) return true;
    if (!market._pricesValid && market.closed) return true;
    if (!market._pricesValid) return true;
    return false;
  };

  const isMarketInReview = (market: ParsedMarket): boolean => {
    if (market.resolved && !market.closed) return true;
    if (market.resolved && market.active) return true;
    if (market.acceptingOrders === false && !market.closed && !market.resolved && market.active) return true;
    return false;
  };

  // Format helpers
  const formatPercent = (price: number): string => {
    const pct = price * 100;
    if (pct < 1 && pct > 0) return '<1%';
    if (pct === 0) return '0%';
    return `${Math.round(pct)}%`;
  };

  const formatCents = (price: number): string => {
    const cents = price * 100;
    if (cents < 0.1) return '0.0';
    if (cents >= 99.9) return '100';
    return cents.toFixed(1);
  };

  const formatVol = (vol: number | string | undefined): string => {
    const v = typeof vol === 'string' ? parseFloat(vol) : vol;
    if (!v) return '$0';
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  };

  // Separate active, in-review, and resolved markets (memoized with pre-parsed data)
  const { activeMarkets, inReviewMarkets, resolvedMarkets, sortedActiveMarkets, hasActiveFilters } = useMemo(() => {
    const allFiltered = parsedMarkets.filter(market => {
      // Filter out placeholder outcomes (Team XX, Person XX, Other, zero volume)
      const label = (market.groupItemTitle || market.question || '');
      if (/^Team [A-Z]+$/i.test(label)) return false;
      if (/^Person [A-Z]+$/i.test(label)) return false;
      if (label === 'Other') return false;
      if (parseFloat(market.volume || '0') === 0 && market._prices[0] === 0.5) return false;
      // Apply user search filter
      if (nameFilter && !label.toLowerCase().includes(nameFilter.toLowerCase())) return false;
      return true;
    });

    const active = allFiltered.filter(m => !isMarketFullyResolved(m) && !isMarketInReview(m));
    const inReview = allFiltered.filter(m => isMarketInReview(m));
    const resolved = allFiltered.filter(m => isMarketFullyResolved(m) && !isMarketInReview(m));

    const sorted = [...active].sort((a, b) => {
      if (volSort) {
        const volA = parseFloat(a.volume || '0');
        const volB = parseFloat(b.volume || '0');
        return volSort === 'desc' ? volB - volA : volA - volB;
      }
      return chanceSort === 'desc' ? (b._prices[0] || 0) - (a._prices[0] || 0) : (a._prices[0] || 0) - (b._prices[0] || 0);
    });

    return { activeMarkets: active, inReviewMarkets: inReview, resolvedMarkets: resolved, sortedActiveMarkets: sorted, hasActiveFilters: nameFilter !== '' };
  }, [parsedMarkets, nameFilter, volSort, chanceSort]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <HiOutlineRefresh className="w-5 h-5 animate-spin" style={{ color: AX.muted }} />
      </div>
    );
  }

  if (!event || !event.markets || event.markets.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm" style={{ color: AX.muted }}>No outcome data available</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header row with column filters */}
      <div className="flex-shrink-0 flex items-center px-3 py-2.5 text-[10px] font-medium uppercase tracking-wider border-b" style={{ borderColor: AX.border, color: AX.muted }}>
        <div className="flex-1">
          <span className="inline-flex items-center gap-1">
            Outcome
            <SearchFilter value={nameFilter} onChange={setNameFilter} placeholder="Search..." />
          </span>
        </div>
        <div className="w-20 text-center flex-shrink-0">
          <span className="inline-flex items-center gap-0.5">
            Chance
            <button
              onClick={() => { setVolSort(null); setChanceSort(d => d === 'desc' ? 'asc' : 'desc'); }}
              className="p-0.5 rounded hover:bg-white/10 transition-colors"
              title={chanceSort === 'desc' ? 'Sort low → high' : 'Sort high → low'}
            >
              {!volSort ? (
                chanceSort === 'asc' ? (
                  <HiOutlineSortAscending className="w-3 h-3" style={{ color: AX.mint }} />
                ) : (
                  <HiOutlineSortDescending className="w-3 h-3" style={{ color: AX.mint }} />
                )
              ) : (
                <HiOutlineSortDescending className="w-3 h-3" style={{ color: AX.muted }} />
              )}
            </button>
            <span className="mx-2 opacity-40">|</span>
            Volume
            <button
              onClick={() => setVolSort(d => d === 'desc' ? 'asc' : d === 'asc' ? null : 'desc')}
              className="p-0.5 rounded hover:bg-white/10 transition-colors"
              title={volSort === 'desc' ? 'Sort low → high' : volSort === 'asc' ? 'Clear sort' : 'Sort high → low'}
            >
              {volSort === 'asc' ? (
                <HiOutlineSortAscending className="w-3 h-3" style={{ color: AX.mint }} />
              ) : volSort === 'desc' ? (
                <HiOutlineSortDescending className="w-3 h-3" style={{ color: AX.mint }} />
              ) : (
                <HiOutlineSortDescending className="w-3 h-3" style={{ color: AX.muted }} />
              )}
            </button>
          </span>
        </div>
        <div className="flex-1 text-right pr-2">Trade</div>
      </div>

      {/* Results count if filters active */}
      {hasActiveFilters && (
        <div className="flex-shrink-0 px-3 py-1.5 text-[10px] flex items-center justify-between" style={{ backgroundColor: AX.bg }}>
          <span style={{ color: AX.muted }}>
            {activeMarkets.length} active{inReviewMarkets.length > 0 ? `, ${inReviewMarkets.length} in review` : ''}{resolvedMarkets.length > 0 ? `, ${resolvedMarkets.length} resolved` : ''} of {event.markets.length}
          </span>
          <button
            onClick={() => setNameFilter('')}
            className="flex items-center gap-1 hover:underline"
            style={{ color: AX.mint }}
          >
            <HiOutlineX className="w-3 h-3" /> Clear
          </button>
        </div>
      )}

      {/* Scrollable outcome rows */}
      <div className="flex-1 overflow-y-auto px-2 pb-20 divide-y divide-white/[0.06]">
        {sortedActiveMarkets.length === 0 && inReviewMarkets.length === 0 && resolvedMarkets.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm" style={{ color: AX.muted }}>No matching outcomes</p>
          </div>
        ) : (
          <>
            {/* Active outcomes */}
            {sortedActiveMarkets.map((market) => {
              const realPrices = market._pricesValid;
              const prices = market._prices;
              const yesPrice = prices[0] || 0.5;
              const noPrice = prices[1] || 0.5;

              const isSelected = selectedOutcomeId === market.id;
              return (
                <div
                  key={market.id}
                  onClick={() => onSelectOutcome?.(market.id, 'yes')}
                  className="flex items-center px-3 py-3.5 transition-colors hover:bg-white/[0.02] cursor-pointer"
                  style={{
                    backgroundColor: isSelected ? '#151821' : 'transparent',
                  }}
                >
                  {/* Outcome image and name */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {(market.image || market.icon) ? (
                      <img
                        src={market.image || market.icon}
                        alt={market.groupItemTitle || 'Outcome'}
                        className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold"
                        style={{ backgroundColor: getAvatarColor(market.groupItemTitle || market.id || 'O'), color: '#fff' }}
                      >
                        {(market.groupItemTitle || market.question || 'O').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-[15px] leading-tight truncate" style={{ color: AX.text }}>
                        {market.groupItemTitle || market.question || 'Outcome'}
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: AX.muted }}>
                        {formatVol(market.volume)} Vol.
                      </div>
                    </div>
                  </div>

                  {/* Percentage chance — centered */}
                  <div className="w-20 text-center flex-shrink-0">
                    <span className="text-[22px] font-bold" style={{ color: AX.text, fontVariantNumeric: 'tabular-nums' }}>
                      {realPrices ? formatPercent(yesPrice) : '--'}
                    </span>
                  </div>

                  {/* Yes / No buttons */}
                  <div className="flex gap-2.5 flex-1 justify-end">
                    <button
                      onClick={(e) => { e.stopPropagation(); onSelectOutcome?.(market.id, 'yes'); }}
                      className="w-32 py-2.5 rounded-lg text-[13px] font-bold transition-all hover:brightness-110 active:scale-[0.97]"
                      style={{ backgroundColor: AX.greenBg, color: AX.green, border: `1px solid ${AX.greenBorder}` }}
                    >
                      Yes {realPrices ? `${formatCents(yesPrice)}¢` : ''}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onSelectOutcome?.(market.id, 'no'); }}
                      className="w-32 py-2.5 rounded-lg text-[13px] font-bold transition-all hover:brightness-110 active:scale-[0.97]"
                      style={{ backgroundColor: AX.redBg, color: AX.red, border: `1px solid ${AX.redBorder}` }}
                    >
                      No {realPrices ? `${formatCents(noPrice)}¢` : ''}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* In Review outcomes — resolved but in dispute/review period */}
            {inReviewMarkets.map((market) => {
              const prices = market._prices;
              const yesPrice = prices[0] || 0;

              return (
                <div
                  key={market.id}
                  className="flex items-center gap-3 px-3 py-3"
                  style={{ borderColor: 'rgba(251,191,36,0.15)' }}
                >
                  {/* Outcome image and name */}
                  <div className="flex-1 flex items-center gap-2.5 min-w-0">
                    {(market.image || market.icon) ? (
                      <img
                        src={market.image || market.icon}
                        alt={market.groupItemTitle || 'Outcome'}
                        className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold"
                        style={{ backgroundColor: getAvatarColor(market.groupItemTitle || market.id || 'O'), color: '#fff' }}
                      >
                        {(market.groupItemTitle || market.question || 'O').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-[13px] leading-tight truncate" style={{ color: AX.text }}>
                        {market.groupItemTitle || market.question || 'Outcome'}
                      </div>
                      <div className="text-[10px] mt-0.5" style={{ color: AX.muted }}>
                        {formatVol(market.volume)} Vol.
                      </div>
                    </div>
                  </div>

                  {/* Percentage + In Review badge */}
                  <div className="w-16 text-center">
                    <span className="text-[18px] font-bold" style={{ color: AX.text, fontVariantNumeric: 'tabular-nums' }}>
                      {formatPercent(yesPrice)}
                    </span>
                  </div>

                  {/* In Review label instead of trade buttons */}
                  <div className="w-32 text-center">
                    <span
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold"
                      style={{ backgroundColor: 'rgba(251,191,36,0.12)', color: '#FBBF24' }}
                    >
                      <HiOutlineClock className="w-3.5 h-3.5" />
                      In Review
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Resolved outcomes — collapsible section like Polymarket */}
            {resolvedMarkets.length > 0 && (
              <>
                <button
                  onClick={() => setShowResolved(!showResolved)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-[11px] font-medium transition-colors hover:bg-white/5"
                  style={{ color: AX.muted, backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <span className="flex items-center gap-1.5">
                    <HiOutlineCheckCircle className="w-3.5 h-3.5" />
                    {showResolved ? 'Hide' : 'View'} resolved ({resolvedMarkets.length})
                  </span>
                  <svg
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${showResolved ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showResolved && resolvedMarkets.map((market) => {
                  // For resolved markets, determine the outcome from prices
                  // YES won: outcomePrices[0] ≈ 1, NO won: outcomePrices[1] ≈ 1
                  const prices = market._prices;
                  const yesPrice = prices[0] || 0;
                  const noPrice = prices[1] || 0;
                  // Determine result: if YES price > 0.5 → Yes won, else No won
                  // For fully resolved: one side is ~1.0, other is ~0.0
                  const yesWon = yesPrice > noPrice && yesPrice > 0.5;
                  const noWon = noPrice > yesPrice && noPrice > 0.5;
                  const resultLabel = yesWon ? 'Yes' : noWon ? 'No' : 'No';

                  return (
                    <div
                      key={market.id}
                      className="flex items-center gap-3 px-3 py-3 opacity-50"
                    >
                      {/* Outcome image and name */}
                      <div className="flex-1 flex items-center gap-2.5 min-w-0">
                        {(market.image || market.icon) ? (
                          <img
                            src={market.image || market.icon}
                            alt={market.groupItemTitle || 'Outcome'}
                            className="w-9 h-9 rounded-lg object-cover flex-shrink-0 grayscale"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold grayscale"
                            style={{ backgroundColor: getAvatarColor(market.groupItemTitle || market.id || 'O'), color: '#fff' }}
                          >
                            {(market.groupItemTitle || market.question || 'O').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-semibold text-[13px] leading-tight truncate" style={{ color: AX.muted }}>
                            {market.groupItemTitle || market.question || 'Outcome'}
                          </div>
                          <div className="text-[10px] mt-0.5" style={{ color: AX.muted }}>
                            {formatVol(market.volume)} Vol.
                          </div>
                        </div>
                      </div>

                      {/* Resolution result instead of percentage */}
                      <div className="w-16 text-center">
                        <span
                          className="text-[11px] font-bold px-2.5 py-1 rounded-md"
                          style={{
                            backgroundColor: yesWon ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
                            color: yesWon ? AX.green : AX.red,
                          }}
                        >
                          {resultLabel}
                        </span>
                      </div>

                      {/* No trade buttons for resolved — just show "Resolved" label */}
                      <div className="w-32 text-center">
                        <span className="text-[10px]" style={{ color: AX.muted }}>Resolved</span>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}

        {/* Polymarket link */}
        <div className="pt-4 text-center">
          <a
            href={`https://polymarket.com/event/${event.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs hover:underline"
            style={{ color: AX.purple }}
          >
            <HiOutlineExternalLink className="w-3.5 h-3.5" />
            View on Polymarket
          </a>
        </div>
      </div>
    </div>
  );
});

// Trades Table Component
const TradesTable: React.FC<{ trades: any[]; isLoading: boolean }> = ({ trades, isLoading }) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <HiOutlineRefresh className="w-5 h-5 animate-spin" style={{ color: AX.muted }} />
      </div>
    );
  }

  if (!trades || trades.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm" style={{ color: AX.muted }}>No trades yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr style={{ borderBottom: `1px solid ${AX.border}` }}>
            <th className="text-left py-2 px-3 font-medium" style={{ color: AX.muted }}>Side</th>
            <th className="text-right py-2 px-3 font-medium" style={{ color: AX.muted }}>Price</th>
            <th className="text-right py-2 px-3 font-medium" style={{ color: AX.muted }}>Amount</th>
            <th className="text-right py-2 px-3 font-medium" style={{ color: AX.muted }}>Time</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => (
            <tr key={trade.tradeId} style={{ borderBottom: `1px solid ${AX.border}` }}>
              <td className="py-2 px-3">
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase"
                  style={{
                    backgroundColor: trade.takerSide === 'yes' ? AX.greenBg : AX.redBg,
                    color: trade.takerSide === 'yes' ? AX.green : AX.red,
                  }}
                >
                  {trade.takerSide}
                </span>
              </td>
              <td className="py-2 px-3 text-right" style={{ color: trade.takerSide === 'yes' ? AX.green : AX.red }}>
                {trade.price}¢
              </td>
              <td className="py-2 px-3 text-right" style={{ color: AX.text }}>
                {trade.count.toLocaleString()}
              </td>
              <td className="py-2 px-3 text-right" style={{ color: AX.muted }}>
                {new Date(trade.createdTime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default function MarketDetailPage() {
  const router = useRouter();
  const { ticker } = router.query;
  const tickerString = typeof ticker === 'string' ? ticker : '';
  const isPolymarket = true; // Polymarket only

  // Wait for router to be ready before processing query params
  // This prevents "Market not found" from flashing while Next.js hydrates
  const isRouterReady = router.isReady;

  const [selectedTab, setSelectedTab] = useState("Trades");
  const [chartInterval, setChartInterval] = useState('1W');
  const [selectedSide, setSelectedSide] = useState<'yes' | 'no'>('yes');

  // Update selected tab when source changes (after router is ready)
  useEffect(() => {
    if (isRouterReady) {
      setSelectedTab(isPolymarket ? "Outcomes" : "Trades");
    }
  }, [isRouterReady, isPolymarket]);
  const [amount, setAmount] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showMobileTradeModal, setShowMobileTradeModal] = useState(false);
  const [isClosingModal, setIsClosingModal] = useState(false);

  // Selected outcome from Outcomes tab (for multi-outcome Polymarket markets)
  const [selectedOutcomeMarket, setSelectedOutcomeMarket] = useState<PolymarketMarket | null>(null);
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');

  // Polymarket trading state
  const [polymarketQuote, setPolymarketQuote] = useState<PolymarketQuote | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [polygonBalance, setPolygonBalance] = useState<PolymarketBalance | null>(null);
  const [geoblockStatus, setGeoblockStatus] = useState<PolymarketGeoblock | null>(null);
  const [isExecutingTrade, setIsExecutingTrade] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);

  // User's position for current token (for SELL orders)
  const [userTokenPosition, setUserTokenPosition] = useState<{
    tokenAmount: number;
    avgEntryPrice: number;
    side: string;
  } | null>(null);

  // Track if user clicked "Max" for SELL (to sell exact token balance, avoiding price-based rounding)
  const [isSellMax, setIsSellMax] = useState(false);

  // Order type: market (FOK) vs limit (GTC)
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [limitPriceCents, setLimitPriceCents] = useState<number>(50); // Default 50 cents
  const [showOrderTypeDropdown, setShowOrderTypeDropdown] = useState(false);

  // Open orders for this market
  const [openOrders, setOpenOrders] = useState<any[]>([]);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);

  // Collapsible sections in trade panel (all open by default)
  const [showMarketStats, setShowMarketStats] = useState(false);
  const [showAbout, setShowAbout] = useState(true);
  const [showResolution, setShowResolution] = useState(false);

  // Ref to track if we've auto-selected best outcome
  const hasAutoSelectedRef = useRef(false);

  // Accumulate live trade prices from WS for real-time chart updates
  const liveTradePointsRef = useRef<Array<{ time: number; price: number }>>([]);
  const [liveTradeCount, setLiveTradeCount] = useState(0); // trigger re-render on new trades

  // Resizable chart state (matching token trade page)
  const containerRef = useRef<HTMLDivElement | null>(null);
  const MIN_CHART_HEIGHT = 400;
  const DEFAULT_CHART_HEIGHT_RATIO = 0.65; // 65% of viewport for taller chart + order book
  const SSR_DEFAULT_CHART_HEIGHT = 500;

  const getResponsiveLimits = useCallback(() => {
    if (typeof window === "undefined") return { min: MIN_CHART_HEIGHT, max: 600 };
    const vh = window.innerHeight;
    const MIN_TOP = Math.max(MIN_CHART_HEIGHT, vh * 0.25);
    const MIN_BOTTOM = 180;
    const MAX_TOP = Math.min(vh * 0.7, vh - MIN_BOTTOM);
    return { min: MIN_TOP, max: MAX_TOP };
  }, []);

  const clampTop = useCallback((desired: number) => {
    const limits = getResponsiveLimits();
    const enforcedMin = Math.max(MIN_CHART_HEIGHT, limits.min);
    const vh = typeof window !== "undefined" ? window.innerHeight : 600;
    const maxTop = Math.min(vh - 180, limits.max);
    return Math.max(enforcedMin, Math.min(desired, maxTop));
  }, [getResponsiveLimits]);

  const [topPanePx, setTopPanePx] = useState<number>(() => {
    if (typeof window === "undefined") return Math.max(MIN_CHART_HEIGHT, SSR_DEFAULT_CHART_HEIGHT);
    const limits = getResponsiveLimits();
    const proposed = Math.max(limits.min, Math.min(window.innerHeight * DEFAULT_CHART_HEIGHT_RATIO, limits.max));
    const saved = Number(localStorage.getItem("predictionSplitTopPx"));
    if (Number.isFinite(saved) && saved > 0 && saved >= limits.min && saved <= limits.max) {
      return Math.max(saved, proposed);
    }
    return proposed;
  });

  const [isResizing, setIsResizing] = useState(false);
  const topPanePxRef = useRef(topPanePx);

  useEffect(() => {
    topPanePxRef.current = topPanePx;
  }, [topPanePx]);

  useEffect(() => {
    localStorage.setItem("predictionSplitTopPx", String(topPanePx));
  }, [topPanePx]);

  // Data hooks
  const { user, solBalance, usdcBalance, refreshBalance, primaryWalletAddresses } = useUser();
  const turnkeySigner = useTurnkeySigner();

  // dFlow hooks (only when not Polymarket AND router is ready)
  const { market: dflowMarket, isLoading: dflowLoading, refetch: dflowRefetch } = useDFlowMarket(
    !isPolymarket && isRouterReady && tickerString ? tickerString : undefined
  );
  const { trades, isLoading: tradesLoading } = useDFlowTrades(
    !isPolymarket && isRouterReady && tickerString ? tickerString : undefined,
    { limit: 50, refreshInterval: 15000 }
  );
  const { orderBook: dflowOrderBook } = useDFlowOrderBook(
    !isPolymarket && isRouterReady && tickerString ? tickerString : undefined,
    { refreshInterval: 5000 }
  );
  const { history: priceHistory, isLoading: historyLoading } = useDFlowPriceHistory(
    !isPolymarket && isRouterReady && tickerString ? tickerString : undefined,
    { period: 'week', refreshInterval: 60000 }
  );
  const realtimePrices = useDFlowRealtimePrices(!isPolymarket && isRouterReady && tickerString ? tickerString : undefined);

  // Polymarket hooks (only when Polymarket AND router is ready)
  const { market: polyMarket, event: polyEvent, isLoading: polyLoading, refetch: polyRefetch } = usePolymarketMarket(
    isPolymarket && isRouterReady && tickerString ? tickerString : undefined,
    { enabled: isPolymarket && isRouterReady }
  );

  // Get Polymarket token IDs for orderbook (both YES and NO)
  // For multi-outcome markets, use selected outcome's token IDs
  const polyTokenIds = useMemo(() => {
    if (!isPolymarket) return { yes: undefined, no: undefined };

    // For multi-outcome markets, use selected outcome's token IDs
    if (selectedOutcomeMarket?.clobTokenIds) {
      try {
        const tokenIds = Array.isArray(selectedOutcomeMarket.clobTokenIds)
          ? selectedOutcomeMarket.clobTokenIds
          : JSON.parse(selectedOutcomeMarket.clobTokenIds as string);
        return {
          yes: tokenIds[0] || undefined,
          no: tokenIds[1] || undefined,
        };
      } catch {}
    }

    // Fallback to polyMarket data for single-outcome markets
    if (!polyMarket) return { yes: undefined, no: undefined };
    const polyData = (polyMarket as any).polymarketData;
    return {
      yes: polyData?.yesTokenId,
      no: polyData?.noTokenId,
    };
  }, [isPolymarket, polyMarket, selectedOutcomeMarket]);

  // Real-time order book + live trades via singleton WS (replaces 2 separate polling hooks)
  const {
    yesOrderBook: polyYesOrderBook,
    noOrderBook: polyNoOrderBook,
    yesLastTrade,
    noLastTrade,
  } = usePolymarketOrderBookWS({
    yesTokenId: polyTokenIds.yes,
    noTokenId: polyTokenIds.no,
    enabled: isPolymarket && !!(polyTokenIds.yes || polyTokenIds.no),
  });

  // Accumulate live YES trade prices for real-time chart point appending
  useEffect(() => {
    if (!yesLastTrade || !isPolymarket) return;
    const point = {
      time: yesLastTrade.timestamp > 1e12 ? yesLastTrade.timestamp : yesLastTrade.timestamp * 1000,
      price: yesLastTrade.price,
    };
    const pts = liveTradePointsRef.current;
    // Avoid duplicates (same timestamp)
    if (pts.length > 0 && pts[pts.length - 1].time === point.time) return;
    pts.push(point);
    // Cap at 500 points to avoid unbounded growth
    if (pts.length > 500) pts.splice(0, pts.length - 500);
    setLiveTradeCount(c => c + 1);
  }, [yesLastTrade, isPolymarket]);

  // Reset live trade accumulator when token changes
  useEffect(() => {
    liveTradePointsRef.current = [];
    setLiveTradeCount(0);
  }, [polyTokenIds.yes]);

  // Polymarket price history for chart (use YES token) - for single-outcome markets
  const { history: polyPriceHistory, isLoading: polyHistoryLoading } = usePolymarketPriceHistory(
    polyTokenIds.yes,
    { interval: 'max', fidelity: 60, refreshInterval: 60000, enabled: isPolymarket && !!polyTokenIds.yes }
  );

  // Detect multi-outcome market (e.g., Fed rate decision with multiple outcomes)
  const isMultiOutcomeMarket = useMemo((): boolean => {
    return !!(isPolymarket && polyEvent?.markets && polyEvent.markets.length > 1);
  }, [isPolymarket, polyEvent]);

  // Auto-select best outcome (highest probability) when polyEvent loads
  useEffect(() => {
    // Only auto-select once when data first loads
    if (hasAutoSelectedRef.current) return;
    if (!polyEvent?.markets || polyEvent.markets.length === 0) return;

    // Find the market with the highest YES probability
    let bestMarket: PolymarketMarket | null = null;
    let bestPrice = 0;

    for (const market of polyEvent.markets) {
      try {
        // Skip closed/resolved outcomes — nothing left to trade
        if (market.closed || market.resolved) continue;

        // Skip outcomes with no prices (null/undefined means placeholder)
        if (!market.outcomePrices) continue;

        const prices = JSON.parse(market.outcomePrices).map(Number);
        const yesPrice = prices[0] || 0;

        // Skip placeholder outcomes with common patterns
        const label = (market as any).groupItemTitle || market.question || '';
        if (/^Person [A-Z]+$/i.test(label)) continue;  // "Person A", "Person B", etc.
        if (/^Team [A-Z]+$/i.test(label)) continue;    // "Team AM", "Team B", etc.
        if (label === 'Other') continue;

        // Skip outcomes with zero volume (no trading activity = likely placeholder)
        const volume = parseFloat(market.volume || '0');
        if (volume === 0) continue;

        if (yesPrice > bestPrice) {
          bestPrice = yesPrice;
          bestMarket = market;
        }
      } catch {}
    }

    if (bestMarket) {
      setSelectedOutcomeMarket(bestMarket);
      hasAutoSelectedRef.current = true;
    }
  }, [polyEvent]);

  // Polymarket Trading: Check geoblock status on mount
  useEffect(() => {
    if (!isPolymarket) return;
    checkPolymarketGeoblock()
      .then((res) => {
        if (res.success) setGeoblockStatus(res.data);
      })
      .catch((err) => console.warn('[Polymarket] Geoblock check failed:', err.message));
  }, [isPolymarket]);

  // Polymarket Trading: Fetch Polygon balance + pre-warm trade caches on page load
  useEffect(() => {
    if (!isPolymarket || !user?.bearerToken) return;
    getPolymarketBalance(user.bearerToken)
      .then((res) => {
        if (res.success) setPolygonBalance(res.data);
      })
      .catch((err) => console.warn('[Polymarket] Balance fetch failed:', err.message));
    // Fire-and-forget: pre-build signer + CLOB client + check approvals
    warmPolymarketCaches(user.bearerToken);
  }, [isPolymarket, user?.bearerToken]);

  // Listen for balance broadcasts from Header (resolves instantly, no duplicate API call)
  useEffect(() => {
    const handleBalanceData = (e: Event) => {
      const data = (e as CustomEvent).detail;
      if (data) setPolygonBalance(data);
    };
    window.addEventListener('polygon-balance-data', handleBalanceData);
    return () => window.removeEventListener('polygon-balance-data', handleBalanceData);
  }, []);

  // Polymarket Trading: Fetch open orders for this market
  useEffect(() => {
    if (!isPolymarket || !user?.bearerToken || !selectedOutcomeMarket?.conditionId) return;

    getPolymarketOpenOrders(user.bearerToken, selectedOutcomeMarket.conditionId)
      .then((res) => {
        if (res?.success && Array.isArray(res.data)) {
          setOpenOrders(res.data);
        }
      })
      .catch((err) => console.warn('[Polymarket] Open orders fetch failed:', err.message));
  }, [isPolymarket, user?.bearerToken, selectedOutcomeMarket?.conditionId]);

  // Cancel order handler
  const handleCancelOrder = useCallback(async (orderId: string) => {
    if (!user?.bearerToken || cancellingOrderId) return;

    setCancellingOrderId(orderId);
    const cancelToast = createPolymarketTradeToast({
      label: 'Cancelling order...',
      tokenImage: selectedOutcomeMarket?.image || polyEvent?.image,
      tokenName: polyEvent?.title || tickerString,
    });

    try {
      const result = await cancelPolymarketOrder(orderId, user.bearerToken);
      if (result?.success) {
        setOpenOrders(prev => prev.filter(o => o.id !== orderId));
        cancelToast.complete('Order cancelled');
        window.dispatchEvent(new CustomEvent('polygon-balance-refresh'));
      } else {
        throw new Error('Cancel failed');
      }
    } catch (err: any) {
      cancelToast.error(err.message || 'Failed to cancel order');
    } finally {
      setCancellingOrderId(null);
    }
  }, [user?.bearerToken, cancellingOrderId]);

  // Polymarket Trading: Fetch user's REAL token balance from Polymarket (needed for SELL)
  // This queries the actual on-chain balance, not our database (which can be stale)
  useEffect(() => {
    if (!isPolymarket || !user?.bearerToken) {
      setUserTokenPosition(null);
      return;
    }

    // Get the current token ID based on selected side
    const tokenId = selectedSide === 'yes' ? polyTokenIds.yes : polyTokenIds.no;
    if (!tokenId) {
      setUserTokenPosition(null);
      return;
    }

    // Fetch REAL token balance from Polymarket CLOB (not our database)
    getPolymarketTokenBalance(tokenId, user.bearerToken)
      .then((res) => {
        if (res.success && res.data) {
          const balance = res.data.balance || 0;
          if (balance > 0) {
            setUserTokenPosition({
              tokenAmount: balance,
              avgEntryPrice: 0, // We don't have this from the CLOB, but it's not needed for selling
              side: selectedSide.toUpperCase(),
            });
          } else {
            setUserTokenPosition(null);
          }
        } else {
          setUserTokenPosition(null);
        }
      })
      .catch((err) => {
        console.warn('[Polymarket] Token balance fetch failed:', err.message);
        setUserTokenPosition(null);
      });
  }, [isPolymarket, user?.bearerToken, selectedSide, polyTokenIds.yes, polyTokenIds.no]);

  // Polymarket Trading: Fetch quote when amount/token/side changes (300ms debounce)
  useEffect(() => {
    const amountNum = parseFloat(amount);
    if (!isPolymarket || !amountNum || amountNum <= 0) {
      setPolymarketQuote(null);
      return;
    }

    // Get token ID based on selected side (yes/no)
    const tokenId = selectedSide === 'yes' ? polyTokenIds.yes : polyTokenIds.no;
    if (!tokenId) {
      setPolymarketQuote(null);
      return;
    }

    const side = tradeMode === 'buy' ? 'BUY' : 'SELL';

    // 300ms debounce: typing "1000" fires 1 API call instead of 4
    // setIsLoadingQuote is set inside the timeout to avoid stuck=true on fast unmount
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      setIsLoadingQuote(true);
      getPolymarketQuote({ tokenId, side, amount: amountNum })
        .then((res) => {
          if (!cancelled && res.success) setPolymarketQuote(res.data);
        })
        .catch((err) => {
          if (!cancelled) {
            console.warn('[Polymarket] Quote fetch failed:', err.message);
            setPolymarketQuote(null);
          }
        })
        .finally(() => { if (!cancelled) setIsLoadingQuote(false); });
    }, 300);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [isPolymarket, amount, selectedSide, tradeMode, polyTokenIds.yes, polyTokenIds.no]);

  // Polymarket Trading: Execute trade handler
  const handlePolymarketTrade = useCallback(async () => {
    if (!user?.bearerToken) {
      showPolymarketToast('Please log in to trade');
      return;
    }

    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      showPolymarketToast('Please enter a valid amount');
      return;
    }

    // Check geoblock
    if (geoblockStatus?.blocked) {
      showPolymarketToast(`Trading not available in ${geoblockStatus.country}`);
      return;
    }

    // Get token ID
    const tokenId = selectedSide === 'yes' ? polyTokenIds.yes : polyTokenIds.no;
    if (!tokenId) {
      showPolymarketToast('Please select an outcome');
      return;
    }

    // Get current price for the selected side (from market data or quote)
    let currentPrice = 0.5; // Default fallback
    if (polymarketQuote?.price) {
      currentPrice = polymarketQuote.price;
    } else if (selectedOutcomeMarket?.outcomePrices) {
      try {
        const prices = JSON.parse(selectedOutcomeMarket.outcomePrices).map(Number);
        currentPrice = selectedSide === 'yes' ? (prices[0] || 0.5) : (prices[1] || 0.5);
      } catch {
        currentPrice = 0.5;
      }
    }

    // For SELL orders: calculate tokens from USD amount and validate
    let tokensToSell: number | undefined;
    if (tradeMode === 'sell') {
      if (!userTokenPosition || userTokenPosition.tokenAmount <= 0) {
        showPolymarketToast(`You don't own any ${selectedSide.toUpperCase()} tokens to sell`);
        return;
      }

      // If user clicked "Max", sell ALL tokens (avoid price-based rounding errors)
      if (isSellMax) {
        tokensToSell = userTokenPosition.tokenAmount;
        console.log(`[Polymarket] Selling MAX: ${tokensToSell} tokens`);
      } else {
        // Calculate how many tokens the USD amount translates to
        tokensToSell = amountNum / currentPrice;

        // Validate user has enough tokens (with small buffer for rounding)
        if (tokensToSell > userTokenPosition.tokenAmount * 1.001) {
          const maxUsdValue = (userTokenPosition.tokenAmount * currentPrice).toFixed(2);
          showPolymarketToast(`You only have ${userTokenPosition.tokenAmount.toFixed(2)} tokens (≈$${maxUsdValue}). Use "Max" to sell all.`);
          return;
        }

        // Cap at actual token balance to avoid rounding errors
        tokensToSell = Math.min(tokensToSell, userTokenPosition.tokenAmount);
      }
    } else {
      // BUY order: Check USDC balance
      if (polygonBalance && amountNum > polygonBalance.usdc) {
        showPolymarketToast(`Insufficient balance. You have ${polygonBalance.usdcFormatted}`);
        return;
      }
    }

    setIsExecutingTrade(true);
    const isLimitOrder = orderType === 'limit';
    const initialLabel = tradeMode === 'sell'
      ? `Selling ${tokensToSell?.toFixed(2)} ${selectedSide.toUpperCase()} tokens...`
      : `Buying $${amountNum} ${selectedSide.toUpperCase()}...`;

    const tradeToast = createPolymarketTradeToast({
      label: initialLabel,
      tokenImage: selectedOutcomeMarket?.image || polyEvent?.image,
      tokenName: polyEvent?.title || tickerString,
    });

    try {
      // Check if USDC allowance is set for Polymarket contracts (for BUY orders)
      if (tradeMode === 'buy') {
        const allowanceResult = await getPolymarketAllowance(user.bearerToken);

        const currentAllowance = parseFloat(allowanceResult?.data?.allowance || '0');
        if (currentAllowance < amountNum * 1_000_000) {
          tradeToast.updateLabel('Approving USDC spending (one-time)...');

          const approvalResult = await approvePolymarketSpending(user.bearerToken);

          if (!approvalResult.success) {
            throw new Error(approvalResult.data?.message || 'Failed to approve USDC spending');
          }
        }
      }

      const orderTypeLabel = isLimitOrder ? 'limit' : 'market';
      tradeToast.updateLabel(
        tradeMode === 'sell'
          ? `Placing ${orderTypeLabel} sell...`
          : `Placing ${orderTypeLabel} buy for $${amountNum}...`
      );

      const result = await executePolymarketOrder(
        {
          tokenId,
          side: tradeMode === 'buy' ? 'BUY' : 'SELL',
          ...(tradeMode === 'buy'
            ? { amountUSDC: amountNum }
            : { amountTokens: tokensToSell }),
          orderType: isLimitOrder ? 'GTC' : 'FOK',
          ...(isLimitOrder && { price: limitPriceCents / 100 }),
          marketId: polyEvent?.slug || tickerString,
          marketTitle: selectedOutcomeMarket?.question || polyEvent?.title,
          conditionId: selectedOutcomeMarket?.conditionId || selectedOutcomeMarket?.id,
          outcomeSide: selectedSide === 'yes' ? 'YES' : 'NO',
        },
        user.bearerToken
      );

      if (result.success) {
        const txHash = result.data?.transactionHashes?.[0] || null;
        const wasMatched = result.data?.status === 'matched' || result.data?.status === 'filled';

        // Build success label
        let successLabel: string;
        if (isLimitOrder && !wasMatched) {
          // Limit order placed on book (not filled yet)
          successLabel = tradeMode === 'sell'
            ? `Limit sell placed: ${tokensToSell?.toFixed(2)} ${selectedSide.toUpperCase()} @ ${limitPriceCents}¢`
            : `Limit buy placed: $${amountNum} ${selectedSide.toUpperCase()} @ ${limitPriceCents}¢`;
        } else if (isLimitOrder && wasMatched) {
          // Limit order filled immediately
          successLabel = tradeMode === 'sell'
            ? `Limit sell filled: ${tokensToSell?.toFixed(2)} ${selectedSide.toUpperCase()} @ ${limitPriceCents}¢`
            : `Limit buy filled: $${amountNum} ${selectedSide.toUpperCase()} @ ${limitPriceCents}¢`;
        } else {
          // Market order
          successLabel = tradeMode === 'sell'
            ? `Sold ${tokensToSell?.toFixed(2)} ${selectedSide.toUpperCase()} tokens`
            : `Bought ${result.data?.takingAmount ? parseFloat(result.data.takingAmount).toFixed(2) : (polymarketQuote?.expectedTokens?.toFixed(2) || '')} ${selectedSide.toUpperCase()} shares`;
        }

        tradeToast.complete(successLabel, txHash);
        setAmount('');
        setPolymarketQuote(null);
        setIsSellMax(false); // Reset max flag

        // Helper to refresh all balances and orders
        const refreshBalances = () => {
          // Refresh USDC balance (local state)
          getPolymarketBalance(user.bearerToken).then((res) => {
            if (res.success) setPolygonBalance(res.data);
          });
          // Refresh REAL token balance from Polymarket (not database)
          getPolymarketTokenBalance(tokenId, user.bearerToken)
            .then((res) => {
              if (res.success && res.data) {
                const balance = res.data.balance || 0;
                if (balance > 0) {
                  setUserTokenPosition({
                    tokenAmount: balance,
                    avgEntryPrice: 0,
                    side: selectedSide.toUpperCase(),
                  });
                } else {
                  setUserTokenPosition(null);
                }
              }
            });
          // Refresh open orders (for limit orders)
          if (selectedOutcomeMarket?.conditionId) {
            getPolymarketOpenOrders(user.bearerToken, selectedOutcomeMarket.conditionId)
              .then((res) => {
                if (res?.success && Array.isArray(res.data)) {
                  setOpenOrders(res.data);
                }
              })
              .catch(() => {});
          }
          // Emit event to refresh Header's Polygon balance
          window.dispatchEvent(new CustomEvent('polygon-balance-refresh'));
        };

        // Refresh IMMEDIATELY after successful order
        refreshBalances();

        // Refresh AGAIN after delay to catch any blockchain propagation delays
        setTimeout(refreshBalances, 2000);
      } else {
        throw new Error('Order failed');
      }
    } catch (err: any) {
      tradeToast.error(err.message || 'Trade failed');
    } finally {
      setIsExecutingTrade(false);
    }
  }, [
    user?.bearerToken, amount, geoblockStatus, polygonBalance, selectedSide,
    polyTokenIds, tradeMode, selectedOutcomeMarket, polyEvent, polymarketQuote,
    userTokenPosition, isSellMax, orderType, limitPriceCents
  ]);

  // Extract market info for multi-series price history (top 4 by probability)
  const multiOutcomeMarketInfo = useMemo(() => {
    if (!isMultiOutcomeMarket || !polyEvent?.markets) {
      return undefined;
    }

    // Helper to parse JSON safely
    const safeJsonParse = <T,>(str: string, fallback: T): T => {
      try { return JSON.parse(str); } catch { return fallback; }
    };

    // Map all markets with their data
    const allMarkets = polyEvent.markets.map((market) => {
      const tokenIds = Array.isArray(market.clobTokenIds)
        ? market.clobTokenIds
        : safeJsonParse<string[]>(market.clobTokenIds as string, []);
      const prices = safeJsonParse<string[]>(market.outcomePrices || '["0.5", "0.5"]', ['0.5', '0.5']).map(Number);

      return {
        id: market.id,
        label: (market as any).groupItemTitle || market.question || 'Outcome',
        tokenId: tokenIds[0] || '', // YES token
        // Use nullish coalescing (??) instead of || to handle price = 0 correctly
        // || treats 0 as falsy, so eliminated teams (0%) would incorrectly become 50%
        currentPrice: prices[0] ?? 0.5,
        volume: parseFloat(market.volume || '0') || 0,
      };
    }).filter(m => m.tokenId); // Only include markets with valid token IDs

    // Filter out placeholder outcomes, resolved outcomes, and untraded outcomes
    const realMarkets = allMarkets.filter(m => {
      // Filter out "Person XX" placeholder labels
      if (/^Person [A-Z]+$/i.test(m.label)) return false;
      // Filter out "Team XX" placeholder labels
      if (/^Team [A-Z]+$/i.test(m.label)) return false;
      // Filter out "Other" catch-all outcome
      if (m.label === 'Other') return false;
      // Filter out outcomes with zero volume (no trading activity)
      if (m.volume === 0) return false;
      // Filter out resolved/eliminated outcomes (price at 0% or 100%)
      // These indicate the outcome is no longer active
      if (m.currentPrice <= 0.01 || m.currentPrice >= 0.99) return false;
      return true;
    });

    // Sort by probability (highest first) and take top 4
    const top4 = realMarkets
      .sort((a, b) => b.currentPrice - a.currentPrice)
      .slice(0, 4);

    return top4;
  }, [isMultiOutcomeMarket, polyEvent]);

  // Fetch multi-series price history for multi-outcome markets
  const { seriesData: multiSeriesData, isLoading: multiSeriesLoading } = usePolymarketMultiPriceHistory(
    multiOutcomeMarketInfo,
    { interval: 'all', fidelity: 1440, refreshInterval: 60000, enabled: isMultiOutcomeMarket && !!multiOutcomeMarketInfo }
  );

  // Transform multi-series data to ChartSeries format
  const chartSeries: ChartSeries[] = useMemo(() => {
    if (!isMultiOutcomeMarket || !multiSeriesData || multiSeriesData.length === 0) {
      return [];
    }

    // Transform and filter out series with no valid data points
    return multiSeriesData
      .map((series) => {
        // Transform history data - API returns { t, p } abbreviated format
        const data = (series.history || [])
          .map((point: any) => ({
            time: (point.t || point.timestamp) * 1000, // Convert seconds to milliseconds
            price: point.p ?? point.price ?? 0,
          }))
          .filter((point: any) => point.time > 0 && typeof point.price === 'number');

        return {
          id: series.id,
          label: series.label,
          data,
          currentPrice: series.currentPrice,
        };
      })
      .filter(series => series.data.length > 0); // Only include series with valid data
  }, [isMultiOutcomeMarket, multiSeriesData]);

  // Get Polymarket event ID and condition ID for comments and holders
  const polyEventId = useMemo(() => {
    if (!isPolymarket || !polyMarket) return undefined;
    const polyData = (polyMarket as any).polymarketData;
    return polyData?.eventId;
  }, [isPolymarket, polyMarket]);

  const polyConditionId = useMemo(() => {
    if (!isPolymarket) return undefined;
    // For multi-outcome markets, use the selected outcome's conditionId
    if (selectedOutcomeMarket?.conditionId) return selectedOutcomeMarket.conditionId;
    // Fallback to the default market's conditionId (binary markets)
    if (!polyMarket) return undefined;
    const polyData = (polyMarket as any).polymarketData;
    return polyData?.conditionId;
  }, [isPolymarket, polyMarket, selectedOutcomeMarket]);

  // Polymarket comments, holders, and activity
  const { comments, isLoading: commentsLoading } = usePolymarketComments(polyEventId, { enabled: isPolymarket });
  const { holders, isLoading: holdersLoading } = usePolymarketHolders(polyConditionId, { enabled: isPolymarket });
  const { activities: restActivities, isLoading: activityLoading } = usePolymarketActivity(polyConditionId, { limit: 50, enabled: isPolymarket });

  // Live activity from WebSocket last_trade_price events — prepended to REST data.
  // Buffered: trades accumulate in a ref, flushed to state every 500ms to reduce re-renders.
  const [wsActivities, setWsActivities] = useState<PolymarketActivity[]>([]);
  const wsActivityIdsRef = useRef(new Set<string>());
  const wsActivityBufferRef = useRef<PolymarketActivity[]>([]);
  const wsFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flush buffer to state (called on timer)
  const flushWsActivities = useCallback(() => {
    const buffer = wsActivityBufferRef.current;
    if (buffer.length > 0) {
      setWsActivities(prev => {
        const next = [...buffer, ...prev];
        return next.length > 20 ? next.slice(0, 20) : next;
      });
      wsActivityBufferRef.current = [];
    }
    wsFlushTimerRef.current = null;
  }, []);

  // Schedule a flush if not already scheduled
  const scheduleFlush = useCallback(() => {
    if (!wsFlushTimerRef.current) {
      wsFlushTimerRef.current = setTimeout(flushWsActivities, 500);
    }
  }, [flushWsActivities]);

  // Reset WS activities on market change
  useEffect(() => {
    setWsActivities([]);
    wsActivityIdsRef.current.clear();
    wsActivityBufferRef.current = [];
    if (wsFlushTimerRef.current) {
      clearTimeout(wsFlushTimerRef.current);
      wsFlushTimerRef.current = null;
    }
  }, [polyConditionId]);

  // Cleanup flush timer on unmount
  useEffect(() => {
    return () => {
      if (wsFlushTimerRef.current) clearTimeout(wsFlushTimerRef.current);
    };
  }, []);

  // Convert yesLastTrade → activity entry (buffered, no direct setState)
  useEffect(() => {
    if (!yesLastTrade || !isPolymarket) return;
    const id = `ws-yes-${yesLastTrade.timestamp}-${yesLastTrade.price}-${yesLastTrade.size}`;
    if (wsActivityIdsRef.current.has(id)) return;
    wsActivityIdsRef.current.add(id);

    wsActivityBufferRef.current.push({
      id,
      type: 'trade',
      timestamp: String(yesLastTrade.timestamp > 1e12 ? yesLastTrade.timestamp : yesLastTrade.timestamp * 1000),
      side: yesLastTrade.side?.toLowerCase() as 'buy' | 'sell',
      outcome: 'Yes',
      price: yesLastTrade.price,
      size: yesLastTrade.size,
      amount: yesLastTrade.price * yesLastTrade.size,
    });
    scheduleFlush();
  }, [yesLastTrade, isPolymarket, scheduleFlush]);

  // Convert noLastTrade → activity entry (buffered, no direct setState)
  useEffect(() => {
    if (!noLastTrade || !isPolymarket) return;
    const id = `ws-no-${noLastTrade.timestamp}-${noLastTrade.price}-${noLastTrade.size}`;
    if (wsActivityIdsRef.current.has(id)) return;
    wsActivityIdsRef.current.add(id);

    wsActivityBufferRef.current.push({
      id,
      type: 'trade',
      timestamp: String(noLastTrade.timestamp > 1e12 ? noLastTrade.timestamp : noLastTrade.timestamp * 1000),
      side: noLastTrade.side?.toLowerCase() as 'buy' | 'sell',
      outcome: 'No',
      price: noLastTrade.price,
      size: noLastTrade.size,
      amount: noLastTrade.price * noLastTrade.size,
    });
    scheduleFlush();
  }, [noLastTrade, isPolymarket, scheduleFlush]);

  // Merge: WS live trades + REST historical, deduplicated by timestamp+price+size
  const activities = useMemo(() => {
    if (!restActivities?.length && !wsActivities.length) return restActivities || [];
    const restSet = new Set(
      (restActivities || []).map(a => `${a.timestamp}-${a.price}-${a.size}`)
    );
    // Only include WS entries not already in REST data
    const uniqueWs = wsActivities.filter(a => !restSet.has(`${a.timestamp}-${a.price}-${a.size}`));
    return [...uniqueWs, ...(restActivities || [])];
  }, [restActivities, wsActivities]);

  // Unified market/loading/refetch
  const market = isPolymarket ? polyMarket : dflowMarket;
  const isLoading = isPolymarket ? polyLoading : dflowLoading;
  const refetch = isPolymarket ? polyRefetch : dflowRefetch;

  // Use real-time prices when available, fallback to market data
  const currentYesPrice = realtimePrices.yesBid != null && realtimePrices.yesAsk != null
    ? (realtimePrices.yesBid + realtimePrices.yesAsk) / 2 / 100
    : market?.yesPrice || 0.5;
  const currentNoPrice = realtimePrices.noBid != null && realtimePrices.noAsk != null
    ? (realtimePrices.noBid + realtimePrices.noAsk) / 2 / 100
    : market?.noPrice || 0.5;

  // Update limit price when selected side or market price changes
  useEffect(() => {
    const currentPrice = selectedSide === 'yes' ? currentYesPrice : currentNoPrice;
    const priceCents = Math.round(currentPrice * 100);
    // Clamp to valid range (1-99 cents)
    setLimitPriceCents(Math.max(1, Math.min(99, priceCents)));
  }, [selectedSide, currentYesPrice, currentNoPrice]);

  // Transform price history for the chart (use appropriate source based on market type)
  // IMPORTANT: Chart expects timestamps in MILLISECONDS
  // Split into two memos: expensive REST mapping (runs on refetch) + cheap live merge (runs per trade)

  // Expensive: convert REST timestamps from seconds → ms. Only recomputes on REST refetch (~60s).
  const restChartPoints = useMemo(() => {
    if (isPolymarket) {
      return polyPriceHistory.length > 0
        ? polyPriceHistory.map(p => ({ time: p.timestamp * 1000, price: p.price }))
        : [];
    }
    return priceHistory.length > 0
      ? priceHistory.map(p => ({ time: p.timestamp, price: p.yesPrice }))
      : [];
  }, [isPolymarket, polyPriceHistory, priceHistory]);

  // Cheap: merge rest + live points. Runs on each trade but only spreads arrays + filters 0-20 live items.
  const chartPriceHistory = useMemo(() => {
    if (isPolymarket) {
      const livePoints = liveTradePointsRef.current;
      if (restChartPoints.length === 0 && livePoints.length === 0) return undefined;
      const lastRestTime = restChartPoints.length > 0 ? restChartPoints[restChartPoints.length - 1].time : 0;
      const newLivePoints = livePoints.filter(p => p.time > lastRestTime);
      return [...restChartPoints, ...newLivePoints];
    }
    return restChartPoints.length > 0 ? restChartPoints : undefined;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- liveTradeCount triggers re-merge of live points
  }, [isPolymarket, restChartPoints, liveTradeCount]);

  // Unified history loading state
  // For multi-outcome markets, use multi-series loading; otherwise use single-series loading
  // IMPORTANT: Also check if chartSeries is empty but should have data - this handles the race condition
  // where multiSeriesLoading becomes false before chartSeries is populated
  const chartHistoryLoading = isPolymarket
    ? (isMultiOutcomeMarket
        ? (multiSeriesLoading || (chartSeries.length === 0 && multiOutcomeMarketInfo && multiOutcomeMarketInfo.length > 0))
        : polyHistoryLoading)
    : historyLoading;

  // Transform order book for the chart component
  // WS hook returns strings (OrderBookLevel), chart expects numbers — parse here
  const orderBookForChart = useMemo(() => {
    if (isPolymarket) {
      if (!polyYesOrderBook && !polyNoOrderBook) return null;

      const toNum = (levels: any[]) => levels.map((l: any) => ({
        price: typeof l.price === 'string' ? parseFloat(l.price) : l.price,
        size: typeof l.size === 'string' ? parseFloat(l.size) : l.size,
      }));

      return {
        yesBids: toNum(polyYesOrderBook?.bids || []),
        yesAsks: toNum(polyYesOrderBook?.asks || []),
        noBids: toNum(polyNoOrderBook?.bids || []),
        noAsks: toNum(polyNoOrderBook?.asks || []),
      };
    } else {
      // Use dFlow orderbook
      if (!dflowOrderBook) return null;
      return {
        yesBids: dflowOrderBook.yesBids || [],
        yesAsks: (dflowOrderBook as any).yesAsks || [],
        noBids: dflowOrderBook.noBids || [],
        noAsks: (dflowOrderBook as any).noAsks || [],
      };
    }
  }, [isPolymarket, polyYesOrderBook, polyNoOrderBook, dflowOrderBook]);

  const amountNumber = parseFloat(amount) || 0;
  const selectedPrice = selectedSide === 'yes' ? currentYesPrice : currentNoPrice;
  const tokensReceived = amountNumber > 0 ? amountNumber / selectedPrice : 0;
  const potentialPayout = tokensReceived;

  // Get the mint address for the selected outcome
  const getOutcomeMint = useCallback(() => {
    if (!market?.accounts) return null;
    const usdcAccount = market.accounts[USDC_MINT];
    if (!usdcAccount) return null;
    return selectedSide === 'yes' ? usdcAccount.yesMint : usdcAccount.noMint;
  }, [market, selectedSide]);

  const handleSubmit = async () => {
    if (amountNumber <= 0) return;
    if (!user) {
      setTradeError('Connect wallet to trade');
      return;
    }

    if (usdcBalance !== undefined && amountNumber > usdcBalance) {
      setTradeError(`Insufficient USDC balance (${usdcBalance.toFixed(2)} available)`);
      return;
    }

    const outcomeMint = getOutcomeMint();
    if (!outcomeMint) {
      setTradeError('Market not available');
      return;
    }

    if (!turnkeySigner) {
      setTradeError('Wallet signer not ready');
      return;
    }

    setIsSubmitting(true);
    setTradeError(null);

    const toastId = showEnhancedToast('loading', `Getting quote...`, { title: `Buy ${selectedSide.toUpperCase()}` });

    try {
      const amountInMicroUsdc = Math.floor(amountNumber * 1_000_000);
      const quote = await getDFlowQuote({
        inputMint: USDC_MINT,
        outputMint: outcomeMint,
        amount: amountInMicroUsdc,
        slippageBps: 100,
      });

      if (!quote) throw new Error('Failed to get quote');

      const outAmount = parseInt(quote.outAmount) / 1_000_000;
      updateEnhancedToast(toastId, 'loading', `~${outAmount.toFixed(2)} tokens, preparing tx...`, { title: 'Quote Ready' });

      const userPublicKey = user.publicKey;
      if (!userPublicKey) throw new Error('No wallet address');

      const swapResult = await getDFlowSwap({
        quoteResponse: quote,
        userPublicKey,
      });

      if (!swapResult?.swapTransaction) throw new Error('Failed to get swap transaction');

      updateEnhancedToast(toastId, 'loading', 'Please approve transaction...', { title: 'Sign Transaction' });

      const { signedTransaction, signature } = await turnkeySigner.requestSignature({
        unsignedTxBase64: swapResult.swapTransaction,
        signerPublicKey: userPublicKey,
      });

      updateEnhancedToast(toastId, 'loading', 'Broadcasting to Solana...', { title: 'Submitting' });

      await turnkeySigner.broadcastSignedTransaction({
        transaction: signedTransaction,
      });

      updateEnhancedToast(toastId, 'success', `Bought ~${outAmount.toFixed(2)} ${selectedSide.toUpperCase()} tokens`, { title: 'Trade Success!' });

      setAmount('');
      await refreshBalance?.();
    } catch (err) {
      console.error('[Prediction Trade Error]', err);
      const errorMessage = err instanceof Error ? err.message : 'Trade failed';
      updateEnhancedToast(toastId, 'error', errorMessage, { title: 'Trade Failed' });
      setTradeError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeModal = useCallback(() => {
    setIsClosingModal(true);
    setTimeout(() => {
      setShowMobileTradeModal(false);
      setIsClosingModal(false);
    }, 300);
  }, []);

  // Parse prices from selected outcome for the trade panel
  // (must be before early returns to maintain consistent hook count)
  const tradePanelPrices = useMemo(() => {
    let yp = currentYesPrice;
    let np = currentNoPrice;
    if (selectedOutcomeMarket?.outcomePrices) {
      try {
        const prices = JSON.parse(selectedOutcomeMarket.outcomePrices).map(Number);
        yp = prices[0] || 0.5;
        np = prices[1] || 0.5;
      } catch {}
    }
    return {
      yesCents: Math.round(yp * 100 * 10) / 10,
      noCents: Math.round(np * 100 * 10) / 10,
    };
  }, [currentYesPrice, currentNoPrice, selectedOutcomeMarket]);

  // Show loading state while router is initializing or data is being fetched
  if (!isRouterReady || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: AX.bg }}>
        <HiOutlineRefresh className="w-6 h-6 animate-spin" style={{ color: AX.mint }} />
      </div>
    );
  }

  // Only show "Market not found" after router is ready and loading is complete
  if (!market) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: AX.bg }}>
        <Header search={search} setSearch={setSearch} />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="mb-4" style={{ color: AX.muted }}>Market not found</p>
            <p className="text-xs mb-4" style={{ color: AX.muted }}>
              Ticker: {tickerString || '(empty)'} | Source: {isPolymarket ? 'Polymarket' : 'dFlow'}
            </p>
            <Link href="/predictions" className="px-4 py-2 rounded-lg" style={{ backgroundColor: AX.mint, color: '#000' }}>
              Back to Markets
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const isActive = market.status === 'active';
  const isResolved = market.status === 'resolved';
  const pageTitle = `${market.title} | Predictions`;

  /* ─────────────────────────────────────────────────────────────────────
     COCKPIT LAYOUT — redesigned per expert trader requirements
     Left 60-65%: header, price banner, chart, tabs (scrollable)
     Right 35-40%: sticky trading panel that NEVER leaves screen
     ───────────────────────────────────────────────────────────────────── */

  return (
    <PinGate>
      <Head><title>{pageTitle}</title></Head>

      <div
        className="min-h-screen w-full flex flex-col"
        style={{
          backgroundColor: AX.bg,
          color: AX.text,
          fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
        }}
      >
        <Header search={search} setSearch={setSearch} />

        {/* ══════════════ MAIN COCKPIT ══════════════ */}
        <div className="flex flex-1 w-full relative">

          {/* ══════════ LEFT PANEL (~65%) ══════════ */}
          <div ref={containerRef} className="flex-1 min-w-0 flex flex-col">

            {/* ── Header Row — 80px to align with right panel ── */}
            <div className="flex items-center gap-3 px-4 flex-shrink-0" style={{ height: 80, borderBottom: `1px solid ${AX.border}` }}>
              <button onClick={() => router.push('/predictions')} className="p-1.5 rounded-lg hover:opacity-70 transition-opacity flex-shrink-0" style={{ color: AX.muted }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              </button>
              {(polyEvent?.image || market.imageUrl || (market as any).image) && (
                <img src={polyEvent?.image || market.imageUrl || (market as any).image} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" style={{ border: `1px solid ${AX.border}` }} />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-[16px] font-bold truncate" style={{ color: AX.text }}>{market.title}</h1>
                  <span className="text-[10px] px-2 py-0.5 rounded font-medium flex-shrink-0" style={{ backgroundColor: AX.surface, color: AX.cyan, border: `1px solid ${AX.cyan}30` }}>POLYMARKET</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {(polyEvent?.endDate || selectedOutcomeMarket?.endDate) && (
                    <span className="text-[11px] flex items-center gap-1" style={{ color: AX.muted }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                      Closes {new Date(polyEvent?.endDate || selectedOutcomeMarket?.endDate || '').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  )}
                  {multiOutcomeMarketInfo && multiOutcomeMarketInfo.length > 0 && (
                    <span className="text-[11px]" style={{ color: AX.muted }}>
                      · Leading: {multiOutcomeMarketInfo[0].label} ({(multiOutcomeMarketInfo[0].currentPrice * 100).toFixed(0)}%)
                    </span>
                  )}
                </div>
              </div>

              {/* Key stats */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-right">
                  <div className="text-[9px] uppercase tracking-wider font-medium" style={{ color: AX.muted }}>Vol</div>
                  <div className="text-[11px] font-semibold" style={{ color: AX.text, fontVariantNumeric: 'tabular-nums' }}>
                    {formatPolymarketVolume(parseFloat(polyEvent?.volume || selectedOutcomeMarket?.volume || '0'))}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] uppercase tracking-wider font-medium" style={{ color: AX.muted }}>Liq</div>
                  <div className="text-[11px] font-semibold" style={{ color: AX.text, fontVariantNumeric: 'tabular-nums' }}>
                    {formatPolymarketVolume(parseFloat(polyEvent?.liquidity || selectedOutcomeMarket?.liquidity || '0'))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Chart area (fixed height) ── */}
            <div className="flex-shrink-0 flex" style={{ height: 407 }}>
              <div className="flex-1 relative min-w-0 h-full" style={{ minHeight: 0 }}>
                {chartHistoryLoading ? (
                  <div key="chart-loading" className="flex items-center justify-center h-full" style={{ backgroundColor: AX.bg }}>
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-full max-w-[300px] h-32 rounded-xl animate-pulse" style={{ backgroundColor: AX.surface }} />
                      <HiOutlineRefresh className="w-5 h-5 animate-spin" style={{ color: AX.muted }} />
                    </div>
                  </div>
                ) : isPolymarket && isMultiOutcomeMarket ? (
                  <TradingViewPredictionChart
                    key={`tv-multi-${tickerString}`}
                    ticker={tickerString}
                    marketTitle={market.title}
                    yesPrice={currentYesPrice}
                    noPrice={currentNoPrice}
                    height="100%"
                    series={chartSeries as ChartSeriesData[]}
                    isMultiSeries={true}
                    showOrderBook={false}
                    isResolved={isResolved}
                    resolvedResult={market.result as 'yes' | 'no' | null}
                  />
                ) : isPolymarket ? (
                  <TradingViewPredictionChart
                    key={`tv-poly-${tickerString}`}
                    ticker={tickerString}
                    marketTitle={market.title}
                    yesPrice={currentYesPrice}
                    noPrice={currentNoPrice}
                    height="100%"
                    priceHistory={chartPriceHistory}
                    showOrderBook={false}
                    useLineChart={true}
                    isResolved={isResolved}
                    resolvedResult={market.result as 'yes' | 'no' | null}
                  />
                ) : (
                  <TradingViewPredictionChart
                    key={`tv-dflow-${tickerString}`}
                    ticker={tickerString}
                    marketTitle={market.title}
                    yesPrice={currentYesPrice}
                    noPrice={currentNoPrice}
                    height="100%"
                    priceHistory={chartPriceHistory}
                    orderBook={orderBookForChart}
                    isResolved={isResolved}
                    resolvedResult={market.result as 'yes' | 'no' | null}
                  />
                )}
              </div>

              {/* Order Book (inline right) */}
              {isPolymarket && polyTokenIds.yes && !isResolved && !(selectedOutcomeMarket as any)?.closed && (
                <PolymarketOrderBook
                  yesTokenId={polyTokenIds.yes}
                  noTokenId={polyTokenIds.no}
                  marketTitle={market.title}
                  defaultOpen={true}
                  isMultiOutcome={isMultiOutcomeMarket}
                />
              )}
            </div>

            {/* ── Tabs + Content ── */}
            <div className="flex flex-col" style={{ borderTop: `1px solid ${AX.border}` }}>
              {/* Tab bar */}
              <div className="flex items-center gap-0 px-3 sticky top-0 z-10" style={{ borderBottom: `1px solid ${AX.border}`, backgroundColor: AX.bg }}>
                {[...(isPolymarket ? POLYMARKET_TABS : DFLOW_TABS), 'AI Insights'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSelectedTab(tab)}
                    className="px-3 py-2.5 text-[13px] font-medium transition-colors relative"
                    style={{ color: selectedTab === tab ? AX.text : AX.muted }}
                  >
                    {tab === 'AI Insights' ? (
                      <span
                        className="flex items-center gap-1.5 px-2 py-0.5 rounded-full"
                        style={{
                          background: selectedTab === 'AI Insights'
                            ? 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.12), rgba(16,185,129,0.15))'
                            : 'transparent',
                          border: selectedTab === 'AI Insights'
                            ? '1px solid rgba(139,92,246,0.3)'
                            : '1px solid transparent',
                        }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ animation: 'sparkle-pulse 2s ease-in-out infinite' }}>
                          <defs>
                            <linearGradient id="ai-tab-sparkle" x1="3" y1="2" x2="22" y2="21">
                              <stop stopColor="#8B5CF6"/><stop offset="0.33" stopColor="#6366F1"/><stop offset="0.66" stopColor="#3B82F6"/><stop offset="1" stopColor="#10B981"/>
                            </linearGradient>
                          </defs>
                          <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="url(#ai-tab-sparkle)"/>
                        </svg>
                        <span style={{
                          background: 'linear-gradient(90deg, #8B5CF6, #6366F1, #3B82F6, #10B981)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          fontWeight: 600,
                        }}>AI Insights</span>
                      </span>
                    ) : tab}
                    {selectedTab === tab && (
                      <div className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full" style={{ backgroundColor: AX.cyan }} />
                    )}
                  </button>
                ))}
              </div>

              {/* Tab content — CSS hidden to preserve state */}
              <div className="min-h-[300px]">
                <div className={selectedTab === "Trades" ? '' : 'hidden'}>
                  <TradesTable trades={trades || []} isLoading={tradesLoading} />
                </div>
                <div className={selectedTab === "Activity" ? '' : 'hidden'}>
                  <ActivitySection activities={activities || []} isLoading={activityLoading} />
                </div>
                <div className={selectedTab === "Outcomes" ? '' : 'hidden'}>
                  <OutcomesSection
                    event={polyEvent || null}
                    isLoading={polyLoading}
                    selectedOutcomeId={selectedOutcomeMarket?.id || null}
                    onSelectOutcome={(marketId, side) => {
                      const selectedMkt = polyEvent?.markets?.find(m => m.id === marketId);
                      if (selectedMkt) {
                        setSelectedOutcomeMarket(selectedMkt);
                        setSelectedSide(side);
                        setTradeMode('buy');
                        setAmount('');
                        const outcomeName = (selectedMkt as any).groupItemTitle || selectedMkt.question || 'Outcome';
                        showPolymarketToast(`${outcomeName} selected`, 'success');
                      }
                    }}
                  />
                </div>
                <div className={selectedTab === "Comments" ? '' : 'hidden'}>
                  <CommentsSection comments={comments || []} isLoading={commentsLoading} eventSlug={tickerString} />
                </div>
                <div className={selectedTab === "Holders" ? '' : 'hidden'}>
                  <HoldersSection holders={holders || []} isLoading={holdersLoading} />
                </div>
                <div className={selectedTab === "Orders" ? '' : 'hidden'}>
                  <div className="flex flex-col h-full">
                    {!user?.bearerToken ? (
                      <div className="flex flex-col items-center justify-center h-full py-8">
                        <div className="w-10 h-10 rounded-xl mb-2 flex items-center justify-center" style={{ backgroundColor: AX.surface2 }}>
                          <HiOutlineClipboardList className="w-5 h-5" style={{ color: AX.muted }} />
                        </div>
                        <p className="text-xs" style={{ color: AX.muted }}>Log in to view your orders</p>
                      </div>
                    ) : openOrders.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full py-8">
                        <div className="w-10 h-10 rounded-xl mb-2 flex items-center justify-center" style={{ backgroundColor: AX.surface2 }}>
                          <HiOutlineClipboardList className="w-5 h-5" style={{ color: AX.muted }} />
                        </div>
                        <p className="text-xs font-medium mb-0.5" style={{ color: AX.text }}>No Open Orders</p>
                        <p className="text-[10px]" style={{ color: AX.muted }}>Your limit orders will appear here</p>
                      </div>
                    ) : (
                      <div className="p-3 space-y-2 overflow-auto">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold" style={{ color: AX.text }}>
                            {openOrders.length} Open Order{openOrders.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {openOrders.map((order) => {
                          const isBuy = order.side === 'BUY';
                          const price = parseFloat(order.price || '0');
                          const size = parseFloat(order.original_size || order.size || '0');
                          const filled = parseFloat(order.size_matched || '0');
                          const remaining = size - filled;
                          const filledPercent = size > 0 ? (filled / size) * 100 : 0;
                          return (
                            <div key={order.id} className="p-3 rounded-xl" style={{ backgroundColor: AX.surface, border: `1px solid ${AX.border}` }}>
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold px-2 py-1 rounded" style={{ backgroundColor: isBuy ? AX.greenBg : AX.redBg, color: isBuy ? AX.green : AX.red }}>{isBuy ? 'BUY' : 'SELL'}</span>
                                  <span className="text-xs" style={{ color: AX.muted }}>Limit Order</span>
                                </div>
                                <button onClick={() => handleCancelOrder(order.id)} disabled={cancellingOrderId === order.id} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80 disabled:opacity-50" style={{ backgroundColor: AX.redBg, color: AX.red, border: `1px solid ${AX.red}30` }}>
                                  {cancellingOrderId === order.id ? <HiOutlineRefresh className="w-3 h-3 animate-spin" /> : 'Cancel'}
                                </button>
                              </div>
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between"><span className="text-xs" style={{ color: AX.muted }}>Price</span><span className="text-sm font-semibold" style={{ color: AX.text }}>{(price * 100).toFixed(0)}¢</span></div>
                                <div className="flex items-center justify-between"><span className="text-xs" style={{ color: AX.muted }}>Size</span><span className="text-sm font-medium" style={{ color: AX.text }}>{size.toFixed(2)} shares</span></div>
                                {filled > 0 && (<>
                                  <div className="flex items-center justify-between"><span className="text-xs" style={{ color: AX.muted }}>Filled</span><span className="text-sm font-medium" style={{ color: AX.green }}>{filled.toFixed(2)} ({filledPercent.toFixed(0)}%)</span></div>
                                  <div className="h-1.5 rounded-full overflow-hidden mt-1" style={{ backgroundColor: AX.border }}><div className="h-full rounded-full transition-all" style={{ width: `${filledPercent}%`, backgroundColor: AX.green }} /></div>
                                </>)}
                                <div className="flex items-center justify-between pt-1"><span className="text-xs" style={{ color: AX.muted }}>Total Value</span><span className="text-sm font-semibold" style={{ color: AX.text }}>${(remaining * price).toFixed(2)}</span></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div className={selectedTab === "Positions" ? '' : 'hidden'}>
                  <div className="flex flex-col h-full">
                    <React.Suspense fallback={<div className="flex items-center justify-center h-full"><HiOutlineRefresh className="w-5 h-5 animate-spin" style={{ color: AX.muted }} /></div>}>
                      {user?.bearerToken ? (
                        <UnifiedPortfolio authToken={user.bearerToken} walletAddress={primaryWalletAddresses?.ethereum} variant="predictions" />
                      ) : (
                        <PredictionPositions userPublicKey={user?.publicKey} showEmptyState={true} />
                      )}
                    </React.Suspense>
                  </div>
                </div>
                {selectedTab === "AI Insights" && (
                  <div className="p-4 w-full">
                    {/* Iridescent glow container */}
                    <div className="relative rounded-xl overflow-hidden">
                      {/* Animated iridescent border */}
                      <div className="absolute inset-0 rounded-xl" style={{
                        background: 'linear-gradient(135deg, #8B5CF6, #6366F1, #3B82F6, #06B6D4, #10B981, #8B5CF6)',
                        backgroundSize: '300% 300%',
                        animation: 'iridescent-flow 6s ease-in-out infinite',
                        padding: 1,
                      }} />
                      {/* Inner content with dark bg */}
                      <div className="relative m-[1px] rounded-xl" style={{ backgroundColor: AX.surface2 }}>
                        {/* Subtle aurora glow at top */}
                        <div className="absolute top-0 left-0 right-0 h-24 rounded-t-xl pointer-events-none" style={{
                          background: 'linear-gradient(180deg, rgba(139,92,246,0.08) 0%, rgba(59,130,246,0.04) 40%, transparent 100%)',
                        }} />
                        <div className="relative">
                          <InsightPanel source={isPolymarket ? 'polymarket' : 'dflow'} marketId={tickerString} docked chromeless />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>{/* end LEFT PANEL */}

          {/* ══════════ RIGHT PANEL — STICKY TRADING ══════════ */}
          <div
            className="flex-shrink-0 hidden lg:flex flex-col text-[12px] leading-tight sticky top-[0px] self-start"
            style={{
              width: 360,
              maxWidth: '35%',
              maxHeight: '100vh',
              backgroundColor: AX.surface2,
              borderLeft: `1px solid ${AX.border}`,
            }}
          >
            <div className="flex-1 overflow-y-auto pb-4">
              {/* Polymarket Trade Panel */}
              {isPolymarket ? (
                <div>
                  {/* Selected Outcome Header — height matches left panel header */}
                  {selectedOutcomeMarket ? (
                    <div
                      className="flex items-center gap-3 px-4"
                      style={{
                        height: 80,
                        borderBottom: `1px solid ${AX.border}`,
                        background: 'linear-gradient(180deg, rgba(28, 31, 36, 0.6) 0%, transparent 100%)',
                      }}
                    >
                      {(selectedOutcomeMarket.image || selectedOutcomeMarket.icon) ? (
                        <img src={selectedOutcomeMarket.image || selectedOutcomeMarket.icon} alt="" className="w-12 h-12 rounded-xl object-cover" />
                      ) : (
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold" style={{ backgroundColor: getAvatarColor(selectedOutcomeMarket.groupItemTitle || 'O'), color: '#fff' }}>
                          {(selectedOutcomeMarket.groupItemTitle || 'O').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-[14px] truncate" style={{ color: AX.text }}>
                          {selectedOutcomeMarket.groupItemTitle || selectedOutcomeMarket.question || 'Selected Outcome'}
                        </h3>
                        <button onClick={() => setSelectedOutcomeMarket(null)} className="text-[11px] hover:underline transition-colors" style={{ color: AX.green }}>
                          Change outcome
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4 mx-4 mt-3 rounded-xl" style={{ backgroundColor: AX.bg, border: `1px solid ${AX.border}` }}>
                      <p className="text-[12px]" style={{ color: AX.muted }}>Select an outcome from the Outcomes tab</p>
                    </div>
                  )}

                  {/* Buy/Sell + Market/Limit — merged section, no internal border */}
                  <div className="px-4 pt-3" style={{ paddingBottom: 15 }}>
                    <div className="grid grid-cols-2 gap-2.5 mb-3">
                      <button
                        onClick={() => setTradeMode('buy')}
                        className="py-2.5 rounded-lg flex items-center justify-center text-[13px] font-bold cursor-pointer select-none transition-all hover:brightness-110 active:scale-[0.97]"
                        style={{
                          backgroundColor: tradeMode === 'buy' ? AX.green : AX.greenBg,
                          border: `1px solid ${tradeMode === 'buy' ? AX.green : AX.greenBorder}`,
                          color: tradeMode === 'buy' ? '#000' : AX.green,
                        }}
                      >Buy</button>
                      <button
                        onClick={() => setTradeMode('sell')}
                        className="py-2.5 rounded-lg flex items-center justify-center text-[13px] font-bold cursor-pointer select-none transition-all hover:brightness-110 active:scale-[0.97]"
                        style={{
                          backgroundColor: tradeMode === 'sell' ? AX.red : AX.redBg,
                          border: `1px solid ${tradeMode === 'sell' ? AX.red : AX.redBorder}`,
                          color: tradeMode === 'sell' ? '#000' : AX.red,
                        }}
                      >Sell</button>
                    </div>

                    {/* Market / Limit pills */}
                    <div className="flex items-center gap-2">
                      {(['market', 'limit'] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setOrderType(t)}
                          className="text-[11px] px-3 py-1 rounded-full font-semibold transition-all"
                          style={{
                            backgroundColor: orderType === t ? `${AX.mint}18` : 'transparent',
                            color: orderType === t ? AX.mint : AX.muted,
                            border: `1px solid ${orderType === t ? `${AX.mint}35` : AX.border}`,
                          }}
                        >
                          {t === 'market' ? 'Market' : 'Limit'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Limit Price Input */}
                  {orderType === 'limit' && (
                    <div className="px-4 pt-1 mb-2">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: AX.muted }}>Limit Price</span>
                        <span className="text-[10px]" style={{ color: AX.muted }}>{tradeMode === 'buy' ? 'Max price to pay' : 'Min price to receive'}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl px-2" style={{ backgroundColor: AX.bg, border: `1px solid ${AX.border}` }}>
                        <button onClick={() => setLimitPriceCents(prev => Math.max(1, prev - 1))} className="w-10 h-10 flex items-center justify-center text-xl font-bold rounded-lg transition-colors hover:bg-white/10" style={{ color: AX.muted }}>-</button>
                        <div className="flex-1 text-center">
                          <span className="text-2xl font-bold" style={{ color: AX.text, fontVariantNumeric: 'tabular-nums' }}>{limitPriceCents}¢</span>
                        </div>
                        <button onClick={() => setLimitPriceCents(prev => Math.min(99, prev + 1))} className="w-10 h-10 flex items-center justify-center text-xl font-bold rounded-lg transition-colors hover:bg-white/10" style={{ color: AX.muted }}>+</button>
                      </div>
                      <div className="flex justify-center gap-2 mt-2">
                        {[1, 5, 10].map(delta => (
                          <button key={`minus-${delta}`} onClick={() => setLimitPriceCents(prev => Math.max(1, Math.min(99, prev - delta)))} className="px-2 py-1 rounded-lg text-[11px] font-medium transition-colors" style={{ backgroundColor: AX.bg, color: AX.muted, border: `1px solid ${AX.border}` }}>-{delta}¢</button>
                        ))}
                        {[1, 5, 10].map(delta => (
                          <button key={`plus-${delta}`} onClick={() => setLimitPriceCents(prev => Math.max(1, Math.min(99, prev + delta)))} className="px-2 py-1 rounded-lg text-[11px] font-medium transition-colors" style={{ backgroundColor: AX.bg, color: AX.muted, border: `1px solid ${AX.border}` }}>+{delta}¢</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Yes/No Buttons + Amount + Execute */}
                  <div className="px-4 pt-3" style={{ borderTop: `1px solid ${AX.border}` }}>
                    {/* Yes / No toggle buttons — matches outcomes table style */}
                    <div className="grid grid-cols-2 gap-2.5 mb-3">
                      <button
                        onClick={() => setSelectedSide('yes')}
                        className="py-2.5 rounded-lg flex items-center justify-center gap-1.5 text-[13px] font-bold transition-all hover:brightness-110 active:scale-[0.97]"
                        style={{
                          backgroundColor: selectedSide === 'yes' ? AX.green : AX.greenBg,
                          border: `1px solid ${selectedSide === 'yes' ? AX.green : AX.greenBorder}`,
                          color: selectedSide === 'yes' ? '#000' : AX.green,
                        }}
                      >
                        Yes {tradePanelPrices.yesCents.toFixed(0)}¢
                      </button>
                      <button
                        onClick={() => setSelectedSide('no')}
                        className="py-2.5 rounded-lg flex items-center justify-center gap-1.5 text-[13px] font-bold transition-all hover:brightness-110 active:scale-[0.97]"
                        style={{
                          backgroundColor: selectedSide === 'no' ? AX.red : AX.redBg,
                          border: `1px solid ${selectedSide === 'no' ? AX.red : AX.redBorder}`,
                          color: selectedSide === 'no' ? '#000' : AX.red,
                        }}
                      >
                        No {tradePanelPrices.noCents.toFixed(0)}¢
                      </button>
                    </div>

                    {/* Amount Input */}
                    <div className="mb-3">
                      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${AX.border}`, backgroundColor: AX.bg }}>
                        <div className="flex items-center justify-between gap-3 px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: AX.muted }}>Amount</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={amount}
                              onChange={(e) => { setAmount(e.target.value); setIsSellMax(false); }}
                              placeholder="0.00"
                              className="h-8 w-24 bg-transparent border-none text-left pl-2 text-[13px] font-medium tabular-nums placeholder:text-[#555] focus:outline-none"
                              style={{ color: AX.text, fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, monospace' }}
                            />
                          </div>
                          <span className="text-[15px] font-bold" style={{ color: AX.text }}>$</span>
                        </div>
                        {/* Preset buttons */}
                        <div className="grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', borderTop: `1px solid ${AX.border}` }}>
                          {tradeMode === 'buy' ? (
                            <>
                              {[5, 25, 100, 500].map((qa) => (
                                <button
                                  key={qa}
                                  onClick={() => setAmount(prev => String((parseFloat(prev) || 0) + qa))}
                                  className="h-9 text-[12px] font-semibold tabular-nums transition-colors hover:bg-white/[0.04]"
                                  style={{ color: AX.text, borderRight: `1px solid ${AX.border}` }}
                                >
                                  ${qa}
                                </button>
                              ))}
                              <button
                                onClick={() => polygonBalance && setAmount(Math.floor(polygonBalance.usdc).toString())}
                                className="h-9 text-[12px] font-bold transition-colors hover:bg-white/[0.04]"
                                style={{ color: AX.green }}
                              >
                                Max
                              </button>
                            </>
                          ) : (
                            <>
                              {[25, 50, 75, 100].map((pct) => {
                                const tokenValue = userTokenPosition ? userTokenPosition.tokenAmount * (selectedSide === 'yes' ? currentYesPrice : currentNoPrice) * (pct / 100) : 0;
                                return (
                                  <button key={pct} onClick={() => { setAmount(tokenValue.toFixed(2)); setIsSellMax(pct === 100); }} disabled={!userTokenPosition || userTokenPosition.tokenAmount <= 0} className="h-9 text-[12px] font-semibold tabular-nums transition-colors hover:bg-white/[0.04] disabled:opacity-40" style={{ color: AX.text, borderRight: `1px solid ${AX.border}` }}>
                                    {pct}%
                                  </button>
                                );
                              })}
                              <button
                                onClick={() => { if (userTokenPosition && userTokenPosition.tokenAmount > 0) { const maxValue = userTokenPosition.tokenAmount * (selectedSide === 'yes' ? currentYesPrice : currentNoPrice); setAmount(maxValue.toFixed(2)); setIsSellMax(true); } }}
                                disabled={!userTokenPosition || userTokenPosition.tokenAmount <= 0}
                                className="h-9 text-[12px] font-bold transition-colors hover:bg-white/[0.04] disabled:opacity-40"
                                style={{ color: AX.green }}
                              >
                                Max
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Position Info for SELL mode */}
                    {tradeMode === 'sell' && (
                      <div className="mb-3 p-2.5 rounded-xl" style={{ backgroundColor: AX.bg, border: `1px solid ${AX.border}` }}>
                        {userTokenPosition && userTokenPosition.tokenAmount > 0 ? (
                          <div className="flex justify-between items-center text-xs">
                            <span style={{ color: AX.muted }}>Your {selectedSide.toUpperCase()} tokens:</span>
                            <span style={{ color: AX.text, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                              {userTokenPosition.tokenAmount.toFixed(2)} (~${(userTokenPosition.tokenAmount * (selectedSide === 'yes' ? currentYesPrice : currentNoPrice)).toFixed(2)})
                            </span>
                          </div>
                        ) : (
                          <div className="text-xs text-center" style={{ color: AX.muted }}>No {selectedSide.toUpperCase()} tokens held</div>
                        )}
                      </div>
                    )}

                    {/* Quote Display */}
                    {polymarketQuote && parseFloat(amount) > 0 && (
                      <div className="mb-3 p-3 rounded-xl" style={{ backgroundColor: AX.bg, border: `1px solid ${AX.border}` }}>
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span style={{ color: AX.muted }}>{orderType === 'limit' ? 'Limit Price' : 'Price'}</span>
                            <span style={{ color: orderType === 'limit' ? AX.purple : AX.text, fontVariantNumeric: 'tabular-nums' }}>
                              {orderType === 'limit' ? `${limitPriceCents}¢` : `${(polymarketQuote.price * 100).toFixed(1)}¢`}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span style={{ color: AX.muted }}>Fee ({polymarketQuote.platformFeeBps / 100}%)</span>
                            <span style={{ color: AX.muted, fontVariantNumeric: 'tabular-nums' }}>-${polymarketQuote.platformFee.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span style={{ color: AX.muted }}>Net Amount</span>
                            <span style={{ color: AX.text, fontVariantNumeric: 'tabular-nums' }}>${polymarketQuote.netAmount.toFixed(2)}</span>
                          </div>
                          {polymarketQuote.expectedTokens && (() => {
                            const displayPrice = orderType === 'limit' ? limitPriceCents / 100 : polymarketQuote.price;
                            const estShares = orderType === 'limit' ? polymarketQuote.netAmount / displayPrice : polymarketQuote.expectedTokens;
                            const potentialPayout = estShares;
                            const potentialProfit = potentialPayout - polymarketQuote.netAmount - polymarketQuote.platformFee;
                            const profitPercent = (potentialProfit / parseFloat(amount)) * 100;
                            return (<>
                              <div className="border-t my-2" style={{ borderColor: AX.border }} />
                              <div className="flex justify-between text-xs"><span style={{ color: AX.muted }}>Est. Shares</span><span style={{ color: AX.text, fontVariantNumeric: 'tabular-nums' }}>{estShares.toFixed(2)}</span></div>
                              <div className="flex justify-between text-xs"><span style={{ color: AX.muted }}>Potential Payout</span><span style={{ color: AX.green, fontVariantNumeric: 'tabular-nums' }}>${potentialPayout.toFixed(2)}</span></div>
                              <div className="flex justify-between text-xs font-semibold"><span style={{ color: AX.muted }}>Potential Profit</span><span style={{ color: AX.green, fontVariantNumeric: 'tabular-nums' }}>+${potentialProfit.toFixed(2)} ({profitPercent.toFixed(1)}%)</span></div>
                            </>);
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Loading Quote */}
                    {isLoadingQuote && parseFloat(amount) > 0 && (
                      <div className="mb-3 p-3 rounded-xl flex items-center justify-center gap-2" style={{ backgroundColor: AX.bg }}>
                        <div className="animate-spin w-4 h-4 border-2 border-t-transparent rounded-full" style={{ borderColor: AX.muted }} />
                        <span className="text-xs" style={{ color: AX.muted }}>Fetching quote...</span>
                      </div>
                    )}

                    {/* Geoblock Warning */}
                    {geoblockStatus?.blocked && (
                      <div className="mb-3 p-2.5 rounded-xl flex items-center gap-2" style={{ backgroundColor: AX.redBg, border: `1px solid ${AX.redBorder}` }}>
                        <HiOutlineExclamation className="w-4 h-4" style={{ color: AX.red }} />
                        <span className="text-xs" style={{ color: AX.red }}>Trading unavailable in {geoblockStatus.country}</span>
                      </div>
                    )}

                    {/* Polygon Balance */}
                    {user?.bearerToken && (
                      <div className="mb-3 p-2.5 rounded-xl" style={{ backgroundColor: AX.bg, border: `1px solid ${AX.border}` }}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <BiWallet className="w-3.5 h-3.5" style={{ color: AX.muted }} />
                            <span className="text-xs" style={{ color: AX.muted }}>Balance</span>
                            {polygonBalance && !polygonBalance.hasTradingBalance && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-md" style={{ backgroundColor: `${AX.yellow}20`, color: AX.yellow }}>Low</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {polygonBalance ? (
                              <span className="text-xs font-semibold" style={{ color: polygonBalance.hasTradingBalance ? AX.text : AX.red, fontVariantNumeric: 'tabular-nums' }}>{polygonBalance.usdcFormatted}</span>
                            ) : (
                              <span className="text-xs" style={{ color: AX.muted }}>--</span>
                            )}
                            <button onClick={() => setShowWalletModal(true)} className="text-[10px] px-2.5 py-1 rounded-lg hover:opacity-80 transition-opacity font-medium" style={{ backgroundColor: `${AX.green}15`, color: AX.green }}>
                              {polygonBalance?.hasTradingBalance ? 'Details' : 'Fund'}
                            </button>
                          </div>
                        </div>
                        {polygonBalance && !polygonBalance.hasGasBalance && (
                          <div className="mt-2 text-[10px] flex items-center gap-1" style={{ color: AX.yellow }}>
                            <HiOutlineExclamation className="w-3 h-3" />Need MATIC for gas fees
                          </div>
                        )}
                      </div>
                    )}

                    {/* Trade Button */}
                    <button
                      onClick={handlePolymarketTrade}
                      disabled={!selectedOutcomeMarket || !amount || parseFloat(amount) <= 0 || isExecutingTrade || isLoadingQuote || geoblockStatus?.blocked || !user?.bearerToken}
                      className="w-full h-12 rounded-xl text-[15px] font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.97] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                      style={{
                        backgroundColor: tradeMode === 'buy' ? AX.green : AX.red,
                        color: '#000',
                        boxShadow: `0 4px 12px ${tradeMode === 'buy' ? 'rgba(16,185,129,0.25)' : 'rgba(244,63,94,0.25)'}`,
                      }}
                    >
                      {isExecutingTrade ? (
                        <><div className="animate-spin w-4 h-4 border-2 border-t-transparent rounded-full" style={{ borderColor: 'currentColor' }} />Processing...</>
                      ) : !user?.bearerToken ? (
                        'Log in to Trade'
                      ) : geoblockStatus?.blocked ? (
                        'Trading Unavailable'
                      ) : (
                        <>{tradeMode === 'buy' ? 'Buy' : 'Sell'} {selectedSide.toUpperCase()}{polymarketQuote?.expectedTokens && ` (${polymarketQuote.expectedTokens.toFixed(1)} shares)`}</>
                      )}
                    </button>
                  </div>

                  {/* Help Text */}
                  <p className="text-[10px] mt-1.5 text-center px-3 pb-0.5" style={{ color: AX.muted }}>
                    {!user?.bearerToken ? 'Log in to trade on Polymarket' : !polygonBalance?.hasTradingBalance ? 'Fund your Polygon wallet with USDC to trade' : 'Trades execute on Polygon via Polymarket CLOB'}
                  </p>

                  {/* Open Orders */}
                  {openOrders.length > 0 && (
                    <div className="px-4 pt-3" style={{ borderTop: `1px solid ${AX.border}` }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: AX.muted }}>Open Orders ({openOrders.length})</span>
                      </div>
                      <div className="space-y-2 pb-3">
                        {openOrders.map((order) => {
                          const isBuy = order.side === 'BUY';
                          const price = parseFloat(order.price || '0');
                          const size = parseFloat(order.original_size || order.size || '0');
                          const filled = parseFloat(order.size_matched || '0');
                          const remaining = size - filled;
                          return (
                            <div key={order.id} className="p-2.5 rounded-xl flex items-center justify-between" style={{ backgroundColor: AX.bg, border: `1px solid ${AX.border}` }}>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: isBuy ? AX.greenBg : AX.redBg, color: isBuy ? AX.green : AX.red }}>{isBuy ? 'BUY' : 'SELL'}</span>
                                  <span className="text-xs font-medium" style={{ color: AX.text, fontVariantNumeric: 'tabular-nums' }}>{remaining.toFixed(2)} @ {(price * 100).toFixed(0)}¢</span>
                                </div>
                                {filled > 0 && <span className="text-[10px]" style={{ color: AX.muted }}>{filled.toFixed(2)} filled</span>}
                              </div>
                              <button onClick={() => handleCancelOrder(order.id)} disabled={cancellingOrderId === order.id} className="px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors hover:opacity-80 disabled:opacity-50" style={{ backgroundColor: AX.redBg, color: AX.red, border: `1px solid ${AX.red}40` }}>
                                {cancellingOrderId === order.id ? '...' : 'Cancel'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Market Stats (collapsed) */}
                  <div style={{ borderTop: `1px solid ${AX.border}` }}>
                    <button onClick={() => setShowMarketStats(!showMarketStats)} className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-white/[0.02] transition-colors">
                      <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: AX.muted }}>Market Stats</span>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`transition-transform duration-200 ${showMarketStats ? 'rotate-180' : ''}`} style={{ color: AX.muted }}><path d="M6 9L1 4L11 4L6 9Z" fill="currentColor" /></svg>
                    </button>
                    {showMarketStats && (
                      <div className="px-4 pb-4 space-y-2.5">
                        <div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-wide" style={{ color: AX.muted }}>Volume</span><span className="text-[11px] font-semibold" style={{ color: AX.text, fontVariantNumeric: 'tabular-nums' }}>{formatPolymarketVolume(parseFloat(polyEvent?.volume || selectedOutcomeMarket?.volume || '0'))}</span></div>
                        <div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-wide" style={{ color: AX.muted }}>Liquidity</span><span className="text-[11px] font-semibold" style={{ color: AX.text, fontVariantNumeric: 'tabular-nums' }}>{formatPolymarketVolume(parseFloat(polyEvent?.liquidity || selectedOutcomeMarket?.liquidity || '0'))}</span></div>
                        {(polyEvent?.endDate || selectedOutcomeMarket?.endDate) && (
                          <div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-wide" style={{ color: AX.muted }}>End Date</span><span className="text-[11px] font-semibold" style={{ color: AX.text }}>{new Date(polyEvent?.endDate || selectedOutcomeMarket?.endDate || '').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span></div>
                        )}
                        <div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-wide" style={{ color: AX.muted }}>Status</span><span className="text-[11px] font-semibold" style={{ color: (polyEvent?.active ?? selectedOutcomeMarket?.active) ? AX.green : AX.red }}>{(polyEvent?.active ?? selectedOutcomeMarket?.active) ? 'Active' : 'Closed'}</span></div>
                      </div>
                    )}
                  </div>

                  {/* About This Market */}
                  <div style={{ borderTop: `1px solid ${AX.border}` }}>
                    <button onClick={() => setShowAbout(!showAbout)} className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-white/[0.02] transition-colors">
                      <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: AX.muted }}>About</span>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`transition-transform duration-200 ${showAbout ? 'rotate-180' : ''}`} style={{ color: AX.muted }}><path d="M6 9L1 4L11 4L6 9Z" fill="currentColor" /></svg>
                    </button>
                    {showAbout && (
                      <div className="px-4 pb-4">
                        <p className="text-[13px] leading-relaxed" style={{ color: AX.text, opacity: 0.85 }}>
                          {polyEvent?.description || 'No description available.'}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Resolution Criteria */}
                  <div style={{ borderTop: `1px solid ${AX.border}` }}>
                    <button onClick={() => setShowResolution(!showResolution)} className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-white/[0.02] transition-colors">
                      <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: AX.muted }}>Resolution</span>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`transition-transform duration-200 ${showResolution ? 'rotate-180' : ''}`} style={{ color: AX.muted }}><path d="M6 9L1 4L11 4L6 9Z" fill="currentColor" /></svg>
                    </button>
                    {showResolution && (
                      <div className="px-4 pb-4 space-y-2.5">
                        {(selectedOutcomeMarket?.resolvedBy || polyEvent?.markets?.[0]?.resolvedBy) && (
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase tracking-wide" style={{ color: AX.muted }}>Resolver</span>
                            <a href={`https://polygonscan.com/address/${selectedOutcomeMarket?.resolvedBy || polyEvent?.markets?.[0]?.resolvedBy}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[10px] font-mono hover:opacity-70" style={{ color: AX.purple }}>
                              {(selectedOutcomeMarket?.resolvedBy || polyEvent?.markets?.[0]?.resolvedBy || '').slice(0, 6)}...{(selectedOutcomeMarket?.resolvedBy || polyEvent?.markets?.[0]?.resolvedBy || '').slice(-4)}
                              <img src="https://polygonscan.com/assets/poly/images/svg/logos/chain-dim.svg?v=26.1.4.2" alt="Polygonscan" className="w-3 h-3" />
                            </a>
                          </div>
                        )}
                        {(selectedOutcomeMarket?.conditionId || polyEvent?.markets?.[0]?.conditionId) && (
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase tracking-wide" style={{ color: AX.muted }}>Condition</span>
                            <button onClick={() => copyToClipboard(selectedOutcomeMarket?.conditionId || polyEvent?.markets?.[0]?.conditionId || '')} className="flex items-center gap-1 text-[10px] font-mono hover:opacity-70" style={{ color: AX.cyan }}>
                              {(selectedOutcomeMarket?.conditionId || polyEvent?.markets?.[0]?.conditionId || '').slice(0, 6)}...{(selectedOutcomeMarket?.conditionId || polyEvent?.markets?.[0]?.conditionId || '').slice(-4)}
                              <BiCopy className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        <div className="pt-2 mt-1" style={{ borderTop: `1px solid ${AX.border}` }}>
                          <p className="text-[10px]" style={{ color: AX.muted }}>Resolved via UMA Optimistic Oracle on Polygon</p>
                        </div>
                        <a href={`https://polymarket.com/event/${tickerString}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] hover:underline" style={{ color: AX.mint }}>
                          View full rules on Polymarket
                          <HiOutlineExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* dFlow trade panel (unchanged logic, refined visuals) */
                <div className="p-4">
                  {user ? (
                    <div className="rounded-xl mb-4 overflow-hidden" style={{ backgroundColor: AX.bg, border: `1px solid ${AX.border}` }}>
                      <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: AX.border }}>
                        <div className="flex items-center gap-2">
                          <BiWallet className="w-4 h-4" style={{ color: AX.mint }} />
                          <span className="text-xs font-mono" style={{ color: AX.muted }}>{user.publicKey.slice(0, 4)}...{user.publicKey.slice(-4)}</span>
                        </div>
                        <button onClick={() => copyToClipboard(user.publicKey)} className="text-xs hover:opacity-70 flex items-center gap-1" style={{ color: AX.mint }}><BiCopy className="w-3 h-3" /></button>
                      </div>
                      <div className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-3">
                          <span className="text-xs" style={{ color: solBalance < 0.01 ? AX.yellow : AX.muted }}>{solBalance.toFixed(4)} SOL</span>
                          <span style={{ color: AX.border }}>|</span>
                          <span className="text-xs font-medium" style={{ color: usdcBalance > 0 ? AX.text : AX.muted }}>{(usdcBalance || 0).toFixed(2)} USDC</span>
                        </div>
                      </div>
                      {solBalance < 0.01 && (
                        <div className="px-3 pb-3"><div className="flex items-center gap-2 text-xs p-2 rounded-lg" style={{ backgroundColor: `${AX.yellow}15`, color: AX.yellow }}><HiOutlineExclamation className="w-3.5 h-3.5 flex-shrink-0" /><span>Low SOL for tx fees</span></div></div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl p-4 mb-4 text-center" style={{ backgroundColor: AX.bg, border: `1px solid ${AX.border}` }}>
                      <BiWallet className="w-6 h-6 mx-auto mb-2" style={{ color: AX.muted }} />
                      <p className="text-sm mb-1" style={{ color: AX.text }}>Connect Wallet</p>
                      <p className="text-xs" style={{ color: AX.muted }}>SOL (fees) + USDC (trade)</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2.5 mb-4">
                    <button onClick={() => setSelectedSide('yes')} className="py-2.5 rounded-lg flex items-center justify-center gap-1.5 text-[13px] font-bold transition-all hover:brightness-110 active:scale-[0.97]" style={{ backgroundColor: selectedSide === 'yes' ? AX.green : AX.greenBg, border: `1px solid ${selectedSide === 'yes' ? AX.green : AX.greenBorder}`, color: selectedSide === 'yes' ? '#000' : AX.green }}>
                      Yes {Math.round(currentYesPrice * 100)}¢
                    </button>
                    <button onClick={() => setSelectedSide('no')} className="py-2.5 rounded-lg flex items-center justify-center gap-1.5 text-[13px] font-bold transition-all hover:brightness-110 active:scale-[0.97]" style={{ backgroundColor: selectedSide === 'no' ? AX.red : AX.redBg, border: `1px solid ${selectedSide === 'no' ? AX.red : AX.redBorder}`, color: selectedSide === 'no' ? '#000' : AX.red }}>
                      No {Math.round(currentNoPrice * 100)}¢
                    </button>
                  </div>
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs" style={{ color: AX.muted }}>Amount (USDC)</span>
                      {user && usdcBalance > 0 && (<button onClick={() => setAmount(Math.floor(usdcBalance).toString())} className="text-xs hover:opacity-70" style={{ color: AX.mint }}>Max</button>)}
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: AX.muted }}>$</span>
                      <input type="number" value={amount} onChange={(e) => { setAmount(e.target.value); setTradeError(null); }} placeholder="0" className="w-full pl-7 pr-3 py-3 rounded-xl text-lg font-semibold outline-none" style={{ backgroundColor: AX.bg, border: `1px solid ${AX.border}`, color: AX.text }} />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {[10, 25, 50, 100].map((qa) => (<button key={qa} onClick={() => { setAmount(qa.toString()); setTradeError(null); }} className="py-2 rounded-xl text-sm transition-colors" style={{ backgroundColor: amount === qa.toString() ? AX.mint : AX.bg, color: amount === qa.toString() ? '#000' : AX.muted, border: `1px solid ${amount === qa.toString() ? AX.mint : AX.border}` }}>${qa}</button>))}
                  </div>
                  {amountNumber > 0 && (
                    <div className="p-3 rounded-xl mb-4 space-y-2" style={{ backgroundColor: AX.bg }}>
                      <div className="flex justify-between text-sm"><span style={{ color: AX.muted }}>You pay</span><span style={{ color: AX.text }}>{formatUSDC(amountNumber)}</span></div>
                      <div className="flex justify-between text-sm"><span style={{ color: AX.muted }}>Payout if wins</span><span style={{ color: AX.mint }}>{formatUSDC(potentialPayout)}</span></div>
                    </div>
                  )}
                  {tradeError && (<div className="flex items-center gap-2 p-2 rounded-xl mb-4" style={{ backgroundColor: AX.redBg }}><HiOutlineExclamation className="w-4 h-4" style={{ color: AX.red }} /><span className="text-xs" style={{ color: AX.red }}>{tradeError}</span></div>)}
                  <button onClick={handleSubmit} disabled={!isActive || amountNumber <= 0 || isSubmitting} className="w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.97]" style={{ backgroundColor: !isActive ? AX.bg : amountNumber > 0 ? AX.mint : AX.bg, color: !isActive ? AX.muted : amountNumber > 0 ? '#000' : AX.muted, border: `1px solid ${!isActive ? AX.border : amountNumber > 0 ? AX.mint : AX.border}`, cursor: isActive && amountNumber > 0 && !isSubmitting ? 'pointer' : 'not-allowed', opacity: isSubmitting ? 0.6 : 1 }}>
                    {isSubmitting ? (<HiOutlineRefresh className="w-5 h-5 animate-spin" />) : !isActive ? ('Market Closed') : !user ? (<><BiWallet className="w-5 h-5" />Login to Trade</>) : (<><HiOutlineLightningBolt className="w-5 h-5" />Buy {selectedSide.toUpperCase()}</>)}
                  </button>
                </div>
              )}
            </div>
          </div>{/* end RIGHT PANEL */}

          {/* Mobile trade FAB */}
          <div className="fixed bottom-0 left-0 w-full p-4 z-50 lg:hidden mb-10">
            <button className="w-full py-3.5 rounded-xl font-bold text-[15px] shadow-lg" style={{ backgroundColor: AX.green, color: '#000', boxShadow: '0 -4px 24px rgba(16,185,129,0.2)' }} onClick={() => setShowMobileTradeModal(true)}>Trade</button>
          </div>
        </div>{/* end MAIN COCKPIT */}
      </div>

      {/* Mobile Trade Modal */}
      {showMobileTradeModal && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <div className={`absolute inset-0 bg-black/70 transition-opacity duration-300 ${isClosingModal ? "opacity-0" : "opacity-100"}`} onClick={closeModal} />
          <div className={`absolute bottom-0 left-0 right-0 rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col ${isClosingModal ? "mobile-trade-modal-closing" : "mobile-trade-modal"}`} style={{ backgroundColor: AX.surface2 }}>
            <div className="flex justify-center pt-3 pb-2 cursor-grab"><div className="w-12 h-1 rounded-full" style={{ backgroundColor: AX.border }} /></div>
            <div className="flex justify-end pr-4 pb-2">
              <button onClick={closeModal} className="w-8 h-8 rounded-full flex items-center justify-center transition-colors" style={{ backgroundColor: AX.bg, color: AX.muted }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-2.5 mb-4">
                <button onClick={() => setSelectedSide('yes')} className="py-2.5 rounded-lg flex items-center justify-center gap-1.5 text-[13px] font-bold transition-all hover:brightness-110 active:scale-[0.97]" style={{ backgroundColor: selectedSide === 'yes' ? AX.green : AX.greenBg, border: `1px solid ${selectedSide === 'yes' ? AX.green : AX.greenBorder}`, color: selectedSide === 'yes' ? '#000' : AX.green }}>
                  Yes {Math.round(currentYesPrice * 100)}¢
                </button>
                <button onClick={() => setSelectedSide('no')} className="py-2.5 rounded-lg flex items-center justify-center gap-1.5 text-[13px] font-bold transition-all hover:brightness-110 active:scale-[0.97]" style={{ backgroundColor: selectedSide === 'no' ? AX.red : AX.redBg, border: `1px solid ${selectedSide === 'no' ? AX.red : AX.redBorder}`, color: selectedSide === 'no' ? '#000' : AX.red }}>
                  No {Math.round(currentNoPrice * 100)}¢
                </button>
              </div>
              <div className="relative mb-4">
                <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: AX.muted }}>$</span>
                <input type="number" value={amount} onChange={(e) => { setAmount(e.target.value); setTradeError(null); }} placeholder="0" className="w-full pl-7 pr-3 py-3 rounded-xl text-lg font-semibold outline-none" style={{ backgroundColor: AX.bg, border: `1px solid ${AX.border}`, color: AX.text }} />
              </div>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[10, 25, 50, 100].map((qa) => (<button key={qa} onClick={() => setAmount(qa.toString())} className="py-2 rounded-xl text-sm" style={{ backgroundColor: amount === qa.toString() ? AX.mint : AX.bg, color: amount === qa.toString() ? '#000' : AX.muted }}>${qa}</button>))}
              </div>
              {amountNumber > 0 && (<div className="p-3 rounded-xl mb-4 space-y-2" style={{ backgroundColor: AX.bg }}><div className="flex justify-between text-sm"><span style={{ color: AX.muted }}>Payout if wins</span><span style={{ color: AX.mint }}>{formatUSDC(potentialPayout)}</span></div></div>)}
              {tradeError && (<div className="flex items-center gap-2 p-2 rounded-xl mb-4" style={{ backgroundColor: AX.redBg }}><HiOutlineExclamation className="w-4 h-4" style={{ color: AX.red }} /><span className="text-xs" style={{ color: AX.red }}>{tradeError}</span></div>)}
              <button onClick={handleSubmit} disabled={!isActive || amountNumber <= 0 || isSubmitting} className="w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2" style={{ backgroundColor: isActive && amountNumber > 0 ? AX.mint : AX.bg, color: isActive && amountNumber > 0 ? '#000' : AX.muted, opacity: isSubmitting ? 0.6 : 1 }}>
                {isSubmitting ? (<HiOutlineRefresh className="w-5 h-5 animate-spin" />) : (<><HiOutlineLightningBolt className="w-5 h-5" />Buy {selectedSide.toUpperCase()}</>)}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />

      {/* Polygon Wallet Modal */}
      {showWalletModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }} onClick={() => setShowWalletModal(false)}>
          <div className="relative w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowWalletModal(false)} className="absolute -top-2 -right-2 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:opacity-80" style={{ backgroundColor: AX.surface, border: `1px solid ${AX.border}`, color: AX.muted }}>
              <HiOutlineX className="w-4 h-4" />
            </button>
            <PolygonWalletCard variant="expanded" initialBalance={polygonBalance} onBalanceChange={(balance) => { if (balance) setPolygonBalance(balance); }} />
          </div>
        </div>
      )}

      <style jsx global>{`
        .mobile-trade-modal { animation: slideUp 0.3s ease-out; }
        .mobile-trade-modal-closing { animation: slideDown 0.3s ease-in; }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slideDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
        @keyframes shimmer-ai { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes iridescent-flow { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        @keyframes sparkle-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(1.15) rotate(15deg); } }
      `}</style>
    </PinGate>
  );
}
