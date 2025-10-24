import React from 'react';
import { formatSmartNumber } from '~/utils/db';
import useCodexTradesWebSocket from '../../hooks/useCodexTradesWebSocket';
import useOptimizedTradeEventsWebSocket from '../../hooks/useOptimizedTradeEventsWebSocket';
import type { Token } from '~/utils/db';

interface CodexTradesProps {
  token: Token;
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

function getAmount(data: { amount0: string; amount1: string }, eventDisplayType: string, tokenDecimals: number = 2) {
  // Divide raw amount by 1,000 for display
  const rawAmount = parseFloat(data.amount0);
  const displayAmount = rawAmount / 1000;
  return formatSmartNumber(displayAmount);
}

function getTotalUSD(
  amount0: string,
  amount1: string,
  token0SwapValueUsd: string,
  token1SwapValueUsd: string,
  eventDisplayType: string
) {
  const amt0 = Math.abs(parseFloat(amount0));
  const amt1 = Math.abs(parseFloat(amount1));
  const usd0 = parseFloat(token0SwapValueUsd);
  const usd1 = parseFloat(token1SwapValueUsd);
  
  // Determine which token is SOL by checking which USD value is larger
  // SOL price (~$100-$250) will be much larger than memecoin prices
  // The larger USD value likely represents the quote token (SOL)
  
  if (usd0 > usd1 && usd0 > 10) {
    // token0 appears to be SOL (higher price)
    // Use token0 USD value or calculate from amount0
    const solAmount = amt0 / 1e9;
    return solAmount * usd0;
  } else if (usd1 > usd0 && usd1 > 10) {
    // token1 appears to be SOL (higher price)
    // Use token1 USD value or calculate from amount1
    const solAmount = amt1 / 1e9;
    return solAmount * usd1;
  } else {
    // Both values are small, use the larger one as total value
    return Math.max(usd0, usd1);
  }
}

function formatMarketCap(marketCapUsd: number) {
  if (!marketCapUsd || marketCapUsd === 0) return '-';
  
  if (marketCapUsd >= 1000000) {
    return `$${(marketCapUsd / 1000000).toFixed(2)}M`;
  } else if (marketCapUsd >= 1000) {
    return `$${(marketCapUsd / 1000).toFixed(2)}K`;
  } else {
    return `$${marketCapUsd.toFixed(2)}`;
  }
}

const CodexTrades: React.FC<CodexTradesProps> = ({ token, initialTrades = [] }) => {
  // Simplified WebSocket connection - use only one WebSocket hook
  const {
    isConnected: wsConnected,
    loading: wsLoading,
    error: wsError,
    trades: wsTrades,
    getTradeStats,
    getMemoryStats,
  } = useOptimizedTradeEventsWebSocket({
    pairAddress: token.pair_address,
    enabled: true,
    initialTrades: initialTrades,
    tokenDecimals: token.decimals,
    maxTrades: 200, // Reduced for faster processing
    enableDeduplication: true,
  });

  // Use WebSocket trades if available, otherwise show initial trades immediately
  const displayTrades = wsTrades.length > 0 ? wsTrades : initialTrades;
  const isConnected = wsConnected || initialTrades.length > 0; // Consider connected if we have initial data
  const error = wsError;
  const isLoading = wsLoading && initialTrades.length === 0; // Only show loading if no initial data

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs">
        <thead className="sticky top-0 bg-gray-900 z-10">
          <tr className="text-neutral-400 border-b border-neutral-800">
            <th className="px-2 py-2 text-left">Age ↓</th>
            <th className="px-2 py-2 text-left">Type</th>
            {/* <th className="px-2 py-2 text-left">MC ⇅</th> */}
            <th className="px-2 py-2 text-left">Amount</th>
            <th className="px-2 py-2 text-left">Total USD ⟳</th>
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
          ) : !displayTrades || displayTrades.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-center py-6 text-neutral-500">
                {displayTrades.length > 0 ? 'No trades found.' : (isLoading ? 'Loading...' : 'No trades available.')}
              </td>
            </tr>
          ) : (
            displayTrades.slice(0, 100).map((trade: any, idx) => { // Reduced from 200 to 100 for faster rendering
              // Check if it's a WebSocket trade event
              if (trade.side && trade.amount && trade.price && trade.pair_address) {
                // WebSocket trade event format
                const type = trade.side === 'buy' ? 'Buy' : 'Sell';
                const color = trade.side === 'buy' ? 'text-emerald-400' : 'text-red-400';
                const age = getAge(new Date(trade.timestamp).getTime() / 1000);
                const amount = formatSmartNumber(parseFloat(trade.amount) / 1000);
                // Use totalUSD if available, otherwise use the price field (which is actually the total USD value)
                const value = trade.totalUSD !== undefined ? trade.totalUSD : parseFloat(trade.price);
                
                return (
                  <tr key={trade.pair_address + idx + trade.timestamp} className="border-b border-neutral-800 hover:bg-neutral-800/60">
                    <td className="px-2 py-2 text-neutral-300">{age}</td>
                    <td className={`px-2 py-2 font-semibold ${color}`}>{type}</td>
                    {/* <td className="px-2 py-2 text-neutral-300">{formatMarketCap(token.market_cap_usd)}</td> */}
                    <td className="px-2 py-2 text-neutral-300">{amount}</td>
                    <td className={`px-2 py-2 font-semibold ${color}`}>
                      {type === 'Buy' ? '+' : '-'}${formatSmartNumber(value)}
                    </td>
                    <td className="px-2 py-2 text-neutral-300">
                      <a
                        href={`https://solscan.io/account/${trade.maker || trade.pair_address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#70E0B0] hover:text-[#58B890] transition-colors hover:underline"
                      >
                        {shortAddr(trade.maker || trade.pair_address)}
                      </a>
                    </td>
                  </tr>
                );
              } else {
                // Codex trade format
                const { type, color } = getTradeType(trade.eventDisplayType);
                const amount = getAmount(trade.data, trade.eventDisplayType, token.decimals);
                const totalUSD = getTotalUSD(
                  trade.data.amount0,
                  trade.data.amount1,
                  trade.token0SwapValueUsd,
                  trade.token1SwapValueUsd,
                  trade.eventDisplayType
                );
                const age = getAge(trade.timestamp);
                const trader = shortAddr(trade.maker);
                
                return (
                  <tr key={trade.transactionHash + idx} className="border-b border-neutral-800 hover:bg-neutral-800/60">
                    <td className="px-2 py-2 text-neutral-300">{age}</td>
                    <td className={`px-2 py-2 font-semibold ${color}`}>{type}</td>
                    {/* <td className="px-2 py-2 text-neutral-300">{formatMarketCap(token.market_cap_usd)}</td> */}
                    <td className="px-2 py-2 text-neutral-300">{amount}</td>
                    <td className={`px-2 py-2 font-semibold ${color}`}>
                      {type === 'Buy' || type === 'Add' ? '+' : '-'}${formatSmartNumber(totalUSD)}
                    </td>
                    <td className="px-2 py-2 text-neutral-300">
                      <a
                        href={`https://solscan.io/account/${trade.maker}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#70E0B0] hover:text-[#58B890] transition-colors hover:underline"
                      >
                        {trader}
                      </a>
                    </td>
                  </tr>
                );
              }
            })
          )}
        </tbody>
        </table>
      </div>
    </div>
  );
};

export default CodexTrades;
