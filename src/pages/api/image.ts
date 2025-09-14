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
  'api.dicebear.com',
];

function isAllowedHost(host: string) {
  return ALLOWED.some(d => host === d || host.endsWith('.' + d));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const url = String(req.query.url || '');
    if (!url) return res.status(400).send('Missing url');
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).send('Invalid URL');
    }
    if (parsed.protocol !== 'https:') {
      return res.status(400).send('Only https URLs are allowed');
    }
    if (!isAllowedHost(parsed.hostname)) {
      return res.status(403).send('Host not allowed');
    }

    // IPFS multi-gateway fallback if /ipfs/<cid>
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
    for (const tryUrl of candidates) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 7000);
        upstream = await fetch(tryUrl, {
          headers: { 'Accept': 'image/*,*/*;q=0.8', 'User-Agent': 'Interstate-ImageProxy/1.0' },
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
      console.error('[image proxy] error:', lastErr?.message || lastErr);
      return res.status(502).send('fetch failed');
    }

    // Stream response
    const ctype = upstream.headers.get('content-type') || 'image/*';
    res.setHeader('Content-Type', ctype);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400');
    const body = Buffer.from(await upstream.arrayBuffer());
    res.status(200).send(body);
  } catch (err: any) {
    if (err?.name === 'AbortError') return res.status(408).send('Timeout');
    console.error('[image proxy] fatal:', err?.message || err);
    return res.status(502).send('Bad gateway');
  }
}
