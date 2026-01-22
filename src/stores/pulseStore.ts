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

function notifyListeners() {
  listeners.forEach(listener => listener());
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
