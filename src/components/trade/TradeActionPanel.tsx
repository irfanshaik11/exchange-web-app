"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from "react";
import { createPortal } from "react-dom";
import { LuPencil, LuCheck, LuArrowLeftRight } from "react-icons/lu";
import { formatSmartNumber, formatMarketCap, type Token } from "~/utils/db";
import { useQuickBuy } from "~/components/QuickBuyContext";
import { FaRunning, FaGasPump, FaCoins, FaBan, FaCopy, FaExternalLinkAlt, FaTrophy, FaDice, FaUsers, FaChartBar, FaCrown, FaCrosshairs, FaFire, FaWallet, FaCheck } from "react-icons/fa";
import InterstateTooltip from "../InterstateTooltip";
import QuickBuy from "../QuickBuy";
import { createLimitOrder, tradeBuy, tradeSellPercentage, getLimitOrderExecutionResult, SOL_MINT_ADDRESS, ApiError } from "~/utils/api";
import {
  addPendingTrade,
  removePendingTrade,
  updatePendingTrade,
} from "~/utils/pendingTradeMarkers";
import { getTradeActivityByUser } from "~/utils/functions";
import toast, { type ToastOptions } from "react-hot-toast";
import {
  showCenteredErrorToast,
} from "~/utils/toast";
import { executeEnhancedTrade } from "~/utils/enhancedTradeHandler";
import { showEnhancedToast } from "~/utils/enhancedToast";
import { showOrderToast, ORDER_TOAST_STYLE } from "~/utils/tradeToast";
import { useUser } from "~/components/UserContext";
import { executeSolanaMultiBuy, formatSolanaTxSummary, buildSolanaWalletAllocations } from "~/utils/solanaWalletAllocation";
import { validateSolanaBuy, validateSolanaSell, showTradeValidationError } from "~/utils/preTradeValidation";
import { checkAtaExists, getCachedAtaExists, prefetchAtaCheck } from "~/utils/ataCheck";
import { useTxHashCallback } from "~/contexts/SolanaPositionWebSocketContext";
import type { SolanaTokenVolume, FirstBuyer, FirstBuyersSummary } from "~/hooks/useSolanaTokenWebSocket";
import { extractTokenImage, getResolvedTokenImage, resolveTokenImage } from "~/utils/images";
import { SiSolana } from "react-icons/si";

import { getPoolTypeFromToken } from "~/utils/poolTypeDetection";
import { mapTradeErrorMessage } from "~/utils/tradeErrorMessages";
import { listenForTradeEvents, transformToastToError } from "~/utils/createSolanaToastHandler";
import { broadcastTradeCompleted, notifyTradePending } from "~/utils/tradeEvents";
import { dispatchBalanceRefresh } from "~/utils/balanceEvents";
import { useSolPrice } from "../SolPriceContext";
import HighSlippageWarningDialog from "../HighSlippageWarningDialog";
import LowLiquidityWarningDialog from "../LowLiquidityWarningDialog";
import { BsCoin, BsPersonGear } from "react-icons/bs";
import { RiGhostLine } from "react-icons/ri";
import { LuChefHat } from "react-icons/lu";
import { BiCandles } from "react-icons/bi";
import { usePrefetchOrder } from "~/hooks/usePrefetchOrder";
import posthog from "posthog-js";
// import TokenAnalyticsPanel from "../TokenAnalyticsPanel";

type TimeRange = "5m" | "1h" | "6h" | "24h";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ---- style palette ---- */
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
  aiGreen: "#14b080",
  red: "#f25561",
};

const baseBtn =
  "inline-flex items-center justify-center font-semibold rounded-full transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgb(112_224_176_/_0.4)]";

const tabBtn =
  "pb-1.5 text-[11px] tracking-wide uppercase font-semibold text-[#9CA3AF] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgb(112_224_176_/_0.3)]";

/* helpers */
const num = (v: any) => (typeof v === "number" ? v : 0);
const allowDecimal = (v: string) => /^\d*([.]\d{0,9})?$/.test(v);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const LOW_LIQUIDITY_WARNING_THRESHOLD = 1_000; // USD
const HIGH_SLIPPAGE_WARNING_THRESHOLD = 50; // Percent
const LIMIT_ORDER_TOLERANCE_BPS = Number(process.env.NEXT_PUBLIC_LIMIT_ORDER_TOLERANCE_BPS ?? "100");
const TOKEN_SERVICE_URL = (process.env.NEXT_PUBLIC_TOKEN_SERVICE_URL || "").replace(/\/$/, "");
const LIMIT_ORDER_STATUS_EVENT = "limit-order-update";

/** Normalize a raw order entity from createLimitOrder response into the shape getUserLimitOrders returns */
function normalizeOrderForEvent(rawOrder: any) {
  if (!rawOrder) return undefined;
  return {
    id: String(rawOrder.id),
    tokenAddress: rawOrder.tokenAddress,
    pairAddress: rawOrder.pairAddress ?? null,
    type: rawOrder.type,
    direction: rawOrder.direction,
    targetMC: Number(rawOrder.targetMC) || 0,
    solAmount: Number(rawOrder.solAmount) || 0,
    tokenAmount: Number(rawOrder.tokenAmount) || 0,
    status: "Active" as const,
    createdAt: rawOrder.createdAt ? new Date(rawOrder.createdAt).toISOString() : new Date().toISOString(),
    slippage: Number(rawOrder.slippage) || 0,
    priorityFee: Number(rawOrder.priorityFee) || 0,
    bribe: Number(rawOrder.bribe) || 0,
    mevMode: rawOrder.mevMode ?? null,
    autoFee: rawOrder.autoFee ?? false,
    poolType: rawOrder.poolType ?? null,
    triggerType: rawOrder.triggerType,
    bondingTarget: Number(rawOrder.bondingTarget) || 0,
    initialBondingPct: Number(rawOrder.initialBondingPct) || 0,
    devWallet: rawOrder.devWallet ?? null,
    transactionHash: null,
    failureReason: null,
    failureCode: null,
  };
}
const LIMIT_PREVIEW_EVENT = "limit-preview-update";
const LIMIT_PREVIEW_CLEAR_EVENT = "limit-preview-clear";
const LIMIT_ORDER_POLL_INTERVAL_MS = 2000;
const LIMIT_ORDER_MAX_POLLS = 40;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fallback to fetch pair address from token service when not available locally
 * Uses GET /v1/get-pair/{mint} endpoint with Redis cache-through pattern
 */
async function fetchPairAddressFromTokenService(mintAddress: string): Promise<string | null> {
  if (!TOKEN_SERVICE_URL || !mintAddress) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(`${TOKEN_SERVICE_URL}/v1/get-pair/${mintAddress}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`⚠️ Token service get-pair responded ${response.status} for ${mintAddress}`);
      return null;
    }

    const data = await response.json();
    const pairAddress = data?.pair_address;
    if (typeof pairAddress === "string" && pairAddress.length > 0) {
      return pairAddress;
    }
    return null;
  } catch (error) {
    console.warn("⚠️ Failed to fetch pair address from token service:", error);
    return null;
  }
}

function getCountsAndVol(t: any, side: "buy" | "sell", window: TimeRange) {
  const s = side;
  const count =
    window === "5m"
      ? num(t[`total_${s}s_5m`])
      : window === "1h"
      ? num(t[`total_${s}s_1h`]) || num(t[`total_${s}s_60m`])
      : window === "6h"
      ? num(t[`total_${s}s_6h`]) || num(t[`total_${s}s_360m`])
      : num(t[`total_${s}s_24h`]);

  const vol =
    window === "5m"
      ? num(t[`total_${s}_volume_5m`])
      : window === "1h"
      ? num(t[`total_${s}_volume_1h`]) || num(t[`total_${s}_volume_60m`])
      : window === "6h"
      ? num(t[`total_${s}_volume_6h`]) || num(t[`total_${s}_volume_360m`])
      : num(t[`total_${s}_volume_24h`]);

  return { count, vol };
}

const prettyAmt = (s: string) => {
  if (!s || s === ".") return "";
  const n = Number(s);
  if (!Number.isFinite(n)) return "";
  return Number(n.toFixed(6)).toString();
};

// Helper function to truncate address
const truncateAddress = (address: string, start = 4, end = 4) => {
  if (!address) return "";
  if (address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
};

// Helper function to copy to clipboard
const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  } catch (err) {
    showCenteredErrorToast("Failed to copy");
  }
};

// Address display component
const AddressDisplay: React.FC<{
  label: string;
  address: string;
  icon: React.ReactNode;
  solscanUrl: string;
  tooltip: string;
}> = ({ label, address, icon, solscanUrl, tooltip }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await copyToClipboard(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!address) return null;

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-[#2A2B33]">
      <div className="flex items-center gap-2">
        <div className="text-[#9CA3AF]">{icon}</div>
        <InterstateTooltip label={tooltip}>
          <span className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wide cursor-help">
            {label}:
          </span>
        </InterstateTooltip>
        <span className="text-[#E6E7EA] text-[11px] font-mono">
          {truncateAddress(address)}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={handleCopy}
          className="p-1 hover:bg-[#2A2B33] rounded transition-colors"
          title="Copy address"
        >
          <FaCopy className={`w-3 h-3 ${copied ? 'text-[#70E0B0]' : 'text-[#9CA3AF]'}`} />
        </button>
        <a
          href={solscanUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 hover:bg-[#2A2B33] rounded transition-colors"
          title="View on Solscan"
        >
          <FaExternalLinkAlt className="w-3 h-3 text-[#9CA3AF]" />
        </a>
      </div>
    </div>
  );
};

// Token Info Dropdown Component
const TokenInfoDropdown: React.FC<{ token: any; liveMarketCapUsd?: number | null; firstBuyers?: FirstBuyer[]; firstBuyersSummary?: FirstBuyersSummary | null }> = ({ token, liveMarketCapUsd, firstBuyers, firstBuyersSummary }) => {
  const [isOpen, setIsOpen] = useState(true);

  // Get token metrics (using Codex fields if available, fallback to token-analytics)
  // Parse string values to numbers (backend returns decimals as strings)
  const parsePercentage = (val: any): number => {
    if (val == null) return 0;
    const num = typeof val === 'string' ? parseFloat(val) : Number(val);
    return isNaN(num) ? 0 : num;
  };
  
  const sniperPercent = parsePercentage(token?.sniper_held_percentage ?? token?.sniper_holding_percentage);
  const bundlePercent = parsePercentage(token?.bundler_held_percentage ?? token?.bundle_holding_percentage);
  const insiderPercent = parsePercentage(token?.insider_held_percentage ?? token?.insider_holding_percentage);
  const devPercent = parsePercentage(token?.dev_held_percentage ?? token?.dev_holding_percentage);
  const top10Percent = parsePercentage(token?.top10_holding_percentage);
  const lpBurned = token?.lp_burned ?? true;
  
  // Get counts from Codex
  const sniperCount = token?.sniper_count ?? undefined;
  const bundlerCount = token?.bundler_count ?? undefined;
  const insiderCount = token?.insider_count ?? undefined;

  return (
    <div className="border-t border-[#2A2B33]" style={{ backgroundColor: '#101114' }}>
      <div className="flex items-center justify-between px-3 py-2">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-2 py-1 -mx-2 -my-1 rounded hover:bg-[#2A2B33] transition-colors"
        >
          <span className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wide">Token Info</span>
          <svg 
            width="12" 
            height="12" 
            viewBox="0 0 12 12" 
            fill="none" 
            className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
          >
            <path d="M6 9L1 4L11 4L6 9Z" fill="currentColor" />
          </svg>
        </button>
        <button
          onClick={() => {
            // Refresh action could go here
          }}
          className="p-1 rounded hover:bg-[#1E1F26] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M3 21v-5h5" />
          </svg>
        </button>
      </div>

      {isOpen && (
        <div className="px-3 pb-3 space-y-2" style={{ backgroundColor: AX.bg }}>
          {/* Tax Percentage - Large Display */}
          {/* <div className="rounded-md p-2.5 border" style={{ backgroundColor: '#101114', borderColor: AX.border }}>
            <div className="text-center">
              <div className="text-[12px] font-bold mb-0.5" style={{ color: AX.muted }}>
                {token?.tax_percentage ? `${token.tax_percentage}%` : '0%'}
              </div>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: AX.muted }}>Tax %</div>
            </div>
          </div> */}

          {/* Separator Line */}
          <div className="h-px" style={{ backgroundColor: AX.border }}></div>

          {/* Token Metrics Grid - First Row */}
          <div className="grid grid-cols-3 gap-1.5">
            {/* Top 10 Holders */}
            <div className="rounded-md p-2 border h-[68px]" style={{ backgroundColor: '#101114', borderColor: AX.border }}>
              <div className="flex flex-col items-center justify-center gap-1 h-full">
                <div className="flex items-center gap-1.5">
                  <BsPersonGear size={16} style={{ color: AX.aiGreen }} />
                  <div className="text-[12px] font-bold" style={{ color: AX.aiGreen }}>
                    {top10Percent > 0 ? `${top10Percent.toFixed(2)}%` : '0%'}
                  </div>
                </div>
                <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>Top 10 H.</div>
              </div>
            </div>

            {/* Dev Holdings - with hover popout */}
            <div className="relative group h-[68px]">
              <div className="rounded-md p-2 border cursor-pointer hover:border-[#3A3B43] transition-colors h-full" style={{ backgroundColor: '#101114', borderColor: AX.border }}>
                <div className="flex flex-col items-center justify-center gap-1 h-full">
                  <div className="flex items-center gap-1.5">
                    <LuChefHat size={16} style={{ color: AX.aiGreen }} />
                    <div className="text-[12px] font-bold" style={{ color: AX.aiGreen }}>
                      {devPercent > 0 ? `${devPercent.toFixed(1)}%` : '0%'}
                    </div>
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>Dev H.</div>
                </div>
              </div>
              {/* Dev Popout */}
              <div className="absolute left-0 top-full mt-1 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none group-hover:pointer-events-auto">
                <div className="rounded-lg border shadow-xl min-w-[220px]" style={{ backgroundColor: AX.surface, borderColor: AX.border }}>
                  {/* Header */}
                  <div className="px-3 py-2 border-b" style={{ borderColor: AX.border }}>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold" style={{ color: AX.text }}>DEV Holds</span>
                      <span className="text-[11px] font-bold" style={{ color: AX.aiGreen }}>
                        {devPercent > 0 ? `${devPercent.toFixed(2)}%` : '0%'}
                      </span>
                    </div>
                  </div>
                  {/* Content */}
                  <div className="px-3 py-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px]" style={{ color: AX.muted }}>Dev Wallet</span>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-mono" style={{ color: AX.text }}>
                          {token?.dev_wallet
                            ? `${token.dev_wallet.slice(0, 4)}...${token.dev_wallet.slice(-4)}`
                            : '--'}
                        </span>
                        {token?.dev_wallet && (
                          <a
                            href={`https://solscan.io/account/${token.dev_wallet}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:opacity-70"
                          >
                            <FaExternalLinkAlt size={8} style={{ color: AX.muted }} />
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px]" style={{ color: AX.muted }}>Bought</span>
                      <span className="text-[10px]" style={{ color: AX.aiGreen }}>
                        {token?.dev_bought_usd ? `$${formatSmartNumber(token.dev_bought_usd)}` : '$0'} / {token?.dev_buy_count || 0}TXs
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px]" style={{ color: AX.muted }}>Sold</span>
                      <span className="text-[10px]" style={{ color: AX.sell }}>
                        {token?.dev_sold_usd ? `$${formatSmartNumber(token.dev_sold_usd)}` : '$0'} / {token?.dev_sell_count || 0}TXs
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px]" style={{ color: AX.muted }}>Balance</span>
                      <span className="text-[10px]" style={{ color: AX.text }}>
                        {token?.dev_balance_usd ? `$${formatSmartNumber(token.dev_balance_usd)}` : '$0'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px]" style={{ color: AX.muted }}>Funding</span>
                      <div className="flex items-center gap-1">
                        {token?.dev_funding_source ? (
                          <>
                            <span className="text-[10px] font-mono" style={{ color: AX.text }}>
                              {`${token.dev_funding_source.slice(0, 4)}...${token.dev_funding_source.slice(-4)}`}
                            </span>
                            <a
                              href={`https://solscan.io/account/${token.dev_funding_source}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:opacity-70"
                            >
                              <FaExternalLinkAlt size={8} style={{ color: AX.muted }} />
                            </a>
                          </>
                        ) : (
                          <span className="text-[10px]" style={{ color: AX.muted }}>--</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px]" style={{ color: AX.muted }}>Transfer In</span>
                      <span className="text-[10px]" style={{ color: AX.text }}>
                        {token?.dev_transfer_in_sol ? `${formatSmartNumber(token.dev_transfer_in_sol)} SOL` : '--'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px]" style={{ color: AX.muted }}>Time</span>
                      <span className="text-[10px]" style={{ color: AX.text }}>
                        {token?.dev_first_activity
                          ? new Date(token.dev_first_activity).toLocaleString('en-US', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                              hour12: false
                            }).replace(',', '')
                          : '--'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sniper Holdings - with first buyers hover popout */}
            <div className="relative group/snipers h-[68px]">
              <div className="rounded-md p-2 border cursor-pointer hover:border-[#3A3B43] transition-colors h-full" style={{ backgroundColor: '#101114', borderColor: AX.border }}>
                <div className="flex flex-col items-center justify-center gap-1 h-full">
                  <div className="flex items-center gap-1.5">
                    <FaCrosshairs size={16} style={{ color: AX.aiGreen }} />
                    <div className="text-[12px] font-bold" style={{ color: AX.aiGreen }}>
                      {sniperPercent > 0 ? `${sniperPercent.toFixed(1)}%` : '0%'}
                    </div>
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>
                    Snipers H.
                    {sniperCount !== undefined && (
                      <div className="text-[9px] mt-0.5" style={{ color: AX.muted }}>({sniperCount})</div>
                    )}
                  </div>
                </div>
              </div>
              {/* First Buyers Popout */}
              {firstBuyersSummary && firstBuyers && firstBuyers.length > 0 && (
                <div className="absolute right-0 top-full mt-1 z-50 opacity-0 invisible group-hover/snipers:opacity-100 group-hover/snipers:visible transition-all duration-200 pointer-events-none group-hover/snipers:pointer-events-auto">
                  <div className="rounded-lg border shadow-xl min-w-[260px] max-w-[300px]" style={{ backgroundColor: AX.surface, borderColor: AX.border }}>
                    {/* Header */}
                    <div className="px-3 py-2 border-b" style={{ borderColor: AX.border }}>
                      <div className="text-[11px] font-semibold" style={{ color: AX.text }}>
                        {token?.symbol || token?.name || 'Token'} First {firstBuyersSummary.total} buyers
                      </div>
                    </div>
                    {/* Dots grid */}
                    <div className="px-3 pt-2 pb-1">
                      <div className="flex flex-wrap gap-[3px]">
                        {firstBuyers.map((buyer, i) => {
                          const dotColor =
                            buyer.status === 'hold' ? '#14b080' :
                            buyer.status === 'buy_more' ? '#3b82f6' :
                            '#f25561';
                          const isSellAll = buyer.status === 'sell_all';
                          return (
                            <div
                              key={buyer.wallet || i}
                              className="relative"
                              style={{ width: 14, height: 14 }}
                              title={`${buyer.wallet.slice(0, 4)}...${buyer.wallet.slice(-4)} · ${buyer.status.replace('_', ' ')}${buyer.is_sniper ? ' · sniper' : ''}`}
                            >
                              <div
                                style={{
                                  width: 12,
                                  height: 12,
                                  borderRadius: '50%',
                                  backgroundColor: isSellAll ? 'transparent' : dotColor,
                                  border: isSellAll ? `1.5px solid ${dotColor}` : 'none',
                                }}
                              />
                              {buyer.is_sniper && (
                                <FaCrosshairs
                                  size={7}
                                  style={{
                                    position: 'absolute',
                                    top: -1,
                                    right: -2,
                                    color: '#fff',
                                    filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.8))',
                                  }}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {/* Legend */}
                    <div className="px-3 py-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#14b080' }} />
                        <span className="text-[10px]" style={{ color: AX.muted }}>Hold: {firstBuyersSummary.hold}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#3b82f6' }} />
                        <span className="text-[10px]" style={{ color: AX.muted }}>Buy More: {firstBuyersSummary.buy_more}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#f25561' }} />
                        <span className="text-[10px]" style={{ color: AX.muted }}>Sell Partial: {firstBuyersSummary.sell_partial}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div style={{ width: 7, height: 7, borderRadius: '50%', border: '1.5px solid #f25561', backgroundColor: 'transparent' }} />
                        <span className="text-[10px]" style={{ color: AX.muted }}>Sell All: {firstBuyersSummary.sell_all}</span>
                      </div>
                    </div>
                    {/* Stats */}
                    <div className="px-3 py-2 border-t space-y-1" style={{ borderColor: AX.border }}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px]" style={{ color: AX.muted }}>Snipers Hold</span>
                        <span className="text-[10px] font-semibold" style={{ color: AX.text }}>
                          {firstBuyersSummary.snipers_hold_pct != null ? `${firstBuyersSummary.snipers_hold_pct.toFixed(2)}%` : '0%'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px]" style={{ color: AX.muted }}>Current Total Holdings</span>
                        <span className="text-[10px] font-semibold" style={{ color: AX.text }}>
                          {firstBuyersSummary.current_holdings_pct != null ? `${firstBuyersSummary.current_holdings_pct.toFixed(2)}%` : '0%'}
                        </span>
                      </div>
                      {firstBuyersSummary.top10_holders_pct != null && (
                        <div className="flex items-center justify-between">
                          <span className="text-[10px]" style={{ color: AX.muted }}>Top 10 holders</span>
                          <span className="text-[10px] font-semibold" style={{ color: AX.text }}>
                            {firstBuyersSummary.top10_holders_pct.toFixed(2)}%
                          </span>
                        </div>
                      )}
                    </div>
                    {/* Interstate branding */}
                    <div className="flex items-center justify-center gap-1.5 px-3 py-2 border-t" style={{ borderColor: AX.border }}>
                      <img src="/interstate/logo.png" alt="Interstate" className="h-3.5 w-3.5 object-contain" />
                      <span className="text-[10px] font-semibold !font-orbitron" style={{ color: AX.muted }}>interstate</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Token Metrics Grid - Second Row */}
          <div className="grid grid-cols-3 gap-1.5">
            {/* Insider Holdings */}
            <div className="rounded-md p-2 border h-[68px]" style={{ backgroundColor: '#101114', borderColor: AX.border }}>
              <div className="flex flex-col items-center justify-center gap-1 h-full">
                <div className="flex items-center gap-1.5">
                  <RiGhostLine size={16} style={{ color: AX.aiGreen }} />
                  <div className="text-[12px] font-bold" style={{ color: AX.aiGreen }}>
                    {insiderPercent > 0 ? `${insiderPercent.toFixed(1)}%` : '0%'}
                  </div>
                </div>
                <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>
                  Insiders
                  {insiderCount !== undefined && (
                    <div className="text-[9px] mt-0.5" style={{ color: AX.muted }}>({insiderCount})</div>
                  )}
                </div>
              </div>
            </div>

            {/* Bundle Holdings */}
            <div className="rounded-md p-2 border h-[68px]" style={{ backgroundColor: '#101114', borderColor: AX.border }}>
              <div className="flex flex-col items-center justify-center gap-1 h-full">
                <div className="flex items-center gap-1.5">
                  <FaDice size={16} style={{ color: AX.aiGreen }} />
                  <div className="text-[12px] font-bold" style={{ color: AX.aiGreen }}>
                    {bundlePercent > 0 ? `${bundlePercent.toFixed(2)}%` : '0%'}
                  </div>
                </div>
                <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>
                  Bundlers
                  {bundlerCount !== undefined && (
                    <div className="text-[9px] mt-0.5" style={{ color: AX.muted }}>({bundlerCount})</div>
                  )}
                </div>
              </div>
            </div>

            {/* LP Burned */}
            <div className="rounded-md p-2 border h-[68px]" style={{ backgroundColor: '#101114', borderColor: AX.border }}>
              <div className="flex flex-col items-center justify-center gap-1 h-full">
                <div className="flex items-center gap-1.5">
                  <FaFire size={16} style={{ color: AX.aiGreen }} />
                  <div className="text-[12px] font-bold" style={{ color: AX.aiGreen }}>
                    {lpBurned ? '100%' : '0%'}
                  </div>
                </div>
                <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>LP Burned</div>
              </div>
            </div>
          </div>

          {/* Separator Line */}
          <div className="h-px" style={{ backgroundColor: AX.border }}></div>

          {/* Additional Metrics - Third Row */}
          <div className="grid grid-cols-3 gap-1.5">
            {/* Holders */}
            <div className="rounded-md p-2 border h-[68px]" style={{ backgroundColor: '#101114', borderColor: AX.border }}>
              <div className="flex flex-col items-center justify-center gap-1 h-full">
                <div className="flex items-center gap-1.5">
                  <FaUsers className="text-white" size={16} />
                  <div className="text-[12px] font-bold" style={{ color: AX.muted }}>
                    {token?.total_holders || 0}
                  </div>
                </div>
                <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>Holders</div>
              </div>
            </div>

            {/* Pro Traders */}
            <div className="rounded-md p-2 border h-[68px]" style={{ backgroundColor: '#101114', borderColor: AX.border }}>
              <div className="flex flex-col items-center justify-center gap-1 h-full">
                <div className="flex items-center gap-1.5">
                  <BiCandles className="text-white" size={16} />
                  <div className="text-[12px] font-bold" style={{ color: AX.muted }}>
                    {token?.pro_traders || 0}
                  </div>
                </div>
                <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>Pro Traders</div>
              </div>
            </div>

            {/* Dex Paid */}
            <div className="rounded-md p-2 border h-[68px]" style={{ backgroundColor: '#101114', borderColor: AX.border }}>
              <div className="flex flex-col items-center justify-center gap-1 h-full">
                <div className="flex items-center gap-1.5">
                  <img 
                    src="https://i.pinimg.com/736x/e6/2d/e6/e62de698746dfcb09d2d64f85371eed1.jpg" 
                    alt="Dex" 
                    style={{ 
                      width: '16px', 
                      height: '16px'
                    }}
                  />
                  <div className="text-[12px] font-bold" style={{ color: token?.dex_paid ? AX.aiGreen : AX.red }}>
                    {token?.dex_paid ? 'Paid' : 'Unpaid'}
                  </div>
                </div>
                <div className="text-[10px] uppercase tracking-wide text-center leading-tight" style={{ color: AX.muted }}>Dex Paid</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const formatCompactNumber = (n: number | string): string => {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return "0";
  const abs = Math.abs(num);

  if (abs >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  }
  if (abs >= 1_000_000) {
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (abs >= 1_000) {
    return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  }
  // For small numbers, show decimal places instead of rounding to 0
  if (abs < 1) {
    return num.toFixed(4).replace(/\.?0+$/, ""); // Show up to 4 decimal places, remove trailing zeros
  }
  return Math.round(num).toString();
};

/* ── Toast helpers (showOrderToast + ORDER_TOAST_STYLE imported from ~/utils/tradeToast) ── */

// Pool Info Section Component
const PoolInfoSection: React.FC<{ token: any; liveMarketCapUsd?: number | null; liveLiquidityUsd?: number | null }> = ({ token, liveMarketCapUsd, liveLiquidityUsd }) => {
  const [isOpen, setIsOpen] = useState(true);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '--';
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
  };

  const truncateAddress = (addr: string | undefined, start = 4, end = 4) => {
    if (!addr) return '--';
    return `${addr.slice(0, start)}...${addr.slice(-end)}`;
  };

  // Get token name for header - prefer symbol over name for meme tokens
  // Symbol is typically the recognizable ticker (e.g., "stickman") while name might be a description
  const tokenName = token?.symbol || token?.name || 'Token';

  return (
    <div className="border-t border-[#2A2B33]">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[#1E1F26] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wide">
            {tokenName} Pool Info
          </span>
        </div>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: AX.muted }}
        >
          <path d="M6 9L1 4L11 4L6 9Z" fill="currentColor" />
        </svg>
      </button>

      {isOpen && (
        <div style={{ backgroundColor: '#101114' }}>
          {/* Liquidity Section */}
          <div className="px-3 py-2.5 space-y-2">
            {/* Total Liquidity */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Total liq</span>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-[#E6E7EA] font-semibold">
                  ${formatSmartNumber(liveLiquidityUsd || token?.liquidity_usd || token?.total_liquidity_usd || 0)}
                </span>
                <span className="text-[10px] text-[#9CA3AF]">
                  ({formatSmartNumber((liveLiquidityUsd || token?.liquidity_usd || token?.total_liquidity_usd || 0) / 200)} SOL)
                </span>
              </div>
            </div>

            {/* Pair Info */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Pair</span>
            </div>

            {/* Token Row */}
            <div className="pl-3 space-y-1.5">
              <div className="text-[11px] font-semibold text-[#E6E7EA]">{token?.symbol || 'TOKEN'}</div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#9CA3AF]">Liq/Initial</span>
                <div className="text-right">
                  <span className="text-[11px] text-[#E6E7EA] font-semibold">
                    {formatCompactNumber(token?.total_supply || 0)}
                  </span>
                  <span className="text-[10px] text-[#9CA3AF] ml-1">
                    (100%)
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#9CA3AF]">Value</span>
                <span className="text-[11px] text-[#E6E7EA] font-semibold">
                  ${formatSmartNumber(liveMarketCapUsd || token?.market_cap_usd || 0)}
                </span>
              </div>
            </div>

            {/* SOL Row */}
            <div className="pl-3 space-y-1.5">
              <div className="text-[11px] font-semibold text-[#E6E7EA]">SOL</div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#9CA3AF]">Liq</span>
                <span className="text-[11px] text-[#E6E7EA] font-semibold">
                  {formatSmartNumber((liveLiquidityUsd || token?.liquidity_usd || 0) / 200)} SOL
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#9CA3AF]">Value</span>
                <span className="text-[11px] text-[#E6E7EA] font-semibold">
                  ${formatSmartNumber(liveLiquidityUsd || token?.liquidity_usd || 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-[#2A2B33]"></div>

          {/* Token Details Section */}
          <div className="px-3 py-2.5 space-y-2">
            {/* DEV */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">DEV</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-[#E6E7EA] font-mono">
                  {truncateAddress(token?.dev_wallet || token?.creator_address)}
                </span>
                {token?.dev_sol_balance !== undefined && (
                  <span className="text-[10px] text-[#9CA3AF]">
                    ({formatSmartNumber(token.dev_sol_balance)} SOL)
                  </span>
                )}
                {(token?.dev_wallet || token?.creator_address) && (
                  <>
                    <button
                      onClick={() => copyToClipboard(token?.dev_wallet || token?.creator_address)}
                      className="p-0.5 hover:bg-[#2A2B33] rounded transition-colors"
                      title="Copy dev address"
                    >
                      <FaCopy className="w-2.5 h-2.5 text-[#9CA3AF]" />
                    </button>
                    <a
                      href={`https://solscan.io/account/${token?.dev_wallet || token?.creator_address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-0.5 hover:bg-[#2A2B33] rounded transition-colors"
                      title="View on Solscan"
                    >
                      <FaExternalLinkAlt className="w-2.5 h-2.5 text-[#9CA3AF]" />
                    </a>
                  </>
                )}
              </div>
            </div>

            {/* Funding */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Funding</span>
              <div className="flex items-center gap-1.5">
                {token?.dev_funding_source ? (
                  <>
                    <span className="text-[11px] text-[#E6E7EA] font-mono">
                      {truncateAddress(token.dev_funding_source)}
                    </span>
                    {token?.dev_transfer_in_sol && (
                      <>
                        <SiSolana className="w-2.5 h-2.5 text-[#9CA3AF]" />
                        <span className="text-[10px] text-[#E6E7EA]">
                          {formatSmartNumber(token.dev_transfer_in_sol)}
                        </span>
                      </>
                    )}
                    <button
                      onClick={() => copyToClipboard(token.dev_funding_source)}
                      className="p-0.5 hover:bg-[#2A2B33] rounded transition-colors"
                    >
                      <FaCopy className="w-2.5 h-2.5 text-[#9CA3AF]" />
                    </button>
                  </>
                ) : (
                  <span className="text-[11px] text-[#9CA3AF]">--</span>
                )}
              </div>
            </div>

            {/* Market cap */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Market cap</span>
              <span className="text-[11px] text-[#E6E7EA] font-semibold">
                ${formatSmartNumber(liveMarketCapUsd || token?.market_cap_usd || 0)}
              </span>
            </div>

            {/* Holders */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Holders</span>
              <span className="text-[11px] text-[#E6E7EA] font-semibold">
                {token?.total_holders || token?.unique_traders || 0}
              </span>
            </div>

            {/* Total supply */}
            {token?.total_supply && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Total supply</span>
                <span className="text-[11px] text-[#E6E7EA] font-semibold">
                  {formatCompactNumber(token.total_supply)}
                </span>
              </div>
            )}

            {/* Pair Address */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Pair</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-[#E6E7EA] font-mono">
                  {truncateAddress(token?.pair_address || token?.pool_address)}
                </span>
                {(token?.pair_address || token?.pool_address) && (
                  <button
                    onClick={() => copyToClipboard(token?.pair_address || token?.pool_address)}
                    className="p-0.5 hover:bg-[#2A2B33] rounded transition-colors"
                  >
                    <FaCopy className="w-2.5 h-2.5 text-[#9CA3AF]" />
                  </button>
                )}
              </div>
            </div>

            {/* Token created */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Token created</span>
              <span className="text-[11px] text-[#E6E7EA]">
                {formatDate(token?.created_at || token?.token_created_at)}
              </span>
            </div>

            {/* Pool created */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Pool created</span>
              <span className="text-[11px] text-[#E6E7EA]">
                {formatDate(token?.pool_created_at || token?.created_at)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Meteora Migration Logo Component
const MeteoraMigrationLogo: React.FC = () => (
  <div className="flex items-center justify-center gap-1 mb-4">
    {/* Red Meteora Logo (left) */}
    <div 
      className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center relative" 
      style={{ 
        border: '0.5px solid #ff4662',
        backgroundColor: 'transparent'
      }}
    >
      <img 
        src="https://s1.coincarp.com/logo/1/meteora.png?style=72&v=1759911013" 
        alt="Meteora" 
        className="w-full h-full object-cover"
      />
    </div>
    
    {/* 3 Green Chevron Arrows */}
    {[0, 1, 2].map((i) => (
      <svg
        key={i}
        width="4"
        height="5"
        viewBox="0 0 4 5"
        fill="none"
        className="animate-pulse"
        style={{
          animationDelay: `${i * 0.2}s`,
          animationDuration: '1s'
        }}
      >
        <path
          d="M0.5 0.5L3.5 2.5L0.5 4.5"
          stroke="#22c55e"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ))}
    
    {/* Yellow Meteora Logo (right) */}
    <div 
      className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center relative" 
      style={{ 
        border: '0.5px solid #fbbf24',
        backgroundColor: 'transparent'
      }}
    >
      <img 
        src="https://s1.coincarp.com/logo/1/meteora.png?style=72&v=1759911013" 
        alt="Meteora" 
        className="w-full h-full object-cover"
        style={{ filter: 'sepia(1) saturate(5) hue-rotate(5deg) brightness(1.1)' }}
      />
    </div>
  </div>
);

interface TradeActionPanelProps {
  token: Token | null;
  tradeParams?: any; // Use any to match TradePageParams from queryParams
  setTradeParams?: (params: any) => void;
  quickBuySettings?: any;
  quickBuySide?: "buy" | "sell";
  wsVolume?: SolanaTokenVolume | null; // Volume data from unified WebSocket
  liveMarketCapUsd?: number | null; // Real-time MC from chart/WebSocket (same source as header)
  liveLiquidityUsd?: number | null; // Real-time liquidity from WebSocket (same source as header)
  livePriceUsd?: number | null; // Real-time USD price from chart OHLC data
  circulatingSupply?: number; // Circulating supply from /v1/supply endpoint
  firstBuyers?: FirstBuyer[];
  firstBuyersSummary?: FirstBuyersSummary | null;
}

const TradeActionPanel: React.FC<TradeActionPanelProps> = ({
  token,
  tradeParams: externalTradeParams,
  setTradeParams: setExternalTradeParams,
  quickBuySettings: externalQuickBuySettings,
  quickBuySide: externalQuickBuySide,
  wsVolume,
  liveMarketCapUsd,
  liveLiquidityUsd,
  livePriceUsd,
  circulatingSupply,
  firstBuyers,
  firstBuyersSummary,
}) => {
  // Live SOL price from Pyth Network (same source as footer)
  const { solPrice: liveSolPrice } = useSolPrice();

  // No token data yet — reserve layout space with invisible placeholder (no skeleton flicker)
  if (!token || (!token.name && !token.symbol && !token.mint)) {
    return (
      <div className="flex-shrink-0 min-w-[260px] basis-[280px] md:basis-[310px] lg:basis-[330px] hidden lg:block">
        <div className="h-full rounded-lg p-4" />
      </div>
    );
  }

  // Determine the pool address to use: migrated_pool_address if available, otherwise pair_address
  const effectivePoolAddress = useMemo(() => {
    return token.migrated_pool_address || token.pair_address || '';
  }, [token.migrated_pool_address, token.pair_address]);

  // Internal state with fallback to external props
  const [mode, setMode] = useState<"buy" | "sell">(externalTradeParams?.mode || "buy");
  const [tab, setTab] = useState<"market" | "limit" | "adv">(externalTradeParams?.tab || "market");
  const [timeRange, setTimeRange] = useState<TimeRange>(externalTradeParams?.timeRange as TimeRange || "5m");
  const [amount, setAmount] = useState(externalTradeParams?.amount || "");
  const [targetMC, setTargetMC] = useState(externalTradeParams?.targetMC || "");
  const [sliderPct, setSliderPct] = useState<number | string>(externalTradeParams?.sliderPct || 0);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [sniperAmount, setSniperAmount] = useState("");
  const [sniperSubmitting, setSniperSubmitting] = useState(false);
  const [migrationMode, setMigrationMode] = useState(false);
  const [devSellMode, setDevSellMode] = useState(true);
  const [devSubmitting, setDevSubmitting] = useState(false);
  const [creatorAddress, setCreatorAddress] = useState<string>("");
  const isMountedRef = useRef(true);
  const manualTargetOverrideRef = useRef<boolean>(false);
  const lastSliderBaseRef = useRef<number | null>(null);
  const { prefetch: prefetchOrder, prefetchImmediate: prefetchOrderImmediate } = usePrefetchOrder();

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      window.dispatchEvent(new CustomEvent(LIMIT_PREVIEW_CLEAR_EVENT));
    };
  }, []);

  // Clear preview line when leaving limit tab
  useEffect(() => {
    if (tab !== "limit") {
      window.dispatchEvent(new CustomEvent(LIMIT_PREVIEW_CLEAR_EVENT));
    }
  }, [tab]);

  // High slippage warning dialog state
  const [showSlippageWarning, setShowSlippageWarning] = useState(false);
  const [showLiquidityWarning, setShowLiquidityWarning] = useState(false);
  const [pendingTradeOptions, setPendingTradeOptions] = useState<{ skipLiquidity?: boolean; skipSlippage?: boolean } | null>(null);
  const tradeButtonRef = useRef<HTMLButtonElement>(null);

  // Raw trade-history aggregates. The derived position (incl. PnL) is computed
  // in a useMemo below, keyed on [tradeHistory, deferredPriceUsd], so the PnL
  // tile re-renders every WebSocket price tick without us needing to refetch
  // trade history on every tick.
  interface TradeHistoryAggregate {
    bought: number;
    boughtUsdValue: number;
    sold: number;
    soldUsdValue: number;
  }
  const [tradeHistory, setTradeHistory] = useState<TradeHistoryAggregate | null>(null);

  // PnL display mode — 'unrealized' = live mark-to-market on the holding (default,
  // GMGN-style); 'realized' = profit locked in from closed sells only. Toggled by
  // clicking the PnL tile. Persisted to localStorage so the choice sticks across
  // tokens and reloads. Both server and client start at 'unrealized' to avoid an
  // SSR hydration mismatch; the persisted value is loaded in a useEffect after mount.
  type PnlMode = 'unrealized' | 'realized';
  const PNL_MODE_STORAGE_KEY = 'ist:trade-panel:pnl-mode';
  const [pnlMode, setPnlMode] = useState<PnlMode>('unrealized');
  const [pnlModeHydrated, setPnlModeHydrated] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') {
      setPnlModeHydrated(true);
      return;
    }
    try {
      const stored = window.localStorage.getItem(PNL_MODE_STORAGE_KEY);
      if (stored === 'realized') setPnlMode('realized');
    } catch {
      // Safari private mode / embedded webviews can throw on storage access.
    }
    setPnlModeHydrated(true);
  }, []);
  // Persist pnlMode changes (skip writes before hydration completes so we don't
  // clobber the stored value with the default).
  useEffect(() => {
    if (!pnlModeHydrated) return;
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(PNL_MODE_STORAGE_KEY, pnlMode);
    } catch {
      // Ignore storage write failures (private mode, quota, etc.).
    }
  }, [pnlMode, pnlModeHydrated]);

  // COMMENTED OUT: Migration UI disabled — always returns false
  const isMigratingToken = useMemo(() => {
    return false;
    // const launchpadProtocol = token.launchpad_protocol?.toLowerCase() || '';
    // const isMeteora = launchpadProtocol.includes('meteora');
    // const bondingPct = token.bonding_pct ?? 0;
    // const status = (token.status || '').toLowerCase();
    // const hasMigrated =
    //   (token as any).is_migrated ||
    //   (token as any).migrated ||
    //   (token as any).graduated ||
    //   (token as any).is_graduated ||
    //   status.includes('migrated') ||
    //   !!token.migrated_time;
    // return isMeteora && bondingPct > 98.6 && !hasMigrated;
  }, []);

  // token-stats WebSocket removed — wsVolume from unified token WS is the primary data source

  // Update internal state when external props change (only on mount)
  useEffect(() => {
    if (externalTradeParams) {
      setMode(externalTradeParams.mode);
      setTab(externalTradeParams.tab);
      setTimeRange(externalTradeParams.timeRange as TimeRange);
      setAmount(externalTradeParams.amount);
      setTargetMC(externalTradeParams.targetMC);
      setSliderPct(externalTradeParams.sliderPct);
    }
  }, []); // Only run on mount

  // Update external state when internal state changes (debounced)
  const updateExternalParams = useCallback(() => {
    if (setExternalTradeParams) {
      setExternalTradeParams({
        mode,
        tab,
        timeRange,
        amount,
        targetMC,
        sliderPct,
      });
    }
  }, [mode, tab, timeRange, amount, targetMC, sliderPct, setExternalTradeParams]);

  // Debounce external updates to avoid loops
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      updateExternalParams();
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [mode, tab, timeRange, amount, targetMC, sliderPct, updateExternalParams]);

  const { presets: qbPresets, activePreset } = useQuickBuy();
  const {
    user,
    solBalance,
    refreshBalance,
    walletList,
    walletBalances,
    selectedWalletIds,
    primaryWalletAddresses,
    setSelectedWalletsForChain,
    selectAllWalletsForChain,
    selectWalletsWithFunds,
  } = useUser();

  // Wallet picker (Solana) — selection state lives in UserContext, this just wires
  // the trigger button + dropdown UI on top of the trade tabs.
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const walletPickerRef = useRef<HTMLDivElement | null>(null);
  const walletTriggerRef = useRef<HTMLButtonElement | null>(null);
  const walletDropdownRef = useRef<HTMLDivElement | null>(null);
  const [walletPickerAnchor, setWalletPickerAnchor] = useState<{ top: number; right: number } | null>(null);
  const [copiedWalletAddr, setCopiedWalletAddr] = useState<string | null>(null);

  const solWallets = useMemo(
    () => (walletList || []).filter((w: any) => w?.solanaAddress && !w?.isArchived),
    [walletList]
  );
  const selectedWalletSet = useMemo(
    () => new Set<string>(selectedWalletIds?.sol || []),
    [selectedWalletIds?.sol]
  );
  const selectedWalletCount = solWallets.filter((w: any) => selectedWalletSet.has(w.id)).length;
  const allWalletsSelected = solWallets.length > 0 && selectedWalletCount === solWallets.length;
  const totalSelectedSolBalance = solWallets
    .filter((w: any) => selectedWalletSet.has(w.id))
    .reduce((acc: number, w: any) => {
      const addr = (w.solanaAddress || "").trim();
      const bal = addr ? walletBalances?.[addr] ?? w.balance ?? 0 : 0;
      return acc + (bal || 0);
    }, 0);

  // Click-outside to close the wallet picker (covers both trigger and portaled dropdown)
  useEffect(() => {
    if (!walletPickerOpen) return;
    const handle = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        walletPickerRef.current?.contains(target) ||
        walletDropdownRef.current?.contains(target)
      ) {
        return;
      }
      setWalletPickerOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [walletPickerOpen]);

  // Track trigger button position so the portaled dropdown can anchor under it
  useEffect(() => {
    if (!walletPickerOpen) {
      setWalletPickerAnchor(null);
      return;
    }
    const update = () => {
      const el = walletTriggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setWalletPickerAnchor({
        top: r.bottom + 4,
        right: window.innerWidth - r.right,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [walletPickerOpen]);

  const toggleWalletSelection = useCallback(
    (walletId: string) => {
      const next = new Set(selectedWalletSet);
      if (next.has(walletId)) next.delete(walletId);
      else next.add(walletId);
      setSelectedWalletsForChain?.(Array.from(next), "sol");
    },
    [selectedWalletSet, setSelectedWalletsForChain]
  );

  const handleCopyWalletAddress = useCallback((address: string) => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopiedWalletAddr(address);
    setTimeout(() => setCopiedWalletAddr((cur) => (cur === address ? null : cur)), 1200);
  }, []);

  // Prefetch ATA existence so buy validation is instant (cache warms on mount)
  useEffect(() => {
    if (token?.mint && user?.publicKey) {
      prefetchAtaCheck(token.mint, user.publicKey);
    }
  }, [token?.mint, user?.publicKey]);

  // Pending toast ref for Solana trades (for WebSocket instant tx updates)
  const pendingSolanaToastRef = useRef<{
    id: string;
    tokenImage: string | null;
    tokenName: string;
    fakeTime: string;
    startTime: number;
    timerHandle?: number;
    totalSelectedWallets: number
  } | null>(null);

  // WebSocket for Solana position updates AND instant txHash
  const tokenAddress = token?.mint || '';

  // Callback for instant txHash update via WebSocket (fires before HTTP response)
  const handleSolanaWsTxHash = useCallback((data: { txHash: string; tokenAddress: string; tradeType: 'buy' | 'sell'; explorerUrl: string }) => {
    const pending = pendingSolanaToastRef.current;
    if (!pending || data.tokenAddress.toLowerCase() !== tokenAddress.toLowerCase()) return;

    // For multi-wallet trades: Don't update the toast (count was already shown at timer cap)
    // For single wallet: Update the link element with clickable Solana logo
    if (pending.totalSelectedWallets === 1) {
      const linkEl = document.getElementById(`link-${pending.id}`);
      if (linkEl) {
        linkEl.innerHTML = `<a href="${data.explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4" alt="Solana" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
      }
    }

    // Set duration for auto-dismiss after 10s
    setTimeout(() => {
      if (pendingSolanaToastRef.current?.id === pending.id) {
        toast.dismiss(pending.id);
        pendingSolanaToastRef.current = null;
      }
    }, 10000);
  }, [tokenAddress]);

  // Use the shared single WebSocket connection from context (no duplicate connection)
  useTxHashCallback('trade-action-panel', handleSolanaWsTxHash);

  // Fetch trade-history aggregates from the Activity API. The *derived* position
  // fields (remaining, remainingUsdValue, realized/unrealized PnL) live in a
  // useMemo below — keeping this effect responsible only for raw state means we
  // don't refetch trades every time the WebSocket price ticks.
  useEffect(() => {
    const emptyAggregate: TradeHistoryAggregate = {
      bought: 0,
      boughtUsdValue: 0,
      sold: 0,
      soldUsdValue: 0,
    };

    const calculatePositionFromTrades = async () => {
      if (!user?.id || !token?.mint) {
        setTradeHistory(emptyAggregate);
        return;
      }

      try {
        const trades = await getTradeActivityByUser(user.id.toString());
        const tokenMint = (token.mint || '').toLowerCase();
        const tokenTrades = trades.filter((trade: any) =>
          (trade.tokenAddress || '').toLowerCase() === tokenMint
        );

        // Sum buys and sells. Coerce every numeric field through `Number(x) || 0`
        // so one bad API row can't poison the aggregate with NaN and cascade into
        // every derived value downstream.
        let bought = 0;
        let boughtUsdValue = 0;
        let sold = 0;
        let soldUsdValue = 0;

        tokenTrades.forEach((trade: any) => {
          if (trade.type === 'Buy') {
            bought += Number(trade.tokenAmount) || 0;
            boughtUsdValue += Number(trade.usdValue) || 0;
          } else if (trade.type === 'Sell') {
            sold += Number(trade.tokenAmount) || 0;
            soldUsdValue += Number(trade.usdValue) || 0;
          }
        });

        setTradeHistory({ bought, boughtUsdValue, sold, soldUsdValue });
      } catch (error) {
        console.error('Error calculating position from trades:', error);
        setTradeHistory(emptyAggregate);
      }
    };

    calculatePositionFromTrades();

    // Refresh position data every 10 seconds
    const interval = setInterval(calculatePositionFromTrades, 10000);
    return () => clearInterval(interval);
  }, [user?.id, token?.mint]);

  // Live price source for the unrealized PnL calc. Prefer the `livePriceUsd`
  // prop — that's the same chart OHLC stream the candlesticks render from, so
  // the PnL tile updates at the same cadence as the chart. Falls back to
  // `token.price_usd` (slower, gated by `token_update` WS messages) and finally
  // to 0 (which trips the cost-basis fallback inside the memo below).
  // `useDeferredValue` coalesces bursts of ticks during volatile pumps; cost is
  // zero when ticks are slow.
  const rawPriceUsd =
    typeof livePriceUsd === 'number' && Number.isFinite(livePriceUsd) && livePriceUsd > 0
      ? livePriceUsd
      : Number((token as any)?.price_usd) || 0;
  const deferredPriceUsd = useDeferredValue(rawPriceUsd);

  // Derived position data — recomputes on every trade-history change AND every
  // price tick, giving the PnL tile live mark-to-market behavior.
  //
  // The `unrealizedPnl` formula is `soldUsdValue + remainingMarketValue - boughtUsdValue`.
  // This mirrors the Active Positions implementation — see
  // `exchange-web-app/src/components/trade/Positions.tsx` (~lines 1468-1496) —
  // so both surfaces define "unrealized PnL" the same way (realized + live paper gain).
  const positionData = useMemo(() => {
    if (!tradeHistory) return null;
    const { bought, boughtUsdValue, sold, soldUsdValue } = tradeHistory;

    // Raw remaining may go negative if the user sold tokens they received from
    // somewhere other than Interstate (airdrop, inbound transfer). We preserve
    // the signed value for the Holding tile (matches prior behavior) but clamp
    // to zero for the PnL math so a negative holding doesn't silently subtract
    // from reported PnL at current market price.
    const remaining = bought - sold;
    const safeRemaining = Math.max(0, remaining);

    const avgBoughtPrice = bought > 0 ? boughtUsdValue / bought : 0;
    // `deferredPriceUsd` is already coerced to a finite number ≥ 0 above.
    const currentPrice = deferredPriceUsd > 0 ? deferredPriceUsd : 0;

    // Realized PnL — profit locked in from closed sells. Algebraically equivalent
    // to the previously-shipped formula `(soldUsdValue + remaining*avgBoughtPrice) - boughtUsdValue`
    // (cancels to `soldUsdValue - sold*avgBoughtPrice` when bought > 0).
    const realizedPnl = soldUsdValue - (sold * avgBoughtPrice);
    const realizedPnlPercentage = boughtUsdValue > 0 ? (realizedPnl / boughtUsdValue) * 100 : 0;

    // Unrealized PnL — mark-to-market. Falls back to cost basis when the WS
    // hasn't delivered a price yet, so the tile degrades gracefully to the
    // old behavior during the first few hundred ms of the page load.
    const remainingMarketValue = currentPrice > 0
      ? safeRemaining * currentPrice
      : safeRemaining * avgBoughtPrice;
    const unrealizedPnl = (soldUsdValue + remainingMarketValue) - boughtUsdValue;
    const unrealizedPnlPercentage = boughtUsdValue > 0 ? (unrealizedPnl / boughtUsdValue) * 100 : 0;

    // Holding tile value — preserves prior behavior (cost-basis USD valuation
    // for the remaining holding). Out of scope to mark this to market here.
    const remainingUsdValue = remaining * avgBoughtPrice;

    return {
      bought,
      boughtUsdValue,
      sold,
      soldUsdValue,
      remaining,
      remainingUsdValue,
      realizedPnl,
      realizedPnlPercentage,
      unrealizedPnl,
      unrealizedPnlPercentage,
    };
  }, [tradeHistory, deferredPriceUsd]);
  
  // Use external QuickBuy settings if available, otherwise use internal context
  const settings = externalQuickBuySettings || (
    mode === "buy"
      ? qbPresets[activePreset].quickBuySettings
      : qbPresets[activePreset].quickSellSettings
  );

  const baseMarketCap: number = useMemo(() => {
    // Priority: live chart/WS data > token prop
    if (typeof liveMarketCapUsd === "number" && Number.isFinite(liveMarketCapUsd) && liveMarketCapUsd > 0) {
      return liveMarketCapUsd;
    }

    const t: any = token || {};
    return (
      Number(
        t.market_cap_usd ??
          t.marketcap_usd ??
          t.market_cap ??
          t.marketcap ??
          t.fdv_usd ??
          t.fdv ??
          0
      ) || 0
    );
  }, [liveMarketCapUsd, token]);

  const tokenPriceUsdField = Number((token as any)?.price_usd) || 0;

  const liveTokenPriceInSol = useMemo(() => {
    const supply = circulatingSupply ?? (Number(token?.total_supply) || 0);
    const solUsd = liveSolPrice > 0 ? liveSolPrice : 0;
    // Best: derive from live market cap + circulating supply
    if (baseMarketCap > 0 && supply > 0 && solUsd > 0) {
      return baseMarketCap / (supply * solUsd);
    }
    // Strong fallback: live chart price / SOL price (works even without supply)
    const chartPrice = typeof livePriceUsd === "number" && Number.isFinite(livePriceUsd) ? livePriceUsd : 0;
    if (chartPrice > 0 && solUsd > 0) {
      return chartPrice / solUsd;
    }
    // Fallback: derive from usd_price or price_usd / SOL price
    const usdPrice = Number(token?.usd_price) || tokenPriceUsdField;
    if (usdPrice > 0 && solUsd > 0) {
      return usdPrice / solUsd;
    }
    // Last resort: static sol_price (ensure numeric)
    return Number(token?.sol_price) || 0;
  }, [baseMarketCap, circulatingSupply, token?.total_supply, token?.usd_price, token?.sol_price, liveSolPrice, livePriceUsd, tokenPriceUsdField]);

  // Token price in SOL at the limit order's target market cap
  const limitTokenPriceInSol = useMemo(() => {
    if (tab !== "limit") return 0;
    const supply = circulatingSupply ?? (Number(token?.total_supply) || 0);
    const solUsd = liveSolPrice > 0 ? liveSolPrice : 0;
    const tmc = Number(targetMC);
    if (tmc > 0 && supply > 0 && solUsd > 0) {
      return tmc / (supply * solUsd);
    }
    return 0;
  }, [tab, circulatingSupply, token?.total_supply, liveSolPrice, targetMC]);

  // For buy estimates: use target price in limit tab, current price in market tab
  const effectiveBuyTokenPrice = tab === "limit" && limitTokenPriceInSol > 0
    ? limitTokenPriceInSol
    : liveTokenPriceInSol;

  const sliderBaseMarketCap = useMemo(() => {
    if (baseMarketCap > 0) {
      return baseMarketCap;
    }
    const numericTarget = Number(targetMC);
    return Number.isFinite(numericTarget) && numericTarget > 0 ? numericTarget : null;
  }, [baseMarketCap, targetMC]);

  // Derive % change from base MC -> targetMC (used to display slider value)
  const derivedPct: number = useMemo(() => {
    const t = Number(targetMC);
    if (!baseMarketCap || !Number.isFinite(t)) return 0;
    // Allow negative percentages even when targetMC is 0
    if (t <= 0) {
      // Calculate what percentage would result in 0 market cap
      return -100;
    }
    return clamp(Math.round(((t - baseMarketCap) / baseMarketCap) * 100), -100, 100);
  }, [targetMC, baseMarketCap]);

  // Initialize target market cap on entering Limit tab if empty/zero
  useEffect(() => {
    if (tab === "limit" && baseMarketCap > 0) {
      const t = Number(targetMC);
      if (!Number.isFinite(t) || t === 0) {
        manualTargetOverrideRef.current = false;
        lastSliderBaseRef.current = baseMarketCap;
        setTargetMC(String(Math.round(baseMarketCap)));
        setSliderPct(0);
      }
    }
  }, [tab, baseMarketCap]);

  // Sync slider percentage when user manually types a market cap value
  useEffect(() => {
    if (!manualTargetOverrideRef.current) return;
    if (baseMarketCap && targetMC) {
      const t = Number(targetMC);
      if (Number.isFinite(t) && t > 0) {
        const calculatedPct = Math.round(((t - baseMarketCap) / baseMarketCap) * 100);
        const clampedPct = clamp(calculatedPct, -100, 100);
        setSliderPct(clampedPct);
        manualTargetOverrideRef.current = false;
      }
    }
  }, [targetMC, baseMarketCap]);

  // Real-time stats from WebSocket with fallback to static data
  // Priority: wsVolume (unified token WebSocket) > wsData (token-stats WebSocket) > static token data
  const realTimeStats = useMemo(() => {
    // Live SOL price from Pyth Network (footer price), fallback to 200 if not yet loaded
    const SOL_PRICE_USD = liveSolPrice > 0 ? liveSolPrice : 200;

    // First priority: Use wsVolume from unified token WebSocket (most reliable)
    if (wsVolume) {
      // Map timeRange to wsVolume keys
      const volumeKey = timeRange === '5m' ? 'volume_5m'
        : timeRange === '1h' ? 'volume_1h'
        : timeRange === '6h' ? 'volume_6h'
        : 'volume_24h';

      const volumeData = wsVolume[volumeKey];
      if (volumeData) {
        // Convert SOL volumes to USD
        const buyVolumeUsd = (volumeData.buy_volume_sol || 0) * SOL_PRICE_USD;
        const sellVolumeUsd = (volumeData.sell_volume_sol || 0) * SOL_PRICE_USD;
        const totalVolumeUsd = buyVolumeUsd + sellVolumeUsd;
        const buyPct = totalVolumeUsd > 0 ? (buyVolumeUsd / totalVolumeUsd) * 100 : 50;
        const sellPct = 100 - buyPct;
        const netVolumeUsd = buyVolumeUsd - sellVolumeUsd;

        return {
          buys: volumeData.buy_count || 0,
          sells: volumeData.sell_count || 0,
          volume: totalVolumeUsd,
          buyVolume: buyVolumeUsd,
          sellVolume: sellVolumeUsd,
          netVolume: netVolumeUsd,
          buyPercentage: buyPct,
          sellPercentage: sellPct,
        };
      }
    }

    // Fallback: Use static data from token object
    const buyStats = getCountsAndVol(token as any, "buy", timeRange);
    const sellStats = getCountsAndVol(token as any, "sell", timeRange);
    const totalVol = (buyStats.vol ?? 0) + (sellStats.vol ?? 0);
    const buyPct = totalVol ? (buyStats.vol / totalVol) * 100 : 50;
    const sellPct = 100 - buyPct;
    const netVol = (buyStats.vol ?? 0) - (sellStats.vol ?? 0);

    return {
      buys: buyStats.count,
      sells: sellStats.count,
      volume: totalVol,
      buyVolume: buyStats.vol,
      sellVolume: sellStats.vol,
      netVolume: netVol,
      buyPercentage: buyPct,
      sellPercentage: sellPct,
    };
  }, [wsVolume, timeRange, token, liveSolPrice]);

  // Extract stats for easier access
  const { buys, sells, volume, buyVolume, sellVolume, netVolume, buyPercentage, sellPercentage } = realTimeStats;

  const liquidityUsd = useMemo(() => {
    // Priority 1: Real-time WS data (same source as trade header)
    if (typeof liveLiquidityUsd === "number" && Number.isFinite(liveLiquidityUsd) && liveLiquidityUsd > 0) {
      return liveLiquidityUsd;
    }
    // Priority 2: Token prop values
    if (!token) return 0;
    const possibleValues = [
      token.total_liquidity_usd,
      (token as any).liquidity_usd,
      (token as any).liquidityUsd,
      (token as any).total_liquidityUsd,
    ];
    for (const value of possibleValues) {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
      }
    }
    // Fall back to zero if we have no positive readings
    return Number(token.total_liquidity_usd) || 0;
  }, [liveLiquidityUsd, token]);

  // Fetch creator address from token-service
  useEffect(() => {
    const fetchCreatorAddress = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_GO_SERVICE_URL}/v1/tokens/dev?tokenAddress=${token.mint || ''}&limit=1`
        );
        if (response.ok) {
          const data = await response.json();
          if (data?.filterTokens?.results?.[0]?.token?.creatorAddress) {
            const creatorAddr = data.filterTokens.results[0].token.creatorAddress;
            setCreatorAddress(creatorAddr);
          }
        } else {
          console.warn('⚠️ Creator address fetch failed with status:', response.status);
        }
      } catch (error) {
        console.error("❌ Failed to fetch creator address:", error);
      }
    };
    
    if (token.mint || '') {
      fetchCreatorAddress();
    }
  }, [token.mint || '']);

  // Also use dev_wallet from WebSocket holderSummary if available
  useEffect(() => {
    const devWallet = (token as any)?.dev_wallet;
    if (devWallet && !creatorAddress) {
      setCreatorAddress(devWallet);
    }
  }, [(token as any)?.dev_wallet, creatorAddress]);

  // amount presets - different for buy vs sell (load from localStorage or use defaults)
  const [buyPresets, setBuyPresets] = useState<number[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tradeActionPanelBuyPresets');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length === 4) {
            return parsed;
          }
        } catch (e) {
          // Use defaults
        }
      }
    }
    return [0.01, 0.1, 0.5, 1];
  });

  const [sellPresets, setSellPresets] = useState<number[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tradeActionPanelSellPresets');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length === 4) {
            return parsed;
          }
        } catch (e) {
          // Use defaults
        }
      }
    }
    return [10, 25, 50, 100];
  });

  const [amountPresets, setAmountPresets] = useState<number[]>(buyPresets);
  const [editingPresets, setEditingPresets] = useState(false);
  const [presetDrafts, setPresetDrafts] = useState<string[]>(buyPresets.map(String));

  // Listen for preset updates from other components (like InstantTradeModal)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePresetUpdate = (e: CustomEvent) => {
      if (e.detail?.type === 'buy' && Array.isArray(e.detail.presets)) {
        setBuyPresets(e.detail.presets);
        // Always update current presets if we're in buy mode
        if (mode === 'buy') {
          setAmountPresets(e.detail.presets);
          setPresetDrafts(e.detail.presets.map(String));
        }
      } else if (e.detail?.type === 'sell' && Array.isArray(e.detail.presets)) {
        setSellPresets(e.detail.presets);
        // Always update current presets if we're in sell mode
        if (mode === 'sell') {
          setAmountPresets(e.detail.presets);
          setPresetDrafts(e.detail.presets.map(String));
        }
      }
    };

    window.addEventListener('tradePresetsUpdated', handlePresetUpdate as EventListener);
    
    // Also listen for storage events as a fallback (in case event doesn't fire)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'tradeActionPanelBuyPresets' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed) && parsed.length === 4) {
            setBuyPresets(parsed);
            if (mode === 'buy') {
              setAmountPresets(parsed);
              setPresetDrafts(parsed.map(String));
            }
          }
        } catch (err) {
          // Ignore parse errors
        }
      } else if (e.key === 'tradeActionPanelSellPresets' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed) && parsed.length === 4) {
            setSellPresets(parsed);
            if (mode === 'sell') {
              setAmountPresets(parsed);
              setPresetDrafts(parsed.map(String));
            }
          }
        } catch (err) {
          // Ignore parse errors
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('tradePresetsUpdated', handlePresetUpdate as EventListener);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [mode]);
  
  // Update presets when mode changes OR when buyPresets/sellPresets change (from InstantTradeModal)
  useEffect(() => {
    const newPresets = mode === "sell" ? sellPresets : buyPresets;
    setAmountPresets(newPresets);
    setPresetDrafts(newPresets.map(String));
    // Only clear amount when switching modes, not when presets update
    // setAmount(""); // Commented out to preserve user input when presets change
  }, [mode, buyPresets, sellPresets]);
  
  // Clear amount only when mode changes (not when presets update)
  const prevModeRef = useRef<"buy" | "sell">(mode);
  useEffect(() => {
    if (prevModeRef.current !== mode) {
      setAmount("");
      prevModeRef.current = mode;
    }
  }, [mode]);

  // Prefetch 100% sell order immediately when user switches to sell mode
  useEffect(() => {
    if (mode !== 'sell' || !token?.mint) return;
    prefetchOrderImmediate({ baseMint: token.mint, amount: 100, side: 'sell' });
  }, [mode, token?.mint, prefetchOrderImmediate]);

  // Prefetch sell order on percentage change (debounced)
  useEffect(() => {
    if (mode !== 'sell' || !token?.mint || !amount) return;
    const pct = Number(amount);
    if (pct > 0 && pct <= 100) {
      prefetchOrder({ baseMint: token.mint, amount: pct, side: 'sell' });
    }
  }, [mode, amount, token?.mint, prefetchOrder]);

  useEffect(() => setPresetDrafts(amountPresets.map(String)), [amountPresets]);

  const commitPresetDrafts = () => {
    const next = presetDrafts.map((s, idx) => {
      // Handle empty string, just ".", or whitespace as 0
      if (!s || s.trim() === "" || s.trim() === ".") {
        return 0;
      }
      const n = parseFloat(s);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    });
    setAmountPresets(next);
    setEditingPresets(false);
    // Force re-render by updating the drafts
    setPresetDrafts(next.map(String));
    
    // Update the appropriate preset array and save to localStorage
    if (mode === "buy") {
      setBuyPresets(next);
      if (typeof window !== 'undefined') {
        localStorage.setItem('tradeActionPanelBuyPresets', JSON.stringify(next));
        // Dispatch event to notify other components
        window.dispatchEvent(new CustomEvent('tradePresetsUpdated', {
          detail: { type: 'buy', presets: next }
        }));
      }
    } else {
      setSellPresets(next);
      if (typeof window !== 'undefined') {
        localStorage.setItem('tradeActionPanelSellPresets', JSON.stringify(next));
        // Dispatch event to notify other components
        window.dispatchEvent(new CustomEvent('tradePresetsUpdated', {
          detail: { type: 'sell', presets: next }
        }));
      }
    }
  };

  const monitorLimitOrderExecution = useCallback(
    async ({
      orderId,
      orderType,
      targetMarketCap,
      submittedSolAmount,
      submittedTokenAmount,
      triggerType,
      bondingTarget,
    }: {
      orderId: string;
      orderType: "Buy" | "Sell";
      targetMarketCap?: number;
      submittedSolAmount?: number;
      submittedTokenAmount?: number;
      triggerType?: "marketCap" | "bonding" | "devSell";
      bondingTarget?: number;
    }) => {
      if (!user?.bearerToken) return;

      const symbolLabel = token?.symbol || token?.name || "Token";

      for (let attempt = 0; attempt < LIMIT_ORDER_MAX_POLLS && isMountedRef.current; attempt++) {
        if (attempt > 0) {
          await delay(LIMIT_ORDER_POLL_INTERVAL_MS);
          if (!isMountedRef.current) {
            return;
          }
        }

        try {
          const result: any = await getLimitOrderExecutionResult(orderId, user.bearerToken);
          const status = (result?.status || result?.order?.status) as string | undefined;
          const resolvedTriggerType: "marketCap" | "bonding" | "devSell" | undefined =
            (result?.triggerType as any) ??
            (result?.order?.triggerType as any) ??
            triggerType;
          const resolvedBondingTarget =
            typeof result?.order?.bondingTarget === "number"
              ? result.order.bondingTarget
              : typeof result?.bondingTarget === "number"
                ? result.bondingTarget
                : bondingTarget;
          const normalizedBondingTarget = Number.isFinite(Number(resolvedBondingTarget))
            ? Number(resolvedBondingTarget)
            : undefined;

          if (status === "Completed") {
            const resolvedSol = Number(
              result?.actualSolAmount ?? result?.amount ?? submittedSolAmount ?? 0
            );
            const resolvedTokens = Number(
              result?.actualTokenAmount ?? submittedTokenAmount ?? 0
            );
            const txHash =
              result?.txid ||
              result?.transactionHash ||
              result?.trade?.transactionHash ||
              result?.order?.transactionHash;

            const amountLabel =
              orderType === "Buy"
                ? `${resolvedSol.toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL`
                : `${resolvedTokens.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbolLabel}`;

            const descriptionParts = [amountLabel];
            if (resolvedTriggerType === "bonding" && typeof normalizedBondingTarget === "number") {
              descriptionParts.push(`Bonding Target ${normalizedBondingTarget.toFixed(2)}%`);
            } else if (
              resolvedTriggerType === "marketCap" &&
              typeof targetMarketCap === "number" &&
              Number.isFinite(targetMarketCap) &&
              targetMarketCap > 0
            ) {
              descriptionParts.push(`Target $${Math.round(targetMarketCap).toLocaleString()}`);
            } else if (resolvedTriggerType === "devSell") {
              descriptionParts.push("Triggered by Dev Sell");
            }

            const description = descriptionParts.join(" • ");

            // Show animated execution toast (same as market buy/sell)
            const actionVerb = orderType === "Buy" ? "Bought" : "Sold";
            showOrderToast({
              label: `${actionVerb} ${symbolLabel}`,
              tokenImage: getResolvedTokenImage(token),
              tokenName: symbolLabel,
              txHash,
            });

            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent(LIMIT_ORDER_STATUS_EVENT, {
                  detail: {
                    orderId,
                    status: "Completed",
                    triggerType: resolvedTriggerType,
                    bondingTarget: normalizedBondingTarget,
                  },
                })
              );
            }

            return;
          }

          if (status === "Failed" || status === "Cancelled") {
            const failureReason =
              result?.failureReason ||
              result?.order?.failureReason ||
              result?.message ||
              "Limit order failed to execute.";

            toast.error(failureReason, { duration: 6000, style: ORDER_TOAST_STYLE });

            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent(LIMIT_ORDER_STATUS_EVENT, {
                  detail: { orderId, status, triggerType: resolvedTriggerType, bondingTarget: normalizedBondingTarget },
                })
              );
            }

            return;
          }
        } catch (err) {
          console.warn("[TradeActionPanel] Failed to poll limit order execution result:", err);
          return;
        }
      }
    },
    [user?.bearerToken, token?.symbol, token?.name]
  );

  const handleCreateSniperOrder = useCallback(async () => {
    if (!user?.bearerToken) {
      showCenteredErrorToast("Authentication required to create orders.");
      return;
    }
    if (!token) return;

    const numericAmount = Number(sniperAmount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      showEnhancedToast("error", "Enter a valid sniper amount", {
        title: "Invalid Amount",
        description: mode === "buy" 
          ? "Provide a positive SOL amount before arming the sniper."
          : "Provide a percentage between 1 and 100 before arming the sniper.",
      });
      return;
    }

    // For sell orders, validate percentage
    if (mode === "sell") {
      if (numericAmount > 100) {
        showEnhancedToast("error", "Percentage too high", {
          title: "Invalid Percentage",
          description: "Enter a percentage between 1 and 100.",
        });
        return;
      }
    }

    const poolAddress = effectivePoolAddress || token.pair_address || token.migrated_pool_address || "";
    if (!poolAddress) {
      showEnhancedToast("error", "Pool information unavailable", {
        title: "Cannot Arm Sniper",
        description: "We couldn't determine the pool address for this token.",
      });
      return;
    }

    const targetBonding = 100;
    const sanitizeNumber = (value: unknown, fallback: number): number => {
      const numeric = typeof value === "string" ? Number(value) : (value as number);
      return Number.isFinite(numeric) ? numeric : fallback;
    };

    const quickSettings = settings ?? {};
    const computedPoolType = getPoolTypeFromToken(token);
    const slippageValue = sanitizeNumber(quickSettings.maxSlippage, 0.2);
    const priorityFeeValue = sanitizeNumber(quickSettings.priority, 0.0001);
    const bribeValue = sanitizeNumber(quickSettings.bribe, 0);
    const maxFeeValue = sanitizeNumber(quickSettings.maxFee, 0);
    const mevModeValue =
      typeof quickSettings.mevMode === "string" ? quickSettings.mevMode : "off";
    const autoFeeValue = Boolean(quickSettings.autoFee);
    const rpcValue =
      typeof quickSettings.rpc === "string" && quickSettings.rpc.trim().length > 0
        ? quickSettings.rpc.trim()
        : undefined;

    const latestMarketCap = baseMarketCap;

    const formattedAmount = mode === "buy"
      ? `${numericAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL`
      : `${numericAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;

    const tokenName = token.symbol || token.name || "Token";

    setSniperSubmitting(true);
    try {
      const response = await createLimitOrder(
        {
          tokenAddress: token.mint || "",
          amount: numericAmount,
          type: mode === "buy" ? "Buy" : "Sell",
          direction: "Above",
          triggerType: "bonding",
          bondingTarget: targetBonding,
          targetMC: latestMarketCap,
          currentMarketCap: latestMarketCap,
          tokenName: token.name,
          tokenSymbol: token.symbol,
          tokenDecimals: token.decimals,
          poolAddress,
          pairAddress: token.pair_address || token.migrated_pool_address || "",
          poolType: computedPoolType,
          slippage: slippageValue,
          priorityFee: priorityFeeValue,
          bribe: bribeValue,
          mevProtection: quickSettings.mevProtection ?? false,
          mevMode: mevModeValue,
          autoFee: autoFeeValue,
          maxFee: maxFeeValue,
          rpc: rpcValue,
        },
        user.bearerToken
      );

      showOrderToast({
        label: `${tokenName} sniper armed`,
        tokenImage: getResolvedTokenImage(token),
        tokenName,
      });

      // Notify chart + orders tab — include normalized order for optimistic insert
      window.dispatchEvent(new CustomEvent(LIMIT_ORDER_STATUS_EVENT, { detail: { status: "Pending", newOrder: normalizeOrderForEvent(response?.order) } }));
      window.dispatchEvent(new CustomEvent(LIMIT_PREVIEW_CLEAR_EVENT));

      if (response?.order?.id) {
        const normalizedOrderId = String(response.order.id);
        void monitorLimitOrderExecution({
          orderId: normalizedOrderId,
          orderType: mode === "buy" ? "Buy" : "Sell",
          triggerType: "bonding",
          bondingTarget: targetBonding,
          targetMarketCap: Number(response.order.targetMC ?? latestMarketCap),
          submittedSolAmount: mode === "buy" ? numericAmount : undefined,
          submittedTokenAmount: mode === "sell" ? numericAmount : undefined,
        });
      }

      setSniperAmount("");
    } catch (error: any) {
      const errorMsg =
        error?.message?.length > 80
          ? `${error.message.substring(0, 77)}…`
          : error?.message || "Failed to arm sniper";
      toast.error(errorMsg, { duration: 6000, style: ORDER_TOAST_STYLE });
    } finally {
      setSniperSubmitting(false);
    }
  }, [
    user?.bearerToken,
    token,
    sniperAmount,
    mode,
    settings,
    baseMarketCap,
    effectivePoolAddress,
    monitorLimitOrderExecution,
  ]);

  const handleCreateDevSellOrder = useCallback(async () => {
    if (!user?.bearerToken) {
      showCenteredErrorToast("Authentication required to create orders.");
      return;
    }
    if (!token) return;

    if (!creatorAddress) {
      showEnhancedToast("error", "Developer wallet unavailable", {
        title: "Cannot Arm Dev Mirror",
        description: "We couldn't determine the developer wallet for this token yet."
      });
      return;
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      showEnhancedToast("error", "Enter a valid amount", {
        title: "Invalid Amount",
        description: mode === "sell"
          ? "Provide a percentage between 1 and 100 before arming the dev mirror."
          : "Provide a positive SOL amount before arming the dev mirror.",
      });
      return;
    }

    if (mode === "sell" && numericAmount > 100) {
      showEnhancedToast("error", "Sell percentage too high", {
        title: "Invalid Percentage",
        description: "Enter a percentage between 1 and 100.",
      });
      return;
    }

    const poolAddress = effectivePoolAddress || token.pair_address || token.migrated_pool_address || "";
    if (!poolAddress) {
      showEnhancedToast("error", "Pool information unavailable", {
        title: "Cannot Arm Dev Mirror",
        description: "We couldn't determine the pool address for this token.",
      });
      return;
    }

    const sanitizeNumber = (value: unknown, fallback: number): number => {
      const numeric = typeof value === "string" ? Number(value) : (value as number);
      return Number.isFinite(numeric) ? numeric : fallback;
    };

    const quickSettings = settings ?? {};
    const computedPoolType = getPoolTypeFromToken(token);
    const slippageValue = sanitizeNumber(quickSettings.maxSlippage, 0.2);
    const priorityFeeValue = sanitizeNumber(quickSettings.priority, 0.0001);
    const bribeValue = sanitizeNumber(quickSettings.bribe, 0);
    const maxFeeValue = sanitizeNumber(quickSettings.maxFee, 0);
    const mevModeValue = typeof quickSettings.mevMode === "string" ? quickSettings.mevMode : "off";
    const autoFeeValue = Boolean(quickSettings.autoFee);
    const mevProtectionValue = mevModeValue !== "off";
    const rpcValue =
      typeof quickSettings.rpc === "string" && quickSettings.rpc.trim().length > 0
        ? quickSettings.rpc.trim()
        : undefined;

    const latestMarketCap = baseMarketCap;

    const actionLabel = mode === "buy" ? "Buy on Dev Sell" : "Sell on Dev Sell";
    const formattedAmount = mode === "buy"
      ? `${numericAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL`
      : `${numericAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
    const shortDev = creatorAddress.length > 12
      ? `${creatorAddress.slice(0, 4)}...${creatorAddress.slice(-4)}`
      : creatorAddress;

    const devTokenName = token.symbol || token.name || "Token";

    setDevSubmitting(true);
    try {
      const response = await createLimitOrder(
        {
          tokenAddress: token.mint || "",
          amount: numericAmount,
          type: mode === "buy" ? "Buy" : "Sell",
          direction: mode === "buy" ? "Below" : "Above",
          triggerType: "devSell",
          devWallet: creatorAddress,
          targetMC: latestMarketCap ?? 0,
          currentMarketCap: latestMarketCap ?? token.market_cap_usd ?? token.fully_diluted_value,
          currentPrice: token.usd_price,
          tokenName: token.name,
          tokenSymbol: token.symbol,
          tokenDecimals: token.decimals,
          poolAddress,
          pairAddress: token.pair_address || "",
          poolType: computedPoolType,
          slippage: slippageValue,
          priorityFee: priorityFeeValue,
          bribe: bribeValue,
          mevProtection: mevProtectionValue,
          mevMode: mevModeValue,
          autoFee: autoFeeValue,
          maxFee: maxFeeValue,
          rpc: rpcValue,
        },
        user.bearerToken
      );

      showOrderToast({
        label: `${devTokenName} dev mirror armed`,
        tokenImage: getResolvedTokenImage(token),
        tokenName: devTokenName,
      });

      // Notify chart + orders tab — include normalized order for optimistic insert
      window.dispatchEvent(new CustomEvent(LIMIT_ORDER_STATUS_EVENT, { detail: { status: "Pending", newOrder: normalizeOrderForEvent(response?.order) } }));
      window.dispatchEvent(new CustomEvent(LIMIT_PREVIEW_CLEAR_EVENT));

      if (response?.order?.id) {
        const normalizedOrderId = String(response.order.id);
        void monitorLimitOrderExecution({
          orderId: normalizedOrderId,
          orderType: response.order.type,
          triggerType: "devSell",
          targetMarketCap: Number(response.order.targetMC ?? latestMarketCap ?? 0),
          submittedSolAmount: mode === "buy" ? Number(response.order.solAmount ?? numericAmount) : undefined,
          submittedTokenAmount: mode === "sell" ? Number(response.order.tokenAmount ?? numericAmount) : undefined,
        });
      }

      setAmount("");
    } catch (error: any) {
      const message =
        error?.message?.length > 80 ? `${error.message.substring(0, 77)}…` : error?.message || "Failed to arm dev mirror";
      toast.error(message, { duration: 6000, style: ORDER_TOAST_STYLE });
    } finally {
      setDevSubmitting(false);
    }
  }, [
    user?.bearerToken,
    token,
    amount,
    mode,
    creatorAddress,
    settings,
    effectivePoolAddress,
    baseMarketCap,
    monitorLimitOrderExecution,
  ]);

  const initiateTrade = useCallback(
    async (overrides?: { skipLiquidity?: boolean; skipSlippage?: boolean }) => {
      const options = {
        skipLiquidity: overrides?.skipLiquidity ?? false,
        skipSlippage: overrides?.skipSlippage ?? false,
      };

      setPendingTradeOptions(options);

      if (!user?.bearerToken) {
        setSuccessMessage(null);
        showCenteredErrorToast("Authentication required to create orders.");
        setPendingTradeOptions(null);
        return;
      }

      // --- Low liquidity warning temporarily disabled ---
      // const liquidityValue = Number(liquidityUsd) || 0;
      // const isLowLiquidity = liquidityValue <= 0 || liquidityValue < LOW_LIQUIDITY_WARNING_THRESHOLD;
      // const shouldCheckLiquidity =
      //   mode === "buy" && isLowLiquidity && !options.skipLiquidity;
      // if (shouldCheckLiquidity) {
      //   setPendingTradeOptions({ ...options, skipLiquidity: true });
      //   setShowLiquidityWarning(true);
      //   return;
      // }

      const shouldCheckSlippage = tab === "market" && !options.skipSlippage;

      if (shouldCheckSlippage) {
        const slippagePercent = (settings.maxSlippage || 0.2) * 100;
        if (slippagePercent >= HIGH_SLIPPAGE_WARNING_THRESHOLD) {
          setPendingTradeOptions({ ...options, skipSlippage: true });
          setShowSlippageWarning(true);
          return;
        }
      }

      setPendingTradeOptions(null);

      // Pre-loading balance validation for buy mode — fires BEFORE spinner starts
      // Uses cached ATA result (sync) or assumes ATA doesn't exist (pessimistic = safe)
      if (mode === "buy" && tab === "market") {
        const buyAmountPreCheck = Number(amount || 0);
        if (buyAmountPreCheck > 0) {
          const { allocations: preAllocations } = buildSolanaWalletAllocations({
            amount: buyAmountPreCheck,
            walletList,
            walletBalances,
            selectedWalletIds: selectedWalletIds?.sol || [],
            priorityFee: settings.priority || 0.0001,
            bribe: settings.bribe || 0,
          });
          // Use cached ATA result if available, otherwise assume it doesn't exist (overestimates cost)
          const cachedAta = getCachedAtaExists(token?.mint, user?.publicKey) ?? false;
          const preValidation = validateSolanaBuy(
            buyAmountPreCheck, preAllocations, walletBalances, walletList,
            selectedWalletIds?.sol || [], settings.priority, settings.bribe, cachedAta
          );
          if (!preValidation.valid) {
            showTradeValidationError(preValidation.error, getResolvedTokenImage(token), token?.symbol || token?.name || 'Token');
            return { success: false };
          }
        }
      }

      setIsLoading(true);
      setSuccessMessage(null);

      // Resolve pool address — only needed for BUY mode.
      // For SELL: Jupiter Ultra routes by token address, pool is optional.
      // Backend SDK fallback (if Jupiter Ultra fails) has its own lazy pool discovery.
      let resolvedPoolAddress = effectivePoolAddress;
      const userWalletAddress = user?.publicKey || '';

      if (mode !== 'sell') {
        if (!resolvedPoolAddress && token.mint) {
          const fetchedPairAddress = await fetchPairAddressFromTokenService(token.mint);
          if (fetchedPairAddress) {
            resolvedPoolAddress = fetchedPairAddress;
          }
        }

        // Validate pool address - check if it looks invalid (equals wallet or token address)
        const poolLooksInvalid = resolvedPoolAddress === userWalletAddress ||
                                 resolvedPoolAddress === token.mint ||
                                 !resolvedPoolAddress ||
                                 resolvedPoolAddress.length < 30;

        // DexScreener fallback if pool address looks invalid
        if (poolLooksInvalid && token.mint) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const dexResponse = await fetch(
              `https://api.dexscreener.com/latest/dex/tokens/${token.mint}`,
              { signal: controller.signal }
            );
            clearTimeout(timeoutId);

            if (dexResponse.ok) {
              const dexData = await dexResponse.json();
              if (dexData?.pairs && dexData.pairs.length > 0) {
                // Filter for Solana pairs and sort by liquidity
                const solanaPairs = dexData.pairs
                  .filter((pair: any) => pair.chainId === 'solana' && pair.pairAddress)
                  .sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));

                if (solanaPairs.length > 0) {
                  const bestPair = solanaPairs[0];
                  resolvedPoolAddress = bestPair.pairAddress;
                }
              }
            }
          } catch (dexError: any) {
            console.warn(`[TradeActionPanel] DexScreener fallback failed:`, dexError?.message || dexError);
          }
        }
      }

      if (tab === "limit") {
        if (!amount || !targetMC) {
          setSuccessMessage(null);
          showCenteredErrorToast("Amount and Target Market Cap are required for limit orders.");
          setIsLoading(false);
          return;
        }
        const numericAmount = Number(amount);
        const numericTargetMC = Number(targetMC);
        if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
          setSuccessMessage(null);
          showCenteredErrorToast("Enter a valid amount.");
          setIsLoading(false);
          return;
        }
        if (!Number.isFinite(numericTargetMC) || numericTargetMC <= 0) {
          setSuccessMessage(null);
          showCenteredErrorToast("Enter a valid target market cap.");
          setIsLoading(false);
          return;
        }
        try {
          const orderIntentLabel = `${mode === "buy" ? "Buy" : "Sell"} Limit Order`;
          const numericAmount = Number(amount);
          const numericTargetMc = Number(targetMC);
          const direction = ((): "Above" | "Below" => {
            if (mode === "buy" && tab === "limit") {
              return "Below";
            }
            if (mode === "sell" && tab === "limit") {
              return "Above";
            }
            if (!Number.isFinite(numericTargetMc) || !Number.isFinite(baseMarketCap) || baseMarketCap <= 0) {
              return "Above";
            }
            return numericTargetMc >= baseMarketCap ? "Above" : "Below";
          })();
          const formattedAmount =
            mode === "buy"
              ? `${Number.isFinite(numericAmount) ? numericAmount.toLocaleString(undefined, { maximumFractionDigits: 6 }) : amount} SOL`
              : `${Number.isFinite(numericAmount) ? numericAmount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : amount}%`;
          const formattedTarget =
            Number.isFinite(numericTargetMc)
              ? `$${Math.round(numericTargetMc).toLocaleString()}`
              : `${targetMC}`;
          const limitTokenName = token.symbol || token.name || "Token";

          const sanitizeNumber = (value: unknown, fallback: number): number => {
            const numeric = typeof value === "string" ? Number(value) : (value as number);
            return Number.isFinite(numeric) ? numeric : fallback;
          };

          const quickSettings = settings ?? {};
          const computedPoolType = getPoolTypeFromToken(token);
          const slippageValue = sanitizeNumber(quickSettings.maxSlippage, 0.2);
          const priorityFeeValue = sanitizeNumber(quickSettings.priority, 0.0001);
          const bribeValue = sanitizeNumber(quickSettings.bribe, 0);
          const maxFeeValue = sanitizeNumber(quickSettings.maxFee, 0);
          const mevModeValue =
            typeof quickSettings.mevMode === "string" ? quickSettings.mevMode : "off";
          const autoFeeValue = Boolean(quickSettings.autoFee);
          const mevProtectionValue = mevModeValue !== "off";
          const rpcValue =
            typeof quickSettings.rpc === "string" && quickSettings.rpc.trim().length > 0
              ? quickSettings.rpc.trim()
              : undefined;

          const latestMarketCap: number | null = baseMarketCap;

          // Only validate that target MC is different from current MC (basic sanity check)
          const effectiveLiveMc = latestMarketCap ?? baseMarketCap;
          const isZeroDelta =
            Number.isFinite(effectiveLiveMc) &&
            Number.isFinite(numericTargetMc) &&
            Math.abs((effectiveLiveMc || 0) - numericTargetMc) <= Math.abs(effectiveLiveMc || 0) * 0.005;

          if (isZeroDelta) {
            toast.error("Target matches current price — adjust target above or below live MC.", { duration: 6000, style: ORDER_TOAST_STYLE });
            setIsLoading(false);
            setPendingTradeOptions(null);
            return;
          }

          // Removed the "condition already met" validation - limit orders should be allowed
          // even if the condition is currently met, as the market can move back and forth
          // The backend will handle execution when the condition is actually met

          const limitOrderResponse = await createLimitOrder(
            {
              tokenAddress: token.mint || "",
              amount: Number(amount),
              type: mode === "buy" ? "Buy" : "Sell",
              direction,
              targetMC: Number(targetMC),
              currentPrice: token.usd_price,
              currentMarketCap: latestMarketCap ?? token.market_cap_usd ?? token.fully_diluted_value,
              tokenName: token.name,
              tokenSymbol: token.symbol,
              tokenDecimals: token.decimals,
              poolAddress: resolvedPoolAddress,
              pairAddress: token.pair_address || resolvedPoolAddress || "",
              poolType: computedPoolType,
              slippage: slippageValue,
              priorityFee: priorityFeeValue,
              bribe: bribeValue,
              mevProtection: mevProtectionValue,
              mevMode: mevModeValue,
              autoFee: autoFeeValue,
              maxFee: maxFeeValue,
              rpc: rpcValue,
            },
            user.bearerToken
          );
          // --- Low liquidity warning temporarily disabled ---
          // if (!options.skipLiquidity && liquidityUsd && liquidityUsd < LOW_LIQUIDITY_WARNING_THRESHOLD) {
          //   setPendingTradeOptions({ ...(options || {}), skipLiquidity: true });
          //   setShowLiquidityWarning(true);
          // }
          showOrderToast({
            label: `${limitTokenName} limit order set`,
            tokenImage: getResolvedTokenImage(token),
            tokenName: limitTokenName,
          });
          // Notify chart + orders tab — include normalized order for optimistic insert
          window.dispatchEvent(new CustomEvent(LIMIT_ORDER_STATUS_EVENT, { detail: { status: "Pending", newOrder: normalizeOrderForEvent(limitOrderResponse?.order) } }));
          window.dispatchEvent(new CustomEvent(LIMIT_PREVIEW_CLEAR_EVENT));
          if (limitOrderResponse?.order?.id) {
            const normalizedOrderId = String(limitOrderResponse.order.id);
            void monitorLimitOrderExecution({
              orderId: normalizedOrderId,
              orderType: limitOrderResponse.order.type,
              triggerType: limitOrderResponse.order.triggerType as "marketCap" | "bonding" | "devSell" | undefined,
              bondingTarget: Number(limitOrderResponse.order.bondingTarget ?? NaN),
              targetMarketCap: Number(limitOrderResponse.order.targetMC ?? numericTargetMc),
              submittedSolAmount: Number(limitOrderResponse.order.solAmount ?? numericAmount),
              submittedTokenAmount: Number(limitOrderResponse.order.tokenAmount ?? 0),
            });
          }
          posthog.capture("limit_order_created", { symbol: token.symbol, mint: token.mint });
          setSuccessMessage(`Limit order for ${token.symbol} created successfully!`);
          setAmount("");
          setTargetMC("");
        } catch (error: any) {
          const errorMsg =
            error?.message?.length > 60 ? `${error.message.substring(0, 57)}...` : error?.message || "Failed to create limit order";
          toast.error(errorMsg, { duration: 6000, style: ORDER_TOAST_STYLE });
          setSuccessMessage(null);
        } finally {
          setIsLoading(false);
        }
        return;
      }

      if (mode === "buy") {
        const requested = Number(amount || 0);
        if (!requested || requested <= 0) {
          setIsLoading(false);
          setSuccessMessage(null);
          showEnhancedToast("error", "Please enter a valid SOL amount", {
            title: "Invalid Amount",
          });
          return;
        }
      } else if (mode === "sell") {
        const percentage = Number(amount || 0);
        if (!percentage || percentage <= 0) {
          setIsLoading(false);
          setSuccessMessage(null);
          showEnhancedToast("error", "Please enter a valid percentage", {
            title: "Invalid Percentage",
          });
          return;
        }
        if (percentage > 100) {
          setIsLoading(false);
          setSuccessMessage(null);
          showEnhancedToast("error", "Percentage cannot exceed 100%", {
            title: "Invalid Percentage",
          });
          return;
        }
      }

      // For SELL trades, use the same animated toast flow as buy
      if (mode === "sell") {
        const sellPercentage = Number(amount);
        const poolType = getPoolTypeFromToken(token);

        // Pre-validate sell before showing toast
        const sellValidation = validateSolanaSell(sellPercentage);
        if (!sellValidation.valid) {
          showTradeValidationError(sellValidation.error, getResolvedTokenImage(token), token.symbol || token.name || 'Token');
          setIsLoading(false);
          return { success: false };
        }

        // Generate random timer cap (0.40-0.60s)
        const timerCap = 0.30 + Math.random() * 0.20;
        const uniqueToastId = `solana-sell-${Date.now()}-${Math.random()}`;
        const startTime = Date.now();
        let timerFinished = false;
        let tradeErrored = false;

        // Extract token image
        const tokenImage = getResolvedTokenImage(token);
        const tokenName = token.symbol || token.name || 'Token';
        const SOLANA_LOGO = 'https://avatars.githubusercontent.com/u/92743431?s=200&v=4';

        // Show animated toast with timer (same style as buy)
        toast(
          (t) => (
            <div className="flex items-center gap-3">
              {tokenImage && (
                <img
                  src={tokenImage}
                  alt={tokenName}
                  className="w-6 h-6 rounded-full flex-shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-sm text-neutral-200 truncate">
                  Selling {tokenName}
                </span>
                <span
                  id={`timer-${uniqueToastId}`}
                  className="text-xs text-neutral-400 flex-shrink-0"
                >
                  (0.00s)
                </span>
                <span
                  id={`check-${uniqueToastId}`}
                  className="text-green-400 flex-shrink-0"
                  style={{ display: timerFinished && !tradeErrored ? 'inline' : 'none' }}
                >
                  ✓
                </span>
                <span
                  id={`link-${uniqueToastId}`}
                  className="flex-shrink-0"
                  style={{ display: 'inline-flex' }}
                >
                  <img
                    src={SOLANA_LOGO}
                    alt="Solana"
                    className="w-4 h-4 rounded-full opacity-70"
                    style={{ cursor: 'default' }}
                  />
                </span>
              </div>
            </div>
          ),
          {
            id: uniqueToastId,
            duration: Infinity,
            style: {
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '8px',
              padding: '12px',
            },
          }
        );

        // Start timer animation
        const tick = () => {
          const elapsed = (Date.now() - startTime) / 1000;
          const displayTime = Math.min(elapsed, timerCap).toFixed(2);
          const timerEl = document.getElementById(`timer-${uniqueToastId}`);
          if (timerEl) {
            timerEl.textContent = `(${displayTime}s)`;
          }

          if (!timerFinished && elapsed >= timerCap) {
            timerFinished = true;
            if (!tradeErrored) {
              const checkEl = document.getElementById(`check-${uniqueToastId}`);
              if (checkEl) {
                checkEl.style.display = 'block';
              }
            }
            timerHandle = null as any;
            return;
          }
          timerHandle = requestAnimationFrame(tick) as any;
        };
        let timerHandle = requestAnimationFrame(tick) as any;

        // Store pending toast info for WebSocket instant update (same as buy)
        pendingSolanaToastRef.current = {
          id: uniqueToastId,
          tokenImage,
          tokenName,
          fakeTime: timerCap.toFixed(2),
          startTime,
          timerHandle,
          totalSelectedWallets: 1
        };

        const cleanupTradeListener = listenForTradeEvents(token.mint || '', uniqueToastId, (v) => { tradeErrored = v; }, 'solana');

        // Optimistic chart marker — declared outside try so the catch block
        // can reference it for cleanup on failure.
        const sellMarkerId =
          `pend_${
            (typeof crypto !== "undefined" && crypto.randomUUID?.()) ||
            Math.random().toString(36).slice(2)
          }`;
        let sellMarkerInserted = false;

        try {
          // Estimate SOL credit for the optimistic header update.
          const slipFraction = settings.maxSlippage || 0.2;
          const remainingUsd = positionData?.remainingUsdValue ?? 0;
          const estSolOut =
            liveSolPrice > 0 && remainingUsd > 0
              ? (remainingUsd * (sellPercentage / 100) * (1 - slipFraction)) /
                liveSolPrice
              : 0;
          const primarySolAddr = primaryWalletAddresses.solana || "";

          if (primarySolAddr && token.mint) {
            addPendingTrade({
              id: sellMarkerId,
              mint: token.mint,
              walletAddress: primarySolAddr.toLowerCase(),
              side: "sell",
              amountToken: sellPercentage,
              priceUsd: token.usd_price,
              timestamp: Date.now() - 1500,
              status: "pending",
              createdAt: Date.now(),
            });
            sellMarkerInserted = true;
          }

          const sellResult = await tradeSellPercentage(
            {
              tokenAddress: token.mint || '',
              percentageToSell: sellPercentage,
              poolAddress: resolvedPoolAddress,
              baseMint: token.mint || '',
              quoteMint: SOL_MINT_ADDRESS,
              poolType,
              originalPairAddress: resolvedPoolAddress,
              slippage: (settings.maxSlippage || 0.2) * 100,
              priorityFee: settings.priority ?? 0.0001,
              bribe: settings.bribe ?? 0,
            },
            user.bearerToken,
            estSolOut > 0 && primarySolAddr
              ? { solOut: estSolOut, walletAddress: primarySolAddr }
              : undefined
          );

          // Stop timer
          if (timerHandle) {
            cancelAnimationFrame(timerHandle);
          }

          if (sellResult?.hash) {
            // Stamp signature on the optimistic marker so the chart's
            // reconciliation can dedupe it against the real WS trade.
            if (sellMarkerInserted) {
              updatePendingTrade(sellMarkerId, {
                signature: sellResult.hash,
                status: "confirmed",
              });
            }

            // Success - update link to be clickable
            const linkEl = document.getElementById(`link-${uniqueToastId}`);
            if (linkEl) {
              const explorerUrl = `https://solscan.io/tx/${sellResult.hash}`;
              linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="${SOLANA_LOGO}" alt="Solana" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
            }
            const checkEl = document.getElementById(`check-${uniqueToastId}`);
            if (checkEl) {
              checkEl.style.display = 'block';
            }

            setSuccessMessage(`✅ Sold ${sellPercentage}% of ${tokenName}`);

            // Clear pending ref (WS may have already updated, or HTTP response just did)
            pendingSolanaToastRef.current = null;

            // Auto-dismiss after 10s
            setTimeout(() => toast.dismiss(uniqueToastId), 10000);

            // Broadcast trade completion immediately for portfolio auto-refresh
            posthog.capture("token_sell_submitted", { symbol: token.symbol, mint: token.mint, sell_pct: sellPercentage });
            broadcastTradeCompleted({
              tokenAddress: token.mint,
              tradeType: 'sell',
              chain: 'sol',
              txHash: sellResult?.hash || undefined,
              sellPercentage,
            });

            // Dispatch event to refresh chart price lines immediately
            if (typeof window !== "undefined" && token.mint) {
              window.dispatchEvent(new CustomEvent("solanaQuickTrade", { detail: { tokenAddress: token.mint } }));
            }

            // Refresh header + portfolio balance immediately
            dispatchBalanceRefresh('sol');

            // Refresh position data for the token detail page's position card
            setTimeout(async () => {
              try {
                const trades = await getTradeActivityByUser(user.id.toString());
                const tokenTrades = trades.filter(
                  (trade: any) => trade.tokenAddress?.toLowerCase() === (token.mint || "").toLowerCase()
                );

                if (tokenTrades.length > 0) {
                  let bought = 0;
                  let boughtUsdValue = 0;
                  let sold = 0;
                  let soldUsdValue = 0;

                  tokenTrades.forEach((trade: any) => {
                    if (trade.type === "Buy") {
                      bought += Number(trade.tokenAmount) || 0;
                      boughtUsdValue += Number(trade.usdValue) || 0;
                    } else if (trade.type === "Sell") {
                      sold += Number(trade.tokenAmount) || 0;
                      soldUsdValue += Number(trade.usdValue) || 0;
                    }
                  });

                  setTradeHistory({ bought, boughtUsdValue, sold, soldUsdValue });
                }

                // Refresh balance
                if (refreshBalance) {
                  refreshBalance({ force: true });
                }
              } catch (error) {
                console.error("Error refreshing position data:", error);
              }
            }, 2000);

            setIsLoading(false);
            return { success: true, txHash: sellResult.hash };
          } else {
            // Sell returned but no hash
            if (sellMarkerInserted) {
              removePendingTrade(sellMarkerId);
            }
            pendingSolanaToastRef.current = null;
            transformToastToError(uniqueToastId, sellResult?.message || 'Sell failed', tokenImage, tokenName);
            setSuccessMessage(null);
            setIsLoading(false);
            return { success: false };
          }
        } catch (error: any) {
          if (sellMarkerInserted) {
            removePendingTrade(sellMarkerId);
          }
          tradeErrored = true;
          cleanupTradeListener();
          // Stop timer on error
          if (timerHandle) {
            cancelAnimationFrame(timerHandle);
          }
          // Clear pending ref on error
          pendingSolanaToastRef.current = null;

          const errorMessage = mapTradeErrorMessage(error);

          // Side effects for specific codes (clear stale position data)
          const errorCode = error?.code || error?.response?.data?.code;
          const rawMessage = error?.message || '';
          if (errorCode === 'NO_HOLDINGS' || rawMessage.includes('Insufficient token')) {
            setTradeHistory({ bought: 0, boughtUsdValue: 0, sold: 0, soldUsdValue: 0 });
          } else if (errorCode === 'NO_LIQUIDITY' || rawMessage.includes('no liquidity across all')) {
            setTradeHistory({ bought: 0, boughtUsdValue: 0, sold: 0, soldUsdValue: 0 });
          }

          transformToastToError(uniqueToastId, errorMessage, tokenImage, tokenName);
          console.error("❌ Sell failed:", error);
          setSuccessMessage(null);
          setIsLoading(false);
          return { success: false, error };
        }
      }

      // For BUY trades, use the new Monad-style toast flow
      const buyAmount = Number(amount);
      const poolType = getPoolTypeFromToken(token);

      // Pre-calculate which wallets will actually be used (have sufficient balance)
      const { allocations, total } = buildSolanaWalletAllocations({
        amount: buyAmount,
        walletList,
        walletBalances,
        selectedWalletIds: selectedWalletIds?.sol || [],
        priorityFee: settings.priority || 0.0001,
        bribe: settings.bribe || 0,
      });
      const walletsWithBalance = allocations.length;
      const totalSelectedWallets = (selectedWalletIds?.sol || []).length || 1;
      const isMultiWallet = walletsWithBalance > 1;

      // Pre-validate before showing toast
      const ataExists = await checkAtaExists(token.mint, user?.publicKey).catch(() => null);
      const buyValidation = validateSolanaBuy(buyAmount, allocations, walletBalances, walletList, selectedWalletIds?.sol || [], settings.priority, settings.bribe, ataExists);
      if (!buyValidation.valid) {
        showTradeValidationError(buyValidation.error, getResolvedTokenImage(token), token.symbol || token.name || 'Token');
        setIsLoading(false);
        return { success: false };
      }

      // Generate random timer cap (0.40-0.60s)
      const timerCap = 0.30 + Math.random() * 0.20;
      const uniqueToastId = `solana-buy-${Date.now()}-${Math.random()}`;
      const startTime = Date.now();
      let timerFinished = false;
      let tradeErrored = false;

      // Extract token image
      const tokenImage = getResolvedTokenImage(token);
      const tokenName = token.symbol || token.name || 'Token';

      // Show animated toast with timer
      toast(
        (t) => (
          <div className="flex items-center gap-3">
            {tokenImage && (
              <img
                src={tokenImage}
                alt={tokenName}
                className="w-6 h-6 rounded-full flex-shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-sm text-neutral-200 truncate">
                Buying {tokenName}
              </span>
              <span
                id={`timer-${uniqueToastId}`}
                className="text-xs text-neutral-400 flex-shrink-0"
              >
                (0.00s)
              </span>
            <span
              id={`check-${uniqueToastId}`}
              className="text-green-400 flex-shrink-0"
              style={{ display: timerFinished && !tradeErrored ? 'inline' : 'none' }}
            >
              ✓
            </span>
            <span
              id={`link-${uniqueToastId}`}
              className="flex-shrink-0"
              style={{ display: 'inline-flex' }}
            >
              {/* Default Solana avatar (becomes clickable once tx hash arrives) */}
              <img
                src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4"
                alt="Solana"
                className="w-4 h-4 rounded-full opacity-70"
                style={{ cursor: 'default' }}
              />
            </span>
          </div>
        </div>
        ),
        {
          id: uniqueToastId,
          duration: Infinity,
          style: {
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '12px',
          },
        }
      );

      // Start timer animation - update every 50ms, show checkmark when cap is reached
      const tick = () => {
        const elapsed = (Date.now() - startTime) / 1000;
        const displayTime = Math.min(elapsed, timerCap).toFixed(2);
        const timerEl = document.getElementById(`timer-${uniqueToastId}`);
        if (timerEl) {
          timerEl.textContent = `(${displayTime}s)`;
        }

        // When timer reaches cap, show checkmark and wallet count (or placeholder for logo)
        if (!timerFinished && elapsed >= timerCap) {
          timerFinished = true;
          if (!tradeErrored) {
            const checkEl = document.getElementById(`check-${uniqueToastId}`);
            if (checkEl) {
              checkEl.style.display = 'block';
            }
          }
          const linkEl = document.getElementById(`link-${uniqueToastId}`);
          if (linkEl) {
            if (isMultiWallet) {
              // Show wallet count immediately for multi-wallet
              linkEl.textContent = `${walletsWithBalance}/${total}`;
              linkEl.className = 'text-xs text-blue-400 font-medium flex-shrink-0';
            }
            // For single wallet, leave empty - will be filled by WebSocket with logo
          }
          // Stop timer after reaching cap to avoid jitter
          timerHandle = null as any;
          return;
        }
        timerHandle = requestAnimationFrame(tick) as any;
      };
      let timerHandle = requestAnimationFrame(tick) as any;

      // Store pending toast info for WebSocket instant update
      pendingSolanaToastRef.current = {
        id: uniqueToastId,
        tokenImage,
        tokenName,
        fakeTime: timerCap.toFixed(2),
        startTime,
        timerHandle,
        totalSelectedWallets: walletsWithBalance
      };

      const cleanupTradeListener = listenForTradeEvents(token.mint || '', uniqueToastId, (v) => { tradeErrored = v; }, 'solana');

      // Optimistic chart marker — declared outside try so the catch block
      // can reference it for cleanup on failure.
      const buyMarkerId =
        `pend_${
          (typeof crypto !== "undefined" && crypto.randomUUID?.()) ||
          Math.random().toString(36).slice(2)
        }`;
      let buyMarkerInserted = false;

      try {
        const poolAddress = resolvedPoolAddress;
        const baseMint = token.mint || '';
        const quoteMint = SOL_MINT_ADDRESS;

        const buyMarkerPrimaryAddr = primaryWalletAddresses.solana || "";
        if (buyMarkerPrimaryAddr && baseMint) {
          addPendingTrade({
            id: buyMarkerId,
            mint: baseMint,
            walletAddress: buyMarkerPrimaryAddr.toLowerCase(),
            side: "buy",
            amountSol: buyAmount,
            priceUsd: token.usd_price,
            timestamp: Date.now() - 1500,
            status: "pending",
            createdAt: Date.now(),
          });
          buyMarkerInserted = true;
        }

        notifyTradePending({ tokenAddress: baseMint, tradeType: 'buy', chain: 'sol' });
        const multiResult = await executeSolanaMultiBuy({
          poolAddress,
          baseMint,
          quoteMint,
          amountSOL: buyAmount,
          poolType,
        originalPairAddress: token.pair_address || resolvedPoolAddress,
        slippage: settings.maxSlippage,
        priorityFee: settings.priority,
          bribe: settings.bribe,
          mevMode: settings.mevMode,
          autoFee: settings.autoFee,
          maxFee: settings.maxFee,
          rpc: settings.rpc,
          tokenName: token.name,
          tokenSymbol: token.symbol,
          imageUrl: await resolveTokenImage(token) || undefined,
          authToken: user.bearerToken,
          walletList,
          walletBalances,
          selectedWalletIds: selectedWalletIds?.sol || [],
          onTxHash: ({ txHash }) => {
            if (pendingSolanaToastRef.current?.id === uniqueToastId && txHash) {
              const linkEl = document.getElementById(`link-${uniqueToastId}`);
              if (linkEl) {
                const explorerUrl = `https://solscan.io/tx/${txHash}`;
                linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4" alt="Solana" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
                linkEl.className = '';
              }
              // Fire early so Portfolio refetches immediately when Solscan link appears
              broadcastTradeCompleted({ tokenAddress: baseMint, tradeType: 'buy', chain: 'sol', txHash, tokenName: token.name, tokenSymbol: token.symbol, imageUrl: tokenImage, solAmountSpent: amount });
            }
          },
        });

        // If single wallet and we have a tx hash, show clickable Solana icon immediately
        const firstTxHash =
          (multiResult?.results || [])
            .map((r: any) => (r.result as any)?.hash || (r.result as any)?.txid)
            .find(Boolean);

        // Stamp signature on the optimistic marker so the chart's
        // reconciliation can dedupe it against the real WS trade.
        // If no txHash returned, the trade was rejected by a soft pre-flight
        // check (insufficient SOL, low liquidity, etc.) — remove the marker.
        if (buyMarkerInserted) {
          if (firstTxHash) {
            updatePendingTrade(buyMarkerId, {
              signature: firstTxHash,
              status: "confirmed",
            });
          } else {
            removePendingTrade(buyMarkerId);
          }
        }

        if (firstTxHash && !isMultiWallet) {
          const linkEl = document.getElementById(`link-${uniqueToastId}`);
          if (linkEl) {
            const explorerUrl = `https://solscan.io/tx/${firstTxHash}`;
            linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4" alt="Solana" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
            linkEl.className = '';
          }
          if (timerHandle) {
            cancelAnimationFrame(timerHandle);
          }
          setTimeout(() => toast.dismiss(uniqueToastId), 10000);
        }

        // Success - refresh balance and position
        await refreshBalance({ force: true });

        setTimeout(async () => {
          try {
            const trades = await getTradeActivityByUser(user.id.toString());
            const tokenTrades = trades.filter(
              (trade: any) => trade.tokenAddress?.toLowerCase() === (token.mint || "").toLowerCase()
            );

            if (tokenTrades.length > 0) {
              let bought = 0;
              let boughtUsdValue = 0;
              let sold = 0;
              let soldUsdValue = 0;

              tokenTrades.forEach((trade: any) => {
                if (trade.type === "Buy") {
                  bought += Number(trade.tokenAmount) || 0;
                  boughtUsdValue += Number(trade.usdValue) || 0;
                } else if (trade.type === "Sell") {
                  sold += Number(trade.tokenAmount) || 0;
                  soldUsdValue += Number(trade.usdValue) || 0;
                }
              });

              setTradeHistory({ bought, boughtUsdValue, sold, soldUsdValue });
            }

            // Dispatch event to refresh chart price lines
            if (typeof window !== "undefined" && token.mint) {
              window.dispatchEvent(new CustomEvent("solanaQuickTrade", { detail: { tokenAddress: token.mint } }));
            }
          } catch (error) {
            console.error("Error refreshing position data:", error);
          }
        }, 2000);

        broadcastTradeCompleted({ tokenAddress: token.mint, tradeType: 'buy', chain: 'sol', tokenName: token.name, tokenSymbol: token.symbol, imageUrl: tokenImage, solAmountSpent: amount });
        posthog.capture("token_buy_submitted", { symbol: token.symbol, mint: token.mint, amount_sol: amount });
        setSuccessMessage(`✅ Bought ${tokenName} successfully!`);
        setIsLoading(false);
        return { success: true };
      } catch (error: any) {
        if (buyMarkerInserted) {
          removePendingTrade(buyMarkerId);
        }
        tradeErrored = true;
        cleanupTradeListener();
        // Stop timer on error
        if (timerHandle) {
          cancelAnimationFrame(timerHandle);
        }

        // Transform pending toast to error in-place
        console.error("❌ Solana buy failed:", error);
        if (pendingSolanaToastRef.current) {
          transformToastToError(pendingSolanaToastRef.current.id, mapTradeErrorMessage(error), tokenImage, tokenName);
          pendingSolanaToastRef.current = null;
        }

        setSuccessMessage(null);
        setIsLoading(false);
        return { success: false, error };
      }
    },
    [
      amount,
      mode,
      settings,
      solBalance,
      tab,
      targetMC,
      token,
      user,
      effectivePoolAddress,
      monitorLimitOrderExecution,
    ]
  );

  // High slippage warning handlers
  const handleSlippageWarningContinue = useCallback(() => {
    setShowSlippageWarning(false);
    const next = { ...(pendingTradeOptions || {}), skipSlippage: true };
    void initiateTrade(next);
  }, [pendingTradeOptions, initiateTrade]);

  const handleSlippageWarningCancel = useCallback(() => {
    setShowSlippageWarning(false);
    setPendingTradeOptions(null);
    setIsLoading(false);
  }, []);

  const handleLiquidityWarningContinue = useCallback(() => {
    setShowLiquidityWarning(false);
    const next = { ...(pendingTradeOptions || {}), skipLiquidity: true };
    void initiateTrade(next);
  }, [pendingTradeOptions, initiateTrade]);

  const handleLiquidityWarningCancel = useCallback(() => {
    setShowLiquidityWarning(false);
    setPendingTradeOptions(null);
    setIsLoading(false);
  }, []);

  const isSniperMode = tab === "adv" && migrationMode;
  const isDevSellMode = tab === "adv" && devSellMode;

  return (
    <div
      className="flex flex-col text-[12px] leading-tight"
      style={{ backgroundColor: '#101114', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif', paddingBottom: '100px' }}
    >
      <div className="group">
      {/* ===== A. Time buttons (revealed on stats hover) ===== */}
      <div className="px-3 pt-2 pb-2 border-neutral-800 hidden group-hover:block">
        <div className="mx-auto w-full max-w-xl overflow-hidden">
          <div className="flex rounded-xl border border-neutral-700">
            {(["5m", "1h", "6h", "24h"] as TimeRange[]).map((rng) => {
              // NOTE: Percentage change display commented out - backend needs to add price_change_percent to volume data
              // let ch = 0;
              // if (wsData && wsData.data && wsData.data.timeframes) {
              //   const changeMap: Record<TimeRange, number> = {
              //     "5m": Number(wsData.data.timeframes["5m"]?.change ?? 0),
              //     "1h": Number(wsData.data.timeframes["1h"]?.change ?? 0),
              //     "6h": Number(wsData.data.timeframes["6h"]?.change ?? 0),
              //     "24h": Number(wsData.data.timeframes["24h"]?.change ?? 0),
              //   };
              //   ch = changeMap[rng] ?? 0;
              // } else {
              //   const changeMap: Record<TimeRange, number> = {
              //     "5m": Number((token as any).price_change_5m ?? (token as any).change_5m ?? 0),
              //     "1h": Number((token as any).price_change_1h ?? (token as any).change_1h ?? 0),
              //     "6h": Number((token as any).price_change_6h ?? (token as any).change_6h ?? 0),
              //     "24h": Number((token as any).price_change_24h ?? (token as any).change_24h ?? 0),
              //   };
              //   ch = changeMap[rng] ?? 0;
              // }
              // const isUp = ch >= 0;
              // const abs = Math.abs(ch);

              return (
                <button
                  key={rng}
                  onClick={() => setTimeRange(rng)}
                  aria-pressed={timeRange === rng}
                  className={cx(
                    "flex-1 text-center flex flex-col items-center justify-center cursor-pointer px-2 py-2 border-neutral-700",
                    timeRange === rng ? "bg-neutral-700 ring-1 ring-white/10" : "hover:bg-neutral-700",
                    rng == "5m" ? `rounded-tl-xl rounded-bl-xl` : ``,
                    rng == "24h" ? `rounded-tr-xl rounded-br-xl` : `border-r`
                  )}
                >
                  <span
                    className={cx(
                      "text-[11px] tracking-wide uppercase font-semibold",
                      timeRange === rng ? "text-[#E6E7EA]" : "text-[#9CA3AF]"
                    )}
                  >
                    {rng}
                  </span>
                  {/* Percentage display - uncomment when backend adds price_change_percent to volume data
                  <span className={cx("text-[10px] tabular-nums", isUp ? "text-[#70E0B0]" : "text-[#FF4D7F]")}>
                    {isUp ? "+" : "-"}
                    {abs.toFixed(2)}%
                  </span>
                  */}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===== B. Real-time Stats ===== */}
      <div className="px-3 py-1.5 border-b border-[#2A2B33] !h-[60px] flex flex-col justify-center">
        <div className="grid grid-cols-4 gap-3 tabular-nums">
          <div>
            <div className="text-[10px] text-[#9CA3AF] uppercase tracking-wide whitespace-nowrap">
              {timeRange} Vol
            </div>
            <div className="text-[#E6E7EA] whitespace-nowrap text-[11px]">${formatCompactNumber(Math.round(volume || 0))}</div>
          </div>
          <div>
            <div className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Buys</div>
            <div className="whitespace-nowrap tabular-nums text-[#70E0B0] flex items-baseline gap-0.5 text-[11px]">
              <span>{formatCompactNumber(Math.round(buys ?? 0))}</span>
              <span className="text-[#9CA3AF]">/</span>
              <span className="text-[#70E0B0]">${formatCompactNumber(Math.round(buyVolume || 0))}</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Sells</div>
            <div className="whitespace-nowrap tabular-nums text-[#FF4D7F] flex items-baseline gap-0.5 text-[11px]">
              <span>{formatCompactNumber(Math.round(sells ?? 0))}</span>
              <span className="text-[#9CA3AF]">/</span>
              <span className="text-[#FF4D7F]">${formatCompactNumber(Math.round(sellVolume || 0))}</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Net</div>
            <div className={cx("whitespace-nowrap tabular-nums text-[11px]", netVolume >= 0 ? "text-[#70E0B0]" : "text-[#FF4D7F]")}>
              {netVolume >= 0 ? "+" : "-"}${formatCompactNumber(Math.round(Math.abs(netVolume)))}
            </div>
          </div>
        </div>
        <div className="mt-1 h-0.5 w-full rounded-full bg-[#25282B] relative overflow-hidden">
          <div className="absolute left-0 top-0 h-full" style={{ width: `${buyPercentage}%`, background: AX.mint }} />
          <div className="absolute right-0 top-0 h-full" style={{ width: `${sellPercentage}%`, background: AX.sell }} />
        </div>
      </div>
      </div>

      {/* ===== C. Buy/Sell switcher ===== */}
      <div className="px-3 py-1.5 -mt-px border-b border-[#2A2B33]">
        <div className="mx-auto w-full max-w-xl relative">
          <div className="relative h-9 rounded-lg border border-[#2A2B33] bg-[#101114] overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full w-1/2 rounded-md transition-transform duration-200"
              style={{
                transform: mode === "sell" ? "translateX(100%)" : "translateX(0%)",
                background: mode === "buy" ? AX.mint : AX.sell,
              }}
            />
            <div className="relative z-10 grid grid-cols-2 h-full">
              <button
                className={cx(
                  "cursor-pointer select-none text-[13px] font-semibold",
                  "flex items-center justify-center h-full",
                  mode === "buy" ? "text-black" : "text-[#C7CBD1] hover:text-white"
                )}
                onClick={() => setMode("buy")}
              >
                Buy
              </button>
              <button
                className={cx(
                  "cursor-pointer select-none text-[13px] font-semibold",
                  "flex items-center justify-center h-full",
                  mode === "sell" ? "text-black" : "text-[#C7CBD1] hover:text-white"
                )}
                onClick={() => setMode("sell")}
              >
                Sell
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== D. Tabs ===== */}
      <div className="relative px-3 pt-2.5 pb-1 border-b border-[#2A2B33]">
        <div className="flex items-center justify-start gap-6">
          {(["market", "limit", "adv"] as const).map((t) => (
            <button
              key={t}
              className={cx(
                tabBtn,
                "hover:text-[#E6E7EA]",
                tab === t && "text-[#70E0B0] border-b-2 border-[#70E0B0]",
                isMigratingToken && t === "market" && "opacity-50 cursor-not-allowed blur-sm"
              )}
              onClick={() => {
                if (isMigratingToken && t === "market") return; // Disable market tab for migrating tokens
                setTab(t);
              }}
              disabled={isMigratingToken && t === "market"}
            >
              {t === "adv" ? "Adv." : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Wallet picker trigger - right side of tabs (dropdown is portaled below) */}
        <div ref={walletPickerRef} className="absolute right-3 top-1/2 -translate-y-1/2">
          <button
            ref={walletTriggerRef}
            type="button"
            onClick={() => setWalletPickerOpen((v) => !v)}
            className="flex items-center gap-2 rounded-md border bg-[#101114] px-2 py-1 text-[11px] font-medium text-[#E6E7EA] transition-colors hover:border-[#70E0B0]"
            style={{ borderColor: AX.border }}
            title="Select trading wallets"
          >
            <span className="flex items-center gap-1">
              <FaWallet size={11} style={{ color: AX.muted }} />
              <span>{selectedWalletCount}</span>
            </span>
            <span className="flex items-center gap-1">
              <SiSolana size={11} style={{ fill: "url(#sol-gradient-trade)" }} />
              <span>{totalSelectedSolBalance.toFixed(2)}</span>
            </span>
          </button>
          {/* Shared SVG gradient definition for SiSolana icons inside the wallet picker */}
          <svg width="0" height="0" className="absolute" aria-hidden="true">
            <defs>
              <linearGradient id="sol-gradient-trade" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#9945FF" />
                <stop offset="100%" stopColor="#14F195" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Wallet picker dropdown - portaled to body so it never gets clipped or stacked behind trade-panel content */}
        {walletPickerOpen && walletPickerAnchor && typeof document !== "undefined" && createPortal(
          <div
            ref={walletDropdownRef}
            className="fixed w-72 overflow-hidden rounded-lg border shadow-xl"
            style={{
              top: walletPickerAnchor.top,
              right: walletPickerAnchor.right,
              backgroundColor: AX.bg,
              borderColor: AX.border,
              zIndex: 99999,
            }}
            onClick={(e) => e.stopPropagation()}
          >
              {/* Selection action row */}
              <div className="flex items-center gap-2 border-b p-2" style={{ borderColor: AX.border }}>
                <button
                  type="button"
                  onClick={() => {
                    if (allWalletsSelected) setSelectedWalletsForChain?.([], "sol");
                    else selectAllWalletsForChain?.("sol");
                  }}
                  className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: allWalletsSelected ? AX.surface2 : AX.surface,
                    color: AX.text,
                    border: `1px solid ${allWalletsSelected ? AX.mint : AX.border}`,
                  }}
                >
                  {allWalletsSelected ? "Unselect All" : "Select All"}
                </button>
                <button
                  type="button"
                  onClick={() => selectWalletsWithFunds?.("sol")}
                  className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: AX.surface,
                    color: AX.muted,
                    border: `1px solid ${AX.border}`,
                  }}
                >
                  Select All with Balance
                </button>
              </div>

              {/* Wallet list */}
              <div className="max-h-72 overflow-y-auto">
                {solWallets.length === 0 ? (
                  <div className="p-4 text-center text-xs" style={{ color: AX.muted }}>
                    No Solana wallets yet.
                  </div>
                ) : (
                  solWallets.map((wallet: any) => {
                    const isSelected = selectedWalletSet.has(wallet.id);
                    const isPrimary = wallet.isPrimary;
                    const address = (wallet.solanaAddress || "").trim();
                    const balance = address
                      ? walletBalances?.[address] ?? wallet.balance ?? 0
                      : wallet.balance ?? 0;
                    const truncated =
                      address && address.length > 8
                        ? `${address.slice(0, 4)}...${address.slice(-4)}`
                        : address || "—";
                    return (
                      <div
                        key={wallet.id}
                        className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0"
                        style={{ borderColor: AX.border }}
                      >
                        <button
                          type="button"
                          onClick={() => toggleWalletSelection(wallet.id)}
                          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-all"
                          style={{
                            borderColor: isSelected ? "#F97316" : isPrimary ? "#F97316" : AX.border,
                            backgroundColor: isSelected ? "#F9731633" : "transparent",
                          }}
                          title={isSelected ? "Unselect wallet" : "Select wallet"}
                        >
                          {isSelected && (
                            <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "#F97316" }} />
                          )}
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className="truncate text-sm font-medium"
                              style={{ color: isPrimary ? "#F97316" : AX.text }}
                            >
                              {wallet.label || "Unnamed Wallet"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px]" style={{ color: AX.muted }}>
                              {truncated}
                            </span>
                            {address && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyWalletAddress(address);
                                }}
                                className="text-[#9CA3AF] transition-colors hover:text-white"
                                title="Copy address"
                              >
                                {copiedWalletAddr === address ? (
                                  <FaCheck size={10} style={{ color: AX.mint }} />
                                ) : (
                                  <FaCopy size={10} />
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        <div
                          className="flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
                          style={{ backgroundColor: AX.surface, color: AX.text }}
                        >
                          <SiSolana size={10} style={{ fill: "url(#sol-gradient-trade)" }} />
                          <span>{(balance || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>,
            document.body
          )}
      </div>

      {/* ===== Migration Message for High Bonding Meteora Tokens ===== */}
      {isMigratingToken && (
        <div className="px-3 pt-4 pb-2">
          <div className="text-center">
            <MeteoraMigrationLogo />
            <p className="text-white text-sm leading-relaxed">
              This pair is currently migrating. This may take up to 30 minutes. In the meantime, you can still place limit orders, and buy or sell on migration!
            </p>
          </div>
        </div>
      )}

      {/* ===== E. Migration/Dev Sell Toggle ===== */}
      {tab === "adv" && (
        <div className="px-3 pt-2">
          <div className="mx-auto w-full max-w-xs relative rounded-md border border-[#2A2B33] bg-[#1E1F26] p-0.5">
            <div
              className="absolute top-0 left-0 h-full w-1/2 rounded-md transition-transform duration-200"
              style={{
                transform: migrationMode ? "translateX(0%)" : "translateX(100%)",
                background: '#4B5563',
              }}
            />
            <div className="relative flex">
              <button
                type="button"
                className={cx(
                  "flex-1 py-1.5 text-[12px] font-medium transition-colors duration-200 rounded-md flex items-center justify-center gap-1",
                  migrationMode ? "text-[#70E0B0]" : "text-[#9CA3AF]"
                )}
                onClick={() => {
                  setMigrationMode(true);
                  setDevSellMode(false);
                }}
              >
                <span>»</span>
                Migration
              </button>
              <button
                type="button"
                className={cx(
                  "flex-1 py-1.5 text-[12px] font-medium transition-colors duration-200 rounded-md flex items-center justify-center gap-1",
                  devSellMode ? "text-[#70E0B0]" : "text-[#9CA3AF]"
                )}
                onClick={() => {
                  setDevSellMode(true);
                  setMigrationMode(false);
                }}
              >
                <span>↑</span>
                Dev Sell
              </button>
            </div>
          </div>
          {devSellMode && !creatorAddress && (
            <div className="mt-2 text-[11px] text-[#FFB347] text-center">
              Developer wallet not detected yet. Connect to token service to enable dev sell mirroring.
            </div>
          )}
        </div>
      )}

      {/* ===== F. Amount ===== */}
      <div className="px-3 pt-2">
        <div className="mx-auto w-full max-w-xl relative rounded-lg border border-[#2A2B33] bg-[#25282B]">
          <div className="flex items-center justify-between gap-3 px-3 py-0.5">
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wide">
                {isSniperMode ? "Sniper Amount" : "Amount"}
              </span>
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                className="h-6 w-20 bg-transparent border-none text-left pl-2
                           text-[12px] font-normal text-[#E6E7EA] tabular-nums
                           placeholder:text-[#9CA3AF] focus:outline-none"
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}
                placeholder="0.00"
                value={isSniperMode ? sniperAmount : amount}
                onChange={(e) => {
                  const raw = e.target.value.replace(/,/g, ".");
                  if (!allowDecimal(raw)) return;
                  if (isSniperMode) {
                    setSniperAmount(raw);
                  } else {
                    setAmount(raw);
                  }
                }}
                onBlur={(e) => {
                  if (isSniperMode) return;
                  const value = Number(e.target.value);
                  if (mode === "buy" && value > 0) {
                    const poolType = (getPoolTypeFromToken(token) || token?.launchpad_protocol || '').toLowerCase();
                    const minimums: Record<string, number> = {
                      "meteora amm v2": 0.0001,
                      "meteora amm v1": 0.0001,
                      "raydium cpmm": 0.0001,
                      "raydium amm": 0.0001,
                      "pumpamm": 0.0001,
                      "pumpfun": 0.0001,
                      "meteora dbc": 0.0001,
                      "meteora": 0.0001,
                    };
                    const minAmount = minimums[poolType] ?? 0.0001;

                    if (value < minAmount) {
                      showEnhancedToast('error', `Minimum trade size is ${minAmount} SOL`, {
                        title: 'Amount Too Small',
                        description: `Increase the amount to at least ${minAmount} SOL before placing the order.`,
                      });
                    }
                  }
                }}
              />
            </div>
            <div className="flex items-center justify-center w-5 h-5">
              {mode === "sell" ? (
                <span className="text-[14px] font-semibold text-[#E6E7EA]">%</span>
              ) : (
                <svg width="16" height="16" viewBox="0 0 397.7 311.7" fill="none">
                  <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 237.9z" fill="url(#paint0_linear)"/>
                  <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1L333.1 73.8c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="url(#paint1_linear)"/>
                  <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" fill="url(#paint2_linear)"/>
                  <defs>
                    <linearGradient id="paint0_linear" x1="360.8" y1="351.5" x2="141.44" y2="132.14" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#00FFA3"/>
                      <stop offset="1" stopColor="#DC1FFF"/>
                    </linearGradient>
                    <linearGradient id="paint1_linear" x1="264.8" y1="116.2" x2="45.44" y2="-103.16" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#00FFA3"/>
                      <stop offset="1" stopColor="#DC1FFF"/>
                    </linearGradient>
                    <linearGradient id="paint2_linear" x1="312.5" y1="233.9" x2="93.14" y2="14.54" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#00FFA3"/>
                      <stop offset="1" stopColor="#DC1FFF"/>
                    </linearGradient>
                  </defs>
                </svg>
              )}
            </div>
          </div>
          
          {/* Minimum hint removed per request */}

          {/* Presets */}
          {(() => {
            const isSellWithPosition = mode === "sell" && positionData && positionData.remaining > 0;
            const isBuyWithPrice = mode === "buy" && effectiveBuyTokenPrice > 0;
            const showSubtext = isSellWithPosition || isBuyWithPrice;
            const presetRowHeight = showSubtext ? "h-9" : "h-7";
            return (
          <div className="border-t border-[#000] rounded-b-lg overflow-hidden">
            <div className="grid grid-cols-5">
              {amountPresets.map((opt, i) => {
                const currentValue = editingPresets ? (presetDrafts[i] || "") : String(opt);
                const active = (isSniperMode ? sniperAmount : amount) === currentValue;
                const tokenAmountForPreset = isSellWithPosition
                  ? (opt / 100) * positionData.remaining
                  : isBuyWithPrice
                    ? opt / effectiveBuyTokenPrice
                    : null;
                if (editingPresets) {
                  return (
                    <div key={i} className={`${presetRowHeight} border-r border-[#000] last:border-r-0 min-w-0`}>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="h-full w-full bg-[#101114] text-center text-[12px] font-semibold text-[#E6E7EA]
                                   outline-none focus:bg-[#1E1F26]"
                        value={presetDrafts[i] ?? ""}
                        onChange={(e) => {
                          const v = e.target.value.replace(/,/g, ".");
                          if (allowDecimal(v)) {
                            setPresetDrafts((d) => d.map((x, idx) => (idx === i ? v : x)));
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitPresetDrafts();
                          }
                        }}
                      />
                    </div>
                  );
                }
                return (
                  <button
                    key={i}
                    type="button"
                    className={cx(
                      `${presetRowHeight} border-r border-[#000] last:border-r-0 text-[12px] font-semibold tabular-nums`,
                      active
                        ? "bg-[#2A2B33] text-[#E6E7EA]"
                        : "bg-[#101114] hover:bg-[#1E1F26] text-[#E6E7EA]"
                    )}
                    onClick={() => {
                      if (isSniperMode) {
                        setSniperAmount(String(opt));
                      } else {
                        setAmount(String(opt));
                      }
                    }}
                  >
                    {tokenAmountForPreset !== null ? (
                      <div className="flex flex-col items-center justify-center leading-tight">
                        <span>{opt}{mode === "sell" ? "%" : ""}</span>
                        <span className="text-[9px] text-[#9CA3AF] font-normal">
                          {mode === "buy" ? "~" : ""}{formatCompactNumber(tokenAmountForPreset)}
                        </span>
                      </div>
                    ) : (
                      opt
                    )}
                  </button>
                );
              })}
              {!editingPresets ? (
                <button
                  type="button"
                  onClick={() => setEditingPresets(true)}
                  className={`${presetRowHeight} bg-[#101114] hover:bg-[#1E1F26] text-[#E6E7EA]`}
                  title="Edit preset values"
                >
                  <LuPencil className="mx-auto h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={commitPresetDrafts}
                  className={`${presetRowHeight} bg-[#1E1F26] text-[#E6E7EA] hover:bg-[#25282B]`}
                  title="Done"
                >
                  <LuCheck className="mx-auto h-4 w-4" />
                </button>
              )}
            </div>
          </div>
            );
          })()}
        </div>
      </div>

      {/* ===== F. LIMIT FIELDS (with SLIDER) ===== */}
      {tab === "limit" && (
        <div className="px-3 pt-2 space-y-3">
          {/* Market cap input */}
          <div className=" pt-2 pb-3">
            <div className="mx-auto w-full max-w-xl relative rounded-lg border border-[#2A2B33] bg-[#25282B] mb-3">
              <div className="flex items-center justify-between gap-3 px-3 py-1.5">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wide">MKT CAP</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    className="h-8 w-20 bg-transparent border-none text-left pl-2
                               text-[12px] font-normal text-[#E6E7EA] tabular-nums
                               placeholder:text-[#9CA3AF] focus:outline-none"
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}
                    placeholder="0"
                    value={targetMC}
                    onChange={(e) => {
                      manualTargetOverrideRef.current = true;
                      const v = e.target.value.replace(/,/g, ".");
                      if (/^\d*\.?\d*$/.test(v)) {
                        setTargetMC(v);
                        if (tab === "limit") {
                          const num = Number(v);
                          if (Number.isFinite(num) && num > 0) {
                            window.dispatchEvent(new CustomEvent(LIMIT_PREVIEW_EVENT, { detail: { targetMC: num } }));
                          }
                        }
                      }
                    }}
                  />
                </div>
                <span className="text-[11px] font-normal text-[#9CA3AF]">$</span>
              </div>
            </div>

            {/* Slider row */}
            <div className="flex items-center gap-3 ml-2">
              {/* slider + ticks */}
              <div className="flex-1">
                <div className="relative h-4 flex items-center">
                  {/* Base track */}
                  <div className="absolute top-1/2 left-0 w-full h-0.5 bg-[#2A2B33] rounded-lg"></div>
                  
                  {/* Markings */}
                  <div className="absolute top-1/2 left-0 w-full h-0.5 flex justify-between items-center pointer-events-none">
                    <div className="w-px h-1 bg-[#9CA3AF] -mt-0.5"></div>
                    <div className="w-px h-1 bg-[#9CA3AF] -mt-0.5"></div>
                    <div className="w-px h-1.5 bg-[#E6E7EA] -mt-0.5"></div>
                    <div className="w-px h-1 bg-[#9CA3AF] -mt-0.5"></div>
                    <div className="w-px h-1 bg-[#9CA3AF] -mt-0.5"></div>
                  </div>
                  
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    step={1}
                    value={Number(sliderPct) || 0}
                    onChange={(e) => {
                      const p = clamp(Number(e.target.value), -100, 100);
                      setSliderPct(p);
                      const baseForSlider = (sliderBaseMarketCap ?? Number(targetMC)) || 0;
                      if (baseForSlider > 0) {
                        lastSliderBaseRef.current = baseForSlider;
                        manualTargetOverrideRef.current = false;
                        const raw = baseForSlider * (1 + p / 100);
                        const next = baseForSlider < 10
                          ? Math.round(raw * 100) / 100
                          : baseForSlider < 1000
                            ? Math.round(raw * 10) / 10
                            : Math.round(raw);
                        setTargetMC(String(Math.max(0, next)));
                        window.dispatchEvent(new CustomEvent(LIMIT_PREVIEW_EVENT, { detail: { targetMC: Math.max(0, next) } }));
                      }
                    }}
                    className="w-full h-0.5 appearance-none cursor-pointer slider relative z-10 bg-transparent"
                    style={{
                      background: `linear-gradient(to right, 
                        ${Number(sliderPct) >= 0
                          ? `#2A2B33 0%, #2A2B33 50%, #526fff 50%, #526fff ${50 + (Number(sliderPct) / 2)}%, #2A2B33 ${50 + (Number(sliderPct) / 2)}%, #2A2B33 100%`
                          : `#2A2B33 0%, #2A2B33 ${50 + (Number(sliderPct) / 2)}%, #FF4D7F ${50 + (Number(sliderPct) / 2)}%, #FF4D7F 50%, #2A2B33 50%, #2A2B33 100%`
                        }`
                    }}
                  />
                  <style jsx>{`
                    .slider::-webkit-slider-thumb {
                      appearance: none;
                      width: 16px;
                      height: 16px;
                      border-radius: 50%;
                      background: #526fff;
                      cursor: pointer;
                      border: none;
                      outline: none;
                      z-index: 2;
                    }
                    .slider::-moz-range-thumb {
                      width: 16px;
                      height: 16px;
                      border-radius: 50%;
                      background: #526fff;
                      cursor: pointer;
                      border: none;
                      outline: none;
                      z-index: 2;
                    }
                    .slider::-webkit-slider-track {
                      background: transparent;
                    }
                    .slider::-moz-range-track {
                      background: transparent;
                    }
                  `}</style>
                </div>
                {/* tick labels */}
                <div className="mt-2 flex justify-between text-[9px] text-[#9CA3AF] font-normal">
                  <span>-100%</span>
                  <span>-50%</span>
                  <span>0%</span>
                  <span>+50%</span>
                  <span>+100%</span>
                </div>
              </div>

              {/* % box */}
              <div className="w-18">
                <div className="relative">
                  <input
                    type="number"
                    min={-100}
                    max={100}
                    step={1}
                    value={sliderPct}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        setSliderPct("");
                        return;
                      }
                      const p = clamp(Number(raw), -100, 100);
                      if (Number.isNaN(p)) return;
                      setSliderPct(p);
                      const baseForSlider = (sliderBaseMarketCap ?? Number(targetMC)) || 0;
                      if (baseForSlider > 0) {
                        lastSliderBaseRef.current = baseForSlider;
                        manualTargetOverrideRef.current = false;
                        const raw = baseForSlider * (1 + p / 100);
                        const next = baseForSlider < 10
                          ? Math.round(raw * 100) / 100
                          : baseForSlider < 1000
                            ? Math.round(raw * 10) / 10
                            : Math.round(raw);
                        setTargetMC(String(Math.max(0, next)));
                        window.dispatchEvent(new CustomEvent(LIMIT_PREVIEW_EVENT, { detail: { targetMC: Math.max(0, next) } }));
                      }
                    }}
                    className="h-8 w-full rounded border border-[#2A2B33] bg-[#101114] px-2 pr-5 text-[12px] font-semibold text-[#E6E7EA] outline-none focus:border-[#52c5ff] focus:ring-1 focus:ring-[#52c5ff]/20 transition-all duration-200"
                  />
                  <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-[#9CA3AF] font-normal">%</span>
                </div>
              </div>
            </div>

            {/* helper if base MC is unknown */}
            {!sliderBaseMarketCap ? (
              <div className="mt-2 text-[9px] text-[#9CA3AF] font-normal">
                Current market cap unavailable — enter a target value directly to enable the slider.
              </div>
            ) : null}
          </div>

        </div>
      )}

      {/* ===== G. ANALYTICS TAB ===== */}
      {/* Analytics panel commented out
      {tab === "analytics" && (
        <div className="px-3 pt-2 pb-4">
          <TokenAnalyticsPanel
            mintAddress={token.mint || ''}
            tokenInfo={{
              symbol: token.symbol,
              name: token.name,
              pool: effectivePoolAddress,
              dex: getPoolTypeFromToken(token),
            }}
          />
        </div>
      */}

      {/* ===== Settings ===== */}
      <div className="mx-3 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[#E6E7EA]">
        <InterstateTooltip label="Max Slippage">
          <span className="flex items-center gap-1 text-[#9CA3AF]">
            <FaRunning className="opacity-80" /> {settings.maxSlippage * 100}%
          </span>
        </InterstateTooltip>
        <InterstateTooltip
          label={`Priority Fee: ${settings.priority}. ${settings.priority < 0.01 ? "We recommend a priority fee of atleast 0.01" : ""}`}
        >
          <span className="flex items-center gap-1 text-[#9CA3AF]">
            <FaGasPump className="opacity-90" /> {settings.priority}
            {settings.priority < 0.01 ? <span className="text-[#FF4D7F]">⚠</span> : null}
          </span>
        </InterstateTooltip>
        <InterstateTooltip label="Bribe">
          <span className="flex items-center gap-1 text-[#9CA3AF]">
            <FaCoins className="opacity-90" /> {settings.bribe} <span className="text-[#FF4D7F]">⚠</span>
          </span>
        </InterstateTooltip>
        <InterstateTooltip label="MEV Protection">
          <span
            className={cx(
              "flex items-center gap-1",
              settings.mevMode === "off" ? "text-[#9CA3AF]" : settings.mevMode === "reduced" ? "text-[#9CA3AF]" : "text-[#70E0B0]"
            )}
          >
            <FaBan className="opacity-90" />
            {settings.mevMode === "off" ? "Off" : settings.mevMode === "reduced" ? "Reduced" : "Secure"}
          </span>
        </InterstateTooltip>
        </div>

      {/* Feedback */}
      {/* Previously showed inline success/error messages; replaced by centered toasts */}

      {/* Helper line */}
      {!isSniperMode && (
        <div className="px-3 mt-1.5 text-right text-[11px] text-[#9CA3AF]">
          {amount ? (
            <>
              You'll {mode === "buy" ? "spend" : "sell"} <span className="text-[#E6E7EA] font-semibold">{amount}</span>
              {mode === "sell" ? (
                <>
                  <span className="text-[#E6E7EA] font-semibold">%</span>
                  {positionData && positionData.remaining > 0 && Number(amount) > 0 && (
                    <span className="text-[#9CA3AF]"> ({formatCompactNumber((Number(amount) / 100) * positionData.remaining)} tokens)</span>
                  )}
                </>
              ) : (
                <>
                  <div className="inline-block w-3 h-3 ml-1 align-middle">
                    <svg width="12" height="12" viewBox="0 0 397.7 311.7" fill="none">
                      <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 237.9z" fill="url(#paint0_linear_helper)"/>
                      <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1L333.1 73.8c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="url(#paint1_linear_helper)"/>
                      <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" fill="url(#paint2_linear_helper)"/>
                      <defs>
                        <linearGradient id="paint0_linear_helper" x1="360.8" y1="351.5" x2="141.44" y2="132.14" gradientUnits="userSpaceOnUse">
                          <stop offset="0" stopColor="#00FFA3"/>
                          <stop offset="1" stopColor="#DC1FFF"/>
                        </linearGradient>
                        <linearGradient id="paint1_linear_helper" x1="264.8" y1="116.2" x2="45.44" y2="-103.16" gradientUnits="userSpaceOnUse">
                          <stop offset="0" stopColor="#00FFA3"/>
                          <stop offset="1" stopColor="#DC1FFF"/>
                        </linearGradient>
                        <linearGradient id="paint2_linear_helper" x1="312.5" y1="233.9" x2="93.14" y2="14.54" gradientUnits="userSpaceOnUse">
                          <stop offset="0" stopColor="#00FFA3"/>
                          <stop offset="1" stopColor="#DC1FFF"/>
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  {effectiveBuyTokenPrice > 0 && Number(amount) > 0 && (
                    <span className="text-[#9CA3AF]"> (~{formatCompactNumber(Number(amount) / effectiveBuyTokenPrice)} tokens)</span>
                  )}
                </>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* Est. receive row for buy mode */}
      {mode === "buy" && effectiveBuyTokenPrice > 0 && Number(isSniperMode ? sniperAmount : amount) > 0 && (
        <div className="mx-3 mt-1 flex items-center justify-between rounded-md bg-[#1A1B1E] px-3 py-1.5">
          <span className="text-[11px] text-[#9CA3AF]">Est. receive</span>
          <span className="text-[12px] font-semibold text-[#E6E7EA] tabular-nums">
            ~{formatCompactNumber(Number(isSniperMode ? sniperAmount : amount) / effectiveBuyTokenPrice)} {token.symbol}
          </span>
        </div>
      )}

      {/* Primary action */}
      <div className="px-3 py-2">
        <button
          ref={tradeButtonRef}
          type="button"
          className={cx(
            baseBtn,
            "w-full h-10 rounded-full text-[14px] cursor-pointer",
            mode === "buy"
              ? "bg-[#70E0B0] text-black hover:bg-[#58B890]"
              : "bg-[#FF4D7F] text-black hover:opacity-90"
          )}
          disabled={isSniperMode
            ? !sniperAmount || Number(sniperAmount) <= 0 || sniperSubmitting
            : isDevSellMode
              ? !amount || Number(amount) <= 0 || devSubmitting || !creatorAddress
              : !amount || (tab === "limit" && !targetMC)}
          onClick={() => {
            if (isSniperMode) {
              void handleCreateSniperOrder();
            } else if (isDevSellMode) {
              void handleCreateDevSellOrder();
            } else {
              void initiateTrade();
            }
          }}
        >
          {isSniperMode ? (
            sniperSubmitting ? (
              "Arming…"
            ) : (
              <span className="inline-flex items-center gap-1">
                Arm Sniper {token.symbol}
                {prettyAmt(sniperAmount) && (
                  <>
                    {" "}{prettyAmt(sniperAmount)}
                    {mode === "buy" ? (
                      <SiSolana className="h-4 w-4 -mt-px" aria-hidden="true" />
                    ) : (
                      <span className="ml-0.5">%</span>
                    )}
                  </>
                )}
              </span>
            )
          ) : isDevSellMode ? (
            devSubmitting ? (
              "Arming…"
            ) : (
              <span className="inline-flex items-center gap-1">
                {mode === "buy" ? "Arm Buy on Dev Sell" : "Arm Sell on Dev Sell"}
                {prettyAmt(amount) && (
                  <>
                    {" "}{prettyAmt(amount)}
                    {mode === "sell" ? <span>%</span> : <SiSolana className="h-4 w-4 -mt-px" aria-hidden="true" />}
                  </>
                )}
              </span>
            )
          ) : (
            <span className="inline-flex items-center gap-1">
              {isMigratingToken && mode === "buy" ? "Snipe" : mode === "buy" ? "Buy" : "Sell"}
              {mode === "sell" && positionData && positionData.remaining > 0 && Number(amount) > 0 && (
                <> {formatCompactNumber((Number(amount) / 100) * positionData.remaining)}</>
              )}
              {mode === "buy" && effectiveBuyTokenPrice > 0 && Number(amount) > 0 && (
                <> ~{formatCompactNumber(Number(amount) / effectiveBuyTokenPrice)}</>
              )}
              {" "}{token.symbol}
              {prettyAmt(amount) && (
                <>
                  {" "}{prettyAmt(amount)}
                  {mode === "sell" ? (
                    <span>%</span>
                  ) : (
                    <SiSolana className="h-4 w-4 -mt-px" aria-hidden="true" />
                  )}
                </>
              )}
            </span>
          )}
        </button>
      </div>

      {/* footer mini stats */}
      <div className="grid grid-cols-4 gap-1 p-3" style={{ borderTop: `1px solid ${AX.border}` }}>
        <div className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-[#101114] border border-[#2A2B33]">
          <span className="text-[9px] text-[#9CA3AF] uppercase tracking-wide">Bought</span>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5">
              <svg width="10" height="10" viewBox="0 0 397.7 311.7" fill="none">
                <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 237.9z" fill="url(#paint0_linear_bought)"/>
                <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1L333.1 73.8c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="url(#paint1_linear_bought)"/>
                <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" fill="url(#paint2_linear_bought)"/>
                <defs>
                  <linearGradient id="paint0_linear_bought" x1="360.8" y1="351.5" x2="141.44" y2="132.14" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#00FFA3"/>
                    <stop offset="1" stopColor="#DC1FFF"/>
                  </linearGradient>
                  <linearGradient id="paint1_linear_bought" x1="264.8" y1="116.2" x2="45.44" y2="-103.16" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#00FFA3"/>
                    <stop offset="1" stopColor="#DC1FFF"/>
                  </linearGradient>
                  <linearGradient id="paint2_linear_bought" x1="312.5" y1="233.9" x2="93.14" y2="14.54" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#00FFA3"/>
                    <stop offset="1" stopColor="#DC1FFF"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className="text-[#70E0B0] text-[10px] font-semibold">
              ${positionData ? formatCompactNumber(positionData.boughtUsdValue) : '0'}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-[#101114] border border-[#2A2B33]">
          <span className="text-[9px] text-[#9CA3AF] uppercase tracking-wide">Sold</span>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5">
              <svg width="10" height="10" viewBox="0 0 397.7 311.7" fill="none">
                <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 237.9z" fill="url(#paint0_linear_sold)"/>
                <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1L333.1 73.8c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="url(#paint1_linear_sold)"/>
                <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" fill="url(#paint2_linear_sold)"/>
                <defs>
                  <linearGradient id="paint0_linear_sold" x1="360.8" y1="351.5" x2="141.44" y2="132.14" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#00FFA3"/>
                    <stop offset="1" stopColor="#DC1FFF"/>
                  </linearGradient>
                  <linearGradient id="paint1_linear_sold" x1="264.8" y1="116.2" x2="45.44" y2="-103.16" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#00FFA3"/>
                    <stop offset="1" stopColor="#DC1FFF"/>
                  </linearGradient>
                  <linearGradient id="paint2_linear_sold" x1="312.5" y1="233.9" x2="93.14" y2="14.54" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#00FFA3"/>
                    <stop offset="1" stopColor="#DC1FFF"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className="text-[#FF4D7F] text-[10px] font-semibold">
              ${positionData ? formatCompactNumber(positionData.soldUsdValue) : '0'}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-[#101114] border border-[#2A2B33]">
          <span className="text-[9px] text-[#9CA3AF] uppercase tracking-wide">Holding</span>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5">
              <svg width="10" height="10" viewBox="0 0 397.7 311.7" fill="none">
                <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 237.9z" fill="url(#paint0_linear_holding)"/>
                <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1L333.1 73.8c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="url(#paint1_linear_holding)"/>
                <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" fill="url(#paint2_linear_holding)"/>
                <defs>
                  <linearGradient id="paint0_linear_holding" x1="360.8" y1="351.5" x2="141.44" y2="132.14" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#00FFA3"/>
                    <stop offset="1" stopColor="#DC1FFF"/>
                  </linearGradient>
                  <linearGradient id="paint1_linear_holding" x1="264.8" y1="116.2" x2="45.44" y2="-103.16" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#00FFA3"/>
                    <stop offset="1" stopColor="#DC1FFF"/>
                  </linearGradient>
                  <linearGradient id="paint2_linear_holding" x1="312.5" y1="233.9" x2="93.14" y2="14.54" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#00FFA3"/>
                    <stop offset="1" stopColor="#DC1FFF"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className="text-[#E6E7EA] text-[10px] font-semibold">
              ${positionData ? formatCompactNumber(positionData.remainingUsdValue) : '0'}
            </span>
          </div>
        </div>
        {/*
          Interactive PnL tile — toggles between unrealized (default, live
          mark-to-market) and realized (locked-in profit from closed sells).
          GMGN does the same pattern on their per-token panel; we match the
          convention so users switching from GMGN/Axiom find the mental model
          familiar. role="switch" + aria-checked gives screen readers the
          correct announcement; whole tile is the tap target for ≥44px mobile
          hit area.
        */}
        <button
          type="button"
          role="switch"
          aria-checked={pnlMode === 'unrealized'}
          aria-label={
            pnlMode === 'unrealized'
              ? 'PnL: unrealized (live mark-to-market). Click to switch to realized.'
              : 'PnL: realized (from closed sells). Click to switch to unrealized.'
          }
          onClick={() => setPnlMode((m) => (m === 'unrealized' ? 'realized' : 'unrealized'))}
          className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-[#101114] border border-[#2A2B33] hover:bg-[#1E1F26] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#70E0B0] transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-1 text-[9px] text-[#9CA3AF] uppercase tracking-wide">
            {pnlMode === 'unrealized' ? 'UPnL' : 'PnL'}
            <LuArrowLeftRight size={9} aria-hidden="true" />
          </span>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5">
              <svg width="10" height="10" viewBox="0 0 397.7 311.7" fill="none">
                <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 237.9z" fill="url(#paint0_linear_pnl)"/>
                <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1L333.1 73.8c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="url(#paint1_linear_pnl)"/>
                <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" fill="url(#paint2_linear_pnl)"/>
                <defs>
                  <linearGradient id="paint0_linear_pnl" x1="360.8" y1="351.5" x2="141.44" y2="132.14" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#00FFA3"/>
                    <stop offset="1" stopColor="#DC1FFF"/>
                  </linearGradient>
                  <linearGradient id="paint1_linear_pnl" x1="264.8" y1="116.2" x2="45.44" y2="-103.16" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#00FFA3"/>
                    <stop offset="1" stopColor="#DC1FFF"/>
                  </linearGradient>
                  <linearGradient id="paint2_linear_pnl" x1="312.5" y1="233.9" x2="93.14" y2="14.54" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#00FFA3"/>
                    <stop offset="1" stopColor="#DC1FFF"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            {(() => {
              if (!positionData) {
                return (
                  <div className="text-[9px] font-semibold text-[#70E0B0]">
                    <div className="flex flex-col items-center leading-tight">
                      <div className="mb-0.5">$0</div>
                      <div>(+0%)</div>
                    </div>
                  </div>
                );
              }
              const value = pnlMode === 'unrealized'
                ? positionData.unrealizedPnl
                : positionData.realizedPnl;
              const pct = pnlMode === 'unrealized'
                ? positionData.unrealizedPnlPercentage
                : positionData.realizedPnlPercentage;
              const isPositive = value >= 0;
              const sign = isPositive ? '+' : '';
              return (
                <div className={`text-[9px] font-semibold ${isPositive ? 'text-[#70E0B0]' : 'text-[#FF4D7F]'}`}>
                  <div className="flex flex-col items-center leading-tight">
                    <div className="mb-0.5">
                      {sign}${formatCompactNumber(Math.abs(value))}
                    </div>
                    <div>
                      ({sign}{Number(pct).toFixed(1)}%)
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </button>
      </div>

      <div className="w-full overflow-hidden" style={{ borderTop: `1px solid ${AX.border}` }}>
        <QuickBuy hideActionButton className="rounded-none border-none bg-transparent" />
      </div>

      {/* ===== Contract Address ===== */}
      <div className="border-t border-[#2A2B33]">
        <AddressDisplay
          label="CA"
          address={token.mint || ''}
          icon={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10,9 9,9 8,9"/>
            </svg>
          }
          solscanUrl={`https://solscan.io/token/${token.mint || ''}`}
          tooltip="Contract Address - The token's smart contract address on Solana"
        />
        
        {/* Dev Address */}
        {creatorAddress && (
          <AddressDisplay
            label="DA"
            address={creatorAddress}
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            }
            solscanUrl={`https://solscan.io/account/${creatorAddress}`}
            tooltip="Dev Address - The address of the token creator/developer"
          />
        )}
      </div>

      {/* ===== Token Info ===== */}
      <TokenInfoDropdown token={token} liveMarketCapUsd={liveMarketCapUsd} firstBuyers={firstBuyers} firstBuyersSummary={firstBuyersSummary} />

      {/* ===== Pool Info Section ===== */}
      <PoolInfoSection token={token} liveMarketCapUsd={liveMarketCapUsd} liveLiquidityUsd={liveLiquidityUsd} />

      {/* High Slippage Warning Dialog */}
      <HighSlippageWarningDialog
        isOpen={showSlippageWarning}
        slippagePercent={(settings.maxSlippage || 0.2) * 100}
        onContinue={handleSlippageWarningContinue}
        onCancel={handleSlippageWarningCancel}
      />
      {/* --- Low liquidity warning temporarily disabled ---
      <LowLiquidityWarningDialog
        isOpen={showLiquidityWarning}
        liquidityUsd={Number(liquidityUsd) || 0}
        thresholdUsd={LOW_LIQUIDITY_WARNING_THRESHOLD}
        onContinue={handleLiquidityWarningContinue}
        onCancel={handleLiquidityWarningCancel}
      />
      */}
    </div>
  );
};

export default TradeActionPanel;
