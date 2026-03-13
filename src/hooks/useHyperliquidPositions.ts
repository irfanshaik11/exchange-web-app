// src/hooks/useHyperliquidPositions.ts
// User positions via Interstate backend (auth required).
// Polls positions periodically for real-time PnL updates.

import { useEffect, useState, useCallback, useRef } from "react";
import { fetchPositions } from "../utils/hyperliquidApi";
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
    if (!token || !enabled) return;

    setState((prev) => ({ ...prev, loading: true }));
    fetchData();

    const interval = setInterval(fetchData, pollInterval);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [token, enabled, pollInterval, fetchData]);

  return { ...state, refresh: fetchData };
}
