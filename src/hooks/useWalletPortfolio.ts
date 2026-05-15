/**
 * useWalletPortfolio
 *
 * Chain-derived portfolio for any pasted wallet address. Wraps:
 *   - REST: /v1/wallet/:addr (summary), /v1/wallet/:addr/positions, /top-tokens, /trades
 *   - WS:   /v1/ws/wallet/:addr — pushes "snapshot" / "position_update" / "new_trade"
 *
 * Resilience comes from useRobustWebSocket (the same hook ArenaWebSocketContext uses):
 *   - 15s app-level ping / 8s pong timeout (keeps GCP LB from idle-killing the socket)
 *   - Reconnect on visibility-change, online, pageshow (bfcache), resume
 *   - Exponential backoff with ±20% jitter (500ms → 30s)
 *
 * On reconnect we re-fetch summary + positions to reconcile any updates we missed
 * while disconnected — same pattern Arena uses.
 *
 * State shape is designed so the existing <Positions> component can render directly.
 * We adapt the chain-derived `WalletPortfolioPosition` into the legacy `PositionRow`
 * shape via `toPositionRow()`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildWalletPortfolioWsUrl,
  getWalletPortfolioPositions,
  getWalletPortfolioSummary,
  type WalletPortfolioPosition,
  type WalletPortfolioSummary,
} from "~/utils/api";
import { useRobustWebSocket } from "~/utils/useRobustWebSocket";
import type { PositionRow } from "~/utils/functions";

/** Adapter: chain-derived position → legacy PositionRow shape so <Positions> can render unchanged. */
export function toPositionRow(p: WalletPortfolioPosition): PositionRow {
  // PnL math: the chain rows store SOL amounts. The component expects USD values.
  // For v1 we surface the explicit USD fields the backend computes (or 0 when missing)
  // so the component formatters work out of the box. Once liveSolPrice is wired through,
  // we can refine bought/sold USD values for tokens the backend doesn't price.
  const remaining = p.remaining_tokens;
  const remainingUsd = p.remaining_value_usd || 0;
  const realizedUsd = p.realized_pnl_usd || 0;
  const unrealizedUsd = p.unrealized_pnl_usd || 0;
  const totalPnlUsd = realizedUsd + unrealizedUsd;
  const boughtUsd = p.bought_usd_value || 0;
  const soldUsd = p.sold_usd_value || 0;

  // Carry the raw chain SOL amounts through as untyped extras on PositionRow.
  // The portfolio enrichment effect (portfolio.tsx ~line 612) reads these via
  // `(p as any).bought_sol` etc. to recompute USD-denominated cost basis +
  // PnL percentages using live SOL price — the chain endpoint returns
  // bought_usd_value/sold_usd_value as 0, so the enrichment is the only
  // source of correct % math. Without these fields plumbed through, every
  // pnl% renders as 0.0000%.
  const row: PositionRow = {
    tokenAddress: p.token_mint,
    pairAddress: undefined,
    blockchain: "solana",
    launchpad: p.launchpad_protocol ?? null,
    imageUrl: p.image_url ?? null,
    tokenName: p.token_name ?? null,
    tokenSymbol: p.token_symbol ?? null,
    bought: p.bought_tokens,
    boughtUsdValue: boughtUsd,
    sold: p.sold_tokens,
    soldUsdValue: soldUsd,
    remaining,
    remainingUsdValue: remainingUsd,
    pnl: totalPnlUsd,
    pnlPercentage: boughtUsd > 0 ? (totalPnlUsd / boughtUsd) * 100 : 0,
    currentPrice: p.current_price_usd ?? undefined,
    actions: "",
    avgBuyMarketCap: undefined,
    avgSellMarketCap: undefined,
  };
  (row as any).bought_sol = p.bought_sol;
  (row as any).sold_sol = p.sold_sol;
  (row as any).realized_pnl_sol = p.realized_pnl_sol;
  // total_outflow_sol: indexer-migration-023 chain-truth cost basis (swap +
  // all fees). When > 0, enrichment uses this instead of bought_sol for the
  // USD cost-basis calculation, since bought_sol misses 70-95% of the real
  // cost on small trades with normal network fees. Falls back to bought_sol
  // when 0 (no migration-aware trades for this position yet).
  (row as any).total_outflow_sol = (p as any).total_outflow_sol ?? 0;
  return row;
}

type WalletWsMessage =
  | { type: "snapshot"; data: WalletPortfolioPosition[]; timestamp: number }
  | { type: "position_update"; data: { wallet_address: string; token_mint: string; total_bought_tokens?: number; total_bought_sol?: number; total_sold_tokens?: number; total_sold_sol?: number; remaining_tokens?: number; buy_count?: number; sell_count?: number; last_activity_at?: string }; timestamp: number }
  | { type: "new_trade"; data: { token_mint: string; trader_wallet: string; is_buy: boolean }; timestamp: number }
  | { type: "pong"; timestamp: number };

export type UseWalletPortfolioState = {
  /** Active positions adapted to PositionRow shape. */
  positions: PositionRow[];
  /** Raw chain-derived positions if you need fields PositionRow drops (sniper flag etc.). */
  rawPositions: WalletPortfolioPosition[];
  /** Headline metrics. Null until first fetch resolves. */
  summary: WalletPortfolioSummary | null;
  /** REST loading flag (initial fetch + refetch on reconnect). */
  loading: boolean;
  /** Last error from REST or WS-side fetches. */
  error: string | null;
  /** WS connection state for UI indicator. */
  isConnected: boolean;
  reconnectAttempts: number;
  /** Force a fresh fetch of summary + positions. */
  refetch: () => Promise<void>;
};

/**
 * Hook returns live portfolio state for a wallet. Pass `null` / empty string to disable.
 * Returns immediately; first fetch and WS connect happen in effects.
 */
export function useWalletPortfolio(walletAddress: string | null | undefined): UseWalletPortfolioState {
  const [rawPositions, setRawPositions] = useState<WalletPortfolioPosition[]>([]);
  const [summary, setSummary] = useState<WalletPortfolioSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ref the latest positions so the WS message handler can merge against current state
  // without taking positions as a useCallback dep (which would churn the WS).
  const positionsRef = useRef<WalletPortfolioPosition[]>([]);
  positionsRef.current = rawPositions;

  // Stable address with simple validation. Avoids triggering effects on noise input.
  const address = useMemo(() => {
    if (!walletAddress) return "";
    const v = walletAddress.trim();
    return v.length >= 32 && v.length <= 44 ? v : "";
  }, [walletAddress]);

  // Tracks the current in-flight fetch so navigating between wallets doesn't race.
  const inflightRef = useRef<AbortController | null>(null);

  // Debounces refetches triggered by `new_trade` WS messages — a burst of trades
  // shouldn't fire a request per trade. ~600ms is short enough that the user feels
  // the update, long enough to coalesce a multi-trade batch (e.g., DCA hitting
  // multiple positions back-to-back).
  const refetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mints we authoritatively removed via a 100% sell WS event. The indexer's
  // wallet_holder_positions aggregator can lag the solana_trades insert by
  // 2-5 seconds (measured), and token-service's L2 Redis cache can hold a
  // pre-sell snapshot for another 2s. During that window, a fetchAll() may
  // return the stale aggregate row for a mint we already know is closed —
  // and setRawPositions(stale) would resurrect the position visually,
  // causing a sell-completes-then-position-reappears flicker that requires
  // a manual page refresh to clear.
  //
  // Solution: when WS broadcasts a sell that brings remaining to <= DUST,
  // we drop the row optimistically AND mark the mint here with an expiry.
  // Any subsequent fetchAll within the expiry window filters out re-includes
  // of this mint. After the window, the mint can be re-added normally
  // (covers the case where the user re-buys the same token later).
  const removedMintsRef = useRef<Map<string, number>>(new Map()); // mint -> expiresAt (ms)
  const REMOVED_MINT_GUARD_MS = 10_000;

  // Mirror image of removedMintsRef for the BUY direction. When a WS new_trade
  // BUY event synthesizes a brand-new position row, we mark the mint here.
  // The indexer's aggregator + token-service L2 cache lag the solana_trades
  // insert by 2-5s, so a fetchAll fired shortly after the buy may return
  // positions WITHOUT the new mint — and setRawPositions(stale) would wipe
  // the synthesized row, causing the "buy comes in then disappears" flicker
  // until manual refresh. The guard retains the synthetic row in the fetchAll
  // path if the API response doesn't yet include the just-bought mint.
  const addedMintsRef = useRef<Map<string, number>>(new Map()); // mint -> expiresAt (ms)
  const ADDED_MINT_GUARD_MS = 10_000;

  // ─── REST: initial fetch + refetch on demand ────────────────────────────────
  const fetchAll = useCallback(async (): Promise<void> => {
    if (!address) return;
    inflightRef.current?.abort();
    const ac = new AbortController();
    inflightRef.current = ac;
    setLoading(true);
    setError(null);
    try {
      const [s, p] = await Promise.all([
        getWalletPortfolioSummary(address, ac.signal),
        getWalletPortfolioPositions(address, { signal: ac.signal }),
      ]);
      // Bail if a newer fetch superseded this one mid-flight.
      if (ac.signal.aborted) return;
      setSummary(s);

      // Stale-resurrection guard: if a mint was just authoritatively removed
      // by a WS sell event, reject this REST response's row for it. The
      // indexer's aggregator + token-service L2 cache can lag by several
      // seconds, so a fetch fired shortly after a 100% sell may return the
      // pre-sell snapshot. We trust the WS event over the lagged REST.
      const now = Date.now();
      // Sweep expired entries while we're here (avoids unbounded growth).
      for (const [mint, expiresAt] of removedMintsRef.current) {
        if (now >= expiresAt) removedMintsRef.current.delete(mint);
      }
      for (const [mint, expiresAt] of addedMintsRef.current) {
        if (now >= expiresAt) addedMintsRef.current.delete(mint);
      }

      // Step 1: drop API rows for mints we authoritatively removed
      const filtered = removedMintsRef.current.size === 0
        ? p.positions
        : p.positions.filter((pos) => {
            const expiresAt = removedMintsRef.current.get(pos.token_mint);
            return !(expiresAt && now < expiresAt);
          });

      // Step 2: retain optimistically-synthesized buys that the API hasn't
      // caught up on yet. For any mint in addedMintsRef that's missing from
      // the API response, pull the synthetic row forward from the current
      // local state so the row doesn't disappear before the aggregator
      // converges.
      let supplemented = filtered;
      if (addedMintsRef.current.size > 0) {
        const apiMints = new Set(filtered.map((pos) => pos.token_mint));
        const retained: WalletPortfolioPosition[] = [];
        for (const [mint, expiresAt] of addedMintsRef.current) {
          if (now < expiresAt && !apiMints.has(mint)) {
            const existing = positionsRef.current.find((p) => p.token_mint === mint);
            if (existing) retained.push(existing);
          }
        }
        if (retained.length > 0) {
          // Prepend retained (newer-first) so they appear at the top of
          // the resulting list — matches the natural newest-first ordering
          // of the API response and the user's expectation for fresh buys.
          supplemented = [...retained, ...filtered];
        }
      }

      setRawPositions(supplemented);
    } catch (e: unknown) {
      if ((e as { name?: string })?.name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Failed to load wallet");
      }
    } finally {
      if (inflightRef.current === ac) {
        inflightRef.current = null;
        setLoading(false);
      }
    }
  }, [address]);

  // Reset state when address changes; kick off the first fetch.
  // CRITICAL: clear state on EVERY address change, not just empty address.
  // Without the clear, switching primary wallet leaves the previous wallet's
  // positions visible until the new fetch resolves (~500ms-1.5s) — feels like
  // "didn't update until refresh" to users. Clearing first means they see a
  // brief loading state instead of stale data.
  useEffect(() => {
    inflightRef.current?.abort();
    inflightRef.current = null;
    setRawPositions([]);
    setSummary(null);
    setError(null);
    // Clear both guards on wallet switch — they're keyed by mint and scoped
    // to "this wallet's recent activity." Carrying them across to a new
    // wallet could incorrectly filter or retain positions for the new
    // wallet's data.
    removedMintsRef.current.clear();
    addedMintsRef.current.clear();
    if (!address) {
      setLoading(false);
      return;
    }
    void fetchAll();
    return () => {
      inflightRef.current?.abort();
    };
  }, [address, fetchAll]);

  // ─── WS: live updates ───────────────────────────────────────────────────────
  const handleMessage = useCallback((raw: unknown) => {
    const msg = raw as WalletWsMessage;
    if (!msg || typeof msg !== "object") return;

    switch (msg.type) {
      case "snapshot": {
        // Server-side snapshot on connect — replace state wholesale.
        if (Array.isArray(msg.data)) setRawPositions(msg.data);
        break;
      }
      case "position_update": {
        // Aggregate update from holder_positions NOTIFY. Merge by mint.
        const upd = msg.data;
        if (!upd?.token_mint) return;
        setRawPositions((prev) => {
          const idx = prev.findIndex((p) => p.token_mint === upd.token_mint);
          // Lightweight merge — apply numeric deltas where the payload provides them.
          const next: WalletPortfolioPosition = {
            ...(idx >= 0
              ? prev[idx]
              : ({
                  wallet_address: address,
                  token_mint: upd.token_mint,
                  bought_tokens: 0,
                  sold_tokens: 0,
                  remaining_tokens: 0,
                  bought_sol: 0,
                  sold_sol: 0,
                  buy_count: 0,
                  sell_count: 0,
                  remaining_value_usd: 0,
                  bought_usd_value: 0,
                  sold_usd_value: 0,
                  realized_pnl_sol: 0,
                  realized_pnl_usd: 0,
                  unrealized_pnl_usd: 0,
                  is_sniper: false,
                  is_insider: false,
                  is_dev: false,
                  is_kol: false,
                  is_smart_money: false,
                  is_bundler: false,
                  holder_type: "regular",
                } as WalletPortfolioPosition)),
            bought_tokens: upd.total_bought_tokens ?? prev[idx]?.bought_tokens ?? 0,
            sold_tokens: upd.total_sold_tokens ?? prev[idx]?.sold_tokens ?? 0,
            bought_sol: upd.total_bought_sol ?? prev[idx]?.bought_sol ?? 0,
            sold_sol: upd.total_sold_sol ?? prev[idx]?.sold_sol ?? 0,
            buy_count: upd.buy_count ?? prev[idx]?.buy_count ?? 0,
            sell_count: upd.sell_count ?? prev[idx]?.sell_count ?? 0,
            remaining_tokens:
              upd.remaining_tokens ??
              (upd.total_bought_tokens ?? prev[idx]?.bought_tokens ?? 0) -
                (upd.total_sold_tokens ?? prev[idx]?.sold_tokens ?? 0),
            last_activity_at: upd.last_activity_at ?? prev[idx]?.last_activity_at ?? null,
          };
          // If the wallet sold to dust, REMOVE the row entirely instead of
          // keeping it with remaining_tokens=0. Otherwise downstream consumers
          // that don't filter dust (e.g. Top 100 sorted by USD value) keep
          // showing the just-closed position.
          const DUST = 0.001;
          if (next.remaining_tokens <= DUST) {
            if (idx >= 0) {
              const copy = prev.slice();
              copy.splice(idx, 1);
              return copy;
            }
            return prev; // never had it; ignore the dust update
          }
          if (idx >= 0) {
            const copy = prev.slice();
            copy[idx] = next;
            return copy;
          }
          return [next, ...prev];
        });
        break;
      }
      case "new_trade": {
        // Live trade for this wallet just landed in solana_trades. Two paths
        // for max responsiveness:
        //   (1) OPTIMISTIC UPDATE — use the WS message payload itself to
        //       update rawPositions instantly, well before any REST refetch.
        //       Sub-100ms. UI reflects the trade immediately.
        //   (2) AUTHORITATIVE REFETCH — fire fetchAll() on a leading-edge
        //       debounce. First trade fires immediately; subsequent trades
        //       within 600ms are coalesced. fetchAll() returns the indexer's
        //       canonical aggregates and overwrites our optimistic guess.
        const t = msg.data as {
          token_mint?: string;
          is_buy?: boolean;
          sol_amount?: number | null;
          token_amount?: number | null;
          price_usd?: number | null;
        };
        if (t?.token_mint) {
          const tokenAmt = Number(t.token_amount) || 0;
          const solAmt = Number(t.sol_amount) || 0;
          const isBuy = !!t.is_buy;
          const DUST = 0.001;

          // A fresh BUY for a mint means the aggregate has just been updated
          // with new data for it — clear any "recently removed" guard so the
          // next fetchAll's row for this mint doesn't get filtered out. This
          // covers the sell-then-rebuy-within-10s sequence: the guard was
          // installed by the prior 100% sell to reject the stale pre-sell
          // aggregate, but a subsequent buy makes the aggregate current
          // again, so the guard would otherwise incorrectly suppress the
          // legitimate re-entry.
          if (isBuy) {
            removedMintsRef.current.delete(t.token_mint);
          }
          // Track new buys so the retention guard in fetchAll keeps the
          // synthesized row alive even if an early refetch returns the
          // pre-buy aggregate (indexer lag). The guard self-expires after
          // ADDED_MINT_GUARD_MS so a stale row can't outlive the indexer
          // catching up. Only set on buys — sells don't synthesize new rows.
          if (isBuy) {
            addedMintsRef.current.set(
              t.token_mint,
              Date.now() + ADDED_MINT_GUARD_MS,
            );
          }

          setRawPositions((prev) => {
            const idx = prev.findIndex((p) => p.token_mint === t.token_mint);
            if (idx >= 0) {
              const existing = prev[idx];
              const newBoughtTokens = existing.bought_tokens + (isBuy ? tokenAmt : 0);
              const newSoldTokens = existing.sold_tokens + (isBuy ? 0 : tokenAmt);
              const newBoughtSol = existing.bought_sol + (isBuy ? solAmt : 0);
              const newSoldSol = existing.sold_sol + (isBuy ? 0 : solAmt);
              const newRemaining = newBoughtTokens - newSoldTokens;

              // 100% sell guard: when a SELL drives remaining to <= DUST, the
              // WS event is unambiguous — position closed. Drop the row
              // immediately AND register the mint as authoritatively-removed
              // so any subsequent fetchAll() that returns the pre-sell stale
              // aggregate (indexer's wallet_holder_positions can lag the
              // solana_trades insert by 2-5s) is filtered. This is the only
              // place we proactively evict a row; partial sells and buys
              // still keep the row alive for accuracy under concurrent trades.
              if (!isBuy && newRemaining <= DUST) {
                removedMintsRef.current.set(
                  t.token_mint!,
                  Date.now() + REMOVED_MINT_GUARD_MS,
                );
                // Clear the additive guard for this mint — the position is
                // closed, no point retaining a synthetic row for it.
                addedMintsRef.current.delete(t.token_mint!);
                const copy = prev.slice();
                copy.splice(idx, 1);
                return copy;
              }

              // Optimistic update for partial sells / buys — never *drops* a row
              // here. The WS payload carries a single trade, not the full
              // aggregate, and `existing.{bought,sold}_tokens` may be a beat
              // behind. Letting a partial-sell new_trade evict a row can
              // falsely close a still-active position when buys/sells overlap.
              const next: WalletPortfolioPosition = {
                ...existing,
                bought_tokens: newBoughtTokens,
                sold_tokens: newSoldTokens,
                bought_sol: newBoughtSol,
                sold_sol: newSoldSol,
                buy_count: existing.buy_count + (isBuy ? 1 : 0),
                sell_count: existing.sell_count + (isBuy ? 0 : 1),
                remaining_tokens: newRemaining,
                last_activity_at: new Date().toISOString(),
                current_price_usd: t.price_usd ?? existing.current_price_usd,
              };
              const copy = prev.slice();
              copy[idx] = next;
              return copy;
            }
            // Buy of a token we hadn't seen yet — synthesize a row so it shows
            // instantly. fetchAll will replace with authoritative data shortly.
            if (!isBuy || tokenAmt <= DUST) return prev;
            const synthetic: WalletPortfolioPosition = {
              wallet_address: address,
              token_mint: t.token_mint!,
              bought_tokens: tokenAmt,
              sold_tokens: 0,
              remaining_tokens: tokenAmt,
              bought_sol: solAmt,
              sold_sol: 0,
              buy_count: 1,
              sell_count: 0,
              first_buy_at: new Date().toISOString(),
              last_activity_at: new Date().toISOString(),
              remaining_value_usd: tokenAmt * (t.price_usd ?? 0),
              bought_usd_value: 0,
              sold_usd_value: 0,
              realized_pnl_sol: 0,
              realized_pnl_usd: 0,
              unrealized_pnl_usd: 0,
              current_price_usd: t.price_usd ?? null,
              is_sniper: false,
              is_insider: false,
              is_dev: false,
              is_kol: false,
              is_smart_money: false,
              is_bundler: false,
              holder_type: "regular",
            };
            return [synthetic, ...prev];
          });
        }

        // Authoritative refetch on TRAILING-edge debounce: wait 2s after the
        // last new_trade in a burst before refetching. The optimistic update
        // above is already on screen; the only purpose of fetchAll() here is
        // to reconcile against the indexer's canonical aggregates.
        //
        // CRITICAL: this MUST be trailing-edge, not leading-edge. Reason: when
        // a trade fires, it lands in `solana_trades` immediately, but the
        // `wallet_holder_positions` aggregate row that powers
        // /v1/wallet/{addr}/positions can lag the trade insert by hundreds of
        // ms to several seconds (and even longer when indexer parsers stall
        // or batch-flush at slow cadence). A leading-edge fetchAll fires
        // immediately, hits the API before the aggregate has updated, and
        // gets back STALE data — then setRawPositions(p.positions) clobbers
        // the optimistic update with that stale list. From the user's POV
        // the position row "reverts" within a second of trading and stays
        // that way until they manually refresh — which happens to work only
        // because by the time they click refresh, the aggregate has caught up.
        // Trailing-edge with 2s buffer gives the indexer aggregator enough
        // headroom that fetchAll's response is fresh and merges cleanly.
        if (refetchDebounceRef.current) {
          clearTimeout(refetchDebounceRef.current);
        }
        refetchDebounceRef.current = setTimeout(() => {
          refetchDebounceRef.current = null;
          void fetchAll();
        }, 2000);
        break;
      }
      case "pong":
      default:
        break;
    }
  }, [address, fetchAll]);

  // Reconcile on reconnect (Arena pattern): hit REST again to absorb anything we missed.
  const handleReconnect = useCallback(() => {
    if (!address) return;
    void fetchAll();
  }, [address, fetchAll]);

  const wsUrl = useMemo(() => (address ? buildWalletPortfolioWsUrl(address) : null), [address]);

  const ws = useRobustWebSocket({
    url: wsUrl,
    enabled: !!address,
    onMessage: handleMessage,
    onReconnect: handleReconnect,
    logTag: "WalletPortfolio WS",
  });

  // Mirror ws.isConnected onto a ref so the polling tick can read it without
  // re-creating the interval on every connection state change.
  const isConnectedRef = useRef(ws.isConnected);
  isConnectedRef.current = ws.isConnected;

  // Polling fallback for live updates. The WS-driven `new_trade` path is the
  // primary signal (fires within ~1s of trade confirmation). When the WS is
  // healthy, *every* on-chain trade for this wallet flows through pg-listener
  // → BroadcastTrade → leading-edge debounced refetch — so the 20s poll is
  // pure redundancy in that path and we skip it.
  //
  // The poll only does real work when WS is disconnected (reconnect window
  // after primary-wallet switch, indexer-VM rotation, transient network blip).
  // 20s cadence is conservative enough to be cheap, tight enough that users
  // don't feel stuck. Pause when document hidden so background tabs don't poll.
  useEffect(() => {
    if (!address) return;
    const POLL_MS = 20000;
    const tick = () => {
      if (isConnectedRef.current) return; // WS is up; new_trade drives updates
      if (typeof document !== "undefined" && document.hidden) return;
      void fetchAll().catch(() => {});
    };
    const interval = setInterval(tick, POLL_MS);
    return () => clearInterval(interval);
  }, [address, fetchAll]);

  // ─── Derive PositionRow array for consumers ─────────────────────────────────
  const positions = useMemo(() => rawPositions.map(toPositionRow), [rawPositions]);

  return {
    positions,
    rawPositions,
    summary,
    loading,
    error,
    isConnected: ws.isConnected,
    reconnectAttempts: ws.reconnectAttempts,
    refetch: fetchAll,
  };
}
