import React, { useState, useCallback } from 'react';
import Image from 'next/image';
import { type PumpLiveToken, formatTimeAgo, formatMarketCap } from '../hooks/usePumpLive';

interface PumpLiveCardProps {
  token: PumpLiveToken;
  onBuy?: (token: PumpLiveToken) => void;
  onClick?: (token: PumpLiveToken) => void;
  onHover?: (token: PumpLiveToken) => void;
}

// Social link icons
const LinkIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const UserIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const UsersIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const GlobeIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const ReplyIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

export default function PumpLiveCard({ token, onBuy, onClick, onHover }: PumpLiveCardProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  const handleClick = useCallback(() => {
    onClick?.(token);
  }, [onClick, token]);

  const handleBuyClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onBuy?.(token);
  }, [onBuy, token]);

  const handleSocialClick = useCallback((e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  const marketCapFormatted = formatMarketCap(token.usd_market_cap || 0);
  const timeAgo = formatTimeAgo(token.created_timestamp);

  // Get first letter for fallback avatar
  const fallbackLetter = (token.name?.[0] || token.symbol?.[0] || '?').toUpperCase();

  // Determine if we have valid social links
  const hasTwitter = !!token.twitter;
  const hasTelegram = !!token.telegram;
  const hasWebsite = !!token.website;
  const hasSocials = hasTwitter || hasTelegram || hasWebsite;

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => onHover?.(token)}
      className="group relative flex flex-col bg-[#1E1F26] rounded-xl overflow-hidden cursor-pointer
                 border border-transparent hover:border-[#2A2B33] transition-all duration-200
                 hover:shadow-lg hover:shadow-black/20"
    >
      {/* Image Container */}
      <div className="relative aspect-[16/10] w-full bg-[#13141A] overflow-hidden">
        {/* LIVE Badge */}
        <div className="absolute top-2 left-2 z-10 px-2 py-0.5 bg-[#00C896] rounded text-[10px] font-bold text-black uppercase tracking-wide">
          LIVE
        </div>

        {/* Token Image */}
        {!imageError && token.image_uri ? (
          <>
            {imageLoading && (
              <div className="absolute inset-0 bg-[#13141A] animate-pulse" />
            )}
            <Image
              src={token.image_uri}
              alt={token.name || 'Token'}
              fill
              className={`object-cover transition-opacity duration-300 ${imageLoading ? 'opacity-0' : 'opacity-100'}`}
              onLoad={() => setImageLoading(false)}
              onError={() => {
                setImageError(true);
                setImageLoading(false);
              }}
              unoptimized
            />
          </>
        ) : (
          // Fallback gradient with letter
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#1a2b4a] to-[#0d1520]">
            <span className="text-4xl font-bold text-[#3a4a6a]">{fallbackLetter}</span>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200" />
      </div>

      {/* Content */}
      <div className="flex flex-col p-3 gap-2">
        {/* Header: Avatar + Name + MC */}
        <div className="flex items-center gap-2">
          {/* Small Avatar */}
          <div className="relative w-6 h-6 rounded-full overflow-hidden bg-[#2A2B33] flex-shrink-0">
            {!imageError && token.image_uri ? (
              <Image
                src={token.image_uri}
                alt=""
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-[#9CA3AF]">
                {fallbackLetter}
              </div>
            )}
          </div>

          {/* Name */}
          <span className="flex-1 text-sm font-semibold text-[#E6E7EA] truncate">
            {token.name || token.symbol || 'Unknown'}
          </span>

          {/* Market Cap */}
          <span className="text-sm font-semibold text-[#00E5BE] whitespace-nowrap">
            MC {marketCapFormatted}
          </span>
        </div>

        {/* Description */}
        <p className="text-xs text-[#9CA3AF] line-clamp-2 min-h-[32px]">
          {token.description || 'No description available'}
        </p>

        {/* Stats Row: Replies + Time */}
        <div className="flex items-center gap-3 text-[11px] text-[#6B7280]">
          <div className="flex items-center gap-1">
            <ReplyIcon />
            <span>{token.reply_count || 0}</span>
          </div>
          <div className="flex items-center gap-1">
            <ClockIcon />
            <span>{timeAgo}</span>
          </div>
        </div>

        {/* Footer: Social Links + Buy Button */}
        <div className="flex items-center justify-between pt-1 border-t border-[#2A2B33]/50">
          {/* Social Links */}
          <div className="flex items-center gap-2">
            {/* Pump.fun link (always show) */}
            <button
              onClick={(e) => handleSocialClick(e, `https://pump.fun/${token.mint}`)}
              className="p-1 text-[#6B7280] hover:text-[#00E5BE] transition-colors"
              title="View on Pump.fun"
            >
              <LinkIcon />
            </button>

            {/* Twitter/X */}
            {hasTwitter && (
              <button
                onClick={(e) => handleSocialClick(e, token.twitter)}
                className="p-1 text-[#6B7280] hover:text-[#00E5BE] transition-colors"
                title="Twitter/X"
              >
                <UserIcon />
              </button>
            )}

            {/* Telegram */}
            {hasTelegram && (
              <button
                onClick={(e) => handleSocialClick(e, token.telegram)}
                className="p-1 text-[#6B7280] hover:text-[#00E5BE] transition-colors"
                title="Telegram"
              >
                <UsersIcon />
              </button>
            )}

            {/* Website */}
            {hasWebsite && (
              <button
                onClick={(e) => handleSocialClick(e, token.website)}
                className="p-1 text-[#6B7280] hover:text-[#00E5BE] transition-colors"
                title="Website"
              >
                <GlobeIcon />
              </button>
            )}
          </div>

          {/* Buy Button */}
          <button
            onClick={handleBuyClick}
            className="flex items-center gap-1 px-3 py-1.5 bg-[#00E5BE]/10 hover:bg-[#00E5BE]/20
                       text-[#00E5BE] text-xs font-semibold rounded-md transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            Buy
          </button>
        </div>
      </div>
    </div>
  );
}
