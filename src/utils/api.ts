// Centralized API client for backend calls related to authentication and trading
import { env } from '../env';

interface RequestOptions extends RequestInit {
  /** JSON body that will be automatically stringified */
  body?: any;
  /** Bearer token for authenticated endpoints */
  authToken?: string;
}

/**
 * Low-level helper that wraps `fetch` with sane defaults:
 *  – Prepends `NEXT_PUBLIC_BACKEND_URL`
 *  – Sets `Content-Type: application/json`
 *  – Adds `Authorization` header when `authToken` provided
 *  – Parses JSON response and throws for non-2xx statuses
 */
async function apiFetch<T = unknown>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { authToken, body, headers, ...rest } = options;

  const res = await fetch(`${env.NEXT_PUBLIC_BACKEND_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(headers || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    ...rest,
  });

  // Attempt to parse JSON – if this fails, we still throw for non-OK statuses
  const data = await res.json().catch(() => undefined);

  if (!res.ok) {
    const message = (data as any)?.message || (data as any)?.error || res.statusText;
    throw new Error(message);
  }

  return data as T;
}

/* -------------------------------------------------------------------------- */
/*                               Auth endpoints                               */
/* -------------------------------------------------------------------------- */

export const getUserById = (token: string) =>
  apiFetch<{ user: any }>('/api/users/get_user_by_id', {
    authToken: token,
    method: 'GET',
  });

export const login = (email: string, password: string) =>
  apiFetch<{ token: string }>('/api/users/login', {
    method: 'POST',
    body: { email, password },
  });

export const register = (email: string, name: string, password: string) =>
  apiFetch<{ user: any }>('/api/users/register', {
    method: 'POST',
    body: { email, name, password },
  });

export const phantomLogin = (publicKey: string, signature: string, message: string) =>
  apiFetch<{ token: string }>('/api/users/phantom/login', {
    method: 'POST',
    body: { publicKey, signature, message },
  });

/** Returns the Google OAuth redirect URL (client will navigate to it) */
export const googleAuthUrl = `${env.NEXT_PUBLIC_BACKEND_URL}/api/users/auth/google`;

/* -------------------------------------------------------------------------- */
/*                               Trade endpoints                              */
/* -------------------------------------------------------------------------- */

type BuyParams = {
  tokenAddress: string;
  amount: number;
  mevProtection: number;
  solPrice: number;
  marketCap: number;
  tokenPrice: number;
};

export const tradeBuy = (params: BuyParams, authToken: string) =>
  apiFetch<{ amount: number; hash: string }>('/api/trade/buy', {
    method: 'POST',
    body: params,
    authToken,
  });

type SellPercentageParams = {
  tokenAddress: string;
  percentageToSell: number;
  solPrice: number;
  marketCap: number;
  tokenPrice: number;
};

export const tradeSellPercentage = (params: SellPercentageParams, authToken: string) =>
  apiFetch<{ message?: string; hash?: string }>('/api/trade/sell_percentage', {
    method: 'POST',
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
  apiFetch('/api/trade/sell_exactAmount', {
    method: 'POST',
    body: params,
  });

export { apiFetch }; 