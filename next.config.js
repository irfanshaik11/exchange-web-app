/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
  output: "standalone",
  // Disable error overlay in development (errors still logged to console)
  devIndicators: {
    position: "bottom-right",
  },
  // Turbopack configuration
  turbopack: {
    // Turbopack settings
  },
  webpack: (config, { isServer }) => {
    // Handle CommonJS modules that don't support named exports
    config.resolve.alias = {
      ...config.resolve.alias,
      "@vanilla-extract/sprinkles/createUtils":
        "@vanilla-extract/sprinkles/createUtils",
    };

    // Force CommonJS modules to be treated as CommonJS
    config.module.rules.push({
      test: /node_modules\/@vanilla-extract\/sprinkles/,
      type: "javascript/auto",
    });

    // Handle module resolution for Node 18
    config.resolve.extensionAlias = {
      ".js": [".js", ".ts", ".tsx"],
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
