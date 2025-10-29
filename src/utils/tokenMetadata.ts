// Backend API URL
const WALLET_TRACKER_API_URL = process.env.NEXT_PUBLIC_WALLET_TRACKER_URL || 'http://localhost:8081';

// Cache for token metadata to avoid repeated fetches
const metadataCache = new Map<string, { symbol: string | null; name: string | null }>();

/**
 * Fetch token metadata via secure backend (using Helius DAS API)
 * This keeps API keys secure and provides better coverage than manually parsing Metaplex metadata
 */
export async function fetchTokenMetadata(mintAddress: string): Promise<{ symbol: string | null; name: string | null }> {
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
      const result = data.metadata[mintAddress];
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
  const fallback = { symbol: null, name: null };
  console.log(`[TokenMetadata] Using fallback for ${mintAddress.slice(0, 8)}...`);
  metadataCache.set(mintAddress, fallback);
  return fallback;
}

/**
 * Batch fetch token metadata for multiple mints via secure backend
 */
export async function batchFetchTokenMetadata(mintAddresses: string[]): Promise<Map<string, { symbol: string | null; name: string | null }>> {
  const results = new Map<string, { symbol: string | null; name: string | null }>();
  
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
          const metadata = data.metadata[mintAddress] || { symbol: null, name: null };
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

