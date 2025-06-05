import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Cookies from 'js-cookie';
import { env } from '../env';

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
      const res = await fetch(`${env.NEXT_PUBLIC_BACKEND_URL}/api/users/get_user_by_id`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (res.ok && data.user) {
        setUser({ bearerToken: token, ...data.user});
      } else {
        setUser(null);
        Cookies.remove('token');
      }
    } catch (e) {
      setUser(null);
      Cookies.remove('token');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
    // Optionally, listen for cookie changes
  }, []);

  return (
    <UserContext.Provider value={{ user, loading, refreshUser, setUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within a UserProvider');
  return ctx;
} 