/**
 * RAF-Batched State Hook
 *
 * This hook batches state updates to 60fps using requestAnimationFrame.
 * Perfect for high-frequency WebSocket updates where data arrives faster
 * than the screen can refresh.
 *
 * How it works:
 * 1. WebSocket message arrives → data stored in ref immediately (0ms delay)
 * 2. requestAnimationFrame fires → React renders with latest data (max 16ms delay)
 * 3. 500 messages/sec becomes max 60 renders/sec (88% reduction)
 *
 * Usage:
 * const [state, setBatchedState, getLatestValue] = useRAFBatchedState<T>(initialValue);
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export function useRAFBatchedState<T>(initialValue: T) {
  const [state, setState] = useState<T>(initialValue);
  const pendingValueRef = useRef<T>(initialValue);
  const rafIdRef = useRef<number | null>(null);
  const hasUpdateRef = useRef(false);

  // Flush pending updates on next animation frame
  const scheduleUpdate = useCallback(() => {
    if (rafIdRef.current !== null) return; // Already scheduled

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      if (hasUpdateRef.current) {
        setState(pendingValueRef.current);
        hasUpdateRef.current = false;
      }
    });
  }, []);

  // Set value immediately in ref, schedule render
  const setBatchedState = useCallback((updater: T | ((prev: T) => T)) => {
    if (typeof updater === 'function') {
      pendingValueRef.current = (updater as (prev: T) => T)(pendingValueRef.current);
    } else {
      pendingValueRef.current = updater;
    }
    hasUpdateRef.current = true;
    scheduleUpdate();
  }, [scheduleUpdate]);

  // Get latest value (from ref, not state - for immediate reads)
  const getLatestValue = useCallback(() => pendingValueRef.current, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  // Keep ref in sync when state changes from outside
  useEffect(() => {
    pendingValueRef.current = state;
  }, [state]);

  return [state, setBatchedState, getLatestValue] as const;
}

export default useRAFBatchedState;
