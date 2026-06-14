/**
 * Trackers design system — flat-precision command center.
 *
 * Hard constraints (do not violate when consuming these): NO shadows, NO
 * animations/transitions, NO decorative gradients, NO backdrop-blur. Separation
 * comes from hairline borders + background steps + tabular alignment. All of this
 * is static + cheap (a net perf win vs the old blur/shadow/animation layers).
 *
 * Hierarchy is carried by weight+size and these tokens, not by color. ONE accent
 * (interactive/brand); green/red are reserved STRICTLY for PnL semantics.
 */

export const TK = {
  // Surfaces (flat, opaque) — matched to the CORE app (pulse/trending/discover)
  // so trackers is palette-identical to the rest of the product.
  bgBase: "#030304", // app-wide base
  bgPanel: "#0c0e12", // card / panel (core token)
  bgInset: "#08090c", // nested strip / table head / input
  bgRaised: "#141821", // hover fill / active

  // Borders (hairlines only)
  bdFaint: "rgba(255,255,255,0.06)",
  bdStrong: "rgba(255,255,255,0.10)",
  bdInset: "rgba(255,255,255,0.04)",

  // Text (4 steps)
  txHi: "#F4F4F5",
  txMid: "#A1A1AA",
  txLo: "#71717A",
  txFaint: "#52525B",

  // ONE accent — the BRAND green/mint (interactive / brand / active / focus /
  // highlight), so trackers matches pulse/trending/discover exactly. NEVER used
  // for PnL background tints (it IS the gain color, so accent vs gain are the
  // same hue — that's fine here; we differentiate by role: solid fills/borders =
  // interactive, the pnlHeat tints = data).
  accent: "#18c48c", // brand green (core token)
  accentHi: "#7FFFC9", // mint (hero text / gradient top / glow-free highlight)
  accentBg: "rgba(24,196,140,0.10)",
  accentBd: "rgba(24,196,140,0.30)",

  // Semantic PnL (green/red ONLY)
  gain: "#18c48c",
  loss: "#F0616D",
  neutralPnl: "#71717A",
} as const;

/* ── FUTURISTIC-CLEAN recipes (brand green; static, single-paint, no blur/shadow/
 *    animation). "Futuristic" is the TREATMENT (grid, sharp type, color-as-data),
 *    not the color — so it reads premium AND matches the core trading pages. ──
 *
 * Hero gradient text (page titles / big numbers) — mint→green:
 *   className="bg-clip-text text-transparent font-black uppercase tracking-wider"
 *   style={{backgroundImage:"linear-gradient(90deg,#7FFFC9,#18c48c)"}}
 *
 * Accent panel (active tab content / highlighted card / featured row):
 *   style={{background:"linear-gradient(90deg, rgba(24,196,140,0.12) 0%, rgba(12,14,18,0.6) 60%)",
 *           border:"1px solid rgba(24,196,140,0.28)"}}
 *
 * Accent edge rule (left rule on a featured row/card):
 *   <div className="absolute left-0 top-0 bottom-0 w-[2px]"
 *        style={{background:"linear-gradient(180deg,#7FFFC9,#18c48c)"}}/>
 *
 * Faint tech-grid texture (panel backdrop — futuristic depth, ~0 cost):
 *   style={{backgroundImage:
 *     "linear-gradient(rgba(24,196,140,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(24,196,140,0.04) 1px,transparent 1px)",
 *     backgroundSize:"32px 32px"}}
 *
 * Active tab (underline): text-[#18c48c] font-semibold + 2px solid #18c48c bottom rule.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * pnlHeat — the signature color-as-data engine, reused app-wide (table cells,
 * calendar tiles, position bars, win/loss strips). `ratio` is the value relative
 * to the max magnitude in its set, clamped to [-1, 1].
 *
 * - text: full-chroma gain/loss (never fade text — readability), neutral at 0.
 * - bg:   tint whose alpha scales with magnitude (0.06 → 0.26). Transparent at 0.
 */
export function pnlHeat(ratio: number): { color: string; background: string } {
  if (!Number.isFinite(ratio) || ratio === 0) {
    return { color: TK.neutralPnl, background: "transparent" };
  }
  const r = Math.max(-1, Math.min(1, ratio));
  const alpha = Math.min(0.26, 0.06 + Math.abs(r) * 0.2);
  if (r > 0) return { color: TK.gain, background: `rgba(24,196,140,${alpha})` };
  return { color: TK.loss, background: `rgba(240,97,109,${alpha})` };
}

/** Plain PnL text color (no background) — for inline numbers. */
export function pnlColor(v: number): string {
  return v > 0 ? TK.gain : v < 0 ? TK.loss : TK.neutralPnl;
}

/**
 * heatRatios — normalize a set of values to [-1,1] by the max absolute value,
 * so a table/calendar can heat-grade each row relative to the strongest mover.
 */
export function heatRatios(values: number[]): number[] {
  let max = 0;
  for (const v of values) {
    const a = Math.abs(v);
    if (Number.isFinite(a) && a > max) max = a;
  }
  if (max === 0) return values.map(() => 0);
  return values.map((v) => (Number.isFinite(v) ? v / max : 0));
}

/* ── Tailwind class primitives (copy into components for consistency) ──────────
 * Surface:   rounded-lg border border-white/[0.06] bg-[#0B0D11]
 * Inset:     rounded-md border border-white/[0.04] bg-[#08090C]
 * Tab on:    px-3 py-2 text-[13px] font-semibold text-[#F4F4F5] border-b-2 border-[#5B8CFF] -mb-px
 * Tab off:   px-3 py-2 text-[13px] font-medium text-[#71717A] border-b-2 border-transparent -mb-px hover:text-[#A1A1AA]
 * Pill:      rounded-md border border-white/[0.06] bg-[#08090C] px-2 py-0.5 text-[11px] tabular-nums text-[#A1A1AA]
 * Th label:  px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-[#52525B] text-left
 * Td:        px-3 py-2.5 text-[13px] tabular-nums
 * Row hover: hover:bg-white/[0.025]
 * Accent btn:rounded-md border border-[#5B8CFF]/22 bg-[#5B8CFF]/10 px-2.5 py-1 text-[12px] font-semibold tabular-nums text-[#5B8CFF] hover:bg-[#5B8CFF]/16
 * ──────────────────────────────────────────────────────────────────────────── */
