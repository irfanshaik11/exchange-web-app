import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  type PulseFilters,
  defaultPulseFilters,
  defaultGainersFilters,
} from "~/contexts/PulseFiltersContext";
import {
  countActiveFiltersAgainst,
  hasActiveFiltersAgainst,
} from "~/utils/discoverFilterUtils";

/** Load filters from localStorage, falling back to the supplied defaults on error. */
function loadFilters(key: string, defaults: PulseFilters): PulseFilters {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PulseFilters>;
      return { ...defaults, ...parsed };
    }
  } catch {
    // Ignore corrupt data
  }
  return defaults;
}

/** Persist filters to localStorage. */
function saveFilters(key: string, filters: PulseFilters) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(filters));
  } catch {
    // Ignore quota errors
  }
}

const LS_KEY_TRENDING = "discover_filters_trending";
const LS_KEY_NEW_PAIRS = "discover_filters_newPairs";
const LS_KEY_TOP = "discover_filters_top";
const LS_KEY_GAINERS = "discover_filters_gainers";

type Bucket = "trending" | "newPairs" | "top" | "gainers";

function bucketFor(activeTab: string): Bucket {
  if (activeTab === "trending") return "trending";
  if (activeTab === "top") return "top";
  if (activeTab === "gainers") return "gainers";
  return "newPairs";
}

/**
 * Custom hook managing **independent filter states per discover tab**.
 *
 * Each tab has a two-tier state:
 *   - `pendingFilters` — edits in the modal (not yet applied)
 *   - `filters`        — applied on "Apply All", used for actual filtering
 *
 * Buckets:
 *   - trending  — defaultPulseFilters (mayhem-only, no liq/holder gates)
 *   - top       — defaultPulseFilters (24h volume sort handles quality)
 *   - gainers   — defaultGainersFilters (mayhem + min liq + min holders + top-10 cap)
 *   - newPairs  — defaultPulseFilters (also covers any non-trending/top/gainers tab)
 */
export function useDiscoverFilters(activeTab: string) {
  // ── Trending bucket ──
  const [trendingFilters, setTrendingFilters] = useState<PulseFilters>(() =>
    loadFilters(LS_KEY_TRENDING, defaultPulseFilters),
  );
  const [trendingPending, setTrendingPending] = useState<PulseFilters>(() =>
    loadFilters(LS_KEY_TRENDING, defaultPulseFilters),
  );

  // ── New Pairs bucket ──
  const [newPairsFilters, setNewPairsFilters] = useState<PulseFilters>(() =>
    loadFilters(LS_KEY_NEW_PAIRS, defaultPulseFilters),
  );
  const [newPairsPending, setNewPairsPending] = useState<PulseFilters>(() =>
    loadFilters(LS_KEY_NEW_PAIRS, defaultPulseFilters),
  );

  // ── Top bucket ──
  const [topFilters, setTopFilters] = useState<PulseFilters>(() =>
    loadFilters(LS_KEY_TOP, defaultPulseFilters),
  );
  const [topPending, setTopPending] = useState<PulseFilters>(() =>
    loadFilters(LS_KEY_TOP, defaultPulseFilters),
  );

  // ── Gainers bucket — strict defaults to keep rug pumps off the leaderboard ──
  const [gainersFilters, setGainersFilters] = useState<PulseFilters>(() =>
    loadFilters(LS_KEY_GAINERS, defaultGainersFilters),
  );
  const [gainersPending, setGainersPending] = useState<PulseFilters>(() =>
    loadFilters(LS_KEY_GAINERS, defaultGainersFilters),
  );

  // ── Modal visibility ──
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Close modal when tab switches
  const prevTab = useRef(activeTab);
  useEffect(() => {
    if (prevTab.current !== activeTab) {
      setShowFilterModal(false);
      prevTab.current = activeTab;
    }
  }, [activeTab]);

  // ── Route to the active bucket ──
  const bucket = bucketFor(activeTab);

  let filters: PulseFilters;
  let pendingFilters: PulseFilters;
  let setFilters: React.Dispatch<React.SetStateAction<PulseFilters>>;
  let setPending: React.Dispatch<React.SetStateAction<PulseFilters>>;
  let lsKey: string;
  let bucketDefaults: PulseFilters;

  if (bucket === "trending") {
    filters = trendingFilters;
    pendingFilters = trendingPending;
    setFilters = setTrendingFilters;
    setPending = setTrendingPending;
    lsKey = LS_KEY_TRENDING;
    bucketDefaults = defaultPulseFilters;
  } else if (bucket === "top") {
    filters = topFilters;
    pendingFilters = topPending;
    setFilters = setTopFilters;
    setPending = setTopPending;
    lsKey = LS_KEY_TOP;
    bucketDefaults = defaultPulseFilters;
  } else if (bucket === "gainers") {
    filters = gainersFilters;
    pendingFilters = gainersPending;
    setFilters = setGainersFilters;
    setPending = setGainersPending;
    lsKey = LS_KEY_GAINERS;
    bucketDefaults = defaultGainersFilters;
  } else {
    filters = newPairsFilters;
    pendingFilters = newPairsPending;
    setFilters = setNewPairsFilters;
    setPending = setNewPairsPending;
    lsKey = LS_KEY_NEW_PAIRS;
    bucketDefaults = defaultPulseFilters;
  }

  // Keep a ref to the latest pending filters so handleApplyFilters never
  // captures a stale closure value (React 18 batching race).
  const pendingRef = useRef(pendingFilters);
  pendingRef.current = pendingFilters;

  // ── Pending changes detection ──
  const hasPendingChanges = useMemo(
    () => JSON.stringify(pendingFilters) !== JSON.stringify(filters),
    [pendingFilters, filters],
  );

  // ── Handlers ──
  const handlePendingFilterChange = useCallback(
    (updater: (prev: PulseFilters) => PulseFilters) => {
      setPending(updater);
    },
    [setPending],
  );

  const handleApplyFilters = useCallback(() => {
    const current = pendingRef.current;
    setFilters(current);
    saveFilters(lsKey, current);
    setShowFilterModal(false);
  }, [setFilters, lsKey]);

  // Reset returns the bucket to its tab-specific defaults — Gainers resets
  // to the strict gates, not to a fully empty filter state.
  const handleResetFilters = useCallback(() => {
    setPending(bucketDefaults);
    setFilters(bucketDefaults);
    saveFilters(lsKey, bucketDefaults);
  }, [setPending, setFilters, lsKey, bucketDefaults]);

  const openFilterModal = useCallback(() => {
    setPending(filters);
    setShowFilterModal(true);
  }, [filters, setPending]);

  // ── Derived ──
  // Compare against the bucket's baseline, not against fully-empty defaults.
  // Otherwise the Gainers tab's strict default filters (min liq $10k, etc.)
  // would always register as "active" even when the user hasn't touched
  // anything, lighting up the filter badge spuriously on first load.
  const activeFilterCount = useMemo(
    () => countActiveFiltersAgainst(filters, bucketDefaults),
    [filters, bucketDefaults],
  );
  const hasActive = useMemo(
    () => hasActiveFiltersAgainst(filters, bucketDefaults),
    [filters, bucketDefaults],
  );

  return {
    filters,
    pendingFilters,
    hasPendingChanges,
    hasActiveFilters: hasActive,
    activeFilterCount,
    handlePendingFilterChange,
    handleApplyFilters,
    handleResetFilters,
    showFilterModal,
    setShowFilterModal,
    openFilterModal,
  };
}
