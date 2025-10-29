import { useEffect, useRef, useState, useCallback } from "react";
import throttle from "lodash.throttle";
import { env } from "../env";

interface UsePaginatedTokensParams {
  filter?: string;
  order?: string;
  offset?: number;
  limit?: number;
  timeframe?: string;
}

interface TokensState {
  data: any[];
  loading: boolean;
  isConnected: boolean;
  isReconnecting: boolean;
  error: string | null;
  usingFallback: boolean;
}

export default function usePaginatedTokensWithFallback({
  filter = 'new',
  order = 'desc',
  offset = 0,
  limit = 20,
  timeframe,
}: UsePaginatedTokensParams = {}) {
  console.log('🔧 [HOOK] usePaginatedTokensWithFallback called with:', { filter, order, offset, limit, timeframe });
  
  // Early return if limit is 0 (used to disable the hook)
  if (limit === 0) {
    console.log('🔧 [HOOK] Disabled - limit is 0, returning empty state');
    return {
      data: [],
      loading: false,
      isConnected: false,
      isReconnecting: false,
      error: null,
      usingFallback: false,
    };
  }
  
  console.log('🔧 Environment check:', {
    WEBSOCKET_URL: env.NEXT_PUBLIC_WEBSOCKET_URL,
    BACKEND_URL: env.NEXT_PUBLIC_BACKEND_URL
  });
  
  const [state, setState] = useState<TokensState>({
    data: [],
    loading: true,
    isConnected: false,
    isReconnecting: false,
    error: null,
    usingFallback: false,
  });

  console.log('🔧 Current state:', { dataLength: state.data.length, loading: state.loading, usingFallback: state.usingFallback });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef<boolean>(false);
  // Fail fast to polling to avoid empty UI states when returning to Discover
  const maxReconnectAttempts = 0; // 0 = try once, then fall back immediately
  const reconnectAttemptRef = useRef(0);
  const wsConnectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const lastStableDataRef = useRef<any[] | null>(null);
  const lastTimeframeRef = useRef<string | undefined>(timeframe);
  const currentRequestTimeframeRef = useRef<string | undefined>(timeframe);

  // Stabilize incoming lists to avoid jarring dips (e.g., 2 items on 5m)
  const stabilizeList = useCallback((incoming: any[]): any[] => {
    try {
      const lim = (limit || 20);
      const prev = lastStableDataRef.current;
      const minCount = Math.max(5, Math.floor(lim * 0.4));

      // Reset stability baseline if timeframe changed - IMPORTANT: don't use prev data from different timeframe
      if (lastTimeframeRef.current !== timeframe) {
        console.log('⏱️ Timeframe changed from', lastTimeframeRef.current, 'to', timeframe, '- clearing previous list to prevent data clash');
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
        console.log('🛡️ Stabilizing list: incoming length', incoming.length, '< minCount', minCount);
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

  const throttledSetData = useCallback((newData: any[]) => {
    console.log('🔧 Setting data in hook (raw):', newData?.length, 'tokens, for timeframe:', currentRequestTimeframeRef.current);
    const stable = stabilizeList(newData);
    console.log('🔧 After stabilization:', stable?.length, 'tokens');
    if (stable?.[0]) {
      console.log('🔧 First token data (stable):', {
        name: stable[0].name,
        symbol: stable[0].symbol,
        usd_price: stable[0].usd_price,
        fully_diluted_value: stable[0].fully_diluted_value,
        total_liquidity_usd: stable[0].total_liquidity_usd,
        volume_5m: stable[0].volume_5m,
        volume_1h: stable[0].volume_1h,
        volume_6h: stable[0].volume_6h,
        volume_24h: stable[0].volume_24h,
      });
    }
    setState(prev => {
      // Only update if data actually changed to prevent flickering
      if (JSON.stringify(prev.data) === JSON.stringify(stable)) {
        return prev;
      }
      return { ...prev, data: stable, loading: false };
    });
  }, [stabilizeList]);

  // Polling fallback function
  const startPolling = useCallback(() => {
    console.log('🔄 Starting polling fallback with timeframe:', timeframe);
    setState(prev => ({ ...prev, usingFallback: true, isReconnecting: false }));
    
    const poll = async () => {
      if (isPollingRef.current) {
        // Skip overlapping poll to avoid piling up requests when upstream stalls
        return;
      }
      isPollingRef.current = true;
      try {
        const queryParams = new URLSearchParams({
          filter: filter || 'new',
          order: order || 'desc',
          offset: (offset || 0).toString(),
          limit: (limit || 20).toString(),
        });
        
        // STRICTLY enforce: only include timeframe if it's provided and valid
        if (timeframe && (timeframe === '5m' || timeframe === '1h' || timeframe === '6h' || timeframe === '24h')) {
          queryParams.set('timeframe', timeframe);
          console.log('📡 Polling: Using timeframe:', timeframe);
        } else {
          console.warn('📡 Polling: Invalid or missing timeframe, skipping:', timeframe);
        }
        
        // If env is ws(s)://..., convert to http(s):// for REST polling
        // Always use same-origin proxy to avoid mixed-content/TLS issues
        let url = `/api/token-service/getAllTokens?${queryParams}`;
        
        // Use trending endpoint for trending filter
        if (filter === 'trending') {
          url = `/api/token-service/pulse-trending?${queryParams}`;
        }
        
        console.log('📡 Polling URL:', url);
        console.log('📡 Query params:', Object.fromEntries(queryParams.entries()));
        console.log('📡 Environment WEBSOCKET_URL (for WS only):', env.NEXT_PUBLIC_WEBSOCKET_URL);
        
        const response = await fetch(url);
        console.log('📡 Polling response status:', response.status, response.ok);
        
        // Treat 304 Not Modified as a successful no-op: keep current list stable
        if (response.status === 304) {
          console.log('📡 Upstream returned 304 (Not Modified) — keeping existing data');
          setState(prev => ({ ...prev, loading: false, error: null }));
          return;
        }

        if (response.ok) {
          const data = await response.json();
          console.log('📡 Polling data received:', data?.result?.length || data?.length, 'tokens');
          
          // Handle both wrapped and direct array responses
          const tokens = data.result || data;
          
          // Debug: Check the first token's price data
          if (tokens && Array.isArray(tokens) && tokens[0]) {
            console.log('📡 First token price debug:', {
              name: tokens[0].name,
              symbol: tokens[0].symbol,
              usd_price: tokens[0].usd_price,
              fully_diluted_value: tokens[0].fully_diluted_value,
              total_liquidity_usd: tokens[0].total_liquidity_usd,
              typeof_usd_price: typeof tokens[0].usd_price,
              typeof_fdv: typeof tokens[0].fully_diluted_value
            });
          }
          
          if (tokens && Array.isArray(tokens)) {
            console.log('🔧 Setting tokens data:', tokens.length, 'tokens');
            console.log('🔧 First token:', tokens[0] ? { 
              name: tokens[0].name, 
              symbol: tokens[0].symbol,
              volume_5m: tokens[0].volume_5m,
              volume_1h: tokens[0].volume_1h,
              volume_6h: tokens[0].volume_6h,
              volume_24h: tokens[0].volume_24h
            } : 'No tokens');
            throttledSetData(tokens);
            setState(prev => ({ ...prev, error: null, loading: false }));
          } else {
            console.log('🔧 No valid tokens data received:', { tokens, isArray: Array.isArray(tokens) });
            setState(prev => ({ ...prev, loading: false, error: 'Invalid data from token service' }));
          }
        } else {
          // Non-OK response; keep existing data but don't show error unless we have no data
          console.warn('📡 Non-OK response from token service:', response.status);
          setState(prev => ({ 
            ...prev, 
            loading: false, 
            // Only show error if we don't have any data yet
            error: prev.data.length === 0 ? `Upstream error (${response.status})` : null 
          }));
        }
      } catch (error) {
        console.error('❌ Polling error:', error);
        setState(prev => ({ 
          ...prev, 
          // Only show error if we don't have any data yet
          error: prev.data.length === 0 ? 'Failed to fetch data' : null, 
          loading: false 
        }));
      } finally {
        isPollingRef.current = false;
      }
    };

    // Initial poll
    poll();

    // Set up polling interval (reduced frequency to prevent flickering)
    pollIntervalRef.current = setInterval(poll, 3000);
  }, [filter, order, offset, limit, throttledSetData]);

  // Clear polling
  const clearPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    isPollingRef.current = false;
  }, []);

  // Effect for managing connection (WebSocket + fallback)
  useEffect(() => {
    console.log('🔄 Hook useEffect triggered with params:', { filter, order, offset, limit, timeframe });
    console.log('🔄 Previous state:', { dataLength: state.data.length, loading: state.loading });
    console.log('🔄 Starting fresh data fetch for timeframe:', timeframe);
    console.log('🔄 Timeframe type:', typeof timeframe, 'value:', JSON.stringify(timeframe));
    
    // Update current request timeframe IMMEDIATELY to track which timeframe is being requested
    currentRequestTimeframeRef.current = timeframe;
    
    // Clear existing data when timeframe changes to prevent stale data display
    setState(prev => ({ ...prev, loading: true, isConnected: false, error: null, usingFallback: false, data: [] }));
    
    // Clear stable data reference when timeframe changes
    if (lastTimeframeRef.current !== timeframe) {
      console.log('🧹 Clearing stable data reference due to timeframe change');
      lastStableDataRef.current = null;
    }

    let pingInterval: NodeJS.Timeout | null = null;

    const connectWebSocket = () => {
      try {
        clearPolling(); // Stop polling when attempting WebSocket

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
          console.log('🔌 WebSocket: Using timeframe:', timeframe);
        } else {
          console.warn('🔌 WebSocket: Invalid or missing timeframe, skipping:', timeframe);
        }
        const wsUrl = `${env.NEXT_PUBLIC_WEBSOCKET_URL.replace(/^http/, 'ws')}/v1/ws/tokens?${queryParams}`;
        console.log('🔌 Attempting WebSocket connection to:', wsUrl);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        // Set a connection timeout
        wsConnectionTimeoutRef.current = setTimeout(() => {
          if (ws.readyState === WebSocket.CONNECTING) {
            console.log('⏰ WebSocket connection timeout, falling back to polling');
            ws.close();
            handleReconnect();
          }
        }, 5000); // 5 second timeout for WebSocket connection

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
          
          // Set a timeout to detect if no data is received
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN && state.data.length === 0) {
              console.log('⏰ No data received from WebSocket after 3 seconds, falling back to polling');
              ws.close();
              startPolling();
            }
          }, 3000);
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
          console.log('WebSocket connection closed with code:', event.code, 'reason:', event.reason);
          setState(prev => ({ ...prev, isConnected: false }));
          
          // If connection closed abnormally (1006), fall back to polling immediately
          if (event.code === 1006) {
            console.log('🚨 WebSocket closed abnormally (1006), falling back to polling');
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
              console.log('📤 Sent periodic ping to WebSocket server');
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
          setState(prev => ({ ...prev, error: 'WebSocket connection error' }));
          
          // Trigger fallback immediately when WebSocket errors occur
          console.log('🚨 WebSocket error detected, triggering fallback to polling');
          handleReconnect();
        };
      } catch (error) {
        console.error('Failed to establish WebSocket connection:', error);
        handleReconnect();
      }
    };

    const handleReconnect = () => {
      console.log('🔄 handleReconnect called, attempt:', reconnectAttemptRef.current, 'max:', maxReconnectAttempts);
      
      if (reconnectAttemptRef.current >= maxReconnectAttempts) {
        console.log('✅ Max WebSocket reconnect attempts reached, falling back to polling');
        startPolling();
        return;
      }
      
      setState(prev => ({ ...prev, isReconnecting: true }));
      reconnectAttemptRef.current += 1;
      console.log('🔄 Incremented reconnect attempt to:', reconnectAttemptRef.current);
      
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current - 1), 8000);
      console.log('🔄 Scheduling WebSocket reconnect in', delay, 'ms');
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
    };

    // Try WebSocket first
    connectWebSocket();

    return () => {
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
  }, [filter, order, offset, limit, timeframe, throttledSetData, startPolling, clearPolling]);

  return state;
}
