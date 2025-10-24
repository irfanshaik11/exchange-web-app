import { useMemo, useRef, useCallback, useState, useEffect } from 'react';

/**
 * Component-level caching utilities for expensive calculations and data processing
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  dependencies: any[];
}

interface ComponentCacheConfig {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum cache entries
}

class ComponentCache {
  private cache = new Map<string, CacheEntry<any>>();
  private config: Required<ComponentCacheConfig>;

  constructor(config: ComponentCacheConfig = {}) {
    this.config = {
      ttl: config.ttl || 60000, // 1 minute default
      maxSize: config.maxSize || 50,
    };
  }

  private generateKey(key: string, dependencies: any[]): string {
    const depsHash = dependencies.map(dep => 
      typeof dep === 'object' ? JSON.stringify(dep) : String(dep)
    ).join('|');
    return `${key}:${depsHash}`;
  }

  private isValid(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp < this.config.ttl;
  }

  private cleanup(): void {
    const now = Date.now();
    const entries = Array.from(this.cache.entries());
    
    // Remove expired entries
    entries.forEach(([key, entry]) => {
      if (!this.isValid(entry)) {
        this.cache.delete(key);
      }
    });

    // Enforce size limit
    if (this.cache.size > this.config.maxSize) {
      const sortedEntries = entries
        .filter(([_, entry]) => this.isValid(entry))
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = sortedEntries.slice(0, this.cache.size - this.config.maxSize);
      toRemove.forEach(([key]) => this.cache.delete(key));
    }
  }

  get<T>(key: string, dependencies: any[], computeFn: () => T): T {
    const cacheKey = this.generateKey(key, dependencies);
    const entry = this.cache.get(cacheKey);

    if (entry && this.isValid(entry)) {
      return entry.data;
    }

    const data = computeFn();
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now(),
      dependencies: [...dependencies],
    });

    this.cleanup();
    return data;
  }

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

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      entries: Array.from(this.cache.keys()),
    };
  }
}

// Global component cache instance
const componentCache = new ComponentCache({
  ttl: 60000, // 1 minute
  maxSize: 100,
});

/**
 * Hook for memoizing expensive calculations with component-level caching
 */
export function useComponentCache<T>(
  key: string,
  dependencies: any[],
  computeFn: () => T,
  config?: ComponentCacheConfig
): T {
  const localCache = useRef<ComponentCache>(
    config ? new ComponentCache(config) : componentCache
  );

  return useMemo(() => {
    return localCache.current.get(key, dependencies, computeFn);
  }, dependencies);
}

/**
 * Hook for caching expensive data transformations
 */
export function useCachedTransform<T, R>(
  data: T,
  transformFn: (data: T) => R,
  cacheKey: string,
  dependencies: any[] = []
): R {
  return useComponentCache(
    cacheKey,
    [data, ...dependencies],
    () => transformFn(data)
  );
}

/**
 * Hook for caching API responses with smart invalidation
 */
export function useCachedApiResponse<T>(
  key: string,
  dependencies: any[],
  fetchFn: () => Promise<T>,
  config?: ComponentCacheConfig & { 
    staleWhileRevalidate?: boolean;
    revalidateThreshold?: number;
  }
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchPromiseRef = useRef<Promise<void> | null>(null);

  const localCache = useRef<ComponentCache>(
    config ? new ComponentCache(config) : componentCache
  );

  const fetchData = useCallback(async () => {
    if (fetchPromiseRef.current) {
      return fetchPromiseRef.current;
    }

    const promise = (async () => {
      try {
        setLoading(true);
        setError(null);

        const result = await localCache.current.get(
          key,
          dependencies,
          fetchFn
        );

        setData(result);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    })();

    fetchPromiseRef.current = promise;
    await promise;
    fetchPromiseRef.current = null;
  }, [key, dependencies, fetchFn]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refetch = useCallback(async () => {
    localCache.current.invalidate(key);
    await fetchData();
  }, [key, fetchData]);

  return { data, loading, error, refetch };
}

/**
 * Hook for caching expensive calculations with debouncing
 */
export function useDebouncedCache<T>(
  key: string,
  dependencies: any[],
  computeFn: () => T,
  delay: number = 300
): T {
  const [debouncedDeps, setDebouncedDeps] = useState(dependencies);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      setDebouncedDeps(dependencies);
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, dependencies);

  return useComponentCache(key, debouncedDeps, computeFn);
}

/**
 * Hook for caching chart data with smart updates
 */
export function useCachedChartData<T>(
  pairAddress: string,
  interval: string,
  timeframe: string,
  fetchFn: () => Promise<T>,
  config?: ComponentCacheConfig
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  refetch: () => Promise<void>;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const cacheKey = `chart-${pairAddress}-${interval}-${timeframe}`;
  const dependencies = [pairAddress, interval, timeframe];

  const localCache = useRef<ComponentCache>(
    config ? new ComponentCache(config) : componentCache
  );

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await localCache.current.get(
        cacheKey,
        dependencies,
        fetchFn
      );

      setData(result);
      setLastUpdate(new Date());
    } catch (err: any) {
      setError(err.message || 'Failed to fetch chart data');
    } finally {
      setLoading(false);
    }
  }, [cacheKey, dependencies, fetchFn]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refetch = useCallback(async () => {
    localCache.current.invalidate(cacheKey);
    await fetchData();
  }, [cacheKey, fetchData]);

  return { data, loading, error, lastUpdate, refetch };
}

/**
 * Utility for clearing all component caches
 */
export function clearComponentCache(): void {
  componentCache.invalidate();
}

/**
 * Utility for getting cache statistics
 */
export function getComponentCacheStats() {
  return componentCache.getStats();
}

export default componentCache;
