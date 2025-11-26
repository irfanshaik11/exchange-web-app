import { useEffect, useRef, useState, useCallback } from 'react';

export interface OHLCCandle {
  token_address: string;
  interval: string;
  time: number;  // Unix timestamp
  o: number;     // Open
  h: number;     // High
  l: number;     // Low
  c: number;     // Close
  v: number;     // Volume
  trades: number;
}

interface UseMonadOHLCWebSocketOptions {
  tokenAddress: string;
  interval?: '1s' | '5s' | '1m';
  enabled?: boolean;
  onCandle?: (candle: OHLCCandle) => void;
}

export function useMonadOHLCWebSocket({
  tokenAddress,
  interval = '1s',
  enabled = true,
  onCandle,
}: UseMonadOHLCWebSocketOptions) {
  const [candles, setCandles] = useState<OHLCCandle[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (!enabled || !tokenAddress) return;

    const wsUrl = process.env.NEXT_PUBLIC_MONAD_WS_URL!;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
        reconnectAttempts.current = 0;

        // Subscribe to specific token's OHLC stream
        ws.send(JSON.stringify({
          type: 'subscribe_ohlc',
          data: {
            token_address: tokenAddress,
            interval: interval,
          }
        }));

        console.log(`[OHLC WS] Subscribed to ${tokenAddress} (${interval})`);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'ohlc_candle') {
            const candle: OHLCCandle = JSON.parse(message.data);

            // Only process candles for our token
            if (candle.token_address.toLowerCase() === tokenAddress.toLowerCase()) {
              setCandles(prev => {
                // Update or append candle
                const existingIdx = prev.findIndex(c => c.time === candle.time);
                if (existingIdx >= 0) {
                  const updated = [...prev];
                  updated[existingIdx] = candle;
                  return updated;
                }
                // Keep last 300 candles (5 minutes of 1s data)
                const newCandles = [...prev, candle];
                return newCandles.slice(-300);
              });

              onCandle?.(candle);
            }
          }

          // Handle pong
          if (message.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          }
        } catch (e) {
          console.error('[OHLC WS] Parse error:', e);
        }
      };

      ws.onerror = (e) => {
        console.error('[OHLC WS] Error:', e);
        setError('WebSocket error');
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;

        // Reconnect with exponential backoff
        if (enabled && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;

          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`[OHLC WS] Reconnecting... (attempt ${reconnectAttempts.current})`);
            connect();
          }, delay);
        }
      };
    } catch (e) {
      console.error('[OHLC WS] Connection error:', e);
      setError('Connection failed');
    }
  }, [enabled, tokenAddress, interval, onCandle]);

  // Connect on mount
  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        // Unsubscribe before closing
        wsRef.current.send(JSON.stringify({
          type: 'unsubscribe_ohlc',
          data: { token_address: tokenAddress }
        }));
        wsRef.current.close();
      }
    };
  }, [connect, tokenAddress]);

  // Get latest candle
  const latestCandle = candles.length > 0 ? candles[candles.length - 1] : null;

  return {
    candles,
    latestCandle,
    connected,
    error,
  };
}
