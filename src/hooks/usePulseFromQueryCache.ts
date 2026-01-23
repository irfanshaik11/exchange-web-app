/**
 * Hook to read Pulse data with REAL-TIME updates
 *
 * INSTANT updates - no delays, no navigation blocking.
 * React 18's useSyncExternalStore handles rapid updates efficiently.
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  subscribeToData,
  getPulseData,
  getConnectionStatus,
  subscribeToConnection,
  ensureDataLoaded,
} from '~/utils/pulseWorkerBridge';
import { type PulseToken } from '~/utils/pulseCache';

interface UsePulseFromQueryCacheOptions {
  channel?: 'new' | 'final_stretch' | 'migrated';
}

interface UsePulseFromQueryCacheReturn {
  newTokens: PulseToken[];
  finalStretchTokens: PulseToken[];
  migratedTokens: PulseToken[];
  connected: boolean;
  error: string | null;
  clearTokens: () => void;
}

// Empty defaults for SSR
const emptyTokens: PulseToken[] = [];
const emptyData = { newTokens: emptyTokens, finalStretchTokens: emptyTokens, migratedTokens: emptyTokens };
const emptyConnection = { new: false, final_stretch: false, migrated: false };

export function usePulseFromQueryCache(
  options: UsePulseFromQueryCacheOptions = {}
): UsePulseFromQueryCacheReturn {
  const { channel } = options;

  // On mount, ensure data is loaded from IndexedDB cache if bridge is empty
  // This handles the case where user navigates away and comes back
  useEffect(() => {
    ensureDataLoaded();
  }, []);

  // INSTANT subscription - no navigation blocking, no delays
  // React 18's useSyncExternalStore handles concurrent updates efficiently
  const data = useSyncExternalStore(
    subscribeToData,
    getPulseData,
    () => emptyData
  );

  // Connection status subscription
  const connectionStatus = useSyncExternalStore(
    subscribeToConnection,
    getConnectionStatus,
    () => emptyConnection
  );

  // Compute connected status
  const connected = channel
    ? connectionStatus[channel]
    : connectionStatus.new || connectionStatus.final_stretch || connectionStatus.migrated;

  const clearTokens = useCallback(() => {
    // No-op for now - data is managed by the bridge
  }, []);

  // Return based on channel filter
  return {
    newTokens: channel === 'new' ? data.newTokens : (channel ? emptyTokens : data.newTokens),
    finalStretchTokens: channel === 'final_stretch' ? data.finalStretchTokens : (channel ? emptyTokens : data.finalStretchTokens),
    migratedTokens: channel === 'migrated' ? data.migratedTokens : (channel ? emptyTokens : data.migratedTokens),
    connected,
    error: null,
    clearTokens,
  };
}
