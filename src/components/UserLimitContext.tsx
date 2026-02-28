import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';

interface UserLimitContextType {
  showBlocker: boolean;
  blockerMessage: string | null;
  setUserLimitReached: (message?: string) => void;
  clearUserLimit: () => void;
}

const UserLimitContext = createContext<UserLimitContextType | undefined>(undefined);

export const UserLimitProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [showBlocker, setShowBlocker] = useState(false);
  const [blockerMessage, setBlockerMessage] = useState<string | null>(null);

  const setUserLimitReached = useCallback((message?: string) => {
    setBlockerMessage(message || null);
    setShowBlocker(true);
  }, []);

  const clearUserLimit = useCallback(() => {
    setShowBlocker(false);
    setBlockerMessage(null);
  }, []);

  const value = useMemo(() => ({
    showBlocker,
    blockerMessage,
    setUserLimitReached,
    clearUserLimit,
  }), [showBlocker, blockerMessage, setUserLimitReached, clearUserLimit]);

  return (
    <UserLimitContext.Provider value={value}>
      {children}
    </UserLimitContext.Provider>
  );
};

export const useUserLimit = () => {
  const context = useContext(UserLimitContext);
  if (!context) {
    throw new Error('useUserLimit must be used within UserLimitProvider');
  }
  return context;
};

