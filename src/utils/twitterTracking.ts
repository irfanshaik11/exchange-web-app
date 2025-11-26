/**
 * Twitter Tracking Utilities
 * Provides functions to track Twitter accounts and fetch their tweets
 */

import { env } from '../env';

// Get wallet tracker backend URL
const getWalletTrackerUrl = () => {
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_WALLET_TRACKER_URL || '';
  }
  return env.NEXT_PUBLIC_WALLET_TRACKER_URL || '';
};

const WALLET_TRACKER_API_URL = getWalletTrackerUrl();

// Database model - minimal storage
export interface TwitterAccountDb {
  id: string;
  username: string;
  createdAt: string;
  ownerId?: string | null;
}

// Full model with fetched Twitter data
export interface TwitterAccount {
  id: string;
  username: string;
  name: string;
  twitterId?: string;
  profileImageUrl?: string;
  description?: string;
  followers?: number;
  createdAt: string;
  ownerId?: string | null;
}

export interface Tweet {
  id: string;
  text: string;
  authorId: string;
  authorUsername: string;
  authorName: string;
  authorProfileImage?: string;
  createdAt: string;
  likeCount?: number;
  retweetCount?: number;
  replyCount?: number;
  url?: string;
  images?: string[];
}

/**
 * Add a Twitter account to track
 */
export async function addTrackedTwitterAccount(
  username: string,
  ownerId?: string | null
): Promise<TwitterAccountDb> {
  try {
    // First, validate the username exists on Twitter
    const userInfo = await getTwitterUserInfo(username);
    
    if (!userInfo) {
      throw new Error('Twitter user not found');
    }

    // Add to backend (only username)
    const response = await fetch(`${WALLET_TRACKER_API_URL}/api/twitter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: userInfo.username, // Use normalized username from Twitter
        userId: ownerId || undefined,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || 'Failed to add Twitter account';
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.twitterAccount;
  } catch (error: any) {
    console.error('Error adding Twitter account:', error);
    throw error;
  }
}

/**
 * Remove a tracked Twitter account
 */
export async function removeTrackedTwitterAccount(
  username: string,
  ownerId?: string | null
): Promise<void> {
  try {
    const url = ownerId
      ? `${WALLET_TRACKER_API_URL}/api/twitter/${encodeURIComponent(username)}?userId=${encodeURIComponent(ownerId)}`
      : `${WALLET_TRACKER_API_URL}/api/twitter/${encodeURIComponent(username)}`;

    const response = await fetch(url, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || 'Failed to remove Twitter account';
      throw new Error(errorMessage);
    }
  } catch (error: any) {
    console.error('Error removing Twitter account:', error);
    throw error;
  }
}

/**
 * Get all tracked Twitter accounts (from database)
 */
export async function getTrackedTwitterAccountsDb(ownerId?: string | null): Promise<TwitterAccountDb[]> {
  try {
    const url = ownerId
      ? `${WALLET_TRACKER_API_URL}/api/twitter?userId=${encodeURIComponent(ownerId)}`
      : `${WALLET_TRACKER_API_URL}/api/twitter`;

    const response = await fetch(url);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Failed to fetch Twitter accounts:', errorData);
      return [];
    }

    const accounts = await response.json();
    return accounts;
  } catch (error) {
    console.error('Error getting tracked Twitter accounts:', error);
    return [];
  }
}

/**
 * Get all tracked Twitter accounts with enriched data from Twitter API
 */
export async function getTrackedTwitterAccounts(ownerId?: string | null): Promise<TwitterAccount[]> {
  try {
    // Get stored accounts (just usernames)
    const dbAccounts = await getTrackedTwitterAccountsDb(ownerId);
    
    if (dbAccounts.length === 0) {
      return [];
    }

    // Fetch fresh user info for each account
    const enrichedAccounts = await Promise.all(
      dbAccounts.map(async (dbAccount) => {
        try {
          const userInfo = await getTwitterUserInfo(dbAccount.username);
          
          if (userInfo) {
            return {
              ...dbAccount,
              name: userInfo.name,
              twitterId: userInfo.id,
              profileImageUrl: userInfo.profileImageUrl,
              description: userInfo.description,
              followers: userInfo.followers,
            };
          }
          
          // If Twitter API fails, return basic info
          return {
            ...dbAccount,
            name: dbAccount.username,
            twitterId: undefined,
            profileImageUrl: undefined,
            description: undefined,
            followers: undefined,
          };
        } catch (error) {
          console.error(`Failed to fetch info for @${dbAccount.username}:`, error);
          // Return basic info on error
          return {
            ...dbAccount,
            name: dbAccount.username,
            twitterId: undefined,
            profileImageUrl: undefined,
            description: undefined,
            followers: undefined,
          };
        }
      })
    );

    return enrichedAccounts;
  } catch (error) {
    console.error('Error getting tracked Twitter accounts:', error);
    return [];
  }
}

/**
 * Get Twitter user info by username
 */
export async function getTwitterUserInfo(username: string): Promise<TwitterAccount | null> {
  try {
    const response = await fetch(`${WALLET_TRACKER_API_URL}/api/twitter/user-info?username=${encodeURIComponent(username)}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || error.message || 'Failed to fetch Twitter user info');
    }

    const data = await response.json();
    // Backend returns { ok: true, ...userInfo }, so we need to extract the user info
    if (data.ok) {
      const { ok, ...userInfo } = data;
      return userInfo;
    }
    return data;
  } catch (error: any) {
    console.error('Error fetching Twitter user info:', error);
    throw error;
  }
}

/**
 * Get tweets from tracked accounts
 */
export async function getTwitterFeed(
  usernames: string[],
  maxResults: number = 20
): Promise<Tweet[]> {
  try {
    if (usernames.length === 0) {
      return [];
    }

    const response = await fetch(`${WALLET_TRACKER_API_URL}/api/twitter/feed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ usernames, maxResults }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || error.message || 'Failed to fetch Twitter feed');
    }

    const data = await response.json();
    // Backend returns { ok: true, tweets: [...] }
    return data.tweets || [];
  } catch (error: any) {
    console.error('Error fetching Twitter feed:', error);
    return [];
  }
}

/**
 * Get tweets from a specific user
 */
export async function getUserTweets(
  username: string,
  maxResults: number = 20
): Promise<Tweet[]> {
  try {
    const response = await fetch(
      `${WALLET_TRACKER_API_URL}/api/twitter/user-tweets?username=${encodeURIComponent(username)}&maxResults=${maxResults}`
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || error.message || 'Failed to fetch user tweets');
    }

    const data = await response.json();
    // Backend returns { ok: true, tweets: [...] }
    return data.tweets || [];
  } catch (error: any) {
    console.error('Error fetching user tweets:', error);
    return [];
  }
}

