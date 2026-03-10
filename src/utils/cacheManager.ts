// Cache invalidation utilities for token data
const isDev = process.env.NODE_ENV !== 'production';

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
      isDev && console.log('All token caches invalidated');
    } catch (error) {
      console.warn('Failed to invalidate caches:', error);
    }
  }

  // Invalidate specific cache by key
  static invalidateCache(key: string): void {
    try {
      localStorage.removeItem(key);
      isDev && console.log(`Cache invalidated: ${key}`);
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
          isDev && console.log(`Cleaned up ${cleanedCount} expired cache entries`);
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

// All codex / trade cache prefixes that safeLocalStorageSet manages
const CODEX_PREFIXES = [
  'codex_trades_cache_',
  'codex_top_traders_cache_',
  'codex_dev_tokens_limited_cache_',
  'codex_dev_tokens_all_cache_',
  'trade_data_',
];

function isCodexKey(key: string): boolean {
  return CODEX_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * Sweep expired codex/trade entries from localStorage.
 * Each entry is expected to have a `timestamp` field; entries older than
 * `maxAge` ms (default 30 min) are removed.
 */
function sweepExpired(maxAge = 30 * 60 * 1000): void {
  const now = Date.now();
  for (const key of Object.keys(localStorage)) {
    if (!isCodexKey(key)) continue;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed.timestamp && now - parsed.timestamp > maxAge) {
        localStorage.removeItem(key);
      }
    } catch {
      // Corrupted entry — remove it
      localStorage.removeItem(key);
    }
  }
}

/**
 * Evict the oldest half of all codex/trade cache entries.
 */
function evictOldestHalf(): void {
  const entries: { key: string; timestamp: number }[] = [];
  for (const key of Object.keys(localStorage)) {
    if (!isCodexKey(key)) continue;
    try {
      const raw = localStorage.getItem(key);
      const ts = raw ? JSON.parse(raw).timestamp ?? 0 : 0;
      entries.push({ key, timestamp: ts });
    } catch {
      entries.push({ key, timestamp: 0 });
    }
  }
  entries.sort((a, b) => a.timestamp - b.timestamp);
  const removeCount = Math.max(1, Math.ceil(entries.length / 2));
  for (let i = 0; i < removeCount; i++) {
    localStorage.removeItem(entries[i].key);
  }
}

/**
 * Safely write to localStorage with proactive cleanup and retry.
 * Returns true on success, false on failure (cache miss is acceptable).
 */
export function safeLocalStorageSet(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    // Phase 1: proactively sweep expired codex entries
    sweepExpired();
    localStorage.setItem(key, value);
    return true;
  } catch {
    // Phase 2: quota exceeded — aggressively evict oldest half, retry once
    try {
      evictOldestHalf();
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}
