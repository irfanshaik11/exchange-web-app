// src/hooks/useHyperliquidOrderBook.ts
// L2 order book with real-time WebSocket updates.
// Performance: useRef + requestAnimationFrame (not useState) for high-frequency updates.

import { useRef, useEffect, useCallback, useState } from "react";
import { subscribeToChannel } from "./useHyperliquidWebSocket";
import { fetchL2Book } from "../utils/hyperliquidApi";
import type { HyperliquidL2Level } from "../utils/hyperliquidTypes";

export interface OrderBookData {
  bids: HyperliquidL2Level[];
  asks: HyperliquidL2Level[];
  spread: number;
  spreadPct: number;
  midPrice: number;
  lastUpdated: number;
}

interface UseHyperliquidOrderBookOptions {
  coin: string | undefined;
  maxLevels?: number;
  enabled?: boolean;
}

export function useHyperliquidOrderBook({
  coin,
  maxLevels = 20,
  enabled = true,
}: UseHyperliquidOrderBookOptions) {
  const bookRef = useRef<OrderBookData>({
    bids: [],
    asks: [],
    spread: 0,
    spreadPct: 0,
    midPrice: 0,
    lastUpdated: 0,
  });
  const [book, setBook] = useState<OrderBookData>(bookRef.current);
  const rafRef = useRef<number>(0);
  const mountedRef = useRef(true);

  const scheduleUpdate = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      if (mountedRef.current) {
        setBook({ ...bookRef.current });
      }
    });
  }, []);

  const processBook = useCallback(
    (bids: HyperliquidL2Level[], asks: HyperliquidL2Level[]) => {
      const trimmedBids = bids.slice(0, maxLevels);
      const trimmedAsks = asks.slice(0, maxLevels);

      const bestBid = trimmedBids.length > 0 ? parseFloat(trimmedBids[0].px) : 0;
      const bestAsk = trimmedAsks.length > 0 ? parseFloat(trimmedAsks[0].px) : 0;
      const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
      const midPrice = bestAsk > 0 && bestBid > 0 ? (bestAsk + bestBid) / 2 : bestBid || bestAsk;

      bookRef.current = {
        bids: trimmedBids,
        asks: trimmedAsks,
        spread,
        spreadPct: midPrice > 0 ? (spread / midPrice) * 100 : 0,
        midPrice,
        lastUpdated: Date.now(),
      };
      scheduleUpdate();
    },
    [maxLevels, scheduleUpdate]
  );

  useEffect(() => {
    mountedRef.current = true;
    if (!coin || !enabled) return;

    // Fetch initial snapshot
    fetchL2Book(coin, 3)
      .then((data) => {
        if (mountedRef.current && data?.levels) {
          processBook(data.levels[0] || [], data.levels[1] || []);
        }
      })
      .catch(() => {});

    // Subscribe to WS updates
    const unsubscribe = subscribeToChannel(
      "l2Book",
      (msg) => {
        const data = msg.data;
        if (data?.coin?.toUpperCase() === coin.toUpperCase() && data?.levels) {
          processBook(data.levels[0] || [], data.levels[1] || []);
        }
      },
      { type: "l2Book", coin }
    );

    return () => {
      mountedRef.current = false;
      unsubscribe();
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [coin, enabled, processBook]);

  return book;
}
