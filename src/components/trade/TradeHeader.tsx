// components/trade/TradeHeader.tsx
import React, { useState } from "react";
import type { Token } from "~/utils/db";
import { formatSmartNumber } from "~/utils/db";
import { useWatchlist } from "../WatchlistContext";
import { SubscriptNumber } from "../InterstateTable";
import useMarketDataWebSocket from "~/hooks/useMarketDataWebSocket";

import { IoShareSocialOutline } from "react-icons/io5";
import { FaRegStar, FaStar, FaUser, FaSearch, FaExpand, FaCamera, FaRegCopy } from "react-icons/fa";
import { LuPill } from "react-icons/lu";
import Link from "next/link";

/* ---------- AXIOM palette ---------- */
const AX = {
  bg: "#0f1012",
  surface: "#1A1A1A",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#E6E7EA",
  muted: "#9CA3AF",
  green: "#3DDC84",
  blue: "#8EC5FF",
  aiBlue: "#3B82F6",
  aiCyan: "#06B6D4",
  glowCyan: "rgba(6, 182, 212, 0.3)",
};

/* ---------- helpers ---------- */
function getTokenAge(createdAt: string | number) {
  if (!createdAt && createdAt !== 0) return "Unknown";
  let timestamp = createdAt as any;
  if (typeof timestamp === "number" && timestamp < 10000000000) timestamp *= 1000;
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return "Unknown";
  const ms = Date.now() - d.getTime();
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(ms / 86400000);
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

const protocolColorMap: Record<string, string> = {
  pump: "#22c55e",
  "pump.fun": "#22c55e",
  bonk: "#ff6b35",
  moonshot: "#a855f7",
  heaven: "#8b5cf6",
  "daos.fun": "#06b6d4",
  candle: "#f59e0b",
  sugar: "#ec4899",
  believe: "#10b981",
  jupiter: "#8b5cf6",
  moonit: "#74831f",
  boop: "#134577",
  boopfun: "#134577",
  launchlab: "#ef4444",
  dynamic: "#526fff",
  raydium: "#5c51f7",
  raydiumlaunchpad: "#5c51f7",
  meteora: "#ff4662",
  meteora_v2: "#ff4662",
  pump_amm: "#e9ba14",
  orca: "#0ea5e9",
};

function getColumnType(token: Token): "new" | "final-stretch" | "migrated" {
  const migrated =
    (token as any).is_migrated ||
    (token as any).migrated ||
    (token as any).graduated ||
    (token as any).is_graduated;
  if (migrated) return "migrated";

  const pct =
    (token as any).bonding_pct ??
    ((token as any).bonding_curve_progress != null
      ? (token as any).bonding_curve_progress * 100
      : undefined) ??
    (token as any).graduationPercent ??
    0;

  const marketCap =
    (token as any).fully_diluted_value ?? (token as any).market_cap_usd ?? 0;

  let progress = 0;
  if (typeof pct === "number" && pct >= 0) progress = pct;
  else if (marketCap > 0) progress = Math.min((marketCap / 69000000) * 100, 100);

  return progress >= 60 ? "final-stretch" : "new";
}

function getProtocolColor(token: Token, column: "new" | "final-stretch" | "migrated") {
  const lp = (token as any).launchpad_protocol?.toLowerCase();
  const proto = (token as any).protocol?.toLowerCase();
  const ln = (token as any).launchpadName?.toLowerCase();
  const amm = (token as any).amm?.toLowerCase();
  const v = lp || proto || ln || amm || "";
  if (!v) return "#22c55e";

  if (v.includes("meteora")) return column === "migrated" ? "#eab308" : "#ff4662";
  if (v.includes("pump")) return column === "migrated" ? "#eab308" : "#22c55e";

  if (protocolColorMap[v]) return protocolColorMap[v];
  if (v.includes("raydium")) return "#5c51f7";
  if (v.includes("moonit")) return "#74831f";
  if (v.includes("boop")) return "#134577";
  if (v.includes("bonk")) return protocolColorMap["bonk"];
  if (v.includes("orca")) return protocolColorMap["orca"];
  if (v.includes("jupiter")) return protocolColorMap["jupiter"];
  return "#22c55e";
}

function getTokenIcon(token: Token): string {
  const lp = (token as any).launchpad_protocol?.toLowerCase();
  const proto = (token as any).protocol?.toLowerCase();
  const ln = (token as any).launchpadName?.toLowerCase();
  const amm = (token as any).amm?.toLowerCase();
  const v = lp || proto || ln || amm || "";
  if (!v || v.includes("pump"))
    return "https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png";
  if (v.includes("meteora"))
    return "https://s1.coincarp.com/logo/1/meteora.png?style=72&v=1759911013";
  if (v.includes("raydium"))
    return "https://s2.coinmarketcap.com/static/img/coins/64x64/8526.png";
  if (v.includes("boop"))
    return "https://dropsearn.fra1.cdn.digitaloceanspaces.com/media/projects/logos/boopfun_logo_1746246162.webp";
  if (v.includes("moonit"))
    return "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR6_LEZppFrAkKMqApIwCM_R5n0-b4XC8Aluw&s";
  if (v.includes("orca"))
    return "https://s2.coinmarketcap.com/static/img/coins/64x64/7501.png";
  if (v.includes("jupiter"))
    return "https://s2.coinmarketcap.com/static/img/coins/64x64/29210.png";
  return "https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png";
}

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
  if (/^[a-z0-9_-]{40,}$/i.test(s) && !/^https?:\/\//i.test(s)) return `https://arweave.net/${s}`;
  if (s.startsWith("http://")) return s.replace(/^http:\/\//i, "https://");
  if (s.startsWith("https://")) return s;
  return null;
}

/* ---------- tiny UI atom ---------- */
function StatInline({
  label,
  children,
  accent,
}: {
  label: string;
  children: React.ReactNode;
  accent?: "green" | "blue";
}) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="text-[10px] uppercase tracking-wider" style={{ color: AX.muted }}>
        {label}
      </span>
      <span
        className="text-[12px] tabular-nums"
        style={{ color: accent === "green" ? AX.green : accent === "blue" ? AX.blue : AX.text }}
      >
        {children}
      </span>
    </div>
  );
}

/* ===================================================================== */
interface TradeHeaderProps {
  token: Token | null;
}

const TradeHeader: React.FC<TradeHeaderProps> = ({ token }) => {
  if (!token || (!token.name && !token.symbol)) {
    return (
      <div className="px-2 flex-shrink-0">
        <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: AX.surface }}>
          <div className="h-10 w-10 rounded-md bg-neutral-800 animate-pulse" />
          <div className="flex flex-col gap-1">
            <div className="h-4 w-24 bg-neutral-800 animate-pulse rounded" />
            <div className="h-3 w-16 bg-neutral-800 animate-pulse rounded" />
          </div>
        </div>
      </div>
    );
  }

  const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlist();
  const isWatched = isInWatchlist(token.pair_address || "");
  const [showPreview, setShowPreview] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const { isConnected: wsConnected, loading: wsLoading, error: wsError, getMarketData } =
    useMarketDataWebSocket({
      pairAddress: token.pair_address || "",
      tokenAddress: token.mint || "",
      enabled: true,
    });

  const marketData = getMarketData();
  const mcap = marketData?.market_cap_usd || token.market_cap_usd || 0;
  const price = marketData?.price_usd || (token as any).usd_price || (token as any).price_usd || 0;
  const liq = marketData?.volume_usd || (token as any).total_liquidity_usd || (token as any).liquidity_usd || 0;
  const supply = (token as any).total_supply ?? (token as any).supply ?? 0;

  const curvePct = (() => {
    const v =
      (token as any).bonding_pct ??
      ((token as any).bonding_curve_progress != null
        ? (token as any).bonding_curve_progress * 100
        : undefined) ??
      (token as any).graduationPercent ??
      0;
    if (v) return v;
    const mc =
      marketData?.market_cap_usd ||
      (token as any).market_cap_usd ||
      (token as any).fully_diluted_value ||
      0;
    return mc ? Math.min((mc / 69000000) * 100, 100) : 0;
  })();

  // protocol color + icon
  const columnType = getColumnType(token);
  const protocolColor = getProtocolColor(token, columnType);
  const tokenIcon = getTokenIcon(token);

  // token image (ipfs/http)
  const rawImg = (token as any).uri || (token as any).image || (token as any).logo;
  const imgSrc = normalizeAssetUrl(rawImg);

  const handleWatchlistClick = () => {
    if (isWatched) removeFromWatchlist(token.pair_address || "");
    else addToWatchlist(token);
  };

  const showCopyToast = () => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 1600);
  };

  return (
    // CHANGED: remove justify-between, add gap so center sits just left of the actions
    <div className="flex w-full items-center gap-6 px-2 py-2" style={{ color: AX.text }}>
      {/* WS banner(s) */}
      {wsError && (
        <div className="absolute top-0 left-0 right-0 px-3 py-1 bg-red-900/20 border-b border-red-500/30 z-10">
          <div className="text-[10px] text-red-400 text-center">Market Data Error: {wsError}</div>
        </div>
      )}
      {!wsConnected && !wsLoading && (
        <div className="absolute top-0 left-0 right-0 px-3 py-1 bg-yellow-900/20 border-b border-yellow-500/30 z-10">
          <div className="text-[10px] text-yellow-400 text-center">Using static market data</div>
        </div>
      )}

      {/* LEFT: token avatar + meta */}
      <div className="flex items-center gap-3">
        {/* Avatar with protocol-colored outer ring and protocol badge (bottom-right) */}
        <div
          className="relative h-11 w-11 rounded-[10px] overflow-visible"
          onMouseEnter={() => setShowPreview(true)}
          onMouseLeave={() => setShowPreview(false)}
        >
          {/* OUTER ring (protocol color) */}
          <div
            className="absolute -inset-[2px] rounded-[12px] pointer-events-none"
            style={{
              border: `2px solid ${protocolColor}`,
              boxShadow: showPreview ? `0 0 16px ${protocolColor}66` : "none",
            }}
          />
          {/* INNER subtle border + image */}
          <div
            className="relative h-full w-full rounded-[10px] overflow-hidden"
            style={{ border: `1px solid rgba(192,192,192,0.28)` }}
          >
            {imgSrc ? (
              <img
                src={imgSrc}
                alt={token.name || token.symbol || ""}
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                    token.symbol || token.name || "T"
                  )}&background=0f1012&color=E6E7EA&size=44`;
                }}
              />
            ) : (
              <div className="h-full w-full grid place-items-center" style={{ background: AX.surface2 }}>
                <span className="text-lg">{(token.symbol || token.name || "?").slice(0, 1)}</span>
              </div>
            )}

            {/* Hover camera hint */}
            <div
              className="absolute inset-0 grid place-items-center bg-black/55 transition-opacity"
              style={{ opacity: showPreview ? 1 : 0 }}
            >
              <FaCamera size={12} />
            </div>
          </div>

          {/* Protocol badge (BOTTOM-RIGHT) */}
          <div
            className="absolute -bottom-1 -right-1 rounded-full bg-white overflow-hidden grid place-items-center"
            style={{
              width: 18,
              height: 18,
              border: `2px solid ${protocolColor}`,
              boxShadow: `0 0 6px ${protocolColor}66`,
            }}
            title="Protocol"
          >
            <img
              src={tokenIcon}
              alt="protocol"
              className="w-[70%] h-[70%] object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        </div>

        {/* Name / symbol / age + quick actions */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px]">{token.symbol}</span>
            <span className="text-[11px]" style={{ color: AX.muted }}>
              {token.name}
            </span>

            {/* copy mint */}
            {!!token.mint && (
              <button
                className="ml-1"
                title="Copy contract"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await navigator.clipboard.writeText(token.mint!);
                    showCopyToast();
                  } catch {}
                }}
                style={{ color: AX.muted }}
              >
                <FaRegCopy size={12} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm" style={{ color: AX.green }}>
            <span>{getTokenAge((token as any).created_at || (token as any).CreatedAt)}</span>

            {/* pump.fun link (heuristic) */}
            {token.mint && token.mint.slice(-4) === "pump" && (
              <Link
                target="_blank"
                href={`https://pump.fun/coin/${token.mint}`}
                title="View on pump.fun"
                style={{ color: AX.muted }}
              >
                <LuPill size={12} />
              </Link>
            )}

            {/* twitter search */}
            <button
              title="Search on X"
              onClick={() =>
                window.open(
                  `https://twitter.com/search?q=${encodeURIComponent(`${token.symbol} ${token.name}`)}`,
                  "_blank"
                )
              }
              style={{ color: AX.muted }}
            >
              <FaSearch size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* CENTER: compact stats — now sits directly to the right of the left block */}
      <div className="flex items-center gap-6">
        <div className="text-left">
          <div className="text-[18px] tabular-nums flex items-center gap-1">
            ${formatSmartNumber(mcap)}
            {/* live dot */}
            {wsConnected && <span className="text-[12px]" style={{ color: AX.green }}>●</span>}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <StatInline label="Price">${<SubscriptNumber value={price} />}</StatInline>
          <StatInline label="Liquidity">${formatSmartNumber(liq)}</StatInline>
          <StatInline label="Supply">{formatSmartNumber(supply)}</StatInline>
          <StatInline label="B.Curve" accent="green">
            {Number.isFinite(Number(curvePct)) ? `${Number(curvePct).toFixed(1)}%` : "—"}
          </StatInline>
        </div>
      </div>

      {/* RIGHT: actions — pinned to far right */}
      <div className="flex items-center gap-2 ml-auto">
        <span title="Share">
          <IoShareSocialOutline className="cursor-pointer text-[14px]" style={{ color: AX.muted }} />
        </span>

        <button
          onClick={handleWatchlistClick}
          className="cursor-pointer text-[14px]"
          aria-label={isWatched ? "Remove from Watchlist" : "Add to Watchlist"}
          title={isWatched ? "Remove from Watchlist" : "Add to Watchlist"}
        >
          {isWatched ? <FaStar className="text-yellow-400" /> : <FaRegStar style={{ color: AX.muted }} />}
        </button>

        <button title="Expand chart" className="w-6 h-6 grid place-items-center" style={{ color: AX.muted }}>
          <FaExpand size={12} />
        </button>
      </div>

      {/* tiny toast */}
      {showToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[99999] px-3 py-1.5 bg-emerald-600 text-white rounded-md text-sm">
          Copied!
        </div>
      )}
    </div>
  );
};

export default TradeHeader;
