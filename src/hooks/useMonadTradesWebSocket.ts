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
  addressAliases?: string[]; // Additional identifiers that should match incoming trades
  fallbackPollIntervals?: number[]; // Additional REST fetch attempts (ms) after mount to bridge WS lag
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
    addressAliases = [],
    fallbackPollIntervals = [500, 1500, 3000, 7000],
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
  const pollTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const tradesRef = useRef<MonadTrade[]>([]);
  
  // Store config in refs to avoid re-creating connect/disconnect
  const configRef = useRef({
    tokenAddress,
    enabled,
    maxTrades,
    reconnectInterval,
    maxReconnectAttempts,
    addressAliases,
  });
  
  // Update config ref when options change
  useEffect(() => {
    configRef.current = {
      tokenAddress,
      enabled,
      maxTrades,
      reconnectInterval,
      maxReconnectAttempts,
      addressAliases,
    };
  }, [tokenAddress, enabled, maxTrades, reconnectInterval, maxReconnectAttempts, addressAliases]);

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
        const fetched = data.data as MonadTrade[];
        // Merge with existing trades to avoid overwriting WebSocket updates
        setTrades((prev) => {
          tradesRef.current = prev;
          if (!prev || prev.length === 0) {
            const next = fetched.slice(0, maxTrades);
            tradesRef.current = next;
            return next;
          }
          const existingHashes = new Set(prev.map((t) => t.tx_hash));
          const combined = [...prev];
          for (const t of fetched) {
            if (!existingHashes.has(t.tx_hash)) {
              combined.push(t);
            }
          }
          // Keep most recent first based on block_timestamp if available, else insertion order
          combined.sort((a, b) => (b.block_timestamp || 0) - (a.block_timestamp || 0));
          const next = combined.slice(0, maxTrades);
          tradesRef.current = next;
          return next;
        });
      }
    } catch (err) {
      console.error('[useMonadTradesWebSocket] Failed to fetch initial trades:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch trades');
    } finally {
      setLoading(false);
    }
  }, [tokenAddress, maxTrades]);

  // Schedule a handful of REST refetches to bridge WS delivery delays
  const scheduleFallbackFetches = useCallback(() => {
    pollTimeoutsRef.current.forEach((t) => clearTimeout(t));
    pollTimeoutsRef.current = [];

    for (const delay of fallbackPollIntervals) {
      const timeoutId = setTimeout(() => {
        if (!mountedRef.current) return;
        if (tradesRef.current.length === 0) {
          fetchInitialTrades();
        }
      }, delay);
      pollTimeoutsRef.current.push(timeoutId);
    }
  }, [fallbackPollIntervals, fetchInitialTrades]);

  // Connect to WebSocket - uses refs to avoid dependency changes causing reconnects
  const connect = useCallback(() => {
    const { enabled, maxReconnectAttempts, tokenAddress: ta, addressAliases: aa, maxTrades: mt, reconnectInterval: ri } = configRef.current;
    
    if (!enabled) {
      return;
    }

    // Check if already connected or connecting
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      setError('Max reconnection attempts reached');
      return;
    }

    try {
      const baseUrl = env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL!;
      const wsUrl = `${baseUrl.replace(/^http/, 'ws')}/v1/stream`;

      console.log('[useMonadTradesWebSocket] 🔌 Connecting to:', wsUrl);
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!mountedRef.current) return;
        console.log('[useMonadTradesWebSocket] ✅ Connected');
        setConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        const { tokenAddress: currentToken, addressAliases: currentAliases, maxTrades: currentMax } = configRef.current;

        try {
          // Handle batched messages (separated by newlines)
          const messages = event.data.split('\n').filter((msg: string) => msg.trim());

          for (const msgStr of messages) {
            try {
              const message: WebSocketMessage = JSON.parse(msgStr);

              if (message.type === 'new_trade' && message.data) {
                const trade: MonadTrade = JSON.parse(message.data);

                // Filter by token address or aliases if specified
                const allowed = new Set(
                  [currentToken, ...currentAliases]
                    .filter(Boolean)
                    .map((a) => (a as string).toLowerCase())
                );
                if (allowed.size > 0 && !allowed.has(trade.token_address.toLowerCase())) {
                  continue;
                }

                // Call callback
                onNewTradeRef.current?.(trade);

                // Update trades list with deduplication
                setTrades((prev) => {
                  tradesRef.current = prev;
                  const exists = prev.some((t) => t.tx_hash === trade.tx_hash);
                  if (exists) return prev;

                  const newTrades = [trade, ...prev];
                  const next = newTrades.slice(0, currentMax);
                  tradesRef.current = next;
                  return next;
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

      ws.onerror = (event) => {
        if (!mountedRef.current) return;
        console.error('[useMonadTradesWebSocket] ❌ Error:', event);
        setError('WebSocket connection error');
      };

      ws.onclose = (event) => {
        if (!mountedRef.current) return;
        console.log('[useMonadTradesWebSocket] 🔌 Closed:', event.code, event.reason);
        setConnected(false);
        wsRef.current = null;

        // Attempt to reconnect
        const { enabled: stillEnabled, maxReconnectAttempts: maxAttempts, reconnectInterval: interval } = configRef.current;
        if (stillEnabled && reconnectAttemptsRef.current < maxAttempts) {
          reconnectAttemptsRef.current += 1;
          console.log(`[useMonadTradesWebSocket] Reconnecting in ${interval}ms (attempt ${reconnectAttemptsRef.current}/${maxAttempts})`);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              connect();
            }
          }, interval);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[useMonadTradesWebSocket] Failed to create WebSocket:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect');
    }
  }, []); // Empty deps - uses refs for all config

  // Fetch initial trades and connect to WebSocket on mount
  useEffect(() => {
    mountedRef.current = true;

    if (tokenAddress) {
      fetchInitialTrades();
      scheduleFallbackFetches();
    }

    if (enabled) {
      // Close existing connection before creating new one
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      reconnectAttemptsRef.current = 0;
      connect();
    }

    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      pollTimeoutsRef.current.forEach((t) => clearTimeout(t));
      pollTimeoutsRef.current = [];
    };
  }, [enabled, tokenAddress]); // Only reconnect when enabled or tokenAddress changes

  return {
    trades,
    connected,
    error,
    loading,
  };
}

export default useMonadTradesWebSocket;
