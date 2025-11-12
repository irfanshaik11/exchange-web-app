import * as React from 'react';
import type { TradeEvent } from '~/utils/walletTracking';

const STORAGE_KEY = 'wallet_tracker_live_trades';
const MAX_ITEMS = 200;
const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

const getTimestampMs = (trade: TradeEvent) => {
  const value = trade?.at ?? Math.floor(Date.now() / 1000);
  return value > 1_000_000_000_000 ? value : value * 1000;
};

const normalizeTrade = (trade: TradeEvent): TradeEvent => ({
  ...trade,
  at: trade.at ?? Math.floor(Date.now() / 1000),
});

const pruneTrades = (trades: TradeEvent[]) => {
  const cutoff = Date.now() - MAX_AGE_MS;
  const seen = new Set<string>();

  const filtered = trades
    .filter((trade) => getTimestampMs(trade) >= cutoff)
    .sort((a, b) => getTimestampMs(b) - getTimestampMs(a));

  const unique: TradeEvent[] = [];
  for (const trade of filtered) {
    const key = `${trade.wallet}-${trade.tx}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(trade);
      if (unique.length >= MAX_ITEMS) break;
    }
  }
  return unique;
};

const loadInitialTrades = (): TradeEvent[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return pruneTrades(parsed);
    }
    if (parsed && Array.isArray(parsed.trades)) {
      return pruneTrades(parsed.trades);
    }
  } catch (error) {
    console.warn('[useLiveTrades] Failed to load cached trades', error);
  }
  return [];
};

const persistTrades = (trades: TradeEvent[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
  } catch (error) {
    console.warn('[useLiveTrades] Failed to persist trades', error);
  }
};

const useLiveTrades = () => {
  const [trades, setTrades] = React.useState<TradeEvent[]>(() => loadInitialTrades());

  const updateTrades = React.useCallback(
    (
      updater:
        | TradeEvent[]
        | ((previous: TradeEvent[]) => TradeEvent[])
    ) => {
      setTrades((prev) => {
        const next =
          typeof updater === 'function'
            ? (updater as (previous: TradeEvent[]) => TradeEvent[])(prev)
            : updater;
        const pruned = pruneTrades(next);
        persistTrades(pruned);
        return pruned;
      });
    },
    []
  );

  const appendTrades = React.useCallback(
    (incoming: TradeEvent | TradeEvent[]) => {
      const items = Array.isArray(incoming) ? incoming : [incoming];
      updateTrades((prev) => [
        ...items.map(normalizeTrade),
        ...prev,
      ]);
    },
    [updateTrades]
  );

  const pruneNow = React.useCallback(() => {
    updateTrades((prev) => prev);
  }, [updateTrades]);

  React.useEffect(() => {
    const interval = setInterval(pruneNow, 60_000);
    return () => clearInterval(interval);
  }, [pruneNow]);

  return {
    trades,
    setTrades: updateTrades,
    appendTrades,
    pruneNow,
  };
};

export { normalizeTrade, pruneTrades };
export default useLiveTrades;

