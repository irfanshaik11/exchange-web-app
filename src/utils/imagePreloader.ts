/**
 * Image Preloader Utility
 * Preloads images for instant display in tables
 */

// Track preloaded images to avoid duplicate requests
const preloadedImages = new Set<string>();

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

    // Check if already loaded/cached by browser
    const img = new Image();
    
    img.onload = () => {
      preloadedImages.add(src);
      resolve();
    };
    
    img.onerror = () => {
      // Don't reject - just resolve silently (image might fail to load)
      // Still mark as attempted to avoid retrying failed images
      preloadedImages.add(src);
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
    priority?: 'high' | 'low' | 'auto';
  } = {}
): Promise<void> {
  const { maxConcurrent = 10, priority = 'auto' } = options;
  
  // Filter out null/undefined/empty URLs
  const validUrls = urls.filter((url): url is string => 
    Boolean(url && typeof url === 'string' && url.trim().length > 0)
  );

  if (validUrls.length === 0) {
    return;
  }

  // Process in batches to avoid overwhelming the browser
  for (let i = 0; i < validUrls.length; i += maxConcurrent) {
    const batch = validUrls.slice(i, i + maxConcurrent);
    
    await Promise.allSettled(
      batch.map(url => {
        // Use link preload for high priority images
        if (priority === 'high' && typeof document !== 'undefined') {
          const link = document.createElement('link');
          link.rel = 'preload';
          link.as = 'image';
          link.href = url;
          link.fetchPriority = 'high';
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
      })
    );
  }
}

/**
 * Extract image URLs from token array
 */
export function extractImageUrls(tokens: any[]): string[] {
  return tokens
    .map(token => {
      // Check multiple possible image fields
      return (
        token?.image ||
        token?.image_url ||
        token?.imageUrl ||
        token?.logo ||
        token?.logoUrl ||
        token?.logo_url ||
        token?.uri ||
        token?.icon ||
        token?.thumbnail ||
        null
      );
    })
    .filter((url): url is string => Boolean(url && typeof url === 'string'));
}

/**
 * Preload images for tokens (with smart prioritization)
 */
export async function preloadTokenImages(
  tokens: any[],
  options: {
    maxConcurrent?: number;
    priority?: 'high' | 'low' | 'auto';
    limit?: number; // Limit number of images to preload (for above-the-fold)
  } = {}
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

