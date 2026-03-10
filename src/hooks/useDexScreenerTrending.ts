import { useEffect, useRef, useState, useCallback } from 'react';
import type { NormalizedTrendingToken } from './useTrendingWebSocket';

const isDev = process.env.NODE_ENV !== 'production';

// Derive URLs from environment (same env vars as the rest of the app)
function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_GO_SERVICE_URL || 'http://localhost:8085';
}

function getWsUrl(): string {
  const base = process.env.NEXT_PUBLIC_WEBSOCKET_URL || process.env.NEXT_PUBLIC_GO_SERVICE_URL || 'http://localhost:8085';
  // Convert http(s):// to ws(s)://
  return base.replace(/^http/, 'ws');
}

const DS_REST_PATH = '/v1/trending/dexscreener';
const DS_WS_PATH = '/v1/ws/trending/dexscreener';

// Cache key for localStorage persistence
const DS_CACHE_KEY = 'dexscreener_trending_cache_v1';

// Blacklisted token addresses (stablecoins/wrapped tokens)
const BLACKLISTED_TOKENS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'tTLsJR5f2QYx6XDrQBcGJ25UaCGaJNTt33q5UYunt1J', // Blacklisted
  '7GxATsNMnaC88vdwd2t3mwrFuQwwGvmYPrUQ4D6FotXk',
  '98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g',
  '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4',
  'JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD',  // Jupiter Perps USD
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
  'SNS8DJbHc34nKySHVhLGMUUE72ho6igvJaxtq9T3cX3',  // SNS
  'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn',  // Pump protocol
  'METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL',  // Meteora (MET)
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',  // Raydium (RAY)
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',  // Jupiter (JUP)
]);

function saveDexScreenerCache(tokens: NormalizedTrendingToken[]) {
  try {
    localStorage.setItem(DS_CACHE_KEY, JSON.stringify({ tokens, timestamp: Date.now() }));
  } catch {}
}

function loadDexScreenerCache(): NormalizedTrendingToken[] | null {
  try {
    const cached = localStorage.getItem(DS_CACHE_KEY);
    if (!cached) return null;
    const data = JSON.parse(cached);
    if (Date.now() - data.timestamp > 5 * 60 * 1000) return null; // 5-min TTL
    return data.tokens;
  } catch {
    return null;
  }
}

// Map DexScreener dex_id to launchpad_protocol for trade routing
function mapDexIdToProtocol(dexId: string): string {
  switch (dexId) {
    case 'pumpfun': return 'pump';
    case 'pumpswap': return 'pumpamm';
    case 'raydium': return 'raydium';
    case 'meteora': return 'meteora';
    case 'orca': return 'orca';
    default: return dexId || '';
  }
}

// Normalize a DexScreener token to NormalizedTrendingToken for InterstateTable
function normalizeDexScreenerToken(raw: any): NormalizedTrendingToken {
  const protocol = mapDexIdToProtocol(raw.dex_id || '');
  return {
    contractAddress: raw.mint || '',
    mint: raw.mint || '',
    name: raw.name || raw.symbol || 'Unknown',
    symbol: raw.symbol || '',
    price_usd: raw.price_usd || 0,
    fully_diluted_value: raw.fdv || raw.market_cap_usd || 0,
    total_liquidity_usd: raw.liquidity_usd || 0,
    volume_1h: raw.volume_1h || 0,
    volume_5m: raw.volume_5m || 0,
    volume_6h: raw.volume_6h || 0,
    volume_24h: raw.volume_24h || 0,
    holder_count: 0,
    rank: raw.rank || 0,
    status: 'ACTIVE',
    sniper_percent: 0,
    insider_percent: 0,
    top10_holders_percent: 0,
    bundle_percent: 0,
    image_url: raw.image_url || '',
    image: raw.image_url || '',
    logo: raw.image_url || '',
    priceUsd: raw.price_usd || 0,
    marketCapUsd: raw.market_cap_usd || 0,
    liquidityUsd: raw.liquidity_usd || 0,
    total_buys_5m: raw.total_buys_5m || 0,
    total_sells_5m: raw.total_sells_5m || 0,
    total_buys_1h: raw.total_buys_1h || 0,
    total_sells_1h: raw.total_sells_1h || 0,
    total_buys_6h: raw.total_buys_6h || 0,
    total_sells_6h: raw.total_sells_6h || 0,
    total_buys_24h: raw.total_buys_24h || 0,
    total_sells_24h: raw.total_sells_24h || 0,
    launchpad_protocol: protocol,
    protocol: protocol,
    pair_address: raw.pair_address || '',
  };
}

interface DexScreenerTrendingState {
  tokens: NormalizedTrendingToken[];
  loading: boolean;
  error: string | null;
  isConnected: boolean;
}

// Singleton WebSocket connection (shared across all component mounts)
let globalWs: WebSocket | null = null;
let globalTokenMap: Map<string, NormalizedTrendingToken> = new Map();
let globalListeners = new Set<() => void>();
let globalReconnectTimeout: NodeJS.Timeout | null = null;
let globalReconnectAttempt = 0;
let globalIsConnecting = false;
let globalIsConnected = false;
let globalRestFetched = false; // Track whether initial REST fetch was done

function notifyListeners() {
  globalListeners.forEach((fn) => fn());
}

// Phase 1: Fetch initial data via REST (fast, from Redis)
async function fetchRestSnapshot() {
  if (globalRestFetched && globalTokenMap.size > 0) return; // Already have data
  try {
    const url = `${getBaseUrl()}${DS_REST_PATH}`;
    isDev && console.log('[DexScreenerWS] Fetching initial data from REST:', url);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`REST ${resp.status}`);
    const data = await resp.json();
    if (Array.isArray(data) && data.length > 0) {
      globalTokenMap.clear();
      data.forEach((token: any) => {
        if (BLACKLISTED_TOKENS.has(token.mint)) return;
        globalTokenMap.set(token.mint, normalizeDexScreenerToken(token));
      });
      isDev && console.log(`[DexScreenerWS] REST loaded ${globalTokenMap.size} tokens`);
      saveDexScreenerCache(Array.from(globalTokenMap.values()));
      globalRestFetched = true;
      notifyListeners();
    }
  } catch (err) {
    console.warn('[DexScreenerWS] REST fetch failed (will rely on WS):', err);
  }
}

// Phase 2: Connect WebSocket for live updates
function connectDexScreenerWS() {
  if (globalIsConnecting) return;
  if (globalWs) {
    if (globalWs.readyState === WebSocket.OPEN) return;
    if (globalWs.readyState === WebSocket.CONNECTING) return;
    globalWs.close();
    globalWs = null;
  }

  globalIsConnecting = true;

  if (globalReconnectTimeout) {
    clearTimeout(globalReconnectTimeout);
    globalReconnectTimeout = null;
  }

  const wsUrl = `${getWsUrl()}${DS_WS_PATH}`;
  isDev && console.log('[DexScreenerWS] Connecting to:', wsUrl);

  try {
    const ws = new WebSocket(wsUrl);
    globalWs = ws;

    ws.onopen = () => {
      isDev && console.log('[DexScreenerWS] Connected');
      globalIsConnecting = false;
      globalIsConnected = true;
      globalReconnectAttempt = 0;
      notifyListeners();
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'snapshot') {
          const data = message.data;
          if (Array.isArray(data)) {
            globalTokenMap.clear();
            data.forEach((token: any) => {
              if (BLACKLISTED_TOKENS.has(token.mint)) return;
              globalTokenMap.set(token.mint, normalizeDexScreenerToken(token));
            });
            isDev && console.log(`[DexScreenerWS] Loaded ${globalTokenMap.size} tokens from WS snapshot`);
            saveDexScreenerCache(Array.from(globalTokenMap.values()));
          }
          notifyListeners();
        } else if (message.type === 'update') {
          const delta = message.data;
          let hasChanges = false;

          if (Array.isArray(delta?.added)) {
            delta.added.forEach((token: any) => {
              if (BLACKLISTED_TOKENS.has(token.mint)) return;
              globalTokenMap.set(token.mint, normalizeDexScreenerToken(token));
              hasChanges = true;
            });
          }

          if (Array.isArray(delta?.removed)) {
            delta.removed.forEach((mint: string) => {
              globalTokenMap.delete(mint);
              hasChanges = true;
            });
          }

          if (Array.isArray(delta?.updated)) {
            delta.updated.forEach((update: any) => {
              const mint = update.mint;
              if (!mint) return;
              if (BLACKLISTED_TOKENS.has(mint)) return;
              const existing = globalTokenMap.get(mint);
              if (existing) {
                globalTokenMap.set(mint, {
                  ...existing,
                  price_usd: update.price_usd ?? existing.price_usd,
                  priceUsd: update.price_usd ?? existing.priceUsd,
                  fully_diluted_value: update.fdv ?? update.market_cap_usd ?? existing.fully_diluted_value,
                  marketCapUsd: update.market_cap_usd ?? existing.marketCapUsd,
                  total_liquidity_usd: update.liquidity_usd ?? existing.total_liquidity_usd,
                  liquidityUsd: update.liquidity_usd ?? existing.liquidityUsd,
                  volume_5m: update.volume_5m ?? existing.volume_5m,
                  volume_1h: update.volume_1h ?? existing.volume_1h,
                  volume_6h: update.volume_6h ?? existing.volume_6h,
                  volume_24h: update.volume_24h ?? existing.volume_24h,
                  rank: update.rank ?? existing.rank,
                  total_buys_5m: update.total_buys_5m ?? existing.total_buys_5m,
                  total_sells_5m: update.total_sells_5m ?? existing.total_sells_5m,
                  total_buys_1h: update.total_buys_1h ?? existing.total_buys_1h,
                  total_sells_1h: update.total_sells_1h ?? existing.total_sells_1h,
                  total_buys_6h: update.total_buys_6h ?? existing.total_buys_6h,
                  total_sells_6h: update.total_sells_6h ?? existing.total_sells_6h,
                  total_buys_24h: update.total_buys_24h ?? existing.total_buys_24h,
                  total_sells_24h: update.total_sells_24h ?? existing.total_sells_24h,
                });
                hasChanges = true;
              }
            });
          }

          if (hasChanges) {
            notifyListeners();
          }
        }
        // Ignore "ping" messages
      } catch (err) {
        console.error('[DexScreenerWS] Error parsing message:', err);
      }
    };

    ws.onerror = () => {
      console.error('[DexScreenerWS] WebSocket error');
      globalIsConnecting = false;
    };

    ws.onclose = (event) => {
      isDev && console.log('[DexScreenerWS] Disconnected, code:', event.code);
      globalIsConnecting = false;
      globalIsConnected = false;
      globalWs = null;
      notifyListeners();

      // Exponential backoff reconnect
      if (globalListeners.size > 0 && globalReconnectAttempt < 5) {
        const delay = Math.min(1000 * Math.pow(2, globalReconnectAttempt), 30000);
        isDev && console.log(`[DexScreenerWS] Reconnecting in ${delay}ms (attempt ${globalReconnectAttempt + 1}/5)`);
        globalReconnectAttempt++;
        globalReconnectTimeout = setTimeout(() => {
          if (globalListeners.size > 0) {
            connectDexScreenerWS();
          }
        }, delay);
      }
    };
  } catch (err) {
    console.error('[DexScreenerWS] Connection error:', err);
    globalIsConnecting = false;
  }
}

function disconnectDexScreenerWS() {
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

/**
 * Hook for DexScreener trending tokens.
 * Phase 1: REST fetch for instant data (from Redis cache on server).
 * Phase 2: WebSocket for live delta updates.
 */
export function useDexScreenerTrending(enabled: boolean = true) {
  const [state, setState] = useState<DexScreenerTrendingState>(() => {
    // Check if global map already has data
    const existing = Array.from(globalTokenMap.values());
    if (existing.length > 0) {
      return { tokens: existing, loading: false, error: null, isConnected: globalIsConnected };
    }
    // Try localStorage cache
    const cached = loadDexScreenerCache();
    if (cached && cached.length > 0) {
      cached.forEach((t) => globalTokenMap.set(t.mint, t));
      return { tokens: cached, loading: false, error: null, isConnected: false };
    }
    return { tokens: [], loading: true, error: null, isConnected: false };
  });

  const mountedRef = useRef(true);

  const syncState = useCallback(() => {
    if (!mountedRef.current) return;
    const tokens = Array.from(globalTokenMap.values());
    tokens.sort((a, b) => {
      if (a.rank && b.rank) return a.rank - b.rank;
      return (b.fully_diluted_value || 0) - (a.fully_diluted_value || 0);
    });
    setState({
      tokens,
      loading: globalIsConnecting && tokens.length === 0,
      error: null,
      isConnected: globalIsConnected,
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    if (enabled) {
      globalListeners.add(syncState);

      // Phase 1: REST fetch for instant data
      fetchRestSnapshot();

      // Phase 2: WebSocket for live updates
      if (!globalWs || globalWs.readyState !== WebSocket.OPEN) {
        connectDexScreenerWS();
      } else {
        syncState();
      }
    }

    return () => {
      mountedRef.current = false;
      globalListeners.delete(syncState);
      if (globalListeners.size === 0) {
        isDev && console.log('[DexScreenerWS] No more listeners, disconnecting');
        disconnectDexScreenerWS();
      }
    };
  }, [enabled, syncState]);

  return state;
}

export default useDexScreenerTrending;
