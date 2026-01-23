import React, { useState, useEffect, useRef } from 'react';
import ImageBubble from './ImageBubble';
import { isMetadataUrl, resolveMetadataImage } from '~/utils/images';

/**
 * Global tracker for loaded image URLs
 * Persists across all FastImage instances and re-renders
 * Prevents flickering when the same image URL is rendered multiple times
 * (e.g., same token in New Pairs → Final Stretch → Migrated)
 */
const globalLoadedImages = new Set<string>();

// Limit the Set size to prevent memory leaks (keep last 500 URLs)
const MAX_TRACKED_IMAGES = 500;
function trackLoadedImage(url: string) {
  if (globalLoadedImages.size >= MAX_TRACKED_IMAGES) {
    // Remove oldest entries (first 100)
    const iterator = globalLoadedImages.values();
    for (let i = 0; i < 100; i++) {
      const first = iterator.next().value;
      if (first) globalLoadedImages.delete(first);
    }
  }
  globalLoadedImages.add(url);
}

interface FastImageProps {
  src?: string | null;
  fallbackSrc?: string | null;
  alt?: string;
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean; // For new pairs tokens
  symbol?: string; // Token symbol for fallback letter
  name?: string; // Token name for fallback letter
  showBubble?: boolean; // Whether to show the pump logo bubble
  bubbleSrc?: string; // Custom bubble image source
}

// Direct image loading - no proxy or domain checking needed

export default function FastImage({
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
  const [imageError, setImageError] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);

  // Track if this specific image has loaded in this component instance
  const [imageLoaded, setImageLoaded] = useState(false);

  // Ref to track the current URL being loaded (prevents stale closure issues)
  const currentUrlRef = useRef<string | null>(null);

  const inputSrc = src || fallbackSrc;

  // If src is a metadata URL (JSON), resolve it to get actual image URL
  useEffect(() => {
    if (inputSrc && isMetadataUrl(inputSrc)) {
      // Don't fall back to metadata URL if resolution fails - that would try to load JSON as image
      resolveMetadataImage(inputSrc).then(resolved => {
        if (resolved) {
          setResolvedSrc(resolved);
        }
        // If null, keep resolvedSrc as null - shows fallback letter
        // TTL cache will allow retry after 30 seconds
      });
    } else {
      setResolvedSrc(inputSrc || null);
    }
  }, [inputSrc]);

  // Use resolved URL (or original if not metadata)
  const finalSrc = resolvedSrc;

  // When src changes, check if it's already in global cache
  // If yes, skip the loading state entirely (no flicker!)
  // If no, reset to loading state
  useEffect(() => {
    if (!resolvedSrc) {
      setImageLoaded(false);
      setImageError(false);
      return;
    }

    // Build the final URL to check against global tracker
    const alreadyProxiedCheck = resolvedSrc.startsWith('/api/') || resolvedSrc.startsWith('data:');
    const needsProxyCheck = !alreadyProxiedCheck && resolvedSrc.startsWith('http');
    const urlToCheck = needsProxyCheck
      ? `/api/image?url=${encodeURIComponent(resolvedSrc)}`
      : resolvedSrc;

    currentUrlRef.current = urlToCheck;

    // Check if this URL was already loaded globally
    if (globalLoadedImages.has(urlToCheck)) {
      // Already loaded before - show immediately, no flicker!
      setImageLoaded(true);
      setImageError(false);
    } else {
      // New URL - show loading state
      setImageLoaded(false);
      setImageError(false);
    }
  }, [resolvedSrc]);

  // Proxy all external URLs to avoid CORS issues
  // Don't proxy URLs that are already going through our API endpoints or are data URIs
  const alreadyProxied = finalSrc?.startsWith('/api/') || finalSrc?.startsWith('data:');

  // TEMPORARILY allowing ALL external domains through proxy
  // TODO: Re-enable domain restrictions when needed by uncommenting the block below
  const needsProxy = finalSrc && !alreadyProxied && finalSrc.startsWith('http');

  // COMMENTED OUT - Domain restrictions for future use:
  // const needsProxy = finalSrc && !alreadyProxied && (
  //   finalSrc.includes('token-media.defined.fi') ||
  //   finalSrc.includes('ipfs.io') ||
  //   finalSrc.includes('cloudflare-ipfs.com') ||
  //   finalSrc.includes('gateway.pinata.cloud') ||
  //   finalSrc.includes('ipfs/') ||
  //   finalSrc.startsWith('ipfs://') ||
  //   finalSrc.includes('tokens.debridge.finance') ||
  //   finalSrc.includes('debridge.finance') ||
  //   finalSrc.includes('launchonsoar.com') ||
  //   finalSrc.includes('metadata.rapidlaunch.io') ||
  //   finalSrc.includes('rapidlaunch.io') ||
  //   finalSrc.includes('metadata.j7tracker.com') ||
  //   finalSrc.includes('j7tracker.com') ||
  //   finalSrc.includes('edge.uxento.io') ||
  //   finalSrc.includes('uxento.io') ||
  //   finalSrc.includes('image.solanatracker.io') ||
  //   finalSrc.includes('ipfs-forward.solanatracker.io') ||
  //   finalSrc.includes('instagram.com') ||
  //   finalSrc.includes('cdninstagram.com') ||
  //   finalSrc.includes('ipfs.storacha.link') ||
  //   finalSrc.includes('storacha.link') ||
  //   finalSrc.includes('content.coinwave.gg') ||
  //   finalSrc.includes('digitaloceanspaces.com') ||
  //   finalSrc.includes('gateway.irys.xyz') ||
  //   finalSrc.includes('irys.xyz')
  // );

  const imageUrl = needsProxy && finalSrc
    ? `/api/image?url=${encodeURIComponent(finalSrc)}`
    : finalSrc;

  // Debug logging disabled for cleaner console
  // React.useEffect(() => {
  //   if (imageUrl) {
  //     console.log(`[FastImage] Loading image:`, imageUrl, `for ${symbol || name || alt}`);
  //   } else {
  //     console.warn(`[FastImage] No image URL provided for ${symbol || name || alt}`);
  //   }
  // }, [imageUrl, symbol, name, alt]);

  const handleLoad = () => {
    setImageLoaded(true);
    setImageError(false);

    // Track this URL globally so future renders skip loading state
    if (currentUrlRef.current) {
      trackLoadedImage(currentUrlRef.current);
    }
  };

  const handleError = () => {
    setImageError(true);
    setImageLoaded(false);
  };

  // Get the first letter for fallback display
  const getFirstLetter = () => {
    if (symbol && symbol.length > 0) {
      return symbol.charAt(0).toUpperCase();
    }
    if (name && name.length > 0) {
      return name.charAt(0).toUpperCase();
    }
    if (alt && alt.length > 0) {
      return alt.charAt(0).toUpperCase();
    }
    return '?';
  };

  // Only show fallback if there's truly no image URL or if there was an error
  // Don't show fallback while image is still loading
  if (!imageUrl) {
    return (
      <div
        className={`relative ${className} flex items-center justify-center bg-gradient-to-br from-gray-800 to-black text-white font-bold shadow-lg`}
        style={{ width, height }}
      >
        <span className="text-lg">{getFirstLetter()}</span>
        {showBubble && <ImageBubble src={bubbleSrc} />}
      </div>
    );
  }

  if (imageError) {
    // Show fallback on error but log for debugging
    return (
      <div
        className={`relative ${className} flex items-center justify-center bg-gradient-to-br from-gray-800 to-black text-white font-bold shadow-lg`}
        style={{ width, height }}
      >
        <span className="text-lg">{getFirstLetter()}</span>
        {showBubble && <ImageBubble src={bubbleSrc} />}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} style={{ width, height }}>
      {/* Loading placeholder - shown until image loads */}
      {!imageLoaded && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-800 to-black text-white font-bold shadow-lg"
        >
          <span className="text-lg">{getFirstLetter()}</span>
        </div>
      )}
      
      {/* Actual image - no fade transition for instant display */}
      <img
        key={imageUrl}
        src={imageUrl}
        alt={alt}
        width={width}
        height={height}
        className={imageLoaded ? 'opacity-100' : 'opacity-0'}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        onLoad={handleLoad}
        onError={handleError}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
      />
      
      {/* Pump logo bubble */}
      {showBubble && <ImageBubble src={bubbleSrc} />}
    </div>
  );
}
