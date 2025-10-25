import React, { useState } from "react";
import type { Token } from "~/utils/db";
import { formatSmartNumber } from "~/utils/db";
import { useWatchlist } from "../WatchlistContext";
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
function getTokenAge(createdAt: string | number) {
  console.log('[TradeHeader] getTokenAge called with:', {
    createdAt,
    createdAt_type: typeof createdAt,
    createdAt_length: createdAt?.toString().length
  });
  
  // Validate input - return early if invalid
  if (!createdAt || createdAt === null || createdAt === undefined) {
    console.log('[TradeHeader] Invalid createdAt, returning "Unknown"');
    return 'Unknown';
  }
  
  // Handle Unix timestamp in seconds (convert to milliseconds)
  let timestamp = createdAt;
  if (typeof createdAt === 'number' && createdAt < 10000000000) {
    // If it's a number less than 10 billion, it's likely Unix seconds
    timestamp = createdAt * 1000;
    console.log('[TradeHeader] Converted Unix seconds to milliseconds:', { original: createdAt, converted: timestamp });
  }
  
  const createdDate = new Date(timestamp);
  
  // Validate the date - return early if invalid
  if (isNaN(createdDate.getTime())) {
    console.log('[TradeHeader] Invalid date created, returning "Unknown"');
    return 'Unknown';
  }
  
  const now = new Date();
  const diffMs = now.getTime() - createdDate.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  console.log('[TradeHeader] Age calculation:', {
    createdAt,
    timestamp,
    createdDate: createdDate.toISOString(),
    createdDate_valid: !isNaN(createdDate.getTime()),
    now: now.toISOString(),
    diffMs,
    diffMins,
    diffHours,
    diffDays,
    diffYears: Math.floor(diffDays / 365)
  });
  
  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  return `${diffMins}m`;
}

// Protocol color mapping - matches PulseTable styling
const protocolColorMap: Record<string, string> = {
  'pump': '#22c55e',        // Green for pump.fun
  'pump.fun': '#22c55e',    // Green for pump.fun
  'bonk': '#ff6b35',
  'moonshot': '#a855f7',
  'heaven': '#8b5cf6',
  'daos.fun': '#06b6d4',
  'candle': '#f59e0b',
  'sugar': '#ec4899',
  'believe': '#10b981',
  'jupiter': '#8b5cf6',
  'moonit': '#74831f',      // Green-brown for moonit
  'boop': '#134577',        // Dark blue for boopfun
  'boopfun': '#134577',     // Dark blue for boopfun
  'launchlab': '#ef4444',
  'dynamic': '#526fff',
  'raydium': '#5c51f7',     // Purple for raydium
  'raydiumlaunchpad': '#5c51f7',  // Purple for raydiumlaunchpad
  'meteora': '#ff4662',     // Pink-red for meteora
  'meteora_v2': '#ff4662',  // Pink-red for meteora
  'pump_amm': '#e9ba14',    // Gold for pump amm
  'orca': '#0ea5e9'
};

// Determine column type based on token's migration/bonding progress
function getColumnType(token: Token): 'new' | 'final-stretch' | 'migrated' {
  // Check if token has migrated/graduated
  const isMigrated = (token as any).is_migrated || 
                     (token as any).migrated || 
                     (token as any).graduated ||
                     (token as any).is_graduated;
  
  if (isMigrated) {
    return 'migrated';
  }
  
  // Calculate bonding curve progress
  const bondingPct = (token as any).bonding_pct;
  const bondingProgress = token.bonding_curve_progress;
  const graduationPercent = (token as any).graduationPercent;
  const marketCap = (token as any).fully_diluted_value ?? (token as any).market_cap_usd ?? 0;
  
  let progress = 0;
  
  if (typeof bondingPct === 'number' && bondingPct >= 0) {
    progress = bondingPct;
  } else if (typeof bondingProgress === 'number' && bondingProgress >= 0) {
    progress = bondingProgress * 100; // Convert to percentage
  } else if (typeof graduationPercent === 'number' && graduationPercent >= 0) {
    progress = graduationPercent;
  } else if (marketCap > 0) {
    // Estimate based on market cap (graduation target is $69M)
    progress = Math.min((marketCap / 69000000) * 100, 100);
  }
  
  // Final stretch is typically 60-100% progress
  if (progress >= 60) {
    return 'final-stretch';
  }
  
  // Default to new pairs
  return 'new';
}

// Get protocol color based on launchpad_protocol field and column type
function getProtocolColor(token: Token, columnType: 'new' | 'final-stretch' | 'migrated'): string {
  const launchpadProtocol = (token as any).launchpad_protocol?.toLowerCase();
  const protocol = (token as any).protocol?.toLowerCase();
  const launchpadName = (token as any).launchpadName?.toLowerCase();
  const amm = (token as any).amm?.toLowerCase();
  
  // Try all possible protocol field names
  const protocolValue = launchpadProtocol || protocol || launchpadName || amm;
  
  if (!protocolValue) {
    return '#22c55e'; // Default green
  }
  
  // Special handling for Meteora - use column type since Meteora doesn't have bonding scores
  if (protocolValue.includes('meteora')) {
    // Meteora tokens: red in new pairs and final stretch, yellow in migrated
    if (columnType === 'migrated') {
      return '#eab308'; // Yellow for migrated
    } else {
      return '#ff4662'; // Red for new pairs and final stretch
    }
  }
  
  // Special handling for Pump - use column type to determine color
  if (protocolValue.includes('pump')) {
    // Pump tokens: green in new pairs and final stretch, yellow in migrated
    if (columnType === 'migrated') {
      return '#eab308'; // Yellow for migrated
    } else {
      return '#22c55e'; // Green for new pairs and final stretch
    }
  }
  
  // Direct match first
  if (protocolColorMap[protocolValue]) {
    return protocolColorMap[protocolValue];
  }
  
  if (protocolValue.includes('raydium')) {
    return '#5c51f7'; // Purple for raydium
  }
  
  if (protocolValue.includes('moonit')) {
    return '#74831f'; // Green-brown for moonit
  }
  
  if (protocolValue.includes('boop')) {
    return '#134577'; // Dark blue for boopfun
  }
  
  if (protocolValue.includes('bonk')) {
    return protocolColorMap['bonk'];
  }
  
  if (protocolValue.includes('orca')) {
    return protocolColorMap['orca'];
  }
  
  if (protocolValue.includes('jupiter')) {
    return protocolColorMap['jupiter'];
  }
  
  // Default to green if no match found
  return '#22c55e';
}

// Get icon based on token data - dynamically maps launchpad_protocol to icon
function getTokenIcon(token: Token): string {
  const launchpadProtocol = (token as any).launchpad_protocol?.toLowerCase();
  const protocol = (token as any).protocol?.toLowerCase();
  const launchpadName = (token as any).launchpadName?.toLowerCase();
  const amm = (token as any).amm?.toLowerCase();
  
  // Debug logging
  console.log('[TradeHeader getTokenIcon]', {
    symbol: token.symbol,
    launchpad_protocol: (token as any).launchpad_protocol,
    protocol: (token as any).protocol,
    launchpadName: (token as any).launchpadName,
    amm: (token as any).amm
  });
  
  // Try all possible protocol field names
  const protocolValue = launchpadProtocol || protocol || launchpadName || amm;
  
  if (!protocolValue) {
    console.log('[TradeHeader getTokenIcon] No protocol found, defaulting to pump');
    // Default to pump.fun icon if no protocol info
    return 'https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png';
  }
  
  // Map launchpad_protocol to external logo URLs
  if (protocolValue.includes('pump')) {
    return 'https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png';
  }
  
  if (protocolValue.includes('meteora')) {
    return 'https://s1.coincarp.com/logo/1/meteora.png?style=72&v=1759911013';
  }
  
  if (protocolValue.includes('raydium')) {
    return 'https://s2.coinmarketcap.com/static/img/coins/64x64/8526.png';
  }
  
  if (protocolValue.includes('boop')) {
    return 'https://dropsearn.fra1.cdn.digitaloceanspaces.com/media/projects/logos/boopfun_logo_1746246162.webp';
  }
  
  if (protocolValue.includes('moonit')) {
    return 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR6_LEZppFrAkKMqApIwCM_R5n0-b4XC8Aluw&s';
  }
  
  if (protocolValue.includes('orca')) {
    return 'https://s2.coinmarketcap.com/static/img/coins/64x64/7501.png';
  }
  
  if (protocolValue.includes('jupiter')) {
    return 'https://s2.coinmarketcap.com/static/img/coins/64x64/29210.png';
  }
  
  console.log('[TradeHeader getTokenIcon] Unknown protocol:', protocolValue, 'defaulting to pump');
  // Default to pump.fun icon for unknown protocols
  return 'https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png';
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
  token: Token | null;
}

const TradeHeader: React.FC<TradeHeaderProps> = ({ token }) => {
  // Only show skeleton if we have absolutely no token data (not even optimistic)
  if (!token || (!token.name && !token.symbol)) {
    return (
      <div className="px-2 flex-shrink-0">
        <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: AX.surface }}>
          <div className="h-10 w-10 rounded-md bg-neutral-800 animate-pulse" />
          <div className="flex flex-col gap-1">
            <div className="h-4 w-24 bg-neutral-800 animate-pulse rounded" />
            <div className="h-3 w-16 bg-neutral-800 animate-pulse rounded" />
          </div>
        </div>
      </div>
    );
  }

  const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlist();
  const isWatched = isInWatchlist(token.pair_address || '');
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
    pairAddress: token.pair_address || '',
    tokenAddress: token.mint || '',
    enabled: true,
  });

  const showCopyToast = () => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  const handleWatchlistClick = () => {
    if (isWatched) removeFromWatchlist(token.pair_address || '');
    else addToWatchlist(token);
  };

  // Real-time market data from WebSocket with fallback to static data
  const marketData = getMarketData();
  const mcap = marketData?.market_cap_usd || token.market_cap_usd || 0;
  const price = marketData?.price_usd || token.usd_price || (token as any).price_usd || (token as any).price || 0;
  const liq = marketData?.volume_usd || token.total_liquidity_usd || (token as any).liquidity_usd || 0;
  const supply = token.total_supply ?? (token as any).supply ?? 0;
  const feesPaid = (token as any).global_fees_paid ?? (token as any).globalFeesPaid ?? "—";
  // Calculate bonding curve percentage
  const calculateBondingCurveProgress = (token: any) => {
    // Debug logging - log all available token fields
    console.log('[TradeHeader] Full token object:', token);
    console.log('[TradeHeader] Market data:', marketData);
    
    // Check all possible bonding curve fields
    const allBondingFields = {
      bonding_pct: (token as any).bonding_pct,
      bonding_curve_progress: (token as any).bonding_curve_progress,
      bcurve: (token as any).bcurve,
      graduation_percent: (token as any).graduation_percent,
      graduationPercent: (token as any).graduationPercent,
      bonding_curve: (token as any).bonding_curve,
      bondingCurve: (token as any).bondingCurve,
      progress: (token as any).progress,
      curve: (token as any).curve,
    };
    
    console.log('[TradeHeader] All bonding curve fields:', allBondingFields);
    
    // Try each field and find the first valid one
    for (const [fieldName, value] of Object.entries(allBondingFields)) {
      if (value !== null && value !== undefined && value !== '') {
        let numericValue = value;
        
        // Handle string values
        if (typeof value === 'string') {
          const cleaned = value.replace('%', '').replace(',', '');
          numericValue = parseFloat(cleaned);
        }
        
        if (Number.isFinite(numericValue) && numericValue >= 0) {
          console.log(`[TradeHeader] Using field ${fieldName} with value:`, numericValue);
          return numericValue;
        }
      }
    }

    // If no bonding curve data, try to calculate from market cap
    const currentMarketCap = marketData?.market_cap_usd || token.market_cap_usd || token.fully_diluted_value || token.total_fully_diluted_valuation || 0;
    
    console.log('[TradeHeader] Market cap values:', {
      fromMarketData: marketData?.market_cap_usd,
      tokenMarketCap: token.market_cap_usd,
      fullyDilutedValue: token.fully_diluted_value,
      totalFullyDilutedValuation: token.total_fully_diluted_valuation,
      finalMarketCap: currentMarketCap
    });
    
    // Try to calculate market cap from price and supply
    let calculatedMarketCap = currentMarketCap;
    if (!calculatedMarketCap && token.usd_price && token.total_supply) {
      calculatedMarketCap = token.usd_price * token.total_supply;
      console.log('[TradeHeader] Calculated market cap from price and supply:', calculatedMarketCap);
    }
    
    const finalMarketCap = calculatedMarketCap || currentMarketCap;
    const graduationTargetUSD = 69000000; // $69M
    
    if (finalMarketCap > 0) {
      const progress = Math.min((finalMarketCap / graduationTargetUSD) * 100, 100);
      console.log('[TradeHeader] Calculated progress:', progress);
      return Math.round(progress * 100) / 100;
    }
    
    // Last resort: show a small percentage if we have any price
    if (token.usd_price > 0) {
      console.log('[TradeHeader] Using fallback estimate from price');
      return Math.min(token.usd_price * 10000, 10); // Cap at 10%
    }
    
    console.log('[TradeHeader] No data available, returning 0');
    return 0;
  };

  const curvePct = calculateBondingCurveProgress(token);

  // Use uri field from deployed service, fallback to image field, then token.logo (same as PulseTable)
  const imageUrl = (token as any).uri || (token as any).image || token.logo;
  const imgSrc = normalizeAssetUrl(imageUrl);

  // Get protocol styling - determine column type first
  const columnType = getColumnType(token);
  const protocolColor = getProtocolColor(token, columnType);
  const tokenIcon = getTokenIcon(token);
  
  // Check all protocol fields to determine if Meteora
  const launchpadProtocol = (token as any).launchpad_protocol?.toLowerCase() || '';
  const protocol = (token as any).protocol?.toLowerCase() || '';
  const launchpadName = (token as any).launchpadName?.toLowerCase() || '';
  const amm = (token as any).amm?.toLowerCase() || '';
  const protocolValue = launchpadProtocol || protocol || launchpadName || amm;
  const isMeteora = protocolValue.includes('meteora');

  // Debug logging for protocol detection and image source
  console.log(`[TradeHeader] ${token.symbol}:`, {
    protocolFields: {
      launchpad_protocol: (token as any).launchpad_protocol,
      protocol: (token as any).protocol,
      launchpadName: (token as any).launchpadName,
      amm: (token as any).amm,
      usedProtocolValue: protocolValue
    },
    columnType: columnType,
    protocolColor: protocolColor,
    tokenIcon: tokenIcon,
    isMeteora: isMeteora,
    bonding_pct: (token as any).bonding_pct,
    bonding_curve_progress: token.bonding_curve_progress,
    is_migrated: (token as any).is_migrated,
    graduated: (token as any).graduated,
    imageSource: {
      uri: (token as any).uri,
      image: (token as any).image,
      logo: token.logo,
      usedImageUrl: imageUrl
    }
  });

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
        <div className="relative h-11 w-11">
          {/* Outer border container with protocol color */}
          <div 
            className="relative h-full w-full rounded-md transition-all duration-300 cursor-pointer"
            style={{ 
              border: `1px solid ${showPreview ? AX.aiCyan : protocolColor}`,
              padding: '1px'
            }}
            onMouseEnter={(e) => {
              setShowPreview(true);
              e.currentTarget.style.borderColor = AX.aiCyan;
              e.currentTarget.style.boxShadow = `0 0 12px ${AX.glowCyan}, 0 0 24px ${AX.glowCyan}, inset 0 0 12px ${AX.glowCyan}`;
            }}
            onMouseLeave={(e) => {
              setShowPreview(false);
              e.currentTarget.style.borderColor = protocolColor;
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {/* Inner silver border container */}
            <div 
              className="relative h-full w-full rounded-md"
              style={{
                border: `1px solid rgba(192, 192, 192, 0.3)`,
                padding: '1px'
              }}
            >
              {/* Image container */}
              <div className="relative h-full w-full rounded-md overflow-hidden">
                {imgSrc ? (
                  <FastImage
                    src={imageUrl}
                    alt={token.name || token.symbol || ""}
                    symbol={token.symbol}
                    name={token.name}
                    width={40}
                    height={40}
                    className="h-full w-full rounded-md object-cover transition-all duration-300"
                    priority={true}
                    showBubble={false}
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center rounded-md text-xl font-light"
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
                      size={12} 
                      style={{ color: '#000000' }}
                      className="drop-shadow-lg"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Dynamic protocol icon bubble - positioned outside the image container (bottom right pill) */}
          <div className="absolute bottom-0 right-0 bg-white rounded-full flex items-center justify-center transform translate-x-1/2 translate-y-1/2 z-10"
               style={{ 
                 width: 20, 
                 height: 20,
                 border: `2px solid ${protocolColor}`,
                 boxShadow: `0 0 4px ${protocolColor}60`
               }}>
            <img
              src={tokenIcon}
              alt={`${(token as any).launchpad_protocol || (token as any).protocol || (token as any).launchpadName || 'Protocol'} logo`}
              className={`${isMeteora ? 'w-full h-full object-cover' : 'w-3/4 h-3/4 object-contain'} rounded-full`}
              style={{
                filter: protocolColor === '#eab308' ? 'sepia(1) saturate(3) hue-rotate(-10deg) brightness(1.1)' : 'none'
              }}
            />
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
                    src={imageUrl}
                    alt={token.name || token.symbol || ""}
                    symbol={token.symbol}
                    name={token.name}
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
                  if (!token.mint) return;
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
                    textArea.value = token.mint || '';
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
            <span className="font-light" style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }}>
              {getTokenAge(token.created_at || (token as any).CreatedAt)}
            </span>
            {/* Socials */}
            <div className="relative flex items-center gap-2">
              {/* Pump.fun Link - only show for pump tokens */}
              {token.mint && token.mint.slice(-4) === "pump" && (
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
                  <LuPill size={6} />
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
          {/* <StatInline label="Global Fees Paid">
            {feesPaid === "—" ? "—" : feesPaid}
          </StatInline> */}
          <StatInline label="B.Curve" accent="green">
            {Number.isFinite(Number(curvePct)) ? `${Number(curvePct).toFixed(1)}%` : "—"}
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
      {token.mint && token.mint.slice(-4) === "pump" && (
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
