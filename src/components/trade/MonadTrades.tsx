import React, { useCallback } from 'react';
import { IoOpenOutline } from 'react-icons/io5';
import { formatSmartNumber } from '~/utils/db';
import { useMonadTradesWebSocket, type MonadTrade } from '~/hooks/useMonadTradesWebSocket';
import { VirtualizedTokenList } from '../VirtualizedTokenList';

// Monad candle colors (matches chart colors)
const MONAD_GREEN = '#86d99f';
const MONAD_RED = '#f26682';

interface MonadTradesProps {
  tokenAddress: string;
  initialTrades?: MonadTrade[];
  cachedTrades?: MonadTrade[]; // Trades from token.recent_trades (instant load)
  onTradesUpdate?: (trades: MonadTrade[]) => void;
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
  const [highlighted, setHighlighted] = React.useState<Set<string>>(new Set());
  const prevHashesRef = React.useRef<Set<string>>(new Set());
  const highlightTimeoutsRef = React.useRef<Map<string, NodeJS.Timeout>>(new Map());

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
    // No cap — virtualization handles large lists efficiently
  });

  // Merge WebSocket trades with cached/initial trades
  const displayTrades = React.useMemo(() => {
    if (wsTrades.length > 0) {
      return wsTrades;
    }
    return effectiveInitialTrades;
  }, [wsTrades, effectiveInitialTrades]);

  // Track newly arrived trades and apply a brief glow by side
  React.useEffect(() => {
    const currentHashes = new Set(displayTrades.map((t) => t.tx_hash));
    const prev = prevHashesRef.current;
    const newOnes = displayTrades.filter((t) => !prev.has(t.tx_hash));

    if (newOnes.length > 0) {
      setHighlighted((prevSet) => {
        const next = new Set(prevSet);
        newOnes.forEach((t) => {
          const hash = t.tx_hash;
          next.add(hash);
          const existingTimeout = highlightTimeoutsRef.current.get(hash);
          if (existingTimeout) clearTimeout(existingTimeout);
          const timeout = setTimeout(() => {
            setHighlighted((prevInner) => {
              const innerNext = new Set(prevInner);
              innerNext.delete(hash);
              return innerNext;
            });
            highlightTimeoutsRef.current.delete(hash);
          }, 1500);
          highlightTimeoutsRef.current.set(hash, timeout);
        });
        return next;
      });
    }

    prevHashesRef.current = currentHashes;

    return () => {
      // clean timeouts on unmount
      highlightTimeoutsRef.current.forEach((t) => clearTimeout(t));
      highlightTimeoutsRef.current.clear();
    };
  }, [displayTrades]);

  // Notify parent when trades update
  React.useEffect(() => {
    if (onTradesUpdate && displayTrades.length > 0) {
      onTradesUpdate(displayTrades);
    }
  }, [displayTrades, onTradesUpdate]);

  const isLoading = loading && displayTrades.length === 0;

  // Virtualized row renderer
  const renderTradeRow = useCallback(
    (trade: MonadTrade, idx: number, style: React.CSSProperties) => {
      const age = getAge(trade.block_timestamp);
      const time = getTimeFromTimestamp(trade.block_timestamp);
      const isBuy = trade.is_buy;
      const typeColor = isBuy ? MONAD_GREEN : MONAD_RED;
      const isHighlighted = highlighted.has(trade.tx_hash);

      return (
        <div
          key={trade.tx_hash || idx}
          style={style}
          className={`flex items-center border-b border-neutral-900 text-xs transition-colors ${
            isHighlighted ? (isBuy ? 'flash-buy' : 'flash-sell') : ''
          }`}
        >
          {/* Age/Time */}
          <div className="w-[12%] pl-3 pr-1 text-neutral-400 truncate">
            {showAge ? age : time}
          </div>

          {/* Type */}
          <div className="w-[10%] px-1 font-semibold" style={{ color: typeColor }}>
            {isBuy ? 'Buy' : 'Sell'}
          </div>

          {/* MON Amount */}
          <div className="w-[20%] px-1 text-right font-mono truncate" style={{ color: typeColor }}>
            {formatMONAmount(trade.mon_amount)}
          </div>

          {/* Token Amount */}
          <div className="w-[22%] px-1 text-right text-neutral-300 font-mono truncate">
            {formatTokenAmount(trade.token_amount)}
          </div>

          {/* Price */}
          <div className="w-[18%] px-1 text-right text-neutral-400 font-mono truncate">
            {formatPriceMON(trade.price_mon)}
          </div>

          {/* Trader */}
          <div className="w-[18%] px-1 pr-3">
            <div className="flex items-center gap-1">
              <span className="text-neutral-300 font-mono truncate">
                {shortAddr(trade.trader_address)}
              </span>
              <a
                href={`https://monadvision.com/address/${trade.trader_address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-500 hover:text-neutral-300 transition-colors flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <IoOpenOutline size={12} />
              </a>
            </div>
          </div>
        </div>
      );
    },
    [showAge, highlighted],
  );

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
      {/* Flash animation styles */}
      <style jsx>{`
        @keyframes flashWaveGreen {
          0% { background-color: rgba(134, 217, 159, 0.22); box-shadow: 0 0 0 0 rgba(134, 217, 159, 0.2); }
          50% { background-color: rgba(134, 217, 159, 0.12); box-shadow: 0 0 0 10px rgba(134, 217, 159, 0.05); }
          100% { background-color: transparent; box-shadow: 0 0 0 0 rgba(134, 217, 159, 0); }
        }
        @keyframes flashWaveRed {
          0% { background-color: rgba(242, 102, 130, 0.24); box-shadow: 0 0 0 0 rgba(242, 102, 130, 0.2); }
          50% { background-color: rgba(242, 102, 130, 0.14); box-shadow: 0 0 0 10px rgba(242, 102, 130, 0.05); }
          100% { background-color: transparent; box-shadow: 0 0 0 0 rgba(242, 102, 130, 0); }
        }
        .flash-buy {
          animation: flashWaveGreen 0.9s ease-out;
        }
        .flash-sell {
          animation: flashWaveRed 0.9s ease-out;
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800" style={{ flexShrink: 0 }}>
        <div className="flex items-center gap-2" />
        <span className="text-xs text-neutral-500">
          {displayTrades.length} trades
        </span>
      </div>

      {/* Column header — sits above virtual list */}
      <div className="flex items-center text-neutral-400 text-xs border-b border-neutral-800 bg-black" style={{ flexShrink: 0 }}>
        <div className="w-[12%] pl-3 pr-1 py-2 text-left">
          <button
            type="button"
            onClick={() => setShowAge(prev => !prev)}
            className="inline-flex items-center gap-0.5 text-[11px] text-neutral-300 hover:text-white"
          >
            <span>{showAge ? 'Age' : 'Time'}</span>
            <span className="text-[10px] text-neutral-500">▾</span>
          </button>
        </div>
        <div className="w-[10%] px-1 py-2 text-left">Type</div>
        <div className="w-[20%] px-1 py-2 text-right">MON</div>
        <div className="w-[22%] px-1 py-2 text-right">Tokens</div>
        <div className="w-[18%] px-1 py-2 text-right">Price</div>
        <div className="w-[18%] px-1 pr-3 py-2 text-left">Trader</div>
      </div>

      {/* Virtualized trade rows (or loading/empty) */}
      {isLoading ? (
        <div className="text-center py-8 text-neutral-500">
          <div className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-neutral-600 rounded-full animate-spin" style={{ borderTopColor: MONAD_GREEN }} />
            <span>Loading trades...</span>
          </div>
        </div>
      ) : displayTrades.length === 0 ? (
        <div className="text-center py-8 text-neutral-500">
          No trades yet
        </div>
      ) : (
        <VirtualizedTokenList
          items={displayTrades}
          itemSize={44}
          renderRow={renderTradeRow}
          overscanCount={10}
          className="bg-black"
        />
      )}
    </div>
  );
};

export default MonadTrades;
