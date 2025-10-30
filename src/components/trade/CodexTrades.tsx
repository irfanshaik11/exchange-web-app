import React from 'react';
import { formatSmartNumber, formatSmallPrice } from '~/utils/db';
import useCodexTradesWebSocket from '../../hooks/useCodexTradesWebSocket';
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
  // Use amount0 for token amount (this is the non-liquidity token amount)
  const rawAmount = parseFloat(data.amount0);
  // Convert from raw token units to display units
  const displayAmount = rawAmount / Math.pow(10, tokenDecimals);
  return formatSmartNumber(displayAmount);
}

function getTotalUSD(
  amount0: string,
  amount1: string,
  token0SwapValueUsd: string,
  token1SwapValueUsd: string,
  eventDisplayType: string,
  swapData?: any // New parameter for enhanced swap data
) {
  // If we have enhanced swap data with priceUsdTotal, use that
  if (swapData && swapData.priceUsdTotal) {
    return parseFloat(swapData.priceUsdTotal);
  }
  
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
  // Stabilize token object to prevent hook parameter changes and unnecessary re-renders
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

  // Stabilize initialTrades to prevent WebSocket re-initialization
  const stableInitialTrades = React.useMemo(() => initialTrades, [initialTrades.length]);

  // CRITICAL: Call hooks BEFORE any conditional returns to prevent React hooks violation
  // Simplified WebSocket connection - use only one WebSocket hook
  const {
    isConnected: wsConnected,
    loading: wsLoading,
    error: wsError,
    trades: wsTrades,
    getTradeStats,
    getMemoryStats,
  } = useOptimizedTradeEventsWebSocket({
    pairAddress: stableToken?.pair_address,
    enabled: !!stableToken?.pair_address,
    initialTrades: stableInitialTrades,
    tokenDecimals: stableToken?.decimals || 9,
    maxTrades: 200, // Reduced for faster processing
    enableDeduplication: true,
  });

  // Use WebSocket trades if available, otherwise show initial trades immediately
  // Prioritize WebSocket data but fallback to initial trades for better data persistence
  const displayTrades = wsTrades.length > 0 ? wsTrades : stableInitialTrades;
  const isConnected = wsConnected || stableInitialTrades.length > 0; // Consider connected if we have initial data
  const error = wsError;
  const isLoading = wsLoading && stableInitialTrades.length === 0; // Only show loading if no initial data

  // Only show skeleton if we have absolutely no token data (not even optimistic)
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
                const isBuy = trade.side === 'buy';
                const color = isBuy ? 'text-emerald-400' : 'text-red-400';
                const age = getAge(new Date(trade.timestamp).getTime() / 1000);
                
                // Use the pre-calculated values from websocket processing
                const tokenAmount = parseFloat(trade.amount);
                const totalUSD = trade.totalUSD !== undefined ? trade.totalUSD : parseFloat(trade.price);
                const pricePerToken = parseFloat(trade.price);
                
                // Format retention (token amount) - ensure proper K/M/B formatting
                const retention = formatSmartNumber(tokenAmount);
                
                return (
                  <tr key={trade.pair_address + idx + trade.timestamp} className="border-b border-neutral-800 hover:bg-neutral-800/60">
                    <td className="px-2 py-2 text-neutral-300">{age}</td>
                    <td className={`px-2 py-2 font-semibold ${color}`}>${formatSmallPrice(pricePerToken)}</td>
                    <td className={`px-2 py-2 font-semibold ${color}`}>${totalUSD.toFixed(2)}</td>
                    <td className="px-2 py-2 text-neutral-300">{retention}</td>
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
                // Handle both Codex and backend trade formats
                // Determine which format we have
                const hasBackendFormat = trade.event_type && (trade.amount || trade.price_in_usd);
                const hasCodexFormat = trade.eventDisplayType && trade.data;
                
                // Determine buy/sell and color
                let isBuy = false;
                let color = 'text-neutral-400';
                
                if (hasBackendFormat) {
                  isBuy = trade.event_type === 'BUY';
                } else if (hasCodexFormat) {
                  isBuy = trade.eventDisplayType === 'Buy';
                }
                color = isBuy ? 'text-emerald-400' : 'text-red-400';
                
                // Handle timestamp - convert to seconds
                let timestampInSeconds: number;
                if (typeof trade.timestamp === 'number') {
                  // Check if already in seconds or milliseconds
                  // If timestamp is less than 10^10, it's in seconds
                  // If timestamp is >= 10^10, it's in milliseconds
                  timestampInSeconds = trade.timestamp < 10000000000 ? trade.timestamp : trade.timestamp / 1000;
                } else if (typeof trade.timestamp === 'string') {
                  timestampInSeconds = new Date(trade.timestamp).getTime() / 1000;
                } else {
                  timestampInSeconds = Date.now() / 1000;
                }
                const age = getAge(timestampInSeconds);
                
                // Calculate price and amounts based on format
                let tokenAmount: number;
                let totalUSD: number;
                let pricePerToken: number;
                
                if (hasBackendFormat) {
                  // Backend format: flat structure
                  tokenAmount = trade.amount || 0;
                  totalUSD = trade.total_usd || 0;
                  pricePerToken = trade.price_in_usd || 0;
                } else if (hasCodexFormat && trade.data) {
                  // Codex format: nested structure
                  // Get token amount
                  tokenAmount = parseFloat(String(trade.data.amountNonLiquidityToken || trade.data.amount0 || 0));
                  // Get total USD value (already calculated by API)
                  totalUSD = parseFloat(String(trade.data.priceUsdTotal || 0));
                  // Get price per token (already calculated by API)
                  pricePerToken = parseFloat(String(trade.data.priceUsd || 0));
                  
                  // Fallback: if priceUsd is not available, calculate it
                  if (!pricePerToken && tokenAmount > 0 && totalUSD > 0) {
                    pricePerToken = totalUSD / tokenAmount;
                  }
                  
                  // Debug logging
                  if (process.env.NODE_ENV === 'development' && (!pricePerToken || !totalUSD || !tokenAmount)) {
                    console.log('[CodexTrades] Debug trade data:', {
                      priceUsd: trade.data.priceUsd,
                      priceUsdTotal: trade.data.priceUsdTotal,
                      amountNonLiquidityToken: trade.data.amountNonLiquidityToken,
                      calculated: { tokenAmount, totalUSD, pricePerToken }
                    });
                  }
                } else {
                  // Fallback for unknown format
                  tokenAmount = 0;
                  totalUSD = 0;
                  pricePerToken = 0;
                }
                
                // Format retention (token amount) - ensure proper K/M/B formatting
                const retention = formatSmartNumber(tokenAmount);
                
                // Get the right key and maker based on format
                const tradeKey = hasBackendFormat 
                  ? (trade.transaction_hash || trade.id || '') + idx
                  : (trade.transactionHash || '') + idx;
                const makerAddress = trade.maker || '';
                
                return (
                  <tr key={tradeKey} className="border-b border-neutral-800 hover:bg-neutral-800/60">
                    <td className="px-2 py-2 text-neutral-300">{age}</td>
                    <td className={`px-2 py-2 font-semibold ${color}`}>${formatSmallPrice(pricePerToken)}</td>
                    <td className={`px-2 py-2 font-semibold ${color}`}>${totalUSD.toFixed(2)}</td>
                    <td className="px-2 py-2 text-neutral-300">{retention}</td>
                    <td className="px-2 py-2 text-neutral-300">
                      <a
                        href={`https://solscan.io/account/${makerAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#70E0B0] hover:text-[#58B890] transition-colors hover:underline"
                        title={hasCodexFormat ? `Block: ${trade.blockNumber || 'N/A'} | Wallet Age: ${trade.walletAge ? `${Math.floor(trade.walletAge / 86400)}d` : 'N/A'}` : ''}
                      >
                        {shortAddr(makerAddress)}
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
