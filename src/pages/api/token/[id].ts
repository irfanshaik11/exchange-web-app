import type { NextApiRequest, NextApiResponse } from 'next';
import { Pool } from 'pg';
import { env } from '../../../env';
import type { Token } from '~/utils/db';

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
      `SELECT * FROM tokens WHERE token_address = $1 LIMIT 1`,
      [id]
    );

    console.log(rows)

    if (rows.length === 0) {
      return res.status(404).json({ result: null });
    }
    const row = rows[0];
    const result: Token = {
      bonding_completion_percentage: row.bonding_completion_percentage,
      bonding_status: row.bonding_status,
      bundlers: row.bundlers,
      buy_transaction_count_1h: row.buy_transaction_count_1h,
      buy_transaction_count_5m: row.buy_transaction_count_5m,
      buy_transaction_count_6h: row.buy_transaction_count_6h,
      buy_transaction_count_24h: row.buy_transaction_count_24h,
      buy_volume_1h: row.buy_volume_1h,
      buy_volume_5m: row.buy_volume_5m,
      buy_volume_6h: row.buy_volume_6h,
      buy_volume_24h: row.buy_volume_24h,
      created_at: row.created_at,
      data_source: row.data_source,
      dev_holding_percentage: row.dev_holding_percentage,
      dev_tokens: row.dev_tokens,
      developer_address: row.developer_address,
      dex_paid: row.dex_paid,
      global_fees_paid: row.global_fees_paid,
      holders: row.holders,
      holders_count: row.holders_count,
      insiders: row.insiders,
      label: row.label,
      liquidity: row.liquidity,
      logo: row.logo,
      lp_burned: row.lp_burned,
      market_cap_total: row.market_cap_total,
      name: row.name,
      paid_audit: row.paid_audit,
      price: row.price,
      price_change_1h: row.price_change_1h,
      price_change_5m: row.price_change_5m,
      price_change_6h: row.price_change_6h,
      price_change_24h: row.price_change_24h,
      price_native: row.price_native,
      pro_traders: row.pro_traders,
      sell_transaction_count_1h: row.sell_transaction_count_1h,
      sell_transaction_count_5m: row.sell_transaction_count_5m,
      sell_transaction_count_6h: row.sell_transaction_count_6h,
      sell_transaction_count_24h: row.sell_transaction_count_24h,
      sell_volume_1h: row.sell_volume_1h,
      sell_volume_5m: row.sell_volume_5m,
      sell_volume_6h: row.sell_volume_6h,
      sell_volume_24h: row.sell_volume_24h,
      snipers_holding: row.snipers_holding,
      social_telegram: row.social_telegram,
      social_website: row.social_website,
      social_x: row.social_x,
      supply: row.supply,
      token_address: row.token_address,
      top_holders_percentage: row.top_holders_percentage,
      txn_change_1h: row.txn_change_1h,
      txn_change_5m: row.txn_change_5m,
      txn_change_6h: row.txn_change_6h,
      txn_change_24h: row.txn_change_24h,
      txns: row.txns,
      updated_at: row.updated_at,
      volume: row.volume,
    };
    res.status(200).json({ result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch token' });
  }
} 