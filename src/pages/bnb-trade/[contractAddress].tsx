import { useRouter } from 'next/router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import TradeHeader from '../../components/trade/TradeHeader';
import TradeTabs from '../../components/trade/TradeTabs';
import AdvancedOHLCChart from '../../components/AdvancedOHLCChart';
import useBackgroundOHLCPreload from '../../hooks/useBackgroundOHLCPreload';
import { formatMarketCap } from '../../utils/formatPrice';
import { normalizeBscToken } from '../../hooks/useBscPulseWebSocket';
import {
  type BnbOhlcItem,
  resolveBnbCirculatingSupply,
  resolveBnbMarketCapUsd,
  resolveBnbPriceUsd,
  fetchBnbTokenWithMetrics,
  mergeBnbTradeToken,
} from '../../utils/bnbToken';

const BnbTrades = dynamic(() => import('../../components/trade/BnbTrades'), {
  ssr: false,
});

const BnbTradeActionPanel = dynamic(
  () => import('../../components/trade/BnbTradeActionPanel'),
  { ssr: false },
);

const AX = {
  bg: '#0c0d10',
  surface: '#101114',
  border: '#2A2B33',
  text: '#f0f5f5',
  muted: '#9CA3AF',
  gold: '#F3BA2F',
  goldHover: '#fcd34d',
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

const OHLC_PARAMS = { interval: '1s' as const, timeframe: '30d' as const, optimize: false };

export default function BnbTradePage() {
  const router = useRouter();
  const {
    contractAddress,
    _name,
    _symbol,
    _price,
    _mcap,
    _image,
    _mint,
    _launchpad_protocol,
    _liquidity,
    _created_at,
  } = router.query;

  const { backgroundData: backgroundOHLCData } = useBackgroundOHLCPreload(
    OHLC_PARAMS.interval,
    OHLC_PARAMS.timeframe,
  );

  const [tokenData, setTokenData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedTab, setSelectedTab] = useState('Trades');
  const [showMobileTradeModal, setShowMobileTradeModal] = useState(false);
  const [isClosingModal, setIsClosingModal] = useState(false);
  const [chartMetrics, setChartMetrics] = useState<{
    lastPriceUsd?: number;
    lastMarketCapUsd?: number;
    maxMarketCapUsd?: number;
  }>({});
  const [ohlcCandles, setOhlcCandles] = useState<BnbOhlcItem[] | null>(null);

  const mintAddress = useMemo(() => {
    if (typeof _mint === 'string' && _mint.trim()) return _mint.trim();
    return typeof contractAddress === 'string' ? contractAddress.trim() : '';
  }, [_mint, contractAddress]);

  const optimisticToken = useMemo(() => {
    if (!_name && !_symbol && !_mint && !contractAddress) return null;
    const liqNum = typeof _liquidity === 'string' ? parseFloat(_liquidity) : undefined;
    const liquidity = Number.isFinite(liqNum) ? liqNum : undefined;
    return {
      name: (_name as string) || (_symbol as string) || '',
      symbol: (_symbol as string) || '',
      mint: mintAddress,
      price_usd: _price ? parseFloat(_price as string) : undefined,
      market_cap_usd: _mcap ? parseFloat(_mcap as string) : undefined,
      fully_diluted_value: _mcap ? parseFloat(_mcap as string) : undefined,
      liquidity_usd: liquidity,
      total_liquidity_usd: liquidity,
      image: (_image as string) || undefined,
      launchpad_protocol: (_launchpad_protocol as string) || undefined,
      created_at: (_created_at as string) || undefined,
      _chain: 'bnb',
    };
  }, [_created_at, _image, _launchpad_protocol, _liquidity, _mcap, _mint, _name, _price, _symbol, mintAddress, contractAddress]);

  useEffect(() => {
    if (!router.isReady || !mintAddress) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadToken = async () => {
      setLoading(true);
      try {
        const enriched = await fetchBnbTokenWithMetrics(mintAddress);
        const normalized = enriched
          ? normalizeBscToken({ ...enriched, mint: mintAddress })
          : null;
        const found = mergeBnbTradeToken(optimisticToken, normalized);

        if (!cancelled) {
          setTokenData(found);
        }
      } catch (error) {
        console.error('[BnbTradePage] failed to load token', error);
        if (!cancelled) setTokenData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadToken();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, mintAddress, optimisticToken]);

  const displayToken = useMemo((): any => {
    const base = mergeBnbTradeToken(optimisticToken, tokenData);
    if (!base) return null;
    const marketCap = resolveBnbMarketCapUsd(base);
    return {
      ...base,
      mint: base.mint || mintAddress,
      pair_address: base.pair_address || base.mint || mintAddress,
      market_cap_usd: marketCap ?? base.market_cap_usd,
      fully_diluted_value: marketCap ?? base.fully_diluted_value,
      total_fully_diluted_valuation:
        marketCap ?? base.total_fully_diluted_valuation,
      chart_live_price_usd: chartMetrics.lastPriceUsd ?? null,
      chart_live_market_cap_usd: chartMetrics.lastMarketCapUsd ?? null,
      max_market_cap_usd: chartMetrics.maxMarketCapUsd ?? null,
      _chain: 'bnb',
    };
  }, [chartMetrics, mintAddress, optimisticToken, tokenData]);

  const priorityMarketCapUsd = useMemo(
    () =>
      chartMetrics.lastMarketCapUsd ??
      resolveBnbMarketCapUsd(displayToken) ??
      null,
    [chartMetrics.lastMarketCapUsd, displayToken],
  );

  const circulatingSupply = useMemo(
    () => resolveBnbCirculatingSupply(displayToken) ?? 1_000_000_000,
    [displayToken],
  );

  const seedPriceUsd = useMemo(
    () => resolveBnbPriceUsd(displayToken) ?? null,
    [displayToken],
  );

  const handleChartMetrics = useCallback(
    (metrics: {
      lastPriceUsd?: number;
      lastMarketCapUsd?: number;
      maxMarketCapUsd?: number;
    }) => {
      setChartMetrics(metrics);
    },
    [],
  );

  const handleOhlcUpdate = useCallback((candles: BnbOhlcItem[]) => {
    if (Array.isArray(candles) && candles.length > 0) {
      setOhlcCandles(candles);
    }
  }, []);

  useEffect(() => {
    if (backgroundOHLCData?.length) {
      setOhlcCandles(backgroundOHLCData as BnbOhlcItem[]);
    }
  }, [backgroundOHLCData, mintAddress]);

  const tokenNameForTitle =
    displayToken?.name || displayToken?.symbol || 'BNB Token';

  useEffect(() => {
    const mcap = priorityMarketCapUsd ?? resolveBnbMarketCapUsd(displayToken) ?? null;
    if (!tokenNameForTitle) return;
    if (mcap && mcap > 0) {
      document.title = `${tokenNameForTitle} ${formatMarketCap(mcap)} | BNB Trade`;
    } else {
      document.title = `${tokenNameForTitle} | BNB Trade`;
    }
    return () => {
      document.title = 'Interstate';
    };
  }, [displayToken, priorityMarketCapUsd, tokenNameForTitle]);

  // Resizable chart / tabs split (same pattern as Solana/Monad trade pages)
  const containerRef = useRef<HTMLDivElement | null>(null);
  const MIN_CHART_HEIGHT = 350;
  const DEFAULT_CHART_HEIGHT_RATIO = 0.45;

  const getResponsiveLimits = useCallback(() => {
    if (typeof window === 'undefined') return { min: MIN_CHART_HEIGHT, max: 800 };
    const vh = window.innerHeight;
    const MIN_TOP = Math.max(MIN_CHART_HEIGHT, vh * 0.3);
    const MIN_BOTTOM = 180;
    const MAX_TOP = Math.min(vh * 0.85, vh - MIN_BOTTOM);
    return { min: MIN_TOP, max: MAX_TOP };
  }, []);

  const clampTop = useCallback(
    (desired: number) => {
      const limits = getResponsiveLimits();
      const enforcedMin = Math.max(MIN_CHART_HEIGHT, limits.min);
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
      const maxTop = Math.min(vh - 180, limits.max);
      return Math.max(enforcedMin, Math.min(desired, maxTop));
    },
    [getResponsiveLimits],
  );

  const [topPanePx, setTopPanePx] = useState<number>(() => {
    if (typeof window === 'undefined') return 500;
    const limits = getResponsiveLimits();
    const proposed = Math.max(
      limits.min,
      Math.min(window.innerHeight * DEFAULT_CHART_HEIGHT_RATIO, limits.max),
    );
    const saved = Number(localStorage.getItem('tradeSplitTopPx'));
    if (Number.isFinite(saved) && saved >= limits.min && saved <= limits.max) {
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
    localStorage.setItem('tradeSplitTopPx', String(topPanePx));
  }, [topPanePx]);

  useEffect(() => {
    const handleResize = () => {
      const limits = getResponsiveLimits();
      if (topPanePx < limits.min) setTopPanePx(limits.min);
      else if (topPanePx > limits.max) setTopPanePx(limits.max);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [topPanePx, getResponsiveLimits]);

  const canRenderChart = mintAddress && mintAddress.length >= 20;

  const closeModal = useCallback(() => {
    setIsClosingModal(true);
    setTimeout(() => {
      setShowMobileTradeModal(false);
      setIsClosingModal(false);
    }, 280);
  }, []);

  return (
    <>
      <Head>
        <title>{tokenNameForTitle} | BNB Trade</title>
      </Head>
      <div
        className="flex h-screen w-full flex-col overflow-hidden"
        style={{
          backgroundColor: AX.bg,
          color: AX.text,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif",
        }}
      >
        <Header search={search} setSearch={setSearch} />

        {loading && !displayToken && (
          <div
            className="flex-shrink-0 px-2 py-1.5 text-center text-xs"
            style={{ color: AX.muted }}
          >
            Loading BNB token data…
          </div>
        )}

        <div
          className="flex min-h-0 w-full max-w-full flex-1 overflow-hidden"
          style={{ minHeight: 'calc(100vh - 60px)' }}
        >
          {/* LEFT: chart + tabs */}
          <div
            ref={containerRef}
            className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col pb-0"
            style={{
              borderRight: `1px solid ${AX.border}`,
              backgroundColor: AX.surface,
            }}
          >
            {/* Chart pane */}
            <div
              className="flex flex-shrink-0 flex-col"
              style={{
                height: topPanePx,
                minHeight: `${MIN_CHART_HEIGHT}px`,
                transition: isResizing ? 'none' : 'height 0.2s ease-out',
              }}
            >
              <div className="flex-shrink-0 pl-2">
                <TradeHeader
                  token={displayToken as any}
                  livePriceUsd={chartMetrics.lastPriceUsd}
                  liveMarketCapUsd={priorityMarketCapUsd}
                  circulatingSupply={circulatingSupply}
                />
              </div>

              <div className="mx-3 border-b border-[#2A2B33]" style={{ marginTop: '2px' }} />

              <div
                id="chart-container-wrapper"
                className="chart-wrapper relative min-h-0 w-full flex-1 overflow-hidden"
                style={{ minHeight: 240 }}
              >
                {canRenderChart ? (
                  <AdvancedOHLCChart
                    key={`bnb-chart-${mintAddress}`}
                    mint={mintAddress}
                    pairAddress={displayToken?.pair_address || mintAddress}
                    interval={OHLC_PARAMS.interval}
                    timeframe={OHLC_PARAMS.timeframe}
                    optimize={OHLC_PARAMS.optimize}
                    height="100%"
                    width="100%"
                    baseRefreshMs={10000}
                    className="relative"
                    tokenSymbol={displayToken?.symbol || null}
                    tokenName={displayToken?.name || null}
                    network="bnb"
                    seedPriceUsd={seedPriceUsd ?? undefined}
                    preloadedData={backgroundOHLCData || undefined}
                    onChartMetrics={handleChartMetrics}
                    onDataUpdate={handleOhlcUpdate}
                    circulatingSupply={circulatingSupply}
                  />
                ) : (
                  <div
                    className="flex h-full items-center justify-center"
                    style={{ color: AX.muted }}
                  >
                    Chart data not available for this BNB token
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
                const startY = e.clientY;
                const startTop = topPanePxRef.current;
                (e.target as Element).setPointerCapture(e.pointerId);
                setIsResizing(true);
                document.body.style.cursor = 'row-resize';
                document.body.style.userSelect = 'none';
                const onMove = (ev: PointerEvent) => {
                  ev.preventDefault();
                  setTopPanePx(clampTop(startTop + (ev.clientY - startY)));
                };
                const onUp = () => {
                  (e.target as Element).releasePointerCapture(e.pointerId);
                  setIsResizing(false);
                  document.body.style.cursor = '';
                  document.body.style.userSelect = '';
                  (e.target as Element).removeEventListener('pointermove', onMove);
                  (e.target as Element).removeEventListener('pointerup', onUp);
                  (e.target as Element).removeEventListener('pointercancel', onUp);
                };
                (e.target as Element).addEventListener('pointermove', onMove, { passive: false });
                (e.target as Element).addEventListener('pointerup', onUp, { passive: false });
                (e.target as Element).addEventListener('pointercancel', onUp, { passive: false });
              }}
              className="relative flex h-1.5 flex-shrink-0 cursor-row-resize touch-none select-none items-center justify-center transition-colors hover:bg-gray-800/20"
              style={{ touchAction: 'none', zIndex: 10 }}
            >
              <div className="flex items-center gap-0.5">
                <div className="h-0.5 w-0.5 rounded-full bg-gray-500" />
                <div className="h-0.5 w-0.5 rounded-full bg-gray-500" />
                <div className="h-0.5 w-0.5 rounded-full bg-gray-500" />
              </div>
            </div>

            {/* Tabs pane */}
            <div id="tabs-pane" className="flex min-h-0 flex-1 flex-col">
              <div className="flex-shrink-0">
                <TradeTabs
                  selectedTab={selectedTab}
                  setSelectedTab={setSelectedTab}
                />
              </div>
              <div className="relative min-h-[300px] flex-1">
                <div
                  className={`absolute inset-0 flex flex-col ${selectedTab === 'Trades' ? '' : 'hidden'}`}
                >
                  {canRenderChart && (
                    <BnbTrades tokenAddress={mintAddress} />
                  )}
                </div>
                {selectedTab !== 'Trades' && (
                  <div className="flex h-full items-center justify-center text-xs text-neutral-500">
                    {selectedTab} — coming soon for BNB
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: trade action panel */}
          <div
            className="hidden min-h-0 min-w-[260px] flex-shrink-0 flex-col overflow-y-auto pb-12 md:flex md:basis-[280px] lg:basis-[330px]"
            style={{ backgroundColor: AX.bg }}
          >
            <div className="right-rail-panel token-info-panel">
              {displayToken && (
                <BnbTradeActionPanel
                  token={displayToken}
                  liveMarketCapUsd={priorityMarketCapUsd}
                  livePriceUsd={chartMetrics.lastPriceUsd}
                  ohlcCandles={ohlcCandles}
                />
              )}
            </div>
          </div>
        </div>

        {/* Mobile trade button */}
        {displayToken && (
          <div className="fixed bottom-0 left-0 z-50 mb-10 w-full p-4 md:hidden">
            <button
              type="button"
              className="w-full cursor-pointer rounded-lg p-2.5 text-sm font-semibold text-black"
              style={{ backgroundColor: AX.gold }}
              onClick={() => setShowMobileTradeModal(true)}
            >
              Trade
            </button>
          </div>
        )}

        {/* Mobile trade modal */}
        {showMobileTradeModal && displayToken && (
          <div className="fixed inset-0 z-[100] md:hidden">
            <div
              className={cx(
                'absolute inset-0 bg-black/70 transition-opacity duration-300',
                isClosingModal ? 'opacity-0' : 'opacity-100',
              )}
              onClick={closeModal}
            />
            <div
              className={cx(
                'absolute bottom-0 left-0 right-0 flex max-h-[85vh] flex-col rounded-t-xl bg-[#111214] shadow-2xl',
                isClosingModal ? 'mobile-trade-modal-closing' : 'mobile-trade-modal',
              )}
            >
              <div className="flex justify-center pb-2 pt-3">
                <div className="h-1 w-12 rounded-full bg-[#2A2B33]" />
              </div>
              <div className="flex justify-end px-4 pb-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2A2B33] text-[#9CA3AF] transition-colors hover:bg-[#1E1F26]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <BnbTradeActionPanel
                  token={displayToken}
                  liveMarketCapUsd={priorityMarketCapUsd}
                  livePriceUsd={chartMetrics.lastPriceUsd}
                  ohlcCandles={ohlcCandles}
                />
              </div>
            </div>
          </div>
        )}

        <Footer />
      </div>

      <style jsx global>{`
        .chart-wrapper {
          display: flex;
          flex-direction: column;
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 240px;
        }
        .chart-wrapper > * {
          width: 100%;
          height: 100%;
          flex: 1;
          min-height: 0;
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes slideDown {
          from { transform: translateY(0); }
          to { transform: translateY(100%); }
        }
        .mobile-trade-modal {
          animation: slideUp 0.3s ease-out;
          transition: transform 0.3s ease-out;
        }
        .mobile-trade-modal-closing {
          animation: slideDown 0.3s ease-in;
        }
      `}</style>
    </>
  );
}
