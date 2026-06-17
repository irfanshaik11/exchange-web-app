/**
 * bridgeApi.ts
 *
 * Cross-chain "Convert" (Relay bridge) backend calls. Thin wrappers over the
 * shared `apiFetch` (same pattern as the service fns in api.ts / tradeApi.ts).
 *
 * Backend:
 *   GET  /api/bridge/options            (public)
 *   POST /api/bridge/quote              (auth)
 *   POST /api/bridge/execute            (auth)
 *   GET  /api/bridge/status/:requestId
 */

import { apiFetch } from "./api";

export interface BridgeChainOption {
  key: string;
  vm: "svm" | "evm";
  displayName: string;
  relayChainId: number;
}

export interface BridgeTokenOption {
  symbol: string;
  chains: string[];
}

export interface BridgeOptions {
  chains: BridgeChainOption[];
  tokens: BridgeTokenOption[];
}

export interface BridgeQuoteParams {
  fromChain: string;
  toChain: string;
  token?: string;
  /** amount in the input token's smallest units (e.g. USDC has 6 decimals) */
  amount: string;
  walletId?: string | null;
}

export interface BridgeCurrencyInfo {
  chainId: number;
  address: string;
  symbol: string;
  decimals: number;
}

export interface BridgeAmount {
  amount: string;
  amountFormatted?: string;
  amountUsd?: string;
  minimumAmount?: string;
  currency?: BridgeCurrencyInfo;
}

export interface BridgeQuoteResult {
  requestId?: string;
  currencyIn?: BridgeAmount;
  currencyOut?: BridgeAmount;
  timeEstimate?: number;
  fees?: Record<string, unknown>;
}

export interface BridgeExecuteResult {
  requestId: string;
  txHashes: string[];
  status: string;
}

export interface BridgeStatusResult {
  status: string;
  details?: string;
  inTxHashes?: string[];
  txHashes?: string[];
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  detail?: string;
}

/** GET /api/bridge/options — enabled chain×token matrix (public). */
export const getBridgeOptions = () =>
  apiFetch<ApiEnvelope<BridgeOptions>>("/api/bridge/options", {
    method: "GET",
  });

/** POST /api/bridge/quote — price a convert without executing. */
export const getBridgeQuote = (params: BridgeQuoteParams, authToken: string) =>
  apiFetch<ApiEnvelope<BridgeQuoteResult>>("/api/bridge/quote", {
    method: "POST",
    body: params,
    authToken,
  });

/** POST /api/bridge/execute — sign + submit; backend polls + pushes WS updates. */
export const executeBridge = (params: BridgeQuoteParams, authToken: string) =>
  apiFetch<ApiEnvelope<BridgeExecuteResult>>("/api/bridge/execute", {
    method: "POST",
    body: params,
    authToken,
  });

/** GET /api/bridge/status/:requestId — current intent status. */
export const getBridgeStatus = (requestId: string) =>
  apiFetch<ApiEnvelope<BridgeStatusResult>>(
    `/api/bridge/status/${encodeURIComponent(requestId)}`,
    { method: "GET" },
  );
