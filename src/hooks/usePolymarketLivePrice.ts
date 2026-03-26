// src/hooks/usePolymarketLivePrice.ts
// Per-card hook for live Polymarket trade prices.
// Uses useSyncExternalStore so only the card whose token traded re-renders.
// Includes IntersectionObserver gating — cards off-screen don't subscribe to WS.

import { useSyncExternalStore, useCallback, useRef, useEffect, useState } from 'react';
import { subscribeLivePrice, getLivePriceSnapshot } from './useLivePriceStore';
import type { LivePriceEntry } from './useLivePriceStore';

// Re-export for consumers
export type { LivePriceEntry };

// Sentinel for "no token" — avoids conditional hook calls
const EMPTY_SNAPSHOT = undefined;
const NOOP_UNSUB = () => {};

/**
 * Subscribe to live trade price for a single Polymarket token.
 *
 * @param tokenId - The YES token CLOB ID (undefined = no subscription)
 * @param observeRef - Optional ref to an element; when provided, only subscribes
 *                     when the element is within 200px of the viewport.
 */
export default function usePolymarketLivePrice(
  tokenId: string | undefined,
  observeRef?: React.RefObject<HTMLElement | null>,
): LivePriceEntry | undefined {
  const [isVisible, setIsVisible] = useState(true); // default visible — subscribe immediately

  // IntersectionObserver gating — only gate if observeRef is provided
  useEffect(() => {
    if (!observeRef) return; // No ref → stay visible (subscribe immediately)

    const el = observeRef.current;
    if (!el) {
      // Element not yet in DOM — stay visible (will subscribe, observer will unsubscribe when ready)
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { rootMargin: '200px' }, // Subscribe 200px before visible
    );
    observer.observe(el);
    return () => observer.disconnect();
    // Re-run when observeRef.current changes (React attaches refs during commit phase)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observeRef, observeRef?.current]);

  const effectiveTokenId = tokenId && isVisible ? tokenId : undefined;

  // Stable subscribe function for useSyncExternalStore
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!effectiveTokenId) return NOOP_UNSUB;
      return subscribeLivePrice(effectiveTokenId, onStoreChange);
    },
    [effectiveTokenId],
  );

  // Stable getSnapshot — returns the same object reference from the store Map
  // Between notifications (subscribeLivePrice calls onStoreChange), the reference is stable.
  const getSnapshot = useCallback(() => {
    if (!effectiveTokenId) return EMPTY_SNAPSHOT;
    return getLivePriceSnapshot(effectiveTokenId);
  }, [effectiveTokenId]);

  // Server snapshot for SSR (always undefined — WS is client-only)
  const getServerSnapshot = useCallback(() => EMPTY_SNAPSHOT, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
