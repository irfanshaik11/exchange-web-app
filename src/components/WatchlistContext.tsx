import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { Token } from '../utils/db';
import { extractTokenImage } from '../utils/images';

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

// Key to track if we've already populated defaults (so we don't re-populate after user clears watchlist)
const DEFAULTS_POPULATED_KEY = 'watchlist_defaults_populated';
const DEFAULT_WATCHLIST_COUNT = 10;

// Dismissed tokens — mints the user manually removed (never re-added by auto-refresh)
const WATCHLIST_DISMISSED_KEY = 'watchlist_dismissed';

// 3-hour auto-refresh
const WATCHLIST_LAST_REFRESH_KEY = 'watchlist_last_refresh';
const WATCHLIST_REFRESH_INTERVAL = 3 * 60 * 60 * 1000; // 3 hours

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

// --- DexScreener trending → Token conversion ---

/** Map a DexScreener trending token to the Token shape the watchlist expects */
function dexScreenerTokenToWatchlistToken(raw: any): Token {
  // Map dex_id to launchpad_protocol (same logic as useDexScreenerTrending)
  let protocol = '';
  switch (raw.dex_id) {
    case 'pumpfun': protocol = 'pump'; break;
    case 'pumpswap': protocol = 'pumpamm'; break;
    case 'raydium': protocol = 'raydium'; break;
    case 'meteora': protocol = 'meteora'; break;
    case 'orca': protocol = 'orca'; break;
    default: protocol = raw.dex_id || ''; break;
  }

  return {
    mint: raw.mint || '',
    name: raw.name || raw.symbol || 'Unknown',
    symbol: raw.symbol || '',
    usd_price: raw.price_usd || 0,
    price_usd: raw.price_usd || 0,
    fully_diluted_value: raw.fdv || raw.market_cap_usd || 0,
    market_cap_usd: raw.market_cap_usd || raw.fdv || 0,
    total_liquidity_usd: raw.liquidity_usd || 0,
    logo: raw.image_url || '',
    image_url: raw.image_url || '',
    pair_address: raw.pair_address || '',
    launchpad_protocol: protocol,
    protocol: protocol,
    volume_5m: raw.volume_5m || 0,
    volume_1h: raw.volume_1h || 0,
    volume_6h: raw.volume_6h || 0,
    volume_24h: raw.volume_24h || 0,
    total_buys_5m: raw.total_buys_5m || 0,
    total_sells_5m: raw.total_sells_5m || 0,
    total_buys_1h: raw.total_buys_1h || 0,
    total_sells_1h: raw.total_sells_1h || 0,
    total_buys_6h: raw.total_buys_6h || 0,
    total_sells_6h: raw.total_sells_6h || 0,
    total_buys_24h: raw.total_buys_24h || 0,
    total_sells_24h: raw.total_sells_24h || 0,
  } as any as Token;
}

/**
 * Fetch top trending tokens from DexScreener endpoint (same source as Discover "Trending 2" tab).
 * Returns up to `limit` tokens, excluding dismissed mints and those without images.
 */
async function fetchDexScreenerTrending(dismissedMints: Set<string>, limit = DEFAULT_WATCHLIST_COUNT): Promise<Token[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_GO_SERVICE_URL || 'http://localhost:8085';
    const url = `${baseUrl}/v1/trending/dexscreener`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data)) return [];

    const result: Token[] = [];
    const seenAddrs = new Set<string>();
    const seenNames = new Set<string>();

    for (const raw of data) {
      if (result.length >= limit) break;

      const mint = (raw.mint || '').toLowerCase();
      if (!mint) continue;

      // Skip dismissed tokens
      if (dismissedMints.has(raw.mint || '')) continue;

      // Convert to Token shape
      const token = dexScreenerTokenToWatchlistToken(raw);

      // Must have image
      const imageUrl = extractTokenImage(token);
      if (!imageUrl || !imageUrl.trim()) continue;

      // Dedup by address and name
      const addr = (token.pair_address || (token as any).mint || '').toLowerCase();
      const name = ((token as any).symbol || token.name || '').toLowerCase().trim();
      if (!addr || !name) continue;
      if (seenAddrs.has(addr) || seenNames.has(name)) continue;

      seenAddrs.add(addr);
      seenNames.add(name);
      result.push(token);
    }

    return result;
  } catch (err) {
    console.warn('Failed to fetch DexScreener trending for watchlist:', err);
    return [];
  }
}

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  // Start with empty array for SSR consistency - will hydrate from localStorage
  const [watchlist, setWatchlist] = useState<Token[]>([]);

  // Track hydration state to prevent flickering during SSR -> client transition
  const [isHydrated, setIsHydrated] = useState(false);

  // Track if we've attempted to populate defaults
  const defaultsPopulatedRef = useRef(false);

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

  // Populate default watchlist from DexScreener trending (only on first visit)
  useEffect(() => {
    if (!isHydrated) return;
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

    (async () => {
      const dismissed = getDismissedMints();
      const tokens = await fetchDexScreenerTrending(dismissed);

      if (tokens.length > 0) {
        setWatchlist(tokens);
        localStorage.setItem(DEFAULTS_POPULATED_KEY, 'true');
        localStorage.setItem(WATCHLIST_LAST_REFRESH_KEY, String(Date.now()));
        console.log(`Populated watchlist with ${tokens.length} tokens from DexScreener trending`);
      }
    })();
  }, [watchlist.length, isHydrated]);

  // 3-hour auto-refresh: replace entire watchlist with fresh DexScreener trending data
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (!isHydrated) return;

    async function doRefresh() {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      try {
        const dismissed = getDismissedMints();
        const tokens = await fetchDexScreenerTrending(dismissed);
        if (tokens.length > 0) {
          setWatchlist(tokens);
          console.log(`Auto-refreshed watchlist with ${tokens.length} tokens from DexScreener trending`);
        }
        localStorage.setItem(WATCHLIST_LAST_REFRESH_KEY, String(Date.now()));
      } catch (err) {
        console.warn('Watchlist auto-refresh failed:', err);
      } finally {
        refreshingRef.current = false;
      }
    }

    // Check if an immediate refresh is needed (>3h since last refresh)
    const lastRefreshStr = localStorage.getItem(WATCHLIST_LAST_REFRESH_KEY);
    const lastRefresh = lastRefreshStr ? Number(lastRefreshStr) : 0;
    if (Date.now() - lastRefresh > WATCHLIST_REFRESH_INTERVAL) {
      // Only auto-refresh if we've done initial population before
      const alreadyPopulated = localStorage.getItem(DEFAULTS_POPULATED_KEY);
      if (alreadyPopulated) {
        doRefresh();
      }
    }

    // Set interval for future refreshes
    const intervalId = setInterval(() => {
      const alreadyPopulated = localStorage.getItem(DEFAULTS_POPULATED_KEY);
      if (alreadyPopulated) {
        doRefresh();
      }
    }, WATCHLIST_REFRESH_INTERVAL);

    return () => clearInterval(intervalId);
  }, [isHydrated]);

  const addToWatchlist = useCallback((token: Token) => {
    // Remove from dismissed set — user is explicitly adding it back
    const mintAddr = (token as any).mint || '';
    if (mintAddr) {
      const dismissed = getDismissedMints();
      if (dismissed.has(mintAddr)) {
        dismissed.delete(mintAddr);
        saveDismissedMints(dismissed);
      }
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
    <WatchlistContext.Provider value={{ watchlist, isHydrated, addToWatchlist, removeFromWatchlist, isInWatchlist, updateWatchlistToken, refreshWatchlistToken }}>
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
