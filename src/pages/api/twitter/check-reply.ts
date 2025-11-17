import type { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'cookie';

/**
 * Check if authenticated user replied to content from a specific user
 * Based on Twitter API v2 User Tweet Timeline endpoints
 * https://github.com/xdevplatform/Twitter-API-v2-sample-code/tree/main/User-Tweet-Timeline
 * 
 * Query parameters:
 * - tweet_id: Specific tweet ID to check (optional)
 * - username: Username to check replies to (optional)
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
        replied: false 
      });
    }

    // Parse user data to get user ID
    const user = JSON.parse(userCookie);
    const userId = user.id;

    // Get user's tweets (including replies)
    // API endpoint: GET /2/users/:id/tweets
    const tweetsResponse = await fetch(
      `https://api.twitter.com/2/users/${userId}/tweets?max_results=100&tweet.fields=referenced_tweets,in_reply_to_user_id`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!tweetsResponse.ok) {
      const error = await tweetsResponse.text();
      console.error('Failed to get user tweets:', error);
      return res.status(200).json({ replied: false });
    }

    const tweetsData = await tweetsResponse.json();
    const tweets = tweetsData.data || [];

    // Filter for replies only
    const replies = tweets.filter((tweet: any) => 
      tweet.referenced_tweets?.some((ref: any) => ref.type === 'replied_to') ||
      tweet.in_reply_to_user_id
    );

    // If checking specific tweet ID
    if (tweet_id && typeof tweet_id === 'string') {
      const hasReplied = replies.some((tweet: any) =>
        tweet.referenced_tweets?.some((ref: any) => 
          ref.type === 'replied_to' && ref.id === tweet_id
        )
      );
      return res.status(200).json({
        replied: hasReplied,
        tweetId: tweet_id,
      });
    }

    // If checking by username
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

        // Check if user replied to any tweet from this user
        const hasRepliedToUser = replies.some(
          (tweet: any) => tweet.in_reply_to_user_id === targetUserId
        );

        return res.status(200).json({
          replied: hasRepliedToUser,
          username: username,
          replyCount: replies.filter((tweet: any) => 
            tweet.in_reply_to_user_id === targetUserId
          ).length,
        });
      }
    }

    // Return general reply status
    return res.status(200).json({
      replied: replies.length > 0,
      totalReplies: replies.length,
    });
  } catch (error) {
    console.error('Error checking reply status:', error);
    return res.status(500).json({
      error: 'Failed to check reply status',
      details: error instanceof Error ? error.message : 'Unknown error',
      replied: false,
    });
  }
}





