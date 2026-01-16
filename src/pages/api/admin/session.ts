/**
 * Admin Session - Proxies to backend
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/admin/session`, {
      method: 'GET',
      headers: {
        Cookie: req.headers.cookie || '',
      },
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('[Admin Session] Proxy error:', error);
    return res.status(500).json({
      configured: false,
      authenticated: false,
      error: 'Failed to connect to backend',
    });
  }
}
