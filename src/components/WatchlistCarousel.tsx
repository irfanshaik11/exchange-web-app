import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { FaRegStar, FaStar, FaRegCopy } from "react-icons/fa";

import { useWatchlist } from "./WatchlistContext";
import useTrendingWebSocket, {
  type NormalizedTrendingToken,
} from "../hooks/useTrendingWebSocket";
import { formatFixedAbbrev, type Token } from "../utils/db";

/**
 * Watchlist carousel — replaces the legacy "Watchlist ticker" bar in
 * the Header.
 *
 *  - Pinned strip on the left (solid bg, z=1) — user-managed via
 *    `useWatchlist()`. Stays put while the carousel scrolls past
 *    underneath it.
 *  - Infinite-loop scroller on the right (z=0) — sourced from the
 *    existing trending WS so we don't add a new data feed. Items are
 *    rendered twice back-to-back inside one flex row; a CSS keyframe
 *    translates the row by -50% over a long duration, then loops back
 *    to 0 — the duplicate makes the seam invisible.
 *  - Each row shows: star, PFP (16px), SYM, name truncated, tiny
 *    sparkline (synth from %change so we don't fetch OHLC per item),
 *    1h % change, market cap. Mono / tabular-nums for column alignment
 *    across rows.
 *  - Hover any row -> after 200ms, a portal-rendered tooltip styled
 *    like the redesigned Pulse identity row appears below, with a
 *    large star pin/unpin button.
 *  - `prefers-reduced-motion: reduce` swaps the animation for a
 *    horizontally-scrollable static row (no auto-loop).
 *
 * Performance notes:
 *  - CSS-only loop (no rAF / no JS scroll handler).
 *  - Sparkline is a synth 6-point SVG path derived from the
 *    `price_percent_change_1h` field — zero network requests per item.
 *  - Pinned + carousel slice memoized; star clicks update WatchlistContext
 *    which the carousel re-reads.
 */
export function WatchlistCarousel() {
  const { watchlist, isHydrated, addToWatchlist, removeFromWatchlist } =
    useWatchlist();

  // Top markets — reuse the trending WS that /discover already mounts.
  // When /discover isn't mounted yet, the WS still kicks in here (it's a
  // global singleton inside the hook) so the carousel boots from the
  // localStorage snapshot then fills in from live data.
  const { tokens: trendingTokens } = useTrendingWebSocket({
    timeframe: "1h",
    enabled: true,
  });

  // Build the pinned set keyed by mint so the carousel below can skip
  // any token the user has already pinned (no point showing it twice).
  const pinnedMints = useMemo(() => {
    const s = new Set<string>();
    for (const t of watchlist) {
      const m = (t as any).mint || t.pair_address;
      if (m) s.add(m);
    }
    return s;
  }, [watchlist]);

  // Cap the carousel at a sensible row count. Too many rows and the
  // loop duration has to slow to a crawl to keep individual rows
  // legible; too few and the loop seam shows up quickly.
  const CAROUSEL_MAX = 24;
  const carouselItems = useMemo(() => {
    const items: NormalizedTrendingToken[] = [];
    for (const t of trendingTokens) {
      if (pinnedMints.has(t.mint)) continue;
      items.push(t);
      if (items.length >= CAROUSEL_MAX) break;
    }
    return items;
  }, [trendingTokens, pinnedMints]);

  // Empty state: only render the bar's frame; the inner content stays
  // empty so the page chrome doesn't shift around.
  if (!isHydrated) {
    return <div className="flex h-7 items-center" aria-hidden />;
  }

  const hasPinned = watchlist.length > 0;
  const hasCarousel = carouselItems.length > 0;

  return (
    <div className="watchlist-carousel-root flex h-7 flex-1 items-center overflow-hidden">
      {/* Pinned strip — sits ABOVE the carousel (z=1) on a solid bg so
          the scroller visibly passes underneath. The right edge gets a
          tiny linear-gradient mask so the seam between pinned and
          scroller fades instead of slamming. */}
      {hasPinned ? (
        <div
          className="relative z-10 flex shrink-0 items-center gap-1.5 pr-3"
          style={{
            backgroundColor: "#13151b",
            // Right-edge fade so the carousel slides under, not cuts off.
            maskImage:
              "linear-gradient(to right, black calc(100% - 12px), transparent)",
            WebkitMaskImage:
              "linear-gradient(to right, black calc(100% - 12px), transparent)",
          }}
        >
          {watchlist.map((token) => {
            const key =
              (token as any).mint || token.pair_address || token.symbol || "";
            return (
              <WatchlistItem
                key={key}
                token={tokenToCarouselShape(token)}
                pinned
                onPinToggle={() => {
                  const addr =
                    (token as any).mint || token.pair_address || "";
                  if (addr) removeFromWatchlist(addr);
                }}
              />
            );
          })}
        </div>
      ) : null}

      {/* Vertical pipe between pinned + scroller — tiny, faint, only
          shown when both halves have content. */}
      {hasPinned && hasCarousel ? (
        <div
          aria-hidden
          className="h-3.5 w-px shrink-0"
          style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
        />
      ) : null}

      {/* Infinite loop scroller. Two copies of the list back-to-back +
          a CSS keyframe translating -50% gives a seamless loop. Pause
          on hover so users can read a value. */}
      {hasCarousel ? (
        <div className="watchlist-carousel-viewport relative min-w-0 flex-1 overflow-hidden">
          <div className="watchlist-carousel-track flex items-center gap-3 pl-3 pr-3">
            {carouselItems.map((t, i) => {
              const isPinned = pinnedMints.has(t.mint);
              return (
                <WatchlistItem
                  key={`a-${t.mint}-${i}`}
                  token={t}
                  pinned={isPinned}
                  onPinToggle={() => {
                    if (isPinned) {
                      removeFromWatchlist(t.mint);
                    } else {
                      addToWatchlist(trendingToToken(t));
                    }
                  }}
                />
              );
            })}
            {/* Duplicate set — invisible to the eye thanks to the loop
                math (-50% translate spans exactly one copy). */}
            {carouselItems.map((t, i) => {
              const isPinned = pinnedMints.has(t.mint);
              return (
                <WatchlistItem
                  key={`b-${t.mint}-${i}`}
                  token={t}
                  pinned={isPinned}
                  onPinToggle={() => {
                    if (isPinned) {
                      removeFromWatchlist(t.mint);
                    } else {
                      addToWatchlist(trendingToToken(t));
                    }
                  }}
                />
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default WatchlistCarousel;

/* ─────────────────────────────────────────────────────────────────────
   Helpers / types
   ───────────────────────────────────────────────────────────────────── */

interface CarouselToken {
  mint: string;
  symbol: string;
  name: string;
  image?: string;
  marketCap: number;
  changePct1h: number;
}

function tokenToCarouselShape(t: Token): CarouselToken {
  return {
    mint: (t as any).mint || t.pair_address || "",
    symbol: (t as any).symbol || "",
    name: (t as any).name || "",
    image:
      (t as any).image_url ||
      (t as any).image ||
      (t as any).logo ||
      undefined,
    marketCap:
      Number((t as any).market_cap_usd) ||
      Number((t as any).marketCapUSD) ||
      Number((t as any).fully_diluted_value) ||
      0,
    changePct1h:
      Number((t as any).price_percent_change_1h) ||
      Number((t as any).priceChange1h) ||
      0,
  };
}

function normalizeTrendingToken(t: NormalizedTrendingToken): CarouselToken {
  return {
    mint: t.mint,
    symbol: t.symbol,
    name: t.name,
    image: t.image_url || t.image || t.logo,
    marketCap: Number(t.fully_diluted_value) || Number(t.marketCapUsd) || 0,
    changePct1h: Number(t.price_percent_change_1h) || 0,
  };
}

function trendingToToken(t: NormalizedTrendingToken): Token {
  return {
    ...(t as any),
    pair_address: t.contractAddress || t.mint,
  } as unknown as Token;
}

/* ─────────────────────────────────────────────────────────────────────
   Row + tooltip
   ───────────────────────────────────────────────────────────────────── */

interface WatchlistItemProps {
  token: CarouselToken | NormalizedTrendingToken;
  pinned: boolean;
  onPinToggle: () => void;
}

const WatchlistItem = memo(function WatchlistItem({
  token,
  pinned,
  onPinToggle,
}: WatchlistItemProps) {
  const t: CarouselToken =
    "fully_diluted_value" in (token as object)
      ? normalizeTrendingToken(token as NormalizedTrendingToken)
      : (token as CarouselToken);

  const [hovered, setHovered] = useState(false);
  const [anchor, setAnchor] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const itemRef = useRef<HTMLDivElement | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (showTimer.current) clearTimeout(showTimer.current);
    };
  }, []);

  const openTooltip = () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    showTimer.current = setTimeout(() => {
      const el = itemRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setAnchor({
        left: Math.round(r.left + r.width / 2),
        top: Math.round(r.bottom + 6),
      });
      setHovered(true);
    }, 200);
  };
  const closeTooltip = () => {
    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    setHovered(false);
    setAnchor(null);
  };

  const positive = t.changePct1h > 0;
  const negative = t.changePct1h < 0;
  const changeColor = positive
    ? "#22d99a"
    : negative
      ? "#f26681"
      : "#7c8694";
  const sparklineStroke = positive
    ? "#22d99a"
    : negative
      ? "#f26681"
      : "#7c8694";

  const trade = t.mint ? `/trade/${t.mint}` : "#";

  const mcStyle: CSSProperties = {
    fontFamily: "var(--font-geist-mono)",
    fontVariantNumeric: "tabular-nums",
    color: "#cbd2d9",
    fontSize: "10.5px",
    fontWeight: 500,
  };
  const changeStyle: CSSProperties = {
    fontFamily: "var(--font-geist-mono)",
    fontVariantNumeric: "tabular-nums",
    color: changeColor,
    fontSize: "10.5px",
    fontWeight: 500,
  };

  return (
    <>
      <div
        ref={itemRef}
        className="flex shrink-0 items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-white/[0.04]"
        onMouseEnter={openTooltip}
        onMouseLeave={closeTooltip}
      >
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPinToggle();
          }}
          className="flex h-4 w-4 items-center justify-center text-[10px] transition-colors"
          style={{
            color: pinned ? "#f0c54a" : "#5e636c",
          }}
          title={pinned ? "Unpin" : "Pin to watchlist"}
          aria-label={pinned ? "Unpin from watchlist" : "Pin to watchlist"}
          aria-pressed={pinned}
        >
          {pinned ? <FaStar size={10} /> : <FaRegStar size={10} />}
        </button>

        <Link
          href={trade}
          className="flex shrink-0 items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <span
            className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-sm"
            style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
            aria-hidden
          >
            {t.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={t.image}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <span className="text-[8px] text-zinc-500">
                {(t.symbol || "?").slice(0, 1)}
              </span>
            )}
          </span>

          <span
            className="text-[11px] font-semibold leading-none"
            style={{ color: "#f4f4f5" }}
          >
            {t.symbol || "—"}
          </span>

          <span
            className="hidden truncate text-[10.5px] leading-none lg:inline"
            style={{ color: "#7c8694", maxWidth: 84 }}
          >
            {t.name}
          </span>

          <SyntheticSparkline
            changePct={t.changePct1h}
            stroke={sparklineStroke}
          />

          <span style={changeStyle}>
            {positive ? "+" : ""}
            {Math.abs(t.changePct1h) >= 100
              ? `${Math.round(t.changePct1h)}%`
              : `${t.changePct1h.toFixed(2)}%`}
          </span>

          <span style={mcStyle}>
            ${t.marketCap > 0 ? formatFixedAbbrev(t.marketCap) : "—"}
          </span>
        </Link>
      </div>

      {hovered && anchor
        ? createPortal(
            <CarouselTooltip
              token={t}
              pinned={pinned}
              onPinToggle={onPinToggle}
              anchorLeft={anchor.left}
              anchorTop={anchor.top}
            />,
            document.body,
          )
        : null}
    </>
  );
});

/* ─────────────────────────────────────────────────────────────────────
   Synthetic sparkline
   ───────────────────────────────────────────────────────────────────── */

function SyntheticSparkline({
  changePct,
  stroke,
}: {
  changePct: number;
  stroke: string;
}) {
  const W = 44;
  const H = 14;
  const m = Math.max(-50, Math.min(50, changePct));
  const norm = m / 50;
  const points = [0, 0.18, 0.36, 0.56, 0.78, 1].map((x, i) => {
    const lerp = norm * x;
    const wiggle = (i % 2 === 0 ? 0.04 : -0.04) * (1 - x);
    const yNorm = -lerp + wiggle;
    const y = H / 2 + (yNorm * H) / 2.4;
    const px = x * W;
    return `${px.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden
      className="shrink-0"
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Hover tooltip
   ───────────────────────────────────────────────────────────────────── */

function CarouselTooltip({
  token,
  pinned,
  onPinToggle,
  anchorLeft,
  anchorTop,
}: {
  token: CarouselToken;
  pinned: boolean;
  onPinToggle: () => void;
  anchorLeft: number;
  anchorTop: number;
}) {
  const W = 280;
  const vw =
    typeof window !== "undefined" ? window.innerWidth : anchorLeft + W;
  const left = Math.max(
    8,
    Math.min(anchorLeft - W / 2, vw - W - 8),
  );
  const top = anchorTop;

  const positive = token.changePct1h > 0;
  const negative = token.changePct1h < 0;
  const changeColor = positive
    ? "#22d99a"
    : negative
      ? "#f26681"
      : "#7c8694";

  const addr = token.mint;
  const shortAddr = addr
    ? addr.toLowerCase().endsWith("pump")
      ? `${addr.slice(0, 4)}…pump`
      : `${addr.slice(0, 4)}…${addr.slice(-4)}`
    : "";

  const copyAddr = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!addr) return;
    navigator.clipboard?.writeText(addr).catch(() => undefined);
  };

  return (
    <div
      role="tooltip"
      style={{
        position: "fixed",
        left,
        top,
        width: W,
        zIndex: 10005,
        backgroundColor: "#0e0f12",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 8,
        boxShadow: "0 10px 28px rgba(0,0,0,0.45)",
        padding: 10,
        fontFamily: "var(--font-geist-mono)",
        pointerEvents: "auto",
      }}
    >
      <div className="flex items-start gap-2">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md"
          style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
          aria-hidden
        >
          {token.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={token.image}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <span className="text-[10px] text-zinc-500">
              {(token.symbol || "?").slice(0, 1)}
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className="text-[13px] font-semibold leading-tight"
              style={{ color: "#f4f4f5" }}
            >
              {token.symbol}
            </span>
            <span
              className="truncate text-[11px] leading-tight"
              style={{ color: "#7c8694" }}
            >
              {token.name}
            </span>
          </div>
          {addr ? (
            <button
              type="button"
              onClick={copyAddr}
              className="mt-0.5 flex items-center gap-1 text-[10px] leading-none hover:text-white"
              style={{ color: "#7c8694", background: "none", border: "none", padding: 0 }}
              title="Copy address"
            >
              <span>{shortAddr}</span>
              <FaRegCopy size={9} />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPinToggle();
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors"
          style={{
            color: pinned ? "#0e0f12" : "#22d99a",
            backgroundColor: pinned
              ? "#22d99a"
              : "rgba(34, 217, 154, 0.10)",
            border: `1px solid ${pinned ? "#22d99a" : "rgba(34, 217, 154, 0.30)"}`,
          }}
          title={pinned ? "Unpin from watchlist" : "Pin to watchlist"}
          aria-pressed={pinned}
        >
          {pinned ? <FaStar size={11} /> : <FaRegStar size={11} />}
        </button>
      </div>

      <div
        className="mt-2 grid grid-cols-2 gap-2 rounded-md border px-2.5 py-1.5"
        style={{
          borderColor: "rgba(255,255,255,0.06)",
          backgroundColor: "rgba(255,255,255,0.02)",
        }}
      >
        <div className="flex flex-col leading-tight">
          <span
            className="text-[9.5px] uppercase tracking-wider"
            style={{ color: "#5e636c" }}
          >
            MC
          </span>
          <span
            className="text-[12px]"
            style={{
              color: token.marketCap > 0 ? "#f4f4f5" : "#5e636c",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            ${token.marketCap > 0 ? formatFixedAbbrev(token.marketCap) : "—"}
          </span>
        </div>
        <div className="flex flex-col leading-tight">
          <span
            className="text-[9.5px] uppercase tracking-wider"
            style={{ color: "#5e636c" }}
          >
            1H
          </span>
          <span
            className="text-[12px]"
            style={{
              color: changeColor,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {positive ? "+" : ""}
            {token.changePct1h.toFixed(2)}%
          </span>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-center">
        <SyntheticSparkline
          changePct={token.changePct1h}
          stroke={changeColor}
        />
      </div>
    </div>
  );
}
