import React, { useMemo } from 'react';
import { formatSmartNumber } from '~/utils/db';
import useSolanaTokenWebSocket, { type SolanaTopTrader } from '../../hooks/useSolanaTokenWebSocket';
import type { Token } from '~/utils/db';
import { FaExternalLinkAlt, FaCrown, FaBullseye, FaLeaf, FaLink, FaStar } from 'react-icons/fa';

interface CodexTopTradersProps {
  token: Token | null;
  pairAddress?: string; // Fallback pair address when token doesn't have mint
}

function getAge(timestamp: number) {
  const now = Date.now() / 1000;
  const diffSeconds = now - timestamp;
  const diffMins = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffSeconds / 3600);
  const diffDays = Math.floor(diffSeconds / 86400);
  
  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  return `${diffMins}m`;
}

function shortAddr(addr: string) {
  if (!addr) return '';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function getTraderIcon(index: number) {
  const icons = [
    <FaCrown className="text-yellow-400" />,
    <FaStar className="text-pink-400" />,
    <FaBullseye className="text-blue-400" />,
    <FaLeaf className="text-green-400" />,
    <FaLink className="text-gray-400" />,
  ];
  return icons[index % icons.length];
}

function formatVolume(volumeUsd: string) {
  const volume = parseFloat(volumeUsd);
  if (volume >= 1000000) {
    return `${(volume / 1000000).toFixed(1)}M`;
  } else if (volume >= 1000) {
    return `${(volume / 1000).toFixed(1)}K`;
  }
  return volume.toFixed(0);
}

function formatPrice(amountUsd: string, tokenAmount: string) {
  const usd = parseFloat(amountUsd);
  const tokens = parseFloat(tokenAmount);
  if (tokens === 0) return '$0';
  
  const price = usd / tokens;
  if (price >= 1000) {
    return `$${(price / 1000).toFixed(1)}K`;
  }
  return `$${price.toFixed(2)}`;
}

const CodexTopTraders: React.FC<CodexTopTradersProps> = ({ token, pairAddress }) => {
  // Client-side localStorage cache for top traders (persists across page reloads)
  const CACHE_KEY_PREFIX = 'codex_top_traders_cache_';
  const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes cache expiry
  
  const getCacheKey = (mint: string) => {
    return `${CACHE_KEY_PREFIX}${mint}`;
  };

  // Load cached traders from localStorage on mount
  const [cachedTradersFromStorage, setCachedTradersFromStorage] = React.useState<any[]>(() => {
    if (!token?.mint || typeof window === 'undefined') return [];
    
    try {
      const cacheKey = getCacheKey(token.mint);
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const now = Date.now();
        if (parsed.timestamp && (now - parsed.timestamp) < CACHE_EXPIRY_MS) {
          return parsed.traders || [];
        } else {
          localStorage.removeItem(cacheKey);
        }
      }
    } catch (error) {
      console.error('[CodexTopTraders] Error loading cache:', error);
    }
    return [];
  });

  // Reload cache when mint changes
  React.useEffect(() => {
    if (!token?.mint || typeof window === 'undefined') {
      setCachedTradersFromStorage([]);
      return;
    }
    
    try {
      const cacheKey = getCacheKey(token.mint);
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const now = Date.now();
        if (parsed.timestamp && (now - parsed.timestamp) < CACHE_EXPIRY_MS) {
          setCachedTradersFromStorage(parsed.traders || []);
        } else {
          localStorage.removeItem(cacheKey);
          setCachedTradersFromStorage([]);
        }
      } else {
        setCachedTradersFromStorage([]);
      }
    } catch (error) {
      console.error('[CodexTopTraders] Error reloading cache:', error);
      setCachedTradersFromStorage([]);
    }
  }, [token?.mint]);

  // Save traders to localStorage cache
  const saveToCache = React.useCallback((traders: any[], mint: string) => {
    if (!mint || typeof window === 'undefined' || traders.length === 0) return;
    
    try {
      const cacheKey = getCacheKey(mint);
      const cacheData = {
        traders,
        timestamp: Date.now(),
        mint,
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (error) {
      console.error('[CodexTopTraders] Error saving to cache:', error);
      // If storage is full, try to clear old entries
      try {
        const keys = Object.keys(localStorage);
        const oldCacheKeys = keys.filter(k => k.startsWith(CACHE_KEY_PREFIX));
        if (oldCacheKeys.length > 10) {
          const sorted = oldCacheKeys.map(key => {
            try {
              const item = localStorage.getItem(key);
              return {
                key,
                timestamp: item ? (JSON.parse(item).timestamp || 0) : 0,
              };
            } catch {
              return { key, timestamp: 0 };
            }
          }).sort((a, b) => a.timestamp - b.timestamp);
          sorted.slice(0, 3).forEach(({ key }) => localStorage.removeItem(key));
        }
      } catch (clearError) {
        console.error('[CodexTopTraders] Error clearing old cache:', clearError);
      }
    }
  }, []);

  // Use mint if available, fallback to pair_address, then fallback to pairAddress prop
  const mintForWebSocket = token?.mint || token?.pair_address || pairAddress;

  // Only show skeleton if we have absolutely no address to work with
  const shouldShowSkeleton = !mintForWebSocket;

  // Debug logging
  console.log('[CodexTopTraders] Debug:', {
    hasToken: !!token,
    tokenMint: token?.mint,
    tokenPairAddress: token?.pair_address,
    propPairAddress: pairAddress,
    mintForWebSocket,
    shouldShowSkeleton,
  });

  // Use WebSocket for top traders (only source - no Codex fallback)
  const { topTraders: wsTopTraders, loading: wsLoading, error: wsError } = useSolanaTokenWebSocket({
    mintAddress: mintForWebSocket,
    enabled: !!mintForWebSocket,
  });

  // Normalize WebSocket top traders to match Codex format
  const normalizedWsTraders = useMemo(() => {
    if (!wsTopTraders || wsTopTraders.length === 0) return [];

    const SOL_PRICE = 200; // Approximate SOL price

    return wsTopTraders.map((t: SolanaTopTrader) => ({
      walletAddress: t.wallet_address,
      amountBoughtUsd: String(t.total_bought_sol * SOL_PRICE),
      amountSoldUsd: String(t.total_sold_sol * SOL_PRICE),
      volumeUsd: String((t.total_bought_sol + t.total_sold_sol) * SOL_PRICE),
      realizedProfitUsd: String(t.realized_pnl * SOL_PRICE),
      realizedProfitPercentage: t.realized_pnl > 0 && t.total_bought_sol > 0
        ? t.realized_pnl / t.total_bought_sol
        : 0,
      tokenBalance: String(t.remaining_tokens),
      lastTransactionAt: t.last_activity_at
        ? Math.floor(new Date(t.last_activity_at).getTime() / 1000)
        : 0,
      tokenAmountBought: String(t.total_bought_tokens),
      tokenAmountSold: String(t.total_sold_tokens),
      buys: t.buy_count,
      sells: t.sell_count,
      remainingPercent: t.remaining_percent,
    }));
  }, [wsTopTraders]);

  // Use WebSocket data only (no Codex fallback)
  const traders = normalizedWsTraders;
  const isLoading = wsLoading;
  const error = wsError;

  // Use cached traders if available, otherwise use fetched traders
  const displayTraders = React.useMemo(() => {
    if (traders.length > 0) {
      return traders;
    }
    return cachedTradersFromStorage;
  }, [traders, cachedTradersFromStorage]);

  // Save to cache when traders update
  React.useEffect(() => {
    if (token?.mint && traders.length > 0) {
      saveToCache(traders, token.mint);
    }
  }, [traders, token?.mint, saveToCache]);

  // Only show loading if we don't have any traders at all (not even cached ones)
  const showLoading = isLoading && displayTraders.length === 0 && cachedTradersFromStorage.length === 0;

  // Only show skeleton if we have absolutely no token data (not even optimistic)
  if (shouldShowSkeleton) {
    return (
      <div className="flex-1 min-h-0 p-4">
        <div className="animate-pulse">
          <div className="h-6 w-32 bg-neutral-700 rounded mb-4" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-neutral-700 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      
      {error && (
        <div className="mb-4 p-2 bg-red-900/20 border border-red-500/30 rounded-lg">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}

      <div className="overflow-y-auto max-h-196 pb-25">
        <table className="w-full text-xs">
        <thead>
          <tr className="text-neutral-400 border-b border-neutral-800">
            <th className="px-2 py-2 text-left">Wallet</th>
            <th className="px-2 py-2 text-left">Bought (Avg Buy)</th>
            <th className="px-2 py-2 text-left">Sold (Avg Sell)</th>
            <th className="px-2 py-2 text-left">PnL</th>
            <th className="px-2 py-2 text-left">Remaining</th>
            <th className="px-2 py-2 text-left">Funding</th>
          </tr>
        </thead>
        <tbody>
          {showLoading ? (
            <tr>
              <td colSpan={6} className="text-center py-6 text-neutral-500">
                Loading top traders...
              </td>
            </tr>
          ) : !displayTraders || displayTraders.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-center py-6 text-neutral-500">
                No top traders found.
              </td>
            </tr>
          ) : (
            displayTraders.map((trader, idx) => {
              const boughtUsd = parseFloat(trader.amountBoughtUsd);
              const soldUsd = parseFloat(trader.amountSoldUsd);
              const volumeUsd = parseFloat(trader.volumeUsd);
              const realizedProfit = parseFloat(trader.realizedProfitUsd);
              const realizedProfitPct = trader.realizedProfitPercentage * 100;
              const tokenBalance = parseFloat(trader.tokenBalance);
              const lastActive = getAge(trader.lastTransactionAt);
              const wallet = shortAddr(trader.walletAddress);
              
              // Calculate average buy/sell prices
              const avgBuyPrice = formatPrice(trader.amountBoughtUsd, trader.tokenAmountBought);
              const avgSellPrice = formatPrice(trader.amountSoldUsd, trader.tokenAmountSold);
              
              return (
                <tr key={trader.walletAddress} className="border-b border-neutral-800 hover:bg-neutral-800/60">
                  <td className="px-2 py-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-neutral-500">{idx + 1}</span>
                      <div className="flex items-center space-x-1">
                        <span className="text-neutral-500">⚙️</span>
                        <span className="text-neutral-500">🔗</span>
                      </div>
                      <span className="text-white font-mono">{wallet}</span>
                      <div className="flex items-center">
                        {getTraderIcon(idx)}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div>
                      <div className="text-emerald-400 font-semibold">${formatSmartNumber(boughtUsd)}</div>
                      <div className="text-neutral-500">({avgBuyPrice})</div>
                      <div className="text-neutral-500">{formatVolume(trader.volumeUsd)} / {trader.buys}</div>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div>
                      <div className="text-red-400 font-semibold">${formatSmartNumber(soldUsd)}</div>
                      <div className="text-neutral-500">({avgSellPrice})</div>
                      <div className="text-neutral-500">{formatVolume(trader.volumeUsd)} / {trader.sells}</div>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className={`font-semibold ${realizedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {realizedProfit >= 0 ? '+' : ''}${formatSmartNumber(realizedProfit)}
                    </div>
                    <div className="text-neutral-500">{realizedProfitPct.toFixed(2)}%</div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="text-neutral-400">
                      ${formatSmartNumber(tokenBalance)} 0%
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center space-x-1">
                      <span className="text-neutral-500">↗️</span>
                      <span className="text-white font-mono">{shortAddr(trader.walletAddress)}</span>
                    </div>
                    <div className="text-neutral-500">{lastActive}</div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
};

export default CodexTopTraders;
