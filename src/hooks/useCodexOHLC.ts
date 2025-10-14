import { useEffect, useState, useRef, useCallback } from 'react';

interface OHLCData {
  o: number;    // Open
  h: number;    // High
  l: number;    // Low
  c: number;    // Close
  t: number;    // Timestamp
  volume: number;
}

interface CodexOHLCResponse {
  onTokenBarsUpdated: {
    aggregates: {
      r1: {
        usd: OHLCData;
      };
    };
  };
}

interface UseCodexOHLCOptions {
  tokenId?: string;
  enabled?: boolean;
}

export const useCodexOHLC = ({ tokenId, enabled = true }: UseCodexOHLCOptions) => {
  const [ohlcData, setOHLCData] = useState<OHLCData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (!tokenId || !enabled) return;

    try {
      // Connect to your backend WebSocket that subscribes to Codex
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || '';
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('✅ Connected to OHLC WebSocket');
        setIsConnected(true);
        setError(null);
        
        // Subscribe to OHLC updates for this token
        const subscription = {
          type: 'subscribe_ohlc',
          tokenId: tokenId,
          query: `subscription OnBarsUpdated {
            onTokenBarsUpdated(tokenId: "${tokenId}") {
              aggregates {
                r1 {
                  usd {
                    o
                    h
                    l
                    c
                    t
                    volume
                  }
                }
              }
            }
          }`
        };
        
        ws.send(JSON.stringify(subscription));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle both direct Codex response and our WebSocket wrapper
          if (data.type === 'ohlc_update' && data.data?.onTokenBarsUpdated?.aggregates?.r1?.usd) {
            const ohlc = data.data.onTokenBarsUpdated.aggregates.r1.usd;
            console.log('📊 Received OHLC data:', ohlc);
            setOHLCData(ohlc);
          } else if (data.onTokenBarsUpdated?.aggregates?.r1?.usd) {
            // Direct Codex response format
            const ohlc = data.onTokenBarsUpdated.aggregates.r1.usd;
            console.log('📊 Received OHLC data:', ohlc);
            setOHLCData(ohlc);
          }
        } catch (err) {
          console.error('Error parsing OHLC data:', err);
        }
      };

      ws.onclose = () => {
        console.log('❌ OHLC WebSocket disconnected');
        setIsConnected(false);
        
        // Auto-reconnect after 3 seconds
        if (enabled) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('🔄 Reconnecting OHLC WebSocket...');
            connect();
          }, 3000);
        }
      };

      ws.onerror = (err) => {
        console.error('OHLC WebSocket error:', err);
        setError('WebSocket connection error');
        setIsConnected(false);
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('Failed to create OHLC WebSocket:', err);
      setError('Failed to connect to WebSocket');
    }
  }, [tokenId, enabled]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (enabled && tokenId) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, tokenId, connect, disconnect]);

  return {
    ohlcData,
    isConnected,
    error,
    reconnect: connect
  };
};
