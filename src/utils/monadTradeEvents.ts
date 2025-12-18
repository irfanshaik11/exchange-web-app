export type MonadQuickTradeType = 'buy' | 'sell';

const PENDING_REFRESH_KEY = 'monadPendingPositionRefresh';

const readPendingMap = (): Record<string, number> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PENDING_REFRESH_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, number>;
    }
  } catch (error) {
    console.error('[monadQuickTrade] Failed to parse pending refresh map:', error);
  }
  return {};
};

const writePendingMap = (map: Record<string, number>) => {
  if (typeof window === 'undefined') return;
  try {
    const keys = Object.keys(map);
    if (keys.length === 0) {
      window.localStorage.removeItem(PENDING_REFRESH_KEY);
      return;
    }
    window.localStorage.setItem(PENDING_REFRESH_KEY, JSON.stringify(map));
  } catch (error) {
    console.error('[monadQuickTrade] Failed to persist pending refresh map:', error);
  }
};

export const markPendingMonadPositionRefresh = (tokenAddress?: string | null) => {
  if (typeof window === 'undefined' || !tokenAddress) return;
  const normalized = tokenAddress.toLowerCase();
  const map = readPendingMap();
  map[normalized] = Date.now();
  writePendingMap(map);
};

export const consumePendingMonadPositionRefresh = (tokenAddress?: string | null): number | null => {
  if (typeof window === 'undefined' || !tokenAddress) return null;
  const normalized = tokenAddress.toLowerCase();
  const map = readPendingMap();
  const timestamp = map[normalized];
  if (timestamp) {
    delete map[normalized];
    writePendingMap(map);
    return timestamp;
  }
  return null;
};

export const broadcastMonadQuickTrade = (
  tokenAddress?: string | null,
  tradeType: MonadQuickTradeType = 'buy'
) => {
  if (typeof window === 'undefined' || !tokenAddress) return;
  const normalized = tokenAddress.toLowerCase();

  markPendingMonadPositionRefresh(normalized);

  try {
    window.dispatchEvent(
      new CustomEvent('monadQuickTrade', {
        detail: {
          tokenAddress: normalized,
          tradeType,
          timestamp: Date.now(),
        },
      })
    );
  } catch (error) {
    console.error('[monadQuickTrade] Failed to dispatch event:', error);
  }
};
