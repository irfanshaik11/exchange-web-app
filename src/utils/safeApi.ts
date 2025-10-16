/**
 * Safe API wrapper that never throws errors
 * Returns { success: boolean, data?: T, error?: ApiError }
 * This prevents Next.js error overlay from showing in development
 */

import { tradeBuy, ApiError } from './api';
import type { BuyParams } from './api';

export type SafeApiResult<T> = 
  | { success: true; data: T; error?: never }
  | { success: false; data?: never; error: ApiError | Error };

/**
 * Safe version of tradeBuy that never throws
 */
export async function safeTradeBuy(
  params: any,
  authToken: string
): Promise<SafeApiResult<any>> {
  try {
    const data = await tradeBuy(params, authToken);
    return { success: true, data };
  } catch (error: any) {
    // Never throw - return error as data
    console.error('[SafeAPI] Trade error:', error);
    return { success: false, error };
  }
}

/**
 * Execute an API call safely without throwing
 */
export async function safeApiCall<T>(
  apiCall: () => Promise<T>
): Promise<SafeApiResult<T>> {
  try {
    const data = await apiCall();
    return { success: true, data };
  } catch (error: any) {
    console.error('[SafeAPI] Error:', error);
    return { success: false, error };
  }
}

