import { useQuery } from '@tanstack/react-query';
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
  const query = useQuery<MarketInsights | null>({
    queryKey: ['insights', source, marketId],
    queryFn: async () => {
      try {
        const res = await apiFetch<{ success: boolean; data: MarketInsights }>(`/api/prediction/insights/${source}/${marketId}`);
        return res.data;
      } catch (err: any) {
        // 404 = backend triggered generation, poll until ready
        if (err?.status === 404) return null;
        throw err;
      }
    },
    enabled: !!source && !!marketId,
    // Poll every 5s while insights are pending (null), stop once we have data
    refetchInterval: (query) => (query.state.data === null ? 5_000 : false),
    // Cache real data for 6h, but null results stay fresh for re-polling
    staleTime: (query) => (query.state.data ? 6 * 60 * 60 * 1000 : 0),
    gcTime: 7 * 60 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  return query;
}
