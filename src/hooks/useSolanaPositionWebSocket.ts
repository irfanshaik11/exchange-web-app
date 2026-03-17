// src/hooks/useSolanaPositionWebSocket.ts
import { useEffect, useState, useRef, useCallback } from 'react';
import { useUser } from '~/components/UserContext';

const isDev = process.env.NODE_ENV !== 'production';

export interface SolanaPosition {
  tokenAddress: string;
  userId: number;
  totalBoughtTokens: number;
  totalBoughtUsd: number;
  totalBoughtSol: number;
  totalSoldTokens: number;
  totalSoldUsd: number;
  totalSoldSol: number;
  balanceTokens: number;
  balanceUsdHistorical: number;
  balanceSol: number;
  realizedPnl: number;
  realizedPnlSol: number;
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

interface UseSolanaPositionWebSocketOptions {
  tokenAddress: string;
  enabled?: boolean;
  onUpdate?: (position: SolanaPosition) => void;
  onTxHash?: (data: TxHashMessage) => void; // INSTANT txHash callback
}

interface UseSolanaPositionWebSocketReturn {
  position: SolanaPosition | null;
  connected: boolean;
  error: string | null;
  loading: boolean;
  refreshPosition: () => Promise<void>;
  requestSnapshot: () => void;
  sendMessage: (msg: Record<string, unknown>) => void;
}

/**
 * WebSocket hook for real-time Solana position updates
 * Subscribes to position updates for a specific token
 */
export function useSolanaPositionWebSocket(
  options: UseSolanaPositionWebSocketOptions
): UseSolanaPositionWebSocketReturn {
  const { tokenAddress, enabled = true, onUpdate, onTxHash } = options;
  const { user } = useUser();
  const [position, setPosition] = useState<SolanaPosition | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const pingSentAtRef = useRef<number>(0);
  const onUpdateRef = useRef(onUpdate);
  const onTxHashRef = useRef(onTxHash);
  // Always reconnect with capped exponential backoff (no max attempts)
  const baseReconnectInterval = 3000;
  const maxBackoffInterval = 120000; // 2 min cap

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
        `${backendUrl}/api/trade/position?tokenAddress=${encodeURIComponent(tokenAddress)}`,
        {
          headers: {
            'Authorization': `Bearer ${user.bearerToken}`,
            'Accept': 'application/json',
          },
        }
      );

      if (response.status === 404) {
        // No position yet for this token/user – treat as empty instead of error
        setPosition(null);
      } else if (!response.ok) {
        console.warn('[useSolanaPositionWebSocket] Position fetch failed', response.status);
        throw new Error(`Failed to fetch position: ${response.status}`);
      } else {
        const result = await response.json();
        if (result.success && result.data) {
          setPosition(result.data);
          onUpdateRef.current?.(result.data);
        } else {
          console.warn('[useSolanaPositionWebSocket] Position fetch returned no data', result);
          setPosition(null);
        }
      }
    } catch (err) {
      console.error('[useSolanaPositionWebSocket] Failed to fetch initial position:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch position');
    } finally {
      setLoading(false);
    }
  }, [tokenAddress, user?.bearerToken, user?.id]);

  // Connect to WebSocket - uses refs to avoid dependency changes causing reconnects
  const connect = useCallback(() => {
    const { enabled, userId, tokenAddress: ta } = configRef.current;

    // Allow connection even without tokenAddress (for global txHash listening)
    if (!enabled || !userId) {
      return;
    }

    // Check if already connected or connecting
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error('NEXT_PUBLIC_BACKEND_URL not configured');
      }

      // Convert http:// to ws:// or https:// to wss://
      // Include walletAddress so backend can subscribe to gRPC balance updates
      const walletParam = user?.publicKey ? `&walletAddress=${user.publicKey}` : '';
      const wsUrl = backendUrl.replace(/^http/, 'ws') + `/ws/solana/positions?userId=${userId}${walletParam}`;

      if (isDev) console.log('[useSolanaPositionWebSocket] Connecting to:', wsUrl);
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!mountedRef.current) return;
        if (isDev) console.log('[useSolanaPositionWebSocket] Connected');
        const wasReconnect = reconnectAttemptsRef.current > 0;
        setConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;

        // Start client-side heartbeat: send application-level ping every 30s
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            pingSentAtRef.current = performance.now();
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);

        // On reconnect, notify portfolio to refresh (may have missed updates while disconnected)
        if (wasReconnect) {
          window.dispatchEvent(new CustomEvent('solanaWsReconnected'));
          // Request snapshot for instant catch-up
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'request_snapshot' }));
            }
          }, 100);
        }
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        const { tokenAddress: currentToken } = configRef.current;

        try {
          const message = JSON.parse(event.data);

          if (message.type === 'pong') {
            // Pong received — keepalive confirmed (latency measured via useServerLatency hook)
            pingSentAtRef.current = 0;
          } else if (message.type === 'connected') {
            // Connection confirmed
          } else if (message.type === 'tx_hash' && message.data) {
            // INSTANT txHash push from backend - fires immediately after signing
            window.dispatchEvent(new CustomEvent('solanaTradeSuccess', { detail: message.data }));
            onTxHashRef.current?.(message.data as TxHashMessage);
          } else if (message.type === 'tx_confirmed' && message.data) {
            // Transaction confirmed on-chain (optimistic mode follow-up)
            window.dispatchEvent(new CustomEvent('solanaTxConfirmed', { detail: message.data }));
          } else if (message.type === 'tx_failed' && message.data) {
            // Transaction failed on-chain (optimistic mode follow-up)
            window.dispatchEvent(new CustomEvent('solanaTxFailed', { detail: message.data }));
          } else if (message.type === 'trade_error' && message.data) {
            window.dispatchEvent(new CustomEvent('solanaTradeError', { detail: message.data }));
          } else if (message.type === 'balance_update' && message.data) {
            // gRPC push: SOL balance changed on-chain → update header instantly
            window.dispatchEvent(new CustomEvent('solanaBalanceUpdate', {
              detail: { solBalance: message.data.solBalance, wallet: message.data.wallet }
            }));
          } else if (message.type === 'positions_changed' && message.data) {
            window.dispatchEvent(new CustomEvent('solanaPositionsChanged', { detail: message.data }));
          } else if (message.type === 'position_update') {
            // Per-token state update (for trade page)
            if (message.data) {
              const positionData: SolanaPosition = message.data;
              if (currentToken && positionData.tokenAddress?.toLowerCase() === currentToken.toLowerCase()) {
                setPosition(positionData);
                onUpdateRef.current?.(positionData);
              }
            }
            // Broadcast PositionRow data for Positions.tsx / portfolio
            window.dispatchEvent(new CustomEvent('solanaPositionUpdate', {
              detail: { position: message.data, tokenAddress: message.tokenAddress }
            }));
          } else if (message.type === 'new_trade' && message.data) {
            window.dispatchEvent(new CustomEvent('solanaNewTrade', {
              detail: message.data
            }));

            // Persist to localStorage so Portfolio can consume on mount
            // (WS fires after DB save — data is real, not optimistic)
            try {
              const key = 'pending_ws_trades';
              const existing = JSON.parse(localStorage.getItem(key) || '[]');
              existing.push({ ...message.data, _wsTimestamp: Date.now() });
              // Cap at 20 entries, drop oldest
              if (existing.length > 20) existing.splice(0, existing.length - 20);
              localStorage.setItem(key, JSON.stringify(existing));
            } catch {}
          } else if (message.type === 'full_positions' && Array.isArray(message.data)) {
            // Full positions array pushed after trade save — instant update, no REST needed
            window.dispatchEvent(new CustomEvent('solanaFullPositions', {
              detail: {
                positions: message.data,
                blockchain: message.blockchain,
                timestamp: message.timestamp,
              }
            }));

            // Persist to localStorage so Positions.tsx can use on mount
            try {
              const bc = message.blockchain || 'solana';
              localStorage.setItem(`ws_full_positions_${bc}`, JSON.stringify({
                positions: message.data,
                blockchain: bc,
                timestamp: Date.now(),
              }));
            } catch {}
          } else if (message.type === 'positions_snapshot' && Array.isArray(message.data)) {
            window.dispatchEvent(new CustomEvent('solanaPositionsSnapshot', {
              detail: {
                positions: message.data,
                blockchain: message.blockchain,
                timestamp: message.timestamp,
              }
            }));
          } else if (message.type === 'activity_snapshot' && Array.isArray(message.data)) {
            window.dispatchEvent(new CustomEvent('solanaActivitySnapshot', {
              detail: {
                activity: message.data,
                blockchain: message.blockchain,
                timestamp: message.timestamp,
              }
            }));
          }
        } catch (parseErr) {
          console.error('[useSolanaPositionWebSocket] Failed to parse message:', parseErr);
        }
      };

      ws.onerror = (event) => {
        if (!mountedRef.current) return;
        console.error('[useSolanaPositionWebSocket] ❌ WebSocket ERROR:', event);
        setError('WebSocket connection error');
      };

      ws.onclose = (event) => {
        if (!mountedRef.current) return;
        if (isDev) console.log('[useSolanaPositionWebSocket] WebSocket closed:', event.code);
        setConnected(false);
        wsRef.current = null;

        // Clear heartbeat on close
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }

        // Always reconnect with capped exponential backoff (no max attempts)
        const { enabled: stillEnabled } = configRef.current;
        if (stillEnabled) {
          reconnectAttemptsRef.current += 1;
          // Exponential backoff: 3s, 6s, 12s, 24s, ... capped at 120s
          const backoffDelay = Math.min(
            baseReconnectInterval * Math.pow(2, reconnectAttemptsRef.current - 1),
            maxBackoffInterval
          );
          if (isDev) console.log(`[useSolanaPositionWebSocket] Reconnecting in ${backoffDelay / 1000}s (attempt ${reconnectAttemptsRef.current})`);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              connect();
            }
          }, backoffDelay);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[useSolanaPositionWebSocket] Failed to create WebSocket:', err);
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
    if (tokenAddress && user?.id && user?.bearerToken) {
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
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, tokenAddress, user?.bearerToken, user?.id]); // Only reconnect when these change

  // Reconnect when tab becomes visible (browser may kill WS when backgrounded)
  useEffect(() => {
    const handleVisibilityChange = () => {
      const { enabled: isEnabled, userId } = configRef.current;
      if (document.visibilityState === 'visible' && isEnabled && userId) {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          reconnectAttemptsRef.current = 0;
          connect();
        } else {
          // WS looks open — send a ping to verify it's still alive
          try {
            pingSentAtRef.current = performance.now();
            wsRef.current.send(JSON.stringify({ type: 'ping' }));
          } catch {
            reconnectAttemptsRef.current = 0;
            connect();
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [connect]);

  const refreshPosition = useCallback(() => {
    return fetchInitialPosition();
  }, [fetchInitialPosition]);

  // Request cached portfolio snapshot from backend (for page navigation when WS is already open)
  const requestSnapshot = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'request_snapshot' }));
    }
  }, []);

  // Send an arbitrary JSON message to the WS (used for prefetch_order, etc.)
  const sendMessage = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return {
    position,
    connected,
    error,
    loading,
    refreshPosition,
    requestSnapshot,
    sendMessage,
  };
}

export default useSolanaPositionWebSocket;
