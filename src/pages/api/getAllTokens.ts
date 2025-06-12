import type { NextApiRequest, NextApiResponse } from 'next';
import { Pool } from 'pg';
import { env } from '../../env';

const pool = new Pool({
  connectionString: env.NEON_DB_API_KEY,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    console.log("Connection string: ",env.NEON_DB_API_KEY);
    // Get all data from the tokens table
    const { rows } = await pool.query('SELECT * FROM token_details');
    console.log("Query Results: ", rows);
    res.status(200).json({ result: rows });
  } catch (error) {
    console.error("Error in API: ",error);
    res.status(500).json({ error: 'Failed to fetch all tokens' });
  }
} 
