import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import PulseTable from "../components/PulseTable";
// import BnbTable from "../components/BnbTable";
import MonadTable from "../components/MonadTable";
import PulseControlBar from "../components/PulseControlBar";
import type { Token } from "~/utils/db";
import Header from "../components/Header";
import Footer from "../components/Footer";
import UpdatesModal from "../components/UpdatesModal";
import { useUser } from "../components/UserContext";
import Cookies from "js-cookie";
import usePaginatedTokensWebSocket from "../hooks/usePaginatedTokensWebSocket";
import { useRealtimeWebSocket } from "../hooks/useRealtimeWebSocket";
// usePulseWebSocketPersistent moved to PulseBackgroundLoader for data persistence
import * as pulseStore from "~/stores/pulseStore";
// import { PriorityImageSearcher } from '../utils/imageSearch'; // DISABLED - no external image searches
import { useImagePreloader } from "../hooks/useImagePreloader";
import {
  useQueryNewPairs,
  useQueryLaunchpadData,
  useQueryFinalStretch,
  useQueryMigrated,
  tokenKeys,
} from "../hooks/useQueryTokens";
import { useQueryClient } from "@tanstack/react-query";
import { env } from "~/env";
// import { rollingTradeCache } from "../utils/rollingTradeCache";
import { SiBinance, SiSolana } from "react-icons/si";
import { FaDiscord } from "react-icons/fa";
import { extractTokenImage } from "../utils/images";
import { AiOutlineQuestionCircle } from "react-icons/ai";
import { BsBookmarkX, BsLayoutThreeColumns } from "react-icons/bs";
import { CiSettings } from "react-icons/ci";

interface LaunchpadToken {
  mint: string;
  name: string;
  symbol: string;
  image: string;
  priceUsd: number;
  marketCapUsd: number;
  volume24h: number;
  priceChange24h: number;
  graduationPercent: number;
  protocol: string;
  launchpadName: string;
  state: string;
  createdAt: string;
  migratedAt?: string;
  completedAt?: string;
}

interface LaunchpadData {
  new: LaunchpadToken[];
  completing: LaunchpadToken[];
  completed: LaunchpadToken[];
}

// FEATURE FLAG: To re-enable the 5 bubble metrics, change showBubbleMetrics={false} to showBubbleMetrics={true} in all PulseTable components below

// Sample updates data - customize as needed
const PLATFORM_UPDATES = [
  {
    id: "update-1",
    title: "Enhanced Real-Time Data",
    description:
      "Experience lightning-fast updates with our improved WebSocket infrastructure for live token tracking.",
    badge: "New Feature",
    badgeColor:
      "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    image: "/interstate/logo.png",
  },
  {
    id: "update-2",
    title: "Multi-Chain Support",
    description:
      "Track tokens across Solana, BNB Chain, and more. Switch between chains seamlessly with our updated interface.",
    badge: "Coming Soon",
    badgeColor: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  },
  {
    id: "update-3",
    title: "Advanced Filtering",
    description:
      "Find the perfect opportunities with our new advanced filtering options. Sort by liquidity, volume, and more.",
    badge: "Improved",
    badgeColor: "bg-purple-500/20 text-purple-400 border border-purple-500/30",
    actionText: "Learn more about filtering",
    actionLink: "https://discord.gg/sACYQmCsTJ",
  },
];

export default function PulsePage() {
  // Tab navigation state - MOBILE VIEW DISABLED
  const [activeTab, setActiveTab] = useState<
    "new" | "final-stretch" | "migrated"
  >("new");

  // Updates modal state
  const [showUpdatesModal, setShowUpdatesModal] = useState(false);

  const { user } = useUser();
  const router = useRouter();

  // CRITICAL: Initialize chain from URL immediately to avoid race conditions
  // This ensures we react to the correct chain before router.query is ready
  // Priority: URL param > localStorage > default (sol)
  const [currentChain, setCurrentChain] = useState<string>(() => {
    // Initialize from router query if available, otherwise check URL directly
    if (typeof window !== "undefined" && router.isReady && router.query.chain) {
      return router.query.chain as string;
    }
    // Also check URL params directly for immediate access
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const chainFromUrl = urlParams.get("chain");
      if (chainFromUrl) return chainFromUrl;
      // Check localStorage for persisted chain
      const savedChain = localStorage.getItem("selected-chain");
      if (savedChain && (savedChain === "sol" || savedChain === "monad")) {
        return savedChain;
      }
    }
    return "sol";
  });

  // Sync chain state with router query - this handles both initial load and shallow routing updates
  useEffect(() => {
    if (!router.isReady) return;
    // Only update if there's an explicit chain in the query
    if (router.query.chain) {
      const chainFromQuery = router.query.chain as string;
      if (chainFromQuery !== currentChain) {
        console.log(
          "[Pulse] Chain changed from router:",
          currentChain,
          "->",
          chainFromQuery,
        );
        setCurrentChain(chainFromQuery);
      }
    }
  }, [router.query.chain, router.isReady, currentChain]);

  // Also watch router.asPath as a fallback for shallow routing
  useEffect(() => {
    if (!router.isReady) return;
    const urlParams = new URLSearchParams(router.asPath.split("?")[1] || "");
    const chainFromUrl = urlParams.get("chain");
    // Only update if there's an explicit chain in the URL
    if (chainFromUrl && chainFromUrl !== currentChain) {
      console.log(
        "[Pulse] Chain changed from URL:",
        currentChain,
        "->",
        chainFromUrl,
      );
      setCurrentChain(chainFromUrl);
    }
  }, [router.asPath, router.isReady, currentChain]);

  const chain = currentChain;
  // const isBnbRoute = chain === 'bnb';
  const isMonadRoute = chain === "monad";
  // const isBaseRoute = chain === 'base';
  // const isEthereumRoute = chain === 'eth';
  const isSolanaRoute = chain === "sol"; // Only Solana if explicitly set

  // Debug logging for chain state
  console.log("[Pulse] Chain state:", {
    currentChain,
    chain,
    isMonadRoute,
    isSolanaRoute,
    routerQueryChain: router.query.chain,
    routerAsPath: router.asPath,
  });
  const chainButtonBase =
    "relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.03] text-neutral-300 shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black";
  const solanaButtonClasses = `${chainButtonBase} ${
    isSolanaRoute
      ? "bg-white/[0.07] text-white border-white/[0.08]"
      : "text-neutral-500 opacity-75 hover:opacity-100 hover:text-neutral-100"
  }`;
  // const bnbButtonClasses = `${chainButtonBase} ${
  //   isBnbRoute
  //     ? 'bg-[#222733] text-white shadow-lg shadow-blue-500/20'
  //     : 'bg-[#141821] text-neutral-500 opacity-75 hover:opacity-100 hover:text-neutral-100'
  // }`;
  const monadButtonClasses = `${chainButtonBase} ${
    isMonadRoute
      ? "bg-white/[0.07] text-white border-white/[0.08]"
      : "text-neutral-500 opacity-75 hover:opacity-100 hover:text-neutral-100"
  }`;
  // const baseButtonClasses = `${chainButtonBase} ${
  //   isBaseRoute
  //     ? 'bg-[#222733] text-white shadow-lg shadow-blue-400/20'
  //     : 'bg-[#141821] text-neutral-500 opacity-75 hover:opacity-100 hover:text-neutral-100'
  // }`;
  // const ethButtonClasses = `${chainButtonBase} ${
  //   isEthereumRoute
  //     ? 'bg-[#222733] text-white shadow-lg shadow-emerald-400/20'
  //     : 'bg-[#141821] text-neutral-500 opacity-75 hover:opacity-100 hover:text-neutral-100'
  // }`;

  // Redirect to /pulse?chain=X if no chain parameter is present
  // Use saved chain from localStorage, or default to sol
  useEffect(() => {
    if (router.isReady && !router.query.chain) {
      const savedChain =
        typeof window !== "undefined"
          ? localStorage.getItem("selected-chain")
          : null;
      const chainToUse =
        savedChain === "sol" || savedChain === "monad" ? savedChain : "sol";
      router.replace(`/pulse?chain=${chainToUse}`, undefined, {
        shallow: true,
      });
      setCurrentChain(chainToUse);
    }
  }, [router.isReady, router.query.chain, router]);

  // DISABLED: "Enhanced Real-Time Data" popup - commented out for now
  // Check if updates modal should be shown - only once after login
  // useEffect(() => {
  //   if (typeof window !== "undefined" && user) {
  //     // Use user-specific cookie key so it only shows once per user
  //     // Cookies persist across hard refreshes better than localStorage
  //     const cookieKey = `trenches-updates-viewed-${user.id}`;
  //     const hasViewed = Cookies.get(cookieKey);

  //     // Only show modal if user is logged in AND hasn't viewed it before
  //     // Simple check: if cookie doesn't exist, show modal
  //     if (!hasViewed) {
  //       // Delay to ensure page has loaded
  //       setTimeout(() => {
  //         setShowUpdatesModal(true);
  //       }, 1000);
  //     } else {
  //       // Explicitly set showUpdatesModal to false if cookie exists
  //       setShowUpdatesModal(false);
  //     }
  //   } else {
  //     // If user is not logged in, don't show modal
  //     setShowUpdatesModal(false);
  //   }
  // }, [user]); // Re-run when user changes (login/logout)

  // Keyboard navigation for tabs (mobile only) - MOBILE VIEW DISABLED
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only enable keyboard navigation on mobile devices (when tabs are visible)
      if (window.innerWidth < 1024 && (event.ctrlKey || event.metaKey)) {
        switch (event.key) {
          case "1":
            event.preventDefault();
            setActiveTab("new");
            break;
          case "2":
            event.preventDefault();
            setActiveTab("final-stretch");
            break;
          case "3":
            event.preventDefault();
            setActiveTab("migrated");
            break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // React Query client for manual cache updates from WebSocket
  const queryClient = useQueryClient();

  // React Query hooks - instant cache
  // CRITICAL: Only enable Solana data fetching when NOT on Monad route
  // This prevents Solana data from loading when on Monad chain
  // Wait for router to be ready before determining which chain we're on
  const shouldFetchSolanaData = router.isReady && !isMonadRoute;

  const {
    data: tokens = [],
    isLoading: tokensLoading,
    error: tokensError,
    isStale: tokensStale,
    refetch: refreshTokens,
    dataUpdatedAt,
    isFetching,
  } = useQueryNewPairs(shouldFetchSolanaData);

  const {
    data: launchpadData = { new: [], completing: [], completed: [] },
    isLoading: launchpadLoading,
    error: launchpadError,
    isStale: launchpadStale,
    refetch: refreshLaunchpadData,
  } = useQueryLaunchpadData(shouldFetchSolanaData);

  const { data: finalStretchTokensQuery = [] } = useQueryFinalStretch(
    shouldFetchSolanaData,
  );

  const { data: migratedTokensQuery = [] } = useQueryMigrated(
    shouldFetchSolanaData,
  );

  // ✅ REAL-TIME WEBSOCKET: Handled by PulseBackgroundLoader in _app.tsx
  // PulseBackgroundLoader maintains WebSocket connections and updates React Query cache
  // This provides data persistence across page navigation

  // State for HTTP polling data - no localStorage caching for fresh data always
  const [httpNew, setHttpNew] = useState<any[]>([]);
  const [httpNewTick, setHttpNewTick] = useState(0);
  const [httpMigrated, setHttpMigrated] = useState<any[]>([]);
  const [httpMigratedTick, setHttpMigratedTick] = useState(0);
  // Zero liquidity filter disabled - let all tokens through
  const isZeroLiquidityToken = useCallback((_token: any) => {
    return false;
  }, []);

  const [httpFinalStretch, setHttpFinalStretch] = useState<any[]>([]);
  const [httpFinalStretchTick, setHttpFinalStretchTick] = useState(0);

  // Monad-specific state for all three tabs (with localStorage caching)
  const [monadNew, setMonadNew] = useState<any[]>(() => {
    // Initialize with cached data immediately to prevent flash
    try {
      const cached = localStorage.getItem("cached_monad_new_tokens");
      if (cached) {
        const parsed = JSON.parse(cached);
        const now = Date.now();
        if (now < parsed.expiresAt) {
          return parsed.data || [];
        }
      }
    } catch (error) {
      console.warn("Failed to load cached Monad new tokens on init:", error);
    }
    return [];
  });
  const [monadNewTick, setMonadNewTick] = useState(0);
  const [monadFinalStretch, setMonadFinalStretch] = useState<any[]>(() => {
    // Initialize with cached data immediately to prevent flash
    try {
      const cached = localStorage.getItem("cached_monad_final_stretch_tokens");
      if (cached) {
        const parsed = JSON.parse(cached);
        const now = Date.now();
        if (now < parsed.expiresAt) {
          return parsed.data || [];
        }
      }
    } catch (error) {
      console.warn(
        "Failed to load cached Monad final stretch tokens on init:",
        error,
      );
    }
    return [];
  });
  const [monadFinalStretchTick, setMonadFinalStretchTick] = useState(0);
  const [monadMigrated, setMonadMigrated] = useState<any[]>(() => {
    // Initialize with cached data immediately to prevent flash
    try {
      const cached = localStorage.getItem("cached_monad_migrated_tokens");
      if (cached) {
        const parsed = JSON.parse(cached);
        const now = Date.now();
        if (now < parsed.expiresAt) {
          return parsed.data || [];
        }
      }
    } catch (error) {
      console.warn(
        "Failed to load cached Monad migrated tokens on init:",
        error,
      );
    }
    return [];
  });
  const [monadMigratedTick, setMonadMigratedTick] = useState(0);

  // Function to fetch token image from backend
  const fetchTokenImage = useCallback(
    async (mint: string, name: string, symbol: string) => {
      try {
        console.log(`[Pulse] 🖼️ Fetching image for ${name} (${symbol})`);

        // Try to get image from backend API
        const response = await fetch(
          `/api/token-service/getTokenImage?mint=${mint}&name=${encodeURIComponent(name)}&symbol=${encodeURIComponent(symbol)}`,
        );
        if (response.ok) {
          const data = await response.json();
          if (data.image) {
            console.log(`[Pulse] 🖼️ Found image for ${name}:`, data.image);
            // Update the token in httpNew with the new image
            setHttpNew((prev) =>
              prev.map((token) =>
                token.mint === mint
                  ? {
                      ...token,
                      logo: data.image,
                      image: data.image,
                      uri: data.uri,
                    }
                  : token,
              ),
            );
          }
        }
      } catch (error) {
        console.log(`[Pulse] 🖼️ Failed to fetch image for ${name}:`, error);
      }
    },
    [],
  );

  // DISABLED: WebSocket hook for real-time token updates (token service doesn't have WebSocket endpoint)
  // const { data: newPairsTokens, loading: wsLoading } = usePaginatedTokensWebSocket({ filter: 'new', limit: 30 });
  // Use HTTP API instead
  const newPairsTokens: any[] = [];
  const wsLoading = false;

  // REMOVED: Centralized WebSocket logic (kept commented out)

  // Immediate poll on mount for Final Stretch tokens (just like New Pairs)
  useEffect(() => {
    const immediatePoll = async () => {
      try {
        // Call backend directly (bypasses proxy for Redis cache benefits)
        let apiUrl: string;
        if (isMonadRoute) {
          const monadServiceUrl =
            process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL!;
          apiUrl = `${monadServiceUrl}/v1/pulse/final-stretch?limit=35`;
        } else {
          // COMMENTED OUT: PulseTable is disabled, so Solana API calls are disabled
          // apiUrl = `/api/token-service/pulse-final-stretch?limit=50&t=${Date.now()}`;
          return; // Skip Solana route
        }

        const res = await fetch(apiUrl, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
            Accept: "application/json",
          },
        });
        if (res.ok) {
          const result = await res.json();
          // Backend returns { status: "success", count: N, data: [...] }
          const data = result.data || (Array.isArray(result) ? result : []);
          if (Array.isArray(data) && data.length > 0) {
            const filteredData = (data as any[]).filter((token) => {
              if (isZeroLiquidityToken(token)) {
                console.log(
                  "[Final Stretch] ⛔ Skipping token with zero liquidity from immediate poll:",
                  token?.name,
                  token?.mint,
                );
                return false;
              }
              return true;
            });

            if (filteredData.length === 0) {
              console.log(
                "[Final Stretch] ⚠️ All tokens filtered due to zero liquidity. Clearing final stretch list.",
              );
              if (isMonadRoute) {
                setMonadFinalStretch([]);
                setMonadFinalStretchTick((t) => t + 1);
              } else {
                setHttpFinalStretch([]);
                setHttpFinalStretchTick((t) => t + 1);
              }
              return;
            }

            if (isMonadRoute) {
              setMonadFinalStretch(filteredData as any[]);
              setMonadFinalStretchTick((t) => t + 1);
              console.log(
                `[Final Stretch Monad] Immediate poll got ${filteredData.length} tokens (after filtering)`,
              );
            } else {
              setHttpFinalStretch(filteredData as any[]);
              setHttpFinalStretchTick((t) => t + 1);
              console.log(
                `[Final Stretch] Immediate poll got ${filteredData.length} tokens (after filtering)`,
              );
            }
          }
        }
      } catch (error) {
        console.log("[Final Stretch] Immediate poll failed:", error);
      }
    };

    immediatePoll();
  }, [isMonadRoute]);

  // Fetch Monad data when chain is monad (with localStorage caching)
  useEffect(() => {
    if (!isMonadRoute) {
      // Don't clear Monad data when switching away - keep it cached for faster return
      // Only clear ticks to indicate data might be stale
      setMonadNewTick(0);
      setMonadFinalStretchTick(0);
      setMonadMigratedTick(0);
      return;
    }

    // Load from cache first (already done in useState initializer, but check if we need to fetch)
    const loadFromCache = () => {
      let hasValidCache = false;

      try {
        const newCached = localStorage.getItem("cached_monad_new_tokens");
        const finalStretchCached = localStorage.getItem(
          "cached_monad_final_stretch_tokens",
        );
        const migratedCached = localStorage.getItem(
          "cached_monad_migrated_tokens",
        );

        const now = Date.now();

        if (newCached) {
          const parsed = JSON.parse(newCached);
          if (now < parsed.expiresAt && parsed.data && parsed.data.length > 0) {
            setMonadNew(parsed.data);
            hasValidCache = true;
          }
        }

        if (finalStretchCached) {
          const parsed = JSON.parse(finalStretchCached);
          if (now < parsed.expiresAt && parsed.data && parsed.data.length > 0) {
            setMonadFinalStretch(parsed.data);
            hasValidCache = true;
          }
        }

        if (migratedCached) {
          const parsed = JSON.parse(migratedCached);
          if (now < parsed.expiresAt && parsed.data && parsed.data.length > 0) {
            setMonadMigrated(parsed.data);
            hasValidCache = true;
          }
        }
      } catch (error) {
        console.warn("[Monad] Failed to load from cache:", error);
      }

      return hasValidCache;
    };

    const cacheValid = loadFromCache();

    console.log(
      "[Pulse] 🌊 Fetching Monad data for chain=monad",
      cacheValid
        ? "(cache valid, refreshing in background)"
        : "(no cache, fetching now)",
    );

    const fetchMonadData = async () => {
      try {
        const monadServiceUrl =
          process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL!;
        const now = Date.now();
        const cacheTTL = 5 * 60 * 1000; // 5 minutes

        // Fetch new pairs - call backend directly (Redis cache enabled)
        console.log("[Monad] Fetching new pairs directly from backend...");
        const newRes = await fetch(`${monadServiceUrl}/v1/pulse/new?limit=35`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (newRes.ok) {
          const result = await newRes.json();
          const newData = result.data || (Array.isArray(result) ? result : []);
          // Transform backend response: map 'address' to 'mint' for frontend compatibility
          const transformed = Array.isArray(newData)
            ? newData.map((t: any) => ({
                ...t,
                mint: t.address || t.mint, // Backend uses 'address', frontend expects 'mint'
              }))
            : [];
          const filteredNew = transformed.filter(
            (t: any) => !isZeroLiquidityToken(t),
          );
          setMonadNew(filteredNew);
          setMonadNewTick((prev) => prev + 1);

          // Cache the fresh data
          try {
            localStorage.setItem(
              "cached_monad_new_tokens",
              JSON.stringify({
                data: filteredNew,
                timestamp: now,
                expiresAt: now + cacheTTL,
              }),
            );
          } catch (error) {
            console.warn("[Monad] Failed to cache new tokens:", error);
          }

          console.log(
            `[Monad] ✅ Fetched ${filteredNew.length} new tokens from backend (Redis cache)`,
          );
        } else {
          console.error(
            `[Monad] ❌ Failed to fetch new pairs: ${newRes.status}`,
          );
        }

        // Fetch final stretch tokens - call backend directly (Redis cache enabled)
        console.log(
          "[Monad] Fetching final stretch tokens directly from backend...",
        );
        const finalStretchRes = await fetch(
          `${monadServiceUrl}/v1/pulse/final-stretch?limit=35`,
          {
            cache: "no-store",
            headers: { Accept: "application/json" },
          },
        );
        if (finalStretchRes.ok) {
          const result = await finalStretchRes.json();
          const finalStretchData =
            result.data || (Array.isArray(result) ? result : []);
          // Transform backend response: map 'address' to 'mint' for frontend compatibility
          const transformed = Array.isArray(finalStretchData)
            ? finalStretchData.map((t: any) => ({
                ...t,
                mint: t.address || t.mint, // Backend uses 'address', frontend expects 'mint'
              }))
            : [];
          const filteredFinalStretch = transformed.filter(
            (t: any) => !isZeroLiquidityToken(t),
          );
          setMonadFinalStretch(filteredFinalStretch);
          setMonadFinalStretchTick((prev) => prev + 1);

          // Cache the fresh data
          try {
            localStorage.setItem(
              "cached_monad_final_stretch_tokens",
              JSON.stringify({
                data: filteredFinalStretch,
                timestamp: now,
                expiresAt: now + cacheTTL,
              }),
            );
          } catch (error) {
            console.warn(
              "[Monad] Failed to cache final stretch tokens:",
              error,
            );
          }

          console.log(
            `[Monad] ✅ Fetched ${filteredFinalStretch.length} final stretch tokens from backend (Redis cache)`,
          );
        }

        // Fetch migrated tokens - call backend directly (Redis cache enabled)
        console.log(
          "[Monad] Fetching migrated tokens directly from backend...",
        );
        const migratedRes = await fetch(
          `${monadServiceUrl}/v1/pulse/migrated?limit=35`,
          {
            cache: "no-store",
            headers: { Accept: "application/json" },
          },
        );
        if (migratedRes.ok) {
          const result = await migratedRes.json();
          const migratedData =
            result.data || (Array.isArray(result) ? result : []);
          // Transform backend response: map 'address' to 'mint' for frontend compatibility
          const transformed = Array.isArray(migratedData)
            ? migratedData.map((t: any) => ({
                ...t,
                mint: t.address || t.mint, // Backend uses 'address', frontend expects 'mint'
              }))
            : [];
          const filteredMigrated = transformed.filter(
            (t: any) => !isZeroLiquidityToken(t),
          );
          setMonadMigrated(filteredMigrated);
          setMonadMigratedTick((prev) => prev + 1);

          // Cache the fresh data
          try {
            localStorage.setItem(
              "cached_monad_migrated_tokens",
              JSON.stringify({
                data: filteredMigrated,
                timestamp: now,
                expiresAt: now + cacheTTL,
              }),
            );
          } catch (error) {
            console.warn("[Monad] Failed to cache migrated tokens:", error);
          }

          console.log(
            `[Monad] ✅ Fetched ${filteredMigrated.length} migrated tokens from backend (Redis cache)`,
          );
        } else {
          console.error(
            `[Monad] ❌ Failed to fetch migrated tokens: ${migratedRes.status}`,
          );
        }
      } catch (error) {
        console.error("[Monad] ❌ Failed to fetch Monad data:", error);
      }
    };

    // Always fetch fresh data, but cache will show immediately if available
    fetchMonadData();
  }, [isMonadRoute, isZeroLiquidityToken, chain]);

  // Convert launchpad tokens to Token format for PulseTable
  const convertLaunchpadToToken = useCallback(
    (launchpadToken: LaunchpadToken): Token =>
      ({
        id: 0,
        mint: launchpadToken.mint,
        standard: "SPL",
        name: launchpadToken.name || "Unknown",
        symbol: launchpadToken.symbol || "UNK",
        // Preserve all image fields so extractTokenImage can find them
        logo: launchpadToken.image || "",
        decimals: 6,
        metaplex: null,
        fully_diluted_value: launchpadToken.marketCapUsd,
        total_supply: 0,
        total_supply_formatted: 0,
        links: null,
        description: "",
        is_verified_contract: false,
        possible_spam: false,
        total_buy_volume_5m: 0,
        total_buy_volume_1h: 0,
        total_buy_volume_6h: 0,
        total_buy_volume_24h: launchpadToken.volume24h,
        total_sell_volume_5m: 0,
        total_sell_volume_1h: 0,
        total_sell_volume_6h: 0,
        total_sell_volume_24h: 0,
        total_buyers_5m: 0,
        total_buyers_1h: 0,
        total_buyers_6h: 0,
        total_buyers_24h: 0,
        total_sellers_5m: 0,
        total_sellers_1h: 0,
        total_sellers_6h: 0,
        total_sellers_24h: 0,
        total_buys_5m: 0,
        total_buys_1h: 0,
        total_buys_6h: 0,
        total_buys_24h: 0,
        total_sells_5m: 0,
        total_sells_1h: 0,
        total_sells_6h: 0,
        total_sells_24h: 0,
        unique_wallets_5m: 0,
        unique_wallets_1h: 0,
        unique_wallets_6h: 0,
        unique_wallets_24h: 0,
        price_percent_change_5m: 0,
        price_percent_change_1h: 0,
        price_percent_change_6h: 0,
        price_percent_change_24h: launchpadToken.priceChange24h,
        sol_price: 0,
        usd_price: launchpadToken.priceUsd,
        total_liquidity_usd: launchpadToken.marketCapUsd,
        total_fully_diluted_valuation: launchpadToken.marketCapUsd,
        total_snipers: 0,
        pair_address: launchpadToken.mint,
        total_holders: 0,
        created_at: launchpadToken.createdAt,
        updated_at: launchpadToken.createdAt,
        bonding_curve_progress: launchpadToken.graduationPercent, // Already in percentage format
        // Preserve image in multiple fields so extractTokenImage can find it
        uri: launchpadToken.image || null,
        // extra field used by PulseTable TokenImage for DB logos
        image: launchpadToken.image || null,
      }) as any,
    [],
  );

  // Segregate regular tokens (stable refs)
  // Note: bonding_curve_progress is in percentage format (0-100), not decimal (0-1)
  const newPairs = useMemo(
    () =>
      tokens.filter((t) => {
        const v =
          typeof t.bonding_curve_progress === "string"
            ? parseFloat(t.bonding_curve_progress)
            : (t.bonding_curve_progress as number);
        const prog = isFinite(v as number) ? Number(v) : 0;
        return prog < 60; // Changed from 0.6 to 60 (percentage format)
      }),
    [tokens],
  );
  const finalStretch = useMemo(
    () =>
      tokens.filter((t) => {
        const v =
          typeof t.bonding_curve_progress === "string"
            ? parseFloat(t.bonding_curve_progress)
            : (t.bonding_curve_progress as number);
        const prog = isFinite(v as number) ? Number(v) : 0;
        return prog >= 60 && prog < 85; // Changed from 0.6/0.85 to 60/85 (percentage format)
      }),
    [tokens],
  );
  const migrated = useMemo(
    () =>
      tokens.filter((t) => {
        const v =
          typeof t.bonding_curve_progress === "string"
            ? parseFloat(t.bonding_curve_progress)
            : (t.bonding_curve_progress as number);
        const prog = isFinite(v as number) ? Number(v) : 0;
        return prog >= 85; // Changed from 0.85 to 85 (percentage format)
      }),
    [tokens],
  );

  // Convert and combine launchpad tokens (stable refs)
  const launchpadNewPairs = useMemo(
    () => launchpadData?.new?.map(convertLaunchpadToToken) || [],
    [launchpadData?.new, convertLaunchpadToToken],
  );
  const launchpadFinalStretch = useMemo(
    () => launchpadData?.completing?.map(convertLaunchpadToToken) || [],
    [launchpadData?.completing, convertLaunchpadToToken],
  );
  const launchpadMigrated = useMemo(
    () => launchpadData?.completed?.map(convertLaunchpadToToken) || [],
    [launchpadData?.completed, convertLaunchpadToToken],
  );

  // Combine regular tokens with launchpad tokens and HTTP tokens (stable refs)
  const combinedNewPairs = useMemo(
    () => [...newPairs, ...launchpadNewPairs],
    [newPairs, launchpadNewPairs],
  );
  // Use HTTP polling data for Final Stretch and Migrated columns
  const combinedFinalStretch = useMemo(() => [...finalStretch], [finalStretch]);
  const combinedMigrated = useMemo(() => [...migrated], [migrated]);

  // Memoize the loading state to prevent unnecessary re-renders
  // For Monad route, check Monad data; for Solana route, check Solana data
  // NOTE: PulseTable handles its own data from WebSocket/IndexedDB cache internally
  // So we only show loading if HTTP data hasn't arrived yet
  // PulseTable will show cached data even while HTTP is loading
  const isLoading = useMemo(() => {
    if (isMonadRoute) {
      // For Monad, check if Monad data is loaded
      return monadNew.length === 0 && monadNewTick === 0;
    }
    // For Solana: Only show loading on very first load when no HTTP data exists
    // After first load, HTTP data is cached by React Query
    return !tokens.length && !launchpadData?.new?.length && !httpNew.length;
  }, [
    isMonadRoute,
    tokens.length,
    launchpadData?.new?.length,
    httpNew.length,
    monadNew.length,
    monadNewTick,
  ]);

  const newPairsLoading = isLoading;

  const hasError = useMemo(() => {
    return (
      launchpadError &&
      !(launchpadData?.new?.length || 0) &&
      !(launchpadData?.completing?.length || 0) &&
      !(launchpadData?.completed?.length || 0)
    );
  }, [
    launchpadError,
    launchpadData?.new?.length,
    launchpadData?.completing?.length,
    launchpadData?.completed?.length,
  ]);

  // Enrich WS new pairs with created_at/image from known sources when available
  const wsNewRaw: any[] = Array.isArray(newPairsTokens)
    ? (newPairsTokens as any[])
    : [];
  const wsNewEnriched = useMemo(() => {
    const byAddr = new Map<string, any>();
    const pushMap = (arr: any[]) =>
      arr.forEach((t) => {
        const a = (t as any)?.pair_address || (t as any)?.mint;
        if (a && !byAddr.has(a)) byAddr.set(a, t);
      });
    pushMap(tokens as any[]);
    pushMap(launchpadNewPairs as any[]);
    pushMap(launchpadFinalStretch as any[]);
    pushMap(launchpadMigrated as any[]);
    return wsNewRaw.map((t) => {
      const a = (t as any)?.pair_address || (t as any)?.mint;
      const src = a ? byAddr.get(a) : undefined;
      // Extract image from token or source, checking multiple possible field names
      // Preserve original fields if extraction fails
      const extractedImage =
        extractTokenImage(t as any) || extractTokenImage(src);
      return {
        ...t,
        // Prefer existing created fields on WS object, else borrow from source maps
        created_at:
          (t as any).created_at ||
          (t as any).createdAt ||
          src?.created_at ||
          src?.createdAt ||
          (t as any).timestamp ||
          undefined,
        launch_time:
          (t as any).launch_time ||
          (t as any).launchTime ||
          src?.launch_time ||
          src?.launchTime ||
          undefined,
        // Only override image/logo if extraction found something, otherwise preserve original
        image: extractedImage || (t as any).image || src?.image || undefined,
        logo: extractedImage || (t as any).logo || src?.logo || undefined,
        uri: extractedImage || (t as any).uri || src?.uri || undefined,
      };
    });
  }, [
    wsNewRaw,
    tokens,
    launchpadNewPairs,
    launchpadFinalStretch,
    launchpadMigrated,
  ]);

  // Helpers to compute timestamps
  const getTs = (t: any): number => {
    // For migrated tokens, prioritize migrated_time over launch_time
    let v: any =
      t?.migrated_time ??
      t?.migratedTime ??
      t?.launch_time ??
      t?.launchTime ??
      t?.created_at ??
      t?.createdAt ??
      t?.firstSeen ??
      t?.first_seen ??
      t?.pair_created_at ??
      t?.pairCreatedAt ??
      t?.timestamp ??
      t?.ts ??
      null;
    // Handle nested objects like { Time: "..." } or { seconds: 1234567890 }
    if (v && typeof v === "object") {
      if ("Time" in v && typeof v.Time === "string") v = v.Time;
      else if ("time" in v && typeof (v as any).time === "string")
        v = (v as any).time;
      else if ("seconds" in v && typeof (v as any).seconds === "number") {
        const sec = Number((v as any).seconds);
        return sec > 1e12 ? sec : sec > 1e9 ? sec * 1000 : 0;
      } else if ("millis" in v && typeof (v as any).millis === "number") {
        const ms = Number((v as any).millis);
        return ms > 0 ? ms : 0;
      }
    }
    if (!v) return 0;
    if (typeof v === "number") return v > 1e12 ? v : v > 1e9 ? v * 1000 : 0;
    if (typeof v === "string") {
      const n = Number(v);
      if (!Number.isNaN(n) && n > 0)
        return n > 1e12 ? n : n > 1e9 ? n * 1000 : 0;
      const d = Date.parse(v);
      return Number.isNaN(d) ? 0 : d;
    }
    if (v instanceof Date) return v.getTime();
    return 0;
  };

  const buildNewPairs = (): any[] => {
    // NOTE: For Monad route, we bypass this function and use monadNew directly in enrichedNewPairsToShow
    // This function is only used for Solana route

    // For Solana route, use existing logic
    const source = wsNewEnriched.length ? wsNewEnriched : combinedNewPairs;

    const uniq = new Map<string, any>();
    for (const t of source as any[]) {
      // Try multiple field names for mint/pair address
      const key = (t?.pair_address || t?.mint || t?.mint_address) as
        | string
        | undefined;
      if (!key || uniq.has(key)) continue;
      uniq.set(key, t);
    }
    const vals = Array.from(uniq.values()).filter(
      (token) => !isZeroLiquidityToken(token),
    );
    if (vals.length === 0)
      return combinedNewPairs
        .filter((token) => !isZeroLiquidityToken(token))
        .slice(0, 35);

    // Cache timestamps to avoid repeated Date parsing
    const tsCache = new Map<any, number>();
    const getOrCacheTs = (t: any) => {
      if (!tsCache.has(t)) tsCache.set(t, getTs(t));
      return tsCache.get(t)!;
    };

    const withTs: any[] = [];
    const withoutTs: any[] = [];
    for (const t of vals) {
      (getOrCacheTs(t) > 0 ? withTs : withoutTs).push(t);
    }

    withTs.sort((a, b) => getOrCacheTs(b) - getOrCacheTs(a));
    if (withoutTs.length > 0) {
      withoutTs.sort((a, b) => {
        const diff =
          (Number((b as any).fully_diluted_value) || 0) -
          (Number((a as any).fully_diluted_value) || 0);
        if (diff !== 0) return diff;
        const aName = (a as any).symbol || (a as any).name || "";
        const bName = (b as any).symbol || (b as any).name || "";
        return aName < bName ? -1 : aName > bName ? 1 : 0;
      });
    }

    const result = withTs.length > 0 ? withTs.concat(withoutTs) : withoutTs;
    // Limit to 35 tokens to match Monad table limit
    return result.slice(0, 35);
  };

  const buildMigrated = (): any[] => {
    // NOTE: For Monad route, we bypass this function and use monadMigrated directly in enrichedMigrated
    // This function is only used for Solana route

    // For Solana route, use existing logic
    const source = migratedTokensQuery;
    if (!Array.isArray(source) || source.length === 0) return [];

    const filteredSource = source.filter(
      (token: any) => !isZeroLiquidityToken(token),
    );
    if (filteredSource.length === 0) return [];

    const tsCache = new Map<any, number>();
    const getOrCacheTs = (t: any) => {
      if (!tsCache.has(t)) tsCache.set(t, getTs(t));
      return tsCache.get(t)!;
    };

    const withTs: any[] = [];
    const withoutTs: any[] = [];
    for (const t of filteredSource) {
      (getOrCacheTs(t) > 0 ? withTs : withoutTs).push(t);
    }

    withTs.sort((a, b) => getOrCacheTs(b) - getOrCacheTs(a));
    if (withoutTs.length > 0) {
      withoutTs.sort((a, b) => {
        const diff =
          (Number((b as any).fully_diluted_value) || 0) -
          (Number((a as any).fully_diluted_value) || 0);
        if (diff !== 0) return diff;
        const aName = (a as any).symbol || (a as any).name || "";
        const bName = (b as any).symbol || (b as any).name || "";
        return aName < bName ? -1 : aName > bName ? 1 : 0;
      });
    }

    return withTs.length > 0 ? withTs.concat(withoutTs) : withoutTs;
  };

  const buildFinalStretch = (): any[] => {
    // NOTE: For Monad route, we bypass this function and use monadFinalStretch directly in enrichedFinalStretch
    // This function is only used for Solana route

    // For Solana route, use existing logic
    const source = finalStretchTokensQuery;
    if (!Array.isArray(source) || source.length === 0) return [];

    const filteredSource = source.filter(
      (token: any) => !isZeroLiquidityToken(token),
    );
    if (filteredSource.length === 0) return [];

    const tsCache = new Map<any, number>();
    const getOrCacheTs = (t: any) => {
      if (!tsCache.has(t)) tsCache.set(t, getTs(t));
      return tsCache.get(t)!;
    };

    const withTs: any[] = [];
    const withoutTs: any[] = [];
    for (const t of filteredSource) {
      (getOrCacheTs(t) > 0 ? withTs : withoutTs).push(t);
    }

    withTs.sort((a, b) => getOrCacheTs(b) - getOrCacheTs(a));
    if (withoutTs.length > 0) {
      withoutTs.sort((a, b) => {
        const diff =
          (Number((b as any).fully_diluted_value) || 0) -
          (Number((a as any).fully_diluted_value) || 0);
        if (diff !== 0) return diff;
        const aName = (a as any).symbol || (a as any).name || "";
        const bName = (b as any).symbol || (b as any).name || "";
        return aName < bName ? -1 : aName > bName ? 1 : 0;
      });
    }

    return withTs.length > 0 ? withTs.concat(withoutTs) : withoutTs;
  };

  // Use the processed data from build functions (single definitions)
  // Include all dependencies - React will handle the conditional logic
  const newPairsToShow = useMemo(
    () => buildNewPairs(),
    [
      isMonadRoute,
      monadNew,
      monadNewTick,
      combinedNewPairs,
      wsNewEnriched,
      isZeroLiquidityToken,
    ],
  );
  const migratedToShow = useMemo(
    () => buildMigrated(),
    [
      isMonadRoute,
      monadMigrated,
      monadMigratedTick,
      migratedTokensQuery,
      isZeroLiquidityToken,
    ],
  );
  const finalStretchToShow = useMemo(
    () => buildFinalStretch(),
    [
      isMonadRoute,
      monadFinalStretch,
      monadFinalStretchTick,
      finalStretchTokensQuery,
      isZeroLiquidityToken,
    ],
  );

  // Track httpNew changes for debugging
  useEffect(() => {
    // Optional: Add minimal logging if needed for debugging
  }, [httpNew]);

  // Track websocket connection status (from PulseBackgroundLoader via pulseStore)
  const wsPulseConnected = pulseStore.isBackgroundLoaderActive();
  const wsPulseError = null; // Errors handled by PulseBackgroundLoader

  // Track tick values for debugging
  useEffect(() => {
    // Optional: Add minimal logging if needed for debugging
  }, [httpNewTick, httpMigratedTick, httpFinalStretchTick]);

  // DISABLED: Image search - images should only come from JSON response
  // const priorityImageSearcher = useRef(new PriorityImageSearcher());
  const { preloadImages } = useImagePreloader();

  useEffect(() => {
    if (newPairsToShow && newPairsToShow.length > 0) {
      const imageSources = newPairsToShow
        .slice(0, 20)
        .map((token: any) => extractTokenImage(token))
        .filter(Boolean);

      if (imageSources.length > 0) {
        preloadImages(imageSources, { priority: true, timeout: 2000 });
      }
    }
  }, [newPairsToShow, preloadImages]);

  // Sync rolling trade cache with visible pulse tokens (debounced to prevent excessive requests)
  // CRITICAL: Only sync cache for Solana route - Monad tokens use different service
  // COMMENTED OUT: Testing without rolling cache
  // useEffect(() => {
  //   // Skip cache sync for Monad route - Monad tokens use different trade service
  //   if (isMonadRoute) {
  //     return;
  //   }

  //   // Debounce sync calls to prevent rapid-fire requests
  //   const syncTimeoutId = setTimeout(async () => {
  //     try {
  //       if (
  //         !newPairsToShow.length &&
  //         !finalStretchToShow.length &&
  //         !migratedToShow.length
  //       )
  //         return;

  //       await rollingTradeCache.syncWithPulseTokens(
  //         newPairsToShow.slice(0, 30),
  //         finalStretchToShow.slice(0, 30),
  //         migratedToShow.slice(0, 30),
  //       );
  //     } catch (error) {
  //       console.error("[Pulse] Failed to sync rolling cache:", error);
  //     }
  //   }, 2000); // Debounce: Wait 2 seconds after tokens change before syncing

  //   return () => clearTimeout(syncTimeoutId);
  // }, [newPairsToShow, finalStretchToShow, migratedToShow, isMonadRoute]);

  // Log cache stats periodically for debugging
  // COMMENTED OUT: Testing without rolling cache
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     const stats = rollingTradeCache.getStats();
  //     console.log(
  //       `[RollingCache Stats] ${stats.size}/${stats.maxSize} tokens (${stats.utilization.toFixed(1)}% full)`,
  //     );
  //   }, 60000); // Every 60 seconds

  //   return () => clearInterval(interval);
  // }, []);

  // Alias for debug / legacy variables
  const newPairsData = newPairsToShow;

  // DEBUG: Log the data being passed to UI
  useEffect(() => {
    console.log(
      `[Pulse] 🎯 UI Data - chain: ${chain}, isMonadRoute: ${isMonadRoute}`,
    );
    console.log(
      `[Pulse] 🎯 UI Data - newPairsToShow: ${newPairsToShow.length}, httpNew: ${httpNew.length}, httpNewTick: ${httpNewTick}, monadNew: ${monadNew.length}, monadNewTick: ${monadNewTick}`,
    );
    if (newPairsToShow.length > 0) {
      console.log(
        `[Pulse] 🎯 First token in UI:`,
        newPairsToShow[0]?.name || "none",
        `chain: ${(newPairsToShow[0] as any)?.chain || "unknown"}`,
      );
    }
  }, [
    newPairsToShow,
    httpNew,
    httpNewTick,
    isMonadRoute,
    chain,
    monadNew,
    monadNewTick,
  ]);

  // DEBUG: Log migrated data
  useEffect(() => {
    console.log(
      `[Pulse] 🎯 Migrated UI Data - chain: ${chain}, isMonadRoute: ${isMonadRoute}`,
    );
    console.log(
      `[Pulse] 🎯 Migrated UI Data - migratedToShow: ${migratedToShow.length}, httpMigrated: ${httpMigrated.length}, httpMigratedTick: ${httpMigratedTick}, monadMigrated: ${monadMigrated.length}, monadMigratedTick: ${monadMigratedTick}`,
    );
    if (migratedToShow.length > 0) {
      console.log(
        `[Pulse] 🎯 First migrated token in UI:`,
        migratedToShow[0]?.name || "none",
        `chain: ${(migratedToShow[0] as any)?.chain || "unknown"}`,
      );
    }
  }, [
    migratedToShow,
    httpMigrated,
    httpMigratedTick,
    isMonadRoute,
    chain,
    monadMigrated,
    monadMigratedTick,
  ]);

  // Fetch initial migrated tokens on page load (only for Solana route)
  useEffect(() => {
    if (isMonadRoute) {
      // Monad migrated tokens are already fetched in the Monad data effect above
      return;
    }

    const fetchInitialMigratedTokens = async () => {
      try {
        console.log(`[Pulse] 🔄 Fetching initial migrated tokens...`);
        // Use Next.js proxy to avoid CORS issues
        const endpoint = `/api/token-service/pulse-migrated?limit=70`;
        console.log(`[Pulse] 🔄 URL:`, endpoint);
        console.log(`[Pulse] 🔄 Chain: Solana`);
        const response = await fetch(endpoint, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        });
        console.log(`[Pulse] 🔄 Response status:`, response.status);
        if (response.ok) {
          const data = await response.json();
          console.log(
            `[Pulse] 🔄 Fetched ${data.length} migrated tokens from API`,
          );
          if (data.length > 0) {
            const filteredData = data.filter((token: any) => {
              if (!token) return false;

              if (isZeroLiquidityToken(token)) {
                console.log(
                  "[Pulse] ⛔ Skipping migrated token with zero liquidity:",
                  token?.name,
                  token?.mint,
                );
                return false;
              }

              return true;
            });

            if (filteredData.length === 0) {
              console.log(
                "[Pulse] ⚠️ All migrated tokens filtered due to zero liquidity. Clearing migrated list.",
              );
              setHttpMigrated([]);
              setHttpMigratedTick((prev) => prev + 1);
              return;
            }

            // Add timestamp to each token for proper sorting
            const tokensWithTimestamp = filteredData.map((token: any) => ({
              ...token,
              created_at: token.migrated_time || new Date().toISOString(),
              timestamp: Date.now(),
            }));
            console.log(
              `[Pulse] 🔄 BEFORE setHttpMigrated - current count: ${httpMigrated.length}`,
            );
            setHttpMigrated(tokensWithTimestamp);
            setHttpMigratedTick((prev) => prev + 1);
            console.log(
              `[Pulse] 🔄 Set initial migrated tokens:`,
              tokensWithTimestamp.map((t) => t.name),
            );
            console.log(
              `[Pulse] 🔄 AFTER setHttpMigrated - should be ${tokensWithTimestamp.length} tokens`,
            );
          }
        } else {
          console.error(
            `[Pulse] ❌ HTTP error:`,
            response.status,
            response.statusText,
          );
        }
      } catch (error) {
        console.error(
          `[Pulse] ❌ Failed to fetch initial migrated tokens:`,
          error,
        );
      }
    };

    fetchInitialMigratedTokens();
  }, [isMonadRoute]); // Re-run when chain changes

  // Debug: log top entries order and timestamps (after data is computed)
  if (typeof window !== "undefined") {
    try {
      const sample = (newPairsData || []).slice(0, 10).map((t: any) => ({
        addr: t.pair_address || t.mint,
        ts: getTs(t),
        created_at:
          t.created_at || t.createdAt || t.launch_time || t.launchTime,
        firstSeen: t.firstSeen,
        updated_at: t.updated_at || t.updatedAt,
        name: t.name,
        symbol: t.symbol,
      }));
      console.log("[Pulse] NewPairs top10 with timestamps:", sample);
    } catch {}
  }
  const newPairsFallback = newPairsData;
  // Show loading until at least one source has tried and no data yet
  // (kept for compatibility, but wsLoading is currently false)
  // const newPairsLoadingLegacy = (httpNewTick === 0 && wsLoading && newPairsData.length === 0);

  // Build a unified list of addresses to fetch realtime market data for (cap 200)
  const realtimeAddrs = useMemo(() => {
    const src: any[] = [
      ...((newPairsToShow as any[]) || []),
      ...((finalStretchToShow as any[]) || []),
      ...((migratedToShow as any[]) || []),
    ];
    const uniq = new Set<string>();
    for (const t of src) {
      const mint = (t as any)?.mint;
      const pair = (t as any)?.pair_address;
      if (mint && typeof mint === "string") uniq.add(mint);
      if (pair && typeof pair === "string") uniq.add(pair);
      if (uniq.size >= 200) break;
    }
    return Array.from(uniq);
  }, [newPairsToShow, finalStretchToShow, migratedToShow]);

  const {
    marketData,
    connected: wsConnected,
    error: wsError,
  } = useRealtimeWebSocket(realtimeAddrs, {
    url: `${env.NEXT_PUBLIC_WEBSOCKET_URL.replace(/^http/, "ws")}/v1/ws/market-data`,
    reconnectInterval: 1000, // Faster reconnection for better real-time updates
    maxReconnectAttempts: 20, // More attempts for better reliability
  });

  const enrichWithMarketData = useCallback(
    (arr: any[]): any[] => {
      if (!arr || arr.length === 0) return arr;

      return arr.map((t: any) => {
        const mintKey = t?.mint as string | undefined;
        const pairKey = t?.pair_address as string | undefined;
        const md =
          (mintKey && marketData[mintKey]) || (pairKey && marketData[pairKey]);

        if (!md) return t;

        // Only create new object if market data has actually changed
        const hasChanges =
          t.price_usd !== md.price_usd ||
          t.usd_price !== md.price_usd ||
          t.market_cap_usd !== md.market_cap_usd ||
          t.fully_diluted_value !== md.market_cap_usd ||
          t.volume_24h !== (md as any).volume_usd;

        if (!hasChanges) return t;

        const patched: any = { ...t };
        // Always prefer realtime market data regardless of DB values
        patched.price_usd = md.price_usd;
        patched.usd_price = md.price_usd;
        patched.market_cap_usd = md.market_cap_usd;
        patched.fully_diluted_value = md.market_cap_usd;
        patched.total_fully_diluted_valuation = md.market_cap_usd;
        if ((md as any).volume_usd !== undefined) {
          patched.volume_24h = (md as any).volume_usd;
        }
        return patched;
      });
    },
    [marketData],
  );

  // For Monad route, ONLY use Monad data - never Solana data
  // For Solana route, use the regular build function results
  const enrichedNewPairsToShow = isMonadRoute ? monadNew : newPairsToShow;
  const enrichedFinalStretch = isMonadRoute
    ? monadFinalStretch
    : finalStretchToShow;
  const enrichedMigrated = isMonadRoute ? monadMigrated : migratedToShow;

  // DEBUG: Log what's being passed to MonadTable
  useEffect(() => {
    if (isMonadRoute) {
      console.log(
        `[Pulse] 🌊 Monad Route Active - enrichedNewPairsToShow: ${enrichedNewPairsToShow.length}, enrichedFinalStretch: ${enrichedFinalStretch.length}, enrichedMigrated: ${enrichedMigrated.length}`,
      );
      if (enrichedNewPairsToShow.length > 0) {
        console.log(
          `[Pulse] 🌊 First Monad token in enrichedNewPairsToShow:`,
          enrichedNewPairsToShow[0]?.name || "none",
        );
      }
    }
  }, [
    isMonadRoute,
    enrichedNewPairsToShow,
    enrichedFinalStretch,
    enrichedMigrated,
  ]);

  if (typeof window !== "undefined") {
    try {
      // Lightweight dev diagnostics
      if ((window as any).__DEBUG_PULSE__) {
        console.log(
          `[Pulse] poll addrs=${realtimeAddrs.length} marketKeys=${Object.keys(marketData || {}).length}`,
        );
      }
    } catch {}
  }

  return (
    <>
      <Head>
        <title>Trenches | Interstate Memeboard</title>
        <meta name="description" content="Token tracking dashboard" />
      </Head>
      <div className="flex h-screen flex-col overflow-hidden bg-[#050608] text-neutral-100">
        <div className="relative z-[10000]"><Header /></div>
        <div className="flex-1 min-h-0 p-1 pb-8 sm:p-1.5 sm:pb-8">
          <div className="relative flex h-full flex-col overflow-hidden rounded-t-2xl rounded-b-lg border border-white/[0.06]" style={{ backgroundColor: '#0a0b0d' }}>
            {/* Content */}
            <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col overflow-hidden px-1 pt-3 sm:px-1.5">
          <div className="mb-2">
            <div className="mb-1 flex flex-col gap-3 px-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-medium text-white">Trenches</h1>
                <div className="flex items-center gap-3">
                  <Link
                    href="/pulse?chain=sol"
                    aria-label="View Solana tokens"
                    className={solanaButtonClasses}
                  >
                    <img
                      src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
                      alt="Solana"
                      className="h-6 w-6 rounded-full object-contain mix-blend-screen contrast-[1.2]"
                    />
                  </Link>
                  <Link
                    href="/pulse?chain=monad"
                    aria-label="View Monad tokens"
                    className={monadButtonClasses}
                  >
                    <img
                      src="https://i0.wp.com/www.gizmotimes.com/wp-content/uploads/2023/10/Monad-Logo.png?fit=1920%2C1080&ssl=1"
                      alt="Monad"
                      className="h-7 w-7 rounded-full object-cover"
                    />
                  </Link>
                  {/* <Link
                    href="/pulse?chain=bnb"
                    aria-label="View BNB tokens (beta)"
                    className={bnbButtonClasses}
                  >
                    <SiBinance className="h-4 w-4 text-[#F3BA2F]" />
                    <span className="absolute -bottom-1 -right-3 rounded-full border border-blue-500 px-1.5 py-px text-[6px] font-semibold uppercase tracking-[0.18em] text-blue-500 shadow-lg shadow-blue-500/30 bg-[#111214]">
                      Beta
                    </span>
                  </Link> */}
                  {/* <Link
                    href="/pulse?chain=base"
                    aria-label="View Base tokens (coming soon)"
                    className={baseButtonClasses}
                  >
                    <img
                      src="https://avatars.githubusercontent.com/u/108554348?s=280&v=4"
                      alt="Base"
                      className="h-7 w-7 rounded-full object-cover"
                    />
                    <span className="absolute -bottom-1 -right-4 rounded-full border border-sky-400 px-1.5 py-px text-[6px] font-semibold uppercase tracking-[0.18em] text-sky-300 shadow-lg shadow-sky-500/30 bg-[#111214]">
                      Soon
                    </span>
                  </Link> */}
                  {/* <Link
                    href="/pulse?chain=eth"
                    aria-label="View Ethereum tokens (coming soon)"
                    className={ethButtonClasses}
                  >
                    <img
                      src="https://s2.coinmarketcap.com/static/img/coins/200x200/1027.png"
                      alt="Ethereum"
                      className="h-7 w-7 rounded-full object-cover"
                    />
                    <span className="absolute -bottom-1 -right-4 rounded-full border border-emerald-400 px-1.5 py-px text-[6px] font-semibold uppercase tracking-[0.18em] text-emerald-300 shadow-lg shadow-emerald-500/30 bg-[#111214]">
                      Soon
                    </span>
                  </Link> */}
                </div>
              </div>
              {/* <PulseControlBar className="mb-0.5" /> */}
            </div>

            {/* Tab Navigation - Mobile Only */}
            <div className="mt-3 mb-4 lg:hidden">
              <div className="flex gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-1">
                <button
                  onClick={() => setActiveTab("new")}
                  className={`relative flex-1 rounded-md px-3 py-2.5 text-xs font-semibold transition-all duration-200 ${
                    activeTab === "new"
                      ? "bg-[#7FFFC9] text-black"
                      : "text-neutral-300 hover:bg-neutral-800/60 hover:text-neutral-100"
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>New</span>
                    <span
                      className={`inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] leading-none font-bold ${
                        activeTab === "new"
                          ? "bg-black/15 text-black/90"
                          : "bg-neutral-800 text-neutral-400"
                      }`}
                    >
                      {enrichedNewPairsToShow.length}
                    </span>
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab("final-stretch")}
                  className={`relative flex-1 rounded-md px-3 py-2.5 text-xs font-semibold transition-all duration-200 ${
                    activeTab === "final-stretch"
                      ? "bg-[#7FFFC9] text-black"
                      : "text-neutral-300 hover:bg-neutral-800/60 hover:text-neutral-100"
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Final</span>
                    <span
                      className={`inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] leading-none font-bold ${
                        activeTab === "final-stretch"
                          ? "bg-black/15 text-black/90"
                          : "bg-neutral-800 text-neutral-400"
                      }`}
                    >
                      {enrichedFinalStretch.length}
                    </span>
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab("migrated")}
                  className={`relative flex-1 rounded-md px-3 py-2.5 text-xs font-semibold transition-all duration-200 ${
                    activeTab === "migrated"
                      ? "bg-[#7FFFC9] text-black"
                      : "text-neutral-300 hover:bg-neutral-800/60 hover:text-neutral-100"
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Migrated</span>
                    <span
                      className={`inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] leading-none font-bold ${
                        activeTab === "migrated"
                          ? "bg-black/15 text-black/90"
                          : "bg-neutral-800 text-neutral-400"
                      }`}
                    >
                      {enrichedMigrated.length}
                    </span>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {false ? ( // isBnbRoute commented out
            <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
              {/* Mobile: Single table based on active tab - MOBILE VIEW DISABLED
              <div className="lg:hidden">
                <div className="transition-all duration-300 ease-in-out">
                  {activeTab === "new" && (
                    <BnbTable
                      title="New Pairs"
                      tokens={enrichedNewPairsToShow as any}
                      loading={newPairsLoading}
                      isFirstOrLast="only"
                      showBubbleMetrics={false}
                    />
                  )}
                  {activeTab === "final-stretch" && (
                    <BnbTable
                      title="Final Stretch"
                      tokens={enrichedFinalStretch as any}
                      isFirstOrLast="only"
                      showBubbleMetrics={false}
                    />
                  )}
                  {activeTab === "migrated" && (
                    <BnbTable
                      title="Migrated"
                      tokens={enrichedMigrated as any}
                      isFirstOrLast="only"
                      showBubbleMetrics={false}
                    />
                  )}
                </div>
              </div>
              */}
              {/* All tables horizontally - always visible */}
              {/* <div className="flex min-h-0 w-full flex-1 flex-row overflow-hidden">
                <BnbTable
                  title="New Pairs"
                  tokens={enrichedNewPairsToShow as any}
                  loading={newPairsLoading}
                  isFirstOrLast="first"
                  showBubbleMetrics={false}
                />
                <BnbTable
                  title="Final Stretch"
                  tokens={enrichedFinalStretch as any}
                  showBubbleMetrics={false}
                />
                <BnbTable
                  title="Migrated"
                  tokens={enrichedMigrated as any}
                  isFirstOrLast="last"
                  showBubbleMetrics={false}
                />
              </div> */}
            </div>
          ) : isMonadRoute ? ( // || isBaseRoute || isEthereumRoute
            <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
              {/* Mobile: Single table based on active tab */}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:hidden">
                <div className="flex h-full min-h-0 flex-col transition-all duration-300 ease-in-out">
                  {activeTab === "new" && (
                    <MonadTable
                      title="New Pairs"
                      tokens={enrichedNewPairsToShow}
                      loading={false}
                      isFirstOrLast="only"
                      showBubbleMetrics={false}
                    />
                  )}
                  {activeTab === "final-stretch" && (
                    <MonadTable
                      title="Final Stretch"
                      tokens={enrichedFinalStretch}
                      isFirstOrLast="only"
                      showBubbleMetrics={false}
                    />
                  )}
                  {activeTab === "migrated" && (
                    <MonadTable
                      title="Migrated"
                      tokens={enrichedMigrated}
                      isFirstOrLast="only"
                      showBubbleMetrics={false}
                    />
                  )}
                </div>
              </div>
              {/* All tables horizontally - Desktop only */}
              <div className="hidden min-h-0 w-full flex-1 flex-row overflow-hidden lg:flex gap-3">
                <MonadTable
                  title="New Pairs"
                  tokens={enrichedNewPairsToShow}
                  loading={false}
                  isFirstOrLast="first"
                  showBubbleMetrics={false}
                  currentChain={currentChain}
                />
                <MonadTable
                  title="Final Stretch"
                  tokens={enrichedFinalStretch}
                  showBubbleMetrics={false}
                  currentChain={currentChain}
                />
                <MonadTable
                  title="Migrated"
                  tokens={enrichedMigrated}
                  isFirstOrLast="last"
                  showBubbleMetrics={false}
                  currentChain={currentChain}
                />
              </div>
            </div>
          ) : isLoading ? (
            // IMPORTANT: Pass actual tokens even during loading!
            // PulseTable has internal cache from WebSocket/IndexedDB that will show
            // Passing tokens={[]} would override the cache and show blank screen
            <div className="flex min-h-0 w-full flex-1 flex-row overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl">
              <PulseTable
                title="New Pairs"
                tokens={enrichedNewPairsToShow as any}
                loading={true}
                isFirstOrLast="first"
                showBubbleMetrics={false}
                currentChain={currentChain}
              />
              <PulseTable
                title="Final Stretch"
                tokens={enrichedFinalStretch as any}
                loading={true}
                showBubbleMetrics={false}
                currentChain={currentChain}
              />
              <PulseTable
                title="Migrated"
                tokens={enrichedMigrated as any}
                loading={true}
                isFirstOrLast="last"
                showBubbleMetrics={false}
                currentChain={currentChain}
              />
            </div>
          ) : hasError ? (
            <div className="py-10 text-center text-red-400">
              <div className="mb-2 text-xl font-semibold">
                Error Loading Launchpad Data
              </div>
              <div>{launchpadError?.message || "Unknown error"}</div>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 rounded bg-emerald-600 px-4 py-2 text-white transition-colors hover:bg-emerald-700"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
              {/* Mobile: Single table based on active tab */}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:hidden">
                <div className="flex h-full min-h-0 flex-col transition-all duration-300 ease-in-out">
                  {activeTab === "new" && (
                    <PulseTable
                      title="New Pairs"
                      tokens={enrichedNewPairsToShow as any}
                      loading={newPairsLoading}
                      isFirstOrLast="only"
                      showBubbleMetrics={false}
                      currentChain={currentChain}
                    />
                  )}
                  {activeTab === "final-stretch" && (
                    <PulseTable
                      title="Final Stretch"
                      tokens={enrichedFinalStretch as any}
                      isFirstOrLast="only"
                      showBubbleMetrics={false}
                      currentChain={currentChain}
                    />
                  )}
                  {activeTab === "migrated" && (
                    <PulseTable
                      title="Migrated"
                      tokens={enrichedMigrated as any}
                      isFirstOrLast="only"
                      showBubbleMetrics={false}
                      currentChain={currentChain}
                    />
                  )}
                </div>
              </div>
              {/* Desktop: All tables horizontally */}
              <div className="hidden min-h-0 w-full flex-1 flex-row overflow-hidden lg:flex gap-3">
                <PulseTable
                  title="New Pairs"
                  tokens={enrichedNewPairsToShow as any}
                  loading={newPairsLoading}
                  isFirstOrLast="first"
                  showBubbleMetrics={false}
                  currentChain={currentChain}
                />
                <PulseTable
                  title="Final Stretch"
                  tokens={enrichedFinalStretch as any}
                  showBubbleMetrics={false}
                  currentChain={currentChain}
                />
                <PulseTable
                  title="Migrated"
                  tokens={enrichedMigrated as any}
                  isFirstOrLast="last"
                  showBubbleMetrics={false}
                  currentChain={currentChain}
                />
              </div>
            </div>
          )}
            </div>
            <div className="relative z-10"><Footer /></div>
          </div>
        </div>
      </div>

      {/* Updates Modal */}
      {showUpdatesModal && user && (
        <UpdatesModal
          updates={PLATFORM_UPDATES}
          onClose={() => setShowUpdatesModal(false)}
          storageKey={
            user
              ? `trenches-updates-viewed-${user.id}`
              : "trenches-updates-viewed"
          }
        />
      )}
    </>
  );
}
