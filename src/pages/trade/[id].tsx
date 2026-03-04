import { useRouter } from "next/router";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { formatMarketCap } from "../../utils/formatPrice";
import { useWallet } from "../../components/useWallet";
import { useUser } from "../../components/UserContext";
import { normalizeTimestampMs, normalizeTimestampToISO } from "../../utils/db";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import TradeHeader from "../../components/trade/TradeHeader";
import CustomSolanaChart from "../../components/CustomSolanaChart";

import TradeActionPanel from "../../components/trade/TradeActionPanel";
import TradeTabs from "../../components/trade/TradeTabs";
import InstantTradeModal from "../../components/trade/InstantTradeModal";
import useSingleTokenPolling from "../../hooks/useSingleTokenPolling";
import useInitialTradeData from "../../hooks/useInitialTradeData";
import useBackgroundOHLCPreload from "../../hooks/useBackgroundOHLCPreload";
import { useQuickBuyQueryParams } from "../../components/QuickBuy";
import { useTradePageQueryParams } from "../../utils/queryParams";
import { useComponentCache } from "../../hooks/useComponentCache";
import useOptimizedTradeEventsWebSocket from "../../hooks/useOptimizedTradeEventsWebSocket";
import { useSolanaTokenWebSocket } from "../../hooks/useSolanaTokenWebSocket";
import { SolanaTokenWebSocketProvider } from "../../contexts/SolanaTokenWebSocketContext";
import dynamic from "next/dynamic";
import SimilarTokensPanel from "../../components/trade/SimilarTokensPanel";
import ReusedImageTokensPanel from "../../components/trade/ReusedImageTokensPanel";
import TokenLimitOrders from "../../components/trade/TokenLimitOrders";
import { creatorAddressCache } from "../../utils/preloadTradeChart";
// Eager load AdvancedOHLCChart on trade pages - always needed, so no point in lazy loading
import AdvancedOHLCChart from "../../components/AdvancedOHLCChart";

// Lazy load other heavy components to reduce initial bundle size
//const BackendOHLCChart = dynamic(() => import("../../components/BackendOHLCChart"), { ssr: false });
const CodexTrades = dynamic(() => import("../../components/trade/CodexTrades"), { ssr: false });
const CodexTopTraders = dynamic(() => import("../../components/trade/CodexTopTraders"), { ssr: false });
const CodexDevTokens = dynamic(() => import("../../components/trade/CodexDevTokens"), { ssr: false });
const CodexHolders = dynamic(() => import("../../components/trade/CodexHolders"), { ssr: false });

/* ---------- AXIOM palette ---------- */
const AX = {
  bg: "#0C0C0F",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#f0f5f5",
  muted: "#9CA3AF",
  mint: "#70E0B0",
  mintHover: "#58B890",
  sell: "#FF4D7F",
};

/* ===================================================================== */

type SimilarTokenLite = {
  id: string;
  name: string;
  symbol?: string;
  logoUrl?: string;
  lastTxAt?: number;    // unix seconds
  tokenAgeSec?: number; // e.g., 6mo, 1y
  marketCapUsd?: number;
  verified?: boolean;
};

type ReusedTokenLite = {
  id: string;
  name: string;
  symbol?: string;
  logoUrl?: string;
  lastTxAt?: number;
  tokenAgeSec?: number;
  marketCapUsd?: number;
  verified?: boolean;
};

export default function TradePage() {
  const router = useRouter();
  const { id, _name, _symbol, _price, _mcap, _image, _mint, _launchpad_protocol, _liquidity, _created_at, _migrated } = router.query;

  // Wait for router to be ready before using query params
  // This prevents hydration issues where id is undefined briefly
  const isRouterReady = router.isReady;
  const idString = typeof id === "string" ? id : "";

  // /trade/[id] is the Solana trade page - always use solana
  // Monad has its own page at /trade/monad/[contractAddress]
  const network = 'solana';

  const { backgroundData: backgroundOHLCData, isPreloading, preloadComplete } = useBackgroundOHLCPreload();

  const optimisticToken = React.useMemo(() => {
    // Create optimistic token if we have name/symbol OR mint address (for tokens without metadata)
    if (_name || _symbol || _mint) {
      return {
        name: (_name as string) || (_symbol as string) || "",
        symbol: (_symbol as string) || "",
        mint: (_mint as string) || "",
        price_usd: _price ? parseFloat(_price as string) : undefined,
        market_cap_usd: _mcap ? parseFloat(_mcap as string) : undefined,
        image: (_image as string) || undefined,
        launchpad_protocol: (_launchpad_protocol as string) || undefined,
        // Liquidity passed from PulseTable for instant display
        liquidity_usd: _liquidity ? parseFloat(_liquidity as string) : undefined,
        // Created at / launch_time passed from PulseTable for instant age display
        launch_time: (_created_at as string) || undefined,
        created_at: (_created_at as string) || undefined,
        // Migrated flag from PulseTable column context — hides B. Curve in TradeHeader
        is_migrated: _migrated === "1" ? true : undefined,
      };
    }
    return null;
  }, [_name, _symbol, _price, _mcap, _image, _mint, _launchpad_protocol, _liquidity, _created_at, _migrated]);

  if (process.env.NODE_ENV === "development") {
    console.log("TradePage Debug:", {
      id,
      idType: typeof id,
      isString: typeof id === "string",
      mintFromQuery: _mint,
      optimisticToken,
      // Debug liquidity/age/image from query params
      queryParams: { _liquidity, _created_at, _image },
      optimisticHasData: {
        liquidity: optimisticToken?.liquidity_usd,
        age: optimisticToken?.launch_time || optimisticToken?.created_at,
        image: optimisticToken?.image,
      }
    });
  }

  const [tokenDataLoading, setTokenDataLoading] = useState(false);
  const [tradesDataLoading, setTradesDataLoading] = useState(false);
  const { isConnected } = useWallet();
  const { user, primaryWalletAddresses } = useUser();
  const [selectedTab, setSelectedTab] = useState("Trades");
  const [devTokensCount, setDevTokensCount] = useState<number | undefined>(undefined);
  const [holdersCount, setHoldersCount] = useState<number | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [showMobileTradeModal, setShowMobileTradeModal] = useState(false);
  const [isClosingModal, setIsClosingModal] = useState(false);
  
  // Load instant trade open state from localStorage
  const getInitialInstantTradeState = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
      const saved = localStorage.getItem('instant-trade-popup-open');
      return saved === 'true';
    } catch {
      return false;
    }
  };
  
  const [isInstantTradeOpen, setIsInstantTradeOpen] = useState(getInitialInstantTradeState);
  
  // Save instant trade open state to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('instant-trade-popup-open', String(isInstantTradeOpen));
    }
  }, [isInstantTradeOpen]);

  const modalDragRef = useRef<HTMLDivElement | null>(null);
  const dragStartY = useRef(0);
  const dragCurrentY = useRef(0);
  const isDragging = useRef(false);
  const modalTransform = useRef(0);

  // Client-side cache for trades: pairAddress -> trades array
  // This persists across tab switches so trades don't reload when switching tabs
  const tradesCacheRef = useRef<Map<string, any[]>>(new Map());
  const cachedPairAddressRef = useRef<string | null>(null);

  const { settings: quickBuySettings, side: quickBuySide } = useQuickBuyQueryParams();
  const { params: tradeParams, setParams: setTradeParams, isReady: tradeParamsReady } = useTradePageQueryParams();

  const { token, isPolling, loading: pollingLoading, resolvedPairAddress } = useSingleTokenPolling(
    typeof id === "string" ? id : undefined,
    typeof _mint === "string" ? _mint : undefined // Pass mint from URL for pair address verification
  );

  const {
    data: initialTradeData,
    loading: initialDataLoading,
    error: initialDataError,
    isFromCache,
    cacheStats,
    cleanupCache,
    cachedTokenMetadata,
  } = useInitialTradeData(resolvedPairAddress, token?.mint, 'sol');

  const [correctTokenData, setCorrectTokenData] = useState<any>(null);
  const [isLoadingCorrectData, setIsLoadingCorrectData] = useState(false);

  const [creatorAddress, setCreatorAddress] = useState<string | null>(null);

  // Reset state when navigating to a different token
  useEffect(() => {
    console.log('[TradePage] Token ID changed, resetting state:', id);
    setCorrectTokenData(null);
    setCreatorAddress(null);
    setIsLoadingCorrectData(false);
    setChartMetrics({});       // Clear stale chart price/mcap from previous token
    setPositionLinesApi(null); // Clear stale position lines (wrong token's avg entry/exit)
  }, [id]);

  useEffect(() => {
    if (!token?.mint) return;
    let cancelled = false;

    const fetchParallel = async () => {
      const needsSearch = !(correctTokenData?.mint === token.mint || normalizeTimestampMs(token.created_at));

      const searchPromise = needsSearch
        ? fetch(`${process.env.NEXT_PUBLIC_GO_SERVICE_URL}/v1/search?phrase=${encodeURIComponent(token.mint)}&limit=1`)
            .then(r => r.ok ? r.json() : null).catch(() => null)
        : Promise.resolve(null);

      const cachedCreator = creatorAddressCache.get(token.mint);
      const devPromise = cachedCreator !== undefined
        ? Promise.resolve(cachedCreator)
        : fetch(`${process.env.NEXT_PUBLIC_GO_SERVICE_URL}/v1/tokens/dev?tokenAddress=${token.mint}&limit=1`)
            .then(r => r.ok ? r.json() : null)
            .then(data => data?.filterTokens?.results?.[0]?.token?.creatorAddress || null)
            .catch(() => null);

      const [searchData, devResult] = await Promise.all([searchPromise, devPromise]);
      if (cancelled) return;

      if (searchData?.tokens?.[0]) {
        const fetchedToken = searchData.tokens[0];
        console.log("[TradePage] correctTokenData from /v1/search:", {
          created_at: fetchedToken.created_at,
          createdAt: fetchedToken.createdAt,
          launch_time: fetchedToken.launch_time,
          name: fetchedToken.name || fetchedToken.symbol,
        });
        setCorrectTokenData(fetchedToken);
      }
      if (typeof devResult === 'string') {
        setCreatorAddress(devResult);
        creatorAddressCache.set(token.mint, devResult);
      }
    };

    setIsLoadingCorrectData(true);
    fetchParallel().finally(() => { if (!cancelled) setIsLoadingCorrectData(false); });
    return () => { cancelled = true; };
  }, [token?.mint, token?.created_at, correctTokenData?.mint]);

  const getOHLCParams = useComponentCache(
    "ohlc-params",
    [correctTokenData, token, isLoadingCorrectData],
    () => {
      // Always use 1s interval for Solana - provides best real-time experience
      // Timeframe can vary based on token age for historical data depth
      const tokenForAge = correctTokenData || token;
      const createdAt =
        (tokenForAge as any)?.created_at || (tokenForAge as any)?.createdAt || (tokenForAge as any)?.CreatedAt;

      if (!createdAt) return { interval: "1s" as const, timeframe: "30d" as const, optimize: false };

      let timestamp = createdAt as any;
      if (typeof createdAt === "number" && createdAt < 10000000000) timestamp = createdAt * 1000;

      const createdDate = new Date(timestamp);
      const diffMs = Date.now() - createdDate.getTime();
      const ageInHours = diffMs / (1000 * 60 * 60);
      const ageInDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      // Always 1s interval, but adjust timeframe based on token age
      if (ageInHours < 1) return { interval: "1s", timeframe: "1h", optimize: false } as const;
      if (ageInHours < 6) return { interval: "1s", timeframe: "4h", optimize: false } as const;
      if (ageInDays < 1) return { interval: "1s", timeframe: "24h", optimize: false } as const;
      if (ageInDays < 7) return { interval: "1s", timeframe: "7d", optimize: false } as const;
      if (ageInDays < 30) return { interval: "1s", timeframe: "30d", optimize: false } as const;
      return { interval: "1s", timeframe: "30d", optimize: false } as const;
    }
  );

  const ohlcParams = getOHLCParams;
  const defaultOHLCParams = { interval: "1s" as const, timeframe: "30d" as const, optimize: false };

  const currentOHLCParams = React.useMemo(
    () => ohlcParams || defaultOHLCParams,
    [ohlcParams?.interval, ohlcParams?.timeframe, ohlcParams?.optimize]
  );

  const canStartOHLC = preloadComplete || (typeof resolvedPairAddress === "string" && resolvedPairAddress.length >= 32);

  // ---------------- drag-to-resize for left column ----------------
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  // Minimum chart height (including header) - chart should never shrink below this
  const MIN_CHART_HEIGHT = 350; 
  const DEFAULT_CHART_HEIGHT_RATIO = 0.65;
  const SSR_DEFAULT_CHART_HEIGHT = 900;
  
  // Calculate responsive min/max based on viewport
  const getResponsiveLimits = useCallback(() => {
    if (typeof window === "undefined") return { min: MIN_CHART_HEIGHT, max: 800 };
    const vh = window.innerHeight;
    const MIN_TOP = Math.max(MIN_CHART_HEIGHT, vh * 0.3); // At least min chart height or 30% of viewport
    const MIN_BOTTOM = 180;
    const MAX_TOP = Math.min(vh * 0.85, vh - MIN_BOTTOM); // Max 85% of viewport or viewport minus bottom
    return { min: MIN_TOP, max: MAX_TOP };
  }, []);
  
  const clampTop = useCallback((desired: number) => {
    const limits = getResponsiveLimits();
    // Ensure minimum is always respected
    const enforcedMin = Math.max(MIN_CHART_HEIGHT, limits.min);
    // Use viewport height to calculate max, not container height (which changes during drag)
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    // Max should be viewport height minus minimum bottom pane space (180px)
    // Account for header/other UI elements by subtracting a bit more
    const maxTop = Math.min(vh - 180, limits.max);
    // Clamp the desired value between min and max - allow movement in both directions
    const clamped = Math.max(enforcedMin, Math.min(desired, maxTop));
    return clamped;
  }, [getResponsiveLimits]);
  
  // Initialize with responsive default based on viewport
  const [topPanePx, setTopPanePx] = useState<number>(() => {
    if (typeof window === "undefined") return Math.max(MIN_CHART_HEIGHT, SSR_DEFAULT_CHART_HEIGHT);

    const limits = getResponsiveLimits();
    const proposed = Math.max(limits.min, Math.min(window.innerHeight * DEFAULT_CHART_HEIGHT_RATIO, limits.max));

    // Try to use saved value, but coerce it to at least the proposed default
    const saved = Number(localStorage.getItem("tradeSplitTopPx"));
    if (Number.isFinite(saved) && saved > 0 && saved >= limits.min && saved <= limits.max) {
      return Math.max(saved, proposed);
    }

    return proposed;
  });
  
  const [isResizing, setIsResizing] = useState(false);
  const topPanePxRef = useRef(topPanePx);
  
  // Keep ref in sync with state
  useEffect(() => {
    topPanePxRef.current = topPanePx;
  }, [topPanePx]);
  
  useEffect(() => { 
    localStorage.setItem("tradeSplitTopPx", String(topPanePx)); 
  }, [topPanePx]);
  
  // Handle window resize to adjust top pane if needed
  useEffect(() => {
    const handleResize = () => {
      const limits = getResponsiveLimits();
      // If current height is outside new limits, adjust it
      if (topPanePx < limits.min) {
        setTopPanePx(limits.min);
      } else if (topPanePx > limits.max) {
        setTopPanePx(limits.max);
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [topPanePx, getResponsiveLimits]);

  useEffect(() => {
    setTokenDataLoading(pollingLoading);
    setTradesDataLoading(initialDataLoading);
  }, [pollingLoading, initialDataLoading]);

  useEffect(() => {
    if (showMobileTradeModal) document.body.classList.add("modal-open");
    else document.body.classList.remove("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, [showMobileTradeModal]);

  const closeModal = useCallback(() => {
    setIsClosingModal(true);
    setTimeout(() => {
      setShowMobileTradeModal(false);
      setIsClosingModal(false);
    }, 300);
  }, []);

  const handleDragStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    (dragStartY as any).current = clientY;
    (isDragging as any).current = true;
    (modalTransform as any).current = 0;
  }, []);
  const handleDragMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!(isDragging as any).current) return;
    e.preventDefault();
    e.stopPropagation();
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    (dragCurrentY as any).current = clientY;
    const deltaY = (dragCurrentY as any).current - (dragStartY as any).current;
    if (deltaY > 0) {
      (modalTransform as any).current = deltaY;
      if ((modalDragRef as any).current) {
        (modalDragRef as any).current.style.transform = `translateY(${deltaY}px)`;
        (modalDragRef as any).current.style.opacity = String(Math.max(0.7, 1 - deltaY / 300));
      }
    }
  }, []);
  const handleDragEnd = useCallback(() => {
    if (!(isDragging as any).current) return;
    (isDragging as any).current = false;
    const threshold = 100;
    if ((modalTransform as any).current > threshold) {
      closeModal();
    } else if ((modalDragRef as any).current) {
      (modalDragRef as any).current.style.transition = "transform 0.2s ease-out, opacity 0.2s ease-out";
      (modalDragRef as any).current.style.transform = "translateY(0px)";
      (modalDragRef as any).current.style.opacity = "1";
      setTimeout(() => {
        if ((modalDragRef as any).current) (modalDragRef as any).current.style.transition = "";
      }, 200);
    }
    (modalTransform as any).current = 0;
  }, [closeModal]);
  useEffect(() => {
    if (!showMobileTradeModal) return;
    const mm = (e: MouseEvent) => (isDragging as any).current && handleDragMove(e as any);
    const mu = () => (isDragging as any).current && handleDragEnd();
    const tm = (e: TouchEvent) => (isDragging as any).current && handleDragMove(e as any);
    const tu = () => (isDragging as any).current && handleDragEnd();
    document.addEventListener("mousemove", mm, { passive: false });
    document.addEventListener("mouseup", mu, { passive: false });
    document.addEventListener("touchmove", tm, { passive: false });
    document.addEventListener("touchend", tu, { passive: false });
    return () => {
      document.removeEventListener("mousemove", mm);
      document.removeEventListener("mouseup", mu);
      document.removeEventListener("touchmove", tm);
      document.removeEventListener("touchend", tu);
    };
  }, [showMobileTradeModal, handleDragMove, handleDragEnd]);

  // IMPORTANT: Only use cached/fallback data if it matches the current URL id
  // This prevents showing stale data from a previous token when navigating

  const displayToken = React.useMemo(() => {
    // Start with optimistic data from URL query params (instant display)
    // This ensures liquidity, age, image from PulseTable are shown immediately
    const baseOptimistic = optimisticToken || {};

    // First priority: fresh token data from polling - but ONLY if it matches current id
    // MERGE with optimistic data so we don't lose query param values
    if (token) {
      // IMPORTANT: If token has verified_pair_address flag, trust it even if pair_address
      // doesn't match URL id. This happens when we correct a wrong pair address via
      // the get-pair API verification.
      const tokenMatchesId =
        token.verified_pair_address === true ||
        token.pair_address === idString ||
        token.mint === idString;
      if (tokenMatchesId) {
        // CRITICAL: Additional validation - if we have optimistic mint from URL, ensure token mint matches
        // This prevents showing wrong token data when the backend returns data for a different token
        const optimisticMint = (baseOptimistic as any).mint || (baseOptimistic as any)._mint;
        if (optimisticMint && token.mint && token.mint !== optimisticMint) {
          console.warn('[TradePage] Token mint mismatch! Rejecting backend data.', {
            tokenMint: token.mint,
            optimisticMint,
            tokenName: token.name,
            optimisticName: (baseOptimistic as any).name,
            idString,
          });
          // Return optimistic data only to prevent showing wrong token
          return optimisticToken;
        }

        // Normalize timestamps from all sources to ensure consistent format
        // This handles cases where backend returns seconds vs ms, or string vs number
        const normalizedTokenCreatedAt = normalizeTimestampToISO(token.created_at);
        const normalizedTokenLaunchTime = normalizeTimestampToISO(token.launch_time);
        const normalizedOptimisticCreatedAt = normalizeTimestampToISO((baseOptimistic as any).created_at);
        const normalizedOptimisticLaunchTime = normalizeTimestampToISO((baseOptimistic as any).launch_time);

        // Debug: Log created_at values to trace the overwrite issue
        if (process.env.NODE_ENV === "development") {
          console.log("[TradePage] displayToken merge - created_at sources:", {
            "token.created_at (raw)": token.created_at,
            "token.created_at (normalized)": normalizedTokenCreatedAt,
            "token.launch_time (raw)": token.launch_time,
            "token.launch_time (normalized)": normalizedTokenLaunchTime,
            "optimistic.created_at (raw)": (baseOptimistic as any).created_at,
            "optimistic.created_at (normalized)": normalizedOptimisticCreatedAt,
            tokenName: token.name || token.symbol,
            tokenMint: token.mint,
          });
        }
        // Merge: token data takes priority, but fill gaps with optimistic data
        // Use normalized timestamps to ensure consistent parsing
        return {
          ...baseOptimistic,
          ...token,
          // Ensure these fields use token data when available, fallback to optimistic
          liquidity_usd: token.liquidity_usd ?? token.total_liquidity_usd ?? (baseOptimistic as any).liquidity_usd,
          total_liquidity_usd: token.total_liquidity_usd ?? token.liquidity_usd ?? (baseOptimistic as any).liquidity_usd,
          created_at: normalizedTokenCreatedAt ?? normalizedOptimisticCreatedAt,
          launch_time: normalizedTokenLaunchTime ?? normalizedOptimisticLaunchTime,
          image: token.image ?? token.image_url ?? token.logo ?? (baseOptimistic as any).image,
        };
      }
      // Token doesn't match current id - it's stale data from previous token
      console.log('[TradePage] token does not match current id, skipping stale data', {
        tokenMint: token.mint,
        tokenPairAddress: token.pair_address,
        idString
      });
    }

    // Second priority: cached metadata - but ONLY if it matches current id
    // MERGE with optimistic data
    if (cachedTokenMetadata) {
      const cacheMatchesId =
        cachedTokenMetadata.pair_address === idString ||
        cachedTokenMetadata.mint === idString;
      if (cacheMatchesId) {
        // Normalize timestamps from cache and optimistic sources
        const normalizedCacheCreatedAt = normalizeTimestampToISO(cachedTokenMetadata.created_at);
        const normalizedOptCreatedAt = normalizeTimestampToISO((baseOptimistic as any).created_at);
        return {
          ...baseOptimistic,
          ...cachedTokenMetadata,
          mint: cachedTokenMetadata.mint || "",
          pair_address: cachedTokenMetadata.pair_address || "",
          created_at: normalizedCacheCreatedAt || normalizedOptCreatedAt || null,
          liquidity_usd: (cachedTokenMetadata as any).liquidity_usd ?? (baseOptimistic as any).liquidity_usd,
        };
      }
    }

    // Third priority: optimistic data from URL query params alone
    if (optimisticToken) return optimisticToken;

    // During hydration, router.query is empty - don't return null yet as query params are coming
    // This prevents the flash of "-" and "0" values before hydration completes
    if (!isRouterReady) {
      return undefined; // Signal that we're still loading, not that there's no data
    }

    // No valid data - return null to show loading state
    return null;
  }, [token, cachedTokenMetadata, optimisticToken, idString, isRouterReady]);

  // Validate correctTokenData matches current id to prevent showing stale data
  const validatedCorrectTokenData = React.useMemo(() => {
    if (!correctTokenData) return null;

    // Check if correctTokenData matches the current URL id
    const matchesId =
      correctTokenData.pair_address === idString ||
      correctTokenData.mint === idString ||
      correctTokenData.address === idString;

    if (matchesId) {
      return correctTokenData;
    }

    // If it doesn't match, return null to prevent showing stale data
    console.log('[TradePage] correctTokenData does not match current id, skipping', {
      correctTokenData: correctTokenData.mint || correctTokenData.pair_address,
      idString
    });
    return null;
  }, [correctTokenData, idString]);

  // Use validated displayToken for title to prevent showing stale token name
  const tokenNameForTitle =
    (typeof displayToken?.symbol === "string" && displayToken.symbol.trim()) ||
    (typeof displayToken?.name === "string" && displayToken.name.trim()) ||
    (typeof id === "string" && id.trim()) ||
    "";


  // URL structure: /trade/{mint}?_name=...&_symbol=...
  // id IS the mint address now (not pair_address), allowing immediate WebSocket connection
  // _mint query param kept for backward compatibility with old URLs
  const resolvedTokenMint = React.useMemo(() => {
    if (displayToken?.mint) return displayToken.mint;
    // Backward compat: Check _mint query param (old URLs had _mint in query string)
    if (typeof _mint === "string" && _mint.length > 0) return _mint;
    // New architecture: id is the mint directly
    if (typeof id === "string" && id.length > 0) return id;
    return undefined;
  }, [displayToken?.mint, _mint, id]);

  // Single WebSocket connection for entire trade page (shared via context to child components)
  // This eliminates the 5 duplicate connections that tabs were creating
  const wsData = useSolanaTokenWebSocket({
    mintAddress: displayToken?.mint || resolvedTokenMint,
    enabled: !!(displayToken?.mint || resolvedTokenMint),
  });
  // Destructure for local use in this component
  const { holderSummary, topTraders: wsTopTraders, trades: wsHistoricalTrades, tokenInfo: wsTokenInfo, volume: wsVolume } = wsData;

  // Clear trades loading spinner once WS snapshot arrives (before REST completes)
  useEffect(() => {
    if (wsHistoricalTrades && wsHistoricalTrades.length > 0) {
      setTradesDataLoading(false);
    }
  }, [wsHistoricalTrades]);

  // Throttle holderSummary and wsTopTraders updates to avoid re-rendering TradeActionPanel on every WS message
  const [throttledHolderSummary, setThrottledHolderSummary] = React.useState(holderSummary);
  const [throttledWsTopTraders, setThrottledWsTopTraders] = React.useState(wsTopTraders);
  const holderThrottleRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (!holderThrottleRef.current) {
      setThrottledHolderSummary(holderSummary);
      setThrottledWsTopTraders(wsTopTraders);
      holderThrottleRef.current = setTimeout(() => {
        holderThrottleRef.current = null;
      }, 5000);
    }
  }, [holderSummary, wsTopTraders]);

  // Enhance displayToken with holderSummary data for TradeActionPanel
  const enhancedDisplayToken = React.useMemo(() => {
    if (!displayToken) return displayToken;

    // Merge holderSummary data into the token for TradeActionPanel's TokenInfoDropdown
    return {
      ...displayToken,
      // Map holder_summary fields to token fields expected by TokenInfoDropdown
      dev_wallet: throttledHolderSummary?.dev_wallet ?? displayToken.dev_wallet,
      dev_held_percentage: throttledHolderSummary?.dev_held_percent ?? displayToken.dev_held_percentage,
      sniper_held_percentage: throttledHolderSummary?.sniper_held_percent ?? displayToken.sniper_held_percentage,
      sniper_count: throttledHolderSummary?.sniper_count ?? displayToken.sniper_count,
      bundler_held_percentage: throttledHolderSummary?.bundler_held_percent ?? displayToken.bundler_held_percentage,
      bundler_count: throttledHolderSummary?.bundler_count ?? displayToken.bundler_count,
      insider_held_percentage: throttledHolderSummary?.insider_held_percent ?? displayToken.insider_held_percentage,
      insider_count: throttledHolderSummary?.insider_count ?? displayToken.insider_count,
      top10_holding_percentage: throttledHolderSummary?.top10_held_percent ?? displayToken.top10_holding_percentage,
      total_holders: throttledHolderSummary?.total_holders ?? displayToken.total_holders,
      // Pro traders = count of top traders from WebSocket
      pro_traders: throttledWsTopTraders?.length ?? displayToken.pro_traders,
    };
  }, [displayToken, throttledHolderSummary, throttledWsTopTraders]);

  // Also use dev_wallet from WebSocket holderSummary for chart dev markers
  useEffect(() => {
    if (holderSummary?.dev_wallet && !creatorAddress) {
      console.log('[TradePage] Using dev_wallet from WebSocket for chart markers:', holderSummary.dev_wallet);
      setCreatorAddress(holderSummary.dev_wallet);
    }
  }, [holderSummary?.dev_wallet, creatorAddress]);

  // Get current pair address for caching
  const currentPairAddress = React.useMemo(() => {
    const currentToken = validatedCorrectTokenData || displayToken;
    return currentToken?.pair_address || resolvedPairAddress || '';
  }, [validatedCorrectTokenData, displayToken?.pair_address, resolvedPairAddress]);

  // Callback to update trades cache when new trades arrive
  const updateTradesCache = React.useCallback((newTrades: any[]) => {
    if (currentPairAddress && newTrades.length > 0) {
      tradesCacheRef.current.set(currentPairAddress, newTrades);
    }
  }, [currentPairAddress]);

  // Get cached trades for current pair address
  const cachedTrades = React.useMemo(() => {
    if (!currentPairAddress) return undefined;
    return tradesCacheRef.current.get(currentPairAddress);
  }, [currentPairAddress]);

  // Use cached trades if available, otherwise use initial trade data
  // Priority: 1) tab-switch cache, 2) REST data, 3) WS snapshot, 4) empty
  const initialTradesForComponent = React.useMemo(() => {
    if (cachedTrades && cachedTrades.length > 0) return cachedTrades;
    if (initialTradeData?.trades && initialTradeData.trades.length > 0) return initialTradeData.trades;
    if (wsHistoricalTrades && wsHistoricalTrades.length > 0) return wsHistoricalTrades;
    return [];
  }, [cachedTrades, initialTradeData?.trades, wsHistoricalTrades]);

  // Disabled: /v1/ws/trade-events backend endpoint not implemented. Unified WS provides trade data.
  const { trades: realTimeTradesForChart } = useOptimizedTradeEventsWebSocket({
    pairAddress: displayToken?.pair_address || resolvedPairAddress || undefined,
    enabled: false,
    tokenDecimals: displayToken?.decimals || 9,
    maxTrades: 200,
    enableDeduplication: true,
  });

  // Trade data for chart dev markers — sourced from unified WebSocket only
  // (trade-events WS is disabled; unified WS provides the same data via wsHistoricalTrades)
  const tradeDataForChart = React.useMemo(() => {
    if (!wsHistoricalTrades || wsHistoricalTrades.length === 0) return [];

    const combined: any[] = [];
    const seen = new Set<string>();

    for (const trade of wsHistoricalTrades) {
      const key = trade.signature || trade.transaction_hash || `${trade.timestamp}-${trade.wallet_address}`;
      if (!seen.has(key)) {
        seen.add(key);
        // Map historical trade fields to match chart expectations
        combined.push({
          ...trade,
          maker: trade.wallet_address, // Chart looks for maker field
          side: trade.type?.toLowerCase(), // BUY/SELL -> buy/sell
          eventDisplayType: trade.type, // Keep original for fallback
        });
      }
    }

    return combined;
  }, [wsHistoricalTrades]);

  useEffect(() => {
    if (tradeDataForChart && tradeDataForChart.length > 0) {
      console.log("[TradePage] Trade data for chart:", tradeDataForChart.length, "trades (real-time + historical)");
      // Log first few trades to debug dev marker matching
      const devTrades = tradeDataForChart.filter((t: any) =>
        creatorAddress && (t.maker || t.wallet_address)?.toLowerCase() === creatorAddress.toLowerCase()
      );
      if (devTrades.length > 0) {
        console.log("[TradePage] Found dev trades for markers:", devTrades.length, devTrades);
      }
    }
    if (creatorAddress) console.log("[TradePage] Creator address for dev markers:", creatorAddress);
  }, [tradeDataForChart, creatorAddress]);

  // -------- Position Lines for Chart (avg entry/exit prices) --------
  const [positionLinesApi, setPositionLinesApi] = useState<{ avgBuyPriceUsd: number | null; avgSellPriceUsd: number | null } | null>(null);
  const [chartMetrics, setChartMetrics] = useState<{ lastPriceUsd?: number; lastMarketCapUsd?: number; maxMarketCapUsd?: number }>({});

  // Coalesced live market cap for TradeActionPanel (same priority as chart header)
  const liveMarketCapForPanel = React.useMemo(() => {
    const chart = chartMetrics.lastMarketCapUsd;
    if (typeof chart === "number" && Number.isFinite(chart) && chart > 0) return chart;
    const ws = wsTokenInfo?.market_cap_usd;
    if (typeof ws === "number" && Number.isFinite(ws) && ws > 0) return ws;
    return null;
  }, [chartMetrics.lastMarketCapUsd, wsTokenInfo?.market_cap_usd]);

  // Live browser tab title: "TOKEN ↑ $264K" with direction arrow
  const prevMcapRef = useRef<number | null>(null);

  useEffect(() => {
    const mcap = liveMarketCapForPanel ?? displayToken?.market_cap_usd ?? null;
    if (!tokenNameForTitle) return;

    if (mcap && mcap > 0) {
      const prev = prevMcapRef.current;
      const arrow = prev === null ? '' : mcap >= prev ? ' ↑' : ' ↓';
      prevMcapRef.current = mcap;
      document.title = `${tokenNameForTitle}${arrow} ${formatMarketCap(mcap)}`;
    } else {
      document.title = `${tokenNameForTitle} | Trade`;
    }

    return () => {
      document.title = 'Interstate';
    };
  }, [tokenNameForTitle, liveMarketCapForPanel, displayToken?.market_cap_usd]);

  const fetchPositionLinesRef = React.useRef<Promise<void> | null>(null);

  // Fetch avg entry/exit lines from backend (user-scoped)
  const fetchPositionLines = React.useCallback(async () => {
    if (!resolvedTokenMint || !user?.bearerToken) {
      setPositionLinesApi(null);
      return;
    }
    // Avoid overlapping fetches
    if (fetchPositionLinesRef.current) return fetchPositionLinesRef.current;

    const run = (async () => {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!baseUrl) return;
        const headers = {
          Authorization: `Bearer ${user.bearerToken}`,
          Accept: "application/json",
        };
        // Solana uses the generic position endpoint
        const resp = await fetch(
          `${baseUrl}/api/trade/position?tokenAddress=${encodeURIComponent(resolvedTokenMint)}`,
          { headers }
        );
        if (!resp.ok) {
          setPositionLinesApi(null);
          return;
        }
        const body = await resp.json();
        const data = body?.data || body;
        if (body?.success === false || !data) {
          setPositionLinesApi(null);
          return;
        }
        setPositionLinesApi({
          avgBuyPriceUsd: data.avgBuyPriceUsd ?? data.avgBuyPriceUSD ?? null,
          avgSellPriceUsd: data.avgSellPriceUsd ?? data.avgSellPriceUSD ?? null,
        });
      } catch {
        setPositionLinesApi(null);
      } finally {
        fetchPositionLinesRef.current = null;
      }
    })();

    fetchPositionLinesRef.current = run;
    return run;
  }, [resolvedTokenMint, user?.bearerToken]);

  // Initial fetch and on token change
  useEffect(() => {
    fetchPositionLines();
  }, [fetchPositionLines]);

  // Refresh lines on quick trade events for this token
  useEffect(() => {
    if (typeof window === "undefined") return;
    const normalized = resolvedTokenMint?.toLowerCase();
    if (!normalized) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ tokenAddress?: string }>).detail;
      const addr = detail?.tokenAddress?.toLowerCase();
      if (addr === normalized) {
        fetchPositionLines();
      }
    };
    window.addEventListener("solanaQuickTrade", handler as EventListener);
    return () => window.removeEventListener("solanaQuickTrade", handler as EventListener);
  }, [fetchPositionLines, resolvedTokenMint]);

  // Calculate price line values for the chart
  const priceLineValues = React.useMemo(() => {
    const sanitize = (value: any) => {
      const num = typeof value === "string" ? parseFloat(value) : value;
      return Number.isFinite(num) && num > 0 ? num : undefined;
    };
    const entry = sanitize(positionLinesApi?.avgBuyPriceUsd);
    const exit = sanitize(positionLinesApi?.avgSellPriceUsd);
    return { avgEntryPriceUsd: entry, avgExitPriceUsd: exit };
  }, [positionLinesApi?.avgBuyPriceUsd, positionLinesApi?.avgSellPriceUsd]);

  const currentMintRef = React.useRef(displayToken?.mint || resolvedTokenMint);
  useEffect(() => {
    currentMintRef.current = displayToken?.mint || resolvedTokenMint;
  }, [displayToken?.mint, resolvedTokenMint]);

  const handleChartMetrics = React.useCallback((metrics: { lastPriceUsd?: number; lastMarketCapUsd?: number; maxMarketCapUsd?: number }) => {
    // Only accept metrics from the current token's chart — reject stale callbacks from unmounting charts
    setChartMetrics(prev => {
      // If metrics are empty (reset), always accept
      if (!metrics.lastPriceUsd && !metrics.lastMarketCapUsd) return prev;
      return metrics;
    });
  }, []);

  // -------- Similar Tokens (right rail) --------
  const [similarTokens, setSimilarTokens] = useState<SimilarTokenLite[]>([]);
  const [similarLoading, setSimilarLoading] = useState<boolean>(false);
  useEffect(() => {
    let abort = false;
    async function loadSimilar() {
      if (!displayToken?.mint) { setSimilarTokens([]); return; }
      setSimilarLoading(true);
      try {
        const res = await fetch(`/api/token-service/similar?mint=${displayToken.mint}&limit=12`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const mapped: SimilarTokenLite[] = (data?.tokens || []).map((t: any, i: number) => ({
          id: t.id || t.mint || String(i),
          name: t.name || t.symbol || "Unknown",
          symbol: t.symbol,
          logoUrl: t.image || t.logoUrl,
          lastTxAt: t.last_tx_unix ?? t.lastTxAt ?? undefined,
          tokenAgeSec: t.age_sec ?? t.tokenAgeSec ?? undefined,
          marketCapUsd: t.market_cap_usd ?? t.marketCapUsd ?? undefined,
          verified: !!t.verified,
        }));
        if (!abort) setSimilarTokens(mapped);
      } catch {
        if (!abort) setSimilarTokens([]);
      } finally {
        if (!abort) setSimilarLoading(false);
      }
    }
    // Defer right-panel fetch until after chart + critical content renders
    const id = typeof requestIdleCallback !== 'undefined'
      ? requestIdleCallback(() => { if (!abort) loadSimilar(); })
      : setTimeout(() => { if (!abort) loadSimilar(); }, 2000);
    return () => {
      abort = true;
      if (typeof cancelIdleCallback !== 'undefined' && typeof id === 'number') cancelIdleCallback(id);
      else clearTimeout(id as unknown as NodeJS.Timeout);
    };
  }, [displayToken?.mint]);

  // Right Panel Visibility Toggle
  const [isRightPanelVisible, setIsRightPanelVisible] = useState<boolean>(true);

  // -------- Reused Image Tokens (right rail) --------
  const [reusedTokens, setReusedTokens] = useState<ReusedTokenLite[]>([]);
  const [reusedLoading, setReusedLoading] = useState<boolean>(false);
  useEffect(() => {
    let abort = false;
    async function loadReused() {
      if (!displayToken?.mint) { setReusedTokens([]); return; }
      setReusedLoading(true);
      try {
        const res = await fetch(`/api/token-service/reused-image-tokens?mint=${displayToken.mint}&limit=12`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const mapped: ReusedTokenLite[] = (data?.tokens || []).map((t: any, i: number) => ({
          id: t.id || t.mint || String(i),
          name: t.name || t.symbol || "Unknown",
          symbol: t.symbol,
          logoUrl: t.image || t.logoUrl,
          lastTxAt: t.last_tx_unix ?? t.lastTxAt ?? undefined,
          tokenAgeSec: t.age_sec ?? t.tokenAgeSec ?? undefined,
          marketCapUsd: t.market_cap_usd ?? t.marketCapUsd ?? undefined,
          verified: !!t.verified,
        }));
        if (!abort) setReusedTokens(mapped);
      } catch {
        if (!abort) setReusedTokens([]);
      } finally {
        if (!abort) setReusedLoading(false);
      }
    }
    // Defer right-panel fetch until after chart + critical content renders
    const id = typeof requestIdleCallback !== 'undefined'
      ? requestIdleCallback(() => { if (!abort) loadReused(); })
      : setTimeout(() => { if (!abort) loadReused(); }, 2000);
    return () => {
      abort = true;
      if (typeof cancelIdleCallback !== 'undefined' && typeof id === 'number') cancelIdleCallback(id);
      else clearTimeout(id as unknown as NodeJS.Timeout);
    };
  }, [displayToken?.mint]);

  return (
    <>
      <div
        className="min-h-screen w-full flex flex-col overflow-y-auto"
        style={{
          backgroundColor: "#111214",
          color: AX.text,
          fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Inter\", system-ui, sans-serif",
        }}
      >
        {/* Top global header */}
        <Header search={search} setSearch={setSearch} />

        {/* Hydrating status hidden from users - data loads silently in background */}

        {/* Provider for shared WebSocket connection - eliminates duplicate connections from tabs */}
        <SolanaTokenWebSocketProvider value={wsData}>
        <div
          className="flex flex-1 w-full max-w-full min-h-0"
          style={{
            minHeight: 'calc(100vh - 60px)', // Ensure content fills at least viewport minus header
            flex: '1 1 auto',
          }}
        >
          {/* LEFT: chart + tables */}
          <div
            ref={containerRef}
            className="flex-1 min-w-0 max-w-full flex flex-col pb-0"
            style={{
              borderRight: `1px solid ${AX.border}`,
              minHeight: 0,
            }}
          >
            {/* TOP pane - Chart in top left */}
            <div 
              className="flex-shrink-0 flex flex-col" 
              style={{ 
                height: topPanePx,
                minHeight: `${MIN_CHART_HEIGHT}px`,
                transition: isResizing ? 'none' : 'height 0.2s ease-out',
                willChange: isResizing ? 'height' : 'auto',
              }}
            >
              <div className="pl-2 flex-shrink-0">
                <TradeHeader 
                  token={validatedCorrectTokenData || displayToken} 
                  wsTokenInfo={wsTokenInfo} 
                  wsVolume={wsVolume} 
                  holderSummary={holderSummary} 
                  livePriceUsd={chartMetrics.lastPriceUsd} 
                  liveMarketCapUsd={chartMetrics.lastMarketCapUsd}
                  onToggleRightPanel={() => setIsRightPanelVisible(!isRightPanelVisible)}
                  isRightPanelVisible={isRightPanelVisible}
                />
              </div>

              {/* Separator line after TradeHeader */}
              <div className="px-3 border-b border-[#2A2B33]" style={{ marginTop: '2px' }} />

              <div 
                id="chart-container-wrapper"
                className="flex-1 min-h-[240px] relative chart-wrapper w-full overflow-hidden" 
                style={{ 
                  height: '100%',
                  width: '100%',
                  position: 'relative',
                  minHeight: 0,
                  minWidth: 0,
                }}
              >
                {(canStartOHLC || (idString.length >= 32)) && isRouterReady ? (
                  <AdvancedOHLCChart
                    key={`chart-${displayToken?.mint || idString}`}
                    mint={typeof _mint === "string" ? _mint : (displayToken?.mint || undefined)}
                    pairAddress={resolvedPairAddress || idString || undefined}
                    interval={currentOHLCParams.interval}
                    timeframe={currentOHLCParams.timeframe}
                    optimize={currentOHLCParams.optimize}
                    height="100%"
                    width="100%"
                    baseRefreshMs={10000}
                    className="relative"
                    tradeData={tradeDataForChart}
                    creatorAddress={creatorAddress}
                    userWalletAddress={primaryWalletAddresses?.solana || user?.publicKey || null}
                    tokenSymbol={displayToken?.symbol || null}
                    tokenName={displayToken?.name || null}
                    tokenDecimals={typeof displayToken?.decimals === 'number' ? displayToken.decimals : null}
                    network={network}
                    priceLines={priceLineValues}
                    onChartMetrics={handleChartMetrics}
                    preloadedData={backgroundOHLCData || undefined}
                  />
                  // <BackendOHLCChart
                  //   key={`chart-${resolvedPairAddress || _mint}`}
                  //   mint={typeof _mint === "string" ? _mint : undefined}
                  //   pairAddress={resolvedPairAddress}
                  //   interval={currentOHLCParams.interval}
                  //   timeframe={currentOHLCParams.timeframe}
                  //   optimize={currentOHLCParams.optimize}
                  //   height="100%"
                  //   width="100%"
                  //   baseRefreshMs={10000}
                  //   className="relative"
                  //   tradeData={tradeDataForChart}
                  //   creatorAddress={creatorAddress}
                  // />
                ) : null}
              </div>
            </div>

            {/* Resizer with visible drag handle - thin but visible */}
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize chart and trades panels"
              tabIndex={0}
              onPointerDown={(e) => {
                // Only start drag on primary button (left click) for mouse, or any touch
                if (e.pointerType === 'mouse' && e.button !== 0) {
                  return; // Reject non-left mouse clicks
                }
                
                e.preventDefault();
                e.stopPropagation();
                
                const startY = e.clientY;
                const startTop = topPanePxRef.current;
                
                // Capture pointer to ensure we get events even when cursor moves outside element
                (e.target as Element).setPointerCapture(e.pointerId);
                
                setIsResizing(true);
                document.body.style.cursor = "row-resize";
                document.body.style.userSelect = "none";
                
                const onMove = (ev: PointerEvent) => {
                  ev.preventDefault();
                  
                  const currentY = ev.clientY;
                  const delta = currentY - startY;
                  const newHeight = clampTop(startTop + delta);
                  
                  setTopPanePx(newHeight);
                  topPanePxRef.current = newHeight;
                };
                
                const onUp = (ev: PointerEvent) => {
                  // Release pointer capture
                  (e.target as Element).releasePointerCapture(e.pointerId);
                  
                  setIsResizing(false);
                  document.body.style.cursor = "";
                  document.body.style.userSelect = "";
                  
                  // Remove event listeners from the separator element, not window
                  (e.target as Element).removeEventListener("pointermove", onMove);
                  (e.target as Element).removeEventListener("pointerup", onUp);
                  (e.target as Element).removeEventListener("pointercancel", onUp);
                };
                
                // Add event listeners to the separator element, not window
                (e.target as Element).addEventListener("pointermove", onMove, { passive: false });
                (e.target as Element).addEventListener("pointerup", onUp, { passive: false });
                (e.target as Element).addEventListener("pointercancel", onUp, { passive: false });
              }}
              className="relative h-3 cursor-row-resize select-none touch-none flex-shrink-0 flex items-center justify-center hover:bg-gray-800/20 transition-colors"
              style={{ touchAction: "none", zIndex: 10, pointerEvents: "auto" }}
            >
              {/* Visual separator line - behind dots */}
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-gray-700/30" />
              {/* Visible dots handle */}
              <div className="relative z-10 flex items-center gap-1">
                <div className="w-1 h-1 rounded-full bg-[#757e80]" />
                <div className="w-1 h-1 rounded-full bg-[#757e80]" />
                <div className="w-1 h-1 rounded-full bg-[#757e80]" />
              </div>
            </div>

            {/* BOTTOM pane (tabs + tables) - min-h-[500px] ensures scrollable content */}
            <div id="tabs-pane" className="flex-1 flex flex-col min-h-[500px]">
              <div className="flex-shrink-0">
                <TradeTabs
                  selectedTab={selectedTab}
                  setSelectedTab={setSelectedTab}
                  onInstantTradeClick={() => setIsInstantTradeOpen(true)}
                  isInstantTradeOpen={isInstantTradeOpen}
                  devTokensCount={devTokensCount}
                  holdersCount={holdersCount}
                />
              </div>
              <div className="flex-1 min-h-[400px]">
                <div className={`flex flex-col h-full ${selectedTab === "Trades" ? "" : "hidden"}`}>
                  <CodexTrades
                    token={validatedCorrectTokenData || displayToken}
                    initialTrades={initialTradesForComponent}
                    onTradesUpdate={updateTradesCache}
                    pairAddress={resolvedPairAddress}
                    chain="sol"
                  />
                </div>
                <div className={`flex flex-col h-full ${selectedTab === "Orders" ? "" : "hidden"}`}>
                  <TokenLimitOrders
                    liveMarketCapUsd={liveMarketCapForPanel}
                    currentTokenAddress={resolvedTokenMint}
                  />
                </div>
                <div className={`flex flex-col h-full ${selectedTab === "Top Traders" ? "" : "hidden"}`}>
                  <React.Suspense fallback={<div className="flex items-center justify-center h-full text-neutral-400">Loading...</div>}>
                    <CodexTopTraders token={displayToken} pairAddress={idString || resolvedPairAddress} chain="sol" />
                  </React.Suspense>
                </div>
                <div className={`flex flex-col h-full ${selectedTab === "Holders" ? "" : "hidden"}`}>
                  <React.Suspense fallback={<div className="flex items-center justify-center h-full text-neutral-400">Loading...</div>}>
                    <CodexHolders token={displayToken} pairAddress={idString || resolvedPairAddress} chain="sol" onTotalCountChange={setHoldersCount} />
                  </React.Suspense>
                </div>
                <div className={`flex flex-col h-full ${selectedTab === "Dev Tokens" ? "" : "hidden"}`}>
                  <React.Suspense fallback={<div className="flex items-center justify-center h-full text-neutral-400">Loading...</div>}>
                    <CodexDevTokens token={displayToken} chain="sol" onTotalCountChange={setDevTokensCount} />
                  </React.Suspense>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: action panel + reused image + similar tokens */}
          {isRightPanelVisible && (
            <div className="flex-shrink-0 min-w-[260px] basis-[280px] md:basis-[310px] lg:basis-[330px] hidden lg:flex flex-col pb-12">

              {/* Token Info / actions */}
              <div className="right-rail-panel token-info-panel">
                <TradeActionPanel
                  token={enhancedDisplayToken}
                  tradeParams={tradeParams}
                  setTradeParams={setTradeParams}
                  quickBuySettings={quickBuySettings}
                  quickBuySide={quickBuySide}
                  initialStats={initialTradeData?.stats}
                  wsVolume={wsVolume}
                  liveMarketCapUsd={liveMarketCapForPanel}
                  liveLiquidityUsd={wsTokenInfo?.liquidity_usd}
                />
              </div>

              {/* Reused Image Tokens — flush against Token Info */}
              <div className="right-rail-panel hug-previous">
                <ReusedImageTokensPanel
                  tokens={reusedTokens}
                  loading={reusedLoading}
                  maxHeight={360}
                  className="mx-2"
                  title="Reused Image Tokens (O)"
                />
              </div>

              {/* Similar Tokens — keep a small gap below reused panel */}
              <div className="right-rail-panel spaced-above">
                <SimilarTokensPanel
                  tokens={similarTokens}
                  loading={similarLoading}
                  maxHeight={360}
                  title="Similar Tokens"
                  className="mx-2"
                />
              </div>
            </div>
          )}

          {/* Trade button for mobile */}
          <div className="fixed bottom-0 left-0 w-full p-4 z-50 lg:hidden mb-10">
            <button className="w-full bg-emerald-500 text-white p-2 rounded-lg cursor-pointer"
                    onClick={() => setShowMobileTradeModal(true)}>
              Trade
            </button>
          </div>
        </div>
        </SolanaTokenWebSocketProvider>
      </div>

      {/* Mobile Trade Modal */}
      {showMobileTradeModal && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <div className={`absolute inset-0 bg-black/70 bg-opacity-50 transition-opacity duration-300 ${isClosingModal ? "opacity-0" : "opacity-100"}`} onClick={closeModal}/>
          <div ref={modalDragRef}
               className={`absolute bottom-0 left-0 right-0 bg-[#111214] rounded-t-xl shadow-2xl max-h-[85vh] flex flex-col ${isClosingModal ? "mobile-trade-modal-closing" : "mobile-trade-modal"}`}
               style={{ touchAction: "none" }}>
            <div className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing select-none"
                 onTouchStart={handleDragStart} onTouchMove={handleDragMove} onTouchEnd={handleDragEnd}
                 onMouseDown={handleDragStart} style={{ touchAction: "none" }}>
              <div className="w-12 h-1 bg-[#2A2B33] rounded-full" />
            </div>
            <div className="flex justify-end pr-4 pb-2">
              <button onClick={closeModal} className="w-8 h-8 rounded-full bg-[#2A2B33] flex items-center justify-center text-[#9CA3AF] hover:bg-[#1E1F26] transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <TradeActionPanel
                token={enhancedDisplayToken}
                tradeParams={tradeParams}
                setTradeParams={setTradeParams}
                quickBuySettings={quickBuySettings}
                quickBuySide={quickBuySide}
                wsVolume={wsVolume}
                liveMarketCapUsd={liveMarketCapForPanel}
                liveLiquidityUsd={wsTokenInfo?.liquidity_usd}
              />
            </div>
          </div>
        </div>
      )}

      <Footer />

      {/* Global tight spacing & chart styles */}
      <style jsx global>{`
        .lightweight-chart-container, .ohlc-chart-container, .tv-lightweight-charts { width:100% !important; height:100% !important; }
        .tv-lightweight-charts .pane { overflow: visible !important; }
        .tv-lightweight-charts canvas { image-rendering: pixelated; image-rendering: -moz-crisp-edges; image-rendering: crisp-edges; }
        .chart-wrapper { 
          display:flex; 
          flex-direction:column; 
          position:relative; 
          max-width:100%; 
          width: 100%;
          height: 100%;
          min-height: 240px;
        }
        .chart-wrapper > * { 
          max-width:100%; 
          width: 100%;
          height: 100%;
          flex: 1;
          min-height: 0;
        }
        [role="separator"] { pointer-events:auto; position:relative; }
        [role="separator"]:hover { opacity:1; }
        #tabs-pane { margin-top:0 !important; padding-top:0 !important; }
        #tabs-pane > * { margin-top:0 !important; padding-top:0 !important; }
        #tabs-pane > div:first-of-type, #tabs-pane [class*="tabs"]:first-of-type, #tabs-pane [class*="Tab"]:first-of-type {
          margin-top:0 !important; padding-top:0 !important;
        }
        .chart-wrapper, .chart-wrapper > * { margin-bottom:0 !important; padding-bottom:0 !important; }

        /* ---------- RIGHT RAIL STACKING ---------- */
        /* No default gap between any stacked panels */
        .right-rail-panel { margin: 0; }
        .right-rail-panel + .right-rail-panel { margin-top: 0; }

        /* Ensure Token Info contributes no trailing space */
        .token-info-panel > *:last-child { margin-bottom: 0 !important; padding-bottom: 0 !important; }

        /* Pull the next card up by 1px so borders meet perfectly */
        .hug-previous { margin-top: -1px !important; }

        /* Only add breathing room before Similar Tokens */
        .spaced-above { margin-top: 8px !important; }

        .mobile-trade-modal { animation: slideUp 0.3s ease-out; transition: transform 0.3s ease-out; }
        .mobile-trade-modal-closing { animation: slideDown 0.3s ease-in; }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slideDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
        body.modal-open { overflow: hidden; }
      `}</style>

      {/* Instant Trade Modal */}
      <InstantTradeModal
        isOpen={isInstantTradeOpen}
        onClose={() => setIsInstantTradeOpen(false)}
        token={validatedCorrectTokenData || displayToken}
        liveLiquidityUsd={wsTokenInfo?.liquidity_usd}
      />
    </>
  );
}
