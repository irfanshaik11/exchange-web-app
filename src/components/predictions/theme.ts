// src/components/predictions/theme.ts
// Single source of truth for prediction market UI colors

export const PredictionTheme = {
  // Base colors
  bg: "#111214",
  surface: "#12141a",
  surfaceHover: "#1a1d24",
  border: "#1e2028",
  text: "#f0f0f0",
  muted: "#6b7280",

  // Semantic colors
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

  // Accent (primary action color)
  accent: "#4ADE80",
  accentGlow: "rgba(74, 222, 128, 0.2)",
} as const;

// Portfolio page theme - matches the darker portfolio styling
export const PortfolioTheme = {
  // Base colors - darker than prediction theme
  bg: "#050608",
  surface: "#111214",
  surfaceHover: "#1A1B23",
  border: "#2A2B33",
  text: "#f0f5f5",
  muted: "#9CA3AF",

  // Semantic colors - teal-based like portfolio page
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

  // Accent (primary action color) - teal like portfolio
  accent: "#70E0B0",
  accentGlow: "rgba(112, 224, 176, 0.2)",
} as const;

// Type for theme colors
export type ThemeColor = keyof typeof PredictionTheme;
