/**
 * Hook to read Pulse data with REAL-TIME updates
 *
 * Uses subscriptions for instant updates, but FREEZES during navigation
 * to prevent blocking. After navigation, resumes with latest data.
 */

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { useRouter } from 'next/router';
import {
  subscribeToData,
  getPulseData,
  getConnectionStatus,
  subscribeToConnection,
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

// Global navigation state - shared across all hook instances
let isNavigating = false;
let navigationListeners = new Set<() => void>();

function setNavigating(value: boolean) {
  isNavigating = value;
  if (!value) {
    // When navigation ends, notify all listeners to refresh
    navigationListeners.forEach(fn => fn());
  }
}

// Empty defaults
const emptyTokens: PulseToken[] = [];
const emptyConnection = { new: false, final_stretch: false, migrated: false };

export function usePulseFromQueryCache(
  options: UsePulseFromQueryCacheOptions = {}
): UsePulseFromQueryCacheReturn {
  const { channel } = options;
  const router = useRouter();

  // Force update trigger
  const [, forceUpdate] = useState(0);
  const mountedRef = useRef(true);

  // Track if we missed updates during navigation
  const missedUpdateRef = useRef(false);

  // Custom subscribe that respects navigation state
  const subscribeWithNavCheck = useCallback((onStoreChange: () => void) => {
    // Subscribe to data changes
    const unsubData = subscribeToData(() => {
      if (isNavigating) {
        // Mark that we missed an update
        missedUpdateRef.current = true;
        return; // Don't notify React during navigation
      }
      if (mountedRef.current) {
        onStoreChange();
      }
    });

    // Subscribe to navigation end events
    const onNavEnd = () => {
      if (missedUpdateRef.current && mountedRef.current) {
        missedUpdateRef.current = false;
        onStoreChange();
      }
    };
    navigationListeners.add(onNavEnd);

    return () => {
      unsubData();
      navigationListeners.delete(onNavEnd);
    };
  }, []);

  // Use useSyncExternalStore with navigation-aware subscription
  const data = useSyncExternalStore(
    subscribeWithNavCheck,
    getPulseData,
    () => ({ newTokens: emptyTokens, finalStretchTokens: emptyTokens, migratedTokens: emptyTokens })
  );

  // Connection status - less frequent, can use simple subscription
  const connectionStatus = useSyncExternalStore(
    subscribeToConnection,
    getConnectionStatus,
    () => emptyConnection
  );

  // Handle navigation events
  useEffect(() => {
    const handleRouteChangeStart = () => {
      setNavigating(true);
    };

    const handleRouteChangeComplete = () => {
      // Wait for next frame to let React finish unmounting - faster than setTimeout
      requestAnimationFrame(() => {
        setNavigating(false);
      });
    };

    const handleRouteChangeError = () => {
      setNavigating(false);
    };

    router.events.on('routeChangeStart', handleRouteChangeStart);
    router.events.on('routeChangeComplete', handleRouteChangeComplete);
    router.events.on('routeChangeError', handleRouteChangeError);

    return () => {
      router.events.off('routeChangeStart', handleRouteChangeStart);
      router.events.off('routeChangeComplete', handleRouteChangeComplete);
      router.events.off('routeChangeError', handleRouteChangeError);
    };
  }, [router]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Compute connected status
  const connected = channel
    ? connectionStatus[channel]
    : connectionStatus.new || connectionStatus.final_stretch || connectionStatus.migrated;

  const clearTokens = useCallback(() => {
    forceUpdate(n => n + 1);
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
