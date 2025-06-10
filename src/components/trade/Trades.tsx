import React, { useEffect, useState } from 'react';
import { formatSmartNumber } from '~/utils/db';
import { env } from '../../env';
import type { Token } from '~/utils/db';

function getAge(ts: string | number) {
  const now = Date.now();
  const t = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  const diffMs = now - t;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  return `${diffMins}m`;
}

function shortAddr(addr: string) {
  if (!addr) return '';
  return addr.slice(0, 3) + '...' + addr.slice(-3);
}

interface TradesProps {
  token: Token;
}

interface TradeRow {
  timestamp: string;
  type: 'Buy' | 'Sell';
  market_cap: string | number;
  amount: string | number;
  total_usd: string | number;
  trader: string;
  tx_hash: string;
}

const Trades: React.FC<TradesProps> = ({ token }) => {
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!token?.token_address) return;
    setLoading(true);
    fetch(`${env.NEXT_PUBLIC_BACKEND_URL}/api/trade/get_trade_history_by_tokenaddress?tokenAddress=${"FMGU4vKjT3MW4GBTP8ru8JWs1R552FUU8PTqo65ppump" || token.token_address}`)
      .then(res => res.json())
      .then(data => {
        console.log(data)
        setTrades(Array.isArray(data.result) ? data.result : []);
        setLoading(false);
      })
      .catch(() => setTrades([]));
  }, [token?.token_address]);

  return (
    <div className="mt-4 rounded-lg bg-neutral-900 p-2">
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="text-neutral-400 border-b border-neutral-800">
              <th className="px-2 py-2 text-left">Age</th>
              <th className="px-2 py-2 text-left">Type</th>
              <th className="px-2 py-2 text-left">MC</th>
              <th className="px-2 py-2 text-left">Amount</th>
              <th className="px-2 py-2 text-left">Total USD</th>
              <th className="px-2 py-2 text-left">Trader</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-6 text-neutral-500">Loading...</td></tr>
            ) : trades.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-6 text-neutral-500">No trades found.</td></tr>
            ) : (
              trades.map((trade, idx) => (
                <tr key={trade.tx_hash || idx} className="border-b border-neutral-800 hover:bg-neutral-800/60">
                  <td className="px-2 py-2">{getAge(trade.timestamp)}</td>
                  <td className={
                    `px-2 py-2 font-semibold ${trade.type === 'Buy' ? 'text-emerald-400' : 'text-red-400'}`
                  }>{trade.type}</td>
                  <td className="px-2 py-2">${formatSmartNumber(trade.market_cap)}</td>
                  <td className="px-2 py-2">{formatSmartNumber(trade.amount)}</td>
                  <td className={
                    `px-2 py-2 font-semibold ${trade.type === 'Buy' ? 'text-emerald-400' : 'text-red-400'}`
                  }>{trade.type === 'Buy' ? '+' : '-'}${formatSmartNumber(trade.total_usd)}</td>
                  <td className="px-2 py-2">
                    <a
                      href={`https://solscan.io/tx/${trade.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-300 hover:underline"
                    >
                      {shortAddr(trade.trader)}
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Trades; 