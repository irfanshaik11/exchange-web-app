// src/components/TurnkeyRootProvider.tsx
"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import { env } from '../env';

import {
  TurnkeyProvider,
  type TurnkeyProviderConfig,
} from "@turnkey/react-wallet-kit";

// Helper function to clear stale Turnkey session data from IndexedDB
async function clearTurnkeyIndexedDB() {
  if (typeof indexedDB === 'undefined') return;
  
  try {
    // List of known Turnkey IndexedDB databases
    // Per Turnkey docs, the SDK uses IndexedDB to store session key pairs
    const turnkeyDBs = [
      'TurnkeySDKKeyStore',
      'turnkey-sdk',
      'turnkey',
      'TurnkeyKeyStore',
      'turnkey-key-store',
    ];
    
    for (const dbName of turnkeyDBs) {
      try {
        const deleteRequest = indexedDB.deleteDatabase(dbName);
        // Wait for deletion to complete
        await new Promise<void>((resolve, reject) => {
          deleteRequest.onsuccess = () => {
            console.log(`[Turnkey] Deleted IndexedDB: ${dbName}`);
            resolve();
          };
          deleteRequest.onerror = () => {
            // Ignore errors - DB may not exist
            resolve();
          };
          deleteRequest.onblocked = () => {
            console.warn(`[Turnkey] IndexedDB deletion blocked for: ${dbName}`);
            resolve();
          };
        });
      } catch (e) {
        // Ignore individual DB deletion errors
      }
    }
  } catch (err) {
    console.warn('[Turnkey] Failed to clear IndexedDB:', err);
  }
}

// Helper to clear all Turnkey session data
// Per Turnkey docs, clearing session requires removing both the JWT and the IndexedDB key pairs
export async function clearTurnkeySession() {
  console.log('[Turnkey] Clearing stale session data...');
  
  // Clear IndexedDB (where Turnkey stores unextractable P-256 key pairs)
  await clearTurnkeyIndexedDB();
  
  // Clear localStorage items that might have Turnkey data
  // This includes session tokens, client state, and key references
  if (typeof localStorage !== 'undefined') {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.includes('turnkey') || 
        key.includes('Turnkey') ||
        key.includes('@turnkey') ||
        key.includes('session') ||
        key.includes('Session')
      )) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      console.log(`[Turnkey] Removed localStorage: ${key}`);
    });
  }
  
  // Clear sessionStorage items
  if (typeof sessionStorage !== 'undefined') {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && (
        key.includes('turnkey') || 
        key.includes('Turnkey') ||
        key.includes('@turnkey') ||
        key.includes('session') ||
        key.includes('Session')
      )) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => {
      sessionStorage.removeItem(key);
      console.log(`[Turnkey] Removed sessionStorage: ${key}`);
    });
  }
  
  console.log('[Turnkey] Session data cleared successfully.');
}

export function TurnkeyRootProvider({ children }: { children: React.ReactNode }) {
  const turnkeyConfig: TurnkeyProviderConfig = useMemo(() => {
    // Prefer env vars and avoid any hardcoded defaults
    const orgId = env.NEXT_PUBLIC_ORGANIZATION_ID || env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID || ''
    const proxyConfigId = env.NEXT_PUBLIC_AUTH_PROXY_CONFIG_ID || '';
    const apiBaseUrl = env.NEXT_PUBLIC_TURNKEY_API_BASE_URL || ''
    const authProxyUrl = 'https://authproxy.turnkey.com';
      

    const config: TurnkeyProviderConfig = {
      apiBaseUrl,
      organizationId: orgId,
      authProxyConfigId: proxyConfigId,
      authProxyUrl,

      auth: {
        oauthConfig: {
          // Let Turnkey handle the redirect details; config lives in dashboard
          openOauthInPage: true,
          oauthRedirectUri: "https://app.narrative.trade/pulse?chain=monad"
        },
        methods: {
          googleOauthEnabled: true,
          // Toggle any others you actually want:
          emailOtpAuthEnabled: false,
          smsOtpAuthEnabled: false,
          passkeyAuthEnabled: true,
          walletAuthEnabled: true, // ENABLED for Phantom/MetaMask auth
        },
        // Optional, but keeps UI ordering nice if you ever show their modal:
        methodOrder: ["socials", "email", "sms", "passkey", "wallet"],
        verifyWalletOnSignup: true,
        // Provide default sub-org params so wallet auth flows inherit the same settings
        createSuborgParams: {
          walletAuth: {},
        },
      },

      // Wallet authentication configuration for Phantom/MetaMask
      walletConfig: {
        features: {
          auth: true, // Enable external wallet authentication
        },
        chains: {
          ethereum: {
            native: true, // Enable native EIP-1193 providers (MetaMask)
          },
          solana: {
            native: true, // Enable native Solana Wallet Standard providers (Phantom)
          },
        },
        // WalletConnect optional - uncomment if you have a project ID
        // walletConnect: {
        //   projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || '',
        //   appMetadata: {
        //     name: "Narrative",
        //     description: "Trade tokens on Narrative",
        //     url: "https://app.narrative.trade",
        //     icons: ["https://app.narrative.trade/narrative-logo.png"],
        //   },
        // },
      },

      ui: {
        renderModalInProvider: true,
      },
    };

    return config;
  }, []);

  useEffect(() => {
    console.log("[Turnkey] client env", {
      orgId: turnkeyConfig.organizationId,
      authProxyConfigId: turnkeyConfig.authProxyConfigId,
      authProxyUrl: turnkeyConfig.authProxyUrl,
      methods: turnkeyConfig.auth?.methods,
      apiBaseUrl: turnkeyConfig.apiBaseUrl,
    });

    if (!turnkeyConfig.organizationId || !turnkeyConfig.authProxyConfigId) {
      console.warn(
        "[Turnkey] Missing required config. Set NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID (or NEXT_PUBLIC_ORGANIZATION_ID) and NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID (or NEXT_PUBLIC_AUTH_PROXY_CONFIG_ID)."
      );
    }
  }, [turnkeyConfig]);

  // Handle Turnkey errors, including stale session key errors
  const handleTurnkeyError = useCallback(async (err: any) => {
    const errorMessage = (err?.message || err?.cause?.message || err?.toString() || '').toLowerCase();
    
    // Handle "no active session" error - this is expected when user opens export modal
    // before signing in with Turnkey. The UI will prompt them to sign in.
    if (
      errorMessage.includes('no active session') ||
      errorMessage.includes('no_session_found') ||
      errorMessage.includes('requires a valid session')
    ) {
      console.log('[Turnkey] No active session - user needs to sign in with Turnkey');
      // Don't show alert - the UI will handle this gracefully
      return;
    }
    
    // Handle "key not found" errors - these often happen during wallet-auth flow
    // due to a race condition in the SDK where it tries to refresh wallets before
    // the session key is fully persisted to IndexedDB
    if (
      errorMessage.includes('key not found for publickey') ||
      errorMessage.includes('key not found') ||
      (errorMessage.includes('indexeddb') && errorMessage.includes('not found'))
    ) {
      // Log but don't disrupt the user - the login may still succeed
      console.warn('[Turnkey] Key not found error (may be transient during wallet-auth):', errorMessage);
      // Don't show alert or reload - the login flow may still complete successfully
      // The user can retry if needed
      return;
    }
    
    // Handle "failed to fetch wallets" during login - this is often a side effect
    // of the key not found error and shouldn't block login
    if (errorMessage.includes('failed to fetch wallets')) {
      console.warn('[Turnkey] Failed to fetch wallets during auth flow (non-blocking):', errorMessage);
      // Don't disrupt - this happens during handlePostAuth in wallet-auth and is non-fatal
      return;
    }
    
    // Log other errors but don't show disruptive alerts
    console.error("Turnkey error:", err);
  }, []);

  return (
    <TurnkeyProvider
      config={turnkeyConfig}
      callbacks={{
        onError: handleTurnkeyError,
      }}
    >
      {children}
    </TurnkeyProvider>
  );
}
