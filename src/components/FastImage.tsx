import React, { useState, useEffect, useRef, memo } from "react";
import ImageBubble from "./ImageBubble";
import {
  isMetadataUrl,
  resolveMetadataImage,
  clearMetadataFailureCache,
  getCachedMetadataImage,
} from "~/utils/images";
import {
  retainImageObject,
  isImageRetained,
  getRetainedImage,
  prefetchFromSessionStorage,
} from "~/utils/imagePreloader";
import { computeHashImageUrl } from "~/utils/imageHash";

/**
 * Global tracker for loaded image URLs with LRU eviction
 * Uses Map instead of Set to track access times for proper LRU
 */
const globalLoadedImages = new Map<string, number>(); // url -> last access timestamp
const MAX_TRACKED_IMAGES = 500;
const MAX_PERSISTED_IMAGES = 200;
const PERSIST_KEY = "__img_urls"; // No 'session'/'Session' substring — safe from TurnkeyRootProvider
let persistTimer: ReturnType<typeof setTimeout> | null = null;

// Hydrate from sessionStorage at module init (survives F5, clears on tab close)
if (typeof window !== "undefined") {
  try {
    const raw = sessionStorage.getItem(PERSIST_KEY);
    if (raw) {
      const entries: [string, number][] = JSON.parse(raw);
      for (const [url, ts] of entries) {
        if (typeof url === "string" && typeof ts === "number") {
          globalLoadedImages.set(url, ts);
        }
      }
    }
  } catch {}

  // Prefetch: start Image loads from disk cache NOW (200-600ms before React mounts).
  // By the time FastImage's useState probe runs, most bitmaps will be decoded.
  if (globalLoadedImages.size > 0) {
    prefetchFromSessionStorage(
      Array.from(globalLoadedImages.entries())
        .sort((a, b) => b[1] - a[1]) // most-recently-used first
        .map(([url]) => url),
    );
  }
}

function schedulePersist() {
  if (typeof window === "undefined" || persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const entries = Array.from(globalLoadedImages.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_PERSISTED_IMAGES);
      sessionStorage.setItem(PERSIST_KEY, JSON.stringify(entries));
    } catch {}
  }, 2000);
}

function trackLoadedImage(url: string) {
  // Update timestamp (moves to "recent" in LRU sense)
  globalLoadedImages.set(url, Date.now());

  // Evict oldest if over limit
  if (globalLoadedImages.size > MAX_TRACKED_IMAGES) {
    let oldestUrl = "";
    let oldestTime = Infinity;
    for (const [u, time] of globalLoadedImages) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestUrl = u;
      }
    }
    if (oldestUrl) globalLoadedImages.delete(oldestUrl);
  }

  schedulePersist();
}

function isImageTracked(url: string): boolean {
  if (globalLoadedImages.has(url)) {
    // Update access time (LRU touch) - keeps active images in cache
    globalLoadedImages.set(url, Date.now());
    return true;
  }
  return false;
}

/**
 * Helper to compute imageUrl from a source URL
 * Used for synchronous initialization
 */
function computeImageUrl(src: string | null, width?: number): string | null {
  return computeHashImageUrl(src, width);
}

interface FastImageProps {
  src?: string | null;
  fallbackSrc?: string | null;
  alt?: string;
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
  symbol?: string;
  name?: string;
  showBubble?: boolean;
  bubbleSrc?: string;
  /** Fired when all auto-retries are exhausted. Parent can swap to a fallback src. */
  onLoadFailed?: () => void;
  /**
   * Stable identifier for the entity this image belongs to (e.g. token mint,
   * wallet address, user id). Enables the double-buffer to distinguish:
   *   - same entity, different src   → keep previous image painted while next
   *     loads (eliminates the cloudflare-ipfs 404 → URI fallback flicker)
   *   - different entity (row recycled by a virtualized list) → drop the
   *     previous image immediately so the new entity's row doesn't briefly
   *     paint the previous entity's avatar.
   * If omitted, the double-buffer is disabled — safer default for callers
   * that don't opt in (no risk of cross-entity image bleed).
   */
  stableId?: string;
}

/**
 * FastImage - Flicker-free image component
 *
 * KEY FIX: State is initialized SYNCHRONOUSLY from props, not in effects.
 * This prevents the flicker cycle: skeleton → image → skeleton → image
 *
 * Uses CSS background as fallback instead of conditional rendering.
 * The image loads ON TOP of the background, so there's no flicker.
 */
function FastImageInner({
  src,
  fallbackSrc,
  alt = "",
  width = 48,
  height = 48,
  className = "",
  priority = false,
  symbol,
  name,
  showBubble = true,
  bubbleSrc,
  onLoadFailed,
  stableId,
}: FastImageProps) {
  const inputSrc = src || fallbackSrc;

  // State holds ONLY the async-resolved metadata image URL, scoped to the
  // input it was resolved from. Direct URLs are derived from inputSrc on every
  // render so a parent prop change (e.g. virtualized-list shift repointing
  // this row at a different token) reflects instantly — no stale render where
  // we'd briefly show the previous token's URL until an effect catches up.
  // Scoping by source prevents a stale resolved URL from a previous metadata
  // candidate leaking through when the candidate changes.
  const [asyncResolved, setAsyncResolved] = useState<{
    src: string;
    url: string;
  } | null>(null);

  const resolvedSrc: string | null = (() => {
    if (!inputSrc) return null;
    if (!isMetadataUrl(inputSrc)) return inputSrc;
    const cached = getCachedMetadataImage(inputSrc);
    if (cached) return cached;
    if (asyncResolved && asyncResolved.src === inputSrc)
      return asyncResolved.url;
    return inputSrc;
  })();

  // Shim so the inputSrc-change effect's existing setResolvedSrc(...) calls
  // still type-check and work — they only matter for the metadata path now.
  const setResolvedSrc = (
    next: string | null | ((prev: string | null) => string | null),
  ) => {
    if (typeof next === "function") {
      const prev = asyncResolved?.url ?? null;
      const nextVal = next(prev);
      if (nextVal && inputSrc)
        setAsyncResolved({ src: inputSrc, url: nextVal });
      else setAsyncResolved(null);
    } else if (next && inputSrc) {
      setAsyncResolved({ src: inputSrc, url: next });
    } else {
      setAsyncResolved(null);
    }
  };

  // Track whether the image was already cached at mount time (set synchronously, never re-renders)
  const wasCachedAtMount = useRef(false);

  // CRITICAL: Initialize imageLoaded from global tracker SYNCHRONOUSLY
  // Only return true if the browser's decoded bitmap cache actually has the image.
  // This prevents "disappear" bugs where imageLoaded=true but bitmap was evicted.
  const [imageLoaded, setImageLoaded] = useState(() => {
    const initialSrc = resolvedSrc; // Already resolved (sync cache hit or direct URL)
    const initialUrl = computeImageUrl(initialSrc, width);
    if (!initialUrl) return false;

    // Check the module-level retained Image cache FIRST, regardless of
    // isImageTracked. This covers the prewarm path: when the WS bridge ran
    // preloadImage() before this component mounted, the bitmap is in
    // imageObjectCache but globalLoadedImages was never updated (only
    // FastImage's own handleLoad does that). Without this check, prewarmed
    // images go through the imageLoaded=false → letter → onLoad → true cycle
    // even though the bitmap is sitting in memory ready to display.
    const retained = getRetainedImage(initialUrl);
    if (retained && retained.complete && retained.naturalHeight > 0) {
      wasCachedAtMount.current = true;
      return true; // Already decoded — instant display
    }

    if (isImageTracked(initialUrl)) {
      // Fallback: probe via fresh Image() — covers the case where FastImage
      // previously loaded this URL (added to globalLoadedImages via handleLoad)
      // but the retained image was evicted from imageObjectCache.
      const probe = new Image();
      probe.src = initialUrl;
      if (probe.complete && probe.naturalHeight > 0) {
        wasCachedAtMount.current = true;
        retainImageObject(initialUrl, probe);
        return true; // Confirmed in browser memory
      }
      probe.src = ""; // Cancel any queued fetch
    }
    return false;
  });

  const [imageError, setImageError] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const currentUrlRef = useRef<string | null>(null);

  // Last URL whose <img> successfully fired onLoad. Used as the visible
  // background while a NEW src is being fetched, so the previously-painted
  // avatar stays on screen during the transition instead of flashing to a
  // letter placeholder. This is the double-buffering that eliminates the
  // failed-load → fallback flicker on Pulse (e.g. cloudflare-ipfs.com 404 →
  // URI fallback). Capturing here (per-instance) instead of relying on the
  // shared globalLoadedImages map means the previous URL stays the
  // background even if it was loaded by THIS row only.
  const [lastDisplayedUrl, setLastDisplayedUrl] = useState<string | null>(null);

  // Tracks the stableId we currently consider "the entity this slot belongs
  // to." Paired with `lastDisplayedUrl` and updated during render (not in an
  // effect) so an entity change resets the buffer in the SAME render the new
  // stableId arrives — eliminating the one-frame window where the previous
  // entity's image could paint in the new entity's slot before an effect
  // commits the clear. React's recommended pattern for adjusting state when
  // a prop changes; see https://react.dev/learn/you-might-not-need-an-effect
  const [trackedStableId, setTrackedStableId] = useState<string | undefined>(
    undefined,
  );
  if (stableId !== trackedStableId) {
    setLastDisplayedUrl(null);
    setTrackedStableId(stableId);
  }

  // Ref for the <img> element (used by visibilitychange handler)
  const imgRef = useRef<HTMLImageElement>(null);

  // Retry counter to prevent infinite retry loops on tab visibility
  const retryCountRef = useRef(0);
  const MAX_VISIBILITY_RETRIES = 3;

  // Auto-retry on load error with shortened backoff (200/500/1000ms instead
  // of 2s/4s/8s — for 404s retries don't help, and the parent's onLoadFailed
  // fallback chain wants to fire ASAP).
  const autoRetryCountRef = useRef(0);
  const autoRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_AUTO_RETRIES = 3;
  const RETRY_DELAYS_MS = [200, 500, 1000];
  // Track whether onLoadFailed has fired for the current URL (only fire once
  // per URL so the parent doesn't get spammed across retries).
  const onLoadFailedFiredRef = useRef(false);

  // Metadata resolution retry (for when resolveMetadataImage returns null due to timeout/congestion)
  const metadataRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metadataRetryCountRef = useRef(0);
  const MAX_METADATA_RETRIES = 2;

  // Refs for current state (avoids re-registering the visibilitychange effect)
  const stateRef = useRef({ imageError: false, imageLoaded: false });
  stateRef.current = { imageError, imageLoaded };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (autoRetryTimerRef.current) clearTimeout(autoRetryTimerRef.current);
      if (metadataRetryRef.current) clearTimeout(metadataRetryRef.current);
    };
  }, []);

  // Get first letter for fallback
  const firstLetter = (() => {
    if (symbol && symbol.length > 0) return symbol.charAt(0).toUpperCase();
    if (name && name.length > 0) return name.charAt(0).toUpperCase();
    if (alt && alt.length > 0) return alt.charAt(0).toUpperCase();
    return "?";
  })();

  // Resolve metadata URLs with retry on failure
  // If resolveMetadataImage returns null (timeout/congestion), retries at 2s and 5s
  useEffect(() => {
    metadataRetryCountRef.current = 0;
    if (metadataRetryRef.current) {
      clearTimeout(metadataRetryRef.current);
      metadataRetryRef.current = null;
    }

    if (inputSrc && isMetadataUrl(inputSrc)) {
      const attemptResolve = (isRetry: boolean) => {
        if (isRetry) clearMetadataFailureCache(inputSrc);
        resolveMetadataImage(inputSrc).then((resolved) => {
          if (resolved) {
            setResolvedSrc((prev) => (prev === resolved ? prev : resolved));
          } else if (metadataRetryCountRef.current < MAX_METADATA_RETRIES) {
            metadataRetryCountRef.current++;
            const delay = metadataRetryCountRef.current === 1 ? 2000 : 5000;
            metadataRetryRef.current = setTimeout(
              () => attemptResolve(true),
              delay,
            );
          }
        });
      };
      attemptResolve(false);
    } else if (inputSrc) {
      // For regular URLs, only update if changed (prevents unnecessary re-renders)
      setResolvedSrc((prev) => (prev === inputSrc ? prev : inputSrc));
    } else {
      setResolvedSrc((prev) => (prev === null ? prev : null));
    }

    return () => {
      if (metadataRetryRef.current) {
        clearTimeout(metadataRetryRef.current);
        metadataRetryRef.current = null;
      }
    };
  }, [inputSrc]);

  // Build final image URL.
  // `width` is passed so the proxy serves a resized WebP at that pixel size —
  // a 60px slot gets a ~3-6 KB WebP instead of a 400 KB source PNG.
  const imageUrl = computeImageUrl(resolvedSrc, width);

  // Cache-bust URL for retries (keeps canonical imageUrl for tracking)
  const finalImageUrl =
    imageUrl && retryVersion > 0
      ? `${imageUrl}${imageUrl.includes("?") ? "&" : "?"}_r=${retryVersion}`
      : imageUrl;

  // Whether this URL was previously loaded (from in-memory tracker or sessionStorage hydration)
  // Used for CSS background fallback and eager loading even when bitmap isn't in decoded cache
  const isKnownUrl = imageUrl ? globalLoadedImages.has(imageUrl) : false;

  // Update ref and check tracker when URL changes
  useEffect(() => {
    autoRetryCountRef.current = 0;
    onLoadFailedFiredRef.current = false; // reset per-URL fire-once flag
    setRetryVersion(0);
    if (autoRetryTimerRef.current) {
      clearTimeout(autoRetryTimerRef.current);
      autoRetryTimerRef.current = null;
    }

    // Note: entity-change buffer clearing happens in render-phase (see
    // trackedStableId block above). The same-entity src swap (e.g. cloudflare
    // 404 → URI fallback) keeps the buffer for the no-flicker transition.

    if (!imageUrl) {
      setImageLoaded(false);
      setImageError(false);
      // Parent intentionally cleared src → drop the double-buffer so the
      // letter placeholder shows immediately. Without this, a stale previous
      // avatar would persist as background, which callers expect to be
      // cleared when they pass a falsy src.
      setLastDisplayedUrl(null);
      return;
    }

    currentUrlRef.current = imageUrl;

    // Check retained image cache first (covers prewarm path — see useState
    // initializer above for full explanation).
    //
    // Important: also call trackLoadedImage so subsequent renders of this URL
    // hit the isImageTracked() fast-path below instead of re-running the
    // retained-cache lookup. Without this sync, virtualized list re-pointing
    // at a known URL falls through to the `setImageLoaded(false)` else-branch
    // for one render frame, producing a visible per-row flicker.
    const retained = getRetainedImage(imageUrl);
    if (retained && retained.complete && retained.naturalHeight > 0) {
      trackLoadedImage(imageUrl);
      setImageLoaded(true);
      setImageError(false);
      return;
    }

    // If already in global tracker, set loaded immediately
    if (isImageTracked(imageUrl)) {
      setImageLoaded((prev) => (prev ? prev : true)); // Only update if not already true
      setImageError(false);
    } else {
      // New, untracked URL — reset imageLoaded so the letter-fallback shows
      // during the load instead of leaving stale-true state from the previous
      // image. Without this, when a row gets repointed at a different mint
      // (e.g. virtualized list shifts after a new token prepends) the
      // previously-loaded image disappears and the user sees a dark/empty box
      // until the new bytes arrive — the "old tokens lose their image" bug.
      setImageLoaded(false);
      setImageError(false);
    }
  }, [imageUrl, stableId]);

  // Retry failed / evicted images when the tab becomes visible again
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== "visible") return;
      if (!currentUrlRef.current) return;
      if (retryCountRef.current >= MAX_VISIBILITY_RETRIES) return;

      const { imageError: hasError, imageLoaded: isLoaded } = stateRef.current;

      if (hasError) {
        // Image errored while tab was hidden → clear error to retry
        retryCountRef.current++;
        globalLoadedImages.delete(currentUrlRef.current);
        setImageError(false);
        setImageLoaded(false);
        // React re-renders: <img> re-appears with same src → fresh load attempt
        return;
      }

      const img = imgRef.current;
      if (isLoaded && img && img.complete && img.naturalHeight === 0) {
        // Bitmap evicted by browser — img.complete but 0px tall → re-request
        retryCountRef.current++;
        globalLoadedImages.delete(currentUrlRef.current);
        setImageLoaded(false);
        const src = img.src;
        img.src = "";
        requestAnimationFrame(() => {
          img.src = src;
        });
      }
    };

    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []); // Empty deps: registered once, uses refs for state

  const handleLoad = () => {
    retryCountRef.current = 0; // Reset retries on success
    autoRetryCountRef.current = 0;
    setImageLoaded(true);
    setImageError(false);
    // Lock in the canonical URL (not the cache-busted finalImageUrl with
    // ?_r=N suffix) as the visible-background fallback for the next src
    // transition. Storing the canonical URL means the browser can serve it
    // straight from the HTTP cache when it gets painted as the background,
    // instead of treating the cache-busted variant as a separate resource.
    if (currentUrlRef.current) {
      setLastDisplayedUrl(currentUrlRef.current);
      trackLoadedImage(currentUrlRef.current);
      // Retain an Image object so the decoded bitmap survives component unmount
      if (!isImageRetained(currentUrlRef.current)) {
        const retain = new Image();
        retain.src = currentUrlRef.current;
        retainImageObject(currentUrlRef.current, retain);
      }
    }
  };

  const handleError = () => {
    if (currentUrlRef.current) {
      globalLoadedImages.delete(currentUrlRef.current);
    }

    // Fire onLoadFailed on the FIRST error (not after all retries).
    // For 404s, retries won't help — the parent (e.g. PulseTable.TokenImage)
    // wants to swap to a fallback src (URI-resolved image) immediately.
    // Background retries still continue in case the CDN comes back, but the
    // parent's fallback gets a head start instead of waiting 14s.
    if (!onLoadFailedFiredRef.current) {
      onLoadFailedFiredRef.current = true;
      onLoadFailed?.();
    }

    if (autoRetryCountRef.current < MAX_AUTO_RETRIES) {
      const delay = RETRY_DELAYS_MS[autoRetryCountRef.current] ?? 1000;
      autoRetryCountRef.current++;
      setImageError(true);
      setImageLoaded(false);
      autoRetryTimerRef.current = setTimeout(() => {
        autoRetryTimerRef.current = null;
        setRetryVersion((v) => v + 1); // Cache-bust: forces new URL on retry
        setImageError(false); // Clears error → React re-renders <img> → fresh load
        setImageLoaded(false);
      }, delay);
    } else {
      setImageError(true);
      setImageLoaded(false);
      // Permanent failure (auto-retries exhausted): drop the double-buffer so
      // the user sees the letter placeholder instead of a stuck-forever stale
      // image with no error signal. The same-entity src swap still uses the
      // buffer (transient state); only terminal failure clears it.
      setLastDisplayedUrl(null);
    }
  };

  // No URL or permanent error AND no previously-displayed image to fall back to:
  // pure letter placeholder. If we DO have a previous URL, fall through to the
  // normal render path and use it as the background (avoids letter-flash flicker
  // during failed-image fallback or src clearing).
  if ((!imageUrl || imageError) && !lastDisplayedUrl) {
    return (
      <div
        className={`relative ${className} flex items-center justify-center bg-gradient-to-br from-gray-800 to-black font-bold text-white shadow-lg`}
        style={{ width, height, borderRadius: "inherit" }}
      >
        <span className="text-lg select-none">{firstLetter}</span>
        {showBubble && <ImageBubble src={bubbleSrc} />}
      </div>
    );
  }

  // Has URL - render background + image layered
  // Background shows through until image loads, then image covers it
  // NO conditional rendering = NO flicker
  //
  // Background URL resolution priority:
  //   1. Current URL when it's actually displayable (loaded OR known-cached)
  //   2. Last successfully-displayed URL (double-buffer: keeps the previous
  //      avatar visible during a src transition or retry, eliminating the
  //      letter-flash that happens when neither current nor previous load is
  //      ready)
  //   3. Plain gradient (only when there's nothing to show)
  const showCurrent =
    (imageLoaded || isKnownUrl) && finalImageUrl && !imageError;
  const backgroundUrl = showCurrent ? finalImageUrl : lastDisplayedUrl;
  return (
    <div
      className={`relative ${className} overflow-hidden`}
      style={{
        width,
        height,
        borderRadius: "inherit",
        // backgroundUrl resolves to: (1) finalImageUrl when this URL is loaded
        // or known-cached, (2) lastDisplayedUrl when retained for a same-entity
        // src transition, or (3) null. The CSS url() resolves from SW/HTTP/memory
        // cache so cached images paint behind the letter without a gradient flash
        // on F5/SPA nav. The same trick covers the same-entity src swap so the
        // previous successful image stays painted while the next one loads.
        background: backgroundUrl
          ? `url("${backgroundUrl}") center/cover no-repeat, linear-gradient(to bottom right, #1f2937, #000000)`
          : "linear-gradient(to bottom right, #1f2937, #000000)",
      }}
    >
      {/* Fallback letter - always rendered, hidden by image when loaded
          OR when a previously-loaded image is still painted as background. */}
      <div
        className="absolute inset-0 flex items-center justify-center font-bold text-white"
        style={{
          opacity: imageLoaded || lastDisplayedUrl ? 0 : 1,
          pointerEvents: "none",
        }}
      >
        <span className="text-lg select-none">{firstLetter}</span>
      </div>

      {/* Image - rendered when we have a current URL and no permanent error.
          Skip rendering during error/no-url so the broken-icon never flashes;
          background still shows lastDisplayedUrl during this window. */}
      {finalImageUrl && !imageError && (
        <img
          ref={imgRef}
          src={finalImageUrl}
          alt={alt}
          width={width}
          height={height}
          onLoad={handleLoad}
          onError={handleError}
          loading={
            priority || wasCachedAtMount.current || isKnownUrl
              ? "eager"
              : "lazy"
          }
          decoding={wasCachedAtMount.current || isKnownUrl ? "sync" : "async"}
          fetchPriority={priority ? "high" : "auto"}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            // Hide img until loaded — prevents browser broken-icon flash.
            // Gradient+letter (or lastDisplayedUrl bg) shows through cleanly
            // when opacity is 0.
            opacity: imageLoaded ? 1 : 0,
          }}
        />
      )}

      {/* Bubble overlay */}
      {showBubble && <ImageBubble src={bubbleSrc} />}
    </div>
  );
}

// Memoize to prevent unnecessary re-renders when parent updates
// FIXED: Added className and alt to comparison
export default memo(FastImageInner, (prevProps, nextProps) => {
  return (
    prevProps.src === nextProps.src &&
    prevProps.fallbackSrc === nextProps.fallbackSrc &&
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height &&
    prevProps.className === nextProps.className &&
    prevProps.alt === nextProps.alt &&
    prevProps.symbol === nextProps.symbol &&
    prevProps.name === nextProps.name &&
    prevProps.showBubble === nextProps.showBubble &&
    prevProps.bubbleSrc === nextProps.bubbleSrc &&
    prevProps.priority === nextProps.priority &&
    prevProps.onLoadFailed === nextProps.onLoadFailed &&
    prevProps.stableId === nextProps.stableId
  );
});
