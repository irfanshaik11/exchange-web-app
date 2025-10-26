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

    // NEXT_PUBLIC_CLIENTVAR: z.string(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    NEON_DB_API_KEY: process.env.NEON_DB_API_KEY,
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL,
    NEXT_PUBLIC_GO_SERVICE_URL: process.env.NEXT_PUBLIC_GO_SERVICE_URL,
    NEXT_PUBLIC_WEBSOCKET_URL: process.env.NEXT_PUBLIC_WEBSOCKET_URL,
    NEXT_PUBLIC_IS_BACKEND_DEPLOYED:
      process.env.NEXT_PUBLIC_IS_BACKEND_DEPLOYED,
    NEXT_PUBLIC_CODEX_API_KEY: process.env.NEXT_PUBLIC_CODEX_API_KEY,
    NEXT_PUBLIC_BACKEND_API_KEY: process.env.NEXT_PUBLIC_BACKEND_API_KEY,
    NEXT_PUBLIC_ANALYTICS_URL: process.env.NEXT_PUBLIC_ANALYTICS_URL,
    NEXT_PUBLIC_WALLET_TRACKER_URL: process.env.NEXT_PUBLIC_WALLET_TRACKER_URL,
    NEXT_PUBLIC_WALLET_TRACKER_WS_URL: process.env.NEXT_PUBLIC_WALLET_TRACKER_WS_URL,
		NEXT_PUBLIC_SOLANA_RPC: process.env.NEXT_PUBLIC_SOLANA_RPC,
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
