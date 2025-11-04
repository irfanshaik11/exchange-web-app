// components/PumpLive.tsx
import React, { useMemo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { FaRegCopy, FaGlobe, FaSearch } from "react-icons/fa";
import { IoPersonOutline } from "react-icons/io5";
import { LuPill } from "react-icons/lu";
import Link from "next/link";
import { HiLightningBolt } from "react-icons/hi";
import { useUser } from "~/components/UserContext";
import { useQuickBuy } from "~/components/QuickBuyContext";
import { tradeBuy, SOL_MINT_ADDRESS, ApiError } from "~/utils/api";
import { getPoolTypeFromToken } from "~/utils/poolTypeDetection";
import { showCenteredErrorToast } from "~/utils/toast";
import type { Token } from "~/utils/db";

/* ---- Enhanced Axiom AI Palette (matching PulseTable) ---- */
const AX = {
  bg: "#0b0c0e",
  surface: "#16171C",
  surface2: "#121317",
  border: "#24252C",
  text: "#E6E7EA",
  muted: "#9CA3AF",
  mint: "#18c48c",
  mintHover: "#12a877",
  sell: "#ed3a7a",
  aiBlue: "#526fff",
  aiBlueHover: "#3f56d9",
  aiGreen: "#18c48c",
  aiGreenHover: "#12a877",
  aiCyan: "#06B6D4",
  aiCyanHover: "#0891B2",
  glowBlue: "rgba(82, 111, 255, 0.3)",
  glowGreen: "rgba(24, 196, 140, 0.3)",
  glowCyan: "rgba(6, 182, 212, 0.3)",
  chip: "#0b1b14",
};

// Static fallbacks (kept for optional use; we now prefer initial-letter blocks)
const FALLBACK_COVER = "/placeholder/fallback-cover.jpg";
const FALLBACK_AVATAR = "/placeholder/fallback-avatar.jpg";

export type PumpItem = {
  id: string;
  name: string;
  symbol?: string;
  desc?: string;
  age: string;           // right-side age (e.g., "22m")
  chipAge?: string;      // small green chip (e.g., "2h")
  mc?: string;           // market cap text (e.g., "$7.26K")
  coverUrl?: string;     // big left thumbnail
  avatarUrl?: string;    // tiny avatar next to name
  verified?: boolean;    // verification dot
  hot?: boolean;         // orange status ring
  comments?: number;     // mini comments count
  // Raw token data for backfill
  _rawToken?: any;
};

/* ---------------- helpers ---------------- */

function getDummyMc(seed: string) {
  // deterministic tiny dummy based on id
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const buckets = ["$5.41K", "$5.44K", "$5.53K", "$6.59K", "$7.14K", "$9.86K", "$10.8K"];
  return buckets[h % buckets.length];
}

function getInitial(name?: string, symbol?: string) {
  return (symbol?.trim()?.charAt(0) || name?.trim()?.charAt(0) || "?").toUpperCase();
}

function truncateMiddle(text: string, maxLength: number = 30): string {
  if (!text || text.length <= maxLength) {
    return text;
  }
  const start = Math.floor(maxLength / 2) - 2;
  const end = Math.ceil(maxLength / 2) - 2;
  return `${text.slice(0, start)}...${text.slice(-end)}`;
}

function getFirstString(...values: Array<unknown>): string | undefined {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return undefined;
}

// Get market cap color based on PulseTable's SmartColor logic
function getMarketCapColor(item: PumpItem): string {
  // Get market cap value from raw token
  const rawToken = item._rawToken;
  if (!rawToken) {
    return '#52c6ff'; // Default to blue if no data (matches PulseTable for unknown/zero)
  }

  // Try to get market cap in USD
  let mc = rawToken.market_cap_usd;
  
  // If not available, try to calculate from marketCapSol
  if (!mc && rawToken.marketCapSol) {
    mc = rawToken.marketCapSol * 170; // Rough SOL price conversion
  }

  // If still no value, default to 0
  if (!mc || isNaN(mc)) {
    return '#52c6ff'; // Blue for unknown/zero
  }

  // Apply PulseTable color tiers (values in thousands):
  // 0–20k: blue, 20k–30k: purple, 30k–100k: yellow, 100k+: green
  if (mc >= 100_000) return '#31e3ac';  // Green: 100k+
  if (mc >= 30_000) return '#ddc13d';   // Yellow: 30k–100k
  if (mc >= 20_000) return '#526ffe';   // Purple: 20k–30k
  return '#52c6ff';                     // Blue: <20k
}

function BlueIconRow({
  chipText = "2h",
  comments = 0,
  item,
}: {
  chipText?: string;
  comments?: number;
  item?: PumpItem;
}) {
  // X Profile Preview state - moved here since it's used in this component
  const [showXPreview, setShowXPreview] = useState(false);
  const [buttonPosition, setButtonPosition] = useState<{left: number, top: number} | null>(null);
  const previewTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="mt-2 flex items-center gap-3 text-xs">
      {/* token age */}
      <span
        className="font-semibold text-xs"
        style={{ color: AX.aiGreen }}
        title="Token age"
      >
        {chipText}
      </span>

      {/* blue glyphs (person, globe, search) - clickable */}
      <span className="flex items-center gap-3">
        {/* person icon - X profile with preview */}
        <div className="relative">
          <button
            className="transition-colors duration-200 cursor-pointer"
            style={{ color: '#5ebcff' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#5ebcff'; // Keep the same color on hover
              // Clear any existing timeout
              if (previewTimeoutRef.current) {
                clearTimeout(previewTimeoutRef.current);
                previewTimeoutRef.current = null;
              }
              // Show X profile preview
              const buttonRect = e.currentTarget.getBoundingClientRect();
              setButtonPosition({
                left: buttonRect.left + buttonRect.width / 2,
                top: buttonRect.top - 20
              });
              setShowXPreview(true);
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#5ebcff';
              // Delay hiding to allow mouse to move to popup
              previewTimeoutRef.current = setTimeout(() => {
                setShowXPreview(false);
              }, 100);
            }}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              // Open X profile in new tab
              const symbol = item?.symbol || item?.name?.toLowerCase() || 'search';
              const profileUrl = `https://twitter.com/${symbol.toLowerCase()}`;
              window.open(profileUrl, '_blank');
            }}
            title="View X Profile"
          >
            <IoPersonOutline size={14} />
          </button>
          
          {/* X Profile Preview - positioned near button */}
          {showXPreview && buttonPosition && typeof window !== 'undefined' && createPortal(
            <div 
              className="fixed"
              style={{
                left: `${buttonPosition.left}px`,
                top: `${buttonPosition.top - 300}px`,
                transform: 'translate(-50%, 0)',
                width: '280px',
                zIndex: 99999999,
                pointerEvents: 'auto'
              }}
              onMouseEnter={() => {
                // Clear timeout to keep popup open when hovering over it
                if (previewTimeoutRef.current) {
                  clearTimeout(previewTimeoutRef.current);
                  previewTimeoutRef.current = null;
                }
              }}
              onMouseLeave={() => {
                // Hide popup when leaving the popup area
                if (previewTimeoutRef.current) {
                  clearTimeout(previewTimeoutRef.current);
                }
                setShowXPreview(false);
              }}
            >
              <div 
                className="rounded-xl overflow-hidden"
                style={{
                  backgroundColor: AX.surface,
                  border: `1px solid ${AX.border}`,
                  backdropFilter: 'blur(10px)'
                }}
              >
                {/* X Icon Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#2f3336' }}>
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-7 h-7 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: '#1d9bf0' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#ffffff' }}>
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">X Profile</div>
                      <div className="text-xs text-gray-400">Live Preview</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-xs text-gray-400">Live</span>
                  </div>
                </div>

                {/* Official X Profile Layout */}
                <div className="px-4 py-4">
                  {/* Profile Picture */}
                  <div className="flex justify-center mb-4">
                    <div 
                      className="w-20 h-20 rounded-full overflow-hidden"
                      style={{ 
                        backgroundColor: '#1a1a1a',
                        border: `3px solid #2f3336`
                      }}
                    >
                      <img
                        src={`https://ui-avatars.com/api/?name=${item.symbol || item.name || 'Token'}&size=80&background=1a1a1a&color=ffffff&bold=true`}
                        alt={`${item.symbol || item.name} profile`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const fallback = target.nextElementSibling as HTMLElement;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                      <div 
                        className="w-full h-full flex items-center justify-center font-bold text-xl"
                        style={{ 
                          backgroundColor: '#1a1a1a',
                          color: '#ffffff',
                          display: 'none'
                        }}
                      >
                        {(item.symbol || item.name || '??').slice(0, 2).toUpperCase()}
                      </div>
                    </div>
                  </div>
                  
                  {/* Profile Info */}
                  <div className="text-center mb-4">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <h3 className="text-xl font-bold text-white" title={item.symbol || item.name || 'Unknown'}>
                        {truncateMiddle(item.symbol || item.name || 'Unknown', 20)}
                      </h3>
                      {/* Verified Badge */}
                      <div 
                        className="w-6 h-6 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: '#1d9bf0' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 12l2 2 4-4"/>
                          <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z"/>
                        </svg>
                      </div>
                    </div>
                    <p className="text-sm text-gray-400 mb-3">
                      @{(item.symbol || item.name || 'unknown').toLowerCase()}
                    </p>
                    <p className="text-sm text-white leading-relaxed px-2">
                      {item.desc || `Official ${item.symbol || item.name || 'token'} community. Join the conversation!`}
                    </p>
                  </div>
                  
                  {/* Follow Button */}
                  <div className="flex justify-center mb-4">
                    <button
                      className="px-6 py-2 rounded-full text-sm font-semibold transition-all duration-200"
                      style={{
                        backgroundColor: '#ffffff',
                        color: '#000000'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#e7e9ea';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#ffffff';
                      }}
                    >
                      Follow
                    </button>
                  </div>
                </div>

                {/* Join Date Section */}
                <div className="px-4 pb-3">
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    <span>Joined {new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>

                {/* Action Button */}
                <div className="px-4 pb-4">
                  <button
                    className="w-full py-3 px-4 rounded-full text-sm font-semibold transition-all duration-200"
                    style={{
                      backgroundColor: '#1d9bf0',
                      color: '#ffffff',
                      border: '1px solid #1d9bf0'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#1a8cd8';
                      e.currentTarget.style.borderColor = '#1a8cd8';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#1d9bf0';
                      e.currentTarget.style.borderColor = '#1d9bf0';
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const symbol = item?.symbol || item?.name?.toLowerCase() || 'search';
                      const profileUrl = `https://twitter.com/${symbol.toLowerCase()}`;
                      window.open(profileUrl, '_blank');
                    }}
                  >
                    See profile on X
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>
        
        {/* Pump.fun Link - only show for pump tokens */}
        {(() => {
          const mint = item._rawToken?.mint || item.id;
          const isPumpToken = mint && typeof mint === 'string' && mint.slice(-4) === "pump";
          
          if (!isPumpToken) return null;
          
          return (
            <Link
              target="_blank"
              href={`https://pump.fun/coin/${mint}`}
              className="transition-colors duration-200 relative"
              style={{ color: '#86f0ad' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#86f0ad';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#86f0ad';
              }}
              onClick={(e) => {
                e.stopPropagation();
              }}
              title="View on Pump.fun"
            >
              <LuPill size={14} />
            </Link>
          );
        })()}
        
        {/* globe icon - open website/search */}
        <button
          className="transition-colors duration-200 cursor-pointer"
          style={{ color: AX.muted }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#06B6D4'; // aiCyan color
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = AX.muted;
          }}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            // Search on Twitter/X
            const searchQuery = `${item?.symbol || ''} ${item?.name || ''}`.trim();
            const twitterUrl = `https://twitter.com/search?q=${encodeURIComponent(searchQuery)}`;
            window.open(twitterUrl, '_blank');
          }}
          title="Search on Twitter"
        >
          <FaGlobe size={14} />
        </button>
        
        {/* search icon - Twitter search */}
        <button
          className="transition-colors duration-200 cursor-pointer"
          style={{ color: AX.muted }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#06B6D4'; // aiCyan color
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = AX.muted;
          }}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            // Search on Twitter
            const searchQuery = `${item?.symbol || ''} ${item?.name || ''}`.trim();
            const twitterUrl = `https://twitter.com/search?q=${encodeURIComponent(searchQuery)}`;
            window.open(twitterUrl, '_blank');
          }}
          title="Search on Twitter"
        >
          <FaSearch size={14} />
        </button>
      </span>
    </div>
  );
}

/* ---------------- row ---------------- */

export function PumpRow({
  item,
  onAction,
  showCopyToast,
  quickBuyAmount,
  onQuickBuy,
  isRightColumn = false,
}: {
  item: PumpItem;
  onAction?: (id: string, rawToken?: any) => void;
  showCopyToast?: () => void;
  quickBuyAmount?: number;
  onQuickBuy?: (token: Token) => void;
  isRightColumn?: boolean;
}) {
  const mcText = item.mc ?? getDummyMc(item.id);
  const initial = useMemo(() => getInitial(item.name, item.symbol), [item.name, item.symbol]);

  // Whether we should show actual images (start true if url exists; switch to false onError)
  const [showCoverImg, setShowCoverImg] = useState<boolean>(!!item.coverUrl);
  const [showAvatarImg, setShowAvatarImg] = useState<boolean>(!!item.avatarUrl);
  
  // Avatar hover preview state
  const [showAvatarPreview, setShowAvatarPreview] = useState(false);
  const [avatarButtonPosition, setAvatarButtonPosition] = useState<{left: number, top: number} | null>(null);
  const avatarPreviewTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (avatarPreviewTimeoutRef.current) {
        clearTimeout(avatarPreviewTimeoutRef.current);
      }
    };
  }, []);

  // prefer remote if provided (we'll *not* fall back to static JPGs; instead show initial blocks)
  const coverSrc = item.coverUrl || FALLBACK_COVER;   // still defined, but we gate with showCoverImg
  const avatarSrc = item.avatarUrl || FALLBACK_AVATAR;

  // Border color for avatar - yellow for right column, green for left
  const avatarBorderColor = isRightColumn ? '#e8b714B3' : `${AX.aiGreen}B3`;

  return (
    <div
      className="flex items-center gap-3 px-4 py-4 cursor-pointer hover:opacity-90 transition"
      onClick={() => onAction?.(item.id, item._rawToken)}
    >
      {/* Left media (tablet-sized thumbnail) */}
      <div
        className="relative rounded-md overflow-hidden flex-shrink-0"
        style={{
          width: 120,
          height: 72,
          backgroundColor: AX.surface2,
          border: `1px solid ${AX.border}`,
        }}
      >
        {/* If we have a cover URL and it hasn't failed: show image; else show initial block */}
        {showCoverImg && item.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverSrc}
            alt=""
            width={120}
            height={72}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            className="w-full h-full object-cover"
            onError={() => setShowCoverImg(false)}
          />
        ) : (
          <div className="w-full h-full grid place-items-center">
            <div
              className="rounded-md font-bold"
              style={{
                color: AX.text,
                fontSize: 24,
                letterSpacing: 1,
              }}
              aria-label={initial}
              title={item.name}
            >
              {initial}
            </div>
          </div>
        )}
      </div>

      {/* Middle content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {/* tiny avatar */}
          <div
            className="relative flex-shrink-0"
            style={{
              width: 44,  // Larger to accommodate border
              height: 44,
            }}
            onMouseEnter={(e) => {
              if (avatarPreviewTimeoutRef.current) {
                clearTimeout(avatarPreviewTimeoutRef.current);
              }
              const rect = e.currentTarget.getBoundingClientRect();
              setAvatarButtonPosition({
                left: rect.left + rect.width / 2,
                top: rect.top
              });
              avatarPreviewTimeoutRef.current = setTimeout(() => {
                setShowAvatarPreview(true);
              }, 300); // Small delay to prevent flickering
            }}
            onMouseLeave={() => {
              if (avatarPreviewTimeoutRef.current) {
                clearTimeout(avatarPreviewTimeoutRef.current);
                avatarPreviewTimeoutRef.current = null;
              }
              setShowAvatarPreview(false);
            }}
          >
            {/* Outer border container matching PulseTable style */}
            <div 
              className="relative rounded-sm cursor-pointer"
              style={{
                border: `1px solid ${avatarBorderColor}`, // Yellow border for right column, green for left
                padding: '2px',
                backgroundColor: AX.bg
              }}
            >
              {/* Image container */}
              <div 
                className="relative rounded-sm overflow-hidden"
                style={{ width: 40, height: 40 }}
              >
                {showAvatarImg && item.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarSrc}
                    alt=""
                    width={40}
                    height={40}
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                    className="w-full h-full object-cover"
                    onError={() => setShowAvatarImg(false)}
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center bg-neutral-900">
                    <span
                      className="font-bold"
                      style={{ color: AX.text, fontSize: 12 }}
                      aria-label={initial}
                      title={item.name}
                    >
                      {initial}
                    </span>
                  </div>
                )}
              </div>
            </div>
            
            {/* Avatar Preview Popup */}
            {showAvatarPreview && avatarButtonPosition && showAvatarImg && item.avatarUrl && typeof window !== 'undefined' && createPortal(
              <div 
                className="fixed pointer-events-none"
                style={{
                  left: `${avatarButtonPosition.left}px`,
                  top: `${avatarButtonPosition.top - 200}px`,
                  transform: 'translate(-50%, 0)',
                  zIndex: 99999999,
                  pointerEvents: 'auto'
                }}
                onMouseEnter={() => {
                  if (avatarPreviewTimeoutRef.current) {
                    clearTimeout(avatarPreviewTimeoutRef.current);
                    avatarPreviewTimeoutRef.current = null;
                  }
                }}
                onMouseLeave={() => {
                  if (avatarPreviewTimeoutRef.current) {
                    clearTimeout(avatarPreviewTimeoutRef.current);
                  }
                  setShowAvatarPreview(false);
                }}
              >
                <div 
                  className="rounded overflow-hidden"
                  style={{
                    backgroundColor: AX.surface,
                    border: `1px solid ${AX.border}`,
                    width: '200px',
                    height: '200px',
                    backdropFilter: 'blur(10px)'
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={avatarSrc}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              </div>,
              document.body
            )}
          </div>

          {/* name + symbol + copy icon */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="font-semibold min-w-0 flex items-center gap-1" style={{ color: AX.text }}>
              <span className="truncate" title={item.name}>{truncateMiddle(item.name, 25)}</span>
              {item.symbol ? <span className="opacity-70 font-normal whitespace-nowrap" title={item.symbol}>{truncateMiddle(item.symbol, 15)}</span> : null}
            </div>
            {(item._rawToken?.mint || item.id) && (
              <button
                className="transition-colors duration-200 flex-shrink-0 cursor-pointer"
                style={{ color: AX.muted }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = AX.aiBlue;
                  e.currentTarget.style.boxShadow = `0 0 6px ${AX.glowBlue}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = AX.muted;
                  e.currentTarget.style.boxShadow = 'none';
                }}
                onClick={async (e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  const mintAddress = item._rawToken?.mint || item.id;
                  if (!mintAddress) {
                    console.error('No mint address or ID available');
                    return;
                  }
                  
                  console.log('[PumpLive] Copy button clicked, mintAddress:', mintAddress);
                  console.log('[PumpLive] showCopyToast available:', !!showCopyToast);
                  
                  try {
                    await navigator.clipboard.writeText(mintAddress);
                    console.log('[PumpLive] Clipboard write successful');
                    if (showCopyToast) {
                      console.log('[PumpLive] Calling showCopyToast');
                      showCopyToast();
                    } else {
                      console.warn('[PumpLive] showCopyToast is not available');
                    }
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
                    console.error('[PumpLive] Failed to copy to clipboard:', err);
                    // Fallback for older browsers
                    const textArea = document.createElement('textarea');
                    textArea.value = mintAddress;
                    textArea.style.position = 'fixed';
                    textArea.style.left = '-999999px';
                    textArea.style.top = '-999999px';
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    try {
                      const successful = document.execCommand('copy');
                      console.log('[PumpLive] Fallback copy command result:', successful);
                      if (showCopyToast) {
                        console.log('[PumpLive] Calling showCopyToast after fallback');
                        showCopyToast();
                      }
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
                      console.error('[PumpLive] Fallback copy failed:', fallbackErr);
                    }
                    document.body.removeChild(textArea);
                  }
                }}
                title="Copy contract address"
              >
                <FaRegCopy size={12} />
              </button>
            )}
          </div>
          
          {/* description - right under token name */}
          {item.desc ? (
            <div
              className="mt-1 text-xs line-clamp-2"
              style={{ color: AX.muted, maxWidth: "42ch" }}
              title={item.desc}
            >
              {item.desc}
            </div>
          ) : null}
        </div>

        {/* blue icon row + comments */}
        <BlueIconRow chipText={item.chipAge || item.age} comments={item.comments ?? 0} item={item} />
      </div>

      {/* Right: MC + lightning */}
      <div className="flex flex-col items-end gap-2">
        {/* Market Cap - displayed above quick buy button */}
        <div className="text-right">
          <div className="flex items-center gap-2 justify-end">
            <span className="text-xs opacity-60" style={{ color: AX.text }}>
              MC
            </span>
            <span 
              className="font-semibold" 
              style={{ 
                color: getMarketCapColor(item),
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                fontWeight: '400'
              }}
            >
              {mcText}
            </span>
          </div>
        </div>

        {/* Quick Buy Button */}
        {onQuickBuy && item._rawToken && (
          <button
            className="flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold transition-all duration-200 ease-out opacity-100 shadow-sm"
            style={{ 
              backgroundColor: AX.aiGreen,
              color: '#000000',
              border: '1px solid rgba(0,0,0,0.15)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = AX.aiGreenHover;
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = `0 4px 14px ${AX.glowGreen}`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = AX.aiGreen;
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              // Convert PumpItem to Token format for handleQuickBuy - exactly like trending tab
              const rawToken = item._rawToken;
              if (rawToken && onQuickBuy) {
                // DEBUG: Log raw token data to see what we're working with
                console.log('[PumpLive] Raw token data:', {
                  mint: rawToken.mint,
                  bondingCurveKey: rawToken.bondingCurveKey,
                  pair_address: rawToken.pair_address,
                  pairAddress: rawToken.pairAddress,
                  migrated_pool_address: rawToken.migrated_pool_address,
                  migratedPoolAddress: rawToken.migratedPoolAddress,
                  protocol: rawToken.protocol,
                  launchpad_protocol: rawToken.launchpad_protocol,
                  pool: rawToken.pool,
                  poolAddress: rawToken.poolAddress || rawToken.pool_address,
                  amm_id: rawToken.amm_id,
                });
                
                // Calculate market cap from available data
                const marketCapUsd = rawToken.market_cap_usd || (rawToken.marketCapSol ? rawToken.marketCapSol * 170 : 0);
                const fullyDilutedValue = marketCapUsd;
                
                // CRITICAL: Determine pool address exactly like handleQuickBuy does
                // handleQuickBuy uses: effectivePoolAddress = token.migrated_pool_address || token.pair_address
                // So we need:
                // - token.pair_address = original pair address (bondingCurveKey for pre-migration)
                // - token.migrated_pool_address = migrated pool if available
                // - payload.poolAddress = migrated_pool_address || pair_address
                
                // Get the original pair_address (bondingCurveKey for pre-migration tokens)
                const originalPairAddress = getFirstString(
                  rawToken.pair_address,
                  rawToken.pairAddress,
                  rawToken.bondingCurveKey,
                  rawToken.bonding_curve_key,
                  rawToken.bonding_curve_address,
                  rawToken.bondingCurve?.address,
                  rawToken.bonding_curve?.address,
                );
                // Get migrated pool address if available
                const migratedPoolAddress = getFirstString(
                  rawToken.migrated_pool_address,
                  rawToken.migratedPoolAddress,
                  rawToken.migrated_poolAddress,
                  rawToken.migrated_pool?.address,
                  rawToken.migratedPool?.address,
                  rawToken.target_pool_address,
                  rawToken.targetPoolAddress,
                );
                const fallbackPoolAddress = getFirstString(
                  rawToken.poolAddress,
                  rawToken.pool_address,
                  rawToken.amm_id,
                  rawToken.ammId,
                  typeof rawToken.pool === 'string' && rawToken.pool.length >= 32 ? rawToken.pool : undefined,
                );
                // Effective pool address (what handleQuickBuy will use)
                const effectivePoolAddress = getFirstString(
                  migratedPoolAddress,
                  originalPairAddress,
                  fallbackPoolAddress,
                );
                
                if (!effectivePoolAddress || effectivePoolAddress.trim() === '') {
                  console.error('[PumpLive] ❌ No valid pool address found!', {
                    migrated_pool_address: rawToken.migrated_pool_address,
                    bondingCurveKey: rawToken.bondingCurveKey,
                    pair_address: rawToken.pair_address,
                    pairAddress: rawToken.pairAddress,
                    poolAddress: rawToken.poolAddress || rawToken.pool_address,
                    fallbackPoolAddress,
                    itemId: item.id,
                  });
                  showCenteredErrorToast('Invalid token: No pool address available');
                  return;
                }
                
                console.log('[PumpLive] Pool address selection:', {
                  originalPairAddress: originalPairAddress || 'none',
                  migrated_pool_address: migratedPoolAddress || 'none',
                  bondingCurveKey: rawToken.bondingCurveKey || 'none',
                  fallbackPoolAddress: fallbackPoolAddress || 'none',
                  effectivePoolAddress: effectivePoolAddress,
                  isMigrated: !!migratedPoolAddress
                });
                
                const token: Token = {
                  id: 0,
                  mint: rawToken.mint || item.id,
                  standard: '',
                  name: item.name,
                  symbol: item.symbol || '',
                  logo: item.avatarUrl || item.coverUrl || rawToken.image || '',
                  decimals: typeof rawToken.decimals === 'number' ? rawToken.decimals : 6,
                  metaplex: null,
                  fully_diluted_value: fullyDilutedValue,
                  total_supply: 0,
                  total_supply_formatted: 0,
                  links: null,
                  description: item.desc || '',
                  is_verified_contract: false,
                  possible_spam: false,
                  total_buy_volume_5m: 0,
                  total_buy_volume_1h: 0,
                  total_buy_volume_6h: 0,
                  total_buy_volume_24h: 0,
                  total_sell_volume_5m: 0,
                  total_sell_volume_1h: 0,
                  total_sell_volume_6h: 0,
                  total_sell_volume_24h: 0,
                  total_buyers_5m: 0,
                  total_buyers_1h: 0,
                  total_buyers_6h: 0,
                  total_buyers_24h: 0,
                  total_sellers_5m: 0,
                  total_sellers_1h: 0,
                  total_sellers_6h: 0,
                  total_sellers_24h: 0,
                  total_buys_5m: 0,
                  total_buys_1h: 0,
                  total_buys_6h: 0,
                  total_buys_24h: 0,
                  total_sells_5m: 0,
                  total_sells_1h: 0,
                  total_sells_6h: 0,
                  total_sells_24h: 0,
                  unique_wallets_5m: 0,
                  unique_wallets_1h: 0,
                  unique_wallets_6h: 0,
                  unique_wallets_24h: 0,
                  price_percent_change_5m: 0,
                  price_percent_change_1h: 0,
                  price_percent_change_6h: 0,
                  price_percent_change_24h: 0,
                  sol_price: 0,
                  usd_price: 0,
                  market_cap_usd: marketCapUsd,
                  total_liquidity_usd: 0,
                  total_fully_diluted_valuation: fullyDilutedValue,
                  total_snipers: 0,
                  // CRITICAL: Set pair_address to original (bondingCurveKey), not effective pool address
                  // handleQuickBuy will use: effectivePoolAddress = migrated_pool_address || pair_address
                  pair_address: originalPairAddress || effectivePoolAddress,
                  migrated_pool_address: migratedPoolAddress || undefined,
                  total_holders: 0,
                  created_at: rawToken.created_at || new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  bonding_curve_progress: rawToken.bonding_curve_progress || rawToken.bondingCurveProgress || 0,
                  uri: rawToken.uri || rawToken.metadata_uri || item.coverUrl,
                  // For pump.fun tokens, protocol is typically 'pump' or 'pump.fun'
                  launchpad_protocol: getFirstString(
                    rawToken.launchpad_protocol,
                    rawToken.protocol,
                    rawToken.pool,
                  ) || 'pump',
                  protocol: getFirstString(
                    rawToken.protocol,
                    rawToken.pool,
                  ) || 'pump',
                  amm_id: getFirstString(rawToken.amm_id, rawToken.ammId) || undefined,
                };
                
                // DEBUG: Log the constructed token to compare with Trending
                console.log('[PumpLive] ✅ Constructed Token object (FULL):', JSON.stringify(token, null, 2));
                console.log('[PumpLive] ✅ Token summary:', {
                  mint: token.mint,
                  pair_address: token.pair_address,
                  migrated_pool_address: token.migrated_pool_address || '(none)',
                  launchpad_protocol: token.launchpad_protocol,
                  protocol: token.protocol,
                  amm_id: token.amm_id,
                  effectivePoolAddress: token.migrated_pool_address || token.pair_address,
                  decimals: token.decimals,
                  standard: token.standard,
                  name: token.name,
                  symbol: token.symbol,
                });
                console.log('[PumpLive] ✅ Raw token data:', {
                  mint: rawToken.mint,
                  pair_address: rawToken.pair_address,
                  pairAddress: rawToken.pairAddress,
                  bondingCurveKey: rawToken.bondingCurveKey,
                  migrated_pool_address: rawToken.migrated_pool_address,
                  migratedPoolAddress: rawToken.migratedPoolAddress,
                  protocol: rawToken.protocol,
                  launchpad_protocol: rawToken.launchpad_protocol,
                });
                
                // Call handleQuickBuy exactly like Trending does
                onQuickBuy(token);
              }
            }}
            title={`Quick Buy ${quickBuyAmount || 0} SOL`}
          >
            <HiLightningBolt className="text-black" size={14} />
            <span>{quickBuyAmount || '0'} SOL</span>
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------- main (tablet width) ---------------- */

export default function PumpLive({
  leftItems,
  rightItems,
  onAction,
  quickBuyAmount,
  onQuickBuy,
}: {
  leftItems: PumpItem[];
  rightItems: PumpItem[];
  onAction?: (id: string, rawToken?: any) => void;
  quickBuyAmount?: number;
  onQuickBuy?: (token: Token) => void;
}) {
  const [showToast, setShowToast] = useState(false);
  const [leftSearch, setLeftSearch] = useState("");
  const [rightSearch, setRightSearch] = useState("");

  const showCopyToast = () => {
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 2000);
  };

  // Filter function to search by name or symbol (case-insensitive)
  const filterItems = (items: PumpItem[], searchQuery: string): PumpItem[] => {
    if (!searchQuery.trim()) {
      return items;
    }
    const query = searchQuery.toLowerCase().trim();
    return items.filter((item) => {
      const nameMatch = item.name?.toLowerCase().includes(query);
      const symbolMatch = item.symbol?.toLowerCase().includes(query);
      return nameMatch || symbolMatch;
    });
  };

  // Memoized filtered items
  const filteredLeftItems = useMemo(() => filterItems(leftItems, leftSearch), [leftItems, leftSearch]);
  const filteredRightItems = useMemo(() => filterItems(rightItems, rightSearch), [rightItems, rightSearch]);

  return (
    <>
      {/* Copy Success Toast */}
      {showToast && (
        <div 
          className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[9999] px-4 py-2 rounded-lg shadow-lg transition-all duration-300 ease-out"
          style={{
            backgroundColor: AX.surface,
            color: AX.aiGreen,
            border: `1px solid ${AX.aiGreen}`,
            boxShadow: `0 4px 12px rgba(0, 0, 0, 0.3), 0 0 8px ${AX.glowGreen}`
          }}
        >
          <div className="flex items-center gap-2">
            <FaRegCopy size={14} />
            <span className="text-sm font-medium">Copied to clipboard!</span>
          </div>
        </div>
      )}

    <div className="mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6" style={{ maxWidth: 1800 }}>
      {/* LEFT: New Streams */}
      <section
        className="rounded overflow-hidden mx-auto"
        style={{ backgroundColor: AX.surface2, border: `1px solid ${AX.border}`, maxWidth: 900, width: "100%" }}
      >
        <header
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: `1px solid ${AX.border}` }}
        >
          <div className="text-sm font-semibold" style={{ color: AX.text }}>
            New Streams
          </div>
          {/* search input */}
          <input
            type="text"
            placeholder="Search by ticker or name"
            value={leftSearch}
            onChange={(e) => setLeftSearch(e.target.value)}
            className="text-xs px-3 py-1 rounded-full bg-transparent outline-none transition-colors"
            style={{
              backgroundColor: AX.surface,
              color: AX.text,
              border: `1px solid ${AX.border}`,
              width: '180px',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = AX.aiBlue;
            }}
            onBlur={(e) => {
              e.target.style.borderColor = AX.border;
            }}
          />
        </header>

        <div style={{ maxHeight: 600, overflowY: "auto" }} className="p-0">
          {filteredLeftItems.length > 0 ? (
            filteredLeftItems.map((it, index) => (
              <div 
                key={it.id} 
                className={index < filteredLeftItems.length - 1 ? "border-b" : ""}
                style={{ borderColor: AX.border }}
              >
                <PumpRow item={it} onAction={onAction} showCopyToast={showCopyToast} quickBuyAmount={quickBuyAmount} onQuickBuy={onQuickBuy} isRightColumn={false} />
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-sm px-3" style={{ color: AX.muted }}>
              No tokens found matching "{leftSearch}"
            </div>
          )}
        </div>
      </section>

      {/* RIGHT: Top Stream Tokens */}
      <section
        className="rounded overflow-hidden mx-auto"
        style={{ backgroundColor: AX.surface2, border: `1px solid ${AX.border}`, maxWidth: 900, width: "100%" }}
      >
        <header
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: `1px solid ${AX.border}` }}
        >
          <div className="text-sm font-semibold" style={{ color: AX.text }}>
            Top Stream Tokens
          </div>
          {/* search input */}
          <input
            type="text"
            placeholder="Search by ticker or name"
            value={rightSearch}
            onChange={(e) => setRightSearch(e.target.value)}
            className="text-xs px-3 py-1 rounded-full bg-transparent outline-none transition-colors"
            style={{
              backgroundColor: AX.surface,
              color: AX.text,
              border: `1px solid ${AX.border}`,
              width: '180px',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = AX.aiBlue;
            }}
            onBlur={(e) => {
              e.target.style.borderColor = AX.border;
            }}
          />
        </header>

        <div style={{ maxHeight: 600, overflowY: "auto" }} className="p-0">
          {filteredRightItems.length > 0 ? (
            filteredRightItems.map((it, index) => (
              <div 
                key={it.id} 
                className={index < filteredRightItems.length - 1 ? "border-b" : ""}
                style={{ borderColor: AX.border }}
              >
                <PumpRow item={it} onAction={onAction} showCopyToast={showCopyToast} quickBuyAmount={quickBuyAmount} onQuickBuy={onQuickBuy} isRightColumn={true} />
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-sm px-3" style={{ color: AX.muted }}>
              No tokens found matching "{rightSearch}"
            </div>
          )}
        </div>
      </section>
    </div>
    </>
  );
}

/* ------- tiny demo placeholders (optional) ------- */
export const demoLeft: PumpItem[] = [
  {
    id: "l1",
    name: "209beats",
    symbol: "209mad…",
    desc: "Making beats at its finest",
    age: "22m",
    chipAge: "3mo",
    comments: 21,
    mc: "$7.26K",
    // omit coverUrl/avatarUrl to see first-letter fallback
  },
  {
    id: "l2",
    name: "DAP",
    symbol: "Dumb ahh Pum…",
    desc: "just a dumb ahh pumkin doin dumb ahh shi…",
    age: "31s",
    chipAge: "24m",
    comments: 2,
    // mc omitted on purpose to show dummy
  },
];

export const demoRight: PumpItem[] = [
  {
    id: "r1",
    name: "Gunit",
    symbol: "Get Rich or d…",
    desc: "from the bottom straight to the top 🚀 b…",
    age: "52s",
    chipAge: "1m",
    comments: 2,
    mc: "$5.43K",
  },
  {
    id: "r2",
    name: "dbd",
    symbol: "dance bbay dog",
    desc: "dancing dog",
    age: "18m",
    chipAge: "8mo",
    comments: 1,
  },
];
