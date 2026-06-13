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
export const LOSS = "#F0616D";

/**
 * Stat-card shell — flat-futuristic. No corner brackets, no shadow. Definition
 * comes from a slightly-raised surface (#0e1116) + a hairline border, and a tiny
 * green accent bar on the label rail (the "terminal" cue) with a divider under
 * the header so content reads as a structured block, not a hollow box.
 */
export const ScanCard: React.FC<{
  label: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ label, right, className, children }) => (
  <div
    className={`relative flex flex-col overflow-hidden rounded-lg border border-white/[0.06] bg-[#0c0e12] p-4 ${
      className ?? ""
    }`}
  >
    <div className="mb-3 flex items-center justify-between border-b border-white/[0.05] pb-2.5">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#71717a]">
        <span className="h-2.5 w-[2px] rounded-full bg-[#18c48c]" />
        {label}
      </div>
      {right}
    </div>
    {children}
  </div>
);

/**
 * A single labelled distribution row: colored dot + label + a horizontal
 * magnitude bar (width ∝ count / maxCount) + the count. The bar makes the
 * buckets read as a comparison, not a bare list (matches the design comp).
 */
export const DistributionRow: React.FC<{
  dotColor: string;
  label: string;
  count: number;
  maxCount?: number;
}> = ({ dotColor, label, count, maxCount }) => {
  const pct =
    maxCount && maxCount > 0
      ? Math.max(count > 0 ? 5 : 0, (count / maxCount) * 100)
      : 0;
  return (
    <div className="flex items-center gap-2.5 text-xs">
      <span
        className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
        style={{ backgroundColor: dotColor }}
      />
      <span className="w-[72px] flex-shrink-0 text-[#71717a]">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: dotColor }}
        />
      </div>
      <span className="w-7 flex-shrink-0 text-right tabular-nums text-[#a1a1aa]">
        {count}
      </span>
    </div>
  );
};

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
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
      <div className="h-full" style={{ width: `${pct}%`, background: "#18c48c" }} />
      <div className="h-full" style={{ width: `${100 - pct}%`, background: "#F0616D" }} />
    </div>
  );
};
