"use client";

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import InterstateTable from './InterstateTable';
import type { Token } from '~/utils/db';
import usePaginatedTokensWithFallback from '../hooks/usePaginatedTokensWithFallback';
import { usePumpPortalWebSocket } from '../hooks/usePumpPortalWebSocket';
import { useQuickBuy } from "./QuickBuyContext";
import QuickBuySettingsModal from './QuickBuySettingsModal';
import { useFilter } from './FilterContext';
import FilterPopout from './FilterPopout';
import { SOL_MINT_ADDRESS } from "~/utils/api";
import { executeEnhancedTrade } from "~/utils/enhancedTradeHandler";
import { showEnhancedToast } from "~/utils/enhancedToast";
import { useUser } from "./UserContext";
import PumpLive, { type PumpItem } from './PumpLive';
import { FaRunning, FaGasPump, FaCoins, FaBan } from "react-icons/fa";
import { HiLightningBolt } from "react-icons/hi";
import { BsSliders2 } from "react-icons/bs";
import { prefetchTradeData } from "~/utils/tokenCache";

const WRAPPED_SOL_MINT = SOL_MINT_ADDRESS;

export type Timeframe = "5m" | "1h" | "6h" | "24h";

// Extend Token with optional flags
type TokenWithDexPaid = Token & { dexPaid?: boolean };

export default function DiscoverContent() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'trending' | 'newPairs' | 'xStocks' | 'surge' | 'dex' | 'live'>('newPairs');
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("1h");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFilterPopoutOpen, setIsFilterPopoutOpen] = useState(false);
  const { filter } = useFilter();
  const [localFilters, setLocalFilters] = useState(filter);
  const { presets, activePreset, setActivePreset } = useQuickBuy();
  const { user, solBalance } = useUser();

  // Load quickBuyAmount from localStorage with fallback
  const getInitialQuickBuyAmount = () => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('quickBuyAmount');
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 0) {
          return parsed;
        }
      }
    }
    return 0.05;
  };

  const [quickBuyAmount, setQuickBuyAmount] = useState(getInitialQuickBuyAmount().toString());
  const [selectedPill, setSelectedPill] = useState('P1');
  const [showPillTooltip, setShowPillTooltip] = useState<string | null>(null);
  const tokenMapRef = useRef<Map<string, TokenWithDexPaid>>(new Map());
  const [filteredTokens, setFilteredTokens] = useState<TokenWithDexPaid[]>([]);
  const [displayed, setDisplayed] = useState<TokenWithDexPaid[]>([]);
  const [sortKey, setSortKey] = useState<"market_cap_total" | "liquidity" | "volume" | "txns" | "name" | "total_liquidity_usd" | "fully_diluted_value">("volume");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [newPairsRaw, setNewPairsRaw] = useState<TokenWithDexPaid[]>([]);
  const [newPairsLoading, setNewPairsLoading] = useState(false);
  const [newPairsError, setNewPairsError] = useState<string | null>(null);
  
  // xStocks state
  const [xStocksRaw, setXStocksRaw] = useState<TokenWithDexPaid[]>(() => {
    // Initialize with cached data if available
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('discover_xstocks_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          const age = Date.now() - parsed.timestamp;
          if (age < 60 * 1000 && parsed.data && parsed.data.length > 0) {
            return parsed.data;
          }
        }
      } catch {
        // Ignore cache errors on init
      }
    }
    return [];
  });
  const [xStocksLoading, setXStocksLoading] = useState(false);
  const [xStocksError, setXStocksError] = useState<string | null>(null);

  // Image cache
  const imageCacheRef = useRef<Map<string, { cover?: string; avatar?: string }>>(new Map());
  const preloadedRef = useRef<Set<string>>(new Set());

  const getTokenId = (t: any) => t?.pair_address || t?.mint || undefined;

  // Helper to check if a token is wrapped SOL
  const isWrappedSol = useCallback((token: any): boolean => {
    if (!token || !token.mint) return false;
    if (token.mint === WRAPPED_SOL_MINT) return true;
    const symbol = (token.symbol || '').toLowerCase().trim();
    const name = (token.name || '').toLowerCase().trim();
    const wrappedSolVariations = [
      'wrapped sol', 'wsol', 'wrapped solana', 'wsolana', 'wrapped-sol',
      'wrapped-solana', 'solwrapped', 'solw', 'w.sol', 'w sol', 'sol wrapped'
    ];
    const isWrappedSolSymbol = wrappedSolVariations.some(variant => 
      symbol === variant || symbol.includes(variant) ||
      name === variant || name.includes(variant)
    );
    const isWrappedSolMint = token.mint.startsWith('So111');
    return isWrappedSolSymbol || isWrappedSolMint;
  }, []);

  const getNewPairTimestamp = useCallback((token: any): number => {
    if (!token) return 0;
    let v: any = token?.migrated_time ?? token?.migratedTime ?? token?.launch_time ?? 
                 token?.launchTime ?? token?.created_at ?? token?.createdAt ?? 
                 token?.firstSeen ?? token?.first_seen ?? token?.pair_created_at ?? 
                 token?.pairCreatedAt ?? token?.timestamp ?? token?.ts ?? null;
    if (v && typeof v === 'object') {
      if ('Time' in v && typeof (v as any).Time === 'string') v = (v as any).Time;
      else if ('time' in v && typeof (v as any).time === 'string') v = (v as any).time;
      else if ('seconds' in v && typeof (v as any).seconds === 'number') {
        const sec = Number((v as any).seconds);
        return sec > 1e12 ? sec : sec > 1e9 ? sec * 1000 : 0;
      }
    }
    if (!v) return 0;
    if (typeof v === 'number') return v > 1e12 ? v : v > 1e9 ? v * 1000 : 0;
    if (typeof v === 'string') {
      const n = Number(v);
      if (!Number.isNaN(n) && n > 0) return n > 1e12 ? n : n > 1e9 ? n * 1000 : 0;
      const d = Date.parse(v);
      return Number.isNaN(d) ? 0 : d;
    }
    if (v instanceof Date) return v.getTime();
    return 0;
  }, []);

  const pickImageCandidates = (t: any) => {
    const coverCandidate = t?.image || t?.logo || t?.uri || undefined;
    const avatarCandidate = t?.logo || t?.image || undefined;
    return { coverCandidate, avatarCandidate };
  };

  const getCachedImagesForToken = (t: any) => {
    const id = getTokenId(t);
    const { coverCandidate, avatarCandidate } = pickImageCandidates(t);
    const cached = id ? imageCacheRef.current.get(id) : undefined;
    let cover = cached?.cover;
    let avatar = cached?.avatar;
    if (coverCandidate && cover !== coverCandidate) cover = coverCandidate;
    if (avatarCandidate && avatar !== avatarCandidate) avatar = avatarCandidate;
    if (id) {
      imageCacheRef.current.set(id, { cover, avatar });
      const preloadKey = `${id}:${cover ?? ''}|${avatar ?? ''}`;
      if (!preloadedRef.current.has(preloadKey)) {
        if (cover) { const i = new Image(); i.decoding = 'async'; i.loading = 'eager'; i.src = cover; }
        if (avatar) { const i2 = new Image(); i2.decoding = 'async'; i2.loading = 'eager'; i2.src = avatar; }
        preloadedRef.current.add(preloadKey);
      }
    }
    return { cover, avatar };
  };

  // WebSocket token service
  const {
    data: allTokens,
    loading: tokensLoading,
    isConnected,
    error: tokenError,
    usingFallback,
  } = usePaginatedTokensWithFallback({
    filter: 'trending',
    timeframe: selectedTimeframe,
    limit: 200
  });

  // PumpPortal WebSocket for live pump section
  const {
    tokens: pumpPortalTokens,
    connected: pumpPortalConnected,
    error: pumpPortalError,
  } = usePumpPortalWebSocket({
    enabled: activeTab === 'live',
  });

  // Fetch new pairs
  useEffect(() => {
    let cancelled = false;
    const CACHE_KEY = 'discover_new_pairs_cache';
    const CACHE_TTL = 30 * 1000;

    const fetchNewPairs = async (showLoading: boolean, forceRefresh: boolean) => {
      if (cancelled) return;

      if (!forceRefresh && typeof window !== 'undefined') {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            const age = Date.now() - parsed.timestamp;
            if (age < CACHE_TTL && parsed.data && parsed.data.length > 0) {
              setNewPairsRaw(parsed.data);
              setNewPairsError(null);
              setNewPairsLoading(false);
              return;
            }
          } catch {
            // Ignore cache errors
          }
        }
      }

      if (showLoading) setNewPairsLoading(true);

      try {
        const response = await fetch(`/api/token-service/pulse-new?limit=200&fresh=1`, {
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        });

        if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
        const payload = await response.json();
        if (cancelled) return;

        if (Array.isArray(payload)) {
          const normalizePulseToken = (token: any): TokenWithDexPaid => {
            const toNumber = (value: any): number => {
              if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
              if (typeof value === 'string') {
                const cleaned = value.trim();
                if (!cleaned) return 0;
                const parsed = Number(cleaned);
                return Number.isFinite(parsed) ? parsed : 0;
              }
              return 0;
            };

            const normalized: Record<string, any> = { ...token };
            normalized.market_cap_usd = toNumber(token.market_cap_usd ?? token.marketCapUsd ?? token.fully_diluted_value);
            normalized.fully_diluted_value = normalized.market_cap_usd;
            normalized.liquidity_usd = toNumber(token.liquidity_usd ?? token.total_liquidity_usd ?? token.total_liquidityUsd);
            normalized.total_liquidity_usd = normalized.liquidity_usd;

            const sumVolumes = (buy: any, sell: any): number => toNumber(buy) + toNumber(sell);
            const sum24h = sumVolumes(token.total_buy_volume_24h, token.total_sell_volume_24h);
            normalized.volume_24h = sum24h > 0 ? sum24h : toNumber(token.volume_24h ?? token.volume24h);
            const sum6h = sumVolumes(token.total_buy_volume_6h, token.total_sell_volume_6h);
            normalized.volume_6h = sum6h > 0 ? sum6h : toNumber(token.volume_6h ?? token.volume6h);
            const sum1h = sumVolumes(token.total_buy_volume_1h, token.total_sell_volume_1h);
            normalized.volume_1h = sum1h > 0 ? sum1h : toNumber(token.volume_1h ?? token.volume1h);
            const sum5m = sumVolumes(token.total_buy_volume_5m, token.total_sell_volume_5m);
            normalized.volume_5m = sum5m > 0 ? sum5m : toNumber(token.volume_5m ?? token.volume5m);

            if (token.logo) normalized.logo = token.logo;
            if (token.image) normalized.image = token.image;
            if (token.uri) normalized.uri = token.uri;
            if (token.launchpad_protocol) normalized.launchpad_protocol = token.launchpad_protocol;
            else if (token.launchpadProtocol) normalized.launchpad_protocol = token.launchpadProtocol;
            else if (token.protocol) normalized.launchpad_protocol = token.protocol;

            const getFirstString = (...candidates: any[]): string | undefined => {
              for (const candidate of candidates) {
                if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim();
              }
              return undefined;
            };

            const migratedPoolAddress = getFirstString(
              token.migrated_pool_address, token.migratedPoolAddress, token.migrated_pool?.address,
              token.migratedPool?.address, token.target_pool_address, token.targetPoolAddress
            );
            const originalPairAddress = getFirstString(
              token.pair_address, token.pairAddress, token.bonding_curve?.address, token.bondingCurveKey
            );
            const fallbackPoolAddress = getFirstString(
              token.poolAddress, token.pool_address, token.amm_id, token.ammId
            );

            if (migratedPoolAddress) normalized.migrated_pool_address = migratedPoolAddress;
            const effectivePairAddress = originalPairAddress || migratedPoolAddress || fallbackPoolAddress;
            if (effectivePairAddress) normalized.pair_address = effectivePairAddress;

            return normalized as TokenWithDexPaid;
          };

          const normalized = payload.map(normalizePulseToken).filter(t => t && t.mint && !isWrappedSol(t));
          if (cancelled) return;

          setNewPairsRaw(normalized);
          setNewPairsError(null);

          if (typeof window !== 'undefined') {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ data: normalized, timestamp: Date.now() }));
          }
        }
      } catch (error: any) {
        if (cancelled) return;
        setNewPairsError(error.message || 'Failed to load new pairs');
      } finally {
        if (!cancelled) setNewPairsLoading(false);
      }
    };

    fetchNewPairs(true, false);
    const intervalId = setInterval(() => fetchNewPairs(false, true), 30000);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  // Fetch xStocks data
  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const CACHE_KEY = 'discover_xstocks_cache';
    const CACHE_TTL = 30 * 1000; // 30 seconds
    const STALE_THRESHOLD = 60 * 1000; // 60 seconds

    const loadFromCache = (): TokenWithDexPaid[] | null => {
      try {
        if (typeof window === 'undefined') return null;
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          const age = Date.now() - parsed.timestamp;
          if (age < STALE_THRESHOLD) {
            return parsed.data;
          } else {
            localStorage.removeItem(CACHE_KEY);
          }
        }
      } catch (err) {
        console.warn('[DiscoverContent] Failed to load xStocks cache:', err);
        localStorage.removeItem(CACHE_KEY);
      }
      return null;
    };

    const saveToCache = (data: TokenWithDexPaid[]) => {
      try {
        if (typeof window === 'undefined') return;
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          data,
          timestamp: Date.now(),
        }));
      } catch (err) {
        console.warn('[DiscoverContent] Failed to save xStocks cache:', err);
      }
    };

    const toNumber = (value: any): number => {
      if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
      }
      if (typeof value === 'string') {
        const cleaned = value.trim();
        if (!cleaned || cleaned === '0' || cleaned === 'null') return 0;
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      return 0;
    };

    const normalizeXStocksToken = (result: any): TokenWithDexPaid => {
      const token = result.token || {};
      const pair = result.pair || {};

      const getImage = () => {
        return token.info?.imageThumbUrl || token.info?.imageSmallUrl || token.info?.imageLargeUrl ||
               token.imageThumbUrl || token.imageSmallUrl || token.imageLargeUrl ||
               undefined;
      };

      const marketCap = toNumber(result.marketCap || '0');
      const liquidity = toNumber(result.liquidity || '0');
      
      const volume24h = toNumber(result.volume24 || '0');
      const volume12h = toNumber(result.volume12 || '0');
      const volume4h = toNumber(result.volume4 || '0');
      const volume1h = toNumber(result.volume1 || '0');
      const volume5m = toNumber(result.volume5m || '0');
      
      const change24h = toNumber(result.change24 || '0');
      const change12h = toNumber(result.change12 || '0');
      const change4h = toNumber(result.change4 || '0');
      const change1h = toNumber(result.change1 || '0');
      const change5m = toNumber(result.change5m || '0');

      const normalized: Record<string, any> = {
        mint: token.address || '',
        name: token.name || '',
        symbol: token.symbol || '',
        decimals: token.decimals || 9,
        networkId: token.networkId || 1399811149,
        
        market_cap_usd: marketCap,
        fully_diluted_value: marketCap,
        liquidity_usd: liquidity,
        total_liquidity_usd: liquidity,
        price_usd: toNumber(result.priceUSD || '0'),
        
        volume_24h: volume24h,
        volume_12h: volume12h,
        volume_6h: volume4h > 0 ? volume4h : (volume12h / 2),
        volume_4h: volume4h,
        volume_1h: volume1h,
        volume_5m: volume5m,
        
        price_percent_change_24h: change24h * 100,
        price_percent_change_12h: change12h * 100,
        price_percent_change_6h: change4h * 100,
        price_percent_change_4h: change4h * 100,
        price_percent_change_1h: change1h * 100,
        price_percent_change_5m: change5m * 100,
        
        pair_address: pair.address || token.address || '',
        created_at: result.createdAt || pair.createdAt || Date.now(),
        
        // Protocol - xStocks use Raydium Launchpad
        protocol: 'Raydium Launchpad',
        launchpad_protocol: 'Raydium Launchpad',
        
        uri: getImage(),
        logo: getImage(),
        image: getImage(),
        imageUrl: getImage(),
        
        holders: result.holders || 0,
        
        total_buys_1h: toNumber(result.buyCount1 || '0'),
        total_buys_6h: toNumber(result.buyCount4 || '0'),
        total_buys_12h: toNumber(result.buyCount12 || '0'),
        total_buys_24h: toNumber(result.buyCount24 || '0'),
        total_buys_5m: toNumber(result.buyCount5m || '0'),
        
        total_sells_1h: toNumber(result.sellCount1 || '0'),
        total_sells_6h: toNumber(result.sellCount4 || '0'),
        total_sells_12h: toNumber(result.sellCount12 || '0'),
        total_sells_24h: toNumber(result.sellCount24 || '0'),
        total_sells_5m: toNumber(result.sellCount5m || '0'),
        
        txnCount1h: toNumber(result.txnCount1 || '0'),
        txnCount6h: toNumber(result.txnCount4 || '0'),
        txnCount12h: toNumber(result.txnCount12 || '0'),
        txnCount24h: toNumber(result.txnCount24 || '0'),
        txnCount5m: toNumber(result.txnCount5m || '0'),
        
        buyCount24: result.buyCount24 || 0,
        sellCount24: result.sellCount24 || 0,
        txnCount24: result.txnCount24 || 0,
      };

      return normalized as TokenWithDexPaid;
    };

    const fetchXStocks = async (useCache = true, showLoading = false) => {
      if (cancelled) return;

      if (useCache) {
        const cached = loadFromCache();
        if (cached && cached.length > 0) {
          setXStocksRaw(cached);
          setXStocksError(null);
          setXStocksLoading(false);
          
          try {
            const cachedData = localStorage.getItem(CACHE_KEY);
            if (cachedData) {
              const parsed = JSON.parse(cachedData);
              const age = Date.now() - parsed.timestamp;
              if (age > CACHE_TTL) {
                fetchXStocks(false, false).catch(err => {
                  console.error('[DiscoverContent] xStocks background refresh failed:', err);
                });
              }
            }
          } catch {
            // Ignore
          }
          return;
        }
      }

      if (showLoading) {
        setXStocksLoading(true);
      }

      try {
        const response = await fetch(`/api/token-service/xstocks?limit=50`, {
          headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = await response.json();
        if (cancelled) return;

        // Process filterTokens response from Codex
        if (payload?.data?.filterTokens?.results || payload?.filterTokens?.results) {
          // Handle both nested (payload.data.filterTokens) and direct (payload.filterTokens) formats
          const results = payload?.data?.filterTokens?.results || payload.filterTokens.results || [];
          
          const normalized = results
            .filter((result: any) => {
              const token = result.token;
              if (!token || !token.address) return false;
              if (isWrappedSol({ mint: token.address })) return false;
              
              const liq = toNumber(result.liquidity || '0');
              if (liq <= 0) return false;
              
              return true;
            })
            .map(normalizeXStocksToken);

          const seen = new Set<string>();
          const deduped = normalized.filter((token: TokenWithDexPaid) => {
            if (!token.mint || seen.has(token.mint)) return false;
            seen.add(token.mint);
            return true;
          });

          setXStocksRaw(deduped);
          setXStocksError(null);
          saveToCache(deduped);
        } else {
          // No results found
          setXStocksRaw([]);
          setXStocksError(null);
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to fetch xStocks';
        setXStocksError(message);
        console.error('[DiscoverContent] Failed to fetch xStocks:', err);
        
        if (useCache) {
          const cached = loadFromCache();
          if (cached && cached.length > 0) {
            setXStocksRaw(cached);
            setXStocksError(null);
          }
        }
      } finally {
        if (!cancelled && showLoading) {
          setXStocksLoading(false);
        }
      }
    };

    const hasInitialData = xStocksRaw.length > 0;
    
    if (hasInitialData) {
      setXStocksLoading(false);
      fetchXStocks(false, false).catch(err => {
        console.error('[DiscoverContent] xStocks background fetch failed:', err);
      });
    } else {
      fetchXStocks(true, true);
    }
    
    intervalId = setInterval(() => fetchXStocks(true, false), 60_000);

    return () => {
      cancelled = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  // Quick buy handler
  const handleQuickBuy = async (token: Token) => {
    if (!user?.bearerToken || !user?.id) {
      showEnhancedToast('warning', 'Please connect your wallet to trade', {
        title: 'Authentication Required',
      });
      return;
    }

    const buyAmount = parseFloat(quickBuyAmount);
    if (isNaN(buyAmount) || buyAmount <= 0) {
      showEnhancedToast('warning', 'Please enter a valid SOL amount (minimum 0.001 SOL)', {
        title: 'Invalid Amount',
      });
      return;
    }

    const presetIndex = parseInt(selectedPill.replace('P', '')) - 1;
    const preset = presets[presetIndex];
    if (!preset) {
      showEnhancedToast('error', 'Quick buy preset not configured', {
        title: 'Configuration Error',
      });
      return;
    }

    const settings = preset.quickBuySettings;
    await executeEnhancedTrade({
      token,
      amount: buyAmount,
      side: 'buy',
      settings,
      user: { bearerToken: user.bearerToken, id: user.id },
      solBalance: Number(solBalance || 0),
      solPriceUsd: 150,
      onSuccess: () => console.log('✅ Quick Buy successful'),
      onError: (error) => console.error('❌ Quick Buy failed:', error),
    });
  };

  const handleTimeframeClick = (tf: string) => {
    setSelectedTimeframe(tf as Timeframe);
    setSortKey("volume");
    setSortDirection("desc");
  };

  const getVolumeForTimeframe = useCallback((t: any, tf: Timeframe) => {
    let vol = t?.[`volume_${tf}`];
    if (typeof vol === 'number' && vol > 0) return vol;
    if (typeof vol === 'string' && vol.trim() !== '') {
      const n = parseFloat(vol);
      if (!isNaN(n) && n > 0) return n;
    }
    const buyVol = t?.[`total_buy_volume_${tf}`];
    const sellVol = t?.[`total_sell_volume_${tf}`];
    const buyNum = typeof buyVol === 'number' ? buyVol : (typeof buyVol === 'string' ? parseFloat(buyVol) || 0 : 0);
    const sellNum = typeof sellVol === 'number' ? sellVol : (typeof sellVol === 'string' ? parseFloat(sellVol) || 0 : 0);
    return buyNum + sellNum;
  }, []);

  const mapAmmToProtocolPatterns = useCallback((ammId: string): string[] => {
    switch (ammId) {
      case 'pump':
      case 'pump_amm':
        return ['pump.fun', 'pump'];
      case 'raydium_amm':
      case 'amm_v3':
        return ['raydium', 'raydiumlaunchpad'];
      case 'cp_amm':
      case 'lb_clmm':
        return ['meteora', 'meteora_v2'];
      case 'token_launchpad':
        return ['moonit', 'moonshot', 'moonshoot'];
      case 'raydium_launchpad':
        return ['bonk'];
      default:
        return [ammId.toLowerCase()];
    }
  }, []);

  const applyFilters = useCallback((tokens: TokenWithDexPaid[]) => {
    let filtered = [...tokens];

    if (localFilters.amms && localFilters.amms.length > 0) {
      const protocolPatterns = localFilters.amms.flatMap(ammId => mapAmmToProtocolPatterns(ammId));
      filtered = filtered.filter(token => {
        const launchpadProtocol = ((token as any).launchpad_protocol || '').toLowerCase();
        if (!launchpadProtocol) return false;
        return protocolPatterns.some(pattern => {
          const patternLower = pattern.toLowerCase();
          if (launchpadProtocol === patternLower) return true;
          if (launchpadProtocol.includes(patternLower) || patternLower.includes(launchpadProtocol)) return true;
          return false;
        });
      });
    }

    if (localFilters.searchKeywords.trim()) {
      const searchTerms = localFilters.searchKeywords.toLowerCase().split(',').map(term => term.trim()).filter(term => term);
      if (searchTerms.length > 0) {
        filtered = filtered.filter(token => {
          const tokenText = `${token.name || ''} ${token.symbol || ''}`.toLowerCase();
          return searchTerms.some(term => tokenText.includes(term));
        });
      }
    }

    if (localFilters.excludeKeywords.trim()) {
      const excludeTerms = localFilters.excludeKeywords.toLowerCase().split(',').map(term => term.trim()).filter(term => term);
      if (excludeTerms.length > 0) {
        filtered = filtered.filter(token => {
          const tokenText = `${token.name || ''} ${token.symbol || ''}`.toLowerCase();
          return !excludeTerms.some(term => tokenText.includes(term));
        });
      }
    }

    if (localFilters.marketCapMin || localFilters.marketCapMax) {
      filtered = filtered.filter(token => {
        const marketCap = Number(token.fully_diluted_value) || 0;
        const min = localFilters.marketCapMin ? Number(localFilters.marketCapMin) : 0;
        const max = localFilters.marketCapMax ? Number(localFilters.marketCapMax) : Infinity;
        return marketCap >= min && marketCap <= max;
      });
    }

    if (localFilters.volumeMin || localFilters.volumeMax) {
      filtered = filtered.filter(token => {
        const volume = getVolumeForTimeframe(token, selectedTimeframe);
        const min = localFilters.volumeMin ? Number(localFilters.volumeMin) : 0;
        const max = localFilters.volumeMax ? Number(localFilters.volumeMax) : Infinity;
        return volume >= min && volume <= max;
      });
    }

    if (localFilters.liquidityMin || localFilters.liquidityMax) {
      filtered = filtered.filter(token => {
        const liquidity = Number(token.total_liquidity_usd) || 0;
        const min = localFilters.liquidityMin ? Number(localFilters.liquidityMin) : 0;
        const max = localFilters.liquidityMax ? Number(localFilters.liquidityMax) : Infinity;
        return liquidity >= min && liquidity <= max;
      });
    }

    return filtered;
  }, [localFilters, selectedTimeframe, getVolumeForTimeframe, mapAmmToProtocolPatterns]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (localFilters.amms && localFilters.amms.length > 0) count += localFilters.amms.length;
    if (localFilters.searchKeywords?.trim()) count++;
    if (localFilters.excludeKeywords?.trim()) count++;
    if (localFilters.dexPaid) count++;
    if (localFilters.marketCapMin || localFilters.marketCapMax) count++;
    if (localFilters.volumeMin || localFilters.volumeMax) count++;
    if (localFilters.liquidityMin || localFilters.liquidityMax) count++;
    return count;
  }, [localFilters]);

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  // Update token map when allTokens changes
  useEffect(() => {
    if (allTokens && Array.isArray(allTokens)) {
      const newMap = new Map<string, TokenWithDexPaid>();
      allTokens.forEach((token: any) => {
        if (!token || !token.mint || isWrappedSol(token)) return;
        if (token.quoteMint === WRAPPED_SOL_MINT && !token.pair_address && !token.mint) return;
        const tokenCopy = JSON.parse(JSON.stringify(token)) as TokenWithDexPaid;
        const baseKey = tokenCopy.mint || tokenCopy.pair_address;
        if (!baseKey || baseKey === WRAPPED_SOL_MINT || isWrappedSol(tokenCopy)) return;
        const existing = newMap.get(baseKey);
        if (existing) {
          const existingKeys = Object.keys(existing).length;
          const newKeys = Object.keys(tokenCopy).length;
          if (newKeys > existingKeys) newMap.set(baseKey, tokenCopy);
        } else {
          newMap.set(baseKey, tokenCopy);
        }
      });
      tokenMapRef.current = newMap;
      const arr = Array.from(tokenMapRef.current.values());
      const filtered = arr.filter(t => !isWrappedSol(t));
      setFilteredTokens(filtered);
    }
  }, [allTokens, isWrappedSol]);

  // Update displayed tokens
  useEffect(() => {
    if (activeTab === "trending") {
      const arr = Array.from(tokenMapRef.current.values());
      const safeArr = arr.filter(t => t && t.mint && !isWrappedSol(t));
      const filtered = applyFilters(safeArr);
      const baselineThreshold = Math.max(
        10,
        Math.floor(Math.min(safeArr.length, 80) * 0.25)
      );
      const shouldUseBaseline =
        activeFilterCount === 0 &&
        safeArr.length > 0 &&
        filtered.length < Math.min(baselineThreshold, safeArr.length);
      const workingTokens = shouldUseBaseline ? safeArr : filtered;
      const sortedTokens = workingTokens.map(t => JSON.parse(JSON.stringify(t)));
      sortedTokens.sort((a, b) => {
        if (!a || !b || isWrappedSol(a) || isWrappedSol(b)) return 0;
        let aVal = 0, bVal = 0;
        if (sortKey === 'volume') {
          aVal = getVolumeForTimeframe(a, selectedTimeframe);
          bVal = getVolumeForTimeframe(b, selectedTimeframe);
        } else if (sortKey === 'liquidity' || sortKey === 'total_liquidity_usd') {
          aVal = Number((a as any).total_liquidity_usd) || 0;
          bVal = Number((b as any).total_liquidity_usd) || 0;
        } else if (sortKey === 'market_cap_total' || sortKey === 'fully_diluted_value') {
          aVal = Number((a as any).fully_diluted_value) || 0;
          bVal = Number((b as any).fully_diluted_value) || 0;
        } else {
          aVal = Number((a as any)[sortKey]) || 0;
          bVal = Number((b as any)[sortKey]) || 0;
        }
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      });
      const finalSafe = sortedTokens.filter(t => t && t.mint && !isWrappedSol(t));
      const withImages = finalSafe.filter((t: any) => {
        const hasImage = t?.uri || t?.logo || t?.image || t?.imageUrl;
        return hasImage && hasImage !== '' && hasImage !== 'null' && hasImage !== null;
      });
      const seenAddresses = new Set<string>();
      const seenMints = new Set<string>();
      const uniqueSafe: TokenWithDexPaid[] = [];
      for (const token of withImages) {
        const mint = token.mint;
        const address = token.pair_address;
        if (mint && seenMints.has(mint)) continue;
        if (address && seenAddresses.has(address)) continue;
        if (mint) seenMints.add(mint);
        if (address) seenAddresses.add(address);
        uniqueSafe.push(token);
      }
      setDisplayed(uniqueSafe);
    } else if (activeTab === "dex") {
      const safe = filteredTokens.filter(t => t && t.mint && !isWrappedSol(t));
      setDisplayed(safe.slice(0, 10));
    } else {
      setDisplayed([]);
    }
  }, [activeTab, filteredTokens, sortKey, sortDirection, selectedTimeframe, applyFilters, getVolumeForTimeframe, isWrappedSol, activeFilterCount]);

  const processedNewPairs = useMemo(() => {
    if (!newPairsRaw || newPairsRaw.length === 0) return [] as TokenWithDexPaid[];
    const base = newPairsRaw.filter((token) => {
      if (!token || !token.mint || isWrappedSol(token)) return false;
      const protocol = ((token as any).launchpad_protocol || (token as any).launchpadProtocol || (token as any).protocol || '').toLowerCase();
      if (protocol.includes('meteora')) return false;
      const liquidity = Number((token as any).total_liquidity_usd || (token as any).liquidity_usd || 0);
      if (liquidity <= 0) return false;
      const hasVolume = ['1h', '6h', '24h', '5m'].some(tf => {
        const vol = getVolumeForTimeframe(token, tf as Timeframe);
        return vol > 0;
      });
      if (!hasVolume) return false;
      const hasImage = (token as any)?.uri || (token as any)?.logo || (token as any)?.image || (token as any)?.imageUrl;
      if (!hasImage || hasImage === '' || hasImage === 'null' || hasImage === null) return false;
      return true;
    });
    const filtered = applyFilters(base);
    const sortedTokens = filtered.map((token) => JSON.parse(JSON.stringify(token)) as TokenWithDexPaid);
    sortedTokens.sort((a, b) => {
      if (!a || !b) return 0;
      let aVal = 0, bVal = 0;
      if (sortKey === 'volume') {
        aVal = getVolumeForTimeframe(a, selectedTimeframe);
        bVal = getVolumeForTimeframe(b, selectedTimeframe);
      } else if (sortKey === 'liquidity' || sortKey === 'total_liquidity_usd') {
        aVal = Number((a as any).total_liquidity_usd) || 0;
        bVal = Number((b as any).total_liquidity_usd) || 0;
      } else if (sortKey === 'market_cap_total' || sortKey === 'fully_diluted_value') {
        aVal = Number((a as any).fully_diluted_value) || 0;
        bVal = Number((b as any).fully_diluted_value) || 0;
      } else {
        aVal = Number((a as any)[sortKey]) || 0;
        bVal = Number((b as any)[sortKey]) || 0;
      }
      const diff = sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      if (diff !== 0) return diff;
      const tsA = getNewPairTimestamp(a);
      const tsB = getNewPairTimestamp(b);
      return tsB - tsA;
    });
    const seenMints = new Set<string>();
    const seenAddresses = new Set<string>();
    const unique: TokenWithDexPaid[] = [];
    for (const token of sortedTokens) {
      const mint = token?.mint;
      const address = (token as any)?.pair_address;
      if (mint && seenMints.has(mint)) continue;
      if (address && seenAddresses.has(address)) continue;
      if (mint) seenMints.add(mint);
      if (address) seenAddresses.add(address);
      unique.push(token);
    }
    return unique;
  }, [newPairsRaw, applyFilters, getVolumeForTimeframe, getNewPairTimestamp, isWrappedSol, sortDirection, sortKey, selectedTimeframe]);

  const newPairsRows = useMemo(
    () => processedNewPairs.map((token, index) => ({ token, i: index })),
    [processedNewPairs]
  );

  // Process xStocks data similar to newPairs
  const processedXStocks = useMemo(() => {
    if (!xStocksRaw || xStocksRaw.length === 0) {
      return [] as TokenWithDexPaid[];
    }

    const base = xStocksRaw.filter((token) => {
      if (!token || !token.mint || isWrappedSol(token)) {
        return false;
      }
      const liquidity = Number((token as any).total_liquidity_usd || (token as any).liquidity_usd || 0);
      if (liquidity <= 0) {
        return false;
      }
      return true;
    });

    const filtered = applyFilters(base);

    const sortedTokens = [...filtered].sort((a, b) => {
      let aVal = 0, bVal = 0;
      if (sortKey === 'volume') {
        aVal = getVolumeForTimeframe(a, selectedTimeframe);
        bVal = getVolumeForTimeframe(b, selectedTimeframe);
      } else if (sortKey === 'liquidity' || sortKey === 'total_liquidity_usd') {
        aVal = Number((a as any).total_liquidity_usd) || 0;
        bVal = Number((b as any).total_liquidity_usd) || 0;
      } else if (sortKey === 'market_cap_total' || sortKey === 'fully_diluted_value') {
        aVal = Number((a as any).fully_diluted_value) || 0;
        bVal = Number((b as any).fully_diluted_value) || 0;
      } else {
        aVal = Number((a as any)[sortKey]) || 0;
        bVal = Number((b as any)[sortKey]) || 0;
      }
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });

    const seenMints = new Set<string>();
    const seenAddresses = new Set<string>();
    const unique: TokenWithDexPaid[] = [];

    for (const token of sortedTokens) {
      const mint = token?.mint;
      const address = (token as any)?.pair_address;

      if (mint && seenMints.has(mint)) continue;
      if (address && seenAddresses.has(address)) continue;

      if (mint) seenMints.add(mint);
      if (address) seenAddresses.add(address);
      unique.push(token);
    }

    return unique;
  }, [xStocksRaw, applyFilters, getVolumeForTimeframe, isWrappedSol, sortDirection, sortKey, selectedTimeframe]);

  const xStocksRows = useMemo(
    () =>
      processedXStocks.map((token, index) => ({
        token,
        i: index,
      })),
    [processedXStocks]
  );

  const renderPrimaryTable = () => {
    let content: React.ReactNode;

    if (displayed.length > 0) {
      content = (
        <InterstateTable
          rows={displayed.map((token, i) => ({ token: token as Token, i }))}
          onQuickBuy={handleQuickBuy}
          sortKey={sortKey}
          sortDirection={sortDirection}
          setSort={handleSort}
          selectedTimeframe={selectedTimeframe}
          quickBuyAmount={Number(quickBuyAmount) || 0}
        />
      );
    } else if (allTokens && Array.isArray(allTokens) && allTokens.length > 0) {
      content = (
        <InterstateTable
          rows={allTokens.map((token, i) => ({ token: token as Token, i }))}
          onQuickBuy={handleQuickBuy}
          sortKey={sortKey}
          sortDirection={sortDirection}
          setSort={handleSort}
          selectedTimeframe={selectedTimeframe}
          quickBuyAmount={Number(quickBuyAmount) || 0}
        />
      );
    } else if (tokensLoading) {
      content = (
        <div className="space-y-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-12 w-full bg-[#1E1F26] animate-pulse rounded" />
          ))}
        </div>
      );
    } else if (tokenError) {
      content = (
        <div className="py-10 text-center" style={{ color: '#f26681' }}>
          {tokenError}
        </div>
      );
    } else {
      content = (
        <div className="py-10 text-center text-[#9CA3AF]">
          No tokens found.
        </div>
      );
    }

    return (
      <section aria-label="Trending Tokens" className="pb-8">
        {content}
      </section>
    );
  };

  const toPumpPortalItem = (t: any): PumpItem => {
    const name = t?.name || t?.symbol || '—';
    const sym = t?.symbol ? String(t.symbol).slice(0, 12) : undefined;
    const desc = t?.description || t?.bio || '';
    const age = t?.timestamp 
      ? (() => {
          const seconds = Math.floor((Date.now() - t.timestamp) / 1000);
          if (seconds < 60) return `${seconds}s`;
          if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
          if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
          return `${Math.floor(seconds / 86400)}d`;
        })()
      : '1m';
    const mcNum = Number(t?.market_cap_usd || (t?.marketCapSol ? (t.marketCapSol * 170) : 0));
    const mc = mcNum > 0
      ? (mcNum >= 1_000_000 ? `$${(mcNum / 1_000_000).toFixed(2)}M`
         : mcNum >= 1_000 ? `$${(mcNum / 1_000).toFixed(2)}K`
         : `$${mcNum.toFixed(0)}`)
      : undefined;
    const { cover, avatar } = getCachedImagesForToken(t);
    const imageUrl = cover || t?.image || undefined;
    const avatarImageUrl = avatar || imageUrl || undefined;
    return {
      id: t?.pair_address || t?.mint || Math.random().toString(36).slice(2),
      name,
      symbol: sym,
      desc,
      age,
      mc,
      coverUrl: imageUrl,
      avatarUrl: avatarImageUrl,
      verified: false,
      hot: true,
      _rawToken: t,
    };
  };

  const liveLeftItems: PumpItem[] = pumpPortalTokens.slice(0, 30).map(toPumpPortalItem);
  const liveRightItems: PumpItem[] = pumpPortalTokens.slice(30, 60).map(toPumpPortalItem);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#111214] text-[#E6E7EA]">
      {/* Tab Navigation */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 lg:gap-6 px-4 sm:px-6 py-4 flex-shrink-0 border-b border-neutral-800/60">
        <div className="flex items-center gap-3 sm:gap-4 lg:gap-6 overflow-x-auto scrollbar-hide pb-2 lg:pb-0">
          <button
            className={`text-sm sm:text-base lg:text-lg font-light transition-colors whitespace-nowrap ${activeTab === "trending" ? "text-[#f0f5f5]" : "text-[#6B7280] hover:text-[#f0f5f5]"} cursor-pointer`}
            onClick={() => setActiveTab("trending")}
          >
            Trending
          </button>
          <button
            className={`text-sm sm:text-base lg:text-lg font-light transition-colors whitespace-nowrap ${activeTab === "newPairs" ? "text-[#f0f5f5]" : "text-[#6B7280] hover:text-[#f0f5f5]"} cursor-pointer`}
            onClick={() => setActiveTab("newPairs")}
          >
            New Pairs
          </button>
          <button
            className={`text-sm sm:text-base lg:text-lg font-light transition-colors whitespace-nowrap ${activeTab === "xStocks" ? "text-[#f0f5f5]" : "text-[#6B7280] hover:text-[#f0f5f5]"} cursor-pointer`}
            onClick={() => setActiveTab("xStocks")}
          >
            xStocks
          </button>
          <button
            className={`text-sm sm:text-base lg:text-lg font-light transition-colors whitespace-nowrap ${activeTab === "surge" ? "text-[#f0f5f5]" : "text-[#6B7280] hover:text-[#f0f5f5]"} cursor-pointer`}
            onClick={() => setActiveTab("surge")}
          >
            Surge
          </button>
          <button
            className={`text-sm sm:text-base lg:text-lg font-light transition-colors whitespace-nowrap ${activeTab === "live" ? "text-[#f0f5f5]" : "text-[#6B7280] hover:text-[#f0f5f5]"} cursor-pointer`}
            onClick={() => setActiveTab("live")}
          >
            Pump Live
          </button>
        </div>

        {/* Right controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 lg:gap-4">
          {/* Timeframes */}
          {activeTab !== 'live' && activeTab !== 'newPairs' && activeTab !== 'xStocks' && activeTab !== 'surge' && (
            <div className="hidden sm:flex items-center justify-center gap-1 rounded-md px-1.5 border relative"
                 style={{ borderColor: '#24252C', backgroundColor: '#272a2e', paddingTop: '4px', paddingBottom: '4px', minWidth: '130px', width: '130px', height: '28px' }}>
              {(["5m", "1h", "6h", "24h"] as Timeframe[]).map((tf: Timeframe) => (
                <button
                  key={tf}
                  className="px-1 text-sm font-medium transition-all duration-200 cursor-pointer flex items-center justify-center rounded whitespace-nowrap"
                  style={{
                    paddingTop: '2px',
                    paddingBottom: '2px',
                    backgroundColor: selectedTimeframe === tf 
                      ? 'rgba(24, 196, 140, 0.15)' 
                      : 'rgba(22, 23, 28, 0.6)',
                    color: selectedTimeframe === tf ? '#f0f5f5' : ''
                  }}
                  onClick={() => handleTimeframeClick(tf)}
                  onMouseEnter={(e) => {
                    if (selectedTimeframe !== tf) {
                      e.currentTarget.style.color = '#f0f5f5';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedTimeframe !== tf) {
                      e.currentTarget.style.color = '';
                    }
                  }}
                >
                  {tf}
                </button>
              ))}
            </div>
          )}

          {/* Filter button */}
          {activeTab !== 'live' && (
            <div className="hidden sm:flex items-center justify-center rounded-md px-1.5 gap-1 border relative"
                 style={{ borderColor: '#24252C', backgroundColor: '#272a2e', paddingTop: '4px', paddingBottom: '4px', minWidth: '85px', width: '85px', height: '28px' }}>
              <button
                className="flex items-center justify-between w-full h-full transition-all duration-200 cursor-pointer relative"
                onClick={() => setIsFilterPopoutOpen(true)}
                onMouseEnter={(e) => {
                  const text = e.currentTarget.querySelector('span');
                  const icon = e.currentTarget.querySelector('svg');
                  if (text) text.style.color = '#f0f5f5';
                  if (icon) icon.style.color = '#f0f5f5';
                }}
                onMouseLeave={(e) => {
                  const text = e.currentTarget.querySelector('span');
                  const icon = e.currentTarget.querySelector('svg');
                  const activeColor = isFilterPopoutOpen ? '#526fff' : '#9CA3AF';
                  if (text) text.style.color = activeColor;
                  if (icon) icon.style.color = activeColor;
                }}
              >
                <span 
                  className="text-sm font-medium"
                  style={{ color: isFilterPopoutOpen ? '#526fff' : '#9CA3AF' }}
                >
                  Filter
                </span>
                <BsSliders2 
                  size={14} 
                  style={{ color: isFilterPopoutOpen ? '#526fff' : '#9CA3AF' }}
                />
                {activeFilterCount > 0 && (
                  <span 
                    className="absolute -top-1 -right-1 text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold"
                    style={{ backgroundColor: '#85d99f', color: '#f0f5f5', fontSize: '10px' }}
                  >
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Thunder Icon and Amount Entry */}
          <div className="hidden sm:flex items-center justify-center rounded-md px-1.5 gap-1 border"
               style={{ borderColor: '#24252C', backgroundColor: '#272a2e', paddingTop: '4px', paddingBottom: '4px', minWidth: '85px', width: '85px', height: '28px' }}>
            <HiLightningBolt size={14} style={{ color: '#31e3ac' }} />
            <input
              type="text"
              value={quickBuyAmount}
              inputMode="decimal"
              onChange={(e) => {
                const value = e.target.value;
                if (value === '' || /^\d*\.?\d*$/.test(value)) {
                  setQuickBuyAmount(value);
                  const numValue = Number(value) || 0;
                  if (typeof window !== 'undefined') {
                    localStorage.setItem('quickBuyAmount', numValue.toString());
                  }
                }
              }}
              onKeyDown={(e) => {
                const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'];
                if (allowedKeys.includes(e.key)) return;
                if (e.key === '.') return;
                if (!/^[0-9]$/.test(e.key)) {
                  e.preventDefault();
                }
              }}
              className="bg-transparent border-none outline-none text-sm font-medium w-12 text-center"
              style={{ color: '#f0f5f5' }}
            />
          </div>
          
          {/* P1 P2 P3 Boxes */}
          <div className="hidden sm:flex items-center justify-center gap-1 rounded-md px-1.5 border relative"
               style={{ borderColor: '#24252C', backgroundColor: '#272a2e', paddingTop: '4px', paddingBottom: '4px', minWidth: '100px', width: '100px', height: '28px' }}>
            {['P1', 'P2', 'P3'].map((pill) => {
              const presetIndex = parseInt(pill.replace('P', '')) - 1;
              const preset = presets[presetIndex];
              const settings = preset?.quickBuySettings;
              
              return (
                <div key={pill} className="relative flex items-center justify-center">
                  <button
                    className="px-1 text-sm font-medium transition-all duration-200 cursor-pointer flex items-center justify-center rounded"
                    style={{
                      paddingTop: '2px',
                      paddingBottom: '2px',
                      backgroundColor: selectedPill === pill 
                        ? 'rgba(24, 196, 140, 0.15)' 
                        : 'rgba(22, 23, 28, 0.6)',
                      color: selectedPill === pill ? '#f0f5f5' : ''
                    }}
                    onClick={() => {
                      setSelectedPill(pill);
                      setActivePreset(presetIndex);
                    }}
                    onMouseEnter={(e) => {
                      if (selectedPill !== pill) {
                        e.currentTarget.style.color = '#f0f5f5';
                      }
                      setShowPillTooltip(pill);
                    }}
                    onMouseLeave={(e) => {
                      if (selectedPill !== pill) {
                        e.currentTarget.style.color = '';
                      }
                      setShowPillTooltip(null);
                    }}
                  >
                    {pill}
                  </button>
                  
                  {showPillTooltip === pill && settings && (
                    <div className="absolute top-full left-0 mt-1 w-28 rounded-lg shadow-xl border z-50"
                         style={{ 
                           backgroundColor: 'rgba(15, 16, 18, 0.95)',
                           borderColor: '#24252C' 
                         }}>
                      <div className="p-2 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <FaRunning size={10} className="opacity-80" style={{ strokeWidth: '2' }} />
                          <span className="text-gray-300 text-xs font-light">{(settings.maxSlippage * 100).toFixed(0)}%</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <FaGasPump size={10} className="opacity-90" style={{ color: '#FCD34D', strokeWidth: '2' }} />
                          <span className="text-yellow-400 text-xs font-light">{settings.priority}</span>
                          <span className="text-xs font-light" style={{ color: '#d11f3a' }}>⚠</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <FaCoins size={10} className="opacity-90" style={{ color: '#FCD34D', strokeWidth: '2' }} />
                          <span className="text-yellow-400 text-xs font-light">{settings.bribe}</span>
                          <span className="text-xs font-light" style={{ color: '#d11f3a' }}>⚠</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <FaBan size={10} className="opacity-90" style={{ strokeWidth: '2' }} />
                          <span className="text-gray-300 text-xs font-light">
                            {settings.mevMode === 'off' ? 'Off' : 
                             settings.mevMode === 'reduced' ? 'Reduced' : 'Secure'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filter Popout */}
      {isFilterPopoutOpen && (
        <FilterPopout 
          open={isFilterPopoutOpen} 
          onClose={() => setIsFilterPopoutOpen(false)}
          onApplyFilters={(filters) => setLocalFilters(filters)}
          currentFilters={localFilters}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto min-h-0">
        {activeTab === 'live' ? (
          pumpPortalTokens.length > 0 ? (
            <PumpLive
              leftItems={liveLeftItems}
              rightItems={liveRightItems}
              onAction={async (id, rawToken) => {
                if (rawToken) {
                  try {
                    const backfillResponse = await fetch('/api/token-service/backfill-token', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        mint: rawToken.mint,
                        name: rawToken.name,
                        symbol: rawToken.symbol,
                        uri: rawToken.uri,
                        market_cap_usd: rawToken.market_cap_usd || rawToken.marketCapSol ? (rawToken.marketCapSol * 170) : undefined,
                        liquidity_usd: undefined,
                        pair_address: rawToken.pair_address || rawToken.bondingCurveKey
                      })
                    });
                    if (backfillResponse.ok) {
                      console.log('[Discover] Token backfilled successfully');
                    }
                  } catch (err) {
                    console.error('[Discover] Error backfilling token:', err);
                  }
                }
                try {
                  await prefetchTradeData(id);
                } catch (err) {
                  console.error('[Discover] Prefetch failed:', err);
                }
                router.push(`/trade/${id}`);
              }}
              quickBuyAmount={Number(quickBuyAmount) || 0}
              onQuickBuy={handleQuickBuy}
            />
          ) : pumpPortalConnected && pumpPortalTokens.length === 0 ? (
            <div className="py-10 text-center text-[#9CA3AF]">
              Waiting for live tokens...
            </div>
          ) : !pumpPortalConnected && pumpPortalError ? (
            <div className="py-10 text-center" style={{ color: '#f26681' }}>
              Connection error: {pumpPortalError}
            </div>
          ) : (
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-20 w-full bg-[#1E1F26] animate-pulse rounded" />
              ))}
            </div>
          )
        ) : activeTab === 'newPairs' ? (
          <section aria-label="New Pairs">
            {newPairsLoading && processedNewPairs.length === 0 && newPairsRaw.length === 0 ? (
              <div className="space-y-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-12 w-full bg-[#1E1F26] animate-pulse rounded" />
                ))}
              </div>
            ) : newPairsError ? (
              <div className="py-10 text-center" style={{ color: '#f26681' }}>
                {newPairsError}
              </div>
            ) : processedNewPairs.length > 0 ? (
              <InterstateTable
                rows={newPairsRows}
                onQuickBuy={handleQuickBuy}
                sortKey={sortKey}
                sortDirection={sortDirection}
                setSort={handleSort}
                selectedTimeframe={selectedTimeframe}
                quickBuyAmount={Number(quickBuyAmount) || 0}
              />
            ) : (
              <div className="py-10 text-center text-[#9CA3AF]">
                No new pairs available right now. Check back shortly.
              </div>
            )}
          </section>
        ) : activeTab === 'xStocks' ? (
          <section aria-label="xStocks" className="pb-8">
            {xStocksLoading && processedXStocks.length === 0 && xStocksRaw.length === 0 ? (
              <div className="space-y-4">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="h-12 w-full bg-[#1E1F26] animate-pulse rounded" />
                ))}
              </div>
            ) : xStocksError && processedXStocks.length === 0 ? (
              <div className="py-10 text-center text-[#f26681]">
                Error loading xStocks: {xStocksError}
              </div>
            ) : processedXStocks.length > 0 ? (
              <InterstateTable
                rows={xStocksRows}
                onQuickBuy={handleQuickBuy}
                sortKey={sortKey}
                sortDirection={sortDirection}
                setSort={handleSort}
                selectedTimeframe={selectedTimeframe}
                quickBuyAmount={Number(quickBuyAmount) || 0}
                isDiscoverPage={true}
              />
            ) : (
              <div className="py-10 text-center text-[#9CA3AF]">
                No xStocks available right now. Check back shortly.
              </div>
            )}
          </section>
        ) : activeTab === 'surge' ? (
          <section aria-label="Surge">
            <div className="py-10 text-center text-[#9CA3AF]">
              Surge data coming soon. Connect your data source here.
            </div>
          </section>
        ) : (
          renderPrimaryTable()
        )}
      </main>

      <QuickBuySettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

