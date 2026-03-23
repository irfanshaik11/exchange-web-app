import { useQuery } from '@tanstack/react-query';
import { useRef, useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';

export interface InsightCategory {
  text: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: 'high' | 'medium' | 'low';
}

export interface MarketInsights {
  marketId: string;
  source: string;
  generatedAt: string;
  model: string;
  insights: {
    probabilityAnalysis: InsightCategory;
    smartMoneySignal: InsightCategory;
    volumeLiquidityAnalysis: InsightCategory;
    riskAssessment: InsightCategory;
    priceMomentum: InsightCategory;
    timeDecayNote: InsightCategory;
  };
}

export function useMarketInsights(source: string, marketId: string) {
  const [timedOut, setTimedOut] = useState(false);
  const pollingStartRef = useRef<number | null>(null);

  const query = useQuery<MarketInsights | null>({
    queryKey: ['insights', source, marketId],
    queryFn: async () => {
      try {
        const res = await apiFetch<{ success: boolean; data: any }>(`/api/prediction/insights/${source}/${marketId}`);
        if (res.data?.unavailable) return null;
        return res.data;
      } catch (err: any) {
        // 404 = backend triggered generation, poll until ready
        // 503 = backend temporarily unavailable
        if (err?.status === 404 || err?.status === 503) return null;
        throw err;
      }
    },
    enabled: !!source && !!marketId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data !== null) return false;
      if (timedOut) return false;
      if (pollingStartRef.current === null) pollingStartRef.current = Date.now();
      if (Date.now() - pollingStartRef.current > 120_000) {
        return false;
      }
      return 5_000;
    },
    staleTime: (query) => (query.state.data ? 6 * 60 * 60 * 1000 : 0),
    gcTime: 7 * 60 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Check for polling timeout
  useEffect(() => {
    if (query.data !== null && query.data !== undefined) {
      pollingStartRef.current = null;
      setTimedOut(false);
      return;
    }
    if (pollingStartRef.current && Date.now() - pollingStartRef.current > 120_000) {
      setTimedOut(true);
    }
  }, [query.data, query.dataUpdatedAt]);

  // Reset on marketId change
  useEffect(() => {
    setTimedOut(false);
    pollingStartRef.current = null;
  }, [source, marketId]);

  return { ...query, timedOut };
}
