import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import { env } from '~/env';
import {
  savePulseCache,
  loadPulseCache,
  isIndexedDBAvailable,
  type PulseToken,
} from '~/utils/pulseCache';
import { extractTokenImage } from '~/utils/images';

/**
 * App-Level Pulse Stream Context with Channel-Specific Connections
 *
 * This context maintains THREE persistent WebSocket connections:
 * 1. /v1/stream?channel=new - New token events + price updates for new tokens
 * 2. /v1/stream?channel=final_stretch - Final stretch events + price updates
 * 3. /v1/stream?channel=migrated - Migrated events + price updates
 *
 * Each channel receives filtered data from the backend, matching the original
 * PulseTable architecture but persisting across navigation.
 */

export interface TokenInfoUpdate {
  mint_address: string;
  holder_count: number;
  kol_count: number;
}

export type ChannelType = 'new' | 'final_stretch' | 'migrated';

type TokenCallback = (token: PulseToken) => void;
type PriceUpdateCallback = (updates: PulseToken[]) => void;
type TokenInfoUpdateCallback = (update: TokenInfoUpdate) => void;

interface ChannelState {
  connected: boolean;
  error: string | null;
}

interface ChannelSubscribers {
  tokenCallbacks: Set<TokenCallback>;
  priceUpdateCallbacks: Set<PriceUpdateCallback>;
  tokenInfoUpdateCallbacks: Set<TokenInfoUpdateCallback>;
}

interface PulseStreamContextValue {
  // Connection status per channel
  channels: {
    new: ChannelState;
    final_stretch: ChannelState;
    migrated: ChannelState;
  };

  // Subscribe to a specific channel
  subscribeToChannel: (
    channel: ChannelType,
    callbacks: {
      onToken?: TokenCallback;
      onPriceUpdate?: PriceUpdateCallback;
      onTokenInfoUpdate?: TokenInfoUpdateCallback;
    }
  ) => () => void; // returns unsubscribe function

  // Cached tokens for instant display
  cachedNewTokens: PulseToken[];
  cachedFinalStretchTokens: PulseToken[];
  cachedMigratedTokens: PulseToken[];

  // Control connections
  setEnabled: (enabled: boolean) => void;
  isEnabled: boolean;

  // Clear cached data
  clearCache: () => void;
}

const PulseStreamContext = createContext<PulseStreamContextValue | null>(null);

// Helper to normalize WebSocket tokens with default values
const normalizeToken = (rawToken: any): PulseToken => {
  const holderValue = rawToken.holder_count ?? rawToken.holders ?? rawToken.unique_wallets_24h ?? 0;
  const devPercentValue = rawToken.dev_percent ?? rawToken.dev_held_percentage ?? 0;
  const sniperPercentValue = rawToken.sniper_percent ?? rawToken.sniper_held_percentage ?? 0;
  const insiderPercentValue = rawToken.insider_percent ?? rawToken.insider_held_percentage ?? 0;
  const bundlePercentValue = rawToken.bundle_percent ?? rawToken.bundled_percentage ?? 0;

  return {
    ...rawToken,
    mint: rawToken.address || rawToken.mint,
    mint_address: rawToken.mint_address || rawToken.address || rawToken.mint,
    image: extractTokenImage(rawToken) || rawToken.image,
    holder_count: holderValue,
    holders: holderValue,
    unique_wallets_24h: rawToken.unique_wallets_24h ?? holderValue,
    kol_count: rawToken.kol_count ?? 0,
    total_buys_24h: rawToken.total_buys_24h ?? 0,
    total_sells_24h: rawToken.total_sells_24h ?? 0,
    total_buys_5m: rawToken.total_buys_5m ?? 0,
    total_sells_5m: rawToken.total_sells_5m ?? 0,
    total_buys_1h: rawToken.total_buys_1h ?? 0,
    total_sells_1h: rawToken.total_sells_1h ?? 0,
    total_buys_6h: rawToken.total_buys_6h ?? 0,
    total_sells_6h: rawToken.total_sells_6h ?? 0,
    total_buy_volume_24h: rawToken.total_buy_volume_24h ?? 0,
    total_sell_volume_24h: rawToken.total_sell_volume_24h ?? 0,
    total_buy_volume_5m: rawToken.total_buy_volume_5m ?? 0,
    total_sell_volume_5m: rawToken.total_sell_volume_5m ?? 0,
    total_buy_volume_1h: rawToken.total_buy_volume_1h ?? 0,
    total_sell_volume_1h: rawToken.total_sell_volume_1h ?? 0,
    total_buy_volume_6h: rawToken.total_buy_volume_6h ?? 0,
    total_sell_volume_6h: rawToken.total_sell_volume_6h ?? 0,
    dev_percent: devPercentValue,
    dev_held_percentage: devPercentValue,
    sniper_percent: sniperPercentValue,
    sniper_held_percentage: sniperPercentValue,
    insider_percent: insiderPercentValue,
    insider_held_percentage: insiderPercentValue,
    bundle_percent: bundlePercentValue,
    bundled_percentage: bundlePercentValue,
    bundler_held_percentage: bundlePercentValue,
    bundle_wallet_count: rawToken.bundle_wallet_count ?? 0,
    bundler_count: rawToken.bundle_wallet_count ?? rawToken.bundler_count ?? 0,
    top10_holders_pct: rawToken.top10_holders_pct ?? rawToken.top_10_holders_percent ?? 0,
    dev_tokens_created: rawToken.dev_tokens_created ?? 0,
    dev_tokens_migrated: rawToken.dev_tokens_migrated ?? 0,
    bonding_pct: rawToken.bonding_pct ?? rawToken.bonding_percent ?? rawToken.bonding_curve_progress ?? 0,
    bonding_curve_progress: rawToken.bonding_curve_progress ?? rawToken.bonding_pct ?? rawToken.bonding_percent ?? 0,
    market_cap_usd: rawToken.market_cap_usd ?? rawToken.fully_diluted_value ?? rawToken.fdv ?? 0,
    liquidity_usd: rawToken.liquidity_usd ?? rawToken.total_liquidity_usd ?? 0,
    volume_24h: rawToken.volume_24h ?? 0,
    pro_traders_count: rawToken.pro_traders_count ?? rawToken.pro_traders ?? 0,
  };
};

// Apply price updates to a token
const applyPriceUpdate = (token: PulseToken, update: any): PulseToken => {
  return {
    ...token,
    ...(update.price_usd !== undefined && { price_usd: update.price_usd }),
    ...(update.market_cap_usd !== undefined && update.market_cap_usd > 0 && { market_cap_usd: update.market_cap_usd }),
    ...(update.volume_24h !== undefined && { volume_24h: update.volume_24h }),
    ...(update.bonding_pct !== undefined && update.bonding_pct >= 0 && { bonding_pct: update.bonding_pct, bonding_curve_progress: update.bonding_pct / 100 }),
    ...(update.graduation_percent !== undefined && update.graduation_percent >= 0 && { graduation_percent: update.graduation_percent }),
    ...(update.liquidity_usd !== undefined && update.liquidity_usd >= 0 && { liquidity_usd: update.liquidity_usd, total_liquidity_usd: update.liquidity_usd }),
    ...(update.holder_count !== undefined && { holder_count: update.holder_count }),
    ...(update.kol_count !== undefined && { kol_count: update.kol_count }),
    ...(update.dev_percent !== undefined && { dev_percent: update.dev_percent, dev_held_percentage: update.dev_percent }),
    ...(update.sniper_percent !== undefined && { sniper_percent: update.sniper_percent, sniper_held_percentage: update.sniper_percent }),
    ...(update.insider_percent !== undefined && { insider_percent: update.insider_percent, insider_held_percentage: update.insider_percent }),
    ...(update.bundle_percent !== undefined && { bundle_percent: update.bundle_percent, bundled_percentage: update.bundle_percent, bundler_held_percentage: update.bundle_percent }),
    ...(update.bundle_wallet_count !== undefined && { bundle_wallet_count: update.bundle_wallet_count, bundler_count: update.bundle_wallet_count }),
    ...(update.top10_holders_pct !== undefined && { top10_holders_pct: update.top10_holders_pct }),
    ...(update.trade_type !== undefined && { last_trade_type: update.trade_type }),
    ...(update.sol_amount !== undefined && { last_sol_amount: update.sol_amount }),
    ...(update.token_amount !== undefined && { last_token_amount: update.token_amount }),
    ...(update.total_buy_volume_5m !== undefined && { total_buy_volume_5m: update.total_buy_volume_5m }),
    ...(update.total_sell_volume_5m !== undefined && { total_sell_volume_5m: update.total_sell_volume_5m }),
    ...(update.total_buys_5m !== undefined && { total_buys_5m: update.total_buys_5m }),
    ...(update.total_sells_5m !== undefined && { total_sells_5m: update.total_sells_5m }),
    ...(update.total_buy_volume_1h !== undefined && { total_buy_volume_1h: update.total_buy_volume_1h }),
    ...(update.total_sell_volume_1h !== undefined && { total_sell_volume_1h: update.total_sell_volume_1h }),
    ...(update.total_buys_1h !== undefined && { total_buys_1h: update.total_buys_1h }),
    ...(update.total_sells_1h !== undefined && { total_sells_1h: update.total_sells_1h }),
    ...(update.total_buy_volume_6h !== undefined && { total_buy_volume_6h: update.total_buy_volume_6h }),
    ...(update.total_sell_volume_6h !== undefined && { total_sell_volume_6h: update.total_sell_volume_6h }),
    ...(update.total_buys_6h !== undefined && { total_buys_6h: update.total_buys_6h }),
    ...(update.total_sells_6h !== undefined && { total_sells_6h: update.total_sells_6h }),
    ...(update.total_buy_volume_24h !== undefined && { total_buy_volume_24h: update.total_buy_volume_24h }),
    ...(update.total_sell_volume_24h !== undefined && { total_sell_volume_24h: update.total_sell_volume_24h }),
    ...(update.total_buys_24h !== undefined && { total_buys_24h: update.total_buys_24h }),
    ...(update.total_sells_24h !== undefined && { total_sells_24h: update.total_sells_24h }),
  };
};

export function PulseStreamProvider({ children }: { children: React.ReactNode }) {
  const [isEnabled, setIsEnabled] = useState(true);

  // Channel connection states
  const [channelStates, setChannelStates] = useState<Record<ChannelType, ChannelState>>({
    new: { connected: false, error: null },
    final_stretch: { connected: false, error: null },
    migrated: { connected: false, error: null },
  });

  // Cached tokens for instant display
  const [cachedNewTokens, setCachedNewTokens] = useState<PulseToken[]>([]);
  const [cachedFinalStretchTokens, setCachedFinalStretchTokens] = useState<PulseToken[]>([]);
  const [cachedMigratedTokens, setCachedMigratedTokens] = useState<PulseToken[]>([]);

  // WebSocket refs per channel
  const wsRefs = useRef<Record<ChannelType, WebSocket | null>>({
    new: null,
    final_stretch: null,
    migrated: null,
  });

  const reconnectTimeoutRefs = useRef<Record<ChannelType, NodeJS.Timeout | null>>({
    new: null,
    final_stretch: null,
    migrated: null,
  });

  const reconnectAttemptsRefs = useRef<Record<ChannelType, number>>({
    new: 0,
    final_stretch: 0,
    migrated: 0,
  });

  const isConnectingRefs = useRef<Record<ChannelType, boolean>>({
    new: false,
    final_stretch: false,
    migrated: false,
  });

  const mountedRef = useRef(true);
  const cacheLoadedRef = useRef(false);

  // Subscribers per channel
  const subscribersRef = useRef<Record<ChannelType, ChannelSubscribers>>({
    new: { tokenCallbacks: new Set(), priceUpdateCallbacks: new Set(), tokenInfoUpdateCallbacks: new Set() },
    final_stretch: { tokenCallbacks: new Set(), priceUpdateCallbacks: new Set(), tokenInfoUpdateCallbacks: new Set() },
    migrated: { tokenCallbacks: new Set(), priceUpdateCallbacks: new Set(), tokenInfoUpdateCallbacks: new Set() },
  });

  const maxReconnectAttempts = 10;
  const reconnectInterval = 2000;

  // Base WebSocket URL
  const baseUrl = `${env.NEXT_PUBLIC_WEBSOCKET_URL.replace(/^http/, 'ws')}/v1/stream`;

  // Map channel to token message type
  const channelToTokenType: Record<ChannelType, string> = {
    new: 'new_token',
    final_stretch: 'final_stretch_token',
    migrated: 'migrated_token',
  };

  // Get cache setter for channel
  const getCacheSetter = (channel: ChannelType) => {
    switch (channel) {
      case 'new': return setCachedNewTokens;
      case 'final_stretch': return setCachedFinalStretchTokens;
      case 'migrated': return setCachedMigratedTokens;
    }
  };

  // Subscribe to a specific channel
  const subscribeToChannel = useCallback((
    channel: ChannelType,
    callbacks: {
      onToken?: TokenCallback;
      onPriceUpdate?: PriceUpdateCallback;
      onTokenInfoUpdate?: TokenInfoUpdateCallback;
    }
  ) => {
    const subs = subscribersRef.current[channel];

    if (callbacks.onToken) {
      subs.tokenCallbacks.add(callbacks.onToken);
      console.log(`[PulseStreamContext:${channel}] ✅ Added token callback, total: ${subs.tokenCallbacks.size}`);
    }
    if (callbacks.onPriceUpdate) {
      subs.priceUpdateCallbacks.add(callbacks.onPriceUpdate);
      console.log(`[PulseStreamContext:${channel}] ✅ Added price update callback, total: ${subs.priceUpdateCallbacks.size}`);
    }
    if (callbacks.onTokenInfoUpdate) {
      subs.tokenInfoUpdateCallbacks.add(callbacks.onTokenInfoUpdate);
    }

    // Return unsubscribe function
    return () => {
      if (callbacks.onToken) {
        subs.tokenCallbacks.delete(callbacks.onToken);
        console.log(`[PulseStreamContext:${channel}] ❌ Removed token callback, remaining: ${subs.tokenCallbacks.size}`);
      }
      if (callbacks.onPriceUpdate) {
        subs.priceUpdateCallbacks.delete(callbacks.onPriceUpdate);
        console.log(`[PulseStreamContext:${channel}] ❌ Removed price update callback, remaining: ${subs.priceUpdateCallbacks.size}`);
      }
      if (callbacks.onTokenInfoUpdate) {
        subs.tokenInfoUpdateCallbacks.delete(callbacks.onTokenInfoUpdate);
      }
    };
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    setIsEnabled(enabled);
  }, []);

  const clearCache = useCallback(() => {
    setCachedNewTokens([]);
    setCachedFinalStretchTokens([]);
    setCachedMigratedTokens([]);
  }, []);

  // Save to IndexedDB when cached tokens change (debounced)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!isIndexedDBAvailable()) return;
    if (cachedNewTokens.length === 0 && cachedFinalStretchTokens.length === 0 && cachedMigratedTokens.length === 0) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      savePulseCache({
        newTokens: cachedNewTokens,
        finalStretchTokens: cachedFinalStretchTokens,
        migratedTokens: cachedMigratedTokens,
        timestamp: Date.now(),
      }).catch(err => console.warn('[PulseStreamContext] Failed to save cache:', err));
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [cachedNewTokens, cachedFinalStretchTokens, cachedMigratedTokens]);

  // Load from IndexedDB on mount
  useEffect(() => {
    if (cacheLoadedRef.current || !isIndexedDBAvailable()) return;

    loadPulseCache().then(cached => {
      if (!mountedRef.current || !cached) return;

      cacheLoadedRef.current = true;
      console.log('[PulseStreamContext] Loaded from IndexedDB cache:', {
        newTokens: cached.newTokens.length,
        finalStretchTokens: cached.finalStretchTokens.length,
        migratedTokens: cached.migratedTokens.length,
        age: Date.now() - cached.timestamp + 'ms'
      });

      setCachedNewTokens(prev => prev.length > 0 ? prev : cached.newTokens);
      setCachedFinalStretchTokens(prev => prev.length > 0 ? prev : cached.finalStretchTokens);
      setCachedMigratedTokens(prev => prev.length > 0 ? prev : cached.migratedTokens);
    }).catch(err => {
      console.warn('[PulseStreamContext] Failed to load cache:', err);
    });
  }, []);

  // Connect to a specific channel
  const connectChannel = useCallback((channel: ChannelType) => {
    if (!isEnabled) {
      console.log(`[PulseStreamContext:${channel}] WebSocket disabled`);
      return;
    }

    if (isConnectingRefs.current[channel]) {
      console.log(`[PulseStreamContext:${channel}] Already connecting, skipping...`);
      return;
    }

    const existingWs = wsRefs.current[channel];
    if (existingWs?.readyState === WebSocket.OPEN || existingWs?.readyState === WebSocket.CONNECTING) {
      console.log(`[PulseStreamContext:${channel}] Already connected/connecting, skipping...`);
      return;
    }

    if (reconnectAttemptsRefs.current[channel] >= maxReconnectAttempts) {
      console.log(`[PulseStreamContext:${channel}] Max reconnect attempts reached`);
      setChannelStates(prev => ({
        ...prev,
        [channel]: { connected: false, error: 'Max reconnection attempts reached' }
      }));
      return;
    }

    try {
      isConnectingRefs.current[channel] = true;
      const url = `${baseUrl}?channel=${channel}`;
      console.log(`[PulseStreamContext:${channel}] Connecting to:`, url);
      const ws = new WebSocket(url);

      ws.onopen = () => {
        isConnectingRefs.current[channel] = false;
        if (!mountedRef.current) return;
        console.log(`[PulseStreamContext:${channel}] ✅ Connected (persistent)`);
        setChannelStates(prev => ({
          ...prev,
          [channel]: { connected: true, error: null }
        }));
        reconnectAttemptsRefs.current[channel] = 0;
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;

        try {
          const messages = event.data.split('\n').filter((msg: string) => msg.trim());
          const subs = subscribersRef.current[channel];
          const setCacheTokens = getCacheSetter(channel);
          const tokenType = channelToTokenType[channel];

          for (const msgStr of messages) {
            try {
              const message = JSON.parse(msgStr);

              // Handle new token for this channel (single token or array)
              if (message.type === tokenType && message.data) {
                // Handle both single token and array of tokens
                const tokenDataArray = Array.isArray(message.data) ? message.data : [message.data];
                console.log(`[PulseStreamContext:${channel}] 🔥 Received ${tokenType} with ${tokenDataArray.length} token(s)`);

                for (const tokenData of tokenDataArray) {
                  const token = normalizeToken(tokenData);
                  console.log(`[PulseStreamContext:${channel}] 🔥 Processing ${tokenType}:`, token.symbol, token.mint?.slice(0, 8));
                  console.log(`[PulseStreamContext:${channel}] Subscribers count:`, subs.tokenCallbacks.size);
                  console.log(`[PulseStreamContext:${channel}] Token data:`, {
                    mint: token.mint,
                    bonding_pct: token.bonding_pct,
                    bonding_curve_progress: (token as any).bonding_curve_progress,
                    market_cap_usd: token.market_cap_usd,
                  });

                  // Update cache
                  setCacheTokens(prev => {
                    const map = new Map<string, PulseToken>();
                    map.set(token.mint, token);
                    for (const t of prev) {
                      if (t.mint !== token.mint && map.size < 50) {
                        map.set(t.mint, t);
                      }
                    }
                    return Array.from(map.values());
                  });

                  // Notify subscribers with flushSync for immediate UI update
                  if (subs.tokenCallbacks.size > 0) {
                    flushSync(() => {
                      subs.tokenCallbacks.forEach(callback => callback(token));
                    });
                  }
                }

              // Handle price updates for this channel
              } else if (message.type === 'price_update' && message.data) {
                const rawUpdates = Array.isArray(message.data) ? message.data : [message.data];
                const updates = rawUpdates.map((u: any) => normalizeToken(u));
                console.log(`[PulseStreamContext:${channel}] 📊 Price update for ${updates.length} tokens, subscribers:`, subs.priceUpdateCallbacks.size);

                // Update cached tokens with price data
                const updatesMap = new Map(updates.map((u: PulseToken) => [u.mint, u]));
                setCacheTokens(prev => {
                  let hasChanges = false;
                  const updated = prev.map(token => {
                    const update = updatesMap.get(token.mint);
                    if (!update) return token;
                    hasChanges = true;
                    return applyPriceUpdate(token, update);
                  });
                  return hasChanges ? updated : prev;
                });

                // Notify price update subscribers (no flushSync needed)
                if (subs.priceUpdateCallbacks.size > 0) {
                  subs.priceUpdateCallbacks.forEach(callback => callback(updates));
                }

              // Handle token info updates
              } else if (message.type === 'token_info_update' && message.data) {
                const data = message.data;
                const mintAddress = data.mint_address || data.mint || data.address;

                if (mintAddress) {
                  // Update cached tokens
                  setCacheTokens(prev => {
                    return prev.map(token => {
                      if (token.mint !== mintAddress) return token;
                      return {
                        ...token,
                        holder_count: data.holder_count ?? token.holder_count,
                        kol_count: data.kol_count ?? token.kol_count,
                      };
                    });
                  });

                  // Notify subscribers
                  const update: TokenInfoUpdate = {
                    mint_address: mintAddress,
                    holder_count: data.holder_count,
                    kol_count: data.kol_count,
                  };
                  subs.tokenInfoUpdateCallbacks.forEach(callback => callback(update));
                }
              }
            } catch {
              // Skip parse errors for individual messages
            }
          }
        } catch {
          // Handle errors silently
        }
      };

      ws.onerror = (event) => {
        isConnectingRefs.current[channel] = false;
        if (!mountedRef.current) return;
        console.error(`[PulseStreamContext:${channel}] WebSocket error:`, event);
        setChannelStates(prev => ({
          ...prev,
          [channel]: { ...prev[channel], error: 'WebSocket connection error' }
        }));
      };

      ws.onclose = () => {
        isConnectingRefs.current[channel] = false;
        if (!mountedRef.current) return;
        console.log(`[PulseStreamContext:${channel}] Disconnected`);
        setChannelStates(prev => ({
          ...prev,
          [channel]: { connected: false, error: prev[channel].error }
        }));

        if (isEnabled && reconnectAttemptsRefs.current[channel] < maxReconnectAttempts) {
          reconnectAttemptsRefs.current[channel]++;
          console.log(
            `[PulseStreamContext:${channel}] Reconnecting in ${reconnectInterval}ms (attempt ${reconnectAttemptsRefs.current[channel]}/${maxReconnectAttempts})`
          );

          reconnectTimeoutRefs.current[channel] = setTimeout(() => {
            if (mountedRef.current) {
              connectChannel(channel);
            }
          }, reconnectInterval);
        }
      };

      wsRefs.current[channel] = ws;
    } catch (err) {
      isConnectingRefs.current[channel] = false;
      console.error(`[PulseStreamContext:${channel}] Failed to create WebSocket:`, err);
      setChannelStates(prev => ({
        ...prev,
        [channel]: { connected: false, error: err instanceof Error ? err.message : 'Failed to connect' }
      }));
    }
  }, [isEnabled, baseUrl]);

  // Disconnect a specific channel
  const disconnectChannel = useCallback((channel: ChannelType) => {
    isConnectingRefs.current[channel] = false;

    if (reconnectTimeoutRefs.current[channel]) {
      clearTimeout(reconnectTimeoutRefs.current[channel]!);
      reconnectTimeoutRefs.current[channel] = null;
    }

    if (wsRefs.current[channel]) {
      wsRefs.current[channel]!.close();
      wsRefs.current[channel] = null;
    }

    setChannelStates(prev => ({
      ...prev,
      [channel]: { connected: false, error: null }
    }));
  }, []);

  // Main connection effect - connect all three channels
  useEffect(() => {
    mountedRef.current = true;

    if (!isEnabled) {
      // Disconnect all channels
      (['new', 'final_stretch', 'migrated'] as ChannelType[]).forEach(disconnectChannel);
      return;
    }

    // Connect all channels
    (['new', 'final_stretch', 'migrated'] as ChannelType[]).forEach(channel => {
      reconnectAttemptsRefs.current[channel] = 0;
      connectChannel(channel);
    });

    return () => {
      mountedRef.current = false;
      (['new', 'final_stretch', 'migrated'] as ChannelType[]).forEach(disconnectChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEnabled]);

  const value: PulseStreamContextValue = {
    channels: channelStates,
    subscribeToChannel,
    cachedNewTokens,
    cachedFinalStretchTokens,
    cachedMigratedTokens,
    setEnabled,
    isEnabled,
    clearCache,
  };

  return (
    <PulseStreamContext.Provider value={value}>
      {children}
    </PulseStreamContext.Provider>
  );
}

/**
 * Hook to access the persistent pulse stream
 *
 * Usage:
 * ```
 * const { channels, subscribeToChannel } = usePulseStream();
 *
 * useEffect(() => {
 *   const unsubscribe = subscribeToChannel('new', {
 *     onToken: (token) => { ... },
 *     onPriceUpdate: (updates) => { ... },
 *   });
 *   return unsubscribe;
 * }, []);
 * ```
 */
export function usePulseStream() {
  const context = useContext(PulseStreamContext);
  if (!context) {
    throw new Error('usePulseStream must be used within a PulseStreamProvider');
  }
  return context;
}
