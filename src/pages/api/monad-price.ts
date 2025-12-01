import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=monad&vs_currencies=usd',
      {
        headers: {
          'Accept': 'application/json',
        },
        // Add a timeout
        signal: AbortSignal.timeout(10000), // 10 second timeout
      }
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API returned ${response.status}`);
    }

    const data = await response.json();
    const price = data?.monad?.usd;

    if (typeof price === 'number' && price > 0) {
      return res.status(200).json({ price });
    }

    // If price is invalid, return fallback
    return res.status(200).json({ price: 0.025 });
  } catch (error) {
    console.error('Error fetching Monad price:', error);
    // Return fallback price on error
    return res.status(200).json({ price: 0.025 });
  }
}

