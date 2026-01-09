import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * DFlow Swap API Proxy
 */

const DFLOW_QUOTE_API = process.env.DFLOW_QUOTE_API || 'https://c.quote-api.dflow.net';
const DFLOW_API_KEY = process.env.DFLOW_API_KEY || 'hAQznO3n9GgSNKukXXaA';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { quoteResponse, userPublicKey } = req.body;

    if (!quoteResponse || !userPublicKey) {
      return res.status(400).json({ error: 'Missing required parameters: quoteResponse, userPublicKey' });
    }

    const response = await fetch(`${DFLOW_QUOTE_API}/swap`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-api-key': DFLOW_API_KEY,
      },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[DFlow Proxy] Swap error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'DFlow Swap API request failed',
        details: errorText,
      });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (e: any) {
    console.error('[DFlow Proxy] Swap error:', e);
    return res.status(500).json({
      error: 'Internal server error',
      message: e.message,
    });
  }
}
