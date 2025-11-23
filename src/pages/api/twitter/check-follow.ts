import type { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'cookie';

/**
 * Check if authenticated user follows a specific account
 * Based on Twitter API v2 Follows Lookup endpoints
 * https://github.com/xdevplatform/Twitter-API-v2-sample-code/tree/main/Follows-Lookup
 * 
 * Query parameters:
 * - username: Twitter username to check (e.g., "narrative_hq")
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username } = req.query;

    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'Username parameter is required' });
    }

    // Get access token from cookies
    const cookies = parse(req.headers.cookie || '');
    const accessToken = cookies.twitter_access_token;
    const userCookie = cookies.twitter_user;

    if (!accessToken || !userCookie) {
      return res.status(401).json({ 
        error: 'Not authenticated',
        following: false 
      });
    }

    // Parse user data to get user ID
    const user = JSON.parse(userCookie);
    const userId = user.id;

    // First, get the target user's ID by username
    const userLookupResponse = await fetch(
      `https://api.twitter.com/2/users/by/username/${username}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!userLookupResponse.ok) {
      const error = await userLookupResponse.text();
      console.error('Failed to lookup user:', error);
      return res.status(200).json({ following: false });
    }

    const userData = await userLookupResponse.json();
    const targetUserId = userData.data?.id;

    if (!targetUserId) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    // Check if authenticated user follows the target user
    // API endpoint: GET /2/users/:id/following
    const followingResponse = await fetch(
      `https://api.twitter.com/2/users/${userId}/following?max_results=1000`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!followingResponse.ok) {
      const error = await followingResponse.text();
      console.error('Failed to check following:', error);
      return res.status(200).json({ following: false });
    }

    const followingData = await followingResponse.json();
    const followingList = followingData.data || [];

    // Check if target user is in the following list
    const isFollowing = followingList.some((followedUser: any) => followedUser.id === targetUserId);

    return res.status(200).json({
      following: isFollowing,
      targetUser: {
        id: targetUserId,
        username: username,
      },
    });
  } catch (error) {
    console.error('Error checking follow status:', error);
    return res.status(500).json({
      error: 'Failed to check follow status',
      details: error instanceof Error ? error.message : 'Unknown error',
      following: false,
    });
  }
}





