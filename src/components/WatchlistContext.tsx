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
const MIN_WATCHLIST_COUNT = 5;

// Multiple token sources in priority order — trending first (most established), then migrated, final stretch, new
const TOKEN_SOURCES = [
  '/api/token-service/pulse-trending?timeframe=24h&limit=50&fresh=1',
  '/api/token-service/pulse-migrated?limit=50&fresh=1',
  '/api/token-service/pulse-final-stretch?limit=50&fresh=1',
  '/api/token-service/pulse-new?limit=100&fresh=1',
];

/**
 * Fetch tokens from a single endpoint, normalizing various response formats.
 */
async function fetchTokensFromEndpoint(url: string): Promise<Token[]> {
  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000), // 8s timeout per endpoint
    });
    if (!response.ok) return [];
    const data = await response.json();
    // Handle various response shapes
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.tokens)) return data.tokens;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.data?.tokens)) return data.data.tokens;
    return [];
  } catch {
    return [];
  }
}

/**
 * Deduplicate and filter tokens: must have an address, a name/symbol, and an image URL.
 * No expensive image load validation — just check the URL string exists.
 */
function filterUniqueTokensWithImages(
  tokens: Token[],
  existingAddrs: Set<string>,
  existingNames: Set<string>,
  limit: number,
): Token[] {
  const result: Token[] = [];
  for (const token of tokens) {
    if (result.length >= limit) break;

    const addr = (token.pair_address || (token as any).mint || '').toLowerCase();
    const name = ((token as any).symbol || (token as any).name || '').toLowerCase().trim();
    const imageUrl = extractTokenImage(token);

    // Must have address, name, and image
    if (!addr || !name || !imageUrl || !imageUrl.trim()) continue;

    // Skip duplicates
    if (existingAddrs.has(addr) || existingNames.has(name)) continue;

    existingAddrs.add(addr);
    existingNames.add(name);
    result.push(token);
  }
  return result;
}

/**
 * Fetch tokens from multiple endpoints until we have enough.
 * Tries each source in order, collecting unique tokens until the target count is reached.
 */
async function fetchTokensFromMultipleSources(
  needed: number,
  existingAddrs: Set<string>,
  existingNames: Set<string>,
): Promise<Token[]> {
  const collected: Token[] = [];

  for (const url of TOKEN_SOURCES) {
    if (collected.length >= needed) break;

    const tokens = await fetchTokensFromEndpoint(url);
    const filtered = filterUniqueTokensWithImages(
      tokens,
      existingAddrs,
      existingNames,
      needed - collected.length,
    );
    collected.push(...filtered);
  }

  return collected;
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

  // Populate default watchlist from multiple token sources (only on first visit)
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
      const tokens = await fetchTokensFromMultipleSources(
        DEFAULT_WATCHLIST_COUNT,
        new Set<string>(),
        new Set<string>(),
      );

      if (tokens.length > 0) {
        setWatchlist(tokens);
        localStorage.setItem(DEFAULTS_POPULATED_KEY, 'true');
        console.log(`Populated watchlist with ${tokens.length} default tokens from multiple sources`);
      }
    })();
  }, [watchlist.length, isHydrated]);

  // Replenishment: if watchlist drops below MIN_WATCHLIST_COUNT,
  // fetch fresh tokens to fill back up to DEFAULT_WATCHLIST_COUNT.
  // Cooldown prevents rapid re-fetching if tokens keep getting removed.
  const replenishingRef = useRef(false);
  const lastReplenishTimeRef = useRef(0);
  const REPLENISH_COOLDOWN_MS = 30000; // 30 seconds between replenishments

  useEffect(() => {
    if (!isHydrated) return;
    if (watchlist.length >= MIN_WATCHLIST_COUNT) return;
    if (watchlist.length === 0) return; // Don't replenish if user cleared everything
    if (replenishingRef.current) return;

    // Only replenish if we've already done initial population
    const alreadyPopulated = localStorage.getItem(DEFAULTS_POPULATED_KEY);
    if (!alreadyPopulated) return;

    // Cooldown: don't replenish more than once per 30s
    const now = Date.now();
    if (now - lastReplenishTimeRef.current < REPLENISH_COOLDOWN_MS) return;

    replenishingRef.current = true;
    lastReplenishTimeRef.current = now;
    const needed = DEFAULT_WATCHLIST_COUNT - watchlist.length;

    // Build sets from current watchlist to avoid duplicates
    const existingAddrs = new Set(
      watchlist.map(t => (t.pair_address || (t as any).mint || '').toLowerCase()).filter(Boolean)
    );
    const existingNames = new Set(
      watchlist.map(t => ((t as any).symbol || t.name || '').toLowerCase().trim()).filter(Boolean)
    );

    (async () => {
      try {
        const newTokens = await fetchTokensFromMultipleSources(needed, existingAddrs, existingNames);

        if (newTokens.length > 0) {
          setWatchlist(prev => [...prev, ...newTokens]);
          console.log(`Replenished watchlist with ${newTokens.length} tokens`);
        }
      } catch (error) {
        console.warn('Error replenishing watchlist:', error);
      } finally {
        replenishingRef.current = false;
      }
    })();
  }, [watchlist.length, isHydrated]);

  const addToWatchlist = useCallback((token: Token) => {
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
  }, []);

  const removeFromWatchlist = useCallback((tokenAddress: string) => {
    setWatchlist(prev => prev.filter(token => {
      const pairAddr = token.pair_address || (token as any).mint || '';
      const mintAddr = (token as any).mint || '';
      return pairAddr !== tokenAddress && mintAddr !== tokenAddress;
    }));
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
