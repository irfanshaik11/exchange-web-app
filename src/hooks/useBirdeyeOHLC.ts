import { useState, useEffect, useCallback, useRef } from 'react';

const isDev = process.env.NODE_ENV !== 'production';

export interface BirdeyeOHLCItem {
  address: string;
  h: number; // high
  o: number; // open
  l: number; // low
  c: number; // close
  type: string;
  v: number; // volume
  unix_time: number;
  v_usd: number;
}

export interface BirdeyeOHLCResponse {
  success: boolean;
  data: {
    items: BirdeyeOHLCItem[];
  };
}

export type BirdeyeTimeframe = 
  | '1s' | '15s' | '30s' 
  | '1m' | '5m' | '15m' 
  | '1h' | '4h' | '1d';

export interface UseBirdeyeOHLCOptions {
  pairAddress: string;
  timeframe?: BirdeyeTimeframe;
  enabled?: boolean;
  refreshInterval?: number; // in milliseconds
  onSuccess?: (data: BirdeyeOHLCItem[]) => void;
  onError?: (error: Error) => void;
}

// Use our secure proxy endpoint instead of calling BirdEye directly
const BIRDEYE_PROXY_URL = '/api/birdeye-ohlcv-pair';

/**
 * Custom hook to fetch OHLC data from Birdeye API
 * 
 * @example
 * ```tsx
 * const { data, isLoading, error, refetch } = useBirdeyeOHLC({
 *   pairAddress: '9wFFyRfZBsuAha4YcuxcXLKwMxJR43S7fPfQLusDBzvT',
 *   timeframe: '15m',
 *   refreshInterval: 30000,
 * });
 * ```
 */
export function useBirdeyeOHLC({
  pairAddress,
  timeframe = '15m',
  enabled = true,
  refreshInterval = 30000,
  onSuccess,
  onError,
}: UseBirdeyeOHLCOptions) {
  const [data, setData] = useState<BirdeyeOHLCItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    if (!pairAddress || !enabled) {
      return;
    }

    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      setIsLoading(true);
      setError(null);

      const url = new URL(BIRDEYE_PROXY_URL, window.location.origin);
      url.searchParams.append('address', pairAddress);
      url.searchParams.append('type', timeframe);
      url.searchParams.append('limit', '1000');

      isDev && console.log('useBirdeyeOHLC: Fetching data from proxy', { pairAddress, timeframe });

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'x-chain': 'solana',
        },
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        let extra = '';
        try {
          const errJson = await response.json();
          extra = errJson?.message ? `: ${errJson.message}` : '';
        } catch {}
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a moment before trying again.');
        }
        throw new Error(`API request failed: ${response.status} ${response.statusText}${extra}`);
      }

      const result: BirdeyeOHLCResponse = await response.json();

      if (!result.success) {
        throw new Error('API returned unsuccessful response');
      }
      
      // Reset retry count on success
      setRetryCount(0);

      const items = result.data?.items || [];

      if (!isMountedRef.current) return;

      setData(items);
      setLastUpdate(new Date());
      setIsLoading(false);

      isDev && console.log('useBirdeyeOHLC: Data fetched successfully', { count: items.length });

      if (onSuccess) {
        onSuccess(items);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        isDev && console.log('useBirdeyeOHLC: Request aborted');
        return;
      }

      if (!isMountedRef.current) return;

      const error = err instanceof Error ? err : new Error('Failed to fetch OHLC data');
      setError(error);
      setIsLoading(false);

      console.error('useBirdeyeOHLC: Error fetching data', error);
      
      // Increment retry count for rate limit handling
      if (error.message.includes('Rate limit')) {
        setRetryCount(prev => prev + 1);
      }

      if (onError) {
        onError(error);
      }
    }
  }, [pairAddress, timeframe, enabled, onSuccess, onError]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Set up periodic refresh with exponential backoff
  useEffect(() => {
    if (!enabled || refreshInterval <= 0) {
      return;
    }

    // Apply exponential backoff on rate limits
    const backoffMultiplier = Math.min(Math.pow(2, retryCount), 8); // Max 8x backoff
    const intervalTime = refreshInterval * backoffMultiplier;

    isDev && console.log('useBirdeyeOHLC: Setting refresh interval', {
      intervalSeconds: intervalTime / 1000,
      retryCount
    });

    const interval = setInterval(() => {
      fetchData();
    }, intervalTime);

    return () => {
      clearInterval(interval);
    };
  }, [fetchData, enabled, refreshInterval, retryCount]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    data,
    isLoading,
    error,
    lastUpdate,
    refetch: fetchData,
  };
}

/**
 * Helper function to get the latest price from OHLC data
 */
export function getLatestPrice(data: BirdeyeOHLCItem[]): number | null {
  if (data.length === 0) return null;
  return data[data.length - 1].c; // latest close price
}

/**
 * Helper function to calculate price change percentage
 */
export function getPriceChange(data: BirdeyeOHLCItem[]): {
  change: number;
  changePercent: number;
} | null {
  if (data.length < 2) return null;
  
  const latest = data[data.length - 1].c;
  const previous = data[0].o;
  
  const change = latest - previous;
  const changePercent = (change / previous) * 100;
  
  return { change, changePercent };
}

/**
 * Helper function to format volume
 */
export function formatVolume(volume: number): string {
  if (volume >= 1_000_000_000) {
    return `$${(volume / 1_000_000_000).toFixed(2)}B`;
  } else if (volume >= 1_000_000) {
    return `$${(volume / 1_000_000).toFixed(2)}M`;
  } else if (volume >= 1_000) {
    return `$${(volume / 1_000).toFixed(2)}K`;
  } else {
    return `$${volume.toFixed(2)}`;
  }
}

export default useBirdeyeOHLC;

