import { type AppType } from "next/app";
import { Inter, Orbitron, Geist } from 'next/font/google';
import "~/styles/globals.css";
import "~/components/insights/iridescent.css";
import "@rainbow-me/rainbowkit/styles.css";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { queryClient } from '../lib/queryClient';
import { WagmiProviderWrapper } from '../components/WagmiProviderWrapper';
import { UserProvider, useUser } from "../components/UserContext";
import { Toaster } from 'react-hot-toast';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Cookies from 'js-cookie';
import { mainnet } from 'viem/chains';
import dynamic from 'next/dynamic';
import { TurnkeyRootProvider } from "../components/TurnkeyRootProvider";
import { UserLimitProvider, useUserLimit } from "../components/UserLimitContext";
import UserLimitBlocker from "../components/UserLimitBlocker";

import { useTurnkey, AuthState } from '@turnkey/react-wallet-kit';
import { turnkeyLogin } from '../utils/api';

// Dynamically import LoginModal with no SSR to prevent wagmi provider issues
const LoginModal = dynamic(() => import('../components/LoginModal'), {
  ssr: false,
});

// Dynamically import MonadTradeBanner with no SSR for animations
// const MonadTradeBanner = dynamic(() => import('../components/MonadTradeBanner'), {
//   ssr: false,
// });
import { env } from '../env';
import { QuickBuyProvider } from '../components/QuickBuyContext';
import { WatchlistProvider } from '../components/WatchlistContext';
import { FilterProvider } from '../components/FilterContext';
import { SolPriceProvider } from '../components/SolPriceContext';
import { WalletTrackerProvider } from '../components/WalletTrackerContext';
import { ReferralAccessGate } from '../components/ReferralAccessGate';
import { ThemeProvider } from '../components/ThemeContext';
import { SearchProvider } from '../components/ui/SearchContext';
import Head from 'next/head';
import 'react-datepicker/dist/react-datepicker.css';
import { showEnhancedToast } from '../utils/enhancedToast';
import { storeReferralCodeHint, getStoredReferralCodeHint, clearStoredReferralCodeHint } from '~/utils/referralStorage';
import PagePreloader from '../components/PagePreloader';
import { PulseBackgroundLoader } from '../components/PulseBackgroundLoader';
import { TrendingBackgroundLoader } from '../components/TrendingBackgroundLoader';
import { SolanaPositionWebSocketProvider } from '../contexts/SolanaPositionWebSocketContext';
import { ArenaWebSocketProvider } from '../contexts/ArenaWebSocketContext';
import { listenForConfirmationUpdates } from '../utils/tradeToast';
import { DockedPanelProvider } from '../contexts/DockedPanelContext';
import { HyperliquidProvider } from '../contexts/HyperliquidContext';
import { HyperliquidUserStreamProvider } from '../contexts/HyperliquidUserStreamContext';
import { PortfolioDataProvider } from '../contexts/PortfolioDataContext';
import ErrorBoundary from '../components/ErrorBoundary';

const isDev = process.env.NODE_ENV !== 'production';

// Suppress Next.js error overlay for caught errors in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  // LAYER 1: Suppress console.error that triggers overlay
  const originalConsoleError = console.error;
  console.error = (...args) => {
    const errorString = args[0]?.toString() || '';
    const stackTrace = args[1]?.stack || '';

    // Suppress Next.js dev overlay for handled ApiErrors, trade-related errors, and Turnkey errors
    if (
      errorString.includes('ApiError') ||
      errorString.includes('[Trade]') ||
      errorString.includes('Trade validation failed') ||
      errorString.includes('Insufficient') ||
      errorString.includes('TurnkeyError') ||
      errorString.includes('Session public key') ||
      errorString.includes('session public key could not be found') ||
      errorString.includes('chrome-extension://') ||
      errorString.includes('runtime.sendMessage') ||
      stackTrace.includes('TradeActionPanel') ||
      stackTrace.includes('api.ts') ||
      stackTrace.includes('turnkey') ||
      stackTrace.includes('Turnkey') ||
      stackTrace.includes('chrome-extension://')
    ) {
      // Still log to console for debugging, just don't trigger overlay
      originalConsoleError('[Handled Error - No Overlay]', ...args);
      return;
    }
    originalConsoleError(...args);
  };

  // LAYER 2: Intercept window error events (more aggressive)
  window.addEventListener('error', (event) => {
    const error = event.error;
    const errorMessage = error?.message || '';

    // Check if this is an ApiError, trade-related error, or Turnkey error that we've already handled
    if (
      error?.name === 'ApiError' ||
      error?.constructor?.name === 'ApiError' ||
      error?.name === 'TurnkeyError' ||
      error?.constructor?.name === 'TurnkeyError' ||
      errorMessage.includes('Trade validation failed') ||
      errorMessage.includes('Insufficient') ||
      errorMessage.includes('NO_HOLDINGS') ||
      errorMessage.includes('AMOUNT_TOO_SMALL') ||
      errorMessage.includes('Session public key') ||
      errorMessage.includes('session public key could not be found') ||
      errorMessage.includes('runtime.sendMessage') ||
      (error?.stack && error.stack.includes('chrome-extension://'))
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      isDev && console.log('[Error Suppressed] Error caught and handled by application:', errorMessage);
      return false;
    }
  }, true); // Use capture phase to intercept early

  // LAYER 3: Intercept unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const reasonMessage = reason?.message || '';

    // Check if this is an ApiError, Turnkey error, or other handled error
    if (
      reason?.name === 'ApiError' ||
      reason?.constructor?.name === 'ApiError' ||
      reason?.name === 'TurnkeyError' ||
      reason?.constructor?.name === 'TurnkeyError' ||
      reasonMessage.includes('Trade validation failed') ||
      reasonMessage.includes('Insufficient') ||
      reasonMessage.includes('NO_HOLDINGS') ||
      reasonMessage.includes('AMOUNT_TOO_SMALL') ||
      reasonMessage.includes('Session public key') ||
      reasonMessage.includes('session public key could not be found') ||
      reasonMessage.includes('runtime.sendMessage') ||
      (reason?.stack && reason.stack.includes('chrome-extension://'))
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      isDev && console.log('[Error Suppressed] Unhandled error rejection caught:', reasonMessage);
      return false;
    }
  }, true); // Use capture phase to intercept early
}

function TurnkeySessionBridge() {
  const turnkeyCtx = useTurnkey() as any;
  const { setUserLimitReached } = useUserLimit();
  const {
    authState,
    session,
    user,
    wallets,
    clientState,
    fetchOrCreateP256ApiKeyUser,
    fetchOrCreatePolicies,
  } = turnkeyCtx;

  const { refreshUser } = useUser();
  const router = useRouter();

  const hasProcessedRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  const hasUpdatedEmail = useRef(false);

  const hasCreatedDelegatedUserRef = useRef(false);
  const delegatedUserIdRef = useRef<string | null>(null);
  const hasCreatedDelegatedPolicyRef = useRef(false);

  const isRunningRef = useRef(false);

  isDev && console.log(
    "[TurnkeySessionBridge] State:",
    {
      authState,
      clientState,
      session: session ? {
        token: session.token ? '***present***' : 'missing',
        organizationId: session.organizationId,
        userId: session.userId,
      } : null,
      user: user ? {
        id: user.id,
        email: user.email,
        userName: user.userName,
      } : null,
      wallets: wallets ? (Array.isArray(wallets) ? wallets.map((w: any) => ({
        id: w.walletId || w.id,
        name: w.walletName || w.name,
        accounts: w.accounts?.length || 0,
      })) : wallets) : 'not available',
      turnkeyCtxKeys: Object.keys(turnkeyCtx || {}),
    }
  );

  // Reset all flags when auth state changes
  useEffect(() => {
    if (authState !== AuthState.Authenticated) {
      hasProcessedRef.current = false;
      pendingRefreshRef.current = false;
      hasUpdatedEmail.current = false;
      hasCreatedDelegatedUserRef.current = false;
      delegatedUserIdRef.current = null;
      hasCreatedDelegatedPolicyRef.current = false;
      isRunningRef.current = false;
    }
  }, [authState]);

  // Store session data immediately when available (before any Turnkey API calls that might fail)
  const sessionDataRef = useRef<{token: string, organizationId: string, userId: string} | null>(null);
  
  useEffect(() => {
    if (session?.token && session.organizationId && session.userId) {
      sessionDataRef.current = {
        token: session.token,
        organizationId: session.organizationId,
        userId: session.userId,
      };
      isDev && console.log("[TurnkeySessionBridge] Session data captured:", {
        organizationId: session.organizationId,
        userId: session.userId,
      });
    }
  }, [session?.token, session?.organizationId, session?.userId]);

  //
  // Main Pipeline
  //
  useEffect(() => {
    if (authState !== AuthState.Authenticated) return;

    // avoid double runs
    if (isRunningRef.current) return;
    isRunningRef.current = true;

    (async () => {
      try {
        const daPublicKey = process.env.NEXT_PUBLIC_DA_PUBLIC_KEY || undefined;
        const lastAuthMethod =
          typeof window !== "undefined"
            ? window.localStorage.getItem("turnkeyLastAuthMethod")
            : null;
        const shouldSeedDelegated =
          lastAuthMethod !== "wallet" && !!daPublicKey;

        // Use captured session data if current session is null (can happen after 403 errors)
        const sessionData = session?.token ? {
          token: session.token,
          organizationId: session.organizationId,
          userId: session.userId,
        } : sessionDataRef.current;

        //
        // 1) Ensure delegated user + policy exists (only for Turnkey/Google flows)
        //    Skip for wallet-auth (Phantom/MetaMask) by checking lastAuthMethod
        //
        if (
          shouldSeedDelegated &&
          authState === AuthState.Authenticated &&
          sessionData?.organizationId &&
          fetchOrCreateP256ApiKeyUser &&
          fetchOrCreatePolicies
        ) {
          // Delegated user (API key) creation
          if (!hasCreatedDelegatedUserRef.current) {
            try {
              const res = await fetchOrCreateP256ApiKeyUser({
                publicKey: daPublicKey!,
                createParams: {
                  userName: "Delegated Access",
                  apiKeyName: "Delegated User API Key",
                },
              });

              const uid = res?.userId || res?.id;
              if (uid) {
                delegatedUserIdRef.current = uid;
                hasCreatedDelegatedUserRef.current = true;
                hasCreatedDelegatedPolicyRef.current = false;
                isDev && console.log("[TurnkeySessionBridge] Delegated user ready:", uid);
              } else {
                console.error(
                  "[TurnkeySessionBridge] fetchOrCreateP256ApiKeyUser succeeded but no userId returned"
                );
                hasCreatedDelegatedUserRef.current = true; // prevent loop
              }
            } catch (err: any) {
              const errorMessage = err?.message || err?.toString() || "";
              if (
                errorMessage.includes("Session public key") ||
                errorMessage.includes("session public key could not be found")
              ) {
                isDev && console.log(
                  "[TurnkeySessionBridge] Delegated user creation session error (handled):",
                  errorMessage
                );
              } else {
                console.error(
                  "[TurnkeySessionBridge] Failed to create delegated Turnkey user",
                  err
                );
              }
              hasCreatedDelegatedUserRef.current = true; // still continue pipeline
            }
          }

          // Delegated policy creation
          const delegatedUserId = delegatedUserIdRef.current;
          if (
            delegatedUserId &&
            !hasCreatedDelegatedPolicyRef.current
          ) {
            hasCreatedDelegatedPolicyRef.current = true;

            const policies = [
              {
                policyName: `Allow user ${delegatedUserId} to sign`,
                effect: "EFFECT_ALLOW",
                consensus: `approvers.any(user, user.id == '${delegatedUserId}')`,
                notes: "Allow Delegated Access user to sign transactions",
              },
            ];

            try {
              await fetchOrCreatePolicies({ policies });
              isDev && console.log(
                "[TurnkeySessionBridge] Delegated policy ensured:",
                delegatedUserId
              );
            } catch (err: any) {
              const errorMessage = err?.message || err?.toString() || "";
              if (
                errorMessage.includes("Session public key") ||
                errorMessage.includes("session public key could not be found")
              ) {
                isDev && console.log(
                  "[TurnkeySessionBridge] Delegated policy session error (handled):",
                  errorMessage
                );
              } else {
                console.error(
                  "[TurnkeySessionBridge] Failed to create delegated policy",
                  err
                );
              }
              hasCreatedDelegatedPolicyRef.current = false; // retry on next render
            }
          }
        }

        //
        // 1) Backend login → Get App JWT (FIRST, before any Turnkey sub-org operations)
        //    This must happen first because wallet-auth sessions can't modify sub-orgs
        //
        if (
          sessionData?.token &&
          sessionData.organizationId &&
          sessionData.userId &&
          !hasProcessedRef.current
        ) {
          hasProcessedRef.current = true;

          try {
            const referralCode = getStoredReferralCodeHint() || undefined;
            const data = await turnkeyLogin({
              turnkeySessionToken: sessionData.token,
              organizationId: sessionData.organizationId,
              userId: sessionData.userId,
              referralCode,
            });

            isDev && console.log("Turnkey login response:", data);
            const appToken = data?.token || undefined;

            if (!appToken) {
              console.error("Turnkey login failed: no token in response");
              hasProcessedRef.current = false;
              return;
            }

            Cookies.set("token", appToken, { expires: 7, path: "/" });
            // Clear referral code hint after successful login (it's been sent to backend)
            clearStoredReferralCodeHint();

            // Surface backend rejection of referral attribution (no-op if field absent).
            // Login itself succeeded, so the surface is informational, not a warning.
            const referralStatus = data?.referralStatus;
            if (referralStatus && referralStatus.applied === false && referralStatus.message) {
              showEnhancedToast('info', referralStatus.message);
            }

            pendingRefreshRef.current = true;
            await refreshUser();
            pendingRefreshRef.current = false;

            // Don't redirect if we're on the export page - let user stay there to export
            const isOnExportPage =
              router.pathname === "/turnkey/export" ||
              router.asPath.includes("/turnkey/export") ||
              router.pathname === "/portfolio";
            if (!isOnExportPage) {
              router.push("/pulse?chain=sol");
            } else {
              isDev && console.log("[TurnkeySessionBridge] User authenticated on export page, staying on page");
            }
          } catch (err: any) {
            const errorMessage = err?.message || err?.toString() || "";
            // Check for user limit error
            if (err?.code === 'USER_LIMIT_REACHED' || (err?.response?.data?.code === 'USER_LIMIT_REACHED')) {
              setUserLimitReached(err?.response?.data?.message || err?.message);
              hasProcessedRef.current = false;
              return;
            }
            // Suppress Turnkey session errors - they're handled gracefully
            if (errorMessage.includes("Session public key") || errorMessage.includes("session public key could not be found")) {
              isDev && console.log("[TurnkeySessionBridge] Session error handled gracefully:", errorMessage);
            } else {
              console.error("Error linking Turnkey session to app user", err);
            }
            hasProcessedRef.current = false;
          }
        }

        // Delegated user/policy creation is skipped to avoid P-256 key lookup errors during wallet-auth flows.
      } finally {
        isRunningRef.current = false;
      }
    })();
  }, [
    authState,
    session?.token,
    session?.organizationId,
    session?.userId,
    user?.userEmail,
    user?.userName,
    fetchOrCreateP256ApiKeyUser,
    fetchOrCreatePolicies,
    refreshUser,
    router,
    router.pathname,
    router.asPath,
  ]);

  return null;
}

// Wrapper component to show user limit blocker
function UserLimitBlockerWrapper() {
  const { showBlocker, blockerMessage } = useUserLimit();
  return <UserLimitBlocker isOpen={showBlocker} message={blockerMessage || undefined} />;
}

const config = getDefaultConfig({
  appName: "Meme Dashboard",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "YOUR_PROJECT_ID", // TODO: Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in your environment
  chains: [mainnet],
  ssr: true, // Keep SSR enabled, but handle client-side rendering in wrapper
});

const orbitron = Orbitron({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-orbitron',
  display: 'fallback', // 3s swap window — won't cause a 15s LCP event if font loads slowly
});

const geist = Geist({
  subsets: ['latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-geist',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-sans',
  display: 'swap',
});

function TokenHandler() {
  const { refreshUser } = useUser();
  const hasProcessedTokenRef = useRef(false);
  const loginToastIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    const token = url.searchParams.get('token');
    if (token) {
      if (hasProcessedTokenRef.current) return;
      hasProcessedTokenRef.current = true;

      Cookies.set('token', token, { expires: 7, path: '/' });
      refreshUser().then(() => {
        loginToastIdRef.current = showEnhancedToast('success', 'You are now signed in.', {
          id: 'login-success-toast',
          title: 'Welcome back',
          duration: 3200,
        });
        // Remove token from URL
        url.searchParams.delete('token');
        window.history.replaceState({}, document.title, url.pathname + url.search);
      });
    } else {
      hasProcessedTokenRef.current = false;
    }
  }, [refreshUser]);
  return null;
}

function ReferralTracker() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    const [, searchPart] = router.asPath.split('?');
    if (!searchPart) return;
    const params = new URLSearchParams(searchPart);
    const candidateKeys = ['referrer', 'ref', 'referral', 'code', 'referralCode'];
    for (const key of candidateKeys) {
      const value = params.get(key);
      if (value && typeof value === 'string' && value.trim().length > 0) {
        storeReferralCodeHint(value);
        break;
      }
    }
  }, [router.isReady, router.asPath]);

  return null;
}

function GlobalLoginModalManager({ enforceLogin }: { enforceLogin: boolean }) {
  const { user, loading: userLoading } = useUser();
  const [loginOpen, setLoginOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  
  // Only render on client side to prevent SSR issues with wagmi
  useEffect(() => {
    setIsMounted(true);
  }, []);
  
  useEffect(() => {
    if (!isMounted) return;
    if (enforceLogin && !userLoading && !user) {
      setLoginOpen(true);
    }
    if (user && loginOpen) {
      setLoginOpen(false);
    }
  }, [user, userLoading, enforceLogin, loginOpen, isMounted]);
  
  // Prevent closing if not logged in
  const handleLoginClose = () => {
    if (user) setLoginOpen(false);
  };
  
  if (!enforceLogin || !isMounted) return null;
  
  return (
    <LoginModal open={loginOpen} onClose={handleLoginClose} forceLogin={!user && !userLoading} />
  );
}

// function MobileBlocker({ children }: { children: React.ReactNode }) {
//   // Mobile blocker disabled - commented out but kept for future use
//   // const [isMobile, setIsMobile] = useState(false);
//   // const [isClient, setIsClient] = useState(false);

//   // useEffect(() => {
//   //   setIsClient(true);
//   //   
//   //   const checkMobile = () => {
//   //     setIsMobile(window.innerWidth < 500);
//   //   };

//   //   checkMobile();
//   //   window.addEventListener('resize', checkMobile);
//   //   return () => window.removeEventListener('resize', checkMobile);
//   // }, []);

//   // // Show nothing during SSR/initial load to prevent hydration issues
//   // if (!isClient) {
//   //   return null;
//   // }

//   // if (isMobile) {
//   //   return (
//   //     <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white p-4">
//   //       <div className="text-center">
//   //         <div className="mb-6">
//   //           <img 
//   //             src="/logo.png" 
//   //             alt="Logo" 
//   //             className="w-24 h-24 mx-auto mb-6 object-contain"
//   //           />
//   //         </div>
//   //         <h1 className="text-2xl font-bold mb-2">We're Coming Soon on Mobile!</h1>
//   //         <p className="text-gray-400 mb-4">
//   //           Our mobile experience is currently in development.
//   //         </p>
//   //         <p className="text-sm text-gray-500">
//   //           Please visit us on desktop for the full experience.
//   //         </p>
//   //       </div>
//   //     </div>
//   //   );
//   // }

//   return <>{children}</>;
// }

// Routes that actually render the heavy self-hosted TradingView "Advanced Charts" library (~2.7MB).
// Trailing slashes intentionally exclude the chart-free index pages (/perpetuals, /predictions).
// Matches exactly: /trade/[id], /trade/monad/[contractAddress], /perpetuals/[symbol], /predictions/[ticker].
const TV_CHART_ROUTE_PREFIXES = ['/trade/', '/perpetuals/', '/predictions/'] as const;

const MyApp: AppType = ({ Component, pageProps }) => {
  const [toastPosition, setToastPosition] = useState<'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'>('top-center');

  // Initialize WS confirmation listeners for optimistic trade mode (once)
  useEffect(() => {
    listenForConfirmationUpdates();
  }, []);

  // Load toast position from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('toast-position');

      // Migrate from bottom-center to top-center (old default that caused visibility issues)
      if (!saved || saved === 'bottom-center') {
        localStorage.setItem('toast-position', 'top-center');
        setToastPosition('top-center');
        return;
      }

      // Use user's saved preference
      if (['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'].includes(saved)) {
        setToastPosition(saved as typeof toastPosition);
      } else {
        // Invalid value, default to top-center
        localStorage.setItem('toast-position', 'top-center');
        setToastPosition('top-center');
      }
    }
  }, []);
  // Listen for toast position changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handlePositionChange = (e: CustomEvent) => {
      setToastPosition(e.detail.position);
    };

    window.addEventListener('toast-position-changed', handlePositionChange as EventListener);
    return () => {
      window.removeEventListener('toast-position-changed', handlePositionChange as EventListener);
    };
  }, []);

  // Chunk load error recovery for SPA navigation
  const routerForChunkRecovery = useRouter();

  // Only load the heavy TradingView charting library (~2.7MB) on routes that actually render a
  // chart. Each chart component (AdvancedOHLCChart / PerpChart / TradingViewPredictionChart)
  // self-loads the library on mount, so gating these global preloads is safe and keeps the payload
  // off every non-chart page (Pulse, Discover, Trackers, Portfolio, etc.) where it was pure waste.
  const isTradingViewChartRoute = TV_CHART_ROUTE_PREFIXES.some((prefix) =>
    routerForChunkRecovery.pathname.startsWith(prefix),
  );

  useEffect(() => {
    const handleRouteError = (err: any, url: string) => {
      if (
        err?.name === 'ChunkLoadError' ||
        /loading chunk [\d]+ failed/i.test(err?.message || '')
      ) {
        const parsed = new URL(url, window.location.origin);
        parsed.searchParams.set('_cr', String(Date.now()));
        const dest = parsed.pathname + parsed.search + parsed.hash;
        if (typeof caches !== 'undefined') {
          caches.keys().then(keys => {
            const toDelete = keys.filter(n => !n.includes('pulse-image-cache'));
            return Promise.all(toDelete.map(n => caches.delete(n)));
          }).then(() => { window.location.href = dest; })
            .catch(() => { window.location.href = dest; });
        } else {
          window.location.href = dest;
        }
      }
    };
    routerForChunkRecovery.events.on('routeChangeError', handleRouteError);
    return () => {
      routerForChunkRecovery.events.off('routeChangeError', handleRouteError);
    };
  }, [routerForChunkRecovery.events]);

  // Preload TradingView library script early for faster chart loading (chart routes only)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isTradingViewChartRoute) return;

    // Check if already loaded or loading
    if ((window as any).TradingView) return;

    // Check if script tag already exists
    const existingScript = document.querySelector('script[src="/charting_library/charting_library/charting_library.standalone.js"]');
    if (existingScript) return;

    // Preload the script in the background
    const script = document.createElement('script');
    script.src = '/charting_library/charting_library/charting_library.standalone.js';
    script.async = true;
    script.defer = true;
    // Don't set onload - let AdvancedOHLCChart handle it
    document.head.appendChild(script);
  }, [isTradingViewChartRoute]);

  // Pre-warm TradingView sub-bundles (library.*.js, chart-widget-gui.*.js)
  // Creating a tiny hidden widget forces V8 to parse+JIT-compile all TradingView code paths once,
  // so subsequent real widget creation is 2-3x faster (code already compiled).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isTradingViewChartRoute) return;
    // Skip if already pre-warmed
    if ((window as any).__tvPreWarmed) return;

    // Cancellation guards so the poll/warm chain stops if we leave the chart route mid-flight.
    let cancelled = false;
    let warmTimer: ReturnType<typeof setTimeout> | undefined;

    const doPreWarm = () => {
      if (cancelled) return;
      const TradingView = (window as any).TradingView;
      if (!TradingView?.widget) return;
      if ((window as any).__tvPreWarmed) return;
      (window as any).__tvPreWarmed = true;

      // Create a tiny off-screen container
      const container = document.createElement('div');
      container.style.cssText = 'width:1px;height:1px;position:absolute;left:-9999px;overflow:hidden';
      document.body.appendChild(container);

      // Minimal datafeed that returns immediately — just enough to trigger sub-bundle loading
      const minimalDatafeed = {
        onReady: (cb: (config: any) => void) => { setTimeout(() => cb({ supported_resolutions: ['1S'] }), 0); },
        resolveSymbol: (_symbolName: string, onResolve: (info: any) => void) => {
          setTimeout(() => onResolve({
            name: 'WARMUP', ticker: 'WARMUP', description: '', type: 'crypto',
            session: '24x7', timezone: 'Etc/UTC', exchange: '', listed_exchange: '',
            minmov: 1, pricescale: 100, has_seconds: true, seconds_multipliers: ['1'],
            has_intraday: true, supported_resolutions: ['1S'],
            data_status: 'streaming',
          }), 0);
        },
        getBars: (_symbolInfo: any, _resolution: string, _periodParams: any, onResult: (bars: any[], meta: any) => void) => {
          onResult([], { noData: true });
        },
        subscribeBars: () => {},
        unsubscribeBars: () => {},
        searchSymbols: () => {},
      };

      try {
        const widget = new TradingView.widget({
          container,
          symbol: 'WARMUP',
          datafeed: minimalDatafeed,
          interval: '1S',
          library_path: '/charting_library/charting_library/',
          locale: 'en',
          fullscreen: false,
          autosize: false,
          width: 1,
          height: 1,
          disabled_features: ['use_localstorage_for_settings'],
          enabled_features: ['seconds_resolution'],
          loading_screen: { backgroundColor: 'transparent' },
        });

        widget.onChartReady(() => {
          // Sub-bundles are now parsed and JIT-compiled — clean up
          try { widget.remove(); } catch {}
          try { document.body.removeChild(container); } catch {}
          isDev && console.log('[TradingView] Pre-warm complete — sub-bundles compiled');
        });
      } catch (e) {
        // Non-critical — chart will still work, just slightly slower on first load
        try { document.body.removeChild(container); } catch {}
        console.warn('[TradingView] Pre-warm failed:', e);
      }
    };

    // Wait for TradingView to be available, then pre-warm during idle time
    let warmRetries = 0;
    const MAX_WARM_RETRIES = 20; // 20 * 500ms = 10 seconds max wait
    const checkAndWarm = () => {
      if (cancelled) return;
      if ((window as any).TradingView?.widget) {
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(doPreWarm, { timeout: 3000 });
        } else {
          warmTimer = setTimeout(doPreWarm, 100);
        }
      } else if (++warmRetries < MAX_WARM_RETRIES) {
        warmTimer = setTimeout(checkAndWarm, 500);
      }
    };
    checkAndWarm();
    return () => {
      cancelled = true;
      if (warmTimer) clearTimeout(warmTimer);
    };
  }, [isTradingViewChartRoute]);

  // Register image caching service worker (production only)
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        isDev && console.log('[SW] Image cache registered, scope:', reg.scope);
      })
      .catch((err) => {
        console.warn('[SW] Registration failed:', err);
      });
  }, []);

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes" />
        <title>Interstate - The Fastest Exchange</title>
        <meta name="description" content="Get ready to win on Interstate, the fastest exchange! Get free Solana for joining today, win daily Jackpots, level up and earn progressively higher rewards. Start trading today!" />

        {/* Open Graph meta tags for social sharing */}
        <meta property="og:title" content="Interstate - The Fastest Exchange" />
        <meta property="og:description" content="Get ready to win on Interstate, the fastest exchange! Get free Solana for joining today, win daily Jackpots, level up and earn progressively higher rewards. Start trading today!" />
        {/* <meta property="og:image" content="https://app.interstate.so/referral-share.png" /> */}
        <meta property="og:image:width" content="1920" />
        <meta property="og:image:height" content="1080" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Interstate" />

        {/* Twitter Card meta tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Interstate - The Fastest Exchange" />
        <meta name="twitter:description" content="Get ready to win on Interstate, the fastest exchange! Get free Solana for joining today, win daily Jackpots, level up and earn progressively higher rewards. Start trading today!" />
        {/* <meta name="twitter:image" content="https://app.interstate.so/referral-share.png" /> */}
        {/* Preload rank backgrounds, textures + badge images to prevent flicker on navigation */}
        <link rel="preload" href="/ranks/Background.png" as="image" />
        <link rel="preload" href="/ranks/Background2.png" as="image" />
        <link rel="preload" href="/future.png" as="image" />
        <link rel="preload" href="/ranks/Coin.png" as="image" />
        <link rel="preload" href="/ranks/degen-1.png" as="image" />
        <link rel="preload" href="/ranks/degen-2.png" as="image" />
        <link rel="preload" href="/ranks/degen-3.png" as="image" />
        <link rel="preload" href="/ranks/degen-4.png" as="image" />
        {/* Preload TradingView library only on chart routes — kept off Pulse/Discover/Trackers/etc. */}
        {isTradingViewChartRoute && (
          <>
            <link
              rel="preload"
              href="/charting_library/charting_library/charting_library.standalone.js"
              as="script"
              crossOrigin="anonymous"
            />
            {/* Preload heavy TradingView bundles (high-priority download before trade page opens) */}
            <link rel="preload" href="/charting_library/charting_library/bundles/library.15664647653f41254b4d.js" as="script" crossOrigin="anonymous" />
            <link rel="preload" href="/charting_library/charting_library/bundles/chart-widget-gui.4ec424eb56739ee22285.js" as="script" crossOrigin="anonymous" />
          </>
        )}
        <link rel="icon" type="image/png" sizes="32x32" href="/interstate/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/interstate/favicon-16x16.png" />
        <style jsx global>{`
          html, body {
            background-color: #101114 !important;
            color: white !important;
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif !important;
            font-weight: 400 !important;
          }
          #__next {
            background-color: #101114;
            min-height: 100vh;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif !important;
          }
          * {
            transition: none !important;
            font-family: inherit;
          }
          h1, h2, h3, h4, h5, h6 {
            font-weight: 500 !important;
          }
        `}</style>
        <style dangerouslySetInnerHTML={{
          __html: `
            html, body { 
              background-color: #101114 !important; 
              color: white !important; 
              font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif !important;
              font-weight: 400 !important;
            }
            #__next { 
              background-color: #101114; 
              min-height: 100vh; 
              font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif !important;
            }
            * { 
              transition: none !important; 
              font-family: inherit;
            }
            h1, h2, h3, h4, h5, h6 {
              font-weight: 500 !important;
            }
          `
        }} />
      </Head>
      <div className={`${inter.variable} ${orbitron.variable} ${geist.variable}`}>
        {/* MobileBlocker disabled - MOBILE VIEW DISABLED
        <MobileBlocker>
        */}
        <TurnkeyRootProvider>
          {/* <MonadTradeBanner /> */}
          <WagmiProviderWrapper config={config} queryClient={queryClient}>
            <UserProvider>
              <UserLimitProvider>
                <TurnkeySessionBridge />
                <TokenHandler />
                <ReferralTracker />
                <SolPriceProvider>
                  <ThemeProvider>
                    <QuickBuyProvider>
                      <SearchProvider>
                        <WatchlistProvider>
                          <FilterProvider>
                            <WalletTrackerProvider>
                              <SolanaPositionWebSocketProvider>
                                <PortfolioDataProvider>
                                <ArenaWebSocketProvider>
                                  <ReferralAccessGate>
                                    <DockedPanelProvider>
                                      <HyperliquidProvider>
                                        <HyperliquidUserStreamProvider>
                                          <PagePreloader />
                                          <PulseBackgroundLoader />
                                          <TrendingBackgroundLoader />
                                          <ErrorBoundary>
                                            <Component {...pageProps} />
                                          </ErrorBoundary>
                                        </HyperliquidUserStreamProvider>
                                      </HyperliquidProvider>
                                    </DockedPanelProvider>
                                  </ReferralAccessGate>
                                </ArenaWebSocketProvider>
                                </PortfolioDataProvider>
                              </SolanaPositionWebSocketProvider>
                            </WalletTrackerProvider>
                          </FilterProvider>
                        </WatchlistProvider>
                      </SearchProvider>
                    </QuickBuyProvider>
                    <GlobalLoginModalManager enforceLogin={!!env.NEXT_PUBLIC_IS_BACKEND_DEPLOYED} />

                    <UserLimitBlockerWrapper />
                  </ThemeProvider>
                </SolPriceProvider>
              </UserLimitProvider>
            </UserProvider>
          </WagmiProviderWrapper>
          </TurnkeyRootProvider>
        {/* </MobileBlocker> */}
      </div>
      <Toaster
        position={toastPosition}
        containerStyle={{
          zIndex: 99999,
        }}
        toastOptions={{
          duration: 4000,
          style: {
            background: 'rgba(16, 17, 20, 0.6)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            color: '#E6E7EA',
            border: '1px solid rgba(75, 85, 99, 0.4)',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '500',
            maxWidth: '480px',
            padding: '16px',
            zIndex: 9999,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          },
          success: {
            style: {
              border: 'none',
            },
          },
          error: {
            style: {
              border: '1px solid #ff6b6b',
            },
          },
        }}
      />
    </>
  );
};

export default MyApp;
