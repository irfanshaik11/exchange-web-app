/**
 * Admin Reward Earnings - Proxies to backend
 * Per-user reward earnings with pagination, search, and sorting
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Forward query params (limit, offset, search, sortBy, sortOrder)
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (value && typeof value === 'string') {
        params.set(key, value);
      }
    }

    const url = `${BACKEND_URL}/api/admin/stats/rewards?${params.toString()}`;
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

    res.setHeader('Cache-Control', 'private, max-age=10');
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('[Admin Rewards] Proxy error:', error);
    return res.status(500).json({
      error: 'Failed to fetch reward earnings',
      message: error instanceof Error ? error.message : 'Backend connection failed',
    });
  }
}
