import { useRouter } from "next/router";
import React, { useEffect, useState, useCallback, useRef } from "react";
import Head from "next/head";
import { useWallet } from "../../../components/useWallet";
import { useUser } from "../../../components/UserContext";
import Header from "../../../components/Header";
import Footer from "../../../components/Footer";
import TradeHeader from "../../../components/trade/TradeHeader";
import MonadTradeActionPanel from "../../../components/trade/MonadTradeActionPanel";
import InstantTradeModal from "../../../components/trade/InstantTradeModal";
import dynamic from "next/dynamic";
import { useQuickBuyQueryParams } from "../../../components/QuickBuy";
import { useTradePageQueryParams } from "../../../utils/queryParams";
import { useComponentCache } from "../../../hooks/useComponentCache";
import { useMonadTokenMetrics, type TokenMetrics } from "../../../hooks/useMonadTokenMetrics";
// Eager load AdvancedOHLCChart on trade pages - always needed, so no point in lazy loading
import AdvancedOHLCChart from "../../../components/AdvancedOHLCChart";
import MonadTopTradersTable from "../../../components/trade/MonadTopTradersTable";
import MonadHoldersTable from "../../../components/trade/MonadHoldersTable";
import MonadDevTokensTable from "../../../components/trade/MonadDevTokensTable";
import { useMonadTradesWebSocket } from "../../../hooks/useMonadTradesWebSocket";
import { useMonadPositionWebSocket, type MonadPosition } from "../../../hooks/useMonadPositionWebSocket";
import useMonadDevTokens from "../../../hooks/useMonadDevTokens";
import { consumePendingMonadPositionRefresh } from "../../../utils/monadTradeEvents";
import { useSolPrice } from "../../../components/SolPriceContext";

// Lazy load other components
const MonadTrades = dynamic(() => import("../../../components/trade/MonadTrades"), { ssr: false });

/* ---------- AXIOM palette ---------- */
const AX = {
  bg: "#101114",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#f0f5f5",
  muted: "#9CA3AF",
  mint: "#86d99f", // Monad green (matches candle up color)
  mintHover: "#70c387",
  sell: "#f26682", // Monad red (matches candle down color)
};

interface MonadTokenData {
  mint: string;
  name: string;
  symbol: string;
  usd_price: number;
  fully_diluted_value: number;
  market_cap_usd?: number;
  liquidity_usd?: number;
  total_liquidity_usd?: number;
  volume_24h: number;
  volume_5m?: number;
  volume_1h?: number;
  volume_6h?: number;
  created_at: string | null;
  launch_time?: string | null;
  launchpad_protocol?: string | null;
  image_url?: string | null;
  status?: string;
  decimals?: number;
  total_transactions?: number;
  total_buys?: number;
  total_sells?: number;
  unique_traders?: number;
  is_graduated?: boolean;
  pair_address?: string;
  creator_address?: string | null;
  creator_wallet?: string | null;
  dev_address?: string | null;
  owner?: string | null;
}

export default function MonadTradePage() {
  const router = useRouter();
  const { contractAddress, _name, _symbol, _price, _mcap, _image, _mint, _liq } = router.query;

  const [tokenData, setTokenData] = useState<MonadTokenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isConnected } = useWallet();
  const { user } = useUser();
  const { monPrice } = useSolPrice();
  const [selectedTab, setSelectedTab] = useState("Transactions");
  const [search, setSearch] = useState("");
  const [showMobileTradeModal, setShowMobileTradeModal] = useState(false);
  const [isClosingModal, setIsClosingModal] = useState(false);
  const [positionLinesApi, setPositionLinesApi] = useState<{ avgBuyPriceUsd?: number | null; avgSellPriceUsd?: number | null } | null>(null);
  const fetchPositionLinesRef = useRef<Promise<void> | null>(null);
  
  // Fallback liquidity from liquidity endpoint when liquidity is $0
  const [fallbackLiquidityUsd, setFallbackLiquidityUsd] = useState<number | null>(null);
  const fetchFallbackLiquidityRef = useRef<Promise<void> | null>(null);
  
  // Load instant trade open state from localStorage
  const getInitialInstantTradeState = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
      const saved = localStorage.getItem('instant-trade-popup-open');
      return saved === 'true';
    } catch {
      return false;
    }
  };
  const [isInstantTradeOpen, setIsInstantTradeOpen] = useState(getInitialInstantTradeState);
  
  // Save instant trade open state to localStorage
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('instant-trade-popup-open', String(isInstantTradeOpen));
    }
  }, [isInstantTradeOpen]);

  const { settings: quickBuySettings, side: quickBuySide } = useQuickBuyQueryParams();
  const { params: tradeParams, setParams: setTradeParams, isReady: tradeParamsReady } = useTradePageQueryParams();

  // Streams are keyed by token/mint address; seed with URL/_mint and update once token loads
  const [tokenMintForLive, setTokenMintForLive] = useState<string>(() => {
    if (typeof _mint === "string" && _mint.trim()) return _mint;
    return typeof contractAddress === "string" ? contractAddress : "";
  });
  const [positionForChart, setPositionForChart] = useState<MonadPosition | null>(null);
  const [chartMetrics, setChartMetrics] = useState<{ lastPriceUsd?: number; lastMarketCapUsd?: number; maxMarketCapUsd?: number }>({});

  // Track user position for chart overlays (avg entry/exit) and quick updates
  const { position: userPositionForChart, refreshPosition: refreshChartPosition } = useMonadPositionWebSocket({
    tokenAddress: tokenMintForLive,
    enabled: !!user?.id && !!tokenMintForLive,
    onUpdate: (pos) => setPositionForChart(pos),
  });

  useEffect(() => {
    if (userPositionForChart) {
      setPositionForChart(userPositionForChart);
    }
  }, [userPositionForChart]);

  useEffect(() => {
    if (typeof window === 'undefined' || !tokenMintForLive) return;
    const normalized = tokenMintForLive.toLowerCase();

    const triggerRefresh = () => {
      refreshChartPosition().catch((err) => {
        console.error('[MonadTradePage] Failed to refresh position after quick trade:', err);
      });
    };

    const consumePending = () => {
      const ts = consumePendingMonadPositionRefresh(normalized);
      if (ts && Date.now() - ts < 60_000) {
        triggerRefresh();
        setTimeout(triggerRefresh, 1500);
      }
    };

    consumePending();

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ tokenAddress?: string }>).detail;
      const addr = detail?.tokenAddress?.toLowerCase();
      if (addr === normalized) {
        consumePending();
      }
    };

    window.addEventListener('monadQuickTrade', handler as EventListener);
    return () => window.removeEventListener('monadQuickTrade', handler as EventListener);
  }, [tokenMintForLive, refreshChartPosition]);

  // Real-time token metrics via WebSocket
  const [liveMetrics, setLiveMetrics] = useState<TokenMetrics | null>(null);
  const { metrics: wsMetrics, connected: wsMetricsConnected } = useMonadTokenMetrics({
    tokenAddress: tokenMintForLive,
    enabled: !!tokenMintForLive,
    onUpdate: (metrics) => setLiveMetrics(metrics),
  });

  // Optimistic token data from query params
  const optimisticToken = React.useMemo(() => {
    if (_name || _symbol) {
      const liqNum = typeof _liq === "string" ? parseFloat(_liq) : undefined;
      const liquidity = Number.isFinite(liqNum) ? liqNum : undefined;
      return {
        name: (_name as string) || "",
        symbol: (_symbol as string) || "",
        price_usd: _price ? parseFloat(_price as string) : undefined,
        market_cap_usd: _mcap ? parseFloat(_mcap as string) : undefined,
        liquidity_usd: liquidity,
        total_liquidity_usd: liquidity,
        image: (_image as string) || undefined,
      };
    }
    return null;
  }, [_liq, _mcap, _name, _price, _symbol, _image]);

  // Fetch token data
  useEffect(() => {
    if (!contractAddress || typeof contractAddress !== "string") {
      setLoading(false);
      return;
    }

    const fetchTokenData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Call Monad backend directly (bypasses proxy for Redis cache)
        const monadServiceUrl = process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL!;
        const endpoints = [
          `${monadServiceUrl}/v1/pulse/new?limit=100`,
          `${monadServiceUrl}/v1/pulse/final-stretch?limit=100`,
          `${monadServiceUrl}/v1/pulse/migrated?limit=100`,
        ];

        let foundToken: MonadTokenData | null = null;

        for (const endpoint of endpoints) {
          try {
            const response = await fetch(endpoint, {
              headers: { 'Accept': 'application/json' }
            });
            if (response.ok) {
              const result = await response.json();
              // Backend returns { status: "success", count: N, data: [...] }
              const rawTokens = result.data || (Array.isArray(result) ? result : []);
              // Transform backend response: map 'address' to 'mint' for frontend compatibility
              const tokens = rawTokens.map((t: any) => {
                const normalizedPrice =
                  typeof t.usd_price === 'number' ? t.usd_price :
                  typeof t.price_usd === 'number' ? t.price_usd :
                  typeof t.priceUsd === 'number' ? t.priceUsd :
                  0;
                const normalizedMarketCap =
                  typeof t.market_cap_usd === 'number' ? t.market_cap_usd :
                  typeof t.marketCapUSD === 'number' ? t.marketCapUSD :
                  typeof t.fully_diluted_value === 'number' ? t.fully_diluted_value :
                  0;
                // Normalize bonding curve progress (backend sends as 0-1 decimal)
                const bondingCurveProgress =
                  t.bonding_curve_progress ?? t.graduation_percent ?? t.graduationPercent ?? 0;
                // Convert to percentage if needed (backend sends 0-1, we want 0-100)
                const normalizedBondingPct = bondingCurveProgress > 1
                  ? bondingCurveProgress
                  : bondingCurveProgress * 100;
                return {
                  ...t,
                  mint: t.address || t.mint,  // Backend uses 'address', frontend expects 'mint'
                  usd_price: t.usd_price ?? t.price_usd ?? t.priceUsd ?? normalizedPrice,
                  price_usd: t.price_usd ?? t.usd_price ?? t.priceUsd ?? normalizedPrice,
                  market_cap_usd: t.market_cap_usd ?? t.marketCapUSD ?? normalizedMarketCap,
                  fully_diluted_value: t.fully_diluted_value ?? t.market_cap_usd ?? t.marketCapUSD ?? normalizedMarketCap,
                  // Include bonding curve progress
                  bonding_curve_progress: bondingCurveProgress,
                  graduation_percent: normalizedBondingPct,
                  bonding_pct: normalizedBondingPct,
                };
              });
              const token = tokens.find(
                (t: any) => t.mint === contractAddress || t.pair_address === contractAddress || t.address === contractAddress
              );
              if (token) {
                foundToken = token;
                break;
              }
            }
          } catch (err) {
            console.warn(`Failed to fetch from ${endpoint}:`, err);
          }
        }

        if (foundToken) {
          setTokenData(foundToken);
        } else if (optimisticToken) {
          // Use optimistic data if available
          setTokenData({
            mint: contractAddress as string,
            name: optimisticToken.name,
            symbol: optimisticToken.symbol,
            usd_price: optimisticToken.price_usd || 0,
            fully_diluted_value: optimisticToken.market_cap_usd || 0,
            market_cap_usd: optimisticToken.market_cap_usd || 0,
            liquidity_usd: optimisticToken.liquidity_usd,
            total_liquidity_usd: optimisticToken.total_liquidity_usd,
            volume_24h: 0,
            created_at: null,
            image_url: optimisticToken.image || null,
            pair_address: contractAddress as string,
          });
        } else {
          setError("Token not found");
        }
      } catch (err) {
        console.error("Error fetching Monad token data:", err);
        setError("Failed to load token data");
        if (optimisticToken) {
          // Fallback to optimistic data
          setTokenData({
            mint: contractAddress as string,
            name: optimisticToken.name,
            symbol: optimisticToken.symbol,
            usd_price: optimisticToken.price_usd || 0,
            fully_diluted_value: optimisticToken.market_cap_usd || 0,
            market_cap_usd: optimisticToken.market_cap_usd || 0,
            liquidity_usd: optimisticToken.liquidity_usd,
            total_liquidity_usd: optimisticToken.total_liquidity_usd,
            volume_24h: 0,
            created_at: null,
            image_url: optimisticToken.image || null,
            pair_address: contractAddress as string,
          });
        }
      } finally {
        setLoading(false);
      }
    };

    fetchTokenData();
  }, [contractAddress, optimisticToken]);

  // Convert Monad token data to Token format for components
  // Merges live WebSocket metrics when available for real-time updates
  const displayToken = React.useMemo(() => {
    const live = liveMetrics || wsMetrics;
    const tokenPriceUsd = (tokenData as any)?.usd_price ?? (tokenData as any)?.price_usd ?? (tokenData as any)?.priceUsd ?? 0;
    const tokenMarketCap =
      (tokenData as any)?.market_cap_usd ??
      (tokenData as any)?.marketCapUSD ??
      (tokenData as any)?.fully_diluted_value ??
      0;
    // Special case: token 0xad96c3dffcd6374294e2573a7fbba96097cc8d7c should show 100m supply instead of 1b
    const defaultSupply = (typeof contractAddress === "string" && contractAddress.toLowerCase() === "0xad96c3dffcd6374294e2573a7fbba96097cc8d7c")
      ? 100_000_000
      : 1_000_000_000;
    const tokenSupply =
      (tokenData as any)?.total_supply ??
      (tokenData as any)?.supply ??
      defaultSupply;

    if (!tokenData) return optimisticToken ? {
      mint: contractAddress as string,
      name: optimisticToken.name,
      symbol: optimisticToken.symbol,
      usd_price: live?.price_usd ?? optimisticToken.price_usd ?? 0,
      price_usd: live?.price_usd ?? optimisticToken.price_usd ?? 0,
      market_cap_usd: live?.market_cap_usd ?? optimisticToken.market_cap_usd ?? 0,
      pair_address: contractAddress as string,
      logo: optimisticToken.image || "",
      decimals: 18,
      total_supply: defaultSupply,
      creator_address: null,
      dev_address: null,
      owner: null,
      // Live metrics
      // Use fallback liquidity endpoint if liquidity is $0
      liquidity_usd: (() => {
        const primary = live?.liquidity_usd ?? optimisticToken.liquidity_usd ?? optimisticToken.total_liquidity_usd ?? 0;
        return (primary > 0) ? primary : (fallbackLiquidityUsd ?? primary);
      })(),
      total_liquidity_usd: (() => {
        const primary = live?.liquidity_usd ?? optimisticToken.total_liquidity_usd ?? optimisticToken.liquidity_usd ?? 0;
        return (primary > 0) ? primary : (fallbackLiquidityUsd ?? primary);
      })(),
      graduation_percent: live?.graduation_percent ?? 0,
      volume_24h: live?.volume_24h_usd ?? 0,
      total_buys: live?.total_buys ?? 0,
      total_sells: live?.total_sells ?? 0,
      total_buy_volume_usd: live?.total_buy_volume_usd ?? 0,
      total_sell_volume_usd: live?.total_sell_volume_usd ?? 0,
      net_volume_usd: live?.net_volume_usd ?? 0,
    } : null;

    return {
      mint: tokenData.mint || (contractAddress as string),
      name: tokenData.name,
      symbol: tokenData.symbol,
      // Price: prefer live metrics, fallback to fetched data
      usd_price: live?.price_usd ?? tokenPriceUsd,
      price_usd: live?.price_usd ?? tokenPriceUsd,
      market_cap_usd: live?.market_cap_usd ?? tokenMarketCap,
      fully_diluted_value: live?.market_cap_usd ?? tokenData.fully_diluted_value ?? tokenMarketCap,
      pair_address: tokenData.pair_address || tokenData.mint || (contractAddress as string),
      logo: tokenData.image_url || "",
      decimals: tokenData.decimals || 18,
      total_supply: tokenSupply,
      created_at: tokenData.created_at || tokenData.launch_time || null,
      // Live metrics (real-time via WebSocket, fallback to HTTP API data)
      // Use fallback liquidity endpoint if liquidity is $0
      liquidity_usd: (() => {
        const primary = live?.liquidity_usd ?? (tokenData as any)?.liquidity_usd ?? optimisticToken?.liquidity_usd ?? optimisticToken?.total_liquidity_usd ?? 0;
        // Use fallback if primary is $0 and fallback exists
        return (primary > 0) ? primary : (fallbackLiquidityUsd ?? primary);
      })(),
      total_liquidity_usd: (() => {
        const primary = live?.liquidity_usd ?? (tokenData as any)?.liquidity_usd ?? optimisticToken?.total_liquidity_usd ?? optimisticToken?.liquidity_usd ?? 0;
        // Use fallback if primary is $0 and fallback exists
        return (primary > 0) ? primary : (fallbackLiquidityUsd ?? primary);
      })(),
      graduation_percent: live?.graduation_percent ?? (tokenData as any)?.graduation_percent ?? (tokenData as any)?.bonding_curve_progress ?? 0,
      bonding_pct: live?.graduation_percent ?? (tokenData as any)?.bonding_curve_progress ?? (tokenData as any)?.graduation_percent ?? 0,
      volume_24h: live?.volume_24h_usd ?? (tokenData as any)?.volume_24h_usd ?? 0,
      volume_24h_usd: live?.volume_24h_usd ?? (tokenData as any)?.volume_24h_usd ?? 0,
      total_buys: live?.total_buys ?? tokenData.total_buys ?? 0,
      total_sells: live?.total_sells ?? tokenData.total_sells ?? 0,
      total_transactions: live?.total_transactions ?? tokenData.total_transactions ?? 0,
      unique_traders: live?.unique_traders ?? tokenData.unique_traders ?? 0,
      // USD volumes: prefer WebSocket, fallback to calculated from MON volume
      total_buy_volume_usd: live?.total_buy_volume_usd ?? ((tokenData as any)?.total_buy_volume_mon ? (tokenData as any).total_buy_volume_mon * (monPrice || 0.025) : 0),
      total_sell_volume_usd: live?.total_sell_volume_usd ?? ((tokenData as any)?.total_sell_volume_mon ? (tokenData as any).total_sell_volume_mon * (monPrice || 0.025) : 0),
      net_volume_usd: live?.net_volume_usd ?? (((tokenData as any)?.total_buy_volume_mon ?? 0) - ((tokenData as any)?.total_sell_volume_mon ?? 0)) * (monPrice || 0.025),
      launchpad_protocol: tokenData.launchpad_protocol || "nad.fun",
      // Dev/creator address fields
      creator_address: (tokenData as any)?.creator_address || (tokenData as any)?.creator_wallet || (tokenData as any)?.dev_address || (tokenData as any)?.owner || null,
      dev_address: (tokenData as any)?.dev_address || (tokenData as any)?.creator_wallet || (tokenData as any)?.creator_address || (tokenData as any)?.owner || null,
      owner: (tokenData as any)?.owner || (tokenData as any)?.creator_wallet || (tokenData as any)?.creator_address || (tokenData as any)?.dev_address || null,
    };
  }, [tokenData, optimisticToken, contractAddress, liveMetrics, wsMetrics, fallbackLiquidityUsd]);

  // Memoize pairAddress early so downstream hooks can use it
  const pairAddress = React.useMemo(() => {
    return displayToken?.pair_address || (contractAddress as string);
  }, [displayToken?.pair_address, contractAddress]);

  // Fetch liquidity from fallback endpoint when liquidity is $0
  const fetchFallbackLiquidity = React.useCallback(async () => {
    if (!tokenMintForLive) {
      setFallbackLiquidityUsd(null);
      return;
    }
    
    // Avoid overlapping fetches
    if (fetchFallbackLiquidityRef.current) return fetchFallbackLiquidityRef.current;

    const run = (async () => {
      try {
        const monadServiceUrl = process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL || 'https://monad-token-service.narrative.trade';
        
        // Try first fallback: /v1/liquidity endpoint
        const liquidityUrl = `${monadServiceUrl}/v1/liquidity?token_address=${encodeURIComponent(tokenMintForLive)}`;
        
        let liquidity: number | null = null;
        
        try {
          const response = await fetch(liquidityUrl, {
            headers: {
              'Accept': 'application/json',
            },
          });

          if (response.ok) {
            const body = await response.json();
            if (body?.status === 'success' && body?.data?.liquidity_usd) {
              const parsedLiquidity = typeof body.data.liquidity_usd === 'number' 
                ? body.data.liquidity_usd 
                : parseFloat(body.data.liquidity_usd);
              
              if (Number.isFinite(parsedLiquidity) && parsedLiquidity > 0) {
                liquidity = parsedLiquidity;
                console.log(`[MonadTradePage] 💧 Fetched fallback liquidity (v1/liquidity): $${liquidity.toLocaleString()}`);
              }
            }
          }
        } catch (err) {
          console.warn('[MonadTradePage] Failed to fetch from v1/liquidity:', err);
        }

        // If first fallback returned 0 or failed, try second fallback: /v1/liqdex endpoint
        if (!liquidity || liquidity === 0) {
          try {
            const liqdexUrl = `${monadServiceUrl}/v1/liqdex?token_address=${encodeURIComponent(tokenMintForLive)}`;
            
            const liqdexResponse = await fetch(liqdexUrl, {
              headers: {
                'Accept': 'application/json',
              },
            });

            if (liqdexResponse.ok) {
              const liqdexBody = await liqdexResponse.json();
              if (liqdexBody?.status === 'success' && liqdexBody?.data?.liquidity_usd) {
                const parsedLiqdexLiquidity = typeof liqdexBody.data.liquidity_usd === 'number' 
                  ? liqdexBody.data.liquidity_usd 
                  : parseFloat(liqdexBody.data.liquidity_usd);
                
                if (Number.isFinite(parsedLiqdexLiquidity) && parsedLiqdexLiquidity > 0) {
                  liquidity = parsedLiqdexLiquidity;
                  console.log(`[MonadTradePage] 💧 Fetched fallback liquidity (v1/liqdex): $${liquidity.toLocaleString()}`);
                }
              }
            }
          } catch (err) {
            console.warn('[MonadTradePage] Failed to fetch from v1/liqdex:', err);
          }
        }

        // Set the result (null if both failed or returned 0)
        setFallbackLiquidityUsd(liquidity && liquidity > 0 ? liquidity : null);
        
      } catch (err) {
        console.warn('[MonadTradePage] Failed to fetch fallback liquidity:', err);
        setFallbackLiquidityUsd(null);
      } finally {
        fetchFallbackLiquidityRef.current = null;
      }
    })();

    fetchFallbackLiquidityRef.current = run;
    return run;
  }, [tokenMintForLive]);

  // Fetch fallback liquidity when token changes or when liquidity is $0
  useEffect(() => {
    if (!tokenMintForLive) {
      setFallbackLiquidityUsd(null);
      return;
    }

    // Check current liquidity from source data (not displayToken to avoid circular dependency)
    const currentLiquidity = 
      liveMetrics?.liquidity_usd ?? 
      wsMetrics?.liquidity_usd ?? 
      (tokenData as any)?.liquidity_usd ?? 
      optimisticToken?.liquidity_usd ?? 
      optimisticToken?.total_liquidity_usd ?? 
      0;
    
    // Only fetch if liquidity is $0 or missing
    if (currentLiquidity === 0 || !currentLiquidity) {
      fetchFallbackLiquidity();
    } else {
      // Clear fallback if we have real liquidity
      setFallbackLiquidityUsd(null);
    }
  }, [tokenMintForLive, liveMetrics?.liquidity_usd, wsMetrics?.liquidity_usd, tokenData, optimisticToken, fetchFallbackLiquidity]);

  // Fetch avg entry/exit lines from backend (user-scoped) with fallback to position endpoint
  const fetchPositionLines = React.useCallback(async () => {
    if (!tokenMintForLive || !user?.bearerToken) {
      setPositionLinesApi(null);
      return;
    }
    // Avoid overlapping fetches
    if (fetchPositionLinesRef.current) return fetchPositionLinesRef.current;

    const run = (async () => {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!baseUrl) return;
        const headers = {
          Authorization: `Bearer ${user.bearerToken}`,
          Accept: "application/json",
        };
        const primaryUrl = `${baseUrl}/api/trade/monad/position-lines?tokenAddress=${encodeURIComponent(tokenMintForLive)}`;
        let resp = await fetch(primaryUrl, { headers });
        if (!resp.ok) {
          resp = await fetch(
            `${baseUrl}/api/trade/monad/position?tokenAddress=${encodeURIComponent(tokenMintForLive)}`,
            { headers }
          );
        }
        if (!resp.ok) {
          setPositionLinesApi(null);
          return;
        }
        const body = await resp.json();
        const data = body?.data || body;
        if (body?.success === false || !data) {
          setPositionLinesApi(null);
          return;
        }
        setPositionLinesApi({
          avgBuyPriceUsd: data.avgBuyPriceUsd ?? data.avgBuyPriceUSD ?? null,
          avgSellPriceUsd: data.avgSellPriceUsd ?? data.avgSellPriceUSD ?? null,
        });
      } catch {
        setPositionLinesApi(null);
      } finally {
        fetchPositionLinesRef.current = null;
      }
    })();

    fetchPositionLinesRef.current = run;
    return run;
  }, [tokenMintForLive, user?.bearerToken]);

  // Initial fetch and on token change
  useEffect(() => {
    fetchPositionLines();
  }, [fetchPositionLines]);

  // Refresh lines on quick trade events for this token
  useEffect(() => {
    if (typeof window === "undefined") return;
    const normalized = tokenMintForLive?.toLowerCase();
    if (!normalized) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ tokenAddress?: string }>).detail;
      const addr = detail?.tokenAddress?.toLowerCase();
      if (addr === normalized) {
        fetchPositionLines();
      }
    };
    window.addEventListener("monadQuickTrade", handler as EventListener);
    return () => window.removeEventListener("monadQuickTrade", handler as EventListener);
  }, [fetchPositionLines, tokenMintForLive]);

  // Dev address and trades (used for markers and avg entry/exit fallback)
  const { devTokenData: devData } = useMonadDevTokens(
    (contractAddress as string) || undefined,
    { enabled: !!contractAddress && typeof contractAddress === "string" }
  );
  const devAddress = React.useMemo(() => {
    return devData?.dev_wallet || (displayToken as any)?.dev_address || (displayToken as any)?.creator_address || null;
  }, [devData?.dev_wallet, displayToken]);

  const { trades: allTrades } = useMonadTradesWebSocket({
    tokenAddress: tokenMintForLive,
    addressAliases: pairAddress ? [pairAddress] : [],
    enabled: !!tokenMintForLive, // allow even without devAddress for avg calc fallback
    maxTrades: 200,
  });

  const avgEntryPriceUsd = React.useMemo(() => {
    if (positionForChart?.avgBuyPriceUsd && positionForChart.avgBuyPriceUsd > 0) {
      return positionForChart.avgBuyPriceUsd;
    }
    if (positionForChart && positionForChart.totalBoughtTokens > 0) {
      if (positionForChart.totalBoughtUsd > 0) {
        return positionForChart.totalBoughtUsd / positionForChart.totalBoughtTokens;
      }
      if (positionForChart.totalBoughtMon > 0 && monPrice > 0) {
        return (positionForChart.totalBoughtMon * monPrice) / positionForChart.totalBoughtTokens;
      }
    }
    return null;
  }, [monPrice, positionForChart]);

  const avgExitPriceUsd = React.useMemo(() => {
    if (positionForChart?.avgSellPriceUsd && positionForChart.avgSellPriceUsd > 0) {
      return positionForChart.avgSellPriceUsd;
    }
    if (positionForChart && positionForChart.totalSoldTokens > 0) {
      if (positionForChart.totalSoldUsd > 0) {
        return positionForChart.totalSoldUsd / positionForChart.totalSoldTokens;
      }
      if (positionForChart.totalSoldMon > 0 && monPrice > 0) {
        return (positionForChart.totalSoldMon * monPrice) / positionForChart.totalSoldTokens;
      }
    }
    return null;
  }, [monPrice, positionForChart]);

  const priceLineValues = React.useMemo(() => {
    const sanitize = (value: any) => {
      const num = typeof value === "string" ? parseFloat(value) : value;
      return Number.isFinite(num) && num > 0 ? num : undefined;
    };
    const entry = sanitize(avgEntryPriceUsd ?? positionLinesApi?.avgBuyPriceUsd);
    const exit = sanitize(avgExitPriceUsd ?? positionLinesApi?.avgSellPriceUsd);
    // Only update object when values change to avoid needless chart churn
    return { avgEntryPriceUsd: entry, avgExitPriceUsd: exit };
  }, [avgEntryPriceUsd, avgExitPriceUsd, positionLinesApi?.avgBuyPriceUsd, positionLinesApi?.avgSellPriceUsd]);

  const handleChartMetrics = React.useCallback((metrics: { lastPriceUsd?: number; lastMarketCapUsd?: number; maxMarketCapUsd?: number }) => {
    setChartMetrics(metrics);
  }, []);

  // Once token data resolves, align live stream identifier to the mint
  useEffect(() => {
    if (displayToken?.mint && displayToken.mint !== tokenMintForLive) {
      setTokenMintForLive(displayToken.mint);
    }
  }, [displayToken?.mint, tokenMintForLive]);

  const tokenNameForTitle =
    (displayToken?.name && displayToken.name.trim()) ||
    (displayToken?.symbol && displayToken.symbol.trim()) ||
    (typeof contractAddress === "string" && contractAddress.slice(0, 8)) ||
    "";

  const pageTitle = tokenNameForTitle
    ? `${tokenNameForTitle} | Monad Trade`
    : "Monad Trade";

  const displayTokenWithChartMetrics = React.useMemo(() => {
    if (!displayToken) return displayToken;
    const livePrice = chartMetrics.lastPriceUsd;
    const liveMcap = chartMetrics.lastMarketCapUsd;
    // Priority: OHLC WebSocket data (chart metrics) > Token metrics WebSocket > API value
    // Chart metrics come from real-time OHLC WebSocket updates, so they're the most current
    const live = liveMetrics || wsMetrics;
    const wsMarketCap = live?.market_cap_usd;
    // displayToken.market_cap_usd already has WebSocket priority, so it's either WebSocket value or API value (13540)
    const apiOrWsMarketCap = displayToken.market_cap_usd;
    // Prioritize: OHLC chart metrics (real-time from WebSocket) > Token metrics WebSocket > API value
    const finalMarketCap = liveMcap ?? wsMarketCap ?? apiOrWsMarketCap;
    
    // Debug: Log displayTokenWithChartMetrics calculation
    console.log('[DISPLAY_TOKEN_MC_DEBUG] displayTokenWithChartMetrics calculation:', {
      'chartMetrics.lastPriceUsd': livePrice,
      'chartMetrics.lastMarketCapUsd (OHLC WebSocket)': liveMcap,
      'liveMetrics?.market_cap_usd': liveMetrics?.market_cap_usd,
      'wsMetrics?.market_cap_usd': wsMetrics?.market_cap_usd,
      'wsMarketCap (token metrics WebSocket)': wsMarketCap,
      'displayToken.market_cap_usd': displayToken.market_cap_usd,
      'apiOrWsMarketCap': apiOrWsMarketCap,
      'finalMarketCap (result - OHLC prioritized)': finalMarketCap,
    });
    
    return {
      ...displayToken,
      usd_price: livePrice ?? (displayToken as any)?.usd_price,
      price_usd: livePrice ?? (displayToken as any)?.price_usd,
      // Prioritize OHLC WebSocket market cap (most real-time from chart candles)
      market_cap_usd: finalMarketCap,
      fully_diluted_value: finalMarketCap ?? (displayToken as any)?.fully_diluted_value ?? (displayToken as any)?.market_cap_usd,
      chart_live_price_usd: livePrice ?? null,
      chart_live_market_cap_usd: liveMcap ?? null, // Store OHLC WebSocket market cap for TradeHeader
      max_market_cap_usd: chartMetrics.maxMarketCapUsd ?? (displayToken as any)?.max_market_cap_usd,
    } as any;
  }, [chartMetrics, displayToken, liveMetrics, wsMetrics]);

  // Priority market cap for TradeHeader: OHLC WebSocket (chart) > Token metrics WebSocket > API value
  // Chart metrics come from real-time OHLC WebSocket updates, so prioritize them
  const priorityMarketCapUsd = React.useMemo(() => {
    const live = liveMetrics || wsMetrics;
    const wsMarketCap = live?.market_cap_usd;
    const ohlcMarketCap = chartMetrics?.lastMarketCapUsd;
    // Priority: OHLC WebSocket (real-time from chart) > Token metrics WebSocket > null (fallback to token.market_cap_usd)
    const result = ohlcMarketCap ?? wsMarketCap ?? null;
    
    // Debug: Log all market cap sources
    console.log('[MARKET_CAP_DEBUG] All market cap sources (OHLC prioritized):', {
      'chartMetrics.lastMarketCapUsd (OHLC WebSocket)': ohlcMarketCap,
      'liveMetrics?.market_cap_usd': liveMetrics?.market_cap_usd,
      'wsMetrics?.market_cap_usd': wsMetrics?.market_cap_usd,
      'wsMarketCap (token metrics WebSocket)': wsMarketCap,
      'displayToken.market_cap_usd': displayToken?.market_cap_usd,
      'tokenData.market_cap_usd (API)': (tokenData as any)?.market_cap_usd,
      'final priorityMarketCapUsd (OHLC first)': result,
    });
    
    return result;
  }, [liveMetrics, wsMetrics, chartMetrics, displayToken, tokenData]);

  // OHLC params - Monad uses 1s (1-second) candles as default for all tokens
  // TimescaleDB supports: 1s, 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w
  const getOHLCParams = useComponentCache(
    "ohlc-params-monad",
    [tokenData, displayToken],
    () => {
      // Always use 1s interval with 30d timeframe for all tokens regardless of age
      return { interval: "1s" as const, timeframe: "30d" as const, optimize: true };
    }
  );

  const ohlcParams = getOHLCParams;
  const defaultOHLCParams = { interval: "1s" as const, timeframe: "30d" as const, optimize: true };
  const currentOHLCParams = React.useMemo(
    () => ohlcParams || defaultOHLCParams,
    [ohlcParams?.interval, ohlcParams?.timeframe, ohlcParams?.optimize]
  );

  // Chart container refs and resizing
  const containerRef = useRef<HTMLDivElement | null>(null);
  const MIN_CHART_HEIGHT = 350;
  const DEFAULT_CHART_HEIGHT_RATIO = 0.45; // Reduced from 0.65 to 0.45 (45% of viewport height)
  const SSR_DEFAULT_CHART_HEIGHT = 900;

  const getResponsiveLimits = useCallback(() => {
    if (typeof window === "undefined") return { min: MIN_CHART_HEIGHT, max: 800 };
    const vh = window.innerHeight;
    const MIN_TOP = Math.max(MIN_CHART_HEIGHT, vh * 0.3);
    const MIN_BOTTOM = 180;
    const MAX_TOP = Math.min(vh * 0.85, vh - MIN_BOTTOM);
    return { min: MIN_TOP, max: MAX_TOP };
  }, []);

  const clampTop = useCallback((desired: number) => {
    const limits = getResponsiveLimits();
    const enforcedMin = Math.max(MIN_CHART_HEIGHT, limits.min);
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const maxTop = Math.min(vh - 180, limits.max);
    return Math.max(enforcedMin, Math.min(desired, maxTop));
  }, [getResponsiveLimits]);

  const [topPanePx, setTopPanePx] = useState<number>(() => {
    if (typeof window === "undefined") return Math.max(MIN_CHART_HEIGHT, SSR_DEFAULT_CHART_HEIGHT);
    const limits = getResponsiveLimits();
    const proposed = Math.max(limits.min, Math.min(window.innerHeight * DEFAULT_CHART_HEIGHT_RATIO, limits.max));
    const saved = Number(localStorage.getItem("tradeSplitTopPx"));
    if (Number.isFinite(saved) && saved > 0 && saved >= limits.min && saved <= limits.max) {
      return Math.max(saved, proposed);
    }
    return proposed;
  });

  const [isResizing, setIsResizing] = useState(false);
  const topPanePxRef = useRef(topPanePx);

  useEffect(() => {
    topPanePxRef.current = topPanePx;
  }, [topPanePx]);

  useEffect(() => {
    localStorage.setItem("tradeSplitTopPx", String(topPanePx));
  }, [topPanePx]);

  useEffect(() => {
    const handleResize = () => {
      const limits = getResponsiveLimits();
      if (topPanePx < limits.min) {
        setTopPanePx(limits.min);
      } else if (topPanePx > limits.max) {
        setTopPanePx(limits.max);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [topPanePx, getResponsiveLimits]);

  // Mobile modal drag handlers
  const modalDragRef = useRef<HTMLDivElement | null>(null);
  const dragStartY = useRef(0);
  const dragCurrentY = useRef(0);
  const isDragging = useRef(false);
  const modalTransform = useRef(0);

  useEffect(() => {
    if (showMobileTradeModal) document.body.classList.add("modal-open");
    else document.body.classList.remove("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, [showMobileTradeModal]);

  const closeModal = useCallback(() => {
    setIsClosingModal(true);
    setTimeout(() => {
      setShowMobileTradeModal(false);
      setIsClosingModal(false);
    }, 300);
  }, []);

  const handleDragStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragStartY.current = clientY;
    isDragging.current = true;
    modalTransform.current = 0;
  }, []);

  const handleDragMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging.current) return;
    e.preventDefault();
    e.stopPropagation();
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragCurrentY.current = clientY;
    const deltaY = dragCurrentY.current - dragStartY.current;
    if (deltaY > 0) {
      modalTransform.current = deltaY;
      if (modalDragRef.current) {
        modalDragRef.current.style.transform = `translateY(${deltaY}px)`;
        modalDragRef.current.style.opacity = String(Math.max(0.7, 1 - deltaY / 300));
      }
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const threshold = 100;
    if (modalTransform.current > threshold) {
      closeModal();
    } else if (modalDragRef.current) {
      modalDragRef.current.style.transition = "transform 0.2s ease-out, opacity 0.2s ease-out";
      modalDragRef.current.style.transform = "translateY(0px)";
      modalDragRef.current.style.opacity = "1";
      setTimeout(() => {
        if (modalDragRef.current) modalDragRef.current.style.transition = "";
      }, 200);
    }
    modalTransform.current = 0;
  }, [closeModal]);

  useEffect(() => {
    if (!showMobileTradeModal) return;
    const mm = (e: MouseEvent) => isDragging.current && handleDragMove(e as any);
    const mu = () => isDragging.current && handleDragEnd();
    const tm = (e: TouchEvent) => isDragging.current && handleDragMove(e as any);
    const tu = () => isDragging.current && handleDragEnd();
    document.addEventListener("mousemove", mm, { passive: false });
    document.addEventListener("mouseup", mu, { passive: false });
    document.addEventListener("touchmove", tm, { passive: false });
    document.addEventListener("touchend", tu, { passive: false });
    return () => {
      document.removeEventListener("mousemove", mm);
      document.removeEventListener("mouseup", mu);
      document.removeEventListener("touchmove", tm);
      document.removeEventListener("touchend", tu);
    };
  }, [showMobileTradeModal, handleDragMove, handleDragEnd]);

  // Filter trades to find dev buys/sells
  const devTrades = React.useMemo(() => {
    if (!devAddress || !allTrades.length) return [];
    return allTrades.filter(trade => 
      trade.trader_address?.toLowerCase() === devAddress.toLowerCase()
    ).map(trade => ({
      id: trade.tx_hash,
      transactionHash: trade.tx_hash,
      timestamp: trade.block_timestamp,
      is_buy: trade.is_buy,
      side: trade.is_buy ? 'buy' : 'sell',
      type: trade.is_buy ? 'buy' : 'sell',
      eventDisplayType: trade.is_buy ? 'Buy' : 'Sell',
      price: String(trade.price_mon),
      amount: String(trade.token_amount),
      totalUSD: String(Number(trade.mon_amount) * (monPrice || 0.025)),
      maker: trade.trader_address,
      wallet_address: trade.trader_address,
      user: trade.trader_address,
      data: {
        priceUsd: String(trade.price_mon),
        amountNonLiquidityToken: String(trade.token_amount),
        priceUsdTotal: String(Number(trade.mon_amount) * (monPrice || 0.025)),
      },
    }));
  }, [allTrades, devAddress, monPrice]);

  return (
    <>
      <Head><title>{pageTitle}</title></Head>

      <div
        className="h-screen w-full flex flex-col overflow-hidden"
        style={{
          backgroundColor: "#0f1012",
          color: AX.text,
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
        }}
      >
        <Header search={search} setSearch={setSearch} />

        {loading && !displayToken && (
          <div className="text-center text-xs px-2 py-1.5 flex-shrink-0"
               style={{ color: AX.text, backgroundColor: "#2A2414", borderTop: `1px solid ${AX.border}`, borderBottom: `1px solid ${AX.border}` }}>
            Loading Monad token data…
          </div>
        )}

        <div
          className="flex flex-1 w-full max-w-full overflow-hidden min-h-0"
          style={{
            minHeight: 0,
            flex: '1 1 auto',
          }}
        >
          {/* LEFT: chart + tables */}
          <div
            ref={containerRef}
            className="flex-1 min-w-0 max-w-full flex flex-col pb-0"
            style={{
              borderRight: `1px solid ${AX.border}`,
              minHeight: 0,
              height: '100%',
              overflow: 'hidden',
            }}
          >
            {/* TOP pane - Chart */}
            <div
              className="flex-shrink-0 flex flex-col"
              style={{
                height: topPanePx,
                minHeight: `${MIN_CHART_HEIGHT}px`,
                transition: isResizing ? 'none' : 'height 0.2s ease-out',
                willChange: isResizing ? 'height' : 'auto',
              }}
            >
              <div className="px-2 flex-shrink-0">
                <TradeHeader
                  token={displayTokenWithChartMetrics as any}
                  livePriceUsd={chartMetrics?.lastPriceUsd}
                  liveMarketCapUsd={priorityMarketCapUsd}
                />
              </div>

              <div className="px-3 border-b border-[#2A2B33]" style={{ marginTop: '2px' }} />

              <div
                id="chart-container-wrapper"
                className="flex-1 min-h-[240px] relative chart-wrapper w-full overflow-hidden"
                style={{
                  height: '100%',
                  width: '100%',
                  position: 'relative',
                  minHeight: 0,
                  minWidth: 0,
                }}
              >
                {pairAddress && pairAddress.length >= 20 ? (
                  <AdvancedOHLCChart
                    key={`monad-chart-${pairAddress}`} // Force remount when token changes during client-side navigation
                    mint={typeof _mint === "string" ? _mint : displayToken?.mint}
                    pairAddress={pairAddress}
                    interval={currentOHLCParams.interval}
                    timeframe={currentOHLCParams.timeframe}
                    optimize={currentOHLCParams.optimize}
                    height="100%"
                    width="100%"
                    baseRefreshMs={10000}
                    className="relative"
                    tradeData={devTrades}
                    creatorAddress={devAddress}
                    tokenSymbol={displayToken?.symbol || null}
                    tokenName={displayToken?.name || null}
                    tokenDecimals={displayToken?.decimals || null}
                    network="monad"
                    priceLines={priceLineValues}
                    onChartMetrics={handleChartMetrics}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full" style={{ color: AX.muted }}>
                    Chart data not available for this Monad token
                  </div>
                )}
              </div>
            </div>

            {/* Resizer */}
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize chart and trades panels"
              tabIndex={0}
              onPointerDown={(e) => {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                const startY = e.clientY;
                const startTop = topPanePxRef.current;
                (e.target as Element).setPointerCapture(e.pointerId);
                setIsResizing(true);
                document.body.style.cursor = "row-resize";
                document.body.style.userSelect = "none";
                const onMove = (ev: PointerEvent) => {
                  ev.preventDefault();
                  const currentY = ev.clientY;
                  const delta = currentY - startY;
                  const newHeight = clampTop(startTop + delta);
                  setTopPanePx(newHeight);
                  topPanePxRef.current = newHeight;
                };
                const onUp = (ev: PointerEvent) => {
                  (e.target as Element).releasePointerCapture(e.pointerId);
                  setIsResizing(false);
                  document.body.style.cursor = "";
                  document.body.style.userSelect = "";
                  (e.target as Element).removeEventListener("pointermove", onMove);
                  (e.target as Element).removeEventListener("pointerup", onUp);
                  (e.target as Element).removeEventListener("pointercancel", onUp);
                };
                (e.target as Element).addEventListener("pointermove", onMove, { passive: false });
                (e.target as Element).addEventListener("pointerup", onUp, { passive: false });
                (e.target as Element).addEventListener("pointercancel", onUp, { passive: false });
              }}
              className="relative h-1.5 cursor-row-resize select-none touch-none flex-shrink-0 flex items-center justify-center hover:bg-gray-800/20 transition-colors"
              style={{ touchAction: "none", zIndex: 10, pointerEvents: "auto" }}
            >
              <div className="flex items-center gap-0.5">
                <div className="w-0.5 h-0.5 rounded-full bg-gray-500" />
                <div className="w-0.5 h-0.5 rounded-full bg-gray-500" />
                <div className="w-0.5 h-0.5 rounded-full bg-gray-500" />
              </div>
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-gray-700/20" />
            </div>

            {/* BOTTOM pane (tabs + tables) */}
            <div id="tabs-pane" className="flex-1 flex flex-col min-h-0" style={{ overflow: 'hidden' }}>
              {/* Tab Header */}
              <div className="flex gap-4 pt-2 px-3 text-xs items-center justify-between flex-shrink-0">
                <div className="flex gap-4 items-center">
                  <button
                    onClick={() => setSelectedTab("Transactions")}
                    className={`px-3 py-1 font-semibold transition-colors ${
                      selectedTab === "Transactions"
                        ? "border-b-4 text-white"
                        : "text-neutral-400 hover:text-neutral-300"
                    }`}
                    style={selectedTab === "Transactions" ? { borderBottomColor: AX.mint } : undefined}
                  >
                    Transactions
                  </button>
                  <button
                    onClick={() => setSelectedTab("Top Traders")}
                    className={`px-3 py-1 font-semibold transition-colors ${
                      selectedTab === "Top Traders"
                        ? "border-b-4 text-white"
                        : "text-neutral-400 hover:text-neutral-300"
                    }`}
                    style={selectedTab === "Top Traders" ? { borderBottomColor: AX.mint } : undefined}
                  >
                    Top Traders
                  </button>
                  <button
                    onClick={() => setSelectedTab("Holders")}
                    className={`px-3 py-1 font-semibold transition-colors ${
                      selectedTab === "Holders"
                        ? "border-b-4 text-white"
                        : "text-neutral-400 hover:text-neutral-300"
                    }`}
                    style={selectedTab === "Holders" ? { borderBottomColor: AX.mint } : undefined}
                  >
                    Holders
                  </button>
                  <button
                    onClick={() => setSelectedTab("Dev Tokens")}
                    className={`px-3 py-1 font-semibold transition-colors ${
                      selectedTab === "Dev Tokens"
                        ? "border-b-4 text-white"
                        : "text-neutral-400 hover:text-neutral-300"
                    }`}
                    style={selectedTab === "Dev Tokens" ? { borderBottomColor: AX.mint } : undefined}
                  >
                    Dev Tokens
                  </button>
                </div>
                <button
                  className="px-4 py-1.5 font-semibold flex items-center gap-2 transition-colors rounded-full ml-auto"
                  style={{ backgroundColor: AX.bg, color: AX.mint }}
                  onClick={() => setIsInstantTradeOpen(true)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                  </svg>
                  <span>Instant Trade</span>
                </button>
              </div>
              <div className="flex-1 min-h-0 relative">
                <div className={`absolute inset-0 flex flex-col ${selectedTab === "Transactions" ? "" : "hidden"}`}>
                  <MonadTrades
                    tokenAddress={tokenMintForLive}
                    cachedTrades={(tokenData as any)?.recent_trades || []}
                  />
                </div>
                <div className={`absolute inset-0 flex flex-col ${selectedTab === "Top Traders" ? "" : "hidden"}`}>
                  <MonadTopTradersTable
                    tokenAddress={contractAddress as string}
                    enabled={true}
                  />
                </div>
                <div className={`absolute inset-0 flex flex-col ${selectedTab === "Holders" ? "" : "hidden"}`}>
                  <MonadHoldersTable
                    tokenAddress={contractAddress as string}
                    enabled={true}
                  />
                </div>
                <div className={`absolute inset-0 flex flex-col ${selectedTab === "Dev Tokens" ? "" : "hidden"}`}>
                  <MonadDevTokensTable
                    tokenAddress={contractAddress as string}
                    enabled={true}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: action panel */}
          <div className="flex-shrink-0 min-w-[260px] basis-[280px] md:basis-[310px] lg:basis-[330px] hidden lg:flex flex-col overflow-y-auto h-full pb-12">
            <div className="right-rail-panel token-info-panel">
              <MonadTradeActionPanel token={displayToken as any} />
            </div>
          </div>

          {/* Trade button for mobile */}
          <div className="fixed bottom-0 left-0 w-full p-4 z-50 lg:hidden mb-10">
            <button className="w-full bg-emerald-500 text-white p-2 rounded-lg cursor-pointer"
                    onClick={() => setShowMobileTradeModal(true)}>
              Trade
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Trade Modal */}
      {showMobileTradeModal && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <div className={`absolute inset-0 bg-black/70 bg-opacity-50 transition-opacity duration-300 ${isClosingModal ? "opacity-0" : "opacity-100"}`} onClick={closeModal}/>
          <div ref={modalDragRef}
               className={`absolute bottom-0 left-0 right-0 bg-[#0f1012] rounded-t-xl shadow-2xl max-h-[85vh] flex flex-col ${isClosingModal ? "mobile-trade-modal-closing" : "mobile-trade-modal"}`}
               style={{ touchAction: "none" }}>
            <div className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing select-none"
                 onTouchStart={handleDragStart} onTouchMove={handleDragMove} onTouchEnd={handleDragEnd}
                 onMouseDown={handleDragStart} style={{ touchAction: "none" }}>
              <div className="w-12 h-1 bg-[#2A2B33] rounded-full" />
            </div>
            <div className="flex justify-end pr-4 pb-2">
              <button onClick={closeModal} className="w-8 h-8 rounded-full bg-[#2A2B33] flex items-center justify-center text-[#9CA3AF] hover:bg-[#1E1F26] transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <MonadTradeActionPanel token={displayToken as any} />
            </div>
          </div>
        </div>
      )}

      <Footer />
      
      {/* Instant Trade Modal */}
      <InstantTradeModal
        isOpen={isInstantTradeOpen}
        onClose={() => setIsInstantTradeOpen(false)}
        token={displayToken as any}
      />

      {/* Global styles */}
      <style jsx global>{`
        .lightweight-chart-container, .ohlc-chart-container, .tv-lightweight-charts { width:100% !important; height:100% !important; }
        .tv-lightweight-charts .pane { overflow: visible !important; }
        .tv-lightweight-charts canvas { image-rendering: pixelated; image-rendering: -moz-crisp-edges; image-rendering: crisp-edges; }
        .chart-wrapper {
          display:flex;
          flex-direction:column;
          position:relative;
          max-width:100%;
          width: 100%;
          height: 100%;
          min-height: 240px;
        }
        .chart-wrapper > * {
          max-width:100%;
          width: 100%;
          height: 100%;
          flex: 1;
          min-height: 0;
        }
        [role="separator"] { pointer-events:auto; position:relative; }
        [role="separator"]:hover { opacity:1; }
        #tabs-pane { margin-top:0 !important; padding-top:0 !important; }
        #tabs-pane > * { margin-top:0 !important; padding-top:0 !important; }
        #tabs-pane > div:first-of-type, #tabs-pane [class*="tabs"]:first-of-type, #tabs-pane [class*="Tab"]:first-of-type {
          margin-top:0 !important; padding-top:0 !important;
        }
        .chart-wrapper, .chart-wrapper > * { margin-bottom:0 !important; padding-bottom:0 !important; }
        .right-rail-panel { margin: 0; }
        .right-rail-panel + .right-rail-panel { margin-top: 0; }
        .token-info-panel > *:last-child { margin-bottom: 0 !important; padding-bottom: 0 !important; }
        .mobile-trade-modal { animation: slideUp 0.3s ease-out; transition: transform 0.3s ease-out; }
        .mobile-trade-modal-closing { animation: slideDown 0.3s ease-in; }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slideDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
        body.modal-open { overflow: hidden; }
      `}</style>
    </>
  );
}
