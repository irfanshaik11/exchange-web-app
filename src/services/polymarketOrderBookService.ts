// src/services/polymarketOrderBookService.ts
// Singleton WebSocket service for Polymarket CLOB market data.
// One WS connection shared across all components — replaces per-instance WebSocket creation.
//
// Channels/events handled (Market Channel):
//   book, price_change, last_trade_price, best_bid_ask,
//   tick_size_change, new_market, market_resolved
//
// Protocol per Polymarket docs:
//   - Heartbeat: send literal string "PING" every 10s, server replies "PONG"
//   - Subscription: { type: "market", assets_ids: [...], custom_feature_enabled: true }
//   - Dynamic subscribe: { assets_ids: [...], operation: "subscribe", custom_feature_enabled: true }
//   - Dynamic unsubscribe: { assets_ids: [...], operation: "unsubscribe" }

type BookCallback = (data: any) => void;
type PriceChangeCallback = (data: any) => void;
type LastTradePriceCallback = (data: any) => void;
type BestBidAskCallback = (data: any) => void;
type TickSizeChangeCallback = (data: any) => void;
type NewMarketCallback = (data: any) => void;
type MarketResolvedCallback = (data: any) => void;

interface Subscription {
  tokenId: string;
  onBook: BookCallback;
  onPriceChange: PriceChangeCallback;
  onLastTradePrice?: LastTradePriceCallback;
  onBestBidAsk?: BestBidAskCallback;
  onTickSizeChange?: TickSizeChangeCallback;
  onNewMarket?: NewMarketCallback;
  onMarketResolved?: MarketResolvedCallback;
}

// Exported types for consumers
export interface LastTradePrice {
  assetId: string;
  price: number;
  size: number;
  side: string;
  feeRateBps: number;
  timestamp: number;
}

export interface BestBidAsk {
  assetId: string;
  bestBid: number;
  bestAsk: number;
  spread: number;
  timestamp: number;
}

export interface TickSizeChange {
  assetId: string;
  market: string;
  oldTickSize: string;
  newTickSize: string;
  timestamp: number;
}

export interface NewMarketEvent {
  id: string;
  question: string;
  market: string;
  slug: string;
  description: string;
  assetsIds: string[];
  outcomes: string[];
  tags?: string[];
  conditionId: string;
  timestamp: number;
}

export interface MarketResolvedEvent {
  id: string;
  question: string;
  market: string;
  slug: string;
  assetsIds: string[];
  outcomes: string[];
  winningAssetId: string;
  winningOutcome: string;
  timestamp: number;
}

const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

// Polymarket docs: "Send PING every 10 seconds"
const KEEPALIVE_MS = 10_000;
// If no PONG received within this window, consider connection dead
const PONG_TIMEOUT_MS = 15_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

class PolymarketOrderBookService {
  private static instance: PolymarketOrderBookService;

  private ws: WebSocket | null = null;
  private subscriptions = new Map<string, Set<Subscription>>(); // tokenId → subscribers
  private serverSubscribedIds = new Set<string>(); // token IDs the server knows about
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private _connected = false;
  private intentionalDisconnect = false;
  private lastPongAt = 0;
  private connectionListeners = new Set<(connected: boolean) => void>();

  private constructor() {}

  static getInstance(): PolymarketOrderBookService {
    if (!PolymarketOrderBookService.instance) {
      PolymarketOrderBookService.instance = new PolymarketOrderBookService();
    }
    return PolymarketOrderBookService.instance;
  }

  /**
   * Listen for connection status changes (event-driven, replaces polling).
   * Returns an unsubscribe function.
   */
  onConnectionChange(listener: (connected: boolean) => void): () => void {
    this.connectionListeners.add(listener);
    // Immediately notify with current state
    listener(this._connected);
    return () => { this.connectionListeners.delete(listener); };
  }

  private notifyConnectionChange(connected: boolean): void {
    for (const listener of this.connectionListeners) listener(connected);
  }

  /**
   * Subscribe to market events for a token.
   * Returns an unsubscribe function (call on component unmount).
   */
  subscribe(
    tokenId: string,
    onBook: BookCallback,
    onPriceChange: PriceChangeCallback,
    onLastTradePrice?: LastTradePriceCallback,
    onBestBidAsk?: BestBidAskCallback,
    onTickSizeChange?: TickSizeChangeCallback,
    onNewMarket?: NewMarketCallback,
    onMarketResolved?: MarketResolvedCallback,
  ): () => void {
    const sub: Subscription = {
      tokenId, onBook, onPriceChange, onLastTradePrice, onBestBidAsk,
      onTickSizeChange, onNewMarket, onMarketResolved,
    };

    let subs = this.subscriptions.get(tokenId);
    if (!subs) {
      subs = new Set();
      this.subscriptions.set(tokenId, subs);
    }
    subs.add(sub);

    // Connect if not connected, or send incremental subscribe if already connected
    this.intentionalDisconnect = false;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connect();
    } else if (!this.serverSubscribedIds.has(tokenId)) {
      // New token — send incremental subscribe
      this.sendIncrementalSubscribe([tokenId]);
    }
    // If already subscribed on server for this tokenId, no message needed

    return () => {
      subs?.delete(sub);
      if (subs?.size === 0) {
        this.subscriptions.delete(tokenId);
        // Send unsubscribe to server so it stops sending data for this token
        this.sendUnsubscribe([tokenId]);
      }
      // Disconnect if no subscriptions remain
      if (this.subscriptions.size === 0) {
        this.disconnect();
      }
    };
  }

  get isConnected(): boolean {
    return this._connected;
  }

  // ── Connection management ──────────────────────────────────────────────

  private connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        this._connected = true;
        this.reconnectAttempts = 0;
        this.lastPongAt = Date.now();
        this.serverSubscribedIds.clear();
        // Send full subscription on fresh connection
        this.sendFullSubscribe();
        this.startKeepalive();
        this.notifyConnectionChange(true);
      };

      this.ws.onmessage = (event) => {
        try {
          const raw = typeof event.data === 'string' ? event.data.trim() : '';

          // Handle PONG response (literal string per Polymarket docs)
          if (raw === 'PONG') {
            this.lastPongAt = Date.now();
            return;
          }

          const data = JSON.parse(raw);
          const messages = Array.isArray(data) ? data : [data];

          for (const msg of messages) {
            this.dispatchMessage(msg);
          }
        } catch {
          // Ignore parse errors — could be non-JSON control messages
        }
      };

      this.ws.onerror = () => {
        // Handled by onclose
      };

      this.ws.onclose = () => {
        this._connected = false;
        this.stopKeepalive();
        this.ws = null;
        this.serverSubscribedIds.clear();
        this.notifyConnectionChange(false);

        // Only reconnect if disconnect was not intentional and we still have subscribers
        if (!this.intentionalDisconnect && this.subscriptions.size > 0) {
          const delay = Math.min(
            RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts),
            RECONNECT_MAX_MS
          );
          this.reconnectAttempts++;
          this.reconnectTimeout = setTimeout(() => this.connect(), delay);
        }
      };
    } catch {
      // Will retry via onclose path
    }
  }

  private disconnect(): void {
    this.intentionalDisconnect = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.stopKeepalive();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
    this.reconnectAttempts = 0;
    this.serverSubscribedIds.clear();
  }

  // ── Subscription messages ──────────────────────────────────────────────

  /**
   * Send full subscription (used on fresh connection).
   * Per docs: { type: "market", assets_ids: [...], custom_feature_enabled: true }
   */
  private sendFullSubscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const allTokenIds = [...this.subscriptions.keys()];
    if (allTokenIds.length === 0) return;

    this.ws.send(JSON.stringify({
      type: 'market',
      assets_ids: allTokenIds,
      custom_feature_enabled: true,
    }));

    // Track what the server knows about
    for (const id of allTokenIds) {
      this.serverSubscribedIds.add(id);
    }
  }

  /**
   * Send incremental subscribe for new token IDs (no full resend).
   * Per docs: { assets_ids: [...], operation: "subscribe", custom_feature_enabled: true }
   */
  private sendIncrementalSubscribe(tokenIds: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || tokenIds.length === 0) return;

    this.ws.send(JSON.stringify({
      assets_ids: tokenIds,
      operation: 'subscribe',
      custom_feature_enabled: true,
    }));

    for (const id of tokenIds) {
      this.serverSubscribedIds.add(id);
    }
  }

  /**
   * Send unsubscribe for removed token IDs.
   * Per docs: { assets_ids: [...], operation: "unsubscribe" }
   */
  private sendUnsubscribe(tokenIds: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || tokenIds.length === 0) return;

    // Only unsubscribe IDs the server actually knows about
    const toUnsub = tokenIds.filter(id => this.serverSubscribedIds.has(id));
    if (toUnsub.length === 0) return;

    this.ws.send(JSON.stringify({
      assets_ids: toUnsub,
      operation: 'unsubscribe',
    }));

    for (const id of toUnsub) {
      this.serverSubscribedIds.delete(id);
    }
  }

  // ── Heartbeat / liveness ───────────────────────────────────────────────

  /**
   * Per Polymarket docs: send literal string "PING" every 10 seconds.
   * Server replies with literal string "PONG".
   * If no PONG within PONG_TIMEOUT_MS, force reconnect.
   */
  private startKeepalive(): void {
    this.stopKeepalive();
    this.lastPongAt = Date.now();

    this.keepaliveTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      // Check liveness — if no PONG received recently, connection is dead
      if (Date.now() - this.lastPongAt > PONG_TIMEOUT_MS) {
        console.warn('[PolymarketWS] No PONG received — forcing reconnect');
        this.ws.close();
        return;
      }

      // Send heartbeat per docs: literal string "PING"
      this.ws.send('PING');
    }, KEEPALIVE_MS);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  // ── Message dispatch ───────────────────────────────────────────────────

  private dispatchMessage(msg: any): void {
    const eventType = msg.event_type || msg.type;

    switch (eventType) {
      case 'book': {
        const assetId = msg.asset_id;
        if (!assetId) break;
        const subs = this.subscriptions.get(assetId);
        if (subs) {
          for (const sub of subs) sub.onBook(msg);
        }
        break;
      }

      case 'price_change': {
        const priceChanges = msg.price_changes || [];
        for (const change of priceChanges) {
          const assetId = change.asset_id;
          if (!assetId) continue;
          const subs = this.subscriptions.get(assetId);
          if (subs) {
            for (const sub of subs) {
              sub.onPriceChange({ ...change, timestamp: msg.timestamp });
            }
          }
        }
        break;
      }

      case 'last_trade_price': {
        const assetId = msg.asset_id;
        if (!assetId) break;
        const subs = this.subscriptions.get(assetId);
        if (subs) {
          const parsed: LastTradePrice = {
            assetId,
            price: parseFloat(msg.price || '0'),
            size: parseFloat(msg.size || '0'),
            side: msg.side || '',
            feeRateBps: parseInt(msg.fee_rate_bps || '0', 10),
            timestamp: parseInt(msg.timestamp || '0', 10),
          };
          for (const sub of subs) sub.onLastTradePrice?.(parsed);
        }
        break;
      }

      case 'best_bid_ask': {
        const assetId = msg.asset_id;
        if (!assetId) break;
        const subs = this.subscriptions.get(assetId);
        if (subs) {
          const parsed: BestBidAsk = {
            assetId,
            bestBid: parseFloat(msg.best_bid || '0'),
            bestAsk: parseFloat(msg.best_ask || '0'),
            spread: parseFloat(msg.spread || '0'),
            timestamp: parseInt(msg.timestamp || '0', 10),
          };
          for (const sub of subs) sub.onBestBidAsk?.(parsed);
        }
        break;
      }

      case 'tick_size_change': {
        const assetId = msg.asset_id;
        if (!assetId) break;
        const subs = this.subscriptions.get(assetId);
        if (subs) {
          const parsed: TickSizeChange = {
            assetId,
            market: msg.market || '',
            oldTickSize: msg.old_tick_size || '',
            newTickSize: msg.new_tick_size || '',
            timestamp: parseInt(msg.timestamp || '0', 10),
          };
          for (const sub of subs) sub.onTickSizeChange?.(parsed);
        }
        break;
      }

      case 'new_market': {
        // new_market is broadcast to ALL subscribers (not per-asset)
        const parsed: NewMarketEvent = {
          id: msg.id || '',
          question: msg.question || '',
          market: msg.market || '',
          slug: msg.slug || '',
          description: msg.description || '',
          assetsIds: msg.assets_ids || [],
          outcomes: msg.outcomes || [],
          tags: msg.tags,
          conditionId: msg.condition_id || '',
          timestamp: parseInt(msg.timestamp || '0', 10),
        };
        // Broadcast to all subscribers since new_market isn't per-asset
        for (const [, subs] of this.subscriptions) {
          for (const sub of subs) sub.onNewMarket?.(parsed);
        }
        break;
      }

      case 'market_resolved': {
        // market_resolved — check assets_ids to route to correct subscribers
        const resolvedAssetIds: string[] = msg.assets_ids || [];
        const parsed: MarketResolvedEvent = {
          id: msg.id || '',
          question: msg.question || '',
          market: msg.market || '',
          slug: msg.slug || '',
          assetsIds: resolvedAssetIds,
          outcomes: msg.outcomes || [],
          winningAssetId: msg.winning_asset_id || '',
          winningOutcome: msg.winning_outcome || '',
          timestamp: parseInt(msg.timestamp || '0', 10),
        };

        // Route to subscribers of the resolved market's asset IDs
        const notified = new Set<Subscription>();
        for (const aid of resolvedAssetIds) {
          const subs = this.subscriptions.get(aid);
          if (subs) {
            for (const sub of subs) {
              if (!notified.has(sub)) {
                notified.add(sub);
                sub.onMarketResolved?.(parsed);
              }
            }
          }
        }
        break;
      }
    }
  }
}

export default PolymarketOrderBookService;
