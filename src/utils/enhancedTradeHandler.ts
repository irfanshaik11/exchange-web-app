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
import { Connection, PublicKey } from '@solana/web3.js';

// Helper function to get first valid string from multiple candidates
function getFirstString(...values: Array<unknown>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return undefined;
}

// Comprehensive pool address detection - checks all possible fields
function getEffectivePoolAddress(token: Token): string | undefined {
  // Get migrated pool address if available (highest priority)
  const migratedPoolAddress = getFirstString(
    (token as any).migrated_pool_address,
    (token as any).migratedPoolAddress,
    (token as any).migrated_poolAddress,
    (token as any).migrated_pool?.address,
    (token as any).migratedPool?.address,
    (token as any).target_pool_address,
    (token as any).targetPoolAddress,
  );

  // Get original pair address
  const originalPairAddress = getFirstString(
    token.pair_address,
    (token as any).pairAddress,
    (token as any).bondingCurveKey,
    (token as any).bonding_curve_key,
    (token as any).bonding_curve_address,
    (token as any).bondingCurve?.address,
    (token as any).bonding_curve?.address,
  );

  // Get fallback pool address
  const fallbackPoolAddress = getFirstString(
    (token as any).poolAddress,
    (token as any).pool_address,
    (token as any).amm_id,
    (token as any).ammId,
    typeof (token as any).pool === 'string' && (token as any).pool.length >= 32 ? (token as any).pool : undefined,
  );

  // Effective pool address (prioritize migrated, then original, then fallback)
  const effectivePoolAddress = getFirstString(
    migratedPoolAddress,
    originalPairAddress,
    fallbackPoolAddress,
  );

  return effectivePoolAddress;
}

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
    // Use comprehensive pool address detection
    let effectivePoolAddress = getEffectivePoolAddress(token);

    // CRITICAL FIX: If poolAddress equals token mint, it's not a valid pool address
    // This happens when frontend sends token mint as pool address
    if (effectivePoolAddress && effectivePoolAddress === token.mint) {
      console.warn('[EnhancedTrade] Pool address equals token mint - treating as missing. Backend will discover pool.', {
        tokenMint: token.mint,
        tokenSymbol: token.symbol,
        invalidPoolAddress: effectivePoolAddress,
      });
      effectivePoolAddress = undefined; // Trigger backend pool discovery
    }

    // If no pool address found, still allow the request to go through
    // The backend can discover pools using the token mint
    if (!effectivePoolAddress) {
      console.warn('[EnhancedTrade] No pool address found in token data, backend will attempt pool discovery', {
        tokenMint: token.mint,
        tokenSymbol: token.symbol,
        launchpad_protocol: (token as any).launchpad_protocol,
        availableFields: {
          migrated_pool_address: (token as any).migrated_pool_address,
          pair_address: token.pair_address,
          poolAddress: (token as any).poolAddress,
          pool_address: (token as any).pool_address,
        }
      });
      
      // Update toast to indicate we're discovering the pool
      if (toastId) {
        updateEnhancedToast(toastId, 'loading', 'Discovering trading pool...', {
          title: `${side === 'buy' ? 'Buying' : 'Selling'} ${token.symbol}`,
          description: 'Finding available trading pool...',
        });
      }
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
    // Note: If effectivePoolAddress is missing, backend will use pool discovery
    const tradeParams: any = {
      poolAddress: effectivePoolAddress || undefined, // Allow undefined - backend will discover
      baseMint: token.mint,
      quoteMint: SOL_MINT_ADDRESS,
      amount,
      mevProtection: (settings.mevMode === "off" ? 0 : 1) as 0 | 1,
      poolType: poolType || undefined, // Always send poolType if detected (helps backend with discovery)
      originalPairAddress: token.pair_address || undefined,
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
    
    // Check for errors even if txHash exists (transaction might be confirmed but failed on-chain)
    const errorMessage = resultAny?.error;
    if (errorMessage && errorMessage !== 'none' && errorMessage.trim().length > 0) {
      // Transaction was confirmed but failed on-chain (program error)
      console.error('[EnhancedTrade] Transaction confirmed but failed:', errorMessage);
      
      // Check for specific on-chain errors
      let enhancedError: EnhancedError;
      if (errorMessage.includes('6023') || errorMessage.includes('Not enough tokens to sell') || errorMessage.includes('not enough tokens')) {
        enhancedError = {
          title: 'Insufficient Token Balance',
          description: 'You don\'t have enough tokens to sell',
          suggestions: [
            'Check your token balance',
            'You may need to buy tokens before selling',
            'Try selling a smaller percentage',
          ],
          canRetry: false,
          actions: [],
        };
      } else if (errorMessage.includes('NotAuthorized') || errorMessage.includes('6000')) {
        enhancedError = {
          title: 'Transaction Authorization Failed',
          description: 'The transaction was not authorized. This may be a temporary issue.',
          suggestions: [
            'Try again in a few seconds',
            'Check if you have sufficient balance',
            'Verify your wallet connection',
          ],
          canRetry: true,
        };
      } else {
        // Generic on-chain error
        enhancedError = enhanceError(new ApiError(errorMessage, 'TX_FAILED'), {
          token,
          amount,
          slippage: (settings.maxSlippage || 0.4) * 100,
          priorityFee: settings.priority || 0.0001,
          poolType: getPoolTypeFromToken(token),
          mevMode: settings.mevMode,
          rpcUrl: settings.rpc,
        });
      }

      // Stop progress tracker
      if (progressTracker) progressTracker.fail();

      // Show error toast
      if (toastId) {
        const errorActions: ToastAction[] = enhancedError.canRetry ? [{ 
          label: 'Retry', 
          onClick: () => {
            dismissToast(toastId);
            // Re-execute trade with same parameters
            executeEnhancedTrade(params);
          }
        }] : [];
        
        updateEnhancedToast(toastId, 'error', enhancedError.description, {
          title: enhancedError.title,
          suggestions: enhancedError.suggestions,
          actions: errorActions,
          showExplorerLink: txHash ? true : false, // Show explorer link if txHash exists
          txHash: txHash || undefined,
          duration: 6000,
        });
      }

      if (onError) onError(enhancedError);
      
      return { success: false, error: enhancedError };
    }
    
    // For BUY: tokenAmount is returned (may be 0 if pending)
    // For SELL: we sold a percentage, display the percentage not token amount
    const tokenAmount = resultAny?.amount || resultAny?.tokenAmount;
    const percentageSold = side === 'sell' ? amount : undefined;
    const isPending = resultAny?.pending === true; // Backend returned immediately, metadata still processing

    if (result && txHash && (!errorMessage || errorMessage === 'none')) {
      // If transaction is pending, wait for confirmation and check if it succeeded
      if (isPending && txHash) {
        // Update toast to show we're waiting for confirmation
        if (toastId) {
          updateEnhancedToast(toastId, 'loading', 'Waiting for transaction confirmation...', {
            title: `${side === 'buy' ? 'Buying' : 'Selling'} ${token.symbol}`,
            description: 'Checking transaction status...',
          });
        }

        // Wait for confirmation and check transaction status
        try {
          // Get RPC endpoint from environment or use default
          const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
          const connection = new Connection(rpcUrl, 'confirmed');

          // Wait for confirmation (max 30 seconds)
          const confirmationStatus = await Promise.race([
            connection.confirmTransaction(txHash, 'confirmed'),
            new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Transaction confirmation timeout')), 30000);
            }),
          ]) as any;

          // Check transaction status
          const txStatus = await connection.getTransaction(txHash, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
          });

          // If transaction has an error, show error toast
          if (txStatus?.meta?.err) {
            const txError = txStatus.meta.err;
            const errorStr = typeof txError === 'object' ? JSON.stringify(txError) : String(txError);
            
            console.error('[EnhancedTrade] Transaction confirmed but failed:', errorStr);

            let enhancedError: EnhancedError;
            if (errorStr.includes('6023') || errorStr.includes('Not enough tokens to sell') || errorStr.includes('not enough tokens')) {
              enhancedError = {
                title: 'Insufficient Token Balance',
                description: 'You don\'t have enough tokens to sell',
                suggestions: [
                  'Check your token balance',
                  'You may need to buy tokens before selling',
                  'Try selling a smaller percentage',
                ],
                canRetry: false,
                actions: [],
              };
            } else if (errorStr.includes('NotAuthorized') || errorStr.includes('6000')) {
              enhancedError = {
                title: 'Transaction Authorization Failed',
                description: 'The transaction was not authorized. This may be a temporary issue.',
                suggestions: [
                  'Try again in a few seconds',
                  'Check if you have sufficient balance',
                  'Verify your wallet connection',
                ],
                canRetry: true,
              };
            } else {
              // Generic on-chain error
              enhancedError = enhanceError(new ApiError(`Transaction failed: ${errorStr}`, 'TX_FAILED'), {
                token,
                amount,
                slippage: (settings.maxSlippage || 0.4) * 100,
                priorityFee: settings.priority || 0.0001,
                poolType: getPoolTypeFromToken(token),
                mevMode: settings.mevMode,
                rpcUrl: settings.rpc,
              });
            }

            // Stop progress tracker
            if (progressTracker) progressTracker.fail();

            // Show error toast
            if (toastId) {
              updateEnhancedToast(toastId, 'error', enhancedError.description, {
                title: enhancedError.title,
                suggestions: enhancedError.suggestions,
                actions: enhancedError.canRetry ? [{ 
                  label: 'Retry', 
                  onClick: () => {
                    dismissToast(toastId);
                    // Re-execute trade with same parameters
                    executeEnhancedTrade(params);
                  }
                }] : [],
                showExplorerLink: true,
                txHash,
                duration: 6000,
              });
            }

            if (onError) onError(enhancedError);
            
            return { success: false, error: enhancedError };
          }

          // Transaction succeeded - continue with success flow
        } catch (confirmationError: any) {
          // Confirmation check failed or timed out - still show success but with warning
          console.warn('[EnhancedTrade] Could not confirm transaction status:', confirmationError);
          // Continue with success flow (transaction was sent, backend will process)
        }
      }

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

