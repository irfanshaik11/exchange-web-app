import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  createWalletTrackerWebSocket,
  type WalletTrackerWebSocket,
  type TradeEvent,
  getTrackedWallets,
  getWalletTradeHistory,
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
  const initialHistoryFetchedRef = useRef(false);
  
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

  // Reset history fetch flag when user changes
  useEffect(() => {
    initialHistoryFetchedRef.current = false;
  }, [user?.id]);

  // Fetch initial trade history from backend Redis cache (optional - doesn't block WebSocket)
  useEffect(() => {
    if (!user?.id || watchedWallets.length === 0 || initialHistoryFetchedRef.current) {
      return;
    }

    const fetchInitialTrades = async () => {
      try {
        initialHistoryFetchedRef.current = true;
        const walletAddresses = watchedWallets.map(w => w.address);
        
        const history = await Promise.race([
          getWalletTradeHistory(walletAddresses, {
            limit: HISTORY_LIMIT,
            windowMs: HISTORY_WINDOW_MS,
          }),
          new Promise<TradeEvent[]>((resolve) => setTimeout(() => resolve([]), 4000))
        ]);
        
        if (history.length > 0) {
          setLatestTrades(prev => mergeTrades(prev, history));
        }
      } catch (error) {
        // Silent fail - WebSocket will still work
      }
    };

    // Fetch after a delay to let WebSocket connect first
    const timeoutId = setTimeout(fetchInitialTrades, 1000);
    return () => clearTimeout(timeoutId);
  }, [user?.id, watchedWallets.length])

  // WebSocket connection for real-time wallet updates
  useEffect(() => {
    if (!user?.id) {
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
      const normalizedEvent = normalizeTradeForState(event);

      // Get token name/symbol FIRST and enrich the event before showing
      let tokenName = normalizedEvent.symbol || normalizedEvent.name;
      let tokenMetadataResolved = false;
      
      // Try to get from existing metadata cache
      if (!tokenName) {
        const cachedMetadata = tokenMetadata.get(normalizedEvent.mint);
        if (cachedMetadata?.symbol || cachedMetadata?.name) {
          tokenName = cachedMetadata.symbol || cachedMetadata.name;
          // Update the event with cached data
          normalizedEvent.symbol = cachedMetadata.symbol;
          normalizedEvent.name = cachedMetadata.name;
          tokenMetadataResolved = true;
        }
      }
      
      // If still no token name, fetch from backend
      if (!tokenName || !tokenMetadataResolved) {
        try {
          // Try to fetch from Go service first (most reliable for token names)
          const goServiceUrl = process.env.NEXT_PUBLIC_GO_SERVICE_URL;
          let tokenData = null;
          
          // Try search endpoint first
          try {
            const searchResponse = await fetch(`${goServiceUrl}/v1/token/search?mint=${normalizedEvent.mint}&limit=1`, {
              signal: AbortSignal.timeout(3000)
            });
            if (searchResponse.ok) {
              const searchData = await searchResponse.json();
              tokenData = Array.isArray(searchData) ? searchData[0] : (searchData.tokens?.[0] || null);
            }
          } catch (searchError) {
            // Silent fail
          }
          
          // Update token name and enrich the event with fetched data
          if (tokenData) {
            tokenName = tokenData.symbol || tokenData.name || tokenName;
            
            // IMPORTANT: Update the event object itself with fetched metadata
            normalizedEvent.symbol = tokenData.symbol || normalizedEvent.symbol;
            normalizedEvent.name = tokenData.name || normalizedEvent.name;
            
            // Also resolve pair_address while we're at it
            if (!normalizedEvent.pair_address) {
              normalizedEvent.pair_address = tokenData.pair_address || tokenData.poolId;
            }
            
            // Cache the metadata
            setTokenMetadata(prev => {
              const updated = new Map(prev);
              updated.set(normalizedEvent.mint, {
                symbol: tokenData.symbol,
                name: tokenData.name,
                image: tokenData.uri || tokenData.image || tokenData.logo,
                launchpad_protocol: tokenData.launchpad_protocol || tokenData.protocol,
                market_cap_usd: tokenData.market_cap_usd || tokenData.marketCapUsd || tokenData.fully_diluted_value,
              });
              return updated;
            });
          }
          
          // Fallback: try fetchTokenMetadata utility (only if Go service failed)
          if (!tokenName || tokenName === normalizedEvent.mint.slice(0, 8) + '...') {
            try {
              const { fetchTokenMetadata } = await import('~/utils/tokenMetadata');
              const meta = await fetchTokenMetadata(normalizedEvent.mint);
              if (meta?.symbol || meta?.name) {
                tokenName = meta.symbol || meta.name;
                // Update the event object
                normalizedEvent.symbol = meta.symbol || normalizedEvent.symbol;
                normalizedEvent.name = meta.name || normalizedEvent.name;
                // Update metadata state
                setTokenMetadata(prev => {
                  const updated = new Map(prev);
                  updated.set(normalizedEvent.mint, meta);
                  return updated;
                });
              }
            } catch (err) {
              // Silent fail
            }
          }
        } catch (error) {
          // Silent fail
        }
      }
      
      // Final fallback to shortened mint address
      if (!tokenName) {
        tokenName = normalizedEvent.mint.slice(0, 6) + '...';
      }

      // Resolve pair_address if not already present (for better navigation UX)
      if (!normalizedEvent.pair_address && normalizedEvent.mint) {
        try {
          // First try to search for the token to get its pair_address
          const searchResponse = await fetch(`/api/token-service/search?phrase=${encodeURIComponent(normalizedEvent.mint)}&limit=1`);
          
          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            if (searchData.tokens && searchData.tokens.length > 0) {
              const token = searchData.tokens[0];
              normalizedEvent.pair_address = token.pair_address || token.poolId;
            }
          }
          
          // Fallback to hydrate-pair if search didn't work
          if (!normalizedEvent.pair_address) {
            const hydrateResponse = await fetch('/api/token-service/hydrate-pair', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mint: normalizedEvent.mint }),
            });
            
            if (hydrateResponse.ok) {
              const hydrateData = await hydrateResponse.json();
              normalizedEvent.pair_address = hydrateData.pair_address || hydrateData.poolId;
            }
          }
        } catch (error) {
          // Silent fail
        }
      }

      // Add to latest trades list (keep last hour, max 50)
      setLatestTrades(prev => mergeTrades(prev, [normalizedEvent]));

      // Find wallet info for better notification
      const wallet = watchedWalletsRef.current.find(w => w.address === normalizedEvent.wallet);
      const walletName = wallet?.walletName || normalizedEvent.wallet.slice(0, 8) + '...';
      const side = normalizedEvent.side === 'buy' ? 'bought' : 'sold';
      
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
      setWsConnected(true);
      
      // Subscribe to all tracked wallets after connection is established
      if (watchedWalletsRef.current.length > 0 && connection) {
        setTimeout(() => {
          if (connection?.ws.readyState === WebSocket.OPEN) {
            const addresses = watchedWalletsRef.current.map(w => w.address);
            connection.subscribe(addresses);
            subscribedWalletsRef.current = addresses;
          }
        }, 100);
      }
    };

    const handleDisconnect = () => {
      setWsConnected(false);
      
      // Attempt to reconnect after 3 seconds
      reconnectTimeout = setTimeout(() => {
        initializeWebSocket();
      }, 3000);
    };

    const initializeWebSocket = () => {
      try {
        connection = createWalletTrackerWebSocket(
          handleTradeEvent,
          handleConnect,
          handleDisconnect
        );
        setWsConnection(connection);
      } catch (error) {
        console.error('WebSocket failed to initialize:', error);
      }
    };

    // Initialize WebSocket connection
    initializeWebSocket();

    // Cleanup on unmount or when user changes
    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (connection) {
        console.log('🔌 Closing WebSocket connection (cleanup)...');
        connection.close();
      }
      subscribedWalletsRef.current = [];
    };
  }, [user?.id]); // Only re-initialize when user changes, not when wallets change

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
      wsConnection.unsubscribe(toUnsubscribe);
    }

    if (toSubscribe.length > 0) {
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

