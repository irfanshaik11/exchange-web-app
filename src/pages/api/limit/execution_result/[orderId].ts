import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * API route for getting limit order execution results
 *
 * This is a stub until the backend limit orders service is implemented.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
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

  const { orderId } = req.query;

  // TODO: Proxy to backend limit orders service when available
  return res.status(404).json({
    error: 'Not found',
    code: 'NOT_FOUND',
    message: `Order ${orderId} not found`
  });
}
