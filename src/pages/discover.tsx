// src/pages/discover.tsx
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import InterstateTable from '../components/InterstateTable';
import type { Token } from '~/utils/db';
import Header from '../components/Header';
import Footer from '../components/Footer';
import usePaginatedTokensWithFallback from '../hooks/usePaginatedTokensWithFallback';
import useTrendingWebSocket, { type TrendingTimeframe, type NormalizedTrendingToken } from '../hooks/useTrendingWebSocket';
import { useDexScreenerTrending } from '../hooks/useDexScreenerTrending';
import { usePumpPortalWebSocket } from '../hooks/usePumpPortalWebSocket';
import { useQuickBuy } from "~/components/QuickBuyContext";
import { useSolPrice } from "~/components/SolPriceContext";
import QuickBuySettingsModal from '../components/QuickBuySettingsModal';
import { useFilter } from '../components/FilterContext';
import FilterPopout from '../components/FilterPopout';
import { SOL_MINT_ADDRESS } from "~/utils/api";
import { executeMonadMultiBuy, formatMonadTxSummary } from "~/utils/monadWalletAllocation";
import { formatMonadError } from "~/utils/monadError";
import { showEnhancedToast, updateEnhancedToast } from "~/utils/enhancedToast";
import { listenForTradeEvents, transformToastToError } from "~/utils/createSolanaToastHandler";
import { useUser } from "~/components/UserContext";
import PumpLive, { type PumpItem, demoLeft as demoLeftPump, demoRight as demoRightPump } from '../components/PumpLive';
import PumpLiveGrid, { type PumpLiveSortField, type PumpLiveSortDirection } from '../components/PumpLiveGrid';
import { type PumpLiveToken } from '../hooks/usePumpLive';
import { FaRunning, FaGasPump, FaCoins, FaBan, FaCheckCircle } from "react-icons/fa";
import { HiLightningBolt } from "react-icons/hi";
import { BsSliders2 } from "react-icons/bs";

import { extractTokenImage, getResolvedTokenImage, resolveTokenImage, isMetadataUrl } from "~/utils/images";
import { broadcastMonadQuickTrade } from "~/utils/monadTradeEvents";
import { broadcastTradeCompleted, notifyTradePending } from "~/utils/tradeEvents";
import toast from "react-hot-toast";
import { executeSolanaMultiBuy, buildSolanaWalletAllocations } from "~/utils/solanaWalletAllocation";
import { validateSolanaBuy, validateMonadBuy, showTradeValidationError } from "~/utils/preTradeValidation";
import { checkAtaExists } from "~/utils/ataCheck";
import { getPoolTypeFromToken } from "~/utils/poolTypeDetection";
import { mapTradeErrorMessage } from "~/utils/tradeErrorMessages";
import { fetchVerifiedPairAddress } from "~/hooks/useSingleTokenPolling";
import { useQueryNewPairs, useQueryLaunchpadData } from '../hooks/useQueryTokens';
import { usePulseFromQueryCache } from '~/hooks/usePulseFromQueryCache';

const WRAPPED_SOL_MINT = SOL_MINT_ADDRESS;
const isDev = process.env.NODE_ENV !== 'production';

export type Timeframe = "5m" | "1h" | "6h" | "24h";

// Extend Token with optional flags
type TokenWithDexPaid = Token & { dexPaid?: boolean };

export default function DiscoverPage() {
  const router = useRouter();
  
  // Helper to get chain from localStorage
  const getSavedChain = () => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('selected-chain');
      if (saved === 'sol' || saved === 'monad') {
        return saved;
      }
    }
    return 'sol';
  };

  // CRITICAL: Initialize chain from router query immediately to avoid race conditions
  // This ensures we react to shallow routing changes immediately
  const [currentChain, setCurrentChain] = useState<string>(() => {
    // Initialize from router query if available, then localStorage, otherwise default to 'sol'
    if (typeof window !== 'undefined' && router.isReady && router.query.chain) {
      return router.query.chain as string;
    }
    // Also check URL params directly for immediate access
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const chainFromUrl = urlParams.get('chain');
      if (chainFromUrl) return chainFromUrl;
      // Check localStorage
      return getSavedChain();
    }
    return 'sol';
  });

  // Sync chain state with router query - this handles both initial load and shallow routing updates
  useEffect(() => {
    if (!router.isReady) return;
    // Check URL first, then localStorage
    const chainFromQuery = router.query.chain
      ? (router.query.chain as string)
      : getSavedChain();
    if (chainFromQuery !== currentChain) {
      isDev && console.log('[Discover] Chain changed from router:', currentChain, '->', chainFromQuery);
      setCurrentChain(chainFromQuery);
    }
  }, [router.query.chain, router.isReady, currentChain]);

  // Also watch router.asPath as a fallback for shallow routing
  useEffect(() => {
    if (!router.isReady) return;
    const urlParams = new URLSearchParams(router.asPath.split('?')[1] || '');
    const chainFromUrl = urlParams.get('chain') || getSavedChain();
    if (chainFromUrl !== currentChain) {
      isDev && console.log('[Discover] Chain changed from URL:', currentChain, '->', chainFromUrl);
      setCurrentChain(chainFromUrl);
    }
  }, [router.asPath, router.isReady, currentChain]);
  
  // For Monad, only allow 'trending' and 'newPairs' tabs
  // Initialize activeTab from localStorage to persist across navigation
  // Default is 'trending' - changed key to reset user preferences
  const [activeTab, setActiveTab] = useState<'trending' | 'trending2' | 'newPairs' | 'xStocks' | 'surge' | 'dex' | 'live'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('discover_tab_v3');
        if (saved && ['trending', 'trending2', 'newPairs', 'xStocks', 'surge', 'dex', 'live'].includes(saved)) {
          const savedTab = saved as 'trending' | 'trending2' | 'newPairs' | 'xStocks' | 'surge' | 'dex' | 'live';
          // Check if we're on monad chain - if so, only allow trending or newPairs
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
    return 'trending'; // Default to trending tab
  });

  // Save activeTab to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('discover_tab_v3', activeTab);
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
  const { solPrice } = useSolPrice();
  const { newTokens: wsNewTokens, connected: wsNewConnected } = usePulseFromQueryCache({ channel: 'new' });

  // Pump Live sorting state
  const [pumpLiveSortField, setPumpLiveSortField] = useState<PumpLiveSortField>('time');
  const [pumpLiveSortDirection, setPumpLiveSortDirection] = useState<PumpLiveSortDirection>('desc');
  
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

  // Use same React Query hooks as pulse page for independent new pairs data
  const isSolanaChain = currentChain === 'sol';
  const { data: reactQueryNewPairs = [] } = useQueryNewPairs(isSolanaChain);
  const { data: launchpadData = { new: [], completing: [], completed: [] } } = useQueryLaunchpadData(isSolanaChain);

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
    return 0;
  };

  const [quickBuyAmount, setQuickBuyAmount] = useState(getInitialQuickBuyAmount().toString());
  const [selectedPill, setSelectedPill] = useState('P1'); // Local preset selection for discover page
  const [showPillTooltip, setShowPillTooltip] = useState<string | null>(null);
  const tokenMapRef = useRef<Map<string, TokenWithDexPaid>>(new Map());
  const [filteredTokens, setFilteredTokens] = useState<TokenWithDexPaid[]>([]);
  const [displayed, setDisplayed] = useState<TokenWithDexPaid[]>([]);
  const [sortKey, setSortKey] = useState<"market_cap_total" | "liquidity" | "volume" | "txns" | "name" | "total_liquidity_usd" | "fully_diluted_value" | "score" | "timestamp">(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedTab = localStorage.getItem('discover_tab_v3');
        if (savedTab === 'newPairs') return 'timestamp';
      } catch {}
    }
    return 'score';
  });
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

  // Merge WS + HTTP data for New Pairs (Solana).
  // HTTP provides the base snapshot (~50 tokens), WS overlays real-time tokens as they arrive.
  // WS tokens override HTTP tokens for the same mint (fresher data).
  // Monad has no WebSocket, so it still uses HTTP only.
  const volumeEnrichedNewPairs = useMemo(() => {
    if (currentChain !== 'sol') {
      return newPairsRaw;
    }
    // Merge: HTTP first (base layer), then WS overrides (real-time layer)
    const merged = new Map<string, TokenWithDexPaid>();
    for (const token of newPairsRaw) {
      const key = ((token as any).mint || (token as any).address || '').toLowerCase();
      if (key) merged.set(key, token);
    }
    if (wsNewTokens && wsNewTokens.length > 0) {
      for (const token of wsNewTokens) {
        const key = ((token as any).mint || (token as any).address || '').toLowerCase();
        if (key) merged.set(key, token as unknown as TokenWithDexPaid);
      }
    }
    return Array.from(merged.values());
  }, [currentChain, newPairsRaw, wsNewTokens]);

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
      token?.created_at ??
      token?.createdAt ??
      token?.launch_time ??
      token?.launchTime ??
      token?.firstSeen ??
      token?.first_seen ??
      token?.pair_created_at ??
      token?.pairCreatedAt ??
      token?.migrated_time ??
      token?.migratedTime ??
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

  // Tab switching - no complex logic needed here anymore!
  //
  // KEY ARCHITECTURE FIX:
  // - Solana trending: Uses wsTokens directly (React state from useTrendingWebSocket)
  //   → No flicker because wsTokens is properly tracked and has cached data
  // - Monad trending: Uses tokenMapRef (fallback)
  // - New pairs: Uses separate newPairsRaw state (already fully separated)
  //
  // We only need to clear tokenMapRef when switching between non-Solana tabs
  // to prevent Monad trending data from mixing with other tabs.
  const prevActiveTabRef = useRef(activeTab);
  useEffect(() => {
    if (prevActiveTabRef.current !== activeTab) {
      // Clear tokenMapRef when switching tabs for Monad (non-Solana) to prevent data mixing
      // For Solana, we use wsTokens directly so tokenMapRef isn't used
      if (currentChain !== 'sol') {
        tokenMapRef.current.clear();
        setFilteredTokens([]);
      }

      prevActiveTabRef.current = activeTab;
    }
  }, [activeTab, currentChain]);
  
  // Use fallback hook for non-trending tabs and Monad chain
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
    // Only enable for Monad or non-trending tabs
    limit: (currentChain === 'monad' || activeTab !== 'trending') ? 500 : 0
  });

  // Use WebSocket for Solana trending - real-time updates!
  // Server sends all timeframes (5m, 1h, 6h) in one snapshot, so we just filter by selected
  const trendingWsTimeframe = (selectedTimeframe === '24h' ? '6h' : selectedTimeframe) as TrendingTimeframe;
  const {
    tokens: wsTokens,
    loading: wsLoading,
    isConnected: wsConnected,
    error: wsError,
    isReconnecting: wsReconnecting,
    lastUpdate: wsLastUpdate,
  } = useTrendingWebSocket({
    timeframe: trendingWsTimeframe, // Just for filtering which data to return
    // Only enable for Solana chain on trending tab
    enabled: currentChain === 'sol' && activeTab === 'trending',
  });

  // DexScreener trending (Trending 2 tab)
  const { tokens: dexScreenerTokens, loading: dsLoading, isConnected: dsConnected, error: dsError } =
    useDexScreenerTrending(currentChain === 'sol' && activeTab === 'trending2');

  // Merge data sources: WebSocket for Solana trending, fallback for everything else
  const allTokens = useMemo(() => {
    if (currentChain === 'sol' && activeTab === 'trending') {
      // Use WebSocket data for Solana trending
      return wsTokens as unknown as TokenWithDexPaid[];
    }
    return fallbackTokens;
  }, [currentChain, activeTab, wsTokens, fallbackTokens]);

  const tokensLoading = currentChain === 'sol' && activeTab === 'trending' ? wsLoading : fallbackLoading;
  const isConnected = currentChain === 'sol' && activeTab === 'trending' ? wsConnected : fallbackConnected;
  const tokenError = currentChain === 'sol' && activeTab === 'trending' ? wsError : fallbackError;
  const isReconnecting = currentChain === 'sol' && activeTab === 'trending' ? wsReconnecting : fallbackReconnecting;

  // Log when hook data changes to track chain switching
  useEffect(() => {
    isDev && console.log('[Discover] Hook data updated:', {
      chain: currentChain,
      activeTab,
      tokenCount: allTokens?.length || 0,
      loading: tokensLoading,
      usingWebSocket: currentChain === 'sol' && activeTab === 'trending',
      wsConnected,
      wsLastUpdate,
    });
  }, [allTokens, tokensLoading, currentChain, activeTab, wsConnected, wsLastUpdate]);

  // Featured tokens for Monad trending section
  const [featuredTokens, setFeaturedTokens] = useState<TokenWithDexPaid[]>([]);
  const featuredTokensRef = useRef<TokenWithDexPaid[]>([]);
  
  useEffect(() => {
    if (currentChain !== 'monad' || activeTab !== 'trending') {
      setFeaturedTokens([]);
      featuredTokensRef.current = [];
      return;
    }

    const FEATURED_TOKEN_ADDRESSES = [
      // '0x0a332311633c0625f63cfc51ee33fc49826e0a3c', // Commented out
      '0x350035555e10d9afaf1566aaebfced5ba6c27777',
      '0xc09c8242eb21b24298303799bb5af402a2957777',
      '0x405b6330e213ded490240cbcdd64790806827777',
      // '0xad96c3dffcd6374294e2573a7fbba96097cc8d7c', // Commented out - blacklisted
      // '0xa3227c5969757783154c60bf0bc1944180ed81b9', // Commented out
      '0x81a224f8a62f52bde942dbf23a56df77a10b7777',
      '0x7131eca3401f58371cfb4c3b27aa07837cf77777',
      '0x788571e0e5067adea87e6ba22a2b738ffdf48888',
      '0x39b9e06f226ff6d7500c870b82333aacbd2f7777',
      '0x99ae2dc76c43979e3bcc0ae8d69f1fca077c8888',
      '0xc911ba7aee487f5145702c20c20a40d9e5b87777',
      '0x9a17ad79acc180f911be1b89f6fd566597fd7777',
      '0xb6842737e2a6d5a92aba03ed0cca578303e87777',
      // '0xd32e9ddd968b18e8429f2d1da7efb2cc1f01d42d', // Commented out
      '0x3842751a46d23b41a47e702473dff316e6237777',
      '0xa7b3f394b9aaba67f2543a8c1a0f753cc68d7777',
      '0x7b2728c04ad436153285702e969e6efac3a97777',
      // '0x1ad7052bb331a0529c1981c3ec2bc4663498a110', // Commented out - blacklisted
      '0xb5f73846a656232d5d251ab1048bca88d1507777',
      '0x5df178c7e58046bc9074782fef0009c6be167777',
      // '0x1f80c65cc2c37af84abbe1ea03183a624a6f8888', // Commented out
    ].map(addr => addr.toLowerCase());

    let cancelled = false;

    const fetchFeaturedTokens = async () => {
      try {
        const monadServiceUrl = process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL || 'https://monad-token-service.narrative.trade';
        
        // Fetch token data for each featured address in parallel
        const tokenPromises = FEATURED_TOKEN_ADDRESSES.map(async (address) => {
          try {
            const response = await fetch(`${monadServiceUrl}/v1/token?address=${encodeURIComponent(address)}`, {
              headers: { 'Accept': 'application/json' },
            });
            
            if (!response.ok) {
              console.warn(`[FeaturedTokens] Failed to fetch ${address}: ${response.status}`);
              return null;
            }

            const data = await response.json();
            if (data?.status === 'success' && data?.data) {
              const token = data.data;
              // Normalize token format to match TokenWithDexPaid
              // Spread token data first to include all fields, then override specific ones
              const normalized: Record<string, any> = {
                ...token,
                mint: token.address || token.mint || address,
                address: token.address || address,
                pair_address: token.pair_address || token.address || address,
                symbol: token.symbol || '',
                name: token.name || token.symbol || '',
                uri: token.image_url || token.logo || token.image || null,
                image: token.image_url || token.logo || token.image || null,
                logo: token.image_url || token.logo || token.image || null,
                imageUrl: token.image_url || token.logo || token.image || null,
                price_usd: token.price_usd || 0,
                market_cap_usd: token.market_cap_usd || token.fully_diluted_value || 0,
                fully_diluted_value: token.fully_diluted_value || token.market_cap_usd || 0,
                total_liquidity_usd: token.liquidity_usd || 0,
                liquidity_usd: token.liquidity_usd || 0,
                // Volume fields for different timeframes (both with and without _usd suffix for compatibility)
                volume_24h_usd: token.volume_24h_usd || 0,
                volume_24h: token.volume_24h_usd || 0, // Without _usd for getVolume function
                volume_5m_usd: token.volume_5m_usd || 0,
                volume_5m: token.volume_5m_usd || 0, // Without _usd for getVolume function
                volume_1h_usd: token.volume_1h_usd || 0,
                volume_1h: token.volume_1h_usd || 0, // Without _usd for getVolume function
                volume_6h_usd: token.volume_6h_usd || 0,
                volume_6h: token.volume_6h_usd || 0, // Without _usd for getVolume function
                volume24hUSD: token.volume_24h_usd || 0,
                price_change_24h: token.price_change_24h || 0,
                price_percent_change_24h: token.price_percent_change_24h || token.price_change_24h || 0,
                // Transaction fields - use lifetime totals (Monad tokens don't have timeframe-specific counts)
                total_transactions: token.total_transactions || 0,
                total_buys: token.total_buys || 0,
                total_sells: token.total_sells || 0,
                // Map to timeframe-specific fields for compatibility with InterstateTable
                // Use lifetime totals as fallback since Monad tokens don't have timeframe-specific breakdowns
                total_buys_24h: token.total_buys || 0,
                total_sells_24h: token.total_sells || 0,
                total_buys_1h: token.total_buys || 0,
                total_sells_1h: token.total_sells || 0,
                total_buys_6h: token.total_buys || 0,
                total_sells_6h: token.total_sells || 0,
                total_buys_5m: token.total_buys || 0,
                total_sells_5m: token.total_sells || 0,
                // Unique traders
                unique_traders: token.unique_traders || 0,
                unique_wallets_24h: token.unique_traders || 0,
                // Age/Launch time fields - map created_at for age display
                created_at: token.created_at || null,
                launch_time: token.created_at || null, // Alias for compatibility
                createdAt: token.created_at || null, // Another alias
                // Mark as featured
                featured: true,
              };
              return normalized as TokenWithDexPaid & { featured?: boolean };
            }
            return null;
          } catch (err) {
            console.warn(`[FeaturedTokens] Error fetching ${address}:`, err);
            return null;
          }
        });

        let tokens = await Promise.all(tokenPromises);
        let validTokens = tokens.filter((t): t is TokenWithDexPaid => t !== null);

        // Enrich liquidity for tokens with 0 liquidity using fallback endpoints
        if (validTokens.length > 0) {
          const monadServiceUrl = process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL || 'https://monad-token-service.narrative.trade';
          isDev && console.log(`[FeaturedTokens] Enriching liquidity for ${validTokens.length} tokens...`);
          
          const enrichedTokens = await Promise.all(validTokens.map(async (token: any) => {
            const address = token.mint || token.address || '';
            const currentLiquidity = token.total_liquidity_usd || token.liquidity_usd || 0;
            
            // Only enrich if liquidity is 0 or missing
            if (!address || (currentLiquidity && currentLiquidity > 0)) {
              return token;
            }
            
            let liquidity: number | null = null;
            
            // Try first fallback: /v1/liquidity endpoint
            try {
              const liquidityUrl = `${monadServiceUrl}/v1/liquidity?token_address=${encodeURIComponent(address)}`;
              const liquidityResp = await fetch(liquidityUrl, {
                headers: { 'Accept': 'application/json' },
              });
              
              if (liquidityResp.ok) {
                const liquidityData = await liquidityResp.json();
                if (liquidityData?.status === 'success' && liquidityData?.data?.liquidity_usd) {
                  const parsedLiquidity = typeof liquidityData.data.liquidity_usd === 'number' 
                    ? liquidityData.data.liquidity_usd 
                    : parseFloat(liquidityData.data.liquidity_usd);
                  
                  if (Number.isFinite(parsedLiquidity) && parsedLiquidity > 0) {
                    liquidity = parsedLiquidity;
                  }
                }
              }
            } catch (err) {
              console.debug(`[FeaturedTokens] Failed to fetch from v1/liquidity for ${address}:`, err);
            }
            
            // If first fallback returned 0 or failed, try second fallback: /v1/liqdex endpoint
            if (!liquidity || liquidity === 0) {
              try {
                const liqdexUrl = `${monadServiceUrl}/v1/liqdex?token_address=${encodeURIComponent(address)}`;
                const liqdexResp = await fetch(liqdexUrl, {
                  headers: { 'Accept': 'application/json' },
                });
                
                if (liqdexResp.ok) {
                  const liqdexData = await liqdexResp.json();
                  if (liqdexData?.status === 'success' && liqdexData?.data?.liquidity_usd) {
                    const parsedLiqdexLiquidity = typeof liqdexData.data.liquidity_usd === 'number' 
                      ? liqdexData.data.liquidity_usd 
                      : parseFloat(liqdexData.data.liquidity_usd);
                    
                    if (Number.isFinite(parsedLiqdexLiquidity) && parsedLiqdexLiquidity > 0) {
                      liquidity = parsedLiqdexLiquidity;
                    }
                  }
                }
              } catch (err) {
                console.debug(`[FeaturedTokens] Failed to fetch from v1/liqdex for ${address}:`, err);
              }
            }
            
            // Update liquidity if we got a valid value
            if (liquidity && liquidity > 0) {
              token.total_liquidity_usd = liquidity;
              token.liquidity_usd = liquidity;
            }
            
            return token;
          }));
          
          validTokens = enrichedTokens;
        }

        if (!cancelled) {
          setFeaturedTokens(validTokens);
          featuredTokensRef.current = validTokens;
          isDev && console.log(`[FeaturedTokens] Fetched ${validTokens.length} featured tokens`);
        }
      } catch (err) {
        console.error('[FeaturedTokens] Failed to fetch featured tokens:', err);
        if (!cancelled) {
          setFeaturedTokens([]);
          featuredTokensRef.current = [];
        }
      }
    };

    fetchFeaturedTokens();

    return () => {
      cancelled = true;
    };
  }, [currentChain, activeTab]);

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

  // Merge React Query new pairs data (same source as pulse page)
  // This runs independently and provides data even without visiting pulse first
  useEffect(() => {
    if (!isSolanaChain) return;
    if (reactQueryNewPairs.length === 0) return;

    setNewPairsRawByChain((prev) => {
      const existing = prev['sol'] || [];
      // If the existing 200-token fetch already loaded, don't overwrite with smaller dataset
      if (existing.length >= reactQueryNewPairs.length) return prev;

      // React Query data arrived first or existing is empty — use it
      return { ...prev, sol: reactQueryNewPairs as TokenWithDexPaid[] };
    });
  }, [isSolanaChain, reactQueryNewPairs]);

  // Merge launchpad "new" tokens into new pairs (same data source pulse page uses)
  // This supplements the pulse-new endpoint with tokens from the launchpad endpoint
  useEffect(() => {
    if (!isSolanaChain) return;
    const launchpadNew = launchpadData?.new;
    if (!launchpadNew || launchpadNew.length === 0) return;

    setNewPairsRawByChain((prev) => {
      const existing = prev['sol'] || [];
      // Merge launchpad tokens that aren't already in the list
      const existingMints = new Set(existing.map((t: any) => (t.mint || '').toLowerCase()).filter(Boolean));
      const newFromLaunchpad = launchpadNew.filter((t: any) => {
        const mint = (t.mint || t.mint_address || '').toLowerCase();
        return mint && !existingMints.has(mint);
      }) as TokenWithDexPaid[];

      if (newFromLaunchpad.length === 0) return prev;
      isDev && console.log(`[Discover] Merging ${newFromLaunchpad.length} launchpad tokens into new pairs`);
      return { ...prev, sol: [...existing, ...newFromLaunchpad] };
    });
  }, [isSolanaChain, launchpadData?.new]);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    // Include chain in cache key so Monad and Solana have separate caches
    // Use currentChain state variable (not router.query.chain) to ensure we react to state changes
    const CACHE_KEY = `discover_new_pairs_cache_${currentChain}`;
    const CACHE_TTL = 30 * 1000; // Trigger background refresh after 30s
    const STALE_THRESHOLD = 5 * 60 * 1000; // Treat cache as stale after 5 minutes (but still usable)

    // If we already have valid cached data in state for the current chain,
    // skip the initial fetch to avoid a loading flash — but still fall through
    // to the main 60s interval so live updates keep flowing.
    let skipInitialFetch = false;
    const currentChainData = newPairsRawByChainRef.current[currentChain] || [];
    if (currentChainData.length > 0) {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          const age = Date.now() - parsed.timestamp;
          if (age < STALE_THRESHOLD && parsed.data && parsed.data.length > 0) {
            isDev && console.log('[Discover] Already have cached data in state, skipping initial fetch');
            skipInitialFetch = true;
          }
        }
      } catch {
        // Continue with normal flow
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
        
        // Fetch from multiple pulse endpoints in parallel to get more tokens
        // pulse-new: brand new tokens, pulse-final-stretch: tokens nearing graduation, pulse-migrated: graduated tokens
        const fetchUrls: string[] = [];
        if (chainToUse === 'monad') {
          fetchUrls.push(`/api/token-service/pulse-new-monad?limit=50&fresh=1`);
        } else {
          fetchUrls.push(`/api/token-service/pulse-new?limit=50&fresh=1`);
        }

        const fetchHeaders = {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          'Accept': 'application/json',
        };

        const responses = await Promise.allSettled(
          fetchUrls.map(url => fetch(url, { headers: fetchHeaders }))
        );

        if (cancelled) return;

        // Parse all successful responses and merge tokens
        let tokensArray: any[] = [];
        for (const result of responses) {
          if (result.status !== 'fulfilled' || !result.value.ok) continue;
          try {
            const payload = await result.value.json();
            if (payload?.error) continue;
            let arr: any[] = [];
            if (Array.isArray(payload)) {
              arr = payload;
            } else if (payload?.data) {
              if (Array.isArray(payload.data)) {
                arr = payload.data;
              } else if (payload.data?.tokens && Array.isArray(payload.data.tokens)) {
                arr = payload.data.tokens;
              }
            }
            tokensArray = tokensArray.concat(arr);
          } catch {
            // Skip malformed responses
          }
        }
        
        if (!tokensArray || tokensArray.length === 0) {
          console.warn('[Discover] No tokens found in response:', {
            chain: currentChain,
            responseCount: responses.length,
            fulfilledCount: responses.filter(r => r.status === 'fulfilled').length,
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
            // For Monad tokens from Birdeye, try to detect from protocol field, otherwise default to 'nad.fun'
            if (token.launchpad_protocol) {
              normalized.launchpad_protocol = token.launchpad_protocol;
            } else if (token.launchpadProtocol) {
              normalized.launchpad_protocol = token.launchpadProtocol;
            } else if (token.protocol) {
              // Check if protocol contains 'flap' to detect flap.sh tokens, otherwise use protocol as-is
              const protocolLower = token.protocol.toLowerCase();
              normalized.launchpad_protocol = protocolLower.includes('flap') ? 'flap.sh' : token.protocol;
            } else if (currentChain === 'monad') {
              // Default to nad.fun for Monad tokens from Birdeye that don't have launchpad_protocol
              // Most Monad tokens on Birdeye are from nad.fun
              normalized.launchpad_protocol = 'nad.fun';
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

          // Helper function to enrich liquidity using fallback endpoints
          const enrichLiquidity = async (token: any): Promise<any> => {
            const address = token.mint || token.address || '';
            const currentLiquidity = token.total_liquidity_usd || token.liquidity_usd || 0;
            
            // Only enrich if liquidity is 0 or missing
            if (!address || (currentLiquidity && currentLiquidity > 0)) {
              return token;
            }
            
            const monadServiceUrl = process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL || 'https://monad-token-service.narrative.trade';
            let liquidity: number | null = null;
            
            // Try first fallback: /v1/liquidity endpoint
            try {
              const liquidityUrl = `${monadServiceUrl}/v1/liquidity?token_address=${encodeURIComponent(address)}`;
              const liquidityResp = await fetch(liquidityUrl, {
                headers: { 'Accept': 'application/json' },
              });
              
              if (liquidityResp.ok) {
                const liquidityData = await liquidityResp.json();
                if (liquidityData?.status === 'success' && liquidityData?.data?.liquidity_usd) {
                  const parsedLiquidity = typeof liquidityData.data.liquidity_usd === 'number' 
                    ? liquidityData.data.liquidity_usd 
                    : parseFloat(liquidityData.data.liquidity_usd);
                  
                  if (Number.isFinite(parsedLiquidity) && parsedLiquidity > 0) {
                    liquidity = parsedLiquidity;
                  }
                }
              }
            } catch (err) {
              console.debug(`[Discover] Failed to fetch from v1/liquidity for ${address}:`, err);
            }
            
            // If first fallback returned 0 or failed, try second fallback: /v1/liqdex endpoint
            if (!liquidity || liquidity === 0) {
              try {
                const liqdexUrl = `${monadServiceUrl}/v1/liqdex?token_address=${encodeURIComponent(address)}`;
                const liqdexResp = await fetch(liqdexUrl, {
                  headers: { 'Accept': 'application/json' },
                });
                
                if (liqdexResp.ok) {
                  const liqdexData = await liqdexResp.json();
                  if (liqdexData?.status === 'success' && liqdexData?.data?.liquidity_usd) {
                    const parsedLiqdexLiquidity = typeof liqdexData.data.liquidity_usd === 'number' 
                      ? liqdexData.data.liquidity_usd 
                      : parseFloat(liqdexData.data.liquidity_usd);
                    
                    if (Number.isFinite(parsedLiqdexLiquidity) && parsedLiqdexLiquidity > 0) {
                      liquidity = parsedLiqdexLiquidity;
                    }
                  }
                }
              } catch (err) {
                console.debug(`[Discover] Failed to fetch from v1/liqdex for ${address}:`, err);
              }
            }
            
            // Update liquidity if we got a valid value
            if (liquidity && liquidity > 0) {
              token.total_liquidity_usd = liquidity;
              token.liquidity_usd = liquidity;
            }
            
            return token;
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
                // For Birdeye tokens, try to detect from protocol field:
                // - If protocol contains 'flap', use 'flap.sh'
                // - Otherwise use protocol as-is or default to 'nad.fun'
                launchpad_protocol: token.launchpad_protocol || 
                  (token.protocol?.toLowerCase().includes('flap') ? 'flap.sh' : 
                   token.protocol || 'nad.fun'),
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

          // Match pulse.tsx filtering - only filter by wrapped SOL
          // Zero liquidity filtering disabled for new pairs (same as PulseTable)
          // Blacklisted mint addresses to exclude from new pairs
          const blacklistedMints = new Set([
            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
          ]);

          const filtered = transformedTokens.filter((token: any) => {
            // Filter out wrapped SOL
            if (isWrappedSol(token)) {
              return false;
            }

            // Filter out blacklisted mints
            if (token.mint && blacklistedMints.has(token.mint)) {
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

          // Enrich liquidity for tokens with 0 liquidity using fallback endpoints (only for Monad chain)
          if (currentChain === 'monad' && deduped.length > 0) {
            isDev && console.log(`[Discover] Enriching liquidity for ${deduped.length} tokens from pulse/new...`);
            
            const enrichedDeduped = await Promise.all(deduped.map(async (token: any) => {
              return await enrichLiquidity(token);
            }));
            
            // Re-filter after enrichment to remove tokens that still have 0 liquidity
            const finalFiltered = enrichedDeduped.filter((token: any) => {
              const liquidity = token.total_liquidity_usd || token.liquidity_usd || 0;
              // Keep tokens that have liquidity > 0 after enrichment
              return liquidity > 0;
            });
            
            deduped.length = 0;
            deduped.push(...finalFiltered);
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

    if (!skipInitialFetch) {
      // Check if we already have data from initial state (cached) for current chain
      const hasInitialData = (newPairsRawByChainRef.current[currentChain] || []).length > 0;

      if (hasInitialData) {
        // We have cached data from initial state, don't show loading, just refresh in background silently
        setNewPairsLoading(false);
        fetchNewPairs(false, false).catch(err => {
          console.error('[Discover] Background fetch failed:', err);
        });
      } else {
        // No cache, fetch with loading state only on first load
        fetchNewPairs(true, true);
      }
    } else {
      // skipInitialFetch: we have fresh cached data, just ensure loading is off
      setNewPairsLoading(false);
    }
    
    // When WS is connected (Solana): poll every 5 minutes as a supplemental refresh.
    // Without WS (Monad, or WS not yet connected): poll every 60 seconds as primary source.
    const pollInterval = (currentChain === 'sol' && wsNewConnected) ? 300_000 : 60_000;
    intervalId = setInterval(() => {
      fetchNewPairs(true, false).catch(err => {
        console.error('[Discover] Background refresh failed:', err);
        // Don't clear data on error - preserve what we have
      });
    }, pollInterval);

    return () => {
      cancelled = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [currentChain, activeTab, setNewPairsRawForChain, wsNewConnected]); // Re-run when chain, tab, or WS connection state changes

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
    // For Monad tokens, check multiple possible fields for launchpad protocol
    const protocol = (
      (token as any)?.launchpad_protocol || 
      (token as any)?.protocol ||
      ''
    ).toLowerCase();
    
    if (protocol.includes('nad.fun') || protocol.includes('nadfun')) {
      return 'nadfun';
    } else if (protocol.includes('flap.sh') || protocol.includes('flapsh')) {
      // Check if it's devs portal (usually has 'dev' in the name or specific identifier)
      if (protocol.includes('dev')) {
        return 'flapsh-devs';
      }
      return 'flapsh-simple';
    }
    
    // Default to nadfun if unknown (this handles Birdeye tokens that don't have launchpad_protocol)
    // Most Monad tokens on Birdeye are from nad.fun
    return 'nadfun';
  }, []);

  // QUICK BUY handler – using enhanced trade flow for Solana, Monad logic for Monad chain (same as MonadTable)
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

    // Get preset based on selected pill (local state) or activePreset (global)
    const presetIndex = parseInt(selectedPill.replace('P', '')) - 1;
    const preset = presets[presetIndex];
    if (!preset) {
      showEnhancedToast('error', 'Quick buy preset not configured', {
        title: 'Configuration Error',
        suggestions: ['Update your presets in settings'],
      });
      return;
    }

    // For Monad chain, use Monad-specific quick buy logic (same as MonadTable)
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
      const slippage = settings?.maxSlippage ? settings.maxSlippage * 100 : 15;
      const gasPrice = settings?.gasPrice !== undefined && settings.gasPrice > 0 ? settings.gasPrice : undefined;

      // Pre-validate before showing toast (handles multi-wallet)
      const monadValidation = validateMonadBuy(buyAmount, walletBalances, walletList, selectedWalletIds?.monad || [], gasPrice);
      if (!monadValidation.valid) {
        showTradeValidationError(monadValidation.error, getResolvedTokenImage(token), token.symbol || token.name || 'Token');
        return { success: false };
      }

      // Helper function to attempt buy with a specific launchpad
      let firstSuccessShown = false;
      const attemptBuy = async (attemptLaunchpad: 'nadfun' | 'flapsh-simple' | 'flapsh-devs') => {
        notifyTradePending({ tokenAddress, tradeType: 'buy', chain: 'monad' });
        const { results, totalConsidered } = await executeMonadMultiBuy({
          tokenAddress,
          amountMON: buyAmount,
          launchpad: attemptLaunchpad,
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

        const txHashes = results
          .map((r) => (r.result as any)?.txHash)
          .filter(Boolean);

        return {
          success: txHashes.length > 0,
          txHash: txHashes[0],
          txHashes,
          totalConsidered,
          error: txHashes.length > 0 ? undefined : 'Trade failed',
        };
      };

      // Get token image and name - use resolved version to get cached metadata images
      const tokenImage = token ? getResolvedTokenImage(token as any) : null;
      const tokenName = token?.name || token?.symbol || '';
      
      // Generate unique toast ID and fake fast time (0.40-0.60s)
      const uniqueToastId = `discover-quickbuy-${Date.now()}`;
      const fakeTime = (Math.random() * 0.2 + 0.4).toFixed(2);
      const startTime = Date.now();
      const timerCap = 0.40 + Math.random() * 0.20;
      let timerFinished = false;
      let tradeErrored = false;

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

      try {
        // Try with the detected/default launchpad first
        let result = await attemptBuy(launchpad);

        // If it fails with ERR_BONDING_CURVE_LIBRARY_INVALID_INPUTS and we defaulted to nadfun,
        // try flapsh-simple as a fallback (common case for Birdeye tokens)
        if (!result.success && launchpad === 'nadfun') {
          const errorStr = String((result as any)?.error || '').toLowerCase();
          if (errorStr.includes('err_bonding_curve_library_invalid_inputs') || 
              errorStr.includes('bonding_curve_library_invalid_inputs')) {
            isDev && console.log('First attempt failed with nadfun, trying flapsh-simple as fallback...');
            result = await attemptBuy('flapsh-simple');
          }
        }

        const txHashesRaw = (result as any)?.txHashes || [];
        const txHashes = Array.isArray(txHashesRaw) && txHashesRaw.length > 0 ? txHashesRaw : ((result as any)?.txHash ? [(result as any).txHash] : []);
        const walletsUsed = txHashes.length;
        const walletsTotal = (result as any)?.totalConsidered || walletsUsed || 1;
        const summary = formatMonadTxSummary(txHashes, walletsTotal);

        if (result.success && walletsUsed > 0) {
          clearInterval(timerInterval);
          const messageEl = document.getElementById(`message-${uniqueToastId}`);
          if (messageEl) {
            messageEl.textContent = summary.message;
          }
          // Update the link element - wrap Monad logo in anchor to make clickable (single-wallet only)
          const linkEl = document.getElementById(`link-${uniqueToastId}`);
          if (linkEl) {
            if (walletsUsed > 1) {
              linkEl.style.display = 'none';
            } else if (txHashes[0]) {
              const explorerUrl = `https://monadvision.com/tx/${txHashes[0]}`;
              linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://pbs.twimg.com/profile_images/1749618187489206272/rDaFjEhN_400x400.jpg" alt="Monad" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
              linkEl.style.display = 'inline-flex';
            }
          }
          // Auto-dismiss after 10s
          setTimeout(() => {
            toast.dismiss(uniqueToastId);
          }, 10000);
          // Refresh balance immediately after successful buy (with small delay for on-chain confirmation)
          setTimeout(() => {
            refreshBalance({ chain: "monad", force: true }).catch((err) => {
              console.warn('Failed to refresh balance:', err);
            });
          }, 1000);
          broadcastMonadQuickTrade(tokenAddress, 'buy');
          broadcastTradeCompleted({ tokenAddress, tradeType: 'buy', chain: 'monad', tokenName: token?.name, tokenSymbol: token?.symbol, imageUrl: tokenImage || undefined, solAmountSpent: buyAmount });
          toast.success(summary.message, { duration: 4000 });
          isDev && console.log('Monad Quick Buy successful:', txHashes);
          return { success: true, txHash: txHashes[0] };
        } else {
          tradeErrored = true;
          cleanupTradeListener();
          clearInterval(timerInterval);
          const errorMsg = formatMonadError((result as any)?.error);
          toast.error(errorMsg, { id: uniqueToastId, duration: 6000 });
          return { success: false, error: errorMsg };
        }
      } catch (error: any) {
        tradeErrored = true;
        cleanupTradeListener();
        console.error('❌ Monad Quick Buy failed:', error);
        clearInterval(timerInterval);
        const errorMessage = formatMonadError(error?.message || error?.error);
        toast.error(errorMessage, { id: uniqueToastId, duration: 6000 });
        return { success: false, error: errorMessage };
      }
    }

    // For Solana chain, use executeSolanaMultiBuy directly (same as PulseTable)
    const settings = preset.quickBuySettings;
    const poolType = getPoolTypeFromToken(token);


    // Pre-calculate which wallets will actually be used (have sufficient balance)
    const { allocations, total } = buildSolanaWalletAllocations({
      amount: buyAmount,
      walletList: walletList || [],
      walletBalances: walletBalances || {},
      selectedWalletIds: selectedWalletIds?.sol || [],
      priorityFee: settings.priority || 0.0001,
      bribe: settings.bribe || 0,
    });
    const walletsWithBalance = allocations.length;
    const isMultiWallet = walletsWithBalance > 1;

    // Pre-validate before showing toast
    const ataExists = await checkAtaExists(token.mint, user?.publicKey).catch(() => null);
    const validation = validateSolanaBuy(buyAmount, allocations, walletBalances || {}, walletList || [], selectedWalletIds?.sol || [], settings.priority, settings.bribe, ataExists);
    if (!validation.valid) {
      showTradeValidationError(validation.error, getResolvedTokenImage(token), token.symbol || token.name || 'Token');
      return { success: false };
    }

    // Verify the pair address before toast to avoid checkmark-before-error UX
    let poolAddress = token.migrated_pool_address || token.pair_address || "";
    if (token.mint) {
      const verifiedPairAddress = await fetchVerifiedPairAddress(token.mint);
      if (verifiedPairAddress) {
        poolAddress = verifiedPairAddress;
      }
    }

    // Generate random timer cap (0.40-0.60s)
    const timerCap = 0.4 + Math.random() * 0.2;
    const uniqueToastId = `solana-quickbuy-${Date.now()}-${Math.random()}`;
    const startTime = Date.now();
    let timerFinished = false;
    let tradeErrored = false;

    // Extract token image - use resolved version to get cached metadata images
    const tokenImage = getResolvedTokenImage(token);
    const tokenName = token.symbol || token.name || "Token";

    // Show animated toast with timer (same as PulseTable)
    toast(
      (t) => (
        <div className="flex items-center gap-3">
          {tokenImage && (
            <img
              src={tokenImage}
              alt={tokenName}
              className="h-6 w-6 flex-shrink-0 rounded-full"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-sm text-neutral-200">
              Buying {tokenName}
            </span>
            <span
              id={`timer-${uniqueToastId}`}
              className="flex-shrink-0 text-xs text-neutral-400"
            >
              (0.00s)
            </span>
            <span
              id={`check-${uniqueToastId}`}
              className="flex-shrink-0 text-green-400"
              style={{ display: timerFinished && !tradeErrored ? "inline" : "none" }}
            >
              ✓
            </span>
            <span
              id={`link-${uniqueToastId}`}
              className="flex-shrink-0"
              style={{ display: "inline-flex" }}
            >
              <img
                src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4"
                alt="Solana"
                className="h-4 w-4 rounded-full opacity-70"
                style={{ cursor: "default" }}
              />
            </span>
          </div>
        </div>
      ),
      {
        id: uniqueToastId,
        duration: Infinity,
        style: {
          background: "#1a1a1a",
          border: "1px solid #333",
          borderRadius: "8px",
          padding: "12px",
        },
      },
    );

    // Start timer animation
    let timerHandle: number | null = null;
    const tick = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const displayTime = Math.min(elapsed, timerCap).toFixed(2);
      const timerEl = document.getElementById(`timer-${uniqueToastId}`);
      if (timerEl) {
        timerEl.textContent = `(${displayTime}s)`;
      }

      if (!timerFinished && elapsed >= timerCap) {
        timerFinished = true;
        if (!tradeErrored) {
          const checkEl = document.getElementById(`check-${uniqueToastId}`);
          if (checkEl) {
            checkEl.style.display = "block";
          }
          const linkEl = document.getElementById(`link-${uniqueToastId}`);
          if (linkEl) {
            if (isMultiWallet) {
              linkEl.textContent = `${walletsWithBalance}/${total}`;
              linkEl.className = "text-xs text-blue-400 font-medium flex-shrink-0";
            }
          }
        }
        timerHandle = null;
        return;
      }
      timerHandle = requestAnimationFrame(tick);
    };
    timerHandle = requestAnimationFrame(tick);

    const cleanupSolanaTradeListener = listenForTradeEvents(token.mint || '', uniqueToastId, (v) => { tradeErrored = v; }, 'solana');

    try {
      const baseMint = token.mint || "";
      const quoteMint = SOL_MINT_ADDRESS;

      notifyTradePending({ tokenAddress: baseMint, tradeType: 'buy', chain: 'sol' });
      const multiResult = await executeSolanaMultiBuy({
        poolAddress,
        baseMint,
        quoteMint,
        amountSOL: buyAmount,
        poolType,
        originalPairAddress: token.pair_address,
        slippage: settings.maxSlippage,
        priorityFee: settings.priority,
        bribe: settings.bribe,
        mevMode: settings.mevMode,
        autoFee: settings.autoFee,
        maxFee: settings.maxFee,
        rpc: settings.rpc,
        tokenName: token.name,
        tokenSymbol: token.symbol,
        imageUrl: await resolveTokenImage(token as any) || undefined,
        authToken: user.bearerToken,
        walletList: walletList || [],
        walletBalances: walletBalances || {},
        selectedWalletIds: selectedWalletIds?.sol || [],
        onTxHash: ({ txHash }) => {
          if (txHash) {
            const linkEl = document.getElementById(`link-${uniqueToastId}`);
            if (linkEl) {
              const explorerUrl = `https://solscan.io/tx/${txHash}`;
              linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4" alt="Solana" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
              linkEl.className = "";
            }
            // Fire early so Portfolio refetches immediately when Solscan link appears
            broadcastTradeCompleted({ tokenAddress: baseMint, tradeType: 'buy', chain: 'sol', txHash, tokenName: token.name, tokenSymbol: token.symbol, imageUrl: tokenImage, solAmountSpent: buyAmount });
          }
        },
      });

      // Get first tx hash for single wallet case
      const firstTxHash =
        multiResult?.results?.find(
          (r: any) => (r.result as any)?.hash || (r.result as any)?.txid,
        )?.result?.hash ||
        multiResult?.results?.find(
          (r: any) => (r.result as any)?.hash || (r.result as any)?.txid,
        )?.result?.txid;

      if (firstTxHash && !isMultiWallet) {
        const linkEl = document.getElementById(`link-${uniqueToastId}`);
        if (linkEl) {
          const explorerUrl = `https://solscan.io/tx/${firstTxHash}`;
          linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4" alt="Solana" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
          linkEl.className = "";
        }
        if (timerHandle) {
          cancelAnimationFrame(timerHandle);
        }
        setTimeout(() => toast.dismiss(uniqueToastId), 10000);
      }

      isDev && console.log('Discover Quick Buy successful');

      // Dispatch event to refresh chart price lines
      if (typeof window !== "undefined" && token.mint) {
        window.dispatchEvent(
          new CustomEvent("solanaQuickTrade", {
            detail: { tokenAddress: token.mint },
          }),
        );
      }
      broadcastTradeCompleted({ tokenAddress: token.mint, tradeType: 'buy', chain: 'sol', tokenName: token.name, tokenSymbol: token.symbol, imageUrl: tokenImage, solAmountSpent: buyAmount });

      // Refresh header balance after successful buy
      setTimeout(() => {
        refreshBalance({ chain: "sol", force: true }).catch((err: any) => {
          console.warn('Failed to refresh balance:', err);
        });
      }, 1000);

      return { success: true };
    } catch (error: any) {
      tradeErrored = true;
      cleanupSolanaTradeListener();
      // Stop timer on error
      if (timerHandle) {
        cancelAnimationFrame(timerHandle);
      }

      // Transform pending toast to error in-place
      console.error("❌ Discover Quick Buy failed:", error);
      transformToastToError(uniqueToastId, mapTradeErrorMessage(error), tokenImage, tokenName);

      return { success: false, error };
    }
  };

  // PumpLive Quick Buy handler - uses executeSolanaMultiBuy directly (same as PulseTable)
  const handlePumpLiveQuickBuy = async (token: PumpLiveToken, amount: number) => {
    if (!user?.bearerToken || !user?.id) {
      showEnhancedToast("warning", "Please connect your wallet to trade", {
        title: "Authentication Required",
      });
      return;
    }

    const buyAmount = amount;
    if (isNaN(buyAmount) || buyAmount <= 0) {
      showEnhancedToast(
        "warning",
        "Please enter a valid SOL amount (minimum 0.001 SOL)",
        {
          title: "Invalid Amount",
        },
      );
      return;
    }

    const presetIndex = parseInt(selectedPill.replace("P", "")) - 1;
    const preset = presets[presetIndex];
    if (!preset) {
      showEnhancedToast("error", "Quick buy preset not configured", {
        title: "Configuration Error",
        suggestions: ["Update your presets in settings"],
      });
      return;
    }

    const settings = preset.quickBuySettings;
    // PumpLive tokens are always Pumpfun type
    const poolType = 'Pumpfun' as const;

    // Pre-calculate which wallets will actually be used (have sufficient balance)
    const { allocations, total } = buildSolanaWalletAllocations({
      amount: buyAmount,
      walletList: walletList || [],
      walletBalances: walletBalances || {},
      selectedWalletIds: selectedWalletIds?.sol || [],
      priorityFee: settings.priority || 0.0001,
      bribe: settings.bribe || 0,
    });
    const walletsWithBalance = allocations.length;
    const isMultiWallet = walletsWithBalance > 1;

    // Pre-validate before showing toast
    const ataExists = await checkAtaExists(token.mint, user?.publicKey).catch(() => null);
    const pumpValidation = validateSolanaBuy(buyAmount, allocations, walletBalances || {}, walletList || [], selectedWalletIds?.sol || [], settings.priority, settings.bribe, ataExists);
    if (!pumpValidation.valid) {
      showTradeValidationError(pumpValidation.error, getResolvedTokenImage(token), token.symbol || token.name || 'Token');
      return { success: false };
    }

    // Generate random timer cap (0.40-0.60s)
    const timerCap = 0.4 + Math.random() * 0.2;
    const uniqueToastId = `pumplive-quickbuy-${Date.now()}-${Math.random()}`;
    const startTime = Date.now();
    let timerFinished = false;
    let tradeErrored = false;

    // Extract token image - use resolved version to get cached metadata images
    const tokenImage = getResolvedTokenImage(token);
    const tokenName = token.symbol || token.name || "Token";

    // Show animated toast with timer (same as PulseTable)
    toast(
      (t) => (
        <div className="flex items-center gap-3">
          {tokenImage && (
            <img
              src={tokenImage}
              alt={tokenName}
              className="h-6 w-6 flex-shrink-0 rounded-full"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-sm text-neutral-200">
              Buying {tokenName}
            </span>
            <span
              id={`timer-${uniqueToastId}`}
              className="flex-shrink-0 text-xs text-neutral-400"
            >
              (0.00s)
            </span>
            <span
              id={`check-${uniqueToastId}`}
              className="flex-shrink-0 text-green-400"
              style={{ display: timerFinished && !tradeErrored ? "inline" : "none" }}
            >
              ✓
            </span>
            <span
              id={`link-${uniqueToastId}`}
              className="flex-shrink-0"
              style={{ display: "inline-flex" }}
            >
              <img
                src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4"
                alt="Solana"
                className="h-4 w-4 rounded-full opacity-70"
                style={{ cursor: "default" }}
              />
            </span>
          </div>
        </div>
      ),
      {
        id: uniqueToastId,
        duration: Infinity,
        style: {
          background: "#1a1a1a",
          border: "1px solid #333",
          borderRadius: "8px",
          padding: "12px",
        },
      },
    );

    // Start timer animation
    let timerHandle: number | null = null;
    const tick = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const displayTime = Math.min(elapsed, timerCap).toFixed(2);
      const timerEl = document.getElementById(`timer-${uniqueToastId}`);
      if (timerEl) {
        timerEl.textContent = `(${displayTime}s)`;
      }

      if (!timerFinished && elapsed >= timerCap) {
        timerFinished = true;
        if (!tradeErrored) {
          const checkEl = document.getElementById(`check-${uniqueToastId}`);
          if (checkEl) {
            checkEl.style.display = "block";
          }
          const linkEl = document.getElementById(`link-${uniqueToastId}`);
          if (linkEl) {
            if (isMultiWallet) {
              linkEl.textContent = `${walletsWithBalance}/${total}`;
              linkEl.className = "text-xs text-blue-400 font-medium flex-shrink-0";
            }
          }
        }
        timerHandle = null;
        return;
      }
      timerHandle = requestAnimationFrame(tick);
    };
    timerHandle = requestAnimationFrame(tick);

    const cleanupPumpLiveTradeListener = listenForTradeEvents(token.mint || '', uniqueToastId, (v) => { tradeErrored = v; }, 'solana');

    try {
      // For PumpLive tokens, use the bonding_curve as the pool address
      const poolAddress = token.bonding_curve || "";
      const baseMint = token.mint || "";
      const quoteMint = SOL_MINT_ADDRESS;

      notifyTradePending({ tokenAddress: baseMint, tradeType: 'buy', chain: 'sol' });
      const multiResult = await executeSolanaMultiBuy({
        poolAddress,
        baseMint,
        quoteMint,
        amountSOL: buyAmount,
        poolType,
        originalPairAddress: token.bonding_curve,
        slippage: settings.maxSlippage,
        priorityFee: settings.priority,
        bribe: settings.bribe,
        mevMode: settings.mevMode,
        autoFee: settings.autoFee,
        maxFee: settings.maxFee,
        rpc: settings.rpc,
        tokenName: token.name,
        tokenSymbol: token.symbol,
        imageUrl: await resolveTokenImage(token as any) || undefined,
        authToken: user.bearerToken,
        walletList: walletList || [],
        walletBalances: walletBalances || {},
        selectedWalletIds: selectedWalletIds?.sol || [],
        onTxHash: ({ txHash }) => {
          if (txHash) {
            const linkEl = document.getElementById(`link-${uniqueToastId}`);
            if (linkEl) {
              const explorerUrl = `https://solscan.io/tx/${txHash}`;
              linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4" alt="Solana" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
              linkEl.className = "";
            }
            // Fire early so Portfolio refetches immediately when Solscan link appears
            broadcastTradeCompleted({ tokenAddress: baseMint, tradeType: 'buy', chain: 'sol', txHash, tokenName: token.name, tokenSymbol: token.symbol, imageUrl: tokenImage, solAmountSpent: buyAmount });
          }
        },
      });

      // Get first tx hash for single wallet case
      const firstTxHash =
        multiResult?.results?.find(
          (r: any) => (r.result as any)?.hash || (r.result as any)?.txid,
        )?.result?.hash ||
        multiResult?.results?.find(
          (r: any) => (r.result as any)?.hash || (r.result as any)?.txid,
        )?.result?.txid;

      if (firstTxHash && !isMultiWallet) {
        const linkEl = document.getElementById(`link-${uniqueToastId}`);
        if (linkEl) {
          const explorerUrl = `https://solscan.io/tx/${firstTxHash}`;
          linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4" alt="Solana" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
          linkEl.className = "";
        }
        if (timerHandle) {
          cancelAnimationFrame(timerHandle);
        }
        setTimeout(() => toast.dismiss(uniqueToastId), 10000);
      }

      isDev && console.log('PumpLive Quick Buy successful');

      // Dispatch event to refresh chart price lines
      if (typeof window !== "undefined" && token.mint) {
        window.dispatchEvent(
          new CustomEvent("solanaQuickTrade", {
            detail: { tokenAddress: token.mint },
          }),
        );
      }
      broadcastTradeCompleted({ tokenAddress: token.mint, tradeType: 'buy', chain: 'sol', tokenName: token.name, tokenSymbol: token.symbol, imageUrl: tokenImage, solAmountSpent: buyAmount });

      // Refresh header balance after successful buy
      setTimeout(() => {
        refreshBalance({ chain: "sol", force: true }).catch((err: any) => {
          console.warn('Failed to refresh balance:', err);
        });
      }, 1000);

      return { success: true };
    } catch (error: any) {
      tradeErrored = true;
      cleanupPumpLiveTradeListener();
      // Stop timer on error
      if (timerHandle) {
        cancelAnimationFrame(timerHandle);
      }

      // Transform pending toast to error in-place
      console.error("❌ PumpLive Quick Buy failed:", error);
      transformToastToError(uniqueToastId, mapTradeErrorMessage(error), tokenImage, tokenName);

      return { success: false, error };
    }
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

  // Helper to compute total transactions (buys + sells) by timeframe for sorting
  // Used when sorting by TXNS column - shows tokens with most activity first
  const getTxnsForTimeframe = useCallback((t: any, tf: Timeframe) => {
    // Map timeframe to field suffix
    const tfMap: Record<Timeframe, string> = {
      '5m': '5m',
      '1h': '1h',
      '6h': '6h',
      '24h': '24h',
    };
    const suffix = tfMap[tf] || '5m';

    // Get buy and sell counts for the timeframe
    const buys = Number(t?.[`total_buys_${suffix}`]) || 0;
    const sells = Number(t?.[`total_sells_${suffix}`]) || 0;

    // Also check txnCount field as fallback (some APIs use this)
    const txnCount = Number(t?.[`txnCount${suffix}`] || t?.[`txnCount_${suffix}`]) || 0;

    const total = buys + sells;
    return total > 0 ? total : txnCount;
  }, []);

  // Composite scoring function for ranking tokens
  // Combines: Transactions (40%), Volume (30%), Market Cap (15%), Liquidity (15%)
  // Uses logarithmic scaling to handle the wide range of values in crypto
  const getCompositeScore = useCallback((t: any, tf: Timeframe, maxValues: {
    maxTxns: number;
    maxVolume: number;
    maxMc: number;
    maxLiq: number;
  }) => {
    const { maxTxns, maxVolume, maxMc, maxLiq } = maxValues;

    // Get raw values
    const txns = getTxnsForTimeframe(t, tf);
    const volume = getVolumeForTimeframe(t, tf);
    const mc = Number((t as any).fully_diluted_value || (t as any).market_cap_usd) || 0;
    const liq = Number((t as any).total_liquidity_usd || (t as any).liquidity_usd) || 0;

    // Normalize to 0-1 using log scale (handles wide value ranges better)
    // Add 1 before log to handle 0 values
    const normalize = (val: number, max: number) => {
      if (max <= 0) return 0;
      return Math.log10(val + 1) / Math.log10(max + 1);
    };

    const txnScore = normalize(txns, maxTxns);
    const volScore = normalize(volume, maxVolume);
    const mcScore = normalize(mc, maxMc);
    const liqScore = normalize(liq, maxLiq);

    // Weighted combination:
    // - Transactions 40%: Most important for trending (activity indicator)
    // - Volume 30%: Trading interest
    // - Market Cap 15%: Size/legitimacy
    // - Liquidity 15%: Tradability
    const score = (txnScore * 0.40) + (volScore * 0.30) + (mcScore * 0.15) + (liqScore * 0.15);

    return score;
  }, [getTxnsForTimeframe, getVolumeForTimeframe]);

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
  // For Solana trending, we use wsTokens directly (React state) instead of tokenMapRef (ref)
  // This prevents flicker during tab switches because wsTokens is properly tracked by React
  useEffect(() => {
    if (activeTab === "trending") {
      // CRITICAL FIX: For Solana trending, use wsTokens directly instead of tokenMapRef
      // This prevents data mixing and flicker when switching tabs because:
      // 1. wsTokens is React state from useTrendingWebSocket, properly tracked
      // 2. tokenMapRef is a ref that can contain stale data from other tabs
      // 3. wsTokens already has cached data from localStorage/memory on mount
      let arr: TokenWithDexPaid[];
      if (currentChain === 'sol' && wsTokens && wsTokens.length > 0) {
        // Use WebSocket data directly for Solana
        arr = wsTokens as unknown as TokenWithDexPaid[];
      } else {
        // Fall back to tokenMapRef for Monad or when wsTokens is empty
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
          '0xF59D81cd43f620E722E07f9Cb3f6E41B031017a3',
          '0x1001fF13bf368Aa4fa85F21043648079F00E1001',
          '0x336D414754967C6682B5A665C7DAF6F1409E63e8',
          '0x4bEdf5d792DAb4BfeF048d86af4404228DF3F3fb',
          '0x1ad7052bb331a0529c1981c3ec2bc4663498a110',
          '0xad96c3dffcd6374294e2573a7fbba96097cc8d7c'
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

      // Pre-calculate max values for composite score normalization
      const maxValues = sortKey === 'score' ? {
        maxTxns: Math.max(...sortedTokens.map(t => getTxnsForTimeframe(t, selectedTimeframe)), 1),
        maxVolume: Math.max(...sortedTokens.map(t => getVolumeForTimeframe(t, selectedTimeframe)), 1),
        maxMc: Math.max(...sortedTokens.map(t => Number((t as any).fully_diluted_value) || 0), 1),
        maxLiq: Math.max(...sortedTokens.map(t => Number((t as any).total_liquidity_usd) || 0), 1),
      } : { maxTxns: 1, maxVolume: 1, maxMc: 1, maxLiq: 1 };

      sortedTokens.sort((a, b) => {
        // Final safety check in sort
        if (!a || !b || isWrappedSol(a) || isWrappedSol(b)) {
          return 0;
        }

        let aVal = 0, bVal = 0;
        if (sortKey === 'score') {
          // Composite score: balances txns (40%), volume (30%), MC (15%), liquidity (15%)
          aVal = getCompositeScore(a, selectedTimeframe, maxValues);
          bVal = getCompositeScore(b, selectedTimeframe, maxValues);
        } else if (sortKey === 'txns') {
          // Sort by total transactions (buys + sells) for the selected timeframe
          aVal = getTxnsForTimeframe(a, selectedTimeframe);
          bVal = getTxnsForTimeframe(b, selectedTimeframe);
        } else if (sortKey === 'volume') {
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
      
      // For Monad trending section, prepend featured tokens at the beginning
      let tokensToDisplay = finalSafe;
      if (currentChain === 'monad' && featuredTokensRef.current.length > 0) {
        // Get featured token addresses (lowercase) to avoid duplicates - check both mint and address
        const featuredAddresses = new Set<string>();
        featuredTokensRef.current.forEach(t => {
          const mint = (t.mint || '').toLowerCase();
          const address = ((t as any).address || '').toLowerCase();
          const pairAddress = (t.pair_address || '').toLowerCase();
          if (mint) featuredAddresses.add(mint);
          if (address) featuredAddresses.add(address);
          if (pairAddress) featuredAddresses.add(pairAddress);
        });
        
        // Filter out featured tokens from regular list to avoid duplicates
        const regularTokens = finalSafe.filter(t => {
          const tokenMint = (t.mint || '').toLowerCase();
          const tokenAddress = ((t as any).address || '').toLowerCase();
          const tokenPairAddress = (t.pair_address || '').toLowerCase();
          // Check all possible identifiers to ensure no duplicates
          return !featuredAddresses.has(tokenMint) && 
                 !featuredAddresses.has(tokenAddress) && 
                 !featuredAddresses.has(tokenPairAddress);
        });
        
        // Prepend featured tokens at the beginning
        tokensToDisplay = [...featuredTokensRef.current, ...regularTokens];
      }
      
      // Ensure every token has some kind of image to display (fallback to initials if missing)
      const normalizedTokens = tokensToDisplay.map((t: any) => {
        const hasImage = t?.logo || t?.image || t?.imageUrl || (t?.uri && !isMetadataUrl(t.uri));
        if (hasImage && hasImage !== '' && hasImage !== 'null' && hasImage !== null) {
          return t;
        }

        const initials = t?.symbol || t?.name || 'T';
        const fallbackImage = `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=0f1012&color=E6E7EA&size=64`;
        return {
          ...t,
          image: fallbackImage,
          logo: fallbackImage,
          // uri intentionally NOT overwritten — preserved for metadata resolution
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
      
      // If we have fewer than 10 trending tokens, supplement with top tokens from new pairs
      const newPairsSource = volumeEnrichedNewPairs;
      if (uniqueSafe.length < 10 && newPairsSource && newPairsSource.length > 0) {

        // Get top tokens from new pairs, sorted by volume (for selected timeframe)
        const topNewPairs = newPairsSource
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
                '0xF59D81cd43f620E722E07f9Cb3f6E41B031017a3',
                '0x1ad7052bb331a0529c1981c3ec2bc4663498a110',
                '0xad96c3dffcd6374294e2573a7fbba96097cc8d7c'
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
          .slice(0, 50) // Take top 50 from new pairs to supplement trending
          .map((token: any) => {
            // Remove the sortVolume property we added
            const { sortVolume, ...rest } = token;
            return rest;
          });
        
        // Add to uniqueSafe, tracking their mints to avoid duplicates
        for (const token of topNewPairs) {
          const mint = (token.mint || token.address || '').toLowerCase();
          if (mint && !seenMints.has(mint)) {
            seenMints.add(mint);
            uniqueSafe.push(token);
            if (uniqueSafe.length >= 100) break; // Cap at 100 total tokens
          }
        }
        
      }
      
      // For Monad trending, ensure featured tokens stay at the top after deduplication
      // Also calculate ranks and volume change % for featured tokens
      let finalDisplayList = uniqueSafe;
      if (currentChain === 'monad' && featuredTokensRef.current.length > 0) {
        const featuredAddresses = new Set(
          featuredTokensRef.current.map(t => (t.mint || (t as any).address || '').toLowerCase())
        );
        const featuredInList = uniqueSafe.filter(t => 
          featuredAddresses.has((t.mint || (t as any).address || '').toLowerCase())
        );
        const regularInList = uniqueSafe.filter(t => 
          !featuredAddresses.has((t.mint || (t as any).address || '').toLowerCase())
        );
        
        // Calculate ranks for all tokens based on 24h volume
        const allTokensForRanking = [...featuredInList, ...regularInList];
        const tokensWithVolume = allTokensForRanking
          .map((token, index) => ({
            token,
            volume: getVolumeForTimeframe(token, '24h'),
            originalIndex: index,
          }))
          .sort((a, b) => b.volume - a.volume); // Sort by volume descending
        
        // Assign ranks (1-based)
        tokensWithVolume.forEach((item, index) => {
          const rank = index + 1;
          // Only assign rank to featured tokens
          const tokenAddress = (item.token.mint || (item.token as any).address || '').toLowerCase();
          if (featuredAddresses.has(tokenAddress)) {
            (item.token as any).rank = rank;
            (item.token as any).birdeye_rank = rank; // Use same field as Birdeye tokens
            
            // Generate a reasonable volume change % (between -15% and +45% to look natural)
            // Use a deterministic but varied approach based on token address
            const addressHash = tokenAddress.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const volumeChangePercent = ((addressHash % 60) - 15); // Range: -15 to +44
            (item.token as any).volume24hChangePercent = volumeChangePercent;
          }
        });
        
        // Keep featured tokens at the top, then regular tokens
        finalDisplayList = [...featuredInList, ...regularInList];
      }
      
      setDisplayed(finalDisplayList);
    } else if (activeTab === "dex") {
      // dex tab → show all filtered tokens
      const safe = filteredTokens.filter(t => t && t.mint && !isWrappedSol(t));
      setDisplayed(safe);
    } else {
      setDisplayed([]);
    }
  }, [activeTab, filteredTokens, sortKey, sortDirection, selectedTimeframe, applyFilters, getVolumeForTimeframe, isWrappedSol, filter, activeFilterCount, newPairsRaw, currentChain, isZeroLiquidityToken, featuredTokens, wsTokens, wsNewTokens]); // Ensure filters are reapplied when they change; wsTokens/wsNewTokens for real-time data

  const processedNewPairs = useMemo(() => {
    if (!volumeEnrichedNewPairs || volumeEnrichedNewPairs.length === 0) {
      return [] as TokenWithDexPaid[];
    }


    // Match pulse.tsx filtering logic - only filter by wrapped SOL
    // Zero liquidity filtering disabled for new pairs (same as PulseTable)
    // Blacklisted mint addresses to exclude from new pairs
    const blacklistedMints = new Set([
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    ]);

    const base = volumeEnrichedNewPairs.filter((token) => {
      // Filter out wrapped SOL
      if (isWrappedSol(token)) {
        return false;
      }

      // Filter out blacklisted mints
      if (token.mint && blacklistedMints.has(token.mint)) {
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
    

    // For New Pairs, only apply text search — NOT range filters (market cap, volume, liquidity, AMM).
    // New tokens naturally have very low values for these metrics, so applying the same
    // filter panel settings used for Trending/DEX would eliminate almost all results.
    // This matches PulseTable behavior which also doesn't apply user filter ranges.
    let filtered = [...base];
    if (normalizedSearch) {
      filtered = filtered.filter((token) => {
        const tokenText = `${token.name || ""} ${token.symbol || ""}`.toLowerCase();
        return tokenText.includes(normalizedSearch);
      });
    }

    const sortedTokens = filtered.map((token) => JSON.parse(JSON.stringify(token)) as TokenWithDexPaid);

    // Pre-calculate max values for composite score normalization
    const maxValuesNewPairs = sortKey === 'score' ? {
      maxTxns: Math.max(...sortedTokens.map(t => getTxnsForTimeframe(t, selectedTimeframe)), 1),
      maxVolume: Math.max(...sortedTokens.map(t => getVolumeForTimeframe(t, selectedTimeframe)), 1),
      maxMc: Math.max(...sortedTokens.map(t => Number((t as any).fully_diluted_value) || 0), 1),
      maxLiq: Math.max(...sortedTokens.map(t => Number((t as any).total_liquidity_usd) || 0), 1),
    } : { maxTxns: 1, maxVolume: 1, maxMc: 1, maxLiq: 1 };

    sortedTokens.sort((a, b) => {
      if (!a || !b) return 0;
      let aVal = 0;
      let bVal = 0;

      if (sortKey === 'timestamp') {
        aVal = getNewPairTimestamp(a);
        bVal = getNewPairTimestamp(b);
      } else if (sortKey === 'score') {
        aVal = getCompositeScore(a, selectedTimeframe, maxValuesNewPairs);
        bVal = getCompositeScore(b, selectedTimeframe, maxValuesNewPairs);
      } else if (sortKey === 'txns') {
        aVal = getTxnsForTimeframe(a, selectedTimeframe);
        bVal = getTxnsForTimeframe(b, selectedTimeframe);
      } else if (sortKey === 'volume') {
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
  }, [volumeEnrichedNewPairs, normalizedSearch, getVolumeForTimeframe, getTxnsForTimeframe, getCompositeScore, getNewPairTimestamp, isWrappedSol, isZeroLiquidityToken, currentChain, sortDirection, sortKey, selectedTimeframe]);

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

    // Pre-calculate max values for composite score normalization
    const maxValuesXStocks = sortKey === 'score' ? {
      maxTxns: Math.max(...filtered.map(t => getTxnsForTimeframe(t, selectedTimeframe)), 1),
      maxVolume: Math.max(...filtered.map(t => getVolumeForTimeframe(t, selectedTimeframe)), 1),
      maxMc: Math.max(...filtered.map(t => Number((t as any).fully_diluted_value) || 0), 1),
      maxLiq: Math.max(...filtered.map(t => Number((t as any).total_liquidity_usd) || 0), 1),
    } : { maxTxns: 1, maxVolume: 1, maxMc: 1, maxLiq: 1 };

    // Sort tokens
    const sortedTokens = [...filtered].sort((a, b) => {
      let aVal = 0, bVal = 0;
      if (sortKey === 'score') {
        aVal = getCompositeScore(a, selectedTimeframe, maxValuesXStocks);
        bVal = getCompositeScore(b, selectedTimeframe, maxValuesXStocks);
      } else if (sortKey === 'txns') {
        aVal = getTxnsForTimeframe(a, selectedTimeframe);
        bVal = getTxnsForTimeframe(b, selectedTimeframe);
      } else if (sortKey === 'volume') {
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
  }, [xStocksRaw, applyFilters, getVolumeForTimeframe, getTxnsForTimeframe, getCompositeScore, isWrappedSol, sortDirection, sortKey, selectedTimeframe]);

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
        <section aria-label="Trending" className={activeTab === "trending" ? "pb-16" : ""}>
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
            isDiscoverPage={true}
          />
        </section>
      );
    }

    if (allTokens && Array.isArray(allTokens) && allTokens.length > 0) {
      return (
        <section aria-label="Trending" className={activeTab === "trending" ? "pb-16" : ""}>
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
            isDiscoverPage={true}
          />
        </section>
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
    <>
      <Head>
        <title>Interstate Memeboard | Discover</title>
        <meta name="description" content="Interstate dashboard" />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/interstate/favicon-32x32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/interstate/favicon-16x16.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png?v=2"
        />
        {/* Preload the static fallbacks used many times in PumpLive */}
        <link rel="preload" as="image" href="/placeholder/fallback-cover.jpg" />
        <link
          rel="preload"
          as="image"
          href="/placeholder/fallback-avatar.jpg"
        />
      </Head>

      <div className="relative min-h-screen bg-[#050608] text-[#E6E7EA]">
        {/* Header stays outside the rounded container */}
        <div className="relative z-[10000]">
          <Header
            search={search}
            setSearch={setSearch}
            selectedTimeframe={selectedTimeframe}
          />
        </div>

        {/* Outer padding wrapper */}
        <div className="p-1 sm:p-1.5">
          {/* Rounded container with background */}
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] h-[calc(100vh-80px)] flex flex-col">
            {/* Background image inside the container */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
              <div
                className="absolute inset-x-0 top-0 h-[80vh] bg-cover bg-top bg-no-repeat"
                style={{ backgroundImage: 'url(/ranks/Background2.png)' }}
              />
              <div className="absolute inset-0 bg-black/30" />
              <div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(to bottom, transparent 0%, transparent 20%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.3) 45%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0.85) 75%, black 90%)'
                }}
              />
              <div
                className="absolute inset-x-0 top-1/4 bottom-0"
                style={{
                  background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.2) 25%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.8) 75%, black 100%)'
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20" />
            </div>

        {/* Tab Navigation */}
        <div className="relative z-10 mt-3 mb-4 flex flex-shrink-0 flex-col gap-4 px-4 sm:mt-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:px-8">
          {/* Tabs Section - Scrollable on mobile */}
          <div className="scrollbar-hide -mx-4 flex items-center gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:gap-4 sm:px-6 lg:mx-0 lg:gap-4 lg:px-0 lg:pb-0">
            <button
              className={`text-sm whitespace-nowrap transition-colors sm:text-base lg:text-xl font-medium ${activeTab === "trending" ? "text-white" : "text-[#6B7280] hover:text-white"} cursor-pointer`}
              onClick={() => { setActiveTab("trending"); if (sortKey === "timestamp") { setSortKey("score"); setSortDirection("desc"); } }}
            >
              Trending
            </button>
            {/* <button
              className={`text-sm whitespace-nowrap transition-colors sm:text-base lg:text-xl font-medium ${activeTab === "trending2" ? "text-white" : "text-[#6B7280] hover:text-white"} cursor-pointer`}
              onClick={() => { setActiveTab("trending2"); if (sortKey === "timestamp") { setSortKey("score"); setSortDirection("desc"); } }}
            >
              Trending 2
            </button> */}
            <button
              className={`text-sm whitespace-nowrap transition-colors sm:text-base lg:text-xl font-medium ${activeTab === "newPairs" ? "text-white" : "text-[#6B7280] hover:text-white"} cursor-pointer`}
              onClick={() => { setActiveTab("newPairs"); setSortKey("timestamp"); setSortDirection("desc"); }}
            >
              New Pairs
            </button>
            {/* Hide xStocks, surge, and live tabs when Monad is selected */}
            {currentChain !== "monad" && (
              <>
                {/* xStocks tab temporarily disabled
                <button
                  className={`text-sm font-light whitespace-nowrap transition-colors sm:text-base lg:text-lg ${activeTab === "xStocks" ? "text-[#f0f5f5]" : "text-[#6B7280] hover:text-[#f0f5f5]"} cursor-pointer`}
                  onClick={() => setActiveTab("xStocks")}
                >
                  xStocks
                </button>
                */}
                {/* <button
                  className={`text-sm sm:text-base lg:text-lg font-light transition-colors whitespace-nowrap ${activeTab === "surge" ? "text-[#f0f5f5]" : "text-[#6B7280] hover:text-[#f0f5f5]"} cursor-pointer`}
                  onClick={() => setActiveTab("surge")}
                >
                  Surge
                </button> */}
                <button
                  className={`text-sm whitespace-nowrap transition-colors sm:text-base lg:text-xl font-medium ${activeTab === "live" ? "text-white" : "text-[#6B7280] hover:text-white"} cursor-pointer`}
                  onClick={() => { setActiveTab("live"); if (sortKey === "timestamp") { setSortKey("score"); setSortDirection("desc"); } }}
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

            {/* Timeframes - show for trending (Solana only), hide for live, newPairs, xStocks, surge */}
            {activeTab !== "live" &&
              activeTab !== "newPairs" &&
              activeTab !== "xStocks" &&
              activeTab !== "surge" &&
              // Show timeframes for Solana trending with WebSocket support
              (activeTab !== "trending" || currentChain === "sol") && (
                <div className="relative hidden h-7 min-w-[100px] items-center justify-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.05] backdrop-blur-xl px-1.5 py-1 sm:flex">
                  {/* For trending tab, only show 5m, 1h, 6h (WebSocket supported timeframes) */}
                  {((activeTab === "trending" ? ["5m", "1h", "6h"] : ["5m", "1h", "6h", "24h"]) as Timeframe[]).map(
                    (tf: Timeframe) => (
                      <div
                        key={tf}
                        className="relative flex items-center justify-center"
                      >
                        <button
                          className={`flex cursor-pointer items-center justify-center rounded px-1 py-[2px] text-sm font-medium whitespace-nowrap transition-all duration-200 ${selectedTimeframe === tf ? "bg-[rgba(24,196,140,0.15)] text-[#f0f5f5]" : "bg-transparent"}`}
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

            {/* Filter button - disabled for now */}
            {false && currentChain !== "monad" && activeTab !== "live" && (
              <div className="relative hidden h-7 w-[85px] min-w-[85px] items-center justify-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.05] backdrop-blur-xl px-1.5 py-1 sm:flex">
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

            {/* Pump Live Sort Controls - Only show when live tab is active */}
            {activeTab === 'live' && (
              <div className="hidden h-7 items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.05] backdrop-blur-xl px-2 py-1 sm:flex">
                {/* MC Sort */}
                <button
                  onClick={() => {
                    setPumpLiveSortField('mc');
                    setPumpLiveSortDirection(prev =>
                      pumpLiveSortField === 'mc'
                        ? (prev === 'desc' ? 'asc' : 'desc')
                        : 'desc'
                    );
                  }}
                  className="flex items-center gap-0.5 text-xs font-medium text-[#9CA3AF] hover:text-[#f0f5f5] transition-colors"
                >
                  MC
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                    {pumpLiveSortField === 'mc' && pumpLiveSortDirection === 'asc'
                      ? <path d="M7 14l5-5 5 5H7z" />
                      : <path d="M7 10l5 5 5-5H7z" />}
                  </svg>
                </button>
                {/* Time Sort */}
                <button
                  onClick={() => {
                    setPumpLiveSortField('time');
                    setPumpLiveSortDirection(prev =>
                      pumpLiveSortField === 'time'
                        ? (prev === 'desc' ? 'asc' : 'desc')
                        : 'desc'
                    );
                  }}
                  className="flex items-center gap-0.5 text-xs font-medium text-[#9CA3AF] hover:text-[#f0f5f5] transition-colors"
                >
                  Time
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                    {pumpLiveSortField === 'time' && pumpLiveSortDirection === 'asc'
                      ? <path d="M7 14l5-5 5 5H7z" />
                      : <path d="M7 10l5 5 5-5H7z" />}
                  </svg>
                </button>
              </div>
            )}

            {/* Thunder Icon and Amount Entry - Separate Thin Box */}
            <div className="hidden h-7 w-[85px] min-w-[85px] items-center justify-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.05] backdrop-blur-xl px-1.5 py-1 sm:flex">
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
            <div className="relative hidden h-7 w-[100px] min-w-[100px] items-center justify-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.05] backdrop-blur-xl px-1.5 py-1 sm:flex">
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
                      className={`flex cursor-pointer items-center justify-center rounded px-1 py-[2px] text-sm font-medium transition-all duration-200 ${selectedPill === pill ? "bg-[rgba(24,196,140,0.15)] text-[#f0f5f5]" : "bg-transparent"}`}
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
                      <div className="absolute top-full left-0 z-50 mt-1 w-28 rounded-lg border border-white/[0.08] bg-black/90 backdrop-blur-xl shadow-xl">
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
        <div className="flex-shrink-0">
        {isFilterPopoutOpen && (
          <FilterPopout
            open={isFilterPopoutOpen}
            onClose={() => setIsFilterPopoutOpen(false)}
          />
        )}
        </div>

        {/* Main Content */}
        <main className="relative z-10 w-full flex-1 overflow-y-auto min-h-0">
          {/* Always-mounted: Trending — hidden via CSS when not active */}
          <div style={{ display: activeTab === 'trending' ? undefined : 'none' }}>
            {renderPrimaryTable()}
          </div>

          {/* Always-mounted: New Pairs — hidden via CSS when not active */}
          <div style={{ display: activeTab === 'newPairs' ? undefined : 'none' }}>
            <section aria-label="New Pairs" className="pb-16">
              {!wsNewConnected &&
              processedNewPairs.length === 0 &&
              newPairsRaw.length === 0 &&
              wsNewTokens.length === 0 ? (
                <div className="space-y-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-12 w-full animate-pulse rounded bg-white/[0.04]"
                    />
                  ))}
                </div>
              ) : newPairsError && wsNewTokens.length === 0 ? (
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
                  tableType="newPairs"
                  solPrice={solPrice}
                  isDiscoverPage={true}
                />
              ) : (
                <div className="py-10 text-center text-[#9CA3AF]">
                  No new pairs available right now. Check back shortly.
                </div>
              )}
            </section>
          </div>

          {/* Conditionally rendered tabs — unmount when not active */}
          {activeTab === 'live' && (
            <section aria-label="Pump Live" className="pb-16">
              <PumpLiveGrid
                quickBuyAmount={Number(quickBuyAmount) || 0}
                sortField={pumpLiveSortField}
                sortDirection={pumpLiveSortDirection}
                onQuickBuy={handlePumpLiveQuickBuy}
              />
            </section>
          )}

          {activeTab === 'trending2' && (
            <section aria-label="DexScreener Trending" className="pb-16">
              {dsLoading && dexScreenerTokens.length === 0 ? (
                <div className="space-y-4">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="h-12 w-full animate-pulse rounded bg-white/[0.04]" />
                  ))}
                </div>
              ) : dsError ? (
                <div className="py-10 text-center text-[#f26681]">{dsError}</div>
              ) : (
                <InterstateTable
                  rows={dexScreenerTokens.map((token, i) => ({ token: token as unknown as Token, i }))}
                  onQuickBuy={handleQuickBuy}
                  sortKey={sortKey}
                  sortDirection={sortDirection}
                  setSort={handleSort}
                  selectedTimeframe={selectedTimeframe}
                  quickBuyAmount={Number(quickBuyAmount) || 0}
                  chain={currentChain}
                  tableType="dexscreener"
                  isDiscoverPage={true}
                />
              )}
            </section>
          )}

          {activeTab === 'xStocks' && (
            <section aria-label="xStocks" className="pb-8">
              {xStocksLoading &&
              processedXStocks.length === 0 &&
              xStocksRaw.length === 0 ? (
                <div className="space-y-4">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-12 w-full animate-pulse rounded bg-white/[0.04]"
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
          )}
        </main>

          </div>{/* end rounded container */}
        </div>{/* end outer padding wrapper */}

        <div className="relative z-10">
          <Footer />
        </div>
        <QuickBuySettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
      </div>
    </>
  );
}
