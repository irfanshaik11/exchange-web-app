import { useEffect, useRef, useState, useCallback } from "react";
import throttle from "lodash.throttle";

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
    loading: true,
  });
  const [isHydrating, setIsHydrating] = useState(false);
  const [resolvedPairAddress, setResolvedPairAddress] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const addressRef = useRef(address);
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

  // Check if address is a mint address (ends with 'pump')
  const isMintAddress = useCallback((addr: string) => {
    return addr.endsWith('pump');
  }, []);

  // Resolve address to pair address
  const resolveAddress = useCallback(async (addr: string) => {
    // If it's already a pair address, return it
    if (!isMintAddress(addr)) {
      return addr;
    }

    // If it's a mint address, hydrate it
    setIsHydrating(true);
    try {
      console.log('Resolving mint address to pair address:', addr);
      const response = await fetch('/api/token-service/hydrate-pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mint: addr })
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Successfully resolved address:', data);
        return data.pair_address;
      } else {
        console.error('Failed to resolve address:', response.status);
        return null;
      }
    } catch (error) {
      console.error('Error resolving address:', error);
      return null;
    } finally {
      setIsHydrating(false);
    }
  }, [isMintAddress]);

  // Load data from API
  const loadData = useCallback(async () => {
    if (!resolvedPairAddress) return;
    
    try {
      console.log('Loading data for pair_address:', resolvedPairAddress);
      const url = `/api/token-service/trade-view?pair_address=${resolvedPairAddress}`;
      console.log('API URL:', url);
      
      const response = await fetch(url);
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error Response:', errorText);
        throw new Error(`Failed to load data: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log('Data received:', data);
      
      // Set token data
      if (data.token) {
        console.log('Setting token data:', data.token);
        console.log('Token name:', data.token.name);
        console.log('Token symbol:', data.token.symbol);
        console.log('Token uri:', data.token.uri);
        throttledSetToken(data.token);
      }
      
      // Set trades data
      if (data.recentTrades) {
        console.log('Setting trades data:', data.recentTrades);
        setTrades(data.recentTrades);
      }
      
      // Clear any previous errors
      setState(prev => ({ ...prev, error: null }));
      
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
    
    // Then poll every 3 seconds
    intervalRef.current = setInterval(() => {
      console.log('Polling data...');
      loadData();
    }, 3000);
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
    // Expose manual refresh function
    refresh: loadData,
  };
}

