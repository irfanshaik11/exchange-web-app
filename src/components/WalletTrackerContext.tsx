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
  type WatchWallet,
} from "~/utils/walletTracking";
import toast from "react-hot-toast";
import { useRouter } from "next/router";
import CheckCircle from "lucide-react/dist/esm/icons/circle-check-big";
import X from "lucide-react/dist/esm/icons/x";
import { useUser } from "./UserContext";
import { normalizeImageUrl, extractTokenImage, resolveTokenImage } from "~/utils/images";
import FastImage from "~/components/FastImage";
import { preloadTradeChart } from "~/utils/preloadTradeChart";
import { FiBell } from 'react-icons/fi';

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
}: {
  toastId: string;
  customContent: React.ReactNode;
  onMute: (toastId: string) => Promise<void>;
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
      className="cursor-pointer rounded-xl border border-white/[0.06] bg-[#1a1b1f] shadow-lg min-w-[320px] max-w-[380px] px-4 py-2 flex items-center gap-2"
    >
      {customContent}
      <button
        type="button"
        onClick={handleClick}
        disabled={isMuting}
        className="shrink-0 rounded-lg p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/80 transition-colors border border-transparent hover:border-neutral-700 disabled:opacity-70 disabled:pointer-events-none"
        title="Mute notifications for this wallet"
      >
        {isMuting ? (
          <span
            className="h-4 w-4 block animate-spin rounded-full border-2 border-neutral-500 border-t-transparent"
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
        className="shrink-0 rounded-lg p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/80 transition-colors border border-transparent hover:border-neutral-700"
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
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>({});

  const watchedWalletsRef = useRef<WatchWallet[]>([]);
  const subscribedWalletsRef = useRef<string[]>([]);
  const hydrationRef = useRef(false);
  const initialHistoryFetchedRef = useRef(false);
  const shownToastTxsRef = useRef<Set<string>>(new Set());

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
    } catch (error) {
      console.error("Failed to fetch watched wallets:", error);
    }
  }, [user?.bearerToken]);

  // Clear tracker state when user logs out
  useEffect(() => {
    if (!user?.id) {
      setWatchedWallets([]);
      setLatestTrades([]);
      watchedWalletsRef.current = [];
      subscribedWalletsRef.current = [];
      initialHistoryFetchedRef.current = false;
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
        console.error("[WalletTracker] Failed to fetch initial history:", error);
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
    const BASE_RECONNECT_DELAY = 3000;   // 3s initial
    const MAX_RECONNECT_DELAY = 60000;   // 60s cap

    const handleTradeEvent = async (event: TradeEvent) => {
      const normalizedEvent = normalizeTradeForState(event);

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
                tokenData.market_cap_usd = responseData.marketData.market_cap_usd || tokenData.market_cap_usd;
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
                  tokenData.created_at || tokenData.createdAt || tokenData.CreatedAt || null,
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

      // Deduplicate toasts — skip if we already showed a toast for this tx
      if (shownToastTxsRef.current.has(normalizedEvent.tx)) return;
      shownToastTxsRef.current.add(normalizedEvent.tx);
      // Cap the set size to prevent unbounded growth
      if (shownToastTxsRef.current.size > SHOWN_TOAST_TXS_MAX) {
        const entries = Array.from(shownToastTxsRef.current);
        shownToastTxsRef.current = new Set(entries.slice(-Math.floor(SHOWN_TOAST_TXS_MAX / 2)));
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
        if (typeof window === "undefined") return true;
        try {
          const saved = localStorage.getItem("transaction-sounds-enabled");
          return saved !== "false"; // Default to true
        } catch {
          return true;
        }
      })();

      // Play notification sound if enabled — 3-note ascending major chord (C5→E5→G5)
      if (transactionSoundsEnabled && typeof window !== "undefined") {
        try {
          const ac = new (window.AudioContext ||
            (window as any).webkitAudioContext)();
          const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
          const noteDuration = 0.12;

          notes.forEach((freq, i) => {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.type = "sine";
            osc.frequency.value = freq;
            osc.connect(gain);
            gain.connect(ac.destination);

            const startTime = ac.currentTime + i * noteDuration;
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.2, startTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + noteDuration);

            osc.start(startTime);
            osc.stop(startTime + noteDuration);
          });
        } catch (error) {
          // Silent fail if audio context fails (e.g., user hasn't interacted with page)
        }
      }

      // Show toast notification using enhanced toast only if enabled
      if (displayNotificationsEnabled) {
        // Get token image from metadata using extractTokenImage (handles all field names + normalization)
        const tokenImage = resolvedImage || (() => {
          const cachedMetadata = tokenMetadata.get(normalizedEvent.mint);
          if (!cachedMetadata) return null;
          return extractTokenImage(cachedMetadata);
        })();

        const isBuy = normalizedEvent.side === "buy";
        const sideColor = isBuy ? "#70E0B0" : "#ff6b6b";
        const sideText = isBuy ? "BOUGHT" : "SOLD";
        const sideIcon = isBuy ? "↑" : "↓";

        // Navigate to trade page on toast click (with query params like PulseTable)
        const cachedMeta = tokenMetadata.get(normalizedEvent.mint);

        // Preload chart data so clicking the toast navigates instantly
        preloadTradeChart({
          mint: normalizedEvent.mint,
          pairAddress: normalizedEvent.pair_address,
          chain: 'sol',
          name: tokenName,
          symbol: normalizedEvent.symbol || cachedMeta?.symbol,
          marketCapUsd: cachedMeta?.market_cap_usd,
          image: tokenImage || undefined,
          launchpadProtocol: cachedMeta?.launchpad_protocol,
        }, { router });

        const queryParams = new URLSearchParams({
          _name: tokenName || "",
          _symbol: normalizedEvent.symbol || cachedMeta?.symbol || "",
          _mcap: String(cachedMeta?.market_cap_usd || ""),
          _image: tokenImage || "",
          _mint: normalizedEvent.mint,
          _launchpad_protocol: cachedMeta?.launchpad_protocol || "",
          _created_at: cachedMeta?.createdAt || "",
          chain: "sol",
        }).toString();
        const tradeUrl = `/trade/${normalizedEvent.mint || normalizedEvent.pair_address}?${queryParams}`;

        // Create clickable custom content for live trades toast (wide, compact)
        const customContent = (
          <div
            className="flex cursor-pointer items-center gap-3 py-0.5 flex-1 min-w-0"
            style={{ borderLeft: `3px solid ${sideColor}`, paddingLeft: "10px" }}
            onClick={() => { router.push(tradeUrl); }}
          >
            {/* Token Image */}
            <div style={{ border: `2px solid ${sideColor}40`, borderRadius: "0.5rem" }}>
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
            <div className="min-w-0 flex-1 flex flex-col gap-0.5">
              <div className="flex items-center gap-2 flex-wrap">
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
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[14px] font-semibold text-[#E6E7EA]">
                  {tokenName}
                </span>
                {amountDisplay && (
                  <span className="text-[11px] text-[#9CA3AF]">{amountDisplay}</span>
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
                className="rounded-2xl border shadow-lg flex items-start gap-3 px-4 py-3 min-w-[280px] max-w-[360px]"
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
                <div className="flex flex-col gap-0.5 min-w-0">
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
            { duration: 4000 }
          );
        };

        toast.custom(
          (t) => (
            <NotificationToastWithMuteButton
              toastId={t.id}
              customContent={customContent}
              onMute={performMuteToast}
            />
          ),
          { duration: 5000 }
        );
      }
    };

    const handleConnect = () => {
      reconnectAttempts = 0; // Reset on successful connection
      setWsConnected(true);

      // Subscribe to all tracked wallets after connection is established
      if (watchedWalletsRef.current.length > 0 && connection) {
        setTimeout(() => {
          if (connection?.ws.readyState === WebSocket.OPEN) {
            const addresses = watchedWalletsRef.current.map((w) => w.address);
            connection.subscribe(addresses);
            subscribedWalletsRef.current = addresses;
          }
        }, 100);
      }
    };

    const handleDisconnect = () => {
      setWsConnected(false);

      const delay = Math.min(
        BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
        MAX_RECONNECT_DELAY
      );
      reconnectAttempts++;
      console.log(`[WalletTracker] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);

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

    // Cleanup on unmount or when user changes
    return () => {
      reconnectAttempts = 0;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (connection) {
        console.log("Closing WebSocket connection (cleanup)...");
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
  useEffect(() => {
    if (!user?.id || watchedWallets.length === 0) return;

    // Find wallets whose balance we haven't fetched yet
    const unfetched = watchedWallets.filter(
      (w) => !fetchedAddressesRef.current.has(w.address),
    );
    if (unfetched.length === 0) return;

    // Mark as fetched immediately to prevent duplicate calls on re-render
    unfetched.forEach((w) => fetchedAddressesRef.current.add(w.address));

    const doFetch = async () => {
      const solWallets = unfetched
        .filter((w) => w.chain !== "monad")
        .map((w) => w.address);
      const monadWallets = unfetched
        .filter((w) => w.chain === "monad")
        .map((w) => w.address);

      const results: Record<string, number> = {};

      if (solWallets.length > 0) {
        const solBalances = await fetchBatchBalances(solWallets, "sol");
        Object.assign(results, solBalances);
      }
      if (monadWallets.length > 0) {
        const monadBalances = await fetchBatchBalances(monadWallets, "monad");
        Object.assign(results, monadBalances);
      }

      if (Object.keys(results).length > 0) {
        setWalletBalances((prev) => ({ ...prev, ...results }));
      }
    };

    doFetch();
  }, [user?.id, watchedWallets]);

  // Reset fetched addresses when user changes
  useEffect(() => {
    fetchedAddressesRef.current = new Set();
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

      const payload = JSON.stringify(pruned);

      window.localStorage.setItem(getCacheKey(), payload);
      if (user?.id) {
        window.localStorage.setItem(getCacheKey(user.id), payload);
      }
    } catch (error) {
      console.error("Failed to persist live trades cache:", error);
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

  const value = useMemo<WalletTrackerContextValue>(() => ({
    wsConnected,
    latestTrades,
    watchedWallets,
    refreshWatchedWallets,
    clearNotifications,
    isLoadingHistory,
    walletBalances,
  }), [wsConnected, latestTrades, watchedWallets, refreshWatchedWallets, clearNotifications, isLoadingHistory, walletBalances]);

  return (
    <WalletTrackerContext.Provider value={value}>
      {children}
    </WalletTrackerContext.Provider>
  );
}
