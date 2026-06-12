import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  createWalletTrackerWebSocket,
  type WalletTrackerWebSocket,
  type TradeEvent,
  type BalanceEvent,
  getTrackedWallets,
  getWalletTradeHistory,
  fetchBatchBalances,
  toggleWalletNotifications,
  getWalletsLastActive,
  WalletTrackerAuthError,
  type WatchWallet,
} from "~/utils/walletTracking";
import toast from "react-hot-toast";
import { useRouter } from "next/router";
import CheckCircle from "lucide-react/dist/esm/icons/circle-check-big";
import X from "lucide-react/dist/esm/icons/x";
import { useUser } from "./UserContext";
import {
  normalizeImageUrl,
  extractTokenImage,
  resolveTokenImage,
} from "~/utils/images";
import {
  getCachedScanImage,
  resolveScanImage,
} from "~/utils/scanImageResolver";
import {
  playNotificationSound,
  getSelectedNotificationSound,
} from "~/utils/notificationSounds";
import FastImage from "~/components/FastImage";
import { preloadTradeChart } from "~/utils/preloadTradeChart";
import { FiBell } from "react-icons/fi";

const isDev = process.env.NODE_ENV !== "production";

const LAST_ACTIVE_CACHE_KEY = "trackers:lastActiveMap";
const LAST_ACTIVE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const WALLET_BALANCES_CACHE_KEY = "trackers:walletBalances";
const WALLET_BALANCES_CACHE_TTL = 3 * 60 * 1000; // 3 minutes

function readLocalCache<T>(key: string, ttl: number): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > ttl) {
      localStorage.removeItem(key);
      return null;
    }
    return data as T;
  } catch {
    return null;
  }
}

function writeLocalCache(key: string, data: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

const BLOCKVISION_API_KEY = process.env.NEXT_PUBLIC_BLOCKVISION_API_KEY;

const ensureMs = (ts: unknown): number | null => {
  if (typeof ts !== "number" || !Number.isFinite(ts) || ts <= 0) return null;
  return ts < 1_000_000_000_000 ? ts * 1000 : ts;
};

const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs = 10_000,
) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
};

const HISTORY_LIMIT = 100;
// Use 7 days window to ensure backfilled transactions are included
const HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const LIVE_TRADES_CACHE_PREFIX = "walletTracker:liveTrades";
const LIVE_TRADES_CACHE_MAX_ITEMS = 100;
const LIVE_TRADES_CACHE_MAX_AGE_MS = HISTORY_WINDOW_MS;

const getCacheKey = (userId?: string) =>
  userId
    ? `${LIVE_TRADES_CACHE_PREFIX}:user:${userId}`
    : `${LIVE_TRADES_CACHE_PREFIX}:global`;

const NOTIFICATIONS_STORAGE_KEY = "walletTracker:notifications";

const ensureMilliseconds = (timestamp: number | null | undefined) => {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return Date.now();
  }
  return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
};

const normalizeTradeForState = (trade: TradeEvent): TradeEvent => ({
  ...trade,
  at: ensureMilliseconds(trade.at),
});

const pruneTrades = (trades: TradeEvent[]) => {
  const cutoff = Date.now() - LIVE_TRADES_CACHE_MAX_AGE_MS;
  const tradeByTx = new Map<string, TradeEvent>();

  for (const trade of trades) {
    const normalized = normalizeTradeForState(trade);
    if (normalized.at < cutoff) continue;
    const existing = tradeByTx.get(normalized.tx);
    if (!existing || normalized.at > existing.at) {
      tradeByTx.set(normalized.tx, normalized);
    }
  }

  return Array.from(tradeByTx.values())
    .sort((a, b) => b.at - a.at)
    .slice(0, LIVE_TRADES_CACHE_MAX_ITEMS);
};

// Slim projection persisted to localStorage — only the fields needed to restore
// the feed on reload, stripping any runtime-added bloat that inflates the cache.
const slimTradeForStorage = (t: TradeEvent): TradeEvent => ({
  type: "trade",
  wallet: t.wallet,
  mint: t.mint,
  pair_address: t.pair_address,
  symbol: t.symbol ?? null,
  name: t.name ?? null,
  side: t.side,
  amount: t.amount,
  sol_spent: t.sol_spent ?? null,
  price_usd: t.price_usd ?? null,
  market_cap_usd: t.market_cap_usd ?? null,
  venue: t.venue ?? null,
  tx: t.tx,
  at: t.at,
});

// Write the trades cache without ever throwing on QuotaExceededError. The
// in-memory feed is the source of truth; the cache is a reload convenience, so
// when storage is full (other caches — images/OHLCV/pulse — fill the ~5MB
// budget) we shrink our own payload and retry, then give up and free our key.
const persistTradesQuotaSafe = (key: string, slim: TradeEvent[]) => {
  if (typeof window === "undefined") return;
  let items = slim;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      window.localStorage.setItem(key, JSON.stringify(items));
      return;
    } catch (err) {
      const quota =
        err instanceof DOMException &&
        (err.name === "QuotaExceededError" ||
          err.name === "NS_ERROR_DOM_QUOTA_REACHED");
      if (!quota || items.length <= 10) {
        // Non-quota error, or already tiny and still failing → free our key
        // so we never hold space we can't write, and stop.
        try {
          window.localStorage.removeItem(key);
        } catch {
          /* ignore */
        }
        return;
      }
      // Halve and retry — keep the newest trades.
      items = items.slice(0, Math.floor(items.length / 2));
    }
  }
};

const mergeTrades = (existing: TradeEvent[], additions: TradeEvent[]) => {
  if (!Array.isArray(additions) || additions.length === 0) {
    return pruneTrades(existing);
  }
  if (!Array.isArray(existing) || existing.length === 0) {
    return pruneTrades(additions);
  }
  return pruneTrades([...additions, ...existing]);
};

interface WalletTrackerContextValue {
  wsConnected: boolean;
  latestTrades: TradeEvent[];
  watchedWallets: WatchWallet[];
  refreshWatchedWallets: () => Promise<void>;
  clearNotifications: () => void;
  isLoadingHistory: boolean;
  walletBalances: Record<string, number>;
  lastActiveMap: Record<string, number | null | undefined>;
  /** Non-null when the watchlist API rejected the bearer token. UI can use
   *  this to prompt the user to re-authenticate. Null otherwise. */
  watchlistAuthError: { status: number; message: string } | null;
}

const WalletTrackerContext = createContext<
  WalletTrackerContextValue | undefined
>(undefined);

export function useWalletTracker() {
  const context = useContext(WalletTrackerContext);
  if (!context) {
    throw new Error(
      "useWalletTracker must be used within WalletTrackerProvider",
    );
  }
  return context;
}

function NotificationToastWithMuteButton({
  toastId,
  customContent,
  onMute,
  borderColor,
}: {
  toastId: string;
  customContent: React.ReactNode;
  onMute: (toastId: string) => Promise<void>;
  /** When set, paints the outer toast border (used for buy/sell tint). */
  borderColor?: string;
}) {
  const [isMuting, setIsMuting] = useState(false);
  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuting(true);
    try {
      await onMute(toastId);
    } finally {
      setIsMuting(false);
    }
  };

  return (
    <div
      onClick={() => toast.remove(toastId)}
      className="flex max-w-[380px] min-w-[320px] cursor-pointer items-center gap-2 rounded-xl border bg-[#1a1b1f] px-4 py-2 shadow-lg"
      style={{ borderColor: borderColor ?? "rgba(255,255,255,0.06)" }}
    >
      {customContent}
      <button
        type="button"
        onClick={handleClick}
        disabled={isMuting}
        className="shrink-0 rounded-lg border border-transparent p-1.5 text-neutral-400 transition-colors hover:border-neutral-700 hover:bg-neutral-800/80 hover:text-neutral-200 disabled:pointer-events-none disabled:opacity-70"
        title="Mute notifications for this wallet"
      >
        {isMuting ? (
          <span
            className="block h-4 w-4 animate-spin rounded-full border-2 border-neutral-500 border-t-transparent"
            aria-hidden
          />
        ) : (
          <FiBell size={16} className="fill-pink-400 text-pink-400" />
        )}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toast.remove(toastId);
        }}
        className="shrink-0 rounded-lg border border-transparent p-1.5 text-neutral-400 transition-colors hover:border-neutral-700 hover:bg-neutral-800/80 hover:text-neutral-200"
        title="Close"
        aria-label="Close notification"
      >
        <X size={16} strokeWidth={2} />
      </button>
    </div>
  );
}

export function WalletTrackerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useUser();
  const router = useRouter();
  const [wsConnected, setWsConnected] = useState(false);

  // Load notifications from localStorage on mount
  const [latestTrades, setLatestTrades] = useState<TradeEvent[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Validate and prune old trades
        if (Array.isArray(parsed)) {
          return pruneTrades(parsed);
        }
      }
    } catch (error) {
      console.error("Failed to load notifications from localStorage:", error);
    }
    return [];
  });

  const [watchedWallets, setWatchedWallets] = useState<WatchWallet[]>([]);
  const [wsConnection, setWsConnection] =
    useState<WalletTrackerWebSocket | null>(null);
  const [tokenMetadata, setTokenMetadata] = useState<Map<string, any>>(
    new Map(),
  );
  const TOKEN_METADATA_MAX = 500;
  const SHOWN_TOAST_TXS_MAX = 500;
  /** Max trade-event toasts visible at once. Mirrors the GMGN / Axiom
   *  pattern: bounded FIFO queue — when a new toast pushes the count
   *  over the cap, the oldest is dismissed so the stack stays compact
   *  instead of covering the screen. */
  const MAX_VISIBLE_TRADE_TOASTS = 7;
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>(
    () =>
      readLocalCache<Record<string, number>>(
        WALLET_BALANCES_CACHE_KEY,
        WALLET_BALANCES_CACHE_TTL,
      ) ?? {},
  );
  const [lastActiveMap, setLastActiveMap] = useState<
    Record<string, number | null | undefined>
  >(
    () =>
      readLocalCache<Record<string, number | null | undefined>>(
        LAST_ACTIVE_CACHE_KEY,
        LAST_ACTIVE_CACHE_TTL,
      ) ?? {},
  );
  const [watchlistAuthError, setWatchlistAuthError] = useState<{
    status: number;
    message: string;
  } | null>(null);

  const watchedWalletsRef = useRef<WatchWallet[]>([]);
  const subscribedWalletsRef = useRef<string[]>([]);
  const hydrationRef = useRef(false);
  const initialHistoryFetchedRef = useRef(false);
  const shownToastTxsRef = useRef<Set<string>>(new Set());
  // Source-level idempotency: tx signatures whose trade event has already been
  // fully processed (table + toast), so duplicate WS deliveries are no-ops.
  const PROCESSED_TX_MAX = 4000;
  const processedTxRef = useRef<Set<string>>(new Set());
  const activeTradeToastIdsRef = useRef<string[]>([]);

  // Keep ref in sync with state
  useEffect(() => {
    watchedWalletsRef.current = watchedWallets;
  }, [watchedWallets]);

  // Load watched wallets
  const refreshWatchedWallets = useCallback(async () => {
    if (!user?.bearerToken) return;

    try {
      const wallets = await getTrackedWallets(user.bearerToken);
      setWatchedWallets(wallets);
      setWatchlistAuthError(null);
    } catch (error) {
      if (error instanceof WalletTrackerAuthError) {
        // Surface auth failure so the UI can prompt re-login. Without this
        // the watchlist silently renders empty and WS connects but never
        // subscribes — looks like "feature broken" to the user.
        setWatchlistAuthError({ status: error.status, message: error.message });
        setWatchedWallets([]);
        toast.error("Wallet tracker session expired — please sign in again.", {
          id: "wallet-tracker-auth-error",
        });
        console.warn(
          `[wallet-tracker] watchlist auth rejected (${error.status}): ${error.message}`,
        );
        return;
      }
      console.error("Failed to fetch watched wallets:", error);
    }
  }, [user?.bearerToken]);

  // Clear tracker state when user logs out
  useEffect(() => {
    if (!user?.id) {
      setWatchedWallets([]);
      setLatestTrades([]);
      setWatchlistAuthError(null);
      watchedWalletsRef.current = [];
      subscribedWalletsRef.current = [];
      initialHistoryFetchedRef.current = false;
      // Clear any in-flight trade toasts so logout doesn't leave a
      // half-stack visible on the login screen.
      for (const id of activeTradeToastIdsRef.current) toast.dismiss(id);
      activeTradeToastIdsRef.current = [];
      // Clear notifications from localStorage on logout
      if (typeof window !== "undefined") {
        try {
          localStorage.removeItem(NOTIFICATIONS_STORAGE_KEY);
        } catch (error) {
          console.error(
            "Failed to clear notifications from localStorage on logout:",
            error,
          );
        }
      }
      if (wsConnection) {
        wsConnection.close();
        setWsConnection(null);
        setWsConnected(false);
      }
    }
  }, [user?.id, wsConnection]);

  // Initial load of watched wallets
  useEffect(() => {
    if (user?.id) {
      refreshWatchedWallets();
    }
  }, [user?.id]);

  // Reset history fetch flag when user changes
  useEffect(() => {
    initialHistoryFetchedRef.current = false;
  }, [user?.id]);

  // Save notifications to localStorage whenever latestTrades changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      // Prune old trades before saving
      const pruned = pruneTrades(latestTrades);
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(pruned));
    } catch (error) {
      console.error("Failed to save notifications to localStorage:", error);
    }
  }, [latestTrades]);

  // Adaptive initial history fetch: 1h window first, expand to 24h if sparse
  useEffect(() => {
    if (!user?.id || watchedWallets.length === 0) return;
    if (initialHistoryFetchedRef.current) return;
    initialHistoryFetchedRef.current = true;

    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const addresses = watchedWallets.map((w) => w.address);

        // Step 1: Fetch last 1 hour
        let trades = await getWalletTradeHistory(addresses, {
          windowMs: 3_600_000,
          limit: HISTORY_LIMIT,
        });

        // Step 2: If < 5 trades, widen to 24 hours
        if (trades.length < 5) {
          const wider = await getWalletTradeHistory(addresses, {
            windowMs: 86_400_000,
            limit: HISTORY_LIMIT,
          });
          if (wider.length > trades.length) {
            trades = wider;
          }
        }

        if (trades.length > 0) {
          setLatestTrades((prev) => mergeTrades(prev, trades));
        }
      } catch (error) {
        console.error(
          "[WalletTracker] Failed to fetch initial history:",
          error,
        );
      } finally {
        setIsLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [user?.id, watchedWallets]);

  // WebSocket connection for real-time wallet updates
  useEffect(() => {
    if (!user?.id) {
      if (wsConnection) {
        wsConnection.close();
        setWsConnection(null);
        setWsConnected(false);
      }
      subscribedWalletsRef.current = [];
      return;
    }

    let connection: WalletTrackerWebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let reconnectAttempts = 0;
    const BASE_RECONNECT_DELAY = 3000; // 3s initial
    const MAX_RECONNECT_DELAY = 60000; // 60s cap

    const handleTradeEvent = async (event: TradeEvent) => {
      const normalizedEvent = normalizeTradeForState(event);

      // Idempotency guard at the SOURCE: the same trade can be delivered more
      // than once (a leaked/duplicate WS connection, server re-delivery). Skip
      // the WHOLE handler — table append AND toast — for a tx we've already
      // processed, so one trade never produces multiple rows or multiple toasts.
      // Guard before any async work so concurrent duplicate deliveries can't
      // race past the check. Empty-tx events (rare) fall through unguarded.
      if (normalizedEvent.tx) {
        if (processedTxRef.current.has(normalizedEvent.tx)) return;
        processedTxRef.current.add(normalizedEvent.tx);
        if (processedTxRef.current.size > PROCESSED_TX_MAX) {
          const keep = Array.from(processedTxRef.current).slice(
            -Math.floor(PROCESSED_TX_MAX / 2),
          );
          processedTxRef.current = new Set(keep);
        }
      }

      // Get token name/symbol FIRST and enrich the event before showing
      let tokenName = normalizedEvent.symbol || normalizedEvent.name;
      let tokenMetadataResolved = false;
      let resolvedImage: string | null = null;

      // Try to get from existing metadata cache
      if (!tokenName) {
        const cachedMetadata = tokenMetadata.get(normalizedEvent.mint);
        if (cachedMetadata?.symbol || cachedMetadata?.name) {
          tokenName = cachedMetadata.symbol || cachedMetadata.name;
          // Update the event with cached data
          normalizedEvent.symbol = cachedMetadata.symbol;
          normalizedEvent.name = cachedMetadata.name;
          tokenMetadataResolved = true;
        }
      }

      // If still no token name, fetch from backend
      if (!tokenName || !tokenMetadataResolved) {
        try {
          // Try to fetch from Go service first (most reliable for token names)
          const goServiceUrl = process.env.NEXT_PUBLIC_GO_SERVICE_URL;
          let tokenData = null;

          // Fetch token by mint address
          try {
            const searchResponse = await fetch(
              `${goServiceUrl}/v1/token/${normalizedEvent.mint}`,
              {
                signal: AbortSignal.timeout(3000),
              },
            );
            if (searchResponse.ok) {
              const responseData = await searchResponse.json();
              tokenData = responseData?.token || null;
              // Merge marketData fields onto tokenData (market_cap lives in marketData)
              if (tokenData && responseData?.marketData) {
                tokenData.market_cap_usd =
                  responseData.marketData.market_cap_usd ||
                  tokenData.market_cap_usd;
              }
            }
          } catch (searchError) {
            // Silent fail
          }

          // Update token name and enrich the event with fetched data
          if (tokenData) {
            tokenName = tokenData.symbol || tokenData.name || tokenName;

            // IMPORTANT: Update the event object itself with fetched metadata
            normalizedEvent.symbol = tokenData.symbol || normalizedEvent.symbol;
            normalizedEvent.name = tokenData.name || normalizedEvent.name;

            // Also resolve pair_address while we're at it
            if (!normalizedEvent.pair_address) {
              normalizedEvent.pair_address =
                tokenData.pair_address || tokenData.poolId;
            }

            // Resolve metadata URI → actual image URL BEFORE caching
            // Ensures toast at line ~548 has resolved image
            let resolvedImageUrl: string | null = null;
            try {
              resolvedImageUrl = await resolveTokenImage({
                image_url: tokenData.image_url || null,
                image: tokenData.image || null,
                logo: tokenData.logo || null,
                uri: tokenData.uri || null,
              });
            } catch {
              // Resolution failed
            }
            resolvedImage = resolvedImageUrl || extractTokenImage(tokenData);

            // Cache the metadata (store all image fields for extractTokenImage)
            setTokenMetadata((prev) => {
              const updated = new Map(prev);
              updated.set(normalizedEvent.mint, {
                symbol: tokenData.symbol,
                name: tokenData.name,
                image_url: resolvedImageUrl || tokenData.image_url || null,
                image: tokenData.image || null,
                logo: tokenData.logo || null,
                uri: tokenData.uri || null,
                launchpad_protocol:
                  tokenData.launchpad_protocol || tokenData.protocol,
                market_cap_usd:
                  tokenData.market_cap_usd ||
                  tokenData.marketCapUsd ||
                  tokenData.fully_diluted_value,
                createdAt:
                  tokenData.created_at ||
                  tokenData.createdAt ||
                  tokenData.CreatedAt ||
                  null,
              });
              // Cap size to prevent unbounded growth
              if (updated.size > TOKEN_METADATA_MAX) {
                const iter = updated.keys();
                while (updated.size > TOKEN_METADATA_MAX) {
                  updated.delete(iter.next().value!);
                }
              }
              return updated;
            });
          }

          // Fallback: try fetchTokenMetadata utility (only if Go service failed)
          if (
            !tokenName ||
            tokenName === normalizedEvent.mint.slice(0, 8) + "..."
          ) {
            try {
              const { fetchChainTokenMetadata } = await import(
                "~/utils/tokenMetadata"
              );
              const meta = await fetchChainTokenMetadata(normalizedEvent.mint);
              if (meta?.symbol || meta?.name) {
                tokenName = meta.symbol || meta.name;
                // Update the event object
                normalizedEvent.symbol = meta.symbol || normalizedEvent.symbol;
                normalizedEvent.name = meta.name || normalizedEvent.name;
                // Resolve metadata image before caching
                let resolvedFallbackUrl: string | null = null;
                try {
                  resolvedFallbackUrl = await resolveTokenImage(meta);
                } catch {
                  // Resolution failed
                }
                if (resolvedFallbackUrl) {
                  meta.imageUrl = resolvedFallbackUrl;
                }
                resolvedImage = resolvedFallbackUrl || extractTokenImage(meta);

                // Update metadata state (capped to prevent unbounded growth)
                setTokenMetadata((prev) => {
                  const updated = new Map(prev);
                  updated.set(normalizedEvent.mint, meta);
                  if (updated.size > TOKEN_METADATA_MAX) {
                    const iter = updated.keys();
                    while (updated.size > TOKEN_METADATA_MAX) {
                      updated.delete(iter.next().value!);
                    }
                  }
                  return updated;
                });
              }
            } catch (err) {
              // Silent fail
            }
          }
        } catch (error) {
          // Silent fail
        }
      }

      // Final fallback to shortened mint address
      if (!tokenName) {
        tokenName = normalizedEvent.mint.slice(0, 6) + "...";
      }

      // Resolve pair_address if not already present (for better navigation UX)
      if (!normalizedEvent.pair_address && normalizedEvent.mint) {
        try {
          // First try to search for the token to get its pair_address
          const searchResponse = await fetch(
            `${process.env.NEXT_PUBLIC_GO_SERVICE_URL}/v1/search?phrase=${encodeURIComponent(normalizedEvent.mint)}&limit=1`,
          );

          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            if (searchData.tokens && searchData.tokens.length > 0) {
              const token = searchData.tokens[0];
              normalizedEvent.pair_address = token.pair_address || token.poolId;
            }
          }

          // Fallback to hydrate-pair if search didn't work
          if (!normalizedEvent.pair_address) {
            const hydrateResponse = await fetch(
              "/api/token-service/hydrate-pair",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mint: normalizedEvent.mint }),
              },
            );

            if (hydrateResponse.ok) {
              const hydrateData = await hydrateResponse.json();
              normalizedEvent.pair_address =
                hydrateData.pair_address || hydrateData.poolId;
            }
          }
        } catch (error) {
          // Silent fail
        }
      }

      // Add to latest trades list (keep last hour, max 50)
      setLatestTrades((prev) => mergeTrades(prev, [normalizedEvent]));

      // A live trade means this wallet is active RIGHT NOW and its SOL balance
      // just changed — but Last Active and Balance were only fetched on add, so
      // they'd show stale values (e.g. "1 day" / old balance) despite the trade
      // we just saw. Update Last Active immediately and refresh the balance
      // (debounced per wallet so a burst of trades doesn't spam RPC).
      {
        const tradeAt =
          typeof normalizedEvent.at === "number" ? normalizedEvent.at : Date.now();
        setLastActiveMap((prev) => {
          const cur = prev[normalizedEvent.wallet];
          if (typeof cur === "number" && cur >= tradeAt) return prev;
          return { ...prev, [normalizedEvent.wallet]: tradeAt };
        });
        scheduleBalanceRefresh(normalizedEvent.wallet);
      }

      // Deduplicate toasts — skip if we already showed a toast for this tx
      if (shownToastTxsRef.current.has(normalizedEvent.tx)) return;
      shownToastTxsRef.current.add(normalizedEvent.tx);
      // Cap the set size to prevent unbounded growth
      if (shownToastTxsRef.current.size > SHOWN_TOAST_TXS_MAX) {
        const entries = Array.from(shownToastTxsRef.current);
        shownToastTxsRef.current = new Set(
          entries.slice(-Math.floor(SHOWN_TOAST_TXS_MAX / 2)),
        );
      }

      // Find wallet info for better notification
      const wallet = watchedWalletsRef.current.find(
        (w) => w.address === normalizedEvent.wallet,
      );
      const walletName =
        wallet?.walletName || normalizedEvent.wallet.slice(0, 8) + "...";
      const side = normalizedEvent.side === "buy" ? "bought" : "sold";

      // Per-wallet notifications: check if mute is enabled for this wallet
      const walletNotificationsEnabled = (() => {
        if (typeof window === "undefined") return true;
        try {
          const storageKey = `wallet_notifications_${normalizedEvent.wallet}`;
          const saved = localStorage.getItem(storageKey);
          if (saved !== null) {
            const parsed = JSON.parse(saved);
            return parsed === true;
          }
        } catch {
          // Invalid JSON or no storage, fall through to backend
        }
        return wallet?.notificationsEnabled ?? true;
      })();

      // Skip toast and sound for this trade if this wallet has notifications muted
      if (!walletNotificationsEnabled) return;

      // Format SOL amount
      let amountDisplay = "";
      if (
        normalizedEvent.sol_spent !== null &&
        normalizedEvent.sol_spent !== undefined
      ) {
        const solAmount = Math.abs(normalizedEvent.sol_spent);
        if (solAmount >= 1) {
          amountDisplay = `${solAmount.toFixed(2)} SOL`;
        } else if (solAmount >= 0.01) {
          amountDisplay = `${solAmount.toFixed(3)} SOL`;
        } else {
          amountDisplay = `${solAmount.toFixed(4)} SOL`;
        }
      }

      // Check if display notifications is enabled
      const displayNotificationsEnabled = (() => {
        if (typeof window === "undefined") return true;
        try {
          const saved = localStorage.getItem("notification-display-enabled");
          return saved !== "false"; // Default to true
        } catch {
          return true;
        }
      })();

      // Check if transaction sounds is enabled
      const transactionSoundsEnabled = (() => {
        if (typeof window === "undefined") return false;
        try {
          const saved = localStorage.getItem("transaction-sounds-enabled");
          return saved === "true"; // Default to false
        } catch {
          return false;
        }
      })();

      // Play the user's chosen notification sound if enabled.
      if (transactionSoundsEnabled && typeof window !== "undefined") {
        playNotificationSound(getSelectedNotificationSound());
      }

      // Show toast notification using enhanced toast only if enabled
      if (displayNotificationsEnabled) {
        // Toast avatar: use the SYNC cached image only — never await image
        // resolution here, or the toast lags behind the trade already showing in
        // the table. The parent WalletTrackerContent preloads every trade-feed
        // image, so getCachedScanImage is usually a hit; on a miss we fall back
        // to the metadata image and kick off a non-blocking resolve to warm the
        // cache for next time. FastImage letter-tiles gracefully in the gap.
        const cachedMeta0 = tokenMetadata.get(normalizedEvent.mint);
        const cascadeImage = getCachedScanImage(normalizedEvent.mint) ?? null;
        if (!cascadeImage) {
          void resolveScanImage(
            normalizedEvent.mint,
            resolvedImage ?? cachedMeta0?.image_url ?? cachedMeta0?.image ?? null,
            cachedMeta0?.uri ?? null,
          );
        }
        const tokenImage =
          cascadeImage ||
          resolvedImage ||
          (cachedMeta0 ? extractTokenImage(cachedMeta0) : null);

        const isBuy = normalizedEvent.side === "buy";
        const sideColor = isBuy ? "#70E0B0" : "#ff6b6b";
        const sideText = isBuy ? "BOUGHT" : "SOLD";
        const sideIcon = isBuy ? "↑" : "↓";

        // Navigate to trade page on toast click (with query params like PulseTable)
        const cachedMeta = tokenMetadata.get(normalizedEvent.mint);

        // Preload chart data so clicking the toast navigates instantly
        preloadTradeChart(
          {
            mint: normalizedEvent.mint,
            pairAddress: normalizedEvent.pair_address,
            chain: "sol",
            name: tokenName,
            symbol: normalizedEvent.symbol || cachedMeta?.symbol,
            marketCapUsd: cachedMeta?.market_cap_usd,
            image: tokenImage || undefined,
            launchpadProtocol: cachedMeta?.launchpad_protocol,
          },
          { router },
        );

        const tradeUrl = `/trade/${normalizedEvent.mint || normalizedEvent.pair_address}`;

        // Create clickable custom content for live trades toast (wide, compact)
        const customContent = (
          <div
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-0.5"
            onClick={() => {
              router.push(tradeUrl);
            }}
          >
            {/* Token Image */}
            <div
              style={{
                border: `2px solid ${sideColor}40`,
                borderRadius: "0.5rem",
              }}
            >
              <FastImage
                src={tokenImage}
                alt={tokenName || "token"}
                width={36}
                height={36}
                className="h-9 w-9 shrink-0 rounded-lg object-cover"
                symbol={normalizedEvent.symbol}
                name={tokenName}
                showBubble={false}
              />
            </div>

            {/* Content — single row where possible */}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-medium text-[#9CA3AF]">
                  {walletName}
                </span>
                <span
                  className="flex items-center gap-0.5 rounded px-1.5 py-px text-[10px] font-bold"
                  style={{
                    color: sideColor,
                    backgroundColor: `${sideColor}20`,
                    letterSpacing: "0.5px",
                  }}
                >
                  <span>{sideIcon}</span>
                  {sideText}
                </span>
              </div>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[14px] font-semibold text-[#E6E7EA]">
                  {tokenName}
                </span>
                {amountDisplay && (
                  <span className="text-[11px] text-[#9CA3AF]">
                    {amountDisplay}
                  </span>
                )}
              </div>
            </div>
          </div>
        );

        const performMuteToast = async (toastId: string) => {
          const storageKey = `wallet_notifications_${normalizedEvent.wallet}`;
          try {
            if (typeof window !== "undefined") {
              localStorage.setItem(storageKey, JSON.stringify(false));
            }
            await toggleWalletNotifications(
              normalizedEvent.wallet,
              false,
              wallet?.ownerId ?? undefined,
              wallet?.chain ?? "sol",
              user?.bearerToken,
            );
          } catch (_) {
            // Mute still applied via localStorage
          }
          refreshWatchedWallets();
          toast.dismiss(toastId);
          // Show styled "Notifications Updated" popup matching design
          const successColor = "#70E0B0";
          toast.custom(
            () => (
              <div
                className="flex max-w-[360px] min-w-[280px] items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg"
                style={{
                  backgroundColor: "#1a1b1f",
                  borderColor: successColor,
                }}
              >
                <CheckCircle
                  size={24}
                  className="shrink-0"
                  style={{ color: successColor }}
                  strokeWidth={2}
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span
                    className="text-base font-bold"
                    style={{ color: successColor }}
                  >
                    Notifications Updated
                  </span>
                  <span className="text-sm text-neutral-300">
                    Notifications disabled for {walletName}
                  </span>
                </div>
              </div>
            ),
            { duration: 4000 },
          );
        };

        const TRADE_TOAST_DURATION_MS = 5000;
        const newToastId = toast.custom(
          (t) => (
            <NotificationToastWithMuteButton
              toastId={t.id}
              customContent={customContent}
              onMute={performMuteToast}
              borderColor={sideColor}
            />
          ),
          { duration: TRADE_TOAST_DURATION_MS },
        );
        // Bounded FIFO queue: drop the oldest visible trade toasts when
        // the cap is exceeded so a busy feed never carpets the screen.
        activeTradeToastIdsRef.current.push(newToastId);
        while (activeTradeToastIdsRef.current.length > MAX_VISIBLE_TRADE_TOASTS) {
          const oldest = activeTradeToastIdsRef.current.shift();
          if (oldest) toast.dismiss(oldest);
        }
        // Remove the id from the active list once the toast self-expires
        // so future pushes only count toasts that are still on screen.
        // Must stay in sync with the `duration` above — both literals
        // share `TRADE_TOAST_DURATION_MS` to make drift impossible.
        setTimeout(() => {
          const idx = activeTradeToastIdsRef.current.indexOf(newToastId);
          if (idx !== -1) activeTradeToastIdsRef.current.splice(idx, 1);
        }, TRADE_TOAST_DURATION_MS);
      }
    };

    const handleConnect = () => {
      reconnectAttempts = 0; // Reset on successful connection
      setWsConnected(true);

      // Subscribe to all tracked wallets immediately. The factory's safeSend
      // queues messages internally if the socket is still CONNECTING, so we no
      // longer need the racy 100ms setTimeout.
      if (watchedWalletsRef.current.length > 0 && connection) {
        const addresses = watchedWalletsRef.current.map((w) => w.address);
        connection.subscribe(addresses);
        subscribedWalletsRef.current = addresses;
      }
    };

    const handleDisconnect = () => {
      setWsConnected(false);

      const delay = Math.min(
        BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
        MAX_RECONNECT_DELAY,
      );
      reconnectAttempts++;
      isDev &&
        console.log(
          `[WalletTracker] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`,
        );

      reconnectTimeout = setTimeout(() => {
        initializeWebSocket();
      }, delay);
    };

    const handleBalanceEvent = (event: BalanceEvent) => {
      // Update walletBalances from WS balance events — zero extra RPC calls
      if (event.wallet && event.at) {
        // The backend sends SOL balance via the balance snapshot;
        // for now, just mark that this wallet was refreshed (actual SOL balance
        // comes from the batch endpoint; token balances come here)
      }
    };

    const initializeWebSocket = () => {
      try {
        // Close any existing connection FIRST. Reconnect called this without
        // closing the old socket, so stale connections leaked and each kept
        // delivering trades — causing the same trade to fire multiple toasts.
        if (connection) {
          try {
            connection.close();
          } catch {
            /* ignore */
          }
          connection = null;
        }
        connection = createWalletTrackerWebSocket(
          handleTradeEvent,
          handleConnect,
          handleDisconnect,
          handleBalanceEvent,
        );
        setWsConnection(connection);
      } catch (error) {
        console.error("WebSocket failed to initialize:", error);
      }
    };

    // Initialize WebSocket connection
    initializeWebSocket();

    // Visibility / online revival: when the user comes back to the tab or the
    // network reconnects, force-reconnect if we haven't seen a server ping in
    // ~30s. Browsers throttle background tabs and silently kill long-idle
    // sockets — without this the tracker can sit "connected" but stale.
    const reviveIfStale = (trigger: string) => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      )
        return;
      if (!connection) return;
      const last = connection.getLastPingAt();
      const stale = last === 0 || Date.now() - last > 30_000;
      if (stale) {
        isDev &&
          console.log(
            `[WalletTracker] reviving (${trigger}, lastPingAt=${last})`,
          );
        reconnectAttempts = 0; // immediate retry, skip backoff
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
        connection.forceReconnect(`revive:${trigger}`);
      }
    };
    const onVisibility = () => reviveIfStale("visibility");
    const onOnline = () => reviveIfStale("online");
    const onFocus = () => reviveIfStale("focus");
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("online", onOnline);
      window.addEventListener("focus", onFocus);
    }

    // Cleanup on unmount or when user changes
    return () => {
      reconnectAttempts = 0;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onOnline);
        window.removeEventListener("focus", onFocus);
      }
      if (connection) {
        isDev && console.log("Closing WebSocket connection (cleanup)...");
        connection.close();
      }
      subscribedWalletsRef.current = [];
    };
  }, [user?.id]); // Only re-initialize when user changes, not when wallets change

  // Update subscriptions when wallet list changes (without recreating connection)
  useEffect(() => {
    if (!wsConnection || !wsConnected) {
      return;
    }

    const addresses = watchedWallets.map((w) => w.address);
    const previous = subscribedWalletsRef.current;

    const toUnsubscribe = previous.filter((addr) => !addresses.includes(addr));
    const toSubscribe = addresses.filter((addr) => !previous.includes(addr));

    if (toUnsubscribe.length > 0) {
      wsConnection.unsubscribe(toUnsubscribe);
    }

    if (toSubscribe.length > 0) {
      wsConnection.subscribe(toSubscribe);
    }

    subscribedWalletsRef.current = addresses;
  }, [watchedWallets, wsConnected, wsConnection]);

  // Batch fetch wallet balances — runs on mount AND when new wallets are added
  // Tracks which addresses have been fetched to avoid redundant RPC calls
  const fetchedAddressesRef = useRef<Set<string>>(new Set());
  const balanceInFlightRef = useRef<Set<string>>(new Set());
  const [balanceRetryTick, setBalanceRetryTick] = useState(0);

  // Debounced per-wallet balance refresh, triggered when a live trade for that
  // wallet arrives (the trade changed its SOL balance). Coalesces a burst of
  // trades into one refetch per wallet every ~8s.
  const balanceRefreshTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const scheduleBalanceRefresh = useCallback((address: string) => {
    const timers = balanceRefreshTimersRef.current;
    if (timers.has(address)) return; // already pending
    const wallet = watchedWalletsRef.current.find((w) => w.address === address);
    const chain = wallet?.chain === "monad" ? "monad" : "sol";
    const t = setTimeout(async () => {
      timers.delete(address);
      try {
        const res = await fetchBatchBalances([address], chain);
        if (res && typeof res[address] === "number") {
          setWalletBalances((prev) => ({ ...prev, [address]: res[address] }));
        }
      } catch {
        /* transient — next trade re-triggers */
      }
    }, 8000);
    timers.set(address, t);
  }, []);
  useEffect(() => {
    if (!user?.id || watchedWallets.length === 0) return;

    // Find wallets whose balance we haven't fetched yet (and aren't mid-fetch).
    const unfetched = watchedWallets.filter(
      (w) =>
        !fetchedAddressesRef.current.has(w.address) &&
        !balanceInFlightRef.current.has(w.address),
    );
    if (unfetched.length === 0) return;

    // Mark in-flight (not fetched) so a re-render doesn't double-fetch, but a
    // FAILED fetch can still retry. The bug this fixes: marking as fetched
    // up-front meant a transient batch failure (fetchBatchBalances returns {}
    // on any error) left a just-added wallet's Balance stuck on "—" forever.
    unfetched.forEach((w) => balanceInFlightRef.current.add(w.address));

    const doFetch = async () => {
      const solWallets = unfetched
        .filter((w) => w.chain !== "monad")
        .map((w) => w.address);
      const monadWallets = unfetched
        .filter((w) => w.chain === "monad")
        .map((w) => w.address);

      const results: Record<string, number> = {};
      try {
        if (solWallets.length > 0) {
          Object.assign(results, await fetchBatchBalances(solWallets, "sol"));
        }
        if (monadWallets.length > 0) {
          Object.assign(
            results,
            await fetchBatchBalances(monadWallets, "monad"),
          );
        }
      } finally {
        unfetched.forEach((w) => balanceInFlightRef.current.delete(w.address));
      }

      if (Object.keys(results).length > 0) {
        // Mark ONLY the addresses we actually got a balance for; the rest stay
        // unfetched so the next render/poll retries them.
        Object.keys(results).forEach((a) => fetchedAddressesRef.current.add(a));
        setWalletBalances((prev) => ({ ...prev, ...results }));
      }

      // Any wallet still missing a balance (transient failure / omitted by the
      // endpoint) → retry once shortly so a new wallet doesn't sit on "—".
      const stillMissing = unfetched.filter(
        (w) => !fetchedAddressesRef.current.has(w.address),
      );
      if (stillMissing.length > 0) {
        setTimeout(() => setBalanceRetryTick((t) => t + 1), 4000);
      }
    };

    doFetch();
  }, [user?.id, watchedWallets, balanceRetryTick]);

  // Reset fetched addresses and cached balances when user changes
  useEffect(() => {
    fetchedAddressesRef.current = new Set();
    setWalletBalances({});
    try {
      localStorage.removeItem(WALLET_BALANCES_CACHE_KEY);
    } catch {}
  }, [user?.id]);

  // Safety net: re-fetch batch every 3 minutes ONLY if WebSocket is disconnected
  useEffect(() => {
    if (wsConnected || !user?.id || watchedWallets.length === 0) return;

    const interval = setInterval(async () => {
      const solWallets = watchedWallets
        .filter((w) => w.chain !== "monad")
        .map((w) => w.address);
      if (solWallets.length > 0) {
        const solBalances = await fetchBatchBalances(solWallets, "sol");
        if (Object.keys(solBalances).length > 0) {
          setWalletBalances((prev) => ({ ...prev, ...solBalances }));
        }
      }
    }, 180_000); // 3 minutes

    return () => clearInterval(interval);
  }, [wsConnected, user?.id, watchedWallets]);

  // Hydrate cached trades from localStorage (user specific with global fallback)
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const userKey = user?.id ? getCacheKey(user.id) : null;
      const globalKey = getCacheKey();
      const raw =
        (userKey ? window.localStorage.getItem(userKey) : null) ??
        window.localStorage.getItem(globalKey);

      if (!raw) {
        hydrationRef.current = true;
        return;
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        hydrationRef.current = true;
        return;
      }

      const trades = parsed
        .map((trade): TradeEvent | null => {
          if (!trade || typeof trade !== "object") return null;
          try {
            return normalizeTradeForState(trade as TradeEvent);
          } catch {
            return null;
          }
        })
        .filter((trade): trade is TradeEvent => Boolean(trade));

      if (trades.length > 0) {
        setLatestTrades((prev) => mergeTrades(prev, trades));
      }
    } catch (error) {
      console.error("Failed to hydrate live trades cache:", error);
    } finally {
      hydrationRef.current = true;
    }
  }, [user?.id]);

  // Periodically prune old trades to keep list within rolling window
  useEffect(() => {
    const interval = setInterval(() => {
      setLatestTrades((prev) => pruneTrades(prev));
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  // Persist latest trades to localStorage
  useEffect(() => {
    if (typeof window === "undefined" || !hydrationRef.current) {
      return;
    }

    try {
      const pruned = pruneTrades(latestTrades);

      if (pruned.length === 0) {
        window.localStorage.removeItem(getCacheKey());
        if (user?.id) {
          window.localStorage.removeItem(getCacheKey(user.id));
        }
        return;
      }

      // Persist a SLIM projection (only fields needed to restore the feed) — the
      // full enriched TradeEvent can be large, and 100 of them blew the ~5MB
      // localStorage quota. Write once to the most-specific key (user when
      // logged in, else global) instead of duplicating the payload to both.
      const slim = pruned.map(slimTradeForStorage);
      const key = user?.id ? getCacheKey(user.id) : getCacheKey();
      // Keep the non-active key from going stale/duplicating quota.
      const otherKey = user?.id ? getCacheKey() : null;
      if (otherKey) window.localStorage.removeItem(otherKey);
      persistTradesQuotaSafe(key, slim);
    } catch (error) {
      // Never let a storage failure surface — the in-memory feed is the source
      // of truth; the cache is only a reload convenience.
      console.warn("Live trades cache persist skipped:", error);
    }
  }, [latestTrades, user?.id]);

  const clearNotifications = useCallback(() => {
    setLatestTrades([]);
    // Also clear from localStorage
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(NOTIFICATIONS_STORAGE_KEY);
      } catch (error) {
        console.error(
          "Failed to clear notifications from localStorage:",
          error,
        );
      }
    }
  }, []);

  // Fetch last-active timestamps for all tracked wallets as soon as they're known.
  // Runs in the global context so data is ready before the user navigates to /trackers.
  const lastActiveFetchedKeyRef = useRef<string>("");
  const hadWalletsForLastActiveRef = useRef(false);
  useEffect(() => {
    if (watchedWallets.length === 0) {
      if (hadWalletsForLastActiveRef.current) {
        setLastActiveMap({});
        lastActiveFetchedKeyRef.current = "";
        try {
          localStorage.removeItem(LAST_ACTIVE_CACHE_KEY);
        } catch {}
      }
      return;
    }
    hadWalletsForLastActiveRef.current = true;

    const key = watchedWallets
      .map((w) => w.address)
      .sort()
      .join(",");
    if (key === lastActiveFetchedKeyRef.current) return;
    lastActiveFetchedKeyRef.current = key;

    const currentWallets = [...watchedWallets];

    const fetchLastActive = async () => {
      try {
        const monadWallets = currentWallets
          .filter((w) => w.chain === "monad")
          .map((w) => w.address);
        const solWallets = currentWallets
          .filter((w) => w.chain !== "monad")
          .map((w) => w.address);

        isDev &&
          console.log("[lastActive] fetching timestamps:", {
            monad: monadWallets.length,
            sol: solWallets.length,
          });

        const map: Record<string, number | null> = {};

        if (monadWallets.length > 0) {
          if (!BLOCKVISION_API_KEY) {
            monadWallets.forEach((addr) => (map[addr] = null));
          } else {
            const monadSettled = await Promise.allSettled(
              monadWallets.map(async (address) => {
                const url = `https://api.blockvision.org/v2/monad/account/transactions?address=${encodeURIComponent(address)}&limit=20&ascendingOrder=false`;
                const resp = await fetchWithTimeout(
                  url,
                  {
                    method: "GET",
                    headers: {
                      accept: "application/json",
                      "x-api-key": BLOCKVISION_API_KEY!,
                    },
                  },
                  10_000,
                );
                let payload: any = null;
                try {
                  payload = await resp.json();
                } catch {}
                if (!resp.ok)
                  throw new Error(
                    payload?.message || payload?.error || `HTTP ${resp.status}`,
                  );
                return {
                  address,
                  lastActive: ensureMs(payload?.result?.data?.[0]?.timestamp),
                };
              }),
            );

            const allFailed = monadSettled.every(
              (r) => r.status === "rejected",
            );
            const likelyCors = monadSettled.every((r) => {
              if (r.status !== "rejected") return false;
              const msg = r.reason?.message || String(r.reason);
              return /failed to fetch/i.test(msg) || /networkerror/i.test(msg);
            });

            if (allFailed && likelyCors) {
              try {
                const proxyResp = await fetch(
                  "/api/blockvision/monad/last-active",
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ wallets: monadWallets, limit: 20 }),
                  },
                );
                const proxyPayload = await proxyResp.json().catch(() => null);
                if (
                  proxyResp.ok &&
                  proxyPayload?.ok === true &&
                  Array.isArray(proxyPayload?.data)
                ) {
                  for (const item of proxyPayload.data) {
                    if (!item?.wallet) continue;
                    map[item.wallet] =
                      typeof item.lastActive === "number"
                        ? item.lastActive
                        : null;
                  }
                }
              } catch {}
            } else {
              monadSettled.forEach((res, idx) => {
                const address = monadWallets[idx];
                map[address] =
                  res.status === "fulfilled" ? res.value.lastActive : null;
              });
            }
            monadWallets.forEach((addr) => {
              if (!(addr in map)) map[addr] = null;
            });
          }
        }

        if (solWallets.length > 0) {
          try {
            const solResults = await getWalletsLastActive(solWallets, "sol");
            for (const result of solResults) {
              map[result.wallet] = result.lastActive;
            }
            solWallets.forEach((addr) => {
              if (!(addr in map)) map[addr] = null;
            });
          } catch {
            solWallets.forEach((addr) => (map[addr] = null));
          }
        }

        setLastActiveMap((prev) => ({ ...prev, ...map }));
      } catch (error) {
        console.error("[lastActive] Failed to fetch timestamps:", error);
        const errorMap: Record<string, number | null> = {};
        currentWallets.forEach((w) => {
          errorMap[w.address] = null;
        });
        setLastActiveMap((prev) => ({ ...prev, ...errorMap }));
      }
    };

    fetchLastActive();
  }, [watchedWallets]);

  // Persist lastActiveMap to localStorage (survives new tabs/sessions, 5-min TTL)
  useEffect(() => {
    if (Object.keys(lastActiveMap).length === 0) return;
    writeLocalCache(LAST_ACTIVE_CACHE_KEY, lastActiveMap);
  }, [lastActiveMap]);

  // Persist walletBalances to localStorage (survives new tabs/sessions, 3-min TTL)
  useEffect(() => {
    if (Object.keys(walletBalances).length === 0) return;
    writeLocalCache(WALLET_BALANCES_CACHE_KEY, walletBalances);
  }, [walletBalances]);

  const value = useMemo<WalletTrackerContextValue>(
    () => ({
      wsConnected,
      latestTrades,
      watchedWallets,
      refreshWatchedWallets,
      clearNotifications,
      isLoadingHistory,
      walletBalances,
      lastActiveMap,
      watchlistAuthError,
    }),
    [
      wsConnected,
      latestTrades,
      watchedWallets,
      refreshWatchedWallets,
      clearNotifications,
      isLoadingHistory,
      walletBalances,
      lastActiveMap,
      watchlistAuthError,
    ],
  );

  return (
    <WalletTrackerContext.Provider value={value}>
      {children}
    </WalletTrackerContext.Provider>
  );
}
