import { useEffect, useRef, useState } from 'react';
import { KOL_ADDRESS_MAP } from '~/utils/kolLookup';
import {
  aggregateBnbTrades,
  countBnbKolFromTrades,
  countBnbUniqueTradersFromTrades,
} from '~/utils/bnbTradesAnalytics';
import {
  fetchBnbDevTokensByCreator,
  fetchBnbHolderCount,
  fetchBnbTrades,
  fetchBnbUsdPrice,
  resolveBnbCreatorWallet,
  resolveBnbDevMigrationStats,
  resolveBnbHolderCount,
  resolveBnbPriceUsd,
} from '~/utils/bnbToken';

export interface BnbTradeHeaderMetrics {
  holderCount: number | undefined;
  devTokensCreated: number;
  devTokensMigrated: number;
  kolCount: number;
  isLoading: boolean;
}

async function fetchBnbTokenDetailProxy(mint: string): Promise<any | null> {
  try {
    const response = await fetch(`/api/bnb-token/detail?mint=${encodeURIComponent(mint)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export default function useBnbTradeHeaderMetrics(
  mint: string | undefined,
  options?: { enabled?: boolean },
): BnbTradeHeaderMetrics {
  const enabled = options?.enabled ?? true;
  const [holderCount, setHolderCount] = useState<number | undefined>(undefined);
  const [devTokensCreated, setDevTokensCreated] = useState(0);
  const [devTokensMigrated, setDevTokensMigrated] = useState(0);
  const [kolCount, setKolCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    hasLoadedRef.current = false;
    setHolderCount(undefined);
    setDevTokensCreated(0);
    setDevTokensMigrated(0);
    setKolCount(0);

    if (!mint || !enabled) {
      hasLoadedRef.current = false;
      return;
    }

    let cancelled = false;

    const load = async () => {
      if (!hasLoadedRef.current) setIsLoading(true);
      try {
        const [detail, tradeRows, bnbUsd, holdersRes, holderCountDirect] = await Promise.all([
          fetchBnbTokenDetailProxy(mint),
          fetchBnbTrades(mint, 500),
          fetchBnbUsdPrice(),
          fetch(`/api/bnb-token/holders?mint=${encodeURIComponent(mint)}`).catch(() => null),
          fetchBnbHolderCount(mint),
        ]);
        if (cancelled) return;

        let resolvedHolders = holderCountDirect ?? resolveBnbHolderCount(detail);
        if (holdersRes?.ok) {
          const body = await holdersRes.json().catch(() => ({}));
          const fromApi = Number(body?.total_holders || body?.holder_count || 0);
          const listLen = Array.isArray(body?.holders) ? body.holders.length : 0;
          if (fromApi > 0) resolvedHolders = fromApi;
          else if (listLen > 0 && (resolvedHolders == null || resolvedHolders <= 0)) {
            resolvedHolders = listLen;
          }
        }

        const priceUsd = resolveBnbPriceUsd(detail) ?? 0;
        const { holders: derivedHolders } = aggregateBnbTrades(
          tradeRows,
          bnbUsd ?? 600,
          priceUsd,
        );
        if (resolvedHolders == null || resolvedHolders <= 0) {
          if (derivedHolders.length > 0) {
            resolvedHolders = derivedHolders.length;
          } else {
            const uniqueTraders = countBnbUniqueTradersFromTrades(tradeRows);
            resolvedHolders = uniqueTraders > 0 ? uniqueTraders : undefined;
          }
        }

        setHolderCount(resolvedHolders);
        setKolCount(countBnbKolFromTrades(tradeRows, KOL_ADDRESS_MAP));

        const creator = resolveBnbCreatorWallet(detail);
        if (creator) {
          const devTokens = await fetchBnbDevTokensByCreator(creator, {
            includeMint: mint,
            includeToken: detail,
            scanLimit: 200,
          });
          if (!cancelled) {
            const stats = resolveBnbDevMigrationStats(devTokens);
            setDevTokensCreated(stats.created);
            setDevTokensMigrated(stats.migrated);
          }
        } else {
          setDevTokensCreated(0);
          setDevTokensMigrated(0);
        }
        hasLoadedRef.current = true;
      } catch {
        if (!cancelled && !hasLoadedRef.current) {
          setHolderCount(undefined);
          setDevTokensCreated(0);
          setDevTokensMigrated(0);
          setKolCount(0);
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
  }, [mint, enabled]);

  return {
    holderCount,
    devTokensCreated,
    devTokensMigrated,
    kolCount,
    isLoading,
  };
}
