import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { formatSmartNumber } from '~/utils/db';
import useCodexDevTokens from '../../hooks/useCodexDevTokens';
import useSolanaTokenWebSocket, { type SolanaDevToken } from '../../hooks/useSolanaTokenWebSocket';
import useMonadDevTokens from '../../hooks/useMonadDevTokens';
import type { Token } from '~/utils/db';
import DevTokensPieChart from './DevTokensPieChart';
import { FaChevronLeft, FaChevronRight, FaCopy, FaDownload, FaSearch, FaBars } from 'react-icons/fa';
import { SiSolana } from 'react-icons/si';
import { IoIosCloseCircleOutline } from 'react-icons/io';

interface CodexDevTokensProps {
  token: Token | null;
  chain?: 'sol' | 'monad'; // Chain to determine which endpoint to use
  onTotalCountChange?: (count: number) => void; // Callback to pass total count to parent
}

function getAge(timestamp: number) {
  const now = Date.now() / 1000;
  const diffSeconds = Math.floor(now - timestamp);
  const diffMins = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffSeconds / 3600);
  const diffDays = Math.floor(diffSeconds / 86400);

  // Handle future timestamps (clock skew)
  if (diffSeconds < 0) return '0s';

  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  if (diffMins > 0) return `${diffMins}m`;
  return `${diffSeconds}s`;
}

function formatMarketCap(marketCap: string) {
  const cap = parseFloat(marketCap);
  if (cap >= 1000000) {
    return `$${(cap / 1000000).toFixed(1)}M`;
  } else if (cap >= 1000) {
    return `$${(cap / 1000).toFixed(1)}K`;
  }
  return `$${cap.toFixed(0)}`;
}

function formatLiquidity(liquidity: string) {
  // Handle null, undefined, or empty string
  if (!liquidity || liquidity === 'null' || liquidity === 'undefined') {
    return '$0';
  }
  
  const liq = parseFloat(liquidity);
  if (isNaN(liq)) {
    return '$0';
  }
  
  if (liq >= 1000000) {
    return `$${(liq / 1000000).toFixed(1)}M`;
  } else if (liq >= 1000) {
    return `$${(liq / 1000).toFixed(1)}K`;
  }
  return `$${liq.toFixed(0)}`;
}

function formatVolume(volume: string) {
  const vol = parseFloat(volume);
  if (vol >= 1000000) {
    return `$${(vol / 1000000).toFixed(1)}M`;
  } else if (vol >= 1000) {
    return `$${(vol / 1000).toFixed(1)}K`;
  }
  return `$${vol.toFixed(0)}`;
}

// Helper to map WebSocket dev tokens to display format
function mapWebSocketDevTokenToDisplay(wsToken: SolanaDevToken) {
  // Convert ISO date string to Unix timestamp (seconds)
  const createdAtTimestamp = wsToken.created_at
    ? Math.floor(new Date(wsToken.created_at).getTime() / 1000)
    : Math.floor(Date.now() / 1000);

  return {
    token: {
      address: wsToken.mint,
      name: wsToken.name,
      symbol: wsToken.symbol,
      createdAt: createdAtTimestamp,
      migrated_pool_address: wsToken.migrated_pool_address || (wsToken.migrated ? 'migrated' : undefined),
    },
    marketCap: String(wsToken.market_cap || 0),
    liquidity: String(wsToken.liquidity || 0),
    volume24: String(wsToken.volume_24h || wsToken.volume_1h || 0),
  };
}

const AX = {
  bg: "#111214",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#E6E7EA",
  muted: "#9CA3AF",
  migrated: "#70E0B0", // Green for migrated
  nonMigrated: "#EC4899", // Pink/magenta for non-migrated
  link: "#8B5CF6", // Vibrant blue/purple for links
};

// Helper function to truncate address
function truncateAddress(address: string, start: number = 4, end: number = 4): string {
  if (!address || address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

// Helper function to copy to clipboard
function copyToClipboard(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(console.error);
  }
}

// Client-side localStorage cache constants
const CACHE_KEY_PREFIX_LIMITED = 'codex_dev_tokens_limited_cache_';
const CACHE_KEY_PREFIX_ALL = 'codex_dev_tokens_all_cache_';
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes cache expiry

const CodexDevTokens: React.FC<CodexDevTokensProps> = ({ token, chain = 'sol', onTotalCountChange }) => {
  // Collapsible state for right panel - initialize based on cached tokens if available
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState<boolean>(() => {
    // Check if any cached tokens have volume > 0 to set initial state
    // Default to true (collapsed) to hide empty panel when there are no tokens
    if (typeof window === 'undefined' || !token?.mint) return true;
    try {
      const cacheKey = `${CACHE_KEY_PREFIX_LIMITED}${token.mint}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const now = Date.now();
        if (parsed.timestamp && (now - parsed.timestamp) < CACHE_EXPIRY_MS && parsed.tokens) {
          const hasVolume = parsed.tokens.some((devToken: any) => {
            const volume = parseFloat(devToken.volume24 || '0');
            return !isNaN(volume) && volume > 0;
          });
          // Collapse if there are tokens with volume, or if there are no tokens at all
          return hasVolume || parsed.tokens.length === 0;
        }
      }
    } catch (error) {
      // Ignore errors in initializer
    }
    // Default to collapsed when there are no cached tokens
    return true;
  });
  
  const getCacheKey = (mint: string, isAll: boolean) => {
    return isAll ? `${CACHE_KEY_PREFIX_ALL}${mint}` : `${CACHE_KEY_PREFIX_LIMITED}${mint}`;
  };

  // Load cached limited tokens from localStorage on mount
  const [cachedLimitedTokensFromStorage, setCachedLimitedTokensFromStorage] = useState<any[]>(() => {
    if (!token?.mint || typeof window === 'undefined') return [];
    
    try {
      const cacheKey = getCacheKey(token.mint, false);
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const now = Date.now();
        if (parsed.timestamp && (now - parsed.timestamp) < CACHE_EXPIRY_MS) {
          return parsed.tokens || [];
        } else {
          localStorage.removeItem(cacheKey);
        }
      }
    } catch (error) {
      console.error('[CodexDevTokens] Error loading limited cache:', error);
    }
    return [];
  });

  // Load cached all tokens from localStorage on mount
  const [cachedAllTokensFromStorage, setCachedAllTokensFromStorage] = useState<any[]>(() => {
    if (!token?.mint || typeof window === 'undefined') return [];
    
    try {
      const cacheKey = getCacheKey(token.mint, true);
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const now = Date.now();
        if (parsed.timestamp && (now - parsed.timestamp) < CACHE_EXPIRY_MS) {
          return parsed.tokens || [];
        } else {
          localStorage.removeItem(cacheKey);
        }
      }
    } catch (error) {
      console.error('[CodexDevTokens] Error loading all cache:', error);
    }
    return [];
  });

  // Reload cache when mint changes
  useEffect(() => {
    if (!token?.mint || typeof window === 'undefined') {
      setCachedLimitedTokensFromStorage([]);
      setCachedAllTokensFromStorage([]);
      return;
    }
    
    try {
      // Reload limited tokens cache
      const limitedCacheKey = getCacheKey(token.mint, false);
      const limitedCached = localStorage.getItem(limitedCacheKey);
      if (limitedCached) {
        const parsed = JSON.parse(limitedCached);
        const now = Date.now();
        if (parsed.timestamp && (now - parsed.timestamp) < CACHE_EXPIRY_MS) {
          setCachedLimitedTokensFromStorage(parsed.tokens || []);
        } else {
          localStorage.removeItem(limitedCacheKey);
          setCachedLimitedTokensFromStorage([]);
        }
      } else {
        setCachedLimitedTokensFromStorage([]);
      }

      // Reload all tokens cache
      const allCacheKey = getCacheKey(token.mint, true);
      const allCached = localStorage.getItem(allCacheKey);
      if (allCached) {
        const parsed = JSON.parse(allCached);
        const now = Date.now();
        if (parsed.timestamp && (now - parsed.timestamp) < CACHE_EXPIRY_MS) {
          setCachedAllTokensFromStorage(parsed.tokens || []);
        } else {
          localStorage.removeItem(allCacheKey);
          setCachedAllTokensFromStorage([]);
        }
      } else {
        setCachedAllTokensFromStorage([]);
      }
    } catch (error) {
      console.error('[CodexDevTokens] Error reloading cache:', error);
      setCachedLimitedTokensFromStorage([]);
      setCachedAllTokensFromStorage([]);
    }
  }, [token?.mint]);

  // Save tokens to localStorage cache
  const saveToCache = useCallback((tokens: any[], mint: string, isAll: boolean) => {
    if (!mint || typeof window === 'undefined' || tokens.length === 0) return;
    
    try {
      const cacheKey = getCacheKey(mint, isAll);
      const cacheData = {
        tokens,
        timestamp: Date.now(),
        mint,
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (error) {
      console.error('[CodexDevTokens] Error saving to cache:', error);
      // If storage is full, try to clear old entries
      try {
        const keys = Object.keys(localStorage);
        const oldCacheKeys = keys.filter(k => 
          k.startsWith(CACHE_KEY_PREFIX_LIMITED) || k.startsWith(CACHE_KEY_PREFIX_ALL)
        );
        if (oldCacheKeys.length > 10) {
          const sorted = oldCacheKeys.map(key => {
            try {
              const item = localStorage.getItem(key);
              return {
                key,
                timestamp: item ? (JSON.parse(item).timestamp || 0) : 0,
              };
            } catch {
              return { key, timestamp: 0 };
            }
          }).sort((a, b) => a.timestamp - b.timestamp);
          sorted.slice(0, 3).forEach(({ key }) => localStorage.removeItem(key));
        }
      } catch (clearError) {
        console.error('[CodexDevTokens] Error clearing old cache:', clearError);
      }
    }
  }, []);

  const shouldShowSkeleton = !token || (!token.name && !token.symbol);

  // Solana: WebSocket hook for real-time dev tokens (primary source when available)
  const { devTokens: wsDevTokens, loading: wsLoading } = useSolanaTokenWebSocket({
    mintAddress: token?.mint,
    enabled: chain === 'sol' && !!token?.mint,
  });

  // Monad: Dev wallet data hook (shows dev wallet activity for current token)
  const { devTokenData: monadDevData, isLoading: monadLoading, error: monadError } = useMonadDevTokens(
    token?.mint,
    { enabled: chain === 'monad' && !!token?.mint }
  );

  // Map WebSocket dev tokens to display format (Solana only)
  const mappedWsDevTokens = useMemo(() => {
    if (chain !== 'sol' || !wsDevTokens || wsDevTokens.length === 0) return [];
    return wsDevTokens.map(mapWebSocketDevTokenToDisplay);
  }, [chain, wsDevTokens]);

  // Fetch all tokens for pie chart calculations (REST API fallback - Solana only)
  const { tokens: allTokens, isLoading: isLoadingAll } = useCodexDevTokens(
    chain === 'sol' ? token?.mint : undefined,
    { fetchAll: true }
  );

  // Fetch limited tokens for table display (REST API fallback - Solana only)
  const { tokens, isLoading, error } = useCodexDevTokens(
    chain === 'sol' ? token?.mint : undefined,
    { limit: 10 }
  );

  // Use WebSocket data as primary, then REST API, then cache as fallback
  // Priority: WebSocket > REST API > LocalStorage cache
  const displayTokens = useMemo(() => {
    // WebSocket data takes priority when available
    if (mappedWsDevTokens.length > 0) {
      console.log('[CodexDevTokens] Using WebSocket dev tokens:', mappedWsDevTokens.length);
      return mappedWsDevTokens.slice(0, 10); // Limit to 10 for table
    }
    // Fall back to REST API data
    if (tokens.length > 0) {
      return tokens;
    }
    // Fall back to cached data
    return cachedLimitedTokensFromStorage;
  }, [mappedWsDevTokens, tokens, cachedLimitedTokensFromStorage]);

  const displayAllTokens = useMemo(() => {
    // WebSocket data takes priority when available
    if (mappedWsDevTokens.length > 0) {
      return mappedWsDevTokens;
    }
    // Fall back to REST API data
    if (allTokens.length > 0) {
      return allTokens;
    }
    // Fall back to cached data
    return cachedAllTokensFromStorage;
  }, [mappedWsDevTokens, allTokens, cachedAllTokensFromStorage]);

  // Save to cache when tokens update
  useEffect(() => {
    if (token?.mint && tokens.length > 0) {
      saveToCache(tokens, token.mint, false);
    }
  }, [tokens, token?.mint, saveToCache]);

  useEffect(() => {
    if (token?.mint && allTokens.length > 0) {
      saveToCache(allTokens, token.mint, true);
    }
  }, [allTokens, token?.mint, saveToCache]);

  // Filter displayTokens to exclude tokens with 0 or missing 1h volume
  const filteredDisplayTokens = useMemo(() => {
    return displayTokens.filter((devToken) => {
      const volume = parseFloat(devToken.volume24 || '0');
      return !isNaN(volume) && volume > 0;
    });
  }, [displayTokens]);

  // Keep right panel collapsed when filteredDisplayTokens has items (volume > 0)
  // Also collapse when there are no tokens to avoid showing empty panel
  useEffect(() => {
    // Always collapse: when there are filtered tokens (original requirement) or when there are no tokens (hide empty panel)
    setIsRightPanelCollapsed(true);
  }, [filteredDisplayTokens]);

  // Only show loading if we don't have any tokens at all (not even cached ones)
  // Consider both WebSocket and REST API loading states
  const showLoading = (wsLoading || isLoading) && displayTokens.length === 0 && cachedLimitedTokensFromStorage.length === 0;
  const showLoadingAll = (wsLoading || isLoadingAll) && displayAllTokens.length === 0 && cachedAllTokensFromStorage.length === 0;

  // Calculate migrated vs non-migrated counts from all tokens (use displayAllTokens which includes cache)
  const { migrated, nonMigrated, total } = useMemo(() => {
    if (!displayAllTokens || displayAllTokens.length === 0) {
      return { migrated: 0, nonMigrated: 0, total: 0 };
    }

    let migratedCount = 0;
    let nonMigratedCount = 0;

    displayAllTokens.forEach((devToken) => {
      // Check if token has migrated_pool_address to determine migration status
      if (devToken.token.migrated_pool_address) {
        migratedCount++;
      } else {
        nonMigratedCount++;
      }
    });

    return { migrated: migratedCount, nonMigrated: nonMigratedCount, total: migratedCount + nonMigratedCount };
  }, [displayAllTokens]);

  // Notify parent of filtered tokens count changes (only tokens with volume > 0)
  useEffect(() => {
    if (onTotalCountChange) {
      onTotalCountChange(filteredDisplayTokens.length);
    }
  }, [filteredDisplayTokens.length, onTotalCountChange]);

  // Calculate highlights (use displayAllTokens which includes cache)
  const { topMCAP, lastTokenLaunched } = useMemo(() => {
    if (!displayAllTokens || displayAllTokens.length === 0) {
      return { topMCAP: null, lastTokenLaunched: null };
    }

    // Find token with highest market cap
    let topToken = displayAllTokens[0];
    let maxMCAP = parseFloat(displayAllTokens[0].marketCap || '0');
    displayAllTokens.forEach((devToken) => {
      const mcap = parseFloat(devToken.marketCap || '0');
      if (mcap > maxMCAP) {
        maxMCAP = mcap;
        topToken = devToken;
      }
    });

    // Find most recently created token
    let lastToken = displayAllTokens[0];
    let latestTime = displayAllTokens[0].token.createdAt;
    displayAllTokens.forEach((devToken) => {
      if (devToken.token.createdAt > latestTime) {
        latestTime = devToken.token.createdAt;
        lastToken = devToken;
      }
    });

    const topMCAPValue = formatMarketCap(topToken.marketCap);
    const lastTokenAge = getAge(lastToken.token.createdAt);

    return {
      topMCAP: topToken.token.symbol ? `${topToken.token.symbol} (${topMCAPValue})` : null,
      lastTokenLaunched: lastTokenAge ? `${lastTokenAge} ago` : null,
    };
  }, [displayAllTokens]);

  // Only show skeleton if we have absolutely no token data (not even optimistic)
  if (shouldShowSkeleton) {
    return (
      <div className="flex-1 min-h-0 p-4">
        <div className="animate-pulse">
          <div className="h-6 w-32 bg-neutral-700 rounded mb-4" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-neutral-700 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Monad: Show dev wallet data instead of dev tokens list
  if (chain === 'monad') {
    return (
      <div className="w-full h-full flex flex-col p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Dev Wallet Analysis</h3>

        {monadError && (
          <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg mb-4">
            <p className="text-red-400 text-sm">{monadError}</p>
          </div>
        )}

        {monadLoading ? (
          <div className="text-center py-6 text-neutral-500">
            Loading dev wallet data...
          </div>
        ) : monadDevData ? (
          <div className="grid grid-cols-2 gap-4">
            {/* Dev Wallet Address */}
            <div className="p-3 rounded-lg" style={{ backgroundColor: AX.surface2, border: `1px solid ${AX.border}` }}>
              <div className="text-xs" style={{ color: AX.muted }}>Dev Wallet</div>
              <a
                href={`https://testnet.monadexplorer.com/address/${monadDevData.dev_wallet}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-mono text-white hover:text-emerald-400 hover:underline transition-colors"
              >
                {monadDevData.dev_wallet.slice(0, 8)}...{monadDevData.dev_wallet.slice(-6)}
              </a>
            </div>

            {/* Dev Holdings */}
            <div className="p-3 rounded-lg" style={{ backgroundColor: AX.surface2, border: `1px solid ${AX.border}` }}>
              <div className="text-xs" style={{ color: AX.muted }}>Dev Holdings</div>
              <div className="text-sm font-semibold text-white">{monadDevData.dev_hold_percent.toFixed(2)}%</div>
            </div>

            {/* Buy Activity */}
            <div className="p-3 rounded-lg" style={{ backgroundColor: AX.surface2, border: `1px solid ${AX.border}` }}>
              <div className="text-xs" style={{ color: AX.muted }}>Buy Activity</div>
              <div className="text-sm font-semibold text-emerald-400">{monadDevData.buy_count} buys</div>
              <div className="text-xs" style={{ color: AX.muted }}>${monadDevData.buy_volume_usd.toFixed(2)}</div>
            </div>

            {/* Sell Activity */}
            <div className="p-3 rounded-lg" style={{ backgroundColor: AX.surface2, border: `1px solid ${AX.border}` }}>
              <div className="text-xs" style={{ color: AX.muted }}>Sell Activity</div>
              <div className="text-sm font-semibold text-red-400">{monadDevData.sell_count} sells</div>
              <div className="text-xs" style={{ color: AX.muted }}>${monadDevData.sell_volume_usd.toFixed(2)}</div>
            </div>

            {/* MON Balance */}
            <div className="p-3 rounded-lg" style={{ backgroundColor: AX.surface2, border: `1px solid ${AX.border}` }}>
              <div className="text-xs" style={{ color: AX.muted }}>MON Balance</div>
              <div className="text-sm font-semibold text-white">{monadDevData.mon_balance.toFixed(4)} MON</div>
              <div className="text-xs" style={{ color: AX.muted }}>${monadDevData.mon_balance_usd.toFixed(2)}</div>
            </div>

            {/* Token Balance */}
            <div className="p-3 rounded-lg" style={{ backgroundColor: AX.surface2, border: `1px solid ${AX.border}` }}>
              <div className="text-xs" style={{ color: AX.muted }}>Token Balance</div>
              <div className="text-sm font-semibold text-white">{formatSmartNumber(monadDevData.token_balance)}</div>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-neutral-500">
            No dev wallet data available for this token.
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-row"
      style={{ overflow: "hidden" }}
    >
      {error && (
        <div className="absolute top-0 right-0 left-0 z-20 rounded-lg border border-red-500/30 bg-red-900/20 p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Open Button - Absolutely positioned on right side when collapsed */}
      {isRightPanelCollapsed && filteredDisplayTokens.length > 0 && (
        <button
          onClick={() => setIsRightPanelCollapsed(false)}
          className="w-5 h-5 hidden lg:flex items-center justify-center absolute right-0 top-6.5 z-30 rounded p-1 transition-opacity hover:opacity-80 cursor-pointer"
          style={{
            backgroundColor: `${AX.surface2}`,
            border: `1px solid ${AX.border}`,
            color: AX.text,
          }}
          title="Open panel"
        >
          <FaChevronLeft size={12} />
        </button>
      )}

      {/* Left side: Table */}
      <div
        className={`min-h-0 flex-shrink-0 overflow-y-auto transition-all duration-300`}
        style={{
          width: isRightPanelCollapsed ? "100%" : "50%",
          minWidth: 0,
          paddingBottom: "4.5rem",
        }}
      >
        <table className="w-full !font-geist">
          <thead
            className="sticky top-0 z-10 !text-xs"
            style={{ backgroundColor: "#101114" }}
          >
            <tr style={{ borderBottom: "1px solid #27282e" }} className='!text-xs'>
              <th
                className="px-4 py-1.5 text-left text-xs font-normal whitespace-nowrap text-[#757e80]"
                style={{ color: "#9ca3af" }}
              >
                Token ↓
              </th>
              <th
                className="px-2 py-1.5 text-left text-xs font-normal whitespace-nowrap text-[#757e80]"
                style={{ color: "#9ca3af" }}
              >
                Migrated
              </th>
              <th
                className="px-2 py-1.5 text-left text-xs font-normal whitespace-nowrap text-[#757e80]"
                style={{ color: "#9ca3af" }}
              >
                Market Cap
              </th>
              <th
                className="px-2 py-1.5 text-left text-xs font-normal whitespace-nowrap text-[#757e80]"
                style={{ color: "#9ca3af" }}
              >
                Liquidity
              </th>
              <th
                className="px-2 py-1.5 text-left text-xs font-normal whitespace-nowrap text-[#757e80]"
                style={{ color: "#9ca3af" }}
              >
                1h Volume
              </th>
            </tr>
          </thead>
          <tbody className='border-r border border-[#27282e] !text-[13px]'>
            {showLoading ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-neutral-500">
                  Loading dev tokens...
                </td>
              </tr>
            ) : !filteredDisplayTokens || filteredDisplayTokens.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-neutral-500">
                  No dev tokens found.
                </td>
              </tr>
            ) : (
              filteredDisplayTokens.map((devToken, idx) => {
                const age = getAge(devToken.token.createdAt);
                const marketCap = formatMarketCap(devToken.marketCap);
                const liquidity = formatLiquidity(devToken.liquidity);
                const volume = formatVolume(devToken.volume24);
                const isMigrated = !!devToken.token.migrated_pool_address;

                return (
                  <tr
                    key={devToken.token.address}
                    className="transition-colors"
                    style={{
                      backgroundColor: idx % 2 === 0 ? "#111214" : "#15161a",
                    }}
                  >
                    <td className="px-4 py-1">
                      <div className="flex flex-col">
                        <div
                          className="text-[13px] font-normal text-[#f0f5f5]"
                        >
                          {devToken.token.symbol ||
                            devToken.token.name ||
                            `${devToken.token.address.slice(0, 4)}...${devToken.token.address.slice(-4)}`}
                        </div>
                        <div
                          className="text-xs font-normal text-[#c4cccc]"
                        >
                          {age} ago
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center">
                        {isMigrated ? (
                          <span className="text-[11px] text-green-400 font-normal">✓</span>
                        ) : (
                          <span className="text-[11px] text-[#f26682] font-normal">
                            <IoIosCloseCircleOutline size={14} />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div
                        className="text-[13px] font-normal text-[#c4cccc]"
                      >
                        {marketCap}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div
                        className="text-[13px] font-normal text-[#c4cccc]"
                      >
                        {liquidity}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div
                        className="text-[13px] font-normal text-[#c4cccc]"
                      >
                        {volume}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Right side: Stats Panels and Pie Chart */}
      <div
        className={`relative min-h-0 flex-shrink-0 overflow-hidden transition-all duration-300`}
        style={{
          width: isRightPanelCollapsed ? "40px" : "50%",
          // borderLeft: isRightPanelCollapsed ? "none" : `1px solid ${AX.border}`,
        }}
      >
        <button
          onClick={() => setIsRightPanelCollapsed(true)}
          className="absolute top-6.5 flex h-5 w-5 items-center justify-center rounded p-1 transition-opacity hover:opacity-80 cursor-pointer"
          style={{
            backgroundColor: `${AX.surface2}`,
            border: `1px solid ${AX.border}`,
            color: AX.text,
          }}
          title="Hide panel"
        >
          <FaChevronRight size={12} />
        </button>
        {/* Panel Content */}
        {!isRightPanelCollapsed && (
          <div
            className="h-full min-h-0 overflow-y-auto mt-6.5 p-2 pb-[4.5rem] border-t border-[#27282e]"
          >
            {/* Header with Hide Button - Centered */}
            <div className="mb-3 flex items-center justify-center gap-2">
              <span
                className="text-sm"
                style={{ color: AX.muted, fontFamily: "system-ui, sans-serif" }}
              >
                Dev Tokens
              </span>
            </div>

            <div className="flex flex-row items-start gap-3">
              {/* Left: Stats Panels - Fixed narrow width */}
              <div
                className="w-60 min-w-60 flex-shrink-0 space-y-8 ml-3"
              >
                {/* Token Stats Box */}
                <div className="">
                  <div className="space-y-2">
                    <div
                      className="text-sm"
                      style={{
                        color: AX.muted,
                        fontFamily: "system-ui, sans-serif",
                      }}
                    >
                      Token Stats
                    </div>
                    <div className="space-y-3">

                      {/* Total Pairs */}
                      <div className="space-y-1">
                        <span
                          className="text-xs"
                          style={{
                            color: AX.muted,
                            fontFamily: "system-ui, sans-serif",
                          }}
                        >
                          Total Pairs: {" "}
                        </span>
                        <span
                          className="text-xs"
                          style={{ color: AX.text }}
                        >
                          {total}
                        </span>
                      </div>

                      {/* Migrated */}
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <div
                          className="h-3 w-3 flex-shrink-0 rounded"
                          style={{ backgroundColor: AX.migrated }}
                        ></div>
                        <span
                          className="text-xs"
                          style={{
                            color: AX.muted,
                            fontFamily: "system-ui, sans-serif",
                          }}
                        >
                          Migrated:{" "}
                          <span style={{ color: AX.text }}>{migrated}</span>
                        </span>
                      </div>

                      {/* Non Migrated */}
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <div
                          className="h-3 w-3 flex-shrink-0 rounded"
                          style={{ backgroundColor: AX.nonMigrated }}
                        ></div>
                        <span
                          className="text-xs"
                          style={{
                            color: AX.muted,
                            fontFamily: "system-ui, sans-serif",
                          }}
                        >
                          Non Migrated:{" "}
                          <span style={{ color: AX.text }}>{nonMigrated}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Highlights Box */}
                <div className="">
                  <div className="space-y-2">
                    <div
                      className="text-sm"
                      style={{
                        color: AX.muted,
                        fontFamily: "system-ui, sans-serif",
                      }}
                    >
                      Highlights
                    </div>
                    <div className="space-y-1.5">
                      {topMCAP && (
                        <div style={{ whiteSpace: "nowrap" }}>
                          <span
                            className="text-xs"
                            style={{
                              color: AX.muted,
                              fontFamily: "system-ui, sans-serif",
                            }}
                          >
                            ATH MC:{" "}
                            <span style={{ color: AX.text }}>{topMCAP}</span>
                          </span>
                        </div>
                      )}
                      {lastTokenLaunched && (
                        <div style={{ whiteSpace: "nowrap" }}>
                          <span
                            className="text-xs"
                            style={{
                              color: AX.muted,
                              fontFamily: "system-ui, sans-serif",
                            }}
                          >
                            Last Token Launched:{" "}
                            <span style={{ color: AX.migrated }}>
                              {lastTokenLaunched}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Pie Chart */}
              <div
                className="min-w-0 flex flex-1 items-center justify-center"
              >
                {showLoadingAll ? (
                  <div
                    className="flex items-center justify-center"
                    style={{ width: 256, height: 256 }}
                  >
                    <div className="text-sm" style={{ color: AX.muted }}>
                      Loading...
                    </div>
                  </div>
                ) : total > 0 ? (
                  <DevTokensPieChart
                    migrated={migrated}
                    nonMigrated={nonMigrated}
                  />
                ) : (
                  <div
                    className="flex items-center justify-center"
                    style={{ width: 256, height: 256 }}
                  >
                    <div className="text-sm" style={{ color: AX.muted }}>
                      No data available
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CodexDevTokens;
