import type { NextApiRequest, NextApiResponse } from "next";

// TEMPORARY: Geckoterminal proxy that fills the OHLCV gap for
// DexScreener-trending tokens our token-service indexer doesn't yet cover
// (mostly newly-trending pump.fun mints). Remove once the BE chromedp
// scraper fix lands and token-service OHLCV covers these mints — at that
// point this whole file becomes dead code (MiniSparkline's primary fetch
// will succeed and the fallback never fires). Tracking gating ticket
// alongside the dexscreener_trending.go chromedp + Dockerfile chromium
// install fix.

// FE timeframe → Geckoterminal OHLCV endpoint shape. Density tuned to
// match Trending's TIMEFRAME_CONFIG (~60-96 candle closes per sparkline)
// so the resulting polyline reads as a real chart, not a smooth curve.
// Reference: Trending uses 1m×60 (1h), 5m×72 (6h), 30m×48 (24h). We can't
// match the 1s candles Trending uses for 5m (Geckoterminal min resolution
// is 1m), so we widen the 5m window to give 60 1-min candles instead of 5.
const TIMEFRAME_TO_GT: Record<
  string,
  { period: "minute" | "hour" | "day"; aggregate: number; limit: number }
> = {
  "5m": { period: "minute", aggregate: 1, limit: 60 }, // 60 × 1m = 1h context
  "1h": { period: "minute", aggregate: 1, limit: 60 }, // 60 × 1m = 1h
  "6h": { period: "minute", aggregate: 5, limit: 72 }, // 72 × 5m = 6h
  "24h": { period: "minute", aggregate: 15, limit: 96 }, // 96 × 15m = 24h
};

const GT_BASE = "https://api.geckoterminal.com/api/v2/networks/solana/pools";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — Geckoterminal caches 30s
const RETRY_DELAY_MS = 1500;

interface CacheEntry {
  payload: { success: boolean; data?: { items: OhlcvItem[] }; reason?: string };
  expiresAt: number;
}

interface OhlcvItem {
  unix_time: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v_usd: number;
}

interface GeckoOhlcvResponse {
  data?: { attributes?: { ohlcv_list?: number[][] } };
}

// Module-level cache + in-flight dedupe. Survives between API invocations
// while the serverless function stays warm; cold starts get a fresh map
// (Geckoterminal handles a single cold-start request fine).
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<CacheEntry["payload"]>>();

// Per-IP rate limit — proxy fans out to Geckoterminal's free tier
// (30 req/min/IP at the upstream). Without a client-side ceiling an
// anonymous flood with distinct pair addresses would burn through the
// upstream budget. Sliding-window counter, 60s window, 60 req/IP/min.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const ipHits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = (ipHits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (bucket.length >= RATE_LIMIT_MAX) {
    ipHits.set(ip, bucket);
    return true;
  }
  bucket.push(now);
  ipHits.set(ip, bucket);
  // Evict cold IPs every ~50 calls so the map doesn't grow unbounded
  if (ipHits.size > 500 && Math.random() < 0.02) {
    for (const [k, v] of ipHits) {
      if (v.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) ipHits.delete(k);
    }
  }
  return false;
}

async function fetchUpstream(
  pair: string,
  tf: (typeof TIMEFRAME_TO_GT)[string],
): Promise<CacheEntry["payload"]> {
  const url =
    `${GT_BASE}/${encodeURIComponent(pair)}/ohlcv/${tf.period}` +
    `?aggregate=${tf.aggregate}&limit=${tf.limit}`;

  // One retry on 429 — Geckoterminal's rate limiter clears within ~2s
  // when traffic stops, so a single backoff usually unblocks us.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    let upstream: Response;
    try {
      upstream = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      });
    } catch (err) {
      if (attempt === 1) {
        return {
          success: false,
          reason: err instanceof Error ? err.message : "fetch_failed",
        };
      }
      continue;
    }

    if (upstream.status === 429 && attempt === 0) continue; // retry once
    if (!upstream.ok) {
      return { success: false, reason: `upstream ${upstream.status}` };
    }

    const json = (await upstream.json()) as GeckoOhlcvResponse;
    const rows = json.data?.attributes?.ohlcv_list ?? [];

    // Geckoterminal payload row: [unix_ts, open, high, low, close, volume]
    // Newest-first; reverse so MiniSparkline's chronological render works.
    // Filter short rows defensively — typed as number[][] but if upstream
    // ever returns a malformed row, indexed access would yield undefined
    // and propagate NaN into the sparkline.
    const items: OhlcvItem[] = rows
      .filter((row) => Array.isArray(row) && row.length >= 6)
      .map((row) => ({
        unix_time: row[0],
        o: row[1],
        h: row[2],
        l: row[3],
        c: row[4],
        v_usd: row[5],
      }))
      .reverse();

    return { success: true, data: { items } };
  }

  return { success: false, reason: "exhausted_retries" };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Per-IP rate limit before any work — anonymous flood with distinct
  // pair addresses would otherwise burn through Geckoterminal's free tier.
  // Trusts the first IP in X-Forwarded-For (Vercel sets it correctly),
  // falls back to socket address.
  const xff = req.headers["x-forwarded-for"];
  const xffStr = Array.isArray(xff) ? xff[0] : xff;
  const ip = (xffStr ?? "").split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  if (rateLimited(ip)) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "rate limited" });
  }

  const pair = String(req.query.pair_address || "");
  const timeframe = String(req.query.timeframe || "24h");

  // Solana pair addresses are base58, 32-44 chars. Reject anything else
  // before fanning out — keeps the proxy from being a generic SSRF amplifier.
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(pair)) {
    return res.status(400).json({ error: "invalid pair_address" });
  }

  const tf = TIMEFRAME_TO_GT[timeframe] ?? TIMEFRAME_TO_GT["24h"];
  const key = `${pair}|${timeframe}`;

  // Hit cache if fresh.
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader(
      "Cache-Control",
      "public, max-age=30, s-maxage=300, stale-while-revalidate=300",
    );
    res.setHeader("X-Cache", "HIT");
    return res.status(200).json(cached.payload);
  }

  // In-flight dedupe — multiple concurrent requests for the same key share
  // a single upstream fetch. Prevents 110 sparkline rows from each hitting
  // Geckoterminal when a tab first loads.
  let pending = inFlight.get(key);
  let cacheStatus = "MISS";
  if (!pending) {
    cacheStatus = "MISS";
    pending = fetchUpstream(pair, tf).finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, pending);
  } else {
    cacheStatus = "DEDUPED";
  }

  const payload = await pending;

  // Cache successful responses for the full TTL; cache failures briefly
  // so we don't hammer upstream while it's degraded.
  cache.set(key, {
    payload,
    expiresAt: Date.now() + (payload.success ? CACHE_TTL_MS : 30_000),
  });

  res.setHeader(
    "Cache-Control",
    payload.success
      ? "public, max-age=30, s-maxage=300, stale-while-revalidate=300"
      : "public, max-age=10, s-maxage=30",
  );
  res.setHeader("X-Cache", cacheStatus);
  return res.status(200).json(payload);
}
