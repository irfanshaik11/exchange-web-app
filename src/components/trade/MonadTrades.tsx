import React from 'react';
import { IoOpenOutline } from 'react-icons/io5';
import { formatSmartNumber } from '~/utils/db';
import { useMonadTradesWebSocket, type MonadTrade } from '~/hooks/useMonadTradesWebSocket';

interface MonadTradesProps {
  tokenAddress: string;
  initialTrades?: MonadTrade[];
  cachedTrades?: MonadTrade[]; // Trades from token.recent_trades (instant load)
  onTradesUpdate?: (trades: MonadTrade[]) => void;
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

function getTimeFromTimestamp(ts: number) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function shortAddr(addr: string) {
  if (!addr) return '';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function formatMONAmount(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!Number.isFinite(num) || num <= 0) return '0';
  if (num >= 1000) return formatSmartNumber(num);
  if (num >= 1) return num.toFixed(4);
  if (num >= 0.0001) return num.toFixed(6);
  return num.toFixed(8);
}

function formatTokenAmount(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!Number.isFinite(num) || num <= 0) return '0';
  return formatSmartNumber(num);
}

function formatPriceMON(price: string | number): string {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  if (!Number.isFinite(num) || num <= 0) return '-';
  if (num >= 0.01) return num.toFixed(6);
  if (num >= 0.0001) return num.toFixed(8);
  if (num >= 0.000001) return num.toFixed(10);
  return num.toExponential(4);
}

const MonadTrades: React.FC<MonadTradesProps> = ({
  tokenAddress,
  initialTrades = [],
  cachedTrades = [],
  onTradesUpdate
}) => {
  const [showAge, setShowAge] = React.useState(true);

  // Use cached trades from token data if available (instant load)
  const effectiveInitialTrades = React.useMemo(() => {
    if (cachedTrades && cachedTrades.length > 0) {
      return cachedTrades;
    }
    return initialTrades;
  }, [cachedTrades, initialTrades]);

  const { trades: wsTrades, loading, connected, error } = useMonadTradesWebSocket({
    tokenAddress,
    enabled: !!tokenAddress,
    maxTrades: 100,
  });

  // Merge WebSocket trades with cached/initial trades
  const displayTrades = React.useMemo(() => {
    if (wsTrades.length > 0) {
      return wsTrades;
    }
    return effectiveInitialTrades;
  }, [wsTrades, effectiveInitialTrades]);

  // Notify parent when trades update
  React.useEffect(() => {
    if (onTradesUpdate && displayTrades.length > 0) {
      onTradesUpdate(displayTrades);
    }
  }, [displayTrades, onTradesUpdate]);

  const isLoading = loading && displayTrades.length === 0;

  if (!tokenAddress) {
    return (
      <div className="flex-1 min-h-0 p-4 bg-black">
        <div className="text-neutral-500 text-center py-6">
          Select a token to view trades
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">Live Trades</span>
          {connected && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Connected" />
          )}
          {error && (
            <span className="text-xs text-red-400" title={error}>Disconnected</span>
          )}
        </div>
        <span className="text-xs text-neutral-500">
          {displayTrades.length} trades
        </span>
      </div>

      {/* Trade Table */}
      <div className="flex-1 overflow-y-auto pb-4">
        <table className="w-full text-xs border-collapse table-fixed">
          <thead className="sticky top-0 bg-black z-10">
            <tr className="text-neutral-400 border-b border-neutral-800">
              <th className="w-[12%] pl-3 pr-1 py-2 text-left">
                <button
                  type="button"
                  onClick={() => setShowAge(prev => !prev)}
                  className="inline-flex items-center gap-0.5 text-[11px] text-neutral-300 hover:text-white"
                >
                  <span>{showAge ? 'Age' : 'Time'}</span>
                  <span className="text-[10px] text-neutral-500">▾</span>
                </button>
              </th>
              <th className="w-[10%] px-1 py-2 text-left">Type</th>
              <th className="w-[20%] px-1 py-2 text-right">MON</th>
              <th className="w-[22%] px-1 py-2 text-right">Tokens</th>
              <th className="w-[18%] px-1 py-2 text-right">Price</th>
              <th className="w-[18%] px-1 pr-3 py-2 text-left">Trader</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-neutral-500">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-neutral-600 border-t-emerald-400 rounded-full animate-spin" />
                    <span>Loading trades...</span>
                  </div>
                </td>
              </tr>
            ) : displayTrades.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-neutral-500">
                  No trades yet
                </td>
              </tr>
            ) : (
              displayTrades.map((trade, idx) => {
                const age = getAge(trade.block_timestamp);
                const time = getTimeFromTimestamp(trade.block_timestamp);
                const isBuy = trade.is_buy;
                const typeColor = isBuy ? 'text-emerald-400' : 'text-red-400';
                const rowBg = isBuy ? 'hover:bg-emerald-950/20' : 'hover:bg-red-950/20';

                return (
                  <tr
                    key={trade.tx_hash || idx}
                    className={`border-b border-neutral-900 ${rowBg} transition-colors`}
                  >
                    {/* Age/Time */}
                    <td className="pl-3 pr-1 py-2 text-neutral-400">
                      {showAge ? age : time}
                    </td>

                    {/* Type */}
                    <td className={`px-1 py-2 font-semibold ${typeColor}`}>
                      {isBuy ? 'Buy' : 'Sell'}
                    </td>

                    {/* MON Amount */}
                    <td className={`px-1 py-2 text-right font-mono ${typeColor}`}>
                      {formatMONAmount(trade.mon_amount)}
                    </td>

                    {/* Token Amount */}
                    <td className="px-1 py-2 text-right text-neutral-300 font-mono">
                      {formatTokenAmount(trade.token_amount)}
                    </td>

                    {/* Price */}
                    <td className="px-1 py-2 text-right text-neutral-400 font-mono">
                      {formatPriceMON(trade.price_mon)}
                    </td>

                    {/* Trader */}
                    <td className="px-1 pr-3 py-2">
                      <div className="flex items-center gap-1">
                        <span className="text-neutral-300 font-mono">
                          {shortAddr(trade.trader_address)}
                        </span>
                        <a
                          href={`https://testnet.monadexplorer.com/address/${trade.trader_address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-neutral-500 hover:text-neutral-300 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <IoOpenOutline size={12} />
                        </a>
                      </div>
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

export default MonadTrades;
