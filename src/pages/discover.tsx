// src/pages/discover.tsx
import React, { useEffect, useState, useRef, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import InterstateTable from '../components/InterstateTable';
import type { Token } from '~/utils/db';
import Header from '../components/Header';
import Footer from '../components/Footer';
import usePaginatedTokensWithFallback from '../hooks/usePaginatedTokensWithFallback';
import { usePumpPortalWebSocket } from '../hooks/usePumpPortalWebSocket';
import { useQuickBuy } from "~/components/QuickBuyContext";
import QuickBuySettingsModal from '../components/QuickBuySettingsModal';
import { useFilter } from '../components/FilterContext';
import FilterPopout from '../components/FilterPopout';
import { tradeBuy, SOL_MINT_ADDRESS, ApiError } from "~/utils/api";

// Wrapped SOL mint address - used to filter out quote tokens
const WRAPPED_SOL_MINT = SOL_MINT_ADDRESS;
import { getPoolTypeFromToken } from "~/utils/poolTypeDetection";
import { toast } from "react-hot-toast";
import { useUser } from "~/components/UserContext";
import PumpLive, { type PumpItem, demoLeft as demoLeftPump, demoRight as demoRightPump } from '../components/PumpLive';
import { FaRunning, FaGasPump, FaCoins, FaBan } from "react-icons/fa";
import { HiLightningBolt } from "react-icons/hi";
import { prefetchTradeData } from "~/utils/tokenCache";

export type Timeframe = "5m" | "1h" | "6h" | "24h";

// Extend Token with optional flags
type TokenWithDexPaid = Token & { dexPaid?: boolean };

export default function DiscoverPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'trending' | 'dex' | 'live'>('trending');
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("1h");
  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFilterPopoutOpen, setIsFilterPopoutOpen] = useState(false);
  const { filter } = useFilter();
  const [localFilters, setLocalFilters] = useState(filter);
  const { presets, activePreset, setActivePreset } = useQuickBuy();
  const { user } = useUser();

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
  const [selectedPill, setSelectedPill] = useState('P1'); // Local preset selection for discover page
  const [showPillTooltip, setShowPillTooltip] = useState<string | null>(null);
  const tokenMapRef = useRef<Map<string, TokenWithDexPaid>>(new Map());
  const [filteredTokens, setFilteredTokens] = useState<TokenWithDexPaid[]>([]);
  const [displayed, setDisplayed] = useState<TokenWithDexPaid[]>([]);
  const [sortKey, setSortKey] = useState<"market_cap_total" | "liquidity" | "volume" | "txns" | "name" | "total_liquidity_usd" | "fully_diluted_value">("volume");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // 🔒 Image cache: tokenId -> { cover?: string; avatar?: string }
  const imageCacheRef = useRef<Map<string, { cover?: string; avatar?: string }>>(new Map());
  // Track one-time preloads to avoid refetch spam
  const preloadedRef = useRef<Set<string>>(new Set());

  const getTokenId = (t: any) => t?.pair_address || t?.mint || undefined;

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

    // Update cache if we have new candidates (this handles async image loading)
    // If we have a new cover/avatar candidate, use it even if cached was undefined
    if (coverCandidate && cover !== coverCandidate) cover = coverCandidate;
    if (avatarCandidate && avatar !== avatarCandidate) avatar = avatarCandidate;

    if (id) {
      imageCacheRef.current.set(id, { cover, avatar });

      // Optional one-time preload to encourage browser caching
      const preloadKey = `${id}:${cover ?? ''}|${avatar ?? ''}`;
      if (!preloadedRef.current.has(preloadKey)) {
        if (cover) { const i = new Image(); i.decoding = 'async'; i.loading = 'eager'; i.src = cover; }
        if (avatar) { const i2 = new Image(); i2.decoding = 'async'; i2.loading = 'eager'; i2.src = avatar; }
        preloadedRef.current.add(preloadKey);
      }
    }

    return { cover, avatar };
  };

  // Hydrate cache from sessionStorage (optional persistence)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const raw = sessionStorage.getItem('tokenImageCache');
        if (raw) {
          const obj = JSON.parse(raw) as Record<string, { cover?: string; avatar?: string }>;
          imageCacheRef.current = new Map(Object.entries(obj));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist cache to sessionStorage periodically (after displayed changes is fine)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const obj: Record<string, { cover?: string; avatar?: string }> = {};
        imageCacheRef.current.forEach((v, k) => { obj[k] = v; });
        sessionStorage.setItem('tokenImageCache', JSON.stringify(obj));
      }
    } catch {
      // ignore
    }
  }, [displayed]);

  // WebSocket token service – keep as-is for dex/trending
  const {
    data: allTokens,
    loading: tokensLoading,
    isConnected,
    error: tokenError,
    isReconnecting,
    usingFallback,
  } = usePaginatedTokensWithFallback({
    // Always use trending endpoint
    filter: 'trending',
    timeframe: selectedTimeframe
  });

  // PumpPortal WebSocket for live pump section
  const {
    tokens: pumpPortalTokens,
    connected: pumpPortalConnected,
    error: pumpPortalError,
  } = usePumpPortalWebSocket({
    enabled: activeTab === 'live', // Only connect when on live tab
  });

  // Debug log to track timeframe changes
  // useEffect(() => {
  //   console.log('🔍 Discover: selectedTimeframe changed to:', selectedTimeframe);
  // }, [selectedTimeframe]);

  // QUICK BUY handler – with detailed logging (same as PulseTable)
  const handleQuickBuy = async (token: Token) => {
    console.log("🎯 handleQuickBuy called for token:", token.symbol);
    
    // ✅ COMPREHENSIVE DATA LOGGING FOR TESTING
    console.log("\n" + "=".repeat(80));
    console.log("📋 QUICK BUY DATA VERIFICATION - DISCOVER PAGE");
    console.log("=".repeat(80));
    
    // Log full token object - compare with PumpLive
    console.log("\n📊 [TRENDING] FULL TOKEN OBJECT:");
    console.log(JSON.stringify(token, null, 2));
    
    // Log key token fields - compare with PumpLive
    console.log("\n🔑 [TRENDING] KEY TOKEN FIELDS:");
    console.log("  mint:", token.mint);
    console.log("  symbol:", token.symbol);
    console.log("  name:", token.name);
    console.log("  pair_address:", token.pair_address);
    console.log("  migrated_pool_address:", token.migrated_pool_address || "(none)");
    console.log("  launchpad_protocol:", token.launchpad_protocol || "(none)");
    console.log("  protocol:", token.protocol || "(none)");
    console.log("  amm_id:", token.amm_id || "(none)");
    
    // Fallback toast function for production issues
    const showToast = (message: string, type: 'success' | 'error' = 'error') => {
      try {
        if (type === 'success') {
          toast.success(message, {
            duration: 5000,
            style: {
              background: '#1E1F26',
              color: '#E6E7EA',
              border: '1px solid #70E0B0',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              zIndex: 9999
            }
          });
        } else {
          toast.error(message, {
            duration: 5000,
            style: {
              background: '#1E1F26',
              color: '#E6E7EA',
              border: '1px solid #ff6b6b',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              zIndex: 9999
            }
          });
        }
      } catch (error) {
        // Fallback to console and alert if toast fails
        console.error('Toast failed:', error);
        console.log(`[${type.toUpperCase()}] ${message}`);
        if (typeof window !== 'undefined' && window.alert) {
          window.alert(message);
        }
      }
    };
    
    if (!user) {
      console.log("❌ No user found");
      showToast("⚠️ Please connect your wallet to trade");
      return;
    }

    const buyAmount = parseFloat(quickBuyAmount);
    if (isNaN(buyAmount) || buyAmount <= 0) {
      console.log("❌ Invalid buy amount:", quickBuyAmount);
      showToast("⚠️ Please enter a valid SOL amount (minimum 0.001 SOL)");
      return;
    }

    try {
      const poolType = getPoolTypeFromToken(token);
      const effectivePoolAddress = token.migrated_pool_address || token.pair_address;
      
      console.log("\n🏊 POOL INFORMATION:");
      console.log(`  Protocol: ${token.launchpad_protocol || token.protocol || 'unknown'}`);
      console.log(`  Detected PoolType: ${poolType || '(empty - backend will auto-detect)'}`);
      if (!poolType) {
        console.log(`  ⚠️  Note: Empty poolType is OK - backend will auto-detect from pool address`);
      }
      console.log(`  Effective Pool Address: ${effectivePoolAddress}`);
      console.log(`  Using migrated_pool_address: ${token.migrated_pool_address ? 'YES' : 'NO'}`);
      console.log(`  Original pair_address: ${token.pair_address}`);
      
      const settings = presets[activePreset].quickBuySettings;
      
      console.log("\n⚙️ PRESET SETTINGS:");
      console.log(`  Active Preset: P${activePreset + 1} (from selectedPill: ${selectedPill})`);
      console.log(`  Slippage: ${(settings.maxSlippage || 0.4) * 100}% (${settings.maxSlippage || 0.4} decimal)`);
      console.log(`  Priority Fee: ${settings.priority || 0.0001} SOL`);
      console.log(`  Bribe: ${settings.bribe || 0} SOL`);
      console.log(`  MEV Mode: ${settings.mevMode}`);
      console.log(`  MEV Protection: ${settings.mevMode === "off" ? 0 : 1}`);
      console.log(`  Auto Fee: ${settings.autoFee || false}`);
      console.log(`  Max Fee: ${settings.maxFee || 0} SOL`);
      console.log(`  RPC: ${settings.rpc || "(default)"}`);
      
      console.log("\n📦 FULL SETTINGS OBJECT:");
      console.log(JSON.stringify(settings, null, 2));
      
      // Build the complete payload - exactly like PulseTable
      const payload: any = {
        poolAddress: effectivePoolAddress,
        baseMint: token.mint,
        quoteMint: SOL_MINT_ADDRESS,
        amount: buyAmount,
        mevProtection: (settings.mevMode === "off" ? 0 : 1) as 0 | 1,
        poolType: poolType,
        originalPairAddress: token.pair_address,
        slippage: (settings.maxSlippage || 0.4) * 100,
        priorityFee: settings.priority || 0.0001,
        bribe: settings.bribe || 0,
        mevMode: settings.mevMode,
        autoFee: settings.autoFee || false,
        maxFee: settings.maxFee || 0,
        tokenName: token.name,
        tokenSymbol: token.symbol,
      };
      
      // Only include rpc if it exists (same as PulseTable)
      if (settings.rpc) {
        payload.rpc = settings.rpc;
      }
      
      console.log("\n📤 COMPLETE PAYLOAD BEING SENT TO API:");
      console.log(JSON.stringify(payload, null, 2));
      console.log("\n📤 PAYLOAD SUMMARY:");
      console.log("  poolAddress:", payload.poolAddress);
      console.log("  baseMint:", payload.baseMint);
      console.log("  quoteMint:", payload.quoteMint);
      console.log("  amount:", payload.amount, "SOL");
      console.log("  poolType:", payload.poolType);
      console.log("  slippage:", payload.slippage, "%");
      console.log("  priorityFee:", payload.priorityFee, "SOL");
      console.log("  bribe:", payload.bribe, "SOL");
      console.log("  mevProtection:", payload.mevProtection);
      console.log("  mevMode:", payload.mevMode);
      console.log("  originalPairAddress:", payload.originalPairAddress);
      console.log("=".repeat(80) + "\n");
      
      const data = await tradeBuy(payload, user.bearerToken);
      
      console.log("\n📥 API RESPONSE RECEIVED:");
      console.log(JSON.stringify(data, null, 2));
      
      const txHash = data?.hash || data?.txid;
      const tokenAmount = data?.amount || data?.tokenAmount;

      if (data && txHash) {
        console.log("\n✅ QUICK BUY SUCCESS:");
        console.log("  Transaction Hash:", txHash);
        console.log("  Token Amount:", tokenAmount || 'N/A');
        console.log("  Token Symbol:", token.symbol);
        console.log("  Full Response:", JSON.stringify(data, null, 2));
        
        // Backfill token to token-service so it's available in portfolio/activity
        try {
          console.log("\n🔄 Backfilling token after Quick Buy...");
          const backfillResponse = await fetch('/api/token-service/backfill-token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              mint: token.mint,
              name: token.name,
              symbol: token.symbol,
              uri: token.uri,
              market_cap_usd: token.fully_diluted_value,
              liquidity_usd: token.total_liquidity_usd,
              pair_address: token.pair_address || token.migrated_pool_address
            })
          });

          if (backfillResponse.ok) {
            console.log('✅ Token backfilled successfully to token-service');
          } else {
            console.warn('⚠️ Token backfill failed (token may already exist or service unavailable)');
          }
        } catch (backfillError) {
          console.error('❌ Error backfilling token:', backfillError);
          // Don't fail the Quick Buy if backfill fails - it's non-critical
        }
        
        showToast(
          `✅ Quick Buy successful! Bought ${tokenAmount || 'tokens'} ${token.symbol}. Tx: ${txHash.slice(0, 8)}...`,
          'success'
        );
      } else {
        console.log("\n❌ QUICK BUY FAILED:");
        console.log("  Response:", JSON.stringify(data, null, 2));
        console.log("  Missing transaction hash");
        showToast("❌ Quick Buy failed - no transaction hash returned");
      }
    } catch (e: any) {
      // Use console.warn for expected errors, console.error for unexpected
      const logFn = (e as any)?.expected ? console.warn : console.error;
      
      console.log("\n❌ QUICK BUY ERROR:");
      console.log("  Error Type:", e?.constructor?.name || typeof e);
      console.log("  Error Message:", e?.message || String(e));
      console.log("  Error Code:", e?.code || 'N/A');
      console.log("  Error Details:", e?.details || 'N/A');
      console.log("  Full Error Object:", e);
      console.log("  Full Error JSON:", JSON.stringify(e, Object.getOwnPropertyNames(e), 2));
      
      // Try to extract more details from the error
      if (e?.response) {
        console.log("  Response Status:", e.response.status);
        console.log("  Response Body:", e.response.body);
      }
      if (e?.data) {
        console.log("  Error Data:", e.data);
      }
      
      logFn('Quick Buy error:', e);

      if (e instanceof ApiError) {
        // Show simplified user-friendly messages with enhanced styling
        const toastStyle = {
          background: '#1E1F26',
          color: '#E6E7EA',
          border: '1px solid #ff6b6b',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: '500'
        };
        
        if (e.code === 'NO_ACTIVE_POOL') {
          showToast(`⚠️ Pool unavailable for ${token.symbol}`);
        } else if (e.code === 'INSUFFICIENT_BALANCE') {
          showToast(`⚠️ Insufficient balance`);
        } else if (e.code === 'TX_FAILED') {
          showToast(`❌ Trade failed. Try adjusting slippage or amount.`);
        } else if (e.code === 'NO_HOLDINGS') {
          showToast(`❌ No ${token.symbol} to sell`);
        } else if (e.code === 'AMOUNT_TOO_SMALL') {
          showToast(`❌ Amount too small (min 0.001 SOL)`);
        } else if (e.code === 'POOL_UNAVAILABLE') {
          showToast(`⚠️ Pool has insufficient liquidity`);
        } else {
          // Generic error with shortened message
          const msg = e.message.length > 80 ? e.message.substring(0, 77) + '...' : e.message;
          showToast(`❌ ${msg}`);
        }
      } else {
        // Unexpected error - show generic message
        showToast(`❌ Trade failed. Please try again.`);
      }
    }
  };

  const handleTimeframeClick = (tf: string) => {
    // console.log('🖱️ Discover: Timeframe clicked:', tf);
    setSelectedTimeframe(tf as Timeframe);
    setSortKey("volume");
    setSortDirection("desc");
  };

  // Helper to compute volume by timeframe for sorting in trending view
  const getVolumeForTimeframe = useCallback((t: any, tf: Timeframe) => {
    const v = t?.[`volume_${tf}`];
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = parseFloat(v);
      return isNaN(n) ? 0 : n;
    }
    return 0;
  }, []);

  // Map AMM IDs to protocol patterns (same logic as PulseTable)
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

  // Apply filters to tokens
  const applyFilters = useCallback((tokens: TokenWithDexPaid[]) => {
    let filtered = [...tokens];

    // Protocol/AMM filter - filter by launchpad_protocol (same as PulseTable)
    if (localFilters.amms && localFilters.amms.length > 0) {
      const protocolPatterns = localFilters.amms.flatMap(ammId => mapAmmToProtocolPatterns(ammId));
      filtered = filtered.filter(token => {
        const launchpadProtocol = ((token as any).launchpad_protocol || '').toLowerCase();
        if (!launchpadProtocol) return false;
        
        // Check if token's protocol matches any selected AMM's protocol patterns
        return protocolPatterns.some(pattern => {
          const patternLower = pattern.toLowerCase();
          // Direct match
          if (launchpadProtocol === patternLower) return true;
          // Substring match (e.g., "raydiumlaunchpad" contains "raydium")
          if (launchpadProtocol.includes(patternLower) || patternLower.includes(launchpadProtocol)) return true;
          return false;
        });
      });
    }

    // Search keywords
    if (localFilters.searchKeywords.trim()) {
      const searchTerms = localFilters.searchKeywords.toLowerCase().split(',').map(term => term.trim()).filter(term => term);
      if (searchTerms.length > 0) {
        filtered = filtered.filter(token => {
          const tokenText = `${token.name || ''} ${token.symbol || ''}`.toLowerCase();
          return searchTerms.some(term => tokenText.includes(term));
        });
      }
    }

    // Exclude keywords
    if (localFilters.excludeKeywords.trim()) {
      const excludeTerms = localFilters.excludeKeywords.toLowerCase().split(',').map(term => term.trim()).filter(term => term);
      if (excludeTerms.length > 0) {
        filtered = filtered.filter(token => {
          const tokenText = `${token.name || ''} ${token.symbol || ''}`.toLowerCase();
          return !excludeTerms.some(term => tokenText.includes(term));
        });
      }
    }

    // Market cap filter
    if (localFilters.marketCapMin || localFilters.marketCapMax) {
      filtered = filtered.filter(token => {
        const marketCap = Number(token.fully_diluted_value) || 0;
        const min = localFilters.marketCapMin ? Number(localFilters.marketCapMin) : 0;
        const max = localFilters.marketCapMax ? Number(localFilters.marketCapMax) : Infinity;
        return marketCap >= min && marketCap <= max;
      });
    }

    // Volume filter
    if (localFilters.volumeMin || localFilters.volumeMax) {
      filtered = filtered.filter(token => {
        const volume = getVolumeForTimeframe(token, selectedTimeframe);
        const min = localFilters.volumeMin ? Number(localFilters.volumeMin) : 0;
        const max = localFilters.volumeMax ? Number(localFilters.volumeMax) : Infinity;
        return volume >= min && volume <= max;
      });
    }

    // Liquidity filter
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

  // Sorting handler
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
        // CRITICAL: Filter out wrapped SOL tokens explicitly
        if (!token || !token.mint || token.mint === WRAPPED_SOL_MINT) {
          return;
        }
        
        // Ensure we have valid token data (not quote tokens)
        if (token.quoteMint === WRAPPED_SOL_MINT && !token.pair_address && !token.mint) {
          return; // Skip if this looks like quote token data
        }
        
        // Create a deep copy to avoid mutation issues
        const tokenCopy = JSON.parse(JSON.stringify(token)) as TokenWithDexPaid;
        
        // Use a unique key: prefer pair_address, fallback to mint, but ensure uniqueness
        const baseKey = tokenCopy.pair_address || tokenCopy.mint;
        if (!baseKey || baseKey === WRAPPED_SOL_MINT) {
          return; // Skip invalid keys
        }
        
        // If key already exists, keep the one with pair_address (more complete data)
        const existing = newMap.get(baseKey);
        if (existing) {
          // Prefer token with pair_address, or the one with more complete data
          if (tokenCopy.pair_address && !existing.pair_address) {
            newMap.set(baseKey, tokenCopy);
          } else if (existing.pair_address && !tokenCopy.pair_address) {
            // Keep existing
            return;
          } else {
            // Both have or don't have pair_address - prefer the one with more data
            const existingKeys = Object.keys(existing).length;
            const newKeys = Object.keys(tokenCopy).length;
            if (newKeys > existingKeys) {
              newMap.set(baseKey, tokenCopy);
            }
          }
        } else {
          newMap.set(baseKey, tokenCopy);
        }
      });
      
      tokenMapRef.current = newMap;

      const arr = Array.from(tokenMapRef.current.values());
      // Final safety check: filter out any wrapped SOL that might have slipped through
      const filtered = arr.filter(t => t.mint !== WRAPPED_SOL_MINT);
      setFilteredTokens(filtered);
    }
  }, [allTokens]);

  // Update displayed tokens
  useEffect(() => {
    if (activeTab === "trending") {
      const arr = Array.from(tokenMapRef.current.values());
      
      // Safety check: filter out wrapped SOL before processing
      const safeArr = arr.filter(t => t && t.mint && t.mint !== WRAPPED_SOL_MINT);
      
      const filtered = applyFilters(safeArr);
      
      // Create deep copies to avoid mutation during sort
      const sortedTokens = filtered.map(t => JSON.parse(JSON.stringify(t)));
      
      sortedTokens.sort((a, b) => {
        // Final safety check in sort
        if (!a || !b || a.mint === WRAPPED_SOL_MINT || b.mint === WRAPPED_SOL_MINT) {
          return 0;
        }
        
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
      
      // Final filter before setting displayed - also deduplicate by mint/address
      const finalSafe = sortedTokens.filter(t => t && t.mint && t.mint !== WRAPPED_SOL_MINT);
      // Deduplicate by creating a Map keyed by both mint and pair_address to handle edge cases
      const uniqueSafe = Array.from(
        new Map(finalSafe.map(t => [t.pair_address || t.mint, t])).values()
      );
      setDisplayed(uniqueSafe);
    } else {
      // dex OR live → same sliced data; Live Pump renders a different UI
      const safe = filteredTokens.filter(t => t && t.mint && t.mint !== WRAPPED_SOL_MINT);
      setDisplayed(safe.slice(0, 10));
    }
  }, [activeTab, filteredTokens, sortKey, sortDirection, selectedTimeframe, applyFilters, getVolumeForTimeframe]);


  /* ------- map tokens -> PumpItem for Live Pump (uses cached images) ------- */
  const toPumpItem = (t: any): PumpItem => {
    const name = t?.name || t?.symbol || '—';
    const sym = t?.symbol ? String(t.symbol).slice(0, 12) : undefined;
    const desc = t?.description || t?.bio || '';
    const age = t?.age_label || '22m'; // fallback display label
    const mcNum = Number(t?.fully_diluted_value || 0);
    const mc =
      mcNum > 0
        ? (mcNum >= 1_000_000
            ? `$${(mcNum / 1_000_000).toFixed(2)}M`
            : mcNum >= 1_000
            ? `$${(mcNum / 1_000).toFixed(2)}K`
            : `$${mcNum.toFixed(0)}`)
        : undefined;

    const { cover, avatar } = getCachedImagesForToken(t);

    return {
      id: t?.pair_address || t?.mint || Math.random().toString(36).slice(2),
      name,
      symbol: sym,
      desc,
      age,
      mc,
      coverUrl: cover,
      avatarUrl: avatar,
      verified: Boolean(t?.verified),
      hot: Boolean(t?.hot),
    };
  };

  // Create a helper to map PumpPortal tokens to PumpItem format
  const toPumpPortalItem = (t: any): PumpItem => {
    const name = t?.name || t?.symbol || '—';
    const sym = t?.symbol ? String(t.symbol).slice(0, 12) : undefined;
    const desc = t?.description || t?.bio || '';
    
    // Calculate age from timestamp
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
    const mc =
      mcNum > 0
        ? (mcNum >= 1_000_000
            ? `$${(mcNum / 1_000_000).toFixed(2)}M`
            : mcNum >= 1_000
            ? `$${(mcNum / 1_000).toFixed(2)}K`
            : `$${mcNum.toFixed(0)}`)
        : undefined;

    // Use cached images to ensure they persist across re-renders
    const { cover, avatar } = getCachedImagesForToken(t);
    
    // For PumpPortal tokens, use the same image for both cover and avatar
    // The large box (cover) shows the full image, the small box (avatar) shows the token image
    const imageUrl = cover || t?.image || undefined;
    const avatarImageUrl = avatar || imageUrl || undefined;
    
    // Debug: Log individual token mapping
    console.log(`[toPumpPortalItem] Mapping ${name}:`, {
      hasImage: !!t.image,
      hasCover: !!cover,
      finalImageUrl: !!imageUrl,
      finalAvatarUrl: !!avatarImageUrl,
      raw: { tImage: t.image, cover, avatar }
    });

    return {
      id: t?.pair_address || t?.mint || Math.random().toString(36).slice(2),
      name,
      symbol: sym,
      desc,
      age,
      mc,
      coverUrl: imageUrl, // Large box - full token image
      avatarUrl: avatarImageUrl, // Small box - token image (same as large box for PumpPortal)
      verified: false,
      hot: true, // Mark all PumpPortal tokens as hot/live
      _rawToken: t, // Store raw token for backfill
    };
  };

  const liveLeftItems: PumpItem[] = pumpPortalTokens.slice(0, 30).map(toPumpPortalItem);
  const liveRightItems: PumpItem[] = pumpPortalTokens.slice(30, 60).map(toPumpPortalItem);

  // Debug: Log image data for PumpPortal tokens
  useEffect(() => {
    if (pumpPortalTokens.length > 0) {
      console.log('[Discover] PumpPortal tokens with image data:', 
        pumpPortalTokens.slice(0, 12).map(t => ({
          name: t.name,
          mint: t.mint,
          hasUri: !!t.uri,
          hasImage: !!t.image,
          uri: t.uri,
          image: t.image
        }))
      );
    }
  }, [pumpPortalTokens]);

  // Simple LRU-ish trim when the cache gets large (optional)
  useEffect(() => {
    const MAX = 1500; // tune to your needs
    const cache = imageCacheRef.current;
    if (cache.size > MAX) {
      const toDrop = Math.ceil(MAX * 0.1);
      const it = cache.keys();
      for (let i = 0; i < toDrop; i++) {
        const k = it.next().value as string | undefined;
        if (!k) break;
        cache.delete(k);
      }
    }
  }, [displayed]);

  return (
    <>
      <Head>
        <title>Interstate Memeboard | Discover</title>
        <meta name="description" content="Interstate dashboard" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=2" />
        {/* Preload the static fallbacks used many times in PumpLive */}
        <link rel="preload" as="image" href="/placeholder/fallback-cover.jpg" />
        <link rel="preload" as="image" href="/placeholder/fallback-avatar.jpg" />
      </Head>

      <div className="min-h-screen text-[#E6E7EA] relative" style={{ backgroundColor: '#06070b' }}>
        {/* Header */}
        <div style={{ position: 'relative', zIndex: 100 }}>
          <Header search={search} setSearch={setSearch} selectedTimeframe={selectedTimeframe} />
        </div>

        {/* Tab Navigation */}
        <div className="mx-auto my-4 flex flex-row items-center justify-between gap-6 px-8 max-w-[98%]">
          <div className="flex max-w-7xl items-center gap-6">
            <button
              className={`text-lg font-light transition-colors ${activeTab === "trending" ? "text-white" : "text-[#6B7280] hover:text-white"} cursor-pointer`}
              onClick={() => setActiveTab("trending")}
            >
              Trending
            </button>
            <button
              className={`text-lg font-light transition-colors ${activeTab === "dex" ? "text-white" : "text-[#6B7280] hover:text-white"} cursor-pointer`}
              onClick={() => setActiveTab("dex")}
            >
              DEX Screener
            </button>
            {/* <button
              className={`text-lg font-light transition-colors ${activeTab === "live" ? "text-white" : "text-[#6B7280] hover:text-white"} cursor-pointer`}
              onClick={() => setActiveTab("live")}
            >
              Pump Live
            </button> */}
          </div>

          {/* Right controls (unchanged) */}
          <div className="flex flex-row items-center gap-4">
            {/* Connection status - commented out per user request */}
            {/* <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : usingFallback ? 'bg-yellow-400' : 'bg-red-400'}`}></div>
              <span className="text-xs text-neutral-400">
                {isConnected ? 'Live' : 'Disconnected'}
              </span>
            </div> */}

            {/* Timeframes - hide when on live tab */}
            {activeTab !== 'live' && (
              <div className="flex max-w-7xl items-center gap-3 text-sm font-medium">
                {(["5m", "1h", "6h", "24h"] as Timeframe[]).map((tf: Timeframe) => (
                  <button
                    key={tf}
                    className={(selectedTimeframe === tf ? "text-white " : "text-[#9CA3AF] hover:text-white ") + "cursor-pointer transition-colors"}
                    onClick={() => handleTimeframeClick(tf)}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            )}

            {/* Filter button - hidden when in Live Pump tab */}
            {activeTab !== 'live' && (
              <div className="relative">
                <button
                  className="flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-full transition-all duration-300 ease-out cursor-pointer relative mr-2 bg-[#17191E] border border-[#2A2B33] text-[#9CA3AF] hover:text-[#E6E7EA]"
                  onClick={() => setIsFilterPopoutOpen(true)}
                >
                  {/* filter glyph */}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="4" y1="6" x2="20" y2="6"/><circle cx="8" cy="6" r="2"/>
                    <line x1="4" y1="12" x2="20" y2="12"/><circle cx="16" cy="12" r="2"/>
                    <line x1="4" y1="18" x2="20" y2="18"/><circle cx="8" cy="18" r="2"/>
                  </svg>
                  <span className="font-medium text-sm">Filter</span>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            )}

            {/* Quick Buy - Same as PulseTable */}
            <div className="flex items-center justify-center rounded-full px-3 py-1.5 gap-2 border bg-[#17191E]"
                 style={{ borderColor: '#2A2B33' }}>
              {/* Amount - Editable */}
              <div className="flex items-center justify-center gap-1">
                <HiLightningBolt size={12} style={{ color: '#22C55E' }} />
                <input
                  type="text"
                  value={quickBuyAmount}
                  inputMode="decimal"
                  onChange={(e) => {
                    const value = e.target.value;
                    // Allow only digits and at most one decimal point
                    if (value === '' || /^\d*\.?\d*$/.test(value)) {
                      setQuickBuyAmount(value);
                      const numValue = Number(value) || 0;
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('quickBuyAmount', numValue.toString());
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    // Block non-numeric keys except control/navigation keys and '.'
                    const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'];
                    if (allowedKeys.includes(e.key)) return;
                    if (e.key === '.') return;
                    if (!/^[0-9]$/.test(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  className="bg-transparent border-none outline-none text-xs font-medium w-10 text-center"
                  style={{ color: '#E6E7EA' }}
                />
              </div>
              
              {/* Solana Symbol */}
              <div className="flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 397.7 311.7" fill="none">
                  <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 237.9z" fill="url(#paint0_linear_solana_discover)"/>
                  <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1L333.1 73.8c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="url(#paint1_linear_solana_discover)"/>
                  <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" fill="url(#paint2_linear_solana_discover)"/>
                  <defs>
                    <linearGradient id="paint0_linear_solana_discover" x1="360.8" y1="351.5" x2="141.44" y2="132.14" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#00FFA3"/>
                      <stop offset="1" stopColor="#DC1FFF"/>
                    </linearGradient>
                    <linearGradient id="paint1_linear_solana_discover" x1="264.8" y1="116.2" x2="45.44" y2="-103.16" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#00FFA3"/>
                      <stop offset="1" stopColor="#DC1FFF"/>
                    </linearGradient>
                    <linearGradient id="paint2_linear_solana_discover" x1="312.5" y1="233.9" x2="93.14" y2="14.54" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#00FFA3"/>
                      <stop offset="1" stopColor="#DC1FFF"/>
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              
              {/* Separator */}
              <div className="w-px h-4 bg-gray-600"></div>
              
              {/* P1 P2 P3 Pill - Simple Toggle */}
              <div className="flex items-center justify-center gap-1 relative">
                {['P1', 'P2', 'P3'].map((pill) => {
                  const presetIndex = parseInt(pill.replace('P', '')) - 1;
                  const preset = presets[presetIndex];
                  const settings = preset?.quickBuySettings;
                  
                  return (
                    <div key={pill} className="relative flex items-center justify-center">
                      <button
                        className={`px-1.5 py-0.5 text-xs font-medium transition-all duration-200 cursor-pointer flex items-center justify-center ${
                          selectedPill === pill ? 'text-green-400' : 'text-gray-400 hover:text-white'
                        }`}
                        onClick={() => {
                          setSelectedPill(pill);
                          setActivePreset(presetIndex); // Also update global preset for consistency
                          console.log(`Selected ${pill} in discover page`);
                        }}
                        onMouseEnter={() => setShowPillTooltip(pill)}
                        onMouseLeave={() => setShowPillTooltip(null)}
                      >
                        {pill}
                      </button>
                      
                      {/* Tooltip for each pill */}
                      {showPillTooltip === pill && settings && (
                        <div className="absolute top-full left-0 mt-1 w-28 rounded-lg shadow-xl border z-50"
                             style={{ 
                               backgroundColor: 'rgba(15, 16, 18, 0.95)',
                               borderColor: '#2A2B33' 
                             }}>
                          <div className="p-2 space-y-1.5">
                            {/* Slippage - Running person icon */}
                            <div className="flex items-center gap-1.5">
                              <FaRunning size={10} className="opacity-80" style={{ strokeWidth: '1' }} />
                              <span className="text-gray-300 text-xs font-light">{(settings.maxSlippage * 100).toFixed(0)}%</span>
                            </div>
                            
                            {/* Priority Fee - Gas pump icon with yellow styling */}
                            <div className="flex items-center gap-1.5">
                              <FaGasPump size={10} className="opacity-90" style={{ color: '#FCD34D', strokeWidth: '1' }} />
                              <span className="text-yellow-400 text-xs font-light">{settings.priority}</span>
                              <span className="text-red-500 text-xs font-light">⚠</span>
                            </div>
                            
                            {/* Bribe - Coins icon with yellow styling */}
                            <div className="flex items-center gap-1.5">
                              <FaCoins size={10} className="opacity-90" style={{ color: '#FCD34D', strokeWidth: '1' }} />
                              <span className="text-yellow-400 text-xs font-light">{settings.bribe}</span>
                              <span className="text-red-500 text-xs font-light">⚠</span>
                            </div>
                            
                            {/* MEV Protection - Ban icon */}
                            <div className="flex items-center gap-1.5">
                              <FaBan size={10} className="opacity-90" style={{ strokeWidth: '1' }} />
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
        <main className="mx-auto px-8 pb-10 max-w-[98%]">
          {activeTab === 'live' ? (
            pumpPortalTokens.length > 0 ? (
              <PumpLive
                leftItems={liveLeftItems}
                rightItems={liveRightItems}
                onAction={async (id, rawToken) => {
                  // Backfill token data first
                  if (rawToken) {
                    try {
                      console.log('[Discover] Backfilling token:', rawToken);
                      const backfillResponse = await fetch('/api/token-service/backfill-token', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                          mint: rawToken.mint,
                          name: rawToken.name,
                          symbol: rawToken.symbol,
                          uri: rawToken.uri,
                          market_cap_usd: rawToken.market_cap_usd || rawToken.marketCapSol ? (rawToken.marketCapSol * 170) : undefined,
                          liquidity_usd: undefined, // PumpPortal doesn't provide liquidity data
                          pair_address: rawToken.pair_address || rawToken.bondingCurveKey
                        })
                      });

                      if (backfillResponse.ok) {
                        console.log('[Discover] Token backfilled successfully');
                      } else {
                        console.warn('[Discover] Token backfill failed, but continuing with navigation');
                      }
                    } catch (err) {
                      console.error('[Discover] Error backfilling token:', err);
                    }
                  }

                  // Prefetch trade data before navigating
                  console.log('[Discover] Prefetching trade data for:', id);
                  try {
                    await prefetchTradeData(id);
                    console.log('[Discover] Prefetch complete for:', id);
                  } catch (err) {
                    console.error('[Discover] Prefetch failed:', err);
                  }
                  // Navigate to trade page
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
              <div className="py-10 text-center text-red-400">
                Connection error: {pumpPortalError}
              </div>
            ) : (
              <div className="space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-20 w-full bg-[#1E1F26] animate-pulse rounded" />
                ))}
              </div>
            )
          ) : displayed.length > 0 ? (
            <InterstateTable
              rows={displayed.map((token, i) => ({
                token: token as Token,
                i: i,
              }))}
              onQuickBuy={handleQuickBuy}
              sortKey={sortKey}
              sortDirection={sortDirection}
              setSort={handleSort}
              selectedTimeframe={selectedTimeframe}
              quickBuyAmount={Number(quickBuyAmount) || 0}
            />
          ) : (allTokens && Array.isArray(allTokens) && allTokens.length > 0) ? (
            // Fallback: show raw data immediately if available (even if loading state hasn't updated yet)
            <InterstateTable
              rows={allTokens.map((token, i) => ({
                token: token as Token,
                i: i,
              }))}
              onQuickBuy={handleQuickBuy}
              sortKey={sortKey}
              sortDirection={sortDirection}
              setSort={handleSort}
              selectedTimeframe={selectedTimeframe}
              quickBuyAmount={Number(quickBuyAmount) || 0}
            />
          ) : tokensLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-12 w-full bg-[#1E1F26] animate-pulse rounded" />
              ))}
            </div>
          ) : tokenError ? (
            <div className="py-10 text-center text-red-400">
              {tokenError}
            </div>
          ) : (
            <div className="py-10 text-center text-[#9CA3AF]">
              No tokens found.
            </div>
          )}
        </main>

        <Footer />
        <QuickBuySettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    </>
  );
}
