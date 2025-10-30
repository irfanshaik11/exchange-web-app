type CacheEntry<T> = { data: T; ts: number; ttl: number };

const memory = new Map<string, CacheEntry<any>>();

export function getCached<T>(key: string): T | null {
  try {
    const entry = memory.get(key) || (typeof window !== 'undefined' ? JSON.parse(localStorage.getItem(key) || 'null') : null);
    if (!entry) return null;
    if (Date.now() - entry.ts > entry.ttl) return null;
    return entry.data as T;
  } catch {
    return null;
  }
}

export function setCached<T>(key: string, data: T, ttlMs = 15_000) {
  const entry: CacheEntry<T> = { data, ts: Date.now(), ttl: ttlMs };
  memory.set(key, entry);
  try { if (typeof window !== 'undefined') localStorage.setItem(key, JSON.stringify(entry)); } catch {}
}

