/**
 * Navigation guard for Pulse WebSocket processing
 *
 * DISABLED: The navigation blocking was causing 10+ second delays.
 * React 18's concurrent features handle rapid updates efficiently.
 * Keeping this hook as a no-op for backwards compatibility.
 */

export function usePulseNavigationGuard() {
  // NO-OP - navigation blocking disabled for instant updates
  // The previous implementation paused ALL notifications during navigation,
  // which caused massive delays when routeChangeComplete didn't fire quickly.
}
