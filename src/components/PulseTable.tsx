import React, { useState, useEffect, useRef, useMemo } from "react";
import type { Token } from "~/utils/db";
import { formatSmartNumber } from "~/utils/db";
import { HiLightningBolt } from "react-icons/hi";
import {
  FaUser,
  FaGlobe,
  FaSearch,
  FaCrown,
  FaRegCopy,
  FaBolt,
} from "react-icons/fa";
import { useRouter } from "next/router";
import { fetchTokenMetadata } from "~/utils/functions";
import { LuPill, LuSearch } from "react-icons/lu";
import Link from "next/link";
import { CiSearch } from "react-icons/ci";
import FastImage from "./FastImage";

interface PulseTableProps {
  title: string;
  tokens: Token[];
  isFirstOrLast?: "first" | "last";
  loading?: boolean;
  skeletonRowCount?: number;
  showBubbleMetrics?: boolean; // Feature flag for bubble metrics (Buyers, Sellers, Wallets, 24h TX, Vol 24h)
}

// Add a simple in-memory cache for token metadata
const tokenMetadataCache: Record<string, any> = {};

// Smooth number transition component
interface SmoothNumberProps {
  value: number;
  duration?: number;
  className?: string;
  formatter?: (value: number) => string;
}

const SmoothNumber: React.FC<SmoothNumberProps> = ({
  value,
  duration = 500,
  className = "",
  formatter = (val) => val.toString(),
}) => {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationRef = useRef<number | undefined>(undefined);
  const startTimeRef = useRef<number | undefined>(undefined);
  const startValueRef = useRef<number>(value);

  useEffect(() => {
    if (value === displayValue) return;

    const startValue = displayValue;
    const endValue = value;
    const startTime = performance.now();

    startTimeRef.current = startTime;
    startValueRef.current = startValue;
    setIsAnimating(true);

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function for smooth animation
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      const currentValue = startValue + (endValue - startValue) * easeOutCubic;

      setDisplayValue(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endValue);
        setIsAnimating(false);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value, duration]);

  return (
    <span
      className={`${isAnimating ? "transition-all duration-75" : ""} ${className}`}
    >
      {formatter(displayValue)}
    </span>
  );
};

function useTokenMetadata(uri?: string) {
  const [meta, setMeta] = useState<any | null>(null);
  const [loading, setLoading] = useState(!!uri);
  const [showInitial, setShowInitial] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!uri) {
      setMeta(null);
      setLoading(false);
      return;
    }
    if (tokenMetadataCache[uri]) {
      setMeta(tokenMetadataCache[uri]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setShowInitial(false);
    const timer = setTimeout(() => setShowInitial(true), 150);
    fetchTokenMetadata(uri).then((data) => {
      if (!cancelled) {
        if (data) tokenMetadataCache[uri] = data;
        setMeta(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [uri]);
  return { meta, loading, showInitial };
}

function TokenImage({
  token,
  priority = false,
}: {
  token: Token;
  priority?: boolean;
}) {
  // Use uri field from deployed service, fallback to image field, then token.logo
  const imageUrl = (token as any).uri || (token as any).image || token.logo;

  return (
    <FastImage
      src={imageUrl}
      alt={token.name || token.symbol || ""}
      symbol={token.symbol}
      name={token.name}
      width={56}
      height={56}
      className="rounded-sm object-contain p-0.5"
      priority={priority}
    />
  );
}


const PulseTable = React.memo(function PulseTable({
  title,
  tokens,
  isFirstOrLast,
  loading = false,
  skeletonRowCount = 10,
  showBubbleMetrics = false,
}: PulseTableProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const router = useRouter();

  // Memoize token rendering to prevent unnecessary re-renders
  const memoizedTokens = useMemo(() => tokens, [tokens]);

  const shortAddr = (token: any): string => {
    try {
      const a = token?.pair_address || token?.mint || token?.address || "";
      if (typeof a !== "string" || a.length < 8) return a || "-";
      return `${a.slice(0, 4)}...${a.slice(-4)}`;
    } catch {
      return "-";
    }
  };

  const getAgeLabel = (token: any): string => {
    try {
      // Accept multiple possible fields and formats
      let v: any =
        token?.created_at ??
        token?.createdAt ??
        token?.listedAt ??
        token?.mintedAt ??
        token?.pair_created_at ??
        token?.pairCreatedAt ??
        token?.pool_created_at ??
        token?.poolCreatedAt ??
        token?.exchange_created_at ??
        token?.exchangeCreatedAt ??
        token?.firstSeen ??
        token?.first_seen ??
        token?.launch_time ??
        token?.launchTime ??
        token?.timestamp ??
        token?.ts ??
        token?.block_time ??
        token?.blockTime ??
        null;
      if (v === null || v === undefined) return "-";
      if (typeof v === "object") {
        if ("Time" in v && typeof (v as any).Time === "string")
          v = (v as any).Time;
        else if ("time" in v && typeof (v as any).time === "string")
          v = (v as any).time;
        else if ("seconds" in v && typeof (v as any).seconds === "number")
          v = Number((v as any).seconds) * 1000;
        else if ("millis" in v && typeof (v as any).millis === "number")
          v = Number((v as any).millis);
      }
      let ts: number | null = null;
      if (typeof v === "number") {
        // Heuristic: treat 13-digit as ms, 10-digit as seconds
        if (v > 1e12) ts = v;
        else if (v > 1e9) ts = v * 1000;
        else ts = null;
      } else if (typeof v === "string") {
        const num = Number(v);
        if (!Number.isNaN(num) && num > 0) {
          if (num > 1e12) ts = num;
          else if (num > 1e9) ts = num * 1000;
        }
        if (ts === null) {
          const d = Date.parse(v);
          if (!Number.isNaN(d)) ts = d;
        }
      } else if (v instanceof Date) {
        ts = v.getTime();
      }
      if (ts === null) return "-";
      const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
      if (diffSec < 60) return `${diffSec}s`;
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
      return `${Math.floor(diffSec / 86400)}d`;
    } catch {
      return "-";
    }
  };

  return (
    <div
      className={`flex w-full min-w-[340px] flex-1 flex-col shadow-lg ${isFirstOrLast === "first" ? "border-r border-l" : "border-r"} border-emerald-950`}
    >
      <div className="mb-2 flex items-center justify-between border-t border-b border-emerald-950 p-2 text-lg font-bold text-white">
        {title}
        {/* Optionally add filter/sort controls here */}
      </div>
      <div className="custom-scrollbar max-h-[70vh] overflow-y-scroll">
        {loading && tokens.length === 0 ? (
          Array.from({ length: skeletonRowCount }).map((_, idx) => (
            <div
              key={idx}
              className="flex animate-pulse flex-row items-center border-b border-neutral-800 py-3 last:border-b-0"
            >
              {/* Profile Picture & Address skeleton */}
              <div className="mr-3 flex w-16 flex-col items-center">
                <div className="relative h-14 w-14 rounded-full bg-neutral-800" />
                <div className="mt-1 h-3 w-12 rounded bg-neutral-800" />
              </div>
              {/* Main Info Section skeleton */}
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-row justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="h-4 w-20 rounded bg-neutral-800" />
                      <div className="h-3 w-16 rounded bg-neutral-800" />
                      <div className="h-3 w-6 rounded bg-neutral-800" />
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-3 w-8 rounded bg-neutral-800" />
                      <div className="h-3 w-6 rounded bg-neutral-800" />
                      <div className="h-3 w-6 rounded bg-neutral-800" />
                      <div className="h-3 w-6 rounded bg-neutral-800" />
                    </div>
                  </div>
                  <div className="flex min-w-[120px] flex-col items-end gap-1">
                    <div className="flex gap-3 text-xs">
                      <div className="h-3 w-12 rounded bg-neutral-800" />
                      <div className="h-3 w-12 rounded bg-neutral-800" />
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <div className="h-3 w-8 rounded bg-neutral-800" />
                      <div className="h-3 w-8 rounded bg-neutral-800" />
                    </div>
                  </div>
                </div>
                <div className="mt-1 flex flex-row items-center justify-between gap-2">
                  <div className="flex gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-4 w-10 rounded-full bg-neutral-800"
                      />
                    ))}
                  </div>
                  <div className="h-7 w-20 rounded-full bg-neutral-800" />
                </div>
              </div>
            </div>
          ))
        ) : tokens.length === 0 ? (
          <div className="py-8 text-center text-neutral-500">
            No tokens found.
          </div>
        ) : (
          memoizedTokens.map((token, idx) => {
            const pairAddress = (token as any)?.pair_address;
            const mintAddress = (token as any)?.mint;

            const handleTokenClick = async () => {
              // If we have pair_address, navigate directly
              if (pairAddress) {
                router.push(`/trade/${pairAddress}`);
                return;
              }

              // If we only have mint_address, fetch pair_address first
              if (mintAddress) {
                try {
                  console.log("Fetching pair address for mint:", mintAddress);
                  const response = await fetch(
                    "/api/token-service/hydrate-pair",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ mint: mintAddress }),
                    },
                  );

                  if (response.ok) {
                    const data = await response.json();
                    if (data.pair_address) {
                      console.log("Got pair address:", data.pair_address);
                      router.push(`/trade/${data.pair_address}`);
                    } else {
                      console.error(
                        "No pair address found for mint:",
                        mintAddress,
                      );
                    }
                  } else {
                    console.error(
                      "Failed to fetch pair address for mint:",
                      mintAddress,
                    );
                  }
                } catch (error) {
                  console.error("Error fetching pair address:", error);
                }
              }
            };

            return (
              <div
                key={`${pairAddress || mintAddress || "noaddr"}-${idx}`}
                className="group relative flex w-full cursor-pointer flex-row items-center gap-2 border-b border-neutral-800 p-1 transition hover:bg-neutral-800/40"
                onClick={handleTokenClick}
              >
                {/* Status popout on hover */}
                <span
                  className={`absolute left-1/2 z-20 hidden -translate-x-1/2 border bg-neutral-900 px-3 py-1 text-sm shadow-xl group-hover:flex ${
                    idx === 0 ? "top-full mt-2" : "-top-7"
                  }`}
                  style={{ pointerEvents: "none" }}
                >
                  {(() => {
                    // Determine token status based on title and token data
                    const isNewPairs = title.toLowerCase().includes("new");
                    const isFinalStretch =
                      title.toLowerCase().includes("final") ||
                      title.toLowerCase().includes("stretch");
                    const isMigrated = title.toLowerCase().includes("migrated");

                    if (isNewPairs) {
                      // Show bonding curve progress for new pairs
                      // bonding_pct is already in 0-100 range from backend (percentages)
                      const bondingProgress =
                        typeof token.bonding_pct === "number"
                          ? Math.round(token.bonding_pct)
                          : Math.round(parseFloat(token.bonding_pct || "0"));

                      return (
                        <span className="border-emerald-700 text-emerald-400">
                          Bonding Curve: {bondingProgress}%
                        </span>
                      );
                    } else if (isFinalStretch) {
                      // Show "migrating" for final stretch
                      return (
                        <span className="border-yellow-700 text-yellow-400">
                          Migrating
                        </span>
                      );
                    } else if (isMigrated) {
                      // Show "migrated" for migrated tokens
                      return (
                        <span className="border-blue-700 text-blue-400">
                          Migrated
                        </span>
                      );
                    } else {
                      // Fallback to bonding curve progress
                      const bondingProgress =
                        typeof token.bonding_curve_progress === "number"
                          ? Math.round(token.bonding_curve_progress)
                          : Math.round(
                              parseFloat(token.bonding_curve_progress || "0"),
                            );
                      return (
                        <span className="border-emerald-700 text-emerald-400">
                          Bonding: {bondingProgress}%
                        </span>
                      );
                    }
                  })()}
                </span>
                {/* Profile Picture & Address */}
                <div className="flex flex-col items-center">
                  <div className="relative flex h-auto w-20 items-center justify-center overflow-hidden rounded-sm border border-purple-400">
                    <TokenImage
                      token={token}
                      priority={title === "New Pairs"}
                    />
                  </div>
                  <span className="mt-1 max-w-[60px] truncate font-mono text-xs text-neutral-500">
                    {shortAddr(token)}
                  </span>
                </div>
                {/* Main Info Section */}
                <div className="flex w-full min-w-0 flex-col gap-2">
                  {/* Top Row */}
                  <div className="flex flex-row justify-between gap-2">
                    {/* Left: Token Info & Socials */}
                    <div className="flex min-w-0 flex-col">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-semibold text-white">
                          {token.symbol}
                        </span>
                        <span className="text-xs text-neutral-400">
                          {token.name}
                        </span>
                        <button
                          className="ml-1 text-neutral-400 hover:text-white"
                          title="Copy contract"
                        >
                          <FaRegCopy size={14} />
                        </button>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-base text-emerald-400">
                        <span>{getAgeLabel(token)}</span>
                        {/* Socials */}
                        {/* <a
                          href={
                            token.links
                              ? (token.links as Record<string, string>)[
                                  "website"
                                ] || "#"
                              : "#"
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300"
                        >
                          <FaGlobe title="Website" />
                        </a> */}
                        {token.mint.slice(-4) === "pump" ? (
                          <Link
                            target="_blank"
                            href={`https://pump.fun/coin/${token.mint}`}
                          >
                            <LuPill className="text-neutral-200 hover:text-emerald-300" />
                          </Link>
                        ) : (
                          ""
                        )}
                        <Link
                          target="_blank"
                          href={`https://x.com/search?q=${token.mint}`}
                        >
                          <LuSearch className="text-neutral-200 hover:text-emerald-300 font-bold"  size={18} />
                        </Link>
                      </div>
                    </div>
                    {/* Right: MC, V, F, TX */}
                    <div className="items-right justify-right flex min-w-[160px] flex-col items-end gap-1 text-right">
                      <div className="justify-right flex flex-col text-xs">
                        <span className="text-neutral-400">
                          MC{" "}
                          <span className="text-xl font-bold text-emerald-300">
                            <SmoothNumber
                              value={
                                (token as any).fully_diluted_value ??
                                (token as any).market_cap_usd ??
                                0
                              }
                              formatter={(val) => `$${formatSmartNumber(val)}`}
                              duration={300}
                            />
                          </span>
                        </span>
                        {/* <span className="text-neutral-400">P <span className="text-white font-bold">
                        <SmoothNumber 
                          value={(token as any).price_usd ?? (token as any).usd_price ?? 0} 
                          formatter={(val) => `$${formatSmartNumber(val)}`}
                          duration={300}
                        />
                      </span></span> */}
                        <span className="text-neutral-400">
                          V{" "}
                          <span className="font-bold text-white">
                            <SmoothNumber
                              value={(token as any).volume_24h || 0}
                              formatter={(val) => `$${formatSmartNumber(val)}`}
                              duration={300}
                            />
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <div className="flex flex-row items-center gap-1 text-neutral-400">
                          TX{" "}
                          <span className="font-bold text-white">
                            <SmoothNumber
                              value={
                                (token.total_buys_5m ?? 0) +
                                (token.total_sells_5m ?? 0)
                              }
                              duration={300}
                            />
                          </span>
                          <div className="flex flex-row">
                            <div
                              className={`h-0.5 w-[${(token.total_buys_5m / (token.total_buys_5m + token.total_sells_5m)) * 24}px] bg-emerald-300`}
                            ></div>
                            <div
                              className={`h-0.5 w-[${(token.total_sells_5m / (token.total_buys_5m + token.total_sells_5m)) * 24}px] bg-red-400`}
                            ></div>
                          </div>
                        </div>
                        {/* <span className="text-neutral-400">
                          V5m{" "}
                          <span className="font-bold text-green-400">
                            <SmoothNumber
                              value={
                                (token.total_buy_volume_5m ?? 0) +
                                (token.total_sell_volume_5m ?? 0)
                              }
                              formatter={(val) => `$${formatSmartNumber(val)}`}
                              duration={300}
                            />
                          </span>
                        </span> */}
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        {/* <span className="text-neutral-400">
                          W5m{" "}
                          <span className="font-bold text-blue-400">
                            <SmoothNumber
                              value={token.unique_wallets_5m ?? 0}
                              duration={300}
                            />
                          </span>
                        </span>
                        <span className="text-neutral-400">
                          B/S{" "}
                          <span className="font-bold text-yellow-400">
                            <SmoothNumber
                              value={token.total_buys_5m ?? 0}
                              duration={300}
                            />
                            /
                            <SmoothNumber
                              value={token.total_sells_5m ?? 0}
                              duration={300}
                            />
                          </span>
                        </span> */}
                      </div>
                      <button className="flex cursor-pointer items-center gap-1 rounded-full bg-emerald-500 px-4 py-1 text-xs font-bold text-black shadow transition duration-150 ease-in-out hover:bg-emerald-300">
                        <HiLightningBolt className="text-black" size={18} /> 0
                        SOL
                      </button>
                    </div>
                  </div>
                  {/* Bottom Row: Badges & Buy Button */}
                  <div className="mt-1 flex flex-row items-center justify-between gap-2">
                    {showBubbleMetrics && (
                      <div className="flex gap-1">
                        {[
                          {
                            icon: <FaUser size={10} />,
                            label: "Buyers",
                            value: token.total_buyers_5m ?? 0,
                            color: "text-green-400",
                          },
                          {
                            icon: <FaCrown size={10} />,
                            label: "Sellers",
                            value: token.total_sellers_5m ?? 0,
                            color: "text-red-400",
                          },
                          {
                            icon: <FaSearch size={10} />,
                            label: "Wallets",
                            value: token.unique_wallets_5m ?? 0,
                            color: "text-blue-400",
                          },
                          {
                            icon: <FaUser size={10} />,
                            label: "24h TX",
                            value:
                              (token.total_buys_24h ?? 0) +
                              (token.total_sells_24h ?? 0),
                            color: "text-yellow-400",
                          },
                          {
                            icon: <FaUser size={10} />,
                            label: "Vol 24h",
                            value: Math.round(
                              (token.total_buy_volume_24h ?? 0) +
                                (token.total_sell_volume_24h ?? 0),
                            ),
                            color: "text-gray-400",
                          },
                        ].map((b, i) => (
                          <span
                            key={i}
                            className={`flex items-center gap-1 bg-neutral-800 ${b.color} rounded-full border border-neutral-700 px-2 py-0.5 text-[10px]`}
                          >
                            {b.icon}{" "}
                            <SmoothNumber value={b.value} duration={300} />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});

export default PulseTable;

