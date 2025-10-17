import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Disable caching
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const filter = req.query.filter as string || 'new';
  const limit = parseInt(req.query.limit as string || '20');

  // Mock data to prevent frontend crashes
  const mockTokens = Array.from({ length: Math.min(limit, 10) }, (_, i) => ({
    mint: `mock_mint_${i}_${Date.now()}`,
    name: `Mock Token ${i + 1}`,
    symbol: `MOCK${i + 1}`,
    logo: `https://ui-avatars.com/api/?name=MOCK${i + 1}&size=64&background=1a1a1a&color=ffffff&bold=true`,
    usd_price: Math.random() * 0.001 + 0.0001,
    fully_diluted_value: Math.random() * 1000000 + 10000,
    volume_24h: Math.random() * 50000 + 1000,
    price_percent_change_1h: (Math.random() - 0.5) * 20,
    bonding_curve_progress: Math.random() * 100,
    bonding_pct: Math.random() * 100,
    created_at: new Date(Date.now() - Math.random() * 86400000).toISOString(),
    total_buy_volume_5m: Math.random() * 1000 + 100,
    total_sell_volume_5m: Math.random() * 1000 + 100,
    total_buyers_5m: Math.floor(Math.random() * 50 + 5),
    total_sellers_5m: Math.floor(Math.random() * 50 + 5),
    total_buys_5m: Math.floor(Math.random() * 100 + 10),
    total_sells_5m: Math.floor(Math.random() * 100 + 10),
    unique_wallets_5m: Math.floor(Math.random() * 100 + 10),
    pair_address: `mock_pair_${i}`,
  }));

  console.log(`[MockAPI] Returning ${mockTokens.length} mock tokens for filter: ${filter}`);
  
  return res.json(mockTokens);
}
