import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Token } from '../utils/db';

interface WatchlistContextType {
  watchlist: Token[];
  addToWatchlist: (token: Token) => void;
  removeFromWatchlist: (tokenAddress: string) => void;
  isInWatchlist: (tokenAddress: string) => boolean;
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

  return (
    <WatchlistContext.Provider value={{ watchlist, addToWatchlist, removeFromWatchlist, isInWatchlist }}>
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