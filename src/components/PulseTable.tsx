import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import AvatarImage from '~/components/AvatarImage';
import type { Token } from '~/utils/db';
import { formatSmartNumber } from '~/utils/db';
import { FaUser, FaGlobe, FaSearch, FaCrown, FaRegCopy, FaBolt } from 'react-icons/fa';
import InterstateTooltip from './InterstateTooltip';
import { useRouter } from 'next/router';
import { fetchTokenMetadata } from '~/utils/functions';
import { withImageFallback, extractMetaImage } from '~/utils/images';

interface PulseTableProps {
  title: string;
  tokens: Token[];
  isFirstOrLast?: "first" | "last";
  loading?: boolean;
  skeletonRowCount?: number;
}

// Add a simple in-memory cache for token metadata
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
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [uri]);
  return { meta, loading, showInitial };
}

function TokenImage({ token }: { token: Token }) {
  // Strictly prefer DB image (launchpad_token_state.image), then token.logo
  const dbImage = (token as any).image as string | undefined;
  return (
    <AvatarImage
      src={dbImage}
      fallbackSrc={token.logo || undefined}
      name={token.name}
      symbol={token.symbol}
      width={48}
      height={48}
      className="w-12 h-12 object-contain rounded"
    />
  );
}

export default function PulseTable({ title, tokens, isFirstOrLast, loading = false, skeletonRowCount = 10 }: PulseTableProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const router = useRouter();
  
  const shortAddr = (token: any): string => {
    try {
      const a = token?.pair_address || token?.mint || token?.address || '';
      if (typeof a !== 'string' || a.length < 8) return a || '-';
      return `${a.slice(0, 4)}...${a.slice(-4)}`;
    } catch { return '-'; }
  };
  
  const getAgeLabel = (token: any): string => {
    try {
      // Accept multiple possible fields and formats
      let v: any = (
        token?.created_at ?? token?.createdAt ?? token?.listedAt ?? token?.mintedAt ??
        token?.pair_created_at ?? token?.pairCreatedAt ?? token?.pool_created_at ?? token?.poolCreatedAt ??
        token?.exchange_created_at ?? token?.exchangeCreatedAt ?? token?.firstSeen ?? token?.first_seen ??
        token?.launch_time ?? token?.launchTime ??
        token?.timestamp ?? token?.ts ?? token?.block_time ?? token?.blockTime ?? null
      );
      if (v === null || v === undefined) return '-';
      if (typeof v === 'object') {
        if ('Time' in v && typeof (v as any).Time === 'string') v = (v as any).Time;
        else if ('time' in v && typeof (v as any).time === 'string') v = (v as any).time;
        else if ('seconds' in v && typeof (v as any).seconds === 'number') v = Number((v as any).seconds) * 1000;
        else if ('millis' in v && typeof (v as any).millis === 'number') v = Number((v as any).millis);
      }
      let ts: number | null = null;
      if (typeof v === 'number') {
        // Heuristic: treat 13-digit as ms, 10-digit as seconds
        if (v > 1e12) ts = v; else if (v > 1e9) ts = v * 1000; else ts = null;
      } else if (typeof v === 'string') {
        const num = Number(v);
        if (!Number.isNaN(num) && num > 0) {
          if (num > 1e12) ts = num; else if (num > 1e9) ts = num * 1000;
        }
        if (ts === null) {
          const d = Date.parse(v);
          if (!Number.isNaN(d)) ts = d;
        }
      } else if (v instanceof Date) {
        ts = v.getTime();
      }
      if (ts === null) return '-';
      const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
      if (diffSec < 60) return `${diffSec}s`;
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
      return `${Math.floor(diffSec / 86400)}d`;
    } catch {
      return '-';
    }
  };
  return (
    <div className={`shadow-lg flex-1 min-w-[340px] w-full flex flex-col ${isFirstOrLast === "first" ? "border-l border-r" : "border-r"} border-emerald-950`}>
      <div className="text-lg font-bold mb-2 text-white flex items-center justify-between border-t border-b border-emerald-950 p-2">
        {title}
        {/* Optionally add filter/sort controls here */}
      </div>
      <div className="overflow-y-scroll max-h-[70vh] custom-scrollbar">
        {loading && tokens.length === 0 ? (
          Array.from({ length: skeletonRowCount }).map((_, idx) => (
            <div key={idx} className="flex flex-row py-3 border-b border-neutral-800 last:border-b-0 items-center animate-pulse">
              {/* Profile Picture & Address skeleton */}
              <div className="flex flex-col items-center w-16 mr-3">
                <div className="relative w-14 h-14 bg-neutral-800 rounded-full" />
                <div className="h-3 w-12 bg-neutral-800 rounded mt-1" />
              </div>
              {/* Main Info Section skeleton */}
              <div className="flex-1 flex flex-col gap-2 min-w-0">
                <div className="flex flex-row justify-between gap-2">
                  <div className="flex flex-col min-w-0 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-4 w-20 bg-neutral-800 rounded" />
                      <div className="h-3 w-16 bg-neutral-800 rounded" />
                      <div className="h-3 w-6 bg-neutral-800 rounded" />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="h-3 w-8 bg-neutral-800 rounded" />
                      <div className="h-3 w-6 bg-neutral-800 rounded" />
                      <div className="h-3 w-6 bg-neutral-800 rounded" />
                      <div className="h-3 w-6 bg-neutral-800 rounded" />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 min-w-[120px]">
                    <div className="flex gap-3 text-xs">
                      <div className="h-3 w-12 bg-neutral-800 rounded" />
                      <div className="h-3 w-12 bg-neutral-800 rounded" />
                    </div>
                    <div className="flex gap-3 text-xs items-center">
                      <div className="h-3 w-8 bg-neutral-800 rounded" />
                      <div className="h-3 w-8 bg-neutral-800 rounded" />
                    </div>
                  </div>
                </div>
                <div className="flex flex-row items-center justify-between gap-2 mt-1">
                  <div className="flex gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-4 w-10 bg-neutral-800 rounded-full" />
                    ))}
                  </div>
                  <div className="h-7 w-20 bg-neutral-800 rounded-full" />
                </div>
              </div>
            </div>
          ))
        ) : tokens.length === 0 ? (
          <div className="text-neutral-500 text-center py-8">No tokens found.</div>
        ) : (
          tokens.map((token, idx) => {
            const addr = (token as any)?.pair_address || (token as any)?.mint || null;
            return (
            <div
              key={`${addr || 'noaddr'}-${idx}`}
              className="relative cursor-pointer flex flex-row py-3 transition group items-center border-b border-neutral-800 hover:bg-neutral-800/40 w-full"
              onClick={() => { if (addr) router.push(`/trade/${addr}`); }}
            >
              {/* Status popout on hover */}
              <span
                className={`hidden group-hover:flex absolute left-1/2 -translate-x-1/2 px-3 py-1 bg-neutral-900 border shadow-xl text-sm z-20 ${
                  idx === 0 ? 'top-full mt-2' : '-top-7'
                }`}
                style={{ pointerEvents: 'none' }}
              >
                {(() => {
                  // Determine token status based on title and token data
                  const isNewPairs = title.toLowerCase().includes('new');
                  const isFinalStretch = title.toLowerCase().includes('final') || title.toLowerCase().includes('stretch');
                  const isMigrated = title.toLowerCase().includes('migrated');
                  
                  if (isNewPairs) {
                    // Show graduation percentage for new pairs
                    const graduationPercent = typeof token.graduation_percent === 'number' 
                      ? Math.round(token.graduation_percent) 
                      : Math.round(parseFloat(token.graduation_percent || '0'));
                    return (
                      <span className="text-emerald-400 border-emerald-700">
                        Graduation: {graduationPercent}%
                      </span>
                    );
                  } else if (isFinalStretch) {
                    // Show "migrating" for final stretch
                    return (
                      <span className="text-yellow-400 border-yellow-700">
                        Migrating
                      </span>
                    );
                  } else if (isMigrated) {
                    // Show "migrated" for migrated tokens
                    return (
                      <span className="text-blue-400 border-blue-700">
                        Migrated
                      </span>
                    );
                  } else {
                    // Fallback to bonding curve progress
                    const bondingProgress = typeof token.bonding_curve_progress === 'number' 
                      ? Math.round(token.bonding_curve_progress) 
                      : Math.round(parseFloat(token.bonding_curve_progress || '0'));
                    return (
                      <span className="text-emerald-400 border-emerald-700">
                        Bonding: {bondingProgress}%
                      </span>
                    );
                  }
                })()}
              </span>
              {/* Profile Picture & Address */}
              <div className="flex flex-col items-center w-16 mr-3">
                <div className="relative w-14 h-14 bg-neutral-800 rounded-full overflow-x-hidden flex items-center justify-center border border-neutral-700">
                  <TokenImage token={token} />
                  {/* Status indicator */}
                  <span className="absolute bottom-1 right-1 w-3 h-3 bg-green-500 border-2 border-neutral-900 rounded-full" />
                </div>
                <span className="text-xs text-neutral-500 mt-1 font-mono truncate max-w-[60px]">{shortAddr(token)}</span>
              </div>
              {/* Main Info Section */}
              <div className="flex-1 flex flex-col gap-2 min-w-0">
                {/* Top Row */}
                <div className="flex flex-row justify-between gap-2">
                  {/* Left: Token Info & Socials */}
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-white truncate max-w-[90px]">{token.symbol}</span>
                      <span className="text-neutral-400 text-xs truncate max-w-[90px]">{token.name}</span>
                      <button className="ml-1 text-neutral-400 hover:text-white" title="Copy contract">
                        <FaRegCopy size={14} />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-emerald-400">
                      <span>{getAgeLabel(token)}</span>
                      {/* Socials */}
                      <a href={token.links ? (token.links as Record<string, string>)["website"] || '#' : '#'} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300"><FaGlobe title="Website" /></a>
                      <a href={token.links ? (token.links as Record<string, string>)["pumpfun"] || '#' : '#'} target="_blank" rel="noopener noreferrer" className="text-pink-400 hover:text-pink-300"><FaBolt title="Pump.fun" /></a>
                      <a href={token.links ? (token.links as Record<string, string>)["twitter"] || '#' : '#'} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:text-sky-300"><FaUser title="X (Twitter)" /></a>
                    </div>
                  </div>
                  {/* Right: MC, V, F, TX */}
                  <div className="flex flex-col items-end gap-1 min-w-[160px]">
                    <div className="flex gap-3 text-xs">
                      <span className="text-neutral-400">MC <span className="text-blue-400 font-bold">${formatSmartNumber((token as any).fully_diluted_value ?? (token as any).market_cap_usd ?? 0)}</span></span>
                      <span className="text-neutral-400">P <span className="text-white font-bold">${formatSmartNumber((token as any).price_usd ?? (token as any).usd_price ?? 0)}</span></span>
                      <span className="text-neutral-400">V <span className="text-white font-bold">${formatSmartNumber((token as any).volume_24h || 0)}</span></span>
                    </div>
                    <div className="flex gap-3 text-xs items-center">
                      <span className="text-neutral-400 flex items-center gap-1">F <span className="inline-block align-middle"><svg width="12" height="12" viewBox="0 0 24 24"><defs><linearGradient id="solana-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#00FFA3"/><stop offset="100%" stopColor="#DC1FFF"/></linearGradient></defs><rect width="24" height="24" fill="url(#solana-gradient)" rx="4"/></svg></span> <span className="text-emerald-400 font-bold">0</span></span>
                      <span className="text-neutral-400">TX <span className="text-white font-bold">{(token.total_buys_5m ?? 0) + (token.total_sells_5m ?? 0)}</span></span>
                      <span className="text-neutral-400">V5m <span className="text-green-400 font-bold">${formatSmartNumber((token.total_buy_volume_5m ?? 0) + (token.total_sell_volume_5m ?? 0))}</span></span>
                    </div>
                    <div className="flex gap-3 text-xs items-center">
                      <span className="text-neutral-400">W5m <span className="text-blue-400 font-bold">{token.unique_wallets_5m ?? 0}</span></span>
                      <span className="text-neutral-400">B/S <span className="text-yellow-400 font-bold">{token.total_buys_5m ?? 0}/{token.total_sells_5m ?? 0}</span></span>
                    </div>
                  </div>
                </div>
                {/* Bottom Row: Badges & Buy Button */}
                <div className="flex flex-row items-center justify-between gap-2 mt-1">
                  <div className="flex gap-1">
                    {[
                      {icon: <FaUser size={10}/>, label: 'Buyers', value: token.total_buyers_5m ?? 0, color: 'text-green-400'},
                      {icon: <FaCrown size={10}/>, label: 'Sellers', value: token.total_sellers_5m ?? 0, color: 'text-red-400'},
                      {icon: <FaSearch size={10}/>, label: 'Wallets', value: token.unique_wallets_5m ?? 0, color: 'text-blue-400'},
                      {icon: <FaUser size={10}/>, label: '24h TX', value: (token.total_buys_24h ?? 0) + (token.total_sells_24h ?? 0), color: 'text-yellow-400'},
                      {icon: <FaUser size={10}/>, label: 'Vol 24h', value: Math.round((token.total_buy_volume_24h ?? 0) + (token.total_sell_volume_24h ?? 0)), color: 'text-purple-400'}
                    ].map((b, i) => (
                      <span key={i} className={`flex items-center gap-1 bg-neutral-800 ${b.color} text-[10px] px-2 py-0.5 rounded-full border border-neutral-700`}>
                        {b.icon} {b.value}
                      </span>
                    ))}
                  </div>
                  <button className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-full px-4 py-1 transition shadow">
                    <FaBolt className="text-yellow-300" /> 0 SOL
                  </button>
                </div>
              </div>
            </div>
          )})
        )}
      </div>
    </div>
  );
} 
