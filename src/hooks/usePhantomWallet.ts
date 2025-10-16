import { useState, useEffect, useCallback } from 'react';
import bs58 from 'bs58';

interface PhantomWallet {
  isInstalled: boolean;
  isConnected: boolean;
  publicKey: string | null;
  connecting: boolean;
  error: string | null;
}

interface UsePhantomWalletReturn extends PhantomWallet {
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  signMessage: (message: string) => Promise<{ publicKey: string; signature: string; message: string } | { error: string }>;
  refreshConnection: () => Promise<void>;
}

// Extend the Window interface to include the solana property
declare global {
  interface Window {
    solana?: any;
  }
}

export function usePhantomWallet(): UsePhantomWalletReturn {
  const [state, setState] = useState<PhantomWallet>({
    isInstalled: false,
    isConnected: false,
    publicKey: null,
    connecting: false,
    error: null,
  });

  // Check if Phantom is installed and get initial connection state
  const checkPhantomInstallation = useCallback(() => {
    const provider = window.solana;
    const isInstalled = !!provider && provider.isPhantom;
    
    setState(prev => ({
      ...prev,
      isInstalled,
      error: isInstalled ? null : 'Phantom wallet not found',
    }));

    return isInstalled;
  }, []);

  // Get current connection state from Phantom
  const getConnectionState = useCallback(async () => {
    const provider = window.solana;
    if (!provider || !provider.isPhantom) {
      return;
    }

    try {
      const isConnected = provider.isConnected;
      const publicKey = isConnected ? provider.publicKey?.toString() || null : null;
      
      setState(prev => ({
        ...prev,
        isConnected,
        publicKey,
        error: null,
      }));
    } catch (error) {
      console.error('Error getting Phantom connection state:', error);
      setState(prev => ({
        ...prev,
        isConnected: false,
        publicKey: null,
        error: 'Failed to get connection state',
      }));
    }
  }, []);

  // Connect to Phantom wallet with proper error handling - same approach as MetaMask
  const connect = useCallback(async (): Promise<boolean> => {
    const provider = window.solana;
    if (!provider || !provider.isPhantom) {
      setState(prev => ({
        ...prev,
        error: 'Phantom wallet not found',
        connecting: false,
      }));
      return false;
    }

    setState(prev => ({ ...prev, connecting: true, error: null }));

    try {
      // Always attempt to connect, even if already connected
      // This ensures the wallet is in a fresh, ready state
      console.log('Attempting to connect to Phantom wallet...');
      
      // Add timeout to prevent hanging (reduced to 15 seconds for better UX)
      // Create a timeout promise that resolves with a special value
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve('TIMEOUT'), 15000); // 15 second timeout
      });
      
      // Create the connection promise
      const connectPromise = provider.connect();
      
      // Race between connection and timeout
      const result = await Promise.race([connectPromise, timeoutPromise]);
      
      // Check if we got a timeout
      if (result === 'TIMEOUT') {
        setState(prev => ({
          ...prev,
          isConnected: false,
          publicKey: null,
          connecting: false,
          error: 'Connection request timed out. Please try again.',
        }));
        return false;
      }
      
      const response = result as any;
      const publicKey = response.publicKey?.toString() || null;
      console.log('Phantom wallet connected successfully:', publicKey);
      
      // Update state immediately
      setState(prev => ({
        ...prev,
        isConnected: true,
        publicKey,
        connecting: false,
        error: null,
      }));

      // Wait a moment to ensure state is updated
      await new Promise(resolve => setTimeout(resolve, 100));

      return true;
    } catch (error: any) {
      console.error('Phantom connection error:', error);
      
      let errorMessage = 'Failed to connect to Phantom wallet';
      if (error.code === 4001) {
        errorMessage = 'User rejected the connection request';
      } else if (error.message?.includes('timed out')) {
        errorMessage = 'Connection request timed out. Please try again.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      setState(prev => ({
        ...prev,
        isConnected: false,
        publicKey: null,
        connecting: false,
        error: errorMessage,
      }));

      return false;
    }
  }, []);

  // Disconnect from Phantom wallet
  const disconnect = useCallback(async (): Promise<void> => {
    const provider = window.solana;
    if (!provider || !provider.isPhantom) {
      return;
    }

    try {
      await provider.disconnect();
      setState(prev => ({
        ...prev,
        isConnected: false,
        publicKey: null,
        error: null,
      }));
    } catch (error) {
      console.error('Error disconnecting from Phantom:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to disconnect from Phantom',
      }));
    }
  }, []);

  // Sign a message with proper error handling and timeout - same approach as MetaMask
  const signMessage = useCallback(async (message: string): Promise<{ publicKey: string; signature: string; message: string } | { error: string }> => {
    const provider = window.solana;
    if (!provider || !provider.isPhantom) {
      return { error: 'Phantom wallet not found' };
    }

    try {
      console.log('Attempting to sign message with Phantom wallet...');
      
      // Check if wallet is actually connected by checking the provider state
      if (!provider.isConnected) {
        return { error: 'Wallet not connected. Please connect your wallet first.' };
      }

      // Get the current public key to ensure we have a valid connection
      const currentPublicKey = provider.publicKey;
      if (!currentPublicKey) {
        return { error: 'No public key available. Please connect your wallet first.' };
      }
      
      console.log('Phantom signing with public key:', currentPublicKey.toString());
      console.log('Message to sign:', message);
      
      // Add timeout to prevent hanging (reduced to 15 seconds for better UX)
      // Create a timeout promise that resolves with a special value
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve('TIMEOUT'), 15000); // 15 second timeout
      });
      
      // Create the signing promise with error handling
      const encodedMessage = new TextEncoder().encode(message);
      
      // Try a different approach - use the provider's request method if available
      let signPromise;
      if (provider.request) {
        // Use request method if available (similar to MetaMask)
        signPromise = provider.request({
          method: 'signMessage',
          params: {
            message: encodedMessage,
          },
        });
      } else {
        // Fallback to direct signMessage call
        signPromise = provider.signMessage(encodedMessage);
      }
      
      // Race between signing and timeout
      const result = await Promise.race([signPromise, timeoutPromise]);
      
      // Check if we got a timeout
      if (result === 'TIMEOUT') {
        return { error: 'Signing request timed out. Please check Phantom and try again.' };
      }
      
      const signed = result as any;
      
      const publicKey = signed.publicKey.toBase58 ? signed.publicKey.toBase58() : signed.publicKey.toString();
      // Encode signature to base58 as expected by backend
      const signature = bs58.encode(signed.signature);
      
      console.log('Message signed successfully:', { publicKey, message });
      
      return {
        publicKey,
        signature,
        message,
      };
    } catch (error: any) {
      console.error('Phantom signing error:', error);
      
      if (error.code === 4001) {
        return { error: 'User rejected the signing request' };
      } else if (error.message?.includes('timed out')) {
        return { error: 'Signing request timed out. Please check Phantom and try again.' };
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
    checkPhantomInstallation();
    getConnectionState();

    // Listen for Phantom connection changes
    const provider = window.solana;
    if (provider && provider.isPhantom) {
      const handleConnect = () => {
        getConnectionState();
      };

      const handleDisconnect = () => {
        setState(prev => ({
          ...prev,
          isConnected: false,
          publicKey: null,
        }));
      };

      const handleAccountChange = () => {
        getConnectionState();
      };

      // Add event listeners
      provider.on('connect', handleConnect);
      provider.on('disconnect', handleDisconnect);
      provider.on('accountChanged', handleAccountChange);

      // Cleanup
      return () => {
        provider.removeListener('connect', handleConnect);
        provider.removeListener('disconnect', handleDisconnect);
        provider.removeListener('accountChanged', handleAccountChange);
      };
    }
  }, [checkPhantomInstallation, getConnectionState]);

  return {
    ...state,
    connect,
    disconnect,
    signMessage,
    refreshConnection,
  };
}
