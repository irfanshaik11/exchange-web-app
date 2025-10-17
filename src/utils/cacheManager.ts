// Cache invalidation utilities for token data
export class CacheManager {
  private static readonly CACHE_PREFIX = 'cached_tokens_';
  private static readonly LAUNCHPAD_CACHE_KEY = 'cached_launchpad_data';
  private static readonly PULSE_CACHE_KEY = 'cached_pulse_tokens';

  // Invalidate all token-related caches
  static invalidateAllCaches(): void {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(this.CACHE_PREFIX) || 
            key === this.LAUNCHPAD_CACHE_KEY || 
            key === this.PULSE_CACHE_KEY) {
          localStorage.removeItem(key);
        }
      });
      console.log('All token caches invalidated');
    } catch (error) {
      console.warn('Failed to invalidate caches:', error);
    }
  }

  // Invalidate specific cache by key
  static invalidateCache(key: string): void {
    try {
      localStorage.removeItem(key);
      console.log(`Cache invalidated: ${key}`);
    } catch (error) {
      console.warn(`Failed to invalidate cache ${key}:`, error);
    }
  }

  // Check if cache exists and is valid
  static isCacheValid(key: string, maxAge: number = 5 * 60 * 1000): boolean {
    try {
      const cached = localStorage.getItem(key);
      if (!cached) return false;

      const parsed = JSON.parse(cached);
      const now = Date.now();
      
      return now < parsed.expiresAt && (now - parsed.timestamp) < maxAge;
    } catch (error) {
      console.warn(`Failed to check cache validity for ${key}:`, error);
      return false;
    }
  }

  // Get cache age in milliseconds
  static getCacheAge(key: string): number {
    try {
      const cached = localStorage.getItem(key);
      if (!cached) return Infinity;

      const parsed = JSON.parse(cached);
      return Date.now() - parsed.timestamp;
    } catch (error) {
      console.warn(`Failed to get cache age for ${key}:`, error);
      return Infinity;
    }
  }

  // Force refresh all caches
  static async refreshAllCaches(): Promise<void> {
    this.invalidateAllCaches();
    
    // Trigger a page refresh to reload all data
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }

  // Set up automatic cache cleanup
  static setupCacheCleanup(): void {
    if (typeof window === 'undefined') return;

    // Clean up expired caches every 5 minutes
    setInterval(() => {
      try {
        const keys = Object.keys(localStorage);
        let cleanedCount = 0;
        
        keys.forEach(key => {
          if (key.startsWith(this.CACHE_PREFIX) || 
              key === this.LAUNCHPAD_CACHE_KEY || 
              key === this.PULSE_CACHE_KEY) {
            try {
              const cached = localStorage.getItem(key);
              if (cached) {
                const parsed = JSON.parse(cached);
                if (Date.now() > parsed.expiresAt) {
                  localStorage.removeItem(key);
                  cleanedCount++;
                }
              }
            } catch (error) {
              // Remove corrupted cache entries
              localStorage.removeItem(key);
              cleanedCount++;
            }
          }
        });
        
        if (cleanedCount > 0) {
          console.log(`Cleaned up ${cleanedCount} expired cache entries`);
        }
      } catch (error) {
        console.warn('Failed to clean up caches:', error);
      }
    }, 5 * 60 * 1000); // Every 5 minutes
  }
}

// Initialize cache cleanup on module load
if (typeof window !== 'undefined') {
  CacheManager.setupCacheCleanup();
}
