import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * API route for fetching user's limit orders
 *
 * This is a stub that returns an empty array until the backend limit orders
 * service is implemented. This prevents the trade page from crashing.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check for authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
      message: 'Authentication required'
    });
  }

  // TODO: Proxy to backend limit orders service when available
  // For now, return empty orders array to prevent page crash
  return res.status(200).json({
    orders: [],
    message: 'Limit orders feature coming soon'
  });
}
