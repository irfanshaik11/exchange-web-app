import type { NextApiRequest, NextApiResponse } from 'next';
import { Pool } from 'pg';
import { env } from '../../../env';
import type { DexToken } from '~/utils/moralis';

const pool = new Pool({
  connectionString: env.NEON_DB_API_KEY,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  console.log(id)
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid token address' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT token_address, name, symbol, logo, decimals, price_native, price_usd, liquidity, fully_diluted_valuation, bonding_curve_progress FROM tokens WHERE token_address = $1 LIMIT 1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ result: null });
    }
    const row = rows[0];
    const result: DexToken = {
      tokenAddress: row.token_address,
      name: row.name,
      symbol: row.symbol,
      logo: row.logo,
      decimals: String(row.decimals),
      priceNative: String(row.price_native),
      priceUsd: String(row.price_usd),
      liquidity: String(row.liquidity),
      fullyDilutedValuation: String(row.fully_diluted_valuation),
      bondingCurveProgress: Number(row.bonding_curve_progress),
    };
    res.status(200).json({ result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch token' });
  }
} 