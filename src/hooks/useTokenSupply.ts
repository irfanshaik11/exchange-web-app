import { useState, useEffect, useCallback, useRef } from "react";
import { getWsSupply } from "~/utils/wsSupplyCache";

const GO_SERVICE_URL = process.env.NEXT_PUBLIC_GO_SERVICE_URL || "";

// Sentinel "supply not loaded yet". Multiplier of 1 makes MC-mode render
// numerically equal to USD until the real on-chain supply resolves via
// /v1/supply. The trade header and TradeActionPanel both treat any value
// <= 1 as "still loading" and show "—" / fall through to fallback math.
const DEFAULT_SUPPLY = 1;

// Optimistic fallback for known 1B-supply launchpads. Used as the initial
// state when we know the token came from a launchpad whose bonding-curve
// convention is exactly 1B tokens — so the chart can render correct MC
// during the 5-15s window where the indexer's RPC retry cascade is still
// landing the real value in PG. When the real value arrives (almost always
// also 1B for these protocols), no visible change. On the rare token that
// differs (e.g. graduated pump.fun = 2B), the chart's setSymbol re-resolve
// fixes the pricescale.
//
// Intentionally excluded: arbitrary tokens like JUP (6.86B with 6 decimals).
// For those, the fallback would show wrong MC — better to display "—"
// briefly until the real value resolves.
const LAUNCHPAD_FALLBACK_SUPPLY = 1_000_000_000;
const KNOWN_1B_LAUNCHPADS = new Set([
  "pump.fun",
  "pumpfun",
  "bonk.fun",
  "bonkfun",
  "meteora",
  "moonshot",
  "moonit",
  "heaven",
  "sugar",
  "boopfun",
  "raydiumlaunchpad",
]);

function initialSupplyFor(protocol?: string | null): number {
  if (!protocol) return DEFAULT_SUPPLY;
  return KNOWN_1B_LAUNCHPADS.has(protocol.toLowerCase())
    ? LAUNCHPAD_FALLBACK_SUPPLY
    : DEFAULT_SUPPLY;
}

// Retry policy for /v1/supply. Solana RPC can flake on a freshly-discovered
// mint (rate limit, transient RPC error, abort due to rapid token-switch).
// Without retries the trade-header gets stuck at "—" indefinitely.
// Exponential backoff: 400ms → 800ms → 1.6s → 3.2s → 6.4s → 12.8s.
const MAX_RETRIES = 6;
const RETRY_BASE_DELAY_MS = 400;

interface SupplyResponse {
  circulating_supply: string;
  total_supply: string;
  decimals: number;
  mint: string;
}

interface UseTokenSupplyResult {
  circulatingSupply: number;
  isLoading: boolean;
  refetch: () => void;
}

export default function useTokenSupply(
  mint: string | undefined | null,
  // Optional protocol hint: when caller knows the token came from a 1B-supply
  // launchpad, we render the correct MC immediately instead of "—" while the
  // /v1/supply fetch resolves. Backward-compatible: callers that don't pass
  // this fall through to DEFAULT_SUPPLY (existing "—" behavior).
  launchpadProtocol?: string | null,
): UseTokenSupplyResult {
  const [circulatingSupply, setCirculatingSupply] = useState<number>(() =>
    initialSupplyFor(launchpadProtocol),
  );
  const [isLoading, setIsLoading] = useState(false);

  // Tracks the mint whose supply we have *successfully* resolved. NOT the
  // mint we've merely *attempted* — the distinction matters because React
  // Strict Mode (and any rapid mount/unmount) causes the effect to run
  // twice in dev. The original implementation used a "lastMintRef" set
  // BEFORE the fetch started; cleanup aborted the in-flight fetch, then
  // re-mount saw the ref already set and skipped the re-fetch → supply
  // stuck at sentinel forever. Tracking *success* instead means the
  // re-mount correctly fires a fresh fetch when needed.
  const resolvedMintRef = useRef<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the most-recent mint requested. Used by the retry timer to
  // bail out if the mint changed during backoff.
  const requestedMintRef = useRef<string | null>(null);

  const cancelRetry = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const fetchSupply = useCallback(
    async (mintAddr: string, attempt: number = 0): Promise<void> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      requestedMintRef.current = mintAddr;

      setIsLoading(true);
      try {
        const res = await fetch(`${GO_SERVICE_URL}/v1/supply/${mintAddr}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: SupplyResponse = await res.json();
        const parsed = parseFloat(data.circulating_supply);
        if (Number.isFinite(parsed) && parsed > 0) {
          // Only commit the value if the mint hasn't changed mid-flight
          if (requestedMintRef.current === mintAddr) {
            setCirculatingSupply(parsed);
            resolvedMintRef.current = mintAddr;
            cancelRetry();
          }
        } else {
          throw new Error("invalid_payload");
        }
      } catch (err: any) {
        if (err?.name === "AbortError") {
          // Aborted — the new caller (re-mount or token switch) is
          // responsible for firing a fresh fetch. Don't schedule a retry
          // for THIS aborted call, but also DON'T mark anything resolved.
          return;
        }
        if (attempt < MAX_RETRIES && requestedMintRef.current === mintAddr) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          cancelRetry();
          retryTimerRef.current = setTimeout(() => {
            if (requestedMintRef.current === mintAddr) {
              fetchSupply(mintAddr, attempt + 1);
            }
          }, delay);
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    },
    [cancelRetry],
  );

  useEffect(() => {
    if (!mint || mint.length < 20) {
      setCirculatingSupply(initialSupplyFor(launchpadProtocol));
      resolvedMintRef.current = null;
      requestedMintRef.current = null;
      cancelRetry();
      return;
    }

    // If we already have a resolved value for THIS exact mint, skip the
    // fetch (no Strict-Mode double-fire wasted RPCs). This is the
    // success-based dedupe that the original mint-visited dedupe got
    // wrong.
    if (resolvedMintRef.current === mint) {
      return;
    }

    // Reset state for the new mint so we don't briefly display the
    // previous token's supply on the new chart. Critical for pricescale
    // correctness — the chart's resolveSymbol reads the multiplier at
    // init time; a leaked value from a previous token would set the
    // wrong pricescale. For known 1B-supply launchpads, seed with 1B
    // instead of the sentinel so the chart MC renders correctly during
    // the indexer's 5-15s supply propagation window.
    cancelRetry();
    setCirculatingSupply(initialSupplyFor(launchpadProtocol));

    // WS fast-path: the OHLCV WebSocket piggybacks the supply payload
    // onto its snapshot message. By the time `useTokenSupply` mounts on
    // the trade page, the chart's WS is usually already open (often
    // prewarmed by SearchModal hover), and supply has landed in the
    // shared cache. Skip the HTTP round-trip entirely when it's there.
    // No retry/backoff needed — the cached value came from a successful
    // PG read upstream. Note: the WS value is authoritative, so it
    // overrides any 1B optimistic fallback set above.
    const wsCached = getWsSupply(mint);
    if (wsCached) {
      const parsed = parseFloat(wsCached.circulating_supply);
      if (Number.isFinite(parsed) && parsed > 0) {
        setCirculatingSupply(parsed);
        resolvedMintRef.current = mint;
        requestedMintRef.current = mint;
        return () => {
          // Cleanup mirrors the HTTP-path cleanup below: abort any
          // in-flight request just in case Strict-Mode mounted between
          // the WS-hit and this cleanup.
          abortRef.current?.abort();
        };
      }
    }

    fetchSupply(mint, 0);

    return () => {
      // Cleanup: abort the in-flight fetch. Don't cancel the retry
      // timer here unconditionally — if Strict Mode is the cleanup
      // cause, we WANT the retry/re-mount to refire the fetch. The
      // cleanup ABOVE at line "if (!mint || ...)" handles real teardown.
      abortRef.current?.abort();
    };
  }, [mint, launchpadProtocol, fetchSupply, cancelRetry]);

  const refetch = useCallback(() => {
    if (mint && mint.length >= 20) {
      cancelRetry();
      // Clear resolved-mint so the success-dedupe doesn't block this
      // explicit user-initiated refetch.
      resolvedMintRef.current = null;
      fetchSupply(mint, 0);
    }
  }, [mint, fetchSupply, cancelRetry]);

  return { circulatingSupply, isLoading, refetch };
}
