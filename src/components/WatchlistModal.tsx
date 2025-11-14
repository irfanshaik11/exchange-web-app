import React, { useEffect, useState } from 'react';
import { FaStar, FaRegStar } from 'react-icons/fa';
import { FaTrashAlt } from 'react-icons/fa';
import FastImage from "./FastImage";
import type { Token } from "../utils/db";
import InterstatePopout from './InterstatePopout';
import InterstateButton from './InterstateButton';
import { useWatchlist } from './WatchlistContext';
import { formatSmartNumber, formatMarketCap } from '../utils/db';
import { useRouter } from 'next/router';

interface WatchlistModalProps {
  open: boolean;
  onClose: () => void;
}

const AX = {
  surface: "#1A1A1A",
  border: "#2A2B33",
  text: "#E6E7EA",
  muted: "#9CA3AF",
  glowCyan: "rgba(6, 182, 212, 0.3)",
};

const DEFAULT_PROTOCOL_COLOR = "#22c55e";
const DEFAULT_PROTOCOL_ICON = "https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png";

const normalizeKey = (s?: string) => (s || "").toLowerCase().replace(/\s+/g, "").replace(/_/g, "");

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

function shouldFillProtocolBadge(token: Token): boolean {
  const raw = extractProtocolRaw(token) || "";
  return ["meteora", "bonk", "bags", "moonit", "moonshot", "moonshoot"].some((needle) => raw.includes(needle));
}

function resolveProtocolColor(token: Token): string {
  const raw = extractProtocolRaw(token);
  if (!raw) return DEFAULT_PROTOCOL_COLOR;
  if (raw.includes("meteora")) return "#ff4662";
  if (raw.includes("pump")) return DEFAULT_PROTOCOL_COLOR;
  if (raw.includes("launch")) return "#3b82f6";
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
  if (raw.includes("pump")) return DEFAULT_PROTOCOL_ICON;
  return DEFAULT_PROTOCOL_ICON;
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

function resolveWatchlistVolume1h(token: Token): number {
  const buy = Number((token as any).total_buy_volume_1h) || 0;
  const sell = Number((token as any).total_sell_volume_1h) || 0;
  if (buy || sell) return buy + sell;
  const direct =
    (token as any).volume_1h ??
    (token as any).volume1h ??
    (token as any).volume60m ??
    (token as any).volume_60m ??
    0;
  if (direct) return Number(direct) || 0;
  const fallback =
    (token as any).total_volume_1h ??
    (token as any).buy_volume_1h ??
    (token as any).volume_24h ??
    0;
  return Number(fallback) || 0;
}

function resolveWatchlistStats(token: Token) {
  const marketCap =
    (token as any).market_cap_usd ??
    (token as any).marketCapUSD ??
    (token as any).fully_diluted_value ??
    0;
  const liquidity =
    (token as any).total_liquidity_usd ??
    (token as any).liquidity_usd ??
    (token as any).liquidityUsd ??
    0;
  const volume1h = resolveWatchlistVolume1h(token);
  return { marketCap, liquidity, volume1h };
}

export default function WatchlistModal({ open, onClose }: WatchlistModalProps) {
  const [show, setShow] = useState(false);
  const { watchlist, removeFromWatchlist } = useWatchlist();
  const router = useRouter();

  useEffect(() => {
    if (open) {
      setShow(true);
    } else {
      const timeout = setTimeout(() => setShow(false), 220);
      return () => clearTimeout(timeout);
    }
  }, [open]);

  if (!open && !show) return null;

  const handleTokenClick = (tokenAddress: string) => {
    if (!tokenAddress) return;
    router.push(`/trade/${tokenAddress}`);
    onClose();
  };

  return (
    <InterstatePopout open={open} onClose={onClose} align="center" zIndex={9999} className="bg-neutral-900 rounded-xl shadow-2xl w-full max-w-2xl p-6 relative text-neutral-100">
      <InterstateButton variant="icon" size="sm" onClick={onClose} className="absolute top-3 right-3 text-xl"><span>×</span></InterstateButton>
      <div className="text-lg font-bold mb-4">Watchlist</div>
      <div className="w-full overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-800">
          <thead>
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">Token</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">Market Cap</th>
              {/* <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">1h Volume</th> */}
              <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">Liquidity</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {watchlist.map((token) => {
              const tokenKey = token.pair_address || (token as any).mint || token.symbol;
              const protocolColor = resolveProtocolColor(token);
              const tokenIcon = resolveProtocolIcon(token);
              const fillProtocolBadge = shouldFillProtocolBadge(token);
              const rawImg = (token as any).uri || (token as any).image || (token as any).logo;
              const imgSrc = normalizeAssetUrl(rawImg);
              const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                token.symbol || token.name || "T"
              )}&background=0f1012&color=E6E7EA&size=36`;
              const { marketCap, liquidity, volume1h } = resolveWatchlistStats(token);

              return (
                <tr key={tokenKey} className="hover:bg-neutral-800/60">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3 cursor-pointer" onClick={() => handleTokenClick(token.pair_address || (token as any).mint || "") }>
                    <div
                      className="relative flex items-center justify-center rounded-sm transition-all duration-300 ease-out"
                      style={{
                        width: 44,
                        height: 44,
                        overflow: "visible",
                        boxShadow: `0 0 4px ${AX.glowCyan}30`,
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
                              className="w-full h-full object-cover"
                              symbol={token.symbol}
                              name={token.name}
                              showBubble={false}
                            />
                          </div>
                        </div>
                      </div>

                      <div
                        className="absolute bottom-0 right-0 bg-white rounded-full flex items-center justify-center transform translate-x-1/5 translate-y-1/4"
                        style={{
                          width: 12,
                          height: 12,
                          border: `1px solid ${protocolColor}`,
                          boxShadow: `0 0 2px ${protocolColor}60`,
                        }}
                      >
                        <img
                          src={tokenIcon}
                          alt="Protocol logo"
                          className={`${fillProtocolBadge ? "w-full h-full object-cover" : "w-3/4 h-3/4 object-contain"} rounded-full`}
                          style={{
                            filter: protocolColor === "#eab308" ? "sepia(1) saturate(3) hue-rotate(-10deg) brightness(1.1)" : "none",
                          }}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{token.name}</span>
                      <span className="text-xs text-neutral-400">{token.symbol}</span>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm">${formatMarketCap(marketCap)}</td>
                {/* <td className="px-4 py-3 text-sm">${formatSmartNumber(volume1h)}</td> */}
                <td className="px-4 py-3 text-sm">${formatSmartNumber(liquidity)}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => removeFromWatchlist(token.pair_address || (token as any).mint || "")}
                    className="text-neutral-400 hover:text-red-400 transition-colors"
                  >
                    <FaTrashAlt className="text-lg" />
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {watchlist.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <FaRegStar className="text-4xl text-neutral-500 mb-4" />
            <div className="text-lg font-semibold mb-2">Your watchlist is empty</div>
            <div className="text-neutral-400 text-sm text-center max-w-xs">
              Add tokens to your watchlist by clicking the star icon on any token page
            </div>
          </div>
        )}
      </div>
    </InterstatePopout>
  );
} 