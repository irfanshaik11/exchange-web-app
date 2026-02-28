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
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes - reduced from 30m to limit stale data

/**
 * PulseToken interface - MUST include BOTH PulseToken AND Token (db.ts) field names!
 * This ensures compatibility when casting between types in PulseTable.
 */
export interface PulseToken {
  mint: string;
  name: string;
  symbol: string;
  status: string;

  // Alternate mint field name
  mint_address?: string;

  // CRITICAL: created_at for age display
  // Backend sends launch_time as ISO string (e.g., "2025-01-22T10:30:00Z")
  created_at?: number | string;
  createdAt?: number | string;
  launch_time?: string | number;

  // Price fields (ALL format variants for Token + PulseToken compatibility)
  price?: number;
  price_usd?: number;
  usd_price?: number; // Token type uses usd_price
  priceChange5m?: number;
  price_change_5m?: number;
  price_percent_change_5m?: number; // Token type uses price_percent_change_*
  price_change_1h?: number;
  price_percent_change_1h?: number;
  price_change_6h?: number;
  price_percent_change_6h?: number;
  price_change_24h?: number;
  price_percent_change_24h?: number;

  // Market metrics (ALL format variants)
  marketCap?: number;
  market_cap_usd?: number;
  fully_diluted_value?: number; // Token type uses this
  volume?: number;
  volume_24h?: number;
  liquidity?: number;
  liquidity_usd?: number;
  total_liquidity_usd?: number; // Token type uses total_liquidity_usd

  // Bonding curve (ALL format variants)
  bondingCurveProgress?: number;
  bonding_curve_progress?: number | string; // Token type uses bonding_curve_progress
  bonding_pct?: number;
  graduation_percent?: number;

  // Holder counts (ALL field name variants)
  holder_count?: number;
  holders?: number;
  total_holders?: number; // Token type uses total_holders
  unique_wallets_24h?: number;

  // Transaction counts (all timeframes)
  // NOTE: total_buys_* = number of buy transactions, total_buyers_* = unique buyer wallets
  total_buys_24h?: number;
  total_sells_24h?: number;
  total_buys_5m?: number;
  total_sells_5m?: number;
  total_buys_1h?: number;
  total_sells_1h?: number;
  total_buys_6h?: number;
  total_sells_6h?: number;
  txns?: { buys: number; sells: number };

  // Unique buyers/sellers counts (different from transaction counts!)
  // Backend sends total_buyers_* (unique wallet count) vs total_buys_* (transaction count)
  total_buyers_5m?: number;
  total_sellers_5m?: number;
  total_buyers_1h?: number;
  total_sellers_1h?: number;
  total_buyers_6h?: number;
  total_sellers_6h?: number;
  total_buyers_24h?: number;
  total_sellers_24h?: number;

  // Unique wallets (all timeframes)
  unique_wallets_5m?: number;
  unique_wallets_1h?: number;
  unique_wallets_6h?: number;

  // Volume (all timeframes)
  total_buy_volume_5m?: string | number;
  total_sell_volume_5m?: string | number;
  total_buy_volume_1h?: string | number;
  total_sell_volume_1h?: string | number;
  total_buy_volume_6h?: string | number;
  total_sell_volume_6h?: string | number;
  total_buy_volume_24h?: string | number;
  total_sell_volume_24h?: string | number;

  // Percentage holdings (multiple field name variants)
  insider_percent?: number;
  insider_held_percentage?: number;
  sniper_percent?: number;
  sniper_held_percentage?: number;
  total_snipers?: number; // Token type field
  dev_percent?: number;
  dev_held_percentage?: number;
  bundle_percent?: number;
  bundled_percentage?: number;
  bundler_held_percentage?: number;
  bundle_wallet_count?: number;
  bundler_count?: number;

  // Top holders
  top10_holders_pct?: number;

  // Dev token tracking
  dev_tokens_created?: number;
  dev_tokens_migrated?: number;

  // KOL & Pro traders / Smart money
  kol_count?: number;
  pro_traders_count?: number;
  smart_money_count?: number;

  // Trade info
  trade_type?: string;
  sol_amount?: number;
  token_amount?: number;

  // Metadata
  launchpad_protocol?: string;
  pair_address?: string;
  image?: string;
  image_url?: string;
  logo?: string; // Token type uses 'logo'
  uri?: string;
  updated_at?: string;

  // Migrated pool (Token type field)
  migrated_pool_address?: string;

  // Total fees in lamports / gas
  total_fees_lamports?: number;
  global_fees_paid?: number;
  globalFeesPaid?: number;

  // String versions (some components may expect these)
  priceUSD?: string;
  marketCapUSD?: string;
  volume24h?: string;
  liquidityUSD?: string;
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
  // Check if existing instance is still valid
  if (dbInstance) {
    try {
      // Test if the connection is still open by checking objectStoreNames
      // This will throw if the connection is closed
      if (dbInstance.objectStoreNames.contains(STORE_NAME)) {
        return Promise.resolve(dbInstance);
      }
    } catch {
      // Connection is stale, reset and reopen
      console.log('[PulseCache] Stale connection detected, reopening...');
      dbInstance = null;
      dbPromise = null;
    }
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
