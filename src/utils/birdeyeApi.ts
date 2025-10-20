/**
 * Birdeye API utilities
 * Functions to get pair addresses, token info, and markets
 * All API calls go through secure proxy endpoints
 */

export interface BirdeyeMarket {
  address: string; // This is the pair/pool address!
  source: string; // DEX name (e.g., "Raydium", "Orca")
  name: string; // e.g., "SOL/USDC"
  liquidity: number;
  volume24h: number;
  price: number;
  priceChange24h: number;
}

export interface BirdeyeTokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  price: number;
  liquidity: number;
  volume24h: number;
}

/**
 * Get all trading pairs/markets for a token mint address
 * This returns the pair addresses you need for the chart!
 */
export async function getTokenMarkets(
  mintAddress: string
): Promise<BirdeyeMarket[]> {
  try {
    const url = `/api/birdeye-market-data?address=${encodeURIComponent(mintAddress)}`;
    
    const response = await fetch(url, {
      headers: {
        'accept': 'application/json',
        'x-chain': 'solana',
      },
    });

    if (!response.ok) {
      throw new Error(`Birdeye API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success || !data.data?.markets) {
      return [];
    }

    return data.data.markets.map((m: any) => ({
      address: m.address, // This is the pair address!
      source: m.source || 'Unknown',
      name: m.name || `${m.baseSymbol}/${m.quoteSymbol}`,
      liquidity: m.liquidity || 0,
      volume24h: m.volume24h || 0,
      price: m.price || 0,
      priceChange24h: m.priceChange24h || 0,
    }));
  } catch (error) {
    console.error('Error fetching token markets:', error);
    return [];
  }
}

/**
 * Get the largest/most liquid pair for a token
 * Returns the pair address with highest liquidity
 */
export async function getMainPairAddress(
  mintAddress: string,
  preferredDex?: string // e.g., "Raydium", "Orca"
): Promise<string | null> {
  const markets = await getTokenMarkets(mintAddress);
  
  if (markets.length === 0) {
    return null;
  }

  // Filter by preferred DEX if specified
  let filtered = markets;
  if (preferredDex) {
    filtered = markets.filter(m => 
      m.source.toLowerCase().includes(preferredDex.toLowerCase())
    );
  }

  // Sort by liquidity (highest first)
  filtered.sort((a, b) => b.liquidity - a.liquidity);

  return filtered[0]?.address || null;
}

/**
 * Get token information
 */
export async function getTokenInfo(
  mintAddress: string
): Promise<BirdeyeTokenInfo | null> {
  try {
    const url = `/api/birdeye-token-info?address=${encodeURIComponent(mintAddress)}`;
    
    const response = await fetch(url, {
      headers: {
        'accept': 'application/json',
        'x-chain': 'solana',
      },
    });

    if (!response.ok) {
      throw new Error(`Birdeye API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success || !data.data) {
      return null;
    }

    const token = data.data;
    return {
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      price: token.price || 0,
      liquidity: token.liquidity || 0,
      volume24h: token.v24hUSD || 0,
    };
  } catch (error) {
    console.error('Error fetching token info:', error);
    return null;
  }
}

/**
 * Example: Find best SOL/USDC pair on Raydium
 * 
 * Usage:
 * const pairAddress = await getMainPairAddress(
 *   'So11111111111111111111111111111111111111112', // SOL mint
 *   'Raydium'
 * );
 * // Returns: "8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj"
 */

