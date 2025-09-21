import type { NextApiRequest, NextApiResponse } from 'next';

interface UpdateImageRequest {
  mint: string;
  imageUrl: string;
  source: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { mint, imageUrl, source }: UpdateImageRequest = req.body;

    if (!mint || !imageUrl || !source) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate image URL
    if (!isValidImageUrl(imageUrl)) {
      return res.status(400).json({ error: 'Invalid image URL' });
    }

    // Update token image in database
    // This would typically update your database
    // For now, I'll show the structure you'd need
    
    const updateQuery = `
      UPDATE tokens 
      SET 
        logo = $1,
        updated_at = NOW()
      WHERE mint = $2
    `;

    // Note: You'll need to implement the actual database update here
    // This is a placeholder structure
    console.log(`Updating token ${mint} with image ${imageUrl} from ${source}`);
    
    // For demonstration, return success
    // Replace this with actual database update
    res.status(200).json({ 
      success: true, 
      message: `Token ${mint} updated with image from ${source}` 
    });
    
  } catch (error) {
    console.error('Error updating token image:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

function isValidImageUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    
    // Must be HTTPS
    if (parsedUrl.protocol !== 'https:') {
      return false;
    }
    
    // Check if it's a valid image URL
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
    const hasImageExtension = imageExtensions.some(ext => 
      parsedUrl.pathname.toLowerCase().endsWith(ext)
    );
    
    // Allow IPFS URLs and other image sources
    const isIpfsUrl = parsedUrl.hostname.includes('ipfs') || 
                     parsedUrl.pathname.startsWith('/ipfs/');
    
    return hasImageExtension || isIpfsUrl;
  } catch (error) {
    return false;
  }
}
