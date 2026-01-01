import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';

interface OHLCData {
  unix_time: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v_usd: number;
}

interface UseBackgroundOHLCPreloadResult {
  backgroundData: OHLCData[] | null;
  isPreloading: boolean;
  preloadComplete: boolean;
}

// Global cache to persist OHLC data across page loads
const globalOHLCCache = new Map<string, { data: OHLCData[]; timestamp: number; mint: string }>();
const CACHE_DURATION = 30000; // 30 seconds

// Clean up stale cache entries periodically
const cleanupCache = () => {
  const now = Date.now();
  for (const [key, value] of globalOHLCCache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      globalOHLCCache.delete(key);
      console.log('[Background OHLC] Cleaned up stale cache entry:', key);
    }
  }
};

// Run cleanup every 10 seconds
setInterval(cleanupCache, 10000);

export default function useBackgroundOHLCPreload(interval: string = '1h', timeframe: string = '30d'): UseBackgroundOHLCPreloadResult {
  const router = useRouter();
  const [backgroundData, setBackgroundData] = useState<OHLCData[] | null>(null);
  const [isPreloading, setIsPreloading] = useState(false);
  const [preloadComplete, setPreloadComplete] = useState(false);
  const fetchRef = useRef<Promise<void> | null>(null);
  const previousMintRef = useRef<string | null>(null);
  const currentMintRef = useRef<string | null>(null);

  // Detect chain from URL path or query
  const chain = router.pathname.startsWith('/trade/monad') ? 'monad' :
                (router.query.chain as string) || 'sol';

  useEffect(() => {
    const { _mint } = router.query;
    
    if (typeof _mint === 'string' && _mint.length >= 32) {
      // Track current mint for validation
      currentMintRef.current = _mint;
      
      // If mint changed, clear all cached data to prevent cross-token pollution
      if (previousMintRef.current && previousMintRef.current !== _mint) {
        console.log('[Background OHLC] Mint changed from', previousMintRef.current, 'to', _mint, '- clearing all cache');
        globalOHLCCache.clear();
        setBackgroundData(null);
        setPreloadComplete(false);
      }
      previousMintRef.current = _mint;
      
      // ALWAYS clear background data when mint changes to prevent stale data
      if (backgroundData) {
        console.log('[Background OHLC] Clearing stale data for new token:', _mint);
        setBackgroundData(null);
        setPreloadComplete(false);
      }
      
      // Create cache key that includes parameters to avoid conflicts
      const cacheKey = `${_mint}:${interval}:${timeframe}`;
      
      console.log('[Background OHLC] Checking cache for:', cacheKey);
      
      // Check global cache first
      const cached = globalOHLCCache.get(cacheKey);
      const now = Date.now();
      
      if (cached && (now - cached.timestamp) < CACHE_DURATION) {
        // Validate that cached data is for the current mint
        if (cached.mint === _mint) {
          console.log('[Background OHLC] Using cached data for', cacheKey, 'with', cached.data.length, 'candles');
          setBackgroundData(cached.data);
          setPreloadComplete(true);
          return;
        } else {
          console.log('[Background OHLC] Cached data is for different mint, clearing cache');
          globalOHLCCache.delete(cacheKey);
        }
      }

      // Start background fetch
      if (!fetchRef.current) {
        setIsPreloading(true);
        
        fetchRef.current = (async () => {
          try {
            let url: URL;
            let items: OHLCData[] = [];

            if (chain === 'monad') {
              // Monad uses old endpoint format
              url = new URL(`${process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL}/v1/trade/ohlc-data`);
              url.searchParams.set('mint', _mint);
              url.searchParams.set('interval', interval);
              url.searchParams.set('timeframe', timeframe);
            } else {
              // Solana uses new /v1/ohlcv/{tokenAddress} endpoint with 1s candles
              url = new URL(`${process.env.NEXT_PUBLIC_GO_SERVICE_URL}/v1/ohlcv/${_mint}`);
              url.searchParams.set('timeframe', '1s');
              url.searchParams.set('limit', '500');
            }

            console.log('[Background OHLC] Starting preload for', cacheKey, 'chain:', chain, 'URL:', url.toString());
            const response = await fetch(url.toString(), {
              method: 'GET',
              headers: {
                accept: 'application/json',
                'X-API-Key': process.env.NEXT_PUBLIC_BACKEND_API_KEY || 'test-key'
              },
            });

            if (response.ok) {
              const data = await response.json();

              if (chain === 'sol' && data?.candles) {
                // Solana returns { candles: [...] }
                items = data.candles.map((c: any) => ({
                  unix_time: c.time || c.unix_time,
                  o: c.open ?? c.o,
                  h: c.high ?? c.h,
                  l: c.low ?? c.l,
                  c: c.close ?? c.c,
                  v_usd: c.volume ?? c.volume_usd ?? c.v_usd ?? 0,
                }));
              } else if (data?.data?.items) {
                // Monad returns { data: { items: [...] } }
                items = data.data.items;
              }

              if (data?.success && items.length > 0) {
                console.log('[Background OHLC] Preload complete:', items.length, 'candles for', cacheKey);

                // Cache the data globally with parameter-specific key and mint validation
                globalOHLCCache.set(cacheKey, { data: items, timestamp: now, mint: _mint });

                setBackgroundData(items);
                setPreloadComplete(true);
              }
            }
          } catch (error) {
            console.warn('[Background OHLC] Preload failed:', error);
          } finally {
            setIsPreloading(false);
            fetchRef.current = null;
          }
        })();
      }
    } else {
      // If no valid mint, clear any existing data
      if (backgroundData) {
        console.log('[Background OHLC] No valid mint - clearing background data');
        setBackgroundData(null);
        setPreloadComplete(false);
      }
    }

    return () => {
      // Cleanup on unmount
      if (fetchRef.current) {
        fetchRef.current = null;
      }
    };
  }, [router.query._mint, interval, timeframe]);

  return {
    backgroundData,
    isPreloading,
    preloadComplete,
  };
}
