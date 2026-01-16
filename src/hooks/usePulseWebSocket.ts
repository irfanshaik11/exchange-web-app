import { useEffect, useState, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
// flushSync is used to bypass React 18's automatic batching for instant UI updates
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
  // Price update fields
  bonding_pct?: number;
  graduation_percent?: number;
  liquidity_usd?: number;
  bonding_curve_progress?: number;
  trade_type?: string;
  sol_amount?: number;
  token_amount?: number;
  launchpad_protocol?: string;
  pair_address?: string;
  image?: string;
  // Volume fields (in SOL)
  total_buy_volume_5m?: string | number;
  total_sell_volume_5m?: string | number;
  total_buy_volume_1h?: string | number;
  total_sell_volume_1h?: string | number;
  total_buy_volume_6h?: string | number;
  total_sell_volume_6h?: string | number;
  total_buy_volume_24h?: string | number;
  total_sell_volume_24h?: string | number;
  // Holder percentage fields (decimal 0-1)
  insider_percent?: number;
  sniper_percent?: number;
  dev_percent?: number;
  // Dev token tracking
  dev_tokens_created?: number;
  dev_tokens_migrated?: number;
  // Additional fields
  kol_count?: number;
  holder_count?: number;
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
                // Transform backend response: map 'address' to 'mint' for frontend compatibility
                const rawToken = message.data as any;
                const token: PulseToken = {
                  ...rawToken,
                  mint: rawToken.address || rawToken.mint,  // Backend uses 'address', frontend expects 'mint'
                };

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
                // Transform backend response: map 'address' to 'mint' for frontend compatibility
                const rawToken = message.data as any;
                const token: PulseToken = {
                  ...rawToken,
                  mint: rawToken.address || rawToken.mint,  // Backend uses 'address', frontend expects 'mint'
                };

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
                // Transform backend response: map 'address' to 'mint' for frontend compatibility
                const rawToken = message.data as any;
                const token: PulseToken = {
                  ...rawToken,
                  mint: rawToken.address || rawToken.mint,  // Backend uses 'address', frontend expects 'mint'
                };

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
                const rawUpdates = Array.isArray(message.data) ? message.data : [message.data];
                // Transform backend response: map 'address' to 'mint' for frontend compatibility
                const updates = rawUpdates.map((u: any) => ({
                  ...u,
                  mint: u.address || u.mint,  // Backend uses 'address', frontend expects 'mint'
                }));

                // PERFORMANCE FIX: Only update the relevant channel's array
                // Don't use flushSync for price updates - let React batch them naturally
                // (flushSync is only needed for new token events where instant visibility matters)
                const updatesMap = new Map(updates.map((u: PulseToken) => [u.mint, u]));

                // Helper to merge price updates into token array (returns same ref if no changes)
                const applyUpdates = (tokens: PulseToken[]): PulseToken[] => {
                  if (tokens.length === 0) return tokens;
                  let hasChanges = false;
                  const updated = tokens.map((token) => {
                    const update = updatesMap.get(token.mint);
                    if (!update) return token;
                    hasChanges = true;
                    return {
                      ...token,
                      // Only update if values are valid (> 0 for market_cap, >= 0 for others)
                      ...(update.price_usd !== undefined && { price_usd: update.price_usd }),
                      ...(update.market_cap_usd !== undefined && update.market_cap_usd > 0 && { market_cap_usd: update.market_cap_usd }),
                      ...(update.volume_24h !== undefined && { volume_24h: update.volume_24h }),
                      ...(update.bonding_pct !== undefined && update.bonding_pct >= 0 && { bonding_pct: update.bonding_pct }),
                      ...(update.graduation_percent !== undefined && update.graduation_percent >= 0 && { graduation_percent: update.graduation_percent }),
                      ...(update.liquidity_usd !== undefined && update.liquidity_usd >= 0 && { liquidity_usd: update.liquidity_usd }),
                      ...(update.price_change_24h !== undefined && { price_change_24h: update.price_change_24h }),
                      ...(update.updated_at && { updated_at: update.updated_at }),
                    };
                  });
                  return hasChanges ? updated : tokens;
                };

                // Only update the array for the channel we're connected to (not all 3!)
                // This dramatically reduces re-renders
                if (channel === 'new') {
                  setNewTokens(applyUpdates);
                } else if (channel === 'final_stretch') {
                  setFinalStretchTokens(applyUpdates);
                } else if (channel === 'migrated') {
                  setMigratedTokens(applyUpdates);
                }

                // Call the external callback for additional handling
                onPriceUpdateRef.current?.(updates);
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
  }, [enabled, url, channel, reconnectInterval, maxReconnectAttempts]);

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
