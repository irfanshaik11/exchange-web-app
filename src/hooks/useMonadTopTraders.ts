import { useState, useEffect } from 'react';

export interface MonadTopTrader {
  wallet_address: string;
  trade_count: number;
  buy_count: number;
  sell_count: number;
  total_bought_usd: number;
  total_sold_usd: number;
  tokens_bought: number;
  tokens_sold: number;
  tokens_remaining: number;
  avg_buy_price_mon: number | null;
  avg_sell_price_mon: number | null;
  avg_buy_market_cap: number | null;
  avg_sell_market_cap: number | null;
  realized_pnl_usd: number;
  realized_pnl_percent: number;
  unrealized_pnl_usd: number;
  unrealized_pnl_percent: number;
  total_pnl_usd: number;
  total_pnl_percent: number;
  current_value_usd: number;
  last_trade_at: number;
  last_trade_time: string;
}

interface MonadTopTradersResponse {
  status: string;
  count: number;
  token_address: string;
  data: MonadTopTrader[];
}

interface UseMonadTopTradersOptions {
  limit?: number;
  enabled?: boolean;
}

export default function useMonadTopTraders(
  tokenAddress: string | undefined,
  options: UseMonadTopTradersOptions = {}
) {
  const [traders, setTraders] = useState<MonadTopTrader[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const limit = options.limit || 20;
  const enabled = options.enabled !== false;

  useEffect(() => {
    if (!tokenAddress || !enabled) {
      setTraders([]);
      setIsLoading(false);
      return;
    }

    const fetchTopTraders = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const baseUrl = process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL;
        if (!baseUrl) {
          throw new Error('NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL is not configured');
        }
        
        const url = `${baseUrl}/v1/top-traders?token_address=${encodeURIComponent(tokenAddress)}&limit=${limit}`;
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result: MonadTopTradersResponse = await response.json();
        
        if (result.status === 'success' && Array.isArray(result.data)) {
          setTraders(result.data);
        } else {
          setTraders([]);
        }
      } catch (err: any) {
        console.error('Failed to fetch top traders:', err);
        setError(err.message || 'Failed to fetch top traders data');
        setTraders([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTopTraders();
  }, [tokenAddress, limit, enabled]);

  return { traders, isLoading, error };
}

