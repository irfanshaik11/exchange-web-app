import { WagmiProvider } from 'wagmi';
import { QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';

interface WagmiProviderWrapperProps {
  config: any;
  queryClient: any;
  children: ReactNode;
}

export function WagmiProviderWrapper({ config, queryClient, children }: WagmiProviderWrapperProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // During SSR/first render, hold off rendering to avoid hooks running without providers
  if (!isClient) {
    return null;
  }

  // On client, render with providers
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({ accentColor: "#10b981" })}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
