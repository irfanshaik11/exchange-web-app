const isDev = process.env.NODE_ENV !== "production";

import type { TradeRow } from "~/utils/functions";

// Wallet tracking API utilities - Integrates with wallet-tracker-backend

// ===== Backend Data Types =====
export interface WatchWallet {
  id: string;
  ownerId: string | null;
  address: string;
  walletName: string | null;
  emoji: string | null;
  chain: "sol" | "monad";
  notificationsEnabled: boolean;
  createdAt: string;
}

export interface WalletEvent {
  id: string;
  ts: string;
  wallet: string;
  mint: string;
  amount: string;
  side: "buy" | "sell";
  solSpent: string | null;
  usdcSpent: string | null;
  txSig: string;
  venue: string | null;
  symbol: string | null;
  name: string | null;
  priceUsd: string | null;
  marketCapUsd: string | null;
}

export interface WalletBalance {
  wallet: string;
  mint: string;
  amount: string;
  asof: string;
}

// ===== WebSocket Event Types =====
export interface TradeEvent {
  type: "trade";
  wallet: string;
  mint: string;
  pair_address?: string; // Optional: preferred for navigation
  symbol: string | null;
  name: string | null;
  side: "buy" | "sell";
  amount: number;
  sol_spent: number | null;
  price_usd: number | null;
  market_cap_usd: number | null;
  venue: string | null;
  tx: string;
  at: number;
}

export interface WalletLastActiveResult {
  wallet: string;
  lastActive: number | null;
  ok: boolean;
  error?: string;
}

// ===== Frontend Display Types =====
export interface TrackedWallet {
  address: string;
  name: string | null;
  createdAt: string;
  events: WalletEvent[];
  latestEvent?: TradeEvent;
}

// Normalize API URL: if it's https to a raw IP, downgrade to http to avoid TLS issues in browsers
const resolveApiUrl = () => {
  const envUrl = process.env.NEXT_PUBLIC_WALLET_TRACKER_URL;
  if (!envUrl) return ""; // Optional: return empty string if not configured
  try {
    const u = new URL(envUrl);
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname);
    if (u.protocol === "https:" && isIp) {
      return `http://${u.host}`;
    }
    return envUrl;
  } catch {
    return envUrl;
  }
};

export const WALLET_TRACKER_API_URL = resolveApiUrl();

// Normalize WS URL: allow users to provide http(s) and convert to ws(s) automatically
const resolveWsUrl = () => {
  const envWs = process.env.NEXT_PUBLIC_WALLET_TRACKER_WS_URL;
  if (!envWs) return ""; // Optional: return empty string if not configured
  if (envWs.startsWith("http://")) return envWs.replace(/^http:\/\//, "ws://");
  if (envWs.startsWith("https://"))
    return envWs.replace(/^https:\/\//, "wss://");
  return envWs;
};

const WALLET_TRACKER_WS_URL = resolveWsUrl();

// ===== API Functions =====

/** Thrown when the wallet-tracker API rejects the bearer token (401/403). The
 *  caller (context) should react by surfacing a re-auth prompt instead of
 *  silently rendering an empty watchlist. Transient/network errors are not
 *  raised — they still fall back to []. */
export class WalletTrackerAuthError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    // Preserve prototype chain so `instanceof WalletTrackerAuthError`
    // works across module/bundle boundaries even when downleveled.
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "WalletTrackerAuthError";
    this.status = status;
  }
}

// Get all tracked wallets
export async function getTrackedWallets(
  authToken?: string,
  userId?: string,
  chain?: "sol" | "monad",
): Promise<WatchWallet[]> {
  try {
    const params = new URLSearchParams();
    if (userId) {
      params.append("userId", userId);
    }
    if (chain) {
      params.append("chain", chain);
    }

    const url = `${WALLET_TRACKER_API_URL}/api/watch${params.toString() ? `?${params.toString()}` : ""}`;

    // Add 10 second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const headers: HeadersInit = {};
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      const response = await fetch(url, {
        signal: controller.signal,
        headers,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const ct = response.headers.get("content-type") || "";
        const body = ct.includes("application/json")
          ? await response.json().catch(() => ({}))
          : await response.text().catch(() => "");
        const msg =
          typeof body === "object" && body && (body as any).error
            ? (body as any).error
            : typeof body === "string" && body.trim().startsWith("<")
              ? `HTTP ${response.status} ${response.statusText}`
              : typeof body === "string"
                ? body
                : "Failed to fetch wallets";
        if (response.status === 401 || response.status === 403) {
          throw new WalletTrackerAuthError(
            response.status,
            msg || "Authentication required",
          );
        }
        throw new Error(msg || "Failed to fetch wallets");
      }

      return await response.json();
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === "AbortError") {
        throw new Error("Request timed out after 10 seconds");
      }
      throw fetchError;
    }
  } catch (error: any) {
    // Auth failures must surface so the UI can prompt re-login — otherwise
    // an empty watchlist silently produces a "WS connected, no trades" state.
    if (error instanceof WalletTrackerAuthError) {
      throw error;
    }
    // Transient errors (network, missing service, abort) keep the original
    // soft-fail behavior so we don't crash the page during logout.
    const message = error?.message || "Failed to fetch wallets";
    console.warn("Error fetching tracked wallets:", message);
    return [];
  }
}

// Add a wallet to tracking
export async function addTrackedWallet(
  address: string,
  name?: string,
  userId?: string,
  emoji?: string,
  notificationsEnabled: boolean = true,
  chain: "sol" | "monad" = "sol",
  authToken?: string,
): Promise<void> {
  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${WALLET_TRACKER_API_URL}/api/watch`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        wallet: address,
        walletName: name || undefined,
        userId: userId || undefined,
        emoji: emoji || undefined,
        chain: chain || "sol",
        // Note: notificationsEnabled is set via a separate API call below
      }),
    });

    if (!response.ok) {
      const ct = response.headers.get("content-type") || "";
      const body = ct.includes("application/json")
        ? await response.json().catch(() => ({}))
        : await response.text().catch(() => "");
      const msg =
        typeof body === "object" && body && (body as any).error
          ? (body as any).error
          : typeof body === "string" && body.trim().startsWith("<")
            ? `HTTP ${response.status} ${response.statusText}`
            : typeof body === "string"
              ? body
              : "Failed to add wallet";
      throw new Error(msg || "Failed to add wallet");
    }

    // Enable notifications if requested (separate API call)
    if (notificationsEnabled) {
      try {
        await toggleWalletNotifications(
          address,
          true,
          userId,
          chain,
          authToken,
        );
      } catch (notifError) {
        console.warn(
          "Failed to enable notifications for wallet, but wallet was added successfully:",
          notifError,
        );
        // Don't throw - wallet was added successfully, notification toggle can be done manually
      }
    }
  } catch (error) {
    console.error("Error adding wallet:", error);
    throw error;
  }
}

export interface BulkWalletInsertResponse {
  ok: boolean;
  inserted: string[];
  insertedCount: number;
  skippedExisting: string[];
  skippedDuplicateInput: string[];
  skippedByLimit: string[];
  totalRequested: number;
  error?: string;
}

type BulkWalletEntry = {
  wallet: string;
  walletName?: string | null;
  emoji?: string | null;
};

export async function addTrackedWalletsBulk(
  wallets: BulkWalletEntry[],
  userId?: string | number,
  chain?: "sol" | "monad",
  authToken?: string,
): Promise<BulkWalletInsertResponse> {
  if (!wallets || wallets.length === 0) {
    return {
      ok: true,
      inserted: [],
      insertedCount: 0,
      skippedExisting: [],
      skippedDuplicateInput: [],
      skippedByLimit: [],
      totalRequested: 0,
    };
  }

  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${WALLET_TRACKER_API_URL}/api/watch/bulk`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        wallets,
        ...(userId ? { userId } : {}),
        ...(chain ? { chain } : { chain: "sol" }),
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error || "Failed to add wallets in bulk");
    }

    return payload as BulkWalletInsertResponse;
  } catch (error) {
    console.error("Error adding wallets in bulk:", error);
    throw error;
  }
}

export async function getWalletsLastActive(
  wallets: string[],
  chain: "sol" | "monad" = "sol",
): Promise<WalletLastActiveResult[]> {
  try {
    if (!Array.isArray(wallets) || wallets.length === 0) {
      return [];
    }

    // 120s timeout — backend processes 151 wallets in batches with delays + 429 retries
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    const response = await fetch(
      `${WALLET_TRACKER_API_URL}/api/wallets/last-active`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallets, chain }),
        signal: controller.signal,
      },
    );
    clearTimeout(timeout);

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        payload?.error ||
        (response.statusText
          ? `HTTP ${response.status} ${response.statusText}`
          : "Failed to fetch last active wallets");
      throw new Error(message);
    }

    if (
      !payload ||
      typeof payload !== "object" ||
      payload.ok !== true ||
      !Array.isArray(payload.data)
    ) {
      throw new Error("Unexpected response while fetching last active wallets");
    }

    return payload.data as WalletLastActiveResult[];
  } catch (error) {
    console.error("Error fetching wallets last active timestamp:", error);
    throw error;
  }
}

// Remove a wallet from tracking
export async function removeTrackedWallet(
  address: string,
  userId?: string,
  chain?: "sol" | "monad",
  authToken?: string,
): Promise<void> {
  try {
    const params = new URLSearchParams();
    if (userId) {
      params.append("userId", userId);
    }
    if (chain) {
      params.append("chain", chain);
    }

    const url = `${WALLET_TRACKER_API_URL}/api/watch/${encodeURIComponent(address)}${params.toString() ? `?${params.toString()}` : ""}`;
    const headers: HeadersInit = {};
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }
    const response = await fetch(url, {
      method: "DELETE",
      headers,
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      const msg =
        typeof body === "object" && body && (body as any).error
          ? (body as any).error
          : `HTTP ${response.status} ${response.statusText}`;
      throw new Error(msg || "Failed to remove wallet");
    }

    // Verify that a wallet was actually deleted
    if (body.deleted === 0 || (body.ok && body.deleted === 0)) {
      throw new Error("Wallet not found in watchlist");
    }
  } catch (error) {
    console.error("Error removing wallet:", error);
    throw error;
  }
}

// One-shot bulk remove. Replaces the per-wallet `Promise.all(map(removeTrackedWallet))`
// "Remove All" pattern that issued N parallel DELETEs (150 round-trips for the
// default-150-wallets case). Pass `all: true` to wipe every tracked wallet for
// the chain, or `addresses` for a targeted subset.
export async function removeTrackedWalletsBulk(
  args: { chain?: "sol" | "monad"; all?: boolean; addresses?: string[] },
  authToken?: string,
): Promise<{ deleted: number }> {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  const response = await fetch(
    `${WALLET_TRACKER_API_URL}/api/watch/bulk-delete`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        chain: args.chain ?? "sol",
        ...(args.all ? { all: true } : { addresses: args.addresses ?? [] }),
      }),
    },
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok || (body as any)?.ok === false) {
    throw new Error((body as any)?.error || "Failed to bulk-remove wallets");
  }
  return { deleted: Number((body as any)?.deleted ?? 0) };
}

// Get wallet event history
export async function getWalletHistory(
  address: string,
  limit: number = 50,
): Promise<WalletEvent[]> {
  try {
    const response = await fetch(
      `${WALLET_TRACKER_API_URL}/api/history?wallet=${encodeURIComponent(address)}&limit=${limit}`,
    );
    if (!response.ok) throw new Error("Failed to fetch wallet history");
    return await response.json();
  } catch (error) {
    console.error("Error fetching wallet history:", error);
    return [];
  }
}

// Get wallet balance snapshots
export async function getWalletSnapshots(
  address: string,
): Promise<WalletBalance[]> {
  try {
    const response = await fetch(
      `${WALLET_TRACKER_API_URL}/api/snapshot?wallet=${encodeURIComponent(address)}`,
    );
    if (!response.ok) throw new Error("Failed to fetch wallet snapshots");
    return await response.json();
  } catch (error) {
    console.error("Error fetching wallet snapshots:", error);
    return [];
  }
}

// Toggle notifications for a wallet
// SECURITY FIX: Now requires authentication token - userId parameter is ignored by backend
export async function toggleWalletNotifications(
  address: string,
  enabled: boolean,
  userId?: string,
  chain?: "sol" | "monad",
  authToken?: string,
): Promise<void> {
  try {
    const params = new URLSearchParams();
    if (userId) {
      params.append("userId", userId);
    }
    if (chain) {
      params.append("chain", chain);
    }

    const url = `${WALLET_TRACKER_API_URL}/api/watch/${encodeURIComponent(address)}/notifications${params.toString() ? `?${params.toString()}` : ""}`;

    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    const response = await fetch(url, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ enabled }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to toggle notifications");
    }
  } catch (error) {
    console.error("Error toggling notifications:", error);
    throw error;
  }
}

// Normalize balance from various API response shapes (wallet tracker or local get-sol-bal)
function parseBalanceFromResponse(data: any): number | null {
  if (data == null) return null;
  let raw: number | null = null;
  if (typeof data.balance === "number") raw = data.balance;
  else if (data.data != null && typeof data.data.balance === "number")
    raw = data.data.balance;
  else if (typeof data.balance === "string") raw = Number(data.balance);
  else if (data.data?.balance != null) raw = Number(data.data.balance);
  if (raw !== null && Number.isFinite(raw)) return raw;
  return null;
}

// Get balance for a wallet (supports both SOL and MONAD via backend to keep RPC key secure)
export async function getWalletBalance(
  address: string,
  chain: "sol" | "monad" = "sol",
): Promise<number | null> {
  try {
    if (WALLET_TRACKER_API_URL) {
      const url = `${WALLET_TRACKER_API_URL}/api/wallet-balance/${encodeURIComponent(address)}?chain=${chain}`;
      isDev &&
        console.log(
          `[getWalletBalance] Fetching ${chain} balance for ${address.slice(0, 8)}... from ${url}`,
        );
      const response = await fetch(url);

      if (response.ok) {
        const data = await response.json();
        isDev &&
          console.log(
            `[getWalletBalance] Response for ${chain} wallet ${address.slice(0, 8)}...:`,
            data,
          );
        const balance = parseBalanceFromResponse(data);
        if (balance !== null) {
          isDev &&
            console.log(
              `[getWalletBalance] Successfully got ${chain} balance: ${balance}`,
            );
          return balance;
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.warn(
          `[getWalletBalance] API error for ${chain} wallet ${address.slice(0, 8)}...:`,
          response.status,
          errorData,
        );
      }
    }

    // Fallback for Solana: use app's own API (RPC) when wallet tracker is missing or failed
    if (chain === "sol") {
      try {
        const base =
          typeof window !== "undefined"
            ? ""
            : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const fallbackUrl = `${base}/api/get-sol-bal?address=${encodeURIComponent(address)}&chain=sol`;
        const fallbackRes = await fetch(fallbackUrl);
        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          const balance = parseBalanceFromResponse(data);
          if (balance !== null) {
            isDev &&
              console.log(
                `[getWalletBalance] Got SOL balance via fallback: ${balance}`,
              );
            return balance;
          }
        }
      } catch (fallbackError) {
        console.warn(
          `[getWalletBalance] Solana fallback failed for ${address.slice(0, 8)}...:`,
          fallbackError,
        );
      }
    }

    return null;
  } catch (error) {
    console.error(
      `[getWalletBalance] Error fetching ${chain} balance for ${address.slice(0, 8)}...:`,
      error,
    );
    return null;
  }
}

// Legacy function name for backward compatibility
export async function getWalletSolBalance(
  address: string,
): Promise<number | null> {
  return getWalletBalance(address, "sol");
}

// Transaction interface for wallet activity
export interface WalletTransaction {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: any;
  memo: string | null;
}

// Get recent transactions for a wallet (via backend using Helius)
export async function getWalletTransactions(
  address: string,
  limit: number = 10,
): Promise<WalletTransaction[]> {
  try {
    const response = await fetch(
      `${WALLET_TRACKER_API_URL}/api/wallet-transactions/${encodeURIComponent(address)}?limit=${limit}`,
    );

    if (!response.ok) {
      throw new Error("Failed to fetch wallet transactions");
    }

    const data = await response.json();

    if (data.ok && Array.isArray(data.transactions)) {
      return data.transactions;
    }

    return [];
  } catch (error) {
    console.error("Error fetching wallet transactions:", error);
    return [];
  }
}

// ===== Trade History Helpers =====

const parseNumeric = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeTradeHistoryRecord = (record: any): TradeEvent | null => {
  if (!record || typeof record !== "object") return null;

  const wallet = record.wallet ?? record.owner ?? record.address;
  const mint = record.mint ?? record.token ?? record.mint_address;
  const tx =
    record.tx ??
    record.txSig ??
    record.signature ??
    record.transaction ??
    record.transaction_id ??
    record.id;

  if (
    typeof wallet !== "string" ||
    typeof mint !== "string" ||
    typeof tx !== "string"
  ) {
    return null;
  }

  const sideValue = (record.side ?? record.action ?? "")
    .toString()
    .toLowerCase();
  const side: "buy" | "sell" = sideValue === "sell" ? "sell" : "buy";

  const amount =
    parseNumeric(
      record.amount ?? record.size ?? record.quantity ?? record.tokenAmount,
    ) ?? 0;
  const solSpent = parseNumeric(record.sol_spent ?? record.solSpent);
  const priceUsd = parseNumeric(record.price_usd ?? record.priceUsd);
  const marketCapUsd = parseNumeric(
    record.market_cap_usd ?? record.marketCapUsd,
  );

  const rawTimestamp =
    record.at ??
    record.ts ??
    record.timestamp ??
    record.blockTime ??
    record.time ??
    null;
  let timestamp = parseNumeric(rawTimestamp);
  if (timestamp === null && typeof rawTimestamp === "string") {
    const parsed = Date.parse(rawTimestamp);
    timestamp = Number.isFinite(parsed) ? parsed : null;
  }

  if (timestamp === null) {
    return null;
  }

  const timestampMs =
    timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;

  return {
    type: "trade",
    wallet,
    mint,
    pair_address:
      record.pair_address ?? record.pairAddress ?? record.poolId ?? undefined,
    symbol: record.symbol ?? record.tokenSymbol ?? record.ticker ?? null,
    name: record.name ?? record.tokenName ?? record.project ?? null,
    side,
    amount,
    sol_spent: solSpent,
    price_usd: priceUsd,
    market_cap_usd: marketCapUsd,
    venue: record.venue ?? record.market ?? record.source ?? null,
    tx,
    at: timestampMs,
  };
};

interface TradeHistoryOptions {
  limit?: number;
  windowMs?: number;
  signal?: AbortSignal;
}

export async function getWalletTradeHistory(
  wallets: string[],
  options: TradeHistoryOptions = {},
): Promise<TradeEvent[]> {
  if (!Array.isArray(wallets) || wallets.length === 0) {
    return [];
  }

  try {
    const validWallets = wallets.filter(
      (wallet): wallet is string =>
        typeof wallet === "string" && wallet.trim().length > 0,
    );

    console.debug("Fetching wallet trade history", {
      walletCount: validWallets.length,
      limit: options.limit,
      windowMs: options.windowMs,
    });

    let response: Response;

    if (validWallets.length > 20) {
      // POST to avoid URL length limits with many wallets
      const body: Record<string, unknown> = { wallets: validWallets };
      if (options.limit !== undefined) body.limit = options.limit;
      if (options.windowMs !== undefined) body.windowMs = options.windowMs;

      response = await fetch(`${WALLET_TRACKER_API_URL}/api/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: options.signal,
      });
    } else {
      // GET for small wallet counts (backward compat)
      const params = new URLSearchParams();
      validWallets.forEach((wallet) => {
        params.append("wallets", wallet);
      });
      if (options.limit !== undefined) {
        params.set("limit", String(options.limit));
      }
      if (options.windowMs !== undefined) {
        params.set("windowMs", String(options.windowMs));
      }
      const url = `${WALLET_TRACKER_API_URL}/api/history?${params.toString()}`;
      response = await fetch(url, { signal: options.signal });
    }
    let payload: any = null;

    if (!response.ok) {
      try {
        payload = await response.json();
      } catch {
        payload = await response.text().catch(() => null);
      }
      console.error("Failed to fetch trade history:", {
        status: response.status,
        statusText: response.statusText,
        body: payload,
      });
      return [];
    }

    payload = await response.json();
    const records: any[] = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.trades)
        ? payload.trades
        : Array.isArray(payload?.data)
          ? payload.data
          : [];

    const history = records
      .map((record) => normalizeTradeHistoryRecord(record))
      .filter((record): record is TradeEvent => Boolean(record));

    return history;
  } catch (error) {
    console.error("Error fetching wallet trade history:", error);
    return [];
  }
}

// ===== WebSocket Functions =====

export interface WalletTrackerWebSocket {
  ws: WebSocket;
  subscribe: (wallets: string[]) => void;
  unsubscribe: (wallets: string[]) => void;
  close: () => void;
  /** Force-close the socket so the caller's onDisconnect runs and a fresh connect happens. */
  forceReconnect: (reason?: string) => void;
  /** ms timestamp of the last server ping we acknowledged (0 if none yet). */
  getLastPingAt: () => number;
}

export interface BalanceEvent {
  type: "balance";
  wallet: string;
  items: Array<{ mint: string; amount: number }>;
  at: number;
}

export function createWalletTrackerWebSocket(
  onTradeEvent: (event: TradeEvent) => void,
  onConnect?: () => void,
  onDisconnect?: () => void,
  onBalanceEvent?: (event: BalanceEvent) => void,
): WalletTrackerWebSocket {
  const wsUrl = `${WALLET_TRACKER_WS_URL}/ws`;
  const ws = new WebSocket(wsUrl);
  let isAlive = true;
  let connectionEstablished = false;
  let lastPingAt = Date.now();
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  /** Queue messages sent before the socket is OPEN; flush on open. */
  const sendQueue: string[] = [];
  const safeSend = (payload: string) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    } else if (ws.readyState === WebSocket.CONNECTING) {
      sendQueue.push(payload);
    }
    // CLOSING / CLOSED: drop — caller's onDisconnect will recreate the socket.
  };

  ws.onopen = () => {
    isAlive = true;
    connectionEstablished = true;
    lastPingAt = Date.now();

    // Flush anything queued during CONNECTING before invoking onConnect.
    while (sendQueue.length) {
      try {
        ws.send(sendQueue.shift()!);
      } catch {}
    }

    onConnect?.();

    // Start heartbeat checker: if no server ping in 45s, force reconnect
    heartbeatInterval = setInterval(() => {
      if (Date.now() - lastPingAt > 45_000) {
        console.warn(
          "[WalletTracker WS] Heartbeat stale (>45s), forcing reconnect",
        );
        ws.close();
      }
    }, 15_000);
  };

  ws.onmessage = (event) => {
    // Any inbound frame proves the socket is alive — bump the heartbeat
    // unconditionally. Browsers handle native ping/pong control frames
    // (RFC 6455) transparently and never surface them to onmessage, so
    // gating this on a specific JSON `method: "ping"` payload would silently
    // break the moment the backend (or any proxy in front of it) switched
    // to control-frame keepalive — clients would close on the 45s timeout
    // and reconnect forever.
    isAlive = true;
    lastPingAt = Date.now();

    try {
      const data = JSON.parse(event.data);

      // Handle ping/pong
      if (data.method === "ping") {
        ws.send(JSON.stringify({ method: "pong" }));
        return;
      }

      // Handle subscription confirmation
      if (data.type === "subscribed") {
        return;
      }

      // Handle trade events
      if (data.type === "trade") {
        onTradeEvent(data as TradeEvent);
      }

      // Handle balance events (published by backend refresher)
      if (data.type === "balance") {
        onBalanceEvent?.(data as BalanceEvent);
      }
    } catch (error) {
      // Silent fail
    }
  };

  ws.onerror = (error) => {
    if (!connectionEstablished) {
      console.error(
        "WebSocket connection error - check NEXT_PUBLIC_WALLET_TRACKER_WS_URL:",
        wsUrl,
      );
    }
  };

  ws.onclose = (event) => {
    isAlive = false;
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    onDisconnect?.();
  };

  const subscribe = (wallets: string[]) => {
    if (wallets.length === 0) return;
    safeSend(JSON.stringify({ method: "subscribe", wallets }));
  };

  const unsubscribe = (wallets: string[]) => {
    if (wallets.length === 0) return;
    safeSend(JSON.stringify({ method: "unsubscribe", wallets }));
  };

  const close = () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    ws.close();
  };

  const forceReconnect = (reason = "force-reconnect") => {
    if (
      ws.readyState === WebSocket.OPEN ||
      ws.readyState === WebSocket.CONNECTING
    ) {
      try {
        ws.close(4000, reason);
      } catch {}
    }
  };

  const getLastPingAt = () => lastPingAt;

  return { ws, subscribe, unsubscribe, close, forceReconnect, getLastPingAt };
}

// ===== Batch Balance Fetch =====

export async function fetchBatchBalances(
  wallets: string[],
  chain: "sol" | "monad" = "sol",
): Promise<Record<string, number>> {
  if (!WALLET_TRACKER_API_URL || wallets.length === 0) return {};

  try {
    const response = await fetch(
      `${WALLET_TRACKER_API_URL}/api/wallet-balance/batch`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallets, chain }),
      },
    );

    if (!response.ok) {
      console.error("[fetchBatchBalances] HTTP error:", response.status);
      return {};
    }

    const data = await response.json();
    if (data.ok && data.balances) {
      return data.balances as Record<string, number>;
    }
    return {};
  } catch (error) {
    console.error("[fetchBatchBalances] Error:", error);
    return {};
  }
}

// ===== Portfolio Cache Bridge =====

/** Convert a portfolio TradeRow to a wallet-tracker TradeEvent. */
export function tradeRowToTradeEvent(row: TradeRow): TradeEvent {
  const timestamp = new Date(row.tradeTime).getTime();
  return {
    type: "trade",
    wallet: row.walletAddress || row.wallet || row.maker || row.owner || "",
    mint: row.tokenAddress,
    pair_address: row.pairAddress || row.originalPairAddress,
    symbol: row.tokenSymbol || null,
    name: row.tokenName || null,
    side: row.type === "Buy" ? "buy" : "sell",
    amount: typeof row.tokenAmount === "string" ? parseFloat(row.tokenAmount) : row.tokenAmount,
    sol_spent: typeof row.solAmount === "string" ? parseFloat(row.solAmount) : row.solAmount,
    price_usd: row.pricePerToken ?? null,
    market_cap_usd: typeof row.marketCap === "string" ? parseFloat(row.marketCap) : row.marketCap,
    venue: null,
    tx: row.transactionHash,
    at: isNaN(timestamp) ? 0 : timestamp,
  };
}

/**
 * Read portfolio trade history from localStorage cache, filtered for a specific wallet.
 * Returns converted TradeEvent[] sorted newest-first, or null if no cache.
 */
export function readPortfolioCacheForWallet(
  userId: string | undefined,
  walletAddress: string,
  chain: string = "sol",
): TradeEvent[] | null {
  if (!userId || typeof window === "undefined") return null;

  try {
    const cacheKey = `trade_history_cache_${userId}_${chain}`;
    const cached = window.localStorage.getItem(cacheKey);
    if (!cached) return null;

    const parsed = JSON.parse(cached);
    if (!parsed || !Array.isArray(parsed.data) || parsed.data.length === 0) return null;

    const normalizedTarget = walletAddress.toLowerCase();
    const walletTrades = (parsed.data as TradeRow[]).filter((row) => {
      const rowWallet = (
        row.walletAddress || row.wallet || row.maker || row.owner || row.userWalletAddress || ""
      ).toLowerCase();
      return rowWallet === normalizedTarget;
    });

    if (walletTrades.length === 0) return null;

    const events = walletTrades.map(tradeRowToTradeEvent);
    events.sort((a, b) => b.at - a.at);
    return events;
  } catch {
    return null;
  }
}
