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

  const refreshBalance = async () => {
    if (user?.publicKey) {
      try {
        const response = await fetch(`/api/get-sol-bal?address=${encodeURIComponent(user.publicKey)}`);
        const data = await response.json();
        const newBalance = data.data.balance;
        const newUsdBalance = data.data.usdBalance;
        
        // Check if balance increased (deposit detected) and we haven't notified for this balance yet
        if (newBalance > lastNotifiedBalance && lastNotifiedBalance >= 0) {
          const depositAmount = newBalance - lastNotifiedBalance;
          console.log(`Deposit detected: ${depositAmount.toFixed(4)} SOL (from ${lastNotifiedBalance.toFixed(4)} to ${newBalance.toFixed(4)})`);
          toast.success(`🎉 Deposit received! +${depositAmount.toFixed(4)} SOL`, {
            duration: 5000,
            style: {
              background: '#10B981',
              color: '#fff',
            },
          });
          // Update the last notified balance to prevent duplicate notifications
          setLastNotifiedBalance(newBalance);
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
      refreshBalance();
      
      // Initialize lastNotifiedBalance to current balance to prevent false notifications
      const initializeBalance = async () => {
        try {
          const response = await fetch(`/api/get-sol-bal?address=${encodeURIComponent(user.publicKey)}`);
          const data = await response.json();
          setLastNotifiedBalance(data.data.balance);
        } catch (error) {
          console.error('Failed to initialize balance:', error);
        }
      };
      initializeBalance();
      
      // Set up automatic balance polling every 10 seconds
      const interval = setInterval(() => {
        refreshBalance();
      }, 10000); // Poll every 10 seconds
      
      return () => {
        clearInterval(interval);
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