import type { NextApiRequest, NextApiResponse } from "next";
import {
  ALLOWED_PROXY_WIDTHS,
  base64urlDecode,
  computeMd5,
  normalizeForHash,
} from "~/utils/imageHash";
import {
  setSecurityHeaders,
  sendError,
  normalizeProxyUrl,
  buildFetchCandidates,
  fetchImageFromCandidates,
  resolveJsonMetadataImage,
  resolveFinalContentType,
} from "~/utils/imageProxyHelpers";

// Pin to Node.js runtime — sharp is a native addon and won't run on Edge.
export const config = { api: { responseLimit: false }, runtime: "nodejs" };

// ─── In-Memory Byte Cache ────────────────────────────────────────────────────
// Avoids re-fetching hot images from upstream. Small footprint, short TTL.
// Cache key is `${hash}-${width}` so different resize widths don't collide.
const MAX_BYTE_CACHE = 500;
const BYTE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const byteCache = new Map<
  string,
  { buffer: Buffer; contentType: string; ts: number }
>();

function getCachedImage(
  key: string,
): { buffer: Buffer; contentType: string } | null {
  const entry = byteCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > BYTE_CACHE_TTL_MS) {
    byteCache.delete(key);
    return null;
  }
  // LRU touch: delete + re-insert
  byteCache.delete(key);
  byteCache.set(key, { ...entry, ts: Date.now() });
  return { buffer: entry.buffer, contentType: entry.contentType };
}

function setCachedImage(key: string, buffer: Buffer, contentType: string) {
  // Evict oldest if at limit
  if (byteCache.size >= MAX_BYTE_CACHE) {
    const oldest = byteCache.keys().next().value;
    if (oldest) byteCache.delete(oldest);
  }
  byteCache.set(key, { buffer, contentType, ts: Date.now() });
}

// ─── Width Handling ──────────────────────────────────────────────────────────
// `ALLOWED_PROXY_WIDTHS` is the single source of truth (defined in
// src/utils/imageHash.ts and reused on the client). Limiting the set bounds
// cache size and prevents an attacker from forcing arbitrary sharp pipelines.
//
// Defense-in-depth note: parseInt is permissive (accepts "64x", "64 ", etc),
// but the allowlist .includes() check below is the real enforcement gate. Do
// NOT remove that check on the assumption parseInt already rejects bad input.
const DEFAULT_WIDTH = 64;

function parseWidth(raw: unknown): number {
  const n = typeof raw === "string" ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_WIDTH;
  return (ALLOWED_PROXY_WIDTHS as readonly number[]).includes(n)
    ? n
    : DEFAULT_WIDTH;
}

// ─── Format Detection ────────────────────────────────────────────────────────
// We skip resize for SVG (sharp's SVG support depends on librsvg being present
// on the runtime, which we can't guarantee on Vercel) and for any GIF (resizing
// would either strip animation or require an animated WebP encode that's
// expensive — at avatar sizes the size win isn't worth it).
function shouldSkipResize(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return ct.includes("svg") || ct.includes("gif");
}

// ─── Sharp Resize (Lazy-Loaded) ──────────────────────────────────────────────
// Lazy-import keeps sharp out of any shared bundle and lets serverless function
// cold-starts skip the native addon load when the byteCache hits.
async function resizeToWebp(
  buffer: Buffer,
  width: number,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const sharp = (await import("sharp")).default;
    const out = await sharp(buffer, { failOn: "none" })
      .rotate() // honor EXIF orientation
      .resize({ width, withoutEnlargement: true, fit: "cover" })
      .webp({ quality: 78, effort: 4 })
      .toBuffer();
    return { buffer: out, contentType: "image/webp" };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[img proxy] sharp resize failed, serving original:", msg);
    return null;
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method === "OPTIONS") {
      setSecurityHeaders(res);
      return res.status(204).end();
    }

    const hash = String(req.query.hash || "");
    const encodedUrl = String(req.query.s || "");
    const width = parseWidth(req.query.w);

    if (!hash || !encodedUrl) {
      return sendError(res, 400, "Missing hash or s parameter");
    }

    // Decode the original URL from base64url
    let originalUrl: string;
    try {
      originalUrl = base64urlDecode(encodedUrl);
    } catch {
      return sendError(res, 400, "Invalid s parameter encoding");
    }

    // Verify hash matches (prevents cache poisoning).
    // The hash covers only the upstream URL, NOT the width — so the same hash
    // is valid across all allowed widths. `w` is a server-side directive.
    const normalized = normalizeForHash(originalUrl);
    const expectedHash = computeMd5(normalized);
    if (hash !== expectedHash) {
      return sendError(res, 403, "Hash mismatch");
    }

    // Cache key includes width so different sizes are stored separately.
    const cacheKey = `${hash}-${width}`;

    // Check in-memory byte cache
    const cached = getCachedImage(cacheKey);
    if (cached) {
      setSecurityHeaders(res);
      res.setHeader("Content-Type", cached.contentType);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.status(200).send(cached.buffer);
    }

    // Normalize and build fetch candidates
    let parsed: URL;
    try {
      parsed = normalizeProxyUrl(originalUrl);
    } catch {
      return sendError(res, 400, "Invalid image URL");
    }

    const candidates = buildFetchCandidates(parsed);

    let result: { body: Buffer; contentType: string; status: number };
    try {
      result = await fetchImageFromCandidates(candidates);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[img proxy] error:", msg);
      return sendError(res, 502, "Failed to fetch image");
    }

    // Non-OK upstream: short-cache the error so browser retries soon when the
    // CDN/IPFS gateway eventually warms (was 60 — too long for new tokens).
    if (result.status !== 200) {
      setSecurityHeaders(res);
      res.setHeader("Content-Type", result.contentType);
      res.setHeader("Cache-Control", "public, max-age=10");
      return res.status(result.status).send(result.body);
    }

    // Check if response is JSON metadata pointing to an actual image
    const headerContentType = result.contentType
      .split(";")[0]
      .trim()
      .toLowerCase();
    const metadataResult = await resolveJsonMetadataImage(
      result.body,
      headerContentType,
    );

    let finalBody: Buffer;
    let finalContentType: string;

    if (metadataResult) {
      finalBody = metadataResult.body;
      finalContentType = metadataResult.contentType;
    } else {
      finalBody = result.body;
      finalContentType = resolveFinalContentType(
        result.contentType,
        result.body,
      );
    }

    // Resize + transcode to WebP unless format is unsuitable (SVG/GIF).
    // On any sharp failure we fall through to the original bytes.
    if (!shouldSkipResize(finalContentType)) {
      const resized = await resizeToWebp(finalBody, width);
      if (resized) {
        finalBody = resized.buffer;
        finalContentType = resized.contentType;
      }
    }

    // Store in byte cache
    setCachedImage(cacheKey, finalBody, finalContentType);

    // Serve with immutable headers — browser will never ask again
    setSecurityHeaders(res);
    res.setHeader("Content-Type", finalContentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.status(200).send(finalBody);
  } catch (err: unknown) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    if (isAbort) {
      return sendError(res, 408, "Request timeout");
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[img proxy] fatal:", msg);
    return sendError(res, 502, "Internal server error");
  }
}
