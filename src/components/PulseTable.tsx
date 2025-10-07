import React, { useState, useEffect, useRef, useMemo } from "react";
import type { Token } from "~/utils/db";
import { formatSmartNumber } from "~/utils/db";
import {
  FaUser,
  FaGlobe,
  FaSearch,
  FaCrown,
  FaRegCopy,
  FaBolt,
  FaCamera,
  FaUsers,
  FaTrophy,
  FaRunning, 
  FaGasPump, 
  FaCoins, 
  FaBan,
  FaRedo,
  FaDollarSign, 
  FaRocket, 
  FaChartBar, 
  FaGem
} from "react-icons/fa";
import { FaDice } from "react-icons/fa6";
import { BsPersonGear, BsCoin, BsMoon, BsCloud, BsCup, BsArrowUp } from "react-icons/bs";
import { LuChefHat } from "react-icons/lu";
import { RiGhostLine, RiFlaskLine } from "react-icons/ri";
import { BiCandles, BiRefresh } from "react-icons/bi";
import { 
  HiChartBar,
  HiUserGroup,
  HiLightningBolt, 
  HiSparkles
} from "react-icons/hi";
import { 
  MdTrendingUp,
  MdEmojiEvents,
  MdDynamicFeed
} from "react-icons/md";
import { SiSolana } from "react-icons/si";
import { TokenRAY, TokenSOL, TokenJUP, TokenMSOL, TokenUSDC, TokenLAUNCH, TokenDAO, TokenCUSDC, TokenDOBO } from '@web3icons/react';
import Image from 'next/image';

/* ---- Enhanced Axiom AI Palette ---- */
const AX = {
  bg: "#0f1012",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#E6E7EA",
  muted: "#9CA3AF",
  mint: "#70E0B0",
  mintHover: "#58B890",
  sell: "#FF4D7F",
  aiBlue: "#22C55E",
  aiBlueHover: "#16A34A",
  aiGreen: "#22C55E",
  aiGreenHover: "#16A34A",
  aiCyan: "#06B6D4",
  aiCyanHover: "#0891B2",
  glowBlue: "rgba(34, 197, 94, 0.3)",
  glowGreen: "rgba(34, 197, 94, 0.3)",
  glowCyan: "rgba(6, 182, 212, 0.3)",
};
import { useRouter } from "next/router";
import { fetchTokenMetadata } from "~/utils/functions";
import { LuPill, LuSearch } from "react-icons/lu";
import Link from "next/link";
import { CiSearch } from "react-icons/ci";
import FastImage from "./FastImage";

interface PulseTableProps {
  title: string;
  tokens: Token[];
  isFirstOrLast?: "first" | "last";
  loading?: boolean;
  skeletonRowCount?: number;
  showBubbleMetrics?: boolean; // Feature flag for bubble metrics (Buyers, Sellers, Wallets, 24h TX, Vol 24h)
}

// Add a simple in-memory cache for token metadata
const tokenMetadataCache: Record<string, any> = {};

// Smart color system based on token properties
interface SmartColorProps {
  children: React.ReactNode;
  className?: string;
  token: any;
  metricType: 'marketCap' | 'volume' | 'transactions';
}

const SmartColor: React.FC<SmartColorProps> = ({ children, className = "", token, metricType }) => {
  const getTokenColor = (token: any, metricType: string) => {
    const symbol = token.symbol?.toLowerCase() || '';
    const name = token.name?.toLowerCase() || '';
    const mint = token.mint || '';
    
    // AI/Tech tokens - Custom Blue
    if (symbol.includes('ai') || symbol.includes('tech') || symbol.includes('bot') || 
        name.includes('artificial') || name.includes('intelligence') || name.includes('robot')) {
      return '#52c5ff'; // Custom Blue
    }
    
    // Meme tokens - Custom Yellow
    if (symbol.includes('meme') || symbol.includes('doge') || symbol.includes('pepe') || 
        symbol.includes('shiba') || symbol.includes('floki') || symbol.includes('bonk') ||
        name.includes('meme') || name.includes('dog') || name.includes('cat')) {
      return '#ddc13d'; // Custom Yellow
    }
    
    // DeFi tokens - Green
    if (symbol.includes('defi') || symbol.includes('swap') || symbol.includes('dex') || 
        symbol.includes('farm') || symbol.includes('yield') || symbol.includes('liquidity') ||
        name.includes('finance') || name.includes('exchange') || name.includes('protocol')) {
      return '#10b981'; // Green
    }
    
    // High volume tokens - Cyan
    const volume = token.volume_24h || 0;
    if (volume > 1000000) { // > $1M volume
      return '#06b6d4'; // Cyan
    }
    
    // High market cap tokens - Purple
    const marketCap = token.fully_diluted_value || token.market_cap_usd || 0;
    if (marketCap > 10000000) { // > $10M market cap
      return '#8b5cf6'; // Purple
    }
    
    // New/trending tokens - Orange
    if (mint.slice(-4) === "pump" || symbol.length <= 3) {
      return '#f97316'; // Orange
    }
    
    // Default based on symbol hash for consistency
    const hash = symbol.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    
    const defaultColors = ['#3b82f6', '#10b981', '#f59e0b', '#06b6d4', '#8b5cf6'];
    return defaultColors[Math.abs(hash) % defaultColors.length];
  };
  
  const color = getTokenColor(token, metricType);
  
  return (
    <span 
      className={className}
      style={{ 
        color: color,
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
        fontWeight: '400'
      }}
    >
      {children}
    </span>
  );
};

// Smooth number transition component
interface SmoothNumberProps {
  value: number;
  duration?: number;
  className?: string;
  formatter?: (value: number) => string;
}

const SmoothNumber: React.FC<SmoothNumberProps> = ({
  value,
  duration = 500,
  className = "",
  formatter = (val) => val.toString(),
}) => {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationRef = useRef<number | undefined>(undefined);
  const startTimeRef = useRef<number | undefined>(undefined);
  const startValueRef = useRef<number>(value);

  useEffect(() => {
    if (value === displayValue) return;

    const startValue = displayValue;
    const endValue = value;
    const startTime = performance.now();

    startTimeRef.current = startTime;
    startValueRef.current = startValue;
    setIsAnimating(true);

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function for smooth animation
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      const currentValue = startValue + (endValue - startValue) * easeOutCubic;

      setDisplayValue(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endValue);
        setIsAnimating(false);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value, duration]);

  return (
    <span
      className={`${isAnimating ? "transition-all duration-75" : ""} ${className}`}
    >
      {formatter(displayValue)}
    </span>
  );
};

// Token Metrics Component - displays users, trades, achievements, and rank
function TokenMetrics({ token }: { token: Token }) {
  // Mock data for now 
  const metrics = {
    users: 2037,
    trades: 1, 
    achievements: 0,
    rank: "0/1"
  };

  return (
    <div className="flex items-center gap-1 relative z-10">
      {/* Users Icon - Multiple People */}
      <div className="flex items-center gap-1">
        <FaUsers size={12} style={{ color: AX.muted }} />
        <span className="text-xs" style={{ color: AX.text }}>{metrics.users}</span>
      </div>
      
      {/* Candles Icon - Trading/Volume */}
      <div className="flex items-center gap-1">
        <BiCandles size={12} style={{ color: AX.muted }} />
        <span className="text-xs" style={{ color: AX.text }}>{metrics.trades}</span>
      </div>
      
      {/* Trophy Icon - Achievements */}
      <div className="flex items-center gap-1">
        <MdEmojiEvents size={12} style={{ color: AX.muted }} />
        <span className="text-xs" style={{ color: AX.text }}>{metrics.achievements}</span>
      </div>
      
      {/* Crown Icon - Ranking */}
      <div className="flex items-center gap-1">
        <FaCrown size={12} style={{ color: AX.muted }} />
        <span className="text-xs" style={{ color: AX.text }}>{metrics.rank}</span>
      </div>
    </div>
  );
}

function useTokenMetadata(uri?: string) {
  const [meta, setMeta] = useState<any | null>(null);
  const [loading, setLoading] = useState(!!uri);
  const [showInitial, setShowInitial] = useState(false);

  useEffect(() => {
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
    const timer = setTimeout(() => setShowInitial(true), 150);
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

function TokenImage({
  token,
  priority = false,
  isNewPairs = false,
}: {
  token: Token;
  priority?: boolean;
  isNewPairs?: boolean;
}) {
  const [showPreview, setShowPreview] = useState(false);
  
  // Use uri field from deployed service, fallback to image field, then token.logo
  const imageUrl = (token as any).uri || (token as any).image || token.logo;

  // Calculate migration progress for border color (only for New Pairs)
  const getMigrationProgress = (token: Token): number => {
    if (!isNewPairs) return 0; // Only apply to New Pairs
    
    // Priority order: bonding_pct, bonding_curve_progress, graduationPercent, market cap / 70k
    const bondingPct = (token as any).bonding_pct;
    const bondingProgress = token.bonding_curve_progress;
    const graduationPercent = (token as any).graduationPercent;
    const marketCap = (token as any).fully_diluted_value ?? (token as any).market_cap_usd ?? 0;
    
    if (typeof bondingPct === 'number' && bondingPct >= 0) {
      return Math.min(Math.max(bondingPct / 100, 0), 1); // Convert percentage to 0-1 range
    }
    
    if (typeof bondingProgress === 'number' && bondingProgress >= 0) {
      return Math.min(Math.max(bondingProgress, 0), 1);
    }
    
    if (typeof graduationPercent === 'number' && graduationPercent >= 0) {
      return Math.min(Math.max(graduationPercent / 100, 0), 1); // Convert percentage to 0-1 range
    }
    
    // Fallback: market cap divided by 70k (capped at 1.0)
    if (marketCap > 0) {
      return Math.min(marketCap / 70000, 1.0);
    }
    
    return 0; // Default to 0% progress for new tokens
  };

  // Get border color based on migration progress (loading bar style)
  const getProgressBorderColor = (progress: number): string => {
    if (!isNewPairs) return '#22c55e'; // Default green for non-New Pairs
    
    // Loading bar style: green = good progress, red = bad/slow progress
    if (progress >= 0.7) {
      // Good progress - bright green
      return '#22c55e'; // green-500
    } else if (progress >= 0.4) {
      // Medium progress - yellow
      return '#eab308'; // yellow-500
    } else if (progress >= 0.1) {
      // Slow progress - orange
      return '#f97316'; // orange-500
    } else {
      // Very slow/bad progress - red
      return '#ef4444'; // red-500
    }
  };

  // Get icon based on token data
  const getTokenIcon = (token: Token): string => {
    // Check for specific protocol/launchpad data
    const protocol = (token as any).protocol;
    const launchpadName = (token as any).launchpadName;
    const amm = (token as any).amm;
    
    // Protocol-specific icons
    if (protocol === 'pump' || launchpadName === 'pump') {
      return '/pump.svg';
    }
    if (protocol === 'raydium' || amm === 'raydium') {
      return '/ray.svg';
    }
    if (protocol === 'meteora' || amm === 'meteora') {
      return '/meteora.svg';
    }
    if (protocol === 'orca' || amm === 'orca') {
      return '/orca.svg'; // You'll need to add this icon
    }
    if (protocol === 'jupiter' || amm === 'jupiter') {
      return '/jupiter.svg'; // You'll need to add this icon
    }
    
    // Default to pump icon for new pairs
    return '/pump.svg';
  };

  const tokenIcon = getTokenIcon(token);
  const migrationProgress = getMigrationProgress(token);

  // Use real migration progress for each token, with fallback to unique test progress
  const getUniqueTestProgress = (token: Token): number => {
    if (!token.symbol) return 0;
    // Create a simple hash from the symbol to get consistent progress per token
    let hash = 0;
    for (let i = 0; i < token.symbol.length; i++) {
      const char = token.symbol.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Convert hash to 0-60% range (New Pairs range)
    return Math.abs(hash) % 60 / 100;
  };

  // Use real progress if available, otherwise use unique test progress
  // For New Pairs, progress should be 0-60% range, so we scale it to 0-1 for the border
  const finalProgress = migrationProgress > 0 ? migrationProgress : (isNewPairs ? getUniqueTestProgress(token) : 0);
  
  // Scale New Pairs progress to fill more of the border (since they max out at ~60%)
  // Cap at 95% to never show full completion
  const scaledProgress = isNewPairs ? Math.min(finalProgress / 0.6, 0.95) : finalProgress;
  const progressBorderColor = getProgressBorderColor(finalProgress);

  // Debug logging for New Pairs
  if (isNewPairs) {
    console.log(`[TokenImage] ${token.symbol} progress:`, {
      bonding_pct: (token as any).bonding_pct,
      bonding_curve_progress: token.bonding_curve_progress,
      graduationPercent: (token as any).graduationPercent,
      calculatedProgress: migrationProgress,
      finalProgress: finalProgress,
      borderColor: progressBorderColor
    });
  }

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    console.log('Mouse enter - showing preview for:', token.symbol);
    setShowPreview(true);
    const target = e.currentTarget as HTMLDivElement;
    // Don't change border color since we're using SVG border now
    target.style.boxShadow = `0 0 12px ${AX.glowCyan}, 0 0 24px ${AX.glowCyan}`;
    target.style.transform = 'scale(1.08)';
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    console.log('Mouse leave - hiding preview for:', token.symbol);
    setShowPreview(false);
    const target = e.currentTarget as HTMLDivElement;
    // Don't change border color since we're using SVG border now
    target.style.boxShadow = 'none';
    target.style.transform = 'scale(1)';
  };

  return (
    <>
      <div className="relative h-20 w-20 overflow-visible rounded-lg transition-all duration-300 ease-out"
           style={{ 
             backgroundColor: AX.surface
           }}>
        <div 
          className="h-full w-full rounded-lg overflow-hidden relative"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={{
            border: isNewPairs ? '2px solid transparent' : '1px solid #22c55e'
          }}
        >
    <FastImage
      src={imageUrl}
      alt={token.name || token.symbol || ""}
      symbol={token.symbol}
      name={token.name}
            width={80}
            height={80}
            className="h-full w-full object-cover transition-all duration-300 rounded-lg"
      priority={priority}
      showBubble={false}
    />
        </div>
        
        {/* Thin loading border - solid green, clockwise from bottom-right (only for New Pairs) */}
        {isNewPairs && (
          <div className="absolute inset-0 pointer-events-none">
            <svg className="w-full h-full" viewBox="0 0 80 80">
              {/* Background border */}
              <rect
                x="2"
                y="2"
                width="76"
                height="76"
                fill="none"
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth="1"
                rx="8"
              />
              
              {/* Progress border - clockwise rounded path starting from bottom-right */}
              <path
                d="M 78 78 L 10 78 Q 2 78 2 70 L 2 10 Q 2 2 10 2 L 70 2 Q 78 2 78 10 L 78 70 Q 78 78 70 78"
                fill="none"
                stroke="#22c55e"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={`${4 * 76}`} // Total perimeter
                strokeDashoffset={`${4 * 76 * (1 - scaledProgress)}`}
                className="transition-all duration-700 ease-out"
              />
            </svg>
          </div>
        )}
        
        {/* Dynamic protocol icon bubble - positioned outside the image container */}
        <div className="absolute bottom-0 right-0 bg-white rounded-full border-2 flex items-center justify-center transform translate-x-1/2 translate-y-1/2 z-10 shadow-lg"
             style={{ 
               width: 20, 
               height: 20,
               borderColor: '#22c55e' // Always green
             }}>
          <img
            src={tokenIcon}
            alt={`${(token as any).protocol || (token as any).launchpadName || 'Protocol'} logo`}
            className="w-3/4 h-3/4 object-contain"
          />
        </div>
        {/* Camera icon overlay with AI-inspired styling - only shows on image hover */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-all duration-300 pointer-events-none"
             style={{ opacity: showPreview ? 1 : 0 }}>
          <div className="flex items-center justify-center rounded-full p-2"
               style={{ 
                 backgroundColor: AX.aiCyan,
                 boxShadow: `0 0 8px ${AX.glowCyan}`
               }}>
            <FaCamera 
              size={16} 
              style={{ color: '#000000' }}
              className="drop-shadow-lg"
            />
          </div>
        </div>
        
        {/* Futuristic AI border with shine effect */}
        <div className="absolute inset-0 pointer-events-none opacity-0 transition-all duration-300"
             style={{ opacity: showPreview ? 1 : 0 }}>
          {/* Main border glow */}
          <div className="absolute inset-0 rounded-lg"
               style={{
                 border: `2px solid ${AX.aiBlue}`,
                 boxShadow: `0 0 20px ${AX.glowBlue}, 0 0 40px ${AX.glowBlue}, inset 0 0 20px ${AX.glowBlue}`,
                 background: `linear-gradient(45deg, transparent 30%, ${AX.aiBlue}20 50%, transparent 70%)`
               }}></div>
          
          {/* Animated shine effect */}
          <div className="absolute inset-0 rounded-lg overflow-hidden">
            <div className="absolute inset-0"
                 style={{
                   background: `linear-gradient(45deg, transparent 30%, ${AX.aiCyan}40 50%, transparent 70%)`,
                   animation: 'shine 2s ease-in-out infinite'
                 }}></div>
          </div>
          
          {/* Corner accents */}
          <div className="absolute top-0 left-0 h-3 w-3"
               style={{ 
                 background: `linear-gradient(45deg, ${AX.aiCyan}, ${AX.aiGreen})`,
                 clipPath: 'polygon(0 0, 100% 0, 0 100%)',
                 filter: 'drop-shadow(0 0 4px rgba(34, 197, 94, 0.8))'
               }}></div>
          <div className="absolute bottom-0 right-0 h-3 w-3"
               style={{ 
                 background: `linear-gradient(45deg, ${AX.aiBlue}, ${AX.aiCyan})`,
                 clipPath: 'polygon(100% 0, 100% 100%, 0 100%)',
                 filter: 'drop-shadow(0 0 4px rgba(59, 130, 246, 0.8))'
               }}></div>
        </div>
      </div>

      {/* Image Preview Window */}
      {showPreview && (
        <div 
          className="absolute z-[9999] pointer-events-none"
          style={{
            left: '100%',
            top: '0%',
            transform: 'translate(20px, 0px)'
          }}
        >
          <div className="relative">
            {/* Main preview container */}
            <div 
              className="relative overflow-hidden rounded-xl border-2 shadow-2xl"
              style={{
                width: '200px',
                height: '200px',
                backgroundColor: AX.surface,
                borderColor: AX.aiCyan,
                boxShadow: `0 0 20px ${AX.glowCyan}, 0 0 40px ${AX.glowCyan}, 0 8px 32px rgba(0, 0, 0, 0.3)`
              }}
            >
              <FastImage
                src={imageUrl}
                alt={token.name || token.symbol || ""}
                symbol={token.symbol}
                name={token.name}
                width={200}
                height={200}
                className="h-full w-full object-cover"
                priority={priority}
              />
              
              {/* border effects */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Animated border lines */}
                <div 
                  className="absolute top-0 left-0 w-full h-0.5 opacity-80"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${AX.aiCyan}, transparent)`,
                    animation: 'borderFlow 2s linear infinite'
                  }}
                ></div>
                <div 
                  className="absolute bottom-0 left-0 w-full h-0.5 opacity-80"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${AX.aiGreen}, transparent)`,
                    animation: 'borderFlow 2s linear infinite reverse'
                  }}
                ></div>
                <div 
                  className="absolute top-0 left-0 w-0.5 h-full opacity-80"
                  style={{
                    background: `linear-gradient(180deg, transparent, ${AX.aiBlue}, transparent)`,
                    animation: 'borderFlow 2s linear infinite'
                  }}
                ></div>
                <div 
                  className="absolute top-0 right-0 w-0.5 h-full opacity-80"
                  style={{
                    background: `linear-gradient(180deg, transparent, ${AX.aiCyan}, transparent)`,
                    animation: 'borderFlow 2s linear infinite reverse'
                  }}
                ></div>
              </div>

              {/* Corner accents */}
              <div 
                className="absolute top-1 left-1 w-3 h-3 opacity-90"
                style={{
                  background: `linear-gradient(45deg, ${AX.aiCyan}, ${AX.aiGreen})`,
                  clipPath: 'polygon(0 0, 100% 0, 0 100%)'
                }}
              ></div>
              <div 
                className="absolute bottom-1 right-1 w-3 h-3 opacity-90"
                style={{
                  background: `linear-gradient(45deg, ${AX.aiBlue}, ${AX.aiCyan})`,
                  clipPath: 'polygon(100% 0, 100% 100%, 0 100%)'
                }}
              ></div>
            </div>

            {/* Migration progress tooltip - only for New Pairs */}
            {isNewPairs && (
              <div 
                className="absolute -top-10 left-1/2 transform -translate-x-1/2 px-2 py-1 rounded text-xs font-medium whitespace-nowrap z-50"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  color: '#22c55e',
                  border: '1px solid #22c55e20',
                  backdropFilter: 'blur(4px)',
                  opacity: showPreview ? 1 : 0,
                  transition: 'opacity 0.2s ease-out'
                }}
              >
                Progress: {Math.round(scaledProgress * 100)}%
              </div>
            )}
            
            {/* Token info overlay */}
            <div 
              className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 px-2 py-1 rounded text-xs font-medium whitespace-nowrap"
              style={{
                backgroundColor: AX.surface,
                color: AX.text,
                border: `1px solid ${AX.border}`,
                boxShadow: `0 4px 12px rgba(0, 0, 0, 0.3), 0 0 8px ${AX.glowCyan}`
              }}
            >
              {token.symbol} - {token.name}
            </div>
          </div>
        </div>
      )}

      {/* Global CSS to remove number input arrows */}
      <style dangerouslySetInnerHTML={{
        __html: `
          input[type="number"]::-webkit-outer-spin-button,
          input[type="number"]::-webkit-inner-spin-button {
            -webkit-appearance: none !important;
            margin: 0 !important;
            display: none !important;
            opacity: 0 !important;
            pointer-events: none !important;
            width: 0 !important;
            height: 0 !important;
            position: absolute !important;
            left: -9999px !important;
          }
          
          input[type="number"] {
            -moz-appearance: textfield !important;
            -webkit-appearance: none !important;
          }
          
          input[type="number"]:focus {
            outline: none !important;
            box-shadow: none !important;
          }
        `
      }} />

      {/* CSS for animations */}
      <style jsx>{`
        @keyframes shine {
          0% { transform: translateX(-100%) translateY(-100%) rotate(45deg); }
          50% { transform: translateX(100%) translateY(100%) rotate(45deg); }
          100% { transform: translateX(-100%) translateY(-100%) rotate(45deg); }
        }
        
        /* Wave animations - Added by hujoe - can use in the future
        @keyframes smoothWaveFlow {
          0% { 
            transform: translateX(-120%); 
            opacity: 0;
          }
          5% { 
            opacity: 0.3;
          }
          15% { 
            opacity: 0.8;
          }
          85% { 
            opacity: 0.8;
          }
          95% { 
            opacity: 0.3;
          }
          100% { 
            transform: translateX(120%); 
            opacity: 0;
          }
        }
        
        @keyframes aiGlowPulse {
          0% { 
            box-shadow: 0 0 0px rgba(30, 58, 138, 0), 0 0 0px rgba(30, 58, 138, 0), inset 0 0 0px rgba(30, 58, 138, 0);
            background: rgba(30, 58, 138, 0);
          }
          25% { 
            box-shadow: 0 0 15px rgba(30, 58, 138, 0.4), 0 0 30px rgba(30, 58, 138, 0.2), inset 0 0 15px rgba(30, 58, 138, 0.1);
            background: rgba(30, 58, 138, 0.05);
          }
          50% { 
            box-shadow: 0 0 25px rgba(30, 58, 138, 0.6), 0 0 50px rgba(30, 58, 138, 0.3), inset 0 0 25px rgba(30, 58, 138, 0.15);
            background: rgba(30, 58, 138, 0.08);
          }
          75% { 
            box-shadow: 0 0 15px rgba(30, 58, 138, 0.4), 0 0 30px rgba(30, 58, 138, 0.2), inset 0 0 15px rgba(30, 58, 138, 0.1);
            background: rgba(30, 58, 138, 0.05);
          }
          100% { 
            box-shadow: 0 0 0px rgba(30, 58, 138, 0), 0 0 0px rgba(30, 58, 138, 0), inset 0 0 0px rgba(30, 58, 138, 0);
            background: rgba(30, 58, 138, 0);
          }
        }
        */
        
        /* Minimalistic input styling - remove number arrows */
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        
        input[type="number"] {
          -moz-appearance: textfield;
        }
        
        /* Additional browser support for removing number input arrows */
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        
        /* Ensure all number inputs in the filter modal have no arrows */
        .minimal-input[type="number"]::-webkit-outer-spin-button,
        .minimal-input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        
        .minimal-input[type="number"] {
          -moz-appearance: textfield;
        }
        
        /* Minimalistic input styling */
        .minimal-input {
          border: 1px solid transparent;
          transition: all 0.2s ease;
        }
        
        .minimal-input:focus {
          outline: none !important;
          border-color: #2A2B33 !important;
          box-shadow: none !important;
        }
        
        /* Specific targeting for filter modal number inputs */
        .filter-modal input[type="number"]::-webkit-outer-spin-button,
        .filter-modal input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        
        .filter-modal input[type="number"] {
          -moz-appearance: textfield;
        }
        
        /* Comprehensive number input arrow removal for all browsers */
        .filter-modal input[type="number"]::-webkit-outer-spin-button,
        .filter-modal input[type="number"]::-webkit-inner-spin-button,
        .filter-modal .minimal-input[type="number"]::-webkit-outer-spin-button,
        .filter-modal .minimal-input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none !important;
          margin: 0 !important;
          display: none !important;
        }
        
        .filter-modal input[type="number"],
        .filter-modal .minimal-input[type="number"] {
          -moz-appearance: textfield !important;
        }
        
        /* Remove all focus highlights and blue borders */
        .filter-modal input[type="number"]:focus,
        .filter-modal .minimal-input[type="number"]:focus {
          outline: none !important;
          box-shadow: none !important;
          border-color: #2A2B33 !important;
        }
        
        /* Ensure no browser default styling interferes */
        .filter-modal input[type="number"]::-webkit-outer-spin-button,
        .filter-modal input[type="number"]::-webkit-inner-spin-button {
          opacity: 0 !important;
          pointer-events: none !important;
          -webkit-appearance: none !important;
          margin: 0 !important;
          width: 0 !important;
          height: 0 !important;
          position: absolute !important;
          left: -9999px !important;
        }
        
        /* Additional aggressive spinner removal */
        .filter-modal input[type="number"] {
          -webkit-appearance: none !important;
          -moz-appearance: textfield !important;
        }
        
        /* Hide any remaining spinner elements */
        .filter-modal input[type="number"]::-webkit-clear-button,
        .filter-modal input[type="number"]::-webkit-search-cancel-button {
          display: none !important;
        }
        
        /* Global rules for ALL number inputs in the entire modal */
        .filter-modal * input[type="number"]::-webkit-outer-spin-button,
        .filter-modal * input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none !important;
          margin: 0 !important;
          display: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
          width: 0 !important;
          height: 0 !important;
          position: absolute !important;
          left: -9999px !important;
        }
        
        .filter-modal * input[type="number"] {
          -moz-appearance: textfield !important;
          -webkit-appearance: none !important;
        }
        
        /* Remove focus highlights for ALL number inputs */
        .filter-modal * input[type="number"]:focus {
          outline: none !important;
          box-shadow: none !important;
          border-color: #2A2B33 !important;
        }
        
        /* Additional targeting for nested elements */
        div input[type="number"]::-webkit-outer-spin-button,
        div input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none !important;
          margin: 0 !important;
          display: none !important;
        }
        
        div input[type="number"] {
          -moz-appearance: textfield !important;
        }
        
        /* Universal number input spinner removal - targets ALL number inputs */
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none !important;
          margin: 0 !important;
          display: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
          width: 0 !important;
          height: 0 !important;
          position: absolute !important;
          left: -9999px !important;
        }
        
        /* Universal focus highlight removal */
        input[type="number"]:focus {
          outline: none !important;
          box-shadow: none !important;
          border-color: #2A2B33 !important;
        }
        
        /* Ensure minimal-input class also removes spinners */
        .minimal-input[type="number"]::-webkit-outer-spin-button,
        .minimal-input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none !important;
          margin: 0 !important;
          display: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
          width: 0 !important;
          height: 0 !important;
        }
      `}</style>
    </>
  );
}


const PulseTable = React.memo(function PulseTable({
  title,
  tokens,
  isFirstOrLast,
  loading = false,
  skeletonRowCount = 10,
  showBubbleMetrics = false,
}: PulseTableProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [activeFilterTab, setActiveFilterTab] = useState('New Pairs');
  const [activeCategoryTab, setActiveCategoryTab] = useState('Audit');
  const [selectedPill, setSelectedPill] = useState('P1');
  const [thunderAmount, setThunderAmount] = useState('0.0');
  const [showPillTooltip, setShowPillTooltip] = useState<string | null>(null);
  const [showXPreview, setShowXPreview] = useState<number | null>(null);
  const [buttonPosition, setButtonPosition] = useState<{left: number, top: number} | null>(null);
  // const [waveTokens, setWaveTokens] = useState<Set<number>>(new Set()); // Added by hujoe - can use in the future
  const [filters, setFilters] = useState({
    // Protocols
    protocols: [] as string[],
    // Quote Tokens
    quoteTokens: [] as string[],
    // Keywords
    searchKeywords: '',
    excludeKeywords: '',
    // Audit
    dexPaid: false,
    caEndsInPump: false,
    minAge: '',
    maxAge: '',
    ageUnit: 'm',
    top10HoldersPercent: '',
    // New Audit Fields
    devHoldingPercentMin: '',
    devHoldingPercentMax: '',
    snipersPercentMin: '',
    snipersPercentMax: '',
    insidersPercentMin: '',
    insidersPercentMax: '',
    bundlePercentMin: '',
    bundlePercentMax: '',
    holdersMin: '',
    holdersMax: '',
    proTradersMin: '',
    proTradersMax: '',
    devMigrationsMin: '',
    devMigrationsMax: '',
    devPairsCreatedMin: '',
    devPairsCreatedMax: '',
    // Metrics
    minMarketCap: '',
    maxMarketCap: '',
    minVolume: '',
    maxVolume: '',
    minLiquidity: '',
    maxLiquidity: '',
    bCurvePercentMin: '',
    bCurvePercentMax: '',
    globalFeesPaidMin: '',
    globalFeesPaidMax: '',
    txnsMin: '',
    txnsMax: '',
    numBuysMin: '',
    numBuysMax: '',
    numSellsMin: '',
    numSellsMax: '',
    // Socials
    twitterFollowers: '',
    telegramMembers: '',
    discordMembers: '',
    twitterReusesMin: '',
    twitterReusesMax: '',
    tweetAgeMin: '',
    tweetAgeMax: '',
    tweetAgeUnit: 'm',
    hasTwitter: false,
    hasWebsite: false,
    hasTelegram: false,
    atLeastOneSocial: false,
    onlyPumpLive: false,
    // Sort
    sortBy: 'marketCap',
    sortOrder: 'desc'
  });

  // Pending filters for Apply button functionality
  const [pendingFilters, setPendingFilters] = useState(filters);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);

  // Functions to handle filter changes
  const handleApplyFilters = () => {
    setFilters(pendingFilters);
    setHasPendingChanges(false);
    setShowFilters(false);
  };

  const handleResetFilters = () => {
    const defaultFilters = {
      protocols: [] as string[],
      quoteTokens: [] as string[],
      searchKeywords: '',
      excludeKeywords: '',
      dexPaid: false,
      caEndsInPump: false,
      minAge: '',
      maxAge: '',
      ageUnit: 'm',
      top10HoldersPercent: '',
      devHoldingPercentMin: '',
      devHoldingPercentMax: '',
      snipersPercentMin: '',
      snipersPercentMax: '',
      insidersPercentMin: '',
      insidersPercentMax: '',
      bundlePercentMin: '',
      bundlePercentMax: '',
      holdersMin: '',
      holdersMax: '',
      proTradersMin: '',
      proTradersMax: '',
      devMigrationsMin: '',
      devMigrationsMax: '',
      devPairsCreatedMin: '',
      devPairsCreatedMax: '',
      minMarketCap: '',
      maxMarketCap: '',
      minVolume: '',
      maxVolume: '',
      minLiquidity: '',
      maxLiquidity: '',
      bCurvePercentMin: '',
      bCurvePercentMax: '',
      globalFeesPaidMin: '',
      globalFeesPaidMax: '',
      txnsMin: '',
      txnsMax: '',
      numBuysMin: '',
      numBuysMax: '',
      numSellsMin: '',
      numSellsMax: '',
      twitterFollowers: '',
      telegramMembers: '',
      discordMembers: '',
      twitterReusesMin: '',
      twitterReusesMax: '',
      tweetAgeMin: '',
      tweetAgeMax: '',
      tweetAgeUnit: 'm',
      hasTwitter: false,
      hasWebsite: false,
      hasTelegram: false,
      atLeastOneSocial: false,
      onlyPumpLive: false,
      sortBy: 'marketCap',
      sortOrder: 'desc'
    };
    setPendingFilters(defaultFilters);
    setFilters(defaultFilters);
    setHasPendingChanges(false);
  };

  const handlePendingFilterChange = (updater: (prev: any) => any) => {
    setPendingFilters(updater);
    setHasPendingChanges(true);
  };

  // Update pending changes when filters change
  useEffect(() => {
    setHasPendingChanges(JSON.stringify(filters) !== JSON.stringify(pendingFilters));
  }, [filters, pendingFilters]);
  const router = useRouter();

  // Protocol and quote token data with official icons from web3icons
  const protocols = [
    { name: 'Pump', icon: <Image src="/pump.svg" alt="Pump" width={16} height={16} className="rounded-full" />, color: '#00ff88' },
    { name: 'Bonk', icon: <TokenDOBO variant="branded" size={16} className="rounded-full" />, color: '#ff6b35' },
    { name: 'Bags', icon: <Image src="https://bags.fm/assets/images/bags-icon.png" alt="Bags" width={16} height={16} className="rounded-full" />, color: '#00d4aa' },
    { name: 'Moonshot', icon: <Image src="https://play-lh.googleusercontent.com/bmv_OqsfmlR2Tfd7-4I2HS1twZdiJmmyX0warik6UxhUdSfegPMegeIRxxj9LGUBAQM" alt="Moonshot" width={16} height={16} className="rounded-full" />, color: '#a855f7' },
    { name: 'Heaven', icon: <Image src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAOEAAADhCAMAAAAJbSJIAAAAclBMVEX///8AAAD09PShoaGrq6v4+Pjw8PBhYWHt7e3g4OD6+vpISEhERETR0dFbW1svLy9ubm7n5+cbGxt5eXkoKCjIyMiDg4OQkJBnZ2cICAg1NTXAwMC0tLQ9PT3Y2NiLi4ubm5tTU1MgICC5ubl+fn4TExO3R7UzAAAF+ElEQVR4nO2di5qqIBCA6eJul1Nm96wtq+39X/Gk2WaGAgIOMx//C8T/GbdhGFiHOgy6Adbxhvjxhvjxhvjxhvjxhvjxhvjxhvjxhvjxhvjxhvjxhvjxhvjxhvjxhua5xdPNdXX8Yi+6x9V1Mw13Vn6vXcOfWX9SVHtncOxtY+O/2aLh7BCNKu2ejKLet9mfbcvwdyWUe1nuTUq2Yjjdy+s96B7+mfpx+4bzTaTql3Gcmfl924bhIWjkl/K1NtECu4bLa2O9jGCj3wabhuFBzy9lsNBthUXDRDw3yDCc6jXDmuH3wIhfylWrIZYMbwrTn5hgq9EUO4aL5gMoH43PaMVQeYIXE42bNsaC4Y+5Hljk1LA55g3XVvzuHJq1x7hh35bgfR03d8FwYk/wPv2H4IbLoU3B+77qB9gwtjPGFFFf4Jg0DE3PghxGyooGDcOufcE7ZzDDuIUvmKLaF40ZXuz3wZyvJYyh5VG0yBDE0OheQsQKwNDiSoZHr3XDRbuCjClsGI0Yhm0LsuDSrmGzgKgWk1YNDYTU1JGOMxow/IYQZEx2VjRg2NpU/86xNUOQ/2iKZMxf2/AflCDrym35tQ2PYIas34ph63N9Eamghq4h0DDzQGp9qml4ghRkTOagWNOwnW19JXvrhhtYQamPqGcI2gtTJOLgWoagA2lGIJ4TtQwB58In4vMaHcMxtB6TidnoGLYcuuAjHGt0DMHHmRTh0k3DEGhfWCKwaGjhLLsJoqCUhqGZdBltRH/T5oZnaLWcyJqhEyNpiiBLo7lhiwcV9QiiGY0N5450Q+EusbHhFlrsD8GyppHhLQwvPWixF/WRUzXD+XTdnwyjQRC0dOArRX3eu4LhQuY2AQT1Z22ShnHizND5SX0sQ8ZweXJYj4mGGrHh+OpSn+OiZTi2mqhmCA1DFH6M1WbY1BlewI6VFKmdLmoM1873vye14ahKw7kDgTRZkiaGCzcndz61U36FIZYe+EDd8IboH5qibPgP+ERJGVXDKXSDlVE0nEG3Vx01Q4SCaobuBCcUUDF0JQiqhoLhEtM8/0LB0InTJHXkDVtN1jaItGEC3dKmyBrC5eDpImuItBMyaUNnzpLUkTPEORM+kDN0OyRaj5ThL3QrtZjUVHp5GqKJOlUQ/QoMwZMM9RlUfMfcENuunsuEmxXNqHzCDN6R/sMQ4OKSHTgHbZkhym0vn+HHpbbMEMf5ixxBOb0mNZxDt8os50/DBLpNhhl/GJIZZ56MS4YxdIOME8TvhsD3XmwQvRtSGkmfrIqGu+qSqYjZFAzxHcRIMX4ZWqtcBcvwZehIQrpxNn+GyM575cmvRDGaA01Kvs9gS+iG2ONxYYjhjXQLeUyKjNDe8IPsIzKik0VGVhOUOZSRbp7MEPFxhZgNecOIvGE61hA3TMgbDskbjuIOS6AbYZcZ7RmfpWUlmBs3sq1xJL3yTvnaUd49ZYRshzeNRoox4SjGgxndSFTOiSHPMxHSZ6iToSS4G3bIBtsyUkOsebNypIa0122pIe05PzVEnZYo5JQaUsmI4jJ7BNwIM84MKY+mS2pZX2UGeeYe3bFmkhvSnRJ7zwxaspvE7dOQYNZQRvfyl8lOdPk9eeXqY7wcK8G6cKOEZjBjVzAkGVXcd4o3uygeBp/fDAlO+8POuyG9TNpFyZDcymbYKRt2NN+Ydo3tpyGtrpg/J/RuOCdxwytnyTPs/OAsqsDjWR6rXPmDTAT878mrj+otRM6Eg2WlIZGveO5UG+IrE8WhcCuYVwkrRn8Rqliijl+vDfk1mrcy7RUV6VBvNN4LEFRVFfzGG5sqvRtYWRlyh/V8v3wtv6a65xZjdCqKyxq1NWjx9UbO60j1VXZDXPupiFeMVlQpOUbkyH+aVFztet7HUfekv+O3X6om+2Li+qZqkFT4SVedD39X7n7J0b6mAI/CywG3c8/FxVx02Na/vab4vsVtlvRXUdcJviaHpP7hhyaGCPGG+PGG+PGG+PGG+PGG+PGG+PGG+PGG+PGG+PGG+PGG+PGG+PGG+KFv+B+FpHgcqQsIhwAAAABJRU5ErkJggg==" alt="Heaven" width={16} height={16} className="rounded-full" />, color: '#8b5cf6' },
    { name: 'Daos.fun', icon: <TokenDAO variant="branded" size={16} className="rounded-full" />, color: '#06b6d4' },
    { name: 'Candle', icon: <Image src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAOEAAADgCAMAAADCMfHtAAAAmVBMVEUALqz///8AAKUAGKgABqb29/u9wuIAK6sAI6oAIKkAKasALKwAJqoAGagAG6gAFacAEKfDx+TZ3O709fp9iMnm6PSFj8xzf8akq9ji5PLP0unv8PiIks2YoNOOl89ZaL1GWbi1u9+qsdoySbNfbr9qd8NSY7vIzOd1gcZVZbwtRbJjccAVNq6VntJAVLcgPbAmQLAbOa45T7XL9ma0AAAMW0lEQVR4nO2dZ3fquBaGLdmA5SpMh0AoKSSH5Nzk//+464Ytd4P3Rp575/02a86K/CBpNzWF/K9Lkf0B6PqXEEyTmbd+HwYav7+vvdXmUQ2jE67Gy/nLL6Ma566rBnJ9ca5R9fN5uh16A+QPQCTcjL/+XChXHd0yTKUo07B0pnKqfzwdVnifgUToLf/omsusUQlZgdRiNudvX2ucT0EgnB1fOHessm6rxXTpfuvBfw40obf70W6lS2Qwzs5j4C8CJfTmOmdtBmZNX+ouX7xDfhQc4ebrwtmdnZeHdOZwwxWKcPxGO/ZeBpJpn0egLwMhHGwN1wLDi2TYfD6D+DgAws2UOhCjMy+T0ReAwdqZcPZKdQy+UBbdd/aSHQkDPiy8UIb23ZGxE+HkjMwXMe47xXRdCHcP4Atk0deJDMKDjmJfSqXTr4cTzr75w/h8mY5yb6BzJ+GOGg/kCzTSXu7LJO8i9C7Og/kC6fzwKML5wzswksnf7ujG2wlXf2V0YCTLvT23uplwKakDI5n0jE34zCXyBWJ/b4zHbyNcKY/x8XUy6BCP8CB1hF5l0jkW4Zw+0snXSH3DIfxwZZMl0i/tS+atCQefTDaXIENtnRu3JdyY0GWKbjJp2zi1JeHK7oONEWXSAyShx+HqaGCiSzhCry9GNCu6hSJc9xOwJWILwp72YKA2A7WZ0NN6C+gjNlfGGwlnD61W3KzmILWJcKL3zU3kRJvKqU2EPz0H9P1iQzW1gfBbfrbUpBGrL6bWEy7kFSzay/rP/YRL2Ql9O7HnewnXVPa3t5RbVxGvIdy4vfYTouoSjRrCU7/ypTqZvDojriac4loZ2HzTOt1OOMadhEz5A4poV1anqggHqJNwRKfkCDtGKmObKsI95iR0Lh4hc9i6j6nfRnhE9ISm34G+XoHDJf31FsINYsaks2g8vUCPEq181aacEHGMutcVMnBCk7UnPKCNUTNdkAcnVFjpulQpIdoWBIOnwccr/DihZWXiMsIzVnU7U4yfwidmRlmWUUK4wvL17FtsZofwO7olZZsSwm+ktF59yTSzRIgKTbUN4RjJzLiLXDsqQiOsGLwVCS84BXw+zbWzQvklaSHJKBAecVYJ3TwgISjTvRjZFAjv3WdfL3uRb4eQT5T5TvMbGfKESxujWfZRBCRnlDqe9aeBEGW/r/VZAkgOKD9moRNzhEcMA2c6YkUz8RkzDaGt4kzMESoYhlRMTjdmOopKz3sBNJc1p1nCIYYhtXdpAyvHfkr+A2ci5n1ilvCEYN4MYRJ62oilvGMcx2TyakIPY2YIKyfBYjJL+xDHIyqKk1k3zRBCFxYCsdTVh4vJuuAZYcttiUaXKsIBwm9qusmfX4WlEUNIMJCGqcLFErhIiBHts2QzwUSP7LQmtIhUssx4fZEQYTVUmPXXRQIuJOIIWXAoOiglxLAzejILk6VIJiwUYSXboq0RCDF+0KTDhglLxg4gZdvGqZQQof6U0AzU9I9zIcTBSreF4DQlfEdoLHF+oh+yxP2vSPl2auAEQoxBej084GXmm1j0Qwn1M1W3lBDklHJOWhwEZ2voxq/QiVjh96xAuEYYpFd37+VMpiuYOqSqSWpNE0KM8uXVpC1yE8AUExyUhE0x9gXC/2CkFbFNKaxkicXpA04nJk7/SrjB8L1WlM+XhJ9MqA7jbCxThzlClKJJ3Idlq71CdfGAYk6TaOpKiJJvx/NwX9ZJPM0TMax4GmxcCRWUOwOiuLs8WNKS+BRhnU1JyzUK4jS8+sOKv51sYcYw4+lEjAmHOKGFOq4hTGpwWxTCa0EqJnzCWRSNpnsV4Shu/Aul8WsxIW6k1Bh0V7R5oDIwi7MMpHINzRBibVcPQ+/nKgL7iNl4nJtGhDOszRfhUKmcZ1HwCLz9K5F9EAhR1mNDBWUvoVZhMtH5qQc0d6gkyamCaM0ChdYkKaWbzm4neMfQZT1jbZa3PgTCfPAPKPbq+6LrJAi8xzqJUsNkf452MtU0BMJfxFMVfJtmwNqEkEFS0gvq/VPELYJUIEQ9+UO3ZODE1eCB4B599MEeZ5U0bmCVEE5w1iqTlha+sQ5HiUjonv38HnUreVQlCgk95HMV7LLeKAGiQKg/rf8iHwZwjgkh1gpJohHfvwfFX7EPDRX7SFW0VKlg+lxBhp3rwwcoWshT8EJfH0vPne0rITSt/D8CU+QQQ0KkJSD2PV+cqCvcp5gjNJhKlZfp9IQzhqISQ0iIk2RHdajBeP5Dbb3gLQzm0tN8uEFM3kwzIfxAIUyLspvD+Ye6jm6FJT6qOyr36cbpIh+SMecJIU52GMf2sQbr4/TlO4B6my/HuXOfOPsUo6AmJMTYZJInrBVS9hZOipDwL0phXW1/F9AGJ6gKwuCIEGcRrweEm4QQJXqST8hnV0JTNiFS6P//RIhS0r+FcIBNKN3SYBEmlka6t0AiTG0pzq75HhAmHh9nZ5J8wjRqe0OJvPtEiLM0Ip0wWhcKCXG2lEsnjHZ8hIS4i7DyCPcJIcbm4B4QWq8JIc4at3TCaPEpJMTY09YDwqiMEhLiJC/SCaMPiFZmUIq00gmjZe6IECUwlU4YFjFiQvj7DRT5hPHu1ogQpSIrmzDeYhoRouxMlE0Y706MCFFqzrIJo+XD644hDGMqm9Bdi4QYe6BlE8b7oGNCjOxCMuHoh4iEGKvAkgmvRzljQozFH8mEsaFJdkEjbIuQTMhXWcLKHZL3Sy6haZMsIUISLJcwOSl7JUSYiHIJr9MwPRUEf+WHXELtengtIYT3iFIJr95QIIS/EuOGt5ngCdOrG9ITluChqVTC9LBxSgjuL2QSmk7yt1NC8BzRbf+eHzhheg+AeFodepi67R8QBScUTsQLhNDrMxL7ULyQViCE3kcrcR6Kl+CIN3/YsE5fIqEm7JsTCYHvLpZHKF6LkSEEvmlElUZoi5d8Zm5Rgl3Plxa1Za/CyhDCRm7SCPXMLZTZ28xAr4WURpi9VzBLuIXMg2URWtlrKHO3CkIegJJFqGVjqRwh5BKNJMLM3TBFwgmgw5BEyHPBYv7+UkCvL4fQyN+VmicE7EQ5hDwfZxTuEYbrRCmE+VlYQjgAM6dSCLVCUlq8z3sLlevL2OeduSmtipAYQBszZBAW7rouJRwClb8lnLdgxXvRS19/AEoxHk+YrMY0Ec5gPMYNJ7uACHlZi6VvlDyBBOAPJzS+y/52+Us6JoSxcZpfQb0K5nReiZmpJAR5F5C1epA4FMh+Hrv8jcCKF60WAJFNMbyoFMRh8kJAWk8IMk5LJ36ZNhBxVPkYrSbMX1d5l7R2b4N7JoB7cqvmRBUheYII3mxjPvQ2k4rHXgeTyWY13v5qAOPF2pe3UUNIfiGWMUxd5VzTaKk0X9xlEPGFqQ6qOKoJJ/1+rjqrmpedqwnJ+z/lKVl/Eu6qMWoIyQ77Uhco6cWcqR0h+UC7AgxURi1E7f8kf/v+7nggU6vwhG0IN8BLiihqeD++njB6dKPfog0BfgMh9rPA3cVrzGgrQnLsN6Ja8tzZjYRki3uZWzc5L43f30xIdsi3uXVQ6XtutxP2F5HVefpbCMmunwPVaQPYjpDs+mhu7OdW396OkCz7h+hWvMN9JyE59M31ayXl7U6EZA2RiYPJpK0Lea0JycpCvWz0Jo1o+xWD9oRkcOpLMmU5ZQ9wdyck5LUfjtH5rChtdSf0TWoPJqPW0ojeRUg8He9e7HYymrKljoSEvMkdqeyyav7GboT+SJVX2jBpY7IEQEhmn5iXcNdJt9tvyu1CSMiXlG40tZfKwjY0IVmdkK/iLhFjd3Tg3YT+bOSPNaoGbRuHQhGSyZ8HDlWT/94QxQAR+r7xxB/j/03HOtz/mR0I/ZRKUfGno8l4+w0B0ISEHBlyVdxk9OkeCwpG6JscXcUbqz7f/JYoG4XQ70fFxbE5I9vddes/IEJChr8a/FFwi19ujLHLBULo29WzZkN25IjR5/bHF2sFROjreKIMZkaaOle2m+YW2wmO0I/ldgrvDOnjOdP252ubBUnoy9tdNOf+ipXBuA6KR8AJfc2Wb/SeTTLBgxffX3cHZ5WCJwy0/tpT7rR+XWWkOy79fRp3dw0lwiEM5B3Pn5SrTK95l9o0dKZy+vO6BB6agvAIQ62G2/PeoBp3bYcxpsdizLFdzin7Xnwd4AdmRsiEsTbe++G43c2n5/PrYjGd77bLw7tXu0kETI8hlKl/Cf/5+i9HpcHNRMx9XgAAAABJRU5ErkJggg==" alt="Candle" width={16} height={16} className="rounded-full" />, color: '#f59e0b' },
    { name: 'Sugar', icon: <Image src="https://cdn.vectorstock.com/i/1000v/28/93/sugar-donut-icon-vector-9992893.jpg" alt="Sugar" width={16} height={16} className="rounded-full" />, color: '#ec4899' },
    { name: 'Believe', icon: <Image src="https://cryptoast.fr/wp-content/uploads/2025/05/believe-launchcoin-logo.png" alt="Believe" width={16} height={16} className="rounded-full" />, color: '#10b981' },
    { name: 'Jupiter Studio', icon: <TokenJUP variant="branded" size={16} className="rounded-full" />, color: '#8b5cf6' },
    { name: 'Moonit', icon: <Image src="/moonit.svg" alt="Moonit" width={16} height={16} className="rounded-full" />, color: '#fbbf24' },
    { name: 'Boop', icon: <Image src="https://s2.coinmarketcap.com/static/img/coins/64x64/36393.png" alt="Boop" width={16} height={16} className="rounded-full" />, color: '#3b82f6' },
    { name: 'LaunchLab', icon: <TokenLAUNCH variant="branded" size={16} className="rounded-full" />, color: '#ef4444' },
    { name: 'Dynamic BC', icon: <Image src="https://cdn.prod.website-files.com/626692727bba3f384e008e8a/67a5dca8b3ee5d0703f70040_icon-primary.webp" alt="Dynamic BC" width={16} height={16} className="rounded-full" />, color: '#f97316' },
    { name: 'Raydium', icon: <TokenRAY variant="branded" size={16} className="rounded-full" />, color: '#6b7280' },
    { name: 'Meteora AMM', icon: <Image src="/meteora.svg" alt="Meteora" width={16} height={16} className="rounded-full" />, color: '#92400e' },
    { name: 'Meteora AMM V2', icon: <Image src="/meteora.svg" alt="Meteora V2" width={16} height={16} className="rounded-full" />, color: '#a16207' },
    { name: 'Pump AMM', icon: <Image src="/pump.svg" alt="Pump AMM" width={16} height={16} className="rounded-full" />, color: '#64748b' },
    { name: 'Orca', icon: <Image src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT9zFRQAbDsrkXwAJkZYVE-AIO3OyfVxYYm9w&s" alt="Orca" width={16} height={16} className="rounded-full" />, color: '#0ea5e9' }
  ];

  const quoteTokens = [
    { name: 'SOL', icon: <TokenSOL variant="branded" size={16} className="rounded-full" />, color: '#00ff88' },
    { name: 'USDC', icon: <TokenUSDC variant="branded" size={16} className="rounded-full" />, color: '#06b6d4' },
    { name: 'USD1', icon: <span className="w-4 h-4 bg-yellow-500 rounded-full flex items-center justify-center text-xs font-bold text-black">1</span>, color: '#fbbf24' }
  ];

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.filter-dropdown')) {
        setShowFilters(false);
      }
    };

    if (showFilters) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showFilters]);

  // Wave effect for real-time data updates - trigger on actual data changes
  // Added by hujoe - can use in the future
  /*
  useEffect(() => {
    if (tokens.length === 0) return;
    
    // Trigger wave on tokens data change (real updates)
    const newWaveTokens = new Set<number>();
    
    // Select 1-2 random tokens to show wave effect when data updates
    const waveCount = Math.floor(Math.random() * 2) + 1; // 1-2 tokens
    for (let i = 0; i < waveCount; i++) {
      const randomIdx = Math.floor(Math.random() * tokens.length);
      newWaveTokens.add(randomIdx);
    }
    
    setWaveTokens(newWaveTokens);
    
    // Clear wave after animation duration
    setTimeout(() => {
      setWaveTokens(new Set());
    }, 2000);
  }, [tokens]); // Trigger on actual token data changes
  */

  // Function to show copy toast
  const showCopyToast = () => {
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 2000);
  };

  // Helper function to map protocol names to backend protocol values
  const mapProtocolToBackend = (protocolName: string): string[] => {
    switch (protocolName) {
      case 'Pump':
        return ['pump.fun'];
      case 'Raydium':
        return ['raydium'];
      case 'Meteora AMM':
      case 'Meteora AMM V2':
        return ['meteora'];
      case 'Bonk':
        return ['bonk'];
      case 'Bags':
        return ['bags'];
      case 'Moonshot':
        return ['moonshot'];
      case 'Heaven':
        return ['heaven'];
      case 'Daos.fun':
        return ['daos.fun'];
      case 'Candle':
        return ['candle'];
      case 'Sugar':
        return ['sugar'];
      case 'Believe':
        return ['believe'];
      case 'Jupiter Studio':
        return ['jupiter'];
      case 'Moonit':
        return ['moonit'];
      case 'Boop':
        return ['boop'];
      case 'LaunchLab':
        return ['launchlab'];
      case 'Dynamic BC':
        return ['dynamic'];
      case 'Pump AMM':
        return ['pump.fun'];
      case 'Orca':
        return ['orca'];
      default:
        return [];
    }
  };

  // Helper function to get token protocol from various fields
  const getTokenProtocol = (token: any): string | null => {
    // Check multiple possible fields for protocol information
    return token.launchpad_protocol || 
           token.protocol || 
           token.amm_id || 
           token.launchpadProtocol ||
           null;
  };

  // Filter and sort tokens
  const filteredAndSortedTokens = useMemo(() => {
    let filtered = [...tokens];

    // Apply protocol filters
    if (filters.protocols.length > 0) {
      const beforeCount = filtered.length;
      filtered = filtered.filter(token => {
        const tokenProtocol = getTokenProtocol(token);
        if (!tokenProtocol) return false;
        
        // Check if token's protocol matches any of the selected protocols
        const matches = filters.protocols.some(selectedProtocol => {
          const backendProtocols = mapProtocolToBackend(selectedProtocol);
          return backendProtocols.some(backendProtocol => 
            tokenProtocol.toLowerCase().includes(backendProtocol.toLowerCase()) ||
            backendProtocol.toLowerCase().includes(tokenProtocol.toLowerCase())
          );
        });
        
        // Debug logging
        if (typeof window !== 'undefined' && (window as any).__DEBUG_PROTOCOL_FILTER__) {
          console.log(`[Protocol Filter] Token ${token.symbol} (${tokenProtocol}) matches ${filters.protocols}:`, matches);
        }
        
        return matches;
      });
      
      // Debug logging
      if (typeof window !== 'undefined' && (window as any).__DEBUG_PROTOCOL_FILTER__) {
        console.log(`[Protocol Filter] Filtered ${beforeCount} tokens to ${filtered.length} tokens for protocols:`, filters.protocols);
      }
    }

    // Apply keyword filters
    if (filters.searchKeywords.trim()) {
      const searchTerms = filters.searchKeywords.toLowerCase().split(',').map(term => term.trim()).filter(term => term);
      if (searchTerms.length > 0) {
        const beforeCount = filtered.length;
        filtered = filtered.filter(token => {
          const tokenText = `${token.name || ''} ${token.symbol || ''}`.toLowerCase();
          return searchTerms.some(term => tokenText.includes(term));
        });
        console.log(`[Keyword Filter] Filtered ${beforeCount} tokens to ${filtered.length} tokens for search keywords:`, searchTerms);
      }
    }

    if (filters.excludeKeywords.trim()) {
      const excludeTerms = filters.excludeKeywords.toLowerCase().split(',').map(term => term.trim()).filter(term => term);
      if (excludeTerms.length > 0) {
        const beforeCount = filtered.length;
        filtered = filtered.filter(token => {
          const tokenText = `${token.name || ''} ${token.symbol || ''}`.toLowerCase();
          return !excludeTerms.some(term => tokenText.includes(term));
        });
        console.log(`[Exclude Filter] Filtered ${beforeCount} tokens to ${filtered.length} tokens for exclude keywords:`, excludeTerms);
      }
    }

    // Apply quote token filters
    if (filters.quoteTokens.length > 0) {
      const beforeCount = filtered.length;
      filtered = filtered.filter(token => {
        // For now, we'll filter based on pair address patterns or other heuristics
        // Since we don't have explicit quote token data, we'll use pair address patterns
        const pairAddress = token.pair_address;
        if (!pairAddress) return false;
        
        return filters.quoteTokens.some(quoteToken => {
          // This is a simplified approach - in reality you'd need to check the actual pair
          // For now, we'll just return true if any quote token is selected
          // You might want to implement more sophisticated logic based on your data
          return true;
        });
      });
      console.log(`[Quote Token Filter] Filtered ${beforeCount} tokens to ${filtered.length} tokens for quote tokens:`, filters.quoteTokens);
    }

    // Apply dexPaid filter
    if (filters.dexPaid) {
      const beforeCount = filtered.length;
      filtered = filtered.filter(token => {
        // Check if token has paid dex fees (this would need to be implemented based on your data structure)
        // For now, we'll assume all tokens have paid if this filter is enabled
        return true; // Placeholder - implement based on actual dexPaid field
      });
      console.log(`[DexPaid Filter] Filtered ${beforeCount} tokens to ${filtered.length} tokens for dexPaid:`, filters.dexPaid);
    }

    // Apply caEndsInPump filter
    if (filters.caEndsInPump) {
      const beforeCount = filtered.length;
      filtered = filtered.filter(token => {
        // Check if contract address ends in "pump"
        return token.mint && token.mint.toLowerCase().endsWith('pump');
      });
      console.log(`[CA Ends in Pump Filter] Filtered ${beforeCount} tokens to ${filtered.length} tokens for caEndsInPump:`, filters.caEndsInPump);
    }

    // Apply age filters
    if (filters.minAge || filters.maxAge) {
      const beforeCount = filtered.length;
      filtered = filtered.filter(token => {
        const launchTime = (token as any).launch_time || (token as any).created_at;
        if (!launchTime) return false;
        
        const launchDate = new Date(launchTime);
        const now = new Date();
        const ageInMinutes = (now.getTime() - launchDate.getTime()) / (1000 * 60);
        
        let ageInTargetUnit = ageInMinutes;
        if (filters.ageUnit === 'h') {
          ageInTargetUnit = ageInMinutes / 60;
        } else if (filters.ageUnit === 'd') {
          ageInTargetUnit = ageInMinutes / (60 * 24);
        }
        
        const minAge = filters.minAge ? parseFloat(filters.minAge) : 0;
        const maxAge = filters.maxAge ? parseFloat(filters.maxAge) : Infinity;
        
        return ageInTargetUnit >= minAge && ageInTargetUnit <= maxAge;
      });
      console.log(`[Age Filter] Filtered ${beforeCount} tokens to ${filtered.length} tokens for age range:`, filters.minAge, '-', filters.maxAge, filters.ageUnit);
    }

    // Apply top 10 holders percent filter
    if (filters.top10HoldersPercent) {
      const beforeCount = filtered.length;
      const threshold = parseFloat(filters.top10HoldersPercent);
      filtered = filtered.filter(token => {
        // This would need to be implemented based on actual holder data
        // For now, we'll skip this filter as we don't have holder data
        return true;
      });
      console.log(`[Top 10 Holders Filter] Filtered ${beforeCount} tokens to ${filtered.length} tokens for top10HoldersPercent:`, threshold);
    }

    // Apply filters
    if (filters.minMarketCap) {
      const minMC = parseFloat(filters.minMarketCap);
      filtered = filtered.filter(token => {
        const marketCap = (token as any).fully_diluted_value ?? (token as any).market_cap_usd ?? 0;
        return marketCap >= minMC;
      });
    }

    if (filters.maxMarketCap) {
      const maxMC = parseFloat(filters.maxMarketCap);
      filtered = filtered.filter(token => {
        const marketCap = (token as any).fully_diluted_value ?? (token as any).market_cap_usd ?? 0;
        return marketCap <= maxMC;
      });
    }

    if (filters.minVolume) {
      const minVol = parseFloat(filters.minVolume);
      filtered = filtered.filter(token => {
        const volume = (token as any).volume_24h ?? 0;
        return volume >= minVol;
      });
    }

    if (filters.maxVolume) {
      const maxVol = parseFloat(filters.maxVolume);
      filtered = filtered.filter(token => {
        const volume = (token as any).volume_24h ?? 0;
        return volume <= maxVol;
      });
    }

    // Apply liquidity filters
    if (filters.minLiquidity) {
      const minLiq = parseFloat(filters.minLiquidity);
      filtered = filtered.filter(token => {
        const liquidity = (token as any).total_liquidity_usd ?? 0;
        return liquidity >= minLiq;
      });
    }

    if (filters.maxLiquidity) {
      const maxLiq = parseFloat(filters.maxLiquidity);
      filtered = filtered.filter(token => {
        const liquidity = (token as any).total_liquidity_usd ?? 0;
        return liquidity <= maxLiq;
      });
    }

    // Apply bonding curve percent filters
    if (filters.bCurvePercentMin) {
      const minBC = parseFloat(filters.bCurvePercentMin);
      filtered = filtered.filter(token => {
        const bondingCurve = (token as any).bonding_pct ?? 0;
        return bondingCurve >= minBC;
      });
    }

    if (filters.bCurvePercentMax) {
      const maxBC = parseFloat(filters.bCurvePercentMax);
      filtered = filtered.filter(token => {
        const bondingCurve = (token as any).bonding_pct ?? 0;
        return bondingCurve <= maxBC;
      });
    }

    // Apply transaction count filters
    if (filters.txnsMin) {
      const minTxns = parseFloat(filters.txnsMin);
      filtered = filtered.filter(token => {
        const txns = (token as any).total_buys_24h + (token as any).total_sells_24h ?? 0;
        return txns >= minTxns;
      });
    }

    if (filters.txnsMax) {
      const maxTxns = parseFloat(filters.txnsMax);
      filtered = filtered.filter(token => {
        const txns = (token as any).total_buys_24h + (token as any).total_sells_24h ?? 0;
        return txns <= maxTxns;
      });
    }

    // Apply buy count filters
    if (filters.numBuysMin) {
      const minBuys = parseFloat(filters.numBuysMin);
      filtered = filtered.filter(token => {
        const buys = (token as any).total_buys_24h ?? 0;
        return buys >= minBuys;
      });
    }

    if (filters.numBuysMax) {
      const maxBuys = parseFloat(filters.numBuysMax);
      filtered = filtered.filter(token => {
        const buys = (token as any).total_buys_24h ?? 0;
        return buys <= maxBuys;
      });
    }

    // Apply sell count filters
    if (filters.numSellsMin) {
      const minSells = parseFloat(filters.numSellsMin);
      filtered = filtered.filter(token => {
        const sells = (token as any).total_sells_24h ?? 0;
        return sells >= minSells;
      });
    }

    if (filters.numSellsMax) {
      const maxSells = parseFloat(filters.numSellsMax);
      filtered = filtered.filter(token => {
        const sells = (token as any).total_sells_24h ?? 0;
        return sells <= maxSells;
      });
    }

    // Apply unique wallets filters
    if (filters.holdersMin) {
      const minHolders = parseFloat(filters.holdersMin);
      filtered = filtered.filter(token => {
        const holders = (token as any).unique_wallets_24h ?? 0;
        return holders >= minHolders;
      });
    }

    if (filters.holdersMax) {
      const maxHolders = parseFloat(filters.holdersMax);
      filtered = filtered.filter(token => {
        const holders = (token as any).unique_wallets_24h ?? 0;
        return holders <= maxHolders;
      });
    }

    // Sort tokens
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (filters.sortBy) {
        case 'marketCap':
          aValue = (a as any).fully_diluted_value ?? (a as any).market_cap_usd ?? 0;
          bValue = (b as any).fully_diluted_value ?? (b as any).market_cap_usd ?? 0;
          break;
        case 'volume':
          aValue = (a as any).volume_24h ?? 0;
          bValue = (b as any).volume_24h ?? 0;
          break;
        case 'symbol':
          aValue = a.symbol?.toLowerCase() ?? '';
          bValue = b.symbol?.toLowerCase() ?? '';
          break;
        default:
          aValue = (a as any).fully_diluted_value ?? (a as any).market_cap_usd ?? 0;
          bValue = (b as any).fully_diluted_value ?? (b as any).market_cap_usd ?? 0;
      }

      if (filters.sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  }, [tokens, filters.protocols, filters.quoteTokens, filters.searchKeywords, filters.excludeKeywords, filters.dexPaid, filters.caEndsInPump, filters.minAge, filters.maxAge, filters.ageUnit, filters.top10HoldersPercent, filters.minMarketCap, filters.maxMarketCap, filters.minVolume, filters.maxVolume, filters.minLiquidity, filters.maxLiquidity, filters.bCurvePercentMin, filters.bCurvePercentMax, filters.txnsMin, filters.txnsMax, filters.numBuysMin, filters.numBuysMax, filters.numSellsMin, filters.numSellsMax, filters.holdersMin, filters.holdersMax, filters.sortBy, filters.sortOrder]);

  // Memoize token rendering to prevent unnecessary re-renders
  const memoizedTokens = useMemo(() => filteredAndSortedTokens, [filteredAndSortedTokens]);

  const shortAddr = (token: any): string => {
    try {
      const a = token?.pair_address || token?.mint || token?.address || "";
      if (typeof a !== "string" || a.length < 8) return a || "-";
      
      // Check if address ends with "pump" and show it
      if (a.toLowerCase().endsWith("pump")) {
        return `${a.slice(0, 4)}...pump`;
      }
      
      return `${a.slice(0, 4)}...${a.slice(-4)}`;
    } catch {
      return "-";
    }
  };

  const getAgeLabel = (token: any): string => {
    try {
      // Accept multiple possible fields and formats
      let v: any =
        token?.created_at ??
        token?.createdAt ??
        token?.listedAt ??
        token?.mintedAt ??
        token?.pair_created_at ??
        token?.pairCreatedAt ??
        token?.pool_created_at ??
        token?.poolCreatedAt ??
        token?.exchange_created_at ??
        token?.exchangeCreatedAt ??
        token?.firstSeen ??
        token?.first_seen ??
        token?.launch_time ??
        token?.launchTime ??
        token?.timestamp ??
        token?.ts ??
        token?.block_time ??
        token?.blockTime ??
        null;
      if (v === null || v === undefined) return "-";
      if (typeof v === "object") {
        if ("Time" in v && typeof (v as any).Time === "string")
          v = (v as any).Time;
        else if ("time" in v && typeof (v as any).time === "string")
          v = (v as any).time;
        else if ("seconds" in v && typeof (v as any).seconds === "number")
          v = Number((v as any).seconds) * 1000;
        else if ("millis" in v && typeof (v as any).millis === "number")
          v = Number((v as any).millis);
      }
      let ts: number | null = null;
      if (typeof v === "number") {
        // Heuristic: treat 13-digit as ms, 10-digit as seconds
        if (v > 1e12) ts = v;
        else if (v > 1e9) ts = v * 1000;
        else ts = null;
      } else if (typeof v === "string") {
        const num = Number(v);
        if (!Number.isNaN(num) && num > 0) {
          if (num > 1e12) ts = num;
          else if (num > 1e9) ts = num * 1000;
        }
        if (ts === null) {
          const d = Date.parse(v);
          if (!Number.isNaN(d)) ts = d;
        }
      } else if (v instanceof Date) {
        ts = v.getTime();
      }
      if (ts === null) return "-";
      const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
      if (diffSec < 60) return `${diffSec}s`;
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
      return `${Math.floor(diffSec / 86400)}d`;
    } catch {
      return "-";
    }
  };

  return (
    <div
      className={`flex w-full min-w-[340px] flex-1 flex-col shadow-lg ${isFirstOrLast === "first" ? "border-r border-l border-t rounded-tl-lg" : isFirstOrLast === "last" ? "border-r border-t rounded-tr-lg" : "border-r border-t"}`}
      style={{ 
        backgroundColor: 'rgba(30, 31, 38, 0.3)',
        borderColor: AX.border 
      }}
    >
      <div 
        className="mb-2 flex items-center justify-between border-b p-2 text-lg font-bold"
        style={{ 
          backgroundColor: 'transparent', 
          borderColor: AX.border, 
          color: AX.text 
        }}
      >
        <span style={{ 
          fontWeight: '300',
          letterSpacing: '0.5px',
          fontSize: '16px'
        }}>{title}</span>
        
        {/* Right side container for pill and filter */}
        <div className="flex items-center gap-2">
          {/* P1 P2 P3 Pill with Thunder and Solana - Slick Border Only */}
          <div className="flex items-center justify-center rounded-full px-3 py-1.5 gap-2 border"
               style={{ borderColor: AX.border }}>
          {/* Amount - Editable */}
          <div className="flex items-center justify-center gap-1">
            <HiLightningBolt size={12} style={{ color: AX.aiGreen }} />
            <input
              type="text"
              value={thunderAmount}
              onChange={(e) => setThunderAmount(e.target.value)}
              className="bg-transparent border-none outline-none text-xs font-medium w-6 text-center"
              style={{ color: AX.text }}
            />
          </div>
          
          {/* Solana Symbol */}
          <div className="flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 397.7 311.7" fill="none">
              <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 237.9z" fill="url(#paint0_linear_solana)"/>
              <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1L333.1 73.8c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="url(#paint1_linear_solana)"/>
              <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" fill="url(#paint2_linear_solana)"/>
              <defs>
                <linearGradient id="paint0_linear_solana" x1="360.8" y1="351.5" x2="141.44" y2="132.14" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#00FFA3"/>
                  <stop offset="1" stopColor="#DC1FFF"/>
                </linearGradient>
                <linearGradient id="paint1_linear_solana" x1="264.8" y1="116.2" x2="45.44" y2="-103.16" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#00FFA3"/>
                  <stop offset="1" stopColor="#DC1FFF"/>
                </linearGradient>
                <linearGradient id="paint2_linear_solana" x1="312.5" y1="233.9" x2="93.14" y2="14.54" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#00FFA3"/>
                  <stop offset="1" stopColor="#DC1FFF"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          
          {/* Separator */}
          <div className="w-px h-4 bg-gray-600"></div>
          
          {/* P1 P2 P3 Pill - Simple Toggle */}
          <div className="flex items-center justify-center gap-1 relative">
            {['P1', 'P2', 'P3'].map((pill) => (
              <div key={pill} className="relative flex items-center justify-center">
                <button
                  className={`px-1.5 py-0.5 text-xs font-medium transition-all duration-200 cursor-pointer flex items-center justify-center ${
                    selectedPill === pill ? 'text-green-400' : 'text-gray-400 hover:text-white'
                  }`}
                  onClick={() => {
                    setSelectedPill(pill);
                    console.log(`Selected ${pill}`);
                  }}
                  onMouseEnter={() => setShowPillTooltip(pill)}
                  onMouseLeave={() => setShowPillTooltip(null)}
                >
                  {pill}
                </button>
                
                {/* Tooltip for each pill */}
                {showPillTooltip === pill && (
                  <div className="absolute top-full left-0 mt-1 w-28 rounded-lg shadow-xl border z-50"
                       style={{ 
                         backgroundColor: 'rgba(15, 16, 18, 0.95)',
                         borderColor: AX.border 
                       }}>
                    <div className="p-2 space-y-1.5">
                      {/* Slippage - Running person icon */}
                      <div className="flex items-center gap-1.5">
                        <FaRunning size={10} className="opacity-80" style={{ strokeWidth: '1' }} />
                        <span className="text-gray-300 text-xs font-light">20%</span>
                      </div>
                      
                      {/* Priority Fee - Gas pump icon with yellow styling */}
                      <div className="flex items-center gap-1.5">
                        <FaGasPump size={10} className="opacity-90" style={{ color: '#FCD34D', strokeWidth: '1' }} />
                        <span className="text-yellow-400 text-xs font-light">0.001</span>
                        <span className="text-red-500 text-xs font-light">⚠</span>
                      </div>
                      
                      {/* Bribe - Coins icon with yellow styling */}
                      <div className="flex items-center gap-1.5">
                        <FaCoins size={10} className="opacity-90" style={{ color: '#FCD34D', strokeWidth: '1' }} />
                        <span className="text-yellow-400 text-xs font-light">0.05</span>
                        <span className="text-red-500 text-xs font-light">⚠</span>
                      </div>
                      
                      {/* MEV Protection - Ban icon */}
                      <div className="flex items-center gap-1.5">
                        <FaBan size={10} className="opacity-90" style={{ strokeWidth: '1' }} />
                        <span className="text-gray-300 text-xs font-light">Off</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        
        {/* Filter Controls */}
        <div className="relative filter-dropdown">
          <button
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-300 ease-out cursor-pointer relative"
            style={{
              backgroundColor: 'transparent',
              color: showFilters ? AX.aiBlue : AX.muted
            }}
            onMouseEnter={(e) => {
              if (!showFilters) {
                e.currentTarget.style.color = '#E6E7EA';
              }
            }}
            onMouseLeave={(e) => {
              if (!showFilters) {
                e.currentTarget.style.color = AX.muted;
              }
            }}
            onClick={() => setShowFilters(!showFilters)}
          >
            {/* Custom Filter Icon - Three horizontal lines with circles */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6"/>
              <circle cx="8" cy="6" r="2"/>
              <line x1="4" y1="12" x2="20" y2="12"/>
              <circle cx="16" cy="12" r="2"/>
              <line x1="4" y1="18" x2="20" y2="18"/>
              <circle cx="8" cy="18" r="2"/>
            </svg>
            
            {/* Protocol Filter Count Indicator */}
            {filters.protocols.length > 0 && (
              <span 
                className="absolute -top-1 -right-1 bg-emerald-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold"
                style={{ fontSize: '10px' }}
              >
                {filters.protocols.length}
              </span>
            )}
          </button>
          
          {/* Comprehensive Filter Modal */}
          {showFilters && (
            <>
              {/* Backdrop */}
              <div 
                className="fixed inset-0 z-40"
                style={{ 
                  backgroundColor: 'rgba(0, 0, 0, 0.3)'
                }}
                onClick={() => setShowFilters(false)}
              />
              {/* Modal */}
              <div 
                className="filter-modal fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] rounded-lg shadow-xl border z-50"
              style={{
                backgroundColor: AX.surface,
                borderColor: AX.border,
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: AX.border }}>
                <h3 className="text-lg" style={{ 
                  color: AX.text, 
                  fontWeight: '300',
                  letterSpacing: '0.5px'
                }}>Filters</h3>
                  <button 
                    onClick={() => setShowFilters(false)}
                    className="p-1 rounded hover:bg-gray-700 transition-colors cursor-pointer"
                  >
                    <span className="text-sm">✕</span>
                  </button>
              </div>

              {/* Filter Tabs */}
              <div className="flex border-b items-center justify-between" style={{ borderColor: AX.border }}>
                <div className="flex">
                {['New Pairs', 'Final Stretch', 'Migrated'].map((tab) => (
                  <button
                    key={tab}
                      className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                        activeFilterTab === tab ? 'border-b-2' : ''
                      }`}
                    style={{
                      color: activeFilterTab === tab ? AX.aiBlue : AX.muted,
                      borderBottomColor: activeFilterTab === tab ? AX.aiBlue : 'transparent'
                    }}
                    onClick={() => setActiveFilterTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
                </div>
                <button 
                  className="p-2 rounded hover:bg-gray-700 transition-colors mr-2 cursor-pointer"
                  onClick={() => {
                    // Reset all filters
                    setFilters({
                      protocols: [],
                      quoteTokens: [],
                      searchKeywords: '',
                      excludeKeywords: '',
                      dexPaid: false,
                      caEndsInPump: false,
                      minAge: '',
                      maxAge: '',
                      ageUnit: 'm',
                      top10HoldersPercent: '',
                      devHoldingPercentMin: '',
                      devHoldingPercentMax: '',
                      snipersPercentMin: '',
                      snipersPercentMax: '',
                      insidersPercentMin: '',
                      insidersPercentMax: '',
                      bundlePercentMin: '',
                      bundlePercentMax: '',
                      holdersMin: '',
                      holdersMax: '',
                      proTradersMin: '',
                      proTradersMax: '',
                      devMigrationsMin: '',
                      devMigrationsMax: '',
                      devPairsCreatedMin: '',
                      devPairsCreatedMax: '',
                      minMarketCap: '',
                      maxMarketCap: '',
                      minVolume: '',
                      maxVolume: '',
                      minLiquidity: '',
                      maxLiquidity: '',
                      bCurvePercentMin: '',
                      bCurvePercentMax: '',
                      globalFeesPaidMin: '',
                      globalFeesPaidMax: '',
                      txnsMin: '',
                      txnsMax: '',
                      numBuysMin: '',
                      numBuysMax: '',
                      numSellsMin: '',
                      numSellsMax: '',
                      twitterFollowers: '',
                      telegramMembers: '',
                      discordMembers: '',
                      twitterReusesMin: '',
                      twitterReusesMax: '',
                      tweetAgeMin: '',
                      tweetAgeMax: '',
                      tweetAgeUnit: 'm',
                      hasTwitter: false,
                      hasWebsite: false,
                      hasTelegram: false,
                      atLeastOneSocial: false,
                      onlyPumpLive: false,
                      sortBy: 'marketCap',
                      sortOrder: 'desc'
                    });
                  }}
                >
                  <BiRefresh className="w-4 h-4" style={{ color: AX.text }} />
                </button>
              </div>

              <div className="p-4 max-h-[500px] overflow-y-auto" style={{ backgroundColor: AX.surface }}>
                {/* Protocols */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium" style={{ color: AX.text }}>Protocols</h4>
                    <button 
                      className="text-xs px-3 py-1 rounded-full font-medium transition-all duration-300 ease-out cursor-pointer"
                      style={{ 
                        backgroundColor: AX.aiBlue, 
                        color: '#000000',
                        borderRadius: '20px'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#2563eb';
                        e.currentTarget.style.boxShadow = `0 0 8px ${AX.glowBlue}`;
                        e.currentTarget.style.transform = 'scale(1.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = AX.aiBlue;
                        e.currentTarget.style.boxShadow = 'none';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                      onClick={() => {
                        const allProtocols = protocols.map(p => p.name);
                        setFilters(prev => ({ 
                          ...prev, 
                          protocols: prev.protocols.length === allProtocols.length ? [] : allProtocols 
                        }));
                      }}
                    >
                      Select All
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {protocols.map((protocol) => (
                      <button
                        key={protocol.name}
                        className="flex items-center gap-1 px-2 py-1.5 text-sm font-medium transition-all duration-300 ease-out whitespace-nowrap cursor-pointer"
                        style={{
                          backgroundColor: filters.protocols.includes(protocol.name) 
                            ? protocol.color 
                            : 'transparent',
                          borderColor: filters.protocols.includes(protocol.name) 
                            ? protocol.color 
                            : 'transparent',
                          border: filters.protocols.includes(protocol.name) ? '2px solid' : 'none',
                          color: filters.protocols.includes(protocol.name) 
                            ? '#000000' 
                            : AX.text,
                          borderRadius: '20px',
                          boxShadow: filters.protocols.includes(protocol.name) 
                            ? `0 0 12px ${protocol.color}40, 0 0 24px ${protocol.color}20` 
                            : 'none',
                          transform: filters.protocols.includes(protocol.name) ? 'scale(1.02)' : 'scale(1)'
                        }}
                        onMouseEnter={(e) => {
                          if (!filters.protocols.includes(protocol.name)) {
                            e.currentTarget.style.backgroundColor = protocol.color + '10';
                            e.currentTarget.style.borderColor = protocol.color;
                            e.currentTarget.style.border = '1px solid';
                            e.currentTarget.style.color = protocol.color;
                            e.currentTarget.style.boxShadow = `0 0 8px ${protocol.color}30`;
                            e.currentTarget.style.transform = 'scale(1.05)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!filters.protocols.includes(protocol.name)) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.borderColor = 'transparent';
                            e.currentTarget.style.border = 'none';
                            e.currentTarget.style.color = AX.text;
                            e.currentTarget.style.boxShadow = 'none';
                            e.currentTarget.style.transform = 'scale(1)';
                          }
                        }}
                        onClick={() => {
                          setFilters(prev => ({
                            ...prev,
                            protocols: prev.protocols.includes(protocol.name)
                              ? prev.protocols.filter(p => p !== protocol.name)
                              : [...prev.protocols, protocol.name]
                          }));
                        }}
                      >
                        <span className="text-sm" style={{ color: 'inherit' }}>{protocol.icon}</span>
                        <span className="truncate font-semibold" style={{ color: 'inherit' }}>{protocol.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quote Tokens */}
                <div className="mb-4">
                  <h4 className="text-sm font-medium mb-2" style={{ color: AX.text }}>Quote Tokens</h4>
                  <div className="flex gap-3">
                    {quoteTokens.map((token) => (
                      <button
                        key={token.name}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all duration-300 ease-out cursor-pointer"
                        style={{
                          backgroundColor: filters.quoteTokens.includes(token.name) 
                            ? token.color 
                            : 'transparent',
                          borderColor: filters.quoteTokens.includes(token.name) 
                            ? token.color 
                            : 'transparent',
                          border: filters.quoteTokens.includes(token.name) ? '2px solid' : 'none',
                          color: filters.quoteTokens.includes(token.name) 
                            ? '#000000' 
                            : AX.text,
                          borderRadius: '20px',
                          boxShadow: filters.quoteTokens.includes(token.name) 
                            ? `0 0 12px ${token.color}40, 0 0 24px ${token.color}20` 
                            : 'none',
                          transform: filters.quoteTokens.includes(token.name) ? 'scale(1.02)' : 'scale(1)'
                        }}
                        onMouseEnter={(e) => {
                          if (!filters.quoteTokens.includes(token.name)) {
                            e.currentTarget.style.backgroundColor = token.color + '10';
                            e.currentTarget.style.borderColor = token.color;
                            e.currentTarget.style.border = '1px solid';
                            e.currentTarget.style.color = token.color;
                            e.currentTarget.style.boxShadow = `0 0 8px ${token.color}30`;
                            e.currentTarget.style.transform = 'scale(1.05)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!filters.quoteTokens.includes(token.name)) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.borderColor = 'transparent';
                            e.currentTarget.style.border = 'none';
                            e.currentTarget.style.color = AX.text;
                            e.currentTarget.style.boxShadow = 'none';
                            e.currentTarget.style.transform = 'scale(1)';
                          }
                        }}
                        onClick={() => {
                          setFilters(prev => ({
                            ...prev,
                            quoteTokens: prev.quoteTokens.includes(token.name)
                              ? prev.quoteTokens.filter(t => t !== token.name)
                              : [...prev.quoteTokens, token.name]
                          }));
                        }}
                      >
                        <span className="text-base" style={{ color: 'inherit' }}>{token.icon}</span>
                        <span className="font-bold">{token.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Keywords */}
                <div className="mb-6">
                  <h4 className="text-sm font-medium mb-2" style={{ color: AX.text }}>Search Keywords</h4>
                  <input
                    type="text"
                    placeholder="keyword1, keyword2..."
                    value={pendingFilters.searchKeywords}
                    onChange={(e) => handlePendingFilterChange(prev => ({ ...prev, searchKeywords: e.target.value }))}
                          className="w-full px-3 py-2 rounded text-sm border"
                    style={{
                            backgroundColor: AX.surface,
                      borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                    }}
                  />
                  <h4 className="text-sm font-medium mb-2 mt-3" style={{ color: AX.text }}>Exclude Keywords</h4>
                  <input
                    type="text"
                    placeholder="keyword1, keyword2..."
                    value={pendingFilters.excludeKeywords}
                    onChange={(e) => handlePendingFilterChange(prev => ({ ...prev, excludeKeywords: e.target.value }))}
                          className="w-full px-3 py-2 rounded text-sm border"
                    style={{
                            backgroundColor: AX.surface,
                      borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                    }}
                  />
                </div>

                {/* Category Tabs */}
                <div className="flex border-b mb-4" style={{ borderColor: AX.border }}>
                  {['Audit', '$ Metrics', 'Socials'].map((tab) => (
                    <button
                      key={tab}
                      className={`px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                        activeCategoryTab === tab ? 'border-b-2' : ''
                      }`}
                      style={{
                        color: activeCategoryTab === tab ? AX.aiBlue : AX.muted,
                        borderBottomColor: activeCategoryTab === tab ? AX.aiBlue : 'transparent'
                      }}
                      onClick={() => setActiveCategoryTab(tab)}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {/* Category Content */}
                {activeCategoryTab === 'Audit' && (
                  <div className="space-y-3">
                    {/* Existing checkboxes */}
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="dexPaid"
                        checked={pendingFilters.dexPaid}
                        onChange={(e) => handlePendingFilterChange(prev => ({ ...prev, dexPaid: e.target.checked }))}
                        className="rounded cursor-pointer"
                      />
                      <label htmlFor="dexPaid" className="text-sm" style={{ color: AX.text }}>Dex Paid</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="caEndsInPump"
                        checked={pendingFilters.caEndsInPump}
                        onChange={(e) => handlePendingFilterChange(prev => ({ ...prev, caEndsInPump: e.target.checked }))}
                        className="rounded cursor-pointer"
                      />
                      <label htmlFor="caEndsInPump" className="text-sm" style={{ color: AX.text }}>CA ends in 'pump'</label>
                    </div>

                    {/* Dev Holding % */}
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Dev Holding %</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filters.devHoldingPercentMin}
                          onChange={(e) => setFilters(prev => ({ ...prev, devHoldingPercentMin: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={filters.devHoldingPercentMax}
                          onChange={(e) => setFilters(prev => ({ ...prev, devHoldingPercentMax: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                      </div>
                    </div>

                    {/* Snipers % */}
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Snipers %</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filters.snipersPercentMin}
                          onChange={(e) => setFilters(prev => ({ ...prev, snipersPercentMin: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={filters.snipersPercentMax}
                          onChange={(e) => setFilters(prev => ({ ...prev, snipersPercentMax: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                      </div>
                    </div>

                    {/* Insiders % */}
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Insiders %</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filters.insidersPercentMin}
                          onChange={(e) => setFilters(prev => ({ ...prev, insidersPercentMin: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={filters.insidersPercentMax}
                          onChange={(e) => setFilters(prev => ({ ...prev, insidersPercentMax: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                      </div>
                    </div>

                    {/* Bundle % */}
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Bundle %</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filters.bundlePercentMin}
                          onChange={(e) => setFilters(prev => ({ ...prev, bundlePercentMin: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={filters.bundlePercentMax}
                          onChange={(e) => setFilters(prev => ({ ...prev, bundlePercentMax: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                      </div>
                    </div>

                    {/* Holders */}
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Holders</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filters.holdersMin}
                          onChange={(e) => setFilters(prev => ({ ...prev, holdersMin: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={filters.holdersMax}
                          onChange={(e) => setFilters(prev => ({ ...prev, holdersMax: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                      </div>
                    </div>

                    {/* Pro Traders */}
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Pro Traders</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filters.proTradersMin}
                          onChange={(e) => setFilters(prev => ({ ...prev, proTradersMin: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={filters.proTradersMax}
                          onChange={(e) => setFilters(prev => ({ ...prev, proTradersMax: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                      </div>
                    </div>

                    {/* Dev Migrations */}
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Dev Migrations</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filters.devMigrationsMin}
                          onChange={(e) => setFilters(prev => ({ ...prev, devMigrationsMin: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={filters.devMigrationsMax}
                          onChange={(e) => setFilters(prev => ({ ...prev, devMigrationsMax: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                      </div>
                    </div>

                    {/* Dev Pairs Created */}
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Dev Pairs Created</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filters.devPairsCreatedMin}
                          onChange={(e) => setFilters(prev => ({ ...prev, devPairsCreatedMin: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={filters.devPairsCreatedMax}
                          onChange={(e) => setFilters(prev => ({ ...prev, devPairsCreatedMax: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                      </div>
                    </div>

                    {/* Age (existing) */}
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Age</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filters.minAge}
                          onChange={(e) => setFilters(prev => ({ ...prev, minAge: e.target.value }))}
                          className="flex-1 px-2 py-1.5 rounded minimal-input text-sm"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                        <select
                          value={filters.ageUnit}
                          onChange={(e) => setFilters(prev => ({ ...prev, ageUnit: e.target.value }))}
                          className="px-2 py-2 rounded border text-sm"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text
                          }}
                        >
                          <option value="m">m</option>
                          <option value="h">h</option>
                          <option value="d">d</option>
                        </select>
                        <input
                          type="number"
                          placeholder="Max"
                          value={filters.maxAge}
                          onChange={(e) => setFilters(prev => ({ ...prev, maxAge: e.target.value }))}
                          className="flex-1 px-2 py-1.5 rounded minimal-input text-sm"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                        <select
                          value={filters.ageUnit}
                          onChange={(e) => setFilters(prev => ({ ...prev, ageUnit: e.target.value }))}
                          className="px-2 py-2 rounded border text-sm"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text
                          }}
                        >
                          <option value="m">m</option>
                          <option value="h">h</option>
                          <option value="d">d</option>
                        </select>
                      </div>
                    </div>

                    {/* Top 10 Holders % (existing) */}
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Top 10 Holders %</label>
                      <input
                        type="number"
                        placeholder="Enter percentage"
                        value={filters.top10HoldersPercent}
                        onChange={(e) => setFilters(prev => ({ ...prev, top10HoldersPercent: e.target.value }))}
                          className="w-full px-3 py-2 rounded text-sm border"
                        style={{
                            backgroundColor: AX.surface,
                          borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                        }}
                      />
                    </div>

                  </div>
                )}

                {activeCategoryTab === '$ Metrics' && (
                  <div className="space-y-3">
                    {/* Liquidity */}
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Liquidity ($)</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filters.minLiquidity}
                          onChange={(e) => setFilters(prev => ({ ...prev, minLiquidity: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={filters.maxLiquidity}
                          onChange={(e) => setFilters(prev => ({ ...prev, maxLiquidity: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                      </div>
                    </div>

                    {/* Volume */}
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Volume ($)</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filters.minVolume}
                          onChange={(e) => setFilters(prev => ({ ...prev, minVolume: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={filters.maxVolume}
                          onChange={(e) => setFilters(prev => ({ ...prev, maxVolume: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                      </div>
                    </div>

                    {/* Market Cap */}
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Market Cap ($)</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filters.minMarketCap}
                          onChange={(e) => setFilters(prev => ({ ...prev, minMarketCap: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={filters.maxMarketCap}
                          onChange={(e) => setFilters(prev => ({ ...prev, maxMarketCap: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                      </div>
                    </div>

                    {/* B. curve %} */}
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>B. curve %</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filters.bCurvePercentMin}
                          onChange={(e) => setFilters(prev => ({ ...prev, bCurvePercentMin: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={filters.bCurvePercentMax}
                          onChange={(e) => setFilters(prev => ({ ...prev, bCurvePercentMax: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                      </div>
                    </div>

                    {/* Global Fees Paid (SOL) */}
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Global Fees Paid (SOL)</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filters.globalFeesPaidMin}
                          onChange={(e) => setFilters(prev => ({ ...prev, globalFeesPaidMin: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={filters.globalFeesPaidMax}
                          onChange={(e) => setFilters(prev => ({ ...prev, globalFeesPaidMax: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                      </div>
                    </div>

                    {/* Txns */}
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Txns</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filters.txnsMin}
                          onChange={(e) => setFilters(prev => ({ ...prev, txnsMin: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={filters.txnsMax}
                          onChange={(e) => setFilters(prev => ({ ...prev, txnsMax: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                      </div>
                    </div>

                    {/* Num Buys */}
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Num Buys</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filters.numBuysMin}
                          onChange={(e) => setFilters(prev => ({ ...prev, numBuysMin: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={filters.numBuysMax}
                          onChange={(e) => setFilters(prev => ({ ...prev, numBuysMax: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                      </div>
                    </div>

                    {/* Num Sells */}
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Num Sells</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filters.numSellsMin}
                          onChange={(e) => setFilters(prev => ({ ...prev, numSellsMin: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={filters.numSellsMax}
                          onChange={(e) => setFilters(prev => ({ ...prev, numSellsMax: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                      </div>
                    </div>

                  </div>
                )}

                {activeCategoryTab === 'Socials' && (
                  <div className="space-y-3">
                    {/* Twitter Reuses */}
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Twitter Reuses</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filters.twitterReusesMin}
                          onChange={(e) => setFilters(prev => ({ ...prev, twitterReusesMin: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={filters.twitterReusesMax}
                          onChange={(e) => setFilters(prev => ({ ...prev, twitterReusesMax: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                      </div>
                    </div>

                    {/* Tweet Age */}
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Tweet Age</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filters.tweetAgeMin}
                          onChange={(e) => setFilters(prev => ({ ...prev, tweetAgeMin: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                        <select
                          value={filters.tweetAgeUnit}
                          onChange={(e) => setFilters(prev => ({ ...prev, tweetAgeUnit: e.target.value }))}
                          className="px-2 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        >
                          <option value="m">m</option>
                          <option value="h">h</option>
                          <option value="d">d</option>
                        </select>
                        <input
                          type="number"
                          placeholder="Max"
                          value={filters.tweetAgeMax}
                          onChange={(e) => setFilters(prev => ({ ...prev, tweetAgeMax: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        />
                        <select
                          value={filters.tweetAgeUnit}
                          onChange={(e) => setFilters(prev => ({ ...prev, tweetAgeUnit: e.target.value }))}
                          className="px-2 py-2 rounded text-sm border"
                          style={{
                            backgroundColor: AX.surface,
                            borderColor: AX.border,
                            color: AX.text,
                            outline: 'none',
                            boxShadow: 'none'
                          }}
                          onFocus={(e) => {
                            e.target.style.outline = 'none';
                            e.target.style.boxShadow = 'none';
                            e.target.style.borderColor = AX.border;
                          }}
                        >
                          <option value="m">m</option>
                          <option value="h">h</option>
                          <option value="d">d</option>
                        </select>
                      </div>
                    </div>

                    {/* Checkboxes */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={filters.hasTwitter}
                          onChange={(e) => setFilters(prev => ({ ...prev, hasTwitter: e.target.checked }))}
                          className="rounded cursor-pointer"
                          style={{
                            accentColor: AX.aiBlue
                          }}
                        />
                        <span className="text-sm" style={{ color: AX.text }}>Twitter</span>
                      </label>
                      
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={filters.hasWebsite}
                          onChange={(e) => setFilters(prev => ({ ...prev, hasWebsite: e.target.checked }))}
                          className="rounded cursor-pointer"
                          style={{
                            accentColor: AX.aiBlue
                          }}
                        />
                        <span className="text-sm" style={{ color: AX.text }}>Website</span>
                      </label>
                      
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={filters.hasTelegram}
                          onChange={(e) => setFilters(prev => ({ ...prev, hasTelegram: e.target.checked }))}
                          className="rounded cursor-pointer"
                          style={{
                            accentColor: AX.aiBlue
                          }}
                        />
                        <span className="text-sm" style={{ color: AX.text }}>Telegram</span>
                      </label>
                      
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={filters.atLeastOneSocial}
                          onChange={(e) => setFilters(prev => ({ ...prev, atLeastOneSocial: e.target.checked }))}
                          className="rounded cursor-pointer"
                          style={{
                            accentColor: AX.aiBlue
                          }}
                        />
                        <span className="text-sm" style={{ color: AX.text }}>At Least One Social</span>
                      </label>
                      
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={filters.onlyPumpLive}
                          onChange={(e) => setFilters(prev => ({ ...prev, onlyPumpLive: e.target.checked }))}
                          className="rounded cursor-pointer"
                          style={{
                            accentColor: AX.aiBlue
                          }}
                        />
                        <span className="text-sm" style={{ color: AX.text }}>Only Pump Live</span>
                      </label>
                    </div>

                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between p-4 border-t" style={{ borderColor: AX.border }}>
                <div className="flex gap-2">
                  <button 
                    className="px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                    style={{ backgroundColor: AX.border, color: AX.text }}
                    onClick={() => {
                      // Import functionality
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.json';
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            try {
                              const importedFilters = JSON.parse(event.target?.result as string);
                              setFilters(importedFilters);
                            } catch (error) {
                              console.error('Error importing filters:', error);
                            }
                          };
                          reader.readAsText(file);
                        }
                      };
                      input.click();
                    }}
                  >
                    Import
                  </button>
                  <button 
                    className="px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                    style={{ backgroundColor: AX.border, color: AX.text }}
                    onClick={() => {
                      // Export functionality
                      const dataStr = JSON.stringify(filters, null, 2);
                      const dataBlob = new Blob([dataStr], { type: 'application/json' });
                      const url = URL.createObjectURL(dataBlob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = 'pulse-filters.json';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Export
                  </button>
                </div>
                <button 
                  onClick={handleResetFilters}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ease-out cursor-pointer mr-2"
                  style={{
                    backgroundColor: AX.surface,
                    color: AX.muted,
                    border: `1px solid ${AX.border}`
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = AX.border;
                    e.currentTarget.style.color = AX.text;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = AX.surface;
                    e.currentTarget.style.color = AX.muted;
                  }}
                >
                  Reset
                </button>
                <button 
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ease-out cursor-pointer"
                  style={{
                    backgroundColor: hasPendingChanges ? AX.aiBlue : AX.surface,
                    color: hasPendingChanges ? '#000000' : AX.muted,
                    opacity: hasPendingChanges ? 1 : 0.5
                  }}
                  disabled={!hasPendingChanges}
                  onMouseEnter={(e) => {
                    if (hasPendingChanges) {
                      e.currentTarget.style.backgroundColor = '#2563eb';
                      e.currentTarget.style.boxShadow = `0 0 8px ${AX.glowBlue}`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (hasPendingChanges) {
                      e.currentTarget.style.backgroundColor = AX.aiBlue;
                      e.currentTarget.style.boxShadow = 'none';
                    }
                  }}
                  onClick={handleApplyFilters}
                >
                  Apply All
                </button>
              </div>
            </div>
            </>
          )}
        </div>
        </div>
      </div>
      <div className="custom-scrollbar max-h-[70vh] overflow-y-scroll ">
        {loading && tokens.length === 0 ? (
          Array.from({ length: skeletonRowCount }).map((_, idx) => (
            <div
              key={idx}
              className="flex animate-pulse flex-row items-start border-b p-2 last:border-b-0"
              style={{ borderColor: AX.border }}
            >
              {/* Profile Picture & Address skeleton */}
              <div className="mr-2 flex w-20 flex-col items-center">
                <div className="relative h-20 w-20 rounded-lg" style={{ backgroundColor: AX.surface }} />
                <div className="mt-1 h-3 w-16 rounded" style={{ backgroundColor: AX.surface }} />
              </div>
              {/* Main Info Section skeleton */}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-row justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="h-4 w-20 rounded" style={{ backgroundColor: AX.surface }} />
                      <div className="h-3 w-16 rounded" style={{ backgroundColor: AX.surface }} />
                      <div className="h-3 w-6 rounded" style={{ backgroundColor: AX.surface }} />
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-3 w-8 rounded" style={{ backgroundColor: AX.surface }} />
                      <div className="h-3 w-6 rounded" style={{ backgroundColor: AX.surface }} />
                      <div className="h-3 w-6 rounded" style={{ backgroundColor: AX.surface }} />
                      <div className="h-3 w-6 rounded" style={{ backgroundColor: AX.surface }} />
                    </div>
                  </div>
                  <div className="flex min-w-[140px] flex-col items-end gap-1">
                    <div className="flex gap-2 text-xs">
                      <div className="h-3 w-12 rounded" style={{ backgroundColor: AX.surface }} />
                      <div className="h-3 w-12 rounded" style={{ backgroundColor: AX.surface }} />
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <div className="h-3 w-8 rounded" style={{ backgroundColor: AX.surface }} />
                      <div className="h-3 w-8 rounded" style={{ backgroundColor: AX.surface }} />
                    </div>
                  </div>
                </div>
                <div className="mt-1 flex flex-row items-center justify-between gap-2">
                  <div className="flex gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-4 w-10 rounded-full"
                        style={{ backgroundColor: AX.surface }}
                      />
                    ))}
                  </div>
                  <div className="h-6 w-16 rounded-full" style={{ backgroundColor: AX.surface }} />
                </div>
              </div>
            </div>
          ))
        ) : tokens.length === 0 ? (
          <div className="py-8 text-center" style={{ color: AX.muted }}>
            No tokens found.
          </div>
        ) : (
          memoizedTokens.map((token, idx) => {
            const pairAddress = (token as any)?.pair_address;
            const mintAddress = (token as any)?.mint;

            const handleTokenClick = async () => {
              // If we have pair_address, navigate directly
              if (pairAddress) {
                router.push(`/trade/${pairAddress}`);
                return;
              }

              // If we only have mint_address, fetch pair_address first
              if (mintAddress) {
                try {
                  console.log("Fetching pair address for mint:", mintAddress);
                  const response = await fetch(
                    "/api/token-service/hydrate-pair",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ mint: mintAddress }),
                    },
                  );

                  if (response.ok) {
                    const data = await response.json();
                    if (data.pair_address) {
                      console.log("Got pair address:", data.pair_address);
                      router.push(`/trade/${data.pair_address}`);
                    } else {
                      console.error(
                        "No pair address found for mint:",
                        mintAddress,
                      );
                    }
                  } else {
                    console.error(
                      "Failed to fetch pair address for mint:",
                      mintAddress,
                    );
                  }
                } catch (error) {
                  console.error("Error fetching pair address:", error);
                }
              }
            };

            return (
              <div
                key={`${pairAddress || mintAddress || "noaddr"}-${idx}`}
                className="group relative flex w-full cursor-pointer flex-row items-start gap-2 border-b px-2 pt-1  transition-all duration-300 ease-out"
                style={{ 
                  borderColor: AX.border,
                  backgroundColor: 'transparent'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(107, 114, 128, 0.1)';
                  // Show and position the popup
                  const popup = e.currentTarget.querySelector('.status-popup') as HTMLElement;
                  if (popup) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    popup.style.display = 'block';
                    popup.style.left = `${rect.left + rect.width / 2}px`;
                    popup.style.top = `${rect.top - 30}px`;
                    popup.style.transform = 'translateX(-50%)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  // Hide the popup
                  const popup = e.currentTarget.querySelector('.status-popup') as HTMLElement;
                  if (popup) {
                    popup.style.display = 'none';
                  }
                }}
                onClick={handleTokenClick}
              >
                {/* Added by hujoe - can use in the future
                {waveTokens.has(idx) && (
                  <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg z-10">
                    <div 
                      className="absolute top-0 left-0 h-full w-full opacity-0"
                      style={{
                        background: 'linear-gradient(90deg, transparent, rgba(30, 58, 138, 0.1), rgba(30, 58, 138, 0.3), rgba(30, 58, 138, 0.1), transparent)',
                        animation: 'smoothWaveFlow 2.5s cubic-bezier(0.4, 0, 0.2, 1)',
                        filter: 'blur(1px)'
                      }}
                    ></div>
                    
                    <div 
                      className="absolute top-0 left-0 h-full w-full opacity-0"
                      style={{
                        background: 'linear-gradient(90deg, transparent, rgba(30, 58, 138, 0.05), rgba(30, 58, 138, 0.15), rgba(30, 58, 138, 0.05), transparent)',
                        animation: 'smoothWaveFlow 2.5s cubic-bezier(0.4, 0, 0.2, 1) 0.2s',
                        filter: 'blur(2px)'
                      }}
                    ></div>
                    
                    <div 
                      className="absolute inset-0 rounded-lg"
                      style={{
                        animation: 'aiGlowPulse 2.5s cubic-bezier(0.4, 0, 0.2, 1)',
                        background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.02), rgba(30, 58, 138, 0.05), rgba(30, 58, 138, 0.02))'
                      }}
                    ></div>
                    
                    <div 
                      className="absolute inset-0 rounded-lg border"
                      style={{
                        borderColor: 'rgba(30, 58, 138, 0.3)',
                        animation: 'aiGlowPulse 2.5s cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: 'inset 0 0 0px rgba(30, 58, 138, 0)'
                      }}
                    ></div>
                  </div>
                )}
                */}
                
                {/* Status popout on hover */}
                <span
                  className={`status-popup fixed hidden border px-2 py-1 text-xs shadow-none`}
                  style={{ 
                    pointerEvents: "none",
                    backgroundColor: AX.surface,
                    borderColor: AX.border,
                    color: AX.text,
                    zIndex: 99999,
                    left: '50%',
                    top: '100px',
                    transform: 'translateX(-50%)',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: '500'
                  }}
                >
                  {(() => {
                    // Determine token status based on title and token data
                    const isNewPairs = title.toLowerCase().includes("new");
                    const isFinalStretch =
                      title.toLowerCase().includes("final") ||
                      title.toLowerCase().includes("stretch");
                    const isMigrated = title.toLowerCase().includes("migrated");

                    if (isNewPairs) {
                      // Show bonding curve progress for new pairs
                      // bonding_pct is already in 0-100 range from backend (percentages)
                      const bondingProgress =
                        typeof token.bonding_pct === "number"
                          ? Math.round(token.bonding_pct)
                          : Math.round(parseFloat(token.bonding_pct || "0"));

                      return (
                        <span style={{ color: AX.aiGreen }}>
                          Bonding Curve: {bondingProgress}%
                        </span>
                      );
                    } else if (isFinalStretch) {
                      // Show "migrating" for final stretch
                      return (
                        <span style={{ color: AX.aiCyan }}>
                          Migrating
                        </span>
                      );
                    } else if (isMigrated) {
                      // Show "migrated" for migrated tokens
                      return (
                        <span style={{ color: AX.aiBlue }}>
                          Migrated
                        </span>
                      );
                    } else {
                      // Fallback to bonding curve progress
                      const bondingProgress =
                        typeof token.bonding_curve_progress === "number"
                          ? Math.round(token.bonding_curve_progress)
                          : Math.round(
                              parseFloat(token.bonding_curve_progress || "0"),
                            );
                      return (
                        <span style={{ color: AX.aiGreen }}>
                          Bonding: {bondingProgress}%
                        </span>
                      );
                    }
                  })()}
                </span>
                {/* Profile Picture & Address */}
                <div className="flex flex-col items-center relative">
                    <TokenImage
                      token={token}
                      priority={title === "New Pairs"}
                      isNewPairs={title === "New Pairs"}
                    />
                  {/* Token Metrics */}
                  <div className="absolute bottom-16 -right-59">
                    <TokenMetrics token={token} />
                  </div>
                  <span className="mt-2 mb-1 max-w-[70px] truncate font-mono text-[10px]" style={{ color: AX.muted }}>
                    {shortAddr(token)}
                  </span>
                </div>
                {/* Main Info Section */}
                <div className="flex w-full min-w-0 flex-col gap-1">
                  {/* Top Row */}
                  <div className="flex flex-row justify-between gap-2">
                    {/* Left: Token Info & Socials */}
                    <div className="flex min-w-0 flex-col">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="font-semibold text-xs flex-shrink-0" style={{ color: AX.text }}>
                          {token.symbol}
                        </span>
                        <span className="text-[10px] truncate" style={{ color: AX.muted }}>
                          {token.name}
                        </span>
                        <div className="relative ml-1">
                        <button
                            className="transition-colors duration-200"
                            style={{ color: AX.muted }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = AX.aiBlue;
                              e.currentTarget.style.boxShadow = `0 0 6px ${AX.glowBlue}`;
                              const tooltip = document.getElementById(`copy-tooltip-${idx}`) as HTMLElement;
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
                              const tooltip = document.getElementById(`copy-tooltip-${idx}`) as HTMLElement;
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
                          <FaRegCopy size={12} />
                        </button>
                      </div>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs" style={{ color: AX.aiGreen }}>
                        <span>{getAgeLabel(token)}</span>
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
                                const tooltip = e.currentTarget.nextElementSibling as HTMLElement;
                                if (tooltip) tooltip.style.opacity = '1';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = AX.muted;
                                const tooltip = e.currentTarget.nextElementSibling as HTMLElement;
                                if (tooltip) tooltip.style.opacity = '0';
                              }}
                            >
                              <LuPill />
                          </Link>
                          )}
                          
                          {/* Search on Twitter Button - show for all tokens */}
                          <button
                            className="transition-colors duration-200 cursor-pointer"
                            style={{ color: AX.muted }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = AX.aiCyan;
                              const tooltip = document.getElementById(`search-tooltip-${idx}`) as HTMLElement;
                              if (tooltip) {
                                const rect = e.currentTarget.getBoundingClientRect();
                                tooltip.style.left = `${rect.left + rect.width / 2}px`;
                                tooltip.style.top = `${rect.top - 10}px`;
                                tooltip.style.opacity = '1';
                              }
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = AX.muted;
                              const tooltip = document.getElementById(`search-tooltip-${idx}`) as HTMLElement;
                              if (tooltip) tooltip.style.opacity = '0';
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              const searchQuery = `${token.symbol} ${token.name}`.trim();
                              const twitterUrl = `https://twitter.com/search?q=${encodeURIComponent(searchQuery)}`;
                              window.open(twitterUrl, '_blank');
                            }}
                          >
                            <FaSearch size={12} />
                          </button>

                          {/* X Profile Preview Button */}
                          <div className="relative">
                            <button
                              className="transition-colors duration-200"
                              style={{ color: AX.muted }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = AX.aiBlue;
                                const tooltip = document.getElementById(`profile-tooltip-${idx}`) as HTMLElement;
                                if (tooltip) {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  tooltip.style.left = `${rect.left + rect.width / 2}px`;
                                  tooltip.style.top = `${rect.top - 10}px`;
                                  tooltip.style.opacity = '1';
                                }
                                // Show X profile preview
                                setShowXPreview(idx);
                                // Store button position for popup positioning
                                const buttonRect = e.currentTarget.getBoundingClientRect();
                                setButtonPosition({
                                  left: buttonRect.left + buttonRect.width / 2,
                                  top: buttonRect.top - 20
                                });
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = AX.muted;
                                const tooltip = document.getElementById(`profile-tooltip-${idx}`) as HTMLElement;
                                if (tooltip) tooltip.style.opacity = '0';
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                // Open X profile in new tab
                                const profileUrl = `https://twitter.com/${token.symbol?.toLowerCase() || 'search'}`;
                                window.open(profileUrl, '_blank');
                              }}
                            >
                              <FaUser size={12} />
                            </button>
                            
                            {/* Small X Profile Preview - positioned near token */}
                            {showXPreview === idx && buttonPosition && (
                              <div 
                                className="fixed"
                                style={{
                                  left: `${buttonPosition.left}px`,
                                  top: `${buttonPosition.top - 300}px`,
                                  transform: 'translate(-50%, 0)',
                                  width: '280px',
                                  zIndex: 999999
                                }}
                                onMouseEnter={() => {
                                  // Keep popup open when hovering over it
                                }}
                                onMouseLeave={() => {
                                  // Hide popup when leaving the popup area
                                  setShowXPreview(null);
                                }}
                              >
                                <div 
                                  className="rounded-xl overflow-hidden"
                                  style={{
                                    backgroundColor: AX.surface,
                                    border: `1px solid ${AX.border}`,
                                    boxShadow: `0 12px 48px rgba(0, 0, 0, 0.5), 0 0 24px ${AX.glowBlue}`,
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
                                  {/* Profile Header*/}
                                  <div className="p-4 pt-8">
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <h3 className="text-sm font-bold truncate" style={{ color: AX.text }}>
                                            {token.symbol || 'Unknown'}
                                          </h3>
                                          {/* Verified Badge */}
                                          <div 
                                            className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                                            style={{ backgroundColor: '#FFD700' }}
                                          >
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                              <path d="M9 12l2 2 4-4"/>
                                              <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z"/>
                                            </svg>
                                          </div>
                                        </div>
                                        <p className="text-xs truncate" style={{ color: AX.muted }}>
                                          @{token.symbol?.toLowerCase() || 'unknown'}
                                        </p>
                                        <p className="text-xs mt-1" style={{ color: AX.muted }}>
                                          {token.name || 'Token'}
                                        </p>
                                      </div>
                                      
                                      {/* Follow Button */}
                                      <button
                                        className="px-3 py-1 rounded-full text-xs font-semibold transition-all duration-200"
                                        style={{
                                          backgroundColor: AX.aiBlue,
                                          color: '#000000',
                                          boxShadow: `0 0 8px ${AX.glowBlue}`
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.backgroundColor = AX.aiBlueHover;
                                          e.currentTarget.style.boxShadow = `0 0 12px ${AX.glowBlue}`;
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.backgroundColor = AX.aiBlue;
                                          e.currentTarget.style.boxShadow = `0 0 8px ${AX.glowBlue}`;
                                        }}
                                      >
                                        Follow
                                      </button>
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
                                          src={`https://ui-avatars.com/api/?name=${token.symbol || 'Token'}&size=80&background=1a1a1a&color=ffffff&bold=true`}
                                          alt={`${token.symbol} profile`}
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
                                          {token.symbol?.slice(0, 2) || '??'}
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {/* Profile Info */}
                                    <div className="text-center mb-4">
                                      <div className="flex items-center justify-center gap-2 mb-1">
                                        <h3 className="text-xl font-bold text-white">
                                          {token.symbol || 'Unknown'}
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
                                        @{token.symbol?.toLowerCase() || 'unknown'}
                                      </p>
                                      <p className="text-sm text-white leading-relaxed px-2">
                                        {token.description || `Official ${token.symbol || 'token'} community. Join the conversation!`}
                                      </p>
                                    </div>
                                    
                                    {/* Stats Row */}
                                    <div className="flex items-center justify-center gap-8 text-sm mb-4">
                                      <div className="text-center">
                                        <div className="font-bold text-white text-lg">
                                          {(() => {
                                            const symbol = token.symbol?.toLowerCase() || '';
                                            const hash = symbol.split('').reduce((a, b) => {
                                              a = ((a << 5) - a) + b.charCodeAt(0);
                                              return a & a;
                                            }, 0);
                                            return Math.abs(hash) % 50000 + 1000;
                                          })()}
                                        </div>
                                        <div className="text-gray-400 text-xs">Following</div>
                                      </div>
                                      <div className="text-center">
                                        <div className="font-bold text-white text-lg">
                                          {(() => {
                                            const symbol = token.symbol?.toLowerCase() || '';
                                            const hash = symbol.split('').reduce((a, b) => {
                                              a = ((a << 5) - a) + b.charCodeAt(0);
                                              return a & a;
                                            }, 0);
                                            return Math.abs(hash) % 500000 + 10000;
                                          })()}
                                        </div>
                                        <div className="text-gray-400 text-xs">Followers</div>
                                      </div>
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
                                        const profileUrl = `https://twitter.com/${token.symbol?.toLowerCase() || 'search'}`;
                                        window.open(profileUrl, '_blank');
                                      }}
                                    >
                                      See profile on X
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                          
                          {/* Pump.fun Tooltip */}
                          {token.mint.slice(-4) === "pump" && (
                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 rounded text-xs font-medium opacity-0 transition-opacity duration-200 pointer-events-none whitespace-nowrap"
                                 style={{ 
                                   zIndex: 99999,
                                   backgroundColor: AX.surface, 
                                   color: AX.text, 
                                   border: `1px solid ${AX.border}`,
                                   boxShadow: `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 0 8px ${AX.glowCyan}`
                                 }}>
                              View on Pump.fun
                              {/* Tooltip arrow */}
                              <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent"
                                   style={{ borderTopColor: AX.surface }}></div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Right: MC, V, F, TX */}
                    <div className="items-right justify-right flex min-w-[140px] flex-col items-end gap-1 text-right">
                      <div className="justify-right flex flex-col text-xs">
                         <span style={{ color: AX.muted }}>
                           MC{" "}
                           <SmartColor token={token} metricType="marketCap" className="text-base font-semibold">
                             <SmoothNumber
                               value={
                                 (token as any).fully_diluted_value ??
                                 (token as any).market_cap_usd ??
                                 0
                               }
                               formatter={(val) => `$${formatSmartNumber(val)}`}
                               duration={300}
                             />
                           </SmartColor>
                         </span>
                        <span style={{ color: AX.muted }}>
                          <span className="text-xs">V</span>{" "}
                          <span 
                            className="text-sm font-semibold"
                            style={{ 
                              color: '#ffffff',
                              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace'
                            }}
                          >
                            <SmoothNumber
                              value={(token as any).volume_24h || 0}
                              formatter={(val) => {
                                const rounded = Math.round(val);
                                if (rounded >= 1e12) return `$${Math.round(rounded / 1e12)}T`;
                                if (rounded >= 1e9) return `$${Math.round(rounded / 1e9)}B`;
                                if (rounded >= 1e6) return `$${Math.round(rounded / 1e6)}M`;
                                if (rounded >= 1e3) return `$${Math.round(rounded / 1e3)}K`;
                                return `$${rounded}`;
                              }}
                              duration={300}
                            />
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className="flex flex-row items-center gap-1" style={{ color: AX.muted }}>
                          <span className="text-xs">F</span>{" "}
                          <svg width="10" height="10" viewBox="0 0 397.7 311.7" fill="none" className="ml-1">
                            <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 237.9z" fill="url(#paint0_linear_solana)"/>
                            <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1L333.1 73.8c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="url(#paint1_linear_solana)"/>
                            <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" fill="url(#paint2_linear_solana)"/>
                            <defs>
                              <linearGradient id="paint0_linear_solana" x1="360.8" y1="351.5" x2="141.44" y2="132.14" gradientUnits="userSpaceOnUse">
                                <stop offset="0" stopColor="#00FFA3"/>
                                <stop offset="1" stopColor="#DC1FFF"/>
                              </linearGradient>
                              <linearGradient id="paint1_linear_solana" x1="264.8" y1="116.2" x2="45.44" y2="-103.16" gradientUnits="userSpaceOnUse">
                                <stop offset="0" stopColor="#00FFA3"/>
                                <stop offset="1" stopColor="#DC1FFF"/>
                              </linearGradient>
                              <linearGradient id="paint2_linear_solana" x1="312.5" y1="233.9" x2="93.14" y2="14.54" gradientUnits="userSpaceOnUse">
                                <stop offset="0" stopColor="#00FFA3"/>
                                <stop offset="1" stopColor="#DC1FFF"/>
                              </linearGradient>
                            </defs>
                          </svg>
                          <span 
                            className="text-xs font-semibold"
                            style={{ 
                              color: '#ffffff',
                              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace'
                            }}
                          >
                            {((token as any).liquidity_usd && formatSmartNumber((token as any).liquidity_usd)) || '0.024'}
                          </span>
                          <span className="text-xs">TX</span>{" "}
                          <span 
                            className="text-xs font-semibold"
                            style={{ 
                              color: '#ffffff',
                              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace'
                            }}
                          >
                            <SmoothNumber
                              value={
                                (token.total_buys_5m ?? 0) +
                                (token.total_sells_5m ?? 0)
                              }
                              duration={300}
                            />
                          </span>
                          <div className="w-8 h-1 bg-gray-700 rounded-full overflow-hidden ml-1">
                            <div 
                              className="h-full bg-green-400 rounded-full"
                              style={{
                                width: `${Math.min(100, Math.max(10, ((token.total_buys_5m ?? 0) / Math.max(1, (token.total_buys_5m ?? 0) + (token.total_sells_5m ?? 0))) * 100))}%`
                              }}
                            ></div>
                          </div>
                        </div>
                        {/* <span className="text-neutral-400">
                          V5m{" "}
                          <span className="font-bold text-green-400">
                            <SmoothNumber
                              value={
                                (token.total_buy_volume_5m ?? 0) +
                                (token.total_sell_volume_5m ?? 0)
                              }
                              formatter={(val) => `$${formatSmartNumber(val)}`}
                              duration={300}
                            />
                          </span>
                        </span> */}
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        {/* <span className="text-neutral-400">
                          W5m{" "}
                          <span className="font-bold text-blue-400">
                            <SmoothNumber
                              value={token.unique_wallets_5m ?? 0}
                              duration={300}
                            />
                          </span>
                        </span>
                        <span className="text-neutral-400">
                          B/S{" "}
                          <span className="font-bold text-yellow-400">
                            <SmoothNumber
                              value={token.total_buys_5m ?? 0}
                              duration={300}
                            />
                            /
                            <SmoothNumber
                              value={token.total_sells_5m ?? 0}
                              duration={300}
                            />
                          </span>
                        </span> */}
                      </div>
                      <button 
                        className="flex cursor-pointer items-center gap-1 rounded-full px-0.5 py-0.5 text-[10px] font-bold transition-all duration-200 ease-out opacity-0 group-hover:opacity-100"
                        style={{ 
                          backgroundColor: AX.aiGreen, 
                          color: '#000000' 
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = AX.aiGreenHover;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = AX.aiGreen;
                        }}
                      >
                        <HiLightningBolt className="text-black" size={12} /> 0
                        SOL
                      </button>
                    </div>
                  </div>
                </div>
                
                {/* Bottom Row */}
                <div className="absolute left-24 bottom-2 flex flex-row items-center gap-1">
                  {/* Buyers percentage - Green */}
                  <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-all duration-200"
                        style={{ 
                          color: AX.aiGreen,
                          fontSize: '11px',
                          fontWeight: '500',
                          borderColor: 'rgba(107, 114, 128, 0.1)',
                          backgroundColor: 'transparent'
                        }}>
                    <BsPersonGear size={13} /> {Math.round(((token.total_buyers_5m ?? 0) / Math.max(1, (token.total_buyers_5m ?? 0) + (token.total_sellers_5m ?? 0))) * 100)}%
                  </span>
                  
                  {/* DS indicator - Blue with time */}
                  <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-all duration-200"
                        style={{ 
                          color: '#3B82F6',
                          fontSize: '11px',
                          fontWeight: '500',
                          borderColor: 'rgba(107, 114, 128, 0.1)',
                          backgroundColor: 'transparent'
                        }}>
                    <LuChefHat size={13} /> DS <span style={{ color: '#ffffff' }}>{getAgeLabel(token)}</span>
                  </span>
                  
                  {/* Snipe percentage - Red */}
                  <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-all duration-200"
                        style={{ 
                          color: '#EF4444',
                          fontSize: '11px',
                          fontWeight: '500',
                          borderColor: 'rgba(107, 114, 128, 0.1)',
                          backgroundColor: 'transparent'
                        }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                      <line x1="12" y1="4" x2="12" y2="8" stroke="currentColor" strokeWidth="1.5"/>
                      <line x1="12" y1="16" x2="12" y2="20" stroke="currentColor" strokeWidth="1.5"/>
                      <line x1="4" y1="12" x2="8" y2="12" stroke="currentColor" strokeWidth="1.5"/>
                      <line x1="16" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.5"/>
                      <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                    </svg>
                    {Math.round(((token.total_sells_5m ?? 0) / Math.max(1, (token.total_buyers_5m ?? 0) + (token.total_sellers_5m ?? 0))) * 100)}%
                  </span>
                  
                  {/* Ghost percentage - Green */}
                  <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-all duration-200"
                        style={{ 
                          color: AX.aiGreen,
                          fontSize: '11px',
                          fontWeight: '500',
                          borderColor: 'rgba(107, 114, 128, 0.1)',
                          backgroundColor: 'transparent'
                        }}>
                    <RiGhostLine size={13} />
                    {Math.round(((token.total_buyers_5m ?? 0) / Math.max(1, (token.total_buyers_5m ?? 0) + (token.total_sellers_5m ?? 0))) * 100)}%
                  </span>
                  
                  {/* Three Dice percentage - Green */}
                  <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-all duration-200"
                        style={{ 
                          color: AX.aiGreen,
                          fontSize: '11px',
                          fontWeight: '500',
                          borderColor: 'rgba(107, 114, 128, 0.1)',
                          backgroundColor: 'transparent'
                        }}>
                    <FaDice size={13} />
                    {Math.round(((token.total_buyers_5m ?? 0) / Math.max(1, (token.total_buyers_5m ?? 0) + (token.total_sellers_5m ?? 0))) * 100)}%
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
      
      {/* Fixed positioned tooltips */}
      {memoizedTokens.map((token, idx) => (
        <>
          <div
            key={`copy-tooltip-${idx}`}
            id={`copy-tooltip-${idx}`}
            className="fixed px-2 py-1 rounded text-xs font-medium opacity-0 transition-opacity duration-200 pointer-events-none whitespace-nowrap"
            style={{ 
              zIndex: 99999,
              backgroundColor: AX.surface, 
              color: AX.text, 
              border: `1px solid ${AX.border}`,
              boxShadow: `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 0 8px ${AX.glowBlue}`,
              transform: 'translate(-50%, -100%)'
            }}
          >
            Copy Contract
            {/* Tooltip arrow */}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent"
                 style={{ borderTopColor: AX.surface }}></div>
          </div>
          
          <div
            key={`search-tooltip-${idx}`}
            id={`search-tooltip-${idx}`}
            className="fixed px-2 py-1 rounded text-xs font-medium opacity-0 transition-opacity duration-200 pointer-events-none whitespace-nowrap"
            style={{ 
              zIndex: 99999,
              backgroundColor: AX.surface, 
              color: AX.text, 
              border: `1px solid ${AX.border}`,
              boxShadow: `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 0 8px ${AX.glowCyan}`,
              transform: 'translate(-50%, -100%)'
            }}
          >
            Search on Twitter
            {/* Tooltip arrow */}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent"
                 style={{ borderTopColor: AX.surface }}></div>
          </div>
          
          <div
            key={`profile-tooltip-${idx}`}
            id={`profile-tooltip-${idx}`}
            className="fixed px-2 py-1 rounded text-xs font-medium opacity-0 transition-opacity duration-200 pointer-events-none whitespace-nowrap"
            style={{ 
              zIndex: 99999,
              backgroundColor: AX.surface, 
              color: AX.text, 
              border: `1px solid ${AX.border}`,
              boxShadow: `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 0 8px ${AX.glowBlue}`,
              transform: 'translate(-50%, -100%)'
            }}
          >
            View X Profile
            {/* Tooltip arrow */}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent"
                 style={{ borderTopColor: AX.surface }}></div>
          </div>
        </>
      ))}
      
      {/* Copy Success Toast */}
      {showToast && (
        <div 
          className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg transition-all duration-300 ease-out"
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

    </div>
  );
});

export default PulseTable;

