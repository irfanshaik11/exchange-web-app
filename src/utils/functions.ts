import { env } from "../env";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, NATIVE_MINT } from "@solana/spl-token";
import { ethers } from "ethers";
import Cookies from "js-cookie";
import { QUOTE_MINTS } from "./quoteCurrency";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Build request headers for authenticated backend reads. The session JWT is the
 * same token UserContext stores in the `token` cookie. The backend's per-user
 * trade read endpoints require it (IDOR fix) and return 401/403 without it.
 * Returns an empty object when no token is present (logged-out / SSR).
 */
function authHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined" ? Cookies.get("token") : undefined;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface PositionRow {
  tokenAddress: string;
  pairAddress?: string; // Pool/pair address (contains originalPairAddress from backend)
  blockchain?: string;
  launchpad?: string | null;
  imageUrl?: string | null; // Token image URL saved during buy
  tokenName?: string | null; // Token name from backend
  tokenSymbol?: string | null; // Token symbol from backend
  bought: number;
  boughtUsdValue: number;
  sold: number;
  soldUsdValue: number;
  remaining: number;
  remainingUsdValue: number;
  pnl: number;
  pnlPercentage: number;
  currentPrice?: number;
  actions: string;
  avgBuyMarketCap?: number;
  avgSellMarketCap?: number;
}

export interface TradeRow {
  // New fields for accurate PNL calculation
  pricePerToken?: number; // USD price per token at trade time
  costBasis?: number; // For Sell trades: what we paid for the tokens
  realizedPnl?: number; // For Sell trades: profit/loss (stored in DB)
  realizedPnlPercentage?: number; // PNL as percentage of cost basis
  walletAddress?: string | null; // Wallet recorded for the trade (if available)
  wallet?: string | null; // Legacy wallet field name (if available)
  walletLabel?: string | null;
  walletEmoji?: string | null;
  walletId?: string | number | null;
  maker?: string | null;
  owner?: string | null;
  userWallet?: string | null;
  userWalletAddress?: string | null;
  fromAddress?: string | null;
  id: number;
  tokenAddress: string;
  pairAddress?: string; // Pool/pair address
  originalPairAddress?: string; // Original pair address from backend
  blockchain?: string;
  launchpad?: string | null;
  tradeTime: string;
  type: "Buy" | "Sell";
  marketCap: string | number;
  solAmount: string | number;
  tokenAmount: string | number;
  usdValue: string | number;
  transactionHash: string;
  createdAt: string;
  tokenName?: string; // Token name from API
  tokenSymbol?: string; // Token symbol from API
  imageUrl?: string | null; // Token image URL saved during trade
  isSplitTrade?: boolean; // True if this is a child trade from multi-wallet execution
}

// New: Wallet Interface
export interface Wallet {
  address: string;
  name: string;
  createdAt: number; // Timestamp for creation date
  emoji?: string;
}

// New: Helper to get stored wallets from localStorage (user-specific)
export function getStoredWallets(userId?: string): Wallet[] {
  if (typeof window === "undefined") return []; // Ensure runs only on client-side
  const key = userId ? `wallets_${userId}` : "wallets";
  const walletsJson = localStorage.getItem(key);
  return walletsJson ? JSON.parse(walletsJson) : [];
}

// New: Helper to store wallets to localStorage (user-specific)
export function storeWallets(wallets: Wallet[], userId?: string) {
  if (typeof window === "undefined") return; // Ensure runs only on client-side
  const key = userId ? `wallets_${userId}` : "wallets";
  localStorage.setItem(key, JSON.stringify(wallets));
}

// Helper to clear wallets from localStorage (user-specific)
export function clearStoredWallets(userId?: string) {
  if (typeof window === "undefined") return;
  const key = userId ? `wallets_${userId}` : "wallets";
  localStorage.removeItem(key);
}

export async function getPrice(
  tokenAddress: string,
): Promise<{ price: number }> {
  if (!tokenAddress) throw new Error("tokenAddress is required");
  const res = await fetch(
    `${env.NEXT_PUBLIC_BACKEND_URL}/api/trade/get_price?tokenAddress=${tokenAddress}`,
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch price: ${res.statusText}`);
  }
  return res.json();
}

export async function getPumpSwapPool(tokenAddress: string): Promise<any> {
  if (!tokenAddress) throw new Error("tokenAddress is required");
  const res = await fetch(
    `${env.NEXT_PUBLIC_BACKEND_URL}/api/trade/get_pump_swap_pool?tokenAddress=${tokenAddress}`,
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch pump swap pool: ${res.statusText}`);
  }
  return res.json();
}

/** Typed result for position fetches — lets callers distinguish "0 positions" from "request failed" */
export type PositionsResult =
  | { ok: true; data: PositionRow[] }
  | { ok: false; data: null; error: string };

export async function fetchActivePositions(
  userId: string,
  blockchain?: string,
): Promise<PositionsResult> {
  if (!userId) return { ok: true, data: [] };
  if (!env.NEXT_PUBLIC_BACKEND_URL) {
    return {
      ok: false,
      data: null,
      error: "NEXT_PUBLIC_BACKEND_URL is not set",
    };
  }

  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), 10000);
    }
    const blockchainParam =
      blockchain && blockchain !== "all" ? `&blockchain=${blockchain}` : "";
    const res = await fetch(
      `${env.NEXT_PUBLIC_BACKEND_URL}/api/trade/get_active_positions_by_user?userId=${userId}${blockchainParam}`,
      {
        headers: authHeaders(),
        ...(controller ? { signal: controller.signal } : {}),
      },
    );
    if (!res.ok) {
      return { ok: false, data: null, error: `http_${res.status}` };
    }
    const data = await res.json();
    return { ok: true, data: Array.isArray(data) ? data : [] };
  } catch (err) {
    if ((err as any)?.name === "AbortError") {
      return { ok: false, data: null, error: "timeout" };
    }
    return { ok: false, data: null, error: "network" };
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

/** Backward-compat wrapper — returns [] on error (used by callers that don't need error distinction) */
export async function getActivePositionsByUser(
  userId: string,
  blockchain?: string,
): Promise<PositionRow[]> {
  const result = await fetchActivePositions(userId, blockchain);
  return result.data ?? [];
}

/**
 * Fetch the CURRENT authenticated user's trades for a given token address.
 * Requires a session token (sent via authHeaders); the backend scopes results
 * to the caller's own trades (IDOR fix) and returns 401/403 otherwise.
 */
export async function getTradeHistoryByTokenAddress(
  tokenAddress: string,
): Promise<TradeRow[]> {
  if (!tokenAddress) return [];
  isDev && console.log(env.NEXT_PUBLIC_BACKEND_URL);
  const res = await fetch(
    `${env.NEXT_PUBLIC_BACKEND_URL}/api/trade/get_trade_history_by_tokenaddress?tokenAddress=${tokenAddress}`,
    { headers: authHeaders() },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function getTradeHistoryByUser(
  userId: string,
  blockchain?: string,
): Promise<any[]> {
  if (!userId) throw new Error("userId is required");
  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (controller) {
    timeoutId = setTimeout(() => controller.abort(), 10000);
  }
  try {
    const blockchainParam =
      blockchain && blockchain !== "all" ? `&blockchain=${blockchain}` : "";
    const res = await fetch(
      `${env.NEXT_PUBLIC_BACKEND_URL}/api/trade/get_trade_history_by_user?userId=${userId}${blockchainParam}`,
      {
        headers: authHeaders(),
        ...(controller ? { signal: controller.signal } : {}),
      },
    );
    if (!res.ok) {
      throw new Error(
        `Failed to fetch trade history by user: ${res.statusText}`,
      );
    }
    return res.json();
  } catch (err) {
    if ((err as any)?.name === "AbortError") {
      console.warn("getTradeHistoryByUser request timed out");
      return [];
    }
    throw err;
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

/** Typed result for trade activity fetches — lets callers distinguish "0 trades" from "request failed" */
export type TradeActivityResult =
  | { ok: true; data: any[] }
  | { ok: false; data: null; error: string };

export async function fetchTradeActivity(
  userId: string,
  blockchain?: string,
): Promise<TradeActivityResult> {
  if (!userId) return { ok: true, data: [] };
  if (!env.NEXT_PUBLIC_BACKEND_URL) {
    return {
      ok: false,
      data: null,
      error: "NEXT_PUBLIC_BACKEND_URL is not set",
    };
  }

  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), 10000);
    }
    const blockchainParam =
      blockchain && blockchain !== "all" ? `&blockchain=${blockchain}` : "";
    const res = await fetch(
      `${env.NEXT_PUBLIC_BACKEND_URL}/api/trade/get_trade_activity_by_user?userId=${userId}${blockchainParam}`,
      {
        headers: authHeaders(),
        ...(controller ? { signal: controller.signal } : {}),
      },
    );
    if (!res.ok) {
      return { ok: false, data: null, error: `http_${res.status}` };
    }
    const data = await res.json();
    return { ok: true, data: Array.isArray(data) ? data : [] };
  } catch (err) {
    if ((err as any)?.name === "AbortError") {
      return { ok: false, data: null, error: "timeout" };
    }
    return { ok: false, data: null, error: "network" };
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

/** Backward-compat wrapper — returns [] on error (used by callers that don't need error distinction) */
export async function getTradeActivityByUser(
  userId: string,
  blockchain?: string,
): Promise<any[]> {
  const result = await fetchTradeActivity(userId, blockchain);
  return result.data ?? [];
}

export interface WalletScanResponse {
  wallet: string;
  updatedAt: string;
  balance: {
    sol: number;
    usd: number;
    usdFormatted: string | null;
  };
  tokenActivity: Array<{
    type: "Buy" | "Sell";
    token: string;
    tokenAddress: string;
    amount: number;
    marketcap: number | null;
    age: string;
    solscanUrl: string;
  }>;
}

export interface WalletBalanceResponse {
  wallet: string;
  updatedAt: string;
  balance: {
    sol: number;
    usd: number;
    usdFormatted: string | null;
  };
}

export async function fetchWalletBalance(
  walletAddress: string,
): Promise<WalletBalanceResponse> {
  if (!walletAddress) throw new Error("walletAddress is required");
  if (!env.NEXT_PUBLIC_BACKEND_URL) {
    throw new Error("NEXT_PUBLIC_BACKEND_URL is not configured");
  }

  const params = new URLSearchParams({ walletAddress });

  const res = await fetch(
    `${env.NEXT_PUBLIC_BACKEND_URL}/api/trade/wallet_balance?${params.toString()}`,
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch wallet balance: ${res.statusText}`);
  }

  return res.json();
}

export async function scanWallet(
  walletAddress: string,
  limit?: number,
): Promise<WalletScanResponse> {
  if (!walletAddress) throw new Error("walletAddress is required");
  if (!env.NEXT_PUBLIC_BACKEND_URL) {
    throw new Error("NEXT_PUBLIC_BACKEND_URL is not configured");
  }

  const params = new URLSearchParams({ walletAddress });
  if (limit) params.append("limit", limit.toString());

  const res = await fetch(
    `${env.NEXT_PUBLIC_BACKEND_URL}/api/trade/scan_wallet?${params.toString()}`,
  );

  if (!res.ok) {
    throw new Error(`Failed to scan wallet: ${res.statusText}`);
  }

  return res.json();
}

// Transform wallet scan response to TradeRow format for Activity component
export function transformWalletScanToTradeRows(
  scanData: WalletScanResponse,
): TradeRow[] {
  return scanData.tokenActivity.map((activity, index) => {
    // Extract transaction hash from solscanUrl
    const txHash = activity.solscanUrl.split("/tx/")[1] || "";

    // Parse age to get approximate timestamp (current time - age)
    const now = Date.now();
    let timestamp = now;
    const age = activity.age;
    if (age.endsWith("s")) {
      timestamp = now - parseInt(age) * 1000;
    } else if (age.endsWith("m")) {
      timestamp = now - parseInt(age) * 60 * 1000;
    } else if (age.endsWith("h")) {
      timestamp = now - parseInt(age) * 60 * 60 * 1000;
    } else if (age.endsWith("d")) {
      timestamp = now - parseInt(age) * 24 * 60 * 60 * 1000;
    } else if (age.endsWith("w")) {
      timestamp = now - parseInt(age) * 7 * 24 * 60 * 60 * 1000;
    }

    return {
      id: index,
      tokenAddress: activity.tokenAddress,
      type: activity.type,
      tradeTime: new Date(timestamp).toTimeString().split(" ")[0],
      marketCap: activity.marketcap || 0,
      solAmount: activity.amount,
      tokenAmount: 0, // Not available from scan
      usdValue: activity.amount, // Using SOL amount as USD value approximation
      transactionHash: txHash,
      createdAt: new Date(timestamp).toISOString(),
      tokenName: activity.token, // Use token name from API
    };
  });
}

export function formatSmartNumber(num: number): string {
  // Guard NaN / Infinity → render an em-dash so the UI never displays
  // literally "NaN" or "Infinity" to users when an upstream computation
  // produces a non-finite result.
  if (!Number.isFinite(num)) {
    return "—";
  }
  const abs = Math.abs(num);
  if (abs > 0 && abs < 0.01) {
    const str = abs.toFixed(20);
    const decIdx = str.indexOf(".");
    if (decIdx !== -1) {
      let zeroCount = 0;
      let sigDigits = "";
      for (let i = decIdx + 1; i < str.length; i++) {
        if (str[i] === "0") {
          zeroCount++;
        } else {
          sigDigits = str
            .substring(i, Math.min(i + 4, str.length))
            .replace(/0+$/, "");
          break;
        }
      }
      if (zeroCount >= 2 && zeroCount <= 4 && sigDigits) {
        const subMap: Record<string, string> = {
          "0": "₀",
          "1": "₁",
          "2": "₂",
          "3": "₃",
          "4": "₄",
          "5": "₅",
          "6": "₆",
          "7": "₇",
          "8": "₈",
          "9": "₉",
        };
        const sub = zeroCount
          .toString()
          .split("")
          .map((c) => subMap[c] || c)
          .join("");
        return `${num < 0 ? "-" : ""}0.0${sub}${sigDigits}`;
      }
    }
  }
  // Sub-$1 values: toFixed(1) was the bug — 0.024 → "0.0" → "$0". Use enough
  // precision that values in [0.01, 1) survive (e.g. a just-bought position's
  // cost basis), trimming trailing zeros: 0.024→"0.024", 0.05→"0.05", 0.5→"0.5".
  if (abs > 0 && abs < 1) {
    return String(parseFloat(num.toFixed(abs < 0.1 ? 4 : 2)));
  }
  if (abs < 1000) {
    return parseFloat(num.toFixed(1)).toLocaleString();
  } else if (abs < 1000000) {
    return parseFloat((num / 1000).toFixed(1)).toLocaleString() + "K";
  } else if (Math.abs(num) < 1000000000) {
    return parseFloat((num / 1000000).toFixed(1)).toLocaleString() + "M";
  } else {
    return parseFloat((num / 1000000000).toFixed(1)).toLocaleString() + "B";
  }
}

// Fetch and parse token metadata from a URI (IPFS or HTTP)
export async function fetchTokenMetadata(
  uri: string | undefined,
): Promise<any | null> {
  if (!uri) return null;
  try {
    // Normalize to https if ipfs://, prefer Cloudflare IPFS
    const { normalizeImageUrl } = await import("./images");
    const normalized = normalizeImageUrl(uri) || uri;
    // Prefer same-origin proxy to avoid mixed content/TLS/CORS
    const proxyUrl = `/api/metadata/proxy?url=${encodeURIComponent(normalized)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.warn(
        "fetchTokenMetadata: Request timed out after 6 seconds for:",
        uri,
      );
      controller.abort();
    }, 6000);

    const resp = await fetch(proxyUrl, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "force-cache",
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      console.error(
        `Failed to fetch metadata via local proxy: ${resp.status} ${resp.statusText}`,
      );
      return null;
    }
    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return null;
    }
    console.warn(
      "fetchTokenMetadata: Error fetching metadata for:",
      uri,
      "Error:",
      (err as any)?.message || err,
    );
    return null;
  }
}

export async function getSolBalance(address: string, isDevnet = false) {
  const clusterApiUrlString = isDevnet ? "devnet" : "mainnet-beta";
  try {
    // Use the configured private RPC for mainnet to avoid public-RPC throttling.
    // Public clusterApiUrl is the fallback (and always used for devnet).
    const rpcUrl =
      !isDevnet && env.NEXT_PUBLIC_SOLANA_RPC
        ? env.NEXT_PUBLIC_SOLANA_RPC
        : clusterApiUrl(clusterApiUrlString);
    const connection = new Connection(rpcUrl, "confirmed");
    const publicKey = new PublicKey(address);

    // Fetch native SOL and WSOL ATA balance in parallel
    const [lamports, wsolLamports] = await Promise.all([
      connection.getBalance(publicKey),
      connection
        .getTokenAccountBalance(
          getAssociatedTokenAddressSync(NATIVE_MINT, publicKey),
        )
        .then((b) => Number(b.value.amount))
        .catch(() => 0),
    ]);

    return (lamports + wsolLamports) / 1e9;
  } catch (error) {
    console.error("Failed to fetch balance:", error);
    return null;
  }
}

/**
 * Read a wallet's USDC SPL balance (UI units) from its associated token account.
 *
 * Mirrors getSolBalance's RPC setup. An absent USDC ATA means the wallet has
 * never held USDC, which is a zero balance — not an error — so we return 0 in
 * that case and on any failure (no throwing, server-side use only).
 */
export async function getUsdcSplBalance(address: string): Promise<number> {
  try {
    // Use the configured private RPC, falling back to public mainnet-beta.
    const rpcUrl = env.NEXT_PUBLIC_SOLANA_RPC
      ? env.NEXT_PUBLIC_SOLANA_RPC
      : clusterApiUrl("mainnet-beta");
    const connection = new Connection(rpcUrl, "confirmed");

    const ata = getAssociatedTokenAddressSync(
      new PublicKey(QUOTE_MINTS.USDC),
      new PublicKey(address),
    );

    const { value } = await connection.getTokenAccountBalance(ata);
    // USDC has 6 decimals: raw micro-USDC -> UI units.
    return Number(value.amount) / 1e6;
  } catch (error) {
    // Absent ATA or RPC failure both resolve to a 0 balance.
    return 0;
  }
}

export async function getMonadBalance(address: string) {
  const rpcUrl = env.NEXT_PUBLIC_MONAD_RPC_URL || env.MONAD_RPC_URL;
  if (!rpcUrl) {
    console.warn("Monad RPC URL not configured");
    return null;
  }
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const weiBalance = await provider.getBalance(address);
    const mon = Number(weiBalance) / 1e18;
    return mon;
  } catch (error) {
    console.error("Failed to fetch Monad balance:", error);
    return null;
  }
}

export async function getBnbBalance(address: string) {
  const rpcUrl =
    process.env.BSC_RPC_URL ||
    process.env.NEXT_PUBLIC_BSC_RPC_URL ||
    "https://bsc-dataseed.binance.org";
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const weiBalance = await provider.getBalance(address);
    return Number(weiBalance) / 1e18;
  } catch (error) {
    console.error("Failed to fetch BNB balance:", error);
    return null;
  }
}
