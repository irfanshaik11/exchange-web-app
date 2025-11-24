import { type AppType } from "next/app";
import { Inter } from "next/font/google";
import "~/styles/globals.css";
import "@rainbow-me/rainbowkit/styles.css";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { queryClient } from '../lib/queryClient';
import { WagmiProviderWrapper } from '../components/WagmiProviderWrapper';
import { UserProvider, useUser } from "../components/UserContext";
import { Toaster } from 'react-hot-toast';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Cookies from 'js-cookie';
import { mainnet } from 'viem/chains';
import dynamic from 'next/dynamic';

// Dynamically import LoginModal with no SSR to prevent wagmi provider issues
const LoginModal = dynamic(() => import('../components/LoginModal'), {
  ssr: false,
});

// Dynamically import MonadTradeBanner with no SSR for animations
const MonadTradeBanner = dynamic(() => import('../components/MonadTradeBanner'), {
  ssr: false,
});
import { env } from '../env';
import { QuickBuyProvider } from '../components/QuickBuyContext';
import { WatchlistProvider } from '../components/WatchlistContext';
import { FilterProvider } from '../components/FilterContext';
import { SolPriceProvider } from '../components/SolPriceContext';
import { WalletTrackerProvider } from '../components/WalletTrackerContext';
import { ReferralAccessGate } from '../components/ReferralAccessGate';
import { ThemeProvider } from '../components/ThemeContext';
import Head from 'next/head';
import 'react-datepicker/dist/react-datepicker.css';
import { showEnhancedToast } from '../utils/enhancedToast';
import { storeReferralCodeHint } from '~/utils/referralStorage';
import { TurnkeyProviderWrapper } from '../components/TurnkeyProviderWrapper';

// Suppress Next.js error overlay for caught errors in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  // LAYER 1: Suppress console.error that triggers overlay
  const originalConsoleError = console.error;
  console.error = (...args) => {
    const errorString = args[0]?.toString() || '';
    const stackTrace = args[1]?.stack || '';

    // Suppress Next.js dev overlay for handled ApiErrors and trade-related errors
    if (
      errorString.includes('ApiError') ||
      errorString.includes('[Trade]') ||
      errorString.includes('Trade validation failed') ||
      errorString.includes('Insufficient') ||
      stackTrace.includes('TradeActionPanel') ||
      stackTrace.includes('api.ts')
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

    // Check if this is an ApiError or trade-related error that we've already handled
    if (
      error?.name === 'ApiError' ||
      error?.constructor?.name === 'ApiError' ||
      errorMessage.includes('Trade validation failed') ||
      errorMessage.includes('Insufficient') ||
      errorMessage.includes('NO_HOLDINGS') ||
      errorMessage.includes('AMOUNT_TOO_SMALL')
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      console.log('[Error Suppressed] ApiError caught and handled by application:', errorMessage);
      return false;
    }
  }, true); // Use capture phase to intercept early

  // LAYER 3: Intercept unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const reasonMessage = reason?.message || '';

    // Check if this is an ApiError from our API
    if (
      reason?.name === 'ApiError' ||
      reason?.constructor?.name === 'ApiError' ||
      reasonMessage.includes('Trade validation failed') ||
      reasonMessage.includes('Insufficient') ||
      reasonMessage.includes('NO_HOLDINGS') ||
      reasonMessage.includes('AMOUNT_TOO_SMALL')
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      console.log('[Error Suppressed] Unhandled ApiError rejection caught:', reasonMessage);
      return false;
    }
  }, true); // Use capture phase to intercept early
}

const config = getDefaultConfig({
  appName: "Meme Dashboard",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "YOUR_PROJECT_ID", // TODO: Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in your environment
  chains: [mainnet],
  ssr: true, // Keep SSR enabled, but handle client-side rendering in wrapper
});

const inter = Inter({
  weight: ['400', '500'],
  subsets: ['latin'],
  variable: '--font-inter',
});

function TokenHandler() {
  const { refreshUser, user, loading: userLoading } = useUser();
  const router = useRouter();
  const hasProcessedTokenRef = useRef(false);
  const loginToastIdRef = useRef<string | null>(null);
  const redirectAttemptedRef = useRef(false);
  
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    const token = url.searchParams.get('token');
    
    if (token) {
      if (hasProcessedTokenRef.current) return;
      hasProcessedTokenRef.current = true;

      console.log('[TokenHandler] Processing token from URL...');
      Cookies.set('token', token, { expires: 7, path: '/' });
      
      refreshUser().then(() => {
        console.log('[TokenHandler] refreshUser() completed, waiting for user state...');
      }).catch((error) => {
        console.error('[TokenHandler] Failed to refresh user after login:', error);
        hasProcessedTokenRef.current = false;
        redirectAttemptedRef.current = false;
      });
    } else {
      hasProcessedTokenRef.current = false;
      redirectAttemptedRef.current = false;
    }
  }, [refreshUser, router]);
  
  // Separate effect to handle redirect once user state is confirmed
  useEffect(() => {
    if (!hasProcessedTokenRef.current) return;
    if (redirectAttemptedRef.current) return;
    
    const url = new URL(window.location.href);
    const token = url.searchParams.get('token');
    
    // Only proceed if we have a token and user is now loaded
    if (token && user && !userLoading) {
      console.log('[TokenHandler] ✅ User state confirmed, redirecting to /pulse');
      
      loginToastIdRef.current = showEnhancedToast('success', 'You are now signed in.', {
        id: 'login-success-toast',
        title: 'Welcome back',
        duration: 3200,
      });
      
      // Remove token from URL
      url.searchParams.delete('token');
      window.history.replaceState({}, document.title, url.pathname + url.search);
      
      // Redirect to /pulse dashboard
      redirectAttemptedRef.current = true;
      router.push('/pulse');
    }
  }, [user, userLoading, router]);
  
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
    
    // If user is authenticated, close login modal immediately
    if (user && loginOpen) {
      setLoginOpen(false);
      return;
    }
    
    // Only show login if enforceLogin is true, not loading, and no user
    if (enforceLogin && !userLoading && !user) {
      // Check if there's a token in cookies or URL
      const token = Cookies.get('token');
      const urlParams = new URLSearchParams(window.location.search);
      const hasTokenInUrl = urlParams.has('token');
      
      // If there's a token (in cookie or URL), wait longer for user state to load
      // This handles the case where we just logged in and TokenHandler is processing
      if (token || hasTokenInUrl) {
        // Wait longer when token exists - TokenHandler needs time to process
        const timeout = setTimeout(() => {
          // Final check: token still exists and user still isn't loaded
          const currentToken = Cookies.get('token');
          const stillHasTokenInUrl = new URLSearchParams(window.location.search).has('token');
          
          // Don't show login if:
          // 1. Token was removed (user logged out)
          // 2. User is now loaded (authentication succeeded)
          // 3. Token is still in URL (TokenHandler is still processing)
          if (!currentToken || user || stillHasTokenInUrl) {
            return;
          }
          
          // All checks passed - show login modal
          console.log('[GlobalLoginModalManager] Showing login modal - no user and no token');
          setLoginOpen(true);
        }, 2500); // Increased delay to 2.5 seconds when token exists
        return () => clearTimeout(timeout);
      } else {
        // No token - show login immediately (after short delay)
        const timeout = setTimeout(() => {
          if (!user && !userLoading) {
            console.log('[GlobalLoginModalManager] Showing login modal - no user and no token');
            setLoginOpen(true);
          }
        }, 500);
        return () => clearTimeout(timeout);
      }
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

function MobileBlocker({ children }: { children: React.ReactNode }) {
  // Mobile blocker disabled - commented out but kept for future use
  // const [isMobile, setIsMobile] = useState(false);
  // const [isClient, setIsClient] = useState(false);

  // useEffect(() => {
  //   setIsClient(true);
  //   
  //   const checkMobile = () => {
  //     setIsMobile(window.innerWidth < 500);
  //   };

  //   checkMobile();
  //   window.addEventListener('resize', checkMobile);
  //   return () => window.removeEventListener('resize', checkMobile);
  // }, []);

  // // Show nothing during SSR/initial load to prevent hydration issues
  // if (!isClient) {
  //   return null;
  // }

  // if (isMobile) {
  //   return (
  //     <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white p-4">
  //       <div className="text-center">
  //         <div className="mb-6">
  //           <img 
  //             src="/logo.png" 
  //             alt="Logo" 
  //             className="w-24 h-24 mx-auto mb-6 object-contain"
  //           />
  //         </div>
  //         <h1 className="text-2xl font-bold mb-2">We're Coming Soon on Mobile!</h1>
  //         <p className="text-gray-400 mb-4">
  //           Our mobile experience is currently in development.
  //         </p>
  //         <p className="text-sm text-gray-500">
  //           Please visit us on desktop for the full experience.
  //         </p>
  //       </div>
  //     </div>
  //   );
  // }

  return <>{children}</>;
}

const MyApp: AppType = ({ Component, pageProps }) => {
  const [toastPosition, setToastPosition] = useState<'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'>('bottom-center');

  // Load toast position from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('toast-position');
      if (saved && ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'].includes(saved)) {
        setToastPosition(saved as any);
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

  return (
    <>
      <Head>
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
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
      <div className={inter.className}>
        <MobileBlocker>
          <MonadTradeBanner />
          <TurnkeyProviderWrapper>
            <WagmiProviderWrapper config={config} queryClient={queryClient}>
              <UserProvider>
                <TokenHandler />
                <ReferralTracker />
                <SolPriceProvider>
                  <ThemeProvider>
                    <QuickBuyProvider>
                      <WatchlistProvider>
                        <FilterProvider>
                          <WalletTrackerProvider>
                            <ReferralAccessGate>
                              <Component {...pageProps} />
                            </ReferralAccessGate>
                          </WalletTrackerProvider>
                        </FilterProvider>
                      </WatchlistProvider>
                    </QuickBuyProvider>
                    <GlobalLoginModalManager enforceLogin={!!env.NEXT_PUBLIC_IS_BACKEND_DEPLOYED} />
                  </ThemeProvider>
                </SolPriceProvider>
              </UserProvider>
            </WagmiProviderWrapper>
          </TurnkeyProviderWrapper>
          <Toaster 
            position={toastPosition}
            toastOptions={{
              duration: 4000,
              style: {
                background: '#1E1F26',
                color: '#E6E7EA',
                border: '1px solid #4B5563',
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
                  border: '1px solid #70E0B0',
                },
              },
              error: {
                style: {
                  border: '1px solid #ff6b6b',
                },
              },
            }}
          />
        </MobileBlocker>
      </div>
    </>
  );
};

export default MyApp;
