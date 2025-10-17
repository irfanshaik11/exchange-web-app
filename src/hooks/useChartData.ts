import { useState, useEffect, useCallback } from 'react';
import type { OHLCData } from '../components/LightweightChart';
import { useTokenStatsWebSocketMain, USE_MOCK_CHART_DATA } from '../config/websocketConfig';
import { generateHistoricalOHLCFromStats } from '../utils/chartDataTransformers';

export interface ChartDataOptions {
  pairAddress?: string;
  interval?: string; // '1m', '5m', '15m', '1h', '4h', '1d'
  limit?: number; // number of data points to fetch
  useWebSocket?: boolean; // Enable WebSocket integration
  generateHistory?: boolean; // Generate historical data from current stats
}

export interface ChartDataState {
  data: OHLCData[];
  isLoading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  isWebSocketConnected?: boolean;
  tokenStats?: any; // Raw token stats from WebSocket
}

// Enhanced mock data generator for development/testing
const generateMockData = (count: number = 100, pairAddress?: string): OHLCData[] => {
  const data: OHLCData[] = [];
  
  // Generate different base prices based on pair address for variety
  let basePrice = 100;
  if (pairAddress) {
    // Create a consistent but varied price based on pair address hash
    const hash = pairAddress.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    basePrice = 50 + Math.abs(hash % 200); // Price between 50-250
  }
  
  const now = Math.floor(Date.now() / 1000);
  let currentPrice = basePrice;
  
  for (let i = count - 1; i >= 0; i--) {
    const time = (now - i * 60) as any; // 1 minute intervals
    
    // Generate realistic OHLC data with varying volatility
    const volatility = 0.01 + Math.random() * 0.03; // 1-4% volatility
    const trend = (Math.random() - 0.5) * 0.001; // Slight trend bias
    const change = (Math.random() - 0.5) * volatility + trend;
    
    const open = currentPrice;
    const close = currentPrice * (1 + change);
    const high = Math.max(open, close) * (1 + Math.random() * 0.005);
    const low = Math.min(open, close) * (1 - Math.random() * 0.005);
    
    data.push({
      time,
      open: Number(open.toFixed(6)),
      high: Number(high.toFixed(6)),
      low: Number(low.toFixed(6)),
      close: Number(close.toFixed(6)),
    });
    
    currentPrice = close;
  }
  
  return data;
};

export const useChartData = (options: ChartDataOptions = {}) => {
  const {
    pairAddress,
    interval = '5m',
    limit = 100,
    useWebSocket = false,
    generateHistory = true
  } = options;

  // Use mock data by default unless explicitly disabled
  const shouldUseMockData = USE_MOCK_CHART_DATA && !useWebSocket;

  const [state, setState] = useState<ChartDataState>({
    data: [],
    isLoading: true,
    error: null,
    lastUpdate: null,
    isWebSocketConnected: false,
    tokenStats: null,
  });

  // WebSocket integration (configurable between mock and real)
  const {
    stats: webSocketStats,
    isConnected: isWebSocketConnected,
    error: webSocketError,
    lastUpdate: webSocketLastUpdate
  } = useTokenStatsWebSocketMain({
    pairAddress: pairAddress || '',
    enabled: useWebSocket && !!pairAddress
  });

  const fetchChartData = useCallback(async () => {
    const { pairAddress, interval = '5m', limit = 100 } = options;
    
    console.log('fetchChartData: Starting', { pairAddress, interval, limit });
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Generate enhanced mock data with pair-specific pricing
      const mockData = generateMockData(limit, pairAddress);
      console.log('fetchChartData: Generated mock data', { count: mockData.length, firstPoint: mockData[0] });
      
      // Apply interval formatting if needed (temporarily disabled for debugging)
      const formattedData = interval === '1m' ? mockData : formatChartDataForInterval(mockData, interval);
      console.log('fetchChartData: Formatted data', { count: formattedData.length, interval });
      
      // Ensure we have data, fallback to raw mock data if formatting failed
      const finalData = formattedData.length > 0 ? formattedData : mockData;
      
      setState({
        data: finalData,
        isLoading: false,
        error: null,
        lastUpdate: new Date(),
        isWebSocketConnected: false,
        tokenStats: null,
      });
      
      console.log('fetchChartData: Successfully set state');
    } catch (error) {
      console.error('Failed to fetch chart data:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch chart data',
      }));
    }
  }, [options.pairAddress, options.interval, options.limit]);

  // Process WebSocket data when it updates
  useEffect(() => {
    if (useWebSocket && webSocketStats) {
      try {
        let chartData: OHLCData[] = [];
        
        if (generateHistory) {
          // Generate historical data from current stats
          chartData = generateHistoricalOHLCFromStats(
            webSocketStats,
            interval as any,
            limit
          );
        } else {
          // Use only current stats (single OHLC point)
          const currentStats = webSocketStats.timeframes[interval as keyof typeof webSocketStats.timeframes];
          if (currentStats) {
            chartData = [{
              time: Math.floor(Date.now() / 1000) as any,
              open: currentStats.open,
              high: currentStats.high,
              low: currentStats.low,
              close: currentStats.close,
            }];
          }
        }

        setState(prev => ({
          ...prev,
          data: chartData,
          isLoading: false,
          error: null,
          lastUpdate: webSocketLastUpdate || new Date(),
          isWebSocketConnected,
          tokenStats: webSocketStats,
        }));
      } catch (error) {
        console.error('Failed to process WebSocket data:', error);
        setState(prev => ({
          ...prev,
          error: 'Failed to process real-time data',
          isLoading: false,
        }));
      }
    }
  }, [webSocketStats, webSocketLastUpdate, isWebSocketConnected, useWebSocket, generateHistory, interval, limit]);

  // Handle WebSocket errors
  useEffect(() => {
    if (useWebSocket && webSocketError) {
      setState(prev => ({
        ...prev,
        error: webSocketError,
        isWebSocketConnected: false,
      }));
    }
  }, [webSocketError, useWebSocket]);

  // Auto-fetch data when options change (use mock data by default)
  useEffect(() => {
    if (shouldUseMockData) {
      console.log('useChartData: Fetching mock data', { pairAddress, interval, limit });
      fetchChartData();
    } else {
      console.log('useChartData: Not using mock data', { useWebSocket, USE_MOCK_CHART_DATA });
    }
  }, [fetchChartData, shouldUseMockData, pairAddress, interval, limit]);

  // Set up auto-refresh for mock data
  useEffect(() => {
    if (!shouldUseMockData) return; // Only refresh mock data
    
    const refreshInterval = options.interval === '1m' ? 30000 : 60000; // 30s for 1m, 1m for others
    
    const interval = setInterval(() => {
      fetchChartData();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [fetchChartData, options.interval, shouldUseMockData]);

  return {
    ...state,
    refresh: fetchChartData,
  };
};

// Utility function to format OHLC data for different time intervals
export const formatChartDataForInterval = (
  data: OHLCData[], 
  interval: string
): OHLCData[] => {
  if (!data.length) return [];

  switch (interval) {
    case '1m':
      return data; // Already in 1-minute format
    
    case '5m':
      return aggregateData(data, 5);
    
    case '15m':
      return aggregateData(data, 15);
    
    case '1h':
      return aggregateData(data, 60);
    
    case '4h':
      return aggregateData(data, 240);
    
    case '1d':
      return aggregateData(data, 1440); // 24 hours * 60 minutes
    
    default:
      return data;
  }
};

// Helper function to aggregate 1-minute data into larger intervals
const aggregateData = (data: OHLCData[], minutes: number): OHLCData[] => {
  if (!data.length) return [];

  const aggregated: OHLCData[] = [];
  let currentGroup: OHLCData[] = [];
  
  for (let i = 0; i < data.length; i++) {
    currentGroup.push(data[i]);
    
    // If we've collected enough data points or reached the end
    if (currentGroup.length === minutes || i === data.length - 1) {
      const group = currentGroup;
      
      aggregated.push({
        time: group[0].time, // Use the first timestamp
        open: group[0].open,
        high: Math.max(...group.map(d => d.high)),
        low: Math.min(...group.map(d => d.low)),
        close: group[group.length - 1].close,
      });
      
      currentGroup = [];
    }
  }
  
  return aggregated;
};
