import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Cookies from 'js-cookie';
import { getUserById } from '../utils/api';

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
  refreshUser: () => Promise<void>;
  setUser: (user: UserInfo | null) => void;
  logout: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

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
  };

  useEffect(() => {
    refreshUser();
    // Optionally, listen for cookie changes
  }, []);

  return (
    <UserContext.Provider value={{ user, loading, refreshUser, setUser, logout }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within a UserProvider');
  return ctx;
} 