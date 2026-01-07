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
  console.log("🎯 handleQuickBuy called for token:", token.symbol);
  
  // ✅ COMPREHENSIVE DATA LOGGING FOR TESTING
  console.log("\n" + "=".repeat(80));
  console.log(`📋 QUICK BUY DATA VERIFICATION - ${source.toUpperCase()}`);
  console.log("=".repeat(80));
  
  // Log full token object
  console.log("\n📊 FULL TOKEN OBJECT:");
  console.log(JSON.stringify(token, null, 2));
  
  // Log key token fields
  console.log("\n🔑 KEY TOKEN FIELDS:");
  console.log("  mint:", token.mint);
  console.log("  symbol:", token.symbol);
  console.log("  name:", token.name);
  console.log("  pair_address:", token.pair_address);
  console.log("  migrated_pool_address:", token.migrated_pool_address || "(none)");
  console.log("  launchpad_protocol:", token.launchpad_protocol || "(none)");
  console.log("  protocol:", token.protocol || "(none)");
  console.log("  amm_id:", token.amm_id || "(none)");
  
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
      console.log(`[${type.toUpperCase()}] ${message}`);
      if (typeof window !== 'undefined' && window.alert) {
        window.alert(message);
      }
    }
  };
  
  if (!user) {
    console.log("❌ No user found");
    showToast("⚠️ Please connect your wallet to trade");
    return { success: false, error: "No user found" };
  }

  if (isNaN(buyAmount) || buyAmount <= 0) {
    console.log("❌ Invalid buy amount:", buyAmount);
    showToast("⚠️ Please enter a valid SOL amount (minimum 0.001 SOL)");
    return { success: false, error: "Invalid buy amount" };
  }

  try {
    const poolType = getPoolTypeFromToken(token);
    let effectivePoolAddress = token.migrated_pool_address || token.pair_address;

    // CRITICAL: Verify the pair address from the token service
    // This ensures we use the correct/up-to-date pool address for trades
    if (token.mint) {
      console.log(`\n🔍 VERIFYING PAIR ADDRESS for mint: ${token.mint}`);
      const verifiedPairAddress = await fetchVerifiedPairAddress(token.mint);
      if (verifiedPairAddress) {
        if (verifiedPairAddress !== effectivePoolAddress) {
          console.log(`  ⚠️ Pair address mismatch detected!`);
          console.log(`  Local: ${effectivePoolAddress}`);
          console.log(`  Verified: ${verifiedPairAddress}`);
          console.log(`  → Using verified address from token service`);
        } else {
          console.log(`  ✅ Pair address verified as correct`);
        }
        effectivePoolAddress = verifiedPairAddress;
      } else {
        console.log(`  ⚠️ Could not verify pair address, using local: ${effectivePoolAddress}`);
      }
    }

    console.log("\n🏊 POOL INFORMATION:");
    console.log(`  Protocol: ${token.launchpad_protocol || token.protocol || 'unknown'}`);
    console.log(`  Detected PoolType: ${poolType || '(empty - backend will auto-detect)'}`);
    if (!poolType) {
      console.log(`  ⚠️  Note: Empty poolType is OK - backend will auto-detect from pool address`);
    }
    console.log(`  Effective Pool Address: ${effectivePoolAddress}`);
    console.log(`  Using migrated_pool_address: ${token.migrated_pool_address ? 'YES' : 'NO'}`);
    console.log(`  Original pair_address: ${token.pair_address}`);
    
    console.log("\n⚙️ PRESET SETTINGS:");
    console.log(`  Active Preset: P${activePreset + 1}`);
    console.log(`  Slippage: ${(settings.maxSlippage || 0.4) * 100}% (${settings.maxSlippage || 0.4} decimal)`);
    console.log(`  Priority Fee: ${settings.priority || 0.0001} SOL`);
    console.log(`  Bribe: ${settings.bribe || 0} SOL`);
    console.log(`  MEV Mode: ${settings.mevMode}`);
    console.log(`  MEV Protection: ${settings.mevMode === "off" ? 0 : 1}`);
    console.log(`  Auto Fee: ${settings.autoFee || false}`);
    console.log(`  Max Fee: ${settings.maxFee || 0} SOL`);
    console.log(`  RPC: ${settings.rpc || "(default)"}`);
    
    console.log("\n📦 FULL SETTINGS OBJECT:");
    console.log(JSON.stringify(settings, null, 2));
    
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
    
    console.log("\n📤 COMPLETE PAYLOAD BEING SENT TO API:");
    console.log(JSON.stringify(payload, null, 2));
    console.log("\n📤 PAYLOAD SUMMARY:");
    console.log("  poolAddress:", payload.poolAddress);
    console.log("  baseMint:", payload.baseMint);
    console.log("  quoteMint:", payload.quoteMint);
    console.log("  amount:", payload.amount, "SOL");
    console.log("  poolType:", payload.poolType);
    console.log("  slippage:", payload.slippage, "%");
    console.log("  priorityFee:", payload.priorityFee, "SOL");
    console.log("  bribe:", payload.bribe, "SOL");
    console.log("  mevProtection:", payload.mevProtection);
    console.log("  mevMode:", payload.mevMode);
    console.log("  originalPairAddress:", payload.originalPairAddress);
    console.log("=".repeat(80) + "\n");
    
    const data = await tradeBuy(payload, user.bearerToken);
    
    console.log("\n📥 API RESPONSE RECEIVED:");
    console.log(JSON.stringify(data, null, 2));
    
    const txHash = data?.hash || data?.txid;
    const tokenAmount = data?.amount || data?.tokenAmount;

    if (data && txHash) {
      console.log("\n✅ QUICK BUY SUCCESS:");
      console.log("  Transaction Hash:", txHash);
      console.log("  Token Amount:", tokenAmount || 'N/A');
      console.log("  Token Symbol:", token.symbol);
      console.log("  Full Response:", JSON.stringify(data, null, 2));
      showToast(
        `✅ Quick Buy successful! Bought ${tokenAmount || 'tokens'} ${token.symbol}. Tx: ${txHash.slice(0, 8)}...`,
        'success'
      );
      return { success: true, txHash };
    } else {
      console.log("\n❌ QUICK BUY FAILED:");
      console.log("  Response:", JSON.stringify(data, null, 2));
      console.log("  Missing transaction hash");
      showToast("❌ Quick Buy failed - no transaction hash returned");
      return { success: false, error: "No transaction hash returned" };
    }
  } catch (e: any) {
    // Use console.warn for expected errors, console.error for unexpected
    const logFn = (e as any)?.expected ? console.warn : console.error;
    
    console.log("\n❌ QUICK BUY ERROR:");
    console.log("  Error Type:", e?.constructor?.name || typeof e);
    console.log("  Error Message:", e?.message || String(e));
    console.log("  Error Code:", e?.code || 'N/A');
    console.log("  Full Error:", JSON.stringify(e, Object.getOwnPropertyNames(e), 2));
    
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

