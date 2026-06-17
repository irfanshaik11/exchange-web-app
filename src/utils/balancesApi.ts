// src/utils/balancesApi.ts
// Per-chain token balances for the signed-in user (wraps GET /api/bridge/balances).
import { apiFetch } from "./api";

export interface TokenBalancesResponse {
  success: boolean;
  data?: {
    balances: Record<string, Record<string, number>>; // { USDC: { solana, base } }
    failedChains: string[];
  };
  error?: string;
}

export const getBalances = (authToken: string, walletId?: string) =>
  apiFetch<TokenBalancesResponse>(
    `/api/bridge/balances${walletId ? `?walletId=${encodeURIComponent(walletId)}` : ""}`,
    { method: "GET", authToken },
  );
