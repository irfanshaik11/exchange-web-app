import { useEffect, useRef, useState, useCallback } from 'react';

interface OHLCData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  txCount: number;
}

interface OHLCWebSocketMessage {
  type: string;
  data: OHLCData;
  timestamp: string;
}

interface UseOHLCWebSocketOptions {
  pairAddress?: string;
  timeframe?: string;
  enabled?: boolean;
}

interface UseOHLCWebSocketReturn {
  isConnected: boolean;
  loading: boolean;
  error: string | null;
  data: OHLCData[];
  lastUpdate: string | null;
  reconnect: () => void;
}

export default function useOHLCWebSocket({
  pairAddress,
  timeframe = '5m',
  enabled = true,
}: UseOHLCWebSocketOptions): UseOHLCWebSocketReturn {
  const [state, setState] = useState({
    isConnected: false,
    loading: true,
    error: null as string | null,
    data: [] as OHLCData[],
    lastUpdate: null as string | null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxReconnectAttempts = 5;
  const reconnectAttemptRef = useRef(0);

  // Function to fetch historical OHLC data
  const fetchHistoricalData = useCallback(async () => {
    if (!pairAddress) return;
    
    try {
      // Fetching historical data silently
      const baseUrl = process.env.NEXT_PUBLIC_GO_SERVICE_URL || 'http://localhost:8080';
      
      // Try to get historical OHLC data from trade view endpoint
      // This endpoint should have OHLC data in the response
      const response = await fetch(`${baseUrl}/v1/trade/view?pair_address=${pairAddress}`);
      
      if (response.ok) {
        const data = await response.json();
        // Processing trade view response silently
        
        // Check if the response contains OHLC data
        if (data && data.ohlcData && Array.isArray(data.ohlcData) && data.ohlcData.length > 0) {
          // Found historical OHLC data
          
          // Convert to our format
          const historicalData = data.ohlcData.map((item: any) => ({
            timestamp: item.timestamp,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            volume: item.volume,
            txCount: item.txCount,
          }));
          
          setState(prev => ({
            ...prev,
            data: historicalData,
            loading: false,
            lastUpdate: new Date().toISOString(),
          }));
          
          return;
        }
      }
      
      // No historical data found
      
      // If no historical data, just set loading to false
      setState(prev => ({
        ...prev,
        loading: false,
        lastUpdate: new Date().toISOString(),
      }));
      
    } catch (error) {
      // Error fetching historical data (silent)
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to fetch historical data',
      }));
    }
  }, [pairAddress]);

  const processMessage = useCallback((message: OHLCWebSocketMessage) => {
    try {
      // Processing WebSocket message silently
      
      if (message.type === 'ohlc_update' && message.data) {
        const ohlcData = message.data;
        // Valid OHLC data received
        
        setState(prev => {
          // Processing OHLC data
          
          // Find if this timestamp already exists
          const existingIndex = prev.data.findIndex(item => item.timestamp === ohlcData.timestamp);
          
          let updatedData;
          if (existingIndex !== -1) {
            // Update existing OHLC bar
            console.log('OHLC WebSocket: Updating existing OHLC bar at index:', existingIndex);
            updatedData = [...prev.data];
            updatedData[existingIndex] = ohlcData;
          } else {
            // Add new OHLC bar and sort by timestamp
            console.log('OHLC WebSocket: Adding new OHLC bar');
            updatedData = [...prev.data, ohlcData];
            updatedData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          }
          
          // Keep only last 200 candles
          const finalData = updatedData.slice(-200);
          
          console.log('OHLC WebSocket: Final data count:', finalData.length);
          
          return {
            ...prev,
            data: finalData,
            lastUpdate: new Date().toISOString(),
            loading: false,
          };
        });
      } else {
        console.log('OHLC WebSocket: Invalid message format:', message);
      }
    } catch (error) {
      console.error('Error processing OHLC message:', error);
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    if (!pairAddress || !enabled) {
      console.log('OHLC WebSocket: Not connecting - pairAddress:', pairAddress, 'enabled:', enabled);
      return;
    }

    try {
      const baseUrl = (process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'http://localhost:8080').replace(/^https?:\/\//, '');
      const protocol = process.env.NEXT_PUBLIC_WEBSOCKET_URL?.startsWith('https') ? 'wss' : 'ws';
      const wsUrl = `${protocol}://${baseUrl}/v1/trade/ohlc?pair_address=${pairAddress}&timeframe=${timeframe}`;
      console.log('OHLC WebSocket: Attempting to connect to:', wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setState(prev => ({
          ...prev,
          isConnected: true,
          loading: false,
          error: null,
        }));
        reconnectAttemptRef.current = 0;
        console.log('OHLC websocket connected to:', wsUrl);
        
        // If no data comes within 5 seconds, fetch historical data
        setTimeout(() => {
          setState(prev => {
            if (prev.data.length === 0) {
              console.log('OHLC WebSocket: No real-time data received, fetching historical data');
              fetchHistoricalData();
            }
            return prev;
          });
        }, 5000);
      };

      ws.onmessage = (event) => {
        try {
          console.log('OHLC WebSocket: Raw message received:', event.data);
          const message: OHLCWebSocketMessage = JSON.parse(event.data);
          console.log('OHLC WebSocket: Parsed message:', message);
          processMessage(message);
        } catch (error) {
          console.error('Error parsing OHLC message:', error);
        }
      };

      ws.onclose = () => {
        setState(prev => ({
          ...prev,
          isConnected: false,
          loading: false,
        }));

        // Attempt to reconnect
        if (reconnectAttemptRef.current < maxReconnectAttempts) {
          reconnectAttemptRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`Attempting to reconnect OHLC websocket (${reconnectAttemptRef.current}/${maxReconnectAttempts})`);
            connectWebSocket();
          }, delay);
        } else {
          setState(prev => ({
            ...prev,
            error: 'Failed to reconnect after maximum attempts',
          }));
        }
      };

      ws.onerror = (error) => {
        console.error('OHLC WebSocket error:', error);
        setState(prev => ({
          ...prev,
          error: 'WebSocket connection error',
          loading: false,
        }));
      };

    } catch (error) {
      console.error('Failed to create OHLC WebSocket connection:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to create WebSocket connection',
        loading: false,
      }));
    }
  }, [pairAddress, timeframe, enabled, processMessage]);

  const reconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    reconnectAttemptRef.current = 0;
    setState(prev => ({ ...prev, error: null }));
    connectWebSocket();
  }, [connectWebSocket]);

  useEffect(() => {
    // Fetch historical data first to show past price movements
    fetchHistoricalData();
    
    // Then connect to WebSocket for real-time updates
    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket, fetchHistoricalData]);

  return {
    ...state,
    reconnect,
  };
}