# Fixing Google OAuth Redirect URI Mismatch

## Error
```
Error 400: redirect_uri_mismatch
```

This error occurs when the redirect URI sent to Google doesn't match what's configured in Google Cloud Console.

## Solution

### Step 1: Check Current Redirect URI

The app is using:
- **Environment variable** (if set): `NEXT_PUBLIC_GOOGLE_OAUTH_REDIRECT_URI`
- **Fallback**: `window.location.origin` (e.g., `http://localhost:3000`)

### Step 2: Configure in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **Credentials**
3. Click on your OAuth 2.0 Client ID
4. Under **Authorized redirect URIs**, add:
   - **Development**: `http://localhost:3000` (or your dev port)
   - **Production**: `https://yourdomain.com` (your production domain)

### Step 3: Set Environment Variable (Recommended)

Add to your `.env.local`:

```bash
# For development
NEXT_PUBLIC_GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000

# For production (update with your actual domain)
# NEXT_PUBLIC_GOOGLE_OAUTH_REDIRECT_URI=https://yourdomain.com
```

### Step 4: Verify Redirect URI Format

The redirect URI must:
- ✅ Match **exactly** (including protocol, domain, port, and path if any)
- ✅ Be one of the authorized redirect URIs in Google Cloud Console
- ✅ Use `http://` for localhost (not `https://`)
- ✅ Use `https://` for production

### Common Issues

1. **Port mismatch**: If running on port 3001, but Google Console has 3000
2. **Protocol mismatch**: Using `https://localhost:3000` instead of `http://localhost:3000`
3. **Trailing slash**: `http://localhost:3000/` vs `http://localhost:3000`
4. **Path included**: `http://localhost:3000/callback` vs `http://localhost:3000`

### Testing

After updating:
1. Restart your Next.js dev server
2. Clear browser cache/cookies
3. Try Google login again

The redirect URI should now match and the error should be resolved.

