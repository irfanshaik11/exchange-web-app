/**
 * Admin Logout - Clears the session cookie on the frontend domain
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Clear the cookie on the frontend domain by setting it with maxAge 0
  res.setHeader(
    'Set-Cookie',
    serialize('admin_session', '', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 0, // Expires immediately
      secure: process.env.NODE_ENV === 'production',
    })
  );

  return res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
}
