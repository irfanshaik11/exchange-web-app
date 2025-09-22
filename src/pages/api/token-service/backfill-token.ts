import type { NextApiRequest, NextApiResponse } from 'next';

interface TokenBackfillRequest {
  mint: string;
  name: string;
  symbol: string;
  uri?: string;
  market_cap_usd?: number;
  liquidity_usd?: number;
  pair_address?: string;
}

interface TokenBackfillResponse {
  success: boolean;
  token?: {
    mint: string;
    name: string;
    symbol: string;
    status: string;
    created_at: string;
  };
  error?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<TokenBackfillResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { mint, name, symbol, uri, market_cap_usd, liquidity_usd, pair_address }: TokenBackfillRequest = req.body;

    // Validate required fields
    if (!mint || !name || !symbol) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: mint, name, symbol' 
      });
    }

    // Call the Go backend to backfill the token
    const backendUrl = process.env.NEXT_PUBLIC_GO_SERVICE_URL || 'http://localhost:8080';
    const backfillResponse = await fetch(`${backendUrl}/v1/tokens/backfill`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mint,
        name,
        symbol,
        uri,
        market_cap_usd,
        liquidity_usd,
        pair_address
      })
    });

    if (!backfillResponse.ok) {
      const errorText = await backfillResponse.text();
      console.error('Backend backfill failed:', errorText);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to backfill token in backend' 
      });
    }

    const backendResult = await backfillResponse.json();
    
    return res.status(200).json({
      success: true,
      token: {
        mint: backendResult.mint || mint,
        name: backendResult.name || name,
        symbol: backendResult.symbol || symbol,
        status: backendResult.status || 'NEW',
        created_at: backendResult.created_at || new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error in backfill-token API:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}

