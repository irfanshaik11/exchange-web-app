// src/hooks/useLivePriceStore.ts
// Module-level external store for live Polymarket trade prices.
// Decouples WS message ingestion from React render cycle.
// Consumers subscribe via useSyncExternalStore — only the card whose
// token received a trade re-renders, not the whole page.

import PolymarketOrderBookService from '../services/polymarketOrderBookService';
import type { LastTradePrice } from '../services/polymarketOrderBookService';

export interface LivePriceEntry {
  price: number;      // 0-1 scale (e.g., 0.65 = 65%)
  size: number;
  side: string;
  timestamp: number;  // Unix ms
}

// ── Module-level state (outside React) ─────────────────────────────────────

/** Current price for each tokenId */
const prices = new Map<string, LivePriceEntry>();

/** React listeners per tokenId — called when that token's price changes */
const listeners = new Map<string, Set<() => void>>();

/** Active WS unsubscribe functions per tokenId */
const wsUnsubs = new Map<string, () => void>();

/** Reference count per tokenId (how many React components are subscribed) */
const refCounts = new Map<string, number>();

// ── Internal helpers ───────────────────────────────────────────────────────

function notifyListeners(tokenId: string): void {
  const set = listeners.get(tokenId);
  if (set) {
    for (const cb of set) cb();
  }
}

function ensureWsSubscription(tokenId: string): void {
  if (wsUnsubs.has(tokenId)) return; // Already subscribed

  const service = PolymarketOrderBookService.getInstance();
  const unsub = service.subscribe(
    tokenId,
    () => {},  // onBook — not needed for card prices
    () => {},  // onPriceChange — not needed for card prices
    (trade: LastTradePrice) => {
      const entry: LivePriceEntry = {
        price: trade.price,
        size: trade.size,
        side: trade.side,
        timestamp: trade.timestamp > 1e12 ? trade.timestamp : trade.timestamp * 1000,
      };
      prices.set(trade.assetId, entry);
      notifyListeners(trade.assetId);
    },
    undefined, // onBestBidAsk — not needed
  );

  wsUnsubs.set(tokenId, unsub);
}

function releaseWsSubscription(tokenId: string): void {
  const unsub = wsUnsubs.get(tokenId);
  if (unsub) {
    unsub();
    wsUnsubs.delete(tokenId);
  }
}

// ── Public API (consumed by usePolymarketLivePrice hook) ───────────────────

/**
 * Subscribe a React listener to price changes for a specific tokenId.
 * Manages WS subscription lifecycle via reference counting.
 * Returns an unsubscribe function.
 */
export function subscribeLivePrice(
  tokenId: string,
  onStoreChange: () => void,
): () => void {
  // Register listener
  let set = listeners.get(tokenId);
  if (!set) {
    set = new Set();
    listeners.set(tokenId, set);
  }
  set.add(onStoreChange);

  // Increment ref count and ensure WS subscription
  const count = (refCounts.get(tokenId) || 0) + 1;
  refCounts.set(tokenId, count);
  ensureWsSubscription(tokenId);

  // Unsubscribe
  return () => {
    set!.delete(onStoreChange);
    if (set!.size === 0) {
      listeners.delete(tokenId);
    }

    const newCount = (refCounts.get(tokenId) || 1) - 1;
    if (newCount <= 0) {
      refCounts.delete(tokenId);
      releaseWsSubscription(tokenId);
      // Keep the price in the map so if the card scrolls back in, it shows instantly
    } else {
      refCounts.set(tokenId, newCount);
    }
  };
}

/**
 * Get the current price snapshot for a tokenId.
 * Returns undefined if no trade has been received yet.
 */
export function getLivePriceSnapshot(tokenId: string): LivePriceEntry | undefined {
  return prices.get(tokenId);
}
