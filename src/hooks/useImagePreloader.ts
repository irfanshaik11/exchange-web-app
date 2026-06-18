import { useRef } from 'react';
import {
  computeHashImageUrl,
  isSpeculativeInterstateCdn,
} from '~/utils/imageHash';
import { isMetadataUrl, normalizeImageUrl } from '~/utils/images';
import {
  isImageDead,
  markImageAlive,
  recordImageFailure,
} from '~/utils/deadImageCache';

const isDev = process.env.NODE_ENV !== 'production';

interface PreloadImageOptions {
  priority?: boolean;
  timeout?: number;
}

function resolvePreloadUrl(src: string): string | null {
  if (isMetadataUrl(src)) return null;

  const normalized = normalizeImageUrl(src) || src;
  if (isSpeculativeInterstateCdn(normalized)) return null;
  if (normalized.startsWith('/api/')) return normalized;

  return computeHashImageUrl(normalized) || normalized;
}

export function useImagePreloader() {
  const preloadedImages = useRef<Set<string>>(new Set());

  const preloadImage = async (src: string | null, options: PreloadImageOptions = {}): Promise<boolean> => {
    if (!src) return false;

    const imageUrl = resolvePreloadUrl(src);
    if (!imageUrl || isImageDead(imageUrl)) return false;

    if (preloadedImages.current.has(imageUrl)) {
      return true;
    }

    return new Promise((resolve) => {
      const img = new Image();
      const timeout = options.timeout || 2000;

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
        markImageAlive(imageUrl);
        isDev && console.log(`Preloaded image: ${imageUrl}`);
        resolve(true);
      };

      img.onerror = () => {
        cleanup();
        recordImageFailure(imageUrl);
        isDev && console.log(`Failed to preload: ${imageUrl}`);
        resolve(false);
      };

      if (!imageUrl.startsWith('/api/')) {
        img.crossOrigin = 'anonymous';
      }
      img.loading = options.priority ? 'eager' : 'lazy';
      img.src = imageUrl;
    });
  };

  const preloadImages = async (sources: (string | null)[], options: PreloadImageOptions = {}) => {
    const promises = sources.map((src) => preloadImage(src, options));
    const results = await Promise.allSettled(promises);

    const successful = results.filter((result) => result.status === 'fulfilled' && result.value).length;
    isDev && console.log(`Preloaded ${successful}/${sources.length} images`);

    return results;
  };

  return {
    preloadImage,
    preloadImages,
    isPreloaded: (src: string | null) => {
      if (!src) return false;
      const imageUrl = resolvePreloadUrl(src);
      return imageUrl ? preloadedImages.current.has(imageUrl) : false;
    },
  };
}
