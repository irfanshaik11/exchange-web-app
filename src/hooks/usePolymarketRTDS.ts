// src/hooks/usePolymarketRTDS.ts
// React hooks for Polymarket RTDS (Real-Time Data Socket).
// Provides live crypto prices, equity prices, and comment streams.

import { useState, useEffect, useRef, useCallback } from 'react';
import PolymarketRTDSService from '../services/polymarketRTDSService';
import type {
  CryptoPriceUpdate,
  EquityPriceUpdate,
  EquityPriceSnapshot,
  CommentEvent,
} from '../services/polymarketRTDSService';

// Re-export types for consumers
export type { CryptoPriceUpdate, EquityPriceUpdate, EquityPriceSnapshot, CommentEvent };

// ── Crypto Prices Hook ───────────────────────────────────────────────────────

/**
 * Subscribe to real-time crypto prices from Binance via Polymarket RTDS.
 * @param symbols - Lowercase pairs, e.g. ["solusdt", "btcusdt"]. Empty = all.
 * @param enabled - Whether to subscribe
 * @returns Map of symbol → latest price update
 */
export function usePolymarketCryptoPrices(
  symbols: string[] = [],
  enabled = true,
): Map<string, CryptoPriceUpdate> {
  const [prices, setPrices] = useState<Map<string, CryptoPriceUpdate>>(() => new Map());
  const symbolsKey = symbols.sort().join(',');

  useEffect(() => {
    if (!enabled) return;

    const service = PolymarketRTDSService.getInstance();
    const unsub = service.subscribeCryptoPrices(
      symbolsKey ? symbolsKey.split(',') : [],
      (update) => {
        setPrices(prev => {
          const next = new Map(prev);
          next.set(update.symbol, update);
          return next;
        });
      },
    );

    return unsub;
  }, [symbolsKey, enabled]);

  return prices;
}

// ── Chainlink Crypto Prices Hook ─────────────────────────────────────────────

/**
 * Subscribe to Chainlink crypto prices via Polymarket RTDS.
 * @param symbol - Slash-separated pair, e.g. "eth/usd". Empty = all.
 */
export function usePolymarketChainlinkPrice(
  symbol: string,
  enabled = true,
): CryptoPriceUpdate | null {
  const [price, setPrice] = useState<CryptoPriceUpdate | null>(null);

  useEffect(() => {
    if (!enabled || !symbol) return;

    const service = PolymarketRTDSService.getInstance();
    const unsub = service.subscribeCryptoPricesChainlink(symbol, setPrice);

    return unsub;
  }, [symbol, enabled]);

  return price;
}

// ── Equity Prices Hook ───────────────────────────────────────────────────────

interface EquityPriceResult {
  /** Latest live price tick */
  price: EquityPriceUpdate | null;
  /** Historical snapshot (2 min of data, received once on subscribe) */
  snapshot: EquityPriceSnapshot | null;
  /** Whether the price is carried forward (market closed) */
  isMarketClosed: boolean;
}

/**
 * Subscribe to real-time equity/forex/commodity prices via Polymarket RTDS (Pyth Network).
 * @param symbol - Uppercase symbol, e.g. "AAPL", "EURUSD", "XAUUSD", "WTI"
 */
export function usePolymarketEquityPrice(
  symbol: string,
  enabled = true,
): EquityPriceResult {
  const [price, setPrice] = useState<EquityPriceUpdate | null>(null);
  const [snapshot, setSnapshot] = useState<EquityPriceSnapshot | null>(null);

  useEffect(() => {
    if (!enabled || !symbol) return;

    setPrice(null);
    setSnapshot(null);

    const service = PolymarketRTDSService.getInstance();
    const unsub = service.subscribeEquityPrices(
      symbol,
      (update) => setPrice(update),
      (snap) => setSnapshot(snap),
    );

    return unsub;
  }, [symbol, enabled]);

  return {
    price,
    snapshot,
    isMarketClosed: price?.isCarriedForward ?? false,
  };
}

// ── Comments Hook ────────────────────────────────────────────────────────────

/**
 * Subscribe to real-time comment events via Polymarket RTDS.
 * @param types - Event types to listen for, e.g. ["comment_created"]. Empty = all.
 * @param maxEvents - Max number of events to keep in buffer (default 50)
 */
export function usePolymarketComments(
  types: Array<'comment_created' | 'comment_removed' | 'reaction_created' | 'reaction_removed'> = [],
  enabled = true,
  maxEvents = 50,
): CommentEvent[] {
  const [events, setEvents] = useState<CommentEvent[]>([]);
  const typesKey = types.sort().join(',');

  useEffect(() => {
    if (!enabled) return;

    setEvents([]);

    const service = PolymarketRTDSService.getInstance();
    const unsub = service.subscribeComments(
      typesKey ? typesKey.split(',') as any : [],
      (event) => {
        setEvents(prev => {
          const next = [event, ...prev];
          return next.length > maxEvents ? next.slice(0, maxEvents) : next;
        });
      },
    );

    return unsub;
  }, [typesKey, enabled, maxEvents]);

  return events;
}
