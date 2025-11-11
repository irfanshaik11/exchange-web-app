import { useEffect, useRef, useState, useCallback } from 'react';

interface MarketData {
  mint: string;
  price_usd: number;
  market_cap_usd: number;
  volume_usd: number;
  liquidity_usd?: number;
  updated_at: string;
}

interface MarketDataUpdate {
  type: 'market_data';
  data: Record<string, MarketData>;
  timestamp: string;
}

interface UseMarketDataWebSocketOptions {
  pairAddress?: string;
  tokenAddress?: string;
  enabled?: boolean;
  url?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

interface UseMarketDataWebSocketReturn {
  isConnected: boolean;
  loading: boolean;
  error: string | null;
  data: Record<string, MarketData>;
  getMarketData: () => MarketData | null;
  reconnect: () => void;
}

export default function useMarketDataWebSocket(
  options: UseMarketDataWebSocketOptions = {}
): UseMarketDataWebSocketReturn {
  const { pairAddress, tokenAddress, enabled = true, url, reconnectInterval, maxReconnectAttempts } = options;
  
  const [marketData, setMarketData] = useState<Record<string, MarketData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const mintsRef = useRef<string[]>([]);
  
  // Use the deployed websocket URL from environment variable
  const getWsUrl = () => {
    if (url) return url;
    const baseUrl = (process.env.NEXT_PUBLIC_WEBSOCKET_URL || '').replace(/^https?:\/\//, '');
    const protocol = process.env.NEXT_PUBLIC_WEBSOCKET_URL?.startsWith('https') ? 'wss' : 'ws';
    return `${protocol}://${baseUrl}/v1/ws/market-data`;
  };
  const wsUrl = getWsUrl();
  const reconnectIntervalMs = reconnectInterval || 5000;
  const maxReconnectAttemptsCount = maxReconnectAttempts || 10;

  // Update mints when tokenAddress changes
  useEffect(() => {
    if (tokenAddress) {
      mintsRef.current = [tokenAddress];
    }
  }, [tokenAddress]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || !enabled) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Market data WebSocket connected');
        setConnected(true);
        setLoading(false);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          // Log raw data for debugging (first 200 chars)
          const rawData = event.data;
          console.log('WebSocket raw data (first 200 chars):', rawData.substring(0, 200));
          
          // Check if data contains multiple JSON objects or extra content
          const trimmedData = rawData.trim();
          
          // Try to find the first complete JSON object
          let jsonData = trimmedData;
          let jsonStart = -1;
          let jsonEnd = -1;
          let braceCount = 0;
          
          // Find the start of JSON (first '{')
          for (let i = 0; i < trimmedData.length; i++) {
            if (trimmedData[i] === '{') {
              jsonStart = i;
              break;
            }
          }
          
          if (jsonStart === -1) {
            console.warn('No JSON object found in WebSocket message');
            return;
          }
          
          // Find the end of the first complete JSON object
          for (let i = jsonStart; i < trimmedData.length; i++) {
            if (trimmedData[i] === '{') {
              braceCount++;
            } else if (trimmedData[i] === '}') {
              braceCount--;
              if (braceCount === 0) {
                jsonEnd = i;
                break;
              }
            }
          }
          
          if (jsonEnd === -1) {
            console.warn('Incomplete JSON object in WebSocket message');
            return;
          }
          
          // Extract only the JSON part
          jsonData = trimmedData.substring(jsonStart, jsonEnd + 1);
          
          // Log if there was extra content
          if (jsonEnd < trimmedData.length - 1) {
            console.warn('WebSocket message contains extra content after JSON:', trimmedData.substring(jsonEnd + 1));
          }
          
          const update: MarketDataUpdate = JSON.parse(jsonData);
          
          if (update.type === 'market_data' && update.data) {
            // Filter data to only include tokens we're interested in
            const filteredData: Record<string, MarketData> = {};
            for (const [mint, data] of Object.entries(update.data)) {
              if (mintsRef.current.includes(mint)) {
                filteredData[mint] = data;
              }
            }
            
            if (Object.keys(filteredData).length > 0) {
              setMarketData(prev => ({
                ...prev,
                ...filteredData
              }));
            }
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
          console.error('Raw message data:', event.data);
          
          // Try to extract any valid JSON from the message
          try {
            const lines = event.data.split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                const update: MarketDataUpdate = JSON.parse(trimmed);
                if (update.type === 'market_data' && update.data) {
                  const filteredData: Record<string, MarketData> = {};
                  for (const [mint, data] of Object.entries(update.data)) {
                    if (mintsRef.current.includes(mint)) {
                      filteredData[mint] = data;
                    }
                  }
                  
                  if (Object.keys(filteredData).length > 0) {
                    setMarketData(prev => ({
                      ...prev,
                      ...filteredData
                    }));
                  }
                  break; // Found valid JSON, stop processing
                }
              }
            }
          } catch (fallbackErr) {
            console.error('Fallback JSON parsing also failed:', fallbackErr);
          }
        }
      };

      ws.onclose = (event) => {
        console.log('Market data WebSocket closed:', event.code, event.reason);
        setConnected(false);
        
        if (reconnectAttemptsRef.current < maxReconnectAttemptsCount) {
          reconnectAttemptsRef.current++;
          console.log(`Attempting to reconnect (${reconnectAttemptsRef.current}/${maxReconnectAttemptsCount})...`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectIntervalMs);
        } else {
          setError('Max reconnection attempts reached');
          setLoading(false);
        }
      };

      ws.onerror = (error) => {
        console.error('Market data WebSocket error:', error);
        setError('WebSocket connection error');
      };

    } catch (err) {
      console.error('Failed to create WebSocket connection:', err);
      setError('Failed to connect to WebSocket');
      setLoading(false);
    }
  }, [url, reconnectInterval, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setConnected(false);
    setError(null);
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    setTimeout(connect, 100);
  }, [disconnect, connect]);

  // Get market data for the current token (no parameters needed)
  const getMarketData = useCallback((): MarketData | null => {
    if (!tokenAddress) return null;
    return marketData[tokenAddress] || null;
  }, [marketData, tokenAddress]);

  useEffect(() => {
    if (enabled && tokenAddress) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, tokenAddress, connect, disconnect]);

  return {
    isConnected: connected,
    loading,
    error,
    data: marketData,
    getMarketData,
    reconnect
  };
}