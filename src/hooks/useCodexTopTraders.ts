import { useState, useEffect } from 'react';

interface CodexTopTrader {
  walletAddress: string;
  tokenAmountBought: string;
  tokenAmountSold: string;
  amountBoughtUsd: string;
  amountSoldUsd: string;
  volumeUsd: string;
  realizedProfitUsd: string;
  realizedProfitPercentage: number;
  buys: number;
  sells: number;
  tokenBalance: string;
  firstTransactionAt: number;
  lastTransactionAt: number;
}

interface CodexTopTradersResponse {
  tokenTopTraders: {
    items: CodexTopTrader[] | null;
  };
}

interface UseCodexTopTradersOptions {
  limit?: number;
  tradingPeriod?: string;
}

export default function useCodexTopTraders(
  tokenAddress: string | undefined,
  options: UseCodexTopTradersOptions = {}
) {
  const [traders, setTraders] = useState<CodexTopTrader[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenAddress) {
      setTraders([]);
      setIsLoading(false);
      return;
    }

    const fetchTopTraders = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Set default values for parameters
        const limit = options.limit || 20;
        const tradingPeriod = options.tradingPeriod || 'WEEK';
        const baseUrl = process.env.NEXT_PUBLIC_GO_SERVICE_URL;
        
        // Build the URL with query parameters
        const url = new URL(`${baseUrl}/v1/tokens/top-traders`);
        url.searchParams.set('tokenAddress', tokenAddress);
        url.searchParams.set('limit', limit.toString());
        url.searchParams.set('tradingPeriod', tradingPeriod);
        
        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result: CodexTopTradersResponse = await response.json();
        
        if (result.tokenTopTraders?.items) {
          setTraders(result.tokenTopTraders.items);
          console.log(`Fetched ${result.tokenTopTraders.items.length} top traders`);
        } else {
          setTraders([]);
          console.log('No top traders found');
        }
      } catch (err) {
        console.error('Failed to fetch top traders:', err);
        setError('Failed to fetch top traders data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTopTraders();
  }, [tokenAddress, options.limit, options.tradingPeriod]);

  return { traders, isLoading, error };
}
