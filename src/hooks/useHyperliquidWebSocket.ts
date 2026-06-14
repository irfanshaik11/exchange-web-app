// src/hooks/useHyperliquidWebSocket.ts
// Singleton WebSocket connection to Hyperliquid for real-time market + user data.
//
// Hardened transport (see plan: WS architecture & persistence):
// - Refcounted subscriptions keyed by the full subscription payload, so two
//   consumers of the same stream share one server-side sub, and unmounting one
//   can never tear down the other's stream (the old flat Set collapsed these).
// - Indefinite reconnect with capped exponential backoff + jitter. A liquidation
//   stream must never silently give up (old code stopped after 5 attempts).
// - Module-level visibility/online listeners registered on first connect — the
//   old ones lived inside a hook that no component ever mounted, so they never ran.
// - Staleness watchdog: ping every 30s means a healthy socket is never silent
//   for 35s; if it is, the socket is half-open — force-close and reconnect.
// - Deferred disconnect (grace window) so the transient 0-sub moment during
//   page-to-page navigation doesn't churn the connection.
// - SSR-safe: all WebSocket/document/window access happens lazily, client-only.
//
// Delivery semantics are unchanged: messages fan out to all handlers registered
// for a channel, and handlers filter by coin themselves (all existing consumers
// already do this). Durable app-scoped streams (user fills/positions) achieve
// durability by their OWNER's lifecycle: the provider in _app.tsx holds its
// subscription across routes and only unsubscribes on logout.

import { useEffect, useState } from "react";
import type { HyperliquidWsMessage, HyperliquidWsSubscription } from "../utils/hyperliquidTypes";
import { getHlConfig } from "../utils/hyperliquidApi";

const PING_INTERVAL_MS = 30_000;
const STALE_THRESHOLD_MS = 35_000;
const STALE_CHECK_INTERVAL_MS = 10_000;
const DISCONNECT_GRACE_MS = 1_500;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

type MessageHandler = (msg: HyperliquidWsMessage) => void;

interface HyperliquidWsState {
  connected: boolean;
  error: string | null;
}

interface SubRecord {
  subscription: NonNullable<HyperliquidWsSubscription["subscription"]>;
  refCount: number;
}

// ============ Module-level singleton state ============

let wsInstance: WebSocket | null = null;
let wsUrl: string | null = null;
const channelHandlers = new Map<string, Set<MessageHandler>>();
const subs = new Map<string, SubRecord>(); // key = JSON of subscription payload
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let staleTimer: ReturnType<typeof setInterval> | null = null;
let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
let lastMessageAt = 0;
let globalListenersAttached = false;
const stateListeners = new Set<(state: HyperliquidWsState) => void>();

const isBrowser = typeof window !== "undefined";

function notifyState(state: HyperliquidWsState) {
  stateListeners.forEach((fn) => fn(state));
}

async function getWsUrl(): Promise<string> {
  if (wsUrl) return wsUrl;
  const config = await getHlConfig();
  wsUrl = config.wsUrl;
  return wsUrl;
}

function sendMessage(msg: object) {
  if (wsInstance?.readyState === WebSocket.OPEN) {
    wsInstance.send(JSON.stringify(msg));
  }
  // Dropped sends self-heal: onopen re-sends every subscription in `subs`.
}

function clearTimers() {
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  if (staleTimer) { clearInterval(staleTimer); staleTimer = null; }
}

function backoffDelay(): number {
  const exp = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.min(reconnectAttempts, 5));
  // 50–100% jitter so a fleet of tabs doesn't reconnect in lockstep
  return Math.round(exp * (0.5 + Math.random() * 0.5));
}

function scheduleReconnect() {
  if (reconnectTimer || subs.size === 0) return;
  // While offline, the `online` listener triggers reconnect; polling is pointless.
  if (isBrowser && typeof navigator !== "undefined" && navigator.onLine === false) return;
  reconnectAttempts++;
  const delay = backoffDelay();
  console.log(`[HL WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function forceReconnect(reason: string) {
  console.warn(`[HL WS] Force reconnect: ${reason}`);
  if (wsInstance) {
    // onclose handles scheduling; just make sure close() actually fires it
    try { wsInstance.close(); } catch { /* already dead */ }
  } else {
    scheduleReconnect();
  }
}

function attachGlobalListeners() {
  if (globalListenersAttached || !isBrowser) return;
  globalListenersAttached = true;

  document.addEventListener("visibilitychange", () => {
    if (
      document.visibilityState === "visible" &&
      subs.size > 0 &&
      wsInstance?.readyState !== WebSocket.OPEN &&
      wsInstance?.readyState !== WebSocket.CONNECTING
    ) {
      reconnectAttempts = 0;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      connect();
    }
  });

  window.addEventListener("online", () => {
    if (subs.size > 0 && wsInstance?.readyState !== WebSocket.OPEN) {
      reconnectAttempts = 0;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      connect();
    }
  });
}

async function connect() {
  if (!isBrowser) return; // SSR guard
  if (wsInstance?.readyState === WebSocket.OPEN || wsInstance?.readyState === WebSocket.CONNECTING) {
    return;
  }

  attachGlobalListeners();

  let url: string;
  try {
    url = await getWsUrl();
  } catch (err: any) {
    console.warn(`[HL WS] Config fetch failed: ${err?.message}`);
    scheduleReconnect();
    return;
  }
  // Re-check: a competing connect() may have won while we awaited the config
  if (wsInstance?.readyState === WebSocket.OPEN || wsInstance?.readyState === WebSocket.CONNECTING) {
    return;
  }
  console.log(`[HL WS] Connecting to ${url}`);

  wsInstance = new WebSocket(url);

  wsInstance.onopen = () => {
    console.log(`[HL WS] Connected (${subs.size} subscriptions)`);
    reconnectAttempts = 0;
    lastMessageAt = Date.now();
    notifyState({ connected: true, error: null });

    // Re-subscribe everything (also covers sends dropped while CONNECTING)
    subs.forEach((record) => {
      sendMessage({ method: "subscribe", subscription: record.subscription });
    });

    clearTimers();
    pingTimer = setInterval(() => sendMessage({ method: "ping" }), PING_INTERVAL_MS);
    // Half-open sockets pass ping (send succeeds) but never deliver — only
    // receive-side silence catches them.
    staleTimer = setInterval(() => {
      if (subs.size > 0 && Date.now() - lastMessageAt > STALE_THRESHOLD_MS) {
        forceReconnect(`no messages for ${Date.now() - lastMessageAt}ms`);
      }
    }, STALE_CHECK_INTERVAL_MS);
  };

  wsInstance.onmessage = (event) => {
    lastMessageAt = Date.now();
    try {
      const msg = JSON.parse(event.data);
      if (msg.channel === "pong" || msg.method === "pong") return;

      const channel = msg.channel;
      if (channel && channelHandlers.has(channel)) {
        channelHandlers.get(channel)!.forEach((handler) => handler(msg));
      }
      if (channelHandlers.has("*")) {
        channelHandlers.get("*")!.forEach((handler) => handler(msg));
      }
    } catch {
      // Ignore parse errors
    }
  };

  wsInstance.onerror = () => {
    notifyState({ connected: false, error: "WebSocket error" });
  };

  wsInstance.onclose = () => {
    console.log("[HL WS] Disconnected");
    notifyState({ connected: false, error: null });
    clearTimers();
    wsInstance = null;
    scheduleReconnect(); // no-ops when subs.size === 0
  };
}

function disconnect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  clearTimers();
  if (wsInstance) {
    wsInstance.onclose = null; // intentional shutdown — no auto-reconnect
    try { wsInstance.close(); } catch { /* noop */ }
    wsInstance = null;
  }
  reconnectAttempts = 0;
  notifyState({ connected: false, error: null });
}

function scheduleDisconnectIfIdle() {
  // Handler-only subscribers (no subscription payload, e.g. a "*" listener)
  // don't appear in `subs` — count them too, or we'd cut their socket.
  if (subs.size > 0 || channelHandlers.size > 0 || disconnectTimer) return;
  disconnectTimer = setTimeout(() => {
    disconnectTimer = null;
    if (subs.size === 0 && channelHandlers.size === 0) disconnect();
  }, DISCONNECT_GRACE_MS);
}

/**
 * Subscribe to a Hyperliquid WebSocket channel.
 *
 * Subscriptions are refcounted by their full payload: the first subscriber for a
 * (channel, coin, ...) tuple sends the server subscribe, the last one out sends
 * the unsubscribe. Messages are delivered to every handler registered for the
 * channel — handlers filter by coin themselves (all current consumers do).
 *
 * Returns an unsubscribe function (idempotent per call site via closure flag).
 */
export function subscribeToChannel(
  channel: string,
  handler: MessageHandler,
  subscription?: HyperliquidWsSubscription["subscription"]
): () => void {
  if (!channelHandlers.has(channel)) {
    channelHandlers.set(channel, new Set());
  }
  channelHandlers.get(channel)!.add(handler);

  let subKey: string | null = null;
  if (subscription) {
    subKey = JSON.stringify(subscription);
    const existing = subs.get(subKey);
    if (existing) {
      existing.refCount++;
    } else {
      subs.set(subKey, { subscription, refCount: 1 });
      sendMessage({ method: "subscribe", subscription });
    }
  }

  // A pending idle-disconnect must not fire now that someone needs the socket
  if (disconnectTimer) { clearTimeout(disconnectTimer); disconnectTimer = null; }
  connect();

  let unsubscribed = false;
  return () => {
    if (unsubscribed) return;
    unsubscribed = true;

    channelHandlers.get(channel)?.delete(handler);
    if (channelHandlers.get(channel)?.size === 0) {
      channelHandlers.delete(channel);
    }

    if (subKey) {
      const record = subs.get(subKey);
      if (record) {
        record.refCount--;
        if (record.refCount <= 0) {
          subs.delete(subKey);
          sendMessage({ method: "unsubscribe", subscription: record.subscription });
        }
      }
    }

    scheduleDisconnectIfIdle();
  };
}

/**
 * Hook for Hyperliquid WebSocket connection state (informational — reconnect
 * logic is module-level and works whether or not anything mounts this).
 */
export function useHyperliquidWebSocket() {
  const [state, setState] = useState<HyperliquidWsState>({
    connected: typeof WebSocket !== "undefined" && wsInstance?.readyState === WebSocket.OPEN,
    error: null,
  });

  useEffect(() => {
    const handler = (newState: HyperliquidWsState) => setState(newState);
    stateListeners.add(handler);
    return () => {
      stateListeners.delete(handler);
    };
  }, []);

  return state;
}
