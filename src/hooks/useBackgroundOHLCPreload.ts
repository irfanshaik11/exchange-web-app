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
            const url = new URL(`${process.env.NEXT_PUBLIC_GO_SERVICE_URL}/v1/trade/ohlc-data`);
            url.searchParams.set('mint', _mint);
            url.searchParams.set('interval', interval);
            url.searchParams.set('timeframe', timeframe);
            
            console.log('[Background OHLC] Starting preload for', cacheKey, 'URL:', url.toString());
            const response = await fetch(url.toString(), {
              method: 'GET',
              headers: { 
                accept: 'application/json', 
                'X-API-Key': process.env.NEXT_PUBLIC_BACKEND_API_KEY || 'test-key' 
              },
            });
            
            if (response.ok) {
              const data = await response.json();
              if (data?.success && data?.data?.items) {
                console.log('[Background OHLC] Preload complete:', data.data.items.length, 'candles for', cacheKey);
                
                // Cache the data globally with parameter-specific key and mint validation
                globalOHLCCache.set(cacheKey, { data: data.data.items, timestamp: now, mint: _mint });
                
                setBackgroundData(data.data.items);
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
