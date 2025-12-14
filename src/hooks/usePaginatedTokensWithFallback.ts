import { useEffect, useRef, useState, useCallback } from "react";
import throttle from "lodash.throttle";
import { env } from "../env";
import { getCached, setCached } from "../utils/simpleCache";

interface UsePaginatedTokensParams {
  filter?: string;
  order?: string;
  offset?: number;
  limit?: number;
  timeframe?: string;
  chain?: string; // Chain parameter: 'sol', 'monad', etc.
}

interface TokensState {
  data: any[];
  loading: boolean;
  isConnected: boolean;
  isReconnecting: boolean;
  error: string | null;
  usingFallback: boolean;
}

const TRENDING_CACHE_VERSION = 'v2';

export default function usePaginatedTokensWithFallback({
  filter = 'new',
  order = 'desc',
  offset = 0,
  limit = 20,
  timeframe,
  chain = 'sol', // Default to Solana
}: UsePaginatedTokensParams = {}) {
  //console.log('🔧 [HOOK] usePaginatedTokensWithFallback called with:', { filter, order, offset, limit, timeframe });
  
  // Early return if limit is 0 (used to disable the hook)
  if (limit === 0) {
    //console.log('🔧 [HOOK] Disabled - limit is 0, returning empty state');
    return {
      data: [],
      loading: false,
      isConnected: false,
      isReconnecting: false,
      error: null,
      usingFallback: false,
    };
  }
  
  // console.log('🔧 Environment check:', {
  //   WEBSOCKET_URL: env.NEXT_PUBLIC_WEBSOCKET_URL,
  //   BACKEND_URL: env.NEXT_PUBLIC_BACKEND_URL
  // });
  
  const [state, setState] = useState<TokensState>({
    data: [],
    loading: true,
    isConnected: false,
    isReconnecting: false,
    error: null,
    usingFallback: false,
  });

  // console.log('🔧 Current state:', { dataLength: state.data.length, loading: state.loading, usingFallback: state.usingFallback });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef<boolean>(false);
  // Fail fast to polling to avoid empty UI states when returning to Discover
  const maxReconnectAttempts = 0; // 0 = try once, then fall back immediately
  const reconnectAttemptRef = useRef(0);
  const wsConnectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const maxLoadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const lastStableDataRef = useRef<any[] | null>(null);
  const lastTimeframeRef = useRef<string | undefined>(timeframe);
  const currentRequestTimeframeRef = useRef<string | undefined>(timeframe);
  const lastChainRef = useRef<string>(chain);

  // Stabilize incoming lists to avoid jarring dips (e.g., 2 items on 5m)
  const stabilizeList = useCallback((incoming: any[]): any[] => {
    try {
      const lim = (limit || 20);
      const prev = lastStableDataRef.current;
      const minCount = Math.max(5, Math.floor(lim * 0.4));

      // Reset stability baseline if timeframe changed - IMPORTANT: don't use prev data from different timeframe
      if (lastTimeframeRef.current !== timeframe) {
        // console.log('⏱️ Timeframe changed from', lastTimeframeRef.current, 'to', timeframe, '- clearing previous list to prevent data clash');
        lastTimeframeRef.current = timeframe;
        // Clear previous data to prevent mixing timeframes
        lastStableDataRef.current = null;
      }

      if (!Array.isArray(incoming)) return prev || [];

      // If we don't have a baseline yet, adopt incoming as baseline
      if (!prev || prev.length === 0) {
        lastStableDataRef.current = incoming;
        return incoming;
      }

      // If incoming is too small (e.g., MV not fully refreshed), merge into previous order
      if (incoming.length < minCount && prev.length >= incoming.length) {
        // console.log('🛡️ Stabilizing list: incoming length', incoming.length, '< minCount', minCount);
        const byAddr = new Map<string, any>();
        for (const t of prev) byAddr.set(t.pair_address, t);
        for (const t of incoming) byAddr.set(t.pair_address, t); // overlay updates

        const prevOrder = prev.map(t => t.pair_address);
        const prevSet = new Set(prevOrder);
        const result: any[] = [];
        // Keep previous order, updated with any new fields
        for (const addr of prevOrder) {
          const item = byAddr.get(addr);
          if (item) {
            result.push(item);
            if (result.length >= lim) break;
          }
        }
        // Append any brand-new tokens not in previous list, up to limit
        if (result.length < lim) {
          for (const t of incoming) {
            if (!prevSet.has(t.pair_address)) {
              result.push(t);
              if (result.length >= lim) break;
            }
          }
        }
        lastStableDataRef.current = result;
        return result;
      }

      // Stable enough: adopt incoming
      lastStableDataRef.current = incoming;
      return incoming;
    } catch (e) {
      console.warn('stabilizeList error:', e);
      return incoming;
    }
  }, [limit, timeframe]);

  // Track current chain to prevent stale data
  const currentChainRef = useRef<string>(chain);
  useEffect(() => {
    const TRENDING_CACHE_VERSION = 'v2';
    currentChainRef.current = chain;
  }, [chain]);

  const throttledSetData = useCallback((newData: any[]) => {
    // CRITICAL: Only process data if it's for the current timeframe and chain
    if (currentRequestTimeframeRef.current !== timeframe || currentChainRef.current !== chain) {
      console.log('🚫 Ignoring data - timeframe/chain mismatch:', {
        requestTimeframe: currentRequestTimeframeRef.current,
        currentTimeframe: timeframe,
        requestChain: currentChainRef.current,
        currentChain: chain
      });
      return;
    }
    
    // console.log('🔧 Setting data in hook (raw):', newData?.length, 'tokens, for timeframe:', currentRequestTimeframeRef.current);
    const stable = stabilizeList(newData);
    // console.log('🔧 After stabilization:', stable?.length, 'tokens');
    // if (stable?.[0]) {
    //   console.log('🔧 First token data (stable):', {
    //     name: stable[0].name,
    //     symbol: stable[0].symbol,
    //     usd_price: stable[0].usd_price,
    //     fully_diluted_value: stable[0].fully_diluted_value,
    //     total_liquidity_usd: stable[0].total_liquidity_usd,
    //     volume_5m: stable[0].volume_5m,
    //     volume_1h: stable[0].volume_1h,
    //     volume_6h: stable[0].volume_6h,
    //     volume_24h: stable[0].volume_24h,
    //   });
    // }
    setState(prev => {
      // CRITICAL: Double-check timeframe hasn't changed during stabilization
      if (currentRequestTimeframeRef.current !== timeframe) {
        //console.log('🚫 Ignoring stabilized data - timeframe changed during processing');
        return prev;
      }
      // Only update if data actually changed to prevent flickering
      if (JSON.stringify(prev.data) === JSON.stringify(stable)) {
        return prev;
      }
      // CRITICAL: Set data and loading together - this prevents "No tokens found" from showing
      // when data arrives but loading was set to false before data was set
      // Also clear max loading timeout since we got data
      if (maxLoadingTimeoutRef.current) {
        clearTimeout(maxLoadingTimeoutRef.current);
        maxLoadingTimeoutRef.current = null;
      }
      return { ...prev, data: stable, loading: false, error: null };
    });
  }, [stabilizeList, timeframe, chain]);

  // Polling fallback function
  const startPolling = useCallback(() => {
    // Check if chain/timeframe changed - if so, clear existing polling first
    const chainChanged = lastChainRef.current !== chain;
    const timeframeChanged = lastTimeframeRef.current !== timeframe;
    
    if (chainChanged || timeframeChanged) {
      console.log(`🔄 Chain/timeframe changed (${lastChainRef.current}/${lastTimeframeRef.current} -> ${chain}/${timeframe}), clearing existing polling`);
      clearPolling();
      lastTimeframeRef.current = timeframe;
      lastChainRef.current = chain;
      // Force clear polling flags to allow restart
      isPollingRef.current = false;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
    
    // Don't start polling if already polling (unless chain/timeframe changed)
    if ((isPollingRef.current || pollIntervalRef.current) && !chainChanged && !timeframeChanged) {
      console.log('🔄 Already polling, skipping');
      return;
    }
    
    // Ensure loading state is true when starting polling (if no data yet)
    // This prevents "No tokens found" from showing prematurely
    setState(prev => {
      if (prev.data.length === 0) {
        return { 
          ...prev, 
          usingFallback: true, 
          isReconnecting: false,
          loading: true, // Force loading true if no data yet
          error: null // Clear any WebSocket errors when starting polling
        };
      }
      return { 
        ...prev, 
        usingFallback: true, 
        isReconnecting: false,
        error: null 
      };
    });
    
    const poll = async () => {
      // CRITICAL: Use refs for current values to avoid stale closures
      const currentTimeframe = currentRequestTimeframeRef.current;
      const currentChain = currentChainRef.current;
      
      // CRITICAL: Check if timeframe or chain has changed - abort if so
      if (currentTimeframe !== timeframe || currentChain !== chain) {
        console.log('🚫 Aborting poll request - timeframe/chain changed:', {
          refTimeframe: currentTimeframe,
          paramTimeframe: timeframe,
          refChain: currentChain,
          paramChain: chain
        });
        return;
      }
      
      if (isPollingRef.current) {
        // Skip overlapping poll to avoid piling up requests when upstream stalls
        return;
      }
      isPollingRef.current = true;
      try {
        // Create new AbortController for this request
        const abortController = new AbortController();
        abortControllerRef.current = abortController;
        
        // For trending filter or Monad chain, timeframe is not required for Birdeye API
        // But we still need to fetch data even if timeframe is not set
        // Use refs to get current values
        const isTrendingOrMonad = filter === 'trending' || currentChain === 'monad';
        
        const queryParams = new URLSearchParams({
          filter: filter || 'new',
          order: order || 'desc',
          offset: (offset || 0).toString(),
          limit: (limit || 20).toString(),
        });
        
        // For non-trending filters, timeframe is required
        // For trending/Monad, timeframe is optional (Birdeye doesn't use it)
        // Use currentTimeframe from ref to avoid stale closures
        if (!isTrendingOrMonad) {
          // STRICTLY enforce: only include timeframe if it's provided and valid
          if (currentTimeframe && (currentTimeframe === '5m' || currentTimeframe === '1h' || currentTimeframe === '6h' || currentTimeframe === '24h')) {
            queryParams.set('timeframe', currentTimeframe);
            // console.log('📡 Polling: Using timeframe:', currentTimeframe);
          } else {
            // For non-trending filters, skip if no valid timeframe
            console.warn('📡 Polling: Invalid or missing timeframe for non-trending filter, skipping:', currentTimeframe);
            isPollingRef.current = false;
            return;
          }
        } else {
          // For trending/Monad, include timeframe if available (for consistency), but don't require it
          if (currentTimeframe && (currentTimeframe === '5m' || currentTimeframe === '1h' || currentTimeframe === '6h' || currentTimeframe === '24h')) {
            queryParams.set('timeframe', currentTimeframe);
          }
        }
        
        // If env is ws(s)://..., convert to http(s):// for REST polling
        // Always use same-origin proxy to avoid mixed-content/TLS issues
        let url = `/api/token-service/getAllTokens?${queryParams}`;
        
        // Declare data variable
        let data: any = null;
        let response: Response;
        
        // For Monad chain, ALWAYS use Birdeye trending endpoint (don't call Solana getAllTokens)
        // Use Birdeye trending endpoint for trending filter OR when chain is monad (any filter)
        // CRITICAL: Use the chain parameter (not ref) to ensure we get the correct chain for cache key
        const isMonad = currentChain === 'monad';
        if (filter === 'trending' || isMonad) {
          // Check cache FIRST before making any API calls
          // CRITICAL: Always use the chain parameter to ensure cache keys are chain-specific
          const cacheChain = chain || 'sol';
          const cacheKey = `trending_${cacheChain}_${currentTimeframe || '1h'}_${TRENDING_CACHE_VERSION}`;
          console.log(`[Cache] Checking cache for key: ${cacheKey} (chain: ${cacheChain}, timeframe: ${currentTimeframe})`);
          const cached = getCached<any[]>(cacheKey);
          // Check cache even if we have data - when switching chains, we want to use cache for the new chain
          if (cached && cached.length > 0) {
            console.log(`[Cache] ✅ Cache HIT for ${cacheKey}, loading ${cached.length} tokens immediately`);
            throttledSetData(cached);
            setState(prev => ({ ...prev, error: null, loading: false }));
            isPollingRef.current = false;
            return;
          } else {
            console.log(`[Cache] ❌ Cache MISS for ${cacheKey}, fetching from API`);
          }
          
          // Birdeye API only accepts limit between 1-20, but we need ~50 tokens after filtering
          // OPTIMIZATION: Fetch pages in PARALLEL since backend cache makes them fast
          // Show first page immediately, then update with more tokens as they arrive
          const birdeyeLimit = 20; // Max allowed by Birdeye
          
          // OPTIMIZATION: Fetch first page immediately, then fetch remaining pages in parallel
          // currentChain is already defined above (line 303)
          // This shows data faster while still getting enough tokens for filtering
          let allTokens: any[] = [];
          let totalTokens = 0; // Will be set from first page response
          
          // Fetch first page immediately (no delay)
          // CRITICAL: Use chain parameter (not ref) to ensure correct chain is used
          const fetchChain = chain || 'sol';
          const firstPageParams = new URLSearchParams({
            sort_by: 'volume24hUSD',
            sort_type: 'desc',
            offset: '0',
            limit: birdeyeLimit.toString(),
            chain: fetchChain,
          });
          
          console.log(`[Birdeye] 🚀 Fetching first page immediately with chain: ${fetchChain}`);
          try {
            const firstResp = await fetch(`/api/token-service/birdeye-trending?${firstPageParams}`, {
              signal: abortController.signal,
              cache: 'no-store' as RequestCache
            });
            
            if (firstResp.ok) {
              const firstPageData = await firstResp.json();
              if (firstPageData?.data?.tokens && Array.isArray(firstPageData.data.tokens)) {
                allTokens = allTokens.concat(firstPageData.data.tokens);
                // Get total count from Birdeye response to know how many pages to fetch
                totalTokens = firstPageData?.data?.total || firstPageData.data.tokens.length;
                console.log(`[Birdeye] ✅ First page loaded: ${firstPageData.data.tokens.length} tokens (total available: ${totalTokens})`);
              }
            }
          } catch (e: any) {
            console.error(`[Birdeye] ❌ Failed to fetch first page:`, e?.message || e);
          }
          
          // Calculate how many pages we actually need based on total tokens from Birdeye
          // If total is not available, use a conservative default (10 pages for Monad, 5 for Solana)
          const maxPagesNeeded = totalTokens > 0 
            ? Math.ceil(totalTokens / birdeyeLimit) 
            : (isMonad ? 10 : 5);
          const pagesToFetch = Math.min(maxPagesNeeded, isMonad ? 10 : 5); // Cap at reasonable max
          
          // Fetch remaining pages in PARALLEL (cache makes them fast)
          const remainingPages = Array.from({ length: pagesToFetch - 1 }, (_, i) => i + 1);
          console.log(`[Birdeye] 🚀 Fetching remaining ${remainingPages.length} pages in parallel (total tokens: ${totalTokens}, pages needed: ${pagesToFetch})`);
          
          const pagePromises = remainingPages.map(async (page) => {
            // CRITICAL: Use chain parameter (not ref) to ensure correct chain is used
            const birdeyeParams = new URLSearchParams({
              sort_by: 'volume24hUSD',
              sort_type: 'desc',
              offset: (page * birdeyeLimit).toString(),
              limit: birdeyeLimit.toString(),
              chain: fetchChain,
            });
            
            try {
              const resp = await fetch(`/api/token-service/birdeye-trending?${birdeyeParams}`, {
                signal: abortController.signal,
                cache: 'no-store' as RequestCache
              });
              
              if (resp.ok) {
                const pageData = await resp.json();
                if (pageData?.data?.tokens && Array.isArray(pageData.data.tokens)) {
                  return pageData.data.tokens;
                }
              }
            } catch (e: any) {
              console.error(`[Birdeye] Failed to fetch page ${page + 1}:`, e?.message || e);
            }
            return [];
          });
          
          // Wait for all remaining pages in parallel
          const remainingResults = await Promise.all(pagePromises);
          remainingResults.forEach((tokens, idx) => {
            if (tokens.length > 0) {
              allTokens = allTokens.concat(tokens);
              console.log(`[Birdeye] ✅ Page ${idx + 2} loaded: ${tokens.length} tokens`);
            }
          });
          
          console.log(`[Birdeye] Total tokens fetched: ${allTokens.length} from ${pagesToFetch} pages`);
          
          // If no tokens were fetched, check cache before giving up
          if (allTokens.length === 0) {
            console.warn(`[Birdeye] ⚠️ No tokens fetched from API, checking cache...`);
            // CRITICAL: Use chain parameter (not ref) to ensure correct cache key
            const cacheKey = `trending_${chain || 'sol'}_${currentTimeframe || '1h'}_${TRENDING_CACHE_VERSION}`;
            console.log(`[Cache] Checking fallback cache for key: ${cacheKey}`);
            const cached = getCached<any[]>(cacheKey);
            if (cached && cached.length > 0) {
              console.log(`[Birdeye] ✅ Using cached data: ${cached.length} tokens`);
              // Use cached data directly - it's already filtered and transformed
              throttledSetData(cached);
              setState(prev => ({ ...prev, error: null }));
              isPollingRef.current = false;
              return;
            }
            console.error(`[Birdeye] ❌ No tokens fetched and no cache available! Check network requests and API responses.`);
          }
          
          // Store for transformation and filtering below
          data = { data: { tokens: allTokens }, success: true };
          
          // Create a mock response for the rest of the code to work
          response = new Response(JSON.stringify(data), { 
            status: 200, 
            headers: { 'Content-Type': 'application/json' } 
          });
        } else {
          // For non-trending filters, use normal URL
          response = await fetch(url, { signal: abortController.signal, cache: 'no-store' as RequestCache });
        }
        
        // console.log('📡 Polling URL:', url);
        // console.log('📡 Query params:', Object.fromEntries(queryParams.entries()));
        // console.log('📡 Environment WEBSOCKET_URL (for WS only):', env.NEXT_PUBLIC_WEBSOCKET_URL);
        
        // CRITICAL: Check again before making request - use refs for current values
        if (currentRequestTimeframeRef.current !== timeframe || currentChainRef.current !== chain) {
          console.log('🚫 Aborting fetch - timeframe/chain changed during request setup');
          return;
        }
        
        // Serve cached immediately if present and no data yet
        // For trending, use chain-specific cache key - CRITICAL: use chain parameter (not ref)
        const cacheChain = chain || 'sol';
        const cacheKey = filter === 'trending' || cacheChain === 'monad'
          ? `trending_${cacheChain}_${currentTimeframe || '1h'}_${TRENDING_CACHE_VERSION}`
          : url;
        
        console.log(`[Cache] Checking cache for key: ${cacheKey} (chain: ${cacheChain}, timeframe: ${currentTimeframe})`);
        const cached = getCached<any[]>(cacheKey);
        if (cached && state.data.length === 0) {
          console.log(`[Cache] ✅ Cache HIT for ${cacheKey}, loading ${cached.length} tokens`);
          // throttledSetData sets both data AND loading: false
          throttledSetData(cached);
          // Only clear error here - loading is handled by throttledSetData
          setState(prev => ({ ...prev, error: null }));
        } else if (cached) {
          console.log(`[Cache] ✅ Cache HIT for ${cacheKey}, but data already exists`);
        } else {
          console.log(`[Cache] ❌ Cache MISS for ${cacheKey}`);
        }

        // console.log('📡 Polling response status:', response.status, response.ok);
        
        // Treat 304 Not Modified as a successful no-op: keep current list stable
        if (response.status === 304) {
          // console.log('📡 Upstream returned 304 (Not Modified) — keeping existing data');
          // Only clear error - don't set loading: false if we have no data yet
          setState(prev => {
            if (prev.data.length > 0) {
              return { ...prev, loading: false, error: null };
            }
            // Keep loading true if no data yet - don't show "No tokens found"
            return { ...prev, error: null };
          });
          return;
        }

        if (response.ok) {
          // CRITICAL: Check again before processing response - use refs for current values
          if (currentRequestTimeframeRef.current !== timeframe || currentChainRef.current !== chain) {
            console.log('🚫 Ignoring response - timeframe/chain changed during fetch');
            return;
          }
          
          // For trending filter, data was already fetched above in parallel requests
          // For other filters, parse the response
          if (!data) {
            data = await response.json();
          }
          
          //console.log('📡 Polling data received:', data?.result?.length || data?.length, 'tokens');
          
          // Filter boring tokens (stablecoins, infrastructure tokens, etc.)
          // Chain-specific filtering - use ref for current chain
          const isMonadChain = currentChain === 'monad';
          
          // Common boring patterns for both chains
          const COMMON_BORING_SYMBOL_PATTERNS = [
            'USDC',
            'USDT',
            'USDS',
            'DAI',
            'USD',
            'SOL',
            'WSOL',
            'BTC',
            'ETH',
            'BNSOL',
            'BBSOL',
            'JITO',
            'JUP',
            'BONK',
            'WIF',
          ];
          
          // Solana-specific boring patterns
          const SOLANA_BORING_SYMBOL_PATTERNS = [
            ...COMMON_BORING_SYMBOL_PATTERNS,
            'WETH',
            'WBTC',
            'RAY', // Raydium
          ];
          
          // Monad-specific boring patterns
          const MONAD_BORING_SYMBOL_PATTERNS = [
            ...COMMON_BORING_SYMBOL_PATTERNS,
            'MON', // Monad token itself
          ];
          
          // Common boring name patterns
          const COMMON_BORING_NAME_PATTERNS = [
            'jupiter',
            'orca',
            'staked',
            'binance',
            'bybit',
            'wormhole',
            'bitcoin',
            'ethereum',
          ];
          
          // Solana-specific boring name patterns
          const SOLANA_BORING_NAME_PATTERNS = [
            ...COMMON_BORING_NAME_PATTERNS,
            'meteora',
            'pump',
            'raydium',
            'wrapped',
            'zcash',
            'useless coin',
            'useless',
            'u.s. crypto reserve index',
            'us crypto reserve index',
            'gemini ai',
          ];
          
          // Monad-specific boring name patterns
          const MONAD_BORING_NAME_PATTERNS = [
            ...COMMON_BORING_NAME_PATTERNS,
            'wrapped btc',
            'wrapped bitcoin',
            'wrapped ether',
            'wrapped ethereum',
            'monad',
          ];
          
          function isBoringToken(t: any): boolean {
            const rawSymbol = (t.symbol || '');
            const rawName = (t.name || '');
            const symbol = rawSymbol.replace(/^\$/,'').toUpperCase();
            const bareSymbol = symbol.replace(/[^A-Z0-9]/g, '');
            const name = rawName.replace(/^\$/,'').toLowerCase();
            
            // Use chain-specific patterns
            const symbolPatterns = isMonadChain ? MONAD_BORING_SYMBOL_PATTERNS : SOLANA_BORING_SYMBOL_PATTERNS;
            const namePatterns = isMonadChain ? MONAD_BORING_NAME_PATTERNS : SOLANA_BORING_NAME_PATTERNS;
            
            // Check if symbol matches any pattern
            const symbolBlocked = symbolPatterns.some(p => {
              // Exact match or contains pattern
              if (bareSymbol === p) return true;
              return bareSymbol.includes(p);
            });
            
            // Check if name matches any pattern
            const nameBlocked = namePatterns.some(p => {
              // Exact match or contains pattern
              if (name === p) return true;
              // For "Wrapped", check if name starts with "wrapped"
              if (p === 'wrapped') {
                return name.includes('wrapped');
              }
              return name.includes(p);
            });
            
            // Monad-specific: Filter out exact matches
            if (isMonadChain) {
              // Filter out "Wrapped BTC", "Wrapped Ether", "Monad"
              if (bareSymbol === 'WBTC' || name.includes('wrapped btc') || name.includes('wrapped bitcoin')) return true;
              if (bareSymbol === 'WETH' || name.includes('wrapped ether') || name.includes('wrapped ethereum')) return true;
              if (name.includes('wrapped')) return true;
              if (bareSymbol === 'MON' || name === 'monad') return true;
            }
            
            // Solana-specific: Filter out tokens starting with "Wrapped", "Meteora", "Zcash", "Pump", "useless coin", "Raydium"
            if (!isMonadChain) {
              if (name.startsWith('wrapped')) return true;
              if (name.startsWith('meteora')) return true;
              if (name.startsWith('zcash')) return true;
              if (name.startsWith('pump')) return true;
              if (name.includes('useless coin') || name === 'useless') return true;
              if (name.startsWith('raydium')) return true;
              if (name.includes('u.s. crypto reserve index') || name.includes('us crypto reserve index')) return true;
              if (name.includes('gemini ai')) return true;
              if (bareSymbol === 'ETH') return true;
            }
            
            return symbolBlocked || nameBlocked;
          }
          
          // Handle both wrapped and direct array responses
          let tokens = data.result || data;
          
          // Transform Birdeye format to Token format if needed (for trending filter or Monad chain)
          // Use the same isMonadChain variable defined earlier for consistency
          console.log(`[Birdeye] Processing data - filter: ${filter}, isMonadChain: ${isMonadChain}, currentChainRef: ${currentChainRef.current}, chain param: ${chain}`);
          if (filter === 'trending' || isMonadChain) {
            // Birdeye API returns: { data: { tokens: [...], total: number }, success: true }
            if (data?.data?.tokens && Array.isArray(data.data.tokens)) {
              console.log(`[Birdeye] Transforming ${data.data.tokens.length} tokens from Birdeye format`);
              tokens = data.data.tokens.map((token: any) => {
                // Helper to safely convert to number
                const toNum = (val: any): number => {
                  if (typeof val === 'number' && Number.isFinite(val)) return val;
                  if (typeof val === 'string') {
                    const parsed = parseFloat(val);
                    return Number.isFinite(parsed) ? parsed : 0;
                  }
                  return 0;
                };

                return {
                  // Core identifiers
                  mint: token.address || '',
                  pair_address: token.address || '', // Use address as pair_address for Birdeye tokens
                  
                  // Basic info
                  name: token.name || '',
                  symbol: token.symbol || '',
                  decimals: token.decimals || 9,
                  logo: token.logoURI || token.logo || '',
                  
                  // Price data
                  usd_price: toNum(token.price),
                  price_percent_change_24h: toNum(token.price24hChangePercent),
                  price_percent_change_1h: toNum(token.price24hChangePercent), // Use 24h as fallback
                  price_percent_change_6h: 0,
                  price_percent_change_5m: 0,
                  
                  // Market data
                  market_cap_usd: toNum(token.marketcap),
                  fully_diluted_value: toNum(token.fdv),
                  total_liquidity_usd: toNum(token.liquidity),
                  total_fully_diluted_valuation: toNum(token.fdv),
                  
                  // Volume data
                  volume_24h: toNum(token.volume24hUSD),
                  volume_1h: 0, // Not available from Birdeye
                  volume_6h: 0,
                  volume_5m: 0,
                  total_buy_volume_24h: 0,
                  total_sell_volume_24h: 0,
                  total_buy_volume_1h: 0,
                  total_sell_volume_1h: 0,
                  total_buy_volume_6h: 0,
                  total_sell_volume_6h: 0,
                  total_buy_volume_5m: 0,
                  total_sell_volume_5m: 0,
                  
                  // Transaction data
                  total_buys_24h: 0,
                  total_sells_24h: 0,
                  total_buys_1h: 0,
                  total_sells_1h: 0,
                  total_buys_6h: 0,
                  total_sells_6h: 0,
                  total_buys_5m: 0,
                  total_sells_5m: 0,
                  
                  // Holder data
                  total_buyers_24h: 0,
                  total_sellers_24h: 0,
                  total_buyers_1h: 0,
                  total_sellers_1h: 0,
                  total_buyers_6h: 0,
                  total_sellers_6h: 0,
                  total_buyers_5m: 0,
                  total_sellers_5m: 0,
                  unique_wallets_24h: 0,
                  unique_wallets_1h: 0,
                  unique_wallets_6h: 0,
                  unique_wallets_5m: 0,
                  
                  // Other required fields
                  id: 0,
                  standard: 'SPL',
                  metaplex: null,
                  total_supply: 0,
                  total_supply_formatted: 0,
                  links: null,
                  description: '',
                  is_verified_contract: false,
                  possible_spam: false,
                  sol_price: 0,
                  total_snipers: 0,
                  total_holders: 0,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  bonding_curve_progress: 0,
                  
                  // For TXNS column: use rank from Birdeye (trending position)
                  // This provides meaningful data when transaction counts aren't available
                  birdeye_rank: token.rank || 0,
                  volume24hChangePercent: token.volume24hChangePercent || 0,
                };
              });
              
              console.log(`[Birdeye] Transformed ${tokens.length} tokens. First token sample:`, tokens[0] ? {
                mint: tokens[0].mint,
                name: tokens[0].name,
                symbol: tokens[0].symbol,
                birdeye_rank: tokens[0].birdeye_rank,
                volume_24h: tokens[0].volume_24h,
              } : 'No tokens');
              
              // Filter out boring tokens (stablecoins, infrastructure tokens, mega-caps, high volume/liquidity)
              // This filtering happens client-side on all tokens fetched from Birdeye
              const beforeFilter = tokens.length;
              console.log(`[Filter] Starting filter for ${isMonadChain ? 'Monad' : 'Solana'} chain. Before filter: ${beforeFilter} tokens`);
              
              // Debug: Log first few tokens before filtering
              if (tokens.length > 0) {
                console.log(`[Filter] Sample tokens before filtering:`, tokens.slice(0, 5).map(t => ({
                  symbol: t.symbol,
                  name: t.name,
                  volume_24h: t.volume_24h,
                  market_cap_usd: t.market_cap_usd
                })));
              }
              
              tokens = tokens.filter((token: any) => {
                // Skip boring tokens (stablecoins, infrastructure)
                if (isBoringToken(token)) {
                  console.log(`[Filter] ❌ Filtered out boring token: ${token.symbol} (${token.name})`);
                  return false;
                }
                
                const volume24h = token.volume_24h || 0;
                const liquidity = token.total_liquidity_usd || 0;
                
                // Filter out extreme mega-caps (leave plenty of room for larger names)
                const marketCap = token.market_cap_usd || 0;
                if (marketCap > 1_000_000_000) { // > $1B
                  return false;
                }
                // For Monad, use more lenient thresholds since it's a newer chain
                const minMarketCap = isMonadChain ? 5_000 : 20_000; // $5k for Monad, $20k for Solana
                if (marketCap < minMarketCap) {
                  return false;
                }
                
                // Filter out tokens with effectively no trading activity
                // For Monad, use more lenient volume threshold since it's a newer chain
                const minVolume = isMonadChain ? 1_000 : 5_000; // $1k for Monad, $5k for Solana
                if (volume24h < minVolume) {
                  return false;
                }
                
                return true;
              });
              
              // Limit to top 50 after filtering (or more for Monad if we have them)
              const maxTokens = isMonadChain ? 100 : 50; // Show up to 100 for Monad, 50 for Solana
              tokens = tokens.slice(0, maxTokens);
              
              console.log(`[Filter] ✅ Filtered ${beforeFilter} tokens down to ${tokens.length} memecoins/degen tokens (max 50) for ${isMonadChain ? 'Monad' : 'Solana'}`);
              
              // Debug: Log first few tokens after filtering
              if (tokens.length > 0) {
                console.log(`[Filter] Sample tokens after filtering:`, tokens.slice(0, 5).map(t => ({
                  symbol: t.symbol,
                  name: t.name,
                  volume_24h: t.volume_24h,
                  market_cap_usd: t.market_cap_usd
                })));
              } else {
                console.warn(`[Filter] ⚠️ No tokens passed filtering! Check filter logic.`);
              }
              if (tokens.length > 0) {
                console.log(`[Birdeye] First filtered token:`, {
                  mint: tokens[0]?.mint,
                  name: tokens[0]?.name,
                  symbol: tokens[0]?.symbol,
                  usd_price: tokens[0]?.usd_price,
                  volume_24h: tokens[0]?.volume_24h,
                  market_cap_usd: tokens[0]?.market_cap_usd,
                  total_liquidity_usd: tokens[0]?.total_liquidity_usd
                });
                console.log(`[Birdeye] Sample of filtered tokens (first 5):`, tokens.slice(0, 5).map(t => ({
                  symbol: t.symbol,
                  volume_24h: t.volume_24h,
                  liquidity: t.total_liquidity_usd,
                  marketCap: t.market_cap_usd
                })));
              } else {
                console.warn(`[Birdeye] ⚠️ No tokens passed filtering! This might indicate overly aggressive filters.`);
                console.warn(`[Birdeye] Consider adjusting filter thresholds. Before filter: ${beforeFilter} tokens`);
              }
            } else {
              console.warn('[Birdeye] Unexpected response format:', data);
              tokens = [];
            }
          } else {
            // For non-trending filters, handle wrapped response format
            tokens = data.result || data;
          }
          
          // CRITICAL: Final check before setting data
          // if (currentRequestTimeframeRef.current !== timeframe) {
          //   console.log('🚫 Ignoring tokens data - timeframe changed:', {
          //     requestTimeframe: currentRequestTimeframeRef.current,
          //     currentTimeframe: timeframe
          //   });
          //   return;
          // }
          
          // // Debug: Check the first token's price data
          // if (tokens && Array.isArray(tokens) && tokens[0]) {
          //   console.log('📡 First token price debug:', {
          //     name: tokens[0].name,
          //     symbol: tokens[0].symbol,
          //     usd_price: tokens[0].usd_price,
          //     fully_diluted_value: tokens[0].fully_diluted_value,
          //     total_liquidity_usd: tokens[0].total_liquidity_usd,
          //     typeof_usd_price: typeof tokens[0].usd_price,
          //     typeof_fdv: typeof tokens[0].fully_diluted_value
          //   });
          // }
          
          if (tokens && Array.isArray(tokens)) {
            console.log(`🔧 Setting ${tokens.length} tokens for chain: ${currentChainRef.current || chain}, timeframe: ${currentRequestTimeframeRef.current || timeframe}`);
            console.log('🔧 First token:', tokens[0] ? { 
              name: tokens[0].name, 
              symbol: tokens[0].symbol,
              mint: tokens[0].mint,
              volume_24h: tokens[0].volume_24h,
              market_cap_usd: tokens[0].market_cap_usd
            } : 'No tokens');
            // throttledSetData sets both data AND loading: false, so don't set loading separately
            throttledSetData(tokens);
            // Cache fresh tokens with chain-specific key and longer TTL for cross-chain persistence
            // Use 2 minutes TTL for trending tokens (longer than 15s to persist across chain switches)
            // CRITICAL: Use chain parameter (not ref) to ensure correct cache key
            const cacheChain = chain || 'sol';
            const cacheKey = filter === 'trending' || cacheChain === 'monad'
              ? `trending_${cacheChain}_${currentTimeframe || '1h'}_${TRENDING_CACHE_VERSION}`
              : url;
            const cacheTTL = filter === 'trending' ? 120_000 : 15_000; // 2 minutes for trending, 15s for others
            setCached(cacheKey, tokens, cacheTTL);
            console.log(`[Cache] 💾 Cached ${tokens.length} tokens with key: ${cacheKey} (chain: ${cacheChain}, timeframe: ${currentTimeframe}), TTL: ${cacheTTL}ms`);
            // Only clear error here - loading is handled by throttledSetData
            setState(prev => ({ ...prev, error: null }));
          } else {
            console.error(`🔧 ❌ tokens is not an array or is null:`, { 
              tokens, 
              isArray: Array.isArray(tokens),
              type: typeof tokens,
              chain: currentChainRef.current || chain
            });
            // Still set empty array to clear loading state
            throttledSetData([]);
            setState(prev => ({ 
              ...prev, 
              // Keep loading true if no data yet - prevents "No tokens found" from showing prematurely
              loading: prev.data.length === 0 ? true : false, 
              error: prev.data.length === 0 ? 'Invalid data from token service' : null 
            }));
          }
        } else {
          // Non-OK response; keep existing data but don't show error unless we have no data
          console.warn('📡 Non-OK response from token service:', response.status);
          setState(prev => ({ 
            ...prev, 
            // Keep loading true if no data yet - prevents premature "No tokens found"
            loading: prev.data.length === 0 ? true : false, 
            // Only show error if we don't have any data yet
            error: prev.data.length === 0 ? `Upstream error (${response.status})` : null 
          }));
        }
      } catch (error: any) {
        // Ignore abort errors - they're expected when switching timeframes/chains
        if (error?.name === 'AbortError') {
          console.log('🚫 Polling request aborted (timeframe/chain changed)');
          return;
        }
        console.error('❌ Polling error:', error?.message || error);
        // Only update state if timeframe and chain haven't changed - use refs for current values
        if (currentRequestTimeframeRef.current === timeframe && currentChainRef.current === chain) {
          setState(prev => ({ 
            ...prev, 
            // Only show error if we don't have any data yet
            error: prev.data.length === 0 ? `Failed to fetch data: ${error?.message || 'Unknown error'}` : null, 
            // Keep loading true if no data yet - prevents premature "No tokens found"
            loading: prev.data.length === 0 ? true : false
          }));
        }
      } finally {
        isPollingRef.current = false;
        abortControllerRef.current = null;
      }
    };

    // Initial poll - start immediately (no delay)
    // CRITICAL: Ensure refs are up-to-date before calling poll
    currentRequestTimeframeRef.current = timeframe;
    currentChainRef.current = chain;
    console.log(`🔄 Starting immediate poll for chain: ${currentChainRef.current || chain}, filter: ${filter}, timeframe: ${timeframe}`);
    // Call poll immediately - it will check cache first, then fetch if needed
    poll();

    // Set up polling interval
    // PRODUCTION OPTIMIZATION: Use shorter interval initially (1s) for faster first load
    // This helps in production where WebSocket might be blocked and we need faster fallback
    // After data is received, the interval will be increased to 3s (done via throttledSetData check)
    pollIntervalRef.current = setInterval(() => {
      poll();
      // If we have data, switch to longer interval to reduce server load
      if (lastStableDataRef.current && lastStableDataRef.current.length > 0) {
        clearInterval(pollIntervalRef.current!);
        pollIntervalRef.current = setInterval(poll, 3000);
      }
    }, 1000); // Start with 1s for faster initial production load
  }, [filter, order, offset, limit, timeframe, chain, throttledSetData]);

  // Clear polling
  const clearPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    isPollingRef.current = false;
    // Also abort any in-flight polling requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Effect for managing connection (WebSocket + fallback)
  useEffect(() => {
    // CRITICAL: Log when effect runs to track chain/timeframe changes
    const previousChain = lastChainRef.current;
    const previousTimeframe = lastTimeframeRef.current;
    const chainChanged = previousChain !== chain;
    const timeframeChanged = previousTimeframe !== timeframe;
    
    console.log('🔄 Hook useEffect triggered:', {
      chain: chain,
      previousChain: previousChain,
      chainChanged: chainChanged,
      timeframe: timeframe,
      previousTimeframe: previousTimeframe,
      timeframeChanged: timeframeChanged,
      filter: filter
    });
    
    // CRITICAL: Abort any in-flight requests from previous timeframe/chain
    if (abortControllerRef.current) {
      console.log('🚫 Aborting previous request due to timeframe/chain change');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Clear previous max loading timeout
    if (maxLoadingTimeoutRef.current) {
      clearTimeout(maxLoadingTimeoutRef.current);
      maxLoadingTimeoutRef.current = null;
    }
    
    // Update current request timeframe and chain IMMEDIATELY to track which timeframe/chain is being requested
    currentRequestTimeframeRef.current = timeframe;
    currentChainRef.current = chain;
    
    // CRITICAL: Clear stable data reference and STOP any existing polling FIRST when timeframe or chain changes
    // This must happen BEFORE checking cache to ensure clean state
    if (lastTimeframeRef.current !== timeframe || lastChainRef.current !== chain) {
      console.log('🧹 Clearing stable data reference due to timeframe/chain change:', {
        oldTimeframe: lastTimeframeRef.current,
        newTimeframe: timeframe,
        oldChain: lastChainRef.current,
        newChain: chain
      });
      // Clear stable data reference - this prevents old data from being used
      lastStableDataRef.current = null;
      // CRITICAL: Clear any existing polling interval when timeframe/chain changes
      clearPolling();
      // Update the last timeframe and chain references IMMEDIATELY
      lastTimeframeRef.current = timeframe;
      lastChainRef.current = chain;
    }
    
    // CRITICAL: If chain changed, clear data immediately to prevent showing stale data from previous chain
    if (chainChanged) {
      console.log(`🔄 Chain changed from ${previousChain} to ${chain}, clearing data immediately`);
      setState(prev => ({ 
        ...prev, 
        loading: true, 
        isConnected: false, 
        error: null, 
        usingFallback: false, 
        data: [] // Clear data immediately when chain changes
      }));
    }
    
    // Check cache for the NEW chain - this allows instant loading when switching chains
    // CRITICAL: Use chain parameter directly (not ref) to ensure correct cache key
    let hasCache = false;
    if (filter === 'trending' || chain === 'monad') {
      const cacheChain = chain || 'sol';
      const cacheKey = `trending_${cacheChain}_${timeframe || '1h'}_${TRENDING_CACHE_VERSION}`;
      console.log(`[Cache] Checking cache for chain: ${cacheChain}, key: ${cacheKey}`);
      const cached = getCached<any[]>(cacheKey);
      if (cached && cached.length > 0) {
        console.log(`[Cache] ✅ Found cache for chain ${cacheChain}, loading ${cached.length} tokens immediately`);
        hasCache = true;
        // Use cached data immediately
        throttledSetData(cached);
        setState(prev => ({ 
          ...prev, 
          loading: false, 
          isConnected: false, 
          error: null, 
          usingFallback: true, 
          data: cached // Use cached data immediately
        }));
        // Still start polling in background to refresh data, but don't show loading
        // The effect will continue and start polling below
      } else {
        console.log(`[Cache] ❌ No cache for chain ${cacheChain}, will fetch from API`);
      }
    }
    
    // Set maximum loading timeout - prevents infinite loading in production
    // For Monad, increase timeout since we're fetching multiple pages sequentially
    const timeoutDuration = chain === 'monad' ? 30000 : 15000; // 30s for Monad, 15s for others
    maxLoadingTimeoutRef.current = setTimeout(() => {
      setState(prev => {
        // Only set loading to false if we still have no data after timeout
        if (prev.data.length === 0 && prev.loading) {
          console.error(`⏰ Maximum loading timeout reached (${timeoutDuration/1000}s) - no data received yet for chain: ${chain}`);
          console.error(`⏰ Current chain ref: ${currentChainRef.current}, timeframe: ${currentRequestTimeframeRef.current}`);
          return {
            ...prev,
            loading: false,
            error: prev.error || `Loading timeout after ${timeoutDuration/1000}s - please check network requests or refresh`
          };
        }
        return prev;
      });
    }, timeoutDuration);

    let pingInterval: NodeJS.Timeout | null = null;

    const connectWebSocket = () => {
      try {
        // PRODUCTION FIX: Don't clear polling - let it run in parallel with WebSocket
        // This ensures data loads even if WebSocket fails in production
        // clearPolling(); // Disabled - let polling continue as backup

        const queryParams = new URLSearchParams({
          filter: filter || 'new',
          order: order || 'desc',
          offset: (offset || 0).toString(),
          limit: (limit || 20).toString(),
        });
        // Include timeframe in WS connection so server returns correct window
        // STRICTLY enforce: only include timeframe if it's provided
        if (timeframe && (timeframe === '5m' || timeframe === '1h' || timeframe === '6h' || timeframe === '24h')) {
          queryParams.set('timeframe', timeframe);
          // console.log('🔌 WebSocket: Using timeframe:', timeframe);
        } else {
          console.warn('🔌 WebSocket: Invalid or missing timeframe, skipping:', timeframe);
        }
        const wsUrl = `${env.NEXT_PUBLIC_WEBSOCKET_URL.replace(/^http/, 'ws')}/v1/ws/tokens?${queryParams}`;
        // console.log('🔌 Attempting WebSocket connection to:', wsUrl);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        // Set a connection timeout - shorter for faster fallback
        wsConnectionTimeoutRef.current = setTimeout(() => {
          if (ws.readyState === WebSocket.CONNECTING) {
            console.log('⏰ WebSocket connection timeout, falling back to polling');
            setState(prev => ({ ...prev, usingFallback: true, loading: true, error: null }));
            ws.close();
            // PRODUCTION FIX: Start polling instead of trying to reconnect WebSocket
            // This ensures data loads in production even if WebSocket is blocked/fails
            startPolling();
          }
        }, 3000); // Reduced from 5s to 3s for faster fallback

        ws.onopen = () => {
          if (wsConnectionTimeoutRef.current) {
            clearTimeout(wsConnectionTimeoutRef.current);
            wsConnectionTimeoutRef.current = null;
          }
          console.log('✅ WebSocket connected successfully!');
          setState(prev => ({ ...prev, isConnected: true, isReconnecting: false, error: null, usingFallback: false }));
          reconnectAttemptRef.current = 0;
          
          // Send a ping to request data
          try {
            ws.send('ping');
            console.log('📤 Sent ping to WebSocket server');
          } catch (error) {
            console.error('Failed to send ping:', error);
          }
          
          // Set a timeout to detect if no data is received - shorter timeout for faster fallback
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN && state.data.length === 0) {
              console.log('⏰ No data received from WebSocket after 2 seconds, falling back to polling');
              setState(prev => ({ ...prev, usingFallback: true, loading: true, error: null }));
              ws.close();
              startPolling();
            }
          }, 2000); // Reduced from 3s to 2s for faster fallback
        };

        ws.onmessage = (event) => {
          const handleText = (text: string) => {
            const trimmed = text.trim();
            if (!trimmed) return;
            if (trimmed === 'ping' || trimmed === 'pong' || trimmed === 'ok') return;

            const deliver = (payload: any) => {
              console.log('🔌 WebSocket message received:', {
                messageType: typeof payload,
                isArray: Array.isArray(payload),
                length: Array.isArray(payload) ? payload.length : 'not array',
                firstItem: Array.isArray(payload) && payload[0] ? {
                  name: payload[0].name,
                  symbol: payload[0].symbol,
                  usd_price: payload[0].usd_price,
                  fully_diluted_value: payload[0].fully_diluted_value,
                  total_liquidity_usd: payload[0].total_liquidity_usd
                } : 'no first item'
              });
              throttledSetData(payload);
            };

            // Try parse as single JSON first
            try {
              const message = JSON.parse(trimmed);
              return deliver(message);
            } catch (_) {}

            // Handle concatenated/newline-delimited JSON
            const fixed = trimmed
              .replace(/}\s*{/g, '}\n{')
              .replace(/]\s*\[/g, ']\n[');
            const parts = fixed.split(/\r?\n+/);
            for (const part of parts) {
              const p = part.trim();
              if (!p || p === 'ping' || p === 'pong' || p === 'ok') continue;
              try {
                const msg = JSON.parse(p);
                deliver(msg);
              } catch (err) {
                console.warn('Skipping non-JSON WS chunk:', p.slice(0, 120));
              }
            }
          };

          const data = (event as MessageEvent).data;
          if (typeof data === 'string') {
            handleText(data);
          } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
            data.text().then(handleText).catch(err => console.error('Failed to read WS Blob:', err));
          } else if (data instanceof ArrayBuffer) {
            try {
              handleText(new TextDecoder().decode(data));
            } catch (err) {
              console.error('Failed to decode WS ArrayBuffer:', err);
            }
          } else {
            try {
              handleText(String(data));
            } catch (err) {
              console.error('Failed to stringify WS data:', err);
            }
          }
        };

        ws.onclose = (event) => {
          if (wsConnectionTimeoutRef.current) {
            clearTimeout(wsConnectionTimeoutRef.current);
            wsConnectionTimeoutRef.current = null;
          }
          if (pingInterval) {
            clearInterval(pingInterval);
          }
          //console.log('WebSocket connection closed with code:', event.code, 'reason:', event.reason);
          setState(prev => ({ ...prev, isConnected: false }));
          
          // PRODUCTION FIX: For trending filter, always fall back to polling (WebSocket doesn't support it)
          // Also fall back if connection closed abnormally (1006) or we have no data
          if (filter === 'trending' || event.code === 1006 || state.data.length === 0) {
            console.log(`📡 WebSocket closed (code: ${event.code}, filter: ${filter}) - falling back to polling`);
            setState(prev => ({ ...prev, usingFallback: true, loading: prev.data.length === 0 ? true : prev.loading, error: null }));
            startPolling();
            return;
          }
          
          // Don't reconnect if the component is unmounted or the close was intentional
          if (wsRef.current) {
            handleReconnect();
          }
        };

        // Set up periodic ping to keep connection alive
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send('ping');
              //console.log('📤 Sent periodic ping to WebSocket server');
            } catch (error) {
              console.error('Failed to send periodic ping:', error);
              clearInterval(pingInterval);
            }
          } else {
            clearInterval(pingInterval);
          }
        }, 30000); // Ping every 30 seconds

        ws.onerror = (error) => {
          if (wsConnectionTimeoutRef.current) {
            clearTimeout(wsConnectionTimeoutRef.current);
            wsConnectionTimeoutRef.current = null;
          }
          console.error('WebSocket error:', error);
          
          // PRODUCTION FIX: For trending filter, immediately start polling (WebSocket doesn't support it)
          // For other filters, try reconnect first
          if (filter === 'trending') {
            console.log('📡 WebSocket error for trending filter - starting polling immediately');
            setState(prev => ({ 
              ...prev, 
              usingFallback: true,
              loading: prev.data.length === 0 ? true : prev.loading,
              error: null 
            }));
            startPolling();
            return;
          }
          
          // Trigger fallback immediately when WebSocket errors occur
          // Don't set error state yet - let polling try first
          //console.log('🚨 WebSocket error detected, triggering fallback to polling');
          setState(prev => ({ 
            ...prev, 
            usingFallback: true,
            // Keep loading true until polling starts
            loading: prev.data.length === 0 ? true : prev.loading,
            // Don't set error if we're about to fall back - polling will handle errors
            error: null 
          }));
          handleReconnect();
        };
      } catch (error) {
        console.error('Failed to establish WebSocket connection:', error);
        // Set fallback state immediately, don't show error yet
        setState(prev => ({ 
          ...prev, 
          usingFallback: true,
          // Keep loading true until polling starts
          loading: prev.data.length === 0 ? true : prev.loading,
          error: null 
        }));
        handleReconnect();
      }
    };

    const handleReconnect = () => {
      //console.log('🔄 handleReconnect called, attempt:', reconnectAttemptRef.current, 'max:', maxReconnectAttempts);
      
      if (reconnectAttemptRef.current >= maxReconnectAttempts) {
        //console.log('✅ Max WebSocket reconnect attempts reached, falling back to polling');
        // Start polling immediately - don't wait
        startPolling();
        return;
      }
      
      // For initial connection failure, fall back immediately instead of retrying
      // Only retry if we had a successful connection that then dropped
      if (reconnectAttemptRef.current === 0 && state.data.length === 0) {
        // First failure with no data - fall back to polling immediately
        //console.log('🚨 Initial WebSocket connection failed, falling back to polling immediately');
        startPolling();
        return;
      }
      
      setState(prev => ({ ...prev, isReconnecting: true }));
      reconnectAttemptRef.current += 1;
      //console.log('🔄 Incremented reconnect attempt to:', reconnectAttemptRef.current);
      
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current - 1), 8000);
      //console.log('🔄 Scheduling WebSocket reconnect in', delay, 'ms');
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
    };

    // PRODUCTION FIX: For trending filter OR Monad chain, skip WebSocket entirely and use HTTP polling only
    // WebSocket endpoint (/v1/ws/tokens) doesn't support "trending" filter - only supports "new", "final_stretch", "migrated"
    // Monad chain always uses Birdeye API (not WebSocket)
    // This prevents unnecessary WebSocket connection attempts that will fail
    if (filter === 'trending' || chain === 'monad') {
      console.log(`📡 ${chain === 'monad' ? 'Monad chain' : 'Trending filter'} detected - using HTTP polling only (WebSocket not supported)`);
      // CRITICAL: If chain changed, ensure we start fresh - don't use cache if chain changed
      // This ensures we always fetch fresh data for the new chain
      if (chainChanged && !hasCache) {
        console.log(`📡 Chain changed to ${chain} - starting fresh fetch (no cache)`);
      }
      // Start polling immediately (even if we have cache, we want to refresh in background)
      // If we have cache, polling will update data when new data arrives
      startPolling();
    } else {
      // For other filters (new, migrated, final_stretch), try WebSocket first
      // PRODUCTION FIX: Start polling immediately in parallel with WebSocket attempt
      // This ensures data loads in production even if WebSocket is blocked/fails
      // Don't wait for WebSocket - start polling right away as a parallel backup
      startPolling();
      
      // Also try WebSocket, but don't wait for it
      connectWebSocket();
    }
    
    return () => {
      // Clear max loading timeout
      if (maxLoadingTimeoutRef.current) {
        clearTimeout(maxLoadingTimeoutRef.current);
        maxLoadingTimeoutRef.current = null;
      }
      // Abort any in-flight requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      clearPolling();
      if (pingInterval) {
        clearInterval(pingInterval);
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsConnectionTimeoutRef.current) {
        clearTimeout(wsConnectionTimeoutRef.current);
      }
      // throttledSetData.cancel(); // Removed since we removed throttling
      if (wsRef.current) {
        const ws = wsRef.current;
        wsRef.current = null; // Prevent reconnection on intentional close
        ws.close();
      }
    };
  }, [filter, order, offset, limit, timeframe, chain, throttledSetData, startPolling, clearPolling]); // chain is in deps - will re-run when chain changes

  return state;
}
