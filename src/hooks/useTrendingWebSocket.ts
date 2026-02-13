import { useEffect, useRef, useState, useCallback } from 'react';

// WebSocket URL for trending data
const TRENDING_WS_URL = 'wss://token-stage.narrative.trade/v1/ws/trending';

// Cache key and version for localStorage persistence
const TRENDING_CACHE_KEY = 'trending_ws_cache';
const TRENDING_CACHE_VERSION = 'v2'; // Bumped to invalidate old cache with USDT

// Blacklisted token addresses - these will never be shown in trending
// These are stablecoins and wrapped tokens that shouldn't appear in memecoin trending
const BLACKLISTED_TOKENS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'tTLsJR5f2QYx6XDrQBcGJ25UaCGaJNTt33q5UYunt1J', // Blacklisted
]);

// Helper to save trending data to localStorage
function saveTrendingCache(timeframe: TrendingTimeframe, tokens: NormalizedTrendingToken[]) {
  try {
    const cacheKey = `${TRENDING_CACHE_KEY}_${timeframe}_${TRENDING_CACHE_VERSION}`;
    const cacheData = {
      tokens,
      timestamp: Date.now(),
    };
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
  } catch (err) {
    // Silently fail - localStorage might be full or disabled
  }
}

// Helper to load trending data from localStorage
function loadTrendingCache(timeframe: TrendingTimeframe): NormalizedTrendingToken[] | null {
  try {
    const cacheKey = `${TRENDING_CACHE_KEY}_${timeframe}_${TRENDING_CACHE_VERSION}`;
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;

    const cacheData = JSON.parse(cached);
    // Cache is valid for 5 minutes
    const cacheAge = Date.now() - cacheData.timestamp;
    if (cacheAge > 5 * 60 * 1000) return null;

    return cacheData.tokens;
  } catch (err) {
    return null;
  }
}

// Helper to check if a token is blacklisted
function isBlacklisted(mint: string): boolean {
  return BLACKLISTED_TOKENS.has(mint);
}

// Timeframe type
export type TrendingTimeframe = '5m' | '1h' | '6h';

// Normalized token for InterstateTable compatibility
export interface NormalizedTrendingToken {
  contractAddress: string;
  mint: string;
  name: string;
  symbol: string;
  price_usd: number;
  fully_diluted_value: number;
  total_liquidity_usd: number;
  volume_1h: number;
  volume_5m: number;
  volume_6h: number;
  volume_24h: number;
  holder_count: number;
  rank: number;
  status: string;
  sniper_percent: number;
  insider_percent: number;
  top10_holders_percent: number;
  bundle_percent: number;
  image?: string;
  image_url?: string; // InterstateTable looks for this first
  logo?: string;
  uri?: string; // Metadata URI for image/social links resolution
  priceUsd?: number;
  marketCapUsd?: number;
  liquidityUsd?: number;
  // Transaction counts for TXNS column
  total_buys_5m: number;
  total_sells_5m: number;
  total_buys_1h?: number;
  total_sells_1h?: number;
  total_buys_6h?: number;
  total_sells_6h?: number;
  total_buys_24h?: number;
  total_sells_24h?: number;
  // Protocol/launchpad info for trade routing (critical for quick buy!)
  launchpad_protocol?: string;
  protocol?: string;
  // Pool/pair address for direct trade routing (used by DexScreener tokens)
  pair_address?: string;
  migrated_pool_address?: string;
  created_at?: string;
}

interface TrendingWebSocketState {
  tokens: NormalizedTrendingToken[];
  loading: boolean;
  error: string | null;
  isConnected: boolean;
  isReconnecting: boolean;
  lastUpdate: Date | null;
}

interface UseTrendingWebSocketOptions {
  timeframe?: TrendingTimeframe;
  enabled?: boolean;
}

// Normalize token data from WebSocket to match InterstateTable format
function normalizeToken(raw: any): NormalizedTrendingToken {
  return {
    contractAddress: raw.mint || raw.contractAddress || '',
    mint: raw.mint || raw.contractAddress || '',
    name: raw.name || raw.symbol || 'Unknown',
    symbol: raw.symbol || raw.ticker || '',
    price_usd: raw.price_usd || raw.priceUsd || 0,
    fully_diluted_value: raw.market_cap_usd || raw.marketCapUsd || raw.fully_diluted_value || 0,
    total_liquidity_usd: raw.liquidity_usd || raw.liquidityUsd || raw.total_liquidity_usd || 0,
    volume_1h: raw.volume_usd || raw.volume_1h || 0,
    volume_5m: raw.volume_5m || raw.volume_usd || 0,
    volume_6h: raw.volume_6h || raw.volume_usd || 0,
    volume_24h: raw.volume_24h || raw.volume_usd || 0,
    holder_count: raw.holder_count || raw.holderCount || 0,
    rank: raw.rank || 0,
    status: raw.status || 'ACTIVE',
    sniper_percent: raw.sniper_percent || 0,
    insider_percent: raw.insider_percent || 0,
    top10_holders_percent: raw.top10_holders_percent || 0,
    bundle_percent: raw.bundle_percent || 0,
    image: raw.image || raw.image_url || raw.imageUrl || raw.image_uri || raw.logo || '',
    image_url: raw.image_url || raw.image || raw.imageUrl || raw.image_uri || raw.logo || '',
    logo: raw.logo || raw.image || raw.image_url || '',
    uri: raw.uri || raw.metadata_uri || raw.metadataUri || '',
    priceUsd: raw.price_usd || raw.priceUsd || 0,
    marketCapUsd: raw.market_cap_usd || raw.marketCapUsd || 0,
    liquidityUsd: raw.liquidity_usd || raw.liquidityUsd || 0,
    // Transaction counts for TXNS column
    total_buys_5m: raw.total_buys_5m || 0,
    total_sells_5m: raw.total_sells_5m || 0,
    total_buys_1h: raw.total_buys_1h || 0,
    total_sells_1h: raw.total_sells_1h || 0,
    total_buys_6h: raw.total_buys_6h || 0,
    total_sells_6h: raw.total_sells_6h || 0,
    total_buys_24h: raw.total_buys_24h || 0,
    total_sells_24h: raw.total_sells_24h || 0,
    // CRITICAL: Preserve launchpad_protocol for pool type detection in quick buy
    // Without this, backend has to do expensive pool discovery (~6 seconds)
    launchpad_protocol: raw.launchpad_protocol || raw.launchpadProtocol || raw.protocol || '',
    protocol: raw.protocol || raw.launchpad_protocol || raw.launchpadProtocol || '',
    created_at: raw.created_at || raw.createdAt || '',
  };
}

// Singleton pattern - ONE WebSocket connection for ALL timeframes
let globalWs: WebSocket | null = null;
// Store tokens by timeframe - snapshot gives us all timeframes at once
let globalTokenMaps: Record<TrendingTimeframe, Map<string, NormalizedTrendingToken>> = {
  '5m': new Map(),
  '1h': new Map(),
  '6h': new Map(),
};
let globalListeners = new Set<(timeframe: TrendingTimeframe) => void>();
let globalReconnectTimeout: NodeJS.Timeout | null = null;
let globalReconnectAttempt = 0;
let globalIsConnecting = false;
let globalIsConnected = false;

function notifyListeners(timeframe?: TrendingTimeframe) {
  globalListeners.forEach(listener => listener(timeframe || '1h'));
}

function connectGlobal() {
  // Prevent multiple simultaneous connection attempts
  if (globalIsConnecting) {
    console.log('[TrendingWS] Already connecting, skipping');
    return;
  }

  // Check if WebSocket exists and is either OPEN or CONNECTING
  if (globalWs) {
    if (globalWs.readyState === WebSocket.OPEN) {
      console.log('[TrendingWS] Already connected, skipping');
      return;
    }
    if (globalWs.readyState === WebSocket.CONNECTING) {
      console.log('[TrendingWS] Connection in progress, skipping');
      return;
    }
    // Close existing connection if in CLOSING or CLOSED state
    globalWs.close();
    globalWs = null;
  }

  // Set flag FIRST to prevent race conditions
  globalIsConnecting = true;

  // Clean up any pending reconnect
  if (globalReconnectTimeout) {
    clearTimeout(globalReconnectTimeout);
    globalReconnectTimeout = null;
  }

  // No timeframe param needed - server sends all timeframes in snapshot
  const wsUrl = TRENDING_WS_URL;
  console.log('[TrendingWS] Connecting to:', wsUrl);

  try {
    const ws = new WebSocket(wsUrl);
    globalWs = ws;

    ws.onopen = () => {
      console.log('[TrendingWS] Connected');
      globalIsConnecting = false;
      globalIsConnected = true;
      globalReconnectAttempt = 0;
      notifyListeners();
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'snapshot') {
          // Snapshot contains all timeframes: { "5m": [...], "1h": [...], "6h": [...] }
          const data = message.data;
          console.log('[TrendingWS] Received snapshot');

          // Process each timeframe
          (['5m', '1h', '6h'] as TrendingTimeframe[]).forEach(tf => {
            if (Array.isArray(data[tf])) {
              globalTokenMaps[tf].clear();
              let filteredCount = 0;
              data[tf].forEach((token: any) => {
                // Skip blacklisted tokens
                if (isBlacklisted(token.mint)) {
                  filteredCount++;
                  return;
                }
                const normalized = normalizeToken(token);
                globalTokenMaps[tf].set(normalized.mint, normalized);
              });
              console.log(`[TrendingWS] Loaded ${data[tf].length - filteredCount} tokens for ${tf} (filtered ${filteredCount} blacklisted)`);

              // Save to localStorage cache for instant display on tab switch
              const tokens = Array.from(globalTokenMaps[tf].values());
              saveTrendingCache(tf, tokens);
            }
          });

          notifyListeners();
        }
        else if (message.type === 'update') {
          // Update has topic field indicating which timeframe: { topic: "5m", data: { updated: [...] } }
          const topic = message.topic as TrendingTimeframe;
          const updates = message.data?.updated;

          if (!topic || !globalTokenMaps[topic]) {
            console.warn('[TrendingWS] Unknown topic:', topic);
            return;
          }

          if (Array.isArray(updates)) {
            let hasChanges = false;

            updates.forEach((update: any) => {
              const mint = update.mint;
              if (!mint) return;

              // Skip blacklisted tokens
              if (isBlacklisted(mint)) return;

              const existing = globalTokenMaps[topic].get(mint);
              if (existing) {
                // Merge update into existing token
                const updated: NormalizedTrendingToken = {
                  ...existing,
                  price_usd: update.price_usd ?? existing.price_usd,
                  priceUsd: update.price_usd ?? existing.priceUsd,
                  fully_diluted_value: update.market_cap_usd ?? existing.fully_diluted_value,
                  marketCapUsd: update.market_cap_usd ?? existing.marketCapUsd,
                  total_liquidity_usd: update.liquidity_usd ?? existing.total_liquidity_usd,
                  liquidityUsd: update.liquidity_usd ?? existing.liquidityUsd,
                  holder_count: update.holder_count ?? existing.holder_count,
                  volume_1h: update.volume_usd ?? existing.volume_1h,
                  bundle_percent: update.bundle_percent ?? existing.bundle_percent,
                  top10_holders_percent: update.top10_holders_percent ?? existing.top10_holders_percent,
                  sniper_percent: update.sniper_percent ?? existing.sniper_percent,
                  insider_percent: update.insider_percent ?? existing.insider_percent,
                  // Transaction counts
                  total_buys_5m: update.total_buys_5m ?? existing.total_buys_5m,
                  total_sells_5m: update.total_sells_5m ?? existing.total_sells_5m,
                  total_buys_1h: update.total_buys_1h ?? existing.total_buys_1h,
                  total_sells_1h: update.total_sells_1h ?? existing.total_sells_1h,
                  total_buys_6h: update.total_buys_6h ?? existing.total_buys_6h,
                  total_sells_6h: update.total_sells_6h ?? existing.total_sells_6h,
                  total_buys_24h: update.total_buys_24h ?? existing.total_buys_24h,
                  total_sells_24h: update.total_sells_24h ?? existing.total_sells_24h,
                  volume_24h: update.volume_24h ?? existing.volume_24h,
                };
                globalTokenMaps[topic].set(mint, updated);
                hasChanges = true;
              }
            });

            // Handle added tokens
            if (Array.isArray(message.data?.added)) {
              message.data.added.forEach((token: any) => {
                // Skip blacklisted tokens
                if (isBlacklisted(token.mint)) return;
                const normalized = normalizeToken(token);
                globalTokenMaps[topic].set(normalized.mint, normalized);
                hasChanges = true;
              });
            }

            // Handle removed tokens
            if (Array.isArray(message.data?.removed)) {
              message.data.removed.forEach((mint: string) => {
                globalTokenMaps[topic].delete(mint);
                hasChanges = true;
              });
            }

            if (hasChanges) {
              notifyListeners(topic);
            }
          }
        }
      } catch (err) {
        console.error('[TrendingWS] Error parsing message:', err);
      }
    };

    ws.onerror = (error) => {
      console.error('[TrendingWS] WebSocket error:', error);
      globalIsConnecting = false;
    };

    ws.onclose = (event) => {
      console.log('[TrendingWS] Disconnected, code:', event.code);
      globalIsConnecting = false;
      globalIsConnected = false;
      globalWs = null;
      notifyListeners();

      // Reconnect with exponential backoff if we have listeners
      if (globalListeners.size > 0 && globalReconnectAttempt < 5) {
        const delay = Math.min(1000 * Math.pow(2, globalReconnectAttempt), 30000);
        console.log(`[TrendingWS] Reconnecting in ${delay}ms (attempt ${globalReconnectAttempt + 1}/5)`);
        globalReconnectAttempt++;

        globalReconnectTimeout = setTimeout(() => {
          if (globalListeners.size > 0) {
            connectGlobal();
          }
        }, delay);
      }
    };
  } catch (err) {
    console.error('[TrendingWS] Connection error:', err);
    globalIsConnecting = false;
  }
}

function disconnectGlobal() {
  if (globalReconnectTimeout) {
    clearTimeout(globalReconnectTimeout);
    globalReconnectTimeout = null;
  }
  if (globalWs) {
    globalWs.close();
    globalWs = null;
  }
  globalIsConnecting = false;
  globalIsConnected = false;
  globalReconnectAttempt = 0;
}

export function useTrendingWebSocket(options: UseTrendingWebSocketOptions = {}) {
  const { timeframe = '1h', enabled = true } = options;

  // Initialize state - try to load from cache for instant display
  const [state, setState] = useState<TrendingWebSocketState>(() => {
    // Check if global maps already have data (from previous mount)
    const existingTokens = Array.from(globalTokenMaps[timeframe].values());
    if (existingTokens.length > 0) {
      return {
        tokens: existingTokens,
        loading: false,
        error: null,
        isConnected: globalIsConnected,
        isReconnecting: false,
        lastUpdate: new Date(),
      };
    }

    // Try to load from localStorage cache
    const cachedTokens = loadTrendingCache(timeframe);
    if (cachedTokens && cachedTokens.length > 0) {
      // Also populate global maps from cache for consistency
      cachedTokens.forEach(token => {
        globalTokenMaps[timeframe].set(token.mint, token);
      });
      return {
        tokens: cachedTokens,
        loading: false, // Show cached data, don't show loading
        error: null,
        isConnected: false,
        isReconnecting: false,
        lastUpdate: new Date(),
      };
    }

    // No cache available - show loading
    return {
      tokens: [],
      loading: true,
      error: null,
      isConnected: false,
      isReconnecting: false,
      lastUpdate: null,
    };
  });

  const mountedRef = useRef(true);
  const currentTimeframeRef = useRef(timeframe);

  // Keep timeframe ref in sync
  useEffect(() => {
    currentTimeframeRef.current = timeframe;
  }, [timeframe]);

  // Sync state from global for the selected timeframe
  const syncState = useCallback((updatedTimeframe?: TrendingTimeframe) => {
    if (!mountedRef.current) return;

    // Get tokens for the current timeframe
    const tf = currentTimeframeRef.current;
    const tokenMap = globalTokenMaps[tf];
    const tokens = Array.from(tokenMap.values());

    // Sort by rank
    tokens.sort((a, b) => {
      if (a.rank && b.rank) return a.rank - b.rank;
      return (b.fully_diluted_value || 0) - (a.fully_diluted_value || 0);
    });

    setState({
      tokens,
      loading: globalIsConnecting && tokens.length === 0,
      error: null,
      isConnected: globalIsConnected,
      isReconnecting: globalReconnectAttempt > 0 && !globalIsConnected,
      lastUpdate: new Date(),
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    if (enabled) {
      // Register listener
      globalListeners.add(syncState);

      // Connect if not already connected
      if (!globalWs || globalWs.readyState !== WebSocket.OPEN) {
        connectGlobal();
      } else {
        // Already connected, just sync state for current timeframe
        syncState();
      }
    }

    return () => {
      mountedRef.current = false;
      globalListeners.delete(syncState);

      // Disconnect if no more listeners
      // NOTE: We do NOT clear the token maps here - this allows instant display
      // when switching back to the trending tab. Fresh data will come from WebSocket.
      if (globalListeners.size === 0) {
        console.log('[TrendingWS] No more listeners, disconnecting (keeping cached data)');
        disconnectGlobal();
      }
    };
  }, [enabled, syncState]);

  // When timeframe changes, just re-sync state (no reconnect needed!)
  useEffect(() => {
    if (enabled && globalIsConnected) {
      syncState();
    }
  }, [timeframe, enabled, syncState]);

  // Manual reconnect function
  const reconnect = useCallback(() => {
    globalReconnectAttempt = 0;
    disconnectGlobal();
    connectGlobal();
  }, []);

  return {
    ...state,
    reconnect,
    tokenCount: globalTokenMaps[timeframe].size,
  };
}

export default useTrendingWebSocket;
