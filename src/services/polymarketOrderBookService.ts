// src/services/polymarketOrderBookService.ts
// Singleton WebSocket service for Polymarket CLOB order book data.
// One WS connection shared across all components — replaces per-instance WebSocket creation.
// Pattern: follows DFlowWebSocketService from useDFlowMarkets.ts

type BookCallback = (data: any) => void;
type PriceChangeCallback = (data: any) => void;

interface Subscription {
  tokenId: string;
  onBook: BookCallback;
  onPriceChange: PriceChangeCallback;
}

const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const KEEPALIVE_MS = 30_000;
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
   * Subscribe to order book and price change events for a token.
   * Returns an unsubscribe function (call on component unmount).
   */
  subscribe(
    tokenId: string,
    onBook: BookCallback,
    onPriceChange: PriceChangeCallback
  ): () => void {
    const sub: Subscription = { tokenId, onBook, onPriceChange };

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
            if (msg.type === 'book' || msg.event_type === 'book') {
              const assetId = msg.asset_id;
              if (!assetId) continue;
              const subs = this.subscriptions.get(assetId);
              if (subs) {
                for (const sub of subs) sub.onBook(msg);
              }
            } else if (msg.type === 'price_change' || msg.event_type === 'price_change') {
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
            }
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
