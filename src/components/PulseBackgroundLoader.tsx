/**
 * Background component that keeps Pulse WebSocket connections alive
 *
 * This component should be rendered in _app.tsx. It:
 * 1. Maintains 3 WebSocket connections (new, final_stretch, migrated)
 * 2. Keeps receiving tokens even when user is on a different page
 * 3. Pushes data to the global pulseStore for other components to read
 *
 * PulseTable can read from the store instead of making its own connections.
 */

import { useEffect, useCallback, useRef } from 'react';
import { usePulseWebSocketPersistent } from '~/hooks/usePulseWebSocketPersistent';
import * as pulseStore from '~/stores/pulseStore';
import { type PulseToken } from '~/utils/pulseCache';

// Debug logging (can be disabled in production)
const DEBUG = process.env.NODE_ENV === 'development';
const log = (...args: any[]) => DEBUG && console.log('[PulseBackgroundLoader]', ...args);

export function PulseBackgroundLoader() {
  // Track mount status to verify component stays mounted
  const mountedRef = useRef(true);
  useEffect(() => {
    log('🚀 Mounted');
    mountedRef.current = true;
    return () => {
      log('❌ Unmounting');
      mountedRef.current = false;
    };
  }, []);

  // Price update handler for 'new' channel
  const handleNewPriceUpdate = useCallback((updates: PulseToken[]) => {
    log('💰 NEW price_update received:', updates.length, 'tokens');
    // Apply price updates directly to the store
    const currentTokens = pulseStore.getState().newTokens;
    if (currentTokens.length > 0) {
      const updatesMap = new Map(updates.map(u => [u.mint, u]));
      const updatedTokens = currentTokens.map(token => {
        const update = updatesMap.get(token.mint);
        if (!update) return token;
        return { ...token, ...update };
      });
      pulseStore.setNewTokens(updatedTokens);
    }
  }, []);

  // Price update handler for 'final_stretch' channel
  const handleFinalStretchPriceUpdate = useCallback((updates: PulseToken[]) => {
    log('💰 FINAL_STRETCH price_update received:', updates.length, 'tokens');
    const currentTokens = pulseStore.getState().finalStretchTokens;
    if (currentTokens.length > 0) {
      const updatesMap = new Map(updates.map(u => [u.mint, u]));
      const updatedTokens = currentTokens.map(token => {
        const update = updatesMap.get(token.mint);
        if (!update) return token;
        return { ...token, ...update };
      });
      pulseStore.setFinalStretchTokens(updatedTokens);
    }
  }, []);

  // Price update handler for 'migrated' channel
  const handleMigratedPriceUpdate = useCallback((updates: PulseToken[]) => {
    log('💰 MIGRATED price_update received:', updates.length, 'tokens');
    const currentTokens = pulseStore.getState().migratedTokens;
    if (currentTokens.length > 0) {
      const updatesMap = new Map(updates.map(u => [u.mint, u]));
      const updatedTokens = currentTokens.map(token => {
        const update = updatesMap.get(token.mint);
        if (!update) return token;
        return { ...token, ...update };
      });
      pulseStore.setMigratedTokens(updatedTokens);
    }
  }, []);

  // Keep all 3 channel connections alive
  const {
    newTokens,
    connected: newConnected,
  } = usePulseWebSocketPersistent({
    enabled: true,
    channel: 'new',
    onPriceUpdate: handleNewPriceUpdate,
  });

  const {
    finalStretchTokens,
    connected: finalStretchConnected,
  } = usePulseWebSocketPersistent({
    enabled: true,
    channel: 'final_stretch',
    onPriceUpdate: handleFinalStretchPriceUpdate,
  });

  const {
    migratedTokens,
    connected: migratedConnected,
  } = usePulseWebSocketPersistent({
    enabled: true,
    channel: 'migrated',
    onPriceUpdate: handleMigratedPriceUpdate,
  });

  // Push token data to global store whenever it changes
  useEffect(() => {
    log('📤 Pushing newTokens to store:', newTokens.length);
    pulseStore.setNewTokens(newTokens);
  }, [newTokens]);

  useEffect(() => {
    log('📤 Pushing finalStretchTokens to store:', finalStretchTokens.length);
    pulseStore.setFinalStretchTokens(finalStretchTokens);
  }, [finalStretchTokens]);

  useEffect(() => {
    log('📤 Pushing migratedTokens to store:', migratedTokens.length);
    pulseStore.setMigratedTokens(migratedTokens);
  }, [migratedTokens]);

  // Update connection status
  useEffect(() => {
    log('🔌 NEW connection:', newConnected);
    pulseStore.setConnectionStatus('new', newConnected);
  }, [newConnected]);

  useEffect(() => {
    log('🔌 FINAL_STRETCH connection:', finalStretchConnected);
    pulseStore.setConnectionStatus('final_stretch', finalStretchConnected);
  }, [finalStretchConnected]);

  useEffect(() => {
    log('🔌 MIGRATED connection:', migratedConnected);
    pulseStore.setConnectionStatus('migrated', migratedConnected);
  }, [migratedConnected]);

  // Render nothing - this is just for keeping connections alive
  return null;
}
