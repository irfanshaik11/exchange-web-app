import React, { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import {
  type PumpLiveToken,
  formatTimeAgo,
  formatMarketCap,
} from "../hooks/usePumpLive";

interface PumpLiveCardProps {
  token: PumpLiveToken;
  onBuy?: (token: PumpLiveToken) => void;
  onClick?: (token: PumpLiveToken) => void;
  onHover?: (token: PumpLiveToken) => void;
}

// Social link icons
const LinkIcon = () => (
  <svg
    className="h-4 w-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const UserIcon = () => (
  <svg
    className="h-4 w-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const UsersIcon = () => (
  <svg
    className="h-4 w-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const GlobeIcon = () => (
  <svg
    className="h-4 w-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const ReplyIcon = () => (
  <svg
    className="h-3.5 w-3.5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const ClockIcon = () => (
  <svg
    className="h-3.5 w-3.5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

// Live "time ago" label. Isolated so it can tick on its own 1s timer WITHOUT
// re-rendering (or reloading the image of) the memoized card. created_timestamp
// never changes, so if this text lived in the memoized card body it would freeze
// for any token whose other fields are static (exactly the fresh, idle mints
// users watch here).
const TimeAgo = React.memo(function TimeAgo({
  timestamp,
}: {
  timestamp: number;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <span>{formatTimeAgo(timestamp)}</span>;
});

// Max transient-error retries before falling back to the letter placeholder.
// Covers CDN hiccups / 403s on pump.fun + IPFS image hosts. Bounded so a truly
// dead URL settles on the fallback instead of retrying forever.
const MAX_IMG_RETRIES = 2;

// Memoized cover image. Keyed only on `src`, so the card's frequent text
// re-renders (market cap / time) never reload or re-flash the image — only a
// genuine image URL change does. Owns its own load/error/retry state; internal
// state changes still re-render this subcomponent even while the parent card is
// memo-skipped, which is what lets a transient error recover.
const CoverImage = React.memo(function CoverImage({
  src,
  alt,
  fallbackLetter,
}: {
  src?: string;
  alt: string;
  fallbackLetter: string;
}) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const retriesRef = useRef(0);

  // Reset on a genuine URL change.
  useEffect(() => {
    setImageError(false);
    setImageLoading(true);
    setRetry(0);
    retriesRef.current = 0;
  }, [src]);

  if (imageError || !src) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#1a2b4a] to-[#0d1520]">
        <span className="text-4xl font-bold text-[#3a4a6a]">
          {fallbackLetter}
        </span>
      </div>
    );
  }

  // Cache-bust on retry so the browser actually re-requests after a failure.
  const finalSrc =
    retry > 0 ? `${src}${src.includes("?") ? "&" : "?"}_r=${retry}` : src;

  return (
    <>
      {imageLoading && (
        <div className="absolute inset-0 animate-pulse bg-[#13141A]" />
      )}
      <Image
        key={retry}
        src={finalSrc}
        alt={alt}
        fill
        className={`object-cover transition-opacity duration-300 ${imageLoading ? "opacity-0" : "opacity-100"}`}
        onLoad={() => setImageLoading(false)}
        onError={() => {
          if (retriesRef.current < MAX_IMG_RETRIES) {
            retriesRef.current += 1;
            const attempt = retriesRef.current;
            setTimeout(() => {
              setImageLoading(true);
              setRetry(attempt);
            }, 1000 * attempt);
          } else {
            setImageError(true);
            setImageLoading(false);
          }
        }}
        unoptimized
      />
    </>
  );
});

// Memoized small avatar. Same rationale — isolated so it never reloads on the
// card's text re-renders, with the same bounded transient-error retry.
const Avatar = React.memo(function Avatar({
  src,
  fallbackLetter,
}: {
  src?: string;
  fallbackLetter: string;
}) {
  const [imageError, setImageError] = useState(false);
  const [retry, setRetry] = useState(0);
  const retriesRef = useRef(0);

  useEffect(() => {
    setImageError(false);
    setRetry(0);
    retriesRef.current = 0;
  }, [src]);

  const finalSrc =
    src && retry > 0
      ? `${src}${src.includes("?") ? "&" : "?"}_r=${retry}`
      : src;

  return (
    <div className="relative h-6 w-6 flex-shrink-0 overflow-hidden rounded-full bg-[#2A2B33]">
      {!imageError && finalSrc ? (
        <Image
          key={retry}
          src={finalSrc}
          alt=""
          fill
          className="object-cover"
          unoptimized
          onError={() => {
            if (retriesRef.current < MAX_IMG_RETRIES) {
              retriesRef.current += 1;
              const attempt = retriesRef.current;
              setTimeout(() => setRetry(attempt), 1000 * attempt);
            } else {
              setImageError(true);
            }
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-[#9CA3AF]">
          {fallbackLetter}
        </div>
      )}
    </div>
  );
});

function PumpLiveCardInner({
  token,
  onBuy,
  onClick,
  onHover,
}: PumpLiveCardProps) {
  const handleClick = useCallback(() => {
    onClick?.(token);
  }, [onClick, token]);

  const handleBuyClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onBuy?.(token);
    },
    [onBuy, token],
  );

  const handleSocialClick = useCallback((e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, []);

  const marketCapFormatted = formatMarketCap(token.usd_market_cap || 0);

  // Get first letter for fallback avatar
  const fallbackLetter = (
    token.name?.[0] ||
    token.symbol?.[0] ||
    "?"
  ).toUpperCase();

  // Determine if we have valid social links
  const hasTwitter = !!token.twitter;
  const hasTelegram = !!token.telegram;
  const hasWebsite = !!token.website;

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => onHover?.(token)}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-transparent bg-[#1E1F26] transition-all duration-200 hover:border-[#2A2B33] hover:shadow-lg hover:shadow-black/20"
    >
      {/* Image Container */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#13141A]">
        {/* LIVE Badge */}
        <div className="absolute top-2 left-2 z-10 rounded bg-[#00C896] px-2 py-0.5 text-[10px] font-bold tracking-wide text-black uppercase">
          LIVE
        </div>

        {/* Token Image (memoized — won't reload on text re-renders) */}
        <CoverImage
          src={token.image_uri}
          alt={token.name || "Token"}
          fallbackLetter={fallbackLetter}
        />

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 transition-colors duration-200 group-hover:bg-black/20" />
      </div>

      {/* Content */}
      <div className="flex flex-col gap-2 p-3">
        {/* Header: Avatar + Name + MC */}
        <div className="flex items-center gap-2">
          {/* Small Avatar (memoized) */}
          <Avatar src={token.image_uri} fallbackLetter={fallbackLetter} />

          {/* Name */}
          <span className="flex-1 truncate text-sm font-semibold text-[#E6E7EA]">
            {token.name || token.symbol || "Unknown"}
          </span>

          {/* Market Cap */}
          <span className="text-sm font-semibold whitespace-nowrap text-[#00E5BE]">
            MC {marketCapFormatted}
          </span>
        </div>

        {/* Description */}
        <p className="line-clamp-2 min-h-[32px] text-xs text-[#9CA3AF]">
          {token.description || "No description available"}
        </p>

        {/* Stats Row: Replies + Time */}
        <div className="flex items-center gap-3 text-[11px] text-[#6B7280]">
          <div className="flex items-center gap-1">
            <ReplyIcon />
            <span>{token.reply_count || 0}</span>
          </div>
          <div className="flex items-center gap-1">
            <ClockIcon />
            <TimeAgo timestamp={token.created_timestamp} />
          </div>
        </div>

        {/* Footer: Social Links + Buy Button */}
        <div className="flex items-center justify-between border-t border-[#2A2B33]/50 pt-1">
          {/* Social Links */}
          <div className="flex items-center gap-2">
            {/* Pump.fun link (always show) */}
            <button
              onClick={(e) =>
                handleSocialClick(e, `https://pump.fun/${token.mint}`)
              }
              className="p-1 text-[#6B7280] transition-colors hover:text-[#00E5BE]"
              title="View on Pump.fun"
            >
              <LinkIcon />
            </button>

            {/* Twitter/X */}
            {hasTwitter && (
              <button
                onClick={(e) => handleSocialClick(e, token.twitter)}
                className="p-1 text-[#6B7280] transition-colors hover:text-[#00E5BE]"
                title="Twitter/X"
              >
                <UserIcon />
              </button>
            )}

            {/* Telegram */}
            {hasTelegram && (
              <button
                onClick={(e) => handleSocialClick(e, token.telegram)}
                className="p-1 text-[#6B7280] transition-colors hover:text-[#00E5BE]"
                title="Telegram"
              >
                <UsersIcon />
              </button>
            )}

            {/* Website */}
            {hasWebsite && (
              <button
                onClick={(e) => handleSocialClick(e, token.website)}
                className="p-1 text-[#6B7280] transition-colors hover:text-[#00E5BE]"
                title="Website"
              >
                <GlobeIcon />
              </button>
            )}
          </div>

          {/* Buy Button */}
          <button
            onClick={handleBuyClick}
            className="flex items-center gap-1 rounded-md bg-[#00E5BE]/10 px-3 py-1.5 text-xs font-semibold text-[#00E5BE] transition-colors hover:bg-[#00E5BE]/20"
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            Buy
          </button>
        </div>
      </div>
    </div>
  );
}

// Re-render a card only when a DISPLAYED field actually changes (or a callback
// ref changes — which, with PumpLiveGrid's stabilized callbacks, it won't).
// usePumpLive hands back brand-new token objects every 10s poll, so a plain
// shallow/identity memo would still re-render (and reload images) every poll;
// comparing the rendered fields means an unchanged card is a true no-op.
//
// LOAD-BEARING: a skipped re-render means handleBuyClick closes over the
// previous token object. That is safe today because every field the buy path
// reads is either in this comparator (mint/name/symbol/image) or immutable per
// mint (bonding_curve is a deterministic pump.fun PDA; PumpLive lists only
// pre-graduation tokens with a hardcoded "Pumpfun" pool type). If graduated /
// migrated tokens ever appear here (pool/poolType can change for a mint), add
// the buy-relevant fields below or the buy could use stale routing data.
function tokenFieldsEqual(a: PumpLiveToken, b: PumpLiveToken): boolean {
  return (
    a.mint === b.mint &&
    a.name === b.name &&
    a.symbol === b.symbol &&
    a.image_uri === b.image_uri &&
    a.usd_market_cap === b.usd_market_cap &&
    a.created_timestamp === b.created_timestamp &&
    a.reply_count === b.reply_count &&
    a.description === b.description &&
    a.twitter === b.twitter &&
    a.telegram === b.telegram &&
    a.website === b.website
  );
}

const PumpLiveCard = React.memo(
  PumpLiveCardInner,
  (prev, next) =>
    prev.onBuy === next.onBuy &&
    prev.onClick === next.onClick &&
    prev.onHover === next.onHover &&
    tokenFieldsEqual(prev.token, next.token),
);

export default PumpLiveCard;
