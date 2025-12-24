import React, { createContext, useContext, useState } from 'react';
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

  const setUserLimitReached = (message?: string) => {
    setBlockerMessage(message || null);
    setShowBlocker(true);
  };

  const clearUserLimit = () => {
    setShowBlocker(false);
    setBlockerMessage(null);
  };

  return (
    <UserLimitContext.Provider
      value={{
        showBlocker,
        blockerMessage,
        setUserLimitReached,
        clearUserLimit,
      }}
    >
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

