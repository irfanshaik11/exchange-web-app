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
  data: PulseToken | PulseToken[]; // Can be single token or array for price updates
  channel?: string;
  protocol?: string;
}

interface UsePulseWebSocketOptions {
  enabled?: boolean; // Feature flag to enable/disable WebSocket
  url?: string;
  channel?: string; // Filter by channel: 'new', 'final-stretch', 'migrated'
  protocol?: string; // DEPRECATED: Use protocols array instead
  protocols?: string[]; // Filter by multiple protocols: ['pump.fun', 'meteora', etc.]
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onNewToken?: (token: PulseToken) => void;
  onFinalStretchToken?: (token: PulseToken) => void;
  onMigratedToken?: (token: PulseToken) => void;
  onPriceUpdate?: (updates: PulseToken[]) => void; // NEW: Real-time price updates
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
    channel,
    protocol,
    protocols,
    reconnectInterval = 2000,
    maxReconnectAttempts = 10,
    onNewToken,
    onFinalStretchToken,
    onMigratedToken,
    onPriceUpdate,
  } = options;

  // Build WebSocket URL with query parameters for filtering
  const buildWebSocketUrl = () => {
    const baseUrl = `${env.NEXT_PUBLIC_WEBSOCKET_URL.replace(/^http/, 'ws')}/v1/stream`;
    const params = new URLSearchParams();
    if (channel) params.append('channel', channel);

    // Support both single protocol (deprecated) and multiple protocols
    if (protocols && protocols.length > 0) {
      // Add multiple protocols as array: protocols[]=pump.fun&protocols[]=meteora
      protocols.forEach(p => params.append('protocols[]', p));
    } else if (protocol) {
      // Backward compatibility: single protocol
      params.append('protocol', protocol);
    }

    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  };

  const url = buildWebSocketUrl();

  const [newTokens, setNewTokens] = useState<PulseToken[]>([]);
  const [finalStretchTokens, setFinalStretchTokens] = useState<PulseToken[]>([]);
  const [migratedTokens, setMigratedTokens] = useState<PulseToken[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const mountedRef = useRef(true);

  // Store callbacks in refs so they're always current
  const onNewTokenRef = useRef(onNewToken);
  const onFinalStretchTokenRef = useRef(onFinalStretchToken);
  const onMigratedTokenRef = useRef(onMigratedToken);
  const onPriceUpdateRef = useRef(onPriceUpdate);

  // Update refs when callbacks change
  useEffect(() => {
    onNewTokenRef.current = onNewToken;
    onFinalStretchTokenRef.current = onFinalStretchToken;
    onMigratedTokenRef.current = onMigratedToken;
    onPriceUpdateRef.current = onPriceUpdate;
    console.log('[usePulseWebSocket] Callback refs updated:', {
      onNewToken: typeof onNewToken,
      onFinalStretchToken: typeof onFinalStretchToken,
      onMigratedToken: typeof onMigratedToken,
      onPriceUpdate: typeof onPriceUpdate
    });
  }, [onNewToken, onFinalStretchToken, onMigratedToken, onPriceUpdate]);

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
        console.log('[usePulseWebSocket] ✅ Connected to websocket stream');
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

              if (message.type === 'new_token' && message.data && !Array.isArray(message.data)) {
                console.log('[usePulseWebSocket] ✅ New token received:', message.data);
                const token = message.data as PulseToken;

                // Call callback immediately for instant updates
                if (onNewTokenRef.current) {
                  console.log('[usePulseWebSocket] Calling onNewToken callback');
                  onNewTokenRef.current(token);
                } else {
                  console.warn('[usePulseWebSocket] onNewToken callback not provided');
                }

                // Prepend new token to the list
                setNewTokens((prev) => {
                  // Deduplicate by mint address
                  const filtered = prev.filter(t => t.mint !== token.mint);
                  const updated = [token, ...filtered].slice(0, 50); // Keep only latest 50
                  console.log('[usePulseWebSocket] Updated newTokens, count:', updated.length);
                  return updated;
                });
              } else if (message.type === 'final_stretch_token' && message.data && !Array.isArray(message.data)) {
                console.log('[usePulseWebSocket] ✅ Final stretch token received:', message.data);
                const token = message.data as PulseToken;

                // Call callback immediately for instant updates
                if (onFinalStretchTokenRef.current) {
                  console.log('[usePulseWebSocket] Calling onFinalStretchToken callback');
                  onFinalStretchTokenRef.current(token);
                }

                // Prepend final stretch token to the list
                setFinalStretchTokens((prev) => {
                  // Deduplicate by mint address
                  const filtered = prev.filter(t => t.mint !== token.mint);
                  return [token, ...filtered].slice(0, 50); // Keep only latest 50
                });
              } else if (message.type === 'migrated_token' && message.data && !Array.isArray(message.data)) {
                console.log('[usePulseWebSocket] ✅ Migrated token received:', message.data);
                const token = message.data as PulseToken;

                // Call callback immediately for instant updates
                if (onMigratedTokenRef.current) {
                  console.log('[usePulseWebSocket] Calling onMigratedToken callback');
                  console.log('[usePulseWebSocket] Callback function:', typeof onMigratedTokenRef.current);
                  onMigratedTokenRef.current(token);
                  console.log('[usePulseWebSocket] onMigratedToken callback completed');
                } else {
                  console.warn('[usePulseWebSocket] onMigratedTokenRef.current is null or undefined');
                }

                // Prepend migrated token to the list
                setMigratedTokens((prev) => {
                  // Deduplicate by mint address
                  const filtered = prev.filter(t => t.mint !== token.mint);
                  return [token, ...filtered].slice(0, 50); // Keep only latest 50
                });
              } else if (message.type === 'price_update' && message.data) {
                console.log('[usePulseWebSocket] 📊 Price update received:', {
                  count: Array.isArray(message.data) ? message.data.length : 0,
                  channel: message.channel,
                  protocol: message.protocol
                });

                // Call callback for price updates
                if (onPriceUpdateRef.current) {
                  const updates = Array.isArray(message.data) ? message.data : [message.data];
                  console.log('[usePulseWebSocket] Calling onPriceUpdate callback with', updates.length, 'updates');
                  onPriceUpdateRef.current(updates);
                } else {
                  console.warn('[usePulseWebSocket] onPriceUpdate callback not provided');
                }
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
      // Disconnect existing connection when URL changes (channel/protocol change)
      disconnect();
      // Reset reconnect attempts
      reconnectAttemptsRef.current = 0;
      // Connect with new parameters
      connect();
    }

    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [enabled, url, connect, disconnect]); // Added 'url' to reconnect when channel/protocol changes

  return {
    newTokens,
    finalStretchTokens,
    migratedTokens,
    connected,
    error,
    clearTokens,
  };
}
