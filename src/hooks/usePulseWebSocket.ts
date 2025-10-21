import { useEffect, useState, useCallback, useRef } from 'react';
import { env } from '~/env';

interface PulseToken {
  mint: string;
  name: string;
  symbol: string;
  status: string;
  price_usd?: number;
  market_cap_usd?: number;
  volume_24h?: number;
  price_change_24h?: number;
  updated_at?: string;
}

interface WebSocketMessage {
  type: string;
  data: PulseToken;
}

interface UsePulseWebSocketOptions {
  enabled?: boolean; // Feature flag to enable/disable WebSocket
  url?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onNewToken?: (token: PulseToken) => void;
  onFinalStretchToken?: (token: PulseToken) => void;
  onMigratedToken?: (token: PulseToken) => void;
}

interface UsePulseWebSocketReturn {
  newTokens: PulseToken[];
  finalStretchTokens: PulseToken[];
  migratedTokens: PulseToken[];
  connected: boolean;
  error: string | null;
  clearTokens: () => void;
}

/**
 * WebSocket hook for real-time pulse token updates
 * FEATURE FLAG: Set enabled=false to revert to HTTP polling
 */
export function usePulseWebSocket(
  options: UsePulseWebSocketOptions = {}
): UsePulseWebSocketReturn {
  const {
    enabled = true, // Default enabled, set to false to disable
    url = `${env.NEXT_PUBLIC_WEBSOCKET_URL.replace(/^http/, 'ws')}/v1/stream`,
    reconnectInterval = 2000,
    maxReconnectAttempts = 10,
    onNewToken,
    onFinalStretchToken,
    onMigratedToken,
  } = options;

  const [newTokens, setNewTokens] = useState<PulseToken[]>([]);
  const [finalStretchTokens, setFinalStretchTokens] = useState<PulseToken[]>([]);
  const [migratedTokens, setMigratedTokens] = useState<PulseToken[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const mountedRef = useRef(true);

  const clearTokens = useCallback(() => {
    setNewTokens([]);
    setFinalStretchTokens([]);
    setMigratedTokens([]);
  }, []);

  const connect = useCallback(() => {
    // Don't connect if feature is disabled
    if (!enabled) {
      console.log('[usePulseWebSocket] WebSocket disabled via feature flag');
      return;
    }

    // Don't connect if already connected or if we've exceeded max attempts
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.log('[usePulseWebSocket] Max reconnect attempts reached');
      setError('Max reconnection attempts reached');
      return;
    }

    try {
      console.log('[usePulseWebSocket] Connecting to:', url);
      const ws = new WebSocket(url);

      ws.onopen = () => {
        if (!mountedRef.current) return;
        console.log('[usePulseWebSocket] Connected');
        setConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;

        // No subscription needed - hub broadcasts to all connected clients automatically
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;

        try {
          // DEBUG: Log all incoming messages
          console.log('[usePulseWebSocket] Raw message received:', event.data);

          // Backend may batch multiple JSON messages separated by newlines
          const messages = event.data.split('\n').filter((msg: string) => msg.trim());
          console.log(`[usePulseWebSocket] Parsed ${messages.length} message(s) from batch`);

          for (const msgStr of messages) {
            try {
              const message: WebSocketMessage = JSON.parse(msgStr);
              console.log('[usePulseWebSocket] Parsed message:', { type: message.type, data: message.data });

              if (message.type === 'new_token' && message.data) {
                console.log('[usePulseWebSocket] ✅ New token received:', message.data);

                // Call callback immediately for instant updates
                if (onNewToken) {
                  console.log('[usePulseWebSocket] Calling onNewToken callback');
                  onNewToken(message.data);
                } else {
                  console.warn('[usePulseWebSocket] onNewToken callback not provided');
                }

                // Prepend new token to the list
                setNewTokens((prev) => {
                  // Deduplicate by mint address
                  const filtered = prev.filter(t => t.mint !== message.data.mint);
                  const updated = [message.data, ...filtered].slice(0, 50); // Keep only latest 50
                  console.log('[usePulseWebSocket] Updated newTokens, count:', updated.length);
                  return updated;
                });
              } else if (message.type === 'final_stretch_token' && message.data) {
                console.log('[usePulseWebSocket] ✅ Final stretch token received:', message.data);

                // Call callback immediately for instant updates
                if (onFinalStretchToken) {
                  console.log('[usePulseWebSocket] Calling onFinalStretchToken callback');
                  onFinalStretchToken(message.data);
                }

                // Prepend final stretch token to the list
                setFinalStretchTokens((prev) => {
                  // Deduplicate by mint address
                  const filtered = prev.filter(t => t.mint !== message.data.mint);
                  return [message.data, ...filtered].slice(0, 50); // Keep only latest 50
                });
              } else if (message.type === 'migrated_token' && message.data) {
                console.log('[usePulseWebSocket] ✅ Migrated token received:', message.data);

                // Call callback immediately for instant updates
                if (onMigratedToken) {
                  console.log('[usePulseWebSocket] Calling onMigratedToken callback');
                  onMigratedToken(message.data);
                }

                // Prepend migrated token to the list
                setMigratedTokens((prev) => {
                  // Deduplicate by mint address
                  const filtered = prev.filter(t => t.mint !== message.data.mint);
                  return [message.data, ...filtered].slice(0, 50); // Keep only latest 50
                });
              } else {
                console.warn('[usePulseWebSocket] Unknown message type or missing data:', { type: message.type, hasData: !!message.data });
              }
            } catch (parseErr) {
              console.error('[usePulseWebSocket] Failed to parse individual message:', msgStr, parseErr);
            }
          }
        } catch (err) {
          console.error('[usePulseWebSocket] Failed to process message:', err);
          console.error('[usePulseWebSocket] Raw data was:', event.data);
        }
      };

      ws.onerror = (event) => {
        if (!mountedRef.current) return;
        console.error('[usePulseWebSocket] WebSocket error:', event);
        setError('WebSocket connection error');
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        console.log('[usePulseWebSocket] Disconnected');
        setConnected(false);

        // Attempt to reconnect
        if (enabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1;
          console.log(
            `[usePulseWebSocket] Reconnecting in ${reconnectInterval}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              connect();
            }
          }, reconnectInterval);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[usePulseWebSocket] Failed to create WebSocket:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect');
    }
  }, [enabled, url, reconnectInterval, maxReconnectAttempts]);

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

  useEffect(() => {
    mountedRef.current = true;

    if (enabled) {
      connect();
    }

    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return {
    newTokens,
    finalStretchTokens,
    migratedTokens,
    connected,
    error,
    clearTokens,
  };
}
