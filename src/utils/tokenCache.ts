/**
 * Token Data Cache Utility
 * Provides intelligent caching for token data with TTL and smart invalidation
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

export interface TokenCacheConfig {
  defaultTTL?: number; // Default TTL in milliseconds
  maxSize?: number; // Maximum cache entries
  enableBackgroundRefresh?: boolean; // Enable background refresh before expiry
}

class TokenCache {
  private cache = new Map<string, CacheEntry<any>>();
  private config: Required<TokenCacheConfig>;
  private refreshPromises = new Map<string, Promise<any>>();

  constructor(config: TokenCacheConfig = {}) {
    this.config = {
      defaultTTL: config.defaultTTL || 30000, // 30 seconds default
      maxSize: config.maxSize || 100,
      enableBackgroundRefresh: config.enableBackgroundRefresh ?? true,
    };
  }

  /**
   * Generate cache key from parameters
   */
  private getCacheKey(endpoint: string, params: Record<string, any> = {}): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    return `${endpoint}${sortedParams ? `?${sortedParams}` : ''}`;
  }

  /**
   * Check if cache entry is valid (not expired)
   */
  private isValid(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp < entry.ttl;
  }

  /**
   * Check if cache entry needs background refresh
   */
  private needsBackgroundRefresh(entry: CacheEntry<any>): boolean {
    if (!this.config.enableBackgroundRefresh) return false;
    const age = Date.now() - entry.timestamp;
    return age > entry.ttl * 0.8; // Refresh when 80% of TTL has passed
  }

  /**
   * Clean expired entries and enforce size limit
   */
  private cleanup(): void {
    const now = Date.now();
    const entries = Array.from(this.cache.entries());
    
    // Remove expired entries
    entries.forEach(([key, entry]) => {
      if (!this.isValid(entry)) {
        this.cache.delete(key);
      }
    });

    // Enforce size limit (remove oldest entries)
    if (this.cache.size > this.config.maxSize) {
      const sortedEntries = entries
        .filter(([_, entry]) => this.isValid(entry))
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = sortedEntries.slice(0, this.cache.size - this.config.maxSize);
      toRemove.forEach(([key]) => this.cache.delete(key));
    }
  }

  /**
   * Get data from cache or fetch if not available/expired
   */
  async get<T>(
    endpoint: string,
    params: Record<string, any> = {},
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const key = this.getCacheKey(endpoint, params);
    const entry = this.cache.get(key);
    const cacheTTL = ttl || this.config.defaultTTL;

    // Return cached data if valid
    if (entry && this.isValid(entry)) {
      // Trigger background refresh if needed
      if (this.needsBackgroundRefresh(entry)) {
        this.backgroundRefresh(key, fetcher, cacheTTL);
      }
      return entry.data;
    }

    // If already refreshing, wait for that promise
    if (this.refreshPromises.has(key)) {
      return this.refreshPromises.get(key)!;
    }

    // Fetch fresh data
    const fetchPromise = this.fetchAndCache(key, fetcher, cacheTTL);
    this.refreshPromises.set(key, fetchPromise);

    try {
      const result = await fetchPromise;
      return result;
    } finally {
      this.refreshPromises.delete(key);
    }
  }

  /**
   * Fetch data and cache it
   */
  private async fetchAndCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number
  ): Promise<T> {
    try {
      const data = await fetcher();
      this.cache.set(key, {
        data,
        timestamp: Date.now(),
        ttl,
      });
      this.cleanup();
      return data;
    } catch (error) {
      // If fetch fails and we have stale data, return it
      const entry = this.cache.get(key);
      if (entry) {
        console.warn('Fetch failed, returning stale data:', error);
        return entry.data;
      }
      throw error;
    }
  }

  /**
   * Background refresh without blocking
   */
  private async backgroundRefresh<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number
  ): Promise<void> {
    try {
      const data = await fetcher();
      this.cache.set(key, {
        data,
        timestamp: Date.now(),
        ttl,
      });
      this.cleanup();
    } catch (error) {
      console.warn('Background refresh failed:', error);
    }
  }

  /**
   * Invalidate specific cache entries
   */
  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }

    const keysToDelete = Array.from(this.cache.keys()).filter(key =>
      key.includes(pattern)
    );
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    entries: Array<{ key: string; age: number; ttl: number; valid: boolean }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      age: now - entry.timestamp,
      ttl: entry.ttl,
      valid: this.isValid(entry),
    }));

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      entries,
    };
  }

  /**
   * Preload data for common endpoints
   */
  async preload<T>(
    endpoint: string,
    params: Record<string, any> = {},
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<void> {
    const key = this.getCacheKey(endpoint, params);
    const entry = this.cache.get(key);

    // Only preload if not already cached or expired
    if (!entry || !this.isValid(entry)) {
      this.backgroundRefresh(key, fetcher, ttl || this.config.defaultTTL);
    }
  }
}

// Create singleton instance
export const tokenCache = new TokenCache({
  defaultTTL: 30000, // 30 seconds
  maxSize: 50,
  enableBackgroundRefresh: true,
});

// Cache configuration for different data types
export const CACHE_CONFIGS = {
  // Short TTL for real-time data
  REALTIME: {
    ttl: 10000, // 10 seconds
  },
  // Medium TTL for frequently updated data
  FREQUENT: {
    ttl: 30000, // 30 seconds
  },
  // Longer TTL for relatively stable data
  STABLE: {
    ttl: 120000, // 2 minutes
  },
  // Very long TTL for static data
  STATIC: {
    ttl: 600000, // 10 minutes
  },
} as const;

/**
 * Utility function to create cached fetchers
 */
export function createCachedFetcher<T>(
  endpoint: string,
  fetcher: (params?: Record<string, any>) => Promise<T>,
  config: { ttl?: number; params?: Record<string, any> } = {}
) {
  return async (params: Record<string, any> = {}) => {
    const mergedParams = { ...config.params, ...params };
    return tokenCache.get(
      endpoint,
      mergedParams,
      () => fetcher(mergedParams),
      config.ttl
    );
  };
}

/**
 * Batch multiple cache operations
 */
export async function batchCacheOperations<T>(
  operations: Array<{
    endpoint: string;
    params?: Record<string, any>;
    fetcher: () => Promise<T>;
    ttl?: number;
  }>
): Promise<T[]> {
  const promises = operations.map(({ endpoint, params, fetcher, ttl }) =>
    tokenCache.get(endpoint, params || {}, fetcher, ttl)
  );

  return Promise.all(promises);
}

/**
 * Prefetch token data for trade page
 * Non-blocking - fires and forgets
 */
export async function prefetchTradeData(address: string, pairAddress?: string): Promise<void> {
  if (!address) return;

  try {
    console.log('[TokenCache] Prefetching trade data for:', address);

    // Use preload method for non-blocking cache population
    const baseUrl = process.env.NEXT_PUBLIC_GO_SERVICE_URL;

    await tokenCache.preload(
      '/v1/trade/view',
      { pair_address: pairAddress || address },
      async () => {
        const response = await fetch(`${baseUrl}/v1/trade/view?pair_address=${pairAddress || address}`);
        if (!response.ok) throw new Error('Failed to fetch');
        return response.json();
      },
      CACHE_CONFIGS.FREQUENT.ttl
    );
  } catch (error) {
    console.warn('[TokenCache] Prefetch failed for:', address, error);
    // Silent fail - prefetch is best-effort
  }
}

/**
 * Get cached trade data if available
 */
export async function getCachedTradeData(pairAddress: string): Promise<any | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_GO_SERVICE_URL;

    return await tokenCache.get(
      '/v1/trade/view',
      { pair_address: pairAddress },
      async () => {
        const response = await fetch(`${baseUrl}/v1/trade/view?pair_address=${pairAddress}`);
        if (!response.ok) throw new Error('Failed to fetch');
        return response.json();
      },
      CACHE_CONFIGS.FREQUENT.ttl
    );
  } catch (error) {
    console.error('[TokenCache] Failed to get trade data:', error);
    return null;
  }
}
