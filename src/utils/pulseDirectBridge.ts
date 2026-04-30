/**
 * Direct Pulse WebSocket Bridge
 *
 * WebSocket in MAIN THREAD for zero-delay updates, but with:
 * - IndexedDB persistence (data survives refresh)
 * - BroadcastChannel for cross-tab sync
 * - Leader election (only one tab connects)
 *
 * This is the fastest possible architecture that still has all features.
 */

import { loadPulseCache, savePulseCache, type PulseToken } from './pulseCache';
import { patchMetadataIfPlaceholder } from './applyPriceUpdate';

const isDev = process.env.NODE_ENV !== 'production';

type ConnectionStatus = {
  new: boolean;
  final_stretch: boolean;
  migrated: boolean;
};

type PulseData = {
  newTokens: PulseToken[];
  finalStretchTokens: PulseToken[];
  migratedTokens: PulseToken[];
};

type DataListener = () => void;
type ConnectionListener = (status: ConnectionStatus) => void;

// State
let isInitialized = false;
let wsBaseUrl = '';

// WebSocket connections (in main thread for speed)
const wsConnections: Record<string, WebSocket | null> = {
  new: null,
  final_stretch: null,
  migrated: null,
};

// Cross-tab communication
let broadcastChannel: BroadcastChannel | null = null;
let isLeader = false;
const tabId = Math.random().toString(36).substring(2, 15);
let leaderCheckInterval: ReturnType<typeof setInterval> | null = null;
let lastLeaderHeartbeat = 0;
let leaderId: string | null = null;

// Data storage - use NEW references on every update for React compatibility
let currentData: PulseData = {
  newTokens: [],
  finalStretchTokens: [],
  migratedTokens: [],
};

let connectionStatus: ConnectionStatus = {
  new: false,
  final_stretch: false,
  migrated: false,
};

// Listeners
const dataListeners = new Set<DataListener>();
const connectionListeners = new Set<ConnectionListener>();

// Debounce for saving to IndexedDB (don't need to save every update)
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

// Max tokens per category
const MAX_NEW = 200;
const MAX_FINAL = 50;
const MAX_MIGRATED = 50;

/**
 * Initialize the direct bridge
 */
export async function initDirectPulseBridge(baseUrl: string): Promise<void> {
  if (typeof window === 'undefined') return;
  if (isInitialized) return;

  wsBaseUrl = baseUrl;
  isInitialized = true;

  // Load cached data first
  try {
    const cached = await loadPulseCache();
    if (cached) {
      currentData = {
        newTokens: cached.newTokens || [],
        finalStretchTokens: cached.finalStretchTokens || [],
        migratedTokens: cached.migratedTokens || [],
      };
      isDev && console.log('[DirectBridge] Loaded from cache:', {
        new: currentData.newTokens.length,
        final: currentData.finalStretchTokens.length,
        migrated: currentData.migratedTokens.length,
      });
      notifyDataListeners();
    }
  } catch (err) {
    console.warn('[DirectBridge] Cache load failed (non-fatal):', err);
  }

  // Initialize cross-tab communication
  initBroadcastChannel();
}

/**
 * Initialize BroadcastChannel for cross-tab sync
 */
function initBroadcastChannel() {
  if (typeof BroadcastChannel === 'undefined') {
    // No BroadcastChannel support - become leader directly
    isLeader = true;
    connectAllChannels();
    return;
  }

  broadcastChannel = new BroadcastChannel('pulse-direct-sync');

  broadcastChannel.onmessage = (event) => {
    const { type, data, from } = event.data;

    switch (type) {
      case 'LEADER_HEARTBEAT':
        if (from !== tabId) {
          leaderId = from;
          lastLeaderHeartbeat = Date.now();
          if (isLeader) {
            isDev && console.log('[DirectBridge] Another tab is leader, stepping down');
            isLeader = false;
            disconnectAllChannels();
          }
        }
        break;

      case 'LEADER_ELECTION':
        if (isLeader) {
          broadcastChannel?.postMessage({ type: 'LEADER_HEARTBEAT', from: tabId });
        }
        break;

      case 'DATA_UPDATE':
        if (from !== tabId && !isLeader) {
          // Receive data from leader - create new reference
          currentData = {
            newTokens: data.newTokens || [],
            finalStretchTokens: data.finalStretchTokens || [],
            migratedTokens: data.migratedTokens || [],
          };
          notifyDataListeners();
        }
        break;

      case 'TOKEN_DELTA':
        if (from !== tabId && !isLeader) {
          // Receive single token update from leader
          applyTokenDelta(data.deltaType, data.token);
          notifyDataListeners();
        }
        break;

      case 'CONNECTION_STATUS':
        if (from !== tabId && !isLeader) {
          connectionStatus = data;
          notifyConnectionListeners();
        }
        break;

      case 'REQUEST_DATA':
        if (isLeader && from !== tabId) {
          broadcastChannel?.postMessage({
            type: 'DATA_UPDATE',
            data: currentData,
            from: tabId,
          });
        }
        break;
    }
  };

  // Start leader election immediately
  electLeader();
}

/**
 * Leader election - start immediately, step down if another leader exists
 */
function electLeader() {
  broadcastChannel?.postMessage({ type: 'LEADER_ELECTION', from: tabId });

  // Become leader immediately (optimistic)
  isDev && console.log('[DirectBridge] Starting as leader (optimistic)');
  isLeader = true;
  leaderId = tabId;
  connectAllChannels();
  sendHeartbeat();

  // Check if another leader responds within 200ms
  setTimeout(() => {
    if (leaderId !== tabId && Date.now() - lastLeaderHeartbeat < 1000) {
      isDev && console.log('[DirectBridge] Another leader found, stepping down');
      isLeader = false;
      disconnectAllChannels();
      broadcastChannel?.postMessage({ type: 'REQUEST_DATA', from: tabId });
    }
  }, 200);

  // Periodic leader health check
  if (leaderCheckInterval) clearInterval(leaderCheckInterval);
  leaderCheckInterval = setInterval(() => {
    if (isLeader) {
      sendHeartbeat();
    } else if (Date.now() - lastLeaderHeartbeat > 10000) {
      isDev && console.log('[DirectBridge] Leader timeout, starting election');
      electLeader();
    }
  }, 3000);
}

function sendHeartbeat() {
  if (broadcastChannel && isLeader) {
    broadcastChannel.postMessage({ type: 'LEADER_HEARTBEAT', from: tabId });
  }
}

/**
 * Connect all WebSocket channels
 */
function connectAllChannels() {
  connectChannel('new');
  connectChannel('final_stretch');
  connectChannel('migrated');
}

/**
 * Disconnect all WebSocket channels
 */
function disconnectAllChannels() {
  for (const channel of ['new', 'final_stretch', 'migrated'] as const) {
    if (wsConnections[channel]) {
      wsConnections[channel]?.close();
      wsConnections[channel] = null;
    }
  }
}

/**
 * Connect to a single WebSocket channel
 */
function connectChannel(channel: 'new' | 'final_stretch' | 'migrated') {
  if (wsConnections[channel]) return;
  if (!wsBaseUrl) return;

  const url = `${wsBaseUrl}/v1/stream?channel=${channel}`;
  isDev && console.log(`[DirectBridge] Connecting to ${channel}:`, url);

  try {
    const ws = new WebSocket(url);
    wsConnections[channel] = ws;

    ws.onopen = () => {
      isDev && console.log(`[DirectBridge] Connected: ${channel}`);
      connectionStatus = { ...connectionStatus, [channel]: true };
      notifyConnectionListeners();
      broadcastChannel?.postMessage({
        type: 'CONNECTION_STATUS',
        data: connectionStatus,
        from: tabId,
      });
    };

    ws.onclose = () => {
      isDev && console.log(`[DirectBridge] Disconnected: ${channel}`);
      connectionStatus = { ...connectionStatus, [channel]: false };
      notifyConnectionListeners();
      wsConnections[channel] = null;

      // Reconnect if still leader
      if (isLeader) {
        setTimeout(() => connectChannel(channel), 3000);
      }
    };

    ws.onerror = (err) => {
      console.error(`[DirectBridge] Error on ${channel}:`, err);
    };

    ws.onmessage = (event) => {
      handleWebSocketMessage(channel, event);
    };

  } catch (err) {
    console.error(`[DirectBridge] Connection error:`, err);
  }
}

/**
 * Handle WebSocket message - DIRECT, no worker overhead
 */
function handleWebSocketMessage(channel: string, event: MessageEvent) {
  try {
    const messages = event.data.split('\n').filter((msg: string) => msg.trim());

    for (const msgStr of messages) {
      const data = JSON.parse(msgStr);
      const msgType = data.type || data.event;

      switch (msgType) {
        case 'new_token':
        case 'newToken':
          if (data.data) {
            const tokens = Array.isArray(data.data) ? data.data : [data.data];
            for (const t of tokens) {
              const normalized = normalizeToken(t);
              if (normalized) {
                addToken('newTokens', normalized);
                // Broadcast delta to other tabs
                broadcastChannel?.postMessage({
                  type: 'TOKEN_DELTA',
                  data: { deltaType: 'new', token: normalized },
                  from: tabId,
                });
              }
            }
          }
          break;

        case 'final_stretch_token':
        case 'finalStretch':
          if (data.data) {
            const tokens = Array.isArray(data.data) ? data.data : [data.data];
            for (const t of tokens) {
              const normalized = normalizeToken(t);
              if (normalized) {
                addToken('finalStretchTokens', normalized);
                broadcastChannel?.postMessage({
                  type: 'TOKEN_DELTA',
                  data: { deltaType: 'final_stretch', token: normalized },
                  from: tabId,
                });
              }
            }
          }
          break;

        case 'migrated_token':
        case 'migrated':
        case 'migration':
          if (data.data) {
            const tokens = Array.isArray(data.data) ? data.data : [data.data];
            for (const t of tokens) {
              const normalized = normalizeToken(t);
              if (normalized) {
                addToken('migratedTokens', normalized);
                broadcastChannel?.postMessage({
                  type: 'TOKEN_DELTA',
                  data: { deltaType: 'migrated', token: normalized },
                  from: tabId,
                });
              }
            }
          }
          break;

        case 'price_update':
        case 'priceUpdate':
          handlePriceUpdate(data.data || data.updates || [data]);
          break;

        case 'token_info_update':
        case 'tokenInfo':
          handleTokenInfoUpdate(data.data || data);
          break;

        case 'batch':
          if (Array.isArray(data.updates)) {
            for (const update of data.updates) {
              handleWebSocketMessage(channel, { data: JSON.stringify(update) } as MessageEvent);
            }
          }
          break;
      }
    }
  } catch (err) {
    console.error('[DirectBridge] Parse error:', err);
  }
}

/**
 * Normalize token - minimal fields for speed
 */
function normalizeToken(raw: any): PulseToken | null {
  if (!raw) return null;

  const mint = raw.mint || raw.address || raw.mint_address || raw.token_address;
  if (!mint) return null;

  const liquidityVal = raw.liquidity_usd || raw.liquidity || 0;
  const mcapVal = raw.market_cap_usd || raw.marketCap || raw.market_cap || 0;
  return {
    mint,
    mint_address: mint,
    name: raw.name || raw.token_name || 'Unknown',
    symbol: raw.symbol || raw.token_symbol || '???',
    image: raw.image || raw.image_uri || raw.logo,
    status: raw.status || 'active',
    price_usd: raw.price_usd || raw.price || 0,
    price_change_5m: raw.price_change_5m || raw.priceChange5m || 0,
    price_change_24h: raw.price_change_24h || 0,
    market_cap_usd: mcapVal,
    fully_diluted_value: raw.fully_diluted_value || mcapVal,
    volume_24h: raw.volume_24h || raw.volume || 0,
    liquidity_usd: liquidityVal,
    total_liquidity_usd: raw.total_liquidity_usd || liquidityVal,
    holder_count: raw.holder_count ?? raw.holders ?? 0,
    holders: raw.holder_count ?? raw.holders ?? 0,
    bonding_pct: raw.bonding_pct || raw.bondingCurveProgress || 0,
    launchpad_protocol: raw.launchpad_protocol || raw.protocol || 'pumpfun',
    total_buys_24h: raw.total_buys_24h ?? 0,
    total_sells_24h: raw.total_sells_24h ?? 0,
    kol_count: raw.kol_count ?? 0,
    dev_percent: raw.dev_percent ?? raw.dev_held_percentage ?? 0,
    sniper_percent: raw.sniper_percent ?? raw.sniper_held_percentage ?? 0,
    insider_percent: raw.insider_percent ?? raw.insider_held_percentage ?? 0,
    bundle_percent: raw.bundle_percent ?? raw.bundled_percentage ?? 0,
    // Filter-relevant fields previously dropped from WS data
    top10_holders_pct: raw.top10_holders_pct ?? raw.top10HoldersPct ?? 0,
    dev_tokens_created: raw.dev_tokens_created ?? raw.devTokensCreated ?? 0,
    dev_tokens_migrated: raw.dev_tokens_migrated ?? raw.devTokensMigrated ?? 0,
    global_fees_paid: raw.global_fees_paid ?? raw.globalFeesPaid ?? 0,
    total_fees_lamports: raw.total_fees_lamports ?? raw.totalFeesLamports ?? 0,
    twitter_reuses: raw.twitter_reuses ?? raw.twitter_reuse_count ?? 0,
    tweet_created_at: raw.tweet_created_at || raw.twitter_created_at || null,
    twitter_created_at: raw.twitter_created_at || raw.tweet_created_at || null,
    website: raw.website || raw.website_url || null,
    twitter: raw.twitter || raw.twitter_url || raw.x || raw.x_url || null,
    telegram: raw.telegram || raw.telegram_url || null,
    is_live: raw.is_live ?? null,
    bundled_percentage: raw.bundled_percentage ?? raw.bundle_percent ?? 0,
    bundler_held_percentage: raw.bundler_held_percentage ?? 0,
    dex_paid: raw.dex_paid ?? raw.dexPaid ?? false,
    // === CRITICAL: created_at for age display & sorting ===
    // Mirrors pulseWorkerBridge.ts logic (lines 767-778)
    created_at: (() => {
      const val = raw.launch_time || raw.created_at || raw.createdAt;
      if (!val) return Date.now();
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const parsed = new Date(val).getTime();
        return isNaN(parsed) ? Date.now() : parsed;
      }
      return Date.now();
    })(),
    launch_time: raw.launch_time || raw.created_at || raw.createdAt,
    // Volume breakdown fields for calculateVolumeUsd()
    total_buy_volume_5m: raw.total_buy_volume_5m ?? 0,
    total_sell_volume_5m: raw.total_sell_volume_5m ?? 0,
    total_buy_volume_1h: raw.total_buy_volume_1h ?? 0,
    total_sell_volume_1h: raw.total_sell_volume_1h ?? 0,
    total_buy_volume_6h: raw.total_buy_volume_6h ?? 0,
    total_sell_volume_6h: raw.total_sell_volume_6h ?? 0,
    total_buy_volume_24h: raw.total_buy_volume_24h ?? 0,
    total_sell_volume_24h: raw.total_sell_volume_24h ?? 0,
  } as PulseToken;
}

/**
 * Add token - creates NEW reference for React
 */
function addToken(key: 'newTokens' | 'finalStretchTokens' | 'migratedTokens', token: PulseToken) {
  const arr = currentData[key];
  const filtered = arr.filter(t => t.mint !== token.mint);
  const maxSize = key === 'newTokens' ? MAX_NEW : key === 'finalStretchTokens' ? MAX_FINAL : MAX_MIGRATED;

  // Create NEW object reference so React detects the change
  currentData = {
    ...currentData,
    [key]: [token, ...filtered].slice(0, maxSize),
  };

  // Notify listeners IMMEDIATELY
  notifyDataListeners();

  // Schedule save to IndexedDB (debounced)
  scheduleSave();
}

/**
 * Apply token delta from another tab
 */
function applyTokenDelta(deltaType: string, token: PulseToken) {
  if (!token?.mint) return;

  switch (deltaType) {
    case 'new':
      addToken('newTokens', token);
      break;
    case 'final_stretch':
      addToken('finalStretchTokens', token);
      break;
    case 'migrated':
      addToken('migratedTokens', token);
      break;
  }
}

/**
 * Handle price updates
 */
function handlePriceUpdate(updates: any[]) {
  const updatesArray = Array.isArray(updates) ? updates : [updates];
  let anyUpdated = false;
  let newData = { ...currentData };

  for (const update of updatesArray) {
    const mint = update.mint || update.address || update.mint_address;
    if (!mint) continue;

    for (const key of ['newTokens', 'finalStretchTokens', 'migratedTokens'] as const) {
      const arr = newData[key];
      const idx = arr.findIndex(t => t.mint === mint);
      if (idx !== -1) {
        const newArr = [...arr];
        const existing = arr[idx];
        const keepIfPositive = (newVal: any, ex: any) => newVal > 0 ? newVal : ex;
        const updatedLiquidity = keepIfPositive(update.liquidity_usd ?? update.liquidity, existing.liquidity_usd);
        const updatedMcap = keepIfPositive(update.market_cap_usd ?? update.marketCap, existing.market_cap_usd);
        newArr[idx] = {
          ...existing,
          price_usd: update.price_usd ?? update.price ?? existing.price_usd,
          market_cap_usd: updatedMcap,
          fully_diluted_value: updatedMcap,
          volume_24h: keepIfPositive(update.volume_24h ?? update.volume, existing.volume_24h),
          liquidity_usd: updatedLiquidity,
          total_liquidity_usd: updatedLiquidity,
          holder_count: keepIfPositive(update.holder_count ?? update.holders, existing.holder_count),
          holders: keepIfPositive(update.holder_count ?? update.holders, existing.holders),
          price_change_5m: update.price_change_5m ?? update.priceChange5m ?? existing.price_change_5m,
          // Merge metric fields when present in the update
          ...(update.total_buys_24h != null && { total_buys_24h: update.total_buys_24h }),
          ...(update.total_sells_24h != null && { total_sells_24h: update.total_sells_24h }),
          ...(update.bonding_pct != null && { bonding_pct: update.bonding_pct }),
          ...(update.kol_count != null && { kol_count: update.kol_count }),
          ...(update.dev_percent != null && { dev_percent: update.dev_percent }),
          ...(update.sniper_percent != null && { sniper_percent: update.sniper_percent }),
          ...(update.insider_percent != null && { insider_percent: update.insider_percent }),
          ...(update.bundle_percent != null && { bundle_percent: update.bundle_percent }),
          ...(update.top10_holders_pct != null && { top10_holders_pct: update.top10_holders_pct }),
          ...(update.total_fees_lamports != null && { total_fees_lamports: update.total_fees_lamports }),
          ...(update.global_fees_paid != null && { global_fees_paid: update.global_fees_paid }),
          // Volume breakdown fields
          ...(update.total_buy_volume_5m != null && { total_buy_volume_5m: update.total_buy_volume_5m }),
          ...(update.total_sell_volume_5m != null && { total_sell_volume_5m: update.total_sell_volume_5m }),
          ...(update.total_buy_volume_1h != null && { total_buy_volume_1h: update.total_buy_volume_1h }),
          ...(update.total_sell_volume_1h != null && { total_sell_volume_1h: update.total_sell_volume_1h }),
          ...(update.total_buy_volume_6h != null && { total_buy_volume_6h: update.total_buy_volume_6h }),
          ...(update.total_sell_volume_6h != null && { total_sell_volume_6h: update.total_sell_volume_6h }),
          ...(update.total_buy_volume_24h != null && { total_buy_volume_24h: update.total_buy_volume_24h }),
          ...(update.total_sell_volume_24h != null && { total_sell_volume_24h: update.total_sell_volume_24h }),
          // Metadata: only patch when current is empty/placeholder
          ...patchMetadataIfPlaceholder(existing, update),
        };
        newData[key] = newArr;
        anyUpdated = true;
      }
    }
  }

  if (anyUpdated) {
    currentData = newData;
    notifyDataListeners();
    scheduleSave();
  }
}

/**
 * Handle token info updates
 */
function handleTokenInfoUpdate(update: any) {
  const mint = update.mint_address || update.mint || update.address;
  if (!mint) return;

  let anyUpdated = false;
  let newData = { ...currentData };

  for (const key of ['newTokens', 'finalStretchTokens', 'migratedTokens'] as const) {
    const arr = newData[key];
    const idx = arr.findIndex(t => t.mint === mint);
    if (idx !== -1) {
      const newArr = [...arr];
      newArr[idx] = {
        ...arr[idx],
        holder_count: update.holder_count ?? arr[idx].holder_count,
        holders: update.holder_count ?? arr[idx].holders,
        kol_count: update.kol_count ?? arr[idx].kol_count,
        // Merge additional info fields when present
        ...(update.dev_percent != null && { dev_percent: update.dev_percent }),
        ...(update.sniper_percent != null && { sniper_percent: update.sniper_percent }),
        ...(update.insider_percent != null && { insider_percent: update.insider_percent }),
        ...(update.bundle_percent != null && { bundle_percent: update.bundle_percent }),
        ...(update.top10_holders_pct != null && { top10_holders_pct: update.top10_holders_pct }),
        ...(update.dev_tokens_created != null && { dev_tokens_created: update.dev_tokens_created }),
        ...(update.dev_tokens_migrated != null && { dev_tokens_migrated: update.dev_tokens_migrated }),
        ...(update.twitter_reuses != null && { twitter_reuses: update.twitter_reuses }),
        ...(update.twitter_reuse_count != null && { twitter_reuses: update.twitter_reuse_count }),
        ...(update.website != null && { website: update.website }),
        ...(update.twitter != null && { twitter: update.twitter }),
        ...(update.telegram != null && { telegram: update.telegram }),
        ...(update.is_live != null && { is_live: update.is_live }),
      };
      newData[key] = newArr;
      anyUpdated = true;
    }
  }

  if (anyUpdated) {
    currentData = newData;
    notifyDataListeners();
  }
}

/**
 * Schedule save to IndexedDB (debounced)
 */
function scheduleSave() {
  if (saveTimeout) return;

  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    savePulseCache({
      newTokens: currentData.newTokens,
      finalStretchTokens: currentData.finalStretchTokens,
      migratedTokens: currentData.migratedTokens,
      timestamp: Date.now(),
    }).catch(err => console.error('[DirectBridge] Save error:', err));
  }, 5000);
}

/**
 * Notify data listeners - IMMEDIATE, no batching
 */
function notifyDataListeners() {
  dataListeners.forEach(fn => {
    try {
      fn();
    } catch (err) {
      console.error('[DirectBridge] Listener error:', err);
    }
  });
}

function notifyConnectionListeners() {
  connectionListeners.forEach(fn => {
    try {
      fn(connectionStatus);
    } catch (err) {
      console.error('[DirectBridge] Connection listener error:', err);
    }
  });
}

// Public API
export function getDirectPulseData(): PulseData {
  return currentData;
}

export function getDirectConnectionStatus(): ConnectionStatus {
  return connectionStatus;
}

export function subscribeToDirectData(listener: DataListener): () => void {
  dataListeners.add(listener);
  return () => dataListeners.delete(listener);
}

export function subscribeToDirectConnection(listener: ConnectionListener): () => void {
  connectionListeners.add(listener);
  return () => connectionListeners.delete(listener);
}

export function terminateDirectBridge(): void {
  disconnectAllChannels();
  if (leaderCheckInterval) clearInterval(leaderCheckInterval);
  if (broadcastChannel) broadcastChannel.close();
  isInitialized = false;
}
