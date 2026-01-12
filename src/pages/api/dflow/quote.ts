import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * DFlow Quote API Proxy
 */

const DFLOW_QUOTE_API = process.env.DFLOW_QUOTE_API || 'https://c.quote-api.dflow.net';
const DFLOW_API_KEY = process.env.DFLOW_API_KEY || 'hAQznO3n9GgSNKukXXaA';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { inputMint, outputMint, amount, slippageBps = '50' } = req.query;

    if (!inputMint || !outputMint || !amount) {
      return res.status(400).json({ error: 'Missing required parameters: inputMint, outputMint, amount' });
    }

    const queryParams = new URLSearchParams({
      inputMint: inputMint as string,
      outputMint: outputMint as string,
      amount: amount as string,
      slippageBps: slippageBps as string,
    });

    const response = await fetch(`${DFLOW_QUOTE_API}/quote?${queryParams}`, {
      headers: {
        'Accept': 'application/json',
        'x-api-key': DFLOW_API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[DFlow Proxy] Quote error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'DFlow Quote API request failed',
        details: errorText,
      });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (e: any) {
    console.error('[DFlow Proxy] Quote error:', e);
    return res.status(500).json({
      error: 'Internal server error',
      message: e.message,
    });
  }
}
