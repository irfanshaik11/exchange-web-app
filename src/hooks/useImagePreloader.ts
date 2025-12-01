import { useEffect, useRef } from 'react';

interface PreloadImageOptions {
  priority?: boolean;
  timeout?: number;
}

export function useImagePreloader() {
  const preloadedImages = useRef<Set<string>>(new Set());

  const preloadImage = async (src: string | null, options: PreloadImageOptions = {}): Promise<boolean> => {
    if (!src) return false;

    // Use proxy for IPFS URLs, defined.fi, debridge, and other CORS-prone domains
    const needsProxy = src.includes('token-media.defined.fi') ||
      src.includes('ipfs.io') ||
      src.includes('cloudflare-ipfs.com') ||
      src.includes('gateway.pinata.cloud') ||
      src.includes('ipfs/') ||
      src.startsWith('ipfs://') ||
      src.includes('tokens.debridge.finance') ||
      src.includes('debridge.finance') ||
      src.includes('launchonsoar.com') ||
      src.includes('metadata.rapidlaunch.io') ||
      src.includes('rapidlaunch.io');

    const imageUrl = needsProxy 
      ? `/api/image?url=${encodeURIComponent(src)}`
      : src;

    // Check if already preloaded
    if (preloadedImages.current.has(imageUrl)) {
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
        preloadedImages.current.add(imageUrl);
        console.log(`✅ Preloaded image: ${imageUrl}`);
        resolve(true);
      };

      img.onerror = () => {
        cleanup();
        console.log(`❌ Failed to preload: ${imageUrl}`);
        resolve(false);
      };

      // Set crossOrigin for CORS (only needed for direct URLs)
      if (!imageUrl.startsWith('/api/image')) {
        img.crossOrigin = 'anonymous';
      }
      img.loading = options.priority ? 'eager' : 'lazy';
      
      // Load from proxy or direct URI
      img.src = imageUrl;
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
