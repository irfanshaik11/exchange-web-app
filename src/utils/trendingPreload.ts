/**
 * Trending background preload — warms token avatars and sparkline OHLC data
 * BEFORE the user opens /discover, mirroring the Pulse-page pattern where
 * images are preloaded into the module-level retained-bitmap cache as data
 * arrives (see PulseTable's preloadTokenImages + FastImage's prewarm path).
 *
 * Called from TrendingBackgroundLoader (app root): trending token DATA is
 * already kept hot globally there, but images/sparklines previously only
 * started loading when each row mounted — that per-row network round-trip on
 * a cold /discover visit is exactly the pop-in users see.
 */

import { isMetadataUrl } from "./images";
import { computeHashImageUrl } from "./imageHash";
import { preloadImages } from "./imagePreloader";

// ─── Avatar preload ───────────────────────────────────────────────────────────

interface PreloadableToken {
  mint?: string;
  contractAddress?: string;
  address?: string;
  uri?: string;
  image_url?: string;
  image?: string;
  logo?: string;
}

/**
 * Derive the EXACT URL InterstateTable's TokenAvatar will render for this
 * token, so the preload warms the same proxy URL (byte-identical → HTTP cache
 * + retained-bitmap cache hit on first row paint).
 *
 * Mirrors TokenAvatar's imgSrc derivation for a cold mount:
 *   - metadata-JSON `uri` → proxy auto-resolve URL (branch 3)
 *   - else image_url || image || logo || non-metadata uri → proxy URL (branch 4)
 * (Branch 1, useTokenMetadata's resolved image, is a second-phase upgrade the
 * background can't anticipate — by then the row is already painted.)
 */
export function deriveTrendingAvatarUrl(
  token: PreloadableToken | null | undefined,
): string | null {
  if (!token || typeof token !== "object") return null;

  const rawUri = typeof token.uri === "string" ? token.uri : "";
  if (rawUri && isMetadataUrl(rawUri)) {
    return computeHashImageUrl(rawUri);
  }

  // Past the early return, rawUri is either empty or a direct (non-metadata)
  // image URL — equivalent to TokenAvatar's `safeUri`.
  const raw = token.image_url || token.image || token.logo || rawUri;
  if (!raw || typeof raw !== "string") return null;
  return computeHashImageUrl(raw);
}

/**
 * Preload avatars for the top tokens of a board. Fire-and-forget; the
 * underlying preloadImage dedupes per-URL globally and retains decoded
 * bitmaps in the module LRU (imageObjectCache), which TokenAvatar's
 * synchronous prewarm check reads at mount.
 */
export function preloadTrendingImages(
  tokens: PreloadableToken[],
  options: {
    limit?: number;
    maxConcurrent?: number;
    priority?: "high" | "low" | "auto";
  } = {},
): void {
  const { limit = 50, maxConcurrent = 8, priority = "auto" } = options;
  const urls = tokens
    .slice(0, limit)
    .map(deriveTrendingAvatarUrl)
    .filter((url): url is string => Boolean(url));
  if (urls.length === 0) return;
  preloadImages(urls, { maxConcurrent, priority }).catch(() => {});
}

// ─── Sparkline prefetch ───────────────────────────────────────────────────────

// Single source of truth for the per-timeframe sparkline windows — shared by
// MiniSparkline (InterstateTable) and the background prefetch so cache entries
// are interchangeable.
export const TIMEFRAME_CONFIG: Record<
  string,
  { windowSec: number; interval: string; label: string }
> = {
  "1m": { windowSec: 60, interval: "1s", label: "1M" }, // ~60 candles
  "5m": { windowSec: 5 * 60, interval: "1s", label: "5M" }, // ~300 candles
  "30m": { windowSec: 1800, interval: "1m", label: "30M" }, // ~30 candles
  "1h": { windowSec: 60 * 60, interval: "1m", label: "1H" }, // ~60 candles
};

// Cache keyed by `${mint}|${timeframe}` so switching timeframes doesn't reuse
// stale data, and going back doesn't re-hit the API for ~5 min. Shared between
// the background prefetch (writer) and MiniSparkline (reader + writer).
export const sparklineCache = new Map<
  string,
  { data: number[]; priceChange: number; ts: number }
>();
export const SPARKLINE_CACHE_TTL_MS = 5 * 60 * 1000;

// In-flight guard so a WS push mid-prefetch doesn't double-fetch the same key.
const inFlightSparklines = new Set<string>();

// Background-only negative cache: keys whose PRIMARY fetch came back empty
// (or errored/timed out). Empty results are deliberately not written to
// sparklineCache (that would short-circuit the row's Geckoterminal fallback),
// but without remembering them here the background loop would re-poll the same
// un-indexed / degraded tokens every prefetch cycle. Rows are unaffected —
// they never read this map.
const primaryEmptyAt = new Map<string, number>();
const PRIMARY_EMPTY_RETRY_MS = 5 * 60 * 1000;
const PRIMARY_EMPTY_MAX = 500;

// Per-fetch timeout for background OHLC warms. Matches the OHLC API route's own
// upstream budget; bounds a hung endpoint so the sequential sweep can't stall.
const BACKGROUND_FETCH_TIMEOUT_MS = 8000;

// Record a key in the negative cache and keep the map bounded. Evicts expired
// entries first whenever the cap is exceeded, so a long churny session can't
// grow it without limit (worst case ≈ cap + one batch of fresh entries).
function markPrimaryEmpty(key: string): void {
  if (primaryEmptyAt.size >= PRIMARY_EMPTY_MAX) {
    const cutoff = Date.now() - PRIMARY_EMPTY_RETRY_MS;
    for (const [k, ts] of primaryEmptyAt) {
      if (ts < cutoff) primaryEmptyAt.delete(k);
    }
  }
  primaryEmptyAt.set(key, Date.now());
}

function extractCloses(result: unknown): number[] {
  const r = result as {
    success?: boolean;
    data?: { items?: Array<{ c?: unknown }> };
  };
  if (!r?.success || !Array.isArray(r?.data?.items)) return [];
  return r.data.items
    .map((item) => Number(item.c))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * Prefetch sparkline OHLC for the top tokens of a board into sparklineCache,
 * so MiniSparkline's cache check hits on first mount instead of firing a
 * per-row fetch chain (primary + up to 800ms jittered Geckoterminal fallback).
 *
 * Background prefetch hits ONLY our own token-service endpoint — never the
 * Geckoterminal fallback (30 req/min/IP limit is reserved for rows the user
 * is actually looking at). Empty results are NOT cached: caching them would
 * short-circuit the row's fallback chain and regress un-indexed tokens.
 */
export async function prefetchSparklines(
  tokens: PreloadableToken[],
  timeframe: string,
  options: { limit?: number; maxConcurrent?: number } = {},
): Promise<void> {
  const { limit = 20, maxConcurrent = 4 } = options;
  const tfConfig = TIMEFRAME_CONFIG[timeframe] || TIMEFRAME_CONFIG["1h"]!;

  const candidates = tokens
    .slice(0, limit)
    .map((t) => t?.mint || t?.contractAddress || t?.address || "")
    .filter((mint) => {
      if (!mint) return false;
      const key = `${mint}|${timeframe}`;
      if (inFlightSparklines.has(key)) return false;
      const emptyAt = primaryEmptyAt.get(key);
      if (emptyAt && Date.now() - emptyAt < PRIMARY_EMPTY_RETRY_MS)
        return false;
      const cached = sparklineCache.get(key);
      return !(cached && Date.now() - cached.ts < SPARKLINE_CACHE_TTL_MS);
    });

  for (let i = 0; i < candidates.length; i += maxConcurrent) {
    const batch = candidates.slice(i, i + maxConcurrent);
    await Promise.allSettled(
      batch.map(async (mint) => {
        const key = `${mint}|${timeframe}`;
        inFlightSparklines.add(key);
        try {
          const now = Math.floor(Date.now() / 1000);
          const fromSec = now - tfConfig.windowSec;
          // Bound each background fetch — without a timeout a hung/degraded
          // OHLC endpoint would hold the in-flight slot (and the sequential
          // board sweep) open indefinitely, letting throttled cycles pile up.
          // 8s matches the row's own fetch budget. The row remains the source
          // of truth, so a timed-out warm just falls through to negative-cache.
          const res = await fetch(
            `/api/token-service/ohlc?mint=${mint}&interval=${tfConfig.interval}&from=${fromSec}&to=${now}`,
            { signal: AbortSignal.timeout(BACKGROUND_FETCH_TIMEOUT_MS) },
          );
          if (!res.ok) {
            markPrimaryEmpty(key);
            return;
          }
          const closes = extractCloses(await res.json());
          // Only cache real curves (same >=5 threshold MiniSparkline uses for
          // "renderable data"). See doc comment for why empties stay uncached.
          if (closes.length >= 5) {
            const firstPrice = closes[0] || 0;
            const lastPrice = closes[closes.length - 1] || 0;
            const change =
              firstPrice > 0
                ? ((lastPrice - firstPrice) / firstPrice) * 100
                : 0;
            sparklineCache.set(key, {
              data: closes,
              priceChange: change,
              ts: Date.now(),
            });
            primaryEmptyAt.delete(key);
          } else {
            markPrimaryEmpty(key);
          }
        } catch {
          // Fire-and-forget — row fetch chain remains the source of truth.
          // Still back this key off (timeout / network error / parse fail) so
          // a degraded endpoint isn't re-polled every cycle for the whole
          // session; the retry window expires after PRIMARY_EMPTY_RETRY_MS.
          markPrimaryEmpty(key);
        } finally {
          inFlightSparklines.delete(key);
        }
      }),
    );
  }
}
