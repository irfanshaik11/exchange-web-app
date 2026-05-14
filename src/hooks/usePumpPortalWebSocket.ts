import { useEffect, useState, useCallback, useRef } from 'react';

const isDev = process.env.NODE_ENV !== 'production';

interface PumpPortalToken {
  signature: string;
  mint: string;
  traderPublicKey?: string;
  txType: string;
  initialBuy?: number;
  solAmount?: number;
  bondingCurveKey?: string;
  vTokensInBondingCurve?: number;
  vSolInBondingCurve?: number;
  marketCapSol?: number;
  name: string;
  symbol: string;
  uri?: string;
  pool: string;
  // Additional fields we might derive
  price_usd?: number;
  market_cap_usd?: number;
  created_at?: string;
  timestamp?: number;
  image?: string; // Image URL from metadata
  pair_address?: string; // Derived from bondingCurveKey for pre-migration tokens
}

interface PumpPortalMessage {
  message?: string;
  signature?: string;
  mint?: string;
  [key: string]: any;
}

interface UsePumpPortalWebSocketOptions {
  enabled?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onTokenCreated?: (token: PumpPortalToken) => void;
  onTokenMigrated?: (token: PumpPortalToken) => void;
}

interface UsePumpPortalWebSocketReturn {
  tokens: PumpPortalToken[];
  connected: boolean;
  error: string | null;
  clearTokens: () => void;
}

// ─── Module-level singleton ───────────────────────────────────────────────────
// One WebSocket connection shared across all consumers (discover.tsx +
// TrendingBackgroundLoader). Tokens accumulate in globalTokens while the app
// runs on any page, so navigating to Pump Live shows data immediately.

const PUMP_PORTAL_URL = 'wss://pumpportal.fun/api/data';
const MAX_TOKENS = 100;
const RECONNECT_INTERVAL_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 10;
const CACHE_KEY = 'pumpportal_tokens';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let globalWs: WebSocket | null = null;
let globalIsConnected = false;
let globalIsConnecting = false;
let globalReconnectAttempt = 0;
let globalReconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let globalTokens: PumpPortalToken[] = [];
const globalListeners = new Set<() => void>();

// Load tokens from localStorage on module init (before first mount)
function loadCache(): PumpPortalToken[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const { tokens, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(CACHE_KEY); return []; }
    return Array.isArray(tokens) ? tokens : [];
  } catch { return []; }
}

function saveCache(tokens: PumpPortalToken[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ tokens, ts: Date.now() })); } catch {}
}

// Initialise global tokens from cache once at module load
if (typeof window !== 'undefined' && globalTokens.length === 0) {
  globalTokens = loadCache();
}

function notifyListeners() {
  globalListeners.forEach((fn) => fn());
}

async function fetchTokenImage(uri: string): Promise<string | undefined> {
  try {
    const proxied = uri.startsWith('/api/metadata') ? uri : `/api/metadata?url=${encodeURIComponent(uri)}`;
    let response = await fetch(proxied);
    if (!response.ok && proxied !== uri) response = await fetch(uri);
    if (response.ok) {
      const metadata = await response.json();
      const imageUrl = metadata?.image;
      if (imageUrl) return imageUrl;
    }
  } catch {}
  return undefined;
}

function connectGlobal() {
  if (globalIsConnecting || globalWs?.readyState === WebSocket.OPEN) return;
  if (globalReconnectAttempt >= MAX_RECONNECT_ATTEMPTS) return;

  globalIsConnecting = true;
  isDev && console.log('[PumpPortalWS] Connecting...');

  try {
    const ws = new WebSocket(PUMP_PORTAL_URL);

    ws.onopen = () => {
      globalIsConnected = true;
      globalIsConnecting = false;
      globalReconnectAttempt = 0;
      notifyListeners();

      ws.send(JSON.stringify({ method: 'subscribeNewToken' }));
      ws.send(JSON.stringify({ method: 'subscribeMigration' }));
      isDev && console.log('[PumpPortalWS] Connected and subscribed');
    };

    ws.onmessage = (event) => {
      try {
        const data = event.data;
        if (!data || typeof data !== 'string') return;
        const msg: PumpPortalMessage = JSON.parse(data);
        if (msg.message) return; // confirmation message

        if (msg.mint && msg.signature) {
          const token: PumpPortalToken = {
            signature: msg.signature,
            mint: msg.mint,
            txType: msg.txType || 'create',
            name: msg.name || '',
            symbol: msg.symbol || '',
            uri: msg.uri,
            pool: msg.pool || 'pump',
            traderPublicKey: msg.traderPublicKey,
            initialBuy: msg.initialBuy,
            solAmount: msg.solAmount,
            bondingCurveKey: msg.bondingCurveKey,
            vTokensInBondingCurve: msg.vTokensInBondingCurve,
            vSolInBondingCurve: msg.vSolInBondingCurve,
            marketCapSol: msg.marketCapSol,
            price_usd: msg.marketCapSol ? msg.marketCapSol * 170 : undefined,
            market_cap_usd: msg.marketCapSol ? msg.marketCapSol * 170 : undefined,
            created_at: new Date().toISOString(),
            timestamp: Date.now(),
            pair_address: msg.bondingCurveKey,
          };

          if (msg.txType === 'create') {
            const exists = globalTokens.some((t) => t.mint === token.mint);
            if (exists) return;

            if (token.uri) {
              fetchTokenImage(token.uri).then((imageUrl) => {
                if (!imageUrl) return;
                const tokenWithImage = { ...token, image: imageUrl };
                const alreadyIn = globalTokens.some((t) => t.mint === tokenWithImage.mint);
                if (alreadyIn) return;
                globalTokens = [tokenWithImage, ...globalTokens].slice(0, MAX_TOKENS);
                saveCache(globalTokens);
                notifyListeners();
              }).catch(() => {});
            }
          }
        }
      } catch {}
    };

    ws.onerror = () => {
      globalIsConnecting = false;
    };

    ws.onclose = () => {
      globalIsConnected = false;
      globalIsConnecting = false;
      globalWs = null;

      if (globalListeners.size > 0 && globalReconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
        globalReconnectAttempt += 1;
        globalReconnectTimeout = setTimeout(connectGlobal, RECONNECT_INTERVAL_MS);
        isDev && console.log(`[PumpPortalWS] Reconnecting (${globalReconnectAttempt}/${MAX_RECONNECT_ATTEMPTS})...`);
      }

      notifyListeners();
    };

    globalWs = ws;
  } catch (err) {
    console.error('[PumpPortalWS] Failed to create WebSocket:', err);
    globalIsConnecting = false;
  }
}

function disconnectGlobal() {
  if (globalReconnectTimeout) { clearTimeout(globalReconnectTimeout); globalReconnectTimeout = null; }
  globalReconnectAttempt = MAX_RECONNECT_ATTEMPTS; // prevent auto-reconnect
  globalWs?.close();
  globalWs = null;
  globalIsConnected = false;
  globalIsConnecting = false;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * WebSocket hook for PumpPortal real-time token updates.
 * Uses a module-level singleton so the connection stays alive across page
 * navigations and data accumulates in the background.
 */
export function usePumpPortalWebSocket(
  options: UsePumpPortalWebSocketOptions = {}
): UsePumpPortalWebSocketReturn {
  const { enabled = true, onTokenCreated, onTokenMigrated } = options;

  const [tokens, setTokens] = useState<PumpPortalToken[]>(() => globalTokens);
  const [connected, setConnected] = useState(globalIsConnected);
  const [error] = useState<string | null>(null);

  const onTokenCreatedRef = useRef(onTokenCreated);
  const onTokenMigratedRef = useRef(onTokenMigrated);
  useEffect(() => { onTokenCreatedRef.current = onTokenCreated; }, [onTokenCreated]);
  useEffect(() => { onTokenMigratedRef.current = onTokenMigrated; }, [onTokenMigrated]);

  const syncState = useCallback(() => {
    setTokens([...globalTokens]);
    setConnected(globalIsConnected);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    globalListeners.add(syncState);

    // Reset reconnect counter so the singleton can reconnect freely
    if (globalReconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      globalReconnectAttempt = 0;
    }

    if (!globalWs || globalWs.readyState !== WebSocket.OPEN) {
      connectGlobal();
    } else {
      syncState();
    }

    return () => {
      globalListeners.delete(syncState);
      // Keep connection alive as long as there are other listeners
      // (e.g. TrendingBackgroundLoader stays mounted)
      if (globalListeners.size === 0) {
        isDev && console.log('[PumpPortalWS] No more listeners, disconnecting');
        disconnectGlobal();
      }
    };
  }, [enabled, syncState]);

  const clearTokens = useCallback(() => {
    globalTokens = [];
    saveCache([]);
    notifyListeners();
  }, []);

  return { tokens, connected, error, clearTokens };
}

export type { PumpPortalToken };
export default usePumpPortalWebSocket;
