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

  // Use proxy for defined.fi URLs to avoid CORS issues
  const imageUrl = finalSrc?.includes('token-media.defined.fi') 
    ? `/api/image?url=${encodeURIComponent(finalSrc)}`
    : finalSrc;

  const handleLoad = () => {
    setImageLoaded(true);
    setImageError(false);
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

  if (!imageUrl || imageError) {
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
