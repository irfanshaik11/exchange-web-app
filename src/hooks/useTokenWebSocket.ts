import { useEffect, useRef, useState } from 'react';
import throttle from 'lodash.throttle';
import { NEXT_PUBLIC_WEBSOCKET_URL } from '../env';

interface WebSocketState {
  isConnected: boolean;
  isReconnecting: boolean;
  error: string | null;
}

export function useTokenWebSocket(tokenAddress?: string) {
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    isReconnecting: false,
    error: null
  });
  const [data, setData] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const maxReconnectAttempts = 5;
  const reconnectAttemptRef = useRef(0);

  const throttledSetData = useRef(
    throttle((newData: any) => {
      setData(newData);
    }, 1000)
  ).current;

  useEffect(() => {
    const connectWebSocket = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        return;
      }

      try {
        const ws = new WebSocket(NEXT_PUBLIC_WEBSOCKET_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          setState(prev => ({ ...prev, isConnected: true, isReconnecting: false, error: null }));
          reconnectAttemptRef.current = 0;
          
          // Subscribe to token updates
          if (tokenAddress) {
            ws.send(JSON.stringify({ type: 'subscribe', token: tokenAddress }));
          } else {
            ws.send(JSON.stringify({ type: 'subscribe', all: true }));
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            throttledSetData(data);
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
          }
        };

        ws.onclose = () => {
          setState(prev => ({ ...prev, isConnected: false }));
          handleReconnect();
        };

        ws.onerror = (error) => {
          setState(prev => ({ 
            ...prev, 
            error: 'WebSocket connection error. Attempting to reconnect...' 
          }));
          handleReconnect();
        };
      } catch (error) {
        setState(prev => ({ 
          ...prev, 
          error: 'Failed to establish WebSocket connection' 
        }));
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

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current - 1), 16000);
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      throttledSetData.cancel();
    };
  }, [tokenAddress, throttledSetData]);

  return {
    ...state,
    data
  };
} 