import React, { createContext, useContext, useCallback, useState, useMemo } from 'react';
import { useSolanaPositionWebSocket, type SolanaPosition, type TxHashMessage } from '../hooks/useSolanaPositionWebSocket';
import { useUser } from '../components/UserContext';

/**
 * Context value interface for position WebSocket
 */
interface SolanaPositionWebSocketContextValue {
  /** Whether the WebSocket is connected */
  connected: boolean;
  /** Error message if connection failed */
  error: string | null;
  /** Whether initial position is loading */
  loading: boolean;
  /** Register a callback for txHash messages */
  registerTxHashCallback: (id: string, callback: (data: TxHashMessage) => void) => void;
  /** Unregister a txHash callback */
  unregisterTxHashCallback: (id: string) => void;
  /** Request a portfolio snapshot from backend (for page navigation when WS is already open) */
  requestSnapshot: () => void;
  /** Send an arbitrary JSON message to the WS (for prefetch_order, etc.) */
  sendMessage: (msg: Record<string, unknown>) => void;
}

/**
 * Context for sharing a single Solana position WebSocket connection across components.
 *
 * Problem: Multiple components (PulseTable, TradeActionPanel) each call useSolanaPositionWebSocket
 * independently, creating duplicate connections to the same endpoint.
 *
 * Solution: This context creates ONE connection and allows components to register callbacks
 * for txHash messages they care about.
 */
const SolanaPositionWebSocketContext = createContext<SolanaPositionWebSocketContextValue | null>(null);

interface SolanaPositionWebSocketProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component that creates a single position WebSocket connection.
 * Components can register callbacks for txHash messages.
 */
export function SolanaPositionWebSocketProvider({ children }: SolanaPositionWebSocketProviderProps) {
  const { user } = useUser();

  // Store callbacks for txHash messages from different components
  const [txHashCallbacks] = useState<Map<string, (data: TxHashMessage) => void>>(() => new Map());

  // Handle txHash from WebSocket - dispatch to all registered callbacks
  const handleTxHash = useCallback((data: TxHashMessage) => {
    txHashCallbacks.forEach((callback) => {
      try {
        callback(data);
      } catch (err) {
        console.error('[SolanaPositionWebSocketContext] Error in txHash callback:', err);
      }
    });
  }, [txHashCallbacks]);

  // Single WebSocket connection for all listeners
  const { connected, error, loading, requestSnapshot, sendMessage } = useSolanaPositionWebSocket({
    tokenAddress: "", // Empty for global listening
    enabled: !!user?.id,
    onTxHash: handleTxHash,
  });

  // Register a callback for txHash messages
  const registerTxHashCallback = useCallback((id: string, callback: (data: TxHashMessage) => void) => {
    txHashCallbacks.set(id, callback);
  }, [txHashCallbacks]);

  // Unregister a txHash callback
  const unregisterTxHashCallback = useCallback((id: string) => {
    txHashCallbacks.delete(id);
  }, [txHashCallbacks]);

  const value = useMemo<SolanaPositionWebSocketContextValue>(() => ({
    connected,
    error,
    loading,
    registerTxHashCallback,
    unregisterTxHashCallback,
    requestSnapshot,
    sendMessage,
  }), [connected, error, loading, registerTxHashCallback, unregisterTxHashCallback, requestSnapshot, sendMessage]);

  return (
    <SolanaPositionWebSocketContext.Provider value={value}>
      {children}
    </SolanaPositionWebSocketContext.Provider>
  );
}

/**
 * Hook to consume position WebSocket connection status from context.
 * Also provides methods to register/unregister txHash callbacks.
 */
export function useSolanaPositionWebSocketContext(): SolanaPositionWebSocketContextValue {
  const context = useContext(SolanaPositionWebSocketContext);

  if (!context) {
    throw new Error(
      'useSolanaPositionWebSocketContext must be used within a SolanaPositionWebSocketProvider. ' +
      'Make sure _app.tsx wraps the app with <SolanaPositionWebSocketProvider>.'
    );
  }

  return context;
}

/**
 * Hook to register a txHash callback that automatically cleans up on unmount.
 * This is the primary way components should listen for txHash messages.
 */
export function useTxHashCallback(id: string, callback: (data: TxHashMessage) => void) {
  const { registerTxHashCallback, unregisterTxHashCallback, connected } = useSolanaPositionWebSocketContext();

  React.useEffect(() => {
    registerTxHashCallback(id, callback);
    return () => {
      unregisterTxHashCallback(id);
    };
  }, [id, callback, registerTxHashCallback, unregisterTxHashCallback]);

  return { connected };
}

// Re-export types for convenience
export type { SolanaPosition, TxHashMessage };

export default SolanaPositionWebSocketContext;
