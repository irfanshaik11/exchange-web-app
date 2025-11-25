import type { NextApiRequest, NextApiResponse } from 'next';
import { extractTokenImage } from '~/utils/images';
import { Pool } from 'pg';

// Connect to Monad indexer database
const pool = new Pool({
  connectionString: process.env.MONAD_DB_URL || 'postgresql://postgres:postgres@localhost:5432/monad_db?sslmode=disable',
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Set appropriate cache headers
  const isFresh = req.query.fresh === '1';

  if (isFresh) {
    res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  }

  try {
    const limit = parseInt(req.query.limit as string) || 70;

    // Query Monad database for MIGRATED status tokens
    const result = await pool.query(`
      SELECT
        address,
        name,
        symbol,
        decimals,
        status,
        launchpad_protocol,
        price_usd,
        price_monad as price_mon,
        market_cap_usd,
        volume_24h_usd,
        volume_5m_usd,
        volume_1h_usd,
        volume_6h_usd,
        total_transactions,
        total_buys,
        total_sells,
        unique_traders,
        graduation_percent,
        is_graduated,
        image_url,
        created_at,
        updated_at
      FROM monad_tokens
      WHERE status = 'MIGRATED'
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);

    const tokens = result.rows || [];
    
    // Map Monad token service format to expected frontend format
    // Only map fields that the database actually returns
    const mapped = Array.isArray(tokens) ? tokens.map((r: any) => {
      const toNumber = (value: any): number => {
        if (typeof value === 'number') {
          return Number.isFinite(value) ? value : 0;
        }
        if (typeof value === 'string') {
          const cleaned = value.trim();
          if (!cleaned) return 0;
          const parsed = Number(cleaned);
          return Number.isFinite(parsed) ? parsed : 0;
        }
        return 0;
      };

      // Only use fields that exist in the database response
      return {
        mint: r.address || null,
        pair_address: r.address || null,
        name: r.name || '',
        symbol: r.symbol || '',
        usd_price: toNumber(r.price_usd),
        fully_diluted_value: toNumber(r.market_cap_usd),
        volume_24h: toNumber(r.volume_24h_usd),
        volume_5m: toNumber(r.volume_5m_usd) || 0,
        volume_1h: toNumber(r.volume_1h_usd) || 0,
        volume_6h: toNumber(r.volume_6h_usd) || 0,
        created_at: r.created_at || null,
        launch_time: r.created_at || null,
        launchpad_protocol: r.launchpad_protocol || null,
        image_url: r.image_url || null,
        status: r.status || 'MIGRATED',
        decimals: r.decimals || 18,
        total_transactions: toNumber(r.total_transactions) || 0,
        total_buys: toNumber(r.total_buys) || 0,
        total_sells: toNumber(r.total_sells) || 0,
        unique_traders: toNumber(r.unique_traders) || 0,
        is_graduated: r.is_graduated || false,
        updated_at: r.updated_at || null,
        creator_wallet: r.creator_wallet || null,
        creator_address: r.creator_wallet || null, // Alias for consistency
        graduation_percent: toNumber(r.graduation_percent),
        bonding_curve_progress: toNumber(r.graduation_percent), // Alias for frontend
      };
    }) : [];

    res.setHeader('X-Cache', 'MISS');
    return res.json(mapped);
  } catch (err: any) {
    console.error('[pulse-migrated-monad] Error fetching data:', err);
    res.status(502).json({ error: 'Bad gateway to Monad token service' });
  }
}

