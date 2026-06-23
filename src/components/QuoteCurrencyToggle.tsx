"use client";

import { useUser } from "~/components/UserContext";
import CurrencyMark from "~/components/CurrencyMark";

// Ring color = the toggle's own surface, so the USDC chain badge "cuts out" cleanly.
const RING = "#141417";

/**
 * Global SOL/USDC quote-currency toggle for the header. Flips the app-wide
 * `quoteCurrency` so every Solana buy surface — the trade panel AND quick-buys —
 * spends the chosen currency. Each side shows its real mark (USDC carries the
 * small Solana chain badge) so the active trade currency is unmistakable.
 */
export default function QuoteCurrencyToggle({
  className = "",
}: {
  className?: string;
}) {
  const { quoteCurrency, setQuoteCurrency } = useUser();
  return (
    <div
      className={`relative flex h-8 items-center rounded-lg border border-[#26262b] bg-[#141417] p-0.5 ${className}`}
      role="group"
      aria-label="Trade currency"
    >
      {(["SOL", "USDC"] as const).map((c) => (
        <button
          key={c}
          type="button"
          aria-pressed={quoteCurrency === c}
          onClick={() => setQuoteCurrency(c)}
          title={`Trade everywhere in ${c}`}
          className={[
            "inline-flex h-full cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold tracking-wide transition-colors duration-200 select-none",
            quoteCurrency === c
              ? "bg-[#26262b] text-white"
              : "text-[#71717a] hover:text-white",
          ].join(" ")}
        >
          <CurrencyMark currency={c} size={14} ringColor={RING} />
          {c}
        </button>
      ))}
    </div>
  );
}
