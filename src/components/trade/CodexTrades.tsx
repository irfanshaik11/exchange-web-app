import React from 'react';
import { formatSmartNumber } from '~/utils/db';
import useCodexTradesWebSocket from '../../hooks/useCodexTradesWebSocket';
import useTradeEventsWebSocket from '../../hooks/useTradeEventsWebSocket';
import type { Token } from '~/utils/db';

interface CodexTradesProps {
  token: Token;
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

function getTradeType(eventDisplayType: string) {
  switch (eventDisplayType) {
    case 'Buy':
      return { type: 'Buy', color: 'text-emerald-400' };
    case 'Sell':
      return { type: 'Sell', color: 'text-red-400' };
    case 'Add':
      return { type: 'Add', color: 'text-emerald-400' };
    default:
      return { type: eventDisplayType, color: 'text-neutral-400' };
  }
}

function getAmount(data: { amount0: string; amount1: string }, eventDisplayType: string) {
  // For Buy: amount0 is negative (token out), amount1 is positive (SOL in)
  // For Sell: amount0 is positive (token in), amount1 is negative (SOL out)
  // For Add: both are positive (adding liquidity)
  
  const amount0 = parseFloat(data.amount0);
  const amount1 = parseFloat(data.amount1);
  
  if (eventDisplayType === 'Buy') {
    // Show the amount of tokens bought (positive amount0)
    return Math.abs(amount0);
  } else if (eventDisplayType === 'Sell') {
    // Show the amount of tokens sold (positive amount0)
    return Math.abs(amount0);
  } else if (eventDisplayType === 'Add') {
    // Show the amount of tokens added (positive amount0)
    return Math.abs(amount0);
  }
  
  return Math.abs(amount0);
}

function getTotalUSD(token0SwapValueUsd: string, token1SwapValueUsd: string, eventDisplayType: string) {
  const token0Value = parseFloat(token0SwapValueUsd);
  const token1Value = parseFloat(token1SwapValueUsd);
  
  // For Buy: token0SwapValueUsd is the USD value of the token trade
  // For Sell: token0SwapValueUsd is the USD value of the token trade
  // For Add: both values represent the liquidity added
  
  if (eventDisplayType === 'Buy') {
    return token0Value; // USD value of the token trade
  } else if (eventDisplayType === 'Sell') {
    return token0Value; // USD value of the token trade
  } else if (eventDisplayType === 'Add') {
    return token0Value + token1Value; // Total liquidity added
  }
  
  return token0Value;
}

function getMarketCap(token0SwapValueUsd: string, token1SwapValueUsd: string) {
  // This is a simplified calculation - in reality you'd need more data
  // For now, we'll use a placeholder or calculate based on available data
  const token0Value = parseFloat(token0SwapValueUsd);
  const token1Value = parseFloat(token1SwapValueUsd);
  
  // This is a rough estimate - you might want to get actual market cap from your API
  const estimatedMC = token0Value * 1000; // Rough multiplier based on token value
  
  if (estimatedMC >= 1000000) {
    return `$${(estimatedMC / 1000000).toFixed(2)}M`;
  } else if (estimatedMC >= 1000) {
    return `$${(estimatedMC / 1000).toFixed(2)}K`;
  } else {
    return `$${estimatedMC.toFixed(2)}`;
  }
}

const CodexTrades: React.FC<CodexTradesProps> = ({ token }) => {
  const { trades: codexTrades, isConnected: codexConnected, error: codexError, isLoading: codexLoading } = useCodexTradesWebSocket(token.mint);
  
  // WebSocket hook for real-time trade events
  const {
    isConnected: wsConnected,
    loading: wsLoading,
    error: wsError,
    trades: wsTrades,
    getTradeStats,
    fetchMoreTrades,
  } = useTradeEventsWebSocket({
    pairAddress: token.pair_address,
    enabled: true,
  });

  // Use WebSocket trades if available, otherwise fallback to Codex trades
  const displayTrades = wsTrades.length > 0 ? wsTrades : codexTrades;
  const isConnected = wsConnected || codexConnected;
  const error = wsError || codexError;
  const isLoading = wsLoading || codexLoading;

  return (
    <div className="w-full">
      
      {error && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}


      <table className="w-full text-xs">
        <thead>
          <tr className="text-neutral-400 border-b border-neutral-800">
            <th className="px-2 py-2 text-left">Age ↓</th>
            <th className="px-2 py-2 text-left">Type</th>
            <th className="px-2 py-2 text-left">MC ⇅</th>
            <th className="px-2 py-2 text-left">Amount</th>
            <th className="px-2 py-2 text-left">Total USD ⟳</th>
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
          ) : !displayTrades || displayTrades.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-center py-6 text-neutral-500">
                {isConnected ? 'No trades found.' : 'Connecting...'}
              </td>
            </tr>
          ) : (
            displayTrades.slice(0, 200).map((trade: any, idx) => {
              // Check if it's a WebSocket trade event
              if (trade.side && trade.amount && trade.price && trade.pair_address) {
                // WebSocket trade event format
                const type = trade.side === 'buy' ? 'Buy' : 'Sell';
                const color = trade.side === 'buy' ? 'text-emerald-400' : 'text-red-400';
                const age = getAge(new Date(trade.timestamp).getTime() / 1000);
                const amount = parseFloat(trade.amount);
                const price = parseFloat(trade.price);
                const value = amount * price;
                
                return (
                  <tr key={trade.pair_address + idx + trade.timestamp} className="border-b border-neutral-800 hover:bg-neutral-800/60">
                    <td className="px-2 py-2 text-neutral-300">{age}</td>
                    <td className={`px-2 py-2 font-semibold ${color}`}>{type}</td>
                    <td className="px-2 py-2 text-neutral-300">-</td>
                    <td className="px-2 py-2 text-neutral-300">{formatSmartNumber(amount)}</td>
                    <td className={`px-2 py-2 font-semibold ${color}`}>
                      {type === 'Buy' ? '+' : '-'}${formatSmartNumber(value)}
                    </td>
                    <td className="px-2 py-2 text-neutral-300 flex items-center space-x-1">
                      <span>{shortAddr(trade.maker || trade.pair_address)}</span>
                      {wsConnected && <span className="text-xs text-green-400">●</span>}
                    </td>
                  </tr>
                );
              } else {
                // Codex trade format
                const { type, color } = getTradeType(trade.eventDisplayType);
                const amount = getAmount(trade.data, trade.eventDisplayType);
                const totalUSD = getTotalUSD(trade.token0SwapValueUsd, trade.token1SwapValueUsd, trade.eventDisplayType);
                const age = getAge(trade.timestamp);
                const trader = shortAddr(trade.maker);
                const marketCap = getMarketCap(trade.token0SwapValueUsd, trade.token1SwapValueUsd);
                
                return (
                  <tr key={trade.transactionHash + idx} className="border-b border-neutral-800 hover:bg-neutral-800/60">
                    <td className="px-2 py-2 text-neutral-300">{age}</td>
                    <td className={`px-2 py-2 font-semibold ${color}`}>{type}</td>
                    <td className="px-2 py-2 text-neutral-300">{marketCap}</td>
                    <td className="px-2 py-2 text-neutral-300">{formatSmartNumber(amount)}</td>
                    <td className={`px-2 py-2 font-semibold ${color}`}>
                      {type === 'Buy' || type === 'Add' ? '+' : '-'}${formatSmartNumber(totalUSD)}
                    </td>
                    <td className="px-2 py-2 text-neutral-300 flex items-center space-x-1">
                      <span>{trader}</span>
                      <span className="text-xs text-neutral-500">1</span>
                      <svg className="w-3 h-3 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      <svg className="w-3 h-3 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                      </svg>
                    </td>
                  </tr>
                );
              }
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

export default CodexTrades;
