import { useState, useEffect, useCallback, useRef } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';

interface UseWalletTokenBalancesReturn {
  balances: Record<string, number>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch actual token balances from wallet for positions
 * This checks the real blockchain state, not just backend-reported values
 */
export function useWalletTokenBalances(
  walletAddress: string | null | undefined,
  tokenAddresses: string[],
  options: {
    enabled?: boolean;
    refreshInterval?: number;
    chain?: string;
  } = {}
): UseWalletTokenBalancesReturn {
  const { enabled = true, refreshInterval = 10000, chain = 'sol' } = options;
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchBalances = useCallback(async () => {
    if (!enabled || !walletAddress || tokenAddresses.length === 0) {
      return;
    }

    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const uniqueAddresses = Array.from(new Set(tokenAddresses.filter(Boolean)));
      
      if (uniqueAddresses.length === 0) {
        setLoading(false);
        return;
      }

      const balanceMap: Record<string, number> = {};

      if (chain === 'sol' || chain === 'solana') {
        // For Solana, use RPC to get actual token balances
        const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
        const connection = new Connection(RPC_URL, 'confirmed');

        const walletPubkey = new PublicKey(walletAddress);

        // Fetch all token balances in parallel
        const balancePromises = uniqueAddresses.map(async (tokenAddress) => {
          try {
            const mintPubkey = new PublicKey(tokenAddress);
            const ata = getAssociatedTokenAddressSync(mintPubkey, walletPubkey);
            
            const balance = await connection.getTokenAccountBalance(ata, 'confirmed');
            const uiAmount = balance.value.uiAmount;
            
            if (controller.signal.aborted) return null;
            
            return {
              tokenAddress,
              balance: typeof uiAmount === 'number' ? uiAmount : 0,
            };
          } catch (err: any) {
            // Token account might not exist (balance is 0)
            if (err.message?.includes('InvalidAccountData') || err.message?.includes('could not find account')) {
              return { tokenAddress, balance: 0 };
            }
            console.warn(`Failed to fetch balance for ${tokenAddress}:`, err.message);
            return null;
          }
        });

        const results = await Promise.all(balancePromises);
        
        if (controller.signal.aborted) return;

        results.forEach((result) => {
          if (result) {
            balanceMap[result.tokenAddress] = result.balance;
          }
        });
      } else if (chain === 'monad') {
        // For Monad, we might need to use a different approach
        // For now, try to use an API endpoint if available
        try {
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/trade/get_token_balances?wallet=${walletAddress}&tokens=${uniqueAddresses.join(',')}`,
            {
              method: 'GET',
              signal: controller.signal,
            }
          );

          if (response.ok) {
            const data = await response.json();
            if (data.balances) {
              Object.assign(balanceMap, data.balances);
            }
          }
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            console.warn('Failed to fetch Monad token balances:', err);
          }
        }
      }

      if (!controller.signal.aborted) {
        setBalances((prev) => ({ ...prev, ...balanceMap }));
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return; // Request was cancelled, ignore
      }
      console.error('Error fetching wallet token balances:', err);
      setError(err.message || 'Failed to fetch balances');
      // Don't clear existing balances on error - keep last known balances
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [walletAddress, tokenAddresses, enabled, chain]);

  // Initial fetch and setup interval
  useEffect(() => {
    if (!enabled || !walletAddress || tokenAddresses.length === 0) {
      setBalances({});
      setLoading(false);
      return;
    }

    // Initial fetch
    fetchBalances();

    // Set up interval for periodic updates
    intervalRef.current = setInterval(() => {
      fetchBalances();
    }, refreshInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchBalances, refreshInterval, enabled]);

  const refresh = useCallback(async () => {
    await fetchBalances();
  }, [fetchBalances]);

  return {
    balances,
    loading,
    error,
    refresh,
  };
}

