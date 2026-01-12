import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp, CandlestickData } from 'lightweight-charts';
import { HiOutlineRefresh } from 'react-icons/hi';

/* ---------- AXIOM palette ---------- */
const AX = {
  bg: "#101114",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#f0f5f5",
  muted: "#9CA3AF",
  green: "#4ADE80",
  greenBg: "rgba(74, 222, 128, 0.15)",
  red: "#F87171",
  redBg: "rgba(248, 113, 113, 0.15)",
};

export type PredictionInterval = '1m' | '1h' | '1D';

export interface PredictionOHLCData {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBookData {
  yesBids: OrderBookLevel[];
  yesAsks: OrderBookLevel[];
  noBids: OrderBookLevel[];
  noAsks: OrderBookLevel[];
}

export interface AdvancedPredictionChartProps {
  ticker: string;
  yesPrice: number;
  noPrice: number;
  priceHistory?: Array<{ time: number; price: number }>;
  orderBook?: OrderBookData | null;
  height?: string;
  width?: string;
  className?: string;
  onIntervalChange?: (interval: PredictionInterval) => void;
}

// Transform line chart data to candlestick format
const transformToOHLC = (
  history: Array<{ time: number; price: number }>,
  interval: PredictionInterval
): PredictionOHLCData[] => {
  if (!history || history.length === 0) return [];

  const intervalMs = interval === '1m' ? 60000 : interval === '1h' ? 3600000 : 86400000;
  const buckets = new Map<number, { prices: number[]; time: number }>();

  // Sort by time
  const sorted = [...history].sort((a, b) => a.time - b.time);

  for (const point of sorted) {
    const bucketTime = Math.floor(point.time / intervalMs) * intervalMs;
    if (!buckets.has(bucketTime)) {
      buckets.set(bucketTime, { prices: [], time: bucketTime });
    }
    buckets.get(bucketTime)!.prices.push(point.price);
  }

  const ohlc: PredictionOHLCData[] = [];
  const sortedBuckets = Array.from(buckets.values()).sort((a, b) => a.time - b.time);

  for (const bucket of sortedBuckets) {
    const prices = bucket.prices;
    if (prices.length === 0) continue;

    ohlc.push({
      time: Math.floor(bucket.time / 1000), // Convert to seconds
      open: prices[0],
      high: Math.max(...prices),
      low: Math.min(...prices),
      close: prices[prices.length - 1],
    });
  }

  return ohlc;
};

// Generate simulated OHLC from current price if no history
const generateSimulatedOHLC = (
  currentPrice: number,
  interval: PredictionInterval,
  points: number = 50
): PredictionOHLCData[] => {
  const intervalSeconds = interval === '1m' ? 60 : interval === '1h' ? 3600 : 86400;
  const now = Math.floor(Date.now() / 1000);
  const result: PredictionOHLCData[] = [];

  let price = currentPrice * (0.85 + Math.random() * 0.3);
  const volatility = 0.03;

  for (let i = points - 1; i >= 0; i--) {
    const time = now - i * intervalSeconds;

    // Random walk towards current price
    const drift = (currentPrice - price) * 0.05;
    const change = (Math.random() - 0.5) * volatility + drift;
    price = Math.max(0.01, Math.min(0.99, price + change));

    const rangeFactor = Math.random() * volatility;
    const open = price;
    const close = i === 0 ? currentPrice : price + (Math.random() - 0.5) * volatility * 0.5;
    const high = Math.max(open, close) * (1 + rangeFactor);
    const low = Math.min(open, close) * (1 - rangeFactor);

    result.push({ time, open, high, low, close: Math.max(0.01, Math.min(0.99, close)) });
    price = close;
  }

  return result;
};

// Inline Order Book Component
const InlineOrderBook: React.FC<{
  orderBook: OrderBookData | null;
  selectedSide: 'yes' | 'no';
  onSideChange: (side: 'yes' | 'no') => void;
}> = ({ orderBook, selectedSide, onSideChange }) => {
  const bids = selectedSide === 'yes' ? orderBook?.yesBids || [] : orderBook?.noBids || [];
  const asks = selectedSide === 'yes' ? orderBook?.yesAsks || [] : orderBook?.noAsks || [];

  // Calculate bid/ask percentages
  const totalBidSize = bids.reduce((sum, b) => sum + b.size, 0);
  const totalAskSize = asks.reduce((sum, a) => sum + a.size, 0);
  const total = totalBidSize + totalAskSize;
  const bidPercent = total > 0 ? Math.round((totalBidSize / total) * 100) : 50;
  const askPercent = 100 - bidPercent;

  // Calculate spread
  const bestBid = bids[0]?.price || 0;
  const bestAsk = asks[0]?.price || 0;
  const spread = bestAsk > 0 && bestBid > 0 ? ((bestAsk - bestBid) / bestAsk * 100).toFixed(3) : '0';
  const spreadCents = bestAsk > 0 && bestBid > 0 ? Math.round((bestAsk - bestBid) * 100) : 0;

  // Max size for depth visualization
  const maxSize = Math.max(...bids.map(b => b.size), ...asks.map(a => a.size), 1);

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: AX.surface, borderLeft: `1px solid ${AX.border}`, minWidth: 220 }}>
      {/* Header with toggle */}
      <div className="flex items-center justify-between p-2 border-b" style={{ borderColor: AX.border }}>
        <span className="text-xs font-medium" style={{ color: AX.text }}>Order Book</span>
        <div className="flex rounded overflow-hidden" style={{ border: `1px solid ${AX.border}` }}>
          <button
            onClick={() => onSideChange('yes')}
            className="px-2 py-0.5 text-[10px] font-medium transition-colors"
            style={{
              backgroundColor: selectedSide === 'yes' ? AX.greenBg : 'transparent',
              color: selectedSide === 'yes' ? AX.green : AX.muted,
            }}
          >
            Yes
          </button>
          <button
            onClick={() => onSideChange('no')}
            className="px-2 py-0.5 text-[10px] font-medium transition-colors"
            style={{
              backgroundColor: selectedSide === 'no' ? AX.redBg : 'transparent',
              color: selectedSide === 'no' ? AX.red : AX.muted,
            }}
          >
            No
          </button>
        </div>
      </div>

      {/* Bid/Ask ratio bar */}
      <div className="px-2 py-1.5">
        <div className="flex items-center gap-2 text-[10px] mb-1">
          <span style={{ color: AX.green }}>B {bidPercent}%</span>
          <div className="flex-1 h-1 rounded overflow-hidden flex" style={{ backgroundColor: AX.border }}>
            <div style={{ width: `${bidPercent}%`, backgroundColor: AX.green }} />
            <div style={{ width: `${askPercent}%`, backgroundColor: AX.red }} />
          </div>
          <span style={{ color: AX.red }}>{askPercent}% S</span>
        </div>
      </div>

      {/* Column headers */}
      <div className="flex items-center px-2 py-1 text-[10px]" style={{ color: AX.muted, borderBottom: `1px solid ${AX.border}` }}>
        <span className="w-12">Price (¢)</span>
        <span className="flex-1 text-right">Shares</span>
        <span className="w-16 text-right">Total (USD)</span>
      </div>

      {/* Order book entries */}
      <div className="flex-1 overflow-auto">
        {/* Asks (reversed so highest price at top) */}
        <div className="flex flex-col-reverse">
          {asks.slice(0, 10).map((ask, i) => {
            const depthWidth = (ask.size / maxSize) * 100;
            const total = ask.price * ask.size;
            return (
              <div
                key={`ask-${i}`}
                className="flex items-center px-2 py-0.5 text-[10px] relative"
              >
                <div
                  className="absolute right-0 top-0 bottom-0 opacity-20"
                  style={{ width: `${depthWidth}%`, backgroundColor: AX.red }}
                />
                <span className="w-12 relative z-10" style={{ color: AX.red }}>
                  {Math.round(ask.price * 100)}¢
                </span>
                <span className="flex-1 text-right relative z-10" style={{ color: AX.text }}>
                  {ask.size.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
                <span className="w-16 text-right relative z-10" style={{ color: AX.muted }}>
                  ${total.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </span>
              </div>
            );
          })}
        </div>

        {/* Spread */}
        <div className="flex items-center justify-center py-1 text-[10px]" style={{ borderTop: `1px solid ${AX.border}`, borderBottom: `1px solid ${AX.border}` }}>
          <span style={{ color: AX.muted }}>Spread</span>
          <span className="ml-2" style={{ color: AX.text }}>{spreadCents}¢</span>
          <span className="ml-2" style={{ color: AX.muted }}>{spread}%</span>
        </div>

        {/* Bids */}
        <div>
          {bids.slice(0, 10).map((bid, i) => {
            const depthWidth = (bid.size / maxSize) * 100;
            const total = bid.price * bid.size;
            return (
              <div
                key={`bid-${i}`}
                className="flex items-center px-2 py-0.5 text-[10px] relative"
              >
                <div
                  className="absolute right-0 top-0 bottom-0 opacity-20"
                  style={{ width: `${depthWidth}%`, backgroundColor: AX.green }}
                />
                <span className="w-12 relative z-10" style={{ color: AX.green }}>
                  {Math.round(bid.price * 100)}¢
                </span>
                <span className="flex-1 text-right relative z-10" style={{ color: AX.text }}>
                  {bid.size.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
                <span className="w-16 text-right relative z-10" style={{ color: AX.muted }}>
                  ${total.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const AdvancedPredictionChart: React.FC<AdvancedPredictionChartProps> = ({
  ticker,
  yesPrice,
  noPrice,
  priceHistory,
  orderBook,
  height = '100%',
  width = '100%',
  className = '',
  onIntervalChange,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  const [selectedInterval, setSelectedInterval] = useState<PredictionInterval>('1h');
  const [orderBookSide, setOrderBookSide] = useState<'yes' | 'no'>('yes');
  const [isLoading, setIsLoading] = useState(true);

  const intervals: PredictionInterval[] = ['1m', '1h', '1D'];

  // Generate OHLC data from price history or simulate
  const ohlcData = useMemo(() => {
    if (priceHistory && priceHistory.length > 0) {
      return transformToOHLC(priceHistory, selectedInterval);
    }
    return generateSimulatedOHLC(yesPrice, selectedInterval);
  }, [priceHistory, yesPrice, selectedInterval]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;

    // Clean up existing chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    }

    // Create new chart
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: AX.bg },
        textColor: AX.muted,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: AX.border, style: 1 },
        horzLines: { color: AX.border, style: 1 },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: AX.muted, width: 1, style: 2, labelBackgroundColor: AX.surface },
        horzLine: { color: AX.muted, width: 1, style: 2, labelBackgroundColor: AX.surface },
      },
      rightPriceScale: {
        borderColor: AX.border,
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: AX.border,
        timeVisible: true,
        secondsVisible: selectedInterval === '1m',
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    // Add candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: AX.green,
      downColor: AX.red,
      borderDownColor: AX.red,
      borderUpColor: AX.green,
      wickDownColor: AX.red,
      wickUpColor: AX.green,
    });

    // Add volume histogram (optional)
    const volumeSeries = chart.addHistogramSeries({
      color: AX.muted,
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    setIsLoading(false);

    return () => {
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [selectedInterval]);

  // Update chart data
  useEffect(() => {
    if (!candleSeriesRef.current || ohlcData.length === 0) return;

    const formattedData: CandlestickData[] = ohlcData.map(d => ({
      time: d.time as UTCTimestamp,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    candleSeriesRef.current.setData(formattedData);

    // Fit content
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [ohlcData]);

  // Handle interval change
  const handleIntervalChange = (interval: PredictionInterval) => {
    setSelectedInterval(interval);
    onIntervalChange?.(interval);
  };

  return (
    <div className={`flex h-full ${className}`} style={{ width, height }}>
      {/* Chart section */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2" style={{ backgroundColor: AX.surface, borderBottom: `1px solid ${AX.border}` }}>
          {/* Interval buttons */}
          <div className="flex items-center gap-1">
            {intervals.map((interval) => (
              <button
                key={interval}
                onClick={() => handleIntervalChange(interval)}
                className="px-2 py-1 text-xs font-medium rounded transition-colors"
                style={{
                  backgroundColor: selectedInterval === interval ? AX.border : 'transparent',
                  color: selectedInterval === interval ? AX.text : AX.muted,
                }}
              >
                {interval}
              </button>
            ))}
          </div>

          {/* OHLC info display */}
          <div className="flex items-center gap-3 text-xs">
            <span style={{ color: AX.muted }}>{ticker} · {selectedInterval}</span>
            {ohlcData.length > 0 && (
              <>
                <span style={{ color: AX.text }}>
                  O<span style={{ color: AX.green }}>{(ohlcData[ohlcData.length - 1].open * 100).toFixed(1)}</span>
                </span>
                <span style={{ color: AX.text }}>
                  H<span style={{ color: AX.green }}>{(ohlcData[ohlcData.length - 1].high * 100).toFixed(1)}</span>
                </span>
                <span style={{ color: AX.text }}>
                  L<span style={{ color: AX.green }}>{(ohlcData[ohlcData.length - 1].low * 100).toFixed(1)}</span>
                </span>
                <span style={{ color: AX.text }}>
                  C<span style={{ color: AX.green }}>{(ohlcData[ohlcData.length - 1].close * 100).toFixed(1)}</span>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Chart container */}
        <div
          ref={chartContainerRef}
          className="flex-1"
          style={{ backgroundColor: AX.bg, minHeight: 200 }}
        >
          {isLoading && (
            <div className="flex items-center justify-center h-full">
              <HiOutlineRefresh className="w-5 h-5 animate-spin" style={{ color: AX.muted }} />
            </div>
          )}
        </div>
      </div>

      {/* Order Book sidebar */}
      <InlineOrderBook
        orderBook={orderBook || null}
        selectedSide={orderBookSide}
        onSideChange={setOrderBookSide}
      />
    </div>
  );
};

export default AdvancedPredictionChart;
