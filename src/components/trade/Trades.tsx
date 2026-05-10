import React, { useEffect, useState } from 'react';
import { formatSmartNumber } from '~/utils/db';
import { getTradeHistoryByTokenAddress } from '~/utils/functions';
import type { TradeRow } from '~/utils/functions';
import type { Token } from '~/utils/db';

/* Axiom-style palette */
const AX = {
  bg: "#0c0d10",
  surface: "#101114",
  border: "#1f2127",
  text: "#f4f4f5",
  muted: "#71717a",
  mint: "#18c48c",
  sell: "#ef4444",
  blue: "#3b82f6",
};

function getAge(ts: string | number) {
  const now = Date.now();
  const t = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  const diffMs = now - t;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffSeconds < 0) return '0s';
  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  if (diffMins > 0) return `${diffMins}m`;
  return `${diffSeconds}s`;
}

function shortAddr(addr: string) {
  if (!addr) return '';
  return addr.slice(0, 3) + '...' + addr.slice(-3);
}

function getAgeFromBlockTime(blockTime: string) {
  if (!blockTime) return '';
  return getAge(blockTime);
}

function isBuy(trade: any) {
  // If Sell.Currency.Symbol is WSOL, it's a Buy; if Buy.Currency.Symbol is WSOL, it's a Sell
  return trade?.trade_data?.Trade?.Sell?.Currency?.Symbol === 'WSOL';
}

function getAmount(trade: any) {
  // If Buy, show Buy.Amount; if Sell, show Sell.Amount
  return isBuy(trade)
    ? trade?.trade_data?.Trade?.Buy?.Amount
    : trade?.trade_data?.Trade?.Sell?.Amount;
}

function getTotalUSD(trade: any) {
  // If Buy, use Buy.PriceInUSD * Buy.Amount; if Sell, use Sell.PriceInUSD * Sell.Amount
  if (isBuy(trade)) {
    const amt = parseFloat(trade?.trade_data?.Trade?.Buy?.Amount || '0');
    const priceInUSD = parseFloat(trade?.trade_data?.Trade?.Buy?.PriceInUSD || '0');
    return amt * priceInUSD;
  } else {
    const amt = parseFloat(trade?.trade_data?.Trade?.Sell?.Amount || '0');
    const priceInUSD = parseFloat(trade?.trade_data?.Trade?.Sell?.PriceInUSD || '0');
    return amt * priceInUSD;
  }
}

function getTrader(trade: any) {
  // Use Transaction.Signature
  return trade?.trade_data?.Transaction?.Signature || '';
}

interface TradesProps {
  token: Token;
  trades?: any[];
}

const Trades: React.FC<TradesProps> = ({ token, trades }) => {
  const displayTrades = trades;

  return (
    <div className="w-full" style={{ backgroundColor: AX.surface }}>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ color: AX.muted, borderBottom: `1px solid ${AX.border}` }}>
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide">Age</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide">Type</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide">MC</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide">Amount</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide">Total USD</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide">Trader</th>
          </tr>
        </thead>
        <tbody>
          {!trades ? (
            <tr><td colSpan={6} className="text-center py-8" style={{ color: AX.muted }}>Loading...</td></tr>
          ) : !displayTrades || displayTrades.length === 0 ? (
            <tr><td colSpan={6} className="text-center py-8" style={{ color: AX.muted }}>No trades found.</td></tr>
          ) : (
            displayTrades.map((trade, idx) => {
              const type = isBuy(trade) ? 'Buy' : 'Sell';
              const amount = getAmount(trade);
              const totalUSD = getTotalUSD(trade);
              const age = getAgeFromBlockTime(trade?.trade_data?.Block?.Time || trade?.timestamp);
              const trader = getTrader(trade);
              const typeColor = type === 'Buy' ? AX.mint : AX.sell;
              return (
                <tr 
                  key={trader + idx} 
                  className="transition-colors duration-150"
                  style={{ borderBottom: `1px solid ${AX.border}` }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${AX.border}40`}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <td className="px-3 py-2" style={{ color: AX.muted }}>{age}</td>
                  <td className="px-3 py-2 font-semibold" style={{ color: typeColor }}>{type}</td>
                  <td className="px-3 py-2" style={{ color: AX.muted }}>-</td>
                  <td className="px-3 py-2 tabular-nums" style={{ color: AX.text }}>{formatSmartNumber(amount)}</td>
                  <td className="px-3 py-2 font-semibold tabular-nums" style={{ color: typeColor }}>{type === 'Buy' ? '+' : '-'}${formatSmartNumber(totalUSD)}</td>
                  <td className="px-3 py-2">
                    <a
                      href={`https://solscan.io/tx/${trader}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline transition-colors"
                      style={{ color: AX.blue }}
                    >
                      {shortAddr(trader)}
                    </a>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

export default Trades;
