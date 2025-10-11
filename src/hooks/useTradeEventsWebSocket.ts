import { useEffect, useRef, useState, useCallback } from "react";
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

interface UseTradeEventsWebSocketParams {
  pairAddress?: string;
  enabled?: boolean;
}

export default function useTradeEventsWebSocket({
  pairAddress,
  enabled = true,
}: UseTradeEventsWebSocketParams) {
  const [state, setState] = useState<TradeEventsState>({
    isConnected: false,
    isReconnecting: false,
    error: null,
    loading: true,
    trades: [],
    lastUpdate: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxReconnectAttempts = 5;
  const reconnectAttemptRef = useRef(0);

  const processMessage = useCallback((message: any) => {
    try {
      console.log('Trade events websocket message received:', message);
      
      let events: any[] = [];
      
      // Handle initial trades response (getTokenEvents format)
      if (message.data && message.data.getTokenEvents && message.data.getTokenEvents.items) {
        events = message.data.getTokenEvents.items;
        console.log('Processing initial trades:', events.length, 'events');
      }
      // Handle real-time updates (onEventsCreated format)
      else if (message.data && message.data.onEventsCreated && message.data.onEventsCreated.events) {
        events = message.data.onEventsCreated.events;
        console.log('Processing real-time events:', events.length, 'events');
      }
      
      if (events.length > 0) {
        // Convert events to our format and add to trades list
        const newTrades = events.map((event: TradeEventData) => {
          // Handle both timestamp formats (seconds vs milliseconds)
          let timestamp: string;
          if (typeof event.timestamp === 'number') {
            // If timestamp is in seconds, convert to milliseconds
            timestamp = new Date(event.timestamp * 1000).toISOString();
          } else if (typeof event.timestamp === 'string') {
            timestamp = event.timestamp;
          } else {
            timestamp = new Date().toISOString();
          }
          
          const convertedTrade = {
            pair_address: pairAddress || '',
            side: event.eventDisplayType.toLowerCase() as "buy" | "sell",
            amount: Math.abs(parseFloat(String(event.data.amount0))).toString(),
            price: String(event.token0SwapValueUsd),
            timestamp: timestamp,
            maker: event.maker,
            transactionHash: event.transactionHash,
            // Keep original data for reference
            originalEvent: event,
          };
          console.log('Converted trade:', convertedTrade);
          return convertedTrade;
        });
        
        setState(prev => {
          // For initial trades, replace the array. For updates, prepend to existing trades
          let updatedTrades: any[];
          if (message.data && message.data.getTokenEvents) {
            // Initial trades - replace existing trades
            updatedTrades = newTrades;
            console.log('Replaced trades with initial data:', updatedTrades.length);
          } else {
            // Real-time updates - prepend to existing trades
            updatedTrades = [...newTrades, ...prev.trades].slice(0, 1000);
            console.log('Added new trades to existing:', updatedTrades.length);
          }
          
          return {
            ...prev,
            trades: updatedTrades,
            lastUpdate: new Date().toISOString(),
            loading: false,
          };
        });
      } else {
        console.warn('No events found in message:', message);
      }
    } catch (error) {
      console.error('Error processing trade event message:', error);
    }
  }, [pairAddress]);

  const connectWebSocket = useCallback(() => {
    if (!pairAddress || !enabled) {
      return;
    }

    try {
      const baseUrl = (process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'http://localhost:8080').replace(/^https?:\/\//, '');
      const protocol = process.env.NEXT_PUBLIC_WEBSOCKET_URL?.startsWith('https') ? 'wss' : 'ws';
      const wsUrl = `${protocol}://${baseUrl}/v1/ws/trade-events?pair=${pairAddress}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
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
        setState(prev => ({
          ...prev,
          isConnected: false,
          loading: false,
        }));

        // Attempt reconnection if not a clean close
        if (event.code !== 1000 && reconnectAttemptRef.current < maxReconnectAttempts) {
          reconnectAttemptRef.current++;
          setState(prev => ({ ...prev, isReconnecting: true }));
          
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000);
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

  // Function to fetch all available historical trades
  const fetchMoreTrades = useCallback(async (limit = 200) => {
    if (!pairAddress) return;
    
    try {
      console.log('Fetching all available historical trades...');
      
      // Make multiple API calls to get all available trades
      const allTrades: any[] = [];
      const baseUrl = process.env.NEXT_PUBLIC_GO_SERVICE_URL || 'http://localhost:8080';
      
      // Try different endpoints and parameters to get more data
      const endpoints = [
        `${baseUrl}/v1/trade/view?pair_address=${pairAddress}`,
        `${baseUrl}/v1/trade/view?pair_address=${pairAddress}&limit=100`,
        `${baseUrl}/v1/trade/view?pair_address=${pairAddress}&limit=200`,
      ];
      
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint);
          if (response.ok) {
            const data = await response.json();
            if (data.recentTrades && Array.isArray(data.recentTrades)) {
              const historicalTrades = data.recentTrades.map((trade: any) => ({
                pair_address: pairAddress,
                side: trade.side || (trade.eventDisplayType?.toLowerCase() === 'buy' ? 'buy' : 'sell'),
                amount: Math.abs(parseFloat(trade.amount || trade.data?.amount0 || 0)).toString(),
                price: trade.price || trade.token0SwapValueUsd || '0',
                timestamp: new Date(trade.timestamp || trade.createdAt).toISOString(),
                maker: trade.maker || trade.trader || '',
                transactionHash: trade.transactionHash || trade.txHash || '',
              }));
              
              allTrades.push(...historicalTrades);
              console.log(`Fetched ${historicalTrades.length} trades from ${endpoint}`);
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch from ${endpoint}:`, err);
        }
      }
      
      // Remove duplicates based on transaction hash
      const uniqueTrades = allTrades.filter((trade, index, self) => 
        index === self.findIndex(t => t.transactionHash === trade.transactionHash)
      );
      
      if (uniqueTrades.length > 0) {
        setState(prev => ({
          ...prev,
          trades: [...uniqueTrades, ...prev.trades].slice(0, 1000), // Keep more trades
          lastUpdate: new Date().toISOString(),
        }));
        
        console.log(`Fetched ${uniqueTrades.length} unique historical trades total`);
      }
    } catch (error) {
      console.error('Failed to fetch historical trades:', error);
    }
  }, [pairAddress]);

  // Get trade statistics
  const getTradeStats = useCallback(() => {
    const trades = state.trades;
    const totalTrades = trades.length;
    const buyTrades = trades.filter(t => t.eventDisplayType === 'Buy').length;
    const sellTrades = trades.filter(t => t.eventDisplayType === 'Sell').length;
    const totalVolume = trades.reduce((sum, t) => sum + (parseFloat(t.token0SwapValueUsd as string) + parseFloat(t.token1SwapValueUsd as string)), 0);
    const buyVolume = trades.filter(t => t.eventDisplayType === 'Buy').reduce((sum, t) => sum + (parseFloat(t.token0SwapValueUsd as string) + parseFloat(t.token1SwapValueUsd as string)), 0);
    const sellVolume = trades.filter(t => t.eventDisplayType === 'Sell').reduce((sum, t) => sum + (parseFloat(t.token0SwapValueUsd as string) + parseFloat(t.token1SwapValueUsd as string)), 0);

    return {
      totalTrades,
      buyTrades,
      sellTrades,
      totalVolume,
      buyVolume,
      sellVolume,
    };
  }, [state.trades]);

  return {
    ...state,
    getTradeStats,
    fetchMoreTrades,
    reconnect: connectWebSocket,
  };
}
