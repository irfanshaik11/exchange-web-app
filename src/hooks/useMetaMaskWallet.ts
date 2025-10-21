import { useState, useEffect, useCallback } from 'react';

interface MetaMaskWallet {
  isInstalled: boolean;
  isConnected: boolean;
  address: string | null;
  connecting: boolean;
  error: string | null;
}

interface UseMetaMaskWalletReturn extends MetaMaskWallet {
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  signMessage: (message: string) => Promise<{ address: string; signature: string; message: string } | { error: string }>;
  refreshConnection: () => Promise<void>;
}

// Extend the Window interface to include the ethereum property
declare global {
  interface Window {
    ethereum?: any;
  }
}

export function useMetaMaskWallet(): UseMetaMaskWalletReturn {
  const [state, setState] = useState<MetaMaskWallet>({
    isInstalled: false,
    isConnected: false,
    address: null,
    connecting: false,
    error: null,
  });

  // Check if MetaMask is installed and get initial connection state
  const checkMetaMaskInstallation = useCallback(() => {
    const provider = window.ethereum;
    let isInstalled = false;

    // Check for MetaMask specifically
    // MetaMask is installed if window.ethereum exists and has isMetaMask flag
    // This works even when MetaMask is locked
    if (provider?.isMetaMask) {
      isInstalled = true;
    } else if (provider?.providers) {
      // Multiple providers case (e.g., MetaMask + Coinbase Wallet)
      isInstalled = provider.providers.some((p: any) => p.isMetaMask);
    }

    setState(prev => ({
      ...prev,
      isInstalled,
      error: isInstalled ? null : 'MetaMask wallet not found',
    }));

    return isInstalled;
  }, []);

  // Get current connection state from MetaMask
  const getConnectionState = useCallback(async () => {
    const provider = window.ethereum;
    if (!provider) {
      return;
    }

    try {
      // Get the MetaMask provider specifically
      let metamaskProvider = null;
      if (provider.providers) {
        metamaskProvider = provider.providers.find((p: any) => p.isMetaMask);
      } else if (provider.isMetaMask) {
        metamaskProvider = provider;
      }

      if (!metamaskProvider) {
        setState(prev => ({
          ...prev,
          isConnected: false,
          address: null,
          error: 'MetaMask not found',
        }));
        return;
      }

      // For initial state, always show as not connected
      // Only show as connected after explicit user connection
      const hasStoredConnection = localStorage.getItem('metamask_connected');

      if (hasStoredConnection) {
        // Check if still connected (this works even when MetaMask is locked)
        // eth_accounts returns accounts only if user has previously connected
        const accounts = await metamaskProvider.request({ method: 'eth_accounts' });
        const isConnected = accounts && accounts.length > 0;
        const address = isConnected ? accounts[0] : null;

        if (!isConnected) {
          // Clear stored connection if no longer connected
          localStorage.removeItem('metamask_connected');
        }

        setState(prev => ({
          ...prev,
          isConnected,
          address,
          error: null,
        }));
      } else {
        // No stored connection, show as not connected
        setState(prev => ({
          ...prev,
          isConnected: false,
          address: null,
          error: null,
        }));
      }
    } catch (error) {
      // If MetaMask is locked, eth_accounts will fail
      // Don't treat this as an error, just show as not connected
      console.error('Error getting MetaMask connection state:', error);
      setState(prev => ({
        ...prev,
        isConnected: false,
        address: null,
        error: null, // Don't show error if just locked
      }));
    }
  }, []);

  // Connect to MetaMask wallet with proper error handling
  const connect = useCallback(async (): Promise<boolean> => {
    const provider = window.ethereum;

    if (!provider) {
      setState(prev => ({
        ...prev,
        error: 'MetaMask wallet not found. Please install MetaMask.',
        connecting: false,
      }));
      return false;
    }

    // Get the MetaMask provider specifically
    // IMPORTANT: When multiple wallets are installed (e.g., Phantom + MetaMask),
    // window.ethereum becomes an array in window.ethereum.providers
    let metamaskProvider = null;

    if (provider.providers && Array.isArray(provider.providers)) {
      // Multiple providers case - find MetaMask specifically
      metamaskProvider = provider.providers.find((p: any) => p.isMetaMask === true);
      console.log('Found MetaMask in providers array:', !!metamaskProvider);
      console.log('All providers:', provider.providers.map((p: any) => ({ isMetaMask: p.isMetaMask, isBraveWallet: p.isBraveWallet })));
    } else if (provider.isMetaMask === true) {
      // Single provider case
      metamaskProvider = provider;
      console.log('Using window.ethereum directly as MetaMask');
    }

    if (!metamaskProvider) {
      console.error('MetaMask provider not found. Provider info:', {
        hasEthereum: !!provider,
        isMetaMask: provider?.isMetaMask,
        hasProviders: !!provider?.providers,
        providersCount: provider?.providers?.length
      });
      setState(prev => ({
        ...prev,
        error: 'MetaMask wallet not found. Please install MetaMask.',
        connecting: false,
      }));
      return false;
    }

    console.log('Using MetaMask provider:', metamaskProvider);

    setState(prev => ({ ...prev, connecting: true, error: null }));

    try {
      // Check if MetaMask is locked by trying to get accounts first
      // If MetaMask is locked, this will return an empty array but won't throw
      let isLocked = false;
      try {
        const testAccounts = await metamaskProvider.request({ method: 'eth_accounts' });
        // If we get here and accounts is empty, MetaMask might be locked or not connected
        if (!testAccounts || testAccounts.length === 0) {
          // Could be locked or just not connected - we'll find out when we request
          isLocked = true;
        }
      } catch (testError: any) {
        // If this throws, MetaMask is likely locked
        console.log('MetaMask might be locked:', testError);
        isLocked = true;
      }

      // Now request accounts
      // If locked, this should trigger MetaMask to open and ask for unlock
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve('TIMEOUT'), 60000);
      });

      const result = await Promise.race([
        metamaskProvider.request({ method: 'eth_requestAccounts' }),
        timeoutPromise
      ]);
      
      // Check if we got a timeout
      if (result === 'TIMEOUT') {
        setState(prev => ({
          ...prev,
          isConnected: false,
          address: null,
          connecting: false,
          error: 'Connection request timed out. Please check MetaMask and try again.',
        }));
        return false;
      }
      
      const accounts = result as string[];
      const address = accounts && accounts.length > 0 ? accounts[0] : null;

      if (!address) {
        throw new Error('No accounts returned from MetaMask');
      }

      // Store connection state in localStorage
      localStorage.setItem('metamask_connected', 'true');

      // Update state immediately
      setState(prev => ({
        ...prev,
        isConnected: true,
        address,
        connecting: false,
        error: null,
      }));

      // Wait a moment to ensure state is updated
      await new Promise(resolve => setTimeout(resolve, 100));

      return true;
    } catch (error: any) {
      console.error('MetaMask connection error:', error);

      let errorMessage = 'Failed to connect to MetaMask';

      // Handle specific MetaMask error codes
      if (error.code === 4001) {
        errorMessage = 'You rejected the connection request';
      } else if (error.code === -32002) {
        errorMessage = 'MetaMask is already open. Please check your MetaMask extension.';
      } else if (error.code === -32603) {
        errorMessage = 'Internal error. Please unlock MetaMask and try again.';
      } else if (error.code === -32601) {
        errorMessage = 'MetaMask method not found. Please update MetaMask.';
      } else if (error.code === -32700) {
        errorMessage = 'Invalid request. Please try again.';
      } else if (error.message?.includes('Already processing')) {
        errorMessage = 'MetaMask is already processing a request. Please wait or check MetaMask.';
      } else if (error.message?.includes('timed out')) {
        errorMessage = 'Request timed out. Please try again.';
      } else if (error.message?.includes('locked')) {
        errorMessage = 'Please unlock MetaMask and try again.';
      } else if (error.message?.includes('User rejected')) {
        errorMessage = 'You rejected the request';
      } else if (error.message) {
        // Use the original error message if it's user-friendly
        errorMessage = error.message.length < 100 ? error.message : 'Failed to connect to MetaMask';
      }

      setState(prev => ({
        ...prev,
        isConnected: false,
        address: null,
        connecting: false,
        error: errorMessage,
      }));

      return false;
    }
  }, []);

  // Disconnect from MetaMask wallet
  const disconnect = useCallback(async (): Promise<void> => {
    const provider = window.ethereum;
    if (!provider) {
      return;
    }

    try {
      // MetaMask doesn't have a direct disconnect method
      // We just clear our local state and stored connection
      localStorage.removeItem('metamask_connected');
      
      setState(prev => ({
        ...prev,
        isConnected: false,
        address: null,
        error: null,
      }));
    } catch (error) {
      console.error('Error disconnecting from MetaMask:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to disconnect from MetaMask',
      }));
    }
  }, []);

  // Sign a message with proper error handling and timeout
  const signMessage = useCallback(async (message: string): Promise<{ address: string; signature: string; message: string } | { error: string }> => {
    const provider = window.ethereum;
    if (!provider) {
      return { error: 'MetaMask wallet not found' };
    }

    // Get the MetaMask provider specifically
    let metamaskProvider = null;
    if (provider.providers) {
      metamaskProvider = provider.providers.find((p: any) => p.isMetaMask);
    } else if (provider.isMetaMask) {
      metamaskProvider = provider;
    }

    if (!metamaskProvider) {
      return { error: 'MetaMask wallet not found' };
    }

    try {
      // Get current accounts to ensure we have a valid address
      const accounts = await metamaskProvider.request({ method: 'eth_accounts' });
      const currentAddress = accounts && accounts.length > 0 ? accounts[0] : null;

      if (!currentAddress) {
        return { error: 'No accounts available. Please connect your wallet first.' };
      }
      
      // Add timeout to prevent hanging (60 seconds to give user time to review and sign)
      // Create a timeout promise that resolves with a special value
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve('TIMEOUT'), 60000); // 60 second timeout
      });
      
      // Create the signing promise
      const signPromise = metamaskProvider.request({
        method: 'personal_sign',
        params: [message, currentAddress]
      });
      
      // Race between signing and timeout
      const result = await Promise.race([signPromise, timeoutPromise]);
      
      // Check if we got a timeout
      if (result === 'TIMEOUT') {
        return { error: 'Signing request timed out. Please check MetaMask and try again.' };
      }

      const signature = result as string;

      return {
        address: currentAddress,
        signature,
        message,
      };
    } catch (error: any) {
      console.error('MetaMask signing error:', error);
      
      if (error.code === 4001) {
        return { error: 'User rejected the signing request' };
      } else if (error.code === -32002) {
        return { error: 'Please check MetaMask - request is pending' };
      } else if (error.message?.includes('timed out')) {
        return { error: 'Signing request timed out. Please check MetaMask and try again.' };
      } else {
        return { error: error.message || 'Failed to sign message' };
      }
    }
  }, []);

  // Refresh connection state
  const refreshConnection = useCallback(async (): Promise<void> => {
    await getConnectionState();
  }, [getConnectionState]);

  // Initialize on mount
  useEffect(() => {
    checkMetaMaskInstallation();
    getConnectionState();

    // Listen for MetaMask connection changes
    const provider = window.ethereum;
    if (provider) {
      const handleAccountsChanged = (accounts: string[]) => {
        const isConnected = accounts && accounts.length > 0;
        const address = isConnected ? accounts[0] : null;
        
        if (isConnected) {
          // Store connection state when accounts are available
          localStorage.setItem('metamask_connected', 'true');
        } else {
          // Clear connection state when no accounts
          localStorage.removeItem('metamask_connected');
        }
        
        setState(prev => ({
          ...prev,
          isConnected,
          address,
        }));
      };

      const handleChainChanged = () => {
        // Refresh connection state when chain changes
        getConnectionState();
      };

      const handleDisconnect = () => {
        // Clear stored connection state
        localStorage.removeItem('metamask_connected');
        
        setState(prev => ({
          ...prev,
          isConnected: false,
          address: null,
        }));
      };

      // Add event listeners
      provider.on('accountsChanged', handleAccountsChanged);
      provider.on('chainChanged', handleChainChanged);
      provider.on('disconnect', handleDisconnect);

      // Cleanup
      return () => {
        provider.removeListener('accountsChanged', handleAccountsChanged);
        provider.removeListener('chainChanged', handleChainChanged);
        provider.removeListener('disconnect', handleDisconnect);
      };
    }
  }, [checkMetaMaskInstallation, getConnectionState]);

  return {
    ...state,
    connect,
    disconnect,
    signMessage,
    refreshConnection,
  };
}
