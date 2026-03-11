/**
 * Admin Analytics Stats - Proxies to backend
 * Tier breakdown, weekly volume, honors distribution, conversion rate, top traders, rewards summary
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Forward query params (e.g., weeks for volume chart range)
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (value && typeof value === 'string') {
        params.set(key, value);
      }
    }
    const qs = params.toString();
    const url = `${BACKEND_URL}/api/admin/stats/analytics${qs ? `?${qs}` : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Cookie: req.headers.cookie || '',
      },
    });

    if (response.status === 401) {
      return res.status(401).json({ error: 'Unauthorized', code: 'ADMIN_AUTH_REQUIRED' });
    }

    const data = await response.json();

    res.setHeader('Cache-Control', 'private, max-age=30');
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('[Admin Analytics] Proxy error:', error);
    return res.status(500).json({
      error: 'Failed to fetch analytics stats',
      message: error instanceof Error ? error.message : 'Backend connection failed',
    });
  }
}
