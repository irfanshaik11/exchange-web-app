import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { TurnkeyProvider } from '@turnkey/react-wallet-kit';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { env } from '../env';

interface TurnkeyProviderWrapperProps {
  children: ReactNode;
}

/**
 * Wrapper component that conditionally renders TurnkeyProvider and GoogleOAuthProvider
 * only on the client side to avoid hydration mismatches.
 * 
 * If Turnkey env vars are not set, it just renders children without the providers.
 * This ensures server and client render the same structure initially.
 */
export function TurnkeyProviderWrapper({ children }: TurnkeyProviderWrapperProps) {
  const [isClient, setIsClient] = useState(false);
  const hasTurnkeyConfig = 
    env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID && 
    env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Calculate config values (always compute, even if not used)
  // Get OAuth redirect URI - must match exactly what's configured in Google Cloud Console
  const oauthRedirectUri = env.NEXT_PUBLIC_GOOGLE_OAUTH_REDIRECT_URI || 
    (typeof window !== 'undefined' 
      ? `${window.location.origin}/api/auth/callback/google`
      : null) ||
    (env.NEXT_PUBLIC_BACKEND_URL 
      ? `${env.NEXT_PUBLIC_BACKEND_URL}/api/auth/callback/google`
      : null) ||
    'http://localhost:3000/api/auth/callback/google';

  // Get auth proxy URL - use Turnkey's managed Auth Proxy if config ID is provided,
  // otherwise fall back to your own backend proxy
  const authProxyUrl = env.NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID
    ? (env.NEXT_PUBLIC_TURNKEY_AUTH_PROXY_URL || 'https://authproxy.turnkey.com')
    : (env.NEXT_PUBLIC_TURNKEY_SERVER_SIGN_URL || 
       (env.NEXT_PUBLIC_BACKEND_URL 
         ? `${env.NEXT_PUBLIC_BACKEND_URL}/api/turnkey`
         : 'http://localhost:8000/api/turnkey'));

  // Memoize config to ensure stable reference - MUST be called before any conditional returns
  const turnkeyConfig = useMemo(() => {
    if (!hasTurnkeyConfig || !authProxyUrl || authProxyUrl.trim() === '') {
      return null;
    }
    
    // Check if using Turnkey's managed Auth Proxy
    const usingManagedAuthProxy = !!env.NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID;
    
    return {
      // API Configuration (equivalent to Swift's apiUrl)
      apiBaseUrl: env.NEXT_PUBLIC_TURNKEY_API_BASE_URL || "https://api.turnkey.com",
      
      // Organization ID (equivalent to Swift's organizationId)
      organizationId: env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID!,
      
      // Auth Proxy URL (equivalent to Swift's authProxyUrl)
      // Use Turnkey's managed Auth Proxy if config ID is provided, otherwise use your backend
      authProxyUrl: authProxyUrl,
      
      // Auth Proxy Config ID (equivalent to Swift's authProxyConfigId)
      // REQUIRED when using Turnkey's managed Auth Proxy (https://authproxy.turnkey.com)
      // This is the token/ID you get from the Dashboard → AUTH section
      ...(usingManagedAuthProxy && {
        authProxyConfigId: env.NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID,
      }),
      
      // Relying Party ID (equivalent to Swift's rpId)
      // Required for WebAuthn/Passkey authentication
      // Should be your domain (e.g., "localhost" for dev, "yourdomain.com" for prod)
      ...(env.NEXT_PUBLIC_TURNKEY_RP_ID && {
        rpId: env.NEXT_PUBLIC_TURNKEY_RP_ID,
      }),
      
      // OAuth Configuration (equivalent to Swift's auth.oauth)
      auth: {
        oauthConfig: {
          googleClientId: env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID!,
          oauthRedirectUri: oauthRedirectUri,
          // You can add other OAuth providers here:
          // appleClientId: env.NEXT_PUBLIC_APPLE_OAUTH_CLIENT_ID,
          // xClientId: env.NEXT_PUBLIC_X_OAUTH_CLIENT_ID,
          // discordClientId: env.NEXT_PUBLIC_DISCORD_OAUTH_CLIENT_ID,
        },
      },
    };
  }, [hasTurnkeyConfig, authProxyUrl, oauthRedirectUri]);

  // Debug logging (only on client)
  useEffect(() => {
    if (isClient) {
      const usingManagedAuthProxy = !!env.NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID;
      console.log('[TurnkeyProvider] Config:', {
        hasOrgId: !!env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID,
        hasGoogleClientId: !!env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID,
        authProxyUrl,
        usingManagedAuthProxy,
        authProxyConfigId: usingManagedAuthProxy ? env.NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID : 'N/A (using backend proxy)',
        backendUrl: env.NEXT_PUBLIC_BACKEND_URL,
        explicitServerSignUrl: env.NEXT_PUBLIC_TURNKEY_SERVER_SIGN_URL,
        hasConfig: !!turnkeyConfig,
      });
    }
  }, [isClient, authProxyUrl, turnkeyConfig]);

  // During SSR/first render, always render children without Turnkey providers
  // This ensures server and client render the same thing initially (no hydration mismatch)
  if (!isClient || !hasTurnkeyConfig || !turnkeyConfig) {
    if (!authProxyUrl || authProxyUrl.trim() === '') {
      console.error('Turnkey authProxyUrl is not configured. Please set NEXT_PUBLIC_TURNKEY_SERVER_SIGN_URL or NEXT_PUBLIC_BACKEND_URL');
    }
    return <>{children}</>;
  }

  return (
    <TurnkeyProvider
      config={turnkeyConfig}
    >
      <GoogleOAuthProvider clientId={env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID}>
        {children}
      </GoogleOAuthProvider>
    </TurnkeyProvider>
  );
}

