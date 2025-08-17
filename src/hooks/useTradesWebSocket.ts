import { useEffect, useRef, useState } from "react";
import { env } from "../env";

export default function useTradesWebSocket(pair_address: string | undefined) {
  const [data, setData] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxReconnectAttempts = 5;
  const reconnectAttemptRef = useRef(0);

  // Effect for managing WebSocket connection
  useEffect(() => {
    if (!pair_address) {
      setData([]);
      setIsConnected(false);
      return;
    }

    const connectWebSocket = () => {
      try {
        const wsUrl = `${env.NEXT_PUBLIC_WEBSOCKET_URL.replace(/^http/, 'ws')}/ws/trades?pair_address=${pair_address}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
          setError(null);
          reconnectAttemptRef.current = 0;
        };

        ws.onmessage = (event) => {
          try {
            // The backend sends the array of trades directly
            const message = JSON.parse(event.data);
            if (Array.isArray(message)) {
              setData(message);
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
      if (wsRef.current) {
        const ws = wsRef.current;
        wsRef.current = null; // Prevent reconnection on intentional close
        ws.close();
      }
    };
    // The connection must be re-established if the pair_address changes
  }, [pair_address]);

  return { data, isConnected, error };
} 