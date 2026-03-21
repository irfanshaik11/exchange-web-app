import { useQuery } from '@tanstack/react-query';
import { useRef, useState, useEffect } from 'react';
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
  const [timedOut, setTimedOut] = useState(false);
  const pollingStartRef = useRef<number | null>(null);

  const query = useQuery<HomepageInsights | null>({
    queryKey: ['insights', 'homepage'],
    queryFn: async () => {
      try {
        const res = await apiFetch<{ success: boolean; data: any }>('/api/prediction/insights/homepage');
        if (res.data?.unavailable) return null;
        const d = res.data;
        // Normalize: API returns flat (marketPulse, aiTopPicks at top level)
        // Frontend expects nested under "insights"
        if (d.marketPulse) {
          const { generatedAt, model, usage, ...insightData } = d as any;
          return { generatedAt, insights: insightData } as HomepageInsights;
        }
        return d as unknown as HomepageInsights;
      } catch (err: any) {
        // 404 = backend triggered generation, poll until ready
        if (err?.status === 404) return null;
        throw err;
      }
    },
    // Poll every 5s while insights are pending (null), stop once we have data
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

  return { ...query, timedOut };
}
