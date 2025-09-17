import { useEffect, useRef, useState, useCallback } from "react";
import throttle from "lodash.throttle";
import { env } from "../env";

interface WebSocketState {
  isConnected: boolean;
  isReconnecting: boolean;
  error: string | null;
  loading: boolean;
}

export default function useSingleTokenWebSocket(pair_address: string | undefined) {
  const [token, setToken] = useState<any>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    isReconnecting: false,
    error: null,
    loading: true,
  });
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxReconnectAttempts = 5;
  const reconnectAttemptRef = useRef(0);
  const pairAddressRef = useRef(pair_address);
  pairAddressRef.current = pair_address;
  const [count, setCount] = useState(0);

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

  // Load initial data
  const loadInitialData = useCallback(async () => {
    if (!pair_address) return;
    
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      console.log('Loading initial data for pair_address:', pair_address);
      const url = `/api/token-service/trade-view?mint_address=${pair_address}`;
      console.log('API URL:', url);
      
      const response = await fetch(url);
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error Response:', errorText);
        throw new Error(`Failed to load initial data: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log('Initial data received:', data);
      
      // Set initial data
      if (data.token) {
        console.log('Setting initial token data:', data.token);
        console.log('Initial token name:', data.token.name);
        console.log('Initial token symbol:', data.token.symbol);
        console.log('Initial token uri:', data.token.uri);
        throttledSetToken(data.token);
      }
      if (data.recentTrades) {
        console.log('Setting initial trades data:', data.recentTrades);
        setTrades(data.recentTrades);
      }
      
    } catch (err: any) {
      console.error('Failed to load initial data:', err);
      setState(prev => ({ ...prev, error: err.message || 'Failed to load initial data' }));
    } finally {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [pair_address, throttledSetToken]);

  // Effect for managing WebSocket connection
  useEffect(() => {
    if (!pair_address) {
      setToken(null);
      setTrades([]);
      setState({ isConnected: false, isReconnecting: false, error: null, loading: false });
      return;
    }

    // Load initial data first
    loadInitialData();

    setState(prev => ({ ...prev, loading: true, isConnected: false, error: null }));

    const connectWebSocket = () => {
        try {
          const wsUrl = `${env.NEXT_PUBLIC_WEBSOCKET_URL.replace(/^http/, 'ws')}/v1/ws/trade?mint_address=${pair_address}&token_data=true&market_data=true&trades=true&live_stats=true`;
          const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setState(prev => ({ ...prev, isConnected: true, isReconnecting: false, error: null }));
          reconnectAttemptRef.current = 0;
        };

        ws.onmessage = (event) => {
          // Normalize various WebSocket payload types (string, Blob, ArrayBuffer)
          const handleText = (text: string) => {
            try {
              setCount((t) => t + 1);
              const trimmed = text.trim();
              if (!trimmed) return;

              // Ignore keepalive/ping frames if any
              if (trimmed === 'ping' || trimmed === 'pong' || trimmed === 'ok') return;

              // First try to parse as a single JSON object
              try {
                const msg = JSON.parse(trimmed);
                processMessage(msg);
                return;
              } catch (_) {
                // Fall through to NDJSON/multi-JSON handling
              }

              // Handle concatenated or newline-delimited JSON messages
              const fixed = trimmed
                .replace(/}\s*{/g, '}\n{')
                .replace(/]\s*\[/g, ']\n[');
              const parts = fixed.split(/\r?\n+/);
              for (const part of parts) {
                const p = part.trim();
                if (!p || p === 'ping' || p === 'pong' || p === 'ok') continue;
                try {
                  const msg = JSON.parse(p);
                  processMessage(msg);
                } catch (e) {
                  // Skip non-JSON chunks silently; server may interleave logs/keepalives
                  console.warn('Skipping non-JSON WS chunk:', p.slice(0, 120));
                }
              }
            } catch (err) {
              console.error('Failed to handle WebSocket text payload:', err);
            }
          };

            const processMessage = (message: any) => {
              console.log('WebSocket message received:', message);
              // Handle our new trade page WebSocket message format
              if (Array.isArray(message)) {
                // In case the server batches messages, iterate
                for (const m of message) processMessage(m);
                return;
              }
              if (message && typeof message === 'object') {
                // Handle different message types from our trade WebSocket
                switch (message.type) {
                  case 'token_data':
                    console.log('Processing token_data:', message.data);
                    throttledSetToken(message.data);
                    break;
                  case 'trades':
                    console.log('Processing trades:', message.data);
                    setTrades(message.data);
                    break;
                  case 'market_data':
                    console.log('Processing market_data:', message.data);
                    // Update token with market data
                    if (message.data) {
                      throttledSetToken((prev: any) => ({
                        ...prev,
                        usd_price: message.data.priceUSD,
                        market_cap_usd: message.data.marketCapUSD,
                        volume_24h: message.data.volumeUSD
                      }));
                    }
                    break;
                  case 'live_stats':
                    // Update live stats if needed
                    console.log('Live stats update:', message.data);
                    break;
                  default:
                    // Fallback to old format for compatibility
                    if (message.token) {
                      console.log('Processing fallback token:', message.token);
                      throttledSetToken(message.token);
                    }
                    if (message.trades) {
                      console.log('Processing fallback trades:', message.trades);
                      setTrades(message.trades);
                    }
                }
              }
            };

          const data = (event as MessageEvent).data;
          if (typeof data === 'string') {
            handleText(data);
          } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
            data.text().then(handleText).catch((err: any) => {
              console.error('Failed to read WebSocket Blob data:', err);
            });
          } else if (data instanceof ArrayBuffer) {
            try {
              const text = new TextDecoder().decode(data);
              handleText(text);
            } catch (err) {
              console.error('Failed to decode WebSocket ArrayBuffer data:', err);
            }
          } else {
            // Fallback: attempt string conversion
            try {
              handleText(String(data));
            } catch (err) {
              console.error('Failed to stringify WebSocket data:', err);
            }
          }
        };

        ws.onclose = (event) => {
          console.log('WebSocket connection closed with code:', event.code, 'reason:', event.reason);
          setState(prev => ({ ...prev, isConnected: false }));
          // Don't reconnect if the component is unmounted or the close was intentional
          if (wsRef.current) {
            handleReconnect();
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setState(prev => ({ ...prev, error: 'WebSocket connection error. Attempting to reconnect...' }));
        };
      } catch (error) {
        console.error('Failed to establish WebSocket connection:', error);
        setState(prev => ({ ...prev, error: 'Failed to establish WebSocket connection' }));
      }
    };

    const handleReconnect = () => {
      if (reconnectAttemptRef.current >= maxReconnectAttempts) {
        setState(prev => ({
          ...prev,
          isReconnecting: false,
          error: 'Maximum reconnection attempts reached. Please refresh the page.'
        }));
        return;
      }
      setState(prev => ({ ...prev, isReconnecting: true }));
      reconnectAttemptRef.current += 1;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current - 1), 16000);
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
    };

    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      throttledSetToken.cancel();
      if (wsRef.current) {
        const ws = wsRef.current;
        wsRef.current = null; // Prevent reconnection on intentional close
        ws.close();
      }
    };
    // The connection must be re-established if the pair_address changes
  }, [pair_address, throttledSetToken, loadInitialData]);

  return { ...state, token, trades };
} 
