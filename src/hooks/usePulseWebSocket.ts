import { useEffect, useState, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
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

  // Extract custom url from options
  const { url: customUrl } = options;

  // Build WebSocket URL with query parameters for filtering
  const buildWebSocketUrl = () => {
    // Use custom URL if provided, otherwise fall back to default
    const baseUrl = customUrl || `${env.NEXT_PUBLIC_WEBSOCKET_URL.replace(/^http/, 'ws')}/v1/stream`;
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
    // If custom URL already includes query params, append with &, otherwise with ?
    if (customUrl && queryString) {
      return customUrl.includes('?') ? `${baseUrl}&${queryString}` : `${baseUrl}?${queryString}`;
    }
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
          // Backend may batch multiple JSON messages separated by newlines
          const messages = event.data.split('\n').filter((msg: string) => msg.trim());

          for (const msgStr of messages) {
            try {
              const message: WebSocketMessage = JSON.parse(msgStr);

              if (message.type === 'new_token' && message.data && !Array.isArray(message.data)) {
                const token = message.data as PulseToken;

                // Use flushSync to combine callback + state update in one synchronous render
                // This ensures tokens appear instantly without any delay
                flushSync(() => {
                  // Call callback immediately for instant updates
                  onNewTokenRef.current?.(token);
                  
                  // Update state immediately with O(1) Map-based deduplication
                  setNewTokens((prev) => {
                    const map = new Map<string, PulseToken>();
                    map.set(token.mint, token); // New token first
                    // Add existing tokens, skipping duplicates
                    for (const t of prev) {
                      if (t.mint !== token.mint && map.size < 50) {
                        map.set(t.mint, t);
                      }
                    }
                    return Array.from(map.values()); // Keep only latest 50
                  });
                });
              } else if (message.type === 'final_stretch_token' && message.data && !Array.isArray(message.data)) {
                const token = message.data as PulseToken;

                flushSync(() => {
                  onFinalStretchTokenRef.current?.(token);
                  
                  setFinalStretchTokens((prev) => {
                    const map = new Map<string, PulseToken>();
                    map.set(token.mint, token);
                    for (const t of prev) {
                      if (t.mint !== token.mint && map.size < 50) {
                        map.set(t.mint, t);
                      }
                    }
                    return Array.from(map.values());
                  });
                });
              } else if (message.type === 'migrated_token' && message.data && !Array.isArray(message.data)) {
                const token = message.data as PulseToken;

                flushSync(() => {
                  onMigratedTokenRef.current?.(token);
                  
                  setMigratedTokens((prev) => {
                    const map = new Map<string, PulseToken>();
                    map.set(token.mint, token);
                    for (const t of prev) {
                      if (t.mint !== token.mint && map.size < 50) {
                        map.set(t.mint, t);
                      }
                    }
                    return Array.from(map.values());
                  });
                });
              } else if (message.type === 'price_update' && message.data) {
                // Price updates can be batched, so don't use flushSync (less critical)
                if (onPriceUpdateRef.current) {
                  const updates = Array.isArray(message.data) ? message.data : [message.data];
                  onPriceUpdateRef.current(updates);
                }
              }
            } catch (parseErr) {
              // Silently skip parse errors to avoid blocking other messages
            }
          }
        } catch (err) {
          // Silently handle errors to avoid blocking future messages
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
