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
import useBnbHoldersRest from '../../hooks/useBnbHoldersRest';
import useBnbTradeHeaderMetrics from '../../hooks/useBnbTradeHeaderMetrics';
import useBnbTradeVolumeStats from '../../hooks/useBnbTradeVolumeStats';
import { formatMarketCap } from '../../utils/formatPrice';
import {
  normalizeBscToken,
} from '../../hooks/useBscPulseWebSocket';
import {
  type BnbOhlcItem,
  resolveBnbCirculatingSupply,
  resolveBnbMarketCapUsd,
  resolveBnbPriceUsd,
  fetchBnbTokenWithMetrics,
  mergeBnbTradeToken,
  resolveBnbTradeMint,
  buildBnbDetailPatch,
  applyBnbDetailPatch,
} from '../../utils/bnbToken';

const BnbTrades = dynamic(() => import('../../components/trade/BnbTrades'), {
  ssr: false,
});

const BnbTopTradersTable = dynamic(() => import('../../components/trade/BnbTopTradersTable'), {
  ssr: false,
});

const BnbHoldersTable = dynamic(() => import('../../components/trade/BnbHoldersTable'), {
  ssr: false,
});

const BnbDevTokensTable = dynamic(() => import('../../components/trade/BnbDevTokensTable'), {
  ssr: false,
});

const TokenLimitOrders = dynamic(() => import('../../components/trade/TokenLimitOrders'), {
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
  const [devTokensCount, setDevTokensCount] = useState<number | undefined>(undefined);
  const [holdersTabCount, setHoldersTabCount] = useState<number | undefined>(undefined);
  const [showMobileTradeModal, setShowMobileTradeModal] = useState(false);
  const [isClosingModal, setIsClosingModal] = useState(false);
  const [chartMetrics, setChartMetrics] = useState<{
    lastPriceUsd?: number;
    lastMarketCapUsd?: number;
    maxMarketCapUsd?: number;
  }>({});
  const [ohlcCandles, setOhlcCandles] = useState<BnbOhlcItem[] | null>(null);

  const mintAddress = useMemo(
    () => resolveBnbTradeMint(router.query, router.asPath),
    [router.query, router.asPath],
  );

  const { totalHolders: restHoldersCount } = useBnbHoldersRest(mintAddress, {
    enabled: Boolean(mintAddress),
  });

  const {
    holderCount: headerHolderCount,
    devTokensCreated,
    devTokensMigrated,
    kolCount,
  } = useBnbTradeHeaderMetrics(mintAddress, {
    enabled: Boolean(mintAddress),
    holderCountOverride: restHoldersCount,
  });

  const { statsByWindow: tradeVolumeStats } = useBnbTradeVolumeStats(mintAddress, {
    enabled: Boolean(mintAddress),
  });

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
    const optimisticRef = optimisticToken;

    const loadToken = async (showLoading = false) => {
      if (showLoading) setLoading(true);
      try {
        const enriched = await fetchBnbTokenWithMetrics(mintAddress);
        const detailPatch = enriched
          ? applyBnbDetailPatch(buildBnbDetailPatch({ ...enriched, mint: mintAddress }, mintAddress))
          : null;
        const normalized = enriched
          ? normalizeBscToken({ ...enriched, ...detailPatch, mint: mintAddress })
          : null;
        const found = mergeBnbTradeToken(optimisticRef, normalized);

        if (!cancelled) {
          setTokenData(found);
        }
      } catch (error) {
        console.error('[BnbTradePage] failed to load token', error);
        if (!cancelled) setTokenData(null);
      } finally {
        if (!cancelled && showLoading) setLoading(false);
      }
    };

    void loadToken(true);
    const refreshId = setInterval(() => {
      void loadToken(false);
    }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(refreshId);
    };
  }, [router.isReady, mintAddress]);

  const displayToken = useMemo((): any => {
    const withDetail = mergeBnbTradeToken(optimisticToken, tokenData);
    if (!withDetail) return null;

    const volumePatch: Record<string, number> = {};
    for (const window of ['5m', '1h', '6h', '24h'] as const) {
      const stats = tradeVolumeStats?.[window];
      if (!stats) continue;
      volumePatch[`total_buys_${window}`] = stats.buys;
      volumePatch[`total_sells_${window}`] = stats.sells;
      volumePatch[`total_buy_volume_${window}`] = stats.buyVolume;
      volumePatch[`total_sell_volume_${window}`] = stats.sellVolume;
    }

    const base = { ...withDetail, ...volumePatch };
    const marketCap = resolveBnbMarketCapUsd(base);
    return {
      ...base,
      mint: base.mint || mintAddress,
      pair_address: base.pair_address || base.mint || mintAddress,
      market_cap_usd: marketCap ?? base.market_cap_usd,
      fully_diluted_value: marketCap ?? base.fully_diluted_value,
      total_fully_diluted_valuation:
        marketCap ?? base.total_fully_diluted_valuation,
      dev_tokens_created: devTokensCreated,
      dev_tokens_migrated: devTokensMigrated,
      kol_count: kolCount,
      holder_count: headerHolderCount ?? base.holder_count,
      total_holders: headerHolderCount ?? base.total_holders,
      chart_live_price_usd: chartMetrics.lastPriceUsd ?? null,
      chart_live_market_cap_usd: chartMetrics.lastMarketCapUsd ?? null,
      max_market_cap_usd: chartMetrics.maxMarketCapUsd ?? null,
      _chain: 'bnb',
    };
  }, [
    chartMetrics,
    devTokensCreated,
    devTokensMigrated,
    headerHolderCount,
    kolCount,
    mintAddress,
    optimisticToken,
    tokenData,
    tradeVolumeStats,
  ]);

  const bnbWsTokenInfo = useMemo(
    () => ({
      name: displayToken?.name,
      symbol: displayToken?.symbol,
      mint: mintAddress,
      created_at: displayToken?.created_at || displayToken?.launch_time,
      dev_tokens_created: devTokensCreated,
      dev_tokens_migrated: devTokensMigrated,
    }),
    [
      displayToken?.created_at,
      displayToken?.launch_time,
      displayToken?.name,
      displayToken?.symbol,
      devTokensCreated,
      devTokensMigrated,
      mintAddress,
    ],
  );

  const bnbHolderSummary = useMemo(
    () => ({
      kol_count: kolCount,
      total_holders: headerHolderCount,
    }),
    [headerHolderCount, kolCount],
  );

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
      setChartMetrics((prev) => {
        if (
          prev?.lastPriceUsd === metrics.lastPriceUsd &&
          prev?.lastMarketCapUsd === metrics.lastMarketCapUsd &&
          prev?.maxMarketCapUsd === metrics.maxMarketCapUsd
        ) {
          return prev;
        }
        return metrics;
      });
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

  const canRenderChart = Boolean(mintAddress) && /^0x[a-f0-9]{40}$/.test(mintAddress);

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
                  wsTokenInfo={bnbWsTokenInfo as any}
                  holderSummary={bnbHolderSummary as any}
                  restHoldersCount={headerHolderCount ?? restHoldersCount}
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
                    {!mintAddress ? 'Loading chart…' : 'Chart data not available for this BNB token'}
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
                  holdersCount={holdersTabCount ?? headerHolderCount ?? restHoldersCount}
                  devTokensCount={devTokensCount}
                />
              </div>
              <div className="relative min-h-[300px] flex-1">
                {selectedTab === 'Trades' && (
                  <div className="absolute inset-0 flex flex-col">
                    {canRenderChart && (
                      <BnbTrades tokenAddress={mintAddress} />
                    )}
                  </div>
                )}
                {selectedTab === 'Holders' && (
                  <div className="absolute inset-0 flex flex-col">
                    {canRenderChart && (
                      <BnbHoldersTable
                        tokenAddress={mintAddress}
                        onTotalCountChange={setHoldersTabCount}
                      />
                    )}
                  </div>
                )}
                {selectedTab === 'Top Traders' && (
                  <div className="absolute inset-0 flex flex-col">
                    {canRenderChart && (
                      <BnbTopTradersTable tokenAddress={mintAddress} />
                    )}
                  </div>
                )}
                {selectedTab === 'Dev Tokens' && (
                  <div className="absolute inset-0 flex flex-col">
                    {canRenderChart && (
                      <BnbDevTokensTable
                        tokenAddress={mintAddress}
                        onTotalCountChange={setDevTokensCount}
                      />
                    )}
                  </div>
                )}
                {selectedTab === 'Orders' && (
                  <div className="absolute inset-0 flex flex-col">
                    {canRenderChart && (
                      <TokenLimitOrders
                        chain="bnb"
                        liveMarketCapUsd={priorityMarketCapUsd}
                        currentTokenAddress={mintAddress}
                      />
                    )}
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
                  tradeVolumeStats={tradeVolumeStats}
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
                  tradeVolumeStats={tradeVolumeStats}
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
