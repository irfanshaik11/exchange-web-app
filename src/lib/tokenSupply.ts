/**
 * Batch token-supply lookup utilities.
 *
 * Why this exists: the indexer pre-computes `market_cap_usd` for every
 * token in the search/pulse/trending payloads using a hardcoded total
 * supply of 1B. That assumption holds for pump.fun tokens that haven't
 * migrated yet, but breaks the moment a token graduates to a DEX (the
 * bonding-curve portion is burned and circulating supply drops to a
 * fraction of 1B). The post-migration row keeps the 1B-derived mcap in
 * the indexer's stored value, so the UI shows e.g. $766K when the real
 * mcap is $151. The trade page already handles this correctly via the
 * single-mint `useTokenSupply` hook calling /v1/supply/{mint}.
 *
 * For list views (search, pulse, trending), making N round trips is too
 * expensive — this module wraps the batch endpoint and returns a Map
 * keyed by mint so callers can recompute mcap = price * circulating in
 * a single pass over their result set.
 *
 * Until the indexer fix lands and stores real supply in `tokens`, this
 * is the minimum-coupling fix path.
 */

const GO_SERVICE_URL = process.env.NEXT_PUBLIC_GO_SERVICE_URL || "";

// Mirror the backend cap (supplyBatchMaxMints in trade_endpoints.go).
// Splitting in the client is preferable to silent server-side truncation.
const BATCH_MAX_MINTS = 100;

interface BatchSupplyResponse {
  supplies: Record<
    string,
    {
      mint: string;
      total_supply: string;
      circulating_supply: string;
      decimals: number;
    }
  >;
  errors?: Record<string, string>;
}

/**
 * fetchBatchSupplies returns a Map<mint, circulatingSupply> for the
 * provided mints. Mints whose RPC fetch failed (or were missing from the
 * response) are simply absent from the returned map — caller should
 * treat that as "fall back to whatever you had".
 *
 * Pass an AbortSignal so this aborts cleanly when the user fires a new
 * search / unmounts the modal.
 */
export async function fetchBatchSupplies(
  mints: string[],
  signal?: AbortSignal,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (mints.length === 0) return out;

  // Dedup before sending — saves bytes and matches the server's own
  // dedup pass. Solana mints are case-sensitive base58 so a plain Set works.
  const unique = Array.from(new Set(mints));

  // Chunk if over the server cap. In practice search returns ≤100 so
  // this is a no-op on the search path, but it's cheap insurance for
  // future callers (e.g. a Pulse table with 200 rows).
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += BATCH_MAX_MINTS) {
    chunks.push(unique.slice(i, i + BATCH_MAX_MINTS));
  }

  // Fire chunks in parallel — server caps inner concurrency at 20, so
  // multiple chunks each fanning to 20 is fine for our scale.
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await fetch(`${GO_SERVICE_URL}/v1/supply/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mints: chunk }),
          signal,
        });
        if (!res.ok) return;
        const data: BatchSupplyResponse = await res.json();
        for (const [mint, info] of Object.entries(data.supplies || {})) {
          const n = parseFloat(info.circulating_supply);
          if (Number.isFinite(n) && n > 0) {
            out.set(mint, n);
          }
        }
      } catch (err: unknown) {
        // Aborts are normal — surface them so the caller can stop.
        if (err instanceof DOMException && err.name === "AbortError") {
          throw err;
        }
        // Any other failure: silently drop this chunk; the caller
        // already has a fallback mcap from the search/list response.
      }
    }),
  );

  return out;
}

/**
 * recomputeMarketCap returns the corrected market-cap value to render.
 * If we have a real supply from the chain, multiply by usd_price.
 * Otherwise, hand back whatever fallback the caller already has
 * (typically the indexer's wrong-but-non-zero value, which is better
 * than rendering blank).
 *
 * Kept as a free function (rather than baked into fetchBatchSupplies)
 * so SearchModal, PulseTable, etc. can reuse it consistently — every
 * list view that's getting wrong mcap needs the exact same formula.
 */
export function recomputeMarketCap(
  priceUsd: number | null | undefined,
  circulatingSupply: number | undefined,
  fallback: number,
): number {
  if (
    typeof priceUsd === "number" &&
    Number.isFinite(priceUsd) &&
    priceUsd > 0 &&
    typeof circulatingSupply === "number" &&
    Number.isFinite(circulatingSupply) &&
    circulatingSupply > 0
  ) {
    return priceUsd * circulatingSupply;
  }
  return fallback;
}
