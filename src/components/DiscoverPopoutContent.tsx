// src/components/DiscoverPopoutContent.tsx
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import InterstateTable from './InterstateTable';
import type { Token } from '~/utils/db';
import usePaginatedTokensWithFallback from '../hooks/usePaginatedTokensWithFallback';
import { usePumpPortalWebSocket } from '../hooks/usePumpPortalWebSocket';
import useTrendingWebSocket, { type TrendingTimeframe } from '../hooks/useTrendingWebSocket';
import { useDexScreenerTrending } from '../hooks/useDexScreenerTrending';
import { useQuickBuy } from "~/components/QuickBuyContext";
import QuickBuySettingsModal from '../components/QuickBuySettingsModal';
import { useFilter } from '../components/FilterContext';
import FilterPopout from '../components/FilterPopout';
import { SOL_MINT_ADDRESS } from "~/utils/api";
import { executeMonadMultiBuy, formatMonadTxSummary } from "~/utils/monadWalletAllocation";
import { executeEnhancedTrade } from "~/utils/enhancedTradeHandler";
import { showEnhancedToast, updateEnhancedToast } from "~/utils/enhancedToast";
import { useUser } from "~/components/UserContext";
import PumpLive, { type PumpItem, demoLeft as demoLeftPump, demoRight as demoRightPump } from '../components/PumpLive';
import { FaRunning, FaGasPump, FaCoins, FaBan, FaCheckCircle } from "react-icons/fa";
import { HiLightningBolt } from "react-icons/hi";
import { BsSliders2 } from "react-icons/bs";

import toast from "react-hot-toast";
import { extractTokenImage, getResolvedTokenImage } from "~/utils/images";
import { broadcastMonadQuickTrade } from "~/utils/monadTradeEvents";
import { broadcastTradeCompleted, notifyTradePending } from "~/utils/tradeEvents";
import { formatMonadError } from "~/utils/monadError";
import { validateMonadBuy, showTradeValidationError } from "~/utils/preTradeValidation";
import { listenForTradeEvents, transformToastToError } from "~/utils/createSolanaToastHandler";

const WRAPPED_SOL_MINT = SOL_MINT_ADDRESS;
const isDev = process.env.NODE_ENV !== 'production';

export type Timeframe = "5m" | "1h" | "6h" | "24h";

// Extend Token with optional flags
type TokenWithDexPaid = Token & { dexPaid?: boolean };

export default function DiscoverPopoutContent() {
  const router = useRouter();
  
  // CRITICAL: Initialize chain from router query immediately to avoid race conditions
  // Default to solana chain for popout
  const manualChainSwitchRef = useRef(false);
  const [currentChain, setCurrentChain] = useState<string>(() => {
    // Initialize from router query if available, otherwise default to 'sol'
    if (typeof window !== 'undefined' && router.isReady) {
      return (router.query.chain as string) || 'sol';
    }
    // Also check URL params directly for immediate access
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('chain') || 'sol';
    }
    return 'sol';
  });
  
  // Sync chain state with router query (only if not manually switched)
  useEffect(() => {
    if (!router.isReady || manualChainSwitchRef.current) {
      manualChainSwitchRef.current = false;
      return;
    }
    const chainFromQuery = (router.query.chain as string) || 'sol';
    if (chainFromQuery !== currentChain) {
      isDev && console.log('[DiscoverPopout] Chain changed from router:', currentChain, '->', chainFromQuery);
      setCurrentChain(chainFromQuery);
    }
  }, [router.query.chain, router.isReady]);

  // Also watch router.asPath as a fallback (only if not manually switched)
  useEffect(() => {
    if (!router.isReady || manualChainSwitchRef.current) {
      manualChainSwitchRef.current = false;
      return;
    }
    const urlParams = new URLSearchParams(router.asPath.split('?')[1] || '');
    const chainFromUrl = urlParams.get('chain') || 'sol';
    if (chainFromUrl !== currentChain) {
      isDev && console.log('[DiscoverPopout] Chain changed from URL:', currentChain, '->', chainFromUrl);
      setCurrentChain(chainFromUrl);
    }
  }, [router.asPath, router.isReady]);
  
  // For Monad, only allow 'trending' and 'newPairs' tabs
  // Initialize activeTab from localStorage to persist across navigation
  // Also respect chain restrictions during initialization
  const [activeTab, setActiveTab] = useState<'trending' | 'newPairs' | 'xStocks' | 'surge' | 'dex' | 'live'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('discover_active_tab');
        if (saved && ['trending', 'newPairs', 'xStocks', 'surge', 'dex', 'live'].includes(saved)) {
          const savedTab = saved as 'trending' | 'newPairs' | 'xStocks' | 'surge' | 'dex' | 'live';
          // Check if we're on monad chain - if so, only allow trending or newPairs
          // Check URL params directly for immediate access (same pattern as currentChain)
          const urlParams = new URLSearchParams(window.location.search);
          const initialChain = urlParams.get('chain') || 'sol';
          if (initialChain === 'monad' && savedTab !== 'trending' && savedTab !== 'newPairs') {
            return 'trending';
          }
          return savedTab;
        }
      } catch {
        // Ignore localStorage errors
      }
    }
    return 'trending';
  });
  
  // Save activeTab to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('discover_active_tab', activeTab);
      } catch {
        // Ignore localStorage errors
      }
    }
  }, [activeTab]);
  
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
  const { user, solBalance, refreshBalance, walletList, walletBalances, selectedWalletIds } = useUser();

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
  
  // Ref for pending quick buy toast (for WebSocket updates)
  const pendingQuickBuyToastRef = useRef<{ id: string; tokenImage: string | null; tokenName: string; fakeTime: string; tokenAddress: string; startTime: number; timerInterval?: NodeJS.Timeout } | null>(null);
  
  const tokenMapRef = useRef<Map<string, TokenWithDexPaid>>(new Map());
  const [filteredTokens, setFilteredTokens] = useState<TokenWithDexPaid[]>([]);
  const [displayed, setDisplayed] = useState<TokenWithDexPaid[]>([]);
  const [sortKey, setSortKey] = useState<"market_cap_total" | "liquidity" | "volume" | "txns" | "name" | "total_liquidity_usd" | "fully_diluted_value">("volume");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  // Store new pairs data per chain to preserve data when switching chains
  const [newPairsRawByChain, setNewPairsRawByChain] = useState<Record<string, TokenWithDexPaid[]>>(() => {
    // Initialize with cached data for all chains if available
    const data: Record<string, TokenWithDexPaid[]> = {};
    if (typeof window !== 'undefined') {
      try {
        // Load cached data for both chains
        ['sol', 'monad'].forEach((chain) => {
          const cached = localStorage.getItem(`discover_new_pairs_cache_${chain}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            const age = Date.now() - parsed.timestamp;
            if (age < 60 * 1000 && parsed.data && parsed.data.length > 0) {
              data[chain] = parsed.data;
            }
          }
        });
      } catch {
        // Ignore cache errors on init
      }
    }
    return data;
  });
  
  // Get current chain's data
  const newPairsRaw = newPairsRawByChain[currentChain] || [];
  
  // Ref to track current state for use in callbacks/intervals
  const newPairsRawByChainRef = useRef(newPairsRawByChain);
  useEffect(() => {
    newPairsRawByChainRef.current = newPairsRawByChain;
  }, [newPairsRawByChain]);
  
  // Helper to update data for a specific chain
  const setNewPairsRawForChain = useCallback((chain: string, data: TokenWithDexPaid[]) => {
    setNewPairsRawByChain((prev) => ({
      ...prev,
      [chain]: data,
    }));
  }, []);
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
    isDev && console.log('[Discover] Chain changed to:', currentChain, '- Clearing all data');
    // Clear token map
    tokenMapRef.current.clear();
    // Clear filtered and displayed tokens
    setFilteredTokens([]);
    setDisplayed([]);
    // Force a small delay to ensure state is cleared before hook re-runs
  }, [currentChain]);
  
  // Use same data source strategy as main Discover page:
  // - Solana trending tab: WebSocket (real-time)
  // - Everything else (including Monad): paginated HTTP fallback
  const {
    data: fallbackTokens,
    loading: fallbackLoading,
    isConnected: fallbackConnected,
    error: fallbackError,
    isReconnecting: fallbackReconnecting,
    usingFallback,
  } = usePaginatedTokensWithFallback({
    filter: 'trending',
    timeframe: selectedTimeframe,
    chain: currentChain,
    // Only enable fallback fetch when on Monad or when not on Solana trending tab
    limit: (currentChain === 'monad' || activeTab !== 'trending') ? 500 : 0,
  });

  const trendingWsTimeframe = (selectedTimeframe === '24h' ? '6h' : selectedTimeframe) as TrendingTimeframe;
  const {
    tokens: wsTokens,
    loading: wsLoading,
    isConnected: wsConnected,
    error: wsError,
    isReconnecting: wsReconnecting,
    lastUpdate: wsLastUpdate,
  } = useTrendingWebSocket({
    timeframe: trendingWsTimeframe,
    enabled: currentChain === 'sol' && activeTab === 'trending',
  });

  // DexScreener trending (kept in sync with main Discover, even though this popout
  // currently doesn't expose the separate \"Trending 2\" tab)
  const {
    tokens: dexScreenerTokens,
    loading: dsLoading,
    isConnected: dsConnected,
    error: dsError,
  } = useDexScreenerTrending(false);

  const allTokens = useMemo(() => {
    if (currentChain === 'sol' && activeTab === 'trending') {
      return wsTokens as unknown as TokenWithDexPaid[];
    }
    return fallbackTokens;
  }, [currentChain, activeTab, wsTokens, fallbackTokens]);

  const tokensLoading =
    currentChain === 'sol' && activeTab === 'trending' ? wsLoading : fallbackLoading;
  const isConnected =
    currentChain === 'sol' && activeTab === 'trending' ? wsConnected : fallbackConnected;
  const tokenError =
    currentChain === 'sol' && activeTab === 'trending' ? wsError : fallbackError;
  const isReconnecting =
    currentChain === 'sol' && activeTab === 'trending' ? wsReconnecting : fallbackReconnecting;

  // Log when hook data changes to track chain switching
  useEffect(() => {
    isDev && console.log('[DiscoverPopout] Hook data updated:', {
      chain: currentChain,
      activeTab,
      tokenCount: allTokens?.length || 0,
      loading: tokensLoading,
      usingWebSocket: currentChain === 'sol' && activeTab === 'trending',
      wsConnected,
      wsLastUpdate,
      usingFallback,
    });
  }, [allTokens, tokensLoading, currentChain, activeTab, wsConnected, wsLastUpdate, usingFallback]);

  // PumpPortal WebSocket for live pump section
  const {
    tokens: pumpPortalTokens,
    connected: pumpPortalConnected,
    error: pumpPortalError,
  } = usePumpPortalWebSocket({
    enabled: activeTab === 'live', // Only connect when on live tab
  });

  // When chain changes, load cached data for that chain if available
  // Don't clear data - preserve it per chain
  const prevChainRef = useRef<string>(currentChain);
  useEffect(() => {
    if (prevChainRef.current !== currentChain) {
      // Chain changed - check if we have cached data for this chain
      const cached = localStorage.getItem(`discover_new_pairs_cache_${currentChain}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          const age = Date.now() - parsed.timestamp;
          if (age < 60 * 1000 && parsed.data && parsed.data.length > 0) {
            // Load cached data for this chain
            setNewPairsRawForChain(currentChain, parsed.data);
            isDev && console.log(`[Discover] Loaded cached data for chain ${currentChain}: ${parsed.data.length} tokens`);
          }
        } catch (err) {
          console.warn(`[Discover] Failed to load cache for chain ${currentChain}:`, err);
        }
      }
      // Reset loading/error state for chain switch
      setNewPairsLoading(false);
      setNewPairsError(null);
      prevChainRef.current = currentChain;
    }
  }, [currentChain, setNewPairsRawForChain]);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    // Include chain in cache key so Monad and Solana have separate caches
    // Use currentChain state variable (not router.query.chain) to ensure we react to state changes
    const CACHE_KEY = `discover_new_pairs_cache_${currentChain}`;
    const CACHE_TTL = 30 * 1000; // Trigger background refresh after 30s
    const STALE_THRESHOLD = 5 * 60 * 1000; // Treat cache as stale after 5 minutes (but still usable)

    // Check if we already have valid cached data in state for current chain - if so, skip fetching
    // This prevents re-fetching when navigating back to the page
    // Use ref to get current value (updated via useEffect above)
    const currentChainData = newPairsRawByChainRef.current[currentChain] || [];
    if (currentChainData.length > 0) {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          const age = Date.now() - parsed.timestamp;
          // If we have data in state and cache is still valid, skip fetching
          if (age < STALE_THRESHOLD && parsed.data && parsed.data.length > 0) {
            isDev && console.log('[Discover] Already have cached data in state, skipping re-fetch');
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
                  const chainToUse = currentChain || (router.query.chain as string) || 'sol';
                  const apiUrl = chainToUse === 'monad'
                    ? `/api/token-service/pulse-new-monad?limit=200`
                    : `/api/token-service/pulse-new?limit=200`;
                  fetch(apiUrl, {
                    headers: { 
                      'Cache-Control': 'no-cache', 
                      Pragma: 'no-cache',
                      'Accept': 'application/json'
                    },
                  })
                    .then(res => res.ok ? res.json() : null)
                    .then(data => {
                      if (!cancelled && data) {
                        // Handle multiple formats:
                        // 1. Direct array
                        // 2. Monad format: {status, count, data: [...]}
                        // 3. Birdeye format: {data: {tokens: [...]}}
                        let tokensArray: any[] = [];
                        if (Array.isArray(data)) {
                          tokensArray = data;
                        } else if (data?.data) {
                          if (Array.isArray(data.data)) {
                            tokensArray = data.data;
                          } else if (data.data?.tokens && Array.isArray(data.data.tokens)) {
                            tokensArray = data.data.tokens;
                          }
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
            isDev && console.log(`[Discover] Loaded ${parsed.data.length} new pairs from cache (age: ${Math.round(age / 1000)}s${isStale ? ', stale' : ''})`);
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
        isDev && console.log(`[Discover] Cached ${data.length} new pairs`);
      } catch (err) {
        console.warn('[Discover] Failed to save cache:', err);
      }
    };

    const fetchNewPairs = async (useCache = true, showLoading = false) => {
      if (cancelled) {
        return;
      }
      
      // Ref is updated via useEffect above, no need to update here

      // Try to load from cache first
      if (useCache) {
        const cached = loadFromCache();
        if (cached && cached.length > 0) {
          // Update data silently (no loading state) for current chain
          setNewPairsRawForChain(currentChain, cached);
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
                isDev && console.log('[Discover] Cache is stale, refreshing in background');
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
        // For Monad chain, use the Next.js API route (which proxies to Monad service server-side, avoiding CORS)
        // For Solana, use the regular pulse-new endpoint
        // Check both currentChain state and router query to ensure we have the right chain
        const chainToUse = currentChain || (router.query.chain as string) || 'sol';
        let apiUrl: string;
        
        if (chainToUse === 'monad') {
          // Use Next.js API route which proxies to Monad service server-side (avoids CORS)
          apiUrl = `/api/token-service/pulse-new-monad?limit=200&fresh=1`;
        } else {
          // Use Next.js API route for Solana (which proxies to exchange-token-service)
          apiUrl = `/api/token-service/pulse-new?limit=200&fresh=1`;
        }
        
        const response = await fetch(apiUrl, {
          headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[Discover] API error for ${currentChain} new pairs:`, {
            status: response.status,
            statusText: response.statusText,
            error: errorText
          });
          throw new Error(`Request failed with status ${response.status}: ${errorText.substring(0, 100)}`);
        }

        const payload = await response.json();
        
        // Check if response is an error object
        if (payload?.error) {
          console.error(`[Discover] API returned error object for ${currentChain} new pairs:`, payload.error);
          throw new Error(payload.error);
        }
        if (cancelled) {
          return;
        }

        // Handle multiple response formats:
        // 1. Direct array (Solana pulse-new)
        // 2. Birdeye format: {data: {tokens: [...]}}
        // 3. Monad format: {status, count, data: [...]} or just array
        let tokensArray: any[] = [];
        if (Array.isArray(payload)) {
          tokensArray = payload;
        } else if (payload?.data) {
          // Handle both Birdeye format and Monad format
          if (Array.isArray(payload.data)) {
            // Monad format: {status, count, data: [...]}
            tokensArray = payload.data;
          } else if (payload.data?.tokens && Array.isArray(payload.data.tokens)) {
            // Birdeye format: {data: {tokens: [...]}}
            tokensArray = payload.data.tokens;
          }
        }
        
        // Log response for debugging
        if (!tokensArray || tokensArray.length === 0) {
          console.warn('[Discover] No tokens found in response:', {
            chain: currentChain,
            payloadType: Array.isArray(payload) ? 'array' : typeof payload,
            payloadKeys: Array.isArray(payload) ? 'N/A' : Object.keys(payload || {}),
            hasData: !!(payload as any)?.data,
            dataType: Array.isArray((payload as any)?.data) ? 'array' : typeof (payload as any)?.data,
            dataKeys: (payload as any)?.data && !Array.isArray((payload as any)?.data) ? Object.keys((payload as any).data || {}) : 'N/A'
          });
        }
        
        if (!tokensArray || tokensArray.length === 0) {
          // Don't clear existing data if refresh returns empty - preserve what we have
          setNewPairsError(null);
          setNewPairsLoading(false);
          // Use functional update to preserve existing data - never clear once we have data
          setNewPairsRawByChain((prev) => {
            const currentData = prev[currentChain] || [];
            // Only clear if this is truly the initial load (no existing data)
            if (currentData.length === 0) {
              return { ...prev, [currentChain]: [] };
            }
            // Preserve existing data if we have any
            return prev;
          });
          return;
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
            // For Monad tokens, check volume_*_usd fields first, then fallback to volume_* fields
            const vol24h = token.volume_24h_usd ?? token.volume_24h ?? token.volume24h ?? token.volume24hUSD; // Monad uses volume_24h_usd, Birdeye format
            const sum24h = sumVolumes(token.total_buy_volume_24h, token.total_sell_volume_24h);
            normalized.volume_24h = sum24h > 0 ? sum24h : (vol24h !== undefined && vol24h !== null ? toNumber(vol24h) : 0);
            
            const vol6h = token.volume_6h_usd ?? token.volume_6h ?? token.volume6h;
            const sum6h = sumVolumes(token.total_buy_volume_6h, token.total_sell_volume_6h);
            normalized.volume_6h = sum6h > 0 ? sum6h : (vol6h !== undefined && vol6h !== null ? toNumber(vol6h) : 0);
            
            const vol1h = token.volume_1h_usd ?? token.volume_1h ?? token.volume1h;
            const sum1h = sumVolumes(token.total_buy_volume_1h, token.total_sell_volume_1h);
            normalized.volume_1h = sum1h > 0 ? sum1h : (vol1h !== undefined && vol1h !== null ? toNumber(vol1h) : 0);
            
            const vol5m = token.volume_5m_usd ?? token.volume_5m ?? token.volume5m;
            const sum5m = sumVolumes(token.total_buy_volume_5m, token.total_sell_volume_5m);
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
            // For Monad tokens, also check image_url field
            if (token.image_url) {
              normalized.image = token.image_url;
              normalized.logo = token.image_url;
              normalized.uri = token.image_url;
              normalized.imageUrl = token.image_url;
            }
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

          // Transform tokens to match expected format before filtering
          // CRITICAL: Ensure Monad tokens always have 'mint' field set from 'address'
          // This matches pulse.tsx transformation logic
          const transformedTokens = tokensArray.map((token: any) => {
            // Handle Monad tokens (have 'address' field) - always map address to mint
            if (currentChain === 'monad') {
              // Ensure mint is set from address if not already present
              const mint = token.mint || token.address;
              if (!mint) {
                return token; // Skip if no mint or address
              }
              
              return {
                ...token,
                mint: mint, // Always set mint from address for Monad tokens
                // Map Monad image fields
                image: token.image_url || token.image || token.logo || token.logoURI || token.uri,
                logo: token.image_url || token.logo || token.logoURI || token.image,
                uri: token.image_url || token.uri,
                imageUrl: token.image_url || token.imageUrl || token.logoURI,
                // Map Monad volume fields (Monad uses volume_24h_usd, volume_1h_usd, etc.)
                volume_24h: token.volume_24h_usd || token.volume_24h || 0,
                volume_6h: token.volume_6h_usd || token.volume_6h || 0,
                volume_1h: token.volume_1h_usd || token.volume_1h || 0,
                volume_5m: token.volume_5m_usd || token.volume_5m || 0,
                // Monad uses total_buy_volume_mon and total_sell_volume_mon (total, not timeframe-specific)
                // For 24h volume calculation, we can sum buy/sell if available, otherwise use volume_24h_usd
                total_buy_volume_24h: token.total_buy_volume_mon || 0,
                total_sell_volume_24h: token.total_sell_volume_mon || 0,
                // Map transaction fields
                // Monad provides total counts (not timeframe-specific), map them to 24h fields
                // InterstateTable expects timeframe-specific fields like total_buys_24h, total_sells_24h
                total_transactions: token.total_transactions || 0,
                unique_traders: token.unique_traders || 0,
                total_buys: token.total_buys || 0,
                total_sells: token.total_sells || 0,
                // Map total counts to 24h fields (InterstateTable looks for total_buys_24h, total_sells_24h)
                total_buys_24h: token.total_buys || 0,
                total_sells_24h: token.total_sells || 0,
                total_buys_6h: token.total_buys || 0, // Use total as fallback
                total_sells_6h: token.total_sells || 0,
                total_buys_1h: token.total_buys || 0, // Use total as fallback
                total_sells_1h: token.total_sells || 0,
                total_buys_5m: token.total_buys || 0, // Use total as fallback
                total_sells_5m: token.total_sells || 0,
                // Also map to txnCount fields as fallback
                txnCount24h: token.total_transactions || 0,
                txnCount24: token.total_transactions || 0,
                // Preserve launchpad_protocol (Monad uses this field)
                launchpad_protocol: token.launchpad_protocol || token.protocol,
              };
            }
            
            // If this is a Birdeye token (has 'address' field), transform it
            if (token.address && !token.mint && currentChain !== 'monad') {
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

          // Match pulse.tsx filtering - only filter by zero liquidity and wrapped SOL
          // This ensures we show the same tokens as pulse table
          const filtered = transformedTokens.filter((token: any) => {
            // Filter out wrapped SOL
            if (isWrappedSol(token)) {
              return false;
            }
            
            // Filter out zero liquidity tokens (same as pulse.tsx)
            if (isZeroLiquidityToken(token)) {
              return false;
            }
            
            // For Monad, tokens use 'address' which we map to 'mint', but check both as fallback
            // For Solana, ensure we have a mint
            const tokenId = token.mint || (currentChain === 'monad' ? token.address : null);
            if (!token || !tokenId) {
              return false;
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

          // Only update if we have valid data - this ensures data persists once loaded
          if (deduped && deduped.length > 0) {
            // Update data silently (no loading animation) for current chain
            setNewPairsRawForChain(currentChain, deduped);
            setNewPairsError(null);
            
            // Save to cache
            saveToCache(deduped);
            isDev && console.log(`[Discover] Updated new pairs: ${deduped.length} tokens for ${currentChain}`);
          } else {
            // If transformation resulted in empty array, preserve existing data for current chain
            isDev && console.log('[Discover] Transformation resulted in empty array, preserving existing data');
            setNewPairsRawByChain((prev) => {
              const currentData = prev[currentChain] || [];
              if (currentData.length === 0) {
                return { ...prev, [currentChain]: [] };
              }
              return prev; // Preserve existing data
            });
          }
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
            isDev && console.log('[Discover] Using cached data after fetch failure');
            setNewPairsRawForChain(currentChain, cached);
            setNewPairsError(null);
            handled = true;
          }
        }

        // If we already have data in memory, keep showing it instead of an error
        // Use functional update to access current state value and preserve existing data for current chain
        if (!handled) {
          setNewPairsRawByChain((prev) => {
            const currentData = prev[currentChain] || [];
            if (currentData.length > 0) {
              console.warn('[Discover] Fetch failed but existing data is available. Keeping previous list.');
              setNewPairsError(null);
              return prev; // Preserve existing data
            } else {
              // Only set error if we don't have existing data
              setNewPairsError(message);
              return prev; // Keep as is if empty
            }
          });
        }
      } finally {
        if (!cancelled && showLoading) {
          setNewPairsLoading(false);
        }
      }
    };

    // Check if we already have data from initial state (cached) for current chain
    // Use ref to get current value
    const hasInitialData = (newPairsRawByChainRef.current[currentChain] || []).length > 0;
    
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
    // Use functional setState to preserve existing data if refresh fails or returns empty
    intervalId = setInterval(() => {
      fetchNewPairs(true, false).catch(err => {
        console.error('[Discover] Background refresh failed:', err);
        // Don't clear data on error - preserve what we have
      });
    }, 60_000);

    return () => {
      cancelled = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [currentChain, activeTab, setNewPairsRawForChain]); // Re-run when chain or tab changes

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
            isDev && console.log(`[Discover] Loaded ${parsed.data.length} xStocks from cache (age: ${Math.round(age / 1000)}s)`);
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
        isDev && console.log(`[Discover] Cached ${data.length} xStocks`);
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
          // Try to extract error message from response body
          let errorMessage = `Request failed with status ${response.status}`;
          try {
            // Clone response to read body without consuming the original
            const clonedResponse = response.clone();
            const errorText = await clonedResponse.text();
            if (errorText) {
              // Try to parse as JSON first
              try {
                const errorData = JSON.parse(errorText);
                if (errorData?.message) {
                  errorMessage = errorData.message;
                } else if (errorData?.error) {
                  errorMessage = errorData.error;
                } else if (errorData?.details) {
                  errorMessage = errorData.details;
                }
              } catch {
                // If not JSON, use the text directly (limited length)
                errorMessage = errorText.substring(0, 200);
              }
            }
          } catch {
            // If we can't read the body, use default message
          }
          
          // For 500 errors, provide a more user-friendly message
          if (response.status === 500) {
            errorMessage = 'Service temporarily unavailable. Please try again later.';
          }
          
          throw new Error(errorMessage);
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
        
        // Extract error message
        let message = 'Failed to fetch xStocks';
        if (err instanceof Error) {
          message = err.message;
        } else if (typeof err === 'string') {
          message = err;
        }
        
        // Log error with full details for debugging
        console.error('[Discover] Failed to fetch xStocks:', {
          error: err,
          message,
          useCache,
        });
        
        // Try to use cached data if available
        if (useCache) {
          const cached = loadFromCache();
          if (cached && cached.length > 0) {
            setXStocksRaw(cached);
            setXStocksError(null);
            // Don't show error if we have cached data
            return;
          }
        }
        
        // Only set error if we don't have cached data to fall back to
        setXStocksError(message);
      } finally {
        if (!cancelled) {
          if (showLoading) {
            setXStocksLoading(false);
          }
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

  // Helper to determine Monad launchpad (same logic as MonadTable)
  const getMonadLaunchpad = useCallback((token: Token): 'nadfun' | 'flapsh-simple' | 'flapsh-devs' => {
    const protocol = (token as any)?.launchpad_protocol?.toLowerCase() || "";
    
    // Also check token.protocol for "flap"
    if ((token as any)?.protocol?.toLowerCase()?.includes("flap")) {
      return "flapsh-simple";
    }

    if (protocol.includes("nad.fun") || protocol.includes("nadfun")) {
      return "nadfun";
    } else if (protocol.includes("flap.sh") || protocol.includes("flapsh")) {
      // Check if it's devs portal (usually has 'dev' in the name or specific identifier)
      if (protocol.includes("dev")) {
        return "flapsh-devs";
      }
      return "flapsh-simple";
    }

    // Default to nadfun if unknown
    return "nadfun";
  }, []);

  // QUICK BUY handler – using MonadTable logic for Monad, enhanced trade flow for Solana
  const handleQuickBuy = async (token: Token) => {
    if (!user?.bearerToken || !user?.id) {
      showEnhancedToast('warning', 'Please connect your wallet to trade', {
        title: 'Authentication Required',
      });
      return;
    }

    const buyAmount = parseFloat(quickBuyAmount);
    if (isNaN(buyAmount) || buyAmount <= 0) {
      const currency = currentChain === 'monad' ? 'MON' : 'SOL';
      showEnhancedToast('warning', `Please enter a valid ${currency} amount (minimum 0.001 ${currency})`, {
        title: 'Invalid Amount',
      });
      return;
    }

    // Get preset based on selected pill (local state)
    const presetIndex = parseInt(selectedPill.replace('P', '')) - 1;
    const preset = presets[presetIndex];
    if (!preset) {
      showEnhancedToast('error', 'Quick buy preset not configured', {
        title: 'Configuration Error',
        suggestions: ['Update your presets in settings'],
      });
      return;
    }

    // For Monad chain, use MonadTable quick buy logic
    if (currentChain === 'monad') {
      if (!token.mint) {
        showEnhancedToast('error', 'Invalid token information', {
          title: 'Token Error',
        });
        return;
      }

      const settings = (preset.quickBuySettings || {}) as any;
      const launchpad = getMonadLaunchpad(token);
      const tokenAddress = token.mint; // Monad uses mint address (0x format)

      // Get slippage from preset or use default (15%)
      const slippage = settings?.maxSlippage ? settings.maxSlippage * 100 : 15;
      // Get gas price from preset (optional, undefined if not set)
      const gasPrice = settings?.gasPrice !== undefined && settings.gasPrice > 0 ? settings.gasPrice : undefined;

      // Pre-validate before showing toast (handles multi-wallet)
      const monadValidation = validateMonadBuy(buyAmount, walletBalances, walletList, selectedWalletIds?.monad || [], gasPrice);
      if (!monadValidation.valid) {
        showTradeValidationError(monadValidation.error, getResolvedTokenImage(token as any), token.symbol || token.name || 'Token');
        return;
      }

      // Get token image and name - use resolved version to get cached metadata images
      const tokenImage = token ? getResolvedTokenImage(token as any) : null;
      const tokenName = token?.name || token?.symbol || '';
      
      // Generate unique toast ID and fake fast time (0.40-0.60s)
      const uniqueToastId = `monad-quickbuy-${Date.now()}`;
      const startTime = Date.now();
      
      // Random cap time between 0.40 and 0.60 seconds
      const timerCap = 0.40 + Math.random() * 0.20;
      let timerFinished = false;
      let tradeErrored = false;
      let firstSuccessShown = false;
      
      // Show initial loading toast with timer - checkmark hidden until timer finishes, link icon grayed out
      toast.custom(
        (t) => (
          <div className="flex items-center gap-2 bg-[#1a1b1e] text-white border border-white/10 rounded-lg px-4 py-3">
            <FaCheckCircle id={`check-${uniqueToastId}`} className="flex-shrink-0" size={16} style={{ color: '#31e3ac', display: timerFinished && !tradeErrored ? 'block' : 'none' }} />
            {tokenImage && (
              <img src={tokenImage} alt={tokenName} className="w-5 h-5 rounded-full object-cover flex-shrink-0" style={{ border: '1px solid rgba(255, 255, 255, 0.1)' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            )}
            <span id={`message-${uniqueToastId}`} className="font-semibold text-sm" style={{ color: '#31e3ac' }}>Trade placed!</span>
            <span id={`timer-${uniqueToastId}`} className="text-[#9CA3AF] text-xs ml-1">(0.00s)</span>
            <span id={`link-${uniqueToastId}`} className="inline-flex items-center ml-1" style={{ display: 'none' }}>
              <img src="https://pbs.twimg.com/profile_images/1749618187489206272/rDaFjEhN_400x400.jpg" alt="Monad" className="w-4 h-4 rounded-full" style={{ cursor: 'default' }} />
            </span>
          </div>
        ),
        { id: uniqueToastId, duration: Infinity }
      );
      
      // Start timer animation - update every 50ms, show checkmark when cap is reached
      const timerInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const displayTime = Math.min(elapsed, timerCap).toFixed(2);
        const timerEl = document.getElementById(`timer-${uniqueToastId}`);
        if (timerEl) {
          timerEl.textContent = `(${displayTime}s)`;
        }
        
        // When timer reaches cap, show checkmark and Monad logo
        if (!timerFinished && elapsed >= timerCap) {
          timerFinished = true;
          if (!tradeErrored) {
            const checkEl = document.getElementById(`check-${uniqueToastId}`);
            if (checkEl) {
              checkEl.style.display = 'block';
            }
            const linkEl = document.getElementById(`link-${uniqueToastId}`);
            if (linkEl) {
              linkEl.style.display = 'inline-flex';
            }
          }
        }
      }, 50);
      const cleanupTradeListener = listenForTradeEvents(tokenAddress, uniqueToastId, (v) => { tradeErrored = v; }, 'monad');

      // Store pending toast info for WebSocket instant update (including timer)
      pendingQuickBuyToastRef.current = { id: uniqueToastId, tokenImage, tokenName, fakeTime: timerCap.toFixed(2), tokenAddress, startTime, timerInterval };

      try {
        notifyTradePending({ tokenAddress, tradeType: 'buy', chain: 'monad' });
        const { results, totalConsidered } = await executeMonadMultiBuy({
          tokenAddress,
          amountMON: buyAmount,
          launchpad,
          slippage,
          gasPrice,
          authToken: user.bearerToken,
          walletList,
          walletBalances,
          selectedWalletIds: selectedWalletIds?.monad || [],
          onWalletSuccess: (ctx) => {
            if (firstSuccessShown) return;
            const txHash = (ctx.result as any)?.txHash;
            const summary = formatMonadTxSummary(txHash ? [txHash] : [], ctx.totalConsidered);
            const messageEl = document.getElementById(`message-${uniqueToastId}`);
            if (messageEl) {
              messageEl.textContent = summary.message;
            }
            const checkEl = document.getElementById(`check-${uniqueToastId}`);
            if (checkEl) {
              checkEl.style.display = 'block';
            }
            const linkEl = document.getElementById(`link-${uniqueToastId}`);
            if (linkEl) {
              if (summary.hasMultiple || !txHash) {
                linkEl.style.display = 'none';
              } else {
                const explorerUrl = `https://monadvision.com/tx/${txHash}`;
                linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://pbs.twimg.com/profile_images/1749618187489206272/rDaFjEhN_400x400.jpg" alt="Monad" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
                linkEl.style.display = 'inline-flex';
              }
            }
            firstSuccessShown = true;
          },
        });

        const txHashes = results.map((r) => (r.result as any)?.txHash).filter(Boolean);
        const summary = formatMonadTxSummary(txHashes, totalConsidered);

        if (txHashes.length > 0) {
          const messageEl = document.getElementById(`message-${uniqueToastId}`);
          if (messageEl) {
            messageEl.textContent = summary.message;
          }
          // Only update toast if WebSocket hasn't already handled it
          if (pendingQuickBuyToastRef.current?.id === uniqueToastId) {
            const linkEl = document.getElementById(`link-${uniqueToastId}`);
            if (linkEl) {
              if (summary.hasMultiple) {
                linkEl.style.display = 'none';
              } else if (txHashes[0]) {
                const explorerUrl = `https://monadvision.com/tx/${txHashes[0]}`;
                linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://pbs.twimg.com/profile_images/1749618187489206272/rDaFjEhN_400x400.jpg" alt="Monad" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
                linkEl.style.display = 'inline-flex';
              }
            }
            setTimeout(() => {
              toast.dismiss(uniqueToastId);
            }, 10000);
            pendingQuickBuyToastRef.current = null;
          }
          isDev && console.log('Monad Quick Buy successful:', txHashes);
          broadcastMonadQuickTrade(tokenAddress, 'buy');
          broadcastTradeCompleted({ tokenAddress, tradeType: 'buy', chain: 'monad', tokenName: token?.name, tokenSymbol: token?.symbol, imageUrl: tokenImage || undefined, solAmountSpent: buyAmount });
          // Refresh header balance after successful buy
          setTimeout(() => {
            refreshBalance({ chain: "monad", force: true }).catch((err: any) => {
              console.warn('Failed to refresh balance:', err);
            });
          }, 1000);
          toast.success(summary.message, { duration: 4000 });
          return { success: true, txHash: txHashes[0] };
        } else {
          tradeErrored = true;
          cleanupTradeListener();
          clearInterval(timerInterval);
          pendingQuickBuyToastRef.current = null;
          const errorMsg = 'Trade failed';
          transformToastToError(uniqueToastId, errorMsg, tokenImage, tokenName);
          return { success: false, error: errorMsg };
        }
      } catch (error: any) {
        tradeErrored = true;
        cleanupTradeListener();
        console.error("❌ Monad Quick Buy failed:", error);
        clearInterval(timerInterval);
        pendingQuickBuyToastRef.current = null;
        const errorMessage = formatMonadError(error?.message || error?.error);
        transformToastToError(uniqueToastId, errorMessage, tokenImage, tokenName);
        return { success: false, error: errorMessage };
      }
    }

    // For Solana chain, use enhanced trade flow
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
      walletContext: {
        selectedWalletIds: currentChain === 'monad' ? selectedWalletIds?.monad || [] : selectedWalletIds?.sol || [],
        walletList: walletList || [],
        walletBalances: walletBalances || {},
        chain: currentChain === 'monad' ? 'monad' : 'sol',
      },
      refreshBalance,
      onSuccess: (txHash, stats) => {
        isDev && console.log('Enhanced Quick Buy successful:', { txHash, stats });
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
  // For Solana trending, ALWAYS use wsTokens (never tokenMapRef) so we show the exact same
  // full list as the Discover page and avoid any stale or partial ref data.
  useEffect(() => {
    if (activeTab === "trending") {
      let arr: TokenWithDexPaid[];
      if (currentChain === 'sol') {
        // Always use WebSocket data for Solana trending (even when empty) so count matches Discover
        arr = Array.isArray(wsTokens) ? (wsTokens as unknown as TokenWithDexPaid[]) : [];
      } else {
        // Monad: use tokenMapRef (populated from fallback HTTP)
        arr = Array.from(tokenMapRef.current.values());
      }
      
      // Safety check: filter out wrapped SOL before processing
      let safeArr = arr.filter(t => t && t.mint && !isWrappedSol(t));
      
      // Filter out specific blacklisted tokens for Monad trending section
      if (currentChain === 'monad') {
        const blacklistedAddresses = [
          '0x6a7E3F839382FBb6A6131D4Aae864AAEb362292d',
          '0x01bFF41798a0BcF287b996046Ca68b395DbC1071',
          '0x0a332311633C0625f63CFc51EE33fC49826E0a3C',
          '0x22Cd99EC337a2811F594340a4A6E41e4A3022b07',
          '0xF59D81cd43f620E722E07f9Cb3f6E41B031017a3'
        ].map(addr => addr.toLowerCase());
        
        safeArr = safeArr.filter(t => {
          const tokenAddress = (t.mint || (t as any).address || '').toLowerCase();
          return !blacklistedAddresses.includes(tokenAddress);
        });
      }
      
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
      
      // If we have fewer than 10 trending tokens, supplement with top tokens from new pairs (match Discover page: up to 50)
      if (uniqueSafe.length < 10 && newPairsRaw && newPairsRaw.length > 0) {
        
        // Get top tokens from new pairs, sorted by volume (for selected timeframe)
        const topNewPairs = newPairsRaw
          .filter((token: any) => {
            // Skip if already in trending list
            const tokenMint = (token.mint || token.address || '').toLowerCase();
            if (tokenMint && seenMints.has(tokenMint)) return false;
            
            // Skip wrapped SOL and blacklisted tokens
            if (isWrappedSol(token)) return false;
            if (currentChain === 'monad') {
              const blacklistedAddresses = [
                '0x6a7E3F839382FBb6A6131D4Aae864AAEb362292d',
                '0x01bFF41798a0BcF287b996046Ca68b395DbC1071',
                '0x0a332311633C0625f63CFc51EE33fC49826E0a3C',
                '0x22Cd99EC337a2811F594340a4A6E41e4A3022b07',
                '0xF59D81cd43f620E722E07f9Cb3f6E41B031017a3'
              ].map(addr => addr.toLowerCase());
              const tokenAddress = tokenMint;
              if (blacklistedAddresses.includes(tokenAddress)) return false;
            }
            
            // Skip zero liquidity tokens
            if (isZeroLiquidityToken(token)) return false;
            
            return true;
          })
          .map((token: any) => ({
            ...token,
            // Calculate volume for sorting
            sortVolume: getVolumeForTimeframe(token, selectedTimeframe),
          }))
          .sort((a: any, b: any) => {
            // Sort by volume descending, then by market cap
            const volumeDiff = b.sortVolume - a.sortVolume;
            if (Math.abs(volumeDiff) > 0.01) return volumeDiff;
            const aMc = Number((a as any).fully_diluted_value || (a as any).market_cap_usd || 0);
            const bMc = Number((b as any).fully_diluted_value || (b as any).market_cap_usd || 0);
            return bMc - aMc;
          })
          .slice(0, 50) // Take top 50 from new pairs (same as Discover page)
          .map((token: any) => {
            // Remove the sortVolume property we added
            const { sortVolume, ...rest } = token;
            return rest;
          });
        
        // Add to uniqueSafe, tracking their mints to avoid duplicates (no cap - show same as Discover)
        for (const token of topNewPairs) {
          const mint = (token.mint || token.address || '').toLowerCase();
          if (mint && !seenMints.has(mint)) {
            seenMints.add(mint);
            uniqueSafe.push(token);
          }
        }
        
      }
      
      setDisplayed(uniqueSafe);
    } else if (activeTab === "dex") {
      // dex tab → show all filtered tokens (match Discover page behavior)
      const safe = filteredTokens.filter(t => t && t.mint && !isWrappedSol(t));
      setDisplayed(safe);
    } else {
      setDisplayed([]);
    }
  }, [activeTab, filteredTokens, sortKey, sortDirection, selectedTimeframe, applyFilters, getVolumeForTimeframe, isWrappedSol, filter, activeFilterCount, newPairsRaw, currentChain, isZeroLiquidityToken, wsTokens]); // wsTokens required so displayed updates when WebSocket delivers full list

  const processedNewPairs = useMemo(() => {
    if (!newPairsRaw || newPairsRaw.length === 0) {
      return [] as TokenWithDexPaid[];
    }

    
    // Match pulse.tsx filtering logic - only filter by zero liquidity and wrapped SOL
    // This ensures we show the same tokens as pulse table
    const base = newPairsRaw.filter((token) => {
      // Filter out wrapped SOL
      if (isWrappedSol(token)) {
        return false;
      }
      
      // Filter out zero liquidity tokens (same as pulse.tsx)
      if (isZeroLiquidityToken(token)) {
        return false;
      }
      
      // For Monad, ensure we have a mint (from address transformation)
      // For Solana, ensure we have a mint
      const tokenId = token.mint || (currentChain === 'monad' ? (token as any).address : null);
      if (!token || !tokenId) {
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
  }, [newPairsRaw, applyFilters, getVolumeForTimeframe, getNewPairTimestamp, isWrappedSol, isZeroLiquidityToken, currentChain, sortDirection, sortKey, selectedTimeframe]);

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
          chain={currentChain}
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
          chain={currentChain}
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
      return (
        <div className="py-10 text-center text-[#f26681]">{tokenError}</div>
      );
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
      id: t?.mint || t?.pair_address || Math.random().toString(36).slice(2),
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
    
    return {
      id: t?.mint || t?.pair_address || Math.random().toString(36).slice(2),
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
    <div className="flex h-full flex-col text-[#E6E7EA]" style={{ backgroundColor: '#111214' }}>

        {/* Tab Navigation + Controls: tabs on first line, Filter/amount/P1-P3 on second line */}
        <div className="flex flex-col gap-3 px-4 pt-4 sm:px-6 lg:px-8">
          {/* Tabs Section - first row */}
          <div className="scrollbar-hide -mx-4 flex items-center gap-3 overflow-x-auto px-4 pb-0 sm:-mx-6 sm:gap-4 sm:px-6 lg:mx-0 lg:gap-6 lg:px-0">
            {/* Chain Switcher - Commented out */}
            {/* <div className="flex items-center gap-2 mr-2">
              <button
                onClick={() => {
                  manualChainSwitchRef.current = true;
                  setCurrentChain('monad');
                  if (typeof window !== 'undefined') {
                    const url = new URL(window.location.href);
                    url.searchParams.set('chain', 'monad');
                    window.history.replaceState({}, '', url.toString());
                    // Also update router query using shallow routing
                    router.push(
                      {
                        pathname: router.pathname,
                        query: { ...router.query, chain: 'monad' },
                      },
                      undefined,
                      { shallow: true }
                    );
                  }
                }}
                className={`relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#20232b] bg-[#171920] text-neutral-300 shadow-sm transition-all duration-200 ${
                  currentChain === 'monad'
                    ? "bg-[#222733] text-white shadow-lg shadow-purple-500/20"
                    : "bg-[#141821] text-neutral-500 opacity-75 hover:opacity-100 hover:text-neutral-100"
                }`}
                aria-label="View Monad tokens"
              >
                <img
                  src="https://i0.wp.com/www.gizmotimes.com/wp-content/uploads/2023/10/Monad-Logo.png?fit=1920%2C1080&ssl=1"
                  alt="Monad"
                  className="h-7 w-7 rounded-full object-cover"
                />
              </button>
              <button
                onClick={() => {
                  manualChainSwitchRef.current = true;
                  setCurrentChain('sol');
                  if (typeof window !== 'undefined') {
                    const url = new URL(window.location.href);
                    url.searchParams.set('chain', 'sol');
                    window.history.replaceState({}, '', url.toString());
                    // Also update router query using shallow routing
                    router.push(
                      {
                        pathname: router.pathname,
                        query: { ...router.query, chain: 'sol' },
                      },
                      undefined,
                      { shallow: true }
                    );
                  }
                }}
                className={`relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#20232b] bg-[#171920] text-neutral-300 shadow-sm transition-all duration-200 ${
                  currentChain === 'sol'
                    ? "bg-[#222733] text-white shadow-lg shadow-emerald-500/20"
                    : "bg-[#141821] text-neutral-500 opacity-75 hover:opacity-100 hover:text-neutral-100"
                }`}
                aria-label="View Solana tokens"
              >
                <img
                  src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
                  alt="Solana"
                  className="h-6 w-6 rounded-full object-contain mix-blend-screen contrast-[1.2]"
                />
              </button>
            </div> */}
            <button
              className={`text-sm font-light whitespace-nowrap transition-colors sm:text-base lg:text-lg ${activeTab === "trending" ? "text-[#f0f5f5]" : "text-[#6B7280] hover:text-[#f0f5f5]"} cursor-pointer`}
              onClick={() => setActiveTab("trending")}
            >
              Trending
            </button>
            <button
              className={`text-sm font-light whitespace-nowrap transition-colors sm:text-base lg:text-lg ${activeTab === "newPairs" ? "text-[#f0f5f5]" : "text-[#6B7280] hover:text-[#f0f5f5]"} cursor-pointer`}
              onClick={() => setActiveTab("newPairs")}
            >
              New Pairs
            </button>
            {/* Hide xStocks, surge, and live tabs when Monad is selected */}
            {currentChain !== "monad" && (
              <>
                <button
                  className={`text-sm font-light whitespace-nowrap transition-colors sm:text-base lg:text-lg ${activeTab === "xStocks" ? "text-[#f0f5f5]" : "text-[#6B7280] hover:text-[#f0f5f5]"} cursor-pointer`}
                  onClick={() => setActiveTab("xStocks")}
                >
                  xStocks
                </button>
                {/* <button
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
                </button> */}
              </>
            )}
            {/* <button
              className={`text-lg font-light transition-colors ${activeTab === "dex" ? "text-[#f0f5f5]" : "text-[#6B7280] hover:text-[#f0f5f5]"} cursor-pointer`}
              onClick={() => setActiveTab("dex")}
            >
              DEX Screener
            </button> */}
          </div>

          {/* Second row: Filter, amount input, P1 P2 P3 */}
          <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3 sm:gap-3 sm:pt-3 lg:gap-4 mb-4">
            {/* Connection status - commented out per user request */}
            {/* <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : usingFallback ? 'bg-yellow-400' : 'bg-red-400'}`}></div>
              <span className="text-xs text-neutral-400">
                {isConnected ? 'Live' : 'Disconnected'}
              </span>
            </div> */}

            {/* Timeframes - hide when on live tab, new pairs, xStocks, surge, or trending (for both Solana and Monad) */}
            {/* COMMENTED OUT: Timeframe selector hidden for trending section */}
            {activeTab !== "live" &&
              activeTab !== "newPairs" &&
              activeTab !== "xStocks" &&
              activeTab !== "surge" &&
              activeTab !== "trending" && (
                <div className="relative hidden h-7 w-[130px] min-w-[130px] items-center justify-center gap-1 rounded-md border border-[#24252C] bg-[#272a2e] px-1.5 py-1 sm:flex">
                  {(["5m", "1h", "6h", "24h"] as Timeframe[]).map(
                    (tf: Timeframe) => (
                      <div
                        key={tf}
                        className="relative flex items-center justify-center"
                      >
                        <button
                          className={`flex cursor-pointer items-center justify-center rounded px-1 py-[2px] text-sm font-medium whitespace-nowrap transition-all duration-200 ${selectedTimeframe === tf ? "bg-[rgba(24,196,140,0.15)] text-[#f0f5f5]" : "bg-[rgba(22,23,28,0.6)]"}`}
                          onClick={() => handleTimeframeClick(tf)}
                          onMouseEnter={(e) => {
                            if (selectedTimeframe !== tf) {
                              e.currentTarget.style.color = "#f0f5f5";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (selectedTimeframe !== tf) {
                              e.currentTarget.style.color = "";
                            }
                          }}
                        >
                          {tf}
                        </button>
                      </div>
                    ),
                  )}
                </div>
              )}

            {/* Filter button - hidden when in Live Pump tab */}
            {activeTab !== "live" && (
              <div className="relative hidden h-7 w-[85px] min-w-[85px] items-center justify-center gap-1 rounded-md border border-[#24252C] bg-[#272a2e] px-1.5 py-1 sm:flex">
                <button
                  className="relative flex h-full w-full cursor-pointer items-center justify-between transition-all duration-200"
                  onClick={() => setIsFilterPopoutOpen(true)}
                  onMouseEnter={(e) => {
                    const text = e.currentTarget.querySelector("span");
                    const icon = e.currentTarget.querySelector("svg");
                    if (text) text.style.color = "#f0f5f5";
                    if (icon) icon.style.color = "#f0f5f5";
                  }}
                  onMouseLeave={(e) => {
                    const text = e.currentTarget.querySelector("span");
                    const icon = e.currentTarget.querySelector("svg");
                    const activeColor = isFilterPopoutOpen
                      ? "#526fff"
                      : "#9CA3AF";
                    if (text) text.style.color = activeColor;
                    if (icon) icon.style.color = activeColor;
                  }}
                >
                  <span
                    className={`text-sm font-medium ${isFilterPopoutOpen ? "text-[#526fff]" : "text-[#9CA3AF]"}`}
                  >
                    Filter
                  </span>
                  <BsSliders2
                    size={14}
                    className={`${isFilterPopoutOpen ? "text-[#526fff]" : "text-[#9CA3AF]"}`}
                  />

                  {/* Active Filter Count Badge */}
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#85d99f] text-xs text-[10px] font-bold text-[#f0f5f5]">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* Thunder Icon and Amount Entry - Separate Thin Box */}
            <div className="hidden h-7 w-[85px] min-w-[85px] items-center justify-center gap-1 rounded-md border border-[#24252C] bg-[#272a2e] px-1.5 py-1 sm:flex">
              <HiLightningBolt size={14} className="text-[#31e3ac]" />
              <input
                type="text"
                value={quickBuyAmount}
                inputMode="decimal"
                onChange={(e) => {
                  const value = e.target.value;
                  // Allow only digits and at most one decimal point
                  if (value === "" || /^\d*\.?\d*$/.test(value)) {
                    setQuickBuyAmount(value);
                    const numValue = Number(value) || 0;
                    if (typeof window !== "undefined") {
                      localStorage.setItem(
                        "quickBuyAmount",
                        numValue.toString(),
                      );
                    }
                  }
                }}
                onKeyDown={(e) => {
                  // Block non-numeric keys except control/navigation keys and '.'
                  const allowedKeys = [
                    "Backspace",
                    "Delete",
                    "ArrowLeft",
                    "ArrowRight",
                    "Tab",
                    "Home",
                    "End",
                  ];
                  if (allowedKeys.includes(e.key)) return;
                  if (e.key === ".") return;
                  if (!/^[0-9]$/.test(e.key)) {
                    e.preventDefault();
                  }
                }}
                className="w-12 border-none bg-transparent text-center text-sm font-medium text-[#f0f5f5] outline-none"
              />
            </div>

            {/* P1 P2 P3 Boxes - Separate Thin Box With Background Color */}
            <div className="relative hidden h-7 w-[100px] min-w-[100px] items-center justify-center gap-1 rounded-md border border-[#24252C] bg-[#272a2e] px-1.5 py-1 sm:flex">
              {["P1", "P2", "P3"].map((pill) => {
                const presetIndex = parseInt(pill.replace("P", "")) - 1;
                const preset = presets[presetIndex];
                const settings = preset?.quickBuySettings;

                return (
                  <div
                    key={pill}
                    className="relative flex items-center justify-center"
                  >
                    <button
                      className={`flex cursor-pointer items-center justify-center rounded px-1 py-[2px] text-sm font-medium transition-all duration-200 ${selectedPill === pill ? "bg-[rgba(24,196,140,0.15)] text-[#f0f5f5]" : "bg-[rgba(22,23,28,0.6)]"}`}
                      onClick={() => {
                        setSelectedPill(pill);
                        setActivePreset(presetIndex); // Also update global preset for consistency
                      }}
                      onMouseEnter={(e) => {
                        if (selectedPill !== pill) {
                          e.currentTarget.style.color = "#f0f5f5";
                        }
                        setShowPillTooltip(pill);
                      }}
                      onMouseLeave={(e) => {
                        if (selectedPill !== pill) {
                          e.currentTarget.style.color = "";
                        }
                        setShowPillTooltip(null);
                      }}
                    >
                      {pill}
                    </button>

                    {/* Tooltip for each pill */}
                    {showPillTooltip === pill && settings && (
                      <div className="bg-[rgba(15,16,18,0.95)] absolute top-full left-0 z-50 mt-1 w-28 rounded-lg border border-[#24252C] shadow-xl">
                        <div className="space-y-1.5 p-2">
                          {/* Slippage - Running person icon */}
                          <div className="flex items-center gap-1.5">
                            <FaRunning
                              size={10}
                              className="stroke-2 opacity-80"
                            />
                            <span className="text-xs font-light text-gray-300">
                              {(settings.maxSlippage * 100).toFixed(0)}%
                            </span>
                          </div>

                          {/* Priority Fee - Gas pump icon with yellow styling */}
                          <div className="flex items-center gap-1.5">
                            <FaGasPump
                              size={10}
                              className="stroke-2 text-[#FCD34D] opacity-90"
                            />
                            <span className="text-xs font-light text-yellow-400">
                              {settings.priority}
                            </span>
                            <span className="text-xs font-light text-[#d11f3a]">
                              ⚠
                            </span>
                          </div>

                          {/* Bribe - Coins icon with yellow styling */}
                          <div className="flex items-center gap-1.5">
                            <FaCoins
                              size={10}
                              className="stroke-2 text-[#FCD34D] opacity-90"
                            />
                            <span className="text-xs font-light text-yellow-400">
                              {settings.bribe}
                            </span>
                            <span className="text-xs font-light text-[#d11f3a]">
                              ⚠
                            </span>
                          </div>

                          {/* MEV Protection - Ban icon */}
                          <div className="flex items-center gap-1.5">
                            <FaBan size={10} className="stroke-2 opacity-90" />
                            <span className="text-xs font-light text-gray-300">
                              {settings.mevMode === "off"
                                ? "Off"
                                : settings.mevMode === "reduced"
                                  ? "Reduced"
                                  : "Secure"}
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
          {/* {activeTab === 'live' ? (
            pumpPortalTokens.length > 0 ? (
              <PumpLive
                leftItems={liveLeftItems}
                rightItems={liveRightItems}
                onAction={async (id, rawToken) => {
                  // Backfill token data first
                  if (rawToken) {
                    try {
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
                      } else {
                        console.warn('[Discover] Token backfill failed, but continuing with navigation');
                      }
                    } catch (err) {
                      console.error('[Discover] Error backfilling token:', err);
                    }
                  }

                  // Navigate to trade page with chain=sol for Solana tokens
                  router.push(`/trade/${id}?chain=sol`);
                }}
                quickBuyAmount={Number(quickBuyAmount) || 0}
                onQuickBuy={handleQuickBuy}
              />
            ) : pumpPortalConnected && pumpPortalTokens.length === 0 ? (
              <div className="py-10 text-center text-[#9CA3AF]">
                Waiting for live tokens...
              </div>
            ) : !pumpPortalConnected && pumpPortalError ? (
              <div className="py-10 text-center text-[#f26681]">
                Connection error: {pumpPortalError}
              </div>
            ) : (
              <div className="space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-20 w-full bg-[#1E1F26] animate-pulse rounded" />
                ))}
              </div>
            )
          ) : */}{" "}
          {activeTab === "newPairs" ? (
            <section aria-label="New Pairs">
              {/* <div className="mb-4 flex items-center justify-between">
                {newPairsLoading && (
                  <span className="text-xs font-medium text-[#9CA3AF]">
                    Updating…
                  </span>
                )}
              </div> */}

              {newPairsLoading &&
              processedNewPairs.length === 0 &&
              newPairsRaw.length === 0 ? (
                <div className="space-y-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-12 w-full animate-pulse rounded bg-[#1E1F26]"
                    />
                  ))}
                </div>
              ) : newPairsError ? (
                <div className="py-10 text-center text-[#f26681]">
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
                  chain={currentChain}
                />
              ) : (
                <div className="py-10 text-center text-[#9CA3AF]">
                  No new pairs available right now. Check back shortly.
                </div>
              )}
            </section>
          ) : activeTab === "xStocks" ? (
            <section aria-label="xStocks" className="pb-8">
              {xStocksLoading &&
              processedXStocks.length === 0 &&
              xStocksRaw.length === 0 ? (
                <div className="space-y-4">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-12 w-full animate-pulse rounded bg-[#1E1F26]"
                    />
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
          ) : (
            /* activeTab === 'surge' ? (
            <section aria-label="Surge">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-[#f0f5f5]">Surge</h2>
              </div>
              
              Placeholder for Surge data - replace with actual data source
              <div className="py-10 text-center text-[#9CA3AF]">
                Surge data coming soon. Connect your data source here.
              </div>
              
              When you have Surge data, use InterstateTable like this:
              <InterstateTable
                rows={surgeRows}
                onQuickBuy={handleQuickBuy}
                sortKey={sortKey}
                sortDirection={sortDirection}
                setSort={handleSort}
                selectedTimeframe={selectedTimeframe}
                quickBuyAmount={Number(quickBuyAmount) || 0}
              />
            </section>
          ) : */ renderPrimaryTable()
          )}
        </main>

        <QuickBuySettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
    </div>
  );
}
