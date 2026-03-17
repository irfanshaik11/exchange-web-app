/**
 * useBalancePolling Hook
 *
 * Smart polling for balance updates after deposits.
 * Polls for balance changes for a limited time after a deposit action.
 */

import { useCallback, useRef, useEffect } from 'react';
import { useUser } from '~/components/UserContext';

interface UseBalancePollingOptions {
  /** Polling interval in milliseconds (default: 3000ms = 3 seconds) */
  intervalMs?: number;
  /** Maximum duration to poll in milliseconds (default: 60000ms = 60 seconds) */
  maxDurationMs?: number;
  /** Chain to poll balance for (default: 'sol') */
  chain?: 'sol' | 'monad';
  /** Callback when balance changes */
  onBalanceChange?: (oldBalance: number, newBalance: number) => void;
}

interface UseBalancePollingReturn {
  /** Start polling for balance updates */
  startPolling: () => void;
  /** Stop polling */
  stopPolling: () => void;
  /** Whether currently polling */
  isPolling: boolean;
}

/**
 * Hook for smart balance polling after deposit actions.
 *
 * Usage:
 * ```tsx
 * const { startPolling, stopPolling, isPolling } = useBalancePolling({
 *   chain: 'sol',
 *   intervalMs: 3000,
 *   maxDurationMs: 60000,
 *   onBalanceChange: (old, new) => console.log('Balance changed:', old, '->', new)
 * });
 *
 * // After deposit confirmation
 * startPolling();
 * ```
 */
export function useBalancePolling(options: UseBalancePollingOptions = {}): UseBalancePollingReturn {
  const {
    intervalMs = 3000,
    maxDurationMs = 60000,
    chain = 'sol',
    onBalanceChange,
  } = options;

  const { refreshBalance, chainBalances, solBalance } = useUser();

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const previousBalanceRef = useRef<number | null>(null);
  const isPollingRef = useRef(false);

  const getCurrentBalance = useCallback(() => {
    return chain === 'monad'
      ? (chainBalances['monad'] ?? 0)
      : solBalance;
  }, [chain, chainBalances, solBalance]);

  const stopPolling = useCallback(() => {
    // Only log if we were actually polling
    const wasPolling = isPollingRef.current || pollingIntervalRef.current !== null;
    
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    isPollingRef.current = false;
    startTimeRef.current = null;
    previousBalanceRef.current = null;
    
    // Only log if we were actually polling (avoid logging on cleanup when not polling)
    if (wasPolling && process.env.NODE_ENV === 'development') {
      console.log(`[useBalancePolling] 🛑 Stopped polling for ${chain} balance`);
    }
  }, [chain]);

  const startPolling = useCallback(() => {
    // Stop any existing polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`[useBalancePolling] 🚀 Starting balance polling for ${chain} (interval: ${intervalMs}ms, max: ${maxDurationMs}ms)`);
    }

    startTimeRef.current = Date.now();
    previousBalanceRef.current = getCurrentBalance();
    isPollingRef.current = true;

    pollingIntervalRef.current = setInterval(async () => {
      const elapsed = Date.now() - (startTimeRef.current ?? Date.now());

      // Stop if max duration reached
      if (elapsed >= maxDurationMs) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[useBalancePolling] ⏰ Max duration reached, stopping polling`);
        }
        stopPolling();
        return;
      }

      try {
        // Force refresh to bypass cooldown
        const result = await refreshBalance({ chain, force: true });

        if (result?.balance !== undefined) {
          const oldBalance = previousBalanceRef.current ?? 0;
          const newBalance = result.balance;

          // Check if balance changed
          if (Math.abs(newBalance - oldBalance) > 0.0001) {
            if (process.env.NODE_ENV === 'development') {
              console.log(`[useBalancePolling] 💰 Balance changed: ${oldBalance.toFixed(4)} -> ${newBalance.toFixed(4)}`);
            }
            onBalanceChange?.(oldBalance, newBalance);

            // Stop polling after successful balance change detection
            stopPolling();
          }
          // Removed "Balance unchanged" log to reduce noise

          previousBalanceRef.current = newBalance;
        }
      } catch (error) {
        console.warn('[useBalancePolling] Error refreshing balance:', error);
      }
    }, intervalMs);
  }, [chain, intervalMs, maxDurationMs, getCurrentBalance, refreshBalance, onBalanceChange, stopPolling]);

  // Auto-stop polling when gRPC pushes a balance update (instant detection)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleGrpcBalance = (event: Event) => {
      if (!isPollingRef.current) return;
      const { solBalance: newBal } = (event as CustomEvent).detail || {};
      if (typeof newBal !== 'number' || !Number.isFinite(newBal)) return;
      const oldBal = previousBalanceRef.current ?? 0;
      if (chain === 'sol' && Math.abs(newBal - oldBal) > 0.0001) {
        onBalanceChange?.(oldBal, newBal);
        stopPolling();
      }
    };
    window.addEventListener('solanaBalanceUpdate', handleGrpcBalance);
    return () => {
      window.removeEventListener('solanaBalanceUpdate', handleGrpcBalance);
    };
  }, [chain, onBalanceChange, stopPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  return {
    startPolling,
    stopPolling,
    isPolling: isPollingRef.current,
  };
}

export default useBalancePolling;
