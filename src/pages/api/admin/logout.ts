/**
 * Admin Logout - Proxies to backend
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/admin/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: req.headers.cookie || '',
      },
    });

    const data = await response.json();

    // Forward cookies from backend (clears the session)
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      res.setHeader('Set-Cookie', setCookie);
    }

    return res.status(response.status).json(data);
  } catch (error) {
    console.error('[Admin Logout] Proxy error:', error);
    return res.status(500).json({
      error: 'Failed to connect to backend',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
