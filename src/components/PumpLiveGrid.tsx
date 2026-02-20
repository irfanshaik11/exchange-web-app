import React, { useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import PumpLiveCard from './PumpLiveCard';
import { usePumpLive, type PumpLiveToken } from '../hooks/usePumpLive';

export type PumpLiveSortField = 'time' | 'mc';
export type PumpLiveSortDirection = 'asc' | 'desc';

interface PumpLiveGridProps {
  onQuickBuy?: (token: PumpLiveToken, amount: number) => void;
  quickBuyAmount?: number;
  sortField?: PumpLiveSortField;
  sortDirection?: PumpLiveSortDirection;
}

// Skeleton card for loading state
function SkeletonCard() {
  return (
    <div className="flex flex-col bg-[#1E1F26] rounded-xl overflow-hidden animate-pulse">
      <div className="aspect-[16/10] w-full bg-[#2A2B33]" />
      <div className="flex flex-col p-3 gap-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[#2A2B33]" />
          <div className="flex-1 h-4 bg-[#2A2B33] rounded" />
          <div className="w-16 h-4 bg-[#2A2B33] rounded" />
        </div>
        <div className="h-8 bg-[#2A2B33] rounded" />
        <div className="flex gap-3">
          <div className="w-12 h-3 bg-[#2A2B33] rounded" />
          <div className="w-16 h-3 bg-[#2A2B33] rounded" />
        </div>
        <div className="flex justify-between pt-1 border-t border-[#2A2B33]/50">
          <div className="flex gap-2">
            <div className="w-6 h-6 bg-[#2A2B33] rounded" />
            <div className="w-6 h-6 bg-[#2A2B33] rounded" />
          </div>
          <div className="w-14 h-7 bg-[#2A2B33] rounded" />
        </div>
      </div>
    </div>
  );
}

export default function PumpLiveGrid({
  onQuickBuy,
  quickBuyAmount = 0,
  sortField = 'time',
  sortDirection = 'desc',
}: PumpLiveGridProps) {
  const router = useRouter();
  const { tokens, loading, error, refetch } = usePumpLive({
    enabled: true,
    refreshInterval: 10000,
    limit: 50,
  });

  // Sort tokens based on props
  const sortedTokens = useMemo(() => {
    const sorted = [...tokens];
    sorted.sort((a, b) => {
      let aVal: number, bVal: number;

      if (sortField === 'mc') {
        aVal = a.usd_market_cap || 0;
        bVal = b.usd_market_cap || 0;
      } else {
        aVal = a.created_timestamp || 0;
        bVal = b.created_timestamp || 0;
      }

      return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
    });
    return sorted;
  }, [tokens, sortField, sortDirection]);

  const handleTokenClick = useCallback((token: PumpLiveToken) => {
    // Build query params with prefill data for faster initial render
    const queryParams = new URLSearchParams();
    queryParams.set('chain', 'sol');
    if (token.name) queryParams.set('_name', token.name);
    if (token.symbol) queryParams.set('_symbol', token.symbol);
    if (token.usd_market_cap) queryParams.set('_mcap', token.usd_market_cap.toString());
    if (token.image_uri) queryParams.set('_image', token.image_uri);
    queryParams.set('_mint', token.mint);
    queryParams.set('_launchpad_protocol', 'pump');
    if (token.created_timestamp) queryParams.set('_created_at', new Date(token.created_timestamp * 1000).toISOString());

    // Navigate to trade page with prefill data
    router.push(`/trade/${token.mint}?${queryParams.toString()}`);
  }, [router]);

  const handleBuy = useCallback((token: PumpLiveToken) => {
    if (onQuickBuy && quickBuyAmount > 0) {
      onQuickBuy(token, quickBuyAmount);
    } else {
      // Fallback: navigate to trade page with prefill data
      const queryParams = new URLSearchParams();
      queryParams.set('chain', 'sol');
      if (token.name) queryParams.set('_name', token.name);
      if (token.symbol) queryParams.set('_symbol', token.symbol);
      if (token.usd_market_cap) queryParams.set('_mcap', token.usd_market_cap.toString());
      if (token.image_uri) queryParams.set('_image', token.image_uri);
      queryParams.set('_mint', token.mint);
      queryParams.set('_launchpad_protocol', 'pump');

      router.push(`/trade/${token.mint}?${queryParams.toString()}`);
    }
  }, [onQuickBuy, quickBuyAmount, router]);

  return (
    <div className="flex flex-col gap-4">
      {/* Error State */}
      {error && (
        <div className="flex items-center justify-center py-8 text-[#f26681]">
          <span className="text-sm">{error}</span>
          <button
            onClick={refetch}
            className="ml-3 px-3 py-1 text-xs bg-[#1E1F26] rounded hover:bg-[#2A2B33] transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {loading && tokens.length === 0 ? (
          // Loading skeletons
          Array.from({ length: 18 }).map((_, i) => <SkeletonCard key={i} />)
        ) : sortedTokens.length > 0 ? (
          // Token cards
          sortedTokens.map((token) => (
            <PumpLiveCard
              key={token.mint}
              token={token}
              onClick={handleTokenClick}
              onBuy={handleBuy}
            />
          ))
        ) : !error ? (
          // Empty state
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
            <svg className="w-12 h-12 mb-4 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <span className="text-sm">Waiting for live tokens...</span>
          </div>
        ) : null}
      </div>

      {/* Loading indicator for background refreshes */}
      {loading && tokens.length > 0 && (
        <div className="flex justify-center py-2">
          <div className="flex items-center gap-2 text-xs text-[#6B7280]">
            <div className="w-3 h-3 border-2 border-[#00E5BE]/30 border-t-[#00E5BE] rounded-full animate-spin" />
            Refreshing...
          </div>
        </div>
      )}
    </div>
  );
}
