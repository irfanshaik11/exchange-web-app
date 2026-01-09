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
  // New fields from WebSocket
  sol_balance_lamports?: number;
  holder_type?: 'dev' | 'sniper' | 'bundler' | 'holder';
}

// Holder summary from snapshot
export interface HolderSummary {
  dev_wallet?: string;
  dev_held_percent: number;
  dev_remaining_tokens: number;
  dev_sold_all: boolean;
  dev_count: number;
  sniper_held_percent: number;
  sniper_count: number;
  bundler_held_percent: number;
  bundler_count: number;
  insider_held_percent: number;
  insider_count: number;
  top10_held_percent: number;
  total_holders: number;
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

// Token info from the unified WebSocket snapshot
export interface SolanaTokenInfo {
  mint: string;
  name: string;
  symbol: string;
  price_usd: number;
  market_cap_usd: number;
  liquidity_usd: number;
  uri?: string;           // Metadata URI (contains image URL in JSON)
  image_url?: string;     // Direct image URL (fetched from URI metadata)
  updated_at: string;
}

// WebSocket message types
interface WebSocketMessage {
  type: 'snapshot' | 'trade_update' | 'holder_update' | 'top_trader_update' | 'dev_token_update' | 'token_update' | 'pong';
  data: {
    trades: SolanaTokenTrade[] | null;
    holders: SolanaTokenHolder[] | null;
    top_traders: SolanaTopTrader[] | null;
    dev_tokens: SolanaDevToken[] | null;
    holder_summary?: HolderSummary | null;
    token?: SolanaTokenInfo | null;
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
  onTokenInfoUpdate?: (tokenInfo: SolanaTokenInfo) => void;
}

interface UseSolanaTokenWebSocketReturn {
  trades: SolanaTokenTrade[];
  holders: SolanaTokenHolder[];
  topTraders: SolanaTopTrader[];
  devTokens: SolanaDevToken[];
  holderSummary: HolderSummary | null;
  tokenInfo: SolanaTokenInfo | null;
  connected: boolean;
  error: string | null;
  loading: boolean;
}

// Helper to format trade for UI
function formatTradeForUI(trade: SolanaTokenTrade): SolanaTokenTrade {
  const solPrice = 200; // Approximate SOL price, should be fetched dynamically
  const totalUsd = trade.sol_amount * solPrice;
  const age = getAge(trade.timestamp);

  // Debug log for new trades to verify timestamp is correct
  if (age === '0s' || age === '1s' || age === '2s') {
    console.log('[formatTradeForUI] Fresh trade:', {
      signature: trade.signature?.slice(0, 8),
      timestamp: trade.timestamp,
      age,
    });
  }

  return {
    ...trade,
    trader: trade.wallet_address,
    trader_short: trade.wallet_address
      ? `${trade.wallet_address.slice(0, 4)}...${trade.wallet_address.slice(-4)}`
      : '',
    total_usd: totalUsd,
    total_usd_formatted: `$${totalUsd.toFixed(2)}`,
    transaction_hash: trade.signature,
    age,
  };
}

// Helper to calculate age from timestamp
function getAge(timestamp: string): string {
  if (!timestamp) return '0s';

  const now = Date.now();
  let tradeTime: number;

  // Handle various timestamp formats
  if (typeof timestamp === 'string') {
    // Try parsing as ISO/RFC3339 string
    tradeTime = new Date(timestamp).getTime();

    // If parsing failed, return 0s
    if (isNaN(tradeTime)) {
      console.warn('[getAge] Failed to parse timestamp:', timestamp);
      return '0s';
    }
  } else if (typeof timestamp === 'number') {
    // Unix timestamp (seconds or milliseconds)
    tradeTime = timestamp > 1e12 ? timestamp : timestamp * 1000;
  } else {
    return '0s';
  }

  const diffMs = now - tradeTime;
  const diffSeconds = Math.floor(diffMs / 1000);

  // Handle future timestamps (clock skew) - show as just happened
  if (diffSeconds < 0) return '0s';

  const diffMins = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffSeconds / 3600);
  const diffDays = Math.floor(diffSeconds / 86400);

  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  if (diffMins > 0) return `${diffMins}m`;
  return `${diffSeconds}s`;
}

/**
 * Unified WebSocket hook for Solana token data (trades + holders)
 * Connects to v1/ws/token/{mint} and receives:
 * - snapshot: Initial trades and holders on connection
 * - trade_update: Real-time trade updates
 * - holder_update: Real-time holder updates
 */
// Helper to fetch image URL from IPFS metadata URI
async function fetchImageFromUri(uri: string): Promise<string | null> {
  if (!uri) return null;

  try {
    // Handle IPFS URIs
    let fetchUrl = uri;
    if (uri.startsWith('ipfs://')) {
      fetchUrl = `https://ipfs.io/ipfs/${uri.replace('ipfs://', '')}`;
    }

    const response = await fetch(fetchUrl, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) return null;

    const metadata = await response.json();

    // Extract image from metadata (standard NFT/token metadata format)
    let imageUrl = metadata.image || metadata.imageUrl || metadata.logo || null;

    // Handle IPFS image URLs
    if (imageUrl && imageUrl.startsWith('ipfs://')) {
      imageUrl = `https://ipfs.io/ipfs/${imageUrl.replace('ipfs://', '')}`;
    }

    return imageUrl;
  } catch (err) {
    console.debug('[useSolanaTokenWebSocket] Failed to fetch URI metadata:', err);
    return null;
  }
}

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
    onTokenInfoUpdate,
  } = options;

  const [trades, setTrades] = useState<SolanaTokenTrade[]>([]);
  const [holders, setHolders] = useState<SolanaTokenHolder[]>([]);
  const [topTraders, setTopTraders] = useState<SolanaTopTrader[]>([]);
  const [devTokens, setDevTokens] = useState<SolanaDevToken[]>([]);
  const [holderSummary, setHolderSummary] = useState<HolderSummary | null>(null);
  const [tokenInfo, setTokenInfo] = useState<SolanaTokenInfo | null>(null);
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
  const onTokenInfoUpdateRef = useRef(onTokenInfoUpdate);
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

  useEffect(() => {
    onTokenInfoUpdateRef.current = onTokenInfoUpdate;
  }, [onTokenInfoUpdate]);

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

            // Capture holder_summary from snapshot
            if (message.data.holder_summary) {
              console.log('[useSolanaTokenWebSocket] Received holder_summary:', message.data.holder_summary);
              setHolderSummary(message.data.holder_summary);
            } else {
              setHolderSummary(null);
            }

            // Capture token info from snapshot (price, mcap, liquidity, uri)
            if (message.data.token) {
              console.log('[useSolanaTokenWebSocket] Received token info:', message.data.token);
              const rawToken = message.data.token;

              // If we have a URI, fetch the image from metadata
              if (rawToken.uri && !rawToken.image_url) {
                fetchImageFromUri(rawToken.uri).then((imageUrl) => {
                  if (mountedRef.current && imageUrl) {
                    const tokenWithImage: SolanaTokenInfo = {
                      ...rawToken,
                      image_url: imageUrl,
                    };
                    setTokenInfo(tokenWithImage);
                    onTokenInfoUpdateRef.current?.(tokenWithImage);
                  }
                });
              }

              // Set token info immediately (image will be updated async if available)
              setTokenInfo(rawToken);
              onTokenInfoUpdateRef.current?.(rawToken);
            } else {
              setTokenInfo(null);
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
            // Real-time top trader update - merge with existing data
            if (message.data.top_traders && message.data.top_traders.length > 0) {
              const newTopTraders = message.data.top_traders;
              console.log('[useSolanaTokenWebSocket] Top traders update:', newTopTraders.length);

              setTopTraders((prev) => {
                // Create a map of existing traders by wallet address
                const traderMap = new Map(
                  prev.map((t) => [t.wallet_address.toLowerCase(), t])
                );

                // Update or add new traders
                newTopTraders.forEach((trader) => {
                  traderMap.set(trader.wallet_address.toLowerCase(), trader);
                });

                // Convert back to array and sort by realized PnL (highest first)
                const merged = Array.from(traderMap.values()).sort(
                  (a, b) => (b.realized_pnl || 0) - (a.realized_pnl || 0)
                );

                console.log('[useSolanaTokenWebSocket] Top traders merged:', merged.length);
                return merged;
              });

              onTopTradersUpdateRef.current?.(newTopTraders);
            }
          } else if (message.type === 'dev_token_update') {
            // Real-time dev token update - merge with existing data
            if (message.data.dev_tokens && message.data.dev_tokens.length > 0) {
              const newDevTokens = message.data.dev_tokens;
              console.log('[useSolanaTokenWebSocket] Dev tokens update:', newDevTokens.length);

              setDevTokens((prev) => {
                // Create a map of existing dev tokens by mint
                const tokenMap = new Map(
                  prev.map((t) => [t.mint.toLowerCase(), t])
                );

                // Update or add new dev tokens
                newDevTokens.forEach((token) => {
                  tokenMap.set(token.mint.toLowerCase(), token);
                });

                // Convert back to array and sort by created_at (newest first)
                const merged = Array.from(tokenMap.values()).sort(
                  (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                );

                console.log('[useSolanaTokenWebSocket] Dev tokens merged:', merged.length);
                return merged;
              });

              onDevTokensUpdateRef.current?.(newDevTokens);
            }
          } else if (message.type === 'token_update') {
            // Real-time token info update (price, mcap, liquidity)
            if (message.data.token) {
              console.log('[useSolanaTokenWebSocket] Token info update:', message.data.token);
              const rawToken = message.data.token;

              // Preserve image_url if we already have it (from initial URI fetch)
              setTokenInfo((prev) => ({
                ...rawToken,
                image_url: rawToken.image_url || prev?.image_url,
              }));
              onTokenInfoUpdateRef.current?.(rawToken);
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
      setHolderSummary(null);
      setTokenInfo(null);
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
    holderSummary,
    tokenInfo,
    connected,
    error,
    loading,
  };
}

export default useSolanaTokenWebSocket;
