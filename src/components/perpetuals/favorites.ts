// src/components/perpetuals/favorites.ts
// Shared favorite-markets persistence — used by both the /perpetuals market
// list and the trade-header market switcher so the same stars show everywhere.

const FAVORITES_KEY = "hl_fav_markets";

export function loadFavorites(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function saveFavorites(favs: Set<string>): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favs)));
  } catch {
    /* storage unavailable */
  }
}
