import React, { createContext, useContext } from "react";
import { useUser } from "../components/UserContext";
import {
  useWalletPortfolio,
  type UseWalletPortfolioState,
} from "~/hooks/useWalletPortfolio";
import {
  useWalletTrades,
  type UseWalletTradesState,
} from "~/hooks/useWalletTrades";

interface PortfolioDataContextValue {
  /** Chain-derived portfolio for the primary Solana wallet. */
  wp: UseWalletPortfolioState;
  /** Chain-derived trade history for the primary Solana wallet. */
  wt: UseWalletTradesState;
  /** The primary Solana wallet address used for fetching (null when unavailable). */
  primarySolAddr: string | null;
}

const PortfolioDataContext = createContext<PortfolioDataContextValue | null>(
  null,
);

/**
 * Provider that eagerly fetches portfolio positions and trade history
 * for the user's primary Solana wallet. Mounted at the app level so
 * data is warm by the time the user navigates to the Portfolio page.
 */
export function PortfolioDataProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { primaryWalletAddresses } = useUser();
  const primarySolAddr = primaryWalletAddresses?.solana ?? null;

  const wp = useWalletPortfolio(primarySolAddr);
  // Always enabled — prefetch trades so the Activity tab is instant.
  const wt = useWalletTrades(primarySolAddr, true);

  return (
    <PortfolioDataContext.Provider value={{ wp, wt, primarySolAddr }}>
      {children}
    </PortfolioDataContext.Provider>
  );
}

export function usePortfolioData(): PortfolioDataContextValue {
  const ctx = useContext(PortfolioDataContext);
  if (!ctx) {
    throw new Error(
      "usePortfolioData must be used within a PortfolioDataProvider",
    );
  }
  return ctx;
}
