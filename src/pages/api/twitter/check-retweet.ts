import type { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'cookie';

/**
 * Check if authenticated user retweeted content from a specific user
 * Based on Twitter API v2 User Tweet Timeline endpoints
 * https://github.com/xdevplatform/Twitter-API-v2-sample-code/tree/main/User-Tweet-Timeline
 * 
 * Query parameters:
 * - tweet_id: Specific tweet ID to check (optional)
 * - username: Username to check retweets from (optional)
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
        retweeted: false 
      });
    }

    // Parse user data to get user ID
    const user = JSON.parse(userCookie);
    const userId = user.id;

    // Get user's tweets (including retweets)
    // API endpoint: GET /2/users/:id/tweets
    const tweetsResponse = await fetch(
      `https://api.twitter.com/2/users/${userId}/tweets?max_results=100&tweet.fields=referenced_tweets,author_id`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!tweetsResponse.ok) {
      const error = await tweetsResponse.text();
      console.error('Failed to get user tweets:', error);
      return res.status(200).json({ retweeted: false });
    }

    const tweetsData = await tweetsResponse.json();
    const tweets = tweetsData.data || [];

    // Filter for retweets only
    const retweets = tweets.filter((tweet: any) => 
      tweet.referenced_tweets?.some((ref: any) => ref.type === 'retweeted')
    );

    // If checking specific tweet ID
    if (tweet_id && typeof tweet_id === 'string') {
      const hasRetweeted = retweets.some((tweet: any) =>
        tweet.referenced_tweets?.some((ref: any) => 
          ref.type === 'retweeted' && ref.id === tweet_id
        )
      );
      return res.status(200).json({
        retweeted: hasRetweeted,
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

        // Get recent tweets from target user
        const targetTweetsResponse = await fetch(
          `https://api.twitter.com/2/users/${targetUserId}/tweets?max_results=10`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        if (targetTweetsResponse.ok) {
          const targetTweetsData = await targetTweetsResponse.json();
          const targetTweets = targetTweetsData.data || [];
          const targetTweetIds = targetTweets.map((t: any) => t.id);

          // Check if user retweeted any of these tweets
          const hasRetweetedFromUser = retweets.some((tweet: any) =>
            tweet.referenced_tweets?.some((ref: any) => 
              ref.type === 'retweeted' && targetTweetIds.includes(ref.id)
            )
          );

          return res.status(200).json({
            retweeted: hasRetweetedFromUser,
            username: username,
          });
        }
      }
    }

    // Return general retweet status
    return res.status(200).json({
      retweeted: retweets.length > 0,
      totalRetweets: retweets.length,
    });
  } catch (error) {
    console.error('Error checking retweet status:', error);
    return res.status(500).json({
      error: 'Failed to check retweet status',
      details: error instanceof Error ? error.message : 'Unknown error',
      retweeted: false,
    });
  }
}





