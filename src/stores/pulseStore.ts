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

// Navigation state - when true, ALL notifications are paused
let isNavigating = false;

// Pause/resume notifications during navigation
export function pauseNotifications() {
  isNavigating = true;
}

export function resumeNotifications() {
  isNavigating = false;
}

// Batch notifications using requestAnimationFrame to avoid blocking the main thread
let notificationScheduled = false;

function notifyListeners() {
  // Skip ALL notifications during navigation - this is critical for performance
  if (isNavigating) return;

  // If already scheduled, skip - the scheduled frame will pick up the latest state
  if (notificationScheduled) return;

  notificationScheduled = true;

  // Use requestAnimationFrame to batch multiple rapid updates into one notification
  // This prevents blocking navigation and other UI interactions
  requestAnimationFrame(() => {
    notificationScheduled = false;
    // Double-check navigation state in case it changed
    if (isNavigating) return;
    listeners.forEach(listener => listener());
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
