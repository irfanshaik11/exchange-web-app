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

function isAllowedHost(host: string) {
  return ALLOWED.some(d => host === d || host.endsWith('.' + d));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const url = String(req.query.url || '');
    if (!url) return res.status(400).json({ error: 'Missing url' });
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    if (!['https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'Only https URLs are allowed' });
    }
    if (!isAllowedHost(parsed.hostname)) {
      return res.status(403).json({ error: `Host ${parsed.hostname} not allowed` });
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
      return res.status(502).json({ error: 'fetch failed' });
    }

    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=300');
    const ctype = upstream.headers.get('content-type') || '';
    const text = await upstream.text();
    try {
      const json = JSON.parse(text);
      return res.status(200).json(json);
    } catch {
      res.setHeader('Content-Type', ctype || 'text/plain');
      return res.status(200).send(text);
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return res.status(408).json({ error: 'Timeout' });
    }
    console.error('[metadata/proxy] error:', err?.message || err);
    return res.status(502).json({ error: 'Bad gateway' });
  }
}
