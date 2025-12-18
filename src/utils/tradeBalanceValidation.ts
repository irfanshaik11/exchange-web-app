/**
 * Trade Balance Pre-Validation Utility
 *
 * This module provides client-side balance validation BEFORE showing any trade toast.
 * This prevents the misleading "Trade placed!" toast when balance is insufficient.
 */

export interface BalanceValidationResult {
  isValid: boolean;
  errorMessage: string | null;
  details: {
    currentBalance: number;
    tradeAmount: number;
    fees: number;
    safetyBuffer: number;
    totalRequired: number;
    shortage: number;
  } | null;
}

export interface MonadBalanceValidationParams {
  balance: number; // Current MON balance
  tradeAmount: number; // Amount in MON to spend
  gasPrice?: number; // Gas price in gwei (optional)
  estimatedGas?: number; // Estimated gas units (default: 300000 for Monad trades)
}

export interface SolanaBalanceValidationParams {
  balance: number; // Current SOL balance
  tradeAmount: number; // Amount in SOL to spend
  priorityFee: number; // Priority fee in SOL
  bribe: number; // Bribe/MEV fee in SOL
}

// Constants
const MONAD_SAFETY_BUFFER = 0.1; // 0.1 MON for gas fluctuations
const MONAD_ESTIMATED_GAS = 300000; // Default gas estimate for Monad trades
const MONAD_DEFAULT_GAS_PRICE_GWEI = 50; // Default gas price in gwei

const SOLANA_SAFETY_BUFFER = 0.0025; // 0.0025 SOL for rent + network fees
const SOLANA_NETWORK_FEE = 0.00001; // Base Solana network fee

/**
 * Validates if user has sufficient MON balance for a Monad trade
 * Call this BEFORE showing any toast to prevent premature success indication
 */
export function validateMonadBalance(params: MonadBalanceValidationParams): BalanceValidationResult {
  const { balance, tradeAmount, gasPrice, estimatedGas } = params;

  // Calculate gas cost in MON
  const effectiveGasPrice = gasPrice ?? MONAD_DEFAULT_GAS_PRICE_GWEI;
  const effectiveGasUnits = estimatedGas ?? MONAD_ESTIMATED_GAS;
  const gasCostMon = (effectiveGasPrice * effectiveGasUnits) / 1e9; // Convert gwei to MON

  const totalRequired = tradeAmount + gasCostMon + MONAD_SAFETY_BUFFER;
  const shortage = totalRequired - balance;

  if (balance < totalRequired) {
    return {
      isValid: false,
      errorMessage: `Insufficient balance. Need ${totalRequired.toFixed(4)} MON (${tradeAmount.toFixed(4)} MON for trade + ${(gasCostMon + MONAD_SAFETY_BUFFER).toFixed(4)} MON for gas) but you have ${balance.toFixed(4)} MON.`,
      details: {
        currentBalance: balance,
        tradeAmount,
        fees: gasCostMon,
        safetyBuffer: MONAD_SAFETY_BUFFER,
        totalRequired,
        shortage,
      },
    };
  }

  return {
    isValid: true,
    errorMessage: null,
    details: null,
  };
}

/**
 * Validates if user has sufficient SOL balance for a Solana trade
 * Call this BEFORE showing any toast to prevent premature success indication
 */
export function validateSolanaBalance(params: SolanaBalanceValidationParams): BalanceValidationResult {
  const { balance, tradeAmount, priorityFee, bribe } = params;

  const totalFees = priorityFee + bribe + SOLANA_NETWORK_FEE + SOLANA_SAFETY_BUFFER;
  const totalRequired = tradeAmount + totalFees;
  const shortage = totalRequired - balance;

  if (balance < totalRequired) {
    return {
      isValid: false,
      errorMessage: `Insufficient balance. Need ${totalRequired.toFixed(4)} SOL (${tradeAmount.toFixed(4)} SOL for trade + ${totalFees.toFixed(4)} SOL for fees) but you have ${balance.toFixed(4)} SOL.`,
      details: {
        currentBalance: balance,
        tradeAmount,
        fees: priorityFee + bribe + SOLANA_NETWORK_FEE,
        safetyBuffer: SOLANA_SAFETY_BUFFER,
        totalRequired,
        shortage,
      },
    };
  }

  return {
    isValid: true,
    errorMessage: null,
    details: null,
  };
}

/**
 * Quick validation check that returns just true/false
 * Useful for disabling buttons or quick checks
 */
export function hasEnoughMonadBalance(balance: number, tradeAmount: number): boolean {
  return validateMonadBalance({ balance, tradeAmount }).isValid;
}

export function hasEnoughSolanaBalance(
  balance: number,
  tradeAmount: number,
  priorityFee: number = 0.001,
  bribe: number = 0
): boolean {
  return validateSolanaBalance({ balance, tradeAmount, priorityFee, bribe }).isValid;
}
