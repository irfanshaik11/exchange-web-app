/**
 * Shared token-avatar resolver for the wallet-scan surfaces.
 *
 * Resolution pipeline per mint (first hit wins, validated where cheap):
 *   1. raw indexer URL when it's a direct image    → proxy
 *   2. raw indexer URL when it's a metadata JSON   → resolve → proxy
 *   3. token-service metadata (image_url/uri)      → resolve → proxy
 *      — speculative cdn.interstate.so URLs are DISCARDED (403 unwarmed)
 *   4. pump.fun registry (browser-only; CF blocks servers)   → probe → proxy
 *   5. DexScreener token CDN                                  → probe → proxy
 *
 * Results persist to localStorage (the "disk cache"): a resolved avatar is a
 * pure function of the mint, so it's valid across reloads — 7-day TTL, capped.
 * Failures retry after a short TTL instead of poisoning the session.
 */

import { computeHashImageUrl } from "~/utils/imageHash";
import {
  isMetadataUrl,
  normalizeImageUrl,
  resolveMetadataImage,
} from "~/utils/images";
import {
  fetchChainTokenMetadata,
  fetchPumpfunImage,
} from "~/utils/tokenMetadata";

const PERSIST_KEY = "__wscan_img_v1";
// mint→image is immutable on-chain, so successes are effectively valid forever;
// 90d TTL is just hygiene against the LRU cap churning ancient entries.
const PERSIST_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const CACHE_MAX = 1500;
const FAILURE_RETRY_MS = 60_000;

type Entry = { url: string | null; ts: number };
const cache = new Map<string, Entry>();

// Hydrate from localStorage at module init.
if (typeof window !== "undefined") {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (raw) {
      const now = Date.now();
      for (const [mint, e] of JSON.parse(raw) as [string, Entry][]) {
        // Persist only successes; age out stale ones.
        if (e?.url && now - e.ts < PERSIST_TTL_MS) cache.set(mint, e);
      }
    }
  } catch {
    /* corrupted — start clean */
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist() {
  if (typeof window === "undefined" || persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const entries = [...cache.entries()]
        .filter(([, e]) => e.url) // successes only
        .sort((a, b) => b[1].ts - a[1].ts)
        .slice(0, CACHE_MAX);
      localStorage.setItem(PERSIST_KEY, JSON.stringify(entries));
    } catch {
      /* quota — in-memory cache still works */
    }
  }, 2000);
}

function setEntry(mint: string, url: string | null) {
  if (cache.size >= CACHE_MAX * 2) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(mint, { url, ts: Date.now() });
  if (url) schedulePersist();
}

/**
 * Synchronous cache read. `string` = resolved URL, `null` = known-missing
 * (recent failure), `undefined` = not yet attempted (or failure TTL expired).
 */
export function getCachedScanImage(mint: string): string | null | undefined {
  const e = cache.get(mint);
  if (!e) return undefined;
  if (e.url === null && Date.now() - e.ts > FAILURE_RETRY_MS) return undefined;
  return e.url;
}

/** Load an image URL in the browser; true iff it actually renders. */
function probeImage(src: string): Promise<boolean> {
  return new Promise((res) => {
    if (typeof window === "undefined") return res(false);
    const img = new Image();
    img.onload = () => res(true);
    img.onerror = () => res(false);
    img.src = src;
  });
}

// NOTE: there is deliberately NO client-side Helius DAS leg. On-chain (DAS)
// resolution for no-URI mints happens ONCE, server-side, in the token
// service's image-backfill worker, which writes the result into tokens.image.
// The first viewer of such a mint sees a letter tile briefly; the server heal
// (~seconds) means no one — including that user on reload — ever sees it again.
// This caps Helius DAS at one call per mint globally instead of one per user.

// In-flight dedupe: panel + hover-prefetch may ask for the same mint at once.
const inFlight = new Map<string, Promise<string | null>>();

/**
 * Resolve a mint's avatar through the full pipeline. Returns the proxied URL
 * or null. Cached (incl. localStorage) — repeat calls are free.
 * `raw` is the indexer-provided image URL from the positions row, if any.
 */
export function resolveScanImage(
  mint: string,
  raw?: string | null,
  metadataUri?: string | null,
): Promise<string | null> {
  const cached = getCachedScanImage(mint);
  if (cached !== undefined) return Promise.resolve(cached);
  const pending = inFlight.get(mint);
  if (pending) return pending;

  const p = (async (): Promise<string | null> => {
    try {
      // 1. Direct image URL → proxy, done.
      if (raw && !isMetadataUrl(raw)) {
        const proxied = computeHashImageUrl(raw, 40) || raw;
        setEntry(mint, proxied);
        return proxied;
      }
      // 2. Raw is a metadata JSON URL → resolve → proxy.
      if (raw) {
        const resolved = await resolveMetadataImage(raw, true).catch(() => null);
        if (resolved) {
          const proxied = computeHashImageUrl(resolved, 40) || resolved;
          setEntry(mint, proxied);
          return proxied;
        }
      }
      // 2.5. On-chain metadata URI shipped with the positions row — resolves
      // without the token-by-mint round trip below.
      if (metadataUri) {
        const norm = normalizeImageUrl(metadataUri);
        if (norm) {
          const resolved = await resolveMetadataImage(norm, true).catch(
            () => null,
          );
          if (resolved) {
            const proxied = computeHashImageUrl(resolved, 40) || resolved;
            setEntry(mint, proxied);
            return proxied;
          }
        }
      }
      // 3. Token-service metadata.
      let img: string | null = null;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      try {
        const metadata = await fetchChainTokenMetadata(mint, {
          signal: controller.signal,
        });
        img = metadata?.imageUrl || null;
        const uri = normalizeImageUrl(metadata?.uri || null);
        if (img && img.includes("cdn.interstate.so/") && uri) {
          img = (await resolveMetadataImage(uri, true).catch(() => null)) ?? null;
        } else if (!img && uri) {
          img = (await resolveMetadataImage(uri, true).catch(() => null)) ?? null;
        }
        // Speculative CDN URLs 403 when unwarmed — never emit them.
        if (img && img.includes("cdn.interstate.so/")) img = null;
      } catch {
        /* fall through to cascade */
      } finally {
        clearTimeout(timeoutId);
      }
      if (img) {
        const proxied = computeHashImageUrl(img, 40) || img;
        setEntry(mint, proxied);
        return proxied;
      }
      // (No-URI mints are healed server-side via DAS — see note above.)
      // 4/5. Registry cascade — verified by an actual render.
      const candidates: string[] = [];
      if (mint.toLowerCase().endsWith("pump")) {
        const pf = await fetchPumpfunImage(mint).catch(() => null);
        if (pf?.imageUrl) candidates.push(pf.imageUrl);
      }
      candidates.push(
        `https://dd.dexscreener.com/ds-data/tokens/solana/${mint}.png?size=lg`,
      );
      for (const c of candidates) {
        const proxied = computeHashImageUrl(c, 40) || c;
        if (await probeImage(proxied)) {
          setEntry(mint, proxied);
          return proxied;
        }
      }
      setEntry(mint, null);
      return null;
    } finally {
      inFlight.delete(mint);
    }
  })();

  inFlight.set(mint, p);
  return p;
}
