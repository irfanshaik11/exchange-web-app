import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../utils/api';
import type { InsightCategory } from './useMarketInsights';

export interface HomepageInsights {
  generatedAt: string;
  insights: {
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
  };
}

export function useHomepageInsights() {
  return useQuery<HomepageInsights | null>({
    queryKey: ['insights', 'homepage'],
    queryFn: async () => {
      try {
        const res = await apiFetch<{ success: boolean; data: HomepageInsights }>('/api/prediction/insights/homepage');
        return res.data;
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
