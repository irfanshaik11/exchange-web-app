// src/utils/hyperliquidApi.ts
// REST API helpers for Hyperliquid public data + Interstate backend authenticated calls
// Public data: fetched directly from Hyperliquid API (no auth needed)
// Authenticated data: routed through Interstate backend (JWT auth)

import type {
  HyperliquidMeta,
  HyperliquidMetaAndAssetCtxs,
  HyperliquidL2Book,
  HyperliquidCandle,
  HyperliquidTrade,
  HyperliquidConfig,
} from "./hyperliquidTypes";

// ============ Configuration ============

const INTERSTATE_API = process.env.NEXT_PUBLIC_API_URL || "";

// Hyperliquid API URLs (frontend connects directly for reads)
const HL_MAINNET_API = "https://api.hyperliquid.xyz";
const HL_TESTNET_API = "https://api.hyperliquid-testnet.xyz";

// Cached config from backend
let cachedConfig: HyperliquidConfig | null = null;

/**
 * Get Hyperliquid configuration (testnet/mainnet) from Interstate backend.
 * Cached after first call.
 */
export async function getHlConfig(): Promise<HyperliquidConfig> {
  if (cachedConfig) return cachedConfig;

  // Try fetching config from Interstate backend
  if (INTERSTATE_API) {
    try {
      const res = await fetch(`${INTERSTATE_API}/api/hyperliquid/config`);
      if (res.ok) {
        cachedConfig = await res.json();
        return cachedConfig!;
      }
    } catch {
      // Backend not available — fall through to default
    }
  }

  // Default: mainnet (real data)
  cachedConfig = {
    isTestnet: false,
    apiUrl: HL_MAINNET_API,
    wsUrl: "wss://api.hyperliquid.xyz/ws",
  };
  return cachedConfig;
}

/**
 * Get the Hyperliquid API base URL.
 */
async function getHlApiUrl(): Promise<string> {
  const config = await getHlConfig();
  return config.apiUrl;
}

// ============ Direct Hyperliquid API Calls (public, no auth) ============

/**
 * Generic POST to Hyperliquid /info endpoint.
 */
async function fetchHyperliquidInfo<T>(body: Record<string, any>): Promise<T> {
  const apiUrl = await getHlApiUrl();
  const res = await fetch(`${apiUrl}/info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Hyperliquid API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

/**
 * Fetch perpetual market metadata (instruments list).
 */
export async function fetchMeta(): Promise<HyperliquidMeta> {
  return fetchHyperliquidInfo<HyperliquidMeta>({ type: "meta" });
}

/**
 * Fetch meta + asset contexts in one call (prices, funding, OI).
 */
export async function fetchMetaAndAssetCtxs(): Promise<HyperliquidMetaAndAssetCtxs> {
  const [meta, assetCtxs] = await fetchHyperliquidInfo<[HyperliquidMeta, any[]]>({
    type: "metaAndAssetCtxs",
  });
  return { meta, assetCtxs };
}

/**
 * Fetch all mid prices.
 */
export async function fetchAllMids(): Promise<Record<string, string>> {
  return fetchHyperliquidInfo<Record<string, string>>({ type: "allMids" });
}

/**
 * Fetch L2 order book for a coin.
 */
export async function fetchL2Book(
  coin: string,
  nSigFigs: number = 3
): Promise<HyperliquidL2Book> {
  return fetchHyperliquidInfo<HyperliquidL2Book>({
    type: "l2Book",
    coin,
    nSigFigs,
  });
}

/**
 * Fetch OHLCV candle data.
 */
export async function fetchCandles(
  coin: string,
  interval: string,
  startTime: number,
  endTime?: number
): Promise<HyperliquidCandle[]> {
  return fetchHyperliquidInfo<HyperliquidCandle[]>({
    type: "candleSnapshot",
    req: { coin, interval, startTime, endTime: endTime || Date.now() },
  });
}

/**
 * Fetch recent trades for a coin.
 */
export async function fetchRecentTrades(coin: string): Promise<HyperliquidTrade[]> {
  return fetchHyperliquidInfo<HyperliquidTrade[]>({
    type: "recentTrades",
    coin,
  });
}

/**
 * Fetch user clearinghouse state (positions, margin).
 */
export async function fetchClearinghouseState(userAddress: string) {
  return fetchHyperliquidInfo({
    type: "clearinghouseState",
    user: userAddress,
  });
}

// ============ Interstate Backend API Calls (authenticated) ============

/**
 * Generic authenticated fetch to Interstate backend.
 */
async function fetchInterstate<T>(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${INTERSTATE_API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errorBody.error || `API error: ${res.status}`);
  }

  return res.json();
}

/**
 * Get user account state (margin, balance).
 */
export async function fetchAccount(token: string) {
  return fetchInterstate("/api/hyperliquid/account", token);
}

/**
 * Get user positions.
 */
export async function fetchPositions(token: string) {
  return fetchInterstate("/api/hyperliquid/positions", token);
}

/**
 * Get user open orders.
 */
export async function fetchOpenOrders(token: string) {
  return fetchInterstate("/api/hyperliquid/open-orders", token);
}

/**
 * Get user trade history.
 */
export async function fetchTradeHistory(token: string) {
  return fetchInterstate("/api/hyperliquid/trade-history", token);
}

/**
 * Place an order.
 */
export async function placeOrder(
  token: string,
  params: {
    coin: string;
    side: "LONG" | "SHORT";
    size: number;
    price?: number;
    orderType: "market" | "limit" | "stop-limit";
    leverage?: number;
    reduceOnly?: boolean;
    triggerPrice?: number;
  }
) {
  return fetchInterstate("/api/hyperliquid/order", token, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/**
 * Cancel an order.
 */
export async function cancelOrder(token: string, coin: string, orderId: number) {
  return fetchInterstate(`/api/hyperliquid/order/${orderId}?coin=${coin}`, token, {
    method: "DELETE",
  });
}

/**
 * Set leverage for an asset.
 */
export async function setLeverage(
  token: string,
  coin: string,
  leverage: number,
  isCross?: boolean
) {
  return fetchInterstate("/api/hyperliquid/leverage", token, {
    method: "POST",
    body: JSON.stringify({ coin, leverage, isCross }),
  });
}

/**
 * Close a position.
 */
export async function closePosition(
  token: string,
  coin: string,
  percentage: number = 100
) {
  return fetchInterstate("/api/hyperliquid/close-position", token, {
    method: "POST",
    body: JSON.stringify({ coin, percentage }),
  });
}

/**
 * Get balances (Arbitrum + Hyperliquid).
 */
export async function fetchBalances(token: string) {
  const [arb, hl] = await Promise.all([
    fetchInterstate("/api/hyperliquid/arbitrum-balance", token),
    fetchInterstate("/api/hyperliquid/hl-balance", token),
  ]);
  return { arbitrum: arb, hyperliquid: hl };
}

/**
 * Deposit USDC to Hyperliquid.
 */
export async function deposit(token: string, amount: number) {
  return fetchInterstate("/api/hyperliquid/deposit", token, {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
}

/**
 * Withdraw USDC from Hyperliquid.
 */
export async function withdraw(token: string, amount: number) {
  return fetchInterstate("/api/hyperliquid/withdraw", token, {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
}
