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
    const orgId = "7347a74c-36c1-4a5a-adf6-0b3ea84be204";
    const proxyConfigId = "2091f6a1-1a1e-4730-be7a-b03d7c8d3561";

    // Always redirect back to the current origin so the OAuth flow completes in-place,
    // instead of bouncing to localhost in non-local environments.
    const redirectUri =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_REDIRECT_URI || "http://localhost:3000";

    return {
      apiBaseUrl: "https://api.turnkey.com",
      organizationId: orgId,
      authProxyConfigId: proxyConfigId,
      auth: {
        oauthConfig: {
          openOauthInPage: true,
          oauthRedirectUri: redirectUri,
          googleClientId:
            "314070775906-k3p0s4bnvf6mlim2a26pit5i2m3dodm4.apps.googleusercontent.com",
        },
      },
      ui: {
        renderModalInProvider: true,
        zIndex: 9999,
      },
    };
  }, []);

  useEffect(() => {
    console.log("[Turnkey] client env", {
      orgId: turnkeyConfig.organizationId,
      authProxyConfigId: turnkeyConfig.authProxyConfigId,
      googleClientId: turnkeyConfig.auth?.oauthConfig?.googleClientId,
      redirectUri: turnkeyConfig.auth?.oauthConfig?.oauthRedirectUri,
      apiBaseUrl: turnkeyConfig.apiBaseUrl,
      authProxyUrl: turnkeyConfig.authProxyUrl,
      missing:
        !turnkeyConfig.organizationId ||
        !turnkeyConfig.authProxyConfigId ||
        !turnkeyConfig.auth?.oauthConfig?.googleClientId ||
        !turnkeyConfig.auth?.oauthConfig?.oauthRedirectUri ||
        !turnkeyConfig.authProxyUrl,
    });

    if (
      !turnkeyConfig.organizationId ||
      !turnkeyConfig.authProxyConfigId ||
      !turnkeyConfig.auth?.oauthConfig?.googleClientId ||
      !turnkeyConfig.auth?.oauthConfig?.oauthRedirectUri ||
      !turnkeyConfig.authProxyUrl
    ) {
      console.warn(
        "[Turnkey] Missing required config. Check NEXT_PUBLIC_ORGANIZATION_ID, NEXT_PUBLIC_AUTH_PROXY_CONFIG_ID, NEXT_PUBLIC_GOOGLE_CLIENT_ID, NEXT_PUBLIC_REDIRECT_URI"
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
