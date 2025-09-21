import React from 'react';
import { formatSmartNumber } from '~/utils/db';
import useCodexHolders from '../../hooks/useCodexHolders';
import type { Token } from '~/utils/db';
import { FaExternalLinkAlt, FaCrown, FaBullseye, FaLeaf, FaLink, FaStar, FaTint } from 'react-icons/fa';

interface CodexHoldersProps {
  token: Token;
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

function getHolderIcon(index: number, address: string) {
  // Special icons for specific addresses
  if (address.includes('LIQUIDITY') || address.includes('POOL')) {
    return <FaTint className="text-blue-400" />;
  }
  
  const icons = [
    <FaCrown className="text-yellow-400" />,
    <FaStar className="text-pink-400" />,
    <FaBullseye className="text-red-400" />,
    <FaLeaf className="text-green-400" />,
    <FaLink className="text-gray-400" />,
  ];
  return icons[index % icons.length];
}

function formatAmount(amount: string) {
  const amt = parseFloat(amount);
  if (amt >= 1000000) {
    return `$${(amt / 1000000).toFixed(1)}M`;
  } else if (amt >= 1000) {
    return `$${(amt / 1000).toFixed(1)}K`;
  }
  return `$${amt.toFixed(3)}`;
}

function formatTokenAmount(amount: string) {
  const amt = parseFloat(amount);
  if (amt >= 1000000) {
    return `${(amt / 1000000).toFixed(1)}M`;
  } else if (amt >= 1000) {
    return `${(amt / 1000).toFixed(1)}K`;
  }
  return amt.toFixed(3);
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

function formatPercentage(percentage: number) {
  return `${percentage.toFixed(2)}%`;
}

const CodexHolders: React.FC<CodexHoldersProps> = ({ token }) => {
  const { holders, isLoading, error, isConnected } = useCodexHolders(token.mint);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Holders</h3>
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-400'}`}></div>
          <span className="text-xs text-neutral-400">
            {isConnected ? 'Live' : 'Disconnected'}
          </span>
          <span className="text-sm text-neutral-400">({holders.length})</span>
        </div>
      </div>
      
      {error && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

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
                Loading holders...
              </td>
            </tr>
          ) : !holders || holders.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-center py-6 text-neutral-500">
                No holders found.
              </td>
            </tr>
          ) : (
            holders.map((holder, idx) => {
              const boughtUsd = parseFloat(holder.amountBoughtUsd30d);
              const soldUsd = parseFloat(holder.amountSoldUsd30d);
              const realizedProfit = parseFloat(holder.realizedProfitUsd30d);
              const realizedProfitPct = holder.realizedProfitPercentage30d * 100;
              const tokenBalance = parseFloat(holder.tokenBalance);
              const lastActive = getAge(holder.lastTransactionAt);
              const wallet = shortAddr(holder.address);
              const acquisitionCost = parseFloat(holder.tokenAcquisitionCostUsd);
              
              // Calculate average buy/sell prices
              const avgBuyPrice = formatPrice(holder.amountBoughtUsd30d, holder.tokenAmountBought30d);
              const avgSellPrice = formatPrice(holder.amountSoldUsd30d, holder.tokenAmountSold30d);
              
              return (
                <tr key={holder.address} className="border-b border-neutral-800 hover:bg-neutral-800/60">
                  <td className="px-2 py-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-neutral-500">{idx + 1}</span>
                      <div className="flex items-center space-x-1">
                        <span className="text-neutral-500">⚙️</span>
                        <span className="text-neutral-500">🔗</span>
                      </div>
                      <span className="text-white font-mono">{wallet}</span>
                      <div className="flex items-center">
                        {getHolderIcon(idx, holder.address)}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div>
                      <div className="text-emerald-400 font-semibold">{formatAmount(holder.amountBoughtUsd30d)}</div>
                      <div className="text-neutral-500">({avgBuyPrice})</div>
                      <div className="text-neutral-500">{formatTokenAmount(holder.tokenAmountBought30d)} / {holder.buys30d}</div>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div>
                      <div className="text-red-400 font-semibold">{formatAmount(holder.amountSoldUsd30d)}</div>
                      <div className="text-neutral-500">({avgSellPrice})</div>
                      <div className="text-neutral-500">{formatTokenAmount(holder.tokenAmountSold30d)} / {holder.sells30d}</div>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className={`font-semibold ${realizedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {realizedProfit >= 0 ? '+' : ''}{formatAmount(holder.realizedProfitUsd30d)}
                    </div>
                    <div className="text-neutral-500">{formatPercentage(realizedProfitPct)}</div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="text-white font-semibold">{formatAmount(holder.tokenBalance)}</div>
                    <div className="text-neutral-500">{formatPercentage(realizedProfitPct)}</div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center space-x-1">
                      <span className="text-neutral-500">↗️</span>
                      <span className="text-white font-mono">{shortAddr(holder.address)}</span>
                    </div>
                    <div className="text-neutral-500">{lastActive} • {formatAmount(holder.tokenAcquisitionCostUsd)}</div>
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

export default CodexHolders;
