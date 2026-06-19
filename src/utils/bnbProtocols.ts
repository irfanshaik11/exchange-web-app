/**
 * Canonical BNB chain protocol definitions.
 *
 * Single source of truth consumed by:
 *  - BnbFilterPanel  (filter chip labels, values, colors)
 *  - PulseTable      (protocol bubble color, icon, tooltip)
 *
 * When a new BNB launchpad is added, update this file only.
 */

export const BNB_CHAIN_COLOR = '#F3BA2F' as const;

export const BNB_CHAIN_ICON =
  'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png' as const;

export interface BnbProtocolDef {
  /** Human-readable display name (filter chip label, bubble tooltip). */
  label: string;
  /** Exact `launchpad_protocol` value sent by the backend API. */
  value: string;
  /** Hex color for the protocol bubble border, glow, and bonding-arc. */
  color: string;
  /** Logo URL rendered inside the 16 px protocol bubble. */
  icon: string;
  /** True if this protocol only appears in the New Pairs column. */
  newPairsOnly?: boolean;
}

// Order matches the GMGN BNB filter panel layout (row-major, 3-column grid).
// findBnbProtocol uses a length-sorted substring fallback, so array position
// does not affect matching — only the visual display order.
export const BNB_PROTOCOLS: readonly BnbProtocolDef[] = [
  {
    label: 'Fourmeme',
    value: 'four.meme',
    color: '#22c55e',
    icon: 'https://four.meme/favicon.ico',
  },
  {
    label: 'Cubepeg',
    value: 'cubepeg',
    color: '#8b5cf6',
    icon: BNB_CHAIN_ICON,
  },
  {
    label: 'Likwid Dex',
    value: 'likwid',
    color: '#ec4899',
    icon: 'https://dappbay-static.bnbchain.org/static/dapp-uploads/m7LfxKovW7rhozFyO7YV-',
  },
  {
    label: 'Goplus Creator',
    value: 'goplus creator',
    color: '#f59e0b',
    icon: BNB_CHAIN_ICON,
  },
  {
    label: 'Goplus Skill',
    value: 'goplus skill',
    color: '#f59e0b',
    icon: BNB_CHAIN_ICON,
  },
  // OpenFour is a distinct launchpad with its own color even though
  // bnbTokenImage.ts groups it under isFourMemeProtocol for image resolution.
  {
    label: 'OpenFour',
    value: 'openfour',
    color: '#06b6d4',
    icon: BNB_CHAIN_ICON,
  },
  {
    label: 'X Mode',
    value: 'x mode',
    color: '#f59e0b',
    icon: BNB_CHAIN_ICON,
  },
  {
    label: 'Flap',
    value: 'flap',
    color: '#8b5cf6',
    icon: 'https://dappbay-static.bnbchain.org/static/dapp-uploads/yn7msN78FM-fW7LsGrgzs',
  },
  {
    label: 'Flap AI',
    value: 'flap ai',
    color: '#8b5cf6',
    icon: 'https://dappbay-static.bnbchain.org/static/dapp-uploads/yn7msN78FM-fW7LsGrgzs',
  },
  {
    label: 'Printr',
    value: 'printr',
    color: '#06b6d4',
    icon: BNB_CHAIN_ICON,
  },
  {
    label: 'Clanker',
    value: 'clanker',
    color: '#6366f1',
    icon: 'https://coin-images.coingecko.com/coins/images/51440/large/CLANKER.png?1731232869',
    newPairsOnly: true,
  },
  {
    label: 'Luna.fun',
    value: 'luna.fun',
    color: '#ec4899',
    icon: 'https://dappbay-static.bnbchain.org/static/dapp-uploads/22YZhnpY6G3aGYYKUioqI',
  },
  {
    label: 'Pancake',
    value: 'pancake',
    color: '#f59e0b',
    icon: 'https://s2.coinmarketcap.com/static/img/coins/64x64/7186.png',
    newPairsOnly: true,
  },
  {
    label: 'Uniswap',
    value: 'uniswap',
    color: '#ff007a',
    icon: 'https://s2.coinmarketcap.com/static/img/coins/64x64/7083.png',
    newPairsOnly: true,
  },
];

// Sorted once at module load — longer values first so "flap ai" beats "flap",
// "goplus creator" beats "goplus skill", etc. Avoids re-sorting on every lookup.
const BNB_PROTOCOLS_BY_LENGTH = [...BNB_PROTOCOLS].sort(
  (a, b) => b.value.length - a.value.length,
);

/**
 * Look up a BNB protocol definition by its API `launchpad_protocol` string.
 *
 * Matching strategy:
 *  1. Exact match on `def.value` (preferred).
 *  2. Longer-first substring match as a fallback for API variants
 *     (e.g. "pancakeswap" → "pancake").
 */
export function findBnbProtocol(
  raw: string | undefined | null,
): BnbProtocolDef | undefined {
  if (!raw) return undefined;
  const p = raw.toLowerCase().trim();

  const exact = BNB_PROTOCOLS.find((def) => def.value === p);
  if (exact) return exact;

  return BNB_PROTOCOLS_BY_LENGTH.find((def) => p.includes(def.value));
}
