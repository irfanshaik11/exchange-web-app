import { toast } from "react-hot-toast";
import type { Token } from "~/utils/db";
import { tradeBuy, SOL_MINT_ADDRESS, ApiError } from "~/utils/api";
import { getPoolTypeFromToken } from "~/utils/poolTypeDetection";
import type { QuickBuySettings } from "~/components/QuickBuyContext";
import { fetchVerifiedPairAddress } from "~/hooks/useSingleTokenPolling";

interface QuickBuyParams {
  token: Token;
  buyAmount: number;
  settings: QuickBuySettings;
  activePreset: number;
  presets: any[];
  user: { bearerToken: string } | null;
  source: string; // "discover" | "pulseTable" | etc.
}

/**
 * Shared Quick Buy handler with comprehensive logging
 * Used by both Discover page and PulseTable for consistency
 */
export async function handleQuickBuyDetailed({
  token,
  buyAmount,
  settings,
  activePreset,
  presets,
  user,
  source = "unknown",
}: QuickBuyParams): Promise<{ success: boolean; txHash?: string; error?: string }> {
  // Fallback toast function for production issues
  const showToast = (message: string, type: 'success' | 'error' = 'error') => {
    try {
      if (type === 'success') {
        toast.success(message, {
          duration: 5000,
          style: {
            background: '#1E1F26',
            color: '#E6E7EA',
            border: '1px solid #70E0B0',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            zIndex: 9999
          }
        });
      } else {
        toast.error(message, {
          duration: 5000,
          style: {
            background: '#1E1F26',
            color: '#E6E7EA',
            border: '1px solid #ff6b6b',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            zIndex: 9999
          }
        });
      }
    } catch (error) {
      // Fallback to console and alert if toast fails
      console.error('Toast failed:', error);
      if (typeof window !== 'undefined' && window.alert) {
        window.alert(message);
      }
    }
  };
  
  if (!user) {
    showToast("⚠️ Please connect your wallet to trade");
    return { success: false, error: "No user found" };
  }

  if (isNaN(buyAmount) || buyAmount <= 0) {
    showToast("⚠️ Please enter a valid SOL amount (minimum 0.001 SOL)");
    return { success: false, error: "Invalid buy amount" };
  }

  try {
    const poolType = getPoolTypeFromToken(token);
    let effectivePoolAddress = token.migrated_pool_address || token.pair_address;

    // CRITICAL: Verify the pair address from the token service
    // This ensures we use the correct/up-to-date pool address for trades
    if (token.mint) {
      const verifiedPairAddress = await fetchVerifiedPairAddress(token.mint);
      if (verifiedPairAddress) {
        effectivePoolAddress = verifiedPairAddress;
      }
    }

    // Build the complete payload
    const payload = {
      poolAddress: effectivePoolAddress,
      baseMint: token.mint,
      quoteMint: SOL_MINT_ADDRESS,
      amount: buyAmount,
      mevProtection: (settings.mevMode === "off" ? 0 : 1) as 0 | 1,
      poolType: poolType,
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
    
    const data = await tradeBuy(payload, user.bearerToken);

    const txHash = data?.hash || data?.txid;
    const tokenAmount = data?.amount || data?.tokenAmount;

    if (data && txHash) {
      showToast(
        `✅ Quick Buy successful! Bought ${tokenAmount || 'tokens'} ${token.symbol}. Tx: ${txHash.slice(0, 8)}...`,
        'success'
      );
      return { success: true, txHash };
    } else {
      showToast("❌ Quick Buy failed - no transaction hash returned");
      return { success: false, error: "No transaction hash returned" };
    }
  } catch (e: any) {
    // Use console.warn for expected errors, console.error for unexpected
    const logFn = (e as any)?.expected ? console.warn : console.error;
    logFn('Quick Buy error:', e);

    if (e instanceof ApiError) {
      // Show simplified user-friendly messages with enhanced styling
      const toastStyle = {
        background: '#1E1F26',
        color: '#E6E7EA',
        border: '1px solid #ff6b6b',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: '500'
      };
      
      if (e.code === 'NO_ACTIVE_POOL') {
        showToast(`⚠️ Pool unavailable for ${token.symbol}`);
      } else if (e.code === 'INSUFFICIENT_BALANCE') {
        showToast(`⚠️ Insufficient balance`);
      } else if (e.code === 'TX_FAILED') {
        showToast(`❌ Trade failed. Try adjusting slippage or amount.`);
      } else if (e.code === 'NO_HOLDINGS') {
        showToast(`❌ No ${token.symbol} to sell`);
      } else if (e.code === 'AMOUNT_TOO_SMALL') {
        showToast(`❌ Amount too small (min 0.001 SOL)`);
      } else if (e.code === 'POOL_UNAVAILABLE') {
        showToast(`⚠️ Pool has insufficient liquidity`);
      } else {
        // Generic error with shortened message
        const msg = e.message.length > 80 ? e.message.substring(0, 77) + '...' : e.message;
        showToast(`❌ ${msg}`);
      }
      return { success: false, error: e.message };
    } else {
      // Unexpected error - show generic message
      showToast(`❌ Trade failed. Please try again.`);
      return { success: false, error: e?.message || "Unknown error" };
    }
  }
}

