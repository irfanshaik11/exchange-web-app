// components/trade/TradeHeader.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Token } from "~/utils/db";
import { formatSmartNumber } from "~/utils/db";
import { useWatchlist } from "../WatchlistContext";
import { SubscriptNumber } from "../InterstateTable";
import FastImage from "../FastImage";
import useMarketDataWebSocket from "~/hooks/useMarketDataWebSocket";

import { IoShareSocialOutline } from "react-icons/io5";
import { FaRegStar, FaStar, FaSearch, FaExpand, FaCamera, FaRegCopy, FaUser } from "react-icons/fa";
import { LuPill, LuDroplet } from "react-icons/lu";
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
  warning: "#facc15",
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

const formatMarketCap = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return "-";

  const numericValue =
    typeof value === "string" ? parseFloat(value.replace(/,/g, "")) : Number(value);

  if (!Number.isFinite(numericValue)) return "-";

  const abs = Math.abs(numericValue);

  const abbreviations = [
    { value: 1e12, suffix: "T" },
    { value: 1e9, suffix: "B" },
    { value: 1e6, suffix: "M" },
    { value: 1e3, suffix: "K" },
  ];

  for (const { value: threshold, suffix } of abbreviations) {
    if (abs >= threshold) {
      return `${(numericValue / threshold).toFixed(1)}${suffix}`;
    }
  }

  if (abs >= 1) {
    return numericValue.toFixed(1);
  }

  if (abs === 0) {
    return "0";
  }

  return numericValue.toFixed(3);
};

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

function resolveTwitterInfo(token: Token | null): { url: string | null; handle: string | null } {
  if (!token) return { url: null, handle: null };

  const candidates = [
    (token as any).twitter,
    (token as any).twitter_url,
    (token as any).x,
    (token as any).x_url,
    (token as any).socials?.twitter,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    let value = String(candidate).trim();
    if (!value) continue;

    value = value.replace(/^https?:\/\/(www\.)?(twitter\.com|x\.com)\//i, "");
    value = value.replace(/^@/, "");
    value = value.split(/[/?#]/)[0];

    if (!value) continue;

    const handle = value.toLowerCase();
    return {
      handle,
      url: `https://twitter.com/${handle}`,
    };
  }

  const fallback = (token.symbol || token.name || "").toLowerCase().replace(/[^a-z0-9_]/gi, "");
  if (fallback) {
    return {
      handle: fallback,
      url: `https://twitter.com/${fallback}`,
    };
  }

  return { url: null, handle: null };
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
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showZoomPopup, setShowZoomPopup] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const twitterInfo = useMemo(() => resolveTwitterInfo(token), [token]);
  const twitterProfileUrl = twitterInfo.url;
  const twitterHandle = twitterInfo.handle;
  const [showXProfilePreview, setShowXProfilePreview] = useState(false);
  const [xPreviewPosition, setXPreviewPosition] = useState({ x: 0, y: 0 });
  const xPreviewTimeoutRef = useRef<number | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const { isConnected: wsConnected, loading: wsLoading, error: wsError, getMarketData } =
    useMarketDataWebSocket({
      pairAddress: token.pair_address || "",
      tokenAddress: token.mint || "",
      enabled: true,
    });

  const marketData = getMarketData();
  const mcap = marketData?.market_cap_usd || token.market_cap_usd || 0;
  const price = marketData?.price_usd || (token as any).usd_price || (token as any).price_usd || 0;
  const liq =
    marketData?.liquidity_usd ??
    marketData?.volume_usd ??
    (token as any).total_liquidity_usd ??
    (token as any).liquidity_usd ??
    0;
  const supply = (token as any).total_supply ?? (token as any).supply ?? 0;
  const formattedMarketCap = useMemo(() => formatMarketCap(mcap), [mcap]);
  const isLowLiquidity = Number(liq) < 1000;

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

  const twitterSearchQuery = useMemo(() => `${token.symbol || ""} ${token.name || ""}`.trim(), [token.symbol, token.name]);
  const twitterSearchUrl = useMemo(
    () =>
      twitterSearchQuery
        ? `https://twitter.com/search?q=${encodeURIComponent(twitterSearchQuery)}`
        : `https://twitter.com/search?q=${encodeURIComponent(token.symbol || token.name || "")}`,
    [twitterSearchQuery, token.symbol, token.name]
  );
  const twitterBio = useMemo(() => {
    const candidates = [
      (token as any).description,
      (token as any).bio,
      (token as any).twitter_bio,
      (token as any).summary,
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const value = String(candidate).trim();
      if (value) return value;
    }
    const base = token.symbol || token.name || "token";
    return `Official ${base} community. Join the conversation!`;
  }, [token]);

useEffect(() => {
  return () => {
    if (typeof window === "undefined") return;
    if (xPreviewTimeoutRef.current != null) {
      window.clearTimeout(xPreviewTimeoutRef.current);
    }
    if (toastTimeoutRef.current != null) {
      window.clearTimeout(toastTimeoutRef.current);
    }
  };
}, []);

  const handleWatchlistClick = () => {
    if (isWatched) {
      removeFromWatchlist(token.pair_address || "");
      showToast("Removed from watchlist");
    } else {
      addToWatchlist(token);
      showToast("Added to watchlist");
    }
  };

  const showToast = (message: string) => {
    if (typeof window !== "undefined" && toastTimeoutRef.current != null) {
      window.clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
    setToastMessage(message);
    if (typeof window !== "undefined") {
      toastTimeoutRef.current = window.setTimeout(() => {
        setToastMessage(null);
        toastTimeoutRef.current = null;
      }, 1600);
    }
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

  const isPumpToken = useMemo(() => (token.mint || "").slice(-4) === "pump", [token.mint]);

  const openLinkInNewTab = (url: string) => {
    if (!url) return;
    if (typeof window === "undefined") return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const scheduleHideTwitterPreview = () => {
    if (typeof window === "undefined") {
      setShowXProfilePreview(false);
      return;
    }
    if (xPreviewTimeoutRef.current != null) {
      window.clearTimeout(xPreviewTimeoutRef.current);
    }
    xPreviewTimeoutRef.current = window.setTimeout(() => {
      setShowXProfilePreview(false);
    }, 120);
  };

  const handleTwitterProfileMouseEnter = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!twitterProfileUrl) return;
    if (typeof window === "undefined") return;
    if (xPreviewTimeoutRef.current != null) {
      window.clearTimeout(xPreviewTimeoutRef.current);
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setXPreviewPosition({
      x: rect.left + rect.width / 2,
      y: rect.bottom + 12,
    });
    setShowXProfilePreview(true);
  };

  const handleTwitterProfileMouseLeave = () => {
    scheduleHideTwitterPreview();
  };

  const handleTwitterPreviewMouseEnter = () => {
    if (typeof window !== "undefined" && xPreviewTimeoutRef.current != null) {
      window.clearTimeout(xPreviewTimeoutRef.current);
    }
    if (twitterProfileUrl) {
      setShowXProfilePreview(true);
    }
  };

  const handleTwitterPreviewMouseLeave = () => {
    scheduleHideTwitterPreview();
  };

  const handleTwitterProfileClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (twitterProfileUrl) {
      openLinkInNewTab(twitterProfileUrl);
    } else if (twitterSearchUrl) {
      openLinkInNewTab(twitterSearchUrl);
    }
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
                className="ml-1 cursor-pointer"
                title="Copy contract"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await navigator.clipboard.writeText(token.mint!);
                    showToast("Address copied to clipboard");
                  } catch {}
                }}
                style={{ color: AX.muted }}
              >
                <FaRegCopy size={12} />
              </button>
            )}

            <button
              className="ml-1 cursor-pointer"
              title="Share page link"
              onClick={async (e) => {
                e.stopPropagation();
                if (typeof window === "undefined") return;
                const shareUrl = window.location.href;
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  showToast("Link copied to clipboard");
                } catch (err) {
                  try {
                    const textArea = document.createElement("textarea");
                    textArea.value = shareUrl;
                    textArea.style.position = "fixed";
                    textArea.style.opacity = "0";
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    document.execCommand("copy");
                    document.body.removeChild(textArea);
                    showToast("Link copied to clipboard");
                  } catch {}
                }
              }}
              style={{ color: AX.muted }}
            >
              <IoShareSocialOutline size={14} />
            </button>
          </div>

          <div className="flex items-center gap-2 text-sm" style={{ color: AX.green }}>
            <span>{getTokenAge((token as any).created_at || (token as any).createdAt || (token as any).CreatedAt)}</span>

            {isPumpToken && (
              <Link
                target="_blank"
                href={`https://pump.fun/coin/${token.mint}`}
                title="View on pump.fun"
                className="transition-colors duration-200"
                style={{ color: AX.muted }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = AX.aiCyan;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = AX.muted;
                }}
              >
                <LuPill size={12} />
              </Link>
            )}

            <button
              title="Search on X"
              onClick={(e) => {
                e.stopPropagation();
                openLinkInNewTab(twitterSearchUrl);
              }}
              className="transition-colors duration-200 cursor-pointer"
              style={{ color: AX.muted }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = AX.aiCyan;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = AX.muted;
              }}
            >
              <FaSearch size={12} />
            </button>

            <button
              title="View X profile"
              className="transition-colors duration-200 cursor-pointer"
              style={{ color: AX.muted }}
              onMouseEnter={handleTwitterProfileMouseEnter}
              onMouseLeave={handleTwitterProfileMouseLeave}
              onClick={handleTwitterProfileClick}
            >
              <FaUser size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* CENTER: compact stats */}
      <div className="flex items-center gap-6">
        <div className="text-left">
          <div className="text-[18px] tabular-nums flex items-center gap-1">
            {formattedMarketCap === "-" ? "-" : `$${formattedMarketCap}`}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <StatInline label="Price">${<SubscriptNumber value={price} />}</StatInline>
          <StatInline label="Liquidity">
            <span className="inline-flex items-center gap-1">
              <span style={{ color: isLowLiquidity ? AX.warning : AX.text }}>
                ${formatSmartNumber(liq)}
              </span>
              {isLowLiquidity && (
                <span className="relative group inline-flex items-center">
                  <LuDroplet size={16} color={AX.warning} />
                  <span
                    className="absolute bottom-full left-1/2 z-50 mb-1.5 w-max -translate-x-1/2 rounded bg-black px-2 py-1 text-[10px] font-medium text-yellow-200 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                    style={{ border: `1px solid rgba(250, 204, 21, 0.4)` }}
                  >
                    Warning: Low liquidity
                  </span>
                </span>
              )}
            </span>
          </StatInline>
          <StatInline label="Supply">{formatSmartNumber(supply)}</StatInline>
          <StatInline label="B.Curve" accent="green">
            {Number.isFinite(Number(curvePct)) ? `${Number(curvePct).toFixed(1)}%` : "—"}
          </StatInline>
        </div>
      </div>

      {/* RIGHT: actions */}
      <div className="flex items-center gap-2 ml-auto">
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
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[99999] px-3 py-1.5 bg-emerald-600 text-white rounded-md text-sm">
          {toastMessage}
        </div>
      )}

      {showXProfilePreview && twitterProfileUrl && (
        <div
          className="fixed z-[99998] pointer-events-auto"
          style={{
            left: `${xPreviewPosition.x}px`,
            top: `${xPreviewPosition.y}px`,
            transform: "translate(-50%, 0)",
          }}
          onMouseEnter={handleTwitterPreviewMouseEnter}
          onMouseLeave={handleTwitterPreviewMouseLeave}
        >
          <div
            className="rounded-xl overflow-hidden"
            style={{
              width: 260,
              backgroundColor: AX.surface,
              border: `1px solid ${AX.border}`,
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: "#2f3336" }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "#1d9bf0" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#ffffff" }}>
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-semibold" style={{ color: AX.text }}>
                    @{twitterHandle || "unknown"}
                  </div>
                  <div className="text-xs" style={{ color: AX.muted }}>
                    Live Preview
                  </div>
                </div>
              </div>
            </div>
            <div className="px-4 py-4 flex gap-3 items-start">
              <div
                className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0"
                style={{
                  border: "2px solid #2f3336",
                  backgroundColor: "#101114",
                }}
              >
                <FastImage
                  src={imgSrc ?? undefined}
                  fallbackSrc={fallbackAvatar}
                  alt={`${token.name || token.symbol || ""} avatar`}
                  width={56}
                  height={56}
                  className="w-full h-full object-cover"
                  symbol={token.symbol}
                  name={token.name}
                  showBubble={false}
                />
              </div>
              <div className="flex-1 flex flex-col gap-1">
                <div className="text-sm font-semibold" style={{ color: AX.text }}>
                  {token.symbol}
                </div>
                <div className="text-xs" style={{ color: AX.muted }}>
                  {token.name}
                </div>
                <div className="text-[11px] leading-relaxed" style={{ color: AX.text }}>
                  {twitterBio}
                </div>
              </div>
            </div>
            <div className="px-4 pb-4 flex items-center gap-2">
              <button
                className="flex-1 px-3 py-2 rounded-full text-xs font-semibold transition-colors duration-200"
                style={{
                  backgroundColor: "#ffffff",
                  color: "#000000",
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openLinkInNewTab(twitterProfileUrl);
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#e7e9ea";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                }}
              >
                View on X
              </button>
              <button
                className="px-3 py-2 rounded-full text-xs font-semibold transition-colors duration-200"
                style={{
                  backgroundColor: "transparent",
                  color: AX.muted,
                  border: `1px solid ${AX.border}`,
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openLinkInNewTab(twitterSearchUrl);
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = AX.aiCyan;
                  e.currentTarget.style.borderColor = AX.aiCyan;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = AX.muted;
                  e.currentTarget.style.borderColor = AX.border;
                }}
              >
                Search
              </button>
            </div>
          </div>
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
