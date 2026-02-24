import React, { useState, useEffect, useRef } from "react";
import FastImage from "~/components/FastImage";
import { useRouter } from "next/router";
import { HiLightningBolt } from "react-icons/hi";
import { SiSolana } from "react-icons/si";
import { formatMarketCap } from "~/utils/db";
import { extractTokenImage, normalizeImageUrl, resolveTokenImage } from "~/utils/images";
import { useSolPrice } from "~/components/SolPriceContext";
import type { TradeEvent } from "~/utils/walletTracking";
import type { Wallet } from "~/utils/functions";

// ── Helper functions (shared, formerly duplicated) ──────────────────────

export function normalizeAssetUrl(raw?: string | null): string | null {
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
  if (/^[a-z0-9_-]{40,}$/i.test(s) && !/^https?:\/\//i.test(s))
    return `https://arweave.net/${s}`;
  if (s.startsWith("http://")) return s.replace(/^http:\/\//i, "https://");
  if (s.startsWith("https://")) return s;
  return null;
}

export function getProtocolIcon(protocol: string): string {
  if (!protocol)
    return "https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png";
  if (protocol.includes("pump"))
    return "https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png";
  if (protocol.includes("meteora"))
    return "https://s1.coincarp.com/logo/1/meteora.png?style=72&v=1759911013";
  if (protocol.includes("raydium"))
    return "https://s2.coinmarketcap.com/static/img/coins/64x64/8526.png";
  if (protocol.includes("boop"))
    return "https://api.phantom.app/image-proxy/?image=https%3A%2F%2Fdhc7eusqrdwa0.cloudfront.net%2Fassets%2FBOOP_logo_icon_dark_bg.png&anim=true";
  if (
    protocol.includes("moonit") ||
    protocol.includes("moonshot") ||
    protocol.includes("moonshoot")
  )
    return "https://avatars.githubusercontent.com/u/174132191?s=280&v=4";
  if (protocol.includes("bonk"))
    return "https://s3.coinmarketcap.com/static-gravity/image/a28128d9ff7c49c9ad33ee2f626fda40.png";
  if (protocol.includes("bags"))
    return "https://play-lh.googleusercontent.com/7AxVcu1pumxavcGTb16WBJQU88CDZd0v8q0WzFwfin7zbBvItYMuNQ0Xkqq4srTw4A=w240-h480-rw";
  if (protocol.includes("launch"))
    return "https://s2.coinmarketcap.com/static/img/coins/64x64/8526.png";
  return "https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png";
}

export function getProtocolColor(protocol: string): string {
  if (!protocol) return "#22c55e";
  if (protocol.includes("pump")) return "#22c55e";
  if (protocol.includes("meteora")) return "#ff4662";
  if (protocol.includes("raydium")) return "#5c51f7";
  if (
    protocol.includes("moonit") ||
    protocol.includes("moonshot") ||
    protocol.includes("moonshoot")
  )
    return "#eab308";
  if (protocol.includes("boop")) return "#134577";
  if (protocol.includes("bonk")) return "#ff6b35";
  if (protocol.includes("bags")) return "#22c55e";
  if (protocol.includes("launch")) return "#3b82f6";
  if (protocol.includes("orca")) return "#0ea5e9";
  if (protocol.includes("jupiter")) return "#8b5cf6";
  return "#22c55e";
}

// ── Types ───────────────────────────────────────────────────────────────

export interface LiveTradesPanelProps {
  trades: TradeEvent[];
  wallets: Wallet[];
  wsConnected: boolean;
  quickBuyAmount: string;
  onQuickBuy: (trade: TradeEvent) => void;
  isLoading?: boolean;
}

// ── Component ───────────────────────────────────────────────────────────

export default function LiveTradesPanel({
  trades,
  wallets,
  wsConnected,
  quickBuyAmount,
  onQuickBuy,
  isLoading,
}: LiveTradesPanelProps) {
  const router = useRouter();
  const { solPrice } = useSolPrice();

  // Token metadata: fetched per mint from /api/token-service/trade-view
  const [tokenMetadata, setTokenMetadata] = useState<Map<string, any>>(
    new Map(),
  );
  const fetchedMintsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (trades.length === 0) return;

    const tradesToFetch = trades.filter(
      (trade) =>
        !tokenMetadata.has(trade.mint) &&
        !fetchedMintsRef.current.has(trade.mint),
    );

    if (tradesToFetch.length === 0) return;

    tradesToFetch.forEach((trade) => fetchedMintsRef.current.add(trade.mint));

    Promise.allSettled(
      tradesToFetch.map(async (trade) => {
        try {
          let token: any = null;

          // Try trade-view API first (requires pair_address)
          if (trade.pair_address) {
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 5000);
              const response = await fetch(
                `/api/token-service/trade-view?pair_address=${trade.pair_address}`,
                { signal: controller.signal },
              );
              clearTimeout(timeoutId);
              if (response.ok) {
                const data = await response.json();
                token = data?.token;
              }
            } catch {
              // Silent fail — try Go search fallback below
            }
          }

          // Fallback: Go service search by mint (works without pair_address)
          if (!token && trade.mint) {
            try {
              const goUrl = process.env.NEXT_PUBLIC_GO_SERVICE_URL;
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 5000);
              const searchResp = await fetch(
                `${goUrl}/v1/token/${trade.mint}`,
                { signal: controller.signal },
              );
              clearTimeout(timeoutId);
              if (searchResp.ok) {
                const responseData = await searchResp.json();
                token = responseData?.token || null;
                // Merge marketData fields onto token for metadata extraction
                if (token && responseData?.marketData) {
                  token.market_cap_usd = responseData.marketData.market_cap_usd || token.market_cap_usd;
                  token.price_usd = responseData.marketData.price_usd || token.price_usd;
                }
              }
            } catch {
              // Silent fail
            }
          }

          if (token) {
            const metadata = {
              symbol: token.symbol || trade.symbol || null,
              name: token.name || trade.name || null,
              image_url: token.image_url || null,
              image: token.image || null,
              logo: token.logo || null,
              uri: token.uri || null,
              launchpad_protocol:
                token.launchpad_protocol || token.protocol || null,
              market_cap_usd:
                token.market_cap_usd ||
                token.marketCapUsd ||
                token.fully_diluted_value ||
                null,
              price_usd: token.price_usd || token.priceUsd || null,
              total_supply: token.total_supply || token.totalSupply || null,
              createdAt:
                token.created_at || token.createdAt || token.CreatedAt || null,
            };

            // Resolve metadata URI → actual image URL BEFORE storing
            // Avoids race where render sees unresolved metadata URL → letter fallback
            try {
              const resolvedImageUrl = await resolveTokenImage(metadata);
              if (resolvedImageUrl) {
                metadata.image_url = resolvedImageUrl;
              }
            } catch {
              // Resolution failed — metadata.image_url stays as-is
            }

            setTokenMetadata((prev) => {
              const updated = new Map(prev);
              updated.set(trade.mint, metadata);
              return updated;
            });
          }
        } catch {
          // Silent fail — fallback UI handles missing metadata
        }
      }),
    );
  }, [trades]);

  // ── Loading state ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center">
        <div className="mb-2 flex gap-1.5">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-500" />
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-500 [animation-delay:150ms]" />
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-500 [animation-delay:300ms]" />
        </div>
        <span className="text-xs text-neutral-500">Loading trades...</span>
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────

  if (trades.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center">
        <span className="text-neutral-400">
          {wsConnected
            ? "Listening for trades from tracked wallets..."
            : "No live trades yet. Add wallets to start tracking!"}
        </span>
        <span className="mt-2 text-xs text-neutral-500">
          {wsConnected
            ? "Connected and ready"
            : "Disconnected - Check console for details"}
        </span>
      </div>
    );
  }

  // ── Table ──────────────────────────────────────────────────────────

  return (
    <div className="scrollbar-hide -mx-3 flex-1 overflow-auto sm:-mx-5">
      {/* SVG gradient for Solana icon */}
      <svg className="pointer-events-none absolute h-0 w-0">
        <defs>
          <linearGradient
            id="solana-gradient-tracker"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop
              offset="0%"
              style={{ stopColor: "#00FFA3", stopOpacity: 1 }}
            />
            <stop
              offset="100%"
              style={{ stopColor: "#DC1FFF", stopOpacity: 1 }}
            />
          </linearGradient>
        </defs>
      </svg>

      <table className="mt-2 w-full min-w-[600px] text-[10px] sm:min-w-[720px] sm:text-xs">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-white/[0.04]">
            <th className="py-1.5 pl-4 pr-1 text-left text-[10px] text-neutral-400 sm:pl-6 sm:pr-2 sm:py-2 sm:text-sm">
              Time
            </th>
            <th className="px-1 py-1.5 text-left text-[10px] text-neutral-400 sm:px-2 sm:py-2 sm:text-sm">
              Wallet
            </th>
            <th className="px-1 py-1.5 text-left text-[10px] text-neutral-400 sm:px-2 sm:py-2 sm:text-sm">
              Side
            </th>
            <th className="px-1 py-1.5 text-left text-[10px] text-neutral-400 sm:px-2 sm:py-2 sm:text-sm">
              Token
            </th>
            <th className="px-1 py-1.5 text-left text-[10px] text-neutral-400 sm:px-2 sm:py-2 sm:text-sm">
              Amount
            </th>
            <th className="px-1 py-1.5 text-left text-[10px] text-neutral-400 sm:px-2 sm:py-2 sm:text-sm">
              MC
            </th>
            <th className="py-1.5 pl-1 pr-4 text-center text-[10px] text-neutral-400 sm:pl-2 sm:pr-6 sm:py-2 sm:text-sm">
              Quick Buy
            </th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade, idx) => {
            const wallet = wallets.find((w) => w.address === trade.wallet);
            const timeAgo = new Date(trade.at).toLocaleTimeString();
            const metadata = tokenMetadata.get(trade.mint);
            const displaySymbol =
              trade.symbol ||
              metadata?.symbol ||
              trade.name ||
              metadata?.name ||
              trade.mint.slice(0, 8) + "...";
            const displayName = trade.name || metadata?.name;
            const tokenImageUrl = metadata ? extractTokenImage(metadata) : null;
            const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(displaySymbol || "T")}&background=0f1012&color=E6E7EA&size=28`;
            const launchpadProtocol =
              metadata?.launchpad_protocol?.toLowerCase() || "";
            const protocolIcon = getProtocolIcon(launchpadProtocol);
            const protocolColor = getProtocolColor(launchpadProtocol);
            const isMeteora = launchpadProtocol.includes("meteora");
            const isBonk = launchpadProtocol.includes("bonk");
            const isBags = launchpadProtocol.includes("bags");
            const isMoonit =
              launchpadProtocol.includes("moonit") ||
              launchpadProtocol.includes("moonshot") ||
              launchpadProtocol.includes("moonshoot");
            const isFullCircleImage =
              isMeteora || isBonk || isBags || isMoonit;

            return (
              <tr
                key={`${trade.tx}-${idx}`}
                className="group border-b border-white/[0.04] transition-all duration-300"
                style={{
                  backgroundColor:
                    trade.side === "buy"
                      ? "rgba(34, 197, 94, 0.03)"
                      : "rgba(239, 68, 68, 0.03)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor =
                    trade.side === "buy"
                      ? "rgba(34, 197, 94, 0.07)"
                      : "rgba(239, 68, 68, 0.07)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor =
                    trade.side === "buy"
                      ? "rgba(34, 197, 94, 0.03)"
                      : "rgba(239, 68, 68, 0.03)";
                }}
              >
                {/* TIME */}
                <td className="py-1.5 pl-4 pr-1 text-[9px] text-neutral-400 sm:pl-6 sm:pr-2 sm:py-2 sm:text-xs">
                  {timeAgo}
                </td>

                {/* WALLET */}
                <td className="px-1 py-1.5 font-mono text-[9px] sm:px-2 sm:py-2 sm:text-xs">
                  <span className="truncate" title={trade.wallet}>
                    {wallet?.emoji || "💼"}{" "}
                    {wallet?.name || trade.wallet.slice(0, 4) + "..."}
                  </span>
                </td>

                {/* SIDE */}
                <td className="px-1 py-1.5 sm:px-2 sm:py-2">
                  <span
                    className={`rounded px-0.5 py-0.5 text-[9px] font-semibold sm:px-1 sm:text-[10px] ${
                      trade.side === "buy"
                        ? "bg-green-500/20 text-green-400"
                        : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {trade.side.toUpperCase()}
                  </span>
                </td>

                {/* TOKEN (clickable) */}
                <td className="px-1 py-1.5 sm:px-2 sm:py-2">
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      let tokenAddress = trade.pair_address;
                      if (!tokenAddress && trade.mint) {
                        try {
                          const searchResponse = await fetch(
                            `${process.env.NEXT_PUBLIC_GO_SERVICE_URL}/v1/search?phrase=${encodeURIComponent(trade.mint)}&limit=1`,
                          );
                          if (searchResponse.ok) {
                            const searchData = await searchResponse.json();
                            if (
                              searchData.tokens &&
                              searchData.tokens.length > 0
                            ) {
                              tokenAddress =
                                searchData.tokens[0].pair_address ||
                                searchData.tokens[0].poolId;
                            }
                          }
                        } catch {
                          // Silent fail
                        }
                      }
                      if (!tokenAddress) tokenAddress = trade.mint;
                      const queryParams = new URLSearchParams();
                      queryParams.set('chain', 'sol');
                      const name = trade.name || metadata?.name;
                      if (name) queryParams.set('_name', name);
                      const symbol = trade.symbol || metadata?.symbol;
                      if (symbol) queryParams.set('_symbol', symbol);
                      const price = trade.price_usd || metadata?.price_usd;
                      if (price) queryParams.set('_price', String(price));
                      const mcap = metadata?.market_cap_usd || trade.market_cap_usd;
                      if (mcap) queryParams.set('_mcap', String(mcap));
                      const image = tokenImageUrl || (metadata ? extractTokenImage(metadata) : null);
                      if (image) queryParams.set('_image', image);
                      queryParams.set('_mint', trade.mint);
                      if (metadata?.launchpad_protocol) queryParams.set('_launchpad_protocol', metadata.launchpad_protocol);
                      const createdAt = metadata?.createdAt;
                      if (createdAt) queryParams.set('_created_at', String(createdAt));
                      router.push(`/trade/${tokenAddress}?${queryParams.toString()}`);
                    }}
                    className="flex cursor-pointer items-center gap-1 font-mono text-[9px] text-emerald-300 transition-colors hover:text-emerald-200 sm:gap-2 sm:text-xs"
                    title={displayName || undefined}
                  >
                    {/* Token icon with protocol badge */}
                    <div className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center sm:h-7 sm:w-7">
                      <div
                        className="relative rounded-sm"
                        style={{
                          border: `1px solid ${protocolColor}B3`,
                          padding: "2px",
                          backgroundColor: "#06070b",
                        }}
                      >
                        <div className="relative h-4 w-4 overflow-hidden rounded-sm sm:h-[22px] sm:w-[22px]">
                          <FastImage
                            src={tokenImageUrl}
                            fallbackSrc={fallbackAvatar}
                            alt={displayName || displaySymbol}
                            width={22}
                            height={22}
                            className="h-full w-full object-cover"
                            symbol={displaySymbol}
                            name={displayName}
                            showBubble={false}
                          />
                        </div>
                      </div>
                      {/* Protocol badge */}
                      <div
                        className="absolute right-0 bottom-0 flex translate-x-1/4 translate-y-1/4 transform items-center justify-center rounded-full bg-white"
                        style={{
                          width: 10,
                          height: 10,
                          border: `1px solid ${protocolColor}`,
                          boxShadow: `0 0 2px ${protocolColor}60`,
                        }}
                      >
                        <img
                          src={protocolIcon}
                          alt="Protocol"
                          className={`${isFullCircleImage ? "h-full w-full object-cover" : "h-3/4 w-3/4 object-contain"} rounded-full`}
                          style={{
                            filter:
                              protocolColor === "#eab308"
                                ? "sepia(1) saturate(3) hue-rotate(-10deg) brightness(1.1)"
                                : "none",
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex min-w-0 items-center gap-1 text-left leading-tight sm:gap-1.5">
                      <span className="truncate text-xs font-medium text-neutral-100 sm:text-base">
                        {displaySymbol}
                      </span>
                    </div>
                  </button>
                </td>

                {/* AMOUNT */}
                <td className="px-1 py-1.5 text-[9px] text-neutral-200 sm:px-2 sm:py-2 sm:text-xs">
                  <div className="flex items-center gap-0.5 sm:gap-1">
                    <SiSolana
                      className="inline-block h-2.5 w-2.5 flex-shrink-0 sm:h-3 sm:w-3"
                      aria-hidden="true"
                      style={{
                        color: "unset",
                        fill: "url(#solana-gradient-tracker)",
                        filter: "none",
                      }}
                    />
                    <span className="text-[9px] sm:text-xs">
                      {(() => {
                        if (
                          trade.sol_spent !== null &&
                          trade.sol_spent !== undefined
                        ) {
                          let solAmount = Math.abs(trade.sol_spent);
                          if (solAmount > 1000) {
                            solAmount = solAmount / 1e9;
                          }
                          return solAmount.toFixed(4);
                        }
                        return `${trade.amount.toFixed(4)} tokens`;
                      })()}
                    </span>
                  </div>
                </td>

                {/* MARKET CAP */}
                <td className="px-1 py-1.5 text-[9px] text-neutral-300 sm:px-2 sm:py-2 sm:text-xs">
                  {(() => {
                    const marketCap =
                      metadata?.market_cap_usd || trade.market_cap_usd;
                    if (marketCap && marketCap > 0) {
                      return `$${formatMarketCap(marketCap)}`;
                    }
                    // Fallback 1: compute from price_usd × supply
                    const price = trade.price_usd || metadata?.price_usd;
                    const supply = metadata?.total_supply || 1_000_000_000;
                    if (price && price > 0) {
                      return `$${formatMarketCap(price * supply)}`;
                    }
                    // Fallback 2: derive from sol_spent / token_amount × SOL price
                    if (
                      solPrice > 0 &&
                      trade.sol_spent &&
                      trade.amount &&
                      trade.amount > 0
                    ) {
                      let solAmount = Math.abs(trade.sol_spent);
                      if (solAmount > 1000) solAmount = solAmount / 1e9;
                      const pricePerToken =
                        (solAmount / trade.amount) * solPrice;
                      return `$${formatMarketCap(pricePerToken * supply)}`;
                    }
                    return <span className="text-neutral-500">-</span>;
                  })()}
                </td>

                {/* QUICK BUY */}
                <td className="py-1.5 pl-1 pr-4 sm:pl-2 sm:pr-6 sm:py-2">
                  <div className="flex items-center justify-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onQuickBuy(trade);
                      }}
                      className="quick-buy-btn z-10 flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all duration-150 ease-out"
                      style={{
                        backgroundColor: "#18c48c",
                        color: "#000000",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#14a87a";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "#18c48c";
                      }}
                    >
                      <HiLightningBolt className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      <span>{quickBuyAmount} SOL</span>
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
