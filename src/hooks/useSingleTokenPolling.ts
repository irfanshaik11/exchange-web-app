import { useEffect, useRef, useState, useCallback } from "react";
import throttle from "lodash.throttle";

interface PollingState {
  isPolling: boolean;
  error: string | null;
  loading: boolean;
}

export default function useSingleTokenPolling(pair_address: string | undefined) {
  const [token, setToken] = useState<any>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [state, setState] = useState<PollingState>({
    isPolling: false,
    error: null,
    loading: true,
  });
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const pairAddressRef = useRef(pair_address);
  pairAddressRef.current = pair_address;

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

  // Load data from API
  const loadData = useCallback(async () => {
    if (!pair_address) return;
    
    try {
      console.log('Loading data for pair_address:', pair_address);
      const url = `/api/token-service/trade-view?mint_address=${pair_address}`;
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
  }, [pair_address, throttledSetToken]);

  // Start polling
  const startPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    console.log('Starting polling for:', pair_address);
    setState(prev => ({ ...prev, isPolling: true, loading: true }));
    
    // Load initial data immediately
    loadData();
    
    // Then poll every 3 seconds
    intervalRef.current = setInterval(() => {
      console.log('Polling data...');
      loadData();
    }, 3000);
  }, [pair_address, loadData]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    console.log('Stopped polling');
    setState(prev => ({ ...prev, isPolling: false }));
  }, []);

  // Effect to manage polling lifecycle
  useEffect(() => {
    if (pair_address) {
      startPolling();
    } else {
      stopPolling();
      setToken(null);
      setTrades([]);
    }

    // Cleanup on unmount or pair_address change
    return () => {
      stopPolling();
    };
  }, [pair_address, startPolling, stopPolling]);

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
    // Expose manual refresh function
    refresh: loadData,
  };
}
