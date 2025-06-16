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

export async function getActivePositionsByUser(userId: string): Promise<PositionRow[]> {
  if (!userId) return [];
  if (!env.NEXT_PUBLIC_BACKEND_URL) {
    console.error('NEXT_PUBLIC_BACKEND_URL is not set');
    return [];
  }
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_BACKEND_URL}/api/trade/get_active_positions_by_user?userId=${userId}`);
    if (!res.ok) {
      console.error('Failed to fetch active positions:', res.status, res.statusText);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Error fetching active positions:', err);
    return [];
  }
}

export async function getTradeHistoryByTokenAddress(tokenAddress: string): Promise<TradeRow[]> {
  if (!tokenAddress) return [];
  if (!env.NEXT_PUBLIC_BACKEND_URL) {
    console.error('NEXT_PUBLIC_BACKEND_URL is not set');
    return [];
  }
  try {
    const url = `${env.NEXT_PUBLIC_BACKEND_URL}/api/trade/get_trade_history_by_tokenaddress?tokenAddress=${tokenAddress}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error('Failed to fetch trade history:', res.status, res.statusText);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Error fetching trade history:', err);
    return [];
  }
}