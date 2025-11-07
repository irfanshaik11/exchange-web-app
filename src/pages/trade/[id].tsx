import { useRouter } from "next/router";
import React, { useEffect, useState, useCallback, useRef } from "react";
import Head from "next/head";
import { useWallet } from "../../components/useWallet";
import { useUser } from "../../components/UserContext";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import TradeHeader from "../../components/trade/TradeHeader";
import CustomSolanaChart from "../../components/CustomSolanaChart";

import TradeActionPanel from "../../components/trade/TradeActionPanel";
import TradeTabs from "../../components/trade/TradeTabs";
import useSingleTokenPolling from "../../hooks/useSingleTokenPolling";
import useInitialTradeData from "../../hooks/useInitialTradeData";
import useBackgroundOHLCPreload from "../../hooks/useBackgroundOHLCPreload";
import { useQuickBuyQueryParams } from "../../components/QuickBuy";
import { useTradePageQueryParams } from "../../utils/queryParams";
import { useComponentCache } from "../../hooks/useComponentCache";
import useOptimizedTradeEventsWebSocket from "../../hooks/useOptimizedTradeEventsWebSocket";
import dynamic from "next/dynamic";
import SimilarTokensPanel from "../../components/trade/SimilarTokensPanel";
import ReusedImageTokensPanel from "../../components/trade/ReusedImageTokensPanel";

// Lazy load heavy components to reduce initial bundle size
//const BackendOHLCChart = dynamic(() => import("../../components/BackendOHLCChart"), { ssr: false });
const AdvancedOHLCChart = dynamic(() => import("../../components/AdvancedOHLCChart"), { ssr: false });
const CodexTrades = dynamic(() => import("../../components/trade/CodexTrades"), { ssr: false });
const CodexTopTraders = dynamic(() => import("../../components/trade/CodexTopTraders"), { ssr: false });
const CodexDevTokens = dynamic(() => import("../../components/trade/CodexDevTokens"), { ssr: false });
const CodexHolders = dynamic(() => import("../../components/trade/CodexHolders"), { ssr: false });

/* ---------- AXIOM palette ---------- */
const AX = {
  bg: "#101114",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#E6E7EA",
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
  const { id, _name, _symbol, _price, _mcap, _image, _mint } = router.query;

  const { backgroundData: backgroundOHLCData, isPreloading, preloadComplete } = useBackgroundOHLCPreload();

  const optimisticToken = React.useMemo(() => {
    if (_name || _symbol) {
      return {
        name: (_name as string) || "",
        symbol: (_symbol as string) || "",
        price_usd: _price ? parseFloat(_price as string) : undefined,
        market_cap_usd: _mcap ? parseFloat(_mcap as string) : undefined,
        image: (_image as string) || undefined,
      };
    }
    return null;
  }, [_name, _symbol, _price, _mcap, _image]);

  if (process.env.NODE_ENV === "development") {
    console.log("TradePage Debug:", { id, idType: typeof id, isString: typeof id === "string", mintFromQuery: _mint, optimisticToken });
  }

  const [tokenDataLoading, setTokenDataLoading] = useState(false);
  const [tradesDataLoading, setTradesDataLoading] = useState(false);
  const { isConnected } = useWallet();
  const { user } = useUser();
  const [selectedTab, setSelectedTab] = useState("Trades");
  const [search, setSearch] = useState("");
  const [showMobileTradeModal, setShowMobileTradeModal] = useState(false);
  const [isClosingModal, setIsClosingModal] = useState(false);

  const modalDragRef = useRef<HTMLDivElement | null>(null);
  const dragStartY = useRef(0);
  const dragCurrentY = useRef(0);
  const isDragging = useRef(false);
  const modalTransform = useRef(0);

  const { settings: quickBuySettings, side: quickBuySide } = useQuickBuyQueryParams();
  const { params: tradeParams, setParams: setTradeParams, isReady: tradeParamsReady } = useTradePageQueryParams();

  const { token, isPolling, loading: pollingLoading, isHydrating, resolvedPairAddress } = useSingleTokenPolling(
    typeof id === "string" ? id : undefined
  );

  const {
    data: initialTradeData,
    loading: initialDataLoading,
    error: initialDataError,
    isFromCache,
    cacheStats,
    cleanupCache,
    cachedTokenMetadata,
  } = useInitialTradeData(resolvedPairAddress, token?.mint);

  const [correctTokenData, setCorrectTokenData] = useState<any>(null);
  const [isLoadingCorrectData, setIsLoadingCorrectData] = useState(false);

  const [creatorAddress, setCreatorAddress] = useState<string | null>(null);

  useEffect(() => {
    const fetchCorrectTokenData = async () => {
      if (!token?.mint) return;
      if (correctTokenData?.mint === token.mint || token.created_at) return;

      setIsLoadingCorrectData(true);
      try {
        const response = await fetch(`/api/token-service/search?phrase=${encodeURIComponent(token.mint)}&limit=1`);
        if (response.ok) {
          const data = await response.json();
          if (data.tokens && data.tokens.length > 0) setCorrectTokenData(data.tokens[0]);
        }
      } catch (error) {
        console.error("[Trade Page] Failed to fetch correct token data:", error);
      } finally {
        setIsLoadingCorrectData(false);
      }
    };

    fetchCorrectTokenData();
  }, [token?.mint, token?.created_at, correctTokenData?.mint]);

  useEffect(() => {
    const fetchCreatorAddress = async () => {
      if (!token?.mint) return;
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_GO_SERVICE_URL}/v1/tokens/dev?tokenAddress=${token.mint}&limit=1`
        );
        if (response.ok) {
          const data = await response.json();
          if (data?.filterTokens?.results?.[0]?.token?.creatorAddress) {
            setCreatorAddress(data.filterTokens.results[0].token.creatorAddress);
          }
        }
      } catch (error) {
        console.error("[TradePage] Failed to fetch creator address:", error);
      }
    };

    fetchCreatorAddress();
  }, [token?.mint]);

  const getOHLCParams = useComponentCache(
    "ohlc-params",
    [correctTokenData, token, isLoadingCorrectData],
    () => {
      const tokenForAge = correctTokenData || token;
      const createdAt =
        (tokenForAge as any)?.created_at || (tokenForAge as any)?.createdAt || (tokenForAge as any)?.CreatedAt;

      if (!createdAt) return { interval: "1h" as const, timeframe: "30d" as const, optimize: false };

      let timestamp = createdAt as any;
      if (typeof createdAt === "number" && createdAt < 10000000000) timestamp = createdAt * 1000;

      const createdDate = new Date(timestamp);
      const diffMs = Date.now() - createdDate.getTime();
      const ageInHours = diffMs / (1000 * 60 * 60);
      const ageInDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (ageInHours < 1) return { interval: "1m", timeframe: "1h", optimize: false } as const;
      if (ageInHours < 6) return { interval: "1h", timeframe: "4h", optimize: false } as const;
      if (ageInDays < 1) return { interval: "1h", timeframe: "24h", optimize: false } as const;
      if (ageInDays < 7) return { interval: "1h", timeframe: "7d", optimize: false } as const;
      if (ageInDays < 30) return { interval: "1h", timeframe: "30d", optimize: false } as const;
      if (ageInDays < 90) return { interval: "1d", timeframe: "90d", optimize: true } as const;
      if (ageInDays < 180) return { interval: "1d", timeframe: "180d", optimize: true } as const;
      if (ageInDays < 365) return { interval: "1d", timeframe: "365d", optimize: true } as const;
      return { interval: "7d", timeframe: "365d", optimize: true } as const;
    }
  );

  const ohlcParams = getOHLCParams;
  const defaultOHLCParams = { interval: "1h" as const, timeframe: "30d" as const, optimize: false };

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
    setTokenDataLoading(pollingLoading || isHydrating);
    setTradesDataLoading(initialDataLoading);
  }, [pollingLoading, isHydrating, initialDataLoading]);

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

  const displayToken =
    token ||
    (cachedTokenMetadata
      ? { ...cachedTokenMetadata, mint: cachedTokenMetadata.mint || "", pair_address: cachedTokenMetadata.pair_address || "", created_at: cachedTokenMetadata.created_at || null }
      : optimisticToken);

  const { trades: tradeDataForChart } = useOptimizedTradeEventsWebSocket({
    pairAddress: displayToken?.pair_address || resolvedPairAddress || undefined,
    enabled: !!displayToken?.pair_address || !!resolvedPairAddress,
    tokenDecimals: displayToken?.decimals || 9,
    maxTrades: 200,
    enableDeduplication: true,
  });
  useEffect(() => {
    if (tradeDataForChart && tradeDataForChart.length > 0) console.log("[TradePage] Trade data for chart:", tradeDataForChart.length, "trades");
    if (creatorAddress) console.log("[TradePage] Creator address:", creatorAddress);
  }, [tradeDataForChart, creatorAddress]);

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
    loadSimilar();
    return () => { abort = true; };
  }, [displayToken?.mint]);

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
    loadReused();
    return () => { abort = true; };
  }, [displayToken?.mint]);

  return (
    <>
      <Head><title>{token?.name} | Trade</title></Head>

      <div 
        className="min-h-screen w-full flex flex-col"
        style={{ 
          backgroundColor: "#0f1012", 
          color: AX.text, 
          fontFamily: "Inter, ui-sans-serif, system-ui",
        }}
      >
        {/* Top global header */}
        <Header search={search} setSearch={setSearch} />

        {isHydrating && (
          <div className="text-center text-xs px-2 py-1.5"
               style={{ color: AX.text, backgroundColor: "#2A2414", borderTop: `1px solid ${AX.border}`, borderBottom: `1px solid ${AX.border}` }}>
            Finding trading pair for this token…
          </div>
        )}

        <div 
          className="flex flex-1 w-full max-w-full overflow-hidden" 
          style={{ 
            minHeight: 0,
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
              height: '100%',
              overflow: 'hidden',
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
              <div className="px-2 flex-shrink-0">
                <TradeHeader token={correctTokenData || displayToken} />
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
                {canStartOHLC || (typeof resolvedPairAddress === "string" && resolvedPairAddress.length >= 32) ? (
                  <AdvancedOHLCChart
                    key={`chart-${resolvedPairAddress || _mint}`}
                    mint={typeof _mint === "string" ? _mint : undefined}
                    pairAddress={resolvedPairAddress}
                    interval={currentOHLCParams.interval}
                    timeframe={currentOHLCParams.timeframe}
                    optimize={currentOHLCParams.optimize}
                    height="100%"
                    width="100%"
                    baseRefreshMs={10000}
                    className="relative"
                    tradeData={tradeDataForChart}
                    creatorAddress={creatorAddress}
                    tokenSymbol={displayToken?.symbol || null}
                    tokenName={displayToken?.name || null}
                    tokenDecimals={typeof displayToken?.decimals === 'number' ? displayToken.decimals : null}
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
                ) : (
                  <div className="flex items-center justify-center h-full" style={{ color: AX.muted }}>
                    {isHydrating ? "Resolving pair address..." : "No mint or pair address available"}
                  </div>
                )}
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
              className="relative h-1.5 cursor-row-resize select-none touch-none flex-shrink-0 flex items-center justify-center hover:bg-gray-800/20 transition-colors"
              style={{ touchAction: "none", zIndex: 10, pointerEvents: "auto" }}
            >
              {/* Visible dots handle - smaller, thinner dots */}
              <div className="flex items-center gap-0.5">
                <div className="w-0.5 h-0.5 rounded-full bg-gray-500" />
                <div className="w-0.5 h-0.5 rounded-full bg-gray-500" />
                <div className="w-0.5 h-0.5 rounded-full bg-gray-500" />
              </div>
              {/* Visual separator line */}
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-gray-700/20" />
            </div>

            {/* BOTTOM pane (tabs + tables) */}
            <div id="tabs-pane" className="flex-1 min-h-[120px] flex flex-col overflow-y-auto">
              <TradeTabs selectedTab={selectedTab} setSelectedTab={setSelectedTab} />
              <div className="flex-1 min-h-0 overflow-y-auto">
                {selectedTab === "Trades" && (
                  <CodexTrades token={correctTokenData || displayToken} initialTrades={initialTradeData?.trades || []} />
                )}
                {selectedTab === "Top Traders" && (
                  <React.Suspense fallback={<div className="flex items-center justify-center h-full text-neutral-400">Loading...</div>}>
                    <CodexTopTraders token={displayToken} />
                  </React.Suspense>
                )}
                {selectedTab === "Holders" && (
                  <React.Suspense fallback={<div className="flex items-center justify-center h-full text-neutral-400">Loading...</div>}>
                    <CodexHolders token={displayToken} />
                  </React.Suspense>
                )}
                {selectedTab === "Dev Tokens" && (
                  <React.Suspense fallback={<div className="flex items-center justify-center h-full text-neutral-400">Loading...</div>}>
                    <CodexDevTokens token={displayToken} />
                  </React.Suspense>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: action panel + reused image + similar tokens */}
          <div className="flex-shrink-0 min-w-[260px] basis-[280px] md:basis-[310px] lg:basis-[330px] hidden lg:flex flex-col overflow-y-auto h-full">

            {/* Token Info / actions */}
            <div className="right-rail-panel token-info-panel">
              <TradeActionPanel
                token={displayToken}
                tradeParams={tradeParams}
                setTradeParams={setTradeParams}
                quickBuySettings={quickBuySettings}
                quickBuySide={quickBuySide}
                initialStats={initialTradeData?.stats}
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

          {/* Trade button for mobile */}
          <div className="fixed bottom-0 left-0 w-full p-4 z-50 lg:hidden mb-10">
            <button className="w-full bg-emerald-500 text-white p-2 rounded-lg cursor-pointer"
                    onClick={() => setShowMobileTradeModal(true)}>
              Trade
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Trade Modal */}
      {showMobileTradeModal && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <div className={`absolute inset-0 bg-black/70 bg-opacity-50 transition-opacity duration-300 ${isClosingModal ? "opacity-0" : "opacity-100"}`} onClick={closeModal}/>
          <div ref={modalDragRef}
               className={`absolute bottom-0 left-0 right-0 bg-[#0f1012] rounded-t-xl shadow-2xl max-h-[85vh] flex flex-col ${isClosingModal ? "mobile-trade-modal-closing" : "mobile-trade-modal"}`}
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
                token={displayToken}
                tradeParams={tradeParams}
                setTradeParams={setTradeParams}
                quickBuySettings={quickBuySettings}
                quickBuySide={quickBuySide}
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
    </>
  );
}
