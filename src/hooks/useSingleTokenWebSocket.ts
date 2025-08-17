import { useEffect, useRef, useState } from "react";
import throttle from "lodash.throttle";
import { env } from "../env";

export default function useSingleTokenWebSocket(pair_address: string | undefined) {
  const [token, setToken] = useState<any>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxReconnectAttempts = 5;
  const reconnectAttemptRef = useRef(0);
  const pairAddressRef = useRef(pair_address);
  pairAddressRef.current = pair_address;

  const throttledSetToken = useRef(
    throttle((newData: any) => {
      setToken(newData);
    }, 1000)
  ).current;

  // Effect for managing WebSocket connection
  useEffect(() => {
    if (!pair_address) {
      setToken(null);
      setTrades([]);
      setIsConnected(false);
      return;
    }

    const connectWebSocket = () => {
      try {
        const wsUrl = `${env.NEXT_PUBLIC_WEBSOCKET_URL.replace(/^http/, 'ws')}/ws/token?pair_address=${pair_address}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
          setError(null);
          reconnectAttemptRef.current = 0;
        };

        ws.onmessage = (event) => {
          try {
            // The backend sends an object with token and trades properties directly
            const message = JSON.parse(event.data);
            if (message.token) {
              throttledSetToken(message.token);
            }
            if (message.trades) {
              setTrades(message.trades);
            }
          } catch (err) {
            setError("Failed to parse WebSocket message");
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          // Don't reconnect if the component is unmounted or the close was intentional
          if (wsRef.current) {
            handleReconnect();
          }
        };

        ws.onerror = () => {
          setError("WebSocket error");
        };
      } catch (error) {
        setError("Failed to establish WebSocket connection");
      }
    };

    const handleReconnect = () => {
      if (reconnectAttemptRef.current >= maxReconnectAttempts) {
        setError("Maximum reconnection attempts reached. Please refresh the page.");
        return;
      }
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

  return { token, trades, isConnected, error };
} 