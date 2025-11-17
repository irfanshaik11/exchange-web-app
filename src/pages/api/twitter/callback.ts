import type { NextApiRequest, NextApiResponse } from 'next';
import { parse, serialize } from 'cookie';
import {
  exchangeCodeForToken,
  getTwitterUser,
} from '../../../utils/twitterAuth';

/**
 * Handles Twitter OAuth 2.0 callback
 * 
 * This endpoint is called by Twitter after user authorization.
 * It exchanges the authorization code for an access token and retrieves user info.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[Twitter OAuth] Callback received');
    console.log('[Twitter OAuth] Query params:', { 
      hasCode: !!req.query.code, 
      hasState: !!req.query.state,
      hasError: !!req.query.error,
      error: req.query.error,
      errorDescription: req.query.error_description
    });

    const { code, state, error, error_description } = req.query;

    // Check for OAuth errors from Twitter
    if (error) {
      console.error('[Twitter OAuth] Twitter returned error:', error, error_description);
      const returnUrl = req.cookies.twitter_oauth_return_url || '/';
      
      // Provide more detailed error messages
      let userFriendlyError = error_description as string || error as string;
      if (error === 'access_denied') {
        userFriendlyError = 'You cancelled the authorization. Please try again if you want to link your Twitter account.';
      }
      
      return res.redirect(
        `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}twitter_error=${encodeURIComponent(userFriendlyError)}`
      );
    }

    // Validate required parameters
    if (!code || typeof code !== 'string') {
      return res.redirect('/?twitter_error=missing_code');
    }

    if (!state || typeof state !== 'string') {
      return res.redirect('/?twitter_error=missing_state');
    }

    // Get stored values from cookies
    const cookies = parse(req.headers.cookie || '');
    const storedState = cookies.twitter_oauth_state;
    const codeVerifier = cookies.twitter_oauth_code_verifier;
    const returnUrl = cookies.twitter_oauth_return_url || '/';

    // Verify state parameter (CSRF protection)
    if (!storedState || state !== storedState) {
      return res.redirect('/?twitter_error=invalid_state');
    }

    if (!codeVerifier) {
      return res.redirect('/?twitter_error=missing_code_verifier');
    }

    // Exchange code for access token
    const tokens = await exchangeCodeForToken(code, codeVerifier);

    // Get user information
    const user = await getTwitterUser(tokens.access_token);

    // Store user info and tokens in secure HTTP-only cookies
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    };

    const authCookies = [
      serialize('twitter_user', JSON.stringify(user), cookieOptions),
      serialize('twitter_access_token', tokens.access_token, cookieOptions),
    ];

    if (tokens.refresh_token) {
      authCookies.push(
        serialize('twitter_refresh_token', tokens.refresh_token, cookieOptions)
      );
    }

    // Clear OAuth temporary cookies
    const clearCookies = [
      serialize('twitter_oauth_state', '', { ...cookieOptions, maxAge: 0 }),
      serialize('twitter_oauth_code_verifier', '', { ...cookieOptions, maxAge: 0 }),
      serialize('twitter_oauth_return_url', '', { ...cookieOptions, maxAge: 0 }),
    ];

    res.setHeader('Set-Cookie', [...authCookies, ...clearCookies]);

    // Redirect back to the return URL with success parameter
    res.redirect(
      `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}twitter_success=true`
    );
  } catch (error) {
    console.error('Error in Twitter OAuth callback:', error);
    const returnUrl = req.cookies.twitter_oauth_return_url || '/';
    res.redirect(
      `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}twitter_error=${encodeURIComponent('authentication_failed')}`
    );
  }
}
