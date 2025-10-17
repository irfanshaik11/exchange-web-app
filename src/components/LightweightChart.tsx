import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, Time, UTCTimestamp } from 'lightweight-charts';

export interface OHLCData {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface LightweightChartProps {
  data?: OHLCData[];
  height?: string;
  width?: string;
  isLoading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  className?: string;
}

const LightweightChart: React.FC<LightweightChartProps> = ({
  data = [],
  height = "400px",
  width = "100%",
  isLoading = false,
  error = null,
  onRefresh,
  className = ""
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  // Initialize chart
  const initializeChart = useCallback(() => {
    if (!chartContainerRef.current || chartRef.current) {
      console.log('LightweightChart: Cannot initialize', {
        hasContainer: !!chartContainerRef.current,
        hasChart: !!chartRef.current
      });
      return;
    }

    try {
      console.log('LightweightChart: Initializing chart', {
        containerWidth: chartContainerRef.current.clientWidth,
        containerHeight: chartContainerRef.current.clientHeight
      });

      // Create chart with dark theme
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
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

      console.log('LightweightChart: Chart initialized successfully');

      // Handle resize
      const handleResize = () => {
        if (chartContainerRef.current && chartRef.current) {
          chartRef.current.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
          });
        }
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
      };
    } catch (error) {
      console.error('Failed to initialize chart:', error);
    }
  }, []);

  // Update chart data
  const updateChartData = useCallback(() => {
    if (!seriesRef.current || !data.length) {
      console.log('LightweightChart: Cannot update data', {
        hasSeries: !!seriesRef.current,
        dataLength: data.length,
        firstDataPoint: data[0]
      });
      return;
    }

    try {
      // Convert data to the format expected by lightweight-charts
      const formattedData = data.map(item => ({
        time: item.time as UTCTimestamp,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
      }));

      console.log('LightweightChart: Setting formatted data', {
        count: formattedData.length,
        firstPoint: formattedData[0],
        lastPoint: formattedData[formattedData.length - 1]
      });

      seriesRef.current.setData(formattedData);
      console.log('LightweightChart: Data set successfully');
    } catch (error) {
      console.error('LightweightChart: Failed to update chart data:', error);
    }
  }, [data]);

  // Initialize chart on mount
  useEffect(() => {
    initializeChart();
    
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, [initializeChart]);

  // Update data when it changes
  useEffect(() => {
    console.log('LightweightChart: Updating chart data', {
      dataLength: data.length,
      hasSeries: !!seriesRef.current,
      hasChart: !!chartRef.current
    });
    updateChartData();
  }, [updateChartData]);

  // Handle loading state
  if (isLoading) {
    return (
      <div 
        className={`flex items-center justify-center bg-gray-900 ${className}`}
        style={{ height, width }}
      >
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <p className="text-gray-400 text-sm">Loading chart data...</p>
        </div>
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div 
        className={`flex items-center justify-center bg-gray-900 ${className}`}
        style={{ height, width }}
      >
        <div className="flex flex-col items-center space-y-4 text-center">
          <div className="text-red-400 text-4xl">📉</div>
          <div className="text-red-400 font-semibold">Chart Error</div>
          <p className="text-gray-400 text-sm max-w-xs">{error}</p>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div 
        ref={chartContainerRef} 
        className="w-full h-full"
        style={{ height, width }}
      />
    </div>
  );
};

export default LightweightChart;
