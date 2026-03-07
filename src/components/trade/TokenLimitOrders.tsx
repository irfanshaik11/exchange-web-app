import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import toast from "react-hot-toast";
import FastImage from "../FastImage";
import { useUser } from "../UserContext";
import { getMyLimitOrders, updateLimitOrder } from "~/utils/api";
import { FaRunning, FaGasPump, FaCoins, FaBan } from "react-icons/fa";
import { showEnhancedToast } from "~/utils/enhancedToast";
import { showOrderToast } from "~/utils/tradeToast";
import { dispatchBalanceRefresh } from "~/utils/balanceEvents";
import { formatMarketCap } from "~/utils/formatPrice";
import { extractTokenImage, normalizeImageUrl } from "~/utils/images";
import { preloadTradeChart } from "~/utils/preloadTradeChart";

type LimitOrderStatus = "Active" | "Cancelled" | "Completed" | "Failed";

interface LimitOrder {
  id: string;
  tokenAddress: string;
  pairAddress?: string | null;
  type: "Buy" | "Sell";
  direction: "Above" | "Below";
  targetMC: number | string;
  solAmount: number | string;
  tokenAmount: number | string;
  status: LimitOrderStatus;
  createdAt?: string;
  slippage?: number | string;
  priorityFee?: number | string;
  bribe?: number | string;
  mevMode?: string | null;
  autoFee?: boolean;
  transactionHash?: string | null;
  poolType?: string | null;
  failureReason?: string | null;
  failureCode?: string | null;
  triggerType?: "marketCap" | "bonding" | "devSell";
  bondingTarget?: number | string | null;
  initialBondingPct?: number | string | null;
  devWallet?: string | null;
}

type TokenMetaInfo = {
  name?: string;
  symbol?: string;
  image?: string;
  protocol?: string;
  marketCap?: number;
  pairAddress?: string;
  createdAt?: string;
};

const REFRESH_INTERVAL_MS = 8000;
const META_STALE_MS = 30_000;
const DEFAULT_PROTOCOL_COLOR = "#22c55e";
const DEFAULT_PROTOCOL_ICON =
  "https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png";
const BADGE_PROTOCOLS = ["meteora", "bonk", "bags", "moonit", "moonshot", "moonshoot"];

function formatAmount(value: number, maximumFractionDigits = 4) {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
}

function getProtocolColor(protocol: string) {
  if (!protocol) return DEFAULT_PROTOCOL_COLOR;
  if (protocol.includes("meteora")) return "#ff4662";
  if (protocol.includes("raydium")) return "#5c51f7";
  if (
    protocol.includes("moonit") ||
    protocol.includes("moonshot") ||
    protocol.includes("moonshoot")
  )
    return "#eab308";
  if (protocol.includes("boop")) return "#134577";
  if (protocol.includes("bonk")) return "#ff6b35";
  if (protocol.includes("bags")) return DEFAULT_PROTOCOL_COLOR;
  if (protocol.includes("orca")) return "#0ea5e9";
  if (protocol.includes("jupiter")) return "#8b5cf6";
  if (protocol.includes("launch")) return "#3b82f6";
  if (protocol.includes("pumpswap") || protocol === "pump_amm" || protocol === "pumpamm") return "#eab308";
  if (protocol.includes("pump")) return DEFAULT_PROTOCOL_COLOR;
  return DEFAULT_PROTOCOL_COLOR;
}

function getProtocolIcon(protocol: string) {
  if (!protocol) return DEFAULT_PROTOCOL_ICON;
  if (protocol.includes("meteora"))
    return "https://s1.coincarp.com/logo/1/meteora.png?style=72&v=1759911013";
  if (protocol.includes("raydium"))
    return "https://s2.coinmarketcap.com/static/img/coins/64x64/8526.png";
  if (protocol.includes("boop"))
    return "https://api.phantom.app/image-proxy/?image=https%3A%2F%2Fdhc7eusqrdwa0.cloudfront.net%2Fassets%2FBOOP_logo_icon_dark_bg.png&anim=true";
  if (protocol.includes("moonit") || protocol.includes("moonshot") || protocol.includes("moonshoot"))
    return "https://avatars.githubusercontent.com/u/174132191?s=280&v=4";
  if (protocol.includes("bonk"))
    return "https://s3.coinmarketcap.com/static-gravity/image/a28128d9ff7c49c9ad33ee2f626fda40.png";
  if (protocol.includes("bags"))
    return "https://play-lh.googleusercontent.com/7AxVcu1pumxavcGTb16WBJQU88CDZd0v8q0WzFwfin7zbBvItYMuNQ0Xkqq4srTw4A=w240-h480-rw";
  if (protocol.includes("pump")) return DEFAULT_PROTOCOL_ICON;
  return DEFAULT_PROTOCOL_ICON;
}

function shouldFillProtocolBadge(protocol: string) {
  return BADGE_PROTOCOLS.some((needle) => protocol.includes(needle));
}

function getOrderTypeLabel(order: LimitOrder): string {
  if (order.triggerType === "bonding") {
    return `${order.type} on Migration`;
  }
  if (order.triggerType === "devSell") {
    return order.type === "Buy" ? "Buy on Dev Sell" : "Sell on Dev Sell";
  }
  if (order.type === "Buy") {
    return order.direction === "Below" ? "Buy Below" : "Buy Above";
  }
  return order.direction === "Above" ? "Sell Above" : "Sell Below";
}

function getOrderTargetLabel(order: LimitOrder): string {
  if (order.triggerType === "bonding") {
    return "—";
  }
  if (order.triggerType === "devSell") {
    const wallet = order.devWallet || "";
    if (!wallet) return "Dev Sell";
    return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
  }
  return formatMarketCap(Number(order.targetMC));
}

function isValidNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric);
}

function pickFirst<T>(...values: T[]): T | undefined {
  return values.find((value) => value !== undefined && value !== null);
}

function extractTokenMeta(raw: any): TokenMetaInfo {
  const primarySource =
    raw?.token ||
    raw?.tokenInfo ||
    raw?.tokenData ||
    raw?.metadata ||
    raw?.marketData?.token ||
    (Array.isArray(raw?.tokens) ? raw.tokens[0] : {}) ||
    {};

  const protocolCandidate =
    pickFirst(
      primarySource?.launchpad_protocol,
      primarySource?.protocol,
      raw?.launchpad_protocol,
      raw?.protocol
    ) ?? "";

  const marketCapCandidates = [
    raw?.marketData?.market_cap_usd,
    raw?.marketData?.marketCapUSD,
    raw?.marketData?.MarketCapUSD,
    raw?.market_cap_usd,
    raw?.marketCapUSD,
    primarySource?.market_cap_usd,
    primarySource?.marketCapUSD,
    primarySource?.MarketCapUSD,
    Array.isArray(raw?.tokens) ? raw.tokens[0]?.market_cap_usd : undefined,
    Array.isArray(raw?.tokens) ? raw.tokens[0]?.marketCapUSD : undefined,
  ];

  let parsedMarketCap: number | undefined;
  for (const candidate of marketCapCandidates) {
    if (candidate === undefined || candidate === null) continue;
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) {
      parsedMarketCap = numeric;
      break;
    }
  }

  const name = pickFirst(
    primarySource?.name,
    primarySource?.token_name,
    primarySource?.tokenName,
    raw?.tokenName,
    raw?.name,
    Array.isArray(raw?.tokens) ? raw.tokens[0]?.name : undefined
  );

  const symbol = pickFirst(
    primarySource?.symbol,
    primarySource?.token_symbol,
    primarySource?.tokenSymbol,
    raw?.symbol,
    Array.isArray(raw?.tokens) ? raw.tokens[0]?.symbol : undefined
  );

  const image = pickFirst(
    primarySource?.image,
    primarySource?.image_url,
    primarySource?.logo,
    primarySource?.logo_url,
    primarySource?.logoUrl,
    primarySource?.thumbnail,
    primarySource?.thumbnailUrl,
    primarySource?.uri,
    raw?.image,
    Array.isArray(raw?.tokens) ? raw.tokens[0]?.image : undefined,
    Array.isArray(raw?.tokens) ? raw.tokens[0]?.logo : undefined,
    Array.isArray(raw?.tokens) ? raw.tokens[0]?.logo_url : undefined,
    Array.isArray(raw?.tokens) ? raw.tokens[0]?.uri : undefined
  );

  const pairAddress = pickFirst(
    primarySource?.pair_address,
    primarySource?.poolId,
    raw?.pair_address,
    Array.isArray(raw?.tokens) ? raw.tokens[0]?.pair_address : undefined,
  );

  const createdAtCandidate = pickFirst(
    primarySource?.created_at,
    primarySource?.createdAt,
    raw?.created_at,
    raw?.createdAt,
    Array.isArray(raw?.tokens) ? raw.tokens[0]?.created_at : undefined,
  );

  const protocol =
    typeof protocolCandidate === "string"
      ? protocolCandidate.toLowerCase()
      : "";

  return {
    name: typeof name === "string" ? name : undefined,
    symbol: typeof symbol === "string" ? symbol : undefined,
    image: typeof image === "string" ? (normalizeImageUrl(image) || image) : undefined,
    protocol,
    marketCap: parsedMarketCap,
    pairAddress: typeof pairAddress === "string" ? pairAddress : undefined,
    createdAt: typeof createdAtCandidate === "string" ? createdAtCandidate : undefined,
  };
}

function mergeTokenMeta(...sources: TokenMetaInfo[]): TokenMetaInfo {
  return sources.reduce<TokenMetaInfo>(
    (acc, source) => {
      if (!source) return acc;
      if (source.name && !acc.name) acc.name = source.name;
      if (source.symbol && !acc.symbol) acc.symbol = source.symbol;
      if (source.image && !acc.image) acc.image = source.image;
      if (source.protocol && !acc.protocol) acc.protocol = source.protocol;
      if (source.pairAddress && !acc.pairAddress) acc.pairAddress = source.pairAddress;
      if (source.createdAt && !acc.createdAt) acc.createdAt = source.createdAt;
      if (
        source.marketCap !== undefined &&
        (acc.marketCap === undefined || isValidNumber(source.marketCap))
      ) {
        acc.marketCap = source.marketCap;
      }
      return acc;
    },
    {}
  );
}

interface TokenLimitOrdersProps {
  liveMarketCapUsd?: number | null;
  currentTokenAddress?: string | null;
}

export default function TokenLimitOrders({ liveMarketCapUsd, currentTokenAddress }: TokenLimitOrdersProps) {
  const router = useRouter();
  const { user } = useUser();
  const [orders, setOrders] = useState<LimitOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [tokenMetaMap, setTokenMetaMap] = useState<Record<string, TokenMetaInfo>>({});
  const [metaLoading, setMetaLoading] = useState<Record<string, boolean>>({});
  const previousStatusesRef = useRef<Record<string, LimitOrderStatus>>({});
  const tokenMetaMapRef = useRef<Record<string, TokenMetaInfo>>({});
  const metaFetchedAtRef = useRef<Record<string, number>>({});

  useEffect(() => {
    tokenMetaMapRef.current = tokenMetaMap;
  }, [tokenMetaMap]);

  const hasAuth = Boolean(user?.bearerToken);

  const activeOrders = useMemo(
    () =>
      orders.filter(
        (order) => order.status !== "Cancelled" && order.status !== "Failed",
      ),
    [orders],
  );

  const hasOrders = activeOrders.length > 0;

  const fetchOrders = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!hasAuth) return;

          if (!opts.silent) {
        setLoading(true);
      }
      try {
        const response = await getMyLimitOrders(user!.bearerToken);
        const rawOrders: LimitOrder[] = response.orders || [];
        const nextStatuses: Record<string, LimitOrderStatus> = {};

        rawOrders.forEach((order) => {
          const previousStatus = previousStatusesRef.current[order.id];
          const currentStatus = order.status;

          if (previousStatus && previousStatus !== currentStatus) {
            if (currentStatus === "Completed") {
              const meta = tokenMetaMapRef.current[order.tokenAddress] || {};
              const displayName =
                meta.symbol ||
                meta.name ||
                (order.tokenAddress ? `${order.tokenAddress.slice(0, 4)}…${order.tokenAddress.slice(-4)}` : "Token");
              const symbolLabel = meta.symbol || meta.name || "Tokens";
              const amountLabel =
                order.type === "Buy"
                  ? `${formatAmount(Number(order.solAmount))} SOL`
                  : `${formatAmount(Number(order.tokenAmount))} ${symbolLabel}`;
              const targetLabel = getOrderTargetLabel(order);

              showOrderToast({
                label: `${displayName} limit order filled`,
                tokenImage: meta.image,
                tokenName: displayName,
                txHash: order.transactionHash,
              });
              dispatchBalanceRefresh('sol');
            } else if (
              (currentStatus === "Cancelled" || currentStatus === "Failed") &&
              previousStatus &&
              previousStatus !== currentStatus &&
              order.failureReason
            ) {
              showEnhancedToast("error", `Limit order #${order.id} failed`, {
                title: "Limit Order Failed",
                description: order.failureReason,
              });
            }
          }

          nextStatuses[order.id] = currentStatus;
        });

        previousStatusesRef.current = nextStatuses;

            const activeStatuses: LimitOrderStatus[] = ["Active", "Failed"];
        const filteredOrders = rawOrders.filter((order: LimitOrder) =>
              activeStatuses.includes(order.status)
            );
            setOrders(filteredOrders);
      } catch (error: any) {
        console.error("[TokenLimitOrders] Failed to fetch orders:", error);
        if (!opts.silent) {
          toast.error(
            error?.message || "Failed to load orders. Please try again later.",
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [hasAuth, user],
  );

  const fetchTokenMetadata = useCallback(
    async (order: LimitOrder) => {
      const address = order.tokenAddress;
      if (!address) return;

      const isCached = !!tokenMetaMap[address];
      const isStale = (Date.now() - (metaFetchedAtRef.current[address] ?? 0)) > META_STALE_MS;
      if ((isCached && !isStale) || metaLoading[address]) return;

      setMetaLoading((prev) => ({ ...prev, [address]: true }));

      try {
        let combinedMeta: TokenMetaInfo = {};

        // Fetch search (metadata) and OHLC (market cap) in parallel
        const [searchResponse, ohlcResponse] = await Promise.allSettled([
          fetch(
            `${process.env.NEXT_PUBLIC_GO_SERVICE_URL}/v1/search?phrase=${encodeURIComponent(address)}&limit=1`
          ),
          fetch(
            `${process.env.NEXT_PUBLIC_GO_SERVICE_URL}/v1/ohlcv/${encodeURIComponent(address)}?timeframe=1s&limit=1`,
            {
              headers: {
                'accept': 'application/json',
                'X-API-Key': process.env.NEXT_PUBLIC_BACKEND_API_KEY || 'test-key',
              },
            }
          ),
        ]);

        // Parse search for metadata (name, symbol, image, protocol)
        if (searchResponse.status === 'fulfilled' && searchResponse.value.ok) {
          const searchData = await searchResponse.value.json();
          combinedMeta = mergeTokenMeta(combinedMeta, extractTokenMeta(searchData));

          // Fallback: use extractTokenImage() which checks more fields + normalizes
          if (!combinedMeta.image) {
            const primarySource = searchData?.token || searchData?.tokenInfo || searchData?.tokenData ||
              searchData?.metadata || (Array.isArray(searchData?.tokens) ? searchData.tokens[0] : null);
            const fallbackImage = extractTokenImage(primarySource) || extractTokenImage(searchData);
            if (fallbackImage) combinedMeta.image = fallbackImage;
          }
        }

        // Parse OHLC for market cap (close * 1B) — overrides search MC if available
        if (ohlcResponse.status === 'fulfilled' && ohlcResponse.value.ok) {
          const ohlcData = await ohlcResponse.value.json();
          const candles = ohlcData?.candles;
          if (Array.isArray(candles) && candles.length > 0) {
            const last = candles[candles.length - 1];
            const closePrice = Number(last.close ?? last.c);
            if (Number.isFinite(closePrice) && closePrice > 0) {
              combinedMeta.marketCap = closePrice * 1_000_000_000;
            }
          }
        }

        metaFetchedAtRef.current[address] = Date.now();

        // Merge: preserve previous fields (especially marketCap) if new data doesn't provide them
        setTokenMetaMap((prev) => ({
          ...prev,
          [address]: {
            ...prev[address],
            ...combinedMeta,
          },
        }));
      } catch (error) {
        console.error("[TokenLimitOrders] Failed to fetch token metadata:", error);
      } finally {
        setMetaLoading((prev) => {
          const next = { ...prev };
          delete next[address];
          return next;
        });
      }
    },
    [metaLoading, tokenMetaMap],
  );

  useEffect(() => {
    if (!hasAuth) return;
    let cancelled = false;

    const load = async () => {
      if (cancelled) return;
      await fetchOrders();
    };

    load();

    const interval = setInterval(() => fetchOrders({ silent: true }), REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [fetchOrders, hasAuth]);

  useEffect(() => {
    if (!hasAuth || typeof window === "undefined") return;

    const handleUpdate = () => {
      void fetchOrders({ silent: true });
    };

    window.addEventListener("limit-order-update", handleUpdate);
    return () => {
      window.removeEventListener("limit-order-update", handleUpdate);
    };
  }, [fetchOrders, hasAuth]);

  useEffect(() => {
    if (!hasAuth) return;
    activeOrders.forEach((order) => {
      void fetchTokenMetadata(order);
    });
  }, [activeOrders, fetchTokenMetadata, hasAuth]);

  // Periodic market cap refresh — re-triggers fetchTokenMetadata which checks staleness internally
  useEffect(() => {
    if (!hasAuth || activeOrders.length === 0) return;
    const interval = setInterval(() => {
      activeOrders.forEach((order) => {
        void fetchTokenMetadata(order);
      });
    }, META_STALE_MS);
    return () => clearInterval(interval);
  }, [activeOrders, fetchTokenMetadata, hasAuth]);

  const handleCancel = async (orderId: string) => {
    if (!hasAuth) return;
    const order = orders.find((item) => item.id === orderId);
    const meta = order ? tokenMetaMapRef.current[order.tokenAddress] || {} : {};
    const displayName =
      meta.symbol ||
      meta.name ||
      (order?.tokenAddress ? `${order.tokenAddress.slice(0, 4)}…${order.tokenAddress.slice(-4)}` : "Token");
    const amountLabel =
      order?.type === "Buy"
        ? `${formatAmount(Number(order?.solAmount))} SOL`
        : `${formatAmount(Number(order?.tokenAmount))} ${meta.symbol || meta.name || "Tokens"}`;
    const targetLabel = order ? getOrderTargetLabel(order) : "—";

    const cancelToastId = showOrderToast({
      label: `Cancelling ${displayName}`,
      tokenImage: meta.image,
      tokenName: displayName,
    });

    setCancellingId(orderId);
    try {
      await updateLimitOrder(
        { orderId, status: "Cancelled" },
        user!.bearerToken,
      );
      toast.dismiss(cancelToastId);
      showOrderToast({
        label: `${displayName} order cancelled`,
        tokenImage: meta.image,
        tokenName: displayName,
      });
      setOrders((prev) => prev.filter((order) => order.id !== orderId));
    } catch (error: any) {
      console.error("[TokenLimitOrders] Failed to cancel order:", error);
      toast.dismiss(cancelToastId);
      const message =
        error?.message || "Unable to cancel order. Please try again.";
      showEnhancedToast("error", "Cancel failed", {
        title: "Unable to Cancel Limit Order",
        description: message,
      });
    } finally {
      setCancellingId(null);
    }
  };

  if (!hasAuth) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-neutral-400">
        <p>Sign in to view your limit orders.</p>
      </div>
    );
  }

  if (!loading && !hasOrders) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-neutral-400">
        <p>No limit orders yet.</p>
        <p>Create a limit order to see it here.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-neutral-400">
          Loading orders...
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <table className="min-w-full divide-y divide-neutral-800 text-sm">
            <thead className="bg-neutral-950/30 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-neutral-300">
                  Token
                </th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-300">
                  Type
                </th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-300">
                  Amount
                </th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-300">
                  Settings
                </th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-300">
                  Current MC
                </th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-300">
                  Target MC
                </th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-300">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-900">
              {activeOrders
                .slice()
                .sort((a, b) => {
                  const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                  const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                  return bTime - aTime;
                })
                .map((order) => {
                  const meta = tokenMetaMap[order.tokenAddress] || {};
                  const resolvedName = meta.name || "Unknown Token";
                  const resolvedSymbol =
                    meta.symbol ||
                    (order.tokenAddress ? order.tokenAddress.slice(0, 6) : "TOKEN");
                  const resolvedImage = meta.image;
                  const protocol = meta.protocol || "";
                  const protocolColor = getProtocolColor(protocol);
                  const protocolIcon = getProtocolIcon(protocol);
                  const fillProtocolBadge = shouldFillProtocolBadge(protocol);
                  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                    resolvedName || resolvedSymbol,
                  )}&background=1D1D1D&color=FFFFFF`;

                  const isMigrationOrder = order.triggerType === "bonding";
                  const isDevSellOrder = order.triggerType === "devSell";
                  const amount =
                    order.type === "Buy"
                      ? `${formatAmount(Number(order.solAmount))} SOL`
                      : isDevSellOrder
                      ? `${formatAmount(Number(order.tokenAmount))}%`
                      : `${formatAmount(Number(order.tokenAmount))} Tokens`;
                  const devWalletLabel = order.devWallet
                    ? `${order.devWallet.slice(0, 4)}...${order.devWallet.slice(-4)}`
                    : "Dev Sell";
                  const targetDisplay = isMigrationOrder
                    ? "—"
                    : isDevSellOrder
                    ? "—"
                    : formatMarketCap(Number(order.targetMC));
                  const liveMC = currentTokenAddress && order.tokenAddress === currentTokenAddress
                    ? liveMarketCapUsd
                    : null;
                  const currentMCDisplay = formatMarketCap(
                    (typeof liveMC === 'number' && Number.isFinite(liveMC) && liveMC > 0) ? liveMC : meta.marketCap
                  );
                  const statusColor =
                    order.status === "Active"
                      ? "text-emerald-400"
                      : order.status === "Completed"
                      ? "text-sky-400"
                      : "text-neutral-500";

                  const normalizeNumber = (value: unknown): number | null => {
                    const numeric = Number(value);
                    return Number.isFinite(numeric) ? numeric : null;
                  };

                  const rawSlippage = normalizeNumber(order.slippage);
                  const slippagePct =
                    rawSlippage != null
                      ? rawSlippage <= 1
                        ? rawSlippage * 100
                        : rawSlippage
                      : null;
                  const priorityFee = normalizeNumber(order.priorityFee);
                  const bribe = normalizeNumber(order.bribe);
                  const mevMode =
                    order.mevMode && typeof order.mevMode === "string"
                      ? order.mevMode.charAt(0).toUpperCase() + order.mevMode.slice(1)
                      : order.autoFee
                      ? "Auto"
                      : "Off";

                  return (
                    <tr
                      key={order.id}
                      className="bg-neutral-950/20 hover:bg-neutral-900/40"
                      onMouseEnter={() => {
                        const navigateAddress = meta.pairAddress || order.pairAddress || order.tokenAddress;
                        if (navigateAddress) {
                          preloadTradeChart({
                            mint: order.tokenAddress,
                            pairAddress: navigateAddress,
                            chain: 'sol',
                            name: meta.name,
                            symbol: meta.symbol,
                            marketCapUsd: meta.marketCap ? Number(meta.marketCap) : undefined,
                            image: meta.image || "",
                            launchpadProtocol: meta.protocol,
                          }, { router });
                        }
                      }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative flex items-center justify-center rounded-sm transition-all duration-300 ease-out">
                            <div className="relative rounded-sm" style={{ border: "none", padding: 0 }}>
                              <div
                                className="relative rounded-sm"
                                style={{
                                  border: `1px solid ${protocolColor}`,
                                  padding: 1,
                                  backgroundColor: "#06070b",
                                }}
                              >
                                <div
                                  className="relative rounded-sm overflow-hidden"
                                  style={{ width: 36, height: 36 }}
                                >
                                  <FastImage
                                    src={resolvedImage ?? undefined}
                                    fallbackSrc={fallbackAvatar}
                                    alt={resolvedName || resolvedSymbol}
                                    width={36}
                                    height={36}
                                    className="w-full h-full object-cover transition-all duration-300"
                                    symbol={resolvedSymbol}
                                    name={resolvedName}
                                    showBubble={false}
                                  />
                                </div>
                              </div>
                            </div>
                            <div
                              className="absolute bottom-0 right-0 bg-white rounded-full flex items-center justify-center transform translate-x-1/5 translate-y-1/4 z-10"
                              style={{
                                width: 12,
                                height: 12,
                                border: `1px solid ${protocolColor}`,
                                boxShadow: `0 0 2px ${protocolColor}60`,
                              }}
                              title="Protocol"
                            >
                              <img
                                src={protocolIcon}
                                alt={`${protocol || "Protocol"} logo`}
                                className={`${
                                  fillProtocolBadge
                                    ? "w-full h-full object-cover"
                                    : "w-3/4 h-3/4 object-contain"
                                } rounded-full`}
                                style={{
                                  filter:
                                    protocolColor === "#eab308"
                                      ? "sepia(1) saturate(3) hue-rotate(-10deg) brightness(1.1)"
                                      : "none",
                                }}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                            </div>
                          </div>
                          <div className="flex flex-col">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const navigateAddress = meta.pairAddress || order.pairAddress || order.tokenAddress;
                                if (!navigateAddress) return;

                                const queryParams = new URLSearchParams();
                                queryParams.set('chain', 'sol');
                                if (meta.name) queryParams.set('_name', meta.name);
                                if (meta.symbol) queryParams.set('_symbol', meta.symbol);
                                if (meta.marketCap) queryParams.set('_mcap', String(meta.marketCap));
                                if (meta.image) queryParams.set('_image', meta.image);
                                queryParams.set('_mint', order.tokenAddress);
                                if (meta.protocol) queryParams.set('_launchpad_protocol', meta.protocol);
                                if (meta.createdAt) queryParams.set('_created_at', meta.createdAt);

                                router.push(`/trade/${navigateAddress}?${queryParams.toString()}`);
                              }}
                              className="text-sm font-semibold text-white hover:text-[#70E0B0] transition-colors cursor-pointer text-left"
                            >
                              {resolvedName}
                            </button>
                            <div className="flex items-center gap-2 text-xs text-neutral-500">
                              <span className="uppercase tracking-wide">
                                {resolvedSymbol}
                              </span>
                              <span className={`flex items-center gap-1 font-semibold ${statusColor}`}>
                                {order.status === "Active" && (
                                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#2fd6a4]" />
                                )}
                                {order.status}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1 text-sm">
                          <span style={{ color: order.type === "Buy" ? "#2fd6a4" : "#f87171" }}>
                            {getOrderTypeLabel(order)}
                          </span>
                          <span className="text-xs text-neutral-500">{order.status}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-neutral-200">{amount}</td>
                      <td className="px-4 py-3 text-neutral-300">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <span className="flex items-center gap-1 text-neutral-400">
                            <FaRunning className="opacity-80" />
                            {slippagePct != null ? `${slippagePct.toFixed(0)}%` : "—"}
                          </span>
                          <span className="flex items-center gap-1 text-neutral-400">
                            <FaGasPump className="opacity-80" />
                            {priorityFee != null ? `${formatAmount(priorityFee, 6)} SOL` : "—"}
                          </span>
                          <span className="flex items-center gap-1 text-neutral-400">
                            <FaCoins className="opacity-80" />
                            {bribe != null ? `${formatAmount(bribe, 6)} SOL` : "—"}
                          </span>
                          <span className="flex items-center gap-1 text-neutral-400">
                            <FaBan className="opacity-80" />
                            {mevMode}
                          </span>
                          {isDevSellOrder && order.devWallet && (
                            <a
                              href={`https://solscan.io/account/${order.devWallet}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-neutral-400 hover:text-[#70E0B0] transition-colors cursor-pointer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Dev: {devWalletLabel}
                            </a>
                          )}
                        </div>
                        {order.createdAt && (
                          <div className="mt-1 text-[10px] text-neutral-500">
                            {new Date(order.createdAt).toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-neutral-200">{currentMCDisplay}</td>
                      <td className="px-4 py-3 text-neutral-200">{targetDisplay}</td>
                      <td className="px-4 py-3">
                        {order.status === "Active" ? (
                          <button
                            onClick={() => handleCancel(order.id)}
                            disabled={cancellingId === order.id}
                            className="rounded-lg border border-rose-500/40 px-3 py-1 text-xs font-semibold text-rose-300 transition-colors hover:border-rose-400 hover:text-rose-200 disabled:opacity-50"
                          >
                            {cancellingId === order.id ? "Cancelling..." : "Cancel"}
                          </button>
                        ) : (
                          <span className="text-xs text-neutral-500">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
