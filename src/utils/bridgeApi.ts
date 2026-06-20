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
  /**
   * Whether this chain can be used as a Convert *origin* (the "From" side).
   * Destination-only chains (BNB / Monad / HyperEVM) return `false`. Absent in
   * legacy responses, in which case it defaults to `true` (every chain a valid
   * origin) — see `canBeOrigin()` below.
   */
  canBeOrigin?: boolean;
}

/**
 * Treat a chain as a valid Convert origin unless the backend explicitly marks
 * it destination-only (`canBeOrigin: false`). Absent → true (legacy-safe).
 */
export const canBeOrigin = (chain: BridgeChainOption): boolean =>
  chain.canBeOrigin !== false;

/**
 * Per-chain token config from the options matrix. The backend now returns each
 * entry in `tokens[].chains` as an OBJECT (was a bare chain-key string), so the
 * same symbol can declare different decimals per chain — critically, USDC is
 * 6 decimals on most chains but 18 on BNB Chain.
 */
export interface BridgeTokenChainConfig {
  key: string;
  decimals: number;
  supportsPermit: boolean;
}

export interface BridgeTokenOption {
  symbol: string;
  /** Per-chain config; legacy responses may still send bare `string[]`. */
  chains: (BridgeTokenChainConfig | string)[];
}

export interface BridgeOptions {
  chains: BridgeChainOption[];
  tokens: BridgeTokenOption[];
}

/** Default token decimals when the options matrix doesn't specify them. */
export const DEFAULT_TOKEN_DECIMALS = 6;

/** Narrow a (new object | legacy string) chain entry to its key. */
const chainConfigKey = (c: BridgeTokenChainConfig | string): string =>
  typeof c === "string" ? c : c.key;

/**
 * Look up the smallest-unit decimals for a (token symbol, chain key) pair from
 * the options matrix. Backward-safe: returns DEFAULT_TOKEN_DECIMALS (6) when the
 * matrix is missing, the token/chain isn't found, or a legacy string entry has
 * no decimals to report.
 */
export const getTokenDecimals = (
  options: BridgeOptions | null | undefined,
  tokenSymbol: string,
  chainKey: string,
): number => {
  const token = options?.tokens?.find((t) => t.symbol === tokenSymbol);
  if (!token) return DEFAULT_TOKEN_DECIMALS;
  const chain = token.chains.find((c) => chainConfigKey(c) === chainKey);
  if (!chain || typeof chain === "string") return DEFAULT_TOKEN_DECIMALS;
  return Number.isFinite(chain.decimals)
    ? chain.decimals
    : DEFAULT_TOKEN_DECIMALS;
};

/**
 * Whether a (token symbol, chain key) supports gasless permit-based transfers,
 * per the options matrix. Permit chains (Base / Ethereum for USDC) let the user
 * convert WITHOUT holding native gas — the signature authorises the pull. Non-
 * permit EVM origins (BNB / Monad / HyperEVM) and SVM (Solana) require the user
 * to pay their own native network fee. Returns `undefined` when the matrix is
 * missing or the (token, chain) pair carries no permit flag (legacy string
 * entry) so callers can fall back to a known chain-key set.
 */
export const getTokenSupportsPermit = (
  options: BridgeOptions | null | undefined,
  tokenSymbol: string,
  chainKey: string,
): boolean | undefined => {
  const token = options?.tokens?.find((t) => t.symbol === tokenSymbol);
  if (!token) return undefined;
  const chain = token.chains.find((c) => chainConfigKey(c) === chainKey);
  if (!chain || typeof chain === "string") return undefined;
  return chain.supportsPermit;
};

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

/**
 * Per-quote fee breakdown. `sponsored: true` means Relay is ACTUALLY covering
 * the destination fee (our App Balance is funded), so the user receives the full
 * input amount. `sponsored: false` (today's reality, until funded) means the fee
 * is still netted from the amount. Absent in legacy responses.
 */
export interface BridgeFeeBreakdown {
  destinationFeeUsd: number;
  originGasUsd: number;
  subsidizedUsd: number;
  sponsored: boolean;
  /**
   * True when OUR fee-payer wallet is covering the Solana-origin gas, so the
   * user does NOT need any native SOL of their own to convert. False/absent →
   * the user pays the Solana network fee from their own wallet (legacy-safe).
   */
  originGasSponsored: boolean;
}

export interface BridgeQuoteResult {
  requestId?: string;
  currencyIn?: BridgeAmount;
  currencyOut?: BridgeAmount;
  timeEstimate?: number;
  fees?: Record<string, unknown>;
  feeBreakdown?: BridgeFeeBreakdown;
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
