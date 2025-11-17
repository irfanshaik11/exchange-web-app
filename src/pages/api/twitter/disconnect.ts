import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';

/**
 * Disconnects/unlinks the Twitter account by clearing all Twitter-related cookies
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Clear all Twitter-related cookies
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      maxAge: 0, // Expire immediately
      path: '/',
    };

    const clearCookies = [
      serialize('twitter_user', '', cookieOptions),
      serialize('twitter_access_token', '', cookieOptions),
      serialize('twitter_refresh_token', '', cookieOptions),
      // Also clear any OAuth temporary cookies if they exist
      serialize('twitter_oauth_state', '', cookieOptions),
      serialize('twitter_oauth_code_verifier', '', cookieOptions),
      serialize('twitter_oauth_return_url', '', cookieOptions),
    ];

    res.setHeader('Set-Cookie', clearCookies);

    return res.status(200).json({
      success: true,
      message: 'Twitter account disconnected successfully',
    });
  } catch (error) {
    console.error('[Twitter Disconnect] Error:', error);
    return res.status(500).json({
      error: 'Failed to disconnect Twitter account',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

