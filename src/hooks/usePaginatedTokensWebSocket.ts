import { useEffect, useRef, useState } from 'react';
import throttle from 'lodash.throttle';
import { env } from '../env';

interface UsePaginatedTokensWebSocketParams {
  filter?: 'marketcap' | 'volume_24h' | 'txs_24h' | 'txs_5m' | 'txs_1h' | 'txs_6h' | 'new' | 'newmarketcap' | 'trending';
  order?: 'asc' | 'desc';
  offset?: number;
  limit?: number;
}

interface WebSocketState {
  isConnected: boolean;
  isReconnecting: boolean;
  error: string | null;
  loading: boolean;
}

export default function usePaginatedTokensWebSocket({
  filter = 'marketcap',
  order = 'desc',
  offset = 0,
  limit = 20,
}: UsePaginatedTokensWebSocketParams = {}) {
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    isReconnecting: false,
    error: null,
    loading: true,
  });
  const [data, setData] = useState<any[]>([]);
  // Keep a mutable reference of the current list so we can efficiently
  // merge incremental WS updates for the 'new' stream without losing items.
  const dataRef = useRef<any[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxReconnectAttempts = 5;
  const reconnectAttemptRef = useRef(0);
  // Use v1 path consistently to match the new service
  const pathModeRef = useRef<'v1'>('v1');
  // Track first-seen timestamps per token for 'new' stream
  const firstSeenRef = useRef<Map<string, number>>(new Map());

  // Aggressive real-time for 'new' filter; light throttle for others
  const throttledSetData = useRef<((d: any[]) => void) | null>(null);
  if (throttledSetData.current === null) {
    if (filter === 'new') {
      // For 'new' stream, the backend may send individual objects
      // after an initial array snapshot. Normalize to an array and
      // merge into our existing list instead of replacing it.
      throttledSetData.current = (incoming: any) => {
        try {
          const arr: any[] = Array.isArray(incoming) ? incoming : (incoming ? [incoming] : []);
          if (arr.length === 0) return;

          const map = new Map<string, any>();
          // Seed with current data first (preserve order later)
          for (const t of dataRef.current) {
            const k = (t?.pair_address || t?.mint) as string | undefined;
            if (k) map.set(k, t);
          }
          // Merge/overwrite with incoming updates
          for (const t of arr) {
            const k = (t?.pair_address || t?.mint) as string | undefined;
            if (!k) continue;
            map.set(k, t);
          }

          // Convert to array and sort by best-effort timestamp desc
          const list = Array.from(map.values());
          const getTs = (v: any): number => {
            let x: any = (
              v?.launch_time ?? v?.launchTime ??
              v?.created_at ?? v?.createdAt ??
              v?.firstSeen ?? v?.first_seen ??
              v?.pair_created_at ?? v?.pairCreatedAt ??
              v?.timestamp ?? v?.ts ?? null
            );
            if (x && typeof x === 'object') {
              if ('Time' in x && typeof x.Time === 'string') x = x.Time;
              else if ('time' in x && typeof x.time === 'string') x = x.time;
              else if ('seconds' in x && typeof x.seconds === 'number') {
                const sec = Number(x.seconds);
                return sec > 1e12 ? sec : sec > 1e9 ? sec * 1000 : 0;
              } else if ('millis' in x && typeof x.millis === 'number') {
                const ms = Number(x.millis);
                return ms > 0 ? ms : 0;
              }
            }
            if (!x) return 0;
            if (typeof x === 'number') return x > 1e12 ? x : x > 1e9 ? x * 1000 : 0;
            if (typeof x === 'string') {
              const n = Number(x);
              if (!Number.isNaN(n) && n > 0) return n > 1e12 ? n : n > 1e9 ? n * 1000 : 0;
              const d = Date.parse(x);
              return Number.isNaN(d) ? 0 : d;
            }
            if (x instanceof Date) return x.getTime();
            return 0;
          };
          list.sort((a, b) => getTs(b) - getTs(a));
          // Cap to a reasonable size (use requested limit if provided)
          const capped = list.slice(0, Math.max(20, limit || 20));
          dataRef.current = capped;
          setData(capped);
          setState(prev => ({ ...prev, loading: false }));
        } catch {
          // If anything goes wrong, avoid breaking the UI
          setState(prev => ({ ...prev, loading: false }));
        }
      };
    } else {
      throttledSetData.current = throttle((newData: any[]) => {
        const arr = Array.isArray(newData) ? newData : (newData ? [newData] : []);
        dataRef.current = arr;
        setData(arr);
        setState(prev => ({ ...prev, loading: false }));
      }, 50, { leading: true, trailing: true }); // Reduced from 120ms to 50ms for faster updates
    }
  }

  useEffect(() => {
    setState(prev => ({ ...prev, loading: true, isConnected: false, error: null }));

    // If using deployed service, disable WebSocket and use HTTP polling fallback
    if (env.NEXT_PUBLIC_IS_BACKEND_DEPLOYED) {
      console.log('🚫 WebSocket disabled for deployed service, using HTTP polling fallback');
      
      const pollData = async () => {
        try {
          const queryParams = new URLSearchParams({
            filter: filter || 'marketcap',
            order: order || 'desc',
            offset: (offset || 0).toString(),
            limit: (limit || 20).toString(),
          });
          
          const baseUrl = env.NEXT_PUBLIC_GO_SERVICE_URL.endsWith('/') 
            ? env.NEXT_PUBLIC_GO_SERVICE_URL.slice(0, -1) 
            : env.NEXT_PUBLIC_GO_SERVICE_URL;
          const url = `${baseUrl}/v1/tokens?${queryParams}`;
          const response = await fetch(url);
          
          if (response.ok) {
            const result = await response.json();
            const tokens = result.tokens || result;
            setData(Array.isArray(tokens) ? tokens : []);
            setState(prev => ({ 
              ...prev, 
              loading: false, 
              isConnected: true, 
              error: null 
            }));
          } else {
            setState(prev => ({ 
              ...prev, 
              loading: false, 
              isConnected: false, 
              error: 'Failed to fetch data from deployed service' 
            }));
          }
        } catch (error) {
          console.error('HTTP polling failed:', error);
          setState(prev => ({ 
            ...prev, 
            loading: false, 
            isConnected: false, 
            error: 'HTTP polling failed' 
          }));
        }
      };
      
      // Initial fetch
      pollData();
      
      // Set up polling interval - faster for real-time updates
      const interval = setInterval(pollData, filter === 'new' ? 1500 : 3000); // Poll every 1.5s for new tokens, 3s for others
      
      return () => {
        clearInterval(interval);
      };
    }

    const connectWebSocket = () => {
      try {
        // The backend uses the URL to determine the subscription
        const queryParams = new URLSearchParams({
          filter: filter || 'marketcap',
          order: order || 'desc',
          offset: (offset || 0).toString(),
          limit: (limit || 20).toString(),
        });
        const base = env.NEXT_PUBLIC_WEBSOCKET_URL.replace(/^http/, 'ws');
        const path = '/v1/ws/tokens';
        const wsUrl = `${base}${path}?${queryParams}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setState(prev => ({ ...prev, isConnected: true, isReconnecting: false, error: null }));
          reconnectAttemptRef.current = 0;
        };

        ws.onmessage = (event) => {
          const handleText = (text: string) => {
            const trimmed = text.trim();
            if (!trimmed) return;
            if (trimmed === 'ping' || trimmed === 'pong' || trimmed === 'ok') return;

            const deliver = (payload: any) => {
              // Backend usually sends an array of tokens
              if (filter === 'new') {
                try {
                  const arr: any[] = Array.isArray(payload) ? payload : (payload ? [payload] : []);
                  for (const t of arr) {
                    const a = (t && (t.pair_address || t.mint)) as string | undefined;
                    if (!a) continue;
                    if (!firstSeenRef.current.has(a)) {
                      firstSeenRef.current.set(a, Date.now());
                    }
                    if (!('firstSeen' in t) || !t.firstSeen) {
                      t.firstSeen = firstSeenRef.current.get(a);
                    }
                  }
                } catch (_) {}
              }
              throttledSetData.current!(payload);
              setState(prev => ({ ...prev, error: null }));
            };

            // Try single JSON first
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
                // Skip silently to avoid noisy UI errors when keepalives interleave
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
          console.log('WebSocket connection closed with code:', event.code, 'reason:', event.reason);
          setState(prev => ({ ...prev, isConnected: false, loading: false }));
          // Don't reconnect if the component is unmounted or the close was intentional
          if (wsRef.current) {
            handleReconnect();
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setState(prev => ({ ...prev, error: 'WebSocket connection error. Attempting to reconnect...', loading: false }));
        };
      } catch (error) {
        console.error('Failed to establish WebSocket connection:', error);
        setState(prev => ({ ...prev, error: 'Failed to establish WebSocket connection' }));
      }
    };

    const handleReconnect = () => {
      if (reconnectAttemptRef.current >= maxReconnectAttempts) {
        setState(prev => ({
          ...prev,
          isReconnecting: false,
          error: 'Maximum reconnection attempts reached. Please refresh the page.'
        }));
        return;
      }
      setState(prev => ({ ...prev, isReconnecting: true }));
      reconnectAttemptRef.current += 1;
      const base = filter === 'new' ? 250 : 1000;
      const cap = filter === 'new' ? 4000 : 16000;
      const delay = Math.min(base * Math.pow(2, reconnectAttemptRef.current - 1), cap);
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
    };

    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        const ws = wsRef.current;
        wsRef.current = null; // Prevent reconnection on intentional close
        ws.close();
      }
      if (filter !== 'new' && throttledSetData.current && 'cancel' in throttledSetData.current) {
        // @ts-ignore
        throttledSetData.current.cancel?.();
      }
      // Reset refs to avoid stale data across re-mounts with different params
      dataRef.current = [];
    };
    // The connection must be re-established if the filter parameters change
  }, [filter, order, offset, limit]);

  return {
    ...state,
    data,
  };
} 
