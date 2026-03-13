// src/hooks/useHyperliquidWebSocket.ts
// Singleton WebSocket connection to Hyperliquid for real-time market data.
// Pattern: follows useSolanaTokenWebSocket.ts (reconnect, ping, visibility)

import { useRef, useEffect, useCallback, useState } from "react";
import type { HyperliquidWsMessage, HyperliquidWsSubscription } from "../utils/hyperliquidTypes";
import { getHlConfig } from "../utils/hyperliquidApi";

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL_MS = 3000;
const PING_INTERVAL_MS = 30000;

type MessageHandler = (msg: HyperliquidWsMessage) => void;

interface HyperliquidWsState {
  connected: boolean;
  error: string | null;
}

// Singleton WS manager (shared across hook instances)
let wsInstance: WebSocket | null = null;
let wsUrl: string | null = null;
const subscribers = new Map<string, Set<MessageHandler>>();
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let activeSubscriptions = new Set<string>(); // Track subs for re-subscribe on reconnect
const stateListeners = new Set<(state: HyperliquidWsState) => void>();

function notifyState(state: HyperliquidWsState) {
  stateListeners.forEach((fn) => fn(state));
}

async function getWsUrl(): Promise<string> {
  if (wsUrl) return wsUrl;
  const config = await getHlConfig();
  wsUrl = config.wsUrl;
  return wsUrl;
}

function sendMessage(msg: any) {
  if (wsInstance?.readyState === WebSocket.OPEN) {
    wsInstance.send(JSON.stringify(msg));
  }
}

async function connect() {
  if (wsInstance?.readyState === WebSocket.OPEN || wsInstance?.readyState === WebSocket.CONNECTING) {
    return;
  }

  const url = await getWsUrl();
  console.log(`[HL WS] Connecting to ${url}`);

  wsInstance = new WebSocket(url);

  wsInstance.onopen = () => {
    console.log("[HL WS] Connected");
    reconnectAttempts = 0;
    notifyState({ connected: true, error: null });

    // Re-subscribe to all active channels
    activeSubscriptions.forEach((subJson) => {
      sendMessage(JSON.parse(subJson));
    });

    // Start ping
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      sendMessage({ method: "ping" });
    }, PING_INTERVAL_MS);
  };

  wsInstance.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      // Handle pong
      if (msg.channel === "pong" || msg.method === "pong") return;

      // Route to subscribers
      const channel = msg.channel;
      if (channel && subscribers.has(channel)) {
        subscribers.get(channel)!.forEach((handler) => handler(msg));
      }

      // Also notify wildcard subscribers
      if (subscribers.has("*")) {
        subscribers.get("*")!.forEach((handler) => handler(msg));
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
    if (pingTimer) clearInterval(pingTimer);

    // Auto-reconnect
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && activeSubscriptions.size > 0) {
      reconnectAttempts++;
      const delay = RECONNECT_INTERVAL_MS * Math.min(reconnectAttempts, 3);
      console.log(`[HL WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
      reconnectTimer = setTimeout(connect, delay);
    }
  };
}

function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  if (wsInstance) {
    wsInstance.onclose = null; // Prevent auto-reconnect
    wsInstance.close();
    wsInstance = null;
  }
  reconnectAttempts = 0;
}

/**
 * Subscribe to a Hyperliquid WebSocket channel.
 * Returns an unsubscribe function.
 */
export function subscribeToChannel(
  channel: string,
  handler: MessageHandler,
  subscription?: HyperliquidWsSubscription["subscription"]
): () => void {
  // Register handler
  if (!subscribers.has(channel)) {
    subscribers.set(channel, new Set());
  }
  subscribers.get(channel)!.add(handler);

  // Send subscribe message
  if (subscription) {
    const subMsg: HyperliquidWsSubscription = {
      method: "subscribe",
      subscription,
    };
    const subJson = JSON.stringify(subMsg);
    activeSubscriptions.add(subJson);
    sendMessage(subMsg);
  }

  // Ensure connection
  connect();

  // Return unsubscribe function
  return () => {
    subscribers.get(channel)?.delete(handler);
    if (subscribers.get(channel)?.size === 0) {
      subscribers.delete(channel);
    }

    if (subscription) {
      const unsubMsg: HyperliquidWsSubscription = {
        method: "unsubscribe",
        subscription,
      };
      const subJson = JSON.stringify({ method: "subscribe", subscription });
      activeSubscriptions.delete(subJson);
      sendMessage(unsubMsg);
    }

    // Disconnect if no more subscribers
    if (activeSubscriptions.size === 0) {
      disconnect();
    }
  };
}

/**
 * Hook for Hyperliquid WebSocket connection state.
 * Use this to monitor connection status in components.
 */
export function useHyperliquidWebSocket() {
  const [state, setState] = useState<HyperliquidWsState>({
    connected: wsInstance?.readyState === WebSocket.OPEN || false,
    error: null,
  });

  useEffect(() => {
    const handler = (newState: HyperliquidWsState) => setState(newState);
    stateListeners.add(handler);
    return () => {
      stateListeners.delete(handler);
    };
  }, []);

  // Handle tab visibility changes
  useEffect(() => {
    const handleVisibility = () => {
      if (
        document.visibilityState === "visible" &&
        activeSubscriptions.size > 0 &&
        wsInstance?.readyState !== WebSocket.OPEN
      ) {
        reconnectAttempts = 0;
        connect();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  return state;
}
