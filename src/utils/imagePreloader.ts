/**
 * Image Preloader Utility
 * Preloads images for instant display in tables
 */

import {
  normalizeImageUrl,
  isMetadataUrl,
  resolveMetadataImage,
} from "./images";
import {
  computeHashImageUrl,
  isSpeculativeInterstateCdn,
} from "./imageHash";
import {
  isImageDead,
  recordImageFailure,
  markImageAlive,
} from "./deadImageCache";

// Track preloaded images to avoid duplicate requests. Bounded so a long
// session across churny boards (Pulse + 4 trending timeframes + DexScreener)
// can't grow it without limit. This is only a network-dedup hint — clearing
// it just allows a re-request, which the browser HTTP/disk cache serves; the
// decoded-bitmap retention lives in imageObjectCache (LRU) below.
const preloadedImages = new Set<string>();
const MAX_PRELOADED_TRACKED = 2000;

/**
 * Image Object Retention Cache
 * Holds live references to loaded HTMLImageElement objects at module scope.
 * This prevents the browser from GC'ing decoded bitmaps when React unmounts <img> tags.
 * LRU eviction: delete + re-insert moves entry to end; oldest is first key.
 */
// Headroom for the combined working set: Pulse rows + the trending family
// (4 timeframe boards + DexScreener, warmed by TrendingBackgroundLoader). At
// ~60 tokens/board the trending peak alone approaches the old 500 cap, which
// would start evicting actively-viewed Pulse bitmaps; 800 keeps both resident.
const MAX_RETAINED_IMAGES = 800;
const imageObjectCache = new Map<string, HTMLImageElement>();

export function retainImageObject(url: string, img: HTMLImageElement): void {
  // LRU touch: delete then re-insert moves to end of iteration order
  if (imageObjectCache.has(url)) {
    imageObjectCache.delete(url);
  }
  imageObjectCache.set(url, img);

  // Evict oldest (first entry) if over limit
  if (imageObjectCache.size > MAX_RETAINED_IMAGES) {
    const oldest = imageObjectCache.keys().next().value;
    if (oldest) imageObjectCache.delete(oldest);
  }
}

export function isImageRetained(url: string): boolean {
  return imageObjectCache.has(url);
}

export function getRetainedImage(url: string): HTMLImageElement | undefined {
  const img = imageObjectCache.get(url);
  if (img !== undefined) {
    // LRU touch on read: promote to end of iteration order so an actively
    // displayed image isn't evicted by a burst of new-token preloads. Without
    // this, hot rows can lose their retained Image() and re-enter the slow
    // probe path on next render → flicker.
    imageObjectCache.delete(url);
    imageObjectCache.set(url, img);
  }
  return img;
}

/**
 * Prefetch images from sessionStorage URLs at module init time.
 * Starts Image loads from disk cache before React mounts, so bitmaps
 * are decoded by the time FastImage's useState probe runs.
 */
export function prefetchFromSessionStorage(urls: string[]): void {
  if (urls.length === 0) return;
  const BATCH = 20;
  let offset = 0;

  function processBatch() {
    const end = Math.min(offset + BATCH, urls.length);
    for (let i = offset; i < end; i++) {
      const url = urls[i];
      if (!url || imageObjectCache.has(url)) continue;
      const img = new Image();
      img.src = url;
      retainImageObject(url, img);
    }
    offset = end;
    if (offset < urls.length) {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(processBatch);
      } else {
        requestAnimationFrame(processBatch);
      }
    }
  }
  // First batch runs synchronously — maximizes head start for most-recently-used images
  processBatch();
}

/**
 * Preload a single image
 */
export function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    if (!src) {
      resolve();
      return;
    }

    // Skip if already preloaded (browser cache will handle it)
    if (preloadedImages.has(src)) {
      resolve();
      return;
    }

    // Skip URLs already known dead this session. Without this the prewarm path
    // (pulseWorkerBridge fires preloadImage on every WS board update) re-issues
    // doomed requests for a dead image on every cycle — measured re-firing one
    // hash ~95× on a live board — bypassing FastImage's dead-cache and keeping
    // the load-event tail (tab spinner) busy. Shares the same dead-cache as
    // FastImage so the two paths agree on what's dead.
    if (isImageDead(src)) {
      resolve();
      return;
    }

    // Check if already loaded/cached by browser
    const img = new Image();

    img.onload = () => {
      // Keep the dedup Set bounded; clearing just re-enables a (cache-served)
      // re-request, it never drops a decoded bitmap (that's imageObjectCache).
      if (preloadedImages.size >= MAX_PRELOADED_TRACKED)
        preloadedImages.clear();
      preloadedImages.add(src);
      retainImageObject(src, img);
      // Proven good: clear any dead/failure state and protect from poisoning.
      markImageAlive(src);
      resolve();
    };

    img.onerror = () => {
      // Don't reject - just resolve silently (image might fail to load).
      // Record the failure so a repeatedly-dead URL is cached dead and the
      // prewarm cycle stops re-issuing it (self-heals after the dead TTL).
      recordImageFailure(src);
      resolve();
    };

    // Set src to start loading
    img.src = src;
  });
}

/**
 * Preload multiple images in parallel (with concurrency limit)
 */
export async function preloadImages(
  urls: (string | null | undefined)[],
  options: {
    maxConcurrent?: number;
    priority?: "high" | "low" | "auto";
  } = {},
): Promise<void> {
  const { maxConcurrent = 10, priority = "auto" } = options;

  // Filter out null/undefined/empty URLs
  const validUrls = urls.filter((url): url is string =>
    Boolean(url && typeof url === "string" && url.trim().length > 0),
  );

  if (validUrls.length === 0) {
    return;
  }

  // Process in batches to avoid overwhelming the browser
  for (let i = 0; i < validUrls.length; i += maxConcurrent) {
    const batch = validUrls.slice(i, i + maxConcurrent);

    await Promise.allSettled(
      batch.map((url) => {
        // Use link preload for high priority images
        if (priority === "high" && typeof document !== "undefined") {
          const link = document.createElement("link");
          link.rel = "preload";
          link.as = "image";
          link.href = url;
          link.fetchPriority = "high";
          document.head.appendChild(link);

          // Also use Image object for compatibility
          return preloadImage(url).finally(() => {
            // Clean up link after a delay
            setTimeout(() => {
              if (link.parentNode) {
                link.parentNode.removeChild(link);
              }
            }, 1000);
          });
        }

        return preloadImage(url);
      }),
    );
  }
}

/**
 * Extract image URLs from token array
 */
export function extractImageUrls(tokens: any[]): string[] {
  return tokens
    .map((token) => {
      const raw =
        token?.image ||
        token?.image_url ||
        token?.imageUrl ||
        token?.logo ||
        token?.logoUrl ||
        token?.logo_url ||
        token?.uri ||
        token?.icon ||
        token?.thumbnail ||
        null;

      if (!raw || typeof raw !== "string") return null;

      // Skip metadata URLs here; they are resolved elsewhere before rendering
      if (isMetadataUrl(raw)) return null;

      const normalized = normalizeImageUrl(raw) || raw;
      if (!normalized) return null;
      if (isSpeculativeInterstateCdn(normalized)) return null;

      if (normalized.startsWith("/api/")) return normalized;

      return computeHashImageUrl(normalized) || normalized;
    })
    .filter((url): url is string => Boolean(url && typeof url === "string"));
}

/**
 * Preload images for tokens (with smart prioritization)
 */
export async function preloadTokenImages(
  tokens: any[],
  options: {
    maxConcurrent?: number;
    priority?: "high" | "low" | "auto";
    limit?: number; // Limit number of images to preload (for above-the-fold)
  } = {},
): Promise<void> {
  const { limit, ...restOptions } = options;

  let tokensToProcess = tokens;

  // If limit is specified, prioritize first N tokens (above-the-fold)
  if (limit && limit > 0) {
    tokensToProcess = tokens.slice(0, limit);
  }

  const imageUrls = extractImageUrls(tokensToProcess);

  if (imageUrls.length === 0) {
    return;
  }

  await preloadImages(imageUrls, restOptions);
}

/**
 * Preload images for tokens whose URLs point to metadata JSON (irys.xyz, arweave, IPFS, etc.)
 * Resolves metadata → extracts actual image URL → preloads through proxy
 */
export async function preloadMetadataImages(
  tokens: any[],
  options: { limit?: number; maxConcurrent?: number } = {},
): Promise<void> {
  const { limit = 20, maxConcurrent = 5 } = options;

  const metadataTokens = tokens
    .filter((token) => {
      const raw =
        token?.image ||
        token?.image_url ||
        token?.imageUrl ||
        token?.logo ||
        token?.uri ||
        token?.icon ||
        null;
      return raw && typeof raw === "string" && isMetadataUrl(raw);
    })
    .slice(0, limit);

  if (metadataTokens.length === 0) return;

  for (let i = 0; i < metadataTokens.length; i += maxConcurrent) {
    const batch = metadataTokens.slice(i, i + maxConcurrent);
    await Promise.allSettled(
      batch.map(async (token) => {
        const raw =
          token?.image ||
          token?.image_url ||
          token?.imageUrl ||
          token?.logo ||
          token?.uri ||
          token?.icon ||
          null;
        if (!raw) return;

        const resolved = await resolveMetadataImage(raw);
        if (!resolved || preloadedImages.has(resolved)) return;

        const proxyUrl = computeHashImageUrl(resolved) || resolved;
        // Don't re-prewarm a URL already known dead this session.
        if (isImageDead(proxyUrl)) return;

        preloadedImages.add(proxyUrl);
        const img = new Image();
        img.onload = () => markImageAlive(proxyUrl);
        img.onerror = () => recordImageFailure(proxyUrl);
        img.src = proxyUrl;
        retainImageObject(proxyUrl, img);
      }),
    );
  }
}
