import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * API route for creating limit orders
 *
 * This is a stub until the backend limit orders service is implemented.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
      message: 'Authentication required'
    });
  }

  // TODO: Proxy to backend limit orders service when available
  return res.status(503).json({
    error: 'Service unavailable',
    code: 'SERVICE_UNAVAILABLE',
    message: 'Limit orders feature coming soon'
  });
}
