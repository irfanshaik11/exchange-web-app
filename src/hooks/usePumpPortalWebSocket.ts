import { useEffect, useState, useCallback, useRef } from 'react';

const isDev = process.env.NODE_ENV !== 'production';

interface PumpPortalToken {
  signature: string;
  mint: string;
  traderPublicKey?: string;
  txType: string;
  initialBuy?: number;
  solAmount?: number;
  bondingCurveKey?: string;
  vTokensInBondingCurve?: number;
  vSolInBondingCurve?: number;
  marketCapSol?: number;
  name: string;
  symbol: string;
  uri?: string;
  pool: string;
  // Additional fields we might derive
  price_usd?: number;
  market_cap_usd?: number;
  created_at?: string;
  timestamp?: number;
  image?: string; // Image URL from metadata
  pair_address?: string; // Derived from bondingCurveKey for pre-migration tokens
}

interface PumpPortalMessage {
  message?: string;
  signature?: string;
  mint?: string;
  [key: string]: any;
}

interface UsePumpPortalWebSocketOptions {
  enabled?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onTokenCreated?: (token: PumpPortalToken) => void;
  onTokenMigrated?: (token: PumpPortalToken) => void;
}

interface UsePumpPortalWebSocketReturn {
  tokens: PumpPortalToken[];
  connected: boolean;
  error: string | null;
  clearTokens: () => void;
}

/**
 * WebSocket hook for PumpPortal real-time token updates
 * Connects to wss://pumpportal.fun/api/data
 */
export function usePumpPortalWebSocket(
  options: UsePumpPortalWebSocketOptions = {}
): UsePumpPortalWebSocketReturn {
  const {
    enabled = true,
    reconnectInterval = 2000,
    maxReconnectAttempts = 10,
    onTokenCreated,
    onTokenMigrated,
  } = options;

  const url = 'wss://pumpportal.fun/api/data';

  const [tokens, setTokens] = useState<PumpPortalToken[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache key for sessionStorage
  const CACHE_KEY = 'pumpportal_tokens';
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Load cached tokens on mount
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const { tokens: cachedTokens, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        if (age < CACHE_TTL && Array.isArray(cachedTokens) && cachedTokens.length > 0) {
          setTokens(cachedTokens);
        }
      }
    } catch (err) {
      console.error('[usePumpPortalWebSocket] Error loading cache:', err);
    }
  }, []);

  // Save tokens to cache when they change
  useEffect(() => {
    if (tokens.length > 0) {
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({
          tokens,
          timestamp: Date.now(),
        }));
      } catch (err) {
        console.error('[usePumpPortalWebSocket] Error saving cache:', err);
      }
    }
  }, [tokens]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const mountedRef = useRef(true);
  const tokensRef = useRef<PumpPortalToken[]>([]);

  // Store callbacks in refs so they're always current
  const onTokenCreatedRef = useRef(onTokenCreated);
  const onTokenMigratedRef = useRef(onTokenMigrated);

  // Update refs when callbacks change
  useEffect(() => {
    onTokenCreatedRef.current = onTokenCreated;
    onTokenMigratedRef.current = onTokenMigrated;
  }, [onTokenCreated, onTokenMigrated]);

  // Keep tokensRef in sync with tokens
  useEffect(() => {
    tokensRef.current = tokens;
  }, [tokens]);

  const clearTokens = useCallback(() => {
    setTokens([]);
  }, []);

  // Function to fetch token image from metadata URI
  const fetchTokenImage = useCallback(async (uri: string): Promise<string | undefined> => {
    try {
      const proxied = uri.startsWith('/api/metadata') ? uri : `/api/metadata?url=${encodeURIComponent(uri)}`;
      let response = await fetch(proxied);
      if (!response.ok && proxied !== uri) {
        response = await fetch(uri);
      }
      if (response.ok) {
        const metadata = await response.json();
        const imageUrl = metadata?.image;
        if (imageUrl) {
          return imageUrl;
        }
      }
    } catch (err) {
      console.error('[usePumpPortalWebSocket] Error fetching metadata:', err);
    }
    return undefined;
  }, []);

  const connect = useCallback(() => {
    // Don't connect if feature is disabled
    if (!enabled) {
      isDev && console.log('[usePumpPortalWebSocket] WebSocket disabled');
      return;
    }

    // Don't connect if already connected or if we've exceeded max attempts
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      isDev && console.log('[usePumpPortalWebSocket] Max reconnect attempts reached');
      setError('Max reconnection attempts reached');
      return;
    }

    try {
      isDev && console.log('[usePumpPortalWebSocket] Connecting to:', url);
      const ws = new WebSocket(url);

      ws.onopen = () => {
        if (!mountedRef.current) return;
        isDev && console.log('[usePumpPortalWebSocket] Connected to PumpPortal');
        setConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;

        // Subscribe to new token events
        ws.send(JSON.stringify({
          method: 'subscribeNewToken'
        }));

        // Subscribe to migration events
        ws.send(JSON.stringify({
          method: 'subscribeMigration'
        }));

        isDev && console.log('[usePumpPortalWebSocket] Subscribed to NewToken and Migration events');
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;

        try {
          const data = event.data;
          if (!data || typeof data !== 'string') return;

          const msg: PumpPortalMessage = JSON.parse(data);

          // Check if it's a confirmation message
          if (msg.message) {
            return;
          }

          // Process token events
          if (msg.mint && msg.signature) {
            const tokenEvent: PumpPortalToken = {
              signature: msg.signature,
              mint: msg.mint,
              txType: msg.txType || 'create',
              name: msg.name || '',
              symbol: msg.symbol || '',
              uri: msg.uri,
              pool: msg.pool || 'pump',
              traderPublicKey: msg.traderPublicKey,
              initialBuy: msg.initialBuy,
              solAmount: msg.solAmount,
              bondingCurveKey: msg.bondingCurveKey,
              vTokensInBondingCurve: msg.vTokensInBondingCurve,
              vSolInBondingCurve: msg.vSolInBondingCurve,
              marketCapSol: msg.marketCapSol,
              // Add derived fields
              price_usd: msg.marketCapSol ? msg.marketCapSol * 170 : undefined, // Rough SOL price
              market_cap_usd: msg.marketCapSol ? msg.marketCapSol * 170 : undefined,
              created_at: new Date().toISOString(),
              timestamp: Date.now(),
              // Use bondingCurveKey as pair_address for pre-migration tokens
              pair_address: msg.bondingCurveKey,
            };

            // Handle different event types
            if (msg.txType === 'create') {
              // Check for duplicates first
              const exists = tokensRef.current.some((t) => t.mint === tokenEvent.mint);
              if (exists) {
                return;
              }

              // Fetch image first, then add token with metadata
              if (tokenEvent.uri) {
                fetchTokenImage(tokenEvent.uri)
                  .then((imageUrl) => {
                    if (!mountedRef.current) return;
                    
                    // Only add token if we got a valid image URL
                    if (imageUrl) {
                      const tokenWithImage = { ...tokenEvent, image: imageUrl };
                      setTokens((prev) => {
                        // Check for duplicates again in case it was added
                        const exists = prev.some((t) => t.mint === tokenWithImage.mint);
                        if (exists) return prev;
                        return [tokenWithImage, ...prev].slice(0, 100);
                      });
                    } else {
                    }
                  })
                  .catch((err) => {
                    console.error('[usePumpPortalWebSocket] Image fetch error, skipping token:', err);
                    // Don't add token if image fetch fails
                  });
              } else {
                // Don't add token without URI
              }

              // Call callback if provided
              if (onTokenCreatedRef.current) {
                onTokenCreatedRef.current(tokenEvent);
              }
            } else if (msg.txType === 'migrate') {
              // Handle migration events
              // Call callback if provided
              if (onTokenMigratedRef.current) {
                onTokenMigratedRef.current(tokenEvent);
              }
            }
          }
        } catch (err) {
          console.error('[usePumpPortalWebSocket] Error parsing message:', err);
        }
      };

      ws.onerror = (error) => {
        if (!mountedRef.current) return;
        console.error('[usePumpPortalWebSocket] WebSocket error:', error);
        setError('WebSocket error occurred');
      };

      ws.onclose = (event) => {
        if (!mountedRef.current) return;
        isDev && console.log('[usePumpPortalWebSocket] WebSocket closed:', event.code, event.reason);
        setConnected(false);

        // Attempt to reconnect if we haven't exceeded max attempts
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1;
          isDev && console.log(
            `[usePumpPortalWebSocket] Attempting to reconnect (${reconnectAttemptsRef.current}/${maxReconnectAttempts})...`
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        } else {
          isDev && console.log('[usePumpPortalWebSocket] Max reconnection attempts reached');
          setError('Max reconnection attempts reached');
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[usePumpPortalWebSocket] Failed to create WebSocket:', err);
      setError('Failed to create WebSocket connection');
    }
  }, [enabled, reconnectInterval, maxReconnectAttempts, fetchTokenImage]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Connect when enabled changes
  useEffect(() => {
    if (enabled && mountedRef.current) {
      connect();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [enabled, connect]);

  return {
    tokens,
    connected,
    error,
    clearTokens,
  };
}
