import React, { useState } from 'react';
import LightweightChart from './LightweightChart';
import { useChartData } from '../hooks/useChartData';
import { formatVolume, formatPriceChange, getPriceChangeColor, calculateAdditionalMetrics } from '../utils/chartDataTransformers';

export interface RealTimeTokenChartProps {
  pairAddress: string;
  tokenSymbol?: string;
  height?: string;
  width?: string;
  className?: string;
  showStatsHeader?: boolean;
  showTimeframeSelector?: boolean;
  defaultTimeframe?: string;
}

const RealTimeTokenChart: React.FC<RealTimeTokenChartProps> = ({
  pairAddress,
  tokenSymbol = 'TOKEN',
  height = "500px",
  width = "100%",
  className = "",
  showStatsHeader = true,
  showTimeframeSelector = true,
  defaultTimeframe = '5m'
}) => {
  const [selectedTimeframe, setSelectedTimeframe] = useState(defaultTimeframe);

  const timeframes = [
    { value: '5m', label: '5m' },
    { value: '1h', label: '1h' },
    { value: '12h', label: '12h' },
    { value: '24h', label: '24h' },
  ];

  // Use the enhanced chart data hook (WebSocket disabled by default, uses mock data)
  const {
    data: chartData,
    isLoading,
    error,
    refresh,
    isWebSocketConnected,
    tokenStats,
    lastUpdate
  } = useChartData({
    pairAddress,
    interval: selectedTimeframe,
    limit: 100,
    useWebSocket: false, // Disabled by default, uses mock data
    generateHistory: true
  });

  // Get current timeframe stats
  const currentStats = tokenStats?.timeframes?.[selectedTimeframe as keyof typeof tokenStats.timeframes];
  const additionalMetrics = currentStats ? calculateAdditionalMetrics(tokenStats, selectedTimeframe as any) : null;

  const renderStatsHeader = () => {
    if (!showStatsHeader || !currentStats) return null;

    const priceChange = formatPriceChange(currentStats.price_change_percent);
    const volumeFormatted = formatVolume(currentStats.total_volume);

    return (
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between w-full">
          {/* Left: OHLC Data */}
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <span className="text-gray-400 text-xs">O:</span>
              <span className="text-white font-mono text-sm">${currentStats.open.toFixed(6)}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-gray-400 text-xs">H:</span>
              <span className="text-emerald-400 font-mono text-sm">${currentStats.high.toFixed(6)}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-gray-400 text-xs">L:</span>
              <span className="text-red-400 font-mono text-sm">${currentStats.low.toFixed(6)}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-gray-400 text-xs">C:</span>
              <span className={`font-mono text-sm font-semibold ${getPriceChangeColor(priceChange.isPositive)}`}>
                ${currentStats.close.toFixed(6)}
              </span>
            </div>
            <div className="flex items-center space-x-2 ml-4">
              <span className="text-gray-400 text-xs">Vol:</span>
              <span className="text-blue-400 font-mono text-sm">{volumeFormatted}</span>
            </div>
          </div>

          {/* Right: Price Change & Connection Status */}
          <div className="flex items-center space-x-4">
            {/* Price Change */}
            <div className="flex items-center space-x-2">
              <span className="text-gray-400 text-xs">{selectedTimeframe}:</span>
              <span className={`font-mono text-sm font-semibold ${getPriceChangeColor(priceChange.isPositive)}`}>
                {priceChange.value}
              </span>
            </div>
            
            {/* Connection Status */}
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isWebSocketConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></div>
              <span className="text-gray-400 text-xs">
                {isWebSocketConnected ? 'Live' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>

        {/* Additional Metrics Row */}
        {additionalMetrics && (
          <div className="flex items-center justify-between w-full mt-2 pt-2 border-t border-gray-700">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <span className="text-gray-400 text-xs">Buy/Sell:</span>
                <span className="text-white font-mono text-sm">{additionalMetrics.buySellRatio}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-gray-400 text-xs">Vol Ratio:</span>
                <span className="text-white font-mono text-sm">{additionalMetrics.volumeRatio}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-gray-400 text-xs">Avg Trade:</span>
                <span className="text-white font-mono text-sm">${formatVolume(additionalMetrics.avgTradeSize)}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-gray-400 text-xs">Buy Dominance:</span>
                <span className="text-emerald-400 font-mono text-sm">{additionalMetrics.dominance.toFixed(1)}%</span>
              </div>
            </div>

            {/* Trade Counts */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <span className="text-gray-400 text-xs">Buys:</span>
                <span className="text-emerald-400 font-mono text-sm">{currentStats.buy_count}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-gray-400 text-xs">Sells:</span>
                <span className="text-red-400 font-mono text-sm">{currentStats.sell_count}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTimeframeSelector = () => {
    if (!showTimeframeSelector) return null;

    return (
      <div className="flex items-center space-x-1 bg-gray-800 p-1 rounded-lg">
        {timeframes.map((timeframe) => (
          <button
            key={timeframe.value}
            onClick={() => setSelectedTimeframe(timeframe.value)}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              selectedTimeframe === timeframe.value
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {timeframe.label}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className={`bg-gray-900 rounded-lg border border-gray-700 overflow-hidden ${className}`}>
      {/* Header with Token Info and Timeframe Selector */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center space-x-3">
          <h3 className="text-white font-semibold">{tokenSymbol}</h3>
          {lastUpdate && (
            <span className="text-gray-400 text-xs">
              Last update: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
        {renderTimeframeSelector()}
      </div>

      {/* Real-time Stats Header */}
      {renderStatsHeader()}

      {/* Chart */}
      <div className="relative" style={{ height: showStatsHeader ? 'calc(100% - 120px)' : 'calc(100% - 60px)' }}>
        <LightweightChart
          data={chartData}
          height="100%"
          width="100%"
          isLoading={isLoading}
          error={error}
          onRefresh={refresh}
          className="w-full h-full"
        />
      </div>

      {/* Connection Status Footer */}
      <div className="px-4 py-2 bg-gray-800 border-t border-gray-700">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isWebSocketConnected ? 'bg-emerald-400' : 'bg-red-400'}`}></div>
            <span className="text-gray-400">
              {isWebSocketConnected ? 'Connected to real-time data' : 'Disconnected from real-time data'}
            </span>
          </div>
          <span className="text-gray-500">
            Pair: {pairAddress.slice(0, 8)}...{pairAddress.slice(-8)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default RealTimeTokenChart;
