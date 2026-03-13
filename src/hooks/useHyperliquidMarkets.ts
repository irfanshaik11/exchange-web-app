// src/hooks/useHyperliquidMarkets.ts
// Market list with live stats. Fetches meta + asset contexts and merges them.
// Auto-refreshes every 5 seconds for live price/funding data.

import { useEffect, useState, useCallback, useRef } from "react";
import { fetchMetaAndAssetCtxs } from "../utils/hyperliquidApi";
import type { HyperliquidMarketRow, HyperliquidAsset, HyperliquidAssetCtx } from "../utils/hyperliquidTypes";

interface UseHyperliquidMarketsOptions {
  enabled?: boolean;
  refreshInterval?: number;
}

function buildMarketRow(
  asset: HyperliquidAsset,
  ctx: HyperliquidAssetCtx,
  index: number
): HyperliquidMarketRow {
  const markPx = parseFloat(ctx.markPx || "0");
  const prevDayPx = parseFloat(ctx.prevDayPx || "0");
  const change24h = markPx - prevDayPx;
  const change24hPct = prevDayPx > 0 ? (change24h / prevDayPx) * 100 : 0;

  return {
    name: asset.name,
    assetIndex: index,
    markPx,
    prevDayPx,
    change24h,
    change24hPct,
    volume24h: parseFloat(ctx.dayNtlVlm || "0"),
    openInterest: parseFloat(ctx.openInterest || "0"),
    funding: parseFloat(ctx.funding || "0"),
    maxLeverage: asset.maxLeverage,
    szDecimals: asset.szDecimals,
  };
}

export function useHyperliquidMarkets({
  enabled = true,
  refreshInterval = 5000,
}: UseHyperliquidMarketsOptions = {}) {
  const [markets, setMarkets] = useState<HyperliquidMarketRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    try {
      const { meta, assetCtxs } = await fetchMetaAndAssetCtxs();
      if (!mountedRef.current) return;

      const rows = meta.universe.map((asset, i) =>
        buildMarketRow(asset, assetCtxs[i] || {} as HyperliquidAssetCtx, i)
      );

      setMarkets(rows);
      setError(null);
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;

    setLoading(true);
    fetchData();

    const interval = setInterval(fetchData, refreshInterval);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [enabled, refreshInterval, fetchData]);

  const getMarketBySymbol = useCallback(
    (symbol: string) => markets.find((m) => m.name.toUpperCase() === symbol.toUpperCase()),
    [markets]
  );

  return { markets, loading, error, getMarketBySymbol, refresh: fetchData };
}
