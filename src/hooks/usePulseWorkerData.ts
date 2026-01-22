/**
 * Hook to get Pulse data from the Web Worker
 *
 * This is a thin wrapper around the worker bridge.
 * Updates come from the worker, not from React state.
 */

import { useState, useEffect, useSyncExternalStore, useCallback } from 'react';
import {
  subscribeToData,
  subscribeToConnection,
  getPulseData,
  getConnectionStatus,
} from '~/utils/pulseWorkerBridge';
import type { PulseToken } from '~/utils/pulseCache';

type FilterType = 'all' | 'new' | 'final_stretch' | 'migrated';

interface UsePulseWorkerDataOptions {
  filter?: FilterType;
  searchQuery?: string;
}

export function usePulseWorkerData(options: UsePulseWorkerDataOptions = {}) {
  const { filter = 'all', searchQuery = '' } = options;

  // Use useSyncExternalStore for React 18 concurrent mode compatibility
  const data = useSyncExternalStore(
    subscribeToData,
    getPulseData,
    getPulseData // Server snapshot
  );

  const connectionStatus = useSyncExternalStore(
    subscribeToConnection,
    getConnectionStatus,
    () => ({ new: false, final_stretch: false, migrated: false })
  );

  // Filter and search logic
  const getFilteredTokens = useCallback(() => {
    let tokens: PulseToken[] = [];

    switch (filter) {
      case 'new':
        tokens = data.newTokens;
        break;
      case 'final_stretch':
        tokens = data.finalStretchTokens;
        break;
      case 'migrated':
        tokens = data.migratedTokens;
        break;
      case 'all':
      default:
        // Combine all, removing duplicates
        const seen = new Set<string>();
        for (const t of data.newTokens) {
          if (!seen.has(t.mint)) {
            seen.add(t.mint);
            tokens.push(t);
          }
        }
        for (const t of data.finalStretchTokens) {
          if (!seen.has(t.mint)) {
            seen.add(t.mint);
            tokens.push(t);
          }
        }
        for (const t of data.migratedTokens) {
          if (!seen.has(t.mint)) {
            seen.add(t.mint);
            tokens.push(t);
          }
        }
        break;
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      tokens = tokens.filter(
        t =>
          t.name?.toLowerCase().includes(q) ||
          t.symbol?.toLowerCase().includes(q) ||
          t.mint?.toLowerCase().includes(q)
      );
    }

    return tokens;
  }, [data, filter, searchQuery]);

  return {
    tokens: getFilteredTokens(),
    newTokens: data.newTokens,
    finalStretchTokens: data.finalStretchTokens,
    migratedTokens: data.migratedTokens,
    connectionStatus,
    isConnected: connectionStatus.new || connectionStatus.final_stretch || connectionStatus.migrated,
  };
}
