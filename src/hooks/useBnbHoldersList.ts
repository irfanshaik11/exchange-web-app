import { useEffect, useState } from 'react';
import {
  aggregateBnbTrades,
  type BnbHolderFromTrades,
} from '~/utils/bnbTradesAnalytics';
import {
  BNB_USD_FALLBACK,
  fetchBnbTrades,
  fetchBnbUsdPrice,
  resolveBnbPriceUsd,
  fetchBnbTokenDetail,
} from '~/utils/bnbToken';

export interface BnbHolderRow extends BnbHolderFromTrades {
  rank: number;
}

export default function useBnbHoldersList(
  mint: string | undefined,
  options?: { limit?: number; enabled?: boolean },
) {
  const limit = options?.limit ?? 50;
  const enabled = options?.enabled ?? true;
  const [holders, setHolders] = useState<BnbHolderRow[]>([]);
  const [totalHolders, setTotalHolders] = useState<number | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mint || !enabled) {
      setHolders([]);
      setTotalHolders(undefined);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [tradeRows, detail, bnbUsd, holdersRes] = await Promise.all([
          fetchBnbTrades(mint, 500),
          fetchBnbTokenDetail(mint),
          fetchBnbUsdPrice(),
          fetch(`/api/bnb-token/holders?mint=${encodeURIComponent(mint)}`).catch(() => null),
        ]);
        if (cancelled) return;

        let upstreamTotal: number | undefined;
        if (holdersRes?.ok) {
          const body = await holdersRes.json().catch(() => ({}));
          const list = Array.isArray(body?.holders) ? body.holders : [];
          if (list.length > 0) {
            setHolders(
              list.slice(0, limit).map((h: any, idx: number) => ({
                rank: idx + 1,
                wallet: String(h.wallet || h.address || '').toLowerCase(),
                balance: Number(h.balance || h.token_balance || 0),
                balanceUsd: Number(h.balance_usd || h.current_value_usd || 0),
                boughtUsd: Number(h.bought_usd || h.total_bought_usd || 0),
                soldUsd: Number(h.sold_usd || h.total_sold_usd || 0),
                buyCount: Number(h.buy_count || 0),
                sellCount: Number(h.sell_count || 0),
                lastTradeAt: h.last_activity_at || h.last_trade_at || '',
              })),
            );
            upstreamTotal = Number(body?.total_holders || body?.holder_count || list.length);
            setTotalHolders(upstreamTotal > 0 ? upstreamTotal : list.length);
            return;
          }
          upstreamTotal = Number(body?.total_holders || body?.holder_count || 0) || undefined;
        }

        const priceUsd = resolveBnbPriceUsd(detail) ?? 0;
        const { holders: derived } = aggregateBnbTrades(
          tradeRows,
          bnbUsd ?? BNB_USD_FALLBACK,
          priceUsd,
        );

        const rows = derived.slice(0, limit).map((h, idx) => ({ ...h, rank: idx + 1 }));
        setHolders(rows);
        setTotalHolders(upstreamTotal ?? (rows.length > 0 ? rows.length : undefined));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load holders');
          setHolders([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [mint, limit, enabled]);

  return { holders, totalHolders, isLoading, error };
}
