/**
 * Global navigation state
 *
 * This module tracks navigation state so WebSocket handlers can
 * completely pause processing during navigation to prevent blocking.
 */

let isNavigating = false;
const listeners = new Set<(navigating: boolean) => void>();

export function setNavigating(value: boolean) {
  isNavigating = value;
  listeners.forEach(fn => fn(value));
}

export function getIsNavigating(): boolean {
  return isNavigating;
}

export function onNavigationChange(fn: (navigating: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
