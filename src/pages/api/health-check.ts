import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL parameter required' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });
    clearTimeout(timeout);

    const contentType = response.headers.get('content-type');
    let data: unknown;

    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return res.status(200).json({
      status: response.ok ? 'healthy' : 'unhealthy',
      statusCode: response.status,
      responseTime: Date.now(),
      data,
    });
  } catch (error) {
    return res.status(200).json({
      status: 'unhealthy',
      statusCode: 0,
      responseTime: Date.now(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
