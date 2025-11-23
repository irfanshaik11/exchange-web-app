import type { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'cookie';

/**
 * Check if authenticated user liked a specific tweet
 * Based on Twitter API v2 Likes Lookup endpoints
 * https://github.com/xdevplatform/Twitter-API-v2-sample-code/tree/main/Likes-Lookup
 * 
 * Query parameters:
 * - tweet_id: Tweet ID to check (optional)
 * - username: Username to check likes from their recent tweets (optional)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { tweet_id, username } = req.query;

    // Get access token from cookies
    const cookies = parse(req.headers.cookie || '');
    const accessToken = cookies.twitter_access_token;
    const userCookie = cookies.twitter_user;

    if (!accessToken || !userCookie) {
      return res.status(401).json({ 
        error: 'Not authenticated',
        liked: false 
      });
    }

    // Parse user data to get user ID
    const user = JSON.parse(userCookie);
    const userId = user.id;

    // Get user's liked tweets
    // API endpoint: GET /2/users/:id/liked_tweets
    const likedTweetsResponse = await fetch(
      `https://api.twitter.com/2/users/${userId}/liked_tweets?max_results=100&tweet.fields=author_id,created_at`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!likedTweetsResponse.ok) {
      const error = await likedTweetsResponse.text();
      console.error('Failed to get liked tweets:', error);
      return res.status(200).json({ liked: false });
    }

    const likedTweetsData = await likedTweetsResponse.json();
    const likedTweets = likedTweetsData.data || [];

    // If checking specific tweet ID
    if (tweet_id && typeof tweet_id === 'string') {
      const hasLiked = likedTweets.some((tweet: any) => tweet.id === tweet_id);
      return res.status(200).json({
        liked: hasLiked,
        tweetId: tweet_id,
      });
    }

    // If checking by username, get their user ID first
    if (username && typeof username === 'string') {
      const userLookupResponse = await fetch(
        `https://api.twitter.com/2/users/by/username/${username}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (userLookupResponse.ok) {
        const userData = await userLookupResponse.json();
        const targetUserId = userData.data?.id;

        // Check if user liked any tweet from this author
        const hasLikedFromUser = likedTweets.some(
          (tweet: any) => tweet.author_id === targetUserId
        );

        return res.status(200).json({
          liked: hasLikedFromUser,
          username: username,
          likedCount: likedTweets.filter((tweet: any) => tweet.author_id === targetUserId).length,
        });
      }
    }

    // Return general liked status
    return res.status(200).json({
      liked: likedTweets.length > 0,
      totalLiked: likedTweets.length,
    });
  } catch (error) {
    console.error('Error checking like status:', error);
    return res.status(500).json({
      error: 'Failed to check like status',
      details: error instanceof Error ? error.message : 'Unknown error',
      liked: false,
    });
  }
}





