// src/services/polymarketSportsService.ts
// Polymarket Sports Channel WebSocket — singleton service for live sports data.
//
// Protocol (verified against live server 2026-03-24):
//   Endpoint: wss://sports-api.polymarket.com/ws
//   No subscription message required — all active events stream on connect.
//
//   Heartbeat: Per docs, server sends "ping" every 5s → client must reply "pong".
//   In practice, the server may use WebSocket protocol-level ping frames instead of
//   message-level strings. We handle BOTH to be safe.
//
//   Message format (actual, not what docs imply):
//   {
//     "gameId": 20023512,
//     "leagueAbbreviation": "nba",
//     "homeTeam": "CHA",
//     "awayTeam": "SAC",
//     "status": "InProgress",
//     "updatedAt": "2026-03-24T23:58:11Z",
//     "eventState": { "type": "basketball", ... scores inside }
//   }

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SportResult {
  /** Game identifier from Polymarket */
  gameId: number;
  /** League abbreviation (e.g. "nba", "nhl", "mlb", "cwbb") */
  league: string;
  /** Sport type from eventState (e.g. "basketball", "hockey", "baseball") */
  sportType?: string;
  /** Home team abbreviation */
  homeTeam: string;
  /** Away team abbreviation */
  awayTeam: string;
  /** Game status (e.g. "InProgress", "Final", "Scheduled") */
  status: string;
  /** ISO timestamp of last update */
  updatedAt: string;
  /** Full event state (scores, periods, etc — varies by sport) */
  eventState: any;
  /** Raw message for access to any extra fields */
  raw: any;
}

type SportResultCallback = (result: SportResult) => void;

interface Subscription {
  id: number;
  callback: SportResultCallback;
  /** Optional filter by league abbreviation (e.g. "nba", "nhl") */
  leagueFilter?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const WS_URL = 'wss://sports-api.polymarket.com/ws';
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
// If no data received at all within this window, consider connection dead.
// Sports data streams continuously during active games (every few seconds).
const ACTIVITY_TIMEOUT_MS = 30_000;

let subIdCounter = 0;

// ── Singleton Service ──────────────────────────────────────────────────────────

class PolymarketSportsService {
  private static instance: PolymarketSportsService;

  private ws: WebSocket | null = null;
  private subscriptions = new Map<number, Subscription>();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private activityTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private _connected = false;
  private intentionalDisconnect = false;
  private lastActivityAt = 0;

  private constructor() {}

  static getInstance(): PolymarketSportsService {
    if (!PolymarketSportsService.instance) {
      PolymarketSportsService.instance = new PolymarketSportsService();
    }
    return PolymarketSportsService.instance;
  }

  get isConnected(): boolean {
    return this._connected;
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Subscribe to live sport results.
   * @param callback - Called for each game update
   * @param leagueFilter - Optional: only receive events for this league (e.g. "nba", "nhl")
   * @returns Unsubscribe function
   */
  subscribe(
    callback: SportResultCallback,
    leagueFilter?: string,
  ): () => void {
    const id = ++subIdCounter;
    const sub: Subscription = { id, callback, leagueFilter };
    this.subscriptions.set(id, sub);

    this.intentionalDisconnect = false;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connect();
    }

    return () => {
      this.subscriptions.delete(id);
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
        this.lastActivityAt = Date.now();
        this.startActivityWatchdog();
        // No subscription message needed — Sports channel broadcasts all events
      };

      this.ws.onmessage = (event) => {
        this.lastActivityAt = Date.now();

        try {
          const raw = typeof event.data === 'string' ? event.data.trim() : '';

          // Handle server-initiated ping (message-level) per docs
          if (raw === 'ping') {
            this.ws?.send('pong');
            return;
          }

          if (!raw) return;

          const data = JSON.parse(raw);
          this.dispatchMessage(data);
        } catch {
          // Ignore parse errors
        }
      };

      this.ws.onerror = () => {};

      this.ws.onclose = () => {
        this._connected = false;
        this.stopActivityWatchdog();
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
    this.stopActivityWatchdog();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
    this.reconnectAttempts = 0;
  }

  // ── Activity watchdog ──────────────────────────────────────────────────

  /**
   * During active games, the server sends updates every few seconds.
   * If no messages at all within ACTIVITY_TIMEOUT_MS, force reconnect.
   * Note: when no games are active, the server may go silent, which is normal.
   */
  private startActivityWatchdog(): void {
    this.stopActivityWatchdog();
    this.lastActivityAt = Date.now();

    this.activityTimer = setInterval(() => {
      if (Date.now() - this.lastActivityAt > ACTIVITY_TIMEOUT_MS) {
        // Only reconnect if we had activity before — a silent period after
        // connect just means no games are active
        if (this.lastActivityAt > 0) {
          this.ws?.close();
        }
      }
    }, ACTIVITY_TIMEOUT_MS / 2);
  }

  private stopActivityWatchdog(): void {
    if (this.activityTimer) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }
  }

  // ── Message dispatch ───────────────────────────────────────────────────

  /**
   * Actual Sports channel messages are raw game objects:
   * { gameId, leagueAbbreviation, homeTeam, awayTeam, status, updatedAt, eventState }
   *
   * eventState.type indicates the sport: "basketball", "hockey", "baseball", etc.
   * Scores/periods are nested inside eventState (varies by sport).
   */
  private dispatchMessage(msg: any): void {
    // Validate it's a game update (has gameId or leagueAbbreviation)
    if (!msg.gameId && !msg.leagueAbbreviation) return;

    const result: SportResult = {
      gameId: msg.gameId || 0,
      league: (msg.leagueAbbreviation || '').toLowerCase(),
      sportType: msg.eventState?.type || undefined,
      homeTeam: msg.homeTeam || '',
      awayTeam: msg.awayTeam || '',
      status: msg.status || '',
      updatedAt: msg.updatedAt || '',
      eventState: msg.eventState || null,
      raw: msg,
    };

    for (const [, sub] of this.subscriptions) {
      // Apply league filter if set
      if (sub.leagueFilter && result.league !== sub.leagueFilter.toLowerCase()) {
        continue;
      }
      sub.callback(result);
    }
  }
}

export default PolymarketSportsService;
