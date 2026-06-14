import socials from "../data/kol-socials.json";

export interface KolSocials {
  twitter: string | null; // full https://x.com/... URL
  telegram: string | null; // full https://t.me/... URL
}

// Scraped from kolscan (keyed by wallet address). 516 KOLs w/ twitter, 182 w/ tg.
const MAP = new Map<string, KolSocials>(
  Object.entries(socials as Record<string, KolSocials>).map(([a, s]) => [
    a.toLowerCase(),
    s,
  ]),
);

export function getKolSocials(address?: string | null): KolSocials | undefined {
  if (!address) return undefined;
  return MAP.get(address.toLowerCase());
}

/** Extract @handle from a twitter/x URL for display. */
export function twitterHandle(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:x|twitter)\.com\/([A-Za-z0-9_]+)/i);
  return m ? m[1] : null;
}
