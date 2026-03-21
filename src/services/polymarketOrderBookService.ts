// src/services/polymarketOrderBookService.ts
// Singleton WebSocket service for Polymarket CLOB market data.
// One WS connection shared across all components — replaces per-instance WebSocket creation.
// Subscribes with custom_feature_enabled: true to receive all event types:
//   book, price_change, last_trade_price, best_bid_ask, tick_size_change,
//   new_market, market_resolved

type BookCallback = (data: any) => void;
type PriceChangeCallback = (data: any) => void;
type LastTradePriceCallback = (data: any) => void;
type BestBidAskCallback = (data: any) => void;

interface Subscription {
  tokenId: string;
  onBook: BookCallback;
  onPriceChange: PriceChangeCallback;
  onLastTradePrice?: LastTradePriceCallback;
  onBestBidAsk?: BestBidAskCallback;
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

const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
// Polymarket docs: "Send PING every 10 seconds"
const KEEPALIVE_MS = 10_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

class PolymarketOrderBookService {
  private static instance: PolymarketOrderBookService;

  private ws: WebSocket | null = null;
  private subscriptions = new Map<string, Set<Subscription>>(); // tokenId → subscribers
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private _connected = false;
  private intentionalDisconnect = false;

  private constructor() {}

  static getInstance(): PolymarketOrderBookService {
    if (!PolymarketOrderBookService.instance) {
      PolymarketOrderBookService.instance = new PolymarketOrderBookService();
    }
    return PolymarketOrderBookService.instance;
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
  ): () => void {
    const sub: Subscription = { tokenId, onBook, onPriceChange, onLastTradePrice, onBestBidAsk };

    let subs = this.subscriptions.get(tokenId);
    if (!subs) {
      subs = new Set();
      this.subscriptions.set(tokenId, subs);
    }
    subs.add(sub);

    // Connect if not connected, or re-subscribe if already connected
    this.intentionalDisconnect = false;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connect();
    } else {
      // Already connected — update subscription to include new token
      this.sendSubscribe();
    }

    return () => {
      subs?.delete(sub);
      if (subs?.size === 0) {
        this.subscriptions.delete(tokenId);
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
        this.sendSubscribe();
        this.startKeepalive();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const messages = Array.isArray(data) ? data : [data];

          for (const msg of messages) {
            const eventType = msg.event_type || msg.type;

            if (eventType === 'book') {
              const assetId = msg.asset_id;
              if (!assetId) continue;
              const subs = this.subscriptions.get(assetId);
              if (subs) {
                for (const sub of subs) sub.onBook(msg);
              }

            } else if (eventType === 'price_change') {
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

            } else if (eventType === 'last_trade_price') {
              const assetId = msg.asset_id;
              if (!assetId) continue;
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

            } else if (eventType === 'best_bid_ask') {
              const assetId = msg.asset_id;
              if (!assetId) continue;
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
            }
            // tick_size_change, new_market, market_resolved — not consumed yet
          }
        } catch {
          // Ignore parse errors — non-critical
        }
      };

      this.ws.onerror = () => {
        // Handled by onclose
      };

      this.ws.onclose = () => {
        this._connected = false;
        this.stopKeepalive();
        this.ws = null;

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
  }

  private sendSubscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const allTokenIds = [...this.subscriptions.keys()];
    if (allTokenIds.length === 0) return;

    this.ws.send(JSON.stringify({
      type: 'market',
      assets_ids: allTokenIds,
      custom_feature_enabled: true,
    }));
  }

  private startKeepalive(): void {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, KEEPALIVE_MS);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }
}

export default PolymarketOrderBookService;
