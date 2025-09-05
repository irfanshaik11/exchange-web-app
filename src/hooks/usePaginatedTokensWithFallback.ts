import { useEffect, useRef, useState, useCallback } from "react";
import throttle from "lodash.throttle";
import { env } from "../env";

interface UsePaginatedTokensParams {
  filter?: string;
  order?: string;
  offset?: number;
  limit?: number;
}

interface TokensState {
  data: any[];
  loading: boolean;
  isConnected: boolean;
  isReconnecting: boolean;
  error: string | null;
  usingFallback: boolean;
}

export default function usePaginatedTokensWithFallback({
  filter = 'marketcap',
  order = 'desc',
  offset = 0,
  limit = 20,
}: UsePaginatedTokensParams = {}) {
  console.log('🔧 usePaginatedTokensWithFallback hook called with:', { filter, order, offset, limit });
  
  const [state, setState] = useState<TokensState>({
    data: [],
    loading: true,
    isConnected: false,
    isReconnecting: false,
    error: null,
    usingFallback: false,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const maxReconnectAttempts = 1; // Quickly fall back to polling
  const reconnectAttemptRef = useRef(0);
  const wsConnectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const throttledSetData = useCallback(
    throttle((newData: any[]) => {
      console.log('🔧 Setting data in hook:', newData?.length, 'tokens');
      console.log('🔧 First token data RAW from API:', newData?.[0] ? {
        name: newData[0].name,
        symbol: newData[0].symbol,
        usd_price: newData[0].usd_price,
        fully_diluted_value: newData[0].fully_diluted_value,
        total_liquidity_usd: newData[0].total_liquidity_usd,
        keys: Object.keys(newData[0])
      } : 'No data');
      setState(prev => ({ ...prev, data: newData, loading: false }));
    }, 1000),
    []
  );

  // Polling fallback function
  const startPolling = useCallback(() => {
    console.log('🔄 Starting polling fallback');
    setState(prev => ({ ...prev, usingFallback: true, isReconnecting: false }));
    
    const poll = async () => {
      try {
        const queryParams = new URLSearchParams({
          filter: filter || 'marketcap',
          order: order || 'desc',
          offset: (offset || 0).toString(),
          limit: (limit || 20).toString(),
        });
        
        const url = `${env.NEXT_PUBLIC_WEBSOCKET_URL}/api/getAllTokens?${queryParams}`;
        console.log('📡 Polling URL:', url);
        console.log('📡 Environment WEBSOCKET_URL:', env.NEXT_PUBLIC_WEBSOCKET_URL);
        
        const response = await fetch(url);
        console.log('📡 Polling response status:', response.status, response.ok);
        
        if (response.ok) {
          const data = await response.json();
          console.log('📡 Polling data received:', data?.result?.length, 'tokens');
          
          // Debug: Check the first token's price data
          if (data.result && Array.isArray(data.result) && data.result[0]) {
            console.log('📡 First token price debug:', {
              name: data.result[0].name,
              symbol: data.result[0].symbol,
              usd_price: data.result[0].usd_price,
              fully_diluted_value: data.result[0].fully_diluted_value,
              total_liquidity_usd: data.result[0].total_liquidity_usd,
              typeof_usd_price: typeof data.result[0].usd_price,
              typeof_fdv: typeof data.result[0].fully_diluted_value
            });
          }
          
          if (data.result && Array.isArray(data.result)) {
            throttledSetData(data.result);
            setState(prev => ({ ...prev, error: null }));
          }
        }
      } catch (error) {
        console.error('❌ Polling error:', error);
        setState(prev => ({ ...prev, error: 'Failed to fetch data' }));
      }
    };

    // Initial poll
    poll();

    // Set up polling interval (every 3 seconds for better responsiveness)
    pollIntervalRef.current = setInterval(poll, 3000);
  }, [filter, order, offset, limit, throttledSetData]);

  // Clear polling
  const clearPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Effect for managing connection (WebSocket + fallback)
  useEffect(() => {
    setState(prev => ({ ...prev, loading: true, isConnected: false, error: null, usingFallback: false }));

    const connectWebSocket = () => {
      try {
        clearPolling(); // Stop polling when attempting WebSocket

        const queryParams = new URLSearchParams({
          filter: filter || 'marketcap',
          order: order || 'desc',
          offset: (offset || 0).toString(),
          limit: (limit || 20).toString(),
        });
        const wsUrl = `${env.NEXT_PUBLIC_WEBSOCKET_URL.replace(/^http/, 'ws')}/ws/tokens?${queryParams}`;
        console.log('🔌 Attempting WebSocket connection to:', wsUrl);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        // Set a connection timeout
        wsConnectionTimeoutRef.current = setTimeout(() => {
          if (ws.readyState === WebSocket.CONNECTING) {
            console.log('⏰ WebSocket connection timeout, falling back to polling');
            ws.close();
            handleReconnect();
          }
        }, 3000); // 3 second timeout

        ws.onopen = () => {
          if (wsConnectionTimeoutRef.current) {
            clearTimeout(wsConnectionTimeoutRef.current);
            wsConnectionTimeoutRef.current = null;
          }
          setState(prev => ({ ...prev, isConnected: true, isReconnecting: false, error: null, usingFallback: false }));
          reconnectAttemptRef.current = 0;
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log('🔌 WebSocket message received:', {
              messageType: typeof message,
              isArray: Array.isArray(message),
              length: Array.isArray(message) ? message.length : 'not array',
              firstItem: Array.isArray(message) && message[0] ? {
                name: message[0].name,
                symbol: message[0].symbol,
                usd_price: message[0].usd_price,
                fully_diluted_value: message[0].fully_diluted_value,
                total_liquidity_usd: message[0].total_liquidity_usd
              } : 'no first item',
              rawMessage: message
            });
            throttledSetData(message);
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
          }
        };

        ws.onclose = (event) => {
          if (wsConnectionTimeoutRef.current) {
            clearTimeout(wsConnectionTimeoutRef.current);
            wsConnectionTimeoutRef.current = null;
          }
          console.log('WebSocket connection closed with code:', event.code, 'reason:', event.reason);
          setState(prev => ({ ...prev, isConnected: false }));
          
          // Don't reconnect if the component is unmounted or the close was intentional
          if (wsRef.current) {
            handleReconnect();
          }
        };

        ws.onerror = (error) => {
          if (wsConnectionTimeoutRef.current) {
            clearTimeout(wsConnectionTimeoutRef.current);
            wsConnectionTimeoutRef.current = null;
          }
          console.error('WebSocket error:', error);
          setState(prev => ({ ...prev, error: 'WebSocket connection error' }));
          
          // Trigger fallback immediately when WebSocket errors occur
          console.log('🚨 WebSocket error detected, triggering fallback to polling');
          handleReconnect();
        };
      } catch (error) {
        console.error('Failed to establish WebSocket connection:', error);
        handleReconnect();
      }
    };

    const handleReconnect = () => {
      console.log('🔄 handleReconnect called, attempt:', reconnectAttemptRef.current, 'max:', maxReconnectAttempts);
      
      if (reconnectAttemptRef.current >= maxReconnectAttempts) {
        console.log('✅ Max WebSocket reconnect attempts reached, falling back to polling');
        startPolling();
        return;
      }
      
      setState(prev => ({ ...prev, isReconnecting: true }));
      reconnectAttemptRef.current += 1;
      console.log('🔄 Incremented reconnect attempt to:', reconnectAttemptRef.current);
      
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current - 1), 8000);
      console.log('🔄 Scheduling WebSocket reconnect in', delay, 'ms');
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
    };

    // Try WebSocket first
    connectWebSocket();

    return () => {
      clearPolling();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsConnectionTimeoutRef.current) {
        clearTimeout(wsConnectionTimeoutRef.current);
      }
      throttledSetData.cancel();
      if (wsRef.current) {
        const ws = wsRef.current;
        wsRef.current = null; // Prevent reconnection on intentional close
        ws.close();
      }
    };
  }, [filter, order, offset, limit, throttledSetData, startPolling, clearPolling]);

  return state;
}
