import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { env } from "../env";

interface TradeEventData {
  data: {
    amount0: string | number;
    amount1: string | number;
  };
  eventDisplayType: "Buy" | "Sell";
  maker: string;
  timestamp: number | string;
  token0SwapValueUsd: string | number;
  token1SwapValueUsd: string | number;
  transactionHash: string;
}

interface TradeEventResponse {
  data: {
    onEventsCreated: {
      events: TradeEventData[];
    };
  };
}

interface TradeEventsState {
  isConnected: boolean;
  isReconnecting: boolean;
  error: string | null;
  loading: boolean;
  trades: TradeEventData[];
  lastUpdate: string | null;
}

interface UseOptimizedTradeEventsWebSocketParams {
  pairAddress?: string;
  enabled?: boolean;
  initialTrades?: any[];
  tokenDecimals?: number;
  maxTrades?: number; // Limit trades in memory
  enableDeduplication?: boolean; // Remove duplicate trades
}

// Enhanced WebSocket hook with optimized caching and memory management
export default function useOptimizedTradeEventsWebSocket({
  pairAddress,
  enabled = true,
  initialTrades = [],
  tokenDecimals = 9,
  maxTrades = 1000,
  enableDeduplication = true,
}: UseOptimizedTradeEventsWebSocketParams) {
  const [state, setState] = useState<TradeEventsState>({
    isConnected: false,
    isReconnecting: false,
    error: null,
    loading: initialTrades.length === 0,
    trades: initialTrades,
    lastUpdate: initialTrades.length > 0 ? new Date().toISOString() : null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxReconnectAttempts = 5;
  const reconnectAttemptRef = useRef(0);
  const hasSetInitialDataRef = useRef(false);
  const seenTradesRef = useRef<Set<string>>(new Set());
  const lastProcessedTimestampRef = useRef<number>(0);

  // Memoized trade processing to avoid unnecessary re-computations
  const processTradeEvent = useCallback((event: TradeEventData) => {
    // Handle both timestamp formats (seconds vs milliseconds)
    let timestamp: string;
    if (typeof event.timestamp === 'number') {
      timestamp = new Date(event.timestamp * 1000).toISOString();
    } else if (typeof event.timestamp === 'string') {
      timestamp = event.timestamp;
    } else {
      timestamp = new Date().toISOString();
    }
    
    // Calculate total USD value
    const rawAmount0 = Math.abs(parseFloat(String(event.data.amount0)));
    const rawAmount1 = Math.abs(parseFloat(String(event.data.amount1)));
    const usd0 = parseFloat(String(event.token0SwapValueUsd));
    const usd1 = parseFloat(String(event.token1SwapValueUsd));
    
    // Convert raw amounts to actual token quantities
    const convertedAmount0 = rawAmount0 / Math.pow(10, tokenDecimals);
    const convertedAmount1 = rawAmount1 / Math.pow(10, tokenDecimals);
    
    let totalUSD: number;
    let solPrice: number;
    
    if (usd0 > usd1 && usd0 > 10) {
      solPrice = usd0;
      const solAmount = convertedAmount0;
      totalUSD = solAmount * solPrice;
    } else if (usd1 > usd0 && usd1 > 10) {
      solPrice = usd1;
      const solAmount = convertedAmount1;
      totalUSD = solAmount * solPrice;
    } else {
      solPrice = Math.max(usd0, usd1);
      totalUSD = solPrice;
    }
    
    return {
      pair_address: pairAddress || '',
      side: event.eventDisplayType.toLowerCase() as "buy" | "sell",
      amount: rawAmount0.toString(),
      price: String(solPrice),
      timestamp: timestamp,
      maker: event.maker,
      transactionHash: event.transactionHash,
      totalUSD: totalUSD,
      originalEvent: event,
    };
  }, [pairAddress, tokenDecimals]);

  // Deduplication logic
  const deduplicateTrades = useCallback((trades: any[]) => {
    if (!enableDeduplication) return trades;
    
    const uniqueTrades: any[] = [];
    const seen = new Set<string>();
    
    for (const trade of trades) {
      const key = `${trade.transactionHash}-${trade.timestamp}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueTrades.push(trade);
      }
    }
    
    return uniqueTrades;
  }, [enableDeduplication]);

  // Memory management - limit trades and remove old ones
  const manageTradesMemory = useCallback((trades: any[]) => {
    if (trades.length <= maxTrades) return trades;
    
    // Sort by timestamp (newest first) and keep only the most recent
    const sortedTrades = [...trades].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    return sortedTrades.slice(0, maxTrades);
  }, [maxTrades]);

  // Update trades when initialTrades are provided - immediate display
  useEffect(() => {
    if (initialTrades && initialTrades.length > 0 && !hasSetInitialDataRef.current) {
      // Reduced logging for performance
      if (process.env.NODE_ENV === 'development') {
        console.log('[useOptimizedTradeEventsWebSocket] Using initial trades from pre-fetch:', initialTrades.length);
      }
      
      const processedTrades = initialTrades.map(processTradeEvent);
      const deduplicatedTrades = deduplicateTrades(processedTrades);
      const managedTrades = manageTradesMemory(deduplicatedTrades);
      
      // Update seen trades set
      managedTrades.forEach(trade => {
        seenTradesRef.current.add(`${trade.transactionHash}-${trade.timestamp}`);
      });
      
      setState(prev => ({
        ...prev,
        trades: managedTrades,
        loading: false,
        isConnected: true, // Mark as connected when we have initial data
        lastUpdate: new Date().toISOString(),
      }));
      hasSetInitialDataRef.current = true;
    }
  }, [initialTrades?.length, processTradeEvent, deduplicateTrades, manageTradesMemory]);

  const processMessage = useCallback((message: any) => {
    try {
      // Reduced logging for performance
      if (process.env.NODE_ENV === 'development') {
        console.log('Trade events websocket message received:', message);
      }
      
      let events: any[] = [];
      
      // Handle initial trades response (getTokenEvents format)
      if (message.data && message.data.getTokenEvents && message.data.getTokenEvents.items) {
        events = message.data.getTokenEvents.items;
        if (process.env.NODE_ENV === 'development') {
          console.log('Processing initial trades:', events.length, 'events');
        }
      }
      // Handle real-time updates (onEventsCreated format)
      else if (message.data && message.data.onEventsCreated && message.data.onEventsCreated.events) {
        events = message.data.onEventsCreated.events;
        if (process.env.NODE_ENV === 'development') {
          console.log('Processing real-time events:', events.length, 'events');
        }
      }
      
      if (events.length > 0) {
        // Process events and filter out duplicates
        const newTrades = events
          .map(processTradeEvent)
          .filter(trade => {
            const key = `${trade.transactionHash}-${trade.timestamp}`;
            return !seenTradesRef.current.has(key);
          });

        if (newTrades.length > 0) {
          // Add to seen trades set
          newTrades.forEach(trade => {
            seenTradesRef.current.add(`${trade.transactionHash}-${trade.timestamp}`);
          });

          setState(prev => {
            let updatedTrades: any[];
            
            if (message.data && message.data.getTokenEvents) {
              // Initial trades - replace existing trades
              updatedTrades = newTrades;
              if (process.env.NODE_ENV === 'development') {
                console.log('Replaced trades with initial data:', updatedTrades.length);
              }
            } else {
              // Real-time updates - prepend to existing trades
              const combinedTrades = [...newTrades, ...prev.trades];
              updatedTrades = manageTradesMemory(deduplicateTrades(combinedTrades));
              if (process.env.NODE_ENV === 'development') {
                console.log('Added new trades to existing:', updatedTrades.length);
              }
            }
            
            return {
              ...prev,
              trades: updatedTrades,
              lastUpdate: new Date().toISOString(),
              loading: false,
            };
          });
        }
      } else {
        console.warn('No events found in message:', message);
      }
    } catch (error) {
      console.error('Error processing trade event message:', error);
    }
  }, [processTradeEvent, deduplicateTrades, manageTradesMemory]);

  const connectWebSocket = useCallback(() => {
    if (!pairAddress || !enabled) {
      return;
    }

    try {
      const baseUrl = (env.NEXT_PUBLIC_WEBSOCKET_URL || '').replace(/^https?:\/\//, '');
      const protocol = env.NEXT_PUBLIC_WEBSOCKET_URL?.startsWith('https') ? 'wss' : 'ws';
      const wsUrl = `${protocol}://${baseUrl}/v1/ws/trade-events?pair=${pairAddress}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // Set connection timeout to 3 seconds for faster failure
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.close();
          setState(prev => ({
            ...prev,
            error: 'WebSocket connection timeout',
            loading: false,
          }));
        }
      }, 3000);

      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        setState(prev => ({
          ...prev,
          isConnected: true,
          isReconnecting: false,
          error: null,
        }));
        reconnectAttemptRef.current = 0;
        console.log('Trade events websocket connected to:', wsUrl);
      };

      ws.onmessage = (event) => {
        const handleText = (text: string) => {
          try {
            const trimmed = text.trim();
            if (!trimmed) return;

            // Ignore keepalive/ping frames
            if (trimmed === 'ping' || trimmed === 'pong' || trimmed === 'ok') return;

            // Try to parse as JSON
            try {
              const msg = JSON.parse(trimmed);
              processMessage(msg);
              return;
            } catch (_) {
              // Fall through to multi-JSON handling
            }

            // Handle concatenated or newline-delimited JSON messages
            const fixed = trimmed
              .replace(/}\s*{/g, '}\n{')
              .replace(/]\s*\[/g, ']\n[');
            const parts = fixed.split(/\r?\n+/);
            
            for (const part of parts) {
              const p = part.trim();
              if (!p || p === 'ping' || p === 'pong' || p === 'ok') continue;
              try {
                const msg = JSON.parse(p);
                processMessage(msg);
              } catch (e) {
                console.warn('Skipping non-JSON WS chunk:', p.slice(0, 120));
              }
            }
          } catch (error) {
            console.error('Error handling WebSocket message:', error);
          }
        };

        // Handle different message types
        if (typeof event.data === 'string') {
          handleText(event.data);
        } else if (event.data instanceof Blob) {
          event.data.text().then(handleText);
        } else if (event.data instanceof ArrayBuffer) {
          const text = new TextDecoder().decode(event.data);
          handleText(text);
        }
      };

      ws.onclose = (event) => {
        clearTimeout(connectionTimeout); // Clear connection timeout
        setState(prev => ({
          ...prev,
          isConnected: false,
          loading: false,
        }));

        // Attempt reconnection if not a clean close - faster reconnection
        if (event.code !== 1000 && reconnectAttemptRef.current < maxReconnectAttempts) {
          reconnectAttemptRef.current++;
          setState(prev => ({ ...prev, isReconnecting: true }));
          
          const delay = Math.min(200 * Math.pow(1.2, reconnectAttemptRef.current), 2000); // Much faster reconnection
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, delay);
        } else if (reconnectAttemptRef.current >= maxReconnectAttempts) {
          setState(prev => ({
            ...prev,
            error: 'Max reconnection attempts reached',
            isReconnecting: false,
          }));
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setState(prev => ({
          ...prev,
          error: 'WebSocket connection error',
          loading: false,
        }));
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to create WebSocket connection',
        loading: false,
      }));
    }
  }, [pairAddress, enabled, processMessage]);

  // Effect for managing WebSocket connection
  useEffect(() => {
    if (!pairAddress || !enabled) {
      setState(prev => ({
        ...prev,
        isConnected: false,
        loading: false,
        trades: [],
      }));
      return;
    }

    setState(prev => ({ ...prev, loading: true, isConnected: false, error: null }));

    // Set loading timeout to prevent infinite loading
    const loadingTimeout = setTimeout(() => {
      setState(prev => {
        if (prev.loading && !prev.isConnected) {
          return {
            ...prev,
            loading: false,
            error: 'WebSocket connection timeout',
          };
        }
        return prev;
      });
    }, 2000); // 2-second timeout for loading state

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    connectWebSocket();

    // Cleanup function
    return () => {
      clearTimeout(loadingTimeout); // Clear loading timeout
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [pairAddress, enabled, connectWebSocket]);

  // Memoized trade statistics
  const getTradeStats = useCallback(() => {
    const trades = state.trades;
    const totalTrades = trades.length;
    const buyTrades = trades.filter(t => (t as any).side === 'buy').length;
    const sellTrades = trades.filter(t => (t as any).side === 'sell').length;
    const totalVolume = trades.reduce((sum, t) => sum + ((t as any).totalUSD || 0), 0);
    const buyVolume = trades.filter(t => (t as any).side === 'buy').reduce((sum, t) => sum + ((t as any).totalUSD || 0), 0);
    const sellVolume = trades.filter(t => (t as any).side === 'sell').reduce((sum, t) => sum + ((t as any).totalUSD || 0), 0);

    return {
      totalTrades,
      buyTrades,
      sellTrades,
      totalVolume,
      buyVolume,
      sellVolume,
    };
  }, [state.trades]);

  // Clear seen trades cache (useful for testing or manual refresh)
  const clearSeenTrades = useCallback(() => {
    seenTradesRef.current.clear();
    console.log('[useOptimizedTradeEventsWebSocket] Cleared seen trades cache');
  }, []);

  // Get memory usage stats
  const getMemoryStats = useCallback(() => {
    return {
      tradesCount: state.trades.length,
      maxTrades,
      seenTradesCount: seenTradesRef.current.size,
      memoryUsage: `${state.trades.length}/${maxTrades} trades`,
    };
  }, [state.trades.length, maxTrades]);

  return {
    ...state,
    getTradeStats,
    reconnect: connectWebSocket,
    clearSeenTrades,
    getMemoryStats,
  };
}
