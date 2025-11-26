import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  FaQuestionCircle,
  FaRegStar,
  FaStar,
} from "react-icons/fa";
import { User, Globe, Search, Copy } from "lucide-react";
import { HiLightningBolt } from "react-icons/hi";
import InterstateButton from "./InterstateButton";
import Image from 'next/image';
import InterstateTooltip from './InterstateTooltip';
import CustomCheckbox from './CustomCheckbox';
import { useRouter } from "next/router";
import { useWatchlist } from "./WatchlistContext";
import { showEnhancedToast } from "~/utils/enhancedToast";
import { SolanaIcon } from './Footer';
import type { Token as BaseToken } from "~/utils/db";
import { formatSmartNumber, formatMarketCap } from '~/utils/db';
import SkeletonRow from './InterstateTable/SkeletonRow';
import { fetchTokenMetadata } from '~/utils/functions';
import { withImageFallback, extractMetaImage } from '~/utils/images';
import AvatarImage from '~/components/AvatarImage';
import { useFilter } from "./FilterContext";
import { getAmm } from "~/utils/amms";
import { copyToClipboard } from "~/utils/clipboard";

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

// Types
type Token = BaseToken & { dexPaid?: boolean; amm?: string };

export interface InterstateTableRow {
  token: Token;
  i: number;
}

interface InterstateTableProps {
  rows: InterstateTableRow[];
  onQuickBuy?: (token: Token) => void;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  setSort?: (key: string) => void;
  selectedTimeframe: '5m' | '1h' | '6h' | '24h';
  quickBuyAmount?: number | string;
  skeletonRowCount?: number;
  isDiscoverPage?: boolean;
}

interface HeaderConfig {
  key: string | null;
  label: string;
  align: 'left' | 'right' | 'center';
  width: string;
}

// Constants
const TABLE_HEADERS: HeaderConfig[] = [
  { key: 'name', label: 'Pair Info', align: 'left', width: 'w-80' },
  { key: 'fully_diluted_value', label: 'Market Cap', align: 'right', width: 'w-32' },
  { key: 'total_liquidity_usd', label: 'Liquidity', align: 'right', width: 'w-28' },
  { key: 'volume', label: 'Volume', align: 'right', width: 'w-28' },
  { key: 'txns', label: 'TXNS', align: 'right', width: 'w-24' },
  // { key: null, label: 'Token Info', align: 'center', width: 'w-24' },
  { key: null, label: 'Action', align: 'center', width: 'w-32' },
];

const TIME_LABELS = ['2h', '1d', '3d', '1h', '6h'];

// Utility Functions
const getTokenStat = (token: Token, stat: string, timeframe: string): number => {
  const key = `${stat}_${timeframe}`;
  let val = (token as any)[key];

  // Fallbacks for alternate backend naming (price_change_* instead of price_percent_change_*)
  if ((val === undefined || val === null) && stat === 'price_percent_change') {
    const altKey = `price_change_${timeframe}`;
    val = (token as any)[altKey];
  }

  const num = typeof val === 'number' ? val : parseFloat(val) || 0;

  // if (num === 0) {
  //   console.log('getTokenStat returning 0:', {
  //     stat,
  //     timeframe,
  //     key,
  //     rawValue: val,
  //     rawValueType: typeof val,
  //     tokenName: token.name
  //   });
  // }

  return num;
};

// Fallback helpers to accommodate different backend shapes
const getNumber = (obj: any, key: string): number => {
  const v = obj?.[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }
  return 0;
};

const getVolume = (token: Token, timeframe: string): number => {
  // Helper to get volume from a specific timeframe, including buy/sell calculation
  const getVolumeForTimeframe = (tf: string): number => {
    // First try direct volume field
    let vol = getNumber(token as any, `volume_${tf}`);
    
    // If 0, try calculating from buy/sell volumes
    if (vol === 0) {
      const buyVol = getNumber(token as any, `total_buy_volume_${tf}`);
      const sellVol = getNumber(token as any, `total_sell_volume_${tf}`);
      vol = buyVol + sellVol;
    }
    
    return vol;
  };
  
  // Try the requested timeframe first
  let volume = getVolumeForTimeframe(timeframe);
  
  // If still 0, try all other timeframes in order of preference
  if (volume === 0) {
    const timeframes = ['1h', '6h', '24h', '5m'];
    for (const tf of timeframes) {
      if (tf !== timeframe) {
        volume = getVolumeForTimeframe(tf);
        if (volume > 0) {
          // Found volume in another timeframe, use it
          break;
        }
      }
    }
  }
  
  // Last resort: if we have 24h volume, estimate for the requested timeframe
  if (volume === 0) {
    const vol24h = getVolumeForTimeframe('24h');
    if (vol24h > 0) {
      switch (timeframe) {
        case '5m': volume = vol24h / 288; break;
        case '1h': volume = vol24h / 24; break;
        case '6h': volume = vol24h / 4; break;
        case '24h': volume = vol24h; break;
      }
    }
  }
  
  return volume;
};

const getTxns = (token: Token, timeframe: string): { total: number; buys: number; sells: number } => {
  // Try the specific timeframe first
  let buys = getNumber(token as any, `total_buys_${timeframe}`);
  let sells = getNumber(token as any, `total_sells_${timeframe}`);
  
  if (buys > 0 || sells > 0) {
    return { total: buys + sells, buys, sells };
  }
  
  // Fallback 1: try txnCount for the specific timeframe (split proportionally)
  const txnCount = getNumber(token as any, `txnCount${timeframe}`);
  if (txnCount > 0) {
    // Estimate: 60% buys, 40% sells (common pattern)
    const estimatedBuys = Math.round(txnCount * 0.6);
    const estimatedSells = Math.round(txnCount * 0.4);
    return { total: txnCount, buys: estimatedBuys, sells: estimatedSells };
  }
  
  // Fallback 2: try 24h data if specific timeframe doesn't have data
  if (timeframe !== '24h') {
    const buys24h = getNumber(token as any, 'total_buys_24h');
    const sells24h = getNumber(token as any, 'total_sells_24h');
    if (buys24h > 0 || sells24h > 0) {
      return { total: buys24h + sells24h, buys: buys24h, sells: sells24h };
    }
    
    // Also try txnCount24h as fallback
    const txnCount24h = getNumber(token as any, 'txnCount24h') || getNumber(token as any, 'txnCount24');
    if (txnCount24h > 0) {
      const estimatedBuys = Math.round(txnCount24h * 0.6);
      const estimatedSells = Math.round(txnCount24h * 0.4);
      return { total: txnCount24h, buys: estimatedBuys, sells: estimatedSells };
    }
  }
  
  // Fallback 3: try other timeframes in order of preference (24h, 12h, 6h, 1h, 5m)
  const fallbackTimeframes = ['24h', '12h', '6h', '1h', '5m'].filter(tf => tf !== timeframe);
  for (const tf of fallbackTimeframes) {
    const fallbackBuys = getNumber(token as any, `total_buys_${tf}`);
    const fallbackSells = getNumber(token as any, `total_sells_${tf}`);
    if (fallbackBuys > 0 || fallbackSells > 0) {
      return { total: fallbackBuys + fallbackSells, buys: fallbackBuys, sells: fallbackSells };
    }
    
    // Also try txnCount for this timeframe
    const fallbackTxnCount = getNumber(token as any, `txnCount${tf}`);
    if (fallbackTxnCount > 0) {
      const estimatedBuys = Math.round(fallbackTxnCount * 0.6);
      const estimatedSells = Math.round(fallbackTxnCount * 0.4);
      return { total: fallbackTxnCount, buys: estimatedBuys, sells: estimatedSells };
    }
  }
  
  // If no data available, return zeros; UI will render "-" appropriately
  return { total: 0, buys: 0, sells: 0 };
};

const formatPercentChange = (val: number): string => {
  if (val === 0) return '0.00';
  return (val > 0 ? '+' : '') + formatSmartNumber(Math.abs(val));
};

const getSortableValue = (token: Token, key: string, selectedTimeframe?: string): number => {
  // Handle volume calculation for sorting
  if (key === 'volume' && selectedTimeframe) {
    return getVolume(token, selectedTimeframe);
  }
  
  // Handle TXNS calculation for sorting
  if (key === 'txns' && selectedTimeframe) {
    const buys = getTokenStat(token, 'total_buys', selectedTimeframe);
    const sells = getTokenStat(token, 'total_sells', selectedTimeframe);
    return buys + sells;
  }
  
  // Handle Market Cap sorting - use fully_diluted_value if available, otherwise fallback to usd_price
  if (key === 'fully_diluted_value') {
    let val = (token as any).fully_diluted_value;
    if (val === undefined || val === null) {
      val = token.usd_price; // fallback to price if market cap not available
    }
    if (typeof val === 'string') {
      val = val.replace(/[$,\s]/g, '');
    }
    const num = parseFloat(val);
    return isNaN(num) ? -Infinity : num;
  }
  
  let val = (token as any)[key];
  if (typeof val === 'string') {
    val = val.replace(/[$,\s]/g, '');
  }
  const num = parseFloat(val);
  return isNaN(num) ? -Infinity : num;
};

// Token Metadata Hook
const tokenMetadataCache: Record<string, any> = {};

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
    }).catch((error) => {
      // Silently handle errors to prevent runtime crashes
      console.warn('Failed to fetch token metadata:', error.message);
      if (!cancelled) {
        setLoading(false);
        setMeta(null);
      }
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [uri]);
  
  return { meta, loading, showInitial };
}

// Table Header Component
const TableHeader: React.FC<{
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  isDiscoverPage?: boolean;
  isTrending?: boolean; // New prop to indicate if showing trending/Birdeye data
}> = ({ sortKey, sortDirection, onSort, isDiscoverPage = false, isTrending = false }) => (
  <thead>
    <tr style={{ backgroundColor: 'transparent', borderBottom: `1px solid ${AX.border}` }}>
      {TABLE_HEADERS.map((header, idx) => {
        // Use "Rank" instead of "TXNS" for trending filter
        const label = (header.key === 'txns' && isTrending) ? 'Rank' : header.label;
        return (
          <th
            key={idx}
            className={`${header.width} px-4 ${isDiscoverPage ? 'py-2' : 'py-4'} text-${header.align} ${isDiscoverPage ? 'text-[10px]' : 'text-xs'} font-medium tracking-wide uppercase ${
              header.key ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''
            }`}
            style={{ color: '#787a8d', fontWeight: '300' }}
            onClick={header.key && onSort ? () => onSort(header.key!) : undefined}
          >
            {label}
            {header.key && sortKey === header.key && (
              <span className="ml-1">{sortDirection === 'asc' ? '▲' : '▼'}</span>
            )}
          </th>
        );
      })}
    </tr>
  </thead>
);

// Token Avatar Component
const TokenAvatar: React.FC<{
  token: Token;
  meta: any;
  loading: boolean;
  showInitial: boolean;
}> = ({ token, meta, loading, showInitial }) => {
  const initial = token.name?.charAt(0)?.toUpperCase() || '?';
  
  // Protocol color mapping - matches PulseTable
  const protocolColorMap: Record<string, string> = {
    'pump': '#22c55e',
    'pump.fun': '#22c55e',
    'bonk': '#ff6b35',
    'bags': '#22c55e',
    'moonshot': '#eab308',
    'moonshoot': '#eab308',
    'moonit': '#eab308',
    'heaven': '#8b5cf6',
    'daos.fun': '#06b6d4',
    'candle': '#f59e0b',
    'sugar': '#ec4899',
    'believe': '#10b981',
    'jupiter': '#8b5cf6',
    'boop': '#134577',
    'boopfun': '#134577',
    'launchlab': '#3b82f6',
    'dynamic': '#526fff',
    'raydium': '#5c51f7',
    'raydiumlaunchpad': '#5c51f7',
    'meteora': '#ff4662',
    'meteora_v2': '#ff4662',
    'pump_amm': '#e9ba14',
    'orca': '#0ea5e9'
  };

  // Get protocol color based on launchpad_protocol field
  const getProtocolColor = (token: Token): string => {
    const launchpadProtocol = (token as any).launchpad_protocol?.toLowerCase();
    
    if (!launchpadProtocol) return '#22c55e';
    
    if (protocolColorMap[launchpadProtocol]) return protocolColorMap[launchpadProtocol];
    if (launchpadProtocol.includes('pump')) return '#22c55e';
    if (launchpadProtocol.includes('meteora')) return '#ff4662';
    if (launchpadProtocol.includes('raydium')) return '#5c51f7';
    if (launchpadProtocol.includes('moonit') || launchpadProtocol.includes('moonshot')) return '#eab308';
    if (launchpadProtocol.includes('boop')) return '#134577';
    if (launchpadProtocol.includes('bonk')) return '#ff6b35';
    if (launchpadProtocol.includes('bags')) return '#22c55e';
    
    return '#22c55e';
  };

  // Get icon based on token data
  const getTokenIcon = (token: Token): string => {
    const launchpadProtocol = (token as any).launchpad_protocol?.toLowerCase();
    
    if (!launchpadProtocol) return 'https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png';
    if (launchpadProtocol.includes('pump')) return 'https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png';
    if (launchpadProtocol.includes('meteora')) return 'https://s1.coincarp.com/logo/1/meteora.png?style=72&v=1759911013';
    if (launchpadProtocol.includes('raydium')) return 'https://s2.coinmarketcap.com/static/img/coins/64x64/8526.png';
    if (launchpadProtocol.includes('boop')) return 'https://api.phantom.app/image-proxy/?image=https%3A%2F%2Fdhc7eusqrdwa0.cloudfront.net%2Fassets%2FBOOP_logo_icon_dark_bg.png&anim=true';
    if (launchpadProtocol.includes('moonit') || launchpadProtocol.includes('moonshot')) return 'https://avatars.githubusercontent.com/u/174132191?s=280&v=4';
    if (launchpadProtocol.includes('bonk')) return 'https://s3.coinmarketcap.com/static-gravity/image/a28128d9ff7c49c9ad33ee2f626fda40.png';
    if (launchpadProtocol.includes('bags')) return 'https://play-lh.googleusercontent.com/7AxVcu1pumxavcGTb16WBJQU88CDZd0v8q0WzFwfin7zbBvItYMuNQ0Xkqq4srTw4A=w240-h480-rw';
    
    return 'https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png';
  };

  const imageUrl = (token as any).uri || (token as any).image || token.logo;

  return (
    <div className="relative h-12 w-12 flex items-center justify-center">
      {/* Image container - circular */}
      <div className="relative rounded-full overflow-hidden" style={{ width: '48px', height: '48px' }}>
        {loading && !showInitial ? (
          <div className="w-full h-full flex items-center justify-center rounded-full" style={{ backgroundColor: AX.surface2 }}>
            <div className="w-6 h-6 border-2 border-t-2 border-b-2 border-yellow-400 rounded-full animate-spin"></div>
          </div>
        ) : meta || imageUrl ? (
          <img
            src={extractMetaImage(meta) || imageUrl || token.logo || ''}
            alt={token.name || token.symbol || ''}
            width={48}
            height={48}
            className="h-full w-full object-cover rounded-full transition-all duration-300"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center rounded-full" style={{ backgroundColor: AX.surface2, width: '48px', height: '48px' }}>
            <span className="text-sm font-bold" style={{ color: AX.text }}>{initial}</span>
          </div>
        )}
      </div>
      
      {/* Solana logo bubble - positioned at bottom right */}
      <div className="absolute bottom-0 right-0 bg-white rounded-full flex items-center justify-center transform translate-x-1/2 translate-y-1/2 z-10"
           style={{ 
             width: 14, 
             height: 14,
             padding: '1px'
           }}>
        <SolanaIcon size={12} />
      </div>
    </div>
  );
};

// Token Info Component
const TokenInfo: React.FC<{ 
  token: Token; 
  i: number; 
  sortedRows: InterstateTableRow[];
  isDiscoverPage?: boolean;
}> = ({ token, i, sortedRows, isDiscoverPage = false }) => {
  const { meta, loading, showInitial } = useTokenMetadata(token.uri);
  const timeLabel = TIME_LABELS[i % TIME_LABELS.length];
  const [showXPreview, setShowXPreview] = useState(false);
  const [buttonPosition, setButtonPosition] = useState<{left: number, top: number} | null>(null);
  
  // Watchlist functionality
  const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlist();
  const tokenAddress = token.pair_address || token.mint || '';
  const isWatched = isInWatchlist(tokenAddress);
  
  const handleWatchlistClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isWatched) {
      removeFromWatchlist(tokenAddress);
      showEnhancedToast('info', 'Removed from watchlist');
    } else {
      addToWatchlist(token);
      showEnhancedToast('success', 'Added to watchlist');
    }
  }, [isWatched, tokenAddress, token, addToWatchlist, removeFromWatchlist]);
  
  // Calculate actual token age for discover page
  const getTokenAge = useCallback(() => {
    if (!isDiscoverPage) return timeLabel;
    
    try {
      const createdAt = (token as any).created_at || (token as any).launch_time;
      if (!createdAt) return '-';
      
      let timestamp: number | null = null;
      if (typeof createdAt === 'string') {
        const parsed = Date.parse(createdAt);
        if (!isNaN(parsed)) timestamp = parsed;
      } else if (typeof createdAt === 'number') {
        // Heuristic: treat 13-digit as ms, 10-digit as seconds
        if (createdAt > 1e12) timestamp = createdAt;
        else if (createdAt > 1e9) timestamp = createdAt * 1000;
      }
      
      if (!timestamp) return '-';
      
      const ageMs = Date.now() - timestamp;
      const ageHours = ageMs / (1000 * 60 * 60);
      
      if (ageHours < 1) {
        const ageMins = Math.floor(ageMs / (1000 * 60));
        return ageMins < 1 ? '<1m' : `${ageMins}m`;
      } else if (ageHours < 24) {
        return `${Math.floor(ageHours)}h`;
      } else {
        return `${Math.floor(ageHours / 24)}d`;
      }
    } catch {
      return '-';
    }
  }, [token, isDiscoverPage, timeLabel]);
  
  const tokenAge = getTokenAge();
  
  // Calculate age color for discover page
  const getAgeColor = useCallback(() => {
    if (!isDiscoverPage) return '#85d99f';
    
    try {
      const createdAt = (token as any).created_at || (token as any).launch_time;
      if (!createdAt) return '#85d99f';
      
      let timestamp: number | null = null;
      if (typeof createdAt === 'string') {
        const parsed = Date.parse(createdAt);
        if (!isNaN(parsed)) timestamp = parsed;
      } else if (typeof createdAt === 'number') {
        if (createdAt > 1e12) timestamp = createdAt;
        else if (createdAt > 1e9) timestamp = createdAt * 1000;
      }
      
      if (!timestamp) return '#85d99f';
      
      const ageMs = Date.now() - timestamp;
      const ageHours = ageMs / (1000 * 60 * 60);
      
      return ageHours < 1 ? '#f2c367' : '#f26681';
    } catch {
      return '#85d99f';
    }
  }, [token, isDiscoverPage]);
  
  const ageColor = getAgeColor();

  // const similarTokens = useMemo(() => 
  //   sortedRows
  //     .filter(row => row.token.pair_address !== token.pair_address)
  //     .sort((a, b) => {
  //       const diffA = Math.abs(a.token.fully_diluted_value - token.fully_diluted_value);
  //       const diffB = Math.abs(b.token.fully_diluted_value - token.fully_diluted_value);
  //       return diffA - diffB;
  //     })
  //     .slice(0, 2), 
  //   [token, sortedRows]
  // );

  const tooltipContent = (
    <div className="p-3 min-w-[240px]">
      <div className="mb-3 flex justify-center">
        <TokenAvatar token={token} meta={meta} loading={loading} showInitial={showInitial} />
      </div>
      <div className="mb-3 text-center">
        <div className="text-lg font-bold mb-1" style={{ color: AX.text }}>{token.name}</div>
        <div className="text-sm font-medium mb-2" style={{ color: AX.muted }}>({token.symbol})</div>
        <p className="text-base font-semibold" style={{ color: AX.text }}>
          $<SubscriptNumber value={token.usd_price} />{' '}
          <span className={`text-sm ${isDiscoverPage ? '' : (token.price_percent_change_1h >= 0 ? 'text-emerald-400' : 'text-red-400')}`} style={isDiscoverPage ? { color: token.price_percent_change_1h >= 0 ? '#85d99f' : '#f26681' } : {}}>
            {formatPercentChange(token.price_percent_change_1h)}%
          </span>
        </p>
      </div>
      {/* {similarTokens.length > 0 && (
        <div className="border-t border-neutral-700 pt-2">
          <p className="mb-2 text-xs font-semibold text-neutral-300">Similar Tokens:</p>
          <div className="space-y-1">
            {similarTokens.map((similarTokenRow, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <div className="w-6 h-6 rounded bg-neutral-700 flex-shrink-0"></div>
                <span className="text-neutral-300 truncate flex-1">
                  {similarTokenRow.token.name}
                </span>
                <span className="text-neutral-500 text-[10px]">
                  {similarTokenRow.token.created_at 
                    ? `${Math.floor((Date.now() - new Date(similarTokenRow.token.created_at).getTime()) / (1000 * 60 * 60 * 24))}d` 
                    : '-'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )} */}
    </div>
  );

  return (
    <div className="flex items-center gap-2">
      {/* Watchlist button */}
      <button
        onClick={handleWatchlistClick}
        className="flex items-center justify-center transition-colors duration-200 cursor-pointer hover:opacity-80"
        style={{ color: isWatched ? '#f2c367' : AX.muted }}
        title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = isWatched ? '#f2c367' : '#73c5ff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = isWatched ? '#f2c367' : AX.muted;
        }}
      >
        {isWatched ? <FaStar className="w-5 h-5" /> : <FaRegStar className="w-5 h-5" />}
      </button>
      
      <InterstateTooltip
        width={undefined}
        height={undefined}
        xOffset="ml-0"
        label={tooltipContent}
        className="bg-neutral-900/100"
      >
        <TokenAvatar token={token} meta={meta} loading={loading} showInitial={showInitial} />
      </InterstateTooltip>
      
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="truncate text-sm font-bold" style={{ color: AX.text }}>
            {token.name}
          </span>
          <span className="truncate text-xs font-medium" style={{ color: AX.muted }}>
            {token.symbol}
          </span>
          {/* Copy contract button */}
          <button
            className="transition-colors duration-200 cursor-pointer hover:opacity-80"
            style={{ color: AX.muted }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = AX.aiCyan;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = AX.muted;
            }}
            onClick={(e) => {
              e.stopPropagation();
              const contractAddress = token.mint || token.pair_address;
              copyToClipboard(contractAddress, "Contract address copied to clipboard!");
            }}
            title="Copy contract address"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          <span className={`text-xs ${isDiscoverPage ? 'number-font' : 'text-emerald-400'}`} style={{ color: isDiscoverPage ? ageColor : undefined, fontWeight: isDiscoverPage ? 700 : 400, ...(isDiscoverPage ? {} : { fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }) }}>
            {tokenAge}
          </span>
          <div className="flex items-center gap-1.5 text-sky-400">
            {/* User icon - Twitter profile */}
            <button
              className="transition-colors duration-200 cursor-pointer hover:text-blue-400"
              style={{ color: isDiscoverPage ? '#73c5ff' : AX.muted }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = isDiscoverPage ? '#73c5ff' : AX.aiBlue;
                // Show X profile preview
                setShowXPreview(true);
                // Store button position for popup positioning
                const buttonRect = e.currentTarget.getBoundingClientRect();
                const screenWidth = window.innerWidth;
                const screenHeight = window.innerHeight;
                
                // Calculate optimal position
                let left = buttonRect.left + buttonRect.width / 2;
                let top = buttonRect.top - 20;
                
                // Check if there's enough space above (popup height is ~280px)
                if (top < 50 || (top - 280) < 0) {
                  top = buttonRect.bottom + 20;
                  // If showing below, check if it would go off bottom of screen
                  if (top + 280 > screenHeight) {
                    top = screenHeight - 300; // Position near top of screen
                  }
                }
                
                // Ensure popup doesn't go off screen horizontally
                if (left < 140) left = 140;
                if (left > screenWidth - 140) left = screenWidth - 140;
                
                setButtonPosition({ left, top });
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = isDiscoverPage ? '#73c5ff' : AX.muted;
                setShowXPreview(false);
              }}
              onClick={(e) => {
                e.stopPropagation();
                const profileUrl = `https://twitter.com/${token.symbol?.toLowerCase() || 'search'}`;
                window.open(profileUrl, '_blank');
              }}
              title="View Twitter profile"
            >
              <User className="w-3 h-3" strokeWidth={2.5} />
            </button>

            {/* Globe icon - Block explorer / Website */}
            <button
              className="transition-colors duration-200 cursor-pointer hover:text-cyan-400"
              style={{ color: AX.muted }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = AX.aiCyan;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = AX.muted;
              }}
              onClick={(e) => {
                e.stopPropagation();
                // Open token on Solscan
                const explorerUrl = `https://solscan.io/token/${token.mint}`;
                window.open(explorerUrl, '_blank');
              }}
              title="View on Solscan"
            >
              <Globe className="w-3 h-3" />
            </button>

            {/* Search icon - Twitter search */}
            <button
              className={`transition-colors duration-200 cursor-pointer ${isDiscoverPage ? '' : 'hover:text-emerald-400'}`}
              style={{ color: AX.muted }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = isDiscoverPage ? '#85d99f' : AX.aiCyan;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = AX.muted;
              }}
              onClick={(e) => {
                e.stopPropagation();
                const searchQuery = `${token.symbol} ${token.name}`.trim();
                const twitterUrl = `https://twitter.com/search?q=${encodeURIComponent(searchQuery)}`;
                window.open(twitterUrl, '_blank');
              }}
              title="Search on Twitter"
            >
              <Search className="w-3 h-3" />
            </button>

            {/* Copy icon */}
            <button
              className="transition-colors duration-200 cursor-pointer hover:text-sky-300"
              style={{ color: AX.muted }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = AX.aiCyan;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = AX.muted;
              }}
              onClick={(e) => {
                e.stopPropagation();
                copyToClipboard(token.pair_address, "Token address copied to clipboard!");
              }}
              title="Copy token address"
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>
          {i === 1 && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-red-600">
              <path d="M23.498 6.186c-.197-.74-.777-1.32-1.517-1.517C20.34 4.333 12 4.333 12 4.333s-8.34 0-9.981.336c-.74.197-1.32.777-1.517 1.517C.166 7.827.166 12 .166 12s0 4.173.336 5.814c.197.74.777 1.32 1.517 1.517C3.66 19.667 12 19.667 12 19.667s8.34 0 9.981-.336c.74-.197 1.32-.777 1.517-1.517.336-1.641.336-5.814.336-5.814s0-4.173-.336-5.814zM9.797 15.568V8.432l6.568 3.568-6.568 3.568z" />
            </svg>
          )}
        </div>
      </div>

      {/* X Profile Preview Popup */}
      {showXPreview && buttonPosition && (
        <div 
          className="fixed"
          style={{
            left: `${buttonPosition.left}px`,
            top: `${buttonPosition.top}px`,
            transform: 'translate(-50%, 0)',
            width: '280px',
            zIndex: 999999
          }}
          onMouseEnter={() => {
            // Keep popup open when hovering over it
          }}
          onMouseLeave={() => {
            // Hide popup when leaving the popup area
            setShowXPreview(false);
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
                <div className={`w-2 h-2 rounded-full ${isDiscoverPage ? '' : 'bg-green-500'}`} style={isDiscoverPage ? { backgroundColor: '#85d99f' } : {}}></div>
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
          </div>
        </div>
      )}
    </div>
  );
};

interface SubscriptNumberProps {
  value: number | string | null | undefined;
  className?: string;
}

export const SubscriptNumber: React.FC<SubscriptNumberProps> = ({ value, className }) => {
  const MAX_ZEROES = 2;

  const toNumber = (val: number | string | null | undefined): number | null => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const cleaned = val.replace(/[$,\s]/g, '');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  };

  const formatNumber = (num: number) => {
    const numStr = num.toFixed(20);
    const [integerPart, decimalPart = ''] = numStr.split('.');
    const leadingZeros = decimalPart.match(/^0*/)?.[0] || '';
    const originalZeroCount = leadingZeros.length;
    const zeroCount = Math.max(0, originalZeroCount - 1); // Subtract 1 from zero count
    const sigDigitsStart = leadingZeros.length;

    const firstDigit = decimalPart[sigDigitsStart] || '0';
    const secondDigit = decimalPart[sigDigitsStart + 1] || '0';
    const roundingDigit = decimalPart[sigDigitsStart + 2] || '0';

    const roundedSecondDigit = parseInt(roundingDigit) >= 5
      ? (parseInt(secondDigit) + 1).toString()
      : secondDigit;

    let finalDigits;
    if (roundedSecondDigit === '10') {
      finalDigits = (parseInt(firstDigit) + 1).toString() + '0';
    } else {
      finalDigits = firstDigit + roundedSecondDigit;
    }

    // Formatting logic with new rules:
    if (originalZeroCount > MAX_ZEROES) {
      return (
        <span className={className}>
          0.0<sub>{zeroCount}</sub>{finalDigits}
        </span>
      );
    } else if (originalZeroCount > 0) {
      // 1-MAX_ZEROES zeros: show all zeros without subscript
      const zeros = '0'.repeat(originalZeroCount);
      return (
        <span className={className}>
          0.{zeros}{finalDigits}
        </span>
      );
    } else {
      // No leading zeros
      return (
        <span className={className}>
          {integerPart}.{decimalPart.substring(0, 2)}
        </span>
      );
    }
  };

  const num = toNumber(value);
  if (num === null || !isFinite(num)) {
    return <span className={className}>-</span>;
  }
  if (num === 0) {
    return <span className={className}>0.00</span>;
  }

  return formatNumber(num);
};

// Market Cap Cell Component
const MarketCapCell: React.FC<{
  token: Token;
  selectedTimeframe: string;
  animationState: Record<string, 'up' | 'down' | null>;
  isDiscoverPage?: boolean;
}> = ({ token, selectedTimeframe, animationState, isDiscoverPage = false }) => {
  const percentChange = getTokenStat(token, 'price_percent_change', selectedTimeframe);
  const percentFieldKey = `${token.pair_address}-price_percent_change_${selectedTimeframe}`;
  const isPositive = percentChange >= 0;

  // Calculate market cap color for discover page
  const marketCap = token.fully_diluted_value || 0;
  let marketCapColor = AX.text;
  if (isDiscoverPage) {
    if (marketCap > 100000) {
      marketCapColor = '#f2c367';
    } else if (marketCap > 40000) {
      marketCapColor = '#73c5ff';
    } else {
      marketCapColor = '#85d99f';
    }
  }

  // Debug logging for MarketCapCell
  // console.log('MarketCapCell Debug:', {
  //   tokenName: token.name,
  //   fullyDilutedValue: token.fully_diluted_value,
  //   fullyDilutedValueType: typeof token.fully_diluted_value,
  //   usdPrice: token.usd_price,
  //   usdPriceType: typeof token.usd_price,
  //   token: token
  // });

  return (
    <div className="text-right">
      <div className={`text-sm font-semibold ${isDiscoverPage ? 'number-font' : ''}`} style={{ 
        color: isDiscoverPage ? marketCapColor : AX.text,
        ...(isDiscoverPage ? {} : {
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
          fontWeight: '400'
        })
      }}>
        {(() => {
          // console.log('MarketCapCell formatSmartNumber call with:', token.fully_diluted_value);
          return `$${formatMarketCap(token.fully_diluted_value)}`;
        })()}
      </div>
      {/* Commented out percentage display per user request */}
      {/* <div
        className={`text-xs font-semibold ${
          isPositive ? "text-emerald-400" : "text-red-400"
        } ${
          animationState[percentFieldKey] === 'up' ? 'price-animate-up' : 
          animationState[percentFieldKey] === 'down' ? 'price-animate-down' : ''
        }`}
      >
        {formatPercentChange(percentChange)}%
      </div> */}
    </div>
  );
};

// TXNS Cell Component
const TxnsCell: React.FC<{
  token: Token;
  selectedTimeframe: string;
  isDiscoverPage?: boolean;
}> = ({ token, selectedTimeframe, isDiscoverPage = false }) => {
  // Check if this is a Birdeye token (has rank)
  const birdeyeRank = (token as any).birdeye_rank || (token as any).rank;
  const volumeChangePercent = (token as any).volume24hChangePercent;
  
  const monospaceFont = 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace';
  
  // For Birdeye tokens, show rank and volume change % instead of transaction counts
  if (birdeyeRank && birdeyeRank > 0) {
    const formatPercentChange = (val: number | null | undefined): string => {
      if (val == null) return '';
      const sign = val > 0 ? '+' : '';
      return sign + formatSmartNumber(val);
    };
    
    return (
      <div className="text-right">
        <div className={`text-sm font-medium mb-1 ${isDiscoverPage ? 'number-font' : ''}`} style={{ 
          color: AX.text,
          ...(isDiscoverPage ? {} : {
            fontFamily: monospaceFont,
            fontWeight: '400'
          })
        }}>
          #{birdeyeRank}
        </div>
        {volumeChangePercent != null && (
          <div className={`text-xs font-medium ${isDiscoverPage ? 'number-font' : ''}`} style={{
            color: volumeChangePercent >= 0 ? (isDiscoverPage ? '#85d99f' : '#10b981') : (isDiscoverPage ? '#f26681' : '#ef4444'),
            ...(isDiscoverPage ? {} : {
              fontFamily: monospaceFont,
              fontWeight: '400'
            })
          }}>
            {formatPercentChange(volumeChangePercent)}% vol
          </div>
        )}
      </div>
    );
  }
  
  // Default: show transaction counts for non-Birdeye tokens
  const { total, buys, sells } = getTxns(token, selectedTimeframe);
  
  // For discover page (xStocks), show "0" instead of "-" when value is 0
  const formatTxnValue = (value: number) => {
    if (value === 0) {
      return isDiscoverPage ? '0' : '-';
    }
    return formatSmartNumber(value);
  };
  
  return (
    <div className="text-right">
      <div className={`text-sm font-medium mb-1 ${isDiscoverPage ? 'number-font' : ''}`} style={{ 
        color: AX.text,
        ...(isDiscoverPage ? {} : {
          fontFamily: monospaceFont,
          fontWeight: '400'
        })
      }}>
        {formatTxnValue(total)}
      </div>
      <div className="text-xs font-medium">
        <span className={`${isDiscoverPage ? '' : 'text-emerald-400'} ${isDiscoverPage ? 'number-font' : ''}`} style={isDiscoverPage ? { color: '#85d99f', fontFamily: monospaceFont, fontWeight: '400' } : { fontFamily: monospaceFont, fontWeight: '400' }}>
          {formatTxnValue(buys)}
        </span>
        <span className="mx-1" style={{ color: AX.muted }}>/</span>
        <span className={`${isDiscoverPage ? '' : 'text-red-400'} ${isDiscoverPage ? 'number-font' : ''}`} style={isDiscoverPage ? { color: '#f26681', fontFamily: monospaceFont, fontWeight: '400' } : { fontFamily: monospaceFont, fontWeight: '400' }}>
          {formatTxnValue(sells)}
        </span>
      </div>
    </div>
  );
};

// Audit Log Cell Component
const AuditLogCell: React.FC<{
  token: Token;
  selectedTimeframe: string;
  isDiscoverPage?: boolean;
}> = ({ token, selectedTimeframe, isDiscoverPage = false }) => {
  const percentChange = getTokenStat(token, 'price_percent_change', selectedTimeframe);

  const buyCount = (token as any)[`total_buys_${selectedTimeframe}`] || 0;
  const sellCount = (token as any)[`total_sells_${selectedTimeframe}`] || 0;

  const monospaceFont = 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace';
  
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1">
        <span className={`w-2 h-2 rounded-full ${isDiscoverPage ? '' : (percentChange >= 0 ? 'bg-emerald-400' : 'bg-red-400')}`} style={isDiscoverPage ? { backgroundColor: percentChange >= 0 ? '#85d99f' : '#f26681' } : {}}></span>
        <span className={`text-xs font-medium ${isDiscoverPage ? 'number-font' : ''}`} style={{ 
          color: AX.text,
          ...(isDiscoverPage ? {} : {
            fontFamily: monospaceFont,
            fontWeight: '400'
          })
        }}>
          {Math.abs(percentChange).toFixed(2)}%
        </span>
      </div>
      <div className="flex gap-2 text-xs" style={{ color: AX.muted }}>
        <span className={isDiscoverPage ? 'number-font' : ''} style={isDiscoverPage ? {} : { fontFamily: monospaceFont, fontWeight: '400' }}>
          B: {formatSmartNumber(buyCount)}
        </span>
        <span className={isDiscoverPage ? 'number-font' : ''} style={isDiscoverPage ? {} : { fontFamily: monospaceFont, fontWeight: '400' }}>
          S: {formatSmartNumber(sellCount)}
        </span>
      </div>
    </div>
  );
};

// Table Row Component
const TableRow: React.FC<{
  token: Token;
  i: number;
  selectedTimeframe: string;
  onQuickBuy?: (token: Token) => void;
  quickBuyAmount: number | string;
  animationState: Record<string, 'up' | 'down' | null>;
  sortedRows: InterstateTableRow[];
  onClick: () => void;
  isDiscoverPage?: boolean;
}> = React.memo(({ 
  token, 
  i, 
  selectedTimeframe, 
  onQuickBuy, 
  quickBuyAmount, 
  animationState, 
  sortedRows, 
  onClick,
  isDiscoverPage = false
}) => {
  const handleQuickBuy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onQuickBuy) {
      onQuickBuy(token);
    } else {
      onClick();
    }
  }, [onQuickBuy, token, onClick]);

  const volume = getVolume(token, selectedTimeframe);
  
  // Debug volume calculation
  // console.log('Volume calculation debug:', {
  //   tokenName: token.name,
  //   selectedTimeframe,
  //   totalVolume: volume,
  //   preferredBuySell: {
  //     buy: (token as any)[`total_buy_volume_${selectedTimeframe}`],
  //     sell: (token as any)[`total_sell_volume_${selectedTimeframe}`],
  //   },
  //   fallbackAggregated: (token as any)[`volume_${selectedTimeframe}`],
  // });

  // Calculate alternating row background color for discover page
  const rowBgColor = isDiscoverPage 
    ? (i % 2 === 0 ? '#111214' : '#15161a')
    : 'transparent';
  
  return (
    <tr 
      className={`cursor-pointer ${isDiscoverPage ? '' : 'border-b'}`} 
      style={{ 
        ...(isDiscoverPage ? {} : { borderColor: AX.border }),
        backgroundColor: rowBgColor,
        transition: 'none' // Disable all transitions for instant rendering
      }}
      onMouseEnter={(e) => { 
        if (isDiscoverPage) {
          e.currentTarget.style.backgroundColor = i % 2 === 0 ? '#1a1b1f' : '#1c1d22';
        } else {
          e.currentTarget.style.backgroundColor = AX.surface2;
        }
      }}
      onMouseLeave={(e) => { 
        e.currentTarget.style.backgroundColor = rowBgColor;
      }}
      onClick={onClick}
    >
      <td className="w-80 px-4 py-4 align-middle">
        <TokenInfo token={token} i={i} sortedRows={sortedRows} isDiscoverPage={isDiscoverPage} />
      </td>
      
      <td className="w-32 px-4 py-4 align-middle">
        <MarketCapCell 
          token={token} 
          selectedTimeframe={selectedTimeframe} 
          animationState={animationState}
          isDiscoverPage={isDiscoverPage}
        />
      </td>
      
      <td className="w-28 px-4 py-4 align-middle text-right">
        {/* {(() => {
          console.log('Liquidity Debug:', {
            tokenName: token.name,
            totalLiquidityUsd: token.total_liquidity_usd,
            totalLiquidityUsdType: typeof token.total_liquidity_usd
          });
          return null;
        })()} */}
        {(() => {
          // Calculate liquidity color for discover page
          const liquidity = token.total_liquidity_usd || 0;
          let liquidityColor = AX.text;
          if (isDiscoverPage && liquidity < 1000) {
            liquidityColor = '#f26681';
          }
          
          return (
            <div className={`text-sm font-medium ${isDiscoverPage ? 'number-font' : ''}`} style={{ 
              color: isDiscoverPage ? liquidityColor : AX.text,
              ...(isDiscoverPage ? {} : {
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                fontWeight: '400'
              })
            }}>
              ${formatSmartNumber(token.total_liquidity_usd)}
            </div>
          );
        })()}
      </td>
      
      <td className="w-28 px-4 py-4 align-middle text-right">
        <div className={`text-sm font-medium ${isDiscoverPage ? 'number-font' : ''}`} style={{ 
          color: AX.text,
          ...(isDiscoverPage ? {} : {
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
            fontWeight: '400'
          })
        }}>
          {/* Show "0" on discover page, "-" on other pages when volume is 0 */}
          {volume === 0 ? (isDiscoverPage ? "$0" : "-") : `$${formatSmartNumber(volume)}`}
        </div>
      </td>
      
      <td className="w-24 px-4 py-4 align-middle">
        <TxnsCell token={token} selectedTimeframe={selectedTimeframe} isDiscoverPage={isDiscoverPage} />
      </td>
      
      {/* Token Info column - commented out per user request */}
      {/* <td className="w-24 px-4 py-4 align-middle">
        <AuditLogCell token={token} selectedTimeframe={selectedTimeframe} />
      </td> */}
      
      <td className="w-32 px-4 py-4 align-middle text-center">
        {isDiscoverPage ? (
          <button
            onClick={handleQuickBuy}
            className="flex items-center justify-center gap-1.5 text-xs font-medium transition-all duration-200 cursor-pointer"
            style={{
              backgroundColor: '#272a2e',
              color: '#85d99f',
              padding: '8px 12px',
              borderRadius: '4px',
              minHeight: '32px',
              width: 'auto',
              maxWidth: '120px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#2f3238';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#272a2e';
            }}
          >
            <HiLightningBolt size={14} style={{ color: '#85d99f' }} />
            <span style={{ color: '#85d99f' }}>{quickBuyAmount} SOL</span>
          </button>
        ) : (
          <InterstateButton
            variant="primary"
            size="sm"
            className="!px-3 !py-2 text-xs font-medium w-full"
            onClick={handleQuickBuy}
          >
            Buy {quickBuyAmount} SOL
          </InterstateButton>
        )}
      </td>
    </tr>
  );
});

TableRow.displayName = 'TableRow';

// Main Table Component
export default function InterstateTable({ 
  rows, 
  onQuickBuy, 
  sortKey, 
  sortDirection, 
  setSort, 
  selectedTimeframe, 
  quickBuyAmount = 0.44, 
  skeletonRowCount = 6,
  isDiscoverPage: isDiscoverPageProp
}: InterstateTableProps) {
  const router = useRouter();
  const { filter } = useFilter();
  const [animationState, setAnimationState] = useState<Record<string, 'up' | 'down' | null>>({});
  const prevValuesRef = useRef<Record<string, number>>({});

  // Memoized filtered and sorted rows
  const sortedRows = useMemo(() => {
    //console.log('', {});
    
    const filteredRows = rows.filter(({ token }) => 
      !token.amm || filter.amms.includes(token.amm)
    );
    
    // console.log('🔧 Filtered rows:', {
    //   before: rows.length,
    //   after: filteredRows.length,
    //   filteredOut: rows.length - filteredRows.length
    // });

    if (!sortKey) return filteredRows;
    
    return [...filteredRows].sort((a, b) => {
      const aVal = getSortableValue(a.token, sortKey, selectedTimeframe);
      const bVal = getSortableValue(b.token, sortKey, selectedTimeframe);
      const diff = aVal - bVal;
      if (diff === 0) {
        // Stable tiebreaker to reduce jitter between polls
        const aAddress = a.token.pair_address || a.token.mint || '';
        const bAddress = b.token.pair_address || b.token.mint || '';
        return aAddress.localeCompare(bAddress);
      }
      return sortDirection === 'asc' ? diff : -diff;
    });
  }, [rows, sortKey, sortDirection, filter.amms, selectedTimeframe]);

  // Price animation effect
  useEffect(() => {
    const newAnimationState: Record<string, 'up' | 'down' | null> = {};
    const newPrevValues = { ...prevValuesRef.current };
    
    rows.forEach(({ token }) => {
      const priceKey = `${token.pair_address}-usd_price`;
      const price = token.usd_price;
      
      if (priceKey in prevValuesRef.current) {
        if (price > prevValuesRef.current[priceKey]) {
          newAnimationState[priceKey] = 'up';
        } else if (price < prevValuesRef.current[priceKey]) {
          newAnimationState[priceKey] = 'down';
        }
      }
      newPrevValues[priceKey] = price;

      const percentFieldKey = `${token.pair_address}-price_percent_change_${selectedTimeframe}`;
      const percentValue = (token as any)[`price_percent_change_${selectedTimeframe}`] ?? 0;
      
      if (percentFieldKey in prevValuesRef.current) {
        if (percentValue > prevValuesRef.current[percentFieldKey]) {
          newAnimationState[percentFieldKey] = 'up';
        } else if (percentValue < prevValuesRef.current[percentFieldKey]) {
          newAnimationState[percentFieldKey] = 'down';
        }
      }
      newPrevValues[percentFieldKey] = percentValue;
    });

    setAnimationState(newAnimationState);
    prevValuesRef.current = newPrevValues;

    if (Object.keys(newAnimationState).length > 0) {
      const timeout = setTimeout(() => setAnimationState({}), 300);
      return () => clearTimeout(timeout);
    }
  }, [rows, selectedTimeframe]);

  const isDiscoverPage = isDiscoverPageProp !== undefined ? isDiscoverPageProp : router.pathname === '/discover';
  
  // Check if we're showing trending/Birdeye data (any token has birdeye_rank)
  const isTrending = rows.length > 0 && rows.some(({ token }) => {
    const birdeyeRank = (token as any).birdeye_rank || (token as any).rank;
    return birdeyeRank && birdeyeRank > 0;
  });
  
  return (
    <div className="overflow-x-auto shadow-lg" style={{ 
      backgroundColor: isDiscoverPage ? '#111214' : 'rgba(30, 31, 38, 0.3)', 
      ...(isDiscoverPage ? {
        borderTop: `1px solid ${AX.border}`,
        borderLeft: 'none',
        borderRight: 'none',
        borderBottom: 'none',
        borderRadius: '0'
      } : {
        border: `1px solid ${AX.border}`,
        borderRadius: '0.5rem'
      })
    }}>
      <style jsx>{`
        .number-font {
          font-family: Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
          font-weight: 600;
          letter-spacing: 0.02em;
        }
        .price-animate-up {
          background: ${isDiscoverPage ? 'rgba(133, 217, 159, 0.2)' : 'rgba(52, 211, 153, 0.2)'};
          animation: pulse-green 0.6s ease-out;
        }
        .price-animate-down {
          background: ${isDiscoverPage ? 'rgba(242, 102, 129, 0.2)' : 'rgba(248, 113, 113, 0.2)'};
          animation: pulse-red 0.6s ease-out;
        }
        @keyframes pulse-green {
          0% { background: ${isDiscoverPage ? 'rgba(133, 217, 159, 0.4)' : 'rgba(52, 211, 153, 0.4)'}; }
          100% { background: transparent; }
        }
        @keyframes pulse-red {
          0% { background: ${isDiscoverPage ? 'rgba(242, 102, 129, 0.4)' : 'rgba(248, 113, 113, 0.4)'}; }
          100% { background: transparent; }
        }
        table {
          table-layout: fixed;
        }
        tbody tr {
          transition: none !important;
          animation: none !important;
        }
        tbody tr td {
          transition: none !important;
          animation: none !important;
        }
      `}</style>
      
      <table className="min-w-full" style={{ borderCollapse: 'collapse', borderSpacing: 0 }}>
        <TableHeader 
          sortKey={sortKey} 
          sortDirection={sortDirection} 
          onSort={setSort}
          isDiscoverPage={isDiscoverPage}
          isTrending={isTrending}
        />
        
        <tbody>
          {sortedRows.length === 0 ? (
            Array.from({ length: skeletonRowCount }).map((_, idx) => (
              <SkeletonRow key={idx} />
            ))
          ) : (
            sortedRows.map(({ token, i }) => {
              const handleTokenClick = async () => {
                // First, backfill the token to the database (same as search functionality)
                try {
                  console.log('🔄 Backfilling token from discover page:', token);
                  
                  const backfillResponse = await fetch('/api/token-service/backfill-token', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      mint: token.mint,
                      name: token.name,
                      symbol: token.symbol,
                      uri: token.uri,
                      market_cap_usd: token.fully_diluted_value,
                      liquidity_usd: token.total_liquidity_usd,
                      pair_address: token.pair_address
                    })
                  });

                  if (backfillResponse.ok) {
                    console.log('✅ Token backfilled successfully');
                  } else {
                    console.warn('⚠️ Token backfill failed, but continuing with navigation');
                  }
                } catch (error) {
                  console.error('❌ Error backfilling token:', error);
                  // Continue with navigation even if backfill fails
                }

                // Navigate immediately with pair_address or mint - trade page will handle resolution
                const address = token.pair_address || token.mint;
                if (address) {
                  router.push(`/trade/${address}`);
                }
              };
              
              return (
                <TableRow
                  key={token.pair_address || token.mint}
                  token={token}
                  i={i}
                  selectedTimeframe={selectedTimeframe}
                  onQuickBuy={onQuickBuy}
                  quickBuyAmount={quickBuyAmount}
                  animationState={animationState}
                  sortedRows={sortedRows}
                  onClick={handleTokenClick}
                  isDiscoverPage={isDiscoverPage}
                />
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
