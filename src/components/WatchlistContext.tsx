import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { Token } from '../utils/db';
import { extractTokenImage } from '../utils/images';

interface WatchlistContextType {
  watchlist: Token[];
  addToWatchlist: (token: Token) => void;
  removeFromWatchlist: (tokenAddress: string) => void;
  isInWatchlist: (tokenAddress: string) => boolean;
  updateWatchlistToken: (token: Token) => void;
  refreshWatchlistToken: (tokenAddress: string) => Promise<void>;
}

const WatchlistContext = createContext<WatchlistContextType | undefined>(undefined);

// Key to track if we've already populated defaults (so we don't re-populate after user clears watchlist)
const DEFAULTS_POPULATED_KEY = 'watchlist_defaults_populated';
const DEFAULT_WATCHLIST_COUNT = 15;

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

  // Track if we've attempted to populate defaults
  const defaultsPopulatedRef = useRef(false);

  // Save watchlist to localStorage whenever it changes (but not on initial mount)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('watchlist', JSON.stringify(watchlist));
    } catch (e) {
      console.error('Failed to save watchlist to localStorage:', e);
    }
  }, [watchlist]);

  // Populate default watchlist with top tokens that have images (only on first visit)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (defaultsPopulatedRef.current) return;

    // Check if we've already populated defaults before (don't re-populate if user cleared watchlist)
    const alreadyPopulated = localStorage.getItem(DEFAULTS_POPULATED_KEY);
    if (alreadyPopulated) {
      defaultsPopulatedRef.current = true;
      return;
    }

    // Only populate if watchlist is empty
    if (watchlist.length > 0) {
      defaultsPopulatedRef.current = true;
      localStorage.setItem(DEFAULTS_POPULATED_KEY, 'true');
      return;
    }

    defaultsPopulatedRef.current = true;

    // Fetch top tokens from discover/pulse endpoint and filter for tokens with images
    const fetchDefaultTokens = async () => {
      try {
        // Fetch more tokens to ensure we get enough with valid images
        const response = await fetch('/api/token-service/pulse-new?limit=100&fresh=1', {
          headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) {
          console.warn('Failed to fetch default watchlist tokens');
          return;
        }

        const data = await response.json();
        const tokens: Token[] = Array.isArray(data) ? data : (data?.tokens || data?.data || []);

        // Filter tokens that have valid images and deduplicate by pair_address/mint
        const seenAddresses = new Set<string>();
        const tokensWithImages = tokens.filter((token: any) => {
          const imageUrl = extractTokenImage(token);
          if (!imageUrl || !imageUrl.trim().length) return false;

          // Deduplicate by pair_address or mint
          const tokenId = token.pair_address || token.mint || '';
          if (!tokenId || seenAddresses.has(tokenId)) return false;
          seenAddresses.add(tokenId);

          return true;
        });

        // Take the first N unique tokens with images
        const defaultTokens = tokensWithImages.slice(0, DEFAULT_WATCHLIST_COUNT);

        if (defaultTokens.length > 0) {
          setWatchlist(defaultTokens);
          localStorage.setItem(DEFAULTS_POPULATED_KEY, 'true');
          console.log(`Populated watchlist with ${defaultTokens.length} default tokens`);
        }
      } catch (error) {
        console.warn('Error fetching default watchlist tokens:', error);
      }
    };

    fetchDefaultTokens();
  }, [watchlist.length]);

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
