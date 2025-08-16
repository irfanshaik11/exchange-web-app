import { useEffect, useRef, useState } from "react";
import { env } from "../env";

export default function useTradesWebSocket(pair_address: string | undefined) {
  const [data, setData] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!pair_address) return;
    const ws = new WebSocket(`${env.NEXT_PUBLIC_WEBSOCKET_URL}/trades?pair_address=${pair_address}`);
    wsRef.current = ws;
    ws.onopen = () => setIsConnected(true);
    ws.onmessage = (event) => {
      try {
        setData(JSON.parse(event.data));
      } catch {
        setError("Failed to parse trades data");
      }
    };
    ws.onerror = () => setError("WebSocket error");
    ws.onclose = () => setIsConnected(false);
    return () => ws.close();
  }, [pair_address]);

  return { data, isConnected, error };
} 