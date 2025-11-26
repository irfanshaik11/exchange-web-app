// src/components/TurnkeyRootProvider.tsx
"use client";

import React from "react";
import {
  TurnkeyProvider,
  type TurnkeyProviderConfig,
} from "@turnkey/react-wallet-kit";
import "@turnkey/react-wallet-kit/styles.css"; 


const turnkeyConfig: TurnkeyProviderConfig = {
  organizationId: process.env.NEXT_PUBLIC_ORGANIZATION_ID!,
  authProxyConfigId: process.env.NEXT_PUBLIC_AUTH_PROXY_CONFIG_ID!,
  auth: {
    oauthConfig: {
      openOauthInPage: true,
      oauthRedirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI || "",
      googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "",
    },
    // you can add methods/methodOrder/etc here later
  },
};

export function TurnkeyRootProvider({ children }: { children: React.ReactNode }) {
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
