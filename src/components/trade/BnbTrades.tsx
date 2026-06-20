import React, { useCallback, useEffect, useState } from 'react';
import { IoOpenOutline } from 'react-icons/io5';
import { formatSmartNumber } from '~/utils/db';
import { buildBnbTradesUrl } from '~/utils/bnbToken';

const BNB_GREEN = '#F3BA2F';
const BNB_RED = '#ef4444';

interface BnbTradeRow {
  tx_hash: string;
  block_time: string;
  side: 'buy' | 'sell' | string;
  price_usd?: number;
  token_amount?: string;
  quote_amount?: string;
  account?: string;
}

interface BnbTradesProps {
  tokenAddress: string;
}

function shortAddr(addr: string) {
  if (!addr) return '';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function getAge(iso: string) {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '-';
  const diffSeconds = Math.floor((Date.now() - ts) / 1000);
  if (diffSeconds < 0) return '0s';
  const mins = Math.floor(diffSeconds / 60);
  const hours = Math.floor(diffSeconds / 3600);
  const days = Math.floor(diffSeconds / 86400);
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (mins > 0) return `${mins}m`;
  return `${diffSeconds}s`;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function BnbTrades({ tokenAddress }: BnbTradesProps) {
  const [trades, setTrades] = useState<BnbTradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAge, setShowAge] = useState(true);

  const fetchTrades = useCallback(async () => {
    if (!tokenAddress) return;
    try {
      const res = await fetch(buildBnbTradesUrl(tokenAddress, 200), {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return;
      const data = await res.json();
      const rows = Array.isArray(data?.trades) ? data.trades : [];
      setTrades(rows);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [tokenAddress]);

  useEffect(() => {
    setLoading(true);
    void fetchTrades();
    const id = setInterval(fetchTrades, 10_000);
    return () => clearInterval(id);
  }, [fetchTrades]);

  if (loading && trades.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-neutral-500">
        Loading trades…
      </div>
    );
  }

  if (!trades.length) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-neutral-500">
        No trades yet for this token
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="flex items-center justify-between border-b border-[#2A2B33] px-3 py-2 text-[10px] uppercase tracking-wide text-neutral-500">
        <div className="grid flex-1 grid-cols-[minmax(70px,1fr)_minmax(50px,0.6fr)_minmax(70px,0.8fr)_minmax(70px,0.8fr)_minmax(70px,0.8fr)_minmax(80px,1fr)] gap-2">
          <span>Age / Time</span>
          <span>Type</span>
          <span>Price</span>
          <span>Amount</span>
          <span>Total</span>
          <span>Trader</span>
        </div>
        <button
          type="button"
          onClick={() => setShowAge((v) => !v)}
          className="ml-2 rounded px-2 py-0.5 text-[10px] text-neutral-400 hover:text-white"
        >
          {showAge ? 'Age' : 'Time'}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {trades.map((trade) => {
          const isBuy = String(trade.side).toLowerCase() === 'buy';
          const color = isBuy ? BNB_GREEN : BNB_RED;
          // NOTE: Assumes 18-decimal BEP-20. Tokens like USDT BSC (6d) or BTCB (8d) will render
          // with incorrect magnitude. Pending decimals field on /v1/token/{mint}/trades.
          const tokenAmt = Number(trade.token_amount) / 1e18;
          const priceUsd = Number(trade.price_usd) || 0;
          const totalUsd = tokenAmt > 0 && priceUsd > 0 ? tokenAmt * priceUsd : 0;
          return (
            <div
              key={trade.tx_hash}
              className="grid grid-cols-[minmax(70px,1fr)_minmax(50px,0.6fr)_minmax(70px,0.8fr)_minmax(70px,0.8fr)_minmax(70px,0.8fr)_minmax(80px,1fr)] gap-2 border-b border-[#1a1b20] px-3 py-1.5 hover:bg-[#14151b]"
            >
              <span className="text-neutral-400">
                {showAge ? getAge(trade.block_time) : formatTime(trade.block_time)}
              </span>
              <span style={{ color }} className="font-semibold capitalize">
                {trade.side}
              </span>
              <span className="text-neutral-300">
                {priceUsd > 0 ? `$${formatSmartNumber(priceUsd)}` : '-'}
              </span>
              <span className="text-neutral-300">
                {tokenAmt > 0 ? formatSmartNumber(tokenAmt) : '-'}
              </span>
              <span style={{ color }} className="font-medium">
                {totalUsd > 0 ? `$${formatSmartNumber(totalUsd)}` : '-'}
              </span>
              <a
                href={`https://bscscan.com/tx/${trade.tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-neutral-400 hover:text-white"
              >
                {shortAddr(trade.account || '')}
                <IoOpenOutline className="h-3 w-3" />
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
