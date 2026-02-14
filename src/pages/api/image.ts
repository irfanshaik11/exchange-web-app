import type { NextApiRequest, NextApiResponse } from 'next';
import {
  isValidImageMimeType,
  inferImageMimeType,
  setSecurityHeaders,
  sendError,
  normalizeProxyUrl,
  buildFetchCandidates,
  fetchImageFromCandidates,
  resolveJsonMetadataImage,
  resolveFinalContentType,
} from '~/utils/imageProxyHelpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'OPTIONS') {
      setSecurityHeaders(res);
      return res.status(204).end();
    }

    const url = String(req.query.url || '');
    if (!url) {
      return sendError(res, 400, 'Missing url parameter');
    }

    let parsed: URL;
    try {
      parsed = normalizeProxyUrl(url);
    } catch {
      return sendError(res, 400, 'Invalid URL format');
    }

    const candidates = buildFetchCandidates(parsed);

    let result: { body: Buffer; contentType: string; status: number };
    try {
      result = await fetchImageFromCandidates(candidates);
    } catch (e: any) {
      console.error('[image proxy] error:', e?.message || e);
      return sendError(res, 502, 'Failed to fetch image');
    }

    // Non-OK upstream: forward the error
    if (result.status !== 200) {
      setSecurityHeaders(res);
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
      return res.status(result.status).send(result.body);
    }

    // Check if response is JSON metadata pointing to an actual image
    const headerContentType = result.contentType.split(';')[0].trim().toLowerCase();
    const metadataResult = await resolveJsonMetadataImage(result.body, headerContentType);
    if (metadataResult) {
      setSecurityHeaders(res);
      res.setHeader('Content-Type', metadataResult.contentType);
      res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400');
      return res.status(200).send(metadataResult.body);
    }

    // Resolve final content type (header + magic bytes)
    const finalContentType = resolveFinalContentType(result.contentType, result.body);

    setSecurityHeaders(res);
    res.setHeader('Content-Type', finalContentType);
    res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400');
    res.status(200).send(result.body);
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return sendError(res, 408, 'Request timeout');
    }
    console.error('[image proxy] fatal:', err?.message || err);
    return sendError(res, 502, 'Internal server error');
  }
}
