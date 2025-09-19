import type { NextApiRequest, NextApiResponse } from 'next';

const GO_SERVICE_URL = process.env.NEXT_PUBLIC_GO_SERVICE_URL || 'http://localhost:8080';
console.log('GO_SERVICE_URL:', GO_SERVICE_URL);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { pair_address, mint_address } = req.query;
  console.log('API called with:', { pair_address, mint_address });

  // Prefer pair_address over mint_address
  const address = pair_address || mint_address;

  if (!address || typeof address !== 'string') {
    return res.status(400).json({ error: 'pair_address or mint_address parameter is required' });
  }

  // Only handle pair addresses - mint addresses should be resolved to pair addresses before reaching here
  try {
    const pairEndpoint = `/v1/trade/view?pair_address=${address}`;
    console.log(`Fetching trade data for pair address: ${GO_SERVICE_URL}${pairEndpoint}`);
    const pairResponse = await fetch(`${GO_SERVICE_URL}${pairEndpoint}`);
    
    console.log(`Pair address response status: ${pairResponse.status}`);
    if (pairResponse.ok) {
      const data = await pairResponse.json();
      console.log(`Pair address endpoint succeeded for ${address}`);
      return res.status(200).json(data);
    } else {
      const errorText = await pairResponse.text();
      console.error(`Pair address endpoint failed for ${address}:`, pairResponse.status, errorText);
      return res.status(pairResponse.status).json({ error: errorText });
    }
    
  } catch (error) {
    console.error('Error calling backend API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

