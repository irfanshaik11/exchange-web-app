import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../utils/api';
import type { InsightCategory } from './useMarketInsights';

export interface HomepageInsightsData {
  marketPulse: InsightCategory;
  aiTopPicks: Array<{
    marketId: string;
    source: string;
    question: string;
    text: string;
    sentiment: 'bullish' | 'bearish' | 'neutral';
    confidence: 'high' | 'medium' | 'low';
  }>;
  trendingNarratives: Array<{
    theme: string;
    text: string;
    relatedMarketCount: number;
  }>;
  generatedAt?: string;
  model?: string;
}

export interface HomepageInsights {
  generatedAt?: string;
  insights: HomepageInsightsData;
}

export function useHomepageInsights() {
  return useQuery<HomepageInsights | null>({
    queryKey: ['insights', 'homepage'],
    queryFn: async () => {
      try {
        const res = await apiFetch<{ success: boolean; data: HomepageInsightsData }>('/api/prediction/insights/homepage');
        const d = res.data;
        // Normalize: API returns flat (marketPulse, aiTopPicks at top level)
        // Frontend expects nested under "insights"
        if (d.marketPulse) {
          const { generatedAt, model, usage, ...insightData } = d as any;
          return { generatedAt, insights: insightData } as HomepageInsights;
        }
        return d as unknown as HomepageInsights;
      } catch (err: any) {
        if (err?.status === 404) return null;
        throw err;
      }
    },
    staleTime: 12 * 60 * 60 * 1000,
    gcTime: 13 * 60 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
