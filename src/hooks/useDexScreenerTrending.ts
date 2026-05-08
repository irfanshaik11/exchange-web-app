import { useEffect, useRef, useState, useCallback } from "react";
import type { NormalizedTrendingToken } from "./useTrendingWebSocket";

const isDev = process.env.NODE_ENV !== "production";

// Derive URLs from environment (same env vars as the rest of the app)
function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_GO_SERVICE_URL || "";
}

function getWsUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_WEBSOCKET_URL ||
    process.env.NEXT_PUBLIC_GO_SERVICE_URL ||
    "";
  return base.replace(/^http/, "ws");
}

const DS_REST_PATH = "/v1/trending/dexscreener";
const DS_WS_PATH = "/v1/ws/trending/dexscreener";

// Cache key for localStorage persistence
const DS_CACHE_KEY = "dexscreener_trending_cache_v1";

// Blacklisted token addresses (stablecoins/wrapped tokens)
const BLACKLISTED_TOKENS = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  "tTLsJR5f2QYx6XDrQBcGJ25UaCGaJNTt33q5UYunt1J", // Blacklisted
  "7GxATsNMnaC88vdwd2t3mwrFuQwwGvmYPrUQ4D6FotXk",
  "98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g",
  "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4",
  "JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD", // Jupiter Perps USD
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // BONK
  "SNS8DJbHc34nKySHVhLGMUUE72ho6igvJaxtq9T3cX3", // SNS
  "pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn", // Pump protocol
  "METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL", // Meteora (MET)
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", // Raydium (RAY)
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", // Jupiter (JUP)
]);

function saveDexScreenerCache(tokens: NormalizedTrendingToken[]) {
  try {
    localStorage.setItem(
      DS_CACHE_KEY,
      JSON.stringify({ tokens, timestamp: Date.now() }),
    );
  } catch {}
}

// Restrict cached image URLs to http(s). localStorage is reachable from any
// JS that runs in the page (extensions, devtools, prior compromised session);
// without this guard a poisoned cache could put `data:` or other non-http
// schemes into <img src>. Empty string falls back to the placeholder.
function isSafeImageUrl(url: unknown): url is string {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

function loadDexScreenerCache(): NormalizedTrendingToken[] | null {
  try {
    const cached = localStorage.getItem(DS_CACHE_KEY);
    if (!cached) return null;
    const data = JSON.parse(cached);
    if (Date.now() - data.timestamp > 5 * 60 * 1000) return null; // 5-min TTL
    if (!Array.isArray(data.tokens)) return null;
    // Blacklist must be enforced on cache hydration too — REST and WS paths
    // already filter, this closes the only gap. Otherwise a token added to
    // the blacklist after a session was cached would still appear for up to
    // 5 minutes per user.
    return data.tokens
      .filter(
        (t: any) =>
          t &&
          typeof t.mint === "string" &&
          t.mint.length > 0 &&
          !BLACKLISTED_TOKENS.has(t.mint),
      )
      .map((t: any) => ({
        ...t,
        image_url: isSafeImageUrl(t.image_url) ? t.image_url : "",
        image: isSafeImageUrl(t.image) ? t.image : "",
        logo: isSafeImageUrl(t.logo) ? t.logo : "",
      }));
  } catch {
    return null;
  }
}

// Map DexScreener dex_id to launchpad_protocol for trade routing
function mapDexIdToProtocol(dexId: string): string {
  switch (dexId) {
    case "pumpfun":
      return "pump";
    case "pumpswap":
      return "pumpamm";
    case "raydium":
      return "raydium";
    case "meteora":
      return "meteora";
    case "orca":
      return "orca";
    default:
      return dexId || "";
  }
}

// Normalize a DexScreener token to NormalizedTrendingToken for InterstateTable
function normalizeDexScreenerToken(raw: any): NormalizedTrendingToken {
  const protocol = mapDexIdToProtocol(raw.dex_id || "");
  return {
    contractAddress: raw.mint || "",
    mint: raw.mint || "",
    name: raw.name || raw.symbol || "Unknown",
    symbol: raw.symbol || "",
    price_usd: raw.price_usd || 0,
    fully_diluted_value: raw.fdv || raw.market_cap_usd || 0,
    total_liquidity_usd: raw.liquidity_usd || 0,
    volume_1h: raw.volume_1h || 0,
    volume_5m: raw.volume_5m || 0,
    volume_6h: raw.volume_6h || 0,
    volume_24h: raw.volume_24h || 0,
    holder_count: 0,
    rank: raw.rank || 0,
    status: "ACTIVE",
    sniper_percent: 0,
    insider_percent: 0,
    top10_holders_percent: 0,
    bundle_percent: 0,
    image_url: raw.image_url || "",
    image: raw.image_url || "",
    logo: raw.image_url || "",
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
    // Per-TF price-change percentages. DexScreener payload uses `price_change_<tf>`;
    // the InterstateTable sparkline + percent-change cells read the legacy
    // `price_percent_change_<tf>` keys, so map both. Without this, the sparkline
    // fallback (when OHLCV is missing) defaults to "up/green" because 0 >= 0,
    // which is misleading for tokens that actually went sideways or down.
    price_percent_change_5m: raw.price_change_5m ?? raw.price_percent_change_5m ?? 0,
    price_percent_change_1h: raw.price_change_1h ?? raw.price_percent_change_1h ?? 0,
    price_percent_change_6h: raw.price_change_6h ?? raw.price_percent_change_6h ?? 0,
    price_percent_change_24h: raw.price_change_24h ?? raw.price_percent_change_24h ?? 0,
    launchpad_protocol: protocol,
    protocol: protocol,
    pair_address: raw.pair_address || "",
  };
}

// Server-side timeframe keys (matches WS payload). Distinct from the FE
// `Timeframe` union ("5m" | "1h" | ...) used by the Discover UI.
type TfKey = "M5" | "H1" | "H6" | "H24";
const TF_KEYS: TfKey[] = ["M5", "H1", "H6", "H24"];
const isTfKey = (x: unknown): x is TfKey =>
  typeof x === "string" && (TF_KEYS as readonly string[]).includes(x);

export type DexScreenerTokensByTimeframe = Record<
  TfKey,
  NormalizedTrendingToken[]
>;

interface DexScreenerTrendingState {
  tokens: NormalizedTrendingToken[];
  // Per-timeframe lists. Today the backend returns identical data in all four
  // (chromedp scraper falling back to legacy boost/profile API), so each entry
  // here is the same list; once BE returns real per-TF rankings, the hook
  // surfaces them without any FE change.
  tokensByTimeframe: DexScreenerTokensByTimeframe;
  loading: boolean;
  error: string | null;
  isConnected: boolean;
}

const emptyTokensByTimeframe = (): DexScreenerTokensByTimeframe => ({
  M5: [],
  H1: [],
  H6: [],
  H24: [],
});

// Singleton WebSocket connection (shared across all component mounts)
let globalWs: WebSocket | null = null;
let globalTokenMap: Map<string, NormalizedTrendingToken> = new Map();
let globalTokensByTF: DexScreenerTokensByTimeframe = emptyTokensByTimeframe();
let globalListeners = new Set<() => void>();
let globalReconnectTimeout: NodeJS.Timeout | null = null;
let globalReconnectAttempt = 0;
let globalIsConnecting = false;
let globalIsConnected = false;
let globalRestFetched = false; // Track whether initial REST fetch was done

function notifyListeners() {
  globalListeners.forEach((fn) => fn());
}

// Phase 1: Fetch initial data via REST (fast, from Redis).
// REST returns the legacy flat array. We mirror it into all 4 TF buckets so
// the UI has data immediately; the WS snapshot will replace these with real
// per-TF lists on connect (or keep mirroring them while BE returns identical
// data per timeframe).
async function fetchRestSnapshot() {
  if (globalRestFetched && globalTokenMap.size > 0) return; // Already have data
  try {
    const url = `${getBaseUrl()}${DS_REST_PATH}`;
    isDev &&
      console.log("[DexScreenerWS] Fetching initial data from REST:", url);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`REST ${resp.status}`);
    const data = await resp.json();
    if (Array.isArray(data) && data.length > 0) {
      globalTokenMap.clear();
      const flat: NormalizedTrendingToken[] = [];
      data.forEach((token: any) => {
        if (!token || !token.mint) return;
        if (BLACKLISTED_TOKENS.has(token.mint)) return;
        const norm = normalizeDexScreenerToken(token);
        flat.push(norm);
        globalTokenMap.set(token.mint, norm);
      });
      // Each TF bucket gets its own array; sharing one reference across
      // buckets would let a per-TF delta mutation bleed into every other TF
      // when BE returns real per-TF rankings.
      globalTokensByTF = {
        M5: [...flat],
        H1: [...flat],
        H6: [...flat],
        H24: [...flat],
      };
      isDev &&
        console.log(
          `[DexScreenerWS] REST loaded ${globalTokenMap.size} tokens (mirrored to all 4 TFs)`,
        );
      saveDexScreenerCache(Array.from(globalTokenMap.values()));
      globalRestFetched = true;
      notifyListeners();
    }
  } catch (err) {
    console.warn("[DexScreenerWS] REST fetch failed (will rely on WS):", err);
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
  isDev && console.log("[DexScreenerWS] Connecting to:", wsUrl);

  try {
    const ws = new WebSocket(wsUrl);
    globalWs = ws;

    ws.onopen = () => {
      isDev && console.log("[DexScreenerWS] Connected");
      globalIsConnecting = false;
      globalIsConnected = true;
      globalReconnectAttempt = 0;
      notifyListeners();
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === "snapshot") {
          // Server may send either:
          //   (a) flat array (legacy)
          //   (b) { M5, H1, H6, H24 } object (current shape — broadcaster.go)
          // Without the object branch, the snapshot is silently dropped and
          // the hook only ever populates from REST + delta updates.
          const data = message.data;
          globalTokenMap.clear();
          globalTokensByTF = emptyTokensByTimeframe();

          const ingestArray = (arr: any[], tf: TfKey | null) => {
            const list: NormalizedTrendingToken[] = [];
            arr.forEach((token: any) => {
              if (!token || !token.mint) return;
              if (BLACKLISTED_TOKENS.has(token.mint)) return;
              const norm = normalizeDexScreenerToken(token);
              list.push(norm);
              // Latest write wins for the flat map; per-TF arrays preserve
              // backend ordering for that timeframe.
              globalTokenMap.set(token.mint, norm);
            });
            if (tf) globalTokensByTF[tf] = list;
          };

          if (Array.isArray(data)) {
            ingestArray(data, null);
            // Mirror the flat list into every TF bucket so the UI has data
            // before BE returns real per-TF rankings. Each bucket gets its
            // own array so per-TF deltas don't bleed across timeframes.
            const flat = Array.from(globalTokenMap.values());
            TF_KEYS.forEach((k) => {
              globalTokensByTF[k] = [...flat];
            });
          } else if (data && typeof data === "object") {
            TF_KEYS.forEach((k) => {
              const arr = (data as Record<string, unknown>)[k];
              if (Array.isArray(arr)) ingestArray(arr, k);
            });
          }

          isDev &&
            console.log(
              `[DexScreenerWS] Snapshot: ${globalTokenMap.size} unique mints` +
                ` (M5:${globalTokensByTF.M5.length}` +
                ` H1:${globalTokensByTF.H1.length}` +
                ` H6:${globalTokensByTF.H6.length}` +
                ` H24:${globalTokensByTF.H24.length})`,
            );
          saveDexScreenerCache(Array.from(globalTokenMap.values()));
          notifyListeners();
        } else if (message.type === "update") {
          const delta = message.data;
          // `topic` identifies which TF this delta applies to (broadcaster.go
          // emits one update message per TF every 5s). When absent, we apply
          // to the flat map only.
          const topic: TfKey | null = isTfKey(message.topic)
            ? message.topic
            : null;
          let hasChanges = false;

          // Immutable bucket updates. We replace the bucket array with a new
          // reference rather than mutating in place so downstream `useMemo`
          // hooks (e.g. `dexScreenerTimeframeTokens` in discover.tsx) that
          // depend on `tokensByTimeframe` actually recompute. In-place
          // splice/push would leave the React state object reference unchanged.
          const replaceBucketAdd = (norm: NormalizedTrendingToken) => {
            const addIn = (k: TfKey) => {
              const list = globalTokensByTF[k];
              const idx = list.findIndex((t) => t.mint === norm.mint);
              globalTokensByTF[k] =
                idx >= 0
                  ? list.map((t, i) => (i === idx ? norm : t))
                  : [...list, norm];
            };
            if (!topic) {
              // Untyped delta — fan out so flat-mirror buckets stay consistent
              // (matches replaceBucketUpdate's behavior).
              TF_KEYS.forEach(addIn);
              return;
            }
            addIn(topic);
          };
          const replaceBucketRemove = (mint: string) => {
            const removeIn = (k: TfKey) => {
              const list = globalTokensByTF[k];
              if (list.some((t) => t.mint === mint)) {
                globalTokensByTF[k] = list.filter((t) => t.mint !== mint);
              }
            };
            if (!topic) {
              TF_KEYS.forEach(removeIn);
              return;
            }
            removeIn(topic);
          };
          const replaceBucketUpdate = (
            mint: string,
            updated: NormalizedTrendingToken,
          ) => {
            const replaceIn = (k: TfKey) => {
              const list = globalTokensByTF[k];
              const idx = list.findIndex((t) => t.mint === mint);
              if (idx >= 0) {
                globalTokensByTF[k] = list.map((t, i) =>
                  i === idx ? updated : t,
                );
              }
            };
            if (!topic) {
              // Untyped delta — update wherever the mint exists so flat-mirror
              // buckets stay consistent.
              TF_KEYS.forEach(replaceIn);
              return;
            }
            replaceIn(topic);
          };

          if (Array.isArray(delta?.added)) {
            delta.added.forEach((token: any) => {
              if (!token || !token.mint) return;
              if (BLACKLISTED_TOKENS.has(token.mint)) return;
              const norm = normalizeDexScreenerToken(token);
              globalTokenMap.set(token.mint, norm);
              replaceBucketAdd(norm);
              hasChanges = true;
            });
          }

          if (Array.isArray(delta?.removed)) {
            delta.removed.forEach((mint: string) => {
              if (!mint) return;
              globalTokenMap.delete(mint);
              replaceBucketRemove(mint);
              hasChanges = true;
            });
          }

          if (Array.isArray(delta?.updated)) {
            delta.updated.forEach((update: any) => {
              const mint = update?.mint;
              if (!mint) return;
              if (BLACKLISTED_TOKENS.has(mint)) return;
              const existing = globalTokenMap.get(mint);
              if (!existing) return;
              const merged: NormalizedTrendingToken = {
                ...existing,
                price_usd: update.price_usd ?? existing.price_usd,
                priceUsd: update.price_usd ?? existing.priceUsd,
                fully_diluted_value:
                  update.fdv ??
                  update.market_cap_usd ??
                  existing.fully_diluted_value,
                marketCapUsd: update.market_cap_usd ?? existing.marketCapUsd,
                total_liquidity_usd:
                  update.liquidity_usd ?? existing.total_liquidity_usd,
                liquidityUsd: update.liquidity_usd ?? existing.liquidityUsd,
                volume_5m: update.volume_5m ?? existing.volume_5m,
                volume_1h: update.volume_1h ?? existing.volume_1h,
                volume_6h: update.volume_6h ?? existing.volume_6h,
                volume_24h: update.volume_24h ?? existing.volume_24h,
                rank: update.rank ?? existing.rank,
                total_buys_5m: update.total_buys_5m ?? existing.total_buys_5m,
                total_sells_5m:
                  update.total_sells_5m ?? existing.total_sells_5m,
                total_buys_1h: update.total_buys_1h ?? existing.total_buys_1h,
                total_sells_1h:
                  update.total_sells_1h ?? existing.total_sells_1h,
                total_buys_6h: update.total_buys_6h ?? existing.total_buys_6h,
                total_sells_6h:
                  update.total_sells_6h ?? existing.total_sells_6h,
                total_buys_24h:
                  update.total_buys_24h ?? existing.total_buys_24h,
                total_sells_24h:
                  update.total_sells_24h ?? existing.total_sells_24h,
              };
              globalTokenMap.set(mint, merged);
              replaceBucketUpdate(mint, merged);
              hasChanges = true;
            });
          }

          if (hasChanges) {
            notifyListeners();
          }
        }
        // Ignore "ping" messages
      } catch (err) {
        console.error("[DexScreenerWS] Error parsing message:", err);
      }
    };

    ws.onerror = () => {
      console.error("[DexScreenerWS] WebSocket error");
      globalIsConnecting = false;
    };

    ws.onclose = (event) => {
      isDev && console.log("[DexScreenerWS] Disconnected, code:", event.code);
      globalIsConnecting = false;
      globalIsConnected = false;
      globalWs = null;
      notifyListeners();

      // Exponential backoff reconnect
      if (globalListeners.size > 0 && globalReconnectAttempt < 5) {
        const delay = Math.min(
          1000 * Math.pow(2, globalReconnectAttempt),
          30000,
        );
        isDev &&
          console.log(
            `[DexScreenerWS] Reconnecting in ${delay}ms (attempt ${globalReconnectAttempt + 1}/5)`,
          );
        globalReconnectAttempt++;
        globalReconnectTimeout = setTimeout(() => {
          if (globalListeners.size > 0) {
            connectDexScreenerWS();
          }
        }, delay);
      }
    };
  } catch (err) {
    console.error("[DexScreenerWS] Connection error:", err);
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
  // Allow REST to refetch on next reconnect; otherwise empty TF buckets can
  // persist if the WS snapshot is delayed after a reconnect cycle.
  globalRestFetched = false;
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
      return {
        tokens: existing,
        tokensByTimeframe: globalTokensByTF,
        loading: false,
        error: null,
        isConnected: globalIsConnected,
      };
    }
    // Try localStorage cache
    const cached = loadDexScreenerCache();
    if (cached && cached.length > 0) {
      cached.forEach((t) => globalTokenMap.set(t.mint, t));
      // Mirror cached flat list into TF buckets so UI has data on cold start.
      // Spread into independent arrays — see fetchRestSnapshot for rationale.
      globalTokensByTF = {
        M5: [...cached],
        H1: [...cached],
        H6: [...cached],
        H24: [...cached],
      };
      return {
        tokens: cached,
        tokensByTimeframe: globalTokensByTF,
        loading: false,
        error: null,
        isConnected: false,
      };
    }
    return {
      tokens: [],
      tokensByTimeframe: emptyTokensByTimeframe(),
      loading: true,
      error: null,
      isConnected: false,
    };
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
      // Shallow clone ensures consumers that depend on `tokensByTimeframe`
      // reference equality (e.g. useMemo in discover.tsx) see a new object
      // on every notify, even if no bucket array reference changed.
      tokensByTimeframe: { ...globalTokensByTF },
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
        isDev &&
          console.log("[DexScreenerWS] No more listeners, disconnecting");
        disconnectDexScreenerWS();
      }
    };
  }, [enabled, syncState]);

  return state;
}

export default useDexScreenerTrending;
