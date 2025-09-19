import { useState, useEffect } from 'react';

interface UseMintFromPoolAddressReturn {
  mintAddress: string | null;
  isLoading: boolean;
  error: string | null;
}

export default function useMintFromPoolAddress(poolAddress: string | undefined): UseMintFromPoolAddressReturn {
  const [mintAddress, setMintAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!poolAddress) {
      setMintAddress(null);
      setError(null);
      return;
    }

    const fetchMintAddress = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Call the trade-view API to get token data
        const response = await fetch(`/api/token-service/trade-view?pair_address=${poolAddress}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch token data: ${response.status}`);
        }

        const data = await response.json();
        
        if (data?.token?.mint) {
          setMintAddress(data.token.mint);
          console.log('Resolved mint address:', data.token.mint, 'from pool address:', poolAddress);
        } else {
          throw new Error('No mint address found in token data');
        }
      } catch (err) {
        console.error('Failed to fetch mint address from pool address:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch mint address');
        setMintAddress(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMintAddress();
  }, [poolAddress]);

  return {
    mintAddress,
    isLoading,
    error
  };
}

