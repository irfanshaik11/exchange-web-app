import React, { createContext, useContext, useState, useEffect } from 'react';
import { AmmList } from '~/utils/amms';

export interface FilterState {
  protocols: string[]; // e.g. ['Raydium', 'Pump', 'Moonit']
  amms: string[]; // List of active AMM IDs
  searchKeywords: string;
  excludeKeywords: string;
  dexPaid: boolean;
  topHoldersMin: number | '';
  topHoldersMax: number | '';
  liquidityMin: number | '';
  liquidityMax: number | '';
  volumeMin: number | '';
  volumeMax: number | '';
  marketCapMin: number | '';
  marketCapMax: number | '';
  txnsMin: number | '';
  txnsMax: number | '';
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
  protocols: ['Raydium', 'Pump', 'Moonit'],
  amms: AmmList.map(amm => amm.id),
  searchKeywords: '',
  excludeKeywords: '',
  dexPaid: false,
  topHoldersMin: '',
  topHoldersMax: '',
  liquidityMin: '',
  liquidityMax: '',
  volumeMin: '',
  volumeMax: '',
  marketCapMin: '',
  marketCapMax: '',
  txnsMin: '',
  txnsMax: '',
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

  const setFilter = (f: FilterState) => {
    setFilterState(f);
    setPendingFilterState(f);
  };

  const setPendingFilter = (f: FilterState) => {
    setPendingFilterState(f);
  };

  const applyFilters = () => {
    setFilterState(pendingFilter);
  };

  const resetFilter = () => {
    setFilterState(defaultFilter);
    setPendingFilterState(defaultFilter);
  };

  const hasPendingChanges = JSON.stringify(filter) !== JSON.stringify(pendingFilter);

  return (
    <FilterContext.Provider value={{ 
      filter, 
      pendingFilter, 
      setFilter, 
      setPendingFilter, 
      applyFilters, 
      resetFilter, 
      hasPendingChanges 
    }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilter() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilter must be used within a FilterProvider');
  return ctx;
} 