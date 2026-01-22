/**
 * Hook to read Pulse data from the global store
 *
 * This hook reads data that PulseBackgroundLoader pushes to the store.
 * It has the same return type as usePulseWebSocketPersistent, so it's a
 * drop-in replacement.
 *
 * Use this in PulseTable when you want to read from the background loader
 * instead of making your own WebSocket connection.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as pulseStore from '~/stores/pulseStore';
import { type PulseToken } from '~/utils/pulseCache';

// Throttle helper
function throttle<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let lastCall = 0;
  return ((...args: any[]) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      fn(...args);
    }
  }) as T;
}

interface TokenInfoUpdate {
  mint_address: string;
  holder_count: number;
  kol_count: number;
}

interface UsePulseFromStoreOptions {
  channel?: 'new' | 'final_stretch' | 'migrated';
  onNewToken?: (token: PulseToken) => void;
  onFinalStretchToken?: (token: PulseToken) => void;
  onMigratedToken?: (token: PulseToken) => void;
  onPriceUpdate?: (updates: PulseToken[]) => void;
  onTokenInfoUpdate?: (update: TokenInfoUpdate) => void;
}

// Helper to detect tokens with changed price-related fields
function findChangedTokens(
  prevTokens: PulseToken[],
  newTokens: PulseToken[]
): PulseToken[] {
  if (prevTokens.length === 0) return [];

  const prevMap = new Map<string, PulseToken>();
  for (const token of prevTokens) {
    prevMap.set(token.mint, token);
  }

  const changed: PulseToken[] = [];
  for (const token of newTokens) {
    const prev = prevMap.get(token.mint);
    if (prev && hasTokenChanged(prev, token)) {
      changed.push(token);
    }
  }
  return changed;
}

// Check if price-related fields have changed
function hasTokenChanged(prev: PulseToken, curr: PulseToken): boolean {
  return (
    prev.price_usd !== curr.price_usd ||
    prev.market_cap_usd !== curr.market_cap_usd ||
    prev.volume_24h !== curr.volume_24h ||
    prev.liquidity_usd !== curr.liquidity_usd ||
    prev.bonding_pct !== curr.bonding_pct ||
    prev.holder_count !== curr.holder_count ||
    (prev as any).kol_count !== (curr as any).kol_count
  );
}

interface UsePulseFromStoreReturn {
  newTokens: PulseToken[];
  finalStretchTokens: PulseToken[];
  migratedTokens: PulseToken[];
  connected: boolean;
  error: string | null;
  clearTokens: () => void;
  isUsingSharedWorker: boolean;
}

export function usePulseFromStore(
  options: UsePulseFromStoreOptions = {}
): UsePulseFromStoreReturn {
  const { channel, onNewToken, onFinalStretchToken, onMigratedToken, onPriceUpdate, onTokenInfoUpdate } = options;

  // Track individual arrays separately so React detects array reference changes
  const [newTokens, setNewTokens] = useState<PulseToken[]>(() => pulseStore.getState().newTokens);
  const [finalStretchTokens, setFinalStretchTokens] = useState<PulseToken[]>(() => pulseStore.getState().finalStretchTokens);
  const [migratedTokens, setMigratedTokens] = useState<PulseToken[]>(() => pulseStore.getState().migratedTokens);
  const [connections, setConnections] = useState(() => pulseStore.getState().connections);

  // Track previous tokens to detect new arrivals and price changes
  const prevNewTokensRef = useRef<PulseToken[]>([]);
  const prevFinalStretchTokensRef = useRef<PulseToken[]>([]);
  const prevMigratedTokensRef = useRef<PulseToken[]>([]);

  // Store callbacks in refs
  const onNewTokenRef = useRef(onNewToken);
  const onFinalStretchTokenRef = useRef(onFinalStretchToken);
  const onMigratedTokenRef = useRef(onMigratedToken);
  const onPriceUpdateRef = useRef(onPriceUpdate);
  const onTokenInfoUpdateRef = useRef(onTokenInfoUpdate);

  useEffect(() => {
    onNewTokenRef.current = onNewToken;
    onFinalStretchTokenRef.current = onFinalStretchToken;
    onMigratedTokenRef.current = onMigratedToken;
    onPriceUpdateRef.current = onPriceUpdate;
    onTokenInfoUpdateRef.current = onTokenInfoUpdate;
  }, [onNewToken, onFinalStretchToken, onMigratedToken, onPriceUpdate, onTokenInfoUpdate]);

  // Subscribe to store changes - simplified for performance
  useEffect(() => {
    const unsubscribe = pulseStore.subscribe(() => {
      const storeState = pulseStore.getState();

      // Update individual state only if array reference changed
      setNewTokens(storeState.newTokens);
      setFinalStretchTokens(storeState.finalStretchTokens);
      setMigratedTokens(storeState.migratedTokens);
      setConnections(storeState.connections);

      // Detect new tokens and call callbacks (lightweight - only checks first token)
      if (storeState.newTokens.length > 0) {
        const prevFirst = prevNewTokensRef.current[0]?.mint;
        const newFirst = storeState.newTokens[0]?.mint;
        if (newFirst && newFirst !== prevFirst) {
          onNewTokenRef.current?.(storeState.newTokens[0]);
        }
      }

      if (storeState.finalStretchTokens.length > 0) {
        const prevFirst = prevFinalStretchTokensRef.current[0]?.mint;
        const newFirst = storeState.finalStretchTokens[0]?.mint;
        if (newFirst && newFirst !== prevFirst) {
          onFinalStretchTokenRef.current?.(storeState.finalStretchTokens[0]);
        }
      }

      if (storeState.migratedTokens.length > 0) {
        const prevFirst = prevMigratedTokensRef.current[0]?.mint;
        const newFirst = storeState.migratedTokens[0]?.mint;
        if (newFirst && newFirst !== prevFirst) {
          onMigratedTokenRef.current?.(storeState.migratedTokens[0]);
        }
      }

      // Price updates are handled by PulseTable's direct connection to usePulseWebSocketPersistent
      // We don't forward them here to avoid double-processing and performance issues

      // Update refs
      prevNewTokensRef.current = storeState.newTokens;
      prevFinalStretchTokensRef.current = storeState.finalStretchTokens;
      prevMigratedTokensRef.current = storeState.migratedTokens;
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
    isUsingSharedWorker: true, // Indicates using shared background loader
  };
}
