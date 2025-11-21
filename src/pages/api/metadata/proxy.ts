import type { NextApiRequest, NextApiResponse } from 'next';

const ALLOWED = [
  'arweave.net',
  'arweave.dev',
  'ipfs.io',
  'gateway.pinata.cloud',
  'cloudflare-ipfs.com',
  'cf-ipfs.com',
  'mypinata.cloud',
  'nftstorage.link',
  'infura-ipfs.io',
  'ipfs.infura.io',
  'gateway.ipfs.io',
  'shdw-drive.genesysgo.net',
  'shdw.link',
  'cdn.moonshot.com',
  'meta.huma.finance',
  'cdn.kamino.finance',
  'file.dexlab.space',
  'pump.fun',
  'cdn.pump.fun',
  'moonitcdn.io',
  'metadata.pumployer.fun',
  'gateway.irys.xyz',
  'irys.xyz',
  'static-create.jup.ag',
  'static.jup.ag',
  'chintai.io',
  // Add broader CDNs used for hosting metadata
  'digitaloceanspaces.com',
  'amazonaws.com',
  'cloudfront.net',
  'googleusercontent.com',
  'googleapis.com',
  'githubusercontent.com',
];

// Allowed content types - only JSON is permitted for metadata
const ALLOWED_CONTENT_TYPES = [
  'application/json',
  'application/json; charset=utf-8',
  'application/json;charset=utf-8',
  'application/json; charset=UTF-8',
  'application/json;charset=UTF-8',
];

// Maximum metadata size (5MB) - prevent DoS attacks
const MAX_METADATA_SIZE = 5 * 1024 * 1024; // 5MB

function isAllowedHost(host: string) {
  return ALLOWED.some(d => host === d || host.endsWith('.' + d));
}

function isValidContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  // Remove charset and other parameters, normalize
  const baseType = contentType.split(';')[0].trim().toLowerCase();
  return ALLOWED_CONTENT_TYPES.some(allowed => {
    const allowedBase = allowed.split(';')[0].trim().toLowerCase();
    return baseType === allowedBase;
  });
}

function containsMaliciousContent(jsonString: string): boolean {
  // Check for common XSS patterns in JSON strings
  const maliciousPatterns = [
    /<script[^>]*>/i,
    /javascript:/i,
    /onerror\s*=/i,
    /onload\s*=/i,
    /onclick\s*=/i,
    /onmouseover\s*=/i,
    /<iframe[^>]*>/i,
    /<img[^>]*onerror/i,
    /<svg[^>]*onload/i,
  ];
  return maliciousPatterns.some(pattern => pattern.test(jsonString));
}

function setSecurityHeaders(res: NextApiResponse) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function sendError(res: NextApiResponse, status: number, message: string) {
  setSecurityHeaders(res);
  res.setHeader('Content-Type', 'application/json');
  res.status(status).json({ error: message });
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
    if (!['https:'].includes(parsed.protocol)) {
      return sendError(res, 400, 'Only HTTPS URLs are allowed');
    }
    if (!isAllowedHost(parsed.hostname)) {
      return sendError(res, 403, 'Host not allowed');
    }

    // Normalize and attempt multiple IPFS gateways if applicable
    const ipfsMatch = parsed.pathname.match(/\/ipfs\/([^/?#]+)/i);
    const candidates: string[] = [];
    if (ipfsMatch && ipfsMatch[1]) {
      const cid = ipfsMatch[1];
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
    for (const urlTry of candidates) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 7000);
        upstream = await fetch(urlTry, {
          headers: { 'Accept': 'application/json,text/plain,*/*', 'User-Agent': 'Interstate-MetadataProxy/1.0' },
          signal: controller.signal,
          cache: 'force-cache',
        });
        clearTimeout(t);
        if (upstream.ok) break;
        lastErr = new Error(`HTTP ${upstream.status} ${upstream.statusText}`);
      } catch (e: any) {
        lastErr = e;
      }
      upstream = null;
    }
    if (!upstream) {
      console.error('[metadata/proxy] error:', lastErr?.message || lastErr);
      return sendError(res, 502, 'Failed to fetch metadata');
    }

    // Validate Content-Type before processing
    const contentType = upstream.headers.get('content-type');
    if (!isValidContentType(contentType)) {
      console.error('[metadata/proxy] invalid content type:', contentType);
      return sendError(res, 415, 'Unsupported media type');
    }

    // Read content with size limit
    const text = await upstream.text();
    
    // Validate content size
    if (text.length > MAX_METADATA_SIZE) {
      console.error('[metadata/proxy] content too large:', text.length);
      return sendError(res, 413, 'Content too large');
    }

    // Parse and validate JSON - reject if not valid JSON
    let json;
    try {
      json = JSON.parse(text);
    } catch (parseError) {
      console.error('[metadata/proxy] invalid JSON:', parseError);
      return sendError(res, 415, 'Invalid JSON content');
    }

    // Validate JSON structure - must be an object or array (not primitive)
    if (typeof json !== 'object' || json === null) {
      console.error('[metadata/proxy] invalid JSON structure:', typeof json);
      return sendError(res, 415, 'Invalid metadata format');
    }

    // Check for malicious content patterns in JSON
    const jsonString = JSON.stringify(json);
    if (containsMaliciousContent(jsonString)) {
      console.error('[metadata/proxy] malicious content detected');
      return sendError(res, 415, 'Malicious content detected');
    }

    // Set security headers
    setSecurityHeaders(res);
    
    // Set cache headers
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=300');
    
    // Send validated JSON
    return res.status(200).json(json);
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return sendError(res, 408, 'Request timeout');
    }
    console.error('[metadata/proxy] error:', err?.message || err);
    return sendError(res, 502, 'Internal server error');
  }
}
