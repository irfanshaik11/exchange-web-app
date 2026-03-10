import type { NextApiRequest, NextApiResponse } from 'next';
import { parse, serialize } from 'cookie';
import {
  exchangeCodeForToken,
  getTwitterUser,
} from '../../../utils/twitterAuth';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Handles Twitter OAuth 2.0 callback
 * 
 * This endpoint is called by Twitter after user authorization.
 * It exchanges the authorization code for an access token and retrieves user info.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    isDev && console.log('[Twitter OAuth] Callback received');
    isDev && console.log('[Twitter OAuth] Query params:', {
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
      
      res.redirect(
        `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}twitter_error=${encodeURIComponent(userFriendlyError)}`
      );
      return;
    }

    // Validate required parameters
    if (!code || typeof code !== 'string') {
      res.redirect('/?twitter_error=missing_code');
      return;
    }

    if (!state || typeof state !== 'string') {
      res.redirect('/?twitter_error=missing_state');
      return;
    }

    // Get stored values from cookies
    const cookies = parse(req.headers.cookie || '');
    const storedState = cookies.twitter_oauth_state;
    const codeVerifier = cookies.twitter_oauth_code_verifier;
    const returnUrl = cookies.twitter_oauth_return_url || '/';

    // Verify state parameter (CSRF protection)
    if (!storedState || state !== storedState) {
      res.redirect('/?twitter_error=invalid_state');
      return;
    }

    if (!codeVerifier) {
      res.redirect('/?twitter_error=missing_code_verifier');
      return;
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

    // Try to save Twitter info to database if user is logged in
    // We'll also save it from the frontend, but this ensures it's saved even if frontend fails
    const tokenCookie = cookies.token;
    if (tokenCookie && process.env.NEXT_PUBLIC_BACKEND_URL) {
      try {
        // Save Twitter info to waitlist directly (frontend will also save it with user context)
        // This is a best-effort attempt - frontend save is more reliable
        await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/waitlist/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tokenCookie}`,
          },
          body: JSON.stringify({
            twitterId: user.id,
            twitterUsername: user.username,
          }),
        }).catch(err => {
          // Silently fail - frontend will handle saving with proper user context
          isDev && console.log('[Twitter OAuth] Could not save Twitter info from callback (frontend will handle):', err.message);
        });
      } catch (error) {
        // Silently fail - frontend will handle saving with proper user context
        isDev && console.log('[Twitter OAuth] Could not save Twitter info from callback (frontend will handle)');
      }
    }

    // Redirect back to the return URL with success parameter
    // Ensure we redirect to show the quest page (waitlist modal) instead of referral access page
    const redirectUrl = returnUrl.includes('?') 
      ? `${returnUrl}&twitter_success=true&show_quests=true`
      : `${returnUrl}?twitter_success=true&show_quests=true`;
    
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Error in Twitter OAuth callback:', error);
    const returnUrl = req.cookies.twitter_oauth_return_url || '/';
    res.redirect(
      `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}twitter_error=${encodeURIComponent('authentication_failed')}`
    );
  }
}
