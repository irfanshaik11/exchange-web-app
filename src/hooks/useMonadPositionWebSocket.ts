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
  avgBuyPriceUsd?: number | null;
  avgSellPriceUsd?: number | null;
}

export interface TxHashMessage {
  txHash: string;
  tokenAddress: string;
  tradeType: 'buy' | 'sell';
  tradeId?: string;
  explorerUrl: string;
}

interface UseMonadPositionWebSocketOptions {
  tokenAddress: string;
  enabled?: boolean;
  onUpdate?: (position: MonadPosition) => void;
  onTxHash?: (data: TxHashMessage) => void; // INSTANT txHash callback
}

interface UseMonadPositionWebSocketReturn {
  position: MonadPosition | null;
  connected: boolean;
  error: string | null;
  loading: boolean;
  refreshPosition: () => Promise<void>;
}

/**
 * WebSocket hook for real-time Monad position updates
 * Subscribes to position updates for a specific token
 */
export function useMonadPositionWebSocket(
  options: UseMonadPositionWebSocketOptions
): UseMonadPositionWebSocketReturn {
  const { tokenAddress, enabled = true, onUpdate, onTxHash } = options;
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
  const onTxHashRef = useRef(onTxHash);
  const maxReconnectAttempts = 10;
  const reconnectInterval = 3000;
  
  // Store config in refs to avoid re-creating connect/disconnect
  const configRef = useRef({
    tokenAddress,
    enabled,
    userId: user?.id,
  });
  
  // Update config ref when options change
  useEffect(() => {
    configRef.current = {
      tokenAddress,
      enabled,
      userId: user?.id,
    };
  }, [tokenAddress, enabled, user?.id]);

  // Update callback refs when they change
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);
  
  useEffect(() => {
    onTxHashRef.current = onTxHash;
  }, [onTxHash]);

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

  // Connect to WebSocket - uses refs to avoid dependency changes causing reconnects
  const connect = useCallback(() => {
    const { enabled, userId, tokenAddress: ta } = configRef.current;
    
    // Allow connection even without tokenAddress (for global txHash listening)
    if (!enabled || !userId) {
      console.log('[useMonadPositionWebSocket] ⏭️ Skipping connection - enabled:', enabled, 'userId:', userId);
      return;
    }

    // Check if already connected or connecting
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
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
      const wsUrl = backendUrl.replace(/^http/, 'ws') + `/ws/monad/positions?userId=${userId}`;

      console.log('[useMonadPositionWebSocket] 🔌 Connecting to WebSocket:', wsUrl);
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!mountedRef.current) return;
        console.log('[useMonadPositionWebSocket] ✅ WebSocket CONNECTED to', wsUrl);
        setConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        const { tokenAddress: currentToken } = configRef.current;

        try {
          const message = JSON.parse(event.data);

          if (message.type === 'connected') {
            console.log('[useMonadPositionWebSocket] Connection confirmed:', message);
          } else if (message.type === 'tx_hash' && message.data) {
            // INSTANT txHash push from backend - fires immediately after signing
            console.log('[useMonadPositionWebSocket] 🚀 INSTANT txHash received:', message.data.txHash);
            onTxHashRef.current?.(message.data as TxHashMessage);
          } else if (message.type === 'position_update' && message.data) {
            const positionData: MonadPosition = message.data;
            
            // Only update if this is for the token we're interested in
            if (currentToken && positionData.tokenAddress?.toLowerCase() === currentToken.toLowerCase()) {
              setPosition(positionData);
              onUpdateRef.current?.(positionData);
            }
          }
        } catch (parseErr) {
          console.error('[useMonadPositionWebSocket] Failed to parse message:', parseErr);
        }
      };

      ws.onerror = (event) => {
        if (!mountedRef.current) return;
        console.error('[useMonadPositionWebSocket] ❌ WebSocket ERROR:', event);
        setError('WebSocket connection error');
      };

      ws.onclose = (event) => {
        if (!mountedRef.current) return;
        console.log('[useMonadPositionWebSocket] 🔌 WebSocket CLOSED:', event.code, event.reason);
        setConnected(false);
        wsRef.current = null;

        // Attempt to reconnect
        const { enabled: stillEnabled } = configRef.current;
        if (stillEnabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1;
          console.log(`[useMonadPositionWebSocket] Reconnecting in ${reconnectInterval}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
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
  }, []); // Empty deps - uses refs for all config

  // Fetch initial position and connect to WebSocket on mount
  useEffect(() => {
    mountedRef.current = true;
    
    // Update configRef synchronously BEFORE calling connect (fixes race condition)
    configRef.current = {
      tokenAddress,
      enabled,
      userId: user?.id,
    };

    // Only fetch position if we have a specific tokenAddress
    if (tokenAddress && user?.id) {
      fetchInitialPosition();
    }

    // Connect to WebSocket - allow without tokenAddress for global txHash listening
    if (enabled && user?.id) {
      // Close existing connection before creating new one
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      reconnectAttemptsRef.current = 0;
      connect();
    }

    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, tokenAddress, user?.id]); // Only reconnect when these change

  const refreshPosition = useCallback(() => {
    return fetchInitialPosition();
  }, [fetchInitialPosition]);

  return {
    position,
    connected,
    error,
    loading,
    refreshPosition,
  };
}

export default useMonadPositionWebSocket;
