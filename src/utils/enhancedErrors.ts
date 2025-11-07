import { ApiError } from './api';
import type { Token } from './db';

export interface EnhancedError {
  title: string;
  description: string;
  suggestions: string[];
  canRetry: boolean;
  retryWithAdjustments?: {
    increaseSlippage?: number;
    increasePriorityFee?: number;
    waitSeconds?: number;
  };
  actions?: Array<{
    label: string;
    action: 'retry' | 'increase_slippage' | 'switch_rpc' | 'view_explorer' | 'refresh_data';
  }>;
}

// Get network congestion level (mock for now, could be real data)
const getNetworkCongestion = (): 'low' | 'normal' | 'high' => {
  const hour = new Date().getHours();
  // Peak hours: 14:00-22:00 UTC (9am-5pm EST)
  if (hour >= 14 && hour <= 22) return 'high';
  if (hour >= 10 && hour <= 14) return 'normal';
  return 'low';
};

// Enhanced error messages with context
export const enhanceError = (
  error: Error | ApiError,
  context: {
    token?: Token;
    amount?: number;
    slippage?: number;
    priorityFee?: number;
    poolType?: string;
    mevMode?: string;
    rpcUrl?: string;
  }
): EnhancedError => {
  // Handle ApiError with specific codes
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'NO_ACTIVE_POOL':
        return {
          title: 'Pool Unavailable',
          description: `No active trading pool found for ${context.token?.symbol || 'this token'}`,
          suggestions: [
            'Token may not have launched yet or pool may be paused',
            'Try refreshing the page to get updated pool data',
            'Check if token has migrated to a different DEX',
          ],
          canRetry: true,
          actions: [
            { label: 'Refresh Data', action: 'refresh_data' },
            { label: 'Retry', action: 'retry' },
          ],
        };

      case 'INSUFFICIENT_BALANCE':
        return {
          title: 'Insufficient SOL Balance',
          description: 'You don\'t have enough SOL to complete this trade including fees',
          suggestions: [
            'Deposit more SOL to your wallet',
            'Try trading a smaller amount',
            `Reduce priority fee (currently ${context.priorityFee?.toFixed(4)} SOL)`,
          ],
          canRetry: false,
          actions: [],
        };

      case 'TX_FAILED':
        const congestion = getNetworkCongestion();
        return {
          title: 'Transaction Failed',
          description: `Transaction was rejected by the network. Current congestion: ${congestion.toUpperCase()}`,
          suggestions: [
            context.slippage && context.slippage < 3
              ? `Increase slippage to ${Math.max(3, context.slippage * 2)}%`
              : 'Slippage may be too low for this pool',
            congestion === 'high'
              ? `Increase priority fee to ${((context.priorityFee || 0.001) * 2).toFixed(4)} SOL`
              : 'Try again in a few seconds',
            'Check if pool has sufficient liquidity',
          ],
          canRetry: true,
          retryWithAdjustments: {
            increaseSlippage: context.slippage ? context.slippage * 1.5 : 3,
            increasePriorityFee: (context.priorityFee || 0.001) * 1.5,
            waitSeconds: 3,
          },
          actions: [
            { label: 'Retry with Adjustments', action: 'retry' },
            { label: 'Increase Slippage', action: 'increase_slippage' },
          ],
        };

      case 'NO_HOLDINGS':
        return {
          title: 'No Tokens to Sell',
          description: `You don't own any ${context.token?.symbol || 'tokens'} to sell`,
          suggestions: [
            'Check your portfolio to see your current holdings',
            'You may need to buy tokens before selling',
          ],
          canRetry: false,
          actions: [],
        };

      case 'AMOUNT_TOO_SMALL':
        const minAmount = 0.001; // Standard minimum for all pools
        return {
          title: 'Trade Amount Too Small',
          description: `Minimum trade amount is ${minAmount} SOL`,
          suggestions: [
            `Increase your trade amount to at least ${minAmount} SOL`,
            'Small trades may fail due to transaction fees exceeding trade value',
          ],
          canRetry: false,
          actions: [],
        };

      case 'POOL_UNAVAILABLE':
        return {
          title: 'Pool Has Insufficient Liquidity',
          description: context.token?.total_liquidity_usd
            ? `Pool liquidity: $${context.token.total_liquidity_usd.toFixed(2)}. Your trade may be too large.`
            : 'Pool does not have enough liquidity for this trade size',
          suggestions: [
            'Try trading a smaller amount',
            'Split your trade into multiple smaller trades',
            'Look for tokens with higher liquidity (>$5,000)',
          ],
          canRetry: true,
          actions: [{ label: 'Retry', action: 'retry' }],
        };

      case 'POOL_GRADUATED':
        return {
          title: 'Pool Migrated to New DEX',
          description: `This ${context.token?.launchpad_protocol || 'Pump.fun'} pool has graduated and moved to a different DEX`,
          suggestions: [
            'Token is now trading on Raydium or Meteora',
            'Refresh the page to get updated pool information',
            'Try again in 10-30 seconds while pool data updates',
          ],
          canRetry: true,
          retryWithAdjustments: {
            waitSeconds: 10,
          },
          actions: [
            { label: 'Refresh Data', action: 'refresh_data' },
            { label: 'Retry', action: 'retry' },
          ],
        };

      case 'INVALID_POOL_TYPE':
        return {
          title: 'Unsupported Pool Type',
          description: `Trading pool for ${context.token?.symbol || 'this token'} is not currently supported`,
          suggestions: [
            'Token may be on an unsupported DEX',
            'Try refreshing to get updated pool information',
            'Contact support if this persists',
          ],
          canRetry: true,
          actions: [{ label: 'Refresh Data', action: 'refresh_data' }],
        };

      case 'SERVICE_UNAVAILABLE':
        return {
          title: 'Trading Service Temporarily Unavailable',
          description: 'The trading backend is experiencing issues or maintenance',
          suggestions: [
            'Wait a few minutes and try again',
            'Try a different token',
            'Check status page for service updates',
          ],
          canRetry: true,
          retryWithAdjustments: {
            waitSeconds: 60,
          },
          actions: [{ label: 'Retry', action: 'retry' }],
        };

      case 'VALIDATION_ERROR':
        // Check if it's actually a balance error
        const errorMessage = error.message || '';
        if (errorMessage.toLowerCase().includes('insufficient') || 
            errorMessage.toLowerCase().includes('balance') ||
            errorMessage.toLowerCase().includes('not enough')) {
          return {
            title: 'Insufficient SOL Balance',
            description: errorMessage || 'You don\'t have enough SOL to complete this trade including fees',
            suggestions: [
              'Deposit more SOL to your wallet',
              'Try trading a smaller amount',
              context.priorityFee ? `Reduce priority fee (currently ${context.priorityFee.toFixed(4)} SOL)` : 'Lower your priority fee',
              'Check your bribe setting - it may be set too high',
            ],
            canRetry: false,
            actions: [],
          };
        }
        
        // Generic validation error
        return {
          title: 'Invalid Trade Parameters',
          description: errorMessage || 'Trade validation failed',
          suggestions: [
            'Check your trade amount is valid',
            'Ensure slippage is between 0.1% and 50%',
            'Verify all trading parameters are within acceptable ranges',
          ],
          canRetry: false,
          actions: [],
        };

      default:
        return {
          title: 'Trade Failed',
          description: error.message || 'An unexpected error occurred',
          suggestions: [
            'Try again in a few seconds',
            'Check your internet connection',
            'Contact support if problem persists',
          ],
          canRetry: true,
          actions: [{ label: 'Retry', action: 'retry' }],
        };
    }
  }

  // Handle generic errors
  const errorMsg = error.message || 'Unknown error';

  // Network/RPC errors
  if (errorMsg.includes('fetch failed') || errorMsg.includes('Failed to fetch')) {
    return {
      title: 'Network Connection Error',
      description: 'Could not connect to the trading service',
      suggestions: [
        'Check your internet connection',
        context.rpcUrl ? 'Try switching to default RPC endpoint' : 'RPC endpoint may be down',
        'Wait a few seconds and try again',
      ],
      canRetry: true,
      retryWithAdjustments: {
        waitSeconds: 5,
      },
      actions: [
        { label: 'Retry', action: 'retry' },
        ...(context.rpcUrl ? [{ label: 'Switch RPC', action: 'switch_rpc' as const }] : []),
      ],
    };
  }

  // Pool/account errors
  if (errorMsg.includes('Pool is completed') || errorMsg.includes('graduated')) {
    return {
      title: 'Pool Has Graduated',
      description: 'This pool has completed its bonding curve and migrated',
      suggestions: [
        'Token is now trading on a different pool',
        'Refresh to get updated pool information',
        'Try again in 10-30 seconds',
      ],
      canRetry: true,
      retryWithAdjustments: {
        waitSeconds: 10,
      },
      actions: [
        { label: 'Refresh Data', action: 'refresh_data' },
        { label: 'Retry', action: 'retry' },
      ],
    };
  }

  if (errorMsg.includes('TokenAccountNotFoundError') || errorMsg.includes('Pool account does not exist')) {
    return {
      title: 'Pool Not Found',
      description: 'The trading pool for this token could not be found',
      suggestions: [
        'Token may not have an active trading pool yet',
        'Pool data may be outdated - try refreshing',
        'Token may have migrated to a different pool',
      ],
      canRetry: true,
      actions: [
        { label: 'Refresh Data', action: 'refresh_data' },
        { label: 'Retry', action: 'retry' },
      ],
    };
  }

  // Slippage errors
  if (errorMsg.includes('slippage') || errorMsg.includes('Slippage')) {
    return {
      title: 'Slippage Tolerance Exceeded',
      description: 'Price moved more than your slippage tolerance allows',
      suggestions: [
        `Increase slippage to ${Math.max(3, (context.slippage || 1) * 2)}%`,
        'Wait a few seconds for price to stabilize',
        'Try trading a smaller amount',
      ],
      canRetry: true,
      retryWithAdjustments: {
        increaseSlippage: Math.max(3, (context.slippage || 1) * 2),
        waitSeconds: 3,
      },
      actions: [
        { label: 'Retry with Higher Slippage', action: 'increase_slippage' },
        { label: 'Retry', action: 'retry' },
      ],
    };
  }

  // MEV protection errors
  if (errorMsg.includes('MEV') || context.mevMode === 'on') {
    return {
      title: 'MEV Protected Transaction Failed',
      description: 'Protected validators rejected your transaction',
      suggestions: [
        'Try turning off MEV protection temporarily',
        'Increase priority fee to improve chances',
        'Wait and retry in a few seconds',
      ],
      canRetry: true,
      retryWithAdjustments: {
        increasePriorityFee: (context.priorityFee || 0.001) * 2,
        waitSeconds: 3,
      },
      actions: [
        { label: 'Retry', action: 'retry' },
      ],
    };
  }

  // Generic fallback
  return {
    title: 'Transaction Failed',
    description: errorMsg.length > 100 ? errorMsg.substring(0, 97) + '...' : errorMsg,
    suggestions: [
      'Try again in a few seconds',
      'Check if token has active trading pools',
      'Verify your settings and try a different token',
    ],
    canRetry: true,
    actions: [{ label: 'Retry', action: 'retry' }],
  };
};

