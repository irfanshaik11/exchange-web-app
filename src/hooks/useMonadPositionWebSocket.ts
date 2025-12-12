// src/hooks/useMonadPositionWebSocket.ts
import { useEffect, useState, useRef, useCallback } from 'react';
import { useUser } from '~/components/UserContext';

export interface MonadPosition {
  tokenAddress: string;
  userId: number;
  totalBoughtTokens: number;
  totalBoughtUsd: number;
  totalBoughtMon: number;
  totalSoldTokens: number;
  totalSoldUsd: number;
  totalSoldMon: number;
  balanceTokens: number;
  balanceUsdHistorical: number;
  balanceMon: number;
  realizedPnl: number;
  realizedPnlMon: number;
  realizedPnlPct: number;
}

interface UseMonadPositionWebSocketOptions {
  tokenAddress: string;
  enabled?: boolean;
  onUpdate?: (position: MonadPosition) => void;
}

interface UseMonadPositionWebSocketReturn {
  position: MonadPosition | null;
  connected: boolean;
  error: string | null;
  loading: boolean;
}

/**
 * WebSocket hook for real-time Monad position updates
 * Subscribes to position updates for a specific token
 */
export function useMonadPositionWebSocket(
  options: UseMonadPositionWebSocketOptions
): UseMonadPositionWebSocketReturn {
  const { tokenAddress, enabled = true, onUpdate } = options;
  const { user } = useUser();
  const [position, setPosition] = useState<MonadPosition | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const mountedRef = useRef(true);
  const onUpdateRef = useRef(onUpdate);
  const maxReconnectAttempts = 10;
  const reconnectInterval = 3000;

  // Update callback ref when it changes
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  // Fetch initial position from REST API
  const fetchInitialPosition = useCallback(async () => {
    if (!tokenAddress || !user?.id || !user.bearerToken) return;

    try {
      setLoading(true);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error('NEXT_PUBLIC_BACKEND_URL not configured');
      }

      const response = await fetch(
        `${backendUrl}/api/trade/monad/position?tokenAddress=${encodeURIComponent(tokenAddress)}`,
        {
          headers: {
            'Authorization': `Bearer ${user.bearerToken}`,
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch position: ${response.status}`);
      }

      const result = await response.json();
      if (result.success && result.data) {
        setPosition(result.data);
        onUpdateRef.current?.(result.data);
      }
    } catch (err) {
      console.error('[useMonadPositionWebSocket] Failed to fetch initial position:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch position');
    } finally {
      setLoading(false);
    }
  }, [tokenAddress, user?.id, user?.bearerToken]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!enabled || !tokenAddress || !user?.id) {
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      setError('Max reconnection attempts reached');
      return;
    }

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error('NEXT_PUBLIC_BACKEND_URL not configured');
      }

      // Convert http:// to ws:// or https:// to wss://
      const wsUrl = backendUrl.replace(/^http/, 'ws') + `/ws/monad/positions?userId=${user.id}`;

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!mountedRef.current) return;
        console.log('[useMonadPositionWebSocket] Connected');
        setConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;

        try {
          const message = JSON.parse(event.data);

          if (message.type === 'connected') {
            console.log('[useMonadPositionWebSocket] Connection confirmed:', message);
          } else if (message.type === 'position_update' && message.data) {
            const positionData: MonadPosition = message.data;
            
            // Only update if this is for the token we're interested in
            if (positionData.tokenAddress?.toLowerCase() === tokenAddress.toLowerCase()) {
              setPosition(positionData);
              onUpdateRef.current?.(positionData);
            }
          }
        } catch (parseErr) {
          console.error('[useMonadPositionWebSocket] Failed to parse message:', parseErr);
        }
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        setError('WebSocket connection error');
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);

        // Attempt to reconnect
        if (enabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              connect();
            }
          }, reconnectInterval);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[useMonadPositionWebSocket] Failed to create WebSocket:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect');
    }
  }, [enabled, tokenAddress, user?.id]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnected(false);
  }, []);

  // Fetch initial position and connect to WebSocket on mount
  useEffect(() => {
    mountedRef.current = true;

    if (tokenAddress && user?.id) {
      fetchInitialPosition();
    }

    if (enabled && tokenAddress && user?.id) {
      disconnect();
      reconnectAttemptsRef.current = 0;
      connect();
    }

    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [enabled, tokenAddress, user?.id, fetchInitialPosition, connect, disconnect]);

  return {
    position,
    connected,
    error,
    loading,
  };
}

export default useMonadPositionWebSocket;

