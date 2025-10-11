import { useState, useEffect, useCallback, useRef } from 'react';

export interface BackendOHLCItem {
  unix_time: number;  // Unix timestamp in seconds
  o: number;          // Open price
  h: number;          // High price
  l: number;          // Low price
  c: number;          // Close price
  v_usd: number;      // Volume in USD
}

export interface BackendOHLCResponse {
  success: boolean;
  data: {
    items: BackendOHLCItem[];
  };
}

export interface UseBackendOHLCOptions {
  mint?: string;
  pairAddress?: string;
  interval?: string;      // Candle size: '1m', '5m', '15m', '1h', '4h', '1d'
  timeframe?: string;     // Time range: '1h', '4h', '24h', '7d', '30d'
  enabled?: boolean;
  refreshInterval?: number; // in milliseconds
  onSuccess?: (data: BackendOHLCItem[]) => void;
  onError?: (error: Error) => void;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://157.180.71.112:8080';

/**
 * Custom hook to fetch OHLC data from your backend
 * 
 * @example
 * ```tsx
 * const { data, isLoading, error, refetch } = useBackendOHLC({
 *   mint: 'TokenMintAddress123',
 *   interval: '15m',      // Candle size
 *   timeframe: '24h',     // Time range
 *   refreshInterval: 30000,
 * });
 * ```
 */
export function useBackendOHLC({
  mint,
  pairAddress,
  interval = '1m',
  timeframe = '24h',
  enabled = true,
  refreshInterval = 30000,
  onSuccess,
  onError,
}: UseBackendOHLCOptions) {
  const [data, setData] = useState<BackendOHLCItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    if ((!mint && !pairAddress) || !enabled) {
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

      const url = new URL(`${BACKEND_URL}/v1/trade/ohlc-data`);
      
      // Add query parameters based on what's provided
      if (mint) {
        url.searchParams.append('mint', mint);
      }
      if (pairAddress) {
        url.searchParams.append('pair_address', pairAddress);
      }
      if (interval) {
        url.searchParams.append('interval', interval);
      }
      if (timeframe) {
        url.searchParams.append('timeframe', timeframe);
      }

      console.log('useBackendOHLC: Fetching data', { mint, pairAddress, interval, timeframe, url: url.toString() });

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'X-API-Key': process.env.NEXT_PUBLIC_BACKEND_API_KEY || 'test-key',
        },
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        let extra = '';
        try {
          const errJson = await response.json();
          extra = errJson?.message || errJson?.error ? `: ${errJson.message || errJson.error}` : '';
        } catch {}
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a moment before trying again.');
        }
        throw new Error(`API request failed: ${response.status} ${response.statusText}${extra}`);
      }

      const result: BackendOHLCResponse = await response.json();

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

      console.log('useBackendOHLC: Data fetched successfully', { count: items.length });

      if (onSuccess) {
        onSuccess(items);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('useBackendOHLC: Request aborted');
        return;
      }

      if (!isMountedRef.current) return;

      const error = err instanceof Error ? err : new Error('Failed to fetch OHLC data');
      setError(error);
      setIsLoading(false);

      console.error('useBackendOHLC: Error fetching data', error);
      
      // Increment retry count for rate limit handling
      if (error.message.includes('Rate limit')) {
        setRetryCount(prev => prev + 1);
      }

      if (onError) {
        onError(error);
      }
    }
  }, [mint, pairAddress, interval, timeframe, enabled, onSuccess, onError]);

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

    console.log('useBackendOHLC: Setting refresh interval', {
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
export function getLatestPrice(data: BackendOHLCItem[]): number | null {
  if (data.length === 0) return null;
  return data[data.length - 1].c; // latest close price
}

/**
 * Helper function to calculate price change percentage
 */
export function getPriceChange(data: BackendOHLCItem[]): {
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

export default useBackendOHLC;

