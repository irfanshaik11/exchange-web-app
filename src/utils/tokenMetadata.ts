// Cache for token metadata to avoid repeated fetches
const metadataCache = new Map<string, { symbol: string | null; name: string | null }>();

/**
 * Fetch token metadata using Helius DAS API (Digital Asset Standard)
 * This has much better coverage than manually parsing Metaplex metadata
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
    // Use Helius DAS API for better coverage
    const url = 'https://mainnet.helius-rpc.com/?api-key=58281a41-2a84-4eab-82ea-b84c72af7346';
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'metadata-fetch',
        method: 'getAsset',
        params: {
          id: mintAddress,
          displayOptions: {
            showFungible: true
          }
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.result) {
      const asset = data.result;
      const symbol = asset.content?.metadata?.symbol || asset.token_info?.symbol || null;
      const name = asset.content?.metadata?.name || asset.token_info?.name || null;
      
      const result = { symbol, name };
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
 * Batch fetch token metadata for multiple mints using Helius getAssetBatch
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
    // Use Helius getAssetBatch API for better performance
    const url = 'https://mainnet.helius-rpc.com/?api-key=58281a41-2a84-4eab-82ea-b84c72af7346';
    
    // Batch API supports up to 1000 assets at once, but we'll chunk to 100 for safety
    const chunkSize = 100;
    
    for (let i = 0; i < uncachedAddresses.length; i += chunkSize) {
      const chunk = uncachedAddresses.slice(i, i + chunkSize);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'batch-metadata-fetch',
          method: 'getAssetBatch',
          params: {
            ids: chunk,
            displayOptions: {
              showFungible: true
            }
          },
        }),
      });

      if (!response.ok) {
        console.error(`[TokenMetadata] HTTP error! status: ${response.status}`);
        continue;
      }

      const data = await response.json();
      
      if (data.result && Array.isArray(data.result)) {
        data.result.forEach((asset: any, index: number) => {
          const mintAddress = chunk[index];
          if (asset) {
            const symbol = asset.content?.metadata?.symbol || asset.token_info?.symbol || null;
            const name = asset.content?.metadata?.name || asset.token_info?.name || null;
            
            const metadata = { symbol, name };
            results.set(mintAddress, metadata);
            metadataCache.set(mintAddress, metadata);
            console.log(`[TokenMetadata] Batch fetched ${mintAddress.slice(0, 8)}...`, metadata);
          } else {
            // Asset not found
            const fallback = { symbol: null, name: null };
            results.set(mintAddress, fallback);
            metadataCache.set(mintAddress, fallback);
          }
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

