// src/components/predictions/theme.ts
// Single source of truth for prediction market UI colors
// Design language: Polymarket-inspired dark professional trading UI

export const PredictionTheme = {
  bg: "#111214",
  surface: "#12141a",
  surfaceHover: "#1a1d24",
  border: "#1e2028",
  text: "#f0f0f0",
  muted: "#6b7280",
  green: "#4ADE80",
  greenBg: "rgba(74, 222, 128, 0.15)",
  red: "#F87171",
  redBg: "rgba(248, 113, 113, 0.15)",
  yellow: "#FBBF24",
  yellowBg: "rgba(251, 191, 36, 0.15)",
  purple: "#818CF8",
  purpleBg: "rgba(129, 140, 248, 0.15)",
  blue: "#60A5FA",
  blueBg: "rgba(96, 165, 250, 0.15)",
  gold: "#FFD700",
  goldBg: "rgba(255, 215, 0, 0.15)",
  accent: "#4ADE80",
  accentGlow: "rgba(74, 222, 128, 0.2)",
} as const;

export const PortfolioTheme = {
  bg: "#020204",
  surface: "#111214",
  surfaceHover: "#1A1B23",
  border: "#2A2B33",
  text: "#f0f5f5",
  muted: "#9CA3AF",
  green: "#70E0B0",
  greenBg: "rgba(112, 224, 176, 0.15)",
  red: "#FF4D7F",
  redBg: "rgba(255, 77, 127, 0.15)",
  yellow: "#FBBF24",
  yellowBg: "rgba(251, 191, 36, 0.15)",
  purple: "#818CF8",
  purpleBg: "rgba(129, 140, 248, 0.15)",
  blue: "#60A5FA",
  blueBg: "rgba(96, 165, 250, 0.15)",
  gold: "#FFD700",
  goldBg: "rgba(255, 215, 0, 0.15)",
  accent: "#70E0B0",
  accentGlow: "rgba(112, 224, 176, 0.2)",
} as const;

// V2 theme — consolidated, used by all prediction V2 components.
// Every prediction component should import from here instead of defining inline palettes.
export const T = {
  // Base — Polymarket-matched dark palette
  bg: "#131517",
  bgCard: "#1c1f24",
  bgCardHover: "#252930",
  bgElevated: "#1e2228",
  surface: "rgba(255, 255, 255, 0.03)",
  surfaceHover: "rgba(255, 255, 255, 0.05)",

  // Borders — Polymarket uses visible but subtle borders
  border: "#2a2e35",
  borderHover: "#3a3e45",
  borderActive: "#4a4e55",

  // Text hierarchy
  text: "#ffffff",
  textSecondary: "#858d98",
  muted: "#7a8090",
  subtle: "#3a3f4a",

  // Semantic — trading teal/rose (premium, not standard green/red)
  green: "#10b981",
  greenLight: "#34d399",
  greenSoft: "rgba(16, 185, 129, 0.10)",
  greenBorder: "rgba(16, 185, 129, 0.20)",
  greenText: "#34d399",

  red: "#f43f5e",
  redLight: "#fb7185",
  redSoft: "rgba(244, 63, 94, 0.10)",
  redBorder: "rgba(244, 63, 94, 0.20)",
  redText: "#fb7185",

  // Other semantic
  yellow: "#FBBF24",
  yellowSoft: "rgba(251, 191, 36, 0.10)",
  purple: "#818CF8",
  purpleSoft: "rgba(129, 140, 248, 0.10)",
  cyan: "#22D3EE",
  cyanSoft: "rgba(34, 211, 238, 0.08)",
  orange: "#FB923C",
  blue: "#3b82f6",
  blueSoft: "rgba(59, 130, 246, 0.10)",

  // Accent — primary action color (blue, like Polymarket)
  accent: "#3b82f6",
  accentHover: "#2563eb",
  accentSoft: "rgba(59, 130, 246, 0.10)",

  // Layout
  sidebarWidth: 56,
  sidebarExpandedWidth: 220,
  headerHeight: 48,
  rowRadius: 10,
  cardRadius: 12,

  // Effects
  glowIntensity: 0.35,
  cardShadow: 'none',
  cardShadowHover: '0 4px 12px rgba(0,0,0,0.3)',
  textShadow: '0 2px 12px rgba(0,0,0,0.8)',
  textShadowStrong: '0 2px 20px rgba(0,0,0,0.9), 0 0 40px rgba(0,0,0,0.6)',
  shimmerDuration: '3s',
  transitionSnappy: '150ms cubic-bezier(0.16, 1, 0.3, 1)',
  transitionSmooth: '300ms cubic-bezier(0.16, 1, 0.3, 1)',
} as const;

export type ThemeColor = keyof typeof PredictionTheme;
