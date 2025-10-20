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
import CodexTrades from "../../components/trade/CodexTrades";
import CodexTopTraders from "../../components/trade/CodexTopTraders";
import CodexDevTokens from "../../components/trade/CodexDevTokens";
import CodexHolders from "../../components/trade/CodexHolders";
import useSingleTokenPolling from "../../hooks/useSingleTokenPolling";
import { useQuickBuyQueryParams } from "../../components/QuickBuy";
import { useTradePageQueryParams } from "../../utils/queryParams";
import dynamic from 'next/dynamic';
const BirdeyeChart = dynamic(() => import('../../components/BirdeyeChart'), { ssr: false });
const BackendOHLCChart = dynamic(() => import('../../components/BackendOHLCChart'), { ssr: false });
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

  const { token: fetchedToken, isPolling, loading: pollingLoading, isHydrating, resolvedPairAddress } =
    useSingleTokenPolling(typeof id === "string" ? id : undefined);

  // Use fetched token if available, otherwise use optimistic token
  const token = fetchedToken || optimisticToken;

  // Debug: Log the pair addresses
  useEffect(() => {
    if (resolvedPairAddress || token?.pair_address) {
      console.log('[Trade Page] Pair addresses:', {
        resolvedPairAddress,
        tokenPairAddress: token?.pair_address,
        match: resolvedPairAddress === token?.pair_address
      });
    }
  }, [resolvedPairAddress, token?.pair_address]);

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
    const t = setTimeout(() => setShowSkeleton(false), 1000);
    return () => clearTimeout(t);
  }, [id]);

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
        {isPolling && (
          <div
            className="text-center text-xs px-2 py-1.5"
            style={{ color: AX.text, backgroundColor: "#14231B", borderTop: `1px solid ${AX.border}`, borderBottom: `1px solid ${AX.border}` }}
          >
            Live data updating every 3 seconds…
          </div>
        )}
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
                <TradeHeader token={token} />
              </div>

              {/* Chart - fully responsive */}
              <div className="flex-1 min-h-[240px] relative chart-wrapper w-full overflow-hidden pb-4">
                {typeof resolvedPairAddress === 'string' && resolvedPairAddress.length >= 32 ? (
                  <BackendOHLCChart
                    pairAddress={resolvedPairAddress}
                    interval="1m"
                    timeframe="24h"
                    height="100%"
                    width="100%"
                    baseRefreshMs={30000}
                    className="relative"
                  />
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
                {selectedTab === "Trades" && <CodexTrades token={token} />}
                {selectedTab === "Top Traders" && <CodexTopTraders token={token} />}
                {selectedTab === "Holders" && <CodexHolders token={token} />}
                {selectedTab === "Dev Tokens" && <CodexDevTokens token={token} />}
              </div>
            </div>
          </div>

          {/* RIGHT: action panel */}
          <div className="flex-shrink-0 min-w-[260px] basis-[280px] md:basis-[310px] lg:basis-[330px]">
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
      `}</style>
    </>
  );
}
