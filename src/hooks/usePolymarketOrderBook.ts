import { useState, useEffect, useCallback } from 'react';
import PolymarketOrderBookService from '../services/polymarketOrderBookService';
import type { LastTradePrice, BestBidAsk } from '../services/polymarketOrderBookService';

// Re-export for consumers
export type { LastTradePrice, BestBidAsk };

// Polymarket CLOB REST endpoint (for initial snapshot)
const POLYMARKET_CLOB_API = 'https://clob.polymarket.com';

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
  // New: live trade prices and best bid/ask from WS
  yesLastTrade: LastTradePrice | null;
  noLastTrade: LastTradePrice | null;
  yesBestBidAsk: BestBidAsk | null;
  noBestBidAsk: BestBidAsk | null;
}

/**
 * Real-time order book hook using Polymarket CLOB via shared singleton WS service.
 *
 * Strategy:
 * 1. Fetch from REST API for instant data on mount
 * 2. Subscribe to singleton WebSocket service for real-time updates
 *    (all hook instances share one WS connection — saves TCP+TLS overhead)
 * 3. Expose last_trade_price and best_bid_ask events for chart/card live updates
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
  const [yesLastTrade, setYesLastTrade] = useState<LastTradePrice | null>(null);
  const [noLastTrade, setNoLastTrade] = useState<LastTradePrice | null>(null);
  const [yesBestBidAsk, setYesBestBidAsk] = useState<BestBidAsk | null>(null);
  const [noBestBidAsk, setNoBestBidAsk] = useState<BestBidAsk | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Initial REST API fetch for instant data
  useEffect(() => {
    if (!enabled || (!yesTokenId && !noTokenId)) {
      setIsLoading(false);
      return;
    }

    const fetchInitial = async () => {
      const promises: Promise<void>[] = [];

      if (yesTokenId) {
        promises.push(
          fetch(`${POLYMARKET_CLOB_API}/book?token_id=${yesTokenId}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setYesOrderBook(processOrderBook(data, data.asset_id || yesTokenId)); })
            .catch(() => {})
        );
      }

      if (noTokenId) {
        promises.push(
          fetch(`${POLYMARKET_CLOB_API}/book?token_id=${noTokenId}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setNoOrderBook(processOrderBook(data, data.asset_id || noTokenId)); })
            .catch(() => {})
        );
      }

      await Promise.all(promises);
      setIsLoading(false);
    };

    fetchInitial();
  }, [enabled, yesTokenId, noTokenId, processOrderBook]);

  // Subscribe to singleton WS service for real-time updates
  useEffect(() => {
    if (!enabled) return;

    const service = PolymarketOrderBookService.getInstance();
    const unsubs: (() => void)[] = [];

    if (yesTokenId) {
      unsubs.push(service.subscribe(
        yesTokenId,
        // onBook
        (data) => setYesOrderBook(processOrderBook(data, yesTokenId)),
        // onPriceChange
        (change) => {
          const ts = change.timestamp ? parseInt(change.timestamp) : Date.now();
          const priceUpdate: RealtimePriceUpdate = {
            assetId: yesTokenId,
            price: parseFloat(change.price || '0'),
            bestBid: parseFloat(change.best_bid || '0'),
            bestAsk: parseFloat(change.best_ask || '0'),
            timestamp: ts,
          };
          setYesRealtimePrice(priceUpdate);
          setYesOrderBook(prev => prev ? {
            ...prev,
            midPrice: (priceUpdate.bestBid + priceUpdate.bestAsk) / 2,
            spread: priceUpdate.bestAsk - priceUpdate.bestBid,
            timestamp: ts,
          } : prev);
        },
        // onLastTradePrice
        (trade) => setYesLastTrade(trade),
        // onBestBidAsk
        (bba) => setYesBestBidAsk(bba),
      ));
    }

    if (noTokenId) {
      unsubs.push(service.subscribe(
        noTokenId,
        // onBook
        (data) => setNoOrderBook(processOrderBook(data, noTokenId)),
        // onPriceChange
        (change) => {
          const ts = change.timestamp ? parseInt(change.timestamp) : Date.now();
          const priceUpdate: RealtimePriceUpdate = {
            assetId: noTokenId,
            price: parseFloat(change.price || '0'),
            bestBid: parseFloat(change.best_bid || '0'),
            bestAsk: parseFloat(change.best_ask || '0'),
            timestamp: ts,
          };
          setNoRealtimePrice(priceUpdate);
          setNoOrderBook(prev => prev ? {
            ...prev,
            midPrice: (priceUpdate.bestBid + priceUpdate.bestAsk) / 2,
            spread: priceUpdate.bestAsk - priceUpdate.bestBid,
            timestamp: ts,
          } : prev);
        },
        // onLastTradePrice
        (trade) => setNoLastTrade(trade),
        // onBestBidAsk
        (bba) => setNoBestBidAsk(bba),
      ));
    }

    // Poll connection status from the singleton
    const statusInterval = setInterval(() => {
      setIsConnected(service.isConnected);
    }, 2000);

    return () => {
      unsubs.forEach(fn => fn());
      clearInterval(statusInterval);
    };
  }, [enabled, yesTokenId, noTokenId, processOrderBook]);

  // Reconnect: singleton handles reconnection automatically
  const reconnect = useCallback(() => {
    setError(null);
    setIsLoading(true);
    // Re-trigger initial REST fetch by resetting loading state
    // The singleton WS service reconnects automatically
    const promises: Promise<void>[] = [];
    if (yesTokenId) {
      promises.push(
        fetch(`${POLYMARKET_CLOB_API}/book?token_id=${yesTokenId}`)
          .then(r => r.ok ? r.json() : null)
          .then(data => { if (data) setYesOrderBook(processOrderBook(data, data.asset_id || yesTokenId)); })
          .catch(() => {})
      );
    }
    if (noTokenId) {
      promises.push(
        fetch(`${POLYMARKET_CLOB_API}/book?token_id=${noTokenId}`)
          .then(r => r.ok ? r.json() : null)
          .then(data => { if (data) setNoOrderBook(processOrderBook(data, data.asset_id || noTokenId)); })
          .catch(() => {})
      );
    }
    Promise.all(promises).then(() => setIsLoading(false));
  }, [yesTokenId, noTokenId, processOrderBook]);

  return {
    yesOrderBook,
    noOrderBook,
    isConnected,
    isLoading,
    error,
    reconnect,
    yesRealtimePrice,
    noRealtimePrice,
    yesLastTrade,
    noLastTrade,
    yesBestBidAsk,
    noBestBidAsk,
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
