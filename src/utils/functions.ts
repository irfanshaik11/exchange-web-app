import { env } from '../env';

export interface PositionRow {
  tokenAddress: string;
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
  id: number;
  tokenAddress: string;
  tradeTime: string;
  type: 'Buy' | 'Sell';
  marketCap: string | number;
  solAmount: string | number;
  tokenAmount: string | number;
  usdValue: string | number;
  transactionHash: string;
  createdAt: string;
}

// New: Wallet Interface
export interface Wallet {
  address: string;
  name: string;
  createdAt: number; // Timestamp for creation date
  emoji?: string;
}

// New: Helper to get stored wallets from localStorage
export function getStoredWallets(): Wallet[] {
  if (typeof window === 'undefined') return []; // Ensure runs only on client-side
  const walletsJson = localStorage.getItem('wallets');
  return walletsJson ? JSON.parse(walletsJson) : [];
}

// New: Helper to store wallets to localStorage
export function storeWallets(wallets: Wallet[]) {
  if (typeof window === 'undefined') return; // Ensure runs only on client-side
  localStorage.setItem('wallets', JSON.stringify(wallets));
}

export async function getActivePositionsByUser(userId: string): Promise<PositionRow[]> {
  if (!userId) return [];
  const res = await fetch(`${env.NEXT_PUBLIC_BACKEND_URL}/api/trade/get_active_positions_by_user?userId=${userId}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function getTradeHistoryByTokenAddress(tokenAddress: string): Promise<TradeRow[]> {
  if (!tokenAddress) return [];
  console.log(env.NEXT_PUBLIC_BACKEND_URL)
  const res = await fetch(`${env.NEXT_PUBLIC_BACKEND_URL}/api/trade/get_trade_history_by_tokenaddress?tokenAddress=${tokenAddress}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export function formatSmartNumber(num: number): string {
  if (Math.abs(num) < 1000) {
    return parseFloat(num.toFixed(2)).toLocaleString();
  } else if (Math.abs(num) < 1000000) {
    return (parseFloat((num / 1000).toFixed(2))).toLocaleString() + 'K';
  } else if (Math.abs(num) < 1000000000) {
    return (parseFloat((num / 1000000).toFixed(2))).toLocaleString() + 'M';
  } else {
    return (parseFloat((num / 1000000000).toFixed(2))).toLocaleString() + 'B';
  }
} 