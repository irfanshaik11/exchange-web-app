import { useMemo } from 'react';
import useDFlowMarkets from './useDFlowMarkets';
import type { ExtendedPredictionMarket } from './useDFlowMarkets';
import usePolymarketMarkets from './usePolymarketMarkets';
import type { PredictionDataSource } from '~/components/predictions/DataSourceSwitcher';

// Extended market type with source information
export interface UnifiedPredictionMarket extends ExtendedPredictionMarket {
  source: 'dflow' | 'polymarket';
  polymarketData?: {
    eventId: string;
    marketId: string;
    conditionId: string;
    yesTokenId: string;
    noTokenId: string;
    tickSize: string;
    negRisk: boolean;
  };
}

interface UseUnifiedPredictionMarketsOptions {
  source?: PredictionDataSource;
  limit?: number;
  category?: string;
  search?: string;
  status?: 'all' | 'active' | 'closed' | 'finalized';
  refreshInterval?: number;
}

interface UseUnifiedPredictionMarketsResult {
  markets: UnifiedPredictionMarket[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  totalVolume: number;
  totalMarkets: number;
  dflowCount: number;
  polymarketCount: number;
  // Pagination (from Polymarket infinite query)
  totalAvailable: number;
  hasMore: boolean;
  loadMore: () => void;
  isFetchingMore: boolean;
}

export default function useUnifiedPredictionMarkets(
  options: UseUnifiedPredictionMarketsOptions = {}
): UseUnifiedPredictionMarketsResult {
  const {
    source = 'all',
    limit = 50,
    category,
    search,
    status = 'active',
    refreshInterval,
  } = options;

  // Fetch from dFlow (only if source is 'all' or 'dflow')
  const {
    markets: dflowMarkets,
    isLoading: dflowLoading,
    error: dflowError,
    refetch: dflowRefetch,
    totalVolume: dflowVolume,
  } = useDFlowMarkets({
    enabled: source === 'all' || source === 'dflow',
    limit,
    category,
    search,
    status,
    refreshInterval: refreshInterval || 30000,
  });

  // Fetch from Polymarket (only if source is 'all' or 'polymarket')
  const {
    markets: polymarketMarkets,
    isLoading: polymarketLoading,
    error: polymarketError,
    refetch: polymarketRefetch,
    totalVolume: polymarketVolume,
    totalAvailable: polymarketTotalAvailable,
    hasMore: polymarketHasMore,
    loadMore: polymarketLoadMore,
    isFetchingMore: polymarketIsFetchingMore,
  } = usePolymarketMarkets({
    enabled: source === 'all' || source === 'polymarket',
    limit,
    category,
    refreshInterval: refreshInterval || 60000,
  });

  // Combine and sort markets
  const combinedMarkets = useMemo(() => {
    const markets: UnifiedPredictionMarket[] = [];

    // Add dFlow markets with source tag
    if (source === 'all' || source === 'dflow') {
      for (const market of dflowMarkets) {
        markets.push({
          ...market,
          source: 'dflow',
        });
      }
    }

    // Add Polymarket markets with source tag
    if (source === 'all' || source === 'polymarket') {
      for (const market of polymarketMarkets) {
        const polyData = (market as any).polymarketData;
        markets.push({
          ...market,
          source: 'polymarket',
          polymarketData: polyData,
        });
      }
    }

    // Sort by 24h volume (descending)
    markets.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));

    return markets;
  }, [dflowMarkets, polymarketMarkets, source]);

  // Combined loading state
  const isLoading = (source === 'all' || source === 'dflow') && dflowLoading ||
                    (source === 'all' || source === 'polymarket') && polymarketLoading;

  // Combined error (prefer showing both if both fail)
  const error = dflowError && polymarketError
    ? `dFlow: ${dflowError}, Polymarket: ${polymarketError}`
    : dflowError || polymarketError || null;

  // Combined refetch
  const refetch = async () => {
    const promises: Promise<void>[] = [];
    if (source === 'all' || source === 'dflow') promises.push(dflowRefetch());
    if (source === 'all' || source === 'polymarket') promises.push(polymarketRefetch());
    await Promise.all(promises);
  };

  return {
    markets: combinedMarkets,
    isLoading,
    error,
    refetch,
    totalVolume: dflowVolume + polymarketVolume,
    totalMarkets: combinedMarkets.length,
    dflowCount: dflowMarkets.length,
    polymarketCount: polymarketMarkets.length,
    // Pagination (Polymarket)
    totalAvailable: polymarketTotalAvailable,
    hasMore: polymarketHasMore,
    loadMore: polymarketLoadMore,
    isFetchingMore: polymarketIsFetchingMore,
  };
}
