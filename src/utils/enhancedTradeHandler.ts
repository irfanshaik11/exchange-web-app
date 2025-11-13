import { tradeBuy, tradeSellPercentage, SOL_MINT_ADDRESS, ApiError } from './api';
import type { Token } from './db';
import { 
  showEnhancedToast, 
  updateEnhancedToast, 
  dismissToast,
  formatSol,
  getExplorerLink,
  type ToastAction 
} from './enhancedToast';
import { TransactionProgressTracker, transactionStages } from './transactionProgress';
import { 
  performPreTransactionCheck, 
  type ValidationWarning, 
  type PreTransactionCheck 
} from './preTransactionValidation';
import { enhanceError, type EnhancedError } from './enhancedErrors';
import type { QuickBuySettings } from '~/components/QuickBuyContext';
import { getPoolTypeFromToken } from './poolTypeDetection';

export interface EnhancedTradeParams {
  token: Token;
  amount: number;
  side: 'buy' | 'sell';
  settings: QuickBuySettings;
  user: { bearerToken: string; id: string | number };
  solBalance: number;
  solPriceUsd?: number;
  onSuccess?: (txHash: string, stats: TradeStats) => void;
  onError?: (error: EnhancedError) => void;
  onWarning?: (warnings: ValidationWarning[]) => void;
}

export interface TradeStats {
  txHash: string;
  tokenAmount?: string | number;
  tokenSymbol: string;
  spent?: number;
  received?: number;
  pricePerToken?: number;
  actualSlippage?: number;
  fees: {
    priorityFee: number;
    bribe: number;
    networkFee: number;
    total: number;
  };
}

// Main enhanced trade handler
export async function executeEnhancedTrade(params: EnhancedTradeParams): Promise<{
  success: boolean;
  txHash?: string;
  stats?: TradeStats;
  error?: EnhancedError;
}> {
  const {
    token,
    amount,
    side,
    settings,
    user,
    solBalance,
    solPriceUsd = 150,
    onSuccess,
    onError,
    onWarning,
  } = params;

  let toastId: string | null = null;
  let progressTracker: TransactionProgressTracker | null = null;

  try {
    // Step 1: Show toast IMMEDIATELY when user clicks (before validation)
    // This gives instant feedback that the action was registered
    toastId = showEnhancedToast('loading', 'Preparing transaction...', {
      title: `${side === 'buy' ? 'Buying' : 'Selling'} ${token.symbol}`,
      description: 'Validating parameters...',
    });

    // Step 2: Pre-transaction validation
    const poolType = getPoolTypeFromToken(token);
    const effectivePoolAddress = token.migrated_pool_address || token.pair_address;

    if (!effectivePoolAddress) {
      const error: EnhancedError = {
        title: 'Pool Address Missing',
        description: 'Trading pool not available for this token yet',
        suggestions: ['Try refreshing the page', 'Token may not have launched yet'],
        canRetry: false,
      };
      if (onError) onError(error);
      
      if (toastId) {
        updateEnhancedToast(toastId, 'error', error.description, {
          title: error.title,
          suggestions: error.suggestions,
        });
      } else {
        showEnhancedToast('error', error.description, {
          title: error.title,
          suggestions: error.suggestions,
        });
      }
      
      return { success: false, error };
    }

    // Update toast to show we're checking
    if (toastId) {
      updateEnhancedToast(toastId, 'loading', 'Checking balance and parameters...', {
        title: `${side === 'buy' ? 'Buying' : 'Selling'} ${token.symbol}`,
        description: 'Checking balance and parameters...',
      });
    }

    // Perform pre-transaction checks
    const preCheck: PreTransactionCheck = performPreTransactionCheck(
      token,
      amount,
      solBalance,
      settings.priority || 0.0001,
      settings.bribe || 0,
      (settings.maxSlippage || 0.4) * 100,
      poolType,
      solPriceUsd,
      side === 'sell' // Pass whether this is a sell order
    );

    // Show warnings if any
    if (preCheck.warnings.length > 0) {
      const criticalWarnings = preCheck.warnings.filter(w => w.level === 'critical');
      const otherWarnings = preCheck.warnings.filter(w => w.level !== 'critical');

      if (criticalWarnings.length > 0) {
        // Show critical warnings and stop
        criticalWarnings.forEach(warning => {
          if (toastId) {
            updateEnhancedToast(toastId, 'error', warning.message, {
              title: warning.title,
              suggestions: warning.suggestion ? [warning.suggestion] : [],
            });
          } else {
            showEnhancedToast('error', warning.message, {
              title: warning.title,
              suggestions: warning.suggestion ? [warning.suggestion] : [],
            });
          }
        });
        
        return { 
          success: false, 
          error: {
            title: criticalWarnings[0].title,
            description: criticalWarnings[0].message,
            suggestions: criticalWarnings.map(w => w.suggestion || '').filter(Boolean),
            canRetry: false,
          }
        };
      }

      // Show non-critical warnings as info
      if (otherWarnings.length > 0 && onWarning) {
        onWarning(otherWarnings);
        
        // Show first warning as toast
        const firstWarning = otherWarnings[0];
        if (toastId) {
          updateEnhancedToast(toastId, 'warning', firstWarning.message, {
            title: firstWarning.title,
            suggestions: firstWarning.suggestion ? [firstWarning.suggestion] : [],
          });
        } else {
          showEnhancedToast('warning', firstWarning.message, {
            title: firstWarning.title,
            suggestions: firstWarning.suggestion ? [firstWarning.suggestion] : [],
          });
        }
      }
    }

    // Step 3: Update toast to show we're submitting
    if (toastId) {
      updateEnhancedToast(toastId, 'loading', 'Submitting transaction to blockchain...', {
        title: `${side === 'buy' ? 'Buying' : 'Selling'} ${token.symbol}`,
        description: 'Submitting transaction to blockchain...',
      });
    }

    // Create progress tracker (but don't use artificial delays - update based on actual progress)
    progressTracker = new TransactionProgressTracker((stage) => {
      if (toastId) {
        updateEnhancedToast(toastId, 'loading', stage.message, {
          title: `${side === 'buy' ? 'Buying' : 'Selling'} ${token.symbol}`,
          description: stage.message,
        });
      }
    });

    // Update to submitting stage immediately (no artificial delays)
    progressTracker.setStage('submitting');

    // Step 4: Execute trade - NO RETRIES, NO PARAMETER ADJUSTMENTS
    // Users control their own settings, we just execute once
    const tradeParams: any = {
      poolAddress: effectivePoolAddress,
      baseMint: token.mint,
      quoteMint: SOL_MINT_ADDRESS,
      amount,
      mevProtection: (settings.mevMode === "off" ? 0 : 1) as 0 | 1,
      poolType,
      originalPairAddress: token.pair_address,
      slippage: (settings.maxSlippage || 0.4) * 100,
      priorityFee: settings.priority || 0.0001,
      bribe: settings.bribe || 0,
      mevMode: settings.mevMode,
      autoFee: settings.autoFee || false,
      maxFee: settings.maxFee || 0,
      rpc: settings.rpc,
      tokenName: token.name,
      tokenSymbol: token.symbol,
    };

    // Execute trade with timeout protection
    // Backend should return immediately (~300ms), but add timeout as safety
    const tradePromise = side === 'buy'
      ? tradeBuy(tradeParams, user.bearerToken)
      : tradeSellPercentage(
          {
            ...tradeParams,
            tokenAddress: token.mint,
            percentageToSell: amount,
          },
          user.bearerToken
        );

    // Add timeout check (30 seconds max - should never happen with new backend)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout - backend took too long to respond')), 30000);
    });

    const result = await Promise.race([tradePromise, timeoutPromise]);

    // Stop progress tracker immediately when we get the response
    if (progressTracker) {
      progressTracker.complete();
    }

    // Step 4: Handle success
    const resultAny = result as any; // Type assertion for runtime properties
    const txHash = resultAny?.hash || resultAny?.txid;
    
    // For BUY: tokenAmount is returned (may be 0 if pending)
    // For SELL: we sold a percentage, display the percentage not token amount
    const tokenAmount = resultAny?.amount || resultAny?.tokenAmount;
    const percentageSold = side === 'sell' ? amount : undefined;
    const isPending = resultAny?.pending === true; // Backend returned immediately, metadata still processing

    if (result && txHash) {
      const networkFee = 0.00001; // Reduced from 0.001
      const stats: TradeStats = {
        txHash,
        tokenAmount: side === 'buy' ? tokenAmount : percentageSold,
        tokenSymbol: token.symbol,
        spent: side === 'buy' ? amount : undefined,
        received: side === 'sell' ? resultAny.solReceived : tokenAmount,
        pricePerToken: token.usd_price,
        fees: {
          priorityFee: settings.priority || 0.0001,
          bribe: settings.bribe || 0,
          networkFee,
          total: (settings.priority || 0.0001) + (settings.bribe || 0) + networkFee,
        },
      };

      // Show success toast with stats
      if (toastId) {
        // Show success message - same for pending or confirmed
        const title = side === 'buy' 
          ? `Bought ${token.symbol}!`
          : `Sold ${token.symbol}!`;
        
        // Safely format price - ensure it's a number
        const priceStr = token.usd_price && typeof token.usd_price === 'number' 
          ? `$${token.usd_price.toFixed(6)}`
          : '$0';
          
        // Show transaction hash and amount spent
        const description = side === 'buy'
          ? `Spent: ${formatSol(amount)} SOL • Tx: ${txHash.substring(0, 8)}...${txHash.substring(txHash.length - 8)}`
          : `Tx: ${txHash.slice(0, 8)}...${txHash.substring(txHash.length - 8)}`;
        
        updateEnhancedToast(toastId, 'success', '', {
          title,
          description,
          showExplorerLink: true,
          txHash,
          duration: 6000, // 6s for success with explorer link (user might want to click)
        });
      }

      if (onSuccess) onSuccess(txHash, stats);
      
      return { success: true, txHash, stats };
    } else {
      throw new Error('No transaction hash returned');
    }

  } catch (error: any) {
    console.error('Enhanced trade error:', error);

    // Stop progress tracker
    if (progressTracker) progressTracker.fail();

    // Enhance error with context
    const enhancedError = enhanceError(error, {
      token,
      amount,
      slippage: (settings.maxSlippage || 0.4) * 100,
      priorityFee: settings.priority || 0.0001,
      poolType: getPoolTypeFromToken(token),
      mevMode: settings.mevMode,
      rpcUrl: settings.rpc,
    });

    // Show error toast with actions
    if (toastId) {
      const actions: ToastAction[] = [];
      
      // Add retry action if applicable
      if (enhancedError.canRetry) {
        actions.push({
          label: 'Retry',
          onClick: () => {
            dismissToast(toastId);
            // Re-execute trade with same parameters
            executeEnhancedTrade(params);
          },
          variant: 'primary',
        });
      }

      // On error: No transaction hash = no Solscan link
      // Only show explorer link for successful transactions
      updateEnhancedToast(toastId, 'error', enhancedError.description, {
        title: enhancedError.title,
        suggestions: enhancedError.suggestions,
        actions,
        showExplorerLink: false, // Explicitly don't show Solscan link for errors
        duration: 6000, // 6s for errors with actions/suggestions (needs time to read)
      });
    }

    if (onError) onError(enhancedError);

    return { success: false, error: enhancedError };
  } finally {
    if (progressTracker) progressTracker.clear();
  }
}

