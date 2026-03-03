import kolWallets from "../data/kolWallets.json";

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
    KOL_ADDRESS_MAP.set(key, {
      name: entry.name,
      twitterUsername: entry.twitterUsername,
      label: makeLabel(entry.name, entry.twitterUsername),
      namedColor: color.named,
      hexColor: color.hex,
      avatarUrl: entry.twitterUsername
        ? `/kol-avatars/${entry.twitterUsername}.jpg`
        : undefined,
    });
  },
);
