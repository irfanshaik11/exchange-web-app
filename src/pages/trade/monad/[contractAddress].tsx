import { useRouter } from "next/router";
import React, { useEffect, useState, useCallback, useRef } from "react";
import Head from "next/head";
import { useWallet } from "../../../components/useWallet";
import { useUser } from "../../../components/UserContext";
import Header from "../../../components/Header";
import Footer from "../../../components/Footer";
import TradeHeader from "../../../components/trade/TradeHeader";
import MonadTradeActionPanel from "../../../components/trade/MonadTradeActionPanel";
import InstantTradeModal from "../../../components/trade/InstantTradeModal";
import dynamic from "next/dynamic";
import { useQuickBuyQueryParams } from "../../../components/QuickBuy";
import { useTradePageQueryParams } from "../../../utils/queryParams";
import { useComponentCache } from "../../../hooks/useComponentCache";
import { useMonadTokenMetrics, type TokenMetrics } from "../../../hooks/useMonadTokenMetrics";
// Eager load AdvancedOHLCChart on trade pages - always needed, so no point in lazy loading
import AdvancedOHLCChart from "../../../components/AdvancedOHLCChart";

// Lazy load other components
const MonadTrades = dynamic(() => import("../../../components/trade/MonadTrades"), { ssr: false });

/* ---------- AXIOM palette ---------- */
const AX = {
  bg: "#101114",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#f0f5f5",
  muted: "#9CA3AF",
  mint: "#70E0B0",
  mintHover: "#58B890",
  sell: "#FF4D7F",
};

interface MonadTokenData {
  mint: string;
  name: string;
  symbol: string;
  usd_price: number;
  fully_diluted_value: number;
  market_cap_usd?: number;
  volume_24h: number;
  volume_5m?: number;
  volume_1h?: number;
  volume_6h?: number;
  created_at: string | null;
  launch_time?: string | null;
  launchpad_protocol?: string | null;
  image_url?: string | null;
  status?: string;
  decimals?: number;
  total_transactions?: number;
  total_buys?: number;
  total_sells?: number;
  unique_traders?: number;
  is_graduated?: boolean;
  pair_address?: string;
  creator_address?: string | null;
  creator_wallet?: string | null;
  dev_address?: string | null;
  owner?: string | null;
}

export default function MonadTradePage() {
  const router = useRouter();
  const { contractAddress, _name, _symbol, _price, _mcap, _image, _mint } = router.query;

  const [tokenData, setTokenData] = useState<MonadTokenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isConnected } = useWallet();
  const { user } = useUser();
  const [selectedTab, setSelectedTab] = useState("Transactions");
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
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('instant-trade-popup-open', String(isInstantTradeOpen));
    }
  }, [isInstantTradeOpen]);

  const { settings: quickBuySettings, side: quickBuySide } = useQuickBuyQueryParams();
  const { params: tradeParams, setParams: setTradeParams, isReady: tradeParamsReady } = useTradePageQueryParams();

  // Real-time token metrics via WebSocket
  const [liveMetrics, setLiveMetrics] = useState<TokenMetrics | null>(null);
  const { metrics: wsMetrics, connected: wsMetricsConnected } = useMonadTokenMetrics({
    tokenAddress: (contractAddress as string) || "",
    enabled: !!contractAddress && typeof contractAddress === "string",
    onUpdate: (metrics) => setLiveMetrics(metrics),
  });

  // Optimistic token data from query params
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

  // Fetch token data
  useEffect(() => {
    if (!contractAddress || typeof contractAddress !== "string") {
      setLoading(false);
      return;
    }

    const fetchTokenData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Call Monad backend directly (bypasses proxy for Redis cache)
        const monadServiceUrl = process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL!;
        const endpoints = [
          `${monadServiceUrl}/v1/pulse/new?limit=100`,
          `${monadServiceUrl}/v1/pulse/final-stretch?limit=100`,
          `${monadServiceUrl}/v1/pulse/migrated?limit=100`,
        ];

        let foundToken: MonadTokenData | null = null;

        for (const endpoint of endpoints) {
          try {
            const response = await fetch(endpoint, {
              headers: { 'Accept': 'application/json' }
            });
            if (response.ok) {
              const result = await response.json();
              // Backend returns { status: "success", count: N, data: [...] }
              const rawTokens = result.data || (Array.isArray(result) ? result : []);
              // Transform backend response: map 'address' to 'mint' for frontend compatibility
              const tokens = rawTokens.map((t: any) => {
                const normalizedPrice =
                  typeof t.usd_price === 'number' ? t.usd_price :
                  typeof t.price_usd === 'number' ? t.price_usd :
                  typeof t.priceUsd === 'number' ? t.priceUsd :
                  0;
                const normalizedMarketCap =
                  typeof t.market_cap_usd === 'number' ? t.market_cap_usd :
                  typeof t.marketCapUSD === 'number' ? t.marketCapUSD :
                  typeof t.fully_diluted_value === 'number' ? t.fully_diluted_value :
                  0;
                return {
                  ...t,
                  mint: t.address || t.mint,  // Backend uses 'address', frontend expects 'mint'
                  usd_price: t.usd_price ?? t.price_usd ?? t.priceUsd ?? normalizedPrice,
                  price_usd: t.price_usd ?? t.usd_price ?? t.priceUsd ?? normalizedPrice,
                  market_cap_usd: t.market_cap_usd ?? t.marketCapUSD ?? normalizedMarketCap,
                  fully_diluted_value: t.fully_diluted_value ?? t.market_cap_usd ?? t.marketCapUSD ?? normalizedMarketCap,
                };
              });
              const token = tokens.find(
                (t: any) => t.mint === contractAddress || t.pair_address === contractAddress || t.address === contractAddress
              );
              if (token) {
                foundToken = token;
                break;
              }
            }
          } catch (err) {
            console.warn(`Failed to fetch from ${endpoint}:`, err);
          }
        }

        if (foundToken) {
          setTokenData(foundToken);
        } else if (optimisticToken) {
          // Use optimistic data if available
          setTokenData({
            mint: contractAddress as string,
            name: optimisticToken.name,
            symbol: optimisticToken.symbol,
            usd_price: optimisticToken.price_usd || 0,
            fully_diluted_value: optimisticToken.market_cap_usd || 0,
            market_cap_usd: optimisticToken.market_cap_usd || 0,
            volume_24h: 0,
            created_at: null,
            image_url: optimisticToken.image || null,
            pair_address: contractAddress as string,
          });
        } else {
          setError("Token not found");
        }
      } catch (err) {
        console.error("Error fetching Monad token data:", err);
        setError("Failed to load token data");
        if (optimisticToken) {
          // Fallback to optimistic data
          setTokenData({
            mint: contractAddress as string,
            name: optimisticToken.name,
            symbol: optimisticToken.symbol,
            usd_price: optimisticToken.price_usd || 0,
            fully_diluted_value: optimisticToken.market_cap_usd || 0,
            market_cap_usd: optimisticToken.market_cap_usd || 0,
            volume_24h: 0,
            created_at: null,
            image_url: optimisticToken.image || null,
            pair_address: contractAddress as string,
          });
        }
      } finally {
        setLoading(false);
      }
    };

    fetchTokenData();
  }, [contractAddress, optimisticToken]);

  // Convert Monad token data to Token format for components
  // Merges live WebSocket metrics when available for real-time updates
  const displayToken = React.useMemo(() => {
    const live = liveMetrics || wsMetrics;
    const tokenPriceUsd = (tokenData as any)?.usd_price ?? (tokenData as any)?.price_usd ?? (tokenData as any)?.priceUsd ?? 0;
    const tokenMarketCap =
      (tokenData as any)?.market_cap_usd ??
      (tokenData as any)?.marketCapUSD ??
      (tokenData as any)?.fully_diluted_value ??
      0;
    const tokenSupply =
      (tokenData as any)?.total_supply ??
      (tokenData as any)?.supply ??
      1_000_000_000;

    if (!tokenData) return optimisticToken ? {
      mint: contractAddress as string,
      name: optimisticToken.name,
      symbol: optimisticToken.symbol,
      usd_price: live?.price_usd ?? optimisticToken.price_usd ?? 0,
      price_usd: live?.price_usd ?? optimisticToken.price_usd ?? 0,
      market_cap_usd: live?.market_cap_usd ?? optimisticToken.market_cap_usd ?? 0,
      pair_address: contractAddress as string,
      logo: optimisticToken.image || "",
      decimals: 18,
      total_supply: 1_000_000_000,
      creator_address: null,
      dev_address: null,
      owner: null,
      // Live metrics
      liquidity_usd: live?.liquidity_usd ?? 0,
      graduation_percent: live?.graduation_percent ?? 0,
      volume_24h: live?.volume_24h_usd ?? 0,
      total_buys: live?.total_buys ?? 0,
      total_sells: live?.total_sells ?? 0,
      total_buy_volume_usd: live?.total_buy_volume_usd ?? 0,
      total_sell_volume_usd: live?.total_sell_volume_usd ?? 0,
      net_volume_usd: live?.net_volume_usd ?? 0,
    } : null;

    return {
      mint: tokenData.mint || (contractAddress as string),
      name: tokenData.name,
      symbol: tokenData.symbol,
      // Price: prefer live metrics, fallback to fetched data
      usd_price: live?.price_usd ?? tokenPriceUsd,
      price_usd: live?.price_usd ?? tokenPriceUsd,
      market_cap_usd: live?.market_cap_usd ?? tokenMarketCap,
      fully_diluted_value: live?.market_cap_usd ?? tokenData.fully_diluted_value ?? tokenMarketCap,
      pair_address: tokenData.pair_address || tokenData.mint || (contractAddress as string),
      logo: tokenData.image_url || "",
      decimals: tokenData.decimals || 18,
      total_supply: tokenSupply,
      created_at: tokenData.created_at || tokenData.launch_time || null,
      // Live metrics (real-time via WebSocket, fallback to HTTP API data)
      liquidity_usd: live?.liquidity_usd ?? (tokenData as any)?.liquidity_usd ?? 0,
      total_liquidity_usd: live?.liquidity_usd ?? (tokenData as any)?.liquidity_usd ?? 0,
      graduation_percent: live?.graduation_percent ?? (tokenData as any)?.graduation_percent ?? (tokenData as any)?.bonding_curve_progress ?? 0,
      bonding_pct: live?.graduation_percent ?? (tokenData as any)?.bonding_curve_progress ?? (tokenData as any)?.graduation_percent ?? 0,
      volume_24h: live?.volume_24h_usd ?? tokenData.volume_24h ?? 0,
      total_buys: live?.total_buys ?? tokenData.total_buys ?? 0,
      total_sells: live?.total_sells ?? tokenData.total_sells ?? 0,
      total_transactions: live?.total_transactions ?? tokenData.total_transactions ?? 0,
      unique_traders: live?.unique_traders ?? tokenData.unique_traders ?? 0,
      // USD volumes: prefer WebSocket, fallback to calculated from MON volume (MON price ~$0.25)
      total_buy_volume_usd: live?.total_buy_volume_usd ?? ((tokenData as any)?.total_buy_volume_mon ? (tokenData as any).total_buy_volume_mon * 0.25 : 0),
      total_sell_volume_usd: live?.total_sell_volume_usd ?? ((tokenData as any)?.total_sell_volume_mon ? (tokenData as any).total_sell_volume_mon * 0.25 : 0),
      net_volume_usd: live?.net_volume_usd ?? (((tokenData as any)?.total_buy_volume_mon ?? 0) - ((tokenData as any)?.total_sell_volume_mon ?? 0)) * 0.25,
      launchpad_protocol: tokenData.launchpad_protocol || "nad.fun",
      // Dev/creator address fields
      creator_address: (tokenData as any)?.creator_address || (tokenData as any)?.creator_wallet || (tokenData as any)?.dev_address || (tokenData as any)?.owner || null,
      dev_address: (tokenData as any)?.dev_address || (tokenData as any)?.creator_wallet || (tokenData as any)?.creator_address || (tokenData as any)?.owner || null,
      owner: (tokenData as any)?.owner || (tokenData as any)?.creator_wallet || (tokenData as any)?.creator_address || (tokenData as any)?.dev_address || null,
    };
  }, [tokenData, optimisticToken, contractAddress, liveMetrics, wsMetrics]);

  const tokenNameForTitle =
    (displayToken?.name && displayToken.name.trim()) ||
    (displayToken?.symbol && displayToken.symbol.trim()) ||
    (typeof contractAddress === "string" && contractAddress.slice(0, 8)) ||
    "";

  const pageTitle = tokenNameForTitle
    ? `${tokenNameForTitle} | Monad Trade`
    : "Monad Trade";

  // OHLC params based on token age
  const getOHLCParams = useComponentCache(
    "ohlc-params-monad",
    [tokenData, displayToken],
    () => {
      const createdAt = tokenData?.created_at || tokenData?.launch_time;
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

  // Chart container refs and resizing
  const containerRef = useRef<HTMLDivElement | null>(null);
  const MIN_CHART_HEIGHT = 350;
  const DEFAULT_CHART_HEIGHT_RATIO = 0.65;
  const SSR_DEFAULT_CHART_HEIGHT = 900;

  const getResponsiveLimits = useCallback(() => {
    if (typeof window === "undefined") return { min: MIN_CHART_HEIGHT, max: 800 };
    const vh = window.innerHeight;
    const MIN_TOP = Math.max(MIN_CHART_HEIGHT, vh * 0.3);
    const MIN_BOTTOM = 180;
    const MAX_TOP = Math.min(vh * 0.85, vh - MIN_BOTTOM);
    return { min: MIN_TOP, max: MAX_TOP };
  }, []);

  const clampTop = useCallback((desired: number) => {
    const limits = getResponsiveLimits();
    const enforcedMin = Math.max(MIN_CHART_HEIGHT, limits.min);
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const maxTop = Math.min(vh - 180, limits.max);
    return Math.max(enforcedMin, Math.min(desired, maxTop));
  }, [getResponsiveLimits]);

  const [topPanePx, setTopPanePx] = useState<number>(() => {
    if (typeof window === "undefined") return Math.max(MIN_CHART_HEIGHT, SSR_DEFAULT_CHART_HEIGHT);
    const limits = getResponsiveLimits();
    const proposed = Math.max(limits.min, Math.min(window.innerHeight * DEFAULT_CHART_HEIGHT_RATIO, limits.max));
    const saved = Number(localStorage.getItem("tradeSplitTopPx"));
    if (Number.isFinite(saved) && saved > 0 && saved >= limits.min && saved <= limits.max) {
      return Math.max(saved, proposed);
    }
    return proposed;
  });

  const [isResizing, setIsResizing] = useState(false);
  const topPanePxRef = useRef(topPanePx);

  useEffect(() => {
    topPanePxRef.current = topPanePx;
  }, [topPanePx]);

  useEffect(() => {
    localStorage.setItem("tradeSplitTopPx", String(topPanePx));
  }, [topPanePx]);

  useEffect(() => {
    const handleResize = () => {
      const limits = getResponsiveLimits();
      if (topPanePx < limits.min) {
        setTopPanePx(limits.min);
      } else if (topPanePx > limits.max) {
        setTopPanePx(limits.max);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [topPanePx, getResponsiveLimits]);

  // Mobile modal drag handlers
  const modalDragRef = useRef<HTMLDivElement | null>(null);
  const dragStartY = useRef(0);
  const dragCurrentY = useRef(0);
  const isDragging = useRef(false);
  const modalTransform = useRef(0);

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

  // Memoize pairAddress to prevent unnecessary changes that cause component remounts
  // Only recalculate when the actual pair_address changes, not on every displayToken update
  const pairAddress = React.useMemo(() => {
    return displayToken?.pair_address || (contractAddress as string);
  }, [displayToken?.pair_address, contractAddress]);

  return (
    <>
      <Head><title>{pageTitle}</title></Head>

      <div
        className="h-screen w-full flex flex-col overflow-hidden"
        style={{
          backgroundColor: "#0f1012",
          color: AX.text,
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
        }}
      >
        <Header search={search} setSearch={setSearch} />

        {loading && !displayToken && (
          <div className="text-center text-xs px-2 py-1.5 flex-shrink-0"
               style={{ color: AX.text, backgroundColor: "#2A2414", borderTop: `1px solid ${AX.border}`, borderBottom: `1px solid ${AX.border}` }}>
            Loading Monad token data…
          </div>
        )}

        <div
          className="flex flex-1 w-full max-w-full overflow-hidden min-h-0"
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
            {/* TOP pane - Chart */}
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
                <TradeHeader token={displayToken as any} />
              </div>

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
                {pairAddress && pairAddress.length >= 20 ? (
                  <AdvancedOHLCChart
                    key={`chart-monad-${contractAddress}`}
                    mint={typeof _mint === "string" ? _mint : displayToken?.mint}
                    pairAddress={pairAddress}
                    interval={currentOHLCParams.interval}
                    timeframe={currentOHLCParams.timeframe}
                    optimize={currentOHLCParams.optimize}
                    height="100%"
                    width="100%"
                    baseRefreshMs={10000}
                    className="relative"
                    tradeData={[]} // Monad may not have trade data yet
                    creatorAddress={null}
                    tokenSymbol={displayToken?.symbol || null}
                    tokenName={displayToken?.name || null}
                    tokenDecimals={displayToken?.decimals || null}
                    network="monad"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full" style={{ color: AX.muted }}>
                    Chart data not available for this Monad token
                  </div>
                )}
              </div>
            </div>

            {/* Resizer */}
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize chart and trades panels"
              tabIndex={0}
              onPointerDown={(e) => {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                const startY = e.clientY;
                const startTop = topPanePxRef.current;
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
                  (e.target as Element).releasePointerCapture(e.pointerId);
                  setIsResizing(false);
                  document.body.style.cursor = "";
                  document.body.style.userSelect = "";
                  (e.target as Element).removeEventListener("pointermove", onMove);
                  (e.target as Element).removeEventListener("pointerup", onUp);
                  (e.target as Element).removeEventListener("pointercancel", onUp);
                };
                (e.target as Element).addEventListener("pointermove", onMove, { passive: false });
                (e.target as Element).addEventListener("pointerup", onUp, { passive: false });
                (e.target as Element).addEventListener("pointercancel", onUp, { passive: false });
              }}
              className="relative h-1.5 cursor-row-resize select-none touch-none flex-shrink-0 flex items-center justify-center hover:bg-gray-800/20 transition-colors"
              style={{ touchAction: "none", zIndex: 10, pointerEvents: "auto" }}
            >
              <div className="flex items-center gap-0.5">
                <div className="w-0.5 h-0.5 rounded-full bg-gray-500" />
                <div className="w-0.5 h-0.5 rounded-full bg-gray-500" />
                <div className="w-0.5 h-0.5 rounded-full bg-gray-500" />
              </div>
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-gray-700/20" />
            </div>

            {/* BOTTOM pane (tabs + tables) */}
            <div id="tabs-pane" className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Transactions Tab Header */}
              <div className="flex gap-4 pt-2 px-3 text-xs items-center justify-between flex-shrink-0">
                <div className="flex gap-4 items-center">
                  <button
                    className="px-3 py-1 font-semibold border-b-4 border-[#70E0B0] text-white"
                  >
                    Transactions
                  </button>
                </div>
                <button
                  className="px-4 py-1.5 font-semibold flex items-center gap-2 transition-colors rounded-full bg-[#101114] text-[#70E0B0] ml-auto"
                  onClick={() => setIsInstantTradeOpen(true)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                  </svg>
                  <span>Instant Trade</span>
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto" style={{ paddingBottom: '2rem' }}>
                {/* Live Trades */}
                <MonadTrades
                  tokenAddress={pairAddress}
                  cachedTrades={(tokenData as any)?.recent_trades || []}
                />
              </div>
            </div>
          </div>

          {/* RIGHT: action panel */}
          <div className="flex-shrink-0 min-w-[260px] basis-[280px] md:basis-[310px] lg:basis-[330px] hidden lg:flex flex-col overflow-y-auto h-full">
            <div className="right-rail-panel token-info-panel">
              <MonadTradeActionPanel token={displayToken as any} />
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
              <MonadTradeActionPanel token={displayToken as any} />
            </div>
          </div>
        </div>
      )}

      <Footer />
      
      {/* Instant Trade Modal */}
      <InstantTradeModal
        isOpen={isInstantTradeOpen}
        onClose={() => setIsInstantTradeOpen(false)}
        token={displayToken as any}
      />

      {/* Global styles */}
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
        .right-rail-panel { margin: 0; }
        .right-rail-panel + .right-rail-panel { margin-top: 0; }
        .token-info-panel > *:last-child { margin-bottom: 0 !important; padding-bottom: 0 !important; }
        .mobile-trade-modal { animation: slideUp 0.3s ease-out; transition: transform 0.3s ease-out; }
        .mobile-trade-modal-closing { animation: slideDown 0.3s ease-in; }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slideDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
        body.modal-open { overflow: hidden; }
      `}</style>
    </>
  );
}
