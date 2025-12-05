import { useState, useEffect } from 'react';

export interface MonadXrayData {
  token_address: string;
  name: string | null;
  symbol: string | null;
  image_url: string | null;
  top10_hold_percent: number | null;
  sniper_hold_percent: number | null;
  insider_hold_percent: number | null;
  bonding_curve_progress: number | null;
  is_graduated: boolean | null;
  dev_wallet: string | null;
  dev_hold_percent: number | null;
  dev_bought_count: number | null;
  dev_sold_count: number | null;
  dev_bought_usd: number | null;
  dev_sold_usd: number | null;
  dev_first_trade_at: string | null;
  price_usd: number | null;
  market_cap_usd: number | null;
  liquidity_usd: number | null;
  total_transactions: number | null;
  total_buys: number | null;
  total_sells: number | null;
  unique_traders: number | null;
}

interface MonadXrayResponse {
  status: string;
  token_address: string;
  data: MonadXrayData;
}

interface UseMonadXrayOptions {
  enabled?: boolean;
}

export default function useMonadXray(
  tokenAddress: string | undefined,
  options: UseMonadXrayOptions = {}
) {
  const [xrayData, setXrayData] = useState<MonadXrayData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const enabled = options.enabled !== false;

  useEffect(() => {
    if (!tokenAddress || !enabled) {
      setXrayData(null);
      setIsLoading(false);
      return;
    }

    const fetchXrayData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const baseUrl = process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL;
        if (!baseUrl) {
          throw new Error('NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL is not configured');
        }
        
        const url = new URL(`${baseUrl}/v1/xray`);
        url.searchParams.set('address', tokenAddress);
        
        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result: MonadXrayResponse = await response.json();
        
        if (result.status === 'success' && result.data) {
          setXrayData(result.data);
          console.log(`[useMonadXray] Fetched xray data for ${tokenAddress}`);
        } else {
          setXrayData(null);
          console.log(`[useMonadXray] No xray data found for ${tokenAddress}`);
        }
      } catch (err) {
        console.error(`[useMonadXray] Failed to fetch xray data for ${tokenAddress}:`, err);
        setError(err instanceof Error ? err.message : 'Failed to fetch xray data');
        setXrayData(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchXrayData();
  }, [tokenAddress, enabled]);

  return { xrayData, isLoading, error };
}

