import type { NextApiRequest, NextApiResponse } from 'next';
import { env } from '../env';

/**
 * Enhanced API route with intelligent caching for trade data
 * Provides better caching strategies for trade page data
 */

interface CacheConfig {
  ttl: number; // Time to live in seconds
  staleWhileRevalidate: number; // Stale while revalidate in seconds
  enableETag: boolean;
  enableCompression: boolean;
}

const CACHE_CONFIGS: Record<string, CacheConfig> = {
  // Real-time data - short cache
  'trade-events': {
    ttl: 10, // 10 seconds
    staleWhileRevalidate: 30,
    enableETag: true,
    enableCompression: true,
  },
  // Trade data - medium cache
  'trade-data': {
    ttl: 30, // 30 seconds
    staleWhileRevalidate: 60,
    enableETag: true,
    enableCompression: true,
  },
  // Token stats - longer cache
  'token-stats': {
    ttl: 60, // 1 minute
    staleWhileRevalidate: 120,
    enableETag: true,
    enableCompression: true,
  },
  // OHLC data - medium cache
  'ohlc-data': {
    ttl: 60, // 1 minute
    staleWhileRevalidate: 180,
    enableETag: true,
    enableCompression: true,
  },
  // Static data - long cache
  'static-data': {
    ttl: 300, // 5 minutes
    staleWhileRevalidate: 600,
    enableETag: true,
    enableCompression: true,
  },
};

function setCacheHeaders(res: NextApiResponse, config: CacheConfig, data?: any) {
  const { ttl, staleWhileRevalidate, enableETag, enableCompression } = config;
  
  // Set cache control headers
  res.setHeader('Cache-Control', `public, max-age=${ttl}, stale-while-revalidate=${staleWhileRevalidate}`);
  
  // Set ETag for conditional requests
  if (enableETag && data) {
    const etag = `"${Buffer.from(JSON.stringify(data)).toString('base64').slice(0, 16)}"`;
    res.setHeader('ETag', etag);
  }
  
  // Enable compression
  if (enableCompression) {
    res.setHeader('Content-Encoding', 'gzip');
  }
  
  // Set Vary header for proper caching
  res.setHeader('Vary', 'Accept-Encoding, X-API-Key');
}

function checkETag(req: NextApiRequest, res: NextApiResponse, data: any): boolean {
  const ifNoneMatch = req.headers['if-none-match'];
  if (!ifNoneMatch) return false;
  
  const etag = `"${Buffer.from(JSON.stringify(data)).toString('base64').slice(0, 16)}"`;
  if (ifNoneMatch === etag) {
    res.status(304).end();
    return true;
  }
  
  return false;
}

export function withEnhancedCaching(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>,
  cacheType: keyof typeof CACHE_CONFIGS = 'trade-data'
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const config = CACHE_CONFIGS[cacheType];
    
    try {
      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
        res.status(200).end();
        return;
      }
      
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
      
      // Call the original handler
      await handler(req, res);
      
      // Set cache headers after successful response
      if (res.statusCode === 200) {
        setCacheHeaders(res, config);
      }
      
    } catch (error) {
      console.error('API Error:', error);
      
      // Set error cache headers (shorter TTL for errors)
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.status(500).json({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };
}

export function createCachedApiHandler(
  fetchFn: (req: NextApiRequest) => Promise<any>,
  cacheType: keyof typeof CACHE_CONFIGS = 'trade-data'
) {
  return withEnhancedCaching(async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      const data = await fetchFn(req);
      
      // Check ETag for conditional requests
      if (checkETag(req, res, data)) {
        return;
      }
      
      res.status(200).json(data);
    } catch (error) {
      console.error('Fetch error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch data',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }, cacheType);
}

export function createTradeDataHandler() {
  return createCachedApiHandler(async (req: NextApiRequest) => {
    const { pair_address, token_address } = req.query;
    
    if (!pair_address) {
      throw new Error('pair_address is required');
    }
    
    const baseUrl = env.NEXT_PUBLIC_GO_SERVICE_URL;
    const requests: Promise<Response>[] = [
      fetch(`${baseUrl}/v1/trade/view?pair_address=${pair_address}`, {
        headers: {
          'Accept': 'application/json',
          'X-API-Key': env.NEXT_PUBLIC_BACKEND_API_KEY || 'test-key',
        },
      })
    ];
    
    // Add stats request if token address is provided
    if (token_address) {
      requests.push(
        fetch(`${baseUrl}/v1/ws/token-stats?pair_address=${pair_address}&token_address=${token_address}`, {
          headers: {
            'Accept': 'application/json',
            'X-API-Key': env.NEXT_PUBLIC_BACKEND_API_KEY || 'test-key',
          },
        })
      );
    }
    
    const responses = await Promise.all(requests);
    const [tradesResponse, statsResponse] = responses;
    
    if (!tradesResponse.ok) {
      throw new Error(`Failed to fetch trades: ${tradesResponse.status}`);
    }
    
    const tradesData = await tradesResponse.json();
    let statsData = null;
    
    if (statsResponse && statsResponse.ok) {
      try {
        statsData = await statsResponse.json();
      } catch (err) {
        console.warn('Failed to parse stats:', err);
      }
    }
    
    return {
      trades: tradesData.recentTrades || [],
      stats: statsData?.data?.timeframes || null,
      recentTrades: tradesData.recentTrades,
    };
  }, 'trade-data');
}

export function createOHLCDataHandler() {
  return createCachedApiHandler(async (req: NextApiRequest) => {
    const { pair_address, interval = '1m', timeframe = '24h', optimize = 'false' } = req.query;
    
    if (!pair_address) {
      throw new Error('pair_address is required');
    }
    
    const baseUrl = env.NEXT_PUBLIC_GO_SERVICE_URL;
    const url = new URL(`${baseUrl}/v1/trade/ohlc-data`);
    url.searchParams.set('pair_address', pair_address as string);
    url.searchParams.set('interval', interval as string);
    url.searchParams.set('timeframe', timeframe as string);
    if (optimize === 'true') {
      url.searchParams.set('optimize', 'true');
    }
    
    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
            'X-API-Key': env.NEXT_PUBLIC_BACKEND_API_KEY || 'test-key',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch OHLC data: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  }, 'ohlc-data');
}

export default {
  withEnhancedCaching,
  createCachedApiHandler,
  createTradeDataHandler,
  createOHLCDataHandler,
  CACHE_CONFIGS,
};
