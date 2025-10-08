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
  const didInitialFitRef = useRef(false); // Track if we've done the initial fit

  // Use OHLC WebSocket data if pairAddress is provided
  const { isConnected, loading, error, data: ohlcData, reconnect } = useOHLCWebSocket({
    pairAddress,
    timeframe: '1d', // Daily timeframe for very zoomed out view
    enabled: !!pairAddress,
  });

  // Removed debug logging for cleaner experience

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
            barSpacing: 2.0, // Initial; we override after setData
            // minBarSpacing: 0.5, // ← remove this
            rightOffset: 10,
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
          // Make chart less zoomed in by default
          localization: {
            timeFormatter: (time: any) => {
              return new Date(time * 1000).toLocaleTimeString();
            },
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
          // Make candlesticks thinner with better price formatting
          priceFormat: {
            type: 'price',
            precision: 6,
            minMove: 0.000001,
          },
          // Additional styling for thinner appearance
          lastValueVisible: true,
          priceLineVisible: false,
          baseLineVisible: false,
        });

        chartRef.current = chart;
        seriesRef.current = candlestickSeries;

        // If no pairAddress provided, generate mock data
        if (!pairAddress) {
          // Generate more realistic data with better spread
          const now = Math.floor(Date.now() / 1000);
          const data = [];
          let basePrice = 0.000012; // Start with a realistic small price

          for (let i = 0; i < 30; i++) { // Generate 30 days of data (30 x 1-day intervals)
            const time = (now - (30 - i) * 86400) as UTCTimestamp; // 1 day intervals (86400 seconds)
            
            // More realistic price movement for daily candles (higher volatility)
            const volatility = 0.15; // 15% daily volatility for crypto
            const trend = Math.sin(i * 0.1) * 0.02; // Slight trend over days
            const change = (Math.random() - 0.5) * volatility + trend;
            
            const open = basePrice;
            const close = basePrice * (1 + change);
            const high = Math.max(open, close) * (1 + Math.random() * 0.03);
            const low = Math.min(open, close) * (1 - Math.random() * 0.03);

            data.push({
              time,
              open: Number(open.toFixed(8)), // More precision for small prices
              high: Number(high.toFixed(8)),
              low: Number(low.toFixed(8)),
              close: Number(close.toFixed(8)),
            });

            basePrice = close;
          }

          console.log('FixedChart: Generated mock data', { count: data.length });

          // Set mock data with a small delay to ensure chart is ready
          setTimeout(() => {
            if (candlestickSeries && chart) {
              console.log('FixedChart: Setting mock data to series');
              candlestickSeries.setData(data);
              
              // After seriesRef.current.setData(data)
              if (chartRef.current) {
                const width = chartContainerRef.current?.clientWidth || 600;
                const bars = data.length;

                // Target ~80 bars on screen for larger candles
                const targetBarsOnScreen = 80;
                const spacing = Math.max(0.1, Math.min(4, width / targetBarsOnScreen));

                chartRef.current.applyOptions({
                  timeScale: { barSpacing: spacing }
                });

                // Optional: widen the logical range so the single/few bars look smaller
                if (bars < 50) {
                  const from = -Math.max(100, 200 - bars); // show empty space to the left
                  const to = bars; // keep right edge at the last bar
                  // @ts-ignore old typings
                  chartRef.current.timeScale().setVisibleLogicalRange({ from, to });
                }
              }
              
              // Fit to all content for zoomed out view by default
              if (!didInitialFitRef.current) {
                chart.timeScale().fitContent();
                didInitialFitRef.current = true;
              }
              
              setIsReady(true);
              console.log('FixedChart: Mock data set successfully with dynamic spacing');
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

    // Convert OHLC data to chart format and deduplicate by timestamp
    const dataMap = new Map<number, any>();
    
    ohlcData.forEach(item => {
      const time = Math.floor(new Date(item.timestamp).getTime() / 1000);
      dataMap.set(time, {
        time: time as UTCTimestamp,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
      });
    });

    // Convert to array and sort by time
    const chartData = Array.from(dataMap.values()).sort((a, b) => a.time - b.time);

    console.log('FixedChart: Setting real OHLC data to series', { 
      originalCount: ohlcData.length, 
      deduplicatedCount: chartData.length,
      times: chartData.map(d => new Date(d.time * 1000).toISOString())
    });
    
    seriesRef.current.setData(chartData);
    
    // After seriesRef.current.setData(chartData)
    if (chartRef.current) {
      const width = chartContainerRef.current?.clientWidth || 600;
      const bars = chartData.length;

      // Target ~80 bars on screen for larger candles
      const targetBarsOnScreen = 80;
      const spacing = Math.max(0.1, Math.min(4, width / targetBarsOnScreen));

      chartRef.current.applyOptions({
        timeScale: { barSpacing: spacing }
      });

      // Optional: widen the logical range so the single/few bars look smaller
      if (bars < 50) {
        const from = -Math.max(100, 200 - bars); // show empty space to the left
        const to = bars; // keep right edge at the last bar
        // @ts-ignore old typings
        chartRef.current.timeScale().setVisibleLogicalRange({ from, to });
      }
    }
    
    // Fit to all content for zoomed out view by default (after first data load)
    if (chartRef.current && chartData.length > 0 && !didInitialFitRef.current) {
      chartRef.current.timeScale().fitContent();
      didInitialFitRef.current = true;
    }
  }, [ohlcData, pairAddress]);

  return (
    <div className={`relative ${className}`} style={{ height, width }}>
      {/* Connection Status Indicator - Hidden for seamless experience */}
      
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
      
      {/* No Data Overlay */}
      {pairAddress && !loading && !error && ohlcData.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50">
          <div className="text-white text-center">
            <p className="text-gray-400 mb-2">No Trading Activity</p>
            <p className="text-sm mb-4">This pair has no recent OHLC data</p>
            <p className="text-xs text-gray-500">
              WebSocket: {isConnected ? 'Connected ✓' : 'Disconnected ✗'}
            </p>
            {!isConnected && (
              <button
                onClick={reconnect}
                className="mt-2 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Retry Connection
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FixedChart;
