// src/hooks/useHyperliquidMarkets.ts
// Market list with live stats across EVERY perp DEX.
//
// Two refresh loops with different cadences:
// - Main universe (crypto perps): direct Hyperliquid fetch every 5s — the
//   high-traffic markets where staleness is most visible.
// - HIP-3 builder DEXs (commodities/FX/equities/...): via the Interstate
//   backend aggregate (/all-dex-ctxs, 60s server cache) every 60s, so a
//   thousand clients cost Hyperliquid one fetch pass per minute, not N.
//
// HIP-3 assets are named "{dex}:{coin}"; rows carry `dex` + `displaySymbol`
// so the UI can group and render them cleanly.

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { fetchMetaAndAssetCtxs, fetchAllDexCtxs } from "../utils/hyperliquidApi";
import type { HyperliquidMarketRow, HyperliquidAsset, HyperliquidAssetCtx } from "../utils/hyperliquidTypes";

interface UseHyperliquidMarketsOptions {
  enabled?: boolean;
  refreshInterval?: number;
}

const HIP3_REFRESH_MS = 60_000;

function buildMarketRow(
  asset: HyperliquidAsset,
  ctx: HyperliquidAssetCtx,
  index: number,
  dex?: string
): HyperliquidMarketRow {
  const markPx = parseFloat(ctx.markPx || "0");
  const prevDayPx = parseFloat(ctx.prevDayPx || "0");
  const change24h = markPx - prevDayPx;
  const change24hPct = prevDayPx > 0 ? (change24h / prevDayPx) * 100 : 0;

  // HIP-3 universes may name assets "dex:COIN" or bare "COIN" — normalize to
  // a canonical full name and a bare display symbol.
  let name = asset.name;
  let displaySymbol = asset.name;
  if (dex) {
    if (name.includes(":")) {
      displaySymbol = name.split(":")[1] || name;
    } else {
      name = `${dex}:${name}`;
    }
  }

  return {
    name,
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
    dex: dex || undefined,
    displaySymbol,
  };
}

export function useHyperliquidMarkets({
  enabled = true,
  refreshInterval = 5000,
}: UseHyperliquidMarketsOptions = {}) {
  const [mainMarkets, setMainMarkets] = useState<HyperliquidMarketRow[]>([]);
  const [hip3Markets, setHip3Markets] = useState<HyperliquidMarketRow[]>([]);
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

      setMainMarkets(rows);
      setError(null);
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [enabled]);

  const fetchHip3 = useCallback(async () => {
    if (!enabled) return;
    try {
      const entries = await fetchAllDexCtxs();
      if (!mountedRef.current) return;

      const rows: HyperliquidMarketRow[] = [];
      for (const entry of entries) {
        if (!entry?.dex) continue; // main universe handled by the 5s loop
        const [meta, ctxs] = entry.data || [];
        if (!meta?.universe) continue;
        meta.universe.forEach((asset: HyperliquidAsset, i: number) => {
          rows.push(buildMarketRow(asset, (ctxs?.[i] || {}) as HyperliquidAssetCtx, i, entry.dex));
        });
      }
      setHip3Markets(rows);
    } catch {
      // HIP-3 list is additive — a failed fetch just leaves crypto perps
    }
  }, [enabled]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;

    setLoading(true);
    fetchData();
    fetchHip3();

    const interval = setInterval(fetchData, refreshInterval);
    const hip3Interval = setInterval(fetchHip3, HIP3_REFRESH_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      clearInterval(hip3Interval);
    };
  }, [enabled, refreshInterval, fetchData, fetchHip3]);

  const markets = useMemo(
    () => [...mainMarkets, ...hip3Markets],
    [mainMarkets, hip3Markets]
  );

  const getMarketBySymbol = useCallback(
    (symbol: string) => markets.find((m) => m.name.toUpperCase() === symbol.toUpperCase()),
    [markets]
  );

  return { markets, loading, error, getMarketBySymbol, refresh: fetchData };
}
