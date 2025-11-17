import type { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'cookie';
import type { TwitterUser } from '../../../utils/twitterAuth';

/**
 * Verifies if the user is authenticated with Twitter
 * 
 * Returns the authenticated user's information if logged in,
 * or an unauthenticated response if not.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const cookies = parse(req.headers.cookie || '');
    const userCookie = cookies.twitter_user;
    const accessToken = cookies.twitter_access_token;

    // Check if user is authenticated
    if (!userCookie || !accessToken) {
      return res.status(200).json({
        authenticated: false,
        user: null,
      });
    }

    // Parse user data
    let user: TwitterUser;
    try {
      user = JSON.parse(userCookie);
    } catch (parseError) {
      // Invalid user cookie, clear it
      res.setHeader('Set-Cookie', [
        'twitter_user=; Max-Age=0; Path=/',
        'twitter_access_token=; Max-Age=0; Path=/',
        'twitter_refresh_token=; Max-Age=0; Path=/',
      ]);
      return res.status(200).json({
        authenticated: false,
        user: null,
      });
    }

    // Return authenticated user info
    return res.status(200).json({
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        profile_image_url: user.profile_image_url,
      },
    });
  } catch (error) {
    console.error('Error verifying Twitter auth:', error);
    return res.status(500).json({
      error: 'Failed to verify authentication',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}





