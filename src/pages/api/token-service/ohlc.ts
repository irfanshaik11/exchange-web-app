import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { mint } = req.query;

  if (!mint || typeof mint !== 'string') {
    return res.status(400).json({ error: 'Mint parameter is required' });
  }

  try {
    console.log(`Fetching OHLC data for mint: ${mint}`);
    
    // Proxy request to your Go backend
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    const response = await fetch(`${backendUrl}/v1/trade/ohlc?mint=${encodeURIComponent(mint)}`, {
      headers: {
        'X-API-Key': process.env.BACKEND_API_KEY || 'test-key',
      },
      // Add timeout
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`Backend responded with ${response.status}`);
    }

    const data = await response.json();
    console.log(`Successfully fetched OHLC data for ${mint}:`, data);
    res.status(200).json(data);
  } catch (error) {
    console.error('OHLC API error:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      mint
    });
    res.status(500).json({ 
      error: 'Failed to fetch OHLC data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
