/**
 * Hook to read Pulse data from the global store
 *
 * This hook reads data that PulseBackgroundLoader pushes to the store.
 * PulseBackgroundLoader handles all WebSocket connections and applies
 * complete price update mapping using the shared utility.
 *
 * PulseTable uses this hook to read from the store - no WebSocket connection needed.
 */

import { useState, useEffect, useCallback } from 'react';
import * as pulseStore from '~/stores/pulseStore';
import { type PulseToken } from '~/utils/pulseCache';

interface UsePulseFromStoreOptions {
  channel?: 'new' | 'final_stretch' | 'migrated';
}

interface UsePulseFromStoreReturn {
  newTokens: PulseToken[];
  finalStretchTokens: PulseToken[];
  migratedTokens: PulseToken[];
  connected: boolean;
  error: string | null;
  clearTokens: () => void;
}

export function usePulseFromStore(
  options: UsePulseFromStoreOptions = {}
): UsePulseFromStoreReturn {
  const { channel } = options;

  // Track individual arrays separately so React detects array reference changes
  const [newTokens, setNewTokens] = useState<PulseToken[]>(() => pulseStore.getState().newTokens);
  const [finalStretchTokens, setFinalStretchTokens] = useState<PulseToken[]>(() => pulseStore.getState().finalStretchTokens);
  const [migratedTokens, setMigratedTokens] = useState<PulseToken[]>(() => pulseStore.getState().migratedTokens);
  const [connections, setConnections] = useState(() => pulseStore.getState().connections);

  // Subscribe to store changes
  useEffect(() => {
    const unsubscribe = pulseStore.subscribe(() => {
      const storeState = pulseStore.getState();

      // Update state - React will only re-render if array reference changed
      setNewTokens(storeState.newTokens);
      setFinalStretchTokens(storeState.finalStretchTokens);
      setMigratedTokens(storeState.migratedTokens);
      setConnections(storeState.connections);
    });

    return unsubscribe;
  }, []);

  const clearTokens = useCallback(() => {
    pulseStore.setNewTokens([]);
    pulseStore.setFinalStretchTokens([]);
    pulseStore.setMigratedTokens([]);
  }, []);

  // Determine connected status based on channel
  const connected = channel
    ? connections[channel]
    : connections.new || connections.final_stretch || connections.migrated;

  return {
    newTokens: channel === 'new' ? newTokens : (channel ? [] : newTokens),
    finalStretchTokens: channel === 'final_stretch' ? finalStretchTokens : (channel ? [] : finalStretchTokens),
    migratedTokens: channel === 'migrated' ? migratedTokens : (channel ? [] : migratedTokens),
    connected,
    error: null,
    clearTokens,
  };
}
