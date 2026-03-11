/**
 * OHLC WebSocket Prefetch Manager — singleton that survives SPA navigation.
 *
 * Opens a Solana OHLC WS on PulseTable hover so the snapshot + real-time
 * candles are ready before the user clicks through to the trade page.
 * The chart component can then adopt the live connection with zero latency.
 */

import { globalOHLCCache } from '~/hooks/useBackgroundOHLCPreload';

// ── Types ────────────────────────────────────────────────────────────────

interface OHLCCandle {
  unix_time: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v_usd: number;
}

const isDev = process.env.NODE_ENV !== 'production';

type PrefetchStatus = 'idle' | 'connecting' | 'connected' | 'closed';

// ── Module-level singleton state ─────────────────────────────────────────

let currentMint: string | null = null;
let ws: WebSocket | null = null;
let snapshotData: OHLCCandle[] = [];
let realtimeBuffer: OHLCCandle[] = [];
let status: PrefetchStatus = 'idle';
let cleanupTimer: ReturnType<typeof setTimeout> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// ── Helpers ──────────────────────────────────────────────────────────────

function buildWsUrl(mint: string, snapshotTimeframe?: string): string {
  const wsBaseUrl =
    process.env.NEXT_PUBLIC_WEBSOCKET_URL ||
    'https://token-stage.narrative.trade';
  const wsProtocol = wsBaseUrl.startsWith('https') ? 'wss' : 'ws';
  const wsHost = wsBaseUrl.replace(/^https?:\/\//, '');
  // Add snapshot_timeframe for display-resolution snapshots (skip sub-minute — no backend tables)
  const snapshotParam = snapshotTimeframe && !['1s', '5s', '15s', '30s'].includes(snapshotTimeframe)
    ? `&snapshot_timeframe=${snapshotTimeframe}`
    : '';
  return `${wsProtocol}://${wsHost}/v1/ws/ohlcv/${mint}?timeframe=1s${snapshotParam}`;
}

function parseCandle(c: any): OHLCCandle {
  return {
    unix_time: c.unix_time || c.time,
    o: c.o || c.open || 0,
    h: c.h || c.high || 0,
    l: c.l || c.low || 0,
    c: c.c || c.close || 0,
    v_usd: c.v_usd || c.v || c.volume || 0,
  };
}

/** Write WS snapshot into the global OHLC cache used by useBackgroundOHLCPreload. */
function writeToGlobalCache(mint: string, data: OHLCCandle[]): void {
  const cacheKey = `${mint}:1h:30d`;
  globalOHLCCache.set(cacheKey, { data, timestamp: Date.now(), mint });
}

function cleanupInternal(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    cleanupTimer = null;
  }
  if (ws) {
    try {
      ws.close();
    } catch {}
    ws = null;
  }
  currentMint = null;
  snapshotData = [];
  realtimeBuffer = [];
  status = 'idle';
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Open an OHLC WS for `mint` (150ms debounced).
 * Closes any existing prefetch connection first — only one at a time.
 */
export function prefetchViaWS(mint: string, snapshotTimeframe?: string): void {
  // Same mint already being prefetched or connected
  if (
    currentMint === mint &&
    (status === 'connecting' || status === 'connected')
  ) {
    return;
  }

  // Clear previous debounce
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null;

    // Clean up any existing connection for a different mint
    if (currentMint && currentMint !== mint) {
      cleanupInternal();
    }

    currentMint = mint;
    status = 'connecting';
    snapshotData = [];
    realtimeBuffer = [];

    // Cancel any handoff cleanup timer
    if (cleanupTimer) {
      clearTimeout(cleanupTimer);
      cleanupTimer = null;
    }

    try {
      const wsUrl = buildWsUrl(mint, snapshotTimeframe);
      const newWs = new WebSocket(wsUrl);
      ws = newWs;

      newWs.onopen = () => {
        if (ws !== newWs) return; // stale
        status = 'connected';
        isDev && console.log(
          '[OHLCPrefetch] WS connected for',
          mint.slice(0, 10) + '...',
        );
      };

      newWs.onmessage = (event: MessageEvent) => {
        if (ws !== newWs) return; // stale
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'ping') {
            newWs.send(JSON.stringify({ type: 'pong' }));
            return;
          }
          if (message.type === 'pong') return;

          if (message.type === 'snapshot') {
            const candles = (message.data as Array<any>) || [];
            snapshotData = candles.map(parseCandle).sort(
              (a, b) => a.unix_time - b.unix_time,
            );

            // Bridge: write into globalOHLCCache so useBackgroundOHLCPreload picks it up
            if (snapshotData.length > 0) {
              writeToGlobalCache(mint, snapshotData);
            }

            isDev && console.log(
              '[OHLCPrefetch] Snapshot:',
              snapshotData.length,
              'candles for',
              mint.slice(0, 10) + '...',
            );
            return;
          }

          if (message.type === 'candle' && message.data) {
            realtimeBuffer.push(parseCandle(message.data));
            return;
          }
        } catch {
          // Ignore parse errors
        }
      };

      newWs.onerror = () => {
        if (ws !== newWs) return;
        isDev && console.log(
          '[OHLCPrefetch] WS error for',
          mint.slice(0, 10) + '...',
        );
      };

      newWs.onclose = () => {
        if (ws !== newWs) return;
        status = 'closed';
        ws = null;
        isDev && console.log(
          '[OHLCPrefetch] WS closed for',
          mint.slice(0, 10) + '...',
        );
      };
    } catch (e) {
      isDev && console.log('[OHLCPrefetch] Failed to create WS:', e);
      status = 'idle';
    }
  }, 50);
}

/**
 * Return merged snapshot + realtime candles for `mint`, or null if no data / wrong mint.
 */
export function getCachedData(mint: string): OHLCCandle[] | null {
  if (currentMint !== mint || snapshotData.length === 0) return null;

  const merged = [...snapshotData, ...realtimeBuffer];
  merged.sort((a, b) => a.unix_time - b.unix_time);

  // Dedupe by unix_time
  const seen = new Set<number>();
  return merged.filter((c) => {
    if (seen.has(c.unix_time)) return false;
    seen.add(c.unix_time);
    return true;
  });
}

/**
 * Chart component calls this on mount to take ownership of a prefetched WS.
 * Returns the live WebSocket + cached candles, or null if unavailable.
 * Clears the manager's reference so it no longer owns the connection.
 */
export function adoptConnection(
  mint: string,
): { ws: WebSocket; cachedData: OHLCCandle[] } | null {
  if (currentMint !== mint) return null;
  if (!ws || ws.readyState !== WebSocket.OPEN) return null;

  const cachedData = getCachedData(mint) || [];
  const adoptedWs = ws;

  // Transfer ownership — manager no longer owns the WS
  ws = null;
  snapshotData = [];
  realtimeBuffer = [];
  status = 'idle';
  // Keep currentMint so handoffConnection can validate later

  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    cleanupTimer = null;
  }

  isDev && console.log(
    '[OHLCPrefetch] Connection adopted by chart for',
    mint.slice(0, 10) + '...',
    '(' + cachedData.length + ' cached candles)',
  );
  return { ws: adoptedWs, cachedData };
}

/**
 * Chart component calls this on unmount to give its WS back.
 * Manager keeps it alive for 30s, accumulating candles.
 */
export function handoffConnection(
  mint: string,
  handedWs: WebSocket,
  cachedCandles: OHLCCandle[],
): void {
  // Clean up any existing prefetch connection first
  cleanupInternal();

  if (!handedWs || handedWs.readyState !== WebSocket.OPEN) {
    return;
  }

  currentMint = mint;
  ws = handedWs;
  snapshotData = cachedCandles || [];
  realtimeBuffer = [];
  status = 'connected';

  // Re-attach lightweight handlers to keep accumulating candles
  handedWs.onmessage = (event: MessageEvent) => {
    if (ws !== handedWs) return;
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'ping') {
        handedWs.send(JSON.stringify({ type: 'pong' }));
        return;
      }
      if (message.type === 'candle' && message.data) {
        realtimeBuffer.push(parseCandle(message.data));
      }
    } catch {}
  };

  handedWs.onclose = () => {
    if (ws !== handedWs) return;
    status = 'closed';
    ws = null;
    isDev && console.log(
      '[OHLCPrefetch] Handed-off WS closed for',
      mint.slice(0, 10) + '...',
    );
  };

  handedWs.onerror = () => {
    if (ws !== handedWs) return;
    isDev && console.log(
      '[OHLCPrefetch] Handed-off WS error for',
      mint.slice(0, 10) + '...',
    );
  };

  // Auto-close after 30 seconds of inactivity
  cleanupTimer = setTimeout(() => {
    if (ws === handedWs) {
      isDev && console.log(
        '[OHLCPrefetch] 30s timeout — closing handed-off WS for',
        mint.slice(0, 10) + '...',
      );
      cleanupInternal();
    }
  }, 30_000);

  isDev && console.log(
    '[OHLCPrefetch] Connection handed off from chart for',
    mint.slice(0, 10) + '...',
    '(' + snapshotData.length + ' candles preserved)',
  );
}

/** Force-close everything. */
export function cleanup(): void {
  cleanupInternal();
}
