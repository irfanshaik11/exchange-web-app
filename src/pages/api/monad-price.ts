import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Try Monad token service first (local)
  const monadTokenServiceUrl = process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL || 'http://localhost:8081';
  
  try {
    // Try Monad token service /v1/price endpoint first
    const monadServiceResponse = await fetch(
      `${monadTokenServiceUrl}/v1/price`,
      {
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      }
    );

    if (monadServiceResponse.ok) {
      const data = await monadServiceResponse.json();
      const price = data?.price_usd;
      
      if (typeof price === 'number' && price > 0) {
        return res.status(200).json({ price });
      }
    }
  } catch (error) {
    console.warn('Monad token service price fetch failed, trying CoinGecko fallback:', error);
  }

  // Fallback to CoinGecko if Monad token service fails
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=monad&vs_currencies=usd',
      {
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      }
    );

    if (response.ok) {
      const data = await response.json();
      const price = data?.monad?.usd;

      if (typeof price === 'number' && price > 0) {
        return res.status(200).json({ price });
      }
    }
  } catch (error) {
    console.error('Error fetching Monad price from CoinGecko:', error);
  }

  // Return fallback price if both sources fail
  return res.status(200).json({ price: 0.025 });
}

