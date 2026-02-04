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

  // During SSR/first render, show a loading spinner instead of nothing.
  // This prevents blank screens when JS chunks fail to load (e.g. after deployments).
  if (!isClient) {
    return (
      <div style={{ backgroundColor: '#101114', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '48px', height: '48px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#10b981', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
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
