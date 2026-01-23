/**
 * Pulse WebSocket Worker
 *
 * Runs WebSocket connections in a separate thread so they
 * CANNOT block the main thread (React/Navigation).
 */

// Data storage
let newTokens = [];
let finalStretchTokens = [];
let migratedTokens = [];

// WebSocket connections
let wsConnections = {};
let wsBaseUrl = '';

// Track last message time per channel for health monitoring
let lastMessageTime = {
  new: 0,
  final_stretch: 0,
  migrated: 0,
};

// Health check interval - reconnect if no messages for 60 seconds
const HEALTH_CHECK_INTERVAL = 30000; // Check every 30 seconds
const STALE_THRESHOLD = 60000; // Consider stale if no message for 60 seconds

// Max tokens per category
const MAX_NEW = 200;
const MAX_FINAL = 50;
const MAX_MIGRATED = 50;

// Delta update system - sends only changed tokens for maximum speed
// Full DATA updates are only used for GET_DATA requests (new tabs connecting)

// Debug counters - set DEBUG_MODE = true to enable logging
const DEBUG_MODE = false;
let tokenCounter = { new: 0, final_stretch: 0, migrated: 0, price_update: 0, token_info: 0 };
let lastDebugLog = 0;

function debugLog(type) {
  if (!DEBUG_MODE) return;
  tokenCounter[type] = (tokenCounter[type] || 0) + 1;
  const now = Date.now();
  if (now - lastDebugLog > 5000) {
    lastDebugLog = now;
    console.log('[PulseWorker] Token counts (last 5s):', { ...tokenCounter });
    tokenCounter = { new: 0, final_stretch: 0, migrated: 0, price_update: 0, token_info: 0 };
  }
}

/**
 * Send delta update for a single token (fast, minimal data)
 * This is the primary update mechanism - sends 1 token instead of 300
 */
function sendTokenDelta(type, token) {
  debugLog(type);
  const timestamp = Date.now();
  if (DEBUG_MODE && type === 'new') {
    console.log(`[PulseWorker] 🚀 SEND delta ${type}: ${token.symbol} at ${timestamp}`);
  }
  self.postMessage({
    type: 'TOKEN_DELTA',
    payload: { deltaType: type, token },
    timestamp: timestamp, // Used by bridge to filter stale queued messages
  });
}

// Message handler from main thread
self.onmessage = function(e) {
  const { type, payload } = e.data;

  switch (type) {
    case 'INIT':
      wsBaseUrl = payload.wsBaseUrl || '';
      if (payload.initialData) {
        newTokens = payload.initialData.newTokens || [];
        finalStretchTokens = payload.initialData.finalStretchTokens || [];
        migratedTokens = payload.initialData.migratedTokens || [];
      }
      connectAll();
      break;

    case 'GET_DATA':
      self.postMessage({
        type: 'DATA',
        payload: {
          newTokens: newTokens.slice(0, MAX_NEW),
          finalStretchTokens: finalStretchTokens.slice(0, MAX_FINAL),
          migratedTokens: migratedTokens.slice(0, MAX_MIGRATED),
        }
      });
      break;

    case 'DISCONNECT':
      disconnectAll();
      break;

    case 'RECONNECT':
      // Tab became visible after being hidden
      // DON'T clear data - the worker has FRESH data from WebSocket
      // The stale data is in the postMessage QUEUE on main thread, not here
      console.log('[PulseWorker] RECONNECT requested - sending fresh data snapshot');

      // Send current FRESH data immediately
      // Bridge will use cutoff timestamp to ignore stale queued messages
      self.postMessage({
        type: 'DATA',
        payload: {
          newTokens: newTokens.slice(0, MAX_NEW),
          finalStretchTokens: finalStretchTokens.slice(0, MAX_FINAL),
          migratedTokens: migratedTokens.slice(0, MAX_MIGRATED),
        },
        timestamp: Date.now(), // Bridge uses this to know this is fresh
      });
      break;
  }
};

let healthCheckInterval = null;

function connectAll() {
  if (!wsBaseUrl) {
    console.log('[PulseWorker] No wsBaseUrl provided');
    return;
  }

  connectChannel('new');
  connectChannel('final_stretch');
  connectChannel('migrated');

  // Start health check to detect silent disconnections
  if (!healthCheckInterval) {
    healthCheckInterval = setInterval(checkConnectionHealth, HEALTH_CHECK_INTERVAL);
  }
}

// Check if connections are healthy (receiving data)
function checkConnectionHealth() {
  const now = Date.now();
  const channels = ['new', 'final_stretch', 'migrated'];

  for (const channel of channels) {
    const lastMsg = lastMessageTime[channel];
    const timeSinceLastMsg = now - lastMsg;

    // If we have a connection but haven't received data in a while, reconnect
    if (wsConnections[channel] && lastMsg > 0 && timeSinceLastMsg > STALE_THRESHOLD) {
      console.log(`[PulseWorker] Channel ${channel} appears stale (${timeSinceLastMsg}ms since last message), reconnecting...`);

      // Force close and reconnect
      try {
        wsConnections[channel].close();
      } catch (e) {
        // Ignore close errors
      }
      wsConnections[channel] = null;
      connectChannel(channel);
    }
  }
}

function disconnectAll() {
  // Clear health check interval
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }

  Object.values(wsConnections).forEach(ws => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });
  wsConnections = {};
}

function connectChannel(channel) {
  if (wsConnections[channel]) return;

  const url = `${wsBaseUrl}/v1/stream?channel=${channel}`;
  console.log(`[PulseWorker] Connecting to ${channel}:`, url);

  try {
    const ws = new WebSocket(url);
    wsConnections[channel] = ws;

    ws.onopen = () => {
      console.log(`[PulseWorker] Connected: ${channel}`);
      self.postMessage({ type: 'CONNECTION_STATUS', payload: { channel, connected: true } });
    };

    ws.onclose = () => {
      console.log(`[PulseWorker] Disconnected: ${channel}`);
      self.postMessage({ type: 'CONNECTION_STATUS', payload: { channel, connected: false } });
      wsConnections[channel] = null;
      setTimeout(() => connectChannel(channel), 3000);
    };

    ws.onerror = (err) => {
      console.error(`[PulseWorker] Error on ${channel}:`, err);
    };

    ws.onmessage = (event) => {
      // Track last message time for health monitoring
      lastMessageTime[channel] = Date.now();

      try {
        const messages = event.data.split('\n').filter(msg => msg.trim());
        for (const msgStr of messages) {
          try {
            const data = JSON.parse(msgStr);
            // Debug: log every message received (comment out in production)
            // console.log(`[PulseWorker] WS ${channel}:`, data.type || data.event, data);
            handleMessage(channel, data);
          } catch (parseErr) {
            // Skip malformed JSON but don't crash
            console.warn(`[PulseWorker] JSON parse error on ${channel}:`, parseErr.message);
          }
        }
      } catch (err) {
        // Catch any other errors (e.g., event.data being null)
        console.error(`[PulseWorker] Message processing error on ${channel}:`, err);
      }
    };
  } catch (err) {
    console.error(`[PulseWorker] Connection error:`, err);
  }
}

function handleMessage(channel, data) {
  try {
    const msgType = data.type || data.event;

    // Helper to extract token(s) from various message formats
    // Backend may send: { data: token }, { data: [tokens] }, { token: ... }, or token directly
    const extractTokens = (msg) => {
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
          if (normalized) addNewToken(normalized);
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
          if (normalized) addFinalStretchToken(normalized);
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
          if (normalized) addMigratedToken(normalized);
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

    case 'batch':
    case 'bulk':
      if (Array.isArray(data.updates)) {
        data.updates.forEach(update => handleMessage(channel, update));
      }
      if (Array.isArray(data.data)) {
        data.data.forEach(update => handleMessage(channel, update));
      }
      break;

    default:
      // Try to infer message type from channel if type is missing/unknown
      // This handles cases where backend sends token directly without explicit type
      if (data.mint || data.address || data.mint_address) {
        const normalized = normalizeToken(data);
        if (normalized) {
          if (channel === 'new') {
            addNewToken(normalized);
          } else if (channel === 'final_stretch') {
            addFinalStretchToken(normalized);
          } else if (channel === 'migrated') {
            addMigratedToken(normalized);
          }
        }
      } else if (msgType && msgType !== 'ping' && msgType !== 'pong' && msgType !== 'heartbeat' && msgType !== 'connected') {
        // Log truly unhandled message types
        console.log(`[PulseWorker] Unhandled message type on ${channel}: ${msgType}`, Object.keys(data));
      }
      break;
    }
  } catch (err) {
    // Catch any errors during message processing to prevent worker crash
    console.error(`[PulseWorker] handleMessage error on ${channel}:`, err);
  }
}

/**
 * Normalize token with ONLY needed fields - prevents memory bloat from unknown fields
 * CRITICAL: Must include BOTH PulseToken AND Token (db.ts) field names for compatibility!
 *
 * Backend PulseToken JSON fields (from contracts.go):
 * - mint, name, symbol, launchpad_protocol
 * - price_usd (float), priceUSD (string), usd_price (string)
 * - market_cap_usd (float), marketCapUSD (string), fully_diluted_value (string)
 * - liquidity_usd (float), liquidityUSD (string), total_liquidity_usd
 * - volume_24h (float), volume24h (string)
 * - bonding_pct (float), bonding_curve_progress (float)
 * - launch_time (string ISO), created_at (string ISO)
 * - price_percent_change_5m/1h/6h/24h (string)
 * - total_buys_5m/1h/6h/24h, total_sells_5m/1h/6h/24h (int)
 * - total_buyers_5m/1h/6h/24h, total_sellers_5m/1h/6h/24h (int)
 * - unique_wallets_5m/1h/6h/24h (int)
 * - total_buy_volume_5m/1h/6h/24h, total_sell_volume_5m/1h/6h/24h (string)
 */
function normalizeToken(rawToken) {
  if (!rawToken) return null;

  const mint = rawToken.mint || rawToken.address || rawToken.mint_address || rawToken.token_address || rawToken.contract_address;
  if (!mint) return null;

  // === CREATED_AT: Backend sends 'launch_time' and 'created_at' as ISO strings ===
  const createdAtValue = rawToken.launch_time || rawToken.created_at || rawToken.createdAt || rawToken.LaunchTime || Date.now();

  // === PRICE: Backend sends price_usd (float), priceUSD (string), usd_price (string) ===
  const priceValue = parseFloat(rawToken.price_usd) || parseFloat(rawToken.priceUSD) || parseFloat(rawToken.usd_price) || parseFloat(rawToken.price) || 0;

  // === PRICE CHANGES: Backend sends price_percent_change_* (string), also handle price_change_* ===
  const priceChange5mValue = parseFloat(rawToken.price_percent_change_5m) || parseFloat(rawToken.price_change_5m) || parseFloat(rawToken.priceChange5m) || 0;
  const priceChange1hValue = parseFloat(rawToken.price_percent_change_1h) || parseFloat(rawToken.price_change_1h) || parseFloat(rawToken.priceChange1h) || 0;
  const priceChange6hValue = parseFloat(rawToken.price_percent_change_6h) || parseFloat(rawToken.price_change_6h) || parseFloat(rawToken.priceChange6h) || 0;
  const priceChange24hValue = parseFloat(rawToken.price_percent_change_24h) || parseFloat(rawToken.price_change_24h) || parseFloat(rawToken.priceChange24h) || 0;

  // === MARKET CAP: Backend sends market_cap_usd (float), marketCapUSD (string), fully_diluted_value (string) ===
  const marketCapValue = parseFloat(rawToken.market_cap_usd) || parseFloat(rawToken.marketCapUSD) || parseFloat(rawToken.fully_diluted_value) || parseFloat(rawToken.marketCap) || parseFloat(rawToken.fdv) || 0;

  // === LIQUIDITY: Backend sends liquidity_usd (float), liquidityUSD (string), total_liquidity_usd ===
  const liquidityValue = parseFloat(rawToken.liquidity_usd) || parseFloat(rawToken.liquidityUSD) || parseFloat(rawToken.total_liquidity_usd) || parseFloat(rawToken.liquidity) || 0;

  // === VOLUME: Backend sends volume_24h (float), volume24h (string) ===
  const volumeValue = parseFloat(rawToken.volume_24h) || parseFloat(rawToken.volume24h) || parseFloat(rawToken.volume) || 0;

  // === BONDING: Backend sends bonding_pct (float), bonding_curve_progress (float) ===
  const bondingValue = parseFloat(rawToken.bonding_pct) || parseFloat(rawToken.bonding_curve_progress) || parseFloat(rawToken.bondingCurveProgress) || parseFloat(rawToken.bonding_percent) || 0;

  // === HOLDERS: Various field names ===
  const holderValue = rawToken.holder_count ?? rawToken.holders ?? rawToken.total_holders ?? rawToken.unique_wallets_24h ?? 0;

  // === PERCENTAGES ===
  const devPercentValue = rawToken.dev_percent ?? rawToken.dev_held_percentage ?? 0;
  const sniperPercentValue = rawToken.sniper_percent ?? rawToken.sniper_held_percentage ?? 0;
  const insiderPercentValue = rawToken.insider_percent ?? rawToken.insider_held_percentage ?? 0;
  const bundlePercentValue = rawToken.bundle_percent ?? rawToken.bundled_percentage ?? 0;

  // NOTE: Do NOT spread ...rawToken - it may contain large nested objects
  // that cause memory bloat and slow postMessage serialization
  return {
    // === Core identifiers ===
    mint,
    mint_address: mint,

    // === Basic info ===
    name: rawToken.name || rawToken.token_name || 'Unknown',
    symbol: rawToken.symbol || rawToken.token_symbol || '???',
    image: rawToken.image || rawToken.image_uri || rawToken.imageUrl || rawToken.logo || rawToken.uri || null,
    logo: rawToken.logo || rawToken.image || rawToken.image_uri || null,
    uri: rawToken.uri || rawToken.image || null,
    status: rawToken.status || 'active',
    launchpad_protocol: rawToken.launchpad_protocol || rawToken.protocol || rawToken.LaunchpadProtocol || 'pumpfun',
    pair_address: rawToken.pair_address || rawToken.PairAddress || null,
    links: rawToken.links || rawToken.Links || null,

    // === CRITICAL: created_at for age display (accept both ISO string and timestamp) ===
    created_at: createdAtValue,
    launch_time: createdAtValue, // Alias for PulseTable

    // === Price data (ALL format variants) ===
    price: priceValue,
    price_usd: priceValue,
    usd_price: priceValue,
    priceUSD: String(priceValue),

    // Price changes (ALL format variants)
    priceChange5m: priceChange5mValue,
    price_change_5m: priceChange5mValue,
    price_percent_change_5m: priceChange5mValue,
    price_change_1h: priceChange1hValue,
    price_percent_change_1h: priceChange1hValue,
    price_change_6h: priceChange6hValue,
    price_percent_change_6h: priceChange6hValue,
    price_change_24h: priceChange24hValue,
    price_percent_change_24h: priceChange24hValue,

    // === Market metrics (ALL format variants) ===
    marketCap: marketCapValue,
    market_cap_usd: marketCapValue,
    marketCapUSD: String(marketCapValue),
    fully_diluted_value: marketCapValue,

    volume: volumeValue,
    volume_24h: volumeValue,
    volume24h: String(volumeValue),

    liquidity: liquidityValue,
    liquidity_usd: liquidityValue,
    liquidityUSD: String(liquidityValue),
    total_liquidity_usd: liquidityValue,

    // === Holder counts (ALL variants) ===
    holders: holderValue,
    holder_count: holderValue,
    total_holders: holderValue,
    unique_wallets_24h: rawToken.unique_wallets_24h ?? holderValue,
    unique_wallets_6h: rawToken.unique_wallets_6h ?? 0,
    unique_wallets_1h: rawToken.unique_wallets_1h ?? 0,
    unique_wallets_5m: rawToken.unique_wallets_5m ?? 0,

    // === KOL count ===
    kol_count: rawToken.kol_count ?? 0,

    // === Transaction counts - BUYS (all timeframes) ===
    total_buys_24h: rawToken.total_buys_24h ?? 0,
    total_buys_6h: rawToken.total_buys_6h ?? 0,
    total_buys_1h: rawToken.total_buys_1h ?? 0,
    total_buys_5m: rawToken.total_buys_5m ?? 0,

    // === Transaction counts - SELLS (all timeframes) ===
    total_sells_24h: rawToken.total_sells_24h ?? 0,
    total_sells_6h: rawToken.total_sells_6h ?? 0,
    total_sells_1h: rawToken.total_sells_1h ?? 0,
    total_sells_5m: rawToken.total_sells_5m ?? 0,

    // === Buyer/Seller counts (different from buys/sells!) ===
    total_buyers_24h: rawToken.total_buyers_24h ?? 0,
    total_buyers_6h: rawToken.total_buyers_6h ?? 0,
    total_buyers_1h: rawToken.total_buyers_1h ?? 0,
    total_buyers_5m: rawToken.total_buyers_5m ?? 0,
    total_sellers_24h: rawToken.total_sellers_24h ?? 0,
    total_sellers_6h: rawToken.total_sellers_6h ?? 0,
    total_sellers_1h: rawToken.total_sellers_1h ?? 0,
    total_sellers_5m: rawToken.total_sellers_5m ?? 0,

    // === Volume per timeframe (backend sends as string, parse to number) ===
    total_buy_volume_24h: parseFloat(rawToken.total_buy_volume_24h) || 0,
    total_sell_volume_24h: parseFloat(rawToken.total_sell_volume_24h) || 0,
    total_buy_volume_6h: parseFloat(rawToken.total_buy_volume_6h) || 0,
    total_sell_volume_6h: parseFloat(rawToken.total_sell_volume_6h) || 0,
    total_buy_volume_1h: parseFloat(rawToken.total_buy_volume_1h) || 0,
    total_sell_volume_1h: parseFloat(rawToken.total_sell_volume_1h) || 0,
    total_buy_volume_5m: parseFloat(rawToken.total_buy_volume_5m) || 0,
    total_sell_volume_5m: parseFloat(rawToken.total_sell_volume_5m) || 0,

    txns: rawToken.txns || { buys: 0, sells: 0 },

    // === Percentage holdings (all variants) ===
    dev_percent: devPercentValue,
    dev_held_percentage: devPercentValue,
    sniper_percent: sniperPercentValue,
    sniper_held_percentage: sniperPercentValue,
    total_snipers: rawToken.total_snipers ?? 0,
    insider_percent: insiderPercentValue,
    insider_held_percentage: insiderPercentValue,
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
    bonding_curve_progress: bondingValue,
    bonding_pct: bondingValue,
    graduation_percent: parseFloat(rawToken.graduation_percent) || bondingValue,

    // === Pro traders / Smart money ===
    pro_traders_count: rawToken.pro_traders_count ?? rawToken.pro_traders ?? 0,
    smart_money_count: rawToken.smart_money_count ?? 0,

    // === Fees / Gas ===
    total_fees_lamports: rawToken.total_fees_lamports ?? 0,
    global_fees_paid: rawToken.global_fees_paid ?? rawToken.globalFeesPaid ?? 0,
    globalFeesPaid: rawToken.globalFeesPaid ?? rawToken.global_fees_paid ?? 0,

    // === Trade info ===
    trade_type: rawToken.trade_type || null,
    sol_amount: rawToken.sol_amount ?? 0,
    token_amount: rawToken.token_amount ?? 0,

    // === Migrated pool ===
    migrated_pool_address: rawToken.migrated_pool_address || rawToken.MigratedPoolAddress || null,
    migrated_time: rawToken.migrated_time || rawToken.MigratedTime || null,
  };
}

function addNewToken(token) {
  if (!token) return;
  const existingIndex = newTokens.findIndex(t => t.mint === token.mint);
  if (existingIndex !== -1) {
    newTokens.splice(existingIndex, 1);
  }
  newTokens.unshift(token);
  if (newTokens.length > MAX_NEW) {
    newTokens.pop();
  }
  // Send delta immediately - only this one token
  sendTokenDelta('new', token);
}

function addFinalStretchToken(token) {
  if (!token) return;
  const existingIndex = finalStretchTokens.findIndex(t => t.mint === token.mint);
  if (existingIndex !== -1) {
    finalStretchTokens.splice(existingIndex, 1);
  }
  finalStretchTokens.unshift(token);
  if (finalStretchTokens.length > MAX_FINAL) {
    finalStretchTokens.pop();
  }
  // Send delta immediately
  sendTokenDelta('final_stretch', token);
}

function addMigratedToken(token) {
  if (!token) return;
  const existingIndex = migratedTokens.findIndex(t => t.mint === token.mint);
  if (existingIndex !== -1) {
    migratedTokens.splice(existingIndex, 1);
  }
  migratedTokens.unshift(token);
  if (migratedTokens.length > MAX_MIGRATED) {
    migratedTokens.pop();
  }
  // Send delta immediately
  sendTokenDelta('migrated', token);
}

function handlePriceUpdate(updates) {
  const updatesArray = Array.isArray(updates) ? updates : [updates];

  for (const update of updatesArray) {
    const mint = update.mint || update.address || update.mint_address;
    if (!mint) continue;

    // Update in arrays and send delta for each updated token
    // This is much faster than sending the full 300 token array
    const updatedToken = updateTokenInArray(newTokens, mint, update) ||
                         updateTokenInArray(finalStretchTokens, mint, update) ||
                         updateTokenInArray(migratedTokens, mint, update);

    if (updatedToken) {
      // Send delta with just this updated token
      sendTokenDelta('price_update', updatedToken);
    }
  }
}

/**
 * Update a token in an array with new data
 * Returns the updated token if found, null otherwise
 * CRITICAL: Must include BOTH PulseToken AND Token (db.ts) field names!
 *
 * IMPORTANT: Price updates only send a subset of fields (see price_update_broadcaster.go):
 * - mint, symbol, image, pair_address
 * - price_usd, market_cap_usd, liquidity_usd, volume_24h
 * - total_buys_5m, total_sells_5m, total_buyers_5m, total_sellers_5m, unique_wallets_5m
 * - total_buy_volume_5m, total_sell_volume_5m
 *
 * Fields NOT sent by price_update: created_at, bonding_pct, 1h/6h/24h tx data, etc.
 * Use existing token values for those fields.
 */
function updateTokenInArray(arr, mint, update) {
  const idx = arr.findIndex(t => t.mint === mint);
  if (idx === -1) return null;

  const token = arr[idx];

  // Helper: get numeric value, parsing strings if needed
  const getNum = (val) => val !== undefined && val !== null ? (typeof val === 'string' ? parseFloat(val) : val) : undefined;

  // Compute updated values - only update if update has the field, otherwise keep token's value
  // Parse strings to numbers since backend may send string values
  const priceValue = getNum(update.price_usd) ?? getNum(update.price) ?? getNum(update.usd_price) ?? token.price;
  const marketCapValue = getNum(update.market_cap_usd) ?? getNum(update.marketCap) ?? getNum(update.fully_diluted_value) ?? token.market_cap_usd;
  const liquidityValue = getNum(update.liquidity_usd) ?? getNum(update.liquidity) ?? getNum(update.total_liquidity_usd) ?? token.liquidity_usd;
  const volumeValue = getNum(update.volume_24h) ?? getNum(update.volume) ?? token.volume_24h;

  // These are NOT sent by price updates, so keep existing values
  const bondingValue = getNum(update.bonding_pct) ?? getNum(update.bonding_curve_progress) ?? token.bonding_pct;
  const holderValue = update.holders ?? update.holder_count ?? update.total_holders ?? token.holders;

  // Price changes - not sent by price_update, keep existing
  const priceChange5mValue = getNum(update.price_percent_change_5m) ?? getNum(update.price_change_5m) ?? token.price_change_5m;
  const priceChange1hValue = getNum(update.price_percent_change_1h) ?? getNum(update.price_change_1h) ?? token.price_change_1h;
  const priceChange6hValue = getNum(update.price_percent_change_6h) ?? getNum(update.price_change_6h) ?? token.price_change_6h;
  const priceChange24hValue = getNum(update.price_percent_change_24h) ?? getNum(update.price_change_24h) ?? token.price_change_24h;

  // Apply all price update fields with ALL format variants
  const updatedToken = {
    ...token,
    // Price (ALL format variants)
    price: priceValue,
    price_usd: priceValue,
    usd_price: priceValue,
    priceUSD: String(priceValue),
    priceChange5m: priceChange5mValue,
    price_change_5m: priceChange5mValue,
    price_percent_change_5m: priceChange5mValue,
    price_change_1h: priceChange1hValue,
    price_percent_change_1h: priceChange1hValue,
    price_change_6h: priceChange6hValue,
    price_percent_change_6h: priceChange6hValue,
    price_change_24h: priceChange24hValue,
    price_percent_change_24h: priceChange24hValue,

    // Market metrics (ALL format variants + string versions)
    marketCap: marketCapValue,
    market_cap_usd: marketCapValue,
    marketCapUSD: String(marketCapValue),
    fully_diluted_value: marketCapValue,
    volume: volumeValue,
    volume_24h: volumeValue,
    volume24h: String(volumeValue),
    liquidity: liquidityValue,
    liquidity_usd: liquidityValue,
    liquidityUSD: String(liquidityValue),
    total_liquidity_usd: liquidityValue,

    // Holders (ALL format variants)
    holders: holderValue,
    holder_count: holderValue,
    total_holders: holderValue,

    // Unique wallets (price_update sends 5m)
    unique_wallets_5m: update.unique_wallets_5m ?? token.unique_wallets_5m,
    unique_wallets_1h: update.unique_wallets_1h ?? token.unique_wallets_1h,
    unique_wallets_6h: update.unique_wallets_6h ?? token.unique_wallets_6h,
    unique_wallets_24h: update.unique_wallets_24h ?? token.unique_wallets_24h,

    // Transaction counts - BUYS
    total_buys_5m: update.total_buys_5m ?? token.total_buys_5m,
    total_buys_1h: update.total_buys_1h ?? token.total_buys_1h,
    total_buys_6h: update.total_buys_6h ?? token.total_buys_6h,
    total_buys_24h: update.total_buys_24h ?? token.total_buys_24h,

    // Transaction counts - SELLS
    total_sells_5m: update.total_sells_5m ?? token.total_sells_5m,
    total_sells_1h: update.total_sells_1h ?? token.total_sells_1h,
    total_sells_6h: update.total_sells_6h ?? token.total_sells_6h,
    total_sells_24h: update.total_sells_24h ?? token.total_sells_24h,

    // Buyer/Seller counts (price_update sends 5m)
    total_buyers_5m: update.total_buyers_5m ?? token.total_buyers_5m,
    total_buyers_1h: update.total_buyers_1h ?? token.total_buyers_1h,
    total_buyers_6h: update.total_buyers_6h ?? token.total_buyers_6h,
    total_buyers_24h: update.total_buyers_24h ?? token.total_buyers_24h,
    total_sellers_5m: update.total_sellers_5m ?? token.total_sellers_5m,
    total_sellers_1h: update.total_sellers_1h ?? token.total_sellers_1h,
    total_sellers_6h: update.total_sellers_6h ?? token.total_sellers_6h,
    total_sellers_24h: update.total_sellers_24h ?? token.total_sellers_24h,

    txns: update.txns ?? token.txns,

    // Volume per timeframe (price_update sends 5m, parse strings)
    total_buy_volume_5m: getNum(update.total_buy_volume_5m) ?? token.total_buy_volume_5m,
    total_sell_volume_5m: getNum(update.total_sell_volume_5m) ?? token.total_sell_volume_5m,
    total_buy_volume_1h: getNum(update.total_buy_volume_1h) ?? token.total_buy_volume_1h,
    total_sell_volume_1h: getNum(update.total_sell_volume_1h) ?? token.total_sell_volume_1h,
    total_buy_volume_6h: getNum(update.total_buy_volume_6h) ?? token.total_buy_volume_6h,
    total_sell_volume_6h: getNum(update.total_sell_volume_6h) ?? token.total_sell_volume_6h,
    total_buy_volume_24h: getNum(update.total_buy_volume_24h) ?? token.total_buy_volume_24h,
    total_sell_volume_24h: getNum(update.total_sell_volume_24h) ?? token.total_sell_volume_24h,

    // Percentages (NOT sent by price_update, keep existing)
    dev_percent: update.dev_percent ?? update.dev_held_percentage ?? token.dev_percent,
    dev_held_percentage: update.dev_held_percentage ?? update.dev_percent ?? token.dev_held_percentage,
    sniper_percent: update.sniper_percent ?? update.sniper_held_percentage ?? token.sniper_percent,
    sniper_held_percentage: update.sniper_held_percentage ?? update.sniper_percent ?? token.sniper_held_percentage,
    total_snipers: update.total_snipers ?? token.total_snipers,
    insider_percent: update.insider_percent ?? update.insider_held_percentage ?? token.insider_percent,
    insider_held_percentage: update.insider_held_percentage ?? update.insider_percent ?? token.insider_held_percentage,
    bundle_percent: update.bundle_percent ?? update.bundled_percentage ?? token.bundle_percent,
    bundled_percentage: update.bundled_percentage ?? update.bundle_percent ?? token.bundled_percentage,
    bundler_held_percentage: update.bundler_held_percentage ?? token.bundler_held_percentage,

    // Bonding curve (NOT sent by price_update, keep existing)
    bondingCurveProgress: bondingValue,
    bonding_curve_progress: bondingValue,
    bonding_pct: bondingValue,

    // KOL
    kol_count: update.kol_count ?? token.kol_count,

    // Pro traders
    pro_traders_count: update.pro_traders_count ?? token.pro_traders_count,
    smart_money_count: update.smart_money_count ?? token.smart_money_count,

    // Gas / Fees
    total_fees_lamports: update.total_fees_lamports ?? token.total_fees_lamports,
    global_fees_paid: update.global_fees_paid ?? update.globalFeesPaid ?? token.global_fees_paid,
    globalFeesPaid: update.globalFeesPaid ?? update.global_fees_paid ?? token.globalFeesPaid,

    // Image (price_update sends this)
    image: update.image ?? token.image,
    logo: update.image ?? token.logo,
  };

  arr[idx] = updatedToken;
  return updatedToken; // Return the updated token for delta updates
}

function handleTokenInfoUpdate(update) {
  const mint = update.mint_address || update.mint || update.address;
  if (!mint) return;

  // Try to update in each array, send delta if found
  const applyAndSendDelta = (arr) => {
    const idx = arr.findIndex(t => t.mint === mint);
    if (idx === -1) return false;

    const token = arr[idx];
    const updatedToken = {
      ...token,
      holder_count: update.holder_count ?? token.holder_count,
      holders: update.holder_count ?? token.holders,
      kol_count: update.kol_count ?? token.kol_count,
    };
    arr[idx] = updatedToken;

    // Send delta with just this token - much faster than full DATA sync
    sendTokenDelta('token_info', updatedToken);
    return true;
  };

  // Apply to all arrays where token exists
  applyAndSendDelta(newTokens);
  applyAndSendDelta(finalStretchTokens);
  applyAndSendDelta(migratedTokens);
}

console.log('[PulseWorker] Worker initialized');
