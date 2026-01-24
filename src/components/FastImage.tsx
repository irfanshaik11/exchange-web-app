import React, { useState, useEffect, useRef, memo } from 'react';
import ImageBubble from './ImageBubble';
import { isMetadataUrl, resolveMetadataImage } from '~/utils/images';

/**
 * Global tracker for loaded image URLs with LRU eviction
 * Uses Map instead of Set to track access times for proper LRU
 */
const globalLoadedImages = new Map<string, number>(); // url -> last access timestamp
const MAX_TRACKED_IMAGES = 500;

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
  if (!src) return null;
  const alreadyProxied = src.startsWith('/api/') || src.startsWith('data:');
  const needsProxy = !alreadyProxied && src.startsWith('http');
  return needsProxy ? `/api/image?url=${encodeURIComponent(src)}` : src;
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
}: FastImageProps) {
  const inputSrc = src || fallbackSrc;

  // CRITICAL: Initialize resolvedSrc SYNCHRONOUSLY from props
  // Only use null for metadata URLs (which need async resolution)
  // This prevents the flicker caused by: null → effect sets value → re-render
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(() => {
    if (inputSrc && !isMetadataUrl(inputSrc)) {
      return inputSrc; // Regular URL - use immediately!
    }
    return null; // Metadata URL - will resolve in effect
  });

  // CRITICAL: Initialize imageLoaded from global tracker SYNCHRONOUSLY
  // This prevents: false → effect checks tracker → true → re-render
  const [imageLoaded, setImageLoaded] = useState(() => {
    const initialSrc = inputSrc && !isMetadataUrl(inputSrc) ? inputSrc : null;
    const initialUrl = computeImageUrl(initialSrc);
    return initialUrl ? isImageTracked(initialUrl) : false;
  });

  const [imageError, setImageError] = useState(false);
  const currentUrlRef = useRef<string | null>(null);

  // Get first letter for fallback
  const firstLetter = (() => {
    if (symbol && symbol.length > 0) return symbol.charAt(0).toUpperCase();
    if (name && name.length > 0) return name.charAt(0).toUpperCase();
    if (alt && alt.length > 0) return alt.charAt(0).toUpperCase();
    return '?';
  })();

  // Resolve metadata URLs (only runs for metadata URLs, not regular URLs)
  useEffect(() => {
    if (inputSrc && isMetadataUrl(inputSrc)) {
      resolveMetadataImage(inputSrc).then(resolved => {
        if (resolved) {
          setResolvedSrc(prev => prev === resolved ? prev : resolved);
        }
      });
    } else if (inputSrc) {
      // For regular URLs, only update if changed (prevents unnecessary re-renders)
      setResolvedSrc(prev => prev === inputSrc ? prev : inputSrc);
    } else {
      setResolvedSrc(prev => prev === null ? prev : null);
    }
  }, [inputSrc]);

  // Build final image URL
  const imageUrl = computeImageUrl(resolvedSrc);

  // Update ref and check tracker when URL changes
  useEffect(() => {
    if (!imageUrl) {
      setImageLoaded(false);
      setImageError(false);
      return;
    }

    currentUrlRef.current = imageUrl;

    // If already in global tracker, set loaded immediately
    if (isImageTracked(imageUrl)) {
      setImageLoaded(prev => prev ? prev : true); // Only update if not already true
      setImageError(false);
    } else {
      // New URL - don't reset imageLoaded (prevents flicker)
      // The img onLoad will set it to true when loaded
      setImageError(false);
    }
  }, [imageUrl]);

  const handleLoad = () => {
    setImageLoaded(true);
    setImageError(false);
    if (currentUrlRef.current) {
      trackLoadedImage(currentUrlRef.current);
    }
  };

  const handleError = () => {
    setImageError(true);
    setImageLoaded(false);
    // Remove from tracker on error so it can retry
    if (currentUrlRef.current) {
      globalLoadedImages.delete(currentUrlRef.current);
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
        // Background gradient serves as the "skeleton"
        background: 'linear-gradient(to bottom right, #1f2937, #000000)',
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
        src={imageUrl}
        alt={alt}
        width={width}
        height={height}
        onLoad={handleLoad}
        onError={handleError}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          // Image is always "visible" in DOM, browser just shows it when loaded
          display: 'block',
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
    prevProps.priority === nextProps.priority
  );
});
