import { useState, useEffect } from 'react';
import { getTokenMetrics, registerToken } from '~/utils/api';
import type { TokenMetrics } from '~/utils/api';

interface UseTokenAnalyticsOptions {
  mintAddress?: string;
  enabled?: boolean;
  refreshInterval?: number; // milliseconds
  autoRegister?: boolean; // whether to auto-register token if not found
  tokenInfo?: {
    symbol?: string;
    name?: string;
    pool?: string;
    dex?: string;
  };
}

interface UseTokenAnalyticsReturn {
  data: TokenMetrics | null;
  loading: boolean;
  error: string | null;
  refetch: (forceRefresh?: boolean) => Promise<void>;
}

// Simple in-memory cache
const cache: Record<string, { data: TokenMetrics; timestamp: number }> = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function useTokenAnalytics({
  mintAddress,
  enabled = true,
  refreshInterval,
  autoRegister = true,
  tokenInfo = {},
}: UseTokenAnalyticsOptions = {}): UseTokenAnalyticsReturn {
  const [data, setData] = useState<TokenMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async (forceRefresh = false) => {
    if (!mintAddress || !enabled) {
      return;
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = cache[mintAddress];
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        setData(cached.data);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      // Try to fetch metrics
      let result = await getTokenMetrics(mintAddress, false);

      // If no metrics found and auto-register is enabled, register the token
      if (
        autoRegister && 
        (!result.metrics || Object.keys(result.metrics).length === 0)
      ) {
        try {
          await registerToken({
            mint: mintAddress,
            symbol: tokenInfo.symbol,
            name: tokenInfo.name,
            pool: tokenInfo.pool,
            dex: tokenInfo.dex,
          });

          // After registration, fetch with refresh to get blockchain data
          result = await getTokenMetrics(mintAddress, true);
        } catch (regError) {
          console.log('Token registration failed (may already exist):', regError);
          // Try fetching again anyway
          result = await getTokenMetrics(mintAddress, forceRefresh);
        }
      }

      if (result.metrics) {
        // Cache the result
        cache[mintAddress] = {
          data: result.metrics,
          timestamp: Date.now(),
        };
        setData(result.metrics);
      } else {
        setData(null);
      }
    } catch (err) {
      console.error('Error fetching token analytics:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();

    // Set up refresh interval if specified
    if (refreshInterval && enabled && mintAddress) {
      const interval = setInterval(() => fetchAnalytics(false), refreshInterval);
      return () => clearInterval(interval);
    }
  }, [mintAddress, enabled, refreshInterval]);

  return {
    data,
    loading,
    error,
    refetch: fetchAnalytics,
  };
}
