/**
 * Background component that keeps Pulse WebSocket connections alive
 *
 * This component should be rendered in _app.tsx. It:
 * 1. Maintains 3 WebSocket connections (new, final_stretch, migrated)
 * 2. Keeps receiving tokens even when user is on a different page
 * 3. Pushes data to the global pulseStore for other components to read
 * 4. Applies complete price update mapping using shared utility
 *
 * PulseTable reads from the store instead of making its own connections.
 */

import { useEffect, useCallback } from 'react';
import { usePulseWebSocketPersistent } from '~/hooks/usePulseWebSocketPersistent';
import * as pulseStore from '~/stores/pulseStore';
import { type PulseToken } from '~/utils/pulseCache';
import {
  applyPriceUpdatesToArray,
  applyTokenInfoUpdateToArray,
  type PriceUpdate,
  type TokenInfoUpdate,
} from '~/utils/applyPriceUpdate';

// Debug logging (disabled in production)
const DEBUG = process.env.NODE_ENV === 'development';
const log = (...args: any[]) => DEBUG && console.log('[PulseBackgroundLoader]', ...args);

export function PulseBackgroundLoader() {
  // Mount tracking for debugging
  useEffect(() => {
    log('🚀 Mounted');
    return () => log('❌ Unmounting');
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW CHANNEL
  // ═══════════════════════════════════════════════════════════════════════════

  const handleNewPriceUpdate = useCallback((updates: PriceUpdate[]) => {
    log('💰 NEW price_update:', updates.length, 'tokens');
    const currentTokens = pulseStore.getState().newTokens;
    if (currentTokens.length > 0) {
      // Use shared utility with complete field mapping
      // Don't filter zero liquidity for "new" channel
      const updatedTokens = applyPriceUpdatesToArray(currentTokens, updates, false);
      if (updatedTokens !== currentTokens) {
        pulseStore.setNewTokens(updatedTokens);
      }
    }
  }, []);

  const handleNewTokenInfoUpdate = useCallback((update: TokenInfoUpdate) => {
    log('📊 NEW token_info_update:', update.mint_address || update.mint);
    const currentTokens = pulseStore.getState().newTokens;
    if (currentTokens.length > 0) {
      const updatedTokens = applyTokenInfoUpdateToArray(currentTokens, update);
      if (updatedTokens !== currentTokens) {
        pulseStore.setNewTokens(updatedTokens);
      }
    }
  }, []);

  const {
    newTokens,
    connected: newConnected,
  } = usePulseWebSocketPersistent({
    enabled: true,
    channel: 'new',
    onPriceUpdate: handleNewPriceUpdate,
    onTokenInfoUpdate: handleNewTokenInfoUpdate,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FINAL STRETCH CHANNEL
  // ═══════════════════════════════════════════════════════════════════════════

  const handleFinalStretchPriceUpdate = useCallback((updates: PriceUpdate[]) => {
    log('💰 FINAL_STRETCH price_update:', updates.length, 'tokens');
    const currentTokens = pulseStore.getState().finalStretchTokens;
    if (currentTokens.length > 0) {
      // Filter zero liquidity for final_stretch
      const updatedTokens = applyPriceUpdatesToArray(currentTokens, updates, true);
      if (updatedTokens !== currentTokens) {
        pulseStore.setFinalStretchTokens(updatedTokens);
      }
    }
  }, []);

  const handleFinalStretchTokenInfoUpdate = useCallback((update: TokenInfoUpdate) => {
    log('📊 FINAL_STRETCH token_info_update:', update.mint_address || update.mint);
    const currentTokens = pulseStore.getState().finalStretchTokens;
    if (currentTokens.length > 0) {
      const updatedTokens = applyTokenInfoUpdateToArray(currentTokens, update);
      if (updatedTokens !== currentTokens) {
        pulseStore.setFinalStretchTokens(updatedTokens);
      }
    }
  }, []);

  const {
    finalStretchTokens,
    connected: finalStretchConnected,
  } = usePulseWebSocketPersistent({
    enabled: true,
    channel: 'final_stretch',
    onPriceUpdate: handleFinalStretchPriceUpdate,
    onTokenInfoUpdate: handleFinalStretchTokenInfoUpdate,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MIGRATED CHANNEL
  // ═══════════════════════════════════════════════════════════════════════════

  const handleMigratedPriceUpdate = useCallback((updates: PriceUpdate[]) => {
    log('💰 MIGRATED price_update:', updates.length, 'tokens');
    const currentTokens = pulseStore.getState().migratedTokens;
    if (currentTokens.length > 0) {
      // Filter zero liquidity for migrated
      const updatedTokens = applyPriceUpdatesToArray(currentTokens, updates, true);
      if (updatedTokens !== currentTokens) {
        pulseStore.setMigratedTokens(updatedTokens);
      }
    }
  }, []);

  const handleMigratedTokenInfoUpdate = useCallback((update: TokenInfoUpdate) => {
    log('📊 MIGRATED token_info_update:', update.mint_address || update.mint);
    const currentTokens = pulseStore.getState().migratedTokens;
    if (currentTokens.length > 0) {
      const updatedTokens = applyTokenInfoUpdateToArray(currentTokens, update);
      if (updatedTokens !== currentTokens) {
        pulseStore.setMigratedTokens(updatedTokens);
      }
    }
  }, []);

  const {
    migratedTokens,
    connected: migratedConnected,
  } = usePulseWebSocketPersistent({
    enabled: true,
    channel: 'migrated',
    onPriceUpdate: handleMigratedPriceUpdate,
    onTokenInfoUpdate: handleMigratedTokenInfoUpdate,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PUSH BASE TOKEN DATA TO STORE
  // ═══════════════════════════════════════════════════════════════════════════

  // Push new tokens to store (these already have initial data from WebSocket)
  useEffect(() => {
    if (newTokens.length > 0) {
      log('📤 Pushing newTokens to store:', newTokens.length);
      pulseStore.setNewTokens(newTokens);
    }
  }, [newTokens]);

  useEffect(() => {
    if (finalStretchTokens.length > 0) {
      log('📤 Pushing finalStretchTokens to store:', finalStretchTokens.length);
      pulseStore.setFinalStretchTokens(finalStretchTokens);
    }
  }, [finalStretchTokens]);

  useEffect(() => {
    if (migratedTokens.length > 0) {
      log('📤 Pushing migratedTokens to store:', migratedTokens.length);
      pulseStore.setMigratedTokens(migratedTokens);
    }
  }, [migratedTokens]);

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTION STATUS
  // ═══════════════════════════════════════════════════════════════════════════

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
