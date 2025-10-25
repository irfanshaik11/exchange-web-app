import React from 'react';
import { formatSmartNumber } from '~/utils/db';
import useCodexTopTraders from '../../hooks/useCodexTopTraders';
import type { Token } from '~/utils/db';
import { FaExternalLinkAlt, FaCrown, FaBullseye, FaLeaf, FaLink, FaStar } from 'react-icons/fa';

interface CodexTopTradersProps {
  token: Token | null;
}

function getAge(timestamp: number) {
  const now = Date.now() / 1000;
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
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function getTraderIcon(index: number) {
  const icons = [
    <FaCrown className="text-yellow-400" />,
    <FaStar className="text-pink-400" />,
    <FaBullseye className="text-blue-400" />,
    <FaLeaf className="text-green-400" />,
    <FaLink className="text-gray-400" />,
  ];
  return icons[index % icons.length];
}

function formatVolume(volumeUsd: string) {
  const volume = parseFloat(volumeUsd);
  if (volume >= 1000000) {
    return `${(volume / 1000000).toFixed(1)}M`;
  } else if (volume >= 1000) {
    return `${(volume / 1000).toFixed(1)}K`;
  }
  return volume.toFixed(0);
}

function formatPrice(amountUsd: string, tokenAmount: string) {
  const usd = parseFloat(amountUsd);
  const tokens = parseFloat(tokenAmount);
  if (tokens === 0) return '$0';
  
  const price = usd / tokens;
  if (price >= 1000) {
    return `$${(price / 1000).toFixed(1)}K`;
  }
  return `$${price.toFixed(2)}`;
}

const CodexTopTraders: React.FC<CodexTopTradersProps> = ({ token }) => {
  // Only show skeleton if we have absolutely no token data (not even optimistic)
  if (!token || (!token.name && !token.symbol)) {
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

  const { traders, isLoading, error } = useCodexTopTraders(token.mint || '', {
    limit: 20,
    tradingPeriod: 'WEEK'
  });

  return (
    <div className="w-full">
      
      {error && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="overflow-y-auto max-h-96">
        <table className="w-full text-xs">
        <thead>
          <tr className="text-neutral-400 border-b border-neutral-800">
            <th className="px-2 py-2 text-left">Wallet</th>
            <th className="px-2 py-2 text-left">Bought (Avg Buy)</th>
            <th className="px-2 py-2 text-left">Sold (Avg Sell)</th>
            <th className="px-2 py-2 text-left">PnL</th>
            <th className="px-2 py-2 text-left">Remaining</th>
            <th className="px-2 py-2 text-left">Funding</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={6} className="text-center py-6 text-neutral-500">
                Loading top traders...
              </td>
            </tr>
          ) : !traders || traders.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-center py-6 text-neutral-500">
                No top traders found.
              </td>
            </tr>
          ) : (
            traders.map((trader, idx) => {
              const boughtUsd = parseFloat(trader.amountBoughtUsd);
              const soldUsd = parseFloat(trader.amountSoldUsd);
              const volumeUsd = parseFloat(trader.volumeUsd);
              const realizedProfit = parseFloat(trader.realizedProfitUsd);
              const realizedProfitPct = trader.realizedProfitPercentage * 100;
              const tokenBalance = parseFloat(trader.tokenBalance);
              const lastActive = getAge(trader.lastTransactionAt);
              const wallet = shortAddr(trader.walletAddress);
              
              // Calculate average buy/sell prices
              const avgBuyPrice = formatPrice(trader.amountBoughtUsd, trader.tokenAmountBought);
              const avgSellPrice = formatPrice(trader.amountSoldUsd, trader.tokenAmountSold);
              
              return (
                <tr key={trader.walletAddress} className="border-b border-neutral-800 hover:bg-neutral-800/60">
                  <td className="px-2 py-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-neutral-500">{idx + 1}</span>
                      <div className="flex items-center space-x-1">
                        <span className="text-neutral-500">⚙️</span>
                        <span className="text-neutral-500">🔗</span>
                      </div>
                      <span className="text-white font-mono">{wallet}</span>
                      <div className="flex items-center">
                        {getTraderIcon(idx)}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div>
                      <div className="text-emerald-400 font-semibold">${formatSmartNumber(boughtUsd)}</div>
                      <div className="text-neutral-500">({avgBuyPrice})</div>
                      <div className="text-neutral-500">{formatVolume(trader.volumeUsd)} / {trader.buys}</div>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div>
                      <div className="text-red-400 font-semibold">${formatSmartNumber(soldUsd)}</div>
                      <div className="text-neutral-500">({avgSellPrice})</div>
                      <div className="text-neutral-500">{formatVolume(trader.volumeUsd)} / {trader.sells}</div>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className={`font-semibold ${realizedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {realizedProfit >= 0 ? '+' : ''}${formatSmartNumber(realizedProfit)}
                    </div>
                    <div className="text-neutral-500">{realizedProfitPct.toFixed(2)}%</div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="text-neutral-400">
                      ${formatSmartNumber(tokenBalance)} 0%
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center space-x-1">
                      <span className="text-neutral-500">↗️</span>
                      <span className="text-white font-mono">{shortAddr(trader.walletAddress)}</span>
                    </div>
                    <div className="text-neutral-500">{lastActive}</div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
};

export default CodexTopTraders;
