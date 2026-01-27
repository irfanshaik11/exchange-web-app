import React, { createContext, useContext } from 'react';
import type {
  SolanaTokenTrade,
  SolanaTokenHolder,
  SolanaTopTrader,
  SolanaDevToken,
  HolderSummary,
  SolanaTokenInfo,
  SolanaTokenVolume,
} from '../hooks/useSolanaTokenWebSocket';

/**
 * Context value interface that matches the return type of useSolanaTokenWebSocket
 * This ensures components consuming the context get the same API as the hook
 */
export interface SolanaTokenWebSocketContextValue {
  trades: SolanaTokenTrade[];
  holders: SolanaTokenHolder[];
  topTraders: SolanaTopTrader[];
  devTokens: SolanaDevToken[];
  holderSummary: HolderSummary | null;
  tokenInfo: SolanaTokenInfo | null;
  volume: SolanaTokenVolume | null;
  connected: boolean;
  error: string | null;
  loading: boolean;
}

/**
 * Context for sharing a single Solana token WebSocket connection across components.
 *
 * Problem: Multiple components (CodexTrades, CodexTopTraders, CodexDevTokens, HoldersTable)
 * each call useSolanaTokenWebSocket independently, creating 5 duplicate connections.
 *
 * Solution: Parent [id].tsx calls the hook ONCE and passes data to this provider,
 * child components consume from context instead of creating their own connections.
 */
const SolanaTokenWebSocketContext = createContext<SolanaTokenWebSocketContextValue | null>(null);

interface SolanaTokenWebSocketProviderProps {
  /** WebSocket data from parent's useSolanaTokenWebSocket call */
  value: SolanaTokenWebSocketContextValue;
  children: React.ReactNode;
}

/**
 * Provider component that shares WebSocket data with children.
 * The parent must call useSolanaTokenWebSocket and pass the data here.
 *
 * Usage:
 * ```tsx
 * // Parent calls hook once
 * const wsData = useSolanaTokenWebSocket({ mintAddress, enabled });
 *
 * // Pass to provider
 * <SolanaTokenWebSocketProvider value={wsData}>
 *   <CodexTrades />      // Uses useSolanaTokenWebSocketContext()
 *   <CodexTopTraders />  // Uses useSolanaTokenWebSocketContext()
 *   <HoldersTable />     // Uses useSolanaTokenWebSocketContext()
 * </SolanaTokenWebSocketProvider>
 * ```
 */
export function SolanaTokenWebSocketProvider({
  value,
  children,
}: SolanaTokenWebSocketProviderProps) {
  return (
    <SolanaTokenWebSocketContext.Provider value={value}>
      {children}
    </SolanaTokenWebSocketContext.Provider>
  );
}

/**
 * Hook to consume WebSocket data from context.
 * Must be used within a SolanaTokenWebSocketProvider.
 *
 * Returns the same interface as useSolanaTokenWebSocket:
 * - trades: Real-time trade updates
 * - holders: Current holder list
 * - topTraders: Top traders by volume
 * - devTokens: Other tokens by the dev
 * - holderSummary: Aggregated holder metrics
 * - tokenInfo: Token metadata and prices
 * - volume: Volume data across timeframes
 * - connected: WebSocket connection status
 * - error: Error message if connection failed
 * - loading: True while initial snapshot is loading
 */
export function useSolanaTokenWebSocketContext(): SolanaTokenWebSocketContextValue {
  const context = useContext(SolanaTokenWebSocketContext);

  if (!context) {
    throw new Error(
      'useSolanaTokenWebSocketContext must be used within a SolanaTokenWebSocketProvider. ' +
      'Make sure the parent trade page wraps its content with <SolanaTokenWebSocketProvider>.'
    );
  }

  return context;
}

// Re-export types for convenience
export type {
  SolanaTokenTrade,
  SolanaTokenHolder,
  SolanaTopTrader,
  SolanaDevToken,
  HolderSummary,
  SolanaTokenInfo,
  SolanaTokenVolume,
};

export default SolanaTokenWebSocketContext;
