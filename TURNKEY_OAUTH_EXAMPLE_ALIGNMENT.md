# Aligning with Turnkey OAuth Example

Based on the [Turnkey OAuth example](https://github.com/tkhq/sdk/tree/main/examples/oauth), here's how to align the implementation:

## Key Differences from Example

### Example Pattern (from GitHub)
The example uses `@turnkey/react-wallet-kit` which has built-in sub-org creation with wallet via `createSuborgParams` in the provider config. However, we're using `@turnkey/sdk-react` with `serverSign`, which requires a different approach.

### Our Implementation
We're using `turnkey.serverSign("createSubOrganization", [...])` which should work, but the 500 error suggests:

1. **Backend issue**: The `expressProxyHandler` might not be handling the request correctly
2. **Environment variables**: Missing or invalid Turnkey API keys
3. **Request format**: The request might need to be structured differently

## Verified Structure ✅

Based on the TypeScript types, our structure is **correct**:

```typescript
{
  subOrganizationName: string;
  rootUsers: [...];
  rootQuorumThreshold: number;
  wallet?: {
    walletName: string;
    accounts: [{
      curve: "CURVE_SECP256K1" | "CURVE_ED25519";
      pathFormat: "PATH_FORMAT_BIP32";
      path: string;
      addressFormat: "ADDRESS_FORMAT_ETHEREUM" | "ADDRESS_FORMAT_SOLANA";
    }];
  };
}
```

This matches `v1CreateSubOrganizationIntentV7` exactly.

## Debugging the 500 Error

### Step 1: Check Backend Logs
After restarting backend, you should see:
```
📥 Turnkey proxy request: { method: 'createSubOrganization', ... }
```

If you see an error after this, it will show the actual problem.

### Step 2: Verify Backend Environment
```bash
cd /Users/ojasva/Desktop/exchange-backend
cat .env | grep TURNKEY
```

Must have:
- `TURNKEY_PUBLIC_KEY` (66 hex chars, no 0x)
- `TURNKEY_PRIVATE_KEY` (full private key)
- `TURNKEY_ORGANIZATION_ID` (your org ID)

### Step 3: Test Backend Endpoint
```bash
curl -X POST http://localhost:8000/api/turnkey \
  -H "Content-Type: application/json" \
  -d '{
    "method": "getSubOrgIds",
    "params": [{"filterType": "OIDC_TOKEN", "filterValue": "test"}]
  }'
```

If this works but `createSubOrganization` doesn't, the issue is specific to that method.

## Alternative: Remove Wallet Temporarily

If the wallet property is causing issues, we can create the wallet separately:

1. Create sub-org without wallet
2. After login, create wallet using `createWallet`
3. This matches the pattern we had before

But based on the types, `wallet` should work in `createSubOrganization`.

## Next Steps

1. **Check backend logs** for the exact error message
2. **Verify environment variables** are set correctly
3. **Test with simpler request** first (getSubOrgIds)
4. **If still failing**, we can fall back to separate wallet creation

The structure is correct according to the TypeScript types, so the issue is likely in:
- Backend configuration
- Environment variables
- Request handling in expressProxyHandler

