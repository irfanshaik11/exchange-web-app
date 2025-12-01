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
  // Allow all subdomains of common CDNs that serve PNGs
  's3.amazonaws.com',
  's3.us-east-1.amazonaws.com',
  's3.us-west-2.amazonaws.com',
  // Narrative/Trade domains
  'narrative.trade',
  'token.narrative.trade',
  // Filebase IPFS hosting
  'myfilebase.com',
];

// Allowed image MIME types - only image types are permitted
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
  
  // SVG: Check if it starts with <svg or <?xml
  if (buffer.length >= 100) {
    const textStart = buffer.slice(0, 100).toString('utf-8').trim();
    if ((textStart.startsWith('<svg') || textStart.startsWith('<?xml')) &&
        textStart.toLowerCase().includes('<svg')) {
      return 'image/svg+xml';
    }
  }
  
  // BMP: 42 4D
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return 'image/bmp';
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

  // SVG: Check if it starts with <svg or <?xml
  if (buffer.length >= 100) {
    const textStart = buffer.slice(0, 100).toString('utf-8').trim();
    if (textStart.startsWith('<svg') || textStart.startsWith('<?xml')) {
      // Additional validation: should contain svg tag
      if (textStart.toLowerCase().includes('<svg')) {
        return true;
      }
    }
  }

  return false;
}

function setSecurityHeaders(res: NextApiResponse) {
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
    if (parsed.protocol !== 'https:') {
      return sendError(res, 400, 'Only HTTPS URLs are allowed');
    }
    // Check if this is an IPFS URL path (even if hostname doesn't include 'ipfs')
    const hasIpfsPath = parsed.pathname.includes('/ipfs/');
    
    // Check if host is allowed, but be more lenient for image files and IPFS URLs
    // If URL ends with .png/.jpg/.jpeg/.gif/.webp, allow more hosts
    const isImageFile = /\.(png|jpg|jpeg|gif|webp|svg|avif|bmp|ico)$/i.test(parsed.pathname);
    
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
        const t = setTimeout(() => controller.abort(), 2000); // Reduced from 7s to 2s
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
    
    // Check if this is an IPFS URL - be VERY lenient for IPFS
    // Check both hostname (ipfs gateways) and path (/ipfs/...)
    const isIpfsUrl = parsed.hostname.includes('ipfs') || parsed.pathname.includes('/ipfs/');
    
    // For IPFS URLs, completely bypass strict validation
    // Just try to infer the type and pass through if we got content
    if (isIpfsUrl) {
      if (body.length === 0) {
        console.error('[image proxy] IPFS URL returned empty content');
        return sendError(res, 502, 'Empty content from IPFS');
      }
      
      // Try to infer the image type from content
      let contentType = inferImageMimeType(body) || 'image/png'; // Default to PNG for IPFS
      
      console.log(`[image proxy] IPFS URL - allowing through (${body.length} bytes, type: ${contentType})`);
      
      // Set security headers
      setSecurityHeaders(res);
      
      // Set response headers
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400');
      
      // Send content - trust IPFS to serve valid images
      res.status(200).send(body);
      return;
    }
    
    // For non-IPFS URLs, do strict validation
    // Validate content is actually an image using magic bytes
    if (!isValidImageContent(body)) {
      console.error('[image proxy] invalid image content detected');
      return sendError(res, 415, 'Invalid image content');
    }

    // Get content type from header
    let contentType = upstream.headers.get('content-type');
    
    // If Content-Type is missing or invalid, try to infer from image content
    if (!isValidImageMimeType(contentType)) {
      const inferredType = inferImageMimeType(body);
      if (inferredType) {
        console.log(`[image proxy] Content-Type missing/invalid (${contentType || 'missing'}), inferred ${inferredType} from content`);
        contentType = inferredType;
      } else {
        console.error('[image proxy] invalid content type:', contentType);
        return sendError(res, 415, 'Unsupported media type');
      }
    }

    // Extract base content type (remove charset parameters)
    const baseContentType = contentType?.split(';')[0].trim() || 'image/png';

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
