/**
 * Admin Referrals API - Proxies to backend
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Forward query params to backend
    const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
    const url = `${BACKEND_URL}/api/admin/stats/referrals${queryString ? `?${queryString}` : ''}`;

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

    res.setHeader('Cache-Control', 'private, max-age=5');
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('[Admin Referrals] Proxy error:', error);
    return res.status(500).json({
      error: 'Failed to fetch referrals',
      message: error instanceof Error ? error.message : 'Backend connection failed',
    });
  }
}
