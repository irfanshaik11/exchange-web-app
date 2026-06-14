// src/components/perpetuals/PerpHeader.tsx
// Horizontal header strip for perp trade page: symbol, mark price, index price,
// 24h change, volume, OI, funding rate with countdown.

import React, { useState, useEffect } from "react";
import type { HyperliquidMarketRow } from "../../utils/hyperliquidTypes";
import PerpMarketSwitcher from "./PerpMarketSwitcher";

/* ---------- AX palette (matches TradeHeader) ---------- */
import { AX } from "./perpTheme";

interface PerpHeaderProps {
  market: HyperliquidMarketRow | undefined;
  markPrice?: number;
}

function formatUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function formatPrice(value: number): string {
  if (value >= 1000) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (value >= 1) return `$${value.toFixed(4)}`;
  return `$${value.toPrecision(4)}`;
}

/**
 * Countdown to next funding time (every 8 hours: 00:00, 08:00, 16:00 UTC).
 */
function useFundingCountdown(): string {
  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const hours = now.getUTCHours();
      const nextFundingHour = hours < 8 ? 8 : hours < 16 ? 16 : 24;
      const next = new Date(now);
      next.setUTCHours(nextFundingHour, 0, 0, 0);
      if (nextFundingHour === 24) next.setUTCDate(next.getUTCDate() + 1);

      const diff = next.getTime() - now.getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${h}h ${m}m ${s}s`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return countdown;
}

/* ---------- StatCell: label + value, matches TradeHeader StatInline ---------- */
function StatCell({
  label,
  children,
  color,
}: {
  label: string;
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="flex flex-col items-start gap-0.5 min-w-fit">
      <span
        className="text-[10px] tracking-wider uppercase"
        style={{ color: AX.muted }}
      >
        {label}
      </span>
      <span
        className="text-[12px] tabular-nums"
        style={{
          color: color || AX.text,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {children}
      </span>
    </div>
  );
}

export default function PerpHeader({ market, markPrice }: PerpHeaderProps) {
  const fundingCountdown = useFundingCountdown();

  if (!market) {
    return (
      <div
        className="flex h-12 items-center px-4"
        style={{
          backgroundColor: AX.bg,
          borderBottom: `1px solid ${AX.border}`,
        }}
      >
        <div
          className="h-4 w-48 animate-pulse rounded"
          style={{ backgroundColor: AX.surface }}
        />
      </div>
    );
  }

  const displayPrice = markPrice || market.markPx;
  const changeColor = market.change24hPct >= 0 ? AX.green : AX.red;
  const fundingColor = market.funding >= 0 ? AX.green : AX.red;

  return (
    <div
      className="flex items-center gap-4 overflow-x-auto px-4 py-2 sm:gap-6"
      style={{
        backgroundColor: AX.bg,
        borderBottom: `1px solid ${AX.border}`,
      }}
    >
      {/* Symbol switcher (icon + name + chevron → searchable market table) + Price */}
      <div className="flex items-center gap-3 min-w-fit">
        <PerpMarketSwitcher market={market} />
        <span
          className="text-[14px] sm:text-[16px] tabular-nums"
          style={{
            color: AX.text,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatPrice(displayPrice)}
        </span>
      </div>

      {/* Divider */}
      <div className="h-6 w-px flex-shrink-0" style={{ backgroundColor: AX.border }} />

      {/* 24h Change */}
      <StatCell label="24h Change" color={changeColor}>
        {market.change24hPct >= 0 ? "+" : ""}
        {market.change24hPct.toFixed(2)}%
      </StatCell>

      {/* 24h Volume */}
      <StatCell label="24h Volume">
        {formatUsd(market.volume24h)}
      </StatCell>

      {/* Open Interest */}
      <StatCell label="Open Interest">
        {formatUsd(market.openInterest * market.markPx)}
      </StatCell>

      {/* Funding Rate */}
      <div className="flex flex-col items-start gap-0.5 min-w-fit">
        <span
          className="text-[10px] tracking-wider uppercase"
          style={{ color: AX.muted }}
        >
          Funding / Countdown
        </span>
        <div className="flex items-center gap-2">
          <span
            className="text-[12px] tabular-nums"
            style={{
              color: fundingColor,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {(market.funding * 100).toFixed(4)}%
          </span>
          <span
            className="text-[11px] tabular-nums"
            style={{
              color: AX.muted,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {fundingCountdown}
          </span>
        </div>
      </div>

      {/* Max Leverage */}
      <StatCell label="Max Leverage">
        {market.maxLeverage}x
      </StatCell>
    </div>
  );
}
