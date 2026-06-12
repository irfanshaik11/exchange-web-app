import {
  memo,
  useCallback,
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

const CAROUSEL_MAX = 24;
// The carousel scrolls continuously — users can't read individual values
// at scroll speed, so refreshing on every WS push (multiple/sec) wastes
// render cycles on 48 items. Snapshot every 15s instead.
const CAROUSEL_THROTTLE_MS = 15_000;

export function WatchlistCarousel() {
  const { watchlist, isHydrated, addToWatchlist, removeFromWatchlist } =
    useWatchlist();

  const { tokens: trendingTokens } = useTrendingWebSocket({
    timeframe: "1h",
    enabled: true,
  });

  /* ── Throttle carousel data ──────────────────────────────────────── */
  const latestTokensRef = useRef(trendingTokens);
  latestTokensRef.current = trendingTokens;
  const [carouselTokens, setCarouselTokens] = useState(trendingTokens);

  // Show data immediately on first load
  useEffect(() => {
    if (carouselTokens.length === 0 && trendingTokens.length > 0) {
      setCarouselTokens(trendingTokens);
    }
  }, [trendingTokens]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh from latest WS data every CAROUSEL_THROTTLE_MS
  useEffect(() => {
    const id = setInterval(() => {
      setCarouselTokens(latestTokensRef.current);
    }, CAROUSEL_THROTTLE_MS);
    return () => clearInterval(id);
  }, []);

  /* ── Pinned set ──────────────────────────────────────────────────── */
  const pinnedMints = useMemo(() => {
    const s = new Set<string>();
    for (const t of watchlist) {
      const m = (t as any).mint || t.pair_address;
      if (m) s.add(m);
    }
    return s;
  }, [watchlist]);

  /* ── Carousel items (filtered, capped) ───────────────────────────── */
  const carouselItems = useMemo(() => {
    const items: NormalizedTrendingToken[] = [];
    for (const t of carouselTokens) {
      if (pinnedMints.has(t.mint)) continue;
      items.push(t);
      if (items.length >= CAROUSEL_MAX) break;
    }
    return items;
  }, [carouselTokens, pinnedMints]);

  /* ── Tooltip state (single instance for all 48 items) ────────────── */
  const [tooltip, setTooltip] = useState<{
    mint: string;
    left: number;
    top: number;
  } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onItemEnter = useCallback((mint: string, el: HTMLElement) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      const r = el.getBoundingClientRect();
      setTooltip({
        mint,
        left: Math.round(r.left + r.width / 2),
        top: Math.round(r.bottom + 6),
      });
    }, 200);
  }, []);

  const onItemLeave = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setTooltip(null);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    };
  }, []);

  /* ── Stable pin/unpin callbacks ──────────────────────────────────── */
  const trendingByMint = useMemo(() => {
    const map = new Map<string, NormalizedTrendingToken>();
    for (const t of carouselTokens) map.set(t.mint, t);
    return map;
  }, [carouselTokens]);

  const handlePin = useCallback(
    (mint: string) => {
      if (pinnedMints.has(mint)) {
        removeFromWatchlist(mint);
      } else {
        const token = trendingByMint.get(mint);
        if (token) addToWatchlist(trendingToToken(token));
      }
    },
    [pinnedMints, trendingByMint, addToWatchlist, removeFromWatchlist],
  );

  const handleUnpin = useCallback(
    (mint: string) => {
      if (mint) removeFromWatchlist(mint);
    },
    [removeFromWatchlist],
  );

  /* ── Empty state ─────────────────────────────────────────────────── */
  if (!isHydrated) {
    return <div className="flex h-7 items-center" aria-hidden />;
  }

  const hasPinned = watchlist.length > 0;
  const hasCarousel = carouselItems.length > 0;

  // Resolve tooltip token for the single portal
  const tooltipData = tooltip
    ? (() => {
        const ct = carouselItems.find((t) => t.mint === tooltip.mint);
        if (ct)
          return {
            token: normalizeTrendingToken(ct),
            pinned: pinnedMints.has(ct.mint),
          };
        const wt = watchlist.find(
          (t) => ((t as any).mint || t.pair_address) === tooltip.mint,
        );
        if (wt) return { token: tokenToCarouselShape(wt), pinned: true };
        return null;
      })()
    : null;

  return (
    <div className="watchlist-carousel-root flex h-7 flex-1 items-center overflow-hidden">
      {hasPinned ? (
        <div
          className="relative z-10 flex shrink-0 items-center gap-1.5 pr-3"
          style={{
            backgroundColor: "#13151b",
            maskImage:
              "linear-gradient(to right, black calc(100% - 12px), transparent)",
            WebkitMaskImage:
              "linear-gradient(to right, black calc(100% - 12px), transparent)",
          }}
        >
          {watchlist.map((token) => {
            const mint =
              (token as any).mint || token.pair_address || token.symbol || "";
            return (
              <WatchlistItem
                key={mint}
                token={tokenToCarouselShape(token)}
                pinned
                mint={mint}
                onPin={handleUnpin}
                onMouseEnter={onItemEnter}
                onMouseLeave={onItemLeave}
              />
            );
          })}
        </div>
      ) : null}

      {hasPinned && hasCarousel ? (
        <div
          aria-hidden
          className="h-3.5 w-px shrink-0"
          style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
        />
      ) : null}

      {hasCarousel ? (
        <div className="watchlist-carousel-viewport relative min-w-0 flex-1 overflow-hidden">
          <div className="watchlist-carousel-track flex items-center gap-3 pl-3 pr-3">
            {carouselItems.map((t, i) => (
              <WatchlistItem
                key={`a-${t.mint}-${i}`}
                token={t}
                pinned={pinnedMints.has(t.mint)}
                mint={t.mint}
                onPin={handlePin}
                onMouseEnter={onItemEnter}
                onMouseLeave={onItemLeave}
              />
            ))}
            {carouselItems.map((t, i) => (
              <WatchlistItem
                key={`b-${t.mint}-${i}`}
                token={t}
                pinned={pinnedMints.has(t.mint)}
                mint={t.mint}
                onPin={handlePin}
                onMouseEnter={onItemEnter}
                onMouseLeave={onItemLeave}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* Single tooltip portal for the entire carousel */}
      {tooltip && tooltipData
        ? createPortal(
            <CarouselTooltip
              token={tooltipData.token}
              pinned={tooltipData.pinned}
              onPinToggle={() => handlePin(tooltip.mint)}
              anchorLeft={tooltip.left}
              anchorTop={tooltip.top}
            />,
            document.body,
          )
        : null}
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
  mint: string;
  onPin: (mint: string) => void;
  onMouseEnter: (mint: string, el: HTMLElement) => void;
  onMouseLeave: () => void;
}

// Hoisted style objects — avoids 48 identical allocations per render cycle.
const MC_STYLE: CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontVariantNumeric: "tabular-nums",
  color: "#cbd2d9",
  fontSize: "10.5px",
  fontWeight: 500,
};
const CHANGE_STYLE_POS: CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontVariantNumeric: "tabular-nums",
  color: "#22d99a",
  fontSize: "10.5px",
  fontWeight: 500,
};
const CHANGE_STYLE_NEG: CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontVariantNumeric: "tabular-nums",
  color: "#f26681",
  fontSize: "10.5px",
  fontWeight: 500,
};
const CHANGE_STYLE_NEUTRAL: CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontVariantNumeric: "tabular-nums",
  color: "#7c8694",
  fontSize: "10.5px",
  fontWeight: 500,
};

const WatchlistItem = memo(function WatchlistItem({
  token,
  pinned,
  mint,
  onPin,
  onMouseEnter,
  onMouseLeave,
}: WatchlistItemProps) {
  const t: CarouselToken =
    "fully_diluted_value" in (token as object)
      ? normalizeTrendingToken(token as NormalizedTrendingToken)
      : (token as CarouselToken);

  const itemRef = useRef<HTMLDivElement>(null);

  const positive = t.changePct1h > 0;
  const negative = t.changePct1h < 0;
  const changeColor = positive
    ? "#22d99a"
    : negative
      ? "#f26681"
      : "#7c8694";

  const trade = t.mint ? `/trade/${t.mint}` : "#";
  const changeStyle = positive
    ? CHANGE_STYLE_POS
    : negative
      ? CHANGE_STYLE_NEG
      : CHANGE_STYLE_NEUTRAL;

  return (
    <div
      ref={itemRef}
      className="flex shrink-0 items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-white/[0.04]"
      onMouseEnter={() =>
        itemRef.current && onMouseEnter(mint, itemRef.current)
      }
      onMouseLeave={onMouseLeave}
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onPin(mint);
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

        <SyntheticSparkline changePct={t.changePct1h} stroke={changeColor} />

        <span style={changeStyle}>
          {positive ? "+" : ""}
          {Math.abs(t.changePct1h) >= 100
            ? `${Math.round(t.changePct1h)}%`
            : `${t.changePct1h.toFixed(2)}%`}
        </span>

        <span style={MC_STYLE}>
          ${t.marketCap > 0 ? formatFixedAbbrev(t.marketCap) : "—"}
        </span>
      </Link>
    </div>
  );
});

/* ─────────────────────────────────────────────────────────────────────
   Synthetic sparkline
   ───────────────────────────────────────────────────────────────────── */

const SyntheticSparkline = memo(function SyntheticSparkline({
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
});

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
