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
          const handleText = (text: string) => {
            const trimmed = text.trim();
            if (!trimmed) return;
            if (trimmed === 'ping' || trimmed === 'pong' || trimmed === 'ok') return;

            const deliver = (payload: any) => {
              if (Array.isArray(payload)) {
                setData(payload);
              } else if (payload && typeof payload === 'object' && Array.isArray(payload.trades)) {
                setData(payload.trades);
              }
              setError(null);
            };

            try {
              const message = JSON.parse(trimmed);
              return deliver(message);
            } catch (_) {}

            const fixed = trimmed
              .replace(/}\s*{/g, '}\n{')
              .replace(/]\s*\[/g, ']\n[');
            const parts = fixed.split(/\r?\n+/);
            for (const part of parts) {
              const p = part.trim();
              if (!p || p === 'ping' || p === 'pong' || p === 'ok') continue;
              try {
                const msg = JSON.parse(p);
                deliver(msg);
              } catch (err) {
                console.warn('Skipping non-JSON WS chunk:', p.slice(0, 120));
              }
            }
          };

          const data = (event as MessageEvent).data;
          if (typeof data === 'string') {
            handleText(data);
          } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
            data.text().then(handleText).catch(() => setError('Failed to read WS Blob'));
          } else if (data instanceof ArrayBuffer) {
            try {
              handleText(new TextDecoder().decode(data));
            } catch (err) {
              setError('Failed to decode WS ArrayBuffer');
            }
          } else {
            try {
              handleText(String(data));
            } catch (err) {
              setError('Failed to stringify WS data');
            }
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
