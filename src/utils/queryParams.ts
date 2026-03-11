import { useCallback, useEffect, useState } from 'react';

// Types for trade page parameters
export interface TradePageParams {
  mode: "buy" | "sell";
  tab: "market" | "limit" | "adv";
  timeRange: "5m" | "1h" | "12h" | "24h";
  amount: string;
  targetMC: string;
  sliderPct: number;
}

// Default values for trade page parameters
export const defaultTradePageParams: TradePageParams = {
  mode: "buy",
  tab: "market",
  timeRange: "5m",
  amount: "",
  targetMC: "",
  sliderPct: 0,
};

// Ephemeral navigation intent — set before router.push, consumed once on mount
const TRADE_NAV_INTENT_KEY = 'trade-nav-intent';

/**
 * Set a navigation intent that the trade page will consume on mount.
 * Used by Positions/PositionDetailModal to signal mode=sell without URL params.
 */
export const setTradeNavIntent = (intent: { mode: 'buy' | 'sell' }) => {
  try {
    sessionStorage.setItem(TRADE_NAV_INTENT_KEY, JSON.stringify(intent));
  } catch {}
};

// Hook for managing trade page parameters (state-only, URL stays clean)
export const useTradePageQueryParams = () => {
  const [params, setParamsState] = useState<TradePageParams>(defaultTradePageParams);
  const [isReady, setIsReady] = useState(false);

  // On mount: read ephemeral intent from sessionStorage (e.g., mode=sell from Positions)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(TRADE_NAV_INTENT_KEY);
      if (raw) {
        sessionStorage.removeItem(TRADE_NAV_INTENT_KEY);
        const intent = JSON.parse(raw);
        if (intent?.mode === 'sell' || intent?.mode === 'buy') {
          setParamsState(prev => ({ ...prev, mode: intent.mode }));
        }
      }
    } catch {}
    setIsReady(true);
  }, []);

  // Update internal state only — URL stays clean
  const updateParams = useCallback((newParams: Partial<TradePageParams>) => {
    setParamsState(prev => ({ ...prev, ...newParams }));
  }, []);

  // Get current parameters as query string (for API calls, not URL)
  const getQueryString = useCallback(() => {
    const urlParams = new URLSearchParams();
    urlParams.set('mode', params.mode);
    urlParams.set('tab', params.tab);
    urlParams.set('timeRange', params.timeRange);
    if (params.amount) urlParams.set('amount', params.amount);
    if (params.targetMC) urlParams.set('targetMC', params.targetMC);
    urlParams.set('sliderPct', params.sliderPct.toString());
    return urlParams.toString();
  }, [params]);

  // Get parameters for API calls
  const getApiParams = useCallback(() => {
    return {
      ...params,
      // Convert string values to appropriate types for API
      amount: parseFloat(params.amount) || 0,
      targetMC: parseFloat(params.targetMC) || 0,
    };
  }, [params]);

  return {
    params,
    setParams: updateParams,
    getQueryString,
    getApiParams,
    isReady,
  };
};

// Utility function to parse query parameters from URL
export const parseQueryParams = (query: any): Partial<TradePageParams> => {
  const parsed: Partial<TradePageParams> = {};

  if (query.mode && typeof query.mode === 'string') {
    parsed.mode = query.mode as "buy" | "sell";
  }
  if (query.tab && typeof query.tab === 'string') {
    parsed.tab = query.tab as "market" | "limit" | "adv";
  }
  if (query.timeRange && typeof query.timeRange === 'string') {
    parsed.timeRange = query.timeRange as "5m" | "1h" | "12h" | "24h";
  }
  if (query.amount && typeof query.amount === 'string') {
    parsed.amount = query.amount;
  }
  if (query.targetMC && typeof query.targetMC === 'string') {
    parsed.targetMC = query.targetMC;
  }
  if (query.sliderPct && typeof query.sliderPct === 'string') {
    parsed.sliderPct = parseFloat(query.sliderPct);
  }

  return parsed;
};

// Utility function to create query string from parameters
export const createQueryString = (params: Partial<TradePageParams>): string => {
  const urlParams = new URLSearchParams();

  if (params.mode) urlParams.set('mode', params.mode);
  if (params.tab) urlParams.set('tab', params.tab);
  if (params.timeRange) urlParams.set('timeRange', params.timeRange);
  if (params.amount) urlParams.set('amount', params.amount);
  if (params.targetMC) urlParams.set('targetMC', params.targetMC);
  if (params.sliderPct !== undefined) urlParams.set('sliderPct', params.sliderPct.toString());

  return urlParams.toString();
};
