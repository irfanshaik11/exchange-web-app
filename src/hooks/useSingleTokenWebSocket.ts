import { useEffect, useRef, useState } from "react";
import { env } from "../env";

export default function useSingleTokenWebSocket(tokenAddress: string | undefined) {
  const [data, setData] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!tokenAddress) return;

    const ws = new WebSocket(`${env.NEXT_PUBLIC_WEBSOCKET_URL}/${tokenAddress}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.error) {
        setError(data.error);
      } else {
        setData(data);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    ws.onerror = () => {
      setError("WebSocket error");
    };

    return () => {
      ws.close();
    };
  }, [tokenAddress]);

  return { data, isConnected, error };
} 