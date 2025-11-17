import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';

/**
 * Logs out the user from Twitter authentication
 * Clears all Twitter-related cookies
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Clear all Twitter authentication cookies
    const clearCookies = [
      serialize('twitter_user', '', { maxAge: 0, path: '/' }),
      serialize('twitter_access_token', '', { maxAge: 0, path: '/' }),
      serialize('twitter_refresh_token', '', { maxAge: 0, path: '/' }),
    ];

    res.setHeader('Set-Cookie', clearCookies);

    return res.status(200).json({
      success: true,
      message: 'Successfully logged out from Twitter',
    });
  } catch (error) {
    console.error('Error logging out from Twitter:', error);
    return res.status(500).json({
      error: 'Failed to logout',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}





