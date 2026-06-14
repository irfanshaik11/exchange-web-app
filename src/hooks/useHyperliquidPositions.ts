// src/hooks/useHyperliquidPositions.ts
// User positions — WS push first, REST polling as fallback.
//
// When HyperliquidUserStreamProvider (mounted in _app) has a live webData2
// stream, this hook returns stream data and pauses its polling entirely.
// If the socket drops (or the provider isn't mounted), it transparently
// resumes 5s REST polling. Consumers don't change either way.

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { fetchPositions } from "../utils/hyperliquidApi";
import { useHyperliquidUserStream } from "../contexts/HyperliquidUserStreamContext";
import type { HyperliquidAssetPosition, HyperliquidMarginSummary, HyperliquidPositionRow } from "../utils/hyperliquidTypes";

interface UseHyperliquidPositionsOptions {
  token: string | undefined;
  enabled?: boolean;
  pollInterval?: number; // ms, default 5000
}

interface PositionsState {
  positions: HyperliquidPositionRow[];
  rawPositions: HyperliquidAssetPosition[];
  marginSummary: HyperliquidMarginSummary | null;
  loading: boolean;
  error: string | null;
}

function parsePosition(ap: HyperliquidAssetPosition): HyperliquidPositionRow {
  const pos = ap.position;
  const size = parseFloat(pos.szi);
  return {
    coin: pos.coin,
    side: size >= 0 ? "LONG" : "SHORT",
    size: Math.abs(size),
    entryPrice: parseFloat(pos.entryPx || "0"),
    markPrice: 0, // Filled from mid prices
    liquidationPrice: pos.liquidationPx ? parseFloat(pos.liquidationPx) : null,
    unrealizedPnl: parseFloat(pos.unrealizedPnl),
    returnOnEquity: parseFloat(pos.returnOnEquity),
    leverage: pos.leverage?.value || 1,
    marginUsed: parseFloat(pos.marginUsed),
    fundingSinceOpen: parseFloat(pos.cumFunding?.sinceOpen || "0"),
  };
}

export function useHyperliquidPositions({
  token,
  enabled = true,
  pollInterval = 5000,
}: UseHyperliquidPositionsOptions): PositionsState & { refresh: () => void } {
  const [state, setState] = useState<PositionsState>({
    positions: [],
    rawPositions: [],
    marginSummary: null,
    loading: false,
    error: null,
  });
  const mountedRef = useRef(true);

  // Live push from the app-scoped user-stream provider (inert defaults if unmounted)
  const stream = useHyperliquidUserStream();
  const streamActive = enabled && !!token && stream.wsLive && stream.rawPositions !== null;

  const fetchData = useCallback(async () => {
    if (!token || !enabled) return;

    try {
      const data = await fetchPositions(token) as any;
      if (!mountedRef.current) return;

      const rawPositions = data.positions || [];
      const positions = rawPositions
        .filter((ap: HyperliquidAssetPosition) => parseFloat(ap.position.szi) !== 0)
        .map(parsePosition);

      setState({
        positions,
        rawPositions,
        marginSummary: data.marginSummary || null,
        loading: false,
        error: null,
      });
    } catch (err: any) {
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, loading: false, error: err.message }));
      }
    }
  }, [token, enabled]);

  useEffect(() => {
    mountedRef.current = true;
    // While the WS stream is live, polling is pure waste — pause it. The effect
    // re-runs when streamActive flips, so a dropped socket resumes polling.
    if (!token || !enabled || streamActive) return;

    setState((prev) => ({ ...prev, loading: true }));
    fetchData();

    const interval = setInterval(fetchData, pollInterval);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [token, enabled, pollInterval, fetchData, streamActive]);

  const streamPositions = useMemo(() => {
    if (!streamActive) return [];
    return (stream.rawPositions || [])
      .filter((ap) => parseFloat(ap.position.szi) !== 0)
      .map(parsePosition);
  }, [streamActive, stream.rawPositions]);

  if (streamActive) {
    return {
      positions: streamPositions,
      rawPositions: stream.rawPositions || [],
      marginSummary: stream.marginSummary,
      loading: false,
      error: null,
      refresh: fetchData,
    };
  }

  return { ...state, refresh: fetchData };
}
