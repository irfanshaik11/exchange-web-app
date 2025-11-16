import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { mint, name, symbol } = req.query;

    if (!mint || !name || !symbol) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Try to get token image from the backend service
    const goBase = process.env.NEXT_PUBLIC_GO_SERVICE_URL || 'http://localhost:8080';
    const backendUrl = `${goBase}/v1/token/${mint}/image`;
    
    console.log(`[getTokenImage] Fetching image for ${name} (${symbol}) from: ${backendUrl}`);
    
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      // Add timeout
      signal: AbortSignal.timeout(5000)
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`[getTokenImage] Found image for ${name}:`, data.image ? 'Yes' : 'No');
      return res.json({
        success: true,
        image: data.image || data.logo || data.uri,
        uri: data.uri,
        source: 'backend'
      });
    } else {
      console.log(`[getTokenImage] Backend returned ${response.status} for ${name}`);
      
      // Fallback: try to generate a placeholder or search for image
      const fallbackImage = generateFallbackImage(name as string, symbol as string);
      
      return res.json({
        success: true,
        image: fallbackImage,
        uri: null,
        source: 'fallback'
      });
    }
  } catch (error) {
    console.error('[getTokenImage] Error:', error);
    
    // Fallback to generated image
    const { name, symbol } = req.query;
    const fallbackImage = generateFallbackImage(name as string, symbol as string);
    
    return res.json({
      success: true,
      image: fallbackImage,
      uri: null,
      source: 'fallback'
    });
  }
}

function generateFallbackImage(name: string, symbol: string): string {
  // Generate a simple placeholder image URL
  // You can use services like:
  // 1. UI Avatars: https://ui-avatars.com/api/?name=TOKEN&background=random
  // 2. DiceBear: https://api.dicebear.com/7.x/identicon/svg?seed=TOKEN
  // 3. Gravatar: https://www.gravatar.com/avatar/HASH?s=64&d=identicon
  
  const encodedName = encodeURIComponent(name);
  const encodedSymbol = encodeURIComponent(symbol);
  
  // Use UI Avatars for a nice looking placeholder
  return `https://ui-avatars.com/api/?name=${encodedSymbol}&background=random&color=fff&size=64&bold=true&format=png`;
}


















