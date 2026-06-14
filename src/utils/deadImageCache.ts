/**
 * deadImageCache — short-lived, session-only memory of image URLs that are
 * failing, so the same dead URL is not re-requested dozens-to-hundreds of times
 * during a single page load.
 *
 * WHY THIS EXISTS
 * ---------------
 * On a cold load, the Pulse/Trending boards render many virtualized rows. When
 * a token's proxied image (`/api/img/<hash>`) returns a hard error (commonly a
 * cdn.interstate.so 403 for un-warmed assets), the row paints a letter
 * placeholder — but the SAME canonical URL re-mounts across row recycling and
 * re-renders, each mount firing a fresh `<img>` request that fails again. A
 * single dead hash was measured re-fetching up to 346× (≈2,900 failed image
 * requests in ~11s on one cold load). Those in-flight `<img>` requests keep the
 * browser `load` event pending, which is what holds the tab spinner spinning.
 *
 * This module lets FastImage record failures per canonical URL and, once a URL
 * has failed `FAILURES_BEFORE_DEAD` separate times, treat it as "dead" for a
 * short TTL. While dead, FastImage skips rendering the `<img>` entirely (no
 * request) and shows the placeholder it would have shown anyway.
 *
 * ZERO-REGRESSION GUARANTEES
 * --------------------------
 *  - Marks dead only after MULTIPLE separate failures, so a brief CDN blip does
 *    not mass-mark genuinely-good images dead.
 *  - Short TTL (tied to the proxy's 10s error-cache + buffer): a recovered CDN
 *    gets a fresh attempt within seconds, the entry self-heals on expiry.
 *  - "Ever loaded" guard: a URL that has loaded successfully is protected from
 *    being marked dead (covers tab-restore bitmap eviction and same-session
 *    re-mounts of known-good images). LRU-capped, refreshed on each success so
 *    an actively-displayed URL is never the one evicted.
 *  - `markImageAlive` on every successful load clears any failure/dead state for
 *    that URL.
 *  - `clearImageDead` lets the visibility-restore retry path force a fresh
 *    attempt (e.g. CDN came back while the tab was hidden).
 *  - Session-memory only — never persisted. A page reload starts clean, so a
 *    transient outage can never blacklist an image across reloads.
 *  - Bounded size with eviction, so the maps cannot grow without limit in a
 *    long-lived tab.
 *
 * Keyed on the CANONICAL image URL (FastImage's `currentUrlRef.current`), never
 * the `?_r=N` cache-busted retry variant.
 */

/**
 * Failures of a given canonical URL (across separate mount-occurrences) before
 * it is considered dead. 3 keeps the cold-load storm collapse intact — a dead
 * hash re-mounts hundreds of times — while making a brief CDN blip far less
 * likely to mass-mark genuinely-good images dead (two transient failures during
 * a hiccup no longer suffice).
 */
const FAILURES_BEFORE_DEAD = 3;

/**
 * How long a URL stays "dead" before a fresh attempt is allowed again.
 * The image proxy caches non-200 upstream responses for 10s
 * (`Cache-Control: public, max-age=10`), so 15s guarantees at least one real
 * re-attempt after that error-cache could have expired.
 */
const DEAD_TTL_MS = 15_000;

/** Hard cap on tracked dead entries (eviction of oldest insertions). */
const MAX_DEAD_ENTRIES = 400;

/**
 * Hard cap on sub-threshold failure counters (URLs that failed once or twice
 * but never reached the dead state), so the map can't grow unbounded across a
 * long session.
 */
const MAX_FAIL_ENTRIES = 800;

/** Hard cap on the proven-good set (LRU by last successful load). */
const MAX_EVER_LOADED = 1_000;

/** canonical url -> number of separate failures recorded. */
const failCounts = new Map<string, number>();

/** canonical url -> timestamp (ms) at which the URL stops being "dead". */
const deadUntil = new Map<string, number>();

/** canonical urls proven good (loaded successfully); protected from poisoning. LRU-capped. */
const everLoaded = new Set<string>();

/**
 * Record one failure for a canonical URL. Call at most once per mounted
 * occurrence of the URL (FastImage gates this behind its fire-once flag), so
 * the count reflects "how many separate times this URL failed" rather than how
 * many retries one mount made.
 *
 * No-op for URLs that have ever loaded successfully.
 */
export function recordImageFailure(url: string): void {
  if (!url) return;
  if (everLoaded.has(url)) return; // never poison a proven-good URL

  const next = (failCounts.get(url) ?? 0) + 1;
  failCounts.set(url, next);

  if (next >= FAILURES_BEFORE_DEAD) {
    deadUntil.set(url, Date.now() + DEAD_TTL_MS);
    evictIfNeeded();
  } else if (failCounts.size > MAX_FAIL_ENTRIES) {
    // Bound sub-threshold counters — drop the oldest one that isn't itself dead.
    // Losing a stale "1-2 prior failures" memory is harmless (it just restarts
    // the count), so a simple oldest-first soft cap is sufficient.
    for (const key of failCounts.keys()) {
      if (!deadUntil.has(key)) {
        failCounts.delete(key);
        break;
      }
    }
  }
}

/**
 * Whether a canonical URL is currently considered dead (and so its request
 * should be skipped). Expired entries self-clean on read and become live again.
 */
export function isImageDead(url: string): boolean {
  if (!url) return false;
  const until = deadUntil.get(url);
  if (until === undefined) return false;

  if (Date.now() >= until) {
    // TTL elapsed — give the URL a fresh start.
    deadUntil.delete(url);
    failCounts.delete(url);
    return false;
  }
  return true;
}

/**
 * Mark a URL as successfully loaded: clears any failure/dead state and records
 * it in the write-once "ever loaded" set so it can never be poisoned later
 * (e.g. by a transient error after a tab-restore bitmap eviction).
 */
export function markImageAlive(url: string): void {
  if (!url) return;
  failCounts.delete(url);
  deadUntil.delete(url);

  // LRU touch: re-insert so a still-actively-loading URL moves to the most-
  // recent position and is never the one evicted when the cap is hit. (Sets
  // preserve insertion order, so delete + add = move-to-end.)
  everLoaded.delete(url);
  everLoaded.add(url);
  if (everLoaded.size > MAX_EVER_LOADED) {
    const oldest = everLoaded.values().next().value;
    if (oldest !== undefined) everLoaded.delete(oldest);
  }
}

/**
 * Forcibly clear dead/failure state for a URL so the next mount makes a real
 * attempt. Used by FastImage's visibility-restore retry (CDN may have recovered
 * while the tab was hidden).
 */
export function clearImageDead(url: string): void {
  if (!url) return;
  deadUntil.delete(url);
  failCounts.delete(url);
}

/** Evict oldest dead entries when over the size cap. */
function evictIfNeeded(): void {
  if (deadUntil.size <= MAX_DEAD_ENTRIES) return;
  const overflow = deadUntil.size - MAX_DEAD_ENTRIES;
  let removed = 0;
  for (const key of deadUntil.keys()) {
    deadUntil.delete(key);
    failCounts.delete(key);
    if (++removed >= overflow) break;
  }
}

// Dev-only inspection hooks (mirrors the `clearMetadataCache` pattern in
// images.ts). Lets a developer inspect or clear the cache from the console; not
// exposed in production builds.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as Record<string, unknown>).__deadImageCache = {
    deadUntil,
    failCounts,
    everLoaded,
  };
  (window as unknown as Record<string, unknown>).__clearDeadImageCache = () => {
    deadUntil.clear();
    failCounts.clear();
    everLoaded.clear();
  };
}
