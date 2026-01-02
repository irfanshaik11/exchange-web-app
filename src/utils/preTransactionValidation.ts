import type { Token } from './db';

export interface ValidationWarning {
  level: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  suggestion?: string;
  canProceed: boolean;
}

export interface PreTransactionCheck {
  warnings: ValidationWarning[];
  canProceed: boolean;
  estimatedSlippage?: number;
  estimatedFees?: {
    priorityFee: number;
    bribe: number;
    networkFee: number;
    total: number;
  };
}

// Check if token has suspicious characteristics - REMOVED
// These warnings were too noisy and annoying for users
// Users can see holder count, liquidity, etc. in the UI already
// export const checkTokenSafety = (token: Token): ValidationWarning[] => { ... }

// Check balance sufficiency (for BUY orders only)
export const checkBalanceSufficiency = (
  solBalance: number,
  tradeAmount: number,
  priorityFee: number,
  bribe: number,
  isSellOrder: boolean = false,
  safetyBuffer: number = 0.0001 // Reduced from 0.003 to 0.001
): ValidationWarning | null => {
  const networkFee = 0.00001; // Estimated Solana network fee (reduced from 0.001)
  
  // For SELL orders, only check fees (not the trade amount)
  const totalRequired = isSellOrder 
    ? priorityFee + bribe + safetyBuffer + networkFee
    : tradeAmount + priorityFee + bribe + safetyBuffer + networkFee;
  
  if (solBalance < totalRequired) {
    const missing = totalRequired - solBalance;
    
    // Different message for buy vs sell
    if (isSellOrder) {
      // For SELL orders, only show WARNING (not critical)
      // Let backend validate token ownership first - that's more important
      return {
        level: 'warning',
        title: 'Low SOL for Fees',
        message: `Need ${totalRequired.toFixed(4)} SOL for transaction fees but you have ${solBalance.toFixed(4)} SOL`,
        suggestion: `You may need to deposit ${missing.toFixed(4)} SOL to cover fees`,
        canProceed: true, // Let it proceed - backend will check token ownership
      };
    } else {
      // Calculate fee breakdown for better clarity
      const totalFees = totalRequired - tradeAmount;
      const feeBreakdown = `Priority: ${priorityFee.toFixed(4)} SOL, Bribe: ${bribe.toFixed(4)} SOL, Network+Buffer: ${(safetyBuffer + networkFee).toFixed(4)} SOL`;
      
      return {
        level: 'critical',
        title: 'Insufficient SOL Balance',
        message: `Need ${totalRequired.toFixed(4)} SOL (${tradeAmount.toFixed(4)} trade + ${totalFees.toFixed(4)} fees) but you have ${solBalance.toFixed(4)} SOL`,
        suggestion: `Deposit at least ${missing.toFixed(4)} SOL to continue. Fee breakdown: ${feeBreakdown}`,
        canProceed: false,
      };
    }
  }

  // Warn if balance is close to minimum (but only for buy orders)
  if (!isSellOrder && solBalance < totalRequired * 1.1) {
    return {
      level: 'warning',
      title: 'Low SOL Balance',
      message: `Your balance is close to the minimum required. Consider keeping more SOL for future trades.`,
      suggestion: `Deposit more SOL to avoid failed transactions`,
      canProceed: true,
    };
  }

  return null;
};

// Estimate slippage based on trade size and liquidity - REMOVED
// This was causing confusing warnings with bad estimates
// export const estimateSlippage = (
//   tradeAmountUsd: number,
//   liquidityUsd: number
// ): number => { ... }

// Check if slippage setting is appropriate - REMOVED
// Slippage estimation was inaccurate and confusing for users
// export const checkSlippageSetting = ( ... ): ValidationWarning | null => { ... }

// Check minimum trade amount
export const checkMinimumAmount = (
  amount: number,
  poolType: string
): ValidationWarning | null => {
  const minimums: Record<string, number> = {
    'meteora amm v2': 0.0001,
    'meteora amm v1': 0.0001,
    'Raydium CPMM': 0.0001,
    'Raydium AMM': 0.0001,
    'PumpAmm': 0.0001,
    'Pumpfun': 0.0001,
    'meteora dbc': 0.0001,
    'Meteora': 0.0001,
  };

  const minAmount = minimums[poolType] || 0.0001;

  if (amount < minAmount) {
    return {
      level: 'critical',
      title: 'Amount Too Small',
      message: `Minimum trade amount for ${poolType} is ${minAmount} SOL`,
      suggestion: `Increase your trade amount to at least ${minAmount} SOL`,
      canProceed: false,
    };
  }

  return null;
};

// Check for potential slippage issues with Pumpfun trades
export const checkPumpfunSlippage = (
  token: Token,
  tradeAmountSol: number,
  slippagePercent: number,
  poolType?: string // Add poolType parameter
): ValidationWarning | null => {
  // Check multiple sources for Pumpfun detection
  const tokenPoolType = (token as any).pool_type || (token as any).poolType || (token as any).pool?.type || '';
  const launchpadProtocol = (token as any).launchpad_protocol || (token as any).launchpadProtocol || '';
  const pairAddress = (token as any).pair_address || (token as any).pairAddress || '';

  // Detect Pumpfun by multiple indicators (prioritize explicit poolType parameter)
  const isPumpfun =
    (poolType && poolType.toLowerCase().includes('pump')) ||
    tokenPoolType.toLowerCase().includes('pump') ||
    launchpadProtocol.toLowerCase().includes('pump') ||
    pairAddress.length === 44; // Pumpfun uses bonding curve addresses (44 chars)

  console.log('[PreTransactionValidation] Pumpfun check:', {
    poolTypeParam: poolType,
    tokenPoolType,
    launchpadProtocol,
    pairAddress: pairAddress.substring(0, 8) + '...',
    isPumpfun,
    slippagePercent,
  });

  if (!isPumpfun) {
    return null; // Skip validation for non-Pumpfun tokens
  }

  // Check if token has a valid price
  const tokenPrice = (token as any).usd_price || (token as any).price_usd || 0;
  if (!tokenPrice || tokenPrice <= 0) {
    return {
      level: 'critical',
      title: 'Token Price Unknown',
      message: 'Cannot calculate expected output - token price unavailable',
      suggestion: 'Wait a moment for price data to load or try a different token',
      canProceed: false,
    };
  }

  // Check if slippage is too low for Pumpfun (bonding curve can have high slippage)
  // CRITICAL: Block trade if slippage is too low (prevents backend error)
  if (slippagePercent < 5) {
    return {
      level: 'critical',
      title: 'Slippage Too Low for Pumpfun',
      message: `${slippagePercent.toFixed(1)}% slippage is too low for Pumpfun bonding curves. Minimum recommended: 10%`,
      suggestion: 'Increase slippage to at least 10% in your preset settings',
      canProceed: false, // Block the trade
    };
  }

  // Warn if slippage is borderline (5-10%)
  if (slippagePercent >= 5 && slippagePercent < 10) {
    return {
      level: 'warning',
      title: 'Slippage May Be Low',
      message: `${slippagePercent.toFixed(1)}% slippage may still cause failures on Pumpfun. Recommended: 10-15%`,
      suggestion: 'Consider increasing slippage to 10-15% for more reliable trades',
      canProceed: true,
    };
  }

  // Check if trade size is too large relative to market cap (can cause excessive slippage)
  const marketCap = (token as any).market_cap || (token as any).marketCap || 0;
  if (marketCap > 0) {
    const tradeUsdValue = tradeAmountSol * 150; // Assume ~$150 per SOL
    const tradeToMarketCapRatio = (tradeUsdValue / marketCap) * 100;

    if (tradeToMarketCapRatio > 5) {
      return {
        level: 'warning',
        title: 'Large Trade Size',
        message: `This trade is ${tradeToMarketCapRatio.toFixed(1)}% of the token's market cap`,
        suggestion: 'Large trades on bonding curves can cause high slippage. Consider splitting into smaller trades or increasing slippage tolerance.',
        canProceed: true,
      };
    }
  }

  return null;
};

// Comprehensive pre-transaction check
export const performPreTransactionCheck = (
  token: Token,
  tradeAmount: number,
  solBalance: number,
  priorityFee: number,
  bribe: number,
  slippage: number,
  poolType: string,
  solPriceUsd: number = 150, // Default SOL price
  isSellOrder: boolean = false // Is this a sell order?
): PreTransactionCheck => {
  const warnings: ValidationWarning[] = [];

  // Token safety checks - REMOVED (too noisy)
  // warnings.push(...checkTokenSafety(token));

  // Balance check (different logic for buy vs sell)
  const balanceWarning = checkBalanceSufficiency(solBalance, tradeAmount, priorityFee, bribe, isSellOrder);
  if (balanceWarning) warnings.push(balanceWarning);

  // Minimum amount check (only for BUY - sell uses percentage)
  if (!isSellOrder) {
    const minAmountWarning = checkMinimumAmount(tradeAmount, poolType);
    if (minAmountWarning) warnings.push(minAmountWarning);
  }

  // Pumpfun slippage validation (only for BUY)
  if (!isSellOrder) {
    const pumpfunSlippageWarning = checkPumpfunSlippage(token, tradeAmount, slippage, poolType);
    if (pumpfunSlippageWarning) warnings.push(pumpfunSlippageWarning);
  }

  // REMOVED: Slippage estimation - was causing inaccurate warnings
  // Users know their slippage settings better than our estimates

  // Calculate estimated fees
  const networkFee = 0.00001;
  const estimatedFees = {
    priorityFee,
    bribe,
    networkFee,
    total: priorityFee + bribe + networkFee,
  };

  // Determine if we can proceed (no critical warnings)
  const canProceed = !warnings.some(w => w.level === 'critical');

  return {
    warnings,
    canProceed,
    estimatedSlippage: undefined,
    estimatedFees: undefined, // Not showing fee estimates either
  };
};
