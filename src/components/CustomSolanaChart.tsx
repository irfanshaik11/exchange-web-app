import React, { useState } from 'react';
import type { Token } from '~/utils/db';
import { useCodexOHLC } from '~/hooks/useCodexOHLC';
import LightweightChart from './LightweightChart';
import { useChartData } from '~/hooks/useChartData';

interface CustomSolanaChartProps {
  token: Token;
  pairAddress?: string;
  height?: string;
  width?: string;
}

const CustomSolanaChart: React.FC<CustomSolanaChartProps> = ({ 
  token, 
  pairAddress,
  height = "100%",
  width = "100%"
}) => {
  // Use real-time OHLC data from Codex (disabled until deployed service is ready)
  const { ohlcData, isConnected, error: wsError } = useCodexOHLC({
    tokenId: token.mint, // Use token mint as tokenId
    enabled: false // Disabled until teammate deploys the service
  });

  // Use lightweight chart data with mock data
  const { data: chartData, isLoading, error, refresh } = useChartData({
    pairAddress: pairAddress || 'So11111111111111111111111111111111111111112', // Default pair for mock data
    interval: '1m',
    limit: 100,
    useWebSocket: false, // Force mock data for now
    generateHistory: true
  });

  // Debug logging
  console.log('CustomSolanaChart Debug:', {
    token: token.symbol,
    pairAddress,
    chartDataLength: chartData.length,
    isLoading,
    error,
    hasData: chartData.length > 0
  });

  // Combine WebSocket error with chart data error
  const combinedError = error || wsError;

  return (
    <div style={{ height, width }} className="relative">
      {/* Enhanced Real-time OHLC Header - Hidden until deployed service */}
      {false && ohlcData && (
        <div className="absolute top-0 left-0 right-0 h-14 bg-gradient-to-r from-gray-900 to-gray-800 border-b border-gray-700 flex items-center px-4 text-white text-sm z-20 shadow-lg">
          <div className="flex items-center justify-between w-full">
            {/* Left: OHLC Data */}
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <span className="text-gray-400 text-xs">O:</span>
                <span className="text-white font-mono text-sm">${ohlcData.o.toFixed(6)}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-gray-400 text-xs">H:</span>
                <span className="text-emerald-400 font-mono text-sm">${ohlcData.h.toFixed(6)}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-gray-400 text-xs">L:</span>
                <span className="text-red-400 font-mono text-sm">${ohlcData.l.toFixed(6)}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-gray-400 text-xs">C:</span>
                <span className={`font-mono text-sm font-semibold ${ohlcData.c >= ohlcData.o ? 'text-emerald-400' : 'text-red-400'}`}>
                  ${ohlcData.c.toFixed(6)}
                </span>
              </div>
              <div className="flex items-center space-x-2 ml-4">
                <span className="text-gray-400 text-xs">Vol:</span>
                <span className="text-blue-400 font-mono text-sm">
                  {ohlcData.volume > 1000000 
                    ? `${(ohlcData.volume / 1000000).toFixed(1)}M`
                    : ohlcData.volume > 1000 
                      ? `${(ohlcData.volume / 1000).toFixed(1)}K`
                      : ohlcData.volume.toFixed(0)
                  }
                </span>
              </div>
            </div>

            {/* Right: Status & Price Change */}
            <div className="flex items-center space-x-4">
              {/* Price Change Indicator */}
              <div className="flex items-center space-x-2">
                <span className="text-gray-400 text-xs">24h:</span>
                <span className={`font-mono text-sm font-semibold ${ohlcData.c >= ohlcData.o ? 'text-emerald-400' : 'text-red-400'}`}>
                  {ohlcData.c >= ohlcData.o ? '+' : ''}{((ohlcData.c - ohlcData.o) / ohlcData.o * 100).toFixed(2)}%
                </span>
              </div>
              
              {/* Connection Status */}
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></div>
                <span className="text-gray-400 text-xs">
                  {isConnected ? 'Live Data' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightweight Chart */}
      <LightweightChart
        data={chartData}
        height={height}
        width={width}
        isLoading={isLoading}
        error={combinedError}
        onRefresh={refresh}
        className="w-full h-full"
      />
    </div>
  );
};

export default CustomSolanaChart;
