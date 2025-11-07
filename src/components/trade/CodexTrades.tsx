import React from 'react';
import { formatSmartNumber } from '~/utils/db';
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

/** Icon: dollar with circular arrows, color comes from currentColor */
const UsdSolToggleIcon: React.FC<{ active: boolean }> = ({ active }) => (
  <svg
    className={`h-4 w-4 ${active ? 'text-emerald-300' : 'text-neutral-400'}`}
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    {/* outer circular arrows */}
    <path
      d="M7 6h3.6A5.4 5.4 0 0 1 16 11.4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M14.2 5 11.5 4 12 6.9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M17 18h-3.6A5.4 5.4 0 0 1 8 12.6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M9.8 19 12.5 20 12 17.1"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* dollar sign */}
    <path
      d="M12 8.2v7.6M10.3 9.4C10.7 8.7 11.3 8.4 12 8.4c1 0 1.8.6 1.8 1.5 0 1-.7 1.4-1.8 1.7-1.1.3-1.8.7-1.8 1.7 0 .9.8 1.5 1.8 1.5.7 0 1.3-.3 1.7-1"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Static MC header icon: left/right arrows */
const McHeaderIcon: React.FC = () => (
  <svg
    className="h-3 w-3 text-neutral-400"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    {/* left arrow */}
    <path
      d="M10 7L6 11l4 4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6 11h12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* right arrow */}
    <path
      d="M14 9l4 3-4 3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Solana glyph for Total SOL values — three gradient bars like the brand logo */
const SolanaIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <defs>
      <linearGradient
        id="solGradient"
        x1="0"
        y1="4"
        x2="24"
        y2="20"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0%" stopColor="#14F195" />
        <stop offset="50%" stopColor="#00B2FF" />
        <stop offset="100%" stopColor="#9945FF" />
      </linearGradient>
    </defs>
    <g transform="translate(4 5)">
      {/* top bar */}
      <rect
        x="0"
        y="0"
        width="14"
        height="2.6"
        rx="1.3"
        fill="url(#solGradient)"
      />
      {/* middle bar */}
      <rect
        x="0"
        y="4"
        width="14"
        height="2.6"
        rx="1.3"
        fill="url(#solGradient)"
      />
      {/* bottom bar */}
      <rect
        x="0"
        y="8"
        width="14"
        height="2.6"
        rx="1.3"
        fill="url(#solGradient)"
      />
    </g>
  </svg>
);

const CodexTrades: React.FC<CodexTradesProps> = ({ token, initialTrades = [] }) => {
  const [showAge, setShowAge] = React.useState(true); // true = Age, false = Time
  const [totalMode, setTotalMode] = React.useState<'usd' | 'sol'>('usd');

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
  }, [token?.pair_address, token?.decimals, token?.name, token?.symbol, token?.mint]);

  const stableInitialTrades = React.useMemo(() => initialTrades, [initialTrades.length]);

  const { loading: wsLoading, trades: wsTrades } = useOptimizedTradeEventsWebSocket({
    pairAddress: stableToken?.pair_address,
    enabled: !!stableToken?.pair_address,
    initialTrades: stableInitialTrades,
    tokenDecimals: stableToken?.decimals || 9,
    maxTrades: 200,
    enableDeduplication: true,
  });

  const displayTrades = wsTrades.length > 0 ? wsTrades : stableInitialTrades;
  const isLoading = wsLoading && stableInitialTrades.length === 0;

  const normalized = React.useMemo(() => {
    const slice = (displayTrades || []).slice(0, 100);
    return slice.map((t, i) => {
      const n = normalizeTrade(t, stableToken?.decimals ?? 9);
      return { ...n, raw: t, idx: i };
    });
  }, [displayTrades, stableToken?.decimals]);

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
      <div className="flex-1 min-h-0 p-4">
        <div className="animate-pulse">
          <div className="h-6 w-32 bg-neutral-700 rounded mb-4" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-neutral-700 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 overflow-y-auto pb-18">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-gray-900 z-10">
            <tr className="text-neutral-400 border-b border-neutral-800">
              {/* Age / Time */}
              <th className="pl-2 pr-1 py-2 text-left">
                <button
                  type="button"
                  onClick={() => setShowAge(prev => !prev)}
                  className="inline-flex items-center gap-1 text-xs text-neutral-300 hover:text-white"
                >
                  <span className="font-medium">
                    {showAge ? 'Age ↓' : 'Time ↓'}
                  </span>
                  <span className="text-xs text-neutral-400">
                    / {showAge ? 'Time' : 'Age'}
                  </span>
                  <span className="text-xs text-neutral-500">▾</span>
                </button>
              </th>

              {/* Type */}
              <th className="pl-1 pr-2 py-2 text-left">Type</th>

              {/* MC column with icon */}
              <th className="px-2 py-2 text-left">
                <div className="inline-flex items-center gap-1">
                  <span>MC</span>
                  <McHeaderIcon />
                </div>
              </th>

              {/* Amount */}
              <th className="px-2 py-2 text-left">Amount</th>

              {/* Total USD / SOL toggle column */}
              <th className="px-2 py-2 text-left">
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
                  <UsdSolToggleIcon active={totalMode === 'usd'} />
                </button>
              </th>

              {/* Trader */}
              <th className="px-2 py-2 text-left">Trader</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="text-center py-6 text-neutral-500">
                  Loading trades...
                </td>
              </tr>
            ) : !normalized.length ? (
              <tr>
                <td colSpan={6} className="text-center py-6 text-neutral-500">
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

                // MC: (trade price or fallback token price) * supply
                const unitPriceUsd =
                  Number.isFinite(n.pricePerToken) && n.pricePerToken > 0
                    ? n.pricePerToken
                    : fallbackPriceUsd;

                const mc =
                  supply > 0 && unitPriceUsd > 0
                    ? unitPriceUsd * supply
                    : null;

                const mcStr = mc !== null ? `$${formatSmartNumber(mc)}` : '-';

                const intensityUsd = scaleAmt(n.totalUSD);
                const gradientUsd = heatBarGradient(n.isBuy, intensityUsd);

                const intensitySol = n.solAmount > 0 ? scaleAmtSol(n.solAmount) : 0;
                const gradientSol = heatBarGradient(n.isBuy, intensitySol);

                const typeLabel = n.isBuy ? 'Buy' : 'Sell';
                const showingUsd = totalMode === 'usd';

                const totalValueStr = showingUsd ? amtStr : solAmountStr;
                const intensity = showingUsd ? intensityUsd : intensitySol;
                const gradient = showingUsd ? gradientUsd : gradientSol;

                const hasSol = n.solAmount > 0;

                const title = showingUsd
                  ? `~${(intensityUsd * 100).toFixed(0)}% of recent USD size`
                  : hasSol
                  ? `~${(intensitySol * 100).toFixed(0)}% of recent SOL size`
                  : 'No SOL data';

                return (
                  <tr
                    key={n.keyPart || n.idx}
                    className="border-b border-neutral-800 hover:bg-neutral-800/60"
                  >
                    {/* Age / Time */}
                    <td className="pl-2 pr-1 py-2 text-neutral-300">
                      {showAge ? age : timeStr}
                    </td>

                    {/* Type */}
                    <td
                      className={`pl-1 pr-2 py-2 font-semibold ${
                        n.isBuy ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {typeLabel}
                    </td>

                    {/* MC */}
                    <td className="px-2 py-2 text-neutral-300">
                      {mcStr}
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
                            {/* Sol icon ONLY when Total SOL is active and we have SOL data */}
                            {!showingUsd && hasSol && (
                              <SolanaIcon className="h-3 w-3" />
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
                    <td className="px-2 py-2 text-neutral-300">
                      <a
                        href={`https://solscan.io/account/${n.maker || ''}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white hover:text-neutral-300 transition-colors hover:underline"
                      >
                        {shortAddr(n.maker || '')}
                      </a>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {!!p95Display && (
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
        )}
      </div>
    </div>
  );
};

export default CodexTrades;
