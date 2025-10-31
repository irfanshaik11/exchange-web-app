import { type AppType } from "next/app";
import { Geist } from "next/font/google";
import "~/styles/globals.css";
import "@rainbow-me/rainbowkit/styles.css";
import { getDefaultConfig, RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserProvider, useUser } from "../components/UserContext";
import { Toaster } from 'react-hot-toast';
import { useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import { useRouter } from 'next/router';
import toast from 'react-hot-toast';
import { mainnet } from 'viem/chains';
import LoginModal from '../components/LoginModal';
import { env } from '../env';
import { QuickBuyProvider } from '../components/QuickBuyContext';
import { WatchlistProvider } from '../components/WatchlistContext';
import { FilterProvider } from '../components/FilterContext';
import { SolPriceProvider } from '../components/SolPriceContext';
import { WalletTrackerProvider } from '../components/WalletTrackerContext';
import Head from 'next/head';
import 'react-datepicker/dist/react-datepicker.css';

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
  ssr: true,
});

const geist = Geist({
  subsets: ["latin"],
});

const queryClient = new QueryClient();

function TokenHandler() {
  const { refreshUser } = useUser();
  const router = useRouter();
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const token = url.searchParams.get('token');
    if (token) {
      Cookies.set('token', token, { expires: 7, path: '/' });
      refreshUser().then(() => {
        toast.success('Logged in successfully!');
        // Remove token from URL
        url.searchParams.delete('token');
        window.history.replaceState({}, document.title, url.pathname + url.search);
      });
    }
  }, []);
  return null;
}

function GlobalLoginModalManager({ enforceLogin }: { enforceLogin: boolean }) {
  const { user, loading: userLoading } = useUser();
  const [loginOpen, setLoginOpen] = useState(false);
  useEffect(() => {
    if (enforceLogin && !userLoading && !user) {
      setLoginOpen(true);
    }
    if (user && loginOpen) {
      setLoginOpen(false);
    }
  }, [user, userLoading, enforceLogin]);
  // Prevent closing if not logged in
  const handleLoginClose = () => {
    if (user) setLoginOpen(false);
  };
  if (!enforceLogin) return null;
  return (
    <LoginModal open={loginOpen} onClose={handleLoginClose} forceLogin={!user && !userLoading} />
  );
}

function MobileBlocker({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 500);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Show nothing during SSR/initial load to prevent hydration issues
  if (!isClient) {
    return null;
  }

  if (isMobile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white p-4">
        <div className="text-center">
          <div className="mb-6">
            <img 
              src="/logo.png" 
              alt="Logo" 
              className="w-24 h-24 mx-auto mb-6 object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold mb-2">We're Coming Soon on Mobile!</h1>
          <p className="text-gray-400 mb-4">
            Our mobile experience is currently in development.
          </p>
          <p className="text-sm text-gray-500">
            Please visit us on desktop for the full experience.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

const MyApp: AppType = ({ Component, pageProps }) => {
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
          }
          #__next {
            background-color: #101114;
            min-height: 100vh;
          }
          * {
            transition: none !important;
          }
        `}</style>
        <style dangerouslySetInnerHTML={{
          __html: `
            html, body { background-color: #101114 !important; color: white !important; }
            #__next { background-color: #101114; min-height: 100vh; }
            * { transition: none !important; }
          `
        }} />
      </Head>
      <div className={geist.className}>
        <MobileBlocker>
          <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
              <RainbowKitProvider theme={darkTheme({ accentColor: "#10b981" })}>
                <UserProvider>
                  <TokenHandler />
                  <SolPriceProvider>
                    <QuickBuyProvider>
                      <WatchlistProvider>
                        <FilterProvider>
                          <WalletTrackerProvider>
                            <Component {...pageProps} />
                          </WalletTrackerProvider>
                        </FilterProvider>
                      </WatchlistProvider>
                    </QuickBuyProvider>
                    <GlobalLoginModalManager enforceLogin={!!env.NEXT_PUBLIC_IS_BACKEND_DEPLOYED} />
                  </SolPriceProvider>
                </UserProvider>
              </RainbowKitProvider>
            </QueryClientProvider>
          </WagmiProvider>
          <Toaster 
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#1E1F26',
                color: '#E6E7EA',
                border: '1px solid #4B5563',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                maxWidth: '400px',
                zIndex: 9999
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
