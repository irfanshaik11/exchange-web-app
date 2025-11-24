import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Google OAuth callback handler for Turnkey
 * 
 * This endpoint handles the OAuth redirect from Google when using redirect flow
 * (openInPage: true). Turnkey's SDK will detect the callback and complete the flow.
 * 
 * We preserve all query parameters (code, state, etc.) and redirect to the app root
 * where Turnkey's SDK can process them.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, state, error, error_description } = req.query;

    // If there's an error from Google, redirect to home with error
    if (error) {
      console.error('[Google OAuth] Google returned error:', error, error_description);
      const errorParam = encodeURIComponent(error_description as string || error as string);
      return res.redirect(`/?google_error=${errorParam}`);
    }

    // Preserve all query parameters for Turnkey SDK to process
    // The SDK will detect the code and state in the URL and complete the OAuth flow
    const queryParams = new URLSearchParams();
    if (code) queryParams.set('code', code as string);
    if (state) queryParams.set('state', state as string);
    
    // Redirect to home page with query params
    // Turnkey SDK will automatically detect the code/state in the URL and complete the OAuth flow
    // The onOauthSuccess callback in LoginModal will be triggered automatically
    const redirectUrl = queryParams.toString() 
      ? `/?${queryParams.toString()}`
      : '/';
    
    console.log('[Google OAuth] Redirecting to:', redirectUrl);
    return res.redirect(redirectUrl);
  } catch (error) {
    console.error('Error in Google OAuth callback:', error);
    return res.redirect('/?google_error=callback_failed');
  }
}

