import React, { useState, useEffect } from 'react';
import { login as apiLogin, register as apiRegister, phantomLogin as apiPhantomLogin, metamaskLogin as apiMetamaskLogin, turnkeySessionLogin } from '../utils/api';
import Cookies from 'js-cookie';
import { useUser } from "./UserContext";
import InterstatePopout from './InterstatePopout';
import InterstateButton from './InterstateButton';
import bs58 from 'bs58';
import { toast } from 'react-hot-toast';
import { useWallet } from "./useWallet";
import { usePhantomWallet } from '../hooks/usePhantomWallet';
import { useMetaMaskWallet } from '../hooks/useMetaMaskWallet';
import { useTurnkey } from '@turnkey/react-wallet-kit';
import { useRouter } from 'next/router';

const ENABLE_EMAIL_AUTH = false;

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
  
  // Turnkey hooks
  const turnkeyClient = useTurnkey();
  const router = useRouter();

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

      // Don't clear MetaMask connection state - let the hook manage it properly
      // Clearing this was preventing MetaMask from opening when locked
      metaMaskWallet.refreshConnection();
      
      // Check for token in cookies and refresh user if not already authenticated
      const token = Cookies.get('token');
      if (token && !user && !userLoading) {
        setLoading(true);
        refreshUser().then(() => {
          setLoading(false);
          // Small delay to let user state propagate
          setTimeout(() => {
            // Re-check user state after refresh completes
            const currentUser = user; // This will be stale, but the effect will re-run
            // The useEffect will re-run when user changes, so we don't need to manually check here
          }, 100);
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

  // Google Login handler using Turnkey React Wallet Kit
  const handleGoogleLogin = async (response: any) => {
    setGoogleLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!turnkeyClient) {
        throw new Error('Turnkey not initialized');
      }

      // Use Turnkey's handleGoogleOauth which handles the full flow
      // Use redirect mode (openInPage: true) to avoid COOP policy issues with popups
      console.log('[Turnkey] 🔵 Starting Google OAuth flow...');
      await turnkeyClient.handleGoogleOauth({
        openInPage: true, // Use redirect mode to avoid COOP policy blocking popup
        onOauthSuccess: async ({ oidcToken, providerName, publicKey }) => {
          console.log('[Turnkey] ✅ OAuth success callback triggered', {
            providerName,
            hasOidcToken: !!oidcToken,
            hasPublicKey: !!publicKey,
            oidcTokenLength: oidcToken?.length,
            publicKeyLength: publicKey?.length,
            timestamp: new Date().toISOString(),
          });

          try {
            // Get session information from Turnkey client (session is a property, not a method)
            const session = turnkeyClient.session;
            
            if (session) {
              const expiryDate = session.expiry ? new Date(session.expiry * 1000).toISOString() : 'N/A';
              
              console.log('[Turnkey] ✅ Session created successfully', {
                sessionType: session.sessionType,
                organizationId: session.organizationId || 'N/A',
                userId: session.userId || 'N/A',
                expiry: expiryDate,
                expirationSeconds: session.expirationSeconds || 'N/A',
                hasToken: !!session.token,
                hasPublicKey: !!session.publicKey,
                providerName,
                timestamp: new Date().toISOString(),
              });

              // Log full session details
              console.log('[Turnkey] 📋 Full session details:', {
                sessionType: session.sessionType,
                organizationId: session.organizationId,
                userId: session.userId,
                expiry: expiryDate,
                expiryTimestamp: session.expiry,
                expirationSeconds: session.expirationSeconds,
                tokenLength: session.token?.length || 0,
                publicKey: session.publicKey || 'N/A',
              });
            } else {
              console.warn('[Turnkey] ⚠️ Session object is undefined after OAuth success');
            }

            // Exchange Turnkey session for backend JWT
            if (!session) {
              throw new Error('Turnkey session not available');
            }

            console.log('[Turnkey] 🔄 Exchanging Turnkey session for backend JWT...');
            const loginResponse = await turnkeySessionLogin({
              organizationId: session.organizationId,
              userId: session.userId,
              sessionToken: session.token,
            });

            if (!loginResponse?.token) {
              throw new Error('Failed to get JWT token from backend');
            }

            // Store JWT token in cookies
            Cookies.set('token', loginResponse.token, { expires: 7, path: '/' });
            console.log('[Turnkey] ✅ JWT token stored in cookies');

            // Refresh user state and wait for it to complete
            await refreshUser();
            
            // Verify token is stored
            const tokenAfterRefresh = Cookies.get('token');
            if (!tokenAfterRefresh) {
              throw new Error('Token was not properly stored');
            }
            
            console.log('[Turnkey] ✅ User state refreshed after successful authentication', {
              hasToken: !!tokenAfterRefresh,
            });
            
            setSuccess('Google login successful!');
            
            // Close modal first
            onClose();
            setGoogleLoading(false);
            
            // Use a hard redirect with window.location to ensure:
            // 1. The page fully reloads with the new auth state
            // 2. All components re-initialize with the token from cookies
            // 3. The GlobalLoginModalManager will check the token and user state on page load
            // Small delay to ensure modal closes and token is persisted
            setTimeout(() => {
              setSuccess(null);
              // Hard redirect ensures clean state - TokenHandler in _app.tsx will pick up the token
              window.location.href = '/pulse';
            }, 600);
          } catch (sessionError: any) {
            console.error('[Turnkey] ⚠️ Error during session exchange:', sessionError);
            setError(sessionError?.message || 'Failed to complete login');
            setGoogleLoading(false);
          }
        },
      });
    } catch (err: any) {
      console.error('Google login failed:', err);
      setError(err?.message || 'Google login failed');
      setGoogleLoading(false);
    }
  };

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
      const message = `Login to Narrative with nonce: ${Date.now()}`;
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
    setMetamaskLoading(true);
    setError(null);
    setWalletError(null);
    setSuccess(null);

    try {
      // Check if MetaMask is installed
      if (!metaMaskWallet.isInstalled) {
        setWalletError('MetaMask wallet not found. Please install MetaMask extension.');
        return;
      }

      // Connect to MetaMask wallet (this handles connection properly)
      let connected = await metaMaskWallet.connect();

      // If connection failed due to pending request, wait and retry once
      if (!connected && metaMaskWallet.error?.includes('already')) {
        setWalletError('MetaMask is busy. Retrying in 2 seconds...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        connected = await metaMaskWallet.connect();
      }

      if (!connected) {
        setWalletError(metaMaskWallet.error || 'Failed to connect to MetaMask wallet');
        return;
      }

      // Create message and sign it
      const message = `Login to Narrative with nonce: ${Date.now()}`;
      const signResult = await metaMaskWallet.signMessage(message);
      
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
      console.error('MetaMask login error:', error);

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
    <InterstatePopout
      open={open}
      onClose={handleClose}
      align="center"
      className={`relative w-[460px] max-w-[94vw] overflow-hidden rounded-[28px] border border-white/5 bg-[#0c0f18]/95 p-8 pt-12 shadow-[0_48px_160px_rgba(12,20,33,0.6)] backdrop-blur-xl text-neutral-100 ${wiggle ? ' wiggle' : ''}`}
      disableClickOutside={forceLogin}
      overlayClassName="bg-[radial-gradient(circle_at_22%_18%,rgba(16,185,129,0.18),transparent_62%),radial-gradient(circle_at_78%_20%,rgba(59,130,246,0.16),transparent_58%),radial-gradient(circle_at_center,rgba(12,18,32,0.92),rgba(6,8,12,0.96))] backdrop-blur-[18px]"
    >
      <div className="pointer-events-none absolute -inset-14 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.25),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(110,231,183,0.12),transparent_55%),radial-gradient(circle_at_top_right,rgba(129,140,248,0.2),transparent_55%)] opacity-80 blur-[90px]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,rgba(148,163,184,0.12),transparent_70%)]" />
      <button
        className="absolute right-4 top-4 rounded-full bg-white/5 px-2 text-lg text-neutral-400 transition hover:bg-white/10 hover:text-white"
        onClick={handleClose}
        type="button"
      >
        ×
      </button>
      
      <div className="mb-4 text-center">
        <p className="text-[0.65rem] uppercase tracking-[0.45em] text-emerald-300/70">
          Secure Access
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Sign in to Narrative</h2>
      </div>

      {ENABLE_EMAIL_AUTH && (
        <>
        {mode === 'login' ? (
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
              By creating an account, you agree to Narrative's{' '}
              <a href="#" className="underline">Privacy Policy</a> and{' '}
              <a href="#" className="underline">Terms of Service</a>.
            </div>
          </form>
        )}
        </>
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