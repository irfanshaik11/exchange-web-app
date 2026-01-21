import { useEffect, useRef, useState, useCallback } from "react";
import throttle from "lodash.throttle";
import { getCachedTradeData } from "~/utils/tokenCache";

const TOKEN_SERVICE_URL = (process.env.NEXT_PUBLIC_GO_SERVICE_URL || process.env.NEXT_PUBLIC_TOKEN_SERVICE_URL || "").replace(/\/$/, "");

interface PollingState {
  isPolling: boolean;
  error: string | null;
  loading: boolean;
}

/**
 * Fetch the correct pair address from the token service using GET /v1/get-pair/{mint}
 * This uses Redis cache-through pattern for fast lookups
 * Exported for use by quick buy and other trade flows
 */
export async function fetchVerifiedPairAddress(mintAddress: string): Promise<string | null> {
  if (!TOKEN_SERVICE_URL || !mintAddress) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(`${TOKEN_SERVICE_URL}/v1/get-pair/${mintAddress}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data = await response.json();
    const pairAddress = data?.pair_address;
    if (typeof pairAddress === "string" && pairAddress.length > 0) {
      return pairAddress;
    }
    return null;
  } catch {
    return null;
  }
}

export default function useSingleTokenPolling(address: string | undefined, mintHint?: string) {
  const [token, setToken] = useState<any>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [state, setState] = useState<PollingState>({
    isPolling: false,
    error: null,
    loading: false, // Start with false for faster initial render
  });
  const [isHydrating, setIsHydrating] = useState(false);
  const [resolvedPairAddress, setResolvedPairAddress] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const addressRef = useRef(address);
  const hydrationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  addressRef.current = address;

  const throttledSetToken = useCallback(
    throttle((newData: any) => {
      setToken(newData);
      setState(prev => ({ ...prev, loading: false }));
    }, 1000),
    []
  );

  // Check if address is a mint address (needs resolution to pair_address)
  const isMintAddress = useCallback((addr: string) => {
    // Pair addresses are typically longer (44+ chars) and don't end with 'pump'
    // Mint addresses are shorter and often end with 'pump'
    // If it's already a pair_address format, skip resolution
    return addr.length < 50 && addr.endsWith('pump');
  }, []);

  // Resolve address to pair address with timeout
  const resolveAddress = useCallback(async (addr: string) => {
    // If it's already a pair address, return it
    if (!isMintAddress(addr)) {
      return addr;
    }

    // If it's a mint address, hydrate it with timeout
    setIsHydrating(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      console.warn(`[useSingleTokenPolling] Hydration timeout for ${addr} after 5 seconds`);
    }, 5000);

    try {
      const response = await fetch('/api/token-service/hydrate-pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mint: addr }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        return data.pair_address;
      } else {
        return null;
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        return null;
      }
      return null;
    } finally {
      setIsHydrating(false);
    }
  }, [isMintAddress]);

  // Track if we've already verified the pair address for this token
  const pairAddressVerifiedRef = useRef<string | null>(null);
  // Store the verified pair address to use on subsequent polls
  const verifiedPairAddressRef = useRef<string | null>(null);

  // Load data from API with caching
  const loadData = useCallback(async () => {
    if (!resolvedPairAddress) return;

    // Validate pair address format
    if (typeof resolvedPairAddress !== 'string' || resolvedPairAddress.length < 32) {
      setToken(null);
      setState(prev => ({ ...prev, loading: false }));
      return;
    }

    try {

      // Try to get cached data first for instant display
      // getCachedTradeData will fetch if not cached, so this always returns data
      const data = await getCachedTradeData(resolvedPairAddress);

      if (data) {
        // Set token data
        if (data.token) {
          // CRITICAL: Verify the pair address from the token service
          // Use mintHint from URL query params as fallback if token.mint is not available
          const mintAddress = data.token.mint || data.token.mint_address || mintHint;

          // CRITICAL: If mintHint is provided, verify the returned token matches
          // This prevents showing wrong token data when cache returns stale data
          if (mintHint && data.token.mint && data.token.mint !== mintHint) {
            console.warn('[useSingleTokenPolling] Token mint mismatch! Backend returned wrong token.', {
              expectedMint: mintHint,
              actualMint: data.token.mint,
              actualName: data.token.name || data.token.symbol,
              resolvedPairAddress,
            });
            // Don't set the token - let the UI use optimistic data from URL
            setState(prev => ({ ...prev, loading: false }));
            return;
          }

          // Verify pair address and use it for the token (don't reload page)
          let effectivePairAddress = resolvedPairAddress;

          if (mintAddress && pairAddressVerifiedRef.current !== mintAddress) {
            // First time for this token - verify the pair address
            const verifiedPairAddress = await fetchVerifiedPairAddress(mintAddress);
            pairAddressVerifiedRef.current = mintAddress;

            if (verifiedPairAddress) {
              // Store verified address for subsequent polls
              verifiedPairAddressRef.current = verifiedPairAddress;
              effectivePairAddress = verifiedPairAddress;
            }
          } else if (verifiedPairAddressRef.current) {
            // Already verified - use the stored verified address
            effectivePairAddress = verifiedPairAddressRef.current;
          }

          // Update token with verified pair_address
          // Also update migrated_pool_address to prevent getEffectivePoolAddress from using wrong address
          const tokenWithVerifiedPair = {
            ...data.token,
            pair_address: effectivePairAddress,
            migrated_pool_address: effectivePairAddress,
            verified_pair_address: true,
          };
          throttledSetToken(tokenWithVerifiedPair);
        }

        // Set trades data
        if (data.recentTrades) {
          setTrades(data.recentTrades);
        }

        setState(prev => ({ ...prev, error: null, loading: false }));
      } else {
        // No data available
        setToken(null);
        setState(prev => ({ ...prev, loading: false }));
      }

    } catch (err: any) {
      setState(prev => ({
        ...prev,
        error: err.message || 'Failed to load data',
        loading: false
      }));
    }
  }, [resolvedPairAddress, throttledSetToken, mintHint]);

  // Start polling
  const startPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    setState(prev => ({ ...prev, isPolling: true, loading: true }));

    // Load initial data immediately
    loadData();

    // Then poll every 5 seconds
    intervalRef.current = setInterval(() => {
      loadData();
    }, 5000);
  }, [resolvedPairAddress, loadData]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setState(prev => ({ ...prev, isPolling: false }));
  }, []);

  // Effect to resolve address and manage polling lifecycle
  useEffect(() => {
    if (address) {
      // Reset state when address changes to prevent showing stale data
      setToken(null);
      setTrades([]);
      setResolvedPairAddress(null);
      pairAddressVerifiedRef.current = null; // Reset verification state
      verifiedPairAddressRef.current = null; // Reset verified address
      setState(prev => ({ ...prev, loading: true, error: null }));

      // Resolve address first
      resolveAddress(address).then((resolved) => {
        if (resolved) {
          setResolvedPairAddress(resolved);
        } else {
          setState(prev => ({
            ...prev,
            error: 'Failed to resolve address to pair address',
            loading: false
          }));
        }
      });
    } else {
      stopPolling();
      setToken(null);
      setTrades([]);
      setResolvedPairAddress(null);
      pairAddressVerifiedRef.current = null;
      verifiedPairAddressRef.current = null;
    }

    // Cleanup on unmount or address change
    return () => {
      stopPolling();
    };
  }, [address, resolveAddress, stopPolling]);

  // Effect to start polling when we have a resolved pair address
  useEffect(() => {
    if (resolvedPairAddress) {
      startPolling();
    } else {
      stopPolling();
    }
  }, [resolvedPairAddress, startPolling, stopPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    token,
    trades,
    isPolling: state.isPolling,
    loading: state.loading,
    error: state.error,
    isHydrating,
    resolvedPairAddress,
    // Expose manual refresh function
    refresh: loadData,
  };
}

