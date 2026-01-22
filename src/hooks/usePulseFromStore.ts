/**
 * Hook to read Pulse data from the global store
 *
 * This hook reads data that PulseBackgroundLoader pushes to the store.
 * PulseBackgroundLoader handles all WebSocket connections and applies
 * complete price update mapping using the shared utility.
 *
 * PulseTable uses this hook to read from the store - no WebSocket connection needed.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
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

  // Track mounted state to prevent setState on unmounted components
  const mountedRef = useRef(true);

  // Track individual arrays separately so React detects array reference changes
  const [newTokens, setNewTokens] = useState<PulseToken[]>(() => pulseStore.getState().newTokens);
  const [finalStretchTokens, setFinalStretchTokens] = useState<PulseToken[]>(() => pulseStore.getState().finalStretchTokens);
  const [migratedTokens, setMigratedTokens] = useState<PulseToken[]>(() => pulseStore.getState().migratedTokens);
  const [connections, setConnections] = useState(() => pulseStore.getState().connections);

  // Subscribe to store changes
  // Navigation pausing is handled globally by usePulseNavigationGuard in _app.tsx
  useEffect(() => {
    mountedRef.current = true;

    const unsubscribe = pulseStore.subscribe(() => {
      // Don't update state if component is unmounted
      if (!mountedRef.current) return;

      const storeState = pulseStore.getState();

      // Only update state if array reference actually changed
      setNewTokens(prev => prev !== storeState.newTokens ? storeState.newTokens : prev);
      setFinalStretchTokens(prev => prev !== storeState.finalStretchTokens ? storeState.finalStretchTokens : prev);
      setMigratedTokens(prev => prev !== storeState.migratedTokens ? storeState.migratedTokens : prev);
      setConnections(prev => prev !== storeState.connections ? storeState.connections : prev);
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
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
