type CacheEntry<T> = { data: T; ts: number; ttl: number; chain?: string };

const memory = new Map<string, CacheEntry<any>>();

export function getCached<T>(key: string): T | null {
  try {
    // Check memory cache first (fastest)
    const memoryEntry = memory.get(key);
    if (memoryEntry) {
      const age = Date.now() - memoryEntry.ts;
      if (age < memoryEntry.ttl) {
        return memoryEntry.data as T;
      } else {
        // Expired, remove from memory
        memory.delete(key);
      }
    }
    
    // Check localStorage (persists across page reloads and chain switches)
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(key);
      if (stored) {
        const entry: CacheEntry<T> = JSON.parse(stored);
        const age = Date.now() - entry.ts;
        if (age < entry.ttl) {
          // Restore to memory cache for faster access
          memory.set(key, entry);
          return entry.data as T;
        } else {
          // Expired, remove from localStorage
          localStorage.removeItem(key);
        }
      }
    }
    
    return null;
  } catch (err) {
    console.warn('[Cache] Error reading cache:', err);
    return null;
  }
}

export function setCached<T>(key: string, data: T, ttlMs = 15_000) {
  const entry: CacheEntry<T> = { data, ts: Date.now(), ttl: ttlMs };
  
  // Store in memory (fast access)
  memory.set(key, entry);
  
  // Also store in localStorage (persists across page reloads and chain switches)
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(entry));
    }
  } catch (err) {
    // localStorage might be full or disabled, that's okay - memory cache still works
    console.warn('[Cache] Failed to write to localStorage:', err);
  }
}

