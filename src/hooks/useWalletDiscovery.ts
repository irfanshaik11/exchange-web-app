import { useMemo, useState, useCallback } from 'react';
import bs58 from 'bs58';
import { useEIP6963Wallets } from './useEIP6963Wallets';
import { useSolanaWalletStandard } from './useSolanaWalletStandard';
import { walletLogin as apiWalletLogin } from '../utils/api';
import { getStoredReferralCodeHint, clearStoredReferralCodeHint } from '../utils/referralStorage';
import Cookies from 'js-cookie';

export interface DiscoveredWallet {
  id: string;              // rdns for EVM, name for Solana
  name: string;
  icon: string;            // data URI from the standard
  chain: 'solana' | 'evm';
  provider: any;           // EIP-1193 provider or Wallet Standard wallet
}

export interface AuthCallbacks {
  onToken: (token: string, isNewUser: boolean) => void | Promise<void>;
  onError: (message: string) => void;
  onUserLimitReached?: (message: string) => void;
}

export interface UseWalletDiscoveryReturn {
  /** All discovered wallets in a single flat list (Solana + EVM) */
  allWallets: DiscoveredWallet[];
  activeWalletId: string | null;
  walletError: string | null;
  clearError: () => void;
  connectAndSign: (wallet: DiscoveredWallet, callbacks: AuthCallbacks) => Promise<void>;
}

const buildWalletLoginMessage = () =>
  `Login to Interstate with nonce: ${Date.now()}`;

export function useWalletDiscovery(): UseWalletDiscoveryReturn {
  const eip6963Providers = useEIP6963Wallets();
  const solanaStandardWallets = useSolanaWalletStandard();
  const [activeWalletId, setActiveWalletId] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);

  // Single flat list: Solana wallets first, then EVM — deduplicated by name.
  // Wallets like Phantom and MetaMask register on BOTH chains; we keep the
  // Solana entry (listed first) and skip the EVM duplicate.
  const allWallets = useMemo<DiscoveredWallet[]>(() => {
    const solana: DiscoveredWallet[] = solanaStandardWallets.map((w) => ({
      id: `sol:${w.name}`,
      name: w.name,
      icon: w.icon,
      chain: 'solana' as const,
      provider: w.wallet,
    }));

    const seenNames = new Set(solana.map((w) => w.name.toLowerCase()));

    const evm: DiscoveredWallet[] = eip6963Providers
      .filter((p) => !seenNames.has(p.info.name.toLowerCase()))
      .map((p) => ({
        id: `evm:${p.info.rdns}`,
        name: p.info.name,
        icon: p.info.icon,
        chain: 'evm' as const,
        provider: p.provider,
      }));

    return [...solana, ...evm];
  }, [eip6963Providers, solanaStandardWallets]);

  const clearError = useCallback(() => setWalletError(null), []);

  const connectAndSign = useCallback(
    async (wallet: DiscoveredWallet, callbacks: AuthCallbacks) => {
      setActiveWalletId(wallet.id);
      setWalletError(null);

      try {
        const message = buildWalletLoginMessage();
        const referralCode = getStoredReferralCodeHint() || undefined;
        let address: string;
        let signature: string;
        let chain: 'solana' | 'ethereum';

        if (wallet.chain === 'solana') {
          const w = wallet.provider;
          const connectFeature = w.features['standard:connect'];
          if (!connectFeature) {
            throw new Error(`${wallet.name} does not support connecting.`);
          }
          const connectResult = await connectFeature.connect();
          const account = connectResult.accounts?.[0];
          if (!account) {
            throw new Error(`Unable to read public key from ${wallet.name}.`);
          }

          address = account.address;

          const signFeature = w.features['solana:signMessage'];
          if (!signFeature) {
            throw new Error(`${wallet.name} does not support message signing.`);
          }
          const encodedMessage = new TextEncoder().encode(message);
          const signResult = await signFeature.signMessage({
            account,
            message: encodedMessage,
          });
          const sigBytes = Array.isArray(signResult)
            ? signResult[0].signature
            : signResult.signature;
          signature = bs58.encode(sigBytes);
          chain = 'solana';
        } else {
          const provider = wallet.provider;
          const accounts: string[] = await provider.request({
            method: 'eth_requestAccounts',
          });
          address = accounts?.[0];
          if (!address) {
            throw new Error(`Unable to read address from ${wallet.name}.`);
          }

          signature = await provider.request({
            method: 'personal_sign',
            params: [message, address],
          });
          chain = 'ethereum';
        }

        const data = await apiWalletLogin(
          chain,
          address,
          signature,
          message,
          wallet.name,
          referralCode,
        );

        const token = data?.token;
        if (!token) {
          throw new Error('Login succeeded but no token was returned.');
        }

        Cookies.set('token', token, { expires: 7, path: '/' });
        clearStoredReferralCodeHint();

        const isNewUser = (data as any)?.isNewUser === true;
        await callbacks.onToken(token, isNewUser);
      } catch (error: any) {
        const msg = error?.message || `${wallet.name} login failed. Please try again.`;

        if (error?.code === 'USER_LIMIT_REACHED' && callbacks.onUserLimitReached) {
          callbacks.onUserLimitReached(msg);
        } else {
          setWalletError(msg);
          callbacks.onError(msg);
        }
      } finally {
        setActiveWalletId(null);
      }
    },
    [],
  );

  return {
    allWallets,
    activeWalletId,
    walletError,
    clearError,
    connectAndSign,
  };
}
