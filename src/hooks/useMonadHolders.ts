import { useState, useEffect } from 'react';

export interface MonadHolder {
  wallet_address: string;
  mon_balance: number;
  mon_balance_usd: number;
  last_active_at: number;
  last_active_time: string;
  total_bought_mon: number;
  total_bought_usd: number;
  avg_buy_market_cap: number | null;
  total_sold_mon: number;
  total_sold_usd: number;
  avg_sell_market_cap: number | null;
  unrealized_pnl_mon: number;
  unrealized_pnl_usd: number;
  unrealized_pnl_percent: number;
  total_pnl_mon: number;
  total_pnl_usd: number;
  total_pnl_percent: number;
  tokens_remaining: number;
  remaining_value_mon: number;
  remaining_value_usd: number;
  remaining_percent: number;
  funding_mon: number;
  funding_usd: number;
  tf_amount: number;
  buy_count: number;
  sell_count: number;
  trade_count: number;
  tokens_bought: number;
  tokens_sold: number;
  realized_pnl_mon?: number;
  realized_pnl_percent?: number;
  realized_pnl_usd?: number;
  avg_buy_price_mon?: number | null;
  avg_sell_price_mon?: number | null;
}

interface MonadHoldersResponse {
  status: string;
  count: number;
  token_address: string;
  data: MonadHolder[];
}

interface UseMonadHoldersOptions {
  limit?: number;
  enabled?: boolean;
}

export default function useMonadHolders(
  tokenAddress: string | undefined,
  options: UseMonadHoldersOptions = {}
) {
  const [holders, setHolders] = useState<MonadHolder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const limit = options.limit || 20;
  const enabled = options.enabled !== false;

  useEffect(() => {
    if (!tokenAddress || !enabled) {
      setHolders([]);
      setIsLoading(false);
      return;
    }

    const fetchHolders = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const baseUrl = process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL;
        if (!baseUrl) {
          throw new Error('NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL is not configured');
        }
        
        const url = new URL(`${baseUrl}/v1/holders`);
        url.searchParams.set('token_address', tokenAddress);
        url.searchParams.set('limit', limit.toString());
        
        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result: MonadHoldersResponse = await response.json();
        
        if (result.status === 'success' && Array.isArray(result.data)) {
          setHolders(result.data);
          console.log(`[useMonadHolders] Fetched ${result.data.length} holders for ${tokenAddress}`);
        } else {
          setHolders([]);
          console.log(`[useMonadHolders] No holders found for ${tokenAddress}`);
        }
      } catch (err) {
        console.error(`[useMonadHolders] Failed to fetch holders for ${tokenAddress}:`, err);
        setError(err instanceof Error ? err.message : 'Failed to fetch holders data');
        setHolders([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHolders();
  }, [tokenAddress, limit, enabled]);

  return { holders, isLoading, error };
}

