import { useEffect, useState, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import { env } from '~/env';
import {
  savePulseCache,
  loadPulseCache,
  isSharedWorkerAvailable,
  isIndexedDBAvailable,
  type PulseToken,
} from '~/utils/pulseCache';

/**
 * Persistent WebSocket hook for Pulse token updates
 *
 * This hook provides WebSocket persistence across tab switches and page refreshes by:
 * 1. Using a SharedWorker to maintain ONE WebSocket connection across all tabs
 * 2. Caching token data in IndexedDB for instant display on page load
 * 3. Falling back to regular WebSocket if SharedWorker is unavailable
 */

interface UsePulseWebSocketPersistentOptions {
  enabled?: boolean;
  url?: string;
  channel?: string;
  protocol?: string;
  protocols?: string[];
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onNewToken?: (token: PulseToken) => void;
  onFinalStretchToken?: (token: PulseToken) => void;
  onMigratedToken?: (token: PulseToken) => void;
  onPriceUpdate?: (updates: PulseToken[]) => void;
}

interface UsePulseWebSocketPersistentReturn {
  newTokens: PulseToken[];
  finalStretchTokens: PulseToken[];
  migratedTokens: PulseToken[];
  connected: boolean;
  error: string | null;
  clearTokens: () => void;
  isUsingSharedWorker: boolean;
}

export function usePulseWebSocketPersistent(
  options: UsePulseWebSocketPersistentOptions = {}
): UsePulseWebSocketPersistentReturn {
  const {
    enabled = true,
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

  const { url: customUrl } = options;

  // Build WebSocket URL with query parameters
  const buildWebSocketUrl = useCallback(() => {
    const baseUrl = customUrl || `${env.NEXT_PUBLIC_WEBSOCKET_URL.replace(/^http/, 'ws')}/v1/stream`;
    const params = new URLSearchParams();
    if (channel) params.append('channel', channel);

    if (protocols && protocols.length > 0) {
      protocols.forEach(p => params.append('protocols[]', p));
    } else if (protocol) {
      params.append('protocol', protocol);
    }

    const queryString = params.toString();
    if (customUrl && queryString) {
      return customUrl.includes('?') ? `${baseUrl}&${queryString}` : `${baseUrl}?${queryString}`;
    }
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }, [customUrl, channel, protocol, protocols]);

  const url = buildWebSocketUrl();

  const [newTokens, setNewTokens] = useState<PulseToken[]>([]);
  const [finalStretchTokens, setFinalStretchTokens] = useState<PulseToken[]>([]);
  const [migratedTokens, setMigratedTokens] = useState<PulseToken[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUsingSharedWorker, setIsUsingSharedWorker] = useState(false);

  const workerRef = useRef<SharedWorker | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const mountedRef = useRef(true);
  const cacheLoadedRef = useRef(false);

  // Store callbacks in refs
  const onNewTokenRef = useRef(onNewToken);
  const onFinalStretchTokenRef = useRef(onFinalStretchToken);
  const onMigratedTokenRef = useRef(onMigratedToken);
  const onPriceUpdateRef = useRef(onPriceUpdate);

  useEffect(() => {
    onNewTokenRef.current = onNewToken;
    onFinalStretchTokenRef.current = onFinalStretchToken;
    onMigratedTokenRef.current = onMigratedToken;
    onPriceUpdateRef.current = onPriceUpdate;
  }, [onNewToken, onFinalStretchToken, onMigratedToken, onPriceUpdate]);

  const clearTokens = useCallback(() => {
    setNewTokens([]);
    setFinalStretchTokens([]);
    setMigratedTokens([]);

    // Clear worker cache too
    if (workerRef.current) {
      workerRef.current.port.postMessage({ type: 'CLEAR_CACHE' });
    }
  }, []);

  // Save to IndexedDB when tokens change (debounced)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!isIndexedDBAvailable()) return;
    if (newTokens.length === 0 && finalStretchTokens.length === 0 && migratedTokens.length === 0) return;

    // Debounce saves to avoid excessive writes
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      savePulseCache({
        newTokens,
        finalStretchTokens,
        migratedTokens,
        timestamp: Date.now(),
      }).catch(err => console.warn('[usePulseWebSocketPersistent] Failed to save cache:', err));
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [newTokens, finalStretchTokens, migratedTokens]);

  // Load from IndexedDB on mount
  useEffect(() => {
    if (cacheLoadedRef.current || !isIndexedDBAvailable()) return;

    loadPulseCache().then(cached => {
      if (!mountedRef.current) return;
      if (!cached) return;

      cacheLoadedRef.current = true;
      console.log('[usePulseWebSocketPersistent] Loaded from IndexedDB cache:', {
        newTokens: cached.newTokens.length,
        finalStretchTokens: cached.finalStretchTokens.length,
        migratedTokens: cached.migratedTokens.length,
        age: Date.now() - cached.timestamp + 'ms'
      });

      // Only set state if we don't have data yet
      setNewTokens(prev => prev.length > 0 ? prev : cached.newTokens);
      setFinalStretchTokens(prev => prev.length > 0 ? prev : cached.finalStretchTokens);
      setMigratedTokens(prev => prev.length > 0 ? prev : cached.migratedTokens);
    }).catch(err => {
      console.warn('[usePulseWebSocketPersistent] Failed to load cache:', err);
    });
  }, []);

  // Regular WebSocket connection (fallback or primary if SharedWorker unavailable)
  const connectWebSocket = useCallback(() => {
    if (!enabled) {
      console.log('[usePulseWebSocketPersistent] WebSocket disabled via feature flag');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.log('[usePulseWebSocketPersistent] Max reconnect attempts reached');
      setError('Max reconnection attempts reached');
      return;
    }

    try {
      console.log('[usePulseWebSocketPersistent] Connecting to:', url);
      const ws = new WebSocket(url);

      ws.onopen = () => {
        if (!mountedRef.current) return;
        console.log('[usePulseWebSocketPersistent] ✅ Connected');
        setConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;

        try {
          const messages = event.data.split('\n').filter((msg: string) => msg.trim());

          for (const msgStr of messages) {
            try {
              const message = JSON.parse(msgStr);

              if (message.type === 'new_token' && message.data && !Array.isArray(message.data)) {
                const rawToken = message.data;
                const token: PulseToken = {
                  ...rawToken,
                  mint: rawToken.address || rawToken.mint,
                };

                flushSync(() => {
                  onNewTokenRef.current?.(token);
                  setNewTokens(prev => {
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
              } else if (message.type === 'final_stretch_token' && message.data && !Array.isArray(message.data)) {
                const rawToken = message.data;
                const token: PulseToken = {
                  ...rawToken,
                  mint: rawToken.address || rawToken.mint,
                };

                flushSync(() => {
                  onFinalStretchTokenRef.current?.(token);
                  setFinalStretchTokens(prev => {
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
                const rawToken = message.data;
                const token: PulseToken = {
                  ...rawToken,
                  mint: rawToken.address || rawToken.mint,
                };

                flushSync(() => {
                  onMigratedTokenRef.current?.(token);
                  setMigratedTokens(prev => {
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
                const updates = rawUpdates.map((u: any) => ({
                  ...u,
                  mint: u.address || u.mint,
                }));

                const updatesMap = new Map<string, PulseToken>(updates.map((u: PulseToken) => [u.mint, u]));

                const applyUpdates = (tokens: PulseToken[]): PulseToken[] => {
                  if (tokens.length === 0) return tokens;
                  let hasChanges = false;
                  const updated = tokens.map(token => {
                    const update = updatesMap.get(token.mint);
                    if (!update) return token;
                    hasChanges = true;
                    return {
                      ...token,
                      ...(update.price_usd !== undefined && { price_usd: update.price_usd }),
                      ...(update.market_cap_usd !== undefined && update.market_cap_usd > 0 && { market_cap_usd: update.market_cap_usd }),
                      ...(update.volume_24h !== undefined && { volume_24h: update.volume_24h }),
                      ...(update.bonding_pct !== undefined && { bonding_pct: update.bonding_pct }),
                      ...(update.graduation_percent !== undefined && { graduation_percent: update.graduation_percent }),
                      ...(update.liquidity_usd !== undefined && { liquidity_usd: update.liquidity_usd }),
                    };
                  });
                  return hasChanges ? updated : tokens;
                };

                // Only update the array for the channel we're connected to
                if (channel === 'new') {
                  setNewTokens(applyUpdates);
                } else if (channel === 'final_stretch') {
                  setFinalStretchTokens(applyUpdates);
                } else if (channel === 'migrated') {
                  setMigratedTokens(applyUpdates);
                }

                onPriceUpdateRef.current?.(updates);
              }
            } catch {
              // Skip parse errors
            }
          }
        } catch {
          // Handle errors silently
        }
      };

      ws.onerror = (event) => {
        if (!mountedRef.current) return;
        console.error('[usePulseWebSocketPersistent] WebSocket error:', event);
        setError('WebSocket connection error');
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        console.log('[usePulseWebSocketPersistent] Disconnected');
        setConnected(false);

        if (enabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          console.log(
            `[usePulseWebSocketPersistent] Reconnecting in ${reconnectInterval}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              connectWebSocket();
            }
          }, reconnectInterval);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[usePulseWebSocketPersistent] Failed to create WebSocket:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect');
    }
  }, [enabled, url, channel, reconnectInterval, maxReconnectAttempts]);

  const disconnectWebSocket = useCallback(() => {
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

  // Main connection effect
  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      return;
    }

    // For now, use regular WebSocket directly (SharedWorker has issues)
    // TODO: Fix SharedWorker implementation for cross-tab persistence
    setIsUsingSharedWorker(false);
    disconnectWebSocket();
    reconnectAttemptsRef.current = 0;
    connectWebSocket();

    return () => {
      mountedRef.current = false;
      disconnectWebSocket();
    };
  }, [enabled, url, connectWebSocket, disconnectWebSocket]);

  return {
    newTokens,
    finalStretchTokens,
    migratedTokens,
    connected,
    error,
    clearTokens,
    isUsingSharedWorker,
  };
}
