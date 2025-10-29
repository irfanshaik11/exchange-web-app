import React, { useState } from "react";
import type { Token } from "~/utils/db";
import { formatSmartNumber } from "~/utils/db";
import { useWatchlist } from "../WatchlistContext";
import { SubscriptNumber } from "../InterstateTable";
import useMarketDataWebSocket from "~/hooks/useMarketDataWebSocket";

import { IoShareSocialOutline } from "react-icons/io5";
import { FaRegStar, FaStar, FaExpand, FaRegCopy } from "react-icons/fa";
import FastImage from "../FastImage";

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
  aiCyan: "#06B6D4",
  aiGreen: "#22C55E",
  glowCyan: "rgba(6, 182, 212, 0.25)",
};

/* ---------- helpers ---------- */
function getTokenAge(createdAt: string | number) {
  if (!createdAt && createdAt !== 0) return "Unknown";
  let ts: any = createdAt;
  if (typeof createdAt === "number" && createdAt < 10_000_000_000) ts = createdAt * 1000;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "Unknown";
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const dys = Math.floor(diff / 86400000);
  if (dys > 0) return `${dys}d`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function normalizeAssetUrl(raw?: string): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.startsWith("ipfs://"))
    return `https://cloudflare-ipfs.com/ipfs/${s.replace("ipfs://", "").replace(/^ipfs\//, "")}`;
  if (/^ipfs[/:]/i.test(s))
    return `https://cloudflare-ipfs.com/ipfs/${s.replace(/^ipfs[/:]/i, "")}`;
  if (/^[a-z0-9_-]{40,}$/i.test(s) && !/^https?:\/\//i.test(s))
    return `https://arweave.net/${s}`;
  if (s.startsWith("http://")) return s.replace(/^http:\/\//i, "https://");
  return s.startsWith("https://") ? s : null;
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
    <div className="min-w-[72px] flex flex-col items-start leading-tight">
      <span
        className="text-[10px] uppercase tracking-[0.06em]"
        style={{
          color: AX.muted,
          fontFamily:
            'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
        }}
      >
        {label}
      </span>
      <span
        className="text-[12px] font-light tabular-nums"
        style={{
          color:
            accent === "green"
              ? AX.green
              : accent === "blue"
              ? AX.blue
              : AX.text,
          fontFamily:
            'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
        }}
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
      tabIndex={0}
    >
      {children}
      {show && (
        <span
          className="absolute -top-1.5 right-1/2 translate-y-[-100%] translate-x-1/2 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] text-white"
          style={{ background: "#0E0F12", zIndex: 9999 }}
        >
          {label}
        </span>
      )}
    </span>
  );
};

/* ===================================================================== */

interface TradeHeaderProps {
  token: Token | null;
}

const TradeHeader: React.FC<TradeHeaderProps> = ({ token }) => {
  const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlist();
  const isWatched = isInWatchlist(token?.pair_address || "");
  const [showToast, setShowToast] = useState(false);

  const { isConnected: wsConnected, getMarketData } = useMarketDataWebSocket({
    pairAddress: token?.pair_address || "",
    tokenAddress: token?.mint || "",
    enabled: true,
  });

  if (!token) return null;

  const md = getMarketData();
  const mcap = md?.market_cap_usd || token.market_cap_usd || 0;
  const price = md?.price_usd || (token as any).price_usd || (token as any).price || 0;
  const liq = md?.volume_usd || (token as any).liquidity_usd || 0;
  const supply = token.total_supply ?? (token as any).supply ?? 0;
  const curvePct = (token as any).bonding_curve_progress
    ? (token as any).bonding_curve_progress * 100
    : 0;

  const imageUrl = (token as any).uri || (token as any).image || token.logo;
  const imgSrc = normalizeAssetUrl(imageUrl);

  const showCopyToast = () => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 1500);
  };

  return (
    <div
      className="relative flex w-full items-center justify-between px-2 py-1 border-b"
      style={{
        background: "transparent",
        borderColor: AX.border,
        color: AX.text,
        fontFamily: "Inter, ui-sans-serif, system-ui",
        boxShadow: "inset 0 -1px 0 rgba(0,0,0,0.25)",
      }}
    >
      {/* LEFT */}
      <div className="flex items-center gap-2">
        {/* Token logo */}
        <div className="h-9 w-9 rounded-md overflow-hidden border border-[#2A2B33]">
          {imgSrc ? (
            <FastImage
              src={imageUrl}
              alt={token.name || token.symbol || ""}
              width={36}
              height={36}
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-[18px]"
              style={{ background: AX.surface2 }}
            >
              {token.symbol?.charAt(0) || "?"}
            </div>
          )}
        </div>

        {/* Symbol + Name */}
        <div className="flex flex-col">
          <div className="flex items-center gap-1">
            <span
              className="text-[14px] font-light"
              style={{
                fontFamily:
                  'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
              }}
            >
              {token.symbol}
            </span>
            <span className="text-[11px]" style={{ color: AX.muted }}>
              {token.name}
            </span>
            <button
              style={{ color: AX.muted }}
              onClick={async (e) => {
                e.stopPropagation();
                if (!token.mint) return;
                await navigator.clipboard.writeText(token.mint);
                showCopyToast();
              }}
            >
              <FaRegCopy size={12} />
            </button>
          </div>
          <div className="text-[12px]" style={{ color: AX.aiGreen }}>
            {getTokenAge((token as any).created_at || (token as any).CreatedAt)}
          </div>
        </div>
      </div>

      {/* CENTER: Stats */}
      <div className="flex-1 min-w-0 pl-2">
        <div className="flex items-end gap-4">
          <div className="flex items-center gap-1">
            <div
              className="text-[17px] font-light tabular-nums flex items-center gap-1"
              style={{
                color: AX.text,
                fontFamily:
                  'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
              }}
            >
              ${formatSmartNumber(mcap)}
              {wsConnected && (
                <span className="text-[#70E0B0] text-[10px]">●</span>
              )}
            </div>
          </div>

          <div
            className="h-4 w-px self-center"
            style={{ background: AX.border }}
          />

          <div className="flex items-end gap-4">
            <StatInline label="Price">
              ${<SubscriptNumber value={price} />}
            </StatInline>
            <StatInline label="Liquidity">
              ${formatSmartNumber(liq)}
            </StatInline>
            <StatInline label="Supply">
              {formatSmartNumber(supply)}
            </StatInline>
            <StatInline label="B.Curve" accent="green">
              {Number.isFinite(Number(curvePct))
                ? `${Number(curvePct).toFixed(1)}%`
                : "—"}
            </StatInline>
          </div>
        </div>
      </div>

      {/* RIGHT: icons */}
      <div className="flex items-center gap-1">
        <Tooltip label="Share">
          <IoShareSocialOutline
            className="cursor-pointer text-[14px] hover:text-white transition-colors"
            style={{ color: AX.muted }}
          />
        </Tooltip>

        <Tooltip
          label={isWatched ? "Remove from Watchlist" : "Add to Watchlist"}
        >
          <button
            onClick={() =>
              isWatched
                ? removeFromWatchlist(token.pair_address || "")
                : addToWatchlist(token)
            }
            className="cursor-pointer text-[14px] hover:text-white transition-colors"
          >
            {isWatched ? (
              <FaStar className="text-yellow-400" />
            ) : (
              <FaRegStar style={{ color: AX.muted }} />
            )}
          </button>
        </Tooltip>

        <Tooltip label="Expand chart">
          <button
            className="flex items-center justify-center w-6 h-6 rounded transition-all duration-150"
            style={{ color: AX.muted }}
          >
            <FaExpand size={12} />
          </button>
        </Tooltip>
      </div>

      {/* bottom subtle gradient line */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[1px]"
        style={{
          background: `linear-gradient(90deg, transparent, ${AX.border} 12%, ${AX.border} 88%, transparent)`,
        }}
      />

      {/* Copy Toast */}
      {showToast && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[999999] px-3 py-1.5 bg-green-600 text-white rounded-md shadow">
          Copied!
        </div>
      )}
    </div>
  );
};

export default TradeHeader;
