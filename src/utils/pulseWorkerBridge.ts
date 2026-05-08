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

const isDev = process.env.NODE_ENV !== 'production';

import { loadPulseCache, savePulseCache, type PulseToken } from './pulseCache';
import { extractImageUrls, preloadImage } from './imagePreloader';
import { resolveMetadataImage, isMetadataUrl, getCachedResolvedImage, extractTokenImage } from './images';
import { computeHashImageUrl } from './imageHash';
import { patchMetadataIfPlaceholder } from './applyPriceUpdate';

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

// Cutoff timestamp for filtering stale messages from worker
// When tab becomes visible, we set this to ignore queued TOKEN_DELTA messages
// that were sent while the main thread was throttled
let messageCutoffTime = 0;

function scheduleSave() {
  const now = Date.now();
  // Throttle to every 2 seconds (reduced from 5 for better persistence)
  if (now - lastSaveTime < 2000) {
    if (!saveTimeout) {
      saveTimeout = setTimeout(() => {
        saveTimeout = null;
        lastSaveTime = Date.now();
        doSave();
      }, 2000);
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

  // Removed console.log to reduce CPU

  savePulseCache({
    newTokens: currentData.newTokens,
    finalStretchTokens: currentData.finalStretchTokens,
    migratedTokens: currentData.migratedTokens,
    timestamp: Date.now(),
  }).catch(() => { /* Silent fail - save errors are non-critical */ });
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
    isDev && console.log('[PulseWorkerBridge] BroadcastChannel not supported, starting worker directly');
    // Without BroadcastChannel, this tab becomes leader by default
    isLeader = true;
    startWorker(); // Start worker immediately!
    return;
  }

  broadcastChannel = new BroadcastChannel('pulse-websocket-sync');

  broadcastChannel.onmessage = (event) => {
    try {
      const { type, data, from } = event.data || {};

      switch (type) {
        case 'LEADER_HEARTBEAT':
          // Another tab is the leader
          if (from && from !== tabId) {
            leaderId = from;
            lastLeaderHeartbeat = Date.now();
            if (isLeader) {
              isDev && console.log('[PulseWorkerBridge] Another tab is leader, stepping down');
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
          if (from !== tabId && !isLeader && data) {
            // Validate data structure before using
            currentData = {
              newTokens: Array.isArray(data.newTokens) ? data.newTokens : currentData.newTokens,
              finalStretchTokens: Array.isArray(data.finalStretchTokens) ? data.finalStretchTokens : currentData.finalStretchTokens,
              migratedTokens: Array.isArray(data.migratedTokens) ? data.migratedTokens : currentData.migratedTokens,
            };
            notifyDataListeners();
            scheduleSave();
          }
          break;

        case 'CONNECTION_STATUS':
          // Receive connection status from leader
          if (from !== tabId && !isLeader && data) {
            connectionStatus = {
              new: !!data.new,
              final_stretch: !!data.final_stretch,
              migrated: !!data.migrated,
            };
            notifyConnectionListeners();
          }
          break;

        case 'REQUEST_DATA':
          // Another tab is asking for current data (e.g., just opened)
          if (isLeader && from && from !== tabId) {
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
    } catch (err) {
      console.error('[PulseWorkerBridge] BroadcastChannel error:', err);
    }
  };

  // Start leader election
  electLeader();
}

/**
 * Leader election: determine which tab should run the WebSocket
 *
 * FAST PATH: Start worker immediately, step down later if another leader exists.
 * This eliminates the 200ms delay on page load.
 */
function electLeader() {
  // Ask if there's an existing leader
  broadcastChannel?.postMessage({
    type: 'LEADER_ELECTION',
    from: tabId,
  });

  // START IMMEDIATELY - don't wait for responses
  // We'll step down if another leader responds within 200ms
  isDev && console.log('[PulseWorkerBridge] Starting as leader (optimistic)');
  isLeader = true;
  leaderId = tabId;
  startWorker();
  sendHeartbeat();

  // After 50ms, check if another tab claimed leadership
  // Reduced from 200ms for faster startup
  setTimeout(() => {
    const now = Date.now();
    // If we received a heartbeat from another leader, step down
    if (leaderId !== tabId && now - lastLeaderHeartbeat < 1000) {
      isDev && console.log('[PulseWorkerBridge] Another leader found, stepping down:', leaderId);
      isLeader = false;
      stopWorker();
      // Request current data from the actual leader
      broadcastChannel?.postMessage({
        type: 'REQUEST_DATA',
        from: tabId,
      });
    }
  }, 50);

  // Check for leader health periodically
  if (leaderCheckInterval) clearInterval(leaderCheckInterval);
  leaderCheckInterval = setInterval(() => {
    if (isLeader) {
      sendHeartbeat();
    } else {
      // Check if leader is still alive
      const now = Date.now();
      if (now - lastLeaderHeartbeat > 10000) {
        isDev && console.log('[PulseWorkerBridge] Leader timeout, starting election');
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
      try {
        const { type, payload, timestamp } = e.data;

        switch (type) {
          case 'DATA':
            // Validate payload before using
            if (payload && typeof payload === 'object') {
              currentData = {
                newTokens: Array.isArray(payload.newTokens) ? payload.newTokens : [],
                finalStretchTokens: Array.isArray(payload.finalStretchTokens) ? payload.finalStretchTokens : [],
                migratedTokens: Array.isArray(payload.migratedTokens) ? payload.migratedTokens : [],
              };
              notifyDataListeners();
              scheduleSave();
              scheduleBroadcast();

              // Clear cutoff when fresh DATA arrives (not on timer)
              // This ensures stale TOKEN_DELTAs are filtered until we have real data
              if (messageCutoffTime > 0) {
                messageCutoffTime = 0;
                // Removed console.log to reduce CPU
              }
            }
            break;

          case 'TOKEN_DELTA':
            // Filter out stale messages from the postMessage queue
            // These accumulated while the main thread was throttled in background
            if (messageCutoffTime > 0 && timestamp && timestamp < messageCutoffTime) {
              // This message was sent before we became visible - it's stale backlog
              // Skip it silently to avoid the 45-second lag
              return;
            }

            // Fast path: apply single token update immediately
            // Validate token has required fields
            if (payload?.token?.mint && payload?.deltaType) {
              applyTokenDelta(payload.deltaType, payload.token);
              notifyDataListeners();
              scheduleSave();
              scheduleBroadcast();
            }
            break;

          case 'DATA_UPDATED':
            worker?.postMessage({ type: 'GET_DATA' });
            break;

          case 'CONNECTION_STATUS':
            if (payload?.channel) {
              connectionStatus = {
                ...connectionStatus,
                [payload.channel]: !!payload.connected,
              };
              notifyConnectionListeners();
              broadcastChannel?.postMessage({
                type: 'CONNECTION_STATUS',
                data: connectionStatus,
                from: tabId,
              });
            }
            break;
        }
      } catch (err) {
        console.error('[PulseWorkerBridge] Message handler error:', err);
        // Don't crash the app - just log and continue
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

    isDev && console.log('[PulseWorkerBridge] Worker started (leader tab)');
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
    isDev && console.log('[PulseWorkerBridge] Already initialized');
    return;
  }

  wsBaseUrl = baseUrl;
  initPromise = doInit();
  return initPromise;
}

async function doInit(): Promise<void> {
  // FAST PATH: Start WebSocket IMMEDIATELY - don't wait for cache
  // Cache loading happens in parallel for fallback data

  // Initialize cross-tab communication and leader election FIRST
  // This starts the WebSocket worker immediately
  try {
    initBroadcastChannel();
  } catch (err) {
    console.warn('[PulseWorkerBridge] BroadcastChannel init failed (non-fatal):', err);
    // Fallback: become leader and start worker directly
    isLeader = true;
    startWorker();
  }

  isInitialized = true;

  // Handle tab close - if we're leader, another tab should take over
  // Also save cache to IndexedDB before leaving
  try {
    window.addEventListener('beforeunload', () => {
      // Save cache immediately (synchronous attempt for beforeunload)
      doSave();

      if (isLeader) {
        // Give other tabs a chance to become leader
        broadcastChannel?.postMessage({
          type: 'LEADER_LEAVING',
          from: tabId,
        });
      }
    });

    // Handle tab visibility changes - track time hidden for smart reconnect
    let hiddenAt = 0;
    const STALE_THRESHOLD_MS = 5000; // Filter stale messages if hidden for > 5 seconds

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        // Save immediately when user navigates away
        doSave();
        // Removed console.log to reduce CPU
      } else if (document.visibilityState === 'visible') {
        const hiddenDuration = hiddenAt > 0 ? Date.now() - hiddenAt : 0;
        // Removed console.log to reduce CPU

        // IMMEDIATE: Show existing data right away - no blank screen!
        // currentData still has cached tokens, just trigger re-render INSTANTLY
        // This is a SYNCHRONOUS operation - works on all devices regardless of CPU speed
        if (currentData.newTokens.length > 0 ||
            currentData.finalStretchTokens.length > 0 ||
            currentData.migratedTokens.length > 0) {
          notifyDataListeners(); // Triggers React re-render with existing data

          // Force browser repaint - fixes grey/white screen on tab return
          // Without this, browser may not repaint until user interaction (click)
          requestAnimationFrame(() => {
            document.body.style.transform = 'translateZ(0)';
            requestAnimationFrame(() => {
              document.body.style.transform = '';
            });
          });
        }

        // THEN request fresh data from worker (async, happens after UI is already showing)
        // If hidden long enough, the postMessage queue has stale TOKEN_DELTAs
        // Set cutoff to filter them out - worker's data is still fresh!
        if (hiddenDuration > STALE_THRESHOLD_MS && worker) {
          // Set cutoff timestamp - any TOKEN_DELTA older than this will be ignored
          messageCutoffTime = Date.now();

          // Ask worker for its FRESH data snapshot
          // Worker has been receiving WebSocket data the whole time (workers aren't throttled)
          worker.postMessage({ type: 'RECONNECT' });

          // Cutoff is cleared in worker.onmessage when fresh DATA arrives
          // This ensures we wait for actual fresh data, not arbitrary time
        } else {
          // Short absence - just request latest data, no filtering needed
          worker?.postMessage({ type: 'GET_DATA' });
        }

        hiddenAt = 0;
      }
    });
    window.addEventListener('online', () => {
      isDev && console.log('[PulseWorkerBridge] Network back online, forcing WebSocket reconnection');
      if (worker && isLeader) {
        worker.postMessage({ type: 'FORCE_RECONNECT' });
      }
    });
  } catch (err) {
    console.warn('[PulseWorkerBridge] Failed to add event listeners:', err);
  }

  // Load cached data IN PARALLEL (non-blocking)
  // This provides fallback data while WebSocket connects
  loadPulseCache()
    .then(cached => {
      if (cached) {
        // Only use cache if we don't already have live data
        const hasLiveData = currentData.newTokens.length > 0 ||
                           currentData.finalStretchTokens.length > 0 ||
                           currentData.migratedTokens.length > 0;

        if (!hasLiveData) {
          currentData = {
            newTokens: cached.newTokens || [],
            finalStretchTokens: cached.finalStretchTokens || [],
            migratedTokens: cached.migratedTokens || [],
          };
          // Removed console.log to reduce CPU
          notifyDataListeners();
        }
        // Removed else console.log to reduce CPU
      }
    })
    .catch(() => {
      // Silent fail - Continue without cache, WebSocket will provide data
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
  // Removed console.log to reduce CPU

  try {
    const ws = new WebSocket(url);

    ws.onopen = () => {
      connectionStatus[channel] = true;
      notifyConnectionListeners();
    };

    ws.onclose = () => {
      connectionStatus[channel] = false;
      notifyConnectionListeners();
      if (isLeader) {
        setTimeout(() => connectFallbackChannel(baseUrl, channel), 3000);
      }
    };

    ws.onerror = () => {
      // Silent fail - connection errors are handled by onclose
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
  } catch {
    // Silent fail - connection errors are non-critical
  }
}

function handleFallbackMessage(channel: 'new' | 'final_stretch' | 'migrated', data: any) {
  const msgType = data.type || data.event;

  // Helper to extract token(s) from various message formats
  const extractTokens = (msg: any): any[] => {
    if (msg.data) {
      return Array.isArray(msg.data) ? msg.data : [msg.data];
    }
    if (msg.token) {
      return [msg.token];
    }
    if (msg.tokens) {
      return Array.isArray(msg.tokens) ? msg.tokens : [msg.tokens];
    }
    // If the message itself has a mint, it might BE the token
    if (msg.mint || msg.address || msg.mint_address) {
      return [msg];
    }
    return [];
  };

  switch (msgType) {
    case 'new_token':
    case 'newToken':
    case 'new':
    case 'token_new':
      {
        const tokens = extractTokens(data);
        for (const t of tokens) {
          const normalized = normalizeToken(t);
          if (normalized) addToken('newTokens', normalized);
        }
      }
      break;

    case 'final_stretch_token':
    case 'finalStretch':
    case 'final_stretch':
    case 'completing':
    case 'token_final_stretch':
      {
        const tokens = extractTokens(data);
        for (const t of tokens) {
          const normalized = normalizeToken(t);
          if (normalized) addToken('finalStretchTokens', normalized);
        }
      }
      break;

    case 'migrated_token':
    case 'migrated':
    case 'migration':
    case 'completed':
    case 'token_migrated':
      {
        const tokens = extractTokens(data);
        for (const t of tokens) {
          const normalized = normalizeToken(t);
          if (normalized) addToken('migratedTokens', normalized);
        }
      }
      break;

    case 'price_update':
    case 'priceUpdate':
    case 'price':
      handlePriceUpdate(data.data || data.updates || [data]);
      break;

    case 'token_info_update':
    case 'tokenInfo':
    case 'token_info':
    case 'info':
      handleTokenInfoUpdate(data.data || data);
      break;

    // holder_count_update: live wallet-set transitions, throttled 500ms last-value-wins
    // per mint. Authoritative count (may be non-monotonic across VMs — by design).
    // Same handler as token_info_update: merges holder_count by mint, kol_count untouched.
    case 'holder_count_update':
    case 'holderCountUpdate':
      handleTokenInfoUpdate(data.data || data);
      break;

    default:
      // Try to infer from channel if no explicit type
      if (data.mint || data.address || data.mint_address) {
        const normalized = normalizeToken(data);
        if (normalized) {
          if (channel === 'new') {
            addToken('newTokens', normalized);
          } else if (channel === 'final_stretch') {
            addToken('finalStretchTokens', normalized);
          } else if (channel === 'migrated') {
            addToken('migratedTokens', normalized);
          }
        }
      }
      break;
  }
}

/**
 * Normalize token with ALL fields - MUST match pulseWorker.js normalizeToken exactly!
 * CRITICAL: Must include BOTH PulseToken AND Token (db.ts) field names for compatibility!
 * This is used for the fallback WebSocket and IndexedDB cache.
 */
function normalizeToken(rawToken: any): PulseToken | null {
  if (!rawToken) return null;

  const mint = rawToken.mint || rawToken.address || rawToken.mint_address || rawToken.token_address || rawToken.contract_address;
  if (!mint) return null;

  // Pre-compute common fallback values
  const holderValue = rawToken.holder_count ?? rawToken.holders ?? rawToken.total_holders ?? rawToken.unique_wallets_24h ?? 0;
  // Backend already sends percent values in 0-100 format, no conversion needed
  const devPercentValue = rawToken.dev_percent ?? rawToken.dev_held_percentage ?? 0;
  const sniperPercentValue = rawToken.sniper_percent ?? rawToken.sniper_held_percentage ?? 0;
  const insiderPercentValue = rawToken.insider_percent ?? rawToken.insider_held_percentage ?? 0;
  const bundlePercentValue = rawToken.bundle_percent ?? rawToken.bundled_percentage ?? 0;

  // Price values (Token type uses usd_price, price_percent_change_*)
  // Helper to parse string/number values from backend (backend often sends strings)
  const toNum = (val: any): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const parsed = parseFloat(val);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  // IMPORTANT: Backend sends these as STRINGS - must parseFloat!
  const priceValue = toNum(rawToken.price ?? rawToken.price_usd ?? rawToken.usd_price ?? rawToken.priceUsd ?? rawToken.priceUSD ?? 0);
  const priceChange5mValue = toNum(rawToken.price_change_5m ?? rawToken.priceChange5m ?? rawToken.price_percent_change_5m ?? 0);
  const priceChange1hValue = toNum(rawToken.price_change_1h ?? rawToken.priceChange1h ?? rawToken.price_percent_change_1h ?? 0);
  const priceChange6hValue = toNum(rawToken.price_change_6h ?? rawToken.priceChange6h ?? rawToken.price_percent_change_6h ?? 0);
  const priceChange24hValue = toNum(rawToken.price_change_24h ?? rawToken.priceChange24h ?? rawToken.price_percent_change_24h ?? 0);

  // Market metrics (Token type uses total_liquidity_usd, fully_diluted_value)
  // IMPORTANT: Backend sends these as STRINGS - must parseFloat!
  const marketCapValue = toNum(rawToken.market_cap_usd ?? rawToken.marketCap ?? rawToken.market_cap ?? rawToken.marketCapUSD ?? rawToken.fully_diluted_value ?? rawToken.fdv ?? rawToken.mcap ?? 0);
  const liquidityValue = toNum(rawToken.liquidity_usd ?? rawToken.liquidity ?? rawToken.liquidityUSD ?? rawToken.total_liquidity_usd ?? rawToken.liq ?? 0);
  const volumeValue = toNum(rawToken.volume_24h ?? rawToken.volume ?? rawToken.volume24h ?? 0);

  // Bonding curve (Token type uses bonding_curve_progress)
  // IMPORTANT: Backend sends this as STRING - must parseFloat!
  const bondingValue = toNum(rawToken.bonding_curve_progress ?? rawToken.bondingCurveProgress ?? rawToken.bonding_pct ?? rawToken.bonding_percent ?? 0);

  // NOTE: Do NOT spread ...rawToken - it may contain large nested objects
  // that cause memory bloat. Only include explicitly needed fields.
  return {
    // === Core identifiers ===
    mint,
    mint_address: mint,

    // === Basic info ===
    name: rawToken.name || rawToken.token_name || 'Unknown',
    symbol: rawToken.symbol || rawToken.token_symbol || '???',
    image: rawToken.image || rawToken.image_url || rawToken.image_uri || rawToken.imageUrl || rawToken.logo || undefined,
    image_url: rawToken.image_url || undefined,
    logo: rawToken.logo || rawToken.image || rawToken.image_url || rawToken.image_uri || undefined,
    uri: rawToken.uri || undefined,
    status: rawToken.status || 'active',
    launchpad_protocol: rawToken.launchpad_protocol || rawToken.protocol || 'pumpfun',
    pair_address: rawToken.pair_address || undefined,

    // === CRITICAL: created_at for age display ===
    // Backend sends launch_time as ISO string (e.g., "2025-01-22T10:30:00Z")
    // Need to handle both timestamp and ISO string formats
    created_at: (() => {
      const val = rawToken.launch_time || rawToken.created_at || rawToken.createdAt;
      if (!val) return Date.now();
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        // If it's an ISO string, convert to timestamp
        const parsed = new Date(val).getTime();
        return isNaN(parsed) ? Date.now() : parsed;
      }
      return Date.now();
    })(),
    launch_time: rawToken.launch_time || rawToken.created_at || rawToken.createdAt,

    // === Mayhem Mode flag ===
    // Boolean from backend; normalizeToken explicitly enumerates fields
    // (no ...rawToken spread), so this needs to be threaded through manually.
    is_mayhem_mode: !!rawToken.is_mayhem_mode,

    // === Price data (ALL format variants for Token + PulseToken compatibility) ===
    price: priceValue,
    price_usd: priceValue,
    usd_price: priceValue, // Token type uses usd_price
    priceChange5m: priceChange5mValue,
    price_change_5m: priceChange5mValue,
    price_percent_change_5m: priceChange5mValue, // Token type uses price_percent_change_*
    price_change_1h: priceChange1hValue,
    price_percent_change_1h: priceChange1hValue,
    price_change_6h: priceChange6hValue,
    price_percent_change_6h: priceChange6hValue,
    price_change_24h: priceChange24hValue,
    price_percent_change_24h: priceChange24hValue,

    // === Market metrics (ALL format variants) ===
    marketCap: marketCapValue,
    market_cap_usd: marketCapValue,
    fully_diluted_value: marketCapValue, // Token type uses this
    volume: volumeValue,
    volume_24h: volumeValue,
    liquidity: liquidityValue,
    liquidity_usd: liquidityValue,
    total_liquidity_usd: liquidityValue, // Token type uses total_liquidity_usd

    // === Holder count (ALL field name variants) ===
    holders: holderValue,
    holder_count: holderValue,
    total_holders: holderValue, // Token type uses total_holders
    unique_wallets_24h: toNum(rawToken.unique_wallets_24h) || holderValue,

    // === KOL count ===
    kol_count: rawToken.kol_count ?? 0,

    // === Transaction counts (all timeframes) ===
    // NOTE: total_buys_* = number of buy transactions, total_buyers_* = unique buyer wallets
    total_buys_24h: toNum(rawToken.total_buys_24h ?? 0),
    total_sells_24h: toNum(rawToken.total_sells_24h ?? 0),
    total_buys_5m: toNum(rawToken.total_buys_5m ?? 0),
    total_sells_5m: toNum(rawToken.total_sells_5m ?? 0),
    total_buys_1h: toNum(rawToken.total_buys_1h ?? 0),
    total_sells_1h: toNum(rawToken.total_sells_1h ?? 0),
    total_buys_6h: toNum(rawToken.total_buys_6h ?? 0),
    total_sells_6h: toNum(rawToken.total_sells_6h ?? 0),
    txns: rawToken.txns || { buys: 0, sells: 0 },

    // === Unique buyers/sellers counts (different from transaction counts!) ===
    // Backend sends total_buyers_* (unique wallet count) vs total_buys_* (transaction count)
    total_buyers_5m: toNum(rawToken.total_buyers_5m ?? 0),
    total_sellers_5m: toNum(rawToken.total_sellers_5m ?? 0),
    total_buyers_1h: toNum(rawToken.total_buyers_1h ?? 0),
    total_sellers_1h: toNum(rawToken.total_sellers_1h ?? 0),
    total_buyers_6h: toNum(rawToken.total_buyers_6h ?? 0),
    total_sellers_6h: toNum(rawToken.total_sellers_6h ?? 0),
    total_buyers_24h: toNum(rawToken.total_buyers_24h ?? 0),
    total_sellers_24h: toNum(rawToken.total_sellers_24h ?? 0),

    // === Unique wallets (all timeframes) ===
    unique_wallets_5m: toNum(rawToken.unique_wallets_5m ?? 0),
    unique_wallets_1h: toNum(rawToken.unique_wallets_1h ?? 0),
    unique_wallets_6h: toNum(rawToken.unique_wallets_6h ?? 0),

    // === Volume (all timeframes) - IMPORTANT: Backend sends as strings ===
    total_buy_volume_24h: toNum(rawToken.total_buy_volume_24h ?? 0),
    total_sell_volume_24h: toNum(rawToken.total_sell_volume_24h ?? 0),
    total_buy_volume_5m: toNum(rawToken.total_buy_volume_5m ?? 0),
    total_sell_volume_5m: toNum(rawToken.total_sell_volume_5m ?? 0),
    total_buy_volume_1h: toNum(rawToken.total_buy_volume_1h ?? 0),
    total_sell_volume_1h: toNum(rawToken.total_sell_volume_1h ?? 0),
    total_buy_volume_6h: toNum(rawToken.total_buy_volume_6h ?? 0),
    total_sell_volume_6h: toNum(rawToken.total_sell_volume_6h ?? 0),

    // === Dev holding percentage (both field name variants) ===
    dev_percent: devPercentValue,
    dev_held_percentage: devPercentValue,

    // === Sniper percentage (both field name variants) ===
    sniper_percent: sniperPercentValue,
    sniper_held_percentage: sniperPercentValue,
    total_snipers: rawToken.total_snipers ?? 0, // Token type field

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

    // === Bonding curve (ALL format variants) ===
    bondingCurveProgress: bondingValue,
    bonding_curve_progress: bondingValue, // Token type uses bonding_curve_progress
    bonding_pct: bondingValue,
    graduation_percent: rawToken.graduation_percent || bondingValue,

    // === Pro traders / Smart money ===
    pro_traders_count: rawToken.pro_traders_count ?? rawToken.pro_traders ?? 0,
    smart_money_count: rawToken.smart_money_count ?? 0,

    // === Fees / Gas ===
    total_fees_lamports: rawToken.total_fees_lamports ?? 0,
    global_fees_paid: rawToken.global_fees_paid ?? rawToken.globalFeesPaid ?? 0,
    globalFeesPaid: rawToken.globalFeesPaid ?? rawToken.global_fees_paid ?? 0,

    // === Trade info ===
    trade_type: rawToken.trade_type || undefined,
    sol_amount: rawToken.sol_amount ?? 0,
    token_amount: rawToken.token_amount ?? 0,

    // === Migrated pool (Token type field) ===
    migrated_pool_address: rawToken.migrated_pool_address || undefined,

    // === String versions (some components may expect these) ===
    priceUSD: String(priceValue),
    marketCapUSD: String(marketCapValue),
    volume24h: String(volumeValue),
    liquidityUSD: String(liquidityValue),
  } as PulseToken;
}

/**
 * Proactively resolve metadata + preload the resolved image the moment a new
 * token arrives from the WS, BEFORE React renders. With the 500ms notify
 * throttle, this gives the metadata fetch a 200-500ms head start. By the time
 * TokenImage mounts and reads getCachedResolvedImage(), the resolved URL is
 * synchronously available; by the time FastImage's isImageTracked() runs, the
 * actual image bytes are in the browser cache.
 *
 * Closest analog to GMGN's UX without a backend change: their backend pushes
 * pre-resolved image_url; we still fetch metadata client-side, but we hide
 * the latency under React render time instead of stacking it on top.
 */
const prewarmedMints = new Set<string>();
function prewarmTokenImage(token: PulseToken) {
  if (typeof window === 'undefined') return;
  if (!token?.mint || prewarmedMints.has(token.mint)) return;
  prewarmedMints.add(token.mint);
  // Cap the set to prevent unbounded growth across long sessions
  if (prewarmedMints.size > 5000) {
    const oldest = prewarmedMints.values().next().value;
    if (oldest) prewarmedMints.delete(oldest);
  }

  const raw = extractTokenImage(token);
  const uriFallback = (token as any)?.uri || null;

  // Helper: resolve a metadata URI and preload the resolved image
  const resolveAndPreload = (metaUrl: string) => {
    const cached = getCachedResolvedImage(metaUrl, true);
    if (cached) {
      const proxyUrl = computeHashImageUrl(cached) || cached;
      preloadImage(proxyUrl);
      return;
    }
    resolveMetadataImage(metaUrl, true).then((resolved) => {
      if (!resolved) return;
      const proxyUrl = computeHashImageUrl(resolved) || resolved;
      preloadImage(proxyUrl);
    }).catch(() => { /* silent */ });
  };

  // Direct image URL — preload through proxy.
  // SPECIAL CASE: cdn.interstate.so/{mint}.webp 404s for fresh pump tokens
  // until the CDN is warmed (typically minutes). When we have a uri fallback,
  // skip the CDN preload entirely — it would just generate a flood of 404s.
  // The uri-resolved image is preloaded instead, and FastImage's onLoadFailed
  // → directImageFailed swap (in PulseTable.TokenImage) handles the runtime
  // case if the CDN attempt also fails.
  if (raw && !isMetadataUrl(raw)) {
    const isInterstateCdn = raw.includes("cdn.interstate.so/");
    const hasUriFallback =
      uriFallback && uriFallback !== raw && isMetadataUrl(uriFallback);

    if (isInterstateCdn && hasUriFallback) {
      // Skip CDN preload — go straight to uri so we don't pollute the network
      // log with 404s for tokens whose CDN entry isn't warmed yet.
      resolveAndPreload(uriFallback);
      return;
    }

    const proxyUrl = computeHashImageUrl(raw) || raw;
    preloadImage(proxyUrl);
    if (hasUriFallback) {
      resolveAndPreload(uriFallback);
    }
    return;
  }

  // Metadata URI as the primary — resolve and preload
  if (raw && isMetadataUrl(raw)) {
    resolveAndPreload(raw);
    return;
  }

  // No raw at all but a uri exists — fall through to uri
  if (uriFallback && isMetadataUrl(uriFallback)) {
    resolveAndPreload(uriFallback);
  }
}

function addToken(key: 'newTokens' | 'finalStretchTokens' | 'migratedTokens', token: PulseToken) {
  const arr = currentData[key];
  const existing = arr.find(t => t.mint === token.mint);
  const filtered = existing ? arr.filter(t => t.mint !== token.mint) : arr;
  const maxSize = key === 'finalStretchTokens' ? 50 : 200;

  // Preserve original timestamps so TokenAge timer doesn't reset on WS updates
  let finalToken = token;
  if (existing) {
    finalToken = {
      ...token,
      created_at: existing.created_at || token.created_at,
      launch_time: existing.launch_time || token.launch_time,
    };
  }

  // CRITICAL: Create a NEW currentData object so useSyncExternalStore detects the change
  // Object.is() compares references - same reference = no re-render
  currentData = {
    ...currentData,
    [key]: [finalToken, ...filtered].slice(0, maxSize),
  };

  // Pre-warm image: resolve metadata + preload bytes before React renders
  if (!existing) prewarmTokenImage(finalToken);
}

/**
 * Apply a single token delta update - fast path for real-time updates
 * This is MUCH faster than receiving full 300-token DATA updates
 */
function applyTokenDelta(deltaType: string, token: PulseToken) {
  if (!token || !token.mint) return;

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
    case 'price_update':
    case 'token_info':
      // Update existing token with new data (price, holder count, etc.)
      // CRITICAL: Create new object reference so useSyncExternalStore detects change
      {
        let updated = false;
        const newData = { ...currentData };

        for (const key of ['newTokens', 'finalStretchTokens', 'migratedTokens'] as const) {
          const arr = currentData[key];
          const idx = arr.findIndex(t => t.mint === token.mint);
          if (idx !== -1) {
            // Create new array with updated token, preserving original timestamps
            const existing = arr[idx];
            const newArr = [...arr];
            newArr[idx] = {
              ...existing,
              ...token,
              created_at: existing.created_at || token.created_at,
              launch_time: existing.launch_time || token.launch_time,
            };
            newData[key] = newArr;
            updated = true;
          }
        }

        if (updated) {
          currentData = newData;
        }
      }
      break;
  }
}

function handlePriceUpdate(updates: any[]) {
  const updatesArray = Array.isArray(updates) ? updates : [updates];
  let newData = { ...currentData };
  let anyUpdated = false;

  // Helper to parse string/number values - returns null if not present
  // CRITICAL: Different from toNum - returns null instead of 0 so we can detect missing fields
  const getNum = (val: any): number | null => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const parsed = parseFloat(val);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  };

  for (const update of updatesArray) {
    const mint = update.mint || update.address || update.mint_address;
    if (!mint) continue;

    for (const key of ['newTokens', 'finalStretchTokens', 'migratedTokens'] as const) {
      const arr = newData[key];
      const idx = arr.findIndex(t => t.mint === mint);
      if (idx !== -1) {
        const token = arr[idx] as any;

        // Compute updated values with all format variants
        // IMPORTANT: Use getNum to parse strings, fall back to existing token value
        // Helper: for non-negative metrics, never overwrite a non-zero value with 0
        const keepIfPositive = (newVal: any, existing: any) => newVal > 0 ? newVal : existing;

        const priceValue = getNum(update.price ?? update.price_usd ?? update.usd_price ?? update.priceUSD) ?? token.price;
        const priceChange5mValue = getNum(update.price_change_5m ?? update.priceChange5m ?? update.price_percent_change_5m) ?? token.price_change_5m;
        const priceChange1hValue = getNum(update.price_change_1h ?? update.priceChange1h ?? update.price_percent_change_1h) ?? token.price_change_1h;
        const priceChange6hValue = getNum(update.price_change_6h ?? update.priceChange6h ?? update.price_percent_change_6h) ?? token.price_change_6h;
        const priceChange24hValue = getNum(update.price_change_24h ?? update.priceChange24h ?? update.price_percent_change_24h) ?? token.price_change_24h;
        const marketCapValue = keepIfPositive(getNum(update.market_cap_usd ?? update.marketCap ?? update.market_cap ?? update.marketCapUSD ?? update.fully_diluted_value), token.market_cap_usd);
        const liquidityValue = keepIfPositive(getNum(update.liquidity_usd ?? update.liquidity ?? update.liquidityUSD ?? update.total_liquidity_usd), token.liquidity_usd);
        const volumeValue = keepIfPositive(getNum(update.volume_24h ?? update.volume ?? update.volume24h), token.volume_24h);
        const holderValue = keepIfPositive(getNum(update.holders ?? update.holder_count ?? update.total_holders), token.holders);
        const bondingValue = keepIfPositive(getNum(update.bonding_curve_progress ?? update.bondingCurveProgress ?? update.bonding_pct), token.bonding_curve_progress);

        // Create new array to trigger React re-render
        const newArr = [...arr];
        newArr[idx] = {
          ...token,
          // Price (ALL format variants for Token + PulseToken)
          price: priceValue,
          price_usd: priceValue,
          usd_price: priceValue, // Token type
          priceChange5m: priceChange5mValue,
          price_change_5m: priceChange5mValue,
          price_percent_change_5m: priceChange5mValue, // Token type
          price_change_1h: priceChange1hValue,
          price_percent_change_1h: priceChange1hValue, // Token type
          price_change_6h: priceChange6hValue,
          price_percent_change_6h: priceChange6hValue, // Token type
          price_change_24h: priceChange24hValue,
          price_percent_change_24h: priceChange24hValue, // Token type

          // Market metrics (ALL format variants)
          marketCap: marketCapValue,
          market_cap_usd: marketCapValue,
          fully_diluted_value: marketCapValue, // Token type
          volume: volumeValue,
          volume_24h: volumeValue,
          liquidity: liquidityValue,
          liquidity_usd: liquidityValue,
          total_liquidity_usd: liquidityValue, // Token type

          // Holders (ALL format variants)
          holders: holderValue,
          holder_count: holderValue,
          total_holders: holderValue, // Token type

          // Transaction counts (use getNum to handle strings)
          total_buys_24h: keepIfPositive(getNum(update.total_buys_24h), token.total_buys_24h),
          total_sells_24h: keepIfPositive(getNum(update.total_sells_24h), token.total_sells_24h),
          total_buys_5m: keepIfPositive(getNum(update.total_buys_5m), token.total_buys_5m),
          total_sells_5m: keepIfPositive(getNum(update.total_sells_5m), token.total_sells_5m),
          total_buys_1h: keepIfPositive(getNum(update.total_buys_1h), token.total_buys_1h),
          total_sells_1h: keepIfPositive(getNum(update.total_sells_1h), token.total_sells_1h),
          total_buys_6h: keepIfPositive(getNum(update.total_buys_6h), token.total_buys_6h),
          total_sells_6h: keepIfPositive(getNum(update.total_sells_6h), token.total_sells_6h),
          txns: keepIfPositive(update.txns, token.txns),

          // Unique buyers/sellers counts (different from transaction counts!)
          total_buyers_5m: keepIfPositive(getNum(update.total_buyers_5m), token.total_buyers_5m),
          total_sellers_5m: keepIfPositive(getNum(update.total_sellers_5m), token.total_sellers_5m),
          total_buyers_1h: keepIfPositive(getNum(update.total_buyers_1h), token.total_buyers_1h),
          total_sellers_1h: keepIfPositive(getNum(update.total_sellers_1h), token.total_sellers_1h),
          total_buyers_6h: keepIfPositive(getNum(update.total_buyers_6h), token.total_buyers_6h),
          total_sellers_6h: keepIfPositive(getNum(update.total_sellers_6h), token.total_sellers_6h),
          total_buyers_24h: keepIfPositive(getNum(update.total_buyers_24h), token.total_buyers_24h),
          total_sellers_24h: keepIfPositive(getNum(update.total_sellers_24h), token.total_sellers_24h),

          // Unique wallets (all timeframes)
          unique_wallets_5m: keepIfPositive(getNum(update.unique_wallets_5m), token.unique_wallets_5m),
          unique_wallets_1h: keepIfPositive(getNum(update.unique_wallets_1h), token.unique_wallets_1h),
          unique_wallets_6h: keepIfPositive(getNum(update.unique_wallets_6h), token.unique_wallets_6h),
          unique_wallets_24h: keepIfPositive(getNum(update.unique_wallets_24h), token.unique_wallets_24h),

          // Volume timeframes (use getNum to handle strings)
          total_buy_volume_5m: keepIfPositive(getNum(update.total_buy_volume_5m), token.total_buy_volume_5m),
          total_sell_volume_5m: keepIfPositive(getNum(update.total_sell_volume_5m), token.total_sell_volume_5m),
          total_buy_volume_1h: keepIfPositive(getNum(update.total_buy_volume_1h), token.total_buy_volume_1h),
          total_sell_volume_1h: keepIfPositive(getNum(update.total_sell_volume_1h), token.total_sell_volume_1h),
          total_buy_volume_6h: keepIfPositive(getNum(update.total_buy_volume_6h), token.total_buy_volume_6h),
          total_sell_volume_6h: keepIfPositive(getNum(update.total_sell_volume_6h), token.total_sell_volume_6h),
          total_buy_volume_24h: keepIfPositive(getNum(update.total_buy_volume_24h), token.total_buy_volume_24h),
          total_sell_volume_24h: keepIfPositive(getNum(update.total_sell_volume_24h), token.total_sell_volume_24h),

          // Percentages
          dev_percent: keepIfPositive(update.dev_percent ?? update.dev_held_percentage, token.dev_percent),
          dev_held_percentage: keepIfPositive(update.dev_held_percentage ?? update.dev_percent, token.dev_held_percentage),
          sniper_percent: keepIfPositive(update.sniper_percent ?? update.sniper_held_percentage, token.sniper_percent),
          sniper_held_percentage: keepIfPositive(update.sniper_held_percentage ?? update.sniper_percent, token.sniper_held_percentage),
          total_snipers: keepIfPositive(update.total_snipers, token.total_snipers),
          insider_percent: keepIfPositive(update.insider_percent ?? update.insider_held_percentage, token.insider_percent),
          insider_held_percentage: keepIfPositive(update.insider_held_percentage ?? update.insider_percent, token.insider_held_percentage),
          bundle_percent: keepIfPositive(update.bundle_percent ?? update.bundled_percentage, token.bundle_percent),
          bundled_percentage: keepIfPositive(update.bundled_percentage ?? update.bundle_percent, token.bundled_percentage),
          bundler_held_percentage: keepIfPositive(update.bundler_held_percentage, token.bundler_held_percentage),

          // Bonding curve (ALL format variants)
          bondingCurveProgress: bondingValue,
          bonding_curve_progress: bondingValue, // Token type
          bonding_pct: bondingValue,

          // KOL
          kol_count: keepIfPositive(update.kol_count, token.kol_count),

          // Pro traders / Smart money
          pro_traders_count: keepIfPositive(update.pro_traders_count, token.pro_traders_count),
          smart_money_count: keepIfPositive(update.smart_money_count, token.smart_money_count),

          // Gas / Fees
          total_fees_lamports: keepIfPositive(getNum(update.total_fees_lamports), token.total_fees_lamports),
          global_fees_paid: keepIfPositive(getNum(update.global_fees_paid ?? update.globalFeesPaid), token.global_fees_paid),
          globalFeesPaid: keepIfPositive(getNum(update.globalFeesPaid ?? update.global_fees_paid), token.globalFeesPaid),

          // String versions (some components may expect these)
          priceUSD: String(priceValue),
          marketCapUSD: String(marketCapValue),
          volume24h: String(volumeValue),
          liquidityUSD: String(liquidityValue),

          // Metadata: only patch when current is empty/placeholder
          ...patchMetadataIfPlaceholder(token, update),
        };
        newData[key] = newArr;
        anyUpdated = true;
      }
    }
  }

  // Only update if we actually changed something
  if (anyUpdated) {
    currentData = newData;
  }
}

function handleTokenInfoUpdate(update: any) {
  const mint = update.mint_address || update.mint || update.address;
  if (!mint) return;

  let newData = { ...currentData };
  let anyUpdated = false;

  for (const key of ['newTokens', 'finalStretchTokens', 'migratedTokens'] as const) {
    const arr = newData[key];
    const idx = arr.findIndex(t => t.mint === mint);
    if (idx !== -1) {
      // Create new array to trigger React re-render
      const newArr = [...arr];
      newArr[idx] = {
        ...arr[idx],
        holder_count: update.holder_count ?? arr[idx].holder_count,
        kol_count: update.kol_count ?? arr[idx].kol_count,
      };
      newData[key] = newArr;
      anyUpdated = true;
    }
  }

  if (anyUpdated) {
    currentData = newData;
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

/**
 * Reload cache from IndexedDB if bridge has no data
 * Call this when a component mounts to ensure data is available
 */
export async function ensureDataLoaded(): Promise<void> {
  // Check if we already have data
  const hasData = currentData.newTokens.length > 0 ||
                  currentData.finalStretchTokens.length > 0 ||
                  currentData.migratedTokens.length > 0;

  // Removed console.log to reduce CPU

  if (hasData) {
    return; // Already have data, no need to reload
  }

  // No data - try to load from IndexedDB cache
  try {
    const cached = await loadPulseCache();
    if (cached) {
      currentData = {
        newTokens: cached.newTokens || [],
        finalStretchTokens: cached.finalStretchTokens || [],
        migratedTokens: cached.migratedTokens || [],
      };
      notifyDataListeners();
    }
    // Silent if cache empty
  } catch {
    // Silent fail - cache reload is non-critical
  }
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

/**
 * Background image pre-warming
 * Preloads top token images from each list even while on trade pages.
 * Throttled to 5-second intervals to avoid bandwidth contention.
 */
let lastPreloadTime = 0;
const PRELOAD_INTERVAL_MS = 5000;
const PRELOAD_PER_LIST = 30;

function backgroundPreloadImages() {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (now - lastPreloadTime < PRELOAD_INTERVAL_MS) return;
  lastPreloadTime = now;

  // Collect top tokens from each list
  const topTokens = [
    ...currentData.newTokens.slice(0, PRELOAD_PER_LIST),
    ...currentData.finalStretchTokens.slice(0, PRELOAD_PER_LIST),
    ...currentData.migratedTokens.slice(0, PRELOAD_PER_LIST),
  ];

  if (topTokens.length === 0) return;

  const urls = extractImageUrls(topTokens);
  // Fire-and-forget; preloadImage already dedupes via preloadedImages Set
  for (const url of urls) {
    preloadImage(url);
  }
}

// Leading-edge throttled listener notifications.
// Fires immediately on the first call (so initial data load has zero delay),
// then throttles subsequent calls to max 2/sec (500ms interval).
// This frees the main thread for the TokenAge rAF clock to tick smoothly.
let notifyTimer: ReturnType<typeof setTimeout> | null = null;
let lastNotifyTime = 0;
const NOTIFY_INTERVAL_MS = 500;

function notifyDataListeners() {
  const now = Date.now();
  const elapsed = now - lastNotifyTime;

  // Leading edge: enough time has passed — fire immediately
  if (elapsed >= NOTIFY_INTERVAL_MS) {
    lastNotifyTime = now;
    if (notifyTimer !== null) {
      clearTimeout(notifyTimer);
      notifyTimer = null;
    }
    dataListeners.forEach(fn => {
      try { fn(currentData); } catch (err) { /* silent */ }
    });
    backgroundPreloadImages();
    return;
  }

  // Trailing edge: schedule a flush for the remaining time (if not already scheduled)
  if (notifyTimer !== null) return;

  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    lastNotifyTime = Date.now();
    dataListeners.forEach(fn => {
      try { fn(currentData); } catch (err) { /* silent */ }
    });
    backgroundPreloadImages();
  }, NOTIFY_INTERVAL_MS - elapsed);
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
