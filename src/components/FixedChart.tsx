import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';

interface FixedChartProps {
  height?: string;
  width?: string;
  className?: string;
}

/**
 * Fixed chart that ensures data renders properly
 */
const FixedChart: React.FC<FixedChartProps> = ({
  height = "400px",
  width = "100%",
  className = ""
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [isReady, setIsReady] = useState(false);

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

        console.log('FixedChart: Generated data', { count: data.length, firstPoint: data[0], lastPoint: data[data.length - 1] });

        // Set data with a small delay to ensure chart is ready
        setTimeout(() => {
          if (candlestickSeries) {
            console.log('FixedChart: Setting data to series');
            candlestickSeries.setData(data);
            setIsReady(true);
            console.log('FixedChart: Data set successfully');
          }
        }, 100);

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

  return (
    <div className={`relative ${className}`} style={{ height, width }}>
      <div 
        ref={chartContainerRef} 
        className="w-full h-full"
        style={{ height: '100%', width: '100%' }}
      />
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50">
          <div className="text-white text-sm">Loading chart data...</div>
        </div>
      )}
    </div>
  );
};

export default FixedChart;
