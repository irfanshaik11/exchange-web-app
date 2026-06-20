/**
 * useBridge — client state for the cross-chain Convert panel.
 *
 * Owns: options fetch, quote, execute, and the live `bridge_status` WS feed
 * (dispatched as a `bridgeStatusUpdate` CustomEvent by useSolanaPositionWebSocket).
 * State machine: idle → quoting → quoted → executing → pending → success | error.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getBridgeOptions,
  getBridgeQuote,
  executeBridge,
} from "~/utils/bridgeApi";
import type { BridgeOptions, BridgeQuoteResult } from "~/utils/bridgeApi";
import { useUser } from "~/components/UserContext";

export type BridgeStatus =
  | "idle"
  | "quoting"
  | "quoted"
  | "executing"
  | "pending"
  | "success"
  | "error";

export interface BridgeFormParams {
  fromChain: string;
  toChain: string;
  token?: string;
  /** smallest units of the input token */
  amount: string;
}

export interface UseBridge {
  options: BridgeOptions | null;
  quote: BridgeQuoteResult | null;
  status: BridgeStatus;
  error: string | null;
  /** latest status string pushed over the WS (submitted/pending/success/...) */
  liveStatus: string | null;
  fetchQuote: (params: BridgeFormParams) => Promise<void>;
  execute: (params: BridgeFormParams) => Promise<void>;
  reset: () => void;
}

const TERMINAL_FAIL = ["failure", "refund", "refunded"];

export function useBridge(): UseBridge {
  const { user, refreshTokenBalances } = useUser();
  const [options, setOptions] = useState<BridgeOptions | null>(null);
  const [quote, setQuote] = useState<BridgeQuoteResult | null>(null);
  const [status, setStatus] = useState<BridgeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const activeRequestId = useRef<string | null>(null);

  // Keep the latest refresh callback in a ref so the WS handler (mounted once)
  // always calls the freshest version without re-subscribing.
  const refreshTokenBalancesRef = useRef(refreshTokenBalances);
  useEffect(() => {
    refreshTokenBalancesRef.current = refreshTokenBalances;
  }, [refreshTokenBalances]);

  // Load the chain×token matrix once.
  useEffect(() => {
    let cancelled = false;
    getBridgeOptions()
      .then((r) => {
        if (!cancelled && r.data) setOptions(r.data);
      })
      .catch(() => {
        /* options are non-critical; panel can still hardcode-fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Subscribe to live bridge_status updates from the shared WS.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { requestId?: string; status?: string }
        | undefined;
      if (!detail?.status) return;
      // No request in flight (e.g. after reset()/"Convert again"): ignore the
      // frame entirely so a late/stale status can't paint an idle panel.
      if (!activeRequestId.current) return;
      // Ignore updates for a different in-flight request.
      if (detail.requestId && detail.requestId !== activeRequestId.current) {
        return;
      }
      setLiveStatus(detail.status);
      if (detail.status === "success") {
        setStatus("success");
        // surface the destination balance within seconds, not the 30s poll.
        // (1.5s gives the solver's fill time to settle before we read.)
        setTimeout(() => {
          // force: bypass the cooldown — we WANT a fresh read right after a bridge.
          void refreshTokenBalancesRef.current(true);
        }, 1500);
      } else if (TERMINAL_FAIL.includes(detail.status)) {
        setStatus("error");
        setError("Bridge failed or was refunded");
      } else {
        setStatus("pending");
      }
    };
    window.addEventListener("bridgeStatusUpdate", handler);
    return () => window.removeEventListener("bridgeStatusUpdate", handler);
  }, []);

  const fetchQuote = useCallback(
    async (params: BridgeFormParams) => {
      if (!user?.bearerToken) {
        setError("Please sign in");
        setStatus("error");
        return;
      }
      setStatus("quoting");
      setError(null);
      setQuote(null);
      try {
        const r = await getBridgeQuote(
          { ...params, token: params.token || "USDC" },
          user.bearerToken,
        );
        setQuote(r.data || null);
        setStatus("quoted");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Quote failed");
        setStatus("error");
      }
    },
    [user?.bearerToken],
  );

  const execute = useCallback(
    async (params: BridgeFormParams) => {
      if (!user?.bearerToken) {
        setError("Please sign in");
        setStatus("error");
        return;
      }
      setStatus("executing");
      setError(null);
      try {
        const r = await executeBridge(
          { ...params, token: params.token || "USDC" },
          user.bearerToken,
        );
        if (r.data?.requestId) activeRequestId.current = r.data.requestId;
        setLiveStatus(r.data?.status || "submitted");
        setStatus("pending");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Bridge failed");
        setStatus("error");
      }
    },
    [user?.bearerToken],
  );

  const reset = useCallback(() => {
    setQuote(null);
    setStatus("idle");
    setError(null);
    setLiveStatus(null);
    activeRequestId.current = null;
  }, []);

  return {
    options,
    quote,
    status,
    error,
    liveStatus,
    fetchQuote,
    execute,
    reset,
  };
}
