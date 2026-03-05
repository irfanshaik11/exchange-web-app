import { tradeMonadBuy } from "./api";
import { normalizeMonadAddress } from "./normalizeMonadAddress";
import { broadcastTradeCompleted } from "./tradeEvents";

type WalletListItem = {
  id: string;
  solanaAddress?: string | null;
  ethereumAddress?: string | null;
  address?: string | null;
  isPrimary?: boolean;
  isArchived?: boolean;
};

export type MonadWalletAllocation = {
  walletId?: string;
  amount: number;
  address?: string;
  balance: number;
};

type AllocationInput = {
  amount: number;
  walletList?: WalletListItem[];
  walletBalances?: Record<string, number>;
  selectedWalletIds?: string[];
};

const getMonadAddress = (wallet: WalletListItem): string | undefined => {
  const address =
    wallet.ethereumAddress ||
    wallet.address ||
    wallet.solanaAddress ||
    undefined;
  return address ? normalizeMonadAddress(address) : undefined;
};

function clampToDecimals(value: number | string, decimals: number = 18): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  return num.toFixed(decimals).replace(/\.?0+$/, "");
}

const getBalanceForAddress = (
  address: string | undefined,
  walletBalances: Record<string, number>
): number => {
  if (!address) return 0;
  const lower = address.toLowerCase();
  return (
    walletBalances[address] ??
    walletBalances[lower] ??
    walletBalances[address.toUpperCase()] ??
    0
  );
};

/**
 * Build equal-split allocations for Monad trades based on the selected wallets.
 * Falls back to the primary wallet (or first available) if nothing is selected.
 */
export function buildMonadWalletAllocations({
  amount,
  walletList = [],
  walletBalances = {},
  selectedWalletIds = [],
}: AllocationInput): { allocations: MonadWalletAllocation[]; total: number } {
  const amountValue = Math.max(Number(amount) || 0, 0);
  const availableWallets =
    walletList?.filter((w) => !w.isArchived && getMonadAddress(w)) || [];

  const selectionSet = new Set(selectedWalletIds.filter(Boolean));
  const primaryId =
    availableWallets.find((w) => w.isPrimary)?.id || availableWallets[0]?.id;

  const idsToUse =
    selectionSet.size > 0
      ? selectionSet
      : primaryId
      ? new Set([primaryId])
      : new Set<string>();

  let walletsConsidered =
    idsToUse.size || (availableWallets.length > 0 ? 1 : 0);
  let chosenWallets =
    availableWallets.filter((w) => idsToUse.has(w.id)) ||
    (primaryId
      ? availableWallets.filter((w) => w.id === primaryId)
      : []);

  if (chosenWallets.length === 0 && availableWallets.length > 0) {
    chosenWallets = [availableWallets[0]];
    walletsConsidered = 1;
  }

  let workingWallets = [...chosenWallets];
  let allocations: MonadWalletAllocation[] = [];

  // Safety buffer for gas fees and transaction costs (0.015 MON ~ $0.50-1.00 for gas)
  const SAFETY_BUFFER = 0.015;

  while (workingWallets.length > 0) {
    const perWalletAmount = workingWallets.length
      ? amountValue / workingWallets.length
      : amountValue;

    let running = 0;
    const proposed = workingWallets
      .map((wallet, idx) => {
        const address = getMonadAddress(wallet);
        const balance = getBalanceForAddress(address, walletBalances);
        const allocationAmount =
          idx === workingWallets.length - 1
            ? Math.max(amountValue - running, 0)
            : perWalletAmount;

        running += allocationAmount;

        // Check if wallet has enough balance INCLUDING safety buffer for gas fees
        const requiredBalance = allocationAmount + SAFETY_BUFFER;
        if (balance < requiredBalance) {
          return null;
        }

        return {
          walletId: wallet.id,
          amount: allocationAmount,
          address,
          balance,
        };
      })
      .filter(Boolean) as MonadWalletAllocation[];

    if (proposed.length === workingWallets.length) {
      allocations = proposed;
      break;
    }

    if (proposed.length === 0) {
      break;
    }

    const allowedIds = new Set(proposed.map((a) => a.walletId));
    workingWallets = workingWallets.filter((w) => allowedIds.has(w.id));
  }

  if (allocations.length === 0 && workingWallets.length > 0) {
    // Fallback: use selected/working wallets equally and let backend enforce balance constraints
    const fallbackWallets = workingWallets;
    const perWalletAmount =
      fallbackWallets.length > 0 ? amountValue / fallbackWallets.length : amountValue;

    allocations = fallbackWallets.map((wallet) => {
      const address = getMonadAddress(wallet);
      const balance = getBalanceForAddress(address, walletBalances);
      return {
        walletId: wallet.id,
        amount: perWalletAmount,
        address,
        balance,
      };
    });
    walletsConsidered = fallbackWallets.length || walletsConsidered;
  }

  return {
    allocations,
    total: walletsConsidered || allocations.length || 0,
  };
}

type MultiBuyParams = {
  tokenAddress: string;
  amountMON: number;
  launchpad: "nadfun" | "flapsh-simple" | "flapsh-devs";
  slippage?: number;
  gasPrice?: number;
  authToken: string;
  walletList?: WalletListItem[];
  walletBalances?: Record<string, number>;
  selectedWalletIds?: string[];
  onWalletStart?: (ctx: {
    allocation: MonadWalletAllocation;
    index: number;
    total: number;
    totalConsidered: number;
  }) => void;
  onWalletSuccess?: (ctx: {
    allocation: MonadWalletAllocation;
    index: number;
    total: number;
    totalConsidered: number;
    result: any;
  }) => void;
  onWalletError?: (ctx: {
    allocation: MonadWalletAllocation;
    index: number;
    total: number;
    totalConsidered: number;
    error: any;
  }) => void;
};

/**
 * Execute Monad buys across selected wallets (equal split).
 * Returns per-wallet results and keeps the existing API surface.
 */
export async function executeMonadMultiBuy({
  tokenAddress,
  amountMON,
  launchpad,
  slippage,
  gasPrice,
  authToken,
  walletList = [],
  walletBalances = {},
  selectedWalletIds = [],
  onWalletStart,
  onWalletSuccess,
  onWalletError,
}: MultiBuyParams) {
  const { allocations, total } = buildMonadWalletAllocations({
    amount: amountMON,
    walletList,
    walletBalances,
    selectedWalletIds,
  });

  // If multi-wallet is requested but no allocations passed the local balance filter,
  // fall back to sending all selected wallets to the backend (it will filter/allocate).
  let effectiveAllocations = allocations;
  if (selectedWalletIds.length > 1 && allocations.length === 0) {
    const chosen = walletList.filter(
      (w) => w && selectedWalletIds.includes(w.id)
    );
    if (chosen.length > 0) {
      const perWalletAmount = amountMON / chosen.length;
      effectiveAllocations = chosen.map((w) => ({
        walletId: w.id,
        amount: perWalletAmount,
        address: getMonadAddress(w),
        balance: getBalanceForAddress(getMonadAddress(w), walletBalances),
      }));
    }
  }

  // ========================================
  // NEW: Use backend multi-wallet API if multiple wallets selected
  // This is MUCH faster - 1 API call instead of N sequential calls
  // ========================================
  // IMPORTANT: For multi-wallet mode, let BACKEND validate and distribute
  // Don't block on frontend if primary wallet has no balance - other wallets might!
  if (selectedWalletIds.length > 1) {
    console.log(`🚀 Using NEW backend multi-wallet Monad API (1 call for ${effectiveAllocations.length} wallets)`);

    try {
      const result = await tradeMonadBuy(
        {
          tokenAddress,
          amountMON: parseFloat(clampToDecimals(amountMON, 18)),
          launchpad,
          slippage,
          gasPrice,
          walletIds: selectedWalletIds, // NEW: Send array of wallet IDs
          useMultipleWallets: true,     // NEW: Enable multi-wallet mode
        },
        authToken
      );

      // Handle new multi-wallet response format
      if ((result as any).multiWallet) {
        const multiResult = result as any;

        // Notify about all wallets at once
        for (let i = 0; i < multiResult.walletsUsed; i++) {
          onWalletStart?.({
            allocation: effectiveAllocations[i] || { walletId: undefined, amount: 0, balance: 0 },
            index: i,
            total: multiResult.walletsUsed,
            totalConsidered: total,
          });
        }

        // Process each trade result
        const trades = multiResult.trades || [];
        const results: Array<{
          allocation: MonadWalletAllocation;
          result: any;
        }> = [];

        for (let i = 0; i < trades.length; i++) {
          const trade = trades[i];
          const allocation = effectiveAllocations.find(a => a.walletId === trade.walletId) || effectiveAllocations[i];

          if (trade.success && trade.txHash) {
            onWalletSuccess?.({
              allocation,
              index: i,
              total: trades.length,
              totalConsidered: total,
              result: { txHash: trade.txHash, success: true },
            });
            results.push({ allocation, result: { txHash: trade.txHash, success: true } });
          } else {
            const err = new Error(trade.error || "Trade failed");
            onWalletError?.({
              allocation,
              index: i,
              total: trades.length,
              totalConsidered: total,
              error: err,
            });
            // Continue processing instead of throwing
          }
        }

        const firstTxHash = multiResult.txHashes?.[0];
        broadcastTradeCompleted({ tokenAddress, tradeType: 'buy', chain: 'monad', txHash: firstTxHash || undefined });

        return {
          allocations: effectiveAllocations,
          totalConsidered: total,
          results,
          multiWallet: true,
          parentTradeId: multiResult.parentTradeId,
          txHashes: multiResult.txHashes,
        };
      }
    } catch (error: any) {
      console.error('❌ Multi-wallet Monad backend API failed, falling back to sequential:', error);
      // Fall through to old sequential approach
    }
  }

  // ========================================
  // OLD: Sequential approach (single wallet OR fallback)
  // ========================================
  console.log(`🔄 Using sequential Monad API calls (${effectiveAllocations.length} wallet${effectiveAllocations.length > 1 ? 's' : ''})`);

  // Validate balance ONLY for sequential mode (single wallet or fallback)
  if (effectiveAllocations.length === 0) {
    throw new Error('No selected wallets have sufficient balance for this trade amount and fees');
  }

  const allocationsToUse =
    effectiveAllocations.length > 0
      ? effectiveAllocations
      : [
          {
            walletId: undefined,
            amount: amountMON,
            balance: 0,
            address: undefined,
          },
        ];

  const results: Array<{
    allocation: MonadWalletAllocation;
    result: any;
  }> = [];

  for (let i = 0; i < allocationsToUse.length; i++) {
    const allocation = allocationsToUse[i];
    onWalletStart?.({
      allocation,
      index: i,
      total: allocationsToUse.length,
      totalConsidered: total || allocationsToUse.length,
    });

    try {
      const result = await tradeMonadBuy(
        {
          tokenAddress,
          amountMON: parseFloat(clampToDecimals(allocation.amount, 18)),
          launchpad,
          slippage,
          gasPrice,
          walletId: allocation.walletId,
        },
        authToken
      );

      const isSuccessful =
        result && (result as any).success !== false && ((result as any).txHash || (result as any).hash);

      if (!isSuccessful) {
        const err = new Error((result as any)?.error || "Monad buy failed");
        onWalletError?.({
          allocation,
          index: i,
          total: allocationsToUse.length,
          totalConsidered: total || allocationsToUse.length,
          error: err,
        });
        throw err;
      }

      results.push({ allocation, result });
      onWalletSuccess?.({
        allocation,
        index: i,
        total: allocationsToUse.length,
        totalConsidered: total || allocationsToUse.length,
        result,
      });
    } catch (error) {
      onWalletError?.({
        allocation,
        index: i,
        total: allocationsToUse.length,
        totalConsidered: total || allocationsToUse.length,
        error,
      });
      throw error;
    }
  }

  // Broadcast trade completion for portfolio auto-refresh
  const firstTxHash = results[0]?.result?.txHash || results[0]?.result?.hash;
  broadcastTradeCompleted({
    tokenAddress,
    tradeType: 'buy',
    chain: 'monad',
    txHash: firstTxHash || undefined,
  });

  return {
    allocations: allocationsToUse,
    totalConsidered: total || allocationsToUse.length,
    results,
  };
}

export function formatMonadTxSummary(txHashes: string[], totalConsidered?: number) {
  const unique = Array.from(new Set(txHashes || [])).filter(Boolean);
  const walletsUsed = unique.length || 0;
  // For display, cap total at wallets actually used to avoid “5/5” when only 1 wallet executed
  const total = walletsUsed || totalConsidered || 1;
  const hasMultiple = walletsUsed > 1;
  const primaryTx = unique[0];
  const truncated = primaryTx && primaryTx.length > 14 ? `${primaryTx.slice(0, 6)}...${primaryTx.slice(-6)}` : primaryTx;

  const txLabel = hasMultiple
    ? ""
    : primaryTx
    ? ` Tx: ${truncated}`
    : " Tx pending";

  const message = `Wallets used: ${walletsUsed || 1}/${total}.${txLabel}`;
  return { message: message.trim(), primaryTx, total, walletsUsed, hasMultiple };
}
