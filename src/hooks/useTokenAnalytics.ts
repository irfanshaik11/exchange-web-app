// COMMENTED OUT - Token Analytics Hook
/*
import { useState, useEffect } from 'react';

interface TokenMetrics {
  sniper_holding_percentage: number;
  insider_holding_percentage: number;
  bundle_holding_percentage: number;
  dev_holding_percentage: number;
  phishing_holding_percentage: number;
  kols_percentage: number;
  total_holders_count: number;
  holder_distribution: {
    whales: number;
    sharks: number;
    fish: number;
    shrimps: number;
  };
  whale_holding_percentage: number;
  small_holder_percentage: number;
  new_holders_24h: number;
  holder_growth_rate: number;
  holder_retention_rate: number;
  top_holder_changes: {
    entered: string[];
    exited: string[];
  };
  holder_geographic_distribution: any;
  holder_age_distribution: any;
  holder_activity_score: number;
  holder_profit_loss: any;
  holder_holding_period: number;
  holder_turnover_rate: number;
}

interface UseTokenAnalyticsOptions {
  mintAddress?: string;
  enabled?: boolean;
  refreshInterval?: number; // milliseconds
}

interface UseTokenAnalyticsReturn {
  data: TokenMetrics | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// Simple in-memory cache
const cache: Record<string, { data: TokenMetrics; timestamp: number }> = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function useTokenAnalytics({
  mintAddress,
  enabled = true,
  refreshInterval
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
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      // Register token if not already registered (don't wait for response)
      // Ignore errors - token might already exist
      fetch('http://localhost:4000/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mint: mintAddress }),
      }).catch((err) => {
        // Ignore errors - likely "already exists" which is fine
        console.log('Token registration skipped (likely already exists)');
      });

      // Fetch with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      // Always use cached data (refresh=false) for speed
      // The backend will trigger refresh in background if needed
      const response = await fetch(
        `http://localhost:4000/tokens/${mintAddress}/metrics?refresh=false`,
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        // If 404, token not found - show zeros
        if (response.status === 404) {
          setData(null);
          return;
        }
        
        // Try to get error message from response
        try {
          const errorData = await response.json();
          console.error('API Error:', errorData);
        } catch (e) {
          // Ignore JSON parse errors
        }
        
        // For 500 errors, don't throw - just show 0%
        if (response.status === 500) {
          setData(null);
          return;
        }
        
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      console.log('📊 useTokenAnalytics received data for', mintAddress?.slice(0, 8), ':', result);

      if (result.metrics) {
        console.log('✓ Metrics found:', {
          total_holders: result.metrics.total_holders_count,
          whale_pct: result.metrics.whale_holding_percentage,
          sniper_pct: result.metrics.sniper_holding_percentage
        });
        
        // Check if we got empty data (token registered but no holders fetched)
        const hasNoHolderData = result.metrics.total_holders_count === 0;
        
        if (hasNoHolderData && !forceRefresh) {
          // Token exists but has no holder data - fetch from blockchain
          console.log('⚠️ Token has no holder data, fetching from blockchain for:', mintAddress?.slice(0, 8));
          try {
            // Create new timeout for blockchain fetch (longer timeout)
            const refreshController = new AbortController();
            const refreshTimeout = setTimeout(() => refreshController.abort(), 10000); // 10 second timeout for blockchain
            
            const refreshResponse = await fetch(
              `http://localhost:4000/tokens/${mintAddress}/metrics?refresh=true`,
              { signal: refreshController.signal }
            );
            
            clearTimeout(refreshTimeout);
            
            if (refreshResponse.ok) {
              const refreshResult = await refreshResponse.json();
              if (refreshResult.metrics) {
                console.log('✅ Got blockchain data:', refreshResult.metrics.total_holders_count, 'holders', 'whale:', refreshResult.metrics.whale_holding_percentage);
                // Cache the fresh result
                cache[mintAddress] = {
                  data: refreshResult.metrics,
                  timestamp: Date.now(),
                };
                setData(refreshResult.metrics);
                console.log('✅ Data set successfully for', mintAddress?.slice(0, 8));
                return;
              }
            }
          } catch (err) {
            console.log('❌ Failed to refresh from blockchain:', err.message || err);
            // Fall through to use the empty data
          }
        }
        
        // Cache the result
        cache[mintAddress] = {
          data: result.metrics,
          timestamp: Date.now(),
        };
        console.log('💾 Caching data for', mintAddress?.slice(0, 8));
        setData(result.metrics);
        console.log('✅ Data set (cached) for', mintAddress?.slice(0, 8));
      } else {
        console.log('❌ No metrics in response for', mintAddress?.slice(0, 8));
        setData(null);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Request timeout for', mintAddress);
      } else {
        console.error('Error fetching token analytics:', err);
      }
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics');
      // Set empty data on error so we show "0%" instead of loading forever
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();

    // Set up refresh interval if specified
    if (refreshInterval && enabled && mintAddress) {
      const interval = setInterval(fetchAnalytics, refreshInterval);
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
*/

