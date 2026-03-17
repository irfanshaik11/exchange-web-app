// src/hooks/useHyperliquidTrades.ts
// Real-time trade feed with deduplication.

import { useRef, useEffect, useState, useCallback } from "react";
import { subscribeToChannel } from "./useHyperliquidWebSocket";
import { fetchRecentTrades } from "../utils/hyperliquidApi";
import type { HyperliquidTrade } from "../utils/hyperliquidTypes";

interface UseHyperliquidTradesOptions {
  coin: string | undefined;
  maxTrades?: number;
  enabled?: boolean;
}

export function useHyperliquidTrades({
  coin,
  maxTrades = 100,
  enabled = true,
}: UseHyperliquidTradesOptions) {
  const [trades, setTrades] = useState<HyperliquidTrade[]>([]);
  const seenRef = useRef(new Set<number>());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    seenRef.current.clear();

    if (!coin || !enabled) {
      setTrades([]);
      return;
    }

    // Fetch initial trades
    fetchRecentTrades(coin)
      .then((data) => {
        if (mountedRef.current && Array.isArray(data)) {
          data.forEach((t) => seenRef.current.add(t.tid));
          setTrades(data.slice(0, maxTrades));
        }
      })
      .catch(() => {});

    // Subscribe to WS trade updates
    const unsubscribe = subscribeToChannel(
      "trades",
      (msg) => {
        const data = msg.data;
        if (!Array.isArray(data)) return;

        const newTrades = data.filter(
          (t: HyperliquidTrade) =>
            t.coin?.toUpperCase() === coin.toUpperCase() &&
            !seenRef.current.has(t.tid)
        );

        if (newTrades.length > 0) {
          newTrades.forEach((t: HyperliquidTrade) => seenRef.current.add(t.tid));

          // Cap seen set
          if (seenRef.current.size > 2000) {
            const arr = [...seenRef.current];
            seenRef.current = new Set(arr.slice(-1000));
          }

          setTrades((prev) => [...newTrades, ...prev].slice(0, maxTrades));
        }
      },
      { type: "trades", coin }
    );

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [coin, enabled, maxTrades]);

  return trades;
}
