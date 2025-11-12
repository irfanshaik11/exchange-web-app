import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import toast from "react-hot-toast";
import FastImage from "../FastImage";
import { useUser } from "../UserContext";
import { getMyLimitOrders, updateLimitOrder } from "~/utils/api";
import { FaRunning, FaGasPump, FaCoins, FaBan } from "react-icons/fa";
import { showEnhancedToast, updateEnhancedToast } from "~/utils/enhancedToast";

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
};

const REFRESH_INTERVAL_MS = 8000;
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

function formatMarketCap(value?: number) {
  if (!Number.isFinite(value ?? NaN)) return "—";
  return `$${formatAmount(value!, 0)}`;
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
    raw?.image,
    Array.isArray(raw?.tokens) ? raw.tokens[0]?.image : undefined,
    Array.isArray(raw?.tokens) ? raw.tokens[0]?.logo : undefined,
    Array.isArray(raw?.tokens) ? raw.tokens[0]?.logo_url : undefined
  );

  const protocol =
    typeof protocolCandidate === "string"
      ? protocolCandidate.toLowerCase()
      : "";

  return {
    name: typeof name === "string" ? name : undefined,
    symbol: typeof symbol === "string" ? symbol : undefined,
    image: typeof image === "string" ? image : undefined,
    protocol,
    marketCap: parsedMarketCap,
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

export default function TokenLimitOrders() {
  const router = useRouter();
  const { user } = useUser();
  const [orders, setOrders] = useState<LimitOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [tokenMetaMap, setTokenMetaMap] = useState<Record<string, TokenMetaInfo>>({});
  const [metaLoading, setMetaLoading] = useState<Record<string, boolean>>({});
  const previousStatusesRef = useRef<Record<string, LimitOrderStatus>>({});
  const tokenMetaMapRef = useRef<Record<string, TokenMetaInfo>>({});

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

              showEnhancedToast("success", `${displayName} limit order filled`, {
                title: `${order.type} Order Executed`,
                description: `${amountLabel} • Target ${targetLabel}`,
                showExplorerLink: Boolean(order.transactionHash),
                txHash: order.transactionHash,
              });
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
      if (tokenMetaMap[address] || metaLoading[address]) return;

      setMetaLoading((prev) => ({ ...prev, [address]: true }));

      try {
        const params = new URLSearchParams();
        if (order.pairAddress) {
          params.set("pair_address", order.pairAddress);
        } else {
          params.set("mint_address", address);
        }

        const response = await fetch(`/api/token-service/trade-view?${params.toString()}`);
        let combinedMeta: TokenMetaInfo = {};

        if (response.ok) {
          const data = await response.json();
          combinedMeta = mergeTokenMeta(combinedMeta, extractTokenMeta(data));
        }

        const needsFallback =
          !combinedMeta.name ||
          !combinedMeta.symbol ||
          !combinedMeta.image ||
          combinedMeta.marketCap === undefined;

        if (needsFallback) {
          const searchResponse = await fetch(
            `/api/token-service/search?phrase=${encodeURIComponent(address)}&limit=1`
          );
          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            combinedMeta = mergeTokenMeta(combinedMeta, extractTokenMeta(searchData));
          }
        }

        setTokenMetaMap((prev) => ({
          ...prev,
          [address]: combinedMeta,
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

    const cancelToastId = showEnhancedToast("loading", "Cancelling limit order…", {
      title: "Cancelling Order",
      description: `${displayName} • ${amountLabel} • Target ${targetLabel}`,
    });

    setCancellingId(orderId);
    try {
      await updateLimitOrder(
        { orderId, status: "Cancelled" },
        user!.bearerToken,
      );
      updateEnhancedToast(cancelToastId, "success", "Limit order cancelled", {
        title: "Order Cancelled",
        description: `${displayName} • ${amountLabel}`,
      });
      setOrders((prev) => prev.filter((order) => order.id !== orderId));
    } catch (error: any) {
      console.error("[TokenLimitOrders] Failed to cancel order:", error);
      const message =
        error?.message || "Unable to cancel order. Please try again.";
      updateEnhancedToast(cancelToastId, "error", "Cancel failed", {
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

                  const amount =
                    order.type === "Buy"
                      ? `${formatAmount(Number(order.solAmount))} SOL`
                      : isDevSellOrder
                      ? `${formatAmount(Number(order.tokenAmount))}%`
                      : `${formatAmount(Number(order.tokenAmount))} Tokens`;
                  const isMigrationOrder = order.triggerType === "bonding";
                  const isDevSellOrder = order.triggerType === "devSell";
                  const devWalletLabel = order.devWallet
                    ? `${order.devWallet.slice(0, 4)}...${order.devWallet.slice(-4)}`
                    : "Dev Sell";
                  const targetDisplay = isMigrationOrder
                    ? "—"
                    : isDevSellOrder
                    ? "—"
                    : formatMarketCap(Number(order.targetMC));
                  const currentMCDisplay = formatMarketCap(meta.marketCap);
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
                    <tr key={order.id} className="bg-neutral-950/20 hover:bg-neutral-900/40">
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
                                const navigateAddress = order.pairAddress || order.tokenAddress;
                                if (navigateAddress) {
                                  router.push(`/trade/${navigateAddress}`);
                                }
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
