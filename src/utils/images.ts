export function normalizeImageUrl(src?: string | null): string | null {
  if (!src) return null;
  try {
    // Pass through relative paths (starting with /)
    if (src.startsWith('/')) {
      return src;
    }
    
    // Unwrap Next.js image proxy URLs (e.g., pump.fun/_next/image?url=...)
    try {
      const u = new URL(src);
      if (u.pathname.startsWith('/_next/image') && u.searchParams.get('url')) {
        src = u.searchParams.get('url') || src;
      }
    } catch {}
    
    // Force https for http URLs (most hosts support TLS)
    if (src.startsWith('http://')) {
      src = src.replace(/^http:\/\//i, 'https://');
    }
    // Handle ipfs://CID or ipfs://ipfs/CID
    if (src.startsWith('ipfs://')) {
      const cid = src.replace('ipfs://', '').replace(/^ipfs\//, '');
      return `https://cloudflare-ipfs.com/ipfs/${cid}`;
    }
    // Prefer Cloudflare IPFS over slower gateways
    if (src.startsWith('https://ipfs.io/ipfs/')) {
      return src.replace('https://ipfs.io/ipfs/', 'https://cloudflare-ipfs.com/ipfs/');
    }
    if (src.startsWith('https://gateway.pinata.cloud/ipfs/')) {
      return src.replace('https://gateway.pinata.cloud/ipfs/', 'https://cloudflare-ipfs.com/ipfs/');
    }
    if (src.includes('mypinata.cloud/ipfs/')) {
      return src.replace(/https?:\/\/[^/]*mypinata\.cloud\/ipfs\//, 'https://cloudflare-ipfs.com/ipfs/');
    }
    if (src.startsWith('https://nftstorage.link/ipfs/')) {
      return src.replace('https://nftstorage.link/ipfs/', 'https://cloudflare-ipfs.com/ipfs/');
    }
    if (src.startsWith('https://cf-ipfs.com/ipfs/')) {
      return src.replace('https://cf-ipfs.com/ipfs/', 'https://cloudflare-ipfs.com/ipfs/');
    }
    if (src.startsWith('https://infura-ipfs.io/ipfs/')) {
      return src.replace('https://infura-ipfs.io/ipfs/', 'https://cloudflare-ipfs.com/ipfs/');
    }
    if (src.startsWith('https://ipfs.infura.io/ipfs/')) {
      return src.replace('https://ipfs.infura.io/ipfs/', 'https://cloudflare-ipfs.com/ipfs/');
    }
    if (src.startsWith('https://gateway.ipfs.io/ipfs/')) {
      return src.replace('https://gateway.ipfs.io/ipfs/', 'https://cloudflare-ipfs.com/ipfs/');
    }
    // Arweave and other https URLs pass through
    return src;
  } catch {
    return src;
  }
}

export function withImageFallback(primary?: string | null, fallback?: string | null): string | null {
  return normalizeImageUrl(primary) || normalizeImageUrl(fallback) || null;
}

// Extract a usable image URL from varied metadata shapes
export function extractMetaImage(meta: any): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const candidates: any[] = [];
  // Common fields
  candidates.push(meta.image, meta.image_url, meta.logo, meta.icon, meta.imageUri, meta.img, meta.thumbnail);
  // Nested properties
  if (meta.properties) {
    const p = meta.properties;
    candidates.push(p.image, p.image_url, p.logo, p.icon, p.thumbnail);
  }
  // Some formats put files under meta.properties.files[0].uri
  try {
    const files = meta.properties?.files;
    if (Array.isArray(files) && files.length) {
      if (typeof files[0] === 'string') candidates.push(files[0]);
      if (files[0]?.uri) candidates.push(files[0].uri);
    }
  } catch {}
  // First non-empty string wins
  for (const v of candidates) {
    if (typeof v === 'string' && v.trim()) {
      return normalizeImageUrl(v.trim());
    }
  }
  return null;
}

/**
 * Check if a URL appears to be an image URL (not JSON, HTML, etc.)
 */
function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  try {
    // Reject JSON files
    if (url.endsWith('.json') || url.includes('.json?')) {
      return false;
    }
    
    // Reject invalid IP addresses (they should use proper domains)
    if (/^https?:\/\/(\d{1,3}\.){3}\d{1,3}/.test(url)) {
      // Allow localhost for development, but reject other IPs
      if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
        return false;
      }
    }
    
    // Accept relative paths that start with / and have image extensions
    if (url.startsWith('/')) {
      const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp'];
      const hasImageExtension = imageExtensions.some(ext => 
        url.toLowerCase().includes(ext) || url.toLowerCase().includes(ext + '?')
      );
      if (hasImageExtension) {
        return true;
      }
    }
    
    // Reject non-HTTP/HTTPS protocols
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('ipfs://')) {
      return false;
    }
    
    // Accept IPFS URLs
    if (url.startsWith('ipfs://') || url.includes('/ipfs/')) {
      return true;
    }
    
    // Check for common image extensions
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp'];
    const hasImageExtension = imageExtensions.some(ext => 
      url.toLowerCase().includes(ext) || url.toLowerCase().includes(ext + '?')
    );
    
    // If it has an image extension, it's valid
    if (hasImageExtension) {
      return true;
    }
    
    // For URLs without extensions, check if they're from known image hosts
    // This allows URLs like https://cloudflare-ipfs.com/ipfs/Qm... without extension
    const knownImageHosts = [
      'ipfs.io', 'cloudflare-ipfs.com', 'gateway.pinata.cloud',
      'token-media.defined.fi', 'images.pump.fun', 'pump.fun',
      'pbs.twimg.com', 'twimg.com', 'cdn.pump.fun',
      'bluey.tv', 'www.bluey.tv', // Add Bluey image host
      'storage.nadapp.net', 'nadapp.net' // Monad token image storage
    ];
    
    if (knownImageHosts.some(host => url.includes(host))) {
      return true;
    }
    
    // If no extension and not from known image host, reject it
    // This prevents JSON/metadata files from being treated as images
    return false;
  } catch {
    return false;
  }
}

/**
 * Extract image URL from token data, checking multiple possible field names
 * This ensures we catch image fields from stream data, HTTP data, and various API formats
 * Priority order: image, uri, logo, imageUrl, logoUrl, image_url, logo_url
 */
export function extractTokenImage(token: any): string | null {
  if (!token || typeof token !== 'object') return null;
  
  // Check all possible image field names in priority order
  const imageFields = [
    token.image,
    token.uri,
    token.logo,
    token.imageUrl,
    token.logoUrl,
    token.image_url,
    token.logo_url,
    token.icon,
    token.thumbnail,
  ];
  
  // Return first non-empty string value that appears to be a valid image URL
  for (const value of imageFields) {
    if (typeof value === 'string' && value.trim()) {
      const trimmed = value.trim();
      
      // Validate that it looks like an image URL (not JSON, etc.)
      if (!isValidImageUrl(trimmed)) {
        continue; // Skip this field, try next one
      }
      
      const normalized = normalizeImageUrl(trimmed);
      // Only return if normalization succeeded (not null or empty)
      if (normalized && isValidImageUrl(normalized)) {
        return normalized;
      }
      // If normalization returned null/empty but original was valid, return original
      if (isValidImageUrl(trimmed)) {
        return trimmed;
      }
    }
  }
  
  return null;
}
