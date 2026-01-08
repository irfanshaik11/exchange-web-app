import { useEffect, useState, useCallback, useRef } from 'react';
import { env } from '~/env';

// Trade data from the unified WebSocket
export interface SolanaTokenTrade {
  id: number;
  token_mint: string;
  wallet_address: string;
  type: 'BUY' | 'SELL';
  token_amount: number;
  sol_amount: number;
  price_usd: number;
  signature: string;
  timestamp: string;
  // Computed fields for UI compatibility
  trader?: string;
  trader_short?: string;
  total_usd?: number;
  total_usd_formatted?: string;
  market_cap?: number;
  market_cap_formatted?: string;
  age?: string;
  transaction_hash?: string;
}

// Holder data from the unified WebSocket
export interface SolanaTokenHolder {
  wallet_address: string;
  token_mint: string;
  total_bought_tokens: number;
  total_bought_sol: number;
  buy_count: number;
  total_sold_tokens: number;
  total_sold_sol: number;
  sell_count: number;
  remaining_tokens: number;
  avg_buy_price: number;
  avg_sell_price: number;
  first_buy_at: string;
  last_activity_at: string;
}

// Top trader data from the unified WebSocket
export interface SolanaTopTrader {
  wallet_address: string;
  token_mint: string;
  total_bought_tokens: number;
  total_bought_sol: number;
  buy_count: number;
  avg_buy_price: number;
  total_sold_tokens: number;
  total_sold_sol: number;
  sell_count: number;
  avg_sell_price: number;
  realized_pnl: number;
  remaining_tokens: number;
  remaining_percent: number;
  last_activity_at: string;
}

// Dev token data from the unified WebSocket
export interface SolanaDevToken {
  mint: string;
  name: string;
  symbol: string;
  migrated: boolean;
  migrated_pool_address?: string;
  market_cap?: number;
  liquidity?: number;
  volume_1h?: number;
  volume_24h?: number;
  created_at: string;
}

// WebSocket message types
interface WebSocketMessage {
  type: 'snapshot' | 'trade_update' | 'holder_update' | 'top_trader_update' | 'dev_token_update' | 'pong';
  data: {
    trades: SolanaTokenTrade[] | null;
    holders: SolanaTokenHolder[] | null;
    top_traders: SolanaTopTrader[] | null;
    dev_tokens: SolanaDevToken[] | null;
  };
  timestamp: string;
}

interface UseSolanaTokenWebSocketOptions {
  mintAddress?: string;
  enabled?: boolean;
  maxTrades?: number;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onNewTrade?: (trade: SolanaTokenTrade) => void;
  onHoldersUpdate?: (holders: SolanaTokenHolder[]) => void;
  onTopTradersUpdate?: (topTraders: SolanaTopTrader[]) => void;
  onDevTokensUpdate?: (devTokens: SolanaDevToken[]) => void;
}

interface UseSolanaTokenWebSocketReturn {
  trades: SolanaTokenTrade[];
  holders: SolanaTokenHolder[];
  topTraders: SolanaTopTrader[];
  devTokens: SolanaDevToken[];
  connected: boolean;
  error: string | null;
  loading: boolean;
}

// Helper to format trade for UI
function formatTradeForUI(trade: SolanaTokenTrade): SolanaTokenTrade {
  const solPrice = 200; // Approximate SOL price, should be fetched dynamically
  const totalUsd = trade.sol_amount * solPrice;

  return {
    ...trade,
    trader: trade.wallet_address,
    trader_short: trade.wallet_address
      ? `${trade.wallet_address.slice(0, 4)}...${trade.wallet_address.slice(-4)}`
      : '',
    total_usd: totalUsd,
    total_usd_formatted: `$${totalUsd.toFixed(2)}`,
    transaction_hash: trade.signature,
    age: getAge(trade.timestamp),
  };
}

// Helper to calculate age from timestamp
function getAge(timestamp: string): string {
  const now = Date.now();
  const tradeTime = new Date(timestamp).getTime();
  const diffSeconds = Math.floor((now - tradeTime) / 1000);
  const diffMins = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffSeconds / 3600);
  const diffDays = Math.floor(diffSeconds / 86400);

  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  return `${diffMins}m`;
}

/**
 * Unified WebSocket hook for Solana token data (trades + holders)
 * Connects to v1/ws/token/{mint} and receives:
 * - snapshot: Initial trades and holders on connection
 * - trade_update: Real-time trade updates
 * - holder_update: Real-time holder updates
 */
export function useSolanaTokenWebSocket(
  options: UseSolanaTokenWebSocketOptions = {}
): UseSolanaTokenWebSocketReturn {
  const {
    mintAddress,
    enabled = true,
    maxTrades = 100,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
    onNewTrade,
    onHoldersUpdate,
    onTopTradersUpdate,
    onDevTokensUpdate,
  } = options;

  const [trades, setTrades] = useState<SolanaTokenTrade[]>([]);
  const [holders, setHolders] = useState<SolanaTokenHolder[]>([]);
  const [topTraders, setTopTraders] = useState<SolanaTopTrader[]>([]);
  const [devTokens, setDevTokens] = useState<SolanaDevToken[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const mountedRef = useRef(true);
  const onNewTradeRef = useRef(onNewTrade);
  const onHoldersUpdateRef = useRef(onHoldersUpdate);
  const onTopTradersUpdateRef = useRef(onTopTradersUpdate);
  const onDevTokensUpdateRef = useRef(onDevTokensUpdate);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update callback refs when they change
  useEffect(() => {
    onNewTradeRef.current = onNewTrade;
  }, [onNewTrade]);

  useEffect(() => {
    onHoldersUpdateRef.current = onHoldersUpdate;
  }, [onHoldersUpdate]);

  useEffect(() => {
    onTopTradersUpdateRef.current = onTopTradersUpdate;
  }, [onTopTradersUpdate]);

  useEffect(() => {
    onDevTokensUpdateRef.current = onDevTokensUpdate;
  }, [onDevTokensUpdate]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!enabled || !mintAddress) {
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      setError('Max reconnection attempts reached');
      return;
    }

    try {
      const baseUrl = env.NEXT_PUBLIC_WEBSOCKET_URL;
      // Use the unified token WebSocket endpoint
      const wsUrl = `${baseUrl.replace(/^http/, 'ws')}/v1/ws/token/${mintAddress}`;

      console.log('[useSolanaTokenWebSocket] Connecting to:', wsUrl);
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!mountedRef.current) return;
        console.log('[useSolanaTokenWebSocket] Connected');
        setConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;

        // Start ping interval to keep connection alive
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;

        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log('[useSolanaTokenWebSocket] Message type:', message.type);

          if (message.type === 'snapshot') {
            // Initial snapshot with trades, holders, and top_traders
            if (message.data.trades) {
              const formattedTrades = message.data.trades.map(formatTradeForUI);
              console.log('[useSolanaTokenWebSocket] Received trades:', formattedTrades.length);
              setTrades(formattedTrades);
            } else {
              setTrades([]);
            }

            if (message.data.holders) {
              console.log('[useSolanaTokenWebSocket] Received holders:', message.data.holders.length);
              setHolders(message.data.holders);
              onHoldersUpdateRef.current?.(message.data.holders);
            } else {
              setHolders([]);
            }

            if (message.data.top_traders) {
              console.log('[useSolanaTokenWebSocket] Received top_traders:', message.data.top_traders.length);
              setTopTraders(message.data.top_traders);
              onTopTradersUpdateRef.current?.(message.data.top_traders);
            } else {
              setTopTraders([]);
            }

            if (message.data.dev_tokens) {
              console.log('[useSolanaTokenWebSocket] Received dev_tokens:', message.data.dev_tokens.length);
              setDevTokens(message.data.dev_tokens);
              onDevTokensUpdateRef.current?.(message.data.dev_tokens);
            } else {
              setDevTokens([]);
            }

            setLoading(false);
          } else if (message.type === 'trade_update') {
            // Real-time trade update - process ALL trades in the array
            if (message.data.trades && message.data.trades.length > 0) {
              const newTrades = message.data.trades.map(formatTradeForUI);
              console.log('[useSolanaTokenWebSocket] Processing', newTrades.length, 'trade updates');

              // Notify callback for each new trade
              newTrades.forEach((trade) => {
                onNewTradeRef.current?.(trade);
              });

              setTrades((prev) => {
                // Filter out duplicates by signature
                const existingSignatures = new Set(prev.map((t) => t.signature));
                const uniqueNewTrades = newTrades.filter((t) => !existingSignatures.has(t.signature));

                if (uniqueNewTrades.length === 0) return prev;

                // Prepend new trades (newest first) and limit to maxTrades
                const combined = [...uniqueNewTrades, ...prev];
                return combined.slice(0, maxTrades);
              });
            }
          } else if (message.type === 'holder_update') {
            // Real-time holder update
            // Backend sends individual holders directly in message.data (not message.data.holders)
            const holderData = message.data as any;

            if (holderData && holderData.wallet_address) {
              // Single holder update from backend - merge into existing array
              const updatedHolder: SolanaTokenHolder = {
                wallet_address: holderData.wallet_address,
                token_mint: holderData.token_mint,
                total_bought_tokens: holderData.total_bought_tokens || 0,
                total_bought_sol: holderData.total_bought_sol || 0,
                buy_count: holderData.buy_count || 0,
                total_sold_tokens: holderData.total_sold_tokens || 0,
                total_sold_sol: holderData.total_sold_sol || 0,
                sell_count: holderData.sell_count || 0,
                remaining_tokens: holderData.remaining_tokens || 0,
                avg_buy_price: holderData.avg_buy_price || 0,
                avg_sell_price: holderData.avg_sell_price || 0,
                first_buy_at: holderData.first_buy_at || '',
                last_activity_at: holderData.last_activity_at || '',
              };

              setHolders((prev) => {
                const existingIndex = prev.findIndex(
                  (h) => h.wallet_address.toLowerCase() === updatedHolder.wallet_address.toLowerCase()
                );

                if (existingIndex >= 0) {
                  // Update existing holder in place
                  console.log('[useSolanaTokenWebSocket] Holder UPDATED:', updatedHolder.wallet_address.slice(0, 8), 'remaining:', updatedHolder.remaining_tokens);
                  const updated = [...prev];
                  updated[existingIndex] = updatedHolder;
                  return updated;
                } else {
                  // Add new holder and re-sort by remaining tokens
                  console.log('[useSolanaTokenWebSocket] Holder ADDED:', updatedHolder.wallet_address.slice(0, 8), 'remaining:', updatedHolder.remaining_tokens);
                  return [...prev, updatedHolder].sort(
                    (a, b) => (b.remaining_tokens || 0) - (a.remaining_tokens || 0)
                  );
                }
              });

              onHoldersUpdateRef.current?.([updatedHolder]);
            } else if (message.data.holders) {
              // Legacy: full array replacement (if backend ever sends this format)
              console.log('[useSolanaTokenWebSocket] Holders REPLACED (legacy):', message.data.holders.length);
              setHolders(message.data.holders);
              onHoldersUpdateRef.current?.(message.data.holders);
            }
          } else if (message.type === 'top_trader_update') {
            // Real-time top trader update
            if (message.data.top_traders) {
              setTopTraders(message.data.top_traders);
              onTopTradersUpdateRef.current?.(message.data.top_traders);
            }
          } else if (message.type === 'dev_token_update') {
            // Real-time dev token update
            if (message.data.dev_tokens) {
              console.log('[useSolanaTokenWebSocket] Dev tokens update:', message.data.dev_tokens.length);
              setDevTokens(message.data.dev_tokens);
              onDevTokensUpdateRef.current?.(message.data.dev_tokens);
            }
          }
          // Ignore pong messages
        } catch (err) {
          console.error('[useSolanaTokenWebSocket] Error processing message:', err);
        }
      };

      ws.onerror = (event) => {
        if (!mountedRef.current) return;
        console.error('[useSolanaTokenWebSocket] WebSocket error:', event);
        setError('WebSocket connection error');
      };

      ws.onclose = (event) => {
        if (!mountedRef.current) return;
        console.log('[useSolanaTokenWebSocket] Disconnected:', event.code, event.reason);
        setConnected(false);

        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Attempt to reconnect
        if (enabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1;
          console.log(
            `[useSolanaTokenWebSocket] Reconnecting in ${reconnectInterval}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`
          );
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              connect();
            }
          }, reconnectInterval);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[useSolanaTokenWebSocket] Failed to create WebSocket:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setLoading(false);
    }
  }, [enabled, mintAddress, maxTrades, reconnectInterval, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnected(false);
  }, []);

  // Connect to WebSocket on mount or when mintAddress changes
  useEffect(() => {
    mountedRef.current = true;

    if (enabled && mintAddress) {
      setLoading(true);
      setTrades([]);
      setHolders([]);
      setTopTraders([]);
      setDevTokens([]);
      disconnect();
      reconnectAttemptsRef.current = 0;
      connect();
    } else {
      // Not enabled or no mintAddress - set loading to false
      setLoading(false);
    }

    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [enabled, mintAddress, connect, disconnect]);

  return {
    trades,
    holders,
    topTraders,
    devTokens,
    connected,
    error,
    loading,
  };
}

export default useSolanaTokenWebSocket;
