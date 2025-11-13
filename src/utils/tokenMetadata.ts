// Backend API URL
const WALLET_TRACKER_API_URL = process.env.NEXT_PUBLIC_WALLET_TRACKER_URL || 'http://localhost:8081';

// Token metadata interface
export interface TokenMetadata {
  symbol: string | null;
  name: string | null;
  image: string | null;
  launchpad_protocol?: string | null;
}

// Cache for token metadata to avoid repeated fetches
const metadataCache = new Map<string, TokenMetadata>();

/**
 * Fetch token metadata via secure backend (using Helius DAS API)
 * This keeps API keys secure and provides better coverage than manually parsing Metaplex metadata
 */
export async function fetchTokenMetadata(mintAddress: string): Promise<TokenMetadata> {
  // Check cache first
  if (metadataCache.has(mintAddress)) {
    const cached = metadataCache.get(mintAddress)!;
    console.log(`[TokenMetadata] Using cached data for ${mintAddress.slice(0, 8)}...`, cached);
    return cached;
  }

  console.log(`[TokenMetadata] Fetching metadata for ${mintAddress.slice(0, 8)}...`);

  try {
    // Use backend endpoint to keep API key secure
    const response = await fetch(`${WALLET_TRACKER_API_URL}/api/token-metadata`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mints: [mintAddress],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.ok && data.metadata && data.metadata[mintAddress]) {
      const apiResult = data.metadata[mintAddress];
      // Ensure all required fields are present
      const result: TokenMetadata = {
        symbol: apiResult.symbol || null,
        name: apiResult.name || null,
        image: apiResult.image || apiResult.logo || apiResult.uri || null,
        launchpad_protocol: apiResult.launchpad_protocol || apiResult.protocol || null,
      };
      console.log(`[TokenMetadata] Successfully fetched for ${mintAddress.slice(0, 8)}...`, result);
      metadataCache.set(mintAddress, result);
      return result;
    } else {
      console.warn(`[TokenMetadata] No data in response for ${mintAddress.slice(0, 8)}...`);
    }
  } catch (error) {
    console.error(`[TokenMetadata] Error fetching metadata for ${mintAddress.slice(0, 8)}...`, error);
  }

  // Return null if unable to fetch
  const fallback: TokenMetadata = { symbol: null, name: null, image: null, launchpad_protocol: null };
  console.log(`[TokenMetadata] Using fallback for ${mintAddress.slice(0, 8)}...`);
  metadataCache.set(mintAddress, fallback);
  return fallback;
}

/**
 * Batch fetch token metadata for multiple mints via secure backend
 */
export async function batchFetchTokenMetadata(mintAddresses: string[]): Promise<Map<string, TokenMetadata>> {
  const results = new Map<string, TokenMetadata>();
  
  // Filter out already cached addresses
  const uncachedAddresses = mintAddresses.filter(addr => !metadataCache.has(addr));
  
  // Add cached results
  mintAddresses.forEach(addr => {
    if (metadataCache.has(addr)) {
      results.set(addr, metadataCache.get(addr)!);
    }
  });
  
  if (uncachedAddresses.length === 0) {
    console.log('[TokenMetadata] All addresses already cached');
    return results;
  }
  
  console.log(`[TokenMetadata] Fetching ${uncachedAddresses.length} uncached tokens in batch`);
  
  try {
    // Backend API supports up to 100 assets at once
    const chunkSize = 100;
    
    for (let i = 0; i < uncachedAddresses.length; i += chunkSize) {
      const chunk = uncachedAddresses.slice(i, i + chunkSize);
      
      const response = await fetch(`${WALLET_TRACKER_API_URL}/api/token-metadata`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mints: chunk,
        }),
      });

      if (!response.ok) {
        console.error(`[TokenMetadata] HTTP error! status: ${response.status}`);
        continue;
      }

      const data = await response.json();
      
      if (data.ok && data.metadata) {
        chunk.forEach((mintAddress) => {
          const apiResult = data.metadata[mintAddress];
          const metadata: TokenMetadata = {
            symbol: apiResult?.symbol || null,
            name: apiResult?.name || null,
            image: apiResult?.image || apiResult?.logo || apiResult?.uri || null,
            launchpad_protocol: apiResult?.launchpad_protocol || apiResult?.protocol || null,
          };
          results.set(mintAddress, metadata);
          metadataCache.set(mintAddress, metadata);
          console.log(`[TokenMetadata] Batch fetched ${mintAddress.slice(0, 8)}...`, metadata);
        });
      }
    }
  } catch (error) {
    console.error('[TokenMetadata] Batch fetch error:', error);
    
    // Fallback to individual fetches if batch fails
    console.log('[TokenMetadata] Falling back to individual fetches...');
    for (const mint of uncachedAddresses) {
      const metadata = await fetchTokenMetadata(mint);
      results.set(mint, metadata);
    }
  }
  
  return results;
}

