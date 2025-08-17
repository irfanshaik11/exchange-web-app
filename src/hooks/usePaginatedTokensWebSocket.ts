import { useEffect, useRef, useState } from 'react';
import throttle from 'lodash.throttle';
import { env } from '../env';

interface UsePaginatedTokensWebSocketParams {
  filter?: 'marketcap' | 'volume_24h' | 'txs_24h' | 'txs_5m' | 'txs_1h' | 'txs_6h' | 'new' | 'newmarketcap' | 'trending';
  order?: 'asc' | 'desc';
  offset?: number;
  limit?: number;
}

interface WebSocketState {
  isConnected: boolean;
  isReconnecting: boolean;
  error: string | null;
  loading: boolean;
}

export default function usePaginatedTokensWebSocket({
  filter = 'marketcap',
  order = 'desc',
  offset = 0,
  limit = 20,
}: UsePaginatedTokensWebSocketParams = {}) {
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    isReconnecting: false,
    error: null,
    loading: true,
  });
  const [data, setData] = useState<any[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxReconnectAttempts = 5;
  const reconnectAttemptRef = useRef(0);

  const throttledSetData = useRef(
    throttle((newData: any[]) => {
      setData(newData);
      setState(prev => ({ ...prev, loading: false }));
    }, 1000)
  ).current;

  useEffect(() => {
    setState(prev => ({ ...prev, loading: true, isConnected: false, error: null }));

    const connectWebSocket = () => {
      try {
        // The backend uses the URL to determine the subscription
        const queryParams = new URLSearchParams({
          filter: filter || 'marketcap',
          order: order || 'desc',
          offset: (offset || 0).toString(),
          limit: (limit || 20).toString(),
        });
        const wsUrl = `${env.NEXT_PUBLIC_WEBSOCKET_URL.replace(/^http/, 'ws')}/ws/tokens?${queryParams}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setState(prev => ({ ...prev, isConnected: true, isReconnecting: false, error: null }));
          reconnectAttemptRef.current = 0;
        };

        ws.onmessage = (event) => {
          try {
            // The backend sends the array of tokens directly
            const message = JSON.parse(event.data);
            throttledSetData(message);
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
            setState(prev => ({ ...prev, error: 'Failed to parse WebSocket message' }));
          }
        };

        ws.onclose = (event) => {
          console.log('WebSocket connection closed with code:', event.code, 'reason:', event.reason);
          setState(prev => ({ ...prev, isConnected: false }));
          // Don't reconnect if the component is unmounted or the close was intentional
          if (wsRef.current) {
            handleReconnect();
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setState(prev => ({ ...prev, error: 'WebSocket connection error. Attempting to reconnect...' }));
        };
      } catch (error) {
        console.error('Failed to establish WebSocket connection:', error);
        setState(prev => ({ ...prev, error: 'Failed to establish WebSocket connection' }));
      }
    };

    const handleReconnect = () => {
      if (reconnectAttemptRef.current >= maxReconnectAttempts) {
        setState(prev => ({
          ...prev,
          isReconnecting: false,
          error: 'Maximum reconnection attempts reached. Please refresh the page.'
        }));
        return;
      }
      setState(prev => ({ ...prev, isReconnecting: true }));
      reconnectAttemptRef.current += 1;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current - 1), 16000);
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
    };

    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        const ws = wsRef.current;
        wsRef.current = null; // Prevent reconnection on intentional close
        ws.close();
      }
      throttledSetData.cancel();
    };
    // The connection must be re-established if the filter parameters change
  }, [filter, order, offset, limit, throttledSetData]);

  return {
    ...state,
    data,
  };
} 