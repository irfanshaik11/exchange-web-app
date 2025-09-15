import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

export interface MarketData {
  mint: string;
  price_usd: number;
  market_cap_usd: number;
  volume_usd?: number;
  updated_at: string;
}

interface UseRealtimeMarketDataReturn {
  marketData: Record<string, MarketData>;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useRealtimeMarketData(
  mints: string[],
  opts?: { intervalMs?: number }
): UseRealtimeMarketDataReturn {
  const [marketData, setMarketData] = useState<Record<string, MarketData>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalMs = Math.max(0, opts?.intervalMs ?? 0);

  // Stable key for dependency tracking
  const key = useMemo(() => (Array.isArray(mints) ? mints.join(',') : ''), [mints]);
  const mintsRef = useRef<string[]>(mints);
  useEffect(() => { mintsRef.current = mints; }, [key]);

  const fetchMarketData = useCallback(async (signal?: AbortSignal) => {
    if (mints.length === 0) {
      setMarketData({});
      return;
    }

    setLoading((v) => (v ? v : true));
    setError(null);

    try {
      // Try Codex (GraphQL) as primary
      const doPost = (url: string, addresses: string[]) => fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mints: addresses }),
        signal: signal as any,
      });

      const fullAddrs = Array.isArray(mintsRef.current) ? mintsRef.current : [];
      // For fallback Bitquery/GO service, only pass base58-like mints to avoid upstream errors
      const base58 = fullAddrs.filter((s) => typeof s === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s));

      let response = await doPost('/api/codex/market-data', fullAddrs);
      if (!response.ok) {
        // Fallback to previous aggregator
        response = await doPost('/api/bitquery/market-data', base58);
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch market data (${response.status})`);
      }

      const raw = await response.json();
      // Accept both array and record shapes; normalize to a record keyed by mint
      let normalized: Record<string, MarketData> = {};
      if (Array.isArray(raw)) {
        for (const item of raw as any[]) {
          const addr = (item?.mint || item?.address) as string | undefined;
          if (!addr) continue;
          normalized[addr] = {
            mint: addr,
            price_usd: Number(item?.price_usd ?? item?.priceUSD ?? 0) || 0,
            market_cap_usd: Number(item?.market_cap_usd ?? item?.marketCap ?? 0) || 0,
            volume_usd: Number(item?.volume_usd ?? item?.volume24 ?? 0) || 0,
            updated_at: item?.updated_at || new Date().toISOString(),
          };
        }
      } else if (raw && typeof raw === 'object') {
        // Assume record keyed by address
        const obj = raw as Record<string, any>;
        for (const [addr, v] of Object.entries(obj)) {
          normalized[addr] = {
            mint: addr,
            price_usd: Number((v as any)?.price_usd ?? (v as any)?.priceUSD ?? 0) || 0,
            market_cap_usd: Number((v as any)?.market_cap_usd ?? (v as any)?.marketCap ?? 0) || 0,
            volume_usd: Number((v as any)?.volume_usd ?? (v as any)?.volume24 ?? 0) || 0,
            updated_at: (v as any)?.updated_at || new Date().toISOString(),
          };
        }
      }

      setMarketData(normalized);
    } catch (err: any) {
      // Swallow AbortError silently
      if (err?.name === 'AbortError') return;
      console.warn('Market data fetch warning:', err);
      setError(err.message || 'Failed to fetch market data');
    } finally {
      setLoading((v) => (v ? false : v));
    }
  }, []);

  const refetch = useCallback(() => {
    fetchMarketData();
  }, [fetchMarketData]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchMarketData(ctrl.signal);
    return () => ctrl.abort();
  }, [key]);

  // Optional polling for realtime updates
  useEffect(() => {
    if (!intervalMs || mints.length === 0) return;
    let alive = true;
    let timer: any;
    const tick = () => {
      if (!alive) return;
      const ctrl = new AbortController();
      fetchMarketData(ctrl.signal).finally(() => {
        if (!alive) return;
        timer = setTimeout(tick, intervalMs);
      });
    };
    timer = setTimeout(tick, intervalMs);
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [intervalMs, key]);

  return {
    marketData,
    loading,
    error,
    refetch,
  };
}
