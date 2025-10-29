import { useRouter } from "next/router";
import React, { useEffect, useState, useCallback, useRef } from "react";
import Head from "next/head";
import { Toaster } from "react-hot-toast";
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

// Lazy load heavy components to reduce initial bundle size
const BackendOHLCChart = dynamic(() => import("../../components/BackendOHLCChart"), { ssr: false });
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

export default function TradePage() {
  const router = useRouter();
  const { id, _name, _symbol, _price, _mcap, _image, _mint } = router.query;

  // BACKGROUND PRELOADING: Start OHLC loading as soon as route is matched (before component mounts)
  const { backgroundData: backgroundOHLCData, isPreloading, preloadComplete } = useBackgroundOHLCPreload();

  // Optimistic token data from query params for instant display
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
    console.log("TradePage Debug:", {
      id,
      idType: typeof id,
      isString: typeof id === "string",
      mintFromQuery: _mint,
      optimisticToken,
    });
  }

  // Component-level loading states for progressive loading
  const [tokenDataLoading, setTokenDataLoading] = useState(false);
  const [tradesDataLoading, setTradesDataLoading] = useState(false);
  const { isConnected } = useWallet();
  const { user } = useUser();
  const [selectedTab, setSelectedTab] = useState("Trades");
  const [search, setSearch] = useState("");
  const [showMobileTradeModal, setShowMobileTradeModal] = useState(false);
  const [isClosingModal, setIsClosingModal] = useState(false);

  // Drag functionality for mobile modal
  const modalDragRef = useRef<HTMLDivElement | null>(null);
  const dragStartY = useRef(0);
  const dragCurrentY = useRef(0);
  const isDragging = useRef(false);
  const modalTransform = useRef(0);

  // Query parameter handling for trade settings
  const { settings: quickBuySettings, side: quickBuySide } = useQuickBuyQueryParams();

  // Trade page specific parameters
  const { params: tradeParams, setParams: setTradeParams, isReady: tradeParamsReady } = useTradePageQueryParams();

  const { token, isPolling, loading: pollingLoading, isHydrating, resolvedPairAddress } = useSingleTokenPolling(
    typeof id === "string" ? id : undefined
  );

  // Optimized initial trade data loading - only load when we have resolved pair address
  const {
    data: initialTradeData,
    loading: initialDataLoading,
    error: initialDataError,
    isFromCache,
    cacheStats,
    cleanupCache,
    cachedTokenMetadata,
  } = useInitialTradeData(resolvedPairAddress, token?.mint);

  // Fetch correct token data from database (same as search modal)
  const [correctTokenData, setCorrectTokenData] = useState<any>(null);
  const [isLoadingCorrectData, setIsLoadingCorrectData] = useState(false);

  // Fetch creator address for dev buy markers
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

  // Calculate optimal OHLC interval and timeframe based on CORRECT token age (cached)
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
      if (ageInHours < 6) return { interval: "1m", timeframe: "4h", optimize: false } as const;
      if (ageInDays < 1) return { interval: "1m", timeframe: "24h", optimize: false } as const;
      if (ageInDays < 7) return { interval: "15m", timeframe: "7d", optimize: false } as const;
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
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const startTopPxRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const MIN_TOP = 280;
  const MIN_BOTTOM = 180;

  const [topPanePx, setTopPanePx] = useState<number>(() => {
    if (typeof window === "undefined") return 420;
    const v = Number(localStorage.getItem("tradeSplitTopPx"));
    return Number.isFinite(v) && v > 0 ? v : 420;
  });

  useEffect(() => {
    localStorage.setItem("tradeSplitTopPx", String(topPanePx));
  }, [topPanePx]);

  const clampTop = useCallback((desired: number) => {
    const el = containerRef.current;
    if (!el) return desired;
    const rect = el.getBoundingClientRect();
    const maxTop = Math.max(MIN_TOP, rect.height - MIN_BOTTOM);
    return Math.min(Math.max(desired, MIN_TOP), maxTop);
  }, []);

  const applyByDelta = useCallback(
    (pageY: number) => {
      const delta = pageY - startYRef.current;
      const next = clampTop(startTopPxRef.current + delta);
      setTopPanePx(next);
    },
    [clampTop]
  );

  const onPointerMove = useCallback(
    (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      ev.preventDefault();
      const pageY = ev.clientY + window.scrollY;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => applyByDelta(pageY));
    },
    [applyByDelta]
  );

  const stopDrag = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    document.body.style.cursor = "";
    (document.body.style as any).userSelect = "";
    document.documentElement.style.cursor = "";
    window.removeEventListener("pointermove", onPointerMove as any, { capture: true } as any);
    window.removeEventListener("pointerup", stopDrag as any, { capture: true } as any);
  }, [onPointerMove]);

  const startDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      draggingRef.current = true;
      startYRef.current = e.clientY + window.scrollY;
      startTopPxRef.current = topPanePx;

      document.body.style.cursor = "row-resize";
      (document.body.style as any).userSelect = "none";
      document.documentElement.style.cursor = "row-resize";

      window.addEventListener("pointermove", onPointerMove, { capture: true });
      window.addEventListener("pointerup", stopDrag as any, { capture: true });
    },
    [onPointerMove, stopDrag, topPanePx]
  );

  useEffect(() => () => (rafRef.current ? cancelAnimationFrame(rafRef.current) : undefined), []);

  // Set component-level loading states based on data availability
  useEffect(() => {
    setTokenDataLoading(pollingLoading || isHydrating);
    setTradesDataLoading(initialDataLoading);
  }, [pollingLoading, isHydrating, initialDataLoading]);

  // Prevent body scroll when mobile modal is open
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
    dragStartY.current = clientY;
    isDragging.current = true;
    modalTransform.current = 0;
  }, []);

  const handleDragMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging.current) return;
    e.preventDefault();
    e.stopPropagation();
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragCurrentY.current = clientY;
    const deltaY = dragCurrentY.current - dragStartY.current;
    if (deltaY > 0) {
      modalTransform.current = deltaY;
      if (modalDragRef.current) {
        modalDragRef.current.style.transform = `translateY(${deltaY}px)`;
        modalDragRef.current.style.opacity = String(Math.max(0.7, 1 - deltaY / 300));
      }
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const threshold = 100;
    if (modalTransform.current > threshold) {
      closeModal();
    } else if (modalDragRef.current) {
      modalDragRef.current.style.transition = "transform 0.2s ease-out, opacity 0.2s ease-out";
      modalDragRef.current.style.transform = "translateY(0px)";
      modalDragRef.current.style.opacity = "1";
      setTimeout(() => {
        if (modalDragRef.current) modalDragRef.current.style.transition = "";
      }, 200);
    }
    modalTransform.current = 0;
  }, [closeModal]);

  useEffect(() => {
    if (!showMobileTradeModal) return;
    const mm = (e: MouseEvent) => isDragging.current && handleDragMove(e as any);
    const mu = () => isDragging.current && handleDragEnd();
    const tm = (e: TouchEvent) => isDragging.current && handleDragMove(e as any);
    const tu = () => isDragging.current && handleDragEnd();
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

  // Always render the page with progressive loading - no more black screen!
  const displayToken =
    token ||
    (cachedTokenMetadata
      ? {
          ...cachedTokenMetadata,
          mint: cachedTokenMetadata.mint || "",
          pair_address: cachedTokenMetadata.pair_address || "",
          created_at: cachedTokenMetadata.created_at || null,
        }
      : optimisticToken);

  // Get trade data for dev buy markers
  const { trades: tradeDataForChart } = useOptimizedTradeEventsWebSocket({
    pairAddress: displayToken?.pair_address || resolvedPairAddress || undefined,
    enabled: !!displayToken?.pair_address || !!resolvedPairAddress,
    tokenDecimals: displayToken?.decimals || 9,
    maxTrades: 200,
    enableDeduplication: true,
  });

  useEffect(() => {
    if (tradeDataForChart && tradeDataForChart.length > 0) {
      console.log("[TradePage] Trade data for chart:", tradeDataForChart.length, "trades");
    }
    if (creatorAddress) console.log("[TradePage] Creator address:", creatorAddress);
  }, [tradeDataForChart, creatorAddress]);

  return (
    <>
      <Head>
        <title>{token?.name} | Trade</title>
      </Head>
      <Toaster position="top-right" />

      {draggingRef.current && <div className="fixed inset-0 z-[60] cursor-row-resize" />}

      <div
        className="min-h-screen w-full flex flex-col"
        style={{ backgroundColor: "#0f1012", color: AX.text, fontFamily: "Inter, ui-sans-serif, system-ui" }}
      >
        {/* Top global header */}
        <Header search={search} setSearch={setSearch} />

        {isHydrating && (
          <div
            className="text-center text-xs px-2 py-1.5"
            style={{
              color: AX.text,
              backgroundColor: "#2A2414",
              borderTop: `1px solid ${AX.border}`,
              borderBottom: `1px solid ${AX.border}`,
            }}
          >
            Finding trading pair for this token…
          </div>
        )}

        <div className="flex flex-1 w-full max-w-full overflow-hidden">
          {/* LEFT: chart + tables */}
          <div
            ref={containerRef}
            className="flex-1 min-w-0 max-w-full flex flex-col pb-0"
            style={{ borderRight: `1px solid ${AX.border}` }}
          >
            {/* TOP pane - Chart in top left */}
            <div className="flex-shrink-0 flex flex-col" style={{ height: topPanePx }}>
              {/* TradeHeader includes name + the ONLY icon cluster */}
              <div className="px-2 flex-shrink-0">
                <TradeHeader token={correctTokenData || displayToken} />
              </div>

              {/* Chart - tight bottom spacing */}
              <div className="flex-1 min-h-[240px] relative chart-wrapper w-full overflow-hidden">
                {canStartOHLC || (typeof resolvedPairAddress === "string" && resolvedPairAddress.length >= 32) ? (
                  <BackendOHLCChart
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
                  />
                ) : (
                  <div className="flex items-center justify-center h-full" style={{ color: AX.muted }}>
                    {isHydrating ? "Resolving pair address..." : "No mint or pair address available"}
                  </div>
                )}
              </div>
            </div>

            {/* Ultra-thin resizer */}
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize chart and trades panels"
              tabIndex={0}
              onPointerDown={(e) => {
                e.preventDefault();
                draggingRef.current = true;
                startYRef.current = e.clientY + window.scrollY;
                startTopPxRef.current = topPanePx;
                document.body.style.cursor = "row-resize";
                (document.body.style as any).userSelect = "none";
                document.documentElement.style.cursor = "row-resize";
                const onMove = (ev: any) => {
                  if (!draggingRef.current) return;
                  const pageY = ev.clientY + window.scrollY;
                  if (rafRef.current) cancelAnimationFrame(rafRef.current);
                  rafRef.current = requestAnimationFrame(() => {
                    const delta = pageY - startYRef.current;
                    setTopPanePx((v) => clampTop(startTopPxRef.current + delta));
                  });
                };
                const onUp = () => {
                  draggingRef.current = false;
                  document.body.style.cursor = "";
                  (document.body.style as any).userSelect = "";
                  document.documentElement.style.cursor = "";
                  window.removeEventListener("pointermove", onMove as any, { capture: true } as any);
                  window.removeEventListener("pointerup", onUp as any, { capture: true } as any);
                };
                window.addEventListener("pointermove", onMove as any, { capture: true });
                window.addEventListener("pointerup", onUp as any, { capture: true });
              }}
              className="relative h-[2px] cursor-row-resize select-none touch-none flex-shrink-0"
              style={{ touchAction: "none", zIndex: 1, background: "transparent" }}
            >
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px" style={{ background: AX.border }} />
            </div>

            {/* BOTTOM pane (tabs + tables) */}
            <div id="tabs-pane" className="flex-1 min-h-[120px] flex flex-col">
              <TradeTabs selectedTab={selectedTab} setSelectedTab={setSelectedTab} />
              <div className="flex-1 min-h-0">
                {selectedTab === "Trades" && (
                  <CodexTrades token={correctTokenData || displayToken} initialTrades={initialTradeData?.trades || []} />
                )}
                {selectedTab === "Top Traders" && (
                  <React.Suspense
                    fallback={<div className="flex items-center justify-center h-full text-neutral-400">Loading...</div>}
                  >
                    <CodexTopTraders token={displayToken} />
                  </React.Suspense>
                )}
                {selectedTab === "Holders" && (
                  <React.Suspense
                    fallback={<div className="flex items-center justify-center h-full text-neutral-400">Loading...</div>}
                  >
                    <CodexHolders token={displayToken} />
                  </React.Suspense>
                )}
                {selectedTab === "Dev Tokens" && (
                  <React.Suspense
                    fallback={<div className="flex items-center justify-center h-full text-neutral-400">Loading...</div>}
                  >
                    <CodexDevTokens token={displayToken} />
                  </React.Suspense>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: action panel */}
          <div className="flex-shrink-0 min-w-[260px] basis-[280px] md:basis-[310px] lg:basis-[330px] hidden lg:block">
            <TradeActionPanel
              token={displayToken}
              tradeParams={tradeParams}
              setTradeParams={setTradeParams}
              quickBuySettings={quickBuySettings}
              quickBuySide={quickBuySide}
              initialStats={initialTradeData?.stats}
            />
          </div>

          {/* Trade button for mobile */}
          <div className="fixed bottom-0 left-0 w-full p-4 z-50 lg:hidden mb-10">
            <button
              className="w-full bg-emerald-500 text-white p-2 rounded-lg cursor-pointer"
              onClick={() => setShowMobileTradeModal(true)}
            >
              Trade
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Trade Modal */}
      {showMobileTradeModal && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          {/* Backdrop */}
          <div
            className={`absolute inset-0 bg-black/70 bg-opacity-50 transition-opacity duration-300 ${
              isClosingModal ? "opacity-0" : "opacity-100"
            }`}
            onClick={closeModal}
          />

          {/* Bottom Sheet */}
          <div
            ref={modalDragRef}
            className={`absolute bottom-0 left-0 right-0 bg-[#0f1012] rounded-t-xl shadow-2xl max-h-[85vh] flex flex-col ${
              isClosingModal ? "mobile-trade-modal-closing" : "mobile-trade-modal"
            }`}
            style={{ touchAction: "none" }}
          >
            {/* Handle bar - draggable area */}
            <div
              className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing select-none"
              onTouchStart={handleDragStart}
              onTouchMove={handleDragMove}
              onTouchEnd={handleDragEnd}
              onMouseDown={handleDragStart}
              style={{ touchAction: "none" }}
            >
              <div className="w-12 h-1 bg-[#2A2B33] rounded-full" />
            </div>

            {/* Close button */}
            <div className="flex justify-end pr-4 pb-2">
              <button
                onClick={closeModal}
                className="w-8 h-8 rounded-full bg-[#2A2B33] flex items-center justify-center text-[#9CA3AF] hover:bg-[#1E1F26] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            {/* TradeActionPanel content */}
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
        /* Ensure lightweight charts fit properly in our layout */
        .lightweight-chart-container,
        .ohlc-chart-container,
        .tv-lightweight-charts {
          width: 100% !important;
          height: 100% !important;
        }
        .tv-lightweight-charts .pane {
          overflow: visible !important;
        }
        .tv-lightweight-charts canvas {
          image-rendering: pixelated;
          image-rendering: -moz-crisp-edges;
          image-rendering: crisp-edges;
        }

        /* Chart wrapper */
        .chart-wrapper {
          display: flex;
          flex-direction: column;
          position: relative;
          max-width: 100%;
        }
        .chart-wrapper > * {
          max-width: 100%;
        }

        /* Thin splitter keeps layout tight */
        [role="separator"] {
          pointer-events: auto;
          position: relative;
        }
        [role="separator"]:hover {
          opacity: 1;
        }

        /* ===== Tighten the space between chart and tabs ===== */
        #tabs-pane {
          margin-top: 0 !important;
          padding-top: 0 !important;
        }
        #tabs-pane > * {
          margin-top: 0 !important;
          padding-top: 0 !important;
        }
        /* In case TradeTabs injects its own top spacing */
        #tabs-pane > div:first-of-type,
        #tabs-pane [class*="tabs"]:first-of-type,
        #tabs-pane [class*="Tab"]:first-of-type {
          margin-top: 0 !important;
          padding-top: 0 !important;
        }
        /* Ensure chart section doesn't add bottom spacing */
        .chart-wrapper,
        .chart-wrapper > * {
          margin-bottom: 0 !important;
          padding-bottom: 0 !important;
        }

        /* Mobile Trade Modal animations */
        .mobile-trade-modal {
          animation: slideUp 0.3s ease-out;
          transition: transform 0.3s ease-out;
        }
        .mobile-trade-modal-closing {
          animation: slideDown 0.3s ease-in;
        }
        @keyframes slideUp {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        @keyframes slideDown {
          from {
            transform: translateY(0);
          }
          to {
            transform: translateY(100%);
          }
        }

        /* Prevent body scroll when modal is open */
        body.modal-open {
          overflow: hidden;
        }
      `}</style>
    </>
  );
}
