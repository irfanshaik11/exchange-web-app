import { NextApiRequest, NextApiResponse } from 'next';

const GO_SERVICE_URL = process.env.NEXT_PUBLIC_GO_SERVICE_URL || 'http://localhost:8080';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { mint_address } = req.query;

  if (!mint_address || typeof mint_address !== 'string') {
    return res.status(400).json({ error: 'mint_address parameter is required' });
  }

  try {
    const response = await fetch(`${GO_SERVICE_URL}/v1/trade/view-by-mint?mint_address=${mint_address}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend API error:', response.status, errorText);
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error calling backend API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
