import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  createWalletTrackerWebSocket,
  type WalletTrackerWebSocket,
  type TradeEvent,
  getTrackedWallets,
  type WatchWallet
} from '~/utils/walletTracking';
import { useUser } from './UserContext';

const HISTORY_LIMIT = 50;
const HISTORY_WINDOW_MS = 60 * 60 * 1000;

const LIVE_TRADES_CACHE_PREFIX = 'walletTracker:liveTrades';
const LIVE_TRADES_CACHE_MAX_ITEMS = HISTORY_LIMIT;
const LIVE_TRADES_CACHE_MAX_AGE_MS = HISTORY_WINDOW_MS;

const getCacheKey = (userId?: string) =>
  userId ? `${LIVE_TRADES_CACHE_PREFIX}:user:${userId}` : `${LIVE_TRADES_CACHE_PREFIX}:global`;

const ensureMilliseconds = (timestamp: number | null | undefined) => {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return Date.now();
  }
  return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
};

const normalizeTradeForState = (trade: TradeEvent): TradeEvent => ({
  ...trade,
  at: ensureMilliseconds(trade.at),
});

const pruneTrades = (trades: TradeEvent[]) => {
  const cutoff = Date.now() - LIVE_TRADES_CACHE_MAX_AGE_MS;
  const tradeByTx = new Map<string, TradeEvent>();

  for (const trade of trades) {
    const normalized = normalizeTradeForState(trade);
    if (normalized.at < cutoff) continue;
    const existing = tradeByTx.get(normalized.tx);
    if (!existing || normalized.at > existing.at) {
      tradeByTx.set(normalized.tx, normalized);
    }
  }

  return Array.from(tradeByTx.values())
    .sort((a, b) => b.at - a.at)
    .slice(0, LIVE_TRADES_CACHE_MAX_ITEMS);
};

const mergeTrades = (existing: TradeEvent[], additions: TradeEvent[]) => {
  if (!Array.isArray(additions) || additions.length === 0) {
    return pruneTrades(existing);
  }
  if (!Array.isArray(existing) || existing.length === 0) {
    return pruneTrades(additions);
  }
  return pruneTrades([...additions, ...existing]);
};

interface WalletTrackerContextValue {
  wsConnected: boolean;
  latestTrades: TradeEvent[];
  watchedWallets: WatchWallet[];
  refreshWatchedWallets: () => Promise<void>;
}

const WalletTrackerContext = createContext<WalletTrackerContextValue | undefined>(undefined);

export function useWalletTracker() {
  const context = useContext(WalletTrackerContext);
  if (!context) {
    throw new Error('useWalletTracker must be used within WalletTrackerProvider');
  }
  return context;
}

export function WalletTrackerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const [wsConnected, setWsConnected] = useState(false);
  const [latestTrades, setLatestTrades] = useState<TradeEvent[]>([]);
  const [watchedWallets, setWatchedWallets] = useState<WatchWallet[]>([]);
  const [wsConnection, setWsConnection] = useState<WalletTrackerWebSocket | null>(null);
  const [tokenMetadata, setTokenMetadata] = useState<Map<string, any>>(new Map());

  const watchedWalletsRef = useRef<WatchWallet[]>([]);
  const subscribedWalletsRef = useRef<string[]>([]);
  const hydrationRef = useRef(false);
  
  // Keep ref in sync with state
  useEffect(() => {
    watchedWalletsRef.current = watchedWallets;
  }, [watchedWallets]);

  // Load watched wallets
  const refreshWatchedWallets = async () => {
    if (!user?.id) return;
    
    try {
      const wallets = await getTrackedWallets(user.id);
      setWatchedWallets(wallets);
    } catch (error) {
      console.error('Failed to fetch watched wallets:', error);
    }
  };

  // Initial load of watched wallets
  useEffect(() => {
    if (user?.id) {
      refreshWatchedWallets();
    }
  }, [user?.id]);

  // WebSocket connection for real-time wallet updates
  useEffect(() => {
    if (!user?.id || watchedWallets.length === 0) {
      // Close connection if no wallets to watch
      if (wsConnection) {
        wsConnection.close();
        setWsConnection(null);
        setWsConnected(false);
      }
      subscribedWalletsRef.current = [];
      return;
    }

    let connection: WalletTrackerWebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const handleTradeEvent = async (event: TradeEvent) => {
      console.log('🔔 Trade event received:', event);

      const normalizedEvent = normalizeTradeForState(event);

      // Add to latest trades list (keep last hour, max 50)
      setLatestTrades(prev => mergeTrades(prev, [normalizedEvent]));

      // Find wallet info for better notification
      const wallet = watchedWalletsRef.current.find(w => w.address === normalizedEvent.wallet);
      const walletName = wallet?.walletName || normalizedEvent.wallet.slice(0, 8) + '...';
      const side = normalizedEvent.side === 'buy' ? 'bought' : 'sold';
      
      // Get token name - fetch from metadata if not in event
      let tokenName = normalizedEvent.symbol || normalizedEvent.name;
      if (!tokenName) {
        const metadata = tokenMetadata.get(normalizedEvent.mint);
        if (metadata?.symbol) {
          tokenName = metadata.symbol;
        } else {
          // Fetch metadata if not cached
          try {
            const { fetchTokenMetadata } = await import('~/utils/tokenMetadata');
            const meta = await fetchTokenMetadata(normalizedEvent.mint);
            tokenName = meta.symbol || normalizedEvent.mint.slice(0, 8) + '...';
            // Update metadata state
            setTokenMetadata(prev => {
              const updated = new Map(prev);
              updated.set(normalizedEvent.mint, meta);
              return updated;
            });
          } catch (err) {
            tokenName = normalizedEvent.mint.slice(0, 8) + '...';
          }
        }
      }
      
      // Format SOL amount
      let amountDisplay = '';
      if (normalizedEvent.sol_spent !== null && normalizedEvent.sol_spent !== undefined) {
        const solAmount = Math.abs(normalizedEvent.sol_spent);
        if (solAmount >= 1) {
          amountDisplay = `${solAmount.toFixed(2)} SOL`;
        } else if (solAmount >= 0.01) {
          amountDisplay = `${solAmount.toFixed(3)} SOL`;
        } else {
          amountDisplay = `${solAmount.toFixed(4)} SOL`;
        }
      }
      
      // Show toast notification with custom styling
      toast.custom(
        () => (
          <div className="animate-fade-in fixed top-8 left-1/2 z-50 w-fit -translate-x-1/2 rounded-lg border border-emerald-400/50 bg-gradient-to-r from-emerald-500 to-green-500 px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-emerald-400/30">
            {walletName} {side}{' '}
            <span className="font-bold">{tokenName}</span>
            {amountDisplay ? ` for ${amountDisplay}` : ''}
          </div>
        ),
        { duration: 5000, position: 'top-center' }
      );
    };

    const handleConnect = () => {
      console.log('✅ WebSocket connected successfully');
      setWsConnected(true);
      
      // Subscribe to all tracked wallets after connection is established
      if (watchedWallets.length > 0 && connection) {
        // Small delay to ensure WebSocket is fully ready
        setTimeout(() => {
          if (connection?.ws.readyState === WebSocket.OPEN) {
            const addresses = watchedWallets.map(w => w.address);
            connection.subscribe(addresses);
            console.log('📡 Subscribed to wallets:', addresses.map(a => a.slice(0, 8) + '...'));
            subscribedWalletsRef.current = addresses;
          }
        }, 100);
      }
    };

    const handleDisconnect = () => {
      console.log('⚠️ WebSocket disconnected, will attempt to reconnect...');
      setWsConnected(false);
      
      // Attempt to reconnect after 3 seconds
      reconnectTimeout = setTimeout(() => {
        console.log('🔄 Attempting to reconnect WebSocket...');
        initializeWebSocket();
      }, 3000);
    };

    const initializeWebSocket = () => {
      try {
        console.log('🔌 Initializing WebSocket connection...');
        connection = createWalletTrackerWebSocket(
          handleTradeEvent,
          handleConnect,
          handleDisconnect
        );
        setWsConnection(connection);
      } catch (error) {
        console.error('❌ Failed to initialize WebSocket:', error);
      }
    };

    // Initialize WebSocket connection
    initializeWebSocket();

    // Cleanup on unmount or when wallets change
    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (connection) {
        console.log('🔌 Closing WebSocket connection...');
        connection.close();
      }
      subscribedWalletsRef.current = [];
    };
  }, [user?.id, watchedWallets.length]); // Re-initialize when user changes or wallet count changes

  // Update subscriptions when wallet list changes (without recreating connection)
  useEffect(() => {
    if (!wsConnection || !wsConnected) {
      return;
    }

    const addresses = watchedWallets.map(w => w.address);
    const previous = subscribedWalletsRef.current;

    const toUnsubscribe = previous.filter(addr => !addresses.includes(addr));
    const toSubscribe = addresses.filter(addr => !previous.includes(addr));

    if (toUnsubscribe.length > 0) {
      console.log('🚫 Unsubscribing from wallets:', toUnsubscribe.map(a => a.slice(0, 8) + '...'));
      wsConnection.unsubscribe(toUnsubscribe);
    }

    if (toSubscribe.length > 0) {
      console.log('🔄 Subscribing to wallets:', toSubscribe.map(a => a.slice(0, 8) + '...'));
      wsConnection.subscribe(toSubscribe);
    }

    subscribedWalletsRef.current = addresses;
  }, [watchedWallets, wsConnected, wsConnection]);

  // Hydrate cached trades from localStorage (user specific with global fallback)
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const userKey = user?.id ? getCacheKey(user.id) : null;
      const globalKey = getCacheKey();
      const raw =
        (userKey ? window.localStorage.getItem(userKey) : null) ??
        window.localStorage.getItem(globalKey);

      if (!raw) {
        hydrationRef.current = true;
        return;
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        hydrationRef.current = true;
        return;
      }

      const trades = parsed
        .map((trade): TradeEvent | null => {
          if (!trade || typeof trade !== 'object') return null;
          try {
            return normalizeTradeForState(trade as TradeEvent);
          } catch {
            return null;
          }
        })
        .filter((trade): trade is TradeEvent => Boolean(trade));

      if (trades.length > 0) {
        setLatestTrades(prev => mergeTrades(prev, trades));
      }
    } catch (error) {
      console.error('Failed to hydrate live trades cache:', error);
    } finally {
      hydrationRef.current = true;
    }
  }, [user?.id]);

  // Periodically prune old trades to keep list within rolling window
  useEffect(() => {
    const interval = setInterval(() => {
      setLatestTrades((prev) => pruneTrades(prev));
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  // Persist latest trades to localStorage
  useEffect(() => {
    if (typeof window === 'undefined' || !hydrationRef.current) {
      return;
    }

    try {
      const pruned = pruneTrades(latestTrades);

      if (pruned.length === 0) {
        window.localStorage.removeItem(getCacheKey());
        if (user?.id) {
          window.localStorage.removeItem(getCacheKey(user.id));
        }
        return;
      }

      const payload = JSON.stringify(pruned);

      window.localStorage.setItem(getCacheKey(), payload);
      if (user?.id) {
        window.localStorage.setItem(getCacheKey(user.id), payload);
      }
    } catch (error) {
      console.error('Failed to persist live trades cache:', error);
    }
  }, [latestTrades, user?.id]);

  const value: WalletTrackerContextValue = {
    wsConnected,
    latestTrades,
    watchedWallets,
    refreshWatchedWallets,
  };

  return (
    <WalletTrackerContext.Provider value={value}>
      {children}
    </WalletTrackerContext.Provider>
  );
}

