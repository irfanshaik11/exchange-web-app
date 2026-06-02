import type { Token } from "~/utils/db";

export const SEARCH_HISTORY_KEY = "searchHistory";

// Extended type to include additional fields needed for display
export type SearchHistoryItem = Pick<
  Token,
  | "mint"
  | "symbol"
  | "name"
  | "logo"
  | "total_fully_diluted_valuation"
  | "total_buy_volume_1m"
  | "total_sell_volume_1m"
  | "total_liquidity_usd"
> & {
  // Additional fields for proper navigation
  pair_address?: string;
  fully_diluted_value?: number;
  uri?: string;
  launchpad_protocol?: string;
  chain?: string;
  resolvedImageUrl?: string;
  // Mayhem Mode — persisted so the recent-searches list can render the same
  // red border + protocol icon + countdown badge as fresh search results.
  is_mayhem_mode?: boolean;
  launch_time?: string;
  created_at?: string;
};

/**
 * Get the storage key for search history.
 * If userId is provided, returns a user-scoped key for per-user history.
 * Otherwise returns the generic key for anonymous users.
 */
function getStorageKey(userId?: string): string {
  return userId ? `${SEARCH_HISTORY_KEY}_${userId}` : SEARCH_HISTORY_KEY;
}

/**
 * Get search history from localStorage.
 * @param userId - Optional user ID for per-user history
 */
export function getHistory(userId?: string): SearchHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const key = getStorageKey(userId);
    const raw = localStorage.getItem(key);
    return JSON.parse(raw || "[]");
  } catch (e) {
    console.error("❌ getHistory error:", e);
    return [];
  }
}

/**
 * Add a token to search history.
 * @param item - The token to add
 * @param userId - Optional user ID for per-user history
 * @param maxEntries - Maximum number of entries to keep (default: 10)
 */
export function addToHistory(
  item: SearchHistoryItem,
  userId?: string,
  maxEntries = 10,
) {
  if (typeof window === "undefined") return;
  const key = getStorageKey(userId);
  const current = getHistory(userId).filter((t) => t.mint !== item.mint);
  const updated = [item, ...current].slice(0, maxEntries);
  localStorage.setItem(key, JSON.stringify(updated));
}

/**
 * Remove a single item from search history.
 * @param mint - The mint address of the token to remove
 * @param userId - Optional user ID for per-user history
 */
export function removeFromHistory(mint: string, userId?: string) {
  if (typeof window === "undefined") return;
  const key = getStorageKey(userId);
  const current = getHistory(userId).filter((t) => t.mint !== mint);
  localStorage.setItem(key, JSON.stringify(current));
}

/**
 * Clear search history.
 * @param userId - Optional user ID for per-user history
 */
export function clearHistory(userId?: string) {
  if (typeof window === "undefined") return;
  const key = getStorageKey(userId);
  localStorage.removeItem(key);
}
