/**
 * Admin Login - Proxies to backend
 *
 * Sets the session cookie on the frontend domain (not the backend domain)
 * to ensure cross-origin requests work properly in production.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();

    // If login was successful, set the cookie on the frontend domain
    if (response.ok && data.token) {
      const isProduction = process.env.NODE_ENV === 'production';

      // Set the cookie from the frontend (same domain as the user's browser)
      res.setHeader(
        'Set-Cookie',
        serialize('admin_session', data.token, {
          path: '/',
          httpOnly: true,
          sameSite: 'lax', // 'lax' allows same-site navigation, 'strict' can break redirects
          maxAge: SESSION_DURATION_MS / 1000, // maxAge is in seconds
          secure: isProduction,
        })
      );
    }

    return res.status(response.status).json(data);
  } catch (error) {
    console.error('[Admin Login] Proxy error:', error);
    return res.status(500).json({
      error: 'Failed to connect to backend',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
