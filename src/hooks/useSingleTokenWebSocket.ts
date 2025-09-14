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
      setToken(newData);
      setState(prev => ({ ...prev, loading: false }));
    }, 1000),
    []
  );

  // Effect for managing WebSocket connection
  useEffect(() => {
    if (!pair_address) {
      setToken(null);
      setTrades([]);
      setState({ isConnected: false, isReconnecting: false, error: null, loading: false });
      return;
    }

    setState(prev => ({ ...prev, loading: true, isConnected: false, error: null }));

    const connectWebSocket = () => {
      try {
        const wsUrl = `${env.NEXT_PUBLIC_WEBSOCKET_URL.replace(/^http/, 'ws')}/v1/ws/token?pair_address=${pair_address}`;
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
            // The backend sends an object with token and trades properties directly
            if (Array.isArray(message)) {
              // In case the server batches messages, iterate
              for (const m of message) processMessage(m);
              return;
            }
            if (message && typeof message === 'object') {
              if (message.token) {
                throttledSetToken(message.token);
              }
              if (message.trades) {
                setTrades(message.trades);
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
  }, [pair_address, throttledSetToken]);

  return { ...state, token, trades };
} 
