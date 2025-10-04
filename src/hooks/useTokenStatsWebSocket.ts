import { useState, useEffect, useRef, useCallback } from 'react';

export interface TokenStats {
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

export interface TimeframeStats {
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

export interface TokenStatsWebSocketOptions {
  pairAddress: string;
  enabled?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export interface TokenStatsWebSocketState {
  stats: TokenStats | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  lastUpdate: Date | null;
  reconnectAttempts: number;
}

export const useTokenStatsWebSocket = (options: TokenStatsWebSocketOptions) => {
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
    error: null,
    lastUpdate: null,
    reconnectAttempts: 0
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (!enabled || !pairAddress || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      const wsUrl = `ws://localhost:8080/v1/ws/token-stats?pair_address=${encodeURIComponent(pairAddress)}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('TokenStats WebSocket connected for pair:', pairAddress);
        setState(prev => ({
          ...prev,
          isConnected: true,
          isConnecting: false,
          error: null,
          reconnectAttempts: 0
        }));
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as TokenStats;
          setState(prev => ({
            ...prev,
            stats: data,
            lastUpdate: new Date(),
            error: null
          }));
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
          setState(prev => ({
            ...prev,
            error: 'Failed to parse server message'
          }));
        }
      };

      ws.onclose = (event) => {
        console.log('TokenStats WebSocket closed:', event.code, event.reason);
        setState(prev => ({
          ...prev,
          isConnected: false,
          isConnecting: false
        }));

        // Attempt to reconnect if not manually closed
        if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          setState(prev => ({
            ...prev,
            reconnectAttempts: reconnectAttemptsRef.current,
            error: `Connection lost. Reconnecting... (${reconnectAttemptsRef.current}/${maxReconnectAttempts})`
          }));

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setState(prev => ({
            ...prev,
            error: 'Max reconnection attempts reached'
          }));
        }
      };

      ws.onerror = (error) => {
        console.error('TokenStats WebSocket error:', error);
        setState(prev => ({
          ...prev,
          error: 'WebSocket connection error',
          isConnecting: false
        }));
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to create WebSocket connection',
        isConnecting: false
      }));
    }
  }, [pairAddress, enabled, reconnectInterval, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }

    setState(prev => ({
      ...prev,
      isConnected: false,
      isConnecting: false,
      error: null
    }));
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    connect();
  }, [disconnect, connect]);

  // Connect when enabled and pairAddress changes
  useEffect(() => {
    if (enabled && pairAddress) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, pairAddress, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    ...state,
    connect,
    disconnect,
    reconnect
  };
};
