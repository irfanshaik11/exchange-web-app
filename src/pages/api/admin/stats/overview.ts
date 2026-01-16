/**
 * Admin Stats Overview - Proxies to backend
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/admin/stats/overview`, {
      method: 'GET',
      headers: {
        Cookie: req.headers.cookie || '',
      },
    });

    if (response.status === 401) {
      return res.status(401).json({ error: 'Unauthorized', code: 'ADMIN_AUTH_REQUIRED' });
    }

    const data = await response.json();

    res.setHeader('Cache-Control', 'private, max-age=5');
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('[Admin Stats] Proxy error:', error);
    return res.status(500).json({
      error: 'Failed to fetch admin stats',
      message: error instanceof Error ? error.message : 'Backend connection failed',
    });
  }
}
