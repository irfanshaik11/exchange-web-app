import { useEffect, useRef, useState } from "react";
import throttle from "lodash.throttle";
import { env } from "../env";

export default function useSingleTokenWebSocket(tokenAddress: string | undefined) {
  const [data, setData] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxReconnectAttempts = 5;
  const reconnectAttemptRef = useRef(0);

  // Throttle updates to avoid excessive renders
  const throttledSetData = useRef(
    throttle((newData: any) => {
      setData(newData);
    }, 1000)
  ).current;

  useEffect(() => {
    if (!tokenAddress) return;

    const connectWebSocket = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        return;
      }

      try {
        const ws = new WebSocket(env.NEXT_PUBLIC_WEBSOCKET_URL!);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
          setError(null);
          reconnectAttemptRef.current = 0;
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            // If the message is an array, find the token by address
            if (Array.isArray(message)) {
              const found = message.find((t) => t.token_address === tokenAddress || t.mint === tokenAddress);
              if (found) throttledSetData(found);
            } else if (message && typeof message === "object") {
              // If the message is a single token update
              if (message.token_address === tokenAddress || message.mint === tokenAddress) {
                throttledSetData(message);
              }
            }
          } catch (err) {
            setError("Failed to parse WebSocket message");
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          handleReconnect();
        };

        ws.onerror = () => {
          setError("WebSocket error");
          handleReconnect();
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
      setTimeout(connectWebSocket, Math.min(1000 * Math.pow(2, reconnectAttemptRef.current - 1), 16000));
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      throttledSetData.cancel();
    };
  }, [tokenAddress, throttledSetData]);

  return { data, isConnected, error };
} 