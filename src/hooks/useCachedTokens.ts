import { useState, useEffect, useRef, useCallback } from 'react';
import type { Token } from '~/utils/db';

interface CachedData<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface CacheConfig {
  maxAge?: number; // in milliseconds
  staleWhileRevalidate?: number; // in milliseconds
}

const DEFAULT_CACHE_CONFIG: Required<CacheConfig> = {
  maxAge: 5 * 60 * 1000, // 5 minutes
  staleWhileRevalidate: 2 * 60 * 1000, // 2 minutes
};

export function useCachedTokens<T = Token[]>(
  key: string,
  fetcher: () => Promise<T>,
  config: CacheConfig = {}
) {
  const mergedConfig = { ...DEFAULT_CACHE_CONFIG, ...config };
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const fetcherRef = useRef(fetcher);
  const lastFetchRef = useRef<number>(0);

  // Update fetcher ref when it changes
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  // Load cached data on mount
  useEffect(() => {
    const loadCachedData = () => {
      try {
        const cached = localStorage.getItem(`cached_tokens_${key}`);
        if (cached) {
          const parsed: CachedData<T> = JSON.parse(cached);
          const now = Date.now();
          
          // Check if cache is still valid
          if (now < parsed.expiresAt) {
            setData(parsed.data);
            setLoading(false);
            
            // Check if data is stale but still usable
            if (now > parsed.timestamp + mergedConfig.staleWhileRevalidate) {
              setIsStale(true);
            }
            
            return true; // Cache hit
          } else {
            // Cache expired, remove it
            localStorage.removeItem(`cached_tokens_${key}`);
          }
        }
      } catch (error) {
        console.warn('Failed to load cached data:', error);
        localStorage.removeItem(`cached_tokens_${key}`);
      }
      return false; // Cache miss
    };

    const cacheHit = loadCachedData();
    
    // Always fetch fresh data, but don't show loading if we have cached data
    if (!cacheHit) {
      fetchData();
    } else {
      // Fetch fresh data in background
      fetchData(true);
    }
  }, [key, mergedConfig.maxAge, mergedConfig.staleWhileRevalidate]);

  const fetchData = useCallback(async (background = false) => {
    const now = Date.now();
    
    // Prevent too frequent requests
    if (now - lastFetchRef.current < 1000) {
      return;
    }
    
    lastFetchRef.current = now;
    
    if (!background) {
      setLoading(true);
      setError(null);
    }

    try {
      const freshData = await fetcherRef.current();
      
      // Cache the fresh data
      const cacheData: CachedData<T> = {
        data: freshData,
        timestamp: now,
        expiresAt: now + mergedConfig.maxAge,
      };
      
      try {
        localStorage.setItem(`cached_tokens_${key}`, JSON.stringify(cacheData));
      } catch (error) {
        console.warn('Failed to cache data:', error);
      }
      
      setData(freshData);
      setIsStale(false);
      setError(null);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch data');
      
      // Only show error if we don't have cached data
      if (!data) {
        setData(null);
      }
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  }, [data, mergedConfig.maxAge]);

  const invalidateCache = useCallback(() => {
    localStorage.removeItem(`cached_tokens_${key}`);
    setData(null);
    setIsStale(false);
    fetchData();
  }, [key, fetchData]);

  const refreshData = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    isStale,
    refreshData,
    invalidateCache,
  };
}

// Specialized hook for pulse page tokens
export function useCachedPulseTokens() {
  const [tokens, setTokens] = useState<Token[]>(() => {
    // Initialize with cached data immediately to prevent flash
    try {
      const cached = localStorage.getItem('cached_pulse_tokens');
      if (cached) {
        const parsed: CachedData<Token[]> = JSON.parse(cached);
        const now = Date.now();
        if (now < parsed.expiresAt) {
          return parsed.data;
        }
      }
    } catch (error) {
      console.warn('Failed to load cached pulse tokens on init:', error);
    }
    return [];
  });
  
  const [loading, setLoading] = useState(() => {
    // Only show loading if we don't have cached data
    try {
      const cached = localStorage.getItem('cached_pulse_tokens');
      if (cached) {
        const parsed: CachedData<Token[]> = JSON.parse(cached);
        const now = Date.now();
        if (now < parsed.expiresAt) {
          return false; // We have valid cached data, don't show loading
        }
      }
    } catch (error) {
      console.warn('Failed to check cached pulse tokens on init:', error);
    }
    return true; // No cached data, show loading
  });
  
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const lastFetchRef = useRef<number>(0);

  const loadCachedTokens = useCallback(() => {
    try {
      const cached = localStorage.getItem('cached_pulse_tokens');
      if (cached) {
        const parsed: CachedData<Token[]> = JSON.parse(cached);
        const now = Date.now();
        
        if (now < parsed.expiresAt) {
          setTokens(parsed.data);
          setLoading(false);
          
          if (now > parsed.timestamp + 2 * 60 * 1000) { // 2 minutes stale threshold
            setIsStale(true);
          }
          return true;
        } else {
          localStorage.removeItem('cached_pulse_tokens');
        }
      }
    } catch (error) {
      console.warn('Failed to load cached pulse tokens:', error);
      localStorage.removeItem('cached_pulse_tokens');
    }
    return false;
  }, []);

  const fetchTokens = useCallback(async (background = false) => {
    const now = Date.now();
    
    if (now - lastFetchRef.current < 1000) {
      return;
    }
    
    lastFetchRef.current = now;
    
    if (!background) {
      setLoading(true);
      setError(null);
    }

    try {
      // Force direct backend calls when backend is deployed
      const baseUrl = 'http://34.47.209.237:8080';
      const url = `${baseUrl}/v1/pulse/new?limit=200`;

      const response = await fetch(url);
      const data = response.ok ? await response.json() : { result: [] };
      const arr = Array.isArray(data) ? (data as Token[]) : (data.result || []);
      
      // Cache the fresh data
      const cacheData: CachedData<Token[]> = {
        data: arr,
        timestamp: now,
        expiresAt: now + 5 * 60 * 1000, // 5 minutes
      };
      
      try {
        localStorage.setItem('cached_pulse_tokens', JSON.stringify(cacheData));
      } catch (error) {
        console.warn('Failed to cache pulse tokens:', error);
      }
      
      setTokens(arr);
      setIsStale(false);
      setError(null);
    } catch (error) {
      console.error('Failed to fetch pulse tokens:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch tokens');
      
      if (!tokens.length) {
        setTokens([]);
      }
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  }, [tokens?.length]);

  useEffect(() => {
    const cacheHit = loadCachedTokens();
    
    if (!cacheHit) {
      fetchTokens();
    }
    // Remove automatic background refresh to prevent page refreshes
  }, []); // Empty dependency array to prevent re-runs

  const refreshTokens = useCallback(() => {
    fetchTokens();
  }, [fetchTokens]);

  const invalidateCache = useCallback(() => {
    localStorage.removeItem('cached_pulse_tokens');
    setTokens([]);
    setIsStale(false);
    fetchTokens();
  }, [fetchTokens]);

  return {
    tokens,
    loading,
    error,
    isStale,
    refreshTokens,
    invalidateCache,
  };
}

// Specialized hook for launchpad data
export function useCachedLaunchpadData() {
  const [launchpadData, setLaunchpadData] = useState<{
    new: any[];
    completing: any[];
    completed: any[];
  }>(() => {
    // Initialize with cached data immediately to prevent flash
    try {
      const cached = localStorage.getItem('cached_launchpad_data');
      if (cached) {
        const parsed: CachedData<{ new: any[]; completing: any[]; completed: any[] }> = JSON.parse(cached);
        const now = Date.now();
        if (now < parsed.expiresAt) {
          return parsed.data;
        }
      }
    } catch (error) {
      console.warn('Failed to load cached launchpad data on init:', error);
    }
    return {
      new: [],
      completing: [],
      completed: []
    };
  });
  
  const [loading, setLoading] = useState(() => {
    // Only show loading if we don't have cached data
    try {
      const cached = localStorage.getItem('cached_launchpad_data');
      if (cached) {
        const parsed: CachedData<typeof launchpadData> = JSON.parse(cached);
        const now = Date.now();
        if (now < parsed.expiresAt) {
          return false; // We have valid cached data, don't show loading
        }
      }
    } catch (error) {
      console.warn('Failed to check cached launchpad data on init:', error);
    }
    return true; // No cached data, show loading
  });
  
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const lastFetchRef = useRef<number>(0);

  const loadCachedData = useCallback(() => {
    try {
      const cached = localStorage.getItem('cached_launchpad_data');
      if (cached) {
        const parsed: CachedData<typeof launchpadData> = JSON.parse(cached);
        const now = Date.now();
        
        if (now < parsed.expiresAt) {
          setLaunchpadData(parsed.data);
          setLoading(false);
          
          if (now > parsed.timestamp + 1 * 60 * 1000) { // 1 minute stale threshold
            setIsStale(true);
          }
          return true;
        } else {
          localStorage.removeItem('cached_launchpad_data');
        }
      }
    } catch (error) {
      console.warn('Failed to load cached launchpad data:', error);
      localStorage.removeItem('cached_launchpad_data');
    }
    return false;
  }, []);

  const fetchLaunchpadData = useCallback(async (background = false) => {
    const now = Date.now();
    
    if (now - lastFetchRef.current < 1000) {
      return;
    }
    
    lastFetchRef.current = now;
    
    if (!background) {
      setLoading(true);
      setError(null);
    }

    try {
      const { env } = await import('~/env');
      const baseUrl = env.NEXT_PUBLIC_GO_SERVICE_URL.endsWith('/') 
        ? env.NEXT_PUBLIC_GO_SERVICE_URL.slice(0, -1) 
        : env.NEXT_PUBLIC_GO_SERVICE_URL;
      const apiUrl = env.NEXT_PUBLIC_IS_BACKEND_DEPLOYED
        ? `${baseUrl}/v1/launchpad/tokens?limit=30`
        : `/api/launchpad/tokens?limit=30`;

      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error('Failed to fetch launchpad data');
      const data = await response.json();
      
      // Cache the fresh data
      const cacheData: CachedData<typeof launchpadData> = {
        data,
        timestamp: now,
        expiresAt: now + 3 * 60 * 1000, // 3 minutes
      };
      
      try {
        localStorage.setItem('cached_launchpad_data', JSON.stringify(cacheData));
      } catch (error) {
        console.warn('Failed to cache launchpad data:', error);
      }
      
      setLaunchpadData(data);
      setIsStale(false);
      setError(null);
    } catch (error) {
      console.error('Failed to fetch launchpad data:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch launchpad data');
      
      if (!launchpadData.new.length && !launchpadData.completing.length && !launchpadData.completed.length) {
        setLaunchpadData({ new: [], completing: [], completed: [] });
      }
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  }, [launchpadData?.new?.length, launchpadData?.completing?.length, launchpadData?.completed?.length]);

  useEffect(() => {
    const cacheHit = loadCachedData();
    
    if (!cacheHit) {
      fetchLaunchpadData();
    }
    // Remove automatic background refresh to prevent page refreshes
  }, []); // Empty dependency array to prevent re-runs

  const refreshData = useCallback(() => {
    fetchLaunchpadData();
  }, [fetchLaunchpadData]);

  const invalidateCache = useCallback(() => {
    localStorage.removeItem('cached_launchpad_data');
    setLaunchpadData({ new: [], completing: [], completed: [] });
    setIsStale(false);
    fetchLaunchpadData();
  }, [fetchLaunchpadData]);

  return {
    launchpadData,
    loading,
    error,
    isStale,
    refreshData,
    invalidateCache,
  };
}
