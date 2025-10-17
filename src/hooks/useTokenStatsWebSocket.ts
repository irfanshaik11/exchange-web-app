import { useEffect, useRef, useState, useCallback } from "react";
import { env } from "../env";

export interface TokenStatsData {
  success: boolean;
  tokenAddress: string;
  pairAddress: string;
  dataSource: string;
  timestamp: string;
  data: {
    timeframes: {
      [key: string]: {
        buys: number;
        sells: number;
        volume: number;
        buyVolume: number;
        sellVolume: number;
        change: number;
      };
    };
  };
}

export interface TokenStatsState {
  isConnected: boolean;
  isReconnecting: boolean;
  error: string | null;
  loading: boolean;
  data: TokenStatsData | null;
  lastUpdate: string | null;
}

export interface UseTokenStatsWebSocketParams {
  pairAddress?: string;
  tokenAddress?: string;
  enabled?: boolean;
}

export default function useTokenStatsWebSocket({
  pairAddress,
  tokenAddress,
  enabled = true,
}: UseTokenStatsWebSocketParams) {
  const [state, setState] = useState<TokenStatsState>({
    isConnected: false,
    isReconnecting: false,
    error: null,
    loading: true,
    data: null,
    lastUpdate: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxReconnectAttempts = 5;
  const reconnectAttemptRef = useRef(0);

  const processMessage = useCallback((message: any) => {
    try {
      // Validate message structure
      if (message.success && message.data && message.data.timeframes) {
        setState(prev => ({
          ...prev,
          data: message,
          lastUpdate: new Date().toISOString(),
          loading: false,
        }));
      } else {
        console.warn('Invalid token stats message format:', message);
      }
    } catch (error) {
      console.error('Error processing token stats message:', error);
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    if (!pairAddress || !tokenAddress || !enabled) {
      return;
    }

    try {
      const baseUrl = (process.env.NEXT_PUBLIC_WEBSOCKET_URL || '').replace(/^https?:\/\//, '');
      const protocol = process.env.NEXT_PUBLIC_WEBSOCKET_URL?.startsWith('https') ? 'wss' : 'ws';
      const wsUrl = `${protocol}://${baseUrl}/v1/ws/token-stats?pair_address=${pairAddress}&token_address=${tokenAddress}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setState(prev => ({
          ...prev,
          isConnected: true,
          isReconnecting: false,
          error: null,
        }));
        reconnectAttemptRef.current = 0;
      };

      ws.onmessage = (event) => {
        const handleText = (text: string) => {
          try {
            const trimmed = text.trim();
            if (!trimmed) return;

            // Ignore keepalive/ping frames
            if (trimmed === 'ping' || trimmed === 'pong' || trimmed === 'ok') return;

            // Try to parse as JSON
            try {
              const msg = JSON.parse(trimmed);
              processMessage(msg);
              return;
            } catch (_) {
              // Fall through to multi-JSON handling
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
                console.warn('Skipping non-JSON WS chunk:', p.slice(0, 120));
              }
            }
          } catch (error) {
            console.error('Error handling WebSocket message:', error);
          }
        };

        // Handle different message types
        if (typeof event.data === 'string') {
          handleText(event.data);
        } else if (event.data instanceof Blob) {
          event.data.text().then(handleText);
        } else if (event.data instanceof ArrayBuffer) {
          const text = new TextDecoder().decode(event.data);
          handleText(text);
        }
      };

      ws.onclose = (event) => {
        setState(prev => ({
          ...prev,
          isConnected: false,
          loading: false,
        }));

        // Attempt reconnection if not a clean close
        if (event.code !== 1000 && reconnectAttemptRef.current < maxReconnectAttempts) {
          reconnectAttemptRef.current++;
          setState(prev => ({ ...prev, isReconnecting: true }));
          
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, delay);
        } else if (reconnectAttemptRef.current >= maxReconnectAttempts) {
          setState(prev => ({
            ...prev,
            error: 'Max reconnection attempts reached',
            isReconnecting: false,
          }));
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setState(prev => ({
          ...prev,
          error: 'WebSocket connection error',
          loading: false,
        }));
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to create WebSocket connection',
        loading: false,
      }));
    }
  }, [pairAddress, tokenAddress, enabled, processMessage]);

  // Effect for managing WebSocket connection
  useEffect(() => {
    if (!pairAddress || !tokenAddress || !enabled) {
      setState(prev => ({
        ...prev,
        isConnected: false,
        loading: false,
        data: null,
      }));
      return;
    }

    setState(prev => ({ ...prev, loading: true, isConnected: false, error: null }));

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    connectWebSocket();

    // Cleanup function
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [pairAddress, tokenAddress, enabled, connectWebSocket]);

  // Get stats for a specific timeframe
  const getStatsForTimeframe = useCallback((timeframe: string) => {
    if (!state.data?.data?.timeframes?.[timeframe]) {
      return {
        buys: 0,
        sells: 0,
        volume: 0,
        buyVolume: 0,
        sellVolume: 0,
      };
    }
    return state.data.data.timeframes[timeframe];
  }, [state.data]);

  // Get formatted stats for display
  const getFormattedStats = useCallback((timeframe: string) => {
    const stats = getStatsForTimeframe(timeframe);
    return {
      buys: stats.buys,
      sells: stats.sells,
      volume: stats.volume,
      buyVolume: stats.buyVolume,
      sellVolume: stats.sellVolume,
      netVolume: stats.buyVolume - stats.sellVolume,
      buyPercentage: stats.volume > 0 ? (stats.buyVolume / stats.volume) * 100 : 50,
      sellPercentage: stats.volume > 0 ? (stats.sellVolume / stats.volume) * 100 : 50,
    };
  }, [getStatsForTimeframe]);

  return {
    ...state,
    getStatsForTimeframe,
    getFormattedStats,
    reconnect: connectWebSocket,
  };
}
