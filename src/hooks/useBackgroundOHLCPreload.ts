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
const globalOHLCCache = new Map<string, { data: OHLCData[]; timestamp: number }>();
const CACHE_DURATION = 30000; // 30 seconds

export default function useBackgroundOHLCPreload(): UseBackgroundOHLCPreloadResult {
  const router = useRouter();
  const [backgroundData, setBackgroundData] = useState<OHLCData[] | null>(null);
  const [isPreloading, setIsPreloading] = useState(false);
  const [preloadComplete, setPreloadComplete] = useState(false);
  const fetchRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const { _mint } = router.query;
    
    if (typeof _mint === 'string' && _mint.length >= 32) {
      // Check global cache first
      const cached = globalOHLCCache.get(_mint);
      const now = Date.now();
      
      if (cached && (now - cached.timestamp) < CACHE_DURATION) {
        console.log('[Background OHLC] Using cached data for', _mint);
        setBackgroundData(cached.data);
        setPreloadComplete(true);
        return;
      }

      // Start background fetch
      if (!fetchRef.current) {
        setIsPreloading(true);
        
        fetchRef.current = (async () => {
          try {
            const url = new URL(`${process.env.NEXT_PUBLIC_GO_SERVICE_URL}/v1/trade/ohlc-data`);
            url.searchParams.set('mint', _mint);
            url.searchParams.set('interval', '1h');
            url.searchParams.set('timeframe', '30d');
            
            console.log('[Background OHLC] Starting preload for', _mint);
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
                console.log('[Background OHLC] Preload complete:', data.data.items.length, 'candles');
                
                // Cache the data globally
                globalOHLCCache.set(_mint, { data: data.data.items, timestamp: now });
                
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
    }

    return () => {
      // Cleanup on unmount
      if (fetchRef.current) {
        fetchRef.current = null;
      }
    };
  }, [router.query._mint]);

  return {
    backgroundData,
    isPreloading,
    preloadComplete,
  };
}
