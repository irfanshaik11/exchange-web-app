// components/trade/TradeHeader.tsx
import React, { useState } from "react";
import type { Token } from "~/utils/db";
import { formatSmartNumber } from "~/utils/db";
import { useWatchlist } from "../WatchlistContext";
import { SubscriptNumber } from "../InterstateTable";
import FastImage from "../FastImage";
import useMarketDataWebSocket from "~/hooks/useMarketDataWebSocket";

import { IoShareSocialOutline } from "react-icons/io5";
import { FaRegStar, FaStar, FaSearch, FaExpand, FaCamera, FaRegCopy } from "react-icons/fa";
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
  aiGreen: "#18c48c",
  aiCyan: "#06B6D4",
  glowBlue: "rgba(59, 130, 246, 0.35)",
  glowGreen: "rgba(24, 196, 140, 0.3)",
  glowCyan: "rgba(6, 182, 212, 0.3)",
};

const DEFAULT_PROTOCOL_COLOR = "#22c55e";
const DEFAULT_PROTOCOL_ICON = "https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png";

const normalizeKey = (s?: string) =>
  (s || "").toLowerCase().replace(/\s+/g, "").replace(/_/g, "");

const rawProtocolColorMap: Record<string, string> = {
  pump: DEFAULT_PROTOCOL_COLOR,
  "pump.fun": DEFAULT_PROTOCOL_COLOR,
  bonk: "#ff6b35",
  bags: DEFAULT_PROTOCOL_COLOR,
  moonshot: "#eab308",
  moonshoot: "#eab308",
  moonit: "#eab308",
  heaven: "#8b5cf6",
  "daos.fun": "#06b6d4",
  candle: "#f59e0b",
  sugar: "#ec4899",
  believe: "#10b981",
  jupiter: "#8b5cf6",
  boop: "#134577",
  boopfun: "#134577",
  launchlab: "#3b82f6",
  dynamic: "#526fff",
  raydium: "#5c51f7",
  raydiumlaunchpad: "#5c51f7",
  meteora: "#ff4662",
  "meteora_v2": "#ff4662",
  pump_amm: "#e9ba14",
  orca: "#0ea5e9",
};

const normalizedProtocolColorMap: Record<string, string> = Object.fromEntries(
  Object.entries(rawProtocolColorMap).map(([key, value]) => [normalizeKey(key), value])
);

function extractProtocolRaw(token: Token | null): string | null {
  if (!token) return null;
  const candidates = [
    (token as any).launchpad_protocol,
    (token as any).protocol,
    (token as any).launchpadName,
    (token as any).amm,
  ];
  for (const candidate of candidates) {
    if (candidate == null) continue;
    const value = String(candidate).toLowerCase().trim();
    if (value) return value;
  }
  return null;
}

function resolveProtocolColor(token: Token, columnType: "new" | "final-stretch" | "migrated"): string {
  const raw = extractProtocolRaw(token);
  if (!raw) return DEFAULT_PROTOCOL_COLOR;

  if (raw.includes("meteora")) {
    return columnType === "migrated" ? "#eab308" : "#ff4662";
  }

  if (raw.includes("pump")) {
    return columnType === "migrated" ? "#eab308" : DEFAULT_PROTOCOL_COLOR;
  }

  if (raw.includes("launch")) {
    return columnType === "migrated" ? "#eab308" : "#3b82f6";
  }

  const normalized = normalizeKey(raw);

  if (rawProtocolColorMap[raw]) return rawProtocolColorMap[raw];
  if (normalizedProtocolColorMap[normalized]) return normalizedProtocolColorMap[normalized];

  if (raw.includes("raydium")) return "#5c51f7";
  if (raw.includes("moonit") || raw.includes("moonshot") || raw.includes("moonshoot")) return "#eab308";
  if (raw.includes("boop")) return "#134577";
  if (raw.includes("bonk")) return "#ff6b35";
  if (raw.includes("bags")) return DEFAULT_PROTOCOL_COLOR;
  if (raw.includes("orca")) return "#0ea5e9";
  if (raw.includes("jupiter")) return "#8b5cf6";

  return DEFAULT_PROTOCOL_COLOR;
}

function resolveProtocolIcon(token: Token): string {
  const raw = extractProtocolRaw(token);
  if (!raw) return DEFAULT_PROTOCOL_ICON;

  if (raw.includes("meteora")) {
    return "https://s1.coincarp.com/logo/1/meteora.png?style=72&v=1759911013";
  }

  if (raw.includes("raydium") || raw.includes("launch")) {
    return "https://s2.coinmarketcap.com/static/img/coins/64x64/8526.png";
  }

  if (raw.includes("boop")) {
    return "https://api.phantom.app/image-proxy/?image=https%3A%2F%2Fdhc7eusqrdwa0.cloudfront.net%2Fassets%2FBOOP_logo_icon_dark_bg.png&anim=true";
  }

  if (raw.includes("moonit") || raw.includes("moonshot") || raw.includes("moonshoot")) {
    return "https://avatars.githubusercontent.com/u/174132191?s=280&v=4";
  }

  if (raw.includes("bonk")) {
    return "https://s3.coinmarketcap.com/static-gravity/image/a28128d9ff7c49c9ad33ee2f626fda40.png";
  }

  if (raw.includes("bags")) {
    return "https://play-lh.googleusercontent.com/7AxVcu1pumxavcGTb16WBJQU88CDZd0v8q0WzFwfin7zbBvItYMuNQ0Xkqq4srTw4A=w240-h480-rw";
  }

  if (raw.includes("pump")) {
    return DEFAULT_PROTOCOL_ICON;
  }

  return DEFAULT_PROTOCOL_ICON;
}

function shouldFillProtocolBadge(token: Token): boolean {
  const raw = extractProtocolRaw(token) || "";
  return ["meteora", "bonk", "bags", "moonit", "moonshot", "moonshoot"].some((needle) => raw.includes(needle));
}

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

/* ---------- column type ---------- */
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
  const [showZoomPopup, setShowZoomPopup] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });

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

  /* ---------- canonical protocol resolution ---------- */
  const columnType = getColumnType(token);
  const protocolColor = resolveProtocolColor(token, columnType);
  const tokenIcon = resolveProtocolIcon(token);
  const fillProtocolBadge = shouldFillProtocolBadge(token);

  // token image (ipfs/http)
  const rawImg = (token as any).uri || (token as any).image || (token as any).logo;
  const imgSrc = normalizeAssetUrl(rawImg);
  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    token.symbol || token.name || "T"
  )}&background=0f1012&color=E6E7EA&size=36`;

  const handleWatchlistClick = () => {
    if (isWatched) removeFromWatchlist(token.pair_address || "");
    else addToWatchlist(token);
  };

  const showCopyToast = () => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 1600);
  };

  const handleImageHover = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const popupWidth = 150;
    const popupHeight = 150;
    
    // Default position to the right of the image
    let x = rect.right + 10;
    let y = rect.top + (rect.height / 2) - (popupHeight / 2);
    
    // Check if popup would go off the right edge of the screen
    if (x + popupWidth > window.innerWidth) {
      x = rect.left - popupWidth - 10; // Position to the left instead
    }
    
    // Check if popup would go off the top or bottom of the screen
    if (y < 10) {
      y = 10; // Keep some margin from top
    } else if (y + popupHeight > window.innerHeight - 10) {
      y = window.innerHeight - popupHeight - 10; // Keep some margin from bottom
    }
    
    setPopupPosition({ x, y });
    setShowPreview(true);
    setShowZoomPopup(true);
  };

  const handleImageLeave = () => {
    setShowPreview(false);
    setShowZoomPopup(false);
  };

  return (
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
        {/* Avatar with PulseTable-style border + protocol badge */}
        <div
          className="relative flex items-center justify-center rounded-sm transition-all duration-300 ease-out cursor-pointer"
          onMouseEnter={handleImageHover}
          onMouseLeave={handleImageLeave}
          style={{
            width: 44,
            height: 44,
            overflow: "visible",
            boxShadow: showPreview ? `0 0 5px ${AX.glowCyan}, 0 0 10px ${AX.glowCyan}` : "none",
            transform: showPreview ? "scale(1.02)" : "scale(1)",
          }}
        >
          <div className="relative rounded-sm" style={{ border: "none", padding: 0 }}>
            <div
              className="relative rounded-sm"
              style={{
                border: `1px solid ${protocolColor}`,
                padding: 1,
                backgroundColor: "#06070b",
              }}
            >
              <div
                className="relative rounded-sm overflow-hidden"
                style={{ width: 36, height: 36 }}
              >
                <FastImage
                  src={imgSrc ?? undefined}
                  fallbackSrc={fallbackAvatar}
                  alt={token.name || token.symbol || ""}
                  width={36}
                  height={36}
                  className="w-full h-full object-cover transition-all duration-300"
                  symbol={token.symbol}
                  name={token.name}
                  showBubble={false}
                />
              </div>
            </div>
          </div>

          <div
            className="absolute bottom-0 right-0 bg-white rounded-full flex items-center justify-center transform translate-x-1/5 translate-y-1/4 z-10"
            style={{
              width: 12,
              height: 12,
              border: `1px solid ${protocolColor}`,
              boxShadow: `0 0 2px ${protocolColor}60`,
            }}
            title="Protocol"
          >
            <img
              src={tokenIcon}
              alt={`${(token as any).launchpad_protocol || (token as any).protocol || (token as any).launchpadName || "Protocol"} logo`}
              className={`${fillProtocolBadge ? "w-full h-full object-cover" : "w-3/4 h-3/4 object-contain"} rounded-full`}
              style={{
                filter: protocolColor === "#eab308" ? "sepia(1) saturate(3) hue-rotate(-10deg) brightness(1.1)" : "none",
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>

          <div
            className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-all duration-300 pointer-events-none"
            style={{ opacity: showPreview ? 1 : 0 }}
          >
            <div
              className="flex items-center justify-center rounded-full p-1.5"
              style={{
                backgroundColor: AX.aiCyan,
                boxShadow: `0 0 8px ${AX.glowCyan}`,
              }}
            >
              <FaCamera size={16} style={{ color: "#000000" }} className="drop-shadow-lg" />
            </div>
          </div>
        </div>

        {/* Name / symbol / age + quick actions */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px]">{token.symbol}</span>
            <span className="text-[11px]" style={{ color: AX.muted }}>
              {token.name}
            </span>

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

      {/* CENTER: compact stats */}
      <div className="flex items-center gap-6">
        <div className="text-left">
          <div className="text-[18px] tabular-nums flex items-center gap-1">
            ${formatSmartNumber(mcap)}
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

      {/* RIGHT: actions */}
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

      {/* Zoom popup */}
      {showZoomPopup && (
        <div
          className="fixed z-[99998] pointer-events-none transition-all duration-300 ease-out"
          style={{
            left: `${popupPosition.x}px`,
            top: `${popupPosition.y}px`,
            opacity: showZoomPopup ? 1 : 0,
            transform: showZoomPopup ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(-10px)',
          }}
        >
          <div
            className="relative rounded-lg overflow-hidden shadow-2xl"
            style={{
              width: 150,
              height: 150,
              backgroundColor: AX.surface,
              border: `2px solid ${protocolColor}`,
              boxShadow: `0 0 20px ${AX.glowCyan}, 0 0 40px ${AX.glowCyan}40`,
            }}
          >
            <FastImage
              src={imgSrc ?? undefined}
              fallbackSrc={fallbackAvatar}
              alt={`${token.name || token.symbol || ""} - Zoomed`}
              width={150}
              height={150}
              className="w-full h-full object-cover"
              symbol={token.symbol}
              name={token.name}
              showBubble={false}
            />
            
            {/* Overlay with token info */}
            <div
              className="absolute bottom-0 left-0 right-0 px-2 py-1"
              style={{
                background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
              }}
            >
              <div className="text-white text-xs font-medium truncate">
                {token.symbol}
              </div>
              <div className="text-gray-300 text-[10px] truncate">
                {token.name}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TradeHeader;
