export function normalizeImageUrl(src?: string | null): string | null {
  if (!src) return null;
  try {
    // Fix common double-protocol or prefixed glitches (e.g., "imaghttps://", "https://https://")
    src = src.replace(/imaghttps:\/\//gi, 'https://');
    src = src.replace(/https?:\/\/https?:\/\//gi, match => match.includes('https') ? 'https://' : 'http://');

    // Pass through relative paths (starting with /)
    if (src.startsWith('/')) {
      return src;
    }

    // Handle raw IPFS CIDs (Flap.SH stores images as raw CIDs)
    // IPFS CIDv0 starts with "Qm" (46 chars)
    // IPFS CIDv1 starts with "baf" (typically "bafy" for images)
    if (src.startsWith('Qm') || src.startsWith('baf')) {
      return `https://cloudflare-ipfs.com/ipfs/${src}`;
    }

    // Unwrap Next.js image proxy URLs (e.g., pump.fun/_next/image?url=...)
    try {
      const u = new URL(src);
      if (u.pathname.startsWith('/_next/image') && u.searchParams.get('url')) {
        src = u.searchParams.get('url') || src;
      }
    } catch {}

    // Unwrap pump.fun image CDN URLs that have variant params (often fail with 403)
    // Extract the underlying IPFS URL from the 'src' or 'ipfs' query param
    try {
      const u = new URL(src);
      if (u.hostname === 'images.pump.fun' || u.hostname.endsWith('.pump.fun')) {
        // First try 'src' param (contains full IPFS URL)
        const srcParam = u.searchParams.get('src');
        if (srcParam) {
          const decodedSrc = decodeURIComponent(srcParam);
          if (decodedSrc.includes('ipfs')) {
            src = decodedSrc;
          }
        }
        // Fall back to 'ipfs' param (contains just the CID)
        else {
          const ipfsParam = u.searchParams.get('ipfs');
          if (ipfsParam) {
            src = `https://cloudflare-ipfs.com/ipfs/${ipfsParam}`;
          }
        }
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
/**
 * Check if a URL is likely a JSON metadata URL that needs to be resolved
 */
export function isMetadataUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  const hasImageExtension = /\.(png|jpg|jpeg|gif|webp|svg|avif|bmp|ico)$/i.test(lower);

  // Explicit image extensions are not metadata
  if (hasImageExtension) return false;

  // Quick positive match on explicit json/metadata paths
  if (lower.endsWith('.json') || lower.includes('/metadata/')) return true;

  // For metadata hosts, require json or /metadata/ in the path (avoid treating direct images as metadata)
  try {
    const { hostname, pathname } = new URL(lower);
    const isMetadataHost =
      hostname.includes('metadata.j7tracker.com') ||
      hostname.includes('metadata.rapidlaunch.io') ||
      hostname.includes('metadata.uxento.io');
    if (isMetadataHost) {
      return (
        pathname.endsWith('.json') ||
        pathname.includes('/metadata/') ||
        pathname.includes('/data/')
      );
    }

    // IPFS links without image extensions are often metadata JSON
    const isIpfs =
      hostname.includes('ipfs') ||
      lower.startsWith('ipfs://') ||
      lower.includes('/ipfs/');
    if (isIpfs) return true;

    // Arweave URLs without extensions are often JSON metadata
    if (hostname.includes('arweave')) return true;
  } catch {
    // If URL parse fails, fall through
  }

  return false;
}

// Cache for resolved metadata images with TTL to allow retries for failed fetches
// Structure: { image: string | null, timestamp: number }
const metadataImageCache = new Map<string, { image: string | null; timestamp: number }>();

// Success cache: 30 minutes (images don't change)
const SUCCESS_TTL_MS = 30 * 60 * 1000;
// Failure cache: 30 seconds (allows quick retry for IPFS propagation)
const FAILURE_TTL_MS = 30 * 1000;

/**
 * Resolve a metadata JSON URL to get the actual image URL
 * Returns null if resolution fails or URL is not a metadata URL
 * Uses TTL-based caching: success cached for 30min, failure cached for 30sec
 */
export async function resolveMetadataImage(url: string): Promise<string | null> {
  if (!url || !isMetadataUrl(url)) return null;

  // Check cache with TTL
  const cached = metadataImageCache.get(url);
  if (cached) {
    const age = Date.now() - cached.timestamp;
    const ttl = cached.image ? SUCCESS_TTL_MS : FAILURE_TTL_MS;
    if (age < ttl) {
      return cached.image;
    }
    // TTL expired, remove and retry
    metadataImageCache.delete(url);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const metadataUrl = url.startsWith('/api/metadata')
      ? url
      : `/api/metadata?url=${encodeURIComponent(url)}`;

    let response = await fetch(metadataUrl, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    // Fallback: try direct fetch if proxy fails (e.g., unsupported host)
    if (!response.ok && metadataUrl !== url) {
      response = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      metadataImageCache.set(url, { image: null, timestamp: Date.now() });
      return null;
    }

    // Check content-type: if it's an image, the proxy URL IS the image source
    const contentType = response.headers.get('content-type') || '';
    if (contentType.startsWith('image/')) {
      // The /api/metadata endpoint proxied the actual image - use the proxy URL directly
      metadataImageCache.set(url, { image: metadataUrl, timestamp: Date.now() });
      return metadataUrl;
    }

    const data = await response.json();

    // Extract image from metadata JSON
    const imageUrl = extractMetaImage(data);
    metadataImageCache.set(url, { image: imageUrl, timestamp: Date.now() });
    return imageUrl;
  } catch (error) {
    // Cache failure with short TTL to allow retry
    metadataImageCache.set(url, { image: null, timestamp: Date.now() });
    return null;
  }
}

/**
 * Clear the metadata image cache (useful for testing or memory management)
 */
export function clearMetadataImageCache(): void {
  metadataImageCache.clear();
}

// Expose cache clear to window for debugging
if (typeof window !== 'undefined') {
  (window as any).clearMetadataCache = clearMetadataImageCache;
}

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
 * Get the cached resolved image URL for a metadata URL (synchronous)
 * Returns the resolved image if cached, null otherwise
 * Use this when you need to check the cache without async resolution
 */
export function getCachedResolvedImage(url: string | null): string | null {
  if (!url || !isMetadataUrl(url)) return null;

  const cached = metadataImageCache.get(url);
  if (cached) {
    const age = Date.now() - cached.timestamp;
    const ttl = cached.image ? SUCCESS_TTL_MS : FAILURE_TTL_MS;
    if (age < ttl && cached.image) {
      return cached.image;
    }
  }
  return null;
}

/**
 * Get the best available image URL for a token (synchronous)
 * Checks the metadata cache first for resolved images, falls back to raw URL
 * Use this for toasts and other places where async resolution isn't practical
 */
export function getResolvedTokenImage(token: any): string | null {
  const rawImageUrl = extractTokenImage(token);
  if (!rawImageUrl) return null;

  // If it's a metadata URL, check the cache for a resolved image
  if (isMetadataUrl(rawImageUrl)) {
    const cachedResolved = getCachedResolvedImage(rawImageUrl);
    if (cachedResolved) {
      return cachedResolved;
    }
    // Metadata URL but not resolved yet - don't return the JSON URL
    // It would fail to load as an image
    return null;
  }

  // Not a metadata URL, return the normalized image URL directly
  return rawImageUrl;
}

/**
 * Extract image URL from token data, checking multiple possible field names
 * This ensures we catch image fields from stream data, HTTP data, and various API formats
 * Priority order: image_url (API), image, logo, uri (WebSocket stream fallback), then others
 */
export function extractTokenImage(token: any): string | null {
  if (!token || typeof token !== 'object') return null;

  // Check all possible image field names in priority order
  // image_url: Primary field from /v1/trade/view API
  // uri: Fallback from WebSocket stream (new, final_stretch, migrated channels)
  const imageFields = [
    token.image_url,
    token.image,
    token.logo,
    token.uri,
    token.imageUrl,
    token.logoUrl,
    token.logo_url,
    token.icon,
    token.thumbnail,
  ];

  // Return first non-empty string value
  for (const value of imageFields) {
    if (typeof value === 'string' && value.trim()) {
      const normalized = normalizeImageUrl(value.trim());
      if (normalized) {
        return normalized;
      }
    }
  }

  return null;
}
