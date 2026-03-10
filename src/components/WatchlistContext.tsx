import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Token } from '../utils/db';
import { extractTokenImage } from '../utils/images';
import useTrendingWebSocket from '../hooks/useTrendingWebSocket';
import useWatchlistWebSocket from '../hooks/useWatchlistWebSocket';

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

// Robust mint extraction — same fallback chain used for subscriptions, lookups, and overlay.
// Defined outside the component so it never changes reference (no useCallback needed).
function getMint(t: any): string {
  return t?.mint || t?.mint_address || t?.contractAddress || '';
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

  // Dedicated watchlist WebSocket — OHLCV-sourced live price/MC for all watchlist tokens
  const watchlistMints = useMemo(() =>
    watchlist.map(getMint).filter(Boolean),
    [watchlist]
  );
  const { tokens: liveWatchlistData } = useWatchlistWebSocket(watchlistMints);

  // Keep latest OHLCV data in a ref so the trending merge effect can read it
  // without adding it as a dependency (avoids unnecessary merge re-runs).
  const liveWatchlistRef = useRef(liveWatchlistData);
  useEffect(() => { liveWatchlistRef.current = liveWatchlistData; }, [liveWatchlistData]);

  // Merge WS trending tokens into watchlist — preserve user-added tokens
  useEffect(() => {
    if (!isHydrated) return;
    if (wsTokens.length === 0) return;

    const dismissed = getDismissedMints();
    const userAdded = getUserAddedMints();

    // Build a lookup of WS tokens by mint for quick fresher-data access
    const wsByMint = new Map<string, Token>();
    for (const t of wsTokens) {
      const mint = getMint(t);
      if (mint) wsByMint.set(mint.toLowerCase(), t as any as Token);
    }

    setWatchlist(prev => {
      const result: Token[] = [];
      const seenMints = new Set<string>();

      // Build a lookup of existing tokens by mint for quick access
      const prevByMint = new Map<string, Token>();
      for (const t of prev) {
        const m = getMint(t).toLowerCase();
        if (m) prevByMint.set(m, t);
      }

      // Phase 1: Preserve all user-added tokens
      // Always prefer existing entry (has OHLCV-sourced prices from watchlist WS).
      // Only use trending data as initial metadata when token first appears.
      for (const mint of userAdded) {
        if (dismissed.has(mint)) continue;
        const lowerMint = mint.toLowerCase();
        if (seenMints.has(lowerMint)) continue;

        const existing = prevByMint.get(lowerMint);
        if (existing) {
          seenMints.add(lowerMint);
          result.push(existing);
        } else {
          // Token not yet in watchlist — use trending data for initial metadata
          const wsEntry = wsByMint.get(lowerMint);
          if (wsEntry) {
            seenMints.add(lowerMint);
            result.push(wsEntry);
          }
        }
      }

      // Phase 2: Fill remaining slots with trending tokens (composition only).
      // Prefer existing entries so watchlist WS prices are preserved.
      const autoFillTarget = Math.max(result.length, DEFAULT_WATCHLIST_COUNT - dismissed.size);
      for (const t of wsTokens) {
        if (result.length >= autoFillTarget) break;
        const mint = getMint(t);
        if (!mint || dismissed.has(mint) || seenMints.has(mint.toLowerCase())) continue;
        const img = extractTokenImage(t as any);
        if (!img || !img.trim()) continue;
        seenMints.add(mint.toLowerCase());
        // Use existing entry if we already have it (preserves OHLCV prices)
        const existing = prevByMint.get(mint.toLowerCase());
        if (existing) {
          result.push(existing);
        } else {
          // New trending token — zero out price/MC fields so the watchlist WS
          // provides authoritative data on its next 1s tick (prevents stale trending prices).
          const newToken = {
            ...(t as any as Token),
            price_usd: 0,
            usd_price: 0,
            market_cap_usd: 0,
            fully_diluted_value: 0,
          };
          result.push(newToken);
        }
      }

      if (result.length === 0) return prev;

      // Phase 3: Apply OHLCV prices from dedicated watchlist WS (more accurate than trending).
      // Without this, every trending tick would overwrite the OHLCV prices that the overlay
      // effect applied, causing prices to flip between data sources.
      const liveRef = liveWatchlistRef.current;
      if (liveRef.size > 0) {
        for (let i = 0; i < result.length; i++) {
          const rMint = getMint(result[i]);
          if (!rMint) continue;

          const live = liveRef.get(rMint);
          if (live && live.price_usd > 0) {
            result[i] = {
              ...result[i],
              price_usd: live.price_usd,
              usd_price: live.price_usd,
              market_cap_usd: live.market_cap_usd > 0
                ? live.market_cap_usd
                : ((result[i] as any).market_cap_usd || (result[i] as any).fully_diluted_value || 0),
              fully_diluted_value: live.market_cap_usd > 0
                ? live.market_cap_usd
                : ((result[i] as any).fully_diluted_value || (result[i] as any).market_cap_usd || 0),
              price_percent_change_1h: live.price_change_1h,
              price_change_1h: live.price_change_1h,
              total_liquidity_usd: live.liquidity_usd,
              liquidity_usd: live.liquidity_usd,
            } as any;
          }
        }
      }

      // Shallow change detection: skip update if same tokens in same order with same prices/MC
      if (prev.length === result.length) {
        let same = true;
        for (let i = 0; i < result.length; i++) {
          const pMint = getMint(prev[i]).toLowerCase();
          const rMint = getMint(result[i]).toLowerCase();
          const pPrice = (prev[i] as any).price_usd ?? (prev[i] as any).usd_price ?? 0;
          const rPrice = (result[i] as any).price_usd ?? (result[i] as any).usd_price ?? 0;
          const pMc = (prev[i] as any).market_cap_usd ?? (prev[i] as any).fully_diluted_value ?? 0;
          const rMc = (result[i] as any).market_cap_usd ?? (result[i] as any).fully_diluted_value ?? 0;
          if (pMint !== rMint || pPrice !== rPrice || pMc !== rMc) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }

      return result;
    });
  }, [wsTokens, isHydrated]);

  // Live price overlay from dedicated watchlist WebSocket (OHLCV-sourced).
  // Runs independently of trending WS — fires on every watchlist WS update.
  useEffect(() => {
    if (!isHydrated) return;
    if (liveWatchlistData.size === 0) return;

    setWatchlist(prev => {
      if (prev.length === 0) return prev;

      let hasChanges = false;
      const result = prev.map(token => {
        const mint = getMint(token);
        if (!mint) return token;

        const liveData = liveWatchlistData.get(mint);
        if (!liveData || liveData.price_usd <= 0) return token;

        // Check if price actually changed before creating a new object
        const currentPrice = (token as any).price_usd ?? (token as any).usd_price ?? 0;
        const currentMc = (token as any).market_cap_usd ?? (token as any).fully_diluted_value ?? 0;
        if (currentPrice === liveData.price_usd && currentMc === liveData.market_cap_usd) {
          return token;
        }

        hasChanges = true;
        return {
          ...token,
          price_usd: liveData.price_usd,
          usd_price: liveData.price_usd,
          market_cap_usd: liveData.market_cap_usd > 0
            ? liveData.market_cap_usd
            : ((token as any).market_cap_usd || (token as any).fully_diluted_value || 0),
          fully_diluted_value: liveData.market_cap_usd > 0
            ? liveData.market_cap_usd
            : ((token as any).fully_diluted_value || (token as any).market_cap_usd || 0),
          price_percent_change_1h: liveData.price_change_1h,
          price_change_1h: liveData.price_change_1h,
          total_liquidity_usd: liveData.liquidity_usd,
          liquidity_usd: liveData.liquidity_usd,
        } as any;
      });

      return hasChanges ? result : prev;
    });
  }, [liveWatchlistData, isHydrated]);

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

  // Update an existing watchlist token with fresher data (e.g. from refreshWatchlistToken).
  // No longer called from TradeHeader — watchlist WS is the single source of truth for prices.
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
