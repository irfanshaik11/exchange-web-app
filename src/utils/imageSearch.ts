// Image search utilities for finding missing token images
export interface ImageSearchResult {
  url: string;
  source: string;
  confidence: number;
  width?: number;
  height?: number;
}

export interface TokenImageInfo {
  mint: string;
  name: string;
  symbol: string;
  currentLogo?: string | null;
  uri?: string | null;
}

// Image search sources
const IMAGE_SOURCES = [
  {
    name: 'Pump.fun CDN',
    searchUrl: (symbol: string) => `https://cdn.pump.fun/${symbol.toLowerCase()}.png`,
    fallbackUrl: (symbol: string) => `https://pump.fun/${symbol.toLowerCase()}.png`,
  },
  {
    name: 'Moonit CDN',
    searchUrl: (symbol: string) => `https://moonitcdn.io/${symbol.toLowerCase()}.png`,
  },
  {
    name: 'Jupiter Static',
    searchUrl: (symbol: string) => `https://static-create.jup.ag/${symbol.toLowerCase()}.png`,
  },
  {
    name: 'DexScreener',
    searchUrl: (symbol: string) => `https://cdn.dexscreener.com/static/img/tokens/${symbol.toLowerCase()}.png`,
  },
  {
    name: 'CoinGecko',
    searchUrl: (symbol: string) => `https://assets.coingecko.com/coins/images/${symbol.toLowerCase()}.png`,
  },
  {
    name: 'Solana Token List',
    searchUrl: (symbol: string) => `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${symbol.toLowerCase()}/logo.png`,
  },
];

// IPFS metadata search sources
const METADATA_SOURCES = [
  {
    name: 'Pump.fun Metadata',
    searchUrl: (mint: string) => `https://metadata.pumployer.fun/${mint}`,
  },
  {
    name: 'Moonit Metadata',
    searchUrl: (mint: string) => `https://moonitcdn.io/metadata/${mint}.json`,
  },
  {
    name: 'Jupiter Metadata',
    searchUrl: (mint: string) => `https://static-create.jup.ag/metadata/${mint}.json`,
  },
];

export class ImageSearchService {
  private static instance: ImageSearchService;
  private searchCache = new Map<string, ImageSearchResult[]>();
  private failedSearches = new Set<string>();

  static getInstance(): ImageSearchService {
    if (!ImageSearchService.instance) {
      ImageSearchService.instance = new ImageSearchService();
    }
    return ImageSearchService.instance;
  }

  async searchForTokenImage(token: TokenImageInfo): Promise<ImageSearchResult[]> {
    const cacheKey = `${token.mint}-${token.symbol}`;
    
    // Return cached results if available
    if (this.searchCache.has(cacheKey)) {
      return this.searchCache.get(cacheKey)!;
    }

    // Skip if we've already failed for this token recently
    if (this.failedSearches.has(cacheKey)) {
      return [];
    }

    const results: ImageSearchResult[] = [];

    // Search direct image URLs
    for (const source of IMAGE_SOURCES) {
      try {
        const imageUrl = source.searchUrl(token.symbol);
        const isValid = await this.validateImageUrl(imageUrl);
        if (isValid) {
          results.push({
            url: imageUrl,
            source: source.name,
            confidence: 0.9,
          });
        }
      } catch (error) {
        console.log(`Failed to check ${source.name} for ${token.symbol}:`, error);
      }
    }

    // Search metadata sources for image URLs
    for (const source of METADATA_SOURCES) {
      try {
        const metadataUrl = source.searchUrl(token.mint);
        const metadata = await this.fetchMetadata(metadataUrl);
        if (metadata?.image) {
          const imageUrl = this.normalizeImageUrl(metadata.image);
          if (imageUrl) {
            const isValid = await this.validateImageUrl(imageUrl);
            if (isValid) {
              results.push({
                url: imageUrl,
                source: `${source.name} metadata`,
                confidence: 0.8,
              });
            }
          }
        }
      } catch (error) {
        console.log(`Failed to check ${source.name} metadata for ${token.mint}:`, error);
      }
    }

    // Cache results
    this.searchCache.set(cacheKey, results);
    
    // Mark as failed if no results found
    if (results.length === 0) {
      this.failedSearches.add(cacheKey);
    }

    return results;
  }

  private async validateImageUrl(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          'Accept': 'image/*',
          'User-Agent': 'Interstate-ImageSearch/1.0',
        },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      
      return response.ok && response.headers.get('content-type')?.startsWith('image/');
    } catch (error) {
      return false;
    }
  }

  private async fetchMetadata(url: string): Promise<any> {
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Interstate-ImageSearch/1.0',
        },
        signal: AbortSignal.timeout(5000),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      throw error;
    }
  }

  private normalizeImageUrl(url: string): string | null {
    try {
      // Handle IPFS URLs
      if (url.startsWith('ipfs://')) {
        const cid = url.replace('ipfs://', '').replace(/^ipfs\//, '');
        return `https://cloudflare-ipfs.com/ipfs/${cid}`;
      }
      
      // Handle relative URLs
      if (url.startsWith('/')) {
        return url;
      }
      
      // Ensure HTTPS
      if (url.startsWith('http://')) {
        return url.replace('http://', 'https://');
      }
      
      return url;
    } catch (error) {
      return null;
    }
  }

  // Get tokens that need image updates
  async getTokensNeedingImages(limit: number = 50): Promise<TokenImageInfo[]> {
    try {
      const response = await fetch(`/api/tokens/needing-images?limit=${limit}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch tokens needing images:', error);
      return [];
    }
  }

  // Update token with found image
  async updateTokenImage(mint: string, imageUrl: string, source: string): Promise<boolean> {
    try {
      const response = await fetch('/api/tokens/update-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mint,
          imageUrl,
          source,
        }),
      });
      
      return response.ok;
    } catch (error) {
      console.error('Failed to update token image:', error);
      return false;
    }
  }

  // Clear cache for a specific token
  clearTokenCache(mint: string, symbol: string): void {
    const cacheKey = `${mint}-${symbol}`;
    this.searchCache.delete(cacheKey);
    this.failedSearches.delete(cacheKey);
  }

  // Clear all caches
  clearAllCaches(): void {
    this.searchCache.clear();
    this.failedSearches.clear();
  }
}

// Utility function to check if a token needs image search
export function tokenNeedsImageSearch(token: TokenImageInfo): boolean {
  // Skip if token already has a valid image
  if (token.currentLogo && token.currentLogo.trim() !== '') {
    return false;
  }
  
  // Skip if we have a URI to check
  if (token.uri && token.uri.trim() !== '') {
    return false;
  }
  
  // Skip if token has no symbol or name
  if (!token.symbol || !token.name) {
    return false;
  }
  
  return true;
}

// Priority image search for new pairs tokens
export class PriorityImageSearcher {
  private searchService: ImageSearchService;
  private isRunning = false;
  private searchInterval = 5000; // 5 seconds for faster processing
  private batchSize = 5; // Process 5 tokens at a time for priority

  constructor() {
    this.searchService = ImageSearchService.getInstance();
  }

  // Start priority search for new pairs tokens
  async searchNewPairsImages(tokens: TokenImageInfo[]): Promise<void> {
    if (!tokens || tokens.length === 0) return;

    console.log(`🚀 Priority image search for ${tokens.length} new pairs tokens`);
    
    // Process tokens in parallel with limited concurrency
    const concurrency = 3;
    for (let i = 0; i < tokens.length; i += concurrency) {
      const batch = tokens.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (token) => {
          try {
            const results = await this.searchService.searchForTokenImage(token);
            
            if (results.length > 0) {
              const bestResult = results.reduce((best, current) => 
                current.confidence > best.confidence ? current : best
              );
              
              console.log(`🎯 Found priority image for ${token.symbol}: ${bestResult.url} (${bestResult.source})`);
              
              const success = await this.searchService.updateTokenImage(
                token.mint,
                bestResult.url,
                bestResult.source
              );
              
              if (success) {
                console.log(`✅ Successfully updated ${token.symbol} with priority image`);
              }
            }
          } catch (error) {
            console.error(`❌ Error in priority search for ${token.symbol}:`, error);
          }
        })
      );
      
      // Small delay between batches to avoid overwhelming servers
      if (i + concurrency < tokens.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }
}

// Background image search worker
export class BackgroundImageSearcher {
  private searchService: ImageSearchService;
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private searchInterval = 30000; // 30 seconds
  private batchSize = 10; // Process 10 tokens at a time

  constructor() {
    this.searchService = ImageSearchService.getInstance();
  }

  start(): void {
    if (this.isRunning) {
      console.log('Background image searcher is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting background image searcher...');
    
    // Run immediately
    this.searchForMissingImages();
    
    // Then run on interval
    this.intervalId = setInterval(() => {
      this.searchForMissingImages();
    }, this.searchInterval);
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('Background image searcher stopped');
  }

  private async searchForMissingImages(): Promise<void> {
    try {
      console.log('Searching for missing token images...');
      
      const tokens = await this.searchService.getTokensNeedingImages(this.batchSize);
      console.log(`Found ${tokens.length} tokens needing images`);
      
      for (const token of tokens) {
        try {
          const results = await this.searchService.searchForTokenImage(token);
          
          if (results.length > 0) {
            // Use the highest confidence result
            const bestResult = results.reduce((best, current) => 
              current.confidence > best.confidence ? current : best
            );
            
            console.log(`Found image for ${token.symbol}: ${bestResult.url} (${bestResult.source})`);
            
            // Update the token with the found image
            const success = await this.searchService.updateTokenImage(
              token.mint,
              bestResult.url,
              bestResult.source
            );
            
            if (success) {
              console.log(`Successfully updated ${token.symbol} with image from ${bestResult.source}`);
            } else {
              console.error(`Failed to update ${token.symbol} with image`);
            }
          } else {
            console.log(`No images found for ${token.symbol}`);
          }
        } catch (error) {
          console.error(`Error searching for ${token.symbol}:`, error);
        }
        
        // Small delay between tokens to avoid overwhelming servers
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error('Error in background image search:', error);
    }
  }

  setSearchInterval(interval: number): void {
    this.searchInterval = interval;
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  setBatchSize(size: number): void {
    this.batchSize = size;
  }
}
