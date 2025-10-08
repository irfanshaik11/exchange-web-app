import { useEffect, useRef, useState, useCallback } from 'react';

interface OHLCData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  txCount: number;
}

interface OHLCWebSocketMessage {
  type: string;
  data: OHLCData;
  timestamp: string;
}

interface UseOHLCWebSocketOptions {
  pairAddress?: string;
  timeframe?: string;
  enabled?: boolean;
}

interface UseOHLCWebSocketReturn {
  isConnected: boolean;
  loading: boolean;
  error: string | null;
  data: OHLCData[];
  lastUpdate: string | null;
  reconnect: () => void;
}

export default function useOHLCWebSocket({
  pairAddress,
  timeframe = '5m',
  enabled = true,
}: UseOHLCWebSocketOptions): UseOHLCWebSocketReturn {
  const [state, setState] = useState({
    isConnected: false,
    loading: true,
    error: null as string | null,
    data: [] as OHLCData[],
    lastUpdate: null as string | null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxReconnectAttempts = 5;
  const reconnectAttemptRef = useRef(0);

  const processMessage = useCallback((message: OHLCWebSocketMessage) => {
    try {
      console.log('OHLC websocket message received:', message);
      
      if (message.type === 'ohlc_update' && message.data) {
        const ohlcData = message.data;
        
        setState(prev => {
          // Add new data to the beginning and keep only last 200 candles
          const updatedData = [ohlcData, ...prev.data].slice(0, 200);
          
          return {
            ...prev,
            data: updatedData,
            lastUpdate: new Date().toISOString(),
            loading: false,
          };
        });
        
        console.log('OHLC data updated:', ohlcData);
      }
    } catch (error) {
      console.error('Error processing OHLC message:', error);
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    if (!pairAddress || !enabled) {
      return;
    }

    try {
      const wsUrl = `ws://34.47.209.237:8080/v1/trade/ohlc?pair_address=${pairAddress}&timeframe=${timeframe}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setState(prev => ({
          ...prev,
          isConnected: true,
          loading: false,
          error: null,
        }));
        reconnectAttemptRef.current = 0;
        console.log('OHLC websocket connected to:', wsUrl);
      };

      ws.onmessage = (event) => {
        try {
          const message: OHLCWebSocketMessage = JSON.parse(event.data);
          processMessage(message);
        } catch (error) {
          console.error('Error parsing OHLC message:', error);
        }
      };

      ws.onclose = () => {
        setState(prev => ({
          ...prev,
          isConnected: false,
          loading: false,
        }));

        // Attempt to reconnect
        if (reconnectAttemptRef.current < maxReconnectAttempts) {
          reconnectAttemptRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`Attempting to reconnect OHLC websocket (${reconnectAttemptRef.current}/${maxReconnectAttempts})`);
            connectWebSocket();
          }, delay);
        } else {
          setState(prev => ({
            ...prev,
            error: 'Failed to reconnect after maximum attempts',
          }));
        }
      };

      ws.onerror = (error) => {
        console.error('OHLC WebSocket error:', error);
        setState(prev => ({
          ...prev,
          error: 'WebSocket connection error',
          loading: false,
        }));
      };

    } catch (error) {
      console.error('Failed to create OHLC WebSocket connection:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to create WebSocket connection',
        loading: false,
      }));
    }
  }, [pairAddress, timeframe, enabled, processMessage]);

  const reconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    reconnectAttemptRef.current = 0;
    setState(prev => ({ ...prev, error: null }));
    connectWebSocket();
  }, [connectWebSocket]);

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

  return {
    ...state,
    reconnect,
  };
}