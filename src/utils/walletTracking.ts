// Wallet tracking API utilities - Integrates with wallet-tracker-backend

// ===== Backend Data Types =====
export interface WatchWallet {
  id: string;
  ownerId: string | null;
  address: string;
  walletName: string | null;
  emoji: string | null;
  notificationsEnabled: boolean;
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
  pair_address?: string; // Optional: preferred for navigation
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
  if (!envUrl) return 'http://localhost:8081';
  try {
    const u = new URL(envUrl);
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname);
    if (u.protocol === 'https:' && isIp) {
      return `http://${u.host}`;
    }
    return envUrl;
  } catch {
    return envUrl;
  }
};

const WALLET_TRACKER_API_URL = resolveApiUrl();

// Normalize WS URL: allow users to provide http(s) and convert to ws(s) automatically
const resolveWsUrl = () => {
  const envWs = process.env.NEXT_PUBLIC_WALLET_TRACKER_WS_URL;
  if (!envWs) {
    console.warn('⚠️ NEXT_PUBLIC_WALLET_TRACKER_WS_URL not set, using default: ws://localhost:8081');
    return 'ws://localhost:8081';
  }
  if (envWs.startsWith('http://')) return envWs.replace(/^http:\/\//, 'ws://');
  if (envWs.startsWith('https://')) return envWs.replace(/^https:\/\//, 'wss://');
  return envWs;
};

const WALLET_TRACKER_WS_URL = resolveWsUrl();
console.log('🔧 [Config] WebSocket URL configured:', WALLET_TRACKER_WS_URL);

// ===== API Functions =====

// Get all tracked wallets
export async function getTrackedWallets(userId?: string): Promise<WatchWallet[]> {
  try {
    const url = userId 
      ? `${WALLET_TRACKER_API_URL}/api/watch?userId=${encodeURIComponent(userId)}`
      : `${WALLET_TRACKER_API_URL}/api/watch`;
    const response = await fetch(url);
    if (!response.ok) {
      const ct = response.headers.get('content-type') || '';
      const body = ct.includes('application/json') ? await response.json().catch(() => ({})) : await response.text().catch(() => '');
      const msg = typeof body === 'object' && body && (body as any).error ? (body as any).error : (typeof body === 'string' && body.trim().startsWith('<') ? `HTTP ${response.status} ${response.statusText}` : (typeof body === 'string' ? body : 'Failed to fetch wallets'));
      throw new Error(msg || 'Failed to fetch wallets');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching tracked wallets:', error);
    return [];
  }
}

// Add a wallet to tracking
export async function addTrackedWallet(address: string, name?: string, userId?: string, emoji?: string, notificationsEnabled: boolean = true): Promise<void> {
  try {
    const response = await fetch(`${WALLET_TRACKER_API_URL}/api/watch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        wallet: address, 
        walletName: name || undefined,
        userId: userId || undefined,
        emoji: emoji || undefined
        // Note: notificationsEnabled is set via a separate API call below
      }),
    });
    
    if (!response.ok) {
      const ct = response.headers.get('content-type') || '';
      const body = ct.includes('application/json') ? await response.json().catch(() => ({})) : await response.text().catch(() => '');
      const msg = typeof body === 'object' && body && (body as any).error ? (body as any).error : (typeof body === 'string' && body.trim().startsWith('<') ? `HTTP ${response.status} ${response.statusText}` : (typeof body === 'string' ? body : 'Failed to add wallet'));
      throw new Error(msg || 'Failed to add wallet');
    }
    
    // Enable notifications if requested (separate API call)
    if (notificationsEnabled) {
      try {
        await toggleWalletNotifications(address, true, userId);
      } catch (notifError) {
        console.warn('Failed to enable notifications for wallet, but wallet was added successfully:', notifError);
        // Don't throw - wallet was added successfully, notification toggle can be done manually
      }
    }
  } catch (error) {
    console.error('Error adding wallet:', error);
    throw error;
  }
}

export async function getWalletsLastActive(wallets: string[]): Promise<WalletLastActiveResult[]> {
	try {
		if (!Array.isArray(wallets) || wallets.length === 0) {
			return [];
		}

		const response = await fetch(`${WALLET_TRACKER_API_URL}/api/wallets/last-active`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ wallets }),
		});

		const payload = await response.json().catch(() => null);

		if (!response.ok) {
			const message =
				payload?.error ||
				(response.statusText ? `HTTP ${response.status} ${response.statusText}` : 'Failed to fetch last active wallets');
			throw new Error(message);
		}

		if (!payload || typeof payload !== 'object' || payload.ok !== true || !Array.isArray(payload.data)) {
			throw new Error('Unexpected response while fetching last active wallets');
		}

		return payload.data as WalletLastActiveResult[];
	} catch (error) {
		console.error('Error fetching wallets last active timestamp:', error);
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
      const ct = response.headers.get('content-type') || '';
      const body = ct.includes('application/json') ? await response.json().catch(() => ({})) : await response.text().catch(() => '');
      const msg = typeof body === 'object' && body && (body as any).error ? (body as any).error : (typeof body === 'string' && body.trim().startsWith('<') ? `HTTP ${response.status} ${response.statusText}` : (typeof body === 'string' ? body : 'Failed to remove wallet'));
      throw new Error(msg || 'Failed to remove wallet');
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

// Toggle notifications for a wallet
export async function toggleWalletNotifications(
  address: string, 
  enabled: boolean, 
  userId?: string
): Promise<void> {
  try {
    const url = userId
      ? `${WALLET_TRACKER_API_URL}/api/watch/${encodeURIComponent(address)}/notifications?userId=${encodeURIComponent(userId)}`
      : `${WALLET_TRACKER_API_URL}/api/watch/${encodeURIComponent(address)}/notifications`;
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to toggle notifications');
    }
  } catch (error) {
    console.error('Error toggling notifications:', error);
    throw error;
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

// ===== Trade History Helpers =====

const parseNumeric = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeTradeHistoryRecord = (record: any): TradeEvent | null => {
  if (!record || typeof record !== 'object') return null;

  const wallet = record.wallet ?? record.owner ?? record.address;
  const mint = record.mint ?? record.token ?? record.mint_address;
  const tx =
    record.tx ??
    record.txSig ??
    record.signature ??
    record.transaction ??
    record.transaction_id ??
    record.id;

  if (typeof wallet !== 'string' || typeof mint !== 'string' || typeof tx !== 'string') {
    return null;
  }

  const sideValue = (record.side ?? record.action ?? '').toString().toLowerCase();
  const side: 'buy' | 'sell' = sideValue === 'sell' ? 'sell' : 'buy';

  const amount =
    parseNumeric(record.amount ?? record.size ?? record.quantity ?? record.tokenAmount) ?? 0;
  const solSpent = parseNumeric(record.sol_spent ?? record.solSpent);
  const priceUsd = parseNumeric(record.price_usd ?? record.priceUsd);
  const marketCapUsd = parseNumeric(record.market_cap_usd ?? record.marketCapUsd);

  const rawTimestamp =
    record.at ?? record.ts ?? record.timestamp ?? record.blockTime ?? record.time ?? null;
  let timestamp = parseNumeric(rawTimestamp);
  if (timestamp === null && typeof rawTimestamp === 'string') {
    const parsed = Date.parse(rawTimestamp);
    timestamp = Number.isFinite(parsed) ? parsed : null;
  }

  if (timestamp === null) {
    return null;
  }

  const timestampMs = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;

  return {
    type: 'trade',
    wallet,
    mint,
    pair_address: record.pair_address ?? record.pairAddress ?? record.poolId ?? undefined,
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
  options: TradeHistoryOptions = {}
): Promise<TradeEvent[]> {
  if (!Array.isArray(wallets) || wallets.length === 0) {
    return [];
  }

  try {
    const params = new URLSearchParams();
    const validWallets = wallets.filter(
      (wallet): wallet is string => typeof wallet === 'string' && wallet.trim().length > 0
    );

    validWallets.forEach((wallet) => {
      params.append('wallets', wallet);
    });

    validWallets.forEach((wallet) => {
      params.append('wallet', wallet);
    });

    if (options.limit !== undefined) {
      params.set('limit', String(options.limit));
    }
    if (options.windowMs !== undefined) {
      params.set('windowMs', String(options.windowMs));
    }

    const url = `${WALLET_TRACKER_API_URL}/api/history?${params.toString()}`;
    console.debug('Fetching wallet trade history', {
      url,
      wallets: [...validWallets],
      limit: options.limit,
      windowMs: options.windowMs,
    });
    const response = await fetch(url, { signal: options.signal });
    let payload: any = null;

    if (!response.ok) {
      try {
        payload = await response.json();
      } catch {
        payload = await response.text().catch(() => null);
      }
      console.error('Failed to fetch trade history:', {
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
    console.error('Error fetching wallet trade history:', error);
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
  const wsUrl = `${WALLET_TRACKER_WS_URL}/ws`;
  console.log('🔌 [WebSocket Factory] Creating connection', {
    url: wsUrl,
    envVar: process.env.NEXT_PUBLIC_WALLET_TRACKER_WS_URL,
    resolvedBase: WALLET_TRACKER_WS_URL,
    fullUrl: wsUrl
  });
  
  const ws = new WebSocket(wsUrl);
  let isAlive = true;
  let connectionEstablished = false;

  ws.onopen = () => {
    console.log('✅ [WebSocket Factory] Connection opened successfully!', {
      url: wsUrl,
      readyState: ws.readyState,
      protocol: ws.protocol,
      timestamp: new Date().toISOString()
    });
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
    console.error('❌ [WebSocket Factory] Error occurred!', {
      error,
      url: wsUrl,
      readyState: ws.readyState,
      connectionEstablished,
      timestamp: new Date().toISOString()
    });
    if (!connectionEstablished) {
      console.error('❌ [WebSocket Factory] Connection was never established!');
      console.error('📋 Troubleshooting checklist:');
      console.error('  1. Is the WebSocket server running?');
      console.error('  2. URL configured:', wsUrl);
      console.error('  3. ENV var NEXT_PUBLIC_WALLET_TRACKER_WS_URL:', process.env.NEXT_PUBLIC_WALLET_TRACKER_WS_URL);
      console.error('  4. Check network/firewall settings');
    }
  };

  ws.onclose = (event) => {
    console.log('🔌 [WebSocket Factory] Connection closed', {
      code: event.code,
      reason: event.reason || 'No reason provided',
      wasClean: event.wasClean,
      url: wsUrl,
      connectionEstablished,
      timestamp: new Date().toISOString()
    });
    isAlive = false;
    
    if (!connectionEstablished) {
      console.error('❌ [WebSocket Factory] Connection closed before being established!');
      console.error('Common causes:');
      console.error('  • WebSocket server not running');
      console.error('  • Wrong URL:', wsUrl);
      console.error('  • Network/firewall blocking connection');
      console.error('  • Server rejected connection');
    }
    
    onDisconnect?.();
  };

  const subscribe = (wallets: string[]) => {
    console.log('📡 [WebSocket Factory] Subscribe requested', {
      wallets: wallets.map(w => w.slice(0, 8) + '...'),
      count: wallets.length,
      readyState: ws.readyState,
      isOpen: ws.readyState === WebSocket.OPEN
    });
    
    if (ws.readyState === WebSocket.OPEN) {
      const message = { method: 'subscribe', wallets };
      ws.send(JSON.stringify(message));
      console.log('✅ [WebSocket Factory] Subscribe message sent');
    } else {
      console.error('❌ [WebSocket Factory] Cannot subscribe - WebSocket not open!', {
        readyState: ws.readyState,
        CONNECTING: WebSocket.CONNECTING,
        OPEN: WebSocket.OPEN,
        CLOSING: WebSocket.CLOSING,
        CLOSED: WebSocket.CLOSED
      });
    }
  };

  const unsubscribe = (wallets: string[]) => {
    console.log('📡 [WebSocket Factory] Unsubscribe requested', {
      wallets: wallets.map(w => w.slice(0, 8) + '...'),
      count: wallets.length,
      readyState: ws.readyState
    });
    
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ method: 'unsubscribe', wallets }));
      console.log('✅ [WebSocket Factory] Unsubscribe message sent');
    } else {
      console.warn('⚠️ [WebSocket Factory] Cannot unsubscribe - WebSocket not open');
    }
  };

  const close = () => {
    console.log('Closing WebSocket connection...');
    ws.close();
  };

  return { ws, subscribe, unsubscribe, close };
}
