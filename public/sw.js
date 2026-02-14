// @ts-nocheck
/**
 * Service Worker for Image Caching
 *
 * Caches token images for instant loading when returning to Pulse page.
 *
 * ONLY intercepts image requests - all other requests pass through untouched.
 * CANNOT interfere with WebSocket, IndexedDB, or other systems.
 */
/* eslint-disable no-restricted-globals */

const CACHE_NAME = 'pulse-image-cache-v1';
const MAX_CACHE_SIZE = 500; // Max images to cache (covers all 450 possible tokens)

/**
 * Check if a request is for an image
 * Matches:
 * - /api/image proxy requests (all token images go through this)
 * - Direct image URLs from any origin (*.png, *.jpg, *.gif, *.webp, *.avif, *.ico, *.svg)
 */
function isImageRequest(request) {
  const url = new URL(request.url);

  // Skip hash-based image proxy — browser HTTP cache handles these with immutable headers
  if (url.pathname.startsWith('/api/img/')) {
    return false;
  }

  // 1. Check if it's the legacy image proxy endpoint
  if (url.pathname.startsWith('/api/image')) {
    return true;
  }

  // 2. Check if it's a direct image URL (any origin)
  const imageExtensions = /\.(png|jpg|jpeg|gif|webp|avif|ico|svg)(\?.*)?$/i;
  if (imageExtensions.test(url.pathname)) {
    return true;
  }

  // 3. Check content-type for image requests without extensions
  const accept = request.headers.get('accept');
  if (accept && accept.includes('image/')) {
    return true;
  }

  return false;
}

/**
 * Trim cache to stay under MAX_CACHE_SIZE
 * Removes oldest entries (first added) when limit exceeded
 */
async function trimCache(cache) {
  try {
    const keys = await cache.keys();
    if (keys.length > MAX_CACHE_SIZE) {
      const deleteCount = keys.length - MAX_CACHE_SIZE;
      console.log(`[SW] Trimming cache: removing ${deleteCount} oldest images`);
      for (let i = 0; i < deleteCount; i++) {
        await cache.delete(keys[i]);
      }
    }
  } catch (err) {
    console.warn('[SW] Error trimming cache:', err);
  }
}

// Install event - activate immediately without waiting
self.addEventListener('install', (event) => {
  console.log('[SW] Installing image cache service worker');
  self.skipWaiting(); // Activate immediately
});

// Activate event - claim all clients immediately
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating image cache service worker');
  event.waitUntil(
    Promise.all([
      // Claim all open tabs immediately
      clients.claim(),
      // Clean up old cache versions if any
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('pulse-image-cache-') && name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      }),
    ])
  );
});

// Fetch event - cache-first strategy for images only
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Only handle image requests - everything else passes through
  if (!isImageRequest(event.request)) {
    return; // Don't call respondWith - let the request pass through normally
  }

  event.respondWith(
    (async () => {
      try {
        // 1. Try to get from cache first (instant!)
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          // Cache hit - return immediately
          return cachedResponse;
        }

        // 2. Not in cache - fetch from network
        const networkResponse = await fetch(event.request);

        // 3. Only cache successful responses
        if (networkResponse.ok) {
          // Clone the response (can only be read once)
          const responseToCache = networkResponse.clone();

          // Cache in background (don't block response)
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
            trimCache(cache); // Keep cache size under limit
          }).catch((err) => {
            console.warn('[SW] Failed to cache image:', err);
          });
        }

        return networkResponse;
      } catch (err) {
        // Network error - try to return cached version if available
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          console.log('[SW] Network error, returning cached image');
          return cachedResponse;
        }

        // No cache, no network - let it fail naturally
        throw err;
      }
    })()
  );
});

// Handle messages from main thread (for cache clearing, etc.)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_IMAGE_CACHE') {
    console.log('[SW] Clearing image cache');
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0]?.postMessage({ success: true });
    }).catch((err) => {
      event.ports[0]?.postMessage({ success: false, error: err.message });
    });
  }

  if (event.data && event.data.type === 'GET_CACHE_INFO') {
    caches.open(CACHE_NAME).then(async (cache) => {
      const keys = await cache.keys();
      event.ports[0]?.postMessage({
        count: keys.length,
        maxSize: MAX_CACHE_SIZE,
      });
    }).catch((err) => {
      event.ports[0]?.postMessage({ error: err.message });
    });
  }
});

console.log('[SW] Image cache service worker loaded');
