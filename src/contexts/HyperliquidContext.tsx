// src/contexts/HyperliquidContext.tsx
// Lazily loads Hyperliquid market metadata on first perps page visit.
// Lightweight: no WS connections at app level — just metadata cache.

import React, { createContext, useContext, useMemo, useState, useCallback } from "react";
import type { HyperliquidMarketRow } from "../utils/hyperliquidTypes";
import { useHyperliquidMarkets } from "../hooks/useHyperliquidMarkets";

interface HyperliquidContextValue {
  markets: HyperliquidMarketRow[];
  marketsLoading: boolean;
  marketsError: string | null;
  getMarketBySymbol: (symbol: string) => HyperliquidMarketRow | undefined;
  activateMarkets: () => void; // Call to start fetching market data
  isActive: boolean;
}

const HyperliquidContext = createContext<HyperliquidContextValue | null>(null);

export function HyperliquidProvider({ children }: { children: React.ReactNode }) {
  const [isActive, setIsActive] = useState(false);

  const { markets, loading, error, getMarketBySymbol } = useHyperliquidMarkets({
    enabled: isActive,
    refreshInterval: 5000,
  });

  const activateMarkets = useCallback(() => {
    if (!isActive) {
      setIsActive(true);
    }
  }, [isActive]);

  const value = useMemo(
    () => ({
      markets,
      marketsLoading: loading,
      marketsError: error,
      getMarketBySymbol,
      activateMarkets,
      isActive,
    }),
    [markets, loading, error, getMarketBySymbol, activateMarkets, isActive]
  );

  return (
    <HyperliquidContext.Provider value={value}>
      {children}
    </HyperliquidContext.Provider>
  );
}

export function useHyperliquid(): HyperliquidContextValue {
  const context = useContext(HyperliquidContext);
  if (!context) {
    throw new Error("useHyperliquid must be used within HyperliquidProvider");
  }
  return context;
}
