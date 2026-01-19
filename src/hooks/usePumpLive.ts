import { useEffect, useState, useCallback, useRef } from 'react';

export interface PumpLiveToken {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  image_uri: string;
  metadata_uri: string;
  twitter: string;
  telegram: string;
  website: string;
  bonding_curve: string;
  associated_bonding_curve: string;
  creator: string;
  created_timestamp: number;
  raydium_pool: string;
  complete: boolean;
  virtual_sol_reserves: number;
  virtual_token_reserves: number;
  total_supply: number;
  show_name: boolean;
  king_of_the_hill_timestamp: number;
  market_cap: number;
  reply_count: number;
  last_reply: number;
  nsfw: boolean;
  market_id: string;
  inverted: boolean;
  username: string;
  profile_image: string;
  usd_market_cap: number;
}

interface UsePumpLiveOptions {
  enabled?: boolean;
  refreshInterval?: number;
  limit?: number;
}

interface UsePumpLiveReturn {
  tokens: PumpLiveToken[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  lastUpdated: Date | null;
}

const API_URL = 'https://token-stage.narrative.trade/v1/pump/live';
const CACHE_KEY = 'pump_live_tokens';
const CACHE_TTL = 30 * 1000; // 30 seconds

/**
 * Hook to fetch live pump tokens from Narrative API
 * Returns tokens sorted by created_timestamp (newest first)
 */
export function usePumpLive(
  options: UsePumpLiveOptions = {}
): UsePumpLiveReturn {
  const {
    enabled = true,
    refreshInterval = 10000, // Refresh every 10 seconds
    limit = 50,
  } = options;

  const [tokens, setTokens] = useState<PumpLiveToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load cached tokens on mount
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const { tokens: cachedTokens, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        if (age < CACHE_TTL && Array.isArray(cachedTokens) && cachedTokens.length > 0) {
          setTokens(cachedTokens);
          setLastUpdated(new Date(timestamp));
        }
      }
    } catch (err) {
      console.warn('[usePumpLive] Failed to load cache:', err);
    }
  }, []);

  const fetchTokens = useCallback(async () => {
    if (!enabled) return;

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(API_URL, {
        signal: abortControllerRef.current.signal,
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: PumpLiveToken[] = await response.json();

      // Sort by created_timestamp descending (newest first) and limit
      const sorted = data
        .sort((a, b) => (b.created_timestamp || 0) - (a.created_timestamp || 0))
        .slice(0, limit);

      setTokens(sorted);
      setLastUpdated(new Date());

      // Cache the tokens
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({
          tokens: sorted,
          timestamp: Date.now(),
        }));
      } catch (cacheErr) {
        console.warn('[usePumpLive] Failed to cache tokens:', cacheErr);
      }

    } catch (err: any) {
      if (err.name === 'AbortError') {
        return; // Request was cancelled, not an error
      }
      console.error('[usePumpLive] Fetch error:', err);
      setError(err.message || 'Failed to fetch pump live tokens');
    } finally {
      setLoading(false);
    }
  }, [enabled, limit]);

  // Initial fetch and polling
  useEffect(() => {
    if (!enabled) {
      // Clear interval if disabled
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial fetch
    fetchTokens();

    // Set up polling interval
    intervalRef.current = setInterval(fetchTokens, refreshInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [enabled, refreshInterval, fetchTokens]);

  return {
    tokens,
    loading,
    error,
    refetch: fetchTokens,
    lastUpdated,
  };
}

// Helper function to format time ago
export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// Helper function to format market cap
export function formatMarketCap(usdMarketCap: number): string {
  if (usdMarketCap >= 1_000_000) {
    return `$${(usdMarketCap / 1_000_000).toFixed(2)}M`;
  }
  if (usdMarketCap >= 1_000) {
    return `$${(usdMarketCap / 1_000).toFixed(2)}K`;
  }
  return `$${usdMarketCap.toFixed(2)}`;
}

export default usePumpLive;
