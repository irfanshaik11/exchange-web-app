// src/hooks/useHyperliquidTokenImage.ts
// React hook for Hyperliquid token images with async DexScreener fallback.
// Returns image URL synchronously from cache, resolves via DexScreener if not cached.

import { useState, useEffect } from "react";
import {
  getHyperliquidTokenImage,
  resolveHyperliquidTokenImage,
} from "../utils/hyperliquidTokenImages";

/**
 * Get token image for a Hyperliquid perpetual coin.
 * Returns the cached image immediately, then resolves via DexScreener if needed.
 */
export function useHyperliquidTokenImage(coin: string | undefined): string | null {
  const [imageUrl, setImageUrl] = useState<string | null>(() =>
    coin ? getHyperliquidTokenImage(coin) : null
  );

  useEffect(() => {
    if (!coin) {
      setImageUrl(null);
      return;
    }

    // Try sync first
    const cached = getHyperliquidTokenImage(coin);
    if (cached) {
      setImageUrl(cached);
      return;
    }

    // Async resolve via DexScreener
    let cancelled = false;
    resolveHyperliquidTokenImage(coin).then((url) => {
      if (!cancelled) setImageUrl(url);
    });

    return () => {
      cancelled = true;
    };
  }, [coin]);

  return imageUrl;
}
