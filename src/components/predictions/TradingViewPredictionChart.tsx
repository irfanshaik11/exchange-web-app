import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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

export interface PredictionOHLCData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface TradingViewPredictionChartProps {
  ticker: string;
  marketTitle: string;
  yesPrice: number;
  noPrice: number;
  priceHistory?: Array<{ time: number; price: number }>;
  orderBook?: OrderBookData | null;
  height?: string;
  width?: string;
  className?: string;
  isResolved?: boolean;
  resolvedResult?: 'yes' | 'no' | null;
  onIntervalChange?: (interval: PredictionInterval) => void;
}

// Map intervals to TradingView resolution
const INTERVAL_TO_RESOLUTION: Record<PredictionInterval, string> = {
  '1m': '1',
  '1h': '60',
  '1D': '1D',
};

// Transform line chart data to OHLC format
const transformToOHLC = (
  history: Array<{ time: number; price: number }>,
  intervalMs: number
): PredictionOHLCData[] => {
  if (!history || history.length === 0) return [];

  const buckets = new Map<number, { prices: number[]; time: number }>();
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
      time: Math.floor(bucket.time / 1000),
      open: prices[0],
      high: Math.max(...prices),
      low: Math.min(...prices),
      close: prices[prices.length - 1],
    });
  }

  return ohlc;
};

// Generate simulated OHLC from current price
const generateSimulatedOHLC = (
  currentPrice: number,
  intervalSeconds: number,
  points: number = 100
): PredictionOHLCData[] => {
  const now = Math.floor(Date.now() / 1000);
  const result: PredictionOHLCData[] = [];

  let price = currentPrice * (0.7 + Math.random() * 0.3);
  const volatility = 0.02;

  for (let i = points - 1; i >= 0; i--) {
    const time = now - i * intervalSeconds;
    const drift = (currentPrice - price) * 0.03;
    const change = (Math.random() - 0.5) * volatility + drift;
    price = Math.max(0.01, Math.min(0.99, price + change));

    const rangeFactor = Math.random() * volatility;
    const open = price;
    const close = i === 0 ? currentPrice : price + (Math.random() - 0.5) * volatility * 0.5;
    const high = Math.max(open, close) * (1 + rangeFactor);
    const low = Math.min(open, close) * (1 - rangeFactor);

    result.push({
      time,
      open: Math.max(0.01, Math.min(0.99, open)),
      high: Math.max(0.01, Math.min(0.99, high)),
      low: Math.max(0.01, Math.min(0.99, low)),
      close: Math.max(0.01, Math.min(0.99, close)),
    });
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

  const totalBidSize = bids.reduce((sum, b) => sum + b.size, 0);
  const totalAskSize = asks.reduce((sum, a) => sum + a.size, 0);
  const total = totalBidSize + totalAskSize;
  const bidPercent = total > 0 ? Math.round((totalBidSize / total) * 100) : 50;
  const askPercent = 100 - bidPercent;

  const bestBid = bids[0]?.price || 0;
  const bestAsk = asks[0]?.price || 0;
  const spread = bestAsk > 0 && bestBid > 0 ? ((bestAsk - bestBid) / bestAsk * 100).toFixed(3) : '0';
  const spreadCents = bestAsk > 0 && bestBid > 0 ? Math.round((bestAsk - bestBid) * 100) : 0;

  const maxSize = Math.max(...bids.map(b => b.size), ...asks.map(a => a.size), 1);

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: AX.surface, borderLeft: `1px solid ${AX.border}`, width: 220, minWidth: 220, flexShrink: 0 }}>
      {/* Header */}
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

      {/* Bid/Ask ratio */}
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
      <div className="flex-1 overflow-auto text-[10px]">
        {/* Asks (reversed) */}
        <div className="flex flex-col-reverse">
          {asks.slice(0, 10).map((ask, i) => {
            const depthWidth = (ask.size / maxSize) * 100;
            const totalUsd = ask.price * ask.size;
            return (
              <div key={`ask-${i}`} className="flex items-center px-2 py-0.5 relative">
                <div className="absolute right-0 top-0 bottom-0 opacity-20" style={{ width: `${depthWidth}%`, backgroundColor: AX.red }} />
                <span className="w-12 relative z-10" style={{ color: AX.red }}>{Math.round(ask.price * 100)}¢</span>
                <span className="flex-1 text-right relative z-10" style={{ color: AX.text }}>{ask.size.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                <span className="w-16 text-right relative z-10" style={{ color: AX.muted }}>${totalUsd.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
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
            const totalUsd = bid.price * bid.size;
            return (
              <div key={`bid-${i}`} className="flex items-center px-2 py-0.5 relative">
                <div className="absolute right-0 top-0 bottom-0 opacity-20" style={{ width: `${depthWidth}%`, backgroundColor: AX.green }} />
                <span className="w-12 relative z-10" style={{ color: AX.green }}>{Math.round(bid.price * 100)}¢</span>
                <span className="flex-1 text-right relative z-10" style={{ color: AX.text }}>{bid.size.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                <span className="w-16 text-right relative z-10" style={{ color: AX.muted }}>${totalUsd.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
              </div>
            );
          })}
        </div>

        {/* Empty state */}
        {bids.length === 0 && asks.length === 0 && (
          <div className="flex items-center justify-center py-8" style={{ color: AX.muted }}>
            No orders
          </div>
        )}
      </div>
    </div>
  );
};

const TradingViewPredictionChart: React.FC<TradingViewPredictionChartProps> = ({
  ticker,
  marketTitle,
  yesPrice,
  noPrice,
  priceHistory,
  orderBook,
  height = '100%',
  width = '100%',
  className = '',
  isResolved = false,
  resolvedResult = null,
  onIntervalChange,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);
  const datafeedRef = useRef<any>(null);
  const ohlcCacheRef = useRef<PredictionOHLCData[]>([]);

  const [selectedInterval, setSelectedInterval] = useState<PredictionInterval>('1h');
  const [orderBookSide, setOrderBookSide] = useState<'yes' | 'no'>('yes');
  const [isLoading, setIsLoading] = useState(true);
  const [libraryLoaded, setLibraryLoaded] = useState(false);

  const intervals: PredictionInterval[] = ['1m', '1h', '1D'];

  // Generate OHLC data
  const ohlcData = useMemo(() => {
    const intervalMs = selectedInterval === '1m' ? 60000 : selectedInterval === '1h' ? 3600000 : 86400000;
    if (priceHistory && priceHistory.length > 0) {
      return transformToOHLC(priceHistory, intervalMs);
    }
    const intervalSeconds = selectedInterval === '1m' ? 60 : selectedInterval === '1h' ? 3600 : 86400;
    return generateSimulatedOHLC(yesPrice, intervalSeconds);
  }, [priceHistory, yesPrice, selectedInterval]);

  // Update cache when data changes
  useEffect(() => {
    ohlcCacheRef.current = ohlcData;
  }, [ohlcData]);

  // Load TradingView library
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ((window as any).TradingView) {
      setLibraryLoaded(true);
      return;
    }

    const existingScript = document.querySelector('script[src*="charting_library.standalone.js"]');
    if (existingScript) {
      const waitForTV = () => {
        if ((window as any).TradingView) {
          setLibraryLoaded(true);
        } else {
          setTimeout(waitForTV, 100);
        }
      };
      waitForTV();
      return;
    }

    const script = document.createElement('script');
    script.src = '/charting_library/charting_library/charting_library.standalone.js';
    script.async = true;
    script.onload = () => {
      const waitForTV = () => {
        if ((window as any).TradingView) {
          setLibraryLoaded(true);
        } else {
          setTimeout(waitForTV, 100);
        }
      };
      waitForTV();
    };
    document.head.appendChild(script);
  }, []);

  // Initialize TradingView widget
  useEffect(() => {
    if (!libraryLoaded || !chartContainerRef.current) return;

    const container = chartContainerRef.current;
    const TradingView = (window as any).TradingView;

    if (!TradingView?.widget) {
      console.error('[TradingViewPredictionChart] TradingView widget not available');
      return;
    }

    // Create datafeed
    const datafeed = {
      onReady: (callback: any) => {
        setTimeout(() => {
          callback({
            supported_resolutions: ['1', '60', '1D'],
            supports_marks: false,
            supports_timescale_marks: false,
            supports_time: true,
          });
        }, 0);
      },

      searchSymbols: () => {},

      resolveSymbol: (symbolName: string, onResolve: any, onError: any) => {
        setTimeout(() => {
          onResolve({
            name: ticker,
            description: marketTitle,
            type: 'prediction',
            session: '24x7',
            timezone: 'Etc/UTC',
            exchange: 'Predictions',
            minmov: 1,
            pricescale: 100, // Prices in cents (0-100)
            has_intraday: true,
            has_seconds: false,
            has_daily: true,
            has_weekly_and_monthly: false,
            supported_resolutions: ['1', '60', '1D'],
            volume_precision: 2,
            data_status: 'streaming',
          });
        }, 0);
      },

      getBars: (
        symbolInfo: any,
        resolution: string,
        periodParams: any,
        onResult: any,
        onError: any
      ) => {
        const data = ohlcCacheRef.current;
        if (!data || data.length === 0) {
          onResult([], { noData: true });
          return;
        }

        // Convert to TradingView format (time in milliseconds, price in cents)
        const bars = data.map(candle => ({
          time: candle.time * 1000,
          open: candle.open * 100,
          high: candle.high * 100,
          low: candle.low * 100,
          close: candle.close * 100,
          volume: candle.volume || 0,
        }));

        onResult(bars, { noData: bars.length === 0 });
      },

      subscribeBars: () => {},
      unsubscribeBars: () => {},
    };

    datafeedRef.current = datafeed;

    // Create widget
    try {
      const widget = new TradingView.widget({
        debug: false,
        fullscreen: false,
        symbol: ticker,
        datafeed: datafeed,
        interval: INTERVAL_TO_RESOLUTION[selectedInterval],
        container: container,
        library_path: '/charting_library/charting_library/',
        locale: 'en',
        autosize: true,
        disabled_features: [
          'use_localstorage_for_settings',
          'header_symbol_search',
          'header_compare',
          'header_saveload',
        ],
        enabled_features: [
          'header_widget',
          'header_chart_type',
          'header_resolutions',
          'header_screenshot',
          'header_undo_redo',
          'timeframes_toolbar',
          'left_toolbar',
          'control_bar',
          'context_menus',
        ],
        theme: 'dark',
        loading_screen: { backgroundColor: 'transparent' },
        overrides: {
          'paneProperties.background': AX.bg,
          'paneProperties.backgroundType': 'solid',
          'paneProperties.vertGridProperties.color': AX.border,
          'paneProperties.horzGridProperties.color': AX.border,
          'scalesProperties.textColor': AX.muted,
          'scalesProperties.lineColor': AX.border,
          'mainSeriesProperties.candleStyle.upColor': AX.green,
          'mainSeriesProperties.candleStyle.downColor': AX.red,
          'mainSeriesProperties.candleStyle.borderUpColor': AX.green,
          'mainSeriesProperties.candleStyle.borderDownColor': AX.red,
          'mainSeriesProperties.candleStyle.wickUpColor': AX.green,
          'mainSeriesProperties.candleStyle.wickDownColor': AX.red,
          'mainSeriesProperties.candleStyle.drawWick': true,
          'mainSeriesProperties.candleStyle.drawBorder': true,
          'paneProperties.legendProperties.showLegend': true,
          'paneProperties.legendProperties.showSeriesOHLC': true,
        },
        // Custom price formatter for cents
        custom_formatters: {
          priceFormatterFactory: () => ({
            format: (price: number) => `${price.toFixed(1)}`,
          }),
        },
      });

      widget.onChartReady(() => {
        console.log('[TradingViewPredictionChart] Chart ready');
        setIsLoading(false);
      });

      widgetRef.current = widget;
    } catch (err) {
      console.error('[TradingViewPredictionChart] Failed to create widget:', err);
      setIsLoading(false);
    }

    return () => {
      if (widgetRef.current) {
        try {
          widgetRef.current.remove();
        } catch (e) {}
        widgetRef.current = null;
      }
    };
  }, [libraryLoaded, ticker, marketTitle, selectedInterval]);

  // Refresh chart when OHLC data changes
  useEffect(() => {
    if (!widgetRef.current) return;

    widgetRef.current.onChartReady?.(() => {
      try {
        const chart = widgetRef.current.chart?.();
        chart?.resetData?.();
      } catch (e) {}
    });
  }, [ohlcData]);

  const handleIntervalChange = (interval: PredictionInterval) => {
    setSelectedInterval(interval);
    onIntervalChange?.(interval);
  };

  return (
    <div className={`flex h-full ${className}`} style={{ width, height, backgroundColor: AX.bg }}>
      {/* Chart section */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Interval toolbar */}
        <div className="flex items-center gap-1 px-3 py-2" style={{ borderBottom: `1px solid ${AX.border}` }}>
          {intervals.map((interval) => (
            <button
              key={interval}
              onClick={() => handleIntervalChange(interval)}
              disabled={isResolved}
              className="px-2.5 py-1 text-xs font-medium rounded transition-colors"
              style={{
                backgroundColor: selectedInterval === interval ? AX.border : 'transparent',
                color: selectedInterval === interval ? AX.text : AX.muted,
                opacity: isResolved ? 0.5 : 1,
              }}
            >
              {interval}
            </button>
          ))}
          <div className="flex-1" />
          <span className="text-xs" style={{ color: AX.muted }}>{ticker} · {selectedInterval}</span>
          {isResolved && (
            <span
              className="ml-2 px-2 py-0.5 rounded text-[10px] font-medium"
              style={{
                backgroundColor: resolvedResult === 'yes' ? AX.greenBg : AX.redBg,
                color: resolvedResult === 'yes' ? AX.green : AX.red,
              }}
            >
              Resolved {resolvedResult?.toUpperCase()}
            </span>
          )}
        </div>

        {/* TradingView chart container or Resolved message */}
        <div
          ref={isResolved ? undefined : chartContainerRef}
          className="flex-1 relative"
          style={{ minHeight: 200 }}
        >
          {isResolved ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ backgroundColor: AX.bg }}>
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                style={{ backgroundColor: resolvedResult === 'yes' ? AX.greenBg : AX.redBg }}
              >
                <span className="text-2xl">{resolvedResult === 'yes' ? '✓' : '✗'}</span>
              </div>
              <p className="text-sm font-medium" style={{ color: AX.text }}>Market Resolved</p>
              <p className="text-xs mt-1" style={{ color: resolvedResult === 'yes' ? AX.green : AX.red }}>
                Outcome: {resolvedResult?.toUpperCase()}
              </p>
            </div>
          ) : isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: AX.bg }}>
              <HiOutlineRefresh className="w-6 h-6 animate-spin" style={{ color: AX.muted }} />
            </div>
          ) : null}
        </div>
      </div>

      {/* Order Book sidebar - always visible */}
      <InlineOrderBook
        orderBook={orderBook || null}
        selectedSide={orderBookSide}
        onSideChange={setOrderBookSide}
      />
    </div>
  );
};

export default TradingViewPredictionChart;
