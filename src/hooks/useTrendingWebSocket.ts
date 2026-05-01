import { useEffect, useRef, useState, useCallback } from 'react';

const isDev = process.env.NODE_ENV !== 'production';

// Derive WebSocket URL from environment
function getTrendingWsUrl(): string {
  const base = process.env.NEXT_PUBLIC_WEBSOCKET_URL || process.env.NEXT_PUBLIC_GO_SERVICE_URL || '';
  return base.replace(/^http/, 'ws') + '/v1/ws/trending';
}

// Cache key and version for localStorage persistence
const TRENDING_CACHE_KEY = 'trending_ws_cache';
const TRENDING_CACHE_VERSION = 'v3'; // Bumped to invalidate caches that contained established tokens (TRUMP/PENGU/USD1)

// Maximum token age allowed on the memecoin trending feed.
// The backend sometimes ranks established/major tokens (TRUMP at 465d, PENGU at 153d,
// USD1 at 120d) into the snapshot, which crowds out genuinely-trending fresh memes
// and visibly diverges from GMGN/Axiom trending. Cap at 7 days — wide enough that any
// legitimately-rising new token still appears, narrow enough to drop the outliers.
const MAX_TRENDING_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Trending snapshot cache TTL in localStorage. Keep short — the WS reconnects
// quickly on page load, so the cache is just a smooth-paint hedge, not a source
// of truth. Longer windows risk showing stale prices/volumes during reconnect.
const TRENDING_CACHE_TTL_MS = 5 * 60 * 1000;

// Blacklisted token addresses - these will never be shown in trending
// These are stablecoins and wrapped tokens that shouldn't appear in memecoin trending
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
    const cacheAge = Date.now() - cacheData.timestamp;
    if (cacheAge > TRENDING_CACHE_TTL_MS) return null;

    // Defense-in-depth: re-filter any tokens that aged past the trending window
    // while sitting in the cache (snapshot writer also filters before saving).
    const tokens: NormalizedTrendingToken[] = Array.isArray(cacheData.tokens) ? cacheData.tokens : [];
    return tokens.filter(t => !isTooOldForTrending(t));
  } catch (err) {
    return null;
  }
}

// Helper to check if a token is blacklisted
function isBlacklisted(mint: string): boolean {
  return BLACKLISTED_TOKENS.has(mint);
}

// Helper to check if a token is too old for the memecoin trending feed.
// Accepts ISO strings ("2026-04-29T04:27:45Z") or numeric epoch (seconds or ms).
// If `created_at` is missing/unparseable, returns false (don't filter — be conservative).
function isTooOldForTrending(token: { created_at?: string | number; createdAt?: string | number }): boolean {
  const raw = token.created_at ?? token.createdAt;
  if (raw === undefined || raw === null || raw === '') return false;
  const parsed = typeof raw === 'number' ? raw : Date.parse(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return false;
  // Some backends emit unix seconds; coerce anything < 1e12 (~Sep 2001 in ms) to ms.
  const tsMs = parsed < 1e12 ? parsed * 1000 : parsed;
  return Date.now() - tsMs > MAX_TRENDING_AGE_MS;
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
  // Price % change per timeframe (Price % column)
  price_percent_change_5m?: number;
  price_percent_change_1h?: number;
  price_percent_change_6h?: number;
  price_percent_change_24h?: number;
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

// Resolve a price-change percentage for a token in a given timeframe slot.
// The trending feed groups tokens by timeframe (snapshot.{5m,1h,6h}), and the
// upstream Codex format emits a single `change` field per token whose meaning
// is implied by which array it came from. `change` is a fraction (0.05 = 5%),
// so we multiply by 100. Per-timeframe explicit fields take precedence when
// present.
function pickPriceChangePct(
  raw: any,
  slotTimeframe: '5m' | '1h' | '6h' | '24h',
  rawTimeframe?: TrendingTimeframe,
): number | undefined {
  const explicit =
    raw[`price_percent_change_${slotTimeframe}`] ??
    raw[`price_change_${slotTimeframe}`] ??
    raw[`priceChange${slotTimeframe}`] ??
    raw[`change_${slotTimeframe}`];
  if (explicit !== undefined && explicit !== null && explicit !== '') {
    const n = typeof explicit === 'number' ? explicit : parseFloat(explicit);
    if (Number.isFinite(n)) return n;
  }
  // Fall back to the single `change` field only for the slot that matches the
  // bucket this token came from — populating other slots from it would be wrong.
  if (rawTimeframe === slotTimeframe) {
    const single = raw.change ?? raw.priceChange ?? raw.price_change;
    if (single !== undefined && single !== null && single !== '') {
      const n = typeof single === 'number' ? single : parseFloat(single);
      if (Number.isFinite(n)) {
        // Fraction (e.g. 0.05) → percentage. Values already in percentage units
        // (|n| > 1) are passed through unchanged.
        return Math.abs(n) <= 1 ? n * 100 : n;
      }
    }
  }
  return undefined;
}

// Normalize token data from WebSocket to match InterstateTable format
function normalizeToken(raw: any, timeframe?: TrendingTimeframe): NormalizedTrendingToken {
  return {
    contractAddress: raw.mint || raw.contractAddress || '',
    mint: raw.mint || raw.contractAddress || '',
    name: raw.name || raw.symbol || 'Unknown',
    symbol: raw.symbol || raw.ticker || '',
    price_usd: raw.price_usd || raw.priceUsd || 0,
    fully_diluted_value: raw.market_cap_usd || raw.marketCapUsd || raw.fully_diluted_value || 0,
    total_liquidity_usd: raw.liquidity_usd || raw.liquidityUsd || raw.total_liquidity_usd || 0,
    // Per-timeframe volume comes from the backend's per-window fields.
    // Do NOT fall back to volume_usd: that's the Redis sorted-set score (used
    // for ranking) and is NOT timeframe-specific. Falling through to it
    // collapses all four timeframes to the same arbitrary number. If the
    // backend omits a window (omitempty when value is 0), default to 0 — that
    // accurately means "no activity in this window."
    volume_5m: raw.volume_5m ?? 0,
    volume_1h: raw.volume_1h ?? 0,
    volume_6h: raw.volume_6h ?? 0,
    volume_24h: raw.volume_24h ?? 0,
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
    // Price % change per timeframe (Price % column). Backend may send explicit
    // per-window fields, or a single Codex `change` field whose timeframe is
    // implied by which array (`timeframe` arg) the token came from. See
    // pickPriceChangePct for details.
    price_percent_change_5m: pickPriceChangePct(raw, '5m', timeframe) ?? 0,
    price_percent_change_1h: pickPriceChangePct(raw, '1h', timeframe) ?? 0,
    price_percent_change_6h: pickPriceChangePct(raw, '6h', timeframe) ?? 0,
    price_percent_change_24h: pickPriceChangePct(raw, '24h', timeframe) ?? 0,
    // Transaction counts for TXNS column. Server has historically used several
    // shapes for these fields (total_buys_5m, buys_5m, buyCount5m, total_buyers_5m
    // for unique buyers, etc.) — read from each so the trending feed reliably
    // populates the column regardless of which backend variant is live.
    total_buys_5m:
      raw.total_buys_5m ?? raw.buys_5m ?? raw.buyCount5m ?? raw.total_buyers_5m ?? 0,
    total_sells_5m:
      raw.total_sells_5m ?? raw.sells_5m ?? raw.sellCount5m ?? raw.total_sellers_5m ?? 0,
    total_buys_1h:
      raw.total_buys_1h ?? raw.buys_1h ?? raw.buyCount1 ?? raw.total_buyers_1h ?? 0,
    total_sells_1h:
      raw.total_sells_1h ?? raw.sells_1h ?? raw.sellCount1 ?? raw.total_sellers_1h ?? 0,
    total_buys_6h:
      raw.total_buys_6h ?? raw.buys_6h ?? raw.buyCount6 ?? raw.buyCount4 ?? raw.total_buyers_6h ?? 0,
    total_sells_6h:
      raw.total_sells_6h ?? raw.sells_6h ?? raw.sellCount6 ?? raw.sellCount4 ?? raw.total_sellers_6h ?? 0,
    total_buys_24h:
      raw.total_buys_24h ?? raw.buys_24h ?? raw.buyCount24 ?? raw.total_buyers_24h ?? 0,
    total_sells_24h:
      raw.total_sells_24h ?? raw.sells_24h ?? raw.sellCount24 ?? raw.total_sellers_24h ?? 0,
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
    isDev && console.log('[TrendingWS] Already connecting, skipping');
    return;
  }

  // Check if WebSocket exists and is either OPEN or CONNECTING
  if (globalWs) {
    if (globalWs.readyState === WebSocket.OPEN) {
      isDev && console.log('[TrendingWS] Already connected, skipping');
      return;
    }
    if (globalWs.readyState === WebSocket.CONNECTING) {
      isDev && console.log('[TrendingWS] Connection in progress, skipping');
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
  const wsUrl = getTrendingWsUrl();
  isDev && console.log('[TrendingWS] Connecting to:', wsUrl);

  try {
    const ws = new WebSocket(wsUrl);
    globalWs = ws;

    ws.onopen = () => {
      isDev && console.log('[TrendingWS] Connected');
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
                // Skip established tokens older than the trending window
                if (isTooOldForTrending(token)) {
                  filteredCount++;
                  return;
                }
                const normalized = normalizeToken(token);
                globalTokenMaps[tf].set(normalized.mint, normalized);
              });
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
                  // Prefer per-timeframe volume_1h over the legacy volume_usd score
                  // (matches normalizeToken; see comment there).
                  volume_1h: update.volume_1h ?? update.volume_usd ?? existing.volume_1h,
                  volume_5m: update.volume_5m ?? existing.volume_5m,
                  volume_6h: update.volume_6h ?? existing.volume_6h,
                  bundle_percent: update.bundle_percent ?? existing.bundle_percent,
                  top10_holders_percent: update.top10_holders_percent ?? existing.top10_holders_percent,
                  sniper_percent: update.sniper_percent ?? existing.sniper_percent,
                  insider_percent: update.insider_percent ?? existing.insider_percent,
                  // Price % change. Use the same resolver as snapshot/added so the
                  // Codex single-`change` field path works on incremental updates.
                  // `topic` carries which timeframe bucket this update belongs to.
                  // pickPriceChangePct returns undefined when the field is absent
                  // from the update, so `??` correctly preserves existing on partial
                  // updates while still allowing a real 0% to overwrite.
                  price_percent_change_5m:
                    pickPriceChangePct(update, '5m', topic) ?? existing.price_percent_change_5m,
                  price_percent_change_1h:
                    pickPriceChangePct(update, '1h', topic) ?? existing.price_percent_change_1h,
                  price_percent_change_6h:
                    pickPriceChangePct(update, '6h', topic) ?? existing.price_percent_change_6h,
                  price_percent_change_24h:
                    pickPriceChangePct(update, '24h', topic) ?? existing.price_percent_change_24h,
                  // Transaction counts (try every known field-name variant the
                  // backend has used so partial updates still reflect in the UI).
                  total_buys_5m:
                    update.total_buys_5m ?? update.buys_5m ?? update.buyCount5m ?? update.total_buyers_5m ?? existing.total_buys_5m,
                  total_sells_5m:
                    update.total_sells_5m ?? update.sells_5m ?? update.sellCount5m ?? update.total_sellers_5m ?? existing.total_sells_5m,
                  total_buys_1h:
                    update.total_buys_1h ?? update.buys_1h ?? update.buyCount1 ?? update.total_buyers_1h ?? existing.total_buys_1h,
                  total_sells_1h:
                    update.total_sells_1h ?? update.sells_1h ?? update.sellCount1 ?? update.total_sellers_1h ?? existing.total_sells_1h,
                  total_buys_6h:
                    update.total_buys_6h ?? update.buys_6h ?? update.buyCount6 ?? update.buyCount4 ?? update.total_buyers_6h ?? existing.total_buys_6h,
                  total_sells_6h:
                    update.total_sells_6h ?? update.sells_6h ?? update.sellCount6 ?? update.sellCount4 ?? update.total_sellers_6h ?? existing.total_sells_6h,
                  total_buys_24h:
                    update.total_buys_24h ?? update.buys_24h ?? update.buyCount24 ?? update.total_buyers_24h ?? existing.total_buys_24h,
                  total_sells_24h:
                    update.total_sells_24h ?? update.sells_24h ?? update.sellCount24 ?? update.total_sellers_24h ?? existing.total_sells_24h,
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
                // Skip established tokens older than the trending window
                if (isTooOldForTrending(token)) return;
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
      isDev && console.log('[TrendingWS] Disconnected, code:', event.code);
      globalIsConnecting = false;
      globalIsConnected = false;
      globalWs = null;
      notifyListeners();

      // Reconnect with exponential backoff if we have listeners
      if (globalListeners.size > 0 && globalReconnectAttempt < 5) {
        const delay = Math.min(1000 * Math.pow(2, globalReconnectAttempt), 30000);
        isDev && console.log(`[TrendingWS] Reconnecting in ${delay}ms (attempt ${globalReconnectAttempt + 1}/5)`);
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
        isDev && console.log('[TrendingWS] No more listeners, disconnecting (keeping cached data)');
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
