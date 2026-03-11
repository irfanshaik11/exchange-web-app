import { useState, useEffect, useRef } from 'react';

export interface SolanaStandardWallet {
  name: string;
  icon: string;   // data URI
  wallet: any;     // Wallet Standard wallet object
}

const SIGN_MESSAGE_FEATURE = 'solana:signMessage';

function mapWallet(wallet: any): SolanaStandardWallet | null {
  try {
    if (!wallet?.features || !(SIGN_MESSAGE_FEATURE in wallet.features)) return null;
    return {
      name: wallet.name || 'Unknown Wallet',
      icon: typeof wallet.icon === 'string' ? wallet.icon : (wallet.icon?.[0] ?? ''),
      wallet,
    };
  } catch {
    return null;
  }
}

/**
 * Discovers Solana wallets via the Wallet Standard registry.
 * Uses dynamic import to avoid SSR issues. Fully defensive — never throws.
 */
export function useSolanaWalletStandard() {
  const [wallets, setWallets] = useState<SolanaStandardWallet[]>([]);
  const cleanupRef = useRef<(() => void)[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;

    (async () => {
      try {
        const { getWallets } = await import('@wallet-standard/app');
        if (cancelled) return;

        const { get, on } = getWallets();

        const initial = get()
          .map(mapWallet)
          .filter((w): w is SolanaStandardWallet => w !== null);
        setWallets(initial);

        const unReg = on('register', (...added: any[]) => {
          try {
            setWallets((prev) => {
              const mapped = added.map(mapWallet)
                .filter((w): w is SolanaStandardWallet => w !== null)
                .filter((w) => !prev.some((p) => p.name === w.name));
              return mapped.length ? [...prev, ...mapped] : prev;
            });
          } catch {}
        });

        const unUnreg = on('unregister', (...removed: any[]) => {
          try {
            const names = new Set(removed.map((w: any) => w?.name));
            setWallets((prev) => prev.filter((w) => !names.has(w.name)));
          } catch {}
        });

        cleanupRef.current = [unReg, unUnreg];
      } catch (err) {
        // @wallet-standard/app failed to load — wallets will be empty
        if (typeof console !== 'undefined') {
          console.warn('[useSolanaWalletStandard] init failed:', err);
        }
      }
    })();

    return () => {
      cancelled = true;
      cleanupRef.current.forEach((fn) => { try { fn(); } catch {} });
      cleanupRef.current = [];
    };
  }, []);

  return wallets;
}
