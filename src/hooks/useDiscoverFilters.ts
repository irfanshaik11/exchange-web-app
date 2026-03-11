import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { type PulseFilters, defaultPulseFilters } from '~/contexts/PulseFiltersContext';
import {
  countActiveFilters,
  hasActiveFilters as hasActiveDiscoverFilters,
} from '~/utils/discoverFilterUtils';

/** Load filters from localStorage, falling back to defaults on error. */
function loadFilters(key: string): PulseFilters {
  if (typeof window === 'undefined') return defaultPulseFilters;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PulseFilters>;
      return { ...defaultPulseFilters, ...parsed };
    }
  } catch {
    // Ignore corrupt data
  }
  return defaultPulseFilters;
}

/** Persist filters to localStorage. */
function saveFilters(key: string, filters: PulseFilters) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(filters));
  } catch {
    // Ignore quota errors
  }
}

const LS_KEY_TRENDING = 'discover_filters_trending';
const LS_KEY_NEW_PAIRS = 'discover_filters_newPairs';

/**
 * Custom hook managing **two independent filter states** — one for trending,
 * one for newPairs. Returns the appropriate pair based on `activeTab`.
 *
 * Each tab has a two-tier state:
 *   - `pendingFilters` — edits in the modal (not yet applied)
 *   - `filters`        — applied on "Apply All", used for actual filtering
 */
export function useDiscoverFilters(activeTab: string) {
  // ── Trending filters ──
  const [trendingFilters, setTrendingFilters] = useState<PulseFilters>(() =>
    loadFilters(LS_KEY_TRENDING),
  );
  const [trendingPending, setTrendingPending] = useState<PulseFilters>(() =>
    loadFilters(LS_KEY_TRENDING),
  );

  // ── New Pairs filters ──
  const [newPairsFilters, setNewPairsFilters] = useState<PulseFilters>(() =>
    loadFilters(LS_KEY_NEW_PAIRS),
  );
  const [newPairsPending, setNewPairsPending] = useState<PulseFilters>(() =>
    loadFilters(LS_KEY_NEW_PAIRS),
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

  // ── Select active pair by tab ──
  const isTrending = activeTab === 'trending';
  const filters = isTrending ? trendingFilters : newPairsFilters;
  const pendingFilters = isTrending ? trendingPending : newPairsPending;
  const setFilters = isTrending ? setTrendingFilters : setNewPairsFilters;
  const setPending = isTrending ? setTrendingPending : setNewPairsPending;
  const lsKey = isTrending ? LS_KEY_TRENDING : LS_KEY_NEW_PAIRS;

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
    setFilters(pendingFilters);
    saveFilters(lsKey, pendingFilters);
    setShowFilterModal(false);
  }, [pendingFilters, setFilters, lsKey]);

  const handleResetFilters = useCallback(() => {
    setPending(defaultPulseFilters);
    setFilters(defaultPulseFilters);
    saveFilters(lsKey, defaultPulseFilters);
  }, [setPending, setFilters, lsKey]);

  // ── Derived ──
  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);
  const hasActive = useMemo(() => hasActiveDiscoverFilters(filters), [filters]);

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
  };
}
