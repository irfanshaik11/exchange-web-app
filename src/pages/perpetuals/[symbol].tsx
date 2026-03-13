// src/pages/perpetuals/[symbol].tsx
// Hyperliquid perpetual futures trade page.
// 3-column layout: LEFT (header + chart + tabs), MIDDLE (order book), RIGHT (trade panel)
// Pattern: follows trade/[id].tsx and trade/monad/[contractAddress].tsx

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import dynamic from "next/dynamic";
import Header from "../../components/Header";
import PerpHeader from "../../components/perpetuals/PerpHeader";
import OrderBookTradesPanel from "../../components/perpetuals/OrderBookTradesPanel";
import PerpTradePanel from "../../components/perpetuals/PerpTradePanel";
import PerpTabs from "../../components/perpetuals/PerpTabs";
import PerpPositionModal from "../../components/perpetuals/PerpPositionModal";
import { useHyperliquid } from "../../contexts/HyperliquidContext";
import { useHyperliquidOrderBook } from "../../hooks/useHyperliquidOrderBook";
import { useHyperliquidTrades } from "../../hooks/useHyperliquidTrades";
import { useHyperliquidCandles } from "../../hooks/useHyperliquidCandles";
import { useHyperliquidPositions } from "../../hooks/useHyperliquidPositions";
import { useUser } from "../../components/UserContext";
import { fetchOpenOrders, fetchTradeHistory, cancelOrder, closePosition } from "../../utils/hyperliquidApi";
import type { HyperliquidOHLCItem } from "../../hooks/useHyperliquidCandles";
import type { HyperliquidOpenOrder, HyperliquidFill, HyperliquidPositionRow } from "../../utils/hyperliquidTypes";

// Dynamically import perp chart (clean TradingView widget for USD price display)
const PerpChart = dynamic(
  () => import("../../components/perpetuals/PerpChart"),
  { ssr: false }
);

/* ---------- AXIOM palette (matches trade/[id].tsx) ---------- */
const AX = {
  bg: "#111214",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#f0f5f5",
  muted: "#9CA3AF",
  mint: "#70E0B0",
  mintHover: "#58B890",
  sell: "#FF4D7F",
};

const MIN_CHART_HEIGHT = 240;

export default function PerpTradePage() {
  const router = useRouter();
  const { symbol } = router.query;
  const coin = typeof symbol === "string" ? symbol.toUpperCase() : undefined;

  const { user } = useUser();
  const bearerToken = user?.bearerToken;
  const { markets, activateMarkets, getMarketBySymbol } = useHyperliquid();

  // Activate market data on mount
  useEffect(() => {
    activateMarkets();
  }, [activateMarkets]);

  const market = useMemo(
    () => (coin ? getMarketBySymbol(coin) : undefined),
    [coin, getMarketBySymbol]
  );

  // ============ Market Data Hooks ============

  const orderBook = useHyperliquidOrderBook({ coin, enabled: !!coin });
  const trades = useHyperliquidTrades({ coin, enabled: !!coin });
  const { candles, loading: candlesLoading } = useHyperliquidCandles({
    coin,
    interval: "1h",
    enabled: !!coin,
  });

  // ============ User Data ============

  const { positions, marginSummary, refresh: refreshPositions } = useHyperliquidPositions({
    token: bearerToken,
    enabled: !!bearerToken,
  });

  const [openOrders, setOpenOrders] = useState<HyperliquidOpenOrder[]>([]);
  const [tradeHistory, setTradeHistory] = useState<HyperliquidFill[]>([]);

  useEffect(() => {
    if (!bearerToken) return;

    fetchOpenOrders(bearerToken).then((data: any) => setOpenOrders(data || [])).catch(() => {});
    fetchTradeHistory(bearerToken).then((data: any) => setTradeHistory(data || [])).catch(() => {});
  }, [bearerToken]);

  // ============ Interactions ============

  const [selectedPrice, setSelectedPrice] = useState<string>("");
  const [selectedPosition, setSelectedPosition] = useState<HyperliquidPositionRow | null>(null);
  const [showMobileTradePanel, setShowMobileTradePanel] = useState(false);
  const [isClosingModal, setIsClosingModal] = useState(false);
  const [orderBookCollapsed, setOrderBookCollapsed] = useState(false);

  const handlePriceClick = useCallback((price: string) => {
    setSelectedPrice(price);
  }, []);

  const handleClosePosition = useCallback(
    async (closeCoin: string, percentage: number) => {
      if (!bearerToken) return;
      try {
        await closePosition(bearerToken, closeCoin, percentage);
        refreshPositions();
      } catch (err) {
        console.error("Close position failed:", err);
      }
    },
    [bearerToken, refreshPositions]
  );

  const handleCancelOrder = useCallback(
    async (cancelCoin: string, oid: number) => {
      if (!bearerToken) return;
      try {
        await cancelOrder(bearerToken, cancelCoin, oid);
        const updated = await fetchOpenOrders(bearerToken);
        setOpenOrders((updated as any) || []);
      } catch (err) {
        console.error("Cancel order failed:", err);
      }
    },
    [bearerToken]
  );

  const handleOrderPlaced = useCallback(() => {
    refreshPositions();
    if (bearerToken) {
      fetchOpenOrders(bearerToken).then((data: any) => setOpenOrders(data || [])).catch(() => {});
      fetchTradeHistory(bearerToken).then((data: any) => setTradeHistory(data || [])).catch(() => {});
    }
  }, [bearerToken, refreshPositions]);

  // Convert candles to preloadedData format for chart
  const preloadedChartData = useMemo(() => {
    if (!candles?.length) return undefined;
    return candles.map((c: HyperliquidOHLCItem) => ({
      unix_time: c.unix_time,
      o: c.o,
      h: c.h,
      l: c.l,
      c: c.c,
      v_usd: c.v_usd,
    }));
  }, [candles]);

  const accountValue = marginSummary
    ? parseFloat(marginSummary.accountValue || "0")
    : 0;

  const closeModal = useCallback(() => {
    setIsClosingModal(true);
    setTimeout(() => {
      setShowMobileTradePanel(false);
      setIsClosingModal(false);
    }, 300);
  }, []);

  return (
    <>
      <Head>
        <title>{coin ? `${coin}-PERP` : "Perpetuals"} | Interstate</title>
      </Head>

      <div
        className="min-h-screen w-full flex flex-col overflow-y-auto"
        style={{
          backgroundColor: AX.bg,
          color: AX.text,
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif',
        }}
      >
        <Header />

        <div
          className="flex flex-1 w-full max-w-full min-h-0"
          style={{
            minHeight: 'calc(100vh - 60px)',
            flex: '1 1 auto',
          }}
        >
          {/* LEFT + MIDDLE: Chart area with order book beside it */}
          <div
            className="flex-1 min-w-0 max-w-full flex flex-col"
            style={{ minHeight: 0 }}
          >
            {/* TOP ROW: Header + Chart + Order Book (side by side) */}
            <div
              className="flex-shrink-0 flex"
              style={{
                height: '55vh',
                minHeight: `${MIN_CHART_HEIGHT}px`,
              }}
            >
              {/* Chart column */}
              <div className="flex-1 min-w-0 flex flex-col">
                <div className="pl-2 flex-shrink-0">
                  <PerpHeader market={market} markPrice={orderBook.midPrice} />
                </div>

                <div
                  className="flex-1 relative w-full overflow-hidden"
                  style={{ minHeight: 0, minWidth: 0 }}
                >
                  {coin && (
                    <PerpChart
                      coin={coin}
                      tokenName={`${coin}-PERP`}
                      preloadedData={preloadedChartData}
                      height="100%"
                      width="100%"
                    />
                  )}
                </div>
              </div>

              {/* Order Book / Trades panel — collapsible, same height as chart (desktop only) */}
              <div
                className="hidden lg:flex flex-shrink-0 relative"
                style={{ borderLeft: `1px solid ${AX.border}` }}
              >
                {/* Collapse / Expand toggle */}
                <button
                  onClick={() => setOrderBookCollapsed((p) => !p)}
                  className="absolute -left-2.5 top-1/2 -translate-y-1/2 z-20 w-[18px] h-9 rounded flex items-center justify-center transition-colors hover:bg-[#2A2B33]"
                  style={{ backgroundColor: AX.surface2, border: `1px solid ${AX.border}` }}
                  title={orderBookCollapsed ? "Show Order Book" : "Hide Order Book"}
                >
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={AX.muted}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      transform: orderBookCollapsed ? "rotate(0deg)" : "rotate(180deg)",
                      transition: "transform 200ms ease",
                    }}
                  >
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>

                <div
                  className="flex flex-col overflow-hidden transition-all duration-200"
                  style={{ width: orderBookCollapsed ? 0 : 280 }}
                >
                  {!orderBookCollapsed && (
                    <OrderBookTradesPanel
                      orderBook={orderBook}
                      trades={trades}
                      onPriceClick={handlePriceClick}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* BOTTOM pane: Tabs + Tables */}
            <div
              className="flex-1 flex flex-col min-h-[260px]"
              style={{ borderTop: `1px solid ${AX.border}` }}
            >
              <PerpTabs
                positions={positions}
                openOrders={openOrders}
                tradeHistory={tradeHistory}
                onClosePosition={handleClosePosition}
                onCancelOrder={handleCancelOrder}
                onSelectPosition={(c) => {
                  const pos = positions.find((p) => p.coin === c);
                  if (pos) setSelectedPosition(pos);
                }}
              />
            </div>
          </div>

          {/* RIGHT: Trade Panel (desktop) */}
          <div
            className="flex-shrink-0 hidden lg:flex flex-col overflow-y-auto"
            style={{
              width: 340,
              borderLeft: `1px solid ${AX.border}`,
            }}
          >
            <PerpTradePanel
              market={market}
              markPrice={orderBook.midPrice || market?.markPx || 0}
              accountValue={accountValue}
              token={bearerToken}
              onOrderPlaced={handleOrderPlaced}
              initialPrice={selectedPrice}
            />
          </div>
        </div>

        {/* MOBILE: Fixed bottom trade button */}
        <div className="fixed bottom-0 left-0 w-full p-4 z-50 lg:hidden mb-10">
          <button
            className="w-full py-3 rounded-lg font-bold text-sm text-black"
            style={{ backgroundColor: AX.mint }}
            onClick={() => setShowMobileTradePanel(true)}
          >
            Trade {coin}
          </button>
        </div>

        {/* MOBILE: Slide-up trade panel */}
        {showMobileTradePanel && (
          <div className="fixed inset-0 z-[100] lg:hidden">
            <div
              className={`absolute inset-0 bg-black/70 transition-opacity duration-300 ${isClosingModal ? "opacity-0" : "opacity-100"}`}
              onClick={closeModal}
            />
            <div
              className={`absolute bottom-0 left-0 right-0 rounded-t-xl shadow-2xl max-h-[85vh] flex flex-col ${isClosingModal ? "mobile-trade-modal-closing" : "mobile-trade-modal"}`}
              style={{ backgroundColor: AX.bg, touchAction: "none" }}
            >
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-12 h-1 rounded-full" style={{ backgroundColor: AX.border }} />
              </div>
              <div className="flex justify-end pr-4 pb-2">
                <button
                  onClick={closeModal}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                  style={{ backgroundColor: AX.border, color: AX.muted }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <PerpTradePanel
                  market={market}
                  markPrice={orderBook.midPrice || market?.markPx || 0}
                  accountValue={accountValue}
                  token={bearerToken}
                  onOrderPlaced={() => {
                    handleOrderPlaced();
                    closeModal();
                  }}
                  initialPrice={selectedPrice}
                />
              </div>
            </div>
          </div>
        )}

        {/* Position Detail Modal */}
        <PerpPositionModal
          position={selectedPosition}
          token={bearerToken}
          onClose={() => setSelectedPosition(null)}
          onPositionClosed={refreshPositions}
        />
      </div>
    </>
  );
}
