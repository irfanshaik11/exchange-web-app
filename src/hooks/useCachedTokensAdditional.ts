import { useState, useEffect, useRef, useCallback } from 'react';

interface CachedData<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

// Specialized hook for Final Stretch tokens
export function useCachedFinalStretchTokens() {
  const [tokens, setTokens] = useState<any[]>(() => {
    // Initialize with cached data immediately to prevent flash
    try {
      const cached = localStorage.getItem('cached_final_stretch_tokens');
      if (cached) {
        const parsed: CachedData<any[]> = JSON.parse(cached);
        const now = Date.now();
        if (now < parsed.expiresAt) {
          return parsed.data;
        }
      }
    } catch (error) {
      console.warn('Failed to load cached final stretch tokens on init:', error);
    }
    return [];
  });
  
  const [loading, setLoading] = useState(() => {
    // Only show loading if we don't have cached data
    try {
      const cached = localStorage.getItem('cached_final_stretch_tokens');
      if (cached) {
        const parsed: CachedData<any[]> = JSON.parse(cached);
        const now = Date.now();
        if (now < parsed.expiresAt) {
          return false; // We have valid cached data, don't show loading
        }
      }
    } catch (error) {
      console.warn('Failed to check cached final stretch tokens on init:', error);
    }
    return true; // No cached data, show loading
  });
  
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const lastFetchRef = useRef<number>(0);

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
      // Use environment variable for backend URL
      const baseUrl = process.env.NEXT_PUBLIC_GO_SERVICE_URL;
      const apiUrl = `${baseUrl}/v1/pulse/final-stretch?limit=30&t=${Date.now()}`;

      const response = await fetch(apiUrl);
      const data = response.ok ? await response.json() : [];
      
      // Cache the fresh data
      const cacheData: CachedData<any[]> = {
        data: Array.isArray(data) ? data : [],
        timestamp: now,
        expiresAt: now + 5 * 60 * 1000, // 5 minutes
      };
      
      try {
        localStorage.setItem('cached_final_stretch_tokens', JSON.stringify(cacheData));
      } catch (error) {
        console.warn('Failed to cache final stretch tokens:', error);
      }
      
      setTokens(Array.isArray(data) ? data : []);
      setIsStale(false);
      setError(null);
    } catch (error) {
      console.error('Failed to fetch final stretch tokens:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch tokens');
      
      if (!tokens.length) {
        setTokens([]);
      }
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  }, [tokens.length]);

  useEffect(() => {
    const cacheHit = tokens.length > 0;
    
    if (!cacheHit) {
      fetchTokens();
    }
    // Remove automatic background refresh to prevent page refreshes
  }, []); // Empty dependency array to prevent re-runs

  const refreshTokens = useCallback(() => {
    fetchTokens();
  }, [fetchTokens]);

  const invalidateCache = useCallback(() => {
    localStorage.removeItem('cached_final_stretch_tokens');
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

// Specialized hook for Migrated tokens
export function useCachedMigratedTokens() {
  const [tokens, setTokens] = useState<any[]>(() => {
    // Initialize with cached data immediately to prevent flash
    try {
      const cached = localStorage.getItem('cached_migrated_tokens');
      if (cached) {
        const parsed: CachedData<any[]> = JSON.parse(cached);
        const now = Date.now();
        if (now < parsed.expiresAt) {
          return parsed.data;
        }
      }
    } catch (error) {
      console.warn('Failed to load cached migrated tokens on init:', error);
    }
    return [];
  });
  
  const [loading, setLoading] = useState(() => {
    // Only show loading if we don't have cached data
    try {
      const cached = localStorage.getItem('cached_migrated_tokens');
      if (cached) {
        const parsed: CachedData<any[]> = JSON.parse(cached);
        const now = Date.now();
        if (now < parsed.expiresAt) {
          return false; // We have valid cached data, don't show loading
        }
      }
    } catch (error) {
      console.warn('Failed to check cached migrated tokens on init:', error);
    }
    return true; // No cached data, show loading
  });
  
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const lastFetchRef = useRef<number>(0);

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
      // Use environment variable for backend URL
      const baseUrl = process.env.NEXT_PUBLIC_GO_SERVICE_URL;
      const apiUrl = `${baseUrl}/v1/pulse/migrated?limit=30&t=${Date.now()}`;

      const response = await fetch(apiUrl);
      const data = response.ok ? await response.json() : [];
      
      // Cache the fresh data
      const cacheData: CachedData<any[]> = {
        data: Array.isArray(data) ? data : [],
        timestamp: now,
        expiresAt: now + 5 * 60 * 1000, // 5 minutes
      };
      
      try {
        localStorage.setItem('cached_migrated_tokens', JSON.stringify(cacheData));
      } catch (error) {
        console.warn('Failed to cache migrated tokens:', error);
      }
      
      setTokens(Array.isArray(data) ? data : []);
      setIsStale(false);
      setError(null);
    } catch (error) {
      console.error('Failed to fetch migrated tokens:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch tokens');
      
      if (!tokens.length) {
        setTokens([]);
      }
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  }, [tokens.length]);

  useEffect(() => {
    const cacheHit = tokens.length > 0;
    
    if (!cacheHit) {
      fetchTokens();
    }
    // Remove automatic background refresh to prevent page refreshes
  }, []); // Empty dependency array to prevent re-runs

  const refreshTokens = useCallback(() => {
    fetchTokens();
  }, [fetchTokens]);

  const invalidateCache = useCallback(() => {
    localStorage.removeItem('cached_migrated_tokens');
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
