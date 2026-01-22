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
import { extractTokenImage } from '~/utils/images';
import { applyPriceUpdate, type PriceUpdate } from '~/utils/applyPriceUpdate';

/**
 * Persistent WebSocket hook for Pulse token updates
 *
 * This hook provides WebSocket persistence across tab switches and page refreshes by:
 * 1. Using a SharedWorker to maintain ONE WebSocket connection across all tabs
 * 2. Caching token data in IndexedDB for instant display on page load
 * 3. Falling back to regular WebSocket if SharedWorker is unavailable
 */

export interface TokenInfoUpdate {
  mint_address: string;
  holder_count: number;
  kol_count: number;
}

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
  onTokenInfoUpdate?: (update: TokenInfoUpdate) => void;
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
    onTokenInfoUpdate,
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
  const onTokenInfoUpdateRef = useRef(onTokenInfoUpdate);

  useEffect(() => {
    onNewTokenRef.current = onNewToken;
    onFinalStretchTokenRef.current = onFinalStretchToken;
    onMigratedTokenRef.current = onMigratedToken;
    onPriceUpdateRef.current = onPriceUpdate;
    onTokenInfoUpdateRef.current = onTokenInfoUpdate;
  }, [onNewToken, onFinalStretchToken, onMigratedToken, onPriceUpdate, onTokenInfoUpdate]);

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

  // Helper to normalize WebSocket tokens with default values for filter-relevant fields
  // This ensures filtering works correctly even when WebSocket data is incomplete
  // IMPORTANT: We normalize BOTH field name variants (e.g., dev_percent AND dev_held_percentage)
  // because filters use fallback chains and different APIs may use different field names
  const normalizeToken = useCallback((rawToken: any): PulseToken => {
    // Pre-compute common fallback values to ensure both field name variants are populated
    const holderValue = rawToken.holder_count ?? rawToken.holders ?? rawToken.unique_wallets_24h ?? 0;
    const devPercentValue = rawToken.dev_percent ?? rawToken.dev_held_percentage ?? 0;
    const sniperPercentValue = rawToken.sniper_percent ?? rawToken.sniper_held_percentage ?? 0;
    const insiderPercentValue = rawToken.insider_percent ?? rawToken.insider_held_percentage ?? 0;
    const bundlePercentValue = rawToken.bundle_percent ?? rawToken.bundled_percentage ?? 0;

    return {
      ...rawToken,
      mint: rawToken.address || rawToken.mint,
      mint_address: rawToken.mint_address || rawToken.address || rawToken.mint,
      // Extract image from various possible field names
      image: extractTokenImage(rawToken) || rawToken.image,

      // === Holder count (multiple field name variants) ===
      holder_count: holderValue,
      holders: holderValue,
      unique_wallets_24h: rawToken.unique_wallets_24h ?? holderValue,

      // === KOL count ===
      kol_count: rawToken.kol_count ?? 0,

      // === Transaction counts (all timeframes) ===
      total_buys_24h: rawToken.total_buys_24h ?? 0,
      total_sells_24h: rawToken.total_sells_24h ?? 0,
      total_buys_5m: rawToken.total_buys_5m ?? 0,
      total_sells_5m: rawToken.total_sells_5m ?? 0,
      total_buys_1h: rawToken.total_buys_1h ?? 0,
      total_sells_1h: rawToken.total_sells_1h ?? 0,
      total_buys_6h: rawToken.total_buys_6h ?? 0,
      total_sells_6h: rawToken.total_sells_6h ?? 0,

      // === Volume (all timeframes) ===
      total_buy_volume_24h: rawToken.total_buy_volume_24h ?? 0,
      total_sell_volume_24h: rawToken.total_sell_volume_24h ?? 0,
      total_buy_volume_5m: rawToken.total_buy_volume_5m ?? 0,
      total_sell_volume_5m: rawToken.total_sell_volume_5m ?? 0,
      total_buy_volume_1h: rawToken.total_buy_volume_1h ?? 0,
      total_sell_volume_1h: rawToken.total_sell_volume_1h ?? 0,
      total_buy_volume_6h: rawToken.total_buy_volume_6h ?? 0,
      total_sell_volume_6h: rawToken.total_sell_volume_6h ?? 0,

      // === Dev holding percentage (both field name variants) ===
      dev_percent: devPercentValue,
      dev_held_percentage: devPercentValue,

      // === Sniper percentage (both field name variants) ===
      sniper_percent: sniperPercentValue,
      sniper_held_percentage: sniperPercentValue,

      // === Insider percentage (both field name variants) ===
      insider_percent: insiderPercentValue,
      insider_held_percentage: insiderPercentValue,

      // === Bundle percentage (all field name variants for BottomCardInfoHolder compatibility) ===
      bundle_percent: bundlePercentValue,
      bundled_percentage: bundlePercentValue,
      bundler_held_percentage: bundlePercentValue,  // For BottomCardInfoHolder
      bundle_wallet_count: rawToken.bundle_wallet_count ?? 0,
      bundler_count: rawToken.bundle_wallet_count ?? rawToken.bundler_count ?? 0,  // For BottomCardInfoHolder

      // === Top holders percentage ===
      top10_holders_pct: rawToken.top10_holders_pct ?? rawToken.top_10_holders_percent ?? 0,

      // === Dev activity stats ===
      dev_tokens_created: rawToken.dev_tokens_created ?? 0,
      dev_tokens_migrated: rawToken.dev_tokens_migrated ?? 0,

      // === Bonding curve ===
      bonding_pct: rawToken.bonding_pct ?? rawToken.bonding_percent ?? 0,

      // === Market metrics ===
      market_cap_usd: rawToken.market_cap_usd ?? rawToken.fully_diluted_value ?? rawToken.fdv ?? 0,
      liquidity_usd: rawToken.liquidity_usd ?? rawToken.total_liquidity_usd ?? 0,
      volume_24h: rawToken.volume_24h ?? 0,

      // === Pro traders ===
      pro_traders_count: rawToken.pro_traders_count ?? rawToken.pro_traders ?? 0,
    };
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
                const token = normalizeToken(message.data);

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
                const token = normalizeToken(message.data);

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
                const token = normalizeToken(message.data);

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
                })) as PriceUpdate[];

                const updatesMap = new Map<string, PriceUpdate>(updates.map((u) => [u.mint!, u]));

                // Use shared utility for COMPLETE field mapping (all 37+ fields)
                // This ensures gas price, buy/sell bars, holder %, etc. all update correctly
                const applyUpdates = (tokens: PulseToken[]): PulseToken[] => {
                  if (tokens.length === 0) return tokens;
                  let hasChanges = false;
                  const updated = tokens.map(token => {
                    const update = updatesMap.get(token.mint);
                    if (!update) return token;
                    hasChanges = true;
                    // Use the shared applyPriceUpdate utility for complete field mapping
                    return applyPriceUpdate(token, update) as PulseToken;
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

                onPriceUpdateRef.current?.(updates as PulseToken[]);
              } else if (message.type === 'token_info_update' && message.data) {
                // Handle KOL count and holder count updates
                const data = message.data;
                const mintAddress = data.mint_address || data.mint || data.address;

                console.log(`[usePulseWebSocketPersistent] 📊 token_info_update received:`, {
                  mintAddress,
                  holder_count: data.holder_count,
                  kol_count: data.kol_count,
                  raw: data,
                });

                if (!mintAddress) {
                  console.warn(`[usePulseWebSocketPersistent] ⚠️ No mint address in token_info_update`);
                  return;
                }

                const applyTokenInfoUpdate = (tokens: PulseToken[], arrayName: string): PulseToken[] => {
                  if (tokens.length === 0) {
                    console.log(`[usePulseWebSocketPersistent] ${arrayName} is empty, skipping`);
                    return tokens;
                  }

                  // Debug: log all mints in the array to see if there's a match
                  const tokenMints = tokens.map(t => t.mint);
                  const foundIndex = tokenMints.indexOf(mintAddress);
                  console.log(`[usePulseWebSocketPersistent] Searching ${arrayName} (${tokens.length} tokens), found at index: ${foundIndex}`);

                  if (foundIndex === -1) {
                    // Log first few mints to help debug
                    console.log(`[usePulseWebSocketPersistent] First 3 mints in ${arrayName}:`, tokenMints.slice(0, 3));
                    return tokens;
                  }

                  const updated = tokens.map(token => {
                    if (token.mint !== mintAddress) return token;
                    console.log(`[usePulseWebSocketPersistent] ✅ Updating ${token.symbol} (${token.mint.slice(0, 8)}...) - holders: ${token.holder_count} → ${data.holder_count}, kols: ${token.kol_count} → ${data.kol_count}`);
                    return {
                      ...token,
                      holder_count: data.holder_count,
                      kol_count: data.kol_count,
                    };
                  });
                  return updated;
                };

                // Update all arrays since token_info_update can apply to any token
                setNewTokens(prev => applyTokenInfoUpdate(prev, 'newTokens'));
                setFinalStretchTokens(prev => applyTokenInfoUpdate(prev, 'finalStretchTokens'));
                setMigratedTokens(prev => applyTokenInfoUpdate(prev, 'migratedTokens'));

                // Call the callback so parent components can update their local state
                onTokenInfoUpdateRef.current?.({
                  mint_address: mintAddress,
                  holder_count: data.holder_count,
                  kol_count: data.kol_count,
                });
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
