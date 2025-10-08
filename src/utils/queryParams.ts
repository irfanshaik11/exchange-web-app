import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';

// Types for trade page parameters
export interface TradePageParams {
  mode: "buy" | "sell";
  tab: "market" | "limit" | "adv";
  timeRange: "5m" | "1h" | "6h" | "24h";
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

// Hook for managing trade page query parameters
export const useTradePageQueryParams = () => {
  const router = useRouter();
  const [params, setParams] = useState<TradePageParams>(defaultTradePageParams);
  const [isReady, setIsReady] = useState(false);

  // Load parameters from URL on mount
  useEffect(() => {
    if (router.isReady) {
      const { query } = router;
      
      const newParams: TradePageParams = {
        mode: (query.mode as "buy" | "sell") || defaultTradePageParams.mode,
        tab: (query.tab as "market" | "limit" | "adv") || defaultTradePageParams.tab,
        timeRange: (query.timeRange as "5m" | "1h" | "6h" | "24h") || defaultTradePageParams.timeRange,
        amount: (query.amount as string) || defaultTradePageParams.amount,
        targetMC: (query.targetMC as string) || defaultTradePageParams.targetMC,
        sliderPct: parseFloat(query.sliderPct as string) || defaultTradePageParams.sliderPct,
      };
      
      setParams(newParams);
      setIsReady(true);
    }
  }, [router.isReady, router.query]);

  // Update URL with current parameters
  const updateUrl = useCallback((newParams: Partial<TradePageParams>) => {
    if (!router.isReady) return;
    
    const updatedParams = { ...params, ...newParams };
    setParams(updatedParams);
    
    const urlParams = new URLSearchParams();
    
    // Add trade page parameters
    urlParams.set('mode', updatedParams.mode);
    urlParams.set('tab', updatedParams.tab);
    urlParams.set('timeRange', updatedParams.timeRange);
    if (updatedParams.amount) urlParams.set('amount', updatedParams.amount);
    if (updatedParams.targetMC) urlParams.set('targetMC', updatedParams.targetMC);
    urlParams.set('sliderPct', updatedParams.sliderPct.toString());
    
    // Update URL without causing a page reload
    // Extract the base path without query parameters
    const basePath = router.asPath.split('?')[0];
    const newUrl = `${basePath}?${urlParams.toString()}`;
    if (newUrl !== router.asPath) {
      router.replace(newUrl, undefined, { shallow: true });
    }
  }, [params, router]);

  // Get current parameters as query string
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
    setParams: updateUrl,
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
    parsed.timeRange = query.timeRange as "5m" | "1h" | "6h" | "24h";
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
