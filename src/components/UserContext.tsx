import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import Cookies from 'js-cookie';
import { getUserById } from '../utils/api';
import { getSolBalance } from '~/utils/functions';
import toast from 'react-hot-toast';

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
  refreshBalance: () => Promise<void>;
  setUser: (user: UserInfo | null) => void;
  logout: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [solBalance, setSolBalance] = useState(0);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [lastNotifiedBalance, setLastNotifiedBalance] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  const refreshBalance = async () => {
    if (user?.publicKey) {
      try {
        const response = await fetch(`/api/get-sol-bal?address=${encodeURIComponent(user.publicKey)}`);
        const data = await response.json();
        const newBalance = data.data.balance;
        const newUsdBalance = data.data.usdBalance;
        
        console.log(`Balance check: current=${solBalance.toFixed(4)}, new=${newBalance.toFixed(4)}, lastNotified=${lastNotifiedBalance.toFixed(4)}`);
        
        // Check if balance increased (deposit detected) and we haven't notified for this balance yet
        if (newBalance > lastNotifiedBalance && lastNotifiedBalance >= 0 && notificationsEnabled) {
          const depositAmount = newBalance - lastNotifiedBalance;
          console.log(`🚨 DEPOSIT DETECTED: ${depositAmount.toFixed(4)} SOL (from ${lastNotifiedBalance.toFixed(4)} to ${newBalance.toFixed(4)})`);
          toast.success(`🎉 Deposit received! +${depositAmount.toFixed(4)} SOL`, {
            duration: 5000,
            style: {
              background: '#10B981',
              color: '#fff',
            },
          });
          // Update the last notified balance to prevent duplicate notifications
          setLastNotifiedBalance(newBalance);
          console.log(`✅ Updated lastNotifiedBalance to: ${newBalance.toFixed(4)}`);
        } else if (newBalance > lastNotifiedBalance && lastNotifiedBalance >= 0 && !notificationsEnabled) {
          console.log(`🚨 DEPOSIT DETECTED but notifications disabled: ${(newBalance - lastNotifiedBalance).toFixed(4)} SOL`);
          setLastNotifiedBalance(newBalance);
        } else {
          console.log(`ℹ️ No deposit detected. Balance unchanged or already notified.`);
        }
        
        setSolBalance(newBalance);
        setUsdcBalance(newUsdBalance);
      } catch (error) {
        console.error('Failed to refresh balance:', error);
      }
    }
  };

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
      } else {
        setUser(null);
        Cookies.remove('token');
      }
    } catch (_) {
      setUser(null);
      Cookies.remove('token');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    Cookies.remove('token');
    setUser(null);
    setSolBalance(0);
    setLastNotifiedBalance(0);
  };

  useEffect(() => {
    refreshUser();
  }, []);

  useEffect(() => {
    if (user) {
      // Initialize lastNotifiedBalance first, then start polling
      const initializeAndStartPolling = async () => {
        try {
          // First, get the current balance and set it as the last notified balance
          const response = await fetch(`/api/get-sol-bal?address=${encodeURIComponent(user.publicKey)}`);
          const data = await response.json();
          const currentBalance = data.data.balance;
          const currentUsdBalance = data.data.usdBalance;
          
          // Set the initial balance as the last notified balance to prevent false notifications
          setLastNotifiedBalance(currentBalance);
          setSolBalance(currentBalance);
          setUsdcBalance(currentUsdBalance);
          
          console.log(`🔧 INITIALIZED balance tracking: ${currentBalance.toFixed(4)} SOL (lastNotifiedBalance set to ${currentBalance.toFixed(4)})`);
          
          // Enable notifications after initialization is complete
          setTimeout(() => {
            setNotificationsEnabled(true);
            console.log(`🔔 Notifications ENABLED`);
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
          refreshBalance();
        }, 10000); // Poll every 10 seconds
      }, 2000); // Wait 2 seconds before starting polling
      
      return () => {
        clearTimeout(timeoutId);
        if (intervalId) {
          clearInterval(intervalId);
        }
      };
    }
  }, [user?.publicKey]); // Only depend on publicKey to avoid unnecessary re-runs

  return (
    <UserContext.Provider value={{ user, loading, solBalance, refreshUser, refreshBalance, setUser, logout, usdcBalance }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within a UserProvider');
  return ctx;
} 