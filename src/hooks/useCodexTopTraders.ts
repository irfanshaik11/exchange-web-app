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
  data: {
    tokenTopTraders: {
      items: CodexTopTrader[];
    };
  };
}

export default function useCodexTopTraders(tokenAddress: string | undefined) {
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
        const apiKey = process.env.NEXT_PUBLIC_CODEX_API_KEY;
        
        const response = await fetch('https://graph.codex.io/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': apiKey || '',
          },
          body: JSON.stringify({
            query: `
              query {
                tokenTopTraders(
                  input: {
                    tokenAddress: "${tokenAddress}"
                    networkId: 1399811149
                    tradingPeriod: WEEK
                    limit: 20
                    offset: 0
                  }
                ) {
                  items {
                    walletAddress
                    tokenAmountBought
                    tokenAmountSold
                    amountBoughtUsd
                    amountSoldUsd
                    volumeUsd
                    realizedProfitUsd
                    realizedProfitPercentage
                    buys
                    sells
                    tokenBalance
                    firstTransactionAt
                    lastTransactionAt
                  }
                }
              }
            `
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result: CodexTopTradersResponse = await response.json();
        
        if (result.data?.tokenTopTraders?.items) {
          setTraders(result.data.tokenTopTraders.items);
          console.log(`Fetched ${result.data.tokenTopTraders.items.length} top traders`);
        }
      } catch (err) {
        console.error('Failed to fetch top traders:', err);
        setError('Failed to fetch top traders data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTopTraders();
  }, [tokenAddress]);

  return { traders, isLoading, error };
}
