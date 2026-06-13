import React from "react";
import Image from "next/image";

import FastImage from "./FastImage";
import { getProtocolBranding } from "~/utils/protocolBranding";

/**
 * Presentational-only building blocks for WalletScanPanel's GMGN-style header
 * cards. No data fetching, no hooks beyond render — every value is passed in by
 * the parent. Mirrors the portfolio page's card visual language:
 * rounded-lg / border-white/[0.06] / bg-[#0c0e12] / with
 * mini corner brackets, #18c48c (gain) / #ef4444 (loss) accents.
 */

export const GAIN = "#18c48c";
export const LOSS = "#ef4444";

/** A stat card shell with the portfolio's corner-bracket chrome. */
export const ScanCard: React.FC<{
  label: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ label, right, className, children }) => (
  <div
    className={`relative flex flex-col rounded-lg border border-white/[0.06] bg-[#0c0e12] p-4 ${
      className ?? ""
    }`}
  >
    {/* Mini corner brackets */}
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
      <div className="absolute left-1.5 top-1.5 h-2.5 w-2.5 border-l border-t border-white/[0.08]" />
      <div className="absolute right-1.5 top-1.5 h-2.5 w-2.5 border-r border-t border-white/[0.08]" />
      <div className="absolute bottom-1.5 left-1.5 h-2.5 w-2.5 border-b border-l border-white/[0.08]" />
      <div className="absolute bottom-1.5 right-1.5 h-2.5 w-2.5 border-b border-r border-white/[0.08]" />
    </div>
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#f4f4f5]">
        {label}
      </div>
      {right}
    </div>
    {children}
  </div>
);

/** A single labelled distribution row with a colored dot and a right count. */
export const DistributionRow: React.FC<{
  dotColor: string;
  label: string;
  count: number;
}> = ({ dotColor, label, count }) => (
  <div className="flex items-center justify-between text-xs">
    <div className="flex items-center gap-2">
      <span
        className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
        style={{ backgroundColor: dotColor }}
      />
      <span className="text-[#71717a]">{label}</span>
    </div>
    <span className="tabular-nums text-[#a1a1aa]">{count}</span>
  </div>
);

/**
 * Canonical token avatar for every wallet-scan tab — the portfolio convention
 * (Positions.tsx / Activity.tsx): 40px rounded-lg image inside a
 * protocol-colored double border, with the white protocol badge bubble at the
 * bottom-right. Pass `mint` so pump-suffix tokens get pump.fun branding even
 * when `protocol` is missing.
 */
export const TokenAvatar: React.FC<{
  imageUrl?: string | null;
  name?: string | null;
  symbol?: string | null;
  mint?: string | null;
  protocol?: string | null;
}> = ({ imageUrl, name, symbol, mint, protocol }) => {
  const protocolSource =
    protocol || (mint?.toLowerCase().endsWith("pump") ? "pumpfun" : "");
  const branding = getProtocolBranding(protocolSource || "");
  const protocolColor = branding.color;
  const badgeIcon = branding.iconUrl;
  const isFullCircleImage = branding.isFullCircle;
  return (
    <div className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center">
      <div
        className="relative rounded-lg ease-out"
        style={{
          border: protocolSource
            ? `1px solid ${protocolColor}`
            : "1px solid rgba(128, 128, 128, 0.3)",
          padding: "2px",
        }}
      >
        <div
          className="relative rounded-lg"
          style={{
            border: "1px solid rgba(192, 192, 192, 0.5)",
            padding: "2px",
          }}
        >
          <div className="relative h-10 w-10 overflow-hidden rounded-lg">
            <FastImage
              src={imageUrl || ""}
              alt={name || symbol || "Token"}
              symbol={symbol || undefined}
              name={name || undefined}
              width={40}
              height={40}
              className="h-full w-full object-cover"
              showBubble={false}
            />
          </div>
        </div>
      </div>
      {protocolSource && badgeIcon && (
        <div
          className="absolute right-0 bottom-0 z-10 flex translate-x-1/4 translate-y-1/4 items-center justify-center rounded-full bg-white"
          style={{
            width: 18,
            height: 18,
            border: `2px solid ${protocolColor}`,
            boxShadow: `0 0 4px ${protocolColor}60`,
          }}
        >
          <Image
            src={badgeIcon}
            alt={`${protocolSource} logo`}
            width={14}
            height={14}
            className={`${isFullCircleImage ? "h-full w-full object-cover" : "h-3/4 w-3/4 object-contain"} rounded-full`}
          />
        </div>
      )}
    </div>
  );
};

/** Thin two-color win/loss progress bar. */
export const WinLossBar: React.FC<{ winPercentage: number }> = ({
  winPercentage,
}) => {
  const pct = Math.min(100, Math.max(0, winPercentage));
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-[#080a0d]">
      <div
        className="h-full bg-[#18c48c]"
        style={{ width: `${pct}%` }}
      />
      <div
        className="h-full bg-[#ef4444]"
        style={{ width: `${100 - pct}%` }}
      />
    </div>
  );
};
