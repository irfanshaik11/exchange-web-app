import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { env } from '~/env';

// Gate verbose logging behind dev-only check — eliminated in production builds by dead-code removal
const isDev = process.env.NODE_ENV !== 'production';

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
  kol_count?: number;
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

// First buyer from the unified WebSocket snapshot
export interface FirstBuyer {
  wallet: string;
  status: 'hold' | 'buy_more' | 'sell_partial' | 'sell_all';
  is_sniper: boolean;
  buy_count?: number;
  sell_count?: number;
  remaining_pct?: number;
}

// First buyers summary from the unified WebSocket snapshot
export interface FirstBuyersSummary {
  hold: number;
  buy_more: number;
  sell_partial: number;
  sell_all: number;
  total: number;
  snipers_hold_pct: number;
  current_holdings_pct: number;
  top10_holders_pct?: number;
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
  twitter?: string;       // Twitter URL (fetched from URI metadata)
  updated_at: string;
  // Token creation timestamp (used for token age display)
  created_at?: string;
  // Dev token tracking
  dev_tokens_created?: number;
  dev_tokens_migrated?: number;
  // Bonding curve progress
  graduation_percent?: number;
  // Holder count
  holder_count?: number;
  // Fee tracking
  total_fees_lamports?: number;
}

// Volume data for a specific timeframe
export interface VolumeTimeframe {
  buy_volume_sol: number;
  sell_volume_sol: number;
  buy_count: number;
  sell_count: number;
}

// Similar token from the unified WebSocket snapshot
export interface SimilarTokenWS {
  mint_address: string;
  name: string;
  symbol: string;
  image?: string;
  uri?: string;        // Metadata URI (JSON with image field)
  market_cap_usd?: number;
  created_at?: number; // unix seconds
}

// Volume data from the unified WebSocket snapshot
export interface SolanaTokenVolume {
  volume_5m: VolumeTimeframe;
  volume_1h: VolumeTimeframe;
  volume_6h: VolumeTimeframe;
  volume_24h: VolumeTimeframe;
}

// WebSocket message types
interface WebSocketMessage {
  type: 'snapshot' | 'trade_update' | 'holder_update' | 'top_trader_update' | 'dev_token_update' | 'token_update' | 'price_update' | 'pong';
  data: {
    trades: SolanaTokenTrade[] | null;
    holders: SolanaTokenHolder[] | null;
    top_traders: SolanaTopTrader[] | null;
    dev_tokens: SolanaDevToken[] | null;
    holder_summary?: HolderSummary | null;
    token?: SolanaTokenInfo | null;
    volume?: SolanaTokenVolume | null;
    similar_tokens?: SimilarTokenWS[] | null;
    first_buyers?: FirstBuyer[] | null;
    first_buyers_summary?: FirstBuyersSummary | null;
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
  firstBuyers: FirstBuyer[];
  firstBuyersSummary: FirstBuyersSummary | null;
  tokenInfo: SolanaTokenInfo | null;
  volume: SolanaTokenVolume | null;
  similarTokens: SimilarTokenWS[];
  connected: boolean;
  error: string | null;
  loading: boolean;
}

// Helper to format trade for UI
function formatTradeForUI(trade: SolanaTokenTrade): SolanaTokenTrade {
  const age = getAge(trade.timestamp);

  return {
    ...trade,
    trader: trade.wallet_address,
    trader_short: trade.wallet_address
      ? `${trade.wallet_address.slice(0, 4)}...${trade.wallet_address.slice(-4)}`
      : '',
    // total_usd intentionally omitted — computed downstream in normalizeTrade() with live chainPrice
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
      if (isDev) console.warn('[getAge] Failed to parse timestamp:', timestamp);
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
interface UriMetadata {
  image_url: string | null;
  twitter: string | null;
}

async function fetchMetadataFromUri(uri: string): Promise<UriMetadata> {
  if (!uri) return { image_url: null, twitter: null };

  try {
    // Handle IPFS URIs
    let fetchUrl = uri;
    if (uri.startsWith('ipfs://')) {
      fetchUrl = `https://ipfs.io/ipfs/${uri.replace('ipfs://', '')}`;
    }

    const response = await fetch(fetchUrl, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) return { image_url: null, twitter: null };

    const metadata = await response.json();

    // Extract image from metadata (standard NFT/token metadata format)
    let imageUrl = metadata.image || metadata.imageUrl || metadata.logo || null;

    // Handle IPFS image URLs
    if (imageUrl && imageUrl.startsWith('ipfs://')) {
      imageUrl = `https://ipfs.io/ipfs/${imageUrl.replace('ipfs://', '')}`;
    }

    // Extract Twitter from metadata
    const twitter = metadata.twitter || metadata.x || null;

    return { image_url: imageUrl, twitter };
  } catch (err) {
    console.debug('[useSolanaTokenWebSocket] Failed to fetch URI metadata:', err);
    return { image_url: null, twitter: null };
  }
}

export function useSolanaTokenWebSocket(
  options: UseSolanaTokenWebSocketOptions = {}
): UseSolanaTokenWebSocketReturn {
  const {
    mintAddress,
    enabled = true,
    maxTrades = Infinity,
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
  const [firstBuyers, setFirstBuyers] = useState<FirstBuyer[]>([]);
  const [firstBuyersSummary, setFirstBuyersSummary] = useState<FirstBuyersSummary | null>(null);
  const [tokenInfo, setTokenInfo] = useState<SolanaTokenInfo | null>(null);
  const [volume, setVolume] = useState<SolanaTokenVolume | null>(null);
  const [similarTokens, setSimilarTokens] = useState<SimilarTokenWS[]>([]);
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

      if (isDev) console.log('[useSolanaTokenWebSocket] Connecting to:', wsUrl);
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!mountedRef.current) return;
        if (isDev) console.log('[useSolanaTokenWebSocket] Connected');
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
          if (isDev) console.log('[useSolanaTokenWebSocket] Message type:', message.type);

          if (message.type === 'snapshot') {
            // Initial snapshot with trades, holders, and top_traders
            if (message.data.trades) {
              const formattedTrades = message.data.trades.map(formatTradeForUI);
              if (isDev) console.log('[useSolanaTokenWebSocket] Received trades:', formattedTrades.length);
              setTrades(formattedTrades);
            } else {
              setTrades([]);
            }

            if (message.data.holders) {
              if (isDev) console.log('[useSolanaTokenWebSocket] Received holders:', message.data.holders.length);
              setHolders(message.data.holders);
              onHoldersUpdateRef.current?.(message.data.holders);
            } else {
              setHolders([]);
            }

            if (message.data.top_traders) {
              if (isDev) console.log('[useSolanaTokenWebSocket] Received top_traders:', message.data.top_traders.length);
              setTopTraders(message.data.top_traders);
              onTopTradersUpdateRef.current?.(message.data.top_traders);
            } else {
              setTopTraders([]);
            }

            if (message.data.dev_tokens) {
              if (isDev) console.log('[useSolanaTokenWebSocket] Received dev_tokens:', message.data.dev_tokens.length);
              setDevTokens(message.data.dev_tokens);
              onDevTokensUpdateRef.current?.(message.data.dev_tokens);
            } else {
              setDevTokens([]);
            }

            // Capture holder_summary from snapshot (normalize field names)
            if (message.data.holder_summary) {
              const raw = message.data.holder_summary as any;
              const normalized = {
                ...raw,
                sniper_held_percent: raw.sniper_held_percent ?? raw.sniper_percent ?? 0,
                top10_held_percent: raw.top10_held_percent ?? raw.top10_holders_pct ?? 0,
              };
              if (isDev) console.log('[useSolanaTokenWebSocket] Received holder_summary:', normalized);
              setHolderSummary(normalized);
            } else {
              setHolderSummary(null);
            }

            // Capture first_buyers from snapshot
            if (message.data.first_buyers && message.data.first_buyers.length > 0) {
              if (isDev) console.log('[useSolanaTokenWebSocket] Received first_buyers:', message.data.first_buyers.length);
              setFirstBuyers(message.data.first_buyers);
            } else {
              setFirstBuyers([]);
            }

            // Capture first_buyers_summary from snapshot
            if (message.data.first_buyers_summary) {
              if (isDev) console.log('[useSolanaTokenWebSocket] Received first_buyers_summary:', message.data.first_buyers_summary);
              setFirstBuyersSummary(message.data.first_buyers_summary);
            } else {
              setFirstBuyersSummary(null);
            }

            // Capture token info from snapshot (price, mcap, liquidity, uri)
            if (message.data.token) {
              if (isDev) console.log('[useSolanaTokenWebSocket] Received token info:', message.data.token);
              const rawToken = message.data.token;

              // CRITICAL: Validate that received token matches requested mint
              // This prevents showing wrong token data if WebSocket returns stale/wrong data
              if (rawToken.mint && mintAddress && rawToken.mint !== mintAddress) {
                if (isDev) console.warn('[useSolanaTokenWebSocket] Token mint mismatch! Ignoring wrong token data.', {
                  expectedMint: mintAddress,
                  actualMint: rawToken.mint,
                  actualName: rawToken.name || rawToken.symbol,
                });
                // Don't update tokenInfo with wrong data
              } else {
                // If we have a URI, fetch image and twitter from metadata
                if (rawToken.uri && (!rawToken.image_url || !rawToken.twitter)) {
                  fetchMetadataFromUri(rawToken.uri).then((metadata) => {
                    if (mountedRef.current && (metadata.image_url || metadata.twitter)) {
                      const tokenWithMetadata: SolanaTokenInfo = {
                        ...rawToken,
                        image_url: metadata.image_url || rawToken.image_url,
                        twitter: metadata.twitter || rawToken.twitter,
                      };
                      setTokenInfo(tokenWithMetadata);
                      onTokenInfoUpdateRef.current?.(tokenWithMetadata);
                    }
                  });
                }

                // Set token info immediately (image/twitter will be updated async if available)
                setTokenInfo(rawToken);
                onTokenInfoUpdateRef.current?.(rawToken);
              }
            } else {
              setTokenInfo(null);
            }

            // Capture volume data from snapshot
            if (message.data.volume) {
              if (isDev) console.log('[useSolanaTokenWebSocket] Received volume data:', message.data.volume);
              setVolume(message.data.volume);
            } else {
              setVolume(null);
            }

            // Capture similar tokens from snapshot
            if (message.data.similar_tokens && message.data.similar_tokens.length > 0) {
              if (isDev) console.log('[useSolanaTokenWebSocket] Received similar tokens:', message.data.similar_tokens.length);
              setSimilarTokens(message.data.similar_tokens);
            } else {
              setSimilarTokens([]);
            }

            setLoading(false);
          } else if (message.type === 'trade_update') {
            // Real-time trade update - process ALL trades in the array
            if (message.data.trades && message.data.trades.length > 0) {
              const newTrades = message.data.trades.map(formatTradeForUI);
              if (isDev) console.log('[useSolanaTokenWebSocket] Processing', newTrades.length, 'trade updates');

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
              // Note: We merge with existing data to preserve fields like holder_type
              // that may not be sent in every update
              setHolders((prev) => {
                const existingIndex = prev.findIndex(
                  (h) => h.wallet_address.toLowerCase() === holderData.wallet_address.toLowerCase()
                );

                // Build updated holder by merging with existing data (preserves holder_type, etc.)
                const existingHolder = existingIndex >= 0 ? prev[existingIndex] : null;
                const updatedHolder: SolanaTokenHolder = {
                  // Start with existing data (preserves holder_type and other fields)
                  ...(existingHolder || {}),
                  // Then apply the update (new values override old)
                  wallet_address: holderData.wallet_address,
                  token_mint: holderData.token_mint || existingHolder?.token_mint || '',
                  total_bought_tokens: holderData.total_bought_tokens ?? existingHolder?.total_bought_tokens ?? 0,
                  total_bought_sol: holderData.total_bought_sol ?? existingHolder?.total_bought_sol ?? 0,
                  buy_count: holderData.buy_count ?? existingHolder?.buy_count ?? 0,
                  total_sold_tokens: holderData.total_sold_tokens ?? existingHolder?.total_sold_tokens ?? 0,
                  total_sold_sol: holderData.total_sold_sol ?? existingHolder?.total_sold_sol ?? 0,
                  sell_count: holderData.sell_count ?? existingHolder?.sell_count ?? 0,
                  remaining_tokens: holderData.remaining_tokens ?? existingHolder?.remaining_tokens ?? 0,
                  avg_buy_price: holderData.avg_buy_price ?? existingHolder?.avg_buy_price ?? 0,
                  avg_sell_price: holderData.avg_sell_price ?? existingHolder?.avg_sell_price ?? 0,
                  first_buy_at: holderData.first_buy_at || existingHolder?.first_buy_at || '',
                  last_activity_at: holderData.last_activity_at || existingHolder?.last_activity_at || '',
                  // Preserve holder_type from existing OR use new value if provided
                  holder_type: holderData.holder_type || existingHolder?.holder_type,
                  sol_balance_lamports: holderData.sol_balance_lamports ?? existingHolder?.sol_balance_lamports,
                };

                if (existingIndex >= 0) {
                  // Update existing holder in place
                  if (isDev) console.log('[useSolanaTokenWebSocket] Holder UPDATED:', updatedHolder.wallet_address.slice(0, 8), 'remaining:', updatedHolder.remaining_tokens, 'type:', updatedHolder.holder_type);
                  const updated = [...prev];
                  updated[existingIndex] = updatedHolder;
                  return updated;
                } else {
                  // Add new holder and re-sort by remaining tokens
                  if (isDev) console.log('[useSolanaTokenWebSocket] Holder ADDED:', updatedHolder.wallet_address.slice(0, 8), 'remaining:', updatedHolder.remaining_tokens, 'type:', updatedHolder.holder_type);
                  return [...prev, updatedHolder].sort(
                    (a, b) => (b.remaining_tokens || 0) - (a.remaining_tokens || 0)
                  );
                }
              });

              onHoldersUpdateRef.current?.([holderData]);
            } else if (message.data.holders) {
              // Legacy: full array replacement (if backend ever sends this format)
              if (isDev) console.log('[useSolanaTokenWebSocket] Holders REPLACED (legacy):', message.data.holders.length);
              setHolders(message.data.holders);
              onHoldersUpdateRef.current?.(message.data.holders);
            }
          } else if (message.type === 'top_trader_update') {
            // Real-time top trader update - merge with existing data
            if (message.data.top_traders && message.data.top_traders.length > 0) {
              const newTopTraders = message.data.top_traders;
              if (isDev) console.log('[useSolanaTokenWebSocket] Top traders update:', newTopTraders.length);

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

                if (isDev) console.log('[useSolanaTokenWebSocket] Top traders merged:', merged.length);
                return merged;
              });

              onTopTradersUpdateRef.current?.(newTopTraders);
            }
          } else if (message.type === 'dev_token_update') {
            // Real-time dev token update - merge with existing data
            if (message.data.dev_tokens && message.data.dev_tokens.length > 0) {
              const newDevTokens = message.data.dev_tokens;
              if (isDev) console.log('[useSolanaTokenWebSocket] Dev tokens update:', newDevTokens.length);

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

                if (isDev) console.log('[useSolanaTokenWebSocket] Dev tokens merged:', merged.length);
                return merged;
              });

              onDevTokensUpdateRef.current?.(newDevTokens);
            }
          } else if (message.type === 'token_update') {
            // Real-time token info update (price, mcap, liquidity)
            if (message.data.token) {
              if (isDev) console.log('[useSolanaTokenWebSocket] Token info update:', message.data.token);
              const rawToken = message.data.token;

              // CRITICAL: Validate that received token matches requested mint
              if (rawToken.mint && mintAddress && rawToken.mint !== mintAddress) {
                if (isDev) console.warn('[useSolanaTokenWebSocket] Token update mint mismatch! Ignoring.', {
                  expectedMint: mintAddress,
                  actualMint: rawToken.mint,
                });
              } else {
                // Preserve image_url and twitter if we already have them (from initial URI fetch)
                setTokenInfo((prev) => ({
                  ...rawToken,
                  image_url: rawToken.image_url || prev?.image_url,
                  twitter: rawToken.twitter || prev?.twitter,
                }));
                onTokenInfoUpdateRef.current?.(rawToken);
              }
            }
          } else if (message.type === 'price_update') {
            // Real-time price update with holder analysis, liquidity, and volume data
            // NOTE: price_usd and market_cap_usd are NOT updated here — OHLC provides more accurate values
            const tokenData = (message.data as any)?.token || (message.data as any);

            // Guard: need valid data with mint, and mint must match current token
            if (!tokenData?.mint || tokenData.mint !== mintAddress) {
              if (isDev && tokenData?.mint && tokenData.mint !== mintAddress) {
                console.warn('[useSolanaTokenWebSocket] price_update mint mismatch, ignoring', {
                  expected: mintAddress, got: tokenData.mint,
                });
              }
            } else {

            if (isDev) console.log('[useSolanaTokenWebSocket] price_update:', {
              mint: tokenData.mint?.slice(0, 8),
              liquidity: tokenData.liquidity_usd,
              holders: tokenData.holder_count,
              bundle: tokenData.bundle_percent,
            });

            // A. Update tokenInfo — only liquidity, graduation, fees (NOT price/mcap)
            setTokenInfo((prev) => {
              if (!prev) return prev; // Need snapshot first
              return {
                ...prev,
                // Only update liquidity (price_usd/market_cap_usd come from OHLC)
                ...(tokenData.liquidity_usd > 0 && { liquidity_usd: tokenData.liquidity_usd }),
                // [HOLDERS-SNAPSHOT-ONLY] holder_count from price_updates disabled — using snapshot only for now
                // Re-enable when price_updates holder data is reliable:
                // ...(tokenData.holder_count > 0 && { holder_count: tokenData.holder_count }),
                ...(tokenData.graduation_percent > 0 && { graduation_percent: tokenData.graduation_percent }),
                ...(tokenData.total_fees_lamports > 0 && { total_fees_lamports: tokenData.total_fees_lamports }),
                ...(tokenData.dev_tokens_created > 0 && { dev_tokens_created: tokenData.dev_tokens_created }),
                ...(tokenData.dev_tokens_migrated > 0 && { dev_tokens_migrated: tokenData.dev_tokens_migrated }),
              };
            });

            // [HOLDERS-SNAPSHOT-ONLY] holderSummary updates from price_updates disabled — using snapshot only for now.
            // Re-enable this entire block when price_updates holder data is reliable:
            // B. Update holderSummary (holder analysis fields with non-zero guard)
            // setHolderSummary((prev) => {
            //   if (!prev) return prev; // Need snapshot first
            //   return {
            //     ...prev,
            //     ...(tokenData.dev_percent > 0 && { dev_held_percent: tokenData.dev_percent }),
            //     ...(tokenData.sniper_percent > 0 && { sniper_held_percent: tokenData.sniper_percent }),
            //     ...(tokenData.insider_percent > 0 && { insider_held_percent: tokenData.insider_percent }),
            //     ...(tokenData.top10_holders_pct > 0 && { top10_held_percent: tokenData.top10_holders_pct }),
            //     ...(tokenData.bundle_percent > 0 && { bundler_held_percent: tokenData.bundle_percent }),
            //     ...(tokenData.bundle_wallet_count > 0 && { bundler_count: tokenData.bundle_wallet_count }),
            //     ...(tokenData.holder_count > 0 && { total_holders: tokenData.holder_count }),
            //     ...(tokenData.kol_count > 0 && { kol_count: tokenData.kol_count }),
            //   };
            // });

            // C. Volume from price_update disabled — snapshot provides authoritative volume data.
            //    price_update flat fields (total_buy_volume_5m, etc.) were transformed here into
            //    the nested SolanaTokenVolume structure, but this caused flickering and could
            //    override the more accurate server-aggregated snapshot volume.
            // if (tokenData.total_buy_volume_5m !== undefined || tokenData.total_buy_volume_1h !== undefined) {
            //   setVolume((prev) => {
            //     const base = prev || {
            //       volume_5m: { buy_volume_sol: 0, sell_volume_sol: 0, buy_count: 0, sell_count: 0 },
            //       volume_1h: { buy_volume_sol: 0, sell_volume_sol: 0, buy_count: 0, sell_count: 0 },
            //       volume_6h: { buy_volume_sol: 0, sell_volume_sol: 0, buy_count: 0, sell_count: 0 },
            //       volume_24h: { buy_volume_sol: 0, sell_volume_sol: 0, buy_count: 0, sell_count: 0 },
            //     };
            //     return {
            //       volume_5m: {
            //         buy_volume_sol: tokenData.total_buy_volume_5m ?? base.volume_5m.buy_volume_sol,
            //         sell_volume_sol: tokenData.total_sell_volume_5m ?? base.volume_5m.sell_volume_sol,
            //         buy_count: tokenData.total_buys_5m ?? base.volume_5m.buy_count,
            //         sell_count: tokenData.total_sells_5m ?? base.volume_5m.sell_count,
            //       },
            //       volume_1h: {
            //         buy_volume_sol: tokenData.total_buy_volume_1h ?? base.volume_1h.buy_volume_sol,
            //         sell_volume_sol: tokenData.total_sell_volume_1h ?? base.volume_1h.sell_volume_sol,
            //         buy_count: tokenData.total_buys_1h ?? base.volume_1h.buy_count,
            //         sell_count: tokenData.total_sells_1h ?? base.volume_1h.sell_count,
            //       },
            //       volume_6h: {
            //         buy_volume_sol: tokenData.total_buy_volume_6h ?? base.volume_6h.buy_volume_sol,
            //         sell_volume_sol: tokenData.total_sell_volume_6h ?? base.volume_6h.sell_volume_sol,
            //         buy_count: tokenData.total_buys_6h ?? base.volume_6h.buy_count,
            //         sell_count: tokenData.total_sells_6h ?? base.volume_6h.sell_count,
            //       },
            //       volume_24h: {
            //         buy_volume_sol: tokenData.total_buy_volume_24h ?? base.volume_24h.buy_volume_sol,
            //         sell_volume_sol: tokenData.total_sell_volume_24h ?? base.volume_24h.sell_volume_sol,
            //         buy_count: tokenData.total_buys_24h ?? base.volume_24h.buy_count,
            //         sell_count: tokenData.total_sells_24h ?? base.volume_24h.sell_count,
            //       },
            //     };
            //   });
            // }
            } // end else (mint matched)
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
        if (isDev) console.log('[useSolanaTokenWebSocket] Disconnected:', event.code, event.reason);
        setConnected(false);

        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Attempt to reconnect
        if (enabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1;
          if (isDev) console.log(
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
      setVolume(null);
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

  // Reconnect when tab becomes visible (browser freezes timers when hidden)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        enabled &&
        mintAddress
      ) {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          if (isDev) console.log('[useSolanaTokenWebSocket] Tab visible, WS not open — reconnecting');
          reconnectAttemptsRef.current = 0;
          connect();
        } else {
          try {
            wsRef.current.send(JSON.stringify({ type: 'ping' }));
          } catch {
            if (isDev) console.log('[useSolanaTokenWebSocket] Ping failed on tab return — reconnecting');
            reconnectAttemptsRef.current = 0;
            connect();
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled, mintAddress, connect]);

  // Guard: synchronously null out tokenInfo when its mint doesn't match the
  // current mintAddress. useEffect-based resets run AFTER render, so without
  // this, one render leaks stale Token A data into Token B's consumers
  // (causing the watchlist ticker MC flash).
  const safeTokenInfo = useMemo(() => {
    if (!tokenInfo) return null;
    if (mintAddress && tokenInfo.mint && tokenInfo.mint.toLowerCase() !== mintAddress.toLowerCase()) return null;
    return tokenInfo;
  }, [tokenInfo, mintAddress]);

  return {
    trades,
    holders,
    topTraders,
    devTokens,
    holderSummary,
    firstBuyers,
    firstBuyersSummary,
    tokenInfo: safeTokenInfo,
    volume,
    similarTokens,
    connected,
    error,
    loading,
  };
}

export default useSolanaTokenWebSocket;
