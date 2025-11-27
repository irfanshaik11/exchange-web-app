// src/pages/discover.tsx
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import InterstateTable from '../components/InterstateTable';
import type { Token } from '~/utils/db';
import Header from '../components/Header';
import Footer from '../components/Footer';
import usePaginatedTokensWithFallback from '../hooks/usePaginatedTokensWithFallback';
import { usePumpPortalWebSocket } from '../hooks/usePumpPortalWebSocket';
import { useQuickBuy } from "~/components/QuickBuyContext";
import QuickBuySettingsModal from '../components/QuickBuySettingsModal';
import { useFilter } from '../components/FilterContext';
import FilterPopout from '../components/FilterPopout';
import { SOL_MINT_ADDRESS } from "~/utils/api";
import { executeEnhancedTrade } from "~/utils/enhancedTradeHandler";
import { showEnhancedToast } from "~/utils/enhancedToast";
import { useUser } from "~/components/UserContext";
import PumpLive, { type PumpItem, demoLeft as demoLeftPump, demoRight as demoRightPump } from '../components/PumpLive';
import { FaRunning, FaGasPump, FaCoins, FaBan } from "react-icons/fa";
import { HiLightningBolt } from "react-icons/hi";
import { BsSliders2 } from "react-icons/bs";
import { prefetchTradeData } from "~/utils/tokenCache";

const WRAPPED_SOL_MINT = SOL_MINT_ADDRESS;

export type Timeframe = "5m" | "1h" | "6h" | "24h";

// Extend Token with optional flags
type TokenWithDexPaid = Token & { dexPaid?: boolean };

export default function DiscoverPage() {
  const router = useRouter();
  
  // CRITICAL: Use state to track chain and sync with router.query.chain
  // This ensures we react to shallow routing changes immediately
  const [currentChain, setCurrentChain] = useState<string>('sol');
  
  // Sync chain state with router query - this handles both initial load and shallow routing updates
  useEffect(() => {
    const chainFromQuery = (router.query.chain as string) || 'sol';
    if (chainFromQuery !== currentChain) {
      console.log('[Discover] Chain changed from router:', currentChain, '->', chainFromQuery);
      setCurrentChain(chainFromQuery);
    }
  }, [router.query.chain, router.isReady]);
  
  // Also watch router.asPath as a fallback for shallow routing
  useEffect(() => {
    if (!router.isReady) return;
    const urlParams = new URLSearchParams(router.asPath.split('?')[1] || '');
    const chainFromUrl = urlParams.get('chain') || 'sol';
    if (chainFromUrl !== currentChain) {
      console.log('[Discover] Chain changed from URL:', currentChain, '->', chainFromUrl);
      setCurrentChain(chainFromUrl);
    }
  }, [router.asPath, router.isReady, currentChain]);
  
  // Debug: Log chain changes
  useEffect(() => {
    console.log('[Discover] Current chain state:', currentChain, 'router.query.chain:', router.query.chain);
  }, [currentChain, router.query.chain]);
  
  // For Monad, only allow 'trending' and 'newPairs' tabs
  const [activeTab, setActiveTab] = useState<'trending' | 'newPairs' | 'xStocks' | 'surge' | 'dex' | 'live'>('trending');
  
  // When chain changes to monad, switch to trending if current tab is not allowed
  useEffect(() => {
    if (currentChain === 'monad' && activeTab !== 'trending' && activeTab !== 'newPairs') {
      setActiveTab('trending');
    }
  }, [currentChain, activeTab]);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("1h");
  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFilterPopoutOpen, setIsFilterPopoutOpen] = useState(false);
  const { filter } = useFilter();
  
  // Debug: Log when filter context changes to track filter application
  useEffect(() => {
    console.log('[Filters] Filter context changed:', {
      amms: filter.amms,
      searchKeywords: filter.searchKeywords,
      excludeKeywords: filter.excludeKeywords,
      marketCapMin: filter.marketCapMin,
      marketCapMax: filter.marketCapMax,
      volumeMin: filter.volumeMin,
      volumeMax: filter.volumeMax,
      liquidityMin: filter.liquidityMin,
      liquidityMax: filter.liquidityMax,
    });
  }, [filter]);
  
  const normalizedSearch = useMemo(
    () => search.trim().toLowerCase(),
    [search]
  );

  useEffect(() => {
    if (!router.isReady) return;
    const searchFromQuery = router.query.search;
    if (typeof searchFromQuery === "string") {
      setSearch(searchFromQuery);
    } else if (!searchFromQuery) {
      setSearch("");
    }
  }, [router.isReady, router.query.search]);

  const { presets, activePreset, setActivePreset } = useQuickBuy();
  const { user, solBalance } = useUser();

  // Load quickBuyAmount from localStorage with fallback
  const getInitialQuickBuyAmount = () => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('quickBuyAmount');
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 0) {
          return parsed;
        }
      }
    }
    return 0.05;
  };

  const [quickBuyAmount, setQuickBuyAmount] = useState(getInitialQuickBuyAmount().toString());
  const [selectedPill, setSelectedPill] = useState('P1'); // Local preset selection for discover page
  const [showPillTooltip, setShowPillTooltip] = useState<string | null>(null);
  const tokenMapRef = useRef<Map<string, TokenWithDexPaid>>(new Map());
  const [filteredTokens, setFilteredTokens] = useState<TokenWithDexPaid[]>([]);
  const [displayed, setDisplayed] = useState<TokenWithDexPaid[]>([]);
  const [sortKey, setSortKey] = useState<"market_cap_total" | "liquidity" | "volume" | "txns" | "name" | "total_liquidity_usd" | "fully_diluted_value">("volume");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [newPairsRaw, setNewPairsRaw] = useState<TokenWithDexPaid[]>(() => {
    // Initialize with cached data if available (no loading state)
    if (typeof window !== 'undefined') {
      try {
        // Use default 'sol' for initial load, will be updated when chain changes
        const initialChain = (router.query.chain as string) || 'sol';
        const cached = localStorage.getItem(`discover_new_pairs_cache_${initialChain}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          const age = Date.now() - parsed.timestamp;
          if (age < 60 * 1000 && parsed.data && parsed.data.length > 0) {
            return parsed.data;
          }
        }
      } catch {
        // Ignore cache errors on init
      }
    }
    return [];
  });
  const [newPairsLoading, setNewPairsLoading] = useState(false);
  const [newPairsError, setNewPairsError] = useState<string | null>(null);

  // xStocks state
  const [xStocksRaw, setXStocksRaw] = useState<TokenWithDexPaid[]>(() => {
    // Initialize with cached data if available (no loading state)
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('discover_xstocks_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          const age = Date.now() - parsed.timestamp;
          if (age < 60 * 1000 && parsed.data && parsed.data.length > 0) {
            return parsed.data;
          }
        }
      } catch {
        // Ignore cache errors on init
      }
    }
    return [];
  });
  const [xStocksLoading, setXStocksLoading] = useState(false);
  const [xStocksError, setXStocksError] = useState<string | null>(null);

  // 🔒 Image cache: tokenId -> { cover?: string; avatar?: string }
  const imageCacheRef = useRef<Map<string, { cover?: string; avatar?: string }>>(new Map());
  // Track one-time preloads to avoid refetch spam
  const preloadedRef = useRef<Set<string>>(new Set());

  const getTokenId = (t: any) => t?.pair_address || t?.mint || undefined;

  // Helper to check if a token is wrapped SOL - AGGRESSIVE FILTERING
  const isWrappedSol = useCallback((token: any): boolean => {
    if (!token || !token.mint) return false;
    
    // Check exact mint match (most reliable)
    if (token.mint === WRAPPED_SOL_MINT) return true;
    
    // Check symbol and name with comprehensive variations
    const symbol = (token.symbol || '').toLowerCase().trim();
    const name = (token.name || '').toLowerCase().trim();
    
    // Comprehensive wrapped SOL variations to catch all instances
    const wrappedSolVariations = [
      'wrapped sol',
      'wsol',
      'wrapped solana',
      'wsolana',
      'wrapped-sol',
      'wrapped-solana',
      'solwrapped',
      'solw',
      'w.sol',
      'w sol',
      'sol wrapped',
      'sol wrapped solana',
      'wrappedsol',
      'wrappedsolana'
    ];
    
    // Check if symbol or name contains any variation
    const isWrappedSolSymbol = wrappedSolVariations.some(variant => 
      symbol === variant || symbol.includes(variant) ||
      name === variant || name.includes(variant)
    );
    
    // Also check if mint starts with So111... (wrapped SOL mint pattern)
    const isWrappedSolMint = token.mint.startsWith('So111');
    
    return isWrappedSolSymbol || isWrappedSolMint;
  }, []);

  const isZeroLiquidityToken = useCallback((token: any): boolean => {
    if (!token) return false;

    const rawValue =
      token.liquidity_usd ??
      token.total_liquidity_usd ??
      token.total_liquidityUsd ??
      token.totalLiquidityUsd ??
      null;

    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return false;
    }

    const liquidity = Number(rawValue);
    if (Number.isNaN(liquidity)) {
      return false;
    }

    return liquidity === 0;
  }, []);

  const getNewPairTimestamp = useCallback((token: any): number => {
    if (!token) return 0;

    let v: any =
      token?.migrated_time ??
      token?.migratedTime ??
      token?.launch_time ??
      token?.launchTime ??
      token?.created_at ??
      token?.createdAt ??
      token?.firstSeen ??
      token?.first_seen ??
      token?.pair_created_at ??
      token?.pairCreatedAt ??
      token?.timestamp ??
      token?.ts ??
      null;

    if (v && typeof v === 'object') {
      if ('Time' in v && typeof (v as any).Time === 'string') {
        v = (v as any).Time;
      } else if ('time' in v && typeof (v as any).time === 'string') {
        v = (v as any).time;
      } else if ('seconds' in v && typeof (v as any).seconds === 'number') {
        const sec = Number((v as any).seconds);
        return sec > 1e12 ? sec : sec > 1e9 ? sec * 1000 : 0;
      } else if ('millis' in v && typeof (v as any).millis === 'number') {
        const ms = Number((v as any).millis);
        return ms > 0 ? ms : 0;
      }
    }

    if (!v) return 0;
    if (typeof v === 'number') {
      return v > 1e12 ? v : v > 1e9 ? v * 1000 : 0;
    }
    if (typeof v === 'string') {
      const n = Number(v);
      if (!Number.isNaN(n) && n > 0) {
        return n > 1e12 ? n : n > 1e9 ? n * 1000 : 0;
      }
      const d = Date.parse(v);
      return Number.isNaN(d) ? 0 : d;
    }
    if (v instanceof Date) {
      return v.getTime();
    }
    return 0;
  }, []);

  const pickImageCandidates = (t: any) => {
    const coverCandidate = t?.image || t?.logo || t?.uri || undefined;
    const avatarCandidate = t?.logo || t?.image || undefined;
    return { coverCandidate, avatarCandidate };
  };

  const getCachedImagesForToken = (t: any) => {
    const id = getTokenId(t);
    const { coverCandidate, avatarCandidate } = pickImageCandidates(t);

    const cached = id ? imageCacheRef.current.get(id) : undefined;
    let cover = cached?.cover;
    let avatar = cached?.avatar;

    // Update cache if we have new candidates (this handles async image loading)
    // If we have a new cover/avatar candidate, use it even if cached was undefined
    if (coverCandidate && cover !== coverCandidate) cover = coverCandidate;
    if (avatarCandidate && avatar !== avatarCandidate) avatar = avatarCandidate;

    if (id) {
      imageCacheRef.current.set(id, { cover, avatar });

      // Optional one-time preload to encourage browser caching
      const preloadKey = `${id}:${cover ?? ''}|${avatar ?? ''}`;
      if (!preloadedRef.current.has(preloadKey)) {
        if (cover) { const i = new Image(); i.decoding = 'async'; i.loading = 'eager'; i.src = cover; }
        if (avatar) { const i2 = new Image(); i2.decoding = 'async'; i2.loading = 'eager'; i2.src = avatar; }
        preloadedRef.current.add(preloadKey);
      }
    }

    return { cover, avatar };
  };

  // Hydrate cache from sessionStorage (optional persistence)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const raw = sessionStorage.getItem('tokenImageCache');
        if (raw) {
          const obj = JSON.parse(raw) as Record<string, { cover?: string; avatar?: string }>;
          imageCacheRef.current = new Map(Object.entries(obj));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist cache to sessionStorage periodically (after displayed changes is fine)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const obj: Record<string, { cover?: string; avatar?: string }> = {};
        imageCacheRef.current.forEach((v, k) => { obj[k] = v; });
        sessionStorage.setItem('tokenImageCache', JSON.stringify(obj));
      }
    } catch {
      // ignore
    }
  }, [displayed]);

  // CRITICAL: Clear ALL data when chain changes to prevent stale data from showing
  useEffect(() => {
    console.log('[Discover] 🔄 Chain changed to:', currentChain, '- Clearing all data and refetching');
    // Clear token map
    tokenMapRef.current.clear();
    // Clear filtered and displayed tokens
    setFilteredTokens([]);
    setDisplayed([]);
    // Force a small delay to ensure state is cleared before hook re-runs
  }, [currentChain]);
  
  const {
    data: allTokens,
    loading: tokensLoading,
    isConnected,
    error: tokenError,
    isReconnecting,
    usingFallback,
  } = usePaginatedTokensWithFallback({
    // Always use trending endpoint
    filter: 'trending',
    timeframe: selectedTimeframe,
    chain: currentChain, // Use state value - this will trigger re-fetch when chain changes
    limit: 200 // Fetch 200 tokens for trending tab
  });
  
  // CRITICAL: Log when hook data changes to track chain switching
  useEffect(() => {
    console.log('[Discover] Hook data updated:', {
      chain: currentChain,
      tokenCount: allTokens?.length || 0,
      loading: tokensLoading,
      usingFallback: usingFallback
    });
  }, [allTokens, tokensLoading, currentChain, usingFallback]);

  // PumpPortal WebSocket for live pump section
  const {
    tokens: pumpPortalTokens,
    connected: pumpPortalConnected,
    error: pumpPortalError,
  } = usePumpPortalWebSocket({
    enabled: activeTab === 'live', // Only connect when on live tab
  });

  // Clear new pairs data only when chain actually changes (avoid nuking cache on remount)
  const prevChainRef = useRef<string>(currentChain);
  useEffect(() => {
    if (prevChainRef.current !== currentChain) {
      setNewPairsRaw([]);
      setNewPairsLoading(false);
      setNewPairsError(null);
      prevChainRef.current = currentChain;
    }
  }, [currentChain]);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    // Include chain in cache key so Monad and Solana have separate caches
    const currentChain = (router.query.chain as string) || 'sol';
    const CACHE_KEY = `discover_new_pairs_cache_${currentChain}`;
    const CACHE_TTL = 30 * 1000; // Trigger background refresh after 30s
    const STALE_THRESHOLD = 5 * 60 * 1000; // Treat cache as stale after 5 minutes (but still usable)

    // Check if we already have valid cached data in state - if so, skip fetching
    // This prevents re-fetching when navigating back to the page
    if (newPairsRaw.length > 0) {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          const age = Date.now() - parsed.timestamp;
          // If we have data in state and cache is still valid, skip fetching
          if (age < STALE_THRESHOLD && parsed.data && parsed.data.length > 0) {
            console.log('[Discover] Already have cached data in state, skipping re-fetch on navigation');
            // Just set up the refresh interval for stale cache updates
            intervalId = setInterval(() => {
              if (cancelled) return;
              const cachedData = localStorage.getItem(CACHE_KEY);
              if (cachedData) {
                const parsed = JSON.parse(cachedData);
                const age = Date.now() - parsed.timestamp;
                // Only refresh if cache is stale (will be handled by fetchNewPairs below)
                if (age > CACHE_TTL) {
                  // Trigger a silent background refresh
                  // Use appropriate endpoint based on chain
                  const refreshChain = (router.query.chain as string) || 'sol';
                  const apiUrl = refreshChain === 'monad' 
                    ? `/api/token-service/pulse-new-monad?limit=200`
                    : `/api/token-service/pulse-new?limit=200`;
                  fetch(apiUrl, {
                    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
                  })
                    .then(res => res.json())
                    .then(data => {
                      if (!cancelled) {
                        // Handle both array and Birdeye format
                        let tokensArray: any[] = [];
                        if (Array.isArray(data)) {
                          tokensArray = data;
                        } else if (data?.data?.tokens && Array.isArray(data.data.tokens)) {
                          tokensArray = data.data.tokens;
                        }
                        if (tokensArray.length > 0) {
                          // Process and save to cache (simplified - just update cache)
                          localStorage.setItem(CACHE_KEY, JSON.stringify({
                            data: tokensArray,
                            timestamp: Date.now(),
                          }));
                        }
                      }
                    })
                    .catch(err => console.error('[Discover] Background refresh failed:', err));
                }
              }
            }, 60_000);
            
            return () => {
              cancelled = true;
              if (intervalId) {
                clearInterval(intervalId);
              }
            };
          }
        }
      } catch {
        // Continue with normal flow if check fails
      }
    }

    // Load from cache on mount
    const loadFromCache = (): TokenWithDexPaid[] | null => {
      try {
        if (typeof window === 'undefined') return null;
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          const age = Date.now() - parsed.timestamp;
          if (parsed.data && parsed.data.length > 0) {
            const isStale = age > STALE_THRESHOLD;
            console.log(`[Discover] Loaded ${parsed.data.length} new pairs from cache (age: ${Math.round(age / 1000)}s${isStale ? ', stale' : ''})`);
            return parsed.data;
          }
          // Cache exists but empty data - drop it
          localStorage.removeItem(CACHE_KEY);
        }
      } catch (err) {
        console.warn('[Discover] Failed to load cache:', err);
        localStorage.removeItem(CACHE_KEY);
      }
      return null;
    };

    // Save to cache
    const saveToCache = (data: TokenWithDexPaid[]) => {
      try {
        if (typeof window === 'undefined') return;
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          data,
          timestamp: Date.now(),
        }));
        console.log(`[Discover] Cached ${data.length} new pairs`);
      } catch (err) {
        console.warn('[Discover] Failed to save cache:', err);
      }
    };

    const fetchNewPairs = async (useCache = true, showLoading = false) => {
      if (cancelled) {
        return;
      }

      // Try to load from cache first
      if (useCache) {
        const cached = loadFromCache();
        if (cached && cached.length > 0) {
          // Update data silently (no loading state)
          setNewPairsRaw(cached);
          setNewPairsError(null);
          setNewPairsLoading(false);
          
          // Check if cache is stale and refresh in background
          try {
            const cachedData = localStorage.getItem(CACHE_KEY);
            if (cachedData) {
              const parsed = JSON.parse(cachedData);
              const age = Date.now() - parsed.timestamp;
              if (age > CACHE_TTL) {
                // Cache is stale, refresh in background (silently)
                console.log('[Discover] Cache is stale, refreshing in background');
                fetchNewPairs(false, false).catch(err => {
                  console.error('[Discover] Background refresh failed:', err);
                });
              }
            }
          } catch {
            // Ignore cache read errors
          }
          return;
        }
      }

      // Only show loading if explicitly requested (first load with no cache)
      if (showLoading) {
        setNewPairsLoading(true);
      }

      try {
        // For Monad chain, use dedicated Monad new pairs endpoint
        // For Solana, use the regular pulse-new endpoint
        const currentChain = (router.query.chain as string) || 'sol';
        let apiUrl = `/api/token-service/pulse-new?limit=200&fresh=1`;
        
        if (currentChain === 'monad') {
          // Use dedicated Monad new pairs endpoint (uses Birdeye API with x-chain: monad)
          apiUrl = `/api/token-service/pulse-new-monad?limit=200&fresh=1`;
        }
        
        const response = await fetch(apiUrl, {
          headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = await response.json();
        if (cancelled) {
          return;
        }

        // Handle both formats: pulse-new returns array, Birdeye returns {data: {tokens: [...]}}
        let tokensArray: any[] = [];
        if (Array.isArray(payload)) {
          tokensArray = payload;
        } else if (payload?.data?.tokens && Array.isArray(payload.data.tokens)) {
          // Birdeye format - extract tokens array
          tokensArray = payload.data.tokens;
        } else {
          throw new Error('Unexpected response format');
        }

        if (tokensArray.length > 0) {
          const normalizePulseToken = (token: any): TokenWithDexPaid => {
            const toNumber = (value: any): number => {
              if (typeof value === 'number') {
                return Number.isFinite(value) ? value : 0;
              }
              if (typeof value === 'string') {
                const cleaned = value.trim();
                if (!cleaned) return 0;
                const parsed = Number(cleaned);
                return Number.isFinite(parsed) ? parsed : 0;
              }
              return 0;
            };

            const sumVolumes = (buy: any, sell: any): number => toNumber(buy) + toNumber(sell);

            // Helper to get first non-empty string from multiple candidates
            const getFirstString = (...candidates: any[]): string | undefined => {
              for (const candidate of candidates) {
                if (typeof candidate === 'string' && candidate.trim() !== '') {
                  return candidate.trim();
                }
              }
              return undefined;
            };

            const normalized: Record<string, any> = {
              ...token,
            };

            // Handle both standard format and Birdeye format
            const marketCap = toNumber(
              token.market_cap_usd ?? 
              token.marketCapUsd ?? 
              token.marketcap ?? // Birdeye format
              token.fully_diluted_value ??
              token.fdv // Birdeye format
            );
            const liquidity = toNumber(
              token.liquidity_usd ?? 
              token.total_liquidity_usd ?? 
              token.total_liquidityUsd ??
              token.liquidity // Birdeye format
            );

            normalized.market_cap_usd = marketCap;
            normalized.fully_diluted_value = marketCap;

            normalized.liquidity_usd = liquidity;
            normalized.total_liquidity_usd = liquidity;

            // Volume fields - prefer buy/sell volume sum if available, otherwise use provided value
            // This ensures we get accurate volume even if the direct volume field is 0 or missing
            const sum24h = sumVolumes(token.total_buy_volume_24h, token.total_sell_volume_24h);
            const vol24h = token.volume_24h ?? token.volume24h ?? token.volume24hUSD; // Birdeye format
            normalized.volume_24h = sum24h > 0 ? sum24h : (vol24h !== undefined && vol24h !== null ? toNumber(vol24h) : 0);
            
            const sum6h = sumVolumes(token.total_buy_volume_6h, token.total_sell_volume_6h);
            const vol6h = token.volume_6h ?? token.volume6h;
            normalized.volume_6h = sum6h > 0 ? sum6h : (vol6h !== undefined && vol6h !== null ? toNumber(vol6h) : 0);
            
            const sum1h = sumVolumes(token.total_buy_volume_1h, token.total_sell_volume_1h);
            const vol1h = token.volume_1h ?? token.volume1h;
            normalized.volume_1h = sum1h > 0 ? sum1h : (vol1h !== undefined && vol1h !== null ? toNumber(vol1h) : 0);
            
            const sum5m = sumVolumes(token.total_buy_volume_5m, token.total_sell_volume_5m);
            const vol5m = token.volume_5m ?? token.volume5m;
            normalized.volume_5m = sum5m > 0 ? sum5m : (vol5m !== undefined && vol5m !== null ? toNumber(vol5m) : 0);

            const normalizePercent = (value: any) => {
              const num = toNumber(value);
              return Number.isFinite(num) ? num : 0;
            };

            normalized.price_percent_change_24h = normalizePercent(
              token.price_percent_change_24h ?? 
              token.price_change_24h ?? 
              token.priceChange24h ??
              token.price24hChangePercent // Birdeye format
            );
            normalized.price_percent_change_6h = normalizePercent(
              token.price_percent_change_6h ?? token.price_change_6h ?? token.priceChange6h
            );
            normalized.price_percent_change_1h = normalizePercent(
              token.price_percent_change_1h ?? token.price_change_1h ?? token.priceChange1h
            );
            normalized.price_percent_change_5m = normalizePercent(
              token.price_percent_change_5m ?? token.price_change_5m ?? token.priceChange5m
            );

            if (!normalized.created_at && token.launch_time) {
              normalized.created_at = token.launch_time;
            }

            // CRITICAL: Preserve image fields from API response
            // The pulse-new endpoint already maps these using extractTokenImage
            if (token.logo) {
              normalized.logo = token.logo;
            }
            if (token.image) {
              normalized.image = token.image;
            }
            if (token.uri) {
              normalized.uri = token.uri;
            }
            if (token.imageUrl) {
              normalized.imageUrl = token.imageUrl;
            }

            // CRITICAL: Preserve launchpad_protocol for pool type detection
            // This is essential for Meteora and other tokens to determine the correct pool type
            if (token.launchpad_protocol) {
              normalized.launchpad_protocol = token.launchpad_protocol;
            } else if (token.launchpadProtocol) {
              normalized.launchpad_protocol = token.launchpadProtocol;
            } else if (token.protocol) {
              normalized.launchpad_protocol = token.protocol;
            }

            // CRITICAL: Extract and normalize pool address fields
            // This ensures Meteora and other tokens have proper pair_address for trading
            // Check for migrated pool address first (for graduated tokens)
            const migratedPoolAddress = getFirstString(
              token.migrated_pool_address,
              token.migratedPoolAddress,
              token.migrated_poolAddress,
              token.migrated_pool?.address,
              token.migratedPool?.address,
              token.target_pool_address,
              token.targetPoolAddress,
            );

            // Check for original pair address
            const originalPairAddress = getFirstString(
              token.pair_address,
              token.pairAddress,
              token.bonding_curve?.address,
              token.bondingCurveKey,
            );

            // Check for fallback pool address fields
            const fallbackPoolAddress = getFirstString(
              token.poolAddress,
              token.pool_address,
              token.amm_id,
              token.ammId,
              typeof token.pool === 'string' && token.pool.length >= 32 ? token.pool : undefined,
            );

            // Set migrated_pool_address if found
            if (migratedPoolAddress) {
              normalized.migrated_pool_address = migratedPoolAddress;
            }

            // Set pair_address - prioritize original, then migrated, then fallback
            // This is critical for trading - enhancedTradeHandler needs either pair_address or migrated_pool_address
            const effectivePairAddress = originalPairAddress || migratedPoolAddress || fallbackPoolAddress;
            
            // Special handling for pump.fun tokens only:
            // Pump.fun can use mint as pool address - backend will resolve it to bonding curve
            // Meteora tokens require the actual DBC pool address, not the mint
            const protocol = normalized.launchpad_protocol?.toLowerCase() || '';
            const isPumpFun = protocol.includes('pump.fun') || protocol.includes('pumpfun') || protocol === 'pump';
            
            if (effectivePairAddress && effectivePairAddress !== token.mint) {
              // Valid pool address that's different from mint
              normalized.pair_address = effectivePairAddress;
            } else if (isPumpFun && token.mint) {
              // For pump.fun tokens only, use mint as pair_address if no other pool address is available
              // Backend has special handling to resolve mint to bonding curve address for pump.fun
              normalized.pair_address = token.mint;
              console.log(`[Discover] Pump.fun token ${token.symbol || token.mint} using mint as pair_address (backend will resolve to bonding curve)`, {
                launchpad_protocol: normalized.launchpad_protocol,
                mint: token.mint,
                pair_address: normalized.pair_address
              });
            } else if (effectivePairAddress === token.mint && !isPumpFun) {
              // If pair_address equals mint for non-pump.fun tokens (like Meteora), it's invalid
              // Meteora requires the actual DBC pool address, not the mint
              console.warn(`[Discover] Token ${token.symbol || token.mint} has pair_address equal to mint (invalid for ${protocol || 'this protocol'}), not setting pair_address`);
              // Don't set pair_address - this will trigger the proper error in enhancedTradeHandler
            } else if (!effectivePairAddress && !isPumpFun) {
              // No valid pool address found for non-pump.fun tokens
              // Meteora and other protocols need the actual pool address from the API
              console.warn(`[Discover] Token ${token.symbol || token.mint} (${protocol || 'unknown protocol'}) has no valid pool address - trading will be blocked`);
            }

            return normalized as TokenWithDexPaid;
          };

          // Transform Birdeye format tokens to match expected format before filtering
          const transformedTokens = tokensArray.map((token: any) => {
            // If this is a Birdeye token (has 'address' field), transform it
            if (token.address && !token.mint) {
              return {
                ...token,
                mint: token.address, // Map address to mint
                pair_address: token.address, // Use address as pair_address
                logo: token.logoURI || token.logo,
                image: token.logoURI || token.image,
                uri: token.logoURI || token.uri,
                imageUrl: token.logoURI || token.imageUrl,
                market_cap_usd: token.marketcap,
                fully_diluted_value: token.fdv,
                total_liquidity_usd: token.liquidity,
                volume_24h: token.volume24hUSD,
                price_percent_change_24h: token.price24hChangePercent,
                // Birdeye doesn't provide transaction data, so set defaults
                total_buys_24h: 0,
                total_sells_24h: 0,
                total_buy_volume_24h: 0,
                total_sell_volume_24h: 0,
                unique_wallets_24h: 0,
              };
            }
            return token;
          });

          const filtered = transformedTokens.filter((token: any) => {
            if (isZeroLiquidityToken(token)) {
              return false;
            }
            if (!token || !token.mint || isWrappedSol(token)) {
              return false;
            }
            // For Monad, don't filter out by protocol (Birdeye doesn't provide protocol info)
            // Only filter Meteora for Solana tokens
            if (currentChain !== 'monad') {
              const protocol = (token.launchpad_protocol || token.launchpadProtocol || token.protocol || '').toLowerCase();
              if (protocol.includes('meteora')) {
                return false;
              }
            }
            return true;
          }) as TokenWithDexPaid[];

          const deduped: TokenWithDexPaid[] = [];
          const seenKeys = new Set<string>();

          for (const token of filtered) {
            const key = (token?.pair_address || token?.mint) as string | undefined;
            if (!key || seenKeys.has(key)) {
              continue;
            }
            seenKeys.add(key);
            deduped.push(normalizePulseToken(token));
          }

          // Update data silently (no loading animation)
          setNewPairsRaw(deduped);
          setNewPairsError(null);
          
          // Save to cache
          saveToCache(deduped);
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        const message = err instanceof Error ? err.message : 'Failed to fetch new pairs';
        console.error('[Discover] Failed to fetch new pairs:', err);

        let handled = false;

        // If we requested to use cache, try to recover silently
        if (useCache) {
          const cached = loadFromCache();
          if (cached && cached.length > 0) {
            console.log('[Discover] Using cached data after fetch failure');
            setNewPairsRaw(cached);
            setNewPairsError(null);
            handled = true;
          }
        }

        // If we already have data in memory, keep showing it instead of an error
        if (!handled && newPairsRaw.length > 0) {
          console.warn('[Discover] Fetch failed but existing data is available. Keeping previous list.');
          setNewPairsError(null);
          handled = true;
        }

        if (!handled) {
          setNewPairsError(message);
        }
      } finally {
        if (!cancelled && showLoading) {
          setNewPairsLoading(false);
        }
      }
    };

    // Check if we already have data from initial state (cached)
    const hasInitialData = newPairsRaw.length > 0;
    
    if (hasInitialData) {
      // We have cached data from initial state, don't show loading, just refresh in background silently
      // Ensure loading is false since we have cached data
      setNewPairsLoading(false);
      fetchNewPairs(false, false).catch(err => {
        console.error('[Discover] Background fetch failed:', err);
      });
    } else {
      // No cache, fetch with loading state only on first load
      fetchNewPairs(true, true);
    }
    
    // Refresh every 60 seconds (silently, no loading state)
    intervalId = setInterval(() => fetchNewPairs(true, false), 60_000);

    return () => {
      cancelled = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [currentChain, activeTab]); // Re-run when chain or tab changes

  // Fetch xStocks data
  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const CACHE_KEY = 'discover_xstocks_cache';
    const CACHE_TTL = 30 * 1000; // 30 seconds
    const STALE_THRESHOLD = 60 * 1000; // 60 seconds

    const loadFromCache = (): TokenWithDexPaid[] | null => {
      try {
        if (typeof window === 'undefined') return null;
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          const age = Date.now() - parsed.timestamp;
          if (age < STALE_THRESHOLD) {
            console.log(`[Discover] Loaded ${parsed.data.length} xStocks from cache (age: ${Math.round(age / 1000)}s)`);
            return parsed.data;
          } else {
            localStorage.removeItem(CACHE_KEY);
          }
        }
      } catch (err) {
        console.warn('[Discover] Failed to load xStocks cache:', err);
        localStorage.removeItem(CACHE_KEY);
      }
      return null;
    };

    const saveToCache = (data: TokenWithDexPaid[]) => {
      try {
        if (typeof window === 'undefined') return;
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          data,
          timestamp: Date.now(),
        }));
        console.log(`[Discover] Cached ${data.length} xStocks`);
      } catch (err) {
        console.warn('[Discover] Failed to save xStocks cache:', err);
      }
    };

    const toNumber = (value: any): number => {
      if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
      }
      if (typeof value === 'string') {
        const cleaned = value.trim();
        if (!cleaned || cleaned === '0' || cleaned === 'null') return 0;
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      return 0;
    };

    const normalizeXStocksToken = (result: any): TokenWithDexPaid => {
      const token = result.token || {};
      const pair = result.pair || {};

      // Get image from token.info or token directly
      const getImage = () => {
        return token.info?.imageThumbUrl || token.info?.imageSmallUrl || token.info?.imageLargeUrl ||
               token.imageThumbUrl || token.imageSmallUrl || token.imageLargeUrl ||
               undefined;
      };

      const marketCap = toNumber(result.marketCap || '0');
      const liquidity = toNumber(result.liquidity || '0');
      
      // Volume fields - convert strings to numbers
      const volume24h = toNumber(result.volume24 || '0');
      const volume12h = toNumber(result.volume12 || '0');
      const volume4h = toNumber(result.volume4 || '0');
      const volume1h = toNumber(result.volume1 || '0');
      const volume5m = toNumber(result.volume5m || '0');
      
      // Price change fields - convert strings to numbers
      const change24h = toNumber(result.change24 || '0');
      const change12h = toNumber(result.change12 || '0');
      const change4h = toNumber(result.change4 || '0');
      const change1h = toNumber(result.change1 || '0');
      const change5m = toNumber(result.change5m || '0');

      const normalized: Record<string, any> = {
        mint: token.address || '',
        name: token.name || '',
        symbol: token.symbol || '',
        decimals: token.decimals || 9,
        networkId: token.networkId || 1399811149,
        
        // Market data
        market_cap_usd: marketCap,
        fully_diluted_value: marketCap,
        liquidity_usd: liquidity,
        total_liquidity_usd: liquidity,
        price_usd: toNumber(result.priceUSD || '0'),
        
        // Volumes
        volume_24h: volume24h,
        volume_12h: volume12h,
        volume_6h: volume4h > 0 ? volume4h : (volume12h / 2), // Use volume4 if available, otherwise estimate from volume12
        volume_4h: volume4h,
        volume_1h: volume1h,
        volume_5m: volume5m,
        
        // Price changes
        price_percent_change_24h: change24h * 100, // Convert to percentage
        price_percent_change_12h: change12h * 100,
        price_percent_change_6h: change4h * 100, // Use change4 for 6h
        price_percent_change_4h: change4h * 100,
        price_percent_change_1h: change1h * 100,
        price_percent_change_5m: change5m * 100,
        
        // Pair address
        pair_address: pair.address || token.address || '',
        created_at: result.createdAt || pair.createdAt || Date.now(),
        
        // Protocol - xStocks use Raydium Launchpad
        protocol: 'Raydium Launchpad',
        launchpad_protocol: 'Raydium Launchpad',
        
        // Image
        uri: getImage(),
        logo: getImage(),
        image: getImage(),
        imageUrl: getImage(),
        
        // Additional fields from xStocks response
        holders: result.holders || 0,
        
        // Transaction counts - map Codex fields to frontend expected format
        // Codex provides: buyCount1, buyCount4, buyCount12, buyCount24, buyCount5m
        // Frontend expects: total_buys_1h, total_buys_6h, total_buys_12h, total_buys_24h, total_buys_5m
        total_buys_1h: toNumber(result.buyCount1 || '0'),
        total_buys_6h: toNumber(result.buyCount4 || '0'), // Using 4h as approximation for 6h
        total_buys_12h: toNumber(result.buyCount12 || '0'),
        total_buys_24h: toNumber(result.buyCount24 || '0'),
        total_buys_5m: toNumber(result.buyCount5m || '0'),
        
        // Same for sells
        total_sells_1h: toNumber(result.sellCount1 || '0'),
        total_sells_6h: toNumber(result.sellCount4 || '0'), // Using 4h as approximation for 6h
        total_sells_12h: toNumber(result.sellCount12 || '0'),
        total_sells_24h: toNumber(result.sellCount24 || '0'),
        total_sells_5m: toNumber(result.sellCount5m || '0'),
        
        // Total transaction counts for fallback (txnCount = buyCount + sellCount)
        // These are useful when buyCount/sellCount are 0 but txnCount has data
        txnCount1h: toNumber(result.txnCount1 || '0'),
        txnCount6h: toNumber(result.txnCount4 || '0'), // Using 4h as approximation for 6h
        txnCount12h: toNumber(result.txnCount12 || '0'),
        txnCount24h: toNumber(result.txnCount24 || '0'),
        txnCount5m: toNumber(result.txnCount5m || '0'),
        
        // Keep original fields for reference and fallback
        buyCount24: result.buyCount24 || 0,
        sellCount24: result.sellCount24 || 0,
        txnCount24: result.txnCount24 || 0,
      };

      return normalized as TokenWithDexPaid;
    };

    const fetchXStocks = async (useCache = true, showLoading = false) => {
      if (cancelled) return;

      if (useCache) {
        const cached = loadFromCache();
        if (cached && cached.length > 0) {
          setXStocksRaw(cached);
          setXStocksError(null);
          setXStocksLoading(false);
          
          // Refresh in background if stale
          try {
            const cachedData = localStorage.getItem(CACHE_KEY);
            if (cachedData) {
              const parsed = JSON.parse(cachedData);
              const age = Date.now() - parsed.timestamp;
              if (age > CACHE_TTL) {
                fetchXStocks(false, false).catch(err => {
                  console.error('[Discover] xStocks background refresh failed:', err);
                });
              }
            }
          } catch {
            // Ignore
          }
          return;
        }
      }

      if (showLoading) {
        setXStocksLoading(true);
      }

      try {
        const response = await fetch(`/api/token-service/xstocks?limit=50`, {
          headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = await response.json();
        if (cancelled) return;

        // Process filterTokens response from Codex
        if (payload?.data?.filterTokens?.results || payload?.filterTokens?.results) {
          // Handle both nested (payload.data.filterTokens) and direct (payload.filterTokens) formats
          const results = payload?.data?.filterTokens?.results || payload.filterTokens.results || [];
          
          const normalized = results
            .filter((result: any) => {
              const token = result.token;
              if (!token || !token.address) return false;
              if (isWrappedSol({ mint: token.address })) return false;
              
              // Filter out zero liquidity
              const liq = toNumber(result.liquidity || '0');
              if (liq <= 0) return false;
              
              return true;
            })
            .map(normalizeXStocksToken);

          // Deduplicate by mint
          const seen = new Set<string>();
          const deduped = normalized.filter((token: TokenWithDexPaid) => {
            if (!token.mint || seen.has(token.mint)) return false;
            seen.add(token.mint);
            return true;
          });

          setXStocksRaw(deduped);
          setXStocksError(null);
          saveToCache(deduped);
        } else {
          // No results found
          setXStocksRaw([]);
          setXStocksError(null);
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to fetch xStocks';
        setXStocksError(message);
        console.error('[Discover] Failed to fetch xStocks:', err);
        
        if (useCache) {
          const cached = loadFromCache();
          if (cached && cached.length > 0) {
            setXStocksRaw(cached);
            setXStocksError(null);
          }
        }
      } finally {
        if (!cancelled && showLoading) {
          setXStocksLoading(false);
        }
      }
    };

    const hasInitialData = xStocksRaw.length > 0;
    
    if (hasInitialData) {
      setXStocksLoading(false);
      fetchXStocks(false, false).catch(err => {
        console.error('[Discover] xStocks background fetch failed:', err);
      });
    } else {
      fetchXStocks(true, true);
    }
    
    intervalId = setInterval(() => fetchXStocks(true, false), 60_000);

    return () => {
      cancelled = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []); // Empty deps - only run once on mount

  // Debug log to track timeframe changes
  // useEffect(() => {
  //   console.log('🔍 Discover: selectedTimeframe changed to:', selectedTimeframe);
  // }, [selectedTimeframe]);

  // QUICK BUY handler – using enhanced trade flow (same as PulseTable)
  const handleQuickBuy = async (token: Token) => {
    console.log("🎯 Enhanced Quick Buy called for token:", token.symbol);
    
    if (!user?.bearerToken || !user?.id) {
      console.log("❌ User not logged in");
      showEnhancedToast('warning', 'Please connect your wallet to trade', {
        title: 'Authentication Required',
      });
      return;
    }

    const buyAmount = parseFloat(quickBuyAmount);
    if (isNaN(buyAmount) || buyAmount <= 0) {
      console.log("❌ Invalid buy amount:", quickBuyAmount);
      showEnhancedToast('warning', 'Please enter a valid SOL amount (minimum 0.001 SOL)', {
        title: 'Invalid Amount',
      });
      return;
    }

    // Get preset based on selected pill (local state) or activePreset (global)
    const presetIndex = parseInt(selectedPill.replace('P', '')) - 1;
    const preset = presets[presetIndex];
    if (!preset) {
      console.log("❌ Quick buy preset missing for index", presetIndex);
      showEnhancedToast('error', 'Quick buy preset not configured', {
        title: 'Configuration Error',
        suggestions: ['Update your presets in settings'],
      });
      return;
    }

    const settings = preset.quickBuySettings;

    // Execute enhanced trade with all features
    const result = await executeEnhancedTrade({
      token,
      amount: buyAmount,
      side: 'buy',
      settings,
      user: { bearerToken: user.bearerToken, id: user.id },
      solBalance: Number(solBalance || 0),
      solPriceUsd: 150, // TODO: Get real SOL price
      onSuccess: (txHash, stats) => {
        console.log('✅ Enhanced Quick Buy successful:', { txHash, stats });
      },
      onError: (error) => {
        console.error('❌ Enhanced Quick Buy failed:', error);
      },
      onWarning: (warnings) => {
        console.warn('⚠️ Pre-transaction warnings:', warnings);
      },
    });

    return result;
  };

  const handleTimeframeClick = (tf: string) => {
    // console.log('🖱️ Discover: Timeframe clicked:', tf);
    setSelectedTimeframe(tf as Timeframe);
    setSortKey("volume");
    setSortDirection("desc");
  };

  // Helper to compute volume by timeframe for sorting in trending view
  // Checks direct volume field first, then calculates from buy/sell volumes
  const getVolumeForTimeframe = useCallback((t: any, tf: Timeframe) => {
    // Try direct volume field first
    let vol = t?.[`volume_${tf}`];
    if (typeof vol === 'number' && vol > 0) return vol;
    if (typeof vol === 'string' && vol.trim() !== '') {
      const n = parseFloat(vol);
      if (!isNaN(n) && n > 0) return n;
    }
    
    // If volume is 0 or missing, try calculating from buy/sell volumes
    const buyVol = t?.[`total_buy_volume_${tf}`];
    const sellVol = t?.[`total_sell_volume_${tf}`];
    const buyNum = typeof buyVol === 'number' ? buyVol : (typeof buyVol === 'string' ? parseFloat(buyVol) || 0 : 0);
    const sellNum = typeof sellVol === 'number' ? sellVol : (typeof sellVol === 'string' ? parseFloat(sellVol) || 0 : 0);
    const sum = buyNum + sellNum;
    
    return sum > 0 ? sum : 0;
  }, []);

  // Map AMM IDs to protocol patterns (same logic as PulseTable)
  const mapAmmToProtocolPatterns = useCallback((ammId: string): string[] => {
    switch (ammId) {
      case 'pump':
      case 'pump_amm':
        return ['pump.fun', 'pump'];
      case 'raydium_amm':
      case 'amm_v3':
        return ['raydium', 'raydiumlaunchpad'];
      case 'cp_amm':
      case 'lb_clmm':
        return ['meteora', 'meteora_v2'];
      case 'token_launchpad':
        return ['moonit', 'moonshot', 'moonshoot'];
      case 'raydium_launchpad':
        return ['bonk'];
      default:
        return [ammId.toLowerCase()];
    }
  }, []);

  // Apply filters to tokens
  const applyFilters = useCallback((tokens: TokenWithDexPaid[]) => {
    let filtered = [...tokens];

    if (normalizedSearch) {
      filtered = filtered.filter((token) => {
        const tokenText = `${token.name || ""} ${token.symbol || ""}`.toLowerCase();
        return tokenText.includes(normalizedSearch);
      });
    }

    // Protocol/AMM filter - filter by launchpad_protocol (same as PulseTable)
    if (filter.amms && filter.amms.length > 0) {
      const protocolPatterns = filter.amms.flatMap(ammId => mapAmmToProtocolPatterns(ammId));
      filtered = filtered.filter(token => {
        const launchpadProtocol = ((token as any).launchpad_protocol || '').toLowerCase();
        if (!launchpadProtocol) return false;
        
        // Check if token's protocol matches any selected AMM's protocol patterns
        return protocolPatterns.some(pattern => {
          const patternLower = pattern.toLowerCase();
          // Direct match
          if (launchpadProtocol === patternLower) return true;
          // Substring match (e.g., "raydiumlaunchpad" contains "raydium")
          if (launchpadProtocol.includes(patternLower) || patternLower.includes(launchpadProtocol)) return true;
          return false;
        });
      });
    }

    // Search keywords
    if (filter.searchKeywords.trim()) {
      const searchTerms = filter.searchKeywords.toLowerCase().split(',').map(term => term.trim()).filter(term => term);
      if (searchTerms.length > 0) {
        filtered = filtered.filter(token => {
          const tokenText = `${token.name || ''} ${token.symbol || ''}`.toLowerCase();
          return searchTerms.some(term => tokenText.includes(term));
        });
      }
    }

    // Exclude keywords
    if (filter.excludeKeywords.trim()) {
      const excludeTerms = filter.excludeKeywords.toLowerCase().split(',').map(term => term.trim()).filter(term => term);
      if (excludeTerms.length > 0) {
        filtered = filtered.filter(token => {
          const tokenText = `${token.name || ''} ${token.symbol || ''}`.toLowerCase();
          return !excludeTerms.some(term => tokenText.includes(term));
        });
      }
    }

    // Market cap filter
    if (filter.marketCapMin || filter.marketCapMax) {
      filtered = filtered.filter(token => {
        const marketCap = Number(token.fully_diluted_value) || 0;
        const min = filter.marketCapMin ? Number(filter.marketCapMin) : 0;
        const max = filter.marketCapMax ? Number(filter.marketCapMax) : Infinity;
        return marketCap >= min && marketCap <= max;
      });
    }

    // Volume filter
    if (filter.volumeMin || filter.volumeMax) {
      filtered = filtered.filter(token => {
        const volume = getVolumeForTimeframe(token, selectedTimeframe);
        const min = filter.volumeMin ? Number(filter.volumeMin) : 0;
        const max = filter.volumeMax ? Number(filter.volumeMax) : Infinity;
        return volume >= min && volume <= max;
      });
    }

    // Liquidity filter
    if (filter.liquidityMin || filter.liquidityMax) {
      filtered = filtered.filter(token => {
        const liquidity = Number(token.total_liquidity_usd) || 0;
        const min = filter.liquidityMin ? Number(filter.liquidityMin) : 0;
        const max = filter.liquidityMax ? Number(filter.liquidityMax) : Infinity;
        return liquidity >= min && liquidity <= max;
      });
    }

    return filtered;
  }, [filter, selectedTimeframe, getVolumeForTimeframe, mapAmmToProtocolPatterns, normalizedSearch]);

  // Count active filters for badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filter.amms && filter.amms.length > 0) count += filter.amms.length;
    if (filter.searchKeywords?.trim()) count++;
    if (filter.excludeKeywords?.trim()) count++;
    if (filter.dexPaid) count++;
    if (filter.marketCapMin || filter.marketCapMax) count++;
    if (filter.volumeMin || filter.volumeMax) count++;
    if (filter.liquidityMin || filter.liquidityMax) count++;
    return count;
  }, [filter]);

  // Sorting handler
  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  // Update token map when allTokens changes
  useEffect(() => {
    if (allTokens && Array.isArray(allTokens)) {
      const newMap = new Map<string, TokenWithDexPaid>();
      
      allTokens.forEach((token: any) => {
        // CRITICAL: Filter out wrapped SOL tokens explicitly
        if (!token || !token.mint || isWrappedSol(token)) {
          return;
        }
        
        // Ensure we have valid token data (not quote tokens)
        if (token.quoteMint === WRAPPED_SOL_MINT && !token.pair_address && !token.mint) {
          return; // Skip if this looks like quote token data
        }
        
        // Create a deep copy to avoid mutation issues
        const tokenCopy = JSON.parse(JSON.stringify(token)) as TokenWithDexPaid;
        
        // CRITICAL: Use mint as primary key to prevent wrapped SOL duplicates
        // Wrapped SOL can have different pair_addresses but same mint
        const baseKey = tokenCopy.mint || tokenCopy.pair_address;
        if (!baseKey || baseKey === WRAPPED_SOL_MINT || isWrappedSol(tokenCopy)) {
          return; // Skip invalid keys or wrapped SOL
        }
        
        // If key already exists, keep the one with more complete data
        const existing = newMap.get(baseKey);
        if (existing) {
          const existingKeys = Object.keys(existing).length;
          const newKeys = Object.keys(tokenCopy).length;
          if (newKeys > existingKeys) {
            newMap.set(baseKey, tokenCopy);
          }
        } else {
          newMap.set(baseKey, tokenCopy);
        }
      });
      
      tokenMapRef.current = newMap;

      const arr = Array.from(tokenMapRef.current.values());
      // Final safety check: filter out any wrapped SOL that might have slipped through
      const filtered = arr.filter(t => !isWrappedSol(t));
      setFilteredTokens(filtered);
    }
  }, [allTokens, isWrappedSol]);

  // Update displayed tokens
  // CRITICAL: This effect applies filters and updates displayed tokens
  // It depends on filteredTokens (which comes from allTokens) and filter context
  useEffect(() => {
    if (activeTab === "trending") {
      const arr = Array.from(tokenMapRef.current.values());
      
      // Safety check: filter out wrapped SOL before processing
      const safeArr = arr.filter(t => t && t.mint && !isWrappedSol(t));
      
      // Apply filters - this will re-run when filter context changes
      // CRITICAL: applyFilters uses filter context, so when filters change, this will re-run
      const filtered = applyFilters(safeArr);
      
      // When no filters are active, prevent timeframe switches from collapsing the list.
      // If the filtered list is unexpectedly tiny (e.g., Birdeye only returns 24h data),
      // fall back to the baseline safe array so every timeframe shows a full slate.
      const baselineThreshold = Math.max(
        10,
        Math.floor(Math.min(safeArr.length, 80) * 0.25)
      );
      const shouldUseBaseline =
        activeFilterCount === 0 &&
        safeArr.length > 0 &&
        filtered.length < Math.min(baselineThreshold, safeArr.length);
      const workingTokens = shouldUseBaseline ? safeArr : filtered;
      
      console.log(`[Filters] Applied filters to ${safeArr.length} tokens, result: ${filtered.length} tokens`, {
        activeFilters: {
          amms: filter.amms?.length || 0,
          searchKeywords: filter.searchKeywords || '',
          excludeKeywords: filter.excludeKeywords || '',
          marketCapMin: filter.marketCapMin,
          marketCapMax: filter.marketCapMax,
          volumeMin: filter.volumeMin,
          volumeMax: filter.volumeMax,
          liquidityMin: filter.liquidityMin,
          liquidityMax: filter.liquidityMax,
        }
      });
      
      // Create deep copies to avoid mutation during sort
      const sortedTokens = workingTokens.map(t => JSON.parse(JSON.stringify(t)));
      
      sortedTokens.sort((a, b) => {
        // Final safety check in sort
        if (!a || !b || isWrappedSol(a) || isWrappedSol(b)) {
          return 0;
        }
        
        let aVal = 0, bVal = 0;
        if (sortKey === 'volume') {
          aVal = getVolumeForTimeframe(a, selectedTimeframe);
          bVal = getVolumeForTimeframe(b, selectedTimeframe);
        } else if (sortKey === 'liquidity' || sortKey === 'total_liquidity_usd') {
          aVal = Number((a as any).total_liquidity_usd) || 0;
          bVal = Number((b as any).total_liquidity_usd) || 0;
        } else if (sortKey === 'market_cap_total' || sortKey === 'fully_diluted_value') {
          aVal = Number((a as any).fully_diluted_value) || 0;
          bVal = Number((b as any).fully_diluted_value) || 0;
        } else {
          aVal = Number((a as any)[sortKey]) || 0;
          bVal = Number((b as any)[sortKey]) || 0;
        }
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      });
      
      // Final filter before setting displayed - also deduplicate by mint/address
      const finalSafe = sortedTokens.filter(t => t && t.mint && !isWrappedSol(t));
      
      // Ensure every token has some kind of image to display (fallback to initials if missing)
      const normalizedTokens = finalSafe.map((t: any) => {
        const hasImage = t?.uri || t?.logo || t?.image || t?.imageUrl;
        if (hasImage && hasImage !== '' && hasImage !== 'null' && hasImage !== null) {
          return t;
        }

        const initials = t?.symbol || t?.name || 'T';
        const fallbackImage = `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=0f1012&color=E6E7EA&size=64`;
        return {
          ...t,
          image: fallbackImage,
          logo: fallbackImage,
          uri: fallbackImage,
        };
      });
      
      // CRITICAL: Deduplicate using Set to track seen mints AND addresses
      // This prevents duplicate wrapped SOL with different pair_addresses
      const seenAddresses = new Set<string>();
      const seenMints = new Set<string>();
      const uniqueSafe: TokenWithDexPaid[] = [];
      
      for (const token of normalizedTokens) {
        const mint = token.mint;
        const address = token.pair_address;
        
        // Skip if we've already seen this mint (prevents wrapped SOL duplicates)
        if (mint && seenMints.has(mint)) {
          continue;
        }
        
        // Also check address to be safe
        if (address && seenAddresses.has(address)) {
          continue;
        }
        
        // Mark as seen and add to results
        if (mint) seenMints.add(mint);
        if (address) seenAddresses.add(address);
        uniqueSafe.push(token);
      }
      
      setDisplayed(uniqueSafe);
    } else if (activeTab === "dex") {
      // dex tab → show limited slice
      const safe = filteredTokens.filter(t => t && t.mint && !isWrappedSol(t));
      setDisplayed(safe.slice(0, 10));
    } else {
      setDisplayed([]);
    }
  }, [activeTab, filteredTokens, sortKey, sortDirection, selectedTimeframe, applyFilters, getVolumeForTimeframe, isWrappedSol, filter, activeFilterCount]); // Ensure filters are reapplied when they change

  const processedNewPairs = useMemo(() => {
    if (!newPairsRaw || newPairsRaw.length === 0) {
      return [] as TokenWithDexPaid[];
    }

    const base = newPairsRaw.filter((token) => {
      if (!token || !token.mint || isWrappedSol(token)) {
        return false;
      }
      // Filter out Meteora tokens from new pairs
      const protocol = ((token as any).launchpad_protocol || (token as any).launchpadProtocol || (token as any).protocol || '').toLowerCase();
      if (protocol.includes('meteora')) {
        return false;
      }
      // Filter out tokens with 0 liquidity
      const liquidity = Number((token as any).total_liquidity_usd || (token as any).liquidity_usd || 0);
      if (liquidity <= 0) {
        return false;
      }
      // Filter out tokens with 0 volume - check all timeframes
      const hasVolume = ['1h', '6h', '24h', '5m'].some(tf => {
        const vol = getVolumeForTimeframe(token, tf as Timeframe);
        return vol > 0;
      });
      if (!hasVolume) {
        return false;
      }
      // Filter out tokens with no image
      const hasImage = (token as any)?.uri || (token as any)?.logo || (token as any)?.image || (token as any)?.imageUrl;
      if (!hasImage || hasImage === '' || hasImage === 'null' || hasImage === null) {
        return false;
      }
      return true;
    });
    const filtered = applyFilters(base);
    const sortedTokens = filtered.map((token) => JSON.parse(JSON.stringify(token)) as TokenWithDexPaid);

    sortedTokens.sort((a, b) => {
      if (!a || !b) return 0;
      let aVal = 0;
      let bVal = 0;

      if (sortKey === 'volume') {
        aVal = getVolumeForTimeframe(a, selectedTimeframe);
        bVal = getVolumeForTimeframe(b, selectedTimeframe);
      } else if (sortKey === 'liquidity' || sortKey === 'total_liquidity_usd') {
        aVal = Number((a as any).total_liquidity_usd) || 0;
        bVal = Number((b as any).total_liquidity_usd) || 0;
      } else if (sortKey === 'market_cap_total' || sortKey === 'fully_diluted_value') {
        aVal = Number((a as any).fully_diluted_value) || 0;
        bVal = Number((b as any).fully_diluted_value) || 0;
      } else {
        aVal = Number((a as any)[sortKey]) || 0;
        bVal = Number((b as any)[sortKey]) || 0;
      }

      const diff = sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      if (diff !== 0) {
        return diff;
      }

      const tsA = getNewPairTimestamp(a);
      const tsB = getNewPairTimestamp(b);
      return tsB - tsA;
    });

    const seenMints = new Set<string>();
    const seenAddresses = new Set<string>();
    const unique: TokenWithDexPaid[] = [];

    for (const token of sortedTokens) {
      const mint = token?.mint;
      const address = (token as any)?.pair_address;

      if (mint && seenMints.has(mint)) continue;
      if (address && seenAddresses.has(address)) continue;

      if (mint) seenMints.add(mint);
      if (address) seenAddresses.add(address);
      unique.push(token);
    }

    return unique;
  }, [newPairsRaw, applyFilters, getVolumeForTimeframe, getNewPairTimestamp, isWrappedSol, sortDirection, sortKey, selectedTimeframe]);

  const newPairsRows = useMemo(
    () =>
      processedNewPairs.map((token, index) => ({
        token,
        i: index,
      })),
    [processedNewPairs]
  );

  // Process xStocks data similar to newPairs
  const processedXStocks = useMemo(() => {
    if (!xStocksRaw || xStocksRaw.length === 0) {
      return [] as TokenWithDexPaid[];
    }

    const base = xStocksRaw.filter((token) => {
      if (!token || !token.mint || isWrappedSol(token)) {
        return false;
      }
      // Filter out tokens with 0 liquidity
      const liquidity = Number((token as any).total_liquidity_usd || (token as any).liquidity_usd || 0);
      if (liquidity <= 0) {
        return false;
      }
      return true;
    });

    // Apply filters
    const filtered = applyFilters(base);

    // Sort tokens
    const sortedTokens = [...filtered].sort((a, b) => {
      let aVal = 0, bVal = 0;
      if (sortKey === 'volume') {
        aVal = getVolumeForTimeframe(a, selectedTimeframe);
        bVal = getVolumeForTimeframe(b, selectedTimeframe);
      } else if (sortKey === 'liquidity' || sortKey === 'total_liquidity_usd') {
        aVal = Number((a as any).total_liquidity_usd) || 0;
        bVal = Number((b as any).total_liquidity_usd) || 0;
      } else if (sortKey === 'market_cap_total' || sortKey === 'fully_diluted_value') {
        aVal = Number((a as any).fully_diluted_value) || 0;
        bVal = Number((b as any).fully_diluted_value) || 0;
      } else {
        aVal = Number((a as any)[sortKey]) || 0;
        bVal = Number((b as any)[sortKey]) || 0;
      }
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });

    // Deduplicate
    const seenMints = new Set<string>();
    const seenAddresses = new Set<string>();
    const unique: TokenWithDexPaid[] = [];

    for (const token of sortedTokens) {
      const mint = token?.mint;
      const address = (token as any)?.pair_address;

      if (mint && seenMints.has(mint)) continue;
      if (address && seenAddresses.has(address)) continue;

      if (mint) seenMints.add(mint);
      if (address) seenAddresses.add(address);
      unique.push(token);
    }

    return unique;
  }, [xStocksRaw, applyFilters, getVolumeForTimeframe, isWrappedSol, sortDirection, sortKey, selectedTimeframe]);

  const xStocksRows = useMemo(
    () =>
      processedXStocks.map((token, index) => ({
        token,
        i: index,
      })),
    [processedXStocks]
  );

  const renderPrimaryTable = () => {
    if (displayed.length > 0) {
      return (
        <InterstateTable
          rows={displayed.map((token, i) => ({
            token: token as Token,
            i,
          }))}
          onQuickBuy={handleQuickBuy}
          sortKey={sortKey}
          sortDirection={sortDirection}
          setSort={handleSort}
          selectedTimeframe={selectedTimeframe}
          quickBuyAmount={Number(quickBuyAmount) || 0}
        />
      );
    }

    if (allTokens && Array.isArray(allTokens) && allTokens.length > 0) {
      return (
        <InterstateTable
          rows={allTokens.map((token, i) => ({
            token: token as Token,
            i,
          }))}
          onQuickBuy={handleQuickBuy}
          sortKey={sortKey}
          sortDirection={sortDirection}
          setSort={handleSort}
          selectedTimeframe={selectedTimeframe}
          quickBuyAmount={Number(quickBuyAmount) || 0}
        />
      );
    }

    if (tokensLoading) {
      return (
        <div className="space-y-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-12 w-full bg-[#1E1F26] animate-pulse rounded" />
          ))}
        </div>
      );
    }

    if (tokenError) {
      return <div className="py-10 text-center" style={{ color: '#f26681' }}>{tokenError}</div>;
    }

    return <div className="py-10 text-center text-[#9CA3AF]">No tokens found.</div>;
  };


  /* ------- map tokens -> PumpItem for Live Pump (uses cached images) ------- */
  const toPumpItem = (t: any): PumpItem => {
    const name = t?.name || t?.symbol || '—';
    const sym = t?.symbol ? String(t.symbol).slice(0, 12) : undefined;
    const desc = t?.description || t?.bio || '';
    const age = t?.age_label || '22m'; // fallback display label
    const mcNum = Number(t?.fully_diluted_value || 0);
    const mc =
      mcNum > 0
        ? (mcNum >= 1_000_000
            ? `$${(mcNum / 1_000_000).toFixed(2)}M`
            : mcNum >= 1_000
            ? `$${(mcNum / 1_000).toFixed(2)}K`
            : `$${mcNum.toFixed(0)}`)
        : undefined;

    const { cover, avatar } = getCachedImagesForToken(t);

    return {
      id: t?.pair_address || t?.mint || Math.random().toString(36).slice(2),
      name,
      symbol: sym,
      desc,
      age,
      mc,
      coverUrl: cover,
      avatarUrl: avatar,
      verified: Boolean(t?.verified),
      hot: Boolean(t?.hot),
    };
  };

  // Create a helper to map PumpPortal tokens to PumpItem format
  const toPumpPortalItem = (t: any): PumpItem => {
    const name = t?.name || t?.symbol || '—';
    const sym = t?.symbol ? String(t.symbol).slice(0, 12) : undefined;
    const desc = t?.description || t?.bio || '';
    
    // Calculate age from timestamp
    const age = t?.timestamp 
      ? (() => {
          const seconds = Math.floor((Date.now() - t.timestamp) / 1000);
          if (seconds < 60) return `${seconds}s`;
          if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
          if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
          return `${Math.floor(seconds / 86400)}d`;
        })()
      : '1m';
    
    const mcNum = Number(t?.market_cap_usd || (t?.marketCapSol ? (t.marketCapSol * 170) : 0));
    const mc =
      mcNum > 0
        ? (mcNum >= 1_000_000
            ? `$${(mcNum / 1_000_000).toFixed(2)}M`
            : mcNum >= 1_000
            ? `$${(mcNum / 1_000).toFixed(2)}K`
            : `$${mcNum.toFixed(0)}`)
        : undefined;

    // Use cached images to ensure they persist across re-renders
    const { cover, avatar } = getCachedImagesForToken(t);
    
    // For PumpPortal tokens, use the same image for both cover and avatar
    // The large box (cover) shows the full image, the small box (avatar) shows the token image
    const imageUrl = cover || t?.image || undefined;
    const avatarImageUrl = avatar || imageUrl || undefined;
    
    // Debug: Log individual token mapping
    console.log(`[toPumpPortalItem] Mapping ${name}:`, {
      hasImage: !!t.image,
      hasCover: !!cover,
      finalImageUrl: !!imageUrl,
      finalAvatarUrl: !!avatarImageUrl,
      raw: { tImage: t.image, cover, avatar }
    });

    return {
      id: t?.pair_address || t?.mint || Math.random().toString(36).slice(2),
      name,
      symbol: sym,
      desc,
      age,
      mc,
      coverUrl: imageUrl, // Large box - full token image
      avatarUrl: avatarImageUrl, // Small box - token image (same as large box for PumpPortal)
      verified: false,
      hot: true, // Mark all PumpPortal tokens as hot/live
      _rawToken: t, // Store raw token for backfill
    };
  };

  const liveLeftItems: PumpItem[] = pumpPortalTokens.slice(0, 30).map(toPumpPortalItem);
  const liveRightItems: PumpItem[] = pumpPortalTokens.slice(30, 60).map(toPumpPortalItem);

  // Debug: Log image data for PumpPortal tokens
  useEffect(() => {
    if (pumpPortalTokens.length > 0) {
      console.log('[Discover] PumpPortal tokens with image data:', 
        pumpPortalTokens.slice(0, 12).map(t => ({
          name: t.name,
          mint: t.mint,
          hasUri: !!t.uri,
          hasImage: !!t.image,
          uri: t.uri,
          image: t.image
        }))
      );
    }
  }, [pumpPortalTokens]);

  // Simple LRU-ish trim when the cache gets large (optional)
  useEffect(() => {
    const MAX = 1500; // tune to your needs
    const cache = imageCacheRef.current;
    if (cache.size > MAX) {
      const toDrop = Math.ceil(MAX * 0.1);
      const it = cache.keys();
      for (let i = 0; i < toDrop; i++) {
        const k = it.next().value as string | undefined;
        if (!k) break;
        cache.delete(k);
      }
    }
  }, [displayed]);

  return (
    <>
      <Head>
        <title>Interstate Memeboard | Discover</title>
        <meta name="description" content="Interstate dashboard" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=2" />
        {/* Preload the static fallbacks used many times in PumpLive */}
        <link rel="preload" as="image" href="/placeholder/fallback-cover.jpg" />
        <link rel="preload" as="image" href="/placeholder/fallback-avatar.jpg" />
      </Head>

      <div className="min-h-screen text-[#E6E7EA] relative" style={{ backgroundColor: '#111214' }}>
        {/* Header */}
        <div className='relative' style={{ zIndex: 100 }}>
          <Header search={search} setSearch={setSearch} selectedTimeframe={selectedTimeframe} />
        </div>

        {/* Tab Navigation */}
        <div className="my-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 lg:gap-6 px-4 sm:px-6 lg:px-8">
          {/* Tabs Section - Scrollable on mobile */}
          <div className="flex items-center gap-3 sm:gap-4 lg:gap-6 overflow-x-auto scrollbar-hide pb-2 lg:pb-0 -mx-4 sm:-mx-6 lg:mx-0 px-4 sm:px-6 lg:px-0">
            <button
              className={`text-sm sm:text-base lg:text-lg font-light transition-colors whitespace-nowrap ${activeTab === "trending" ? "text-[#f0f5f5]" : "text-[#6B7280] hover:text-[#f0f5f5]"} cursor-pointer`}
              onClick={() => setActiveTab("trending")}
            >
              Trending
            </button>
            <button
              className={`text-sm sm:text-base lg:text-lg font-light transition-colors whitespace-nowrap ${activeTab === "newPairs" ? "text-[#f0f5f5]" : "text-[#6B7280] hover:text-[#f0f5f5]"} cursor-pointer`}
              onClick={() => setActiveTab("newPairs")}
            >
              New Pairs
            </button>
            {/* Hide xStocks, surge, and live tabs when Monad is selected */}
            {currentChain !== 'monad' && (
              <>
                <button
                  className={`text-sm sm:text-base lg:text-lg font-light transition-colors whitespace-nowrap ${activeTab === "xStocks" ? "text-[#f0f5f5]" : "text-[#6B7280] hover:text-[#f0f5f5]"} cursor-pointer`}
                  onClick={() => setActiveTab("xStocks")}
                >
                  xStocks
                </button>
                <button
                  className={`text-sm sm:text-base lg:text-lg font-light transition-colors whitespace-nowrap ${activeTab === "surge" ? "text-[#f0f5f5]" : "text-[#6B7280] hover:text-[#f0f5f5]"} cursor-pointer`}
                  onClick={() => setActiveTab("surge")}
                >
                  Surge
                </button>
                <button
                  className={`text-sm sm:text-base lg:text-lg font-light transition-colors whitespace-nowrap ${activeTab === "live" ? "text-[#f0f5f5]" : "text-[#6B7280] hover:text-[#f0f5f5]"} cursor-pointer`}
                  onClick={() => setActiveTab("live")}
                >
                  Pump Live
                </button>
              </>
            )}
            {/* <button
              className={`text-lg font-light transition-colors ${activeTab === "dex" ? "text-[#f0f5f5]" : "text-[#6B7280] hover:text-[#f0f5f5]"} cursor-pointer`}
              onClick={() => setActiveTab("dex")}
            >
              DEX Screener
            </button> */}
          </div>

          {/* Right controls - Stack on mobile, row on desktop */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 lg:gap-4">
            {/* Connection status - commented out per user request */}
            {/* <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : usingFallback ? 'bg-yellow-400' : 'bg-red-400'}`}></div>
              <span className="text-xs text-neutral-400">
                {isConnected ? 'Live' : 'Disconnected'}
              </span>
            </div> */}

            {/* Timeframes - hide when on live tab, new pairs, xStocks, or surge */}
            {activeTab !== 'live' && activeTab !== 'newPairs' && activeTab !== 'xStocks' && activeTab !== 'surge' && (
              <div className="hidden sm:flex items-center justify-center gap-1 rounded-md px-1.5 border relative"
                   style={{ borderColor: '#24252C', backgroundColor: '#272a2e', paddingTop: '4px', paddingBottom: '4px', minWidth: '130px', width: '130px', height: '28px' }}>
                {(["5m", "1h", "6h", "24h"] as Timeframe[]).map((tf: Timeframe) => (
                  <div key={tf} className="relative flex items-center justify-center">
                    <button
                      className="px-1 text-sm font-medium transition-all duration-200 cursor-pointer flex items-center justify-center rounded whitespace-nowrap"
                      style={{
                        paddingTop: '2px',
                        paddingBottom: '2px',
                        backgroundColor: selectedTimeframe === tf 
                          ? 'rgba(24, 196, 140, 0.15)' 
                          : 'rgba(22, 23, 28, 0.6)',
                        color: selectedTimeframe === tf ? '#f0f5f5' : ''
                      }}
                      onClick={() => handleTimeframeClick(tf)}
                      onMouseEnter={(e) => {
                        if (selectedTimeframe !== tf) {
                          e.currentTarget.style.color = '#f0f5f5';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedTimeframe !== tf) {
                          e.currentTarget.style.color = '';
                        }
                      }}
                    >
                      {tf}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Filter button - hidden when in Live Pump tab */}
            {activeTab !== 'live' && (
              <div className="hidden sm:flex items-center justify-center rounded-md px-1.5 gap-1 border relative"
                   style={{ borderColor: '#24252C', backgroundColor: '#272a2e', paddingTop: '4px', paddingBottom: '4px', minWidth: '85px', width: '85px', height: '28px' }}>
                <button
                  className="flex items-center justify-between w-full h-full transition-all duration-200 cursor-pointer relative"
                  onClick={() => setIsFilterPopoutOpen(true)}
                  onMouseEnter={(e) => {
                    const text = e.currentTarget.querySelector('span');
                    const icon = e.currentTarget.querySelector('svg');
                    if (text) text.style.color = '#f0f5f5';
                    if (icon) icon.style.color = '#f0f5f5';
                  }}
                  onMouseLeave={(e) => {
                    const text = e.currentTarget.querySelector('span');
                    const icon = e.currentTarget.querySelector('svg');
                    const activeColor = isFilterPopoutOpen ? '#526fff' : '#9CA3AF';
                    if (text) text.style.color = activeColor;
                    if (icon) icon.style.color = activeColor;
                  }}
                >
                  <span 
                    className="text-sm font-medium"
                    style={{ color: isFilterPopoutOpen ? '#526fff' : '#9CA3AF' }}
                  >
                    Filter
                  </span>
                  <BsSliders2 
                    size={14} 
                    style={{ color: isFilterPopoutOpen ? '#526fff' : '#9CA3AF' }}
                  />
                  
                  {/* Active Filter Count Badge */}
                  {activeFilterCount > 0 && (
                    <span 
                      className="absolute -top-1 -right-1 text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold"
                      style={{ backgroundColor: '#85d99f', color: '#f0f5f5', fontSize: '10px' }}
                    >
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* Thunder Icon and Amount Entry - Separate Thin Box */}
            <div className="hidden sm:flex items-center justify-center rounded-md px-1.5 gap-1 border"
                 style={{ borderColor: '#24252C', backgroundColor: '#272a2e', paddingTop: '4px', paddingBottom: '4px', minWidth: '85px', width: '85px', height: '28px' }}>
              <HiLightningBolt size={14} style={{ color: '#31e3ac' }} />
              <input
                type="text"
                value={quickBuyAmount}
                inputMode="decimal"
                onChange={(e) => {
                  const value = e.target.value;
                  // Allow only digits and at most one decimal point
                  if (value === '' || /^\d*\.?\d*$/.test(value)) {
                    setQuickBuyAmount(value);
                    const numValue = Number(value) || 0;
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('quickBuyAmount', numValue.toString());
                    }
                  }
                }}
                onKeyDown={(e) => {
                  // Block non-numeric keys except control/navigation keys and '.'
                  const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'];
                  if (allowedKeys.includes(e.key)) return;
                  if (e.key === '.') return;
                  if (!/^[0-9]$/.test(e.key)) {
                    e.preventDefault();
                  }
                }}
                className="bg-transparent border-none outline-none text-sm font-medium w-12 text-center"
                style={{ color: '#f0f5f5' }}
              />
            </div>
            
            {/* P1 P2 P3 Boxes - Separate Thin Box With Background Color */}
            <div className="hidden sm:flex items-center justify-center gap-1 rounded-md px-1.5 border relative"
                 style={{ borderColor: '#24252C', backgroundColor: '#272a2e', paddingTop: '4px', paddingBottom: '4px', minWidth: '100px', width: '100px', height: '28px' }}>
              {['P1', 'P2', 'P3'].map((pill) => {
                const presetIndex = parseInt(pill.replace('P', '')) - 1;
                const preset = presets[presetIndex];
                const settings = preset?.quickBuySettings;
                
                return (
                  <div key={pill} className="relative flex items-center justify-center">
                    <button
                      className="px-1 text-sm font-medium transition-all duration-200 cursor-pointer flex items-center justify-center rounded"
                      style={{
                        paddingTop: '2px',
                        paddingBottom: '2px',
                        backgroundColor: selectedPill === pill 
                          ? 'rgba(24, 196, 140, 0.15)' 
                          : 'rgba(22, 23, 28, 0.6)',
                        color: selectedPill === pill ? '#f0f5f5' : ''
                      }}
                      onClick={() => {
                        setSelectedPill(pill);
                        setActivePreset(presetIndex); // Also update global preset for consistency
                        console.log(`Selected ${pill} in discover page`);
                      }}
                      onMouseEnter={(e) => {
                        if (selectedPill !== pill) {
                          e.currentTarget.style.color = '#f0f5f5';
                        }
                        setShowPillTooltip(pill);
                      }}
                      onMouseLeave={(e) => {
                        if (selectedPill !== pill) {
                          e.currentTarget.style.color = '';
                        }
                        setShowPillTooltip(null);
                      }}
                    >
                      {pill}
                    </button>
                    
                    {/* Tooltip for each pill */}
                    {showPillTooltip === pill && settings && (
                      <div className="absolute top-full left-0 mt-1 w-28 rounded-lg shadow-xl border z-50"
                           style={{ 
                             backgroundColor: 'rgba(15, 16, 18, 0.95)',
                             borderColor: '#24252C' 
                           }}>
                        <div className="p-2 space-y-1.5">
                          {/* Slippage - Running person icon */}
                          <div className="flex items-center gap-1.5">
                            <FaRunning size={10} className="opacity-80" style={{ strokeWidth: '2' }} />
                            <span className="text-gray-300 text-xs font-light">{(settings.maxSlippage * 100).toFixed(0)}%</span>
                          </div>
                          
                          {/* Priority Fee - Gas pump icon with yellow styling */}
                          <div className="flex items-center gap-1.5">
                            <FaGasPump size={10} className="opacity-90" style={{ color: '#FCD34D', strokeWidth: '2' }} />
                            <span className="text-yellow-400 text-xs font-light">{settings.priority}</span>
                            <span className="text-xs font-light" style={{ color: '#d11f3a' }}>⚠</span>
                          </div>
                          
                          {/* Bribe - Coins icon with yellow styling */}
                          <div className="flex items-center gap-1.5">
                            <FaCoins size={10} className="opacity-90" style={{ color: '#FCD34D', strokeWidth: '2' }} />
                            <span className="text-yellow-400 text-xs font-light">{settings.bribe}</span>
                            <span className="text-xs font-light" style={{ color: '#d11f3a' }}>⚠</span>
                          </div>
                          
                          {/* MEV Protection - Ban icon */}
                          <div className="flex items-center gap-1.5">
                            <FaBan size={10} className="opacity-90" style={{ strokeWidth: '2' }} />
                            <span className="text-gray-300 text-xs font-light">
                              {settings.mevMode === 'off' ? 'Off' : 
                               settings.mevMode === 'reduced' ? 'Reduced' : 'Secure'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Filter Popout */}
        {isFilterPopoutOpen && (
          <FilterPopout 
            open={isFilterPopoutOpen} 
            onClose={() => setIsFilterPopoutOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="w-full">
          {activeTab === 'live' ? (
            pumpPortalTokens.length > 0 ? (
              <PumpLive
                leftItems={liveLeftItems}
                rightItems={liveRightItems}
                onAction={async (id, rawToken) => {
                  // Backfill token data first
                  if (rawToken) {
                    try {
                      console.log('[Discover] Backfilling token:', rawToken);
                      const backfillResponse = await fetch('/api/token-service/backfill-token', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                          mint: rawToken.mint,
                          name: rawToken.name,
                          symbol: rawToken.symbol,
                          uri: rawToken.uri,
                          market_cap_usd: rawToken.market_cap_usd || rawToken.marketCapSol ? (rawToken.marketCapSol * 170) : undefined,
                          liquidity_usd: undefined, // PumpPortal doesn't provide liquidity data
                          pair_address: rawToken.pair_address || rawToken.bondingCurveKey
                        })
                      });

                      if (backfillResponse.ok) {
                        console.log('[Discover] Token backfilled successfully');
                      } else {
                        console.warn('[Discover] Token backfill failed, but continuing with navigation');
                      }
                    } catch (err) {
                      console.error('[Discover] Error backfilling token:', err);
                    }
                  }

                  // Prefetch trade data before navigating
                  console.log('[Discover] Prefetching trade data for:', id);
                  try {
                    await prefetchTradeData(id);
                    console.log('[Discover] Prefetch complete for:', id);
                  } catch (err) {
                    console.error('[Discover] Prefetch failed:', err);
                  }
                  // Navigate to trade page
                  router.push(`/trade/${id}`);
                }}
                quickBuyAmount={Number(quickBuyAmount) || 0}
                onQuickBuy={handleQuickBuy}
              />
            ) : pumpPortalConnected && pumpPortalTokens.length === 0 ? (
              <div className="py-10 text-center text-[#9CA3AF]">
                Waiting for live tokens...
              </div>
            ) : !pumpPortalConnected && pumpPortalError ? (
              <div className="py-10 text-center" style={{ color: '#f26681' }}>
                Connection error: {pumpPortalError}
              </div>
            ) : (
              <div className="space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-20 w-full bg-[#1E1F26] animate-pulse rounded" />
                ))}
              </div>
            )
          ) : activeTab === 'newPairs' ? (
            <section aria-label="New Pairs">
              {/* <div className="mb-4 flex items-center justify-between">
                {newPairsLoading && (
                  <span className="text-xs font-medium text-[#9CA3AF]">
                    Updating…
                  </span>
                )}
              </div> */}

              {newPairsLoading && processedNewPairs.length === 0 && newPairsRaw.length === 0 ? (
                <div className="space-y-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-12 w-full bg-[#1E1F26] animate-pulse rounded" />
                  ))}
                </div>
              ) : newPairsError ? (
                <div className="py-10 text-center" style={{ color: '#f26681' }}>
                  {newPairsError}
                </div>
              ) : processedNewPairs.length > 0 ? (
                <InterstateTable
                  rows={newPairsRows}
                  onQuickBuy={handleQuickBuy}
                  sortKey={sortKey}
                  sortDirection={sortDirection}
                  setSort={handleSort}
                  selectedTimeframe={selectedTimeframe}
                  quickBuyAmount={Number(quickBuyAmount) || 0}
                />
              ) : (
                <div className="py-10 text-center text-[#9CA3AF]">
                  No new pairs available right now. Check back shortly.
                </div>
              )}
            </section>
          ) : activeTab === 'xStocks' ? (
            <section aria-label="xStocks" className="pb-8">
              {xStocksLoading && processedXStocks.length === 0 && xStocksRaw.length === 0 ? (
                <div className="space-y-4">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="h-12 w-full bg-[#1E1F26] animate-pulse rounded" />
                  ))}
                </div>
              ) : xStocksError && processedXStocks.length === 0 ? (
                <div className="py-10 text-center text-[#f26681]">
                  Error loading xStocks: {xStocksError}
                </div>
              ) : processedXStocks.length > 0 ? (
                <InterstateTable
                  rows={xStocksRows}
                  onQuickBuy={handleQuickBuy}
                  sortKey={sortKey}
                  sortDirection={sortDirection}
                  setSort={handleSort}
                  selectedTimeframe={selectedTimeframe}
                  quickBuyAmount={Number(quickBuyAmount) || 0}
                />
              ) : (
                <div className="py-10 text-center text-[#9CA3AF]">
                  No xStocks available right now. Check back shortly.
                </div>
              )}
            </section>
          ) : activeTab === 'surge' ? (
            <section aria-label="Surge">
              {/* <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-[#f0f5f5]">Surge</h2>
              </div> */}
              
              {/* Placeholder for Surge data - replace with actual data source */}
              <div className="py-10 text-center text-[#9CA3AF]">
                Surge data coming soon. Connect your data source here.
              </div>
              
              {/* When you have Surge data, use InterstateTable like this:
              <InterstateTable
                rows={surgeRows}
                onQuickBuy={handleQuickBuy}
                sortKey={sortKey}
                sortDirection={sortDirection}
                setSort={handleSort}
                selectedTimeframe={selectedTimeframe}
                quickBuyAmount={Number(quickBuyAmount) || 0}
              />
              */}
            </section>
          ) : (
            renderPrimaryTable()
          )}
        </main>

        <Footer />
        <QuickBuySettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    </>
  );
}
