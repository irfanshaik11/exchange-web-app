// src/hooks/useHyperliquidCandles.ts
// OHLCV candle data: REST snapshot + live WS updates.
// Output format compatible with BackendOHLCItem for TradingView chart.

import { useRef, useEffect, useState, useCallback } from "react";
import { subscribeToChannel } from "./useHyperliquidWebSocket";
import { fetchCandles } from "../utils/hyperliquidApi";
import type { HyperliquidCandle } from "../utils/hyperliquidTypes";

export interface HyperliquidOHLCItem {
  unix_time: number;  // Seconds (not ms)
  o: number;
  h: number;
  l: number;
  c: number;
  v_usd: number;
}

// Map HL intervals to seconds for time calculations
const INTERVAL_SECONDS: Record<string, number> = {
  "1m": 60,
  "3m": 180,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "2h": 7200,
  "4h": 14400,
  "8h": 28800,
  "12h": 43200,
  "1d": 86400,
  "3d": 259200,
  "1w": 604800,
  "1M": 2592000,
};

interface UseHyperliquidCandlesOptions {
  coin: string | undefined;
  interval: string;
  enabled?: boolean;
}

function hlCandleToOHLC(c: HyperliquidCandle): HyperliquidOHLCItem {
  return {
    unix_time: Math.floor(c.t / 1000),
    o: parseFloat(c.o),
    h: parseFloat(c.h),
    l: parseFloat(c.l),
    c: parseFloat(c.c),
    v_usd: parseFloat(c.v),
  };
}

export function useHyperliquidCandles({
  coin,
  interval,
  enabled = true,
}: UseHyperliquidCandlesOptions) {
  const [candles, setCandles] = useState<HyperliquidOHLCItem[]>([]);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  // Fetch historical candles
  const fetchHistory = useCallback(async () => {
    if (!coin || !enabled) return;

    setLoading(true);
    try {
      const intervalSec = INTERVAL_SECONDS[interval] || 3600;
      const candleCount = 300;
      const startTime = Date.now() - candleCount * intervalSec * 1000;

      const rawCandles = await fetchCandles(coin, interval, startTime);
      if (mountedRef.current && Array.isArray(rawCandles)) {
        setCandles(rawCandles.map(hlCandleToOHLC));
      }
    } catch (err) {
      console.error("[HL Candles] Fetch error:", err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [coin, interval, enabled]);

  useEffect(() => {
    mountedRef.current = true;
    fetchHistory();

    if (!coin || !enabled) return;

    // Subscribe to live candle updates
    const unsubscribe = subscribeToChannel(
      "candle",
      (msg) => {
        const data = msg.data;
        if (!data || data.s?.toUpperCase() !== coin.toUpperCase()) return;

        const updatedCandle = hlCandleToOHLC(data);

        setCandles((prev) => {
          if (prev.length === 0) return [updatedCandle];

          const last = prev[prev.length - 1];
          if (last.unix_time === updatedCandle.unix_time) {
            // Update last candle in-place
            return [...prev.slice(0, -1), updatedCandle];
          } else if (updatedCandle.unix_time > last.unix_time) {
            // New candle
            return [...prev, updatedCandle];
          }
          return prev;
        });
      },
      { type: "candle", coin, interval }
    );

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [coin, interval, enabled, fetchHistory]);

  return { candles, loading };
}
