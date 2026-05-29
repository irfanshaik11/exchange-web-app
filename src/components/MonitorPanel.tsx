import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/router";
import FastImage from "~/components/FastImage";
import { HiLightningBolt } from "react-icons/hi";
import { FiCopy, FiStar } from "react-icons/fi";
import { formatMarketCap } from "~/utils/db";
import { extractTokenImage, resolveTokenImage } from "~/utils/images";
import { useSolPrice } from "~/components/SolPriceContext";
import { preloadTradeChart } from "~/utils/preloadTradeChart";
import {
  getProtocolIcon,
  getProtocolColor,
} from "~/components/LiveTradesPanel";
import type { TradeEvent } from "~/utils/walletTracking";
import type { Wallet } from "~/utils/functions";

// ── Types ───────────────────────────────────────────────────────────────

export interface MonitorPanelProps {
  trades: TradeEvent[];
  wallets: Wallet[];
  wsConnected: boolean;
  quickBuyAmount: string;
  onQuickBuy: (trade: TradeEvent) => void;
  isLoading?: boolean;
}

interface TokenMeta {
  symbol?: string | null;
  name?: string | null;
  image_url?: string | null;
  image?: string | null;
  logo?: string | null;
  uri?: string | null;
  launchpad_protocol?: string | null;
  market_cap_usd?: number | null;
  price_usd?: number | null;
  total_supply?: number | null;
  liquidity_usd?: number | null;
  createdAt?: string | number | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function tradeUsd(t: TradeEvent, solPrice: number): number {
  // Prefer explicit USD when both price and amount are present.
  if (t.price_usd && t.amount) {
    return Math.abs(t.price_usd * t.amount);
  }
  if (t.sol_spent !== null && t.sol_spent !== undefined && solPrice > 0) {
    let sol = Math.abs(t.sol_spent);
    if (sol > 1000) sol = sol / 1e9; // lamports fallback
    return sol * solPrice;
  }
  return 0;
}

function formatAge(ms: number): string {
  if (!ms || ms <= 0) return "-";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function formatUsdShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  if (abs >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

// ── Aggregation ─────────────────────────────────────────────────────────

interface WalletAgg {
  wallet: string;
  walletName: string;
  walletEmoji: string;
  firstAt: number;
  lastAt: number;
  buyCount: number;
  sellCount: number;
  boughtUsd: number;
  soldUsd: number;
  boughtTokens: number;
  soldTokens: number;
  /** Most recent reference trade — used to wire Quick Buy to a real TradeEvent. */
  lastTrade: TradeEvent;
}

interface TokenAgg {
  mint: string;
  pairAddress?: string;
  symbol: string | null;
  name: string | null;
  firstAt: number;
  lastAt: number;
  buyCount: number;
  sellCount: number;
  buyUsd: number;
  sellUsd: number;
  marketCapUsd: number | null;
  lastPriceUsd: number | null;
  walletsByAddr: Map<string, WalletAgg>;
  lastTrade: TradeEvent;
}

function aggregateTrades(
  trades: TradeEvent[],
  wallets: Wallet[],
  solPrice: number,
): TokenAgg[] {
  const walletByAddr = new Map<string, Wallet>();
  for (const w of wallets) walletByAddr.set(w.address, w);

  const byMint = new Map<string, TokenAgg>();

  for (const t of trades) {
    if (!t.mint) continue;
    let agg = byMint.get(t.mint);
    if (!agg) {
      agg = {
        mint: t.mint,
        pairAddress: t.pair_address,
        symbol: t.symbol ?? null,
        name: t.name ?? null,
        firstAt: t.at,
        lastAt: t.at,
        buyCount: 0,
        sellCount: 0,
        buyUsd: 0,
        sellUsd: 0,
        marketCapUsd: t.market_cap_usd ?? null,
        lastPriceUsd: t.price_usd ?? null,
        walletsByAddr: new Map(),
        lastTrade: t,
      };
      byMint.set(t.mint, agg);
    }
    if (t.pair_address && !agg.pairAddress) agg.pairAddress = t.pair_address;
    if (t.symbol && !agg.symbol) agg.symbol = t.symbol;
    if (t.name && !agg.name) agg.name = t.name;

    const usd = tradeUsd(t, solPrice);
    if (t.side === "buy") {
      agg.buyCount += 1;
      agg.buyUsd += usd;
    } else {
      agg.sellCount += 1;
      agg.sellUsd += usd;
    }

    if (t.at > agg.lastAt) {
      agg.lastAt = t.at;
      agg.lastTrade = t;
      if (t.market_cap_usd) agg.marketCapUsd = t.market_cap_usd;
      if (t.price_usd) agg.lastPriceUsd = t.price_usd;
    }
    if (t.at < agg.firstAt) agg.firstAt = t.at;

    let wa = agg.walletsByAddr.get(t.wallet);
    if (!wa) {
      const w = walletByAddr.get(t.wallet);
      wa = {
        wallet: t.wallet,
        walletName: w?.name || t.wallet.slice(0, 6) + "…",
        walletEmoji: w?.emoji || "💼",
        firstAt: t.at,
        lastAt: t.at,
        buyCount: 0,
        sellCount: 0,
        boughtUsd: 0,
        soldUsd: 0,
        boughtTokens: 0,
        soldTokens: 0,
        lastTrade: t,
      };
      agg.walletsByAddr.set(t.wallet, wa);
    }
    if (t.side === "buy") {
      wa.buyCount += 1;
      wa.boughtUsd += usd;
      wa.boughtTokens += Math.abs(t.amount || 0);
    } else {
      wa.sellCount += 1;
      wa.soldUsd += usd;
      wa.soldTokens += Math.abs(t.amount || 0);
    }
    if (t.at > wa.lastAt) {
      wa.lastAt = t.at;
      wa.lastTrade = t;
    }
    if (t.at < wa.firstAt) wa.firstAt = t.at;
  }

  // Most recent activity first.
  return Array.from(byMint.values()).sort((a, b) => b.lastAt - a.lastAt);
}

// ── Token metadata fetching ─────────────────────────────────────────────

function useTokenMetadata(mints: string[]) {
  const [metadata, setMetadata] = useState<Map<string, TokenMeta>>(new Map());
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const todo = mints.filter(
      (m) => m && !metadata.has(m) && !fetchedRef.current.has(m),
    );
    if (todo.length === 0) return;
    todo.forEach((m) => fetchedRef.current.add(m));

    Promise.allSettled(
      todo.map(async (mint) => {
        try {
          const goUrl = process.env.NEXT_PUBLIC_GO_SERVICE_URL;
          if (!goUrl) return;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const resp = await fetch(`${goUrl}/v1/token/${mint}`, {
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (!resp.ok) return;
          const data = await resp.json();
          const token = data?.token;
          if (!token) return;
          const md: TokenMeta = {
            symbol: token.symbol ?? null,
            name: token.name ?? null,
            image_url: token.image_url ?? null,
            image: token.image ?? null,
            logo: token.logo ?? null,
            uri: token.uri ?? null,
            launchpad_protocol:
              token.launchpad_protocol || token.protocol || null,
            market_cap_usd:
              data?.marketData?.market_cap_usd ??
              token.market_cap_usd ??
              token.marketCapUsd ??
              null,
            price_usd:
              data?.marketData?.price_usd ??
              token.price_usd ??
              token.priceUsd ??
              null,
            liquidity_usd:
              data?.marketData?.liquidity_usd ??
              token.liquidity_usd ??
              null,
            total_supply: token.total_supply ?? token.totalSupply ?? null,
            createdAt:
              token.created_at || token.createdAt || token.CreatedAt || null,
          };
          try {
            const resolved = await resolveTokenImage(md);
            if (resolved) md.image_url = resolved;
          } catch {
            /* keep raw */
          }
          setMetadata((prev) => {
            const next = new Map(prev);
            next.set(mint, md);
            return next;
          });
        } catch {
          /* silent */
        }
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mints.join(",")]);

  return metadata;
}

// ── Component ───────────────────────────────────────────────────────────

export default function MonitorPanel({
  trades,
  wallets,
  wsConnected,
  quickBuyAmount,
  onQuickBuy,
  isLoading,
}: MonitorPanelProps) {
  const router = useRouter();
  const { solPrice } = useSolPrice();
  const [now, setNow] = useState(() => Date.now());

  // Refresh "Last TX" / "Time in Trade" labels every 5s without re-aggregating.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const tokenAggs = useMemo(
    () => aggregateTrades(trades, wallets, solPrice),
    [trades, wallets, solPrice],
  );

  const mints = useMemo(() => tokenAggs.map((t) => t.mint), [tokenAggs]);
  const metadata = useTokenMetadata(mints);

  const [copiedMint, setCopiedMint] = useState<string | null>(null);
  const copyMint = (mint: string) => {
    if (!navigator?.clipboard) return;
    void navigator.clipboard.writeText(mint).then(() => {
      setCopiedMint(mint);
      setTimeout(() => setCopiedMint((m) => (m === mint ? null : m)), 1200);
    });
  };

  // ── Loading state ────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center">
        <div className="mb-2 flex gap-1.5">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-500" />
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-500 [animation-delay:150ms]" />
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-500 [animation-delay:300ms]" />
        </div>
        <span className="text-xs text-neutral-500">Loading monitor...</span>
      </div>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────
  if (tokenAggs.length === 0) {
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

  return (
    <div className="scrollbar-hide -mx-3 flex-1 overflow-auto sm:-mx-5">
      <div className="flex flex-col gap-2 px-3 py-2 sm:px-5">
        {tokenAggs.map((token) => {
          const meta = metadata.get(token.mint);
          const displaySymbol =
            token.symbol ||
            meta?.symbol ||
            (token.mint ? token.mint.slice(0, 6) + "…" : "Unknown");
          const displayName = token.name || meta?.name || displaySymbol;
          const tokenImageUrl = meta ? extractTokenImage(meta) : null;
          const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(displaySymbol || "T")}&background=0f1012&color=E6E7EA&size=40`;
          const launchpadProtocol = (
            meta?.launchpad_protocol || ""
          ).toLowerCase();
          const protocolIcon = getProtocolIcon(launchpadProtocol);
          const protocolColor = getProtocolColor(launchpadProtocol);

          // Header stats
          const totalTx = token.buyCount + token.sellCount;
          const buyShare =
            token.buyUsd + token.sellUsd > 0
              ? token.buyUsd / (token.buyUsd + token.sellUsd)
              : 0.5;
          const ageMs = meta?.createdAt
            ? now - new Date(meta.createdAt as any).getTime()
            : now - token.firstAt;
          const lastTxMs = now - token.lastAt;

          const marketCap = meta?.market_cap_usd ?? token.marketCapUsd ?? null;
          const liquidity = meta?.liquidity_usd ?? null;
          const currentPriceUsd = meta?.price_usd ?? token.lastPriceUsd ?? null;

          const walletRows = Array.from(token.walletsByAddr.values()).sort(
            (a, b) => b.lastAt - a.lastAt,
          );
          const holders = walletRows.filter(
            (w) => w.boughtTokens - w.soldTokens > 0.001,
          ).length;

          const goToTrade = () => {
            const addr = token.mint;
            if (addr) router.push(`/trade/${addr}`);
          };
          const preload = () => {
            preloadTradeChart(
              {
                mint: token.mint,
                pairAddress: token.pairAddress,
                chain: "sol",
                name: displayName,
                symbol: displaySymbol,
                priceUsd: currentPriceUsd ?? undefined,
                marketCapUsd: marketCap ?? undefined,
                image: tokenImageUrl || "",
                launchpadProtocol: meta?.launchpad_protocol ?? undefined,
              },
              { router },
            );
          };

          return (
            <div
              key={token.mint}
              className="overflow-hidden rounded-md border border-white/[0.05] bg-[#0a0b0e]/60"
            >
              {/* HEADER ROW */}
              <div className="flex items-start gap-3 px-3 py-2.5 sm:px-4 sm:py-3">
                {/* Icon */}
                <button
                  type="button"
                  onClick={goToTrade}
                  onMouseEnter={preload}
                  className="relative flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center sm:h-11 sm:w-11"
                  aria-label={`Open ${displaySymbol}`}
                >
                  <div
                    className="relative rounded-md"
                    style={{
                      border: `1px solid ${protocolColor}80`,
                      padding: "2px",
                      backgroundColor: "#06070b",
                    }}
                  >
                    <div className="relative h-7 w-7 overflow-hidden rounded-md sm:h-9 sm:w-9">
                      <FastImage
                        src={tokenImageUrl}
                        fallbackSrc={fallbackAvatar}
                        alt={displayName || displaySymbol}
                        width={36}
                        height={36}
                        className="h-full w-full object-cover"
                        symbol={displaySymbol}
                        name={displayName ?? undefined}
                        showBubble={false}
                      />
                    </div>
                  </div>
                  <div
                    className="absolute right-0 bottom-0 flex translate-x-1/4 translate-y-1/4 items-center justify-center rounded-full bg-white"
                    style={{
                      width: 14,
                      height: 14,
                      border: `1px solid ${protocolColor}`,
                      boxShadow: `0 0 2px ${protocolColor}60`,
                    }}
                  >
                    <img
                      src={protocolIcon}
                      alt="Protocol"
                      className="h-3/4 w-3/4 rounded-full object-contain"
                    />
                  </div>
                </button>

                {/* Name + ticker + stats */}
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={goToTrade}
                      onMouseEnter={preload}
                      className="cursor-pointer truncate text-left text-sm font-semibold text-white hover:text-emerald-300 sm:text-[15px]"
                      title={displayName ?? undefined}
                    >
                      {displaySymbol}
                    </button>
                    <span
                      className="max-w-[140px] truncate text-xs text-neutral-500 sm:max-w-[220px]"
                      title={displayName ?? undefined}
                    >
                      {displayName !== displaySymbol ? displayName : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyMint(token.mint)}
                      title="Copy mint address"
                      className="cursor-pointer text-neutral-500 hover:text-neutral-200"
                    >
                      <FiCopy className="h-3 w-3" />
                    </button>
                    {copiedMint === token.mint && (
                      <span className="text-[10px] text-emerald-400">
                        Copied
                      </span>
                    )}
                    <button
                      type="button"
                      title="Star"
                      className="cursor-pointer text-neutral-500 hover:text-yellow-300"
                    >
                      <FiStar className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="mt-0.5 text-[11px] text-emerald-400">
                    {formatAge(ageMs)}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-400">
                    <span>
                      H{" "}
                      <span className="font-semibold text-white">
                        {holders}
                      </span>
                    </span>
                    <span>
                      MC{" "}
                      <span className="font-semibold text-emerald-400">
                        {marketCap ? `$${formatMarketCap(marketCap)}` : "-"}
                      </span>
                    </span>
                    <span>
                      L{" "}
                      <span className="font-semibold text-white">
                        {liquidity ? `$${formatMarketCap(liquidity)}` : "-"}
                      </span>
                    </span>
                    <span>
                      TX <span className="font-semibold text-white">{totalTx}</span>
                    </span>
                    <span>
                      Last TX{" "}
                      <span className="font-semibold text-white">
                        {formatAge(lastTxMs)}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Buy/sell summary + quick buy */}
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2 text-[11px] sm:text-xs">
                    <span className="font-semibold text-emerald-400 tabular-nums">
                      {token.buyCount}
                      <span className="text-neutral-500"> /</span>
                      {formatUsdShort(token.buyUsd)}
                    </span>
                    <span className="text-neutral-600">·</span>
                    <span className="font-semibold text-red-400 tabular-nums">
                      {token.sellCount}
                      <span className="text-neutral-500"> /</span>
                      {formatUsdShort(token.sellUsd)}
                    </span>
                  </div>
                  <div className="flex h-1 w-[120px] overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className="h-full bg-emerald-500"
                      style={{
                        width: `${Math.max(2, Math.min(98, buyShare * 100))}%`,
                      }}
                    />
                    <div className="h-full flex-1 bg-red-500" />
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onQuickBuy(token.lastTrade);
                    }}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-blue-500/15 text-blue-400 transition-colors hover:bg-blue-500/25 hover:text-blue-300"
                    title={`Quick buy ${quickBuyAmount} SOL`}
                  >
                    <HiLightningBolt className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* WALLETS TABLE */}
              <div className="border-t border-white/[0.04] bg-black/40">
                <table className="w-full min-w-[640px] text-[11px] sm:text-xs">
                  <thead>
                    <tr className="text-neutral-500">
                      <th className="px-3 py-2 text-left font-normal sm:px-4">
                        Wallet
                      </th>
                      <th className="px-3 py-2 text-left font-normal sm:px-4">
                        Time in Trade
                      </th>
                      <th className="px-3 py-2 text-left font-normal sm:px-4">
                        Bought
                      </th>
                      <th className="px-3 py-2 text-left font-normal sm:px-4">
                        Sold
                      </th>
                      <th className="px-3 py-2 text-left font-normal sm:px-4">
                        PNL
                      </th>
                      <th className="px-3 py-2 text-right font-normal sm:px-4">
                        Remaining
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {walletRows.map((w) => {
                      const remainingTokens = Math.max(
                        0,
                        w.boughtTokens - w.soldTokens,
                      );
                      const remainingUsd = currentPriceUsd
                        ? remainingTokens * currentPriceUsd
                        : 0;
                      // Total PnL = (sold value + current value of remaining) - bought value.
                      const pnl =
                        w.soldUsd + remainingUsd - w.boughtUsd;
                      const timeInTradeMs = now - w.firstAt;
                      const pnlPositive = pnl >= 0;
                      return (
                        <tr
                          key={w.wallet}
                          className="border-t border-white/[0.03] hover:bg-white/[0.02]"
                        >
                          <td className="px-3 py-2 sm:px-4">
                            <span
                              className="inline-flex items-center gap-1.5 text-neutral-200"
                              title={w.wallet}
                            >
                              <FiStar className="h-3 w-3 text-yellow-400" />
                              <span className="truncate">{w.walletName}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2 text-neutral-300 sm:px-4">
                            {formatAge(timeInTradeMs)}
                          </td>
                          <td className="px-3 py-2 sm:px-4">
                            <div className="flex flex-col">
                              <span className="font-semibold text-emerald-400 tabular-nums">
                                {formatUsdShort(w.boughtUsd)}
                              </span>
                              <span className="text-[10px] text-neutral-500">
                                {w.buyCount} txn{w.buyCount === 1 ? "" : "s"}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 sm:px-4">
                            <div className="flex flex-col">
                              <span className="font-semibold text-red-400 tabular-nums">
                                {formatUsdShort(w.soldUsd)}
                              </span>
                              <span className="text-[10px] text-neutral-500">
                                {w.sellCount} txn
                                {w.sellCount === 1 ? "" : "s"}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 sm:px-4">
                            <span
                              className={`font-semibold tabular-nums ${
                                pnlPositive
                                  ? "text-emerald-400"
                                  : "text-red-400"
                              }`}
                            >
                              {pnlPositive ? "+" : "-"}
                              {formatUsdShort(Math.abs(pnl))}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-neutral-200 sm:px-4">
                            {remainingUsd > 0
                              ? formatUsdShort(remainingUsd)
                              : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
