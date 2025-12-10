import { useEffect, useState, useCallback, useRef } from 'react';
import { env } from '~/env';

export interface MonadTrade {
  tx_hash: string;
  block_number: number;
  block_timestamp: number;
  token_address: string;
  trader_address: string;
  is_buy: boolean;
  mon_amount: string | number;
  token_amount: string | number;
  price_mon: string | number;
  launchpad_protocol: string;
  portal_address: string;
  created_at?: string;
}

interface WebSocketMessage {
  type: string;
  data: string; // JSON string of trade
  timestamp: number;
}

interface UseMonadTradesWebSocketOptions {
  tokenAddress?: string;
  enabled?: boolean;
  maxTrades?: number;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onNewTrade?: (trade: MonadTrade) => void;
}

interface UseMonadTradesWebSocketReturn {
  trades: MonadTrade[];
  connected: boolean;
  error: string | null;
  loading: boolean;
}

/**
 * WebSocket hook for real-time Monad trade updates
 * Connects to the Monad token service and listens for trade events
 */
export function useMonadTradesWebSocket(
  options: UseMonadTradesWebSocketOptions = {}
): UseMonadTradesWebSocketReturn {
  const {
    tokenAddress,
    enabled = true,
    maxTrades = 100,
    reconnectInterval = 2000,
    maxReconnectAttempts = 10,
    onNewTrade,
  } = options;

  const [trades, setTrades] = useState<MonadTrade[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const mountedRef = useRef(true);
  const onNewTradeRef = useRef(onNewTrade);

  // Update callback ref when it changes
  useEffect(() => {
    onNewTradeRef.current = onNewTrade;
  }, [onNewTrade]);

  // Fetch initial trades from REST API
  const fetchInitialTrades = useCallback(async () => {
    if (!tokenAddress) return;

    try {
      setLoading(true);
      const baseUrl = env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL!;
      const response = await fetch(
        `${baseUrl}/v1/trades?token_address=${tokenAddress}&limit=${maxTrades}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch trades: ${response.status}`);
      }

      const data = await response.json();
      if (data.status === 'success' && Array.isArray(data.data)) {
        setTrades(data.data);
      }
    } catch (err) {
      console.error('[useMonadTradesWebSocket] Failed to fetch initial trades:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch trades');
    } finally {
      setLoading(false);
    }
  }, [tokenAddress, maxTrades]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!enabled) {
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      setError('Max reconnection attempts reached');
      return;
    }

    try {
      const baseUrl = env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL!;
      const wsUrl = `${baseUrl.replace(/^http/, 'ws')}/v1/stream`;

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!mountedRef.current) return;
        console.log('[useMonadTradesWebSocket] Connected');
        setConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;

        try {
          // Handle batched messages (separated by newlines)
          const messages = event.data.split('\n').filter((msg: string) => msg.trim());

          for (const msgStr of messages) {
            try {
              const message: WebSocketMessage = JSON.parse(msgStr);

              if (message.type === 'new_trade' && message.data) {
                const trade: MonadTrade = JSON.parse(message.data);

                // Filter by token address if specified
                if (tokenAddress && trade.token_address.toLowerCase() !== tokenAddress.toLowerCase()) {
                  continue;
                }

                // Call callback
                onNewTradeRef.current?.(trade);

                // Update trades list with deduplication
                setTrades((prev) => {
                  const exists = prev.some((t) => t.tx_hash === trade.tx_hash);
                  if (exists) return prev;

                  const newTrades = [trade, ...prev];
                  return newTrades.slice(0, maxTrades);
                });
              }
            } catch (parseErr) {
              // Skip parse errors for individual messages
            }
          }
        } catch (err) {
          // Handle overall message processing error
        }
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        setError('WebSocket connection error');
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);

        // Attempt to reconnect
        if (enabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              connect();
            }
          }, reconnectInterval);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[useMonadTradesWebSocket] Failed to create WebSocket:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect');
    }
  }, [enabled, tokenAddress, maxTrades, reconnectInterval, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnected(false);
  }, []);

  // Fetch initial trades and connect to WebSocket on mount
  useEffect(() => {
    mountedRef.current = true;

    if (tokenAddress) {
      fetchInitialTrades();
    }

    if (enabled) {
      disconnect();
      reconnectAttemptsRef.current = 0;
      connect();
    }

    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [enabled, tokenAddress, fetchInitialTrades, connect, disconnect]);

  return {
    trades,
    connected,
    error,
    loading,
  };
}

export default useMonadTradesWebSocket;
