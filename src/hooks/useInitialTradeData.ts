
import { useState, useEffect, useCallback, useRef } from 'react';

const isDev = process.env.NODE_ENV !== 'production';


interface TradeData {
  pair_address: string;
  side: 'buy' | 'sell';
  amount: string;
  price: string;
  timestamp: string;
  maker: string;
  transactionHash: string;
}

interface TokenStats {
  timeframes: {
    [key: string]: {
      buys: number;
      sells: number;
      volume: number;
      buyVolume: number;
      sellVolume: number;
      change?: number;
    };
  };
}

interface InitialTradeDataResponse {
  trades: TradeData[];
  stats: TokenStats | null;
  recentTrades?: any[];
}

interface UseInitialTradeDataResult {
  data: InitialTradeDataResponse | null;
  loading: boolean;
  error: string | null;
  isFromCache: boolean;
  refetch: () => void;
  cacheStats: CacheStats;
  cleanupCache: () => void;
  cachedTokenMetadata: any | null; // Cached token metadata for instant display
}

const CACHE_KEY_PREFIX = 'trade_data_';
const CACHE_EXPIRY_MS = 30000; // 30 seconds
const BACKGROUND_REFRESH_THRESHOLD = 0.8; // Refresh when 80% of TTL has passed

interface CachedData {
  data: InitialTradeDataResponse;
  timestamp: number;
  version: number; // For cache invalidation
}

interface CacheStats {
  hits: number;
  misses: number;
  backgroundRefreshes: number;
}

/**
 * Hook to fetch initial trade data with caching
 * This provides instant loading for repeat visits and fast REST fetching for first visits
 */
export default function useInitialTradeData(
  pairAddress: string | null,
  tokenAddress?: string,
  chain: 'sol' | 'monad' = 'sol'
): UseInitialTradeDataResult {
  const [data, setData] = useState<InitialTradeDataResponse | null>(null);
  const [loading, setLoading] = useState(false); // Start with false for faster initial render
  const [error, setError] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const [cachedTokenMetadata, setCachedTokenMetadata] = useState<any | null>(null);

  // Enhanced cache management with background refresh
  const cacheStatsRef = useRef<CacheStats>({ hits: 0, misses: 0, backgroundRefreshes: 0 });
  const backgroundRefreshPromisesRef = useRef<Map<string, Promise<void>>>(new Map());

  // Get cached token metadata from localStorage
  const getCachedTokenMetadata = useCallback((pair: string): any | null => {
    try {
      const cacheKey = `token_metadata_${pair}`;
      const cached = localStorage.getItem(cacheKey);
      
      if (cached) {
        const parsed = JSON.parse(cached);
        const age = Date.now() - parsed.timestamp;
        
        // Return cached metadata if not expired (5 minutes)
        if (age < 300000) {
          isDev && console.log(`[useInitialTradeData] Using cached token metadata for ${pair}`);
          return parsed;
        } else {
          localStorage.removeItem(cacheKey);
        }
      }
    } catch (err) {
      console.warn('[useInitialTradeData] Failed to read token metadata cache:', err);
    }
    
    return null;
  }, []);

  // Get cached data from localStorage with enhanced logic
  const getCachedData = useCallback((pair: string): InitialTradeDataResponse | null => {
    try {
      const cacheKey = `${CACHE_KEY_PREFIX}${pair}`;
      const cached = localStorage.getItem(cacheKey);
      
      if (cached) {
        const parsed: CachedData = JSON.parse(cached);
        const age = Date.now() - parsed.timestamp;
        
        // Return cached data if not expired
        if (age < CACHE_EXPIRY_MS) {
          cacheStatsRef.current.hits++;
          
          // Trigger background refresh if needed
          if (age > CACHE_EXPIRY_MS * BACKGROUND_REFRESH_THRESHOLD) {
            triggerBackgroundRefresh(pair, tokenAddress);
          }
          
          return parsed.data;
        } else {
          localStorage.removeItem(cacheKey);
        }
      }
      
      cacheStatsRef.current.misses++;
    } catch (err) {
      console.warn('[useInitialTradeData] Failed to read cache:', err);
      cacheStatsRef.current.misses++;
    }
    return null;
  }, [tokenAddress]);

  // Background refresh function
  const triggerBackgroundRefresh = useCallback(async (pair: string, token?: string) => {
    const cacheKey = `${CACHE_KEY_PREFIX}${pair}`;
    
    // Avoid duplicate background refreshes
    if (backgroundRefreshPromisesRef.current.has(cacheKey)) {
      return;
    }

    const refreshPromise = (async () => {
      try {
        isDev && console.log(`[useInitialTradeData] Background refresh for ${pair}`);
        cacheStatsRef.current.backgroundRefreshes++;
        
        const freshData = await fetchData(pair, token);
        
        // Update cache with fresh data
        const cached: CachedData = {
          data: freshData,
          timestamp: Date.now(),
          version: Date.now(), // Use timestamp as version
        };
        localStorage.setItem(cacheKey, JSON.stringify(cached));
        
        isDev && console.log(`[useInitialTradeData] Background refresh completed for ${pair}`);
      } catch (err) {
        console.warn(`[useInitialTradeData] Background refresh failed for ${pair}:`, err);
      } finally {
        backgroundRefreshPromisesRef.current.delete(cacheKey);
      }
    })();

    backgroundRefreshPromisesRef.current.set(cacheKey, refreshPromise);
  }, []);

  // Save data to cache with version
  const setCachedData = useCallback((pair: string, dataToCache: InitialTradeDataResponse) => {
    try {
      const cacheKey = `${CACHE_KEY_PREFIX}${pair}`;
      const cached: CachedData = {
        data: dataToCache,
        timestamp: Date.now(),
        version: Date.now(),
      };
      localStorage.setItem(cacheKey, JSON.stringify(cached));
      isDev && console.log(`[useInitialTradeData] Cached data for ${pair}`);
    } catch (err) {
      console.warn('[useInitialTradeData] Failed to cache data:', err);
    }
  }, []);

  // token-stats fetch removed — unified token WS provides volume data directly
  const fetchData = useCallback(async (pair: string, token?: string) => {
    return {
      trades: [],
      stats: null,
      recentTrades: [],
    };
  }, []);

  // Main effect to load data
  useEffect(() => {
    if (!pairAddress) {
      setData(null);
      setLoading(false);
      setIsFromCache(false);
      setCachedTokenMetadata(null); // Reset cached metadata to prevent stale data
      return;
    }

    let mounted = true;

    const loadData = async () => {
      setLoading(true);
      setError(null);
      // Clear previous cached data immediately to prevent showing stale data
      setCachedTokenMetadata(null);
      setData(null);

      // Step 0: Load cached token metadata for instant display
      // Try mint first (new URL architecture), then fall back to pairAddress (old URLs)
      const cachedMetadata = (tokenAddress && getCachedTokenMetadata(tokenAddress)) || getCachedTokenMetadata(pairAddress);
      if (cachedMetadata && mounted) {
        setCachedTokenMetadata(cachedMetadata);
        isDev && console.log(`[useInitialTradeData] Loaded cached token metadata for ${tokenAddress || pairAddress}`);
      }

      // Step 1: Check localStorage cache (backup - 1ms)
      const cached = getCachedData(pairAddress);
      if (cached && mounted) {
        setData(cached);
        setIsFromCache(true);
        setLoading(false);
      }

      // Step 2: Fetch fresh data if not in rolling cache
      try {
        const freshData = await fetchData(pairAddress, tokenAddress);

        if (mounted) {
          setData(freshData);
          setIsFromCache(false);
          setLoading(false);
          setError(null);

          // Cache the fresh data only if it has trades
          if (freshData.trades && freshData.trades.length > 0) {
            setCachedData(pairAddress, freshData);
          }
        }
      } catch (err: any) {
        if (mounted) {
          // Handle different error types gracefully
          if (err.message && err.message.includes('404')) {
            isDev && console.log('[useInitialTradeData] New token detected, showing empty state');
            setData({ trades: [], stats: null, recentTrades: [] });
            setError(null);
          } else if (err.message && err.message.includes('timeout')) {
            console.warn('[useInitialTradeData] Request timeout, showing cached data if available');
            setError('Connection timeout. Showing cached data if available.');
            // Keep cached data if available, otherwise show empty state
            if (!cached) {
              setData({ trades: [], stats: null, recentTrades: [] });
            }
          } else {
            setError(err.message || 'Failed to fetch initial data');
            // If we had cached data, keep showing it despite error
            if (!cached) {
              setData({ trades: [], stats: null, recentTrades: [] });
            }
          }
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [pairAddress, tokenAddress, fetchData, getCachedData, setCachedData]);

  // Manual refetch function
  const refetch = useCallback(() => {
    if (!pairAddress) return;
    
    setLoading(true);
    fetchData(pairAddress, tokenAddress)
      .then((freshData) => {
        setData(freshData);
        setIsFromCache(false);
        setLoading(false);
        setError(null);
        
        // Cache only if there are trades
        if (freshData.trades && freshData.trades.length > 0) {
          setCachedData(pairAddress, freshData);
        }
      })
      .catch((err: any) => {
        // Handle 404 gracefully for new tokens
        if (err.message && err.message.includes('404')) {
          setData({ trades: [], stats: null, recentTrades: [] });
          setError(null);
        } else {
          setError(err.message || 'Failed to refetch data');
        }
        setLoading(false);
      });
  }, [pairAddress, tokenAddress, fetchData, setCachedData]);

  // Cache cleanup and stats
  const cleanupCache = useCallback(() => {
    try {
      const keys = Object.keys(localStorage).filter(key => key.startsWith(CACHE_KEY_PREFIX));
      const now = Date.now();
      
      keys.forEach(key => {
        const cached = localStorage.getItem(key);
        if (cached) {
          try {
            const parsed: CachedData = JSON.parse(cached);
            if (now - parsed.timestamp > CACHE_EXPIRY_MS) {
              localStorage.removeItem(key);
            }
          } catch {
            localStorage.removeItem(key);
          }
        }
      });
      
      isDev && console.log(`[useInitialTradeData] Cache cleanup completed. Stats:`, cacheStatsRef.current);
    } catch (err) {
      console.warn('[useInitialTradeData] Cache cleanup failed:', err);
    }
  }, []);

  // Cleanup cache on mount
  useEffect(() => {
    cleanupCache();
  }, [cleanupCache]);

  return {
    data,
    loading,
    error,
    isFromCache,
    refetch,
    cacheStats: cacheStatsRef.current,
    cleanupCache,
    cachedTokenMetadata,
  };
}

