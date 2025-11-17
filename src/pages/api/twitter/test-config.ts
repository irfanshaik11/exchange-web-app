import type { NextApiRequest, NextApiResponse } from 'next';
import { env } from '../../../env';

/**
 * Test endpoint to verify Twitter OAuth configuration
 * Visit: /api/twitter/test-config
 * 
 * This endpoint will show you if your environment variables are properly set
 * without exposing the actual secret values.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const config = {
      nodeEnv: process.env.NODE_ENV,
      hasClientId: !!env.X_CLIENT_ID,
      hasClientSecret: !!env.X_CLIENT_SECRET,
      hasRedirectUri: !!env.X_REDIRECT_URI,
      clientIdLength: env.X_CLIENT_ID?.length || 0,
      clientSecretLength: env.X_CLIENT_SECRET?.length || 0,
      redirectUri: env.X_REDIRECT_URI,
      // Show first/last few characters of client ID for verification (safe to expose)
      clientIdPreview: env.X_CLIENT_ID 
        ? `${env.X_CLIENT_ID.substring(0, 8)}...${env.X_CLIENT_ID.substring(env.X_CLIENT_ID.length - 4)}`
        : 'NOT SET',
    };

    const issues: string[] = [];
    
    if (!env.X_CLIENT_ID) {
      issues.push('❌ X_CLIENT_ID is not set');
    } else if (env.X_CLIENT_ID.length < 10) {
      issues.push('⚠️ X_CLIENT_ID seems too short (should be ~25+ characters)');
    }

    if (!env.X_CLIENT_SECRET) {
      issues.push('❌ X_CLIENT_SECRET is not set');
    } else if (env.X_CLIENT_SECRET.length < 10) {
      issues.push('⚠️ X_CLIENT_SECRET seems too short (should be ~50+ characters)');
    }

    if (!env.X_REDIRECT_URI) {
      issues.push('❌ X_REDIRECT_URI is not set');
    } else {
      // Validate redirect URI format
      if (!env.X_REDIRECT_URI.startsWith('http://') && !env.X_REDIRECT_URI.startsWith('https://')) {
        issues.push('⚠️ X_REDIRECT_URI should start with http:// or https://');
      }
      if (!env.X_REDIRECT_URI.includes('/api/twitter/callback')) {
        issues.push('⚠️ X_REDIRECT_URI should end with /api/twitter/callback');
      }
    }

    const status = issues.length === 0 ? 'ready' : 'configuration_incomplete';

    res.status(200).json({
      status,
      message: status === 'ready' 
        ? '✅ Twitter OAuth configuration looks good!' 
        : '⚠️ There are configuration issues',
      config,
      issues: issues.length > 0 ? issues : undefined,
      nextSteps: issues.length > 0 ? [
        '1. Check your .env.local file',
        '2. Make sure you have X_CLIENT_ID, X_CLIENT_SECRET, and X_REDIRECT_URI set',
        '3. Get OAuth 2.0 credentials from https://developer.twitter.com/en/portal/dashboard',
        '4. Restart your dev server after updating .env.local',
      ] : [
        '1. Verify the redirect URI matches EXACTLY in Twitter Developer Portal',
        '2. Check that OAuth 2.0 is enabled in your Twitter app settings',
        '3. Try the Twitter OAuth flow by clicking "Link Your Twitter"',
      ],
    });
  } catch (error) {
    console.error('Error testing Twitter config:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to test configuration',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}



