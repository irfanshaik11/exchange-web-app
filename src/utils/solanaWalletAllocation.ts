import { tradeBuy } from "./api";

type WalletListItem = {
  id: string;
  solanaAddress?: string | null;
  ethereumAddress?: string | null;
  address?: string | null;
  isPrimary?: boolean;
  isArchived?: boolean;
};

export type SolanaWalletAllocation = {
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
  priorityFee?: number;
  bribe?: number;
};

const getSolanaAddress = (wallet: WalletListItem): string | undefined => {
  const address =
    wallet.solanaAddress ||
    wallet.address ||
    undefined;
  return address;
};

/**
 * Build equal-split allocations for Solana trades based on the selected wallets.
 * Falls back to the primary wallet (or first available) if nothing is selected.
 */
export function buildSolanaWalletAllocations({
  amount,
  walletList = [],
  walletBalances = {},
  selectedWalletIds = [],
  priorityFee = 0.0001,
  bribe = 0,
}: AllocationInput): { allocations: SolanaWalletAllocation[]; total: number } {
  const amountValue = Math.max(Number(amount) || 0, 0);
  const MIN_TRADE_AMOUNT = 0.0001;
  if (amountValue < MIN_TRADE_AMOUNT) {
    return { allocations: [], total: 0 };
  }
  const SMALL_TRADE_THRESHOLD = MIN_TRADE_AMOUNT * 2; // For tiny trades, avoid splitting
  const availableWallets =
    walletList?.filter((w) => !w.isArchived && getSolanaAddress(w)) || [];

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
  let allocations: SolanaWalletAllocation[] = [];

  // Safety buffer for gas fees and transaction costs
  // Solana: ~0.001 SOL for priority fee + network fee + bribe
  const SAFETY_BUFFER = priorityFee + bribe + 0.0001; // network fee estimate
  const requiredBalanceFull = amountValue + SAFETY_BUFFER;

  // Build candidate list with normalized balance knowledge
  const candidates = availableWallets.map((w) => {
    const address = getSolanaAddress(w);
    const hasBalanceEntry =
      address !== undefined &&
      Object.prototype.hasOwnProperty.call(walletBalances, address);
    const balance = hasBalanceEntry ? walletBalances[address] : undefined;
    return {
      wallet: w,
      address,
      balance,
      hasBalanceEntry,
      selected: selectionSet.has(w.id),
    };
  });

  // Prefer a single wallet that can cover the full trade+fees (selected first)
  const sortedByPreference = [...candidates].sort((a, b) => {
    if (a.selected && !b.selected) return -1;
    if (!a.selected && b.selected) return 1;
    const balA = typeof a.balance === "number" ? a.balance : -1;
    const balB = typeof b.balance === "number" ? b.balance : -1;
    return balB - balA;
  });

  const singleCoveringWallet = sortedByPreference.find(
    (c) =>
      c.address &&
      typeof c.balance === "number" &&
      (c.balance as number) >= requiredBalanceFull
  );

  if (singleCoveringWallet) {
    return {
      allocations: [
        {
          walletId: singleCoveringWallet.wallet.id,
          amount: amountValue,
          address: singleCoveringWallet.address,
          balance: singleCoveringWallet.balance as number,
        },
      ],
      total: 1,
    };
  }

  // If exactly one wallet is selected, honor it even without cached balance
  if (selectionSet.size === 1) {
    const selectedId = Array.from(selectionSet)[0];
    const match = candidates.find((c) => c.wallet.id === selectedId && c.address);
    if (match) {
      return {
        allocations: [
          {
            walletId: match.wallet.id,
            amount: amountValue,
            address: match.address!,
            balance: typeof match.balance === "number" ? match.balance : 0,
          },
        ],
        total: 1,
      };
    }
  }

  const pickBestSingleWallet = () => {
    // 1) Selected wallets with known sufficient balance
    let pool = candidates
      .filter(
        (c) =>
          c.selected &&
          typeof c.balance === "number" &&
          (c.balance as number) >= requiredBalanceFull &&
          c.address
      )
      .sort((a, b) => (b.balance as number) - (a.balance as number));
    if (pool.length > 0) return pool[0];

    // 2) Any wallet with known sufficient balance
    pool = candidates
      .filter(
        (c) =>
          typeof c.balance === "number" &&
          (c.balance as number) >= requiredBalanceFull &&
          c.address
      )
      .sort((a, b) => (b.balance as number) - (a.balance as number));
    if (pool.length > 0) return pool[0];

    // 3) Selected wallet with address (unknown balance)
    const selUnknown = candidates.find((c) => c.selected && c.address);
    if (selUnknown) return selUnknown;

    // 4) Any wallet with address
    return candidates.find((c) => c.address) || null;
  };

  // If trade is tiny, don't split; pick the best single wallet with balance
  if (amountValue <= SMALL_TRADE_THRESHOLD) {
    const best = pickBestSingleWallet();
    if (best && best.address) {
      return {
        allocations: [
          {
            walletId: best.wallet.id,
            amount: amountValue,
            address: best.address,
            balance: typeof best.balance === "number" ? best.balance : 0,
          },
        ],
        total: 1,
      };
    }
    // If still nothing, fall through to normal logic (will likely return empty and error upstream)
  }

  while (workingWallets.length > 0) {
    const perWalletAmount = workingWallets.length
      ? amountValue / workingWallets.length
      : amountValue;

    let running = 0;
    const proposed = workingWallets
      .map((wallet, idx) => {
        const address = getSolanaAddress(wallet);
        const hasBalanceEntry =
          address !== undefined &&
          Object.prototype.hasOwnProperty.call(walletBalances, address);
        const balance = hasBalanceEntry ? walletBalances[address] : undefined;
        const allocationAmount =
          idx === workingWallets.length - 1
            ? Math.max(amountValue - running, 0)
            : perWalletAmount;

        running += allocationAmount;

        // Require a known balance that meets the requirement (prevents sending to unknown/empty wallets)
        const requiredBalance = allocationAmount + SAFETY_BUFFER;
        if (!hasBalanceEntry || typeof balance !== "number" || balance < requiredBalance) {
          return null;
        }

        return {
          walletId: wallet.id,
          amount: allocationAmount,
          address,
          balance: balance ?? 0,
        };
      })
      .filter(Boolean) as SolanaWalletAllocation[];

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

  // If no selected wallets qualified, fall back to any wallet with sufficient balance
  if (allocations.length === 0) {
    // Fallback to best single wallet choice if splitting failed
    const best = pickBestSingleWallet();
    if (best && best.address) {
      allocations = [
        {
          walletId: best.wallet.id,
          amount: amountValue,
          address: best.address,
          balance: typeof best.balance === "number" ? best.balance : 0,
        },
      ];
      walletsConsidered = 1;
    }
  }

  // If still nothing and we have multiple wallets with balances, try proportional split (cover 100% or return empty)
  if (allocations.length === 0) {
    const walletsWithBalance = candidates.filter(
      (c) => typeof c.balance === "number" && (c.balance as number) > 0 && c.address
    );
    // Filter to selected wallets first; if none, use all funded
    const selectedFunded = walletsWithBalance.filter((c) => c.selected);
    const pool = selectedFunded.length > 0 ? selectedFunded : walletsWithBalance;
    const totalKnown = pool.reduce((sum, c) => sum + (c.balance as number), 0);

    if (pool.length > 0 && totalKnown >= requiredBalanceFull) {
      // Sort by balance desc
      pool.sort((a, b) => (b.balance as number) - (a.balance as number));
      let remaining = amountValue;
      const splits: SolanaWalletAllocation[] = [];
      for (const c of pool) {
        if (remaining <= 0) break;
        const available = Math.max((c.balance as number) - SAFETY_BUFFER, 0);
        if (available <= 0) continue;
        const take = Math.min(available, remaining);
        if (take <= 0) continue;
        splits.push({
          walletId: c.wallet.id,
          amount: take,
          address: c.address as string,
          balance: c.balance as number,
        });
        remaining -= take;
      }
      if (remaining <= 0) {
        allocations = splits;
        walletsConsidered = splits.length;
      }
    }
  }

  return {
    allocations,
    total: walletsConsidered || allocations.length || 0,
  };
}

type MultiBuyParams = {
  poolAddress?: string;
  baseMint: string;
  quoteMint: string;
  amountSOL: number;
  poolType?: "PumpAmm" | "Raydium" | "Raydium CPMM" | "Raydium CLMM" | "Raydium Launchpad" | "Pumpfun" | "launchLab" | "bonk" | "meteora dbc" | "meteora amm v1" | "meteora amm v2" | "Meteora" | "bags" | "MoonShoot" | "Orca" | "";
  originalPairAddress?: string;
  slippage?: number;
  priorityFee?: number;
  bribe?: number;
  mevMode?: 'off' | 'reduced' | 'on';
  autoFee?: boolean;
  maxFee?: number;
  rpc?: string;
  tokenName?: string;
  tokenSymbol?: string;
  authToken: string;
  walletList?: WalletListItem[];
  walletBalances?: Record<string, number>;
  selectedWalletIds?: string[];
  onWalletStart?: (ctx: {
    allocation: SolanaWalletAllocation;
    index: number;
    total: number;
    totalConsidered: number;
  }) => void;
  onWalletSuccess?: (ctx: {
    allocation: SolanaWalletAllocation;
    index: number;
    total: number;
    totalConsidered: number;
    result: any;
  }) => void;
  onWalletError?: (ctx: {
    allocation: SolanaWalletAllocation;
    index: number;
    total: number;
    totalConsidered: number;
    error: any;
  }) => void;
  onTxHash?: (ctx: { allocation: SolanaWalletAllocation; txHash: string }) => void;
};

/**
 * Execute Solana buys across selected wallets (equal split).
 * Returns per-wallet results and keeps the existing API surface.
 * CONTINUES on error instead of stopping (fixes the break issue).
 */
export async function executeSolanaMultiBuy({
  poolAddress,
  baseMint,
  quoteMint,
  amountSOL,
  poolType,
  originalPairAddress,
  slippage,
  priorityFee = 0.0001,
  bribe = 0,
  mevMode,
  autoFee,
  maxFee,
  rpc,
  tokenName,
  tokenSymbol,
  authToken,
  walletList = [],
  walletBalances = {},
  selectedWalletIds = [],
  onWalletStart,
  onWalletSuccess,
  onWalletError,
  onTxHash,
}: MultiBuyParams) {
  const MIN_TRADE_AMOUNT = 0.0001;
  if (amountSOL < MIN_TRADE_AMOUNT) {
    throw new Error(`Trade amount must be at least ${MIN_TRADE_AMOUNT} SOL`);
  }

  // Normalize slippage: settings store decimals (0.2 = 20%), backend expects percentage
  const normalizedSlippage =
    typeof slippage === "number" && slippage > 0 && slippage <= 1
      ? slippage * 100
      : slippage;

  const { allocations, total } = buildSolanaWalletAllocations({
    amount: amountSOL,
    walletList,
    walletBalances,
    selectedWalletIds,
    priorityFee,
    bribe,
  });

  if (allocations.length === 0) {
    throw new Error('No selected wallets have sufficient balance for this trade amount and fees');
  }

  const allocationsToUse =
    allocations.length > 0
      ? allocations
      : [
          {
            walletId: undefined,
            amount: amountSOL,
            balance: 0,
            address: undefined,
          },
        ];

  const results: Array<{
    allocation: SolanaWalletAllocation;
    result: any;
    error?: any;
  }> = [];

  for (let i = 0; i < allocationsToUse.length; i++) {
    const allocation = allocationsToUse[i];
    onWalletStart?.(({
      allocation,
      index: i,
      total: allocationsToUse.length,
      totalConsidered: total || allocationsToUse.length,
    }));

    try {
      const result = await tradeBuy(
        {
          poolAddress,
          baseMint,
          quoteMint,
          amount: allocation.amount,
          walletId: allocation.walletId,
          poolType,
          originalPairAddress,
          slippage: normalizedSlippage,
          priorityFee,
          bribe,
          mevMode,
          autoFee,
          maxFee,
          rpc,
          tokenName,
          tokenSymbol,
        },
        authToken
      );

      const isSuccessful =
        result && (result as any).success !== false && ((result as any).txid || (result as any).hash);

      const txHash =
        (result as any)?.hash ||
        (result as any)?.txid ||
        null;

      if (txHash) {
        onTxHash?.({ allocation, txHash });
      }

      if (!isSuccessful) {
        const err = new Error((result as any)?.error || "Solana buy failed");
        onWalletError?.({
          allocation,
          index: i,
          total: allocationsToUse.length,
          totalConsidered: total || allocationsToUse.length,
          error: err,
        });
        // Continue instead of throwing - try remaining wallets
        results.push({ allocation, result: null, error: err });
        continue;
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
      // Continue instead of throwing - try remaining wallets
      results.push({ allocation, result: null, error });
      continue;
    }
  }

  // Check if ALL wallets failed
  const successfulResults = results.filter(r => r.result && !r.error);
  if (successfulResults.length === 0) {
    // All failed - throw the first error
    const firstError = results[0]?.error || new Error("All wallet trades failed");
    throw firstError;
  }

  return {
    allocations: allocationsToUse,
    totalConsidered: total || allocationsToUse.length,
    results: successfulResults,
  };
}

export function formatSolanaTxSummary(txHashes: string[], totalConsidered?: number) {
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
