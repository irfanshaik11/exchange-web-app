/**
 * IndexedDB Cache for Pulse WebSocket Data
 *
 * Provides persistent storage for token data that survives:
 * - Tab refreshes
 * - Browser closes
 * - SharedWorker restarts
 *
 * The cache has a TTL to prevent showing stale data.
 */

const DB_NAME = 'pulse-websocket-cache';
const DB_VERSION = 1;
const STORE_NAME = 'tokens';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface PulseToken {
  mint: string;
  name: string;
  symbol: string;
  status: string;
  price_usd?: number;
  market_cap_usd?: number;
  volume_24h?: number;
  price_change_24h?: number;
  updated_at?: string;
  bonding_pct?: number;
  graduation_percent?: number;
  liquidity_usd?: number;
  bonding_curve_progress?: number;
  trade_type?: string;
  sol_amount?: number;
  token_amount?: number;
  launchpad_protocol?: string;
  pair_address?: string;
  image?: string;
  total_buy_volume_5m?: string | number;
  total_sell_volume_5m?: string | number;
  total_buy_volume_1h?: string | number;
  total_sell_volume_1h?: string | number;
  total_buy_volume_6h?: string | number;
  total_sell_volume_6h?: string | number;
  total_buy_volume_24h?: string | number;
  total_sell_volume_24h?: string | number;
  insider_percent?: number;
  sniper_percent?: number;
  dev_percent?: number;
  // Dev token tracking
  dev_tokens_created?: number;
  dev_tokens_migrated?: number;
  // Additional fields
  kol_count?: number;
  holder_count?: number;
}

export interface PulseCacheData {
  newTokens: PulseToken[];
  finalStretchTokens: PulseToken[];
  migratedTokens: PulseToken[];
  timestamp: number;
}

let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Open or get the IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[PulseCache] Failed to open database:', request.error);
      dbPromise = null;
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;

      // Handle database close (e.g., when browser closes DB)
      dbInstance.onclose = () => {
        dbInstance = null;
        dbPromise = null;
      };

      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });

  return dbPromise;
}

/**
 * Save pulse data to IndexedDB
 */
export async function savePulseCache(data: PulseCacheData): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const cacheEntry = {
      id: 'pulse-cache',
      ...data,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const request = store.put(cacheEntry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[PulseCache] Failed to save cache:', err);
  }
}

/**
 * Load pulse data from IndexedDB
 * Returns null if cache is expired or doesn't exist
 */
export async function loadPulseCache(): Promise<PulseCacheData | null> {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.get('pulse-cache');

      request.onsuccess = () => {
        const result = request.result;

        if (!result) {
          resolve(null);
          return;
        }

        // Check if cache is expired
        const age = Date.now() - (result.timestamp || 0);
        if (age > CACHE_TTL_MS) {
          // Cache is stale, delete it
          clearPulseCache().catch(() => {});
          resolve(null);
          return;
        }

        resolve({
          newTokens: result.newTokens || [],
          finalStretchTokens: result.finalStretchTokens || [],
          migratedTokens: result.migratedTokens || [],
          timestamp: result.timestamp,
        });
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[PulseCache] Failed to load cache:', err);
    return null;
  }
}

/**
 * Clear the pulse cache
 */
export async function clearPulseCache(): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.delete('pulse-cache');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[PulseCache] Failed to clear cache:', err);
  }
}

/**
 * Check if IndexedDB is available
 */
export function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

/**
 * Check if SharedWorker is available
 */
export function isSharedWorkerAvailable(): boolean {
  return typeof SharedWorker !== 'undefined';
}
