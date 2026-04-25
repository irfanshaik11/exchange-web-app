import { useMemo, useSyncExternalStore } from "react";
import {
  getServerSnapshot,
  getSnapshot,
  subscribe,
  type PendingTradeMarker,
} from "~/utils/pendingTradeMarkers";

/**
 * React hook returning pending trade markers filtered by mint + wallet.
 *
 * Subscribes to the global pendingTradeMarkers store via useSyncExternalStore.
 * The store keeps a stable array reference between mutations, so identity
 * checks won't cause spurious re-renders.
 *
 * SSR-safe: getServerSnapshot returns a frozen empty array, so server and
 * first client render agree (no hydration mismatch).
 */
export function usePendingTradeMarkers(
  mint: string | null | undefined,
  walletAddress: string | null | undefined,
): readonly PendingTradeMarker[] {
  const all = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return useMemo(() => {
    if (!mint || !walletAddress) return [];
    const wallet = walletAddress.toLowerCase();
    return all.filter((row) => row.mint === mint && row.walletAddress === wallet);
  }, [all, mint, walletAddress]);
}
