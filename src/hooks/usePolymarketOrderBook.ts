import { useState, useEffect, useRef, useCallback } from 'react';

// Polymarket CLOB endpoints
const POLYMARKET_CLOB_API = 'https://clob.polymarket.com';
const POLYMARKET_WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

export interface OrderBookLevel {
  price: string;
  size: string;
}

export interface OrderBookData {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
  assetId: string;
  spread?: number;
  midPrice?: number;
}

export interface UsePolymarketOrderBookOptions {
  yesTokenId?: string;
  noTokenId?: string;
  enabled?: boolean;
  maxLevels?: number; // Max number of price levels to show
}

// Real-time price update from WebSocket
export interface RealtimePriceUpdate {
  assetId: string;
  price: number;
  bestBid: number;
  bestAsk: number;
  timestamp: number;
}

export interface UsePolymarketOrderBookResult {
  yesOrderBook: OrderBookData | null;
  noOrderBook: OrderBookData | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  reconnect: () => void;
  // Real-time price from WebSocket (updates frequently)
  yesRealtimePrice: RealtimePriceUpdate | null;
  noRealtimePrice: RealtimePriceUpdate | null;
}

/**
 * Real-time order book hook using Polymarket CLOB
 *
 * Strategy:
 * 1. First fetch from REST API for instant data: GET https://clob.polymarket.com/book?token_id={TOKEN_ID}
 * 2. Then connect to WebSocket for real-time updates
 *
 * REST Response includes: bids, asks, asset_id, timestamp, tick_size, hash, min_order_size, neg_risk
 * WebSocket: wss://ws-subscriptions-clob.polymarket.com/ws/market
 * Subscribe: {"type": "market", "assets_ids": ["TOKEN_ID_1", "TOKEN_ID_2"]}
 */
export default function usePolymarketOrderBook(
  options: UsePolymarketOrderBookOptions = {}
): UsePolymarketOrderBookResult {
  const {
    yesTokenId,
    noTokenId,
    enabled = true,
    maxLevels = 10,
  } = options;

  const [yesOrderBook, setYesOrderBook] = useState<OrderBookData | null>(null);
  const [noOrderBook, setNoOrderBook] = useState<OrderBookData | null>(null);
  const [yesRealtimePrice, setYesRealtimePrice] = useState<RealtimePriceUpdate | null>(null);
  const [noRealtimePrice, setNoRealtimePrice] = useState<RealtimePriceUpdate | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  // Process order book data from either REST or WebSocket
  const processOrderBook = useCallback((data: any, assetId: string): OrderBookData => {
    const bids = (data.bids || [])
      .slice(0, maxLevels)
      .map((bid: any) => ({
        price: bid.price || bid[0],
        size: bid.size || bid[1],
      }));

    const asks = (data.asks || [])
      .slice(0, maxLevels)
      .map((ask: any) => ({
        price: ask.price || ask[0],
        size: ask.size || ask[1],
      }));

    // Calculate spread and mid price
    const bestBid = bids.length > 0 ? parseFloat(bids[0].price) : 0;
    const bestAsk = asks.length > 0 ? parseFloat(asks[0].price) : 0;
    const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : undefined;
    const midPrice = spread !== undefined ? (bestBid + bestAsk) / 2 : undefined;

    return {
      bids,
      asks,
      timestamp: data.timestamp || Date.now(),
      assetId,
      spread,
      midPrice,
    };
  }, [maxLevels]);

  // Fetch order book from REST API (instant data)
  const fetchOrderBookREST = useCallback(async (tokenId: string): Promise<OrderBookData | null> => {
    try {
      const response = await fetch(`${POLYMARKET_CLOB_API}/book?token_id=${tokenId}`);
      if (!response.ok) {
        // 404 is expected for resolved/closed markets - don't warn
        if (response.status !== 404) {
          console.warn(`[PolymarketOrderBook] REST API error: ${response.status}`);
        }
        return null;
      }
      const data = await response.json();
      return processOrderBook(data, data.asset_id || tokenId);
    } catch (e) {
      console.error('[PolymarketOrderBook] REST API fetch failed:', e);
      return null;
    }
  }, [processOrderBook]);

  // Initial REST API fetch for instant data
  const fetchInitialData = useCallback(async () => {
    if (!enabled || (!yesTokenId && !noTokenId)) {
      setIsLoading(false);
      return;
    }

    // Fetch both in parallel
    const promises: Promise<void>[] = [];

    if (yesTokenId) {
      promises.push(
        fetchOrderBookREST(yesTokenId).then(data => {
          if (data) setYesOrderBook(data);
        })
      );
    }

    if (noTokenId) {
      promises.push(
        fetchOrderBookREST(noTokenId).then(data => {
          if (data) setNoOrderBook(data);
        })
      );
    }

    await Promise.all(promises);
    setIsLoading(false);
  }, [enabled, yesTokenId, noTokenId, fetchOrderBookREST]);

  // Connect to WebSocket for real-time updates
  const connectWebSocket = useCallback(() => {
    if (!enabled || (!yesTokenId && !noTokenId)) {
      return;
    }

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      const ws = new WebSocket(POLYMARKET_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        reconnectAttempts.current = 0;

        // Subscribe to market data for both tokens
        const assetIds: string[] = [];
        if (yesTokenId) assetIds.push(yesTokenId);
        if (noTokenId) assetIds.push(noTokenId);

        if (assetIds.length > 0) {
          const subscribeMessage = {
            type: 'market',
            assets_ids: assetIds,
          };
          ws.send(JSON.stringify(subscribeMessage));
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // WebSocket can send either a single message or an array of messages
          const messages = Array.isArray(data) ? data : [data];

          for (const message of messages) {
            // Handle different message types
            if (message.type === 'book' || message.event_type === 'book') {
              // Full order book snapshot
              const assetId = message.asset_id;
              if (!assetId) continue;

              const orderBook = processOrderBook(message, assetId);

              if (assetId === yesTokenId) {
                setYesOrderBook(orderBook);
              } else if (assetId === noTokenId) {
                setNoOrderBook(orderBook);
              }
            } else if (message.type === 'price_change' || message.event_type === 'price_change') {
              // Real-time price update with best bid/ask
              // Format: { event_type: "price_change", market: "...", price_changes: [...], timestamp: "..." }
              const messageTimestamp = message.timestamp ? parseInt(message.timestamp) : Date.now();
              const priceChanges = message.price_changes || [];

              // Process each price change in the array
              for (const change of priceChanges) {
                const assetId = change.asset_id;
                if (!assetId) continue;

                const priceUpdate: RealtimePriceUpdate = {
                  assetId,
                  price: parseFloat(change.price || '0'),
                  bestBid: parseFloat(change.best_bid || '0'),
                  bestAsk: parseFloat(change.best_ask || '0'),
                  timestamp: messageTimestamp,
                };

                if (assetId === yesTokenId) {
                  setYesRealtimePrice(priceUpdate);
                  // Also update order book's mid price for display consistency
                  setYesOrderBook(prev => prev ? {
                    ...prev,
                    midPrice: (priceUpdate.bestBid + priceUpdate.bestAsk) / 2,
                    spread: priceUpdate.bestAsk - priceUpdate.bestBid,
                    timestamp: messageTimestamp,
                  } : prev);
                } else if (assetId === noTokenId) {
                  setNoRealtimePrice(priceUpdate);
                  setNoOrderBook(prev => prev ? {
                    ...prev,
                    midPrice: (priceUpdate.bestBid + priceUpdate.bestAsk) / 2,
                    spread: priceUpdate.bestAsk - priceUpdate.bestBid,
                    timestamp: messageTimestamp,
                  } : prev);
                }
              }
            }
          }
        } catch (e) {
          console.warn('[PolymarketOrderBook] Failed to parse message:', e);
        }
      };

      ws.onerror = (event) => {
        console.error('[PolymarketOrderBook] WebSocket error:', event);
        // Don't set error here - we still have REST data
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;

        // Attempt reconnection with exponential backoff
        if (enabled && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connectWebSocket();
          }, delay);
        }
      };
    } catch (e) {
      console.error('[PolymarketOrderBook] Failed to create WebSocket:', e);
      // Don't set error - we still have REST data
    }
  }, [enabled, yesTokenId, noTokenId, processOrderBook]);

  // Reconnect function for manual retry
  const reconnect = useCallback(() => {
    reconnectAttempts.current = 0;
    setError(null);
    setIsLoading(true);
    // Fetch REST first, then connect WebSocket
    fetchInitialData().then(() => {
      connectWebSocket();
    });
  }, [fetchInitialData, connectWebSocket]);

  // On mount: fetch REST data first, then connect WebSocket
  useEffect(() => {
    // First, get instant data from REST API
    fetchInitialData().then(() => {
      // Then connect to WebSocket for real-time updates
      connectWebSocket();
    });

    return () => {
      // Cleanup
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [fetchInitialData, connectWebSocket]);

  return {
    yesOrderBook,
    noOrderBook,
    isConnected,
    isLoading,
    error,
    reconnect,
    yesRealtimePrice,
    noRealtimePrice,
  };
}

// Helper to format price as percentage
export const formatOrderBookPrice = (price: string | number): string => {
  const p = typeof price === 'string' ? parseFloat(price) : price;
  return `${(p * 100).toFixed(1)}¢`;
};

// Helper to format size
export const formatOrderBookSize = (size: string | number): string => {
  const s = typeof size === 'string' ? parseFloat(size) : size;
  if (s >= 1000000) return `${(s / 1000000).toFixed(1)}M`;
  if (s >= 1000) return `${(s / 1000).toFixed(1)}K`;
  return s.toFixed(0);
};
