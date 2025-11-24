# Turnkey Auth Proxy Verification Guide

## ✅ Auth Proxy IS Implemented

Your backend **already has** the auth proxy implemented at `/api/turnkey`. Here's what's set up:

### Backend Implementation

**Location**: `exchange-backend/src/app.ts` (line 29)
```typescript
app.post('/api/turnkey', turnkeyProxyHandler)
```

**Handler**: `exchange-backend/src/utils/turnkey/index.ts`
- Uses `@turnkey/sdk-server`'s `expressProxyHandler`
- Supports all required methods for `@turnkey/react-wallet-kit`

### Supported Methods

The proxy handler supports:
- ✅ `createSubOrganization` - Create user sub-orgs
- ✅ `getSubOrgIds` - Find existing sub-orgs
- ✅ `proxyOAuth2Authenticate` - Exchange OAuth code for OIDC token
- ✅ `completeOauth` - Complete OAuth login
- ✅ `oauthLogin` - Alternative OAuth login
- ✅ `createWallet` - Create embedded wallets
- ✅ And many more...

## 🔍 Verification Steps

### 1. Check Backend is Running

The backend should be running on port **8000**:

```bash
# Check if backend is running
curl http://localhost:8000/
# Should return: "API is running ✅"
```

### 2. Check Environment Variables

**Backend** (`.env` in `exchange-backend/`):
```bash
TURNKEY_PUBLIC_KEY=your_public_key
TURNKEY_PRIVATE_KEY=your_private_key
TURNKEY_ORGANIZATION_ID=your_org_id
PORT=8000
```

**Frontend** (`.env.local` in `exchange-web-app/`):
```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
# OR explicitly set:
NEXT_PUBLIC_TURNKEY_SERVER_SIGN_URL=http://localhost:8000/api/turnkey
```

### 3. Test the Auth Proxy Endpoint

```bash
# Test if the endpoint responds
curl -X POST http://localhost:8000/api/turnkey \
  -H "Content-Type: application/json" \
  -d '{
    "method": "getSubOrgIds",
    "params": [{"filterType": "OIDC_TOKEN", "filterValue": "test"}]
  }'
```

**Expected**: Should return a response (may be an error if test token is invalid, but endpoint should respond).

### 4. Check Frontend Configuration

The frontend should point to your backend:

```typescript
// In TurnkeyProviderWrapper.tsx
authProxyUrl: env.NEXT_PUBLIC_TURNKEY_SERVER_SIGN_URL || 
  `${env.NEXT_PUBLIC_BACKEND_URL}/api/turnkey`
```

## 🐛 Common Issues

### Issue: "Auth Proxy URL or ID is not configured"

**Cause**: Frontend can't find the backend URL

**Fix**:
1. Set `NEXT_PUBLIC_BACKEND_URL=http://localhost:8000` in `.env.local`
2. Or set `NEXT_PUBLIC_TURNKEY_SERVER_SIGN_URL=http://localhost:8000/api/turnkey`
3. Restart your Next.js dev server

### Issue: CORS Errors

**Cause**: Backend CORS not allowing frontend origin

**Fix**: Backend already has `origin: '*'` in CORS config, so this shouldn't be an issue.

### Issue: 404 on `/api/turnkey`

**Cause**: Backend not running or wrong port

**Fix**:
1. Make sure backend is running: `cd exchange-backend && npm run dev`
2. Check backend port matches `NEXT_PUBLIC_BACKEND_URL` (should be 8000)
3. Verify endpoint exists: `curl http://localhost:8000/api/turnkey` (should not 404)

### Issue: "Method not allowed"

**Cause**: Method not in `allowedMethods` array

**Fix**: Check `exchange-backend/src/utils/turnkey/index.ts` - ensure method is in the `allowedMethods` array.

## ✅ Quick Checklist

- [ ] Backend is running on port 8000
- [ ] `NEXT_PUBLIC_BACKEND_URL=http://localhost:8000` is set in frontend `.env.local`
- [ ] Backend has `TURNKEY_PUBLIC_KEY`, `TURNKEY_PRIVATE_KEY`, `TURNKEY_ORGANIZATION_ID`
- [ ] Test endpoint: `curl http://localhost:8000/api/turnkey` doesn't 404
- [ ] Frontend dev server restarted after env changes

## 🚀 Next Steps

Once verified:
1. Try Google login again
2. Check browser console for any errors
3. Check backend logs for incoming requests to `/api/turnkey`

