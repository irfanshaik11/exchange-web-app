import React, { useEffect, useRef, useState } from 'react';
import { login as apiLogin, register as apiRegister, phantomLogin as apiPhantomLogin, metamaskLogin as apiMetamaskLogin } from '../utils/api';
import Cookies from 'js-cookie';
import { useUser } from "./UserContext";
import InterstatePopout from './InterstatePopout';
import InterstateButton from './InterstateButton';
import bs58 from 'bs58';
import { toast } from 'react-hot-toast';
import { useWallet } from "./useWallet";
import { usePhantomWallet } from '../hooks/usePhantomWallet';
import { useMetaMaskWallet } from '../hooks/useMetaMaskWallet';
import { useTurnkey, ClientState, AuthState } from '@turnkey/react-wallet-kit';
import { GoogleOAuthProvider, GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { getStoredReferralCodeHint } from '../utils/referralStorage';

const ENABLE_EMAIL_AUTH = false;
const AUTH_BUTTON_WIDTH_CLASS = 'w-full max-w-[400px] mx-auto';

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
  const [googleNonce, setGoogleNonce] = useState<string | null>(null);
  const pubKeyRef = useRef<string | null>(null);
  const createdNonceRef = useRef(false);
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  
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
  const turnkey = useTurnkey();
  const authState = turnkey?.authState;
  const clientState = turnkey?.clientState;
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

  useEffect(() => {
    if (!turnkey) return;
    if (clientState !== ClientState.Ready) return;
    if (createdNonceRef.current) return;

    (async () => {
      try {
        const pubKey = await turnkey.createApiKeyPair?.({ storeOverride: true });
        if (!pubKey) {
          throw new Error('Failed to create API keypair for Google login.');
        }
        pubKeyRef.current = pubKey;
        setGoogleNonce(bytesToHex(sha256(pubKey)));
        createdNonceRef.current = true;
      } catch (err: any) {
        createdNonceRef.current = false;
        console.error('Failed to prepare Google login', err);
        setError(err?.message || 'Unable to prepare Google login.');
      }
    })();
  }, [clientState, turnkey]);

  if (!open && !show) return null;

  // Login handler
  async function handleLoginEmail(e: React.FormEvent) {
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



//   async function handleGoogleSuccess(resp: CredentialResponse) {
//   setGoogleLoading(true);
//   setError(null);
//   setSuccess(null);

//   try {
//     const publicKey = pubKeyRef.current;
//     if (!publicKey) {
//       throw new Error("Google login is not ready yet. Please try again.");
//     }

//     if (!resp?.credential) {
//       throw new Error("Google login did not return a credential.");
//     }

//     if (!turnkey?.completeOauth) {
//       throw new Error("Turnkey OAuth is not available right now.");
//     }

//     // -------- Decode Google ID token to extract optional metadata ----------
//     console.log("Google credential:", resp.credential);
//     const createSubOrgParams = (() => {
//       try {
//         const [, payloadSegment] = resp.credential.split(".");
//         if (!payloadSegment) return undefined;

//         const payloadJson = atob(
//           payloadSegment.replace(/-/g, "+").replace(/_/g, "/")
//         );
//         const payload = JSON.parse(payloadJson);
//         console.log("Decoded Google token payload:", payload);
//         const email =
//           typeof payload?.email === "string" ? payload.email : undefined;
//         const name =
//           typeof payload?.name === "string"
//             ? payload.name
//             : typeof payload?.given_name === "string"
//             ? payload.given_name
//             : undefined;

//         if (!email && !name) return undefined;

//         return {
//           ...(name && { userName: name }),
//           ...(email && { userEmail: email }),
//         };
//       } catch (err) {
//         console.warn("Could not decode Google token for signup metadata", err);
//         return undefined;
//       }
//     })();

//     console.log("createSubOrgParams:", createSubOrgParams);

//     // -------- Build OAuth parameters for Turnkey --------
//     const oauthParams: any = {
//       oidcToken: resp.credential,
//       publicKey,
//       providerName: "Google"
//     };
//     console.log("OAuth params before sub-org:", oauthParams);
//     if (createSubOrgParams) {
//     oauthParams.createSubOrgParams = createSubOrgParams;
//     }
//     console.log("Final OAuth params:", oauthParams);

//     // -------- SUPER IMPORTANT: Use completeWithOauth --------
//     const sessionResult = await turnkey.completeOauth(oauthParams);

//     console.log("Turnkey OAuth result:", sessionResult);
//     setSuccess("Google sign-in complete!");

//   } catch (err: any) {
//     console.error("Turnkey Google OAuth failed:", err);

//     const message =
//       err?.message ||
//       err?.response?.data?.message ||
//       "Google OAuth login failed";

//     setError(message);
//     createdNonceRef.current = false;
//     setGoogleNonce(null);

//   } finally {
//     setGoogleLoading(false);
//   }
// }

async function handleGoogleSuccess(resp: CredentialResponse) {
  setGoogleLoading(true);
  setError(null);
  setSuccess(null);

  try {
    const publicKey = pubKeyRef.current;
    if (!publicKey) {
      throw new Error("Google login is not ready yet. Please try again.");
    }

    if (!resp?.credential) {
      throw new Error("Google login did not return a credential.");
    }

    if (!turnkey?.completeOauth) {
      throw new Error("Turnkey OAuth is not available right now.");
    }

    // -------- Decode Google token ----------
    console.log("Google credential:", resp.credential);
    const decoded = (() => {
      try {
        const [, payloadSegment] = resp.credential.split(".");
        if (!payloadSegment) return {};

        const payloadJson = atob(
          payloadSegment.replace(/-/g, "+").replace(/_/g, "/")
        );
        return JSON.parse(payloadJson);
      } catch {
        return {};
      }
    })();

    console.log("Decoded Google payload:", decoded);

    const email =
      typeof decoded?.email === "string" ? decoded.email : undefined;
    const name =
      typeof decoded?.name === "string"
        ? decoded.name
        : typeof decoded?.given_name === "string"
        ? decoded.given_name
        : undefined;

    // -------- Build minimal sub-org params ----------
    let createSubOrgParams: any = undefined;

    if (email || name) {
      const label = (email || name || "google-user")
        .toLowerCase()
        .replace(/\s+/g, "-");

      createSubOrgParams = {
        // REQUIRED:
        subOrgName: `narrative-${label}`,
        oauthProviders: [
          {
            providerName: "Google",
          },
        ],

        // OPTIONAL but recommended metadata:
        ...(name && { userName: name }),
        ...(email && { userEmail: email }),
      };
    }

    console.log("createSubOrgParams:", createSubOrgParams);

    // -------- Build OAuth params ----------
    const oauthParams: any = {
      oidcToken: resp.credential,
      publicKey,
      providerName: "Google",
      createSubOrgParams : {
        userName: name
      }
    };



    console.log("Final OAuth params:", oauthParams);

    // -------- Complete OAuth login via Turnkey ----------
    const sessionResult = await turnkey.completeOauth(oauthParams);
    console.log("Turnkey OAuth result:", sessionResult);

    setSuccess("Google sign-in complete!");

  } catch (err: any) {
    console.error("Turnkey Google OAuth failed:", err);

    const msg =
      err?.message ||
      err?.response?.data?.message ||
      "Google OAuth login failed";

    setError(msg);
    createdNonceRef.current = false;
    setGoogleNonce(null);
  } finally {
    setGoogleLoading(false);
  }
}

  const handleGoogleError = () => {
    setGoogleLoading(false);
    setError('Google login was cancelled. Please try again.');
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
      const referralCode = getStoredReferralCodeHint() || undefined;
      const { token } = await apiPhantomLogin(signResult.publicKey, signResult.signature, signResult.message, referralCode);

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
      const referralCode = getStoredReferralCodeHint() || undefined;
      const { token } = await apiMetamaskLogin(signResult.address, signResult.signature, signResult.message, referralCode);

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
      overlayClassName="bg-[radial-gradient(circle_at_22%_18%,rgba(16,185,129,0.02),transparent_62%),radial-gradient(circle_at_78%_20%,rgba(59,130,246,0.02),transparent_58%),radial-gradient(circle_at_center,rgba(12,18,32,0.05),rgba(6,8,12,0.08))] !backdrop-blur-[2px]"
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
      {error && (
        <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {ENABLE_EMAIL_AUTH && (
        <>
        {mode === 'login' ? (
          <form onSubmit={handleLoginEmail}>
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
      <div className="flex flex-col items-center gap-2 mt-4">
        {googleClientId ? (
          <GoogleOAuthProvider clientId={googleClientId}>
            <div className={`mb-1 flex flex-col items-center ${AUTH_BUTTON_WIDTH_CLASS}`}>
              {authState === AuthState.Authenticated ? (
                <div className="w-full rounded-3xl border border-neutral-700/60 bg-neutral-800/40 px-3 py-3 text-center text-sm text-neutral-200">
                  Finishing sign-in…
                </div>
              ) : clientState !== ClientState.Ready ? (
                <InterstateButton type="button" fullWidth variant="secondary" disabled>
                  <span className="flex items-center justify-center gap-2 font-normal text-sm">
                    Preparing login…
                  </span>
                </InterstateButton>
              ) : !googleNonce ? (
                <InterstateButton type="button" fullWidth variant="secondary" disabled>
                  <span className="flex items-center justify-center gap-2 font-normal text-sm">
                    {googleLoading ? 'Finishing sign-in…' : 'Generating nonce…'}
                  </span>
                </InterstateButton>
              ) : googleLoading ? (
                <InterstateButton type="button" fullWidth variant="secondary" disabled>
                  <span className="flex items-center justify-center gap-2 font-normal text-sm">
                    Signing in with Google…
                  </span>
                </InterstateButton>
              ) : (
                <div className="w-full flex justify-center">
                  <GoogleLogin
                    nonce={googleNonce}
                    onSuccess={handleGoogleSuccess}
                    onError={handleGoogleError}
                    useOneTap={false}
                    theme="outline"
                    shape="pill"
                    text="continue_with"
                    size="large"
                    width="400"
                  />
                </div>
              )}
            </div>
          </GoogleOAuthProvider>
        ) : (
          <InterstateButton type="button" fullWidth variant="secondary" disabled className={AUTH_BUTTON_WIDTH_CLASS}>
            <span className="flex items-center justify-center gap-2 font-normal text-sm">
              Google login not configured
            </span>
          </InterstateButton>
        )}

        <InterstateButton
          type="button"
          fullWidth
          variant="secondary"
          onClick={() => {
            clearAllLoadingStates();
            setShowWalletOptions(!showWalletOptions);
          }}
          disabled={phantomLoading || metamaskLoading}
          className={`flex items-center justify-between hover:bg-neutral-800 transition-colors ${AUTH_BUTTON_WIDTH_CLASS}`}
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
        <div className={`mt-4 overflow-hidden transition-all duration-300 ease-in-out ${AUTH_BUTTON_WIDTH_CLASS}`}>
          <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50">
            <div className="text-xs text-neutral-400 mb-3 font-medium">Choose your wallet</div>
            <div className="space-y-2">
              {/* MetaMask */}
              <button
                type="button"
                className={`w-full flex items-center justify-between p-3 rounded-lg transition-all duration-200 ${
                  metaMaskWallet.isConnected
                    ? 'bg-transparent hover:bg-neutral-700/30 border border-green-600/50 hover:border-green-500/50'
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
                    ? 'bg-transparent hover:bg-neutral-700/30 border border-green-600/50 hover:border-green-500/50' 
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
