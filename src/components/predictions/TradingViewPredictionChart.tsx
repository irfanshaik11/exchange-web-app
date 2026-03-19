import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { HiOutlineRefresh } from 'react-icons/hi';

const isDev = process.env.NODE_ENV !== 'production';

/* ---------- AXIOM palette ---------- */
const AX = {
  bg: "#111214",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#f0f5f5",
  muted: "#9CA3AF",
  green: "#4ADE80",
  greenBg: "rgba(74, 222, 128, 0.15)",
  red: "#F87171",
  redBg: "rgba(248, 113, 113, 0.15)",
  blue: "#60A5FA",
  cyan: "#22D3EE",
  yellow: "#FBBF24",
  purple: "#818CF8",
  orange: "#FB923C",
  pink: "#F472B6",
};

// Multi-series color palette
const SERIES_COLORS = [
  '#60A5FA', // blue
  '#22D3EE', // cyan
  '#FBBF24', // yellow
  '#818CF8', // purple
  '#FB923C', // orange
  '#F472B6', // pink
  '#4ADE80', // green
  '#F87171', // red
];

export type PredictionInterval = '1m' | '1h' | '1D' | '1W' | 'ALL';

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

// Multi-series data structure
export interface ChartSeriesData {
  id: string;
  label: string;
  color?: string;
  data: Array<{ time: number; price: number }>;
  currentPrice?: number;
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
  // Multi-series support
  series?: ChartSeriesData[];
  isMultiSeries?: boolean;
  showOrderBook?: boolean;
  // Use line chart instead of candles for single series
  useLineChart?: boolean;
}

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
    <div className="flex flex-col h-full" style={{ backgroundColor: AX.bg, borderLeft: `1px solid ${AX.border}`, width: 220, minWidth: 220, flexShrink: 0 }}>
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

// Multi-Series Legend Component
const MultiSeriesLegend: React.FC<{
  series: Array<{ label: string; color: string; currentPrice?: number }>;
}> = ({ series }) => {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2" style={{ borderBottom: `1px solid ${AX.border}` }}>
      {series.map((s, idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: s.color }}
          />
          <span className="text-xs" style={{ color: AX.text }}>
            {s.label}
          </span>
          {s.currentPrice !== undefined && (
            <span className="text-xs font-medium" style={{ color: s.color }}>
              {(s.currentPrice * 100).toFixed(1)}%
            </span>
          )}
        </div>
      ))}
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
  series,
  isMultiSeries = false,
  showOrderBook = true,
  useLineChart = false,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);
  const datafeedRef = useRef<any>(null);
  const ohlcCacheRef = useRef<PredictionOHLCData[]>([]);
  const seriesCacheRef = useRef<Map<string, Array<{ time: number; price: number }>>>(new Map());
  const seriesConfigRef = useRef<Array<{ id: string; label: string; color?: string }>>([]);
  const isMountedRef = useRef(true);

  const [orderBookSide, setOrderBookSide] = useState<'yes' | 'no'>('yes');
  const [isLoading, setIsLoading] = useState(true);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track mounted state to prevent cleanup errors
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Loading timeout - prevent chart from being stuck in loading state forever
  // If TradingView doesn't fire onChartReady within 10 seconds, force loading to complete
  useEffect(() => {
    if (isLoading && libraryLoaded) {
      loadingTimeoutRef.current = setTimeout(() => {
        console.warn('[TradingViewPredictionChart] Loading timeout - forcing completion');
        setIsLoading(false);
        setLoadingTimedOut(true);
      }, 10000); // 10 second timeout
    }

    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    };
  }, [isLoading, libraryLoaded]);

  // Prepare series with colors (memoized to prevent unnecessary re-renders)
  const coloredSeries = useMemo(() => {
    if (!series) return [];
    return series.map((s, idx) => ({
      ...s,
      color: s.color || SERIES_COLORS[idx % SERIES_COLORS.length],
    }));
  }, [series]);

  // Stable series config for widget initialization (IDs, labels, and colors only, not data)
  // This only changes when series structure changes (add/remove), not when data updates
  const seriesConfig = useMemo(() => {
    return coloredSeries.map(s => ({ id: s.id, label: s.label, color: s.color }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // Only recreate when series IDs or colors change, not when data changes
    coloredSeries.length,
    // Use JSON stringify for stable comparison of structure
    JSON.stringify(coloredSeries.map(s => ({ id: s.id, color: s.color }))),
  ]);

  // Keep ref in sync for use in datafeed callbacks (synchronous update, not effect)
  // IMPORTANT: This must be synchronous (during render) to avoid race conditions
  // with widget initialization effect which also runs after render
  seriesConfigRef.current = seriesConfig;

  // Generate OHLC data for single series mode (default 1h interval)
  const ohlcData = useMemo(() => {
    if (isMultiSeries) return [];
    const intervalMs = 3600000; // 1 hour
    if (priceHistory && priceHistory.length > 0) {
      return transformToOHLC(priceHistory, intervalMs);
    }
    return generateSimulatedOHLC(yesPrice, 3600); // 1 hour in seconds
  }, [priceHistory, yesPrice, isMultiSeries]);

  // Update caches synchronously during render (not in useEffect)
  // This prevents race conditions where widget initialization runs before cache is populated
  ohlcCacheRef.current = ohlcData;

  // Update series cache synchronously
  if (coloredSeries.length > 0) {
    const cache = new Map<string, Array<{ time: number; price: number }>>();
    coloredSeries.forEach(s => {
      cache.set(s.id, s.data);
    });
    seriesCacheRef.current = cache;
  }

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
    if (!libraryLoaded || !chartContainerRef.current) {
      return;
    }

    // For multi-series mode, wait until we have series data before initializing
    // This prevents the race condition where widget initializes with wrong symbol
    if (isMultiSeries && (!series || series.length === 0)) {
      return;
    }

    // Reset loading states when re-initializing
    setIsLoading(true);
    setLoadingTimedOut(false);

    const container = chartContainerRef.current;
    const TradingView = (window as any).TradingView;

    if (!TradingView?.widget) {
      console.error('[TradingViewPredictionChart] TradingView widget not available');
      return;
    }

    // Build list of all symbols (main + comparison symbols for multi-series)
    // Use ref for initial config to avoid stale closures
    const initialSeriesConfig = seriesConfigRef.current.length > 0 ? seriesConfigRef.current : seriesConfig;
    const allSymbols = isMultiSeries && initialSeriesConfig.length > 0
      ? initialSeriesConfig.map(s => s.id)
      : [ticker];

    isDev && console.log('[TV] Creating widget, series cache size:', seriesCacheRef.current.size, 'main symbol:', isMultiSeries && initialSeriesConfig.length > 0 ? initialSeriesConfig[0].id : ticker);

    // Create datafeed
    const datafeed = {
      onReady: (callback: any) => {
        setTimeout(() => {
          callback({
            supported_resolutions: ['1', '60', '1D', '1W'],
            supports_marks: false,
            supports_timescale_marks: false,
            supports_time: true,
          });
        }, 0);
      },

      searchSymbols: () => {},

      resolveSymbol: (symbolName: string, onResolve: any, onError: any) => {
        // Find the series for this symbol - use ref for latest config
        const currentConfig = seriesConfigRef.current;
        const seriesItem = currentConfig.find(s => s.id === symbolName);
        const displayName = seriesItem?.label || (symbolName === ticker ? marketTitle : symbolName);

        setTimeout(() => {
          onResolve({
            name: symbolName,
            description: displayName,
            type: 'prediction',
            session: '24x7',
            timezone: 'Etc/UTC',
            exchange: 'Predictions',
            minmov: 1,
            pricescale: 1000, // Prices as percentage (0-100 with 1 decimal)
            has_intraday: true,
            has_seconds: false,
            has_daily: true,
            has_weekly_and_monthly: true,
            supported_resolutions: ['1', '60', '1D', '1W'],
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
        const symbolName = symbolInfo.name;
        // TradingView sends time range in seconds, convert to ms for comparison
        const fromMs = periodParams.from * 1000;
        const toMs = periodParams.to * 1000;

        if (isMultiSeries) {
          // Multi-series mode - get data for the specific symbol
          const seriesData = seriesCacheRef.current.get(symbolName);

          if (!seriesData || seriesData.length === 0) {
            onResult([], { noData: true });
            return;
          }

          // Convert to TradingView format and filter by requested time range
          const allBars = seriesData
            .filter(p => p.time > 0)
            .sort((a, b) => a.time - b.time)
            .map(point => ({
              time: point.time,
              open: point.price * 100,
              high: point.price * 100,
              low: point.price * 100,
              close: point.price * 100,
              volume: 0,
            }));

          // Filter to requested time range
          const bars = allBars.filter(bar => bar.time >= fromMs && bar.time <= toMs);

          // Determine if there's no more historical data available
          // noData should be true if we have no bars OR if the oldest bar in our dataset
          // is newer than the requested 'from' time (meaning we've reached the beginning)
          const oldestBarTime = allBars.length > 0 ? allBars[0].time : Infinity;
          const noMoreHistoricalData = allBars.length === 0 || oldestBarTime > fromMs;

          onResult(bars, { noData: noMoreHistoricalData });
        } else {
          // Single series mode - use OHLC data
          const data = ohlcCacheRef.current;
          if (!data || data.length === 0) {
            onResult([], { noData: true });
            return;
          }

          // Convert to TradingView format (time in milliseconds, price in cents)
          const allBars = data.map(candle => ({
            time: candle.time * 1000,
            open: candle.open * 100,
            high: candle.high * 100,
            low: candle.low * 100,
            close: candle.close * 100,
            volume: candle.volume || 0,
          }));

          // Filter to requested time range
          const bars = allBars.filter(bar => bar.time >= fromMs && bar.time <= toMs);

          // Signal no more historical data if we've reached the beginning
          const oldestBarTime = allBars.length > 0 ? allBars[0].time : Infinity;
          const noMoreHistoricalData = allBars.length === 0 || oldestBarTime > fromMs;

          onResult(bars, { noData: noMoreHistoricalData });
        }
      },

      subscribeBars: () => {},
      unsubscribeBars: () => {},
    };

    datafeedRef.current = datafeed;

    // Create widget
    try {
      const mainSymbol = isMultiSeries && initialSeriesConfig.length > 0 ? initialSeriesConfig[0].id : ticker;

      const widget = new TradingView.widget({
        debug: false,
        fullscreen: false,
        symbol: mainSymbol,
        datafeed: datafeed,
        interval: '60', // 1 hour - TradingView's built-in controls allow users to change this
        container: container,
        library_path: '/charting_library/charting_library/',
        locale: 'en',
        autosize: true,
        disabled_features: [
          'use_localstorage_for_settings',
          'header_symbol_search',
          'header_saveload',
          'header_compare', // We'll add our own comparison
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
          'paneProperties.backgroundGradientStartColor': AX.bg,
          'paneProperties.backgroundGradientEndColor': AX.bg,
          'paneProperties.vertGridProperties.color': AX.border,
          'paneProperties.horzGridProperties.color': AX.border,
          'scalesProperties.textColor': AX.muted,
          'scalesProperties.lineColor': AX.border,
          // Use line chart style for multi-series or when useLineChart is true
          ...(isMultiSeries || useLineChart ? {
            'mainSeriesProperties.style': 2, // Line chart
            'mainSeriesProperties.lineStyle.color': isMultiSeries ? (initialSeriesConfig[0]?.color || AX.blue) : AX.green,
            'mainSeriesProperties.lineStyle.linewidth': 2,
          } : {
            'mainSeriesProperties.candleStyle.upColor': AX.green,
            'mainSeriesProperties.candleStyle.downColor': AX.red,
            'mainSeriesProperties.candleStyle.borderUpColor': AX.green,
            'mainSeriesProperties.candleStyle.borderDownColor': AX.red,
            'mainSeriesProperties.candleStyle.wickUpColor': AX.green,
            'mainSeriesProperties.candleStyle.wickDownColor': AX.red,
            'mainSeriesProperties.candleStyle.drawWick': true,
            'mainSeriesProperties.candleStyle.drawBorder': true,
          }),
          'paneProperties.legendProperties.showLegend': !isMultiSeries && !useLineChart,
          'paneProperties.legendProperties.showSeriesOHLC': !isMultiSeries && !useLineChart,
        },
        // Custom price formatter for percentage
        custom_formatters: {
          priceFormatterFactory: () => ({
            format: (price: number) => `${price.toFixed(1)}%`,
          }),
        },
      });

      widget.onChartReady(() => {
        isDev && console.log('[TV] Chart ready - hiding loading');
        setIsLoading(false);

        // For multi-series, add comparison symbols using ref for latest config
        const currentConfig = seriesConfigRef.current.length > 0 ? seriesConfigRef.current : initialSeriesConfig;
        if (isMultiSeries && currentConfig.length > 1) {
          const chart = widget.chart();

          // Add remaining series as comparison
          currentConfig.slice(1).forEach((seriesItem, idx) => {
            try {
              chart.createStudy(
                'Compare',
                false,
                false,
                {
                  source: 'close',
                  symbol: seriesItem.id,
                },
                {
                  'plot.color': seriesItem.color,
                  'plot.linewidth': 2,
                }
              );
            } catch (e) {
              console.warn('[TradingViewPredictionChart] Failed to add comparison series:', seriesItem.label, e);
            }
          });
        }
      });

      widgetRef.current = widget;
    } catch (err) {
      console.error('[TradingViewPredictionChart] Failed to create widget:', err);
      setIsLoading(false);
    }

    return () => {
      // IMPORTANT: Do NOT call widget.remove() - it causes "removeChild" errors
      // when React's reconciliation conflicts with TradingView's DOM manipulation.
      // Instead, just clear the ref. The iframe will be garbage collected when
      // React removes the container from the DOM.
      widgetRef.current = null;
    };
    // Only depend on values that truly require widget recreation
    // Data changes should go through the datafeed/cache refs, not widget recreation
    // For multi-series, also depend on series length so widget creates when data arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryLoaded, ticker, isMultiSeries, isMultiSeries ? series?.length : 0]);

  // NOTE: We intentionally do NOT call resetData() when data changes.
  // The datafeed uses refs (seriesCacheRef, ohlcCacheRef) which are updated
  // synchronously when data changes. TradingView's getBars() will always
  // read from the latest ref values. Calling resetData() causes an infinite
  // loop because it triggers getBars() which may cause parent re-renders
  // with new series props, leading to another resetData() call.

  return (
    <div className={`flex flex-col h-full ${className}`} style={{ width, height, backgroundColor: AX.bg }}>
      {/* Multi-series legend */}
      {isMultiSeries && coloredSeries.length > 0 && (
        <MultiSeriesLegend
          series={coloredSeries.map(s => ({
            label: s.label,
            color: s.color!,
            currentPrice: s.currentPrice,
          }))}
        />
      )}

      <div className="flex flex-1 min-h-0">
        {/* Chart section */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* TradingView chart container - IMPORTANT: Keep this div empty for TradingView's iframe */}
          {/* React should never render children inside this div to avoid DOM conflicts */}
          <div className="flex-1 relative" style={{ minHeight: 200 }}>
            {/* TradingView's dedicated container - no React children allowed */}
            <div
              ref={chartContainerRef}
              className="absolute inset-0"
              style={{ display: isResolved ? 'none' : 'block' }}
            />
            {/* Overlay content rendered OUTSIDE TradingView's container */}
            {isResolved && (
              <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ backgroundColor: AX.bg, zIndex: 10 }}>
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
            )}
            {isLoading && !isResolved && (
              <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: AX.bg, zIndex: 10 }}>
                <HiOutlineRefresh className="w-6 h-6 animate-spin" style={{ color: AX.muted }} />
              </div>
            )}
            {loadingTimedOut && !isLoading && !isResolved && (
              <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ backgroundColor: AX.bg, zIndex: 10 }}>
                <p className="text-sm" style={{ color: AX.muted }}>Chart data unavailable</p>
                <p className="text-xs mt-1" style={{ color: AX.muted }}>Please try refreshing the page</p>
              </div>
            )}
          </div>
        </div>

        {/* Order Book sidebar - conditionally visible */}
        {showOrderBook && (
          <InlineOrderBook
            orderBook={orderBook || null}
            selectedSide={orderBookSide}
            onSideChange={setOrderBookSide}
          />
        )}
      </div>
    </div>
  );
};

export default TradingViewPredictionChart;
