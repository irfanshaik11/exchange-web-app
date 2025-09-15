import type { NextApiRequest, NextApiResponse } from 'next';

interface MarketData {
  mint: string;
  price_usd: number;
  market_cap_usd: number;
  volume_usd?: number;
  updated_at: string;
}

/**
 * Bulk market data via Codex GraphQL.
 * Body: { mints: string[] }
 * Returns: Record<mint, MarketData>
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const { mints } = req.body as { mints?: string[] };
  if (!Array.isArray(mints) || mints.length === 0) {
    return res.status(400).json({ error: 'Invalid mints array' });
  }
  if (mints.length > 200) {
    return res.status(400).json({ error: 'Too many mint addresses (max 200)' });
  }

  const endpoint = process.env.CODEX_GRAPHQL_URL || process.env.NEXT_PUBLIC_CODEX_GRAPHQL_URL;
  if (!endpoint) {
    return res.status(500).json({ error: 'Codex GraphQL endpoint not configured (CODEX_GRAPHQL_URL)' });
  }

  const query = `#graphql
    query GetBulkTokenStats($tokens: [String!]!, $limit: Int) {
      filterTokens(tokens: $tokens, limit: $limit) {
        results {
          token {
            address
            symbol
            name
          }
          priceUSD
          marketCap
          volume24
        }
      }
    }
  `;

  const variables = {
    tokens: mints,
    limit: Math.min(mints.length, 200),
  };

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        // Optional auth header if provided
        ...(process.env.CODEX_API_KEY ? { 'Authorization': `Bearer ${process.env.CODEX_API_KEY}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: `Codex upstream error ${resp.status}`, details: text });
    }

    const json = await resp.json();
    if (json.errors) {
      return res.status(502).json({ error: 'Codex GraphQL errors', details: json.errors });
    }

    const now = new Date().toISOString();
    const out: Record<string, MarketData> = {};

    const results = json?.data?.filterTokens?.results || [];
    for (const r of results) {
      const addr: string | undefined = r?.token?.address;
      if (!addr) continue;
      out[addr] = {
        mint: addr,
        price_usd: Number(r?.priceUSD ?? 0) || 0,
        market_cap_usd: Number(r?.marketCap ?? 0) || 0,
        volume_usd: Number(r?.volume24 ?? 0) || 0,
        updated_at: now,
      };
    }

    return res.json(out);
  } catch (err: any) {
    return res.status(502).json({ error: 'Failed to query Codex GraphQL', details: err?.message || String(err) });
  }
}

