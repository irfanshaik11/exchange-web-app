import React from 'react';
import { formatSmartNumber, formatSmallPrice } from '~/utils/db';
import useOptimizedTradeEventsWebSocket from '../../hooks/useOptimizedTradeEventsWebSocket';
import type { Token } from '~/utils/db';

interface CodexTradesProps {
  token: Token | null;
  initialTrades?: any[];
}

function getAge(timestamp: number) {
  const now = Date.now() / 1000; // Convert to seconds
  const diffSeconds = now - timestamp;
  const diffMins = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffSeconds / 3600);
  const diffDays = Math.floor(diffSeconds / 86400);

  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  return `${diffMins}m`;
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
  maker: string;
  timestampSec: number;
  keyPart: string;
} {
  let isBuy = false;
  let color: 'text-emerald-400' | 'text-red-400' | 'text-neutral-400' = 'text-neutral-400';
  let totalUSD = 0;
  let pricePerToken = 0;
  let tokenAmount = 0;
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

  return { isBuy, color, totalUSD, pricePerToken, tokenAmount, maker, timestampSec, keyPart };
}

/** Subtle gradient used only for the inline bar, NOT the cell background */
function heatBarGradient(isBuy: boolean, intensity01: number) {
  const t = clamp01(intensity01);
  // keep it subtle: 0.10..0.32
  const a = 0.10 + 0.22 * t;
  const rgb = isBuy ? '16,185,129' /* emerald-500-ish */ : '244,63,94' /* rose-500-ish */;
  // fade to transparent so the table row background shows through
  return `linear-gradient(90deg, rgba(${rgb}, ${a}) 0%, rgba(${rgb}, ${a * 0.6}) 60%, rgba(${rgb}, 0) 100%)`;
}

const CodexTrades: React.FC<CodexTradesProps> = ({ token, initialTrades = [] }) => {
  const stableToken = React.useMemo(() => {
    if (!token) return null;
    return {
      pair_address: token.pair_address || '',
      decimals: token.decimals || 9,
      name: token.name || '',
      symbol: token.symbol || '',
      mint: token.mint || '',
      ...token
    };
  }, [token?.pair_address, token?.decimals, token?.name, token?.symbol, token?.mint]);

  const stableInitialTrades = React.useMemo(() => initialTrades, [initialTrades.length]);

  const {
    isConnected: wsConnected,
    loading: wsLoading,
    error: wsError,
    trades: wsTrades,
  } = useOptimizedTradeEventsWebSocket({
    pairAddress: stableToken?.pair_address,
    enabled: !!stableToken?.pair_address,
    initialTrades: stableInitialTrades,
    tokenDecimals: stableToken?.decimals || 9,
    maxTrades: 200,
    enableDeduplication: true,
  });

  const displayTrades = wsTrades.length > 0 ? wsTrades : stableInitialTrades;
  const isLoading = wsLoading && stableInitialTrades.length === 0;

  // Normalize first 100 for scaling
  const normalized = React.useMemo(() => {
    const slice = (displayTrades || []).slice(0, 100);
    return slice.map((t, i) => {
      const n = normalizeTrade(t, stableToken?.decimals ?? 9);
      return { ...n, raw: t, idx: i };
    });
  }, [displayTrades, stableToken?.decimals]);

  // Robust reference: 95th percentile
  const p95 = React.useMemo(() => {
    const arr = normalized.map(n => n.totalUSD).filter((x) => Number.isFinite(x) && x >= 0);
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

  // Skeleton if token absent
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
              <th className="px-2 py-2 text-left">Age ↓</th>
              <th className="px-2 py-2 text-left">Price (USD)</th>
              <th className="px-2 py-2 text-left">Amt (USD)</th>
              <th className="px-2 py-2 text-left">Retention</th>
              <th className="px-2 py-2 text-left">Trader</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="text-center py-6 text-neutral-500">
                  Loading trades...
                </td>
              </tr>
            ) : !normalized.length ? (
              <tr>
                <td colSpan={5} className="text-center py-6 text-neutral-500">
                  No trades available.
                </td>
              </tr>
            ) : (
              normalized.map((n) => {
                const age = getAge(n.timestampSec);
                const retention = formatSmartNumber(n.tokenAmount);
                const amtStr = Number.isFinite(n.totalUSD) ? `$${n.totalUSD.toFixed(2)}` : '$0.00';
                const priceStr = Number.isFinite(n.pricePerToken) ? `$${formatSmallPrice(n.pricePerToken)}` : '$-';

                const intensity = scaleAmt(n.totalUSD);
                const gradient = heatBarGradient(n.isBuy, intensity);

                return (
                  <tr key={n.keyPart || n.idx} className="border-b border-neutral-800 hover:bg-neutral-800/60">
                    <td className="px-2 py-2 text-neutral-300">{age}</td>
                    <td className={`px-2 py-2 font-semibold ${n.color}`}>{priceStr}</td>

                    {/* HEATMAP BAR only; cell background stays default */}
                    <td className="px-2 py-2 font-semibold relative overflow-hidden"
                        title={`~${(intensity * 100).toFixed(0)}% of recent size`}>
                      {/* bar (behind content) */}
                      <div
                        aria-hidden
                        className="absolute left-0 top-0 bottom-0 z-0"
                        style={{
                          width: `${Math.max(6, intensity * 100)}%`,
                          backgroundImage: gradient,
                          // blends with whatever row bg you already have
                          mixBlendMode: 'screen',
                          pointerEvents: 'none',
                          transition: 'width 160ms ease',
                        }}
                      />
                      {/* amount text */}
                      <div className={`relative z-10 ${n.isBuy ? 'text-emerald-300' : 'text-red-300'}`}>
                        {amtStr}
                      </div>
                    </td>

                    <td className="px-2 py-2 text-neutral-300">{retention}</td>
                    <td className="px-2 py-2 text-neutral-300">
                      <a
                        href={`https://solscan.io/account/${n.maker || ''}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#70E0B0] hover:text-[#58B890] transition-colors hover:underline"
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

        {!!p95 && (
          <div className="px-2 py-2 text-[10px] text-neutral-500 flex items-center gap-2">
            <span className="inline-block">Amt heat = relative to ~95th percentile</span>
            <span className="ml-auto">p95: ${p95.toFixed(2)}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CodexTrades;
