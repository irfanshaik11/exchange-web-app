/**
 * Shared module-level cache for token supply hints piggy-backed onto the
 * OHLCV WebSocket snapshot message (`message.supply`). Populated wherever
 * the OHLCV WS is consumed: prefetch manager, the main chart WS handler,
 * and the alternate hook. Read by `useTokenSupply` to skip the
 * /v1/supply HTTP round-trip when WS already delivered the value.
 *
 * Why this exists: the OHLCV WS opens BEFORE the trade page mounts (it's
 * prewarmed on SearchModal hover), so by the time `useTokenSupply` runs
 * the supply field has typically already arrived. Consulting this cache
 * first eliminates a 100-500ms HTTP step on the chart-load critical path.
 *
 * Wire format from the backend (matches /v1/supply response exactly):
 *   { mint, total_supply, circulating_supply, decimals }
 *
 * Fields are decimal STRINGS (not numbers) to match the HTTP shape so
 * `useTokenSupply` can parse both with the same `parseFloat` path.
 *
 * Backend sets the field with `omitempty` — when the indexer hasn't
 * populated `tokens.circulating_supply` yet, or the token is pump.fun
 * (RPC owns reserve subtraction), the snapshot omits supply entirely
 * and this cache stays empty for that mint. Callers must treat a `null`
 * return as "fall back to HTTP", which is the existing behavior.
 *
 * TTL matches the token-service Redis cache (60s). Supply changes only
 * on rare on-chain events (graduation, burns), so 60s of staleness is
 * invisible while still long enough to serve repeated mounts of the
 * trade-header during a session.
 */

export interface WsSupplyData {
  mint: string;
  total_supply: string;
  circulating_supply: string;
  decimals: number;
}

interface CacheEntry {
  data: WsSupplyData;
  receivedAt: number;
}

const TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

/**
 * Store a supply payload received from the OHLCV WS snapshot.
 * Quietly ignores invalid payloads (missing fields, non-positive
 * circulating supply) so callers can pass `message.supply` directly
 * without type guards.
 */
export function setWsSupply(mint: string, payload: unknown): void {
  if (!mint || typeof mint !== "string" || mint.length < 20) return;
  if (!payload || typeof payload !== "object") return;
  const p = payload as Partial<WsSupplyData>;
  if (!p.circulating_supply || typeof p.circulating_supply !== "string") return;
  const cs = parseFloat(p.circulating_supply);
  if (!Number.isFinite(cs) || cs <= 0) return;
  if (typeof p.decimals !== "number" || p.decimals <= 0) return;

  cache.set(mint, {
    data: {
      mint,
      total_supply: p.total_supply || p.circulating_supply,
      circulating_supply: p.circulating_supply,
      decimals: p.decimals,
    },
    receivedAt: Date.now(),
  });
}

/**
 * Look up a previously-cached supply payload for the mint. Returns null
 * if absent or expired (TTL evicts on read so consumers don't see stale
 * data when the WS connection dropped without a refresh).
 */
export function getWsSupply(mint: string): WsSupplyData | null {
  if (!mint) return null;
  const entry = cache.get(mint);
  if (!entry) return null;
  if (Date.now() - entry.receivedAt > TTL_MS) {
    cache.delete(mint);
    return null;
  }
  return entry.data;
}

/**
 * Explicit drop — exposed for tests and for a future "user clicked
 * refresh" path that wants to force a fresh HTTP fetch.
 */
export function clearWsSupply(mint: string): void {
  if (mint) cache.delete(mint);
}
