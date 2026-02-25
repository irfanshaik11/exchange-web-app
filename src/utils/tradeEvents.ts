/**
 * Unified trade event system for cross-component/cross-page portfolio refresh.
 *
 * Broadcasts a CustomEvent on `window` so same-page listeners (portfolio.tsx,
 * Positions.tsx) can immediately refresh.  Also persists to localStorage so
 * navigations that happen *after* a trade (e.g. buy on Pulse → navigate to
 * Portfolio) can pick up the pending refresh on mount.
 *
 * Pattern follows the existing `monadTradeEvents.ts` with a 60 s TTL and
 * 10-item cap on the localStorage queue.
 */

export const TRADE_COMPLETED_EVENT = 'trade-completed';

export interface TradeCompletedDetail {
  tokenAddress: string;
  tradeType: 'buy' | 'sell';
  chain: 'sol' | 'monad';
  txHash?: string;
  amount?: number;
  sellPercentage?: number;
  timestamp: number;
}

// ── localStorage persistence (cross-navigation) ──────────────────────

const PENDING_KEY = 'pendingTradeRefreshes';
const MAX_PENDING = 10;
const TTL_MS = 60_000; // 60 seconds

function readPending(): TradeCompletedDetail[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as TradeCompletedDetail[];
  } catch {
    // corrupted – wipe
    window.localStorage.removeItem(PENDING_KEY);
  }
  return [];
}

function writePending(items: TradeCompletedDetail[]) {
  if (typeof window === 'undefined') return;
  try {
    if (items.length === 0) {
      window.localStorage.removeItem(PENDING_KEY);
      return;
    }
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(items));
  } catch {
    // storage full – best-effort
  }
}

/**
 * Consume (read + clear) any pending trade refreshes stored in localStorage.
 * Called on portfolio mount to catch trades that happened on other pages.
 * Filters out stale entries (> 60 s old).
 */
export function consumePendingTradeRefreshes(): TradeCompletedDetail[] {
  const items = readPending();
  if (items.length === 0) return [];
  writePending([]); // clear
  const now = Date.now();
  return items.filter((item) => now - item.timestamp < TTL_MS);
}

// ── Broadcast ─────────────────────────────────────────────────────────

/**
 * Broadcast a trade-completed event.
 *
 * 1. Dispatches a CustomEvent on `window` for same-page listeners.
 * 2. Persists to localStorage for cross-navigation pickup.
 */
export function broadcastTradeCompleted(detail: Omit<TradeCompletedDetail, 'timestamp'>) {
  if (typeof window === 'undefined') return;

  const full: TradeCompletedDetail = { ...detail, timestamp: Date.now() };

  // Persist to localStorage (cap at MAX_PENDING, drop oldest)
  try {
    const pending = readPending();
    pending.push(full);
    if (pending.length > MAX_PENDING) pending.splice(0, pending.length - MAX_PENDING);
    writePending(pending);
  } catch {
    // best-effort
  }

  // Dispatch window event
  try {
    window.dispatchEvent(
      new CustomEvent(TRADE_COMPLETED_EVENT, { detail: full })
    );
  } catch (err) {
    console.error('[tradeEvents] Failed to dispatch event:', err);
  }
}
