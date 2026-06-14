// src/utils/hyperliquidTokenImages.ts
// Token image resolution for Hyperliquid perpetual markets.
// Priority: static map (instant) → backend cache → letter avatar fallback
// Images are resolved by the backend (DexScreener → Redis), frontend never hits DexScreener.

// CoinGecko CDN for known tokens (instant, no API call)
const CG = "https://assets.coingecko.com/coins/images";

// Static mapping for top tokens — instant fallback while backend cache loads
const STATIC_MAP: Record<string, string> = {
  BTC: `${CG}/1/small/bitcoin.png`,
  ETH: `${CG}/279/small/ethereum.png`,
  SOL: `${CG}/4128/small/solana.png`,
  DOGE: `${CG}/5/small/dogecoin.png`,
  XRP: `${CG}/44/small/xrp-symbol-white-128.png`,
  ADA: `${CG}/975/small/cardano.png`,
  AVAX: `${CG}/12559/small/avalanche.png`,
  LINK: `${CG}/877/small/chainlink-new-logo.png`,
  DOT: `${CG}/12171/small/polkadot.png`,
  MATIC: `${CG}/4713/small/polygon.png`,
  POL: `${CG}/4713/small/polygon.png`,
  UNI: `${CG}/12504/small/uniswap-logo.png`,
  ATOM: `${CG}/1481/small/cosmos_hub.png`,
  LTC: `${CG}/2/small/litecoin.png`,
  BCH: `${CG}/780/small/bitcoin-cash-circle.png`,
  FIL: `${CG}/12817/small/filecoin.png`,
  APT: `${CG}/26455/small/aptos_round.png`,
  ARB: `${CG}/16547/small/arbitrum.png`,
  OP: `${CG}/25244/small/Optimism.png`,
  SUI: `${CG}/26375/small/sui.png`,
  SEI: `${CG}/28205/small/Sei_Logo_-_Transparent.png`,
  INJ: `${CG}/12882/small/Secondary_Symbol.png`,
  TIA: `${CG}/31967/small/tia.png`,
  NEAR: `${CG}/10365/small/near.png`,
  AAVE: `${CG}/12645/small/aave-token.png`,
  MKR: `${CG}/1364/small/Mark_Maker.png`,
  CRV: `${CG}/12972/small/3c325.png`,
  SNX: `${CG}/3887/small/snx.png`,
  PEPE: `${CG}/33957/small/pepe-logo.png`,
  SHIB: `${CG}/11939/small/shiba.png`,
  WIF: `${CG}/33566/small/dogwifhat.png`,
  BONK: `${CG}/28600/small/bonk.png`,
  FLOKI: `${CG}/10947/small/FLOKI.png`,
  RENDER: `${CG}/11636/small/rndr.png`,
  FET: `${CG}/5681/small/Fetch_Mark_Gradient_RGB.png`,
  ONDO: `${CG}/26580/small/ONDO.png`,
  JUP: `${CG}/34188/small/jup.png`,
  PYTH: `${CG}/31924/small/pyth.png`,
  W: `${CG}/35087/small/w.png`,
  JTO: `${CG}/33228/small/jto.png`,
  STX: `${CG}/2069/small/Stacks_Logo.png`,
  PENDLE: `${CG}/15069/small/Pendle_Logo_Normal-03.png`,
  RUNE: `${CG}/6595/small/Rune200x200.png`,
  TRX: `${CG}/1094/small/tron-logo.png`,
  HYPE: `${CG}/40249/small/hyperliquid.png`,
  ENA: `${CG}/36974/small/Ethena.png`,
  WLD: `${CG}/31069/small/worldcoin.png`,
  ORDI: `${CG}/30162/small/ordi.png`,
  BLUR: `${CG}/28453/small/blur.png`,
  MEME: `${CG}/33600/small/MEME_Coin.png`,
  STRK: `${CG}/26997/small/starknet.png`,
  IMX: `${CG}/17233/small/immutableX-symbol-BLK-RGB.png`,
  GMX: `${CG}/18323/small/arbiGMX.png`,
  DYDX: `${CG}/17500/small/dydx.png`,
  FTM: `${CG}/4001/small/Fantom_round.png`,
  ALGO: `${CG}/4030/small/Algorand.png`,
  GRT: `${CG}/13397/small/Graph_Token.png`,
  SAND: `${CG}/12129/small/sandbox_logo.png`,
  MANA: `${CG}/878/small/decentraland-mana.png`,
  AXS: `${CG}/13029/small/axie_infinity_logo.png`,
  APE: `${CG}/24383/small/apecoin.png`,
  LDO: `${CG}/13573/small/Lido_DAO.png`,
  COMP: `${CG}/10775/small/COMP.png`,
  ENS: `${CG}/19785/small/acatxTm8_400x400.png`,
  MASK: `${CG}/14051/small/MASK_token_logo.png`,
  MOG: `${CG}/30335/small/mogcoin.png`,
  POPCAT: `${CG}/33760/small/popcat.png`,
  MEW: `${CG}/36432/small/mew.png`,
  TRUMP: `${CG}/38296/small/trump.png`,
  FARTCOIN: `${CG}/34600/small/fartcoin.png`,
  AI16Z: `${CG}/34959/small/ai16z.png`,
  VIRTUAL: `${CG}/38330/small/virtual.png`,
  PENGU: `${CG}/39528/small/pengu.png`,
  KAITO: `${CG}/40036/small/kaito.png`,
};

// ============ Backend image cache ============

// Canonical backend var is NEXT_PUBLIC_BACKEND_URL (NEXT_PUBLIC_API_URL was never set)
const API_URL = (
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  ""
).replace(/\/$/, "");

// Merged map: static + backend-resolved images
let backendImages: Record<string, string> = {};
let backendFetchedAt = 0;
let backendFetchPromise: Promise<void> | null = null;
const BACKEND_FETCH_INTERVAL_MS = 5 * 60 * 1000; // Re-fetch every 5 min

/**
 * Fetch the full image map from our backend (which caches DexScreener → Redis).
 * Called lazily on first use, then refreshed every 5 minutes.
 */
async function fetchBackendImages(): Promise<void> {
  if (!API_URL) return;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${API_URL}/api/hyperliquid/token-images`, {
      signal: ctrl.signal,
    });
    clearTimeout(t);

    if (!res.ok) return;
    const data = await res.json();

    if (data.images && typeof data.images === "object") {
      backendImages = data.images;
      backendFetchedAt = Date.now();
    }
  } catch {
    // Backend unavailable — static map still works
  }
}

/**
 * Ensure backend images are loaded (lazy init, non-blocking).
 */
function ensureBackendImages(): void {
  const now = Date.now();
  if (now - backendFetchedAt < BACKEND_FETCH_INTERVAL_MS) return;
  if (backendFetchPromise) return;

  backendFetchPromise = fetchBackendImages().finally(() => {
    backendFetchPromise = null;
  });
}

// Color palette for letter avatars
const AVATAR_COLORS = [
  "#3B82F6", "#8B5CF6", "#EC4899", "#F59E0B", "#10B981",
  "#06B6D4", "#F97316", "#6366F1", "#14B8A6", "#E11D48",
  "#84CC16", "#A855F7", "#F43F5E", "#22D3EE", "#D946EF",
];

// ============ Public API ============

/**
 * Get token image URL synchronously.
 * Checks: static map → backend cache → Hyperliquid CDN pattern.
 * Returns null if not found (use letter avatar).
 */
export function getHyperliquidTokenImage(coin: string): string | null {
  const key = coin.toUpperCase();
  // HIP-3 assets are "{dex}:{coin}" — the bare symbol drives static-map hits
  // (e.g. hyna:BTC → BTC) while backend keys are the full uppercased name.
  const bare = key.includes(":") ? key.split(":")[1] : key;

  // 1. Static map (instant, CoinGecko PNGs)
  if (STATIC_MAP[bare]) return STATIC_MAP[bare];

  // 2. Backend-resolved images (Redis-cached, uppercase keys) — full name
  //    first ("KM:USOIL"), then bare ("BTC" for hyna:BTC-style reuse)
  if (backendImages[key]) return backendImages[key];
  if (backendImages[bare]) return backendImages[bare];

  // 3. Hyperliquid CDN fallback. HIP-3 icons live under the FULL prefixed
  //    name in its canonical case ("km:USOIL.svg") — do NOT uppercase the URL.
  //    May 404 for some tokens; CoinIcon's onError falls back to letter avatar.
  const hlCdnUrl = `https://app.hyperliquid.xyz/coins/${coin.includes(":") ? coin : key}.svg`;

  // Trigger lazy backend fetch if stale (will eventually populate backendImages)
  ensureBackendImages();

  return hlCdnUrl;
}

/**
 * Async version: ensures backend images are loaded before returning.
 */
export async function resolveHyperliquidTokenImage(coin: string): Promise<string | null> {
  const key = coin.toUpperCase();
  const bare = key.includes(":") ? key.split(":")[1] : key;

  // Static map first
  if (STATIC_MAP[bare]) return STATIC_MAP[bare];

  // Ensure backend images are loaded
  if (Date.now() - backendFetchedAt >= BACKEND_FETCH_INTERVAL_MS) {
    await fetchBackendImages();
  }

  return backendImages[key] || backendImages[bare] || null;
}

/**
 * Generate a deterministic color for a coin symbol (for letter avatar fallback).
 */
export function getCoinAvatarColor(coin: string): string {
  let hash = 0;
  for (let i = 0; i < coin.length; i++) {
    hash = coin.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
