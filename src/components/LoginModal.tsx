import React, { useCallback, useEffect, useRef, useState } from 'react';
import { login as apiLogin, register as apiRegister } from '../utils/api';
import Cookies from 'js-cookie';
import { useUser } from "./UserContext";
import InterstatePopout from './InterstatePopout';
import InterstateButton from './InterstateButton';
import { toast } from 'react-hot-toast';
import { useWallet } from "./useWallet";
import { useTurnkey, ClientState, AuthState } from '@turnkey/react-wallet-kit';
import { GoogleOAuthProvider, GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

const ENABLE_EMAIL_AUTH = false;
const AUTH_BUTTON_WIDTH_CLASS = 'w-full max-w-[400px] mx-auto';
const SESSION_METADATA_KEY = "@turnkey/session-metadata";

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

const TURNKEY_AUTH_METHOD_EVENT = "turnkey-auth-method";
const TURNKEY_APIKEY_READY_EVENT = "turnkey-apikey-ready";

const recordAuthMethod = (method: "google" | "wallet") => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("turnkeyLastAuthMethod", method);
    window.dispatchEvent(new CustomEvent(TURNKEY_AUTH_METHOD_EVENT, { detail: method }));
  } catch (err) {
    console.warn("[LoginModal] Failed to persist auth method", err);
  }
};

const recordPasskeyReady = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("turnkeyPasskeyReady", "true");
    window.dispatchEvent(new CustomEvent("turnkey-passkey-ready"));
  } catch (err) {
    console.warn("[LoginModal] Failed to persist passkey ready flag", err);
  }
};

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
  const [cachedWallets, setCachedWallets] = useState<any[] | null>(null);
  
  // Use Turnkey SDK for wallet authentication
const turnkey = useTurnkey();
const authState = turnkey?.authState;
const clientState = turnkey?.clientState;
const fetchWalletProviders = turnkey?.fetchWalletProviders;
const loginOrSignupWithWallet = turnkey?.loginOrSignupWithWallet;
const logout = turnkey?.logout;
const sessionFromHook = turnkey?.session;
const walletsFromHook = turnkey?.wallets;
  // Helper function to clear all loading states
  const clearAllLoadingStates = () => {
    setPhantomLoading(false);
    setMetamaskLoading(false);
    setGoogleLoading(false);
    setError(null);
    setWalletError(null);
  };

  // After wallet login, optionally fetch wallets once to populate SDK state (after ensuring session)
  // Accepts optional loginResult to use its session data directly (more reliable than turnkey.session)
  const finalizeWalletLoginSession = useCallback(async (_loginResult?: any) => {
    // No-op placeholder: wallet-kit manages session/wallet state automatically.
    return;
  }, []);

  // Debug: log session and wallets whenever they change
  useEffect(() => {
    console.log("[LoginModal] useTurnkey session snapshot:", sessionFromHook);
    if (walletsFromHook) {
      console.log("[LoginModal] useTurnkey wallets snapshot:", walletsFromHook);
    }
  }, [sessionFromHook, walletsFromHook]);


  useEffect(() => {
    if (open) {
      setShow(true);
      // Lock body scroll when modal is open to prevent interaction with background
      document.body.style.overflow = 'hidden';
      
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
      // Unlock body scroll when modal closes
      document.body.style.overflow = '';
      // Clear all loading states when modal is closed
      clearAllLoadingStates();
      setSuccess(null);
      
      const timeout = setTimeout(() => setShow(false), 220);
      return () => clearTimeout(timeout);
    }
    
    // Cleanup: ensure scroll is restored if component unmounts with modal open
    return () => {
      document.body.style.overflow = '';
    };
  }, [open, refreshUser, user, userLoading, onClose]);

  useEffect(() => {
    if (!open) return;
    if (!turnkey) return;
    if (clientState !== ClientState.Ready) return;
    // Allow retry if nonce is missing; don't run again if we already have one
    if (googleNonce) return;

    (async () => {
      try {
        const pubKey = await turnkey.createApiKeyPair?.({ storeOverride: false });
        if (!pubKey) {
          throw new Error("Failed to create API keypair for Google login.");
        }
        pubKeyRef.current = pubKey;
        setGoogleNonce(bytesToHex(sha256(pubKey)));
      } catch (err: any) {
        console.error("Failed to prepare Google login", err);
        setError(err?.message || "Unable to prepare Google login.");
        // Leave googleNonce null so user can retry/reopen
      }
    })();
  }, [open, turnkey, clientState, googleNonce]);

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
    recordAuthMethod("google");

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


  // Phantom Wallet Login handler - Uses Turnkey wallet authentication
  // After successful auth, TurnkeySessionBridge handles /api/users/turnkey/login + app JWT
  async function handlePhantomLogin() {
    setPhantomLoading(true);
    setError(null);
    setWalletError(null);
    setSuccess(null);
    
    console.log('[LoginModal] Starting Phantom login...');
    
    try {
      // Rely on wallet-kit to manage sessions; avoid clearing stored sessions pre-login
      console.log('[LoginModal] Using existing Turnkey session storage (no manual clearing)');

      if (!fetchWalletProviders || !loginOrSignupWithWallet) {
        console.error('[LoginModal] Turnkey wallet auth not ready:', { fetchWalletProviders: !!fetchWalletProviders, loginOrSignupWithWallet: !!loginOrSignupWithWallet });
        setWalletError('Turnkey wallet authentication is not ready. Please try again.');
        return;
      }

      // Fetch available wallet providers
      console.log('[LoginModal] Fetching wallet providers...');
      const providers = await fetchWalletProviders();
      console.log('[LoginModal] Available providers:', providers.map((p: any) => ({ name: p.info?.name, namespace: p.chainInfo?.namespace })));

      // Find Phantom provider (Solana namespace)
      const phantomProvider = providers.find((p: any) => {
        const providerName = p.info?.name?.toLowerCase() || '';
        const namespace = p.chainInfo?.namespace?.toLowerCase() || '';
        return providerName.includes('phantom') && namespace === 'solana';
      });

      if (!phantomProvider) {
        console.error('[LoginModal] Phantom provider not found in:', providers);
        setWalletError('Phantom wallet not found. Please install Phantom wallet and refresh the page.');
        return;
      }

      console.log('[LoginModal] Found Phantom provider:', phantomProvider);

      // Authenticate with Turnkey using Phantom
      // This creates a Turnkey session, which TurnkeySessionBridge will detect
      // and call /api/users/turnkey/login to get the app JWT

      console.log('[LoginModal] Calling loginOrSignupWithWallet with customWallet and API key...');

      // Build createSubOrgParams with API key if available
      const createSubOrgParams: any = {
        // Create an embedded wallet during signup so user can export it later
        customWallet: {
          walletName: "Narrative Wallet",
          walletAccounts: [
            { curve: "CURVE_ED25519", pathFormat: "PATH_FORMAT_BIP32", path: "m/44'/501'/0'/0'", addressFormat: "ADDRESS_FORMAT_SOLANA" },
            { curve: "CURVE_SECP256K1", pathFormat: "PATH_FORMAT_BIP32", path: "m/44'/60'/0'/0/0", addressFormat: "ADDRESS_FORMAT_ETHEREUM" },
          ],
        },
      };

      const result = await loginOrSignupWithWallet({
        walletProvider: phantomProvider,
        createSubOrgParams,
      });

      console.log('[LoginModal] loginOrSignupWithWallet result:', JSON.stringify(result, null, 2));

      // Check if result contains wallet info directly (some SDK versions include it)
      if (result?.wallet || result?.wallets || result?.walletId) {
        const walletInfo = result.wallet || result.wallets?.[0] || { walletId: result.walletId };
        if (walletInfo && typeof window !== 'undefined') {
          const cached = (window as any).__turnkeyCachedWallets || [];
          if (!cached.some((w: any) => (w.walletId || w.id) === (walletInfo.walletId || walletInfo.id))) {
            (window as any).__turnkeyCachedWallets = [...cached, walletInfo];
            console.log('[LoginModal] Wallet from result cached:', walletInfo);
          }
        }
      }

    // Session is already stored by loginOrSignupWithWallet; log snapshot for debugging
    try {
      const activeSession =
        typeof turnkey?.getSession === "function"
          ? await turnkey.getSession()
          : (turnkey as any)?.session;
      const allSessions =
        typeof turnkey?.getAllSessions === "function"
          ? await turnkey.getAllSessions()
          : undefined;
      console.log("[LoginModal] Session snapshot after Phantom login:", {
        activeSession,
        allSessions,
      });
      // Success! TurnkeySessionBridge will handle the rest (JWT + refreshUser + redirect)
      setSuccess('Authenticating with Phantom...');
      recordAuthMethod("wallet");
      // API-key path handled via wallet-kit session; no extra action here
    } catch (innerError: any) {
      // Non-critical error in session logging, just log it
      console.warn('[LoginModal] Session logging error (non-blocking):', innerError);
    }
  } catch (error: any) {
      console.error('[LoginModal] Phantom login error:', {
        message: error?.message,
        name: error?.name,
        code: error?.code,
        stack: error?.stack,
        cause: error?.cause,
        fullError: error,
      });
      
      const errorMsg = error?.message || error?.cause?.message || '';
      
      // Handle stale session key error
      if (errorMsg.includes('Key not found') || errorMsg.includes('Key not found for publicKey')) {
        console.warn('[LoginModal] Stale session key detected, please retry login');
        setWalletError('Session expired. Please click the button again to sign in.');
        toast.error('Session expired - please try again');
      }
      // Handle user rejection
      else if (errorMsg.includes('rejected') || errorMsg.includes('cancelled') || errorMsg.includes('denied')) {
        setWalletError('Connection request was rejected. Please try again.');
      } else if (errorMsg.includes('not found') || errorMsg.includes('not installed')) {
        setWalletError('Phantom wallet not found. Please install Phantom wallet.');
      } else {
        setWalletError(errorMsg || 'Phantom login failed. Please try again.');
      }
    } finally {
      setPhantomLoading(false);
    }
  }

  // MetaMask Wallet Login handler - Uses Turnkey wallet authentication
  // After successful auth, TurnkeySessionBridge handles /api/users/turnkey/login + app JWT
  async function handleMetamaskLogin() {
    setMetamaskLoading(true);
    setError(null);
    setWalletError(null);
    setSuccess(null);

    console.log('[LoginModal] Starting MetaMask login...');

    try {
      // Rely on wallet-kit to manage sessions; avoid clearing stored sessions pre-login
      console.log('[LoginModal] Using existing Turnkey session storage (no manual clearing)');

      if (!fetchWalletProviders || !loginOrSignupWithWallet) {
        console.error('[LoginModal] Turnkey wallet auth not ready:', { fetchWalletProviders: !!fetchWalletProviders, loginOrSignupWithWallet: !!loginOrSignupWithWallet });
        setWalletError('Turnkey wallet authentication is not ready. Please try again.');
        return;
      }

      // Fetch available wallet providers
      console.log('[LoginModal] Fetching wallet providers...');
      const providers = await fetchWalletProviders();
      console.log('[LoginModal] Available providers:', providers.map((p: any) => ({ name: p.info?.name, namespace: p.chainInfo?.namespace })));

      // Find MetaMask provider (Ethereum/EIP-155 namespace)
      const metaMaskProvider = providers.find((p: any) => {
        const providerName = p.info?.name?.toLowerCase() || '';
        const namespace = p.chainInfo?.namespace?.toLowerCase() || '';
        // MetaMask can be on 'ethereum' or 'eip155' namespace depending on SDK version
        return providerName.includes('metamask') && (namespace === 'ethereum' || namespace === 'eip155');
      });

      if (!metaMaskProvider) {
        console.error('[LoginModal] MetaMask provider not found in:', providers);
        setWalletError('MetaMask wallet not found. Please install MetaMask extension and refresh the page.');
        return;
      }

      console.log('[LoginModal] Found MetaMask provider:', metaMaskProvider);

      // Authenticate with Turnkey using MetaMask
      // This creates a Turnkey session, which TurnkeySessionBridge will detect
      // and call /api/users/turnkey/login to get the app JWT

      console.log('[LoginModal] Calling loginOrSignupWithWallet with customWallet and API key...');

      // Build createSubOrgParams with API key if available
      const createSubOrgParams: any = {
        // Create an embedded wallet during signup so user can export it later
        customWallet: {
          walletName: "Narrative Wallet",
          walletAccounts: [
            { curve: "CURVE_ED25519", pathFormat: "PATH_FORMAT_BIP32", path: "m/44'/501'/0'/0'", addressFormat: "ADDRESS_FORMAT_SOLANA" },
            { curve: "CURVE_SECP256K1", pathFormat: "PATH_FORMAT_BIP32", path: "m/44'/60'/0'/0/0", addressFormat: "ADDRESS_FORMAT_ETHEREUM" },
          ],
        },
      };

      const result = await loginOrSignupWithWallet({
        walletProvider: metaMaskProvider,
        createSubOrgParams,
      });

      console.log('[LoginModal] loginOrSignupWithWallet result:', JSON.stringify(result, null, 2));

      // Check if result contains wallet info directly (some SDK versions include it)
      if (result?.wallet || result?.wallets || result?.walletId) {
        const walletInfo = result.wallet || result.wallets?.[0] || { walletId: result.walletId };
        if (walletInfo && typeof window !== 'undefined') {
          const cached = (window as any).__turnkeyCachedWallets || [];
          if (!cached.some((w: any) => (w.walletId || w.id) === (walletInfo.walletId || walletInfo.id))) {
            (window as any).__turnkeyCachedWallets = [...cached, walletInfo];
            console.log('[LoginModal] Wallet from result cached:', walletInfo);
          }
        }
      }

    // Session is already stored by loginOrSignupWithWallet; log snapshot for debugging
    try {
      const activeSession =
        typeof turnkey?.getSession === "function"
          ? await turnkey.getSession()
          : (turnkey as any)?.session;
      const allSessions =
        typeof turnkey?.getAllSessions === "function"
          ? await turnkey.getAllSessions()
          : undefined;
      console.log("[LoginModal] Session snapshot after MetaMask login:", {
        activeSession,
        allSessions,
      });
      // Debug: fetch wallets once after login to prime SDK/cache
      if (turnkey?.fetchWallets) {
        try {
          const fetched = await turnkey.fetchWallets();
          console.log("[LoginModal] fetchWallets after MetaMask login (no args):", fetched);
          if (Array.isArray(fetched) && fetched.length && typeof window !== "undefined") {
            (window as any).__turnkeyCachedWallets = fetched;
          }
        } catch (fetchErr) {
          console.warn("[LoginModal] fetchWallets after MetaMask login failed (non-blocking):", fetchErr);
        }
      }
    } catch (sessionLogErr) {
      console.warn("[LoginModal] Failed to log session snapshot after MetaMask login", sessionLogErr);
    }


      // Success! TurnkeySessionBridge will handle the rest (JWT + refreshUser + redirect)
      setSuccess('Authenticating with MetaMask...');
      recordAuthMethod("wallet");
      // API-key path handled via wallet-kit session; no extra action here

    } catch (error: any) {
      console.error('[LoginModal] MetaMask login error:', {
        message: error?.message,
        name: error?.name,
        code: error?.code,
        stack: error?.stack,
        cause: error?.cause,
        fullError: error,
      });

      const errorMsg = error?.message || error?.cause?.message || '';

      // Handle stale session key error
      if (errorMsg.includes('Key not found') || errorMsg.includes('Key not found for publicKey')) {
        console.warn('[LoginModal] Stale session key detected, please retry login');
        setWalletError('Session expired. Please click the button again to sign in.');
        toast.error('Session expired - please try again');
      }
      // Handle user rejection
      else if (errorMsg.includes('rejected') || errorMsg.includes('cancelled') || errorMsg.includes('denied')) {
        setWalletError('Connection request was rejected. Please try again.');
      } else if (errorMsg.includes('not found') || errorMsg.includes('not installed')) {
        setWalletError('MetaMask wallet not found. Please install MetaMask extension.');
      } else {
        setWalletError(errorMsg || 'MetaMask login failed. Please try again.');
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
      zIndex={150}
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
                className={`w-full flex items-center justify-between p-3 rounded-lg transition-all duration-200 bg-neutral-700/50 hover:bg-neutral-600/50 border border-neutral-600/50 hover:border-neutral-500/50 ${metamaskLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => {
                  setPhantomLoading(false);
                  setGoogleLoading(false);
                  handleMetamaskLogin();
                }}
                disabled={metamaskLoading}
              >
                <div className="flex items-center gap-3">
                  <img src="/MetaMask-icon-fox.svg" alt="MetaMask" className="w-5 h-5" />
                  <div className="flex flex-col items-start">
                    <span className="font-medium text-sm">MetaMask</span>
                    {metamaskLoading && (
                      <span className="text-xs text-yellow-400">Connecting...</span>
                    )}
                  </div>
                </div>
              </button>

              {/* Phantom */}
              <button
                type="button"
                className={`w-full flex items-center justify-between p-3 rounded-lg transition-all duration-200 bg-neutral-700/50 hover:bg-neutral-600/50 border border-neutral-600/50 hover:border-neutral-500/50 ${phantomLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => {
                  setMetamaskLoading(false);
                  setGoogleLoading(false);
                  handlePhantomLogin();
                }}
                disabled={phantomLoading}
              >
                <div className="flex items-center gap-3">
                  <img src="/Phantom-Wallet-300x300.png" alt="Phantom" className="w-5 h-5 rounded-full" />
                  <div className="flex flex-col items-start">
                    <span className="font-medium text-sm">Phantom</span>
                    {phantomLoading && (
                      <span className="text-xs text-yellow-400">Connecting...</span>
                    )}
                  </div>
                </div>
              </button>

            </div>
          </div>
        </div>
      )}
    </InterstatePopout>
  );
}
