import { useState, useEffect, useCallback, useRef } from 'react';

export interface MarketData {
  mint: string;
  price_usd: number;
  market_cap_usd: number;
  volume_usd?: number;
  updated_at: string;
}

interface MarketDataUpdate {
  type: string;
  data: Record<string, MarketData>;
  timestamp: string;
}

interface UseRealtimeWebSocketReturn {
  marketData: Record<string, MarketData>;
  loading: boolean;
  error: string | null;
  connected: boolean;
  reconnect: () => void;
}

export function useRealtimeWebSocket(
  mints: string[],
  opts?: { 
    url?: string;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
  }
): UseRealtimeWebSocketReturn {
  const [marketData, setMarketData] = useState<Record<string, MarketData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const mintsRef = useRef<string[]>(mints);
  
  const url = opts?.url || 'ws://localhost:8080/v1/ws/market-data';
  const reconnectInterval = opts?.reconnectInterval || 5000;
  const maxReconnectAttempts = opts?.maxReconnectAttempts || 10;

  // Update mints ref when mints change
  useEffect(() => {
    mintsRef.current = mints;
  }, [mints]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnected(true);
        setLoading(false);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const update: MarketDataUpdate = JSON.parse(event.data);
          
          if (update.type === 'market_data' && update.data) {
            // Filter data to only include tokens we're interested in
            const filteredData: Record<string, MarketData> = {};
            for (const [mint, data] of Object.entries(update.data)) {
              if (mintsRef.current.includes(mint)) {
                filteredData[mint] = data;
              }
            }
            
            if (Object.keys(filteredData).length > 0) {
              setMarketData(prev => ({
                ...prev,
                ...filteredData
              }));
            }
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setConnected(false);
        
        // Attempt to reconnect if not a clean close
        if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          console.log(`Attempting to reconnect (${reconnectAttemptsRef.current}/${maxReconnectAttempts})...`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setError('Max reconnection attempts reached');
          setLoading(false);
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        setError('WebSocket connection error');
        setLoading(false);
      };

    } catch (err) {
      console.error('Failed to create WebSocket connection:', err);
      setError('Failed to connect to WebSocket');
      setLoading(false);
    }
  }, [url, reconnectInterval, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Component unmounting');
      wsRef.current = null;
    }
    
    setConnected(false);
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    connect();
  }, [disconnect, connect]);

  // Connect on mount and when mints change
  useEffect(() => {
    if (mints.length > 0) {
      connect();
    }
    
    return () => {
      disconnect();
    };
  }, [mints.length, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    marketData,
    loading,
    error,
    connected,
    reconnect,
  };
}
