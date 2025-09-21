import { useEffect, useRef } from 'react';

interface PreloadImageOptions {
  priority?: boolean;
  timeout?: number;
}

export function useImagePreloader() {
  const preloadedImages = useRef<Set<string>>(new Set());

  const preloadImage = async (src: string | null, options: PreloadImageOptions = {}): Promise<boolean> => {
    if (!src) return false;

    // Check if already preloaded
    if (preloadedImages.current.has(src)) {
      return true;
    }

    return new Promise((resolve) => {
      const img = new Image();
      const timeout = options.timeout || 2000; // 2 second timeout for direct loading
      
      const cleanup = () => {
        clearTimeout(timeoutId);
        img.onload = null;
        img.onerror = null;
      };

      const timeoutId = setTimeout(() => {
        cleanup();
        resolve(false);
      }, timeout);

      img.onload = () => {
        cleanup();
        preloadedImages.current.add(src);
        console.log(`✅ Preloaded image: ${src}`);
        resolve(true);
      };

      img.onerror = () => {
        cleanup();
        console.log(`❌ Failed to preload: ${src}`);
        resolve(false);
      };

      // Set crossOrigin for CORS
      img.crossOrigin = 'anonymous';
      img.loading = options.priority ? 'eager' : 'lazy';
      
      img.src = src;
    });
  };

  const preloadImages = async (sources: (string | null)[], options: PreloadImageOptions = {}) => {
    const promises = sources.map(src => preloadImage(src, options));
    const results = await Promise.allSettled(promises);
    
    const successful = results.filter(result => result.status === 'fulfilled' && result.value).length;
    console.log(`🚀 Preloaded ${successful}/${sources.length} images`);
    
    return results;
  };

  return {
    preloadImage,
    preloadImages,
    isPreloaded: (src: string | null) => {
      if (!src) return false;
      return preloadedImages.current.has(src);
    }
  };
}
