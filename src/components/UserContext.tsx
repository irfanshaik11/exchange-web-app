import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import Cookies from 'js-cookie';

import { getUserById, ApiError } from '../utils/api';
import { showEnhancedToast } from '~/utils/enhancedToast';
const USER_CACHE_KEY = 'codex_user_info_cache';
import { getSolBalance } from '~/utils/functions';
import { clearStoredReferralAccess, getStoredReferralCodeHint, clearStoredReferralCodeHint } from '../utils/referralStorage';
import toast from 'react-hot-toast';
import { recordReferralUsage, checkReferralUsageForUser } from '~/utils/referrals';


export interface UserInfo {
  id: string;
  name: string;
  email: string;
  publicKey: string;
  bearerToken: string;
}

interface UserContextType {
  user: UserInfo | null;
  loading: boolean;
  solBalance: number;
  usdcBalance: number;
  refreshUser: () => Promise<void>;
  refreshBalance: (opts?: { chain?: string; address?: string }) => Promise<{ balance: number; usdBalance: number } | null>;
  setUser: (user: UserInfo | null) => void;
  logout: () => void;
  primaryWalletAddresses: {
    solana: string | null;
    ethereum: string | null;
  };
  chainBalances: Record<string, number>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<UserInfo | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const cached = window.localStorage.getItem(USER_CACHE_KEY);
      if (!cached) return null;
      return JSON.parse(cached) as UserInfo;
    } catch (error) {
      console.warn('Failed to parse cached user, clearing cache', error);
      window.localStorage.removeItem(USER_CACHE_KEY);
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [solBalance, setSolBalance] = useState(0);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [lastNotifiedBalance, setLastNotifiedBalance] = useState<Record<string, number>>({});
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [primaryWalletAddresses, setPrimaryWalletAddresses] = useState<{
    solana: string | null;
    ethereum: string | null;
  }>({ solana: null, ethereum: null });
  const [walletsRefreshKey, setWalletsRefreshKey] = useState(0);
  const [chainBalances, setChainBalances] = useState<Record<string, number>>({
    sol: 0,
  });
  const [balanceCheckInProgress, setBalanceCheckInProgress] = useState<Record<string, boolean>>({});

  const persistUser = useCallback((value: UserInfo | null) => {
    if (typeof window === 'undefined') return;
    try {
      if (value) {
        window.localStorage.setItem(USER_CACHE_KEY, JSON.stringify(value));
      } else {
        window.localStorage.removeItem(USER_CACHE_KEY);
      }
    } catch (error) {
      console.warn('Failed to persist user cache', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleWalletsUpdated = () => {
      setWalletsRefreshKey((key) => key + 1);
    };
    window.addEventListener('wallets-updated', handleWalletsUpdated);
    return () => window.removeEventListener('wallets-updated', handleWalletsUpdated);
  }, []);

  useEffect(() => {
    const fetchPrimaryWallets = async () => {
      if (!user?.id || !user?.bearerToken) {
        setPrimaryWalletAddresses({ solana: null, ethereum: null });
        return;
      }
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/users/wallet`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${user.bearerToken}`,
          },
        });
        if (!res.ok) {
          throw new Error(`Failed to fetch wallets: ${res.status}`);
        }
        const data = await res.json();
        if (Array.isArray(data?.wallets)) {
          const primary = data.wallets.find((w: any) => w.isPrimary) ?? data.wallets[0];
          setPrimaryWalletAddresses({
            solana:
              typeof primary?.solanaAddress === 'string' && primary.solanaAddress.length > 0
                ? primary.solanaAddress
                : typeof primary?.address === 'string'
                ? primary.address
                : null,
            ethereum:
              typeof primary?.ethereumAddress === 'string' &&
              primary.ethereumAddress.length > 0
                ? primary.ethereumAddress
                : null,
          });
        }
      } catch (error) {
        console.error('Failed to fetch primary wallets for balance refresh:', error);
      }
    };
    fetchPrimaryWallets();
  }, [user?.id, user?.bearerToken, walletsRefreshKey]);

  const setUser = useCallback((value: UserInfo | null) => {
    setUserState(value);
    persistUser(value);
  }, [persistUser]);

  const refreshBalance = useCallback(
    async (
      options?: { chain?: string; address?: string }
    ): Promise<{ balance: number; usdBalance: number } | null> => {
    const chain = options?.chain || 'sol';
    const overrideAddress = options?.address;
    const targetAddress =
      overrideAddress ||
      (chain === 'sol'
        ? primaryWalletAddresses.solana
        : primaryWalletAddresses.ethereum) ||
      (chain === 'sol' ? user?.publicKey : null);

    if (!targetAddress) return null;

    // Prevent multiple simultaneous balance checks for the same address
    const checkKey = `${chain}:${targetAddress}`;
    if (balanceCheckInProgress[checkKey]) {
      console.log(`⏸️ Balance check already in progress for ${checkKey}`);
      return null;
    }

    setBalanceCheckInProgress((prev) => ({ ...prev, [checkKey]: true }));

    try {
      const response = await fetch(
        `/api/get-sol-bal?chain=${encodeURIComponent(chain)}&address=${encodeURIComponent(
          targetAddress,
        )}`,
      );
      
      if (!response.ok) {
        console.warn('Failed to fetch SOL balance:', response.status, response.statusText);
        return null;
      }
      
      const data = await response.json();
      
      // Check if the response has the expected structure
      if (!data || !data.data || typeof data.data.balance === 'undefined') {
        console.warn('Invalid balance response structure:', data);
        return null;
      }
      
      const newBalance = data.data.balance;
      const newUsdBalance = data.data.usdBalance;

      setChainBalances((prev) => ({
        ...prev,
        [chain]: newBalance,
      }));

      if (chain === 'sol') {
        const lastNotified = lastNotifiedBalance[targetAddress] ?? newBalance;
        
        console.log(
          `Balance check for ${targetAddress}: current=${solBalance.toFixed(4)}, new=${newBalance.toFixed(
            4,
          )}, lastNotified=${lastNotified.toFixed(4)}`,
        );

        // Only show notification if:
        // 1. Balance actually increased (not just wallet change)
        // 2. We have a previous balance to compare (not first check)
        // 3. Notifications are enabled
        // 4. The increase is significant (more than 0.0001 SOL to avoid dust)
        const depositAmount = newBalance - lastNotified;
        const isSignificantIncrease = depositAmount > 0.0001;
        const hasPreviousBalance = lastNotified !== newBalance && lastNotified > 0;

        if (isSignificantIncrease && hasPreviousBalance && notificationsEnabled) {
          console.log(
            `🚨 DEPOSIT DETECTED: ${depositAmount.toFixed(4)} SOL (from ${lastNotified.toFixed(
              4,
            )} to ${newBalance.toFixed(4)})`,
          );
          showEnhancedToast('success', `Deposit received`, {
            title: '🎉 Balance Updated',
            description: `+${depositAmount.toFixed(4)} SOL`,
            duration: 5000,
          });
          setLastNotifiedBalance((prev) => ({ ...prev, [targetAddress]: newBalance }));
          console.log(`✅ Updated lastNotifiedBalance for ${targetAddress} to: ${newBalance.toFixed(4)}`);
        } else if (isSignificantIncrease && hasPreviousBalance && !notificationsEnabled) {
          console.log(
            `🚨 DEPOSIT DETECTED but notifications disabled: ${depositAmount.toFixed(4)} SOL`,
          );
          setLastNotifiedBalance((prev) => ({ ...prev, [targetAddress]: newBalance }));
        } else {
          // Initialize or update lastNotifiedBalance without showing notification
          if (!lastNotifiedBalance[targetAddress]) {
            setLastNotifiedBalance((prev) => ({ ...prev, [targetAddress]: newBalance }));
            console.log(`🔧 Initialized lastNotifiedBalance for ${targetAddress}: ${newBalance.toFixed(4)}`);
          } else {
            // Update lastNotifiedBalance even if no deposit detected (for balance tracking)
            setLastNotifiedBalance((prev) => ({ ...prev, [targetAddress]: newBalance }));
            console.log('ℹ️ No deposit detected. Balance unchanged or already notified.');
          }
        }

        // Always update balance state regardless of notification logic
        setSolBalance(newBalance);
        setUsdcBalance(newUsdBalance);
      }
      return { balance: newBalance, usdBalance: newUsdBalance };
    } catch (error) {
      console.error('Failed to refresh balance:', error);
      return null;
    } finally {
      setBalanceCheckInProgress((prev) => {
        const updated = { ...prev };
        delete updated[checkKey];
        return updated;
      });
    }
  }, [
    primaryWalletAddresses.solana,
    primaryWalletAddresses.ethereum,
    user?.publicKey,
    notificationsEnabled,
    solBalance,
  ]);

  useEffect(() => {
    if (!user) return;
    
    // Reset lastNotifiedBalance when wallet addresses change to prevent false notifications
    if (primaryWalletAddresses.solana) {
      // Initialize lastNotifiedBalance for new wallet address if not exists
      if (!lastNotifiedBalance[primaryWalletAddresses.solana]) {
        // Will be set after first balance fetch
      }
      refreshBalance({ chain: 'sol', address: primaryWalletAddresses.solana });
    }
    if (primaryWalletAddresses.ethereum) {
      refreshBalance({ chain: 'monad', address: primaryWalletAddresses.ethereum });
    }
  }, [primaryWalletAddresses.solana, primaryWalletAddresses.ethereum, user, refreshBalance]);

  const refreshUser = async () => {
    const token = Cookies.get('token');
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { user: fetchedUser } = await getUserById(token);
      if (fetchedUser) {
        setUser({ bearerToken: token, ...fetchedUser });
        
        // Check if user has already used a referral code
        try {
          const { hasUsedReferral } = await checkReferralUsageForUser(token, String(fetchedUser.id));
          
          // Only record referral usage if user hasn't used one before
          if (!hasUsedReferral) {
            const referralCode = getStoredReferralCodeHint();
            if (referralCode && fetchedUser?.id) {
              try {
                await recordReferralUsage(token, referralCode);
                clearStoredReferralCodeHint();
              } catch (error) {
                console.warn('Failed to record referral usage', error);
              }
            }
          } else {
            // User already used a referral, clear any stored hint
            clearStoredReferralCodeHint();
          }
        } catch (error) {
          console.warn('Failed to check referral usage', error);
          // Try to record anyway if check fails (fallback)
          const referralCode = getStoredReferralCodeHint();
          if (referralCode && fetchedUser?.id) {
            try {
              await recordReferralUsage(token, referralCode);
              clearStoredReferralCodeHint();
            } catch (recordError) {
              console.warn('Failed to record referral usage', recordError);
            }
          }
        }
      } else {
        Cookies.remove('token');
        setUser(null);
      }
    } catch (error) {
      console.error('Failed to refresh user', error);
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        Cookies.remove('token');
        setUser(null);
      } else {
        // Preserve existing cached user state; ensure loading state still clears
        if (!user) {
          // Attempt to restore cached user if available
          if (typeof window !== 'undefined') {
            try {
              const cached = window.localStorage.getItem(USER_CACHE_KEY);
              if (cached) {
                const parsed = JSON.parse(cached) as UserInfo;
                setUserState(parsed);
              }
            } catch (cacheError) {
              console.warn('Failed to restore cached user after refresh failure', cacheError);
            }
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    Cookies.remove('token');
    setUser(null);
    setSolBalance(0);
    setLastNotifiedBalance({});
    setBalanceCheckInProgress({});
    if (typeof window !== 'undefined') {
      clearStoredReferralAccess();
      window.dispatchEvent(new Event('referral-access-reset'));
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  useEffect(() => {
    if (user) {
      // Initialize lastNotifiedBalance first, then start polling
      const initializeAndStartPolling = async () => {
        try {
          const address =
            primaryWalletAddresses.solana ||
            user.publicKey;
          if (!address) return;

          const res = await refreshBalance({ chain: 'sol', address });
          
          if (!res) {
            console.warn('Failed to initialize Solana balance');
            return;
          }
          
          const currentBalance = res.balance;
          const currentUsdBalance = res.usdBalance;
          
          // Set the initial balance as the last notified balance to prevent false notifications
          setLastNotifiedBalance((prev) => ({ ...prev, [address]: currentBalance }));
          setSolBalance(currentBalance);
          setUsdcBalance(currentUsdBalance);
          
          console.log(`🔧 INITIALIZED balance tracking for ${address}: ${currentBalance.toFixed(4)} SOL (lastNotifiedBalance set to ${currentBalance.toFixed(4)})`);
          
          // Enable notifications after initialization is complete
          setTimeout(() => {
            setNotificationsEnabled(true);
            // console.log(`🔔 Notifications ENABLED`);
          }, 3000); // Wait 3 seconds after initialization
        } catch (error) {
          console.error('Failed to initialize balance:', error);
        }
      };
      
      initializeAndStartPolling();
      
      // Set up automatic balance polling every 10 seconds (with a small delay to ensure initialization is complete)
      let intervalId: NodeJS.Timeout;
      const timeoutId = setTimeout(() => {
        intervalId = setInterval(() => {
          const address =
            primaryWalletAddresses.solana ||
            user.publicKey;
          if (!address) return;
          refreshBalance({ chain: 'sol', address });
        }, 10000); // Poll every 10 seconds
      }, 2000); // Wait 2 seconds before starting polling
      
      return () => {
        clearTimeout(timeoutId);
        if (intervalId) {
          clearInterval(intervalId);
        }
      };
    }
  }, [user?.publicKey, primaryWalletAddresses.solana, refreshBalance]); // Only depend on publicKey to avoid unnecessary re-runs

  return (
    <UserContext.Provider
      value={{
        user,
        loading,
        solBalance,
        refreshUser,
        refreshBalance,
        setUser,
        logout,
        usdcBalance,
        primaryWalletAddresses,
        chainBalances,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within a UserProvider');
  return ctx;
} 
