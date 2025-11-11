import { RiExchangeDollarLine } from "react-icons/ri";
import { SiSolana } from "react-icons/si";
import { FaArrowRightArrowLeft } from "react-icons/fa6";
import { FaFilter } from "react-icons/fa";
import { IoOpenOutline } from "react-icons/io5";
import React from 'react';
import { formatSmartNumber, formatMarketCap } from '~/utils/db';
import useOptimizedTradeEventsWebSocket from '../../hooks/useOptimizedTradeEventsWebSocket';
import type { Token } from '~/utils/db';

interface CodexTradesProps {
  token: Token | null;
  initialTrades?: any[];
}

function getAge(timestamp: number) {
  const now = Date.now() / 1000; // seconds
  const diffSeconds = now - timestamp;
  const diffMins = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffSeconds / 3600);
  const diffDays = Math.floor(diffSeconds / 86400);

  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  return `${diffMins}m`;
}

function getTimeFromTimestampSec(ts: number) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function shortAddr(addr: string) {
  if (!addr) return '';
  return addr.slice(0, 3) + '...' + addr.slice(-3);
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function percentile(arr: number[], p: number) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const idx = (a.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return a[lo];
  const w = idx - lo;
  return a[lo] * (1 - w) + a[hi] * w;
}

// Nicely format a USD price for the MC/Price column
// Shows all decimal values without scientific notation
function formatUsdPrice(value: number | null | undefined): string {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return '-';

  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(4)}`;
  if (v >= 0.0001) return `$${v.toFixed(6)}`;
  if (v >= 0.000001) return `$${v.toFixed(8)}`;
  if (v >= 0.00000001) return `$${v.toFixed(10)}`;
  if (v >= 0.0000000001) return `$${v.toFixed(12)}`;
  if (v >= 0.000000000001) return `$${v.toFixed(14)}`;
  // For extremely tiny prices, show up to 18 decimal places
  // Remove trailing zeros for cleaner display
  const formatted = v.toFixed(18);
  const trimmed = formatted.replace(/\.?0+$/, '');
  // Ensure we have at least the decimal point if all zeros were removed
  return `$${trimmed || formatted}`;
}

/** Normalize trade shapes into a single structure */
function normalizeTrade(
  trade: any,
  tokenDecimalsFallback = 9
): {
  isBuy: boolean;
  color: 'text-emerald-400' | 'text-red-400' | 'text-neutral-400';
  totalUSD: number;
  pricePerToken: number;
  tokenAmount: number;
  solAmount: number;
  maker: string;
  timestampSec: number;
  keyPart: string;
} {
  let isBuy = false;
  let color: 'text-emerald-400' | 'text-red-400' | 'text-neutral-400' = 'text-neutral-400';
  let totalUSD = 0;
  let pricePerToken = 0;
  let tokenAmount = 0;
  let solAmount = 0;
  let maker = trade.maker || trade.trader || '';
  let timestampSec = Date.now() / 1000;
  let keyPart = '';

  const hasWsShape = trade.side && trade.amount && trade.price && trade.pair_address;
  const hasBackend = trade.event_type && (trade.amount !== undefined || trade.price_in_usd !== undefined);
  const hasCodex = trade.eventDisplayType && trade.data;

  if (typeof trade.timestamp === 'number') {
    timestampSec = trade.timestamp < 1e10 ? trade.timestamp : trade.timestamp / 1000;
  } else if (typeof trade.timestamp === 'string') {
    timestampSec = new Date(trade.timestamp).getTime() / 1000;
  }

  if (hasWsShape) {
    isBuy = trade.side === 'buy';
    color = isBuy ? 'text-emerald-400' : 'text-red-400';
    tokenAmount = parseFloat(trade.amount) || 0;
    const maybeTotal = trade.totalUSD !== undefined ? parseFloat(trade.totalUSD) : NaN;
    const maybePrice = parseFloat(trade.price);
    if (isFinite(maybeTotal)) {
      totalUSD = maybeTotal;
      pricePerToken = tokenAmount > 0 ? totalUSD / tokenAmount : maybePrice || 0;
    } else {
      pricePerToken = maybePrice || 0;
      totalUSD = tokenAmount * pricePerToken;
    }
    keyPart = (trade.pair_address || '') + (trade.timestamp || '');
    maker = trade.maker || trade.taker || trade.pair_address || '';
  } else if (hasBackend) {
    isBuy = trade.event_type === 'BUY';
    color = isBuy ? 'text-emerald-400' : 'text-red-400';
    tokenAmount = Number(trade.amount || 0);
    totalUSD = Number(trade.total_usd || 0);
    pricePerToken = Number(trade.price_in_usd || 0);
    if (!pricePerToken && tokenAmount > 0 && totalUSD > 0) pricePerToken = totalUSD / tokenAmount;
    keyPart = (trade.transaction_hash || trade.id || '') + (trade.timestamp || '');
    maker = trade.maker || trade.trader || '';
  } else if (hasCodex) {
    isBuy = trade.eventDisplayType === 'Buy';
    color = isBuy ? 'text-emerald-400' : 'text-red-400';

    const d = trade.data || {};
    tokenAmount = parseFloat(String(d.amountNonLiquidityToken ?? d.amount0 ?? 0)) || 0;
    totalUSD = parseFloat(String(d.priceUsdTotal ?? 0)) || 0;
    pricePerToken = parseFloat(String(d.priceUsd ?? 0)) || 0;
    solAmount = parseFloat(String(d.priceBaseTokenTotal ?? 0)) || 0;
    if (!pricePerToken && tokenAmount > 0 && totalUSD > 0) pricePerToken = totalUSD / tokenAmount;

    keyPart = (trade.transactionHash || trade.txHash || '') + (trade.timestamp || '');
    maker = trade.maker || trade.trader || '';
  } else {
    isBuy = !!(trade.side === 'buy' || trade.type === 'BUY');
    color = isBuy ? 'text-emerald-400' : 'text-red-400';
    tokenAmount = Number(trade.amount || trade.size || 0);
    totalUSD = Number(trade.total_usd || trade.total || 0);
    pricePerToken = Number(trade.price_in_usd || trade.price || 0);
    if (!pricePerToken && tokenAmount > 0 && totalUSD > 0) pricePerToken = totalUSD / tokenAmount;
    keyPart = (trade.id || trade.hash || '') + (trade.timestamp || '');
    maker = trade.maker || trade.trader || '';
  }

  if (solAmount === 0) {
    if (trade.originalEvent?.data?.priceBaseTokenTotal) {
      solAmount = parseFloat(String(trade.originalEvent.data.priceBaseTokenTotal)) || 0;
    } else if (hasWsShape && trade.price) {
      const price = parseFloat(trade.price);
      if (price > 10 && price < 300) {
        solAmount = totalUSD > 0 ? totalUSD / price : 0;
      }
    } else if (hasBackend && trade.base_token_amount) {
      solAmount = parseFloat(String(trade.base_token_amount)) || 0;
    }
  }

  return { isBuy, color, totalUSD, pricePerToken, tokenAmount, solAmount, maker, timestampSec, keyPart };
}

/** Subtle gradient used only for the inline bar, NOT the cell background */
function heatBarGradient(isBuy: boolean, intensity01: number) {
  const t = clamp01(intensity01);
  const a = 0.1 + 0.22 * t;
  const rgb = isBuy ? '16,185,129' : '244,63,94';
  return `linear-gradient(90deg, rgba(${rgb}, ${a}) 0%, rgba(${rgb}, ${
    a * 0.6
  }) 60%, rgba(${rgb}, 0) 100%)`;
}

/** MC header icon using react-icons */
const McHeaderIcon: React.FC = () => (
  <FaArrowRightArrowLeft
    className="h-3 w-3 text-neutral-400"
    aria-hidden="true"
  />
);

/** Solana icon using react-icons with gradient fill */
const SolIcon: React.FC = () => (
  <>
    <SiSolana
      className="h-3 w-3 inline-block -mt-0.5"
      aria-hidden="true"
      style={{
        color: 'unset',
        fill: 'url(#solana-gradient-positions)',
        filter: 'none',
      }}
    />
    <svg className="absolute w-0 h-0 pointer-events-none">
      <defs>
        <linearGradient
          id="solana-gradient-positions"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="0%"
        >
          <stop offset="0%" stopColor="#9945FF" />
          <stop offset="100%" stopColor="#14F195" />
        </linearGradient>
      </defs>
    </svg>
  </>
);

const CodexTrades: React.FC<CodexTradesProps> = ({ token, initialTrades = [] }) => {
  const [showAge, setShowAge] = React.useState(true); // true = Age, false = Time
  const [totalMode, setTotalMode] = React.useState<'usd' | 'sol'>('usd');
  const [mcMode, setMcMode] = React.useState<'mc' | 'price'>('mc'); // MC vs Price toggle
  const [fetchedMarketCap, setFetchedMarketCap] = React.useState<number | null>(null);

  const stableToken = React.useMemo(() => {
    if (!token) return null;
    return {
      pair_address: token.pair_address || '',
      decimals: token.decimals || 9,
      name: token.name || '',
      symbol: token.symbol || '',
      mint: token.mint || '',
      ...token,
    };
  }, [token]); // Depend on entire token object to catch all field changes including supply/price

  // Fetch market cap immediately if not available in token
  React.useEffect(() => {
    if (!stableToken?.mint) return;
    
    // Check if token already has market cap
    const anyToken = stableToken as any;
    const existingMc = 
      anyToken?.market_cap_usd ?? 
      anyToken?.fully_diluted_value ?? 
      anyToken?.marketCapUsd ?? 
      anyToken?.fullyDilutedValue;
    
    if (existingMc && Number(existingMc) > 0) {
      setFetchedMarketCap(null); // Clear fetched value since we have it from token
      return;
    }

    // Fetch market cap via API immediately
    const fetchMarketCap = async () => {
      try {
        const response = await fetch('/api/codex/market-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mints: [stableToken.mint] }),
        });
        
        if (response.ok) {
          const data = await response.json();
          // API returns Record<mint, MarketData>
          const marketData = data[stableToken.mint];
          if (marketData?.market_cap_usd && marketData.market_cap_usd > 0) {
            setFetchedMarketCap(marketData.market_cap_usd);
          }
        }
      } catch (error) {
        // Silently fail - we'll fall back to calculated market cap
        console.error('[CodexTrades] Failed to fetch market cap:', error);
      }
    };

    fetchMarketCap();
  }, [stableToken?.mint]);

  const stableInitialTrades = React.useMemo(() => initialTrades, [initialTrades.length]);

  const { loading: wsLoading, trades: wsTrades } = useOptimizedTradeEventsWebSocket({
    pairAddress: stableToken?.pair_address,
    enabled: !!stableToken?.pair_address,
    initialTrades: stableInitialTrades,
    tokenDecimals: stableToken?.decimals || 9,
    maxTrades: 200,
    enableDeduplication: true,
  });

  // Preserve trades - once we have trades from WebSocket, always use them
  // This ensures trades don't disappear or change unless new ones arrive
  const displayTrades = React.useMemo(() => {
    // If we have WebSocket trades, always use them (they're the source of truth)
    if (wsTrades.length > 0) {
      return wsTrades;
    }
    // Fallback to initial trades only if WebSocket hasn't provided any yet
    return stableInitialTrades;
  }, [wsTrades, stableInitialTrades]);
  
  const isLoading = wsLoading && displayTrades.length === 0;

  // Helper to extract complete trader address from raw trade data
  const getCompleteTraderAddress = React.useCallback((trade: any): string => {
    const address = 
      trade.maker || 
      trade.trader || 
      trade.taker ||
      trade.data?.maker ||
      trade.data?.trader ||
      trade.data?.taker ||
      trade.originalEvent?.data?.maker ||
      trade.originalEvent?.data?.trader ||
      trade.originalEvent?.maker ||
      trade.originalEvent?.trader ||
      '';
    return (address || '').toString().trim();
  }, []);

  const normalized = React.useMemo(() => {
    const slice = (displayTrades || []).slice(0, 100);
    return slice.map((t, i) => {
      const n = normalizeTrade(t, stableToken?.decimals ?? 9);
      // Store the complete address from raw trade
      const completeAddress = getCompleteTraderAddress(t);
      const finalAddress = completeAddress || n.maker || '';
      return { ...n, raw: t, idx: i, completeTraderAddress: finalAddress };
    });
  }, [displayTrades, stableToken?.decimals, getCompleteTraderAddress]);

  // Calculate trade count per trader from all trades
  const traderTradeCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    const slice = (displayTrades || []).slice(0, 100);
    slice.forEach(t => {
      const completeAddress = getCompleteTraderAddress(t);
      if (completeAddress) {
        const key = completeAddress.replace(/\./g, '').replace(/\s/g, '').toLowerCase().trim();
        counts[key] = (counts[key] || 0) + 1;
      }
    });
    return counts;
  }, [displayTrades, getCompleteTraderAddress]);

  const p95 = React.useMemo(() => {
    const arr = normalized.map(n => n.totalUSD).filter(x => Number.isFinite(x) && x >= 0);
    return percentile(arr, 0.95) || 0;
  }, [normalized]);

  const p95Sol = React.useMemo(() => {
    const arr = normalized.map(n => n.solAmount).filter(x => Number.isFinite(x) && x > 0);
    return percentile(arr, 0.95) || 0;
  }, [normalized]);

  const scaleAmt = React.useCallback(
    (v: number) => {
      if (!isFinite(v) || v <= 0) return 0;
      const ref = p95 > 0 ? p95 : Math.max(...normalized.map(n => n.totalUSD), 1);
      return clamp01(v / ref);
    },
    [p95, normalized]
  );

  const scaleAmtSol = React.useCallback(
    (v: number) => {
      if (!isFinite(v) || v <= 0) return 0;
      const ref = p95Sol > 0 ? p95Sol : Math.max(...normalized.map(n => n.solAmount).filter(x => x > 0), 1);
      return clamp01(v / ref);
    },
    [p95Sol, normalized]
  );

  // derive token supply (supports several possible field names)
  const supply = React.useMemo(() => {
    const anyToken = stableToken as any;
    if (!anyToken) return 0;

    const raw =
      anyToken?.supply ??
      anyToken?.total_supply_formatted ??
      anyToken?.total_supply ??
      anyToken?.totalSupply ??
      anyToken?.circulating_supply ??
      0;

    let num = Number(raw);
    if (!Number.isFinite(num) || num <= 0) return 0;

    // If it's a gigantic integer, assume it's raw base units and scale by decimals
    if (num > 1e15 && stableToken?.decimals != null) {
      const scaled = num / Math.pow(10, stableToken.decimals);
      return Number.isFinite(scaled) ? scaled : 0;
    }

    return num;
  }, [stableToken]);

  // fallback token price (used when a trade doesn't have a valid pricePerToken)
  const fallbackPriceUsd = React.useMemo(() => {
    const anyToken = stableToken as any;
    if (!anyToken) return 0;

    const raw =
      anyToken?.usd_price ??
      anyToken?.price_usd ??
      anyToken?.priceUsd ??
      anyToken?.last_price_usd ??
      0;

    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : 0;
  }, [stableToken]);

  const p95Display = totalMode === 'usd' ? p95 : p95Sol;

  if (!stableToken || (!stableToken.name && !stableToken.symbol)) {
    return (
      <div className="flex-1 min-h-0 p-4 bg-black">
        <div className="animate-pulse">
          <div className="h-6 w-32 bg-neutral-900 rounded mb-4" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-neutral-900 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-black">
      <div className="flex-1 overflow-y-auto pb-18 bg-black">
        <table className="w-full text-xs border-collapse bg-black table-fixed">
          <thead className="sticky top-0 bg-black z-10">
            <tr className="text-neutral-400 border-b border-neutral-800">
              {/* Age / Time */}
              <th className="w-[16.66%] pl-2 pr-0 py-2 text-left">
                <button
                  type="button"
                  onClick={() => setShowAge(prev => !prev)}
                  className="inline-flex items-center gap-0.5 text-[11px] text-neutral-300 hover:text-white"
                >
                  <span className="font-medium">
                    {showAge ? 'Age ↓' : 'Time ↓'}
                  </span>
                  <span className="text-[10px] text-neutral-400">
                    / {showAge ? 'Time' : 'Age'}
                  </span>
                  <span className="text-[10px] text-neutral-500">▾</span>
                </button>
              </th>

              {/* Type */}
              <th className="w-[16.66%] pl-0 pr-2 py-2 text-left">
                Type
              </th>

              {/* MC / Price column with icon */}
              <th className="w-[16.66%] px-2 py-2 text-left">
                <button
                  type="button"
                  onClick={() =>
                    setMcMode(prev => (prev === 'mc' ? 'price' : 'mc'))
                  }
                  className="inline-flex items-center gap-1 text-xs text-neutral-300 hover:text-white"
                >
                  <span className="font-medium">
                    {mcMode === 'mc' ? 'MC' : 'Price'}
                  </span>
                  <McHeaderIcon />
                </button>
              </th>

              {/* Amount */}
              <th className="w-[16.66%] px-2 py-2 text-left">Amount</th>

              {/* Total USD / SOL toggle column */}
              <th className="w-[16.66%] px-2 py-2 text-left">
                <button
                  type="button"
                  onClick={() =>
                    setTotalMode(prev => (prev === 'usd' ? 'sol' : 'usd'))
                  }
                  className="inline-flex items-center gap-1 text-xs text-neutral-300 hover:text-white"
                >
                  <span className="font-medium">
                    {totalMode === 'usd' ? 'Total USD' : 'Total SOL'}
                  </span>
                  <RiExchangeDollarLine
                    className={
                      totalMode === 'usd'
                        ? 'h-4 w-4 text-emerald-300 drop-shadow-[0_0_6px_rgba(16,185,129,0.9)]'
                        : 'h-4 w-4 text-neutral-400'
                    }
                  />
                </button>
              </th>

              {/* Trader */}
              <th className="w-[16.66%] px-2 py-2 text-left">Trader</th>
            </tr>
          </thead>
          <tbody className="bg-black">
            {isLoading ? (
              <tr className="bg-black">
                <td colSpan={6} className="text-center py-6 text-neutral-500 bg-black">
                  Loading trades...
                </td>
              </tr>
            ) : !normalized.length ? (
              <tr className="bg-black">
                <td colSpan={6} className="text-center py-6 text-neutral-500 bg-black">
                  No trades available.
                </td>
              </tr>
            ) : (
              normalized.map(n => {
                const age = getAge(n.timestampSec);
                const timeStr = getTimeFromTimestampSec(n.timestampSec);
                const tokenAmountStr = formatSmartNumber(n.tokenAmount);
                const solAmountStr =
                  Number.isFinite(n.solAmount) && n.solAmount > 0
                    ? formatSmartNumber(n.solAmount)
                    : '-';
                const amtStr = Number.isFinite(n.totalUSD)
                  ? `$${n.totalUSD.toFixed(2)}`
                  : '$0.00';

                // MC / Price: (trade price or fallback token price)
                const unitPriceUsd =
                  Number.isFinite(n.pricePerToken) && n.pricePerToken > 0
                    ? n.pricePerToken
                    : fallbackPriceUsd;

                // Get market cap: prioritize token's market cap, then fetched, then calculate
                const anyToken = stableToken as any;
                const tokenMarketCap = 
                  anyToken?.market_cap_usd ?? 
                  anyToken?.fully_diluted_value ?? 
                  anyToken?.marketCapUsd ?? 
                  anyToken?.fullyDilutedValue;
                
                const mc = 
                  (tokenMarketCap && Number(tokenMarketCap) > 0) 
                    ? Number(tokenMarketCap)
                    : (fetchedMarketCap && fetchedMarketCap > 0)
                    ? fetchedMarketCap
                    : (supply > 0 && unitPriceUsd > 0)
                    ? unitPriceUsd * supply
                    : null;

                const mcStr = mc !== null ? `$${formatMarketCap(mc)}` : '-';
                const priceStr = formatUsdPrice(unitPriceUsd);

                const intensityUsd = scaleAmt(n.totalUSD);
                const gradientUsd = heatBarGradient(n.isBuy, intensityUsd);

                const intensitySol = n.solAmount > 0 ? scaleAmtSol(n.solAmount) : 0;
                const gradientSol = heatBarGradient(n.isBuy, intensitySol);

                const typeLabel = n.isBuy ? 'Buy' : 'Sell';
                const showingUsd = totalMode === 'usd';

                const totalValueStr = showingUsd ? amtStr : solAmountStr;
                const intensity = showingUsd ? intensityUsd : intensitySol;
                const gradient = showingUsd ? gradientUsd : gradientSol;

                const hasSol = Number.isFinite(n.solAmount) && n.solAmount > 0;

                const title = showingUsd
                  ? `~${(intensityUsd * 100).toFixed(0)}% of recent USD size`
                  : hasSol
                  ? `~${(intensitySol * 100).toFixed(0)}% of recent SOL size`
                  : 'No SOL data';

                return (
                  <tr
                    key={n.keyPart || n.idx}
                    className="border-b border-neutral-900 hover:bg-neutral-900/60 bg-black"
                  >
                    {/* Age / Time */}
                    <td className="pl-2 pr-0 py-2 text-neutral-300">
                      {showAge ? age : timeStr}
                    </td>

                    {/* Type */}
                    <td
                      className={`pl-0 pr-2 py-2 font-semibold ${
                        n.isBuy ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {typeLabel}
                    </td>

                    {/* MC / Price */}
                    <td className="px-2 py-2 text-neutral-300">
                      {mcMode === 'mc' ? mcStr : priceStr}
                    </td>

                    {/* Amount */}
                    <td className="px-2 py-2 text-neutral-300">
                      {tokenAmountStr}
                    </td>

                    {/* merged Total column */}
                    <td
                      className="px-2 py-2 font-semibold relative overflow-hidden"
                      title={title}
                    >
                      {showingUsd || hasSol ? (
                        <>
                          <div
                            aria-hidden
                            className="absolute left-0 top-0 bottom-0 z-0"
                            style={{
                              width: `${Math.max(6, intensity * 100)}%`,
                              backgroundImage: gradient,
                              mixBlendMode: 'screen',
                              pointerEvents: 'none',
                              transition: 'width 160ms ease',
                            }}
                          />
                          <div
                            className={`relative z-10 flex items-center gap-1 ${
                              n.isBuy ? 'text-emerald-300' : 'text-red-300'
                            }`}
                          >
                            {/* Sol icon ALWAYS shown in SOL mode, dimmed if no SOL amount */}
                            {!showingUsd && (
                              <span className={hasSol ? '' : 'opacity-40'}>
                                <SolIcon />
                              </span>
                            )}
                            <span>{totalValueStr}</span>
                          </div>
                        </>
                      ) : (
                        <div className="relative z-10 text-neutral-400">
                          {totalValueStr}
                        </div>
                      )}
                    </td>

                    {/* Trader */}
                    <td className="px-2 py-2 text-neutral-300 align-middle">
                      <div className="flex items-center flex-nowrap gap-4 min-w-0" style={{ lineHeight: '20px' }}>
                        <a
                          href={`https://solscan.io/account/${n.maker || ''}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-white hover:text-neutral-300 transition-colors hover:underline flex items-center min-w-0 flex-shrink"
                          style={{ lineHeight: '20px', height: '20px' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="truncate text-xs whitespace-nowrap" style={{ lineHeight: '20px' }}>{shortAddr(n.maker || '')}</span>
                        </a>
                        <div className="flex items-center flex-nowrap gap-1.5 flex-shrink-0" style={{ lineHeight: '20px', height: '20px' }}>
                          {(() => {
                            const traderKey = (n.completeTraderAddress || n.maker || '').toString()
                              .replace(/\./g, '').replace(/\s/g, '').toLowerCase().trim();
                            const count = traderTradeCounts[traderKey] || 0;
                            if (count > 0) {
                              return (
                                <span className="inline-flex items-center justify-center min-w-[20px] px-1.5 text-xs font-medium text-white bg-neutral-800 border border-neutral-700 rounded whitespace-nowrap" style={{ lineHeight: '20px', height: '20px' }}>
                                  {count}
                                </span>
                              );
                            }
                            return null;
                          })()}
                          <a
                            href={`https://solscan.io/account/${n.maker || ''}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-neutral-400 hover:text-neutral-300 transition-colors inline-flex items-center justify-center flex-shrink-0"
                            style={{ width: '20px', height: '20px', lineHeight: '20px' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <IoOpenOutline size={14} className="flex-shrink-0" />
                          </a>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              // Filter functionality can be added here if needed
                            }}
                            className="text-neutral-400 hover:text-neutral-300 transition-colors opacity-60 hover:opacity-100 inline-flex items-center justify-center flex-shrink-0"
                            style={{ width: '20px', height: '20px', lineHeight: '20px' }}
                            title="Filter by this trader"
                          >
                            <FaFilter size={14} className="flex-shrink-0" />
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {!!p95Display && (
            <tfoot className="bg-black">
              <tr>
                <td colSpan={6} className="bg-black">
                  <div className="px-2 py-2 text-[10px] text-neutral-500 flex items-center gap-2">
                    <span className="inline-block">
                      Total heat = relative to ~95th percentile
                    </span>
                    <span className="ml-auto">
                      {totalMode === 'usd'
                        ? `p95: $${p95Display.toFixed(2)}`
                        : `p95: ${p95Display.toFixed(4)} SOL`}
                    </span>
                  </div>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

export default CodexTrades;
