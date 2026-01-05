import type { NextApiRequest, NextApiResponse } from 'next';

const ALLOWED_METADATA_HOSTS = [
  'metadata.rapidlaunch.io',
  'rapidlaunch.io',
  'metadata.uxento.io',
  'uxento.io',
  'metadata.j7tracker.com',
  'j7tracker.com',
  'cloudflare-ipfs.com',
  'ipfs.io',
  'gateway.pinata.cloud',
  'nftstorage.link',
  'gateway.ipfs.io',
  'cf-ipfs.com',
  'mypinata.cloud',
  'arweave.net',
  'arweave.dev',
  'raw.githubusercontent.com',
  'githubusercontent.com',
];

function isAllowedHost(host: string): boolean {
  return ALLOWED_METADATA_HOSTS.some((d) => host === d || host.endsWith('.' + d));
}

function setHeaders(res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'OPTIONS') {
    setHeaders(res);
    return res.status(204).end();
  }

  try {
    const url = String(req.query.url || '');
    if (!url) {
      setHeaders(res);
      return res.status(400).send('Missing url parameter');
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      setHeaders(res);
      return res.status(400).send('Invalid URL format');
    }

    if (parsed.protocol !== 'https:') {
      setHeaders(res);
      return res.status(400).send('Only HTTPS URLs are allowed');
    }

    const hasIpfsPath = parsed.pathname.includes('/ipfs/');
    if (!isAllowedHost(parsed.hostname) && !hasIpfsPath) {
      setHeaders(res);
      return res.status(403).send('Host not allowed');
    }

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    const upstream = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(t);

    if (!upstream.ok) {
      setHeaders(res);
      return res.status(upstream.status).send('Failed to fetch metadata');
    }

    const contentType = upstream.headers.get('content-type') || '';
    const buffer = Buffer.from(await upstream.arrayBuffer());

    setHeaders(res);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=3600');

    // If JSON, parse and return as JSON; otherwise passthrough as-is
    if (contentType.includes('application/json') || contentType.endsWith('+json')) {
      try {
        const data = JSON.parse(buffer.toString('utf-8'));
        return res.status(200).json(data);
      } catch {
        // fall through to passthrough
      }
    }

    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    return res.status(200).send(buffer);
  } catch (err: any) {
    setHeaders(res);
    if (err?.name === 'AbortError') {
      return res.status(408).send('Request timeout');
    }
    return res.status(502).send('Internal server error');
  }
}
