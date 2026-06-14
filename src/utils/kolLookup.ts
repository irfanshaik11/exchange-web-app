import kolWallets from "../data/kolWallets.json";
import kolWalletTracker from "../data/kol-wallet-tracker.json";

// kolWallets.json has 133 entries with an empty twitterUsername (no DP).
// kol-wallet-tracker.json carries handles for some of them — overlay those so
// more KOLs resolve a profile pic. Keyed by lowercase address; tracker handle
// only fills a gap, never overrides an existing kolWallets handle.
const TRACKER_HANDLE_BY_ADDR = new Map<string, string>();
for (const t of kolWalletTracker as Array<{ wallet?: string; handle?: string }>) {
  if (t.wallet && t.handle) {
    TRACKER_HANDLE_BY_ADDR.set(t.wallet.toLowerCase(), t.handle);
  }
}

export interface KolInfo {
  name: string;
  twitterUsername: string;
  label: string;
  namedColor: string;
  hexColor: string;
  avatarUrl?: string;
}

// 20 distinct colors that cycle for 100 KOLs
// getMarks() only accepts CSS named colors; getTimescaleMarks() uses hex
const COLOR_PALETTE: { named: string; hex: string }[] = [
  { named: "dodgerblue", hex: "#1e90ff" },
  { named: "orchid", hex: "#da70d6" },
  { named: "gold", hex: "#ffd700" },
  { named: "cyan", hex: "#00ffff" },
  { named: "mediumseagreen", hex: "#3cb371" },
  { named: "hotpink", hex: "#ff69b4" },
  { named: "slateblue", hex: "#6a5acd" },
  { named: "coral", hex: "#ff7f50" },
  { named: "khaki", hex: "#f0e68c" },
  { named: "mediumpurple", hex: "#9370db" },
  { named: "lightsalmon", hex: "#ffa07a" },
  { named: "plum", hex: "#dda0dd" },
  { named: "sandybrown", hex: "#f4a460" },
  { named: "mediumaquamarine", hex: "#66cdaa" },
  { named: "darkturquoise", hex: "#00ced1" },
  { named: "tomato", hex: "#ff6347" },
  { named: "steelblue", hex: "#4682b4" },
  { named: "palevioletred", hex: "#db7093" },
  { named: "darkorange", hex: "#ff8c00" },
  { named: "mediumslateblue", hex: "#7b68ee" },
];

/**
 * Generate a 2-char uppercase label from a name.
 * Strips non-ASCII-alpha, takes first 2 chars.
 * Falls back to twitterUsername, then "KL".
 */
function makeLabel(name: string, twitterUsername: string): string {
  const asciiOnly = name.replace(/[^a-zA-Z]/g, "");
  if (asciiOnly.length >= 2) return asciiOnly.slice(0, 2).toUpperCase();

  const twitterAscii = twitterUsername.replace(/[^a-zA-Z]/g, "");
  if (twitterAscii.length >= 2) return twitterAscii.slice(0, 2).toUpperCase();

  return "KL";
}

// Build the lookup map keyed by lowercase wallet address
export const KOL_ADDRESS_MAP = new Map<string, KolInfo>();

kolWallets.forEach(
  (
    entry: { address: string; name: string; twitterUsername: string },
    index: number,
  ) => {
    const key = entry.address.toLowerCase();
    if (KOL_ADDRESS_MAP.has(key)) return; // deduplicate (first wins)

    const color = COLOR_PALETTE[index % COLOR_PALETTE.length];
    // Fill a missing handle from the tracker file when available.
    const handle = entry.twitterUsername || TRACKER_HANDLE_BY_ADDR.get(key) || "";
    KOL_ADDRESS_MAP.set(key, {
      name: entry.name,
      twitterUsername: handle,
      label: makeLabel(entry.name, handle),
      namedColor: color.named,
      hexColor: color.hex,
      avatarUrl: handle ? `/kol-avatars/${handle}.jpg` : undefined,
    });
  },
);

// Add tracker-only wallets (have a handle but aren't in kolWallets.json) so
// they also resolve a name + DP in the wallet list / scan / KOL tab.
(kolWalletTracker as Array<{ wallet?: string; name?: string; handle?: string }>).forEach(
  (t, index) => {
    if (!t.wallet || !t.handle) return;
    const key = t.wallet.toLowerCase();
    if (KOL_ADDRESS_MAP.has(key)) return;
    const color = COLOR_PALETTE[index % COLOR_PALETTE.length];
    KOL_ADDRESS_MAP.set(key, {
      name: t.name || t.handle,
      twitterUsername: t.handle,
      label: makeLabel(t.name || t.handle, t.handle),
      namedColor: color.named,
      hexColor: color.hex,
      avatarUrl: `/kol-avatars/${t.handle}.jpg`,
    });
  },
);

// ── Mayhem Bot wallets ──────────────────────────────────────────────
// Trades from these wallets are painted as a distinct class on the
// OHLC chart (parallel to dev / user / KOL classes). We keep the
// original-case Solana address as the source of truth (easier to copy
// from explorers or paste back into a search bar to verify) and
// lower-case it once at build time for the lookup. This avoids the
// hand-typed-lowercase transcription errors we hit during the first
// rollout where a single character got dropped.
const MAYHEM_WALLET_ADDRESSES_ORIGINAL_CASE = [
  "Gygj9QQby4j2jryqyqBHvLP7ctv2SaANgh4sCb69BUpA", // Mayhem Bot
];

export const MAYHEM_WALLET_ADDRESSES = new Set<string>(
  MAYHEM_WALLET_ADDRESSES_ORIGINAL_CASE.map((a) => a.toLowerCase()),
);

// Mayhem markers share one identity: brand red #c83c51, "MB"/"MS" label.
// getMarks() only accepts CSS named colors — `crimson` (#dc143c) is the
// closest standard name. getTimescaleMarks accepts hex, so it gets the
// exact brand red.
export const MAYHEM_MARK_COLOR_NAMED = "crimson";
export const MAYHEM_MARK_COLOR_HEX = "#c83c51";

// Image rendered inside the in-bar circle on the OHLC chart for Mayhem Bot
// trades. Filename has a space, so it MUST be URL-encoded — passing
// "/mayhem bot.png" raw would 404 in production builds.
export const MAYHEM_MARK_IMAGE_URL = "/mayhem%20bot.png";
