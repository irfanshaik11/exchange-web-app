import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import useOHLCWebSocket from '../hooks/useOHLCWebSocket';

interface OHLCChartProps {
  pairAddress: string;
  timeframe?: string;
  height?: number;
  className?: string;
}

const OHLCChart: React.FC<OHLCChartProps> = ({ 
  pairAddress, 
  timeframe = '5m', 
  height = 400,
  className = ''
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  const { isConnected, loading, error, data, reconnect } = useOHLCWebSocket({
    pairAddress,
    timeframe,
    enabled: true,
  });

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0B0E11' },
        textColor: '#D9D9D9',
      },
      grid: {
        vertLines: { color: '#2B2B43' },
        horzLines: { color: '#2B2B43' },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: '#485C7B',
      },
      timeScale: {
        borderColor: '#485C7B',
        timeVisible: true,
        secondsVisible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: height,
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#4CAF50',
      downColor: '#f44336',
      borderDownColor: '#f44336',
      borderUpColor: '#4CAF50',
      wickDownColor: '#f44336',
      wickUpColor: '#4CAF50',
    });

    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume',
    });

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;
    volumeSeriesRef.current = volumeSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
      }
    };
  }, [height]);

  // Update chart data
  useEffect(() => {
    if (!candlestickSeriesRef.current || !volumeSeriesRef.current || data.length === 0) {
      return;
    }

    // Convert OHLC data to chart format
    const candlestickData = data.map(item => ({
      time: (new Date(item.timestamp).getTime() / 1000) as UTCTimestamp,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
    }));

    const volumeData = data.map(item => ({
      time: (new Date(item.timestamp).getTime() / 1000) as UTCTimestamp,
      value: item.volume,
      color: item.close >= item.open ? '#4CAF50' : '#f44336',
    }));

    // Update series
    candlestickSeriesRef.current.setData(candlestickData);
    volumeSeriesRef.current.setData(volumeData);

    // Fit content to show all data
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [data]);

  const formatPrice = (price: number) => {
    if (price < 0.000001) {
      return price.toFixed(8);
    } else if (price < 0.00001) {
      return price.toFixed(7);
    } else if (price < 0.0001) {
      return price.toFixed(6);
    } else if (price < 0.001) {
      return price.toFixed(5);
    } else if (price < 0.01) {
      return price.toFixed(4);
    } else if (price < 1) {
      return price.toFixed(3);
    } else {
      return price.toFixed(2);
    }
  };

  const formatVolume = (volume: number) => {
    if (volume >= 1000000) {
      return (volume / 1000000).toFixed(1) + 'M';
    } else if (volume >= 1000) {
      return (volume / 1000).toFixed(1) + 'K';
    } else {
      return volume.toFixed(0);
    }
  };

  const getLatestPrice = () => {
    if (data.length === 0) return null;
    const latest = data[0];
    return {
      price: latest.close,
      change: data.length > 1 ? latest.close - data[1].close : 0,
      changePercent: data.length > 1 ? ((latest.close - data[1].close) / data[1].close) * 100 : 0,
    };
  };

  const latestPrice = getLatestPrice();

  return (
    <div className={`relative ${className}`}>
      {/* Chart Header */}
      <div className="flex items-center justify-between p-4 bg-gray-900 border-b border-gray-700">
        <div className="flex items-center space-x-4">
          <div>
            <h3 className="text-lg font-semibold text-white">OHLC Chart</h3>
            <p className="text-sm text-gray-400">
              {pairAddress.slice(0, 8)}...{pairAddress.slice(-8)} • {timeframe}
            </p>
          </div>
          {latestPrice && (
            <div className="flex items-center space-x-2">
              <span className="text-xl font-bold text-white">
                ${formatPrice(latestPrice.price)}
              </span>
              <span className={`text-sm font-medium ${
                latestPrice.change >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {latestPrice.change >= 0 ? '+' : ''}{latestPrice.changePercent.toFixed(2)}%
              </span>
            </div>
          )}
        </div>
        
        {/* Connection Status */}
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${
            isConnected ? 'bg-green-400' : 'bg-red-400'
          }`}></div>
          <span className="text-sm text-gray-400">
            {isConnected ? 'Live' : 'Disconnected'}
          </span>
          {error && (
            <button
              onClick={reconnect}
              className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Reconnect
            </button>
          )}
        </div>
      </div>

      {/* Chart Container */}
      <div className="relative">
        <div 
          ref={chartContainerRef} 
          style={{ height: `${height}px` }}
          className="w-full"
        />
        
        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center">
            <div className="text-white text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
              <p>Connecting to OHLC data...</p>
            </div>
          </div>
        )}

        {/* Error Overlay */}
        {error && (
          <div className="absolute inset-0 bg-red-900 bg-opacity-75 flex items-center justify-center">
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

      {/* Chart Info */}
      {data.length > 0 && (
        <div className="p-4 bg-gray-900 border-t border-gray-700">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Data Points:</span>
              <span className="text-white ml-2">{data.length}</span>
            </div>
            <div>
              <span className="text-gray-400">Latest Volume:</span>
              <span className="text-white ml-2">{formatVolume(data[0].volume)}</span>
            </div>
            <div>
              <span className="text-gray-400">Tx Count:</span>
              <span className="text-white ml-2">{data[0].txCount}</span>
            </div>
            <div>
              <span className="text-gray-400">Last Update:</span>
              <span className="text-white ml-2">
                {new Date(data[0].timestamp).toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OHLCChart;
