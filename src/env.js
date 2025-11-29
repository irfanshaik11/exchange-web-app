import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]),
    NEON_DB_API_KEY: z.string(),
    X_API_KEY: z.string().optional(),
    X_API_KEY_SECRET: z.string().optional(),
    X_BEARER_TOKEN: z.string().optional(),
    X_CLIENT_ID: z.string().optional(),
    X_CLIENT_SECRET: z.string().optional(),
    X_REDIRECT_URI: z.string().url().optional(),
    MONAD_RPC_URL: z.string().url().optional(),
    MONAD_TOKEN_SERVICE_URL: z.string().url().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_WEBSOCKET_URL: z.string().url(),
    NEXT_PUBLIC_BACKEND_URL: z.string(),
    NEXT_PUBLIC_GO_SERVICE_URL: z.string().url(),
    NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL: z.string().url().optional(),
    NEXT_PUBLIC_IS_BACKEND_DEPLOYED: z.preprocess(
      (val) => val === "true" || val === true,
      z.boolean(),
    ),
    NEXT_PUBLIC_CODEX_API_KEY: z.string().optional(),
    NEXT_PUBLIC_BACKEND_API_KEY: z.string().optional(),
    NEXT_PUBLIC_ANALYTICS_URL: z.string().url().optional(),
    NEXT_PUBLIC_WALLET_TRACKER_URL: z.string().url().optional(),
    NEXT_PUBLIC_WALLET_TRACKER_WS_URL: z.string().url().optional(),
		NEXT_PUBLIC_SOLANA_RPC: z.string().url().optional(),
    NEXT_PUBLIC_REQUIRE_REFERRAL_ACCESS: z
      .preprocess((val) => val === "true" || val === true, z.boolean())
      .optional(),
    NEXT_PUBLIC_DEFAULT_REFERRAL_CODE: z.string().optional(),
    NEXT_PUBLIC_MONAD_RPC_URL: z.string().url().optional(),
    NEXT_PUBLIC_ORGANIZATION_ID:z.string().optional(),
    NEXT_PUBLIC_AUTH_PROXY_CONFIG_ID:z.string().optional(),
    NEXT_PUBLIC_TURNKEY_AUTH_PROXY_URL: z.string().optional(),
    NEXT_PUBLIC_GOOGLE_CLIENT_ID:z.string().optional(),
    NEXT_PUBLIC_REDIRECT_URI:z.string().optional(),
    NEXT_PUBLIC_TURNKEY_API_BASE_URL:z.string().url().optional(),
    NEXT_PUBLIC_ONRAMPER_API_KEY: z.string()
    // NEXT_PUBLIC_CLIENTVAR: z.string(),

  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    NEON_DB_API_KEY: process.env.NEON_DB_API_KEY,
    X_API_KEY: process.env.X_API_KEY,
    X_API_KEY_SECRET: process.env.X_API_KEY_SECRET,
    X_BEARER_TOKEN: process.env.X_BEARER_TOKEN,
    X_CLIENT_ID: process.env.X_CLIENT_ID,
    X_CLIENT_SECRET: process.env.X_CLIENT_SECRET,
    X_REDIRECT_URI: process.env.X_REDIRECT_URI,
    MONAD_RPC_URL: process.env.MONAD_RPC_URL,
    MONAD_TOKEN_SERVICE_URL: process.env.MONAD_TOKEN_SERVICE_URL,
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL,
    NEXT_PUBLIC_GO_SERVICE_URL: process.env.NEXT_PUBLIC_GO_SERVICE_URL,
    NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL: process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL,
    NEXT_PUBLIC_WEBSOCKET_URL: process.env.NEXT_PUBLIC_WEBSOCKET_URL,
    NEXT_PUBLIC_IS_BACKEND_DEPLOYED:
      process.env.NEXT_PUBLIC_IS_BACKEND_DEPLOYED,
    NEXT_PUBLIC_CODEX_API_KEY: process.env.NEXT_PUBLIC_CODEX_API_KEY,
    NEXT_PUBLIC_BACKEND_API_KEY: process.env.NEXT_PUBLIC_BACKEND_API_KEY,
    NEXT_PUBLIC_ANALYTICS_URL: process.env.NEXT_PUBLIC_ANALYTICS_URL,
    NEXT_PUBLIC_WALLET_TRACKER_URL: process.env.NEXT_PUBLIC_WALLET_TRACKER_URL,
    NEXT_PUBLIC_WALLET_TRACKER_WS_URL: process.env.NEXT_PUBLIC_WALLET_TRACKER_WS_URL,
		NEXT_PUBLIC_SOLANA_RPC: process.env.NEXT_PUBLIC_SOLANA_RPC,
		NEXT_PUBLIC_REQUIRE_REFERRAL_ACCESS: process.env.NEXT_PUBLIC_REQUIRE_REFERRAL_ACCESS,
    NEXT_PUBLIC_DEFAULT_REFERRAL_CODE: process.env.NEXT_PUBLIC_DEFAULT_REFERRAL_CODE,
    NEXT_PUBLIC_MONAD_RPC_URL: process.env.NEXT_PUBLIC_MONAD_RPC_URL,
    NEXT_PUBLIC_ORGANIZATION_ID:process.env. NEXT_PUBLIC_ORGANIZATION_ID,
    NEXT_PUBLIC_AUTH_PROXY_CONFIG_ID:process.env.NEXT_PUBLIC_AUTH_PROXY_CONFIG_ID,
    NEXT_PUBLIC_TURNKEY_AUTH_PROXY_URL: process.env.NEXT_PUBLIC_TURNKEY_AUTH_PROXY_URL,
    NEXT_PUBLIC_GOOGLE_CLIENT_ID:process.env. NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    NEXT_PUBLIC_REDIRECT_URI:process.env.NEXT_PUBLIC_REDIRECT_URI,
    NEXT_PUBLIC_TURNKEY_API_BASE_URL:process.env.NEXT_PUBLIC_TURNKEY_API_BASE_URL,
    NEXT_PUBLIC_ONRAMPER_API_KEY: process.env.NEXT_PUBLIC_ONRAMPER_API_KEY,

    // NEXT_PUBLIC_CLIENTVAR: process.env.NEXT_PUBLIC_CLIENTVAR,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
