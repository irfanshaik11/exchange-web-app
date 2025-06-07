import type { NextApiRequest, NextApiResponse } from 'next';
import { Pool } from 'pg';
import { env } from '../../env';
import type { DexPair } from '~/utils/moralis';

const pool = new Pool({
  connectionString: env.NEON_DB_API_KEY,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Get all pairs with their tokens
    const { rows } = await pool.query(`
      SELECT 
        p.exchange_address, p.exchange_name, p.exchange_logo, p.pair_address, p.pair_label,
        p.usd_price, p.usd_price_24hr_percent_change, p.usd_price_24hr_usd_change,
        p.volume_24hr_native, p.volume_24hr_usd, p.liquidity_usd, p.base_token, p.quote_token, p.inactive_pair,
        t0.token_address AS token0_address, t0.name AS token0_name, t0.symbol AS token0_symbol, t0.logo AS token0_logo, t0.decimals AS token0_decimals,
        t1.token_address AS token1_address, t1.name AS token1_name, t1.symbol AS token1_symbol, t1.logo AS token1_logo, t1.decimals AS token1_decimals
      FROM pairs p
      LEFT JOIN tokens t0 ON p.base_token = t0.token_address
      LEFT JOIN tokens t1 ON p.quote_token = t1.token_address
      ORDER BY p.volume_24hr_usd DESC NULLS LAST
      LIMIT 20
    `);

    const pairs: DexPair[] = rows.map((row: any) => ({
      exchangeAddress: row.exchange_address,
      exchangeName: row.exchange_name,
      exchangeLogo: row.exchange_logo,
      pairAddress: row.pair_address,
      pairLabel: row.pair_label,
      usdPrice: Number(row.usd_price),
      usdPrice24hrPercentChange: Number(row.usd_price_24hr_percent_change),
      usdPrice24hrUsdChange: Number(row.usd_price_24hr_usd_change),
      volume24hrNative: Number(row.volume_24hr_native),
      volume24hrUsd: Number(row.volume_24hr_usd),
      liquidityUsd: Number(row.liquidity_usd),
      baseToken: row.base_token,
      quoteToken: row.quote_token,
      inactivePair: !!row.inactive_pair,
      pair: [
        {
          tokenAddress: row.token0_address,
          tokenName: row.token0_name,
          tokenSymbol: row.token0_symbol,
          tokenLogo: row.token0_logo,
          tokenDecimals: String(row.token0_decimals),
          pairTokenType: 'token0',
          liquidityUsd: Number(row.liquidity_usd),
        },
        {
          tokenAddress: row.token1_address,
          tokenName: row.token1_name,
          tokenSymbol: row.token1_symbol,
          tokenLogo: row.token1_logo,
          tokenDecimals: String(row.token1_decimals),
          pairTokenType: 'token1',
          liquidityUsd: Number(row.liquidity_usd),
        },
      ],
    }));

    res.status(200).json(pairs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch pairs' });
  }
} 