import { useEffect, useRef, useState, useCallback } from 'react';
import PolymarketOrderBookService from '../services/polymarketOrderBookService';
import type { LastTradePrice } from '../services/polymarketOrderBookService';

/**
 * Lightweight hook that subscribes to Polymarket CLOB WS for multiple token IDs
 * and returns a map of assetId → latest trade price.
 *
 * Designed for the main predictions page to show live price updates on cards
 * without the overhead of full order book tracking per market.
 */

export interface LivePriceEntry {
  price: number;      // 0-1 scale (e.g., 0.65 = 65%)
  size: number;       // Trade size
  side: string;       // 'BUY' or 'SELL'
  timestamp: number;  // Unix timestamp ms
}

export default function usePolymarketLivePrices(
  tokenIds: string[],  // Array of YES token IDs to subscribe to
  enabled = true,
): Map<string, LivePriceEntry> {
  const [prices, setPrices] = useState<Map<string, LivePriceEntry>>(() => new Map());
  const unsubsRef = useRef<Array<() => void>>([]);
  const prevIdsRef = useRef<string>('');

  // Stable serialized key for comparison
  const idsKey = tokenIds.filter(Boolean).sort().join(',');

  useEffect(() => {
    if (!enabled || !idsKey) {
      // Cleanup previous subscriptions
      unsubsRef.current.forEach(fn => fn());
      unsubsRef.current = [];
      return;
    }

    // Only re-subscribe if the set of IDs actually changed
    if (idsKey === prevIdsRef.current) return;
    prevIdsRef.current = idsKey;

    // Cleanup previous
    unsubsRef.current.forEach(fn => fn());
    unsubsRef.current = [];

    const service = PolymarketOrderBookService.getInstance();
    const ids = idsKey.split(',');

    for (const tokenId of ids) {
      if (!tokenId) continue;
      const unsub = service.subscribe(
        tokenId,
        () => {},           // onBook — not needed for card prices
        () => {},           // onPriceChange — not needed for card prices
        (trade: LastTradePrice) => {
          setPrices(prev => {
            const next = new Map(prev);
            next.set(trade.assetId, {
              price: trade.price,
              size: trade.size,
              side: trade.side,
              timestamp: trade.timestamp > 1e12 ? trade.timestamp : trade.timestamp * 1000,
            });
            return next;
          });
        },
        undefined,          // onBestBidAsk — not needed for card prices
      );
      unsubsRef.current.push(unsub);
    }

    return () => {
      unsubsRef.current.forEach(fn => fn());
      unsubsRef.current = [];
      prevIdsRef.current = '';
    };
  }, [idsKey, enabled]);

  return prices;
}
