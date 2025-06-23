import React, { createContext, useContext, useState, useEffect } from 'react';

export interface FilterState {
  protocols: string[]; // e.g. ['Raydium', 'Pump', 'Moonit']
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
  setFilter: (f: FilterState) => void;
  resetFilter: () => void;
}

const defaultFilter: FilterState = {
  protocols: ['Raydium', 'Pump', 'Moonit'],
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

  // On mount, update filter from localStorage if available (client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('filters');
      if (saved) {
        try {
          setFilterState({ ...defaultFilter, ...JSON.parse(saved) });
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

  const setFilter = (f: FilterState) => setFilterState(f);
  const resetFilter = () => setFilterState(defaultFilter);

  return (
    <FilterContext.Provider value={{ filter, setFilter, resetFilter }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilter() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilter must be used within a FilterProvider');
  return ctx;
} 