import type { NextApiRequest, NextApiResponse } from 'next';

// Use NEXT_PUBLIC_TOKEN_SERVICE_URL first (for production), then fallback to NEXT_PUBLIC_GO_SERVICE_URL
const GO_SERVICE_URL = (process.env.NEXT_PUBLIC_TOKEN_SERVICE_URL || process.env.NEXT_PUBLIC_GO_SERVICE_URL || '').replace(/\/$/, '');
console.log('GO_SERVICE_URL:', GO_SERVICE_URL);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { pair_address, mint_address } = req.query;
  console.log('API called with:', { pair_address, mint_address });

  if (!pair_address && !mint_address) {
    return res.status(400).json({ error: 'pair_address or mint_address parameter is required' });
  }

  if ((pair_address && typeof pair_address !== 'string') || (mint_address && typeof mint_address !== 'string')) {
    return res.status(400).json({ error: 'Invalid parameter type' });
  }

  // Type assertion after validation
  const pairAddr = pair_address as string;
  const mintAddr = mint_address as string;

  try {
    // Route to the correct backend endpoint based on parameter type
    let endpoint: string;
    let address: string;

    if (mintAddr) {
      // Query by mint address (token address) - better for graduated tokens
      endpoint = `/v1/trade/view-by-mint?mint_address=${mintAddr}`;
      address = mintAddr;
      console.log(`Fetching trade data by MINT address: ${GO_SERVICE_URL}${endpoint}`);
    } else {
      // Query by pair address (original behavior)
      endpoint = `/v1/trade/view?pair_address=${pairAddr}`;
      address = pairAddr;
      console.log(`Fetching trade data by PAIR address: ${GO_SERVICE_URL}${endpoint}`);
    }

    if (!GO_SERVICE_URL) {
      console.error('GO_SERVICE_URL is not configured');
      return res.status(500).json({ error: 'Token service URL not configured' });
    }

    const response = await fetch(`${GO_SERVICE_URL}${endpoint}`);

    console.log(`Response status: ${response.status} for ${address}`);
    if (response.ok) {
      const data = await response.json();
      console.log(`Trade view endpoint succeeded for ${address}`);
      return res.status(200).json(data);
    } else {
      const errorText = await response.text();
      console.error(`Trade view endpoint failed for ${address}:`, response.status, errorText);
      return res.status(response.status).json({ error: errorText });
    }
    
  } catch (error) {
    console.error('Error calling backend API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

