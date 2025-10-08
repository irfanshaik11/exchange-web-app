import React, { useState } from "react";
import type { Token } from "~/utils/db";
import { formatSmartNumber } from "~/utils/db";
import { useWatchlist } from "../WatchlistContext";
import { fetchTokenMetadata } from "~/utils/functions";
import { SubscriptNumber } from "../InterstateTable";
import useMarketDataWebSocket from "~/hooks/useMarketDataWebSocket";

import { IoShareSocialOutline } from "react-icons/io5";
import { FaRegStar, FaStar, FaGlobe, FaUser, FaSearch, FaExpand, FaCamera, FaRegCopy } from "react-icons/fa";
import { FiCopy } from "react-icons/fi";
import { LuPill } from "react-icons/lu";
import FastImage from "../FastImage";
import Link from "next/link";

/* ---------- AXIOM palette ---------- */
const AX = {
  bg: "#0f1012",
  surface: "#1A1A1A",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#E6E7EA",
  muted: "#9CA3AF",
  mint: "#70E0B0",
  green: "#3DDC84",
  blue: "#8EC5FF",
  accent: "#3DDC84",
  // AI-inspired colors
  aiBlue: "#3B82F6",
  aiBlueHover: "#2563EB",
  aiGreen: "#22C55E",
  aiGreenHover: "#16A34A",
  aiCyan: "#06B6D4",
  aiCyanHover: "#0891B2",
  // Glow effects
  glowBlue: "rgba(59, 130, 246, 0.3)",
  glowGreen: "rgba(34, 197, 94, 0.3)",
  glowCyan: "rgba(6, 182, 212, 0.3)",
};

/* ---------- helpers ---------- */
function getTokenAge(createdAt: string) {
  const createdDate = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - createdDate.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  return `${diffMins}m`;
}

// Make NFT/token images work across ipfs/arweave/http
function normalizeAssetUrl(raw?: string): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.startsWith("data:")) return s;

  if (s.startsWith("ipfs://")) {
    const cid = s.replace("ipfs://", "").replace(/^ipfs\//, "");
    return `https://cloudflare-ipfs.com/ipfs/${cid}`;
  }
  if (/^ipfs[/:]/i.test(s)) {
    const cid = s.replace(/^ipfs[/:]/i, "");
    return `https://cloudflare-ipfs.com/ipfs/${cid}`;
  }

  if (/^[a-z0-9_-]{40,}$/i.test(s) && !/^https?:\/\//i.test(s)) {
    return `https://arweave.net/${s}`;
  }

  if (s.startsWith("http://")) return s.replace(/^http:\/\//i, "https://");
  if (s.startsWith("https://")) return s;

  return null;
}

const tokenMetadataCache: Record<string, any> = {};
function useTokenMetadata(uri?: string) {
  const [meta, setMeta] = React.useState<any | null>(null);
  const [loading, setLoading] = React.useState(!!uri);
  const [showInitial, setShowInitial] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    if (!uri) {
      setMeta(null);
      setLoading(false);
      return;
    }
    if (tokenMetadataCache[uri]) {
      setMeta(tokenMetadataCache[uri]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setShowInitial(false);
    const timer = setTimeout(() => setShowInitial(true), 400);
    fetchTokenMetadata(uri).then((data) => {
      if (!cancelled) {
        if (data) tokenMetadataCache[uri] = data;
        setMeta(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [uri]);

  return { meta, loading, showInitial };
}

/* ---------- tiny UI atoms ---------- */
function StatInline({
  label,
  children,
  accent,
  value,
}: {
  label: string;
  children: React.ReactNode;
  accent?: "green" | "blue";
  value?: string | number;
}) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="text-[10px] font-light uppercase tracking-wider" style={{ color: AX.muted, fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}>
        {label}
      </span>
      <span
        className="text-[12px] font-light tabular-nums"
        style={{ color: accent === "green" ? AX.green : accent === "blue" ? AX.blue : AX.text, fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}
      >
        {children}
      </span>
    </div>
  );
}

const Tooltip: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => {
  const [show, setShow] = React.useState(false);
  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
      tabIndex={0}
    >
      {children}
      {show && (
        <span
          className="absolute -top-2 right-1/2 translate-y-[-100%] translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[11px] text-white shadow"
          style={{ background: "#0E0F12" }}
        >
          {label}
        </span>
      )}
    </span>
  );
};

/* ===================================================================== */

interface TradeHeaderProps {
  token: Token;
}

const TradeHeader: React.FC<TradeHeaderProps> = ({ token }) => {
  const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlist();
  const isWatched = isInWatchlist(token.pair_address);
  const { meta, loading, showInitial } = useTokenMetadata(token.uri);
  const [showPreview, setShowPreview] = useState(false);
  const [showXPreview, setShowXPreview] = useState(false);
  const [buttonPosition, setButtonPosition] = useState<{left: number, top: number, showBelow?: boolean} | null>(null);
  const [showToast, setShowToast] = useState(false);

  // WebSocket hook for real-time market data
  const {
    isConnected: wsConnected,
    loading: wsLoading,
    error: wsError,
    data: wsData,
    getMarketData,
  } = useMarketDataWebSocket({
    pairAddress: token.pair_address,
    tokenAddress: token.mint,
    enabled: true,
  });

  const showCopyToast = () => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  const handleWatchlistClick = () => {
    if (isWatched) removeFromWatchlist(token.pair_address);
    else addToWatchlist(token);
  };

  // Real-time market data from WebSocket with fallback to static data
  const marketData = getMarketData();
  const mcap = marketData?.market_cap_usd || token.market_cap_usd || 0;
  const price = marketData?.price_usd || token.usd_price || (token as any).price_usd || (token as any).price || 0;
  const liq = marketData?.volume_usd || token.total_liquidity_usd || (token as any).liquidity_usd || 0;
  const supply = token.total_supply ?? (token as any).supply ?? 0;
  const feesPaid = (token as any).global_fees_paid ?? (token as any).globalFeesPaid ?? "—";
  const curvePct = 
    (token as any).bonding_pct ??
    (token as any).bonding_curve_progress ??
    (token as any).bcurve ??
    0;

  const imgSrc =
    normalizeAssetUrl(meta?.image) ||
    normalizeAssetUrl((meta?.properties as any)?.image) ||
    normalizeAssetUrl((token as any).logo) ||
    null;

  return (
    <div
      className="flex w-full items-center justify-between px-2 py-2"
      style={{ 
        background: "transparent", 
        color: AX.text, 
        fontFamily: 'Inter, ui-sans-serif, system-ui'
      }}
    >
      {/* WebSocket Connection Status */}
      {wsError && (
        <div className="absolute top-0 left-0 right-0 px-3 py-1 bg-red-900/20 border-b border-red-500/30 z-10">
          <div className="text-[10px] text-red-400 text-center">
            Market Data Error: {wsError}
          </div>
        </div>
      )}
      
      {!wsConnected && !wsLoading && wsData === null && (
        <div className="absolute top-0 left-0 right-0 px-3 py-1 bg-yellow-900/20 border-b border-yellow-500/30 z-10">
          <div className="text-[10px] text-yellow-400 text-center">
            Using static market data (WebSocket disconnected)
          </div>
        </div>
      )}
      {/* LEFT: Token Info */}
      <div className="flex items-center gap-3">
        {/* Token Avatar with Pill Styling */}
        <div className="relative">
          <div 
            className="relative h-10 w-10 rounded-md border transition-all duration-300 cursor-pointer"
            style={{ 
              borderColor: showPreview ? AX.aiCyan : AX.border,
              boxShadow: showPreview ? `0 0 12px ${AX.glowCyan}, 0 0 24px ${AX.glowCyan}, inset 0 0 12px ${AX.glowCyan}` : 'none'
            }}
            onMouseEnter={(e) => {
              setShowPreview(true);
              e.currentTarget.style.borderColor = AX.aiCyan;
              e.currentTarget.style.boxShadow = `0 0 12px ${AX.glowCyan}, 0 0 24px ${AX.glowCyan}, inset 0 0 12px ${AX.glowCyan}`;
            }}
            onMouseLeave={(e) => {
              setShowPreview(false);
              e.currentTarget.style.borderColor = AX.border;
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
        {loading && !showInitial ? (
              <div className="h-full w-full animate-pulse rounded-md" style={{ background: AX.surface2 }} />
        ) : imgSrc ? (
              <FastImage
            src={imgSrc}
            alt={token.name}
                symbol={token.symbol}
                width={35}
                height={35}
                className="h-full w-full rounded-md object-cover"
                priority={true}
          />
        ) : (
          <div
                className="flex h-full w-full items-center justify-center rounded-md text-base font-light"
                style={{ color: AX.text, background: AX.surface2, fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}
          >
            {token.name?.charAt(0) || "?"}
          </div>
        )}

            {/* Camera icon overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-all duration-300 pointer-events-none"
                 style={{ opacity: showPreview ? 1 : 0 }}>
              <div className="flex items-center justify-center rounded-full p-1.5"
                   style={{ 
                     backgroundColor: AX.aiCyan,
                     boxShadow: `0 0 6px ${AX.glowCyan}`
                   }}>
                <FaCamera 
                  size={14} 
                  style={{ color: '#000000' }}
                  className="drop-shadow-lg"
                />
              </div>
            </div>
          </div>

          {/* AI-styled Image Preview Window */}
          {showPreview && (
            <div 
              className="absolute z-[9999] pointer-events-none"
              style={{
                left: '100%',
                top: '0%',
                transform: 'translate(20px, 0px)',
                width: '200px',
                height: '200px',
                zIndex: 9999
              }}
            >
              <div className="relative h-full w-full rounded-lg border-2 overflow-hidden"
                   style={{ 
                     borderColor: AX.aiCyan,
                     boxShadow: `0 0 20px ${AX.glowCyan}, 0 0 40px ${AX.glowCyan}`,
                     background: AX.surface2
                   }}>
                {imgSrc ? (
                  <FastImage
                    src={imgSrc}
                    alt={token.name}
                    symbol={token.symbol}
                    width={200}
                    height={200}
                    className="h-full w-full object-cover"
                    priority={true}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-4xl font-light"
                       style={{ color: AX.text, background: AX.surface2, fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}>
                    {token.name?.charAt(0) || "?"}
                  </div>
                )}
                
              </div>
            </div>
          )}
        </div>

        {/* Token Details */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px] font-light" style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}>{token.symbol}</span>
            <span className="text-[11px] font-light" style={{ color: AX.muted, fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}>
              {token.name}
            </span>
            <div className="relative ml-1">
              <button
                className="transition-colors duration-200"
                style={{ color: AX.muted }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = AX.aiBlue;
                  e.currentTarget.style.boxShadow = `0 0 6px ${AX.glowBlue}`;
                  const tooltip = document.getElementById('copy-tooltip-header') as HTMLElement;
                  if (tooltip) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    tooltip.style.left = `${rect.left + rect.width / 2}px`;
                    tooltip.style.top = `${rect.top - 10}px`;
                    tooltip.style.opacity = '1';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = AX.muted;
                  e.currentTarget.style.boxShadow = 'none';
                  const tooltip = document.getElementById('copy-tooltip-header') as HTMLElement;
                  if (tooltip) tooltip.style.opacity = '0';
                }}
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await navigator.clipboard.writeText(token.mint);
                    showCopyToast();
                    // Show success feedback
                    const button = e.currentTarget as HTMLButtonElement;
                    if (button && button.style) {
                      const originalColor = button.style.color || AX.muted;
                      button.style.color = AX.aiGreen;
                      setTimeout(() => {
                        if (button && button.style) {
                          button.style.color = originalColor;
                        }
                      }, 1000);
                    }
                  } catch (err) {
                    console.error('Failed to copy to clipboard:', err);
                    // Fallback for older browsers
                    const textArea = document.createElement('textarea');
                    textArea.value = token.mint;
                    document.body.appendChild(textArea);
                    textArea.select();
                    try {
                      document.execCommand('copy');
                      showCopyToast();
                      const button = e.currentTarget as HTMLButtonElement;
                      if (button && button.style) {
                        const originalColor = button.style.color || AX.muted;
                        button.style.color = AX.aiGreen;
                        setTimeout(() => {
                          if (button && button.style) {
                            button.style.color = originalColor;
                          }
                        }, 1000);
                      }
                    } catch (fallbackErr) {
                      console.error('Fallback copy failed:', fallbackErr);
                    }
                    document.body.removeChild(textArea);
                  }
                }}
              >
                <FaRegCopy size={14} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm" style={{ color: AX.aiGreen }}>
            <span className="font-light" style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}>{getTokenAge(token.created_at)}</span>
            {/* Socials */}
            <div className="relative flex items-center gap-2">
              {/* Pump.fun Link - only show for pump tokens */}
              {token.mint.slice(-4) === "pump" && (
                <Link
                  target="_blank"
                  href={`https://pump.fun/coin/${token.mint}`}
                  className="transition-colors duration-200"
                  style={{ color: AX.muted }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = AX.aiCyan;
                    e.currentTarget.style.boxShadow = `0 0 6px ${AX.glowCyan}`;
                    const tooltip = document.getElementById('pump-tooltip-header') as HTMLElement;
                    if (tooltip) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      tooltip.style.left = `${rect.left + rect.width / 2}px`;
                      tooltip.style.top = `${rect.top - 10}px`;
                      tooltip.style.opacity = '1';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = AX.muted;
                    e.currentTarget.style.boxShadow = 'none';
                    const tooltip = document.getElementById('pump-tooltip-header') as HTMLElement;
                    if (tooltip) tooltip.style.opacity = '0';
                  }}
                >
                  <LuPill />
                </Link>
              )}
              
              {/* Search on Twitter Button - show for all tokens */}
              <button
                className="transition-colors duration-200"
                style={{ color: AX.muted }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = AX.aiCyan;
                  e.currentTarget.style.boxShadow = `0 0 6px ${AX.glowCyan}`;
                  const tooltip = document.getElementById('search-tooltip-header') as HTMLElement;
                  if (tooltip) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    tooltip.style.left = `${rect.left + rect.width / 2}px`;
                    tooltip.style.top = `${rect.top - 10}px`;
                    tooltip.style.opacity = '1';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = AX.muted;
                  e.currentTarget.style.boxShadow = 'none';
                  const tooltip = document.getElementById('search-tooltip-header') as HTMLElement;
                  if (tooltip) tooltip.style.opacity = '0';
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  const searchQuery = `${token.symbol} ${token.name}`.trim();
                  const twitterUrl = `https://twitter.com/search?q=${encodeURIComponent(searchQuery)}`;
                  window.open(twitterUrl, '_blank');
                }}
              >
                <FaSearch size={14} />
              </button>

              {/* X Profile Preview Button - show for all tokens */}
              <div className="relative">
                <button
                  className="transition-colors duration-200"
                  style={{ color: AX.muted }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = AX.aiBlue;
                    e.currentTarget.style.boxShadow = `0 0 6px ${AX.glowBlue}`;
                    const tooltip = document.getElementById('profile-tooltip-header') as HTMLElement;
                    if (tooltip) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      tooltip.style.left = `${rect.left + rect.width / 2}px`;
                      tooltip.style.top = `${rect.top - 10}px`;
                      tooltip.style.opacity = '1';
                    }
                    // Show X profile preview
                    setShowXPreview(true);
                    // Store button position for popup positioning
                    const buttonRect = e.currentTarget.getBoundingClientRect();
                    const screenWidth = window.innerWidth;
                    const screenHeight = window.innerHeight;
                    
                    // Calculate optimal position
                    let left = buttonRect.left + buttonRect.width / 2;
                    let top = buttonRect.top - 20;
                    let showBelow = false;
                    
                    // Check if there's enough space above (popup height is ~400px)
                    // Also check if popup would go off screen at the top
                    if (top < 50 || (top - 400) < 0) {
                      top = buttonRect.bottom + 20;
                      showBelow = true;
                      
                      // If showing below, check if it would go off bottom of screen
                      if (top + 400 > screenHeight) {
                        top = screenHeight - 420; // Position near top of screen
                      }
                    }
                    
                    // Ensure popup doesn't go off screen horizontally
                    if (left < 140) left = 190; // Half of popup width
                    if (left > screenWidth - 140) left = screenWidth - 140;
                    
                    setButtonPosition({ left, top, showBelow });
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = AX.muted;
                    e.currentTarget.style.boxShadow = 'none';
                    const tooltip = document.getElementById('profile-tooltip-header') as HTMLElement;
                    if (tooltip) tooltip.style.opacity = '0';
                    // Hide popup immediately when leaving the human icon
                    setShowXPreview(false);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Open X profile in new tab
                    const profileUrl = `https://twitter.com/${token.symbol?.toLowerCase() || 'search'}`;
                    window.open(profileUrl, '_blank');
                  }}
                >
                  <FaUser size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CENTER: Market Data - Compact */}
      <div className="flex items-center gap-6">
        {/* Market Cap - Large Display with Live Indicator */}
        <div className="text-center">
          <div className="text-[18px] font-light tabular-nums flex items-center justify-center gap-1" style={{ color: AX.text, fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}>
            ${formatSmartNumber(mcap)}
            {wsConnected && <span className="text-[#70E0B0] text-[12px]">●</span>}
          </div>
        </div>

        {/* Stats - Inline Layout */}
        <div className="flex items-center gap-4">
          <StatInline label="Price">
            ${<SubscriptNumber value={price} />}
          </StatInline>
          <StatInline label="Liquidity">
            ${formatSmartNumber(liq)}
          </StatInline>
          <StatInline label="Supply">
            {formatSmartNumber(supply)}
          </StatInline>
          <StatInline label="Global Fees Paid">
            {feesPaid === "—" ? "—" : feesPaid}
          </StatInline>
          <StatInline label="B.Curve" accent="green">
            {Number.isFinite(Number(curvePct)) ? `${Math.round(Number(curvePct))}%` : "—"}
          </StatInline>
        </div>
      </div>

      {/* RIGHT: Action Buttons */}
      <div className="flex items-center gap-2">
        <Tooltip label="Share">
          <IoShareSocialOutline className="cursor-pointer text-[14px] hover:text-white transition-colors" style={{ color: AX.muted }} />
        </Tooltip>

        <Tooltip label={isWatched ? "Remove from Watchlist" : "Add to Watchlist"}>
          <button
            onClick={handleWatchlistClick}
            className="cursor-pointer text-[14px] hover:text-white transition-colors"
            aria-label={isWatched ? "Remove from Watchlist" : "Add to Watchlist"}
          >
            {isWatched ? <FaStar className="text-yellow-400" /> : <FaRegStar style={{ color: AX.muted }} />}
          </button>
        </Tooltip>

        <Tooltip label="Expand chart">
          <button
            className="flex items-center justify-center w-6 h-6 rounded transition-all duration-200"
            style={{ 
              color: AX.muted,
              backgroundColor: 'transparent'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = AX.green;
              e.currentTarget.style.backgroundColor = 'rgba(61, 220, 132, 0.1)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = AX.muted;
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <FaExpand size={12} />
          </button>
        </Tooltip>
      </div>

      {/* X Profile Preview Popup */}
      {showXPreview && buttonPosition && (
        <div 
          className="fixed z-[999999]"
          style={{
            left: `${buttonPosition.left}px`,
            top: buttonPosition.showBelow ? `${buttonPosition.top}px` : `${buttonPosition.top - 280}px`,
            transform: 'translate(-50%, 0)',
            width: '240px',
            zIndex: 999999
          }}
        >
          <div className="bg-black rounded-xl overflow-hidden shadow-2xl"
               style={{ 
                 background: '#000000',
                 border: '1px solid #2f3336'
               }}>
            {/* X Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b"
                 style={{ borderColor: '#2f3336' }}>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 flex items-center justify-center rounded-full"
                     style={{ background: '#1d9bf0' }}>
                  <span className="text-white text-xs font-bold">𝕏</span>
                </div>
                <span className="text-white text-sm font-bold">X Profile Preview</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                <span className="text-xs text-gray-400">Live</span>
              </div>
            </div>

            {/* Profile Content */}
            <div className="p-3">
              {/* Profile Picture */}
              <div className="flex justify-center mb-2">
                <div className="w-12 h-12 rounded-full border-2 overflow-hidden"
                     style={{ borderColor: '#2f3336' }}>
                  <img
                    src={`https://ui-avatars.com/api/?name=${encodeURIComponent(token.symbol || 'Token')}&background=1d9bf0&color=ffffff&size=48`}
                    alt="Profile"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://via.placeholder.com/48x48/1d9bf0/ffffff?text=${(token.symbol || 'T').charAt(0)}`;
                    }}
                  />
                </div>
              </div>

              {/* Profile Info */}
              <div className="text-center mb-3">
                <h3 className="text-white text-sm font-bold mb-0.5">
                  {token.name || token.symbol || 'Token'}
                </h3>
                <p className="text-gray-400 text-xs mb-1">
                  @{token.symbol?.toLowerCase() || 'token'}
                </p>
                <p className="text-gray-300 text-xs">
                  Official {token.symbol || 'Token'} community
                </p>
              </div>

              {/* Stats */}
              <div className="flex justify-center gap-4 mb-3">
                <div className="text-center">
                  <div className="text-white font-bold text-xs">
                    {(() => {
                      const hash = (token.symbol || 'token').split('').reduce((a, b) => {
                        a = ((a << 5) - a) + b.charCodeAt(0);
                        return a & a;
                      }, 0);
                      return Math.abs(hash % 5000) + 1000;
                    })()}
                  </div>
                  <div className="text-gray-400 text-xs">Following</div>
                </div>
                <div className="text-center">
                  <div className="text-white font-bold text-xs">
                    {(() => {
                      const hash = (token.symbol || 'token').split('').reduce((a, b) => {
                        a = ((a << 5) - a) + b.charCodeAt(0);
                        return a & a;
                      }, 0);
                      return Math.abs(hash % 50000) + 10000;
                    })()}
                  </div>
                  <div className="text-gray-400 text-xs">Followers</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-1.5">
                <button className="flex-1 bg-white text-black font-bold py-1.5 px-3 rounded-full text-xs hover:bg-gray-200 transition-colors">
                  Follow
                </button>
                <button className="flex-1 border text-white font-bold py-1.5 px-3 rounded-full text-xs hover:bg-gray-800 transition-colors"
                        style={{ borderColor: '#2f3336' }}
                        onClick={() => {
                          const profileUrl = `https://twitter.com/${token.symbol?.toLowerCase() || 'search'}`;
                          window.open(profileUrl, '_blank');
                        }}>
                  View Profile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Copy Toast */}
      {showToast && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[999999] px-4 py-2 bg-green-600 text-white rounded-lg shadow-lg">
          Copied to clipboard!
        </div>
      )}

      {/* Tooltips */}
      <div
        id="copy-tooltip-header"
        className="fixed px-2 py-1 rounded text-xs font-medium opacity-0 transition-opacity duration-200 pointer-events-none whitespace-nowrap"
        style={{ 
          zIndex: 99999,
          backgroundColor: AX.surface, 
          color: AX.text, 
          border: `1px solid ${AX.border}`,
          boxShadow: `0 4px 12px rgba(0, 0, 0, 0.3)`
        }}
      >
        Copy contract
      </div>
      
      <div
        id="search-tooltip-header"
        className="fixed px-2 py-1 rounded text-xs font-medium opacity-0 transition-opacity duration-200 pointer-events-none whitespace-nowrap"
        style={{ 
          zIndex: 99999,
          backgroundColor: AX.surface, 
          color: AX.text, 
          border: `1px solid ${AX.border}`,
          boxShadow: `0 4px 12px rgba(0, 0, 0, 0.3)`
        }}
      >
        Search on Twitter
      </div>
      
      <div
        id="profile-tooltip-header"
        className="fixed px-2 py-1 rounded text-xs font-medium opacity-0 transition-opacity duration-200 pointer-events-none whitespace-nowrap"
        style={{ 
          zIndex: 99999,
          backgroundColor: AX.surface, 
          color: AX.text, 
          border: `1px solid ${AX.border}`,
          boxShadow: `0 4px 12px rgba(0, 0, 0, 0.3)`
        }}
      >
        View X Profile
      </div>

      {/* Pump.fun tooltip */}
      {token.mint.slice(-4) === "pump" && (
        <div
          id="pump-tooltip-header"
          className="fixed px-2 py-1 rounded text-xs font-medium opacity-0 transition-opacity duration-200 pointer-events-none whitespace-nowrap"
          style={{ 
            zIndex: 99999,
            backgroundColor: AX.surface, 
            color: AX.text, 
            border: `1px solid ${AX.border}`,
            boxShadow: `0 4px 12px rgba(0, 0, 0, 0.3)`
          }}
        >
          View on pump.fun
        </div>
      )}
    </div>
  );
};

export default TradeHeader;
