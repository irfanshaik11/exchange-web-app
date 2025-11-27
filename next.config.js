/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
  // output: "standalone", // Temporarily disabled to fix build
  // Disable error overlay and loading indicators in development
  devIndicators: {
    position: "bottom-right",
  },
  // Transpile these packages to fix CommonJS/ESM issues
  transpilePackages: ['@vanilla-extract/sprinkles', '@vanilla-extract/css', '@rainbow-me/rainbowkit'],
  // Optimize package imports for faster loading
  experimental: {
    optimizePackageImports: ['react-icons'],
  },
  // Disable page transitions and loading indicators
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  // Turbopack configuration
  turbopack: {
    // Turbopack settings
  },
  webpack: (config) => {
    // Handle @react-native-async-storage warning (optional dependency for MetaMask SDK)
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@react-native-async-storage/async-storage': false,
    };

    return config;
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "arweave.net" },
      { protocol: "https", hostname: "ipfs.io" },
      { protocol: "https", hostname: "cloudflare-ipfs.com" },
      { protocol: "https", hostname: "gateway.pinata.cloud" },
      { protocol: "https", hostname: "pump.fun" },
      { protocol: "https", hostname: "cdn.pump.fun" },
      { protocol: "https", hostname: "moonitcdn.io" },
      { protocol: "https", hostname: "metadata.pumployer.fun" },
      { protocol: "https", hostname: "logos-world.net" },
      { protocol: "https", hostname: "s1.coincarp.com" },
      { protocol: "https", hostname: "s2.coinmarketcap.com" },
      { protocol: "https", hostname: "s3.coinmarketcap.com" },
      {
        protocol: "https",
        hostname: "dropsearn.fra1.cdn.digitaloceanspaces.com",
      },
      { protocol: "https", hostname: "encrypted-tbn0.gstatic.com" },
      { protocol: "https", hostname: "play-lh.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "api.phantom.app" },
      { protocol: "https", hostname: "token-media.defined.fi" },
      { protocol: "https", hostname: "cdn.dexscreener.com" },
      { protocol: "https", hostname: "raw.githubusercontent.com" },
      { protocol: "https", hostname: "gateway.irys.xyz" },
      { protocol: "https", hostname: "encrypted-tbn3.gstatic.com" },
      { protocol: "https", hostname: "bronze-manual-jaguar-516.mypinata.cloud" },
      { protocol: "https", hostname: "pub-392e3698ab10439a9bf254db45b52c0b.r2.dev" },
      { protocol: "https", hostname: "dweb.link" },
      { protocol: "https", hostname: "metadata.rapidlaunch.io" },
    ],
  },

  /**
   * If you are using `appDir` then you must comment the below `i18n` config out.
   *
   * @see https://github.com/vercel/next.js/issues/41980
   */
  i18n: {
    locales: ["en"],
    defaultLocale: "en",
  },

  async redirects() {
    return [
      {
        source: "/",
        destination: "/pulse",
        permanent: false,
      },
    ];
  },
};

export default config;
