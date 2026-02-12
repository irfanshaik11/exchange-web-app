import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  FaQuestionCircle,
  FaRegStar,
  FaStar,
  FaUsers,
  FaTelegram,
} from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import { User, Globe, Search, Copy } from "lucide-react";
import { HiLightningBolt } from "react-icons/hi";
import { BsPersonGear } from "react-icons/bs";
import { RiGhostLine } from "react-icons/ri";
import { GoStack } from "react-icons/go";
import { FiGlobe } from "react-icons/fi";
import InterstateButton from "./InterstateButton";
import Image from 'next/image';
import InterstateTooltip from './InterstateTooltip';
import CustomCheckbox from './CustomCheckbox';
import { useRouter } from "next/router";
import { useWatchlist } from "./WatchlistContext";
import { showEnhancedToast } from "~/utils/enhancedToast";
import { SolanaIcon } from './Footer';
import type { Token as BaseToken } from "~/utils/db";
import { formatSmartNumber, formatMarketCap, formatLamportsToSol } from '~/utils/db';
import SkeletonRow from './InterstateTable/SkeletonRow';
import { fetchTokenMetadata } from '~/utils/functions';
import { withImageFallback, extractMetaImage, isMetadataUrl } from '~/utils/images';
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
  chain?: string; // 'sol' | 'monad' - chain identifier
  tableType?: 'trending' | 'newPairs' | 'xStocks' | 'dexscreener'; // Section type for different column displays
  solPrice?: number; // SOL/USD price for converting pulse volume (SOL) to USD
}

interface HeaderConfig {
  key: string | null;
  label: string;
  align: 'left' | 'right' | 'center';
  width: string;
}

// Constants
const TABLE_HEADERS: HeaderConfig[] = [
  { key: 'name', label: 'Pair Info', align: 'left', width: 'w-64' },
  { key: 'fully_diluted_value', label: 'Market Cap', align: 'right', width: 'w-32' },
  { key: 'total_liquidity_usd', label: 'Liquidity', align: 'right', width: 'w-28' },
  { key: 'volume', label: 'Volume', align: 'right', width: 'w-28' },
  { key: 'txns', label: 'TXNS', align: 'right', width: 'w-24' },
  { key: null, label: '24h', align: 'center', width: 'w-24' }, // Mini chart column
  // { key: 'total_fees_lamports', label: 'Gas Fees', align: 'right', width: 'w-28' },
  { key: null, label: 'Token Info', align: 'center', width: 'w-40' },
  { key: null, label: 'Action', align: 'center', width: 'w-32' },
];

// Sniper Icon component
const SnipperIcon = ({ size = 16, ...props }: { size?: number; [key: string]: any }) => (
  <svg
    {...props}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <line x1="12" y1="2" x2="12" y2="5" stroke="currentColor" strokeWidth="1.5" />
    <line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" strokeWidth="1.5" />
    <line x1="2" y1="12" x2="5" y2="12" stroke="currentColor" strokeWidth="1.5" />
    <line x1="19" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

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

// PulseTable-style volume for new pairs: try all timeframes (24h→6h→1h→5m),
// sum buy+sell volumes, multiply by solPrice to convert SOL→USD
const getNewPairVolume = (token: Token, solPrice: number): number => {
  for (const tf of ['24h', '6h', '1h', '5m']) {
    const bv = getNumber(token as any, `total_buy_volume_${tf}`);
    const sv = getNumber(token as any, `total_sell_volume_${tf}`);
    const sum = bv + sv;
    if (sum > 0) return sum * solPrice;
  }
  // Fallback: try pre-computed volume fields
  for (const tf of ['24h', '6h', '1h', '5m']) {
    const vol = getNumber(token as any, `volume_${tf}`);
    if (vol > 0) return vol;
  }
  return 0;
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
  
  // Handle timestamp sorting for New Pairs (newest first)
  if (key === 'timestamp') {
    const v = (token as any).created_at ?? (token as any).launch_time ??
              (token as any).firstSeen ?? (token as any).pair_created_at ??
              (token as any).timestamp ?? (token as any).ts;
    if (!v) return 0;
    const n = typeof v === 'number' ? v : typeof v === 'string' ? (Number(v) || Date.parse(v) || 0) : 0;
    // Normalize: if seconds (< 1e12), convert to ms
    return n > 1e12 ? n : n > 1e9 ? n * 1000 : 0;
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

// Helper to extract Twitter handle from URL
function extractTwitterHandle(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /(?:twitter\.com|x\.com)\/(@?\w+)/i,
    /(?:twitter\.com|x\.com)\/intent\/user\?screen_name=(\w+)/i,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1].replace("@", "");
    }
  }
  return null;
}

// Helper to extract social links from token metadata
interface SocialLinks {
  twitter?: string;
  website?: string;
  telegram?: string;
}

function extractSocialLinks(token: Token, meta: any): SocialLinks {
  const links: SocialLinks = {};

  // Try to get links from metadata extensions first (most common format)
  if (meta?.extensions) {
    if (meta.extensions.twitter) links.twitter = meta.extensions.twitter;
    if (meta.extensions.website || meta.extensions.homepage) {
      links.website = meta.extensions.website || meta.extensions.homepage;
    }
    if (meta.extensions.telegram) links.telegram = meta.extensions.telegram;
  }

  // Also try top-level metadata fields
  if (meta) {
    if (meta.twitter && !links.twitter) links.twitter = meta.twitter;
    if (meta.website && !links.website) links.website = meta.website;
    if (meta.telegram && !links.telegram) links.telegram = meta.telegram;
    if (meta.external_url && !links.website) links.website = meta.external_url;
  }

  // Also try to parse token.links if it's a JSON string
  if (token.links) {
    try {
      const parsedLinks =
        typeof token.links === "string" ? JSON.parse(token.links) : token.links;
      if (parsedLinks.twitter && !links.twitter) links.twitter = parsedLinks.twitter;
      if (parsedLinks.website && !links.website) links.website = parsedLinks.website;
      if (parsedLinks.telegram && !links.telegram) links.telegram = parsedLinks.telegram;
    } catch {
      // Ignore parsing errors
    }
  }

  // Filter out empty strings
  if (links.twitter === '' || links.twitter === null) delete links.twitter;
  if (links.website === '' || links.website === null) delete links.website;
  if (links.telegram === '' || links.telegram === null) delete links.telegram;

  return links;
}

// Table Header Component
const TableHeader: React.FC<{
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  isDiscoverPage?: boolean;
  tableType?: 'trending' | 'newPairs' | 'xStocks' | 'dexscreener';
}> = ({ sortKey, sortDirection, onSort, isDiscoverPage = false, tableType = 'trending' }) => (
  <thead>
    <tr style={{ backgroundColor: 'transparent', borderBottom: `1px solid ${AX.border}` }}>
      {TABLE_HEADERS.map((header, idx) => {
        let label = header.label;
        // Hide the 24h chart column for newPairs and dexscreener
        if (header.label === '24h' && (tableType === 'newPairs' || tableType === 'dexscreener')) {
          return null;
        }
        // Hide Token Info / Holders column for newPairs and dexscreener
        if (header.label === 'Token Info' && (tableType === 'newPairs' || tableType === 'dexscreener')) {
          return null;
        }
        // Hide Volume column for newPairs (WS volume data not yet wired to display)
        if (header.label === 'Volume' && tableType === 'newPairs') {
          return null;
        }
        return (
          <th
            key={idx}
            className={`${header.width} px-4 py-3 text-${header.align} ${isDiscoverPage ? 'text-[10px]' : 'text-xs'} font-medium tracking-wide uppercase ${
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

// Monad Icon Component - uses Monad favicon
const MonadIcon = ({ size = 16 }: { size?: number }) => (
  <img
    src="https://monad.xyz/favicon.ico"
    alt="Monad"
    width={size}
    height={size}
    style={{ width: size, height: size, objectFit: 'contain' }}
    className="rounded-full"
  />
);

// Token Avatar Component
const TokenAvatar: React.FC<{
  token: Token;
  meta: any;
  loading: boolean;
  showInitial: boolean;
  chain?: string; // 'sol' | 'monad' - chain identifier
}> = ({ token, meta, loading, showInitial, chain = 'sol' }) => {
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

  // API returns image_url, fallback to image, logo, then uri (only if uri is not a metadata JSON URL)
  const rawUri = (token as any).uri;
  const safeUri = rawUri && !isMetadataUrl(rawUri) ? rawUri : null;
  const imageUrl = (token as any).image_url || (token as any).image || token.logo || safeUri;

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
            src={(() => {
              const imgSrc = extractMetaImage(meta) || imageUrl || token.logo || '';
              if (!imgSrc) return '';
              return `/api/image?url=${encodeURIComponent(imgSrc)}`;
            })()}
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
      
      {/* Chain logo bubble - positioned at bottom right (Solana or Monad) */}
      {chain === 'monad' ? (
        <div className="absolute bottom-0 right-0 flex items-center justify-center transform translate-x-1/2 translate-y-1/2 z-10"
             style={{ 
               width: 20, 
               height: 20
             }}>
          <MonadIcon size={20} />
        </div>
      ) : (
        <div className="absolute bottom-0 right-0 bg-white rounded-full flex items-center justify-center transform translate-x-1/2 translate-y-1/2 z-10"
             style={{ 
               width: 14, 
               height: 14,
               padding: '1px'
             }}>
          <SolanaIcon size={12} />
        </div>
      )}
    </div>
  );
};

// Token Info Component
const TokenInfo: React.FC<{
  token: Token;
  i: number;
  sortedRows: InterstateTableRow[];
  isDiscoverPage?: boolean;
  chain?: string; // 'sol' | 'monad' - chain identifier
}> = ({ token, i, sortedRows, isDiscoverPage = false, chain = 'sol' }) => {
  const { meta, loading, showInitial } = useTokenMetadata(token.uri);
  const timeLabel = TIME_LABELS[i % TIME_LABELS.length];
  const [showXPreview, setShowXPreview] = useState(false);
  const [buttonPosition, setButtonPosition] = useState<{left: number, top: number} | null>(null);
  const [showSearchMenu, setShowSearchMenu] = useState(false);
  const searchButtonRef = useRef<HTMLButtonElement>(null);

  // Refs for X preview hover state management
  const xButtonRef = useRef<HTMLButtonElement>(null);
  const isOverXPreview = useRef(false);
  const isOverXButton = useRef(false);

  // Close search menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showSearchMenu && searchButtonRef.current && !searchButtonRef.current.contains(e.target as Node)) {
        setShowSearchMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSearchMenu]);

  // Extract social links from metadata
  const socialLinks = useMemo(() => extractSocialLinks(token, meta), [token, meta]);
  const hasTwitter = !!socialLinks.twitter;
  const hasWebsite = !!socialLinks.website;
  const hasTelegram = !!socialLinks.telegram;
  const twitterHandle = hasTwitter ? extractTwitterHandle(socialLinks.twitter!) : null;

  // Get token image from metadata or token
  const tokenImage = useMemo(() => {
    if (meta?.image) return meta.image;
    if ((token as any).image_url) return (token as any).image_url;
    if ((token as any).image) return (token as any).image;
    if (token.logo) return token.logo;
    return null;
  }, [meta, token]);
  
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
      if (!createdAt) return '';

      let timestamp: number | null = null;
      if (typeof createdAt === 'string') {
        const parsed = Date.parse(createdAt);
        if (!isNaN(parsed)) timestamp = parsed;
      } else if (typeof createdAt === 'number') {
        // Heuristic: treat 13-digit as ms, 10-digit as seconds
        if (createdAt > 1e12) timestamp = createdAt;
        else if (createdAt > 1e9) timestamp = createdAt * 1000;
      }

      if (!timestamp) return '';

      const ageMs = Date.now() - timestamp;
      const ageHours = ageMs / (1000 * 60 * 60);

      if (ageHours < 1) {
        const ageMins = Math.floor(ageMs / (1000 * 60));
        if (ageMins < 1) {
          const ageSecs = Math.floor(ageMs / 1000);
          return `${ageSecs}s`;
        }
        return `${ageMins}m`;
      } else if (ageHours < 24) {
        return `${Math.floor(ageHours)}h`;
      } else {
        return `${Math.floor(ageHours / 24)}d`;
      }
    } catch {
      return '';
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
        <TokenAvatar token={token} meta={meta} loading={loading} showInitial={showInitial} chain={chain} />
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
        <TokenAvatar token={token} meta={meta} loading={loading} showInitial={showInitial} chain={chain} />
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
          {tokenAge && (
            <span className={`text-xs ${isDiscoverPage ? 'number-font' : 'text-emerald-400'}`} style={{ color: isDiscoverPage ? ageColor : undefined, fontWeight: isDiscoverPage ? 700 : 400, ...(isDiscoverPage ? {} : { fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' }) }}>
              {tokenAge}
            </span>
          )}
          <div className="flex items-center gap-1 text-sky-400">
            {/* X/Twitter Icon - only show if twitter URL exists in metadata */}
            {hasTwitter && (
              <button
                ref={xButtonRef}
                className="flex items-center justify-center rounded p-0.5 transition-colors duration-200 cursor-pointer hover:bg-white/10"
                style={{ color: AX.muted }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#fff';
                  isOverXButton.current = true;
                  // Position the preview popup
                  if (xButtonRef.current) {
                    const rect = xButtonRef.current.getBoundingClientRect();
                    setButtonPosition({
                      left: rect.left + rect.width / 2,
                      top: rect.bottom + 10,
                    });
                  }
                  setShowXPreview(true);
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = AX.muted;
                  isOverXButton.current = false;
                  // Delay to allow moving to popup
                  setTimeout(() => {
                    if (!isOverXPreview.current && !isOverXButton.current) {
                      setShowXPreview(false);
                    }
                  }, 200);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(socialLinks.twitter, '_blank');
                }}
                title="Twitter/X"
              >
                <FaXTwitter size={11} />
              </button>
            )}

            {/* Telegram Icon - only show if telegram URL exists in metadata */}
            {hasTelegram && (
              <button
                className="flex items-center justify-center rounded p-0.5 transition-colors duration-200 cursor-pointer hover:bg-white/10"
                style={{ color: AX.muted }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#0088cc';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = AX.muted;
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(socialLinks.telegram, '_blank');
                }}
                title="Telegram"
              >
                <FaTelegram size={11} />
              </button>
            )}

            {/* Website Icon - only show if website URL exists in metadata */}
            {hasWebsite && (
              <button
                className="flex items-center justify-center rounded p-0.5 transition-colors duration-200 cursor-pointer hover:bg-white/10"
                style={{ color: AX.muted }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = AX.muted;
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(socialLinks.website, '_blank');
                }}
                title="Website"
              >
                <FiGlobe size={11} />
              </button>
            )}

            {/* Search icon with dropdown menu */}
            <div
              className="relative"
              onMouseEnter={() => setShowSearchMenu(true)}
              onMouseLeave={() => setShowSearchMenu(false)}
            >
              <button
                ref={searchButtonRef}
                className="flex items-center justify-center rounded p-0.5 transition-colors duration-200 cursor-pointer hover:bg-white/10"
                style={{ color: showSearchMenu ? (isDiscoverPage ? '#85d99f' : AX.aiCyan) : AX.muted }}
                title="Search options"
              >
                <Search className="w-3 h-3" />
              </button>

              {/* Search dropdown menu */}
              {showSearchMenu && (
                <div
                  className="absolute left-full top-0 ml-1 z-[99999] min-w-[180px] rounded-lg overflow-hidden"
                  style={{
                    backgroundColor: '#1a1b1f',
                    border: `1px solid ${AX.border}`,
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-white hover:bg-white/10 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(`https://twitter.com/search?q=${encodeURIComponent(token.mint || token.pair_address || '')}`, '_blank');
                      setShowSearchMenu(false);
                    }}
                  >
                    <FaXTwitter size={12} className="text-neutral-400" />
                    X Search Address
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-white hover:bg-white/10 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(`https://twitter.com/search?q=${encodeURIComponent(`${token.symbol} ${token.name}`.trim())}`, '_blank');
                      setShowSearchMenu(false);
                    }}
                  >
                    <FaXTwitter size={12} className="text-neutral-400" />
                    X Search Name
                  </button>
                  <div className="my-0.5 border-t" style={{ borderColor: AX.border }} />
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-white hover:bg-white/10 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(`https://www.google.com/search?q=${encodeURIComponent(`${token.symbol} ${token.name} crypto`.trim())}`, '_blank');
                      setShowSearchMenu(false);
                    }}
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Google Search
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-white hover:bg-white/10 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      const address = token.mint || token.pair_address || '';
                      const chainPath = chain === 'monad' ? 'monad' : 'solana';
                      window.open(`https://dexscreener.com/${chainPath}/${address}`, '_blank');
                      setShowSearchMenu(false);
                    }}
                  >
                    <Search className="w-3 h-3 text-[#36d8ff]" />
                    DexScreener
                  </button>
                </div>
              )}
            </div>

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
            left: `${buttonPosition.left + 20}px`,
            top: `${buttonPosition.top}px`,
            width: '280px',
            zIndex: 999999
          }}
          onMouseEnter={() => {
            isOverXPreview.current = true;
          }}
          onMouseLeave={() => {
            isOverXPreview.current = false;
            setTimeout(() => {
              if (!isOverXPreview.current && !isOverXButton.current) {
                setShowXPreview(false);
              }
            }, 200);
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
            <div className="flex items-center px-4 py-3 border-b" style={{ borderColor: '#2f3336' }}>
              <div className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: '#1d9bf0' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#ffffff' }}>
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </div>
                <div className="text-sm font-bold text-white">X Profile</div>
              </div>
            </div>

            {/* X Profile Content */}
            <div className="px-4 py-3">
              {/* Profile Header */}
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0"
                  style={{ backgroundColor: '#1a1a1a' }}
                >
                  <img
                    src={tokenImage
                      ? `/api/image?url=${encodeURIComponent(tokenImage)}`
                      : `https://ui-avatars.com/api/?name=${token.symbol || 'Token'}&size=48&background=1a1a1a&color=ffffff&bold=true`
                    }
                    alt={`${token.symbol} profile`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${token.symbol || 'Token'}&size=48&background=1a1a1a&color=ffffff&bold=true`;
                    }}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-bold text-white">{token.name || token.symbol}</span>
                    <svg className="h-4 w-4 text-[#1d9bf0]" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z" />
                    </svg>
                  </div>
                  <span className="text-xs text-gray-500">@{twitterHandle || token.symbol?.toLowerCase()}</span>
                </div>
              </div>

              {/* Bio/Description */}
              <p className="text-sm leading-relaxed text-white mb-2">
                {meta?.description || token.description || `Official ${token.symbol} token`}
              </p>
              {hasWebsite && (
                <a
                  href={socialLinks.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm text-[#1d9bf0] hover:underline mb-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  {socialLinks.website}
                </a>
              )}
            </div>

            {/* CTA Button */}
            <div className="px-4 pb-4">
              <button
                className="w-full rounded-full border border-[#536471] py-2 text-sm font-semibold text-[#1d9bf0] transition-colors hover:bg-[#1d9bf0]/10"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(socialLinks.twitter, '_blank');
                }}
              >
                See Profile on X
              </button>
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
    const zeroCount = originalZeroCount; // Show actual zero count in subscript
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
  const monospaceFont = 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace';

  // Always show transaction counts (no more rank display)
  const { total, buys, sells } = getTxns(token, selectedTimeframe);

  // For discover page (xStocks), show "0" instead of "-" when value is 0
  const formatTxnValue = (value: number) => {
    if (value === 0) {
      return isDiscoverPage ? '0' : '-';
    }
    return formatSmartNumber(value);
  };

  return (
    <div className="flex flex-col h-full justify-center">
      <div className="flex items-center justify-end">
        <span className={`text-sm font-medium ${isDiscoverPage ? 'number-font' : ''}`} style={{
          color: AX.text,
          ...(isDiscoverPage ? {} : { fontFamily: monospaceFont, fontWeight: '400' })
        }}>
          {formatTxnValue(total)}
        </span>
      </div>
      <div className="flex items-center justify-end text-xs font-medium">
        <span className={isDiscoverPage ? 'number-font' : ''} style={{
          color: isDiscoverPage ? '#85d99f' : '#34d399',
          ...(isDiscoverPage ? {} : { fontFamily: monospaceFont, fontWeight: '400' })
        }}>
          {formatTxnValue(buys)}
        </span>
        <span className="mx-1" style={{ color: AX.muted }}>/</span>
        <span className={isDiscoverPage ? 'number-font' : ''} style={{
          color: isDiscoverPage ? '#f26681' : '#f87171',
          ...(isDiscoverPage ? {} : { fontFamily: monospaceFont, fontWeight: '400' })
        }}>
          {formatTxnValue(sells)}
        </span>
      </div>
    </div>
  );
};

// Mini Sparkline Chart Component - shows 24h price movement
// Loads immediately on mount + permanent in-memory cache (until page refresh)
const sparklineCache = new Map<string, { data: number[]; priceChange: number }>();

const MiniSparkline: React.FC<{
  token: Token;
  width?: number;
  height?: number;
}> = ({ token, width = 80, height = 32 }) => {
  const [priceData, setPriceData] = useState<number[]>([]);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const mintAddress = token.mint || (token as any).contractAddress || (token as any).address;

  // Use existing price change from token data for instant display
  const existingPriceChange = (token as any).price_percent_change_24h ||
    (token as any).priceChange24h ||
    (token as any).price24hChangePercent || 0;

  // Fetch chart data immediately on mount
  useEffect(() => {
    if (!mintAddress) return;

    // Check cache first - permanent cache until page refresh
    const cached = sparklineCache.get(mintAddress);
    if (cached) {
      setPriceData(cached.data);
      setPriceChange(cached.priceChange);
      setLoading(false);
      return;
    }

    // Fetch OHLC data
    const fetchSparkline = async () => {
      try {
        const response = await fetch(
          `/api/token-service/ohlc?mint=${mintAddress}&interval=1h&timeframe=24h`
        );
        if (!response.ok) throw new Error('Failed to fetch');

        const result = await response.json();
        if (result.success && result.data?.items?.length > 0) {
          // Extract close prices for sparkline
          const closes = result.data.items.map((item: any) => item.c);
          const firstPrice = closes[0] || 0;
          const lastPrice = closes[closes.length - 1] || 0;
          const change = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;

          // Cache the result permanently (until page refresh)
          sparklineCache.set(mintAddress, {
            data: closes,
            priceChange: change
          });

          setPriceData(closes);
          setPriceChange(change);
        }
      } catch (err) {
        // Silently fail - sparkline is a nice-to-have
        console.debug('[Sparkline] Failed to fetch for', mintAddress);
      } finally {
        setLoading(false);
      }
    };

    fetchSparkline();
  }, [mintAddress]);

  // Generate a simple placeholder line based on existing price change data
  const generatePlaceholderLine = () => {
    const isUp = existingPriceChange >= 0;
    const color = isUp ? '#85d99f' : '#f26681';
    // Create a simple diagonal line
    const y1 = isUp ? height - 4 : 4;
    const y2 = isUp ? 4 : height - 4;
    return (
      <svg width={width} height={height}>
        <line
          x1={4}
          y1={y1}
          x2={width - 4}
          y2={y2}
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  };

  // Show placeholder while loading
  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        {existingPriceChange !== 0 ? generatePlaceholderLine() : (
          <div className="w-full h-1 rounded" style={{ backgroundColor: AX.border }}>
            <div
              className="h-full rounded animate-pulse"
              style={{ backgroundColor: AX.muted, width: '60%' }}
            />
          </div>
        )}
      </div>
    );
  }

  // Need at least 5 data points for a meaningful chart
  // Otherwise show a simple direction indicator
  if (priceData.length < 5) {
    const hasData = priceData.length >= 2;
    const change = hasData
      ? ((priceData[priceData.length - 1] - priceData[0]) / priceData[0]) * 100
      : existingPriceChange;
    const isUp = change >= 0;
    const color = isUp ? '#85d99f' : '#f26681';

    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        <svg width={width} height={height}>
          {/* Simple curved line showing direction */}
          <path
            d={isUp
              ? `M 4 ${height - 6} Q ${width / 2} ${height / 2} ${width - 4} 6`
              : `M 4 6 Q ${width / 2} ${height / 2} ${width - 4} ${height - 6}`
            }
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  // Downsample and smooth data for clean sparkline
  const processData = (data: number[]): number[] => {
    if (data.length < 3) return data;

    // Target ~12-16 points for a clean sparkline
    const targetPoints = 14;

    // Downsample by averaging chunks
    const chunkSize = Math.max(1, Math.floor(data.length / targetPoints));
    const downsampled: number[] = [];

    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, Math.min(i + chunkSize, data.length));
      const avg = chunk.reduce((a, b) => a + b, 0) / chunk.length;
      downsampled.push(avg);
    }

    // Apply gaussian-like smoothing (weighted moving average)
    const smoothed: number[] = [];
    for (let i = 0; i < downsampled.length; i++) {
      if (i === 0) {
        smoothed.push(downsampled[0] * 0.6 + downsampled[1] * 0.4);
      } else if (i === downsampled.length - 1) {
        smoothed.push(downsampled[i - 1] * 0.4 + downsampled[i] * 0.6);
      } else {
        // Weighted: 25% prev, 50% current, 25% next
        smoothed.push(downsampled[i - 1] * 0.25 + downsampled[i] * 0.5 + downsampled[i + 1] * 0.25);
      }
    }

    return smoothed;
  };

  const smoothedData = processData(priceData);

  // Calculate bounds
  const minPrice = Math.min(...smoothedData);
  const maxPrice = Math.max(...smoothedData);
  const priceRange = maxPrice - minPrice || 1;

  const padding = 2;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  // Convert to coordinates
  const coords = smoothedData.map((price, i) => ({
    x: padding + (i / (smoothedData.length - 1)) * chartWidth,
    y: padding + chartHeight - ((price - minPrice) / priceRange) * chartHeight
  }));

  // Create smooth bezier curve path
  const createSmoothPath = (pts: { x: number; y: number }[]): string => {
    if (pts.length < 2) return '';

    let path = `M ${pts[0].x},${pts[0].y}`;

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];

      // Catmull-Rom to Bezier conversion for smooth curves
      const tension = 0.3;
      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;

      path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }

    return path;
  };

  const linePath = createSmoothPath(coords);

  // Create closed path for gradient fill
  const fillPath = linePath +
    ` L ${coords[coords.length - 1].x},${padding + chartHeight}` +
    ` L ${coords[0].x},${padding + chartHeight} Z`;

  const isPositive = priceChange >= 0;
  const strokeColor = isPositive ? '#85d99f' : '#f26681';
  const gradientId = `sparkline-gradient-${mintAddress?.slice(0, 8)}`;

  // Calculate approximate path length for animation (overestimate to ensure full draw)
  const pathLength = chartWidth * 3;

  return (
    <div className="flex items-center justify-center">
      <svg width={width} height={height} className="overflow-visible">
        <defs>
          {/* Gradient for the fill area */}
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
          </linearGradient>
          {/* Clip path for animated reveal */}
          <clipPath id={`clip-${gradientId}`}>
            <rect
              x="0"
              y="0"
              width={width}
              height={height}
              style={{
                animation: 'sparkline-reveal 0.6s ease-out forwards',
                transformOrigin: 'left',
              }}
            />
          </clipPath>
        </defs>

        {/* Gradient fill area */}
        <path
          d={fillPath}
          fill={`url(#${gradientId})`}
          clipPath={`url(#clip-${gradientId})`}
        />

        {/* Smooth bezier curve line */}
        <path
          d={linePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={pathLength}
          strokeDashoffset={pathLength}
          style={{
            animation: 'sparkline-draw 0.6s ease-out forwards'
          }}
        />
        <style>
          {`
            @keyframes sparkline-draw {
              to {
                stroke-dashoffset: 0;
              }
            }
            @keyframes sparkline-reveal {
              from {
                transform: scaleX(0);
              }
              to {
                transform: scaleX(1);
              }
            }
          `}
        </style>
      </svg>
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

// Compact Token Metric Display Component
const TokenMetric: React.FC<{
  icon: React.ReactNode;
  value: string;
  color: string;
  tooltip: string;
}> = ({ icon, value, color, tooltip }) => (
  <div
    className="flex items-center gap-1 cursor-help"
    title={tooltip}
  >
    <span style={{ color }}>{icon}</span>
    <span className="number-font text-xs font-medium" style={{ color }}>{value}</span>
  </div>
);

// Format percentage value for display
const formatPercent = (val: number | undefined): string => {
  if (val === undefined || val === null) return '0';
  // If value is <= 1, it's a decimal that needs to be converted to percentage
  const percent = val <= 1 ? val * 100 : val;
  if (percent >= 100) return `${Math.round(percent)}`;
  if (percent >= 10) return `${percent.toFixed(1)}`;
  return `${percent.toFixed(2)}`;
};

// Token Info Cell Component - displays holder metrics from trending WebSocket
const TokenInfoCell: React.FC<{
  token: Token;
  isDiscoverPage?: boolean;
  tableType?: 'trending' | 'newPairs' | 'xStocks' | 'dexscreener';
}> = ({ token, isDiscoverPage = false, tableType = 'trending' }) => {
  const holderCount = (token as any).holder_count;
  const top10Percent = (token as any).top10_holders_percent;
  const insiderPercent = (token as any).insider_percent;
  const sniperPercent = (token as any).sniper_percent;
  const bundlePercent = (token as any).bundle_percent;

  // For newPairs, just show holder count
  if (tableType === 'newPairs') {
    return (
      <div className="flex items-center justify-center">
        <span className="text-sm font-medium number-font" style={{ color: '#31e3ac' }}>
          {holderCount !== undefined && holderCount > 0
            ? formatSmartNumber(holderCount)
            : '—'}
        </span>
      </div>
    );
  }

  // Check if this token has trending data (from useTrendingWebSocket)
  const hasTrendingData = holderCount !== undefined ||
    bundlePercent !== undefined ||
    insiderPercent !== undefined ||
    sniperPercent !== undefined ||
    top10Percent !== undefined;

  // If no trending data, show placeholder
  if (!hasTrendingData) {
    return (
      <div className="flex items-center justify-center">
        <span className="text-xs" style={{ color: AX.muted }}>—</span>
      </div>
    );
  }

  // Colors
  const greenColor = '#31e3ac';
  const yellowColor = '#f2c367';
  const redColor = '#f26681';

  return (
    <div className="flex flex-col gap-0.5">
      {/* Row 1: Holders + Top 10 */}
      <div className="flex items-center gap-3">
        {holderCount !== undefined && holderCount > 0 && (
          <TokenMetric
            icon={<FaUsers size={11} />}
            value={formatSmartNumber(holderCount)}
            color={greenColor}
            tooltip={`Holders: ${holderCount.toLocaleString()}`}
          />
        )}
        {top10Percent !== undefined && top10Percent > 0 && (
          <TokenMetric
            icon={<BsPersonGear size={11} />}
            value={`${formatPercent(top10Percent)}%`}
            color={greenColor}
            tooltip={`Top 10 Holders: ${formatPercent(top10Percent)}%`}
          />
        )}
      </div>
      {/* Row 2: Insider + Sniper + Bundle */}
      <div className="flex items-center gap-3">
        {insiderPercent !== undefined && insiderPercent > 0 && (
          <TokenMetric
            icon={<RiGhostLine size={11} />}
            value={`${formatPercent(insiderPercent)}%`}
            color={yellowColor}
            tooltip={`Insider Holding: ${formatPercent(insiderPercent)}%`}
          />
        )}
        {sniperPercent !== undefined && sniperPercent > 0 && (
          <TokenMetric
            icon={<SnipperIcon size={11} />}
            value={`${formatPercent(sniperPercent)}%`}
            color={redColor}
            tooltip={`Sniper Holding: ${formatPercent(sniperPercent)}%`}
          />
        )}
        {bundlePercent !== undefined && bundlePercent > 0 && (
          <TokenMetric
            icon={<GoStack size={11} />}
            value={`${formatPercent(bundlePercent)}%`}
            color={yellowColor}
            tooltip={`Bundler Holdings: ${formatPercent(bundlePercent)}%`}
          />
        )}
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
  chain?: string; // 'sol' | 'monad' - chain identifier
  tableType?: 'trending' | 'newPairs' | 'xStocks' | 'dexscreener';
  solPrice?: number;
}> = React.memo(({
  token,
  i,
  selectedTimeframe,
  onQuickBuy,
  quickBuyAmount,
  animationState,
  sortedRows,
  onClick,
  isDiscoverPage = false,
  chain = 'sol',
  tableType = 'trending',
  solPrice = 0
}) => {
  const handleQuickBuy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onQuickBuy) {
      onQuickBuy(token);
    } else {
      onClick();
    }
  }, [onQuickBuy, token, onClick]);

  // For newPairs, use PulseTable-style volume: try all timeframes, sum buy+sell, convert SOL→USD
  const volume = tableType === 'newPairs' && solPrice > 0
    ? getNewPairVolume(token, solPrice)
    : getVolume(token, selectedTimeframe);

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
    ? (i % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.02)')
    : 'transparent';
  
  return (
    <tr 
      className={`cursor-pointer h-16 border-b`}
      style={{
        borderColor: isDiscoverPage ? 'rgba(255, 255, 255, 0.03)' : AX.border,
        backgroundColor: rowBgColor,
        transition: 'none' // Disable all transitions for instant rendering
      }}
      onMouseEnter={(e) => {
        if (isDiscoverPage) {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
        } else {
          e.currentTarget.style.backgroundColor = AX.surface2;
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = rowBgColor;
      }}
      onClick={onClick}
    >
      <td className="w-64 px-4 py-4 align-middle">
        <TokenInfo token={token} i={i} sortedRows={sortedRows} isDiscoverPage={isDiscoverPage} chain={chain} />
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

      {/* Volume column - hidden for newPairs */}
      {tableType !== 'newPairs' && (
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
      )}

      <td className="w-28 px-4 py-4 align-middle">
        <TxnsCell token={token} selectedTimeframe={selectedTimeframe} isDiscoverPage={isDiscoverPage} />
      </td>

      {/* 24h Mini Chart column - hidden for newPairs and dexscreener */}
      {tableType !== 'newPairs' && tableType !== 'dexscreener' && (
        <td className="w-24 px-2 py-4 align-middle">
          <MiniSparkline token={token} width={80} height={40} />
        </td>
      )}

      {/* Gas Fees column - commented out per user request
      <td className="w-28 px-4 py-4 align-middle text-right">
        <div className={`text-sm font-medium ${isDiscoverPage ? 'number-font' : ''}`} style={{
          color: AX.text,
          ...(isDiscoverPage ? {} : {
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
            fontWeight: '400'
          })
        }}>
          {formatLamportsToSol((token as any).total_fees_lamports)}
        </div>
      </td>
      */}

      {/* Token Info column - displays holder metrics from trending WebSocket (hidden for newPairs and dexscreener) */}
      {tableType !== 'dexscreener' && tableType !== 'newPairs' && (
        <td className="w-40 px-2 py-4 align-middle">
          <TokenInfoCell token={token} isDiscoverPage={isDiscoverPage} tableType={tableType} />
        </td>
      )}

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
            <span style={{ color: '#85d99f' }}>{quickBuyAmount} {chain === 'monad' ? 'MON' : 'SOL'}</span>
          </button>
        ) : (
          <InterstateButton
            variant="primary"
            size="sm"
            className="!px-3 !py-2 text-xs font-medium w-full"
            onClick={handleQuickBuy}
          >
            Buy {quickBuyAmount} {chain === 'monad' ? 'MON' : 'SOL'}
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
  isDiscoverPage: isDiscoverPageProp,
  chain = 'sol',
  tableType = 'trending',
  solPrice = 0
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

  return (
    <div className={isDiscoverPage ? "mx-4 overflow-hidden rounded-xl" : ""} style={isDiscoverPage ? {
      border: '1px solid rgba(255, 255, 255, 0.06)',
      backgroundColor: 'rgba(255, 255, 255, 0.03)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
    } : {}}>
    <div className="overflow-x-auto shadow-lg w-full" style={{
      backgroundColor: isDiscoverPage ? 'transparent' : 'rgba(30, 31, 38, 0.3)',
      ...(!isDiscoverPage ? {
        border: `1px solid ${AX.border}`,
        borderRadius: '0.5rem'
      } : {})
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
        .table-wrapper {
          table-layout: fixed;
          width: 100%;
          min-width: 1000px;
        }
        .table-wrapper tbody tr {
          transition: none !important;
          animation: none !important;
        }
        .table-wrapper tbody tr td {
          transition: none !important;
          animation: none !important;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .table-wrapper thead th {
          white-space: nowrap;
        }
      `}</style>
      
      <table className="table-wrapper min-w-full" style={{ borderCollapse: 'collapse', borderSpacing: 0, tableLayout: 'fixed', width: '100%' }}>
        <TableHeader
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={setSort}
          isDiscoverPage={isDiscoverPage}
          tableType={tableType}
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

                // Navigate with proper format based on chain
                const address = token.pair_address || token.mint;
                if (address) {
                  // Check if this is a Monad token
                  const isMonad = chain === 'monad';
                  
                  if (isMonad) {
                    // Build Monad trade URL with query parameters
                    const queryParams = new URLSearchParams();
                    if (token.name) queryParams.set('_name', token.name);
                    if (token.symbol) queryParams.set('_symbol', token.symbol);
                    if (token.fully_diluted_value) queryParams.set('_mcap', token.fully_diluted_value.toString());
                    if (token.total_liquidity_usd || (token as any)?.liquidity_usd || (token as any)?.liquidity) {
                      const liq = token.total_liquidity_usd || (token as any)?.liquidity_usd || (token as any)?.liquidity;
                      if (typeof liq === 'number' && Number.isFinite(liq)) {
                        queryParams.set('_liq', liq.toString());
                      }
                    }
                    if (token.uri || token.logo) queryParams.set('_image', token.uri || token.logo || '');
                    queryParams.set('_mint', address);
                    if ((token as any).launchpad_protocol) queryParams.set('_launchpad_protocol', (token as any).launchpad_protocol);
                    queryParams.set('chain', 'monad');

                    const url = `/trade/monad/${address}?${queryParams.toString()}`;
                    router.push(url);
                  } else {
                    // For Solana, include chain=sol parameter
                    const solQueryParams = new URLSearchParams();
                    if (token.name) solQueryParams.set('_name', token.name);
                    if (token.symbol) solQueryParams.set('_symbol', token.symbol);
                    if ((token as any).price_usd) solQueryParams.set('_price', (token as any).price_usd.toString());
                    if (token.market_cap_usd) solQueryParams.set('_mcap', token.market_cap_usd.toString());
                    if (token.uri || token.logo || (token as any).image) solQueryParams.set('_image', token.uri || token.logo || (token as any).image || '');
                    solQueryParams.set('_mint', address);
                    if ((token as any).launchpad_protocol) solQueryParams.set('_launchpad_protocol', (token as any).launchpad_protocol);
                    solQueryParams.set('chain', 'sol');
                    router.push(`/trade/${address}?${solQueryParams.toString()}`);
                  }
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
                  chain={chain}
                  tableType={tableType}
                  solPrice={solPrice}
                />
              );
            })
          )}
        </tbody>
      </table>
    </div>
    </div>
  );
}
