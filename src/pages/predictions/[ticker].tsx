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
} from 'react-icons/hi';
import { BiWallet, BiCopy } from 'react-icons/bi';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { useDFlowMarket, useDFlowTrades, useDFlowOrderBook, useDFlowPriceHistory, useDFlowRealtimePrices, formatVolume, formatOpenInterest, getDFlowQuote, getDFlowSwap } from '~/hooks/useDFlowMarkets';
import { usePolymarketMarket, usePolymarketOrderBook, usePolymarketPriceHistory, usePolymarketMultiPriceHistory, usePolymarketComments, usePolymarketHolders, usePolymarketActivity, formatPolymarketVolume } from '~/hooks/usePolymarketMarkets';
import type { ChartSeries } from '~/components/predictions/PolymarketChart';
import type { ChartSeriesData } from '~/components/predictions/TradingViewPredictionChart';
import type { PolymarketComment, PolymarketHolder, PolymarketActivity, PolymarketEvent, PolymarketMarket } from '~/hooks/usePolymarketMarkets';
import type { ExtendedPredictionMarket } from '~/hooks/useDFlowMarkets';
import { useUser } from '~/components/UserContext';
import { useTurnkeySigner } from '~/components/TurnkeySignerContext';
import { showEnhancedToast, updateEnhancedToast } from '~/utils/enhancedToast';
import { SourceBadge } from '~/components/predictions';

// Lazy load heavy components
const PredictionPositions = dynamic(() => import('~/components/predictions/PredictionPositions'), { ssr: false });
const TradingViewPredictionChart = dynamic(() => import('~/components/predictions/TradingViewPredictionChart'), { ssr: false });
const PolymarketChart = dynamic(() => import('~/components/predictions/PolymarketChart'), { ssr: false });
const PolymarketOrderBook = dynamic(() => import('~/components/predictions/PolymarketOrderBook'), { ssr: false });

// USDC mint on Solana
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/* ---------- AXIOM palette (matching token trade page) ---------- */
const AX = {
  bg: "#101114",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#f0f5f5",
  muted: "#9CA3AF",
  mint: "#70E0B0",
  mintHover: "#58B890",
  sell: "#FF4D7F",
  // Prediction-specific colors
  green: "#4ADE80",
  greenBg: "rgba(74, 222, 128, 0.15)",
  greenBorder: "rgba(74, 222, 128, 0.35)",
  red: "#F87171",
  redBg: "rgba(248, 113, 113, 0.15)",
  redBorder: "rgba(248, 113, 113, 0.35)",
  yellow: "#FBBF24",
  purple: "#818CF8",
  cyan: "#22D3EE",
};

// Prediction-specific tabs
const DFLOW_TABS = ['Trades', 'Positions'];
const POLYMARKET_TABS = ['Outcomes', 'Holders', 'Activity', 'Positions', 'Comments'];

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

// Prediction Header Component (similar to TradeHeader)
const PredictionHeader: React.FC<{
  market: ExtendedPredictionMarket;
  yesPrice: number;
  noPrice: number;
  source?: 'dflow' | 'polymarket';
  isMultiOutcome?: boolean;
  endDate?: string;
}> = ({ market, yesPrice, noPrice, source, isMultiOutcome, endDate }) => {
  const isActive = market.status === 'active';
  const isResolved = market.status === 'resolved';

  // Format closing date as "Jan 20, 2025"
  const formattedEndDate = endDate
    ? new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className="flex items-center justify-between py-2">
      {/* Left side - Market info */}
      <div className="flex items-center gap-3">
        <Link href="/predictions" className="flex items-center gap-1.5 text-sm hover:opacity-70" style={{ color: AX.muted }}>
          <HiOutlineArrowLeft className="w-4 h-4" />
        </Link>

        <MarketImage src={market.imageUrl} alt={market.title} size="md" />

        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm" style={{ color: AX.text }}>{market.title}</span>
            <button
              onClick={() => {
                copyToClipboard(market.ticker);
                showEnhancedToast('success', 'Copied!', { description: market.ticker, duration: 2000 });
              }}
              className="flex items-center gap-1 text-xs font-mono px-1.5 py-0.5 rounded hover:opacity-70 transition-opacity cursor-pointer"
              style={{ backgroundColor: AX.surface, color: AX.muted }}
              title="Click to copy"
            >
              {market.ticker}
              <BiCopy className="w-3 h-3" />
            </button>
            {/* Source badge */}
            {source && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider"
                style={{
                  backgroundColor: source === 'polymarket' ? `${AX.purple}20` : `${AX.green}20`,
                  color: source === 'polymarket' ? AX.purple : AX.green,
                  border: `1px solid ${source === 'polymarket' ? AX.purple : AX.green}40`,
                }}
              >
                {source === 'polymarket' ? 'Polymarket' : 'dFlow'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: AX.muted }}>
            {isResolved ? (
              <span style={{ color: market.result === 'yes' ? AX.green : AX.red }}>
                Resolved {market.result?.toUpperCase()}
              </span>
            ) : formattedEndDate ? (
              <span className="flex items-center gap-1">
                <HiOutlineClock className="w-3.5 h-3.5" />
                Closes {formattedEndDate}
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <HiOutlineClock className="w-3.5 h-3.5" />
                {formatTimeRemaining(market.closesAt)}
              </span>
            )}
            {market.subtitle && (
              <>
                <span>•</span>
                <span className="truncate max-w-[200px]">{market.subtitle}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right side - Prices (hidden for multi-outcome markets) */}
      {!isMultiOutcome && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ backgroundColor: AX.greenBg, border: `1px solid ${AX.greenBorder}` }}>
              <HiOutlineCheckCircle className="w-4 h-4" style={{ color: AX.green }} />
              <span className="text-sm font-bold" style={{ color: AX.green }}>
                YES {Math.round(yesPrice * 100)}¢
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ backgroundColor: AX.redBg, border: `1px solid ${AX.redBorder}` }}>
              <HiOutlineXCircle className="w-4 h-4" style={{ color: AX.red }} />
              <span className="text-sm font-bold" style={{ color: AX.red }}>
                NO {Math.round(noPrice * 100)}¢
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Prediction Tabs Component (similar to TradeTabs)
const PredictionTabs: React.FC<{
  tabs: string[];
  selectedTab: string;
  setSelectedTab: (tab: string) => void;
}> = ({ tabs, selectedTab, setSelectedTab }) => {
  return (
    <div className="flex gap-4 pt-2 text-xs items-center">
      {tabs.map(tab => (
        <button
          key={tab}
          className={`px-3 py-1 font-semibold ${selectedTab === tab ? 'border-b-4 border-[#70E0B0] text-white' : 'text-neutral-400'}`}
          onClick={() => setSelectedTab(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
};

// Comments Component for Polymarket - with inline filters
const CommentsSection: React.FC<{ comments: PolymarketComment[]; isLoading: boolean; eventSlug?: string }> = ({ comments, isLoading, eventSlug }) => {
  const [authorFilter, setAuthorFilter] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

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

  // Filter and sort comments
  const filteredComments = comments
    .filter(comment => {
      if (!authorFilter) return true;
      const author = (comment.profile?.name || comment.profile?.pseudonym || comment.userAddress || '').toLowerCase();
      return author.includes(authorFilter.toLowerCase());
    })
    .sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return sortDir === 'desc' ? timeB - timeA : timeA - timeB;
    });

  const hasActiveFilters = authorFilter !== '';

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
        <div className="flex-shrink-0 px-3 py-1.5 text-[10px] flex items-center justify-between" style={{ backgroundColor: AX.surface }}>
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
};

// Holders Component for Polymarket - with YES/NO tabs and column filters
const HoldersSection: React.FC<{ holders: PolymarketHolder[]; isLoading: boolean }> = ({ holders, isLoading }) => {
  const [selectedOutcome, setSelectedOutcome] = useState<'yes' | 'no'>('yes');
  const [nameFilter, setNameFilter] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

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

  const formatAmount = (amount: number): string => {
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
    return amount.toFixed(0);
  };

  // Separate holders by outcome, filter by name, and sort
  const filterAndSort = (list: PolymarketHolder[]) => {
    let filtered = list;
    if (nameFilter) {
      const q = nameFilter.toLowerCase();
      filtered = list.filter(h =>
        (h.name || h.pseudonym || h.proxyWallet || '').toLowerCase().includes(q)
      );
    }
    return filtered.sort((a, b) => sortDir === 'desc' ? b.amount - a.amount : a.amount - b.amount);
  };

  const yesHolders = holders.filter(h => h.outcome === 'yes');
  const noHolders = holders.filter(h => h.outcome === 'no');
  const displayHolders = filterAndSort(selectedOutcome === 'yes' ? yesHolders : noHolders);

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
};

// Activity Component for Polymarket - with inline column filters
const ActivitySection: React.FC<{ activities: PolymarketActivity[]; isLoading: boolean }> = ({ activities, isLoading }) => {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [nameFilter, setNameFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc'); // newest first

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

  // Filter and sort activities
  const filteredActivities = activities
    .filter(activity => {
      // Type filter (buy/sell)
      if (typeFilter !== 'all') {
        const side = activity.side?.toLowerCase() || '';
        const type = activity.type?.toLowerCase() || '';
        if (typeFilter === 'buy' && !(side === 'buy' || type === 'buy')) return false;
        if (typeFilter === 'sell' && !(side === 'sell' || type === 'sell')) return false;
      }
      // Name filter
      if (nameFilter) {
        const name = (activity.name || activity.pseudonym || activity.proxyWallet || '').toLowerCase();
        if (!name.includes(nameFilter.toLowerCase())) return false;
      }
      // Outcome filter
      if (outcomeFilter !== 'all') {
        if (activity.outcome?.toLowerCase() !== outcomeFilter) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return sortDir === 'desc' ? timeB - timeA : timeA - timeB;
    });

  const formatAmount = (amount: number | undefined): string => {
    if (!amount) return '-';
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
    if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`;
    return `$${amount.toFixed(2)}`;
  };

  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  };

  // Get user avatar (profile image or colored circle with initial)
  const getUserAvatar = (activity: PolymarketActivity) => {
    const name = activity.name || activity.pseudonym || activity.proxyWallet || 'A';
    const initial = name.charAt(0).toUpperCase();

    if (activity.profileImage) {
      return <img src={activity.profileImage} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />;
    }

    return (
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
        style={{ backgroundColor: getAvatarColor(activity.proxyWallet || name), color: '#fff' }}
      >
        {initial}
      </div>
    );
  };

  const hasActiveFilters = typeFilter !== 'all' || nameFilter || outcomeFilter !== 'all';

  return (
    <div className="h-full flex flex-col">
      {/* Compact header with column filters */}
      <div className="flex-shrink-0 flex items-center gap-4 px-3 py-2 text-[10px] border-b" style={{ borderColor: AX.border, color: AX.muted }}>
        <div className="w-8"></div>
        <div className="flex-1">
          <span className="inline-flex items-center gap-1">
            Trader
            <SearchFilter value={nameFilter} onChange={setNameFilter} placeholder="Search..." />
          </span>
        </div>
        <div className="w-14">
          <span className="inline-flex items-center gap-0.5">
            Type
            <SelectFilter
              options={[
                { value: 'all', label: 'All' },
                { value: 'buy', label: 'Buy' },
                { value: 'sell', label: 'Sell' },
              ]}
              value={typeFilter}
              onChange={setTypeFilter}
            />
          </span>
        </div>
        <div className="w-12">
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
        </div>
        <div className="w-14 text-right">
          <span className="inline-flex items-center gap-1">
            Time
            <SortToggle direction={sortDir} onToggle={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')} />
          </span>
        </div>
      </div>

      {/* Results count if filters active */}
      {hasActiveFilters && (
        <div className="flex-shrink-0 px-3 py-1.5 text-[10px] flex items-center justify-between" style={{ backgroundColor: AX.surface }}>
          <span style={{ color: AX.muted }}>{filteredActivities.length} results</span>
          <button
            onClick={() => { setTypeFilter('all'); setNameFilter(''); setOutcomeFilter('all'); }}
            className="flex items-center gap-1 hover:underline"
            style={{ color: AX.mint }}
          >
            <HiOutlineX className="w-3 h-3" /> Clear filters
          </button>
        </div>
      )}

      {/* Scrollable activity list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 pb-20 space-y-1.5">
        {filteredActivities.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm" style={{ color: AX.muted }}>No matching activities</p>
          </div>
        ) : (
          filteredActivities.map((activity, idx) => {
            const side = activity.side?.toLowerCase() || activity.type?.toLowerCase() || '';
            const isBuy = side === 'buy';
            return (
              <div
                key={activity.id || idx}
                className="flex items-center gap-2 px-2 py-2 rounded-lg"
                style={{ backgroundColor: AX.surface }}
              >
                {getUserAvatar(activity)}
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium truncate block" style={{ color: AX.text }}>
                    {activity.name || activity.pseudonym || activity.proxyWallet?.slice(0, 8) || 'Anon'}
                  </span>
                  <span className="text-[10px]" style={{ color: AX.muted }}>
                    {activity.size?.toLocaleString() || '-'} @ {activity.price ? `${(activity.price * 100).toFixed(1)}¢` : '-'}
                  </span>
                </div>
                <div className="text-center w-14">
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                    style={{
                      backgroundColor: isBuy ? AX.greenBg : AX.redBg,
                      color: isBuy ? AX.green : AX.red,
                    }}
                  >
                    {isBuy ? 'BUY' : 'SELL'}
                  </span>
                </div>
                <div className="text-center w-12">
                  <span
                    className="text-[10px] font-medium"
                    style={{ color: activity.outcome?.toLowerCase() === 'yes' ? AX.green : AX.red }}
                  >
                    {activity.outcome?.toUpperCase() || '-'}
                  </span>
                </div>
                <div className="text-right w-14">
                  <div className="text-xs font-medium" style={{ color: AX.text }}>
                    {formatAmount(activity.amount)}
                  </div>
                  <div className="text-[10px]" style={{ color: AX.muted }}>
                    {formatTime(activity.timestamp)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

// Outcomes Component for Polymarket multi-outcome markets - with inline column filters
const OutcomesSection: React.FC<{
  event: PolymarketEvent | null;
  isLoading: boolean;
  onSelectOutcome?: (marketId: string, side: 'yes' | 'no') => void;
}> = ({ event, isLoading, onSelectOutcome }) => {
  const [nameFilter, setNameFilter] = useState('');
  const [chanceSort, setChanceSort] = useState<'asc' | 'desc'>('desc');
  const [volSort, setVolSort] = useState<'asc' | 'desc' | null>(null);

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

  // Parse outcome prices from JSON string
  const parseOutcomePrices = (pricesStr: string): number[] => {
    try {
      return JSON.parse(pricesStr).map(Number);
    } catch {
      return [0.5, 0.5];
    }
  };

  // Format price as percentage
  const formatPercent = (price: number): string => {
    const pct = price * 100;
    if (pct < 1) return '<1%';
    return `${Math.round(pct)}%`;
  };

  // Format volume
  const formatVol = (vol: number | string | undefined): string => {
    const v = typeof vol === 'string' ? parseFloat(vol) : vol;
    if (!v) return '$0';
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  };

  // Filter and sort markets
  const filteredMarkets = event.markets
    .filter(market => {
      if (!nameFilter) return true;
      const name = (market.groupItemTitle || market.question || '').toLowerCase();
      return name.includes(nameFilter.toLowerCase());
    })
    .sort((a, b) => {
      // Volume sort takes priority if active
      if (volSort) {
        const volA = parseFloat(a.volume || '0');
        const volB = parseFloat(b.volume || '0');
        return volSort === 'desc' ? volB - volA : volA - volB;
      }
      // Otherwise sort by chance
      const pricesA = parseOutcomePrices(a.outcomePrices || '["0.5", "0.5"]');
      const pricesB = parseOutcomePrices(b.outcomePrices || '["0.5", "0.5"]');
      return chanceSort === 'desc' ? (pricesB[0] || 0) - (pricesA[0] || 0) : (pricesA[0] || 0) - (pricesB[0] || 0);
    });

  const hasActiveFilters = nameFilter !== '';

  return (
    <div className="h-full flex flex-col">
      {/* Header row with column filters */}
      <div className="flex-shrink-0 flex items-center gap-3 px-3 py-2 text-[10px] border-b" style={{ borderColor: AX.border, color: AX.muted }}>
        <div className="flex-1">
          <span className="inline-flex items-center gap-1">
            Outcome
            <SearchFilter value={nameFilter} onChange={setNameFilter} placeholder="Search..." />
          </span>
        </div>
        <div className="w-14 text-center">
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
          </span>
        </div>
        <div className="w-14 text-center">
          <span className="inline-flex items-center gap-0.5">
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
        <div className="w-32 text-center">Trade</div>
      </div>

      {/* Results count if filters active */}
      {hasActiveFilters && (
        <div className="flex-shrink-0 px-3 py-1.5 text-[10px] flex items-center justify-between" style={{ backgroundColor: AX.surface }}>
          <span style={{ color: AX.muted }}>{filteredMarkets.length} of {event.markets.length} outcomes</span>
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
      <div className="flex-1 overflow-y-auto p-3 pb-20 space-y-2">
        {filteredMarkets.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm" style={{ color: AX.muted }}>No matching outcomes</p>
          </div>
        ) : (
          filteredMarkets.map((market) => {
            const prices = parseOutcomePrices(market.outcomePrices || '["0.5", "0.5"]');
            const yesPrice = prices[0] || 0.5;
            const noPrice = prices[1] || 0.5;
            const yesPriceCents = Math.round(yesPrice * 100 * 10) / 10;
            const noPriceCents = Math.round(noPrice * 100 * 10) / 10;

            return (
              <div
                key={market.id}
                className="flex items-center gap-3 p-2.5 rounded-lg"
                style={{ backgroundColor: AX.surface }}
              >
                {/* Outcome image and name */}
                <div className="flex-1 flex items-center gap-2 min-w-0">
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
                    <div className="font-medium text-xs truncate" style={{ color: AX.text }}>
                      {market.groupItemTitle || market.question || 'Outcome'}
                    </div>
                    <div className="text-[10px]" style={{ color: AX.muted }}>
                      {formatVol(market.volume)} Vol.
                    </div>
                  </div>
                </div>

                {/* Percentage chance */}
                <div className="w-14 text-center">
                  <span className="text-base font-semibold" style={{ color: AX.text }}>
                    {formatPercent(yesPrice)}
                  </span>
                </div>

                {/* Buy Yes / Buy No buttons */}
                <div className="w-32 flex gap-1.5">
                  <button
                    onClick={() => onSelectOutcome?.(market.id, 'yes')}
                    className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium transition-all hover:opacity-90"
                    style={{ backgroundColor: AX.greenBg, color: AX.green }}
                  >
                    Yes {yesPriceCents.toFixed(0)}¢
                  </button>
                  <button
                    onClick={() => onSelectOutcome?.(market.id, 'no')}
                    className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium transition-all hover:opacity-90"
                    style={{ backgroundColor: AX.redBg, color: AX.red }}
                  >
                    No {noPriceCents.toFixed(0)}¢
                  </button>
                </div>
              </div>
            );
          })
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
};

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
  const { ticker, source } = router.query;
  const tickerString = typeof ticker === 'string' ? ticker : '';
  // TODO: dFlow is disabled for now - only Polymarket is active
  // const isPolymarket = source === 'polymarket';
  const isPolymarket = true; // Force Polymarket only

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

  // Collapsible sections in trade panel (all open by default)
  const [showMarketStats, setShowMarketStats] = useState(true);
  const [showAbout, setShowAbout] = useState(true);
  const [showResolution, setShowResolution] = useState(true);

  // Ref to track if we've auto-selected best outcome
  const hasAutoSelectedRef = useRef(false);

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
  const { user, solBalance, usdcBalance, refreshBalance } = useUser();
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

  // Polymarket hooks (only when source=polymarket AND router is ready)
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

  // Fetch orderbooks for both YES and NO tokens
  const { orderBook: polyYesOrderBook } = usePolymarketOrderBook(polyTokenIds.yes, { refreshInterval: 5000 });
  const { orderBook: polyNoOrderBook } = usePolymarketOrderBook(polyTokenIds.no, { refreshInterval: 5000 });

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
    { interval: 'max', fidelity: 60, refreshInterval: 60000, enabled: isMultiOutcomeMarket && !!multiOutcomeMarketInfo }
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
    if (!isPolymarket || !polyMarket) return undefined;
    const polyData = (polyMarket as any).polymarketData;
    return polyData?.conditionId;
  }, [isPolymarket, polyMarket]);

  // Polymarket comments, holders, and activity
  const { comments, isLoading: commentsLoading } = usePolymarketComments(polyEventId, { enabled: isPolymarket });
  const { holders, isLoading: holdersLoading } = usePolymarketHolders(polyConditionId, { limit: 100, enabled: isPolymarket });
  const { activities, isLoading: activityLoading } = usePolymarketActivity(polyConditionId, { limit: 50, enabled: isPolymarket });

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

  // Transform price history for the chart (use appropriate source based on market type)
  // IMPORTANT: Chart expects timestamps in MILLISECONDS
  const chartPriceHistory = useMemo(() => {
    if (isPolymarket) {
      // Use Polymarket price history
      // Polymarket returns timestamps in SECONDS, convert to milliseconds
      if (polyPriceHistory.length > 0) {
        return polyPriceHistory.map(p => ({
          time: p.timestamp * 1000, // Convert seconds to milliseconds
          price: p.price,
        }));
      }
      return undefined;
    } else {
      // Use dFlow price history (already in correct format)
      if (priceHistory.length > 0) {
        return priceHistory.map(p => ({ time: p.timestamp, price: p.yesPrice }));
      }
      return undefined;
    }
  }, [isPolymarket, polyPriceHistory, priceHistory]);

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
  const orderBookForChart = useMemo(() => {
    if (isPolymarket) {
      // Use Polymarket orderbook data
      // Transform from { bids, asks } to { yesBids, yesAsks, noBids, noAsks }
      if (!polyYesOrderBook && !polyNoOrderBook) return null;

      return {
        yesBids: polyYesOrderBook?.bids || [],
        yesAsks: polyYesOrderBook?.asks || [],
        noBids: polyNoOrderBook?.bids || [],
        noAsks: polyNoOrderBook?.asks || [],
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

  return (
    <>
      <Head><title>{pageTitle}</title></Head>

      <div
        className="min-h-screen w-full flex flex-col overflow-y-auto"
        style={{
          backgroundColor: "#0f1012",
          color: AX.text,
          fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Inter\", system-ui, sans-serif",
        }}
      >
        <Header search={search} setSearch={setSearch} />

        <div
          className="flex flex-1 w-full max-w-full min-h-0"
          style={{
            minHeight: 'calc(100vh - 60px)',
            flex: '1 1 auto',
          }}
        >
          {/* LEFT: chart + tabs */}
          <div
            ref={containerRef}
            className="flex-1 min-w-0 max-w-full flex flex-col pb-0"
            style={{
              borderRight: `1px solid ${AX.border}`,
              minHeight: 0,
            }}
          >
            {/* TOP pane - Chart */}
            <div
              className="flex-shrink-0 flex flex-col"
              style={{
                height: topPanePx,
                minHeight: `${MIN_CHART_HEIGHT}px`,
                transition: isResizing ? 'none' : 'height 0.2s ease-out',
                willChange: isResizing ? 'height' : 'auto',
              }}
            >
              <div className="px-3 flex-shrink-0">
                <PredictionHeader
                  market={market}
                  yesPrice={currentYesPrice}
                  noPrice={currentNoPrice}
                  source={isPolymarket ? 'polymarket' : 'dflow'}
                  isMultiOutcome={isMultiOutcomeMarket}
                  endDate={polyEvent?.endDate || selectedOutcomeMarket?.endDate}
                />
              </div>

              {/* Separator line */}
              <div className="px-3 border-b border-[#2A2B33]" style={{ marginTop: '2px' }} />

              {/* Chart with inline Order Book - flex row layout */}
              <div
                className="flex-1 min-h-[200px] flex w-full overflow-hidden"
                style={{ height: '100%', width: '100%', minHeight: 0, minWidth: 0 }}
              >
                {/* Chart area - takes remaining space, full height */}
                <div className="flex-1 relative min-w-0 h-full" style={{ minHeight: 0 }}>
                {/* Show loading while fetching price history (from either dFlow or Polymarket) */}
                {chartHistoryLoading ? (
                  <div key="chart-loading" className="flex items-center justify-center h-full" style={{ backgroundColor: AX.bg }}>
                    <HiOutlineRefresh className="w-5 h-5 animate-spin" style={{ color: AX.muted }} />
                  </div>
                ) : isPolymarket && isMultiOutcomeMarket ? (
                  /* Use TradingView advanced chart for multi-outcome Polymarket markets */
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
                  /* Use TradingView chart for single-outcome Polymarket markets (line chart) */
                  <TradingViewPredictionChart
                    key={`tv-poly-${tickerString}`}
                    ticker={tickerString}
                    marketTitle={market.title}
                    yesPrice={currentYesPrice}
                    noPrice={currentNoPrice}
                    height="100%"
                    priceHistory={chartPriceHistory}
                    showOrderBook={false} /* Use separate PolymarketOrderBook instead */
                    useLineChart={true} /* Line chart like multi-outcome markets */
                    isResolved={isResolved}
                    resolvedResult={market.result as 'yes' | 'no' | null}
                  />
                ) : (
                  /* Use TradingView chart for dFlow markets */
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

                {/* Polymarket Real-time Order Book - inline flex item on the right */}
                {/* Hide order book for resolved/closed markets - Polymarket deactivates CLOB when market closes */}
                {isPolymarket && polyTokenIds.yes && !isResolved && !(selectedOutcomeMarket as any)?.closed && (
                  <PolymarketOrderBook
                    yesTokenId={polyTokenIds.yes}
                    noTokenId={polyTokenIds.no}
                    marketTitle={market.title}
                    defaultOpen={true}
                  />
                )}
              </div>
            </div>

            {/* Resizer */}
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize chart and content panels"
              tabIndex={0}
              onPointerDown={(e) => {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                const startY = e.clientY;
                const startTop = topPanePxRef.current;
                (e.target as Element).setPointerCapture(e.pointerId);
                setIsResizing(true);
                document.body.style.cursor = "row-resize";
                document.body.style.userSelect = "none";

                const onMove = (ev: PointerEvent) => {
                  ev.preventDefault();
                  const delta = ev.clientY - startY;
                  const newHeight = clampTop(startTop + delta);
                  setTopPanePx(newHeight);
                  topPanePxRef.current = newHeight;
                };

                const onUp = () => {
                  (e.target as Element).releasePointerCapture(e.pointerId);
                  setIsResizing(false);
                  document.body.style.cursor = "";
                  document.body.style.userSelect = "";
                  (e.target as Element).removeEventListener("pointermove", onMove);
                  (e.target as Element).removeEventListener("pointerup", onUp);
                  (e.target as Element).removeEventListener("pointercancel", onUp);
                };

                (e.target as Element).addEventListener("pointermove", onMove, { passive: false });
                (e.target as Element).addEventListener("pointerup", onUp, { passive: false });
                (e.target as Element).addEventListener("pointercancel", onUp, { passive: false });
              }}
              className="relative h-1.5 cursor-row-resize select-none touch-none flex-shrink-0 flex items-center justify-center hover:bg-gray-800/20 transition-colors"
              style={{ touchAction: "none", zIndex: 10, pointerEvents: "auto" }}
            >
              <div className="flex items-center gap-0.5">
                <div className="w-0.5 h-0.5 rounded-full bg-gray-500" />
                <div className="w-0.5 h-0.5 rounded-full bg-gray-500" />
                <div className="w-0.5 h-0.5 rounded-full bg-gray-500" />
              </div>
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-gray-700/20" />
            </div>

            {/* BOTTOM pane (tabs + content) */}
            <div className="flex-1 flex flex-col min-h-[400px]">
              <div className="flex-shrink-0 px-3">
                <PredictionTabs
                  tabs={isPolymarket ? POLYMARKET_TABS : DFLOW_TABS}
                  selectedTab={selectedTab}
                  setSelectedTab={setSelectedTab}
                />
              </div>
              <div className="flex-1 min-h-[300px] overflow-auto pb-20">
                {/* dFlow: Trades tab */}
                <div className={`flex flex-col h-full ${selectedTab === "Trades" ? "" : "hidden"}`}>
                  <TradesTable trades={trades || []} isLoading={tradesLoading} />
                </div>
                {/* Polymarket: Activity tab */}
                <div className={`flex flex-col h-full ${selectedTab === "Activity" ? "" : "hidden"}`}>
                  <ActivitySection activities={activities || []} isLoading={activityLoading} />
                </div>
                {/* Polymarket: Outcomes tab (for multi-outcome markets) */}
                <div className={`flex flex-col h-full ${selectedTab === "Outcomes" ? "" : "hidden"}`}>
                  <OutcomesSection
                    event={polyEvent || null}
                    isLoading={polyLoading}
                    onSelectOutcome={(marketId, side) => {
                      // Find the market by ID and set it as selected
                      const selectedMkt = polyEvent?.markets?.find(m => m.id === marketId);
                      if (selectedMkt) {
                        setSelectedOutcomeMarket(selectedMkt);
                        setSelectedSide(side);
                        setTradeMode('buy');
                        setAmount('');
                      }
                    }}
                  />
                </div>
                {/* Polymarket: Comments tab */}
                <div className={`flex flex-col h-full ${selectedTab === "Comments" ? "" : "hidden"}`}>
                  <CommentsSection comments={comments || []} isLoading={commentsLoading} eventSlug={tickerString} />
                </div>
                {/* Polymarket: Holders tab */}
                <div className={`flex flex-col h-full ${selectedTab === "Holders" ? "" : "hidden"}`}>
                  <HoldersSection holders={holders || []} isLoading={holdersLoading} />
                </div>
                {/* Both: Positions tab */}
                <div className={`flex flex-col h-full ${selectedTab === "Positions" ? "" : "hidden"}`}>
                  <React.Suspense fallback={<div className="flex items-center justify-center h-full"><HiOutlineRefresh className="w-5 h-5 animate-spin" style={{ color: AX.muted }} /></div>}>
                    <PredictionPositions userPublicKey={user?.publicKey} />
                  </React.Suspense>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Trade Action Panel */}
          <div className="flex-shrink-0 min-w-[260px] basis-[280px] md:basis-[310px] lg:basis-[330px] hidden lg:flex flex-col">
            <div className="px-3 py-2 flex-1 overflow-auto">
              {/* Polymarket Trade Panel */}
              {isPolymarket ? (
                <div>
                    {/* Selected Outcome Header */}
                    {selectedOutcomeMarket ? (
                      <div className="flex items-center gap-3 mb-4">
                        {(selectedOutcomeMarket.image || selectedOutcomeMarket.icon) ? (
                          <img
                            src={selectedOutcomeMarket.image || selectedOutcomeMarket.icon}
                            alt=""
                            className="w-12 h-12 rounded-xl object-cover"
                          />
                        ) : (
                          <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold"
                            style={{ backgroundColor: getAvatarColor(selectedOutcomeMarket.groupItemTitle || 'O'), color: '#fff' }}
                          >
                            {(selectedOutcomeMarket.groupItemTitle || 'O').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm truncate" style={{ color: AX.text }}>
                            {selectedOutcomeMarket.groupItemTitle || selectedOutcomeMarket.question || 'Selected Outcome'}
                          </h3>
                          <button
                            onClick={() => setSelectedOutcomeMarket(null)}
                            className="text-[10px] hover:underline"
                            style={{ color: AX.muted }}
                          >
                            Change outcome
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-3 mb-4 rounded-lg" style={{ backgroundColor: AX.bg }}>
                        <p className="text-xs" style={{ color: AX.muted }}>
                          Select an outcome from the Outcomes tab
                        </p>
                      </div>
                    )}

                    {/* Buy / Sell Toggle */}
                    <div className="mb-4">
                      <div className="relative h-9 rounded-lg overflow-hidden" style={{ backgroundColor: AX.bg, border: `1px solid ${AX.border}` }}>
                        {/* Sliding highlight */}
                        <div
                          className="absolute top-0 left-0 h-full w-1/2 rounded-md transition-transform duration-200"
                          style={{
                            transform: tradeMode === 'sell' ? 'translateX(100%)' : 'translateX(0%)',
                            background: tradeMode === 'buy' ? AX.green : AX.red,
                          }}
                        />
                        {/* Buttons */}
                        <div className="relative z-10 grid grid-cols-2 h-full">
                          <button
                            onClick={() => setTradeMode('buy')}
                            className="flex items-center justify-center h-full text-sm font-semibold cursor-pointer select-none transition-colors"
                            style={{ color: tradeMode === 'buy' ? '#000' : AX.muted }}
                          >
                            Buy
                          </button>
                          <button
                            onClick={() => setTradeMode('sell')}
                            className="flex items-center justify-center h-full text-sm font-semibold cursor-pointer select-none transition-colors"
                            style={{ color: tradeMode === 'sell' ? '#fff' : AX.muted }}
                          >
                            Sell
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Yes / No Buttons */}
                    {(() => {
                      // Parse prices from selected outcome - use SAME formula as OutcomesSection
                      let yesPrice = currentYesPrice;
                      let noPrice = currentNoPrice;
                      if (selectedOutcomeMarket?.outcomePrices) {
                        try {
                          const prices = JSON.parse(selectedOutcomeMarket.outcomePrices).map(Number);
                          yesPrice = prices[0] || 0.5;
                          noPrice = prices[1] || 0.5;
                        } catch {}
                      }
                      // Same calculation as OutcomesSection: Math.round(price * 100 * 10) / 10, then .toFixed(0)
                      const yesPriceCents = Math.round(yesPrice * 100 * 10) / 10;
                      const noPriceCents = Math.round(noPrice * 100 * 10) / 10;
                      return (
                        <div className="grid grid-cols-2 gap-2 mb-4">
                          <button
                            onClick={() => setSelectedSide('yes')}
                            className="py-3 rounded-lg flex items-center justify-center gap-2 transition-all"
                            style={{
                              backgroundColor: selectedSide === 'yes' ? AX.green : AX.bg,
                              border: `2px solid ${selectedSide === 'yes' ? AX.green : AX.border}`,
                              color: selectedSide === 'yes' ? '#000' : AX.green,
                            }}
                          >
                            <span className="font-bold">Yes</span>
                            <span className="text-sm">{yesPriceCents.toFixed(0)}¢</span>
                          </button>
                          <button
                            onClick={() => setSelectedSide('no')}
                            className="py-3 rounded-lg flex items-center justify-center gap-2 transition-all"
                            style={{
                              backgroundColor: selectedSide === 'no' ? AX.red : AX.bg,
                              border: `2px solid ${selectedSide === 'no' ? AX.red : AX.border}`,
                              color: selectedSide === 'no' ? '#fff' : AX.muted,
                            }}
                          >
                            <span className="font-bold">No</span>
                            <span className="text-sm">{noPriceCents.toFixed(0)}¢</span>
                          </button>
                        </div>
                      );
                    })()}

                    {/* Amount Input */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs" style={{ color: AX.muted }}>Amount</span>
                        <span className="text-xl font-bold" style={{ color: AX.text }}>
                          ${amount || '0'}
                        </span>
                      </div>
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-3 rounded-lg text-lg font-semibold outline-none text-center"
                        style={{ backgroundColor: AX.bg, border: `1px solid ${AX.border}`, color: AX.text }}
                      />
                    </div>

                    {/* Quick Amount Buttons */}
                    <div className="flex gap-2 mb-4">
                      {[1, 20, 100].map((qa) => (
                        <button
                          key={qa}
                          onClick={() => setAmount(prev => String((parseFloat(prev) || 0) + qa))}
                          className="flex-1 py-2 rounded-lg text-xs font-medium transition-colors"
                          style={{ backgroundColor: AX.bg, color: AX.text, border: `1px solid ${AX.border}` }}
                        >
                          +${qa}
                        </button>
                      ))}
                      <button
                        onClick={() => setAmount('1000')}
                        className="flex-1 py-2 rounded-lg text-xs font-medium transition-colors"
                        style={{ backgroundColor: AX.bg, color: AX.text, border: `1px solid ${AX.border}` }}
                      >
                        Max
                      </button>
                    </div>

                    {/* Trade Button - Links to Polymarket */}
                    <a
                      href={selectedOutcomeMarket
                        ? `https://polymarket.com/event/${tickerString}?tid=${selectedOutcomeMarket.id}`
                        : `https://polymarket.com/event/${tickerString}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all"
                      style={{
                        backgroundColor: tradeMode === 'buy' ? AX.green : AX.red,
                        color: tradeMode === 'buy' ? '#000' : '#fff',
                        opacity: !selectedOutcomeMarket || !amount ? 0.5 : 1,
                      }}
                    >
                      {tradeMode === 'buy' ? 'Buy' : 'Sell'} {selectedSide.toUpperCase()} on Polymarket
                      <HiOutlineExternalLink className="w-4 h-4" />
                    </a>

                    <p className="text-[10px] mt-3 text-center" style={{ color: AX.muted }}>
                      Requires Polygon wallet on Polymarket
                    </p>

                    {/* Market Stats Section */}
                    <div className="mt-4 border-t" style={{ borderColor: AX.border }}>
                      <button
                        onClick={() => setShowMarketStats(!showMarketStats)}
                        className="w-full flex items-center justify-between py-2 hover:opacity-80 transition-opacity"
                      >
                        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: AX.muted }}>
                          Market Stats
                        </span>
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                          className={`transition-transform ${showMarketStats ? 'rotate-180' : ''}`}
                          style={{ color: AX.muted }}
                        >
                          <path d="M6 9L1 4L11 4L6 9Z" fill="currentColor" />
                        </svg>
                      </button>
                      {showMarketStats && (
                        <div className="pb-3 space-y-2">
                          {/* Volume */}
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase tracking-wide" style={{ color: AX.muted }}>Volume</span>
                            <span className="text-[11px] font-semibold" style={{ color: AX.text }}>
                              {formatPolymarketVolume(parseFloat(polyEvent?.volume || selectedOutcomeMarket?.volume || '0'))}
                            </span>
                          </div>
                          {/* Liquidity */}
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase tracking-wide" style={{ color: AX.muted }}>Liquidity</span>
                            <span className="text-[11px] font-semibold" style={{ color: AX.text }}>
                              {formatPolymarketVolume(parseFloat(polyEvent?.liquidity || selectedOutcomeMarket?.liquidity || '0'))}
                            </span>
                          </div>
                          {/* End Date */}
                          {(polyEvent?.endDate || selectedOutcomeMarket?.endDate) && (
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] uppercase tracking-wide" style={{ color: AX.muted }}>End Date</span>
                              <span className="text-[11px] font-semibold" style={{ color: AX.text }}>
                                {new Date(polyEvent?.endDate || selectedOutcomeMarket?.endDate || '').toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                            </div>
                          )}
                          {/* Status */}
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase tracking-wide" style={{ color: AX.muted }}>Status</span>
                            <span
                              className="text-[11px] font-semibold"
                              style={{ color: (polyEvent?.active ?? selectedOutcomeMarket?.active) ? AX.green : AX.red }}
                            >
                              {(polyEvent?.active ?? selectedOutcomeMarket?.active) ? 'Active' : 'Closed'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* About Section */}
                    <div className="border-t" style={{ borderColor: AX.border }}>
                      <button
                        onClick={() => setShowAbout(!showAbout)}
                        className="w-full flex items-center justify-between py-2 hover:opacity-80 transition-opacity"
                      >
                        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: AX.muted }}>
                          About
                        </span>
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                          className={`transition-transform ${showAbout ? 'rotate-180' : ''}`}
                          style={{ color: AX.muted }}
                        >
                          <path d="M6 9L1 4L11 4L6 9Z" fill="currentColor" />
                        </svg>
                      </button>
                      {showAbout && (
                        <div className="pb-3">
                          <p className="text-[11px] leading-relaxed" style={{ color: AX.text }}>
                            {polyEvent?.description || 'No description available.'}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Resolution Section */}
                    <div className="border-t" style={{ borderColor: AX.border }}>
                      <button
                        onClick={() => setShowResolution(!showResolution)}
                        className="w-full flex items-center justify-between py-2 hover:opacity-80 transition-opacity"
                      >
                        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: AX.muted }}>
                          Resolution
                        </span>
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                          className={`transition-transform ${showResolution ? 'rotate-180' : ''}`}
                          style={{ color: AX.muted }}
                        >
                          <path d="M6 9L1 4L11 4L6 9Z" fill="currentColor" />
                        </svg>
                      </button>
                      {showResolution && (
                        <div className="pb-3 space-y-2">
                          {/* Resolver Contract - link to Polygonscan */}
                          {(selectedOutcomeMarket?.resolvedBy || polyEvent?.markets?.[0]?.resolvedBy) && (
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] uppercase tracking-wide" style={{ color: AX.muted }}>Resolver</span>
                              <a
                                href={`https://polygonscan.com/address/${selectedOutcomeMarket?.resolvedBy || polyEvent?.markets?.[0]?.resolvedBy}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-[11px] font-mono hover:opacity-70"
                                style={{ color: AX.purple }}
                              >
                                {(selectedOutcomeMarket?.resolvedBy || polyEvent?.markets?.[0]?.resolvedBy || '').slice(0, 6)}...{(selectedOutcomeMarket?.resolvedBy || polyEvent?.markets?.[0]?.resolvedBy || '').slice(-4)}
                                <HiOutlineExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          )}
                          {/* Condition ID */}
                          {(selectedOutcomeMarket?.conditionId || polyEvent?.markets?.[0]?.conditionId) && (
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] uppercase tracking-wide" style={{ color: AX.muted }}>Condition</span>
                              <button
                                onClick={() => copyToClipboard(selectedOutcomeMarket?.conditionId || polyEvent?.markets?.[0]?.conditionId || '')}
                                className="flex items-center gap-1 text-[11px] font-mono hover:opacity-70"
                                style={{ color: AX.cyan }}
                              >
                                {(selectedOutcomeMarket?.conditionId || polyEvent?.markets?.[0]?.conditionId || '').slice(0, 6)}...{(selectedOutcomeMarket?.conditionId || polyEvent?.markets?.[0]?.conditionId || '').slice(-4)}
                                <BiCopy className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                          {/* UMA Oracle info */}
                          <div className="pt-2 mt-1" style={{ borderTop: `1px solid ${AX.border}` }}>
                            <p className="text-[10px]" style={{ color: AX.muted }}>
                              Resolved via UMA Optimistic Oracle on Polygon
                            </p>
                          </div>
                          {/* Link to full rules on Polymarket */}
                          <a
                            href={`https://polymarket.com/event/${tickerString}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] hover:underline"
                            style={{ color: AX.mint }}
                          >
                            View full rules on Polymarket
                            <HiOutlineExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                {/* Wallet & Balances */}
                {user ? (
                  <div className="rounded-lg mb-4 overflow-hidden" style={{ backgroundColor: AX.bg, border: `1px solid ${AX.border}` }}>
                    <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: AX.border }}>
                      <div className="flex items-center gap-2">
                        <BiWallet className="w-4 h-4" style={{ color: AX.mint }} />
                        <span className="text-xs font-mono" style={{ color: AX.muted }}>
                          {user.publicKey.slice(0, 4)}...{user.publicKey.slice(-4)}
                        </span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(user.publicKey)}
                        className="text-xs hover:opacity-70 flex items-center gap-1"
                        style={{ color: AX.mint }}
                      >
                        <BiCopy className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xs" style={{ color: solBalance < 0.01 ? AX.yellow : AX.muted }}>
                          {solBalance.toFixed(4)} SOL
                        </span>
                        <span style={{ color: AX.border }}>•</span>
                        <span className="text-xs font-medium" style={{ color: usdcBalance > 0 ? AX.text : AX.muted }}>
                          {(usdcBalance || 0).toFixed(2)} USDC
                        </span>
                      </div>
                    </div>
                    {(solBalance < 0.01 || usdcBalance < 1) && (
                      <div className="px-3 pb-3">
                        {solBalance < 0.01 && (
                          <div className="flex items-center gap-2 text-xs p-2 rounded" style={{ backgroundColor: `${AX.yellow}15`, color: AX.yellow }}>
                            <HiOutlineExclamation className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>Low SOL for tx fees</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg p-4 mb-4 text-center" style={{ backgroundColor: AX.bg, border: `1px solid ${AX.border}` }}>
                    <BiWallet className="w-6 h-6 mx-auto mb-2" style={{ color: AX.muted }} />
                    <p className="text-sm mb-1" style={{ color: AX.text }}>Connect Wallet</p>
                    <p className="text-xs" style={{ color: AX.muted }}>SOL (fees) + USDC (trade)</p>
                  </div>
                )}

                {/* Side Selection */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <button
                    onClick={() => setSelectedSide('yes')}
                    className="py-3 rounded-lg flex items-center justify-center gap-2 transition-all"
                    style={{
                      backgroundColor: selectedSide === 'yes' ? AX.greenBg : AX.bg,
                      border: `2px solid ${selectedSide === 'yes' ? AX.green : AX.border}`,
                    }}
                  >
                    <HiOutlineCheckCircle className="w-5 h-5" style={{ color: AX.green }} />
                    <span className="font-bold" style={{ color: AX.green }}>YES</span>
                    <span className="text-sm" style={{ color: AX.green }}>{Math.round(currentYesPrice * 100)}¢</span>
                  </button>
                  <button
                    onClick={() => setSelectedSide('no')}
                    className="py-3 rounded-lg flex items-center justify-center gap-2 transition-all"
                    style={{
                      backgroundColor: selectedSide === 'no' ? AX.redBg : AX.bg,
                      border: `2px solid ${selectedSide === 'no' ? AX.red : AX.border}`,
                    }}
                  >
                    <HiOutlineXCircle className="w-5 h-5" style={{ color: AX.red }} />
                    <span className="font-bold" style={{ color: AX.red }}>NO</span>
                    <span className="text-sm" style={{ color: AX.red }}>{Math.round(currentNoPrice * 100)}¢</span>
                  </button>
                </div>

                {/* Amount Input */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs" style={{ color: AX.muted }}>Amount (USDC)</span>
                    {user && usdcBalance > 0 && (
                      <button
                        onClick={() => setAmount(Math.floor(usdcBalance).toString())}
                        className="text-xs hover:opacity-70"
                        style={{ color: AX.mint }}
                      >
                        Max
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: AX.muted }}>$</span>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => { setAmount(e.target.value); setTradeError(null); }}
                      placeholder="0"
                      className="w-full pl-7 pr-3 py-3 rounded-lg text-lg font-semibold outline-none"
                      style={{ backgroundColor: AX.bg, border: `1px solid ${AX.border}`, color: AX.text }}
                    />
                  </div>
                </div>

                {/* Quick amounts */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {[10, 25, 50, 100].map((qa) => (
                    <button
                      key={qa}
                      onClick={() => { setAmount(qa.toString()); setTradeError(null); }}
                      className="py-2 rounded-lg text-sm transition-colors"
                      style={{
                        backgroundColor: amount === qa.toString() ? AX.mint : AX.bg,
                        color: amount === qa.toString() ? '#000' : AX.muted,
                        border: `1px solid ${amount === qa.toString() ? AX.mint : AX.border}`,
                      }}
                    >
                      ${qa}
                    </button>
                  ))}
                </div>

                {/* Payout Preview */}
                {amountNumber > 0 && (
                  <div className="p-3 rounded-lg mb-4 space-y-2" style={{ backgroundColor: AX.bg }}>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: AX.muted }}>You pay</span>
                      <span style={{ color: AX.text }}>{formatUSDC(amountNumber)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: AX.muted }}>Payout if wins</span>
                      <span style={{ color: AX.mint }}>{formatUSDC(potentialPayout)}</span>
                    </div>
                  </div>
                )}

                {/* Error */}
                {tradeError && (
                  <div className="flex items-center gap-2 p-2 rounded-lg mb-4" style={{ backgroundColor: AX.redBg }}>
                    <HiOutlineExclamation className="w-4 h-4" style={{ color: AX.red }} />
                    <span className="text-xs" style={{ color: AX.red }}>{tradeError}</span>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  onClick={handleSubmit}
                  disabled={!isActive || amountNumber <= 0 || isSubmitting}
                  className="w-full py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all"
                  style={{
                    backgroundColor: !isActive ? AX.bg : amountNumber > 0 ? AX.mint : AX.bg,
                    color: !isActive ? AX.muted : amountNumber > 0 ? '#000' : AX.muted,
                    border: `1px solid ${!isActive ? AX.border : amountNumber > 0 ? AX.mint : AX.border}`,
                    cursor: isActive && amountNumber > 0 && !isSubmitting ? 'pointer' : 'not-allowed',
                    opacity: isSubmitting ? 0.6 : 1,
                  }}
                >
                  {isSubmitting ? (
                    <HiOutlineRefresh className="w-5 h-5 animate-spin" />
                  ) : !isActive ? (
                    'Market Closed'
                  ) : !user ? (
                    <>
                      <BiWallet className="w-5 h-5" />
                      Login to Trade
                    </>
                  ) : (
                    <>
                      <HiOutlineLightningBolt className="w-5 h-5" />
                      Buy {selectedSide.toUpperCase()}
                    </>
                  )}
                </button>
                  </>
                )}

            </div>
          </div>

          {/* Trade button for mobile */}
          <div className="fixed bottom-0 left-0 w-full p-4 z-50 lg:hidden mb-10">
            <button
              className="w-full py-3 rounded-lg font-semibold"
              style={{ backgroundColor: AX.mint, color: '#000' }}
              onClick={() => setShowMobileTradeModal(true)}
            >
              Trade
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Trade Modal */}
      {showMobileTradeModal && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <div
            className={`absolute inset-0 bg-black/70 transition-opacity duration-300 ${isClosingModal ? "opacity-0" : "opacity-100"}`}
            onClick={closeModal}
          />
          <div
            className={`absolute bottom-0 left-0 right-0 rounded-t-xl shadow-2xl max-h-[85vh] flex flex-col ${isClosingModal ? "mobile-trade-modal-closing" : "mobile-trade-modal"}`}
            style={{ backgroundColor: AX.bg }}
          >
            <div className="flex justify-center pt-3 pb-2 cursor-grab">
              <div className="w-12 h-1 rounded-full" style={{ backgroundColor: AX.border }} />
            </div>
            <div className="flex justify-end pr-4 pb-2">
              <button
                onClick={closeModal}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                style={{ backgroundColor: AX.surface, color: AX.muted }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {/* Mobile trade form - similar to desktop */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  onClick={() => setSelectedSide('yes')}
                  className="py-3 rounded-lg flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: selectedSide === 'yes' ? AX.greenBg : AX.surface,
                    border: `2px solid ${selectedSide === 'yes' ? AX.green : AX.border}`,
                  }}
                >
                  <HiOutlineCheckCircle className="w-5 h-5" style={{ color: AX.green }} />
                  <span className="font-bold" style={{ color: AX.green }}>YES {Math.round(currentYesPrice * 100)}¢</span>
                </button>
                <button
                  onClick={() => setSelectedSide('no')}
                  className="py-3 rounded-lg flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: selectedSide === 'no' ? AX.redBg : AX.surface,
                    border: `2px solid ${selectedSide === 'no' ? AX.red : AX.border}`,
                  }}
                >
                  <HiOutlineXCircle className="w-5 h-5" style={{ color: AX.red }} />
                  <span className="font-bold" style={{ color: AX.red }}>NO {Math.round(currentNoPrice * 100)}¢</span>
                </button>
              </div>

              <div className="relative mb-4">
                <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: AX.muted }}>$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setTradeError(null); }}
                  placeholder="0"
                  className="w-full pl-7 pr-3 py-3 rounded-lg text-lg font-semibold outline-none"
                  style={{ backgroundColor: AX.surface, border: `1px solid ${AX.border}`, color: AX.text }}
                />
              </div>

              <div className="grid grid-cols-4 gap-2 mb-4">
                {[10, 25, 50, 100].map((qa) => (
                  <button
                    key={qa}
                    onClick={() => setAmount(qa.toString())}
                    className="py-2 rounded-lg text-sm"
                    style={{
                      backgroundColor: amount === qa.toString() ? AX.mint : AX.surface,
                      color: amount === qa.toString() ? '#000' : AX.muted,
                    }}
                  >
                    ${qa}
                  </button>
                ))}
              </div>

              {amountNumber > 0 && (
                <div className="p-3 rounded-lg mb-4 space-y-2" style={{ backgroundColor: AX.surface }}>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: AX.muted }}>Payout if wins</span>
                    <span style={{ color: AX.mint }}>{formatUSDC(potentialPayout)}</span>
                  </div>
                </div>
              )}

              {tradeError && (
                <div className="flex items-center gap-2 p-2 rounded-lg mb-4" style={{ backgroundColor: AX.redBg }}>
                  <HiOutlineExclamation className="w-4 h-4" style={{ color: AX.red }} />
                  <span className="text-xs" style={{ color: AX.red }}>{tradeError}</span>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!isActive || amountNumber <= 0 || isSubmitting}
                className="w-full py-3 rounded-lg font-semibold flex items-center justify-center gap-2"
                style={{
                  backgroundColor: isActive && amountNumber > 0 ? AX.mint : AX.surface,
                  color: isActive && amountNumber > 0 ? '#000' : AX.muted,
                  opacity: isSubmitting ? 0.6 : 1,
                }}
              >
                {isSubmitting ? (
                  <HiOutlineRefresh className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <HiOutlineLightningBolt className="w-5 h-5" />
                    Buy {selectedSide.toUpperCase()}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />

      <style jsx global>{`
        .mobile-trade-modal { animation: slideUp 0.3s ease-out; }
        .mobile-trade-modal-closing { animation: slideDown 0.3s ease-in; }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slideDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
      `}</style>
    </>
  );
}
