// Centralized API client for backend calls related to authentication and trading
import { env } from "../env";
// Critical Fix #10: Network timeout handling
import { fetchWithTimeout, isTimeoutError as checkTimeoutError } from "./fetchWithTimeout";
import { getStoredReferralToken } from "./referralStorage";

// Constants
export const SOL_MINT_ADDRESS = "So11111111111111111111111111111111111111112";

interface RequestOptions extends RequestInit {
  /** JSON body that will be automatically stringified */
  body?: any;
  /** Bearer token for authenticated endpoints */
  authToken?: string;
}

export interface ReferralDetails {
  code: string;
  label?: string | null;
  description?: string | null;
  isDefault: boolean;
  expiresAt?: string | null;
  maxUses?: number | null;
  isActive?: boolean;
}

export interface ReferralSession {
  token: string;
  referral: ReferralDetails;
}

export interface ReferralValidationSuccess {
  valid: true;
  token: string;
  referral: ReferralDetails;
}

/**
 * Custom error class for structured API errors from backend
 */
export class ApiError extends Error {
  code?: string;
  details?: any;
  suggestions?: string[];
  status?: number;

  constructor(
    message: string,
    code?: string,
    details?: any,
    suggestions?: string[],
    status?: number
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
    this.suggestions = suggestions;
    this.status = status;
  }
}

/**
 * Low-level helper that wraps `fetch` with sane defaults:
 *  – Prepends `NEXT_PUBLIC_BACKEND_URL`
 *  – Sets `Content-Type: application/json`
 *  – Adds `Authorization` header when `authToken` provided
 *  – Parses JSON response and throws for non-2xx statuses
 */

// Normalize/upgrade backend URL to avoid mixed-content fetch failures when the app is served over HTTPS.
function resolveBackendBaseUrl(): string {
  const envUrl = env.NEXT_PUBLIC_BACKEND_URL || "";

  // Helper to strip a trailing slash for clean concatenation
  const stripTrailingSlash = (url: string) =>
    url.endsWith("/") ? url.slice(0, -1) : url;

  if (typeof window === "undefined") {
    return stripTrailingSlash(envUrl);
  }

  try {
    const url = new URL(envUrl || window.location.origin);

    // If the app is running on https and the env is http, upgrade to https to avoid mixed-content blocks.
    if (window.location.protocol === "https:" && url.protocol === "http:") {
      url.protocol = "https:";
    }

    return stripTrailingSlash(url.toString());
  } catch {
    // Fallback to current origin if env value is malformed
    return stripTrailingSlash(window.location.origin);
  }
}

async function apiFetch<T = unknown>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const { authToken, body, headers, ...rest } = options;

  try {
    const finalHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    };

    if (headers) {
      if (headers instanceof Headers) {
        headers.forEach((value, key) => {
          finalHeaders[key] = value as string;
        });
      } else if (Array.isArray(headers)) {
        headers.forEach(([key, value]) => {
          finalHeaders[key] = value;
        });
      } else {
        Object.assign(finalHeaders, headers as Record<string, string>);
      }
    }

    if (typeof window !== 'undefined') {
      const hasReferralHeader = Object.keys(finalHeaders).some(
        (key) => key.toLowerCase() === 'x-referral-token',
      );
      if (!hasReferralHeader) {
        const referralToken = getStoredReferralToken();
        if (referralToken) {
          finalHeaders['X-Referral-Token'] = referralToken;
        }
      }
    }

    // Critical Fix #10: Use fetchWithTimeout instead of fetch (45s timeout for trade operations)
    const res = await fetchWithTimeout(
      `${resolveBackendBaseUrl()}${endpoint}`,
      {
        headers: finalHeaders,
        body: body ? JSON.stringify(body) : undefined,
        ...rest,
      },
      45000  // 45 second timeout (accounts for backend retries: 30s × 2 attempts)
    );

    // Attempt to parse JSON – if this fails, we still throw for non-OK statuses
    const data = await res.json().catch(() => undefined);

    if (!res.ok) {
      // Check if backend returned a structured error
      if (data && typeof data === 'object') {
        const message = data.message || data.error || res.statusText;
        const code = data.code;
        const details = data.details;
        const suggestions = data.suggestions;

        // Create structured error
        const apiError = new ApiError(message, code, details, suggestions, res.status);

        // Suppress console.error for expected validation errors to prevent Next.js dev overlay
        const EXPECTED_ERROR_CODES = [
          'NO_HOLDINGS', 'INSUFFICIENT_BALANCE', 'VALIDATION_ERROR',
          'AMOUNT_TOO_SMALL', 'POOL_UNAVAILABLE', 'TX_FAILED', 'POOL_GRADUATED', 'METEORA_NO_LIQUIDITY', 'NO_LIQUIDITY', 'NO_ROUTE', 'BUY_FAILED', 'PUMPAMM_SELL_FAILED', 'BONKSWAP_TRADE_FAILED', 'INVALID_POOL_TYPE', 'TURNKEY_NOT_SUPPORTED', 'TOKEN_NOT_SUPPORTED',
          'INVALID_TOKEN', 'TOKEN_EXPIRED', 'UNAUTHORIZED'
        ];
        if (EXPECTED_ERROR_CODES.includes(code)) {
          // Mark as expected error (won't trigger Next.js error overlay in dev)
          (apiError as any).expected = true;
        }

        throw apiError;
      }

      // Fallback to simple error
      const message =
        (data as any)?.message || (data as any)?.error || res.statusText;
      throw new Error(message);
    }

    return data as T;

  } catch (error: any) {
    // Critical Fix #10: Handle timeout errors with structured response
    if (checkTimeoutError(error)) {
      throw new ApiError(
        'Request timed out. The server is taking too long to respond.',
        'CLIENT_TIMEOUT',
        { timeoutMs: 45000 },
        [
          'Try again in a few seconds',
          'Check your internet connection',
          'The network may be experiencing high congestion'
        ],
        408  // HTTP 408 Request Timeout
      );
    }

    // Re-throw other errors
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/*                               Auth endpoints                               */
/* -------------------------------------------------------------------------- */

export const getUserById = (token: string) =>
  apiFetch<{ user: any }>("/api/users/get_user_by_id", {
    authToken: token,
    method: "GET",
  });

export const acknowledgeWalletExport = (token: string) =>
  apiFetch<{
    ok: boolean;
    hasExportedWallet: boolean;
    walletExportedAt: string | null;
  }>("/api/users/wallet/export/acknowledge", {
    authToken: token,
    method: "POST",
  });

export const updateUser = (
  token: string,
  email: string,
  name: string,
  userId: string | number
) =>
  apiFetch<{ user: any }>("/api/users/userDetails", {
    authToken: token,
    method: "PUT",
    body: { email, name, userId },
  });

export const login = (email: string, password: string) =>
  apiFetch<{ token: string }>("/api/users/login", {
    method: "POST",
    body: { email, password },
  });

export const register = (email: string, name: string, password: string, referralCode?: string) =>
  apiFetch<{ user: any }>("/api/users/register", {
    method: "POST",
    body: { email, name, password, ...(referralCode && { referralCode }) },
  });

export const phantomLogin = (
  publicKey: string,
  signature: string,
  message: string,
  referralCode?: string,
) =>
  apiFetch<{ token: string }>("/api/users/phantom/login", {
    method: "POST",
    body: { publicKey, signature, message, ...(referralCode && { referralCode }) },
  });

export const metamaskLogin = (
  address: string,
  signature: string,
  message: string,
  referralCode?: string,
) => {

  return apiFetch<{ token: string }>("/api/users/metamask/login", {
    method: "POST",
    body: { address, signature, message, ...(referralCode && { referralCode }) },
  });
};

export const turnkeyLogin = (
  params: {
    turnkeySessionToken: string;
    organizationId: string;
    userId: string;
    referralCode?: string;
  }
) => {
  const endpoints = [
    "/api/users/turnkey/login"
  ];
  return (async () => {
    let lastError: unknown;
    for (const endpoint of endpoints) {
      try {
        return await apiFetch<{ token: string }>(endpoint, {
          method: "POST",
          body: params,
        });
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  })();
};

/** Returns the Google OAuth redirect URL (client will navigate to it) */
export const googleAuthUrl = `${env.NEXT_PUBLIC_BACKEND_URL}/api/users/auth/google`;

/* -------------------------------------------------------------------------- */
/*                             Referral endpoints                              */
/* -------------------------------------------------------------------------- */

export const validateReferralCode = (code: string) =>
  apiFetch<ReferralValidationSuccess>("/api/referrals/validate", {
    method: "POST",
    body: { code },
  });

export const getReferralSession = () =>
  apiFetch<ReferralSession>("/api/referrals/session", {
    method: "GET",
  });

/* -------------------------------------------------------------------------- */
/*                              Limit Order endpoints                         */
/* -------------------------------------------------------------------------- */

export interface CreateLimitOrderParams {
  tokenAddress: string;
  amount: number;
  type: "Buy" | "Sell";
  direction: "Above" | "Below";
  targetMC?: number | string; // Made optional for bonding triggers
  triggerType?: "marketCap" | "bonding" | "devSell"; // New field
  bondingTarget?: number; // New field
  devWallet?: string; // New field
  // Optional context data from frontend (for better logging and validation)
  currentPrice?: number | string;
  currentMarketCap?: number | string;
  tokenName?: string;
  tokenSymbol?: string;
  tokenDecimals?: number;
  poolAddress?: string; // For trading execution (migrated_pool_address || pair_address)
  pairAddress?: string; // For market cap tracking (always pair_address)
  poolType?: string;
  // Trading parameter overrides (mirrors quick-buy presets)
  slippage?: number;
  priorityFee?: number;
  bribe?: number;
  mevProtection?: boolean;
  mevMode?: "off" | "reduced" | "on";
  autoFee?: boolean;
  maxFee?: number;
  rpc?: string;
}

type LimitOrderStatus = "Active" | "Cancelled" | "Completed" | "Failed";

interface LimitOrder {
  id: string;
  tokenAddress: string;
  pairAddress?: string | null;
  type: "Buy" | "Sell";
  direction: "Above" | "Below";
  targetMC: number | string;
  solAmount: number | string;
  tokenAmount: number | string;
  status: LimitOrderStatus;
  createdAt?: string; // Only present in my_orders response
  transactionHash?: string | null;
  poolType?: string | null;
  failureReason?: string | null;
  failureCode?: string | null;
  slippage?: number | string;
  priorityFee?: number | string;
  bribe?: number | string;
  mevMode?: string | null;
  autoFee?: boolean;
  maxFee?: number | string;
  mevProtection?: boolean;
  rpc?: string | null;
  triggerType?: "marketCap" | "bonding" | "devSell"; // New field
  bondingTarget?: number; // New field
  initialBondingPct?: number; // New field
  devWallet?: string | null; // New field
}

interface UpdateLimitOrderParams {
  orderId: string;
  status: "Cancelled" | "Completed"; // Assuming only these statuses can be set by client
}

export const createLimitOrder = (
  params: CreateLimitOrderParams,
  authToken: string,
) =>
  apiFetch<{ message: string; order: LimitOrder }>("/api/limit/create_order", {
    method: "POST",
    body: params,
    authToken,
  });

export const getMyLimitOrders = (authToken: string) =>
  apiFetch<{ orders: LimitOrder[] }>("/api/limit/my_orders", {
    method: "GET",
    authToken,
  });

export const getLimitOrderExecutionResult = (
  orderId: string | number,
  authToken: string,
) =>
  apiFetch<any>(`/api/limit/execution_result/${orderId}`, {
    method: "GET",
    authToken,
  });

// Withdrawal functions
interface WithdrawParams {
  amount: number;
  destinationAddress: string;
  sourceAddress?: string;
  chain?: string;
}

export const withdrawSOL = (params: WithdrawParams, authToken: string) =>
  apiFetch<{ 
    message: string; 
    txHash?: string;
    txSignature?: string;
    amount: number;
    destinationAddress: string;
    newBalance?: number;
    transactionId?: number;
  }>("/api/users/withdraw", {
    method: "POST",
    body: params,
    authToken,
  });

interface WithdrawalTransaction {
  id: number;
  amount: number | string; // PostgreSQL DECIMAL returns as string
  destinationAddress?: string;
  txSignature?: string;
  status: 'pending' | 'completed' | 'failed';
  fee: number | string; // PostgreSQL DECIMAL returns as string
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

export const getWithdrawalHistory = (authToken: string) =>
  apiFetch<{ transactions: WithdrawalTransaction[] }>("/api/users/withdrawal-history", {
    method: "GET",
    authToken,
  });

export const getWithdrawalFee = async (chain?: string) => {
  const query = chain ? `?chain=${encodeURIComponent(chain)}` : "";
  try {
    return await apiFetch<{
      fee: number;
      rentExemptMinimum: number;
      fallbackFee: number;
      minimumReserve: number;
    }>(`/api/users/withdrawal-fee${query}`, {
      method: "GET",
    });
  } catch (error) {
    console.warn("Using fallback withdrawal fee (endpoint unavailable).", error);
    return {
      fee: 0.0005,
      rentExemptMinimum: 0,
      fallbackFee: 0,
      minimumReserve: 0,
    };
  }
};

// Wallet redistribution (split/consolidate)
export const redistributeWalletFunds = (
  params: { chain: "sol" | "monad"; mode: "split" | "consolidate"; walletIds: string[] },
  authToken: string
) =>
  apiFetch<{
    ok: boolean;
    summary: { sent: number; failed: number; skipped: number };
    results: Array<{
      from: string;
      to: string;
      amount: string;
      txSignature?: string;
      status: "sent" | "skipped" | "failed";
      reason?: string;
    }>;
  }>("/api/wallets/redistribute", {
    method: "POST",
    body: params,
    authToken,
  });

export const deleteUserWallet = (walletId: string, authToken: string) =>
  apiFetch<{ ok: boolean; walletId: string }>(`/api/users/wallet/${walletId}`, {
    method: "DELETE",
    authToken,
  });

export const updateLimitOrder = (
  params: UpdateLimitOrderParams,
  authToken: string,
) =>
  apiFetch<{ message: string; order: Pick<LimitOrder, "id" | "status"> }>(
    "/api/limit/update_order",
    {
      method: "POST",
      body: params,
      authToken,
    },
  );

export const updateRpcEndpoint = (
  rpcUrl: string,
  authToken: string,
  websocketUrl?: string,
) =>
  apiFetch<{
    message: string;
    rpcEndpoint: string;
    rpcWebsocketEndpoint: string;
  }>("/api/config/rpc", {
    method: "POST",
    body: { rpcUrl, websocketUrl },
    authToken,
  });

/* -------------------------------------------------------------------------- */
/*                               Waitlist endpoints                           */
/* -------------------------------------------------------------------------- */

export const joinWaitlist = (params: {
  userId?: number;
  walletId?: string;
  telegramId?: string;
}) =>
  apiFetch<{ waitlist: {
    id: number;
    userId?: number | null;
    walletId?: string | null;
    waitlistNumber: string; // bigint as string
    telegramId?: string | null;
    status: 'waiting' | 'invited' | 'activated' | 'removed';
    joinedAt: string;
    invitedAt?: string | null;
    activatedAt?: string | null;
    updatedAt: string;
  } }>("/api/waitlist/join", {
    method: "POST",
    body: params,
  });

export const getWaitlistStatus = (params: { userId?: number; walletId?: string }) => {
  const qs = new URLSearchParams();
  if (params.userId) qs.set('userId', String(params.userId));
  if (params.walletId) qs.set('walletId', String(params.walletId));
  return apiFetch<{ waitlist: {
    id: number;
    userId?: number | null;
    walletId?: string | null;
    waitlistNumber: string;
    telegramId?: string | null;
    status: 'waiting' | 'invited' | 'activated' | 'removed';
    joinedAt: string;
    invitedAt?: string | null;
    activatedAt?: string | null;
    updatedAt: string;
  } }>(`/api/waitlist/status?${qs.toString()}`, {
    method: "GET",
  }).catch((err) => {
    // If the user isn't on the waitlist yet, treat as no waitlist instead of throwing
    if (err instanceof ApiError && err.status === 404) {
      return { waitlist: null as any };
    }
    throw err;
  });
};

export const completeAllQuests = (params: {
  userId?: number;
  walletId?: string;
  telegramId?: string;
  twitterId?: string;
  twitterUsername?: string;
}) =>
  apiFetch<{ waitlist: {
    id: number;
    userId?: number | null;
    walletId?: string | null;
    waitlistNumber: string; // bigint as string
    telegramId?: string | null;
    twitterId?: string | null;
    twitterUsername?: string | null;
    status: 'waiting' | 'invited' | 'activated' | 'removed';
    joinedAt: string;
    invitedAt?: string | null;
    activatedAt?: string | null;
    updatedAt: string;
  } }>("/api/waitlist/complete", {
    method: "POST",
    body: params,
  });

export const grantWaitlistAccess = (params: { userId?: number; walletId?: string }) =>
  apiFetch<{ waitlist: {
    id: number;
    waitlistNumber: string;
    status: 'waiting' | 'invited' | 'activated' | 'removed';
  } }>("/api/waitlist/grant-access", {
    method: "POST",
    body: params,
  });

// SECURITY FIX: Now requires authentication token - userId parameter is ignored by backend
export const redeemAccessCode = (params: { accessCode: string; authToken: string }) =>
  apiFetch<{ waitlist: {
    id: number;
    waitlistNumber: string;
    status: 'waiting' | 'invited' | 'activated' | 'removed';
  } }>("/api/waitlist/redeem-access", {
    method: "POST",
    body: { accessCode: params.accessCode },
    // SECURITY: userId is no longer sent - backend uses authenticated user from JWT token
    authToken: params.authToken,
  });

/* -------------------------------------------------------------------------- */
/*                               Trade endpoints                              */
/* -------------------------------------------------------------------------- */

export type BuyParams = {
  poolAddress?: string; // Optional - backend will discover if missing
  baseMint: string;
  quoteMint: string;
  amount: number;
  walletId?: string; // Optional - target a specific wallet for signing
  walletIds?: string[]; // Optional - multi-wallet selection
  useMultipleWallets?: boolean; // Optional - enable multi-wallet mode
  mevProtection?: 0 | 1;
  poolType?: "PumpAmm" | "Raydium" | "Raydium CPMM" | "Raydium CLMM" | "Raydium Launchpad" | "Pumpfun" | "launchLab" | "bonk" | "meteora dbc" | "meteora amm v1" | "meteora amm v2" | "Meteora" | "bags" | "MoonShoot" | "Orca" | ""; // Optional - backend will detect if missing
  originalPairAddress?: string; // Original pair address from token-service for trade history
  // Preset trading parameters
  slippage?: number; // Percentage value (0.01-100), e.g., 20 for 20%
  priorityFee?: number; // in SOL, e.g., 0.001
  bribe?: number; // in SOL, e.g., 0.001
  mevMode?: 'off' | 'reduced' | 'on';
  autoFee?: boolean;
  maxFee?: number; // in SOL
  rpc?: string;
  // Optional debugging metadata
  tokenName?: string;
  tokenSymbol?: string;
  imageUrl?: string;
};

export const tradeBuy = (params: BuyParams, authToken: string) => {
  return apiFetch<{ 
    message: string; 
    txid: string; 
    tokenAddress: string; 
    amount: number; 
    walletPublickey: string; 
    trade: any;
    // Also support the expected format for backward compatibility
    hash?: string;
    tokenAmount?: number;
  }>("/api/trade/buy", {
    method: "POST",
    body: params,
    authToken,
  });
};

export type SellPercentageParams = {
  tokenAddress: string;
  percentageToSell: number;
  poolAddress?: string; // Optional - backend will discover if missing
  baseMint: string;
  quoteMint: string;
  poolType?: string;
  originalPairAddress?: string; // Original pair address from token-service for trade history
  // Preset trading parameters
  slippage?: number; // Percentage value (0.01-100), e.g., 20 for 20%
  priorityFee?: number; // in SOL, e.g., 0.001
  bribe?: number; // in SOL, e.g., 0.001
};

export const tradeSellPercentage = (
  params: SellPercentageParams,
  authToken: string,
) =>
  apiFetch<{ message?: string; hash?: string }>("/api/trade/sell_percentage", {
    method: "POST",
    body: params,
    authToken,
  });

type SellExactAmountParams = {
  tokenAddress: string;
  tokenAmount: number;
  solPrice: number;
  marketCap: number;
  tokenPrice: number;
};

export const tradeSellExactAmount = (params: SellExactAmountParams) =>
  apiFetch("/api/trade/sell_exactAmount", {
    method: "POST",
    body: params,
  });

/* -------------------------------------------------------------------------- */
/*                          Monad Trading endpoints                            */
/* -------------------------------------------------------------------------- */

export type MonadBuyParams = {
  tokenAddress: string; // ERC-20 token address (0x format)
  amountMON: number; // Amount in MON (native currency)
  launchpad: 'nadfun' | 'flapsh-simple' | 'flapsh-devs'; // Launchpad identifier
  slippage?: number; // Optional: Slippage percentage (e.g., 5 for 5%)
  gasPrice?: number; // Optional: Gas price in gwei (defaults to network suggestion)
  walletId?: string; // Optional: specific wallet to use for the trade
  walletIds?: string[]; // Optional: multi-wallet selection
  useMultipleWallets?: boolean; // Optional: flag to enable multi-wallet mode
};

export type MonadSellParams = {
  tokenAddress: string; // ERC-20 token address
  launchpad: 'nadfun' | 'flapsh-simple' | 'flapsh-devs'; // Launchpad identifier
  tokenAmount?: string; // Optional: Exact token amount to sell (mutually exclusive with percentage)
  percentage?: number; // Optional: Percentage of balance to sell (1-100, mutually exclusive with tokenAmount)
  slippage?: number; // Optional: Slippage percentage
  gasPrice?: number; // Optional: Gas price in gwei (defaults to network suggestion)
  priceUsd?: number; // Optional: Current token price in USD (for accurate trade history recording)
  walletId?: string; // Optional: specific wallet to use for the trade
  walletIds?: string[]; // Optional: multi-wallet selection
  useMultipleWallets?: boolean; // Optional: flag to enable multi-wallet mode
};

export const tradeMonadBuy = (params: MonadBuyParams, authToken: string) =>
  apiFetch<{
    success: boolean;
    txHash: string;
    blockNumber: number;
    launchpad: string;
    tokenAddress: string;
    amountMON: number;
  }>("/api/trade/monad/buy", {
    method: "POST",
    body: params,
    authToken,
  });

export const tradeMonadSell = (params: MonadSellParams, authToken: string) =>
  apiFetch<{
    success: boolean;
    txHash: string;
    blockNumber: number;
    launchpad: string;
    tokenAddress: string;
  }>("/api/trade/monad/sell", {
    method: "POST",
    body: params,
    authToken,
  });

/* -------------------------------------------------------------------------- */
/*                       Pre-check Trade Balance Endpoints                     */
/* -------------------------------------------------------------------------- */

export interface PreCheckBalanceResult {
  valid: boolean;
  error?: string;
  code?: string;
  message?: string;
  balance?: number;
  totalRequired?: number;
  remaining?: number;
  details?: {
    currentBalance: number;
    tradeAmount: number;
    priorityFee?: number;
    bribe?: number;
    gasCost?: number;
    safetyBuffer: number;
    totalRequired: number;
    shortage: number;
  };
}

/**
 * Pre-check Solana trade balance BEFORE showing any toast
 * This prevents the misleading "Trade placed!" toast when balance is insufficient
 */
export const preCheckSolanaBalance = (
  params: { amount: number; priorityFee?: number; bribe?: number },
  authToken: string
) =>
  apiFetch<PreCheckBalanceResult>("/api/trade/precheck", {
    method: "POST",
    body: { ...params, chain: "sol" },
    authToken,
  });

/**
 * Pre-check Monad trade balance BEFORE showing any toast
 * This prevents the misleading "Trade placed!" toast when balance is insufficient
 */
export const preCheckMonadBalance = (
  params: { amount: number; gasPrice?: number },
  authToken: string
) =>
  apiFetch<PreCheckBalanceResult>("/api/trade/monad/precheck", {
    method: "POST",
    body: params,
    authToken,
  });

/* -------------------------------------------------------------------------- */
/*                       Token Analytics endpoints (Rust)                     */
/* -------------------------------------------------------------------------- */

const ANALYTICS_BASE_URL = process.env.NEXT_PUBLIC_ANALYTICS_URL || "http://localhost:4000";

export interface TokenMetrics {
  sniper_holding_percentage?: number;
  insider_holding_percentage?: number;
  bundle_holding_percentage?: number;
  dev_holding_percentage?: number;
  whale_holding_percentage?: number;
  small_holding_percentage?: number;
  total_holders_count?: number;
  holder_distribution?: {
    whales: number;
    sharks: number;
    fish: number;
    shrimps: number;
    holders?: Array<{
      wallet: string;
      amount: string;
      pct: number;
    }>;
  };
}

/**
 * Register a token with the analytics backend
 */
export const registerToken = async (params: {
  mint: string;
  symbol?: string;
  name?: string;
  pool?: string;
  dex?: string;
}) => {
  const res = await fetch(`${ANALYTICS_BASE_URL}/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to register token: ${error}`);
  }
  
  return res.json();
};

/**
 * Get a specific metric for a token
 */
export const getTokenMetric = async (
  mint: string,
  metricKey: string,
  refresh = false
) => {
  const url = `${ANALYTICS_BASE_URL}/metrics/${mint}/${metricKey}${refresh ? "?refresh=true" : ""}`;
  
  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  
  if (!res.ok) {
    if (res.status === 404) {
      return null;
    }
    const error = await res.text();
    throw new Error(`Failed to get metric: ${error}`);
  }
  
  return res.json();
};

/**
 * Get all metrics for a token
 */
export const getTokenMetrics = async (
  mint: string,
  refresh = false
): Promise<{ mint: string; metrics: TokenMetrics }> => {
  const url = `${ANALYTICS_BASE_URL}/tokens/${mint}/metrics${refresh ? "?refresh=true" : ""}`;
  
  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  
  if (!res.ok) {
    if (res.status === 404) {
      return { mint, metrics: {} };
    }
    const error = await res.text();
    throw new Error(`Failed to get metrics: ${error}`);
  }
  
  return res.json();
};

/**
 * Get holders list for a token
 */
export const getTokenHolders = async (
  mint: string,
  page = 1,
  pageSize = 50
) => {
  const url = `${ANALYTICS_BASE_URL}/tokens/${mint}/holders?page=${page}&page_size=${pageSize}`;
  
  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to get holders: ${error}`);
  }
  
  return res.json();
};

/* -------------------------------------------------------------------------- */
/*                         Polymarket Trading endpoints                        */
/* -------------------------------------------------------------------------- */

export interface PolymarketQuote {
  grossAmount: number;
  platformFee: number;
  platformFeeBps: number;
  netAmount: number;
  price: number | null;
  expectedTokens: number | null;
  potentialPayout: number | null;
  potentialProfit: number | null;
  potentialProfitPercent: number | null;
}

export interface PolymarketOrderResult {
  orderId?: string;
  transactionHashes?: string[];
  status?: string;
  takingAmount?: string;
  makingAmount?: string;
  feeDeducted?: number;
  netAmount?: number;
  tradeId?: number;
}

export interface PolymarketBalance {
  address: string;
  matic: number;
  maticFormatted: string;
  usdc: number;
  usdcFormatted: string;
  usdcBridged: number;    // USDC.e balance (used by Polymarket)
  usdcNative: number;     // Native USDC balance (needs conversion)
  hasGasBalance: boolean;
  hasTradingBalance: boolean;
  hasPolymarketBalance: boolean;  // Has USDC.e specifically
  autoConverted?: boolean;         // Was conversion done during this request?
  conversionTxHash?: string;       // Tx hash if converted
  conversionError?: string;        // Error message if conversion failed
}

export interface PolymarketGeoblock {
  allowed: boolean;
  blocked: boolean;
  ip: string;
  country: string;
  region: string;
}

export interface PolymarketFeeConfig {
  feeBps: number;
  feePercent: number;
  treasuryAddress?: string;
  minFeeUsd: number;
}

/**
 * Get Polymarket fee configuration
 */
export const getPolymarketFeeConfig = () =>
  apiFetch<{ success: boolean; data: PolymarketFeeConfig }>("/api/prediction/polymarket/fee-config", {
    method: "GET",
  });

/**
 * Check if user is geoblocked from Polymarket
 */
export const checkPolymarketGeoblock = () =>
  apiFetch<{ success: boolean; data: PolymarketGeoblock }>("/api/prediction/polymarket/geoblock", {
    method: "GET",
  });

/**
 * Get quote for a Polymarket trade
 */
export const getPolymarketQuote = (params: {
  tokenId: string;
  side: "BUY" | "SELL";
  amount: number;
  price?: number;
}) => {
  const qs = new URLSearchParams({
    token_id: params.tokenId,
    side: params.side,
    amount: String(params.amount),
  });
  if (params.price) qs.set("price", String(params.price));

  return apiFetch<{ success: boolean; data: PolymarketQuote }>(
    `/api/prediction/polymarket/quote?${qs.toString()}`,
    { method: "GET" }
  );
};

/**
 * Get user's Polygon wallet balance for Polymarket trading
 * @param authToken - User's bearer token
 * @param autoConvert - If true, automatically convert native USDC to USDC.e if needed
 */
export const getPolymarketBalance = (
  authToken: string,
  autoConvert: boolean = false
) =>
  apiFetch<{ success: boolean; data: PolymarketBalance }>(
    `/api/prediction/polymarket/balance${autoConvert ? '?autoConvert=true' : ''}`,
    {
      method: "GET",
      authToken,
    }
  );

/**
 * Manually trigger conversion of native USDC to USDC.e
 * @param authToken - User's bearer token
 * @param amount - Optional specific amount to convert (in USDC). If not provided, converts all.
 */
export interface AutoConvertResult {
  converted: boolean;
  txHash?: string;
  amountIn?: string;
  amountOut?: string;
  amountInFormatted?: string;
  amountOutFormatted?: string;
  balances?: PolymarketBalance;
}

export const autoConvertUsdcToUsdce = (
  authToken: string,
  amount?: number
) =>
  apiFetch<{ success: boolean; data: AutoConvertResult; responseTime?: number }>(
    "/api/prediction/polymarket/auto-convert",
    {
      method: "POST",
      body: amount !== undefined ? { amount } : {},
      authToken,
    }
  );

/**
 * Execute a Polymarket trade
 */
export const executePolymarketOrder = (
  params: {
    tokenId: string;
    side: "BUY" | "SELL";
    amountUSDC?: number;       // Required for BUY, optional for SELL
    amountTokens?: number;     // For SELL orders - exact tokens to sell
    price?: number;
    orderType?: "GTC" | "GTD" | "FOK" | "FAK";
    expiration?: number;
    walletId?: string;
    marketId?: string;
    marketTitle?: string;
    conditionId?: string;
  },
  authToken: string
) =>
  apiFetch<{ success: boolean; data: PolymarketOrderResult; responseTime?: number }>(
    "/api/prediction/polymarket/order",
    {
      method: "POST",
      body: params,
      authToken,
    }
  );

/**
 * Get user's actual outcome token balance from Polymarket (real on-chain balance)
 * Use this to validate SELL orders instead of relying on database positions
 */
export const getPolymarketTokenBalance = (
  tokenId: string,
  authToken: string,
  walletId?: string
) => {
  const qs = new URLSearchParams();
  qs.set("tokenId", tokenId);
  if (walletId) qs.set("walletId", walletId);
  return apiFetch<{ success: boolean; data: { balance: number; allowance: number } }>(
    `/api/prediction/polymarket/token-balance?${qs.toString()}`,
    {
      method: "GET",
      authToken,
    }
  );
};

/**
 * Check if a Polymarket market has been resolved
 */
export const getPolymarketMarketStatus = (conditionId: string) => {
  return apiFetch<{
    success: boolean;
    data: {
      conditionId: string;
      resolved: boolean;
      winningOutcome: "YES" | "NO" | null;
      payoutDenominator: string;
    };
  }>(`/api/prediction/polymarket/market-status?conditionId=${encodeURIComponent(conditionId)}`, {
    method: "GET",
  });
};

/**
 * Redeem winning tokens for USDC after a market has resolved
 */
export const redeemPolymarketWinnings = (
  conditionId: string,
  authToken: string,
  walletId?: string
) => {
  return apiFetch<{
    success: boolean;
    data: {
      redeemed: boolean;
      txHash: string;
      message: string;
      balances: {
        address: string;
        usdc: number;
        usdcFormatted: string;
      };
    };
  }>(`/api/prediction/polymarket/redeem`, {
    method: "POST",
    authToken,
    body: JSON.stringify({ conditionId, walletId }),
  });
};

/**
 * Cancel a specific Polymarket order
 */
export const cancelPolymarketOrder = (
  orderId: string,
  authToken: string,
  walletId?: string
) => {
  const qs = walletId ? `?walletId=${encodeURIComponent(walletId)}` : "";
  return apiFetch<{ success: boolean; data: { canceled: string[]; notCanceled: any } }>(
    `/api/prediction/polymarket/order/${orderId}${qs}`,
    {
      method: "DELETE",
      authToken,
    }
  );
};

/**
 * Cancel all Polymarket orders (optionally for a specific market)
 */
export const cancelAllPolymarketOrders = (
  authToken: string,
  conditionId?: string,
  walletId?: string
) => {
  const qs = new URLSearchParams();
  if (conditionId) qs.set("conditionId", conditionId);
  if (walletId) qs.set("walletId", walletId);
  const queryString = qs.toString() ? `?${qs.toString()}` : "";

  return apiFetch<{ success: boolean; data: { canceled: string[]; notCanceled: any; count: number } }>(
    `/api/prediction/polymarket/orders${queryString}`,
    {
      method: "DELETE",
      authToken,
    }
  );
};

/**
 * Get user's open orders on Polymarket
 */
export const getPolymarketOpenOrders = (
  authToken: string,
  marketId?: string,
  walletId?: string
) => {
  const qs = new URLSearchParams();
  if (marketId) qs.set("marketId", marketId);
  if (walletId) qs.set("walletId", walletId);
  const queryString = qs.toString() ? `?${qs.toString()}` : "";

  return apiFetch<{ success: boolean; data: any[]; count: number }>(
    `/api/prediction/polymarket/open-orders${queryString}`,
    {
      method: "GET",
      authToken,
    }
  );
};

/**
 * Approve Polymarket contracts to spend user's USDC
 * Required once before placing any orders
 */
export interface PolymarketApprovalResult {
  alreadyApproved: boolean;
  ctfExchangeTxHash?: string;
  negRiskExchangeTxHash?: string;
  message: string;
}

export const approvePolymarketSpending = (authToken: string) =>
  apiFetch<{ success: boolean; data: PolymarketApprovalResult; responseTime?: number }>(
    "/api/prediction/polymarket/approve",
    {
      method: "POST",
      authToken,
    }
  );

/**
 * Get user's current allowance status for Polymarket
 */
export interface PolymarketAllowance {
  balance: string;
  allowance: string;
}

export const getPolymarketAllowance = (authToken: string) =>
  apiFetch<{ success: boolean; data: PolymarketAllowance }>(
    "/api/prediction/polymarket/allowance",
    {
      method: "GET",
      authToken,
    }
  );

/* -------------------------------------------------------------------------- */
/*                     User Positions & Trades (Polymarket)                    */
/* -------------------------------------------------------------------------- */

/**
 * User's prediction position (from database)
 */
export interface PredictionPosition {
  id: number;
  source: string;           // 'dflow' | 'polymarket'
  marketId: string;
  ticker?: string;
  marketTitle?: string;
  side: string;             // 'YES' | 'NO'
  tokenAmount: number;
  avgEntryPrice: number;
  costBasis: number;
  currentValue?: number;
  unrealizedPnl?: number;
  tokenMint?: string;
  conditionId?: string;
  tokenId?: string;
  status: string;           // 'active' | 'closed' | 'settled'
  expiresAt?: string;
  resolution?: string;      // 'yes' | 'no' | 'pending' | null
  settlementAmount?: number;
  walletUsedId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * User's prediction trade history (from database)
 */
export interface PredictionTrade {
  id: number;
  source: string;           // 'dflow' | 'polymarket'
  marketId: string;
  ticker?: string;
  marketTitle?: string;
  tradeType: string;        // 'BUY' | 'SELL'
  side: string;             // 'YES' | 'NO'
  tokenAmount: number;
  pricePerToken: number;
  usdValue: number;
  fee?: number;
  transactionHash?: string;
  status: string;           // 'pending' | 'confirmed' | 'failed'
  expectedPrice?: number;
  executedPrice?: number;
  walletUsedId?: string;
  createdAt: string;
}

/**
 * Open order from Polymarket CLOB (live from exchange)
 */
export interface PolymarketOpenOrder {
  id: string;
  market: string;           // condition_id
  asset_id: string;         // token_id
  side: "BUY" | "SELL";
  price: string;
  original_size: string;
  size_matched: string;
  outcome: string;          // YES/NO
  owner: string;
  expiration: string;
  type: string;             // GTC, GTD, FOK, FAK
  created_at: string;
  associate_trades?: any[];
}

/**
 * Get user's prediction positions from database
 * @param authToken - User's bearer token
 * @param source - Optional filter by source ('dflow' | 'polymarket')
 * @param status - Optional filter by status ('active' | 'closed' | 'settled')
 */
export const getUserPredictionPositions = (
  authToken: string,
  source?: string,
  status?: string
) => {
  const qs = new URLSearchParams();
  if (source) qs.set("source", source);
  if (status) qs.set("status", status);
  const queryString = qs.toString() ? `?${qs.toString()}` : "";

  return apiFetch<{ success: boolean; data: PredictionPosition[]; count: number }>(
    `/api/prediction/positions${queryString}`,
    {
      method: "GET",
      authToken,
    }
  );
};

/**
 * Get user's prediction trade history from database
 * @param authToken - User's bearer token
 * @param source - Optional filter by source ('dflow' | 'polymarket')
 * @param limit - Number of trades to return (default 50)
 */
export const getUserPredictionTrades = (
  authToken: string,
  source?: string,
  limit?: number
) => {
  const qs = new URLSearchParams();
  if (source) qs.set("source", source);
  if (limit) qs.set("limit", String(limit));
  const queryString = qs.toString() ? `?${qs.toString()}` : "";

  return apiFetch<{ success: boolean; data: PredictionTrade[]; count: number }>(
    `/api/prediction/trades${queryString}`,
    {
      method: "GET",
      authToken,
    }
  );
};

/* -------------------------------------------------------------------------- */
/*                          Pool Resolution (Cached)                           */
/* -------------------------------------------------------------------------- */

export interface ResolvedPoolData {
  tokenAddress: string;
  poolAddress: string;
  poolType: string;       // Our format: "PumpAmm", "Meteora", "Raydium", etc.
  protocol: string;       // Raw protocol from source
  liquidity?: number;
  source: string;
  isGraduated?: boolean;
  cachedAt: number;
  responseTimeMs: number;
  cacheHit: boolean;
}

/**
 * Resolve pool for a token using the backend's Redis-cached pool service
 * This is much faster than calling DexScreener directly (cache hits < 10ms)
 *
 * @param tokenAddress - Token mint address
 * @param forceRefresh - Force fresh lookup, bypassing cache
 * @param poolTypeHint - Optional hint about expected pool type
 */
export const resolvePool = async (
  tokenAddress: string,
  forceRefresh: boolean = false,
  poolTypeHint?: string
): Promise<ResolvedPoolData | null> => {
  try {
    const params = new URLSearchParams({ tokenAddress });
    if (forceRefresh) params.append('forceRefresh', 'true');
    if (poolTypeHint) params.append('poolTypeHint', poolTypeHint);

    const response = await apiFetch<{ success: boolean; data?: ResolvedPoolData; error?: string }>(
      `/api/trade/resolve_pool?${params.toString()}`,
      { method: 'GET' }
    );

    if (response?.success && response?.data) {
      return response.data;
    }

    return null;
  } catch (error: any) {
    console.warn('[resolvePool] Error:', error?.message || error);
    return null;
  }
};

/**
 * Batch resolve pools for multiple tokens
 * Useful for pre-warming cache when loading portfolio
 *
 * @param tokenAddresses - Array of token mint addresses (max 50)
 */
export const batchResolvePools = async (
  tokenAddresses: string[]
): Promise<{
  resolved: ResolvedPoolData[];
  failed: string[];
}> => {
  try {
    const response = await apiFetch<{
      success: boolean;
      data?: {
        resolved: ResolvedPoolData[];
        failed: string[];
      };
      error?: string;
    }>('/api/trade/resolve_pools', {
      method: 'POST',
      body: { tokenAddresses },
    });

    if (response?.success && response?.data) {
      return response.data;
    }

    return { resolved: [], failed: tokenAddresses };
  } catch (error: any) {
    console.warn('[batchResolvePools] Error:', error?.message || error);
    return { resolved: [], failed: tokenAddresses };
  }
};

// ============================================================
// USERNAME FUNCTIONS
// ============================================================

export interface UsernameCheckResult {
  valid: boolean;
  available: boolean;
  error?: string;
}

export interface UsernameUpdateResult {
  success: boolean;
  username: string;
  referralCode: string;
  message: string;
}

/**
 * Check if a username is available
 * @param username - The username to check
 * @returns Object with valid and available flags
 */
export const checkUsernameAvailability = async (username: string): Promise<UsernameCheckResult> => {
  try {
    const response = await apiFetch<UsernameCheckResult>(
      `/api/users/check-username/${encodeURIComponent(username)}`
    );
    return response;
  } catch (error: any) {
    // API returns error for invalid usernames
    return {
      valid: false,
      available: false,
      error: error?.message || 'Failed to check username',
    };
  }
};

/**
 * Update the current user's username
 * @param authToken - Bearer token for authentication
 * @param username - The new username to set
 * @returns Object with success status and updated username
 */
export const updateUsername = async (
  authToken: string,
  username: string
): Promise<UsernameUpdateResult> => {
  const response = await apiFetch<UsernameUpdateResult>(
    '/api/users/set-username',
    {
      method: 'POST',
      authToken,
      body: { username },
    }
  );
  return response;
};

export { apiFetch };
