/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
  // output: "standalone", // Temporarily disabled to fix build
  // Disable error overlay and loading indicators in development
  devIndicators: {
    position: "bottom-right",
  },
  // Transpile these packages to fix CommonJS/ESM issues
  transpilePackages: ['@vanilla-extract/sprinkles', '@vanilla-extract/css', '@rainbow-me/rainbowkit',  '@turnkey/react-wallet-kit', '@turnkey/core'],
  // Optimize package imports for faster loading
  experimental: {
    optimizePackageImports: ['react-icons'],
  },
  // Disable page transitions and loading indicators
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  // Turbopack configuration - explicitly set root to fix workspace detection
  turbopack: {
    root: __dirname,
  },
  webpack: (config, { isServer, webpack }) => {
    // Handle @react-native-async-storage warning (optional dependency for MetaMask SDK)
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@react-native-async-storage/async-storage': false,
    };

    // Ignore test files from node_modules (fixes Next.js 16 bundling issues)
    // Use NormalModuleReplacementPlugin to replace test file imports with empty modules
    const emptyModulePath = path.resolve(__dirname, './src/utils/empty-module.js');
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /node_modules\/thread-stream\/test\/.*$/,
        emptyModulePath
      ),
      new webpack.NormalModuleReplacementPlugin(
        /node_modules\/@turnkey\/core\/node_modules\/thread-stream\/test\/.*$/,
        emptyModulePath
      ),
      new webpack.NormalModuleReplacementPlugin(
        /node_modules\/thread-stream\/bench\.js$/,
        emptyModulePath
      ),
      new webpack.NormalModuleReplacementPlugin(
        /node_modules\/@turnkey\/core\/node_modules\/thread-stream\/bench\.js$/,
        emptyModulePath
      ),
      new webpack.IgnorePlugin({
        resourceRegExp: /^(tap|desm|fastbench|pino-elasticsearch|why-is-node-running|tape)$/,
      })
    );

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
      { protocol: "https", hostname: "dflow.net" },
      { protocol: "https", hostname: "*.dflow.net" },
      { protocol: "https", hostname: "dev-prediction-markets-api.dflow.net" },
      { protocol: "https", hostname: "imagedelivery.net" },
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

  async headers() {
    return [
      {
        // All routes (HTML, API): no caching
        source: '/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, must-revalidate' },
        ],
      },
      {
        // Content-hashed static assets: cache forever (hash changes on rebuild)
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Hash-based image proxy: deterministic URLs, cache forever
        source: '/api/img/:hash*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // TradingView charting library — 25MB of static JS, never changes between deploys
        source: '/charting_library/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },

  async redirects() {
    return [
      {
        source: "/",
        destination: "/pulse?chain=sol",
        permanent: false,
      },
      {
        source: "/arena",
        destination: "/outpost",
        permanent: true,
      },
    ];
  },
};

export default config;
