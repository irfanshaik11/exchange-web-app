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
      `${env.NEXT_PUBLIC_BACKEND_URL}${endpoint}`,
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
          'AMOUNT_TOO_SMALL', 'POOL_UNAVAILABLE', 'TX_FAILED', 'POOL_GRADUATED', 'METEORA_NO_LIQUIDITY', 'TURNKEY_NOT_SUPPORTED'
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

export const login = (email: string, password: string) =>
  apiFetch<{ token: string }>("/api/users/login", {
    method: "POST",
    body: { email, password },
  });

export const register = (email: string, name: string, password: string) =>
  apiFetch<{ user: any }>("/api/users/register", {
    method: "POST",
    body: { email, name, password },
  });

export const phantomLogin = (
  publicKey: string,
  signature: string,
  message: string,
) =>
  apiFetch<{ token: string }>("/api/users/phantom/login", {
    method: "POST",
    body: { publicKey, signature, message },
  });

export const metamaskLogin = (
  address: string,
  signature: string,
  message: string,
) => {

  return apiFetch<{ token: string }>("/api/users/metamask/login", {
    method: "POST",
    body: { address, signature, message },
  });
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

export const getWithdrawalFee = () =>
  apiFetch<{ fee: number; rentExemptMinimum: number; fallbackFee: number; minimumReserve: number }>("/api/users/withdrawal-fee", {
    method: "GET",
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
  });
};

export const completeAllQuests = (params: {
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

/* -------------------------------------------------------------------------- */
/*                               Trade endpoints                              */
/* -------------------------------------------------------------------------- */

export type BuyParams = {
  poolAddress?: string; // Optional - backend will discover if missing
  baseMint: string;
  quoteMint: string;
  amount: number;
  mevProtection?: 0 | 1;
  poolType?: "PumpAmm" | "Raydium CPMM" | "Raydium Launchpad" | "Pumpfun" | "launchLab" | "bonk" | "meteora dbc" | "meteora amm v1" | "meteora amm v2" | "Meteora" | "bags" | "MoonShoot" | "Orca" | ""; // Optional - backend will detect if missing
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
};

export const tradeBuy = (params: BuyParams, authToken: string) => {
  console.log("🚀 tradeBuy called with params:", params);
  console.log("🔗 Backend URL:", env.NEXT_PUBLIC_BACKEND_URL);
  console.log("🎯 Full URL:", `${env.NEXT_PUBLIC_BACKEND_URL}/api/trade/buy`);
  
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

export { apiFetch };

