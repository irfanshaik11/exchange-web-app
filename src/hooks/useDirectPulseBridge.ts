/**
 * Hook to use Direct Pulse Bridge
 *
 * Features:
 * - Zero-delay WebSocket (main thread, not worker)
 * - IndexedDB persistence
 * - Cross-tab sync via BroadcastChannel
 * - Leader election
 */

import { useSyncExternalStore, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import {
  initDirectPulseBridge,
  getDirectPulseData,
  getDirectConnectionStatus,
  subscribeToDirectData,
  subscribeToDirectConnection,
} from '~/utils/pulseDirectBridge';
import { type PulseToken } from '~/utils/pulseCache';
import { env } from '~/env';

interface UseDirectPulseBridgeReturn {
  newTokens: PulseToken[];
  finalStretchTokens: PulseToken[];
  migratedTokens: PulseToken[];
  connected: boolean;
}

// Initialize bridge once
let bridgeInitialized = false;

export function useDirectPulseBridge(): UseDirectPulseBridgeReturn {
  const router = useRouter();
  const mountedRef = useRef(true);

  // Initialize bridge on first use
  useEffect(() => {
    if (!bridgeInitialized && env.NEXT_PUBLIC_WEBSOCKET_URL) {
      bridgeInitialized = true;
      initDirectPulseBridge(env.NEXT_PUBLIC_WEBSOCKET_URL);
    }
  }, []);

  // Track mounted state
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Subscribe to data with navigation awareness
  const subscribeWithNavCheck = useCallback((onStoreChange: () => void) => {
    let isNavigating = false;
    let missedUpdate = false;

    const handleRouteChangeStart = () => {
      isNavigating = true;
    };

    const handleRouteChangeComplete = () => {
      isNavigating = false;
      if (missedUpdate) {
        missedUpdate = false;
        onStoreChange();
      }
    };

    router.events.on('routeChangeStart', handleRouteChangeStart);
    router.events.on('routeChangeComplete', handleRouteChangeComplete);
    router.events.on('routeChangeError', handleRouteChangeComplete);

    const unsubData = subscribeToDirectData(() => {
      if (isNavigating) {
        missedUpdate = true;
        return;
      }
      if (mountedRef.current) {
        onStoreChange();
      }
    });

    return () => {
      unsubData();
      router.events.off('routeChangeStart', handleRouteChangeStart);
      router.events.off('routeChangeComplete', handleRouteChangeComplete);
      router.events.off('routeChangeError', handleRouteChangeComplete);
    };
  }, [router.events]);

  // Use useSyncExternalStore for React 18 concurrent mode compatibility
  const data = useSyncExternalStore(
    subscribeWithNavCheck,
    getDirectPulseData,
    () => ({ newTokens: [], finalStretchTokens: [], migratedTokens: [] })
  );

  const connectionStatus = useSyncExternalStore(
    subscribeToDirectConnection,
    getDirectConnectionStatus,
    () => ({ new: false, final_stretch: false, migrated: false })
  );

  const connected = connectionStatus.new || connectionStatus.final_stretch || connectionStatus.migrated;

  return {
    newTokens: data.newTokens,
    finalStretchTokens: data.finalStretchTokens,
    migratedTokens: data.migratedTokens,
    connected,
  };
}
