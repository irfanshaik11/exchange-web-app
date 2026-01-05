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
  'ar-io.net',
  'ipfs.storacha.link',
  'storacha.link',
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

    const hasIpfsPath = parsed.pathname.includes('/ipfs/');

    // Build candidate URLs with IPFS/Arweave gateway fallbacks
    const candidates: string[] = [];
    const ipfsMatch = parsed.pathname.match(/\/ipfs\/([^/?#]+)/i);
    if (ipfsMatch && ipfsMatch[1]) {
      const cid = ipfsMatch[1];
      const gateways = [
        parsed.toString(),
        parsed.protocol === 'http:' ? parsed.toString().replace(/^http:/i, 'https:') : parsed.toString(),
        `https://cloudflare-ipfs.com/ipfs/${cid}`,
        `https://ipfs.io/ipfs/${cid}`,
        `https://gateway.pinata.cloud/ipfs/${cid}`,
        `https://nftstorage.link/ipfs/${cid}`,
        `https://gateway.ipfs.io/ipfs/${cid}`,
      ];
      for (const g of gateways) {
        if (!candidates.includes(g)) candidates.push(g);
      }
    } else if (parsed.hostname.includes('arweave')) {
      const arweavePath = parsed.pathname.replace(/^\/+/, '');
      const arGateways = [
        parsed.toString(),
        parsed.protocol === 'http:' ? parsed.toString().replace(/^http:/i, 'https:') : parsed.toString(),
        `https://arweave.net/${arweavePath}`,
        `https://ar-io.net/${arweavePath}`,
      ];
      for (const g of arGateways) {
        if (!candidates.includes(g)) candidates.push(g);
      }
    } else {
      const original = parsed.toString();
      const httpsVersion =
        parsed.protocol === 'http:' ? original.replace(/^http:/i, 'https:') : original;
      if (!candidates.includes(httpsVersion)) candidates.push(httpsVersion);
      if (!candidates.includes(original)) candidates.push(original);
    }

    let upstream: Response | null = null;
    let lastErr: any = null;
    let lastNonOk: { resp: Response; url: string } | null = null;

    for (const tryUrl of candidates) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 8000);
        const headers: Record<string, string> = {
          'Accept': 'application/json,image/*,*/*;q=0.8',
          'User-Agent': 'Interstate-Metadata/1.0',
        };
        const resp = await fetch(tryUrl, {
          signal: controller.signal,
          headers,
        });
        clearTimeout(t);
        if (resp.ok) {
          upstream = resp;
          break;
        }
        lastNonOk = { resp, url: tryUrl };
        lastErr = new Error(`HTTP ${resp.status} ${resp.statusText}`);
      } catch (e: any) {
        lastErr = e;
      }
    }

    if (!upstream) {
      // If we at least got a non-OK response, passthrough it with CORS instead of 502
      if (lastNonOk) {
        const buf = Buffer.from(await lastNonOk.resp.arrayBuffer());
        const ct = lastNonOk.resp.headers.get('content-type') || '';
        setHeaders(res);
        res.setHeader('Content-Type', ct || 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600, stale-while-revalidate=600');
        return res.status(lastNonOk.resp.status).send(buf);
      }
      console.error('[api/metadata] failed to fetch:', lastErr?.message || lastErr);
      setHeaders(res);
      return res.status(502).send('Failed to fetch metadata');
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
