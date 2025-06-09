import { type AppType } from "next/app";
import { Geist } from "next/font/google";
import "~/styles/globals.css";
import "@rainbow-me/rainbowkit/styles.css";
import { getDefaultConfig, RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserProvider, useUser } from "../components/UserContext";
import { Toaster } from 'react-hot-toast';
import { useEffect } from 'react';
import Cookies from 'js-cookie';
import { useRouter } from 'next/router';
import toast from 'react-hot-toast';
import { mainnet } from 'viem/chains';

const config = getDefaultConfig({
  appName: "Meme Dashboard",
  projectId: "YOUR_PROJECT_ID", // TODO: Replace with your WalletConnect projectId
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

const MyApp: AppType = ({ Component, pageProps }) => {
  return (
    <div className={geist.className}>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider theme={darkTheme({ accentColor: "#10b981" })}>
            <UserProvider>
              <TokenHandler />
              <Component {...pageProps} />
            </UserProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
      <Toaster position="top-right" />
    </div>
  );
};

export default MyApp;
