/**
 * SharedWorker for Pulse WebSocket Persistence
 *
 * This worker maintains a single WebSocket connection that's shared across all browser tabs.
 * When a tab refreshes or is opened, it instantly receives the cached token data.
 *
 * Message Protocol:
 * - From Main Thread: { type: 'CONNECT', url: string, channel?: string }
 * - From Main Thread: { type: 'DISCONNECT' }
 * - From Main Thread: { type: 'GET_CACHE' }
 * - To Main Thread: { type: 'CONNECTED' }
 * - To Main Thread: { type: 'DISCONNECTED' }
 * - To Main Thread: { type: 'TOKEN', tokenType: string, token: object }
 * - To Main Thread: { type: 'PRICE_UPDATE', updates: array }
 * - To Main Thread: { type: 'CACHE', data: { newTokens, finalStretchTokens, migratedTokens } }
 * - To Main Thread: { type: 'ERROR', error: string }
 */

// Store for all connected ports (tabs)
const ports = new Set();

// WebSocket connection state
let ws = null;
let wsUrl = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_INTERVAL = 2000;
let reconnectTimeout = null;

// Token cache - persists across tab refreshes
const MAX_TOKENS = 50;
const tokenCache = {
  newTokens: new Map(),
  finalStretchTokens: new Map(),
  migratedTokens: new Map(),
  lastUpdated: Date.now()
};

/**
 * Broadcast a message to all connected tabs
 */
function broadcast(message) {
  ports.forEach(port => {
    try {
      port.postMessage(message);
    } catch (e) {
      // Port might be closed, remove it
      ports.delete(port);
    }
  });
}

/**
 * Add a token to the appropriate cache with deduplication
 */
function addToCache(cacheMap, token) {
  if (!token || !token.mint) return;

  // Add to beginning (most recent first)
  const entries = [[token.mint, token], ...Array.from(cacheMap.entries()).filter(([k]) => k !== token.mint)];
  cacheMap.clear();
  entries.slice(0, MAX_TOKENS).forEach(([k, v]) => cacheMap.set(k, v));
  tokenCache.lastUpdated = Date.now();
}

/**
 * Get the current cache state as arrays
 */
function getCacheState() {
  return {
    newTokens: Array.from(tokenCache.newTokens.values()),
    finalStretchTokens: Array.from(tokenCache.finalStretchTokens.values()),
    migratedTokens: Array.from(tokenCache.migratedTokens.values()),
    lastUpdated: tokenCache.lastUpdated
  };
}

/**
 * Apply price updates to cached tokens
 */
function applyPriceUpdates(updates) {
  if (!Array.isArray(updates)) return;

  const updatesMap = new Map(updates.map(u => [u.mint || u.address, u]));

  // Helper to update a cache map
  const updateCache = (cacheMap) => {
    cacheMap.forEach((token, mint) => {
      const update = updatesMap.get(mint);
      if (update) {
        cacheMap.set(mint, {
          ...token,
          ...(update.price_usd !== undefined && { price_usd: update.price_usd }),
          ...(update.market_cap_usd !== undefined && update.market_cap_usd > 0 && { market_cap_usd: update.market_cap_usd }),
          ...(update.volume_24h !== undefined && { volume_24h: update.volume_24h }),
          ...(update.bonding_pct !== undefined && { bonding_pct: update.bonding_pct }),
          ...(update.graduation_percent !== undefined && { graduation_percent: update.graduation_percent }),
          ...(update.liquidity_usd !== undefined && { liquidity_usd: update.liquidity_usd }),
          ...(update.updated_at && { updated_at: update.updated_at }),
        });
      }
    });
  };

  updateCache(tokenCache.newTokens);
  updateCache(tokenCache.finalStretchTokens);
  updateCache(tokenCache.migratedTokens);
  tokenCache.lastUpdated = Date.now();
}

/**
 * Connect to the WebSocket server
 */
function connect(url) {
  // If already connected to the same URL, don't reconnect
  if (ws && ws.readyState === WebSocket.OPEN && wsUrl === url) {
    return;
  }

  // Close existing connection if URL changed
  if (ws) {
    ws.close();
    ws = null;
  }

  wsUrl = url;

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    broadcast({ type: 'ERROR', error: 'Max reconnection attempts reached' });
    return;
  }

  try {
    console.log('[PulseWorker] Connecting to:', url);
    ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('[PulseWorker] Connected');
      reconnectAttempts = 0;
      broadcast({ type: 'CONNECTED' });
    };

    ws.onmessage = (event) => {
      try {
        // Backend may batch multiple JSON messages separated by newlines
        const messages = event.data.split('\n').filter(msg => msg.trim());

        for (const msgStr of messages) {
          try {
            const message = JSON.parse(msgStr);

            if (message.type === 'new_token' && message.data && !Array.isArray(message.data)) {
              const rawToken = message.data;
              const token = {
                ...rawToken,
                mint: rawToken.address || rawToken.mint,
              };

              addToCache(tokenCache.newTokens, token);
              broadcast({ type: 'TOKEN', tokenType: 'new_token', token });

            } else if (message.type === 'final_stretch_token' && message.data && !Array.isArray(message.data)) {
              const rawToken = message.data;
              const token = {
                ...rawToken,
                mint: rawToken.address || rawToken.mint,
              };

              addToCache(tokenCache.finalStretchTokens, token);
              broadcast({ type: 'TOKEN', tokenType: 'final_stretch_token', token });

            } else if (message.type === 'migrated_token' && message.data && !Array.isArray(message.data)) {
              const rawToken = message.data;
              const token = {
                ...rawToken,
                mint: rawToken.address || rawToken.mint,
              };

              addToCache(tokenCache.migratedTokens, token);
              broadcast({ type: 'TOKEN', tokenType: 'migrated_token', token });

            } else if (message.type === 'price_update' && message.data) {
              const rawUpdates = Array.isArray(message.data) ? message.data : [message.data];
              const updates = rawUpdates.map(u => ({
                ...u,
                mint: u.address || u.mint,
              }));

              applyPriceUpdates(updates);
              broadcast({ type: 'PRICE_UPDATE', updates });
            }
          } catch (parseErr) {
            // Skip parse errors silently
          }
        }
      } catch (err) {
        // Handle errors silently
      }
    };

    ws.onerror = (event) => {
      console.error('[PulseWorker] WebSocket error:', event);
      broadcast({ type: 'ERROR', error: 'WebSocket connection error' });
    };

    ws.onclose = () => {
      console.log('[PulseWorker] Disconnected');
      broadcast({ type: 'DISCONNECTED' });

      // Attempt to reconnect if we have connected ports
      if (ports.size > 0 && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`[PulseWorker] Reconnecting in ${RECONNECT_INTERVAL}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(() => {
          if (ports.size > 0) {
            connect(wsUrl);
          }
        }, RECONNECT_INTERVAL);
      }
    };

  } catch (err) {
    console.error('[PulseWorker] Failed to create WebSocket:', err);
    broadcast({ type: 'ERROR', error: err.message || 'Failed to connect' });
  }
}

/**
 * Disconnect from the WebSocket server
 */
function disconnect() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (ws) {
    ws.close();
    ws = null;
  }

  wsUrl = null;
  reconnectAttempts = 0;
}

/**
 * Handle new port connections
 */
self.onconnect = (event) => {
  const port = event.ports[0];
  ports.add(port);

  console.log('[PulseWorker] New tab connected. Total tabs:', ports.size);

  port.onmessage = (e) => {
    const { type, url, channel, protocols } = e.data;

    switch (type) {
      case 'CONNECT':
        connect(url);
        // Immediately send cached data to the new tab
        port.postMessage({ type: 'CACHE', data: getCacheState() });
        // Send current connection status
        if (ws && ws.readyState === WebSocket.OPEN) {
          port.postMessage({ type: 'CONNECTED' });
        }
        break;

      case 'DISCONNECT':
        // Only disconnect if no other tabs are connected
        ports.delete(port);
        if (ports.size === 0) {
          disconnect();
        }
        break;

      case 'GET_CACHE':
        port.postMessage({ type: 'CACHE', data: getCacheState() });
        break;

      case 'CLEAR_CACHE':
        tokenCache.newTokens.clear();
        tokenCache.finalStretchTokens.clear();
        tokenCache.migratedTokens.clear();
        tokenCache.lastUpdated = Date.now();
        broadcast({ type: 'CACHE', data: getCacheState() });
        break;

      default:
        console.warn('[PulseWorker] Unknown message type:', type);
    }
  };

  // Clean up when port closes
  port.onmessageerror = () => {
    ports.delete(port);
    if (ports.size === 0) {
      disconnect();
    }
  };

  port.start();
};
