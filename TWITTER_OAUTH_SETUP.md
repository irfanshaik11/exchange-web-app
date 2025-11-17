# Twitter OAuth 2.0 Integration Setup Guide

This guide explains how to set up and use the Twitter OAuth 2.0 authentication for the "Link Your Twitter" feature.

## Overview

The implementation uses the **X API v2** with OAuth 2.0 PKCE (Proof Key for Code Exchange) flow for secure user authentication. This allows users to link their Twitter accounts without exposing sensitive credentials.

### What Was Implemented

1. **OAuth 2.0 Authentication Flow** - Secure authentication using PKCE
2. **API Endpoints**:
   - `/api/twitter/auth` - Initiates OAuth flow
   - `/api/twitter/callback` - Handles OAuth callback
   - `/api/twitter/verify-auth` - Verifies authentication status
   - `/api/twitter/logout` - Logs out user
3. **Utility Functions** - Helper functions for OAuth operations
4. **Frontend Integration** - Updated `ReferralAccessGate` component

## Prerequisites

Before you can use this feature, you need to:

1. **Create a Twitter Developer Account**
   - Go to [https://developer.twitter.com/](https://developer.twitter.com/)
   - Sign up or log in
   - Apply for developer access if needed

2. **Create a Twitter App**
   - Go to the [Developer Portal](https://developer.twitter.com/en/portal/dashboard)
   - Create a new Project and App
   - Note down your **App ID** (Client ID)

3. **Configure OAuth 2.0 Settings**
   - In your app settings, go to "User authentication settings"
   - Enable OAuth 2.0
   - Set the OAuth 2.0 Type: **Web App, Automated App or Bot**
   - Configure the following scopes:
     - `tweet.read` - Read tweets
     - `users.read` - Read user information
     - `offline.access` - Refresh tokens for extended sessions

4. **Set Redirect URIs**
   - Add your callback URL(s) in the app settings:
     - Development: `http://localhost:3000/api/twitter/callback`
     - Production: `https://yourdomain.com/api/twitter/callback`

## Environment Variables

Add the following environment variables to your `.env.local` file:

```env
# X API OAuth 2.0 Credentials
X_CLIENT_ID=your_client_id_here
X_CLIENT_SECRET=your_client_secret_here
X_REDIRECT_URI=http://localhost:3000/api/twitter/callback

# Optional: Session secret for additional security
NEXTAUTH_SECRET=your_random_secret_here

# Existing X API credentials (for other features)
X_API_KEY=your_api_key
X_API_KEY_SECRET=your_api_secret
X_BEARER_TOKEN=your_bearer_token
```

### How to Get These Values

1. **X_CLIENT_ID** (OAuth 2.0 Client ID):
   - In Developer Portal → Your App → Keys and tokens
   - Find "OAuth 2.0 Client ID"

2. **X_CLIENT_SECRET** (OAuth 2.0 Client Secret):
   - Same location as Client ID
   - Click "Generate" if not already generated
   - **Keep this secret!** Never commit to version control

3. **X_REDIRECT_URI**:
   - Must match exactly what you configured in app settings
   - Development: `http://localhost:3000/api/twitter/callback`
   - Production: Update with your domain

4. **NEXTAUTH_SECRET** (Optional but recommended):
   - Generate a random string (at least 32 characters)
   - You can generate one using: `openssl rand -base64 32`

## How It Works

### Authentication Flow

1. **User clicks "Link Your Twitter"**
   ```
   User → Frontend → /api/twitter/auth
   ```

2. **OAuth Initiation**
   ```
   - Generate random state (CSRF protection)
   - Generate PKCE code verifier and challenge
   - Store in secure HTTP-only cookies
   - Redirect to Twitter authorization page
   ```

3. **User authorizes on Twitter**
   ```
   User authorizes → Twitter redirects to callback
   ```

4. **Token Exchange**
   ```
   /api/twitter/callback:
   - Verify state parameter (CSRF check)
   - Exchange authorization code for access token
   - Get user information from Twitter
   - Store in secure HTTP-only cookies
   - Redirect back to app
   ```

5. **Verify Authentication**
   ```
   Frontend → /api/twitter/verify-auth
   Returns: { authenticated: true, user: {...} }
   ```

### Security Features

- **PKCE (Proof Key for Code Exchange)** - Prevents authorization code interception
- **State Parameter** - CSRF protection
- **HTTP-Only Cookies** - Protects tokens from XSS attacks
- **Secure Cookies** - HTTPS-only in production
- **SameSite Cookies** - Additional CSRF protection

## API Reference

### POST /api/twitter/auth

Initiates Twitter OAuth 2.0 flow.

**Query Parameters:**
- `return_url` (optional) - URL to redirect to after successful authentication

**Example:**
```javascript
window.location.href = '/api/twitter/auth?return_url=/dashboard';
```

### GET /api/twitter/callback

Handles OAuth callback from Twitter. This endpoint is automatically called by Twitter after user authorization.

**Query Parameters (from Twitter):**
- `code` - Authorization code
- `state` - State parameter for CSRF protection
- `error` - Error code (if authorization failed)
- `error_description` - Error description

### GET /api/twitter/verify-auth

Checks if user is authenticated and returns user information.

**Response:**
```json
{
  "authenticated": true,
  "user": {
    "id": "123456789",
    "username": "johndoe",
    "name": "John Doe",
    "profile_image_url": "https://..."
  }
}
```

### POST /api/twitter/logout

Logs out the user and clears Twitter authentication cookies.

**Response:**
```json
{
  "success": true,
  "message": "Successfully logged out from Twitter"
}
```

## Usage in Frontend

The `ReferralAccessGate` component has been updated to use the new OAuth flow:

```tsx
// Check authentication status
const checkTwitterAuth = useCallback(async () => {
  setCheckingTwitter(true);
  try {
    const response = await fetch('/api/twitter/verify-auth');
    const data = await response.json();
    if (data.authenticated && data.user) {
      setTwitterLinked(true);
      setTwitterUsername(data.user.username);
    }
  } finally {
    setCheckingTwitter(false);
  }
}, []);

// Initiate OAuth flow
const handleLinkTwitter = useCallback(() => {
  const returnUrl = window.location.origin + '/';
  window.location.href = `/api/twitter/auth?return_url=${encodeURIComponent(returnUrl)}`;
}, []);
```

## Testing

### Local Development

1. Make sure all environment variables are set in `.env.local`
2. Start the development server: `npm run dev`
3. Navigate to the waitlist modal
4. Click "Link Your Twitter"
5. You should be redirected to Twitter's authorization page
6. After authorization, you should be redirected back with your Twitter info displayed

### Common Issues

**Issue: "Invalid redirect_uri"**
- Solution: Make sure `X_REDIRECT_URI` matches exactly what's configured in Twitter app settings

**Issue: "Invalid state parameter"**
- Solution: Clear cookies and try again. This usually happens if cookies expire during the OAuth flow

**Issue: "Authentication failed"**
- Solution: Check server logs for detailed error messages. Verify all environment variables are correct.

## Production Deployment

1. **Update Environment Variables**:
   ```env
   X_REDIRECT_URI=https://yourdomain.com/api/twitter/callback
   ```

2. **Update Twitter App Settings**:
   - Add production callback URL to allowed redirect URIs
   - Update Website URL to your production domain

3. **Enable Secure Cookies**:
   - Set `NODE_ENV=production`
   - Ensure your site is served over HTTPS

4. **Test the Flow**:
   - Test end-to-end authentication
   - Verify cookies are set with Secure flag
   - Test logout functionality

## API Tiers

According to [X API documentation](https://docs.x.com/x-api/introduction):

- **Free Tier**: Includes "Login with X" access
- **Basic Tier** ($200/month): Full v2 endpoints access
- **Pro Tier** ($5,000/month): Advanced features

The OAuth 2.0 authentication (Login with X) is available on all tiers including the free tier.

## Additional Features

### Token Refresh

The implementation includes support for refresh tokens, which allow maintaining authentication without requiring users to re-authorize frequently.

Tokens are automatically stored when received from Twitter. To implement automatic token refresh:

```typescript
import { refreshAccessToken } from '../utils/twitterAuth';

// When access token expires
const newTokens = await refreshAccessToken(refreshToken);
```

### User Information

The authenticated user's information is stored in a secure cookie and can be accessed via `/api/twitter/verify-auth`.

## Support

For issues related to:
- **X API**: [X API Support](https://developer.x.com/en/support/twitter-api.html)
- **Developer Community**: [X Developer Forum](https://devcommunity.x.com/)

## References

- [X API v2 Documentation](https://docs.x.com/x-api/introduction)
- [OAuth 2.0 Guide](https://developer.twitter.com/en/docs/authentication/oauth-2-0)
- [Login with X](https://developer.twitter.com/en/docs/authentication/guides/log-in-with-twitter)





