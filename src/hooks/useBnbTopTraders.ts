import { useEffect, useState } from 'react';
import {
  aggregateBnbTrades,
  type BnbTraderStats,
} from '~/utils/bnbTradesAnalytics';
import {
  BNB_USD_FALLBACK,
  fetchBnbTrades,
  fetchBnbUsdPrice,
  resolveBnbPriceUsd,
  fetchBnbTokenDetail,
} from '~/utils/bnbToken';

export default function useBnbTopTraders(
  mint: string | undefined,
  options?: { limit?: number; enabled?: boolean },
) {
  const limit = options?.limit ?? 50;
  const enabled = options?.enabled ?? true;
  const [traders, setTraders] = useState<BnbTraderStats[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mint || !enabled) {
      setTraders([]);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [tradeRows, detail, bnbUsd] = await Promise.all([
          fetchBnbTrades(mint, 500),
          fetchBnbTokenDetail(mint),
          fetchBnbUsdPrice(),
        ]);
        if (cancelled) return;

        const priceUsd = resolveBnbPriceUsd(detail) ?? 0;
        const { topTraders } = aggregateBnbTrades(
          tradeRows,
          bnbUsd ?? BNB_USD_FALLBACK,
          priceUsd,
        );
        setTraders(topTraders.slice(0, limit));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load top traders');
          setTraders([]);
        }
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
  }, [mint, limit, enabled]);

  return { traders, isLoading, error };
}
