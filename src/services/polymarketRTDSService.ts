// src/services/polymarketRTDSService.ts
// Polymarket Real-Time Data Socket (RTDS) — singleton WebSocket service.
// Streams crypto prices (Binance/Chainlink), equity prices (Pyth), and comments.
//
// Protocol per Polymarket docs:
//   Endpoint: wss://ws-live-data.polymarket.com
//   Heartbeat: send "PING" every 5 seconds
//   Subscribe: { action: "subscribe", subscriptions: [{ topic, type, filters?, gamma_auth? }] }
//   Unsubscribe: { action: "unsubscribe", subscriptions: [{ topic, type, filters? }] }
//
// Topics:
//   - crypto_prices (Binance): symbols like "solusdt", "btcusdt"
//   - crypto_prices_chainlink: symbols like "eth/usd", "btc/usd"
//   - equity_prices (Pyth): symbols like "AAPL", "TSLA", "EURUSD", "XAUUSD"
//   - comments: comment_created, comment_removed, reaction_created, reaction_removed

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CryptoPriceUpdate {
  symbol: string;     // e.g. "solusdt" or "eth/usd"
  value: number;      // Current price
  timestamp: number;  // Unix ms
  source: 'binance' | 'chainlink';
}

export interface EquityPriceUpdate {
  symbol: string;              // e.g. "aapl" (always lowercase in payload)
  value: number;               // Spot price
  fullAccuracyValue?: string;  // Full-precision string
  timestamp: number;           // Unix ms
  receivedAt?: number;         // When system received the price
  isCarriedForward?: boolean;  // true when market closed
}

export interface EquityPriceSnapshot {
  symbol: string;
  data: Array<{ timestamp: number; value: number }>;
}

export interface CommentEvent {
  type: 'comment_created' | 'comment_removed' | 'reaction_created' | 'reaction_removed';
  id?: string;
  body?: string;
  parentCommentID?: string;
  parentEntityID?: number;
  parentEntityType?: string;
  profile?: {
    baseAddress: string;
    name: string;
    pseudonym: string;
    displayUsernamePublic: boolean;
  };
  userAddress?: string;
  reactionCount?: number;
  timestamp: number;
}

type CryptoPriceCallback = (update: CryptoPriceUpdate) => void;
type EquityPriceCallback = (update: EquityPriceUpdate) => void;
type EquitySnapshotCallback = (snapshot: EquityPriceSnapshot) => void;
type CommentCallback = (event: CommentEvent) => void;

interface Subscription {
  id: string; // unique ID for cleanup
  topic: string;
  filters?: string;
  onCryptoPrice?: CryptoPriceCallback;
  onEquityPrice?: EquityPriceCallback;
  onEquitySnapshot?: EquitySnapshotCallback;
  onComment?: CommentCallback;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const WS_URL = 'wss://ws-live-data.polymarket.com';
// RTDS keepalive: send PING every 5s (one-way — server does NOT reply with PONG).
// The PING just prevents the server from closing the connection due to inactivity.
const KEEPALIVE_MS = 5_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

let subIdCounter = 0;

// ── Singleton Service ──────────────────────────────────────────────────────────

class PolymarketRTDSService {
  private static instance: PolymarketRTDSService;

  private ws: WebSocket | null = null;
  private subscriptions = new Map<string, Subscription>(); // subId → Subscription
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private _connected = false;
  private intentionalDisconnect = false;

  private constructor() {}

  static getInstance(): PolymarketRTDSService {
    if (!PolymarketRTDSService.instance) {
      PolymarketRTDSService.instance = new PolymarketRTDSService();
    }
    return PolymarketRTDSService.instance;
  }

  get isConnected(): boolean {
    return this._connected;
  }

  // ── Public subscribe methods ───────────────────────────────────────────

  /**
   * Subscribe to Binance crypto price updates.
   * @param symbols - Lowercase concatenated pairs, e.g. ["solusdt", "btcusdt"]. Empty = all.
   */
  subscribeCryptoPrices(
    symbols: string[],
    onUpdate: CryptoPriceCallback,
  ): () => void {
    const filters = symbols.length > 0 ? symbols.join(',') : '';
    return this.addSubscription({
      topic: 'crypto_prices',
      filters,
      onCryptoPrice: onUpdate,
    });
  }

  /**
   * Subscribe to Chainlink crypto price updates.
   * @param symbol - Slash-separated pair, e.g. "eth/usd". Empty string = all.
   */
  subscribeCryptoPricesChainlink(
    symbol: string,
    onUpdate: CryptoPriceCallback,
  ): () => void {
    const filters = symbol ? JSON.stringify({ symbol }) : '';
    return this.addSubscription({
      topic: 'crypto_prices_chainlink',
      filters,
      onCryptoPrice: onUpdate,
    });
  }

  /**
   * Subscribe to equity/forex/commodity price updates.
   * @param symbol - Uppercase symbol, e.g. "AAPL", "EURUSD", "XAUUSD"
   * @param onUpdate - Live tick callback
   * @param onSnapshot - Historical snapshot callback (2min of data on subscribe)
   */
  subscribeEquityPrices(
    symbol: string,
    onUpdate: EquityPriceCallback,
    onSnapshot?: EquitySnapshotCallback,
  ): () => void {
    const filters = symbol ? JSON.stringify({ symbol }) : '';
    return this.addSubscription({
      topic: 'equity_prices',
      filters,
      onEquityPrice: onUpdate,
      onEquitySnapshot: onSnapshot,
    });
  }

  /**
   * Subscribe to comment events.
   * @param types - Event types to listen for, e.g. ["comment_created"]. Empty = all.
   */
  subscribeComments(
    types: Array<'comment_created' | 'comment_removed' | 'reaction_created' | 'reaction_removed'>,
    onEvent: CommentCallback,
  ): () => void {
    // For comments, we subscribe per-type or use '*' for all
    const unsubs: Array<() => void> = [];

    if (types.length === 0) {
      // Subscribe to all comment types
      unsubs.push(this.addSubscription({
        topic: 'comments',
        filters: '',
        onComment: onEvent,
      }));
    } else {
      for (const type of types) {
        unsubs.push(this.addSubscription({
          topic: 'comments',
          filters: '',
          onComment: (evt) => {
            if (evt.type === type) onEvent(evt);
          },
        }));
      }
    }

    return () => unsubs.forEach(fn => fn());
  }

  // ── Internal subscription management ───────────────────────────────────

  private addSubscription(params: Omit<Subscription, 'id'>): () => void {
    const id = `rtds_${++subIdCounter}`;
    const sub: Subscription = { ...params, id };
    this.subscriptions.set(id, sub);

    this.intentionalDisconnect = false;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connect();
    } else {
      // Send subscribe for this specific topic
      this.sendSubscribe([sub]);
    }

    return () => {
      this.subscriptions.delete(id);

      // Send unsubscribe if still connected
      this.sendUnsubscribe([sub]);

      if (this.subscriptions.size === 0) {
        this.disconnect();
      }
    };
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

        // Re-subscribe all active subscriptions
        const allSubs = [...this.subscriptions.values()];
        if (allSubs.length > 0) {
          this.sendSubscribe(allSubs);
        }
        this.startKeepalive();
      };

      this.ws.onmessage = (event) => {
        try {
          const raw = typeof event.data === 'string' ? event.data.trim() : '';

          // RTDS does not respond with PONG — skip empty messages and non-JSON
          if (!raw || raw === 'PONG') return;

          const data = JSON.parse(raw);
          this.dispatchMessage(data);
        } catch {
          // Ignore parse errors (empty keepalive frames, etc.)
        }
      };

      this.ws.onerror = () => {};

      this.ws.onclose = () => {
        this._connected = false;
        this.stopKeepalive();
        this.ws = null;

        if (!this.intentionalDisconnect && this.subscriptions.size > 0) {
          const delay = Math.min(
            RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts),
            RECONNECT_MAX_MS,
          );
          this.reconnectAttempts++;
          this.reconnectTimeout = setTimeout(() => this.connect(), delay);
        }
      };
    } catch {
      // Will retry via onclose
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

  // ── Subscription messages ──────────────────────────────────────────────

  /**
   * Per RTDS docs:
   * { action: "subscribe", subscriptions: [{ topic, type, filters?, gamma_auth? }] }
   */
  private sendSubscribe(subs: Subscription[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || subs.length === 0) return;

    // Dedupe by topic+filters to avoid duplicate subscriptions
    const seen = new Set<string>();
    const subscriptions: Array<{ topic: string; type: string; filters?: string }> = [];

    for (const sub of subs) {
      const key = `${sub.topic}|${sub.filters || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const entry: { topic: string; type: string; filters?: string } = {
        topic: sub.topic,
        type: sub.topic === 'comments' ? '*' : 'update',
      };
      if (sub.filters) entry.filters = sub.filters;
      subscriptions.push(entry);
    }

    this.ws.send(JSON.stringify({
      action: 'subscribe',
      subscriptions,
    }));
  }

  /**
   * Per RTDS docs:
   * { action: "unsubscribe", subscriptions: [{ topic, type, filters? }] }
   */
  private sendUnsubscribe(subs: Subscription[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || subs.length === 0) return;

    // Only unsubscribe if no other subscription uses the same topic+filters
    const activeKeys = new Set<string>();
    for (const [, s] of this.subscriptions) {
      activeKeys.add(`${s.topic}|${s.filters || ''}`);
    }

    const subscriptions: Array<{ topic: string; type: string; filters?: string }> = [];
    for (const sub of subs) {
      const key = `${sub.topic}|${sub.filters || ''}`;
      if (activeKeys.has(key)) continue; // Still has other subscribers
      const entry: { topic: string; type: string; filters?: string } = {
        topic: sub.topic,
        type: sub.topic === 'comments' ? '*' : 'update',
      };
      if (sub.filters) entry.filters = sub.filters;
      subscriptions.push(entry);
    }

    if (subscriptions.length > 0) {
      this.ws.send(JSON.stringify({
        action: 'unsubscribe',
        subscriptions,
      }));
    }
  }

  // ── Heartbeat ──────────────────────────────────────────────────────────

  /**
   * Per RTDS docs: send PING every 5 seconds to keep connection alive.
   * One-way keepalive — server does NOT reply with PONG.
   */
  private startKeepalive(): void {
    this.stopKeepalive();

    this.keepaliveTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send('PING');
      }
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
    const topic = msg.topic;
    const type = msg.type;
    const payload = msg.payload;
    const timestamp = msg.timestamp || Date.now();

    if (!topic || !payload) return;

    switch (topic) {
      case 'crypto_prices':
        this.dispatchCryptoPrice(payload, timestamp, 'binance');
        break;

      case 'crypto_prices_chainlink':
        this.dispatchCryptoPrice(payload, timestamp, 'chainlink');
        break;

      case 'equity_prices':
        if (type === 'subscribe') {
          // Historical snapshot (2 min of data)
          this.dispatchEquitySnapshot(payload);
        } else if (type === 'update') {
          this.dispatchEquityPrice(payload, timestamp);
        }
        break;

      case 'comments':
        this.dispatchComment(type, payload, timestamp);
        break;
    }
  }

  private dispatchCryptoPrice(payload: any, timestamp: number, source: 'binance' | 'chainlink'): void {
    const update: CryptoPriceUpdate = {
      symbol: payload.symbol || '',
      value: payload.value || 0,
      timestamp: payload.timestamp || timestamp,
      source,
    };

    const expectedTopic = source === 'binance' ? 'crypto_prices' : 'crypto_prices_chainlink';

    for (const [, sub] of this.subscriptions) {
      if (sub.topic !== expectedTopic || !sub.onCryptoPrice) continue;

      // Check filter match
      if (sub.filters) {
        if (source === 'binance') {
          // Comma-separated symbol filter
          const symbols = sub.filters.split(',').map(s => s.trim().toLowerCase());
          if (!symbols.includes(update.symbol.toLowerCase())) continue;
        } else {
          // JSON filter: {"symbol": "eth/usd"}
          try {
            const filter = JSON.parse(sub.filters);
            if (filter.symbol && filter.symbol.toLowerCase() !== update.symbol.toLowerCase()) continue;
          } catch { /* no filter = match all */ }
        }
      }

      sub.onCryptoPrice(update);
    }
  }

  private dispatchEquityPrice(payload: any, timestamp: number): void {
    const update: EquityPriceUpdate = {
      symbol: payload.symbol || '',
      value: payload.value || 0,
      fullAccuracyValue: payload.full_accuracy_value,
      timestamp: payload.timestamp || timestamp,
      receivedAt: payload.received_at || undefined,
      isCarriedForward: payload.is_carried_forward || false,
    };

    for (const [, sub] of this.subscriptions) {
      if (sub.topic !== 'equity_prices' || !sub.onEquityPrice) continue;

      if (sub.filters) {
        try {
          const filter = JSON.parse(sub.filters);
          if (filter.symbol && filter.symbol.toLowerCase() !== update.symbol.toLowerCase()) continue;
        } catch { /* no filter = match all */ }
      }

      sub.onEquityPrice(update);
    }
  }

  private dispatchEquitySnapshot(payload: any): void {
    const snapshot: EquityPriceSnapshot = {
      symbol: payload.symbol || '',
      data: payload.data || [],
    };

    for (const [, sub] of this.subscriptions) {
      if (sub.topic !== 'equity_prices' || !sub.onEquitySnapshot) continue;

      if (sub.filters) {
        try {
          const filter = JSON.parse(sub.filters);
          if (filter.symbol && filter.symbol.toLowerCase() !== snapshot.symbol.toLowerCase()) continue;
        } catch { /* no filter = match all */ }
      }

      sub.onEquitySnapshot(snapshot);
    }
  }

  private dispatchComment(type: string, payload: any, timestamp: number): void {
    const event: CommentEvent = {
      type: type as CommentEvent['type'],
      id: payload.id,
      body: payload.body,
      parentCommentID: payload.parentCommentID,
      parentEntityID: payload.parentEntityID,
      parentEntityType: payload.parentEntityType,
      profile: payload.profile,
      userAddress: payload.userAddress,
      reactionCount: payload.reactionCount,
      timestamp,
    };

    for (const [, sub] of this.subscriptions) {
      if (sub.topic !== 'comments' || !sub.onComment) continue;
      sub.onComment(event);
    }
  }
}

export default PolymarketRTDSService;
