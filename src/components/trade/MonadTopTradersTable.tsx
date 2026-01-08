import React from 'react';
import { formatSmartNumber } from '~/utils/db';
import useMonadTopTraders from '../../hooks/useMonadTopTraders';

// Monad candle colors (matches chart colors)
const MONAD_GREEN = '#86d99f';
const MONAD_RED = '#f26682';

interface MonadTopTradersTableProps {
  tokenAddress: string | undefined;
  enabled?: boolean;
}

function shortAddr(addr: string) {
  if (!addr) return '';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function getAge(timestamp: number) {
  const now = Date.now() / 1000;
  const diffSeconds = Math.floor(now - timestamp);
  const diffMins = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffSeconds / 3600);
  const diffDays = Math.floor(diffSeconds / 86400);

  if (diffSeconds < 0) return '0s';
  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  if (diffMins > 0) return `${diffMins}m`;
  return `${diffSeconds}s`;
}

function formatPrice(price: number | null): string {
  if (price === null || price === undefined || isNaN(price) || price === 0) return '-';
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  if (price >= 0.0001) return `$${price.toFixed(6)}`;
  return `$${price.toFixed(8)}`;
}

function formatMarketCap(mc: number | null): string {
  if (mc === null || mc === undefined || isNaN(mc) || mc === 0) return '-';
  if (mc >= 1000000) return `$${(mc / 1000000).toFixed(1)}M`;
  if (mc >= 1000) return `$${(mc / 1000).toFixed(1)}K`;
  return `$${mc.toFixed(2)}`;
}

const MonadTopTradersTable: React.FC<MonadTopTradersTableProps> = ({ 
  tokenAddress, 
  enabled = true 
}) => {
  const { traders, isLoading, error } = useMonadTopTraders(tokenAddress, {
    limit: 20,
    enabled,
  });

  if (error) {
    return (
      <div className="w-full p-4">
        <div className="mb-4 p-2 rounded-lg" style={{ backgroundColor: `${MONAD_RED}20`, border: `1px solid ${MONAD_RED}4D` }}>
          <p className="text-xs" style={{ color: MONAD_RED }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: '#101114' }}>
      <div className="flex-1 min-h-0 overflow-y-auto pb-18" style={{ backgroundColor: '#101114' }}>
        <table className="w-full text-xs border-collapse" style={{ backgroundColor: '#101114' }}>
          <thead className="sticky top-0 bg-black z-10">
            <tr className="text-neutral-400 border-b border-neutral-800">
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">Wallet</th>
              <th className="px-2 py-2 text-left">Trades</th>
              <th className="px-2 py-2 text-left">Bought</th>
              <th className="px-2 py-2 text-left">Sold</th>
              {/* <th className="px-2 py-2 text-left">Remaining</th> */}
              <th className="px-2 py-2 text-left">Realized P&L</th>
              {/* <th className="px-2 py-2 text-left">Unrealized P&L</th> */}
              <th className="px-2 py-2 text-left">Total P&L</th>
              <th className="px-2 py-2 text-left">Last Trade</th>
            </tr>
          </thead>
          <tbody className="bg-black">
            {isLoading ? (
              <tr className="bg-black">
                <td colSpan={8} className="text-center py-6 text-neutral-500 bg-black">
                  Loading top traders...
                </td>
              </tr>
            ) : traders.length === 0 ? (
              <tr className="bg-black">
                <td colSpan={8} className="text-center py-6 text-neutral-500 bg-black">
                  No top traders found.
                </td>
              </tr>
            ) : (
              traders.map((trader, idx) => {
                const realizedPnL = trader.realized_pnl_usd;
                const unrealizedPnL = trader.unrealized_pnl_usd;
                const totalPnL = trader.total_pnl_usd;
                
                return (
                  <tr
                    key={trader.wallet_address}
                    className="border-b border-neutral-900 hover:bg-neutral-900/60 bg-black"
                  >
                    {/* Rank */}
                    <td className="px-2 py-2 text-neutral-400">
                      {idx + 1}
                    </td>
                    
                    {/* Wallet Address */}
                    <td className="px-2 py-2 text-neutral-300">
                      <a
                        href={`https://monadvision.com/address/${trader.wallet_address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-300 hover:underline font-mono"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {shortAddr(trader.wallet_address)}
                      </a>
                    </td>
                    
                    {/* Trade Count */}
                    <td className="px-2 py-2 text-neutral-300">
                      <div>
                        <div>{trader.trade_count}</div>
                        <div className="text-xs text-neutral-500">
                          {trader.buy_count} Buy / {trader.sell_count} Sell
                        </div>
                      </div>
                    </td>
                    
                    {/* Bought */}
                    <td className="px-2 py-2 text-neutral-300">
                      <div>
                        <div style={{ color: MONAD_GREEN }}>${formatSmartNumber(trader.total_bought_usd)}</div>
                        <div className="text-xs text-neutral-500">
                          {formatSmartNumber(trader.tokens_bought)}
                        </div>
                      </div>
                    </td>
                    
                    {/* Sold */}
                    <td className="px-2 py-2 text-neutral-300">
                      <div>
                        <div style={{ color: MONAD_RED }}>${formatSmartNumber(trader.total_sold_usd)}</div>
                        <div className="text-xs text-neutral-500">
                          {formatSmartNumber(trader.tokens_sold)}
                        </div>
                      </div>
                    </td>
                    
                    {/* Remaining */}
                    {/* <td className="px-2 py-2 text-neutral-300">
                      <div>
                        <div>${formatSmartNumber(trader.current_value_usd)}</div>
                        <div className="text-xs text-neutral-500">
                          {formatSmartNumber(trader.tokens_remaining)}
                        </div>
                      </div>
                    </td> */}
                    
                    {/* Realized P&L */}
                    <td className="px-2 py-2">
                      <div className="font-semibold" style={{ color: realizedPnL >= 0 ? MONAD_GREEN : MONAD_RED }}>
                        {realizedPnL >= 0 ? '+' : ''}${formatSmartNumber(realizedPnL)}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {trader.realized_pnl_percent >= 0 ? '+' : ''}{trader.realized_pnl_percent.toFixed(2)}%
                      </div>
                    </td>
                    
                    {/* Unrealized P&L */}
                    {/* <td className="px-2 py-2">
                      <div className="font-semibold" style={{ color: unrealizedPnL >= 0 ? MONAD_GREEN : MONAD_RED }}>
                        {unrealizedPnL >= 0 ? '+' : ''}${formatSmartNumber(unrealizedPnL)}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {trader.unrealized_pnl_percent >= 0 ? '+' : ''}{trader.unrealized_pnl_percent.toFixed(2)}%
                      </div>
                    </td> */}
                    
                    {/* Total P&L */}
                    <td className="px-2 py-2">
                      <div className="font-semibold" style={{ color: totalPnL >= 0 ? MONAD_GREEN : MONAD_RED }}>
                        {totalPnL >= 0 ? '+' : ''}${formatSmartNumber(totalPnL)}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {trader.total_pnl_percent >= 0 ? '+' : ''}{trader.total_pnl_percent.toFixed(2)}%
                      </div>
                    </td>
                    
                    {/* Last Trade */}
                    <td className="px-2 py-2 text-neutral-300">
                      {getAge(trader.last_trade_at)}
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

export default MonadTopTradersTable;

