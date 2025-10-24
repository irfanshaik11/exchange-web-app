/**
 * Critical Fix #11: Stale Pool Data Detection - Warning Component
 *
 * Displays warning when pool data is stale and provides refresh button
 * Simple, non-intrusive implementation that doesn't break existing code
 */

"use client";

import React, { useState, useEffect } from "react";
import { getPoolDataAge, formatTimeAgo, getPoolFreshnessColor, getPoolFreshnessIcon, POOL_DATA_WARNING_THRESHOLD } from "~/utils/poolFreshness";

interface PoolFreshnessWarningProps {
  /** Timestamp when pool data was fetched (Unix ms) */
  fetchedAt?: number;
  /** Optional callback when user clicks refresh */
  onRefresh?: () => void | Promise<void>;
  /** Show as inline badge (default) or banner */
  variant?: "badge" | "banner";
  /** Custom className */
  className?: string;
}

/**
 * Pool Freshness Warning Component
 *
 * Shows visual indicator of pool data freshness:
 * - Green: Fresh (< 3 minutes)
 * - Yellow: Warning (3-5 minutes)
 * - Red: Stale (> 5 minutes) - with refresh button
 *
 * @example
 * // In trade page
 * const [poolFetchedAt] = useState(Date.now());
 *
 * <PoolFreshnessWarning
 *   fetchedAt={poolFetchedAt}
 *   onRefresh={async () => await refetchPoolData()}
 * />
 */
export default function PoolFreshnessWarning({
  fetchedAt,
  onRefresh,
  variant = "badge",
  className = "",
}: PoolFreshnessWarningProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Update current time every 10 seconds to keep age display fresh
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 10000); // 10 seconds

    return () => clearInterval(interval);
  }, []);

  // If no timestamp provided, don't show anything
  if (!fetchedAt) {
    return null;
  }

  const age = getPoolDataAge(fetchedAt);

  // Don't show if data is very fresh (< 3 minutes)
  if (age.ageMs < POOL_DATA_WARNING_THRESHOLD) {
    return null;
  }

  const colorClass = getPoolFreshnessColor(fetchedAt);
  const icon = getPoolFreshnessIcon(fetchedAt);

  const handleRefresh = async () => {
    if (!onRefresh || isRefreshing) return;

    setIsRefreshing(true);
    try {
      await onRefresh();
    } catch (error) {
      console.error("Refresh failed:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (variant === "banner") {
    return (
      <div className={`rounded-lg border p-3 ${colorClass} ${className}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{icon}</span>
            <div className="flex-1">
              <div className="font-medium text-sm">
                {age.isStale ? "Pool data is stale" : "Pool data may be outdated"}
              </div>
              <div className="text-xs opacity-80">
                Last updated {formatTimeAgo(fetchedAt)}
                {age.isStale && " - Please refresh for current prices"}
              </div>
            </div>
          </div>

          {onRefresh && (
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 transition-colors text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRefreshing ? "Refreshing..." : "Refresh Now"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Badge variant (compact)
  return (
    <div className={`inline-flex items-center gap-2 rounded border px-2 py-1 text-xs ${colorClass} ${className}`}>
      <span>{icon}</span>
      <span>
        {age.isStale ? "Stale" : "Warning"}: {formatTimeAgo(fetchedAt)}
      </span>
      {onRefresh && age.isStale && (
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="ml-1 underline hover:no-underline disabled:opacity-50"
        >
          {isRefreshing ? "..." : "Refresh"}
        </button>
      )}
    </div>
  );
}

/**
 * Hook to track pool data freshness with auto-updating state
 *
 * @param fetchedAt - When pool data was fetched
 * @returns Current freshness information that updates every 10s
 *
 * @example
 * const freshness = usePoolFreshness(poolFetchedAt);
 * if (freshness.isStale) {
 *   // Show warning
 * }
 */
export function usePoolFreshness(fetchedAt?: number) {
  const [freshness, setFreshness] = useState(() =>
    fetchedAt ? getPoolDataAge(fetchedAt) : null
  );

  useEffect(() => {
    if (!fetchedAt) return;

    // Update immediately
    setFreshness(getPoolDataAge(fetchedAt));

    // Then update every 10 seconds
    const interval = setInterval(() => {
      setFreshness(getPoolDataAge(fetchedAt));
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchedAt]);

  return freshness;
}
