import React, { useState } from 'react';
import ImageBubble from './ImageBubble';

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
  // Load images directly from URI - no optimization needed for speed
  const finalSrc = src || fallbackSrc;
  
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Use proxy for IPFS URLs, defined.fi, debridge, and other CORS-prone domains
  // IPFS gateways can have CORS restrictions, so proxy them
  const needsProxy = finalSrc && (
    finalSrc.includes('token-media.defined.fi') ||
    finalSrc.includes('ipfs.io') ||
    finalSrc.includes('cloudflare-ipfs.com') ||
    finalSrc.includes('gateway.pinata.cloud') ||
    finalSrc.includes('ipfs/') ||
    finalSrc.startsWith('ipfs://') ||
    finalSrc.includes('tokens.debridge.finance') ||
    finalSrc.includes('debridge.finance') ||
    finalSrc.includes('launchonsoar.com')
  );
  
  const imageUrl = needsProxy && finalSrc
    ? `/api/image?url=${encodeURIComponent(finalSrc)}`
    : finalSrc;

  // Debug logging to help diagnose image loading issues
  React.useEffect(() => {
    if (imageUrl) {
      console.log(`[FastImage] Loading image:`, imageUrl, `for ${symbol || name || alt}`);
    } else {
      console.warn(`[FastImage] No image URL provided for ${symbol || name || alt}`);
    }
  }, [imageUrl, symbol, name, alt]);

  const handleLoad = () => {
    console.log(`[FastImage] Image loaded successfully:`, imageUrl);
    setImageLoaded(true);
    setImageError(false);
  };

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.target as HTMLImageElement;
    console.error(`[FastImage] Image failed to load:`, imageUrl, `Error:`, {
      src: target.src,
      naturalWidth: target.naturalWidth,
      naturalHeight: target.naturalHeight,
    });
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
      {/* Loading skeleton */}
      {!imageLoaded && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-800 to-black text-white font-bold shadow-lg animate-pulse"
        >
          <span className="text-lg">{getFirstLetter()}</span>
        </div>
      )}
      
      {/* Actual image */}
      <img
        src={imageUrl}
        alt={alt}
        width={width}
        height={height}
        className={`transition-opacity duration-200 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        onLoad={handleLoad}
        onError={handleError}
        loading={priority ? 'eager' : 'lazy'} // Eager loading for priority images
        decoding="async"
      />
      
      {/* Pump logo bubble */}
      {showBubble && <ImageBubble src={bubbleSrc} />}
    </div>
  );
}
