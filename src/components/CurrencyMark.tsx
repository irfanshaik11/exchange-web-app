"use client";

import { useId } from "react";
import { LuDollarSign } from "react-icons/lu";
import type { QuoteCurrency } from "~/utils/quoteCurrency";

/** Solana brand mark (the 3-bar logo with the teal→purple gradient). */
function SolanaGlyph({ size }: { size: number }) {
  const id = useId();
  const fill = `url(#${id})`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 397.7 311.7"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={id}
          x1="360.8"
          y1="351.5"
          x2="141.4"
          y2="132.1"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#00FFA3" />
          <stop offset="1" stopColor="#DC1FFF" />
        </linearGradient>
      </defs>
      <path
        d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 237.9z"
        fill={fill}
      />
      <path
        d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1L333.1 73.8c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z"
        fill={fill}
      />
      <path
        d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z"
        fill={fill}
      />
    </svg>
  );
}

export interface CurrencyMarkProps {
  currency: QuoteCurrency;
  /** Mark diameter in px. */
  size?: number;
  /** Show the "SOL" / "USDC" text label after the mark. */
  showLabel?: boolean;
  /** Color of the chain-badge ring; match the surrounding surface. */
  ringColor?: string;
  className?: string;
}

/**
 * The single currency mark used everywhere a spend/receive currency is shown.
 *  - SOL  → Solana gradient mark.
 *  - USDC → USDC blue mark with a small Solana badge clipped into the
 *           bottom-right corner — unmistakably "USDC on Solana".
 * Always paired with a text label option (never color alone).
 */
export default function CurrencyMark({
  currency,
  size = 16,
  showLabel = false,
  ringColor = "#0b0b0e",
  className = "",
}: CurrencyMarkProps) {
  const badge = Math.round(size * 0.52);
  return (
    <span
      className={`inline-flex items-center gap-1 align-middle ${className}`}
      aria-label={currency}
    >
      <span
        className="relative inline-flex shrink-0"
        style={{ width: size, height: size }}
      >
        {currency === "USDC" ? (
          <>
            <span
              className="flex h-full w-full items-center justify-center rounded-full bg-[#2775CA] text-white"
              style={{ boxShadow: "inset 0 0 0 0.5px rgba(255,255,255,0.15)" }}
            >
              <LuDollarSign size={size * 0.62} strokeWidth={3} />
            </span>
            <span
              className="absolute -right-[2px] -bottom-[2px] inline-flex items-center justify-center rounded-full"
              style={{
                width: badge,
                height: badge,
                background: ringColor,
                boxShadow: `0 0 0 1.5px ${ringColor}`,
              }}
            >
              <SolanaGlyph size={Math.round(badge * 0.74)} />
            </span>
          </>
        ) : (
          <SolanaGlyph size={size} />
        )}
      </span>
      {showLabel && (
        <span className="text-[11px] font-semibold leading-none tracking-wide">
          {currency}
        </span>
      )}
    </span>
  );
}
