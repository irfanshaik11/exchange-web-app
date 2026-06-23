/**
 * useQuote — the "Money Brain".
 *
 * One hook that owns every currency-dependent answer for the active quote
 * currency (SOL or USDC), so no component has to branch on `=== "USDC"`.
 * It is a thin, behaviour-neutral wrapper over the pure primitives in
 * `~/utils/quoteCurrency` plus the live state in `UserContext` — it does NOT
 * introduce new logic, it just removes the duplicated glue that kept drifting
 * (the per-wallet USDC seed, the mint/symbol/price branches).
 *
 * Read `quote.balanceForWallet(addr)` / `quote.tokensForAmount(...)` /
 * `quote.mint` instead of re-deriving them per surface.
 */
import { useMemo } from "react";
import { useUser } from "~/components/UserContext";
import {
  type QuoteCurrency,
  QUOTE_MINTS,
  QUOTE_DECIMALS,
  QUOTE_MIN_TRADE,
  QUOTE_BUY_PRESETS,
  NON_SOL_GAS_DUST_SOL,
  quoteUnit,
  quoteUnitTokenPrice,
  tokensForAmount as tokensForAmountFn,
  seedPrimaryQuoteBalance,
} from "~/utils/quoteCurrency";

export interface Quote {
  /** Active quote currency. */
  currency: QuoteCurrency;
  /** Persist a new quote currency globally. */
  setCurrency: (c: QuoteCurrency) => void;
  /** True when trading is denominated in USDC. */
  isUsdc: boolean;
  /** Display symbol ("SOL" | "USDC"). */
  symbol: string;
  /** Quote-currency mint address. */
  mint: string;
  /** On-chain decimals (SOL 9, USDC 6). */
  decimals: number;
  /** UI -> raw multiplier (1e9 lamports / 1e6 micro-USDC). */
  unit: number;
  /** Minimum trade amount in UI units. */
  minTrade: number;
  /** Buy-amount presets for the active currency. */
  presets: number[];
  /** SOL that must be on hand for gas, even on USDC trades. */
  gasDustSol: number;
  /**
   * Per-wallet USDC balance map with the primary wallet back-filled from the
   * SPL/token-balance feed. `{}` / unseeded for SOL (it is never consumed in
   * SOL mode). One seed, no drift — the previous source of the "insufficient
   * balance" bug.
   */
  usdcBalances: Record<string, number>;
  /** Spendable balance of the active currency for the primary wallet. */
  spendableBalance: number;
  /** Balance of the active currency for a specific wallet address. */
  balanceForWallet: (address: string) => number;
  /** USD value of 1 unit of the active currency (USDC ~ $1, SOL = live price). */
  usdPrice: (solPriceUsd: number) => number;
  /** Price of 1 token in the active currency's unit. */
  priceToken: (tokenPriceInSol: number, solPriceUsd: number) => number;
  /** Tokens received for `amount` of the active currency. */
  tokensForAmount: (
    amount: number,
    tokenPriceInSol: number,
    solPriceUsd: number,
  ) => number;
}

export function useQuote(): Quote {
  const {
    quoteCurrency,
    setQuoteCurrency,
    walletList,
    walletBalances,
    walletUsdcBalances,
    usdcSplBalance,
    tokenBalances,
    solBalance,
  } = useUser();

  return useMemo(() => {
    const currency: QuoteCurrency = quoteCurrency === "USDC" ? "USDC" : "SOL";
    const isUsdc = currency === "USDC";

    const list: any[] = walletList || [];
    const primary = list.find((w) => w?.isPrimary) || list[0];
    const primaryAddr = (primary?.solanaAddress || "").trim();
    const fallback = Math.max(
      Number(usdcSplBalance) || 0,
      Number(tokenBalances?.USDC?.solana) || 0,
    );
    const usdcBalances = seedPrimaryQuoteBalance(
      walletUsdcBalances,
      primaryAddr,
      fallback,
      currency,
    );

    const balanceForWallet = (address: string): number => {
      const addr = (address || "").trim();
      if (!addr) return 0;
      return isUsdc
        ? Number(usdcBalances?.[addr]) || 0
        : Number(walletBalances?.[addr]) || 0;
    };

    const spendableBalance = isUsdc
      ? Number(usdcBalances?.[primaryAddr]) || fallback || 0
      : Number(solBalance) || 0;

    return {
      currency,
      setCurrency: setQuoteCurrency,
      isUsdc,
      symbol: currency,
      mint: QUOTE_MINTS[currency],
      decimals: QUOTE_DECIMALS[currency],
      unit: quoteUnit(currency),
      minTrade: QUOTE_MIN_TRADE[currency],
      presets: QUOTE_BUY_PRESETS[currency],
      gasDustSol: NON_SOL_GAS_DUST_SOL,
      usdcBalances,
      spendableBalance,
      balanceForWallet,
      usdPrice: (solPriceUsd: number) =>
        isUsdc ? 1 : Number(solPriceUsd) || 0,
      priceToken: (tokenPriceInSol: number, solPriceUsd: number) =>
        quoteUnitTokenPrice(tokenPriceInSol, solPriceUsd, currency),
      tokensForAmount: (
        amount: number,
        tokenPriceInSol: number,
        solPriceUsd: number,
      ) => tokensForAmountFn(amount, tokenPriceInSol, solPriceUsd, currency),
    };
  }, [
    quoteCurrency,
    setQuoteCurrency,
    walletList,
    walletBalances,
    walletUsdcBalances,
    usdcSplBalance,
    tokenBalances,
    solBalance,
  ]);
}
