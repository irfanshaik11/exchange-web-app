/**
 * Optimized API endpoint that combines multiple token filters into a single request
 * This reduces the number of API calls from 6+ to 1-2 calls
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { tokenCache, CACHE_CONFIGS } from './tokenCache';
import { env } from '../env';

interface CombinedTokenResponse {
  new: any[];
  'final-stretch': any[];
  migrated: any[];
  launchpad: {
    new: any[];
    completing: any[];
    completed: any[];
  };
}

/**
 * Fetch all pulse data in a single optimized request
 */
export async function fetchCombinedPulseData(): Promise<CombinedTokenResponse> {
  const cacheKey = 'combined-pulse-data';
  
  return tokenCache.get(
    cacheKey,
    {},
    async () => {
      const baseUrl = env.NEXT_PUBLIC_GO_SERVICE_URL.endsWith('/') 
        ? env.NEXT_PUBLIC_GO_SERVICE_URL.slice(0, -1) 
        : env.NEXT_PUBLIC_GO_SERVICE_URL;

      // Fetch all data in parallel
      const [newTokens, finalStretchTokens, migratedTokens, launchpadData] = await Promise.allSettled([
        fetch(`${baseUrl}/v1/pulse/new?limit=30`).then(res => res.json()),
        fetch(`${baseUrl}/v1/pulse/final-stretch?limit=30`).then(res => res.json()),
        fetch(`${baseUrl}/v1/pulse/migrated?limit=30`).then(res => res.json()),
        fetch(`${baseUrl}/v1/launchpad/tokens?limit=30`).then(res => res.json()),
      ]);

      return {
        new: newTokens.status === 'fulfilled' ? newTokens.value : [],
        'final-stretch': finalStretchTokens.status === 'fulfilled' ? finalStretchTokens.value : [],
        migrated: migratedTokens.status === 'fulfilled' ? migratedTokens.value : [],
        launchpad: launchpadData.status === 'fulfilled' ? launchpadData.value : { new: [], completing: [], completed: [] },
      };
    },
    CACHE_CONFIGS.REALTIME.ttl // 10 seconds for combined data
  );
}

/**
 * Hook that uses the optimized combined data fetching
 */
export function useOptimizedPulseData() {
  const [state, setState] = useState({
    data: null as CombinedTokenResponse | null,
    loading: true,
    error: null as string | null,
    lastUpdated: 0,
  });

  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const data = await fetchCombinedPulseData();
      
      if (mountedRef.current) {
        setState(prev => ({
          ...prev,
          data,
          loading: false,
          error: null,
          lastUpdated: Date.now(),
        }));
      }
    } catch (error) {
      if (mountedRef.current) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch data',
        }));
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();

    // Refresh every 15 seconds
    const interval = setInterval(fetchData, 15000);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchData]);

  return {
    ...state,
    refresh: fetchData,
  };
}
