import React, { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';

export type BnbColumnKey = 'new' | 'finalStretch' | 'migrated';

export interface BnbFilters {
  // Search
  searchKeywords: string;
  excludeKeywords: string;
  searchXHandle: string;
  searchDevWallet: string;

  // Launchpads — empty array = all (no restriction)
  launchpads: string[];
  // Quote Tokens — empty array = all
  quoteTokens: string[];

  // Metric checkboxes
  devSellAll: boolean;
  devStillHolding: boolean;
  originalAvatar: boolean;
  originalSocials: boolean;
  devBurnt: boolean;
  excludeDevWashTrading: boolean;
  excludeInsidersWashTrading: boolean;

  // Token Audit (default ON per GMGN)
  excludeHoneypot: boolean;
  excludeUnverified: boolean;
  excludeNonRenounced: boolean;

  // Exclude Vamped
  excludeUxento: boolean;
  excludeRapidLaunch: boolean;

  // Numeric ranges
  bCurveMin: string;       bCurveMax: string;       // %
  ageMin: string;          ageMax: string;           // minutes
  liquidityMin: string;    liquidityMax: string;     // K USD
  mktCapMin: string;       mktCapMax: string;        // K USD
  volumeMin: string;       volumeMax: string;        // K USD
  netBuyMin: string;       netBuyMax: string;        // K USD
  txsMin: string;          txsMax: string;
  buysMin: string;         buysMax: string;
  sellsMin: string;        sellsMax: string;
  totalFeesMin: string;    totalFeesMax: string;     // BNB
  tokenTaxMin: string;     tokenTaxMax: string;      // %
  telegramCallsMin: string; telegramCallsMax: string;
  kolsMin: string;         kolsMax: string;
  smartMoneyMin: string;   smartMoneyMax: string;
  xFollowersMin: string;   xFollowersMax: string;
  devMigratedMin: string;  devMigratedMax: string;
  devLaunchedMin: string;  devLaunchedMax: string;
  devMigratedPctMin: string; devMigratedPctMax: string; // %
  totalHoldersMin: string; totalHoldersMax: string;
  botDegensMin: string;    botDegensMax: string;
  botTraderHoldMin: string; botTraderHoldMax: string; // %
  currentlyViewingMin: string; currentlyViewingMax: string;
  top10HoldingMin: string; top10HoldingMax: string;  // %
  devHoldingMin: string;   devHoldingMax: string;    // %
  insidersMin: string;     insidersMax: string;      // %
  bundlersMin: string;     bundlersMax: string;      // %
  phishingMin: string;     phishingMax: string;      // %
  freshMin: string;        freshMax: string;         // %
  snipersHoldMin: string;  snipersHoldMax: string;   // %
  rugPctMin: string;       rugPctMax: string;        // %
  xRenameMin: string;      xRenameMax: string;

  // Socials tab
  withAtLeastOneSocial: boolean;
  onlyTweet: boolean;
  dexAdPaid: boolean;
  dexBarPaid: boolean;
  dexBoost: boolean;
  updateSocial: boolean;
  cto: boolean;
  hasX: boolean;
  hasWebsite: boolean;
  hasTelegram: boolean;
  hasYoutube: boolean;
  hasTiktok: boolean;
  hasInstagram: boolean;
}

export const defaultBnbFilters: BnbFilters = {
  searchKeywords: '',
  excludeKeywords: '',
  searchXHandle: '',
  searchDevWallet: '',
  launchpads: [],
  quoteTokens: [],
  devSellAll: false,
  devStillHolding: false,
  originalAvatar: false,
  originalSocials: false,
  devBurnt: false,
  excludeDevWashTrading: false,
  excludeInsidersWashTrading: false,
  excludeHoneypot: true,
  excludeUnverified: true,
  excludeNonRenounced: true,
  excludeUxento: false,
  excludeRapidLaunch: false,
  bCurveMin: '',       bCurveMax: '',
  ageMin: '',          ageMax: '',
  liquidityMin: '',    liquidityMax: '',
  mktCapMin: '',       mktCapMax: '',
  volumeMin: '',       volumeMax: '',
  netBuyMin: '',       netBuyMax: '',
  txsMin: '',          txsMax: '',
  buysMin: '',         buysMax: '',
  sellsMin: '',        sellsMax: '',
  totalFeesMin: '',    totalFeesMax: '',
  tokenTaxMin: '',     tokenTaxMax: '',
  telegramCallsMin: '', telegramCallsMax: '',
  kolsMin: '',         kolsMax: '',
  smartMoneyMin: '',   smartMoneyMax: '',
  xFollowersMin: '',   xFollowersMax: '',
  devMigratedMin: '',  devMigratedMax: '',
  devLaunchedMin: '',  devLaunchedMax: '',
  devMigratedPctMin: '', devMigratedPctMax: '',
  totalHoldersMin: '', totalHoldersMax: '',
  botDegensMin: '',    botDegensMax: '',
  botTraderHoldMin: '', botTraderHoldMax: '',
  currentlyViewingMin: '', currentlyViewingMax: '',
  top10HoldingMin: '', top10HoldingMax: '',
  devHoldingMin: '',   devHoldingMax: '',
  insidersMin: '',     insidersMax: '',
  bundlersMin: '',     bundlersMax: '',
  phishingMin: '',     phishingMax: '',
  freshMin: '',        freshMax: '',
  snipersHoldMin: '',  snipersHoldMax: '',
  rugPctMin: '',       rugPctMax: '',
  xRenameMin: '',      xRenameMax: '',
  withAtLeastOneSocial: false,
  onlyTweet: false,
  dexAdPaid: false,
  dexBarPaid: false,
  dexBoost: false,
  updateSocial: false,
  cto: false,
  hasX: false,
  hasWebsite: false,
  hasTelegram: false,
  hasYoutube: false,
  hasTiktok: false,
  hasInstagram: false,
};

interface BnbFiltersState {
  new: BnbFilters;
  finalStretch: BnbFilters;
  migrated: BnbFilters;
}

const defaultState: BnbFiltersState = {
  new: { ...defaultBnbFilters },
  finalStretch: { ...defaultBnbFilters },
  migrated: { ...defaultBnbFilters },
};

interface BnbFiltersContextValue {
  filters: BnbFiltersState;
  setColumnFilters: (col: BnbColumnKey, f: BnbFilters) => void;
  resetColumnFilters: (col: BnbColumnKey) => void;
  resetAllFilters: () => void;
  hasActiveFilters: (col: BnbColumnKey) => boolean;
}

const BnbFiltersContext = createContext<BnbFiltersContextValue | null>(null);

const NUMERIC_KEYS: (keyof BnbFilters)[] = [
  'bCurveMin', 'bCurveMax', 'ageMin', 'ageMax', 'liquidityMin', 'liquidityMax',
  'mktCapMin', 'mktCapMax', 'volumeMin', 'volumeMax', 'netBuyMin', 'netBuyMax',
  'txsMin', 'txsMax', 'buysMin', 'buysMax', 'sellsMin', 'sellsMax',
  'totalFeesMin', 'totalFeesMax', 'tokenTaxMin', 'tokenTaxMax',
  'telegramCallsMin', 'telegramCallsMax', 'kolsMin', 'kolsMax',
  'smartMoneyMin', 'smartMoneyMax', 'xFollowersMin', 'xFollowersMax',
  'devMigratedMin', 'devMigratedMax', 'devLaunchedMin', 'devLaunchedMax',
  'devMigratedPctMin', 'devMigratedPctMax', 'totalHoldersMin', 'totalHoldersMax',
  'botDegensMin', 'botDegensMax', 'botTraderHoldMin', 'botTraderHoldMax',
  'currentlyViewingMin', 'currentlyViewingMax', 'top10HoldingMin', 'top10HoldingMax',
  'devHoldingMin', 'devHoldingMax', 'insidersMin', 'insidersMax',
  'bundlersMin', 'bundlersMax', 'phishingMin', 'phishingMax',
  'freshMin', 'freshMax', 'snipersHoldMin', 'snipersHoldMax',
  'rugPctMin', 'rugPctMax', 'xRenameMin', 'xRenameMax',
];

export function hasBnbActiveFilters(f: BnbFilters): boolean {
  if (f.searchKeywords || f.excludeKeywords || f.searchXHandle || f.searchDevWallet) return true;
  if (f.launchpads.length > 0 || f.quoteTokens.length > 0) return true;
  if (
    f.devSellAll || f.devStillHolding || f.originalAvatar || f.originalSocials ||
    f.devBurnt || f.excludeDevWashTrading || f.excludeInsidersWashTrading ||
    f.excludeUxento || f.excludeRapidLaunch ||
    f.withAtLeastOneSocial || f.onlyTweet || f.dexAdPaid || f.dexBarPaid ||
    f.dexBoost || f.updateSocial || f.cto || f.hasX || f.hasWebsite ||
    f.hasTelegram || f.hasYoutube || f.hasTiktok || f.hasInstagram
  ) return true;
  // Default-ON audit flags count as active only when turned OFF
  if (!f.excludeHoneypot || !f.excludeUnverified || !f.excludeNonRenounced) return true;
  return NUMERIC_KEYS.some((k) => (f[k] as string) !== '');
}

export function BnbFiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<BnbFiltersState>(defaultState);

  const setColumnFilters = useCallback((col: BnbColumnKey, f: BnbFilters) => {
    setFilters((prev) => ({ ...prev, [col]: f }));
  }, []);

  const resetColumnFilters = useCallback((col: BnbColumnKey) => {
    setFilters((prev) => ({ ...prev, [col]: { ...defaultBnbFilters } }));
  }, []);

  const resetAllFilters = useCallback(() => {
    setFilters(defaultState);
  }, []);

  const hasActiveFilters = useCallback(
    (col: BnbColumnKey) => hasBnbActiveFilters(filters[col]),
    [filters],
  );

  const value = useMemo(
    () => ({ filters, setColumnFilters, resetColumnFilters, resetAllFilters, hasActiveFilters }),
    [filters, setColumnFilters, resetColumnFilters, resetAllFilters, hasActiveFilters],
  );

  return <BnbFiltersContext.Provider value={value}>{children}</BnbFiltersContext.Provider>;
}

export function useBnbFilters() {
  const ctx = useContext(BnbFiltersContext);
  if (!ctx) throw new Error('useBnbFilters must be used within BnbFiltersProvider');
  return ctx;
}
