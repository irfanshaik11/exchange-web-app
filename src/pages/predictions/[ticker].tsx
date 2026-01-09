import React, { useState, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
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
import PredictionChart from '~/components/predictions/PredictionChart';
import type { ExtendedPredictionMarket } from '~/hooks/useDFlowMarkets';
import { useUser } from '~/components/UserContext';
import { useTurnkeySigner } from '~/components/TurnkeySignerContext';
import { showEnhancedToast, updateEnhancedToast } from '~/utils/enhancedToast';

// USDC mint on Solana
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Vibrant color palette (matching index page)
const C = {
  bg: "#0a0b0d",
  surface: "#12141a",
  border: "#1e2028",
  text: "#f0f0f0",
  muted: "#6b7280",
  // Vibrant saturated colors
  green: "#4ADE80",
  greenBg: "rgba(74, 222, 128, 0.15)",
  greenBorder: "rgba(74, 222, 128, 0.35)",
  red: "#F87171",
  redBg: "rgba(248, 113, 113, 0.15)",
  redBorder: "rgba(248, 113, 113, 0.35)",
  yellow: "#FBBF24",
  purple: "#818CF8",
  orange: "#FB923C",
  cyan: "#22D3EE",
};

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
const MarketImage: React.FC<{ src?: string; alt: string }> = ({ src, alt }) => {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: C.surface }}>
        <span className="text-2xl font-bold" style={{ color: C.green }}>{alt.charAt(0)}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className="w-full h-full object-cover"
      onError={() => setHasError(true)}
    />
  );
};

export default function MarketDetailPage() {
  const router = useRouter();
  const { ticker } = router.query;
  const tickerString = typeof ticker === 'string' ? ticker : '';

  const [selectedSide, setSelectedSide] = useState<'yes' | 'no'>('yes');
  const [amount, setAmount] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);

  const { user, solBalance, usdcBalance, refreshBalance } = useUser();
  const turnkeySigner = useTurnkeySigner();
  const { market, isLoading, refetch } = useDFlowMarket(tickerString);
  const { trades } = useDFlowTrades(tickerString, { limit: 10, refreshInterval: 15000 });
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

    // Check USDC balance
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
      // Step 1: Get quote
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

      // Step 2: Get swap transaction
      const userPublicKey = user.publicKey;
      if (!userPublicKey) throw new Error('No wallet address');

      const swapResult = await getDFlowSwap({
        quoteResponse: quote,
        userPublicKey,
      });

      if (!swapResult?.swapTransaction) throw new Error('Failed to get swap transaction');

      updateEnhancedToast(toastId, 'loading', 'Please approve transaction...', { title: 'Sign Transaction' });

      // Step 3: Sign transaction with Turnkey
      const { signedTransaction, signature } = await turnkeySigner.requestSignature({
        unsignedTxBase64: swapResult.swapTransaction,
        signerPublicKey: userPublicKey,
      });

      updateEnhancedToast(toastId, 'loading', 'Broadcasting to Solana...', { title: 'Submitting' });

      // Step 4: Broadcast transaction
      await turnkeySigner.broadcastSignedTransaction({
        transaction: signedTransaction,
      });

      updateEnhancedToast(toastId, 'success', `Bought ~${outAmount.toFixed(2)} ${selectedSide.toUpperCase()} tokens`, { title: 'Trade Success!' });

      // Clear form and refresh balance
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.bg }}>
        <HiOutlineRefresh className="w-6 h-6 animate-spin" style={{ color: C.green }} />
      </div>
    );
  }

  if (!market) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: C.bg }}>
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="mb-4" style={{ color: C.muted }}>Market not found</p>
            <Link href="/predictions" className="px-4 py-2 rounded-lg" style={{ backgroundColor: C.green, color: '#000' }}>
              Back
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const isActive = market.status === 'active';
  const isResolved = market.status === 'resolved';

  return (
    <>
      <Head>
        <title>{market.title} | Interstate</title>
      </Head>

      <div className="min-h-screen flex flex-col" style={{ backgroundColor: C.bg }}>
        <Header />

        <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6">
          {/* Back button */}
          <Link href="/predictions" className="inline-flex items-center gap-2 mb-6 text-sm hover:opacity-70" style={{ color: C.muted }}>
            <HiOutlineArrowLeft className="w-4 h-4" />
            <span>Markets</span>
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left - Market Info */}
            <div className="lg:col-span-2 space-y-4">
              {/* Header Card */}
              <div className="rounded-xl p-5" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
                <div className="flex gap-4 mb-4">
                  <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: C.bg }}>
                    <MarketImage src={market.imageUrl} alt={market.title} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-lg font-semibold mb-1" style={{ color: C.text }}>{market.title}</h1>
                    {market.subtitle && <p className="text-sm" style={{ color: C.muted }}>{market.subtitle}</p>}
                  </div>
                </div>

                {/* Status & Time */}
                <div className="flex items-center gap-3 text-xs" style={{ color: C.muted }}>
                  <span className="font-mono">{market.ticker}</span>
                  <span>•</span>
                  {isResolved ? (
                    <span style={{ color: market.result === 'yes' ? C.green : C.red }}>
                      Resolved {market.result?.toUpperCase()}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <HiOutlineClock className="w-3.5 h-3.5" />
                      {formatTimeRemaining(market.closesAt)}
                    </span>
                  )}
                </div>
              </div>

              {/* Prices */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSelectedSide('yes')}
                  className="rounded-xl p-4 text-left transition-all"
                  style={{
                    backgroundColor: selectedSide === 'yes' ? C.greenBg : C.surface,
                    border: `2px solid ${selectedSide === 'yes' ? C.green : C.border}`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <HiOutlineCheckCircle className="w-5 h-5" style={{ color: C.green }} />
                    <span className="text-sm font-medium" style={{ color: C.green }}>YES</span>
                  </div>
                  <div className="text-3xl font-bold" style={{ color: C.green }}>
                    {Math.round(currentYesPrice * 100)}¢
                  </div>
                  {(realtimePrices.yesBid != null || market.yesBid != null) && (
                    <div className="text-xs mt-1" style={{ color: C.muted }}>
                      {realtimePrices.yesBid ?? market.yesBid}¢ / {realtimePrices.yesAsk ?? market.yesAsk}¢
                    </div>
                  )}
                </button>

                <button
                  onClick={() => setSelectedSide('no')}
                  className="rounded-xl p-4 text-left transition-all"
                  style={{
                    backgroundColor: selectedSide === 'no' ? C.redBg : C.surface,
                    border: `2px solid ${selectedSide === 'no' ? C.red : C.border}`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <HiOutlineXCircle className="w-5 h-5" style={{ color: C.red }} />
                    <span className="text-sm font-medium" style={{ color: C.red }}>NO</span>
                  </div>
                  <div className="text-3xl font-bold" style={{ color: C.red }}>
                    {Math.round(currentNoPrice * 100)}¢
                  </div>
                  {(realtimePrices.noBid != null || market.noBid != null) && (
                    <div className="text-xs mt-1" style={{ color: C.muted }}>
                      {realtimePrices.noBid ?? market.noBid}¢ / {realtimePrices.noAsk ?? market.noAsk}¢
                    </div>
                  )}
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: '24h Volume', value: formatVolume(market.volume24h || 0) },
                  { label: 'Total Volume', value: formatVolume(market.totalVolume || 0) },
                  { label: 'Open Interest', value: formatOpenInterest(market.openInterest || 0) },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-lg p-3" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
                    <div className="text-xs mb-1" style={{ color: C.muted }}>{stat.label}</div>
                    <div className="text-sm font-semibold" style={{ color: C.text }}>{stat.value}</div>
                  </div>
                ))}
              </div>

              {/* Rules */}
              {(market.rulesPrimary || market.settlementSources) && (
                <div className="rounded-xl p-4" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
                  <h3 className="text-sm font-medium mb-3" style={{ color: C.text }}>Resolution</h3>
                  {market.rulesPrimary && (
                    <p className="text-sm mb-3" style={{ color: C.muted }}>{market.rulesPrimary}</p>
                  )}
                  {market.settlementSources && market.settlementSources.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {market.settlementSources.map((source, idx) => (
                        <a
                          key={idx}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded hover:opacity-80"
                          style={{ backgroundColor: C.bg, color: C.green }}
                        >
                          <HiOutlineExternalLink className="w-3 h-3" />
                          {source.name}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Solana Accounts */}
              {market.accounts && Object.keys(market.accounts).length > 0 && (
                <div className="rounded-xl p-4" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
                  <h3 className="text-sm font-medium mb-3" style={{ color: C.text }}>Token Addresses</h3>
                  {Object.entries(market.accounts).map(([collateral, acc]) => (
                    <div key={collateral} className="space-y-2">
                      {[
                        { label: 'YES Token', value: acc.yesMint, color: C.green },
                        { label: 'NO Token', value: acc.noMint, color: C.red },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="flex items-center justify-between text-xs">
                          <span style={{ color: C.muted }}>{label}</span>
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

              {/* Order Book */}
              {orderBook && (orderBook.yesBids.length > 0 || orderBook.noBids.length > 0) ? (
                <div className="rounded-xl p-4" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
                  <h3 className="text-sm font-medium mb-3" style={{ color: C.text }}>Order Book</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {/* YES Bids */}
                    <div>
                      <div className="text-xs font-medium mb-2" style={{ color: C.green }}>YES Bids</div>
                      <div className="space-y-1">
                        {orderBook.yesBids.slice(0, 5).map((bid, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span style={{ color: C.green }}>{(bid.price * 100).toFixed(0)}¢</span>
                            <span style={{ color: C.muted }}>{bid.size.toLocaleString()}</span>
                          </div>
                        ))}
                        {orderBook.yesBids.length === 0 && (
                          <span className="text-xs" style={{ color: C.muted }}>No bids</span>
                        )}
                      </div>
                    </div>
                    {/* NO Bids */}
                    <div>
                      <div className="text-xs font-medium mb-2" style={{ color: C.red }}>NO Bids</div>
                      <div className="space-y-1">
                        {orderBook.noBids.slice(0, 5).map((bid, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span style={{ color: C.red }}>{(bid.price * 100).toFixed(0)}¢</span>
                            <span style={{ color: C.muted }}>{bid.size.toLocaleString()}</span>
                          </div>
                        ))}
                        {orderBook.noBids.length === 0 && (
                          <span className="text-xs" style={{ color: C.muted }}>No bids</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : isResolved ? (
                <div className="rounded-xl p-4" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
                  <h3 className="text-sm font-medium mb-2" style={{ color: C.text }}>Order Book</h3>
                  <p className="text-xs" style={{ color: C.muted }}>
                    Order book unavailable for resolved markets
                  </p>
                </div>
              ) : null}

              {/* Price Chart */}
              <div className="rounded-xl overflow-hidden" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
                <div className="p-4 pb-2">
                  <h3 className="text-sm font-medium" style={{ color: C.text }}>Price History</h3>
                </div>
                {historyLoading ? (
                  <div className="flex items-center justify-center py-12" style={{ backgroundColor: C.bg }}>
                    <HiOutlineRefresh className="w-5 h-5 animate-spin" style={{ color: C.muted }} />
                  </div>
                ) : isResolved ? (
                  <div className="flex items-center justify-center py-12" style={{ backgroundColor: C.bg }}>
                    <p className="text-xs" style={{ color: C.muted }}>Price history unavailable for resolved markets</p>
                  </div>
                ) : (
                  <PredictionChart
                    ticker={tickerString}
                    yesPrice={currentYesPrice}
                    noPrice={currentNoPrice}
                    height="250px"
                    priceHistory={chartPriceHistory}
                  />
                )}
              </div>

              {/* Recent Trades */}
              {trades && trades.length > 0 ? (
                <div className="rounded-xl p-4" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
                  <h3 className="text-sm font-medium mb-3" style={{ color: C.text }}>Recent Trades</h3>
                  <div className="space-y-2">
                    {trades.slice(0, 8).map((trade) => (
                      <div
                        key={trade.tradeId}
                        className="flex items-center justify-between text-xs py-1.5 border-b"
                        style={{ borderColor: C.border }}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase"
                            style={{
                              backgroundColor: trade.takerSide === 'yes' ? C.greenBg : C.redBg,
                              color: trade.takerSide === 'yes' ? C.green : C.red,
                            }}
                          >
                            {trade.takerSide}
                          </span>
                          <span style={{ color: C.text }}>{trade.count.toLocaleString()}</span>
                          <span style={{ color: C.muted }}>@</span>
                          <span style={{ color: trade.takerSide === 'yes' ? C.green : C.red }}>
                            {trade.price}¢
                          </span>
                        </div>
                        <span style={{ color: C.muted }}>
                          {new Date(trade.createdTime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl p-4" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
                  <h3 className="text-sm font-medium mb-2" style={{ color: C.text }}>Recent Trades</h3>
                  <p className="text-xs" style={{ color: C.muted }}>
                    {isResolved ? 'No recent trades for resolved markets' : 'No trades yet'}
                  </p>
                </div>
              )}
            </div>

            {/* Right - Trade Panel */}
            <div className="lg:col-span-1">
              <div className="rounded-xl p-4 lg:sticky lg:top-20" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
                {/* Wallet & Balances */}
                {user ? (
                  <div className="rounded-lg mb-4 overflow-hidden" style={{ backgroundColor: C.bg, border: `1px solid ${C.border}` }}>
                    {/* Address row */}
                    <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: C.border }}>
                      <div className="flex items-center gap-2">
                        <BiWallet className="w-4 h-4" style={{ color: C.green }} />
                        <span className="text-xs font-mono" style={{ color: C.muted }}>
                          {user.publicKey.slice(0, 4)}...{user.publicKey.slice(-4)}
                        </span>
                      </div>
                      <button
                        onClick={() => { navigator.clipboard.writeText(user.publicKey); }}
                        className="text-xs hover:opacity-70 flex items-center gap-1"
                        style={{ color: C.green }}
                      >
                        <BiCopy className="w-3 h-3" />
                        Copy
                      </button>
                    </div>
                    {/* Balances row */}
                    <div className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xs" style={{ color: solBalance < 0.01 ? C.yellow : C.muted }}>
                          {solBalance.toFixed(4)} SOL
                        </span>
                        <span style={{ color: C.border }}>•</span>
                        <span className="text-xs font-medium" style={{ color: usdcBalance > 0 ? C.text : C.muted }}>
                          {(usdcBalance || 0).toFixed(2)} USDC
                        </span>
                      </div>
                    </div>
                    {/* Low balance warnings */}
                    {(solBalance < 0.01 || usdcBalance < 1) && (
                      <div className="px-3 pb-3">
                        {solBalance < 0.01 && (
                          <div className="flex items-center gap-2 text-xs p-2 rounded" style={{ backgroundColor: `${C.yellow}15`, color: C.yellow }}>
                            <HiOutlineExclamation className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>Low SOL for tx fees. Deposit SOL to trade.</span>
                          </div>
                        )}
                        {usdcBalance < 1 && solBalance >= 0.01 && (
                          <div className="flex items-center gap-2 text-xs p-2 rounded mt-2" style={{ backgroundColor: `${C.yellow}15`, color: C.yellow }}>
                            <HiOutlineExclamation className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>Deposit USDC to place trades.</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg p-4 mb-4 text-center" style={{ backgroundColor: C.bg, border: `1px solid ${C.border}` }}>
                    <BiWallet className="w-6 h-6 mx-auto mb-2" style={{ color: C.muted }} />
                    <p className="text-sm mb-1" style={{ color: C.text }}>Connect Wallet to Trade</p>
                    <p className="text-xs" style={{ color: C.muted }}>You'll need SOL (for fees) + USDC (to trade)</p>
                  </div>
                )}

                {/* Selected */}
                <div
                  className="flex items-center justify-between p-3 rounded-lg mb-4"
                  style={{
                    backgroundColor: selectedSide === 'yes' ? C.greenBg : C.redBg,
                    border: `1px solid ${selectedSide === 'yes' ? C.greenBorder : C.redBorder}`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    {selectedSide === 'yes' ? (
                      <HiOutlineCheckCircle className="w-5 h-5" style={{ color: C.green }} />
                    ) : (
                      <HiOutlineXCircle className="w-5 h-5" style={{ color: C.red }} />
                    )}
                    <span className="font-medium" style={{ color: selectedSide === 'yes' ? C.green : C.red }}>
                      {selectedSide.toUpperCase()}
                    </span>
                  </div>
                  <span className="font-bold" style={{ color: selectedSide === 'yes' ? C.green : C.red }}>
                    {Math.round(selectedPrice * 100)}¢
                  </span>
                </div>

                {/* Amount Input */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs" style={{ color: C.muted }}>Amount</span>
                    {user && usdcBalance > 0 && (
                      <button
                        onClick={() => setAmount(Math.floor(usdcBalance).toString())}
                        className="text-xs hover:opacity-70"
                        style={{ color: C.green }}
                      >
                        Max
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.muted }}>$</span>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => { setAmount(e.target.value); setTradeError(null); }}
                      placeholder="0"
                      className="w-full pl-7 pr-3 py-3 rounded-lg text-lg font-semibold outline-none"
                      style={{ backgroundColor: C.bg, border: `1px solid ${C.border}`, color: C.text }}
                    />
                  </div>
                </div>

                {/* Quick amounts */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {[10, 25, 50, 100].map((qa) => (
                    <button
                      key={qa}
                      onClick={() => { setAmount(qa.toString()); setTradeError(null); }}
                      className="py-2 rounded-lg text-sm"
                      style={{
                        backgroundColor: amount === qa.toString() ? C.green : C.bg,
                        color: amount === qa.toString() ? '#000' : C.muted,
                        border: `1px solid ${amount === qa.toString() ? C.green : C.border}`,
                      }}
                    >
                      ${qa}
                    </button>
                  ))}
                </div>

                {/* Payout Preview */}
                {amountNumber > 0 && (
                  <div className="p-3 rounded-lg mb-4 space-y-2" style={{ backgroundColor: C.bg }}>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: C.muted }}>You pay</span>
                      <span style={{ color: C.text }}>{formatUSDC(amountNumber)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: C.muted }}>Payout if wins</span>
                      <span style={{ color: C.green }}>{formatUSDC(potentialPayout)}</span>
                    </div>
                  </div>
                )}

                {/* Error */}
                {tradeError && (
                  <div className="flex items-center gap-2 p-2 rounded-lg mb-4" style={{ backgroundColor: C.redBg }}>
                    <HiOutlineExclamation className="w-4 h-4" style={{ color: C.red }} />
                    <span className="text-xs" style={{ color: C.red }}>{tradeError}</span>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  onClick={handleSubmit}
                  disabled={!isActive || amountNumber <= 0 || isSubmitting}
                  className="w-full py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all"
                  style={{
                    backgroundColor: !isActive ? C.bg : amountNumber > 0 ? C.green : C.bg,
                    color: !isActive ? C.muted : amountNumber > 0 ? '#000' : C.muted,
                    border: `1px solid ${!isActive ? C.border : amountNumber > 0 ? C.green : C.border}`,
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

                {!user && (
                  <p className="text-center text-xs mt-3" style={{ color: C.muted }}>
                    Connect wallet to place trades
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="h-20" />
        </main>

        <Footer />
      </div>
    </>
  );
}
