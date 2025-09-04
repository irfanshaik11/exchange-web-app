import type { NextApiRequest, NextApiResponse } from 'next';
import { Pool } from 'pg';

const pool = new Pool({
  // Connect to Kubernetes PostgreSQL service
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@postgres:5432/tokenservice'
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    // Get all data from the tokens table with proper filtering
    const { rows } = await pool.query(`
      SELECT 
        pair_address,
        mint,
        "name",
        symbol,
        usd_price,
        bonding_curve_progress,
        amm,
        total_liquidity_usd,
        created_at,
        updated_at
      FROM "Token" 
      WHERE usd_price > 0 
        AND mint NOT IN ('So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
      ORDER BY updated_at DESC
      LIMIT 100
    `);
    
    // Add default bonding_curve_progress for categorization (same logic as WebSocket server)
    const tokensWithProgress = rows.map(token => ({
      ...token,
      bonding_curve_progress: token.bonding_curve_progress ?? (() => {
        // Assign default progress based on AMM type for demonstration
        if (token.amm === 'pump_amm') return 0.3; // New Pairs
        if (token.amm === 'cp_amm') return 0.7; // Final Stretch  
        if (token.amm === 'raydium_amm' || token.amm === 'amm_v3' || token.amm === 'lb_clmm') return 0.9; // Migrated
        return 0.5; // Default to New Pairs
      })()
    }));
    
    res.status(200).json({ result: tokensWithProgress });
  } catch (error) {
    console.error("Error in API: ", error);
    res.status(500).json({ error: 'Failed to fetch all tokens' });
  }
}