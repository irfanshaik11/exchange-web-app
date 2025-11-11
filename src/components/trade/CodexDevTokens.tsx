import React, { useMemo } from 'react';
import { formatSmartNumber } from '~/utils/db';
import useCodexDevTokens from '../../hooks/useCodexDevTokens';
import type { Token } from '~/utils/db';
import DevTokensPieChart from './DevTokensPieChart';

interface CodexDevTokensProps {
  token: Token | null;
}

function getAge(timestamp: number) {
  const now = Date.now() / 1000;
  const diffSeconds = now - timestamp;
  const diffMins = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffSeconds / 3600);
  const diffDays = Math.floor(diffSeconds / 86400);
  
  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  return `${diffMins}m`;
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

const AX = {
  bg: "#101114",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#E6E7EA",
  muted: "#9CA3AF",
  migrated: "#70E0B0", // Green for migrated
  nonMigrated: "#EC4899", // Pink/magenta for non-migrated
};

const CodexDevTokens: React.FC<CodexDevTokensProps> = ({ token }) => {
  // Client-side localStorage cache for dev tokens (persists across page reloads)
  const CACHE_KEY_PREFIX_LIMITED = 'codex_dev_tokens_limited_cache_';
  const CACHE_KEY_PREFIX_ALL = 'codex_dev_tokens_all_cache_';
  const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes cache expiry
  
  const getCacheKey = (mint: string, isAll: boolean) => {
    return isAll ? `${CACHE_KEY_PREFIX_ALL}${mint}` : `${CACHE_KEY_PREFIX_LIMITED}${mint}`;
  };

  // Load cached limited tokens from localStorage on mount
  const [cachedLimitedTokensFromStorage, setCachedLimitedTokensFromStorage] = React.useState<any[]>(() => {
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
  const [cachedAllTokensFromStorage, setCachedAllTokensFromStorage] = React.useState<any[]>(() => {
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
  React.useEffect(() => {
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
  const saveToCache = React.useCallback((tokens: any[], mint: string, isAll: boolean) => {
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

  // Only show skeleton if we have absolutely no token data (not even optimistic)
  if (!token || (!token.name && !token.symbol)) {
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

  // Fetch all tokens for pie chart calculations
  const { tokens: allTokens, isLoading: isLoadingAll } = useCodexDevTokens(token.mint || '', {
    fetchAll: true
  });

  // Fetch limited tokens for table display
  const { tokens, isLoading, error } = useCodexDevTokens(token.mint || '', {
    limit: 10
  });

  // Use cached tokens if available, otherwise use fetched tokens
  const displayTokens = React.useMemo(() => {
    if (tokens.length > 0) {
      return tokens;
    }
    return cachedLimitedTokensFromStorage;
  }, [tokens, cachedLimitedTokensFromStorage]);

  const displayAllTokens = React.useMemo(() => {
    if (allTokens.length > 0) {
      return allTokens;
    }
    return cachedAllTokensFromStorage;
  }, [allTokens, cachedAllTokensFromStorage]);

  // Save to cache when tokens update
  React.useEffect(() => {
    if (token?.mint && tokens.length > 0) {
      saveToCache(tokens, token.mint, false);
    }
  }, [tokens, token?.mint, saveToCache]);

  React.useEffect(() => {
    if (token?.mint && allTokens.length > 0) {
      saveToCache(allTokens, token.mint, true);
    }
  }, [allTokens, token?.mint, saveToCache]);

  // Only show loading if we don't have any tokens at all (not even cached ones)
  const showLoading = isLoading && displayTokens.length === 0 && cachedLimitedTokensFromStorage.length === 0;
  const showLoadingAll = isLoadingAll && displayAllTokens.length === 0 && cachedAllTokensFromStorage.length === 0;

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

  const matteBlack = '#000000';

  return (
    <div className="w-full h-full flex flex-row min-h-0" style={{ backgroundColor: matteBlack, overflow: 'hidden' }}>
      {error && (
        <div className="absolute top-0 left-0 right-0 p-3 bg-red-900/20 border border-red-500/30 rounded-lg z-20">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Left side: Table */}
      <div className="w-1/2 flex-shrink-0 overflow-y-auto" style={{ minWidth: 0, borderRight: `1px solid ${AX.border}`, backgroundColor: matteBlack, maxHeight: '100%', paddingBottom: '1rem' }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10" style={{ backgroundColor: matteBlack }}>
            <tr className="text-neutral-400 border-b border-neutral-800">
              <th className="px-2 py-2 text-left">Token ↓</th>
              <th className="px-2 py-2 text-left">Migrated</th>
              <th className="px-2 py-2 text-left">Market Cap</th>
              <th className="px-2 py-2 text-left">Liquidity</th>
              <th className="px-2 py-2 text-left">1h Volume</th>
            </tr>
          </thead>
          <tbody style={{ backgroundColor: matteBlack }}>
            {showLoading ? (
              <tr>
                <td colSpan={5} className="text-center py-6 text-neutral-500">
                  Loading dev tokens...
                </td>
              </tr>
            ) : !displayTokens || displayTokens.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-6 text-neutral-500">
                  No dev tokens found.
                </td>
              </tr>
            ) : (
              displayTokens.map((devToken, idx) => {
                const age = getAge(devToken.token.createdAt);
                const marketCap = formatMarketCap(devToken.marketCap);
                const liquidity = formatLiquidity(devToken.liquidity);
                const volume = formatVolume(devToken.volume24);
                const isMigrated = !!devToken.token.migrated_pool_address;
                
                return (
                  <tr key={devToken.token.address} className="border-b border-neutral-800" style={{ backgroundColor: matteBlack }}>
                    <td className="px-2 py-2">
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
                          <span className="text-white font-bold text-xs">⚔️</span>
                        </div>
                        <div>
                          <div className="text-white font-semibold">{devToken.token.symbol}</div>
                          <div className="text-neutral-500 text-xs">{age} ago</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center">
                        {isMigrated ? (
                          <span className="text-green-400">✓</span>
                        ) : (
                          <span className="text-pink-400">✗</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="text-white font-semibold">{marketCap}</div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="text-white font-semibold">{liquidity}</div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="text-white font-semibold">{volume}</div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Right side: Stats Panels and Pie Chart */}
      <div className="w-1/2 flex-shrink-0 p-2 overflow-y-auto" style={{ backgroundColor: matteBlack, maxHeight: '100%', paddingBottom: '2rem' }}>
        <div className="flex flex-row gap-3 items-start">
          {/* Left: Stats Panels - Fixed narrow width */}
          <div className="flex-shrink-0 space-y-3" style={{ width: '240px', minWidth: '240px' }}>
            {/* Token Stats Box */}
            <div className="p-3 rounded-lg" style={{ backgroundColor: AX.surface2, border: `1px solid ${AX.border}` }}>
              <div className="space-y-2">
                <div className="text-sm" style={{ color: AX.muted, fontFamily: 'system-ui, sans-serif' }}>
                  Token Stats
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2" style={{ whiteSpace: 'nowrap' }}>
                    <div className="w-3 h-3 rounded flex-shrink-0" style={{ backgroundColor: AX.migrated }}></div>
                    <span className="text-xs" style={{ color: AX.muted, fontFamily: 'system-ui, sans-serif' }}>
                      Migrated: <span style={{ color: AX.muted }}>{migrated}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2" style={{ whiteSpace: 'nowrap' }}>
                    <div className="w-3 h-3 rounded flex-shrink-0" style={{ backgroundColor: AX.nonMigrated }}></div>
                    <span className="text-xs" style={{ color: AX.muted, fontFamily: 'system-ui, sans-serif' }}>
                      Non-migrated: <span style={{ color: AX.muted }}>{nonMigrated}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Highlights Box */}
            <div className="p-3 rounded-lg" style={{ backgroundColor: AX.surface2, border: `1px solid ${AX.border}` }}>
              <div className="space-y-2">
                <div className="text-sm" style={{ color: AX.muted, fontFamily: 'system-ui, sans-serif' }}>
                  Highlights
                </div>
                <div className="space-y-1.5">
                  {topMCAP && (
                    <div style={{ whiteSpace: 'nowrap' }}>
                      <span className="text-xs" style={{ color: AX.muted, fontFamily: 'system-ui, sans-serif' }}>
                        Top MCAP: <span style={{ color: AX.muted }}>{topMCAP}</span>
                      </span>
                    </div>
                  )}
                  {lastTokenLaunched && (
                    <div style={{ whiteSpace: 'nowrap' }}>
                      <span className="text-xs" style={{ color: AX.muted, fontFamily: 'system-ui, sans-serif' }}>
                        Last Token Launched: <span style={{ color: AX.muted }}>{lastTokenLaunched}</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Pie Chart */}
          <div className="flex-1 flex justify-center items-center" style={{ backgroundColor: matteBlack, minWidth: 0 }}>
            {showLoadingAll ? (
              <div className="flex items-center justify-center" style={{ width: 256, height: 256 }}>
                <div className="text-sm" style={{ color: AX.muted }}>Loading...</div>
              </div>
            ) : total > 0 ? (
              <DevTokensPieChart migrated={migrated} nonMigrated={nonMigrated} />
            ) : (
              <div className="flex items-center justify-center" style={{ width: 256, height: 256 }}>
                <div className="text-sm" style={{ color: AX.muted }}>No data available</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CodexDevTokens;
