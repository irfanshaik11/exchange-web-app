import {
  buildSolanaWalletAllocations,
  type SolanaWalletAllocation,
} from "./solanaWalletAllocation";
import { validateSolanaBuy, type ValidationResult } from "./preTradeValidation";
import { seedPrimaryQuoteBalance, type QuoteCurrency } from "./quoteCurrency";

type GateWallet = {
  id: string;
  solanaAddress?: string;
  isPrimary?: boolean;
  isArchived?: boolean;
  balance?: number;
};

export interface QuoteBuyGateInput {
  amount: number;
  quoteCurrency: QuoteCurrency;
  walletList: GateWallet[];
  /** Per-wallet SOL balances (used when quoteCurrency === "SOL"). */
  walletBalances: Record<string, number>;
  /** Per-wallet USDC balances (used when quoteCurrency === "USDC"). */
  walletUsdcBalances?: Record<string, number>;
  /** Primary wallet's USDC balance, seeded in when the per-wallet map lacks it. */
  usdcSplBalance?: number;
  /** tokenBalances.USDC.solana fallback for the primary wallet. */
  tokenBalancesUsdcSol?: number;
  primaryAddress?: string;
  selectedWalletIds?: string[];
  priorityFee?: number;
  bribe?: number;
  ataExists?: boolean | null;
  /** Primary wallet SOL balance — checked for gas even on USDC trades. */
  solBalance?: number;
}

export interface QuoteBuyGateResult extends ValidationResult {
  allocations: SolanaWalletAllocation[];
  /** Total wallets considered (from the allocation pass). */
  total: number;
  /** USDC map with the primary wallet seeded — pass straight to executeSolanaMultiBuy. */
  effectiveWalletUsdcBalances: Record<string, number>;
  walletsWithBalance: number;
}

/**
 * One currency-aware pre-buy gate shared by every quick-buy surface (Pulse,
 * Discover, Wallet Tracker, search, watchlist, header). It seeds the primary
 * wallet's USDC, builds the allocation in the active quote currency, and
 * validates — so no surface re-implements (and mis-implements) the SOL/USDC gate.
 */
export function quoteAwareBuyGate(input: QuoteBuyGateInput): QuoteBuyGateResult {
  const {
    amount,
    quoteCurrency,
    walletList,
    walletBalances,
    walletUsdcBalances,
    usdcSplBalance,
    tokenBalancesUsdcSol,
    primaryAddress,
    selectedWalletIds = [],
    priorityFee,
    bribe,
    ataExists,
    solBalance,
  } = input;

  const fallbackUsdc = Math.max(
    Number(usdcSplBalance) || 0,
    Number(tokenBalancesUsdcSol) || 0,
  );
  const effectiveWalletUsdcBalances = seedPrimaryQuoteBalance(
    walletUsdcBalances,
    primaryAddress,
    fallbackUsdc,
    quoteCurrency,
  );
  const balancesForQuote =
    quoteCurrency === "USDC" ? effectiveWalletUsdcBalances : walletBalances;

  const { allocations, total } = buildSolanaWalletAllocations({
    amount,
    walletList,
    walletBalances: balancesForQuote,
    selectedWalletIds,
    priorityFee: priorityFee ?? 0.0001,
    bribe: bribe ?? 0,
    quoteCurrency,
  });

  const validation = validateSolanaBuy(
    amount,
    allocations,
    balancesForQuote,
    walletList,
    selectedWalletIds,
    priorityFee,
    bribe,
    ataExists,
    quoteCurrency,
    solBalance,
  );

  return {
    ...validation,
    allocations,
    total,
    effectiveWalletUsdcBalances,
    walletsWithBalance: allocations.length,
  };
}
