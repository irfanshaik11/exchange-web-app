import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { AmmList } from '~/utils/amms';

export interface FilterState {
  protocols: string[]; // e.g. ['Raydium', 'Pump', 'Moonit']
  amms: string[]; // List of active AMM IDs
  searchKeywords: string;
  excludeKeywords: string;
  dexPaid: boolean;
  // Audit section
  holdersMin: number | '';
  holdersMax: number | '';
  proTradersMin: number | '';
  proTradersMax: number | '';
  devMigrationsMin: number | '';
  devMigrationsMax: number | '';
  devPairsCreatedMin: number | '';
  devPairsCreatedMax: number | '';
  ageMin: number | '';
  ageUnit: string;
  // Metrics section
  liquidityMin: number | '';
  liquidityMax: number | '';
  volumeMin: number | '';
  volumeMax: number | '';
  marketCapMin: number | '';
  marketCapMax: number | '';
  bCurvePercentMin: number | '';
  bCurvePercentMax: number | '';
  globalFeesPaidMin: number | '';
  globalFeesPaidMax: number | '';
  txnsMin: number | '';
  txnsMax: number | '';
  numBuysMin: number | '';
  numBuysMax: number | '';
  numSellsMin: number | '';
  numSellsMax: number | '';
}

interface FilterContextType {
  filter: FilterState;
  pendingFilter: FilterState;
  setFilter: (f: FilterState) => void;
  setPendingFilter: (f: FilterState) => void;
  applyFilters: () => void;
  resetFilter: () => void;
  hasPendingChanges: boolean;
}

const defaultFilter: FilterState = {
  protocols: [],
  amms: [],
  searchKeywords: '',
  excludeKeywords: '',
  dexPaid: false,
  // Audit section
  holdersMin: '',
  holdersMax: '',
  proTradersMin: '',
  proTradersMax: '',
  devMigrationsMin: '',
  devMigrationsMax: '',
  devPairsCreatedMin: '',
  devPairsCreatedMax: '',
  ageMin: '',
  ageUnit: 'm',
  // Metrics section
  liquidityMin: '',
  liquidityMax: '',
  volumeMin: '',
  volumeMax: '',
  marketCapMin: '',
  marketCapMax: '',
  bCurvePercentMin: '',
  bCurvePercentMax: '',
  globalFeesPaidMin: '',
  globalFeesPaidMax: '',
  txnsMin: '',
  txnsMax: '',
  numBuysMin: '',
  numBuysMax: '',
  numSellsMin: '',
  numSellsMax: '',
};

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [filter, setFilterState] = useState<FilterState>(defaultFilter);
  const [pendingFilter, setPendingFilterState] = useState<FilterState>(defaultFilter);

  // On mount, update filter from localStorage if available (client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('filters');
      if (saved) {
        try {
          const savedFilters = JSON.parse(saved);
          // Ensure 'amms' exists, if not, set to default
          if (!savedFilters.amms) {
            savedFilters.amms = defaultFilter.amms;
          }
          const loadedFilters = { ...defaultFilter, ...savedFilters };
          setFilterState(loadedFilters);
          setPendingFilterState(loadedFilters);
        } catch {
          // Optionally log error
        }
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('filters', JSON.stringify(filter));
    }
  }, [filter]);

  const setFilter = useCallback((f: FilterState) => {
    setFilterState(f);
    setPendingFilterState(f);
  }, []);

  const setPendingFilter = useCallback((f: FilterState) => {
    setPendingFilterState(f);
  }, []);

  const applyFilters = useCallback(() => {
    setFilterState(pendingFilter);
  }, [pendingFilter]);

  const resetFilter = useCallback(() => {
    setFilterState(defaultFilter);
    setPendingFilterState(defaultFilter);
  }, []);

  const hasPendingChanges = useMemo(
    () => JSON.stringify(filter) !== JSON.stringify(pendingFilter),
    [filter, pendingFilter]
  );

  const value = useMemo(() => ({
    filter,
    pendingFilter,
    setFilter,
    setPendingFilter,
    applyFilters,
    resetFilter,
    hasPendingChanges,
  }), [filter, pendingFilter, setFilter, setPendingFilter, applyFilters, resetFilter, hasPendingChanges]);

  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilter() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilter must be used within a FilterProvider');
  return ctx;
} 