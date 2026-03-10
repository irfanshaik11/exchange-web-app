import { useState, useEffect } from 'react';

const isDev = process.env.NODE_ENV !== 'production';

export interface MonadDevTokenData {
  buy_count: number;
  buy_volume_mon: number;
  buy_volume_usd: number;
  dev_hold_percent: number;
  dev_wallet: string;
  mon_balance: number;
  mon_balance_usd: number;
  sell_count: number;
  sell_volume_mon: number;
  sell_volume_usd: number;
  token_balance: number;
}

interface MonadDevTokenResponse {
  status: string;
  token_address: string;
  data: MonadDevTokenData;
}

interface UseMonadDevTokensOptions {
  enabled?: boolean;
}

export default function useMonadDevTokens(
  tokenAddress: string | undefined,
  options: UseMonadDevTokensOptions = {}
) {
  const [devTokenData, setDevTokenData] = useState<MonadDevTokenData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const enabled = options.enabled !== false;

  useEffect(() => {
    if (!tokenAddress || !enabled) {
      setDevTokenData(null);
      setIsLoading(false);
      return;
    }

    const fetchDevTokenData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const baseUrl = process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL;
        if (!baseUrl) {
          throw new Error('NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL is not configured');
        }
        
        const url = new URL(`${baseUrl}/v1/dev-wallet`);
        url.searchParams.set('token_address', tokenAddress);
        
        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result: MonadDevTokenResponse = await response.json();
        
        if (result.status === 'success' && result.data) {
          setDevTokenData(result.data);
          isDev && console.log(`[useMonadDevTokens] Fetched dev token data for ${tokenAddress}`);
        } else {
          setDevTokenData(null);
          isDev && console.log(`[useMonadDevTokens] No dev token data found for ${tokenAddress}`);
        }
      } catch (err) {
        console.error(`[useMonadDevTokens] Failed to fetch dev token data for ${tokenAddress}:`, err);
        setError(err instanceof Error ? err.message : 'Failed to fetch dev token data');
        setDevTokenData(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDevTokenData();
  }, [tokenAddress, enabled]);

  return { devTokenData, isLoading, error };
}

