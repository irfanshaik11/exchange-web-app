import { useState, useEffect, useCallback } from 'react';
import { rollingTradeCache } from '../utils/rollingTradeCache';

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
}

const CACHE_KEY_PREFIX = 'trade_data_';
const CACHE_EXPIRY_MS = 30000; // 30 seconds

interface CachedData {
  data: InitialTradeDataResponse;
  timestamp: number;
}

/**
 * Hook to fetch initial trade data with caching
 * This provides instant loading for repeat visits and fast REST fetching for first visits
 */
export default function useInitialTradeData(
  pairAddress: string | null,
  tokenAddress?: string
): UseInitialTradeDataResult {
  const [data, setData] = useState<InitialTradeDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);

  // Get cached data from localStorage
  const getCachedData = useCallback((pair: string): InitialTradeDataResponse | null => {
    try {
      const cacheKey = `${CACHE_KEY_PREFIX}${pair}`;
      const cached = localStorage.getItem(cacheKey);
      
      if (cached) {
        const parsed: CachedData = JSON.parse(cached);
        const age = Date.now() - parsed.timestamp;
        
        // Return cached data if not expired
        if (age < CACHE_EXPIRY_MS) {
          console.log(`[useInitialTradeData] Cache hit for ${pair} (age: ${Math.round(age / 1000)}s)`);
          return parsed.data;
        } else {
          console.log(`[useInitialTradeData] Cache expired for ${pair}`);
          localStorage.removeItem(cacheKey);
        }
      }
    } catch (err) {
      console.warn('[useInitialTradeData] Failed to read cache:', err);
    }
    return null;
  }, []);

  // Save data to cache
  const setCachedData = useCallback((pair: string, dataToCache: InitialTradeDataResponse) => {
    try {
      const cacheKey = `${CACHE_KEY_PREFIX}${pair}`;
      const cached: CachedData = {
        data: dataToCache,
        timestamp: Date.now(),
      };
      localStorage.setItem(cacheKey, JSON.stringify(cached));
      console.log(`[useInitialTradeData] Cached data for ${pair}`);
    } catch (err) {
      console.warn('[useInitialTradeData] Failed to cache data:', err);
    }
  }, []);

  // Fetch fresh data from API
  const fetchData = useCallback(async (pair: string, token?: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_GO_SERVICE_URL;
    
    try {
      console.log(`[useInitialTradeData] Fetching fresh data for ${pair}`);
      
      // Fetch trade data and stats in parallel for speed
      const requests: Promise<Response>[] = [
        fetch(`${baseUrl}/v1/trade/view?pair_address=${pair}`, {
          headers: {
            'accept': 'application/json',
            'X-API-Key': process.env.NEXT_PUBLIC_BACKEND_API_KEY || 'test-key',
          },
        })
      ];

      // Only fetch stats if we have token address
      if (token) {
        requests.push(
          fetch(`${baseUrl}/v1/ws/token-stats?pair_address=${pair}&token_address=${token}`, {
            headers: {
              'accept': 'application/json',
              'X-API-Key': process.env.NEXT_PUBLIC_BACKEND_API_KEY || 'test-key',
            },
          })
        );
      }

      const responses = await Promise.all(requests);
      
      // Parse responses
      const [tradesResponse, statsResponse] = responses;
      
      // Handle 404 gracefully - new tokens may not have trade data yet
      if (!tradesResponse.ok) {
        if (tradesResponse.status === 404) {
          console.log(`[useInitialTradeData] No trade data found for ${pair} (404 - likely new token)`);
          // Return empty data structure instead of erroring
          return {
            trades: [],
            stats: null,
            recentTrades: [],
          };
        }
        throw new Error(`Failed to fetch trades: ${tradesResponse.status}`);
      }

      const tradesData = await tradesResponse.json();
      let statsData = null;

      if (statsResponse && statsResponse.ok) {
        try {
          statsData = await statsResponse.json();
        } catch (err) {
          console.warn('[useInitialTradeData] Failed to parse stats:', err);
        }
      }

      // Extract trades from response
      const trades = tradesData.recentTrades || [];
      
      // Format stats data if available
      let formattedStats = null;
      if (statsData && statsData.data && statsData.data.timeframes) {
        formattedStats = {
          timeframes: statsData.data.timeframes
        };
      }

      const result: InitialTradeDataResponse = {
        trades,
        stats: formattedStats,
        recentTrades: tradesData.recentTrades,
      };

      console.log(`[useInitialTradeData] Fetched ${trades.length} trades`);
      
      return result;
    } catch (err: any) {
      console.error('[useInitialTradeData] Fetch error:', err);
      throw err;
    }
  }, []);

  // Main effect to load data
  useEffect(() => {
    if (!pairAddress) {
      setData(null);
      setLoading(false);
      setIsFromCache(false);
      return;
    }

    let mounted = true;

    const loadData = async () => {
      setLoading(true);
      setError(null);

      // Step 0: Check rolling cache first (INSTANT - 0ms for pulse tokens)
      console.log('[useInitialTradeData] Checking cache for:', { pairAddress, tokenAddress });

      if (tokenAddress) {
        const rollingCached = rollingTradeCache.getCachedTradeData(tokenAddress);
        if (rollingCached && mounted) {
          console.log('[useInitialTradeData] 🚀 INSTANT LOAD from rolling cache');
          setData({
            trades: rollingCached.trades,
            stats: rollingCached.stats ? { timeframes: rollingCached.stats } : null,
            recentTrades: rollingCached.trades,
          });
          setIsFromCache(true);
          setLoading(false);
          // Don't fetch fresh data - rolling cache is already fresh
          return;
        } else {
          console.log('[useInitialTradeData] Rolling cache returned null, checking localStorage cache...');
        }
      } else {
        console.log('[useInitialTradeData] No tokenAddress provided, skipping rolling cache');
      }

      // Step 1: Check localStorage cache (backup - 1ms)
      const cached = getCachedData(pairAddress);
      if (cached && mounted) {
        console.log('[useInitialTradeData] Displaying localStorage cached data');
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
          // Don't show error message for new tokens (404), just set empty data
          if (err.message && err.message.includes('404')) {
            console.log('[useInitialTradeData] New token detected, showing empty state');
            setData({ trades: [], stats: null, recentTrades: [] });
            setError(null);
          } else {
            setError(err.message || 'Failed to fetch initial data');
            // If we had cached data, keep showing it despite error
            if (!cached) {
              setData(null);
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

  return {
    data,
    loading,
    error,
    isFromCache,
    refetch,
  };
}

