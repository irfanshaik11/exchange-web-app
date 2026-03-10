import type { NextApiResponse } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

// Allowed image MIME types - only image types are permitted
// NOTE: SVG is allowed but guarded later to block obvious script tags
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/avif',
  'image/bmp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/ico',
];

export function isValidImageMimeType(contentType: string | null): boolean {
  if (!contentType) return false;
  const baseType = contentType.split(';')[0].trim().toLowerCase();
  if (
    baseType.startsWith('image/') ||
    baseType.startsWith('video/') ||
    baseType.startsWith('audio/') ||
    baseType === 'application/octet-stream'
  ) {
    return true;
  }
  return ALLOWED_IMAGE_TYPES.includes(baseType);
}

export function inferImageMimeType(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;

  const bytes = buffer.slice(0, 12);

  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // GIF: 47 49 46 38
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif';
  }

  // WebP: RIFF...WEBP
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp';
  }

  // BMP: 42 4D
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return 'image/bmp';
  }

  // SVG: XML-based vector images
  const textStart = buffer.slice(0, 256).toString('utf-8').trim().toLowerCase();
  if (textStart.startsWith('<svg') || textStart.startsWith('<?xml')) {
    return 'image/svg+xml';
  }

  return null;
}

export function isValidImageContent(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;

  const bytes = buffer.slice(0, 12);

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return true;

  // GIF: 47 49 46 38 (GIF8)
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return true;

  // WebP: RIFF...WEBP
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return true;

  // AVIF: ftyp box with 'avif' brand
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const ftypContent = buffer.slice(8, 20).toString('ascii');
    if (ftypContent.includes('avif')) return true;
  }

  // BMP: 42 4D
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return true;

  // ICO: 00 00 01 00 or 00 00 02 00
  if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00) return true;
  if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x02 && bytes[3] === 0x00) return true;

  // SVG detection with a minimal safety check
  if (buffer.length >= 20) {
    const textSample = buffer.slice(0, Math.min(buffer.length, 2048)).toString('utf-8').toLowerCase();
    if (textSample.includes('<svg')) {
      if (textSample.includes('<script')) return false;
      return true;
    }
  }

  return false;
}

export function setSecurityHeaders(res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

export function sendError(res: NextApiResponse, status: number, message: string) {
  setSecurityHeaders(res);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.status(status).send(message);
}

/**
 * Unwrap nested proxy URLs and fix common URL issues.
 * Returns a cleaned URL object.
 */
export function normalizeProxyUrl(url: string): URL {
  let parsed = new URL(url);

  // Unwrap nested proxy links (e.g., .../api/image-proxy?url=<actual>)
  const nestedProxyTarget = parsed.searchParams.get('url');
  const isKnownProxyHost =
    parsed.hostname.includes('image-proxy') ||
    parsed.hostname.includes('uxento.io') ||
    parsed.hostname.includes('solanatracker.io');
  if (nestedProxyTarget && (parsed.pathname.includes('image-proxy') || isKnownProxyHost)) {
    try {
      parsed = new URL(nestedProxyTarget);
    } catch {
      // keep original if nested target is invalid
    }
  }

  // Fix double-slash IPFS paths (e.g., /ipfs//<...>)
  if (parsed.pathname.startsWith('/ipfs//')) {
    try {
      parsed = new URL(parsed.toString().replace('/ipfs//', '/ipfs/'));
    } catch {
      // ignore if replacement creates invalid URL
    }
  }

  return parsed;
}

/**
 * Build candidate URLs for fetching, including IPFS multi-gateway fallback.
 */
export function buildFetchCandidates(parsed: URL): string[] {
  const ipfsMatch = parsed.pathname.match(/\/ipfs\/([^/?#]+)/i);
  const candidates: string[] = [];

  if (ipfsMatch && ipfsMatch[1]) {
    const cid = ipfsMatch[1];
    const original = parsed.toString();
    const httpsVersion = parsed.protocol === 'http:' ? original.replace(/^http:/i, 'https:') : original;
    const httpVersion = parsed.protocol === 'https:' ? original.replace(/^https:/i, 'http:') : original;
    if (httpsVersion && !candidates.includes(httpsVersion)) candidates.push(httpsVersion);
    if (!candidates.includes(original)) candidates.push(original);
    if (httpVersion && !candidates.includes(httpVersion)) candidates.push(httpVersion);

    const gateways = [
      'https://cloudflare-ipfs.com/ipfs/',
      'https://ipfs.io/ipfs/',
      'https://gateway.pinata.cloud/ipfs/',
      'https://nftstorage.link/ipfs/',
      'https://gateway.ipfs.io/ipfs/',
    ];
    for (const g of gateways) {
      const urlTry = g + cid;
      if (!candidates.includes(urlTry)) candidates.push(urlTry);
    }
  } else {
    const original = parsed.toString();
    const httpsVersion = parsed.protocol === 'http:' ? original.replace(/^http:/i, 'https:') : original;
    const httpVersion = parsed.protocol === 'https:' ? original.replace(/^https:/i, 'http:') : original;
    if (httpsVersion && !candidates.includes(httpsVersion)) candidates.push(httpsVersion);
    if (!candidates.includes(original)) candidates.push(original);
    if (httpVersion && !candidates.includes(httpVersion)) candidates.push(httpVersion);
  }

  return candidates;
}

/**
 * Fetch image from candidates in parallel. Returns { body, contentType } or throws.
 */
export async function fetchImageFromCandidates(
  candidates: string[]
): Promise<{ body: Buffer; contentType: string; status: number }> {
  let lastNonOk: { resp: Response; url: string } | null = null;

  const promises = candidates.map(async (tryUrl) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(tryUrl, {
      headers: { 'Accept': 'image/*,*/*;q=0.8', 'User-Agent': 'Interstate-ImageProxy/1.0' },
      signal: controller.signal,
      cache: 'force-cache',
      redirect: 'follow',
    });
    clearTimeout(t);
    if (response.ok) return response;
    lastNonOk = { resp: response, url: tryUrl };
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  });

  let upstream: Response | null = null;
  try {
    upstream = await Promise.any(promises);
  } catch {
    // all failed
  }

  if (!upstream) {
    if (lastNonOk) {
      const buf = Buffer.from(await lastNonOk.resp.arrayBuffer());
      const ct = lastNonOk.resp.headers.get('content-type') || 'application/octet-stream';
      return { body: buf, contentType: ct, status: lastNonOk.resp.status };
    }
    throw new Error('Failed to fetch image from all candidates');
  }

  const body = Buffer.from(await upstream.arrayBuffer());
  const ct = upstream.headers.get('content-type') || 'application/octet-stream';
  return { body, contentType: ct, status: 200 };
}

/**
 * If the upstream response is JSON metadata, try to extract and fetch the actual image URL.
 * Returns { body, contentType } if successful, null otherwise.
 */
export async function resolveJsonMetadataImage(
  body: Buffer,
  contentType: string
): Promise<{ body: Buffer; contentType: string } | null> {
  // Skip if body is too large or is clearly a binary image
  if (body.length >= 50000) return null;
  const isDefinitelyImage = contentType.startsWith('image/');
  if (isDefinitelyImage) return null;
  // Try JSON parse for any non-image content type (JSON metadata can arrive
  // as application/json, text/plain, application/octet-stream, etc.)

  try {
    const meta = JSON.parse(body.toString('utf-8'));
    const imageField = meta?.image || meta?.image_url || meta?.logo || meta?.icon
      || meta?.imageUri || meta?.img || meta?.thumbnail
      || meta?.properties?.image || meta?.properties?.image_url;
    const filesImage = Array.isArray(meta?.properties?.files) && meta.properties.files.length > 0
      ? (typeof meta.properties.files[0] === 'string' ? meta.properties.files[0] : meta.properties.files[0]?.uri)
      : null;
    const resolvedImageUrl = imageField || filesImage;

    if (resolvedImageUrl && typeof resolvedImageUrl === 'string' && resolvedImageUrl.startsWith('http')) {
      isDev && console.log(`[image proxy] JSON metadata detected, resolving to: ${resolvedImageUrl.substring(0, 80)}`);
      const imgController = new AbortController();
      const imgTimeout = setTimeout(() => imgController.abort(), 12000);
      const imgResponse = await fetch(resolvedImageUrl, {
        headers: { 'Accept': 'image/*,*/*;q=0.8', 'User-Agent': 'Interstate-ImageProxy/1.0' },
        signal: imgController.signal,
        redirect: 'follow',
      });
      clearTimeout(imgTimeout);

      if (imgResponse.ok) {
        const imgBody = Buffer.from(await imgResponse.arrayBuffer());
        const imgContentType = imgResponse.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || '';
        let finalType = imgContentType;
        if (!isValidImageMimeType(finalType)) {
          finalType = inferImageMimeType(imgBody) || 'application/octet-stream';
        }
        return { body: imgBody, contentType: finalType };
      }
    }
  } catch (e) {
    isDev && console.log('[image proxy] JSON auto-resolve failed, serving original:', (e as any)?.message);
  }

  return null;
}

/**
 * Determine final content type from header and body magic bytes.
 */
export function resolveFinalContentType(headerContentType: string, body: Buffer): string {
  let contentType = headerContentType.split(';')[0].trim().toLowerCase();

  if (!isValidImageMimeType(contentType)) {
    const inferredType = inferImageMimeType(body);
    if (inferredType) {
      contentType = inferredType;
    } else {
      contentType = contentType || 'application/octet-stream';
    }
  }

  return contentType.split(';')[0].trim() || 'application/octet-stream';
}
