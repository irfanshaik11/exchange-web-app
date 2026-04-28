import React, { useState, useEffect, useRef, memo } from 'react';
import ImageBubble from './ImageBubble';
import { isMetadataUrl, resolveMetadataImage, clearMetadataFailureCache, getCachedMetadataImage } from '~/utils/images';
import { retainImageObject, isImageRetained, getRetainedImage, prefetchFromSessionStorage } from '~/utils/imagePreloader';
import { computeHashImageUrl } from '~/utils/imageHash';

/**
 * Global tracker for loaded image URLs with LRU eviction
 * Uses Map instead of Set to track access times for proper LRU
 */
const globalLoadedImages = new Map<string, number>(); // url -> last access timestamp
const MAX_TRACKED_IMAGES = 500;
const MAX_PERSISTED_IMAGES = 200;
const PERSIST_KEY = '__img_urls'; // No 'session'/'Session' substring — safe from TurnkeyRootProvider
let persistTimer: ReturnType<typeof setTimeout> | null = null;

// Hydrate from sessionStorage at module init (survives F5, clears on tab close)
if (typeof window !== 'undefined') {
  try {
    const raw = sessionStorage.getItem(PERSIST_KEY);
    if (raw) {
      const entries: [string, number][] = JSON.parse(raw);
      for (const [url, ts] of entries) {
        if (typeof url === 'string' && typeof ts === 'number') {
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
        .map(([url]) => url)
    );
  }
}

function schedulePersist() {
  if (typeof window === 'undefined' || persistTimer) return;
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
    let oldestUrl = '';
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
function computeImageUrl(src: string | null): string | null {
  return computeHashImageUrl(src);
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
  alt = '',
  width = 48,
  height = 48,
  className = '',
  priority = false,
  symbol,
  name,
  showBubble = true,
  bubbleSrc,
  onLoadFailed,
}: FastImageProps) {
  const inputSrc = src || fallbackSrc;

  // CRITICAL: Initialize resolvedSrc SYNCHRONOUSLY from props
  // Only use null for metadata URLs (which need async resolution)
  // This prevents the flicker caused by: null → effect sets value → re-render
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(() => {
    if (!inputSrc) return null;
    if (!isMetadataUrl(inputSrc)) return inputSrc; // Regular URL - use immediately!
    // Use cached resolved image if available; otherwise use inputSrc directly.
    // computeImageUrl routes through /api/img/{hash} which handles both
    // direct images and JSON metadata (via resolveJsonMetadataImage).
    return getCachedMetadataImage(inputSrc) || inputSrc;
  });

  // Track whether the image was already cached at mount time (set synchronously, never re-renders)
  const wasCachedAtMount = useRef(false);

  // CRITICAL: Initialize imageLoaded from global tracker SYNCHRONOUSLY
  // Only return true if the browser's decoded bitmap cache actually has the image.
  // This prevents "disappear" bugs where imageLoaded=true but bitmap was evicted.
  const [imageLoaded, setImageLoaded] = useState(() => {
    const initialSrc = resolvedSrc; // Already resolved (sync cache hit or direct URL)
    const initialUrl = computeImageUrl(initialSrc);
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
      probe.src = ''; // Cancel any queued fetch
    }
    return false;
  });

  const [imageError, setImageError] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const currentUrlRef = useRef<string | null>(null);

  // Ref for the <img> element (used by visibilitychange handler)
  const imgRef = useRef<HTMLImageElement>(null);

  // Retry counter to prevent infinite retry loops on tab visibility
  const retryCountRef = useRef(0);
  const MAX_VISIBILITY_RETRIES = 3;

  // Auto-retry on load error with exponential backoff
  const autoRetryCountRef = useRef(0);
  const autoRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_AUTO_RETRIES = 3;

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
    return '?';
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
        resolveMetadataImage(inputSrc).then(resolved => {
          if (resolved) {
            setResolvedSrc(prev => prev === resolved ? prev : resolved);
          } else if (metadataRetryCountRef.current < MAX_METADATA_RETRIES) {
            metadataRetryCountRef.current++;
            const delay = metadataRetryCountRef.current === 1 ? 2000 : 5000;
            metadataRetryRef.current = setTimeout(() => attemptResolve(true), delay);
          }
        });
      };
      attemptResolve(false);
    } else if (inputSrc) {
      // For regular URLs, only update if changed (prevents unnecessary re-renders)
      setResolvedSrc(prev => prev === inputSrc ? prev : inputSrc);
    } else {
      setResolvedSrc(prev => prev === null ? prev : null);
    }

    return () => {
      if (metadataRetryRef.current) {
        clearTimeout(metadataRetryRef.current);
        metadataRetryRef.current = null;
      }
    };
  }, [inputSrc]);

  // Build final image URL
  const imageUrl = computeImageUrl(resolvedSrc);

  // Cache-bust URL for retries (keeps canonical imageUrl for tracking)
  const finalImageUrl = imageUrl && retryVersion > 0
    ? `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}_r=${retryVersion}`
    : imageUrl;

  // Whether this URL was previously loaded (from in-memory tracker or sessionStorage hydration)
  // Used for CSS background fallback and eager loading even when bitmap isn't in decoded cache
  const isKnownUrl = imageUrl ? globalLoadedImages.has(imageUrl) : false;

  // Update ref and check tracker when URL changes
  useEffect(() => {
    autoRetryCountRef.current = 0;
    setRetryVersion(0);
    if (autoRetryTimerRef.current) {
      clearTimeout(autoRetryTimerRef.current);
      autoRetryTimerRef.current = null;
    }

    if (!imageUrl) {
      setImageLoaded(false);
      setImageError(false);
      return;
    }

    currentUrlRef.current = imageUrl;

    // Check retained image cache first (covers prewarm path — see useState
    // initializer above for full explanation)
    const retained = getRetainedImage(imageUrl);
    if (retained && retained.complete && retained.naturalHeight > 0) {
      setImageLoaded(true);
      setImageError(false);
      return;
    }

    // If already in global tracker, set loaded immediately
    if (isImageTracked(imageUrl)) {
      setImageLoaded(prev => prev ? prev : true); // Only update if not already true
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
  }, [imageUrl]);

  // Retry failed / evicted images when the tab becomes visible again
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== 'visible') return;
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
        img.src = '';
        requestAnimationFrame(() => { img.src = src; });
      }
    };

    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []); // Empty deps: registered once, uses refs for state

  const handleLoad = () => {
    retryCountRef.current = 0; // Reset retries on success
    autoRetryCountRef.current = 0;
    setImageLoaded(true);
    setImageError(false);
    if (currentUrlRef.current) {
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
    if (autoRetryCountRef.current < MAX_AUTO_RETRIES) {
      const delay = Math.pow(2, autoRetryCountRef.current + 1) * 1000; // 2s, 4s, 8s
      autoRetryCountRef.current++;
      setImageError(true);
      setImageLoaded(false);
      autoRetryTimerRef.current = setTimeout(() => {
        autoRetryTimerRef.current = null;
        setRetryVersion(v => v + 1);  // Cache-bust: forces new URL on retry
        setImageError(false);  // Clears error → React re-renders <img> → fresh load
        setImageLoaded(false);
      }, delay);
    } else {
      setImageError(true);
      setImageLoaded(false);
      onLoadFailed?.();
    }
  };

  // No URL - show fallback only
  if (!imageUrl || imageError) {
    return (
      <div
        className={`relative ${className} flex items-center justify-center bg-gradient-to-br from-gray-800 to-black text-white font-bold shadow-lg`}
        style={{ width, height, borderRadius: 'inherit' }}
      >
        <span className="text-lg select-none">{firstLetter}</span>
        {showBubble && <ImageBubble src={bubbleSrc} />}
      </div>
    );
  }

  // Has URL - render background + image layered
  // Background shows through until image loads, then image covers it
  // NO conditional rendering = NO flicker
  return (
    <div
      className={`relative ${className} overflow-hidden`}
      style={{
        width,
        height,
        borderRadius: 'inherit',
        // For cached/known images: CSS background-image resolves from SW/HTTP/memory cache,
        // painting the image behind the letter (no gradient flash on F5 or SPA nav).
        // isKnownUrl covers post-refresh when bitmap isn't decoded yet but URL is in cache.
        background: ((imageLoaded || isKnownUrl) && finalImageUrl)
          ? `url("${finalImageUrl}") center/cover no-repeat, linear-gradient(to bottom right, #1f2937, #000000)`
          : 'linear-gradient(to bottom right, #1f2937, #000000)',
      }}
    >
      {/* Fallback letter - always rendered, hidden by image when loaded */}
      <div
        className="absolute inset-0 flex items-center justify-center text-white font-bold"
        style={{
          // Hide when image is loaded (image will cover this anyway, but this ensures clean state)
          opacity: imageLoaded ? 0 : 1,
          pointerEvents: 'none',
        }}
      >
        <span className="text-lg select-none">{firstLetter}</span>
      </div>

      {/* Image - always rendered, naturally covers background when loaded */}
      <img
        ref={imgRef}
        src={finalImageUrl!}
        alt={alt}
        width={width}
        height={height}
        onLoad={handleLoad}
        onError={handleError}
        loading={(priority || wasCachedAtMount.current || isKnownUrl) ? 'eager' : 'lazy'}
        decoding={(wasCachedAtMount.current || isKnownUrl) ? 'sync' : 'async'}
        fetchPriority={priority ? 'high' : 'auto'}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          // Hide img until loaded — prevents browser broken-icon flash.
          // Gradient+letter fallback shows through cleanly when opacity is 0.
          opacity: imageLoaded ? 1 : 0,
        }}
      />

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
    prevProps.onLoadFailed === nextProps.onLoadFailed
  );
});
