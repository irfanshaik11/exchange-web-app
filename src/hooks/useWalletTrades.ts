/**
 * useWalletTrades
 *
 * Fetches chain-derived trade history for a wallet from token-service
 * (/v1/wallet/:addr/trades). Designed for the Activity tab on the portfolio page.
 *
 * Behavior:
 *   - Returns chain trades when the wallet trader index is built and the endpoint
 *     returns 200.
 *   - When the endpoint returns 503 (index still building), sets `isIndexing: true`
 *     and `trades: []`. Caller is expected to fall back to a different source while
 *     this state is active.
 *   - Aborts in-flight requests when the wallet address changes — no race between
 *     wallets when the user switches primary wallets rapidly.
 *
 * Disabled when `enabled` is false (e.g., when the Activity tab isn't active) so
 * we don't waste a request per page load. Re-fires when the user enables the tab
 * and the address is known.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildWalletPortfolioWsUrl,
  getWalletPortfolioTrades,
  type WalletPortfolioTrade,
} from "~/utils/api";
import { useRobustWebSocket } from "~/utils/useRobustWebSocket";

export interface UseWalletTradesState {
  /** Raw chain-derived trades (newest first). Adapt to TradeRow at the call site. */
  trades: WalletPortfolioTrade[];
  /** True while the initial fetch is in flight. */
  loading: boolean;
  /** Last error message if a non-503 fetch error occurred. */
  error: string | null;
  /** True when the endpoint returned 503 — the index is being built. */
  isIndexing: boolean;
  /** Cursor for the next page if more trades are available. */
  nextCursor: string | null;
  /** Force a fresh fetch from the start. */
  refetch: () => Promise<void>;
  /** Append the next page of trades. No-op when there's no next cursor. */
  loadMore: () => Promise<void>;
}

const DEFAULT_LIMIT = 200;

export function useWalletTrades(
  walletAddress: string | null | undefined,
  enabled: boolean,
  limit: number = DEFAULT_LIMIT,
): UseWalletTradesState {
  const [trades, setTrades] = useState<WalletPortfolioTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const lastKeyRef = useRef<string>("");

  const address =
    walletAddress && walletAddress.trim().length >= 32 && walletAddress.trim().length <= 44
      ? walletAddress.trim()
      : "";

  const fetchPage = useCallback(
    async (cursor: string | null, append: boolean): Promise<void> => {
      if (!address) return;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      if (!append) setLoading(true);
      setError(null);

      try {
        const resp = await getWalletPortfolioTrades(address, {
          cursor: cursor ?? undefined,
          limit,
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;

        // Successful 200: clear indexing flag, populate trades.
        setIsIndexing(false);
        setTrades((prev) => (append ? [...prev, ...resp.trades] : resp.trades));
        setNextCursor(resp.next_cursor);
      } catch (e: unknown) {
        if ((e as { name?: string })?.name === "AbortError") return;
        const msg = e instanceof Error ? e.message : "Failed to load wallet trades";

        // Detect 503 / "indexing" message → set the indexing flag instead of an error.
        // The handler returns HTTP 503 with `error: "trade history is initializing..."`
        // when idx_solana_trades_trader_created hasn't been built yet.
        const looksLikeIndexing =
          msg.includes("HTTP 503") ||
          msg.toLowerCase().includes("initializing") ||
          msg.toLowerCase().includes("trader index");

        if (looksLikeIndexing) {
          setIsIndexing(true);
          setError(null);
          if (!append) {
            setTrades([]);
            setNextCursor(null);
          }
        } else {
          setError(msg);
        }
      } finally {
        if (abortRef.current === ac) {
          abortRef.current = null;
          if (!append) setLoading(false);
        }
      }
    },
    [address, limit],
  );

  const refetch = useCallback(async (): Promise<void> => {
    await fetchPage(null, false);
  }, [fetchPage]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (!nextCursor) return;
    await fetchPage(nextCursor, true);
  }, [fetchPage, nextCursor]);

  // Reset + fetch when address changes or the hook gets enabled.
  useEffect(() => {
    const key = `${address}|${enabled ? "1" : "0"}`;
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;

    if (!enabled || !address) {
      // Disabled or no address — clear state so stale data doesn't leak.
      abortRef.current?.abort();
      abortRef.current = null;
      setTrades([]);
      setError(null);
      setIsIndexing(false);
      setNextCursor(null);
      setLoading(false);
      return;
    }

    void fetchPage(null, false);
    return () => {
      abortRef.current?.abort();
    };
  }, [address, enabled, fetchPage]);

  // ─── WS: live updates ───────────────────────────────────────────────────────
  // Subscribe to the same /v1/ws/wallet/{addr} stream that useWalletPortfolio
  // uses. On every `new_trade` message, optimistically prepend a synthetic
  // trade row to the array (the WS payload has all the fields we need for the
  // Activity row), then schedule a TRAILING-edge debounced refetch (2s buffer)
  // so the indexer's canonical row data backfills missing fields like
  // market_cap_usd, price_sol, etc. — same pattern as useWalletPortfolio.
  //
  // Why trailing-edge: see useWalletPortfolio.ts. A leading-edge fetch fires
  // before the indexer's aggregate has caught up, returns stale data, and
  // overwrites the optimistic prepend.
  const refetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMessage = useCallback((raw: unknown) => {
    const msg = raw as { type?: string; data?: any };
    if (!msg || typeof msg !== "object" || msg.type !== "new_trade") return;
    const t = msg.data;
    if (!t?.signature || !t?.token_mint) return;

    // Optimistic prepend. Dedupe by signature so re-broadcasts don't double-add.
    setTrades((prev) => {
      if (prev.some((x) => x.signature === t.signature)) return prev;
      const synthetic: WalletPortfolioTrade = {
        signature: String(t.signature),
        block_time: t.block_time ?? null,
        created_at: typeof t.block_time === "string" && t.block_time
          ? t.block_time
          : new Date().toISOString(),
        trader_wallet: String(t.trader_wallet ?? address),
        token_mint: String(t.token_mint),
        is_buy: !!t.is_buy,
        sol_amount: Number(t.sol_amount) || 0,
        token_amount: Number(t.token_amount) || 0,
        price_sol: 0,
        price_usd: Number(t.price_usd) || 0,
        market_cap_usd: 0,
        launchpad_protocol: null,
        pool_address: null,
        fee_lamports: null,
        quote_mint: null,
      };
      return [synthetic, ...prev];
    });

    // Trailing-edge refetch: 2s after the last new_trade in a burst.
    if (refetchDebounceRef.current) {
      clearTimeout(refetchDebounceRef.current);
    }
    refetchDebounceRef.current = setTimeout(() => {
      refetchDebounceRef.current = null;
      void fetchPage(null, false);
    }, 2000);
  }, [address, fetchPage]);

  // Reconcile on reconnect — REST fetch picks up anything missed while disconnected.
  const handleReconnect = useCallback(() => {
    if (!enabled || !address) return;
    void fetchPage(null, false);
  }, [enabled, address, fetchPage]);

  const wsUrl = useMemo(
    () => (enabled && address ? buildWalletPortfolioWsUrl(address) : null),
    [enabled, address],
  );

  useRobustWebSocket({
    url: wsUrl,
    enabled: !!(enabled && address),
    onMessage: handleMessage,
    onReconnect: handleReconnect,
    logTag: "WalletTrades WS",
  });

  return {
    trades,
    loading,
    error,
    isIndexing,
    nextCursor,
    refetch,
    loadMore,
  };
}
