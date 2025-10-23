# Critical Fix #5: No Holdings Check Before Sell

**Date**: 2025-10-21
**Status**: 🔍 ANALYSIS COMPLETE
**Severity**: 🔴 **CRITICAL**

---

## Problem Statement

**Current Issue**: Users can attempt to sell tokens they don't own, causing:
1. Transaction failures with gas loss (~$0.50-$5 per failed tx)
2. Confusing error messages
3. Wasted blockchain resources
4. Poor user experience

**Example Scenario**:
- User navigates to token page for TOKEN_ABC
- User clicks "Sell 50%"
- User has **0 TOKEN_ABC** in wallet
- Frontend allows the sell attempt
- Backend builds transaction
- Transaction fails on-chain
- User loses gas fees

---

## Root Cause Analysis

### Frontend (TradeActionPanel.tsx & SellPopup.tsx):
- **Line ~1414**: Sell button is always enabled if percentage is valid
- **Missing**: Token balance query before enabling sell
- **Missing**: Balance check before executing sell
- **Impact**: Users can click sell even with 0 holdings

### Backend (trade.controller.ts - sellPercentage):
- **Line ~1900**: Validates percentage but NOT token balance
- **Missing**: Query user's token balance before building transaction
- **Impact**: Builds invalid transaction that will fail

---

## Solution Design

### Frontend Implementation

#### Step 1: Query Token Balance
**File**: `TradeActionPanel.tsx`, `SellPopup.tsx`

```typescript
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import { useConnection } from '@solana/wallet-adapter-react';

// Query token balance
const { connection } = useConnection();
const [tokenBalance, setTokenBalance] = useState<number>(0);
const [isLoadingBalance, setIsLoadingBalance] = useState<boolean>(false);

useEffect(() => {
  async function fetchTokenBalance() {
    if (!token?.address || !wallet?.publicKey) return;

    setIsLoadingBalance(true);
    try {
      const tokenMint = new PublicKey(token.address);
      const userTokenAccount = await getAssociatedTokenAddress(
        tokenMint,
        wallet.publicKey
      );

      const accountInfo = await getAccount(connection, userTokenAccount);
      const decimals = token.decimals || 9;
      const balance = Number(accountInfo.amount) / Math.pow(10, decimals);

      setTokenBalance(balance);
    } catch (error) {
      // Account doesn't exist = 0 balance
      setTokenBalance(0);
    } finally {
      setIsLoadingBalance(false);
    }
  }

  fetchTokenBalance();
}, [token?.address, wallet?.publicKey, connection]);
```

#### Step 2: Validate Balance Before Sell
```typescript
// In handleSell() function
if (tokenBalance === 0) {
  setMessage({
    type: "error",
    text: `You don't own any ${token.symbol || 'tokens'}`
  });
  toast.error(`No ${token.symbol || 'tokens'} to sell. Balance: 0`);
  return;
}

// For percentage-based sells
const amountToSell = (tokenBalance * percentage) / 100;
if (amountToSell === 0 || amountToSell < 0.000001) {
  setMessage({
    type: "error",
    text: `Amount too small to sell (${amountToSell.toFixed(6)} tokens)`
  });
  toast.error('Sell amount too small after percentage calculation');
  return;
}
```

#### Step 3: Update UI to Show Balance
```typescript
<div className="balance-display">
  {isLoadingBalance ? (
    <span>Loading balance...</span>
  ) : (
    <span>
      Your balance: {tokenBalance.toLocaleString()} {token.symbol}
    </span>
  )}
</div>
```

---

### Backend Implementation

#### Step 1: Add Holdings Validation to Utils
**File**: `memecoin_backend4/src/utils/validation.ts`

```typescript
/**
 * Validate user has token holdings before sell
 */
export async function validateTokenHoldings(
  connection: Connection,
  walletPubkey: PublicKey,
  tokenMint: PublicKey,
  tokenProgramId: PublicKey
): Promise<ValidationError | null> {
  try {
    const userTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      walletPubkey,
      false,
      tokenProgramId
    );

    // Try to get account info
    const accountInfo = await getAccount(
      connection,
      userTokenAccount,
      undefined,
      tokenProgramId
    );

    const balance = Number(accountInfo.amount);

    if (balance === 0) {
      return {
        field: 'tokenBalance',
        message: 'You do not own any of this token. Cannot sell 0 tokens.',
        value: 0
      };
    }

    return null;
  } catch (error: any) {
    // Account not found = 0 balance
    if (error.message?.includes('could not find')) {
      return {
        field: 'tokenBalance',
        message: 'No token account found. You do not own this token.',
        value: 0
      };
    }

    // Other errors (network, etc)
    throw error;
  }
}
```

#### Step 2: Update Sell Endpoint
**File**: `memecoin_backend4/src/controllers/trade.controller.ts` (sellPercentage)

```typescript
// After parameter validation, add holdings check:

console.log(`\n💰 Checking token holdings...`);

// Determine token address
let tokenMintAddress: PublicKey;
if (baseMint === 'So11111111111111111111111111111111111111112') {
  tokenMintAddress = new PublicKey(quoteMint);
} else {
  tokenMintAddress = new PublicKey(baseMint);
}

// Determine token program (TOKEN or TOKEN_2022)
const tokenProgramId = // ... detection logic

// Validate holdings
const { validateTokenHoldings } = await import('../utils/validation');
const holdingsError = await validateTokenHoldings(
  connection,
  walletPublickey,
  tokenMintAddress,
  tokenProgramId
);

if (holdingsError) {
  console.error(`   ❌ Holdings check failed: ${holdingsError.message}`);
  return res.status(400).json({
    error: 'Insufficient token holdings',
    code: 'NO_HOLDINGS',
    details: {
      tokenAddress: tokenMintAddress.toBase58(),
      balance: holdingsError.value,
      message: holdingsError.message
    },
    suggestions: [
      'You must own the token before selling',
      'Check your wallet for the correct token',
      'Verify you are connected to the right wallet'
    ]
  });
}

console.log(`   ✅ Token holdings verified`);
```

---

## Edge Cases to Handle

### 1. ❌ **Zero Balance**
**Scenario**: User has 0 tokens
**Fix**: Block sell, show clear message "You don't own any [TOKEN]"

### 2. ❌ **Token Account Doesn't Exist**
**Scenario**: User never received this token (no ATA created)
**Fix**: Treat as 0 balance, same error as above

### 3. ❌ **Dust Amount (Very Small Balance)**
**Scenario**: User has 0.000000001 tokens (less than minimum)
**Fix**: Show warning "Balance too small to sell: 0.000000001 [TOKEN]"

### 4. ❌ **Percentage Results in 0 Amount**
**Scenario**: User has 100 tokens, sells 0.0001% = 0.0001 tokens
**Fix**: Block sell, "Amount too small after percentage calculation"

### 5. ❌ **Wrong Token Program (TOKEN vs TOKEN_2022)**
**Scenario**: Using TOKEN_PROGRAM_ID but token is TOKEN_2022
**Fix**: Auto-detect correct program ID

### 6. ❌ **Network Error During Balance Check**
**Scenario**: RPC timeout when querying balance
**Fix**: Show retry option, don't block indefinitely

---

## Test Cases

| # | Scenario | Balance | Sell % | Expected Behavior | Status |
|---|----------|---------|--------|-------------------|--------|
| 1 | Zero balance | 0 | 50% | ❌ Block + error "No tokens to sell" | ⏸️ |
| 2 | No token account | N/A | 50% | ❌ Block + error "No token account" | ⏸️ |
| 3 | Sufficient balance | 1000 | 50% | ✅ Allow sell 500 tokens | ⏸️ |
| 4 | Dust balance | 0.0001 | 100% | ⚠️ Warning "Amount too small" | ⏸️ |
| 5 | Percentage = 0% | 1000 | 0% | ❌ Block + error "Invalid percentage" | ⏸️ |
| 6 | Percentage > 100% | 1000 | 150% | ❌ Block + error "Max 100%" | ⏸️ |
| 7 | Network error | ? | 50% | ⚠️ Show retry option | ⏸️ |
| 8 | Wrong program ID | 1000 | 50% | ✅ Auto-detect correct program | ⏸️ |

---

## Implementation Plan

### Frontend:
1. ✅ Add token balance query hook
2. ✅ Add balance display in UI
3. ✅ Add balance check before sell
4. ✅ Add clear error messages
5. ✅ Add loading state during balance check

**Estimated Time**: 30 minutes

### Backend:
1. ✅ Add `validateTokenHoldings()` to validation.ts
2. ✅ Integrate into sellPercentage endpoint
3. ✅ Handle TOKEN vs TOKEN_2022 programs
4. ✅ Return structured errors
5. ✅ Add logging

**Estimated Time**: 25 minutes

### Testing:
1. ✅ Test zero balance scenario
2. ✅ Test no token account scenario
3. ✅ Test sufficient balance scenario
4. ✅ Test dust amounts
5. ✅ Test percentage edge cases

**Estimated Time**: 20 minutes

**Total**: ~75 minutes

---

## Files to Modify

### Frontend:
- `src/components/trade/TradeActionPanel.tsx` - Add balance check
- `src/components/SellPopup.tsx` - Add balance check
- `src/hooks/useTokenBalance.ts` (NEW) - Reusable balance hook

### Backend:
- `memecoin_backend4/src/utils/validation.ts` - Add validateTokenHoldings()
- `memecoin_backend4/src/controllers/trade.controller.ts` - Integrate validation

### Tests:
- `tests/run-holdings-check-tests.js` (NEW) - Frontend tests
- `memecoin_backend4/tests/holdings.test.js` (NEW) - Backend tests

---

## Success Criteria

✅ **Frontend**:
- Sell button disabled if balance = 0
- Clear error message shown
- Balance displayed to user
- No unnecessary RPC calls (cached balance)

✅ **Backend**:
- Validates holdings before building transaction
- Returns structured error for 0 balance
- Handles both TOKEN and TOKEN_2022 programs
- Logs holdings check results

✅ **Testing**:
- All 8 test cases pass
- Automated tests cover edge cases
- Manual UI testing successful

---

## Ready to Implement?

**Checklist**:
- [x] Problem analyzed
- [x] Solution designed
- [x] Test cases planned
- [x] Files identified
- [x] Edge cases documented
- [ ] Frontend implementation
- [ ] Backend implementation
- [ ] Tests created
- [ ] Documentation updated

**Proceed with implementation?** ✅ Ready!
