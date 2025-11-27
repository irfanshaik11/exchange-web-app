// src/components/TurnkeyRootProvider.tsx
"use client";

import React, { useEffect, useMemo } from "react";
import {
  TurnkeyProvider,
  type TurnkeyProviderConfig,
} from "@turnkey/react-wallet-kit";
import "@turnkey/react-wallet-kit/styles.css";

export function TurnkeyRootProvider({ children }: { children: React.ReactNode }) {
  const turnkeyConfig: TurnkeyProviderConfig = useMemo(() => {
    // Prefer env vars so you don't hardcode secrets for prod
    const orgId =
      process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID ||
      "7347a74c-36c1-4a5a-adf6-0b3ea84be204";

    const proxyConfigId =
      process.env.NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID ||
      "2091f6a1-1a1e-4730-be7a-b03d7c8d3561";

    const config: TurnkeyProviderConfig = {
      apiBaseUrl: "https://api.turnkey.com",
      organizationId: orgId,
      authProxyConfigId: proxyConfigId,

      auth: {
        oauthConfig: {
          // Let Turnkey handle the redirect details; config lives in dashboard
          openOauthInPage: true,
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
      methods: turnkeyConfig.auth?.methods,
    });

    if (!turnkeyConfig.organizationId || !turnkeyConfig.authProxyConfigId) {
      console.warn(
        "[Turnkey] Missing required config. Check NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID and NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID"
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
