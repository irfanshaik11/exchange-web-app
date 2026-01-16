/**
 * Dynamic Priority Fee Calculator
 *
 * Calculates optimal priority fees based on:
 * - Trade size (smaller trades = lower fees)
 * - Token age (new tokens may need higher fees during launch)
 * - User override (respects user-set values if intentionally high)
 */

// Fee tiers in SOL
const FEE_TIERS = {
  MICRO: 0.000005,    // For tiny trades < 0.01 SOL
  LOW: 0.00001,       // For small trades 0.01-0.1 SOL
  NORMAL: 0.00005,    // For medium trades 0.1-1 SOL
  HIGH: 0.0001,       // For larger trades > 1 SOL
  NEW_TOKEN: 0.0002,  // For tokens < 1 hour old (competitive)
} as const;

// Minimum fee to ensure transaction gets processed
const MIN_FEE = 0.000005; // 5000 lamports

// Maximum auto-calculated fee (user can override higher)
const MAX_AUTO_FEE = 0.0005; // 0.5 mSOL

interface DynamicFeeParams {
  /** Trade amount in SOL */
  tradeAmount: number;
  /** Token creation timestamp (ISO string or Date) */
  tokenCreatedAt?: string | Date | null;
  /** User-configured priority fee (if set intentionally high, we respect it) */
  userPriorityFee?: number;
  /** If true, user explicitly set this fee (don't override) */
  isUserOverride?: boolean;
}

/**
 * Calculate dynamic priority fee based on trade context
 *
 * @returns Priority fee in SOL
 */
export function calculateDynamicPriorityFee({
  tradeAmount,
  tokenCreatedAt,
  userPriorityFee,
  isUserOverride = false,
}: DynamicFeeParams): number {
  // If user explicitly set a fee and it's reasonable, respect it
  // Only auto-adjust if they're using the default (0.0001) or lower
  if (isUserOverride && userPriorityFee && userPriorityFee > 0.0001) {
    return userPriorityFee;
  }

  // Calculate token age in hours
  let tokenAgeHours = Infinity;
  if (tokenCreatedAt) {
    const createdTime = typeof tokenCreatedAt === 'string'
      ? new Date(tokenCreatedAt).getTime()
      : tokenCreatedAt.getTime();

    if (!isNaN(createdTime)) {
      tokenAgeHours = (Date.now() - createdTime) / (1000 * 60 * 60);
    }
  }

  // New token boost: tokens < 1 hour old get higher priority
  // These often have competitive trading during launch
  const isNewToken = tokenAgeHours < 1;
  const isRecentToken = tokenAgeHours < 6;

  // Base fee based on trade size
  let baseFee: number;
  if (tradeAmount < 0.01) {
    baseFee = FEE_TIERS.MICRO;
  } else if (tradeAmount < 0.1) {
    baseFee = FEE_TIERS.LOW;
  } else if (tradeAmount < 1) {
    baseFee = FEE_TIERS.NORMAL;
  } else {
    baseFee = FEE_TIERS.HIGH;
  }

  // Apply new token multiplier
  if (isNewToken) {
    baseFee = Math.max(baseFee, FEE_TIERS.NEW_TOKEN);
  } else if (isRecentToken) {
    baseFee = Math.max(baseFee, FEE_TIERS.NORMAL);
  }

  // Ensure fee is within bounds
  const calculatedFee = Math.max(MIN_FEE, Math.min(MAX_AUTO_FEE, baseFee));

  // If user set a lower fee than calculated, use the lower one
  // (they might be optimizing for cost over speed)
  if (userPriorityFee && userPriorityFee < calculatedFee && userPriorityFee >= MIN_FEE) {
    return userPriorityFee;
  }

  return calculatedFee;
}

/**
 * Check if priority fee seems unreasonably high relative to trade amount
 *
 * @returns Warning message if fee is too high, null otherwise
 */
export function checkPriorityFeeWarning(
  priorityFee: number,
  tradeAmount: number,
): string | null {
  const feePercentage = (priorityFee / tradeAmount) * 100;

  if (feePercentage > 50) {
    return `Priority fee (${priorityFee} SOL) is ${feePercentage.toFixed(0)}% of your trade amount!`;
  }

  if (feePercentage > 20) {
    return `Priority fee is ${feePercentage.toFixed(0)}% of your trade. Consider lowering it.`;
  }

  return null;
}

/**
 * Format priority fee for display
 */
export function formatPriorityFee(fee: number): string {
  if (fee < 0.0001) {
    return `${(fee * 1_000_000).toFixed(0)} μSOL`;
  }
  return `${fee.toFixed(6)} SOL`;
}
