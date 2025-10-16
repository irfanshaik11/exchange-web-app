/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
  output: 'standalone',
  // Disable error overlay in development (errors still logged to console)
  devIndicators: {
    buildActivityPosition: 'bottom-right',
  },
  // Suppress runtime errors in development overlay
  experimental: {
    // This prevents caught errors from showing in the overlay
    turbo: {
      // Turbopack settings
    },
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'arweave.net' },
      { protocol: 'https', hostname: 'ipfs.io' },
      { protocol: 'https', hostname: 'cloudflare-ipfs.com' },
      { protocol: 'https', hostname: 'gateway.pinata.cloud' },
      { protocol: 'https', hostname: 'pump.fun' },
      { protocol: 'https', hostname: 'cdn.pump.fun' },
      { protocol: 'https', hostname: 'moonitcdn.io' },
      { protocol: 'https', hostname: 'metadata.pumployer.fun' },
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
};

export default config;
