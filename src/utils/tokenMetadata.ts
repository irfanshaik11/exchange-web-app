export interface UnifiedTokenMetadata {
  address?: string;
  name?: string;
  symbol?: string;
  protocol?: string;
  launchpad?: string | null;
  imageUrl?: string;
  createdAt?: string | number;
  priceUsd?: number;
  marketCapUsd?: number;
  migrated_pool_address?: string;
}

interface FetchOptions {
  signal?: AbortSignal;
  pairAddress?: string | null;
}

const DEFAULT_MONAD_ENDPOINT = "/api/token-service/monad/token";
const DEFAULT_TOKEN_BY_MINT_ENDPOINT = "/api/token-service/token";
// Standard ERC-20 ABI for name() and symbol()
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
] as const;

// ERC-721/ERC-1155 style tokenURI (some tokens may have this)
const TOKEN_URI_ABI = [
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function uri(uint256 tokenId) view returns (string)",
] as const;

// Monad RPC URL
const MONAD_RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC_URL || 
  "https://rpc-mainnet.monadinfra.com/rpc/2jSlaER7hP372wZ53U9JBwrxTWm7BTt8";

export function isProbablyMonadAddress(address?: string | null): boolean {
  return typeof address === "string" && address.trim().toLowerCase().startsWith("0x");
}

export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  return fallback;
}

function toOptionalNumber(value: unknown): number | undefined {
  const parsed = toNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function fetchChainTokenMetadata(
  tokenAddress: string,
  options: FetchOptions = {},
): Promise<UnifiedTokenMetadata | null> {
  if (!tokenAddress) return null;

  const trimmedAddress = tokenAddress.trim();
  if (!trimmedAddress) return null;

  if (isProbablyMonadAddress(trimmedAddress)) {
    return fetchMonadMetadata(trimmedAddress, options.signal);
  }

  return fetchSolanaMetadata(trimmedAddress, options);
}

/**
 * Fetch ERC-20 token metadata directly from blockchain as fallback
 * Only works in browser (client-side)
 */
async function fetchMonadMetadataFromBlockchain(address: string, signal?: AbortSignal): Promise<UnifiedTokenMetadata | null> {
  // Only run in browser
  if (typeof window === 'undefined') {
    return null;
  }
  
  try {
    // Dynamically import ethers to avoid SSR issues
    const { ethers } = await import('ethers');
    
    const provider = new ethers.JsonRpcProvider(MONAD_RPC_URL);
    const tokenContract = new ethers.Contract(address, ERC20_ABI, provider);
    
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }
    
    try {
      // Fetch name and symbol in parallel with timeout
      const fetchPromise = Promise.all([
        tokenContract.name().catch(() => null),
        tokenContract.symbol().catch(() => null),
      ]);
      
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
      
      const [name, symbol] = await Promise.race([fetchPromise, timeoutPromise]).catch(() => [null, null]) as [string | null, string | null];
      
      clearTimeout(timeoutId);
      
      if (!name && !symbol) {
        console.log(`ℹ️ [fetchMonadMetadataFromBlockchain] No name/symbol found for ${address}`);
        return null;
      }
      
      console.log(`✅ [fetchMonadMetadataFromBlockchain] Fetched from blockchain:`, { name, symbol });
      
      // Try to search for image using symbol (for launchpad tokens like nadfun)
      // Note: This is async but we don't want to block too long
      let imageUrl: string | undefined = undefined;
      if (symbol) {
        // Normalize symbol for URL (remove special chars, handle spaces)
        const normalizedSymbol = symbol.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        // Try common image sources for Monad tokens (nadfun, etc.)
        // Try symbol-based first, then address-based
        const imageSources = [
          // Symbol-based (most common) - try multiple variations
          `https://cdn.nad.fun/${normalizedSymbol}.png`,
          `https://cdn.nad.fun/${symbol.toLowerCase()}.png`,
          `https://nad.fun/${normalizedSymbol}.png`,
          `https://nad.fun/${symbol.toLowerCase()}.png`,
          `https://static.nad.fun/${normalizedSymbol}.png`,
          `https://static.nad.fun/${symbol.toLowerCase()}.png`,
          // Address-based (fallback)
          `https://cdn.nad.fun/${address.toLowerCase()}.png`,
          `https://nad.fun/${address.toLowerCase()}.png`,
          // Also try with checksummed address
          `https://cdn.nad.fun/${address}.png`,
        ];
        
        // Try to find a valid image (quick HEAD request with short timeout)
        // Use Promise.race to get first successful result
        const imageCheckPromises = imageSources.map(async (imgSrc, index) => {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1500); // 1.5 second timeout per image
            
            if (signal) {
              signal.addEventListener('abort', () => controller.abort());
            }
            
            const imgResponse = await fetch(imgSrc, { 
              method: 'HEAD', 
              signal: controller.signal,
              cache: 'no-cache',
            });
            clearTimeout(timeoutId);
            
            if (imgResponse.ok && imgResponse.headers.get('content-type')?.startsWith('image/')) {
              console.log(`✅ [fetchMonadMetadataFromBlockchain] Found image at: ${imgSrc}`);
              return imgSrc;
            }
          } catch (err) {
            // Continue to next source
          }
          return null;
        });
        
        // Wait for first successful image check (with overall timeout)
        try {
          const timeoutPromise = new Promise<null>((_, reject) => {
            setTimeout(() => reject(new Error('Image search timeout')), 3000); // 3 second overall timeout
          });
          
          const results = await Promise.race([
            Promise.allSettled(imageCheckPromises),
            timeoutPromise,
          ]) as PromiseSettledResult<string | null>[];
          
          const foundImage = results
            .map((result) => (result.status === 'fulfilled' ? result.value : null))
            .find((url) => url !== null);
          
          if (foundImage) {
            imageUrl = foundImage;
          }
        } catch {
          // Timeout or error - continue without image
          console.log(`⏱️ [fetchMonadMetadataFromBlockchain] Image search timed out for ${address}`);
        }
      }
      
      return {
        address: address.toLowerCase(),
        name: name || undefined,
        symbol: symbol || undefined,
        imageUrl: imageUrl,
      };
    } catch (contractError: any) {
      clearTimeout(timeoutId);
      if (controller.signal.aborted || contractError?.message === 'Timeout') {
        console.log(`⏱️ [fetchMonadMetadataFromBlockchain] Request timed out for ${address}`);
        return null;
      }
      throw contractError;
    }
  } catch (error: any) {
    console.warn(`⚠️ [fetchMonadMetadataFromBlockchain] Failed to fetch from blockchain:`, error?.message || error);
    return null;
  }
}

async function fetchMonadMetadata(address: string, signal?: AbortSignal): Promise<UnifiedTokenMetadata | null> {
  // Normalize address to lowercase for consistency
  const normalizedAddress = address.toLowerCase();
  const url = `${DEFAULT_MONAD_ENDPOINT}?address=${encodeURIComponent(normalizedAddress)}`;
  
  console.log(`🔍 [fetchMonadMetadata] Fetching metadata for: ${normalizedAddress}`);
  console.log(`   URL: ${url}`);
  
  try {
    const response = await fetch(url, { signal });

    if (!response.ok) {
      // Handle 404 gracefully - try blockchain fallback
      if (response.status === 404) {
        console.log(`ℹ️ [fetchMonadMetadata] Token ${normalizedAddress} not found in service (404) - trying blockchain fallback`);
        // Try to fetch from blockchain directly
        const blockchainMetadata = await fetchMonadMetadataFromBlockchain(normalizedAddress, signal);
        if (blockchainMetadata) {
          console.log(`✅ [fetchMonadMetadata] Got metadata from blockchain fallback`);
          
          // If we have symbol but no image, try multiple sources
          if (blockchainMetadata.symbol && !blockchainMetadata.imageUrl) {
            // Try 1: nadfun API
            try {
              const nadfunApiUrl = `https://api.nad.fun/v1/token/${normalizedAddress}`;
              const nadfunResponse = await fetch(nadfunApiUrl, { 
                signal,
                headers: { 'Accept': 'application/json' }
              });
              
              if (nadfunResponse.ok) {
                const nadfunData = await nadfunResponse.json();
                if (nadfunData?.image || nadfunData?.logo || nadfunData?.imageUrl) {
                  blockchainMetadata.imageUrl = nadfunData.image || nadfunData.logo || nadfunData.imageUrl;
                  console.log(`✅ [fetchMonadMetadata] Found image from nadfun API`);
                  return blockchainMetadata;
                }
              }
            } catch (nadfunError) {
              // Continue to next source
            }
            
            // Try 2: Check pulse/new pairs endpoint (where Monad table gets images)
            try {
              const pulseUrl = `/api/token-service/pulse-new?chain=monad`;
              const pulseResponse = await fetch(pulseUrl, { signal });
              
              if (pulseResponse.ok) {
                const pulseData = await pulseResponse.json();
                const tokens = pulseData?.new || pulseData?.data || [];
                const token = tokens.find((t: any) => 
                  (t.address || t.mint || t.pair_address)?.toLowerCase() === normalizedAddress
                );
                
                if (token) {
                  const imageUrl = token.image || token.logo || token.uri || token.image_url;
                  if (imageUrl) {
                    blockchainMetadata.imageUrl = imageUrl;
                    console.log(`✅ [fetchMonadMetadata] Found image from pulse-new endpoint`);
                    return blockchainMetadata;
                  }
                }
              }
            } catch (pulseError) {
              // Continue - image search already tried CDN paths
            }
          }
          
          return blockchainMetadata;
        }
        return null; // Return null if blockchain also fails
      }
      console.warn(`⚠️ [fetchMonadMetadata] API responded with ${response.status} for ${normalizedAddress}`);
      throw new Error(`Monad token service responded with ${response.status}`);
    }

    const payload = await response.json();
    console.log(`📦 [fetchMonadMetadata] Response for ${normalizedAddress}:`, payload);
    
    // The API might return data directly or nested in a 'data' field
    // Also handle case where response is already the token object
    const data = payload?.data || payload?.token || payload;
    
    if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
      console.warn(`⚠️ [fetchMonadMetadata] No data in response for ${normalizedAddress}`, {
        payload,
        hasData: !!payload?.data,
        hasToken: !!payload?.token,
        payloadKeys: Object.keys(payload || {}),
      });
      return null;
    }

    const metadata = {
      address: data.address || normalizedAddress,
      name: data.name || undefined,
      symbol: data.symbol || undefined,
      protocol: data.launchpad_protocol || data.launchpad_name || data.protocol || undefined,
      launchpad: data.launchpad_protocol || data.launchpad_name || data.protocol || undefined,
      // Try multiple image field names from token service
      imageUrl: data.image_url || data.image || data.logo || data.uri || data.logo_url || undefined,
      createdAt: data.created_at || data.updated_at,
      priceUsd: toOptionalNumber(data.price_usd),
      marketCapUsd: toOptionalNumber(data.market_cap_usd),
    };
    
    console.log(`✅ [fetchMonadMetadata] Successfully parsed metadata for ${normalizedAddress}:`, {
      name: metadata.name,
      symbol: metadata.symbol,
      hasImage: !!metadata.imageUrl,
      imageSource: metadata.imageUrl ? 'token-service' : 'none',
    });
    
    return metadata;
  } catch (error: any) {
    console.error(`❌ [fetchMonadMetadata] Error fetching metadata for ${normalizedAddress}:`, error);
    throw error; // Re-throw to let caller handle fallback
  }
}

async function fetchSolanaMetadata(
  address: string,
  options: FetchOptions,
): Promise<UnifiedTokenMetadata | null> {
  let lastError: unknown = null;

  // Primary: /v1/token/{mint} via proxy — works with just the mint address
  try {
    const response = await fetch(
      `${DEFAULT_TOKEN_BY_MINT_ENDPOINT}/${encodeURIComponent(address)}`,
      { signal: options.signal },
    );

    if (response.ok) {
      const data = await response.json();
      const token = data?.token || data?.data || data;
      const market = data?.marketData || {};

      if (token && typeof token === "object" && Object.keys(token).length > 0) {
        return {
          address: token.mint_address || token.address || address,
          name: token.name || undefined,
          symbol: token.symbol || undefined,
          protocol: token.launchpad_protocol || token.protocol || undefined,
          launchpad: token.launchpad_protocol || token.protocol || undefined,
          imageUrl: token.image_url || token.image || token.logo || token.uri || undefined,
          createdAt: token.created_timestamp || token.created_at,
          priceUsd: toOptionalNumber(market.price_usd ?? token.usd_price ?? token.price_usd),
          marketCapUsd: toOptionalNumber(market.market_cap_usd ?? token.market_cap_usd ?? token.market_cap),
          migrated_pool_address: token.migrated_pool_address || token.pair_address || undefined,
        };
      }
    } else {
      lastError = new Error(`Token-by-mint service responded with ${response.status}`);
    }
  } catch (error) {
    lastError = error;
  }

  if (lastError) {
    throw lastError instanceof Error ? lastError : new Error("Failed to fetch token metadata");
  }

  return null;
}

export async function batchFetchChainTokenMetadata(
  tokenAddresses: string[],
  options: FetchOptions = {},
): Promise<Map<string, UnifiedTokenMetadata>> {
  const results = new Map<string, UnifiedTokenMetadata>();
  const uniqueAddresses = Array.from(new Set(tokenAddresses.filter(Boolean)));

  await Promise.allSettled(
    uniqueAddresses.map(async (address) => {
      const metadata = await fetchChainTokenMetadata(address, options);
      if (metadata) {
        results.set(address, metadata);
      }
    }),
  );

  return results;
}

/**
 * Check if a token address is a Pump.fun token (ends with 'pump')
 */
export function isPumpfunToken(address?: string | null): boolean {
  return typeof address === 'string' && address.toLowerCase().endsWith('pump');
}

/**
 * Fetch image from Pump.fun API as a fallback for tokens with missing images
 * This is useful for new tokens that haven't been indexed by the token-service yet
 */
export async function fetchPumpfunImage(
  mintAddress: string,
  signal?: AbortSignal
): Promise<{ imageUrl?: string; name?: string; symbol?: string } | null> {
  if (!isPumpfunToken(mintAddress)) {
    return null;
  }

  try {
    const response = await fetch(
      `https://frontend-api.pump.fun/coins/${mintAddress}`,
      { signal: signal || AbortSignal.timeout(5000) }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    return {
      imageUrl: data.image_uri || undefined,
      name: data.name || undefined,
      symbol: data.symbol || undefined,
    };
  } catch (error) {
    // Silently fail - this is just a fallback
    console.warn(`Pump.fun image fallback failed for ${mintAddress}:`, error);
    return null;
  }
}

