import { useState, useEffect } from 'react';

interface TokenCreatorResponse {
  data: {
    token: {
      creatorAddress: string;
      name: string;
      symbol: string;
    };
  };
}

export default function useTokenCreator(tokenAddress: string | undefined) {
  const [creatorAddress, setCreatorAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenAddress) {
      setCreatorAddress(null);
      setIsLoading(false);
      return;
    }

    const fetchCreatorAddress = async () => {
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
                token(input: {
                  address: "${tokenAddress}"
                  networkId: 1399811149
                }) {
                  creatorAddress
                  name
                  symbol
                }
              }
            `
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result: TokenCreatorResponse = await response.json();
        
        if (result.data?.token?.creatorAddress) {
          setCreatorAddress(result.data.token.creatorAddress);
          console.log(`Found creator address: ${result.data.token.creatorAddress}`);
        }
      } catch (err) {
        console.error('Failed to fetch creator address:', err);
        setError('Failed to fetch creator address');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCreatorAddress();
  }, [tokenAddress]);

  return { creatorAddress, isLoading, error };
}
