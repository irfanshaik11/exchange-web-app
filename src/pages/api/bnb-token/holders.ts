import type { NextApiRequest, NextApiResponse } from 'next';
import {
  BNB_HTTP_BASE,
  fetchBnbHolderCountUpstream,
  isValidBnbWallet,
  resolveBnbHolderCount,
} from '~/utils/bnbToken';

const SCAN_API_KEY =
  process.env.BSCSCAN_API_KEY ||
  process.env.ETHERSCAN_API_KEY ||
  '';

// Sliding-window in-memory rate limiter
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const ipHits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = (ipHits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (bucket.length >= RATE_LIMIT_MAX) {
    ipHits.set(ip, bucket);
    return true;
  }
  bucket.push(now);
  ipHits.set(ip, bucket);
  if (ipHits.size > 500 && Math.random() < 0.02) {
    for (const [k, v] of ipHits) {
      if (v.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) ipHits.delete(k);
    }
  }
  return false;
}

async function fetchUpstreamHoldersList(
  mint: string,
  limit: number,
): Promise<{ total: number; holders: Array<Record<string, unknown>> } | null> {
  const response = await fetch(
    `${BNB_HTTP_BASE}/v1/token/${encodeURIComponent(mint)}/holders?limit=${limit}`,
    { headers: { Accept: 'application/json' } },
  );
  if (!response.ok) return null;
  const body = await response.json().catch(() => ({}));
  const holders = Array.isArray(body?.holders) ? body.holders : [];
  const total = resolveBnbHolderCount(body) ?? holders.length;
  if (holders.length === 0 && total <= 0) return null;
  return { total, holders };
}

async function fetchBscHolderList(
  mint: string,
  limit: number,
): Promise<{ total: number; holders: Array<Record<string, unknown>> } | null> {
  if (!SCAN_API_KEY) return null;
  const params = new URLSearchParams({
    chainid: '56',
    module: 'token',
    action: 'tokenholderlist',
    contractaddress: mint,
    page: '1',
    offset: String(Math.min(limit, 100)),
    apikey: SCAN_API_KEY,
  });
  const response = await fetch(`https://api.etherscan.io/v2/api?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) return null;
  const body = await response.json().catch(() => ({}));
  if (body?.status !== '1' || !Array.isArray(body?.result)) return null;

  const holders = body.result.map((row: any, idx: number) => ({
    rank: idx + 1,
    wallet: String(row.HolderAddress || '').toLowerCase(),
    address: String(row.HolderAddress || '').toLowerCase(),
    balance: Number(row.TokenHolderQuantity || 0),
    token_balance: Number(row.TokenHolderQuantity || 0),
  }));

  const countRes = await fetchBnbHolderCountUpstream(mint);
  return {
    total: countRes ?? holders.length,
    holders,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip =
    (typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0]
      : req.socket?.remoteAddress) ?? 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const mint = typeof req.query.mint === 'string' ? req.query.mint.trim().toLowerCase() : '';
  const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;

  if (!mint || !isValidBnbWallet(mint)) {
    return res.status(400).json({ error: 'mint parameter is required' });
  }

  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=120');

  try {
    const fromUpstream = await fetchUpstreamHoldersList(mint, limit);
    if (fromUpstream) {
      return res.status(200).json({
        mint,
        holder_count: fromUpstream.total,
        total_holders: fromUpstream.total,
        holders: fromUpstream.holders,
        source: 'token-bnb-holders',
      });
    }

    const fromScan = await fetchBscHolderList(mint, limit);
    if (fromScan) {
      return res.status(200).json({
        mint,
        holder_count: fromScan.total,
        total_holders: fromScan.total,
        holders: fromScan.holders,
        source: 'bscscan',
      });
    }

    const holderCount = await fetchBnbHolderCountUpstream(mint);
    if (holderCount != null && holderCount > 0) {
      return res.status(200).json({
        mint,
        holder_count: holderCount,
        total_holders: holderCount,
        holders: [],
        source: 'count-only',
      });
    }

    return res.status(404).json({ error: 'Holders not available' });
  } catch (error) {
    console.error('[bnb-token/holders] failed', error);
    return res.status(500).json({ error: 'Failed to fetch BNB holders' });
  }
}
