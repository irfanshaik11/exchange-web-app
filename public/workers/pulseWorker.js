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

// Max tokens per category
const MAX_NEW = 200;
const MAX_FINAL = 50;
const MAX_MIGRATED = 50;

// Send data directly - no round-trip needed
function scheduleUpdate() {
  self.postMessage({
    type: 'DATA',
    payload: {
      newTokens: newTokens.slice(0, MAX_NEW),
      finalStretchTokens: finalStretchTokens.slice(0, MAX_FINAL),
      migratedTokens: migratedTokens.slice(0, MAX_MIGRATED),
    }
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
  }
};

function connectAll() {
  if (!wsBaseUrl) {
    console.log('[PulseWorker] No wsBaseUrl provided');
    return;
  }

  connectChannel('new');
  connectChannel('final_stretch');
  connectChannel('migrated');
}

function disconnectAll() {
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
      try {
        const messages = event.data.split('\n').filter(msg => msg.trim());
        for (const msgStr of messages) {
          const data = JSON.parse(msgStr);
          handleMessage(channel, data);
        }
      } catch (err) {
        console.error(`[PulseWorker] Parse error:`, err);
      }
    };
  } catch (err) {
    console.error(`[PulseWorker] Connection error:`, err);
  }
}

function handleMessage(channel, data) {
  const msgType = data.type || data.event;

  switch (msgType) {
    case 'new_token':
    case 'newToken':
      if (data.data) {
        const tokens = Array.isArray(data.data) ? data.data : [data.data];
        for (const t of tokens) {
          const normalized = normalizeToken(t);
          if (normalized) addNewToken(normalized);
        }
      }
      break;

    case 'final_stretch_token':
    case 'finalStretch':
      if (data.data) {
        const tokens = Array.isArray(data.data) ? data.data : [data.data];
        for (const t of tokens) {
          const normalized = normalizeToken(t);
          if (normalized) addFinalStretchToken(normalized);
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
          if (normalized) addMigratedToken(normalized);
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
        data.updates.forEach(update => handleMessage(channel, update));
      }
      break;
  }

  scheduleUpdate();
}

/**
 * Normalize token with ALL fields - matches usePulseWebSocketPersistent
 */
function normalizeToken(rawToken) {
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
    image: rawToken.image || rawToken.image_uri || rawToken.imageUrl || rawToken.logo || null,
    status: rawToken.status || 'active',
    launchpad_protocol: rawToken.launchpad_protocol || rawToken.protocol || 'pumpfun',
    pair_address: rawToken.pair_address || null,
    created_at: rawToken.created_at || rawToken.createdAt || Date.now(),

    // === Price data ===
    price: rawToken.price || rawToken.price_usd || rawToken.priceUsd || 0,
    price_usd: rawToken.price_usd || rawToken.price || 0,
    priceChange5m: rawToken.priceChange5m || rawToken.price_change_5m || 0,
    price_change_5m: rawToken.price_change_5m || rawToken.priceChange5m || 0,
    price_change_24h: rawToken.price_change_24h || rawToken.priceChange24h || 0,

    // === Market metrics ===
    marketCap: rawToken.marketCap || rawToken.market_cap || rawToken.market_cap_usd || rawToken.mcap || rawToken.fully_diluted_value || rawToken.fdv || 0,
    market_cap_usd: rawToken.market_cap_usd || rawToken.marketCap || rawToken.market_cap || rawToken.fully_diluted_value || rawToken.fdv || 0,
    volume: rawToken.volume || rawToken.volume_24h || 0,
    volume_24h: rawToken.volume_24h || rawToken.volume || 0,
    liquidity: rawToken.liquidity || rawToken.liquidity_usd || rawToken.liq || rawToken.total_liquidity_usd || 0,
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
    txns: rawToken.txns || { buys: 0, sells: 0 },

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
    bondingCurveProgress: rawToken.bondingCurveProgress || rawToken.bonding_curve_progress || rawToken.bonding_pct || rawToken.bonding_percent || 0,
    bonding_pct: rawToken.bonding_pct || rawToken.bonding_percent || rawToken.bondingCurveProgress || 0,
    graduation_percent: rawToken.graduation_percent || rawToken.bonding_pct || 0,

    // === Pro traders ===
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
  };
}

function addNewToken(token) {
  if (!token) return;
  newTokens = newTokens.filter(t => t.mint !== token.mint);
  newTokens.unshift(token);
  if (newTokens.length > MAX_NEW) {
    newTokens = newTokens.slice(0, MAX_NEW);
  }
}

function addFinalStretchToken(token) {
  if (!token) return;
  finalStretchTokens = finalStretchTokens.filter(t => t.mint !== token.mint);
  finalStretchTokens.unshift(token);
  if (finalStretchTokens.length > MAX_FINAL) {
    finalStretchTokens = finalStretchTokens.slice(0, MAX_FINAL);
  }
}

function addMigratedToken(token) {
  if (!token) return;
  migratedTokens = migratedTokens.filter(t => t.mint !== token.mint);
  migratedTokens.unshift(token);
  if (migratedTokens.length > MAX_MIGRATED) {
    migratedTokens = migratedTokens.slice(0, MAX_MIGRATED);
  }
}

function handlePriceUpdate(updates) {
  const updatesArray = Array.isArray(updates) ? updates : [updates];

  for (const update of updatesArray) {
    const mint = update.mint || update.address || update.mint_address;
    if (!mint) continue;

    updateTokenInArray(newTokens, mint, update);
    updateTokenInArray(finalStretchTokens, mint, update);
    updateTokenInArray(migratedTokens, mint, update);
  }
}

function updateTokenInArray(arr, mint, update) {
  const idx = arr.findIndex(t => t.mint === mint);
  if (idx === -1) return;

  const token = arr[idx];

  // Apply all price update fields
  arr[idx] = {
    ...token,
    // Price
    price: update.price ?? update.price_usd ?? token.price,
    price_usd: update.price_usd ?? update.price ?? token.price_usd,
    priceChange5m: update.priceChange5m ?? update.price_change_5m ?? token.priceChange5m,
    price_change_5m: update.price_change_5m ?? update.priceChange5m ?? token.price_change_5m,
    price_change_24h: update.price_change_24h ?? token.price_change_24h,

    // Market metrics
    marketCap: update.marketCap ?? update.market_cap ?? update.market_cap_usd ?? token.marketCap,
    market_cap_usd: update.market_cap_usd ?? update.marketCap ?? token.market_cap_usd,
    volume: update.volume ?? update.volume_24h ?? token.volume,
    volume_24h: update.volume_24h ?? update.volume ?? token.volume_24h,
    liquidity: update.liquidity ?? update.liquidity_usd ?? token.liquidity,
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
    txns: update.txns ?? token.txns,

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
    bondingCurveProgress: update.bondingCurveProgress ?? update.bonding_curve_progress ?? token.bondingCurveProgress,
    bonding_pct: update.bonding_pct ?? update.bondingCurveProgress ?? token.bonding_pct,

    // KOL
    kol_count: update.kol_count ?? token.kol_count,

    // Pro traders
    pro_traders_count: update.pro_traders_count ?? token.pro_traders_count,
    smart_money_count: update.smart_money_count ?? token.smart_money_count,

    // Gas / Fees
    total_fees_lamports: update.total_fees_lamports ?? token.total_fees_lamports,
    global_fees_paid: update.global_fees_paid ?? update.globalFeesPaid ?? token.global_fees_paid,
    globalFeesPaid: update.globalFeesPaid ?? update.global_fees_paid ?? token.globalFeesPaid,
  };
}

function handleTokenInfoUpdate(update) {
  const mint = update.mint_address || update.mint || update.address;
  if (!mint) return;

  const applyUpdate = (arr) => {
    const idx = arr.findIndex(t => t.mint === mint);
    if (idx === -1) return;

    const token = arr[idx];
    arr[idx] = {
      ...token,
      holder_count: update.holder_count ?? token.holder_count,
      holders: update.holder_count ?? token.holders,
      kol_count: update.kol_count ?? token.kol_count,
    };
  };

  applyUpdate(newTokens);
  applyUpdate(finalStretchTokens);
  applyUpdate(migratedTokens);
}

console.log('[PulseWorker] Worker initialized');
