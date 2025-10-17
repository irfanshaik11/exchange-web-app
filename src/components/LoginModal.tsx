import React, { useState, useEffect } from 'react';
import { login as apiLogin, register as apiRegister, phantomLogin as apiPhantomLogin, metamaskLogin as apiMetamaskLogin, googleAuthUrl } from '../utils/api';
import Cookies from 'js-cookie';
import { useUser } from "./UserContext";
import InterstatePopout from './InterstatePopout';
import InterstateButton from './InterstateButton';
import bs58 from 'bs58';
import { toast } from 'react-hot-toast';
import { useWallet } from "./useWallet";
import { usePhantomWallet } from '../hooks/usePhantomWallet';
import { useMetaMaskWallet } from '../hooks/useMetaMaskWallet';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
  forceLogin?: boolean;
}

// Extend the Window interface to include the solana property
declare global {
  interface Window {
    solana?: any;
    ethereum?: any;
  }
}

export default function LoginModal({ open, onClose, forceLogin = false }: LoginModalProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  
  // Separate loading states for each login method
  const [loading, setLoading] = useState(false); // For email/password login
  const [phantomLoading, setPhantomLoading] = useState(false);
  const [metamaskLoading, setMetamaskLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { refreshUser, user, loading: userLoading } = useUser();
  const [wiggle, setWiggle] = useState(false);
  const { connectors, connectWith, connecting } = useWallet();
  const [showWalletOptions, setShowWalletOptions] = useState(false);
  
  // Use the new wallet hooks
  const phantomWallet = usePhantomWallet();
  const metaMaskWallet = useMetaMaskWallet();

  // Helper function to clear all loading states
  const clearAllLoadingStates = () => {
    setPhantomLoading(false);
    setMetamaskLoading(false);
    setGoogleLoading(false);
    setError(null);
    setWalletError(null);
  };


  useEffect(() => {
    if (open) {
      setShow(true);
      // Refresh wallet connection state when modal opens
      phantomWallet.refreshConnection();
      
      // Clear MetaMask connection state to ensure fresh start
      localStorage.removeItem('metamask_connected');
      metaMaskWallet.refreshConnection();
      
      // Check for token in cookies and refresh user if not already authenticated
      const token = Cookies.get('token');
      if (token && !user && !userLoading) {
        setLoading(true);
        refreshUser().then(() => {
          setLoading(false);
          // If user is now authenticated, close the modal
          if (user) {
            onClose();
          }
        }).catch(() => setLoading(false));
      }
    } else {
      // Clear all loading states when modal is closed
      clearAllLoadingStates();
      setSuccess(null);
      
      const timeout = setTimeout(() => setShow(false), 220);
      return () => clearTimeout(timeout);
    }
  }, [open, phantomWallet, metaMaskWallet, refreshUser, user, userLoading]);

  if (!open && !show) return null;

  // Login handler
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { token } = await apiLogin(email, password);
      Cookies.set('token', token, { expires: 7, path: '/' });
      await refreshUser();
      setSuccess('Login successful!');

      setTimeout(() => {
        setSuccess(null);
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  // Registration handler
  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { user } = await apiRegister(email, username, password);
      if (user?.token) {
        Cookies.set('token', user.token, { expires: 7, path: '/' });
      }
      Cookies.set('username', username, { expires: 7, path: '/' });
      Cookies.set('email', email, { expires: 7, path: '/' });
      await refreshUser();
      setSuccess('Registration successful!');
      setTimeout(() => {
        setMode('login');
        setSuccess(null);
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  // Google Login handler
  async function handleGoogleLogin(e: React.FormEvent) {
    e.preventDefault();
    setGoogleLoading(true);
    setError(null);
    setSuccess(null);
    try {
      window.location.href = googleAuthUrl;
    } catch (err) {
      setError('Login failed');
    } finally {
      setGoogleLoading(false);
    }
  }

  // Phantom Wallet Login handler - Enhanced with proper connection management
  async function handlePhantomLogin() {
    setPhantomLoading(true);
    setError(null);
    setWalletError(null);
    setSuccess(null);
    
    try {
      // Check if Phantom is installed
      if (!phantomWallet.isInstalled) {
        setWalletError('Phantom wallet not found. Please install Phantom wallet.');
        return;
      }

      // Connect to Phantom wallet (this handles reconnection properly)
      let connected;
      try {
        connected = await phantomWallet.connect();
      } catch (connectError: any) {
        console.error('Phantom connect error in LoginModal:', connectError);
        setWalletError('User rejected the connection request');
        return;
      }
      
      if (!connected) {
        setWalletError(phantomWallet.error || 'Failed to connect to Phantom wallet');
        return;
      }

      // Create message and sign it
      const message = `Login to Interstate with nonce: ${Date.now()}`;
      const signResult = await phantomWallet.signMessage(message);
      
      // Check if signing failed
      if ('error' in signResult) {
        setWalletError((signResult as { error: string }).error);
        return;
      }
      
      // Send to backend for verification
      const { token } = await apiPhantomLogin(signResult.publicKey, signResult.signature, signResult.message);
      
      if (token) {
        Cookies.set('token', token, { expires: 7, path: '/' });
        await refreshUser();
        setSuccess('Login successful!');
        setTimeout(() => {
          setSuccess(null);
          onClose();
        }, 1200);
      } else {
        setError('Phantom login failed - no token received');
      }
    } catch (error: any) {
      console.error('Phantom login error:', error);
      
      // Handle different types of errors
      if (error.message?.includes('Internal server error')) {
        setWalletError('Backend server error. Please try again later.');
      } else if (error.message?.includes('Signature verification failed')) {
        setWalletError('Signature verification failed. Please try again.');
      } else if (error.message?.includes('Missing required fields')) {
        setWalletError('Missing required data. Please try again.');
      } else {
        setWalletError(error?.message || 'Phantom login failed');
      }
    } finally {
      setPhantomLoading(false);
    }
  }

  // MetaMask Wallet Login handler - Enhanced with proper connection management
  async function handleMetamaskLogin() {
    console.log('MetaMask login started...');
    setMetamaskLoading(true);
    setError(null);
    setWalletError(null);
    setSuccess(null);
    
    try {
      // Check if MetaMask is installed
      if (!metaMaskWallet.isInstalled) {
        console.log('MetaMask not installed');
        setWalletError('MetaMask wallet not found. Please install MetaMask extension.');
        return;
      }

      console.log('MetaMask is installed, attempting to connect...');
      // Connect to MetaMask wallet (this handles connection properly)
      const connected = await metaMaskWallet.connect();
      if (!connected) {
        console.log('MetaMask connection failed:', metaMaskWallet.error);
        setWalletError(metaMaskWallet.error || 'Failed to connect to MetaMask wallet');
        return;
      }

      console.log('MetaMask connected successfully, attempting to sign message...');

      // Create message and sign it
      const message = `Login to Interstate with nonce: ${Date.now()}`;
      console.log('About to call metaMaskWallet.signMessage...');
      const signResult = await metaMaskWallet.signMessage(message);
      console.log('metaMaskWallet.signMessage completed:', signResult);
      
      // Check if signing failed
      if ('error' in signResult) {
        setWalletError((signResult as { error: string }).error);
        return;
      }
      
      // Send to backend for verification
      const { token } = await apiMetamaskLogin(signResult.address, signResult.signature, signResult.message);
      
      if (token) {
        Cookies.set('token', token, { expires: 7, path: '/' });
        await refreshUser();
        setSuccess('MetaMask login successful!');
        setTimeout(() => {
          setSuccess(null);
          onClose();
        }, 1200);
      } else {
        setError('MetaMask login failed - no token received');
      }
    } catch (error: any) {
      console.error('MetaMask backend error:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      
      // Handle different types of backend errors
      if (error.message?.includes('Internal server error')) {
        setWalletError('Backend server error. Please try again later.');
      } else if (error.message?.includes('Signature verification failed')) {
        setWalletError('Signature verification failed. Please try again.');
      } else if (error.message?.includes('Missing required fields')) {
        setWalletError('Missing required data. Please try again.');
      } else {
        setWalletError(error?.message || 'MetaMask login failed');
      }
    } finally {
      setMetamaskLoading(false);
    }
  }

  // Handler for MetaMask (or other EVM) wallet
  function handleEvmConnect(connector: any) {
    connectWith(connector);
  }

  // Handle close attempt
  const handleClose = () => {
    if (forceLogin) {
      setWiggle(true);
      toast.error('Please log-in to trade on Narrative.');
      setTimeout(() => setWiggle(false), 600);
      return;
    }
    onClose();
  };

  return (
    <InterstatePopout open={open} onClose={handleClose} align="center" className={`bg-neutral-900 rounded-xl shadow-2xl w-[350px] p-6 relative text-neutral-100${wiggle ? ' wiggle' : ''}`} disableClickOutside={forceLogin}>
      <button
        className="absolute top-3 right-3 text-neutral-400 hover:text-white text-xl"
        onClick={handleClose}
        type="button"
      >
        ×
      </button>
      
      {mode === 'login' ? (
        <>
          <div className="text-xl font-bold mb-4 text-center">Login</div>
          <form onSubmit={handleLogin}>
            <div className="mb-3">
              <label className="block text-xs mb-1">Email</label>
              <input
                type="email"
                className="w-full px-3 py-2 rounded-3xl border border-neutral-700 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Enter email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
              <label className="block text-xs mb-1">Password</label>
              <input
                type="password"
                className="w-full px-3 py-2 rounded-3xl border border-neutral-700 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Enter password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <div className="flex justify-end mb-2">
                <InterstateButton variant="secondary" size="sm" type="button" className="text-xs text-emerald-400 hover:underline bg-transparent border-none shadow-none px-0 py-0 h-auto">Forgot password?</InterstateButton>
              </div>
            </div>
            {error && <div className="text-xs text-red-400 mb-2 text-center">{error}</div>}
            {success && <div className="text-xs text-emerald-400 mb-2 text-center">{success}</div>}
            <InterstateButton type="submit" fullWidth loading={loading} className="mb-3">Login</InterstateButton>
          </form>
          <div className="text-center flex flex-row items-center w-full text-xs mt-3 text-neutral-400 gap-1 justify-center">
            Don't have an account?{' '}
            <button className="text-emerald-400 hover:underline bg-transparent border-none shadow-none px-0 py-0 h-auto" onClick={() => setMode('signup')}>Sign up</button>
          </div>
        </>
      ) : (
        <form onSubmit={handleRegister}>
          <div className="text-xl font-bold mb-4 text-center">Sign Up</div>
          <div className="mb-3">
            <label className="block text-xs mb-1">Username</label>
            <input
              type="text"
              className="w-full px-3 py-2 rounded-3xl border border-neutral-700 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Enter username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
            />
            <label className="block text-xs mb-1">Email</label>
            <input
              type="email"
              className="w-full px-3 py-2 rounded-3xl border border-neutral-700 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Enter email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <label className="block text-xs mb-1">Password</label>
            <input
              type="password"
              className="w-full px-3 py-2 rounded-3xl border border-neutral-700 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Enter password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="text-xs text-red-400 mb-2 text-center">{error}</div>}
          {success && <div className="text-xs text-emerald-400 mb-2 text-center">{success}</div>}
          <InterstateButton type="submit" fullWidth loading={loading} className="mb-3">Sign Up</InterstateButton>
          <div className="text-center text-xs mt-3 text-neutral-400">
            Already have an account?{' '}
            <button className="text-emerald-400 hover:underline bg-transparent border-none shadow-none px-0 py-0 h-auto" onClick={() => setMode('login')}>Login</button>
          </div>
          <div className="text-xs text-neutral-500 mt-4 text-center">
            By creating an account, you agree to Interstate's{' '}
            <a href="#" className="underline">Privacy Policy</a> and{' '}
            <a href="#" className="underline">Terms of Service</a>.
          </div>
        </form>
      )}
      <hr  className="mt-4 border-neutral-600"/>
      <div className="flex flex-col gap-2 mt-4">
        <InterstateButton
          type="button"
          fullWidth
          variant="secondary"
          className="mb-1"
          onClick={(e) => {
            setPhantomLoading(false);
            setMetamaskLoading(false);
            handleGoogleLogin(e);
          }}
          disabled={googleLoading}
        >
          <span className="flex items-center justify-center gap-2 font-normal text-sm">
            <img src="https://img.icons8.com/color/512/google-logo.png" alt="Google" className="w-6 h-6" />
            Continue with Google
          </span>
        </InterstateButton>

        <InterstateButton
          type="button"
          fullWidth
          variant="secondary"
          onClick={() => {
            clearAllLoadingStates();
            setShowWalletOptions(!showWalletOptions);
          }}
          disabled={phantomLoading || metamaskLoading}
          className="flex items-center justify-between hover:bg-neutral-800 transition-colors"
        >
          <span className="flex items-center gap-2 font-normal text-sm">
            <img src="/Phantom-Wallet-300x300.png" alt="Phantom" className="w-6 h-6 rounded-[100px]" />
            Continue with crypto wallet 
          </span>
          <div className={`flex items-center justify-center transform transition-transform duration-200 ${showWalletOptions ? 'rotate-180' : ''}`}>
            <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </InterstateButton>
      </div>
      
      {walletError && <div className="text-xs text-red-400 mt-4 text-center">{walletError}</div>}


      {/* Wallet Options with Better Design */}
      {showWalletOptions && (
        <div className="mt-4 overflow-hidden transition-all duration-300 ease-in-out">
          <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50">
            <div className="text-xs text-neutral-400 mb-3 font-medium">Choose your wallet</div>
            <div className="space-y-2">
              {/* MetaMask */}
              <button
                type="button"
                className={`w-full flex items-center justify-between p-3 rounded-lg transition-all duration-200 ${
                  metaMaskWallet.isConnected 
                    ? 'bg-green-700/50 hover:bg-green-600/50 border border-green-600/50 hover:border-green-500/50' 
                    : 'bg-neutral-700/50 hover:bg-neutral-600/50 border border-neutral-600/50 hover:border-neutral-500/50'
                } ${metamaskLoading || metaMaskWallet.connecting ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => {
                  setPhantomLoading(false);
                  setGoogleLoading(false);
                  handleMetamaskLogin();
                }}
                disabled={metamaskLoading || metaMaskWallet.connecting}
              >
                <div className="flex items-center gap-3">
                  <img src="/MetaMask-icon-fox.svg" alt="MetaMask" className="w-5 h-5" />
                  <div className="flex flex-col items-start">
                    <span className="font-medium text-sm">MetaMask</span>
                    {metaMaskWallet.isConnected && metaMaskWallet.address && (
                      <span className="text-xs text-green-400">
                        Connected: {metaMaskWallet.address.slice(0, 6)}...{metaMaskWallet.address.slice(-4)}
                      </span>
                    )}
                    {metaMaskWallet.connecting && (
                      <span className="text-xs text-yellow-400">Connecting...</span>
                    )}
                    {metaMaskWallet.error && !metaMaskWallet.isInstalled && (
                      <span className="text-xs text-red-400">Not installed</span>
                    )}
                  </div>
                </div>
                {metaMaskWallet.isConnected && (
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                )}
              </button>

              {/* Phantom */}
              <button
                type="button"
                className={`w-full flex items-center justify-between p-3 rounded-lg transition-all duration-200 ${
                  phantomWallet.isConnected 
                    ? 'bg-green-700/50 hover:bg-green-600/50 border border-green-600/50 hover:border-green-500/50' 
                    : 'bg-neutral-700/50 hover:bg-neutral-600/50 border border-neutral-600/50 hover:border-neutral-500/50'
                } ${phantomLoading || phantomWallet.connecting ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => {
                  setMetamaskLoading(false);
                  setGoogleLoading(false);
                  handlePhantomLogin();
                }}
                disabled={phantomLoading || phantomWallet.connecting}
              >
                <div className="flex items-center gap-3">
                  <img src="/Phantom-Wallet-300x300.png" alt="Phantom" className="w-5 h-5 rounded-full" />
                  <div className="flex flex-col items-start">
                    <span className="font-medium text-sm">Phantom</span>
                    {phantomWallet.isConnected && phantomWallet.publicKey && (
                      <span className="text-xs text-green-400">
                        Connected: {phantomWallet.publicKey.slice(0, 4)}...{phantomWallet.publicKey.slice(-4)}
                      </span>
                    )}
                    {phantomWallet.connecting && (
                      <span className="text-xs text-yellow-400">Connecting...</span>
                    )}
                    {phantomWallet.error && !phantomWallet.isInstalled && (
                      <span className="text-xs text-red-400">Not installed</span>
                    )}
                  </div>
                </div>
                {phantomWallet.isConnected && (
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                )}
              </button>

            </div>
          </div>
        </div>
      )}
    </InterstatePopout>
  );
} 