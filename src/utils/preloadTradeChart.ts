import { prefetchViaWS } from "~/utils/ohlcPrefetchManager";
import { prefetchOHLC } from "~/hooks/useBackgroundOHLCPreload";

import { preloadImage } from "~/utils/imagePreloader";
import { computeHashImageUrl } from "~/utils/imageHash";
import type { NextRouter } from "next/router";

// Module-level dedup so we don't fire the supply RPC twice for the same mint
// in quick succession. The browser HTTP cache also helps, but a dedupe Set
// short-circuits before the network call.
const supplyPrefetchedMints = new Set<string>();

/**
 * Fire /v1/supply/{mint} in the background. Result lands in the browser HTTP
 * cache (or in-flight request dedupe), so `useTokenSupply` on the trade page
 * gets a near-instant resolve instead of a fresh 200-500ms RPC.
 *
 * Required because SearchModal's click-time preload gives the OHLC WS a
 * ~150ms head start over the trade-page's supply fetch, causing the chart's
 * first bars to render at DEFAULT_SUPPLY before the real supply is known.
 * Without this, switching to MC mode showed a vertical disconnect for
 * non-1B-supply tokens (Jupiter at 6.86B was the clearest case).
 */
function prefetchSupply(mint: string, chain: "sol" | "monad"): void {
  if (chain === "monad") return; // Monad path doesn't use /v1/supply
  if (!mint || supplyPrefetchedMints.has(mint)) return;
  supplyPrefetchedMints.add(mint);
  const base = process.env.NEXT_PUBLIC_GO_SERVICE_URL || "";
  if (!base) return;
  // Fire-and-forget. If it fails the trade page falls back to a fresh fetch.
  fetch(`${base}/v1/supply/${mint}`, { cache: "default" }).catch(() => {
    // Don't pin a failure into the dedup Set forever — let the trade page retry
    supplyPrefetchedMints.delete(mint);
  });
}

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
 * Shared 6-step hover preload pipeline extracted from PulseTable.
 *
 * 1. prefetchViaWS (immediate, has internal 150ms debounce)
 * 2. router.prefetch (immediate — must match exact tradeUrl for cache hit)
 * 3. prefetchOHLC via HTTP (immediate — parallel fast path with WS)
 * 4. localStorage metadata cache (deferred via requestIdleCallback)
 * 5. preloadImage — pre-decode token avatar into imageObjectCache (deferred)
 * 6. prefetch creator address for chart dev markers (deferred)
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

  // Step 1.5: Supply prefetch — fires in parallel with WS prefetch so that by
  // the time the trade page mounts and useTokenSupply runs, the /v1/supply
  // response is already cached. Without this, the WS snapshot arrives BEFORE
  // supply resolves and the chart renders bars at DEFAULT_SUPPLY (vertical
  // MC disconnect for non-1B-supply tokens like JUP @ 6.86B).
  if (!skipWs) {
    prefetchSupply(mint, chain);
  }

  // Step 2: Route prefetch — immediate (critical for cache-hit on router.push)
  if (options.router) {
    const url =
      options.tradeUrl ??
      (chain === "monad"
        ? `/trade/monad/${tokenInfo.pairAddress || mint}`
        : `/trade/${mint}`);
    options.router.prefetch(url);
  }

  // Step 3: HTTP OHLC prefetch — immediate (parallel fast path with WS)
  prefetchOHLC(mint, chain);

  // Steps 4-6: deferred to idle time (non-critical)
  const rIC =
    typeof requestIdleCallback === "function"
      ? requestIdleCallback
      : (cb: () => void) => setTimeout(cb, 0);

  (rIC as (cb: () => void, opts?: { timeout: number }) => void)(
    () => {
      // Step 4: Cache token metadata in localStorage
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

      // Step 5: Preload token avatar image
      if (tokenInfo.image) {
        const imageUrl = computeHashImageUrl(tokenInfo.image);
        if (imageUrl) preloadImage(imageUrl);
      }

      // Step 6: Prefetch creator address for chart dev markers
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
