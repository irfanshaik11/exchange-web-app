import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * API route for fetching similar tokens
 *
 * This is a stub that returns an empty array until the backend service is implemented.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { mint } = req.query;

  if (!mint || typeof mint !== 'string') {
    return res.status(400).json({ error: 'Missing mint parameter' });
  }

  // TODO: Implement similar tokens lookup
  // For now, return empty array to prevent page crash
  return res.status(200).json({
    tokens: [],
    message: 'Similar tokens feature coming soon'
  });
}
