import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import useOHLCWebSocket from '../hooks/useOHLCWebSocket';

interface FixedChartProps {
  height?: string;
  width?: string;
  className?: string;
  pairAddress?: string;
}

/**
 * Fixed chart that ensures data renders properly
 */
const FixedChart: React.FC<FixedChartProps> = ({
  height = "400px",
  width = "100%",
  className = "",
  pairAddress
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Use OHLC WebSocket data if pairAddress is provided
  const { isConnected, loading, error, data: ohlcData, reconnect } = useOHLCWebSocket({
    pairAddress,
    timeframe: '5m',
    enabled: !!pairAddress,
  });

  useEffect(() => {
    if (!chartContainerRef.current) return;

    console.log('FixedChart: Starting initialization');

    // Add delay to ensure container is ready
    const timer = setTimeout(() => {
      if (!chartContainerRef.current) return;

      try {
        const container = chartContainerRef.current;
        const containerWidth = container.clientWidth || 600;
        const containerHeight = container.clientHeight || 300;

        console.log('FixedChart: Container dimensions', { containerWidth, containerHeight });

        // Create chart
        const chart = createChart(container, {
          width: containerWidth,
          height: containerHeight,
          layout: {
            background: { type: ColorType.Solid, color: '#131722' },
            textColor: '#d1d4dc',
          },
          grid: {
            vertLines: { color: '#2B2B43' },
            horzLines: { color: '#2B2B43' },
          },
          crosshair: {
            mode: 1,
          },
          rightPriceScale: {
            borderColor: '#2B2B43',
          },
          timeScale: {
            borderColor: '#2B2B43',
            timeVisible: true,
            secondsVisible: false,
          },
          handleScroll: {
            mouseWheel: true,
            pressedMouseMove: true,
          },
          handleScale: {
            axisPressedMouseMove: true,
            mouseWheel: true,
            pinch: true,
          },
        });

        // Create candlestick series
        const candlestickSeries = chart.addSeries(CandlestickSeries, {
          upColor: '#26a69a',
          downColor: '#ef5350',
          borderDownColor: '#ef5350',
          borderUpColor: '#26a69a',
          wickDownColor: '#ef5350',
          wickUpColor: '#26a69a',
        });

        chartRef.current = chart;
        seriesRef.current = candlestickSeries;

        // If no pairAddress provided, generate mock data
        if (!pairAddress) {
          // Generate more realistic data with better spread
          const now = Math.floor(Date.now() / 1000);
          const data = [];
          let basePrice = 100;

          for (let i = 0; i < 100; i++) {
            const time = (now - (100 - i) * 60) as UTCTimestamp; // 1 minute intervals
            
            // More realistic price movement
            const volatility = 0.03; // 3% volatility
            const trend = Math.sin(i * 0.1) * 0.001; // Slight trend
            const change = (Math.random() - 0.5) * volatility + trend;
            
            const open = basePrice;
            const close = basePrice * (1 + change);
            const high = Math.max(open, close) * (1 + Math.random() * 0.01);
            const low = Math.min(open, close) * (1 - Math.random() * 0.01);

            data.push({
              time,
              open: Number(open.toFixed(2)),
              high: Number(high.toFixed(2)),
              low: Number(low.toFixed(2)),
              close: Number(close.toFixed(2)),
            });

            basePrice = close;
          }

          console.log('FixedChart: Generated mock data', { count: data.length });

          // Set mock data with a small delay to ensure chart is ready
          setTimeout(() => {
            if (candlestickSeries) {
              console.log('FixedChart: Setting mock data to series');
              candlestickSeries.setData(data);
              setIsReady(true);
              console.log('FixedChart: Mock data set successfully');
            }
          }, 100);
        } else {
          // Real data will be set via useEffect when ohlcData changes
          setIsReady(true);
        }

        // Handle resize
        const handleResize = () => {
          if (container && chart) {
            const newWidth = container.clientWidth || 600;
            const newHeight = container.clientHeight || 300;
            chart.applyOptions({
              width: newWidth,
              height: newHeight,
            });
          }
        };

        window.addEventListener('resize', handleResize);

        return () => {
          window.removeEventListener('resize', handleResize);
          chart.remove();
        };
      } catch (error) {
        console.error('FixedChart: Error creating chart', error);
      }
    }, 200); // 200ms delay

    return () => {
      clearTimeout(timer);
    };
  }, []);

  // Handle real OHLC data from WebSocket
  useEffect(() => {
    if (!seriesRef.current || !pairAddress || ohlcData.length === 0) {
      return;
    }

    console.log('FixedChart: Processing OHLC data', { count: ohlcData.length });

    // Convert OHLC data to chart format
    const chartData = ohlcData.map(item => ({
      time: (new Date(item.timestamp).getTime() / 1000) as UTCTimestamp,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
    }));

    console.log('FixedChart: Setting real OHLC data to series', { count: chartData.length });
    seriesRef.current.setData(chartData);
    
    // Fit content to show all data
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [ohlcData, pairAddress]);

  return (
    <div className={`relative ${className}`} style={{ height, width }}>
      {/* Connection Status Indicator */}
      {pairAddress && (
        <div className="absolute top-2 right-2 z-10 flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${
            isConnected ? 'bg-green-400' : 'bg-red-400'
          }`}></div>
          <span className="text-xs text-gray-400">
            {isConnected ? 'Live' : 'Disconnected'}
          </span>
          {error && (
            <button
              onClick={reconnect}
              className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Retry
            </button>
          )}
        </div>
      )}
      
      <div 
        ref={chartContainerRef} 
        className="w-full h-full"
        style={{ height: '100%', width: '100%' }}
      />
      
      {/* Loading Overlay */}
      {(!isReady || (pairAddress && loading)) && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50">
          <div className="text-white text-sm">
            {pairAddress ? 'Connecting to OHLC data...' : 'Loading chart data...'}
          </div>
        </div>
      )}
      
      {/* Error Overlay */}
      {pairAddress && error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-900 bg-opacity-75">
          <div className="text-white text-center">
            <p className="text-red-400 mb-2">Connection Error</p>
            <p className="text-sm mb-4">{error}</p>
            <button
              onClick={reconnect}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Retry Connection
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FixedChart;
