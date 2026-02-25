import { prefetchViaWS } from "~/utils/ohlcPrefetchManager";
import { prefetchOHLC } from "~/hooks/useBackgroundOHLCPreload";
import { prefetchTokenTrades } from "~/utils/rollingTradeCache";
import { preloadImage } from "~/utils/imagePreloader";
import { computeHashImageUrl } from "~/utils/imageHash";
import type { NextRouter } from "next/router";

/**
 * Normalized token info for preloading — each caller maps its own shape to this.
 */
export interface PreloadTokenInfo {
  mint: string;
  pairAddress?: string;
  chain?: "sol" | "monad";
  name?: string;
  symbol?: string;
  priceUsd?: number;
  marketCapUsd?: number;
  image?: string;
  launchpadProtocol?: string;
  createdAt?: string;
}

export interface PreloadOptions {
  /** Next.js router for route prefetch (omit to skip) */
  router?: NextRouter;
  /** Override the computed trade URL */
  tradeUrl?: string;
  /** Skip WS prefetch (auto-true for monad) */
  skipWs?: boolean;
}

/** Module-level dedup: don't re-fire the full pipeline for the same mint */
let lastPreloadedMint = "";

/** Exported cache for creator addresses prefetched during hover */
export const creatorAddressCache = new Map<string, string | null>();

/**
 * Shared 7-step hover preload pipeline extracted from PulseTable.
 *
 * 1. prefetchViaWS (immediate, has internal 150ms debounce)
 * 2. router.prefetch (deferred via requestIdleCallback)
 * 3. localStorage metadata cache (deferred)
 * 4. prefetchOHLC via HTTP (deferred)
 * 5. prefetchTokenTrades (deferred)
 * 6. preloadImage — pre-decode token avatar into imageObjectCache (deferred)
 * 7. prefetch creator address for chart dev markers (deferred)
 */
export function preloadTradeChart(
  tokenInfo: PreloadTokenInfo,
  options: PreloadOptions = {}
): void {
  const { mint, chain = "sol" } = tokenInfo;
  if (!mint || mint === lastPreloadedMint) return;
  lastPreloadedMint = mint;

  const skipWs = options.skipWs ?? chain === "monad";

  // Step 1: WS prefetch — immediate (Solana only)
  if (!skipWs) {
    prefetchViaWS(mint);
  }

  // Steps 2-5: deferred to idle time
  const rIC =
    typeof requestIdleCallback === "function"
      ? requestIdleCallback
      : (cb: () => void) => setTimeout(cb, 0);

  (rIC as (cb: () => void, opts?: { timeout: number }) => void)(
    () => {
      // Step 2: Route prefetch
      if (options.router) {
        const url =
          options.tradeUrl ??
          (chain === "monad"
            ? `/trade/monad/${tokenInfo.pairAddress || mint}`
            : `/trade/${tokenInfo.pairAddress || mint}`);
        options.router.prefetch(url);
      }

      // Step 3: Cache token metadata in localStorage
      try {
        const tokenMetadata = {
          name: tokenInfo.name || "",
          symbol: tokenInfo.symbol || "",
          price_usd: tokenInfo.priceUsd || 0,
          market_cap_usd: tokenInfo.marketCapUsd || 0,
          image: tokenInfo.image || "",
          mint,
          pair_address: tokenInfo.pairAddress || "",
          launchpad_protocol: tokenInfo.launchpadProtocol || "",
          timestamp: Date.now(),
        };
        localStorage.setItem(
          `token_metadata_${mint}`,
          JSON.stringify(tokenMetadata)
        );
      } catch {
        // Silently fail — non-critical
      }

      // Step 4: HTTP OHLC prefetch
      prefetchOHLC(mint, chain);

      // Step 5: Trade data prefetch
      prefetchTokenTrades({
        mint,
        pair_address: tokenInfo.pairAddress || "",
      });

      // Step 6: Preload token avatar image
      if (tokenInfo.image) {
        const imageUrl = computeHashImageUrl(tokenInfo.image);
        if (imageUrl) preloadImage(imageUrl);
      }

      // Step 7: Prefetch creator address for chart dev markers
      if (!creatorAddressCache.has(mint)) {
        fetch(`${process.env.NEXT_PUBLIC_GO_SERVICE_URL}/v1/tokens/dev?tokenAddress=${mint}&limit=1`)
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            const addr = data?.filterTokens?.results?.[0]?.token?.creatorAddress || null;
            creatorAddressCache.set(mint, addr);
          })
          .catch(() => { creatorAddressCache.set(mint, null); });
      }
    },
    { timeout: 500 }
  );
}
