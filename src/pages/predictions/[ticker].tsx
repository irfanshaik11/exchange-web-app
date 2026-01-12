import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  HiOutlineArrowLeft,
  HiOutlineClock,
  HiOutlineRefresh,
  HiOutlineExternalLink,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineLightningBolt,
  HiOutlineExclamation,
} from 'react-icons/hi';
import { BiWallet, BiCopy } from 'react-icons/bi';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { useDFlowMarket, useDFlowTrades, useDFlowOrderBook, useDFlowPriceHistory, useDFlowRealtimePrices, formatVolume, formatOpenInterest, getDFlowQuote, getDFlowSwap } from '~/hooks/useDFlowMarkets';
import type { ExtendedPredictionMarket } from '~/hooks/useDFlowMarkets';
import { useUser } from '~/components/UserContext';
import { useTurnkeySigner } from '~/components/TurnkeySignerContext';
import { showEnhancedToast, updateEnhancedToast } from '~/utils/enhancedToast';

// Lazy load heavy components
const PredictionPositions = dynamic(() => import('~/components/predictions/PredictionPositions'), { ssr: false });
const TradingViewPredictionChart = dynamic(() => import('~/components/predictions/TradingViewPredictionChart'), { ssr: false });

// USDC mint on Solana
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/* ---------- AXIOM palette (matching token trade page) ---------- */
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
  // Prediction-specific colors
  green: "#4ADE80",
  greenBg: "rgba(74, 222, 128, 0.15)",
  greenBorder: "rgba(74, 222, 128, 0.35)",
  red: "#F87171",
  redBg: "rgba(248, 113, 113, 0.15)",
  redBorder: "rgba(248, 113, 113, 0.35)",
  yellow: "#FBBF24",
  purple: "#818CF8",
};

// Prediction-specific tabs (Order Book is now inline with chart)
const PREDICTION_TABS = ['Trades', 'Positions'];

// Helpers
const copyToClipboard = (text: string) => navigator.clipboard.writeText(text);

const formatTimeRemaining = (closesAt: string): string => {
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0) return "Closed";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const formatUSDC = (amount: number): string => {
  return `${amount.toFixed(2)} USDC`;
};

// Market Image with fallback
const MarketImage: React.FC<{ src?: string; alt: string; size?: 'sm' | 'md' | 'lg' }> = ({ src, alt, size = 'md' }) => {
  const [hasError, setHasError] = useState(false);
  const sizeClasses = { sm: 'w-8 h-8', md: 'w-10 h-10', lg: 'w-14 h-14' };

  if (!src || hasError) {
    return (
      <div className={`${sizeClasses[size]} rounded-lg flex items-center justify-center`} style={{ backgroundColor: AX.surface }}>
        <span className="text-sm font-bold" style={{ color: AX.mint }}>{alt.charAt(0)}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`${sizeClasses[size]} rounded-lg object-cover`}
      onError={() => setHasError(true)}
    />
  );
};

// Prediction Header Component (similar to TradeHeader)
const PredictionHeader: React.FC<{ market: ExtendedPredictionMarket; yesPrice: number; noPrice: number }> = ({ market, yesPrice, noPrice }) => {
  const isActive = market.status === 'active';
  const isResolved = market.status === 'resolved';

  return (
    <div className="flex items-center justify-between py-2">
      {/* Left side - Market info */}
      <div className="flex items-center gap-3">
        <Link href="/predictions" className="flex items-center gap-1.5 text-sm hover:opacity-70" style={{ color: AX.muted }}>
          <HiOutlineArrowLeft className="w-4 h-4" />
        </Link>

        <MarketImage src={market.imageUrl} alt={market.title} size="md" />

        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm" style={{ color: AX.text }}>{market.title}</span>
            <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: AX.surface, color: AX.muted }}>
              {market.ticker}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: AX.muted }}>
            {isResolved ? (
              <span style={{ color: market.result === 'yes' ? AX.green : AX.red }}>
                Resolved {market.result?.toUpperCase()}
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <HiOutlineClock className="w-3.5 h-3.5" />
                {formatTimeRemaining(market.closesAt)}
              </span>
            )}
            {market.subtitle && (
              <>
                <span>•</span>
                <span className="truncate max-w-[200px]">{market.subtitle}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right side - Prices */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ backgroundColor: AX.greenBg, border: `1px solid ${AX.greenBorder}` }}>
            <HiOutlineCheckCircle className="w-4 h-4" style={{ color: AX.green }} />
            <span className="text-sm font-bold" style={{ color: AX.green }}>
              YES {Math.round(yesPrice * 100)}¢
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ backgroundColor: AX.redBg, border: `1px solid ${AX.redBorder}` }}>
            <HiOutlineXCircle className="w-4 h-4" style={{ color: AX.red }} />
            <span className="text-sm font-bold" style={{ color: AX.red }}>
              NO {Math.round(noPrice * 100)}¢
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Prediction Tabs Component (similar to TradeTabs)
const PredictionTabs: React.FC<{
  selectedTab: string;
  setSelectedTab: (tab: string) => void;
}> = ({ selectedTab, setSelectedTab }) => {
  return (
    <div className="flex gap-4 pt-2 text-xs items-center">
      {PREDICTION_TABS.map(tab => (
        <button
          key={tab}
          className={`px-3 py-1 font-semibold ${selectedTab === tab ? 'border-b-4 border-[#70E0B0] text-white' : 'text-neutral-400'}`}
          onClick={() => setSelectedTab(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
};

// Trades Table Component
const TradesTable: React.FC<{ trades: any[]; isLoading: boolean }> = ({ trades, isLoading }) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <HiOutlineRefresh className="w-5 h-5 animate-spin" style={{ color: AX.muted }} />
      </div>
    );
  }

  if (!trades || trades.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm" style={{ color: AX.muted }}>No trades yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr style={{ borderBottom: `1px solid ${AX.border}` }}>
            <th className="text-left py-2 px-3 font-medium" style={{ color: AX.muted }}>Side</th>
            <th className="text-right py-2 px-3 font-medium" style={{ color: AX.muted }}>Price</th>
            <th className="text-right py-2 px-3 font-medium" style={{ color: AX.muted }}>Amount</th>
            <th className="text-right py-2 px-3 font-medium" style={{ color: AX.muted }}>Time</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => (
            <tr key={trade.tradeId} style={{ borderBottom: `1px solid ${AX.border}` }}>
              <td className="py-2 px-3">
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase"
                  style={{
                    backgroundColor: trade.takerSide === 'yes' ? AX.greenBg : AX.redBg,
                    color: trade.takerSide === 'yes' ? AX.green : AX.red,
                  }}
                >
                  {trade.takerSide}
                </span>
              </td>
              <td className="py-2 px-3 text-right" style={{ color: trade.takerSide === 'yes' ? AX.green : AX.red }}>
                {trade.price}¢
              </td>
              <td className="py-2 px-3 text-right" style={{ color: AX.text }}>
                {trade.count.toLocaleString()}
              </td>
              <td className="py-2 px-3 text-right" style={{ color: AX.muted }}>
                {new Date(trade.createdTime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default function MarketDetailPage() {
  const router = useRouter();
  const { ticker } = router.query;
  const tickerString = typeof ticker === 'string' ? ticker : '';

  const [selectedTab, setSelectedTab] = useState("Trades");
  const [selectedSide, setSelectedSide] = useState<'yes' | 'no'>('yes');
  const [amount, setAmount] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showMobileTradeModal, setShowMobileTradeModal] = useState(false);
  const [isClosingModal, setIsClosingModal] = useState(false);

  // Resizable chart state (matching token trade page)
  const containerRef = useRef<HTMLDivElement | null>(null);
  const MIN_CHART_HEIGHT = 300;
  const DEFAULT_CHART_HEIGHT_RATIO = 0.55;
  const SSR_DEFAULT_CHART_HEIGHT = 400;

  const getResponsiveLimits = useCallback(() => {
    if (typeof window === "undefined") return { min: MIN_CHART_HEIGHT, max: 600 };
    const vh = window.innerHeight;
    const MIN_TOP = Math.max(MIN_CHART_HEIGHT, vh * 0.25);
    const MIN_BOTTOM = 180;
    const MAX_TOP = Math.min(vh * 0.7, vh - MIN_BOTTOM);
    return { min: MIN_TOP, max: MAX_TOP };
  }, []);

  const clampTop = useCallback((desired: number) => {
    const limits = getResponsiveLimits();
    const enforcedMin = Math.max(MIN_CHART_HEIGHT, limits.min);
    const vh = typeof window !== "undefined" ? window.innerHeight : 600;
    const maxTop = Math.min(vh - 180, limits.max);
    return Math.max(enforcedMin, Math.min(desired, maxTop));
  }, [getResponsiveLimits]);

  const [topPanePx, setTopPanePx] = useState<number>(() => {
    if (typeof window === "undefined") return Math.max(MIN_CHART_HEIGHT, SSR_DEFAULT_CHART_HEIGHT);
    const limits = getResponsiveLimits();
    const proposed = Math.max(limits.min, Math.min(window.innerHeight * DEFAULT_CHART_HEIGHT_RATIO, limits.max));
    const saved = Number(localStorage.getItem("predictionSplitTopPx"));
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
    localStorage.setItem("predictionSplitTopPx", String(topPanePx));
  }, [topPanePx]);

  // Data hooks
  const { user, solBalance, usdcBalance, refreshBalance } = useUser();
  const turnkeySigner = useTurnkeySigner();
  const { market, isLoading, refetch } = useDFlowMarket(tickerString);
  const { trades, isLoading: tradesLoading } = useDFlowTrades(tickerString, { limit: 50, refreshInterval: 15000 });
  const { orderBook } = useDFlowOrderBook(tickerString, { refreshInterval: 5000 });
  const { history: priceHistory, isLoading: historyLoading } = useDFlowPriceHistory(tickerString, { period: 'week', refreshInterval: 60000 });
  const realtimePrices = useDFlowRealtimePrices(tickerString);

  // Use real-time prices when available, fallback to market data
  const currentYesPrice = realtimePrices.yesBid != null && realtimePrices.yesAsk != null
    ? (realtimePrices.yesBid + realtimePrices.yesAsk) / 2 / 100
    : market?.yesPrice || 0.5;
  const currentNoPrice = realtimePrices.noBid != null && realtimePrices.noAsk != null
    ? (realtimePrices.noBid + realtimePrices.noAsk) / 2 / 100
    : market?.noPrice || 0.5;

  // Transform price history for the chart
  const chartPriceHistory = priceHistory.length > 0
    ? priceHistory.map(p => ({ time: p.timestamp, price: p.yesPrice }))
    : undefined;

  // Transform order book for the chart component
  const orderBookForChart = useMemo(() => {
    if (!orderBook) return null;
    return {
      yesBids: orderBook.yesBids || [],
      yesAsks: orderBook.yesAsks || [],
      noBids: orderBook.noBids || [],
      noAsks: orderBook.noAsks || [],
    };
  }, [orderBook]);

  const amountNumber = parseFloat(amount) || 0;
  const selectedPrice = selectedSide === 'yes' ? currentYesPrice : currentNoPrice;
  const tokensReceived = amountNumber > 0 ? amountNumber / selectedPrice : 0;
  const potentialPayout = tokensReceived;

  // Get the mint address for the selected outcome
  const getOutcomeMint = useCallback(() => {
    if (!market?.accounts) return null;
    const usdcAccount = market.accounts[USDC_MINT];
    if (!usdcAccount) return null;
    return selectedSide === 'yes' ? usdcAccount.yesMint : usdcAccount.noMint;
  }, [market, selectedSide]);

  const handleSubmit = async () => {
    if (amountNumber <= 0) return;
    if (!user) {
      setTradeError('Connect wallet to trade');
      return;
    }

    if (usdcBalance !== undefined && amountNumber > usdcBalance) {
      setTradeError(`Insufficient USDC balance (${usdcBalance.toFixed(2)} available)`);
      return;
    }

    const outcomeMint = getOutcomeMint();
    if (!outcomeMint) {
      setTradeError('Market not available');
      return;
    }

    if (!turnkeySigner) {
      setTradeError('Wallet signer not ready');
      return;
    }

    setIsSubmitting(true);
    setTradeError(null);

    const toastId = showEnhancedToast('loading', `Getting quote...`, { title: `Buy ${selectedSide.toUpperCase()}` });

    try {
      const amountInMicroUsdc = Math.floor(amountNumber * 1_000_000);
      const quote = await getDFlowQuote({
        inputMint: USDC_MINT,
        outputMint: outcomeMint,
        amount: amountInMicroUsdc,
        slippageBps: 100,
      });

      if (!quote) throw new Error('Failed to get quote');

      const outAmount = parseInt(quote.outAmount) / 1_000_000;
      updateEnhancedToast(toastId, 'loading', `~${outAmount.toFixed(2)} tokens, preparing tx...`, { title: 'Quote Ready' });

      const userPublicKey = user.publicKey;
      if (!userPublicKey) throw new Error('No wallet address');

      const swapResult = await getDFlowSwap({
        quoteResponse: quote,
        userPublicKey,
      });

      if (!swapResult?.swapTransaction) throw new Error('Failed to get swap transaction');

      updateEnhancedToast(toastId, 'loading', 'Please approve transaction...', { title: 'Sign Transaction' });

      const { signedTransaction, signature } = await turnkeySigner.requestSignature({
        unsignedTxBase64: swapResult.swapTransaction,
        signerPublicKey: userPublicKey,
      });

      updateEnhancedToast(toastId, 'loading', 'Broadcasting to Solana...', { title: 'Submitting' });

      await turnkeySigner.broadcastSignedTransaction({
        transaction: signedTransaction,
      });

      updateEnhancedToast(toastId, 'success', `Bought ~${outAmount.toFixed(2)} ${selectedSide.toUpperCase()} tokens`, { title: 'Trade Success!' });

      setAmount('');
      await refreshBalance?.();
    } catch (err) {
      console.error('[Prediction Trade Error]', err);
      const errorMessage = err instanceof Error ? err.message : 'Trade failed';
      updateEnhancedToast(toastId, 'error', errorMessage, { title: 'Trade Failed' });
      setTradeError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeModal = useCallback(() => {
    setIsClosingModal(true);
    setTimeout(() => {
      setShowMobileTradeModal(false);
      setIsClosingModal(false);
    }, 300);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: AX.bg }}>
        <HiOutlineRefresh className="w-6 h-6 animate-spin" style={{ color: AX.mint }} />
      </div>
    );
  }

  if (!market) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: AX.bg }}>
        <Header search={search} setSearch={setSearch} />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="mb-4" style={{ color: AX.muted }}>Market not found</p>
            <Link href="/predictions" className="px-4 py-2 rounded-lg" style={{ backgroundColor: AX.mint, color: '#000' }}>
              Back to Markets
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const isActive = market.status === 'active';
  const isResolved = market.status === 'resolved';
  const pageTitle = `${market.title} | Predictions`;

  return (
    <>
      <Head><title>{pageTitle}</title></Head>

      <div
        className="min-h-screen w-full flex flex-col overflow-y-auto"
        style={{
          backgroundColor: "#0f1012",
          color: AX.text,
          fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Inter\", system-ui, sans-serif",
        }}
      >
        <Header search={search} setSearch={setSearch} />

        <div
          className="flex flex-1 w-full max-w-full min-h-0"
          style={{
            minHeight: 'calc(100vh - 60px)',
            flex: '1 1 auto',
          }}
        >
          {/* LEFT: chart + tabs */}
          <div
            ref={containerRef}
            className="flex-1 min-w-0 max-w-full flex flex-col pb-0"
            style={{
              borderRight: `1px solid ${AX.border}`,
              minHeight: 0,
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
              <div className="px-3 flex-shrink-0">
                <PredictionHeader market={market} yesPrice={currentYesPrice} noPrice={currentNoPrice} />
              </div>

              {/* Separator line */}
              <div className="px-3 border-b border-[#2A2B33]" style={{ marginTop: '2px' }} />

              {/* Chart with inline Order Book - always visible */}
              <div
                className="flex-1 min-h-[200px] relative w-full overflow-hidden"
                style={{ height: '100%', width: '100%', position: 'relative', minHeight: 0, minWidth: 0 }}
              >
                {historyLoading ? (
                  <div className="flex items-center justify-center h-full" style={{ backgroundColor: AX.bg }}>
                    <HiOutlineRefresh className="w-5 h-5 animate-spin" style={{ color: AX.muted }} />
                  </div>
                ) : (
                  <TradingViewPredictionChart
                    ticker={tickerString}
                    marketTitle={market.title}
                    yesPrice={currentYesPrice}
                    noPrice={currentNoPrice}
                    height="100%"
                    priceHistory={chartPriceHistory}
                    orderBook={orderBookForChart}
                    isResolved={isResolved}
                    resolvedResult={market.result as 'yes' | 'no' | null}
                  />
                )}
              </div>
            </div>

            {/* Resizer */}
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize chart and content panels"
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
                  const delta = ev.clientY - startY;
                  const newHeight = clampTop(startTop + delta);
                  setTopPanePx(newHeight);
                  topPanePxRef.current = newHeight;
                };

                const onUp = () => {
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

            {/* BOTTOM pane (tabs + content) */}
            <div className="flex-1 flex flex-col min-h-[400px]">
              <div className="flex-shrink-0 px-3">
                <PredictionTabs selectedTab={selectedTab} setSelectedTab={setSelectedTab} />
              </div>
              <div className="flex-1 min-h-[300px] overflow-auto">
                <div className={`flex flex-col h-full ${selectedTab === "Trades" ? "" : "hidden"}`}>
                  <TradesTable trades={trades || []} isLoading={tradesLoading} />
                </div>
                <div className={`flex flex-col h-full ${selectedTab === "Positions" ? "" : "hidden"}`}>
                  <React.Suspense fallback={<div className="flex items-center justify-center h-full"><HiOutlineRefresh className="w-5 h-5 animate-spin" style={{ color: AX.muted }} /></div>}>
                    <PredictionPositions userPublicKey={user?.publicKey} />
                  </React.Suspense>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Trade Action Panel */}
          <div className="flex-shrink-0 min-w-[260px] basis-[280px] md:basis-[310px] lg:basis-[330px] hidden lg:flex flex-col">
            <div className="p-3 flex-1 overflow-auto">
              {/* Trade Panel */}
              <div className="rounded-xl p-4" style={{ backgroundColor: AX.surface, border: `1px solid ${AX.border}` }}>
                {/* Wallet & Balances */}
                {user ? (
                  <div className="rounded-lg mb-4 overflow-hidden" style={{ backgroundColor: AX.bg, border: `1px solid ${AX.border}` }}>
                    <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: AX.border }}>
                      <div className="flex items-center gap-2">
                        <BiWallet className="w-4 h-4" style={{ color: AX.mint }} />
                        <span className="text-xs font-mono" style={{ color: AX.muted }}>
                          {user.publicKey.slice(0, 4)}...{user.publicKey.slice(-4)}
                        </span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(user.publicKey)}
                        className="text-xs hover:opacity-70 flex items-center gap-1"
                        style={{ color: AX.mint }}
                      >
                        <BiCopy className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xs" style={{ color: solBalance < 0.01 ? AX.yellow : AX.muted }}>
                          {solBalance.toFixed(4)} SOL
                        </span>
                        <span style={{ color: AX.border }}>•</span>
                        <span className="text-xs font-medium" style={{ color: usdcBalance > 0 ? AX.text : AX.muted }}>
                          {(usdcBalance || 0).toFixed(2)} USDC
                        </span>
                      </div>
                    </div>
                    {(solBalance < 0.01 || usdcBalance < 1) && (
                      <div className="px-3 pb-3">
                        {solBalance < 0.01 && (
                          <div className="flex items-center gap-2 text-xs p-2 rounded" style={{ backgroundColor: `${AX.yellow}15`, color: AX.yellow }}>
                            <HiOutlineExclamation className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>Low SOL for tx fees</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg p-4 mb-4 text-center" style={{ backgroundColor: AX.bg, border: `1px solid ${AX.border}` }}>
                    <BiWallet className="w-6 h-6 mx-auto mb-2" style={{ color: AX.muted }} />
                    <p className="text-sm mb-1" style={{ color: AX.text }}>Connect Wallet</p>
                    <p className="text-xs" style={{ color: AX.muted }}>SOL (fees) + USDC (trade)</p>
                  </div>
                )}

                {/* Side Selection */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <button
                    onClick={() => setSelectedSide('yes')}
                    className="py-3 rounded-lg flex items-center justify-center gap-2 transition-all"
                    style={{
                      backgroundColor: selectedSide === 'yes' ? AX.greenBg : AX.bg,
                      border: `2px solid ${selectedSide === 'yes' ? AX.green : AX.border}`,
                    }}
                  >
                    <HiOutlineCheckCircle className="w-5 h-5" style={{ color: AX.green }} />
                    <span className="font-bold" style={{ color: AX.green }}>YES</span>
                    <span className="text-sm" style={{ color: AX.green }}>{Math.round(currentYesPrice * 100)}¢</span>
                  </button>
                  <button
                    onClick={() => setSelectedSide('no')}
                    className="py-3 rounded-lg flex items-center justify-center gap-2 transition-all"
                    style={{
                      backgroundColor: selectedSide === 'no' ? AX.redBg : AX.bg,
                      border: `2px solid ${selectedSide === 'no' ? AX.red : AX.border}`,
                    }}
                  >
                    <HiOutlineXCircle className="w-5 h-5" style={{ color: AX.red }} />
                    <span className="font-bold" style={{ color: AX.red }}>NO</span>
                    <span className="text-sm" style={{ color: AX.red }}>{Math.round(currentNoPrice * 100)}¢</span>
                  </button>
                </div>

                {/* Amount Input */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs" style={{ color: AX.muted }}>Amount (USDC)</span>
                    {user && usdcBalance > 0 && (
                      <button
                        onClick={() => setAmount(Math.floor(usdcBalance).toString())}
                        className="text-xs hover:opacity-70"
                        style={{ color: AX.mint }}
                      >
                        Max
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: AX.muted }}>$</span>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => { setAmount(e.target.value); setTradeError(null); }}
                      placeholder="0"
                      className="w-full pl-7 pr-3 py-3 rounded-lg text-lg font-semibold outline-none"
                      style={{ backgroundColor: AX.bg, border: `1px solid ${AX.border}`, color: AX.text }}
                    />
                  </div>
                </div>

                {/* Quick amounts */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {[10, 25, 50, 100].map((qa) => (
                    <button
                      key={qa}
                      onClick={() => { setAmount(qa.toString()); setTradeError(null); }}
                      className="py-2 rounded-lg text-sm transition-colors"
                      style={{
                        backgroundColor: amount === qa.toString() ? AX.mint : AX.bg,
                        color: amount === qa.toString() ? '#000' : AX.muted,
                        border: `1px solid ${amount === qa.toString() ? AX.mint : AX.border}`,
                      }}
                    >
                      ${qa}
                    </button>
                  ))}
                </div>

                {/* Payout Preview */}
                {amountNumber > 0 && (
                  <div className="p-3 rounded-lg mb-4 space-y-2" style={{ backgroundColor: AX.bg }}>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: AX.muted }}>You pay</span>
                      <span style={{ color: AX.text }}>{formatUSDC(amountNumber)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: AX.muted }}>Payout if wins</span>
                      <span style={{ color: AX.mint }}>{formatUSDC(potentialPayout)}</span>
                    </div>
                  </div>
                )}

                {/* Error */}
                {tradeError && (
                  <div className="flex items-center gap-2 p-2 rounded-lg mb-4" style={{ backgroundColor: AX.redBg }}>
                    <HiOutlineExclamation className="w-4 h-4" style={{ color: AX.red }} />
                    <span className="text-xs" style={{ color: AX.red }}>{tradeError}</span>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  onClick={handleSubmit}
                  disabled={!isActive || amountNumber <= 0 || isSubmitting}
                  className="w-full py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all"
                  style={{
                    backgroundColor: !isActive ? AX.bg : amountNumber > 0 ? AX.mint : AX.bg,
                    color: !isActive ? AX.muted : amountNumber > 0 ? '#000' : AX.muted,
                    border: `1px solid ${!isActive ? AX.border : amountNumber > 0 ? AX.mint : AX.border}`,
                    cursor: isActive && amountNumber > 0 && !isSubmitting ? 'pointer' : 'not-allowed',
                    opacity: isSubmitting ? 0.6 : 1,
                  }}
                >
                  {isSubmitting ? (
                    <HiOutlineRefresh className="w-5 h-5 animate-spin" />
                  ) : !isActive ? (
                    'Market Closed'
                  ) : !user ? (
                    <>
                      <BiWallet className="w-5 h-5" />
                      Login to Trade
                    </>
                  ) : (
                    <>
                      <HiOutlineLightningBolt className="w-5 h-5" />
                      Buy {selectedSide.toUpperCase()}
                    </>
                  )}
                </button>
              </div>

              {/* Market Stats */}
              <div className="mt-3 rounded-xl p-4" style={{ backgroundColor: AX.surface, border: `1px solid ${AX.border}` }}>
                <h3 className="text-xs font-semibold mb-3" style={{ color: AX.text }}>Market Stats</h3>
                <div className="space-y-2">
                  {[
                    { label: '24h Volume', value: formatVolume(market.volume24h || 0) },
                    { label: 'Total Volume', value: formatVolume(market.totalVolume || 0) },
                    { label: 'Open Interest', value: formatOpenInterest(market.openInterest || 0) },
                  ].map((stat) => (
                    <div key={stat.label} className="flex justify-between text-xs">
                      <span style={{ color: AX.muted }}>{stat.label}</span>
                      <span style={{ color: AX.text }}>{stat.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Resolution Rules */}
              {(market.rulesPrimary || market.settlementSources) && (
                <div className="mt-3 rounded-xl p-4" style={{ backgroundColor: AX.surface, border: `1px solid ${AX.border}` }}>
                  <h3 className="text-xs font-semibold mb-2" style={{ color: AX.text }}>Resolution</h3>
                  {market.rulesPrimary && (
                    <p className="text-xs mb-2" style={{ color: AX.muted }}>{market.rulesPrimary}</p>
                  )}
                  {market.settlementSources && market.settlementSources.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {market.settlementSources.map((source, idx) => (
                        <a
                          key={idx}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded hover:opacity-80"
                          style={{ backgroundColor: AX.bg, color: AX.mint }}
                        >
                          <HiOutlineExternalLink className="w-3 h-3" />
                          {source.name}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Token Addresses */}
              {market.accounts && Object.keys(market.accounts).length > 0 && (
                <div className="mt-3 rounded-xl p-4" style={{ backgroundColor: AX.surface, border: `1px solid ${AX.border}` }}>
                  <h3 className="text-xs font-semibold mb-2" style={{ color: AX.text }}>Token Addresses</h3>
                  {Object.entries(market.accounts).map(([collateral, acc]) => (
                    <div key={collateral} className="space-y-1">
                      {[
                        { label: 'YES', value: acc.yesMint, color: AX.green },
                        { label: 'NO', value: acc.noMint, color: AX.red },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="flex items-center justify-between text-xs">
                          <span style={{ color: AX.muted }}>{label}</span>
                          <button
                            onClick={() => copyToClipboard(value)}
                            className="flex items-center gap-1 font-mono hover:opacity-70"
                            style={{ color }}
                          >
                            {value.slice(0, 4)}...{value.slice(-4)}
                            <BiCopy className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Trade button for mobile */}
          <div className="fixed bottom-0 left-0 w-full p-4 z-50 lg:hidden mb-10">
            <button
              className="w-full py-3 rounded-lg font-semibold"
              style={{ backgroundColor: AX.mint, color: '#000' }}
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
          <div
            className={`absolute inset-0 bg-black/70 transition-opacity duration-300 ${isClosingModal ? "opacity-0" : "opacity-100"}`}
            onClick={closeModal}
          />
          <div
            className={`absolute bottom-0 left-0 right-0 rounded-t-xl shadow-2xl max-h-[85vh] flex flex-col ${isClosingModal ? "mobile-trade-modal-closing" : "mobile-trade-modal"}`}
            style={{ backgroundColor: AX.bg }}
          >
            <div className="flex justify-center pt-3 pb-2 cursor-grab">
              <div className="w-12 h-1 rounded-full" style={{ backgroundColor: AX.border }} />
            </div>
            <div className="flex justify-end pr-4 pb-2">
              <button
                onClick={closeModal}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                style={{ backgroundColor: AX.surface, color: AX.muted }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {/* Mobile trade form - similar to desktop */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  onClick={() => setSelectedSide('yes')}
                  className="py-3 rounded-lg flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: selectedSide === 'yes' ? AX.greenBg : AX.surface,
                    border: `2px solid ${selectedSide === 'yes' ? AX.green : AX.border}`,
                  }}
                >
                  <HiOutlineCheckCircle className="w-5 h-5" style={{ color: AX.green }} />
                  <span className="font-bold" style={{ color: AX.green }}>YES {Math.round(currentYesPrice * 100)}¢</span>
                </button>
                <button
                  onClick={() => setSelectedSide('no')}
                  className="py-3 rounded-lg flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: selectedSide === 'no' ? AX.redBg : AX.surface,
                    border: `2px solid ${selectedSide === 'no' ? AX.red : AX.border}`,
                  }}
                >
                  <HiOutlineXCircle className="w-5 h-5" style={{ color: AX.red }} />
                  <span className="font-bold" style={{ color: AX.red }}>NO {Math.round(currentNoPrice * 100)}¢</span>
                </button>
              </div>

              <div className="relative mb-4">
                <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: AX.muted }}>$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setTradeError(null); }}
                  placeholder="0"
                  className="w-full pl-7 pr-3 py-3 rounded-lg text-lg font-semibold outline-none"
                  style={{ backgroundColor: AX.surface, border: `1px solid ${AX.border}`, color: AX.text }}
                />
              </div>

              <div className="grid grid-cols-4 gap-2 mb-4">
                {[10, 25, 50, 100].map((qa) => (
                  <button
                    key={qa}
                    onClick={() => setAmount(qa.toString())}
                    className="py-2 rounded-lg text-sm"
                    style={{
                      backgroundColor: amount === qa.toString() ? AX.mint : AX.surface,
                      color: amount === qa.toString() ? '#000' : AX.muted,
                    }}
                  >
                    ${qa}
                  </button>
                ))}
              </div>

              {amountNumber > 0 && (
                <div className="p-3 rounded-lg mb-4 space-y-2" style={{ backgroundColor: AX.surface }}>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: AX.muted }}>Payout if wins</span>
                    <span style={{ color: AX.mint }}>{formatUSDC(potentialPayout)}</span>
                  </div>
                </div>
              )}

              {tradeError && (
                <div className="flex items-center gap-2 p-2 rounded-lg mb-4" style={{ backgroundColor: AX.redBg }}>
                  <HiOutlineExclamation className="w-4 h-4" style={{ color: AX.red }} />
                  <span className="text-xs" style={{ color: AX.red }}>{tradeError}</span>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!isActive || amountNumber <= 0 || isSubmitting}
                className="w-full py-3 rounded-lg font-semibold flex items-center justify-center gap-2"
                style={{
                  backgroundColor: isActive && amountNumber > 0 ? AX.mint : AX.surface,
                  color: isActive && amountNumber > 0 ? '#000' : AX.muted,
                  opacity: isSubmitting ? 0.6 : 1,
                }}
              >
                {isSubmitting ? (
                  <HiOutlineRefresh className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <HiOutlineLightningBolt className="w-5 h-5" />
                    Buy {selectedSide.toUpperCase()}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />

      <style jsx global>{`
        .mobile-trade-modal { animation: slideUp 0.3s ease-out; }
        .mobile-trade-modal-closing { animation: slideDown 0.3s ease-in; }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slideDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
      `}</style>
    </>
  );
}
