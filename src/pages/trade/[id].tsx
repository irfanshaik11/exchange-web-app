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
import { useQuickBuyQueryParams } from "../../components/QuickBuy";
import { useTradePageQueryParams } from "../../utils/queryParams";
import dynamic from 'next/dynamic';

// Lazy load heavy components to reduce initial bundle size
const BirdeyeChart = dynamic(() => import('../../components/BirdeyeChart'), { ssr: false });
const BackendOHLCChart = dynamic(() => import('../../components/BackendOHLCChart'), { ssr: false });
const CodexTrades = dynamic(() => import('../../components/trade/CodexTrades'), { 
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-32 text-gray-400">Loading trades...</div>
});
const CodexTopTraders = dynamic(() => import('../../components/trade/CodexTopTraders'), { 
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-32 text-gray-400">Loading traders...</div>
});
const CodexDevTokens = dynamic(() => import('../../components/trade/CodexDevTokens'), { 
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-32 text-gray-400">Loading tokens...</div>
});
const CodexHolders = dynamic(() => import('../../components/trade/CodexHolders'), { 
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-32 text-gray-400">Loading holders...</div>
});
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
  const { id, _name, _symbol, _price, _mcap, _image } = router.query;

  // Optimistic token data from query params for instant display
  const optimisticToken = React.useMemo(() => {
    if (_name || _symbol) {
      return {
        name: _name as string || '',
        symbol: _symbol as string || '',
        price_usd: _price ? parseFloat(_price as string) : undefined,
        market_cap_usd: _mcap ? parseFloat(_mcap as string) : undefined,
        image: _image as string || undefined,
      };
    }
    return null;
  }, [_name, _symbol, _price, _mcap, _image]);

  // Debug logging
  console.log('TradePage Debug:', {
    id,
    idType: typeof id,
    isString: typeof id === "string",
    optimisticToken
  });

  const [showSkeleton, setShowSkeleton] = useState(true);
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
  const {
    queryString,
    getQueryParams,
    getTradeParams,
    getLimitOrderParams,
    settings: quickBuySettings,
    side: quickBuySide
  } = useQuickBuyQueryParams();

  // Trade page specific parameters
  const {
    params: tradeParams,
    setParams: setTradeParams,
    getQueryString: getTradeQueryString,
    getApiParams: getTradeApiParams,
    isReady: tradeParamsReady
  } = useTradePageQueryParams();

  const { token, isPolling, loading: pollingLoading, isHydrating, resolvedPairAddress } =
    useSingleTokenPolling(typeof id === "string" ? id : undefined);

  // Pre-fetch initial trade data with caching for instant/fast loading
  const { 
    data: initialTradeData, 
    loading: initialDataLoading, 
    error: initialDataError,
    isFromCache 
  } = useInitialTradeData(resolvedPairAddress, token?.mint);

  // Debug: Log the pair addresses and initial data status
  useEffect(() => {
    if (resolvedPairAddress || token?.pair_address) {
      console.log('[Trade Page] Pair addresses:', {
        resolvedPairAddress,
        tokenPairAddress: token?.pair_address,
        match: resolvedPairAddress === token?.pair_address
      });
    }
  }, [resolvedPairAddress, token?.pair_address]);

  useEffect(() => {
    if (initialTradeData) {
      console.log('[Trade Page] Initial data loaded:', {
        tradesCount: initialTradeData.trades?.length || 0,
        hasStats: !!initialTradeData.stats,
        isFromCache,
        loading: initialDataLoading,
      });
    }
  }, [initialTradeData, isFromCache, initialDataLoading]);

  // Fetch correct token data from database (same as search modal)
  const [correctTokenData, setCorrectTokenData] = useState<any>(null);
  const [isLoadingCorrectData, setIsLoadingCorrectData] = useState(false);
  
  useEffect(() => {
    const fetchCorrectTokenData = async () => {
      if (!token?.mint) return;
      
      setIsLoadingCorrectData(true);
      
      try {
        // Use the same search endpoint that search modal uses
        const response = await fetch(`/api/token-service/search?phrase=${encodeURIComponent(token.mint)}&limit=1`);
        if (response.ok) {
          const data = await response.json();
          if (data.tokens && data.tokens.length > 0) {
            const correctToken = data.tokens[0];
            const createdAt = correctToken.created_at;
            // Handle Unix timestamp in seconds (convert to milliseconds)
            let timestamp = createdAt;
            if (typeof createdAt === 'number' && createdAt < 10000000000) {
              timestamp = createdAt * 1000;
              console.log('[Trade Page] Converted Unix seconds to milliseconds:', { original: createdAt, converted: timestamp });
            }
            
            const createdDate = new Date(timestamp);
            const now = new Date();
            const diffMs = now.getTime() - createdDate.getTime();
            const ageInDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            
            console.log('[Trade Page] Correct token data from search API:', {
              mint: correctToken.mint,
              name: correctToken.name,
              created_at: createdAt,
              created_at_type: typeof createdAt,
              createdDate: createdDate.toISOString(),
              createdDate_valid: !isNaN(createdDate.getTime()),
              now: now.toISOString(),
              diffMs,
              ageInDays,
              ageInYears: Math.floor(ageInDays / 365)
            });
            setCorrectTokenData(correctToken);
          }
        }
      } catch (error) {
        console.error('[Trade Page] Failed to fetch correct token data:', error);
      } finally {
        setIsLoadingCorrectData(false);
      }
    };
    
    fetchCorrectTokenData();
  }, [token?.mint]);

  // Calculate optimal OHLC interval and timeframe based on CORRECT token age
  const getOHLCParams = useCallback(() => {
    // Use correct token data if available, otherwise fall back to trade service data
    const tokenForAge = correctTokenData || token;
    const createdAt = tokenForAge?.created_at || tokenForAge?.createdAt || (tokenForAge as any)?.CreatedAt;
    
    if (!createdAt) {
      // Default for tokens without creation time - good default that works for most tokens
      return { interval: '1h' as const, timeframe: '30d' as const, optimize: false };
    }

    // Handle Unix timestamp in seconds (convert to milliseconds)
    let timestamp = createdAt;
    if (typeof createdAt === 'number' && createdAt < 10000000000) {
      timestamp = createdAt * 1000;
      console.log('[Trade Page] OHLC: Converted Unix seconds to milliseconds:', { original: createdAt, converted: timestamp });
    }
    
    const createdDate = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - createdDate.getTime();
    const ageInHours = diffMs / (1000 * 60 * 60);
    const ageInDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)); // Use integer days like search modal

    console.log('[Trade Page] Token age calculation (using correct data):', {
      createdAt,
      createdAt_type: typeof createdAt,
      createdDate: createdDate.toISOString(),
      createdDate_valid: !isNaN(createdDate.getTime()),
      ageInHours,
      ageInDays,
      ageInYears: Math.floor(ageInDays / 365),
      diffMs,
      dataSource: correctTokenData ? 'search-api' : 'trade-service',
      tokenForAge_keys: Object.keys(tokenForAge || {}).filter(k => k.includes('created') || k.includes('time'))
    });

    // For very new tokens (< 1 hour) - use 1m intervals
    if (ageInHours < 1) {
      return { interval: '1m' as const, timeframe: '1h' as const, optimize: false };
    }
    // For very new tokens (< 6 hours) - use 1m intervals
    else if (ageInHours < 6) {
      return { interval: '1m' as const, timeframe: '4h' as const, optimize: false };
    }
    // For new tokens (< 24 hours) - use 1m intervals
    else if (ageInDays < 1) {
      return { interval: '1m' as const, timeframe: '24h' as const, optimize: false };
    }
    // For tokens 1-7 days old
    else if (ageInDays < 7) {
      return { interval: '15m' as const, timeframe: '7d' as const, optimize: false };
    }
    // For tokens 7-30 days old
    else if (ageInDays < 30) {
      return { interval: '1h' as const, timeframe: '30d' as const, optimize: false };
    }
    // For tokens 30-90 days old
    else if (ageInDays < 90) {
      return { interval: '1d' as const, timeframe: '90d' as const, optimize: true };
    }
    // For tokens 90-180 days old
    else if (ageInDays < 180) {
      return { interval: '1d' as const, timeframe: '180d' as const, optimize: true };
    }
    // For tokens 180-365 days old
    else if (ageInDays < 365) {
      return { interval: '1d' as const, timeframe: '365d' as const, optimize: true };
    }
    // For very old tokens (> 1 year)
    else {
      return { interval: '7d' as const, timeframe: '365d' as const, optimize: true };
    }
  }, [correctTokenData, token, isLoadingCorrectData]);

  const ohlcParams = getOHLCParams();

  // Debug: Log OHLC params calculation
  useEffect(() => {
    console.log('[Trade Page] OHLC params calculation:', {
      ohlcParams,
      hasCorrectTokenData: !!correctTokenData,
      isLoadingCorrectData,
      tokenMint: token?.mint,
      tokenCreatedAt: token?.created_at || token?.createdAt || (token as any)?.CreatedAt,
      correctTokenCreatedAt: correctTokenData?.created_at,
      dataSource: correctTokenData ? 'search-api' : 'trade-service',
      isOptimizing: isLoadingCorrectData && !correctTokenData
    });
  }, [ohlcParams, correctTokenData, isLoadingCorrectData, token]);

  // Debug: Log token data to understand the discrepancy
  useEffect(() => {
    if (token) {
      console.log('[Trade Page] Token data debug:', {
        created_at: token.created_at,
        createdAt: token.createdAt,
        CreatedAt: (token as any).CreatedAt,
        hasCreatedAt: !!token.createdAt,
        hasCreated_at: !!token.created_at,
        hasCreatedAtCamel: !!(token as any).CreatedAt,
        tokenKeys: Object.keys(token).filter(key => key.includes('created') || key.includes('Created'))
      });
    }
  }, [token]);

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
  useEffect(() => {
    setShowSkeleton(true);
    const t = setTimeout(() => setShowSkeleton(false), 300);
    return () => clearTimeout(t);
  }, [id]);

  // Prevent body scroll when mobile modal is open
  useEffect(() => {
    if (showMobileTradeModal) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [showMobileTradeModal]);

  // Close modal with animation
  const closeModal = useCallback(() => {
    setIsClosingModal(true);
    setTimeout(() => {
      setShowMobileTradeModal(false);
      setIsClosingModal(false);
    }, 300); // Match animation duration
  }, []);

  // Drag functionality for modal
  const handleDragStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartY.current = clientY;
    isDragging.current = true;
    modalTransform.current = 0;
  }, []);

  const handleDragMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragCurrentY.current = clientY;
    const deltaY = dragCurrentY.current - dragStartY.current;
    
    // Only allow downward dragging
    if (deltaY > 0) {
      modalTransform.current = deltaY;
      if (modalDragRef.current) {
        modalDragRef.current.style.transform = `translateY(${deltaY}px)`;
        // Add opacity effect as user drags
        const opacity = Math.max(0.7, 1 - (deltaY / 300));
        modalDragRef.current.style.opacity = String(opacity);
      }
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    
    const threshold = 100; // Minimum drag distance to close
    if (modalTransform.current > threshold) {
      closeModal();
    } else {
      // Snap back to original position with animation
      if (modalDragRef.current) {
        modalDragRef.current.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
        modalDragRef.current.style.transform = 'translateY(0px)';
        modalDragRef.current.style.opacity = '1';
        // Remove transition after animation completes
        setTimeout(() => {
          if (modalDragRef.current) {
            modalDragRef.current.style.transition = '';
          }
        }, 200);
      }
    }
    modalTransform.current = 0;
  }, [closeModal]);

  // Global mouse event listeners for drag functionality
  useEffect(() => {
    if (!showMobileTradeModal) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragging.current) {
        handleDragMove(e as any);
      }
    };

    const handleGlobalMouseUp = () => {
      if (isDragging.current) {
        handleDragEnd();
      }
    };

    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (isDragging.current) {
        handleDragMove(e as any);
      }
    };

    const handleGlobalTouchEnd = () => {
      if (isDragging.current) {
        handleDragEnd();
      }
    };

    // Add global event listeners
    document.addEventListener('mousemove', handleGlobalMouseMove, { passive: false });
    document.addEventListener('mouseup', handleGlobalMouseUp, { passive: false });
    document.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
    document.addEventListener('touchend', handleGlobalTouchEnd, { passive: false });

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('touchmove', handleGlobalTouchMove);
      document.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, [showMobileTradeModal, handleDragMove, handleDragEnd]);

  if (showSkeleton) {
    return (
      <div
        className="min-h-screen w-full flex flex-col"
        style={{ backgroundColor: '#0f1012', color: AX.text, fontFamily: 'Inter, ui-sans-serif, system-ui' }}
      >
        <Header search={search} setSearch={setSearch} />
        <div className="flex flex-1" />
      </div>
    );
  }

  if (pollingLoading) {
    return <div className="mt-20 text-center text-2xl" style={{ color: AX.muted }}>Loading...</div>;
  }

  if (!token) {
    return <div className="mt-20 text-center text-2xl" style={{ color: AX.sell }}>Token not found</div>;
  }

  return (
    <>
      <Head><title>{token?.name} | Trade</title></Head>
      <Toaster position="top-right" />

      {draggingRef.current && <div className="fixed inset-0 z-[60] cursor-row-resize" />}

      <div
        className="min-h-screen w-full flex flex-col"
        style={{ backgroundColor: '#0f1012', color: AX.text, fontFamily: 'Inter, ui-sans-serif, system-ui' }}
      >
        {/* Top global header */}
        <Header search={search} setSearch={setSearch} />

        {/* little live banners */}
        {/* Commented out: Live data updating banner
        {isPolling && (
          <div
            className="text-center text-xs px-2 py-1.5"
            style={{ color: AX.text, backgroundColor: "#14231B", borderTop: `1px solid ${AX.border}`, borderBottom: `1px solid ${AX.border}` }}
          >
            Live data updating every 3 seconds…
          </div>
        )}
        */}
        {isHydrating && (
          <div
            className="text-center text-xs px-2 py-1.5"
            style={{ color: AX.text, backgroundColor: "#2A2414", borderTop: `1px solid ${AX.border}`, borderBottom: `1px solid ${AX.border}` }}
          >
            Finding trading pair for this token…
          </div>
        )}

        <div className="flex flex-1 w-full max-w-full overflow-hidden">
          {/* LEFT: chart + tables */}
          <div
            ref={containerRef}
            className="flex-1 min-w-0 max-w-full flex flex-col pb-3"
            style={{ borderRight: `1px solid ${AX.border}` }}
          >
            {/* TOP pane - Chart in top left */}
            <div className="flex-shrink-0 flex flex-col" style={{ height: topPanePx }}>
              {/* TradeHeader includes name + the ONLY icon cluster */}
              <div className="px-2 flex-shrink-0">
                <TradeHeader token={correctTokenData || token} />
              </div>

              {/* Chart - fully responsive */}
              <div className="flex-1 min-h-[240px] relative chart-wrapper w-full overflow-hidden pb-1">
                {typeof resolvedPairAddress === 'string' && resolvedPairAddress.length >= 32 && ohlcParams ? (
                  <>
                    <BackendOHLCChart
                      key={`${ohlcParams.interval}-${ohlcParams.timeframe}-${ohlcParams.optimize}`}
                      pairAddress={resolvedPairAddress}
                      interval={ohlcParams.interval}
                      timeframe={ohlcParams.timeframe}
                      optimize={ohlcParams.optimize}
                      height="100%"
                      width="100%"
                      baseRefreshMs={30000}
                      className="relative"
                    />
                    {/* Subtle indicator when optimizing chart parameters */}
                    {isLoadingCorrectData && (
                      <div className="absolute top-2 right-2 text-xs opacity-60" style={{ color: AX.muted }}>
                        <div className="flex items-center gap-1">
                          <div className="w-1 h-1 rounded-full bg-blue-400 animate-pulse"></div>
                          Optimizing...
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full" style={{ color: AX.muted }}>
                    {isHydrating ? 'Resolving pair address...' : 'No pair address available'}
                  </div>
                )}
              </div>
            </div>

            {/* Resizer - positioned between chart and tabs */}
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
                  window.removeEventListener("pointermove", onMove, { capture: true } as any);
                  window.removeEventListener("pointerup", onUp as any, { capture: true } as any);
                };
                window.addEventListener("pointermove", onMove, { capture: true });
                window.addEventListener("pointerup", onUp as any, { capture: true });
              }}
              className="relative h-4 cursor-row-resize select-none touch-none flex-shrink-0 "
              style={{ 
                touchAction: "none",
                zIndex: 1,
                background: AX.bg
              }}
            >
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px" style={{ background: AX.border }} />
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-1 px-2 py-1 rounded-full transition-all duration-200 hover:scale-110 hover:opacity-100"
                style={{ 
                  background: 'rgba(61, 220, 132, 0.12)',
                  border: `1px solid rgba(61, 220, 132, 0.3)`,
                  width: '32px',
                  height: '12px',
                  opacity: 0.8
                }}
              >
                <span className="h-1 w-1 rounded-full" style={{ background: '#3DDC84', opacity: 0.8 }} />
                <span className="h-1 w-1 rounded-full" style={{ background: '#3DDC84', opacity: 0.8 }} />
                <span className="h-1 w-1 rounded-full" style={{ background: '#3DDC84', opacity: 0.8 }} />
              </div>
            </div>

            {/* BOTTOM pane */}
            <div className="flex-1 min-h-[120px] flex flex-col">
              <TradeTabs 
                selectedTab={selectedTab} 
                setSelectedTab={setSelectedTab}
              />
              <div className="flex-1 min-h-0">
                {selectedTab === "Trades" && (
                  <CodexTrades 
                    token={token} 
                    initialTrades={initialTradeData?.trades || []}
                  />
                )}
                {selectedTab === "Top Traders" && <CodexTopTraders token={token} />}
                {selectedTab === "Holders" && <CodexHolders token={token} />}
                {selectedTab === "Dev Tokens" && <CodexDevTokens token={token} />}
              </div>
            </div>
          </div>

          {/* RIGHT: action panel */}
          <div className="flex-shrink-0 min-w-[260px] basis-[280px] md:basis-[310px] lg:basis-[330px] hidden lg:block">
            <TradeActionPanel 
              token={token} 
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
              isClosingModal ? 'opacity-0' : 'opacity-100'
            }`}
            onClick={closeModal}
          />
          
          {/* Bottom Sheet */}
          <div 
            ref={modalDragRef}
            className={`absolute bottom-0 left-0 right-0 bg-[#0f1012] rounded-t-xl shadow-2xl max-h-[85vh] flex flex-col ${
              isClosingModal ? 'mobile-trade-modal-closing' : 'mobile-trade-modal'
            }`}
            style={{ touchAction: 'none' }}
          >
            {/* Handle bar - draggable area */}
            <div 
              className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing select-none"
              onTouchStart={handleDragStart}
              onTouchMove={handleDragMove}
              onTouchEnd={handleDragEnd}
              onMouseDown={handleDragStart}
              style={{ touchAction: 'none' }}
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
                token={token} 
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

      {/* Lightweight Charts styling */}
      <style jsx global>{`
        /* Ensure lightweight charts fit properly in our layout */
        .lightweight-chart-container {
          width: 100% !important;
          height: 100% !important;
          background: rgba(0, 0, 0, 1) !important;
        }
        
        /* Make chart bars thinner and more spaced */
        .ohlc-chart-container {
          width: 100% !important;
          height: 100% !important;
        }
        
        /* Ensure proper chart spacing */
        .tv-lightweight-charts {
          width: 100% !important;
          height: 100% !important;
        }
        
        /* Make candlesticks appear thinner */
        .tv-lightweight-charts .pane {
          overflow: visible !important;
        }
        
        /* Reduce candlestick width visually */
        .tv-lightweight-charts canvas {
          image-rendering: pixelated;
          image-rendering: -moz-crisp-edges;
          image-rendering: crisp-edges;
        }

        /* Chart wrapper responsive behavior */
        .chart-wrapper {
          display: flex;
          flex-direction: column;
          position: relative;
          max-width: 100%;
        }

        .chart-wrapper > * {
          max-width: 100%;
        }

        /* Prevent layout overflow on large screens */
        @media (min-width: 1920px) {
          .chart-wrapper {
            max-width: 100%;
          }
        }

        /* Ensure resizer doesn't interfere with chart */
        [role="separator"] {
          pointer-events: auto;
          position: relative;
        }

        [role="separator"]:hover {
          opacity: 1;
        }

        /* Mobile Trade Modal Styles */
        .mobile-trade-modal {
          animation: slideUp 0.3s ease-out;
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

        .mobile-trade-backdrop {
          animation: fadeIn 0.3s ease-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes fadeOut {
          from {
            opacity: 1;
          }
          to {
            opacity: 0;
          }
        }

        /* Prevent body scroll when modal is open */
        body.modal-open {
          overflow: hidden;
        }

        /* Drag improvements */
        .cursor-grab {
          cursor: grab;
        }

        .cursor-grab:active {
          cursor: grabbing;
        }

        /* Prevent text selection during drag */
        .select-none {
          user-select: none;
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
        }

        /* Smooth transitions for drag states */
        .mobile-trade-modal {
          transition: transform 0.3s ease-out;
        }

        /* Disable transitions during drag */
        .mobile-trade-modal.dragging {
          transition: none;
        }
      `}</style>
    </>
  );
}
