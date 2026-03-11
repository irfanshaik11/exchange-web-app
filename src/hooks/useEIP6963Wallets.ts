import { useState, useEffect, useCallback } from 'react';

/** EIP-6963 provider info announced by EVM wallets */
export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;   // data URI (usually SVG or PNG)
  rdns: string;   // e.g. "io.metamask", "io.rabby", "app.phantom"
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: any;  // EIP-1193 provider
}

/**
 * Discovers EVM wallets using the EIP-6963 standard (browser-native, zero deps).
 * Fully defensive — never throws, returns empty array on any error.
 */
export function useEIP6963Wallets() {
  const [providers, setProviders] = useState<EIP6963ProviderDetail[]>([]);

  const handleAnnounce = useCallback((event: Event) => {
    try {
      const detail = (event as CustomEvent<EIP6963ProviderDetail>).detail;
      if (!detail?.info?.rdns || !detail?.provider) return;

      setProviders((prev) => {
        if (prev.some((p) => p.info.rdns === detail.info.rdns)) return prev;
        return [...prev, detail];
      });
    } catch {
      // Malformed wallet announcement — ignore silently
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      window.addEventListener('eip6963:announceProvider', handleAnnounce);
      window.dispatchEvent(new Event('eip6963:requestProvider'));
    } catch {
      // Browser doesn't support CustomEvent dispatch — ignore
    }

    return () => {
      try { window.removeEventListener('eip6963:announceProvider', handleAnnounce); } catch {}
    };
  }, [handleAnnounce]);

  return providers;
}
