/**
 * useRobustWebSocket
 *
 * Shared connection-lifecycle helper for all client WebSocket consumers.
 *
 * Responsibilities (all in one place so each consumer hook stays tiny):
 *   - Exponential backoff reconnect with ±20% jitter, 500ms → 30s cap
 *   - CONNECTING/OPEN guard at every reconnect entry point (prevents duplicate sockets)
 *   - Page Visibility API: reconnect on visible-return if socket dropped
 *   - online/offline: reconnect on network return; pause retries while offline
 *   - pageshow (bfcache / iOS Safari back-button): reconnect when page restored
 *   - resume/freeze (Chrome tab freeze): reconnect on resume
 *   - App-level ping/pong keepalive (30 s interval, 10 s pong timeout)
 *   - Callbacks stored in refs — connection effect depends only on url/userId
 *     so non-memoized callbacks do NOT churn the socket
 *   - SSR safety (no window access during render)
 *   - onReconnect callback fires on every reconnect (not initial connect),
 *     used by caller for React Query refetch reconciliation
 */

import { useEffect, useRef, useState } from "react";

export type RobustWebSocketState = {
  readyState: number;
  isConnected: boolean;
  connectedAt: number | null;
  lastMessageAt: number | null;
  reconnectAttempts: number;
};

export type RobustWebSocketOptions = {
  /** Absolute wss:// or ws:// URL; set to null to disable connection. */
  url: string | null;
  /** Called for every parsed message. Stored in a ref — identity changes do not reconnect. */
  onMessage?: (data: unknown) => void;
  /** Called once on `onopen` AFTER a reconnect (not the initial connect). */
  onReconnect?: () => void;
  /** Enabled flag; if false the hook never opens a socket. */
  enabled?: boolean;
  /**
   * Override ping interval (ms). Default 15_000.
   *
   * Kept well under any ~30s idle timeout found on intermediate proxies /
   * load balancers on the WS path (notably GCP HTTPS LB in front of
   * backend.interstate.so). A verified prod test on 2026-04-23 showed
   * connections dying ~30s after last activity at the 30s ping interval;
   * dropping to 15s keeps the socket live indefinitely.
   */
  pingIntervalMs?: number;
  /** Override pong timeout (ms). Default 8_000 (leaves headroom under ping interval). */
  pongTimeoutMs?: number;
  /** Optional tag used in console logs for debugging. */
  logTag?: string;
};

const BACKOFF_STEPS_MS = [500, 1_000, 2_000, 4_000, 8_000, 15_000, 30_000];
const JITTER_PCT = 0.2;

function withJitter(ms: number) {
  const delta = ms * JITTER_PCT;
  return ms + (Math.random() * 2 - 1) * delta;
}

export function useRobustWebSocket(opts: RobustWebSocketOptions): RobustWebSocketState {
  const { url, enabled = true, pingIntervalMs = 15_000, pongTimeoutMs = 8_000, logTag = "WS" } = opts;

  // Stash callbacks in refs so connection effect doesn't depend on their identity.
  const onMessageRef = useRef(opts.onMessage);
  const onReconnectRef = useRef(opts.onReconnect);
  useEffect(() => {
    onMessageRef.current = opts.onMessage;
  }, [opts.onMessage]);
  useEffect(() => {
    onReconnectRef.current = opts.onReconnect;
  }, [opts.onReconnect]);

  const [state, setState] = useState<RobustWebSocketState>({
    readyState: WebSocket.CLOSED,
    isConnected: false,
    connectedAt: null,
    lastMessageAt: null,
    reconnectAttempts: 0,
  });

  // Mutable connection state — intentionally not in React state to avoid re-render churn.
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pongTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const connectedOnceRef = useRef(false);
  const disposedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!enabled || !url) return;

    disposedRef.current = false;

    const isDev = process.env.NODE_ENV !== "production";
    const log = (...args: unknown[]) => {
      if (isDev) console.log(`[${logTag}]`, ...args);
    };

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
    const clearPingTimers = () => {
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      if (pongTimerRef.current) {
        clearTimeout(pongTimerRef.current);
        pongTimerRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (disposedRef.current) return;
      // If we're already connecting or open, don't queue another attempt.
      const rs = wsRef.current?.readyState;
      if (rs === WebSocket.CONNECTING || rs === WebSocket.OPEN) return;
      clearReconnectTimer();
      const delayBase = BACKOFF_STEPS_MS[Math.min(attemptRef.current, BACKOFF_STEPS_MS.length - 1)];
      const delay = Math.max(250, withJitter(delayBase));
      log(`reconnect in ${Math.round(delay)} ms (attempt ${attemptRef.current})`);
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, delay);
    };

    const tryReconnectNow = () => {
      if (disposedRef.current) return;
      const rs = wsRef.current?.readyState;
      if (rs === WebSocket.CONNECTING || rs === WebSocket.OPEN) return;
      // Skip backoff and reconnect immediately (used on visibility return / bfcache).
      clearReconnectTimer();
      connect();
    };

    const startPingLoop = () => {
      clearPingTimers();
      pingTimerRef.current = setInterval(() => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        try {
          ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
        } catch {
          // ignore
        }
        // Arm pong timeout — if the server doesn't respond, force a reconnect.
        if (pongTimerRef.current) clearTimeout(pongTimerRef.current);
        pongTimerRef.current = setTimeout(() => {
          log("pong timeout — force-closing socket");
          try {
            wsRef.current?.close();
          } catch {
            // ignore
          }
        }, pongTimeoutMs);
      }, pingIntervalMs);
    };

    const connect = () => {
      if (disposedRef.current) return;
      if (typeof window === "undefined") return;
      const rs = wsRef.current?.readyState;
      if (rs === WebSocket.CONNECTING || rs === WebSocket.OPEN) return;

      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        log("constructor threw:", err);
        attemptRef.current += 1;
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;
      setState((s) => ({ ...s, readyState: WebSocket.CONNECTING, reconnectAttempts: attemptRef.current }));

      ws.onopen = () => {
        log("open");
        const wasReconnect = connectedOnceRef.current;
        connectedOnceRef.current = true;
        attemptRef.current = 0;
        setState({
          readyState: WebSocket.OPEN,
          isConnected: true,
          connectedAt: Date.now(),
          lastMessageAt: null,
          reconnectAttempts: 0,
        });
        startPingLoop();
        if (wasReconnect) {
          try {
            onReconnectRef.current?.();
          } catch (err) {
            log("onReconnect handler threw:", err);
          }
        }
      };

      ws.onmessage = (ev) => {
        setState((s) => ({ ...s, lastMessageAt: Date.now() }));
        let parsed: unknown;
        try {
          parsed = JSON.parse(ev.data);
        } catch {
          return;
        }
        // Intercept pongs so they don't leak to the consumer.
        if (parsed && typeof parsed === "object" && (parsed as { type?: string }).type === "pong") {
          if (pongTimerRef.current) {
            clearTimeout(pongTimerRef.current);
            pongTimerRef.current = null;
          }
          return;
        }
        try {
          onMessageRef.current?.(parsed);
        } catch (err) {
          log("onMessage handler threw:", err);
        }
      };

      ws.onerror = (ev) => {
        log("error event", ev);
      };

      ws.onclose = () => {
        log("close");
        clearPingTimers();
        wsRef.current = null;
        setState((s) => ({ ...s, readyState: WebSocket.CLOSED, isConnected: false }));
        if (disposedRef.current) return;
        attemptRef.current += 1;
        scheduleReconnect();
      };
    };

    // Lifecycle listeners — all route through tryReconnectNow with the guard.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") tryReconnectNow();
    };
    const onOnline = () => tryReconnectNow();
    const onOffline = () => {
      // Clear the reconnect timer so we don't keep hammering while offline.
      clearReconnectTimer();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) tryReconnectNow();
    };
    const onResume = () => tryReconnectNow();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("pageshow", onPageShow);
    // 'resume'/'freeze' are fired on `document` in Chrome when Tab Freeze
    // promotes/demotes a tab. Not standard on all browsers — the listener
    // is a no-op where unsupported.
    document.addEventListener("resume" as any, onResume);

    // Kick off first connection.
    connect();

    return () => {
      disposedRef.current = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("resume" as any, onResume);
      clearReconnectTimer();
      clearPingTimers();
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        try {
          ws.onopen = null;
          ws.onmessage = null;
          ws.onerror = null;
          ws.onclose = null;
          ws.close(1000, "unmount");
        } catch {
          // ignore
        }
      }
      connectedOnceRef.current = false;
      attemptRef.current = 0;
    };
  }, [url, enabled, pingIntervalMs, pongTimeoutMs, logTag]);

  return state;
}
