import type { NextApiRequest, NextApiResponse } from 'next';
import { base64urlDecode, computeMd5, normalizeForHash } from '~/utils/imageHash';
import {
  setSecurityHeaders,
  sendError,
  normalizeProxyUrl,
  buildFetchCandidates,
  fetchImageFromCandidates,
  resolveJsonMetadataImage,
  resolveFinalContentType,
} from '~/utils/imageProxyHelpers';

// ─── In-Memory Byte Cache ────────────────────────────────────────────────────
// Avoids re-fetching hot images from upstream. Small footprint, short TTL.
const MAX_BYTE_CACHE = 200;
const BYTE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const byteCache = new Map<string, { buffer: Buffer; contentType: string; ts: number }>();

function getCachedImage(hash: string): { buffer: Buffer; contentType: string } | null {
  const entry = byteCache.get(hash);
  if (!entry) return null;
  if (Date.now() - entry.ts > BYTE_CACHE_TTL_MS) {
    byteCache.delete(hash);
    return null;
  }
  // LRU touch: delete + re-insert
  byteCache.delete(hash);
  byteCache.set(hash, { ...entry, ts: Date.now() });
  return { buffer: entry.buffer, contentType: entry.contentType };
}

function setCachedImage(hash: string, buffer: Buffer, contentType: string) {
  // Evict oldest if at limit
  if (byteCache.size >= MAX_BYTE_CACHE) {
    const oldest = byteCache.keys().next().value;
    if (oldest) byteCache.delete(oldest);
  }
  byteCache.set(hash, { buffer, contentType, ts: Date.now() });
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'OPTIONS') {
      setSecurityHeaders(res);
      return res.status(204).end();
    }

    const hash = String(req.query.hash || '');
    const encodedUrl = String(req.query.s || '');

    if (!hash || !encodedUrl) {
      return sendError(res, 400, 'Missing hash or s parameter');
    }

    // Decode the original URL from base64url
    let originalUrl: string;
    try {
      originalUrl = base64urlDecode(encodedUrl);
    } catch {
      return sendError(res, 400, 'Invalid s parameter encoding');
    }

    // Verify hash matches (prevents cache poisoning)
    const normalized = normalizeForHash(originalUrl);
    const expectedHash = computeMd5(normalized);
    if (hash !== expectedHash) {
      return sendError(res, 403, 'Hash mismatch');
    }

    // Check in-memory byte cache
    const cached = getCachedImage(hash);
    if (cached) {
      setSecurityHeaders(res);
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.status(200).send(cached.buffer);
    }

    // Normalize and build fetch candidates
    let parsed: URL;
    try {
      parsed = normalizeProxyUrl(originalUrl);
    } catch {
      return sendError(res, 400, 'Invalid image URL');
    }

    const candidates = buildFetchCandidates(parsed);

    let result: { body: Buffer; contentType: string; status: number };
    try {
      result = await fetchImageFromCandidates(candidates);
    } catch (e: any) {
      console.error('[img proxy] error:', e?.message || e);
      return sendError(res, 502, 'Failed to fetch image');
    }

    // Non-OK upstream: short-cache the error so browser retries later
    if (result.status !== 200) {
      setSecurityHeaders(res);
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.status(result.status).send(result.body);
    }

    // Check if response is JSON metadata pointing to an actual image
    const headerContentType = result.contentType.split(';')[0].trim().toLowerCase();
    const metadataResult = await resolveJsonMetadataImage(result.body, headerContentType);

    let finalBody: Buffer;
    let finalContentType: string;

    if (metadataResult) {
      finalBody = metadataResult.body;
      finalContentType = metadataResult.contentType;
    } else {
      finalBody = result.body;
      finalContentType = resolveFinalContentType(result.contentType, result.body);
    }

    // Store in byte cache
    setCachedImage(hash, finalBody, finalContentType);

    // Serve with immutable headers — browser will never ask again
    setSecurityHeaders(res);
    res.setHeader('Content-Type', finalContentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.status(200).send(finalBody);
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return sendError(res, 408, 'Request timeout');
    }
    console.error('[img proxy] fatal:', err?.message || err);
    return sendError(res, 502, 'Internal server error');
  }
}
