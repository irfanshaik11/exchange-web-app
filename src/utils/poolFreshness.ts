/**
 * Critical Fix #11: Stale Pool Data Detection
 *
 * Utilities for detecting and handling stale pool data
 * Prevents transaction failures due to outdated cached pool information
 */

// ========================================
// CONFIGURATION CONSTANTS
// ========================================

/** Pool data is considered stale after 5 minutes */
export const POOL_DATA_TTL = 5 * 60 * 1000;

/** Show warning when pool data is older than 3 minutes */
export const POOL_DATA_WARNING_THRESHOLD = 3 * 60 * 1000;

/** Auto-refresh interval for active pools (2 minutes) */
export const AUTO_REFRESH_INTERVAL = 2 * 60 * 1000;

/** Maximum time to wait for refresh before timing out (20 seconds) */
export const REFRESH_TIMEOUT = 20000;

// ========================================
// TYPE DEFINITIONS
// ========================================

export interface PoolDataAge {
  /** Age in milliseconds */
  ageMs: number;
  /** Age in seconds */
  ageSeconds: number;
  /** Age in minutes */
  ageMinutes: number;
  /** True if data is stale (> TTL) */
  isStale: boolean;
  /** True if should show warning (> WARNING_THRESHOLD) */
  shouldWarn: boolean;
  /** True if data is fresh (< WARNING_THRESHOLD) */
  isFresh: boolean;
}

export interface PoolWithTimestamp {
  /** Original pool data */
  data: any;
  /** When the pool data was fetched (Unix timestamp in ms) */
  fetchedAt: number;
  /** When the pool data was last refreshed (Unix timestamp in ms) */
  lastRefreshed: number;
}

// ========================================
// CORE FUNCTIONS
// ========================================

/**
 * Check if pool data is stale (older than TTL)
 *
 * @param fetchedAt - Unix timestamp (ms) when data was fetched
 * @returns true if data is stale
 *
 * @example
 * const isStale = isPoolDataStale(poolData.fetchedAt);
 * if (isStale) {
 *   // Refresh pool data
 * }
 */
export function isPoolDataStale(fetchedAt: number): boolean {
  const age = Date.now() - fetchedAt;
  return age > POOL_DATA_TTL;
}

/**
 * Check if pool data should show warning (older than WARNING_THRESHOLD but not yet stale)
 *
 * @param fetchedAt - Unix timestamp (ms) when data was fetched
 * @returns true if should show warning
 *
 * @example
 * const shouldWarn = shouldWarnStaleData(poolData.fetchedAt);
 * if (shouldWarn) {
 *   // Show yellow warning badge
 * }
 */
export function shouldWarnStaleData(fetchedAt: number): boolean {
  const age = Date.now() - fetchedAt;
  return age > POOL_DATA_WARNING_THRESHOLD && age <= POOL_DATA_TTL;
}

/**
 * Get detailed information about pool data age
 *
 * @param fetchedAt - Unix timestamp (ms) when data was fetched
 * @returns Detailed age information
 *
 * @example
 * const { ageMinutes, isStale, shouldWarn } = getPoolDataAge(poolData.fetchedAt);
 * console.log(`Pool data is ${ageMinutes} minutes old`);
 */
export function getPoolDataAge(fetchedAt: number): PoolDataAge {
  const ageMs = Date.now() - fetchedAt;
  const ageSeconds = Math.floor(ageMs / 1000);
  const ageMinutes = Math.floor(ageMs / 60000);

  return {
    ageMs,
    ageSeconds,
    ageMinutes,
    isStale: ageMs > POOL_DATA_TTL,
    shouldWarn: ageMs > POOL_DATA_WARNING_THRESHOLD && ageMs <= POOL_DATA_TTL,
    isFresh: ageMs <= POOL_DATA_WARNING_THRESHOLD,
  };
}

/**
 * Format timestamp as "X minutes ago" or "X seconds ago"
 *
 * @param timestamp - Unix timestamp (ms)
 * @returns Human-readable time ago string
 *
 * @example
 * formatTimeAgo(Date.now() - 120000) // "2 minutes ago"
 * formatTimeAgo(Date.now() - 30000)  // "30 seconds ago"
 */
export function formatTimeAgo(timestamp: number): string {
  const { ageSeconds, ageMinutes } = getPoolDataAge(timestamp);

  if (ageMinutes >= 1) {
    return `${ageMinutes} minute${ageMinutes === 1 ? '' : 's'} ago`;
  }

  if (ageSeconds < 10) {
    return 'just now';
  }

  return `${ageSeconds} seconds ago`;
}

/**
 * Create pool data with timestamp
 *
 * @param poolData - Raw pool data
 * @returns Pool data with timestamp metadata
 *
 * @example
 * const poolWithTimestamp = createPoolWithTimestamp(rawPoolData);
 * setPoolData(poolWithTimestamp);
 */
export function createPoolWithTimestamp(poolData: any): PoolWithTimestamp {
  const now = Date.now();
  return {
    data: poolData,
    fetchedAt: now,
    lastRefreshed: now,
  };
}

/**
 * Update pool data timestamps after refresh
 *
 * @param existingPool - Existing pool with timestamp
 * @param newPoolData - Newly fetched pool data
 * @returns Updated pool with new data and refreshed timestamp
 *
 * @example
 * const refreshedPool = updatePoolTimestamp(currentPool, freshData);
 * setPoolData(refreshedPool);
 */
export function updatePoolTimestamp(
  existingPool: PoolWithTimestamp,
  newPoolData: any
): PoolWithTimestamp {
  const now = Date.now();
  return {
    data: newPoolData,
    fetchedAt: existingPool.fetchedAt,  // Keep original fetch time
    lastRefreshed: now,                  // Update refresh time
  };
}

/**
 * Check if page was backgrounded for too long (should refresh on focus)
 *
 * @param fetchedAt - Unix timestamp (ms) when data was fetched
 * @param threshold - Time threshold in ms (default: POOL_DATA_TTL)
 * @returns true if page should refresh on focus
 *
 * @example
 * useEffect(() => {
 *   const handleFocus = () => {
 *     if (shouldRefreshOnFocus(poolData.fetchedAt)) {
 *       refreshPoolData();
 *     }
 *   };
 *   window.addEventListener('focus', handleFocus);
 *   return () => window.removeEventListener('focus', handleFocus);
 * }, [poolData]);
 */
export function shouldRefreshOnFocus(
  fetchedAt: number,
  threshold: number = POOL_DATA_TTL
): boolean {
  const age = Date.now() - fetchedAt;
  return age > threshold;
}

/**
 * Get color class for pool freshness badge
 *
 * @param fetchedAt - Unix timestamp (ms) when data was fetched
 * @returns Tailwind color classes
 *
 * @example
 * const colorClass = getPoolFreshnessColor(poolData.fetchedAt);
 * <div className={colorClass}>Fresh data</div>
 */
export function getPoolFreshnessColor(fetchedAt: number): string {
  const { isStale, shouldWarn } = getPoolDataAge(fetchedAt);

  if (isStale) {
    return 'bg-red-500/20 border-red-500 text-red-400';
  }

  if (shouldWarn) {
    return 'bg-yellow-500/20 border-yellow-500 text-yellow-400';
  }

  return 'bg-green-500/20 border-green-500 text-green-400';
}

/**
 * Get icon emoji for pool freshness
 *
 * @param fetchedAt - Unix timestamp (ms) when data was fetched
 * @returns Emoji string
 *
 * @example
 * const icon = getPoolFreshnessIcon(poolData.fetchedAt);
 * console.log(icon); // "✓" or "⏰" or "⚠️"
 */
export function getPoolFreshnessIcon(fetchedAt: number): string {
  const { isStale, shouldWarn } = getPoolDataAge(fetchedAt);

  if (isStale) {
    return '⚠️';
  }

  if (shouldWarn) {
    return '⏰';
  }

  return '✓';
}

/**
 * Calculate when next auto-refresh should occur
 *
 * @param lastRefreshed - Unix timestamp (ms) of last refresh
 * @param interval - Refresh interval in ms (default: AUTO_REFRESH_INTERVAL)
 * @returns Unix timestamp (ms) when next refresh should occur
 *
 * @example
 * const nextRefresh = getNextRefreshTime(poolData.lastRefreshed);
 * const msUntilRefresh = nextRefresh - Date.now();
 */
export function getNextRefreshTime(
  lastRefreshed: number,
  interval: number = AUTO_REFRESH_INTERVAL
): number {
  return lastRefreshed + interval;
}

/**
 * Check if it's time for auto-refresh
 *
 * @param lastRefreshed - Unix timestamp (ms) of last refresh
 * @param interval - Refresh interval in ms (default: AUTO_REFRESH_INTERVAL)
 * @returns true if should auto-refresh now
 *
 * @example
 * if (shouldAutoRefresh(poolData.lastRefreshed)) {
 *   await refreshPoolData();
 * }
 */
export function shouldAutoRefresh(
  lastRefreshed: number,
  interval: number = AUTO_REFRESH_INTERVAL
): boolean {
  const nextRefresh = getNextRefreshTime(lastRefreshed, interval);
  return Date.now() >= nextRefresh;
}
