import React, { useState, useEffect, useRef, useMemo } from "react";
import type { Token } from "~/utils/db";
import { formatSmartNumber } from "~/utils/db";
import { HiLightningBolt } from "react-icons/hi";
import {
  FaUser,
  FaGlobe,
  FaSearch,
  FaCrown,
  FaRegCopy,
  FaBolt,
  FaCamera,
} from "react-icons/fa";

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

// Smart color system based on token properties (like Axiom)
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
}: {
  token: Token;
  priority?: boolean;
}) {
  const [showPreview, setShowPreview] = useState(false);
  
  // Use uri field from deployed service, fallback to image field, then token.logo
  const imageUrl = (token as any).uri || (token as any).image || token.logo;

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    console.log('Mouse enter - showing preview for:', token.symbol);
    setShowPreview(true);
    const target = e.currentTarget as HTMLDivElement;
    target.style.borderColor = AX.aiCyan;
    target.style.boxShadow = `0 0 12px ${AX.glowCyan}, 0 0 24px ${AX.glowCyan}`;
    target.style.transform = 'scale(1.08)';
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    console.log('Mouse leave - hiding preview for:', token.symbol);
    setShowPreview(false);
    const target = e.currentTarget as HTMLDivElement;
    target.style.borderColor = AX.border;
    target.style.boxShadow = 'none';
    target.style.transform = 'scale(1)';
  };

  return (
    <>
      <div className="relative h-20 w-20 overflow-hidden rounded-lg border-2 transition-all duration-300 ease-out"
           style={{ 
             backgroundColor: AX.surface, 
             borderColor: AX.border 
           }}>
        <div 
          className="h-full w-full"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
    <FastImage
      src={imageUrl}
      alt={token.name || token.symbol || ""}
      symbol={token.symbol}
      name={token.name}
            width={80}
            height={80}
            className="h-full w-full object-cover transition-all duration-300"
      priority={priority}
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

      {/* AI-styled Image Preview Window */}
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
              
              {/* AI-inspired border effects */}
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
    // Metrics
    minMarketCap: '',
    maxMarketCap: '',
    minVolume: '',
    maxVolume: '',
    minLiquidity: '',
    maxLiquidity: '',
    // Socials
    twitterFollowers: '',
    telegramMembers: '',
    discordMembers: '',
    // Sort
    sortBy: 'marketCap',
    sortOrder: 'desc'
  });
  const router = useRouter();

  // Protocol and quote token data with improved color scheme
  const protocols = [
    { name: 'Pump', icon: '💊', color: '#00ff88' },
    { name: 'Bonk', icon: '🔥', color: '#ff6b35' },
    { name: 'Bags', icon: '💰', color: '#00d4aa' },
    { name: 'Moonshot', icon: '🌙', color: '#a855f7' },
    { name: 'Heaven', icon: '☁️', color: '#8b5cf6' },
    { name: 'Daos.fun', icon: '👻', color: '#06b6d4' },
    { name: 'Candle', icon: '🕯️', color: '#f59e0b' },
    { name: 'Sugar', icon: '🍩', color: '#ec4899' },
    { name: 'Believe', icon: '🔄', color: '#10b981' },
    { name: 'Jupiter Studio', icon: '🌀', color: '#8b5cf6' },
    { name: 'Moonit', icon: '⬆️', color: '#fbbf24' },
    { name: 'Boop', icon: '🐱', color: '#3b82f6' },
    { name: 'LaunchLab', icon: '🚀', color: '#ef4444' },
    { name: 'Dynamic BC', icon: '📊', color: '#f97316' },
    { name: 'Raydium', icon: 'R', color: '#6b7280' },
    { name: 'Meteora AMM', icon: '☄️', color: '#92400e' },
    { name: 'Meteora AMM V2', icon: '☄️', color: '#a16207' },
    { name: 'Pump AMM', icon: '💊', color: '#64748b' },
    { name: 'Orca', icon: '🐋', color: '#0ea5e9' }
  ];

  const quoteTokens = [
    { name: 'SOL', icon: '📊', color: '#00ff88' },
    { name: 'USDC', icon: '$', color: '#06b6d4' },
    { name: 'USD1', icon: '1', color: '#fbbf24' }
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

  // Filter and sort tokens
  const filteredAndSortedTokens = useMemo(() => {
    let filtered = [...tokens];

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
  }, [tokens, filters]);

  // Memoize token rendering to prevent unnecessary re-renders
  const memoizedTokens = useMemo(() => filteredAndSortedTokens, [filteredAndSortedTokens]);

  const shortAddr = (token: any): string => {
    try {
      const a = token?.pair_address || token?.mint || token?.address || "";
      if (typeof a !== "string" || a.length < 8) return a || "-";
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
      className={`flex w-full min-w-[340px] flex-1 flex-col shadow-lg ${isFirstOrLast === "first" ? "border-r border-l" : "border-r"}`}
      style={{ 
        backgroundColor: AX.bg,
        borderColor: AX.border 
      }}
    >
      <div 
        className="mb-2 flex items-center justify-between border-t border-b p-2 text-lg font-bold"
        style={{ 
          backgroundColor: AX.surface, 
          borderColor: AX.border, 
          color: AX.text 
        }}
      >
        <span>{title}</span>
        
        {/* Filter Controls */}
        <div className="relative filter-dropdown">
          <button
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-300 ease-out"
            style={{
              backgroundColor: 'transparent',
              color: showFilters ? AX.aiBlue : AX.muted
            }}
            onMouseEnter={(e) => {
              if (!showFilters) {
                e.currentTarget.style.color = AX.aiBlue;
                e.currentTarget.style.boxShadow = `0 0 6px ${AX.glowBlue}`;
              }
            }}
            onMouseLeave={(e) => {
              if (!showFilters) {
                e.currentTarget.style.color = AX.muted;
                e.currentTarget.style.boxShadow = 'none';
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
          </button>
          
          {/* Comprehensive Filter Modal */}
          {showFilters && (
            <div 
              className="absolute top-full right-0 mt-2 w-96 rounded-lg shadow-xl border z-50"
              style={{
                backgroundColor: AX.surface,
                borderColor: AX.border,
                boxShadow: `0 8px 32px rgba(0, 0, 0, 0.3), 0 0 8px ${AX.glowBlue}`
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: AX.border }}>
                <h3 className="text-lg font-bold" style={{ color: AX.text }}>Filters</h3>
                <div className="flex items-center gap-2">
                  <button className="p-1 rounded hover:bg-gray-700 transition-colors">
                    <span className="text-sm">🔄</span>
                  </button>
                  <button 
                    onClick={() => setShowFilters(false)}
                    className="p-1 rounded hover:bg-gray-700 transition-colors"
                  >
                    <span className="text-sm">✕</span>
                  </button>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex border-b" style={{ borderColor: AX.border }}>
                {['New Pairs', 'Final Stretch', 'Migrated'].map((tab) => (
                  <button
                    key={tab}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
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

              <div className="p-6 max-h-96 overflow-y-auto" style={{ backgroundColor: AX.bg }}>
                {/* Protocols */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium" style={{ color: AX.text }}>Protocols</h4>
                    <button 
                      className="text-xs px-3 py-1 rounded-full font-medium transition-all duration-300 ease-out"
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
                  <div className="grid grid-cols-3 gap-2">
                    {protocols.map((protocol) => (
                      <button
                        key={protocol.name}
                        className="flex items-center gap-2 px-3 py-2 text-xs font-medium transition-all duration-300 ease-out"
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
                        <span className="text-sm">{protocol.icon}</span>
                        <span className="truncate font-semibold">{protocol.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quote Tokens */}
                <div className="mb-6">
                  <h4 className="text-sm font-medium mb-3" style={{ color: AX.text }}>Quote Tokens</h4>
                  <div className="flex gap-3">
                    {quoteTokens.map((token) => (
                      <button
                        key={token.name}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all duration-300 ease-out"
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
                        <span className="text-base">{token.icon}</span>
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
                    value={filters.searchKeywords}
                    onChange={(e) => setFilters(prev => ({ ...prev, searchKeywords: e.target.value }))}
                    className="w-full px-3 py-2 rounded border text-sm"
                    style={{
                      backgroundColor: AX.bg,
                      borderColor: AX.border,
                      color: AX.text
                    }}
                  />
                  <h4 className="text-sm font-medium mb-2 mt-3" style={{ color: AX.text }}>Exclude Keywords</h4>
                  <input
                    type="text"
                    placeholder="keyword1, keyword2..."
                    value={filters.excludeKeywords}
                    onChange={(e) => setFilters(prev => ({ ...prev, excludeKeywords: e.target.value }))}
                    className="w-full px-3 py-2 rounded border text-sm"
                    style={{
                      backgroundColor: AX.bg,
                      borderColor: AX.border,
                      color: AX.text
                    }}
                  />
                </div>

                {/* Category Tabs */}
                <div className="flex border-b mb-4" style={{ borderColor: AX.border }}>
                  {['Audit', '$ Metrics', 'Socials'].map((tab) => (
                    <button
                      key={tab}
                      className={`px-3 py-2 text-sm font-medium transition-colors ${
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
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="dexPaid"
                        checked={filters.dexPaid}
                        onChange={(e) => setFilters(prev => ({ ...prev, dexPaid: e.target.checked }))}
                        className="rounded"
                      />
                      <label htmlFor="dexPaid" className="text-sm" style={{ color: AX.text }}>Dex Paid</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="caEndsInPump"
                        checked={filters.caEndsInPump}
                        onChange={(e) => setFilters(prev => ({ ...prev, caEndsInPump: e.target.checked }))}
                        className="rounded"
                      />
                      <label htmlFor="caEndsInPump" className="text-sm" style={{ color: AX.text }}>CA ends in 'pump'</label>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Age</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filters.minAge}
                          onChange={(e) => setFilters(prev => ({ ...prev, minAge: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded border text-sm"
                          style={{
                            backgroundColor: AX.bg,
                            borderColor: AX.border,
                            color: AX.text
                          }}
                        />
                        <select
                          value={filters.ageUnit}
                          onChange={(e) => setFilters(prev => ({ ...prev, ageUnit: e.target.value }))}
                          className="px-2 py-2 rounded border text-sm"
                          style={{
                            backgroundColor: AX.bg,
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
                          className="flex-1 px-3 py-2 rounded border text-sm"
                          style={{
                            backgroundColor: AX.bg,
                            borderColor: AX.border,
                            color: AX.text
                          }}
                        />
                        <select
                          value={filters.ageUnit}
                          onChange={(e) => setFilters(prev => ({ ...prev, ageUnit: e.target.value }))}
                          className="px-2 py-2 rounded border text-sm"
                          style={{
                            backgroundColor: AX.bg,
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
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Top 10 Holders %</label>
                      <input
                        type="number"
                        placeholder="Enter percentage"
                        value={filters.top10HoldersPercent}
                        onChange={(e) => setFilters(prev => ({ ...prev, top10HoldersPercent: e.target.value }))}
                        className="w-full px-3 py-2 rounded border text-sm"
                        style={{
                          backgroundColor: AX.bg,
                          borderColor: AX.border,
                          color: AX.text
                        }}
                      />
                    </div>
                  </div>
                )}

                {activeCategoryTab === '$ Metrics' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Market Cap Range</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filters.minMarketCap}
                          onChange={(e) => setFilters(prev => ({ ...prev, minMarketCap: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded border text-sm"
                          style={{
                            backgroundColor: AX.bg,
                            borderColor: AX.border,
                            color: AX.text
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={filters.maxMarketCap}
                          onChange={(e) => setFilters(prev => ({ ...prev, maxMarketCap: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded border text-sm"
                          style={{
                            backgroundColor: AX.bg,
                            borderColor: AX.border,
                            color: AX.text
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Volume Range</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filters.minVolume}
                          onChange={(e) => setFilters(prev => ({ ...prev, minVolume: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded border text-sm"
                          style={{
                            backgroundColor: AX.bg,
                            borderColor: AX.border,
                            color: AX.text
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={filters.maxVolume}
                          onChange={(e) => setFilters(prev => ({ ...prev, maxVolume: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded border text-sm"
                          style={{
                            backgroundColor: AX.bg,
                            borderColor: AX.border,
                            color: AX.text
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Liquidity Range</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filters.minLiquidity}
                          onChange={(e) => setFilters(prev => ({ ...prev, minLiquidity: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded border text-sm"
                          style={{
                            backgroundColor: AX.bg,
                            borderColor: AX.border,
                            color: AX.text
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={filters.maxLiquidity}
                          onChange={(e) => setFilters(prev => ({ ...prev, maxLiquidity: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded border text-sm"
                          style={{
                            backgroundColor: AX.bg,
                            borderColor: AX.border,
                            color: AX.text
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {activeCategoryTab === 'Socials' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Twitter Followers</label>
                      <input
                        type="number"
                        placeholder="Min followers"
                        value={filters.twitterFollowers}
                        onChange={(e) => setFilters(prev => ({ ...prev, twitterFollowers: e.target.value }))}
                        className="w-full px-3 py-2 rounded border text-sm"
                        style={{
                          backgroundColor: AX.bg,
                          borderColor: AX.border,
                          color: AX.text
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Telegram Members</label>
                      <input
                        type="number"
                        placeholder="Min members"
                        value={filters.telegramMembers}
                        onChange={(e) => setFilters(prev => ({ ...prev, telegramMembers: e.target.value }))}
                        className="w-full px-3 py-2 rounded border text-sm"
                        style={{
                          backgroundColor: AX.bg,
                          borderColor: AX.border,
                          color: AX.text
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: AX.text }}>Discord Members</label>
                      <input
                        type="number"
                        placeholder="Min members"
                        value={filters.discordMembers}
                        onChange={(e) => setFilters(prev => ({ ...prev, discordMembers: e.target.value }))}
                        className="w-full px-3 py-2 rounded border text-sm"
                        style={{
                          backgroundColor: AX.bg,
                          borderColor: AX.border,
                          color: AX.text
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between p-4 border-t" style={{ borderColor: AX.border }}>
                <div className="flex gap-2">
                  <button className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                          style={{ backgroundColor: AX.border, color: AX.text }}>
                    Import
                  </button>
                  <button className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                          style={{ backgroundColor: AX.border, color: AX.text }}>
                    Export
                  </button>
                </div>
                <button 
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ease-out"
                  style={{
                    backgroundColor: AX.aiBlue,
                    color: '#000000'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#2563eb';
                    e.currentTarget.style.boxShadow = `0 0 8px ${AX.glowBlue}`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = AX.aiBlue;
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  onClick={() => {
                    // Apply filters logic here
                    setShowFilters(false);
                  }}
                >
                  Apply All
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="custom-scrollbar max-h-[70vh] overflow-y-scroll">
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
                className="group relative flex w-full cursor-pointer flex-row items-start gap-2 border-b p-2 transition-all duration-300 ease-out"
                style={{ 
                  borderColor: AX.border,
                  backgroundColor: 'transparent'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(30, 31, 38, 0.4)';
                  e.currentTarget.style.boxShadow = `0 0 8px ${AX.glowBlue}, 0 0 16px ${AX.glowBlue}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                onClick={handleTokenClick}
              >
                {/* Smooth AI Wave Effect - Dark Bluish Feel */}
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
                  className={`absolute left-1/2 z-20 hidden -translate-x-1/2 border px-3 py-1 text-sm shadow-xl group-hover:flex ${
                    idx === 0 ? "top-full mt-2" : "-top-7"
                  }`}
                  style={{ 
                    pointerEvents: "none",
                    backgroundColor: AX.surface,
                    borderColor: AX.border,
                    color: AX.text,
                    boxShadow: `0 4px 12px rgba(0, 0, 0, 0.3), 0 0 8px ${AX.glowBlue}`
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
                    />
                  <span className="mt-1 max-w-[60px] truncate font-mono text-xs" style={{ color: AX.muted }}>
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
                        <span className="truncate font-semibold text-sm" style={{ color: AX.text }}>
                          {token.symbol}
                        </span>
                        <span className="text-xs" style={{ color: AX.muted }}>
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
                          <FaRegCopy size={14} />
                        </button>
                      </div>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-sm" style={{ color: AX.aiGreen }}>
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
                                e.currentTarget.style.boxShadow = `0 0 6px ${AX.glowCyan}`;
                                const tooltip = e.currentTarget.nextElementSibling as HTMLElement;
                                if (tooltip) tooltip.style.opacity = '1';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = AX.muted;
                                e.currentTarget.style.boxShadow = 'none';
                                const tooltip = e.currentTarget.nextElementSibling as HTMLElement;
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
                              e.currentTarget.style.boxShadow = 'none';
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
                                e.currentTarget.style.boxShadow = 'none';
                                const tooltip = document.getElementById(`profile-tooltip-${idx}`) as HTMLElement;
                                if (tooltip) tooltip.style.opacity = '0';
                                // Don't hide popup immediately - let popup's onMouseLeave handle it
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
                                  {/* Profile Header - Twitter Style */}
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
                          
                          {/* Pump.fun Tooltip - only show for pump tokens */}
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
                          <SmartColor token={token} metricType="marketCap" className="text-lg">
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
                          V{" "}
                          <span 
                            className="text-sm"
                            style={{ 
                              color: '#ffffff',
                              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                              fontWeight: '400'
                            }}
                          >
                            <SmoothNumber
                              value={(token as any).volume_24h || 0}
                              formatter={(val) => `$${formatSmartNumber(val)}`}
                              duration={300}
                            />
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className="flex flex-row items-center gap-1" style={{ color: AX.muted }}>
                          TX{" "}
                          <span 
                            className="text-xs"
                            style={{ 
                              color: '#ffffff',
                              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                              fontWeight: '400'
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
                          <div className="flex flex-row">
                            <div
                              className={`h-0.5 w-[${(token.total_buys_5m / (token.total_buys_5m + token.total_sells_5m)) * 24}px] bg-emerald-300`}
                            ></div>
                            <div
                              className={`h-0.5 w-[${(token.total_sells_5m / (token.total_buys_5m + token.total_sells_5m)) * 24}px] bg-red-400`}
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
                        className="flex cursor-pointer items-center gap-1 rounded-full px-3 py-1 text-xs font-bold shadow transition-all duration-300 ease-out"
                        style={{ 
                          backgroundColor: AX.aiGreen, 
                          color: '#000000' 
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = AX.aiGreenHover;
                          e.currentTarget.style.boxShadow = `0 0 12px ${AX.glowGreen}, 0 0 24px ${AX.glowGreen}`;
                          e.currentTarget.style.transform = 'scale(1.05)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = AX.aiGreen;
                          e.currentTarget.style.boxShadow = 'none';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                      >
                        <HiLightningBolt className="text-black" size={18} /> 0
                        SOL
                      </button>
                    </div>
                  </div>
                  {/* Bottom Row: Badges & Buy Button */}
                  <div className="mt-1 flex flex-row items-center justify-between gap-2">
                    {showBubbleMetrics && (
                      <div className="flex gap-1">
                        {[
                          {
                            icon: <FaUser size={10} />,
                            label: "Buyers",
                            value: token.total_buyers_5m ?? 0,
                            color: "text-green-400",
                          },
                          {
                            icon: <FaCrown size={10} />,
                            label: "Sellers",
                            value: token.total_sellers_5m ?? 0,
                            color: "text-red-400",
                          },
                          {
                            icon: <FaSearch size={10} />,
                            label: "Wallets",
                            value: token.unique_wallets_5m ?? 0,
                            color: "text-blue-400",
                          },
                          {
                            icon: <FaUser size={10} />,
                            label: "24h TX",
                            value:
                              (token.total_buys_24h ?? 0) +
                              (token.total_sells_24h ?? 0),
                            color: "text-yellow-400",
                          },
                          {
                            icon: <FaUser size={10} />,
                            label: "Vol 24h",
                            value: Math.round(
                              (token.total_buy_volume_24h ?? 0) +
                                (token.total_sell_volume_24h ?? 0),
                            ),
                            color: "text-gray-400",
                          },
                        ].map((b, i) => (
                          <span
                            key={i}
                            className={`flex items-center gap-1 bg-neutral-800 ${b.color} rounded-full border border-neutral-700 px-2 py-0.5 text-[10px]`}
                          >
                            {b.icon}{" "}
                            <SmoothNumber value={b.value} duration={300} />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
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
          className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[99999] px-4 py-2 rounded-lg shadow-lg transition-all duration-300 ease-out"
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

