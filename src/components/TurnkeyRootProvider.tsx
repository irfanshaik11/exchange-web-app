// src/components/TurnkeyRootProvider.tsx
"use client";

import React, { useEffect, useMemo } from "react";
import { env } from '../env';

import {
  TurnkeyProvider,
  type TurnkeyProviderConfig,
} from "@turnkey/react-wallet-kit";

export function TurnkeyRootProvider({ children }: { children: React.ReactNode }) {
  const turnkeyConfig: TurnkeyProviderConfig = useMemo(() => {
    // Prefer env vars and avoid any hardcoded defaults
    const orgId = env.NEXT_PUBLIC_ORGANIZATION_ID || ''
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
          oauthRedirectUri: env.NEXT_PUBLIC_REDIRECT_URI || 
            (typeof window !== 'undefined' 
              ? `${window.location.protocol}//${window.location.host}`
              : "https://app.narrative.trade/")
        },
        methods: {
          googleOauthEnabled: true,
          // Toggle any others you actually want:
          emailOtpAuthEnabled: false,
          smsOtpAuthEnabled: false,
          passkeyAuthEnabled: false,
          walletAuthEnabled: false,
        },
        // Optional, but keeps UI ordering nice if you ever show their modal:
        methodOrder: ["socials", "email", "sms", "passkey", "wallet"],
        verifyWalletOnSignup: true,
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

  return (
    <TurnkeyProvider
      config={turnkeyConfig}
      callbacks={{
        onError: (err) => console.error("Turnkey error:", err),
      }}
    >
      {children}
    </TurnkeyProvider>
  );
}
