// Wallet tracking API utilities - Integrates with wallet-tracker-backend

// ===== Backend Data Types =====
export interface WatchWallet {
  id: string;
  ownerId: string | null;
  address: string;
  walletName: string | null;
  createdAt: string;
}

export interface WalletEvent {
  id: string;
  ts: string;
  wallet: string;
  mint: string;
  amount: string;
  side: 'buy' | 'sell';
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
  type: 'trade';
  wallet: string;
  mint: string;
  symbol: string | null;
  name: string | null;
  side: 'buy' | 'sell';
  amount: number;
  sol_spent: number | null;
  price_usd: number | null;
  market_cap_usd: number | null;
  venue: string | null;
  tx: string;
  at: number;
}

// ===== Frontend Display Types =====
export interface TrackedWallet {
  address: string;
  name: string | null;
  createdAt: string;
  events: WalletEvent[];
  latestEvent?: TradeEvent;
}

const WALLET_TRACKER_API_URL = process.env.NEXT_PUBLIC_WALLET_TRACKER_URL || 'http://localhost:8081';
// WebSocket is on a different port (8082), so we need to handle this properly
const WALLET_TRACKER_WS_URL = process.env.NEXT_PUBLIC_WALLET_TRACKER_WS_URL 
  ? process.env.NEXT_PUBLIC_WALLET_TRACKER_WS_URL 
  : 'ws://localhost:8082';

// ===== API Functions =====

// Get all tracked wallets
export async function getTrackedWallets(userId?: string): Promise<WatchWallet[]> {
  try {
    const url = userId 
      ? `${WALLET_TRACKER_API_URL}/api/watch?userId=${encodeURIComponent(userId)}`
      : `${WALLET_TRACKER_API_URL}/api/watch`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch wallets');
    return await response.json();
  } catch (error) {
    console.error('Error fetching tracked wallets:', error);
    return [];
  }
}

// Add a wallet to tracking
export async function addTrackedWallet(address: string, name?: string, userId?: string): Promise<void> {
  try {
    const response = await fetch(`${WALLET_TRACKER_API_URL}/api/watch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        wallet: address, 
        walletName: name || undefined,
        userId: userId || undefined
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add wallet');
    }
  } catch (error) {
    console.error('Error adding wallet:', error);
    throw error;
  }
}

// Remove a wallet from tracking
export async function removeTrackedWallet(address: string, userId?: string): Promise<void> {
  try {
    const url = userId
      ? `${WALLET_TRACKER_API_URL}/api/watch/${encodeURIComponent(address)}?userId=${encodeURIComponent(userId)}`
      : `${WALLET_TRACKER_API_URL}/api/watch/${encodeURIComponent(address)}`;
    const response = await fetch(url, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to remove wallet');
    }
  } catch (error) {
    console.error('Error removing wallet:', error);
    throw error;
  }
}

// Get wallet event history
export async function getWalletHistory(address: string, limit: number = 50): Promise<WalletEvent[]> {
  try {
    const response = await fetch(
      `${WALLET_TRACKER_API_URL}/api/history?wallet=${encodeURIComponent(address)}&limit=${limit}`
    );
    if (!response.ok) throw new Error('Failed to fetch wallet history');
    return await response.json();
  } catch (error) {
    console.error('Error fetching wallet history:', error);
    return [];
  }
}

// Get wallet balance snapshots
export async function getWalletSnapshots(address: string): Promise<WalletBalance[]> {
  try {
    const response = await fetch(
      `${WALLET_TRACKER_API_URL}/api/snapshot?wallet=${encodeURIComponent(address)}`
    );
    if (!response.ok) throw new Error('Failed to fetch wallet snapshots');
    return await response.json();
  } catch (error) {
    console.error('Error fetching wallet snapshots:', error);
    return [];
  }
}

// Get SOL balance for a wallet (via backend to keep RPC key secure)
export async function getWalletSolBalance(address: string): Promise<number | null> {
  try {
    const response = await fetch(
      `${WALLET_TRACKER_API_URL}/api/wallet-balance/${encodeURIComponent(address)}`
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch wallet balance');
    }
    
    const data = await response.json();
    
    if (data.ok && typeof data.balance === 'number') {
      return data.balance;
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching SOL balance:', error);
    return null;
  }
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
export async function getWalletTransactions(address: string, limit: number = 10): Promise<WalletTransaction[]> {
  try {
    const response = await fetch(
      `${WALLET_TRACKER_API_URL}/api/wallet-transactions/${encodeURIComponent(address)}?limit=${limit}`
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch wallet transactions');
    }
    
    const data = await response.json();
    
    if (data.ok && Array.isArray(data.transactions)) {
      return data.transactions;
    }
    
    return [];
  } catch (error) {
    console.error('Error fetching wallet transactions:', error);
    return [];
  }
}

// ===== WebSocket Functions =====

export interface WalletTrackerWebSocket {
  ws: WebSocket;
  subscribe: (wallets: string[]) => void;
  unsubscribe: (wallets: string[]) => void;
  close: () => void;
}

export function createWalletTrackerWebSocket(
  onTradeEvent: (event: TradeEvent) => void,
  onConnect?: () => void,
  onDisconnect?: () => void
): WalletTrackerWebSocket {
  console.log('Creating WebSocket connection to:', `${WALLET_TRACKER_WS_URL}/ws`);
  
  const ws = new WebSocket(`${WALLET_TRACKER_WS_URL}/ws`);
  let isAlive = true;
  let connectionEstablished = false;

  ws.onopen = () => {
    console.log('✅ WebSocket connection opened successfully');
    isAlive = true;
    connectionEstablished = true;
    onConnect?.();
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      // Handle ping/pong
      if (data.method === 'ping') {
        isAlive = true;
        ws.send(JSON.stringify({ method: 'pong' }));
        return;
      }
      
      // Handle subscription confirmation
      if (data.type === 'subscribed') {
        console.log('✅ Subscription confirmed for wallets:', data.wallets);
        return;
      }
      
      // Handle trade events
      if (data.type === 'trade') {
        console.log('📊 Trade event received:', data);
        onTradeEvent(data as TradeEvent);
      }
    } catch (error) {
      console.error('❌ Error parsing WebSocket message:', error);
    }
  };

  ws.onerror = (error) => {
    console.error('❌ WebSocket error:', error);
    if (!connectionEstablished) {
      console.error('Connection was never established. Check if WebSocket server is running on:', `${WALLET_TRACKER_WS_URL}/ws`);
      console.error('Make sure to:');
      console.error('  1. Start the WebSocket server: npm run dev:ws');
      console.error('  2. Check NEXT_PUBLIC_WALLET_TRACKER_WS_URL in .env.local');
      console.error('  3. Verify port 8082 is accessible');
    }
  };

  ws.onclose = (event) => {
    console.log('WebSocket connection closed:', {
      code: event.code,
      reason: event.reason || 'No reason provided',
      wasClean: event.wasClean
    });
    isAlive = false;
    
    if (!connectionEstablished) {
      console.error('❌ Connection closed before it was established');
      console.error('This usually means:');
      console.error('  - WebSocket server is not running (npm run dev:ws)');
      console.error('  - Wrong URL configured:', `${WALLET_TRACKER_WS_URL}/ws`);
      console.error('  - Firewall or network issue blocking port 8082');
    }
    
    onDisconnect?.();
  };

  const subscribe = (wallets: string[]) => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log('📡 Subscribing to wallets:', wallets);
      ws.send(JSON.stringify({ method: 'subscribe', wallets }));
    } else {
      console.warn('⚠️  Cannot subscribe: WebSocket not open. State:', ws.readyState);
    }
  };

  const unsubscribe = (wallets: string[]) => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log('📡 Unsubscribing from wallets:', wallets);
      ws.send(JSON.stringify({ method: 'unsubscribe', wallets }));
    } else {
      console.warn('⚠️  Cannot unsubscribe: WebSocket not open');
    }
  };

  const close = () => {
    console.log('Closing WebSocket connection...');
    ws.close();
  };

  return { ws, subscribe, unsubscribe, close };
}
