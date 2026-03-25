import React, { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { HiOutlineChevronRight, HiOutlineChevronLeft, HiOutlineRefresh } from 'react-icons/hi';
import usePolymarketOrderBook, {
  formatOrderBookPrice,
  formatOrderBookSize,
  type OrderBookData,
} from '~/hooks/usePolymarketOrderBook';

// Color palette
const AX = {
  bg: '#111214',
  surface: '#1E1F26',
  border: '#2A2B33',
  text: '#f0f5f5',
  muted: '#9CA3AF',
  green: '#4ADE80',
  greenBg: 'rgba(74, 222, 128, 0.15)',
  red: '#F87171',
  redBg: 'rgba(248, 113, 113, 0.15)',
  blue: '#60A5FA',
};

const ASK_RGB = '248, 113, 113';
const BID_RGB = '74, 222, 128';

interface PolymarketOrderBookProps {
  yesTokenId?: string;
  noTokenId?: string;
  marketTitle?: string;
  defaultOpen?: boolean;
  className?: string;
  isMultiOutcome?: boolean;
}

// Single side order book display
const OrderBookSide: React.FC<{
  data: OrderBookData | null;
  side: 'yes' | 'no';
  isLoading: boolean;
}> = ({ data, side, isLoading }) => {
  const isYes = side === 'yes';
  const color = isYes ? AX.green : AX.red;
  const bgColor = isYes ? AX.greenBg : AX.redBg;

  // Calculate max size for bar width scaling
  const maxBidSize = useMemo(() => {
    if (!data?.bids) return 1;
    return Math.max(...data.bids.map(b => parseFloat(b.size)), 1);
  }, [data?.bids]);

  const maxAskSize = useMemo(() => {
    if (!data?.asks) return 1;
    return Math.max(...data.asks.map(a => parseFloat(a.size)), 1);
  }, [data?.asks]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-8">
        <HiOutlineRefresh className="w-5 h-5 animate-spin" style={{ color: AX.muted }} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center py-8">
        <span className="text-xs" style={{ color: AX.muted }}>No data</span>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${AX.border}` }}>
        <span className="text-xs font-semibold" style={{ color }}>
          {isYes ? 'YES' : 'NO'}
        </span>
        {data.midPrice && (
          <span className="text-xs" style={{ color: AX.muted }}>
            Mid: {formatOrderBookPrice(data.midPrice)}
          </span>
        )}
      </div>

      {/* Column headers */}
      <div className="flex-shrink-0 flex items-center px-3 py-1.5 text-[10px] font-medium" style={{ color: AX.muted, borderBottom: `1px solid ${AX.border}` }}>
        <span className="w-16">Price</span>
        <span className="flex-1 text-right">Size</span>
        <span className="w-16 text-right">Total</span>
      </div>

      {/* Asks (sell orders) - displayed in reverse, takes half the remaining space */}
      <div className="flex-1 overflow-y-auto flex flex-col-reverse">
        {data.asks.map((ask, idx) => {
          const size = parseFloat(ask.size);
          const ratio = size / maxAskSize;
          const intensity = 0.05 + ratio * 0.33;

          return (
            <div
              key={`ask-${idx}`}
              className="relative flex items-center px-3 py-[3px] text-xs flex-shrink-0 hover:bg-white/[0.04]"
            >
              <div
                className="absolute right-0 top-0 bottom-0 pointer-events-none"
                style={{
                  width: `${ratio * 100}%`,
                  background: `linear-gradient(to left, rgba(${ASK_RGB}, ${intensity}), rgba(${ASK_RGB}, ${intensity * 0.08}))`,
                }}
              />
              {ratio > 0.35 && (
                <div
                  className="absolute left-0 top-[2px] bottom-[2px] w-[2px] rounded-full pointer-events-none"
                  style={{ backgroundColor: `rgba(${ASK_RGB}, ${0.35 + ratio * 0.55})` }}
                />
              )}
              <span className="relative w-16 truncate" style={{ color: AX.red }}>
                {formatOrderBookPrice(ask.price)}
              </span>
              <span className="relative flex-1 text-right truncate" style={{ color: AX.text }}>
                {formatOrderBookSize(ask.size)}
              </span>
              <span className="relative w-16 text-right truncate" style={{ color: AX.muted }}>
                ${(parseFloat(ask.price) * size).toFixed(0)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Spread indicator */}
      {data.spread !== undefined && (
        <div
          className="flex-shrink-0 flex items-center justify-center py-1.5 text-[10px]"
          style={{ backgroundColor: AX.surface, borderTop: `1px solid ${AX.border}`, borderBottom: `1px solid ${AX.border}` }}
        >
          <span style={{ color: AX.muted }}>Spread: </span>
          <span className="ml-1 font-medium" style={{ color: AX.text }}>
            {(data.spread * 100).toFixed(2)}&cent;
          </span>
        </div>
      )}

      {/* Bids (buy orders) - takes half the remaining space */}
      <div className="flex-1 overflow-y-auto">
        {data.bids.map((bid, idx) => {
          const size = parseFloat(bid.size);
          const ratio = size / maxBidSize;
          const intensity = 0.05 + ratio * 0.33;

          return (
            <div
              key={`bid-${idx}`}
              className="relative flex items-center px-3 py-[3px] text-xs flex-shrink-0 hover:bg-white/[0.04]"
            >
              <div
                className="absolute right-0 top-0 bottom-0 pointer-events-none"
                style={{
                  width: `${ratio * 100}%`,
                  background: `linear-gradient(to left, rgba(${BID_RGB}, ${intensity}), rgba(${BID_RGB}, ${intensity * 0.08}))`,
                }}
              />
              {ratio > 0.35 && (
                <div
                  className="absolute left-0 top-[2px] bottom-[2px] w-[2px] rounded-full pointer-events-none"
                  style={{ backgroundColor: `rgba(${BID_RGB}, ${0.35 + ratio * 0.55})` }}
                />
              )}
              <span className="relative w-16 truncate" style={{ color: AX.green }}>
                {formatOrderBookPrice(bid.price)}
              </span>
              <span className="relative flex-1 text-right truncate" style={{ color: AX.text }}>
                {formatOrderBookSize(bid.size)}
              </span>
              <span className="relative w-16 text-right truncate" style={{ color: AX.muted }}>
                ${(parseFloat(bid.price) * size).toFixed(0)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const PolymarketOrderBook: React.FC<PolymarketOrderBookProps> = ({
  yesTokenId,
  noTokenId,
  marketTitle,
  defaultOpen = false,
  className = '',
  isMultiOutcome = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [selectedSide, setSelectedSide] = useState<'yes' | 'no' | 'both'>(isMultiOutcome ? 'both' : 'yes');

  const {
    yesOrderBook,
    noOrderBook,
    isConnected,
    isLoading,
    error,
    reconnect,
    yesRealtimePrice,
    noRealtimePrice,
  } = usePolymarketOrderBook({
    yesTokenId,
    noTokenId,
    enabled: isOpen && !!(yesTokenId || noTokenId),
    maxLevels: 8,
  });

  return (
    <div className={`flex-shrink-0 h-full ${className}`}>
      <AnimatePresence mode="wait">
        {!isOpen ? (
          /* Collapsed state - show open button */
          <motion.button
            key="collapsed"
            onClick={() => setIsOpen(true)}
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.15 }}
            className="h-full flex items-center px-2 hover:bg-white/5 transition-colors"
            style={{
              borderLeft: `1px solid ${AX.border}`,
            }}
            title="Open Order Book"
          >
            <div className="flex flex-col items-center gap-1 py-2">
              <HiOutlineChevronLeft className="w-4 h-4" style={{ color: AX.blue }} />
              <span
                className="text-[10px] font-semibold whitespace-nowrap"
                style={{ color: AX.blue, writingMode: 'vertical-rl', textOrientation: 'mixed' }}
              >
                Order Book
              </span>
            </div>
          </motion.button>
        ) : (
          /* Expanded state - full order book */
          <motion.div
            key="expanded"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="h-full overflow-hidden flex flex-col"
            style={{
              backgroundColor: AX.bg,
              borderLeft: `1px solid ${AX.border}`,
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-3 py-2"
              style={{ borderBottom: `1px solid ${AX.border}` }}
            >
              <div className="flex items-center gap-2">
                {/* Close button */}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded hover:bg-white/10 transition-colors"
                  title="Close order book"
                >
                  <HiOutlineChevronRight className="w-4 h-4" style={{ color: AX.muted }} />
                </button>
                <span className="text-sm font-semibold" style={{ color: AX.text }}>
                  Order Book
                </span>
                {/* Connection indicator */}
                <div
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: isConnected ? AX.green : error ? AX.red : AX.muted,
                  }}
                  title={isConnected ? 'Connected' : error || 'Disconnected'}
                />
              </div>

              {/* Side toggle */}
              <div className="flex items-center gap-1">
                {(['yes', 'no', 'both'] as const).map((side) => (
                  <button
                    key={side}
                    onClick={() => setSelectedSide(side)}
                    className="px-2 py-1 text-[10px] font-medium rounded transition-colors"
                    style={{
                      backgroundColor: selectedSide === side ? AX.border : 'transparent',
                      color: selectedSide === side ? AX.text : AX.muted,
                    }}
                  >
                    {side.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Error state */}
            {error && (
              <div className="flex items-center justify-center gap-2 p-3" style={{ backgroundColor: AX.redBg }}>
                <span className="text-xs" style={{ color: AX.red }}>{error}</span>
                <button
                  onClick={reconnect}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs"
                  style={{ backgroundColor: AX.surface, color: AX.text }}
                >
                  <HiOutlineRefresh className="w-3 h-3" />
                  Retry
                </button>
              </div>
            )}

            {/* Order book content - full height flex */}
            <div className="flex-1 flex min-h-0">
              {(selectedSide === 'yes' || selectedSide === 'both') && (
                <OrderBookSide
                  data={yesOrderBook}
                  side="yes"
                  isLoading={isLoading}
                />
              )}
              {selectedSide === 'both' && (
                <div className="w-px flex-shrink-0" style={{ backgroundColor: AX.border }} />
              )}
              {(selectedSide === 'no' || selectedSide === 'both') && (
                <OrderBookSide
                  data={noOrderBook}
                  side="no"
                  isLoading={isLoading}
                />
              )}
            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PolymarketOrderBook;
