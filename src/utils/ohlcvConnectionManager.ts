/**
 * Persistent OHLCV WebSocket Connection Manager
 *
 * Opens a single persistent WS to /v1/ws/ohlcv on app boot and reuses it
 * across navigations. Eliminates ~150ms TCP+TLS+HTTP upgrade per token switch.
 *
 * Resilience features:
 *   - Application-level keepalive pings (survives proxy idle timeouts)
 *   - Dead connection detection (45s without any message = force reconnect)
 *   - Tab visibility handling (immediate health check when tab becomes visible)
 *   - Network online/offline handling (reconnect when network comes back)
 *   - Exponential backoff reconnection (1s → 30s cap)
 *   - Auto re-subscribe to current mint on reconnect
 *
 * Protocol:
 *   Send {"type":"subscribe","mint":"xxx","timeframe":"1s"} to switch tokens.
 *   Server responds with snapshot, then streams live candles.
 *
 * Usage:
 *   init()                   — call once from _app.tsx
 *   subscribe(mint)          — subscribe to a token (send message on existing WS)
 *   setMessageListener(fn)   — register to receive raw MessageEvents
 *   isConnected()            — check if the persistent WS is open
 *   send(data)               — send arbitrary data on the persistent WS
 */

type MessageListener = (event: MessageEvent) => void;

// ── Module state ────────────────────────────────────────────────────────────

let ws: WebSocket | null = null;
let state: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
let currentMint: string | null = null;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let messageListener: MessageListener | null = null;
let initialized = false;

// Keepalive state
let keepaliveInterval: ReturnType<typeof setInterval> | null = null;
let lastMessageTime = 0;
const KEEPALIVE_PING_INTERVAL = 25_000; // Send JSON ping every 25s
const DEAD_CONNECTION_TIMEOUT = 45_000; // Force reconnect if no message for 45s

// ── Internal helpers ────────────────────────────────────────────────────────

function buildWsUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_WEBSOCKET_URL ||
    'https://token-stage.narrative.trade';
  const protocol = base.startsWith('https') ? 'wss' : 'ws';
  const host = base.replace(/^https?:\/\//, '');
  return `${protocol}://${host}/v1/ws/ohlcv?timeframe=1s`;
}

function startKeepalive(): void {
  stopKeepalive();
  lastMessageTime = Date.now();

  keepaliveInterval = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      stopKeepalive();
      return;
    }

    // Dead connection detection: no message (including pong) for 45s
    const elapsed = Date.now() - lastMessageTime;
    if (elapsed > DEAD_CONNECTION_TIMEOUT) {
      console.log(
        '[OHLCVConn] No messages for',
        Math.round(elapsed / 1000) + 's, forcing reconnect',
      );
      forceReconnect();
      return;
    }

    // Send application-level ping to keep connection alive through proxies
    try {
      ws.send(JSON.stringify({ type: 'ping' }));
    } catch {
      // Send failed — connection is dead
      console.log('[OHLCVConn] Ping send failed, forcing reconnect');
      forceReconnect();
    }
  }, KEEPALIVE_PING_INTERVAL);
}

function stopKeepalive(): void {
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
  }
}

/** Force-close the WS and reconnect immediately (reset backoff). */
function forceReconnect(): void {
  stopKeepalive();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    try { ws.close(); } catch {}
    ws = null;
  }
  state = 'disconnected';
  reconnectAttempts = 0; // Reset backoff for forced reconnect
  connect();
}

function connect(): void {
  if (typeof window === 'undefined') return;
  if (state === 'connecting' || state === 'connected') return;

  state = 'connecting';

  try {
    const url = buildWsUrl();
    const newWs = new WebSocket(url);

    newWs.onopen = () => {
      if (ws !== newWs) return;
      state = 'connected';
      reconnectAttempts = 0;
      console.log('[OHLCVConn] Persistent WS connected');

      // Start keepalive monitoring
      startKeepalive();

      // Re-subscribe to current mint on reconnect
      if (currentMint) {
        newWs.send(
          JSON.stringify({ type: 'subscribe', mint: currentMint, timeframe: '1s' }),
        );
      }
    };

    newWs.onmessage = (event: MessageEvent) => {
      if (ws !== newWs) return;

      // Track last message time for dead connection detection
      lastMessageTime = Date.now();

      // Forward all messages to the registered listener (chart or prefetch manager).
      // The listener handles pings, snapshots, candles, etc.
      if (messageListener) {
        messageListener(event);
      }
    };

    newWs.onerror = () => {
      if (ws !== newWs) return;
      console.log('[OHLCVConn] WS error');
    };

    newWs.onclose = () => {
      if (ws !== newWs) return;
      console.log('[OHLCVConn] WS closed, scheduling reconnect');
      ws = null;
      state = 'disconnected';
      stopKeepalive();
      scheduleReconnect();
    };

    ws = newWs;
  } catch (e) {
    console.log('[OHLCVConn] Failed to create WS:', e);
    state = 'disconnected';
    scheduleReconnect();
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  // Exponential backoff: 1s, 1.5s, 2.25s, ... capped at 30s
  const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 30000);
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

/** Set up global event listeners for tab visibility and network changes. */
function setupGlobalListeners(): void {
  if (typeof window === 'undefined') return;

  // Tab visibility: immediately check WS health when tab becomes visible.
  // Chrome throttles background-tab timers to 1/min, so scheduled reconnects
  // may be delayed. This handler fires instantly on tab focus.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.log('[OHLCVConn] Tab visible, WS not open — reconnecting');
      forceReconnect();
    } else {
      // Connection looks open — send a ping to verify it's not half-open
      try {
        ws.send(JSON.stringify({ type: 'ping' }));
      } catch {
        console.log('[OHLCVConn] Tab visible, ping failed — reconnecting');
        forceReconnect();
      }
    }
  });

  // Network online: reconnect immediately when network comes back
  window.addEventListener('online', () => {
    console.log('[OHLCVConn] Network online — checking connection');
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      forceReconnect();
    }
  });
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Open the persistent WS. Call once from _app.tsx on mount. */
export function init(): void {
  if (typeof window === 'undefined') return;
  if (initialized) return;
  initialized = true;
  setupGlobalListeners();
  connect();
}

/** Subscribe to a token. Sends a subscribe message on the existing persistent WS. */
export function subscribe(mint: string, timeframe: string = '1s'): void {
  currentMint = mint;
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'subscribe', mint, timeframe }));
  }
  // If not yet connected, the mint is stored and subscribed on connect
}

/** Send arbitrary data on the persistent WS (e.g. pong responses). */
export function send(data: string): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(data);
  }
}

/** Register a message listener. Only one listener at a time (chart or prefetch manager). */
export function setMessageListener(fn: MessageListener | null): void {
  messageListener = fn;
}

/** Check if the persistent WS is open and ready. */
export function isConnected(): boolean {
  return state === 'connected' && ws?.readyState === WebSocket.OPEN;
}

/** Get the currently subscribed mint (if any). */
export function getCurrentMint(): string | null {
  return currentMint;
}
