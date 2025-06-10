import type { NextApiRequest, NextApiResponse } from 'next';
import { Pool } from 'pg';
import { env } from '../../env';

const pool = new Pool({
  connectionString: env.NEON_DB_API_KEY,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Get all data from the tokens table
    const { rows } = await pool.query('SELECT * FROM tokens');
    res.status(200).json({ result: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch all tokens' });
  }
} 