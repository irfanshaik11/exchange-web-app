import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Turnkey Session Creation Endpoint
 * 
 * This endpoint proxies session creation requests to the backend Turnkey proxy.
 * It allows the frontend to create Turnkey sessions after authentication.
 * 
 * The request body should contain:
 * - method: "createSession"
 * - params: Array of parameters for createSession
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
    const turnkeyProxyUrl = `${backendUrl}/api/turnkey`;

    // Forward the request to the backend Turnkey proxy
    const response = await fetch(turnkeyProxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        method: 'createSession',
        params: req.body.params || [],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Turnkey Session] Backend error:', errorText);
      return res.status(response.status).json({
        error: 'Failed to create session',
        details: errorText,
      });
    }

    const data = await response.json();
    
    // Log successful session creation
    console.log('[Turnkey Session] ✅ Session created successfully', {
      hasSession: !!data.session,
      organizationId: data.organizationId || data.session?.organizationId || 'N/A',
      userId: data.userId || data.session?.userId || 'N/A',
      timestamp: new Date().toISOString(),
    });
    
    if (data.session) {
      console.log('[Turnkey Session] 📋 Session details:', {
        sessionType: data.session.sessionType,
        organizationId: data.session.organizationId,
        userId: data.session.userId,
        expiry: data.session.expiry ? new Date(data.session.expiry * 1000).toISOString() : 'N/A',
        hasToken: !!data.session.token,
      });
    }
    
    return res.status(200).json(data);
  } catch (error: any) {
    console.error('Error creating Turnkey session:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error?.message || 'Unknown error',
    });
  }
}

