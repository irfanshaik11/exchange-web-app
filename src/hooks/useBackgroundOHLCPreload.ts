import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { getCachedData as getWsPrefetchData } from '~/utils/ohlcPrefetchManager';

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
// Exported so ohlcPrefetchManager can write WS snapshot data into it
export const globalOHLCCache = new Map<string, { data: OHLCData[]; timestamp: number; mint: string }>();
const CACHE_DURATION = 300000; // 5 minutes — real-time WS updates candles once loaded

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

// Run cleanup every 60 seconds (entries persist up to 5 minutes)
setInterval(cleanupCache, 60000);

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
    const { _mint, id: routeId } = router.query;
    // Use _mint (from PulseTable nav) or route id (from direct URL / bookmark)
    const mintAddress = (typeof _mint === 'string' && _mint.length >= 32)
      ? _mint
      : (typeof routeId === 'string' && routeId.length >= 32 ? routeId : null);

    if (mintAddress) {
      // Track current mint for validation
      currentMintRef.current = mintAddress;
      
      // If mint changed, clear all cached data to prevent cross-token pollution
      if (previousMintRef.current && previousMintRef.current !== mintAddress) {
        console.log('[Background OHLC] Mint changed from', previousMintRef.current, 'to', mintAddress, '- clearing all cache');
        globalOHLCCache.clear();
        setBackgroundData(null);
        setPreloadComplete(false);
      }
      previousMintRef.current = mintAddress;

      // ALWAYS clear background data when mint changes to prevent stale data
      if (backgroundData) {
        console.log('[Background OHLC] Clearing stale data for new token:', mintAddress);
        setBackgroundData(null);
        setPreloadComplete(false);
      }

      // Create cache key that includes parameters to avoid conflicts
      const cacheKey = `${mintAddress}:${interval}:${timeframe}`;
      
      console.log('[Background OHLC] Checking cache for:', cacheKey);
      
      // Check global cache first
      const cached = globalOHLCCache.get(cacheKey);
      const now = Date.now();
      
      if (cached && (now - cached.timestamp) < CACHE_DURATION && cached.data.length > 0) {
        // Validate that cached data is for the current mint and has actual candles
        // (data.length === 0 means a hover prefetch is still in-flight)
        if (cached.mint === mintAddress) {
          console.log('[Background OHLC] Using cached data for', cacheKey, 'with', cached.data.length, 'candles');
          setBackgroundData(cached.data);
          setPreloadComplete(true);
          return;
        } else {
          console.log('[Background OHLC] Cached data is for different mint, clearing cache');
          globalOHLCCache.delete(cacheKey);
        }
      }

      // Check WS prefetch manager as additional cache source
      // (WS snapshot may have arrived but globalOHLCCache write was missed due to timing)
      const wsPrefetchCandles = getWsPrefetchData(mintAddress);
      if (wsPrefetchCandles && wsPrefetchCandles.length > 0) {
        console.log('[Background OHLC] Using WS prefetch data for', mintAddress, 'with', wsPrefetchCandles.length, 'candles');
        globalOHLCCache.set(cacheKey, { data: wsPrefetchCandles, timestamp: Date.now(), mint: mintAddress });
        setBackgroundData(wsPrefetchCandles);
        setPreloadComplete(true);
        return;
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
              url.searchParams.set('mint', mintAddress);
              url.searchParams.set('interval', interval);
              url.searchParams.set('timeframe', timeframe);
            } else {
              // Solana uses new /v1/ohlcv/{tokenAddress} endpoint with 1s candles
              url = new URL(`${process.env.NEXT_PUBLIC_GO_SERVICE_URL}/v1/ohlcv/${mintAddress}`);
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
                globalOHLCCache.set(cacheKey, { data: items, timestamp: now, mint: mintAddress });

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
  }, [router.query._mint, router.query.id, interval, timeframe]);

  return {
    backgroundData,
    isPreloading,
    preloadComplete,
  };
}

/**
 * Prefetch OHLC data for a token mint (call from PulseTable on hover).
 * Stores result in the globalOHLCCache so useBackgroundOHLCPreload picks it up instantly.
 * Best-effort: silent fail on errors.
 */
export function prefetchOHLC(mint: string, chain: 'sol' | 'monad' = 'sol'): void {
  const interval = '1h';
  const timeframe = '30d';
  const cacheKey = `${mint}:${interval}:${timeframe}`;

  // Skip if already cached or in-flight
  if (globalOHLCCache.has(cacheKey)) return;

  // Mark as in-flight with empty data to prevent duplicate fetches
  globalOHLCCache.set(cacheKey, { data: [], timestamp: Date.now(), mint });

  let url: URL;
  if (chain === 'monad') {
    url = new URL(`${process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL}/v1/trade/ohlc-data`);
    url.searchParams.set('mint', mint);
    url.searchParams.set('interval', interval);
    url.searchParams.set('timeframe', timeframe);
  } else {
    url = new URL(`${process.env.NEXT_PUBLIC_GO_SERVICE_URL}/v1/ohlcv/${mint}`);
    url.searchParams.set('timeframe', '1s');
    url.searchParams.set('limit', '500');
  }

  fetch(url.toString(), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'X-API-Key': process.env.NEXT_PUBLIC_BACKEND_API_KEY || 'test-key',
    },
  })
    .then((r) => r.json())
    .then((data) => {
      let items: OHLCData[] = [];
      if (chain === 'sol' && data?.candles) {
        items = data.candles.map((c: any) => ({
          unix_time: c.time || c.unix_time,
          o: c.open ?? c.o,
          h: c.high ?? c.h,
          l: c.low ?? c.l,
          c: c.close ?? c.c,
          v_usd: c.volume ?? c.volume_usd ?? c.v_usd ?? 0,
        }));
      } else if (data?.data?.items) {
        items = data.data.items;
      }
      if (data?.success && items.length > 0) {
        globalOHLCCache.set(cacheKey, { data: items, timestamp: Date.now(), mint });
        console.log('[Background OHLC] Hover prefetch complete:', items.length, 'candles for', mint);
      } else {
        // Remove the in-flight marker so the hook can try its own fetch
        globalOHLCCache.delete(cacheKey);
      }
    })
    .catch(() => {
      // Remove the in-flight marker on failure
      globalOHLCCache.delete(cacheKey);
    });
}
