import { useCallback, useEffect, useRef } from 'react';
import { env } from '../env';

/**
 * Prefetching utilities for trade page optimization
 * Provides intelligent prefetching of related data to improve perceived performance
 */

interface PrefetchConfig {
  enabled?: boolean;
  delay?: number; // Delay before prefetching (ms)
  priority?: 'high' | 'medium' | 'low';
  timeout?: number; // Request timeout (ms)
}

interface PrefetchTask {
  id: string;
  url: string;
  config: PrefetchConfig;
  promise?: Promise<any>;
  timestamp: number;
}

class PrefetchManager {
  private tasks = new Map<string, PrefetchTask>();
  private cache = new Map<string, { data: any; timestamp: number }>();
  private maxCacheSize = 50;
  private defaultTTL = 300000; // 5 minutes

  async prefetch(
    id: string,
    url: string,
    config: PrefetchConfig = {}
  ): Promise<any> {
    const {
      enabled = true,
      delay = 0,
      priority = 'medium',
      timeout = 10000,
    } = config;

    if (!enabled) return null;

    // Check if already cached
    const cached = this.cache.get(id);
    if (cached && Date.now() - cached.timestamp < this.defaultTTL) {
      return cached.data;
    }

    // Check if already prefetching
    const existingTask = this.tasks.get(id);
    if (existingTask?.promise) {
      return existingTask.promise;
    }

    const task: PrefetchTask = {
      id,
      url,
      config,
      timestamp: Date.now(),
    };

    const promise = this.executePrefetch(task, timeout);
    task.promise = promise;
    this.tasks.set(id, task);

    // Cleanup after completion
    promise.finally(() => {
      this.tasks.delete(id);
    });

    return promise;
  }

  private isValidHttpEndpoint(url: string): boolean {
    // Don't prefetch WebSocket endpoints or invalid URLs
    if (url.includes('/ws/') || url.includes('wss://') || url.includes('ws://')) {
      return false;
    }
    return url.startsWith('http://') || url.startsWith('https://');
  }

  private async executePrefetch(task: PrefetchTask, timeout: number): Promise<any> {
    // Validate that this is a proper HTTP endpoint
    if (!this.isValidHttpEndpoint(task.url)) {
      console.warn(`[PrefetchManager] Skipping invalid endpoint: ${task.url}`);
      return null;
    }

    try {
      // Add delay if specified
      if (task.config.delay && task.config.delay > 0) {
        await new Promise(resolve => setTimeout(resolve, task.config.delay));
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        try {
          controller.abort();
        } catch (error) {
          // Ignore abort errors - they're expected
        }
      }, timeout);

      const response = await fetch(task.url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Handle different HTTP error codes gracefully
        if (response.status === 400) {
          console.warn(`[PrefetchManager] Bad request for ${task.id} - skipping`);
          return null;
        } else if (response.status === 404) {
          console.warn(`[PrefetchManager] Resource not found for ${task.id} - skipping`);
          return null;
        } else if (response.status >= 500) {
          console.warn(`[PrefetchManager] Server error for ${task.id} - skipping`);
          return null;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Cache the result
      this.cache.set(task.id, {
        data,
        timestamp: Date.now(),
      });

      // Cleanup cache if needed
      this.cleanupCache();

      console.log(`[PrefetchManager] Prefetched ${task.id}`);
      return data;
    } catch (error) {
      // Handle abort errors gracefully
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(`[PrefetchManager] Prefetch aborted for ${task.id} (timeout)`);
        return null;
      }
      
      // Handle fetch errors gracefully
      if (error instanceof Error && error.message.includes('HTTP 4')) {
        console.warn(`[PrefetchManager] Client error for ${task.id}:`, error.message);
        return null;
      }
      
      console.warn(`[PrefetchManager] Prefetch failed for ${task.id}:`, error);
      return null; // Return null instead of throwing to prevent crashes
    }
  }

  private cleanupCache(): void {
    if (this.cache.size <= this.maxCacheSize) return;

    const entries = Array.from(this.cache.entries());
    const sortedEntries = entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toRemove = sortedEntries.slice(0, this.cache.size - this.maxCacheSize);
    toRemove.forEach(([key]) => this.cache.delete(key));
  }

  getCached(id: string): any | null {
    const cached = this.cache.get(id);
    if (cached && Date.now() - cached.timestamp < this.defaultTTL) {
      return cached.data;
    }
    return null;
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
      cacheSize: this.cache.size,
      activeTasks: this.tasks.size,
      tasks: Array.from(this.tasks.values()).map(task => ({
        id: task.id,
        url: task.url,
        age: Date.now() - task.timestamp,
      })),
    };
  }
}

// Global prefetch manager instance
const prefetchManager = new PrefetchManager();

/**
 * Hook for prefetching trade page data
 */
export function useTradePagePrefetch(
  pairAddress: string | null,
  tokenAddress?: string
) {
  const prefetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const prefetchTradeData = useCallback(async () => {
    if (!pairAddress) return;

    try {
      const baseUrl = env.NEXT_PUBLIC_GO_SERVICE_URL;
      
      // Prefetch trade data
      await prefetchManager.prefetch(
        `trade-data-${pairAddress}`,
        `${baseUrl}/v1/trade/view?pair_address=${pairAddress}`,
        {
          enabled: true,
          delay: 100, // Small delay to not interfere with initial load
          priority: 'high',
          timeout: 5000,
        }
      );

      // Prefetch stats if token address is available (HTTP endpoint only)
      if (tokenAddress) {
        await prefetchManager.prefetch(
          `token-stats-${pairAddress}`,
          `${baseUrl}/v1/token/stats?pair_address=${pairAddress}&token_address=${tokenAddress}`,
          {
            enabled: true,
            delay: 200,
            priority: 'medium',
            timeout: 5000,
          }
        );
      }

      // Prefetch OHLC data
      await prefetchManager.prefetch(
        `ohlc-data-${pairAddress}`,
        `${baseUrl}/v1/trade/ohlc-data?pair_address=${pairAddress}&interval=1m&timeframe=24h`,
        {
          enabled: true,
          delay: 300,
          priority: 'medium',
          timeout: 8000,
        }
      );

    } catch (error) {
      console.warn('[useTradePagePrefetch] Prefetch failed:', error);
    }
  }, [pairAddress, tokenAddress]);

  // Trigger prefetch with debouncing
  useEffect(() => {
    if (prefetchTimeoutRef.current) {
      clearTimeout(prefetchTimeoutRef.current);
    }

    prefetchTimeoutRef.current = setTimeout(() => {
      prefetchTradeData();
    }, 500); // Debounce prefetch by 500ms

    return () => {
      if (prefetchTimeoutRef.current) {
        clearTimeout(prefetchTimeoutRef.current);
      }
    };
  }, [prefetchTradeData]);

  return {
    prefetchTradeData,
    getCachedData: (id: string) => prefetchManager.getCached(id),
    getStats: () => prefetchManager.getStats(),
  };
}

/**
 * Hook for prefetching related token data
 */
export function useRelatedTokenPrefetch(
  currentToken: any,
  enabled: boolean = true
) {
  const prefetchRelatedTokens = useCallback(async () => {
    if (!enabled || !currentToken?.mint) return;

    try {
      const baseUrl = env.NEXT_PUBLIC_GO_SERVICE_URL;
      
      // Prefetch similar tokens by protocol
      if (currentToken.launchpad_protocol) {
        await prefetchManager.prefetch(
          `similar-tokens-${currentToken.launchpad_protocol}`,
          `${baseUrl}/v1/token-service/search?protocol=${currentToken.launchpad_protocol}&limit=10`,
          {
            enabled: true,
            delay: 1000,
            priority: 'low',
            timeout: 10000,
          }
        );
      }

      // Prefetch top traders for this token
      await prefetchManager.prefetch(
        `top-traders-${currentToken.mint}`,
        `${baseUrl}/v1/trade/top-traders?token=${currentToken.mint}`,
        {
          enabled: true,
          delay: 1500,
          priority: 'low',
          timeout: 10000,
        }
      );

    } catch (error) {
      console.warn('[useRelatedTokenPrefetch] Prefetch failed:', error);
    }
  }, [currentToken, enabled]);

  useEffect(() => {
    if (enabled && currentToken?.mint) {
      const timeoutId = setTimeout(prefetchRelatedTokens, 2000);
      return () => clearTimeout(timeoutId);
    }
  }, [prefetchRelatedTokens, enabled, currentToken?.mint]);

  return {
    prefetchRelatedTokens,
    getCachedData: (id: string) => prefetchManager.getCached(id),
  };
}

/**
 * Hook for intelligent prefetching based on user behavior
 */
export function useSmartPrefetch(
  pairAddress: string | null,
  userBehavior: {
    timeOnPage: number;
    scrollDepth: number;
    interactionCount: number;
  }
) {
  const prefetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const triggerSmartPrefetch = useCallback(async () => {
    if (!pairAddress) return;

    const { timeOnPage, scrollDepth, interactionCount } = userBehavior;
    
    // Determine prefetch priority based on user engagement
    let priority: 'high' | 'medium' | 'low' = 'low';
    let delay = 2000;

    if (timeOnPage > 10000 || scrollDepth > 0.5 || interactionCount > 3) {
      priority = 'high';
      delay = 500;
    } else if (timeOnPage > 5000 || scrollDepth > 0.2 || interactionCount > 1) {
      priority = 'medium';
      delay = 1000;
    }

    try {
      const baseUrl = env.NEXT_PUBLIC_GO_SERVICE_URL;
      
      // Prefetch additional data based on engagement
      if (priority === 'high') {
        // Prefetch historical data
        await prefetchManager.prefetch(
          `historical-trades-${pairAddress}`,
          `${baseUrl}/v1/trade/history?pair_address=${pairAddress}&limit=100`,
          {
            enabled: true,
            delay,
            priority,
            timeout: 10000,
          }
        );

        // Prefetch holder data
        await prefetchManager.prefetch(
          `holders-${pairAddress}`,
          `${baseUrl}/v1/token/holders?pair_address=${pairAddress}`,
          {
            enabled: true,
            delay: delay + 500,
            priority,
            timeout: 10000,
          }
        );
      }

    } catch (error) {
      console.warn('[useSmartPrefetch] Smart prefetch failed:', error);
    }
  }, [pairAddress, userBehavior]);

  useEffect(() => {
    if (prefetchTimeoutRef.current) {
      clearTimeout(prefetchTimeoutRef.current);
    }

    prefetchTimeoutRef.current = setTimeout(() => {
      triggerSmartPrefetch();
    }, 1000);

    return () => {
      if (prefetchTimeoutRef.current) {
        clearTimeout(prefetchTimeoutRef.current);
      }
    };
  }, [triggerSmartPrefetch]);

  return {
    triggerSmartPrefetch,
    getCachedData: (id: string) => prefetchManager.getCached(id),
  };
}

/**
 * Utility for clearing all prefetch caches
 */
export function clearPrefetchCache(): void {
  prefetchManager.invalidate();
}

/**
 * Utility for getting prefetch statistics
 */
export function getPrefetchStats() {
  return prefetchManager.getStats();
}

export default prefetchManager;
