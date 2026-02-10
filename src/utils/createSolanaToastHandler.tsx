import toast from "react-hot-toast";
import { getResolvedTokenImage } from "./images";
import { buildSolanaWalletAllocations, executeSolanaMultiBuy } from "./solanaWalletAllocation";
import { showEnhancedToast } from "./enhancedToast";
import { SOL_MINT_ADDRESS } from "./api";
import { getPoolTypeFromToken } from "./poolTypeDetection";
import { mapTradeErrorMessage } from "./tradeErrorMessages";
import type { Token } from "./db";
import type { QuickBuySettings } from "~/components/QuickBuyContext";
import { fetchVerifiedPairAddress } from "~/hooks/useSingleTokenPolling";

type WalletListItem = {
  id: string;
  solanaAddress?: string | null;
  ethereumAddress?: string | null;
  address?: string | null;
  isPrimary?: boolean;
  isArchived?: boolean;
};

type PendingSolanaToast = {
  id: string;
  tokenImage: string | null;
  tokenName: string;
  fakeTime: string;
  tokenAddress: string;
  startTime: number;
  timerHandle?: number;
  totalSelectedWallets: number;
};

export type PendingSolanaToastRef = {
  current: PendingSolanaToast | null;
};

/**
 * Creates a Monad-style animated toast for Solana trades
 * Returns the toast ID and timer interval for cleanup
 */
export function createSolanaTradeToast(
  token: Token,
  walletsWithBalance: number,
  total: number,
  isMultiWallet: boolean,
  pendingRef: PendingSolanaToastRef
): { toastId: string; timerHandle: number; timerCap: number } {
  // Generate random timer cap (0.40-0.60s)
  const timerCap = 0.40 + Math.random() * 0.20;
  const uniqueToastId = `solana-buy-${Date.now()}-${Math.random()}`;
  const startTime = Date.now();
  let timerFinished = false;

  // Extract token image
  // Use resolved version to get cached metadata images
  const tokenImage = getResolvedTokenImage(token);
  const tokenName = token.symbol || token.name || 'Token';

  // Show animated toast with timer
  toast(
    (t) => (
      <div className="flex items-center gap-3">
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
            Buying {tokenName}
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
      style: {
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: '8px',
        padding: '12px',
      },
    }
  );

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
          linkEl.textContent = `${walletsWithBalance}/${total}`;
          linkEl.className = 'text-xs text-blue-400 font-medium flex-shrink-0';
        } else {
          linkEl.className = 'flex-shrink-0';
        }
      }
      timerHandle = null as any;
      return;
    }

    timerHandle = requestAnimationFrame(tick) as any;
  };
  let timerHandle = requestAnimationFrame(tick) as any;

  // Store pending toast info for WebSocket instant update
  pendingRef.current = {
    id: uniqueToastId,
    tokenImage,
    tokenName,
    fakeTime: timerCap.toFixed(2),
    tokenAddress: token.mint || '',
    startTime,
      timerHandle,
    totalSelectedWallets: walletsWithBalance
  };

  return { toastId: uniqueToastId, timerHandle, timerCap };
}

/**
 * Executes a Solana buy with Monad-style toast
 * Handles wallet allocation, toast display, and error handling
 */
export async function executeSolanaBuyWithToast({
  token,
  amount,
  settings,
  authToken,
  walletList,
  walletBalances,
  selectedWalletIds,
  pendingRef,
  poolAddress,
  baseMint,
  quoteMint,
}: {
  token: Token;
  amount: number;
  settings: QuickBuySettings;
  authToken: string;
  walletList?: WalletListItem[];
  walletBalances?: Record<string, number>;
  selectedWalletIds?: string[];
  pendingRef: PendingSolanaToastRef;
  poolAddress?: string;
  baseMint?: string;
  quoteMint?: string;
}): Promise<{ success: boolean; error?: any }> {
  const poolType = getPoolTypeFromToken(token);

  // Pre-calculate which wallets will actually be used (have sufficient balance)
  const { allocations, total } = buildSolanaWalletAllocations({
    amount,
    walletList,
    walletBalances,
    selectedWalletIds: selectedWalletIds || [],
    priorityFee: settings.priority || 0.0001,
    bribe: settings.bribe || 0,
  });
  const walletsWithBalance = allocations.length;
  const isMultiWallet = walletsWithBalance > 1;

  // Create the toast
  const { toastId, timerHandle } = createSolanaTradeToast(
    token,
    walletsWithBalance,
    total,
    isMultiWallet,
    pendingRef
  );

  try {
    let effectivePoolAddress = poolAddress || token.migrated_pool_address || token.pair_address || '';
    const effectiveBaseMint = baseMint || token.mint || '';
    const effectiveQuoteMint = quoteMint || SOL_MINT_ADDRESS;

    // CRITICAL: Verify the pair address from the token service before trading
    if (token.mint) {
      console.log(`[createSolanaToastHandler] Verifying pair address for: ${token.mint}`);
      const verifiedPairAddress = await fetchVerifiedPairAddress(token.mint);
      if (verifiedPairAddress) {
        if (verifiedPairAddress !== effectivePoolAddress) {
          console.log(`[createSolanaToastHandler] Pair address mismatch! Local: ${effectivePoolAddress}, Verified: ${verifiedPairAddress}`);
        }
        effectivePoolAddress = verifiedPairAddress;
      }
    }

    const multiResult = await executeSolanaMultiBuy({
      poolAddress: effectivePoolAddress,
      baseMint: effectiveBaseMint,
      quoteMint: effectiveQuoteMint,
      amountSOL: amount,
      poolType,
      originalPairAddress: effectivePoolAddress,
      slippage: settings.maxSlippage,
      priorityFee: settings.priority,
      bribe: settings.bribe,
      mevMode: settings.mevMode,
      autoFee: settings.autoFee,
      maxFee: settings.maxFee,
      rpc: settings.rpc,
      tokenName: token.name,
      tokenSymbol: token.symbol,
      authToken,
      walletList,
      walletBalances,
      selectedWalletIds: selectedWalletIds || [],
      onTxHash: ({ txHash }) => {
        if (pendingRef.current?.id === toastId && txHash) {
          const linkEl = document.getElementById(`link-${toastId}`);
          if (linkEl) {
            const explorerUrl = `https://solscan.io/tx/${txHash}`;
            linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4" alt="Solana" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
            linkEl.className = '';
          }
        }
      },
    });

    // If single wallet and we have a tx hash, show clickable Solana icon immediately
    const firstTxHash =
      (multiResult?.results || [])
        .map((r: any) => (r.result as any)?.hash || (r.result as any)?.txid)
        .find(Boolean);

    if (firstTxHash && !isMultiWallet) {
      const linkEl = document.getElementById(`link-${toastId}`);
      if (linkEl) {
        const explorerUrl = `https://solscan.io/tx/${firstTxHash}`;
        linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4" alt="Solana" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
        linkEl.className = '';
      }
      if (timerHandle) {
        cancelAnimationFrame(timerHandle);
      }
      setTimeout(() => toast.dismiss(toastId), 10000);
    }

    return { success: true };
  } catch (error: any) {
    // Stop timer on error
    if (timerHandle) {
      cancelAnimationFrame(timerHandle);
    }

    // Dismiss pending toast
    if (pendingRef.current) {
      toast.dismiss(pendingRef.current.id);
      pendingRef.current = null;
    }

    // Show error toast
    console.error("❌ Solana buy failed:", error);
    showEnhancedToast("error", mapTradeErrorMessage(error), {
      title: "Trade Failed",
    });

    return { success: false, error };
  }
}

/**
 * Creates a WebSocket callback handler for instant tx hash updates
 * Should be used with useSolanaPositionWebSocket's onTxHash callback
 */
export function createSolanaWsHandler(pendingRef: PendingSolanaToastRef) {
  return (data: { txHash: string; tokenAddress: string; tradeType: 'buy' | 'sell'; explorerUrl: string }) => {
    const pending = pendingRef.current;
    if (!pending || pending.tokenAddress.toLowerCase() !== data.tokenAddress.toLowerCase()) return;

    console.log('[Solana] 🚀 INSTANT txHash via WebSocket:', data.txHash);

    // For multi-wallet trades: Don't update the toast (count was already shown at timer cap)
    // For single wallet: Update the link element with clickable Solana logo
    if (pending.totalSelectedWallets === 1) {
      const linkEl = document.getElementById(`link-${pending.id}`);
      if (linkEl) {
        linkEl.innerHTML = `<a href="${data.explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://avatars.githubusercontent.com/u/92743431?s=200&v=4" alt="Solana" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
      }
    }

    // Set duration for auto-dismiss after 10s
    setTimeout(() => {
      if (pendingRef.current?.id === pending.id) {
        toast.dismiss(pending.id);
        pendingRef.current = null;
      }
    }, 10000);
  };
}
