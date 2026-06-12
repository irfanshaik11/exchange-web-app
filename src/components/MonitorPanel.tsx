import React, { useState, useEffect, useMemo, useRef } from "react";
import { useResolvedTokenImages } from "~/hooks/useResolvedTokenImages";
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

/**
 * Compact "held for" duration label derived from a wallet's first→last
 * (or first→now) timestamps. Pure presentational formatter — no data fetch.
 */
function formatHeldFor(fromMs: number, toMs: number): string {
  const ms = toMs - fromMs;
  if (!ms || ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
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
    // Mark in-flight to dedupe; a FAILED fetch is un-marked below so it retries
    // on the next data tick instead of being permanently stuck on "-" / no image.
    todo.forEach((m) => fetchedRef.current.add(m));

    Promise.allSettled(
      todo.map(async (mint) => {
        try {
          const goUrl = process.env.NEXT_PUBLIC_GO_SERVICE_URL;
          if (!goUrl) return;
          // Retry transient 502/503/504 (deploy/restart churn) — a single blip
          // used to leave MC as "-" for the whole session because the mint was
          // pre-marked fetched and never retried.
          let data: any = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 5000);
              const resp = await fetch(`${goUrl}/v1/token/${mint}`, {
                signal: controller.signal,
              });
              clearTimeout(timeoutId);
              if (resp.ok) {
                data = await resp.json();
                break;
              }
              if (
                (resp.status === 502 ||
                  resp.status === 503 ||
                  resp.status === 504) &&
                attempt < 2
              ) {
                await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
                continue;
              }
              break; // non-retryable status
            } catch {
              if (attempt < 2) {
                await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
                continue;
              }
            }
          }
          const token = data?.token;
          if (!token) {
            fetchedRef.current.delete(mint); // allow a later retry
            return;
          }
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

  // Resolve token avatars through the shared cascade (proxy + cache + server
  // DAS heal) — the raw image_url from /v1/token frequently 403s or is an
  // unresolved IPFS/metadata link.
  const imageItems = useMemo(
    () =>
      tokenAggs.map((t) => {
        const meta = metadata.get(t.mint);
        return {
          mint: t.mint,
          raw: meta?.image_url ?? meta?.image ?? null,
          uri: meta?.uri ?? null,
        };
      }),
    [tokenAggs, metadata],
  );
  const resolvedImages = useResolvedTokenImages(imageItems);

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
      <div className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-3 px-3 py-3 sm:px-5">
        {tokenAggs.map((token) => {
          const meta = metadata.get(token.mint);
          const displaySymbol =
            token.symbol ||
            meta?.symbol ||
            (token.mint ? token.mint.slice(0, 6) + "…" : "Unknown");
          const displayName = token.name || meta?.name || displaySymbol;
          const tokenImageUrl =
            resolvedImages[token.mint] ||
            // Server-healed tokens.image shows instantly vs the async hook.
            meta?.image ||
            (meta ? extractTokenImage(meta) : null);
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
              className="@container flex flex-col overflow-hidden rounded-lg border border-white/[0.06] bg-[#0c0e12] shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-colors hover:border-white/[0.1]"
            >
              {/* HEADER ROW */}
              <div className="flex items-start gap-3 px-3.5 py-3.5">
                {/* Icon */}
                <button
                  type="button"
                  onClick={goToTrade}
                  onMouseEnter={preload}
                  className="relative flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center"
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
                    <div className="relative h-8 w-8 overflow-hidden rounded-md">
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

                {/* Name + ticker + mint line */}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex min-w-0 items-baseline gap-1.5">
                    <button
                      type="button"
                      onClick={goToTrade}
                      onMouseEnter={preload}
                      className="max-w-full cursor-pointer truncate text-left text-[15px] font-semibold leading-tight text-white hover:text-emerald-300"
                      title={displayName ?? undefined}
                    >
                      {displaySymbol}
                    </button>
                    {displayName !== displaySymbol && (
                      <span
                        className="min-w-0 truncate text-xs text-neutral-500"
                        title={displayName ?? undefined}
                      >
                        {displayName}
                      </span>
                    )}
                  </div>
                  <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-white/40">
                    <span className="tabular-nums text-[#18c48c]">
                      {formatAge(ageMs)}
                    </span>
                    <span className="text-white/20">·</span>
                    <span className="truncate font-mono text-white/35">
                      {token.mint.slice(0, 4)}…{token.mint.slice(-4)}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyMint(token.mint)}
                      title="Copy mint address"
                      className="flex-shrink-0 cursor-pointer text-neutral-500 transition-colors hover:text-neutral-200"
                    >
                      <FiCopy className="h-3 w-3" />
                    </button>
                    {copiedMint === token.mint && (
                      <span className="flex-shrink-0 text-[10px] text-emerald-400">
                        Copied
                      </span>
                    )}
                    <button
                      type="button"
                      title="Star"
                      className="flex-shrink-0 cursor-pointer text-neutral-500 transition-colors hover:text-yellow-300"
                    >
                      <FiStar className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Buy/sell summary + quick buy */}
                <div className="flex flex-shrink-0 flex-col items-end gap-2">
                  <div className="flex flex-col items-end leading-tight">
                    <span className="hidden text-[9px] uppercase tracking-wider text-white/30 @[20rem]:block">
                      Buys / Sells
                    </span>
                    <span className="text-xs tabular-nums">
                      <span className="font-semibold text-[#18c48c]">
                        {token.buyCount}
                      </span>
                      <span className="text-neutral-600"> / </span>
                      <span className="font-semibold text-[#ef4444]">
                        {token.sellCount}
                      </span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onQuickBuy(token.lastTrade);
                    }}
                    className="flex cursor-pointer items-center gap-1 rounded-full border border-[#18c48c]/20 bg-[#18c48c]/10 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-[#18c48c] transition-colors hover:bg-[#18c48c]/20"
                    title={`Quick buy ${quickBuyAmount} SOL`}
                  >
                    <HiLightningBolt className="h-3 w-3" />
                    <span>{quickBuyAmount}</span>
                  </button>
                </div>
              </div>

              {/* SECONDARY STAT STRIP — progressive disclosure by card width.
                  MC + TX always show; Holders/Vol/Liq reveal on wider cards. */}
              <div className="flex items-center gap-x-4 gap-y-1.5 border-t border-white/[0.06] px-3.5 py-2.5">
                {[
                  {
                    label: "MC",
                    value: marketCap ? `$${formatMarketCap(marketCap)}` : "-",
                    show: "", // always
                  },
                  {
                    label: "TX",
                    value: String(totalTx),
                    show: "", // always
                  },
                  {
                    label: "Vol",
                    value: formatUsdShort(token.buyUsd + token.sellUsd),
                    show: "hidden @[19rem]:flex",
                  },
                  {
                    label: "Holders",
                    value: String(holders),
                    show: "hidden @[24rem]:flex",
                  },
                  {
                    label: "Liq",
                    value: liquidity ? `$${formatMarketCap(liquidity)}` : "-",
                    show: "hidden @[28rem]:flex",
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className={`min-w-0 flex-col leading-tight ${stat.show || "flex"}`}
                  >
                    <span className="text-[9px] uppercase tracking-wider text-white/30">
                      {stat.label}
                    </span>
                    <span className="truncate text-[11px] font-semibold tabular-nums text-white/80">
                      {stat.value}
                    </span>
                  </div>
                ))}
                <div className="ml-auto flex h-1.5 w-[64px] flex-shrink-0 overflow-hidden rounded-full bg-[#080a0d]">
                  <div
                    className="h-full bg-[#18c48c] transition-all duration-300"
                    style={{
                      width: `${Math.max(2, Math.min(98, buyShare * 100))}%`,
                    }}
                  />
                  <div className="h-full flex-1 bg-[#ef4444] transition-all duration-300" />
                </div>
              </div>

              {/* WALLETS TABLE — "Held For" + txn sublines hide on narrow cards */}
              <div className="mt-auto border-t border-white/[0.06] bg-[#08090c]">
                <table className="w-full table-fixed text-[11px]">
                  <colgroup>
                    <col className="w-[34%] @[22rem]:w-[28%]" />
                    <col className="hidden @[22rem]:table-column @[22rem]:w-[14%]" />
                    <col className="w-[22%] @[22rem]:w-[20%]" />
                    <col className="w-[22%] @[22rem]:w-[20%]" />
                    <col className="w-[22%] @[22rem]:w-[18%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="px-3.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-white/30">
                        Wallet
                      </th>
                      <th className="hidden px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-white/30 @[22rem]:table-cell">
                        Held For
                      </th>
                      <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-white/30">
                        Bought
                      </th>
                      <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-white/30">
                        Sold
                      </th>
                      <th className="px-3.5 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-white/30">
                        PNL
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
                      const stillHolding = remainingTokens > 0.001;
                      const heldTo = stillHolding ? now : w.lastAt;
                      const pnlPositive = pnl >= 0;
                      return (
                        <tr
                          key={w.wallet}
                          className="border-b border-white/[0.04] transition-colors last:border-b-0 hover:bg-white/[0.04]"
                        >
                          <td className="px-3.5 py-2.5">
                            <span
                              className="flex min-w-0 items-center gap-1.5 text-neutral-200"
                              title={w.wallet}
                            >
                              <span className="flex-shrink-0 text-sm leading-none">
                                {w.walletEmoji}
                              </span>
                              <span className="min-w-0 truncate font-medium">
                                {w.walletName}
                              </span>
                              {/* Holding dot shows here when "Held For" column is collapsed */}
                              {stillHolding && (
                                <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#18c48c] @[22rem]:hidden" />
                              )}
                            </span>
                          </td>
                          <td className="hidden px-2 py-2.5 @[22rem]:table-cell">
                            <span className="inline-flex items-center gap-1 tabular-nums text-neutral-400">
                              {stillHolding && (
                                <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#18c48c]" />
                              )}
                              {formatHeldFor(w.firstAt, heldTo)}
                            </span>
                          </td>
                          <td className="px-2 py-2.5 text-right">
                            <div className="flex flex-col items-end leading-tight">
                              <span className="font-semibold tabular-nums text-[#18c48c]">
                                {formatUsdShort(w.boughtUsd)}
                              </span>
                              <span className="hidden text-[10px] tabular-nums text-neutral-500 @[24rem]:block">
                                {w.buyCount} txn{w.buyCount === 1 ? "" : "s"}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-right">
                            <div className="flex flex-col items-end leading-tight">
                              <span className="font-semibold tabular-nums text-[#ef4444]">
                                {formatUsdShort(w.soldUsd)}
                              </span>
                              <span className="hidden text-[10px] tabular-nums text-neutral-500 @[24rem]:block">
                                {w.sellCount} txn
                                {w.sellCount === 1 ? "" : "s"}
                              </span>
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5 text-right">
                            <span
                              className="font-semibold tabular-nums"
                              style={{
                                color: pnlPositive ? "#18c48c" : "#ef4444",
                              }}
                            >
                              {pnlPositive ? "+" : "-"}
                              {formatUsdShort(Math.abs(pnl))}
                            </span>
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
