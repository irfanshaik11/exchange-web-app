# 🔑 Pair Address vs Mint Address - IMPORTANT!

## ❌ The Problem You're Experiencing

You're passing a **PAIR ADDRESS** but the Token Analytics API needs a **MINT ADDRESS**.

### What's the Difference?

| Type | What It Is | Example | Can Fetch Holders? |
|------|-----------|---------|-------------------|
| **Pair Address** | Liquidity pool address (Raydium, Orca, etc.) | `7Uo4hZbrDN3FECbLxeG9wT8TZnWFxrEF8SwDt9oYfyWG` | ❌ NO - It's a pool, not a token |
| **Mint Address** | The actual token contract | `DKiykx2ATmbt5ufaDpGka8b2kzi39TdqmHx4K66game` | ✅ YES - This is the token! |

## 🔍 Why Your Test Failed

```
Address: 7Uo4hZbrDN3FECbLxeG9wT8TZnWFxrEF8SwDt9oYfyWG
Result: total_holders_count: 0

Why: This is a LIQUIDITY POOL address, not a token.
      A pool doesn't have "holders", tokens do!
```

## ✅ How to Fix This

### Option 1: Your Tokens Need a `mint` Field

Your token data should include BOTH:
```javascript
{
  pair_address: "7Uo4hZbrDN3FECbLxeG9wT8TZnWFxrEF8SwDt9oYfyWG",  // Pool address
  mint: "DKiykx2ATmbt5ufaDpGka8b2kzi39TdqmHx4K66game",           // ✅ Token mint
  symbol: "GAME",
  name: "Game Token"
}
```

### Option 2: Extract Mint from Pair

If your token service only has pair addresses, you need to:

1. **Query the pair contract** to get the token mints
2. **Add the mint field** to your token data

Example using your token service:
```typescript
// In your token service API
const pairInfo = await getPairInfo(pairAddress);
// Returns: { tokenA: "SOL_MINT", tokenB: "GAME_MINT" }

// Add to token object:
token.mint = pairInfo.tokenB; // or tokenA, depending on which is the actual token
```

## 🧪 Test with Correct Addresses

### ✅ Good Test - Token Mint Address:
```
DKiykx2ATmbt5ufaDpGka8b2kzi39TdqmHx4K66game
```
Result: Shows 19 holders, 100% whale concentration

### ❌ Bad Test - Pair Address:
```
7Uo4hZbrDN3FECbLxeG9wT8TZnWFxrEF8SwDt9oYfyWG
```
Result: Shows 0 holders (because it's not a token!)

## 🔧 Quick Fix for Your PulseTable

Check your console logs. You'll see:
```
⚠️ No mint address provided for sniper metric
```

This means your tokens don't have a `mint` field!

### Solution:
Update your token data source to include the mint address.

If you're getting data from your token service API endpoint, make sure it returns:
```json
{
  "pair_address": "...",
  "mint": "...",  // ← ADD THIS!
  "symbol": "...",
  "name": "..."
}
```

## 📊 Where to Find Mint Addresses

### From Solscan:
1. Go to pair address on Solscan
2. Look for "Token Account" section
3. Find the token mint (not SOL)

### From Your Token Service:
You likely have a `/tokens/:mint/metrics` endpoint that returns both:
- Token mint address
- Pair address

Use the **token mint** for holder analytics!

## 🎯 Summary

**What You're Passing:** Pair address (pool)
**What You Need:** Mint address (token)

**Quick Test:**
```bash
# Open test page and try this mint address:
DKiykx2ATmbt5ufaDpGka8b2kzi39TdqmHx4K66game
```

This should show real holder data!

---

## 🚀 Next Steps

1. **Check your token data** - Does it have a `mint` field?
2. **If NO:** Update your token service to include mint addresses
3. **If YES:** Check console for "⚠️ No mint address" warnings
4. **Test with a known mint address** in test-single-token.html

The Token Analytics API **requires** a token mint address to fetch holder data. Pair addresses won't work!


