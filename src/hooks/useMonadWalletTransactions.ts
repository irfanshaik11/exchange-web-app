import { useState, useEffect, useCallback, useRef } from 'react';
import { env } from '~/env';

export interface MonadWalletTrade {
  tx_hash: string;
  block_number: number;
  block_timestamp: number;
  token_address: string;
  trader_address: string;
  is_buy: boolean;
  type: 'buy' | 'sell';
  mon_amount: string | number;
  token_amount: string | number;
  price_mon: string | number;
  launchpad_protocol: string;
  portal_address: string;
  created_at?: string;
}

interface UseMonadWalletTransactionsOptions {
  walletAddress: string;
  tokenAddress?: string;
  tradeType?: 'buy' | 'sell';
  limit?: number;
  enabled?: boolean;
  pollInterval?: number; // For live updates
}

interface UseMonadWalletTransactionsReturn {
  trades: MonadWalletTrade[];
  loading: boolean;
  error: string | null;
  total: number;
  refetch: () => Promise<void>;
  loadMore: () => void;
}

export function useMonadWalletTransactions(
  options: UseMonadWalletTransactionsOptions
): UseMonadWalletTransactionsReturn {
  const {
    walletAddress,
    tokenAddress,
    tradeType,
    limit = 50,
    enabled = true,
    pollInterval = 5000, // 5 seconds
  } = options;

  const [trades, setTrades] = useState<MonadWalletTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  // Fetch trades from API
  const fetchTrades = useCallback(async () => {
    if (!walletAddress || !enabled) return;

    try {
      setLoading(true);
      const baseUrl = env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL;
      if (!baseUrl) {
        throw new Error('NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL is not configured');
      }

      const params = new URLSearchParams({
        address: walletAddress,
        limit: limit.toString(),
        offset: offset.toString(),
      });

      if (tokenAddress) params.set('token_address', tokenAddress);
      if (tradeType) params.set('type', tradeType);

      const response = await fetch(
        `${baseUrl}/v1/wallet/trades?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch trades: ${response.status}`);
      }

      const data = await response.json();
      if (data.status === 'success') {
        setTrades(data.data || []);
        setTotal(data.total || 0);
        setError(null);
      } else {
        throw new Error(data.message || 'Failed to fetch trades');
      }
    } catch (err) {
      console.error('Error fetching wallet trades:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch trades');
    } finally {
      setLoading(false);
    }
  }, [walletAddress, tokenAddress, tradeType, limit, offset, enabled]);

  // WebSocket connection for live updates (optional - can be enhanced later)
  useEffect(() => {
    if (!walletAddress || !enabled) return;

    const baseUrl = env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL;
    if (!baseUrl) return;

    // For now, we'll use polling. WebSocket can be added later if needed
    // const wsUrl = `${baseUrl.replace(/^http/, 'ws')}/v1/stream/wallet?address=${walletAddress}`;
    // WebSocket implementation can be added here

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [walletAddress, enabled]);

  // Polling fallback for live updates
  useEffect(() => {
    if (!enabled || !walletAddress) {
      return;
    }

    fetchTrades(); // Initial fetch

    pollIntervalRef.current = setInterval(() => {
      if (mountedRef.current) {
        fetchTrades();
      }
    }, pollInterval);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [fetchTrades, enabled, pollInterval, walletAddress]);

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true;
    if (enabled && walletAddress) {
      fetchTrades();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [fetchTrades, enabled, walletAddress]);

  const loadMore = useCallback(() => {
    setOffset((prev) => prev + limit);
  }, [limit]);

  return {
    trades,
    loading,
    error,
    total,
    refetch: fetchTrades,
    loadMore,
  };
}

