import { useState, useEffect, useCallback, useRef } from 'react';

export interface TradeViewData {
  token: TokenData;
  marketData: MarketData;
  recentTrades: TradeData[];
  liveStats: LiveStats;
  timestamp: string;
}

export interface TokenData {
  mint: string;
  name: string;
  symbol: string;
  pair_address: string;
  created_at: string;
  image_url: string;
  social_links: Record<string, string>;
  
  // Price & Market Data
  usd_price: number;
  fully_diluted_value: number;
  total_liquidity_usd: number;
  total_supply: number;
  global_fees_paid: number;
  
  // Transaction Statistics (24h)
  total_buy_volume_24h: number;
  total_sell_volume_24h: number;
  total_buys_24h: number;
  total_sells_24h: number;
  total_buyers_24h: number;
  total_sellers_24h: number;
  unique_wallets_24h: number;
  price_percent_change_24h: number;
  
  // Additional time windows
  total_buy_volume_1h: number;
  total_sell_volume_1h: number;
  total_buys_1h: number;
  total_sells_1h: number;
  price_percent_change_1h: number;
  
  total_buy_volume_5m: number;
  total_sell_volume_5m: number;
  total_buys_5m: number;
  total_sells_5m: number;
  price_percent_change_5m: number;
}

export interface MarketData {
  price_usd: number;
  market_cap_usd: number;
  volume_usd: number;
  updated_at: string;
}

export interface TradeData {
  id: string;
  transaction_hash: string;
  timestamp: string;
  event_type: string;
  token0_swap_value_usd: number;
  token1_swap_value_usd: number;
  maker: string;
  amount: number;
  price_in_usd: number;
  total_usd: number;
}

export interface LiveStats {
  buy_count: number;
  sell_count: number;
  volume: number;
  unique_wallets: number;
  last_update: string;
}

interface TradeWebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
}

interface UseTradePageWebSocketReturn {
  // Initial data
  initialData: TradeViewData | null;
  loading: boolean;
  error: string | null;
  
  // Real-time data
  tokenData: TokenData | null;
  marketData: MarketData | null;
  liveStats: LiveStats | null;
  recentTrades: TradeData[];
  
  // Connection status
  connected: boolean;
  isReconnecting: boolean;
  
  // Actions
  reconnect: () => void;
}

export function useTradePageWebSocket(
  pairAddress: string | undefined,
  opts?: {
    url?: string;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
    queries?: {
      tokenData?: boolean;
      marketData?: boolean;
      trades?: boolean;
      liveStats?: boolean;
    };
  }
): UseTradePageWebSocketReturn {
  const [initialData, setInitialData] = useState<TradeViewData | null>(null);
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null);
  const [recentTrades, setRecentTrades] = useState<TradeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const pairAddressRef = useRef<string | undefined>(pairAddress);
  
  const url = opts?.url || 'ws://localhost:8080/v1/ws/trade';
  const reconnectInterval = opts?.reconnectInterval || 3000;
  const maxReconnectAttempts = opts?.maxReconnectAttempts || 5;
  const queries = opts?.queries || {
    tokenData: true,
    marketData: true,
    trades: true,
    liveStats: true
  };

  // Update pair address ref
  useEffect(() => {
    pairAddressRef.current = pairAddress;
  }, [pairAddress]);

  // Load initial data
  const loadInitialData = useCallback(async () => {
    if (!pairAddress) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`http://localhost:8080/v1/trade/view?pair_address=${pairAddress}`);
      if (!response.ok) {
        throw new Error(`Failed to load initial data: ${response.status}`);
      }
      
      const data: TradeViewData = await response.json();
      setInitialData(data);
      
      // Set initial real-time data
      setTokenData(data.token);
      setMarketData(data.marketData);
      setLiveStats(data.liveStats);
      setRecentTrades(data.recentTrades);
      
    } catch (err: any) {
      console.error('Failed to load initial data:', err);
      setError(err.message || 'Failed to load initial data');
    } finally {
      setLoading(false);
    }
  }, [pairAddress]);

  // Connect WebSocket
  const connectWebSocket = useCallback(() => {
    if (!pairAddress || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      setError(null);
      
      const queryParams = new URLSearchParams({
        pair_address: pairAddress,
        token_data: queries.tokenData ? 'true' : 'false',
        market_data: queries.marketData ? 'true' : 'false',
        trades: queries.trades ? 'true' : 'false',
        live_stats: queries.liveStats ? 'true' : 'false',
      });
      
      const ws = new WebSocket(`${url}?${queryParams}`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Trade WebSocket connected');
        setConnected(true);
        setIsReconnecting(false);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message: TradeWebSocketMessage = JSON.parse(event.data);
          handleWebSocketMessage(message);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onclose = (event) => {
        console.log('Trade WebSocket disconnected:', event.code, event.reason);
        setConnected(false);
        
        // Attempt to reconnect if not a clean close
        if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          setIsReconnecting(true);
          console.log(`Attempting to reconnect (${reconnectAttemptsRef.current}/${maxReconnectAttempts})...`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, reconnectInterval);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setError('Max reconnection attempts reached');
          setIsReconnecting(false);
        }
      };

      ws.onerror = (err) => {
        console.error('Trade WebSocket error:', err);
        setError('WebSocket connection error');
      };

    } catch (err) {
      console.error('Failed to create WebSocket connection:', err);
      setError('Failed to connect to WebSocket');
    }
  }, [pairAddress, url, queries, reconnectInterval, maxReconnectAttempts]);

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback((message: TradeWebSocketMessage) => {
    switch (message.type) {
      case 'token_data':
        setTokenData(message.data as TokenData);
        break;
      case 'market_data':
        setMarketData(message.data as MarketData);
        break;
      case 'live_stats':
        setLiveStats(message.data as LiveStats);
        break;
      case 'trades':
        setRecentTrades(message.data as TradeData[]);
        break;
      default:
        console.warn('Unknown WebSocket message type:', message.type);
    }
  }, []);

  // Disconnect WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Component unmounting');
      wsRef.current = null;
    }
    
    setConnected(false);
    setIsReconnecting(false);
  }, []);

  // Reconnect function
  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    connectWebSocket();
  }, [disconnect, connectWebSocket]);

  // Load initial data and connect WebSocket
  useEffect(() => {
    if (pairAddress) {
      loadInitialData().then(() => {
        // Connect WebSocket after initial data is loaded
        connectWebSocket();
      });
    }
    
    return () => {
      disconnect();
    };
  }, [pairAddress, loadInitialData, connectWebSocket, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    initialData,
    loading,
    error,
    tokenData,
    marketData,
    liveStats,
    recentTrades,
    connected,
    isReconnecting,
    reconnect,
  };
}
