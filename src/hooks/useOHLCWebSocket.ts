import { useState, useEffect, useRef, useCallback } from 'react';
import { env } from '~/env';

const isDev = process.env.NODE_ENV !== 'production';

// OHLCV candle data from WebSocket
export interface OHLCVCandle {
  unix_time: number;  // Unix timestamp in seconds
  o: number;          // Open
  h: number;          // High
  l: number;          // Low
  c: number;          // Close
  v_usd: number;      // Volume in USD
}

// Legacy format for backward compatibility
export interface OHLCData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface UseOHLCWebSocketOptions {
  pairAddress?: string;  // Token mint address
  mint?: string;         // Alternative param name
  timeframe?: string;    // 1s, 1m, 5m, 15m, 30m, 1h, 4h, 1d
  enabled?: boolean;
  maxCandles?: number;   // Max candles to keep in memory
  onCandle?: (candle: OHLCVCandle) => void;
}

interface UseOHLCWebSocketReturn {
  isConnected: boolean;
  loading: boolean;
  error: string | null;
  data: OHLCData[];         // Legacy format
  candles: OHLCVCandle[];   // New format
  latestCandle: OHLCVCandle | null;
  reconnect: () => void;
}

// Convert new format to legacy format for backward compatibility
function toOHLCData(candle: OHLCVCandle): OHLCData {
  return {
    timestamp: new Date(candle.unix_time * 1000).toISOString(),
    open: candle.o,
    high: candle.h,
    low: candle.l,
    close: candle.c,
    volume: candle.v_usd,
  };
}

export default function useOHLCWebSocket({
  pairAddress,
  mint,
  timeframe = '1m',
  enabled = true,
  maxCandles = Infinity,
  onCandle,
}: UseOHLCWebSocketOptions): UseOHLCWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candles, setCandles] = useState<OHLCVCandle[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const mountedRef = useRef(true);
  const onCandleRef = useRef(onCandle);

  const maxReconnectAttempts = 5;
  const tokenAddress = mint || pairAddress;

  // Update callback ref when it changes
  useEffect(() => {
    onCandleRef.current = onCandle;
  }, [onCandle]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
  }, []);

  const connect = useCallback(() => {
    if (!enabled || !tokenAddress) {
      setLoading(false);
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      setError('Max reconnection attempts reached');
      setLoading(false);
      return;
    }

    try {
      const baseUrl = env.NEXT_PUBLIC_WEBSOCKET_URL;
      // Connect to OHLCV WebSocket endpoint
      const wsUrl = `${baseUrl.replace(/^http/, 'ws')}/v1/ws/ohlcv/${tokenAddress}?timeframe=${timeframe}`;

      isDev && console.log('[useOHLCWebSocket] Connecting to:', wsUrl);
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!mountedRef.current) return;
        isDev && console.log('[useOHLCWebSocket] Connected');
        setIsConnected(true);
        setError(null);
        setLoading(false);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;

        try {
          const message = JSON.parse(event.data);

          // Handle different message types
          if (message.type === 'snapshot' && message.data) {
            // Initial snapshot of candles
            const initialCandles: OHLCVCandle[] = Array.isArray(message.data)
              ? message.data
              : [];
            isDev && console.log('[useOHLCWebSocket] Snapshot received:', initialCandles.length, 'candles');
            setCandles(initialCandles.slice(-maxCandles));
            setLoading(false);
          } else if (message.type === 'candle' && message.data) {
            // Real-time candle update
            const candle: OHLCVCandle = message.data;
            onCandleRef.current?.(candle);

            setCandles((prev) => {
              // Update existing candle or append new one
              const existingIdx = prev.findIndex((c) => c.unix_time === candle.unix_time);
              if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx] = candle;
                return updated;
              }
              // Append and limit to maxCandles
              const newCandles = [...prev, candle];
              return newCandles.slice(-maxCandles);
            });
          } else if (message.type === 'pong') {
            // Ignore pong messages
          }
        } catch (err) {
          console.error('[useOHLCWebSocket] Error parsing message:', err);
        }
      };

      ws.onerror = (event) => {
        if (!mountedRef.current) return;
        console.error('[useOHLCWebSocket] WebSocket error:', event);
        setError('WebSocket connection error');
      };

      ws.onclose = (event) => {
        if (!mountedRef.current) return;
        isDev && console.log('[useOHLCWebSocket] Disconnected:', event.code, event.reason);
        setIsConnected(false);

        // Attempt to reconnect with exponential backoff
        if (enabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current += 1;
          isDev && console.log(`[useOHLCWebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);

          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              connect();
            }
          }, delay);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[useOHLCWebSocket] Failed to create WebSocket:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setLoading(false);
    }
  }, [enabled, tokenAddress, timeframe, maxCandles]);

  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    disconnect();
    connect();
  }, [connect, disconnect]);

  // Connect on mount or when parameters change
  useEffect(() => {
    mountedRef.current = true;

    if (enabled && tokenAddress) {
      setLoading(true);
      setCandles([]);
      disconnect();
      reconnectAttemptsRef.current = 0;
      connect();
    } else {
      setLoading(false);
    }

    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [enabled, tokenAddress, timeframe, connect, disconnect]);

  // Convert candles to legacy format for backward compatibility
  const data = candles.map(toOHLCData);
  const latestCandle = candles.length > 0 ? candles[candles.length - 1] : null;

  return {
    isConnected,
    loading,
    error,
    data,
    candles,
    latestCandle,
    reconnect,
  };
}