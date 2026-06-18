import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveBnbTokenImage } from '~/utils/bnbTokenImage';
import { computeHashImageUrl } from '~/utils/imageHash';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const mint = typeof req.query.mint === 'string' ? req.query.mint.trim() : '';
  const protocol = typeof req.query.protocol === 'string' ? req.query.protocol : undefined;

  if (!mint) {
    return res.status(400).json({ error: 'mint parameter is required' });
  }

  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=600');

  try {
    const result = await resolveBnbTokenImage(mint, protocol);
    if (!result) {
      return res.status(404).json({ error: 'Image not found', mint, protocol: protocol ?? null });
    }

    const proxiedImage = result.image_url
      ? computeHashImageUrl(result.image_url, 64) ?? result.image_url
      : null;

    return res.status(200).json({
      mint,
      image_url: proxiedImage,
      uri: result.uri,
      name: result.name,
      symbol: result.symbol,
      source: result.source,
    });
  } catch (error) {
    console.error('[bnb-token/image] failed for', mint, error);
    return res.status(500).json({ error: 'Failed to resolve BNB token image' });
  }
}
