import { useEffect, useState, useCallback, useRef } from 'react';
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

const isDev = process.env.NODE_ENV !== 'production';

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
  /**
   * When true, the hook will NOT update internal React state (newTokens, finalStretchTokens, migratedTokens).
   * Callbacks will still be called. This prevents re-renders that can block navigation.
   * Use this when you only need the callbacks (e.g., to update React Query directly).
   */
  skipInternalState?: boolean;
  /**
   * When true, the hook will skip processing messages entirely (messages are dropped).
   * Use this during navigation to completely prevent any main thread work.
   */
  pauseProcessing?: boolean;
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
    skipInternalState = false,
    pauseProcessing = false,
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

  // Message batching to prevent blocking the main thread
  const pendingMessagesRef = useRef<string[]>([]);
  const processingScheduledRef = useRef(false);

  // Store callbacks and options in refs
  const onNewTokenRef = useRef(onNewToken);
  const onFinalStretchTokenRef = useRef(onFinalStretchToken);
  const onMigratedTokenRef = useRef(onMigratedToken);
  const onPriceUpdateRef = useRef(onPriceUpdate);
  const onTokenInfoUpdateRef = useRef(onTokenInfoUpdate);
  const skipInternalStateRef = useRef(skipInternalState);
  const pauseProcessingRef = useRef(pauseProcessing);

  useEffect(() => {
    onNewTokenRef.current = onNewToken;
    onFinalStretchTokenRef.current = onFinalStretchToken;
    onMigratedTokenRef.current = onMigratedToken;
    onPriceUpdateRef.current = onPriceUpdate;
    onTokenInfoUpdateRef.current = onTokenInfoUpdate;
    skipInternalStateRef.current = skipInternalState;
    pauseProcessingRef.current = pauseProcessing;
  }, [onNewToken, onFinalStretchToken, onMigratedToken, onPriceUpdate, onTokenInfoUpdate, skipInternalState, pauseProcessing]);

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
      if (isDev) {
        console.log('[usePulseWebSocketPersistent] Loaded from IndexedDB cache:', {
          newTokens: cached.newTokens.length,
          finalStretchTokens: cached.finalStretchTokens.length,
          migratedTokens: cached.migratedTokens.length,
          age: Date.now() - cached.timestamp + 'ms'
        });
      }

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

    // Extract mint address from various possible field names
    // Priority: mint > address > mint_address > token_address > contract_address
    const mintValue = rawToken.mint || rawToken.address || rawToken.mint_address || rawToken.token_address || rawToken.contract_address;

    return {
      ...rawToken,
      mint: mintValue,
      mint_address: mintValue,
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
      isDev && console.log('[usePulseWebSocketPersistent] WebSocket disabled via feature flag');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      isDev && console.log('[usePulseWebSocketPersistent] Max reconnect attempts reached');
      setError('Max reconnection attempts reached');
      return;
    }

    try {
      isDev && console.log('[usePulseWebSocketPersistent] Connecting to:', url);
      const ws = new WebSocket(url);

      ws.onopen = () => {
        if (!mountedRef.current) return;
        isDev && console.log('[usePulseWebSocketPersistent] Connected');
        setConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      // Process queued messages in batches to avoid blocking main thread
      const processMessages = () => {
        if (!mountedRef.current) {
          pendingMessagesRef.current = [];
          processingScheduledRef.current = false;
          return;
        }

        // Skip processing if paused (e.g., during navigation)
        // Drop messages to prevent queue buildup
        if (pauseProcessingRef.current) {
          pendingMessagesRef.current = [];
          processingScheduledRef.current = false;
          return;
        }

        const messagesToProcess = pendingMessagesRef.current;
        pendingMessagesRef.current = [];
        processingScheduledRef.current = false;

        // Batch accumulators
        const newTokensBatch: PulseToken[] = [];
        const finalStretchTokensBatch: PulseToken[] = [];
        const migratedTokensBatch: PulseToken[] = [];
        const priceUpdatesBatch: PriceUpdate[] = [];
        const tokenInfoUpdatesBatch: any[] = [];

        // Parse and categorize all messages
        for (const msgStr of messagesToProcess) {
          try {
            const message = JSON.parse(msgStr);

            if (message.type === 'new_token' && message.data) {
              // Handle both single token and array of tokens
              const tokens = Array.isArray(message.data) ? message.data : [message.data];
              for (const t of tokens) {
                const normalized = normalizeToken(t);
                if (normalized.mint) {
                  newTokensBatch.push(normalized);
                } else {
                  console.warn(`[usePulseWebSocketPersistent][${channel}] ⚠️ Skipping token with no mint:`, t);
                }
              }
            } else if (message.type === 'final_stretch_token' && message.data) {
              const tokens = Array.isArray(message.data) ? message.data : [message.data];
              for (const t of tokens) {
                const normalized = normalizeToken(t);
                if (normalized.mint) {
                  finalStretchTokensBatch.push(normalized);
                } else {
                  console.warn(`[usePulseWebSocketPersistent][${channel}] ⚠️ Skipping final_stretch token with no mint:`, t);
                }
              }
            } else if (message.type === 'migrated_token' && message.data) {
              const tokens = Array.isArray(message.data) ? message.data : [message.data];
              for (const t of tokens) {
                const normalized = normalizeToken(t);
                if (normalized.mint) {
                  migratedTokensBatch.push(normalized);
                } else {
                  console.warn(`[usePulseWebSocketPersistent][${channel}] ⚠️ Skipping migrated token with no mint:`, t);
                }
              }
            } else if (message.type === 'price_update' && message.data) {
              const rawUpdates = Array.isArray(message.data) ? message.data : [message.data];
              for (const u of rawUpdates) {
                priceUpdatesBatch.push({ ...u, mint: u.address || u.mint });
              }
            } else if (message.type === 'token_info_update' && message.data) {
              tokenInfoUpdatesBatch.push(message.data);
            }
          } catch {
            // Skip parse errors
          }
        }

        // Apply batched new tokens
        if (newTokensBatch.length > 0) {
          for (const token of newTokensBatch) {
            onNewTokenRef.current?.(token);
          }
          // Skip internal state update if skipInternalState is true (prevents re-renders)
          if (!skipInternalStateRef.current) {
            setNewTokens(prev => {
              const map = new Map<string, PulseToken>();
              for (const token of newTokensBatch) {
                map.set(token.mint, token);
              }
              for (const t of prev) {
                if (!map.has(t.mint) && map.size < 50) {
                  map.set(t.mint, t);
                }
              }
              return Array.from(map.values());
            });
          }
        }

        // Apply batched final stretch tokens
        if (finalStretchTokensBatch.length > 0) {
          for (const token of finalStretchTokensBatch) {
            onFinalStretchTokenRef.current?.(token);
          }
          // Skip internal state update if skipInternalState is true (prevents re-renders)
          if (!skipInternalStateRef.current) {
            setFinalStretchTokens(prev => {
              const map = new Map<string, PulseToken>();
              for (const token of finalStretchTokensBatch) {
                map.set(token.mint, token);
              }
              for (const t of prev) {
                if (!map.has(t.mint) && map.size < 50) {
                  map.set(t.mint, t);
                }
              }
              return Array.from(map.values());
            });
          }
        }

        // Apply batched migrated tokens
        if (migratedTokensBatch.length > 0) {
          for (const token of migratedTokensBatch) {
            onMigratedTokenRef.current?.(token);
          }
          // Skip internal state update if skipInternalState is true (prevents re-renders)
          if (!skipInternalStateRef.current) {
            setMigratedTokens(prev => {
              const map = new Map<string, PulseToken>();
              for (const token of migratedTokensBatch) {
                map.set(token.mint, token);
              }
              for (const t of prev) {
                if (!map.has(t.mint) && map.size < 50) {
                  map.set(t.mint, t);
                }
              }
              return Array.from(map.values());
            });
          }
        }

        // Apply batched price updates
        if (priceUpdatesBatch.length > 0) {
          // Skip internal state update if skipInternalState is true (prevents re-renders)
          if (!skipInternalStateRef.current) {
            const updatesMap = new Map<string, PriceUpdate>(
              priceUpdatesBatch.map((u) => [u.mint!, u])
            );

            const applyUpdates = (tokens: PulseToken[]): PulseToken[] => {
              if (tokens.length === 0) return tokens;
              let hasChanges = false;
              const updated = tokens.map(token => {
                const update = updatesMap.get(token.mint);
                if (!update) return token;
                hasChanges = true;
                return applyPriceUpdate(token, update) as PulseToken;
              });
              return hasChanges ? updated : tokens;
            };

            if (channel === 'new') {
              setNewTokens(applyUpdates);
            } else if (channel === 'final_stretch') {
              setFinalStretchTokens(applyUpdates);
            } else if (channel === 'migrated') {
              setMigratedTokens(applyUpdates);
            }
          }

          onPriceUpdateRef.current?.(priceUpdatesBatch as PulseToken[]);
        }

        // Apply batched token info updates - SINGLE setState per array to prevent render storms
        if (tokenInfoUpdatesBatch.length > 0) {
          // Skip internal state update if skipInternalState is true (prevents re-renders)
          if (!skipInternalStateRef.current) {
            // Build a map of all token info updates
            const tokenInfoMap = new Map<string, { holder_count: number; kol_count: number }>();
            for (const data of tokenInfoUpdatesBatch) {
              const mintAddress = data.mint_address || data.mint || data.address;
              if (mintAddress) {
                tokenInfoMap.set(mintAddress, {
                  holder_count: data.holder_count,
                  kol_count: data.kol_count,
                });
              }
            }

            // Single setState call per array
            const applyAllTokenInfoUpdates = (tokens: PulseToken[]): PulseToken[] => {
              if (tokens.length === 0 || tokenInfoMap.size === 0) return tokens;
              let hasChanges = false;
              const updated = tokens.map(token => {
                const update = tokenInfoMap.get(token.mint);
                if (!update) return token;
                hasChanges = true;
                return { ...token, holder_count: update.holder_count, kol_count: update.kol_count };
              });
              return hasChanges ? updated : tokens;
            };

            setNewTokens(applyAllTokenInfoUpdates);
            setFinalStretchTokens(applyAllTokenInfoUpdates);
            setMigratedTokens(applyAllTokenInfoUpdates);
          }

          // Fire callbacks for each update (always, regardless of skipInternalState)
          for (const data of tokenInfoUpdatesBatch) {
            const mintAddress = data.mint_address || data.mint || data.address;
            if (mintAddress) {
              onTokenInfoUpdateRef.current?.({
                mint_address: mintAddress,
                holder_count: data.holder_count,
                kol_count: data.kol_count,
              });
            }
          }
        }
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;

        // Queue messages for batched processing
        const messages = event.data.split('\n').filter((msg: string) => msg.trim());
        pendingMessagesRef.current.push(...messages);

        // Schedule processing if not already scheduled
        // Use setTimeout(0) instead of requestAnimationFrame to yield to browser more aggressively
        // This allows navigation and other high-priority events to process
        if (!processingScheduledRef.current) {
          processingScheduledRef.current = true;
          setTimeout(processMessages, 0);
        }
      };

      ws.onerror = (event) => {
        if (!mountedRef.current) return;
        console.error('[usePulseWebSocketPersistent] WebSocket error:', event);
        setError('WebSocket connection error');
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        isDev && console.log('[usePulseWebSocketPersistent] Disconnected');
        setConnected(false);

        if (enabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          isDev && console.log(
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
