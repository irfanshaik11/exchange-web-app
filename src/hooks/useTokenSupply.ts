import { useState, useEffect, useCallback, useRef } from "react";

const GO_SERVICE_URL = process.env.NEXT_PUBLIC_GO_SERVICE_URL || "";
// Sentinel "supply not loaded yet". Multiplier of 1 makes MC-mode render
// numerically equal to USD until the real on-chain supply resolves via
// /v1/supply. Previously this was 1_000_000_000, which caused non-pump.fun
// tokens (e.g. JUP @ 6.86B real supply) to display a wrong MC scale during
// cold start.
const DEFAULT_SUPPLY = 1;
// Retry policy for /v1/supply. The RPC behind the proxy can flake on a
// freshly-discovered mint (rate limit, transient RPC error, abort due to
// rapid token-switch). Without retries the trade-header gets stuck at
// "—" indefinitely. Retries with exponential backoff so we don't spam.
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

export default function useTokenSupply(mint: string | undefined | null): UseTokenSupplyResult {
  const [circulatingSupply, setCirculatingSupply] = useState<number>(DEFAULT_SUPPLY);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastMintRef = useRef<string | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelRetry = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const fetchSupply = useCallback(
    async (mintAddr: string, attempt: number = 0): Promise<void> => {
      // Abort any in-flight request — but DON'T treat that abort as a
      // failure-retry trigger (the new fetch we're about to start IS the
      // retry from the caller's perspective).
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      try {
        const res = await fetch(`${GO_SERVICE_URL}/v1/supply/${mintAddr}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: SupplyResponse = await res.json();
        const parsed = parseFloat(data.circulating_supply);
        if (Number.isFinite(parsed) && parsed > 0) {
          setCirculatingSupply(parsed);
          cancelRetry();
        } else {
          // Server returned 200 but body is unparseable / zero. Retry.
          throw new Error("invalid_payload");
        }
      } catch (err: any) {
        if (err?.name === "AbortError") {
          // Aborted because mint changed or refetch fired — the next call
          // will be triggered by the new mint's effect or refetch. Don't
          // schedule a retry here.
          return;
        }
        // Real error (network, 5xx, parse). Schedule a backoff retry, but
        // only while we're still on the same mint. If the mint changes
        // mid-backoff, the cleanup will cancel this timer.
        if (attempt < MAX_RETRIES && mintAddr === lastMintRef.current) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          cancelRetry();
          retryTimerRef.current = setTimeout(() => {
            // Only retry if we're STILL on the same mint
            if (mintAddr === lastMintRef.current) {
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
      setCirculatingSupply(DEFAULT_SUPPLY);
      lastMintRef.current = null;
      cancelRetry();
      return;
    }
    // Mint changed — reset supply to the sentinel so we don't show the
    // previous token's value briefly on the new chart. Critical for
    // pricescale correctness (the chart's resolveSymbol reads multiplier
    // at init time; if it grabs a stale 6.86B from JUP while showing
    // TROLNALDO, the MC axis labels are wildly wrong).
    if (mint !== lastMintRef.current) {
      cancelRetry();
      setCirculatingSupply(DEFAULT_SUPPLY);
      lastMintRef.current = mint;
      fetchSupply(mint, 0);
    }

    return () => {
      abortRef.current?.abort();
      cancelRetry();
    };
  }, [mint, fetchSupply, cancelRetry]);

  const refetch = useCallback(() => {
    if (mint && mint.length >= 20) {
      cancelRetry();
      fetchSupply(mint, 0);
    }
  }, [mint, fetchSupply, cancelRetry]);

  return { circulatingSupply, isLoading, refetch };
}
