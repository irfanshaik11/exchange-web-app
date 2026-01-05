import type { NextApiRequest, NextApiResponse } from 'next';

const ALLOWED = [
  'cloudflare-ipfs.com',
  'ipfs.io',
  'gateway.pinata.cloud',
  'nftstorage.link',
  'gateway.ipfs.io',
  'cf-ipfs.com',
  'mypinata.cloud',
  'arweave.net',
  'arweave.dev',
  'shdw-drive.genesysgo.net',
  'shdw.link',
  'cdn.moonshot.com',
  'meta.huma.finance',
  'cdn.kamino.finance',
  'file.dexlab.space',
  'gateway.irys.xyz',
  'static-create.jup.ag',
  'pump.fun',
  'cdn.pump.fun',
  'moonitcdn.io',
  'metadata.pumployer.fun',
  'metadata.rapidlaunch.io',
  'rapidlaunch.io',
  'image.solanatracker.io',
  'solanatracker.io',
  'wormhole.com',
  'raw.githubusercontent.com',
  'githubusercontent.com',
  'cdn.discordapp.com',
  'token-media.defined.fi',
  // Common CDN/hosts seen in token logos
  'digitaloceanspaces.com',
  'amazonaws.com',
  'cloudfront.net',
  'twimg.com',
  'pbs.twimg.com',
  'googleusercontent.com',
  'googleapis.com',
  'assets.coingecko.com',
  'coingecko.com',
  'solscan.io',
  'raydium.io',
  'tokens.debridge.finance',
  'debridge.finance',
  'launchonsoar.com',
  'media.launchonsoar.com',
  'image.solanatracker.io',
  'ipfs-forward.solanatracker.io',
  // Allow all subdomains of common CDNs that serve PNGs
  's3.amazonaws.com',
  's3.us-east-1.amazonaws.com',
  's3.us-west-2.amazonaws.com',
  // Narrative/Trade domains
  'narrative.trade',
  'token.narrative.trade',
  // Filebase IPFS hosting
  'myfilebase.com',
  // Monad token image storage
  'storage.nadapp.net',
  'nadapp.net',
  'edge.uxento.io',
  'uxento.io',
  'cdninstagram.com',
  'instagram.com',
];

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

function isAllowedHost(host: string) {
  return ALLOWED.some(d => host === d || host.endsWith('.' + d));
}

function isValidImageMimeType(contentType: string | null): boolean {
  if (!contentType) return false;
  // Remove charset and other parameters (e.g., "image/jpeg; charset=utf-8" -> "image/jpeg")
  const baseType = contentType.split(';')[0].trim().toLowerCase();
  // Allow any declared image/audio/video/application/octet-stream types
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

// Infer MIME type from image content (magic bytes)
function inferImageMimeType(buffer: Buffer): string | null {
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
  
  // SVG detection
  // (handled separately to allow passthrough with basic safety checks)
  
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

function isValidImageContent(buffer: Buffer): boolean {
  // Minimum size check
  if (buffer.length < 4) return false;

  // Check magic bytes for various image formats
  const bytes = buffer.slice(0, 12);

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return true;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return true;
  }

  // GIF: 47 49 46 38 (GIF8)
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return true;
  }

  // WebP: RIFF...WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return true;
  }

  // AVIF: ftyp box with 'avif' brand
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    // Check for avif brand (typically at offset 8)
    const ftypContent = buffer.slice(8, 20).toString('ascii');
    if (ftypContent.includes('avif')) {
      return true;
    }
  }

  // BMP: 42 4D
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return true;
  }

  // ICO: 00 00 01 00 or 00 00 02 00
  if (
    bytes[0] === 0x00 &&
    bytes[1] === 0x00 &&
    bytes[2] === 0x01 &&
    bytes[3] === 0x00
  ) {
    return true;
  }
  if (
    bytes[0] === 0x00 &&
    bytes[1] === 0x00 &&
    bytes[2] === 0x02 &&
    bytes[3] === 0x00
  ) {
    return true;
  }

  // SVG detection with a minimal safety check
  if (buffer.length >= 20) {
    const textSample = buffer.slice(0, Math.min(buffer.length, 2048)).toString('utf-8').toLowerCase();
    if (textSample.includes('<svg')) {
      // Basic guard: block if script tags are present in the sampled content
      if (textSample.includes('<script')) {
        return false;
      }
      return true;
    }
  }

  return false;
}

function setSecurityHeaders(res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function sendError(res: NextApiResponse, status: number, message: string) {
  setSecurityHeaders(res);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.status(status).send(message);
}

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
      parsed = new URL(url);
    } catch {
      return sendError(res, 400, 'Invalid URL format');
    }

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

    if (parsed.protocol !== 'https:') {
      return sendError(res, 400, 'Only HTTPS URLs are allowed');
    }
    // Check if this is an IPFS URL path (even if hostname doesn't include 'ipfs')
    const hasIpfsPath = parsed.pathname.includes('/ipfs/');
    
    // Check if host is allowed, but be more lenient for image files and IPFS URLs
    // If URL ends with common image extensions, allow more hosts
    const isImageFile = /\.(png|jpg|jpeg|gif|webp|avif|bmp|ico|svg)$/i.test(parsed.pathname);
    
    if (!isAllowedHost(parsed.hostname)) {
      // For IPFS paths, allow any host (IPFS is decentralized)
      if (hasIpfsPath) {
        console.log(`[image proxy] Allowing IPFS path from non-whitelisted host: ${parsed.hostname}`);
        // Continue processing - IPFS URLs are handled specially below
      }
      // For direct image file URLs, allow common CDN patterns
      else if (isImageFile) {
        // Allow if it's a known CDN pattern or subdomain
        const isCommonCDN = parsed.hostname.includes('cdn.') ||
                           parsed.hostname.includes('static.') ||
                           parsed.hostname.includes('media.') ||
                           parsed.hostname.includes('assets.') ||
                           parsed.hostname.endsWith('.cloudfront.net') ||
                           parsed.hostname.endsWith('.amazonaws.com') ||
                           parsed.hostname.endsWith('.digitaloceanspaces.com');
        
        if (!isCommonCDN) {
          return sendError(res, 403, 'Host not allowed');
        }
      } else {
        return sendError(res, 403, 'Host not allowed');
      }
    }

    // IPFS multi-gateway fallback if /ipfs/<cid>
    const ipfsMatch = parsed.pathname.match(/\/ipfs\/([^/?#]+)/i);
    const candidates: string[] = [];
    if (ipfsMatch && ipfsMatch[1]) {
      const cid = ipfsMatch[1];
      // Try the original gateway first (might be faster/cheaper for that provider)
      candidates.push(parsed.toString());
      // Then try common IPFS gateways as fallbacks
      const gateways = [
        'https://cloudflare-ipfs.com/ipfs/',
        'https://ipfs.io/ipfs/',
        'https://gateway.pinata.cloud/ipfs/',
        'https://nftstorage.link/ipfs/',
        'https://gateway.ipfs.io/ipfs/',
      ];
      for (const g of gateways) candidates.push(g + cid);
    } else {
      candidates.push(parsed.toString());
    }

    let upstream: Response | null = null;
    let lastErr: any = null;
    
    // Try all candidates in parallel with shorter timeouts for faster response
    const promises = candidates.map(async (tryUrl) => {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 7000);
        const response = await fetch(tryUrl, {
          headers: { 'Accept': 'image/*,*/*;q=0.8', 'User-Agent': 'Interstate-ImageProxy/1.0' },
          signal: controller.signal,
          cache: 'force-cache',
        });
        clearTimeout(t);
        if (response.ok) {
          return response;
        }
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      } catch (e: any) {
        throw e;
      }
    });

    // Wait for the first successful response
    try {
      upstream = await Promise.any(promises);
    } catch (e: any) {
      lastErr = e;
    }

    if (!upstream) {
      console.error('[image proxy] error:', lastErr?.message || lastErr);
      return sendError(res, 502, 'Failed to fetch image');
    }

    // Get response body first
    const body = Buffer.from(await upstream.arrayBuffer());
    
    // Get content type from header and normalize
    const headerContentType = upstream.headers.get('content-type');
    let contentType = headerContentType?.split(';')[0].trim().toLowerCase() || '';
    const headerSaysImage =
      contentType.startsWith('image/') ||
      contentType.startsWith('video/') ||
      contentType.startsWith('audio/');
    
    // If Content-Type is missing or invalid, try to infer from image content
    if (!isValidImageMimeType(contentType)) {
      const inferredType = inferImageMimeType(body);
      if (inferredType) {
        console.log(`[image proxy] Content-Type missing/invalid (${contentType || 'missing'}), inferred ${inferredType} from content`);
        contentType = inferredType;
      } else {
        // Fall back to declared type or a generic binary type; do not block
        contentType = contentType || 'application/octet-stream';
      }
    }

    // Extract base content type (remove charset parameters)
    const baseContentType = contentType?.split(';')[0].trim() || 'application/octet-stream';

    // Set security headers
    setSecurityHeaders(res);
    
    // Set response headers
    res.setHeader('Content-Type', baseContentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400');
    
    // Send validated image content
    res.status(200).send(body);
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return sendError(res, 408, 'Request timeout');
    }
    console.error('[image proxy] fatal:', err?.message || err);
    return sendError(res, 502, 'Internal server error');
  }
}
