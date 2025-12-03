import React from 'react';
import { formatSmartNumber } from '~/utils/db';
import useMonadHolders from '../../hooks/useMonadHolders';
import type { MonadHolder } from '../../hooks/useMonadHolders';

interface MonadHoldersTableProps {
  tokenAddress: string | undefined;
  enabled?: boolean;
}

function shortAddr(addr: string) {
  if (!addr) return '';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
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

const MonadHoldersTable: React.FC<MonadHoldersTableProps> = ({ 
  tokenAddress, 
  enabled = true 
}) => {
  const { holders, isLoading, error } = useMonadHolders(tokenAddress, {
    limit: 20,
    enabled,
  });

  if (error) {
    return (
      <div className="w-full p-4">
        <div className="mb-4 p-2 bg-red-900/20 border border-red-500/30 rounded-lg">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-black">
      <div className="flex-1 min-h-0 bg-black">
        <table className="w-full text-xs border-collapse bg-black">
          <thead className="sticky top-0 bg-black z-10">
            <tr className="text-neutral-400 border-b border-neutral-800">
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">Wallet</th>
              <th className="px-2 py-2 text-left">Balance</th>
              <th className="px-2 py-2 text-left">Bought</th>
              <th className="px-2 py-2 text-left">P&L</th>
              <th className="px-2 py-2 text-left">Trades</th>
              <th className="px-2 py-2 text-left">Last Active</th>
            </tr>
          </thead>
          <tbody className="bg-black">
            {isLoading ? (
              <tr className="bg-black">
                <td colSpan={7} className="text-center py-6 text-neutral-500 bg-black">
                  Loading holders...
                </td>
              </tr>
            ) : holders.length === 0 ? (
              <tr className="bg-black">
                <td colSpan={7} className="text-center py-6 text-neutral-500 bg-black">
                  No holders found.
                </td>
              </tr>
            ) : (
              holders.map((holder, idx) => {
                const totalPnL = holder.total_pnl_usd;
                
                return (
                  <tr
                    key={holder.wallet_address}
                    className="border-b border-neutral-900 hover:bg-neutral-900/60 bg-black"
                  >
                    {/* Rank */}
                    <td className="px-2 py-2 text-neutral-400">
                      {idx + 1}
                    </td>
                    
                    {/* Wallet Address */}
                    <td className="px-2 py-2 text-neutral-300">
                      <a
                        href={`https://monadvision.com/address/${holder.wallet_address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-300 hover:underline font-mono"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {shortAddr(holder.wallet_address)}
                      </a>
                    </td>
                    
                    {/* Balance */}
                    <td className="px-2 py-2 text-neutral-300">
                      <div>
                        <div className="font-semibold">${formatSmartNumber(holder.mon_balance_usd)}</div>
                        <div className="text-xs text-neutral-500">
                          {formatSmartNumber(holder.tokens_remaining)}
                        </div>
                      </div>
                    </td>
                    
                    {/* Bought */}
                    <td className="px-2 py-2 text-neutral-300">
                      <div>
                        <div className="text-emerald-400">${formatSmartNumber(holder.total_bought_usd)}</div>
                        <div className="text-xs text-neutral-500">
                          {formatSmartNumber(holder.tokens_bought)}
                        </div>
                      </div>
                    </td>
                    
                    {/* P&L */}
                    <td className="px-2 py-2">
                      <div className={`font-semibold ${totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {totalPnL >= 0 ? '+' : ''}${formatSmartNumber(totalPnL)}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {holder.total_pnl_percent >= 0 ? '+' : ''}{holder.total_pnl_percent.toFixed(2)}%
                      </div>
                    </td>
                    
                    {/* Trades */}
                    <td className="px-2 py-2 text-neutral-300">
                      <div>
                        <div>{holder.trade_count}</div>
                        <div className="text-xs text-neutral-500">
                          {holder.buy_count} Buy / {holder.sell_count} Sell
                        </div>
                      </div>
                    </td>
                    
                    {/* Last Active */}
                    <td className="px-2 py-2 text-neutral-300">
                      {getAge(holder.last_active_at)} ago
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

export default MonadHoldersTable;

