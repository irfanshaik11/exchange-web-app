const isDev = process.env.NODE_ENV !== 'production';

import { tradeBuy } from "./api";
import { broadcastTradeCompleted } from "./tradeEvents";
import {
  dispatchOptimisticBalance,
  dispatchOptimisticRollback,
  newTradeId,
} from "./optimisticBalance";
import { QUOTE_MIN_TRADE, type QuoteCurrency } from "./quoteCurrency";

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
  /**
   * Per-wallet balances **in the same currency as `amount`**. Callers should
   * pass SOL balances for SOL trades, USDC balances for USDC trades.
   * The function itself is currency-agnostic — the safety buffer is the only
   * SOL-specific piece, and it's bypassed for non-SOL currencies.
   */
  walletBalances?: Record<string, number>;
  selectedWalletIds?: string[];
  priorityFee?: number;
  bribe?: number;
  /**
   * Currency being spent. Affects safety-buffer logic — SOL trades reserve
   * `priorityFee + bribe + 0.0001` from the wallet balance for gas, while
   * USDC trades don't (gas is paid in SOL out-of-band).
   */
  quoteCurrency?: QuoteCurrency;
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
  quoteCurrency = "SOL",
}: AllocationInput): { allocations: SolanaWalletAllocation[]; total: number } {
  const amountValue = Math.max(Number(amount) || 0, 0);
  // Per-currency minimum. SOL minimum covers fees; USDC has its own dust minimum.
  const MIN_TRADE_AMOUNT =
    quoteCurrency === "SOL" ? 0.0001 : QUOTE_MIN_TRADE[quoteCurrency];
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

  // Safety buffer for gas fees and transaction costs.
  // SOL trades: priorityFee + bribe + ~0.0001 network fee, all denominated in SOL.
  // USDC trades: zero buffer in the quote currency — gas is paid in SOL separately,
  //              so a wallet only needs `amount` USDC to qualify for allocation.
  const SAFETY_BUFFER =
    quoteCurrency === "SOL" ? priorityFee + bribe + 0.0001 : 0;
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
      // If balance IS known and insufficient, reject early (avoids toast-then-error UX)
      if (match.hasBalanceEntry && typeof match.balance === "number" && match.balance < requiredBalanceFull) {
        return { allocations: [], total: 1 };
      }
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

    // 3) Selected wallet with unknown balance (let backend validate)
    const selUnknown = candidates.find((c) => c.selected && c.address && !c.hasBalanceEntry);
    if (selUnknown) return selUnknown;

    // 4) Any wallet with unknown balance
    return candidates.find((c) => c.address && !c.hasBalanceEntry) || null;
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
  /**
   * Amount to spend, in UI units of `quoteCurrency`. Name kept as `amountSOL`
   * for caller back-compat — value is interpreted via `quoteCurrency`
   * (SOL = SOL units, USDC = USDC units).
   */
  amountSOL: number;
  /** Currency the user is spending. Default 'SOL'. */
  quoteCurrency?: QuoteCurrency;
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
  imageUrl?: string;
  authToken: string;
  walletList?: WalletListItem[];
  walletBalances?: Record<string, number>;
  /**
   * Per-wallet USDC balances. Required when `quoteCurrency === 'USDC'` so the
   * wallet split picks wallets with USDC inventory. Optional otherwise; an
   * empty map (the default) leaves the SOL path completely unaffected.
   */
  walletUsdcBalances?: Record<string, number>;
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
  quoteCurrency = "SOL",
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
  imageUrl,
  authToken,
  walletList = [],
  walletBalances = {},
  walletUsdcBalances = {},
  selectedWalletIds = [],
  onWalletStart,
  onWalletSuccess,
  onWalletError,
  onTxHash,
}: MultiBuyParams) {
  // Per-currency minimum trade. SOL minimum covers fees; USDC has its own dust minimum.
  const MIN_TRADE_AMOUNT =
    quoteCurrency === "SOL" ? 0.0001 : QUOTE_MIN_TRADE[quoteCurrency];
  if (amountSOL < MIN_TRADE_AMOUNT) {
    throw new Error(
      `Trade amount must be at least ${MIN_TRADE_AMOUNT} ${quoteCurrency}`
    );
  }

  // Normalize slippage: settings store decimals (0.2 = 20%), backend expects percentage
  const normalizedSlippage =
    typeof slippage === "number" && slippage > 0 && slippage <= 1
      ? slippage * 100
      : slippage;

  // For USDC trades, the wallet split must look at USDC balances (not SOL).
  // The function name still says "Sol" because every existing caller uses SOL —
  // we feed it the right balance map per currency. Default empty USDC map keeps
  // the SOL path byte-identical.
  const balancesForAllocation =
    quoteCurrency === "SOL" ? walletBalances : walletUsdcBalances;
  const { allocations, total } = buildSolanaWalletAllocations({
    amount: amountSOL,
    walletList,
    walletBalances: balancesForAllocation,
    selectedWalletIds,
    priorityFee,
    bribe,
    quoteCurrency,
  });

  // Optimistic header balance — dispatch per-wallet debits now so the UI
  // reflects the click before the backend responds. queueMicrotask defers
  // the dispatch off the sync trade path; the POST proceeds at native speed.
  //
  // For USDC trades we skip the optimistic SOL debit entirely; the header
  // SOL balance is untouched (gas dust is too small to matter at header-display
  // resolution), so this leaves the optimistic SOL ledger unaffected.
  const __optimisticTradeId = newTradeId();
  let __optimisticDispatched = false;
  const __rollbackOptimistic = () => {
    if (!__optimisticDispatched) return;
    queueMicrotask(() => dispatchOptimisticRollback(__optimisticTradeId));
  };
  if (allocations.length > 0 && quoteCurrency === "SOL") {
    // Lean estimate: per-wallet swap amount + bribe only. Priority fee
    // actual deduction is typically a small fraction of the ceiling,
    // and ATA rent (~0.002 SOL) only applies on first buy of a token.
    // Undershooting avoids the "balance popped back up" flicker when
    // the real balance arrives via gRPC.
    const feesPerWallet = bribe || 0;
    const perWalletDeltas = allocations
      .map((a) => ({
        address: a.address || "",
        deltaSol: -(a.amount + feesPerWallet),
      }))
      .filter((d) => d.address.length > 0 && d.deltaSol !== 0);
    if (perWalletDeltas.length > 0) {
      __optimisticDispatched = true;
      queueMicrotask(() =>
        dispatchOptimisticBalance({
          tradeId: __optimisticTradeId,
          chain: "sol",
          side: "buy",
          perWalletDeltas,
          expiresAt: Date.now() + 15_000,
        }),
      );
    }
  }

  // ========================================
  // NEW: Use backend multi-wallet API if multiple wallets selected
  // This is MUCH faster - 1 API call instead of N sequential calls
  // ========================================
  // IMPORTANT: For multi-wallet mode, let BACKEND validate and distribute
  // Don't block on frontend if primary wallet has no balance - other wallets might!
  if (selectedWalletIds.length > 1) {
    isDev && console.log(`Using backend multi-wallet API (1 call for ${allocations.length} wallets)`);

    try {
      const result = await tradeBuy(
        {
          poolAddress,
          baseMint,
          quoteMint,
          amount: amountSOL,
          quoteCurrency,
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
          imageUrl,
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
            allocation: allocations[i] || { walletId: undefined, amount: 0, balance: 0 },
            index: i,
            total: multiResult.walletsUsed,
            totalConsidered: total,
          });
        }

        // Process each trade result
        const trades = multiResult.trades || [];
        const results: Array<{
          allocation: SolanaWalletAllocation;
          result: any;
          error?: any;
        }> = [];

        for (let i = 0; i < trades.length; i++) {
          const trade = trades[i];
          const allocation = allocations.find(a => a.walletId === trade.walletId) || allocations[i];

          if (trade.success && trade.txHash) {
            onTxHash?.({ allocation, txHash: trade.txHash });
            onWalletSuccess?.({
              allocation,
              index: i,
              total: trades.length,
              totalConsidered: total,
              result: { hash: trade.txHash, txid: trade.txHash },
            });
            results.push({ allocation, result: { hash: trade.txHash } });
          } else {
            const err = new Error(trade.error || "Trade failed");
            if (trade.code) (err as any).code = trade.code;
            onWalletError?.({
              allocation,
              index: i,
              total: trades.length,
              totalConsidered: total,
              error: err,
            });
            results.push({ allocation, result: null, error: err });
          }
        }

        return {
          results,
          summary: formatSolanaTxSummary(multiResult.txHashes || []),
          multiWallet: true,
          parentTradeId: multiResult.parentTradeId,
          txHashes: multiResult.txHashes,
        };
      }
    } catch (error: any) {
      console.error('❌ Multi-wallet backend API failed, falling back to sequential:', error);
      // Fall through to old sequential approach
    }
  }

  // ========================================
  // OLD: Sequential approach (single wallet OR fallback)
  // ========================================
  isDev && console.log(`Using sequential API calls (${allocations.length} wallet${allocations.length > 1 ? 's' : ''})`);

  // Validate balance ONLY for sequential mode (single wallet or fallback)
  if (allocations.length === 0) {
    __rollbackOptimistic();
    throw new Error(
      quoteCurrency === "SOL"
        ? 'Insufficient balance — no selected wallets have enough SOL for this trade amount and fees'
        : `Insufficient balance — no selected wallets have enough ${quoteCurrency} for this trade amount`
    );
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
          quoteCurrency,
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
          imageUrl,
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
        // Check if this is a bonding curve complete error with retry info
        const errorCode = (result as any)?.code;
        const retryWith = (result as any)?.retryWith;

        if (errorCode === 'BONDING_CURVE_COMPLETE' && retryWith?.poolAddress && retryWith?.poolType) {
          isDev && console.log(`Token graduated - retrying with migrated pool: ${retryWith.poolType}`);

          // Retry the trade with the migrated pool info
          try {
            const retryResult = await tradeBuy(
              {
                poolAddress: retryWith.poolAddress,
                baseMint,
                quoteMint,
                amount: allocation.amount,
                quoteCurrency,
                walletId: allocation.walletId,
                poolType: retryWith.poolType,
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

            const retryTxHash = (retryResult as any)?.hash || (retryResult as any)?.txid || null;
            const retryIsSuccessful = retryResult && (retryResult as any).success !== false && retryTxHash;

            if (retryIsSuccessful && retryTxHash) {
              isDev && console.log(`Retry with migrated pool successful: ${retryTxHash}`);
              onTxHash?.({ allocation, txHash: retryTxHash });
              results.push({ allocation, result: retryResult });
              onWalletSuccess?.({
                allocation,
                index: i,
                total: allocationsToUse.length,
                totalConsidered: total || allocationsToUse.length,
                result: retryResult,
              });
              continue;
            }
          } catch (retryError: any) {
            console.error(`❌ Retry with migrated pool failed:`, retryError);
          }
        }

        const err = new Error((result as any)?.error || "Solana buy failed");
        const resultCode = (result as any)?.code;
        if (resultCode) (err as any).code = resultCode;
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
    // All failed - roll back the optimistic debit and surface the first error
    __rollbackOptimistic();
    const firstError = results[0]?.error || new Error("All wallet trades failed");
    throw firstError;
  }

  // Broadcast trade completion for portfolio auto-refresh
  const firstTxHash = successfulResults[0]?.result?.hash || successfulResults[0]?.result?.txid;
  broadcastTradeCompleted({
    tokenAddress: baseMint,
    tradeType: 'buy',
    chain: 'sol',
    txHash: firstTxHash || undefined,
    tokenName,
    tokenSymbol,
    imageUrl,
    solAmountSpent: amountSOL,
  });

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
