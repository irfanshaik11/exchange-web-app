// src/contexts/HyperliquidUserStreamContext.tsx
// Durable, app-scoped owner of Hyperliquid USER WebSocket streams.
//
// Mounted once in _app.tsx so fills/liquidations/position updates arrive on
// EVERY page, survive client-side navigation, and re-establish instantly after
// refresh (REST /account seeds the snapshot; webData2 then streams updates).
// Hyperliquid user streams are keyed by public address only — no signature —
// so this is pure frontend.
//
// Streams owned here:
// - webData2     → positions + margin summary + open orders (aggregate push)
// - userFills    → snapshot + live fills (toast on live fills)
// - userEvents   → liquidations (toast.error) — fills here are ignored to
//                  avoid double-toasting with userFills
//
// Lifecycle: subscriptions are keyed on the user's HL address; they tear down
// only on logout/wallet-switch (effect cleanup), never on route change.

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import toast from "react-hot-toast";
import { useUser } from "../components/UserContext";
import {
  subscribeToChannel,
  useHyperliquidWebSocket,
} from "../hooks/useHyperliquidWebSocket";
import { fetchAccount } from "../utils/hyperliquidApi";
import type {
  HyperliquidAssetPosition,
  HyperliquidMarginSummary,
  HyperliquidOpenOrder,
} from "../utils/hyperliquidTypes";

const MAX_SEEN_FILLS = 500;
const MAX_TOASTS_PER_MESSAGE = 3;

export interface HyperliquidUserStreamState {
  /** The user's Hyperliquid (EVM) address, authoritative from /account. */
  address: string | null;
  /** True when the socket is up AND webData2 has delivered at least once. */
  wsLive: boolean;
  /** Raw asset positions as Hyperliquid reports them (null until first data). */
  rawPositions: HyperliquidAssetPosition[] | null;
  marginSummary: HyperliquidMarginSummary | null;
  openOrders: HyperliquidOpenOrder[] | null;
  lastUpdateAt: number;
}

const DEFAULT_STATE: HyperliquidUserStreamState = {
  address: null,
  wsLive: false,
  rawPositions: null,
  marginSummary: null,
  openOrders: null,
  lastUpdateAt: 0,
};

const HyperliquidUserStreamContext =
  createContext<HyperliquidUserStreamState>(DEFAULT_STATE);

/** Safe anywhere — returns inert defaults if the provider isn't mounted. */
export function useHyperliquidUserStream(): HyperliquidUserStreamState {
  return useContext(HyperliquidUserStreamContext);
}

export function HyperliquidUserStreamProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, primaryWalletAddresses } = useUser();
  const { connected } = useHyperliquidWebSocket();

  const [address, setAddress] = useState<string | null>(null);
  const [rawPositions, setRawPositions] = useState<HyperliquidAssetPosition[] | null>(null);
  const [marginSummary, setMarginSummary] = useState<HyperliquidMarginSummary | null>(null);
  const [openOrders, setOpenOrders] = useState<HyperliquidOpenOrder[] | null>(null);
  const [lastUpdateAt, setLastUpdateAt] = useState(0);
  const [webDataReceived, setWebDataReceived] = useState(false);

  const seenFillsRef = useRef<Set<number>>(new Set());
  // Tracks the CURRENT address so handlers from a superseded subscription
  // (optimistic → authoritative flip, wallet switch) can't write stale-account
  // data into state during the unsubscribe/resubscribe window.
  const addressRef = useRef<string | null>(null);

  const bearerToken = user?.bearerToken;
  const optimisticAddress = primaryWalletAddresses?.ethereum || null;

  // ---- Address resolution: optimistic from context, authoritative from /account.
  // /account also returns the clearinghouse snapshot, seeding initial data so a
  // hard refresh shows positions before the first webData2 frame arrives.
  useEffect(() => {
    if (!bearerToken) {
      setAddress(null);
      setRawPositions(null);
      setMarginSummary(null);
      setOpenOrders(null);
      setWebDataReceived(false);
      seenFillsRef.current.clear();
      return;
    }
    if (optimisticAddress) {
      setAddress((a) => a ?? optimisticAddress);
    }
    let cancelled = false;
    fetchAccount(bearerToken)
      .then((acct: any) => {
        if (cancelled || !acct) return;
        if (acct.address) setAddress(acct.address);
        if (acct.assetPositions) setRawPositions(acct.assetPositions);
        if (acct.marginSummary) setMarginSummary(acct.marginSummary);
        setLastUpdateAt(Date.now());
      })
      .catch(() => {
        /* optimistic address (if any) still drives subscriptions */
      });
    return () => {
      cancelled = true;
    };
  }, [bearerToken, optimisticAddress]);

  // ---- Durable subscriptions, keyed on address. Cleanup runs only on
  // logout/wallet-switch — never on route change (provider lives in _app).
  useEffect(() => {
    addressRef.current = address;
    if (!address) return;
    const subAddress = address;

    const unsubWebData = subscribeToChannel(
      "webData2",
      (msg) => {
        if (addressRef.current !== subAddress) return; // superseded subscription
        const d = msg.data;
        if (!d) return;
        const ch = d.clearinghouseState;
        if (ch?.assetPositions) setRawPositions(ch.assetPositions);
        if (ch?.marginSummary) setMarginSummary(ch.marginSummary);
        if (Array.isArray(d.openOrders)) setOpenOrders(d.openOrders);
        setLastUpdateAt(Date.now());
        setWebDataReceived(true);
      },
      { type: "webData2", user: address }
    );

    const unsubFills = subscribeToChannel(
      "userFills",
      (msg) => {
        if (addressRef.current !== subAddress) return; // superseded subscription
        const d = msg.data;
        if (!d || d.isSnapshot || !Array.isArray(d.fills)) return;
        const seen = seenFillsRef.current;
        // Trim the OLDEST entries (Set preserves insertion order) — a full
        // clear() would forget recent tids and re-toast them on the next
        // message if Hyperliquid re-delivers fills after a socket blip.
        if (seen.size > MAX_SEEN_FILLS) {
          const excess = seen.size - Math.floor(MAX_SEEN_FILLS * 0.8);
          let i = 0;
          for (const tid of seen) {
            if (i++ >= excess) break;
            seen.delete(tid);
          }
        }
        let toasted = 0;
        for (const f of d.fills) {
          if (typeof f.tid === "number") {
            if (seen.has(f.tid)) continue;
            seen.add(f.tid);
          }
          if (toasted < MAX_TOASTS_PER_MESSAGE) {
            toasted++;
            const label = f.dir || (f.side === "B" ? "Buy" : "Sell");
            toast.success(`${label} ${f.sz} ${f.coin} @ $${f.px}`, {
              id: `hl-fill-${f.tid ?? `${f.coin}-${f.time}`}`,
            });
          }
        }
        if (d.fills.length > 0) setLastUpdateAt(Date.now());
      },
      { type: "userFills", user: address }
    );

    const unsubEvents = subscribeToChannel(
      "userEvents",
      (msg) => {
        if (addressRef.current !== subAddress) return; // superseded subscription
        const d = msg.data;
        // Fills also appear here; userFills owns those toasts. Only liquidations.
        if (d?.liquidation) {
          const liq = d.liquidation;
          toast.error(
            `Liquidated${liq.coin ? ` ${liq.coin}` : ""} — position closed by the exchange`,
            { id: `hl-liq-${liq.lid ?? Date.now()}`, duration: 10000 }
          );
          setLastUpdateAt(Date.now());
        }
      },
      { type: "userEvents", user: address }
    );

    return () => {
      unsubWebData();
      unsubFills();
      unsubEvents();
      setWebDataReceived(false);
    };
  }, [address]);

  const value = useMemo<HyperliquidUserStreamState>(
    () => ({
      address,
      wsLive: connected && webDataReceived,
      rawPositions,
      marginSummary,
      openOrders,
      lastUpdateAt,
    }),
    [address, connected, webDataReceived, rawPositions, marginSummary, openOrders, lastUpdateAt]
  );

  return (
    <HyperliquidUserStreamContext.Provider value={value}>
      {children}
    </HyperliquidUserStreamContext.Provider>
  );
}
