import { useEffect, useRef, useState, useCallback } from "react";
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
  const [resolvedPairAddress, setResolvedPairAddress] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const addressRef = useRef(address);
  addressRef.current = address;

  // Resolve address — all navigation is through mint, no hydration needed.
  const resolveAddress = useCallback(async (addr: string) => {
    return addr;
  }, []);

  // loadData is a no-op: the /v1/trade/view endpoint is dead (404).
  // Token and trades data now come from WebSocket and other sources.
  // Kept as stub so the polling lifecycle doesn't need restructuring.
  const loadData = useCallback(async () => {
    if (!resolvedPairAddress) return;
    setState(prev => ({ ...prev, loading: false }));
  }, [resolvedPairAddress]);

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
    resolvedPairAddress,
    // Expose manual refresh function
    refresh: loadData,
  };
}

