import { useState, useEffect } from 'react';

interface CodexDevToken {
  token: {
    address: string;
    name: string;
    symbol: string;
    createdAt: number;
    creatorAddress: string;
    migrated_pool_address?: string | null;
  };
  marketCap: string;
  liquidity: string;
  volume24: string;
}

interface CodexDevTokensResponse {
  filterTokens: {
    results: CodexDevToken[];
  };
}

interface UseCodexDevTokensOptions {
  limit?: number;
  fetchAll?: boolean; // If true, fetch all tokens for pie chart calculations
}

export default function useCodexDevTokens(
  tokenAddress: string | undefined,
  options: UseCodexDevTokensOptions = {}
) {
  const [tokens, setTokens] = useState<CodexDevToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenAddress) {
      setTokens([]);
      setIsLoading(false);
      return;
    }

    const fetchDevTokens = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Set default values for parameters
        // If fetchAll is true, use a large limit to get all tokens for pie chart
        const limit = options.fetchAll ? 10000 : (options.limit || 10);
        const baseUrl = process.env.NEXT_PUBLIC_GO_SERVICE_URL;
        
        // Build the URL with query parameters
        const url = new URL(`${baseUrl}/v1/tokens/dev`);
        url.searchParams.set('tokenAddress', tokenAddress);
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

        const result: CodexDevTokensResponse = await response.json();
        
        if (result.filterTokens?.results) {
          setTokens(result.filterTokens.results);
          console.log(`Fetched ${result.filterTokens.results.length} dev tokens`);
        } else {
          setTokens([]);
          console.log('No dev tokens found');
        }
      } catch (err) {
        console.error('Failed to fetch dev tokens:', err);
        setError('Failed to fetch dev tokens data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDevTokens();
  }, [tokenAddress, options.limit, options.fetchAll]);

  return { tokens, isLoading, error };
}
