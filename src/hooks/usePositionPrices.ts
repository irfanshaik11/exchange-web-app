import { useState, useEffect, useRef, useCallback } from 'react';

interface MarketData {
  mint: string;
  price_usd: number;
  market_cap_usd: number;
  volume_usd?: number;
  updated_at: string;
}

interface UsePositionPricesReturn {
  prices: Record<string, number>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch and maintain live prices for position tokens
 * Automatically updates prices every 5 seconds
 */
export function usePositionPrices(
  tokenAddresses: string[],
  options: {
    enabled?: boolean;
    refreshInterval?: number;
    chain?: string;
  } = {}
): UsePositionPricesReturn {
  const { enabled = true, refreshInterval = 5000, chain = 'sol' } = options;
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchPrices = useCallback(async () => {
    if (!enabled || tokenAddresses.length === 0) {
      return;
    }

    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      // Filter out empty addresses and get unique addresses
      const uniqueAddresses = Array.from(new Set(tokenAddresses.filter(Boolean)));
      
      if (uniqueAddresses.length === 0) {
        setLoading(false);
        return;
      }

      // For Solana, use Codex API
      if (chain === 'sol' || chain === 'solana') {
        const response = await fetch('/api/codex/market-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ mints: uniqueAddresses }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch prices: ${response.statusText}`);
        }

        const data: Record<string, MarketData> = await response.json();
        
        if (controller.signal.aborted) return;

        const priceMap: Record<string, number> = {};
        Object.entries(data).forEach(([mint, marketData]) => {
          if (marketData?.price_usd && marketData.price_usd > 0) {
            priceMap[mint] = marketData.price_usd;
          }
        });

        setPrices((prev) => ({ ...prev, ...priceMap }));
      } else {
        // For Monad or other chains, we might need a different endpoint
        // For now, we'll try to use the same endpoint or leave prices empty
        console.warn(`Price fetching not yet implemented for chain: ${chain}`);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return; // Request was cancelled, ignore
      }
      console.error('Error fetching position prices:', err);
      setError(err.message || 'Failed to fetch prices');
      // Don't clear existing prices on error - keep last known prices
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [tokenAddresses, enabled, chain]);

  // Initial fetch and setup interval
  useEffect(() => {
    if (!enabled || tokenAddresses.length === 0) {
      setPrices({});
      setLoading(false);
      return;
    }

    // Initial fetch
    fetchPrices();

    // Set up interval for periodic updates
    intervalRef.current = setInterval(() => {
      fetchPrices();
    }, refreshInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchPrices, refreshInterval, enabled]);

  const refresh = useCallback(async () => {
    await fetchPrices();
  }, [fetchPrices]);

  return {
    prices,
    loading,
    error,
    refresh,
  };
}

