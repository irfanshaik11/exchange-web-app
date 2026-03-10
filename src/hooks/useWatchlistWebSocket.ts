import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

// Derive WebSocket URL from environment variable (same host as other WS endpoints)
function getWatchlistWsUrl(): string {
  const baseUrl = typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_WEBSOCKET_URL || process.env.NEXT_PUBLIC_GO_SERVICE_URL || '')
    : '';
  if (!baseUrl) return 'wss://token.interstate.so/v1/ws/watchlist';
  // Convert http(s) to ws(s)
  const wsBase = baseUrl.replace(/^http/, 'ws');
  return `${wsBase.replace(/\/$/, '')}/v1/ws/watchlist`;
}

export interface WatchlistTokenUpdate {
  mint: string;
  price_usd: number;
  market_cap_usd: number;
  price_change_1h: number;
  liquidity_usd: number;
  name: string;
  symbol: string;
  image?: string;
  launchpad_protocol?: string;
}

// --- App-level singleton state (survives page navigation) ---
let globalWatchlistWs: WebSocket | null = null;
let globalWatchlistTokens: Map<string, WatchlistTokenUpdate> = new Map();
let globalWatchlistListeners = new Set<() => void>();
let currentSubscribedMints: string[] = [];
let globalIsConnecting = false;
let globalIsConnected = false;
let globalReconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let globalReconnectAttempt = 0;
let subscribeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

function notifyListeners() {
  globalWatchlistListeners.forEach(listener => listener());
}

function sendSubscribe(mints: string[]) {
  if (globalWatchlistWs?.readyState === WebSocket.OPEN && mints.length > 0) {
    globalWatchlistWs.send(JSON.stringify({ type: 'subscribe', mints }));
  }
}

function connectWatchlistWs() {
  if (globalIsConnecting) return;
  if (globalWatchlistWs?.readyState === WebSocket.OPEN) return;
  if (globalWatchlistWs?.readyState === WebSocket.CONNECTING) return;

  if (globalWatchlistWs) {
    globalWatchlistWs.close();
    globalWatchlistWs = null;
  }

  globalIsConnecting = true;

  if (globalReconnectTimeout) {
    clearTimeout(globalReconnectTimeout);
    globalReconnectTimeout = null;
  }

  try {
    const wsUrl = getWatchlistWsUrl();
    const ws = new WebSocket(wsUrl);
    globalWatchlistWs = ws;

    ws.onopen = () => {
      globalIsConnecting = false;
      globalIsConnected = true;
      globalReconnectAttempt = 0;
      notifyListeners();

      // Re-subscribe on reconnect
      if (currentSubscribedMints.length > 0) {
        sendSubscribe(currentSubscribedMints);
      }

      // Start keepalive pings (every 25s, server has 60s read deadline)
      if (keepAliveInterval) clearInterval(keepAliveInterval);
      keepAliveInterval = setInterval(() => {
        if (globalWatchlistWs?.readyState === WebSocket.OPEN) {
          globalWatchlistWs.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25000);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'pong') return;

        if (message.type === 'snapshot' || message.type === 'update' || message.type === 'price_update') {
          const tokens = Array.isArray(message.data) ? message.data : [];
          if (message.type === 'snapshot') {
            // Full replace for snapshot
            globalWatchlistTokens.clear();
          }

          for (const token of tokens) {
            if (token.mint) {
              globalWatchlistTokens.set(token.mint, {
                mint: token.mint,
                price_usd: token.price_usd ?? 0,
                market_cap_usd: token.market_cap_usd ?? 0,
                price_change_1h: token.price_change_1h ?? 0,
                liquidity_usd: token.liquidity_usd ?? 0,
                name: token.name ?? '',
                symbol: token.symbol ?? '',
                image: token.image,
                launchpad_protocol: token.launchpad_protocol,
              });
            }
          }

          notifyListeners();
        }

        if (message.type === 'error') {
          console.warn('[WatchlistWS] Server error:', message.message);
        }
      } catch (err) {
        console.error('[WatchlistWS] Error parsing message:', err);
      }
    };

    ws.onerror = () => {
      globalIsConnecting = false;
    };

    ws.onclose = () => {
      globalIsConnecting = false;
      globalIsConnected = false;
      globalWatchlistWs = null;

      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
      }

      notifyListeners();

      // Always reconnect if we have mints to watch, regardless of listener count
      if (currentSubscribedMints.length > 0 && globalReconnectAttempt < 8) {
        const delay = Math.min(1000 * Math.pow(2, globalReconnectAttempt), 30000);
        globalReconnectAttempt++;
        globalReconnectTimeout = setTimeout(() => {
          if (currentSubscribedMints.length > 0) {
            connectWatchlistWs();
          }
        }, delay);
      }
    };
  } catch (err) {
    console.error('[WatchlistWS] Connection error:', err);
    globalIsConnecting = false;
  }
}

// Visibility change handler — reconnect when tab becomes visible again
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentSubscribedMints.length > 0) {
      if (!globalWatchlistWs || globalWatchlistWs.readyState !== WebSocket.OPEN) {
        globalReconnectAttempt = 0; // Reset backoff on tab visible
        connectWatchlistWs();
      } else {
        // Verify connection is alive
        globalWatchlistWs.send(JSON.stringify({ type: 'ping' }));
      }
    }
  });
}

/**
 * Singleton WebSocket hook for watchlist live data.
 * Connects once per app, survives page navigation, auto-reconnects.
 *
 * @param mints - Array of token mint addresses to subscribe to
 * @returns tokens Map and connection status
 */
export function useWatchlistWebSocket(mints: string[]) {
  // Return a NEW Map snapshot on each WS update so React detects the change
  // (returning the same mutable globalWatchlistTokens ref would never trigger useEffect deps)
  const [tokens, setTokens] = useState<Map<string, WatchlistTokenUpdate>>(() => new Map(globalWatchlistTokens));
  const [isConnectedState, setIsConnectedState] = useState(globalIsConnected);
  const mountedRef = useRef(true);

  // Sync state listener — creates a NEW Map reference so downstream useEffect deps fire
  const syncState = useCallback(() => {
    if (mountedRef.current) {
      setTokens(new Map(globalWatchlistTokens));
      setIsConnectedState(globalIsConnected);
    }
  }, []);

  // Register listener on mount
  useEffect(() => {
    mountedRef.current = true;
    globalWatchlistListeners.add(syncState);

    return () => {
      mountedRef.current = false;
      globalWatchlistListeners.delete(syncState);
      // NOTE: We do NOT disconnect here — connection stays alive as long as
      // currentSubscribedMints has entries. WatchlistProvider never unmounts.
    };
  }, [syncState]);

  // Stabilize mints into a string key so the effect only fires when content changes,
  // not on every array reference change (which happens on every watchlist price update).
  const mintsKey = useMemo(() => mints.filter(Boolean).sort().join(','), [mints]);

  // Subscribe when mints actually change (debounced 500ms)
  useEffect(() => {
    if (!mintsKey) return; // No mints to watch

    if (subscribeDebounceTimer) clearTimeout(subscribeDebounceTimer);

    subscribeDebounceTimer = setTimeout(() => {
      currentSubscribedMints = mintsKey.split(',');

      // Connect if not already
      if (!globalWatchlistWs || globalWatchlistWs.readyState !== WebSocket.OPEN) {
        connectWatchlistWs();
      } else {
        sendSubscribe(currentSubscribedMints);
      }
    }, 500);

    return () => {
      if (subscribeDebounceTimer) clearTimeout(subscribeDebounceTimer);
    };
  }, [mintsKey]);

  return {
    tokens,
    isConnected: isConnectedState,
  };
}

export default useWatchlistWebSocket;
