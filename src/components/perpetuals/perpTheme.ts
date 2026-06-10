// src/components/perpetuals/perpTheme.ts
// Single source of truth for perps surface colors — mapped to Interstate's
// canonical design system (globals.css custom properties + the Solana trade
// page palette in pages/trade/[id].tsx), NOT the Axiom-derived palette the
// perps originally shipped with (#111214 / #70E0B0 / #FF4D7F).
//
// Semantics:
//   bg        page background        (matches trade/[id].tsx AX.bg)
//   surface   panels, inputs         (matches --bg-* card levels)
//   surface2  elevated surfaces      (popovers, active chips)
//   border    default hairline       (≈ rgba(255,255,255,0.08) on dark)
//   mint      the Interstate emerald (--accent-primary) — long/buy/positive
//   sell      danger red (--color-danger) — short/sell/negative
//   green/red aliases of mint/sell for P&L coloring (legacy key names)

export const AX = {
  bg: "#0c0d10",
  surface: "#101114",
  surface2: "#141619",
  border: "#1f2127",
  borderLight: "rgba(255, 255, 255, 0.12)",

  text: "#f4f4f5",
  muted: "#a1a1aa",
  mutedDim: "#71717a",

  mint: "#18c48c",
  mintHover: "#22d99a",
  sell: "#ef4444",
  sellHover: "#dc2626",

  // P&L / delta aliases (some components use green/red key names)
  green: "#18c48c",
  red: "#ef4444",

  // Glow shadows for primary buy/sell CTAs (matches TradeActionPanel)
  mintGlow: "0 0 20px rgba(24, 196, 140, 0.25)",
  sellGlow: "0 0 20px rgba(239, 68, 68, 0.25)",
  /** Text color on top of mint/sell filled buttons (near-black, app-wide). */
  onAccent: "#030304",
} as const;

export type PerpTheme = typeof AX;
