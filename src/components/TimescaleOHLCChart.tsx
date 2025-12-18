import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';

export type TimescaleInterval = '1s' | '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';
export type TimescaleTimeframe = '1h' | '24h' | '7d' | '30d' | '1y';

interface OHLCCandle {
  time: number;
  time_end: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume_usd: number;
  volume_monad: number;
  transaction_count: number;
  buy_volume_usd: number;
  sell_volume_usd: number;
}

interface OHLCResponse {
  status: string;
  count: number;
  interval: string;
  data: OHLCCandle[];
}

export interface TimescaleOHLCChartProps {
  tokenAddress: string;
  height?: string;
  width?: string;
  className?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL!;

// Interval configurations with smart timeframes and limits
const INTERVAL_CONFIG: Record<TimescaleInterval, { timeframe: TimescaleTimeframe; limit: number; refreshMs: number }> = {
  '1s':  { timeframe: '24h',  limit: 3600, refreshMs: 1000  }, // 24 hours of seconds (shows more history)
  '1m':  { timeframe: '24h',  limit: 1440, refreshMs: 5000  }, // 24 hours of minutes
  '5m':  { timeframe: '24h',  limit: 288,  refreshMs: 10000 }, // 24 hours
  '15m': { timeframe: '7d',   limit: 672,  refreshMs: 30000 }, // 7 days
  '30m': { timeframe: '7d',   limit: 336,  refreshMs: 30000 }, // 7 days
  '1h':  { timeframe: '7d',   limit: 168,  refreshMs: 60000 }, // 7 days
  '4h':  { timeframe: '30d',  limit: 180,  refreshMs: 60000 }, // 30 days
  '1d':  { timeframe: '1y',   limit: 365,  refreshMs: 60000 }, // 1 year
  '1w':  { timeframe: '1y',   limit: 52,   refreshMs: 60000 }, // 1 year
};

// WebSocket candle format from backend
interface WSCandle {
  token_address: string;
  interval: string;
  time: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  trades: number;
}

const TimescaleOHLCChart: React.FC<TimescaleOHLCChartProps> = ({
  tokenAddress,
  height = '500px',
  width = '100%',
  className = '',
  autoRefresh = true,
  refreshInterval,
}) => {
  const [selectedInterval, setSelectedInterval] = useState<TimescaleInterval>('1s');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candleCount, setCandleCount] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);

  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const candleDataRef = useRef<Map<number, any>>(new Map());

  // Fetch OHLC data from TimescaleDB
  const fetchOHLC = useCallback(async (interval: TimescaleInterval): Promise<OHLCCandle[]> => {
    const config = INTERVAL_CONFIG[interval];
    const url = `${BACKEND_URL}/v1/ohlc?` +
      `token_address=${tokenAddress}&` +
      `interval=${interval}&` +
      `timeframe=${config.timeframe}&` +
      `limit=${config.limit}`;

    console.log(`[TimescaleOHLC] Fetching ${interval} candles:`, url);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch OHLC data: ${response.statusText}`);
    }

    const data: OHLCResponse = await response.json();
    console.log(`[TimescaleOHLC] Received ${data.count} ${interval} candles from TimescaleDB`);

    return data.data;
  }, [tokenAddress]);

  // Load and update chart data
  const loadChartData = useCallback(async (interval: TimescaleInterval) => {
    if (!chartRef.current || !seriesRef.current) return;

    try {
      setIsLoading(true);
      setError(null);

      const candles = await fetchOHLC(interval);

      if (candles.length === 0) {
        setError('No candle data available for this token');
        setCandleCount(0);
        return;
      }

      // Transform to lightweight-charts format and reverse (API returns DESC, chart needs ASC)
      // Determine candle color based on buy/sell volume
      const candlestickData = candles.map(c => {
        // Use buy/sell volume to determine candle color (recommended method)
        const isBuyDominant = c.buy_volume_usd > c.sell_volume_usd;

        // Fallback to traditional open/close comparison if volumes are equal or both zero
        const useVolumeBased = c.buy_volume_usd > 0 || c.sell_volume_usd > 0;
        const isBullish = useVolumeBased
          ? isBuyDominant
          : c.close >= c.open;

        return {
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          // Apply colors based on buy/sell volume dominance
          color: isBullish ? '#26a69a' : '#ef5350',
          borderColor: isBullish ? '#00897b' : '#c62828',
          wickColor: isBullish ? '#26a69a' : '#ef5350',
        };
      }).reverse();

      // Update series
      seriesRef.current.setData(candlestickData);

      // Fit content to show all data
      chartRef.current.timeScale().fitContent();

      setCandleCount(candles.length);
      setIsLoading(false);
    } catch (err: any) {
      console.error('[TimescaleOHLC] Error loading chart data:', err);
      setError(err.message || 'Failed to load chart data');
      setIsLoading(false);
    }
  }, [fetchOHLC]);

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: parseInt(height),
      layout: {
        background: { type: ColorType.Solid, color: '#1a1a1a' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#2a2a2a' },
        horzLines: { color: '#2a2a2a' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: selectedInterval === '1s' || selectedInterval === '1m',
        borderColor: '#2a2a2a',
      },
      rightPriceScale: {
        borderColor: '#2a2a2a',
        autoScale: true,
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      localization: {
        priceFormatter: (price: number) => {
          if (price === 0) return '0';
          if (Math.abs(price) < 0.00001) {
            return price.toExponential(2);
          }
          if (Math.abs(price) < 0.01) {
            return price.toFixed(8);
          }
          return price.toFixed(4);
        },
      },
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderDownColor: '#ef5350',
      borderUpColor: '#26a69a',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      priceFormat: {
        type: 'price',
        precision: 10,
        minMove: 0.0000000001,
      },
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    // Handle resize
    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  // Load data when interval changes
  useEffect(() => {
    loadChartData(selectedInterval);
  }, [selectedInterval, loadChartData]);

  // Auto-refresh (fallback when WebSocket not connected)
  useEffect(() => {
    // Skip HTTP polling if WebSocket is connected for 1s interval
    if (!autoRefresh || (wsConnected && selectedInterval === '1s')) return;

    const config = INTERVAL_CONFIG[selectedInterval];
    const interval = refreshInterval || config.refreshMs;

    refreshTimerRef.current = setInterval(() => {
      console.log(`[TimescaleOHLC] Auto-refreshing ${selectedInterval} candles...`);
      loadChartData(selectedInterval);
    }, interval);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [autoRefresh, selectedInterval, refreshInterval, loadChartData, wsConnected]);

  // WebSocket connection for live candle updates
  useEffect(() => {
    // Only use WebSocket for 1-second candles
    if (selectedInterval !== '1s') {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
        setWsConnected(false);
      }
      return;
    }

    // Build WebSocket URL
    const baseUrl = BACKEND_URL || 'http://localhost:8081';
    const wsProtocol = baseUrl.startsWith('https') ? 'wss' : 'ws';
    const wsHost = baseUrl.replace(/^https?:\/\//, '');
    const wsUrl = `${wsProtocol}://${wsHost}/v1/stream`;

    console.log(`[TimescaleOHLC WS] Connecting to ${wsUrl}`);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[TimescaleOHLC WS] Connected');
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          // Handle ohlc_candle message type
          if (message.type === 'ohlc_candle') {
            const candle: WSCandle = typeof message.data === 'string'
              ? JSON.parse(message.data)
              : message.data;

            // Only process candles for our token
            if (candle.token_address.toLowerCase() !== tokenAddress.toLowerCase()) {
              return;
            }

            // Only process 1s candles
            if (candle.interval !== '1s') {
              return;
            }

            console.log(`[TimescaleOHLC WS] Received candle: time=${candle.time}, close=${candle.c}`);

            // Update chart with new candle
            if (seriesRef.current) {
              const chartCandle = {
                time: candle.time as UTCTimestamp,
                open: candle.o,
                high: candle.h,
                low: candle.l,
                close: candle.c,
              };

              // Update existing candle or add new one
              seriesRef.current.update(chartCandle);

              // Track candle in our ref
              candleDataRef.current.set(candle.time, chartCandle);
              setCandleCount(candleDataRef.current.size);
            }
          }

          // Handle ping message
          if (message.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          }
        } catch (err) {
          console.error('[TimescaleOHLC WS] Parse error:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('[TimescaleOHLC WS] Error:', err);
      };

      ws.onclose = () => {
        console.log('[TimescaleOHLC WS] Disconnected');
        setWsConnected(false);
        wsRef.current = null;
      };
    } catch (err) {
      console.error('[TimescaleOHLC WS] Connection error:', err);
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [selectedInterval, tokenAddress]);

  const intervals: TimescaleInterval[] = ['1s', '1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];

  return (
    <div className={`timescale-ohlc-chart ${className}`}>
      {/* Header with interval selector */}
      <div className="flex items-center justify-between mb-3 px-2">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-white">Price Chart</h3>
          {candleCount > 0 && (
            <span className="text-xs text-gray-400">
              {candleCount} candles
            </span>
          )}
        </div>

        {/* Interval buttons */}
        <div className="flex gap-1.5">
          {intervals.map((interval) => (
            <button
              key={interval}
              onClick={() => setSelectedInterval(interval)}
              disabled={isLoading}
              className={`px-3 py-1.5 text-sm font-medium rounded transition-all ${
                selectedInterval === interval
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50 hover:text-white'
              } ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {interval}
            </button>
          ))}
        </div>
      </div>

      {/* Chart container */}
      <div className="relative rounded-lg overflow-hidden border border-gray-700/50">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-white text-sm">Loading {selectedInterval} candles...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
            <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 max-w-md">
              <p className="text-red-400 text-sm">{error}</p>
              <button
                onClick={() => loadChartData(selectedInterval)}
                className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        <div ref={containerRef} style={{ width, height }} />
      </div>

      {/* Info footer */}
      <div className="mt-2 px-2 flex items-center justify-between text-xs text-gray-400">
        <span>
          Powered by TimescaleDB • {selectedInterval} intervals
          {selectedInterval === '1s' && wsConnected
            ? ' • WebSocket streaming'
            : autoRefresh && ` • Auto-refresh every ${(refreshInterval || INTERVAL_CONFIG[selectedInterval].refreshMs) / 1000}s`}
        </span>
        <span className={wsConnected ? 'text-green-400' : 'text-yellow-400'}>
          {wsConnected ? '● Live (WS)' : '● Live (HTTP)'}
        </span>
      </div>
    </div>
  );
};

export default TimescaleOHLCChart;
