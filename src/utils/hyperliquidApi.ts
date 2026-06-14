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

// The app's canonical backend var is NEXT_PUBLIC_BACKEND_URL (see utils/api.ts).
// NEXT_PUBLIC_API_URL was a never-set name that left this empty in dev, which
// silently disabled all backend-routed Hyperliquid calls (incl. HIP-3 markets).
const INTERSTATE_API = (
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  ""
).replace(/\/$/, "");

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

// ============ HIP-3 builder DEXs (aggregated via backend) ============

export interface DexCtxsEntry {
  /** "" for the main universe, otherwise the builder DEX short name. */
  dex: string;
  /** Raw metaAndAssetCtxs tuple: [meta, assetCtxs]. */
  data: [any, any];
}

/**
 * Aggregated [meta, ctxs] for the main universe + every HIP-3 builder DEX.
 * Preferred path: the Interstate backend (60s server cache) so all clients
 * share one Hyperliquid fetch pass. Fallback: fetch directly from Hyperliquid
 * (~9 sequential info calls) so HIP-3 markets still appear when the backend
 * is unreachable or doesn't have the endpoint yet.
 */
export async function fetchAllDexCtxs(): Promise<DexCtxsEntry[]> {
  if (INTERSTATE_API) {
    try {
      const res = await fetch(`${INTERSTATE_API}/api/hyperliquid/all-dex-ctxs`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) return data;
      }
    } catch {
      // fall through to direct Hyperliquid
    }
  }
  return fetchAllDexCtxsDirect();
}

/** Direct-from-Hyperliquid fallback for the all-dex aggregate. */
async function fetchAllDexCtxsDirect(): Promise<DexCtxsEntry[]> {
  const out: DexCtxsEntry[] = [];
  try {
    const dexs = await fetchHyperliquidInfo<any[]>({ type: "perpDexs" });
    // Sequential to be gentle on the public rate limit; element 0 is null (main
    // dex, already covered by the 5s loop so callers skip dex === "").
    for (const d of dexs) {
      if (!d?.name) continue;
      try {
        const data = await fetchHyperliquidInfo<[any, any]>({
          type: "metaAndAssetCtxs",
          dex: d.name,
        });
        out.push({ dex: d.name, data });
      } catch {
        // one dex failing shouldn't hide the rest
      }
    }
  } catch {
    // no perpDexs — return what we have (possibly empty)
  }
  return out;
}

// ============ Spot / Staking / Vaults / Subaccounts ============

/** Spot universe metadata (public). */
export async function fetchSpotMeta() {
  const res = await fetch(`${INTERSTATE_API}/api/hyperliquid/spot-meta`);
  if (!res.ok) throw new Error(`spot-meta failed: ${res.status}`);
  return res.json();
}

/** Spot metadata + live contexts (public). */
export async function fetchSpotAssetCtxs() {
  const res = await fetch(`${INTERSTATE_API}/api/hyperliquid/spot-asset-ctxs`);
  if (!res.ok) throw new Error(`spot-asset-ctxs failed: ${res.status}`);
  return res.json();
}

/** Browseable vault list (public). */
export async function fetchVaults() {
  const res = await fetch(`${INTERSTATE_API}/api/hyperliquid/vaults`);
  if (!res.ok) throw new Error(`vaults failed: ${res.status}`);
  return res.json();
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

// ============ Builder fee (monetization) ============

export interface BuilderFeeStatus {
  enabled: boolean;
  approved: boolean;
  feePercent: number;   // e.g. 0.05 (%)
  feeTenthsBp: number;  // e.g. 50
  approvedMax?: number;
  maxFeeRate?: string;  // e.g. "0.1%"
  address?: string;
}

/**
 * Whether the user has approved Interstate's builder fee, plus the fee config.
 */
export async function fetchBuilderFeeStatus(token: string): Promise<BuilderFeeStatus> {
  return fetchInterstate("/api/hyperliquid/builder-fee-status", token);
}

/**
 * One-time approval allowing Interstate to collect a builder fee on the user's
 * fills. Signed by the user's main wallet (handled server-side via Turnkey).
 */
export async function approveBuilderFee(
  token: string,
  walletId?: string
): Promise<{ success: boolean; error?: string; maxFeeRate?: string }> {
  return fetchInterstate("/api/hyperliquid/approve-builder-fee", token, {
    method: "POST",
    body: JSON.stringify({ walletId }),
  });
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
    postOnly?: boolean;
    takeProfitPrice?: number;
    stopLossPrice?: number;
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
 * Modify a resting order in place (price / size).
 */
export async function modifyOrder(
  token: string,
  orderId: number,
  params: {
    coin: string;
    side: "LONG" | "SHORT";
    price: number;
    size: number;
    reduceOnly?: boolean;
    postOnly?: boolean;
  }
) {
  return fetchInterstate(`/api/hyperliquid/order/${orderId}`, token, {
    method: "PATCH",
    body: JSON.stringify(params),
  });
}

/**
 * Place a TWAP order (slices `size` over `durationMinutes`, 5–1440).
 */
export async function placeTwapOrder(
  token: string,
  params: {
    coin: string;
    side: "LONG" | "SHORT";
    size: number;
    durationMinutes: number;
    reduceOnly?: boolean;
    randomize?: boolean;
    leverage?: number;
  }
): Promise<{ success: boolean; twapId?: number; error?: string }> {
  return fetchInterstate("/api/hyperliquid/twap", token, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/**
 * Cancel a running TWAP order.
 */
export async function cancelTwapOrder(token: string, coin: string, twapId: number) {
  return fetchInterstate("/api/hyperliquid/twap", token, {
    method: "DELETE",
    body: JSON.stringify({ coin, twapId }),
  });
}

/**
 * Add (positive) or remove (negative) isolated margin on a position.
 */
export async function updateIsolatedMargin(
  token: string,
  coin: string,
  amountUsd: number,
  isLong: boolean
) {
  return fetchInterstate("/api/hyperliquid/margin", token, {
    method: "POST",
    body: JSON.stringify({ coin, amountUsd, isLong }),
  });
}

// ---- Spot ----

/** User's spot token balances. */
export async function fetchSpotBalances(token: string) {
  return fetchInterstate("/api/hyperliquid/spot-balances", token);
}

/** Move USDC between perp and spot accounts. */
export async function usdClassTransfer(token: string, amountUsd: number, toPerp: boolean) {
  return fetchInterstate("/api/hyperliquid/usd-class-transfer", token, {
    method: "POST",
    body: JSON.stringify({ amountUsd, toPerp }),
  });
}

// ---- Staking (HYPE) ----

/** Staking summary + current delegations. */
export async function fetchStaking(token: string) {
  return fetchInterstate("/api/hyperliquid/staking", token);
}

export async function stakingDeposit(token: string, amount: number) {
  return fetchInterstate("/api/hyperliquid/staking/deposit", token, {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
}

export async function stakingWithdraw(token: string, amount: number) {
  return fetchInterstate("/api/hyperliquid/staking/withdraw", token, {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
}

export async function stakingDelegate(
  token: string,
  validator: string,
  amount: number,
  isUndelegate = false
) {
  return fetchInterstate("/api/hyperliquid/staking/delegate", token, {
    method: "POST",
    body: JSON.stringify({ validator, amount, isUndelegate }),
  });
}

// ---- Vaults ----

/** The user's vault positions. */
export async function fetchVaultEquities(token: string) {
  return fetchInterstate("/api/hyperliquid/vault-equities", token);
}

export async function vaultTransfer(
  token: string,
  vaultAddress: string,
  isDeposit: boolean,
  amountUsd: number
) {
  return fetchInterstate("/api/hyperliquid/vault-transfer", token, {
    method: "POST",
    body: JSON.stringify({ vaultAddress, isDeposit, amountUsd }),
  });
}

// ---- Subaccounts ----

export async function fetchSubAccounts(token: string) {
  return fetchInterstate("/api/hyperliquid/subaccounts", token);
}

export async function createSubAccount(token: string, name: string) {
  return fetchInterstate("/api/hyperliquid/subaccounts", token, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function subAccountTransfer(
  token: string,
  subAccountUser: string,
  isDeposit: boolean,
  amountUsd: number
) {
  return fetchInterstate("/api/hyperliquid/subaccounts/transfer", token, {
    method: "POST",
    body: JSON.stringify({ subAccountUser, isDeposit, amountUsd }),
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
