import { env } from "../env";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { ethers } from "ethers";

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
  actions: string;
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

export async function getActivePositionsByUser(
  userId: string,
  blockchain?: string,
): Promise<PositionRow[]> {
  if (!userId) return [];
  if (!env.NEXT_PUBLIC_BACKEND_URL) {
    console.error("NEXT_PUBLIC_BACKEND_URL is not set");
    return [];
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
      controller ? { signal: controller.signal } : {},
    );
    if (!res.ok) {
      console.error(
        "Failed to fetch active positions:",
        res.status,
        res.statusText,
      );
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    if ((err as any)?.name === "AbortError") {
      console.warn("getActivePositionsByUser request timed out");
    } else {
      console.error("Error fetching active positions:", err);
    }
    return [];
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export async function getTradeHistoryByTokenAddress(
  tokenAddress: string,
): Promise<TradeRow[]> {
  if (!tokenAddress) return [];
  console.log(env.NEXT_PUBLIC_BACKEND_URL);
  const res = await fetch(
    `${env.NEXT_PUBLIC_BACKEND_URL}/api/trade/get_trade_history_by_tokenaddress?tokenAddress=${tokenAddress}`,
  );
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function getTradeHistoryByUser(
  userId: string,
  blockchain?: string,
): Promise<any[]> {
  if (!userId) throw new Error("userId is required");
  const blockchainParam =
    blockchain && blockchain !== "all" ? `&blockchain=${blockchain}` : "";
  const res = await fetch(
    `${env.NEXT_PUBLIC_BACKEND_URL}/api/trade/get_trade_history_by_user?userId=${userId}${blockchainParam}`,
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch trade history by user: ${res.statusText}`);
  }
  return res.json();
}

export async function getTradeActivityByUser(
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
      `${env.NEXT_PUBLIC_BACKEND_URL}/api/trade/get_trade_activity_by_user?userId=${userId}${blockchainParam}`,
      controller ? { signal: controller.signal } : {},
    );
    if (!res.ok) {
      throw new Error(
        `Failed to fetch trade activity by user: ${res.status} ${res.statusText}`,
      );
    }
    return res.json();
  } catch (err) {
    if ((err as any)?.name === "AbortError") {
      console.warn("getTradeActivityByUser request timed out");
      return [];
    }
    throw err;
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
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
  if (Math.abs(num) < 1000) {
    return parseFloat(num.toFixed(2)).toLocaleString();
  } else if (Math.abs(num) < 1000000) {
    return parseFloat((num / 1000).toFixed(2)).toLocaleString() + "K";
  } else if (Math.abs(num) < 1000000000) {
    return parseFloat((num / 1000000).toFixed(2)).toLocaleString() + "M";
  } else {
    return parseFloat((num / 1000000000).toFixed(2)).toLocaleString() + "B";
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
    const connection = new Connection(
      clusterApiUrl(clusterApiUrlString),
      "confirmed",
    );
    const publicKey = new PublicKey(address);
    const lamports = await connection.getBalance(publicKey);
    const sol = lamports / 1e9;
    return sol;
  } catch (error) {
    console.error("Failed to fetch balance:", error);
    return null;
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
