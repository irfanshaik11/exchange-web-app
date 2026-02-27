import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { Token } from '../utils/db';
import { extractTokenImage } from '../utils/images';
import useTrendingWebSocket from '../hooks/useTrendingWebSocket';

interface WatchlistContextType {
  watchlist: Token[];
  isHydrated: boolean; // True after client-side hydration is complete
  addToWatchlist: (token: Token) => void;
  removeFromWatchlist: (tokenAddress: string) => void;
  isInWatchlist: (tokenAddress: string) => boolean;
  updateWatchlistToken: (token: Token) => void;
  refreshWatchlistToken: (tokenAddress: string) => Promise<void>;
}

const WatchlistContext = createContext<WatchlistContextType | undefined>(undefined);

const DEFAULT_WATCHLIST_COUNT = 10;

// Dismissed tokens — mints the user manually removed (never re-added by auto-refresh)
const WATCHLIST_DISMISSED_KEY = 'watchlist_dismissed';

// User-added tokens — mints the user explicitly starred (preserved across WS updates)
const WATCHLIST_USER_ADDED_KEY = 'watchlist_user_added';

// --- Dismissed set helpers ---

function getDismissedMints(): Set<string> {
  try {
    const raw = localStorage.getItem(WATCHLIST_DISMISSED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveDismissedMints(mints: Set<string>): void {
  try {
    localStorage.setItem(WATCHLIST_DISMISSED_KEY, JSON.stringify([...mints]));
  } catch {}
}

// --- User-added set helpers ---

function getUserAddedMints(): Set<string> {
  try {
    const raw = localStorage.getItem(WATCHLIST_USER_ADDED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch { return new Set(); }
}

function saveUserAddedMints(mints: Set<string>): void {
  try {
    localStorage.setItem(WATCHLIST_USER_ADDED_KEY, JSON.stringify([...mints]));
  } catch {}
}

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  // Start with empty array for SSR consistency - will hydrate from localStorage
  const [watchlist, setWatchlist] = useState<Token[]>([]);

  // Track hydration state to prevent flickering during SSR -> client transition
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage on mount (client-side only)
  useEffect(() => {
    try {
      const savedWatchlist = localStorage.getItem('watchlist');
      if (savedWatchlist) {
        const parsed = JSON.parse(savedWatchlist);
        if (Array.isArray(parsed)) {
          setWatchlist(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to parse watchlist from localStorage:', e);
    }
    // Mark as hydrated after reading localStorage
    setIsHydrated(true);
  }, []);

  // Save watchlist to localStorage whenever it changes (only after hydration)
  useEffect(() => {
    if (!isHydrated) return; // Don't save until hydrated to avoid overwriting with empty array
    try {
      localStorage.setItem('watchlist', JSON.stringify(watchlist));
    } catch (e) {
      console.error('Failed to save watchlist to localStorage:', e);
    }
  }, [watchlist, isHydrated]);

  // Live sync from trending WebSocket — singleton hook, no extra WS connection
  const { tokens: wsTokens } = useTrendingWebSocket({ timeframe: '1h', enabled: true });

  // Merge WS trending tokens into watchlist — preserve user-added tokens
  useEffect(() => {
    if (!isHydrated) return;
    if (wsTokens.length === 0) return;

    const dismissed = getDismissedMints();
    const userAdded = getUserAddedMints();

    // Build a lookup of WS tokens by mint for quick fresher-data access
    const wsByMint = new Map<string, Token>();
    for (const t of wsTokens) {
      const mint = (t as any).mint || '';
      if (mint) wsByMint.set(mint.toLowerCase(), t as any as Token);
    }

    setWatchlist(prev => {
      const result: Token[] = [];
      const seenMints = new Set<string>();

      // Phase 1: Preserve all user-added tokens
      for (const mint of userAdded) {
        if (dismissed.has(mint)) continue;
        const lowerMint = mint.toLowerCase();
        if (seenMints.has(lowerMint)) continue;

        // Prefer WS data (fresher prices), else keep existing entry from state
        const wsEntry = wsByMint.get(lowerMint);
        if (wsEntry) {
          seenMints.add(lowerMint);
          result.push(wsEntry);
        } else {
          // Keep the existing entry from current watchlist state
          const existing = prev.find(t => ((t as any).mint || '').toLowerCase() === lowerMint);
          if (existing) {
            seenMints.add(lowerMint);
            result.push(existing);
          }
        }
      }

      // Phase 2: Fill remaining slots with trending tokens
      // Each dismissed token reduces auto-fill capacity — user removals are respected
      const autoFillTarget = Math.max(result.length, DEFAULT_WATCHLIST_COUNT - dismissed.size);
      for (const t of wsTokens) {
        if (result.length >= autoFillTarget) break;
        const mint = (t as any).mint || '';
        if (!mint || dismissed.has(mint) || seenMints.has(mint.toLowerCase())) continue;
        const img = extractTokenImage(t as any);
        if (!img || !img.trim()) continue;
        seenMints.add(mint.toLowerCase());
        result.push(t as any as Token);
      }

      if (result.length === 0) return prev;

      // Shallow change detection: skip update if same tokens in same order with same prices
      if (prev.length === result.length) {
        let same = true;
        for (let i = 0; i < result.length; i++) {
          const pMint = ((prev[i] as any).mint || '').toLowerCase();
          const rMint = ((result[i] as any).mint || '').toLowerCase();
          const pPrice = (prev[i] as any).price_usd ?? (prev[i] as any).usd_price ?? 0;
          const rPrice = (result[i] as any).price_usd ?? (result[i] as any).usd_price ?? 0;
          if (pMint !== rMint || pPrice !== rPrice) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }

      return result;
    });
  }, [wsTokens, isHydrated]);

  const addToWatchlist = useCallback((token: Token) => {
    // Remove from dismissed set — user is explicitly adding it back
    const mintAddr = (token as any).mint || '';
    if (mintAddr) {
      const dismissed = getDismissedMints();
      if (dismissed.has(mintAddr)) {
        dismissed.delete(mintAddr);
        saveDismissedMints(dismissed);
      }

      // Persist as user-added so WS sync preserves it
      const userAdded = getUserAddedMints();
      userAdded.add(mintAddr);
      saveUserAddedMints(userAdded);
    }

    setWatchlist(prev => {
      const tokenPairAddr = token.pair_address || (token as any).mint || '';
      const tokenMintAddr = (token as any).mint || '';
      const isDuplicate = prev.some(t => {
        const pairAddr = t.pair_address || (t as any).mint || '';
        const tMintAddr = (t as any).mint || '';
        return (pairAddr && pairAddr === tokenPairAddr) || (tMintAddr && tMintAddr === tokenMintAddr);
      });
      if (!isDuplicate) {
        return [...prev, token];
      }
      return prev;
    });
  }, []);

  const removeFromWatchlist = useCallback((tokenAddress: string) => {
    // Find the token being removed so we can dismiss its mint
    setWatchlist(prev => {
      const removed = prev.find(token => {
        const pairAddr = token.pair_address || (token as any).mint || '';
        const mintAddr = (token as any).mint || '';
        return pairAddr === tokenAddress || mintAddr === tokenAddress;
      });

      // Add mint to dismissed set so auto-refresh won't re-add it
      if (removed) {
        const mint = (removed as any).mint || '';
        if (mint) {
          const dismissed = getDismissedMints();
          dismissed.add(mint);
          saveDismissedMints(dismissed);

          // Also remove from user-added set
          const userAdded = getUserAddedMints();
          if (userAdded.has(mint)) {
            userAdded.delete(mint);
            saveUserAddedMints(userAdded);
          }
        }
      }

      return prev.filter(token => {
        const pairAddr = token.pair_address || (token as any).mint || '';
        const mintAddr = (token as any).mint || '';
        return pairAddr !== tokenAddress && mintAddr !== tokenAddress;
      });
    });
  }, []);

  const isInWatchlist = useCallback((tokenAddress: string) => {
    return watchlist.some(token => {
      const pairAddr = token.pair_address || (token as any).mint || '';
      const mintAddr = (token as any).mint || '';
      return pairAddr === tokenAddress || mintAddr === tokenAddress;
    });
  }, [watchlist]);

  // Update an existing watchlist token with fresher data (price, change, etc.)
  const updateWatchlistToken = useCallback((token: Token) => {
    setWatchlist(prev => {
      const tokenPairAddr = token.pair_address || (token as any).mint || '';
      const tokenMintAddr = (token as any).mint || '';
      let updated = false;
      const next = prev.map((t) => {
        const pairAddr = t.pair_address || (t as any).mint || '';
        const mintAddr = (t as any).mint || '';
        if (pairAddr === tokenPairAddr || mintAddr === tokenMintAddr) {
          updated = true;
          return { ...t, ...token };
        }
        return t;
      });
      return updated ? next : prev;
    });
  }, []);

  // Fetch latest data for a token (Monad service) and update local entry
  const refreshWatchlistToken = useCallback(async (tokenAddress: string) => {
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
  }, [updateWatchlistToken]);

  return (
    <WatchlistContext.Provider value={useMemo(() => ({ watchlist, isHydrated, addToWatchlist, removeFromWatchlist, isInWatchlist, updateWatchlistToken, refreshWatchlistToken }), [watchlist, isHydrated, addToWatchlist, removeFromWatchlist, isInWatchlist, updateWatchlistToken, refreshWatchlistToken])}>
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
