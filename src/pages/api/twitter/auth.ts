import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';
import { generateState, generatePKCE, buildAuthorizationUrl } from '../../../utils/twitterAuth';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Initiates Twitter OAuth 2.0 flow
 * 
 * Query parameters:
 * - return_url: Optional URL to redirect to after successful authentication
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Log environment check (without exposing secrets)
    isDev && console.log('[Twitter OAuth] Initiating auth flow...');
    isDev && console.log('[Twitter OAuth] Environment check:', {
      hasClientId: !!process.env.X_CLIENT_ID,
      hasClientSecret: !!process.env.X_CLIENT_SECRET,
      hasRedirectUri: !!process.env.X_REDIRECT_URI,
      redirectUri: process.env.X_REDIRECT_URI,
      nodeEnv: process.env.NODE_ENV,
    });

    // Validate environment variables
    if (!process.env.X_CLIENT_ID || !process.env.X_CLIENT_SECRET || !process.env.X_REDIRECT_URI) {
      console.error('[Twitter OAuth] Missing required environment variables');
      return res.status(500).json({ 
        error: 'Twitter OAuth not properly configured',
        details: 'Missing required environment variables. Please check X_CLIENT_ID, X_CLIENT_SECRET, and X_REDIRECT_URI.'
      });
    }

    // Generate state and PKCE parameters
    const state = generateState();
    const { codeVerifier, codeChallenge } = generatePKCE();
    
    // Get return URL from query parameter
    const returnUrl = req.query.return_url as string | undefined;

    // Store state, code verifier, and return URL in secure HTTP-only cookies
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 600, // 10 minutes
      path: '/',
    };

    const cookies = [
      serialize('twitter_oauth_state', state, cookieOptions),
      serialize('twitter_oauth_code_verifier', codeVerifier, cookieOptions),
    ];

    if (returnUrl) {
      cookies.push(serialize('twitter_oauth_return_url', returnUrl, cookieOptions));
    }

    res.setHeader('Set-Cookie', cookies);

    // Build authorization URL
    const authUrl = buildAuthorizationUrl(state, codeChallenge);
    
    isDev && console.log('[Twitter OAuth] Redirecting to Twitter with URL:', authUrl);

    // Redirect to Twitter authorization page
    res.redirect(authUrl);
  } catch (error) {
    console.error('[Twitter OAuth] Error initiating auth:', error);
    res.status(500).json({ 
      error: 'Failed to initiate Twitter authentication',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
