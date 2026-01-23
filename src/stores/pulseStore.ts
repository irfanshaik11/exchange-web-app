/**
 * Global Pulse Token Store
 *
 * Simple module-level store that holds token data and notifies listeners.
 * Used by PulseBackgroundLoader to store data and PulseTable to read it.
 */

import { type PulseToken } from '~/utils/pulseCache';

type Listener = () => void;

interface PulseStoreState {
  newTokens: PulseToken[];
  finalStretchTokens: PulseToken[];
  migratedTokens: PulseToken[];
  connections: {
    new: boolean;
    final_stretch: boolean;
    migrated: boolean;
  };
}

// Global state
const state: PulseStoreState = {
  newTokens: [],
  finalStretchTokens: [],
  migratedTokens: [],
  connections: {
    new: false,
    final_stretch: false,
    migrated: false,
  },
};

// Listeners for reactivity
const listeners = new Set<Listener>();

// Navigation state - DISABLED for instant updates
// The previous implementation blocked ALL notifications during navigation,
// which caused 10+ second delays. React 18 handles rapid updates fine.
let isNavigating = false;

// Pause/resume notifications - NOW NO-OPS for instant updates
export function pauseNotifications() {
  // NO-OP - don't block notifications
  // isNavigating = true;
}

export function resumeNotifications() {
  // NO-OP
  // isNavigating = false;
}

// INSTANT notifications - no batching, no delays
// React 18's concurrent features handle rapid updates efficiently
function notifyListeners() {
  // INSTANT: Notify all listeners immediately
  listeners.forEach(listener => {
    try {
      listener();
    } catch (err) {
      console.error('[pulseStore] Listener error:', err);
    }
  });
}

// Subscribe to state changes
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Get current state (returns the state object - arrays are replaced on update)
export function getState(): PulseStoreState {
  return state;
}

// Update tokens for a channel
export function setNewTokens(tokens: PulseToken[]) {
  state.newTokens = tokens;
  notifyListeners();
}

export function setFinalStretchTokens(tokens: PulseToken[]) {
  state.finalStretchTokens = tokens;
  notifyListeners();
}

export function setMigratedTokens(tokens: PulseToken[]) {
  state.migratedTokens = tokens;
  notifyListeners();
}

// Update connection status
export function setConnectionStatus(channel: 'new' | 'final_stretch' | 'migrated', connected: boolean) {
  state.connections[channel] = connected;
  notifyListeners();
}

// Check if background loader is active (at least one channel connected)
export function isBackgroundLoaderActive(): boolean {
  return state.connections.new || state.connections.final_stretch || state.connections.migrated;
}

// Check if navigation is in progress (for components that need to skip updates)
export function isNavigationInProgress(): boolean {
  return isNavigating;
}
