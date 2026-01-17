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
import { calculateDynamicPriorityFee } from './dynamicFees';
import { TransactionProgressTracker, transactionStages } from './transactionProgress';
import {
  performPreTransactionCheck,
  checkBalanceSufficiency,
  type ValidationWarning,
  type PreTransactionCheck
} from './preTransactionValidation';
import { enhanceError, type EnhancedError } from './enhancedErrors';
import type { QuickBuySettings } from '~/components/QuickBuyContext';
import { getPoolTypeFromToken } from './poolTypeDetection';
import { Connection, PublicKey } from '@solana/web3.js';
import toast from 'react-hot-toast';
import { extractTokenImage } from './images';
import { fetchVerifiedPairAddress } from '~/hooks/useSingleTokenPolling';

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

type WalletAllocation = {
  walletId?: string;
  amount: number;
  address?: string;
  balance: number;
};

const getAddressForChain = (
  wallet: { solanaAddress?: string | null; ethereumAddress?: string | null; address?: string | null },
  chain: 'sol' | 'monad'
) => {
  if (chain === 'monad') {
    return wallet.ethereumAddress || wallet.address || undefined;
  }
  return wallet.solanaAddress || wallet.address || undefined;
};

export interface EnhancedTradeParams {
  token: Token;
  amount: number;
  side: 'buy' | 'sell';
  settings: QuickBuySettings;
  user: { bearerToken: string; id: string | number };
  solBalance: number;
  solPriceUsd?: number;
  walletContext?: {
    selectedWalletIds: string[];
    walletList: Array<{
      id: string;
      solanaAddress?: string | null;
      ethereumAddress?: string | null;
      address?: string | null;
      balance?: number;
      isPrimary?: boolean;
      isArchived?: boolean;
    }>;
    walletBalances: Record<string, number>;
    chain?: 'sol' | 'monad';
  };
  onSuccess?: (txHash: string, stats: TradeStats) => void;
  onError?: (error: EnhancedError) => void;
  onWarning?: (warnings: ValidationWarning[]) => void;
  refreshBalance?: (opts?: { chain?: string; address?: string; force?: boolean }) => Promise<{ balance: number; usdBalance: number } | null>;
}

export interface TradeStats {
  txHash: string;
  txHashes?: string[];
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
  walletsUsed?: {
    used: number;
    total: number;
    allocations: Array<{ walletId?: string; amount: number; txHash?: string }>;
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
    refreshBalance,
  } = params;

  let toastId: string | null = null;
  let progressTracker: TransactionProgressTracker | null = null;
  const chain = params.walletContext?.chain || "sol";

  // Calculate dynamic priority fee early - used in validation and execution
  // Fee scales with trade size and considers token age for competitive scenarios
  const dynamicPriorityFee = calculateDynamicPriorityFee({
    tradeAmount: amount,
    tokenCreatedAt: token.created_at,
    userPriorityFee: settings.priority,
    isUserOverride: settings.priority !== undefined && settings.priority > 0.0001,
  });

  // Build wallet allocations for Solana trades (equal split across selected wallets)
  let walletAllocations: WalletAllocation[] = [];
  let walletsConsidered = 0;
  if (side === "buy" && chain === "sol" && params.walletContext) {
    console.log('[EnhancedTradeHandler] Wallet context:', {
      selectedWalletIds: params.walletContext.selectedWalletIds,
      walletListCount: params.walletContext.walletList?.length,
      walletBalancesKeys: Object.keys(params.walletContext.walletBalances || {}),
      walletBalances: params.walletContext.walletBalances,
    });

    const availableWallets =
      params.walletContext.walletList?.filter(
        (w) => !w.isArchived && (w.solanaAddress || w.address)
      ) || [];

    const selectedIds = params.walletContext.selectedWalletIds || [];
    const selectionSet = new Set(selectedIds);
    const primaryId =
      availableWallets.find((w) => w.isPrimary)?.id ||
      availableWallets[0]?.id;

    console.log('[EnhancedTradeHandler] Wallet selection:', {
      availableWalletsCount: availableWallets.length,
      selectedIds,
      primaryId,
    });

    const idsToUse =
      selectionSet.size > 0
        ? selectionSet
        : primaryId
        ? new Set([primaryId])
        : new Set<string>();

    const chosenWallets = availableWallets.filter((w) => idsToUse.has(w.id));
    walletsConsidered = idsToUse.size || chosenWallets.length;

    if (chosenWallets.length > 0) {
      let workingWallets = [...chosenWallets];
      let allocations: WalletAllocation[] = [];

      while (workingWallets.length > 0) {
        const perWalletAmount = amount / workingWallets.length;

        allocations = workingWallets
          .map((wallet) => {
            const address = getAddressForChain(wallet, "sol");
            const addressKey = address?.trim();
            const balance = addressKey
              ? params.walletContext!.walletBalances[addressKey] ?? wallet.balance ?? 0
              : wallet.balance ?? 0;

            console.log('[EnhancedTradeHandler] Checking wallet:', {
              walletId: wallet.id,
              address,
              balanceFromContext: balance,
              allBalanceKeys: Object.keys(params.walletContext!.walletBalances || {}),
            });

            const balanceWarning = checkBalanceSufficiency(
              balance,
              perWalletAmount,
              dynamicPriorityFee,
              settings.bribe || 0,
              false,
              0.0001
            );

            if (balanceWarning && !balanceWarning.canProceed) {
              console.log('[EnhancedTradeHandler] Wallet filtered out due to insufficient balance:', {
                walletId: wallet.id,
                balance,
                required: perWalletAmount,
                warning: balanceWarning.message,
              });
              return null;
            }

            return {
              walletId: wallet.id,
              amount: perWalletAmount,
              address: address || undefined,
              balance,
            };
          })
          .filter(Boolean) as WalletAllocation[];

        if (allocations.length === workingWallets.length) {
          break;
        }

        if (allocations.length === 0) {
          break;
        }

        const allowedIds = new Set(allocations.map((a) => a.walletId));
        workingWallets = workingWallets.filter((w) => allowedIds.has(w.id));
      }

      walletAllocations = allocations;
    }

    // Fallback to first wallet if nothing is selected or all were filtered out
    if (walletAllocations.length === 0 && availableWallets.length > 0) {
      const fallback = availableWallets[0];
      const address = getAddressForChain(fallback, "sol");
      const addressKey = address?.trim();
      const balance = addressKey
        ? params.walletContext.walletBalances[addressKey] ?? fallback.balance ?? 0
        : fallback.balance ?? 0;
      walletAllocations = [
        {
          walletId: fallback.id,
          amount,
          address: address || undefined,
          balance,
        },
      ];
      walletsConsidered = 1;
    }
  }

  const validationBalance = walletAllocations.length
    ? walletAllocations.reduce((sum, w) => sum + (w.balance || 0), 0)
    : solBalance;

  console.log('[EnhancedTradeHandler] Balance check:', {
    solBalance,
    walletAllocationsCount: walletAllocations.length,
    validationBalance,
    walletAllocations: walletAllocations.map(w => ({
      walletId: w.walletId,
      address: w.address?.substring(0, 8) + '...',
      balance: w.balance
    })),
  });

  // Declare timerInterval outside try block so it's accessible in catch/finally
  let timerInterval: NodeJS.Timeout | null = null;

  try {
    // Step 1: Pre-transaction validation (NO TOAST YET - show only after backend confirms trade)
    // This prevents showing "Placing trade..." when the backend might reject it due to slippage or other errors
    const poolType = getPoolTypeFromToken(token);
    // Use comprehensive pool address detection
    let effectivePoolAddress = getEffectivePoolAddress(token);

    // CRITICAL: Verify the pair address from the token service
    // This ensures we use the correct/up-to-date pool address for trades
    if (token.mint) {
      console.log(`[EnhancedTrade] Verifying pair address for ${token.symbol}: ${token.mint}`);
      const verifiedPairAddress = await fetchVerifiedPairAddress(token.mint);
      if (verifiedPairAddress) {
        if (verifiedPairAddress !== effectivePoolAddress) {
          console.log(`[EnhancedTrade] Pair address mismatch! Local: ${effectivePoolAddress}, Verified: ${verifiedPairAddress}`);
        }
        effectivePoolAddress = verifiedPairAddress;
      }
    }

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
    }

    // Perform pre-transaction checks
    console.log('[EnhancedTradeHandler] Running pre-transaction validation:', {
      tokenSymbol: token.symbol,
      amount,
      slippage: (settings.maxSlippage || 0.4) * 100,
      poolType,
      side,
    });

    const preCheck: PreTransactionCheck = performPreTransactionCheck(
      token,
      amount,
      validationBalance,
      dynamicPriorityFee,
      settings.bribe || 0,
      (settings.maxSlippage || 0.4) * 100,
      poolType,
      solPriceUsd,
      side === 'sell' // Pass whether this is a sell order
    );

    console.log('[EnhancedTradeHandler] Validation result:', {
      warnings: preCheck.warnings.length,
      canProceed: preCheck.canProceed,
      warningDetails: preCheck.warnings.map(w => ({ level: w.level, title: w.title })),
    });

    // Handle validation warnings
    if (preCheck.warnings.length > 0) {
      const criticalWarnings = preCheck.warnings.filter(w => w.level === 'critical');
      const otherWarnings = preCheck.warnings.filter(w => w.level !== 'critical');

      if (criticalWarnings.length > 0) {
        // Show critical warnings and STOP (no toast shown yet since validation failed)
        showEnhancedToast('error', criticalWarnings[0].message, {
          title: criticalWarnings[0].title,
          suggestions: criticalWarnings[0].suggestion ? [criticalWarnings[0].suggestion] : [],
          duration: 6000,
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

      // Show non-critical warnings as info (but allow trade to continue)
      if (otherWarnings.length > 0) {
        if (onWarning) onWarning(otherWarnings);

        // Show first warning as toast
        const firstWarning = otherWarnings[0];
        showEnhancedToast('warning', firstWarning.message, {
          title: firstWarning.title,
          suggestions: firstWarning.suggestion ? [firstWarning.suggestion] : [],
          duration: 5000,
        });
      }
    }

    // Step 2: Show Monad-style toast after validation passes - trade is being submitted
    // Generate random timer cap (0.40-0.60s)
    const timerCap = 0.40 + Math.random() * 0.20;
    const uniqueToastId = `solana-trade-${Date.now()}-${Math.random()}`;
    const startTime = Date.now();
    let timerFinished = false;

    // Get token image and wallet info for toast
    const tokenImage = extractTokenImage(token);
    const tokenName = token?.symbol || token?.name || 'Token';
    const walletsWithBalance = walletAllocations.length || 1;
    const totalWallets = walletsConsidered || 1;
    const isMultiWallet = walletsWithBalance > 1;

    // Show animated toast with timer (Monad-style)
    toast.custom(
      (t) => (
        <div className="flex items-center gap-3 bg-[#1a1a1a] text-white border border-white/10 rounded-lg px-4 py-3">
          {tokenImage && (
            <img
              src={tokenImage}
              alt={tokenName}
              className="w-6 h-6 rounded-full flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-sm text-neutral-200 truncate">
              {side === 'buy' ? 'Buying' : 'Selling'} {tokenName}
            </span>
            <span
              id={`timer-${uniqueToastId}`}
              className="text-xs text-neutral-400 flex-shrink-0"
            >
              (0.00s)
            </span>
            <span
              id={`check-${uniqueToastId}`}
              className="text-green-400 flex-shrink-0"
              style={{ display: 'none' }}
            >
              ✓
            </span>
            <span
              id={`link-${uniqueToastId}`}
              className="flex-shrink-0"
              style={{ display: 'inline-flex' }}
            >
              {/* Default Solana avatar (becomes clickable once tx hash arrives) */}
              <img
                src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4"
                alt="Solana"
                className="w-4 h-4 rounded-full opacity-70"
                style={{ cursor: 'default' }}
              />
            </span>
          </div>
        </div>
      ),
      {
        id: uniqueToastId,
        duration: Infinity,
      }
    );

    toastId = uniqueToastId;

    // Smooth timer animation using rAF to avoid jitter
    const tick = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const displayTime = Math.min(elapsed, timerCap).toFixed(2);
      const timerEl = document.getElementById(`timer-${uniqueToastId}`);
      if (timerEl) {
        timerEl.textContent = `(${displayTime}s)`;
      }

      if (!timerFinished && elapsed >= timerCap) {
        timerFinished = true;
        const checkEl = document.getElementById(`check-${uniqueToastId}`);
        if (checkEl) {
          checkEl.style.display = 'block';
        }
        const linkEl = document.getElementById(`link-${uniqueToastId}`);
        if (linkEl) {
          if (isMultiWallet) {
            linkEl.textContent = `${walletsWithBalance}/${totalWallets}`;
            linkEl.className = 'text-xs text-blue-400 font-medium flex-shrink-0';
          } else {
            linkEl.className = 'flex-shrink-0';
          }
        }
        timerInterval = null;
        return;
      }

      timerInterval = requestAnimationFrame(tick) as any;
    };
    timerInterval = requestAnimationFrame(tick) as any;

    // Create progress tracker (but don't use artificial delays - update based on actual progress)
    progressTracker = new TransactionProgressTracker((stage) => {
      // Progress tracking doesn't update the toast anymore - toast is timer-based
    });

    // Update to submitting stage immediately (no artificial delays)
    progressTracker.setStage('submitting');

    // Step 4: Execute trade - support multi-wallet (equal split) for Solana buys
    // Note: If effectivePoolAddress is missing, backend will use pool discovery
    const baseTradeParams: any = {
      poolAddress: effectivePoolAddress || undefined, // Allow undefined - backend will discover
      baseMint: token.mint,
      quoteMint: SOL_MINT_ADDRESS,
      amount,
      mevProtection: (settings.mevMode === "off" ? 0 : 1) as 0 | 1,
      poolType: poolType || undefined, // Always send poolType if detected (helps backend with discovery)
      originalPairAddress: token.pair_address || undefined,
      slippage: (settings.maxSlippage || 0.4) * 100,
      priorityFee: dynamicPriorityFee,
      bribe: settings.bribe || 0,
      mevMode: settings.mevMode,
      autoFee: settings.autoFee || false,
      maxFee: settings.maxFee || 0,
      rpc: settings.rpc,
      tokenName: token.name,
      tokenSymbol: token.symbol,
    };

    const allocationsToUse: WalletAllocation[] =
      side === "buy" && walletAllocations.length > 0
        ? walletAllocations
        : [{ walletId: undefined, amount, balance: validationBalance }];

    const walletResults: Array<{ allocation: WalletAllocation; result: any }> = [];

    const executeSingleTrade = async (
      allocation: WalletAllocation,
      index: number,
      total: number
    ) => {
      if (toastId) {
        updateEnhancedToast(
          toastId,
          "loading",
          `Submitting ${index + 1}/${total}...`,
          {
            title: `${side === "buy" ? "Buying" : "Selling"} ${token.symbol}`,
            description: `Using wallet ${index + 1} of ${total}`,
          }
        );
      }

      const paramsForWallet =
        side === "buy"
          ? { ...baseTradeParams, amount: allocation.amount, walletId: allocation.walletId }
          : {
              ...baseTradeParams,
              tokenAddress: token.mint,
              percentageToSell: amount,
            };

      const tradePromise =
        side === "buy"
          ? tradeBuy(paramsForWallet, user.bearerToken)
          : tradeSellPercentage(paramsForWallet, user.bearerToken);

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(
                "Request timeout - backend took too long to respond"
              )
            ),
          30000
        );
      });

      return Promise.race([tradePromise, timeoutPromise]);
    };

    let lastError: any = null;

    for (let i = 0; i < allocationsToUse.length; i++) {
      const allocation = allocationsToUse[i];
      try {
        const result = await executeSingleTrade(
          allocation,
          i,
          allocationsToUse.length
        );
        walletResults.push({ allocation, result });
      } catch (err) {
        lastError = err;
        walletResults.push({ allocation, result: null });
        break;
      }
    }

    // Stop progress tracker immediately when we get the response
    if (progressTracker) {
      progressTracker.complete();
    }

    if (lastError) {
      throw lastError;
    }

    // Step 4: Handle success
    const resultAny = walletResults[0]?.result as any; // Type assertion for runtime properties
    const txHash = resultAny?.hash || resultAny?.txid;
    const txHashes = walletResults
      .map((wr) => (wr.result as any)?.hash || (wr.result as any)?.txid)
      .filter(Boolean);
    
    // Check for errors across wallet executions (transaction might be confirmed but failed on-chain)
    const failedResult = walletResults.find((wr) => {
      const resAny = wr.result as any;
      const err = resAny?.error;
      const tx = resAny?.hash || resAny?.txid;
      return !resAny || (!tx && err) || (err && err !== "none" && err.trim().length > 0);
    });

    if (failedResult) {
      const errorMessage =
        (failedResult.result as any)?.error || "Transaction failed";
      console.error(
        "[EnhancedTrade] Transaction failed:",
        errorMessage,
        "wallet:",
        failedResult.allocation.walletId
      );
      
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
          priorityFee: dynamicPriorityFee,
          poolType: getPoolTypeFromToken(token),
          mevMode: settings.mevMode,
          rpcUrl: settings.rpc,
        });
      }

      // Stop timer
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }

      // Stop progress tracker
      if (progressTracker) progressTracker.fail();

      // Dismiss the timer toast
      if (toastId) {
        toast.dismiss(toastId);
        toastId = null;
      }

      // Show error toast
      const errorActions: ToastAction[] = enhancedError.canRetry ? [{
        label: 'Retry',
        onClick: () => {
          // Re-execute trade with same parameters
          executeEnhancedTrade(params);
        },
        variant: 'primary',
      }] : [];

      showEnhancedToast('error', enhancedError.description, {
        title: enhancedError.title,
        suggestions: enhancedError.suggestions,
        actions: errorActions,
        showExplorerLink: txHash ? true : false, // Show explorer link if txHash exists
        txHash: txHash || undefined,
        duration: 6000,
      });

      if (onError) onError(enhancedError);

      return { success: false, error: enhancedError };
    }
    
    // For BUY: tokenAmount is returned (may be 0 if pending)
    // For SELL: we sold a percentage, display the percentage not token amount
    const tokenAmount = resultAny?.amount || resultAny?.tokenAmount;
    const percentageSold = side === 'sell' ? amount : undefined;
    const isPending = resultAny?.pending === true; // Backend returned immediately, metadata still processing

    const walletsUsedSummary = {
      used: walletResults.length,
      total: walletsConsidered || allocationsToUse.length || walletResults.length || 1,
      allocations: walletResults.map((wr) => ({
        walletId: wr.allocation.walletId,
        amount: wr.allocation.amount,
        txHash: (wr.result as any)?.hash || (wr.result as any)?.txid,
      })),
    };

    if (walletResults.length > 0 && txHash && (!failedResult || failedResult === undefined)) {
      const networkFee = 0.00001; // Reduced from 0.001
      const stats: TradeStats = {
        txHash,
        txHashes,
        tokenAmount: side === 'buy' ? tokenAmount : percentageSold,
        tokenSymbol: token.symbol,
        spent: side === 'buy' ? amount : undefined,
        received: side === 'sell' ? resultAny.solReceived : tokenAmount,
        pricePerToken: token.usd_price,
        fees: {
          priorityFee: dynamicPriorityFee,
          bribe: settings.bribe || 0,
          networkFee,
          total: dynamicPriorityFee + (settings.bribe || 0) + networkFee,
        },
        walletsUsed: walletsUsedSummary,
      };

      // Update toast with Solscan logo (Monad-style completion)
      const hasMultipleWallets = (walletsUsedSummary.used || 0) > 1;

      if (toastId && !hasMultipleWallets && txHash) {
        // Stop timer
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }

        // For single wallet: Update the link element with clickable Solscan logo
        const linkEl = document.getElementById(`link-${toastId}`);
        if (linkEl) {
          const explorerUrl = getExplorerLink(txHash);
          linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4" alt="Solscan" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
        }

        // Auto-dismiss after 10s
        setTimeout(() => {
          toast.dismiss(toastId);
        }, 10000);
      } else if (toastId && hasMultipleWallets) {
        // For multi-wallet, wallet count is already shown, just clean up timer
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }

        // Auto-dismiss after 10s
        setTimeout(() => {
          toast.dismiss(toastId);
        }, 10000);
      }

      // Refresh balance immediately after successful trade (with small delay for on-chain confirmation)
      if (refreshBalance) {
        setTimeout(() => {
          refreshBalance({ chain: "sol", force: true }).catch((err) => {
            console.warn('[EnhancedTrade] Failed to refresh balance:', err);
          });
        }, 500);
      }
      
      if (onSuccess) onSuccess(txHash, stats);
      
      if (isPending && txHash) {
        void monitorPendingConfirmation({
          txHash,
          token,
          amount,
          side,
          settings,
          toastId,
          params,
          onError,
        });
      }
      
      return { success: true, txHash, stats };
    } else {
      throw new Error('No transaction hash returned');
    }

  } catch (error: any) {
    console.error('Enhanced trade error:', error);

    // Stop timer
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    // Stop progress tracker
    if (progressTracker) progressTracker.fail();

    // Enhance error with context
    let enhancedError = enhanceError(error, {
      token,
      amount,
      slippage: (settings.maxSlippage || 0.4) * 100,
      priorityFee: dynamicPriorityFee,
      poolType: getPoolTypeFromToken(token),
      mevMode: settings.mevMode,
      rpcUrl: settings.rpc,
    });

    // Friendly message for pool discovery failures (no tx sent)
    const poolErrorText = (error?.message || '').toLowerCase();
    const poolErrorCode = (error as any)?.code || (error as any)?.status;
    if (
      poolErrorText.includes('pool discovery failed') ||
      poolErrorText.includes('pool address is required') ||
      poolErrorText.includes('no pools found') ||
      poolErrorCode === 'POOL_UNAVAILABLE'
    ) {
      enhancedError = {
        title: 'Pool Not Found',
        description: 'No active pool could be found for this token. The trade was not sent.',
        suggestions: [
          'Try again in a few seconds',
          'Verify the token has an active pool',
          'If newly launched, wait for the pool to appear on-chain',
        ],
        canRetry: false,
        actions: [],
      };
    }

    // Dismiss the timer toast and show error toast
    if (toastId) {
      toast.dismiss(toastId);
      toastId = null;
    }

    const actions: ToastAction[] = [];

    // Add retry action if applicable
    if (enhancedError.canRetry) {
      actions.push({
        label: 'Retry',
        onClick: () => {
          // Re-execute trade with same parameters
          executeEnhancedTrade(params);
        },
        variant: 'primary',
      });
    }

    // Show error toast with actions
    showEnhancedToast('error', enhancedError.description, {
      title: enhancedError.title,
      suggestions: enhancedError.suggestions,
      actions,
      showExplorerLink: false, // Explicitly don't show Solscan link for errors
      duration: 6000, // 6s for errors with actions/suggestions (needs time to read)
    });

    if (onError) onError(enhancedError);

    return { success: false, error: enhancedError };
  } finally {
    // Clean up timer if still running
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    if (progressTracker) progressTracker.clear();
  }
}

async function monitorPendingConfirmation({
  txHash,
  token,
  amount,
  side,
  settings,
  toastId,
  params,
  onError,
}: {
  txHash: string;
  token: Token;
  amount: number;
  side: 'buy' | 'sell';
  settings: QuickBuySettings;
  toastId: string | null;
  params: EnhancedTradeParams;
  onError?: (error: EnhancedError) => void;
}) {
  // Calculate dynamic priority fee for error context
  const dynamicPriorityFee = calculateDynamicPriorityFee({
    tradeAmount: amount,
    tokenCreatedAt: token.created_at,
    userPriorityFee: settings.priority,
    isUserOverride: settings.priority !== undefined && settings.priority > 0.0001,
  });

  try {
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    await Promise.race([
      connection.confirmTransaction(txHash, 'confirmed'),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Transaction confirmation timeout')), 30000);
      }),
    ]);

    const txStatus = await connection.getTransaction(txHash, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

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
        enhancedError = enhanceError(new ApiError(`Transaction failed: ${errorStr}`, 'TX_FAILED'), {
          token,
          amount,
          slippage: (settings.maxSlippage || 0.4) * 100,
          priorityFee: dynamicPriorityFee,
          poolType: getPoolTypeFromToken(token),
          mevMode: settings.mevMode,
          rpcUrl: settings.rpc,
        });
      }

      if (toastId) {
        updateEnhancedToast(toastId, 'error', enhancedError.description, {
          title: enhancedError.title,
          suggestions: enhancedError.suggestions,
          actions: enhancedError.canRetry ? [{
            label: 'Retry',
            onClick: () => {
              if (toastId) {
                dismissToast(toastId);
              }
              executeEnhancedTrade(params);
            }
          }] : [],
          showExplorerLink: true,
          txHash,
          duration: 6000,
        });
      }

      if (onError) onError(enhancedError);
      return;
    }

    if (toastId) {
      updateEnhancedToast(toastId, 'success', '', {
        title: `${side === 'buy' ? 'Bought' : 'Sold'} ${token.symbol}!`,
        description: `Confirmed: Tx ${txHash.substring(0, 8)}...${txHash.substring(txHash.length - 8)}`,
        showExplorerLink: true,
        txHash,
        duration: 6000,
      });
    }
  } catch (confirmationError) {
    console.warn('[EnhancedTrade] Could not confirm transaction status:', confirmationError);
    // Leave existing toast message as-is; backend background job will update history when ready.
  }
}
