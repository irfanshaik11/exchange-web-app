import { useState, useEffect } from 'react';

interface CodexDevToken {
  token: {
    address: string;
    name: string;
    symbol: string;
    createdAt: number;
    creatorAddress: string;
  };
  marketCap: string;
  liquidity: string;
  volume24: string;
}

interface CodexDevTokensResponse {
  data: {
    filterTokens: {
      results: CodexDevToken[];
    };
  };
}

export default function useCodexDevTokens(creatorAddress?: string) {
  const [tokens, setTokens] = useState<CodexDevToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!creatorAddress) {
      setTokens([]);
      setIsLoading(false);
      return;
    }

    const fetchDevTokens = async () => {
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
                filterTokens(
                  filters: {
                    network: [1399811149]
                    creatorAddress: "${creatorAddress}"
                  }
                  rankings: {
                    attribute: createdAt
                    direction: DESC
                  }
                  limit: 50
                ) {
                  results {
                    token {
                      address
                      name
                      symbol
                      createdAt
                      creatorAddress
                    }
                    marketCap
                    liquidity
                    volume24
                  }
                }
              }
            `
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result: CodexDevTokensResponse = await response.json();
        
        if (result.data?.filterTokens?.results) {
          setTokens(result.data.filterTokens.results);
          console.log(`Fetched ${result.data.filterTokens.results.length} dev tokens`);
        }
      } catch (err) {
        console.error('Failed to fetch dev tokens:', err);
        setError('Failed to fetch dev tokens data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDevTokens();
  }, [creatorAddress]);

  return { tokens, isLoading, error };
}
