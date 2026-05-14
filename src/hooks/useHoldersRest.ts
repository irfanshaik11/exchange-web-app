import { useEffect, useRef, useState } from "react";
import { env } from "~/env";

// BANDAID hook — REST-driven holders for the trade page. Mirrors the WS-snapshot
// fields from useSolanaTokenWebSocket so HoldersTable can swap branches with
// minimal mapping. We'll move back to the WS approach once that path is healthy.
// Re-grep `BANDAID` to find every line touched by this change.

const TOKEN_SERVICE_URL = (env.NEXT_PUBLIC_GO_SERVICE_URL || "").replace(/\/$/, "");

// Matches GET /v1/token/{mint}/holders?limit=N — see
// exchange-token-service/internal/http/holders_endpoint.go:63-109.
export interface RestHolder {
  rank: number;
  wallet_address: string;
  ata_address: string;
  token_balance: number;

  total_bought_tokens: number;
  total_bought_sol: number;
  total_bought_usd: number;
  buy_count: number;
  avg_buy_price_usd: number;
  avg_buy_mcap_usd: number;

  total_sold_tokens: number;
  total_sold_sol: number;
  total_sold_usd: number;
  sell_count: number;
  avg_sell_price_usd: number;
  avg_sell_mcap_usd: number;

  current_value_usd: number;
  realized_pnl_usd: number;
  unrealized_pnl_usd: number;
  total_pnl_usd: number;

  is_dev: boolean;
  is_sniper: boolean;
  is_insider: boolean;
  is_bundler: boolean;
  is_kol: boolean;

  sol_balance_lamports: number;
  last_activity_at?: string;
  frozen: boolean;
}

export interface RestHoldersResponse {
  total_holders: number;
  current_price_usd: number;
  current_market_cap_usd: number;
  sol_price_usd: number;
  decimals: number;
  fetched_at: string;
  holders: RestHolder[];
}

export interface UseHoldersRestResult {
  totalHolders: number | undefined;
  holders: RestHolder[];
  solPriceUsd: number;
  decimals: number;
  isLoading: boolean;
  error: string | null;
}

const POLL_MS = 15_000; // matches server-side cache TTL in holders_endpoint.go:43

export default function useHoldersRest(
  mint: string | undefined,
  options?: { limit?: number; enabled?: boolean },
): UseHoldersRestResult {
  const limit = options?.limit ?? 100;
  const enabled = options?.enabled ?? true;

  const [totalHolders, setTotalHolders] = useState<number | undefined>(undefined);
  const [holders, setHolders] = useState<RestHolder[]>([]);
  const [solPriceUsd, setSolPriceUsd] = useState<number>(0);
  const [decimals, setDecimals] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  // Track whether we've ever successfully populated `holders` for the current
  // mint. Background polls do NOT flip `isLoading` — that would trigger the
  // "Loading holders..." UI flash every 15s. The flag resets on mint change
  // via the effect's cleanup. Pattern: stale-while-revalidate.
  const hasDataRef = useRef<boolean>(false);

  useEffect(() => {
    if (!mint || !enabled || !TOKEN_SERVICE_URL) {
      setTotalHolders(undefined);
      setHolders([]);
      hasDataRef.current = false;
      return;
    }

    // BANDAID: Reset state on EVERY mint change so the previous token's
    // count + rows don't bleed into the new token's view while the first
    // fetch is in flight. Without this, totalHolders/holders stay stale
    // until line ~125 writes the new response (~100ms-3s later).
    setTotalHolders(undefined);
    setHolders([]);
    // New mint → previous data is stale; treat next fetch as "initial".
    hasDataRef.current = false;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // BANDAID: track consecutive errors so we can retry FAST on transient
    // upstream failures (Helius DAS rate-limits, timeouts, etc) instead of
    // waiting the full 15s poll interval. Resets on every success.
    // Backoff schedule: 2s → 5s → 10s → 15s (POLL_MS) thereafter.
    let consecutiveErrors = 0;
    const errorBackoffs = [2_000, 5_000, 10_000];

    const fetchOnce = async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Only show "loading" on the first fetch for this mint; subsequent polls
      // are silent background refreshes.
      if (!hasDataRef.current) setIsLoading(true);
      try {
        const url = `${TOKEN_SERVICE_URL}/v1/token/${mint}/holders?limit=${limit}`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
          throw new Error(`holders fetch ${res.status}`);
        }
        const body = (await res.json()) as RestHoldersResponse;
        if (cancelled) return;
        setTotalHolders(body.total_holders);
        setHolders(body.holders ?? []);
        setSolPriceUsd(body.sol_price_usd ?? 0);
        setDecimals(body.decimals ?? 0);
        setError(null);
        hasDataRef.current = true;
        consecutiveErrors = 0;
      } catch (err) {
        if (cancelled) return;
        // AbortError is expected on mint changes / unmount — don't surface it.
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "failed to load holders");
        consecutiveErrors += 1;
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    const nextDelay = () => {
      if (consecutiveErrors === 0) return POLL_MS;
      const idx = Math.min(consecutiveErrors - 1, errorBackoffs.length - 1);
      return errorBackoffs[idx];
    };

    const schedule = () => {
      timer = setTimeout(async () => {
        await fetchOnce();
        if (!cancelled) schedule();
      }, nextDelay());
    };

    fetchOnce().then(() => {
      if (!cancelled) schedule();
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [mint, limit, enabled]);

  return { totalHolders, holders, solPriceUsd, decimals, isLoading, error };
}
