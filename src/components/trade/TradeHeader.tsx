import React from "react";
import type { Token } from "~/utils/db";
import { formatSmartNumber } from "~/utils/db";
import { useWatchlist } from "../WatchlistContext";
import { fetchTokenMetadata } from "~/utils/functions";
import { SubscriptNumber } from "../InterstateTable";

import { IoShareSocialOutline } from "react-icons/io5";
import { FaRegStar, FaStar, FaGlobe, FaUser, FaSearch, FaExpand } from "react-icons/fa";
import { FiCopy } from "react-icons/fi";

/* ---------- AXIOM palette ---------- */
const AX = {
  bg: "#101114",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#E6E7EA",
  muted: "#9CA3AF",
  mint: "#70E0B0",
  green: "#38D39F",
};

/* ---------- helpers ---------- */
function getTokenAge(createdAt: string) {
  const createdDate = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - createdDate.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  return `${diffMins}m`;
}

// Make NFT/token images work across ipfs/arweave/http
function normalizeAssetUrl(raw?: string): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.startsWith("data:")) return s;

  if (s.startsWith("ipfs://")) {
    const cid = s.replace("ipfs://", "").replace(/^ipfs\//, "");
    return `https://cloudflare-ipfs.com/ipfs/${cid}`;
  }
  if (/^ipfs[/:]/i.test(s)) {
    const cid = s.replace(/^ipfs[/:]/i, "");
    return `https://cloudflare-ipfs.com/ipfs/${cid}`;
  }

  if (/^[a-z0-9_-]{40,}$/i.test(s) && !/^https?:\/\//i.test(s)) {
    return `https://arweave.net/${s}`;
  }

  if (s.startsWith("http://")) return s.replace(/^http:\/\//i, "https://");
  if (s.startsWith("https://")) return s;

  return null;
}

const tokenMetadataCache: Record<string, any> = {};
function useTokenMetadata(uri?: string) {
  const [meta, setMeta] = React.useState<any | null>(null);
  const [loading, setLoading] = React.useState(!!uri);
  const [showInitial, setShowInitial] = React.useState(false);

  React.useEffect(() => {
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
    const timer = setTimeout(() => setShowInitial(true), 400);
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

/* ---------- tiny UI atoms ---------- */
function StatInline({
  label,
  children,
  accent,
}: {
  label: string;
  children: React.ReactNode;
  accent?: "green";
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[12px] tracking-wide" style={{ color: AX.muted }}>
        {label}
      </span>
      <span
        className="text-[13px] font-semibold"
        style={{ color: accent === "green" ? AX.green : AX.text }}
      >
        {children}
      </span>
    </div>
  );
}

const Tooltip: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => {
  const [show, setShow] = React.useState(false);
  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
      tabIndex={0}
    >
      {children}
      {show && (
        <span
          className="absolute -top-2 right-1/2 translate-y-[-100%] translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[11px] text-white shadow"
          style={{ background: "#0E0F12" }}
        >
          {label}
        </span>
      )}
    </span>
  );
};

/* ===================================================================== */

interface TradeHeaderProps {
  token: Token;
}

const TradeHeader: React.FC<TradeHeaderProps> = ({ token }) => {
  const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlist();
  const isWatched = isInWatchlist(token.pair_address);
  const { meta, loading, showInitial } = useTokenMetadata(token.uri);

  const handleWatchlistClick = () => {
    if (isWatched) removeFromWatchlist(token.pair_address);
    else addToWatchlist(token);
  };

  // values like your screenshot
  const mcap = token.market_cap_usd ?? 0;
  const price = token.usd_price ?? (token as any).price_usd ?? (token as any).price ?? 0;
  const liq = token.total_liquidity_usd ?? (token as any).liquidity_usd ?? 0;
  const supply = token.total_supply ?? (token as any).supply ?? 0;
  const feesPaid = (token as any).global_fees_paid ?? (token as any).globalFeesPaid ?? "—";
  const curvePct =
    (token as any).bonding_pct ??
    (token as any).bonding_curve_progress ??
    (token as any).bcurve ??
    0;

  const imgSrc =
    normalizeAssetUrl(meta?.image) ||
    normalizeAssetUrl((meta?.properties as any)?.image) ||
    normalizeAssetUrl((token as any).logo) ||
    null;

  return (
    <div
      className="flex w-full items-center gap-6 px-2 py-2"
      style={{ background: "transparent", color: AX.text, fontFamily: 'Inter, ui-sans-serif, system-ui' }}
    >
      {/* LEFT: avatar + name block */}
      <div className="flex min-w-0 items-center gap-3">
        {/* avatar with robust fallbacks */}
        {loading && !showInitial ? (
          <div className="h-9 w-9 animate-pulse rounded-md" style={{ background: AX.surface2 }} />
        ) : imgSrc ? (
          <img
            src={imgSrc}
            alt={token.name}
            width={36}
            height={36}
            className="min-h-[36px] min-w-[36px] rounded-md border object-cover"
            style={{ borderColor: AX.border, background: AX.surface2 }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
              const parent = (e.target as HTMLImageElement).parentElement!;
              const fallback = document.createElement("div");
              fallback.className =
                "flex h-9 w-9 items-center justify-center rounded-md border text-sm font-bold";
              (fallback.style as any).borderColor = AX.border;
              (fallback.style as any).background = AX.surface2;
              (fallback.style as any).color = AX.text;
              fallback.textContent = token.name?.charAt(0) || "?";
              parent.insertBefore(fallback, parent.firstChild);
            }}
          />
        ) : (
          <div
            className="flex h-9 w-9 items-center justify-center rounded-md border text-sm font-bold"
            style={{ borderColor: AX.border, color: AX.text, background: AX.surface2 }}
          >
            {token.name?.charAt(0) || "?"}
          </div>
        )}

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[16px] font-semibold">{token.symbol}</span>
            <span className="truncate text-[13px]" style={{ color: AX.muted }}>
              {token.name}
            </span>
            <FiCopy className="ml-0.5 cursor-pointer text-[14px]" style={{ color: AX.muted }} />
          </div>
          <div className="mt-1 flex items-center gap-3">
            <span className="text-[12px] font-semibold" style={{ color: "#3DDC84" }}>
              {getTokenAge(token.created_at)}
            </span>
            <FaGlobe className="cursor-pointer text-[14px]" style={{ color: "#8EC5FF" }} />
            <FaUser className="cursor-pointer text-[14px]" style={{ color: "#8EC5FF" }} />
            <FaSearch className="cursor-pointer text-[14px]" style={{ color: "#8EC5FF" }} />
          </div>
        </div>
      </div>

      {/* CENTER: mcap big + inline KPIs in ONE line */}
      <div className="flex min-w-0 flex-1 items-center gap-8">
        <div className="text-[22px] font-semibold tabular-nums">
          ${formatSmartNumber(mcap)}
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <StatInline label="Price">
            ${<SubscriptNumber value={price} />}
          </StatInline>
          <StatInline label="Liquidity">
            ${formatSmartNumber(liq)}
          </StatInline>
          <StatInline label="Supply">
            {formatSmartNumber(supply)}
          </StatInline>
          <StatInline label="Global Fees Paid">
            {feesPaid === "—" ? "—" : feesPaid}
          </StatInline>
          <StatInline label="B.Curve" accent="green">
            {Number.isFinite(Number(curvePct)) ? `${Math.round(Number(curvePct))}%` : "—"}
          </StatInline>
        </div>
      </div>

      {/* RIGHT: SINGLE action cluster (no duplicates) */}
      <div className="ml-auto flex items-center gap-4 pr-1 text-neutral-300">
        <Tooltip label="Share">
          <IoShareSocialOutline className="cursor-pointer text-[18px] hover:text-white" />
        </Tooltip>

        <Tooltip label={isWatched ? "Remove from Watchlist" : "Add to Watchlist"}>
          <button
            onClick={handleWatchlistClick}
            className="cursor-pointer text-[18px] hover:text-white"
            aria-label={isWatched ? "Remove from Watchlist" : "Add to Watchlist"}
          >
            {isWatched ? <FaStar className="text-yellow-400" /> : <FaRegStar />}
          </button>
        </Tooltip>

        <Tooltip label="Expand chart">
          <FaExpand className="cursor-pointer text-[18px] hover:text-white" />
        </Tooltip>
      </div>
    </div>
  );
};

export default TradeHeader;
