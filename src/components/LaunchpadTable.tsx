import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { FaExternalLinkAlt, FaChartLine, FaRocket, FaCheckCircle, FaArrowUp } from 'react-icons/fa';

interface LaunchpadToken {
  mint: string;
  name: string;
  symbol: string;
  priceUsd: number;
  marketCapUsd: number;
  volume24h: number;
  priceChange24h: number;
  graduationPercent: number;
  protocol: string;
  launchpadName: string;
  state: string;
  createdAt: string;
  migratedAt?: string;
  completedAt?: string;
}

interface LaunchpadTableProps {
  title: string;
  tokens: LaunchpadToken[];
  isFirstOrLast?: 'first' | 'last' | 'middle';
  loading?: boolean;
  skeletonRowCount?: number;
}

function TokenImage({ token }: { token: LaunchpadToken }) {
  // For now, just show the first letter of the symbol
  return (
    <span className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
      {token.symbol?.[0] || '?'}
    </span>
  );
}

function GraduationBar({ percent }: { percent: number }) {
  const getColor = (pct: number) => {
    if (pct >= 100) return 'bg-green-500';
    if (pct >= 80) return 'bg-yellow-500';
    if (pct >= 60) return 'bg-orange-500';
    return 'bg-blue-500';
  };

  return (
    <div className="w-full bg-neutral-700 rounded-full h-2">
      <div
        className={`h-2 rounded-full transition-all duration-300 ${getColor(percent)}`}
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
}

function ProtocolBadge({ protocol }: { protocol: string }) {
  const getProtocolColor = (proto: string) => {
    switch (proto.toLowerCase()) {
      case 'pump.fun':
        return 'bg-pink-500/20 text-pink-400 border-pink-500/30';
      case 'raydium':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'meteora':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      default:
        return 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30';
    }
  };

  return (
    <span className={`px-2 py-1 text-xs rounded border ${getProtocolColor(protocol)}`}>
      {protocol}
    </span>
  );
}

export default function LaunchpadTable({ 
  title, 
  tokens, 
  isFirstOrLast, 
  loading = false, 
  skeletonRowCount = 10 
}: LaunchpadTableProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const router = useRouter();

  const formatNumber = (num: number) => {
    if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
    return `$${num.toFixed(2)}`;
  };

  const formatPercent = (num: number) => {
    return `${num.toFixed(1)}%`;
  };

  const getStateIcon = (state: string) => {
    switch (state) {
      case 'new':
        return <FaRocket className="text-blue-400" />;
      case 'completing':
        return <FaChartLine className="text-yellow-400" />;
      case 'completed':
        return <FaCheckCircle className="text-green-400" />;
      case 'migrated':
        return <FaArrowUp className="text-purple-400" />;
      default:
        return <FaRocket className="text-neutral-400" />;
    }
  };

  return (
    <div className={`shadow-lg flex-1 min-w-[380px] w-full flex flex-col ${
      isFirstOrLast === "first" ? "border-l border-r" : "border-r"
    } border-emerald-950`}>
      <div className="text-lg font-bold mb-2 text-white flex items-center justify-between border-t border-b border-emerald-950 p-3">
        <div className="flex items-center gap-2">
          {getStateIcon(tokens[0]?.state || 'new')}
          {title}
        </div>
        <span className="text-sm text-neutral-400">{tokens.length}</span>
      </div>
      
      <div className="overflow-y-scroll max-h-[70vh] custom-scrollbar">
        {loading ? (
          Array.from({ length: skeletonRowCount }).map((_, idx) => (
            <div key={idx} className="flex flex-row py-3 border-b border-neutral-800 last:border-b-0 items-center animate-pulse">
              <div className="flex flex-col items-center w-16 mr-3">
                <div className="relative w-14 h-14 bg-neutral-800 rounded-full" />
                <div className="h-3 w-12 bg-neutral-800 rounded mt-1" />
              </div>
              <div className="flex-1 flex flex-col gap-2 min-w-0">
                <div className="h-4 w-24 bg-neutral-800 rounded" />
                <div className="h-3 w-16 bg-neutral-800 rounded" />
                <div className="h-2 w-full bg-neutral-800 rounded" />
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="h-4 w-16 bg-neutral-800 rounded" />
                <div className="h-3 w-12 bg-neutral-800 rounded" />
              </div>
            </div>
          ))
        ) : tokens.length === 0 ? (
          <div className="text-center text-neutral-500 py-8">
            No tokens found
          </div>
        ) : (
          tokens.map((token, idx) => (
            <div
              key={token.mint}
              className={`flex flex-row py-3 border-b border-neutral-800 last:border-b-0 items-center cursor-pointer transition-colors ${
                hoveredIdx === idx ? 'bg-neutral-800/50' : 'hover:bg-neutral-800/30'
              }`}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => router.push(`/trade/${token.mint}`)}
            >
              {/* Token Image & Address */}
              <div className="flex flex-col items-center w-16 mr-3">
                <TokenImage token={token} />
                <span className="text-xs text-neutral-400 mt-1 truncate w-full text-center">
                  {token.mint.slice(0, 4)}...{token.mint.slice(-4)}
                </span>
              </div>

              {/* Main Info Section */}
              <div className="flex-1 flex flex-col gap-2 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white truncate">
                    {token.name || 'Unknown'}
                  </span>
                  <span className="text-neutral-400 text-sm">
                    {token.symbol || 'UNK'}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <ProtocolBadge protocol={token.protocol} />
                  <span className="text-xs text-neutral-500">
                    {token.launchpadName}
                  </span>
                </div>

                {/* Graduation Progress Bar */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-400 min-w-0">
                    {formatPercent(token.graduationPercent)}
                  </span>
                  <GraduationBar percent={token.graduationPercent} />
                </div>
              </div>

              {/* Price & Market Cap */}
              <div className="flex flex-col items-end gap-1 min-w-0">
                <div className="text-right">
                  <div className="text-white font-semibold">
                    {formatNumber(token.priceUsd)}
                  </div>
                  <div className={`text-xs flex items-center gap-1 ${
                    token.priceChange24h >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {token.priceChange24h >= 0 ? '+' : ''}{formatPercent(token.priceChange24h)}
                  </div>
                </div>
                <div className="text-xs text-neutral-400">
                  {formatNumber(token.marketCapUsd)}
                </div>
                <div className="text-xs text-neutral-500">
                  Vol: {formatNumber(token.volume24h)}
                </div>
              </div>

              {/* External Link */}
              <div className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <FaExternalLinkAlt className="text-neutral-500 text-sm" />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

