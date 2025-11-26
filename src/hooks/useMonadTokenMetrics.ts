import { useEffect, useRef, useState, useCallback } from 'react';

export interface TokenMetrics {
  address: string;

  // Price data
  price_mon: number;
  price_usd: number;

  // Market metrics
  market_cap_usd: number;
  liquidity_usd: number;
  graduation_percent: number; // Bonding curve progress (0-100)

  // Volume (24h rolling)
  volume_24h_usd: number;
  volume_24h_mon: number;

  // Transaction counts (lifetime)
  total_buys: number;
  total_sells: number;
  total_transactions: number;
  unique_traders: number;

  // Volume breakdown (lifetime)
  total_buy_volume_mon: number;
  total_sell_volume_mon: number;
  total_buy_volume_usd: number;
  total_sell_volume_usd: number;
  net_volume_usd: number; // buy - sell

  // Latest trade info
  last_trade_at: number; // Unix timestamp
  updated_at: number;
}

interface UseMonadTokenMetricsOptions {
  tokenAddress: string;
  enabled?: boolean;
  onUpdate?: (metrics: TokenMetrics) => void;
}

export function useMonadTokenMetrics({
  tokenAddress,
  enabled = true,
  onUpdate,
}: UseMonadTokenMetricsOptions) {
  const [metrics, setMetrics] = useState<TokenMetrics | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (!enabled || !tokenAddress) return;

    // Use indexer WebSocket (port 8083) for real-time metrics
    const wsUrl = process.env.NEXT_PUBLIC_MONAD_INDEXER_WS_URL || 'ws://localhost:8083/ws';

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
        reconnectAttempts.current = 0;
        console.log(`[TokenMetrics WS] Connected, listening for ${tokenAddress}`);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          // Handle token_metrics messages
          if (message.type === 'token_metrics') {
            // Data might be already parsed object or a JSON string (depending on Go json.RawMessage handling)
            const data: TokenMetrics = typeof message.data === 'string'
              ? JSON.parse(message.data)
              : message.data;

            // Only process metrics for our token
            if (data.address?.toLowerCase() === tokenAddress.toLowerCase()) {
              setMetrics(data);
              onUpdate?.(data);
              console.log(`[TokenMetrics WS] Updated: $${data.price_usd?.toFixed(6)}, B.Curve ${data.graduation_percent?.toFixed(1)}%`);
            }
          }

          // Handle ping
          if (message.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          }
        } catch (e) {
          console.error('[TokenMetrics WS] Parse error:', e);
        }
      };

      ws.onerror = (e) => {
        console.error('[TokenMetrics WS] Error:', e);
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
            console.log(`[TokenMetrics WS] Reconnecting... (attempt ${reconnectAttempts.current})`);
            connect();
          }, delay);
        }
      };
    } catch (e) {
      console.error('[TokenMetrics WS] Connection error:', e);
      setError('Connection failed');
    }
  }, [enabled, tokenAddress, onUpdate]);

  // Connect on mount
  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect, tokenAddress]);

  return {
    metrics,
    connected,
    error,
  };
}
