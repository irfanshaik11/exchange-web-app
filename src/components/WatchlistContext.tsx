import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Token } from '../utils/db';

interface WatchlistContextType {
  watchlist: Token[];
  addToWatchlist: (token: Token) => void;
  removeFromWatchlist: (tokenAddress: string) => void;
  isInWatchlist: (tokenAddress: string) => boolean;
  updateWatchlistToken: (token: Token) => void;
  refreshWatchlistToken: (tokenAddress: string) => Promise<void>;
}

const WatchlistContext = createContext<WatchlistContextType | undefined>(undefined);

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  // Initialize from localStorage to prevent empty state on first render
  const [watchlist, setWatchlist] = useState<Token[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const savedWatchlist = localStorage.getItem('watchlist');
      if (savedWatchlist) {
        return JSON.parse(savedWatchlist);
      }
    } catch (e) {
      console.error('Failed to parse watchlist from localStorage on init:', e);
    }
    return [];
  });

  // Save watchlist to localStorage whenever it changes (but not on initial mount)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('watchlist', JSON.stringify(watchlist));
    } catch (e) {
      console.error('Failed to save watchlist to localStorage:', e);
    }
  }, [watchlist]);

  const addToWatchlist = (token: Token) => {
    setWatchlist(prev => {
      const tokenPairAddr = token.pair_address || (token as any).mint || '';
      const tokenMintAddr = (token as any).mint || '';
      const isDuplicate = prev.some(t => {
        const pairAddr = t.pair_address || (t as any).mint || '';
        const mintAddr = (t as any).mint || '';
        return (pairAddr && pairAddr === tokenPairAddr) || (mintAddr && mintAddr === tokenMintAddr);
      });
      if (!isDuplicate) {
        return [...prev, token];
      }
      return prev;
    });
  };

  const removeFromWatchlist = (tokenAddress: string) => {
    setWatchlist(prev => prev.filter(token => {
      const pairAddr = token.pair_address || (token as any).mint || '';
      const mintAddr = (token as any).mint || '';
      return pairAddr !== tokenAddress && mintAddr !== tokenAddress;
    }));
  };

  const isInWatchlist = (tokenAddress: string) => {
    return watchlist.some(token => {
      const pairAddr = token.pair_address || (token as any).mint || '';
      const mintAddr = (token as any).mint || '';
      return pairAddr === tokenAddress || mintAddr === tokenAddress;
    });
  };

  // Update an existing watchlist token with fresher data (price, change, etc.)
  const updateWatchlistToken = (token: Token) => {
    setWatchlist(prev => {
      const tokenPairAddr = token.pair_address || (token as any).mint || '';
      const tokenMintAddr = (token as any).mint || '';
      let updated = false;
      const next = prev.map((t) => {
        const pairAddr = t.pair_address || (t as any).mint || '';
        const mintAddr = (t as any).mint || '';
        if (pairAddr === tokenPairAddr || mintAddr === tokenMintAddr) {
          updated = true;
          // Merge to preserve any fields that might not be present in the new token object
          return { ...t, ...token };
        }
        return t;
      });
      return updated ? next : prev;
    });
  };

  // Fetch latest data for a token (Monad service) and update local entry
  const refreshWatchlistToken = async (tokenAddress: string) => {
    if (!tokenAddress || typeof window === 'undefined') return;
    try {
      const baseUrl = process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL;
      if (!baseUrl) return;
      const url = `${baseUrl.replace(/\/$/, "")}/token?address=${encodeURIComponent(tokenAddress)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return;
      const data = await res.json();
      if (!data || typeof data !== "object") return;
      const normalized = {
        ...data,
        mint: data.mint || data.address || tokenAddress,
        price_usd: data.price_usd ?? data.usd_price ?? data.price,
        usd_price: data.usd_price ?? data.price_usd ?? data.price,
        market_cap_usd: data.market_cap_usd ?? data.fully_diluted_value ?? 0,
        fully_diluted_value: data.fully_diluted_value ?? data.market_cap_usd ?? 0,
        price_percent_change_1h: data.price_percent_change_1h ?? data.price_change_1h ?? data.price_percent_change_24h ?? data.price_change_24h ?? data.price24hChangePercent,
      } as any;
      updateWatchlistToken(normalized);
    } catch (e) {
      console.warn("Failed to refresh watchlist token", tokenAddress, e);
    }
  };

  return (
    <WatchlistContext.Provider value={{ watchlist, addToWatchlist, removeFromWatchlist, isInWatchlist, updateWatchlistToken, refreshWatchlistToken }}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  const context = useContext(WatchlistContext);
  if (context === undefined) {
    throw new Error('useWatchlist must be used within a WatchlistProvider');
  }
  return context;
} 
