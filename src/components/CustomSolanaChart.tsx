import React, { useState } from 'react';
import type { Token } from '~/utils/db';
import { useCodexOHLC } from '~/hooks/useCodexOHLC';
import useOHLCWebSocket from '~/hooks/useOHLCWebSocket';
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
  // Use real-time OHLC data from WebSocket
  const {
    isConnected: wsConnected,
    loading: wsLoading,
    error: wsError,
    data: wsOHLCData,
  } = useOHLCWebSocket({
    pairAddress: pairAddress || token.pair_address,
    timeframe: "1d", // Daily timeframe for very zoomed out view
    enabled: true,
  });

  // Use real-time OHLC data from Codex (disabled until deployed service is ready)
  const { ohlcData, isConnected: codexConnected, error: codexError } = useCodexOHLC({
    tokenId: token.mint, // Use token mint as tokenId
    enabled: false // Disabled until teammate deploys the service
  });

  // Use lightweight chart data with mock data as fallback
  const { data: chartData, isLoading, error, refresh } = useChartData({
    pairAddress: pairAddress || 'So11111111111111111111111111111111111111112', // Default pair for mock data
    interval: '5m',
    limit: 100,
    useWebSocket: false, // Force mock data for now
    generateHistory: true
  });

  // Transform WebSocket OHLC data to LightweightChart format
  const transformedWSData = wsOHLCData.map(item => ({
    time: Math.floor(new Date(item.timestamp).getTime() / 1000) as any, // Convert to UTC timestamp
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
  }));

  // Use WebSocket OHLC data if available, otherwise fallback to chart data
  const displayData = wsOHLCData.length > 0 ? transformedWSData : chartData;
  const isConnected = wsConnected;
  const combinedError = wsError || error;

  // Debug logging
  console.log('CustomSolanaChart Debug:', {
    token: token.symbol,
    pairAddress,
    wsConnected,
    wsOHLCDataLength: wsOHLCData.length,
    chartDataLength: chartData.length,
    displayDataLength: displayData.length,
    isLoading: wsLoading || isLoading,
    error: combinedError,
    hasData: displayData.length > 0
  });

  // Combine WebSocket error with chart data error
  const finalError = combinedError;

  return (
    <div style={{ height, width }} className="relative">
      {/* Real-time OHLC Header */}
      {wsConnected && wsOHLCData.length > 0 && (
        <div className="absolute top-0 left-0 right-0 h-14 bg-gradient-to-r from-gray-900 to-gray-800 border-b border-gray-700 flex items-center px-4 text-white text-sm z-20 shadow-lg">
          <div className="flex items-center justify-between w-full">
            {/* Left: OHLC Data */}
            <div className="flex items-center space-x-6">
              {(() => {
                const latest = wsOHLCData[0];
                const previous = wsOHLCData[1];
                const priceChange = previous ? latest.close - previous.close : 0;
                const priceChangePercent = previous ? (priceChange / previous.close) * 100 : 0;
                
                return (
                  <>
                    <div className="flex items-center space-x-2">
                      <span className="text-gray-400 text-xs">O:</span>
                      <span className="text-white font-mono text-sm">${latest.open.toFixed(6)}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-gray-400 text-xs">H:</span>
                      <span className="text-emerald-400 font-mono text-sm">${latest.high.toFixed(6)}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-gray-400 text-xs">L:</span>
                      <span className="text-red-400 font-mono text-sm">${latest.low.toFixed(6)}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-gray-400 text-xs">C:</span>
                      <span className={`font-mono text-sm font-semibold ${latest.close >= latest.open ? 'text-emerald-400' : 'text-red-400'}`}>
                        ${latest.close.toFixed(6)}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 ml-4">
                      <span className="text-gray-400 text-xs">Change:</span>
                      <span className={`font-mono text-sm font-semibold ${priceChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {priceChange >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%
                      </span>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Right: Status */}
            <div className="flex items-center space-x-4">
              {/* Connection Status */}
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                <span className="text-gray-400 text-xs">Live OHLC Data</span>
              </div>
            </div>
          </div>
        </div>
      )}

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
        data={displayData}
        height={height}
        width={width}
        isLoading={wsLoading || isLoading}
        error={finalError}
        onRefresh={refresh}
        className="w-full h-full"
      />
    </div>
  );
};

export default CustomSolanaChart;
