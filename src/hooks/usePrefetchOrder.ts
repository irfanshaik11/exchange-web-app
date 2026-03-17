/**
 * usePrefetchOrder.ts
 *
 * Reusable hook for pre-building Jupiter Ultra orders before the user clicks Buy/Sell.
 * Sends a lightweight WS message to the backend which caches the order.
 * When the user then clicks Buy/Sell, the backend returns the cached order in <1ms
 * instead of waiting ~700ms for the Jupiter /order API.
 *
 * Key design: `useKeepFresh` sets up a 3-second interval that continuously re-fetches
 * the order so it's always near-fresh when the user clicks Buy. Without this,
 * bonding curve tokens go stale in ~2 seconds and cause on-chain failures.
 *
 * Usage:
 *   const { prefetchImmediate, useKeepFresh } = usePrefetchOrder();
 *   useKeepFresh({ baseMint, amount: 0.1, side: 'buy' }); // auto-refresh every 3s
 */

import { useCallback, useEffect, useRef } from 'react';
import { useSolanaPositionWebSocketContext } from '~/contexts/SolanaPositionWebSocketContext';
import { useUser } from '~/components/UserContext';

interface PrefetchParams {
  baseMint: string;
  amount: number;
  side: 'buy' | 'sell';
  slippageBps?: number;
}

const REFRESH_INTERVAL_MS = 2_000; // 2 seconds — tighter refresh keeps orders fresh on volatile bonding curves

/**
 * Returns prefetch functions and a keep-fresh hook.
 */
export function usePrefetchOrder(debounceMs = 300) {
  const { sendMessage } = useSolanaPositionWebSocketContext();
  const { user } = useUser();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSend = useCallback((params: PrefetchParams) => {
    if (!user?.publicKey || !params.baseMint || !params.amount) return;
    sendMessage({
      type: 'prefetch_order',
      baseMint: params.baseMint,
      amount: params.amount,
      side: params.side,
      walletAddress: user.publicKey,
      slippageBps: params.slippageBps,
    });
  }, [sendMessage, user?.publicKey]);

  // Debounced prefetch — for amount input changes
  const prefetch = useCallback((params: PrefetchParams) => {
    if (!user?.publicKey || !params.baseMint || !params.amount) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSend(params), debounceMs);
  }, [doSend, user?.publicKey, debounceMs]);

  // Immediate prefetch (no debounce) — for hover, mount, preset click
  const prefetchImmediate = useCallback((params: PrefetchParams) => {
    doSend(params);
  }, [doSend]);

  return { prefetch, prefetchImmediate, doSend };
}

/**
 * Hook that continuously refreshes a prefetch order every 3 seconds.
 * Call this on the token page / TradeActionPanel to keep the cached order fresh.
 * Automatically stops when the component unmounts or params become null.
 *
 * Usage:
 *   useKeepOrderFresh({ baseMint: token.mint, amount: 0.1, side: 'buy' });
 */
export function useKeepOrderFresh(params: PrefetchParams | null) {
  const { sendMessage } = useSolanaPositionWebSocketContext();
  const { user } = useUser();
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    if (!user?.publicKey || !params?.baseMint || !params?.amount) return;

    // Send immediately on mount / param change
    sendMessage({
      type: 'prefetch_order',
      baseMint: params.baseMint,
      amount: params.amount,
      side: params.side,
      walletAddress: user.publicKey,
      slippageBps: params.slippageBps,
    });

    // Then refresh every 3 seconds
    const interval = setInterval(() => {
      const p = paramsRef.current;
      if (!p?.baseMint || !p?.amount || !user?.publicKey) return;
      sendMessage({
        type: 'prefetch_order',
        baseMint: p.baseMint,
        amount: p.amount,
        side: p.side,
        walletAddress: user.publicKey,
        slippageBps: p.slippageBps,
      });
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.baseMint, params?.amount, params?.side, user?.publicKey, sendMessage]);
}
