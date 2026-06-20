import { useEffect, useRef, useState } from 'react';
import {
  computeBnbTradeWindowStats,
  type BnbTradeRow,
} from '~/utils/bnbTradesAnalytics';
import {
  BNB_USD_FALLBACK,
  type BnbOhlcvTimeRange,
  type BnbOhlcvWindowStats,
  fetchBnbTrades,
  fetchBnbUsdPrice,
} from '~/utils/bnbToken';

const WINDOWS: BnbOhlcvTimeRange[] = ['5m', '1h', '6h', '24h'];

export type BnbTradeVolumeStatsMap = Partial<Record<BnbOhlcvTimeRange, BnbOhlcvWindowStats>>;

export default function useBnbTradeVolumeStats(
  mint: string | undefined,
  options?: { enabled?: boolean },
): {
  statsByWindow: BnbTradeVolumeStatsMap;
  isLoading: boolean;
} {
  const enabled = options?.enabled ?? true;
  const [statsByWindow, setStatsByWindow] = useState<BnbTradeVolumeStatsMap>({});
  const [isLoading, setIsLoading] = useState(false);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    hasLoadedRef.current = false;

    if (!mint || !enabled) {
      setStatsByWindow({});
      return;
    }

    let cancelled = false;

    const load = async () => {
      if (!hasLoadedRef.current) setIsLoading(true);
      try {
        const [trades, bnbUsd] = await Promise.all([
          fetchBnbTrades(mint, 500),
          fetchBnbUsdPrice(),
        ]);
        if (cancelled) return;

        const next: BnbTradeVolumeStatsMap = {};
        for (const window of WINDOWS) {
          next[window] = computeBnbTradeWindowStats(
            trades as BnbTradeRow[],
            window,
            bnbUsd ?? BNB_USD_FALLBACK,
          );
        }
        setStatsByWindow(next);
        hasLoadedRef.current = true;
      } catch {
        if (!cancelled && !hasLoadedRef.current) setStatsByWindow({});
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    const id = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [mint, enabled]);

  return { statsByWindow, isLoading };
}
