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

// ---------------------------------------------------------------------------
// Late-metadata patch helpers (kept in sync with src/utils/applyPriceUpdate.ts)
//
// New tokens — especially auto-discovered DEX migrations — are broadcast over
// `new_token` *before* the indexer's metadata fetch resolves. The first frame
// has empty name/symbol/image; a follow-up `price_update` carries the real
// values once metadata lands. We patch metadata onto existing rows ONLY when
// the existing value is empty/placeholder AND the incoming value isn't itself
// empty/placeholder — otherwise a stale price_update could blank out a real
// name we already resolved.
// ---------------------------------------------------------------------------
const NAME_PLACEHOLDER_RE = /^(unknown)?$/i;
const SYMBOL_PLACEHOLDER_RE = /^(\?+)?$/;
function isPlaceholderName(s) {
  return typeof s !== "string" || NAME_PLACEHOLDER_RE.test(s.trim());
}
function isPlaceholderSymbol(s) {
  return typeof s !== "string" || SYMBOL_PLACEHOLDER_RE.test(s.trim());
}
function patchMetadataIfPlaceholder(token, update) {
  const patch = {};
  if (isPlaceholderName(token.name) && !isPlaceholderName(update.name)) {
    patch.name = update.name.trim();
  }
  if (isPlaceholderSymbol(token.symbol) && !isPlaceholderSymbol(update.symbol)) {
    patch.symbol = update.symbol.trim();
  }
  if (!token.image && typeof update.image === "string" && update.image) {
    patch.image = update.image;
    patch.logo = update.logo || update.image;
  } else if (!token.logo && typeof update.logo === "string" && update.logo) {
    patch.logo = update.logo;
  }
  if (!token.uri && typeof update.uri === "string" && update.uri) {
    patch.uri = update.uri;
  }
  return patch;
}

// WebSocket connections
let wsConnections = {};
let wsBaseUrl = "";

// Application-level heartbeat — end-to-end connection verification
//
// Kept well under the ~30s idle timeout on intermediate proxies / load balancers
// on the WS path (GCP HTTPS LB in front of backend.interstate.so). At a 30s ping
// cadence the heartbeat raced the LB timeout and lost: the socket would silently
// half-close (readyState stayed OPEN, no FIN reached the worker) and new-pair
// data would simply stop flowing until the next ping failed and we reconnected.
// 15s pings keep the connection live indefinitely. Mirrors the arena-ws fix in
// useRobustWebSocket.ts (commit a45c612c, verified 2026-04-23).
const HEARTBEAT_INTERVAL = 15000; // Send ping every 15s
const HEARTBEAT_TIMEOUT = 8000; // Expect pong within 8s (headroom under ping cadence)
let heartbeatIntervals = {};
let heartbeatTimeouts = {};

// Max tokens per category
const MAX_NEW = 200;
const MAX_FINAL = 50;
const MAX_MIGRATED = 200;

// Delta update system - sends only changed tokens for maximum speed
// Full DATA updates are only used for GET_DATA requests (new tabs connecting)

// Debug counters - set DEBUG_MODE = true to enable logging
const DEBUG_MODE = false;
let tokenCounter = {
  new: 0,
  final_stretch: 0,
  migrated: 0,
  price_update: 0,
  token_info: 0,
};
let lastDebugLog = 0;

function debugLog(type) {
  if (!DEBUG_MODE) return;
  tokenCounter[type] = (tokenCounter[type] || 0) + 1;
  const now = Date.now();
  if (now - lastDebugLog > 5000) {
    lastDebugLog = now;
    console.log("[PulseWorker] Token counts (last 5s):", { ...tokenCounter });
    tokenCounter = {
      new: 0,
      final_stretch: 0,
      migrated: 0,
      price_update: 0,
      token_info: 0,
    };
  }
}

/**
 * Send delta update for a single token (fast, minimal data)
 * This is the primary update mechanism - sends 1 token instead of 300
 */
function sendTokenDelta(type, token) {
  debugLog(type);
  const timestamp = Date.now();
  if (DEBUG_MODE && type === "new") {
    console.log(
      `[PulseWorker] 🚀 SEND delta ${type}: ${token.symbol} at ${timestamp}`,
    );
  }
  self.postMessage({
    type: "TOKEN_DELTA",
    payload: { deltaType: type, token },
    timestamp: timestamp, // Used by bridge to filter stale queued messages
  });
}

// Message handler from main thread
self.onmessage = function (e) {
  const { type, payload } = e.data;

  switch (type) {
    case "INIT":
      wsBaseUrl = payload.wsBaseUrl || "";
      if (payload.initialData) {
        newTokens = payload.initialData.newTokens || [];
        finalStretchTokens = payload.initialData.finalStretchTokens || [];
        migratedTokens = payload.initialData.migratedTokens || [];
      }
      connectAll();
      break;

    case "GET_DATA":
      self.postMessage({
        type: "DATA",
        payload: {
          newTokens: newTokens.slice(0, MAX_NEW),
          finalStretchTokens: finalStretchTokens.slice(0, MAX_FINAL),
          migratedTokens: migratedTokens.slice(0, MAX_MIGRATED),
        },
      });
      break;

    case "DISCONNECT":
      disconnectAll();
      break;

    case "FORCE_RECONNECT":
      console.log("[PulseWorker] FORCE_RECONNECT - reconnecting all channels");
      disconnectAll();
      connectAll();
      break;

    case "RECONNECT":
      // Tab became visible after being hidden
      // DON'T clear data - the worker has FRESH data from WebSocket
      // The stale data is in the postMessage QUEUE on main thread, not here
      console.log(
        "[PulseWorker] RECONNECT requested - sending fresh data snapshot",
      );

      // Send current FRESH data immediately
      // Bridge will use cutoff timestamp to ignore stale queued messages
      self.postMessage({
        type: "DATA",
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

function connectAll() {
  if (!wsBaseUrl) {
    console.log("[PulseWorker] No wsBaseUrl provided");
    return;
  }

  connectChannel("new");
  connectChannel("final_stretch");
  connectChannel("migrated");
}

function startHeartbeat(channel) {
  stopHeartbeat(channel);
  heartbeatIntervals[channel] = setInterval(() => {
    const ws = wsConnections[channel];
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "ping" }));
      } catch (e) {
        return; // Send failed — onclose will handle reconnect
      }
      heartbeatTimeouts[channel] = setTimeout(() => {
        console.log(
          `[PulseWorker] No heartbeat pong from ${channel}, reconnecting...`,
        );
        try {
          ws.close();
        } catch (e) {}
        // onclose handler will reconnect
      }, HEARTBEAT_TIMEOUT);
    }
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat(channel) {
  if (heartbeatIntervals[channel]) {
    clearInterval(heartbeatIntervals[channel]);
    delete heartbeatIntervals[channel];
  }
  if (heartbeatTimeouts[channel]) {
    clearTimeout(heartbeatTimeouts[channel]);
    delete heartbeatTimeouts[channel];
  }
}

function disconnectAll() {
  // Stop all heartbeats
  for (const channel of ["new", "final_stretch", "migrated"]) {
    stopHeartbeat(channel);
  }

  Object.values(wsConnections).forEach((ws) => {
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
      self.postMessage({
        type: "CONNECTION_STATUS",
        payload: { channel, connected: true },
      });
      startHeartbeat(channel);
    };

    ws.onclose = () => {
      console.log(`[PulseWorker] Disconnected: ${channel}`);
      stopHeartbeat(channel);
      self.postMessage({
        type: "CONNECTION_STATUS",
        payload: { channel, connected: false },
      });
      // Only null out and reconnect if this WS is still the tracked connection.
      if (wsConnections[channel] === ws) {
        wsConnections[channel] = null;
        setTimeout(() => connectChannel(channel), 3000);
      }
    };

    ws.onerror = (err) => {
      console.error(`[PulseWorker] Error on ${channel}:`, err);
    };

    ws.onmessage = (event) => {
      try {
        const messages = event.data.split("\n").filter((msg) => msg.trim());
        for (const msgStr of messages) {
          try {
            const data = JSON.parse(msgStr);
            // Debug: log every message received (comment out in production)
            // console.log(`[PulseWorker] WS ${channel}:`, data.type || data.event, data);
            handleMessage(channel, data);
          } catch (parseErr) {
            // Skip malformed JSON but don't crash
            console.warn(
              `[PulseWorker] JSON parse error on ${channel}:`,
              parseErr.message,
            );
          }
        }
      } catch (err) {
        // Catch any other errors (e.g., event.data being null)
        console.error(
          `[PulseWorker] Message processing error on ${channel}:`,
          err,
        );
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
      case "new_token":
      case "newToken":
      case "new":
      case "token_new":
        {
          const tokens = extractTokens(data);
          for (const t of tokens) {
            const normalized = normalizeToken(t);
            if (normalized) addNewToken(normalized);
          }
        }
        break;

      case "final_stretch_token":
      case "finalStretch":
      case "final_stretch":
      case "completing":
      case "token_final_stretch":
        {
          const tokens = extractTokens(data);
          for (const t of tokens) {
            const normalized = normalizeToken(t);
            if (normalized) addFinalStretchToken(normalized);
          }
        }
        break;

      case "migrated_token":
      case "migrated":
      case "migration":
      case "completed":
      case "token_migrated":
        {
          const tokens = extractTokens(data);
          for (const t of tokens) {
            const normalized = normalizeToken(t);
            if (normalized) addMigratedToken(normalized);
          }
        }
        break;

      case "price_update":
      case "priceUpdate":
      case "price":
        handlePriceUpdate(data.data || data.updates || [data]);
        break;

      case "token_info_update":
      case "tokenInfo":
      case "token_info":
      case "info":
        handleTokenInfoUpdate(data.data || data);
        break;

      // holder_count_update: live transitions (wallet enters/leaves holder set).
      // Backend throttles to 500ms last-value-wins per mint; count is authoritative.
      // Across our 7 VMs the count can be non-monotonic — treat each event as latest
      // state, never diff/average. Routed through handleTokenInfoUpdate so the
      // existing token-delta merge + holder_count fallback path applies as-is.
      case "holder_count_update":
      case "holderCountUpdate":
        handleTokenInfoUpdate(data.data || data);
        break;

      case "pong":
        // Heartbeat pong received — clear the timeout to prevent reconnect
        if (heartbeatTimeouts[channel]) {
          clearTimeout(heartbeatTimeouts[channel]);
          delete heartbeatTimeouts[channel];
        }
        break;

      case "snapshot":
        // Server sent a full snapshot on connect — replace entire channel array
        if (Array.isArray(data.data)) {
          const normalized = data.data.map(normalizeToken).filter(Boolean);
          if (channel === "new") {
            newTokens = normalized;
          } else if (channel === "final_stretch") {
            finalStretchTokens = normalized;
          } else if (channel === "migrated") {
            migratedTokens = normalized;
          }
          self.postMessage({
            type: "DATA",
            payload: {
              newTokens: [...newTokens],
              finalStretchTokens: [...finalStretchTokens],
              migratedTokens: [...migratedTokens],
            },
          });
          console.log(
            `[PulseWorker] Snapshot received for ${channel}: ${normalized.length} tokens`,
          );
        }
        break;

      case "batch":
      case "bulk":
        if (Array.isArray(data.updates)) {
          data.updates.forEach((update) => handleMessage(channel, update));
        }
        if (Array.isArray(data.data)) {
          data.data.forEach((update) => handleMessage(channel, update));
        }
        break;

      default:
        // Try to infer message type from channel if type is missing/unknown
        // This handles cases where backend sends token directly without explicit type
        if (data.mint || data.address || data.mint_address) {
          const normalized = normalizeToken(data);
          if (normalized) {
            if (channel === "new") {
              addNewToken(normalized);
            } else if (channel === "final_stretch") {
              addFinalStretchToken(normalized);
            } else if (channel === "migrated") {
              addMigratedToken(normalized);
            }
          }
        } else if (
          msgType &&
          msgType !== "ping" &&
          msgType !== "pong" &&
          msgType !== "heartbeat" &&
          msgType !== "connected"
        ) {
          // Log truly unhandled message types
          console.log(
            `[PulseWorker] Unhandled message type on ${channel}: ${msgType}`,
            Object.keys(data),
          );
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

  const mint =
    rawToken.mint ||
    rawToken.address ||
    rawToken.mint_address ||
    rawToken.token_address ||
    rawToken.contract_address;
  if (!mint) return null;

  // === CREATED_AT: Backend sends 'launch_time' and 'created_at' as ISO strings ===
  const createdAtValue =
    rawToken.launch_time ||
    rawToken.created_at ||
    rawToken.createdAt ||
    rawToken.LaunchTime ||
    Date.now();

  // === PRICE: Backend sends price_usd (float), priceUSD (string), usd_price (string) ===
  const priceValue =
    parseFloat(rawToken.price_usd) ||
    parseFloat(rawToken.priceUSD) ||
    parseFloat(rawToken.usd_price) ||
    parseFloat(rawToken.price) ||
    0;

  // === PRICE CHANGES: Backend sends price_percent_change_* (string), also handle price_change_* ===
  const priceChange5mValue =
    parseFloat(rawToken.price_percent_change_5m) ||
    parseFloat(rawToken.price_change_5m) ||
    parseFloat(rawToken.priceChange5m) ||
    0;
  const priceChange1hValue =
    parseFloat(rawToken.price_percent_change_1h) ||
    parseFloat(rawToken.price_change_1h) ||
    parseFloat(rawToken.priceChange1h) ||
    0;
  const priceChange6hValue =
    parseFloat(rawToken.price_percent_change_6h) ||
    parseFloat(rawToken.price_change_6h) ||
    parseFloat(rawToken.priceChange6h) ||
    0;
  const priceChange24hValue =
    parseFloat(rawToken.price_percent_change_24h) ||
    parseFloat(rawToken.price_change_24h) ||
    parseFloat(rawToken.priceChange24h) ||
    0;

  // === MARKET CAP: Backend sends market_cap_usd (float), marketCapUSD (string), fully_diluted_value (string) ===
  const marketCapValue =
    parseFloat(rawToken.market_cap_usd) ||
    parseFloat(rawToken.marketCapUSD) ||
    parseFloat(rawToken.fully_diluted_value) ||
    parseFloat(rawToken.marketCap) ||
    parseFloat(rawToken.fdv) ||
    0;

  // === LIQUIDITY: Backend sends liquidity_usd (float), liquidityUSD (string), total_liquidity_usd ===
  const liquidityValue =
    parseFloat(rawToken.liquidity_usd) ||
    parseFloat(rawToken.liquidityUSD) ||
    parseFloat(rawToken.total_liquidity_usd) ||
    parseFloat(rawToken.liquidity) ||
    0;

  // === VOLUME: Backend sends volume_24h (float), volume24h (string) ===
  const volumeValue =
    parseFloat(rawToken.volume_24h) ||
    parseFloat(rawToken.volume24h) ||
    parseFloat(rawToken.volume) ||
    0;

  // === BONDING: Backend sends bonding_pct (float), bonding_curve_progress (float) ===
  const bondingValue =
    parseFloat(rawToken.bonding_pct) ||
    parseFloat(rawToken.bonding_curve_progress) ||
    parseFloat(rawToken.bondingCurveProgress) ||
    parseFloat(rawToken.bonding_percent) ||
    0;

  // === HOLDERS: Various field names ===
  const holderValue =
    rawToken.holder_count ??
    rawToken.holders ??
    rawToken.total_holders ??
    rawToken.unique_wallets_24h ??
    0;

  // === PERCENTAGES ===
  const devPercentValue =
    rawToken.dev_percent ?? rawToken.dev_held_percentage ?? 0;
  const sniperPercentValue =
    rawToken.sniper_percent ?? rawToken.sniper_held_percentage ?? 0;
  const insiderPercentValue =
    rawToken.insider_percent ?? rawToken.insider_held_percentage ?? 0;
  const bundlePercentValue =
    rawToken.bundle_percent ?? rawToken.bundled_percentage ?? 0;

  // NOTE: Do NOT spread ...rawToken - it may contain large nested objects
  // that cause memory bloat and slow postMessage serialization
  return {
    // === Core identifiers ===
    mint,
    mint_address: mint,

    // === Basic info ===
    name: rawToken.name || rawToken.token_name || "Unknown",
    symbol: rawToken.symbol || rawToken.token_symbol || "???",
    image:
      rawToken.image ||
      rawToken.image_url ||
      rawToken.image_uri ||
      rawToken.imageUrl ||
      rawToken.logo ||
      null,
    logo:
      rawToken.logo ||
      rawToken.image ||
      rawToken.image_url ||
      rawToken.image_uri ||
      null,
    uri: rawToken.uri || null,
    status: rawToken.status || "active",
    launchpad_protocol:
      rawToken.launchpad_protocol ||
      rawToken.protocol ||
      rawToken.LaunchpadProtocol ||
      "pumpfun",
    pair_address: rawToken.pair_address || rawToken.PairAddress || null,
    links: rawToken.links || rawToken.Links || null,

    // === CRITICAL: created_at for age display (accept both ISO string and timestamp) ===
    created_at: createdAtValue,
    launch_time: createdAtValue, // Alias for PulseTable

    // === Mayhem Mode flag ===
    // Boolean from backend; this normalizer explicitly enumerates fields
    // (no ...rawToken spread to avoid postMessage bloat), so the flag has
    // to be threaded through manually or it gets dropped.
    is_mayhem_mode: !!rawToken.is_mayhem_mode,

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
    top10_holders_pct:
      rawToken.top10_holders_pct ?? rawToken.top_10_holders_percent ?? 0,

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
    migrated_pool_address:
      rawToken.migrated_pool_address || rawToken.MigratedPoolAddress || null,
    migrated_time: rawToken.migrated_time || rawToken.MigratedTime || null,
  };
}

function addNewToken(token) {
  if (!token) return;
  const existingIndex = newTokens.findIndex((t) => t.mint === token.mint);
  let finalToken = token;
  if (existingIndex !== -1) {
    const existing = newTokens[existingIndex];
    finalToken = {
      ...token,
      created_at: existing.created_at || token.created_at,
      launch_time: existing.launch_time || token.launch_time,
    };
    newTokens.splice(existingIndex, 1);
  }
  newTokens.unshift(finalToken);
  if (newTokens.length > MAX_NEW) {
    newTokens.pop();
  }
  // Send delta immediately - only this one token
  sendTokenDelta("new", finalToken);
}

function addFinalStretchToken(token) {
  if (!token) return;
  const existingIndex = finalStretchTokens.findIndex(
    (t) => t.mint === token.mint,
  );
  let finalToken = token;
  if (existingIndex !== -1) {
    const existing = finalStretchTokens[existingIndex];
    finalToken = {
      ...token,
      created_at: existing.created_at || token.created_at,
      launch_time: existing.launch_time || token.launch_time,
    };
    finalStretchTokens.splice(existingIndex, 1);
  }
  finalStretchTokens.unshift(finalToken);
  if (finalStretchTokens.length > MAX_FINAL) {
    finalStretchTokens.pop();
  }
  // Send delta immediately
  sendTokenDelta("final_stretch", finalToken);
}

function addMigratedToken(token) {
  if (!token) return;
  const existingIndex = migratedTokens.findIndex((t) => t.mint === token.mint);
  let finalToken = token;
  if (existingIndex !== -1) {
    const existing = migratedTokens[existingIndex];
    finalToken = {
      ...token,
      created_at: existing.created_at || token.created_at,
      launch_time: existing.launch_time || token.launch_time,
    };
    migratedTokens.splice(existingIndex, 1);
  }
  migratedTokens.unshift(finalToken);
  if (migratedTokens.length > MAX_MIGRATED) {
    migratedTokens.pop();
  }
  // Send delta immediately
  sendTokenDelta("migrated", finalToken);
}

function handlePriceUpdate(updates) {
  const updatesArray = Array.isArray(updates) ? updates : [updates];

  for (const update of updatesArray) {
    const mint = update.mint || update.address || update.mint_address;
    if (!mint) continue;

    // Update in arrays and send delta for each updated token
    // This is much faster than sending the full 300 token array
    const updatedToken =
      updateTokenInArray(newTokens, mint, update) ||
      updateTokenInArray(finalStretchTokens, mint, update) ||
      updateTokenInArray(migratedTokens, mint, update);

    if (updatedToken) {
      // Send delta with just this updated token
      sendTokenDelta("price_update", updatedToken);
    }
  }
}

/**
 * Update a token in an array with new data
 * Returns the updated token if found, null otherwise
 * CRITICAL: Must include BOTH PulseToken AND Token (db.ts) field names!
 *
 * IMPORTANT: Price updates only send a subset of fields (see price_update_broadcaster.go).
 * As of 2026-04-30 the broadcaster ships:
 *   - mint, name, symbol, status, uri, image, logo, pair_address
 *   - price_usd, market_cap_usd, liquidity_usd, volume_24h
 *   - total_buys_5m, total_sells_5m, total_buyers_5m, total_sellers_5m, unique_wallets_5m
 *   - total_buy_volume_5m, total_sell_volume_5m
 *
 * Late-metadata case: the first new_token frame for a token can land with empty
 * name/symbol/image (indexer metadata fetch hasn't resolved). A follow-up
 * price_update carries the real metadata, so we MUST patch it onto existing rows
 * — but only via patchMetadataIfPlaceholder so a later empty/placeholder
 * price_update can't blank out a real name we already resolved.
 *
 * Fields NOT sent by price_update: created_at, bonding_pct, 1h/6h/24h tx data, etc.
 * Use existing token values for those fields.
 */
function updateTokenInArray(arr, mint, update) {
  const idx = arr.findIndex((t) => t.mint === mint);
  if (idx === -1) return null;

  const token = arr[idx];

  // Helper: get numeric value, parsing strings if needed
  const getNum = (val) =>
    val !== undefined && val !== null
      ? typeof val === "string"
        ? parseFloat(val)
        : val
      : undefined;

  // Helper: for non-negative metrics, never overwrite a non-zero value with 0
  const keepIfPositive = (newVal, existing) => (newVal > 0 ? newVal : existing);

  // Compute updated values - only update if update has the field, otherwise keep token's value
  // Parse strings to numbers since backend may send string values
  const priceValue =
    getNum(update.price_usd) ??
    getNum(update.price) ??
    getNum(update.usd_price) ??
    token.price;
  const marketCapValue = keepIfPositive(
    getNum(update.market_cap_usd) ??
      getNum(update.marketCap) ??
      getNum(update.fully_diluted_value),
    token.market_cap_usd,
  );
  const liquidityValue = keepIfPositive(
    getNum(update.liquidity_usd) ??
      getNum(update.liquidity) ??
      getNum(update.total_liquidity_usd),
    token.liquidity_usd,
  );
  const volumeValue = keepIfPositive(
    getNum(update.volume_24h) ?? getNum(update.volume),
    token.volume_24h,
  );

  // These are NOT sent by price updates, so keep existing values
  const bondingValue = keepIfPositive(
    getNum(update.bonding_pct) ?? getNum(update.bonding_curve_progress),
    token.bonding_pct,
  );
  const holderValue = keepIfPositive(
    update.holders ?? update.holder_count ?? update.total_holders,
    token.holders,
  );

  // Price changes - not sent by price_update, keep existing
  const priceChange5mValue =
    getNum(update.price_percent_change_5m) ??
    getNum(update.price_change_5m) ??
    token.price_change_5m;
  const priceChange1hValue =
    getNum(update.price_percent_change_1h) ??
    getNum(update.price_change_1h) ??
    token.price_change_1h;
  const priceChange6hValue =
    getNum(update.price_percent_change_6h) ??
    getNum(update.price_change_6h) ??
    token.price_change_6h;
  const priceChange24hValue =
    getNum(update.price_percent_change_24h) ??
    getNum(update.price_change_24h) ??
    token.price_change_24h;

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
    unique_wallets_5m: keepIfPositive(
      update.unique_wallets_5m,
      token.unique_wallets_5m,
    ),
    unique_wallets_1h: keepIfPositive(
      update.unique_wallets_1h,
      token.unique_wallets_1h,
    ),
    unique_wallets_6h: keepIfPositive(
      update.unique_wallets_6h,
      token.unique_wallets_6h,
    ),
    unique_wallets_24h: keepIfPositive(
      update.unique_wallets_24h,
      token.unique_wallets_24h,
    ),

    // Transaction counts - BUYS
    total_buys_5m: keepIfPositive(update.total_buys_5m, token.total_buys_5m),
    total_buys_1h: keepIfPositive(update.total_buys_1h, token.total_buys_1h),
    total_buys_6h: keepIfPositive(update.total_buys_6h, token.total_buys_6h),
    total_buys_24h: keepIfPositive(update.total_buys_24h, token.total_buys_24h),

    // Transaction counts - SELLS
    total_sells_5m: keepIfPositive(update.total_sells_5m, token.total_sells_5m),
    total_sells_1h: keepIfPositive(update.total_sells_1h, token.total_sells_1h),
    total_sells_6h: keepIfPositive(update.total_sells_6h, token.total_sells_6h),
    total_sells_24h: keepIfPositive(
      update.total_sells_24h,
      token.total_sells_24h,
    ),

    // Buyer/Seller counts (price_update sends 5m)
    total_buyers_5m: keepIfPositive(
      update.total_buyers_5m,
      token.total_buyers_5m,
    ),
    total_buyers_1h: keepIfPositive(
      update.total_buyers_1h,
      token.total_buyers_1h,
    ),
    total_buyers_6h: keepIfPositive(
      update.total_buyers_6h,
      token.total_buyers_6h,
    ),
    total_buyers_24h: keepIfPositive(
      update.total_buyers_24h,
      token.total_buyers_24h,
    ),
    total_sellers_5m: keepIfPositive(
      update.total_sellers_5m,
      token.total_sellers_5m,
    ),
    total_sellers_1h: keepIfPositive(
      update.total_sellers_1h,
      token.total_sellers_1h,
    ),
    total_sellers_6h: keepIfPositive(
      update.total_sellers_6h,
      token.total_sellers_6h,
    ),
    total_sellers_24h: keepIfPositive(
      update.total_sellers_24h,
      token.total_sellers_24h,
    ),

    txns: keepIfPositive(update.txns, token.txns),

    // Volume per timeframe (price_update sends 5m, parse strings)
    total_buy_volume_5m: keepIfPositive(
      getNum(update.total_buy_volume_5m),
      token.total_buy_volume_5m,
    ),
    total_sell_volume_5m: keepIfPositive(
      getNum(update.total_sell_volume_5m),
      token.total_sell_volume_5m,
    ),
    total_buy_volume_1h: keepIfPositive(
      getNum(update.total_buy_volume_1h),
      token.total_buy_volume_1h,
    ),
    total_sell_volume_1h: keepIfPositive(
      getNum(update.total_sell_volume_1h),
      token.total_sell_volume_1h,
    ),
    total_buy_volume_6h: keepIfPositive(
      getNum(update.total_buy_volume_6h),
      token.total_buy_volume_6h,
    ),
    total_sell_volume_6h: keepIfPositive(
      getNum(update.total_sell_volume_6h),
      token.total_sell_volume_6h,
    ),
    total_buy_volume_24h: keepIfPositive(
      getNum(update.total_buy_volume_24h),
      token.total_buy_volume_24h,
    ),
    total_sell_volume_24h: keepIfPositive(
      getNum(update.total_sell_volume_24h),
      token.total_sell_volume_24h,
    ),

    // Percentages (NOT sent by price_update, keep existing)
    dev_percent: keepIfPositive(
      update.dev_percent ?? update.dev_held_percentage,
      token.dev_percent,
    ),
    dev_held_percentage: keepIfPositive(
      update.dev_held_percentage ?? update.dev_percent,
      token.dev_held_percentage,
    ),
    sniper_percent: keepIfPositive(
      update.sniper_percent ?? update.sniper_held_percentage,
      token.sniper_percent,
    ),
    sniper_held_percentage: keepIfPositive(
      update.sniper_held_percentage ?? update.sniper_percent,
      token.sniper_held_percentage,
    ),
    total_snipers: keepIfPositive(update.total_snipers, token.total_snipers),
    insider_percent: keepIfPositive(
      update.insider_percent ?? update.insider_held_percentage,
      token.insider_percent,
    ),
    insider_held_percentage: keepIfPositive(
      update.insider_held_percentage ?? update.insider_percent,
      token.insider_held_percentage,
    ),
    bundle_percent: keepIfPositive(
      update.bundle_percent ?? update.bundled_percentage,
      token.bundle_percent,
    ),
    bundled_percentage: keepIfPositive(
      update.bundled_percentage ?? update.bundle_percent,
      token.bundled_percentage,
    ),
    bundler_held_percentage: keepIfPositive(
      update.bundler_held_percentage,
      token.bundler_held_percentage,
    ),

    // Bonding curve (NOT sent by price_update, keep existing)
    bondingCurveProgress: bondingValue,
    bonding_curve_progress: bondingValue,
    bonding_pct: bondingValue,

    // KOL
    kol_count: keepIfPositive(update.kol_count, token.kol_count),

    // Pro traders
    pro_traders_count: keepIfPositive(
      update.pro_traders_count,
      token.pro_traders_count,
    ),
    smart_money_count: keepIfPositive(
      update.smart_money_count,
      token.smart_money_count,
    ),

    // Gas / Fees
    total_fees_lamports: keepIfPositive(
      update.total_fees_lamports,
      token.total_fees_lamports,
    ),
    global_fees_paid: keepIfPositive(
      update.global_fees_paid ?? update.globalFeesPaid,
      token.global_fees_paid,
    ),
    globalFeesPaid: keepIfPositive(
      update.globalFeesPaid ?? update.global_fees_paid,
      token.globalFeesPaid,
    ),

    // Metadata: only patch when current is empty/placeholder
    // (covers name, symbol, image, logo, uri — see patchMetadataIfPlaceholder)
    ...patchMetadataIfPlaceholder(token, update),
  };

  arr[idx] = updatedToken;
  return updatedToken; // Return the updated token for delta updates
}

function handleTokenInfoUpdate(update) {
  const mint = update.mint_address || update.mint || update.address;
  if (!mint) return;

  // Try to update in each array, send delta if found
  const applyAndSendDelta = (arr) => {
    const idx = arr.findIndex((t) => t.mint === mint);
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
    sendTokenDelta("token_info", updatedToken);
    return true;
  };

  // Apply to all arrays where token exists
  applyAndSendDelta(newTokens);
  applyAndSendDelta(finalStretchTokens);
  applyAndSendDelta(migratedTokens);
}

console.log("[PulseWorker] Worker initialized");
