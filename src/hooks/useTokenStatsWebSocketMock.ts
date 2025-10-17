import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Mock WebSocket hook that simulates real WebSocket system
 * needs to be replaced with the real useTokenStatsWebSocket hook
 */

// Define types locally for the mock
interface TimeframeStats {
  buy_count: number;
  sell_count: number;
  buy_volume: number;
  sell_volume: number;
  total_volume: number;
  price_change: number;
  price_change_percent: number;
  current_price: number;
  high: number;
  low: number;
  open: number;
  close: number;
}

interface TokenStats {
  pair_address: string;
  token_address: string;
  timeframes: {
    '5m': TimeframeStats;
    '1h': TimeframeStats;
    '12h': TimeframeStats;
    '24h': TimeframeStats;
  };
  last_updated: string;
}

interface TokenStatsWebSocketOptions {
  pairAddress?: string;
  tokenAddress?: string;
  enabled?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

interface TokenStatsWebSocketState {
  stats: TokenStats | null;
  isConnected: boolean;
  isConnecting: boolean;
  loading: boolean;
  error: string | null;
  lastUpdate: string | null;
  reconnectAttempts: number;
}

// Mock data generator that simulates real token stats
const generateMockTokenStats = (pairAddress: string): TokenStats => {
  const basePrice = 100 + Math.random() * 50; // Random base price between 100-150
  const now = new Date().toISOString();

  const generateTimeframeStats = (timeframe: string): TimeframeStats => {
    const volatility = timeframe === '5m' ? 0.02 : timeframe === '1h' ? 0.05 : timeframe === '12h' ? 0.1 : 0.15;
    const change = (Math.random() - 0.5) * volatility;
    
    const open = basePrice;
    const close = basePrice * (1 + change);
    const high = Math.max(open, close) * (1 + Math.random() * 0.01);
    const low = Math.min(open, close) * (1 - Math.random() * 0.01);
    
    const buyCount = Math.floor(Math.random() * 100) + 10;
    const sellCount = Math.floor(Math.random() * 100) + 10;
    const buyVolume = Math.random() * 1000000;
    const sellVolume = Math.random() * 1000000;
    
    return {
      buy_count: buyCount,
      sell_count: sellCount,
      buy_volume: buyVolume,
      sell_volume: sellVolume,
      total_volume: buyVolume + sellVolume,
      price_change: close - open,
      price_change_percent: (change * 100),
      current_price: close,
      high: high,
      low: low,
      open: open,
      close: close,
    };
  };

  return {
    pair_address: pairAddress,
    token_address: `token_${pairAddress.slice(-8)}`, // Mock token address
    timeframes: {
      '5m': generateTimeframeStats('5m'),
      '1h': generateTimeframeStats('1h'),
      '12h': generateTimeframeStats('12h'),
      '24h': generateTimeframeStats('24h'),
    },
    last_updated: now,
  };
};

export const useTokenStatsWebSocketMock = (options: TokenStatsWebSocketOptions) => {
  const {
    pairAddress,
    enabled = true,
    reconnectInterval = 5000,
    maxReconnectAttempts = 10
  } = options;

  const [state, setState] = useState<TokenStatsWebSocketState>({
    stats: null,
    isConnected: false,
    isConnecting: false,
    loading: true,
    error: null,
    lastUpdate: null,
    reconnectAttempts: 0
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const simulateConnection = useCallback(() => {
    if (!enabled || !pairAddress) {
      return;
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    // Simulate connection delay
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        isConnected: true,
        isConnecting: false,
        error: null,
        reconnectAttempts: 0
      }));
      reconnectAttemptsRef.current = 0;

      // Send initial data
      const initialStats = generateMockTokenStats(pairAddress);
      setState(prev => ({
        ...prev,
        stats: initialStats,
        lastUpdate: new Date().toISOString()
      }));

      // Simulate real-time updates every 2-5 seconds
      intervalRef.current = setInterval(() => {
        const updatedStats = generateMockTokenStats(pairAddress);
        setState(prev => ({
          ...prev,
          stats: updatedStats,
          lastUpdate: new Date().toISOString()
        }));
      }, 2000 + Math.random() * 3000); // Random interval between 2-5 seconds

    }, 1000 + Math.random() * 2000); // Random connection delay 1-3 seconds
  }, [pairAddress, enabled]);

  const simulateDisconnection = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setState(prev => ({
      ...prev,
      isConnected: false,
      isConnecting: false,
      error: null
    }));
  }, []);

  const simulateReconnection = useCallback(() => {
    simulateDisconnection();
    reconnectAttemptsRef.current = 0;
    simulateConnection();
  }, [simulateDisconnection, simulateConnection]);

  // Simulate connection issues occasionally
  useEffect(() => {
    if (!enabled || !state.isConnected) return;

    const simulateConnectionIssue = () => {
      if (Math.random() < 0.1) { // 10% chance of connection issue
        setState(prev => ({
          ...prev,
          isConnected: false,
          error: 'Simulated connection issue'
        }));

        // Simulate reconnection
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          setState(prev => ({
            ...prev,
            reconnectAttempts: reconnectAttemptsRef.current,
            error: `Simulated reconnection attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts}`
          }));

          reconnectTimeoutRef.current = setTimeout(() => {
            simulateConnection();
          }, reconnectInterval);
        }
      }
    };

    const issueInterval = setInterval(simulateConnectionIssue, 30000); // Check every 30 seconds
    return () => clearInterval(issueInterval);
  }, [enabled, state.isConnected, maxReconnectAttempts, reconnectInterval, simulateConnection]);

  // Connect when enabled and pairAddress changes
  useEffect(() => {
    if (enabled && pairAddress) {
      simulateConnection();
    } else {
      simulateDisconnection();
    }

    return () => {
      simulateDisconnection();
    };
  }, [enabled, pairAddress, simulateConnection, simulateDisconnection]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      simulateDisconnection();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [simulateDisconnection]);

  return {
    ...state,
    connect: simulateConnection,
    disconnect: simulateDisconnection,
    reconnect: simulateReconnection
  };
};
