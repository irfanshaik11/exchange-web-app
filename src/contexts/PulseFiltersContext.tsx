import React, { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { hasActiveFilters as checkActiveFilters } from '~/utils/discoverFilterUtils';

// Filter state interface matching PulseTable's filter structure
export interface PulseFilters {
  // Protocols
  protocols: string[];
  // Quote Tokens
  quoteTokens: string[];
  // Keywords
  searchKeywords: string;
  excludeKeywords: string;
  // Audit
  dexPaid: boolean;
  caEndsInPump: boolean;
  minAge: string;
  maxAge: string;
  ageUnit: string;
  top10HoldersPercent: string; // legacy: acts as max threshold
  top10HoldersPercentMin: string;
  top10HoldersPercentMax: string;
  // New Audit Fields
  devHoldingPercentMin: string;
  devHoldingPercentMax: string;
  snipersPercentMin: string;
  snipersPercentMax: string;
  insidersPercentMin: string;
  insidersPercentMax: string;
  bundlePercentMin: string;
  bundlePercentMax: string;
  holdersMin: string;
  holdersMax: string;
  proTradersMin: string;
  proTradersMax: string;
  devMigrationsMin: string;
  devMigrationsMax: string;
  devPairsCreatedMin: string;
  devPairsCreatedMax: string;
  kolCountMin: string;
  kolCountMax: string;
  // Metrics
  minMarketCap: string;
  maxMarketCap: string;
  minVolume: string;
  maxVolume: string;
  minLiquidity: string;
  maxLiquidity: string;
  bCurvePercentMin: string;
  bCurvePercentMax: string;
  globalFeesPaidMin: string;
  globalFeesPaidMax: string;
  txnsMin: string;
  txnsMax: string;
  numBuysMin: string;
  numBuysMax: string;
  numSellsMin: string;
  numSellsMax: string;
  // Socials
  twitterReusesMin: string;
  twitterReusesMax: string;
  tweetAgeMin: string;
  tweetAgeMax: string;
  tweetAgeUnit: string;
  hasTwitter: boolean;
  hasWebsite: boolean;
  hasTelegram: boolean;
  atLeastOneSocial: boolean;
  onlyPumpLive: boolean;
  // Sort
  sortBy: string;
  sortOrder: string;
}

// Default filter values
export const defaultPulseFilters: PulseFilters = {
  protocols: ["All"],
  quoteTokens: [],
  searchKeywords: "",
  excludeKeywords: "",
  dexPaid: false,
  caEndsInPump: false,
  minAge: "",
  maxAge: "",
  ageUnit: "m",
  top10HoldersPercent: "",
  top10HoldersPercentMin: "",
  top10HoldersPercentMax: "",
  devHoldingPercentMin: "",
  devHoldingPercentMax: "",
  snipersPercentMin: "",
  snipersPercentMax: "",
  insidersPercentMin: "",
  insidersPercentMax: "",
  bundlePercentMin: "",
  bundlePercentMax: "",
  holdersMin: "",
  holdersMax: "",
  proTradersMin: "",
  proTradersMax: "",
  devMigrationsMin: "",
  devMigrationsMax: "",
  devPairsCreatedMin: "",
  devPairsCreatedMax: "",
  kolCountMin: "",
  kolCountMax: "",
  minMarketCap: "",
  maxMarketCap: "",
  minVolume: "",
  maxVolume: "",
  minLiquidity: "",
  maxLiquidity: "",
  bCurvePercentMin: "",
  bCurvePercentMax: "",
  globalFeesPaidMin: "",
  globalFeesPaidMax: "",
  txnsMin: "",
  txnsMax: "",
  numBuysMin: "",
  numBuysMax: "",
  numSellsMin: "",
  numSellsMax: "",
  twitterReusesMin: "",
  twitterReusesMax: "",
  tweetAgeMin: "",
  tweetAgeMax: "",
  tweetAgeUnit: "m",
  hasTwitter: false,
  hasWebsite: false,
  hasTelegram: false,
  atLeastOneSocial: false,
  onlyPumpLive: false,
  sortBy: "timestamp",
  sortOrder: "desc",
};

interface PulseFiltersContextValue {
  filters: PulseFilters;
  setFilters: React.Dispatch<React.SetStateAction<PulseFilters>>;
  resetFilters: () => void;
  hasActiveFilters: boolean;
}

const PulseFiltersContext = createContext<PulseFiltersContextValue | null>(null);

interface PulseFiltersProviderProps {
  children: ReactNode;
}

export function PulseFiltersProvider({ children }: PulseFiltersProviderProps) {
  const [filters, setFilters] = useState<PulseFilters>(defaultPulseFilters);

  const resetFilters = useCallback(() => {
    setFilters(defaultPulseFilters);
  }, []);

  // Check if any non-default filters are active — single source of truth from discoverFilterUtils
  const hasActiveFilters = useMemo(() => checkActiveFilters(filters), [filters]);

  const value = useMemo(() => ({ filters, setFilters, resetFilters, hasActiveFilters }), [filters, setFilters, resetFilters, hasActiveFilters]);

  return (
    <PulseFiltersContext.Provider value={value}>
      {children}
    </PulseFiltersContext.Provider>
  );
}

export function usePulseFilters() {
  const context = useContext(PulseFiltersContext);
  if (!context) {
    throw new Error('usePulseFilters must be used within a PulseFiltersProvider');
  }
  return context;
}

// Helper to check if context is available (for optional usage)
export function usePulseFiltersOptional() {
  return useContext(PulseFiltersContext);
}
