/**
 * Pending Trade Marker Store
 *
 * localStorage-backed pub/sub store for optimistic buy/sell chart markers.
 * Markers are written here the moment the user clicks Buy/Sell, before the
 * trade is sent on-chain. The TradeActionPanel chart reads from this store
 * (via usePendingTradeMarkers) and merges the rows into its existing
 * `tradeDataForChart` array, so the marker appears instantly.
 *
 * Reconciliation against real WS trades is handled at the merge layer in
 * `src/pages/trade/[id].tsx` — this module is purely a state container.
 */

import { Connection } from "@solana/web3.js";

const STORAGE_KEY = "interstate_pending_trade_markers_v1";

// TTL constants
const PENDING_HARD_TTL_MS = 5 * 60 * 1000; // 5min — covers tab-killed-mid-flight zombies
const NO_SIG_CONFIRMED_TTL_MS = 60 * 1000; // 60s — pathological "confirmed but no signature"

export interface PendingTradeMarker {
  id: string; // local primary key, e.g. `pend_<uuid>`
  mint: string;
  walletAddress: string; // lowercased
  side: "buy" | "sell";
  amountSol?: number;
  amountToken?: number;
  priceUsd?: number;
  timestamp: number; // ms epoch
  signature?: string;
  status: "pending" | "confirmed";
  createdAt: number; // ms epoch
}

type Listener = () => void;

// Stable empty array reference for getServerSnapshot and after-clear states.
const EMPTY: readonly PendingTradeMarker[] = Object.freeze([]);

let cache: PendingTradeMarker[] = readFromStorage();

const listeners = new Set<Listener>();

// Per-slot debounce: maps `<mint>|<wallet>|<side>` to the timestamp of the
// most recent addPendingTrade call for that slot. Repeat calls within
// SLOT_DEDUPE_WINDOW_MS are silently ignored — guards against rapid
// double-clicks and any accidental double-firing of the click handler.
const SLOT_DEDUPE_WINDOW_MS = 200;
const lastSlotAdd = new Map<string, number>();
const slotKey = (mint: string, wallet: string, side: string) =>
  `${mint}|${wallet}|${side}`;

function readFromStorage(): PendingTradeMarker[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidRow);
  } catch {
    return [];
  }
}

function isValidRow(r: unknown): r is PendingTradeMarker {
  if (!r || typeof r !== "object") return false;
  const row = r as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.mint === "string" &&
    typeof row.walletAddress === "string" &&
    (row.side === "buy" || row.side === "sell") &&
    typeof row.timestamp === "number" &&
    typeof row.createdAt === "number" &&
    (row.status === "pending" || row.status === "confirmed")
  );
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch (err) {
    // Quota exceeded / private mode / disabled — degrade to in-memory only.
    // Log once at warn so devs see it, but don't crash the UI.
    console.warn(
      "[pendingTradeMarkers] localStorage write failed, falling back to in-memory:",
      err,
    );
  }
}

function notify() {
  listeners.forEach((l) => {
    try {
      l();
    } catch (err) {
      console.error("[pendingTradeMarkers] listener error:", err);
    }
  });
}

function pruneStale() {
  const now = Date.now();
  const next = cache.filter((row) => {
    // Hard 5min cap on pending rows (tab-killed-mid-flight zombies).
    if (row.status === "pending" && now - row.createdAt > PENDING_HARD_TTL_MS) {
      return false;
    }
    // Pathological case: confirmed but no signature ever stamped.
    if (
      row.status === "confirmed" &&
      !row.signature &&
      now - row.createdAt > NO_SIG_CONFIRMED_TTL_MS
    ) {
      return false;
    }
    // Confirmed-with-signature rows are kept indefinitely. They're cleaned up
    // by the reconciliation effect in [id].tsx when the WS echoes the trade.
    return true;
  });
  if (next.length !== cache.length) {
    cache = next;
    persist();
  }
}

// Public API

export function getSnapshot(): readonly PendingTradeMarker[] {
  return cache;
}

export function getServerSnapshot(): readonly PendingTradeMarker[] {
  return EMPTY;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function addPendingTrade(row: PendingTradeMarker): void {
  // H3 — slot debounce. If we've added a row for this exact slot within the
  // last 200ms, this is almost certainly a double-fired click handler (or
  // StrictMode dev double-invocation). Drop the duplicate to keep the
  // invariant of "one row per slot per click."
  const now = Date.now();
  const key = slotKey(row.mint, row.walletAddress, row.side);
  const lastAdd = lastSlotAdd.get(key);
  if (lastAdd !== undefined && now - lastAdd < SLOT_DEDUPE_WINDOW_MS) {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.log("[pendingTradeMarkers] add suppressed (slot debounce)", {
        slot: key,
        deltaMs: now - lastAdd,
      });
    }
    return;
  }
  lastSlotAdd.set(key, now);

  // Slot-aware eviction — but ONLY for pending rows. Confirmed rows from
  // prior successful trades on the same slot are kept as permanent local
  // backups for their own markers. Without this exception, two consecutive
  // sells would erase the first sell's row when the second click fires; if
  // the WS history later forgets the first sell (rotation, buffer cap, fresh
  // reconnect that doesn't include it), the marker for the first trade
  // disappears. With the exception, every successful trade has its own
  // persistent localStorage row, and the merge memo's per-signature dedupe
  // ensures no double-rendering when WS does still have the trade.
  //
  // The original zombie-prevention purpose is still served: a zombie is by
  // definition a pending row whose success/error path never completed, and
  // pending-status rows for the same slot ARE evicted here.
  cache = cache.filter(
    (r) =>
      !(
        r.mint === row.mint &&
        r.walletAddress === row.walletAddress &&
        r.side === row.side &&
        r.status === "pending"
      ),
  );
  cache = [...cache, row];
  pruneStale(); // fires its own persist if it removed anything
  // pruneStale only persists when it changes the array; we still need to
  // persist the new row even if nothing was pruned.
  persist();
  notify();
  if (typeof window !== "undefined") {
    // TEMP diagnostic — remove once optimistic markers verified in the wild.
    // eslint-disable-next-line no-console
    console.log("[pendingTradeMarkers] add", {
      id: row.id,
      mint: row.mint,
      wallet: row.walletAddress,
      side: row.side,
      cacheSize: cache.length,
    });
  }
}

export function updatePendingTrade(
  id: string,
  patch: Partial<Omit<PendingTradeMarker, "id">>,
): void {
  let changed = false;
  cache = cache.map((r) => {
    if (r.id !== id) return r;
    changed = true;
    return { ...r, ...patch };
  });
  if (!changed) return;
  persist();
  notify();
  if (typeof window !== "undefined") {
    // eslint-disable-next-line no-console
    console.log("[pendingTradeMarkers] update", { id, patch });
  }
}

export function removePendingTrade(id: string): void {
  const next = cache.filter((r) => r.id !== id);
  if (next.length === cache.length) return;
  cache = next;
  persist();
  notify();
  if (typeof window !== "undefined") {
    // eslint-disable-next-line no-console
    console.log("[pendingTradeMarkers] remove", { id, cacheSize: cache.length });
  }
}

// ---------------------------------------------------------------------------
// High-level helpers for trade call sites.
//
// Each Solana buy/sell call site funnels through the same 3-step lifecycle:
//   1. Before the trade fires:   const { id, inserted } = insertOptimisticMarker(...)
//   2. On success (txHash):      if (inserted) confirmOptimisticMarker(id, txHash)
//   3. On error:                 if (inserted) rollbackOptimisticMarker(id)
//
// Wrap your trade call in `try { ... } catch { ... }` and put steps 2/3 in the
// success path / catch respectively. The helpers handle missing wallets, missing
// mints, and the 200ms slot-debounce internally — no need to guard at call sites.
// ---------------------------------------------------------------------------

export interface InsertOptimisticMarkerArgs {
  mint: string | null | undefined;
  walletAddress: string | null | undefined;
  side: "buy" | "sell";
  amountSol?: number;
  amountToken?: number;
  priceUsd?: number;
}

export interface InsertOptimisticMarkerResult {
  id: string;
  inserted: boolean;
}

/**
 * Insert an optimistic chart marker for a fresh Buy/Sell click.
 * Returns `{ id, inserted: false }` if the wallet or mint is missing — the
 * chart filter would never match anyway, so we don't waste a row.
 */
export function insertOptimisticMarker(
  args: InsertOptimisticMarkerArgs,
): InsertOptimisticMarkerResult {
  if (!args.walletAddress || !args.mint) {
    return { id: "", inserted: false };
  }
  const id =
    `pend_${
      (typeof crypto !== "undefined" && crypto.randomUUID?.()) ||
      Math.random().toString(36).slice(2)
    }`;
  // 1.5s timestamp backshift to make sure we land inside the chart's cached
  // visible-range `to` value (real WS trades arrive with indexer-stamped
  // timestamps slightly in the past for the same reason).
  addPendingTrade({
    id,
    mint: args.mint,
    walletAddress: args.walletAddress.toLowerCase(),
    side: args.side,
    amountSol: args.amountSol,
    amountToken: args.amountToken,
    priceUsd: args.priceUsd,
    timestamp: Date.now() - 1500,
    status: "pending",
    createdAt: Date.now(),
  });
  return { id, inserted: true };
}

/**
 * Stamp the on-chain signature on an optimistic marker once the trade succeeds.
 * The merge memo in [id].tsx uses the signature as the dedupe key against real
 * WS trades.
 *
 * **If `signature` is falsy, the marker is REMOVED** — a missing signature
 * after the trade function returned means the trade didn't actually go through
 * (typically a soft pre-flight validation failure like "insufficient SOL" or
 * "low liquidity" where the function returns an error result rather than
 * throwing). In those cases we don't want a phantom marker hanging around
 * until the 5-min TTL — the user got an error toast and shouldn't see a marker.
 */
export function confirmOptimisticMarker(
  id: string,
  signature: string | null | undefined,
): void {
  if (!id) return;
  if (!signature) {
    removePendingTrade(id);
    return;
  }
  updatePendingTrade(id, { signature, status: "confirmed" });
}

/**
 * Remove an optimistic marker on trade failure. The user already gets the
 * failure toast from the trade flow; the marker simply disappears.
 */
export function rollbackOptimisticMarker(id: string): void {
  if (!id) return;
  removePendingTrade(id);
}

/**
 * After a marker is confirmed with a txHash, verify on-chain that the
 * transaction actually succeeded. If `meta.err` is set (slippage failure,
 * insufficient balance at execution time, etc.), remove the marker so the
 * user doesn't see a phantom trade on the chart.
 *
 * This is fire-and-forget — callers should NOT await it in the hot path.
 */
export function verifyTxAndRollbackMarker(
  markerId: string,
  txHash: string,
  rpcUrl?: string,
): void {
  if (!markerId || !txHash) return;
  const url =
    rpcUrl ||
    (typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_SOLANA_RPC
      : undefined) ||
    "https://api.mainnet-beta.solana.com";

  const connection = new Connection(url, "confirmed");

  // Wait for confirmation then check meta.err
  Promise.resolve()
    .then(async () => {
      // Give the network a moment to finalise the tx
      await connection.confirmTransaction(txHash, "confirmed").catch(() => {
        // timeout / ws failure — fall through to getTransaction
      });

      const tx = await connection.getTransaction(txHash, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });

      if (tx?.meta?.err) {
        console.warn(
          "[pendingTradeMarkers] tx failed on-chain, removing marker",
          { markerId, txHash, err: tx.meta.err },
        );
        removePendingTrade(markerId);
      }
    })
    .catch((err) => {
      console.warn(
        "[pendingTradeMarkers] verifyTx failed, leaving marker for TTL cleanup",
        err,
      );
    });
}

// Cross-tab sync: when another tab writes to our key, re-read and notify.
// Browser spec: `storage` event fires only on *other* tabs, never on the
// writing tab itself — no infinite loop.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    cache = readFromStorage();
    notify();
  });

  // Prune on module load so stale rows from prior sessions don't linger.
  pruneStale();
}
