import { useEffect, useRef, useState, useCallback } from "react";
import throttle from "lodash.throttle";
import { getCachedTradeData } from "~/utils/tokenCache";

interface PollingState {
  isPolling: boolean;
  error: string | null;
  loading: boolean;
}

export default function useSingleTokenPolling(address: string | undefined) {
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
      console.log('Setting token data:', newData);
      console.log('Token name:', newData?.name);
      console.log('Token symbol:', newData?.symbol);
      console.log('Token uri:', newData?.uri);
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
      console.log('Resolving mint address to pair address:', addr);
      const response = await fetch('/api/token-service/hydrate-pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mint: addr }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Successfully resolved address:', data);
        return data.pair_address;
      } else {
        console.error('Failed to resolve address:', response.status);
        return null;
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.warn(`[useSingleTokenPolling] Hydration aborted for ${addr} - timeout`);
        return null;
      }
      console.error('Error resolving address:', error);
      return null;
    } finally {
      setIsHydrating(false);
    }
  }, [isMintAddress]);

  // Load data from API with caching
  const loadData = useCallback(async () => {
    if (!resolvedPairAddress) return;

    // Validate pair address format
    if (typeof resolvedPairAddress !== 'string' || resolvedPairAddress.length < 32) {
      console.warn('Invalid pair address format:', resolvedPairAddress);
      setToken(null);
      setState(prev => ({ ...prev, loading: false }));
      return;
    }

    try {
      console.log('Loading data for pair_address:', resolvedPairAddress);

      // Try to get cached data first for instant display
      // getCachedTradeData will fetch if not cached, so this always returns data
      const data = await getCachedTradeData(resolvedPairAddress);

      if (data) {
        console.log('Data received:', data);

        // Set token data
        if (data.token) {
          console.log('Setting token data:', data.token);
          throttledSetToken(data.token);
        }

        // Set trades data
        if (data.recentTrades) {
          console.log('Setting trades data:', data.recentTrades);
          setTrades(data.recentTrades);
        }

        setState(prev => ({ ...prev, error: null, loading: false }));
      } else {
        // No data available
        console.warn(`No data available for pair_address: ${resolvedPairAddress}`);
        setToken(null);
        setState(prev => ({ ...prev, loading: false }));
      }

    } catch (err: any) {
      console.error('Failed to load data:', err);
      setState(prev => ({
        ...prev,
        error: err.message || 'Failed to load data',
        loading: false
      }));
    }
  }, [resolvedPairAddress, throttledSetToken]);

  // Start polling
  const startPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    console.log('Starting polling for resolved pair address:', resolvedPairAddress);
    setState(prev => ({ ...prev, isPolling: true, loading: true }));
    
    // Load initial data immediately
    loadData();

    // Then poll every 5 seconds (reduced from 3s for better performance)
    intervalRef.current = setInterval(() => {
      console.log('Polling data...');
      loadData();
    }, 5000);
  }, [resolvedPairAddress, loadData]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    console.log('Stopped polling');
    setState(prev => ({ ...prev, isPolling: false }));
  }, []);

  // Effect to resolve address and manage polling lifecycle
  useEffect(() => {
    if (address) {
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
    isHydrating,
    resolvedPairAddress,
    // Expose manual refresh function
    refresh: loadData,
  };
}

