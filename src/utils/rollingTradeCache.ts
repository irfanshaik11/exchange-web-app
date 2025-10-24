/**
 * Rolling Cache Manager for Pulse Table Tokens
 *
 * Maintains a cache of exactly the tokens visible in pulse tables (90 max: 30 per column)
 * - Automatically preloads trade data for visible tokens
 * - Evicts tokens when they leave the tables
 * - Provides instant loading for trade pages
 */

import type { Token } from './db';

interface CachedTradeData {
  tokenAddress: string;
  pairAddress: string;
  metadata: {
    name: string;
    symbol: string;
    image: string;
    price_usd: number;
    market_cap_usd: number;
    volume_24h?: number;
    holders?: number;
    bonding_curve_progress?: number | string;
  };
  trades: any[];
  stats: any;
  ohlcData?: any[];
  cachedAt: number;
}

class RollingTradeCacheManager {
  private static instance: RollingTradeCacheManager;
  private cache: Map<string, CachedTradeData>;
  private readonly MAX_CACHE_SIZE = 90; // 30 tokens × 3 columns
  private readonly CACHE_KEY = 'pulse_trade_cache';
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private syncInProgress = false;

  private constructor() {
    this.cache = new Map();
    this.loadFromLocalStorage();
  }

  static getInstance(): RollingTradeCacheManager {
    if (!RollingTradeCacheManager.instance) {
      RollingTradeCacheManager.instance = new RollingTradeCacheManager();
    }
    return RollingTradeCacheManager.instance;
  }

  /**
   * Update cache to match current pulse table tokens
   * This is called whenever pulse tokens change
   */
  async syncWithPulseTokens(
    newTokens: Token[],
    finalStretchTokens: Token[],
    migratedTokens: Token[]
  ): Promise<void> {
    // Prevent concurrent syncs
    if (this.syncInProgress) {
      console.log('[RollingCache] Sync already in progress, skipping');
      return;
    }

    this.syncInProgress = true;

    try {
      const allVisibleTokens = [
        ...newTokens.slice(0, 30),
        ...finalStretchTokens.slice(0, 30),
        ...migratedTokens.slice(0, 30)
      ];

      console.log(`[RollingCache] Syncing cache with ${allVisibleTokens.length} visible tokens`);

      // Step 1: Remove tokens that are no longer visible
      const visibleMints = new Set(allVisibleTokens.map(t => t.mint));
      const tokensToRemove: string[] = [];

      for (const [mint] of this.cache) {
        if (!visibleMints.has(mint)) {
          tokensToRemove.push(mint);
        }
      }

      tokensToRemove.forEach(mint => {
        console.log(`[RollingCache] 🗑️  Evicting token: ${mint.slice(0, 8)}...`);
        this.cache.delete(mint);
      });

      // Step 2: Preload trade data for new tokens (in background)
      const tokensToPreload = allVisibleTokens.filter(token => !this.cache.has(token.mint));

      if (tokensToPreload.length > 0) {
        console.log(`[RollingCache] 🔥 Preloading ${tokensToPreload.length} new tokens`);
        // Don't await - preload in background
        this.preloadTokens(tokensToPreload).catch(err => {
          console.warn('[RollingCache] Preload error:', err);
        });
      }

      // Step 3: Save to localStorage
      this.saveToLocalStorage();

      console.log(`[RollingCache] ✅ Cache synced. Size: ${this.cache.size}/${this.MAX_CACHE_SIZE}`);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Preload trade data for multiple tokens in parallel
   */
  private async preloadTokens(tokens: Token[]): Promise<void> {
    // Reduced concurrency to prevent overwhelming the backend
    const BATCH_SIZE = 3;

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE);
      const preloadPromises = batch.map(token => this.preloadSingleToken(token));

      // Use Promise.allSettled to continue even if some fail
      const results = await Promise.allSettled(preloadPromises);

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      // Reduced logging for performance
      if (process.env.NODE_ENV === 'development') {
        console.log(`[RollingCache] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${successful} success, ${failed} failed`);
      }

      // Increased delay to reduce backend load
      if (i + BATCH_SIZE < tokens.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * Preload trade data for a single token
   */
  private async preloadSingleToken(token: Token): Promise<void> {
    // Skip preload during SSR
    if (!this.isBrowser()) {
      return;
    }

    try {
      const baseUrl = process.env.NEXT_PUBLIC_GO_SERVICE_URL;
      if (!baseUrl) {
        throw new Error('NEXT_PUBLIC_GO_SERVICE_URL not configured');
      }

      // IMPORTANT: Only use pair_address, never mint address
      if (!token.pair_address) {
        console.log(`[RollingCache] ⏭️  Skipping ${token.symbol} - no pair_address available`);
        return;
      }

      const pairAddress = token.pair_address;
      const apiKey = process.env.NEXT_PUBLIC_BACKEND_API_KEY || 'test-key';

      // Reduced logging for performance
      if (process.env.NODE_ENV === 'development') {
        console.log(`[RollingCache] 📥 Preloading ${token.symbol}`);
      }

      // Fetch trade data (only /v1/trade/view, skip stats endpoint - it's optional and failing)
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
        console.warn(`[RollingCache] Request timeout for ${token.symbol} after 3 seconds`);
      }, 3000); // Reduced timeout to 3 seconds for faster loading

      const tradesRes = await fetch(`${baseUrl}/v1/trade/view?pair_address=${pairAddress}`, {
        headers: {
          'accept': 'application/json',
          'X-API-Key': apiKey,
        },
        signal: controller.signal,
      }).catch((err) => {
        console.log(`[RollingCache] ⚠️  Failed to fetch ${token.symbol}:`, err.message);
        return null;
      }).finally(() => clearTimeout(timeout));

      let trades: any[] = [];
      let stats: any = null;

      if (tradesRes && tradesRes.ok) {
        const tradesData = await tradesRes.json();
        trades = tradesData.recentTrades || [];
        // Reduced logging for performance
        if (process.env.NODE_ENV === 'development') {
          console.log(`[RollingCache] ✅ Fetched ${trades.length} trades for ${token.symbol}`);
        }
      } else {
        // Reduced logging for performance
        if (process.env.NODE_ENV === 'development') {
          console.log(`[RollingCache] ❌ No trade data for ${token.symbol} (${tradesRes?.status || 'timeout'})`);
        }
        return; // Don't cache if no data
      }

      // Cache the data
      const cachedData: CachedTradeData = {
        tokenAddress: token.mint,
        pairAddress: pairAddress,
        metadata: {
          name: token.name || '',
          symbol: token.symbol || '',
          image: token.logo || token.uri || '',
          price_usd: token.usd_price || 0,
          market_cap_usd: token.market_cap_usd || 0,
          volume_24h: token.total_buy_volume_24h || 0,
          holders: token.total_holders,
          bonding_curve_progress: token.bonding_curve_progress,
        },
        trades,
        stats,
        cachedAt: Date.now(),
      };

      this.cache.set(token.mint, cachedData);
      // Defer localStorage save to avoid blocking
      setTimeout(() => this.saveToLocalStorage(), 0);
      // Reduced logging for performance
      if (process.env.NODE_ENV === 'development') {
        console.log(`[RollingCache] ✅ Cached ${token.symbol}`);
      }

    } catch (error: any) {
      console.warn(`[RollingCache] ⚠️  Failed to preload ${token.symbol}:`, error.message);
    }
  }

  /**
   * Get cached trade data for a token
   */
  getCachedTradeData(mintAddress: string): CachedTradeData | null {
    if (!mintAddress) {
      return null;
    }

    const cached = this.cache.get(mintAddress);

    if (!cached) {
      return null;
    }

    // Check if cache is expired
    const age = Date.now() - cached.cachedAt;
    if (age > this.CACHE_TTL) {
      this.cache.delete(mintAddress);
      // Defer localStorage save to avoid blocking
      setTimeout(() => this.saveToLocalStorage(), 0);
      return null;
    }

    return cached;
  }

  /**
   * Check if token is in cache
   */
  isCached(mintAddress: string): boolean {
    const cached = this.cache.get(mintAddress);
    if (!cached) return false;

    // Check expiry
    const age = Date.now() - cached.cachedAt;
    return age <= this.CACHE_TTL;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      utilization: (this.cache.size / this.MAX_CACHE_SIZE) * 100,
      tokens: Array.from(this.cache.keys()).map(mint => mint.slice(0, 8) + '...'),
    };
  }

  /**
   * Clear all cache
   */
  clear(): void {
    console.log('[RollingCache] 🗑️  Clearing all cache');
    this.cache.clear();
    this.saveToLocalStorage();
  }

  /**
   * Check if we're in a browser environment (not SSR)
   */
  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  /**
   * Save cache to localStorage for persistence
   */
  private saveToLocalStorage(): void {
    if (!this.isBrowser()) return; // Skip during SSR

    try {
      const serialized = Array.from(this.cache.entries());
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(serialized));
    } catch (error) {
      console.warn('[RollingCache] Failed to save to localStorage:', error);
    }
  }

  /**
   * Load cache from localStorage on init
   */
  private loadFromLocalStorage(): void {
    if (!this.isBrowser()) {
      console.log('[RollingCache] Skipping localStorage load (SSR environment)');
      return; // Skip during SSR
    }

    try {
      const stored = localStorage.getItem(this.CACHE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.cache = new Map(parsed);

        // Remove expired entries
        const now = Date.now();
        for (const [mint, data] of this.cache) {
          if (now - data.cachedAt > this.CACHE_TTL) {
            this.cache.delete(mint);
          }
        }

        console.log(`[RollingCache] 📂 Loaded ${this.cache.size} tokens from localStorage`);
      }
    } catch (error) {
      console.warn('[RollingCache] Failed to load from localStorage:', error);
      this.cache.clear();
    }
  }
}

// Export singleton instance
export const rollingTradeCache = RollingTradeCacheManager.getInstance();

// React hook for easy integration
export function useRollingTradeCache() {
  return {
    getCachedTradeData: (mint: string) => rollingTradeCache.getCachedTradeData(mint),
    isCached: (mint: string) => rollingTradeCache.isCached(mint),
    getStats: () => rollingTradeCache.getStats(),
    clear: () => rollingTradeCache.clear(),
  };
}
