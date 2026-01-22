/**
 * Bridge to communicate with the Pulse Web Worker
 *
 * Features:
 * - Web Worker for non-blocking WebSocket processing
 * - BroadcastChannel for cross-tab data sync
 * - Leader election: only ONE tab connects to WebSocket
 * - IndexedDB persistence for page refresh survival
 * - Fallback for browsers without Worker support
 */

import { loadPulseCache, savePulseCache, type PulseToken } from './pulseCache';

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

type DataListener = (data: PulseData) => void;
type ConnectionListener = (status: ConnectionStatus) => void;

// Worker and state
let worker: Worker | null = null;
let isInitialized = false;
let initPromise: Promise<void> | null = null;
let wsBaseUrl = '';

// Cross-tab communication
let broadcastChannel: BroadcastChannel | null = null;
let isLeader = false;
let leaderId: string | null = null;
const tabId = Math.random().toString(36).substring(2, 15);
let leaderCheckInterval: ReturnType<typeof setInterval> | null = null;
let lastLeaderHeartbeat = 0;

// Data storage
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

const dataListeners = new Set<DataListener>();
const connectionListeners = new Set<ConnectionListener>();

// Debounce for saving to IndexedDB
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let lastSaveTime = 0;

// Debounce for broadcasting (prevent flooding other tabs)
let broadcastTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingBroadcast = false;

function scheduleSave() {
  const now = Date.now();
  if (now - lastSaveTime < 5000) {
    if (!saveTimeout) {
      saveTimeout = setTimeout(() => {
        saveTimeout = null;
        lastSaveTime = Date.now();
        doSave();
      }, 5000);
    }
    return;
  }
  lastSaveTime = now;
  doSave();
}

function doSave() {
  if (currentData.newTokens.length === 0 &&
      currentData.finalStretchTokens.length === 0 &&
      currentData.migratedTokens.length === 0) {
    return;
  }

  savePulseCache({
    newTokens: currentData.newTokens,
    finalStretchTokens: currentData.finalStretchTokens,
    migratedTokens: currentData.migratedTokens,
    timestamp: Date.now(),
  }).catch(err => console.error('[PulseWorkerBridge] Save error:', err));
}

/**
 * Broadcast data to other tabs (debounced to one frame for fast cross-tab sync)
 */
function scheduleBroadcast() {
  if (!broadcastChannel || !isLeader) return;

  pendingBroadcast = true;
  if (!broadcastTimeout) {
    // Use 16ms (one frame) for fast cross-tab sync while preventing flooding
    broadcastTimeout = setTimeout(() => {
      broadcastTimeout = null;
      if (pendingBroadcast && broadcastChannel && isLeader) {
        pendingBroadcast = false;
        broadcastChannel.postMessage({
          type: 'DATA_UPDATE',
          data: currentData,
          from: tabId,
        });
      }
    }, 16);
  }
}

/**
 * Initialize cross-tab communication
 */
function initBroadcastChannel() {
  if (typeof BroadcastChannel === 'undefined') {
    console.log('[PulseWorkerBridge] BroadcastChannel not supported, starting worker directly');
    // Without BroadcastChannel, this tab becomes leader by default
    isLeader = true;
    startWorker(); // Start worker immediately!
    return;
  }

  broadcastChannel = new BroadcastChannel('pulse-websocket-sync');

  broadcastChannel.onmessage = (event) => {
    const { type, data, from, leaderId: msgLeaderId } = event.data;

    switch (type) {
      case 'LEADER_HEARTBEAT':
        // Another tab is the leader
        if (from !== tabId) {
          leaderId = from;
          lastLeaderHeartbeat = Date.now();
          if (isLeader) {
            // We were leader but someone else claimed it - step down
            console.log('[PulseWorkerBridge] Another tab is leader, stepping down');
            isLeader = false;
            stopWorker();
          }
        }
        break;

      case 'LEADER_ELECTION':
        // A tab is asking who the leader is
        if (isLeader) {
          broadcastChannel?.postMessage({
            type: 'LEADER_HEARTBEAT',
            from: tabId,
          });
        }
        break;

      case 'DATA_UPDATE':
        // Receive data from leader tab
        if (from !== tabId && !isLeader) {
          currentData = data;
          notifyDataListeners();
          scheduleSave();
        }
        break;

      case 'CONNECTION_STATUS':
        // Receive connection status from leader
        if (from !== tabId && !isLeader) {
          connectionStatus = data;
          notifyConnectionListeners();
        }
        break;

      case 'REQUEST_DATA':
        // Another tab is asking for current data (e.g., just opened)
        if (isLeader && from !== tabId) {
          broadcastChannel?.postMessage({
            type: 'DATA_UPDATE',
            data: currentData,
            from: tabId,
          });
          broadcastChannel?.postMessage({
            type: 'CONNECTION_STATUS',
            data: connectionStatus,
            from: tabId,
          });
        }
        break;
    }
  };

  // Start leader election
  electLeader();
}

/**
 * Leader election: determine which tab should run the WebSocket
 */
function electLeader() {
  // Ask if there's an existing leader
  broadcastChannel?.postMessage({
    type: 'LEADER_ELECTION',
    from: tabId,
  });

  // Wait a bit for responses
  setTimeout(() => {
    const now = Date.now();
    // If no leader heartbeat received recently, become leader
    if (!leaderId || now - lastLeaderHeartbeat > 5000) {
      console.log('[PulseWorkerBridge] Becoming leader tab');
      isLeader = true;
      leaderId = tabId;
      startWorker();
      sendHeartbeat();
    } else {
      console.log('[PulseWorkerBridge] Following leader:', leaderId);
      // Request current data from leader
      broadcastChannel?.postMessage({
        type: 'REQUEST_DATA',
        from: tabId,
      });
    }
  }, 200);

  // Check for leader health periodically
  if (leaderCheckInterval) clearInterval(leaderCheckInterval);
  leaderCheckInterval = setInterval(() => {
    if (isLeader) {
      sendHeartbeat();
    } else {
      // Check if leader is still alive
      const now = Date.now();
      if (now - lastLeaderHeartbeat > 10000) {
        console.log('[PulseWorkerBridge] Leader timeout, starting election');
        electLeader();
      }
    }
  }, 3000);
}

function sendHeartbeat() {
  if (broadcastChannel && isLeader) {
    broadcastChannel.postMessage({
      type: 'LEADER_HEARTBEAT',
      from: tabId,
    });
  }
}

/**
 * Start the WebSocket worker (only leader should do this)
 */
function startWorker() {
  if (!isLeader || worker) return;

  if (typeof Worker === 'undefined') {
    console.warn('[PulseWorkerBridge] Workers not supported, using fallback');
    initFallback(wsBaseUrl);
    return;
  }

  try {
    worker = new Worker('/workers/pulseWorker.js');

    worker.onmessage = (e) => {
      const { type, payload } = e.data;

      switch (type) {
        case 'DATA':
          currentData = payload;
          notifyDataListeners();
          scheduleSave();
          scheduleBroadcast(); // Share with other tabs
          break;

        case 'DATA_UPDATED':
          worker?.postMessage({ type: 'GET_DATA' });
          break;

        case 'CONNECTION_STATUS':
          connectionStatus = {
            ...connectionStatus,
            [payload.channel]: payload.connected,
          };
          notifyConnectionListeners();
          // Broadcast connection status to other tabs
          broadcastChannel?.postMessage({
            type: 'CONNECTION_STATUS',
            data: connectionStatus,
            from: tabId,
          });
          break;
      }
    };

    worker.onerror = (err) => {
      console.error('[PulseWorkerBridge] Worker error:', err);
      initFallback(wsBaseUrl);
    };

    worker.postMessage({
      type: 'INIT',
      payload: {
        wsBaseUrl,
        initialData: currentData,
      },
    });

    console.log('[PulseWorkerBridge] Worker started (leader tab)');
  } catch (err) {
    console.error('[PulseWorkerBridge] Failed to create worker:', err);
    initFallback(wsBaseUrl);
  }
}

/**
 * Stop the worker (when stepping down as leader)
 */
function stopWorker() {
  if (worker) {
    worker.postMessage({ type: 'DISCONNECT' });
    worker.terminate();
    worker = null;
  }
}

/**
 * Initialize the worker with WebSocket URL
 */
export async function initPulseWorker(baseUrl: string): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  if (initPromise) {
    return initPromise;
  }

  if (isInitialized) {
    console.log('[PulseWorkerBridge] Already initialized');
    return;
  }

  wsBaseUrl = baseUrl;
  initPromise = doInit();
  return initPromise;
}

async function doInit(): Promise<void> {
  // Load cached data first
  try {
    const cached = await loadPulseCache();
    if (cached) {
      currentData = {
        newTokens: cached.newTokens || [],
        finalStretchTokens: cached.finalStretchTokens || [],
        migratedTokens: cached.migratedTokens || [],
      };
      console.log('[PulseWorkerBridge] Loaded from cache:', {
        new: currentData.newTokens.length,
        final: currentData.finalStretchTokens.length,
        migrated: currentData.migratedTokens.length,
      });
      notifyDataListeners();
    }
  } catch (err) {
    console.error('[PulseWorkerBridge] Failed to load cache:', err);
  }

  // Initialize cross-tab communication and leader election
  initBroadcastChannel();

  isInitialized = true;

  // Handle tab close - if we're leader, another tab should take over
  window.addEventListener('beforeunload', () => {
    if (isLeader) {
      // Give other tabs a chance to become leader
      broadcastChannel?.postMessage({
        type: 'LEADER_LEAVING',
        from: tabId,
      });
    }
  });
}

/**
 * Fallback for browsers without Worker support
 */
function initFallback(baseUrl: string) {
  const channels = ['new', 'final_stretch', 'migrated'] as const;

  for (const channel of channels) {
    connectFallbackChannel(baseUrl, channel);
  }
}

function connectFallbackChannel(baseUrl: string, channel: 'new' | 'final_stretch' | 'migrated') {
  const url = `${baseUrl}/v1/stream?channel=${channel}`;
  console.log(`[PulseWorkerBridge] Fallback connecting to ${channel}:`, url);

  try {
    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log(`[PulseWorkerBridge] Fallback connected: ${channel}`);
      connectionStatus[channel] = true;
      notifyConnectionListeners();
    };

    ws.onclose = () => {
      console.log(`[PulseWorkerBridge] Fallback disconnected: ${channel}`);
      connectionStatus[channel] = false;
      notifyConnectionListeners();
      if (isLeader) {
        setTimeout(() => connectFallbackChannel(baseUrl, channel), 3000);
      }
    };

    ws.onerror = (err) => {
      console.error(`[PulseWorkerBridge] Fallback error on ${channel}:`, err);
    };

    // Process messages immediately for fast updates (trading terminal needs speed)
    ws.onmessage = (event) => {
      const messages = event.data.split('\n').filter((msg: string) => msg.trim());

      for (const msgStr of messages) {
        try {
          const data = JSON.parse(msgStr);
          handleFallbackMessage(channel, data);
        } catch {
          // Skip parse errors
        }
      }

      // Notify listeners immediately - navigation blocking is handled in the hook
      notifyDataListeners();
      scheduleSave();
      scheduleBroadcast();
    };
  } catch (err) {
    console.error(`[PulseWorkerBridge] Fallback connection error:`, err);
  }
}

function handleFallbackMessage(channel: 'new' | 'final_stretch' | 'migrated', data: any) {
  const msgType = data.type || data.event;

  switch (msgType) {
    case 'new_token':
    case 'newToken':
      if (data.data) {
        const tokens = Array.isArray(data.data) ? data.data : [data.data];
        for (const t of tokens) {
          const normalized = normalizeToken(t);
          if (normalized) addToken('newTokens', normalized);
        }
      }
      break;

    case 'final_stretch_token':
    case 'finalStretch':
      if (data.data) {
        const tokens = Array.isArray(data.data) ? data.data : [data.data];
        for (const t of tokens) {
          const normalized = normalizeToken(t);
          if (normalized) addToken('finalStretchTokens', normalized);
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
          if (normalized) addToken('migratedTokens', normalized);
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
  }
}

/**
 * Normalize token with ALL fields - matches usePulseWebSocketPersistent
 */
function normalizeToken(rawToken: any): PulseToken | null {
  if (!rawToken) return null;

  const mint = rawToken.mint || rawToken.address || rawToken.mint_address || rawToken.token_address || rawToken.contract_address;
  if (!mint) return null;

  // Pre-compute common fallback values
  const holderValue = rawToken.holder_count ?? rawToken.holders ?? rawToken.unique_wallets_24h ?? 0;
  const devPercentValue = rawToken.dev_percent ?? rawToken.dev_held_percentage ?? 0;
  const sniperPercentValue = rawToken.sniper_percent ?? rawToken.sniper_held_percentage ?? 0;
  const insiderPercentValue = rawToken.insider_percent ?? rawToken.insider_held_percentage ?? 0;
  const bundlePercentValue = rawToken.bundle_percent ?? rawToken.bundled_percentage ?? 0;

  return {
    // Spread original data first
    ...rawToken,

    // === Core identifiers ===
    mint,
    mint_address: mint,

    // === Basic info ===
    name: rawToken.name || rawToken.token_name || 'Unknown',
    symbol: rawToken.symbol || rawToken.token_symbol || '???',
    image: rawToken.image || rawToken.image_uri || rawToken.imageUrl || rawToken.logo || undefined,
    status: rawToken.status || 'active',
    launchpad_protocol: rawToken.launchpad_protocol || rawToken.protocol || 'pumpfun',
    pair_address: rawToken.pair_address || undefined,

    // === Price data ===
    price_usd: rawToken.price_usd || rawToken.price || 0,
    price_change_5m: rawToken.price_change_5m || rawToken.priceChange5m || 0,
    price_change_24h: rawToken.price_change_24h || rawToken.priceChange24h || 0,

    // === Market metrics ===
    market_cap_usd: rawToken.market_cap_usd || rawToken.marketCap || rawToken.market_cap || rawToken.fully_diluted_value || rawToken.fdv || 0,
    volume_24h: rawToken.volume_24h || rawToken.volume || 0,
    liquidity_usd: rawToken.liquidity_usd || rawToken.liquidity || rawToken.total_liquidity_usd || 0,

    // === Holder count (multiple field name variants) ===
    holders: holderValue,
    holder_count: holderValue,
    unique_wallets_24h: rawToken.unique_wallets_24h ?? holderValue,

    // === KOL count ===
    kol_count: rawToken.kol_count ?? 0,

    // === Transaction counts (all timeframes) ===
    total_buys_24h: rawToken.total_buys_24h ?? 0,
    total_sells_24h: rawToken.total_sells_24h ?? 0,
    total_buys_5m: rawToken.total_buys_5m ?? 0,
    total_sells_5m: rawToken.total_sells_5m ?? 0,
    total_buys_1h: rawToken.total_buys_1h ?? 0,
    total_sells_1h: rawToken.total_sells_1h ?? 0,
    total_buys_6h: rawToken.total_buys_6h ?? 0,
    total_sells_6h: rawToken.total_sells_6h ?? 0,

    // === Volume (all timeframes) ===
    total_buy_volume_24h: rawToken.total_buy_volume_24h ?? 0,
    total_sell_volume_24h: rawToken.total_sell_volume_24h ?? 0,
    total_buy_volume_5m: rawToken.total_buy_volume_5m ?? 0,
    total_sell_volume_5m: rawToken.total_sell_volume_5m ?? 0,
    total_buy_volume_1h: rawToken.total_buy_volume_1h ?? 0,
    total_sell_volume_1h: rawToken.total_sell_volume_1h ?? 0,
    total_buy_volume_6h: rawToken.total_buy_volume_6h ?? 0,
    total_sell_volume_6h: rawToken.total_sell_volume_6h ?? 0,

    // === Dev holding percentage (both field name variants) ===
    dev_percent: devPercentValue,
    dev_held_percentage: devPercentValue,

    // === Sniper percentage (both field name variants) ===
    sniper_percent: sniperPercentValue,
    sniper_held_percentage: sniperPercentValue,

    // === Insider percentage (both field name variants) ===
    insider_percent: insiderPercentValue,
    insider_held_percentage: insiderPercentValue,

    // === Bundle percentage (all field name variants) ===
    bundle_percent: bundlePercentValue,
    bundled_percentage: bundlePercentValue,
    bundler_held_percentage: bundlePercentValue,
    bundle_wallet_count: rawToken.bundle_wallet_count ?? 0,
    bundler_count: rawToken.bundle_wallet_count ?? rawToken.bundler_count ?? 0,

    // === Top holders percentage ===
    top10_holders_pct: rawToken.top10_holders_pct ?? rawToken.top_10_holders_percent ?? 0,

    // === Dev activity stats ===
    dev_tokens_created: rawToken.dev_tokens_created ?? 0,
    dev_tokens_migrated: rawToken.dev_tokens_migrated ?? 0,

    // === Bonding curve ===
    bonding_pct: rawToken.bonding_pct || rawToken.bonding_percent || rawToken.bondingCurveProgress || rawToken.bonding_curve_progress || 0,
    graduation_percent: rawToken.graduation_percent || rawToken.bonding_pct || 0,

    // === Pro traders ===
    pro_traders_count: rawToken.pro_traders_count ?? rawToken.pro_traders ?? 0,

    // === Fees / Gas ===
    total_fees_lamports: rawToken.total_fees_lamports ?? 0,
    global_fees_paid: rawToken.global_fees_paid ?? rawToken.globalFeesPaid ?? 0,
    globalFeesPaid: rawToken.globalFeesPaid ?? rawToken.global_fees_paid ?? 0,
  } as PulseToken;
}

function addToken(key: 'newTokens' | 'finalStretchTokens' | 'migratedTokens', token: PulseToken) {
  const arr = currentData[key];
  const filtered = arr.filter(t => t.mint !== token.mint);
  const maxSize = key === 'newTokens' ? 200 : 50;
  currentData[key] = [token, ...filtered].slice(0, maxSize);
}

function handlePriceUpdate(updates: any[]) {
  const updatesArray = Array.isArray(updates) ? updates : [updates];

  for (const update of updatesArray) {
    const mint = update.mint || update.address || update.mint_address;
    if (!mint) continue;

    for (const key of ['newTokens', 'finalStretchTokens', 'migratedTokens'] as const) {
      const arr = currentData[key];
      const idx = arr.findIndex(t => t.mint === mint);
      if (idx !== -1) {
        const token = arr[idx];
        currentData[key][idx] = {
          ...token,
          // Price
          price_usd: update.price_usd ?? update.price ?? token.price_usd,
          price_change_5m: update.price_change_5m ?? update.priceChange5m ?? token.price_change_5m,
          price_change_24h: update.price_change_24h ?? token.price_change_24h,

          // Market metrics
          market_cap_usd: update.market_cap_usd ?? update.marketCap ?? token.market_cap_usd,
          volume_24h: update.volume_24h ?? update.volume ?? token.volume_24h,
          liquidity_usd: update.liquidity_usd ?? update.liquidity ?? token.liquidity_usd,

          // Holders
          holders: update.holders ?? update.holder_count ?? token.holders,
          holder_count: update.holder_count ?? update.holders ?? token.holder_count,

          // Transaction counts
          total_buys_24h: update.total_buys_24h ?? token.total_buys_24h,
          total_sells_24h: update.total_sells_24h ?? token.total_sells_24h,
          total_buys_5m: update.total_buys_5m ?? token.total_buys_5m,
          total_sells_5m: update.total_sells_5m ?? token.total_sells_5m,
          total_buys_1h: update.total_buys_1h ?? token.total_buys_1h,
          total_sells_1h: update.total_sells_1h ?? token.total_sells_1h,
          total_buys_6h: update.total_buys_6h ?? token.total_buys_6h,
          total_sells_6h: update.total_sells_6h ?? token.total_sells_6h,

          // Volume timeframes
          total_buy_volume_5m: update.total_buy_volume_5m ?? token.total_buy_volume_5m,
          total_sell_volume_5m: update.total_sell_volume_5m ?? token.total_sell_volume_5m,
          total_buy_volume_1h: update.total_buy_volume_1h ?? token.total_buy_volume_1h,
          total_sell_volume_1h: update.total_sell_volume_1h ?? token.total_sell_volume_1h,
          total_buy_volume_6h: update.total_buy_volume_6h ?? token.total_buy_volume_6h,
          total_sell_volume_6h: update.total_sell_volume_6h ?? token.total_sell_volume_6h,
          total_buy_volume_24h: update.total_buy_volume_24h ?? token.total_buy_volume_24h,
          total_sell_volume_24h: update.total_sell_volume_24h ?? token.total_sell_volume_24h,

          // Percentages
          dev_percent: update.dev_percent ?? update.dev_held_percentage ?? token.dev_percent,
          dev_held_percentage: update.dev_held_percentage ?? update.dev_percent ?? token.dev_held_percentage,
          sniper_percent: update.sniper_percent ?? update.sniper_held_percentage ?? token.sniper_percent,
          sniper_held_percentage: update.sniper_held_percentage ?? update.sniper_percent ?? token.sniper_held_percentage,
          insider_percent: update.insider_percent ?? update.insider_held_percentage ?? token.insider_percent,
          insider_held_percentage: update.insider_held_percentage ?? update.insider_percent ?? token.insider_held_percentage,
          bundle_percent: update.bundle_percent ?? update.bundled_percentage ?? token.bundle_percent,
          bundled_percentage: update.bundled_percentage ?? update.bundle_percent ?? token.bundled_percentage,
          bundler_held_percentage: update.bundler_held_percentage ?? token.bundler_held_percentage,

          // Bonding curve
          bonding_pct: update.bonding_pct ?? update.bondingCurveProgress ?? token.bonding_pct,

          // KOL
          kol_count: update.kol_count ?? token.kol_count,

          // Pro traders
          pro_traders_count: update.pro_traders_count ?? token.pro_traders_count,

          // Gas / Fees
          total_fees_lamports: update.total_fees_lamports ?? token.total_fees_lamports,
          global_fees_paid: update.global_fees_paid ?? update.globalFeesPaid ?? token.global_fees_paid,
          globalFeesPaid: update.globalFeesPaid ?? update.global_fees_paid ?? token.globalFeesPaid,
        };
      }
    }
  }
}

function handleTokenInfoUpdate(update: any) {
  const mint = update.mint_address || update.mint || update.address;
  if (!mint) return;

  for (const key of ['newTokens', 'finalStretchTokens', 'migratedTokens'] as const) {
    const arr = currentData[key];
    const idx = arr.findIndex(t => t.mint === mint);
    if (idx !== -1) {
      currentData[key][idx] = {
        ...arr[idx],
        holder_count: update.holder_count ?? arr[idx].holder_count,
        kol_count: update.kol_count ?? arr[idx].kol_count,
      };
    }
  }
}

// Public API
export function getPulseData(): PulseData {
  return currentData;
}

export function getConnectionStatus(): ConnectionStatus {
  return connectionStatus;
}

export function subscribeToData(listener: DataListener): () => void {
  dataListeners.add(listener);
  return () => dataListeners.delete(listener);
}

export function subscribeToConnection(listener: ConnectionListener): () => void {
  connectionListeners.add(listener);
  return () => connectionListeners.delete(listener);
}

export function requestData(): void {
  worker?.postMessage({ type: 'GET_DATA' });
}

export function terminateWorker(): void {
  if (worker) {
    worker.postMessage({ type: 'DISCONNECT' });
    worker.terminate();
    worker = null;
    isInitialized = false;
    initPromise = null;
  }
  if (leaderCheckInterval) {
    clearInterval(leaderCheckInterval);
  }
  if (broadcastChannel) {
    broadcastChannel.close();
  }
}

function notifyDataListeners() {
  // Notify all listeners immediately - navigation blocking is handled in the hook
  dataListeners.forEach(fn => {
    try {
      fn(currentData);
    } catch (err) {
      console.error('[PulseWorkerBridge] Listener error:', err);
    }
  });
}

function notifyConnectionListeners() {
  connectionListeners.forEach(fn => {
    try {
      fn(connectionStatus);
    } catch (err) {
      console.error('[PulseWorkerBridge] Connection listener error:', err);
    }
  });
}
