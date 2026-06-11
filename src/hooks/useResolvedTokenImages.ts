import { useEffect, useMemo, useState } from "react";

import {
  getCachedScanImage,
  resolveScanImage,
} from "~/utils/scanImageResolver";

export interface TokenImageItem {
  mint: string;
  /** Raw indexer image URL hint, if the caller already has metadata. */
  raw?: string | null;
  /** On-chain metadata URI hint, if available. */
  uri?: string | null;
}

/**
 * Resolve token avatars for a set of mints through the shared scanImageResolver
 * pipeline (direct URL → metadata URI → server-side DAS heal → registry cascade),
 * with the same localStorage forever-cache. Returns a mint→proxiedURL map that
 * fills in progressively.
 *
 * This is the canonical way to get token images on the trade-feed surfaces
 * (Live Trades, Monitor): trade objects carry only mint/symbol, and the raw
 * image_url from /v1/token is frequently a speculative CDN URL that 403s or an
 * unresolved IPFS/metadata link — resolveScanImage handles all of that and
 * caches the result so a mint is resolved at most once per session per browser
 * (and healed into the DB server-side for everyone).
 */
export function useResolvedTokenImages(
  items: TokenImageItem[],
): Record<string, string> {
  const [images, setImages] = useState<Record<string, string>>({});

  // Stable key: re-run only when the set of mints changes, not every render.
  const key = useMemo(
    () =>
      items
        .map((i) => i.mint)
        .filter(Boolean)
        .sort()
        .join(","),
    [items],
  );

  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;

    const fromCache: Record<string, string> = {};
    const work: TokenImageItem[] = [];
    const seen = new Set<string>();
    for (const it of items) {
      if (!it.mint || seen.has(it.mint)) continue;
      seen.add(it.mint);
      const cached = getCachedScanImage(it.mint);
      if (typeof cached === "string") {
        fromCache[it.mint] = cached;
      } else if (cached === undefined) {
        work.push(it);
      }
    }
    if (Object.keys(fromCache).length > 0) {
      setImages((prev) => ({ ...prev, ...fromCache }));
    }
    if (work.length === 0) return;

    void (async () => {
      // Batch so each commit updates many rows at once (avoids a render storm).
      for (let i = 0; i < work.length && !cancelled; i += 40) {
        const batch = work.slice(i, i + 40);
        const updates: Record<string, string> = {};
        await Promise.allSettled(
          batch.map(async (it) => {
            const url = await resolveScanImage(
              it.mint,
              it.raw ?? null,
              it.uri ?? null,
            );
            if (url) updates[it.mint] = url;
          }),
        );
        if (!cancelled && Object.keys(updates).length > 0) {
          setImages((prev) => ({ ...prev, ...updates }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return images;
}
