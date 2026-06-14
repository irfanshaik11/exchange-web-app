import React, { useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import PumpLiveCard from "./PumpLiveCard";
import { usePumpLive, type PumpLiveToken } from "../hooks/usePumpLive";
import { preloadTradeChart } from "~/utils/preloadTradeChart";

export type PumpLiveSortField = "time" | "mc";
export type PumpLiveSortDirection = "asc" | "desc";

interface PumpLiveGridProps {
  onQuickBuy?: (token: PumpLiveToken, amount: number) => void;
  quickBuyAmount?: number;
  sortField?: PumpLiveSortField;
  sortDirection?: PumpLiveSortDirection;
}

// Skeleton card for loading state
function SkeletonCard() {
  return (
    <div className="flex animate-pulse flex-col overflow-hidden rounded-xl bg-[#1E1F26]">
      <div className="aspect-[16/10] w-full bg-[#2A2B33]" />
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-[#2A2B33]" />
          <div className="h-4 flex-1 rounded bg-[#2A2B33]" />
          <div className="h-4 w-16 rounded bg-[#2A2B33]" />
        </div>
        <div className="h-8 rounded bg-[#2A2B33]" />
        <div className="flex gap-3">
          <div className="h-3 w-12 rounded bg-[#2A2B33]" />
          <div className="h-3 w-16 rounded bg-[#2A2B33]" />
        </div>
        <div className="flex justify-between border-t border-[#2A2B33]/50 pt-1">
          <div className="flex gap-2">
            <div className="h-6 w-6 rounded bg-[#2A2B33]" />
            <div className="h-6 w-6 rounded bg-[#2A2B33]" />
          </div>
          <div className="h-7 w-14 rounded bg-[#2A2B33]" />
        </div>
      </div>
    </div>
  );
}

export default function PumpLiveGrid({
  onQuickBuy,
  quickBuyAmount = 0,
  sortField = "time",
  sortDirection = "desc",
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

      if (sortField === "mc") {
        aVal = a.usd_market_cap || 0;
        bVal = b.usd_market_cap || 0;
      } else {
        aVal = a.created_timestamp || 0;
        bVal = b.created_timestamp || 0;
      }

      return sortDirection === "desc" ? bVal - aVal : aVal - bVal;
    });
    return sorted;
  }, [tokens, sortField, sortDirection]);

  const handleTokenClick = useCallback(
    (token: PumpLiveToken) => {
      router.push(`/trade/${token.mint}`);
    },
    [router],
  );

  const handleTokenHover = useCallback(
    (token: PumpLiveToken) => {
      preloadTradeChart(
        {
          mint: token.mint,
          chain: "sol",
          name: token.name,
          symbol: token.symbol,
          marketCapUsd: token.usd_market_cap,
          image: token.image_uri || "",
          launchpadProtocol: "pump",
        },
        { router },
      );
    },
    [router],
  );

  // Hold the latest onQuickBuy / quickBuyAmount in refs so handleBuy stays
  // referentially STABLE across the parent's frequent re-renders. discover.tsx
  // re-renders many times/sec (it hosts several live WS feeds) and passes a
  // fresh `onQuickBuy` each time; without this, handleBuy changed every render,
  // which broke PumpLiveCard's memoization and reloaded every card image
  // continuously (the "constant refresh"). Assigning during render keeps the
  // refs current without an effect lag.
  const onQuickBuyRef = useRef(onQuickBuy);
  onQuickBuyRef.current = onQuickBuy;
  const quickBuyAmountRef = useRef(quickBuyAmount);
  quickBuyAmountRef.current = quickBuyAmount;

  const handleBuy = useCallback(
    (token: PumpLiveToken) => {
      const cb = onQuickBuyRef.current;
      if (cb && quickBuyAmountRef.current > 0) {
        cb(token, quickBuyAmountRef.current);
      } else {
        // Fallback: navigate to trade page
        router.push(`/trade/${token.mint}`);
      }
    },
    [router],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Error State */}
      {error && (
        <div className="flex items-center justify-center py-8 text-[#f26681]">
          <span className="text-sm">{error}</span>
          <button
            onClick={refetch}
            className="ml-3 rounded bg-[#1E1F26] px-3 py-1 text-xs transition-colors hover:bg-[#2A2B33]"
          >
            Retry
          </button>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
              onHover={handleTokenHover}
            />
          ))
        ) : !error ? (
          // Empty state
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
            <svg
              className="mb-4 h-12 w-12 opacity-50"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <span className="text-sm">Waiting for live tokens...</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
