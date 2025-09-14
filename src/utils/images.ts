export function normalizeImageUrl(src?: string | null): string | null {
  if (!src) return null;
  try {
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
