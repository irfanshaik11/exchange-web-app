import { tradeMonadBuy } from "./api";
import { normalizeMonadAddress } from "./normalizeMonadAddress";

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
        const balance = address ? walletBalances[address] ?? 0 : 0;
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
    const fallback = workingWallets[0];
    const address = getMonadAddress(fallback);
    const balance = address ? walletBalances[address] ?? 0 : 0;

    // Only use fallback wallet if it has sufficient balance (including safety buffer)
    const requiredBalance = amountValue + SAFETY_BUFFER;
    if (balance >= requiredBalance) {
      allocations = [
        {
          walletId: fallback.id,
          amount: amountValue,
          address,
          balance,
        },
      ];
      walletsConsidered = 1;
    }
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

  const allocationsToUse =
    allocations.length > 0
      ? allocations
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
          amountMON: allocation.amount,
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

  return {
    allocations: allocationsToUse,
    totalConsidered: total || allocationsToUse.length,
    results,
  };
}

export function formatMonadTxSummary(txHashes: string[], totalConsidered?: number) {
  const unique = Array.from(new Set(txHashes || [])).filter(Boolean);
  const walletsUsed = unique.length || 0;
  const total = totalConsidered || walletsUsed || 1;
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
